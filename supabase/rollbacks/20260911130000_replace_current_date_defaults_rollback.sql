-- Rollback: replace_current_date_defaults
-- Restores DEFAULT CURRENT_DATE and drops the timezone-aware triggers

-- 1. currency_rates
DROP TRIGGER IF EXISTS trg_set_rate_date_tz ON public.currency_rates;
DROP FUNCTION IF EXISTS public.fn_set_rate_date_tz();
ALTER TABLE public.currency_rates ALTER COLUMN rate_date SET DEFAULT CURRENT_DATE;

-- 2. dispatch_manifests
DROP TRIGGER IF EXISTS trg_set_manifest_date_tz ON public.dispatch_manifests;
DROP FUNCTION IF EXISTS public.fn_set_manifest_date_tz();
ALTER TABLE public.dispatch_manifests ALTER COLUMN manifest_date SET DEFAULT CURRENT_DATE;

-- 3. housekeeping_tasks
DROP TRIGGER IF EXISTS trg_set_task_date_tz ON public.housekeeping_tasks;
DROP FUNCTION IF EXISTS public.fn_set_task_date_tz();
ALTER TABLE public.housekeeping_tasks ALTER COLUMN task_date SET DEFAULT CURRENT_DATE;

-- 4. quotations
DROP TRIGGER IF EXISTS trg_set_quotation_issue_date_tz ON public.quotations;
DROP FUNCTION IF EXISTS public.fn_set_quotation_issue_date_tz();
ALTER TABLE public.quotations ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;

-- 5-9. valid_from columns
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.provider_pricing;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.route_schedules;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.shipping_rates;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.transport_fares;
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.vendor_commission_rates;
DROP FUNCTION IF EXISTS public.fn_set_valid_from_tz();

ALTER TABLE public.provider_pricing ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
ALTER TABLE public.route_schedules ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
ALTER TABLE public.shipping_rates ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
ALTER TABLE public.transport_fares ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
ALTER TABLE public.vendor_commission_rates ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE;
