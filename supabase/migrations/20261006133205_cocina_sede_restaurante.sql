-- Comanda de una SEDE restaurante aunque la organización no lo sea.
--
-- Problema: `fn_lineas_a_cocina` (regla única de qué líneas van a cocina, la usan
-- `fn_confirmar_pedido_web_completo` y `pos_mesa_agregar_pedido_web`) manda TODAS las
-- líneas a cocina cuando ninguna es preparable solo si `organizations.type_id = 1`.
-- Un hotel (type_id 2) con una sucursal `branch_type = 'restaurant'` y sin estaciones
-- configuradas recibía el pedido «Comer aquí» en la mesa y en la caja, pero sin
-- comanda: la cocina nunca se enteraba.
--
-- Cambio: la organización cuenta como restaurante para esas líneas si es restaurante
-- POR GIRO o si la venta de las líneas es de una sede `branch_type = 'restaurant'`. Es
-- la misma regla que ya usa el ERP para la carta (`esRestaurante` de
-- src/lib/website/carta.server.ts, B/13-07 nota 6). Las líneas preparables siguen
-- mandando como antes; firma, seguridad (invoker), permisos y comentario no cambian.
--
-- ENSAYO (2026-10-06, bloque `do` deshecho con raise exception, como authenticated con
-- request.jwt.claims): fn_alta_organizacion (hotel, plan business) + sucursal
-- branch_type 'restaurant' + mesa + web_order dine_in →
--   ENSAYO_OK pos_mesa_agregar_pedido_web kitchen_ticket_id=<id> kt_sede=<sede restaurante>
--   items_kt=1 | lineas_cocina en la sede principal del hotel (sin tipo) = 0.
--   Antes del cambio, el mismo escenario devolvía kitchen_ticket_id=null.

create or replace function public.fn_lineas_a_cocina(
  p_organization_id integer,
  p_sale_item_ids uuid[]
)
returns table (sale_item_id uuid, station text)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $f$
  with lineas as (
    select si.id,
           nullif(coalesce(e.station, ''), '') as station,
           coalesce(e.requires_preparation, false) or coalesce(e.station, '') <> '' as preparable
      from public.sale_items si
      left join public.fn_estaciones_efectivas(
             p_organization_id,
             array(select distinct s2.product_id from public.sale_items s2
                    where s2.id = any(p_sale_item_ids) and s2.product_id is not null)
           ) e on e.product_id = si.product_id
     where si.id = any(p_sale_item_ids)
  ),
  hay as (select bool_or(preparable) as alguna from lineas),
  rest as (
    select coalesce((select o.type_id = 1 from public.organizations o where o.id = p_organization_id), false)
        or exists (
             select 1
               from public.sale_items si
               join public.sales s on s.id = si.sale_id and s.organization_id = p_organization_id
               join public.branches b on b.id = s.branch_id and b.organization_id = p_organization_id
              where si.id = any(p_sale_item_ids)
                and b.branch_type = 'restaurant'
           ) as es
  )
  select l.id, l.station
    from lineas l, hay, rest
   where (coalesce(hay.alguna, false) and l.preparable)
      or (not coalesce(hay.alguna, false) and rest.es)
$f$;

comment on function public.fn_lineas_a_cocina(integer, uuid[]) is
  'Líneas de venta que van a cocina, con su estación: las preparables (requires_preparation o estación). Si no hay ninguna y la organización es restaurante (por giro o porque la venta es de una sede branch_type restaurant), todas. Regla única de E2 (confirmación web) y E3 (pedido web a la mesa).';

revoke all on function public.fn_lineas_a_cocina(integer, uuid[]) from public, anon;
grant execute on function public.fn_lineas_a_cocina(integer, uuid[]) to authenticated, service_role;
