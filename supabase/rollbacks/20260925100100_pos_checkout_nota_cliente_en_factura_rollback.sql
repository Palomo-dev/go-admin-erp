-- Reversión de 20260925100100_pos_checkout_nota_cliente_en_factura.sql
--
-- Quita de `pos_checkout_v1` (versión viva) la columna `note` del INSERT en
-- `invoice_items`, con la sustitución inversa exacta. No toca datos: las
-- líneas de factura que ya tienen nota la conservan.

do $$
declare
  v_def   text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_new1  text := E'total_line, tax_rate, tax_included, discount_amount, note\n      ) values (\n        v_invoice.id, v_invoice.id, ''sale''';
  v_old1  text := E'total_line, tax_rate, tax_included, discount_amount\n      ) values (\n        v_invoice.id, v_invoice.id, ''sale''';
  v_new2  text := E'coalesce((v_item->>''discount_amount'')::numeric, 0),\n        nullif(left(btrim(coalesce(v_item->''notes''->>''customer_note'', '''')), 250), '''')\n      );';
  v_old2  text := E'coalesce((v_item->>''discount_amount'')::numeric, 0)\n      );';
begin
  if position(v_new1 in v_def) = 0 or position(v_new2 in v_def) = 0 then
    raise notice 'pos_checkout_v1 no tiene el cambio de la nota del cliente; nada que revertir';
    return;
  end if;
  execute replace(replace(v_def, v_new1, v_old1), v_new2, v_old2);
end $$;

comment on column public.invoice_items.note is null;
