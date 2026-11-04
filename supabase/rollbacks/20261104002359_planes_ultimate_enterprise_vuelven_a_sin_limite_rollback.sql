-- Rollback de 20261104002359: vuelve al tope fijo (total de módulos, 22 hoy). Solo hace
-- falta si producción vuelve a una versión anterior a 2393978c, que trata NULL como 0.
update public.plans
   set max_modules = (select count(*) from public.modules), updated_at = now()
 where code in ('ultimate', 'enterprise')
   and max_modules is null;
