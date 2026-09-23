-- La nota crédito conserva su IVA y su asiento lleva clave del hecho.
--
-- Encontrado en el E2E del cierre contable (org de prueba 149, caso h): una nota
-- crédito se guarda con importes negativos y fn_recalc_invoice_totals calculaba
-- `GREATEST(total - subtotal, 0)`; con total −1.190.000 y subtotal −1.000.000
-- el impuesto quedaba en 0 en la cabecera. El asiento se salvaba porque toma el
-- valor del INSERT, pero cualquier reporte de IVA que lea la cabecera perdía la
-- devolución de IVA. Ahora el impuesto conserva el signo del documento.
--
-- fn_auto_journal_credit_note no tenía clave del hecho: un reproceso podía
-- duplicar la reversión. Ahora usa `accrual:credit_note:{id}` y el IVA va al
-- DÉBITO de forma explícita (p_tax_is_credit := false).

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.fn_recalc_invoice_totals'::regproc) into v_def;
  if position('v_tax := GREATEST(v_total - v_subtotal, 0);' in v_def) = 0 then
    raise exception 'fn_recalc_invoice_totals cambió desde la última lectura: revisar antes de aplicar';
  end if;
  -- Solo la rama de ventas (primera aparición); en compras no hay documentos negativos.
  v_def := regexp_replace(v_def,
    'v_tax := GREATEST\(v_total - v_subtotal, 0\);',
    'v_tax := CASE WHEN v_total < 0 THEN LEAST(v_total - v_subtotal, 0) ELSE GREATEST(v_total - v_subtotal, 0) END;');
  execute v_def;
end $$;

create or replace function public.fn_auto_journal_credit_note()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, 'accrual:credit_note:' || NEW.id::text,
            NULL, NULL, ABS(COALESCE(NEW.total, 0)),
            'no_rule', 'Sin regla contable activa de nota crédito');
        RETURN NEW;
    END IF;

    -- Inverso a la venta: débito = ingreso (neto) e impuesto; crédito = cliente.
    -- Las notas crédito guardan total/impuesto en negativo: se usa ABS().
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
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := 'accrual:credit_note:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;
