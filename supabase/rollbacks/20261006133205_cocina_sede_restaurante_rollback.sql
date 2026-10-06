-- Reversión de 20261006133205_cocina_sede_restaurante: vuelve a la definición de
-- fn_lineas_a_cocina aplicada en 20261006124814 (solo organizations.type_id = 1 cuenta como
-- restaurante). Firma, seguridad y permisos no cambian. No toca datos: las comandas creadas
-- mientras rigió la regla nueva se quedan.

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
  rest as (select coalesce((select o.type_id = 1 from public.organizations o where o.id = p_organization_id), false) as es)
  select l.id, l.station
    from lineas l, hay, rest
   where (coalesce(hay.alguna, false) and l.preparable)
      or (not coalesce(hay.alguna, false) and rest.es)
$f$;

comment on function public.fn_lineas_a_cocina(integer, uuid[]) is
  'Líneas de venta que van a cocina, con su estación: las preparables (requires_preparation o estación). Si no hay ninguna y la organización es restaurante, todas. Regla única de E2 (confirmación web) y E3 (pedido web a la mesa).';

revoke all on function public.fn_lineas_a_cocina(integer, uuid[]) from public, anon;
grant execute on function public.fn_lineas_a_cocina(integer, uuid[]) to authenticated, service_role;
