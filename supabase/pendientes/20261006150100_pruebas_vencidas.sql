-- ⚠️ SIN APLICAR (2026-10-06). Auditoría de Organización 2026-10, P0-5. REQUIERE 20261006150000.
-- ⚠️ DECISIÓN DE NEGOCIO PENDIENTE: aplicarla cambia el plan efectivo de las pruebas vencidas.
--
-- Pruebas vencidas que seguían dando el plan completo: get_current_plan y validate_module_activation
-- aceptaban `trialing` sin mirar `trial_end`. Aquí:
--
--   1. fn_plan_vigente deja de contar una prueba vencida (`trialing` con trial_end pasado) y devuelve
--      el plan free con estado 'vencida' (también para `incomplete_expired`). Como fn_cupo_plan la usa,
--      los cupos de usuarios y sucursales pasan a los del plan free (2 y 1).
--   2. get_current_plan usa fn_plan_vigente: para una prueba vencida responde el plan free con
--      subscription_status 'incomplete_expired' (antes: el plan pagado como 'trialing').
--   3. validate_module_activation usa fn_plan_vigente: sin suscripción vigente se aplica el límite del
--      plan free (antes: ilimitado, porque no encontraba fila y NULL = sin límite). Pasa a SECURITY
--      DEFINER para contar los módulos de la organización sin depender de la RLS de quien escribe.
--      No apaga módulos ya activos: solo impide activar más.
--   4. fn_pruebas_plan_vencer() + tarea pg_cron horaria: marca `incomplete_expired` las pruebas vencidas
--      SIN stripe_subscription_id (con Stripe, el estado lo pone el webhook). Deja rastro en metadata.
--
-- Afectadas a 2026-10-06 (consulta de conteo al final de este comentario):
--   29 suscripciones `trialing` con trial_end pasado (29 organizaciones).
--   - 2 sin stripe_subscription_id: la tarea las marcaría `incomplete_expired` en su primera vuelta.
--   - 27 con stripe_subscription_id: la tarea NO las toca, pero get_current_plan y los cupos ya las
--     tratarían como vencidas. Que sigan en `trialing` con la prueba pasada indica que el webhook no
--     recibió/aplicó la transición de Stripe: conciliar con Stripe ANTES de aplicar.
--   El middleware ya manda a /app/cuenta-congelada a todas (trialing + trial_end pasado), así que en
--   la UI no cambia nada: cambia lo que la base concede (módulos, cupos, get_current_plan).
--
--   select (s.stripe_subscription_id is not null) as con_stripe, p.code as plan,
--          count(*) as suscripciones, min(s.trial_end) as vencio_desde, max(s.trial_end) as vencio_hasta
--     from public.subscriptions s join public.plans p on p.id = s.plan_id
--    where s.status = 'trialing' and s.trial_end < now()
--    group by 1, 2 order by 1, 2
--
-- Impacto en cupos y módulos (2026-10-06, conteos): ninguna de las 29 supera hoy el tope free de
-- usuarios (2) ni de sucursales (1); 28 tienen módulos de pago activos (2 sin Stripe, 26 con
-- Stripe), que NO se apagan pero no podrán activar más.
--
-- Ensayo 2026-10-06 (do/raise, junto con 20261006150000): ENSAYO_OK. Alta OK (pro/trialing);
-- módulo de pago con prueba vigente OK; prueba vencida → get_current_plan free/incomplete_expired y
-- cupo 2 usuarios/1 sucursal; activar otro módulo de pago RECHAZADO, el activo sigue y se puede
-- desactivar; fn_pruebas_plan_vencer marcó las vencidas sin Stripe (3 en el ensayo: las 2 reales +
-- la de prueba) y no tocó una con Stripe; tarea pg_cron programada; una segunda alta nace en prueba.
--
-- Si negocio decide otra cosa para las 2 sin Stripe (p. ej. extender la prueba), hacerlo ANTES de
-- aplicar, o quitar el bloque 4 (cron.schedule) de esta migración.

-- ─── 1. Plan vigente: una prueba vencida ya no cuenta ────────────────────────

create or replace function public.fn_plan_vigente(p_org integer)
returns table (plan_id integer, subscription_id uuid, estado text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_vencida uuid;
begin
  return query
  select s.plan_id, s.id, s.status
    from public.subscriptions s
   where s.organization_id = p_org
     and s.plan_id is not null
     and s.status in ('active', 'trialing', 'past_due')
     and not (s.status = 'trialing' and s.trial_end is not null and s.trial_end <= now())
   order by s.created_at desc, s.updated_at desc
   limit 1;
  if found then
    return;
  end if;

  select s.id into v_vencida
    from public.subscriptions s
   where s.organization_id = p_org
     and ((s.status = 'trialing' and s.trial_end is not null and s.trial_end <= now())
          or s.status = 'incomplete_expired')
   order by s.created_at desc, s.updated_at desc
   limit 1;

  return query
  select p.id, v_vencida, case when v_vencida is null then 'sin_suscripcion' else 'vencida' end
    from public.plans p
   where p.code = 'free'
   limit 1;
end;
$$;

revoke all on function public.fn_plan_vigente(integer) from public, anon, authenticated;
grant execute on function public.fn_plan_vigente(integer) to service_role;

-- ─── 2. get_current_plan (misma firma) ───────────────────────────────────────

create or replace function public.get_current_plan(org_id integer)
returns table (
  plan_id integer, plan_code text, plan_name text, price_usd_month numeric, price_usd_year numeric,
  trial_days integer, max_modules integer, max_branches integer, max_users integer, features jsonb,
  subscription_status text, subscription_id uuid, current_period_start timestamptz,
  current_period_end timestamptz, trial_start timestamptz, trial_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(org_id::integer);
  return query
  select
    p.id,
    p.code,
    p.name,
    p.price_usd_month,
    p.price_usd_year,
    p.trial_days,
    p.max_modules,
    p.max_branches,
    p.max_users,
    p.features,
    case v.estado
      when 'vencida' then 'incomplete_expired'::text
      when 'sin_suscripcion' then 'active'::text
      else v.estado
    end,
    v.subscription_id,
    s.current_period_start,
    s.current_period_end,
    s.trial_start,
    s.trial_end
  from public.fn_plan_vigente(org_id) v
  join public.plans p on p.id = v.plan_id
  left join public.subscriptions s on s.id = v.subscription_id
  limit 1;
end;
$$;

-- ─── 3. validate_module_activation: el límite sale del plan vigente ──────────

create or replace function public.validate_module_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_plan_limit integer;
  current_paid_modules integer;
  is_module_core boolean;
  core_modules_count integer;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.is_active = true and (old.is_active is null or old.is_active = false)) then

    -- Alias gym -> memberships (20260929000200): con «gym» activo es un cambio de nombre, no un módulo nuevo.
    if new.module_code = 'memberships' and exists (
         select 1 from organization_modules g
          where g.organization_id = new.organization_id and g.module_code = 'gym' and g.is_active) then
      if new.enabled_at is null then
        new.enabled_at := now();
      end if;
      return new;
    end if;

    select is_core into is_module_core from modules where code = new.module_code;

    if is_module_core then
      if new.enabled_at is null then
        new.enabled_at := now();
      end if;
      return new;
    end if;

    -- Límite del plan VIGENTE (P0-5): una prueba vencida o sin suscripción rige el plan free.
    select p.max_modules into org_plan_limit
      from public.fn_plan_vigente(new.organization_id) v
      join plans p on p.id = v.plan_id
     limit 1;

    if org_plan_limit is null then
      if new.enabled_at is null then
        new.enabled_at := now();
      end if;
      return new;
    end if;

    select count(*) into core_modules_count from modules where is_core = true and is_active = true;

    org_plan_limit := org_plan_limit - core_modules_count;
    if org_plan_limit < 0 then
      org_plan_limit := 0;
    end if;

    select count(*) into current_paid_modules
      from organization_modules om
      join modules m on om.module_code = m.code
     where om.organization_id = new.organization_id
       and om.is_active = true
       and m.is_core = false
       and m.is_active = true
       and (tg_op = 'INSERT' or om.module_code != new.module_code);

    if current_paid_modules >= org_plan_limit then
      raise exception 'Cannot activate module %. Organization has reached the limit of % paid modules allowed by their plan.',
        new.module_code, org_plan_limit;
    end if;

    if new.enabled_at is null then
      new.enabled_at := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and new.is_active = false and old.is_active = true then
    new.disabled_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.validate_module_activation() from public, anon, authenticated;

-- ─── 4. Marcar las pruebas vencidas sin Stripe ───────────────────────────────

create or replace function public.fn_pruebas_plan_vencer()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.subscriptions
     set status = 'incomplete_expired',
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('vencida_por', 'fn_pruebas_plan_vencer', 'vencida_en', now())
   where status = 'trialing'
     and trial_end is not null
     and trial_end <= now()
     and stripe_subscription_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.fn_pruebas_plan_vencer() from public, anon, authenticated;

comment on function public.fn_pruebas_plan_vencer() is
  'P0-5: pasa a incomplete_expired las pruebas vencidas sin suscripción de Stripe. La ejecuta pg_cron cada hora.';

select cron.schedule('pruebas-plan-vencer', '23 * * * *', 'select public.fn_pruebas_plan_vencer()');
