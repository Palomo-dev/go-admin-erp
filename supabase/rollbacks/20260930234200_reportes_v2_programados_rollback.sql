-- Reversión de 20260930234200_reportes_v2_programados.
--
-- Quita las columnas y restricciones nuevas de scheduled_reports. Los envíos
-- programados pierden reporte, filtros, sucursal, formato, hora, día, zona y
-- el resultado del último envío; recipients (columna original) se conserva.
-- Detener antes el cron /api/cron/reportes-programados.

drop index if exists public.idx_scheduled_reports_user;
drop index if exists public.idx_scheduled_reports_branch;
drop index if exists public.idx_scheduled_reports_vencidos;

alter table public.scheduled_reports
  drop constraint if exists scheduled_reports_last_status_check,
  drop constraint if exists scheduled_reports_dia_check,
  drop constraint if exists scheduled_reports_frequency_check,
  drop constraint if exists scheduled_reports_formato_check;

alter table public.scheduled_reports
  drop column if exists last_error,
  drop column if exists last_status,
  drop column if exists last_run_at,
  drop column if exists zona_horaria,
  drop column if exists dia,
  drop column if exists hora,
  drop column if exists formato,
  drop column if exists branch_id,
  drop column if exists filtros,
  drop column if exists report_id;
