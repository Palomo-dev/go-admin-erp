-- Rollback de 20260923100000_stock_movements_admite_los_origenes_que_el_codigo_escribe.sql
--
-- Devuelve el CHECK a los catorce valores originales. Aviso: si ya se
-- escribieron movimientos con alguno de los ocho valores nuevos, la creación
-- del CHECK falla. En ese caso hay que decidir primero a qué valor antiguo se
-- reasigna cada uno; la consulta de abajo los lista.
--
--   select source, count(*) from public.stock_movements
--    where source in ('purchase_order','purchase_invoice','invoice_void',
--                     'credit_note','web_refund','folio_item_reversal',
--                     'transfer_out','transfer_in')
--    group by 1;
--
-- Y hay que cambiar también el código, o volverán a fallar en silencio la
-- recepción de órdenes de compra, la recepción por factura, la anulación de
-- factura, las dos devoluciones de pedido web y el borrado de renglón de
-- folio, y volverán a reventar los traslados.

alter table public.stock_movements drop constraint if exists stock_movements_source_check;

alter table public.stock_movements add constraint stock_movements_source_check
  check (source = any (array[
    'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss',
    'production', 'initial', 'web_sale', 'mesa_sale', 'invoice_sale',
    'folio_item', 'room_consumption', 'web_order'
  ]));
