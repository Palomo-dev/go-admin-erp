-- Reversión de 20260929020100_inv_b0_2_permisos.sql
-- Aplicar después de revertir las migraciones 3–7 del bloque B0 (las usan).
-- No borra las filas de organization_settings con key = 'inventario' que se
-- hayan guardado: si hace falta, `delete from organization_settings where key = 'inventario'`.

drop function if exists public.fn_inventario_config_guardar(integer, jsonb);
drop function if exists public.fn_inventario_config(integer);
drop function if exists public.fn_inventario_int_config(integer);
drop function if exists public.fn_inventario_exigir_permiso(integer, text[]);
drop function if exists public.fn_inventario_permisos(integer);
