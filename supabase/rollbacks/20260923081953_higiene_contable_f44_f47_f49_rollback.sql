-- Rollback de 20260923081953_higiene_contable_f44_f47_f49.sql
--
-- Restaura el estado exacto anterior: el borrador vuelve a contabilizarse al
-- insertarse (F-49), anular un borrador vuelve a generar contra-asiento, la
-- rama de compras vuelve a leer OLD (F-44), y vuelven los permisos anteriores
-- (authenticated en fn_create_journal_entry; anon en las RPC del asistente y en
-- fn_sync_invoice_items_from_sale, sin guarda de pertenencia). No toca datos.

-- F-49: devengo sin filtro de estado (versión de 20260923080135)
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

drop trigger if exists trg_auto_journal_sale on public.invoice_sales;
create trigger trg_auto_journal_sale
  after insert on public.invoice_sales
  for each row execute function public.fn_auto_journal_sale();

-- Anulación sin guarda (versión anterior a este archivo)
create or replace function public.fn_auto_journal_void()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
BEGIN
    IF (NEW.status IN ('void','voided','cancelled'))
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND (OLD.status NOT IN ('void','voided','cancelled')) THEN

        IF NEW.document_type = 'credit_note' THEN
            RETURN NEW;
        END IF;

        IF EXISTS (
            SELECT 1 FROM invoice_sales cn
            WHERE cn.related_invoice_id = NEW.id
              AND cn.document_type = 'credit_note'
        ) THEN
            RETURN NEW;
        END IF;

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'voided'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            RETURN NEW;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := now(),
            p_memo := 'Anulación Factura ' || COALESCE(NEW.number, NEW.id::text),
            p_source := 'invoice_sales',
            p_source_id := NEW.id::text || ':void',
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := ABS(COALESCE(NEW.total, 0)),
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- F-44: la línea con OLD vuelve. Para no duplicar 120 líneas, se reemplaza
-- solo esa asignación en el cuerpo vigente.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.fn_recalc_invoice_totals'::regproc) into v_def;
  v_def := replace(v_def,
    'CASE WHEN NEW.invoice_type = ''purchase'' THEN NEW.invoice_id END);',
    'CASE WHEN NEW.invoice_type = ''purchase'' THEN OLD.invoice_id END);');
  execute v_def;
end $$;

-- F-47: permisos anteriores
grant execute on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text)
  to authenticated;
grant execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) to anon;
grant execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) to anon;

create or replace function public.fn_sync_invoice_items_from_sale(p_invoice_id uuid)
returns integer
language plpgsql
security definer
as $function$
DECLARE
  v_sale_id uuid;
  v_inserted integer := 0;
BEGIN
  SELECT sale_id INTO v_sale_id FROM invoice_sales WHERE id = p_invoice_id;
  IF v_sale_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM 1 FROM invoice_items WHERE invoice_sales_id = p_invoice_id LIMIT 1;
  IF FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO invoice_items (invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price, tax_rate, total_line, discount_amount, tax_included)
  SELECT
    p_invoice_id,
    p_invoice_id,
    'sale',
    si.product_id,
    COALESCE(p.name, 'Producto'),
    si.quantity,
    si.unit_price,
    COALESCE(si.tax_rate, 0),
    si.total,
    COALESCE(si.discount_amount, 0),
    inv.tax_included
  FROM sale_items si
  LEFT JOIN products p ON p.id = si.product_id
  JOIN invoice_sales inv ON inv.id = p_invoice_id
  WHERE si.sale_id = v_sale_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted;
END;
$function$;

grant execute on function public.fn_sync_invoice_items_from_sale(uuid) to public, anon, authenticated;

comment on table public.tax_account_mapping is null;
