-- 20260914120000_revoke_fn_org_alias_authenticated.sql
-- F-sec: fn_org_alias con EXECUTE para authenticated = reidentificacion 100%
--
-- fn_org_alias(client_id integer) es SECURITY DEFINER y contiene la sal
-- de anonimizacion. El alias se materializa en entity_alias durante el
-- REFRESH de la matview; el portal lee esa columna, nunca invoca la
-- funcion. authenticated jamas necesito EXECUTE.
--
-- Con el ACL anterior (postgres + authenticated + service_role), cualquier
-- inversionista autenticado podia hacer:
--   select n, public.fn_org_alias(n) from generate_series(1,500) n;
-- y reproducir 20 de 20 alias publicados en mv_investor_revenue_concentration.
-- 100% de reidentificacion en una sola consulta. Rotar la sal no mitiga:
-- el atacante usa la funcion que la contiene.
--
-- Fix: revoke execute from public/anon/authenticated, grant to postgres+service_role.
-- El cron y el refresh corren como postgres/service_role: siguen funcionando.
--
-- Verificacion (aplicada via Supabase MCP, project jgmgphmzusbluqhuqihj):
--   ACL antes: postgres=X | authenticated=X | service_role=X
--   ACL despues: postgres=X | service_role=X
--   fn_refresh_investor_matviews(): OK (sin error)
--   mv_investor_revenue_concentration: 20 filas, 20 alias distintos (intacto)
--   Prueba negativa como authenticated:
--     set local role authenticated;
--     select public.fn_org_alias(1);
--     -> ERROR 42501: permission denied for function fn_org_alias

revoke execute on function public.fn_org_alias(integer)
  from public, anon, authenticated;
grant execute on function public.fn_org_alias(integer)
  to postgres, service_role;
