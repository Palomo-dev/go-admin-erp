-- Reversión de 20260921120000_go_assistant_f4_anular_factura_compra.sql
-- Solo elimina la función. Las anulaciones ya hechas (asientos espejo,
-- movimientos de salida) se conservan: son rastro contable.
drop function if exists public.assistant_void_purchase_invoice(integer, uuid, uuid);
