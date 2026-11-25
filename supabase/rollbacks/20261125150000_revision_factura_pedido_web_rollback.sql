-- Reversión de 20261125150000_revision_factura_pedido_web.
--
-- Quita la función. NO deshace lo que ya registró: las revisiones guardadas en
-- web_orders.billing_data.revision, los documentos que «Usar este» pasó a las fichas, los
-- contactos que «Ligar» creó en customer_company_links ni las entradas de activities. Son datos
-- del cliente, no estructura. Antes de aplicarla, retirar la ruta
-- /api/web-orders/[id]/revision-factura o sus llamadas fallarán.

DROP FUNCTION IF EXISTS public.fn_web_order_revisar_factura(uuid, text);
