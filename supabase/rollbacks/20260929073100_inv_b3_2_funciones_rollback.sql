-- Reversión de 20260929073100_inv_b3_2_funciones.sql.
-- Revertir antes 20260929073200 (consultas y distribución llaman a estas RPC).
-- Los movimientos de kardex, los traslados y su seguimiento ya escritos se
-- conservan: esto solo retira las funciones (la interfaz de traslados deja de
-- poder crear, despachar, recibir, cancelar y devolver).

drop function if exists public.fn_traslado_devolver(integer, integer, text, text);
drop function if exists public.fn_traslado_cancelar(integer, integer, text);
drop function if exists public.fn_traslado_recibir(integer, integer, jsonb, text);
drop function if exists public.fn_traslado_despachar(integer, integer, jsonb, text);
drop function if exists public.fn_traslado_guardar(integer, jsonb, text);
drop function if exists public.fn_traslado_int_asiento(integer, integer, text, integer, integer, numeric, text);
drop function if exists public.fn_traslado_int_disponible(integer, integer, integer, integer);
drop function if exists public.fn_traslado_int_sucursal(integer, integer);
drop function if exists public.fn_traslado_int_numero(text);
drop function if exists public.fn_traslado_int_entero(text);
