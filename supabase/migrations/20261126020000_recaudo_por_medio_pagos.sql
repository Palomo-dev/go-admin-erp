-- Recaudo por medio de pago (Figma «05 POS y ventas» 3300-420477, aprobado el 2026-11-25).
--
-- Una sola lectura para las cuatro pantallas que muestran lo que ENTRÓ por cada medio:
-- Pedidos online, Todas las ventas, Finanzas › Movimientos/Ingresos/Egresos, Procesadores de
-- pago › Cobros y el reporte «Recaudo por medio de pago».
--
-- Devuelve los pagos aprobados y no anulados del rango (por `payment_date`, o `created_at` si
-- falta) con los datos crudos que la app necesita para clasificarlos: el medio (método,
-- procesador y las rutas de `processor_response` que ya lee `pasarelaDelPago`) y, si el pago es
-- de un pedido web, el pedido (por el propio pago `source = 'web_order'` o por la factura de su
-- venta). La CLASIFICACIÓN (pago completo, anticipo de contraentrega, cobro en puerta, venta en
-- tienda) la hace `src/lib/finanzas/recaudo/recaudoPorMedio.ts` con las reglas que ya existen
-- (`esPedidoContraentrega`, `pasarelaDelPago`): aquí no se duplica ninguna regla.
--
-- SECURITY INVOKER: lee con la sesión, así que RLS de `payments`, `invoice_sales` y
-- `web_orders` (pertenencia y acceso por sede) decide qué filas ve cada persona. Nunca devuelve
-- la respuesta completa del procesador (lleva datos del pagador), solo cuatro rutas.
-- Aditiva: un índice parcial nuevo y una función nueva; no cambia tablas ni datos.

create index if not exists idx_web_orders_sale_id
  on public.web_orders (sale_id)
  where sale_id is not null;

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

comment on function public.fn_recaudo_pagos(integer, timestamptz, timestamptz, integer) is
  'Pagos aprobados y no anulados del rango con su medio y su pedido web (si lo hay). Lectura cruda: la clasificación vive en recaudoPorMedio.ts. SECURITY INVOKER: manda RLS.';

revoke all on function public.fn_recaudo_pagos(integer, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_recaudo_pagos(integer, timestamptz, timestamptz, integer) to authenticated, service_role;
