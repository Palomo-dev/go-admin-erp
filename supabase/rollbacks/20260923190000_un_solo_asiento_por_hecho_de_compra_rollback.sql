-- Rollback de 20260923190000_un_solo_asiento_por_hecho_de_compra.sql (ADR-CC-009).
--
-- OJO: volver atrás reactiva la doble contabilización de compras (la cuenta por
-- pagar y la recepción vuelven a generar asiento además del devengo de la
-- factura). Solo tiene sentido si se revierte la decisión del dueño.
--
-- 1. Contra-asientos: NO se borran. Para deshacerlos se revierte cada uno
--    (procedimiento de docs/procedimientos/reversion-asientos-duplicados.md, §4):
--
--      SELECT fn_revertir_asiento(reversal_entry_id, 'CC-009', 'rollback-cc009')
--      FROM journal_reversals
--      WHERE categoria = 'CC-009' AND lote = 'compras-un-hecho-2026-09-23';
--
--    El CHECK de categoría conserva 'CC-009' mientras existan filas CC-009.

-- 2. Disparadores.
alter table public.accounts_payable enable trigger trg_auto_journal_ap;
alter table public.purchase_orders enable trigger trg_auto_journal_purchase_order;
comment on function public.fn_auto_journal_ap() is null;
comment on function public.fn_auto_journal_purchase_order() is null;

-- 3. fn_auto_journal_stock_movement: solo se devuelve la lista de orígenes
--    excluidos a la anterior (initial, purchase, transfer). NO se restaura un
--    cuerpo fijo: tras esta migración otra sesión aplicó 20260923133424
--    (registro de «sin regla» en journal_entry_failures) sobre esta misma
--    función, y un cuerpo copiado aquí lo borraría. Se parte de la definición
--    vigente en la base.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    $a$IF NEW.source IN ('initial', 'purchase', 'purchase_order', 'purchase_invoice',
                      'transfer', 'transfer_out', 'transfer_in') THEN$a$,
    $b$IF NEW.source IN ('initial', 'purchase', 'transfer') THEN$b$);
  if v_nueva = v_def then
    raise exception 'La lista de orígenes excluidos de fn_auto_journal_stock_movement ya no es la de ADR-CC-009: revisar a mano';
  end if;
  execute v_nueva;
end $$;
