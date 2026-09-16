-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_33_fix_auto_journal_commission_memo_cast`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 ff891d598a6f9165ce7fb1398d00d208). No reformatear.
-- F0 r4 · Tarea 2c (segundo eslabón): `fn_auto_journal_commission`
-- (AFTER INSERT OR UPDATE OF status ON commissions) construía el memo con
--   COALESCE(NEW.payee_name, NEW.payee_id, 'N/A')
-- donde payee_name es text y payee_id es uuid -> ERROR 42804
-- "COALESCE types text and uuid cannot be matched" en tiempo de plan, sin
-- importar qué rama del CASE se tome. Se dispara siempre que la organización
-- tiene una accounting_rule activa de source_type='commission' (las 83 la
-- tienen) y commission_amount > 0.
-- Encadenado con fn_create_commission_on_opportunity_won, el efecto era que
-- cerrar como ganada una oportunidad con comisión hacía fallar la transacción
-- entera del cambio de etapa.
-- Se corrige solo el cast; el resto de la función es idéntico. Se añade
-- search_path fijo (todas las referencias son de public).
CREATE OR REPLACE FUNCTION public.fn_auto_journal_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.branch_id IS NOT NULL THEN
        v_branch_id := NEW.branch_id;
    ELSE
        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id;
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