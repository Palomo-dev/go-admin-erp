-- Inventario B5 · Recetas, costo de recetas y pestaña «Producción» del producto
-- (INVENTARIO-PLAN.md §5.6; docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §3).
--
-- El costo de una receta sale SIEMPRE de fn_receta_costo (promedio de la fila sin
-- lote de la sucursal → costo vigente → sin costo; cantidad de
-- fn_receta_int_calcular), que es la misma regla con que sale el ingrediente al
-- vender (fn_inv_int_mover_fila → avg_cost de la fila → fn_costo_unitario_producto).
-- El reporte deja de calcular en TypeScript (CostoRecetasService: máximo avg_cost
-- entre sucursales y sin conversiones).
--
--   fn_recetas_listado           una fila por producto con receta (la versión activa o,
--                                si no hay, la última), costo y margen en la sucursal
--                                elegida, filtros, orden, paginado y KPI (ver)
--   fn_receta_versiones          versiones de la receta de un producto con su costo por
--                                unidad, autor y órdenes (ver)
--   fn_receta_desactivar         deja de descontar ingredientes; las órdenes abiertas
--                                siguen con su versión (mismo permiso que guardar)
--   fn_receta_reactivar          copia una versión anterior como versión nueva
--   (pestaña «Producción»: fn_producto_produccion_resumen y fn_producto_distribucion
--    en 20260929150250_inv_b5_3b_producto_produccion)

-- Nota: fn_recetas_listado se volvió a aplicar el mismo día (create or replace por el MCP)
-- con los decimales y el inventario del producto y el margen nulo cuando la receta no
-- tiene ningún costo; este archivo trae la definición viva.

-- ── Listado de recetas (pantalla Recetas y reporte Costo de recetas) ────────
-- p_filtros: sucursal (costos), busqueda, estado ('activas'|'inactivas'|'todas'),
-- modo ('al_producir'|'al_vender'), costo ('incompleto'), margen_bajo (bool),
-- producto, orden ('producto'|'costo'|'margen'|'fecha'), direccion, desde_fila, limite.
create or replace function public.fn_recetas_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_mes timestamptz := date_trunc('month', (now() at time zone public.fn_timezone_for(p_org, null))::date)::timestamp
                       at time zone public.fn_timezone_for(p_org, null);
  v_branch integer := case when coalesce(f->>'sucursal', '') ~ '^[0-9]{1,9}$' then (f->>'sucursal')::integer end;
  v_busq text := nullif(btrim(coalesce(f->>'busqueda', '')), '');
  v_estado text := coalesce(nullif(f->>'estado', ''), 'todas');
  v_modo text := nullif(f->>'modo', '');
  v_incompleto boolean := coalesce(f->>'costo', '') = 'incompleto';
  v_margen_bajo boolean := coalesce((f->>'margen_bajo')::boolean, false);
  v_producto integer := case when coalesce(f->>'producto', '') ~ '^[0-9]{1,9}$' then (f->>'producto')::integer end;
  v_orden text := coalesce(nullif(f->>'orden', ''), 'producto');
  v_asc boolean := coalesce(f->>'direccion', case when coalesce(nullif(f->>'orden', ''), 'producto') = 'producto' then 'asc' else 'desc' end) = 'asc';
  v_offset integer := greatest(case when coalesce(f->>'desde_fila', '') ~ '^[0-9]{1,9}$' then (f->>'desde_fila')::integer else 0 end, 0);
  v_limite integer := least(greatest(case when coalesce(f->>'limite', '') ~ '^[0-9]{1,9}$' then (f->>'limite')::integer else 25 end, 1), 500);
  v_umbral numeric := 0.30;
  v_permisos jsonb;
  v_ver boolean;
  v_filas jsonb;
  v_total integer;
  v_kpi jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_permisos := public.fn_inventario_permisos(p_org);
  v_ver := coalesce((v_permisos->>'costos')::boolean, false);
  if v_branch is not null and not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;

  with a as materialized (
    select r.id as recipe_id, r.product_id, r.name as nombre, coalesce(r.version, 1) as version,
           coalesce(r.is_active, false) as activa, coalesce(nullif(r.yield_qty, 0), 1) as rinde,
           nullif(upper(btrim(coalesce(r.yield_unit_code, ''))), '') as unidad_rinde, r.created_at as creada,
           p.name as producto, p.sku, upper(btrim(coalesce(p.unit_code, 'UN'))) as unidad,
           case when p.production_type = 'preparation' then 'al_producir' else 'al_vender' end as modo,
           p.parent_product_id is not null as variante,
           public.fn_produccion_int_decimales(p.id) as decimales, coalesce(p.track_stock, false) as track_stock,
           (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id)::integer as ingredientes,
           public.fn_receta_costo(p_org, v_branch, jsonb_build_object('recipe_id', r.id)) as costo,
           (select pp.price from public.product_prices pp
             where pp.product_id = r.product_id and pp.effective_from <= now()
               and (pp.effective_to is null or pp.effective_to > now())
             order by pp.effective_from desc, pp.id desc limit 1) as precio,
           (select count(*) from public.production_orders o
             where o.organization_id = p_org and o.product_id = r.product_id
               and o.status in ('draft', 'confirmed', 'in_progress'))::integer as abiertas
      from (select distinct on (x.product_id) x.*
              from public.product_recipes x
             where x.organization_id = p_org
             order by x.product_id, x.is_active desc nulls last, x.version desc nulls last, x.id desc) r
      join public.products p on p.id = r.product_id
     where p.status <> 'deleted'
       and (v_producto is null or r.product_id = v_producto)
  ), b as materialized (
    select a.*,
           (a.costo->>'costo_unidad')::numeric as costo_unidad,
           (a.costo->>'costo_tanda')::numeric as costo_tanda,
           coalesce((a.costo->>'completo')::boolean, false) as completo,
           coalesce((a.costo->>'lineas_sin_costo')::integer, 0) as sin_costo,
           coalesce((a.costo->>'lineas_con_error')::integer, 0) as con_error,
           case
             when coalesce((a.costo->>'lineas_con_error')::integer, 0) > 0 then 'sin_conversion'
             when coalesce((a.costo->>'lineas_sin_costo')::integer, 0) > 0 then 'sin_costo'
             when exists (select 1 from jsonb_array_elements(a.costo->'lineas') l
                           where l->>'fuente' = 'costo_vigente' and not coalesce((l->>'opcional')::boolean, false))
               then 'costo_vigente'
             else 'promedio_sucursal' end as fuente,
           -- Sin ningún costo (todo el costo en 0 e incompleto) el margen no significa nada: null.
           case when v_ver and coalesce(a.precio, 0) > 0 and (a.costo->>'costo_unidad') is not null
                     and not ((a.costo->>'costo_unidad')::numeric = 0 and not coalesce((a.costo->>'completo')::boolean, false))
                then round((a.precio - (a.costo->>'costo_unidad')::numeric) / a.precio, 4) end as margen
      from a
  ), v as (
    -- Ventas pagadas de los últimos 30 días (margen ponderado del reporte).
    select si.product_id, sum(si.quantity) as vendidas, sum(si.quantity * si.unit_price) as ventas
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
     where s.organization_id = p_org and s.status = 'paid' and s.sale_date >= now() - interval '30 days'
       and si.product_id in (select a.product_id from a)
     group by si.product_id
  ), base as (
    select b.* from b
     where (v_estado = 'todas' or (v_estado = 'activas' and b.activa) or (v_estado = 'inactivas' and not b.activa))
       and (v_modo is null or b.modo = v_modo)
       and (not v_incompleto or not b.completo)
       and (not v_margen_bajo or (b.margen is not null and b.margen < v_umbral))
       and (v_busq is null or b.producto ilike '%' || v_busq || '%' or coalesce(b.sku, '') ilike '%' || v_busq || '%'
            or coalesce(b.nombre, '') ilike '%' || v_busq || '%')
  ), numeradas as (
    select base.*, row_number() over (
             order by case when v_orden = 'costo' and v_asc then base.costo_unidad end asc nulls last,
                      case when v_orden = 'costo' and not v_asc then base.costo_unidad end desc nulls last,
                      case when v_orden = 'margen' and v_asc then base.margen end asc nulls last,
                      case when v_orden = 'margen' and not v_asc then base.margen end desc nulls last,
                      case when v_orden = 'fecha' and v_asc then base.creada end asc,
                      case when v_orden = 'fecha' and not v_asc then base.creada end desc,
                      case when v_orden = 'producto' and not v_asc then lower(base.producto) end desc,
                      lower(base.producto) asc, base.recipe_id) as ord
      from base
  )
  select
    (select count(*) from base),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', n.recipe_id,
               'product_id', n.product_id,
               'nombre', n.nombre,
               'version', n.version,
               'activa', n.activa,
               'rinde', n.rinde,
               'unidad_rinde', coalesce(n.unidad_rinde, n.unidad),
               'creada_en', n.creada,
               'producto', jsonb_build_object('id', n.product_id, 'nombre', n.producto, 'sku', n.sku, 'unidad', n.unidad,
                                              'decimales', n.decimales, 'track_stock', n.track_stock,
                                              'variante', n.variante),
               'modo', n.modo,
               'ingredientes', n.ingredientes,
               'costo_tanda', case when v_ver then n.costo_tanda end,
               'costo_unidad', case when v_ver then n.costo_unidad end,
               'completo', n.completo,
               'lineas_sin_costo', n.sin_costo,
               'lineas_con_error', n.con_error,
               'fuente', n.fuente,
               'precio', n.precio,
               'margen', n.margen,
               'ordenes_abiertas', n.abiertas) order by n.ord)
        from numeradas n where n.ord > v_offset and n.ord <= v_offset + v_limite), '[]'::jsonb),
    jsonb_build_object(
      'activas', (select count(*) from b where b.activa),
      'inactivas', (select count(*) from b where not b.activa),
      'completas', (select count(*) from b where b.activa and b.completo),
      'costo_incompleto', (select count(*) from b where b.activa and not b.completo),
      'margen_bajo', (select count(*) from b where b.activa and b.margen is not null and b.margen < v_umbral),
      'umbral_margen', v_umbral,
      'ingredientes_sin_costo', (
        select count(distinct (l->>'ingredient_product_id'))
          from b, jsonb_array_elements(b.costo->'lineas') l
         where b.activa and l->>'fuente' = 'sin_costo' and l->>'error' is null
           and not coalesce((l->>'opcional')::boolean, false)),
      'margen_ponderado', case when v_ver then (
        select round(sum(v.ventas - b.costo_unidad * v.vendidas) / nullif(sum(v.ventas), 0), 4)
          from b join v on v.product_id = b.product_id
         where b.activa and b.margen is not null and v.vendidas > 0 and v.ventas > 0) end,
      'ordenes_mes', (select count(*) from public.production_orders o
                       where o.organization_id = p_org and o.created_at >= v_mes))
    into v_total, v_filas, v_kpi;


  return jsonb_build_object('filas', v_filas, 'total', v_total, 'kpi', v_kpi, 'permisos', v_permisos,
    'sucursal', v_branch);
end;
$$;

revoke all on function public.fn_recetas_listado(integer, jsonb) from public, anon;
grant execute on function public.fn_recetas_listado(integer, jsonb) to authenticated, service_role;

-- ── Versiones ───────────────────────────────────────────────────────────────
create or replace function public.fn_receta_versiones(p_org integer, p_product integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ver boolean;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if not exists (select 1 from public.products p where p.id = p_product and p.organization_id = p_org) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  v_ver := public.fn_receta_int_puede_ver_costos(p_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'recipe_id', r.id,
             'version', coalesce(r.version, 1),
             'nombre', r.name,
             'activa', coalesce(r.is_active, false),
             'creada_en', r.created_at,
             'autor', public.fn_produccion_int_nombre(r.created_by),
             'rinde', coalesce(nullif(r.yield_qty, 0), 1),
             'ingredientes', (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id),
             'costo_unidad', case when v_ver then
                (public.fn_receta_costo(p_org, p_branch, jsonb_build_object('recipe_id', r.id))->>'costo_unidad')::numeric end,
             'ordenes', (select count(*) from public.production_orders o where o.recipe_id = r.id),
             'ordenes_abiertas', (select count(*) from public.production_orders o
                                   where o.recipe_id = r.id and o.status in ('draft', 'confirmed', 'in_progress')))
           order by coalesce(r.version, 1) desc, r.id desc)
      from public.product_recipes r
     where r.organization_id = p_org and r.product_id = p_product), '[]'::jsonb);
end;
$$;

revoke all on function public.fn_receta_versiones(integer, integer, integer) from public, anon;
grant execute on function public.fn_receta_versiones(integer, integer, integer) to authenticated, service_role;

-- ── Desactivar ──────────────────────────────────────────────────────────────
create or replace function public.fn_receta_desactivar(p_org integer, p_recipe_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_r record;
  v_abiertas integer;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);
  select r.id, r.product_id, r.is_active into v_r from public.product_recipes r
   where r.id = p_recipe_id and r.organization_id = p_org for update;
  if not found then
    raise exception 'receta_no_encontrada' using errcode = 'P0002';
  end if;
  if not coalesce(v_r.is_active, false) then
    raise exception 'receta_inactiva' using errcode = '22023';
  end if;
  update public.product_recipes set is_active = false, updated_at = now() where id = v_r.id;
  -- Sin recetas activas (propia ni de variantes) el producto deja de ser compuesto:
  -- el formulario la mostrará apagada y la venta descuenta el producto.
  update public.products p set is_composite = false, updated_at = now()
   where p.id = v_r.product_id and coalesce(p.is_composite, false)
     and not exists (select 1 from public.product_recipes r
                      where r.is_active and (r.product_id = p.id
                        or r.product_id in (select c.id from public.products c where c.parent_product_id = p.id)));
  select count(*) into v_abiertas from public.production_orders o
   where o.recipe_id = v_r.id and o.status in ('draft', 'confirmed', 'in_progress');
  return jsonb_build_object('recipe_id', v_r.id, 'ordenes_abiertas', v_abiertas);
end;
$$;

revoke all on function public.fn_receta_desactivar(integer, integer) from public, anon;
grant execute on function public.fn_receta_desactivar(integer, integer) to authenticated, service_role;

-- ── Reactivar (copia una versión como versión nueva) ────────────────────────
create or replace function public.fn_receta_reactivar(p_org integer, p_recipe_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_r jsonb;
begin
  v_r := public.fn_receta_int_a_jsonb(p_recipe_id);
  if v_r is null or (v_r->>'organization_id')::integer <> p_org then
    perform public.fn_assert_acceso_org(p_org);
    raise exception 'receta_no_encontrada' using errcode = 'P0002';
  end if;
  -- fn_receta_guardar exige el permiso, valida y crea la versión N+1 (o nada si es igual a la activa).
  return public.fn_receta_guardar(p_org, (v_r->>'product_id')::integer, v_r - 'recipe_id');
end;
$$;

revoke all on function public.fn_receta_reactivar(integer, integer) from public, anon;
grant execute on function public.fn_receta_reactivar(integer, integer) to authenticated, service_role;

