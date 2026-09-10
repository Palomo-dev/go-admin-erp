-- ============================================================
-- ROLLBACK de 20260911010000_web_facturas_descuento_pedido_prorrateado
-- ============================================================
-- La migración solo transforma filas (no cambia estructura). Este rollback
-- devuelve las líneas al estado anterior: quita el descuento prorrateado de
-- `invoice_items` y `sale_items` de las facturas web que lo recibieron. El
-- trigger `fn_recalc_invoice_totals` vuelve a subir el total y el balance y
-- `tr_update_account_receivable` vuelve a dejar la cuenta por cobrar con el
-- saldo fantasma; es decir, **reabre el bug** que la migración corrige. Solo
-- tiene sentido si el prorrateo resultó incorrecto para alguna factura.
--
-- Criterio de selección: mismas ventas web pagadas cuyo descuento de pedido
-- coincide con la suma de descuentos de sus líneas de producto (estado que
-- deja la migración) y cuyas líneas de `web_order_items` siguen en 0 (prueba
-- de que el descuento no venía de origen en las líneas).
-- ============================================================

begin;

do $$
declare
  f record;
begin
  for f in
    select i.id as invoice_id, i.sale_id, i.number
    from invoice_sales i
    join sales s on s.id = i.sale_id
    join web_orders w on w.sale_id = s.id
    where s.source = 'web'
      and s.payment_status = 'paid'
      and s.discount_total > 0
      and s.discount_total = (select coalesce(sum(coalesce(ii.discount_amount, 0)), 0)
                                from invoice_items ii where ii.invoice_sales_id = i.id)
      and 0 = (select coalesce(sum(coalesce(wi.discount_amount, 0)), 0)
                 from web_order_items wi where wi.web_order_id = w.id)
  loop
    update invoice_items
       set total_line = total_line + coalesce(discount_amount, 0),
           discount_amount = 0,
           updated_at = now()
     where invoice_sales_id = f.invoice_id and product_id is not null;

    update sale_items
       set total = total + coalesce(discount_amount, 0),
           discount_amount = 0,
           updated_at = now()
     where sale_id = f.sale_id;

    -- El status vuelve a derivarse del balance recalculado por el trigger.
    update invoice_sales
       set status = case when balance > 0 and balance < total then 'partial' else status end,
           updated_at = now()
     where id = f.invoice_id;

    raise notice 'Factura % revertida al bruto', f.number;
  end loop;
end $$;

commit;
