-- Rollback de 20260928140000_saldo_favor_1_regla_unica_cuenta_aplicaciones.
-- Restaura fn_invoice_sales_paid sin las aplicaciones de saldo a favor, quita el
-- disparador de recálculo y devuelve fn_apply_customer_credit a la versión de
-- 20260922140000 (la que escribe el saldo de la factura a mano).
-- ADVERTENCIA: si ya hay aplicaciones de saldo a favor, tras este rollback el
-- siguiente recálculo de esas facturas les devuelve el saldo cubierto (el bug
-- original). No se revierten datos.
-- Orden: revertir antes 20260928140100 (2/6), que reemplaza fn_apply_customer_credit.

drop trigger if exists trg_aplicacion_saldo_favor_recalcula_factura on public.credit_note_applications;
drop function if exists public.fn_trg_aplicacion_saldo_favor_recalcula_factura();

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
alter function public.fn_invoice_sales_paid(uuid) reset search_path;

CREATE OR REPLACE FUNCTION public.fn_apply_customer_credit(p_credit_id uuid, p_invoice_id uuid, p_amount numeric, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
