-- Reversión de 20261125001000_pagos_intentos_pedido_web.sql.
--
-- ADVERTENCIA: borra la tabla web_order_payment_attempts con todos sus intentos (los del backfill
-- y los registrados después). No se pueden reconstruir: los de Bold y Wompi se podrían volver a
-- sacar de integration_events, los «Enlace de pago creado» y «Venció sin pagar» no.
--
-- ORDEN: antes de revertir, la tienda (goadmin-websites) tiene que dejar de llamar a
-- fn_web_order_intento_registrar (los webhooks solo registran en consola si falla) y volver a
-- cancelar el pedido al rechazo; si no, un pedido «Pendiente» con pago rechazado no vencería
-- nunca con la función de abajo (solo vence payment_status = 'pending').

-- expire_pending_web_orders: la definición de 20261124230000_contraentrega_anticipo.sql.
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
      w.payment_method,
      (w.advance_status = 'pending' AND w.advance_due_at IS NOT NULL) AS por_anticipo
    FROM web_orders w
    WHERE w.status = 'pending'
      AND w.payment_status = 'pending'
      AND w.stock_released_at IS NULL
      AND CASE
            -- Contraentrega con anticipo (20261124230000): vence a la hora límite del anticipo,
            -- igual que un pedido con pasarela sin pagar.
            WHEN w.advance_status = 'pending' AND w.advance_due_at IS NOT NULL
              THEN w.advance_due_at < now()
            -- Plazo único (fn_web_order_plazo_minutos): configuración de la organización, 24 h para
            -- métodos sin pasarela, o el plazo del cron.
            ELSE w.created_at < now() - make_interval(
                   mins => public.fn_web_order_plazo_minutos(w.organization_id, w.payment_method, p_expiration_minutes)
                 )
          END
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           advance_status = CASE WHEN v_order.por_anticipo THEN 'expired' ELSE advance_status END,
           cancelled_at = now(),
           cancellation_reason = CASE WHEN v_order.por_anticipo THEN 'Anticipo sin pagar'
                                      ELSE 'Expirado por falta de pago' END
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

drop function if exists public.fn_web_orders_resumen_pago(uuid[]);
drop function if exists public.fn_web_order_intento_registrar(integer, uuid, text, text, text, text, text, text, text, text, text, text, numeric, text);
drop function if exists public.fn_web_order_vence_pago(public.web_orders);
drop function if exists public.fn_web_order_vence_pago_en(public.web_orders, integer);
drop function if exists public.fn_web_order_pasarela_de_metodo(text);
drop table if exists public.web_order_payment_attempts;
