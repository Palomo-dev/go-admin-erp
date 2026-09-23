-- Planes: límites oficiales y precios en pesos, y el límite de facturas.
-- (Contenido idéntico al aplicado por el MCP el 2026-09-22; ver comentario
-- completo en el cuerpo.)
alter table public.plans
  add column if not exists max_invoices_monthly integer;

comment on column public.plans.max_invoices_monthly is
  'Facturas que el plan permite emitir al mes. NULL = ilimitadas.';

update public.plans set
  max_modules = 12, max_branches = 1, max_users = 10,
  ai_credits_monthly = 500, max_invoices_monthly = 1000, trial_days = 15,
  price_cop_month = 99000, price_cop_year = 990000,
  features = features || jsonb_build_object('max_users', 10, 'ai_credits_month', 500, 'max_invoices_month', 1000),
  updated_at = now()
where code = 'pro';

update public.plans set
  max_modules = 16, max_branches = 5, max_users = 20,
  ai_credits_monthly = 2000, max_invoices_monthly = 3000, trial_days = 30,
  price_cop_month = 189000, price_cop_year = 1890000,
  features = features || jsonb_build_object('max_users', 20, 'ai_credits_month', 2000, 'max_invoices_month', 3000),
  updated_at = now()
where code = 'business';

update public.plans set
  max_modules = null, max_branches = 15, max_users = 60,
  ai_credits_monthly = 10000, max_invoices_monthly = null, trial_days = 30,
  price_cop_month = 990000, price_cop_year = 9990000,
  features = features || jsonb_build_object('max_users', 60, 'ai_credits_month', 10000, 'max_invoices_month', null, 'max_modules', null),
  updated_at = now()
where code = 'ultimate';
