-- Conserva tablas y datos; retira solo la consulta unificada.
revoke execute on function public.crm_campaigns_unificadas(integer) from authenticated, service_role;
