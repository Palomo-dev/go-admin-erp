-- Migration: replace CURRENT_DATE defaults with timezone-aware triggers
-- Date: 2026-09-11
-- Purpose: The 9 columns with DEFAULT CURRENT_DATE inserted the UTC day
--          after 19:00 Colombia. Now triggers use fn_today_for_org(org_id)
--          to set the correct calendar day when the column is NULL.
--          Explicit values from the app are always respected.
--
-- Idempotent: uses DROP IF EXISTS before CREATE TRIGGER.

-- 1. currency_rates.rate_date
ALTER TABLE public.currency_rates ALTER COLUMN rate_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_set_rate_date_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.rate_date IS NULL THEN
    NEW.rate_date := public.fn_today_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_rate_date_tz ON public.currency_rates;
CREATE TRIGGER trg_set_rate_date_tz
  BEFORE INSERT ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_rate_date_tz();

-- 2. dispatch_manifests.manifest_date
ALTER TABLE public.dispatch_manifests ALTER COLUMN manifest_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_set_manifest_date_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.manifest_date IS NULL THEN
    NEW.manifest_date := public.fn_today_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_manifest_date_tz ON public.dispatch_manifests;
CREATE TRIGGER trg_set_manifest_date_tz
  BEFORE INSERT ON public.dispatch_manifests
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_manifest_date_tz();

-- 3. housekeeping_tasks.task_date
ALTER TABLE public.housekeeping_tasks ALTER COLUMN task_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_set_task_date_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.task_date IS NULL THEN
    NEW.task_date := public.fn_today_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_date_tz ON public.housekeeping_tasks;
CREATE TRIGGER trg_set_task_date_tz
  BEFORE INSERT ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_task_date_tz();

-- 4. quotations.issue_date
ALTER TABLE public.quotations ALTER COLUMN issue_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_set_quotation_issue_date_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.issue_date IS NULL THEN
    NEW.issue_date := public.fn_today_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quotation_issue_date_tz ON public.quotations;
CREATE TRIGGER trg_set_quotation_issue_date_tz
  BEFORE INSERT ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_quotation_issue_date_tz();

-- 5-9. provider_pricing, route_schedules, shipping_rates, transport_fares, vendor_commission_rates
-- All have valid_from with DEFAULT CURRENT_DATE

CREATE OR REPLACE FUNCTION public.fn_set_valid_from_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.valid_from IS NULL THEN
    NEW.valid_from := public.fn_today_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.provider_pricing ALTER COLUMN valid_from DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.provider_pricing;
CREATE TRIGGER trg_set_valid_from_tz
  BEFORE INSERT ON public.provider_pricing
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_valid_from_tz();

ALTER TABLE public.route_schedules ALTER COLUMN valid_from DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.route_schedules;
CREATE TRIGGER trg_set_valid_from_tz
  BEFORE INSERT ON public.route_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_valid_from_tz();

ALTER TABLE public.shipping_rates ALTER COLUMN valid_from DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.shipping_rates;
CREATE TRIGGER trg_set_valid_from_tz
  BEFORE INSERT ON public.shipping_rates
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_valid_from_tz();

ALTER TABLE public.transport_fares ALTER COLUMN valid_from DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.transport_fares;
CREATE TRIGGER trg_set_valid_from_tz
  BEFORE INSERT ON public.transport_fares
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_valid_from_tz();

ALTER TABLE public.vendor_commission_rates ALTER COLUMN valid_from DROP DEFAULT;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.vendor_commission_rates;
CREATE TRIGGER trg_set_valid_from_tz
  BEFORE INSERT ON public.vendor_commission_rates
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_valid_from_tz();
