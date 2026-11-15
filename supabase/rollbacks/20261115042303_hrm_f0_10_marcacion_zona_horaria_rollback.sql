-- Revierte HRM fase 0 · paso 10. Devuelve hrm_process_attendance_event a su
-- versión anterior (SECURITY INVOKER y zona 'America/Bogota' fija) y quita la
-- validación de attendance_events.
-- ADVERTENCIA: con el paso 9 aplicado, la versión anterior (invoker) no puede
-- escribir timesheets por el empleado y /marcar falla. Revertir el paso 9 antes,
-- o dejar este paso aplicado.

drop trigger if exists trg_attendance_events_validar on public.attendance_events;
drop function if exists public.fn_hr_attendance_validar();

create or replace function public.hrm_process_attendance_event()
 returns trigger
 language plpgsql
 security invoker
as $function$
DECLARE
  v_work_date date;
  v_timesheet_id uuid;
  v_first_check_in timestamptz;
  v_last_check_out timestamptz;
  v_total_worked int;
  v_total_break int;
BEGIN
  -- Obtener la fecha del evento
  v_work_date := date(NEW.event_at AT TIME ZONE 'America/Bogota');

  -- Crear timesheet si no existe
  INSERT INTO timesheets (organization_id, branch_id, employment_id, work_date)
  VALUES (NEW.organization_id, NEW.branch_id, NEW.employment_id, v_work_date)
  ON CONFLICT (employment_id, work_date) DO NOTHING;

  -- Obtener el ID del timesheet
  SELECT id INTO v_timesheet_id
  FROM timesheets
  WHERE employment_id = NEW.employment_id AND work_date = v_work_date;

  -- Calcular primera entrada del día
  SELECT MIN(event_at) INTO v_first_check_in
  FROM attendance_events
  WHERE employment_id = NEW.employment_id
    AND date(event_at AT TIME ZONE 'America/Bogota') = v_work_date
    AND event_type = 'check_in';

  -- Calcular última salida del día
  SELECT MAX(event_at) INTO v_last_check_out
  FROM attendance_events
  WHERE employment_id = NEW.employment_id
    AND date(event_at AT TIME ZONE 'America/Bogota') = v_work_date
    AND event_type = 'check_out';

  -- Calcular minutos trabajados (simplificado: última salida - primera entrada)
  IF v_first_check_in IS NOT NULL AND v_last_check_out IS NOT NULL THEN
    v_total_worked := EXTRACT(EPOCH FROM (v_last_check_out - v_first_check_in)) / 60;
  ELSE
    v_total_worked := 0;
  END IF;

  -- TODO: Calcular breaks desde break_start/break_end
  v_total_break := 0;

  -- Actualizar timesheet
  UPDATE timesheets
  SET
    first_check_in = v_first_check_in,
    last_check_out = v_last_check_out,
    worked_minutes = GREATEST(0, v_total_worked),
    break_minutes = v_total_break,
    net_worked_minutes = GREATEST(0, v_total_worked - v_total_break),
    updated_at = now()
  WHERE id = v_timesheet_id;

  RETURN NEW;
END;
$function$;

drop function if exists public.fn_hr_zona_horaria(integer, integer);
