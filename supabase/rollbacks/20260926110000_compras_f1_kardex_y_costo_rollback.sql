-- Rollback de 20260926110000_compras_f1_kardex_y_costo.sql
--
-- Orden: revertir antes 20260926130000 y 20260926120000 (usan
-- `fn_kardex_entrada_compra_int` y `fn_fc_acceso_sucursal`).
--
-- `fn_finanzas_exigir_permiso` NO se borra: es del pago único (sesión de
-- ventas, `pago_unico_registrar_y_anular`); esta migración la había redefinido
-- con la misma firma y 20260926115000 devolvió su versión.
--
-- No revierte datos: los movimientos de kardex y los costos (`product_costs`)
-- que se registraron con estas funciones se quedan.

drop function if exists public.fn_kardex_entrada_compra(integer, integer, text, text, jsonb, uuid, integer, boolean);
drop function if exists public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean);
drop function if exists public.fn_fc_acceso_sucursal(integer);

CREATE OR REPLACE FUNCTION public.fn_auto_journal_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_unit_cost numeric;
    v_description text;
    v_product_name text;
    v_existing_entry integer;
    v_debit_account text;
    v_credit_account text;
BEGIN
    -- Excluir setup inicial, compras (las contabiliza la factura, ADR-CC-009)
    -- y traslados entre sucursales (no son ajustes).
    IF NEW.source IN ('initial', 'purchase', 'purchase_order', 'purchase_invoice',
                      'transfer', 'transfer_out', 'transfer_in') THEN
        RETURN NEW;
    END IF;

    IF NEW.direction NOT IN ('out', 'in') THEN
        RETURN NEW;
    END IF;

    -- Obtener costo unitario
    v_unit_cost := COALESCE(NEW.unit_cost, 0);
    IF v_unit_cost = 0 THEN
        SELECT sl.avg_cost INTO v_unit_cost
        FROM stock_levels sl
        WHERE sl.product_id = NEW.product_id
          AND sl.branch_id = NEW.branch_id
        LIMIT 1;
    END IF;

    v_amount := ABS(NEW.qty) * COALESCE(v_unit_cost, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Verificar asiento existente
    SELECT je.id INTO v_existing_entry
    FROM journal_entries je
    WHERE je.source = 'stock_movements'
      AND je.source_id = NEW.id::text
      AND je.organization_id = NEW.organization_id
    LIMIT 1;

    IF v_existing_entry IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'inventory'
      AND event_type = 'adjusted'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- Resolver sub-cuentas por sucursal (1405 → 1405-0X, 6105 → 6105-0X)
    SELECT sub_account_code INTO v_debit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.debit_account_code
    LIMIT 1;

    SELECT sub_account_code INTO v_credit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.credit_account_code
    LIMIT 1;

    -- Fallback a cuenta base si no hay sub-cuenta
    v_debit_account := COALESCE(v_debit_account, v_rule.debit_account_code);
    v_credit_account := COALESCE(v_credit_account, v_rule.credit_account_code);

    SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id LIMIT 1;

    IF NEW.direction = 'out' THEN
        v_description := 'Salida Inventario - ' || COALESCE(v_product_name, 'Prod:' || NEW.product_id) || ' - ' || COALESCE(NEW.source, '');
        PERFORM fn_create_journal_entry(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
            v_description, 'stock_movements', NEW.id::text,
            v_debit_account, v_credit_account, v_amount
        );
    ELSE
        v_description := 'Entrada Ajuste - ' || COALESCE(v_product_name, 'Prod:' || NEW.product_id);
        PERFORM fn_create_journal_entry(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
            v_description, 'stock_movements', NEW.id::text,
            v_credit_account, v_debit_account, v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;
