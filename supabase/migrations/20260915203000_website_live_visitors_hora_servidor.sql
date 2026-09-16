-- Visitantes en vivo de la tienda web: contados con la hora del SERVIDOR.
--
-- El dashboard calculaba "últimos 5 minutos" con el reloj del navegador y
-- mandaba ese instante como filtro (created_at >= <hora del PC> - 5 min).
-- Con un PC atrasado (caso real del 2026-09-15: casi 9 horas) el badge
-- mostraba 1.783 "visitantes en vivo" para una tienda con ~8 sesiones
-- reales en esos 5 minutos. Además contaba filas (páginas vistas), no
-- personas: aquí se cuentan sesiones distintas.
--
-- SECURITY INVOKER a propósito: aplica la RLS de website_visits (solo
-- miembros activos de la organización ven sus visitas); quien no es miembro
-- obtiene 0 sin necesidad de una guarda de pertenencia propia.

create or replace function public.website_live_visitors(
  p_organization_id integer,
  p_minutes integer default 5
)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct v.session_id)::integer
  from public.website_visits v
  where v.organization_id = p_organization_id
    and v.created_at >= now() - make_interval(mins => least(greatest(coalesce(p_minutes, 5), 1), 60));
$$;

comment on function public.website_live_visitors(integer, integer) is
  'Sesiones distintas con visitas en los últimos p_minutes (1–60, default 5), según el reloj del servidor. RLS del invocador.';

revoke execute on function public.website_live_visitors(integer, integer) from public, anon;
grant execute on function public.website_live_visitors(integer, integer) to authenticated, service_role;
