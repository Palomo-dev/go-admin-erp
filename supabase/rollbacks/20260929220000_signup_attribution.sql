-- Rollback: atribución de campañas de marketing en el registro

-- Revocar permisos
revoke execute on function public.fn_guardar_signup_attribution(integer, jsonb) from authenticated, service_role;

-- Eliminar función
drop function if exists public.fn_guardar_signup_attribution(integer, jsonb);

-- Eliminar tabla (cascade elimina las políticas e índices)
drop table if exists public.signup_attribution cascade;
