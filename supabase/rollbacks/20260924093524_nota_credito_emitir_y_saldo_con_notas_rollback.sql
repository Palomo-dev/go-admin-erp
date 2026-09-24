-- Rollback de 20260924093524_nota_credito_emitir_y_saldo_con_notas.sql
--
-- ADVERTENCIA: no revierte datos. Las notas crédito emitidas siguen (son
-- documentos reales con asiento); los saldos de las facturas con notas se
-- quedan como los dejó la regla nueva hasta el siguiente recálculo, que con
-- la regla vieja volverá a ignorar las notas (el defecto que esta migración
-- corrige). Se pierde el vínculo línea a línea (credited_item_id) y la clave
-- de idempotencia de las notas.

drop function if exists public.fn_nota_credito_emitir(uuid, text, jsonb, numeric, text, text, boolean, text, text, integer, text);
drop function if exists public.fn_nota_credito_lineas_disponibles(uuid);

drop trigger if exists trg_nota_credito_recalcula_factura on public.invoice_sales;
drop trigger if exists trg_nota_credito_borrada_recalcula_factura on public.invoice_sales;
drop function if exists public.fn_trg_nota_credito_recalcula_factura();

-- Versiones anteriores (2026-09-24, antes de esta migración).
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

      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
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

create or replace function public.fn_recalc_invoice_totals()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN NEW.invoice_id END);
  END IF;

  IF v_sales_id IS NOT NULL THEN
    SELECT tax_included INTO v_tax_included FROM invoice_sales WHERE id = v_sales_id;

    IF v_tax_included THEN
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
    SELECT tax_included, status INTO v_tax_included, v_status FROM invoice_purchase WHERE id = v_purchase_id;

    SELECT
      COALESCE(SUM(
        CASE
          WHEN COALESCE(v_tax_included, false) AND tax_rate > 0
            THEN ROUND((qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100), 2)
          ELSE (qty * unit_price - COALESCE(discount_amount, 0))
        END
      ), 0),
      COALESCE(SUM(total_line), 0)
    INTO v_subtotal, v_total
    FROM invoice_items
    WHERE invoice_purchase_id = v_purchase_id
       OR (invoice_id = v_purchase_id AND invoice_type = 'purchase');

    v_tax := GREATEST(v_total - v_subtotal, 0);

    v_new_balance := GREATEST(
      v_total
        - COALESCE((SELECT SUM(w.amount) FROM invoice_purchase_withholdings w WHERE w.invoice_id = v_purchase_id), 0)
        - fn_invoice_purchase_paid(v_purchase_id),
      0);

    IF v_status IN ('void', 'voided') THEN
      UPDATE invoice_purchase
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          updated_at = NOW()
      WHERE id = v_purchase_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
    ELSE
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
  END IF;

  RETURN NULL;
END;
$function$;

drop function if exists public.fn_factura_venta_recalcular_saldo(uuid);
drop function if exists public.fn_invoice_sales_acreditado(uuid);

drop index if exists public.idx_invoice_sales_related_invoice;
drop index if exists public.uq_invoice_sales_idempotency;
alter table public.invoice_sales drop column if exists idempotency_key;
drop index if exists public.idx_invoice_items_credited_item;
alter table public.invoice_items drop column if exists credited_item_id;
