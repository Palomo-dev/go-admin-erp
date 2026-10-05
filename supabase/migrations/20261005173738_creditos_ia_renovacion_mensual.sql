-- Créditos de IA: el cupo del plan se RENUEVA cada mes (no se acumula) y los
-- créditos comprados se gastan de verdad.
--
-- Diagnóstico (2026-10-05, verificado por MCP):
--   * plans.ai_credits_max_rollover permitía arrastrar hasta 2× el cupo: el
--     plan de 10.000/mes amanecía cada mes en 30.000 (10.000 + 20.000 de
--     arrastre). 41 organizaciones tenían saldo por encima de su cupo y ningún
--     texto de la UI habla de acumulación («Se renuevan el …»).
--   * purchased_credits nunca bajaba al consumir: en cada cierre mensual los
--     comprados volvían completos aunque ya se hubieran gastado.
--   * Dos reseteos distintos: el cron (UTC, día 1 a las 00:05) y otro en Node
--     (checkAICredits, mes del servidor, sin bloqueo). Queda uno solo, en SQL,
--     por la zona de la organización e idempotente por mes.
--   * refund_ai_credits leía el techo de organizations.plan_id, no de la
--     suscripción (fn_ai_plan_quota).
--   * Una compra que vuelve a quedar en «completed» se acreditaba dos veces.
--
-- Regla nueva:
--   saldo = cupo del plan del mes + comprados que queden.
--   Se gasta primero el cupo del plan y luego los comprados.
--   Al cambiar de mes (en la zona de la organización) el cupo vuelve a su valor;
--   los comprados que queden se conservan.
--
-- La reversión restaura saldos, arrastres y funciones anteriores desde la
-- copia ai_credits_ajuste_20261005.

-- 0. Copia de lo que cambia (para la reversión).
create table if not exists public.ai_credits_ajuste_20261005 (
  organization_id      integer primary key,
  credits_remaining    integer,
  purchased_credits    integer,
  last_rollover_amount integer,
  credits_reset_at     timestamptz,
  copiado_en           timestamptz not null default now()
);
alter table public.ai_credits_ajuste_20261005 enable row level security;
revoke all on public.ai_credits_ajuste_20261005 from anon, authenticated;

insert into public.ai_credits_ajuste_20261005 (organization_id, credits_remaining, purchased_credits, last_rollover_amount, credits_reset_at)
select organization_id, credits_remaining, purchased_credits, last_rollover_amount, credits_reset_at
  from public.ai_settings
on conflict (organization_id) do nothing;

create table if not exists public.ai_credits_ajuste_20261005_planes (
  plan_id                 integer primary key,
  ai_credits_max_rollover integer
);
alter table public.ai_credits_ajuste_20261005_planes enable row level security;
revoke all on public.ai_credits_ajuste_20261005_planes from anon, authenticated;
insert into public.ai_credits_ajuste_20261005_planes (plan_id, ai_credits_max_rollover)
select id, ai_credits_max_rollover from public.plans
on conflict (plan_id) do nothing;

-- 1. Sin arrastre: el cupo se renueva.
update public.plans set ai_credits_max_rollover = 0 where coalesce(ai_credits_max_rollover, 0) <> 0;

-- 2. Cupo del plan: el de una configuración a medida tampoco arrastra.
create or replace function public.fn_ai_plan_quota(p_org integer)
returns table(monthly integer, max_rollover integer, model text, max_tokens integer, source text)
language sql stable security definer set search_path to 'public'
as $function$
  with sub as (
    select s.plan_id, s.metadata -> 'custom_config' as cc
      from public.subscriptions s
     where s.organization_id = p_org
     order by (s.status in ('active', 'trialing')) desc, s.created_at desc nulls last
     limit 1
  ),
  raw as (
    select sub.plan_id,
           coalesce(nullif(btrim(sub.cc ->> 'ai_credits'), ''),
                    nullif(btrim(sub.cc ->> 'aiCredits'), '')) as custom_txt
      from sub
  ),
  q as (
    select raw.plan_id,
           case when raw.custom_txt ~ '^[0-9]{1,9}$' then raw.custom_txt::integer end as custom
      from raw
  )
  select
    greatest(coalesce(q.custom, pl.ai_credits_monthly, 0), 0)        as monthly,
    greatest(coalesce(pl.ai_credits_max_rollover, 0), 0)             as max_rollover,
    coalesce(pl.ai_model, 'gpt-4o-mini')                              as model,
    coalesce(pl.ai_max_tokens, 1000)                                  as max_tokens,
    case when q.plan_id is null then 'none'
         when q.custom is not null then 'custom_config'
         else 'plan' end                                              as source
  from (select 1) as one
  left join q on true
  left join public.plans pl on pl.id = q.plan_id;
$function$;

-- 3. Débito: el cupo del plan se gasta primero; si el cobro entra en los
--    comprados, purchased_credits baja con él.
create or replace function public.decrement_ai_credits(p_org_id integer, p_cost integer)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_remaining integer;
  v_nuevo     integer;
begin
  -- Guarda de importe (QA r1 alto 3): NULL o negativo nunca tocan el saldo.
  if p_org_id is null or p_cost is null or p_cost < 0 then
    return false;
  end if;

  select credits_remaining into v_remaining
    from ai_settings
   where organization_id = p_org_id
     for update; -- bloqueo a nivel fila para evitar race condition

  -- Sin fila: 402 (la app auto-provisiona y reintenta), no excepción.
  if not found then
    return false;
  end if;

  -- Saldo NULL se trata como 0: nunca "ilimitado" por accidente.
  v_remaining := coalesce(v_remaining, 0);

  if v_remaining < p_cost then
    return false;
  end if;

  v_nuevo := v_remaining - p_cost;

  update ai_settings
     set credits_remaining = v_nuevo,
         -- Lo que queda del cupo del plan es saldo − comprados: cuando el saldo
         -- baja de los comprados, el cobro ya está consumiendo comprados.
         purchased_credits = least(coalesce(purchased_credits, 0), v_nuevo)
   where organization_id = p_org_id;

  return true;
end;
$function$;

-- 4. Inicio del mes en curso en la zona de la organización.
create or replace function public.fn_ai_credits_inicio_periodo(p_org integer)
returns timestamptz
language sql stable security definer set search_path to 'public'
as $function$
  select (date_trunc('month', now() at time zone z.tz)) at time zone z.tz
    from (select public.fn_resolve_timezone(public.fn_timezone_for(p_org, null)) as tz) z;
$function$;

-- Próxima renovación (para la UI: «Se renuevan el …»).
create or replace function public.fn_ai_credits_proxima_renovacion(p_org integer)
returns timestamptz
language sql stable security definer set search_path to 'public'
as $function$
  select (date_trunc('month', now() at time zone z.tz) + interval '1 month') at time zone z.tz
    from (select public.fn_resolve_timezone(public.fn_timezone_for(p_org, null)) as tz) z;
$function$;

-- 5. Renovación de UNA organización: idempotente (solo si su último reinicio
--    es anterior al inicio del mes en su zona) y con la fila bloqueada.
create or replace function public.fn_renovar_creditos_ia(p_org integer)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row       record;
  q           record;
  v_inicio    timestamptz;
  v_comprados integer;
  v_arrastre  integer;
  v_total     integer;
begin
  select credits_remaining, purchased_credits, credits_reset_at
    into v_row
    from public.ai_settings
   where organization_id = p_org
     for update;
  if not found then
    return jsonb_build_object('renovado', false, 'motivo', 'sin_fila');
  end if;

  v_inicio := public.fn_ai_credits_inicio_periodo(p_org);
  if v_row.credits_reset_at is not null and v_row.credits_reset_at >= v_inicio then
    return jsonb_build_object('renovado', false, 'motivo', 'mes_al_dia', 'saldo', coalesce(v_row.credits_remaining, 0));
  end if;

  select * into q from public.fn_ai_plan_quota(p_org);

  -- Sin cupo de plan ni comprados: no se toca (igual que el cron anterior);
  -- nunca se deja en cero un saldo que alguien asignó a mano.
  if coalesce(q.monthly, 0) = 0 and coalesce(v_row.purchased_credits, 0) = 0 then
    return jsonb_build_object('renovado', false, 'motivo', 'sin_cupo', 'saldo', coalesce(v_row.credits_remaining, 0));
  end if;

  -- Comprados que de verdad quedan (nunca más que el saldo).
  v_comprados := least(coalesce(v_row.purchased_credits, 0), greatest(coalesce(v_row.credits_remaining, 0), 0));
  v_arrastre  := least(greatest(coalesce(v_row.credits_remaining, 0) - v_comprados, 0), coalesce(q.max_rollover, 0));
  v_total     := coalesce(q.monthly, 0) + v_arrastre + v_comprados;

  update public.ai_settings
     set credits_remaining    = v_total,
         purchased_credits    = v_comprados,
         last_rollover_amount = v_arrastre,
         credits_reset_at     = now(),
         model                = coalesce(q.model, model),
         max_tokens           = coalesce(q.max_tokens, max_tokens),
         updated_at           = now()
   where organization_id = p_org;

  return jsonb_build_object('renovado', true, 'cupo', q.monthly, 'arrastre', v_arrastre,
                            'comprados', v_comprados, 'saldo', v_total);
end;
$function$;

revoke all on function public.fn_renovar_creditos_ia(integer) from public, anon, authenticated;
revoke all on function public.fn_ai_credits_inicio_periodo(integer) from public, anon;
revoke all on function public.fn_ai_credits_proxima_renovacion(integer) from public, anon;

-- 6. El cron recorre todas las filas con la misma función (una sola regla).
create or replace function public.fn_reset_monthly_ai_credits()
returns table(organization_id_updated integer, monthly_credits integer, rollover_applied integer, purchased_preserved integer, new_total integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  rec record;
  r   jsonb;
begin
  for rec in select s.organization_id from public.ai_settings s loop
    r := public.fn_renovar_creditos_ia(rec.organization_id);
    if (r ->> 'renovado')::boolean then
      organization_id_updated := rec.organization_id;
      monthly_credits         := (r ->> 'cupo')::integer;
      rollover_applied        := (r ->> 'arrastre')::integer;
      purchased_preserved     := (r ->> 'comprados')::integer;
      new_total               := (r ->> 'saldo')::integer;
      return next;
    end if;
  end loop;
end;
$function$;

-- Cada hora: cada organización se renueva cuando empieza el mes en SU zona
-- (antes: 00:05 UTC del día 1, que en Colombia es el último día a las 19:05).
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'reset-monthly-ai-credits';
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := '5 * * * *');
  end if;
end $$;

-- 7. Reembolso: techo desde el cupo real de la suscripción.
create or replace function public.refund_ai_credits(p_org_id integer, p_amount integer, p_previous integer default null::integer)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_remaining integer;
  v_purchased integer;
  v_ceiling   integer;
  v_target    integer;
  q           record;
begin
  if p_org_id is null or p_amount is null or p_amount < 0 then
    return false;
  end if;

  select credits_remaining, coalesce(purchased_credits, 0)
    into v_remaining, v_purchased
    from public.ai_settings
   where organization_id = p_org_id
     for update; -- mismo bloqueo de fila que decrement_ai_credits

  if not found then
    return false;
  end if;

  if p_amount = 0 then
    return true;
  end if;

  v_remaining := coalesce(v_remaining, 0);
  v_target    := v_remaining + p_amount;

  select * into q from public.fn_ai_plan_quota(p_org_id);
  v_ceiling := coalesce(q.monthly, 0) + coalesce(q.max_rollover, 0) + v_purchased;
  -- Si el saldo previo al cobro estaba por encima (compra o cambio de plan),
  -- el reembolso puede devolverlo hasta ese saldo, nunca más allá.
  if p_previous is not null and p_previous > v_ceiling then
    v_ceiling := p_previous;
  end if;
  if v_remaining <= v_ceiling then
    v_target := least(v_target, v_ceiling);
  end if;

  update public.ai_settings
     set credits_remaining = v_target,
         updated_at = now()
   where organization_id = p_org_id;

  return true;
end;
$function$;

-- 8. Compras: se acreditan una sola vez (un UPDATE completed → completed
--    volvía a sumar).
create or replace function public.sync_ai_credits_to_settings()
returns trigger
language plpgsql
as $function$
begin
  if NEW.status = 'completed' and (TG_OP = 'INSERT' or OLD.status is distinct from 'completed') then
    insert into ai_settings (organization_id, credits_remaining, purchased_credits, updated_at)
    values (NEW.organization_id, NEW.credits_amount, NEW.credits_amount, now())
    on conflict (organization_id)
    do update set
      credits_remaining = coalesce(ai_settings.credits_remaining, 0) + NEW.credits_amount,
      purchased_credits = coalesce(ai_settings.purchased_credits, 0) + NEW.credits_amount,
      updated_at = now();
  end if;
  return NEW;
end;
$function$;

-- 9. Saldos de este mes: se quita el arrastre que se sumó el 1 de octubre.
--    saldo = min(saldo actual, cupo del mes + comprados que quedan). Lo ya
--    consumido del mes se respeta (si gastaron, el saldo ya es menor).
with x as (
  select s.organization_id,
         q.monthly,
         least(coalesce(s.purchased_credits, 0), greatest(coalesce(s.credits_remaining, 0), 0)) as comprados
    from public.ai_settings s
   cross join lateral public.fn_ai_plan_quota(s.organization_id) q
)
update public.ai_settings a
   set purchased_credits    = x.comprados,
       credits_remaining    = least(coalesce(a.credits_remaining, 0), x.monthly + x.comprados),
       last_rollover_amount = 0,
       updated_at           = now()
  from x
 where a.organization_id = x.organization_id
   and x.monthly > 0 -- sin cupo de plan no se recorta (mismo criterio que la renovación)
   and (coalesce(a.credits_remaining, 0) > x.monthly + x.comprados
        or coalesce(a.last_rollover_amount, 0) <> 0
        or coalesce(a.purchased_credits, 0) <> x.comprados);

-- 10. El cron viejo renovó a las 00:05 UTC del 1 de octubre, que en
--     Colombia todavía era 30 de septiembre: sin esto, la primera pasada del
--     cron nuevo volvería a renovar octubre y borraría lo consumido del mes.
update public.ai_settings a
   set credits_reset_at = public.fn_ai_credits_inicio_periodo(a.organization_id)
 where a.credits_reset_at is not null
   and a.credits_reset_at <  public.fn_ai_credits_inicio_periodo(a.organization_id)
   and a.credits_reset_at >= public.fn_ai_credits_inicio_periodo(a.organization_id) - interval '1 day';
