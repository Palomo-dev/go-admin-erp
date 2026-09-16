-- F-38/F-36: RPC transaccional para entradas de stock
-- fn_register_stock_entry: contraparte de decrement_stock_on_sale
-- Inserta stock_levels y stock_movements en una sola transacción.
-- Valida costo > 0 cuando qty > 0. Soporta lotes (array jsonb).
-- Idempotencia vía batch_id en note.

CREATE OR REPLACE FUNCTION public.fn_register_stock_entry(
  p_entries jsonb,
  p_batch_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_entry jsonb;
  v_organization_id integer;
  v_branch_id integer;
  v_product_id integer;
  v_qty numeric;
  v_unit_cost numeric;
  v_source text;
  v_source_id text;
  v_note text;
  v_updated_by uuid;
  v_track_stock boolean;
  v_existing_stock record;
  v_new_qty numeric;
  v_movement_id integer;
  v_results jsonb := '[]'::jsonb;
  v_batch_exists boolean;
  v_idx integer := 0;
BEGIN
  -- 1. Idempotencia: si batch_id ya existe, devolver resultado anterior
  IF p_batch_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM stock_movements
      WHERE note LIKE '%' || p_batch_id || '%'
        AND source = 'initial'
    ) INTO v_batch_exists;
    IF v_batch_exists THEN
      RETURN json_build_object('success', true, 'skipped', true, 'reason', 'batch_already_processed', 'batch_id', p_batch_id);
    END IF;
  END IF;

  -- 2. Validar costo > 0 en todas las entradas antes de escribir nada
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_qty := COALESCE((v_entry->>'qty')::numeric, 0);
    v_unit_cost := COALESCE((v_entry->>'unit_cost')::numeric, 0);
    IF v_qty > 0 AND v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'Entrada %: cantidad % sin costo. El costo es obligatorio cuando hay cantidad en inventario.', v_idx, v_qty;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  -- 3. Procesar todas las entradas en una transacción
  v_idx := 0;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_organization_id := (v_entry->>'organization_id')::integer;
    v_branch_id := (v_entry->>'branch_id')::integer;
    v_product_id := (v_entry->>'product_id')::integer;
    v_qty := COALESCE((v_entry->>'qty')::numeric, 0);
    v_unit_cost := COALESCE((v_entry->>'unit_cost')::numeric, 0);
    v_source := COALESCE(v_entry->>'source', 'initial');
    v_source_id := v_entry->>'source_id';
    v_note := COALESCE(v_entry->>'note', 'Stock inicial');
    v_updated_by := NULLIF(v_entry->>'updated_by', '')::uuid;

    -- Agregar batch_id al note si existe
    IF p_batch_id IS NOT NULL THEN
      v_note := v_note || ' [batch:' || p_batch_id || ']';
    END IF;

    -- Verificar si el producto rastrea stock
    SELECT track_stock INTO v_track_stock
    FROM products WHERE id = v_product_id;

    IF NOT FOUND OR v_track_stock = false OR v_track_stock IS NULL THEN
      v_results := v_results || jsonb_build_object('idx', v_idx, 'skipped', true, 'reason', 'no_track_stock');
      v_idx := v_idx + 1;
      CONTINUE;
    END IF;

    -- Buscar stock_level existente (SELECT explícito, no onConflict)
    SELECT id, qty_on_hand, avg_cost INTO v_existing_stock
    FROM stock_levels
    WHERE product_id = v_product_id
      AND branch_id = v_branch_id
      AND lot_id IS NULL
    LIMIT 1;

    -- Actualizar o crear stock_level (suma aditiva)
    IF v_existing_stock IS NOT NULL THEN
      v_new_qty := COALESCE(v_existing_stock.qty_on_hand, 0) + v_qty;
      UPDATE stock_levels
      SET qty_on_hand = v_new_qty,
          avg_cost = CASE WHEN v_unit_cost > 0 THEN v_unit_cost ELSE avg_cost END,
          updated_at = now()
      WHERE id = v_existing_stock.id;
    ELSE
      v_new_qty := v_qty;
      INSERT INTO stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      VALUES (v_product_id, v_branch_id, NULL, v_new_qty, 0, COALESCE(v_unit_cost, 0), 0);
    END IF;

    -- Crear movimiento de stock
    INSERT INTO stock_movements (
      organization_id, branch_id, product_id, lot_id,
      direction, qty, unit_cost, source, source_id, note, updated_by
    )
    VALUES (
      v_organization_id, v_branch_id, v_product_id, NULL,
      'in', v_qty, COALESCE(v_unit_cost, 0),
      v_source, v_source_id, v_note, v_updated_by
    )
    RETURNING id INTO v_movement_id;

    v_results := v_results || jsonb_build_object(
      'idx', v_idx, 'skipped', false,
      'movement_id', v_movement_id, 'new_qty', v_new_qty
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'results', v_results, 'batch_id', p_batch_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_register_stock_entry(jsonb, text) TO authenticated;
