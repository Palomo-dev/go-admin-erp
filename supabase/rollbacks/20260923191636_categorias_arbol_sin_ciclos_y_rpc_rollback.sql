-- Rollback de 20260923191636_categorias_arbol_sin_ciclos_y_rpc.sql
--
-- Quita el disparador anticiclos y las cuatro RPC del rediseño de categorías.
-- No toca datos: la migración no transformó filas. Lo que hayan hecho las RPC
-- mientras estuvieron vivas (categorías movidas, productos reasignados al
-- eliminar una categoría) queda como está.
--
-- Antes de aplicarlo, la pantalla /app/inventario/categorias debe volver a la
-- versión anterior: la nueva llama a estas funciones.

drop trigger if exists trg_categories_sin_ciclos on public.categories;
drop function if exists public.fn_categories_sin_ciclos();
drop function if exists public.categorias_listado(integer);
drop function if exists public.mover_categorias(integer, integer[], integer);
drop function if exists public.eliminar_categoria(integer, integer, integer);
drop function if exists public.categoria_conexiones(integer, integer);
