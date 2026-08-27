-- ============================================================================
-- Migración: 20260827000000_notifications_ttl_cleanup.sql
-- Fase N1 — Auto-limpieza de notificaciones (TTL por etapas)
--
-- Objetivo:
--   Las notificaciones viejas sin leer deben auto-limpiarse:
--   - Etapa 1: marcar como leídas (read_at = now()) las no leídas con > unread_ttl_days (default 30).
--   - Etapa 2: eliminar (status = 'deleted') las notificaciones con > delete_ttl_days (default 90).
--   TTL configurable por organización en organization_settings (key='notifications').
--
-- Tablas afectadas:
--   - notifications
--   - organization_settings
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Índice parcial para optimizar queries del badge y la limpieza TTL
--    (apply_migration no soporta CONCURRENTLY, se usa CREATE INDEX sin él)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (organization_id, created_at)
  WHERE read_at IS NULL AND status != 'deleted';

-- ---------------------------------------------------------------------------
-- 2. Función expire_old_notifications()
--    Recorre las organizaciones con notificaciones, lee TTL de
--    organization_settings (key='notifications') y aplica las dos etapas.
--    Retorna JSONB: { marked_read, deleted, processed_orgs }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_old_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_org_id              integer;
  v_unread_ttl_days     integer := 30;
  v_delete_ttl_days     integer := 90;
  v_marked_read_total   integer := 0;
  v_deleted_total       integer := 0;
  v_processed_orgs      integer := 0;
  v_settings            jsonb;
  v_marked_read         integer;
  v_deleted             integer;
BEGIN
  -- Prevenir ejecuciones concurrentes (el lock se libera al terminar la transacción)
  PERFORM pg_advisory_xact_lock(hashtext('expire_old_notifications'));

  -- Recorrer cada organización que tiene notificaciones
  FOR v_org_id IN
    SELECT DISTINCT organization_id
      FROM notifications
     WHERE organization_id IS NOT NULL
  LOOP
    -- Leer configuración TTL de organization_settings (key='notifications')
    SELECT settings INTO v_settings
      FROM organization_settings
     WHERE organization_id = v_org_id
       AND key = 'notifications'
     LIMIT 1;

    -- Si no hay fila o faltan campos, usar defaults (30 / 90).
    -- GREATEST(..., 1) asegura mínimo 1 día: previene que TTL=0 o negativo
    -- limpie todas las notificaciones inmediatamente.
    v_unread_ttl_days := GREATEST(
      COALESCE(
        NULLIF((v_settings->>'unread_ttl_days')::integer, NULL),
        30
      ),
      1
    );
    v_delete_ttl_days := GREATEST(
      COALESCE(
        NULLIF((v_settings->>'delete_ttl_days')::integer, NULL),
        90
      ),
      1
    );

    -- Etapa 1: marcar como leídas las no leídas con > unread_ttl_days
    UPDATE notifications
       SET read_at = now(),
           updated_at = now()
     WHERE read_at IS NULL
       AND status != 'deleted'
       AND organization_id = v_org_id
       AND created_at < now() - (v_unread_ttl_days || ' days')::interval;

    GET DIAGNOSTICS v_marked_read = ROW_COUNT;
    v_marked_read_total := v_marked_read_total + v_marked_read;

    -- Etapa 2: eliminar (status='deleted') las notificaciones con > delete_ttl_days.
    -- NOTA: delete_ttl aplica a TODAS las notificaciones viejas (leídas y no leídas)
    -- por diseño ("limpieza total"). NO se filtra read_at IS NULL aquí.
    UPDATE notifications
       SET status = 'deleted',
           updated_at = now()
     WHERE status != 'deleted'
       AND organization_id = v_org_id
       AND created_at < now() - (v_delete_ttl_days || ' days')::interval;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_deleted_total := v_deleted_total + v_deleted;

    v_processed_orgs := v_processed_orgs + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'marked_read',    v_marked_read_total,
    'deleted',        v_deleted_total,
    'processed_orgs', v_processed_orgs
  );
END;
$function$;
