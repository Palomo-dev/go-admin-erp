-- Reversión de 20260930234000_reportes_v2_favoritos_historial.
--
-- Quita las funciones de alcance e historial, las políticas de pertenencia y
-- las columnas nuevas. Se pierden los favoritos (report_id, last_filters,
-- last_used_at) y la acción y sucursal de los eventos del historial; las filas
-- siguen. Revertir antes 20260930234100_reportes_v2_cierres, que usa
-- reporte_alcance_permite y escribe accion.

drop function if exists public.fn_reportes_historial(bigint, integer, timestamptz, text);
drop function if exists public.reporte_acceso_total(bigint);
drop function if exists public.reporte_alcance_permite(bigint, bigint);

drop policy if exists report_executions_miembro_activo on public.report_executions;
drop policy if exists scheduled_reports_miembro_activo on public.scheduled_reports;
drop policy if exists saved_reports_miembro_activo on public.saved_reports;

drop index if exists public.idx_report_executions_org_fecha;
alter table public.report_executions drop constraint if exists report_executions_accion_check;
alter table public.report_executions
  drop column if exists branch_id,
  drop column if exists accion;

drop index if exists public.saved_reports_usuario_reporte_uidx;
alter table public.saved_reports
  drop column if exists last_used_at,
  drop column if exists last_filters,
  drop column if exists report_id;
