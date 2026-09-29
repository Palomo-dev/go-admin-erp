-- Reversión de 20260929020400_inv_b0_5_reservas.sql
--
-- Restaura reserve_stock_for_web_order y release_stock_for_order a su definición
-- anterior exacta (md5 de pg_get_functiondef: e4bb8fd21830f60ca9b3aeb0ad79b3cd y
-- 9fd9e280aa89c08aacabd024512c3b4a) y elimina lo nuevo.
--
-- Advertencia de datos: stock_reservations se borra. Las reservas vivas que
-- registró siguen sumadas en stock_levels.qty_reserved; al volver a la versión
-- anterior se liberan por los ítems del pedido (sin expandir recetas), como antes.
-- La versión restaurada de release_stock_for_order NO comprueba pertenencia ni fija
-- search_path (así estaba).

CREATE OR REPLACE FUNCTION public.reserve_stock_for_web_order(p_organization_id integer, p_branch_id integer, p_order_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item jsonb;
  v_available numeric;
  v_shortages jsonb := '[]'::jsonb;
  v_qty numeric;
  v_pid integer;
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  -- 1) Bloquear filas en orden determinista de product_id (evita deadlocks)
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'product_id')::int
  LOOP
    v_pid := (v_item->>'product_id')::int;
    v_qty := (v_item->>'quantity')::numeric;

    SELECT COALESCE(qty_on_hand, 0) - COALESCE(qty_reserved, 0)
    INTO v_available
    FROM stock_levels
    WHERE branch_id = p_branch_id
      AND product_id = v_pid
      AND lot_id IS NULL
    FOR UPDATE;

    IF v_available IS NULL OR v_available < v_qty THEN
      v_shortages := v_shortages || jsonb_build_object(
        'product_id', v_pid,
        'available', COALESCE(v_available, 0),
        'requested', v_qty
      );
    END IF;
  END LOOP;

  -- 2) Todo o nada: si hay shortages, no reservar nada
  IF jsonb_array_length(v_shortages) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'shortages', v_shortages);
  END IF;

  -- 3) Reservar: incrementar qty_reserved
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::int;
    v_qty := (v_item->>'quantity')::numeric;

    UPDATE stock_levels
       SET qty_reserved = COALESCE(qty_reserved, 0) + v_qty,
           updated_at = now()
     WHERE branch_id = p_branch_id
       AND product_id = v_pid
       AND lot_id IS NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_stock_for_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order record;
  v_item record;
  v_released integer := 0;
BEGIN
  -- 1) Bloquear la fila del pedido para evitar concurrencia
  SELECT id, branch_id, status, stock_released_at
  INTO v_order
  FROM web_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- 2) Idempotencia: si ya se liberó el stock, no hacer nada
  IF v_order.stock_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_released', true);
  END IF;

  -- 3) Liberar qty_reserved por cada item del pedido
  FOR v_item IN
    SELECT product_id, quantity
    FROM web_order_items
    WHERE web_order_id = p_order_id
      AND product_id IS NOT NULL
  LOOP
    UPDATE stock_levels
       SET qty_reserved = GREATEST(0, COALESCE(qty_reserved, 0) - v_item.quantity),
           updated_at = now()
     WHERE branch_id = v_order.branch_id
       AND product_id = v_item.product_id
       AND lot_id IS NULL;

    v_released := v_released + 1;
  END LOOP;

  -- 4) Marcar que el stock fue liberado
  UPDATE web_orders
     SET stock_released_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'items_released', v_released);
END;
$function$
;

revoke all on function public.reserve_stock_for_web_order(integer, integer, uuid, jsonb) from anon, public;
revoke all on function public.release_stock_for_order(uuid) from anon, public;
grant execute on function public.reserve_stock_for_web_order(integer, integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.release_stock_for_order(uuid) to authenticated, service_role;

drop function if exists public.fn_inv_reversion_entrada(integer, integer, text, text, jsonb);
drop function if exists public.fn_stock_liberar_reserva(integer, text, jsonb);
drop function if exists public.fn_stock_reservar(integer, integer, text, jsonb);
drop function if exists public.fn_inv_int_liberar(integer, text, text, integer, jsonb, boolean);
drop function if exists public.fn_inv_int_reservar(integer, integer, text, text, jsonb, boolean);
drop function if exists public.fn_inv_int_expandir_items(integer, jsonb);
drop table if exists public.stock_reservations;
