-- Migration: timezone-aware date functions + organizations.timezone column
-- Date: 2026-09-11
-- Purpose: Eliminate the "date appears one day off" bug by making all DB-side
--          date calculations use the organization's IANA timezone instead of
--          CURRENT_DATE (which is UTC in the Supabase cluster).
--
-- This migration is idempotent: all statements use IF NOT EXISTS or CREATE OR REPLACE.
-- It does NOT modify any historical data (timestamptz instants are correct as stored).

-- ============================================================
-- 1. Add organizations.timezone column (canonical source of truth)
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text NULL;

COMMENT ON COLUMN public.organizations.timezone IS
  'Zona horaria IANA (ej: America/Bogota). NULL = usar fallback America/Bogota.';

-- Backfill from organization_settings key='calendar' field 'timezone'
UPDATE public.organizations o
SET timezone = (os.settings->>'timezone')::text
FROM public.organization_settings os
WHERE os.organization_id = o.id
  AND os.key = 'calendar'
  AND os.settings ? 'timezone'
  AND btrim(os.settings->>'timezone') != ''
  AND o.timezone IS NULL;

-- ============================================================
-- 2. fn_today_for_org: returns today's date in the org's timezone
--    Reads organizations.timezone (canonical), falls back to
--    organization_settings key='calendar', then to 'America/Bogota'.
--    Validates IANA timezone to avoid breaking INSERTs from triggers.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_today_for_org(p_org_id int)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_today date;
BEGIN
  -- 1. Canonical source: organizations.timezone
  SELECT o.timezone INTO v_timezone
  FROM organizations o
  WHERE o.id = p_org_id;

  -- 2. Legacy fallback: organization_settings key='calendar'
  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    SELECT (os.settings->>'timezone')::text INTO v_timezone
    FROM organization_settings os
    WHERE os.organization_id = p_org_id
      AND os.key = 'calendar'
      AND os.settings ? 'timezone'
      AND btrim(os.settings->>'timezone') != ''
    LIMIT 1;
  END IF;

  -- 3. Final fallback
  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    v_timezone := 'America/Bogota';
  END IF;

  -- 4. Validate IANA timezone; fall back on invalid to avoid breaking INSERTs
  BEGIN
    v_today := (now() AT TIME ZONE v_timezone)::date;
  EXCEPTION WHEN others THEN
    v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  END;

  RETURN v_today;
END;
$$;

-- ============================================================
-- 3. calculate_days_overdue: trigger on accounts_receivable
--    Uses fn_today_for_org instead of CURRENT_DATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_days_overdue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_today date;
BEGIN
  IF NEW.due_date IS NOT NULL AND NEW.balance > 0 THEN
    v_today := public.fn_today_for_org(NEW.organization_id);

    IF NEW.due_date::date < v_today THEN
      NEW.days_overdue := (v_today - NEW.due_date::date)::integer;
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

-- ============================================================
-- 4. daily_update_overdue_accounts: batch job, iterates per org
-- ============================================================
CREATE OR REPLACE FUNCTION public.daily_update_overdue_accounts()
RETURNS TABLE(total_updated integer, total_overdue integer, message text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_updated integer := 0;
  v_total_overdue integer := 0;
  v_org_id int;
  v_today date;
  v_org_updated integer;
BEGIN
  FOR v_org_id IN SELECT DISTINCT organization_id FROM accounts_receivable WHERE balance > 0 OR status != 'paid'
  LOOP
    v_today := public.fn_today_for_org(v_org_id);

    UPDATE accounts_receivable
    SET
      days_overdue = CASE
        WHEN due_date::date < v_today AND balance > 0
        THEN (v_today - due_date::date)::integer
        ELSE 0
      END,
      status = CASE
        WHEN balance = 0 THEN 'paid'
        WHEN due_date::date < v_today AND balance > 0 AND balance < amount THEN 'partial'
        WHEN due_date::date < v_today AND balance > 0 AND balance = amount THEN 'overdue'
        WHEN balance > 0 AND balance < amount THEN 'partial'
        ELSE 'current'
      END,
      updated_at = NOW()
    WHERE (balance > 0 OR status != 'paid') AND organization_id = v_org_id;

    GET DIAGNOSTICS v_org_updated = ROW_COUNT;
    v_total_updated := v_total_updated + v_org_updated;

    SELECT COUNT(*) INTO v_total_overdue
    FROM accounts_receivable
    WHERE balance > 0 AND due_date::date < v_today AND organization_id = v_org_id;
  END LOOP;

  RETURN QUERY SELECT
    v_total_updated,
    v_total_overdue,
    format('Actualizado: %s cuentas. Vencidas: %s', v_total_updated, v_total_overdue)::text;
END;
$$;

-- ============================================================
-- 5. update_all_days_overdue: batch job, iterates per org
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_all_days_overdue()
RETURNS TABLE(total_updated integer, message text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_updated integer := 0;
  v_org_id int;
  v_today date;
  v_org_updated integer;
BEGIN
  FOR v_org_id IN SELECT DISTINCT organization_id FROM accounts_receivable
  LOOP
    v_today := public.fn_today_for_org(v_org_id);

    UPDATE accounts_receivable
    SET
      days_overdue = CASE
        WHEN due_date::date < v_today AND balance > 0
        THEN (v_today - due_date::date)::integer
        ELSE 0
      END,
      status = CASE
        WHEN balance = 0 THEN 'paid'
        WHEN due_date::date < v_today AND balance > 0 AND balance < amount THEN 'partial'
        WHEN due_date::date < v_today AND balance > 0 AND balance = amount THEN 'overdue'
        WHEN balance > 0 AND balance < amount THEN 'partial'
        ELSE 'current'
      END,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    GET DIAGNOSTICS v_org_updated = ROW_COUNT;
    v_total_updated := v_total_updated + v_org_updated;
  END LOOP;

  RETURN QUERY SELECT v_total_updated, 'Dias de atraso actualizados correctamente'::text;
END;
$$;

-- ============================================================
-- 6. update_expired_parking_passes: trigger on parking_passes
--    Uses fn_today_for_org instead of CURRENT_DATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_expired_parking_passes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_today date;
BEGIN
    v_today := public.fn_today_for_org(NEW.organization_id);

    IF NEW.end_date < v_today AND NEW.status != 'expired' THEN
        NEW.status := 'expired';
    ELSIF NEW.end_date >= v_today AND OLD.end_date < v_today AND NEW.status = 'expired' THEN
        NEW.status := 'active';
    END IF;

    RETURN NEW;
END;
$$;
