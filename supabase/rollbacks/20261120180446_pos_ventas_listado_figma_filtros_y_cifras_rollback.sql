-- Reversión de 20261120180446_pos_ventas_listado_figma_filtros_y_cifras.sql.
-- Solo funciones de lectura: no hay datos que restaurar. `pos_ventas_listado`
-- (16 argumentos) y `fn_inicio_ventas_rango` no se tocaron y siguen vivas;
-- antes de aplicar esto, el código debe volver a llamar a `pos_ventas_listado`
-- y a `fn_inicio_ventas_rango` (versión anterior de src/lib/pos/ventas/listadoServidor.ts).
drop function if exists public.pos_ventas_cajeros(integer, integer);
drop function if exists public.pos_ventas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean);
drop function if exists public.pos_ventas_listado_v2(integer, integer, timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text, text, integer, integer);
drop function if exists public.pos_ventas_patron(text);
drop function if exists public.pos_ventas_sucursales(integer, integer);
drop function if exists public.pos_ventas_filtradas(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean);
