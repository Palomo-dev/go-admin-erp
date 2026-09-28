-- Cobrar tiene automatismos; pagar no. Y elegir cuenta bancaria al pagar rompía.
--
-- Dos huecos que pidió cerrar el dueño, verificados uno por uno:
--
-- **1. `payments.bank_account_id` no existía.** Pero el código ya la escribía:
-- `cuentas-por-pagar/id/service.ts` añade `paymentData.bank_account_id` cuando
-- el formulario trae cuenta bancaria. Insertar una columna que no está en la
-- tabla hace fallar la petición entera, así que **elegir la cuenta bancaria al
-- pagar tumbaba el pago**. Se añade la columna, con FK a `bank_accounts`.
--
-- Con ella, el asiento del cobro o del pago deja de adivinar por dónde entró o
-- salió el dinero: `fn_auto_journal_payment` usa la cuenta contable de esa
-- cuenta bancaria concreta, que es lo que pedía la decisión 1 regla 3
-- (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md).
--
-- **2. Un pago no movía la cuenta por pagar.** `payments` tenía
-- `tr_update_accounts_receivable_on_payment` para la cartera de clientes y
-- **nada** para la de proveedores: el saldo lo actualizaba cada pantalla a
-- mano, con tres implementaciones distintas y una de ellas filtrando por una
-- columna inexistente (`invoice_purchase_id`; la columna es `invoice_id`), con
-- lo que editar una factura de compra nunca actualizaba su cuenta por pagar.
--
-- El trigger nuevo **recalcula** el saldo desde la suma de los pagos
-- completados, no lo decrementa. La diferencia importa: un decremento aplicado
-- dos veces resta dos veces —es el defecto que ya apareció en
-- `fn_apply_customer_credit`—, mientras que un recálculo da el mismo resultado
-- se ejecute las veces que se ejecute. Por eso, además, el código de la
-- aplicación deja de tocar `accounts_payable` en el mismo commit: con el
-- trigger puesto, cada actualización manual sería una resta de más.
--
-- Se contempla el pago referido a la factura (`source='invoice_purchase'`) y el
-- referido directamente a la cuenta por pagar (`source='account_payable'`): los
-- dos caminos existen y los dos tienen que mover el mismo saldo.
--
-- Y `fn_recalc_invoice_balance_from_payments` aprende el segundo camino: hasta
-- ahora, pagar contra la cuenta por pagar dejaba la factura de compra con su
-- saldo antiguo.

alter table public.payments
  add column if not exists bank_account_id integer references public.bank_accounts(id);

comment on column public.payments.bank_account_id is
  'Cuenta bancaria por la que entró o salió el dinero. NULL en efectivo o cuando no se eligió. Es la que da la cuenta contable del asiento.';

create index if not exists idx_payments_bank_account
  on public.payments (bank_account_id) where bank_account_id is not null;

-- La cuenta del dinero, ahora que el pago puede decir por qué banco fue.
create or replace function public.fn_money_account_code_pago(
  p_organization_id integer,
  p_branch_id integer,
  p_method text,
  p_bank_account_id integer
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_code text;
BEGIN
    IF p_bank_account_id IS NOT NULL THEN
        SELECT account_code INTO v_code
        FROM bank_accounts
        WHERE id = p_bank_account_id AND organization_id = p_organization_id;

        IF v_code IS NOT NULL THEN
            RETURN v_code;
        END IF;
    END IF;

    RETURN fn_money_account_code(p_organization_id, p_branch_id, p_method);
END;
$function$;

revoke all on function public.fn_money_account_code_pago(integer, integer, text, integer)
  from public, anon;

-- Recalcula la cuenta por pagar desde los pagos completados.
create or replace function public.fn_recalc_accounts_payable_from_payments()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    r RECORD;
    v_ap RECORD;
    v_pagado numeric;
    v_saldo numeric;
    v_estado text;
BEGIN
    -- Se recalcula el destino nuevo y el anterior: un UPDATE puede mover el
    -- pago de una cuenta a otra y las dos quedarían desactualizadas.
    FOR r IN
        SELECT DISTINCT src, sid
        FROM (VALUES
          (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
           CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
          (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
           CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
        ) AS t(src, sid)
        WHERE src IN ('invoice_purchase', 'account_payable')
          AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    LOOP
        IF r.src = 'invoice_purchase' THEN
            SELECT * INTO v_ap FROM accounts_payable WHERE invoice_id = r.sid::uuid LIMIT 1;
        ELSE
            SELECT * INTO v_ap FROM accounts_payable WHERE id = r.sid::uuid LIMIT 1;
        END IF;

        CONTINUE WHEN v_ap.id IS NULL;

        SELECT COALESCE(SUM(p.amount + COALESCE(p.discount_amount, 0)), 0)
        INTO v_pagado
        FROM payments p
        WHERE p.status = 'completed'
          AND (
            (p.source = 'account_payable' AND p.source_id = v_ap.id::text)
            OR (v_ap.invoice_id IS NOT NULL
                AND p.source = 'invoice_purchase'
                AND p.source_id = v_ap.invoice_id::text)
          );

        v_saldo := GREATEST(COALESCE(v_ap.amount, 0) - v_pagado, 0);

        -- Sin pagos no se toca el estado: una cuenta marcada a mano es una
        -- decisión del operador que no corresponde revertir aquí.
        v_estado := v_ap.status;
        IF v_pagado > 0 THEN
            v_estado := CASE WHEN v_saldo <= 0 THEN 'paid' ELSE 'partial' END;
        END IF;

        UPDATE accounts_payable
        SET balance = v_saldo,
            status = v_estado,
            updated_at = now()
        WHERE id = v_ap.id
          AND (balance IS DISTINCT FROM v_saldo OR status IS DISTINCT FROM v_estado);
    END LOOP;

    RETURN NULL;
END;
$function$;

drop trigger if exists tr_update_accounts_payable_on_payment on public.payments;

create trigger tr_update_accounts_payable_on_payment
  after insert or update or delete on public.payments
  for each row
  execute function public.fn_recalc_accounts_payable_from_payments();

-- El asiento del pago usa la cuenta bancaria elegida cuando la hay.
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

    v_money_account := fn_money_account_code_pago(
        NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id);

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

-- Pagar contra la cuenta por pagar también tiene que mover la factura.
create or replace function public.fn_recalc_invoice_balance_from_payments()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      -- Un pago puede venir referido a la factura de compra o a la cuenta por
      -- pagar; en los dos casos el saldo de la factura tiene que moverse.
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
      FROM payments p
      WHERE p.status = 'completed'
        AND (
          (p.source = 'invoice_purchase' AND p.source_id = v_invoice_id::text)
          OR (p.source = 'account_payable' AND p.source_id IN (
                SELECT ap.id::text FROM accounts_payable ap WHERE ap.invoice_id = v_invoice_id))
        );

      v_balance := GREATEST(v_total - v_paid, 0);

      -- Solo el balance: el status de compras mezcla la recepción de inventario
      -- ('received') con el estado de pago, y derivarlo aquí pisaría información.
      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    -- Facturas de venta: el pago puede venir referenciado a la factura (POS) o
    -- a la venta (mesas), así que se resuelve el id de factura en ambos casos.
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
