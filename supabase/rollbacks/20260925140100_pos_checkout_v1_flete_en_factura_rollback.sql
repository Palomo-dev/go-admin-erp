-- Reversión de 20260925140100_pos_checkout_v1_flete_en_factura: quita la
-- línea de flete del cobro sobre la definición viva. Las líneas «Envío
-- (Delivery)» ya escritas se conservan: son parte de facturas emitidas.

do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$        nullif(left(btrim(coalesce(v_si.notes->>'customer_note', '')), 250), '')
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
  v_new0 text := $frag0$        nullif(left(btrim(coalesce(v_si.notes->>'customer_note', '')), 250), '')
      );
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;$frag0$;
begin
  if position($m$'Envío (Delivery)'$m$ in v_def) = 0 then
    raise notice 'public.pos_checkout_v1(jsonb): el cambio no está aplicado; nada que revertir';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old0, ''))) / length(v_old0) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 1 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  execute v_def;
  if position($m$'Envío (Delivery)'$m$ in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'public.pos_checkout_v1(jsonb): la reversión no quitó el cambio';
  end if;
end $parche$;
