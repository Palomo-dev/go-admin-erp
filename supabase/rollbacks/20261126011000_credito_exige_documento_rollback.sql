-- Reversión de 20261126011000_credito_exige_documento.sql
--
-- Quita los cuatro disparadores diferidos y sus funciones: las ventas a crédito o con saldo vuelven a
-- guardarse sin exigir el documento del cliente (como antes). No toca datos.

DROP TRIGGER IF EXISTS zz_trg_factura_credito_exige_documento ON public.invoice_sales;
DROP TRIGGER IF EXISTS zz_trg_factura_credito_exige_documento_upd ON public.invoice_sales;
DROP TRIGGER IF EXISTS zz_trg_venta_credito_exige_documento ON public.sales;
DROP TRIGGER IF EXISTS zz_trg_cartera_credito_exige_documento ON public.accounts_receivable;

DROP FUNCTION IF EXISTS public.fn_trg_credito_exige_documento();
DROP FUNCTION IF EXISTS public.fn_credito_sin_documento(text, text);
DROP FUNCTION IF EXISTS public.fn_cliente_con_documento(integer, uuid);
