-- Reversión de 20260929150250_inv_b5_3b_producto_produccion.sql
drop function if exists public.fn_producto_distribucion(integer, integer, integer);
drop function if exists public.fn_producto_produccion_resumen(integer, integer);
