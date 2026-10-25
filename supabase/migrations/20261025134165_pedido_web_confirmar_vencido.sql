-- Pedidos online VENCIDOS: «Confirmar pedido» (individual y selección masiva) y su casilla «Marcar como pagado»
-- vuelven a servir para 'expired' (Juan, 25-oct-2026). Se reutiliza el flujo de siempre de los pendientes:
-- fn_confirmar_pedido_web_completo acepta 'expired' y, en la MISMA transacción,
--   1. si expire_pending_web_orders liberó el stock (stock_released_at), lo vuelve a reservar con
--      reserve_stock_for_web_order, TODO O NADA. Si no alcanza → STOCK_INSUFICIENTE (detail = faltantes JSON):
--      se deshace todo, el pedido sigue vencido y no se descuenta nada;
--   2. lo pasa a 'pending' (payment_status failed → pending; limpia cancelled_at/by y cancellation_reason,
--      stock_released_at = null);
--   3. sigue igual que un pendiente: venta, comanda, stock (descuento + libera la reserva), pago, asiento.
-- Idempotencia intacta: venta única por pedido (sale_id), ya_completo, pago único. Un vencido con venta o en mesa
-- no se reactiva. Sin cambios de permisos/auditoría. fn_marcar_pedido_web_pagado (134150) queda sin uso; no se toca.
-- Parche textual (mismo patrón que 20261023011739) para no pisar parches anteriores. Idempotente.
-- Rollback: supabase/rollbacks/20261025134165_pedido_web_confirmar_vencido_rollback.sql
do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean)'::regprocedure);
  v_viejo_decl text := $v$  v_pagado boolean;
begin$v$;
  v_nuevo_decl text := $v$  v_pagado boolean;
  v_reactivar_items jsonb;
  v_reactivar_reserva jsonb;
begin$v$;
  v_viejo text := $v$  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023',$v$;
  v_nuevo text := $v$  -- Vencido (20261025134165): re-reserva todo o nada y vuelve a pending; luego el flujo de siempre.
  if v_wo.status = 'expired' and v_wo.sale_id is null and v_wo.table_session_id is null then
    if v_wo.stock_released_at is not null then
      select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
        into v_reactivar_items
        from public.web_order_items i
       where i.web_order_id = p_order_id and i.product_id is not null and coalesce(i.quantity, 0) > 0;
      if jsonb_array_length(v_reactivar_items) > 0 then
        v_reactivar_reserva := public.reserve_stock_for_web_order(v_wo.organization_id, v_wo.branch_id, p_order_id, v_reactivar_items);
        if not coalesce((v_reactivar_reserva->>'ok')::boolean, false) then
          raise exception 'STOCK_INSUFICIENTE' using errcode = '22023',
            detail = coalesce(v_reactivar_reserva->'shortages', '[]'::jsonb)::text;
        end if;
      end if;
    end if;
    update public.web_orders set
      status = 'pending',
      payment_status = case when payment_status = 'failed' then 'pending' else payment_status end,
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null,
      stock_released_at = null,
      updated_at = now()
     where id = p_order_id;
    select * into v_wo from public.web_orders where id = p_order_id;
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023',$v$;
begin
  if position('Vencido (20261025134165)' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1
     or (length(v_def) - length(replace(v_def, v_viejo_decl, ''))) / length(v_viejo_decl) <> 1 then
    raise exception 'fn_confirmar_pedido_web_completo cambió: el chequeo de estado o el declare no aparecen una sola vez';
  end if;
  execute replace(replace(v_def, v_viejo_decl, v_nuevo_decl), v_viejo, v_nuevo);
end
$parche$;
