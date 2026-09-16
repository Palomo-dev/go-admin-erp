-- =============================================================================
-- crm_v4_f00_43_cupo_plan_ia_unica_fuente
-- F0-REG ronda 3 (QA r2: medio 1, bajo 6 y «qué falta para el 10»).
--
-- Problema: el «cupo mensual de créditos de IA» de una organización se
-- calculaba en TRES sitios con reglas distintas (regla 7 de CLAUDE.md):
--   - `sync_ai_credits_on_subscription` (trigger): solo `plans.ai_credits_monthly`
--     por `NEW.plan_id`; ignoraba `custom_config` de enterprise; en conflicto
--     no ponía `credits_reset_at` y, con saldo NULL, el CASE dejaba NULL.
--   - `fn_reset_monthly_ai_credits` (cron día 1): leía SOLO
--     `custom_config->>'ai_credits'`; 6 suscripciones enterprise guardan la
--     clave como `aiCredits` (camelCase) → cupo 0 → nunca se les reponía.
--   - `aiCreditsService.getAIFeaturesForOrganization` (Node): 10 000 por defecto
--     si no había suscripción o si `.single()` fallaba (2 orgs tienen dos
--     suscripciones activas → error → 10 000 regalados); enterprise con
--     `aiCredits: 0` → 10 000.
-- Y `ensureAiSettings` solo cubría la fila AUSENTE: una fila creada desde el
-- navegador (`/app/chat/ia/configuracion` escribe solo columnas de
-- comportamiento; nace con `credits_remaining = 0` y `credits_reset_at NULL`)
-- recibía 402 en todo cobro del CRM hasta el cron del día 1.
--
-- Solución: UNA fuente en SQL y dos operaciones sobre ella.
--
--   1. fn_ai_plan_quota(p_org) → (monthly, max_rollover, model, max_tokens, source)
--      Regla consolidada:
--        · suscripción = la activa/en prueba más reciente de la org (si no
--          hay ninguna activa, la más reciente; sin suscripción → 0, 'none');
--        · si `metadata.custom_config.ai_credits` o `.aiCredits` es un entero
--          (INCLUIDO 0) → monthly = ese valor, max_rollover = least(2×, 100 000),
--          source = 'custom_config';
--        · si no → `plans.ai_credits_monthly` / `ai_credits_max_rollover`
--          (coalesce 0), source = 'plan';
--        · model / max_tokens del plan (defaults de la columna si son NULL).
--      Efecto sobre datos reales (verificado por MCP el 2026-09-15 sobre 84
--      orgs): 82 orgs conservan el mismo cupo que hoy en las tres capas; las
--      6 enterprise con `aiCredits: 10000` pasan de 0 (cron) a 10 000 en el
--      cron (Node ya les daba 10 000); las 2 enterprise en prueba con
--      `aiCredits: 0` pasan de 10 000 (Node) a 0 (lo que dice su configuración;
--      cron ya daba 0). Ninguna de esas 2 tiene fila en ai_settings.
--
--   2. fn_provision_ai_settings(p_org) → jsonb
--      {created, provisioned, credits_remaining, model, max_tokens, monthly, source}
--      · sin fila → INSERT con el cupo (ON CONFLICT DO NOTHING: carrera benigna);
--      · fila con `credits_reset_at IS NULL` → UPDATE credits_remaining =
--        greatest(saldo, cupo), credits_reset_at = now() — el filtro hace la
--        operación idempotente: dos peticiones concurrentes provisionan UNA vez;
--      · fila provisionada → no toca nada, devuelve el estado.
--      La usa `aiCreditsService.ensureAiSettings` (y por ella `chargeAiCredits`
--      y `checkAICredits`). Mientras esta migración no esté aplicada, Node hace
--      lo mismo con insert/update (respaldo).
--
--   3. sync_ai_credits_on_subscription y fn_reset_monthly_ai_credits se
--      reescriben para leer el cupo de fn_ai_plan_quota. Conservan su
--      comportamiento propio: el trigger sube el saldo al cupo si es mayor y
--      no reescribe `model` (comentario original); el cron aplica
--      mensual + rollover acotado + comprados y salta si ambos son 0. Se
--      corrige de paso que el cron devolvía `monthly_credits` NULL (la variable
--      local hacía sombra a la columna de salida).
--
-- Todas SECURITY DEFINER con `set search_path = public`; EXECUTE revocado a
-- public/anon/authenticated y concedido solo a service_role (el trigger y el
-- cron corren como owner). La pertenencia a la organización la garantiza el
-- llamador (service client con la org de sesión).
--
-- Idempotente: CREATE OR REPLACE. No toca datos por sí misma (los cupos se
-- aplican cuando el cobro, el trigger o el cron llamen a las funciones).
-- Rollback: supabase/rollbacks/20260915235000_crm_v4_f00_43_cupo_plan_ia_unica_fuente_rollback.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. fn_ai_plan_quota: la única regla del cupo del plan.
-- -----------------------------------------------------------------------------
create or replace function public.fn_ai_plan_quota(p_org integer)
returns table (monthly integer, max_rollover integer, model text, max_tokens integer, source text)
language sql
stable
security definer
set search_path to 'public'
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

revoke all on function public.fn_ai_plan_quota(integer) from public, anon, authenticated;
grant execute on function public.fn_ai_plan_quota(integer) to service_role;

comment on function public.fn_ai_plan_quota(integer) is
  'Cupo mensual de créditos de IA de una organización: custom_config.ai_credits/aiCredits (entero, incluido 0) o plans.ai_credits_monthly; sin suscripción → 0. Única fuente para trigger, cron y app. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. fn_provision_ai_settings: crea o provisiona la fila con ese cupo.
-- -----------------------------------------------------------------------------
create or replace function public.fn_provision_ai_settings(p_org integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q            record;
  r            record;
  v_created     boolean := false;
  v_provisioned boolean := false;
begin
  if p_org is null or not exists (select 1 from public.organizations o where o.id = p_org) then
    return jsonb_build_object('created', false, 'provisioned', false, 'credits_remaining', 0,
                              'model', null, 'max_tokens', null, 'monthly', 0, 'source', 'none');
  end if;

  select * into q from public.fn_ai_plan_quota(p_org);

  insert into public.ai_settings (organization_id, credits_remaining, credits_reset_at, provider, model, max_tokens, is_active)
  values (p_org, q.monthly, now(), 'openai', q.model, q.max_tokens, true)
  on conflict (organization_id) do nothing;

  if found then
    v_created := true;
    v_provisioned := true;
  else
    -- Fila «vacía» del navegador: solo si nadie la ha provisionado todavía.
    update public.ai_settings
       set credits_remaining = greatest(coalesce(credits_remaining, 0), q.monthly),
           credits_reset_at  = now(),
           updated_at        = now()
     where organization_id = p_org
       and credits_reset_at is null;
    if found then
      v_provisioned := true;
    end if;
  end if;

  select credits_remaining, model, max_tokens
    into r
    from public.ai_settings
   where organization_id = p_org;

  return jsonb_build_object(
    'created',           v_created,
    'provisioned',       v_provisioned,
    'credits_remaining', coalesce(r.credits_remaining, 0),
    'model',             r.model,
    'max_tokens',        r.max_tokens,
    'monthly',           q.monthly,
    'source',            q.source
  );
end;
$function$;

revoke all on function public.fn_provision_ai_settings(integer) from public, anon, authenticated;
grant execute on function public.fn_provision_ai_settings(integer) to service_role;

comment on function public.fn_provision_ai_settings(integer) is
  'Garantiza la fila ai_settings provisionada con el cupo de fn_ai_plan_quota: la crea si falta o, si credits_reset_at es NULL, asigna greatest(saldo, cupo) y fecha de reset. Idempotente. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3a. Trigger de suscripciones: mismo comportamiento, cupo de la fuente única.
-- -----------------------------------------------------------------------------
create or replace function public.sync_ai_credits_on_subscription()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q record;
begin
  if NEW.status in ('active', 'trialing') then
    select * into q from public.fn_ai_plan_quota(NEW.organization_id);

    insert into public.ai_settings (
      organization_id, credits_remaining, credits_reset_at,
      model, max_tokens, provider, is_active
    )
    values (
      NEW.organization_id, q.monthly, now(),
      q.model, q.max_tokens, 'openai', true
    )
    on conflict (organization_id)
    do update set
      -- Sube el saldo al cupo si es mayor (saldo NULL cuenta como 0; antes el
      -- CASE con NULL dejaba NULL). No reescribe el modelo elegido por la org.
      credits_remaining = greatest(coalesce(ai_settings.credits_remaining, 0), excluded.credits_remaining),
      credits_reset_at  = coalesce(ai_settings.credits_reset_at, now()),
      is_active         = true;
  end if;

  return NEW;
end;
$function$;

revoke all on function public.sync_ai_credits_on_subscription() from public, anon, authenticated;
grant execute on function public.sync_ai_credits_on_subscription() to service_role;

comment on function public.sync_ai_credits_on_subscription() is
  'Sincroniza los creditos del plan hacia ai_settings (cupo de fn_ai_plan_quota). NO reescribe el modelo elegido por la organizacion: solo lo fija al crear la fila.';

-- -----------------------------------------------------------------------------
-- 3b. Cron mensual: mismo comportamiento, cupo de la fuente única.
-- -----------------------------------------------------------------------------
create or replace function public.fn_reset_monthly_ai_credits()
returns table (organization_id_updated integer, monthly_credits integer, rollover_applied integer, purchased_preserved integer, new_total integer)
language plpgsql
security definer
set search_path to 'public'
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

    -- Sin cupo mensual y sin comprados: nada que reponer.
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

    raise notice 'Org %: monthly=%, rollover=%, purchased=%, total=%',
      rec.organization_id, v_monthly, v_rollover, v_purchased, v_new_total;
  end loop;
end;
$function$;

revoke all on function public.fn_reset_monthly_ai_credits() from public, anon, authenticated;
grant execute on function public.fn_reset_monthly_ai_credits() to service_role;

comment on function public.fn_reset_monthly_ai_credits() is
  'Resetea créditos IA mensualmente con el cupo de fn_ai_plan_quota. Preserva purchased_credits. Aplica rollover según plan.';

commit;

-- -----------------------------------------------------------------------------
-- Verificación (SELECT, MCP) — <org> = una org con suscripción y fila:
--   select * from fn_ai_plan_quota(<org>);
--     -- monthly = plans.ai_credits_monthly (o custom_config), source 'plan'/'custom_config'
--   select * from fn_ai_plan_quota(-1);                -- 0, 0, 'gpt-4o-mini', 1000, 'none'
--   select fn_provision_ai_settings(<org>);           -- provisioned=false (fila ya provisionada), saldo intacto
--   select fn_provision_ai_settings(-1);              -- created=false, provisioned=false, credits_remaining 0
--   select count(*) from ai_settings where credits_reset_at is null;   -- 0
--   select p.oid::regprocedure, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('fn_ai_plan_quota','fn_provision_ai_settings','sync_ai_credits_on_subscription','fn_reset_monthly_ai_credits');
--     -- 4 filas; proacl solo postgres y service_role.
--   -- Comparación de cupos antes/después (debe coincidir salvo los casos del encabezado):
--   select q.source, count(*) from organizations o, lateral fn_ai_plan_quota(o.id) q group by 1;
-- Dentro de begin; … rollback; con una fila «vacía» simulada:
--   insert into ai_settings (organization_id, temperature) values (<org sin fila>, 0.7);
--   select fn_provision_ai_settings(<org sin fila>);  -- provisioned=true, credits_remaining = cupo
--   select fn_provision_ai_settings(<org sin fila>);  -- provisioned=false (idempotente)
-- -----------------------------------------------------------------------------
