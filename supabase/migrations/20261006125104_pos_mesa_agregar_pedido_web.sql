-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E3 — el pedido «Comer aquí» (QR de mesa) entra a la
-- cuenta de la mesa en POS › Mesas, con su comanda.
-- Requiere E1 (web_orders.restaurant_table_id / table_session_id) y E2
-- (kitchen_tickets.web_order_id y fn_lineas_a_cocina).
--
-- ENSAYO (2026-10-07, bloque `do` que aplica E1+E2 (columnas) y esta
-- migración, prueba como `authenticated` miembro de la org 140 y se deshace con
-- `raise exception`, vía execute_sql, Mesa 2 de la sede 115):
--   ENSAYO_OK r1={mesa: Mesa 2, ya_completo: false, sesion_creada: true,
--   items_agregados: 2, kitchen_ticket_id: …} | r2 (segundo pedido a la misma
--   mesa) sesion_creada=false misma_sesion=t | r3 (reintento) ya_completo=true
--   | mesa=occupied items_cuenta=4 total_cuenta=60000.00 comandas_web=2 |
--   pedidos(status:sesion:sale_null)=confirmed:true:true,confirmed:true:true |
--   pagado_en_linea=[PEDIDO_PAGADO_EN_LINEA] | pickup=[NO_ES_PEDIDO_DE_MESA] |
--   no_miembro=[42501 Acceso denegado a la organización]
--
-- ENSAYO 2 (2026-10-06, con la regla única fn_lineas_a_cocina de E2; bloque
-- `do` con E1 (CHECK y columnas), kitchen_tickets.web_order_id y
-- fn_lineas_a_cocina de E2 y esta migración, como `authenticated` miembro de
-- la org 140, Mesa 2 de la sede 115, deshecho con `raise exception`):
--   ENSAYO_OK f (plato + bebida) sesion_creada=true items_agregados=2
--   items_cocina=1 (solo el preparable) | g (solo bebida, misma mesa)
--   misma_sesion=t items_cocina=1 (restaurante sin preparables: todas) |
--   reintento f ya_completo=true | lineas_en_cuenta=3 | la misma regla en una
--   organización que no es restaurante: lineas_a_cocina=0 (sin comanda).
--
-- Problema: no había ningún enlace entre web_orders y table_sessions. Un pedido
-- hecho desde el QR de la mesa no aparecía en POS › Mesas, no sumaba a la
-- cuenta de la mesa y su comanda (si la había) no decía qué mesa era.
--
-- Qué hace `pos_mesa_agregar_pedido_web(p_order_id, p_lineas, p_prep_min,
-- p_user_id)`, en una transacción:
-- 1. Toma el pedido con FOR UPDATE. Exige pertenencia (fn_assert_acceso_org) y
--    acceso a la sede si hay sesión. Solo pedidos dine_in con mesa
--    (NO_ES_PEDIDO_DE_MESA), no cancelados/rechazados/expirados, y SIN pagar
--    en línea (PEDIDO_PAGADO_EN_LINEA): lo pagado por pasarela no puede entrar a
--    la cuenta de la mesa, porque se cobraría dos veces al cerrarla. Ese caso
--    va por fn_confirmar_pedido_web_completo (venta propia) y la comanda lleva
--    la mesa por web_order_id.
-- 2. Idempotente: si el pedido ya tiene table_session_id devuelve ya_completo.
--    Si ya tiene venta propia (lo confirmó otro camino) PEDIDO_YA_TIENE_VENTA.
-- 3. Busca la sesión activa de la mesa (active/bill_requested) o la abre con la
--    misma lógica de MesasService.iniciarSesion: mesero = quien confirma
--    (o p_user_id / el creador de la organización sin sesión), mesa
--    `occupied`. La venta de la sesión se crea si falta, igual que
--    agregarProductos (pending, sin totales).
-- 4. Agrega las líneas del pedido (p_lineas, ya calculadas en el servidor con
--    webOrderTotals: nada de prorrateo en SQL) a la venta de la sesión y
--    recalcula con fn_pos_recalcular_venta (la regla única de la línea).
-- 5. Stock: SOLO libera la reserva del pedido (fn_inv_int_liberar). El
--    descuento lo hace el cobro de la mesa (pos_checkout_v1 'settle' →
--    'mesa_sale' sobre TODAS las líneas de la cuenta): descontarlo aquí como
--    'web_sale' lo descontaría dos veces.
-- 6. Comanda con table_session_id, web_order_id, source='web' y la nota de
--    cada línea, solo con las líneas que van a cocina según
--    `fn_lineas_a_cocina` (E2): la misma regla que el POS y la confirmación
--    web. Sin líneas para cocina, sin comanda.
-- 7. web_orders: table_session_id, status 'confirmed', confirmed_at/by,
--    estimated_ready_at. sale_id queda NULL a propósito: la venta es la de la
--    mesa (compartida) y así `trg_auto_journal_web_order` no le crea factura.
--
-- SECURITY DEFINER porque usa fn_inv_int_liberar y fn_pos_recalcular_venta
-- (concedidas solo a service_role). Lleva su guarda de pertenencia y de sede y
-- su REVOKE de anon/public en esta misma migración.

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

  -- Sesión activa de la mesa, o una nueva (MesasService.iniciarSesion)
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

  -- Venta de la sesión (PedidosService.agregarProductos)
  if v_sale is null then
    insert into public.sales (organization_id, branch_id, customer_id, user_id, status, payment_status,
                              total, subtotal, tax_total, discount_total, table_session_id)
    values (v_wo.organization_id, v_wo.branch_id, v_wo.customer_id,
            (select ts.server_id from public.table_sessions ts where ts.id = v_sesion),
            'pending', 'pending', 0, 0, 0, 0, v_sesion)
    returning id into v_sale;
    update public.table_sessions set sale_id = v_sale, updated_at = now() where id = v_sesion;
  end if;

  -- Líneas del pedido en la cuenta de la mesa
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

  -- Stock: solo liberar la reserva del pedido (el cobro de la mesa descuenta)
  if v_wo.stock_released_at is null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
      into v_items
      from public.web_order_items i
     where i.web_order_id = p_order_id and i.product_id is not null;
    perform public.fn_inv_int_liberar(v_wo.organization_id, p_order_id::text, 'pos_mesa_agregar_pedido_web',
                                      v_wo.branch_id, v_items, false);
  end if;

  -- Comanda de la mesa: solo las líneas que van a cocina, con la regla única
  -- de E2 (fn_lineas_a_cocina, la misma de la confirmación web). Si ninguna
  -- va a cocina (p. ej. solo bebidas empacadas fuera de restaurante), no hay
  -- comanda.
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

comment on function public.pos_mesa_agregar_pedido_web(uuid, jsonb, integer, uuid) is
  'Agrega un pedido web «Comer aquí» (sin pagar en línea) a la cuenta de su mesa: busca o abre la sesión, agrega las líneas, recalcula, libera la reserva y crea la comanda con la mesa. Idempotente por web_orders.table_session_id.';

revoke all on function public.pos_mesa_agregar_pedido_web(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.pos_mesa_agregar_pedido_web(uuid, jsonb, integer, uuid) to authenticated, service_role;
