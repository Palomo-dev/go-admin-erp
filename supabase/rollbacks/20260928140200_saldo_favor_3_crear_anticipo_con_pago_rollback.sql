-- Rollback de 20260928140200_saldo_favor_3_crear_anticipo_con_pago.
-- Quita fn_saldo_favor_crear y devuelve fn_create_customer_credit a la versión
-- de 20260923133707 (sin autor, sin verificar el asiento y con EXECUTE para
-- authenticated, que es lo que usaba el diálogo anterior).
-- ADVERTENCIA: los anticipos ya creados (payment_groups + payments +
-- credit_notes + asiento) se conservan. Quita credit_notes.created_by: el autor
-- guardado se pierde.
-- Orden: revertir antes las migraciones 4/6, 5/6 y 6/6 de saldos a favor.

drop function if exists public.fn_saldo_favor_crear(uuid, integer, numeric, text, text, integer, integer, text, date, text);

CREATE OR REPLACE FUNCTION public.fn_create_customer_credit(p_org integer, p_customer uuid, p_amount numeric, p_cash_account text DEFAULT '1110'::text, p_branch integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_expiry timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_entry integer;
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.organization_id = p_org
       AND om.user_id = (select auth.uid())
       AND om.is_active
  ) THEN
    RAISE EXCEPTION 'no pertenece a la organizacion %', p_org USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  INSERT INTO public.credit_notes(organization_id, customer_id, branch_id, amount, balance, status, notes, expiry_date)
  VALUES (p_org, p_customer, p_branch, p_amount, p_amount, 'active', p_notes, p_expiry)
  RETURNING id INTO v_id;

  v_entry := fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := p_branch,
    p_entry_date := now(),
    p_memo := 'Saldo a favor cliente',
    p_source := 'customer_credit',
    p_source_id := v_id::text,
    p_debit_account := p_cash_account,
    p_credit_account := '2805',
    p_amount := p_amount,
    p_tax_account := NULL,
    p_tax_amount := 0,
    p_created_by := p_created_by,
    p_fact_key := 'customer_credit:' || v_id::text
  );

  RETURN v_id;
END;
$function$;

grant execute on function public.fn_create_customer_credit(integer, uuid, numeric, text, integer, text, timestamptz, uuid) to authenticated, service_role;

alter table public.credit_notes drop column if exists created_by;
