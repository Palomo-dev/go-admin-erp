-- Reversión de 20260929160300_inv_b6a_4_variantes_orden_y_borrado.sql
-- Revertir antes 20260929160400. `crear_tipo_variante` sigue sin EXECUTE para
-- authenticated (ya estaba así antes de B6a).

drop function if exists public.fn_variantes_reordenar(integer, integer, integer[]);
drop function if exists public.fn_variantes_cambiar(integer, integer[], integer[], jsonb);
drop function if exists public.fn_variantes_eliminar(integer, integer[], integer[]);
drop function if exists public.fn_variantes_completar_catalogo(integer);
drop function if exists public.fn_variantes_usar_sugeridos(integer, integer[]);
