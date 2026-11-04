-- Con 2393978c en producción (moduleManagementService trata max_modules NULL como
-- ilimitado), Ultimate y Enterprise vuelven a NULL, su valor de «sin límite». Deshace el
-- parche temporal de 20261103230644 y 20261103231312 (tope fijo de 22 módulos).
-- Ensayo (ENSAYO_OK): 2 planes; get_module_usage(org 333) → is_unlimited = true.
-- Rollback: supabase/rollbacks/20261104002359_planes_ultimate_enterprise_vuelven_a_sin_limite_rollback.sql
update public.plans
   set max_modules = null, updated_at = now()
 where code in ('ultimate', 'enterprise')
   and max_modules = (select count(*) from public.modules);
