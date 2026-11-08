-- P5 y P8 del Contador (docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md): en el perfil tributario por vigencia,
-- el régimen de RENTA y la condición frente al IVA son campos independientes; las combinaciones contradictorias de una
-- misma vigencia se bloquean al guardar; el cambio de periodicidad del IVA a mitad de año exige motivo.
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene, DESPUÉS de
-- 20261108160000_tributario_catalogo_rut_y_codigos_fe.sql.
-- Reversión: supabase/rollbacks/20261108160500_tributario_perfil_renta_iva_rollback.sql
-- Reglas y fundamento: docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md (la lista de bloqueos de abajo es la misma de
-- src/lib/finanzas/tributario/combinaciones.ts; una prueba de jest compara los códigos de ambas).
--
-- Aditiva sobre organization_tax_profiles (aplicada en 20261108100000):
--   · regimen_renta: ordinario · simple · especial (ESAL, régimen tributario especial) · no_contribuyente_declarante
--     (declara ingresos y patrimonio) · no_contribuyente_no_declarante. NULL = sin definir (pendiente «revisar perfil»).
--   · condicion_iva: responsable · no_responsable. NULL = sin definir.
--   · gran_contribuyente, autorretenedor, agente_retencion_iva: booleanos propios (NULL = sin definir). Siguen
--     agente_retencion (renta) y responsable_inc.
--   · responsabilidades_rut: códigos de la casilla 53 del RUT (rut_responsabilidades), opcional.
--   · responsabilidades (ya existía): códigos del DOCUMENTO ELECTRÓNICO (dian_fiscal_responsibilities). Es lo que lee
--     fn_responsabilidades_fiscales_en (H2) para la representación gráfica. No cambia.
--   · motivo_cambio_periodicidad, advertencias_aceptadas, requiere_revision, regimen_origen.
--   · regimen (el campo combinado viejo) deja de ser obligatorio: se sigue llenando, derivado, para lectores viejos, y
--     queda NULL cuando no tiene equivalente (no contribuyente). No se borra.
-- Migración de datos CONSERVADORA (hoy hay 0 vigencias en la base; se deja escrita para cualquier fila que exista al
-- aplicar): solo se llena lo inequívoco; todo lo demás queda NULL y la vigencia queda «requiere_revision».
-- fn_perfil_tributario_guardar_v2 reemplaza a fn_perfil_tributario_guardar, que deja de ser ejecutable por usuarios
-- (se le revoca a authenticated; la reversión lo devuelve) para que nadie guarde por la vía sin validaciones.

alter table public.organization_tax_profiles
  add column if not exists regimen_renta text
    check (regimen_renta in ('ordinario', 'simple', 'especial', 'no_contribuyente_declarante', 'no_contribuyente_no_declarante')),
  add column if not exists condicion_iva text check (condicion_iva in ('responsable', 'no_responsable')),
  add column if not exists gran_contribuyente boolean,
  add column if not exists autorretenedor boolean,
  add column if not exists agente_retencion_iva boolean,
  add column if not exists responsabilidades_rut text[] not null default '{}'::text[],
  add column if not exists motivo_cambio_periodicidad text
    check (motivo_cambio_periodicidad in ('inicio_actividades', 'ingreso_simple', 'salida_simple', 'otro')),
  add column if not exists advertencias_aceptadas text[] not null default '{}'::text[],
  add column if not exists requiere_revision boolean not null default false,
  add column if not exists regimen_origen text;

alter table public.organization_tax_profiles alter column regimen drop not null;

comment on column public.organization_tax_profiles.regimen is
  'OBSOLETO (P5): campo combinado renta/IVA. Se llena derivado para lectores viejos; leer regimen_renta y condicion_iva.';
comment on column public.organization_tax_profiles.regimen_renta is
  'Régimen del impuesto sobre la renta de la vigencia. NULL = sin definir (revisar perfil).';
comment on column public.organization_tax_profiles.condicion_iva is
  'Condición frente al IVA (responsable / no responsable), independiente del régimen de renta. NULL = sin definir.';
comment on column public.organization_tax_profiles.responsabilidades is
  'Códigos de responsabilidad fiscal del DOCUMENTO ELECTRÓNICO (dian_fiscal_responsibilities). No es la casilla 53 del RUT.';
comment on column public.organization_tax_profiles.responsabilidades_rut is
  'Códigos de la casilla 53 del RUT (rut_responsabilidades), opcional.';
comment on column public.organization_tax_profiles.regimen_origen is
  'Valor del campo combinado al migrar (trazabilidad). NULL en vigencias guardadas después de la separación.';

-- Migración de datos (idempotente: solo filas aún no migradas). Reglas:
--   regimen 'simple'  → regimen_renta 'simple'   (SIMPLE es un régimen de renta: inequívoco)
--   regimen 'especial'→ regimen_renta 'especial' (régimen tributario especial de renta: inequívoco)
--   regimen 'ordinario' → regimen_renta NULL: era el valor por defecto del formulario y lo elegía también quien no
--                          tenía claro su régimen; no es inequívoco.
--   regimen 'no_responsable_iva' → regimen_renta NULL (no dice nada de renta); condicion_iva 'no_responsable' salvo
--                          que tenga O-48 (contradicción: NULL).
--   condicion_iva en los demás: 'responsable' solo con O-48 y sin O-49; 'no_responsable' solo con O-49 y sin O-48.
--                          R-99-PN no dice nada del IVA.
--   gran_contribuyente / autorretenedor / agente_retencion_iva: true si tenía O-13 / O-15 / O-23; si no, NULL
--                          (la ausencia del código no prueba que no lo sea).
--   Toda fila migrada queda requiere_revision = true: alguien debe confirmarla y volver a guardarla.
update public.organization_tax_profiles p
   set regimen_origen = p.regimen,
       regimen_renta = case p.regimen when 'simple' then 'simple' when 'especial' then 'especial' else null end,
       condicion_iva = case
         when p.regimen = 'no_responsable_iva' then
           case when 'O-48' = any (p.responsabilidades) then null else 'no_responsable' end
         when 'O-48' = any (p.responsabilidades) and not ('O-49' = any (p.responsabilidades)) then 'responsable'
         when 'O-49' = any (p.responsabilidades) and not ('O-48' = any (p.responsabilidades)) then 'no_responsable'
         else null
       end,
       gran_contribuyente = case when 'O-13' = any (p.responsabilidades) then true else null end,
       autorretenedor = case when 'O-15' = any (p.responsabilidades) then true else null end,
       agente_retencion_iva = case when 'O-23' = any (p.responsabilidades) then true else null end,
       requiere_revision = true
 where p.regimen_origen is null
   and p.regimen is not null
   and p.regimen_renta is null
   and p.condicion_iva is null;

-- Combinaciones contradictorias de una vigencia (BLOQUEOS). Solo los casos claros; lo dudoso es advertencia y vive en
-- combinaciones.ts. Devuelve los códigos ordenados; vacío = sin contradicciones.
create or replace function public.fn_perfil_tributario_bloqueos(
  p_regimen_renta text,
  p_condicion_iva text,
  p_periodicidad_iva text,
  p_gran_contribuyente boolean,
  p_autorretenedor boolean,
  p_agente_retencion_iva boolean,
  p_agente_retencion boolean,
  p_responsable_inc boolean,
  p_responsabilidades text[],
  p_responsabilidades_rut text[]
)
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  with d as (
    select coalesce(p_responsabilidades, '{}'::text[]) as fe, coalesce(p_responsabilidades_rut, '{}'::text[]) as rut
  )
  select coalesce(array_agg(c order by c), '{}'::text[])
    from d, lateral (
      select 'falta_regimen_renta' as c where p_regimen_renta is null
      union all select 'falta_condicion_iva' where p_condicion_iva is null
      -- ET art. 437 par. 3: el no responsable no declara IVA.
      union all select 'no_responsable_con_periodicidad' where p_condicion_iva = 'no_responsable' and p_periodicidad_iva <> 'no_aplica'
      -- ET art. 600: el responsable declara por periodos.
      union all select 'responsable_sin_periodicidad' where p_condicion_iva = 'responsable' and p_periodicidad_iva = 'no_aplica'
      -- ET art. 600 (Ley 1819 de 2016): bimestral o cuatrimestral; la anual es la del SIMPLE (art. 915).
      union all select 'periodicidad_anual_fuera_de_simple' where p_periodicidad_iva = 'anual' and p_regimen_renta <> 'simple'
      -- ET art. 915: el responsable de IVA del SIMPLE presenta declaración anual consolidada.
      union all select 'simple_responsable_no_anual'
        where p_regimen_renta = 'simple' and p_condicion_iva = 'responsable' and p_periodicidad_iva in ('bimestral', 'cuatrimestral')
      -- Códigos del documento electrónico frente a los campos (un código presente es una afirmación).
      union all select 'fe_o48_y_o49' where 'O-48' = any (d.fe) and 'O-49' = any (d.fe)
      union all select 'fe_o48_no_responsable' where 'O-48' = any (d.fe) and p_condicion_iva = 'no_responsable'
      union all select 'fe_o49_responsable' where 'O-49' = any (d.fe) and p_condicion_iva = 'responsable'
      union all select 'fe_o47_sin_simple' where 'O-47' = any (d.fe) and p_regimen_renta <> 'simple'
      union all select 'fe_o13_sin_gran_contribuyente' where 'O-13' = any (d.fe) and p_gran_contribuyente is not true
      union all select 'fe_o15_sin_autorretenedor' where 'O-15' = any (d.fe) and p_autorretenedor is not true
      union all select 'fe_o23_sin_agente_iva' where 'O-23' = any (d.fe) and p_agente_retencion_iva is not true
      -- Casilla 53 del RUT frente a los campos.
      union all select 'rut_varios_regimenes_renta'
        where (select count(*) from unnest(d.rut) r(x) where r.x in ('04', '05', '06', '47')) > 1
      union all select 'rut_regimen_renta_contradictorio'
        where ('05' = any (d.rut) and p_regimen_renta <> 'ordinario')
           or ('04' = any (d.rut) and p_regimen_renta <> 'especial')
           or ('47' = any (d.rut) and p_regimen_renta <> 'simple')
           or ('06' = any (d.rut) and p_regimen_renta <> 'no_contribuyente_declarante')
      union all select 'rut_iva_contradictorio'
        where ('48' = any (d.rut) and ('49' = any (d.rut) or '53' = any (d.rut)))
           or ('48' = any (d.rut) and p_condicion_iva = 'no_responsable')
           or (('49' = any (d.rut) or '53' = any (d.rut)) and p_condicion_iva = 'responsable')
      union all select 'rut_13_sin_gran_contribuyente' where '13' = any (d.rut) and p_gran_contribuyente is not true
      union all select 'rut_15_sin_autorretenedor' where '15' = any (d.rut) and p_autorretenedor is not true
      union all select 'rut_23_sin_agente_iva' where '23' = any (d.rut) and p_agente_retencion_iva is not true
      union all select 'rut_07_sin_agente_retencion' where '07' = any (d.rut) and p_agente_retencion is not true
      union all select 'rut_33_sin_inc' where '33' = any (d.rut) and p_responsable_inc is not true
    ) x;
$function$;

comment on function public.fn_perfil_tributario_bloqueos(text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[]) is
  'Combinaciones contradictorias de una vigencia del perfil tributario (P5). Misma lista que combinaciones.ts.';

revoke all on function public.fn_perfil_tributario_bloqueos(text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[]) from public, anon;
grant execute on function public.fn_perfil_tributario_bloqueos(text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[]) to authenticated, service_role;

-- Guardar una vigencia con renta e IVA separados. Mismas reglas de fechas que fn_perfil_tributario_guardar (cierra la
-- anterior, termina antes de la siguiente, la fecha de inicio no cambia al editar) más:
--   · bloqueos de fn_perfil_tributario_bloqueos → 22023 COMBINACION_CONTRADICTORIA (detail = códigos separados por coma);
--   · cambio de periodicidad del IVA respecto de la vigencia anterior, con fecha distinta del 1 de enero, entre dos
--     periodicidades declarables y sin que la vigencia entre o salga del SIMPLE → exige motivo (ET art. 600: la
--     periodicidad se fija con los ingresos del año anterior) → si falta, 22023 COMBINACION_CONTRADICTORIA
--     'periodicidad_cambio_sin_motivo'. Con motivo se guarda y queda como advertencia aceptada.
--   · códigos del RUT y del documento electrónico deben existir en sus catálogos.
create or replace function public.fn_perfil_tributario_guardar_v2(
  p_organization_id integer,
  p_id uuid,
  p_vigente_desde date,
  p_regimen_renta text,
  p_condicion_iva text,
  p_periodicidad_iva text,
  p_gran_contribuyente boolean,
  p_autorretenedor boolean,
  p_agente_retencion_iva boolean,
  p_agente_retencion boolean,
  p_responsable_inc boolean,
  p_responsabilidades text[],
  p_responsabilidades_rut text[],
  p_motivo_cambio_periodicidad text,
  p_advertencias_aceptadas text[],
  p_ica jsonb,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_desde date;
  v_hasta date;
  v_siguiente date;
  v_fe text[] := coalesce(p_responsabilidades, '{}'::text[]);
  v_rut text[] := coalesce(p_responsabilidades_rut, '{}'::text[]);
  v_ica jsonb := coalesce(p_ica, '[]'::jsonb);
  v_item jsonb;
  v_bloqueos text[];
  v_anterior record;
  v_regimen_legacy text;
  v_tz text;
  v_hoy date;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.approve')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  if p_regimen_renta is not null and p_regimen_renta not in ('ordinario', 'simple', 'especial', 'no_contribuyente_declarante', 'no_contribuyente_no_declarante') then
    raise exception 'REGIMEN_INVALIDO' using errcode = '22023';
  end if;
  if p_condicion_iva is not null and p_condicion_iva not in ('responsable', 'no_responsable') then
    raise exception 'CONDICION_IVA_INVALIDA' using errcode = '22023';
  end if;
  if p_periodicidad_iva is null or p_periodicidad_iva not in ('bimestral', 'cuatrimestral', 'anual', 'no_aplica') then
    raise exception 'PERIODICIDAD_INVALIDA' using errcode = '22023';
  end if;
  if p_motivo_cambio_periodicidad is not null and p_motivo_cambio_periodicidad not in ('inicio_actividades', 'ingreso_simple', 'salida_simple', 'otro') then
    raise exception 'MOTIVO_INVALIDO' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_fe) r(codigo) where not exists (select 1 from public.dian_fiscal_responsibilities d where d.code = r.codigo)) then
    raise exception 'RESPONSABILIDAD_INVALIDA' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_rut) r(codigo) where not exists (select 1 from public.rut_responsabilidades c where c.codigo = r.codigo)) then
    raise exception 'RESPONSABILIDAD_RUT_INVALIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(v_ica) <> 'array' or jsonb_array_length(v_ica) > 50 then
    raise exception 'ICA_INVALIDO' using errcode = '22023';
  end if;

  v_bloqueos := public.fn_perfil_tributario_bloqueos(
    p_regimen_renta, p_condicion_iva, p_periodicidad_iva, p_gran_contribuyente, p_autorretenedor,
    p_agente_retencion_iva, p_agente_retencion, p_responsable_inc, v_fe, v_rut
  );

  perform pg_advisory_xact_lock(hashtext('organization_tax_profiles'), p_organization_id);

  -- Fecha de inicio efectiva (al editar, la de la vigencia existente).
  if p_id is null then
    if p_vigente_desde is null then
      raise exception 'VIGENCIA_INVALIDA' using errcode = '22023';
    end if;
    v_desde := p_vigente_desde;
  else
    select vigente_desde into v_desde from public.organization_tax_profiles where id = p_id and organization_id = p_organization_id;
    if v_desde is null then
      raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
    end if;
  end if;

  -- Cambio de periodicidad del IVA a mitad de año respecto de la vigencia anterior.
  select p.periodicidad_iva, p.regimen_renta into v_anterior
    from public.organization_tax_profiles p
   where p.organization_id = p_organization_id and p.vigente_desde < v_desde and (p_id is null or p.id <> p_id)
   order by p.vigente_desde desc
   limit 1;
  if found
     and to_char(v_desde, 'MM-DD') <> '01-01'
     and v_anterior.periodicidad_iva in ('bimestral', 'cuatrimestral', 'anual')
     and p_periodicidad_iva in ('bimestral', 'cuatrimestral', 'anual')
     and v_anterior.periodicidad_iva <> p_periodicidad_iva
     and not (v_anterior.regimen_renta is distinct from 'simple' and p_regimen_renta = 'simple')
     and not (v_anterior.regimen_renta = 'simple' and p_regimen_renta is distinct from 'simple')
     and p_motivo_cambio_periodicidad is null then
    v_bloqueos := array_append(v_bloqueos, 'periodicidad_cambio_sin_motivo');
  end if;

  if cardinality(v_bloqueos) > 0 then
    raise exception 'COMBINACION_CONTRADICTORIA' using errcode = '22023', detail = array_to_string(v_bloqueos, ',');
  end if;

  -- El campo combinado viejo, derivado (NULL cuando no tiene equivalente).
  v_regimen_legacy := case
    when p_regimen_renta = 'simple' then 'simple'
    when p_regimen_renta = 'especial' then 'especial'
    when p_regimen_renta = 'ordinario' and p_condicion_iva = 'no_responsable' then 'no_responsable_iva'
    when p_regimen_renta = 'ordinario' then 'ordinario'
    else null
  end;

  if p_id is null then
    if exists (select 1 from public.organization_tax_profiles where organization_id = p_organization_id and vigente_desde = v_desde) then
      raise exception 'VIGENCIA_DUPLICADA' using errcode = '23505';
    end if;
    select min(vigente_desde) into v_siguiente
      from public.organization_tax_profiles
     where organization_id = p_organization_id and vigente_desde > v_desde;
    v_hasta := case when v_siguiente is null then null else v_siguiente - 1 end;

    update public.organization_tax_profiles
       set vigente_hasta = v_desde - 1, updated_at = now(), updated_by = auth.uid()
     where organization_id = p_organization_id
       and vigente_desde < v_desde
       and (vigente_hasta is null or vigente_hasta >= v_desde);

    insert into public.organization_tax_profiles (
      organization_id, vigente_desde, vigente_hasta, regimen, regimen_renta, condicion_iva, responsabilidades,
      responsabilidades_rut, gran_contribuyente, autorretenedor, agente_retencion_iva, agente_retencion, responsable_inc,
      periodicidad_iva, motivo_cambio_periodicidad, advertencias_aceptadas, requiere_revision, notas, created_by, updated_by
    ) values (
      p_organization_id, v_desde, v_hasta, v_regimen_legacy, p_regimen_renta, p_condicion_iva, v_fe,
      v_rut, p_gran_contribuyente, p_autorretenedor, p_agente_retencion_iva, coalesce(p_agente_retencion, false),
      coalesce(p_responsable_inc, false), p_periodicidad_iva, p_motivo_cambio_periodicidad,
      coalesce(p_advertencias_aceptadas, '{}'::text[]), false, nullif(left(btrim(coalesce(p_notas, '')), 1000), ''),
      auth.uid(), auth.uid()
    ) returning id, vigente_desde, vigente_hasta into v_id, v_desde, v_hasta;
  else
    update public.organization_tax_profiles
       set regimen = v_regimen_legacy,
           regimen_renta = p_regimen_renta,
           condicion_iva = p_condicion_iva,
           responsabilidades = v_fe,
           responsabilidades_rut = v_rut,
           gran_contribuyente = p_gran_contribuyente,
           autorretenedor = p_autorretenedor,
           agente_retencion_iva = p_agente_retencion_iva,
           agente_retencion = coalesce(p_agente_retencion, false),
           responsable_inc = coalesce(p_responsable_inc, false),
           periodicidad_iva = p_periodicidad_iva,
           motivo_cambio_periodicidad = p_motivo_cambio_periodicidad,
           advertencias_aceptadas = coalesce(p_advertencias_aceptadas, '{}'::text[]),
           requiere_revision = false,
           notas = nullif(left(btrim(coalesce(p_notas, '')), 1000), ''),
           updated_at = now(),
           updated_by = auth.uid()
     where id = p_id and organization_id = p_organization_id
     returning id, vigente_desde, vigente_hasta into v_id, v_desde, v_hasta;
  end if;

  delete from public.organization_tax_profile_ica where profile_id = v_id;
  for v_item in select * from jsonb_array_elements(v_ica) loop
    if not exists (select 1 from public.municipalities m where m.id = (v_item ->> 'municipality_id')::uuid) then
      raise exception 'MUNICIPIO_INVALIDO' using errcode = '22023';
    end if;
    insert into public.organization_tax_profile_ica (organization_id, profile_id, municipality_id, periodicidad, tarifa_por_mil, actividad)
    values (
      p_organization_id, v_id, (v_item ->> 'municipality_id')::uuid, v_item ->> 'periodicidad',
      nullif(v_item ->> 'tarifa_por_mil', '')::numeric, nullif(left(btrim(coalesce(v_item ->> 'actividad', '')), 200), '')
    );
  end loop;

  -- Igual que antes: si la vigencia guardada rige hoy, la ficha de la empresa queda con sus códigos del documento
  -- electrónico. Los documentos leen la vigencia de SU fecha con fn_responsabilidades_fiscales_en (H2).
  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  v_hoy := (now() at time zone v_tz)::date;
  if v_desde <= v_hoy and (v_hasta is null or v_hasta >= v_hoy) then
    update public.organizations set fiscal_responsibilities = v_fe, updated_at = now() where id = p_organization_id;
  end if;

  return v_id;
end;
$function$;

comment on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[], text, text[], jsonb, text) is
  'Crea o corrige una vigencia del perfil tributario con renta e IVA separados y bloqueo de combinaciones contradictorias (P5/P8). finance.approve o admin.full_access.';

revoke all on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[], text, text[], jsonb, text) from public, anon;
grant execute on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[], text, text[], jsonb, text) to authenticated;

-- La vía vieja (campo combinado, sin validar combinaciones) deja de estar disponible para los usuarios.
revoke execute on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) from authenticated;
