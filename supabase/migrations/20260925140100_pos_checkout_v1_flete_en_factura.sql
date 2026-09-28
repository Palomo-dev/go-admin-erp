-- Punto 5 (2026-09-24): el flete de la venta va como línea de la factura.
--
-- El total de invoice_sales sale de sus líneas (fn_recalc_invoice_totals:
-- SUM(total_line)) y pos_checkout_v1 no escribía el flete como línea: la
-- factura de una venta con domicilio quedaba por debajo de la venta.
-- Medido el 2026-09-24: 33 de 531 facturas de ventas con delivery_fee, en 2
-- organizaciones (ids 113 y 120), $122.275 en total, la última del
-- 2026-08-27; 31 del POS (org 120) y 2 del sitio web (org 113, anteriores a
-- que el pedido web escribiera su línea «Envío (Delivery)»). Esas 33 NO se
-- modifican aquí (implicaciones fiscales): ver el reporte y la propuesta de
-- nota débito en docs/design/POS-COBRO-SERVIDOR.md §5.
--
-- Cambio: al crear las líneas de la factura, si la venta tiene flete se
-- añade la línea «Envío (Delivery)» (sin producto, cantidad 1, tarifa 0, en
-- el modo de impuesto de la factura), la misma forma que ya usan los pedidos
-- web. Parche sobre la definición VIVA de pos_checkout_v1 (otras sesiones la
-- modifican): falla sin cambiar nada si el fragmento no aparece una sola vez.

do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$        nullif(left(btrim(coalesce(v_si.notes->>'customer_note', '')), 250), '')
      );
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;$frag0$;
  v_new0 text := $frag0$        nullif(left(btrim(coalesce(v_si.notes->>'customer_note', '')), 250), '')
      );
    end loop;
    -- Punto 5: el flete es una línea de la factura. fn_recalc_invoice_totals
    -- recalcula el total de la factura con SUM(total_line): lo que no es línea
    -- desaparece de la factura (33 facturas quedaron por debajo de su venta).
    -- Misma forma que el pedido web (lineasFacturaDesdePedidoWeb): sin
    -- producto, cantidad 1, sin impuesto, en el modo de la factura. Solo al
    -- crear las líneas: una factura que ya existía no se toca.
    if coalesce(v_sale.delivery_fee, 0) > 0 then
      insert into public.invoice_items (
        invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
        total_line, tax_rate, tax_included, discount_amount
      ) values (
        v_invoice.id, v_invoice.id, 'sale', null, 'Envío (Delivery)', 1, v_sale.delivery_fee,
        v_sale.delivery_fee, 0, v_tax_included, 0
      );
    end if;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;$frag0$;
begin
  if position($m$'Envío (Delivery)'$m$ in v_def) > 0 then
    raise notice 'public.pos_checkout_v1(jsonb): el cambio ya estaba aplicado; nada que hacer';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old0, ''))) / length(v_old0) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 1 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  execute v_def;
  if position($m$'Envío (Delivery)'$m$ in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'public.pos_checkout_v1(jsonb): no quedó con el cambio';
  end if;
end $parche$;
