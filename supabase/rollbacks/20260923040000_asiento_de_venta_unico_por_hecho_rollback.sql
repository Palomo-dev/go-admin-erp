-- Rollback de 20260923040000_asiento_de_venta_unico_por_hecho.sql
--
-- Restaura las dos funciones anteriores y devuelve el trigger del POS a
-- inmediato. Con esto vuelve el doble asiento de devengo por cada venta del POS
-- y vuelve el defecto de §E.3 (sin `conditions`, no se crea asiento).
-- No toca datos: los asientos ya escritos se quedan como estén.

create or replace function public.fn_auto_journal_sale()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type != 'invoice' THEN
        RETURN NEW;
    END IF;

    v_is_credit := (NEW.payment_method = 'credit');

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = 'created'
      AND is_active = true
      AND (conditions->>'is_credit')::boolean = v_is_credit
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
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
        p_memo := 'Venta ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true
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
    v_event_type text;
    v_memo text;
    v_existing_id integer;
    v_is_credit boolean;
BEGIN
    IF NEW.status NOT IN ('paid', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    v_is_credit := COALESCE(NEW.balance, 0) > 0;

    SELECT id INTO v_existing_id
    FROM public.journal_entries
    WHERE organization_id = NEW.organization_id
      AND source = 'sales'
      AND source_id = NEW.id::text
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'paid' THEN 'paid'
        WHEN 'confirmed' THEN 'created'
        WHEN 'completed' THEN 'created'
    END;

    SELECT * INTO v_rule
    FROM public.accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = v_event_type
      AND is_active = true
      AND (conditions->>'is_credit')::boolean = v_is_credit
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM public.accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'created'
          AND is_active = true
          AND (conditions->>'is_credit')::boolean = v_is_credit
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM public.accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND is_active = true
          AND (conditions->>'is_credit')::boolean = v_is_credit
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_memo := 'Venta POS ' || COALESCE(NEW.id::text, '');

    v_entry_id := public.fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := v_memo,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true
    );

    RETURN NEW;
END;
$function$;

drop trigger if exists trg_auto_journal_sale_pos on public.sales;

create trigger trg_auto_journal_sale_pos
  after insert or update of status on public.sales
  for each row
  execute function public.fn_auto_journal_sale_pos();
