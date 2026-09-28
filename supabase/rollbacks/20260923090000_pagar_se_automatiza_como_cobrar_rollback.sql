-- Rollback de 20260923090000_pagar_se_automatiza_como_cobrar.sql
--
-- Retira el trigger de cuentas por pagar y devuelve
-- `fn_recalc_invoice_balance_from_payments` a la versión que ignora los pagos
-- hechos contra la cuenta por pagar, y `fn_auto_journal_payment` a la que no
-- mira `bank_account_id`.
--
-- Importante: revertir esto **sin** revertir también el commit de aplicación
-- deja el saldo de proveedores sin nadie que lo actualice, porque las pantallas
-- dejaron de hacerlo a mano. Los dos van juntos.
--
-- La columna `payments.bank_account_id` se conserva: tiene datos y quitarla
-- volvería a romper el pago con cuenta bancaria. El DROP queda comentado.

drop trigger if exists tr_update_accounts_payable_on_payment on public.payments;
drop function if exists public.fn_recalc_accounts_payable_from_payments();

create or replace function public.fn_recalc_invoice_balance_from_payments()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_new_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    IF r.src = 'invoice_purchase' THEN
      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = r.sid::uuid;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM payments
      WHERE source = 'invoice_purchase' AND source_id = r.sid AND status = 'completed';

      v_balance := GREATEST(v_total - v_paid, 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = r.sid::uuid AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSE
      SELECT id INTO v_invoice_id FROM invoice_sales WHERE sale_id = r.sid::uuid LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    v_paid := fn_invoice_sales_paid(v_invoice_id);
    v_balance := GREATEST(v_total - v_paid, 0);

    v_new_status := v_status;
    IF v_paid > 0 THEN
      v_new_status := CASE WHEN v_balance = 0 THEN 'paid' ELSE 'partial' END;
    END IF;

    UPDATE invoice_sales
    SET balance = v_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice_id
      AND (balance IS DISTINCT FROM v_balance OR status IS DISTINCT FROM v_new_status);
  END LOOP;

  RETURN NULL;
END;
$function$;

-- `fn_auto_journal_payment` vuelve a la versión que no mira `bank_account_id`.
-- Hay que restaurarla ANTES de retirar `fn_money_account_code_pago`, o el
-- disparador quedaría llamando a una función que ya no existe.
create or replace function public.fn_auto_journal_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_source_type text;
    v_es_cobro boolean;
    v_memo text;
    v_money_account text;
    v_counterpart text;
    v_discount numeric := 0;
    v_discount_account text;
BEGIN
    IF NEW.status IS NOT NULL AND NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.source IN ('invoice_sales', 'account_receivable', 'sale', 'web_order') THEN
        v_source_type := 'sale_payment';
        v_es_cobro := true;
        v_memo := 'Cobro recibido';
    ELSIF NEW.source IN ('invoice_purchase', 'account_payable') THEN
        v_source_type := 'purchase_payment';
        v_es_cobro := false;
        v_memo := 'Pago a proveedor';
    ELSE
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de ' || v_source_type);
        RETURN NEW;
    END IF;

    v_money_account := fn_money_account_code(NEW.organization_id, NEW.branch_id, NEW.method);

    v_counterpart := CASE WHEN v_es_cobro
        THEN v_rule.credit_account_code
        ELSE v_rule.debit_account_code
    END;

    IF v_money_account IS NULL THEN
        v_money_account := CASE WHEN v_es_cobro
            THEN v_rule.debit_account_code
            ELSE v_rule.credit_account_code
        END;
    END IF;

    IF v_counterpart LIKE '4%' THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            v_money_account, v_counterpart, NEW.amount,
            'no_rule',
            'La regla de ' || v_source_type || ' lleva el cobro a la cuenta de ingreso ' ||
            v_counterpart || '; el ingreso ya se devengó con la venta');
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.discount_amount, 0) > 0 AND v_rule.discount_account_code IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM chart_of_accounts
           WHERE organization_id = NEW.organization_id
             AND account_code = v_rule.discount_account_code
       ) THEN
        v_discount := NEW.discount_amount;
        v_discount_account := v_rule.discount_account_code;
    END IF;

    IF v_es_cobro THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_money_account,
            p_credit_account := v_counterpart,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := false,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_counterpart,
            p_credit_account := v_money_account,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := true,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

drop function if exists public.fn_money_account_code_pago(integer, integer, text, integer);

-- Para quitar también la columna (vuelve a romper el pago con cuenta bancaria):
-- drop index if exists public.idx_payments_bank_account;
-- alter table public.payments drop column if exists bank_account_id;
