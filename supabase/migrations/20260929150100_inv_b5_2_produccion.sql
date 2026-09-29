-- Inventario B5 · Órdenes de producción por RPC y completar por la primitiva
-- (INVENTARIO-PLAN.md §5.6, F8; anexo B0 §B0.4 «Producción (B5)»).
--
-- Antes: crear, confirmar, iniciar y cancelar eran UPDATE desde el navegador,
-- sin permiso; complete_production_order (invocador) escribía stock_levels y
-- stock_movements a mano, sin bloqueo, y el terminado entraba a costo 0; si la
-- RPC fallaba, el servicio marcaba la orden «completada» sin mover stock.
--
-- Ahora (todas SECURITY DEFINER, fn_inventario_exigir_permiso → fn_assert_acceso_org,
-- REVOKE de anon y public):
--   fn_produccion_int_necesidades  necesidades y costo estimado de N unidades con
--                                  una versión de receta en una sucursal. El costo
--                                  sale de fn_receta_costo (el mismo de la venta y del
--                                  reporte), escalado a N ÷ rinde.
--   fn_produccion_necesidades      la misma, para el diálogo «Nueva orden» (ver)
--   fn_produccion_guardar          crea (borrador o confirmada) o edita un borrador;
--                                  idempotente por clave (producir)
--   fn_produccion_cambiar_estado   confirmar · iniciar · cancelar (motivo) · eliminar
--                                  borrador (producir)
--   complete_production_order v2   una transacción: consumos por fn_inv_int_mover
--                                  (FEFO si el ingrediente lleva lotes; bloqueo de
--                                  cada fila), conversiones y merma de
--                                  fn_receta_int_calcular, faltantes solo con
--                                  confirmación, terminado por fn_inv_int_mover con
--                                  costo real = Σ consumos ÷ producido (promedio
--                                  ponderado), idempotente por clave. Si algo falla,
--                                  NADA queda: ni consumos, ni terminado, ni estado.
--   (lectura en 20260929150150_inv_b5_2b_produccion_lectura: fn_produccion_listado
--    y fn_produccion_detalle)

-- ── Utilidades internas ─────────────────────────────────────────────────────
create or replace function public.fn_produccion_int_nombre(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
                  nullif(split_part(coalesce(pr.email, ''), '@', 1), ''))
    from public.profiles pr
   where pr.id = p_user;
$$;

revoke all on function public.fn_produccion_int_nombre(uuid) from public, anon, authenticated;

create or replace function public.fn_produccion_int_decimales(p_product integer)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select least(public.fn_producto_decimales_cantidad(p.sale_mode, p.qty_decimals), 3)
    from public.products p where p.id = p_product;
$$;

revoke all on function public.fn_produccion_int_decimales(integer) from public, anon, authenticated;

-- Necesidades de producir p_qty con la versión p_recipe en la sucursal p_branch.
-- Líneas de fn_receta_costo (una tanda = rinde) escaladas a p_qty ÷ rinde.
create or replace function public.fn_produccion_int_necesidades(p_org integer, p_branch integer, p_recipe integer, p_qty numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_c jsonb;
  v_rinde numeric;
  v_k numeric;
  v_lineas jsonb;
  v_faltan integer;
begin
  v_c := public.fn_receta_costo(p_org, p_branch, jsonb_build_object('recipe_id', p_recipe));
  v_rinde := coalesce(nullif((v_c->>'rinde')::numeric, 0), 1);
  v_k := coalesce(p_qty, 0) / v_rinde;
  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', (l->>'orden')::integer,
           'ingredient_product_id', (l->>'ingredient_product_id')::integer,
           'nombre', l->>'nombre',
           'sku', l->>'sku',
           'unidad', l->>'unidad_ingrediente',
           'unidad_receta', l->>'unidad_receta',
           'track_stock', (l->>'track_stock')::boolean,
           'opcional', (l->>'opcional')::boolean,
           'merma_pct', (l->>'merma_pct')::numeric,
           'necesario', round((l->>'cantidad')::numeric * v_k, 3),
           'disponible', coalesce((l->>'existencia')::numeric, 0),
           'faltante', case when (l->>'track_stock')::boolean and not (l->>'opcional')::boolean
                            then greatest(round((l->>'cantidad')::numeric * v_k, 3) - coalesce((l->>'existencia')::numeric, 0), 0)
                            else 0 end,
           'fuente', l->>'fuente',
           'costo_unitario', (l->>'costo_unitario')::numeric,
           'costo_linea', case when l->>'costo_linea' is not null then round((l->>'costo_linea')::numeric * v_k, 4) end,
           'error', l->>'error') order by (l->>'orden')::integer), '[]'::jsonb)
    into v_lineas
    from jsonb_array_elements(coalesce(v_c->'lineas', '[]'::jsonb)) l;
  select count(*) into v_faltan from jsonb_array_elements(v_lineas) x where (x->>'faltante')::numeric > 0;
  return jsonb_build_object(
    'permitido', (v_c->>'permitido')::boolean,
    'rinde', v_rinde,
    'cantidad', p_qty,
    'costo_total', case when v_c->>'costo_unidad' is not null then round((v_c->>'costo_unidad')::numeric * coalesce(p_qty, 0), 4) end,
    'costo_unidad', (v_c->>'costo_unidad')::numeric,
    'completo', (v_c->>'completo')::boolean,
    'lineas_con_error', (v_c->>'lineas_con_error')::integer,
    'faltantes', v_faltan,
    'lineas', v_lineas);
end;
$$;

revoke all on function public.fn_produccion_int_necesidades(integer, integer, integer, numeric) from public, anon, authenticated;

-- ── Necesidades (diálogo «Nueva orden») ─────────────────────────────────────
create or replace function public.fn_produccion_necesidades(p_org integer, p_branch integer, p_recipe_id integer, p_qty numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product_recipes r where r.id = p_recipe_id and r.organization_id = p_org) then
    raise exception 'receta_no_encontrada' using errcode = 'P0002';
  end if;
  return public.fn_produccion_int_necesidades(p_org, p_branch, p_recipe_id, greatest(coalesce(p_qty, 0), 0));
end;
$$;

revoke all on function public.fn_produccion_necesidades(integer, integer, integer, numeric) from public, anon;
grant execute on function public.fn_produccion_necesidades(integer, integer, integer, numeric) to authenticated, service_role;

-- ── Guardar (crear o editar borrador) ───────────────────────────────────────
-- p_orden: {id?, branch_id, product_id, recipe_id?, qty_to_produce, notes?, confirmar?}
-- recipe_id por defecto: la receta efectiva del producto (la propia o la del padre).
create or replace function public.fn_produccion_guardar(p_org integer, p_orden jsonb, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_clave text := nullif(left(btrim(coalesce(p_clave, '')), 120), '');
  v_id integer;
  v_branch integer;
  v_prod record;
  v_recipe integer;
  v_rec record;
  v_qty numeric;
  v_dec integer;
  v_notas text := nullif(left(btrim(coalesce(p_orden->>'notes', '')), 1000), '');
  v_confirmar boolean := coalesce((p_orden->>'confirmar')::boolean, false);
  v_actual record;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['producir']);
  if jsonb_typeof(p_orden) is distinct from 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  if v_clave is not null then
    select o.id, o.status into v_actual from public.production_orders o
     where o.organization_id = p_org and o.client_key = v_clave;
    if found then
      return jsonb_build_object('id', v_actual.id, 'numero', 'OP-' || v_actual.id, 'status', v_actual.status, 'repetido', true);
    end if;
  end if;

  v_id := case when coalesce(p_orden->>'id', '') ~ '^[0-9]{1,9}$' then (p_orden->>'id')::integer end;
  v_branch := case when coalesce(p_orden->>'branch_id', '') ~ '^[0-9]{1,9}$' then (p_orden->>'branch_id')::integer end;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;

  select p.id, p.name, p.track_stock, p.is_parent, p.status, p.parent_product_id into v_prod
    from public.products p
   where p.id = case when coalesce(p_orden->>'product_id', '') ~ '^[0-9]{1,9}$' then (p_orden->>'product_id')::integer end
     and p.organization_id = p_org;
  if v_prod.id is null or v_prod.status = 'deleted' then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if coalesce(v_prod.is_parent, false) then
    raise exception 'producto_padre' using errcode = '22023';
  end if;
  if not coalesce(v_prod.track_stock, false) then
    raise exception 'producto_sin_inventario' using errcode = '22023';
  end if;

  v_recipe := case when coalesce(p_orden->>'recipe_id', '') ~ '^[0-9]{1,9}$' then (p_orden->>'recipe_id')::integer end;
  if v_recipe is null then
    select e.recipe_id into v_recipe from public.fn_receta_efectiva(v_prod.id) e;
  end if;
  select r.id, r.product_id, r.is_active into v_rec from public.product_recipes r
   where r.id = v_recipe and r.organization_id = p_org
     and (r.product_id = v_prod.id or r.product_id = v_prod.parent_product_id);
  if v_rec.id is null then
    raise exception 'receta_no_encontrada' using errcode = 'P0002';
  end if;

  v_qty := case when coalesce(p_orden->>'qty_to_produce', '') ~ '^[0-9]+(\.[0-9]+)?$' then (p_orden->>'qty_to_produce')::numeric end;
  v_dec := public.fn_produccion_int_decimales(v_prod.id);
  if v_qty is null or v_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  if round(v_qty, v_dec) <> v_qty then
    raise exception 'cantidad_decimales' using errcode = '22023', detail = v_dec::text;
  end if;

  if v_id is null then
    -- Una versión inactiva solo sirve si ya estaba en una orden: las nuevas usan la activa.
    if not v_rec.is_active then
      raise exception 'receta_inactiva' using errcode = '22023';
    end if;
    insert into public.production_orders (organization_id, branch_id, recipe_id, product_id, qty_to_produce, status,
                                          produced_qty, notes, created_by, client_key, confirmed_at, confirmed_by)
    values (p_org, v_branch, v_rec.id, v_prod.id, v_qty, case when v_confirmar then 'confirmed' else 'draft' end,
            0, v_notas, v_uid, v_clave, case when v_confirmar then now() end, case when v_confirmar then v_uid end)
    returning id into v_id;
  else
    select o.id, o.status, o.recipe_id into v_actual from public.production_orders o
     where o.id = v_id and o.organization_id = p_org for update;
    if not found then
      raise exception 'orden_no_encontrada' using errcode = 'P0002';
    end if;
    if v_actual.status <> 'draft' then
      raise exception 'orden_no_editable' using errcode = '22023', detail = v_actual.status;
    end if;
    if not v_rec.is_active and v_rec.id <> v_actual.recipe_id then
      raise exception 'receta_inactiva' using errcode = '22023';
    end if;
    update public.production_orders
       set branch_id = v_branch, product_id = v_prod.id, recipe_id = v_rec.id, qty_to_produce = v_qty, notes = v_notas,
           status = case when v_confirmar then 'confirmed' else 'draft' end,
           confirmed_at = case when v_confirmar then now() end,
           confirmed_by = case when v_confirmar then v_uid end,
           updated_at = now()
     where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'numero', 'OP-' || v_id,
    'status', case when v_confirmar then 'confirmed' else 'draft' end, 'repetido', false);
end;
$$;

revoke all on function public.fn_produccion_guardar(integer, jsonb, text) from public, anon;
grant execute on function public.fn_produccion_guardar(integer, jsonb, text) to authenticated, service_role;

-- ── Cambiar estado ──────────────────────────────────────────────────────────
-- p_accion: confirmar (draft → confirmed) · iniciar (confirmed → in_progress) ·
-- cancelar (draft/confirmed/in_progress → cancelled; motivo obligatorio salvo
-- borrador) · eliminar (solo borrador). Ninguna mueve stock.
create or replace function public.fn_produccion_cambiar_estado(p_org integer, p_id integer, p_accion text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_o record;
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
  v_nuevo text;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['producir']);
  select o.id, o.status into v_o from public.production_orders o
   where o.id = p_id and o.organization_id = p_org for update;
  if not found then
    raise exception 'orden_no_encontrada' using errcode = 'P0002';
  end if;

  if p_accion = 'confirmar' and v_o.status = 'draft' then
    v_nuevo := 'confirmed';
    update public.production_orders set status = v_nuevo, confirmed_at = now(), confirmed_by = v_uid, updated_at = now()
     where id = p_id;
  elsif p_accion = 'iniciar' and v_o.status = 'confirmed' then
    v_nuevo := 'in_progress';
    update public.production_orders set status = v_nuevo, started_at = now(), started_by = v_uid, updated_at = now()
     where id = p_id;
  elsif p_accion = 'cancelar' and v_o.status in ('draft', 'confirmed', 'in_progress') then
    if v_o.status <> 'draft' and (v_motivo is null or length(v_motivo) < 3) then
      raise exception 'motivo_requerido' using errcode = '22023';
    end if;
    v_nuevo := 'cancelled';
    update public.production_orders
       set status = v_nuevo, cancelled_at = now(), cancelled_by = v_uid, cancel_reason = v_motivo, updated_at = now()
     where id = p_id;
  elsif p_accion = 'eliminar' and v_o.status = 'draft' then
    delete from public.production_orders where id = p_id;
    return jsonb_build_object('id', p_id, 'status', null, 'eliminada', true);
  elsif p_accion in ('confirmar', 'iniciar', 'cancelar', 'eliminar') then
    raise exception 'orden_estado_invalido' using errcode = '22023', detail = v_o.status;
  else
    raise exception 'accion_invalida' using errcode = '22023', detail = coalesce(p_accion, 'null');
  end if;

  return jsonb_build_object('id', p_id, 'status', v_nuevo, 'eliminada', false);
end;
$$;

revoke all on function public.fn_produccion_cambiar_estado(integer, integer, text, text) from public, anon;
grant execute on function public.fn_produccion_cambiar_estado(integer, integer, text, text) to authenticated, service_role;

-- ── Completar (v2) ──────────────────────────────────────────────────────────
-- La firma de 3 argumentos se conserva (los nuevos tienen default); se borra la
-- vieja porque una sobrecarga con los mismos primeros argumentos sería ambigua.
drop function if exists public.complete_production_order(integer, numeric, uuid);

create or replace function public.complete_production_order(
  p_order_id integer,
  p_produced_qty numeric,
  p_updated_by uuid default null,
  p_confirmar_faltante boolean default false,
  p_clave text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_o record;
  v_p record;
  v_uid uuid;
  v_clave text := nullif(left(btrim(coalesce(p_clave, '')), 120), '');
  v_receta jsonb;
  v_qty numeric := p_produced_qty;
  v_dec integer;
  v_ing record;
  v_mov jsonb;
  v_m jsonb;
  v_costo numeric;
  v_total numeric := 0;
  v_n integer := 0;
  v_faltantes jsonb := '[]'::jsonb;
  v_disp numeric;
  v_unit numeric;
  v_ter jsonb;
  v_ver boolean;
begin
  select * into v_o from public.production_orders where id = p_order_id for update;
  if not found then
    raise exception 'orden_no_encontrada' using errcode = 'P0002';
  end if;
  -- Pertenencia (fn_assert_acceso_org) y permiso, con la organización de la orden.
  perform public.fn_inventario_exigir_permiso(v_o.organization_id, array['producir']);
  v_uid := coalesce(auth.uid(), p_updated_by);
  v_ver := public.fn_receta_int_puede_ver_costos(v_o.organization_id);

  if v_o.status = 'completed' and v_clave is not null and v_o.complete_key = v_clave then
    return json_build_object('success', true, 'order_id', v_o.id, 'produced_qty', v_o.produced_qty,
      'ya_completada', true,
      'total_cost', case when v_ver then v_o.total_cost end, 'unit_cost', case when v_ver then v_o.unit_cost end);
  end if;
  if v_o.status not in ('confirmed', 'in_progress') then
    raise exception 'orden_estado_invalido' using errcode = '22023', detail = v_o.status;
  end if;

  select p.id, p.name, p.track_stock into v_p from public.products p
   where p.id = v_o.product_id and p.organization_id = v_o.organization_id;
  if v_p.id is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  if not coalesce(v_p.track_stock, false) then
    raise exception 'producto_sin_inventario' using errcode = '22023';
  end if;

  v_dec := public.fn_produccion_int_decimales(v_p.id);
  if v_qty is null or v_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  if round(v_qty, v_dec) <> v_qty then
    raise exception 'cantidad_decimales' using errcode = '22023', detail = v_dec::text;
  end if;
  if v_qty > v_o.qty_to_produce * 1.5 then
    raise exception 'excede_lo_planeado' using errcode = '22023',
      detail = jsonb_build_object('planeado', v_o.qty_to_produce, 'maximo', v_o.qty_to_produce * 1.5)::text;
  end if;

  -- La versión con que se creó la orden (las versiones no cambian).
  v_receta := public.fn_receta_int_a_jsonb(v_o.recipe_id);
  if v_receta is null or (v_receta->>'organization_id')::integer <> v_o.organization_id then
    raise exception 'receta_no_encontrada' using errcode = 'P0002';
  end if;

  -- Validar todo antes de mover nada: ingredientes, conversiones y faltantes.
  for v_ing in select c.* from public.fn_receta_int_calcular(v_o.organization_id, v_receta, v_qty) c order by c.orden loop
    continue when v_ing.opcional;
    if v_ing.error = 'ingrediente_invalido' then
      raise exception 'receta_ingrediente_invalido' using errcode = '22023', detail = coalesce(v_ing.ingredient_product_id::text, '');
    end if;
    if v_ing.error = 'conversion_faltante' then
      raise exception 'conversion_faltante' using errcode = '22023',
        detail = jsonb_build_object('ingrediente_id', v_ing.ingredient_product_id, 'de', v_ing.unidad_receta,
                                    'a', v_ing.unidad_ingrediente)::text;
    end if;
    if v_ing.track_stock and not p_confirmar_faltante then
      select coalesce(sum(sl.qty_on_hand), 0) into v_disp from public.stock_levels sl
       where sl.product_id = v_ing.ingredient_product_id and sl.branch_id = v_o.branch_id;
      if v_disp < round(v_ing.cantidad, 3) then
        v_faltantes := v_faltantes || jsonb_build_array(jsonb_build_object(
          'product_id', v_ing.ingredient_product_id, 'nombre', v_ing.nombre, 'unidad', v_ing.unidad_ingrediente,
          'necesario', round(v_ing.cantidad, 3), 'disponible', v_disp,
          'faltante', round(v_ing.cantidad, 3) - v_disp));
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'faltante_sin_confirmar' using errcode = '23514', detail = v_faltantes::text;
  end if;

  -- Consumos: cada ingrediente con inventario sale por la primitiva (bloqueo de la
  -- fila, FEFO si lleva lotes, kardex con autor); los que no llevan inventario
  -- se costean con el costo vigente y no mueven stock.
  for v_ing in select c.* from public.fn_receta_int_calcular(v_o.organization_id, v_receta, v_qty) c order by c.orden loop
    continue when v_ing.opcional;
    if v_ing.track_stock then
      continue when round(v_ing.cantidad, 3) <= 0;
      v_mov := public.fn_inv_int_mover(v_o.organization_id, v_o.branch_id, v_ing.ingredient_product_id, null, 'out',
                 v_ing.cantidad, null, 'production', v_o.id::text,
                 concat('Consumo OP-', v_o.id, ' · ', v_ing.nombre), v_uid,
                 jsonb_build_object('permitir_negativo', true));
      continue when coalesce((v_mov->>'omitido')::boolean, false);
      for v_m in select value from jsonb_array_elements(v_mov->'movimientos') loop
        v_costo := coalesce((v_m->>'unit_cost')::numeric, 0);
        insert into public.production_order_consumptions (production_order_id, ingredient_product_id, quantity_consumed,
                                                          unit_code, stock_movement_id, unit_cost, total_cost, lot_id)
        values (v_o.id, v_ing.ingredient_product_id, (v_m->>'qty')::numeric, v_ing.unidad_ingrediente,
                (v_m->>'movement_id')::integer, v_costo, round((v_m->>'qty')::numeric * v_costo, 4),
                nullif(v_m->>'lot_id', '')::integer);
        v_total := v_total + (v_m->>'qty')::numeric * v_costo;
      end loop;
    else
      v_costo := public.fn_costo_unitario_producto(v_ing.ingredient_product_id, v_o.branch_id, null);
      insert into public.production_order_consumptions (production_order_id, ingredient_product_id, quantity_consumed,
                                                        unit_code, stock_movement_id, unit_cost, total_cost, lot_id)
      values (v_o.id, v_ing.ingredient_product_id, round(v_ing.cantidad, 6), v_ing.unidad_ingrediente, null,
              v_costo, round(v_ing.cantidad * v_costo, 4), null);
      v_total := v_total + v_ing.cantidad * v_costo;
    end if;
    v_n := v_n + 1;
  end loop;

  -- Terminado: entra con su costo real y recalcula el promedio de la fila.
  v_unit := v_total / v_qty;
  v_ter := public.fn_inv_int_mover(v_o.organization_id, v_o.branch_id, v_p.id, null, 'in', v_qty, v_unit,
             'production', v_o.id::text, concat('Producción OP-', v_o.id, ' · producto terminado'), v_uid,
             jsonb_build_object('recalcular_costo', true));

  update public.production_orders
     set status = 'completed', produced_qty = v_qty, completed_at = now(), completed_by = v_uid,
         started_at = coalesce(started_at, now()), started_by = coalesce(started_by, v_uid),
         total_cost = round(v_total, 4), unit_cost = round(v_unit, 4), complete_key = v_clave, updated_at = now()
   where id = v_o.id;

  return json_build_object('success', true, 'order_id', v_o.id, 'produced_qty', v_qty,
    'ingredients_processed', v_n, 'product_stock_added', true, 'ya_completada', false,
    'movement_id', (v_ter->>'movement_id')::integer,
    'total_cost', case when v_ver then round(v_total, 4) end,
    'unit_cost', case when v_ver then round(v_unit, 4) end,
    'avg_cost_after', case when v_ver then (v_ter->>'avg_cost_after')::numeric end);
end;
$function$;

revoke all on function public.complete_production_order(integer, numeric, uuid, boolean, text) from public, anon;
grant execute on function public.complete_production_order(integer, numeric, uuid, boolean, text) to authenticated, service_role;

