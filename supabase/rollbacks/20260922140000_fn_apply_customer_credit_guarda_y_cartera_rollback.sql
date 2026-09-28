-- Rollback de 20260922140000_fn_apply_customer_credit_guarda_y_cartera.sql
--
-- Restaura la definición anterior de fn_apply_customer_credit: sin guarda de
-- pertenencia, sin `set search_path`, con el UPDATE manual de
-- accounts_receivable (que resta el importe por segunda vez) y con EXECUTE
-- para anon/PUBLIC. Solo para volver atrás en caso de incidencia: la versión
-- que restaura tiene los tres defectos documentados en la migración.
-- No toca datos.

create or replace function public.fn_apply_customer_credit(
  p_credit_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_created_by uuid default null::uuid
)
returns uuid
language plpgsql
security definer
as $function$
DECLARE
  v_credit public.credit_notes%ROWTYPE;
  v_inv public.invoice_sales%ROWTYPE;
  v_app_id uuid;
  v_entry integer;
  v_new_inv_balance numeric;
  v_new_status text;
  v_ar_id uuid;
  v_ar_balance numeric;
BEGIN
  SELECT * INTO v_credit FROM public.credit_notes WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo a favor no encontrado'; END IF;
  IF v_credit.status <> 'active' OR v_credit.balance <= 0 THEN
    RAISE EXCEPTION 'El saldo a favor no está disponible';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  IF p_amount > v_credit.balance THEN RAISE EXCEPTION 'El monto excede el saldo disponible'; END IF;

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
  UPDATE public.invoice_sales
  SET balance = v_new_inv_balance, status = v_new_status, updated_at = now()
  WHERE id = p_invoice_id;

  SELECT id, balance INTO v_ar_id, v_ar_balance
  FROM public.accounts_receivable WHERE invoice_id = p_invoice_id LIMIT 1;
  IF v_ar_id IS NOT NULL THEN
    UPDATE public.accounts_receivable
    SET balance = GREATEST(0, v_ar_balance - p_amount),
        status = CASE WHEN GREATEST(0, v_ar_balance - p_amount) <= 0 THEN 'paid' ELSE status END,
        updated_at = now()
    WHERE id = v_ar_id;
  END IF;

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

grant execute on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) to anon;
