-- Rollback: timezone_aware_date_functions
-- Reverts all changes from 20260911120000_timezone_aware_date_functions.sql
-- Note: does NOT drop organizations.timezone column (it may have been set by users).
--       If you need to fully revert, drop it manually: ALTER TABLE organizations DROP COLUMN timezone;

-- Revert fn_today_for_org to a no-op that returns CURRENT_DATE (original behavior)
-- We cannot fully revert to "never existed" without losing the function.
-- Instead we drop it; callers (triggers) will need to be reverted too.
DROP FUNCTION IF EXISTS public.fn_today_for_org(int);

-- Revert calculate_days_overdue to use CURRENT_DATE (original UTC behavior)
CREATE OR REPLACE FUNCTION public.calculate_days_overdue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.due_date IS NOT NULL AND NEW.balance > 0 THEN
    IF NEW.due_date::date < CURRENT_DATE THEN
      NEW.days_overdue := (CURRENT_DATE - NEW.due_date::date)::integer;
      IF NEW.status = 'current' THEN
        NEW.status := 'overdue';
      END IF;
    ELSE
      NEW.days_overdue := 0;
      IF NEW.status = 'overdue' AND NEW.balance = NEW.amount THEN
        NEW.status := 'current';
      END IF;
    END IF;
  ELSE
    NEW.days_overdue := 0;
    IF NEW.balance = 0 THEN
      NEW.status := 'paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Revert daily_update_overdue_accounts to use CURRENT_DATE
DROP FUNCTION IF EXISTS public.daily_update_overdue_accounts();
CREATE OR REPLACE FUNCTION public.daily_update_overdue_accounts()
RETURNS TABLE(total_updated integer, total_overdue integer, message text)
LANGUAGE plpgsql
AS $$
DECLARE
  total_updated integer := 0;
  total_overdue integer := 0;
BEGIN
  UPDATE accounts_receivable
  SET
    days_overdue = CASE
      WHEN due_date::date < CURRENT_DATE AND balance > 0
      THEN (CURRENT_DATE - due_date::date)::integer
      ELSE 0
    END,
    status = CASE
      WHEN balance = 0 THEN 'paid'
      WHEN due_date::date < CURRENT_DATE AND balance > 0 AND balance < amount THEN 'partial'
      WHEN due_date::date < CURRENT_DATE AND balance > 0 AND balance = amount THEN 'overdue'
      WHEN balance > 0 AND balance < amount THEN 'partial'
      ELSE 'current'
    END,
    updated_at = NOW()
  WHERE balance > 0 OR status != 'paid';

  GET DIAGNOSTICS total_updated = ROW_COUNT;

  SELECT COUNT(*) INTO total_overdue
  FROM accounts_receivable
  WHERE balance > 0 AND due_date::date < CURRENT_DATE;

  RETURN QUERY SELECT
    total_updated,
    total_overdue,
    format('Actualizado: %s cuentas. Vencidas: %s', total_updated, total_overdue)::text;
END;
$$;

-- Revert update_all_days_overdue to use CURRENT_DATE
DROP FUNCTION IF EXISTS public.update_all_days_overdue();
CREATE OR REPLACE FUNCTION public.update_all_days_overdue()
RETURNS TABLE(total_updated integer, message text)
LANGUAGE plpgsql
AS $$
DECLARE
  total_updated integer := 0;
BEGIN
  UPDATE accounts_receivable
  SET
    days_overdue = CASE
      WHEN due_date::date < CURRENT_DATE AND balance > 0
      THEN (CURRENT_DATE - due_date::date)::integer
      ELSE 0
    END,
    status = CASE
      WHEN balance = 0 THEN 'paid'
      WHEN due_date::date < CURRENT_DATE AND balance > 0 AND balance < amount THEN 'partial'
      WHEN due_date::date < CURRENT_DATE AND balance > 0 AND balance = amount THEN 'overdue'
      WHEN balance > 0 AND balance < amount THEN 'partial'
      ELSE 'current'
    END,
    updated_at = NOW()
  WHERE TRUE;

  GET DIAGNOSTICS total_updated = ROW_COUNT;

  RETURN QUERY SELECT total_updated, 'Dias de atraso actualizados correctamente'::text;
END;
$$;

-- Revert update_expired_parking_passes to use CURRENT_DATE
CREATE OR REPLACE FUNCTION public.update_expired_parking_passes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.end_date < CURRENT_DATE AND NEW.status != 'expired' THEN
        NEW.status := 'expired';
    ELSIF NEW.end_date >= CURRENT_DATE AND OLD.end_date < CURRENT_DATE AND NEW.status = 'expired' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;
