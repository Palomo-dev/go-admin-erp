-- Catálogo de productos por lotes, armado en el servidor.
--
-- Antes: el catálogo traía los productos de a 1.000 y, por cada lote, lanzaba
-- desde el navegador seis consultas más (historial completo de precios y
-- costos, stock, imágenes, variantes con su stock, modificadores), en serie.
-- Con un catálogo de 2.636 productos y 21.142 variantes eso eran decenas de
-- viajes al servidor antes de ver la lista completa.
--
-- Ahora: una llamada por lote devuelve cada producto padre listo para pintar,
-- con sus variantes dentro. Los lotes se pueden pedir en paralelo porque el
-- orden es total (columna elegida + id) y la respuesta trae el total filtrado.
--
-- Stock: `stock_levels` sale agrupado por sucursal (suma los lotes), tanto del
-- padre como de cada variante. El navegador suma padre + variantes por
-- sucursal para el badge; antes el badge solo veía las filas del padre.
--
-- `p_product_ids` sirve al tiempo real: dada una lista de productos o
-- variantes que cambiaron, devuelve sus padres (si siguen cumpliendo los
-- filtros) para reemplazar solo esas filas en vez de recargar todo.

create or replace function public.catalogo_productos_lote(
  p_organization_id integer,
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null,
  p_category_id integer default null,
  p_status text default null,
  p_sort_by text default 'name',
  p_product_ids integer[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_busqueda text := nullif(btrim(coalesce(p_search, '')), '');
  v_patron text;
  v_orden text := case
    when p_sort_by in ('name', 'sku', 'price', 'created_at', 'updated_at') then p_sort_by
    else 'name'
  end;
  v_con_eliminados boolean := coalesce(p_status in ('deleted', 'todos'), false);
  v_padres integer[];
  v_total bigint := 0;
  v_items jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if v_busqueda is not null then
    -- `%` y `_` escritos por el usuario se buscan literalmente.
    v_patron := '%' || replace(replace(replace(v_busqueda, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- 1. Padres del lote, en orden total, y el total filtrado (una sola pasada).
  select coalesce(array_agg(t.id order by t.fila), '{}'), coalesce(max(t.total), 0)
    into v_padres, v_total
  from (
    select k.id, k.fila, k.total
    from (
      select b.id,
             row_number() over (order by b.k_texto, b.k_precio nulls last, b.k_fecha, b.id) as fila,
             count(*) over () as total
      from (
        select p.id,
               case v_orden when 'name' then p.name when 'sku' then p.sku end as k_texto,
               case when v_orden = 'price' then (
                 select pp.price from product_prices pp
                 where pp.product_id = p.id
                   and (pp.effective_to is null or pp.effective_to > now())
                   and pp.effective_from <= now()
                 order by pp.effective_from desc
                 limit 1
               ) end as k_precio,
               case v_orden when 'created_at' then p.created_at when 'updated_at' then p.updated_at end as k_fecha
        from products p
      where p.organization_id = p_organization_id
        and p.parent_product_id is null
        and (
          p_product_ids is null
          or p.id in (
            select coalesce(x.parent_product_id, x.id)
            from products x
            where x.id = any(p_product_ids)
              and x.organization_id = p_organization_id
          )
        )
        and case
              when p_status is null then p.status <> 'deleted'
              when p_status = 'todos' then true
              else p.status = p_status
            end
        and (p_category_id is null or p.category_id = p_category_id)
        and (
          v_patron is null
          or p.name ilike v_patron
          or p.sku ilike v_patron
          or p.barcode ilike v_patron
          -- Escanear el código de una variante encuentra a su padre.
          or exists (
            select 1 from products h
            where h.parent_product_id = p.id
              and (h.sku ilike v_patron or h.barcode ilike v_patron)
          )
        )
      ) b
    ) k
    order by k.fila
    limit v_limit offset v_offset
  ) t;

  if cardinality(v_padres) = 0 then
    return jsonb_build_object('items', '[]'::jsonb, 'total', v_total);
  end if;

  -- 2. Padres + variantes, cada uno con lo que pinta la tabla.
  with ids as (
    select u.pid, u.ord, null::integer as padre
    from unnest(v_padres) with ordinality as u(pid, ord)
    union all
    select h.id, null::bigint, h.parent_product_id
    from products h
    where h.parent_product_id = any(v_padres)
      and (h.status <> 'deleted' or v_con_eliminados)
  ),
  fila as (
    select i.pid, i.ord, i.padre,
      jsonb_build_object(
        'id', p.id, 'uuid', p.uuid, 'organization_id', p.organization_id,
        'sku', p.sku, 'name', p.name, 'description', p.description,
        'category_id', p.category_id, 'unit_code', p.unit_code, 'barcode', p.barcode,
        'status', p.status, 'track_stock', p.track_stock,
        'parent_product_id', p.parent_product_id, 'is_parent', p.is_parent,
        'product_type', p.product_type, 'brand', p.brand, 'reference', p.reference,
        'variant_data', p.variant_data, 'station', p.station, 'tax_id', p.tax_id,
        'is_composite', p.is_composite, 'production_type', p.production_type,
        'created_at', p.created_at, 'updated_at', p.updated_at,
        'category', case when c.id is null then null
                         else jsonb_build_object('id', c.id, 'name', c.name) end,
        'product_prices', coalesce(pr.arr, '[]'::jsonb),
        'product_costs', coalesce(co.arr, '[]'::jsonb),
        'stock_levels', coalesce(st.arr, '[]'::jsonb),
        'product_images', coalesce(im.arr, '[]'::jsonb),
        'modifier_groups_count', coalesce(mo.n, 0)
      ) as j
    from ids i
    join products p on p.id = i.pid
    left join categories c on c.id = p.category_id
    left join lateral (
      select jsonb_build_array(jsonb_build_object(
               'id', pp.id, 'product_id', pp.product_id, 'price', pp.price,
               'compare_price', pp.compare_price,
               'effective_from', pp.effective_from, 'effective_to', pp.effective_to)) as arr
      from product_prices pp
      where pp.product_id = p.id
        and (pp.effective_to is null or pp.effective_to > now())
        and pp.effective_from <= now()
      order by pp.effective_from desc
      limit 1
    ) pr on true
    left join lateral (
      select jsonb_build_array(jsonb_build_object(
               'id', pc.id, 'product_id', pc.product_id, 'cost', pc.cost,
               'effective_from', pc.effective_from, 'effective_to', pc.effective_to)) as arr
      from product_costs pc
      where pc.product_id = p.id
        and (pc.effective_to is null or pc.effective_to > now())
        and pc.effective_from <= now()
      order by pc.effective_from desc
      limit 1
    ) co on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'branch_id', s.branch_id, 'qty_on_hand', s.qty, 'qty_reserved', s.reservado,
               'avg_cost', s.avg_cost) order by s.branch_id) as arr
      from (
        select sl.branch_id,
               sum(coalesce(sl.qty_on_hand, 0)) as qty,
               sum(coalesce(sl.qty_reserved, 0)) as reservado,
               max(sl.avg_cost) as avg_cost
        from stock_levels sl
        where sl.product_id = p.id
        group by sl.branch_id
      ) s
    ) st on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'id', pi.id, 'product_id', pi.product_id,
               'storage_path', pi.storage_path, 'is_primary', pi.is_primary)
             order by pi.display_order) as arr
      from product_images pi
      where pi.product_id = p.id
    ) im on true
    left join lateral (
      select count(*)::integer as n
      from product_modifier_groups mg
      where mg.product_id = p.id
    ) mo on true
  ),
  hijos as (
    select f.padre, jsonb_agg(f.j order by f.pid) as arr
    from fila f
    where f.padre is not null
    group by f.padre
  )
  select coalesce(
           jsonb_agg(f.j || jsonb_build_object('children', coalesce(h.arr, '[]'::jsonb)) order by f.ord),
           '[]'::jsonb)
    into v_items
  from fila f
  left join hijos h on h.padre = f.pid
  where f.padre is null;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

comment on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) is
  'Catálogo de productos por lotes: padres con precio y costo vigentes, stock por sucursal, imágenes, modificadores y variantes. Orden total (columna + id) para pedir lotes en paralelo. p_product_ids refresca solo los padres de esos productos.';

revoke all on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) from public, anon;
grant execute on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) to authenticated;
