-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E2 — confirmar un pedido web en UNA transacción
-- idempotente: venta, líneas, stock y comanda.
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, prueba y se
-- deshace con `raise exception`, vía execute_sql, org 140 sede 115):
--   ENSAYO_OK dups_web_previos=0 |
--   c1 (pedido nuevo en efectivo, cajero miembro con sesión) = venta_creada=t
--     items_creados=2 comanda_creada=t estado_actualizado=t ya_completo=f |
--   c2 (reintento) ya_completo=t comanda_creada=f | tickets=1 items_cocina=2
--     source=web notas=[-/Bebida, Bien asado/Plato prep] estado=confirmed
--     facturas_sin_pagar=0 (antes: 23514 invoice_sales_status_check) |
--   c3 (venta huérfana sin ítems, pagado en línea, service role,
--     p_marcar_confirmado=false) venta_creada=f items=2 comanda=t
--     estado_actualizado=f estado=pending (lo marca el servidor tras la
--     factura) |
--   c4 (usuario que no es miembro) = [P0002 WEB_ORDER_NOT_FOUND]: la RLS de
--     web_orders no le deja ver el pedido (no hay fuga de existencia).
--
-- ENSAYO 2 (2026-10-06, tras la revisión: guarda de pedidos avanzados/históricos
-- y regla única fn_lineas_a_cocina; bloque `do` con E1 (CHECK y columnas) y esta
-- migración, deshecho con `raise exception`, org 140 sede 115):
--   ENSAYO_OK c1 (nuevo en efectivo, cajero miembro) = venta_creada=true
--     items=2 comanda=true estado=true tickets=1 items_cocina=1 (solo el
--     plato con estación, la bebida no va a cocina) facturas_sin_pagar=0 |
--   c2 (reintento) ya_completo=true comanda=false |
--   c3 (pedido delivered con comanda del camino anterior, sin web_order_id)
--     comanda=false misma_comanda=t tickets_venta=1 |
--   c4 (delivered sin comanda) comanda=false tickets=0 |
--   c5 (confirmed de hace 3 días, venta con líneas, sin comanda)
--     comanda=false tickets=0 |
--   c6 (huérfano de pasarela en status confirmed, venta sin líneas, service
--     role, p_marcar_confirmado=false) items=2 comanda=true items_cocina=1
--     estado_actualizado=false.
--   Nota: un bloque único con E1+E2+E3 completas (~28 KB) hace que execute_sql
--   agote su tiempo antes de ejecutarse (no es la base: cada paso tarda < 0,2 s).
--   Por eso E2 y E3 se ensayan en bloques separados.
--
-- Problemas que cierra:
-- 1. Los pedidos pagados en línea (webhook → /api/web-orders/[id]/auto-confirm,
--    cron reconcile-web-orders) nunca generaban comanda: solo el botón
--    «Confirmar pedido» del POS la creaba, y desde el navegador.
-- 2. La confirmación no era atómica: `fn_confirmar_pedido_web` crea la venta y
--    los pasos siguientes (líneas, stock, comanda, estado) iban en N llamadas
--    desde Node o el navegador. Si uno fallaba, el pedido quedaba «pendiente»
--    con venta y sin líneas ni comanda PARA SIEMPRE: el reintento recibía
--    `creada=false` y salía sin hacer nada (hoy hay 1 pedido así en producción).
--
-- Qué hace:
-- 1. `kitchen_tickets.web_order_id uuid NULL` → web_orders(id) ON DELETE SET
--    NULL, con índice UNIQUE parcial (web_order_id) WHERE web_order_id IS NOT
--    NULL AND ticket_type = 'order': una sola comanda de pedido por pedido web,
--    aunque el webhook y el cajero confirmen a la vez.
--    NO se usa UNIQUE sobre kitchen_tickets(sale_id) como proponía el plan:
--    verificado por MCP, hay 36 ventas con varias comandas (rondas y ajustes de
--    mesa), así que ese índice no se puede crear y además rompería el POS.
-- 2. `fn_confirmar_pedido_web_completo(p_order_id, p_lineas, p_prep_min,
--    p_transit_min, p_pagado, p_customer_id, p_user_id, p_marcar_confirmado)`,
--    SECURITY INVOKER (RLS del usuario con sesión; con service role la
--    organización sale del propio pedido). En una sola transacción:
--    a. toma el pedido con FOR UPDATE, exige pertenencia (fn_assert_acceso_org)
--       y acceso a la sede si hay sesión, y rechaza pedidos cancelados,
--       rechazados, reembolsados o expirados (PEDIDO_NO_CONFIRMABLE).
--    b. crea o reutiliza la venta con `fn_confirmar_pedido_web` (la misma de
--       siempre: no hay una segunda implementación).
--    c. inserta los `sale_items` SOLO si la venta no tiene ninguno, desde
--       `p_lineas`: las líneas ya calculadas por `webOrderTotals.ts`
--       (repartirTotalesPedidoWeb) en el servidor. El prorrateo de descuentos
--       NO se porta a SQL (regla 7: una sola implementación). Si faltan
--       líneas y el pedido tiene ítems, LINEAS_REQUERIDAS.
--    d. `fn_pedido_web_confirmar_stock` (idempotente por venta).
--    e. crea la comanda si falta, con source='web', la estación, la nota de
--       cada línea, el nombre, la cantidad y los modificadores. «Ya tiene
--       comanda» = una de tipo order con web_order_id = pedido O con
--       sale_id = la venta (las del camino anterior no llevan web_order_id).
--       Solo con el pedido en pending/confirmed y, si la venta no se acaba de
--       crear, solo para pedidos de las últimas 48 h: un reintento de webhook
--       sobre un pedido ya en preparing/ready/delivered o histórico no manda
--       nada a Comandas. Qué líneas van a cocina lo decide
--       `fn_lineas_a_cocina` (nueva aquí, la usa también E3): las preparables
--       (requires_preparation o estación); si no hay ninguna y la organización
--       es restaurante, todas; en las demás verticales, sin preparables no hay
--       comanda.
--    f. si p_marcar_confirmado y el pedido sigue en 'pending': status
--       'confirmed', confirmed_at/by, estimated_ready_at y, si es domicilio,
--       estimated_delivery_at. Con pago en línea el servidor pasa
--       p_marcar_confirmado=false, crea la factura y luego marca el estado
--       (así `trg_auto_journal_web_order` no crea la factura «WEB-…» vacía).
--    Devuelve `{sale_id, venta_creada, items_creados, kitchen_ticket_id,
--    comanda_creada, estado_actualizado, ya_completo, stock}`. `ya_completo`
--    = no había nada que hacer: el pedido ya estaba confirmado completo.
--    Un pedido «Comer aquí» ya agregado a una mesa (table_session_id) no pasa
--    por aquí: devuelve ya_completo con su sesión (lo hace E3).
--
-- 3. La corrección de `fn_auto_journal_web_order` (confirmar sin pagar fallaba con 23514 por
--    `invoice_sales.status = 'confirmed'`) que iba aquí se separó y YA ESTÁ APLICADA:
--    supabase/migrations/20261006114659_auto_journal_web_order_sin_pagar.sql (2026-10-06).
--    Esta migración ya no la toca.
--
-- Interruptor de despliegue (en el ERP, no aquí): el código llama a esta RPC
-- solo con NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA=true. Sin él, o si la
-- función no existe todavía (PGRST202/42883), sigue el camino actual.
--
-- Backfill: NINGUNO automático. Para los pedidos del día confirmados sin
-- comanda en organizaciones de restaurante, basta con «Confirmar» de nuevo en
-- Pedidos online (la RPC completa lo que falte). Nunca los 718 históricos.

alter table public.kitchen_tickets
  add column if not exists web_order_id uuid null
    references public.web_orders(id) on delete set null;

comment on column public.kitchen_tickets.web_order_id is
  'Pedido web del que nace la comanda (source=web). Una sola comanda de tipo order por pedido (uq_kitchen_tickets_web_order).';

create unique index if not exists uq_kitchen_tickets_web_order
  on public.kitchen_tickets (web_order_id)
  where web_order_id is not null and ticket_type = 'order';

-- Regla ÚNICA de qué líneas van a cocina (la usan E2 y E3, pos_mesa_agregar_pedido_web):
-- las que el POS manda (PedidosService.agregarProductos: categoría con
-- requires_preparation o con estación efectiva). Si ninguna lo es y la
-- organización es de restaurante (type_id=1), todas (lo que hacía el botón
-- «Confirmar» hasta hoy). En las demás verticales, sin preparables no hay
-- líneas: no hay comanda. SECURITY INVOKER: la RLS de sale_items sigue
-- aplicando a quien llama.
create or replace function public.fn_lineas_a_cocina(
  p_organization_id integer,
  p_sale_item_ids uuid[]
)
returns table (sale_item_id uuid, station text)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $f$
  with lineas as (
    select si.id,
           nullif(coalesce(e.station, ''), '') as station,
           coalesce(e.requires_preparation, false) or coalesce(e.station, '') <> '' as preparable
      from public.sale_items si
      left join public.fn_estaciones_efectivas(
             p_organization_id,
             array(select distinct s2.product_id from public.sale_items s2
                    where s2.id = any(p_sale_item_ids) and s2.product_id is not null)
           ) e on e.product_id = si.product_id
     where si.id = any(p_sale_item_ids)
  ),
  hay as (select bool_or(preparable) as alguna from lineas),
  rest as (select coalesce((select o.type_id = 1 from public.organizations o where o.id = p_organization_id), false) as es)
  select l.id, l.station
    from lineas l, hay, rest
   where (coalesce(hay.alguna, false) and l.preparable)
      or (not coalesce(hay.alguna, false) and rest.es)
$f$;

comment on function public.fn_lineas_a_cocina(integer, uuid[]) is
  'Líneas de venta que van a cocina, con su estación: las preparables (requires_preparation o estación). Si no hay ninguna y la organización es restaurante, todas. Regla única de E2 (confirmación web) y E3 (pedido web a la mesa).';

revoke all on function public.fn_lineas_a_cocina(integer, uuid[]) from public, anon;
grant execute on function public.fn_lineas_a_cocina(integer, uuid[]) to authenticated, service_role;

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

  -- «Comer aquí» ya agregado a una mesa: lo gestiona pos_mesa_agregar_pedido_web.
  if v_wo.table_session_id is not null then
    return jsonb_build_object('sale_id', v_wo.sale_id, 'ya_completo', true,
                              'table_session_id', v_wo.table_session_id);
  end if;

  v_user := coalesce(auth.uid(), p_user_id);
  v_pagado := coalesce(p_pagado, v_wo.payment_status = 'paid');

  -- b · Venta (una sola por pedido: ADR-CC-011)
  v_conf := public.fn_confirmar_pedido_web(p_order_id, p_customer_id, v_user, v_pagado);
  v_sale := (v_conf->>'sale_id')::uuid;
  v_venta_creada := coalesce((v_conf->>'creada')::boolean, false);

  -- c · Líneas, solo si la venta no tiene ninguna
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

  -- d · Stock (descuento con receta, liberar la reserva, seriales): idempotente por venta
  v_stock := public.fn_pedido_web_confirmar_stock(p_order_id, v_sale, v_user);

  -- e · Comanda, si falta y si el pedido no avanzó.
  --     «Ya tiene comanda» = una de tipo order enlazada al pedido (web_order_id)
  --     o a su venta (las del camino anterior, que no llevan web_order_id).
  --     Solo se crea con el pedido en pending/confirmed, y si la venta no se
  --     acaba de crear, solo para pedidos de las últimas 48 h: un reintento de
  --     webhook sobre un pedido histórico o ya en preparing/ready/delivered no
  --     manda nada nuevo a Comandas.
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

  -- f · Estado
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

comment on function public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean) is
  'Confirma un pedido web en una transacción idempotente: venta (fn_confirmar_pedido_web), líneas ya calculadas (p_lineas), stock (fn_pedido_web_confirmar_stock), comanda source=web y estado. Reintentar completa lo que falte.';

revoke all on function public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean) to authenticated, service_role;
