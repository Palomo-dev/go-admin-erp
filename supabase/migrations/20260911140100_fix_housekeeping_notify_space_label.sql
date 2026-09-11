-- Migration: fix_housekeeping_notify_space_label
-- Date: 2026-09-11
-- Bug preexistente: fn_notify_housekeeping_assigned referencia s.name pero spaces tiene label.
-- Esto abortaba todos los INSERTs de housekeeping_tasks (trigger AFTER INSERT).

CREATE OR REPLACE FUNCTION public.fn_notify_housekeeping_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_space_name TEXT;
  v_org_id INT;
BEGIN
  SELECT s.label, b.organization_id
  INTO v_space_name, v_org_id
  FROM spaces s
  LEFT JOIN branches b ON b.id = s.branch_id
  WHERE s.id = NEW.space_id;

  IF v_org_id IS NOT NULL THEN
    PERFORM fn_create_org_notification(
      v_org_id,
      NEW.assigned_to,
      'app',
      'housekeeping_assigned',
      'Tarea de limpieza asignada',
      'Espacio: ' || COALESCE(v_space_name, 'N/A') || ' — Fecha: ' || COALESCE(NEW.task_date::text, 'hoy'),
      jsonb_build_object('task_id', NEW.id::text, 'space_id', NEW.space_id::text)
    );
  END IF;
  RETURN NEW;
END;
$$;
