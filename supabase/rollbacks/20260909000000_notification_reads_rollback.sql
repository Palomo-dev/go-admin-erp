-- ── ROLLBACK — ejecutar solo si se necesita revertir ────────
-- NO ejecutar como parte de la migración normal. Ejecutar manualmente.

DROP TRIGGER IF EXISTS trigger_sync_read_at_to_notification_reads ON notifications;
DROP FUNCTION IF EXISTS sync_read_at_to_notification_reads();

DROP FUNCTION IF EXISTS get_unread_notifications_count(integer, text, boolean);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE notification_reads;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_notifications_active_org;

DROP TABLE IF EXISTS notification_reads CASCADE;

-- notifications.read_at y idx_notifications_unread se mantienen intactos.
