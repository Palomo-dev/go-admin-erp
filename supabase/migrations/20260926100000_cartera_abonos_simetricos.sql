-- Cartera · abonos simétricos (P1.1 del plan de facturas de venta y CxC)
--
-- Problema (medido 2026-09-24): anular, corregir o borrar un abono hecho desde
-- cuentas por cobrar (payments.source = 'account_receivable', 63 pagos reales)
-- no devolvía el saldo:
--   * fn_recalc_invoice_balance_from_payments ignoraba esa fuente;
--   * update_accounts_receivable_on_payment solo corría en INSERT y RESTABA.
-- Además, si se anulaban TODOS los pagos de una factura, el recálculo dejaba el
-- saldo en el total pero el estado en 'paid'/'partial'.
--
-- Qué cambia:
--   1. fn_invoice_sales_paid cuenta el descuento de pronto pago de los abonos de
--      cartera (antes lo restaba el disparador de cartera). 0 filas afectadas hoy.
--   2. fn_recalc_invoice_balance_from_payments recalcula la factura también para
--      'account_receivable' (vía accounts_receivable.invoice_id), y sin pagos
--      vuelve a 'issued'. La cartera sigue a la factura por tr_update_account_receivable.
--   3. update_accounts_receivable_on_payment corre en INSERT, UPDATE y DELETE:
--      - cartera con factura: no escribe saldos (los pone el recálculo de la factura);
--      - cartera sin factura (22 cuentas, 4 abiertas): ajusta por diferencia
--        (lo que cuenta ahora − lo que contaba antes), así anular devuelve el saldo.
--
-- Dry-run (transacción deshecha, 2026-09-24): con la función nueva, los 63 pagos
-- de cartera dan exactamente el saldo vigente de sus facturas y carteras (0
-- diferencias). Ver src/__tests__/finanzas/ventas/sqlCaracterizacion.test.ts (L1).
--
-- Seguridad (mismo commit, anotado en el plan §1.4):
--   4. REVOKE de anon en assistant_void_sales_invoice (SECURITY INVOKER; RLS ya lo
--      frenaba, pero anon no tiene por qué ejecutarla).
--   5. Se retira payments_delete_policy: ningún miembro borra pagos. Un pago se
--      ANULA con fn_anular_pago (status 'void' + contra-asiento). 0 usos de
--      .from('payments').delete() en los repos.

-- 1 ────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_invoice_sales_paid(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
as $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  SELECT COALESCE((
    SELECT SUM(p.amount + CASE WHEN p.source = 'account_receivable' THEN COALESCE(p.discount_amount, 0) ELSE 0 END)
    FROM payments p, invoice_sales i
    WHERE i.id = p_invoice_id
      AND p.status = 'completed'
      AND (
        (p.source = 'invoice_sales' AND p.source_id = i.id::text)
        OR (p.source = 'sale' AND i.sale_id IS NOT NULL AND p.source_id = i.sale_id::text)
        OR (p.source = 'account_receivable' AND p.source_id IN (
            SELECT ar.id::text FROM accounts_receivable ar WHERE ar.invoice_id = i.id
          ))
      )
  ), 0);
$function$;

-- 2 ────────────────────────────────────────────────────────────────────────────
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

-- 3 ────────────────────────────────────────────────────────────────────────────
create or replace function public.update_accounts_receivable_on_payment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  invoice_record RECORD;
  account_record RECORD;
  source_id_uuid UUID;
  r RECORD;
  v_new_balance numeric;
  v_new_status text;
BEGIN
  -- Pago a factura (comportamiento original, solo al insertar): asegura que la
  -- factura tenga su cartera. El saldo lo pone el recálculo de la factura.
  IF TG_OP = 'INSERT' AND NEW.source = 'invoice_sales' AND NEW.source_id IS NOT NULL THEN
    BEGIN
      source_id_uuid := NEW.source_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error al convertir source_id a UUID: %', SQLERRM;
      RETURN NULL;
    END;

    SELECT * INTO invoice_record FROM invoice_sales WHERE id = source_id_uuid;

    IF FOUND THEN
      IF NOT EXISTS (SELECT 1 FROM accounts_receivable WHERE invoice_id = invoice_record.id) THEN
        PERFORM create_account_receivable(invoice_record.id::TEXT);
      ELSE
        UPDATE accounts_receivable
        SET balance = invoice_record.balance,
            updated_at = NOW()
        WHERE invoice_id = invoice_record.id;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  -- Abonos a cartera: por diferencia entre lo que cuenta ahora y lo que contaba
  -- antes (INSERT, UPDATE de estado/monto/cuenta, DELETE).
  FOR r IN
    SELECT sid, SUM(delta) AS delta, SUM(delta_desc) AS delta_desc
    FROM (
      SELECT NEW.source_id AS sid,
             CASE WHEN NEW.status = 'completed' THEN NEW.amount + COALESCE(NEW.discount_amount, 0) ELSE 0 END AS delta,
             CASE WHEN NEW.status = 'completed' THEN COALESCE(NEW.discount_amount, 0) ELSE 0 END AS delta_desc
       WHERE TG_OP <> 'DELETE' AND NEW.source = 'account_receivable'
      UNION ALL
      SELECT OLD.source_id,
             CASE WHEN OLD.status = 'completed' THEN -(OLD.amount + COALESCE(OLD.discount_amount, 0)) ELSE 0 END,
             CASE WHEN OLD.status = 'completed' THEN -COALESCE(OLD.discount_amount, 0) ELSE 0 END
       WHERE TG_OP <> 'INSERT' AND OLD.source = 'account_receivable'
    ) t
    WHERE sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY sid
  LOOP
    CONTINUE WHEN COALESCE(r.delta, 0) = 0 AND COALESCE(r.delta_desc, 0) = 0;

    SELECT * INTO account_record FROM accounts_receivable WHERE id = r.sid::uuid FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    IF account_record.invoice_id IS NOT NULL THEN
      -- Con factura: el saldo y el estado los recalcula
      -- fn_recalc_invoice_balance_from_payments y la cartera sigue a la factura.
      IF COALESCE(r.delta_desc, 0) <> 0 THEN
        UPDATE accounts_receivable
        SET discount_amount = GREATEST(COALESCE(discount_amount, 0) + r.delta_desc, 0),
            updated_at = NOW()
        WHERE id = account_record.id;
      END IF;
      CONTINUE;
    END IF;

    -- Sin factura: la cartera es la única fuente del saldo.
    v_new_balance := GREATEST(COALESCE(account_record.balance, 0) - r.delta, 0);
    IF r.delta < 0 THEN
      v_new_balance := LEAST(v_new_balance, GREATEST(COALESCE(account_record.amount, 0), 0));
    END IF;

    IF v_new_balance = 0 THEN
      v_new_status := 'paid';
    ELSIF v_new_balance < COALESCE(account_record.amount, 0) THEN
      v_new_status := 'partial';
    ELSE
      v_new_status := 'current';  -- calculate_days_overdue la pasa a 'overdue' si vence
    END IF;

    UPDATE accounts_receivable
    SET balance = v_new_balance,
        status = v_new_status,
        discount_amount = GREATEST(COALESCE(discount_amount, 0) + COALESCE(r.delta_desc, 0), 0),
        updated_at = NOW()
    WHERE id = account_record.id;
  END LOOP;

  RETURN NULL;
END;
$function$;

drop trigger if exists tr_update_accounts_receivable_on_payment on public.payments;
create trigger tr_update_accounts_receivable_on_payment
  after insert or update or delete on public.payments
  for each row execute function public.update_accounts_receivable_on_payment();

-- 4 ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) from anon, public;

-- 5 ────────────────────────────────────────────────────────────────────────────
drop policy if exists payments_delete_policy on public.payments;
