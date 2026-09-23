-- Rollback de 20260923080135_devengo_de_venta_contra_la_cuenta_que_salda_el_cobro.sql
--
-- Restaura los dos disparadores de devengo tal como los dejó
-- 20260923033248_asiento_de_venta_unico_por_hecho: contado -> regla de contado
-- (1105), crédito -> regla de crédito (1305). Vuelve el doble activo en las
-- ventas de contado que tienen cobro. No toca datos.

create or replace function public.fn_auto_journal_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
    v_fact_key text;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;

    v_is_credit := COALESCE(NEW.balance, 0) > 0;

    v_fact_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND is_active = true
      AND (conditions->>'is_credit' IS NULL
           OR (conditions->>'is_credit')::boolean = v_is_credit)
    ORDER BY
      (CASE WHEN conditions->>'is_credit' IS NOT NULL THEN 0 ELSE 1 END),
      (CASE WHEN event_type = 'created' THEN 0 ELSE 1 END),
      priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule',
            'Sin regla contable activa de venta ' ||
            CASE WHEN v_is_credit THEN '(a crédito)' ELSE '(de contado)' END);
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Venta ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;

create or replace function public.fn_auto_journal_sale_pos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
    v_fact_key text;
BEGIN
    IF NEW.status NOT IN ('paid', 'partial', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    v_is_credit := COALESCE(NEW.balance, 0) > 0;
    v_fact_key := 'accrual:sale:' || NEW.id::text;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND is_active = true
      AND (conditions->>'is_credit' IS NULL
           OR (conditions->>'is_credit')::boolean = v_is_credit)
    ORDER BY
      (CASE WHEN conditions->>'is_credit' IS NOT NULL THEN 0 ELSE 1 END),
      (CASE WHEN event_type = 'created' THEN 0 ELSE 1 END),
      priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule',
            'Sin regla contable activa de venta ' ||
            CASE WHEN v_is_credit THEN '(a crédito)' ELSE '(de contado)' END);
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;

drop function if exists public.fn_regla_devengo_venta(integer);
