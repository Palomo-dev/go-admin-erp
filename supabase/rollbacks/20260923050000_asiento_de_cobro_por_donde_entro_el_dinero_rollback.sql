-- Rollback de 20260923050000_asiento_de_cobro_por_donde_entro_el_dinero.sql
--
-- Devuelve el asiento del pago a la versión anterior: cuentas de una regla
-- genérica (con lo que vuelve a tocar ingresos donde la regla lo diga), sin
-- clave del hecho, sin los `source` 'sale' y 'web_order', y contabilizando
-- también los pagos fallidos. No toca datos.

drop trigger if exists trg_auto_journal_payment on public.payments;

create or replace function public.fn_auto_journal_payment()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_source_type text;
    v_event_type text;
    v_memo text;
    v_discount numeric;
    v_discount_on_debit boolean;
BEGIN
    IF NEW.source = 'invoice_sales' OR NEW.source = 'account_receivable' THEN
        v_source_type := 'sale_payment';
        v_memo := 'Cobro recibido';
        v_discount_on_debit := true;
        IF NEW.status = 'partial' THEN
            v_event_type := 'partial_paid';
        ELSE
            v_event_type := 'paid';
        END IF;
    ELSIF NEW.source = 'invoice_purchase' OR NEW.source = 'account_payable' THEN
        v_source_type := 'purchase_payment';
        v_event_type := 'paid';
        v_memo := 'Pago a proveedor';
        v_discount_on_debit := false;
    ELSE
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = v_source_type
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_discount := COALESCE(NEW.discount_amount, 0);

    v_entry_id := fn_create_journal_entry_with_discount(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
        p_source := 'payments',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.amount,
        p_discount_account := v_rule.discount_account_code,
        p_discount_amount := v_discount,
        p_discount_on_debit := v_discount_on_debit,
        p_created_by := NEW.created_by
    );

    RETURN NEW;
END;
$function$;

create trigger trg_auto_journal_payment
  after insert on public.payments
  for each row
  execute function public.fn_auto_journal_payment();

drop function if exists public.fn_money_account_code(integer, integer, text);
