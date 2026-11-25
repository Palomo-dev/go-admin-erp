-- Reversión de 20261126010000_pagos_vueltas_solo_lo_cobrado.sql
--
-- 1. Quita la restricción diferida y la normalización al insertar (y sus funciones).
-- 2. Devuelve fn_auto_journal_payment a 20261125120000 y fn_invoice_sales_paid a 20261110100000
--    (las dos con amount a secas).
-- 3. NO borra payments.cash_received ni payments.change_given: los pagos registrados mientras
--    estuvo la migración tienen amount = lo aplicado y change_amount = 0, y el dato de lo entregado
--    y las vueltas solo vive en esas columnas. Son NULL-ables y nadie las exige; si de verdad se
--    quieren quitar, las dos líneas comentadas al final lo hacen (se pierde ese dato informativo).
-- No toca filas de payments ni asientos: los asientos ya creados por lo aplicado se quedan así.

DROP TRIGGER IF EXISTS zz_payments_no_excede_saldo ON public.payments;
DROP FUNCTION IF EXISTS public.fn_trg_payments_no_excede_saldo();
DROP TRIGGER IF EXISTS trg_00_payments_vueltas ON public.payments;
DROP FUNCTION IF EXISTS public.fn_trg_payments_vueltas();

COMMENT ON COLUMN public.payments.change_amount IS NULL;

CREATE OR REPLACE FUNCTION public.fn_invoice_sales_paid(p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  select coalesce((
    select sum(p.amount + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end)
      from public.payments p, public.invoice_sales i
     where i.id = p_invoice_id
       and p.status = 'completed'
       and (
         (p.source = 'invoice_sales' and p.source_id = i.id::text)
         or (p.source = 'sale' and i.sale_id is not null and p.source_id = i.sale_id::text)
         or (p.source = 'account_receivable' and p.source_id in (
             select ar.id::text from public.accounts_receivable ar where ar.invoice_id = i.id
           ))
       )
  ), 0)
  -- Saldo a favor aplicado a la factura: dinero ya recibido del cliente.
  + coalesce((
    select sum(a.amount) from public.credit_note_applications a where a.invoice_id = p_invoice_id
  ), 0);
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    v_anticipo boolean := false;
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

    -- Anticipo de contraentrega (20261125120000, Contador 2026-11-24): no es cartera, es un
    -- pasivo con el cliente hasta facturar. Dr pasarela/banco/caja / Cr 2805.
    v_anticipo := NEW.source = 'web_order'
      AND COALESCE(NEW.processor_response->>'concepto', '') = 'anticipo_contraentrega';

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL AND NOT v_anticipo THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de ' || v_source_type);
        RETURN NEW;
    END IF;

    -- Cobro con tarjeta o pasarela: a la cuenta por cobrar del procesador (138020xx),
    -- que se salda con el abono. Contador 2026-11-21.
    v_money_account := CASE WHEN v_es_cobro
        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)
        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)
    END;

    IF v_anticipo THEN
        PERFORM public.fn_asegurar_cuenta_anticipos(NEW.organization_id);
        v_counterpart := '2805';
        v_memo := 'Anticipo de contraentrega recibido';
    ELSE
        v_counterpart := CASE WHEN v_es_cobro
            THEN v_rule.credit_account_code
            ELSE v_rule.debit_account_code
        END;
    END IF;

    IF v_money_account IS NULL THEN
        IF v_rule IS NULL THEN
            PERFORM fn_log_journal_failure(
                NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
                'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
                NULL, v_counterpart, NEW.amount,
                'no_rule', 'Sin cuenta de dinero para el anticipo ni regla de ' || v_source_type);
            RETURN NEW;
        END IF;
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

    IF NOT v_anticipo AND COALESCE(NEW.discount_amount, 0) > 0 AND v_rule.discount_account_code IS NOT NULL
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

-- ALTER TABLE public.payments DROP COLUMN IF EXISTS change_given;
-- ALTER TABLE public.payments DROP COLUMN IF EXISTS cash_received;
