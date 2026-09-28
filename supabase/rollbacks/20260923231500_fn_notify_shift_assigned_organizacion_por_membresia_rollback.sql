-- Reversion de 20260923231500_fn_notify_shift_assigned_organizacion_por_membresia.
--
-- ADVERTENCIA: esta reversion REINTRODUCE el defecto. Devuelve el cuerpo
-- exacto que tenia la funcion antes del arreglo, con `e.organization_id` (una
-- columna que no existe en `employments`) y con `NEW.date` (la columna se llama
-- `work_date`). Aplicarla vuelve a dejar el sistema sin poder crear turnos:
-- todo INSERT en `shift_assignments` abortara con
--   ERROR: 42703: column e.organization_id does not exist
--
-- Se conserva aqui solo para que la migracion tenga reversion real, no vacia,
-- segun docs/POLITICA-MIGRACIONES.md. No aplicarla salvo para reproducir el
-- fallo original.

CREATE OR REPLACE FUNCTION public.fn_notify_shift_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org_id INT;
  v_employee_user_id UUID;
BEGIN
  -- Obtener org_id y user_id del empleado via employment
  SELECT e.organization_id, om.user_id
  INTO v_org_id, v_employee_user_id
  FROM employments e
  LEFT JOIN organization_members om ON om.organization_id = e.organization_id
  WHERE e.id = NEW.employment_id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    PERFORM fn_create_org_notification(
      v_org_id,
      v_employee_user_id,
      'app',
      'shift_assigned',
      'Nuevo turno asignado',
      'Se te ha asignado un turno para el ' || COALESCE(NEW.date::text, 'próximamente') || '.',
      jsonb_build_object('shift_id', NEW.id::text, 'date', COALESCE(NEW.date::text, ''))
    );
  END IF;
  RETURN NEW;
END;
$function$;
