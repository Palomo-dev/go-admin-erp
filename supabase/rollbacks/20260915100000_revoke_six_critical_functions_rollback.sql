-- Rollback de 20260915100000_revoke_six_critical_functions.sql
-- ADVERTENCIA: reintroduce RCE como postgres y falsificacion de contexto
-- de organizacion para anon. Usar solo si el fix causa un fallo critico.

-- Restaurar EXECUTE para PUBLIC (default de Postgres)
revoke execute on function public.execute_sql(sql_query text) from postgres, service_role;
grant execute on function public.execute_sql(sql_query text)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.reset_user_password(uuid, text) from postgres, service_role;
grant execute on function public.reset_user_password(uuid, text)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.execute_alert_condition(text, integer) from postgres, service_role;
grant execute on function public.execute_alert_condition(text, integer)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.test_alert_condition(text, integer) from postgres, service_role;
grant execute on function public.test_alert_condition(text, integer)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.set_config(text, text) from postgres, authenticated, service_role;
grant execute on function public.set_config(text, text)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.set_org_context(bigint) from postgres, authenticated, service_role;
grant execute on function public.set_org_context(bigint)
  to public, anon, authenticated, postgres, service_role;

revoke execute on function public.set_session_org_id(integer) from postgres, authenticated, service_role;
grant execute on function public.set_session_org_id(integer)
  to public, anon, authenticated, postgres, service_role;
