-- Finanzas ronda 4 · Frente R4-A · Perfil tributario de la empresa (Figma «07 Finanzas» 2335:136222).
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md).
-- Mientras no exista, la pantalla «Perfil tributario» y el
-- «Centro tributario» dicen «pendiente de activar»; nunca inventan un perfil.
--
-- Qué ya existía y se reutiliza (verificado por MCP el 2026-11-07):
--   - organizations.nit, .dv, .municipality_id y .fiscal_responsibilities (lo que lee la facturación
--     electrónica); dian_fiscal_responsibilities (O-13, O-15, O-23, O-47, O-48, O-49, R-99-PN);
--     municipalities (DIVIPOLA).
--   - organization_settings existe pero está vacía y es clave/valor sin vigencia: no sirve para esto.
-- Qué falta y crea esta migración:
--   - el régimen, la periodicidad del IVA, si es agente de retención en la fuente, si responde por el
--     impuesto al consumo y el ICA por municipio;
--   - la VIGENCIA: el perfil cambia de un año a otro y el borrador de un periodo debe leer el perfil
--     vigente en ese periodo, no el de hoy.
--
-- Aditiva: dos tablas nuevas y dos funciones; ninguna columna existente cambia.
-- Escritura SOLO por fn_perfil_tributario_guardar (SECURITY DEFINER, pertenencia + finance.approve o
-- admin.full_access). Lectura por RLS de pertenencia. Sin acceso de anon.
-- organizations.fiscal_responsibilities se sigue escribiendo, ahora también desde aquí, cuando la
-- vigencia guardada es la de hoy: las responsabilidades de la empresa tienen un solo editor.

create table if not exists public.organization_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  vigente_desde date not null,
  vigente_hasta date,
  regimen text not null check (regimen in ('ordinario', 'simple', 'no_responsable_iva', 'especial')),
  responsabilidades text[] not null default '{}'::text[],
  agente_retencion boolean not null default false,
  responsable_inc boolean not null default false,
  periodicidad_iva text not null default 'no_aplica'
    check (periodicidad_iva in ('bimestral', 'cuatrimestral', 'anual', 'no_aplica')),
  notas text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_tax_profiles_rango check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint organization_tax_profiles_desde_unico unique (organization_id, vigente_desde)
);

comment on table public.organization_tax_profiles is
  'Perfil tributario de la organización por vigencia (régimen, responsabilidades RUT, periodicidad del IVA). Escritura solo por fn_perfil_tributario_guardar.';

create table if not exists public.organization_tax_profile_ica (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.organization_tax_profiles(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id),
  periodicidad text not null check (periodicidad in ('mensual', 'bimestral', 'cuatrimestral', 'semestral', 'anual')),
  tarifa_por_mil numeric(8, 3) check (tarifa_por_mil is null or (tarifa_por_mil >= 0 and tarifa_por_mil <= 100)),
  actividad text,
  created_at timestamptz not null default now(),
  constraint organization_tax_profile_ica_unico unique (profile_id, municipality_id)
);

comment on table public.organization_tax_profile_ica is
  'ICA de la organización por municipio dentro de una vigencia del perfil tributario.';

create index if not exists idx_organization_tax_profiles_org on public.organization_tax_profiles (organization_id, vigente_desde desc);
create index if not exists idx_organization_tax_profile_ica_perfil on public.organization_tax_profile_ica (profile_id);
create index if not exists idx_organization_tax_profile_ica_org on public.organization_tax_profile_ica (organization_id);

alter table public.organization_tax_profiles enable row level security;
alter table public.organization_tax_profile_ica enable row level security;

drop policy if exists organization_tax_profiles_select_miembros on public.organization_tax_profiles;
create policy organization_tax_profiles_select_miembros
  on public.organization_tax_profiles
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists organization_tax_profile_ica_select_miembros on public.organization_tax_profile_ica;
create policy organization_tax_profile_ica_select_miembros
  on public.organization_tax_profile_ica
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke all on public.organization_tax_profiles from anon;
revoke all on public.organization_tax_profile_ica from anon;
revoke insert, update, delete, truncate, references, trigger on public.organization_tax_profiles from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.organization_tax_profile_ica from authenticated;
grant select on public.organization_tax_profiles to authenticated;
grant select on public.organization_tax_profile_ica to authenticated;

-- Guardar una vigencia (nueva o existente). `p_id` nulo = vigencia nueva desde `p_vigente_desde`:
--   - cierra la vigencia abierta anterior el día antes;
--   - si ya hay una posterior, la nueva termina el día antes de esa.
-- Con `p_id`, se corrigen los datos de esa vigencia (la fecha de inicio no cambia: para otra fecha,
-- otra vigencia). El ICA de la vigencia se reemplaza por `p_ica` (lista de
-- {municipality_id, periodicidad, tarifa_por_mil?, actividad?}).
create or replace function public.fn_perfil_tributario_guardar(
  p_organization_id integer,
  p_id uuid,
  p_vigente_desde date,
  p_regimen text,
  p_responsabilidades text[],
  p_agente_retencion boolean,
  p_responsable_inc boolean,
  p_periodicidad_iva text,
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
  v_resp text[] := coalesce(p_responsabilidades, '{}'::text[]);
  v_ica jsonb := coalesce(p_ica, '[]'::jsonb);
  v_item jsonb;
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

  if p_regimen is null or p_regimen not in ('ordinario', 'simple', 'no_responsable_iva', 'especial') then
    raise exception 'REGIMEN_INVALIDO' using errcode = '22023';
  end if;
  if p_periodicidad_iva is null or p_periodicidad_iva not in ('bimestral', 'cuatrimestral', 'anual', 'no_aplica') then
    raise exception 'PERIODICIDAD_INVALIDA' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_resp) r(codigo)
    where not exists (select 1 from public.dian_fiscal_responsibilities d where d.code = r.codigo)
  ) then
    raise exception 'RESPONSABILIDAD_INVALIDA' using errcode = '22023';
  end if;
  if 'O-48' = any (v_resp) and 'O-49' = any (v_resp) then
    raise exception 'RESPONSABILIDADES_INCOMPATIBLES' using errcode = '22023';
  end if;
  if jsonb_typeof(v_ica) <> 'array' or jsonb_array_length(v_ica) > 50 then
    raise exception 'ICA_INVALIDO' using errcode = '22023';
  end if;

  -- Una sola escritura del perfil a la vez por organización.
  perform pg_advisory_xact_lock(hashtext('organization_tax_profiles'), p_organization_id);

  if p_id is null then
    if p_vigente_desde is null then
      raise exception 'VIGENCIA_INVALIDA' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.organization_tax_profiles
      where organization_id = p_organization_id and vigente_desde = p_vigente_desde
    ) then
      raise exception 'VIGENCIA_DUPLICADA' using errcode = '23505';
    end if;
    select min(vigente_desde) into v_siguiente
      from public.organization_tax_profiles
     where organization_id = p_organization_id and vigente_desde > p_vigente_desde;
    v_desde := p_vigente_desde;
    v_hasta := case when v_siguiente is null then null else v_siguiente - 1 end;

    -- La vigencia anterior que se solapaba termina el día antes de la nueva.
    update public.organization_tax_profiles
       set vigente_hasta = p_vigente_desde - 1, updated_at = now(), updated_by = auth.uid()
     where organization_id = p_organization_id
       and vigente_desde < p_vigente_desde
       and (vigente_hasta is null or vigente_hasta >= p_vigente_desde);

    insert into public.organization_tax_profiles (
      organization_id, vigente_desde, vigente_hasta, regimen, responsabilidades, agente_retencion,
      responsable_inc, periodicidad_iva, notas, created_by, updated_by
    ) values (
      p_organization_id, v_desde, v_hasta, p_regimen, v_resp, coalesce(p_agente_retencion, false),
      coalesce(p_responsable_inc, false), p_periodicidad_iva, nullif(left(btrim(coalesce(p_notas, '')), 1000), ''),
      auth.uid(), auth.uid()
    ) returning id, vigente_desde, vigente_hasta into v_id, v_desde, v_hasta;
  else
    update public.organization_tax_profiles
       set regimen = p_regimen,
           responsabilidades = v_resp,
           agente_retencion = coalesce(p_agente_retencion, false),
           responsable_inc = coalesce(p_responsable_inc, false),
           periodicidad_iva = p_periodicidad_iva,
           notas = nullif(left(btrim(coalesce(p_notas, '')), 1000), ''),
           updated_at = now(),
           updated_by = auth.uid()
     where id = p_id and organization_id = p_organization_id
     returning id, vigente_desde, vigente_hasta into v_id, v_desde, v_hasta;
    if v_id is null then
      raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
    end if;
  end if;

  delete from public.organization_tax_profile_ica where profile_id = v_id;
  for v_item in select * from jsonb_array_elements(v_ica) loop
    if not exists (select 1 from public.municipalities m where m.id = (v_item ->> 'municipality_id')::uuid) then
      raise exception 'MUNICIPIO_INVALIDO' using errcode = '22023';
    end if;
    insert into public.organization_tax_profile_ica (organization_id, profile_id, municipality_id, periodicidad, tarifa_por_mil, actividad)
    values (
      p_organization_id,
      v_id,
      (v_item ->> 'municipality_id')::uuid,
      v_item ->> 'periodicidad',
      nullif(v_item ->> 'tarifa_por_mil', '')::numeric,
      nullif(left(btrim(coalesce(v_item ->> 'actividad', '')), 200), '')
    );
  end loop;

  -- Si la vigencia guardada es la de hoy (día de la organización), la facturación electrónica
  -- lee las mismas responsabilidades.
  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  v_hoy := (now() at time zone v_tz)::date;
  if v_desde <= v_hoy and (v_hasta is null or v_hasta >= v_hoy) then
    update public.organizations set fiscal_responsibilities = v_resp, updated_at = now() where id = p_organization_id;
  end if;

  return v_id;
end;
$function$;

comment on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) is
  'Crea o corrige una vigencia del perfil tributario de la organización (finance.approve o admin.full_access).';

revoke all on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) from public, anon;
grant execute on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) to authenticated;
