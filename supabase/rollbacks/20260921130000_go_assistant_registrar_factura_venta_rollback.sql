-- Reversión de 20260921130000_go_assistant_registrar_factura_venta.sql
-- Solo elimina las funciones. No toca ventas ni facturas ya creadas.
drop function if exists public.assistant_register_sales_invoice(integer, integer, uuid, jsonb);
drop function if exists public.assistant_void_sales_invoice(integer, uuid, uuid);
