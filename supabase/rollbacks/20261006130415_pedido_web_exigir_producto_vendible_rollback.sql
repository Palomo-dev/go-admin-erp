-- Reversión de 20261006130415_pedido_web_exigir_producto_vendible: vuelve a las
-- definiciones vivas antes del cambio (cuerpos con md5 1c3fda06c3280612e28f356531c63eff y
-- 73a99edea289fd39fc08d0215011da18, idénticos a los aplicados en 20261006124814 y
-- 20261006125104). Firma, seguridad y permisos no cambian.

create or replace function public.fn_confirmar_pedido_web_completo(
  p_order_id uuid,
  p_lineas jsonb default null,
  p_prep_min integer default null,
  p_transit_min integer default null,
  p_pagado boolean default null,
  p_customer_id uuid default null,
  p_user_id uuid default null,
  p_marcar_confirmado boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $f$
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
begin
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
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
      insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount,
                                     tax_rate, tax_included, discount_amount, notes)
      select v_sale,
             nullif(l.value->>'product_id', '')::integer,
             coalesce((l.value->>'quantity')::numeric, 1),
             coalesce((l.value->>'unit_price')::numeric, 0),
             coalesce((l.value->>'total')::numeric, 0),
             coalesce((l.value->>'tax_amount')::numeric, 0),
             coalesce((l.value->>'tax_rate')::numeric, 0),
             (l.value->>'tax_included')::boolean,
             coalesce((l.value->>'discount_amount')::numeric, 0),
             case when jsonb_typeof(l.value->'notes') = 'object' then l.value->'notes' else null end
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
$f$;

create or replace function public.pos_mesa_agregar_pedido_web(
  p_order_id uuid,
  p_lineas jsonb,
  p_prep_min integer default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_wo public.web_orders%rowtype;
  v_mesa public.restaurant_tables%rowtype;
  v_sesion uuid;
  v_sale uuid;
  v_sesion_creada boolean := false;
  v_mesero uuid;
  v_ids uuid[];
  v_ticket integer;
  v_items jsonb;
begin
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_wo.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_wo.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(v_wo.delivery_type, '') <> 'dine_in' or v_wo.restaurant_table_id is null then
    raise exception 'NO_ES_PEDIDO_DE_MESA' using errcode = '22023';
  end if;
  if v_wo.status in ('cancelled', 'rejected', 'refunded', 'expired') then
    raise exception 'PEDIDO_NO_CONFIRMABLE' using errcode = '22023';
  end if;
  if v_wo.table_session_id is not null then
    return jsonb_build_object('ya_completo', true, 'table_session_id', v_wo.table_session_id);
  end if;
  if v_wo.payment_status = 'paid' then
    raise exception 'PEDIDO_PAGADO_EN_LINEA' using errcode = '22023';
  end if;
  if v_wo.sale_id is not null then
    raise exception 'PEDIDO_YA_TIENE_VENTA' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = '22023';
  end if;
  select * into v_mesa from public.restaurant_tables
   where id = v_wo.restaurant_table_id
     and organization_id = v_wo.organization_id
     and branch_id = v_wo.branch_id
   for update;
  if not found then
    raise exception 'MESA_INVALIDA' using errcode = '23514';
  end if;
  v_mesero := coalesce(auth.uid(), p_user_id,
                       (select o.created_by from public.organizations o where o.id = v_wo.organization_id));
  if v_mesero is null then
    raise exception 'USER_REQUIRED' using errcode = '22023';
  end if;
  select ts.id, ts.sale_id into v_sesion, v_sale
    from public.table_sessions ts
   where ts.restaurant_table_id = v_mesa.id
     and ts.organization_id = v_wo.organization_id
     and ts.status in ('active', 'bill_requested')
   order by ts.opened_at desc
   limit 1
   for update;
  if v_sesion is null then
    insert into public.table_sessions (organization_id, restaurant_table_id, branch_id, server_id, customers, status, notes)
    values (v_wo.organization_id, v_mesa.id, v_wo.branch_id, v_mesero, 1, 'active',
            'Abierta por el pedido web ' || v_wo.order_number)
    returning id into v_sesion;
    update public.restaurant_tables set state = 'occupied', updated_at = now() where id = v_mesa.id;
    v_sesion_creada := true;
  end if;
  if v_sale is null then
    insert into public.sales (organization_id, branch_id, customer_id, user_id, status, payment_status,
                              total, subtotal, tax_total, discount_total, table_session_id)
    values (v_wo.organization_id, v_wo.branch_id, v_wo.customer_id,
            (select ts.server_id from public.table_sessions ts where ts.id = v_sesion),
            'pending', 'pending', 0, 0, 0, 0, v_sesion)
    returning id into v_sale;
    update public.table_sessions set sale_id = v_sale, updated_at = now() where id = v_sesion;
  end if;
  with nuevas as (
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount,
                                   tax_rate, tax_included, discount_amount, notes)
    select v_sale,
           nullif(l.value->>'product_id', '')::integer,
           coalesce((l.value->>'quantity')::numeric, 1),
           coalesce((l.value->>'unit_price')::numeric, 0),
           coalesce((l.value->>'total')::numeric, 0),
           coalesce((l.value->>'tax_amount')::numeric, 0),
           coalesce((l.value->>'tax_rate')::numeric, 0),
           (l.value->>'tax_included')::boolean,
           coalesce((l.value->>'discount_amount')::numeric, 0),
           coalesce(case when jsonb_typeof(l.value->'notes') = 'object' then l.value->'notes' end, '{}'::jsonb)
             || jsonb_build_object('from_web_order', v_wo.order_number)
      from jsonb_array_elements(p_lineas) with ordinality as l(value, ord)
     order by l.ord
    returning id
  )
  select array_agg(id) into v_ids from nuevas;
  perform public.fn_pos_recalcular_venta(v_sale);
  if v_wo.stock_released_at is null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = p_order_id and i.product_id is not null;
    perform public.fn_inv_int_liberar(v_wo.organization_id, p_order_id::text, 'pos_mesa_agregar_pedido_web',
                                      v_wo.branch_id, v_items, false);
  end if;
  if exists (select 1 from public.fn_lineas_a_cocina(v_wo.organization_id, v_ids)) then
    insert into public.kitchen_tickets (organization_id, branch_id, sale_id, web_order_id, table_session_id,
                                        status, priority, estimated_time, source, ticket_type)
    values (v_wo.organization_id, v_wo.branch_id, v_sale, p_order_id, v_sesion,
            'new', 1, p_prep_min, 'web', 'order')
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
  end if;
  update public.web_orders set
    table_session_id = v_sesion,
    status = case when status = 'pending' then 'confirmed' else status end,
    confirmed_at = coalesce(confirmed_at, now()),
    confirmed_by = coalesce(confirmed_by, auth.uid(), p_user_id),
    stock_released_at = coalesce(stock_released_at, now()),
    estimated_ready_at = case when p_prep_min is not null
                              then now() + make_interval(mins => p_prep_min) else estimated_ready_at end
   where id = p_order_id;
  return jsonb_build_object(
    'ya_completo', false,
    'table_session_id', v_sesion,
    'sesion_creada', v_sesion_creada,
    'sale_id', v_sale,
    'items_agregados', coalesce(cardinality(v_ids), 0),
    'kitchen_ticket_id', v_ticket,
    'mesa', v_mesa.name);
end;
$f$;
