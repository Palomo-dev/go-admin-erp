-- Hora oficial del servidor · M1 — columnas de auditoría y la regla única.
-- Análisis: docs/design/HORA-SERVIDOR-ANALISIS.md
--
-- La hora oficial de una venta o de una apertura de caja la pone el servidor.
-- La del equipo se conserva aparte (device_*), junto con la hora en que el
-- servidor recibió la fila (server_received_at) y, si la hora oficial es dudosa,
-- el motivo (time_review_reason): la venta NO se bloquea, queda marcada.
--
-- Aditiva: columnas NULL-ables. server_received_at recibe su DEFAULT en un
-- ALTER aparte para que las filas históricas queden en NULL (con el default en
-- el ADD COLUMN, Postgres las rellenaría con la hora de esta migración).
-- Rollback: supabase/rollbacks/20260930190001_hora_servidor_columnas_y_regla_rollback.sql

alter table public.sales
  add column if not exists device_created_at timestamptz,
  add column if not exists server_received_at timestamptz,
  add column if not exists clock_skew_seconds integer,
  add column if not exists time_review_reason text;
alter table public.sales alter column server_received_at set default now();

alter table public.cash_sessions
  add column if not exists device_opened_at timestamptz,
  add column if not exists device_clock_offset_ms integer,
  add column if not exists server_received_at timestamptz,
  add column if not exists time_review_reason text;
alter table public.cash_sessions alter column server_received_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_time_review_reason_check') then
    alter table public.sales add constraint sales_time_review_reason_check
      check (time_review_reason is null or time_review_reason in
        ('reloj_desfasado', 'desfase_desconocido', 'hora_futura', 'hora_muy_antigua'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_sessions_time_review_reason_check') then
    alter table public.cash_sessions add constraint cash_sessions_time_review_reason_check
      check (time_review_reason is null or time_review_reason in
        ('reloj_desfasado', 'desfase_desconocido', 'hora_futura', 'hora_muy_antigua'));
  end if;
end $$;

comment on column public.sales.device_created_at is
  'Hora del equipo que registró la venta (sobre del POS). Solo auditoría: la hora oficial es sale_date.';
comment on column public.sales.server_received_at is
  'Hora del servidor al recibir la venta (en una venta sin conexión, la de la sincronización). NULL en filas anteriores al 2026-09-30.';
comment on column public.sales.clock_skew_seconds is
  'Desfase del reloj del equipo contra el servidor, en segundos (positivo = el equipo va adelantado).';
comment on column public.sales.time_review_reason is
  'Si no es NULL, la hora oficial de la venta es dudosa y debe revisarse: reloj_desfasado, desfase_desconocido, hora_futura, hora_muy_antigua.';
comment on column public.cash_sessions.device_opened_at is
  'Hora del equipo al abrir la caja sin conexión. Solo auditoría: la hora oficial es opened_at.';
comment on column public.cash_sessions.device_clock_offset_ms is
  'Desfase del reloj del equipo medido contra el servidor antes de abrir la caja sin conexión (ms, positivo = adelantado).';
comment on column public.cash_sessions.server_received_at is
  'Hora del servidor al recibir la apertura. NULL en filas anteriores al 2026-09-30.';
comment on column public.cash_sessions.time_review_reason is
  'Si no es NULL, la hora de apertura es dudosa: mismos motivos que sales.time_review_reason.';

create index if not exists idx_sales_revision_hora
  on public.sales (organization_id, sale_date desc)
  where time_review_reason is not null;

-- ── La regla única ──────────────────────────────────────────────────────────
-- En línea: la hora oficial es now(), siempre.
-- Sin conexión: la del equipo SOLO si su desfase contra el servidor, medido
-- antes de quedarse sin red, era conocido y ≤ p_umbral, y la hora cae en
-- [now() − 30 días, now() + 5 min]. Si no: now() y un motivo de revisión.
-- Espejo en TypeScript: src/lib/pos/reloj/horaOficial.ts (mismos casos en tests).
create or replace function public.fn_hora_oficial_resolver(
  p_hora_equipo timestamptz,
  p_desfase_ms  bigint,
  p_sin_conexion boolean,
  p_umbral      interval default interval '10 minutes'
)
returns table (instante timestamptz, motivo_revision text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select
    case
      when not coalesce(p_sin_conexion, false) or p_hora_equipo is null then now()
      when p_hora_equipo > now() + interval '5 minutes' then now()
      when p_hora_equipo < now() - interval '30 days' then now()
      when p_desfase_ms is null then now()
      when abs(p_desfase_ms) > extract(epoch from p_umbral) * 1000 then now()
      else p_hora_equipo
    end,
    case
      when not coalesce(p_sin_conexion, false) or p_hora_equipo is null then null
      when p_hora_equipo > now() + interval '5 minutes' then 'hora_futura'
      when p_hora_equipo < now() - interval '30 days' then 'hora_muy_antigua'
      when p_desfase_ms is null then 'desfase_desconocido'
      when abs(p_desfase_ms) > extract(epoch from p_umbral) * 1000 then 'reloj_desfasado'
      else null
    end;
$$;

comment on function public.fn_hora_oficial_resolver(timestamptz, bigint, boolean, interval) is
  'Hora oficial de un hecho de dinero: now() en línea; la del equipo sin conexión solo si su desfase medido es ≤ umbral. Devuelve el motivo de revisión cuando cae a now().';

revoke all on function public.fn_hora_oficial_resolver(timestamptz, bigint, boolean, interval) from public, anon;
grant execute on function public.fn_hora_oficial_resolver(timestamptz, bigint, boolean, interval) to authenticated, service_role;
