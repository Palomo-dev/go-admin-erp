-- ============================================================
-- Migración: RPC mark_all_notifications_as_read
-- Proyecto: jgmgphmzusbluqhuqihj
-- Fecha: 2026-09-09
--
-- Objetivo: "Marcar todas como leídas" en una sola operacion
-- atomica server-side. Evita el limite de 1000 filas de PostgREST
-- y la race condition del insert masivo cliente-side.
--
-- Diseño: sin parametro p_user_id. auth.uid() dentro de la funcion
-- es la unica fuente que no se puede falsificar. Si alguien cambia
-- la funcion a DEFINER en el futuro, no hay parametro que permita
-- actuar a nombre de otro usuario.
--
-- SECURITY INVOKER: la RLS de notifications filtra la visibilidad.
-- El INSERT ... SELECT ... ON CONFLICT DO NOTHING es atomico.
-- ============================================================

-- Drop de la firma anterior (integer, uuid, text) si existe por upgrade
DROP FUNCTION IF EXISTS mark_all_notifications_as_read(integer, uuid, text);

CREATE OR REPLACE FUNCTION mark_all_notifications_as_read(
  p_organization_id  integer,
  p_scope            text DEFAULT 'all'
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
  v_uid      uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_scope NOT IN ('mine', 'all') THEN
    RAISE EXCEPTION 'p_scope debe ser ''mine'' o ''all''';
  END IF;

  -- INSERT ... SELECT ... ON CONFLICT DO NOTHING en una sola operacion
  -- La RLS de notifications filtra que IDs son visibles para este usuario.
  WITH inserted AS (
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    SELECT n.id, v_uid, now()
    FROM notifications n
    WHERE n.organization_id = p_organization_id
      AND n.status <> 'deleted'
      AND (
        p_scope = 'all'
        OR n.recipient_user_id = v_uid
      )
      -- Solo las que NO estan ya leidas por este usuario
      AND NOT EXISTS (
        SELECT 1 FROM notification_reads nr
        WHERE nr.notification_id = n.id
          AND nr.user_id = v_uid
      )
    ON CONFLICT (notification_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- Permisos: solo authenticated, no anon, no public
REVOKE ALL ON FUNCTION mark_all_notifications_as_read(integer, text) FROM anon;
REVOKE ALL ON FUNCTION mark_all_notifications_as_read(integer, text) FROM public;
GRANT EXECUTE ON FUNCTION mark_all_notifications_as_read(integer, text) TO authenticated;
