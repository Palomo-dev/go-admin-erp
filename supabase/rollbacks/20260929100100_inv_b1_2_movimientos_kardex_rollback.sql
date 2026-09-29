-- Reversión de 20260929100100_inv_b1_2_movimientos_kardex.sql
-- Funciones nuevas de solo lectura: se eliminan. No toca datos.

drop function if exists public.fn_kardex_saldo_corrido(integer, jsonb, integer, integer);
drop function if exists public.fn_kardex_descuadres(integer, jsonb, integer);
drop function if exists public.fn_movimientos_listado(integer, jsonb, integer, integer);
drop function if exists public.fn_inv_int_fila_movimiento(public.stock_movements, boolean, numeric);
drop function if exists public.fn_inv_int_filtro_movimientos(integer, jsonb);
