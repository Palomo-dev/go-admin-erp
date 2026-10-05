-- Reversión de 20261005173738_creditos_ia_renovacion_mensual.
-- Restaura saldos, arrastre de los planes, cron y funciones anteriores.
-- Ojo: devuelve los saldos al 2026-10-05; lo consumido después se pierde.

-- Saldos y arrastre de los planes desde la copia.
update public.ai_settings a
   set credits_remaining    = c.credits_remaining,
       purchased_credits    = c.purchased_credits,
       last_rollover_amount = c.last_rollover_amount,
       credits_reset_at     = c.credits_reset_at,
       updated_at           = now()
  from public.ai_credits_ajuste_20261005 c
 where c.organization_id = a.organization_id;

update public.plans p
   set ai_credits_max_rollover = c.ai_credits_max_rollover
  from public.ai_credits_ajuste_20261005_planes c
 where c.plan_id = p.id;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'reset-monthly-ai-credits';
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := '5 0 1 * *');
  end if;
end $$;

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
    greatest(coalesce(q.custom, pl.ai_credits_monthly, 0), 0)                              as monthly,
    case when q.custom is not null then least(q.custom * 2, 100000)
         else greatest(coalesce(pl.ai_credits_max_rollover, 0), 0) end                     as max_rollover,
    coalesce(pl.ai_model, 'gpt-4o-mini')                                                    as model,
    coalesce(pl.ai_max_tokens, 1000)                                                        as max_tokens,
    case when q.plan_id is null then 'none'
         when q.custom is not null then 'custom_config'
         else 'plan' end                                                                    as source
  from (select 1) as one
  left join q on true
  left join public.plans pl on pl.id = q.plan_id;
$function$;

create or replace function public.decrement_ai_credits(p_org_id integer, p_cost integer)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_remaining integer;
begin
  if p_org_id is null or p_cost is null or p_cost < 0 then
    return false;
  end if;

  select credits_remaining into v_remaining
    from ai_settings
   where organization_id = p_org_id
     for update;

  if not found then
    return false;
  end if;

  v_remaining := coalesce(v_remaining, 0);

  if v_remaining < p_cost then
    return false;
  end if;

  update ai_settings
     set credits_remaining = v_remaining - p_cost
   where organization_id = p_org_id;

  return true;
end;
$function$;

create or replace function public.fn_reset_monthly_ai_credits()
returns table(organization_id_updated integer, monthly_credits integer, rollover_applied integer, purchased_preserved integer, new_total integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  rec               record;
  q                 record;
  v_monthly         integer;
  v_max_rollover    integer;
  v_purchased       integer;
  v_current         integer;
  v_unused_monthly  integer;
  v_rollover        integer;
  v_new_total       integer;
begin
  for rec in
    select s.organization_id, s.credits_remaining, s.purchased_credits
      from public.ai_settings s
  loop
    select * into q from public.fn_ai_plan_quota(rec.organization_id);
    v_monthly      := q.monthly;
    v_max_rollover := q.max_rollover;
    v_purchased    := coalesce(rec.purchased_credits, 0);

    if v_monthly = 0 and v_purchased = 0 then
      continue;
    end if;

    v_current        := coalesce(rec.credits_remaining, 0);
    v_unused_monthly := greatest(0, v_current - v_purchased);
    v_rollover       := least(v_unused_monthly, v_max_rollover);
    v_new_total      := v_monthly + v_rollover + v_purchased;

    update public.ai_settings
       set credits_remaining    = v_new_total,
           credits_reset_at     = now(),
           last_rollover_amount = v_rollover,
           updated_at           = now()
     where organization_id = rec.organization_id;

    organization_id_updated := rec.organization_id;
    monthly_credits         := v_monthly;
    rollover_applied        := v_rollover;
    purchased_preserved     := v_purchased;
    new_total               := v_new_total;
    return next;
  end loop;
end;
$function$;

create or replace function public.refund_ai_credits(p_org_id integer, p_amount integer, p_previous integer default null::integer)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_remaining integer;
  v_purchased integer;
  v_cap       integer;
  v_ceiling   integer;
  v_amount    integer := p_amount;
  v_target    integer;
begin
  if p_org_id is null or p_amount is null or p_amount < 0 then
    return false;
  end if;

  select credits_remaining, coalesce(purchased_credits, 0)
    into v_remaining, v_purchased
    from public.ai_settings
   where organization_id = p_org_id
     for update;

  if not found then
    return false;
  end if;

  if v_amount = 0 then
    return true;
  end if;

  v_remaining := coalesce(v_remaining, 0);
  v_target    := v_remaining + v_amount;

  select pl.ai_credits_max_rollover
    into v_cap
    from public.organizations o
    join public.plans pl on pl.id = o.plan_id
   where o.id = p_org_id;

  if v_cap is not null then
    v_ceiling := v_cap + v_purchased;
    if p_previous is not null and p_previous > v_ceiling then
      v_ceiling := p_previous;
    end if;
    if v_remaining <= v_ceiling then
      v_target := least(v_target, v_ceiling);
    end if;
  end if;

  update public.ai_settings
     set credits_remaining = v_target,
         updated_at = now()
   where organization_id = p_org_id;

  return true;
end;
$function$;

create or replace function public.sync_ai_credits_to_settings()
returns trigger
language plpgsql
as $function$
BEGIN
  IF NEW.status = 'completed' THEN
    INSERT INTO ai_settings (organization_id, credits_remaining, purchased_credits, updated_at)
    VALUES (NEW.organization_id, NEW.credits_amount, NEW.credits_amount, NOW())
    ON CONFLICT (organization_id)
    DO UPDATE SET
      credits_remaining = ai_settings.credits_remaining + NEW.credits_amount,
      purchased_credits = ai_settings.purchased_credits + NEW.credits_amount,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$function$;

drop function if exists public.fn_renovar_creditos_ia(integer);
drop function if exists public.fn_ai_credits_proxima_renovacion(integer);
drop function if exists public.fn_ai_credits_inicio_periodo(integer);

-- Las copias se conservan hasta confirmar la reversión; después:
-- drop table public.ai_credits_ajuste_20261005;
-- drop table public.ai_credits_ajuste_20261005_planes;
