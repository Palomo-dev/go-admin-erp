-- Rollback de 20260930190001_hora_servidor_columnas_y_regla.sql
--
-- Revertir ANTES 20260930190002 y 20260930190003, que usan estas columnas y la regla.
-- DATOS: al quitar las columnas se pierden la hora del equipo, la hora de recepción y
-- las marcas de revisión de las ventas y cajas registradas desde la migración.
-- La hora oficial (sale_date, opened_at) no se toca.

drop function if exists public.fn_hora_oficial_resolver(timestamptz, bigint, boolean, interval);
drop index if exists public.idx_sales_revision_hora;

alter table public.sales drop constraint if exists sales_time_review_reason_check;
alter table public.cash_sessions drop constraint if exists cash_sessions_time_review_reason_check;

alter table public.sales
  drop column if exists device_created_at,
  drop column if exists server_received_at,
  drop column if exists clock_skew_seconds,
  drop column if exists time_review_reason;

alter table public.cash_sessions
  drop column if exists device_opened_at,
  drop column if exists device_clock_offset_ms,
  drop column if exists server_received_at,
  drop column if exists time_review_reason;
