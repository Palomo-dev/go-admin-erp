-- Rollback: fix_triggers_missing_org_id
-- Revierte los cambios de 20260911140000_fix_triggers_missing_org_id.sql

-- 1. currency_rates: restaurar trigger roto (solo para revertir; el bug vuelve)
DROP TRIGGER IF EXISTS trg_set_rate_date_tz ON public.currency_rates;
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

CREATE TRIGGER trg_set_rate_date_tz
  BEFORE INSERT ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_rate_date_tz();

-- 2. provider_pricing: restaurar trigger roto
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.provider_pricing;
ALTER TABLE public.provider_pricing ALTER COLUMN valid_from DROP DEFAULT;

-- 3. housekeeping_tasks: restaurar trigger roto
DROP TRIGGER IF EXISTS trg_set_task_date_tz ON public.housekeeping_tasks;
DROP FUNCTION IF EXISTS public.fn_set_task_date_tz();

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

CREATE TRIGGER trg_set_task_date_tz
  BEFORE INSERT ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_task_date_tz();

-- 4. fn_today_system: dejar (es inofensiva)
-- No la eliminamos porque otros objetos podrian depender de ella.
