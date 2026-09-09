-- ============================================================
-- Rollback: RPC mark_all_notifications_as_read
-- Revierte la migracion 20260909100000_mark_all_notifications_as_read.sql
--
-- NO ejecutar automaticamente. Este archivo vive en supabase/rollbacks/
-- (fuera de migrations/) para que el CLI no lo ejecute en db reset.
-- ============================================================

DROP FUNCTION IF EXISTS mark_all_notifications_as_read(integer, text);
DROP FUNCTION IF EXISTS mark_all_notifications_as_read(integer, uuid, text);
