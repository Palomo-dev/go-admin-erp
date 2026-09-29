-- Reversión de 20260929150100_inv_b5_2_produccion.sql
-- Devuelve complete_production_order a la versión del 2026-09-28 (invocador, escribe
-- stock_levels/stock_movements a mano, terminado a costo 0) y retira las RPC nuevas.
-- Advertencias:
--   * Revertir antes 20260929150150 (el listado usa fn_produccion_int_necesidades).
--   * Las órdenes, consumos y movimientos creados con la v2 se conservan.
--   * Con la guardia de 20260929150000 activa, la versión vieja (invocador) no puede
--     escribir production_orders: revertir también 20260929150000 o la orden no se completa.

drop function if exists public.complete_production_order(integer, numeric, uuid, boolean, text);
drop function if exists public.fn_produccion_cambiar_estado(integer, integer, text, text);
drop function if exists public.fn_produccion_guardar(integer, jsonb, text);
drop function if exists public.fn_produccion_necesidades(integer, integer, integer, numeric);
drop function if exists public.fn_produccion_int_necesidades(integer, integer, integer, numeric);
drop function if exists public.fn_produccion_int_decimales(integer);
drop function if exists public.fn_produccion_int_nombre(uuid);

create or replace function public.complete_production_order(p_order_id integer, p_produced_qty numeric, p_updated_by uuid default null::uuid)
returns json
language plpgsql
as $function$
declare
  v_order record;
  v_ing record;
  v_movement_id integer;
  v_ingredients_processed integer := 0;
  v_existing_stock record;
  v_hay_stock boolean;
  v_new_qty numeric;
  v_prod_track_stock boolean;
begin
  select * into v_order from production_orders where id = p_order_id for update;
  if not found then raise exception 'Orden de producción % no encontrada', p_order_id; end if;
  if v_order.status not in ('in_progress', 'confirmed') then
    raise exception 'La orden % no se puede completar desde estado %', p_order_id, v_order.status;
  end if;
  if not exists (select 1 from product_recipes where id = v_order.recipe_id and is_active = true) then
    raise exception 'La receta % de la orden no está activa', v_order.recipe_id;
  end if;

  for v_ing in
    select c.* from public.fn_receta_int_calcular(v_order.organization_id, public.fn_receta_int_a_jsonb(v_order.recipe_id), p_produced_qty) c
  loop
    continue when v_ing.error = 'ingrediente_invalido' or not v_ing.track_stock or v_ing.opcional;
    if v_ing.error = 'conversion_faltante' then
      raise exception 'conversion_faltante' using errcode = '22023',
        detail = jsonb_build_object('ingrediente_id', v_ing.ingredient_product_id, 'de', v_ing.unidad_receta,
                                    'a', v_ing.unidad_ingrediente)::text;
    end if;
    select id, qty_on_hand, avg_cost into v_existing_stock from stock_levels
     where product_id = v_ing.ingredient_product_id and branch_id = v_order.branch_id and lot_id is null limit 1;
    v_hay_stock := found;
    if v_hay_stock then
      v_new_qty := coalesce(v_existing_stock.qty_on_hand, 0) - v_ing.cantidad;
      update stock_levels set qty_on_hand = v_new_qty, updated_at = now() where id = v_existing_stock.id;
    else
      v_new_qty := -v_ing.cantidad;
      insert into stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_ing.ingredient_product_id, v_order.branch_id, null, v_new_qty, 0, 0, 0);
    end if;
    insert into stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by)
    values (v_order.organization_id, v_order.branch_id, v_ing.ingredient_product_id, null, 'out', v_ing.cantidad,
            coalesce(v_existing_stock.avg_cost, 0), 'production', p_order_id::text,
            concat('Consumo producción #', p_order_id, ' - ', v_ing.nombre), p_updated_by)
    returning id into v_movement_id;
    insert into production_order_consumptions (production_order_id, ingredient_product_id, quantity_consumed, unit_code, stock_movement_id)
    values (p_order_id, v_ing.ingredient_product_id, v_ing.cantidad, v_ing.unidad_ingrediente, v_movement_id);
    v_ingredients_processed := v_ingredients_processed + 1;
  end loop;

  select track_stock into v_prod_track_stock from products where id = v_order.product_id;
  if v_prod_track_stock = true then
    select id, qty_on_hand, avg_cost into v_existing_stock from stock_levels
     where product_id = v_order.product_id and branch_id = v_order.branch_id and lot_id is null limit 1;
    v_hay_stock := found;
    if v_hay_stock then
      v_new_qty := coalesce(v_existing_stock.qty_on_hand, 0) + p_produced_qty;
      update stock_levels set qty_on_hand = v_new_qty, updated_at = now() where id = v_existing_stock.id;
    else
      insert into stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_order.product_id, v_order.branch_id, null, p_produced_qty, 0, 0, 0);
    end if;
    insert into stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by)
    values (v_order.organization_id, v_order.branch_id, v_order.product_id, null, 'in', p_produced_qty, 0, 'production',
            p_order_id::text, concat('Producción #', p_order_id, ' - ingreso producto terminado'), p_updated_by)
    returning id into v_movement_id;
  end if;

  update production_orders set status = 'completed', produced_qty = p_produced_qty, completed_at = now(), updated_at = now()
   where id = p_order_id;
  return json_build_object('success', true, 'order_id', p_order_id, 'produced_qty', p_produced_qty,
    'ingredients_processed', v_ingredients_processed, 'product_stock_added', v_prod_track_stock = true);
end;
$function$;

revoke all on function public.complete_production_order(integer, numeric, uuid) from public, anon;
grant execute on function public.complete_production_order(integer, numeric, uuid) to authenticated, service_role;
