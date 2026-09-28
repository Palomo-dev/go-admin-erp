-- El kardex guardaba el PRECIO DE VENTA en la columna de costo.
--
-- `pos_checkout_v1` pasa `v_unit_price` —el precio de venta del renglón— al
-- séptimo argumento de `decrement_stock_with_recipe`, que es `p_unit_cost`. Y
-- `decrement_stock_on_sale` escribía
-- `COALESCE(p_unit_cost, v_existing_stock.avg_cost, 0)`: el valor del llamador
-- **gana** al costo del propio inventario.
--
-- Medido en producción: de 2.122 movimientos de venta cruzados con su renglón,
-- **2.063 tienen `unit_cost` exactamente igual al precio de venta** y 2.055
-- difieren del `avg_cost` de sus existencias. El costo registrado de esas
-- salidas suma 47.517.530 cuando el de las existencias da 58.333.784.
-- (docs/design/AUDITORIA-KARDEX-LOTES.md)
--
-- La corrección no es tocar `pos_checkout_v1` —22 KB en el camino crítico del
-- cobro— sino arreglar quién manda: **en una salida, el costo de lo que sale lo
-- dice el inventario, no quien llama**. El argumento del llamador queda como
-- último recurso, para no dejar en cero a quien sí pasaba un costo real y no
-- tiene existencias previas.
--
-- Orden de resolución, en `fn_costo_unitario_producto`:
--   1. `stock_levels.avg_cost` de esa sucursal, si es mayor que cero;
--   2. el costo vigente en `product_costs` (`effective_from`/`effective_to`);
--   3. lo que pase el llamador;
--   4. cero, que significa «no se sabe», no «es gratis».
--
-- El asiento de CMV va con lo mismo. Además tomaba el costo del **último
-- movimiento de entrada de toda la organización**, sin mirar sucursal: el costo
-- de una compra en otra ciudad se aplicaba a una venta aquí. Y no tenía clave
-- del hecho, así que un reproceso lo duplicaba.
--
-- Su clave es `cogs:sale_item:{id}` y no `cogs:sale:{sale_id}` como dice la
-- convención de §P.3: el disparador es por renglón, y una clave por venta haría
-- que solo el primer renglón generase asiento y el resto se descartara por
-- idempotencia.
--
-- Esto **no repara el histórico**: los movimientos ya escritos conservan el
-- precio en la columna de costo. Eso va con la fecha de corte.

create or replace function public.fn_costo_unitario_producto(
  p_product_id integer,
  p_branch_id integer,
  p_fallback numeric default null
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_costo numeric;
BEGIN
    SELECT avg_cost INTO v_costo
    FROM stock_levels
    WHERE product_id = p_product_id
      AND branch_id = p_branch_id
      AND lot_id IS NULL
    LIMIT 1;

    IF COALESCE(v_costo, 0) > 0 THEN
        RETURN v_costo;
    END IF;

    SELECT cost INTO v_costo
    FROM product_costs
    WHERE product_id = p_product_id
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF COALESCE(v_costo, 0) > 0 THEN
        RETURN v_costo;
    END IF;

    RETURN COALESCE(p_fallback, 0);
END;
$function$;

revoke all on function public.fn_costo_unitario_producto(integer, integer, numeric)
  from public, anon;

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
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_track_stock boolean;
  v_existing_stock record;
  v_new_qty numeric;
  v_movement_id integer;
  v_unit_cost numeric;
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

  -- En una salida, el costo lo dice el inventario. El del llamador es el
  -- último recurso: el POS pasa ahí el precio de venta.
  v_unit_cost := fn_costo_unitario_producto(p_product_id, p_branch_id, p_unit_cost);

  IF v_existing_stock IS NOT NULL THEN
    v_new_qty := COALESCE(v_existing_stock.qty_on_hand, 0) - p_qty;
    UPDATE stock_levels
    SET qty_on_hand = v_new_qty,
        updated_at = now()
    WHERE id = v_existing_stock.id;
  ELSE
    v_new_qty := -p_qty;
    INSERT INTO stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    VALUES (p_product_id, p_branch_id, NULL, v_new_qty, 0, v_unit_cost, 0);
  END IF;

  INSERT INTO stock_movements (
    organization_id, branch_id, product_id, lot_id,
    direction, qty, unit_cost, source, source_id, note, updated_by
  )
  VALUES (
    p_organization_id, p_branch_id, p_product_id, NULL,
    'out', p_qty, v_unit_cost,
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
set search_path to 'public', 'pg_temp'
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

    -- El costo sale del inventario de la sucursal de la venta. Antes salía del
    -- último movimiento de entrada de toda la organización, sin mirar sucursal.
    v_unit_cost := fn_costo_unitario_producto(NEW.product_id, v_sale.branch_id, NULL);

    IF COALESCE(v_unit_cost, 0) = 0 THEN
        -- Último recurso: la última entrada de esa sucursal.
        SELECT unit_cost INTO v_unit_cost
        FROM stock_movements
        WHERE product_id = NEW.product_id
          AND organization_id = v_sale.organization_id
          AND branch_id = v_sale.branch_id
          AND direction = 'in'
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    v_cogs_amount := NEW.quantity * COALESCE(v_unit_cost, 0);

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
        PERFORM fn_log_journal_failure(
            v_sale.organization_id, v_sale.branch_id, COALESCE(NEW.created_at, now()),
            'sale_items', NEW.id::text, 'cogs:sale_item:' || NEW.id::text,
            NULL, NULL, v_cogs_amount,
            'no_rule', 'Sin regla contable activa de inventario/confirmed para el CMV');
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
        p_amount := v_cogs_amount,
        p_fact_key := 'cogs:sale_item:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;
