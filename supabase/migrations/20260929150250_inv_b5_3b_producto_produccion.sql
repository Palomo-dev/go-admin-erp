-- Inventario B5 · Pestaña «Producción» del detalle de producto (continúa 20260929150200_inv_b5_3_recetas).
-- Se separa solo por tamaño: la aplicación por el MCP se corta con archivos grandes.

-- ── Pestaña «Producción» del detalle de producto ────────────────────────────
create or replace function public.fn_producto_produccion_resumen(p_org integer, p_product integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_p record;
  v_ef record;
  v_propia record;
  v_usado jsonb;
  v_n_usado integer;
  v_ordenes integer;
  v_abiertas integer;
  v_traslados integer;
  v_movs integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  select p.id, p.name, p.track_stock, p.is_composite, p.production_type, p.parent_product_id, p.is_parent,
         upper(btrim(coalesce(p.unit_code, 'UN'))) as unidad
    into v_p
    from public.products p where p.id = p_product and p.organization_id = p_org;
  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  select * into v_ef from public.fn_receta_efectiva(p_product);
  select r.id, r.version, r.name, r.created_at, r.is_active into v_propia
    from public.product_recipes r where r.product_id = p_product and r.is_active limit 1;

  select count(*), coalesce(jsonb_agg(jsonb_build_object('recipe_id', x.id, 'product_id', x.product_id,
           'producto', x.producto, 'version', x.version) order by x.producto) filter (where x.rn <= 50), '[]'::jsonb)
    into v_n_usado, v_usado
    from (select r.id, r.product_id, p.name as producto, coalesce(r.version, 1) as version,
                 row_number() over (order by p.name) as rn
            from public.product_recipes r
            join public.products p on p.id = r.product_id
           where r.organization_id = p_org and r.is_active
             and exists (select 1 from public.recipe_ingredients ri
                          where ri.recipe_id = r.id and ri.ingredient_product_id = p_product)) x;

  select count(*), count(*) filter (where o.status in ('draft', 'confirmed', 'in_progress'))
    into v_ordenes, v_abiertas
    from public.production_orders o where o.organization_id = p_org and o.product_id = p_product;
  select count(distinct t.id) into v_traslados
    from public.inventory_transfers t join public.transfer_items ti on ti.inventory_transfer_id = t.id
   where t.organization_id = p_org and ti.product_id = p_product;
  select count(*) into v_movs from public.stock_movements m
   where m.organization_id = p_org and m.product_id = p_product and m.source = 'production';

  return jsonb_build_object(
    'producto', jsonb_build_object('id', v_p.id, 'nombre', v_p.name, 'unidad', v_p.unidad,
                                   'track_stock', coalesce(v_p.track_stock, false),
                                   'es_padre', coalesce(v_p.is_parent, false),
                                   'parent_product_id', v_p.parent_product_id,
                                   'modo', case when v_p.production_type = 'preparation' then 'al_producir' else 'al_vender' end,
                                   'decimales', public.fn_produccion_int_decimales(v_p.id)),
    'receta_efectiva', case when v_ef.recipe_id is not null then jsonb_build_object(
        'recipe_id', v_ef.recipe_id, 'product_id', v_ef.product_id, 'heredada', v_ef.heredada,
        'al_producir', v_ef.al_producir,
        'version', (select coalesce(r.version, 1) from public.product_recipes r where r.id = v_ef.recipe_id)) end,
    'receta_propia', case when v_propia.id is not null then jsonb_build_object(
        'recipe_id', v_propia.id, 'version', coalesce(v_propia.version, 1), 'nombre', v_propia.name,
        'creada_en', v_propia.created_at) end,
    'versiones', (select count(*) from public.product_recipes r where r.product_id = p_product),
    'variantes_con_receta', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', c.id, 'nombre', c.name, 'recipe_id', r.id,
                                          'version', coalesce(r.version, 1)) order by c.name)
        from public.products c join public.product_recipes r on r.product_id = c.id and r.is_active
       where c.parent_product_id = p_product and c.status <> 'deleted'), '[]'::jsonb),
    'usado_en', v_usado,
    'usado_en_total', v_n_usado,
    'ordenes', v_ordenes,
    'ordenes_abiertas', v_abiertas,
    'traslados', v_traslados,
    'movimientos_produccion', v_movs,
    'conversiones', coalesce((
      select jsonb_agg(jsonb_build_object('id', uc.id, 'de', upper(btrim(uc.from_unit_code)), 'a', upper(btrim(uc.to_unit_code)),
                                          'factor', uc.factor,
                                          'alcance', case when uc.organization_id is null then 'global' else 'organizacion' end)
                       order by uc.organization_id nulls last, uc.id)
        from public.unit_conversions uc
       where (uc.organization_id = p_org or uc.organization_id is null)
         and (upper(btrim(uc.from_unit_code)) = v_p.unidad or upper(btrim(uc.to_unit_code)) = v_p.unidad)), '[]'::jsonb),
    'mostrar', coalesce(v_p.is_composite, false) or v_ef.recipe_id is not null or v_n_usado > 0 or v_ordenes > 0
               or exists (select 1 from public.product_recipes r where r.product_id = p_product),
    'permisos', public.fn_inventario_permisos(p_org),
    'editar_receta', coalesce((public.fn_productos_permisos(p_org)->>'editar')::boolean, false));
end;
$$;

revoke all on function public.fn_producto_produccion_resumen(integer, integer) from public, anon;
grant execute on function public.fn_producto_produccion_resumen(integer, integer) to authenticated, service_role;

create or replace function public.fn_producto_distribucion(p_org integer, p_product integer, p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if not exists (select 1 from public.products p where p.id = p_product and p.organization_id = p_org) then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(x.fila order by x.creado desc, x.id desc)
      from (
        select t.id, t.created_at as creado, jsonb_build_object(
                 'id', t.id, 'codigo', coalesce(t.code, 'TR-' || t.id), 'estado', t.status,
                 'origen', jsonb_build_object('id', o.id, 'nombre', o.name),
                 'destino', jsonb_build_object('id', d.id, 'nombre', d.name),
                 'enviado', sum(ti.quantity), 'recibido', sum(coalesce(ti.received_qty, 0)),
                 'orden_produccion', case when t.production_order_id is not null then
                    jsonb_build_object('id', t.production_order_id, 'numero', 'OP-' || t.production_order_id) end,
                 'creado_en', t.created_at) as fila
          from public.inventory_transfers t
          join public.transfer_items ti on ti.inventory_transfer_id = t.id and ti.product_id = p_product
          join public.branches o on o.id = t.origin_branch_id
          join public.branches d on d.id = t.dest_branch_id
         where t.organization_id = p_org
         group by t.id, o.id, d.id
         order by t.created_at desc, t.id desc
         limit least(greatest(coalesce(p_limite, 50), 1), 200)) x), '[]'::jsonb);
end;
$$;

revoke all on function public.fn_producto_distribucion(integer, integer, integer) from public, anon;
grant execute on function public.fn_producto_distribucion(integer, integer, integer) to authenticated, service_role;
