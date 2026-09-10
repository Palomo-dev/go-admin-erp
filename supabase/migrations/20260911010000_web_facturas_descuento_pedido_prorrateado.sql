-- ============================================================
-- Ventas web: reparar facturas con saldo fantasma por descuento de pedido
-- ============================================================
-- El sitio web aplica cupones y promociones a nivel de pedido
-- (`web_orders.discount_total`) con `web_order_items.discount_amount = 0`.
-- Al confirmar el pedido, el ERP creaba las líneas de factura por el bruto y
-- el trigger `fn_recalc_invoice_totals` pisaba `invoice_sales.total` con
-- SUM(total_line): el descuento desaparecía de la factura, el pago de la
-- pasarela quedaba "parcial" y `accounts_receivable` heredaba un saldo que el
-- cliente nunca debió (org 135, FACT-0207: 102.200 facturados, 86.200
-- pagados por Wompi, 16.000 "pendientes"; FACT-0209: 109.600 / 43.200 /
-- 66.400).
--
-- El código ya está corregido (`src/lib/services/webOrderTotals.ts`): el
-- descuento de pedido se prorratea en las líneas, como hace el POS. Esta
-- migración aplica el mismo prorrateo a las facturas ya afectadas.
--
-- Criterio (genérico, no por id): venta web pagada cuya factura vale más que
-- la venta y cuyo `sales.discount_total` no está reflejado en las líneas.
-- Reparto: proporcional al neto de cada línea de producto, piso en centavos,
-- residuo en la última línea; nunca supera el neto de la línea. Se actualizan
-- `invoice_items` (el trigger recalcula total/balance y `tr_update_account_
-- receivable` sincroniza cartera) y `sale_items` (para que
-- `sales.discount_total = SUM(sale_items.discount_amount)`, como en el POS).
-- El status de la factura pasa a 'paid' solo si el balance queda en 0 y hay
-- pagos completados: `fn_recalc_invoice_totals` no toca el status.
--
-- Verificado el 2026-09-10 dentro de begin/rollback: las dos facturas quedan
-- en total = pagado, balance 0, 'paid', y cartera 86.200/43.200 con saldo 0.
-- Idempotente: en la segunda pasada la condición ya no selecciona nada.
-- ============================================================

do $$
declare
  f record;
  l record;
  v_residuo_cent bigint;
  v_total_neto_cent bigint;
  v_restante bigint;
  v_parte bigint;
  v_n int;
  v_i int;
begin
  for f in
    select i.id as invoice_id, i.sale_id, i.number, s.discount_total,
           (select coalesce(sum(coalesce(ii.discount_amount, 0)), 0)
              from invoice_items ii where ii.invoice_sales_id = i.id) as desc_en_lineas
    from invoice_sales i
    join sales s on s.id = i.sale_id
    where s.source = 'web'
      and s.payment_status = 'paid'
      and i.status not in ('void', 'voided', 'draft')
      and i.total > s.total
      and s.discount_total > (select coalesce(sum(coalesce(ii.discount_amount, 0)), 0)
                                from invoice_items ii where ii.invoice_sales_id = i.id)
  loop
    v_residuo_cent := round((f.discount_total - f.desc_en_lineas) * 100);

    select coalesce(sum(round((ii.qty * ii.unit_price - coalesce(ii.discount_amount, 0)) * 100)), 0), count(*)
      into v_total_neto_cent, v_n
    from invoice_items ii
    where ii.invoice_sales_id = f.invoice_id and ii.product_id is not null;

    if v_total_neto_cent <= 0 then
      continue;
    end if;

    v_residuo_cent := least(v_residuo_cent, v_total_neto_cent);
    v_restante := v_residuo_cent;
    v_i := 0;

    for l in
      select ii.id, ii.product_id,
             round((ii.qty * ii.unit_price - coalesce(ii.discount_amount, 0)) * 100) as neto_cent
      from invoice_items ii
      where ii.invoice_sales_id = f.invoice_id and ii.product_id is not null
      order by ii.created_at, ii.id
    loop
      v_i := v_i + 1;
      if v_i = v_n then
        v_parte := least(v_restante, l.neto_cent);
      else
        v_parte := least(floor(v_residuo_cent::numeric * l.neto_cent / v_total_neto_cent)::bigint, l.neto_cent);
      end if;
      v_restante := v_restante - v_parte;

      update invoice_items
         set discount_amount = coalesce(discount_amount, 0) + v_parte / 100.0,
             total_line = total_line - v_parte / 100.0,
             updated_at = now()
       where id = l.id;

      update sale_items
         set discount_amount = coalesce(discount_amount, 0) + v_parte / 100.0,
             total = total - v_parte / 100.0,
             updated_at = now()
       where sale_id = f.sale_id and product_id = l.product_id;
    end loop;

    update invoice_sales
       set status = 'paid', updated_at = now()
     where id = f.invoice_id
       and balance = 0
       and fn_invoice_sales_paid(id) > 0;

    raise notice 'Factura % reparada: % centavos de descuento prorrateados', f.number, v_residuo_cent;
  end loop;
end $$;
