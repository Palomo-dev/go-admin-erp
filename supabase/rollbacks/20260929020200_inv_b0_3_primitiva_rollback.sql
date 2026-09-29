-- Reversión de 20260929020200_inv_b0_3_primitiva.sql
-- Aplicar después de revertir las migraciones 4–7 del bloque B0: las funciones
-- reescritas (decrement_stock_on_sale, fn_stock_entrada, …) llaman a estas.

drop function if exists public.fn_inv_int_mover(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb);
drop function if exists public.fn_inv_int_mover_fila(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb);
drop function if exists public.fn_inv_int_fila(integer, integer, integer, numeric);
drop function if exists public.fn_inv_int_costo_promedio(numeric, numeric, numeric, numeric);
