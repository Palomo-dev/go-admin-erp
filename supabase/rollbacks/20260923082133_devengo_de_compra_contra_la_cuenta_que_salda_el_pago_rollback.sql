-- Rollback de 20260923082133_devengo_de_compra_contra_la_cuenta_que_salda_el_pago.sql
--
-- Restaura fn_auto_journal_purchase anterior: contado -> regla de contado
-- (1405 D / 1110 C), sin clave del hecho, idempotencia por memo sin
-- organización. Vuelve el doble descuento del banco en compras de contado
-- con pago. No toca datos.

create or replace function public.fn_auto_journal_purchase()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_exists boolean;
    v_is_credit boolean;
BEGIN
    IF NEW.status IS DISTINCT FROM 'received' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM journal_entries
        WHERE source = 'invoice_purchase'
          AND source_id = NEW.id::text
          AND memo LIKE 'Compra %'
    ) INTO v_exists;
    IF v_exists THEN
        RETURN NEW;
    END IF;

    v_is_credit := (NEW.payment_method = 'credit');

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'purchase'
      AND event_type = 'created'
      AND is_active = true
      AND (conditions->>'is_credit')::boolean = v_is_credit
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'purchase'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Compra ' || COALESCE(NEW.number_ext, NEW.id::text),
        p_source := 'invoice_purchase',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END
    );

    RETURN NEW;
END;
$function$;

drop function if exists public.fn_regla_devengo_compra(integer);
