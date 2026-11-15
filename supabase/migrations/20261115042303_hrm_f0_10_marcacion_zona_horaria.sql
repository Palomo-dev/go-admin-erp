-- HRM fase 0 · paso 10: zona horaria de la marcación (R7) y marcación propia.
-- ADR-001 §9 y §11.
--
-- - hrm_process_attendance_event ya no usa 'America/Bogota' fijo: toma la zona
--   de la sede y, si no tiene, la de la organización. America/Bogota queda solo
--   como último recurso (regla 6 de docs/reglas-fechas-timezone.md). Pasa a
--   SECURITY DEFINER porque escribe timesheets por el empleado que marca, y el
--   empleado ya no escribe timesheets por RLS.
-- - attendance_events: un trigger obliga a que organization_id sea el del
--   vínculo, y a quien marca sin hr.attendance.manage le fija la hora del
--   servidor y is_manual_entry = false (no puede marcar en el pasado ni el futuro).

create or replace function public.fn_hr_zona_horaria(p_org integer, p_branch integer)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_prueba timestamp;
begin
  select nullif(btrim(b.timezone), '') into v_tz
    from public.branches b where b.id = p_branch and b.organization_id = p_org;
  if v_tz is null then
    select nullif(btrim(o.timezone), '') into v_tz from public.organizations o where o.id = p_org;
  end if;
  if v_tz is null then
    return 'America/Bogota';
  end if;
  begin
    v_prueba := now() at time zone v_tz;
  exception when others then
    return 'America/Bogota';
  end;
  return v_tz;
end;
$$;
revoke execute on function public.fn_hr_zona_horaria(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_zona_horaria(integer, integer) to service_role;

create or replace function public.hrm_process_attendance_event()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
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
  -- Día laboral en la zona de la sede del evento (o de la organización).
  v_tz := public.fn_hr_zona_horaria(new.organization_id, new.branch_id);
  v_work_date := (new.event_at at time zone v_tz)::date;

  insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
  values (new.organization_id, new.branch_id, new.employment_id, v_work_date)
  on conflict (employment_id, work_date) do nothing;

  select id into v_timesheet_id
    from public.timesheets
   where employment_id = new.employment_id and work_date = v_work_date;

  select min(event_at) into v_first_check_in
    from public.attendance_events
   where employment_id = new.employment_id
     and (event_at at time zone v_tz)::date = v_work_date
     and event_type = 'check_in';

  select max(event_at) into v_last_check_out
    from public.attendance_events
   where employment_id = new.employment_id
     and (event_at at time zone v_tz)::date = v_work_date
     and event_type = 'check_out';

  if v_first_check_in is not null and v_last_check_out is not null then
    v_total_worked := extract(epoch from (v_last_check_out - v_first_check_in)) / 60;
  else
    v_total_worked := 0;
  end if;

  -- Los descansos (break_start/break_end) se calculan en la fase 2.
  v_total_break := 0;

  update public.timesheets
     set first_check_in = v_first_check_in,
         last_check_out = v_last_check_out,
         worked_minutes = greatest(0, v_total_worked),
         break_minutes = v_total_break,
         net_worked_minutes = greatest(0, v_total_worked - v_total_break),
         updated_at = now()
   where id = v_timesheet_id;

  return new;
end;
$function$;
revoke execute on function public.hrm_process_attendance_event() from public, anon, authenticated;

create or replace function public.fn_hr_attendance_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
  -- Quien marca para sí (sin gestión de asistencia) marca con la hora del servidor.
  if auth.uid() is not null and not public.fn_hr_puede(v_org, 'hr.attendance.manage') then
    new.event_at := now();
    new.is_manual_entry := false;
    new.manual_reason := null;
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_attendance_validar() from public, anon, authenticated;

drop trigger if exists trg_attendance_events_validar on public.attendance_events;
create trigger trg_attendance_events_validar before insert on public.attendance_events
  for each row execute function public.fn_hr_attendance_validar();
