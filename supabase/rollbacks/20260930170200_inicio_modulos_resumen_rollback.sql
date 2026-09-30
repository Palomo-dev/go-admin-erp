-- Reversión de 20260930170200_inicio_modulos_resumen.sql: quita la función
-- nueva. No toca datos. Las funciones que usa (fn_cxc_listado,
-- fn_stock_listado, fn_inicio_ventas_periodo) quedan como estaban.

drop function if exists public.fn_inicio_modulos_resumen(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer);
