-- Reversión de 20261116022548_hrm_f2_02_turnos.
-- Restaura la política y el trigger de notificación anteriores y quita lo agregado.
-- Las columnas nuevas de shift_assignments se borran con sus datos (no se restauran):
-- start_at, end_at, planned_minutes, break_minutes, is_rest_day, is_draft, published_*.
-- hr_attendance_settings se borra con sus filas.

drop function if exists public.fn_hr_rotacion_aplicar(uuid, integer, uuid, uuid[], date, date, integer);
drop function if exists public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean);
drop function if exists public.fn_hr_turnos_validar(uuid, integer, date, date, uuid[]);
drop function if exists public.fn_hr_turnos_ventana(integer, date, date, uuid[]);

drop trigger if exists trg_shift_rotations_validar on public.shift_rotations;
drop function if exists public.fn_hr_rotacion_validar();

drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments for select to authenticated
  using ((employment_id in (select public.fn_hr_mis_empleos()))
         or (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')))
         or (employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))));

drop trigger if exists trg_notify_shift_published on public.shift_assignments;
drop trigger if exists trg_notify_shift_assigned on public.shift_assignments;
create trigger trg_notify_shift_assigned after insert on public.shift_assignments
  for each row execute function public.fn_notify_shift_assigned();
alter function public.fn_notify_shift_assigned() reset search_path;

drop trigger if exists trg_shift_assignments_calcular on public.shift_assignments;
drop function if exists public.fn_hr_turno_calcular();

comment on column public.shift_templates.overtime_multiplier is null;
comment on column public.shift_templates.night_multiplier is null;
drop index if exists public.shift_assignments_empleo_inicio_idx;
drop index if exists public.shift_assignments_org_fecha_idx;
alter table public.shift_assignments drop constraint if exists shift_assignments_break_minutes_rango;
alter table public.shift_assignments drop constraint if exists shift_assignments_planned_minutes_rango;
alter table public.shift_assignments
  drop column if exists published_by,
  drop column if exists published_at,
  drop column if exists is_draft,
  drop column if exists is_rest_day,
  drop column if exists break_minutes,
  drop column if exists planned_minutes,
  drop column if exists end_at,
  drop column if exists start_at;

drop function if exists public.fn_hr_ajustes_asistencia(uuid);
drop table if exists public.hr_attendance_settings;
drop function if exists public.fn_hr_org_del_vinculo();
