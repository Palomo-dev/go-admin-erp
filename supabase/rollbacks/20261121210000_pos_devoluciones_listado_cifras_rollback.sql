-- Reversión de 20261121210000_pos_devoluciones_listado_cifras.sql.
-- Solo funciones de lectura nuevas: no toca datos ni otras funciones.
-- Antes de aplicarla, la pantalla /app/pos/devoluciones debe volver a la versión
-- anterior (las rutas /api/pos/devoluciones/* llaman a estas funciones).

drop function if exists public.pos_motivos_devolucion_usos(integer);
drop function if exists public.pos_ventas_para_devolver(integer, integer, text, integer);
drop function if exists public.pos_devoluciones_cifras(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[]);
drop function if exists public.pos_devoluciones_listado(integer, integer, timestamptz, timestamptz, text, text[], text[], integer[], text, text, integer, integer);
drop function if exists public.pos_devoluciones_puede_ver(integer);
drop function if exists public.pos_devoluciones_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], integer[]);
