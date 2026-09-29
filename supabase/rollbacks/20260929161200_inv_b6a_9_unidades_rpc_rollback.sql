-- Reversión de 20260929161200_inv_b6a_9_unidades_rpc.sql
-- La pantalla de unidades y el diálogo de conversión dejan de guardar hasta
-- revertir también el código.

drop function if exists public.fn_unidad_convertir(integer, numeric, text, text, integer);
drop function if exists public.fn_conversiones_eliminar(integer, integer[], boolean);
drop function if exists public.fn_conversion_guardar(integer, integer, jsonb);
drop function if exists public.fn_unidades_eliminar(integer, text[]);
drop function if exists public.fn_unidad_guardar(integer, text, jsonb);
drop function if exists public.fn_unidades_resumen(integer);
drop function if exists public.fn_unidades_int_ingredientes(integer);
