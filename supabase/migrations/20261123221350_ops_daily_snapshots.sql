-- Fotos diarias de la operación (Inicio › widgets de Logística y Transporte; Figma `03` › Inicio,
-- 2915:45356, aprobado por el dueño el 2026-11-23).
--
-- Una fila por organización, sucursal (NULL = todas), día y métrica. La toma el cron
-- `/api/cron/fotos-operacion` (Vercel, cada hora; escribe una vez al día por organización, en la
-- última hora del día de SU zona) con las MISMAS reglas que las pantallas del módulo
-- (`kpisDespacho`, `resumenViajesHoy`): la cifra no se recalcula en SQL. El Inicio la lee para
-- la comparación «vs. cierre de ayer» y la mini-gráfica; sin foto previa no hay delta.
--
-- Escritura solo con service_role (el cron). Lectura: miembros activos de la organización y,
-- para cada métrica, el mismo permiso que abre su widget (logística: ver toda la operación;
-- transporte: `transporte.view`). anon no tiene nada.

create table if not exists public.ops_daily_snapshots (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer null references public.branches(id) on delete cascade,
  fecha date not null,
  metrica text not null,
  valor numeric not null,
  tomada_en timestamptz not null default now(),
  constraint ops_daily_snapshots_metrica_chk check (metrica ~ '^(logistica|transporte)\.[a-z_]{1,40}$'),
  constraint ops_daily_snapshots_uq unique nulls not distinct (organization_id, branch_id, fecha, metrica)
);

comment on table public.ops_daily_snapshots is
  'Fotos diarias de cifras de la operación (logística y transporte) por organización, sucursal (NULL = todas), día local y métrica. Las escribe el cron /api/cron/fotos-operacion con las reglas del módulo; el Inicio las usa para comparar contra el cierre de ayer.';
comment on column public.ops_daily_snapshots.fecha is 'Día calendario en la zona horaria de la organización (la misma del Inicio).';
comment on column public.ops_daily_snapshots.branch_id is 'Sucursal de la foto; NULL = todas las sucursales de la organización.';
comment on column public.ops_daily_snapshots.metrica is 'logistica.atrasados, logistica.por_despachar, logistica.sin_domiciliario, transporte.viajes, transporte.ocupacion_pct, transporte.bloqueados.';

-- La lectura del Inicio (organización + sucursal + rango de días) la cubre el índice del UNIQUE.

alter table public.ops_daily_snapshots enable row level security;

drop policy if exists ops_daily_snapshots_select on public.ops_daily_snapshots;
create policy ops_daily_snapshots_select on public.ops_daily_snapshots
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and (
      (metrica like 'logistica.%'
        and public.fn_caja_puede(organization_id, 'logistica.view')
        and public.fn_logistica_ve_todo(organization_id))
      or (metrica like 'transporte.%'
        and (public.fn_caja_puede(organization_id, 'transporte.view')
             or public.fn_caja_puede(organization_id, 'transport.trips.view')))
    )
  );

revoke all on table public.ops_daily_snapshots from public, anon;
revoke insert, update, delete, truncate on table public.ops_daily_snapshots from authenticated;
grant select on table public.ops_daily_snapshots to authenticated;
grant all on table public.ops_daily_snapshots to service_role;
