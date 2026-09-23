-- Rollback de 20260923175006_pedido_web_se_confirma_una_sola_vez.sql
--
-- Retira la función de confirmación y el índice único. La columna
-- sales.web_order_id se conserva (aditiva, con datos de trazabilidad); antes
-- de retirar la función, el código debe volver a crear la venta por su cuenta.
drop function if exists public.fn_confirmar_pedido_web(uuid, uuid, uuid, boolean);
drop index if exists public.uq_sales_web_order_viva;
