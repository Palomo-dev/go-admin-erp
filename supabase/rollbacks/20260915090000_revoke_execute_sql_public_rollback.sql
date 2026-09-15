-- Rollback de 20260915090000_revoke_execute_sql_public.sql
-- ADVERTENCIA: reintroduce RCE como postgres para anon.
-- Usar solo si el fix causa un fallo critico.

revoke execute on function public.execute_sql(sql_query text) from postgres, service_role;
grant execute on function public.execute_sql(sql_query text)
  to public, anon, authenticated, postgres, service_role;
