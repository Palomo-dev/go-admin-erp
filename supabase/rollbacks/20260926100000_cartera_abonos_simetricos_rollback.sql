-- Rollback de 20260926100000_cartera_abonos_simetricos.sql
-- Restaura las versiones anteriores (cuerpo leído de la base el 2026-09-24).
-- No revierte datos: los saldos que el disparador nuevo haya recalculado se quedan.

create or replace function public.fn_invoice_sales_paid(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
as $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  SELECT COALESCE((
    SELECT SUM(p.amount)
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
BEGIN
  IF NEW.source = 'invoice_sales' AND NEW.source_id IS NOT NULL THEN
    BEGIN
      source_id_uuid := NEW.source_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error al convertir source_id a UUID: %', SQLERRM;
      RETURN NEW;
    END;

    SELECT * INTO invoice_record FROM invoice_sales WHERE id = source_id_uuid;

    IF FOUND THEN
      IF NOT EXISTS (SELECT 1 FROM accounts_receivable WHERE invoice_id = invoice_record.id) THEN
        PERFORM create_account_receivable(invoice_record.id::TEXT);
      ELSE
        UPDATE accounts_receivable
        SET
          balance = invoice_record.balance,
          updated_at = NOW()
        WHERE invoice_id = invoice_record.id;
      END IF;
    END IF;

  ELSIF NEW.source = 'account_receivable' AND NEW.source_id IS NOT NULL THEN
    BEGIN
      source_id_uuid := NEW.source_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error al convertir source_id a UUID para account_receivable: %', SQLERRM;
      RETURN NEW;
    END;

    SELECT * INTO account_record FROM accounts_receivable WHERE id = source_id_uuid;

    IF FOUND THEN
      DECLARE
        new_balance NUMERIC;
        new_status TEXT;
        settled NUMERIC;
      BEGIN
        settled := NEW.amount + COALESCE(NEW.discount_amount, 0);
        new_balance := account_record.balance - settled;
        new_balance := GREATEST(new_balance, 0);

        IF new_balance = 0 THEN
          new_status := 'paid';
        ELSIF new_balance < account_record.amount THEN
          new_status := 'partial';
        ELSE
          new_status := account_record.status;
        END IF;

        UPDATE accounts_receivable
        SET
          balance = new_balance,
          status = new_status,
          discount_amount = COALESCE(discount_amount, 0) + COALESCE(NEW.discount_amount, 0),
          updated_at = NOW()
        WHERE id = source_id_uuid;

        IF account_record.invoice_id IS NOT NULL THEN
          UPDATE invoice_sales
          SET
            balance = new_balance,
            status = CASE
              WHEN new_balance = 0 THEN 'paid'
              WHEN new_balance < total THEN 'partial'
              ELSE status
            END,
            updated_at = NOW()
          WHERE id = account_record.invoice_id;
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists tr_update_accounts_receivable_on_payment on public.payments;
create trigger tr_update_accounts_receivable_on_payment
  after insert on public.payments
  for each row execute function public.update_accounts_receivable_on_payment();

grant execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) to anon;

create policy payments_delete_policy on public.payments
  for delete to authenticated
  using (organization_id in (select organization_members.organization_id
                               from organization_members
                              where organization_members.user_id = auth.uid()));
