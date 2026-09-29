-- Inventario B5 · Lectura de producción: listado y detalle (continúa 20260929150100_inv_b5_2_produccion).
-- Se separa solo por tamaño: la aplicación por el MCP se corta con archivos grandes.

-- ── Listado ─────────────────────────────────────────────────────────────────
-- p_filtros: busqueda, estados[], sucursal, producto, desde/hasta (YYYY-MM-DD en
-- la zona de la org), periodo ('mes'), orden ('fecha'|'numero'), direccion,
-- desde_fila, limite.
create or replace function public.fn_produccion_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date := (now() at time zone public.fn_timezone_for(p_org, null))::date;
  v_mes timestamptz;
  v_busq text := nullif(btrim(coalesce(f->>'busqueda', '')), '');
  v_num integer;
  v_estados text[];
  v_sucursal integer := case when coalesce(f->>'sucursal', '') ~ '^[0-9]{1,9}$' then (f->>'sucursal')::integer end;
  v_producto integer := case when coalesce(f->>'producto', '') ~ '^[0-9]{1,9}$' then (f->>'producto')::integer end;
  v_desde date;
  v_hasta date;
  v_por_num boolean := coalesce(f->>'orden', 'fecha') = 'numero';
  v_asc boolean := coalesce(f->>'direccion', 'desc') = 'asc';
  v_offset integer := greatest(case when coalesce(f->>'desde_fila', '') ~ '^[0-9]{1,9}$' then (f->>'desde_fila')::integer else 0 end, 0);
  v_limite integer := least(greatest(case when coalesce(f->>'limite', '') ~ '^[0-9]{1,9}$' then (f->>'limite')::integer else 25 end, 1), 500);
  v_permisos jsonb;
  v_ver boolean;
  v_filas jsonb;
  v_total integer;
  v_kpi jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_permisos := public.fn_inventario_permisos(p_org);
  v_ver := coalesce((v_permisos->>'costos')::boolean, false);
  v_mes := date_trunc('month', v_hoy)::timestamp at time zone v_tz;
  if v_sucursal is not null and not exists (select 1 from public.branches b where b.id = v_sucursal and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if v_busq ~* '^(op-?)?0*[0-9]{1,9}$' then
    v_num := regexp_replace(v_busq, '[^0-9]', '', 'g')::integer;
  end if;
  if jsonb_typeof(f->'estados') = 'array' then
    select array_agg(x) into v_estados from jsonb_array_elements_text(f->'estados') x
     where x in ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled');
  end if;
  if coalesce(f->>'desde', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_desde := (f->>'desde')::date; end if;
  if coalesce(f->>'hasta', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_hasta := (f->>'hasta')::date; end if;
  if f->>'periodo' = 'mes' then v_desde := date_trunc('month', v_hoy)::date; end if;

  with base as materialized (
    select o.id, o.created_at
      from public.production_orders o
      join public.products p on p.id = o.product_id
     where o.organization_id = p_org
       and (v_sucursal is null or o.branch_id = v_sucursal)
       and (v_producto is null or o.product_id = v_producto)
       and (v_estados is null or o.status = any(v_estados))
       and (v_desde is null or o.created_at >= v_desde::timestamp at time zone v_tz)
       and (v_hasta is null or o.created_at < (v_hasta + 1)::timestamp at time zone v_tz)
       and (v_busq is null or o.id = v_num or p.name ilike '%' || v_busq || '%' or p.sku ilike '%' || v_busq || '%')
  ), numeradas as (
    select b.id, row_number() over (
             order by case when v_por_num and v_asc then b.id end asc,
                      case when v_por_num and not v_asc then b.id end desc,
                      case when not v_por_num and v_asc then b.created_at end asc,
                      case when not v_por_num and not v_asc then b.created_at end desc,
                      b.id desc) as ord
      from base b
  ), pagina as (
    select n.id, n.ord from numeradas n order by n.ord offset v_offset limit v_limite
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(public.fn_produccion_int_fila(o, v_ver) order by pg.ord)
                     from pagina pg join public.production_orders o on o.id = pg.id), '[]'::jsonb)
    into v_total, v_filas;

  select jsonb_build_object(
    'por_confirmar', count(*) filter (where o.status = 'draft'),
    'confirmadas', count(*) filter (where o.status = 'confirmed'),
    'en_proceso', count(*) filter (where o.status = 'in_progress'),
    'completadas_mes', count(*) filter (where o.status = 'completed' and o.completed_at >= v_mes),
    'costo_real_mes', case when v_ver then coalesce(sum(o.total_cost) filter (where o.status = 'completed' and o.completed_at >= v_mes), 0) end,
    'planeado_mes', coalesce(sum(o.qty_to_produce) filter (where o.status = 'completed' and o.completed_at >= v_mes), 0),
    'producido_mes', coalesce(sum(o.produced_qty) filter (where o.status = 'completed' and o.completed_at >= v_mes), 0),
    'ordenes_mes', count(*) filter (where o.created_at >= v_mes))
    into v_kpi
    from public.production_orders o
   where o.organization_id = p_org and (v_sucursal is null or o.branch_id = v_sucursal);

  return jsonb_build_object('filas', v_filas, 'total', v_total, 'kpi', v_kpi, 'permisos', v_permisos);
end;
$$;

-- Una fila del listado (y la cabecera del detalle). Para las abiertas calcula el
-- costo estimado y el primer faltante con las necesidades de la sucursal.
create or replace function public.fn_produccion_int_fila(p_o public.production_orders, p_ver boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nec jsonb;
  v_falta jsonb;
begin
  if p_o.status in ('draft', 'confirmed', 'in_progress') then
    v_nec := public.fn_produccion_int_necesidades(p_o.organization_id, p_o.branch_id, p_o.recipe_id, p_o.qty_to_produce);
    select x into v_falta from jsonb_array_elements(v_nec->'lineas') x
     where (x->>'faltante')::numeric > 0 order by (x->>'orden')::integer limit 1;
  end if;
  return (
    select jsonb_build_object(
      'id', p_o.id,
      'numero', 'OP-' || p_o.id,
      'estado', p_o.status,
      'producto', jsonb_build_object('id', p.id, 'nombre', p.name, 'sku', p.sku,
                                     'unidad', upper(btrim(coalesce(p.unit_code, 'UN'))),
                                     'decimales', public.fn_produccion_int_decimales(p.id)),
      'receta', jsonb_build_object('id', r.id, 'version', coalesce(r.version, 1), 'nombre', r.name,
                                   'rinde', coalesce(nullif(r.yield_qty, 0), 1), 'activa', coalesce(r.is_active, false),
                                   'product_id', r.product_id),
      'sucursal', jsonb_build_object('id', b.id, 'nombre', b.name),
      'a_producir', p_o.qty_to_produce,
      'producido', coalesce(p_o.produced_qty, 0),
      'creado_en', p_o.created_at,
      'creado_por', public.fn_produccion_int_nombre(p_o.created_by),
      'confirmado_en', p_o.confirmed_at,
      'iniciado_en', p_o.started_at,
      'completado_en', p_o.completed_at,
      'cancelado_en', p_o.cancelled_at,
      'motivo_cancelacion', p_o.cancel_reason,
      'notas', p_o.notes,
      'costo_real', case when p_ver then p_o.total_cost end,
      'costo_real_unidad', case when p_ver then p_o.unit_cost end,
      'costo_estimado', case when p_ver then (v_nec->>'costo_total')::numeric end,
      'costo_estimado_unidad', case when p_ver then (v_nec->>'costo_unidad')::numeric end,
      'faltantes', coalesce((v_nec->>'faltantes')::integer, 0),
      'primer_faltante', case when v_falta is not null then jsonb_build_object(
          'nombre', v_falta->>'nombre', 'unidad', v_falta->>'unidad', 'faltante', (v_falta->>'faltante')::numeric) end,
      'sin_consumos', p_o.status = 'completed' and not exists (
          select 1 from public.production_order_consumptions c where c.production_order_id = p_o.id))
      from public.products p
      join public.branches b on b.id = p_o.branch_id
      left join public.product_recipes r on r.id = p_o.recipe_id
     where p.id = p_o.product_id);
end;
$$;

revoke all on function public.fn_produccion_int_fila(public.production_orders, boolean) from public, anon, authenticated;
revoke all on function public.fn_produccion_listado(integer, jsonb) from public, anon;
grant execute on function public.fn_produccion_listado(integer, jsonb) to authenticated, service_role;

-- ── Detalle ─────────────────────────────────────────────────────────────────
create or replace function public.fn_produccion_detalle(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_o public.production_orders;
  v_permisos jsonb;
  v_ver boolean;
  v_nec jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  select * into v_o from public.production_orders o where o.id = p_id and o.organization_id = p_org;
  if not found then
    raise exception 'orden_no_encontrada' using errcode = 'P0002';
  end if;
  v_permisos := public.fn_inventario_permisos(p_org);
  v_ver := coalesce((v_permisos->>'costos')::boolean, false);
  if v_o.status in ('draft', 'confirmed', 'in_progress') then
    v_nec := public.fn_produccion_int_necesidades(p_org, v_o.branch_id, v_o.recipe_id, v_o.qty_to_produce);
    if not v_ver then
      v_nec := jsonb_set(v_nec, '{lineas}', coalesce((
        select jsonb_agg(x - 'costo_unitario' - 'costo_linea') from jsonb_array_elements(v_nec->'lineas') x), '[]'::jsonb));
    end if;
  end if;

  return jsonb_build_object(
    'orden', public.fn_produccion_int_fila(v_o, v_ver)
             || jsonb_build_object(
                  'confirmado_por', public.fn_produccion_int_nombre(v_o.confirmed_by),
                  'iniciado_por', public.fn_produccion_int_nombre(v_o.started_by),
                  'completado_por', public.fn_produccion_int_nombre(v_o.completed_by),
                  'cancelado_por', public.fn_produccion_int_nombre(v_o.cancelled_by),
                  'maximo', v_o.qty_to_produce * 1.5),
    'necesidades', v_nec,
    'consumos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'ingredient_product_id', c.ingredient_product_id,
               'nombre', p.name,
               'sku', p.sku,
               'cantidad', c.quantity_consumed,
               'unidad', btrim(c.unit_code),
               'lote', case when l.id is not null then jsonb_build_object('id', l.id, 'codigo', l.lot_code) end,
               'movement_id', c.stock_movement_id,
               'costo_unitario', case when v_ver then c.unit_cost end,
               'costo_total', case when v_ver then c.total_cost end) order by c.id)
        from public.production_order_consumptions c
        join public.products p on p.id = c.ingredient_product_id
        left join public.lots l on l.id = c.lot_id
       where c.production_order_id = v_o.id), '[]'::jsonb),
    'terminado', (
      select jsonb_build_object('movement_id', m.id, 'cantidad', m.qty,
                                'costo_unitario', case when v_ver then m.unit_cost end,
                                'promedio_despues', case when v_ver then m.avg_cost_after end)
        from public.stock_movements m
       where m.organization_id = p_org and m.source = 'production' and m.source_id = v_o.id::text
         and m.product_id = v_o.product_id and m.direction = 'in'
       order by m.id desc limit 1),
    'traslados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'codigo', coalesce(t.code, 'TR-' || t.id), 'estado', t.status,
               'destino', jsonb_build_object('id', d.id, 'nombre', d.name),
               'cantidad', (select coalesce(sum(ti.quantity), 0) from public.transfer_items ti
                             where ti.inventory_transfer_id = t.id and ti.product_id = v_o.product_id),
               'creado_en', t.created_at) order by t.id)
        from public.inventory_transfers t
        join public.branches d on d.id = t.dest_branch_id
       where t.organization_id = p_org and t.production_order_id = v_o.id), '[]'::jsonb),
    'permisos', v_permisos);
end;
$$;

revoke all on function public.fn_produccion_detalle(integer, integer) from public, anon;
grant execute on function public.fn_produccion_detalle(integer, integer) to authenticated, service_role;
