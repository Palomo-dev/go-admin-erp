-- «Etiquetas de producto» (tags de clasificación, /app/inventario/etiquetas).
--
-- La pantalla contaba los productos de cada etiqueta con UNA consulta por
-- etiqueta (729 etiquetas = 729 peticiones) y solo miraba
-- product_tag_relations, aunque products.tag_id (columna heredada) también
-- asigna etiquetas y tiene FK sin cascada: borrar una etiqueta en uso por esa
-- columna fallaba con error de clave foránea.
--
--   * etiquetas_producto_listado: etiquetas con productos (relaciones +
--     products.tag_id, sin eliminados) y uso en reglas de categoría.
--   * etiquetas_producto_resumen: productos etiquetados y total del catálogo.
--   * etiquetas_producto_fusionar: pasa productos, products.tag_id y reglas de
--     categoría de las etiquetas origen a la destino y borra las origen.
--   * etiquetas_producto_eliminar: borra etiquetas (sus relaciones caen por
--     cascada y products.tag_id se limpia). No borra las que están en reglas de
--     categoría: habría que editar la regla primero.
--
-- SECURITY DEFINER con fn_assert_acceso_org y sin anon.

create or replace function public.etiquetas_producto_listado(p_org integer)
returns table (
  id integer,
  name text,
  color text,
  created_at timestamptz,
  productos integer,
  reglas integer,
  regla_categoria text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.fn_assert_acceso_org(p_org);
  return query
  with usos as (
    select r.tag_id, r.product_id
    from public.product_tag_relations r
    join public.products p on p.id = r.product_id
    where p.organization_id = p_org and coalesce(p.status, 'active') <> 'deleted'
    union
    select p.tag_id, p.id
    from public.products p
    where p.organization_id = p_org and p.tag_id is not null and coalesce(p.status, 'active') <> 'deleted'
  ),
  conteo as (
    select u.tag_id, count(distinct u.product_id)::integer as n
    from usos u
    group by u.tag_id
  ),
  en_reglas as (
    select t.id as tag_id, count(cr.id)::integer as n, min(c.name) as categoria
    from public.product_tags t
    join public.category_rules cr
      on cr.organization_id = p_org
     and cr.field = 'tag'
     and (cr.value = t.id::text or t.id::text = any(coalesce(cr.value_array, '{}')))
    left join public.categories c on c.id = cr.category_id
    where t.organization_id = p_org
    group by t.id
  )
  select t.id, t.name, t.color, t.created_at,
         coalesce(co.n, 0), coalesce(er.n, 0), er.categoria
  from public.product_tags t
  left join conteo co on co.tag_id = t.id
  left join en_reglas er on er.tag_id = t.id
  where t.organization_id = p_org
  order by lower(t.name), t.id;
end;
$$;

create or replace function public.etiquetas_producto_resumen(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_etiquetados integer;
  v_total integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  select count(distinct x.product_id)::integer into v_etiquetados
  from (
    select r.product_id
    from public.product_tag_relations r
    join public.products p on p.id = r.product_id
    where p.organization_id = p_org and coalesce(p.status, 'active') <> 'deleted'
    union
    select p.id
    from public.products p
    where p.organization_id = p_org and p.tag_id is not null and coalesce(p.status, 'active') <> 'deleted'
  ) x;
  select count(*)::integer into v_total
  from public.products p
  where p.organization_id = p_org and coalesce(p.status, 'active') <> 'deleted';
  return jsonb_build_object('productos_etiquetados', v_etiquetados, 'productos_total', v_total);
end;
$$;

create or replace function public.etiquetas_producto_fusionar(
  p_org integer,
  p_destino integer,
  p_origenes integer[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origenes integer[];
  v_productos integer := 0;
  v_n integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  if not exists (select 1 from public.product_tags t where t.id = p_destino and t.organization_id = p_org) then
    raise exception 'etiqueta_destino_invalida' using errcode = '22023';
  end if;

  select array_agg(t.id) into v_origenes
  from public.product_tags t
  where t.organization_id = p_org
    and t.id = any(coalesce(p_origenes, '{}'))
    and t.id <> p_destino;

  if v_origenes is null then
    return 0;
  end if;

  insert into public.product_tag_relations (product_id, tag_id)
  select distinct r.product_id, p_destino
  from public.product_tag_relations r
  where r.tag_id = any(v_origenes)
  on conflict (product_id, tag_id) do nothing;
  get diagnostics v_n = row_count;
  v_productos := v_productos + v_n;

  update public.products p
  set tag_id = p_destino, updated_at = now()
  where p.organization_id = p_org and p.tag_id = any(v_origenes);
  get diagnostics v_n = row_count;
  v_productos := v_productos + v_n;

  update public.category_rules cr
  set value = case when cr.value = any(v_origenes::text[]) then p_destino::text else cr.value end,
      value_array = (
        select coalesce(array_agg(distinct case when v = any(v_origenes::text[]) then p_destino::text else v end), '{}')
        from unnest(coalesce(cr.value_array, '{}')) as v
      ),
      updated_at = now()
  where cr.organization_id = p_org
    and cr.field = 'tag'
    and (cr.value = any(v_origenes::text[]) or coalesce(cr.value_array, '{}') && v_origenes::text[]);

  delete from public.product_tags t
  where t.organization_id = p_org and t.id = any(v_origenes);

  return v_productos;
end;
$$;

create or replace function public.etiquetas_producto_eliminar(p_org integer, p_ids integer[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_n integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  select array_agg(t.id) into v_ids
  from public.product_tags t
  where t.organization_id = p_org and t.id = any(coalesce(p_ids, '{}'));

  if v_ids is null then
    return 0;
  end if;

  if exists (
    select 1 from public.category_rules cr
    where cr.organization_id = p_org
      and cr.field = 'tag'
      and (cr.value = any(v_ids::text[]) or coalesce(cr.value_array, '{}') && v_ids::text[])
  ) then
    raise exception 'etiqueta_en_reglas: hay reglas de categoría que usan alguna de estas etiquetas' using errcode = 'P0001';
  end if;

  update public.products p
  set tag_id = null, updated_at = now()
  where p.organization_id = p_org and p.tag_id = any(v_ids);

  delete from public.product_tags t
  where t.organization_id = p_org and t.id = any(v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.etiquetas_producto_listado(integer) from public, anon;
revoke all on function public.etiquetas_producto_resumen(integer) from public, anon;
revoke all on function public.etiquetas_producto_fusionar(integer, integer, integer[]) from public, anon;
revoke all on function public.etiquetas_producto_eliminar(integer, integer[]) from public, anon;
grant execute on function public.etiquetas_producto_listado(integer) to authenticated, service_role;
grant execute on function public.etiquetas_producto_resumen(integer) to authenticated, service_role;
grant execute on function public.etiquetas_producto_fusionar(integer, integer, integer[]) to authenticated, service_role;
grant execute on function public.etiquetas_producto_eliminar(integer, integer[]) to authenticated, service_role;
