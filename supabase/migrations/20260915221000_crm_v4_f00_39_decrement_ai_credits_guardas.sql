-- =============================================================================
-- crm_v4_f00_39_decrement_ai_credits_guardas
-- F0-REG ronda 2 (QA r1: altos 3 y 4, medios 10 y 11).
--
-- Contiene cuatro piezas, todas sobre el saldo de IA y su lectura agregada:
--
--   1. decrement_ai_credits(p_org_id, p_cost): guardas de importe.
--      Antes: `IF v_remaining < p_cost` con p_cost NULL no entraba en el
--      `RETURN false` (NULL < x es NULL) y el UPDATE dejaba
--      credits_remaining = NULL → organización ilimitada. Y sin fila de
--      ai_settings lanzaba RAISE EXCEPTION (500 en la app, no 402).
--      Ahora: NULL o negativo → false; sin fila → false; saldo NULL se trata
--      como 0. Firma, SECURITY DEFINER, search_path y ACL se conservan.
--
--   2. refund_ai_credits(p_org_id, p_amount, p_previous default null):
--      el techo `ai_credits_max_rollover + purchased` se aplicaba mirando el
--      saldo posterior al cobro; una org con 503 (techo 500) que pagaba 10 y
--      recibía el reembolso quedaba en 500 (perdía 3). Con p_previous (saldo
--      antes del cobro, lo pasa aiCostService cuando lo conoce) el techo
--      efectivo es GREATEST(techo, p_previous): nunca se recorta por debajo
--      de lo que la org ya tenía. Sin p_previous, comportamiento anterior.
--      QA r2 (bajo 4): p_amount NULL o negativo → false (antes: true sin tocar
--      el saldo). p_amount = 0 sigue devolviendo true sin cambios.
--      Postgres no permite CREATE OR REPLACE cambiando la lista de parámetros
--      (crearía una segunda sobrecarga y `rpc('refund_ai_credits')` con dos
--      argumentos sería ambigua), por eso se hace DROP + CREATE.
--
--   3. fn_ai_usage_month(p_org, p_since, p_tz) y
--   4. fn_comm_usage_month(p_org, p_since):
--      agregados del consumo del mes en SQL (antes GET /credits traía hasta
--      5 000 filas y sumaba en Node: una org con auto-respuesta activa supera
--      esa cifra y el total quedaba truncado en silencio). `by_day` corta por
--      el día calendario de la zona horaria de la organización
--      (`(created_at at time zone p_tz)::date`). El costo lee
--      `coalesce(cost_amount, metadata->>'cost_amount')`: la columna la escribe
--      la Edge Function del chat desde antes y aiCostService desde esta ronda;
--      `metadata.cost_amount` se mantiene una ronda por compatibilidad.
--      Contrato: `metadata.cost_amount` solo cuenta si es un NÚMERO jsonb
--      (`jsonb_typeof = 'number'`); un texto como "9.99" se descarta (mismo
--      criterio que el respaldo en Node: `typeof === 'number'`). En BD no
--      existe ningún valor en texto (verificado 2026-09-15).
--      Zona horaria (QA r2, medio 2; QA r3, punto 2): `p_tz` se resuelve UNA
--      vez (no por fila) con el helper `fn_resolve_timezone` (pieza 0), que
--      valida con `at time zone` en plpgsql: zona desconocida, vacía o NULL →
--      'UTC'. Nunca `22023 time zone not recognized`: Intl (ICU) y Postgres
--      no comparten catálogo y una zona válida para Node no puede tumbar
--      GET /credits ni el cobro con presupuesto. La ronda 3 lo hacía con una
--      CTE sobre `pg_timezone_names`, que materializa ~1 200 filas en cada
--      llamada (medido por el QA: 59,9 ms frente a 0,2 ms del helper); lo
--      pagaba cada GET /credits y cada cobro con presupuesto configurado.
--      SOLO LECTURA sobre ai_usage_logs/comm_usage_logs: no toca grants ni
--      políticas de esas tablas (los cierra F0-DB r3, mig. 36).
--
--   0. fn_resolve_timezone(p_tz text) returns text: helper de la pieza 3.
--      plpgsql STABLE, SIN SECURITY DEFINER (no lee tablas ni eleva nada),
--      `set search_path = public`. `at time zone` acepta lo mismo que antes
--      aceptaba el catálogo (minúsculas, abreviaturas como EST) y además las
--      especificaciones POSIX que Postgres entiende; el nombre devuelto ya no
--      se canoniza en mayúsculas, lo cual no afecta a `by_day` (Postgres no
--      distingue mayúsculas en `at time zone`). EXECUTE: revocado a
--      public/anon/authenticated y concedido a service_role, igual que las
--      demás. Decisión: hoy solo la invoca `fn_ai_usage_month` (SECURITY
--      DEFINER del owner `postgres`, que ejecuta el helper como owner sin
--      necesitar grant); el grant a service_role queda para que las rutas con
--      service client puedan llamarla directamente si hace falta. Ningún
--      cliente de sesión (`authenticated`) la necesita: la zona que la app
--      escribe la valida el trigger de la 44 contra `pg_timezone_names`.
--
-- Las funciones 1–4: SECURITY DEFINER, `set search_path = public`, EXECUTE
-- revocado a public/anon/authenticated y concedido solo a service_role. La
-- pertenencia a la organización la garantiza el llamador (rutas con
-- getServerOrgContext + service client); ningún cliente de sesión puede
-- invocarlas.
--
-- Idempotente: CREATE OR REPLACE / DROP IF EXISTS.
-- Rollback: supabase/rollbacks/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas_rollback.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. fn_resolve_timezone: nombre de zona utilizable en `at time zone`, o 'UTC'.
--    Sub-milisegundo: un `perform … at time zone` dentro de un bloque con
--    excepción, en vez de recorrer pg_timezone_names.
-- -----------------------------------------------------------------------------
create or replace function public.fn_resolve_timezone(p_tz text)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v text := nullif(btrim(p_tz), '');
begin
  if v is null then
    return 'UTC';
  end if;
  -- Si Postgres no reconoce la zona lanza 22023 (invalid_parameter_value);
  -- se captura y se cae a UTC. Cualquier otra excepción se propaga.
  perform now() at time zone v;
  return v;
exception
  when invalid_parameter_value then
    return 'UTC';
end;
$function$;

revoke all on function public.fn_resolve_timezone(text) from public, anon, authenticated;
grant execute on function public.fn_resolve_timezone(text) to service_role;

comment on function public.fn_resolve_timezone(text) is
  'Devuelve p_tz recortada si Postgres la acepta en `at time zone`; NULL, vacía o desconocida → ''UTC''. Nunca 22023. Helper de fn_ai_usage_month; solo service_role.';

-- -----------------------------------------------------------------------------
-- 1. decrement_ai_credits: guardas de importe y de fila ausente.
-- -----------------------------------------------------------------------------
create or replace function public.decrement_ai_credits(p_org_id integer, p_cost integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_remaining integer;
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

  update ai_settings
     set credits_remaining = v_remaining - p_cost
   where organization_id = p_org_id;

  return true;
end;
$function$;

revoke all on function public.decrement_ai_credits(integer, integer) from public, anon, authenticated;
grant execute on function public.decrement_ai_credits(integer, integer) to service_role;

comment on function public.decrement_ai_credits(integer, integer) is
  'Debita créditos de IA con FOR UPDATE. false si el importe es NULL/negativo, si no hay fila de ai_settings o si el saldo no alcanza. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 2. refund_ai_credits con p_previous (saldo antes del cobro).
-- -----------------------------------------------------------------------------
drop function if exists public.refund_ai_credits(integer, integer);

create function public.refund_ai_credits(p_org_id integer, p_amount integer, p_previous integer default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_remaining integer;
  v_purchased integer;
  v_cap       integer;
  v_ceiling   integer;
  v_amount    integer := p_amount;
  v_target    integer;
begin
  -- Simetría con decrement_ai_credits (QA r2 bajo 4): NULL o negativo → false,
  -- nunca un `true` silencioso que haga creer al llamador que reembolsó.
  -- 0 sigue siendo no-op con `true` (nada que devolver).
  if p_org_id is null or p_amount is null or p_amount < 0 then
    return false;
  end if;

  select credits_remaining, coalesce(purchased_credits, 0)
    into v_remaining, v_purchased
    from public.ai_settings
   where organization_id = p_org_id
     for update; -- mismo bloqueo de fila que decrement_ai_credits

  if not found then
    return false; -- sin ai_settings no hay saldo que reembolsar
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
    -- QA r1 medio 10: si la org ya estaba por encima del techo antes del
    -- cobro (rollover mensual), el reembolso puede devolverla hasta ese
    -- saldo previo, nunca más allá.
    if p_previous is not null and p_previous > v_ceiling then
      v_ceiling := p_previous;
    end if;
    -- Solo se aplica si el saldo actual todavía no supera el techo efectivo.
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

revoke all on function public.refund_ai_credits(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.refund_ai_credits(integer, integer, integer) to service_role;

comment on function public.refund_ai_credits(integer, integer, integer) is
  'Reembolsa créditos de IA acotando al techo del plan; p_previous (saldo antes del cobro) evita recortar por debajo de lo que la org ya tenía. false si p_amount es NULL/negativo o no hay fila. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. fn_ai_usage_month: consumo de IA del periodo agregado en SQL.
--    Devuelve jsonb:
--    { spent_usd, spent_credits, rows,
--      by_model: [{model, credits, cost_usd, tokens, calls}],
--      by_day:   [{day, credits, cost_usd}] }
--    `calls` cuenta solo filas con credits_consumed > 0 (los reembolsos y las
--    filas `:refund_failed` con 0 no son llamadas).
-- -----------------------------------------------------------------------------
create or replace function public.fn_ai_usage_month(p_org integer, p_since timestamptz, p_tz text default 'UTC')
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Zona resuelta una sola vez (no por fila) con fn_resolve_timezone:
  -- p_tz si Postgres la acepta, 'UTC' si no. Evita 22023 con zonas que Intl
  -- acepta y Postgres no, sin recorrer pg_timezone_names (QA r3 punto 2).
  with tz as (
    select public.fn_resolve_timezone(p_tz) as name
  ),
  base as (
    select
      coalesce(l.model, 'desconocido') as model,
      coalesce(l.credits_consumed, 0) as credits,
      coalesce(l.total_tokens, 0) as tokens,
      coalesce(
        l.cost_amount,
        case when jsonb_typeof(l.metadata -> 'cost_amount') = 'number'
             then (l.metadata ->> 'cost_amount')::numeric end,
        0
      ) as usd,
      (l.created_at at time zone tz.name)::date as day
    from public.ai_usage_logs l
    cross join tz
    where l.organization_id = p_org
      and l.created_at >= p_since
  ),
  by_model as (
    select model,
           sum(credits) as credits,
           sum(usd) as cost_usd,
           sum(tokens) as tokens,
           count(*) filter (where credits > 0) as calls
      from base
     group by model
  ),
  by_day as (
    select day, sum(credits) as credits, sum(usd) as cost_usd
      from base
     group by day
  )
  select jsonb_build_object(
    'spent_usd',     coalesce((select sum(usd) from base), 0),
    'spent_credits', coalesce((select sum(credits) from base), 0),
    'rows',          (select count(*) from base),
    'by_model',      coalesce((select jsonb_agg(jsonb_build_object(
                        'model', model, 'credits', credits, 'cost_usd', cost_usd,
                        'tokens', tokens, 'calls', calls) order by credits desc)
                        from by_model), '[]'::jsonb),
    'by_day',        coalesce((select jsonb_agg(jsonb_build_object(
                        'day', to_char(day, 'YYYY-MM-DD'), 'credits', credits, 'cost_usd', cost_usd)
                        order by day)
                        from by_day), '[]'::jsonb)
  );
$function$;

revoke all on function public.fn_ai_usage_month(integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fn_ai_usage_month(integer, timestamptz, text) to service_role;

comment on function public.fn_ai_usage_month(integer, timestamptz, text) is
  'Consumo de IA de una organización desde p_since, agregado por modelo y por día calendario de p_tz (zona resuelta con `at time zone` en plpgsql por fn_resolve_timezone; desconocida, vacía o NULL → UTC; nunca 22023). Costo = coalesce(cost_amount, metadata.cost_amount solo si es número jsonb). Solo service_role.';

-- -----------------------------------------------------------------------------
-- 4. fn_comm_usage_month: consumo de comunicaciones del periodo.
--    { spent_usd, rows, by_channel: [{channel, credits, cost_usd, count}] }
-- -----------------------------------------------------------------------------
create or replace function public.fn_comm_usage_month(p_org integer, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select
      l.channel,
      coalesce(l.credits_used, 0) as credits,
      coalesce(
        l.cost_amount,
        case when jsonb_typeof(l.metadata -> 'cost_amount') = 'number'
             then (l.metadata ->> 'cost_amount')::numeric end,
        0
      ) as usd
    from public.comm_usage_logs l
    where l.organization_id = p_org
      and l.created_at >= p_since
  ),
  by_channel as (
    select channel, sum(credits) as credits, sum(usd) as cost_usd, count(*) as count
      from base
     group by channel
  )
  select jsonb_build_object(
    'spent_usd',  coalesce((select sum(usd) from base), 0),
    'rows',       (select count(*) from base),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object(
                     'channel', channel, 'credits', credits, 'cost_usd', cost_usd, 'count', count)
                     order by channel)
                     from by_channel), '[]'::jsonb)
  );
$function$;

revoke all on function public.fn_comm_usage_month(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_comm_usage_month(integer, timestamptz) to service_role;

comment on function public.fn_comm_usage_month(integer, timestamptz) is
  'Consumo de comunicaciones de una organización desde p_since, agregado por canal. Costo = coalesce(cost_amount, metadata.cost_amount). Solo service_role.';

commit;

-- -----------------------------------------------------------------------------
-- Verificación (SELECT, MCP) — con una org de prueba <org>:
--   select decrement_ai_credits(<org>, null);          -- false
--   select decrement_ai_credits(<org>, -1);            -- false
--   select decrement_ai_credits(-1, 1);                -- false (sin fila, sin excepción)
--   select refund_ai_credits(<org>, null), refund_ai_credits(<org>, -5), refund_ai_credits(<org>, 0);
--     -- false, false, true (saldo intacto en los tres casos)
--   select credits_remaining is not null from ai_settings where organization_id = <org>;  -- true
--   select p.oid::regprocedure, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('fn_resolve_timezone','decrement_ai_credits','refund_ai_credits','fn_ai_usage_month','fn_comm_usage_month');
--     -- 5 filas; proacl solo postgres y service_role; refund_ai_credits con 3 parámetros.
--   select fn_resolve_timezone('America/Bogota'), fn_resolve_timezone('america/bogota'),
--          fn_resolve_timezone('  America/Bogota '), fn_resolve_timezone('EST'),
--          fn_resolve_timezone('Marte/Fobos'), fn_resolve_timezone(''), fn_resolve_timezone(null),
--          fn_resolve_timezone('America/Bogota; drop table x');
--     -- America/Bogota, america/bogota, America/Bogota, EST, UTC, UTC, UTC, UTC (sin error).
--   explain analyze select fn_resolve_timezone('Marte/Fobos');   -- Execution Time < 1 ms
--   explain analyze select fn_ai_usage_month(<org>, date_trunc('month', now()), 'America/Bogota');
--     -- Execution Time < 5 ms con pocas filas (antes: ~60 ms por pg_timezone_names).
--   select fn_ai_usage_month(<org>, date_trunc('month', now()), 'America/Bogota');
--     -- jsonb con spent_usd/spent_credits/rows/by_model/by_day.
--   select fn_ai_usage_month(<org>, date_trunc('month', now()), 'Marte/Fobos');
--     -- jsonb SIN error, con by_day cortado en UTC (zona desconocida → 'UTC').
--   select fn_ai_usage_month(<org>, date_trunc('month', now()), 'america/bogota');
--     -- mismo resultado que con 'America/Bogota' (`at time zone` no distingue mayúsculas).
--   select fn_ai_usage_month(<org>, date_trunc('month', now()), ''),
--          fn_ai_usage_month(<org>, date_trunc('month', now()), null);
--     -- iguales al resultado con 'UTC'.
-- Prueba del reembolso sin pérdida (dentro de begin; … rollback;):
--   saldo 503, techo 500: select decrement_ai_credits(<org>, 10); select refund_ai_credits(<org>, 10, 503);
--   → credits_remaining = 503 (antes quedaba en 500).
-- -----------------------------------------------------------------------------
