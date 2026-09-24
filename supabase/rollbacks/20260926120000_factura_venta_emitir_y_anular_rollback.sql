-- Rollback de 20260926120000_factura_venta_emitir_y_anular.sql
-- ADVERTENCIA: no revierte datos. Las 22 carteras de facturas anuladas que
-- pasaron a 'cancelled' se quedan así (antes: 20 'paid' con saldo 0, 1 'current'
-- y 1 'overdue' con saldo vivo de facturas anuladas).

drop function if exists public.fn_factura_venta_anular(uuid, text);
drop function if exists public.fn_factura_venta_emitir(uuid);
drop function if exists public.fn_stock_entrada(integer, integer, integer, numeric, numeric, text, text, text, uuid);

create or replace function public.fn_caja_abierta_para(p_org integer, p_branch integer, p_user uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select cs.id
    from public.cash_sessions cs
   where cs.organization_id = p_org
     and cs.status = 'open'
     and case when coalesce((select os.settings->>'mode' from public.organization_settings os
                              where os.organization_id = p_org and os.key = 'pos_cash_session_mode'), 'branch') = 'user'
              then cs.branch_id is not distinct from p_branch and cs.opened_by = p_user
              else (cs.branch_id is not distinct from p_branch or cs.branch_id is null) end
   order by (cs.branch_id is null), cs.opened_at desc
   limit 1;
$function$;
revoke all on function public.fn_caja_abierta_para(integer, integer, uuid) from public, anon;
grant execute on function public.fn_caja_abierta_para(integer, integer, uuid) to authenticated, service_role;

create or replace function public.create_account_receivable(invoice_id_param text)
 returns uuid
 language plpgsql
 security definer
as $function$
DECLARE
  ar_id UUID;
  invoice_record RECORD;
BEGIN
  perform public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = invoice_id_param::uuid));
  BEGIN
    SELECT * INTO invoice_record FROM invoice_sales WHERE id = invoice_id_param::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al convertir o buscar factura con ID %: %', invoice_id_param, SQLERRM;
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada con ID: %', invoice_id_param;
  END IF;
  SELECT id INTO ar_id FROM accounts_receivable WHERE invoice_id = invoice_id_param::UUID LIMIT 1;
  IF FOUND THEN
    UPDATE accounts_receivable
    SET amount = invoice_record.total,
        balance = invoice_record.balance,
        status = CASE
                  WHEN invoice_record.balance <= 0 THEN 'paid'
                  WHEN invoice_record.balance < invoice_record.total THEN 'partial'
                  WHEN invoice_record.due_date < NOW() THEN 'overdue'
                  ELSE 'current'
                END,
        updated_at = NOW()
    WHERE id = ar_id;
    RETURN ar_id;
  ELSE
    INSERT INTO accounts_receivable (id, organization_id, customer_id, invoice_id, sale_id, amount, balance,
                                     due_date, status, days_overdue, created_at, updated_at)
    VALUES (gen_random_uuid(), invoice_record.organization_id, invoice_record.customer_id, invoice_record.id,
            invoice_record.sale_id, invoice_record.total, invoice_record.balance, invoice_record.due_date,
            CASE
              WHEN invoice_record.balance <= 0 THEN 'paid'
              WHEN invoice_record.balance < invoice_record.total THEN 'partial'
              WHEN invoice_record.due_date < NOW() THEN 'overdue'
              ELSE 'current'
            END,
            CASE WHEN invoice_record.due_date < NOW() THEN EXTRACT(DAY FROM NOW() - invoice_record.due_date)::integer ELSE 0 END,
            NOW(), NOW())
    RETURNING id INTO ar_id;
    RETURN ar_id;
  END IF;
END;
$function$;

create or replace function public.calculate_days_overdue()
 returns trigger
 language plpgsql
as $function$
DECLARE
  v_today date;
BEGIN
  IF NEW.due_date IS NOT NULL AND NEW.balance > 0 THEN
    v_today := public.fn_today_for(NEW.organization_id, NEW.branch_id);
    IF NEW.due_date::date < v_today THEN
      NEW.days_overdue := (v_today - NEW.due_date::date)::integer;
      IF NEW.status = 'current' THEN
        NEW.status := 'overdue';
      END IF;
    ELSE
      NEW.days_overdue := 0;
      IF NEW.status = 'overdue' AND NEW.balance = NEW.amount THEN
        NEW.status := 'current';
      END IF;
    END IF;
  ELSE
    NEW.days_overdue := 0;
    IF NEW.balance = 0 THEN
      NEW.status := 'paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

create or replace function public.fn_auto_journal_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_base_key text;
    v_fact_key text;
    v_prev_id integer;
    v_i integer;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;
    IF NEW.status IS NULL OR NEW.status NOT IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    v_base_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;
    v_fact_key := v_base_key;
    FOR v_i IN 1..20 LOOP
        SELECT id INTO v_prev_id FROM journal_entries
        WHERE organization_id = NEW.organization_id AND fact_key = v_fact_key;
        EXIT WHEN v_prev_id IS NULL;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE organization_id = NEW.organization_id AND fact_key = 'reversal:' || v_prev_id);
        v_fact_key := v_base_key || ':reemision:' || v_i;
    END LOOP;
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
