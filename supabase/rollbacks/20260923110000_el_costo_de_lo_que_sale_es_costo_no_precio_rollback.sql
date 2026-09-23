-- Rollback de 20260923110000_el_costo_de_lo_que_sale_es_costo_no_precio.sql
--
-- Restaura las dos funciones anteriores: el costo del llamador vuelve a ganar
-- al del inventario —con lo que el POS vuelve a escribir el precio de venta en
-- la columna de costo— y el CMV vuelve a tomar la última entrada de toda la
-- organización, sin sucursal y sin clave del hecho. No toca datos.

create or replace function public.decrement_stock_on_sale(
  p_organization_id integer,
  p_branch_id integer,
  p_product_id integer,
  p_qty numeric,
  p_source text,
  p_source_id text default null,
  p_unit_cost numeric default null,
  p_note text default null,
  p_updated_by uuid default null
)
returns json
language plpgsql
security definer
as $function$
DECLARE
  v_track_stock boolean;
  v_existing_stock record;
  v_new_qty numeric;
  v_movement_id integer;
BEGIN
  SELECT track_stock INTO v_track_stock
  FROM products
  WHERE id = p_product_id;

  IF NOT FOUND OR v_track_stock = false OR v_track_stock IS NULL THEN
    RETURN json_build_object('success', true, 'skipped', true, 'reason', 'no_track_stock');
  END IF;

  SELECT id, qty_on_hand, avg_cost INTO v_existing_stock
  FROM stock_levels
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id
    AND lot_id IS NULL
  LIMIT 1;

  IF v_existing_stock IS NOT NULL THEN
    v_new_qty := COALESCE(v_existing_stock.qty_on_hand, 0) - p_qty;
    UPDATE stock_levels
    SET qty_on_hand = v_new_qty,
        updated_at = now()
    WHERE id = v_existing_stock.id;
  ELSE
    v_new_qty := -p_qty;
    INSERT INTO stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    VALUES (p_product_id, p_branch_id, NULL, v_new_qty, 0, COALESCE(p_unit_cost, 0), 0);
  END IF;

  INSERT INTO stock_movements (
    organization_id, branch_id, product_id, lot_id,
    direction, qty, unit_cost, source, source_id, note, updated_by
  )
  VALUES (
    p_organization_id, p_branch_id, p_product_id, NULL,
    'out', p_qty, COALESCE(p_unit_cost, v_existing_stock.avg_cost, 0),
    p_source, p_source_id, p_note, p_updated_by
  )
  RETURNING id INTO v_movement_id;

  RETURN json_build_object(
    'success', true,
    'skipped', false,
    'movement_id', v_movement_id,
    'new_qty', v_new_qty
  );
END;
$function$;

create or replace function public.fn_auto_journal_sale_item_cogs()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_sale RECORD;
    v_unit_cost numeric;
    v_cogs_amount numeric;
BEGIN
    IF NEW.product_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_sale FROM sales WHERE id = NEW.sale_id;

    IF v_sale IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT unit_cost INTO v_unit_cost
    FROM stock_movements
    WHERE product_id = NEW.product_id
      AND organization_id = v_sale.organization_id
      AND direction = 'in'
    ORDER BY created_at DESC
    LIMIT 1;

    v_unit_cost := COALESCE(v_unit_cost, 0);
    v_cogs_amount := NEW.quantity * v_unit_cost;

    IF v_cogs_amount = 0 THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_sale.organization_id
      AND source_type = 'inventory'
      AND event_type = 'confirmed'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_sale.organization_id,
        p_branch_id := v_sale.branch_id,
        p_entry_date := COALESCE(NEW.created_at, now()),
        p_memo := 'CMV - Venta Prod:' || NEW.product_id,
        p_source := 'sale_items',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_cogs_amount
    );

    RETURN NEW;
END;
$function$;

drop function if exists public.fn_costo_unitario_producto(integer, integer, numeric);
