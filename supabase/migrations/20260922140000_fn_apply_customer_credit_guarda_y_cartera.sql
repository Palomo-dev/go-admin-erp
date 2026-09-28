-- fn_apply_customer_credit: guarda de pertenencia, search_path fijo, sin anon,
-- y se deja de restar dos veces en la cartera.
--
-- Tres problemas en la versión anterior (auditoría de Finanzas, 2026-09-22):
--
-- 1. SECURITY DEFINER **sin guarda de pertenencia** y con EXECUTE concedido a
--    `anon` y a `PUBLIC`: cualquiera podía aplicar el saldo a favor de una
--    organización a una factura de esa misma organización sin ser miembro.
--    Ahora se afirma la pertenencia con `organization_members` (fail-closed:
--    con `anon`, `auth.uid()` es NULL y el EXISTS falla). Con `service_role`
--    —sin `sub` en el JWT— el actor es `p_created_by`, que igualmente debe ser
--    miembro activo. Mismo criterio que `pos_checkout_v1`.
--
-- 2. Sin `set search_path`: una función SECURITY DEFINER debe fijarlo.
--
-- 3. **La cartera se descontaba dos veces.** El UPDATE de
--    `invoice_sales.balance` dispara `tr_update_account_receivable` →
--    `create_account_receivable(id)`, que **asigna** a
--    `accounts_receivable.balance` el saldo nuevo de la factura. La función
--    hacía además un UPDATE manual restando otra vez el importe, leyendo un
--    saldo que el disparador ya había actualizado. Con una factura de 100 y un
--    saldo a favor de 30, la factura quedaba en 70 y la cartera en 40. Se
--    elimina ese UPDATE manual: el disparador ya deja la cartera correcta.
--
-- No cambia la firma ni el valor de retorno. No toca datos existentes; las
-- carteras ya descuadradas por el error 3 hay que corregirlas aparte (ver
-- docs/design/AUDITORIA-CONTROLES-FINANZAS.md).
-- Reversión: supabase/rollbacks/20260922140000_fn_apply_customer_credit_guarda_y_cartera_rollback.sql

create or replace function public.fn_apply_customer_credit(
  p_credit_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_created_by uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  v_credit public.credit_notes%ROWTYPE;
  v_inv public.invoice_sales%ROWTYPE;
  v_app_id uuid;
  v_entry integer;
  v_new_inv_balance numeric;
  v_new_status text;
  v_actor uuid;
BEGIN
  SELECT * INTO v_credit FROM public.credit_notes WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo a favor no encontrado'; END IF;
  IF v_credit.status <> 'active' OR v_credit.balance <= 0 THEN
    RAISE EXCEPTION 'El saldo a favor no está disponible';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  IF p_amount > v_credit.balance THEN RAISE EXCEPTION 'El monto excede el saldo disponible'; END IF;

  -- Guarda de pertenencia sobre la organización del saldo a favor.
  v_actor := auth.uid();
  IF v_actor IS NULL AND auth.role() = 'service_role' THEN
    v_actor := p_created_by;
  END IF;
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = v_actor
      AND om.organization_id = v_credit.organization_id
      AND om.is_active
  ) THEN
    RAISE EXCEPTION 'No perteneces a esta organización' USING errcode = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.invoice_sales WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_inv.organization_id <> v_credit.organization_id THEN
    RAISE EXCEPTION 'La factura pertenece a otra organización';
  END IF;
  IF p_amount > v_inv.balance THEN RAISE EXCEPTION 'El monto excede el saldo de la factura'; END IF;

  INSERT INTO public.credit_note_applications(organization_id, credit_note_id, invoice_id, amount, created_by)
  VALUES (v_credit.organization_id, p_credit_id, p_invoice_id, p_amount, p_created_by)
  RETURNING id INTO v_app_id;

  UPDATE public.credit_notes
  SET balance = balance - p_amount,
      status = CASE WHEN balance - p_amount <= 0 THEN 'used' ELSE 'active' END,
      updated_at = now()
  WHERE id = p_credit_id;

  v_new_inv_balance := GREATEST(0, v_inv.balance - p_amount);
  v_new_status := CASE
    WHEN v_new_inv_balance <= 0 THEN 'paid'
    WHEN v_new_inv_balance < v_inv.total THEN 'partial'
    ELSE v_inv.status END;

  -- Este UPDATE dispara tr_update_account_receivable, que deja
  -- accounts_receivable.balance = invoice_sales.balance. No se toca la cartera
  -- a mano: hacerlo restaba el importe por segunda vez.
  UPDATE public.invoice_sales
  SET balance = v_new_inv_balance, status = v_new_status, updated_at = now()
  WHERE id = p_invoice_id;

  v_entry := fn_create_journal_entry(
    p_organization_id := v_credit.organization_id,
    p_branch_id := v_inv.branch_id,
    p_entry_date := now(),
    p_memo := 'Aplicación saldo a favor a ' || COALESCE(v_inv.number, v_inv.id::text),
    p_source := 'customer_credit',
    p_source_id := v_app_id::text,
    p_debit_account := '2805',
    p_credit_account := '1305',
    p_amount := p_amount,
    p_tax_account := NULL,
    p_tax_amount := 0
  );

  RETURN v_app_id;
END;
$function$;

comment on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) is
  'Aplica un saldo a favor a una factura de venta. Guarda de pertenencia por organization_members; la cartera la actualiza el disparador de invoice_sales, no esta función.';

revoke all on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) to authenticated, service_role;
