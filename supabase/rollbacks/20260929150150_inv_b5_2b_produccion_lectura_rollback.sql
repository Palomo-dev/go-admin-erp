-- Reversión de 20260929150150_inv_b5_2b_produccion_lectura.sql
drop function if exists public.fn_produccion_detalle(integer, integer);
drop function if exists public.fn_produccion_listado(integer, jsonb);
drop function if exists public.fn_produccion_int_fila(public.production_orders, boolean);
