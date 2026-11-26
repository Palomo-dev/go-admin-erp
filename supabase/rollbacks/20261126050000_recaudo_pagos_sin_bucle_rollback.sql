-- Reversión de 20261126050000: vuelve a la versión de 20261126020000 (la del bucle por fila).
-- No toca datos.
create or replace function public.fn_recaudo_pagos(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer default null
)
returns table (
  pago_id uuid,
  fecha timestamptz,
  branch_id integer,
  origen text,
  metodo text,
  procesador text,
  pasarela_manual text,
  bold_metodo text,
  wompi_tipo text,
  mp_metodo text,
  monto numeric,
  referencia text,
  cuenta_bancaria_id integer,
  venta_id uuid,
  factura_numero text,
  pedido_id uuid,
  pedido_numero text,
  pedido_estado text,
  pedido_estado_pago text,
  pedido_metodo text,
  pedido_referencia text,
  pedido_entrega text,
  pedido_anticipo numeric,
  pedido_anticipo_estado text,
  pedido_total numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    coalesce(p.payment_date, p.created_at),
    p.branch_id,
    p.source,
    p.method,
    p.processor,
    p.processor_response ->> 'pasarela',
    case when jsonb_typeof(p.processor_response -> 'payment_method') = 'string'
         then p.processor_response ->> 'payment_method' end,
    p.processor_response ->> 'payment_method_type',
    p.processor_response ->> 'payment_method_id',
    p.amount,
    p.reference,
    p.bank_account_id,
    i.sale_id,
    i.number,
    w.id,
    w.order_number,
    w.status,
    w.payment_status,
    w.payment_method,
    w.payment_reference,
    w.delivery_type,
    w.advance_amount,
    w.advance_status,
    w.total
  from public.payments p
  left join public.invoice_sales i
    on p.source = 'invoice_sales'
   and i.id::text = p.source_id
   and i.organization_id = p.organization_id
  left join lateral (
    select wo.*
      from public.web_orders wo
     where wo.organization_id = p.organization_id
       and ((p.source = 'web_order' and wo.id::text = p.source_id)
            or (p.source = 'invoice_sales' and i.sale_id is not null and wo.sale_id = i.sale_id))
     limit 1
  ) w on true
  where p.organization_id = p_organization_id
    and p.voided_at is null
    and p.status in ('completed', 'approved', 'paid')
    and coalesce(p.payment_date, p.created_at) >= p_desde
    and coalesce(p.payment_date, p.created_at) <= p_hasta
    and (p_branch_id is null or p.branch_id = p_branch_id)
  order by coalesce(p.payment_date, p.created_at), p.id
$$;
