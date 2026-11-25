-- Rollback de 20261125061424_factura_pedido_web_documento_cliente.
--
-- Quita la función y las dos columnas. ADVERTENCIA: borra los datos que hayan guardado
-- (web_orders.billing_data y customers.billing_email) y NO deshace lo que la función escribió en
-- las fichas de clientes (identificación, DV, empresas creadas, parent_customer_id) ni las notas
-- internas de los pedidos: esos son datos del cliente, no estructura. La línea
-- «[Factura electrónica] …» de customer_notes sigue en cada pedido.
-- Antes de aplicarlo, retirar el código que la usa (tienda: /api/orders y /api/checkout/init;
-- ERP: cola de facturación electrónica), o las llamadas fallarán.

DROP FUNCTION IF EXISTS public.fn_web_order_documento_cliente(integer, uuid, jsonb);
ALTER TABLE public.customers DROP COLUMN IF EXISTS billing_email;
ALTER TABLE public.web_orders DROP COLUMN IF EXISTS billing_data;
