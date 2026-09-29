-- Inventario B9 (docs/implementacion/INVENTARIO-PLAN.md §5.10, pedidos web): una sola RPC para el
-- stock de la confirmación de un pedido web.
--
-- Antes la confirmación estaba copiada dos veces y cada copia hacía el stock a su manera:
--   · webOrderServerConfirmation.ts (webhook de pago, cron): descontaba con receta, pero liberaba la
--     reserva restando qty_reserved a mano en stock_levels (solo el producto, sin receta y sin lote:
--     los ingredientes reservados quedaban reservados para siempre) y vendía los seriales con un
--     insert en serial_tracking_events que usaba `serial_id` (la columna es `serial_number_id`) y sin
--     organization_id: el evento nunca se guardó.
--   · webOrderConfirmationService.ts (botón «Confirmar pedido»): descontaba y liberaba por el servicio
--     de stock, pero no vendía los seriales.
--
-- fn_pedido_web_confirmar_stock(pedido, venta, usuario) hace las tres cosas en una transacción:
--   1. descuenta cada línea con decrement_stock_with_recipe (origen 'web_sale', documento = venta);
--   2. libera EXACTAMENTE lo reservado para el pedido (fn_inv_int_liberar, receta expandida) y marca
--      web_orders.stock_released_at;
--   3. pasa a vendidos los seriales reservados para el pedido y registra su evento.
-- Idempotente: si ya hay movimientos 'web_sale' de esa venta no vuelve a descontar. Un error en una
-- línea no tumba el resto (se devuelve en `errores`), como hacían las dos copias.
-- Guarda: la organización y la sucursal salen del pedido; la venta debe ser de esa organización.

create or replace function public.fn_pedido_web_confirmar_stock(p_order_id uuid, p_sale_id uuid, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order record;
  v_item record;
  v_serial record;
  v_items jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_descontados integer := 0;
  v_seriales integer := 0;
  v_liberados integer := 0;
  v_r jsonb;
  v_ahora timestamptz := now();
begin
  select id, organization_id, branch_id, customer_id, order_number, stock_released_at
    into v_order
    from public.web_orders
   where id = p_order_id
   for update;
  if v_order.id is null then
    raise exception 'pedido_web: no encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_order.organization_id);

  if not exists (select 1 from public.sales s where s.id = p_sale_id and s.organization_id = v_order.organization_id) then
    raise exception 'pedido_web: la venta no es de la organización del pedido' using errcode = '42501';
  end if;

  -- 1 · Descuento definitivo (una sola vez por venta)
  if not exists (select 1 from public.stock_movements m
                  where m.organization_id = v_order.organization_id
                    and m.source = 'web_sale' and m.source_id = p_sale_id::text) then
    for v_item in
      select product_id, quantity, unit_price, product_name
        from public.web_order_items
       where web_order_id = p_order_id and product_id is not null and coalesce(quantity, 0) > 0
    loop
      begin
        perform public.decrement_stock_with_recipe(v_order.organization_id, v_order.branch_id, v_item.product_id,
                                                   v_item.quantity, 'web_sale', p_sale_id::text,
                                                   nullif(v_item.unit_price, 0), p_user_id, null);
        v_descontados := v_descontados + 1;
      exception when others then
        v_errores := v_errores || jsonb_build_array(concat('Producto ', coalesce(v_item.product_name, v_item.product_id::text), ': ', sqlerrm));
      end;
    end loop;
  end if;

  -- 2 · Liberar la reserva del pedido (lo registrado; pedidos viejos, sus ítems sin expandir)
  if v_order.stock_released_at is null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = p_order_id and i.product_id is not null;
    v_r := public.fn_inv_int_liberar(v_order.organization_id, p_order_id::text, 'fn_pedido_web_confirmar_stock',
                                     v_order.branch_id, v_items, false);
    v_liberados := coalesce((v_r->>'items_released')::integer, 0);
    update public.web_orders set stock_released_at = v_ahora where id = p_order_id and stock_released_at is null;
  end if;

  -- 3 · Seriales reservados para el pedido → vendidos
  for v_serial in
    select sn.id, sn.product_id
      from public.serial_numbers sn
     where sn.organization_id = v_order.organization_id
       and sn.web_order_id = p_order_id
       and sn.status = 'reserved'
     for update
  loop
    update public.serial_numbers
       set status = 'sold',
           sale_id = p_sale_id::text,
           sold_to_customer_id = v_order.customer_id,
           sold_by_user_id = p_user_id,
           sale_channel = 'web',
           sale_date = v_ahora,
           price_at_sale = (select i.unit_price from public.web_order_items i
                             where i.web_order_id = p_order_id and i.product_id = v_serial.product_id limit 1),
           updated_at = v_ahora,
           updated_by = p_user_id
     where id = v_serial.id;

    insert into public.serial_tracking_events (serial_number_id, organization_id, event_type, from_status, to_status,
                                               source_table, source_id, sale_id, web_order_id, customer_id,
                                               performed_by, event_date, notes)
    values (v_serial.id, v_order.organization_id, 'sold', 'reserved', 'sold',
            'sales', p_sale_id::text, p_sale_id, p_order_id, v_order.customer_id,
            p_user_id, v_ahora, concat('Venta desde pedido web ', v_order.order_number));
    v_seriales := v_seriales + 1;
  end loop;

  return jsonb_build_object('descontados', v_descontados, 'liberados', v_liberados,
                            'seriales', v_seriales, 'errores', v_errores);
end;
$$;

revoke all on function public.fn_pedido_web_confirmar_stock(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_pedido_web_confirmar_stock(uuid, uuid, uuid) to authenticated, service_role;
