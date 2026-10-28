-- 20261027245000 · fn_confirmar_pedido_web_completo: reactiva un pedido de PASARELA cancelado por pago fallido
--
-- SIN APLICAR. Juan (27-oct): «Marcar como pagado» de un pedido de pasarela es su decisión manual
-- (independiente de Wompi u otra pasarela) y vale también para los CANCELADOS por pago fallido
-- (status 'cancelled' + payment_status 'failed'): igual que un vencido.
--   * Solo pedidos de pasarela (fn_pedido_web_es_pasarela, migración 20261027241500), sin venta y sin mesa,
--     y con el MISMO permiso que fn_marcar_pedido_web_pagado_pasarela (pos.pedidos_web.marcar_pagado o
--     pos.void); sin él → SIN_PERMISO (42501).
--   * Stock TODO O NADA: muchos cancelados conservan reservas vivas (stock_reservations sin released_at,
--     p. ej. WO-335-MVRG940J-HZTB con 3); se liberan (release_stock_for_order) y se vuelve a reservar
--     todo (reserve_stock_for_web_order). Sin stock → STOCK_INSUFICIENTE (22023), detail = faltantes,
--     hint claro, y no cambia nada (la transacción se revierte, también la liberación).
--   * Pasa a pending (payment_status failed → pending, limpia cancelled_*), luego el flujo de siempre
--     (venta, comanda, confirmed). La app marca pagado con fn_marcar_pedido_web_pagado_pasarela.
--   * Auditoría: ops_audit_log 'REACTIVATE_FAILED_PAYMENT' con el estado, motivo y fecha de la
--     cancelación previa, y marca [REACTIVADO …] en internal_notes.
--   * Los vencidos siguen igual (solo re-reservan si stock_released_at no es null).
-- Se conservan firma, SECURITY INVOKER, search_path y grants (authenticated, service_role; nunca anon).
--
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
--   20261027246000 (liberar reservas de cancelados) es INDEPENDIENTE: va aparte, con su respaldo y su rollback.
-- Aplicar con: psql -v ON_ERROR_STOP=1 -f <archivo>
-- Rollback: supabase/rollbacks/20261027245000_reactivar_cancelados_pago_fallido_pasarela_rollback.sql
--   (definición exacta de prod, md5 pg_get_functiondef 4f7fa842de636850415efb3f0b45e0ae)

set lock_timeout = '3s';
set statement_timeout = '60s';

begin;

CREATE OR REPLACE FUNCTION public.fn_confirmar_pedido_web_completo(p_order_id uuid, p_lineas jsonb DEFAULT NULL::jsonb, p_prep_min integer DEFAULT NULL::integer, p_transit_min integer DEFAULT NULL::integer, p_pagado boolean DEFAULT NULL::boolean, p_customer_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_marcar_confirmado boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wo public.web_orders%rowtype;
  v_conf jsonb;
  v_sale uuid;
  v_venta_creada boolean := false;
  v_items int := 0;
  v_stock jsonb;
  v_ticket integer;
  v_comanda_creada boolean := false;
  v_estado boolean := false;
  v_user uuid;
  v_ids uuid[];
  v_pagado boolean;
  v_reactivar_items jsonb;
  v_reactivar_reserva jsonb;
  v_cancelado_pago_fallido boolean := false;
  v_ahora timestamptz := now();
begin
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- Vencido (20261025134165): re-reserva todo o nada y vuelve a pending; luego el flujo de siempre.
  -- 20261027245000: igual para un pedido de PASARELA cancelado por pago fallido (cancelled + failed),
  -- sin venta ni mesa. Sus reservas vivas (si quedan) se liberan y se vuelve a reservar TODO O NADA.
  v_cancelado_pago_fallido := v_wo.status = 'cancelled' and v_wo.payment_status = 'failed'
    and public.fn_pedido_web_es_pasarela(v_wo.payment_method, v_wo.payment_reference);
  if (v_wo.status = 'expired' or v_cancelado_pago_fallido)
     and v_wo.sale_id is null and v_wo.table_session_id is null then
    -- Mismo permiso que fn_marcar_pedido_web_pagado_pasarela (20261027243000).
    if v_cancelado_pago_fallido
       and not (public.fn_tiene_permiso(v_wo.organization_id, 'pos.pedidos_web.marcar_pagado')
                or public.fn_tiene_permiso(v_wo.organization_id, 'pos.void')) then
      raise exception 'SIN_PERMISO' using errcode = '42501',
        detail = 'Reactivar un pedido cancelado por pago fallido exige el permiso de marcarlo pagado.';
    end if;
    if v_cancelado_pago_fallido and exists (
         select 1 from public.stock_reservations r
          where r.ref_type = 'web_order' and r.ref_id = p_order_id::text and r.released_at is null) then
      perform public.release_stock_for_order(p_order_id);
    end if;
    if v_wo.stock_released_at is not null or v_cancelado_pago_fallido then
      select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
        into v_reactivar_items
        from public.web_order_items i
       where i.web_order_id = p_order_id and i.product_id is not null and coalesce(i.quantity, 0) > 0;
      if jsonb_array_length(v_reactivar_items) > 0 then
        v_reactivar_reserva := public.reserve_stock_for_web_order(v_wo.organization_id, v_wo.branch_id, p_order_id, v_reactivar_items);
        if not coalesce((v_reactivar_reserva->>'ok')::boolean, false) then
          raise exception 'STOCK_INSUFICIENTE' using errcode = '22023',
            detail = coalesce(v_reactivar_reserva->'shortages', '[]'::jsonb)::text,
            hint = 'No hay stock para reactivar el pedido ' || v_wo.order_number
                   || ': ajusta el inventario de los productos faltantes y vuelve a intentarlo.';
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
      internal_notes = case when v_cancelado_pago_fallido then concat_ws(E'\n', nullif(internal_notes, ''),
        '[REACTIVADO ' || to_char(v_ahora at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
        || ' COT] cancelado por pago fallido (' || coalesce(nullif(btrim(v_wo.cancellation_reason), ''), '-')
        || ') por ' || coalesce(coalesce(auth.uid(), p_user_id)::text, '-'))
        else internal_notes end,
      updated_at = now()
     where id = p_order_id;
    if v_cancelado_pago_fallido then
      insert into public.ops_audit_log (
        organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
      ) values (
        v_wo.organization_id, v_wo.branch_id, coalesce(auth.uid(), p_user_id), 'web_orders', v_wo.id::text,
        'REACTIVATE_FAILED_PAYMENT',
        jsonb_build_object('status', v_wo.status, 'payment_status', v_wo.payment_status,
                           'cancelled_at', v_wo.cancelled_at, 'cancelled_by', v_wo.cancelled_by,
                           'cancellation_reason', v_wo.cancellation_reason,
                           'payment_method', v_wo.payment_method, 'payment_reference', v_wo.payment_reference),
        jsonb_build_object('status', 'pending', 'payment_status', 'pending'),
        jsonb_build_object('order_number', v_wo.order_number, 'cancelado_por_pago_fallido', true,
                           'reserva', v_reactivar_reserva, 'reactivado_en', v_ahora));
    end if;
    select * into v_wo from public.web_orders where id = p_order_id;
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023',
      detail = 'El pedido está ' || v_wo.status || ' y no se puede confirmar.';
  end if;
  if v_wo.table_session_id is not null then
    return jsonb_build_object('sale_id', v_wo.sale_id, 'ya_completo', true,
                              'table_session_id', v_wo.table_session_id);
  end if;
  v_user := coalesce(auth.uid(), p_user_id);
  v_pagado := coalesce(p_pagado, v_wo.payment_status = 'paid');
  v_conf := public.fn_confirmar_pedido_web(p_order_id, p_customer_id, v_user, v_pagado);
  v_sale := (v_conf->>'sale_id')::uuid;
  v_venta_creada := coalesce((v_conf->>'creada')::boolean, false);
  if not exists (select 1 from public.sale_items si where si.sale_id = v_sale) then
    if jsonb_typeof(p_lineas) = 'array' and jsonb_array_length(p_lineas) > 0 then
      -- Producto eliminado (o con el padre eliminado): no se vende, salvo que el pedido
      -- sea anterior a la baja. Punto único: fn_producto_exigir_vendible (guardarraíl 40).
      perform public.fn_producto_exigir_vendible(v_wo.organization_id, nullif(l.value->>'product_id', '')::integer, v_wo.created_at)
         from jsonb_array_elements(p_lineas) as l(value);
      insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount,
                                     tax_rate, tax_included, discount_amount, notes,
                                     promo_excluded, promo_excluded_by, promo_excluded_at, promo_excluded_reason)
      select v_sale,
             nullif(l.value->>'product_id', '')::integer,
             coalesce((l.value->>'quantity')::numeric, 1),
             coalesce((l.value->>'unit_price')::numeric, 0),
             coalesce((l.value->>'total')::numeric, 0),
             coalesce((l.value->>'tax_amount')::numeric, 0),
             coalesce((l.value->>'tax_rate')::numeric, 0),
             (l.value->>'tax_included')::boolean,
             coalesce((l.value->>'discount_amount')::numeric, 0),
             case when jsonb_typeof(l.value->'notes') = 'object' then l.value->'notes' else null end,
             coalesce((l.value->>'promo_excluded')::boolean, false),
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                       and coalesce(l.value->>'promo_excluded_by', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (l.value->>'promo_excluded_by')::uuid else null end,
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                       and coalesce(l.value->>'promo_excluded_at', '') <> ''
                  then (l.value->>'promo_excluded_at')::timestamptz else null end,
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                  then nullif(left(coalesce(l.value->>'promo_excluded_reason', ''), 240), '') else null end
        from jsonb_array_elements(p_lineas) with ordinality as l(value, ord)
       order by l.ord;
      get diagnostics v_items = row_count;
    elsif exists (select 1 from public.web_order_items i where i.web_order_id = p_order_id) then
      raise exception 'LINEAS_REQUERIDAS' using errcode = '22023',
        detail = 'La venta no tiene líneas y no se enviaron las del pedido.';
    end if;
  end if;
  v_stock := public.fn_pedido_web_confirmar_stock(p_order_id, v_sale, v_user);
  select k.id into v_ticket
    from public.kitchen_tickets k
   where k.ticket_type = 'order'
     and (k.web_order_id = p_order_id or k.sale_id = v_sale)
   order by k.id
   limit 1;
  if v_ticket is null
     and v_wo.status in ('pending', 'confirmed')
     and (v_venta_creada or v_wo.created_at >= now() - interval '48 hours') then
    v_ids := array(select si.id from public.sale_items si where si.sale_id = v_sale);
    if exists (select 1 from public.fn_lineas_a_cocina(v_wo.organization_id, v_ids)) then
      insert into public.kitchen_tickets (organization_id, branch_id, sale_id, web_order_id, table_session_id,
                                          status, priority, estimated_time, source, ticket_type)
      values (v_wo.organization_id, v_wo.branch_id, v_sale, p_order_id, null,
              'new', case when coalesce(v_wo.is_scheduled, false) then 0 else 1 end,
              p_prep_min, 'web', 'order')
      returning id into v_ticket;
      insert into public.kitchen_ticket_items (organization_id, kitchen_ticket_id, sale_item_id, station, notes,
                                               status, product_name, quantity, modifiers)
      select v_wo.organization_id, v_ticket, si.id, c.station,
             nullif(btrim(coalesce(si.notes->>'customer_notes', '')), ''),
             'pending', si.notes->>'product_name', si.quantity,
             case when jsonb_typeof(si.notes->'modifiers') = 'array'
                       and jsonb_array_length(si.notes->'modifiers') > 0
                  then si.notes->'modifiers' else null end
        from public.fn_lineas_a_cocina(v_wo.organization_id, v_ids) c
        join public.sale_items si on si.id = c.sale_item_id
       order by si.created_at, si.id;
      v_comanda_creada := true;
    end if;
  end if;
  if coalesce(p_marcar_confirmado, true) and v_wo.status = 'pending' then
    update public.web_orders set
      status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = coalesce(v_user, confirmed_by),
      payment_status = case when v_pagado then 'paid' else payment_status end,
      estimated_ready_at = case when p_prep_min is not null
                                then now() + make_interval(mins => p_prep_min) else estimated_ready_at end,
      estimated_delivery_at = case when v_wo.delivery_type in ('delivery_own', 'delivery_third_party')
                                        and coalesce(p_transit_min, 0) > 0
                                   then now() + make_interval(mins => coalesce(p_prep_min, 0) + p_transit_min)
                                   else estimated_delivery_at end
     where id = p_order_id;
    v_estado := true;
  end if;
  return jsonb_build_object(
    'sale_id', v_sale,
    'venta_creada', v_venta_creada,
    'items_creados', v_items,
    'kitchen_ticket_id', v_ticket,
    'comanda_creada', v_comanda_creada,
    'estado_actualizado', v_estado,
    'ya_completo', not v_venta_creada and v_items = 0 and not v_comanda_creada and not v_estado
                   and v_wo.status <> 'pending',
    'stock', v_stock);
end;
$function$;

revoke all on function public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean) to authenticated, service_role;

commit;
