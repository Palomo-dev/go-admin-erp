-- Rollback de 20260914120000_revoke_fn_org_alias_authenticated.sql
-- ADVERTENCIA: reintroduce la brecha de reidentificacion 100%.
-- Usar solo si el fix causa un fallo critico.

revoke execute on function public.fn_org_alias(integer) from postgres, service_role;
grant execute on function public.fn_org_alias(integer)
  to public, anon, authenticated, postgres, service_role;
