-- ============================================================
-- F10 · fn_register_crm_payment — registro de pago en UNA transacción
-- ============================================================
-- Deuda A4 del tester de F10 (ronda 2): `registerCrmPayment` leía
-- `invoice_sales.balance`, validaba `amount <= balance`, insertaba en
-- `payments` y después actualizaba `invoice_sales` y `accounts_receivable`
-- en llamadas separadas desde Node. Dos pagos manuales simultáneos (dos
-- usuarios o un doble clic) leían el mismo saldo, ambos pasaban la
-- validación y el último UPDATE ganaba: la suma de pagos superaba el total
-- y el saldo quedaba negativo. Además `payments` no tiene CHECK de importe.
--
-- Esta función mueve el ciclo lectura→validación→escrituras a Postgres:
--   1. Bloquea la factura con `SELECT … FOR UPDATE` filtrando por `id` Y
--      `organization_id` (el segundo pago espera al primero y ve el saldo
--      ya descontado).
--   2. Valida importe (numérico, > 0, <= saldo) y moneda contra la factura.
--   3. Inserta en `payments` con las mismas columnas que escribía Node.
--      Una referencia `stripe:<event.id>` ya registrada (leída bajo el
--      bloqueo) o un choque con el índice único parcial
--      `uq_payments_org_stripe_reference` (dos webhooks simultáneos) devuelve
--      `duplicate: true` sin tocar factura ni cartera.
--   4. RELEE `invoice_sales` en la misma transacción: el saldo y el estado
--      los recalculan los triggers de la BD al insertar el pago (ver abajo)
--      y se devuelven los valores REALES. Solo si el trigger no actuó (el
--      saldo releído sigue igual al leído bajo el bloqueo: p. ej. estado
--      que `fn_recalc_invoice_balance_from_payments` ignora) se aplica el
--      UPDATE manual de respaldo (`paid` si el saldo queda <= 0, `partial`
--      si no).
--
-- LA CARTERA (`accounts_receivable`) NO SE ESCRIBE AQUÍ NUNCA: la mantienen
-- los triggers ya existentes, verificados en `pg_trigger` el 2026-09-16:
--   - `trg_recalc_invoice_balance_from_payments` (payments, AFTER
--     INSERT/UPDATE/DELETE → `fn_recalc_invoice_balance_from_payments`):
--     `invoice_sales.balance = GREATEST(total − fn_invoice_sales_paid(id), 0)`,
--     status `paid`/`partial` cuando hay pagos; no toca `draft/void/voided`.
--   - `tr_update_accounts_receivable_on_payment` (payments, AFTER INSERT →
--     `update_accounts_receivable_on_payment`): copia el saldo de la factura
--     a `accounts_receivable`.
--   - `tr_update_account_receivable` (invoice_sales, AFTER UPDATE de
--     balance/status → `create_account_receivable(id)`): sincroniza la
--     cartera con la factura, también tras el UPDATE de respaldo.
-- La prueba en seco del orquestador (todo revertido) demostró que restar el
-- importe a la cartera además de los triggers la descontaba DOS veces
-- (21.800 → 19.800 tras un pago de 1.000). El código Node anterior tenía el
-- mismo defecto.
--
-- Errores propios (ERRCODE P0001, MESSAGE distinguible, DETAIL en JSON con
-- saldo/estado/moneda para que Node reconstruya el mensaje de siempre):
--   invoice_not_found · invalid_amount · amount_exceeds_balance ·
--   currency_mismatch
--
-- SECURITY INVOKER: corre con los permisos y RLS del llamador (sesión del
-- usuario o service_role, igual que las escrituras que reemplaza). No se
-- eleva nada; aun así se revoca a PUBLIC y anon.
--
-- La comisión (`accrueCommission`) y la comprobación previa de idempotencia
-- por `reference` siguen en Node: no forman parte de la carrera del saldo.
-- Verificado por MCP antes de escribir (2026-09-16): `invoice_sales.id uuid`,
-- `payments.source_id text`, `payments.amount numeric`,
-- `payments.currency character(3)`, `accounts_receivable(invoice_id uuid,
-- balance numeric, status text)`, índice `uq_payments_org_stripe_reference`
-- ON payments (organization_id, reference) WHERE reference LIKE 'stripe:%',
-- y ninguna función llamada `fn_register_crm_payment` en `pg_proc`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_register_crm_payment(
  p_organization_id    integer,
  p_invoice_id         uuid,
  p_amount             numeric,
  p_currency           text,
  p_reference          text,
  p_method             text        DEFAULT NULL,
  p_payment_date       timestamptz DEFAULT NULL,
  p_processor_response jsonb       DEFAULT NULL,
  p_created_by         uuid        DEFAULT NULL,
  p_branch_id          integer     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice          public.invoice_sales%ROWTYPE;
  v_invoice_currency text;
  v_currency         text;
  v_balance          numeric;
  v_new_balance      numeric;
  v_new_status       text;
  v_payment_id       uuid;
  v_constraint       text;
BEGIN
  IF p_organization_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invoice_not_found',
      DETAIL = '{}';
  END IF;

  -- 1) Bloqueo de la factura: id Y organización. Un segundo pago concurrente
  --    espera aquí y, al continuar, lee el saldo ya descontado.
  SELECT * INTO v_invoice
    FROM public.invoice_sales
   WHERE id = p_invoice_id
     AND organization_id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invoice_not_found',
      DETAIL = '{}';
  END IF;

  v_balance := COALESCE(v_invoice.balance, 0);

  -- 1b) Replay de un webhook de Stripe (misma referencia stripe:<event.id>),
  --     leído BAJO el bloqueo de la factura: el primero ya cobró y el saldo
  --     puede ser 0; sin esta comprobación el segundo recibiría
  --     amount_exceeds_balance en vez de duplicate y el webhook registraría
  --     un rechazo falso. El índice único del INSERT queda como red de seguridad.
  IF p_reference LIKE 'stripe:%' AND EXISTS (
       SELECT 1 FROM public.payments
        WHERE organization_id = p_organization_id
          AND reference = p_reference
     ) THEN
    RETURN jsonb_build_object(
      'payment_id',     NULL,
      'new_balance',    v_balance,
      'invoice_status', v_invoice.status,
      'duplicate',      true
    );
  END IF;

  -- 2) Importe: numérico, finito y > 0.
  IF p_amount IS NULL OR p_amount = 'NaN'::numeric OR p_amount = 'Infinity'::numeric
     OR p_amount = '-Infinity'::numeric OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_amount',
      DETAIL = jsonb_build_object('amount', p_amount::text)::text;
  END IF;

  -- 3) Moneda del pago = moneda de la factura (si la factura la tiene).
  v_currency         := upper(trim(COALESCE(p_currency, '')));
  v_invoice_currency := upper(trim(COALESCE(v_invoice.currency::text, '')));
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'currency_mismatch',
      DETAIL = jsonb_build_object('payment_currency', v_currency, 'invoice_currency', v_invoice_currency)::text;
  END IF;
  IF v_invoice_currency <> '' AND v_invoice_currency <> v_currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'currency_mismatch',
      DETAIL = jsonb_build_object('payment_currency', v_currency, 'invoice_currency', v_invoice_currency)::text;
  END IF;

  -- 4) Importe <= saldo, con el saldo leído BAJO el bloqueo.
  IF p_amount > v_balance THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'amount_exceeds_balance',
      DETAIL = jsonb_build_object('amount', p_amount, 'balance', v_balance, 'status', v_invoice.status)::text;
  END IF;

  -- 5) Inserción del pago. El índice único parcial corta la carrera de dos
  --    webhooks con la misma referencia stripe:<event.id>; cualquier otra
  --    unique_violation (p. ej. la PK) se propaga tal cual.
  BEGIN
    INSERT INTO public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency,
      reference, processor_response, status, created_by, payment_date,
      discount_amount, change_amount
    ) VALUES (
      p_organization_id, p_branch_id, 'invoice_sales', p_invoice_id::text,
      p_method, p_amount, v_currency, p_reference, p_processor_response,
      'completed', p_created_by, COALESCE(p_payment_date, now()), 0, 0
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_payments_org_stripe_reference' THEN
      RETURN jsonb_build_object(
        'payment_id',     NULL,
        'new_balance',    v_balance,
        'invoice_status', v_invoice.status,
        'duplicate',      true
      );
    END IF;
    RAISE;
  END;

  -- 6) Releer la factura en la misma transacción: los triggers del INSERT ya
  --    recalcularon saldo y estado (y sincronizaron la cartera).
  SELECT balance, status INTO v_new_balance, v_new_status
    FROM public.invoice_sales
   WHERE id = p_invoice_id
     AND organization_id = p_organization_id;

  -- 6b) Respaldo: si el trigger no actuó (saldo releído igual al leído bajo
  --     el bloqueo), se aplica la regla a mano. El trigger de invoice_sales
  --     (`tr_update_account_receivable`) sincroniza la cartera por sí solo.
  IF v_new_balance IS NOT DISTINCT FROM v_invoice.balance THEN
    v_new_balance := v_balance - p_amount;
    v_new_status  := CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END;
    UPDATE public.invoice_sales
       SET balance    = v_new_balance,
           status     = v_new_status,
           updated_at = now()
     WHERE id = p_invoice_id
       AND organization_id = p_organization_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id',     v_payment_id,
    'new_balance',    v_new_balance,
    'invoice_status', v_new_status,
    'duplicate',      false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_register_crm_payment(integer, uuid, numeric, text, text, text, timestamptz, jsonb, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_crm_payment(integer, uuid, numeric, text, text, text, timestamptz, jsonb, uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_register_crm_payment(integer, uuid, numeric, text, text, text, timestamptz, jsonb, uuid, integer) IS
  'F10 (deuda A4): registra un pago de factura CRM en una transacción: bloquea la factura (id + organización), valida importe/moneda/saldo, inserta en payments y relee el saldo/estado que recalculan los triggers (respaldo manual si no actúan). Nunca escribe accounts_receivable: la sincronizan los triggers. Devuelve {payment_id,new_balance,invoice_status,duplicate}. Errores P0001: invoice_not_found, invalid_amount, amount_exceeds_balance, currency_mismatch.';
