-- fn_recaudo_pagos sin bucle por fila (2026-11-25).
--
-- Síntoma: «No se pudo leer el recaudo» en Todas las ventas, Pedidos online, Finanzas y el reporte
-- «Recaudo por medio de pago». Con la sesión de un usuario (RLS activa), un mes de una
-- organización con ~800 pagos tardaba 112 s y el PostgREST la cortaba por statement_timeout.
--
-- Causa: el planificador estimaba 1 fila en `payments` y resolvía las uniones como bucles
-- anidados: por cada pago releía TODAS las facturas de la organización (con `app_branch_access`
-- de RLS evaluada fila a fila) y, en el `lateral`, todos sus pedidos web. Las uniones por
-- `id::text = source_id` no pueden usar índice.
--
-- Arreglo: el mismo resultado, columna por columna, leyendo cada tabla UNA vez en CTE
-- materializados (pagos del rango → sus facturas → sus pedidos) y uniéndolos por hash. Con la
-- misma sesión baja a menos de 1 s. Sigue siendo SECURITY INVOKER (manda RLS); la firma, las
-- columnas y los permisos no cambian (`create or replace` conserva el ACL).

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
  with pg as materialized (
    select p.id, coalesce(p.payment_date, p.created_at) as fecha, p.branch_id, p.source, p.source_id,
           p.method, p.processor, p.processor_response, p.amount, p.reference, p.bank_account_id
      from public.payments p
     where p.organization_id = p_organization_id
       and p.voided_at is null
       and p.status in ('completed', 'approved', 'paid')
       and coalesce(p.payment_date, p.created_at) >= p_desde
       and coalesce(p.payment_date, p.created_at) <= p_hasta
       and (p_branch_id is null or p.branch_id = p_branch_id)
  ),
  fa as materialized (
    select i.id::text as id_txt, i.sale_id, i.number
      from public.invoice_sales i
     where i.organization_id = p_organization_id
       and i.id::text in (select pg.source_id from pg where pg.source = 'invoice_sales')
  ),
  wo as materialized (
    select w.id, w.sale_id, w.order_number, w.status, w.payment_status, w.payment_method,
           w.payment_reference, w.delivery_type, w.advance_amount, w.advance_status, w.total
      from public.web_orders w
     where w.organization_id = p_organization_id
       and (w.id::text in (select pg.source_id from pg where pg.source = 'web_order')
            or w.sale_id in (select fa.sale_id from fa where fa.sale_id is not null))
  ),
  -- Un pedido por venta (el `limit 1` del lateral de antes).
  wo_venta as materialized (
    select distinct on (wo.sale_id) wo.*
      from wo
     where wo.sale_id is not null
     order by wo.sale_id, wo.id
  )
  select
    pg.id,
    pg.fecha,
    pg.branch_id,
    pg.source,
    pg.method,
    pg.processor,
    pg.processor_response ->> 'pasarela',
    case when jsonb_typeof(pg.processor_response -> 'payment_method') = 'string'
         then pg.processor_response ->> 'payment_method' end,
    pg.processor_response ->> 'payment_method_type',
    pg.processor_response ->> 'payment_method_id',
    pg.amount,
    pg.reference,
    pg.bank_account_id,
    fa.sale_id,
    fa.number,
    coalesce(w1.id, w2.id),
    coalesce(w1.order_number, w2.order_number),
    coalesce(w1.status, w2.status),
    coalesce(w1.payment_status, w2.payment_status),
    coalesce(w1.payment_method, w2.payment_method),
    coalesce(w1.payment_reference, w2.payment_reference),
    coalesce(w1.delivery_type, w2.delivery_type),
    case when w1.id is not null then w1.advance_amount else w2.advance_amount end,
    case when w1.id is not null then w1.advance_status else w2.advance_status end,
    case when w1.id is not null then w1.total else w2.total end
  from pg
  left join fa on pg.source = 'invoice_sales' and fa.id_txt = pg.source_id
  left join wo w1 on pg.source = 'web_order' and w1.id::text = pg.source_id
  left join wo_venta w2 on pg.source = 'invoice_sales' and fa.sale_id is not null and w2.sale_id = fa.sale_id
  order by pg.fecha, pg.id
$$;

comment on function public.fn_recaudo_pagos(integer, timestamptz, timestamptz, integer) is
  'Pagos aprobados y no anulados del rango con su medio y su pedido web (si lo hay). Lectura cruda: la clasificación vive en recaudoPorMedio.ts. SECURITY INVOKER: manda RLS. Cada tabla se lee una vez (CTE materializados).';
