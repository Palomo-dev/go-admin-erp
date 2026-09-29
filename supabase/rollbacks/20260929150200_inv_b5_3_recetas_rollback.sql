-- Reversión de 20260929150200_inv_b5_3_recetas.sql
-- Las versiones creadas por fn_receta_reactivar y las recetas desactivadas se
-- conservan (son datos del cliente); solo se retiran las funciones.
drop function if exists public.fn_receta_reactivar(integer, integer);
drop function if exists public.fn_receta_desactivar(integer, integer);
drop function if exists public.fn_receta_versiones(integer, integer, integer);
drop function if exists public.fn_recetas_listado(integer, jsonb);
