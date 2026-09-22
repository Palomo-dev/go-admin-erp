-- Reversión de 20260921110000_go_assistant_f4_registrar_factura_compra.sql
-- Solo elimina la función. No toca facturas, CxP ni stock ya registrados.
drop function if exists public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb);
