-- ============================================================
-- ROLLBACK de 20260909045821_crm_v4_f00_33_fix_auto_journal_commission_memo_cast
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura el cuerpo ANTERIOR de fn_auto_journal_commission: la migración afirma
-- que solo cambió el cast del memo (NEW.payee_id -> NEW.payee_id::text) y fijó
-- search_path; la versión previa es este mismo cuerpo sin ambos. No se hace DROP.
-- ADVERTENCIA: la versión anterior falla en tiempo de plan (42804 "COALESCE
-- types text and uuid cannot be matched") en cada INSERT/UPDATE de commissions
-- con accounting_rule activa. Solo para reversión byte a byte.
--
-- SOBRE LOS DATOS: no toca datos.
-- ============================================================

begin;
create or replace function public.fn_auto_journal_commission()
returns trigger language plpgsql as $function$
DECLARE
    v_rule RECORD; v_entry_id integer; v_branch_id integer; v_event_type text; v_memo text; v_source_id text;
BEGIN
    IF NEW.status IS NULL THEN RETURN NEW; END IF;
    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;
    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN RETURN NEW; END IF;
    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN RETURN NEW; END IF;
    SELECT * INTO v_rule FROM accounting_rules
     WHERE organization_id = NEW.organization_id AND source_type = 'commission' AND event_type = v_event_type AND is_active = true
     ORDER BY priority LIMIT 1;
    IF v_rule IS NULL THEN RETURN NEW; END IF;
    IF NEW.branch_id IS NOT NULL THEN v_branch_id := NEW.branch_id;
    ELSE SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id; END IF;
    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id, 'N/A')   -- versión anterior (bug 42804)
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;
    v_source_id := NEW.id::text || ':' || v_event_type;
    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id, p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now()) WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now()) END,
        p_memo := v_memo, p_source := 'commissions', p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code, p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.commission_amount);
    RETURN NEW;
END;
$function$;
alter function public.fn_auto_journal_commission() reset search_path;
commit;
