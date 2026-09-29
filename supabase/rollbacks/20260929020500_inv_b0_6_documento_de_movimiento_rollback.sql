-- Reversión de 20260929020500_inv_b0_6_documento_de_movimiento.sql
-- Funciones nuevas de solo lectura: se eliminan. No toca datos.

drop function if exists public.fn_documento_de_movimiento(integer, text, text, integer);
drop function if exists public.fn_inv_documentos(integer, jsonb);
