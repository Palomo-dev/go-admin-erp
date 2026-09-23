-- Bloque 1 contable · migración 4
--
-- El asiento del pago era la TERCERA contabilización del mismo hecho: la venta
-- ya devengó el ingreso y la cuenta por cobrar, y el cobro volvía a leer una
-- regla genérica que en muchas organizaciones vuelve a tocar ingresos
-- (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §E.2).
--
-- La decisión 1 del dueño fija la norma: **el pago genera el asiento de COBRO**
-- —entra dinero donde realmente entró y baja la cuenta por cobrar—, y **aquí no
-- se toca ingresos**. Esta migración lo implementa:
--
-- 1. La cuenta del dinero sale del **sitio donde está el dinero**: la caja de la
--    sesión abierta de esa sucursal, o la cuenta bancaria de la organización,
--    vía el `account_code` que añade la migración anterior. Mientras nadie lo
--    haya rellenado se usa la cuenta por defecto (`1105` caja, `1110` bancos) y,
--    si tampoco existe en el plan, la cuenta de la regla: así ninguna
--    organización pierde el asiento que hoy tiene.
-- 2. La contrapartida es la **cuenta por cobrar** (o por pagar) de la regla.
--    Nunca una cuenta de ingreso: si la regla apunta a una cuenta `4x`, el
--    asiento se rechaza y queda anotado en `journal_entry_failures`.
-- 3. `fact_key = 'settlement:payment:{id}'`.
-- 4. Se amplía a los `source` que hoy se ignoran: **64 pagos con `source='sale'`
--    y 762 de `web_order`** no generaban ningún asiento (§E.1).
-- 5. Solo se contabilizan los pagos **completados**. Verificado: de 3.332 pagos,
--    **593 están en `failed`** y hoy generan asiento igual. Un cobro que no
--    ocurrió no es un cobro.
--
-- El descuento por pronto pago se mantiene, ahora dentro del mismo asiento:
-- concedido va al débito junto al dinero, obtenido va al crédito. Se usa la
-- tercera línea de `fn_create_journal_entry` (la de impuesto), que tiene
-- exactamente esa forma, en vez de `fn_create_journal_entry_with_discount`, que
-- no sabe de claves del hecho. Si la cuenta de descuento no está en el plan
-- contable, el descuento se omite y el cobro se contabiliza igual.

-- Resuelve la cuenta contable del sitio por donde entró o salió el dinero.
create or replace function public.fn_money_account_code(
  p_organization_id integer,
  p_branch_id integer,
  p_method text
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_code text;
    v_default text;
BEGIN
    IF COALESCE(p_method, 'cash') = 'cash' THEN
        -- La caja concreta: sesión abierta de esa sucursal con cuenta asignada.
        SELECT cs.account_code INTO v_code
        FROM cash_sessions cs
        WHERE cs.organization_id = p_organization_id
          AND cs.status = 'open'
          AND cs.account_code IS NOT NULL
          AND (p_branch_id IS NULL OR cs.branch_id = p_branch_id)
        ORDER BY cs.opened_at DESC
        LIMIT 1;

        v_default := '1105';
    ELSE
        -- La cuenta bancaria concreta. Mientras `payments` no lleve
        -- `bank_account_id`, solo se puede resolver cuando la organización
        -- tiene una única cuenta bancaria con cuenta contable asignada.
        SELECT ba.account_code INTO v_code
        FROM bank_accounts ba
        WHERE ba.organization_id = p_organization_id
          AND ba.is_active = true
          AND ba.account_code IS NOT NULL
        LIMIT 1;

        IF v_code IS NOT NULL AND (
            SELECT count(*) FROM bank_accounts ba2
            WHERE ba2.organization_id = p_organization_id
              AND ba2.is_active = true
              AND ba2.account_code IS NOT NULL
        ) > 1 THEN
            v_code := NULL;  -- ambiguo: no se adivina
        END IF;

        v_default := '1110';
    END IF;

    IF v_code IS NULL THEN
        SELECT account_code INTO v_code
        FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = v_default
        LIMIT 1;
    END IF;

    RETURN v_code;
END;
$function$;

revoke all on function public.fn_money_account_code(integer, integer, text) from public, anon;

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
    -- Un cobro que falló no es un cobro.
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
        -- PMS, parking, membresías: los contabilizan sus propios disparadores.
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

    -- La contrapartida es la cartera, nunca el ingreso: en el cobro la venta ya
    -- está devengada. En el pago a proveedor, la cuenta por pagar.
    v_counterpart := CASE WHEN v_es_cobro
        THEN v_rule.credit_account_code
        ELSE v_rule.debit_account_code
    END;

    IF v_money_account IS NULL THEN
        -- Sin cuenta del dinero resoluble se conserva la de la regla, para no
        -- perder el asiento que la organización tiene hoy.
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

    -- Descuento por pronto pago, solo si su cuenta existe en el plan.
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
        -- Débito dinero (+ débito descuento concedido) contra crédito cartera.
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
        -- Débito cuenta por pagar contra crédito dinero (+ crédito descuento obtenido).
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

-- El disparador pasa a escuchar también el cambio de estado: un pago que nace
-- pendiente y luego se completa tiene que contabilizarse cuando se completa.
-- Repetirlo es inocuo: la clave del hecho impide el segundo asiento.
drop trigger if exists trg_auto_journal_payment on public.payments;

create trigger trg_auto_journal_payment
  after insert or update of status on public.payments
  for each row
  execute function public.fn_auto_journal_payment();
