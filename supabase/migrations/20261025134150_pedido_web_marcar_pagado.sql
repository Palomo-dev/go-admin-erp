-- Pago manual de pedidos online (spec /producto/pedidos_online_pago_manual_spec.md §a, aprobado por Juan).
-- Caso: Wompi aprobó el pago, pero el webhook no llegó y expire_pending_web_orders dejó el pedido
-- expired/failed y liberó su stock. NO toca datos existentes: solo crea la función y el permiso.
--
-- fn_marcar_pedido_web_pagado(order_id, referencia, metodo, motivo):
--   * Acepta pedidos pending, expired, o cancelled con payment_status='failed' (sin venta).
--   * Si expire_pending_web_orders liberó el stock (stock_released_at), vuelve a reservarlo con
--     reserve_stock_for_web_order (todo o nada). Si no alcanza, devuelve ok=false con los faltantes
--     y NO cambia nada.
--   * Deja el pedido pending/paid con payment_reference y payment_method, y limpia cancelled_*.
--     Registra el pago (payments source='web_order', igual que el webhook de la tienda) y la
--     auditoría (ops_audit_log + internal_notes): usuario, referencia Wompi y motivo.
--   * No exige caja abierta: es un pago en línea. La confirmación (venta, líneas, descuento de
--     stock, comanda, factura) la hace después, en la misma acción del POS, el camino de siempre
--     (fn_confirmar_pedido_web_completo), que ya acepta el pedido porque está pending/paid.
--   * Permiso pos.pedidos_web.marcar_pagado. Mientras nadie lo asigne, también pos.void
--     (admin y gerente lo tienen por rol).

insert into public.permissions (code, module, name, description, category)
values ('pos.pedidos_web.marcar_pagado', 'pos', 'Marcar pedido online como pagado',
        'Reactivar un pedido web vencido o sin confirmar y marcarlo pagado con la referencia del pago en línea (webhook no recibido)', 'pos')
on conflict (code) do nothing;

create or replace function public.fn_marcar_pedido_web_pagado(
  p_order_id uuid,
  p_referencia text,
  p_metodo text default 'wompi',
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_wo public.web_orders%rowtype;
  v_ref text := left(nullif(btrim(coalesce(p_referencia, '')), ''), 200);
  v_metodo text := coalesce(nullif(btrim(coalesce(p_metodo, '')), ''), 'wompi');
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_items jsonb;
  v_reserva jsonb := null;
  v_pago uuid;
  v_moneda text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if v_ref is null or length(v_ref) < 3 then
    raise exception 'REFERENCIA_REQUERIDA' using errcode = '22023',
      hint = 'Escriba la referencia de la transacción en Wompi.';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;

  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not (public.fn_tiene_permiso(v_wo.organization_id, 'pos.pedidos_web.marcar_pagado')
          or public.fn_tiene_permiso(v_wo.organization_id, 'pos.void')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Idempotente: ya pagado, nada que hacer (la confirmación sigue por su camino).
  if v_wo.payment_status = 'paid' and v_wo.status in ('pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered') then
    return jsonb_build_object('ok', true, 'ya_pagado', true, 'order_id', v_wo.id, 'status', v_wo.status);
  end if;

  if not (v_wo.status in ('pending', 'expired')
          or (v_wo.status = 'cancelled' and v_wo.payment_status = 'failed')) then
    raise exception 'PEDIDO_NO_REACTIVABLE' using errcode = '22023',
      detail = 'El pedido está ' || v_wo.status || '/' || coalesce(v_wo.payment_status, '-') || '.';
  end if;
  if v_wo.sale_id is not null or v_wo.table_session_id is not null then
    raise exception 'PEDIDO_CON_VENTA' using errcode = '22023';
  end if;

  -- Stock: la expiración lo liberó → reservar otra vez, todo o nada.
  if v_wo.stock_released_at is not null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = p_order_id and i.product_id is not null and coalesce(i.quantity, 0) > 0;
    if jsonb_array_length(v_items) > 0 then
      v_reserva := public.reserve_stock_for_web_order(v_wo.organization_id, v_wo.branch_id, p_order_id, v_items);
      if not coalesce((v_reserva->>'ok')::boolean, false) then
        return jsonb_build_object('ok', false, 'error', 'STOCK_INSUFICIENTE', 'order_id', v_wo.id,
                                  'shortages', coalesce(v_reserva->'shortages', '[]'::jsonb));
      end if;
    end if;
  end if;

  update public.web_orders set
    status = 'pending',
    payment_status = 'paid',
    payment_method = v_metodo,
    payment_reference = v_ref,
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null,
    stock_released_at = null,
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[PAGO MANUAL ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') || ' COT] ref ' || v_ref
      || ' (' || v_metodo || ') por ' || v_uid::text || ': ' || v_motivo),
    updated_at = now()
  where id = p_order_id;

  -- El pago, como lo deja el webhook de la tienda (source web_order): la confirmación
  -- lo vincula a la factura (webOrderConfirmationService.createPayment).
  select p.id into v_pago from public.payments p
   where p.source = 'web_order' and p.source_id = p_order_id::text and p.status in ('paid', 'completed')
   limit 1;
  if v_pago is null then
    v_moneda := coalesce(
      (select oc.currency_code from public.organization_currencies oc
        where oc.organization_id = v_wo.organization_id order by oc.is_base desc, oc.currency_code limit 1),
      'COP');
    insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency,
                                 reference, status, created_by)
    values (v_wo.organization_id, v_wo.branch_id, 'web_order', p_order_id::text, v_metodo,
            coalesce(v_wo.total, 0), v_moneda, v_ref, 'completed', v_uid)
    returning id into v_pago;
  end if;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
  ) values (
    v_wo.organization_id, v_wo.branch_id, v_uid, 'web_orders', v_wo.id::text, 'MARK_PAID_MANUAL',
    jsonb_build_object('status', v_wo.status, 'payment_status', v_wo.payment_status,
                       'payment_reference', v_wo.payment_reference, 'payment_method', v_wo.payment_method,
                       'cancellation_reason', v_wo.cancellation_reason, 'stock_released_at', v_wo.stock_released_at),
    jsonb_build_object('status', 'pending', 'payment_status', 'paid', 'payment_reference', v_ref,
                       'payment_method', v_metodo),
    jsonb_build_object('referencia_pago', v_ref, 'metodo', v_metodo, 'motivo', v_motivo,
                       'order_number', v_wo.order_number, 'payment_id', v_pago, 'reserva', v_reserva)
  );

  return jsonb_build_object('ok', true, 'ya_pagado', false, 'order_id', v_wo.id,
                            'estado_anterior', v_wo.status, 'payment_id', v_pago,
                            'stock_reservado', v_reserva is not null, 'reserva', v_reserva);
end;
$function$;

revoke all on function public.fn_marcar_pedido_web_pagado(uuid, text, text, text) from public, anon;
grant execute on function public.fn_marcar_pedido_web_pagado(uuid, text, text, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134150', 'pedido_web_marcar_pagado', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
