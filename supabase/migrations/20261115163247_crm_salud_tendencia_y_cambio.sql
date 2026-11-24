-- CRM · Salud de clientes (Figma 1415:19 «Panel — lista priorizada» y 1424:17 «Detalle»).
-- Dos lecturas sobre health_score_snapshots que la pantalla necesita y PostgREST no
-- puede expresar (DISTINCT ON por cliente y por semana):
--   * fn_health_tendencia_org: puntaje medio por semana (último snapshot de cada
--     cliente en cada semana, semanas en la zona horaria que pasa el llamador).
--   * fn_health_score_hace: último snapshot de cada cliente con al menos p_dias de
--     antigüedad («Cambio 30 d» y «Hace 30 días: 53»).
-- SECURITY INVOKER: la RLS de health_score_snapshots (pertenencia a la organización)
-- sigue aplicando. Nacen cerradas a anon. Aditiva: solo crea funciones.

create or replace function public.fn_health_tendencia_org(
  p_org_id integer,
  p_semanas integer default 12,
  p_tz text default 'America/Bogota'
)
returns table(semana date, puntaje_medio numeric, clientes integer)
language sql
stable
security invoker
set search_path = public
as $$
  with ventana as (
    select s.customer_id,
           s.score,
           s.created_at,
           date_trunc('week', s.created_at at time zone p_tz)::date as semana
      from health_score_snapshots s
     where s.organization_id = p_org_id
       and s.created_at >= (
             date_trunc('week', now() at time zone p_tz)
             - make_interval(weeks => greatest(1, least(coalesce(p_semanas, 12), 52)) - 1)
           ) at time zone p_tz
  ),
  ultimo as (
    select distinct on (v.semana, v.customer_id) v.semana, v.customer_id, v.score
      from ventana v
     order by v.semana, v.customer_id, v.created_at desc
  )
  select u.semana, round(avg(u.score), 1) as puntaje_medio, count(*)::integer as clientes
    from ultimo u
   group by u.semana
   order by u.semana;
$$;

comment on function public.fn_health_tendencia_org(integer, integer, text) is
  'Salud de clientes: puntaje medio semanal de la organización (último snapshot de cada cliente por semana). SECURITY INVOKER: aplica la RLS de health_score_snapshots.';

create or replace function public.fn_health_score_hace(
  p_org_id integer,
  p_dias integer default 30,
  p_customer_id uuid default null
)
returns table(customer_id uuid, score integer, band text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (s.customer_id) s.customer_id, s.score, s.band, s.created_at
    from health_score_snapshots s
   where s.organization_id = p_org_id
     and (p_customer_id is null or s.customer_id = p_customer_id)
     and s.created_at <= now() - make_interval(days => greatest(0, coalesce(p_dias, 30)))
     and s.created_at >= now() - make_interval(days => greatest(0, coalesce(p_dias, 30)) + 90)
   order by s.customer_id, s.created_at desc;
$$;

comment on function public.fn_health_score_hace(integer, integer, uuid) is
  'Salud de clientes: último snapshot de cada cliente con al menos p_dias de antigüedad (ventana de 90 días más). SECURITY INVOKER: aplica la RLS de health_score_snapshots.';

revoke all on function public.fn_health_tendencia_org(integer, integer, text) from public, anon;
revoke all on function public.fn_health_score_hace(integer, integer, uuid) from public, anon;
grant execute on function public.fn_health_tendencia_org(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_health_score_hace(integer, integer, uuid) to authenticated, service_role;
