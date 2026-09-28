-- ============================================================================
-- POS · La nota «para el cliente» de la línea llega a la factura
-- (decisión del dueño, 2026-09-23; docs/design/POS-CARRITO-LINEAS-NOTAS.md N5).
--
-- `pos_checkout_v1` ya copia `items[].notes` (objeto) a `sale_items.notes`, así
-- que la nota del cliente (`notes.customer_note`) queda en la venta sin tocar
-- nada. Lo que faltaba es la línea de la factura: `invoice_items.note` existe y
-- la cola de Factus ya la manda como `items[].note` (payloadsFactus.ts,
-- `mapearLinea`), pero el cobro nunca la escribía.
--
-- Cambio mínimo sobre la función VIVA (otras tareas la modifican): se leen su
-- definición actual y se sustituyen exactamente dos fragmentos del INSERT en
-- `invoice_items` para añadir la columna `note`. Si alguno de los fragmentos
-- no aparece exactamente una vez, la migración falla sin cambiar nada.
-- La nota de COCINA (`notes.extra`) no se toca: nunca va a la factura.
-- ============================================================================

do $$
declare
  v_oid   oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def   text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old1  text := E'total_line, tax_rate, tax_included, discount_amount\n      ) values (\n        v_invoice.id, v_invoice.id, ''sale''';
  v_new1  text := E'total_line, tax_rate, tax_included, discount_amount, note\n      ) values (\n        v_invoice.id, v_invoice.id, ''sale''';
  v_old2  text := E'coalesce((v_item->>''discount_amount'')::numeric, 0)\n      );\n    end loop;\n    if v_replayed then v_completed := array_append(v_completed, ''invoice_items'');';
  v_new2  text := E'coalesce((v_item->>''discount_amount'')::numeric, 0),\n        nullif(left(btrim(coalesce(v_item->''notes''->>''customer_note'', '''')), 250), '''')\n      );\n    end loop;\n    if v_replayed then v_completed := array_append(v_completed, ''invoice_items'');';
begin
  if position('customer_note' in v_def) > 0 then
    raise notice 'pos_checkout_v1 ya escribe la nota del cliente; nada que hacer';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old1, ''))) / length(v_old1) <> 1
     or (length(v_def) - length(replace(v_def, v_old2, ''))) / length(v_old2) <> 1 then
    raise exception 'pos_checkout_v1 cambió: no se encontró exactamente una vez el INSERT de invoice_items esperado';
  end if;
  v_def := replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
  execute v_def;
  if position('customer_note' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'pos_checkout_v1 no quedó con la nota del cliente';
  end if;
end $$;

comment on column public.invoice_items.note is
  'Nota de la línea; sale en la factura electrónica como items[].note. En ventas del POS es la nota para el cliente: la de cocina nunca se copia aquí.';
