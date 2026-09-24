-- Rollback de 20260923224359_f68_receta_autorreferida.sql
--
-- Retira el bloqueo de autorreferencia y devuelve decrement_stock_with_recipe
-- a su versión anterior (que descuenta dos veces el producto autorreferido).
-- Las 67 entradas de compensación y sus asientos de kardex NO se deshacen:
-- son hechos. Para anularlas habría que registrar salidas de kardex por las
-- mismas cantidades y costos (nota «F-68 compensa #<id>»).

drop trigger if exists trg_receta_sin_autorreferencia on public.recipe_ingredients;
drop function if exists public.fn_receta_sin_autorreferencia();

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
    v_converted_qty := v_ingredient.quantity * p_qty;
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
