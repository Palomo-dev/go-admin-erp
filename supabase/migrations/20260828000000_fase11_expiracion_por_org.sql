-- FASE 11 — Ronda 2 — Expiración de pedidos configurable por organización
--
-- La RPC `expire_pending_web_orders` usaba un único `p_expiration_minutes`
-- global. Ahora lee `organization_settings.settings->>'order_expiration_minutes'`
-- por organización (clave 'web_commerce'), con fallback al parámetro default.
--
-- Métodos de pago manuales (transfer, cash, bancolombia_transfer,
-- bancolombia_collect) usan 24h (1440 min) si la org no configuró un valor.
--
-- No rompe la firma: `p_expiration_minutes integer DEFAULT 30` se conserva
-- como fallback global.

CREATE OR REPLACE FUNCTION public.expire_pending_web_orders(
  p_expiration_minutes integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order record;
  v_expired integer := 0;
  v_org_minutes integer;
  v_effective_minutes integer;
BEGIN
  -- 1) Seleccionar órdenes pendientes que superaron el tiempo de expiración
  --    con FOR UPDATE SKIP LOCKED para evitar concurrencia entre ejecuciones del cron
  FOR v_order IN
    SELECT
      w.id,
      w.organization_id,
      w.branch_id,
      w.order_number,
      w.payment_method,
      COALESCE(
        NULLIF(
          (os.settings->>'order_expiration_minutes')::integer,
          0
        ),
        CASE
          -- Métodos de pago manuales: 24h por defecto si la org no configuró
          WHEN w.payment_method IN ('transfer','cash','bancolombia_transfer','bancolombia_collect','pse')
            THEN 1440
          ELSE p_expiration_minutes
        END
      ) AS effective_minutes
    FROM web_orders w
    LEFT JOIN LATERAL (
      SELECT settings
      FROM organization_settings
      WHERE organization_id = w.organization_id
        AND key = 'web_commerce'
      LIMIT 1
    ) os ON true
    WHERE w.status = 'pending'
      AND w.payment_status = 'pending'
      AND w.stock_released_at IS NULL
      AND w.created_at < now() - (
        COALESCE(
          NULLIF(
            (os.settings->>'order_expiration_minutes')::integer,
            0
          ),
          CASE
            WHEN w.payment_method IN ('transfer','cash','bancolombia_transfer','bancolombia_collect','pse')
              THEN 1440
            ELSE p_expiration_minutes
          END
        ) || ' minutes'
      )::interval
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    -- 2) Liberar stock reservado
    PERFORM release_stock_for_order(v_order.id);

    -- 3) Marcar como expirada
    UPDATE web_orders
       SET status = 'expired',
           cancelled_at = now(),
           cancellation_reason = 'Expirado por falta de pago'
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;
