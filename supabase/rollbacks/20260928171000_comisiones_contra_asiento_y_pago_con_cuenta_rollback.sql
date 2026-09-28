-- Rollback de 20260928171000_comisiones_contra_asiento_y_pago_con_cuenta.
-- Restaura fn_auto_journal_commission anterior (pg_get_functiondef del 2026-09-28)
-- y quita el estampado de actor. NO deshace contra-asientos ya creados (son
-- asientos publicados e inmutables, ADR-CC-012) ni borra metadata.paid_by /
-- cancelled_by ya escritos.

drop trigger if exists trg_commission_estampar_actor on public.commissions;
drop function if exists public.fn_commission_estampar_actor();

create or replace function public.fn_auto_journal_commission()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'commission'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority LIMIT 1;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- La sucursal del asiento tiene que ser de la MISMA organizacion que la
    -- comision. Antes se copiaba NEW.branch_id sin comprobarlo.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_auto_journal_commission: la comision % apunta a la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- journal_entries.branch_id es NOT NULL: sin sucursal no hay asiento, pero
    -- tampoco se inventa una. Se deja registrado igual que el caso 'no_rule'.
    IF v_branch_id IS NULL THEN
        PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_branch', 'La organizacion no tiene ninguna sucursal propia y journal_entries.branch_id es NOT NULL');
        RETURN NEW;
    END IF;

    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id::text, 'N/A')
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;

    v_source_id := NEW.id::text || ':' || v_event_type;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type
            WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now())
            WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now())
        END,
        p_memo := v_memo,
        p_source := 'commissions',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.commission_amount
    );

    RETURN NEW;
END;
$function$;
