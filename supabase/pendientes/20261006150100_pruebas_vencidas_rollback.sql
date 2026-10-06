-- Reversión de 20261006150100_pruebas_vencidas.
-- ⚠️ NO revierte datos: las suscripciones que la tarea pasó a `incomplete_expired` siguen así. Se
-- identifican por metadata->>'vencida_por' = 'fn_pruebas_plan_vencer'. Si negocio decide devolverlas:
--   update public.subscriptions set status = 'trialing'
--    where status = 'incomplete_expired' and metadata->>'vencida_por' = 'fn_pruebas_plan_vencer'

select cron.unschedule(jobid) from cron.job where jobname = 'pruebas-plan-vencer';
drop function if exists public.fn_pruebas_plan_vencer();

-- fn_plan_vigente vuelve a la versión de 20261006150000 (trialing cuenta sin mirar trial_end).
create or replace function public.fn_plan_vigente(p_org integer)
returns table (plan_id integer, subscription_id uuid, estado text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select s.plan_id, s.id, s.status
    from public.subscriptions s
   where s.organization_id = p_org
     and s.plan_id is not null
     and s.status in ('active', 'trialing', 'past_due')
   order by s.created_at desc, s.updated_at desc
   limit 1;
  if found then
    return;
  end if;

  return query
  select p.id, null::uuid, 'sin_suscripcion'::text
    from public.plans p
   where p.code = 'free'
   limit 1;
end;
$$;

-- get_current_plan tal como estaba antes (2026-10-06).
create or replace function public.get_current_plan(org_id integer)
returns table (
  plan_id integer, plan_code text, plan_name text, price_usd_month numeric, price_usd_year numeric,
  trial_days integer, max_modules integer, max_branches integer, max_users integer, features jsonb,
  subscription_status text, subscription_id uuid, current_period_start timestamptz,
  current_period_end timestamptz, trial_start timestamptz, trial_end timestamptz
)
language plpgsql
security definer
as $$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  RETURN QUERY
  SELECT
    p.id as plan_id,
    p.code as plan_code,
    p.name as plan_name,
    p.price_usd_month,
    p.price_usd_year,
    p.trial_days,
    p.max_modules,
    p.max_branches,
    p.max_users,
    p.features,
    s.status as subscription_status,
    s.id as subscription_id,
    s.current_period_start,
    s.current_period_end,
    s.trial_start,
    s.trial_end
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY s.created_at DESC, s.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p.id as plan_id,
      p.code as plan_code,
      p.name as plan_name,
      p.price_usd_month,
      p.price_usd_year,
      p.trial_days,
      p.max_modules,
      p.max_branches,
      p.max_users,
      p.features,
      'active'::TEXT as subscription_status,
      NULL::UUID as subscription_id,
      NULL::TIMESTAMPTZ as current_period_start,
      NULL::TIMESTAMPTZ as current_period_end,
      NULL::TIMESTAMPTZ as trial_start,
      NULL::TIMESTAMPTZ as trial_end
    FROM plans p
    WHERE p.code = 'free'
    LIMIT 1;
  END IF;
END;
$$;

-- validate_module_activation tal como estaba antes (SECURITY INVOKER, sin search_path).
create or replace function public.validate_module_activation()
returns trigger
language plpgsql
security invoker
as $$
DECLARE
  org_plan_limit INTEGER;
  current_paid_modules INTEGER;
  is_module_core BOOLEAN;
  core_modules_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active IS NULL OR OLD.is_active = false)) THEN
    IF NEW.module_code = 'memberships' AND EXISTS (
         SELECT 1 FROM organization_modules g
          WHERE g.organization_id = NEW.organization_id AND g.module_code = 'gym' AND g.is_active) THEN
      IF NEW.enabled_at IS NULL THEN
        NEW.enabled_at := NOW();
      END IF;
      RETURN NEW;
    END IF;
    SELECT is_core INTO is_module_core
    FROM modules
    WHERE code = NEW.module_code;
    IF is_module_core THEN
      IF NEW.enabled_at IS NULL THEN
        NEW.enabled_at := NOW();
      END IF;
      RETURN NEW;
    END IF;
    SELECT p.max_modules INTO org_plan_limit
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.organization_id = NEW.organization_id
      AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
    IF org_plan_limit IS NULL THEN
      IF NEW.enabled_at IS NULL THEN
        NEW.enabled_at := NOW();
      END IF;
      RETURN NEW;
    END IF;
    SELECT COUNT(*) INTO core_modules_count
    FROM modules
    WHERE is_core = true AND is_active = true;
    org_plan_limit := org_plan_limit - core_modules_count;
    IF org_plan_limit < 0 THEN
      org_plan_limit := 0;
    END IF;
    SELECT COUNT(*) INTO current_paid_modules
    FROM organization_modules om
    JOIN modules m ON om.module_code = m.code
    WHERE om.organization_id = NEW.organization_id
    AND om.is_active = true
    AND m.is_core = false
    AND m.is_active = true
    AND (TG_OP = 'INSERT' OR om.module_code != NEW.module_code);
    IF current_paid_modules >= org_plan_limit THEN
      RAISE EXCEPTION 'Cannot activate module %. Organization has reached the limit of % paid modules allowed by their plan.',
        NEW.module_code, org_plan_limit;
    END IF;
    IF NEW.enabled_at IS NULL THEN
      NEW.enabled_at := NOW();
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true THEN
    NEW.disabled_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
