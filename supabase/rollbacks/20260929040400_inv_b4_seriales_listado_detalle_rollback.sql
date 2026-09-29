-- Reversión de 20260929040400_inv_b4_seriales_listado_detalle.sql.
-- Revertir antes 20260929040600 (trazabilidad) y 20260929040500 (garantías):
-- usan estos ayudantes. Las pantallas nuevas de seriales dejan de cargar.

drop function if exists public.fn_serial_detalle(integer, integer);
drop function if exists public.fn_seriales_listado(integer, jsonb);
drop function if exists public.fn_seriales_permisos(integer);
drop function if exists public.fn_seriales_int_eventos(integer, integer);
drop function if exists public.fn_seriales_int_venta(integer, text, uuid);
drop function if exists public.fn_seriales_int_documento(integer, text, text);
drop function if exists public.fn_seriales_int_nombre_usuario(uuid);
drop function if exists public.fn_seriales_int_hoy(integer);
drop function if exists public.fn_seriales_int_exigir(integer, boolean);
