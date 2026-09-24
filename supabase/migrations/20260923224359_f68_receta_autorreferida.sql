-- F-68 · Un producto ingrediente de su propia receta descontaba stock dos veces
--
-- decrement_stock_with_recipe descuenta cada ingrediente de la receta y, si el
-- compuesto también lleva inventario, descuenta además el compuesto. En la
-- org 144 tres productos (63907, 64014, 64054) figuran como ingrediente de su
-- propia receta, así que cada venta los sacaba dos veces: 67 salidas de más en
-- 64 ventas, 80 unidades, desde el 2026-09-17 (anterior al cierre contable).
-- 54 de esas salidas tienen su costo en el kardex (186.500); 13 de 64054 salieron
-- a costo 0 y no generaron asiento.
--
-- Corrección, sin borrar nada:
--   1. El ingrediente que es el propio producto se ignora al descontar (en la
--      base y en stockMovementService.ts): ya sale como compuesto.
--   2. Un disparador impide registrar de nuevo un producto como ingrediente de
--      su propia receta.
--   3. Las tres filas de receta se conservan, marcadas en sus notas.
--   4. Cada salida de más se compensa con una entrada de kardex por la misma
--      cantidad y el mismo costo: su asiento (1405 D / 6105 C) neutraliza el del
--      costo duplicado; las 13 a costo 0 entran a costo 0 y no generan asiento,
--      igual que su salida. Idempotente por la nota «F-68 compensa #<id>».

-- ── 1. Descontar sin contar dos veces el propio producto ────────────────────
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

-- ── 2. Un producto no es ingrediente de su propia receta ────────────────────
create or replace function public.fn_receta_sin_autorreferencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.product_recipes r
              where r.id = new.recipe_id and r.product_id = new.ingredient_product_id) then
    raise exception 'RECETA_AUTORREFERIDA: un producto no puede ser ingrediente de su propia receta' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_receta_sin_autorreferencia on public.recipe_ingredients;
create trigger trg_receta_sin_autorreferencia
  before insert or update of recipe_id, ingredient_product_id on public.recipe_ingredients
  for each row execute function public.fn_receta_sin_autorreferencia();

-- ── 3. Las filas existentes se conservan, marcadas ──────────────────────────
update public.recipe_ingredients ri
   set notes = concat_ws(' ', nullif(ri.notes, ''),
                 '[F-68: es el propio producto; se ignora al descontar stock porque ya sale como compuesto]')
  from public.product_recipes r
 where r.id = ri.recipe_id
   and r.product_id = ri.ingredient_product_id
   and coalesce(ri.notes, '') not like '%[F-68:%';

-- ── 4. Compensar las salidas de más por el kardex ───────────────────────────
do $$
declare
  v_mov record;
  v_n integer := 0;
  v_unidades numeric := 0;
begin
  for v_mov in
    select sm.*
      from public.stock_movements sm
      join public.product_recipes r on r.product_id = sm.product_id
      join public.recipe_ingredients ri on ri.recipe_id = r.id and ri.ingredient_product_id = r.product_id
     where sm.direction = 'out'
       and sm.note like 'Ingrediente de receta:%'
       and exists (select 1 from public.stock_movements s2
                    where s2.organization_id = sm.organization_id
                      and s2.source_id = sm.source_id and s2.product_id = sm.product_id and s2.id <> sm.id
                      and s2.direction = 'out'
                      and (s2.note is null or s2.note not like 'Ingrediente de receta:%'))
       and not exists (select 1 from public.stock_movements c
                        where c.organization_id = sm.organization_id and c.product_id = sm.product_id
                          and c.direction = 'in' and c.note like 'F-68 compensa #' || sm.id || ' %')
     order by sm.id
  loop
    insert into public.stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note)
    values (v_mov.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.lot_id, 'in', v_mov.qty, coalesce(v_mov.unit_cost, 0),
            'adjustment', v_mov.source_id,
            'F-68 compensa #' || v_mov.id || ' (salida duplicada por receta autorreferida)');

    update public.stock_levels
       set qty_on_hand = qty_on_hand + v_mov.qty, updated_at = now()
     where branch_id = v_mov.branch_id and product_id = v_mov.product_id
       and lot_id is not distinct from v_mov.lot_id;

    v_n := v_n + 1;
    v_unidades := v_unidades + v_mov.qty;
  end loop;
  raise notice 'F-68: % salidas compensadas, % unidades', v_n, v_unidades;
end $$;
