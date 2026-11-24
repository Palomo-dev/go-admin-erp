-- Reversión de 20261124213000_listas_precios_base.
-- ADVERTENCIA: NO RESTAURA DATOS. Borra las listas de precios, sus reglas, precios fijos y
-- asignaciones, el rastro price_list_id / list_base_price de ventas, cotizaciones y facturas, la
-- columna promotions.applies_with_price_lists y los dos permisos (con sus filas en role_permissions
-- y job_position_permissions).
-- Orden: primero revertir 20261124213200 y 20261124213100 (usan estas funciones y columnas).

set lock_timeout = '10s';

drop function if exists public.resolve_customer_prices(integer, uuid, integer[], text, integer);
drop function if exists public.fn_lista_precio_linea(integer, uuid, integer, numeric, text, integer, timestamptz);
drop function if exists public.fn_lista_precios_por_cantidad(jsonb, numeric, numeric);
drop function if exists public.fn_lista_precios_resolver(integer, uuid, integer[], integer, timestamptz);
drop function if exists public.fn_lista_precios_normalizar_marca(text);
drop function if exists public.fn_lista_precios_redondear(numeric, numeric, text);
drop function if exists public.fn_lista_precios_del_cliente(integer, uuid, text, integer, timestamptz);
drop function if exists public.fn_lista_precios_aplica(uuid, text, integer, timestamptz);
drop function if exists public.fn_lista_precios_hoy(integer, timestamptz);

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code in ('pos.listas_precios.gestionar', 'pos.precios.cambiar_en_venta'));
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code in ('pos.listas_precios.gestionar', 'pos.precios.cambiar_en_venta'));
delete from public.permissions where code in ('pos.listas_precios.gestionar', 'pos.precios.cambiar_en_venta');

drop index if exists public.sale_items_price_list_idx;
drop index if exists public.sales_price_list_idx;
alter table public.invoice_items drop column if exists price_list_id;
alter table public.quotation_items drop column if exists list_base_price;
alter table public.quotation_items drop column if exists price_list_id;
alter table public.quotations drop column if exists price_list_id;
alter table public.sale_items drop column if exists list_base_price;
alter table public.sale_items drop column if exists price_list_id;
alter table public.sales drop column if exists price_list_id;

alter table public.promotions drop column if exists applies_with_price_lists;

drop table if exists public.price_list_assignments;
drop table if exists public.price_list_items;
drop table if exists public.price_list_rules;
drop table if exists public.price_lists;
drop function if exists public.fn_listas_precios_misma_org();
