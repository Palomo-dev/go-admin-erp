-- fn_notify_shift_assigned: la organizacion sale de la membresia, no de employments.
--
-- Defecto en produccion: NADIE podia crear turnos. El trigger
-- trg_notify_shift_assigned (AFTER INSERT sobre shift_assignments) ejecuta esta
-- funcion, y la funcion abortaba el INSERT con:
--
--   ERROR: 42703: column e.organization_id does not exist
--   CONTEXT: PL/pgSQL function fn_notify_shift_assigned() line 7
--
-- Dos referencias rotas, no una:
--
--   1. `employments` NO tiene `organization_id` (verificado en
--      information_schema.columns). La organizacion vive en
--      `organization_members.organization_id`, y la union correcta es
--      `employments.organization_member_id = organization_members.id`.
--      El cuerpo anterior nombraba `e.organization_id` DOS veces: en la lista
--      del SELECT y en la condicion del LEFT JOIN.
--
--   2. `NEW.date` tampoco existe: la columna de shift_assignments se llama
--      `work_date`. Es un segundo fallo latente que solo se habria visto
--      despues de arreglar el primero, en la misma linea de fuego.
--
-- Ademas, la organizacion de la notificacion pasa a salir de
-- `NEW.organization_id` — el tenant del propio turno, NOT NULL y el que gobierna
-- su RLS — en vez de deducirse por una union que podia no encontrar fila. La
-- membresia solo aporta el destinatario, y solo si es de esa misma
-- organizacion: un turno no puede sacar un destinatario de otro tenant.
--
-- Fechas: `work_date` es una columna `date`, un dia calendario ya fijado, no un
-- `timestamptz`. No se convierte de zona horaria (regla 5 de fechas), asi que
-- aqui NO intervienen fn_today_for / fn_today_for_org: esta funcion no decide
-- ningun dia, solo formatea el que ya trae la fila.
--
-- Reglas: se conservan firma, volatilidad (VOLATILE), SECURITY DEFINER,
-- search_path (sin `SET`, como estaba), owner (postgres) y ACL
-- ({postgres=X/postgres,service_role=X/postgres}). CREATE OR REPLACE, sin DROP
-- y sin sobrecarga. Cero UPDATE sobre datos historicos.

CREATE OR REPLACE FUNCTION public.fn_notify_shift_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org_id INT;
  v_org_membresia INT;
  v_employee_user_id UUID;
BEGIN
  -- La organizacion del turno es la del propio registro.
  v_org_id := NEW.organization_id;

  -- El destinatario sale de la membresia del empleado: employments no tiene
  -- organization_id, se une por organization_member_id.
  SELECT om.organization_id, om.user_id
    INTO v_org_membresia, v_employee_user_id
    FROM employments e
    JOIN organization_members om ON om.id = e.organization_member_id
   WHERE e.id = NEW.employment_id
   LIMIT 1;

  -- Si la membresia fuese de otra organizacion, el turno no le notifica.
  IF v_org_membresia IS DISTINCT FROM v_org_id THEN
    v_employee_user_id := NULL;
  END IF;

  IF v_org_id IS NOT NULL THEN
    PERFORM fn_create_org_notification(
      v_org_id,
      v_employee_user_id,
      'app',
      'shift_assigned',
      'Nuevo turno asignado',
      'Se te ha asignado un turno para el ' || COALESCE(NEW.work_date::text, 'próximamente') || '.',
      jsonb_build_object('shift_id', NEW.id::text, 'date', COALESCE(NEW.work_date::text, ''))
    );
  END IF;
  RETURN NEW;
END;
$function$;
