-- Rollback de 20260926100000_compras_f1_saldos_cxp_retenciones.sql
--
-- Orden: revertir antes 20260926130000, 20260926120000, 20260926115000 (no-op) y
-- 20260926110000; estas funciones las usan las de esas migraciones.
--
-- ADVERTENCIA DE DATOS: borra la tabla `invoice_purchase_withholdings` (las
-- retenciones registradas se pierden) y la columna
-- `invoice_purchase.stock_received_at` (se pierde cuándo entró cada compra al
-- kardex; los movimientos siguen en `stock_movements`). Si hace falta
-- conservarlas, copiarlas antes.
--
-- `fn_recalc_invoice_balance_from_payments` vuelve a la versión que estaba viva
-- justo antes (la de `cartera_abonos_simetricos`, P1.1 de ventas): rama de venta
-- intacta, rama de compra con `total − pagos` sin descuento ni retenciones.

drop trigger if exists trg_cxp_desde_factura on public.invoice_purchase;
drop function if exists public.fn_trg_cxp_desde_factura();
drop function if exists public.fn_cxp_asegurar_de_factura(uuid);

CREATE OR REPLACE FUNCTION public.fn_recalc_accounts_payable_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    r RECORD;
    v_ap RECORD;
    v_pagado numeric;
    v_saldo numeric;
    v_estado text;
BEGIN
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
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

    IF r.src IN ('invoice_purchase', 'account_payable') THEN
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

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
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
    ELSIF v_status IN ('paid', 'partial') THEN
      -- Se anularon todos los pagos: la factura vuelve a estar solo emitida.
      v_new_status := 'issued';
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

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sales_id uuid;
  v_purchase_id uuid;
  v_subtotal numeric;
  v_total numeric;
  v_tax numeric;
  v_paid numeric;
  v_new_balance numeric;
  v_status text;
  v_tax_included boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sales_id := COALESCE(OLD.invoice_sales_id, CASE WHEN OLD.invoice_type = 'sale' THEN OLD.invoice_id END);
    v_purchase_id := COALESCE(OLD.invoice_purchase_id, CASE WHEN OLD.invoice_type = 'purchase' THEN OLD.invoice_id END);
  ELSE
    v_sales_id := COALESCE(NEW.invoice_sales_id, CASE WHEN NEW.invoice_type = 'sale' THEN NEW.invoice_id END);
    -- F-44: era OLD.invoice_id; en un INSERT OLD es NULL y la compra no se recalculaba.
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN NEW.invoice_id END);
  END IF;

  IF v_sales_id IS NOT NULL THEN
    SELECT tax_included INTO v_tax_included FROM invoice_sales WHERE id = v_sales_id;

    IF v_tax_included THEN
      -- Impuesto incluido: total_line es el bruto. La base de cada línea se
      -- redondea a centavos y el impuesto sale por resta (F-51: una sola regla,
      -- la misma que splitGrossLine en taxResolver.ts).
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tax_rate > 0 THEN ROUND((qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100), 2)
            ELSE (qty * unit_price - COALESCE(discount_amount, 0))
          END
        ), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    ELSE
      SELECT
        COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    END IF;

    v_tax := CASE WHEN v_total < 0 THEN LEAST(v_total - v_subtotal, 0) ELSE GREATEST(v_total - v_subtotal, 0) END;

    v_paid := fn_invoice_sales_paid(v_sales_id);

    v_new_balance := GREATEST(v_total - v_paid, 0);

    SELECT status INTO v_status FROM invoice_sales WHERE id = v_sales_id;

    IF v_status IN ('void', 'voided') THEN
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
    ELSE
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          balance = v_new_balance,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax
          OR balance IS DISTINCT FROM v_new_balance);
    END IF;
  END IF;

  IF v_purchase_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
      COALESCE(SUM(total_line), 0)
    INTO v_subtotal, v_total
    FROM invoice_items
    WHERE invoice_purchase_id = v_purchase_id
       OR (invoice_id = v_purchase_id AND invoice_type = 'purchase');

    v_tax := GREATEST(v_total - v_subtotal, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments
    WHERE source = 'invoice_purchase' AND source_id = v_purchase_id::text AND status = 'completed';

    v_new_balance := GREATEST(v_total - v_paid, 0);

    UPDATE invoice_purchase
    SET subtotal = v_subtotal,
        tax_total = v_tax,
        total = v_total,
        balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_purchase_id
      AND (total IS DISTINCT FROM v_total
        OR subtotal IS DISTINCT FROM v_subtotal
        OR tax_total IS DISTINCT FROM v_tax
        OR balance IS DISTINCT FROM v_new_balance);
  END IF;

  RETURN NULL;
END;
$function$;

drop function if exists public.fn_cxp_recalcular(uuid);
drop function if exists public.fn_invoice_purchase_neto(uuid);
drop function if exists public.fn_invoice_purchase_paid(uuid);

drop index if exists public.ux_accounts_payable_invoice_id;

drop table if exists public.invoice_purchase_withholdings;
alter table public.invoice_purchase drop column if exists stock_received_at;
