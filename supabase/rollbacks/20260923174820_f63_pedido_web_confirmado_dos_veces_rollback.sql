-- Rollback de 20260923174820_f63_pedido_web_confirmado_dos_veces.sql
--
-- Devuelve el pedido WO-145-MUEBYTM3-HRB5 al estado duplicado previo, sin
-- borrar filas: los contra-asientos F-63 se revierten a su vez, la entrada de
-- kardex se compensa con una salida y se restauran estados y referencias.
-- Solo tiene sentido si la corrección resultó equivocada.

do $$
declare
  v_rev record;
begin
  for v_rev in
    select reversal_entry_id from public.journal_reversals
     where categoria = 'F-63' and lote = 'F-63-2026-09-23'
  loop
    perform public.fn_revertir_asiento(v_rev.reversal_entry_id, 'F-63', 'rollback-F-63');
  end loop;

  update public.payments
     set reference = null, updated_at = now()
   where id = 'a41e3537-dd45-42cd-94a8-e085b6044476';
  -- El pago vuelve a 'completed' con su asiento de cobro (22429) ya restaurado
  -- arriba; fn_create_journal_entry no duplica por fact_key.
  update public.payments
     set status = 'completed', reference = '1515135-1790181869-90585', updated_at = now()
   where id = 'effc57bc-f5cf-475c-8537-c9e2b26adea8';

  update public.invoice_sales set status = 'paid', updated_at = now()
   where id = '786c2c59-3fa6-4168-bd79-3f689131a20b';
  update public.sales set status = 'paid', updated_at = now()
   where id = '49a36944-4d95-4701-b6b1-7c78a6bd0de4';

  insert into public.stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note)
  select organization_id, branch_id, product_id, lot_id, 'out', qty, unit_cost, 'adjustment', source_id, 'rollback F-63'
    from public.stock_movements
   where source = 'invoice_void' and source_id = '49a36944-4d95-4701-b6b1-7c78a6bd0de4';
  update public.stock_levels set qty_on_hand = qty_on_hand - 1, updated_at = now()
   where product_id = 66306 and branch_id = 125 and lot_id is null;
end $$;
-- El CHECK de journal_reversals conserva 'F-63' mientras existan filas F-63.
