-- Devengo de compra contra la cuenta que salda el pago (espejo de ADR-CC-001).
--
-- fn_auto_journal_purchase elegía la regla de contado (1405 D / 1110 C) cuando
-- la compra no era a crédito, y el pago a proveedor —automatizado el 23-sep en
-- 9dc89ebd— genera además 2105 D / 1110 C: el banco baja dos veces por el mismo
-- pago y 2105 queda negativo. Tampoco tenía clave del hecho: la idempotencia era
-- un `memo LIKE 'Compra %'` sin organización.
--
-- Regla: el devengo de compra SIEMPRE acredita la cuenta por pagar que debita el
-- pago (`purchase_payment.debit_account_code`); el pago la salda desde Caja o
-- Bancos según por dónde salió el dinero. IVA de compras al DÉBITO
-- (p_tax_is_credit := false). Clave `accrual:purchase:{id}`.
--
-- ADR: docs/decisiones/ADR-CC-006-devengo-de-compra.md

create or replace function public.fn_regla_devengo_compra(p_organization_id integer)
returns table (debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    v_payable text;
begin
    -- La misma consulta que usa fn_auto_journal_payment para la contrapartida
    -- del pago a proveedor.
    select r.debit_account_code into v_payable
    from accounting_rules r
    where r.organization_id = p_organization_id
      and r.source_type = 'purchase_payment'
      and r.is_active = true
    order by r.priority
    limit 1;

    return query
    select r.debit_account_code, coalesce(v_payable, r.credit_account_code),
           r.tax_account_code, r.use_tax_from_document
    from accounting_rules r
    where r.organization_id = p_organization_id
      and r.source_type = 'purchase'
      and r.is_active = true
      and coalesce(r.event_type, 'created') = 'created'
    order by
      (r.credit_account_code = v_payable) desc nulls last,
      (r.conditions->>'is_credit' = 'true') desc nulls last,
      r.priority
    limit 1;
end;
$$;

revoke all on function public.fn_regla_devengo_compra(integer) from public, anon, authenticated;
grant execute on function public.fn_regla_devengo_compra(integer) to service_role;

create or replace function public.fn_auto_journal_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_fact_key text;
BEGIN
    IF NEW.status IS DISTINCT FROM 'received' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:purchase:' || NEW.id::text;

    -- Compras contabilizadas antes de tener clave del hecho.
    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE organization_id = NEW.organization_id
          AND source = 'invoice_purchase'
          AND source_id = NEW.id::text
          AND memo LIKE 'Compra %'
    ) THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule FROM fn_regla_devengo_compra(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_purchase', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de compra');
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
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;
