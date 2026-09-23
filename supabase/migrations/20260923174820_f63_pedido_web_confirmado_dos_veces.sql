-- F-63 · Un pedido web confirmado dos veces (org 145, 2026-09-23 16:45 UTC)
--
-- El pedido WO-145-MUEBYTM3-HRB5 (40.000, Nequi por Wompi) se confirmó dos
-- veces en 1,7 s:
--   - webhook de Wompi → venta 49a36944, FACT-0075, pago effc57bc (el que creó
--     el sitio web, con la referencia de la pasarela);
--   - botón «Confirmar pedido» de Pedidos online, abierto cuando el pedido aún
--     estaba pendiente → venta a81a223b, FACT-0076, pago a41e3537 sin
--     referencia. web_orders.sale_id quedó en a81a223b.
-- Hubo un solo cobro real.
--
-- Se conserva la venta que señala el pedido (a81a223b, FACT-0076) y se
-- neutraliza la huérfana sin borrar filas:
--   1. contra-asientos del devengo (22430) y del cobro (22429) de la huérfana;
--   2. FACT-0075 y la venta 49a36944 quedan anuladas (void, saldo 0); como su
--      devengo ya está revertido, fn_auto_journal_void no asienta otra vez;
--   3. el pago effc57bc queda cancelado y su referencia de Wompi (con la
--      respuesta de la pasarela) pasa al pago a41e3537, que sobrevive;
--   4. la unidad vuelve al inventario por el kardex (entrada invoice_void): su
--      asiento 1405 D / 6105 C es el contra-asiento del costo duplicado (22431).
--      Revertir además 22431 devolvería el costo dos veces.
-- Idempotente: si la huérfana ya está anulada, no hace nada.

alter table public.journal_reversals drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals add constraint journal_reversals_categoria_check
  check (categoria = any (array['F-48', 'F-45', 'F-49', 'CC-001', 'F-01', 'CC-009', 'F-63']));

do $$
declare
  c_org        constant integer := 145;
  c_lote       constant text := 'F-63-2026-09-23';
  c_pedido     constant uuid := '55f2db58-6d1c-470d-8848-98804f4c62df';
  c_venta_viva constant uuid := 'a81a223b-52df-415c-8699-06218ac39a2b';
  c_venta_huer constant uuid := '49a36944-4d95-4701-b6b1-7c78a6bd0de4';
  c_fact_huer  constant uuid := '786c2c59-3fa6-4168-bd79-3f689131a20b';
  c_pago_huer  constant uuid := 'effc57bc-f5cf-475c-8537-c9e2b26adea8';
  c_pago_vivo  constant uuid := 'a41e3537-dd45-42cd-94a8-e085b6044476';
  v_pago record;
  v_orig integer;
  v_rev integer;
  v_linea record;
begin
  if (select status from public.sales where id = c_venta_huer) = 'void' then
    raise notice 'F-63: la venta huérfana ya estaba anulada';
    return;
  end if;
  if (select sale_id from public.web_orders where id = c_pedido) is distinct from c_venta_viva then
    raise exception 'F-63: el pedido ya no apunta a la venta %', c_venta_viva;
  end if;

  -- 1. Contra-asientos del devengo y del cobro de la huérfana.
  foreach v_orig in array array[22430, 22429] loop
    if not exists (select 1 from public.journal_entries
                   where id = v_orig and organization_id = c_org
                     and fact_key in ('accrual:sale:' || c_venta_huer, 'settlement:payment:' || c_pago_huer)) then
      raise exception 'F-63: el asiento % no es de la venta huérfana', v_orig;
    end if;
    v_rev := public.fn_revertir_asiento(v_orig, 'F-63', c_lote);
    insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id)
    values (c_org, c_lote, 'F-63', v_orig, v_rev);
  end loop;

  -- 2. Factura y venta huérfanas, anuladas.
  update public.invoice_sales
     set status = 'void', balance = 0, updated_at = now(),
         notes = coalesce(notes || E'\n', '') || 'Anulada: segunda confirmación del mismo pedido web (F-63). La venta vigente es FACT-0076.'
   where id = c_fact_huer and organization_id = c_org;

  update public.sales
     set status = 'void', balance = 0, updated_at = now(),
         notes = coalesce(notes || ' | ', '') || 'Anulada: duplicado de la venta ' || c_venta_viva || ' (F-63)'
   where id = c_venta_huer and organization_id = c_org;

  -- 3. La referencia de Wompi pasa al pago que sobrevive; el otro se cancela.
  select reference, processor_response into v_pago from public.payments where id = c_pago_huer;

  update public.payments
     set status = 'cancelled', updated_at = now(),
         reference = 'F-63 trasladada a ' || c_pago_vivo || ': ' || coalesce(v_pago.reference, '')
   where id = c_pago_huer and organization_id = c_org and status = 'completed';

  update public.payments
     set reference = v_pago.reference,
         processor_response = coalesce(processor_response, v_pago.processor_response),
         updated_at = now()
   where id = c_pago_vivo and organization_id = c_org;

  -- 4. La salida duplicada vuelve al inventario por el kardex.
  for v_linea in
    select sm.branch_id, sm.product_id, sm.lot_id, sm.qty, sm.unit_cost
      from public.stock_movements sm
     where sm.organization_id = c_org and sm.source = 'web_sale'
       and sm.source_id = c_venta_huer::text and sm.direction = 'out'
  loop
    insert into public.stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note)
    values (c_org, v_linea.branch_id, v_linea.product_id, v_linea.lot_id, 'in', v_linea.qty, v_linea.unit_cost,
            'invoice_void', c_venta_huer::text, 'F-63: devuelve la salida de la venta web duplicada');

    update public.stock_levels
       set qty_on_hand = qty_on_hand + v_linea.qty, updated_at = now()
     where branch_id = v_linea.branch_id and product_id = v_linea.product_id
       and lot_id is not distinct from v_linea.lot_id;
  end loop;

  insert into public.journal_reversal_runs (organization_id, lote, ejecutado, resultado)
  values (c_org, c_lote, true, jsonb_build_object(
    'pedido', c_pedido, 'venta_vigente', c_venta_viva, 'venta_anulada', c_venta_huer,
    'factura_anulada', c_fact_huer, 'pago_cancelado', c_pago_huer, 'pago_con_referencia', c_pago_vivo));
end $$;
