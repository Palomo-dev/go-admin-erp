-- Reversión de 20261116023042_hrm_f2_03_marcacion.
-- Restaura las versiones anteriores de fn_hr_attendance_validar y de
-- hrm_process_attendance_event (agrupaba por el día local de cada marcación y no
-- restaba descansos) y la lectura de time_clocks para todo miembro activo.
-- Advertencia: hr_geo_consents se borra con sus filas (los consentimientos no se
-- restauran) y se pierden attendance_events.work_date / work_mode y las columnas de
-- clasificación de timesheets.

drop function if exists public.fn_hr_reloj_qr_rotar(uuid, integer, uuid);
drop function if exists public.fn_hr_marcacion_manual(uuid, integer, uuid, text, timestamptz, text);
drop function if exists public.fn_hr_consentimiento_ubicacion(uuid, integer, boolean, text, text, text);
drop function if exists public.fn_hr_marcacion_estado(uuid, integer);
drop function if exists public.fn_hr_marcar(uuid, integer, jsonb, text, text);

drop policy if exists time_clocks_select on public.time_clocks;
create policy time_clocks_select on public.time_clocks for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

drop trigger if exists trg_attendance_event_process on public.attendance_events;
create or replace function public.hrm_process_attendance_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
  v_work_date date;
  v_timesheet_id uuid;
  v_first_check_in timestamptz;
  v_last_check_out timestamptz;
  v_total_worked int;
  v_total_break int;
begin
  v_tz := public.fn_hr_zona_horaria(new.organization_id, new.branch_id);
  v_work_date := (new.event_at at time zone v_tz)::date;
  insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
  values (new.organization_id, new.branch_id, new.employment_id, v_work_date)
  on conflict (employment_id, work_date) do nothing;
  select id into v_timesheet_id from public.timesheets
   where employment_id = new.employment_id and work_date = v_work_date;
  select min(event_at) into v_first_check_in from public.attendance_events
   where employment_id = new.employment_id and (event_at at time zone v_tz)::date = v_work_date and event_type = 'check_in';
  select max(event_at) into v_last_check_out from public.attendance_events
   where employment_id = new.employment_id and (event_at at time zone v_tz)::date = v_work_date and event_type = 'check_out';
  if v_first_check_in is not null and v_last_check_out is not null then
    v_total_worked := extract(epoch from (v_last_check_out - v_first_check_in)) / 60;
  else
    v_total_worked := 0;
  end if;
  v_total_break := 0;
  update public.timesheets
     set first_check_in = v_first_check_in, last_check_out = v_last_check_out,
         worked_minutes = greatest(0, v_total_worked), break_minutes = v_total_break,
         net_worked_minutes = greatest(0, v_total_worked - v_total_break), updated_at = now()
   where id = v_timesheet_id;
  return new;
end;
$function$;
create trigger trg_attendance_event_process after insert on public.attendance_events
  for each row execute function public.hrm_process_attendance_event();
drop function if exists public.fn_hr_timesheet_consolidar(uuid, date);

drop trigger if exists trg_attendance_events_validar on public.attendance_events;
create or replace function public.fn_hr_attendance_validar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select e.organization_id into v_org from public.employments e where e.id = new.employment_id;
  if v_org is null then
    raise exception 'hr: el vínculo laboral no existe' using errcode = '23503';
  end if;
  if new.organization_id is distinct from v_org then
    raise exception 'hr: la marcación debe ser de la organización del vínculo' using errcode = '42501';
  end if;
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.organization_id = v_org) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.fn_hr_puede(v_org, 'hr.attendance.manage') then
    new.event_at := now();
    new.is_manual_entry := false;
    new.manual_reason := null;
    new.created_by := auth.uid();
  end if;
  return new;
end;
$function$;
create trigger trg_attendance_events_validar before insert on public.attendance_events
  for each row execute function public.fn_hr_attendance_validar();

comment on column public.timesheets.status is null;
alter table public.timesheets drop constraint if exists timesheets_classification_source_chk;
alter table public.timesheets
  drop column if exists payroll_ready_by,
  drop column if exists payroll_ready_at,
  drop column if exists classification_source,
  drop column if exists classification,
  drop column if exists classified_at,
  drop column if exists classified_version,
  drop column if exists input_version;

drop index if exists public.attendance_events_vinculo_hora_idx;
drop index if exists public.attendance_events_vinculo_dia_idx;
alter table public.attendance_events drop constraint if exists attendance_events_work_mode_chk;
alter table public.attendance_events drop column if exists work_mode, drop column if exists work_date;

drop function if exists public.fn_hr_ubicacion_autorizada(uuid);
drop table if exists public.hr_geo_consents;
