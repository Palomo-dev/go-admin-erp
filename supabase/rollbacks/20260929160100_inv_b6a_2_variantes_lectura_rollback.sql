-- Reversión de 20260929160100_inv_b6a_2_variantes_lectura.sql (y de 160150,
-- que solo reemplaza dos de estas funciones). Revertir antes 160200–160500:
-- sus funciones usan estos ayudantes.

drop function if exists public.fn_variantes_resumen(integer);
drop function if exists public.fn_variantes_int_valores_de(integer, integer, integer);
drop function if exists public.fn_variantes_int_claves_de(integer, integer);
drop function if exists public.fn_variantes_int_reescribir(integer, text[], text, text[], text);
drop function if exists public.fn_variantes_int_mapear_padre(jsonb, text[], text, text[], text);
drop function if exists public.fn_variantes_int_mapear(jsonb, text[], text, text[], text);
drop function if exists public.fn_variantes_int_valor_de(integer, text);
drop function if exists public.fn_variantes_int_claves(integer, boolean);
drop function if exists public.fn_variantes_int_filas(integer, boolean);
drop function if exists public.fn_variantes_int_norm(text);
drop function if exists public.fn_variantes_int_tipo(integer, integer);
