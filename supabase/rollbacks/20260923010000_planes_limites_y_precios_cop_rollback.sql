-- Rollback de 20260923010000_planes_limites_y_precios_cop.sql
-- Restaura los límites y precios anteriores (contradictorios entre columnas y
-- `features`; se conservan aquí solo para poder volver atrás).
update public.plans set
  max_modules = 12, max_branches = 1, max_users = 3, ai_credits_monthly = 500,
  max_invoices_monthly = null, trial_days = 15,
  price_cop_month = null, price_cop_year = null
where code = 'pro';

update public.plans set
  max_modules = 16, max_branches = 5, max_users = 10, ai_credits_monthly = 2000,
  max_invoices_monthly = null, trial_days = 30,
  price_cop_month = null, price_cop_year = null
where code = 'business';

update public.plans set
  max_modules = 19, max_branches = 15, max_users = 30, ai_credits_monthly = 10000,
  max_invoices_monthly = null, trial_days = 30,
  price_cop_month = null, price_cop_year = null
where code = 'ultimate';

alter table public.plans drop column if exists max_invoices_monthly;
