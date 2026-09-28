-- Rollback de 20260928230000_receta_resolutor_unico.sql
--
-- ORDEN: revertir antes 20260928231000_producto_guardar_con_recetas (usa estas funciones y la merma).
-- DATOS: quitar recipe_ingredients.waste_pct pierde las mermas capturadas desde el formulario; las
-- recetas siguen, sin merma. Las filas de permiso de costos se borran (los roles vuelven a no tenerlo).

-- Venta y producción: cuerpos anteriores (tomados de pg_get_functiondef el 2026-09-28).
CREATE OR REPLACE FUNCTION public.decrement_stock_with_recipe(p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_source text, p_source_id text DEFAULT NULL::text, p_unit_cost numeric DEFAULT NULL::numeric, p_updated_by uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_recipe RECORD;
  v_ingredient RECORD;
  v_conv_factor NUMERIC;
  v_converted_qty NUMERIC;
  v_result JSON;
  v_ingredients_processed INTEGER := 0;
  v_product_track_stock BOOLEAN;
  v_ingredient_note TEXT;
BEGIN
  SELECT id, name, yield_qty, yield_unit_code INTO v_recipe FROM product_recipes WHERE product_id = p_product_id AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_result FROM decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id, p_unit_cost, p_note, p_updated_by);
    RETURN v_result;
  END IF;
  FOR v_ingredient IN SELECT ri.id, ri.ingredient_product_id, ri.quantity, ri.unit_code, ri.is_optional, ri.notes, p.track_stock, p.name AS ingredient_name, p.unit_code AS product_unit_code FROM recipe_ingredients ri JOIN products p ON p.id = ri.ingredient_product_id WHERE ri.recipe_id = v_recipe.id ORDER BY ri.sort_order LOOP
    IF v_ingredient.track_stock = false OR v_ingredient.track_stock IS NULL THEN CONTINUE; END IF;
    -- F-68: el propio producto como ingrediente ya sale abajo como compuesto.
    IF v_ingredient.ingredient_product_id = p_product_id THEN CONTINUE; END IF;
    v_converted_qty := v_ingredient.quantity * p_qty;
    -- Conversión de unidades: recipe_unit -> product_unit
    IF v_ingredient.unit_code IS NOT NULL AND v_ingredient.product_unit_code IS NOT NULL AND v_ingredient.unit_code <> v_ingredient.product_unit_code THEN
      SELECT uc.factor INTO v_conv_factor FROM unit_conversions uc WHERE uc.from_unit_code = v_ingredient.unit_code AND uc.to_unit_code = v_ingredient.product_unit_code AND (uc.organization_id = p_organization_id OR uc.organization_id IS NULL) ORDER BY uc.organization_id NULLS LAST LIMIT 1;
      IF FOUND AND v_conv_factor IS NOT NULL AND v_conv_factor > 0 THEN v_converted_qty := v_converted_qty * v_conv_factor; END IF;
    END IF;
    v_ingredient_note := CONCAT('Ingrediente de receta: ', COALESCE(v_recipe.name, 'receta'), ' - ', v_ingredient.ingredient_name, COALESCE(' | ' || p_note, ''));
    PERFORM decrement_stock_on_sale(p_organization_id, p_branch_id, v_ingredient.ingredient_product_id, v_converted_qty, p_source, p_source_id, NULL, v_ingredient_note, p_updated_by);
    v_ingredients_processed := v_ingredients_processed + 1;
  END LOOP;
  SELECT track_stock INTO v_product_track_stock FROM products WHERE id = p_product_id;
  IF v_product_track_stock = true THEN PERFORM decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id, p_unit_cost, p_note, p_updated_by); END IF;
  RETURN json_build_object('success', true, 'mode', 'recipe', 'recipe_id', v_recipe.id, 'ingredients_processed', v_ingredients_processed, 'product_stock_deducted', v_product_track_stock = true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_production_order(p_order_id integer, p_produced_qty numeric, p_updated_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_order RECORD;
  v_recipe RECORD;
  v_ingredient RECORD;
  v_conv_factor NUMERIC;
  v_converted_qty NUMERIC;
  v_needed_qty NUMERIC;
  v_movement_id INTEGER;
  v_consumption_id INTEGER;
  v_ingredients_processed INTEGER := 0;
  v_existing_stock RECORD;
  v_new_qty NUMERIC;
  v_prod_track_stock BOOLEAN;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de producción % no encontrada', p_order_id; END IF;
  IF v_order.status NOT IN ('in_progress','confirmed') THEN RAISE EXCEPTION 'La orden % no se puede completar desde estado %', p_order_id, v_order.status; END IF;
  SELECT id, name, yield_qty, yield_unit_code INTO v_recipe FROM product_recipes WHERE id = v_order.recipe_id AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'La receta % de la orden no está activa', v_order.recipe_id; END IF;
  v_conv_factor := p_produced_qty / COALESCE(NULLIF(v_recipe.yield_qty, 0), 1);
  FOR v_ingredient IN SELECT ri.id, ri.ingredient_product_id, ri.quantity, ri.unit_code, ri.is_optional, p.track_stock, p.name AS ingredient_name, p.unit_code AS product_unit_code FROM recipe_ingredients ri JOIN products p ON p.id = ri.ingredient_product_id WHERE ri.recipe_id = v_recipe.id ORDER BY ri.sort_order LOOP
    IF v_ingredient.track_stock = false OR v_ingredient.track_stock IS NULL THEN CONTINUE; END IF;
    v_needed_qty := v_ingredient.quantity * v_conv_factor;
    v_converted_qty := v_needed_qty;
    IF v_ingredient.unit_code IS NOT NULL AND v_ingredient.product_unit_code IS NOT NULL AND v_ingredient.unit_code <> v_ingredient.product_unit_code THEN
      SELECT uc.factor INTO v_conv_factor FROM unit_conversions uc WHERE uc.from_unit_code = v_ingredient.unit_code AND uc.to_unit_code = v_ingredient.product_unit_code AND (uc.organization_id = v_order.organization_id OR uc.organization_id IS NULL) ORDER BY uc.organization_id NULLS LAST LIMIT 1;
      IF FOUND AND v_conv_factor IS NOT NULL AND v_conv_factor > 0 THEN v_converted_qty := v_needed_qty * v_conv_factor; END IF;
    END IF;
    SELECT id, qty_on_hand, avg_cost INTO v_existing_stock FROM stock_levels WHERE product_id = v_ingredient.ingredient_product_id AND branch_id = v_order.branch_id AND lot_id IS NULL LIMIT 1;
    IF v_existing_stock IS NOT NULL THEN v_new_qty := COALESCE(v_existing_stock.qty_on_hand, 0) - v_converted_qty; UPDATE stock_levels SET qty_on_hand = v_new_qty, updated_at = now() WHERE id = v_existing_stock.id; ELSE v_new_qty := -v_converted_qty; INSERT INTO stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level) VALUES (v_ingredient.ingredient_product_id, v_order.branch_id, NULL, v_new_qty, 0, 0, 0); END IF;
    INSERT INTO stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by) VALUES (v_order.organization_id, v_order.branch_id, v_ingredient.ingredient_product_id, NULL, 'out', v_converted_qty, COALESCE(v_existing_stock.avg_cost, 0), 'production', p_order_id::text, CONCAT('Consumo producción #', p_order_id, ' - ', v_ingredient.ingredient_name), p_updated_by) RETURNING id INTO v_movement_id;
    INSERT INTO production_order_consumptions (production_order_id, ingredient_product_id, quantity_consumed, unit_code, stock_movement_id) VALUES (p_order_id, v_ingredient.ingredient_product_id, v_converted_qty, v_ingredient.unit_code, v_movement_id) RETURNING id INTO v_consumption_id;
    v_ingredients_processed := v_ingredients_processed + 1;
  END LOOP;
  SELECT track_stock INTO v_prod_track_stock FROM products WHERE id = v_order.product_id;
  IF v_prod_track_stock = true THEN
    SELECT id, qty_on_hand, avg_cost INTO v_existing_stock FROM stock_levels WHERE product_id = v_order.product_id AND branch_id = v_order.branch_id AND lot_id IS NULL LIMIT 1;
    IF v_existing_stock IS NOT NULL THEN v_new_qty := COALESCE(v_existing_stock.qty_on_hand, 0) + p_produced_qty; UPDATE stock_levels SET qty_on_hand = v_new_qty, updated_at = now() WHERE id = v_existing_stock.id; ELSE INSERT INTO stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level) VALUES (v_order.product_id, v_order.branch_id, NULL, p_produced_qty, 0, 0, 0); END IF;
    INSERT INTO stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by) VALUES (v_order.organization_id, v_order.branch_id, v_order.product_id, NULL, 'in', p_produced_qty, 0, 'production', p_order_id::text, CONCAT('Producción #', p_order_id, ' - ingreso producto terminado'), p_updated_by) RETURNING id INTO v_movement_id;
  END IF;
  UPDATE production_orders SET status = 'completed', produced_qty = p_produced_qty, completed_at = now(), updated_at = now() WHERE id = p_order_id;
  RETURN json_build_object('success', true, 'order_id', p_order_id, 'produced_qty', p_produced_qty, 'ingredients_processed', v_ingredients_processed, 'product_stock_added', v_prod_track_stock = true);
END;
$function$;

-- Antes las dos estaban abiertas también a anon y public (grant por defecto).
grant execute on function public.decrement_stock_with_recipe(integer, integer, integer, numeric, text, text, numeric, uuid, text) to public, anon;
grant execute on function public.complete_production_order(integer, numeric, uuid) to public, anon;

-- Permisos del formulario: sin «costos».
create or replace function public.fn_productos_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return jsonb_build_object('crear', true, 'editar', true, 'eliminar', true, 'ajustar', true);
  end if;
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) into v_owner;
  return jsonb_build_object(
    'crear', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.create')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'editar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.edit')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'eliminar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.delete')
      or public.check_user_permission(v_uid, p_org, 'product_management')
      or public.check_user_permission(v_uid, p_org, 'inventory_management'),
    'ajustar', v_owner or public.check_user_permission(v_uid, p_org, 'inventory.adjust')
      or public.check_user_permission(v_uid, p_org, 'inventory_management')
  );
end;
$function$;

drop function if exists public.fn_receta_int_expandir(integer, integer, numeric, boolean);
drop function if exists public.fn_receta_int_calcular(integer, jsonb, numeric);
drop function if exists public.fn_receta_int_a_jsonb(integer);
drop function if exists public.fn_receta_efectiva(integer);
drop function if exists public.fn_receta_int_factor(integer, text, text);
drop function if exists public.fn_receta_int_puede_ver_costos(integer);

delete from public.job_position_permissions
 where permission_id = (select id from public.permissions where code = 'inventory.costs.view');
delete from public.role_permissions
 where permission_id = (select id from public.permissions where code = 'inventory.costs.view');
delete from public.permissions where code = 'inventory.costs.view';

alter table public.recipe_ingredients drop constraint if exists recipe_ingredients_waste_pct_rango;
alter table public.recipe_ingredients drop column if exists waste_pct;
