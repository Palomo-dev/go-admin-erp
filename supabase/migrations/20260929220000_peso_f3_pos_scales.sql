-- Fase 3 de productos por peso: básculas del POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.8, §3 M4).
--
-- Tabla pos_scales por sucursal, igual que printers: nombre, transporte
-- (Go Admin Desktop por puerto serie o navegador con Web Serial; TCP y BLE
-- quedan reservados para fases posteriores), protocolo, parámetros del puerto
-- y de la lectura, equipo (print_agent_id) o caja (pos_terminal_id) y la
-- última prueba de lectura.
--
-- Lectura: miembros activos de la organización (RLS). Escritura: SOLO por las
-- RPC SECURITY DEFINER de 20260929220100 (pos_basculas_guardar / _archivar /
-- _registrar_prueba), que validan pertenencia, sucursal y el permiso
-- pos.basculas.configurar resuelto en el servidor. Aditiva: tabla nueva.

create table if not exists public.pos_scales (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id) on delete cascade,
  name text not null,
  transport text not null,
  protocol text not null,
  custom_pattern text,
  device_hint text,
  print_agent_id uuid references public.print_agents(id) on delete set null,
  pos_terminal_id uuid references public.pos_terminals(id) on delete set null,
  baud_rate integer not null default 9600,
  data_bits smallint not null default 8,
  parity text not null default 'none',
  stop_bits smallint not null default 1,
  unit_code character(4) not null default 'KG' references public.units(code),
  decimals smallint not null default 3,
  capacity_max numeric(12,3),
  min_division numeric(12,4),
  stable_ms integer not null default 500,
  is_active boolean not null default true,
  last_test_at timestamptz,
  last_test_ok boolean,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_scales_name_check check (length(btrim(name)) between 1 and 80),
  constraint pos_scales_transport_check
    check (transport in ('desktop_serial', 'web_serial', 'desktop_tcp', 'bluetooth_le')),
  constraint pos_scales_protocol_check
    check (protocol in ('continuous_st_gs', 'toledo_8217', 'mettler_sics', 'cas_pd2', 'dibal', 'custom_regex')),
  constraint pos_scales_custom_pattern_check check (
    (protocol <> 'custom_regex' or length(btrim(coalesce(custom_pattern, ''))) between 1 and 300)
    and (custom_pattern is null or length(custom_pattern) <= 300)),
  constraint pos_scales_device_hint_check check (device_hint is null or length(device_hint) <= 200),
  constraint pos_scales_baud_rate_check
    check (baud_rate in (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)),
  constraint pos_scales_data_bits_check check (data_bits in (7, 8)),
  constraint pos_scales_parity_check check (parity in ('none', 'even', 'odd')),
  constraint pos_scales_stop_bits_check check (stop_bits in (1, 2)),
  constraint pos_scales_decimals_check check (decimals between 0 and 4),
  constraint pos_scales_capacity_check check (capacity_max is null or capacity_max > 0),
  constraint pos_scales_division_check check (min_division is null or min_division > 0),
  constraint pos_scales_stable_ms_check check (stable_ms between 0 and 5000)
);

create index if not exists pos_scales_org_branch_idx on public.pos_scales (organization_id, branch_id);
create index if not exists pos_scales_print_agent_idx on public.pos_scales (print_agent_id) where print_agent_id is not null;
create index if not exists pos_scales_pos_terminal_idx on public.pos_scales (pos_terminal_id) where pos_terminal_id is not null;
create index if not exists pos_scales_created_by_idx on public.pos_scales (created_by) where created_by is not null;
-- Dos básculas activas con el mismo nombre en la misma sucursal confunden al cajero.
create unique index if not exists pos_scales_branch_name_active_uq
  on public.pos_scales (organization_id, branch_id, lower(btrim(name))) where is_active;

alter table public.pos_scales enable row level security;

drop policy if exists pos_scales_select on public.pos_scales;
create policy pos_scales_select on public.pos_scales for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active));
-- Sin políticas de escritura: se escribe solo por las RPC SECURITY DEFINER.

revoke all on public.pos_scales from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.pos_scales from authenticated;
grant select on public.pos_scales to authenticated;
grant all on public.pos_scales to service_role;

comment on table public.pos_scales is
  'Básculas del POS por sucursal (productos por peso, fase 3). Se escribe solo por pos_basculas_guardar / pos_basculas_archivar / pos_basculas_registrar_prueba.';
comment on column public.pos_scales.transport is
  'desktop_serial (Go Admin Desktop, serialport) · web_serial (Chrome/Edge, navigator.serial) · desktop_tcp y bluetooth_le reservados.';
comment on column public.pos_scales.protocol is
  'Intérprete de src/lib/pos/bascula: continuous_st_gs, toledo_8217, mettler_sics, cas_pd2, dibal (pendiente de trama documentada) o custom_regex.';
comment on column public.pos_scales.custom_pattern is
  'Solo custom_regex: expresión regular de JavaScript con grupos con nombre estado, signo, peso y unidad.';
comment on column public.pos_scales.device_hint is
  'Puerto recordado: la ruta en Desktop (COM3) o usb:<vendorId>:<productId> en Web Serial.';
comment on column public.pos_scales.stable_ms is
  'Milisegundos con la misma lectura (tolerancia de una división) para considerarla estable.';
