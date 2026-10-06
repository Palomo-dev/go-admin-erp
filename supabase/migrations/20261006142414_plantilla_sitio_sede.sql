-- Aplicada el 2026-10-06 con apply_migration (plantilla_sitio_sede).
-- El sitio de una SEDE nace con la plantilla de su tipo de negocio (`branches.branch_type`) y se
-- le puede volver a aplicar («Aplicar plantilla de <tipo>»), en una sola transacción.
--
-- Estado verificado por MCP antes de escribir esto:
-- - `website_site_states` (único por organización + sede), `website_site_drafts` (un borrador por
--   sitio, `version` con compare-and-swap por el disparador fn_website_site_drafts_version) y
--   `website_site_draft_snapshots` (historial «Guardado automático», motivos 'autoguardado',
--   'descartado', 'antes_de_restaurar'; retiene 20 por sitio) existen.
-- - 0 sitios de sede hoy; `branches.branch_type` vale '', 'main' o NULL en todas las sucursales.
-- - `ensure_site_draft` crea un sitio pero no deja rastro de qué plantilla lo armó: sin esa marca
--   no se puede saber si el borrador tiene cambios del usuario al cambiar el tipo de la sede.
--
-- Qué hace (aditivo, sin DROP ni DELETE de datos):
-- 1. Tres columnas NULL-ables en `website_site_states`: `plantilla_tipo`, `plantilla_version_
--    borrador` (versión del borrador que dejó la plantilla: si sigue igual, no hay cambios del
--    usuario) y `plantilla_aplicada_at`.
-- 2. `fn_website_plantilla_sede(org, sede, tipo, documento, schema, modo, versión)`, SECURITY
--    DEFINER, idempotente. El documento lo arma el ERP con el MISMO juego de páginas que siembra
--    `create_default_pages` para una organización (src/lib/website/v2/plantillaSede.ts); aquí solo
--    se comprueba forma y versión, como en `ensure_site_draft`.
--    - Exige `website.sites.edit` (fn_website_exigir_permiso → pertenencia a la organización),
--      que la sucursal sea de la organización y que su `branch_type` siga siendo `tipo`.
--    - Serializa por sede (advisory lock de la transacción) y bloquea la fila del sitio.
--    - Sin sitio → lo crea con el documento en borrador versión 1 ('creado').
--    - modo 'auto' (alta de la sucursal o cambio de tipo): misma plantilla → 'sin_cambios';
--      borrador intacto → lo reemplaza ('reemplazado'); con cambios del usuario → no toca nada
--      ('pendiente_confirmacion').
--    - modo 'confirmado' («Aplicar plantilla»): compare-and-swap con la versión que vio la
--      persona (otra → P0409 conflicto_version); repetir la misma llamada → 'sin_cambios'.
--    - Al reemplazar, el borrador anterior se copia ANTES al historial (motivo
--      'antes_de_restaurar', el mismo que usa «Restaurar» del editor) y se puede restaurar.
--    - Nunca publica ni cambia la web: la sede se ve cuando se publica desde el editor.
-- 3. REVOKE de anon y public; EXECUTE solo para authenticated y service_role.
--
-- Orden: independiente. El ERP funciona antes de aplicarla (la sede nace con la plantilla por
-- `ensure_site_draft`, sin marca; «Aplicar plantilla» responde 503 `no_disponible`) y después.
-- El sitio público necesita el commit de goadmin-websites «una sede en borrador sigue mostrando
-- el principal» para que crear el borrador de una sede no cambie lo que ve el público.
--
-- Ensayo 2026-10-06 (execute_sql: este archivo + un bloque `do` como authenticated con
-- set_config('request.jwt.claims') y `set local role authenticated`, sobre la org 133 (un hotel)
-- y su sede 528 (branch_type 'restaurant', sin sitio propio: el caso real reportado), con el
-- documento que arma de verdad `documentoPlantillaSede`; termina en `raise exception`, así que
-- todo se deshizo; verificado después: no existen la función ni las columnas, la sede 528 sigue
-- sin sitio y con branch_type 'restaurant'). Resultado literal:
--   ENSAYO_OK crear=creado v1 | paginas=Inicio,Menú,Pedir Online,Reservar Mesa,Nosotros,
--   Contacto,Galería,Términos y condiciones,Política de privacidad,Carta QR | repetir=sin_cambios
--   | cambio_tipo_intacto=reemplazado v2 instantaneas=1 | con_cambios_usuario=
--   pendiente_confirmacion borrador_intacto=true v3 | confirmado_version_vieja=P0409 |
--   confirmado=reemplazado v4 instantaneas=2 restaurable=true | confirmado_repetido=sin_cambios v4
--   | tipo_no_coincide=22023 | sin_tipo_valido=22023 | ajeno=42501 | sede_de_otra_org=42501 |
--   anon=42501 permission denied for function fn_website_plantilla_sede | principal_intacto=true
--   | publica_nada=true
--
-- Sin backfill a propósito: el documento de la plantilla lo arma el ERP (una copia en SQL sería
-- lógica duplicada). Las sedes que ya existen sin sitio lo obtienen al elegirlas en el editor
-- («<Sede> aún no tiene su sitio · Crear con la plantilla de <tipo>») o al guardar la sucursal.

alter table public.website_site_states
  add column if not exists plantilla_tipo text,
  add column if not exists plantilla_version_borrador integer,
  add column if not exists plantilla_aplicada_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'website_site_states_plantilla_tipo_valido'
                   and conrelid = 'public.website_site_states'::regclass) then
    alter table public.website_site_states
      add constraint website_site_states_plantilla_tipo_valido
      check (plantilla_tipo is null
             or plantilla_tipo in ('restaurant', 'hotel', 'retail', 'gym', 'transport', 'parking', 'services'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'website_site_states_plantilla_version_positiva'
                   and conrelid = 'public.website_site_states'::regclass) then
    alter table public.website_site_states
      add constraint website_site_states_plantilla_version_positiva
      check (plantilla_version_borrador is null or plantilla_version_borrador >= 1);
  end if;
end $$;

comment on column public.website_site_states.plantilla_tipo is
  'Tipo de negocio (branch_type) cuya plantilla armó el borrador de este sitio de sede. NULL = nunca se aplicó una.';
comment on column public.website_site_states.plantilla_version_borrador is
  'Versión del borrador que dejó la plantilla. Si el borrador sigue en esa versión, no tiene cambios del usuario y un cambio de tipo lo puede reemplazar.';
comment on column public.website_site_states.plantilla_aplicada_at is
  'Cuándo se aplicó la plantilla por última vez.';

create or replace function public.fn_website_plantilla_sede(
  p_org integer,
  p_branch integer,
  p_tipo text,
  p_document jsonb,
  p_schema_version integer,
  p_modo text,
  p_version_esperada integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo_sede text;
  v_site uuid;
  v_publicada uuid;
  v_plantilla text;
  v_marca integer;
  v_version integer;
  v_doc jsonb;
  v_intacto boolean;
  v_instantanea uuid;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');

  if p_modo is null or p_modo not in ('auto', 'confirmado') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('restaurant', 'hotel', 'retail', 'gym', 'transport', 'parking', 'services') then
    raise exception 'tipo_sin_plantilla' using errcode = '22023';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or coalesce(p_schema_version, 0) < 1
     or (p_document->>'schemaVersion') is distinct from p_schema_version::text then
    raise exception 'documento_invalido' using errcode = 'P0422';
  end if;

  select b.branch_type into v_tipo_sede
  from public.branches b
  where b.id = p_branch and b.organization_id = p_org
  for share;
  if not found then
    raise exception 'sucursal_de_otra_organizacion' using errcode = '42501';
  end if;
  if v_tipo_sede is distinct from p_tipo then
    -- El tipo cambió entre que el ERP armó el documento y esta llamada: no se aplica uno viejo.
    raise exception 'tipo_no_coincide' using errcode = '22023',
      detail = jsonb_build_object('tipo_sede', v_tipo_sede, 'tipo_pedido', p_tipo)::text;
  end if;

  -- Una sola operación por sede a la vez (dos guardados seguidos de la sucursal).
  perform pg_advisory_xact_lock(hashtextextended('website_plantilla_sede:' || p_org || ':' || p_branch, 0));

  select s.id, s.published_revision_id, s.plantilla_tipo, s.plantilla_version_borrador
    into v_site, v_publicada, v_plantilla, v_marca
  from public.website_site_states s
  where s.organization_id = p_org and s.branch_id = p_branch
  for update;

  if not found then
    insert into public.website_site_states (organization_id, branch_id, plantilla_tipo, plantilla_version_borrador, plantilla_aplicada_at)
    values (p_org, p_branch, p_tipo, 1, now())
    returning id into v_site;
    insert into public.website_site_drafts (site_state_id, organization_id, schema_version, document, version)
    values (v_site, p_org, p_schema_version, p_document, 1);
    return jsonb_build_object('accion', 'creado', 'site_id', v_site, 'version', 1, 'tipo', p_tipo);
  end if;

  select d.version, d.document into v_version, v_doc
  from public.website_site_drafts d
  where d.site_state_id = v_site and d.organization_id = p_org
  for update;

  if not found then
    -- Sitio sin borrador (no debería existir): se le da el de la plantilla.
    insert into public.website_site_drafts (site_state_id, organization_id, schema_version, document, version)
    values (v_site, p_org, p_schema_version, p_document, 1);
    update public.website_site_states
       set plantilla_tipo = p_tipo, plantilla_version_borrador = 1, plantilla_aplicada_at = now(), updated_at = now()
     where id = v_site;
    return jsonb_build_object('accion', 'creado', 'site_id', v_site, 'version', 1, 'tipo', p_tipo);
  end if;

  -- Sin cambios del usuario: la versión es la que dejó la plantilla; en un sitio anterior a la
  -- marca, el borrador nunca se guardó ni se publicó (misma regla que `borradorIntacto` del ERP).
  v_intacto := (v_marca is not null and v_marca = v_version)
            or (v_marca is null and v_version = 1 and v_publicada is null);

  if p_modo = 'auto' then
    if v_plantilla is not distinct from p_tipo then
      return jsonb_build_object('accion', 'sin_cambios', 'site_id', v_site, 'version', v_version, 'tipo', p_tipo);
    end if;
    if not v_intacto then
      return jsonb_build_object('accion', 'pendiente_confirmacion', 'site_id', v_site, 'version', v_version,
                                'tipo', p_tipo, 'tipo_anterior', v_plantilla);
    end if;
  else
    -- Reintento de la misma confirmación (ya aplicada): idempotente.
    if p_version_esperada is not null and p_version_esperada = v_version - 1
       and v_plantilla is not distinct from p_tipo and v_marca = v_version then
      return jsonb_build_object('accion', 'sin_cambios', 'site_id', v_site, 'version', v_version, 'tipo', p_tipo);
    end if;
    if p_version_esperada is null or p_version_esperada <> v_version then
      raise exception 'conflicto_version' using errcode = 'P0409',
        detail = jsonb_build_object('esperada', p_version_esperada, 'actual', v_version)::text;
    end if;
    if v_plantilla is not distinct from p_tipo and v_intacto then
      return jsonb_build_object('accion', 'sin_cambios', 'site_id', v_site, 'version', v_version, 'tipo', p_tipo);
    end if;
  end if;

  -- El borrador que se reemplaza queda en el historial («Guardado automático»), restaurable.
  insert into public.website_site_draft_snapshots (organization_id, site_state_id, version, document, reason, created_by)
  values (p_org, v_site, v_version, v_doc, 'antes_de_restaurar', auth.uid())
  returning id into v_instantanea;

  update public.website_site_drafts
     set document = p_document, schema_version = p_schema_version, version = v_version + 1
   where site_state_id = v_site and organization_id = p_org;

  update public.website_site_states
     set plantilla_tipo = p_tipo, plantilla_version_borrador = v_version + 1, plantilla_aplicada_at = now(), updated_at = now()
   where id = v_site;

  return jsonb_build_object('accion', 'reemplazado', 'site_id', v_site, 'version', v_version + 1, 'tipo', p_tipo,
                            'tipo_anterior', v_plantilla, 'instantanea_id', v_instantanea);
end;
$function$;

comment on function public.fn_website_plantilla_sede(integer, integer, text, jsonb, integer, text, integer) is
  'Crea el sitio de una sede con la plantilla de su tipo de negocio o reemplaza su borrador (el anterior queda en el historial). Modo auto: nunca pisa cambios del usuario. Idempotente. No publica.';

revoke all on function public.fn_website_plantilla_sede(integer, integer, text, jsonb, integer, text, integer) from public, anon;
grant execute on function public.fn_website_plantilla_sede(integer, integer, text, jsonb, integer, text, integer) to authenticated, service_role;
