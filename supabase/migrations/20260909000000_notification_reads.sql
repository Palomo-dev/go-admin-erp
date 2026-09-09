-- ============================================================
-- Migración: notification_reads — lecturas por usuario
-- Proyecto: jgmgphmzusbluqhuqihj
-- Fecha: 2026-09-09
--
-- Objetivo: el badge de notificaciones cuenta no leídas POR USUARIO,
-- no globales. notifications.read_at queda DEPRECADO (se mantiene
-- por compatibilidad hasta que todo el código migre).
--
-- Trigger PERMANENTE sync_read_at_to_notification_reads:
-- Después de esta migración, el único código que escribe
-- notifications.read_at es expire_old_notifications(). El trigger
-- propaga esa escritura a notification_reads para que la caducidad
-- afecte el badge de todos los usuarios. NO BORRAR NUNCA: si se
-- borra, la caducidad deja de afectar el badge y las no leídas
-- se acumulan para siempre.
-- ============================================================

-- ── 1. Tabla notification_reads ────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- Índice secundario para queries por usuario (anti-join, "mark all")
CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON notification_reads (user_id, notification_id);

-- ── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- SELECT: solo tus propias lecturas
DROP POLICY IF EXISTS "notification_reads_select_own" ON notification_reads;
CREATE POLICY "notification_reads_select_own" ON notification_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT: solo para ti, y debes poder ver esa notificación
-- (misma regla que RLS de notifications: propia OR admin de la org)
DROP POLICY IF EXISTS "notification_reads_insert_own" ON notification_reads;
CREATE POLICY "notification_reads_insert_own" ON notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_reads.notification_id
        AND (
          n.recipient_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = n.organization_id
              AND om.is_active = true
              AND (om.role_id = 2 OR om.is_super_admin = true)
          )
        )
    )
  );

-- DELETE: solo tus propias lecturas (para "marcar como no leída")
DROP POLICY IF EXISTS "notification_reads_delete_own" ON notification_reads;
CREATE POLICY "notification_reads_delete_own" ON notification_reads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 3. Backfill ─────────────────────────────────────────────
-- Caso A: notificaciones leídas con destinatario conocido (8.704 filas)
INSERT INTO notification_reads (notification_id, user_id, read_at)
SELECT id, recipient_user_id, read_at
FROM notifications
WHERE read_at IS NOT NULL
  AND recipient_user_id IS NOT NULL
ON CONFLICT (notification_id, user_id) DO NOTHING;

-- Caso B: notificaciones leídas SIN destinatario (2.705 notificaciones,
-- 4.936 filas resultantes). Solo los admins las ven (RLS de notifications).
-- Insertamos una fila por cada admin activo de la org de cada notificación.
-- Esto evita el salto del badge para los admins el día del deploy.
INSERT INTO notification_reads (notification_id, user_id, read_at)
SELECT n.id, om.user_id, n.read_at
FROM notifications n
JOIN organization_members om
  ON om.organization_id = n.organization_id
 AND om.is_active = true
 AND (om.role_id = 2 OR om.is_super_admin = true)
WHERE n.read_at IS NOT NULL
  AND n.recipient_user_id IS NULL
ON CONFLICT (notification_id, user_id) DO NOTHING;

-- Total de la tabla tras el backfill: 13.640 filas.

-- ── 4. Índice en notifications ──────────────────────────────
-- Reemplaza funcionalmente idx_notifications_unread para el conteo
-- por usuario (que ya no filtra por read_at IS NULL). No elimina el
-- viejo porque expire_old_notifications() sigue usándolo.
-- Sin CONCURRENTLY: 23K filas, lock <100ms.
CREATE INDEX IF NOT EXISTS idx_notifications_active_org
  ON notifications (organization_id, created_at)
  WHERE status <> 'deleted';

-- ── 5. Realtime ────────────────────────────────────────────
-- Habilitar la tabla en la publicación para que el cliente pueda
-- suscribirse a inserts propios. Con PK definida, REPLICA IDENTITY
-- DEFAULT basta (no hay updates/deletes que necesiten el valor viejo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
  END IF;
END $$;

-- ── 6. Trigger PERMANENTE: sync_read_at_to_notification_reads ──
-- Propaga escrituras a notifications.read_at hacia notification_reads.
-- Es PERMANENTE (no un puente temporal): después de la migración del
-- código, el único escritor de read_at es expire_old_notifications(),
-- y el trigger asegura que la caducidad afecte el badge de todos.
-- NO BORRAR NUNCA: si se borra, la caducidad deja de afectar el badge
-- y las no leídas se acumulan para siempre.
CREATE OR REPLACE FUNCTION sync_read_at_to_notification_reads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo cuando read_at pasa de NULL a un valor (marca como leída)
  IF NEW.read_at IS NOT NULL AND (OLD.read_at IS NULL OR TG_OP = 'INSERT') THEN
    -- Si la notificación tiene destinatario, insertar su lectura
    IF NEW.recipient_user_id IS NOT NULL THEN
      INSERT INTO notification_reads (notification_id, user_id, read_at)
      VALUES (NEW.id, NEW.recipient_user_id, NEW.read_at)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;
    -- Si no tiene destinatario, insertar para todos los admins activos de la org
    IF NEW.recipient_user_id IS NULL THEN
      INSERT INTO notification_reads (notification_id, user_id, read_at)
      SELECT NEW.id, om.user_id, NEW.read_at
      FROM organization_members om
      WHERE om.organization_id = NEW.organization_id
        AND om.is_active = true
        AND (om.role_id = 2 OR om.is_super_admin = true)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_sync_read_at_to_notification_reads
  AFTER INSERT OR UPDATE OF read_at ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION sync_read_at_to_notification_reads();

-- ── 7. RPC: get_unread_notifications_count ──────────────────
-- SECURITY INVOKER: la RLS de notifications filtra la visibilidad.
-- p_scope='mine' filtra además a las dirigidas al usuario;
-- p_scope='all' deja que la RLS decida (propias + admin ve todas).
-- STABLE: no modifica datos, solo lee.
CREATE OR REPLACE FUNCTION get_unread_notifications_count(
  p_organization_id     integer,
  p_scope               text DEFAULT 'all',
  p_exclude_task_types  boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  IF p_scope NOT IN ('mine', 'all') THEN
    RAISE EXCEPTION 'p_scope debe ser ''mine'' o ''all''';
  END IF;

  SELECT count(*) INTO v_count
  FROM notifications n
  WHERE n.organization_id = p_organization_id
    AND n.status <> 'deleted'
    -- p_scope='mine' restringe a las dirigidas al usuario.
    -- p_scope='all' deja que la RLS de notifications decida
    -- (propias + admin ve todas las de la org).
    AND (
      p_scope = 'all'
      OR n.recipient_user_id = v_uid
    )
    -- No leída por este usuario
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = v_uid
    )
    -- Filtro PM: excluir tipos de tarea si el módulo está inactivo.
    -- COALESCE para que NULL no excluya la fila.
    AND (
      NOT p_exclude_task_types
      OR COALESCE(n.payload->>'type', '') NOT IN (
        'task_assigned','task_completed','task_agent',
        'task_rescheduled','task_reschedule_summary'
      )
    );

  RETURN v_count;
END;
$$;

-- Permisos: solo authenticated, no anon, no public
-- PostgreSQL otorga EXECUTE a public por defecto al crear funciones.
-- Hay que revocar de anon Y de public para que anon no pueda ejecutar.
REVOKE ALL ON FUNCTION get_unread_notifications_count(integer, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION get_unread_notifications_count(integer, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION get_unread_notifications_count(integer, text, boolean) TO authenticated;

-- Grants en notification_reads para que la RLS funcione
GRANT SELECT ON notification_reads TO authenticated;
GRANT INSERT ON notification_reads TO authenticated;
GRANT DELETE ON notification_reads TO authenticated;
