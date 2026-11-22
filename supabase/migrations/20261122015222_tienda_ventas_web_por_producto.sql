-- «Más vendidos» de la tienda (incidente 2026-11-21): la suma de unidades vendidas
-- por producto se hace en la base, en una sola consulta, en vez de que la tienda
-- traiga miles de filas de web_order_items página por página.
-- Solo para el servidor de la tienda (service_role).
create or replace function public.fn_tienda_ventas_web_por_producto(p_organization_id integer)
returns table (product_id integer, cantidad numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select i.product_id, sum(coalesce(i.quantity, 1)) as cantidad
    from public.web_order_items i
    join public.web_orders w on w.id = i.web_order_id
   where w.organization_id = p_organization_id
     and i.product_id is not null
   group by i.product_id
$$;

comment on function public.fn_tienda_ventas_web_por_producto(integer) is
  'Unidades vendidas en la tienda web por producto de una organización (todos los pedidos web, como el cálculo anterior). Solo service_role.';

revoke all on function public.fn_tienda_ventas_web_por_producto(integer) from public, anon, authenticated;
grant execute on function public.fn_tienda_ventas_web_por_producto(integer) to service_role;
