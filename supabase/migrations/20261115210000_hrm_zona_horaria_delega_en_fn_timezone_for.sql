-- RR. HH.: una sola resolución de zona horaria.
-- fn_hr_zona_horaria (fase 0, 20261115042303) repetía la cascada sede → organización
-- → America/Bogota que ya implementa public.fn_timezone_for, la única resolutora
-- (docs/reglas-fechas-timezone.md; guardia src/__tests__/timezone/zonaHorariaPorSucursal.test.ts).
-- Se conserva la firma (la usan hrm_process_attendance_event y la RPC de alta de la
-- fase 1) y ahora solo delega. Los que la llaman son miembros de la organización o
-- service_role, que pasan fn_assert_acceso_org dentro de fn_timezone_for.
-- Reversión: supabase/rollbacks/20261115210000_hrm_zona_horaria_delega_en_fn_timezone_for_rollback.sql

create or replace function public.fn_hr_zona_horaria(p_org integer, p_branch integer)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.fn_timezone_for(p_org, p_branch);
$$;

revoke execute on function public.fn_hr_zona_horaria(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_zona_horaria(integer, integer) to service_role;
