-- El kardex rechazaba ocho orígenes que el código escribe todos los días.
--
-- `stock_movements_source_check` admite 14 valores. El código escribe ocho más,
-- y el `CHECK` los rechaza (docs/design/AUDITORIA-KARDEX-LOTES.md §E.0):
--
-- | Valor | Quién lo escribe | Qué pasa hoy |
-- |---|---|---|
-- | `purchase_order` | `purchaseOrderService.receiveItems` y `receiveItemsWithSerials` | las existencias suben y **el movimiento no se escribe** |
-- | `purchase_invoice` | `FacturasCompraService` al recibir por factura | igual |
-- | `invoice_void` | `AnularFacturaDialog` al anular una factura de venta | igual |
-- | `credit_note` | devolución de pedido web por nota crédito | igual |
-- | `web_refund` | reembolso de pedido web | igual |
-- | `folio_item_reversal` | borrado de un renglón de folio | igual |
-- | `transfer_out` / `transfer_in` | `TransferenciasService` | **lanza excepción y tumba el traslado entero** |
--
-- Los seis primeros fallan en silencio: el error se guarda en un array y muere
-- en un `console.warn`, así que las existencias quedan modificadas y el kardex
-- no se entera. Los dos últimos revientan. La prueba está en los datos:
-- `source='transfer'` solo existe entre el 7 y el 26 de julio de 2025 —un
-- camino antiguo—, y **desde entonces ningún traslado ha llegado al kardex**.
-- Y de las 7 órdenes de compra marcadas como recibidas, ninguna tiene
-- movimiento de stock.
--
-- Se amplía la lista en vez de normalizar el código a los 14 valores actuales,
-- porque los valores nuevos **distinguen hechos distintos**: recibir contra una
-- orden de compra no es lo mismo que recibir contra una factura, y devolver por
-- nota crédito no es lo mismo que anular una factura. Esa distinción es
-- precisamente lo que se quiere leer en el kardex. Si se prefiere lo contrario,
-- el rollback deja el `CHECK` como estaba y entonces hay que cambiar el código.
--
-- Esta migración **no repara el histórico**: las recepciones de los últimos
-- catorce meses no están y no se reconstruyen con certeza. Eso va con la fecha
-- de corte.

alter table public.stock_movements drop constraint if exists stock_movements_source_check;

alter table public.stock_movements add constraint stock_movements_source_check
  check (source = any (array[
    -- Los catorce de siempre
    'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss',
    'production', 'initial', 'web_sale', 'mesa_sale', 'invoice_sale',
    'folio_item', 'room_consumption', 'web_order',
    -- Los ocho que el código ya escribía y el CHECK rechazaba
    'purchase_order', 'purchase_invoice', 'invoice_void', 'credit_note',
    'web_refund', 'folio_item_reversal', 'transfer_out', 'transfer_in'
  ]));

comment on constraint stock_movements_source_check on public.stock_movements is
  'Orígenes admitidos del movimiento. Ampliar esta lista es obligatorio antes de que el código escriba un valor nuevo: un valor fuera de la lista no aborta la venta, se traga en un console.warn y deja el kardex incompleto.';
