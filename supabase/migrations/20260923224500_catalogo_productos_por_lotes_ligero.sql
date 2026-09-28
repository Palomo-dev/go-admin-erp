-- Catálogo por lotes, versión ligera (sustituye el paso 2 de
-- 20260923223000_catalogo_productos_por_lotes).
--
-- Medido con el catálogo más grande (2.636 productos y 21.142 variantes): un
-- lote de 400 padres pesaba 4,3 MB y tardaba 3,2 s, porque cada variante
-- repetía todas las columnas del padre y calculaba precio, costo, stock,
-- imágenes y modificadores con una subconsulta por fila.
--
-- Ahora:
-- - precio, costo y stock se calculan por conjuntos para todo el lote;
-- - la variante solo lleva lo que usan la tabla, el stock por sucursal y la
--   exportación: identidad, estado, código de barras, atributos, precio,
--   precio de comparación, costo y stock por sucursal (sin imágenes, sin
--   descripción, sin modificadores ni categoría, que son los del padre).

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

  -- 2. Padres completos + variantes ligeras, calculado por conjuntos.
  with padres as (
    select u.pid, u.ord
    from unnest(v_padres) with ordinality as u(pid, ord)
  ),
  variantes as (
    select h.id, h.parent_product_id as padre
    from products h
    where h.parent_product_id = any(v_padres)
      and (h.status <> 'deleted' or v_con_eliminados)
  ),
  todos as (
    select pid as id from padres
    union all
    select id from variantes
  ),
  precio as (
    select distinct on (pp.product_id)
           pp.product_id, pp.id, pp.price, pp.compare_price, pp.effective_from, pp.effective_to
    from product_prices pp
    where pp.product_id in (select id from todos)
      and (pp.effective_to is null or pp.effective_to > now())
      and pp.effective_from <= now()
    order by pp.product_id, pp.effective_from desc
  ),
  costo as (
    select distinct on (pc.product_id)
           pc.product_id, pc.id, pc.cost, pc.effective_from, pc.effective_to
    from product_costs pc
    where pc.product_id in (select id from todos)
      and (pc.effective_to is null or pc.effective_to > now())
      and pc.effective_from <= now()
    order by pc.product_id, pc.effective_from desc
  ),
  stock as (
    -- Una fila por producto y sucursal (suma los lotes).
    select s.product_id,
           jsonb_agg(jsonb_build_object(
             'branch_id', s.branch_id, 'qty_on_hand', s.qty, 'qty_reserved', s.reservado
           ) order by s.branch_id) as arr
    from (
      select sl.product_id, sl.branch_id,
             sum(coalesce(sl.qty_on_hand, 0)) as qty,
             sum(coalesce(sl.qty_reserved, 0)) as reservado
      from stock_levels sl
      where sl.product_id in (select id from todos)
      group by sl.product_id, sl.branch_id
    ) s
    group by s.product_id
  ),
  imagenes as (
    select pi.product_id,
           jsonb_agg(jsonb_build_object(
             'id', pi.id, 'product_id', pi.product_id,
             'storage_path', pi.storage_path, 'is_primary', pi.is_primary
           ) order by pi.display_order) as arr
    from product_images pi
    where pi.product_id in (select pid from padres)
    group by pi.product_id
  ),
  modificadores as (
    select mg.product_id, count(*)::integer as n
    from product_modifier_groups mg
    where mg.product_id in (select pid from padres)
    group by mg.product_id
  ),
  hijos as (
    select v.padre,
           jsonb_agg(jsonb_build_object(
             'id', p.id, 'uuid', p.uuid, 'sku', p.sku, 'name', p.name,
             'parent_product_id', p.parent_product_id, 'status', p.status,
             'track_stock', p.track_stock, 'product_type', p.product_type,
             'barcode', p.barcode, 'variant_data', p.variant_data,
             'price', pr.price, 'compare_price', pr.compare_price, 'cost', co.cost,
             'stock_levels', coalesce(st.arr, '[]'::jsonb)
           ) order by p.id) as arr
    from variantes v
    join products p on p.id = v.id
    left join precio pr on pr.product_id = p.id
    left join costo co on co.product_id = p.id
    left join stock st on st.product_id = p.id
    group by v.padre
  )
  select coalesce(jsonb_agg(
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
             'product_prices', case when pr.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
                'id', pr.id, 'product_id', pr.product_id, 'price', pr.price,
                'compare_price', pr.compare_price,
                'effective_from', pr.effective_from, 'effective_to', pr.effective_to)) end,
             'product_costs', case when co.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
                'id', co.id, 'product_id', co.product_id, 'cost', co.cost,
                'effective_from', co.effective_from, 'effective_to', co.effective_to)) end,
             'stock_levels', coalesce(st.arr, '[]'::jsonb),
             'product_images', coalesce(im.arr, '[]'::jsonb),
             'modifier_groups_count', coalesce(mo.n, 0)
           ) || jsonb_build_object('children', coalesce(hi.arr, '[]'::jsonb))
           order by pa.ord), '[]'::jsonb)
    into v_items
  from padres pa
  join products p on p.id = pa.pid
  left join categories c on c.id = p.category_id
  left join precio pr on pr.product_id = p.id
  left join costo co on co.product_id = p.id
  left join stock st on st.product_id = p.id
  left join imagenes im on im.product_id = p.id
  left join modificadores mo on mo.product_id = p.id
  left join hijos hi on hi.padre = p.id;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

comment on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) is
  'Catálogo de productos por lotes: padres con precio y costo vigentes, stock por sucursal, imágenes y modificadores; variantes ligeras con precio, costo y stock por sucursal. Orden total (columna + id) para pedir lotes en paralelo. p_product_ids refresca solo los padres de esos productos.';

revoke all on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) from public, anon;
grant execute on function public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]) to authenticated;
