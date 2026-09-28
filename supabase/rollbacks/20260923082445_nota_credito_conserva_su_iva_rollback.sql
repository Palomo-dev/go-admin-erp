-- Rollback de 20260923082445_nota_credito_conserva_su_iva.sql
--
-- La nota crédito vuelve a perder su IVA en la cabecera al recalcularse
-- (GREATEST(total - subtotal, 0)) y su asiento vuelve a no tener clave del
-- hecho. No toca datos.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.fn_recalc_invoice_totals'::regproc) into v_def;
  v_def := replace(v_def,
    'v_tax := CASE WHEN v_total < 0 THEN LEAST(v_total - v_subtotal, 0) ELSE GREATEST(v_total - v_subtotal, 0) END;',
    'v_tax := GREATEST(v_total - v_subtotal, 0);');
  execute v_def;
end $$;

create or replace function public.fn_auto_journal_credit_note()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
BEGIN
    IF NEW.document_type IS NULL OR NEW.document_type != 'credit_note' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale_credit_note'
      AND event_type = 'created'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Nota Crédito ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := ABS(COALESCE(NEW.total, 0)),
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END
    );

    RETURN NEW;
END;
$function$;
