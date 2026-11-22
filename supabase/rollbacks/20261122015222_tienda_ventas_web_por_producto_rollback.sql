-- Reversión de 20261122015222_tienda_ventas_web_por_producto.
-- La tienda (goadmin-websites, lib/supabase/queries.ts) vuelve a la consulta paginada si la RPC no existe.
drop function if exists public.fn_tienda_ventas_web_por_producto(integer);
