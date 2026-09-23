-- F-63 / ADR-CC-011 · Un pedido web se confirma una sola vez
--
-- Dos caminos confirman un pedido web: el servidor (webhook de Wompi, cron de
-- reconciliación, /api/web-orders/[id]/auto-confirm) y el botón «Confirmar
-- pedido» de Pedidos online. Ambos leían el pedido, miraban sale_id y creaban
-- la venta: leer y luego escribir, sin bloqueo. El 2026-09-23 corrieron a la
-- vez sobre el mismo pedido de la org 145 y crearon dos ventas, dos facturas,
-- dos pagos y dos salidas de stock.
--
-- 1. fn_confirmar_pedido_web: el único punto que crea la venta de un pedido
--    web. Toma el pedido con SELECT ... FOR UPDATE; si ya tiene venta la
--    devuelve con creada = false y no crea nada. El segundo en llegar espera
--    el bloqueo y recibe la venta del primero.
-- 2. Red estructural: sales.web_order_id con índice único parcial (una sola
--    venta viva por pedido), aunque alguien inserte la venta por otro camino.

alter table public.sales
  add column if not exists web_order_id uuid references public.web_orders(id);

comment on column public.sales.web_order_id is
  'Pedido web que originó la venta. Una sola venta no anulada por pedido (uq_sales_web_order_viva). Ver ADR-CC-011.';

-- Relleno desde web_orders.sale_id. Sin el disparador de devengo: la
-- actualización no es un hecho económico y no debe crear asientos.
alter table public.sales disable trigger trg_auto_journal_sale_pos;

update public.sales s
   set web_order_id = w.id
  from public.web_orders w
 where w.sale_id = s.id
   and s.web_order_id is null;

-- La venta anulada por F-63 conserva el rastro de su pedido.
update public.sales
   set web_order_id = '55f2db58-6d1c-470d-8848-98804f4c62df'
 where id = '49a36944-4d95-4701-b6b1-7c78a6bd0de4'
   and status = 'void'
   and web_order_id is null;

alter table public.sales enable trigger trg_auto_journal_sale_pos;

create unique index if not exists uq_sales_web_order_viva
  on public.sales (web_order_id)
  where web_order_id is not null and status <> 'void';

create or replace function public.fn_confirmar_pedido_web(
  p_order_id uuid,
  p_customer_id uuid default null,
  p_user_id uuid default null,
  p_pagado boolean default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wo public.web_orders%rowtype;
  v_sale uuid;
  v_user uuid;
  v_customer uuid;
  v_pagado boolean;
begin
  -- Con sesión, RLS de web_orders limita el pedido a la organización del
  -- usuario; sin sesión (service_role) la organización sale del propio pedido.
  select * into v_wo from public.web_orders where id = p_order_id for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_wo.sale_id is not null then
    return jsonb_build_object('sale_id', v_wo.sale_id, 'creada', false);
  end if;

  select id into v_sale
    from public.sales
   where web_order_id = p_order_id and status <> 'void'
   limit 1;
  if v_sale is not null then
    update public.web_orders set sale_id = v_sale where id = p_order_id;
    return jsonb_build_object('sale_id', v_sale, 'creada', false);
  end if;

  -- El usuario de la sesión manda; p_user_id solo sirve sin sesión.
  v_user := coalesce(auth.uid(), p_user_id);
  if v_user is null then
    raise exception 'USER_REQUIRED' using errcode = '22023';
  end if;

  v_customer := coalesce(p_customer_id, v_wo.customer_id);
  if v_customer is not null and not exists (
      select 1 from public.customers
       where id = v_customer and organization_id = v_wo.organization_id) then
    raise exception 'CUSTOMER_NOT_IN_ORG' using errcode = '42501';
  end if;

  v_pagado := coalesce(p_pagado, v_wo.payment_status = 'paid');

  insert into public.sales (
    organization_id, branch_id, customer_id, user_id, sale_date,
    total, subtotal, tax_total, discount_total, delivery_fee, tip_amount,
    balance, status, payment_status, source, include_in_cash_register, notes,
    web_order_id
  ) values (
    v_wo.organization_id, v_wo.branch_id, v_customer, v_user, coalesce(v_wo.created_at, now()),
    coalesce(v_wo.total, 0), coalesce(v_wo.subtotal, 0), coalesce(v_wo.tax_total, 0),
    coalesce(v_wo.discount_total, 0), coalesce(v_wo.delivery_fee, 0), coalesce(v_wo.tip_amount, 0),
    case when v_pagado then 0 else coalesce(v_wo.total, 0) end,
    case when v_pagado then 'paid' else 'pending' end,
    case when v_pagado then 'paid' else 'pending' end,
    'web', false, 'Pedido web: ' || v_wo.order_number,
    p_order_id
  )
  returning id into v_sale;

  update public.web_orders set sale_id = v_sale where id = p_order_id;

  return jsonb_build_object('sale_id', v_sale, 'creada', true);
end;
$$;

comment on function public.fn_confirmar_pedido_web(uuid, uuid, uuid, boolean) is
  'Único punto que crea la venta de un pedido web. FOR UPDATE sobre el pedido; si ya tiene venta la devuelve con creada=false. ADR-CC-011.';

revoke all on function public.fn_confirmar_pedido_web(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_confirmar_pedido_web(uuid, uuid, uuid, boolean) to authenticated, service_role;
