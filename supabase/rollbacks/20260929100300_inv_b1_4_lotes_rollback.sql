-- Reversión de 20260929100300_inv_b1_4_lotes.sql
-- Elimina las funciones de lotes. No revierte datos: los lotes creados, sus
-- entradas (ajustes aplicados + kardex) y los borrados se quedan como están.

drop function if exists public.fn_lote_eliminar(integer, integer);
drop function if exists public.fn_lote_ajustar(integer, integer, integer, numeric, text, text);
drop function if exists public.fn_lote_guardar(integer, jsonb);
drop function if exists public.fn_lotes_de_producto(integer, integer, integer);
drop function if exists public.fn_lotes_listado(integer, jsonb, integer, integer);
