-- Devengo de venta contra la cuenta que salda el cobro.
--
-- Hallazgo: el modelo de devengo + cobro (d8090114) cuenta dos veces el activo
-- en las ventas de contado. La venta se devengaba contra la regla de contado
-- (1105 Caja D / 4105 C) y el pago generaba además su asiento de cobro
-- (1110/1105 D / 1305 C): Caja y Bancos suben por el mismo dinero y 1305 queda
-- en negativo. Histórico: 2.566 asientos de devengo contra 1105 y 2.166 cobros.
--
-- Regla: el devengo SIEMPRE debita la cuenta por cobrar que acredita el cobro
-- (`sale_payment.credit_account_code`), y el cobro lleva el dinero a Caja o
-- Bancos según el medio de pago real (`fn_money_account_code_pago`). Contado y
-- crédito dan el mismo devengo; la diferencia la marca que el cobro exista.
-- Así el asiento no depende de qué disparador llegue primero (venta o factura)
-- ni del orden en que se insertan pago y venta (el pedido web inserta el pago
-- antes que la venta), y la cuenta por cobrar se cancela a cero.
--
-- ADR: docs/decisiones/ADR-CC-001-devengo-contra-cuenta-por-cobrar.md

create or replace function public.fn_regla_devengo_venta(p_organization_id integer)
returns table (debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    v_recv text;
begin
    -- La misma consulta que usa fn_auto_journal_payment para la contrapartida
    -- del cobro: lo que el cobro acredita es lo que el devengo debita.
    select r.credit_account_code into v_recv
    from accounting_rules r
    where r.organization_id = p_organization_id
      and r.source_type = 'sale_payment'
      and r.is_active = true
    order by r.priority
    limit 1;

    return query
    select coalesce(v_recv, r.debit_account_code), r.credit_account_code,
           r.tax_account_code, r.use_tax_from_document
    from accounting_rules r
    where r.organization_id = p_organization_id
      and r.source_type = 'sale'
      and r.is_active = true
      and coalesce(r.event_type, 'created') = 'created'
      and r.credit_account_code like '4%'
    order by
      (r.debit_account_code = v_recv) desc nulls last,
      (r.conditions->>'is_credit' = 'true') desc nulls last,
      r.priority
    limit 1;
end;
$$;

revoke all on function public.fn_regla_devengo_venta(integer) from public, anon, authenticated;
grant execute on function public.fn_regla_devengo_venta(integer) to service_role;

comment on function public.fn_regla_devengo_venta(integer) is
  'Cuentas del devengo de una venta: débito = cuenta por cobrar que acredita el cobro (sale_payment), crédito = ingreso, impuesto al crédito. ADR-CC-001.';

create or replace function public.fn_auto_journal_sale()
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
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;

    v_fact_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
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
    v_fact_key text;
BEGIN
    IF NEW.status NOT IN ('paid', 'partial', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:sale:' || NEW.id::text;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
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
