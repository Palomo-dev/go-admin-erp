-- Reportes v2: favoritos e historial del centro de reportes (Figma, página 14
-- Reportes, sección 20: pestañas Favoritos e Historial).
--
-- Favoritos (saved_reports, 0 filas al aplicar):
--   - report_id: id del reporte del catálogo (reportesCatalogo.ts);
--   - last_filters: últimos filtros usados en ese reporte (periodo, sucursal,
--     comparativo, franja), para abrirlo como se dejó;
--   - last_used_at: orden de «Recientes» en el inicio.
--   Un favorito por persona y reporte (índice único parcial). Son personales:
--   la política existente (auth.uid() = user_id) sigue igual.
--
-- Historial (report_executions, 74 filas de 8 organizaciones al aplicar):
--   - accion: qué se hizo con el reporte (ver, exportar, enviar, programar,
--     emitir, recalcular, firmar, reabrir). Las filas de la v1 quedan en NULL
--     y fn_reportes_historial las lee como «emitir» si son un cierre
--     (report_id 'cierre-*') o «ver» si no;
--   - branch_id: sucursal filtrada; NULL es el consolidado.
--   Cada quien inserta y ve sus propios eventos (política existente). La
--   lectura de la organización es fn_reportes_historial: quien tiene acceso a
--   todas las sucursales ve todo; si no, lo suyo y lo de sus sucursales.
--
-- Las tres tablas solo filtraban por user_id. Se añade una política
-- RESTRICTIVE de pertenencia activa a la organización: una fila de una
-- organización de la que la persona ya salió deja de ser suya.

alter table public.saved_reports
  add column if not exists report_id text,
  add column if not exists last_filters jsonb not null default '{}'::jsonb,
  add column if not exists last_used_at timestamptz;

create unique index if not exists saved_reports_usuario_reporte_uidx
  on public.saved_reports (organization_id, user_id, report_id)
  where report_id is not null;

alter table public.report_executions
  add column if not exists accion text,
  add column if not exists branch_id integer references public.branches(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'report_executions_accion_check'
      and conrelid = 'public.report_executions'::regclass
  ) then
    alter table public.report_executions
      add constraint report_executions_accion_check
      check (accion is null or accion in (
        'ver', 'exportar', 'enviar', 'programar',
        'emitir', 'recalcular', 'firmar', 'reabrir'
      ));
  end if;
end $$;

create index if not exists idx_report_executions_org_fecha
  on public.report_executions (organization_id, created_at desc);

-- Pertenencia activa, además de la política propia de cada tabla.
drop policy if exists saved_reports_miembro_activo on public.saved_reports;
create policy saved_reports_miembro_activo on public.saved_reports
  as restrictive for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ));

drop policy if exists scheduled_reports_miembro_activo on public.scheduled_reports;
create policy scheduled_reports_miembro_activo on public.scheduled_reports
  as restrictive for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ));

drop policy if exists report_executions_miembro_activo on public.report_executions;
create policy report_executions_miembro_activo on public.report_executions
  as restrictive for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true
  ));

-- ¿La persona de la sesión puede ver esa sucursal (o el consolidado, si es
-- NULL) en los reportes? Misma regla que reporte_exigir_alcance_sucursal,
-- pero devuelve un booleano en vez de fallar, para listas y políticas.
create or replace function public.reporte_alcance_permite(
  p_organization_id bigint,
  p_branch_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);
  return true;
exception
  when insufficient_privilege then
    return false;
end;
$$;

revoke all on function public.reporte_alcance_permite(bigint, bigint) from public, anon;
grant execute on function public.reporte_alcance_permite(bigint, bigint) to authenticated, service_role;

-- ¿Ve todas las sucursales? (consolidado, reportes de toda la organización).
create or replace function public.reporte_acceso_total(p_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.reporte_alcance_permite(p_organization_id, null);
$$;

revoke all on function public.reporte_acceso_total(bigint) from public, anon;
grant execute on function public.reporte_acceso_total(bigint) to authenticated, service_role;

-- Historial de la organización (pestaña Historial, solo lectura).
create or replace function public.fn_reportes_historial(
  p_organization_id bigint,
  p_limite integer default 100,
  p_antes timestamptz default null,
  p_report_id text default null
)
returns table (
  id uuid,
  report_id text,
  accion text,
  filtros jsonb,
  branch_id integer,
  sucursal text,
  user_id uuid,
  usuario text,
  estado text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_total boolean;
begin
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = (select auth.uid())
      and om.organization_id = p_organization_id
      and om.is_active = true
  ) then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  v_total := public.reporte_acceso_total(p_organization_id);

  return query
  select
    re.id,
    re.report_id,
    coalesce(re.accion,
      case when re.report_id like 'cierre-%' then 'emitir' else 'ver' end),
    coalesce(nullif(re.params, '{}'::jsonb), re.filters, '{}'::jsonb),
    re.branch_id,
    b.name::text,
    re.user_id,
    coalesce(
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.email::text
    ),
    re.status,
    re.created_at
  from public.report_executions re
  left join public.branches b on b.id = re.branch_id
  left join public.profiles p on p.id = re.user_id
  where re.organization_id = p_organization_id
    and (p_antes is null or re.created_at < p_antes)
    and (p_report_id is null or re.report_id = p_report_id)
    and (
      v_total
      or re.user_id = (select auth.uid())
      or (re.branch_id is not null and public.app_branch_access(re.branch_id))
    )
  order by re.created_at desc
  limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

revoke all on function public.fn_reportes_historial(bigint, integer, timestamptz, text) from public, anon;
grant execute on function public.fn_reportes_historial(bigint, integer, timestamptz, text) to authenticated, service_role;
