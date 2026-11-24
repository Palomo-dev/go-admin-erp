-- Reversión de 20261124150000_web_order_plazo_pago_unico.sql: expire_pending_web_orders vuelve a
-- calcular el plazo por dentro (definición del 2026-11-24) y se retira fn_web_order_plazo_minutos.

CREATE OR REPLACE FUNCTION public.expire_pending_web_orders(p_expiration_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order record;
  v_expired integer := 0;
BEGIN
  FOR v_order IN
    SELECT
      w.id,
      w.organization_id,
      w.branch_id,
      w.order_number,
      w.payment_method
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
              -- Métodos sin pasarela (datáfono contra entrega, nequi manual…):
              -- se cobran al entregar, el plazo corto los expiraba antes.
              OR public.fn_web_order_metodo_nativo(w.organization_id, w.payment_method)
              THEN 1440
            ELSE p_expiration_minutes
          END
        ) || ' minutes'
      )::interval
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           cancelled_at = now(),
           cancellation_reason = 'Expirado por falta de pago'
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_web_order_plazo_minutos(integer, text, integer);
