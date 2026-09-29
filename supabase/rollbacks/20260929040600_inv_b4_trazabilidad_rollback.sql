-- Reversión de 20260929040600_inv_b4_trazabilidad.sql.

drop function if exists public.fn_trazabilidad(integer, text, integer, integer, integer);
drop function if exists public.fn_trazabilidad_int_cliente(integer, jsonb);
drop function if exists public.fn_trazabilidad_int_doc_movimiento(integer, text, text);
