-- Rollback de 20260926140000_compras_f4_listados_y_resumenes.sql
-- Solo funciones de lectura (SECURITY INVOKER): no hay datos que revertir.
drop function if exists public.fn_facturas_compra_listado(integer, text, text, text, integer, date, date, integer, text, text, integer, integer);
drop function if exists public.fn_facturas_compra_resumen(integer, integer);
drop function if exists public.fn_cxp_listado(integer, text, text, text, integer, integer, boolean, text, text, integer, integer);
drop function if exists public.fn_cxp_resumen(integer, integer);
