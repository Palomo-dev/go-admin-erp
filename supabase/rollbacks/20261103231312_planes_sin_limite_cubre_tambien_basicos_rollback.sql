-- Rollback de 20261103231312: vuelve al total de módulos pagos (estado de 20261103230644).
update public.plans p
   set max_modules = (select count(*) from public.modules m where not m.is_core),
       updated_at = now()
 where p.code in ('ultimate', 'enterprise')
   and p.max_modules = (select count(*) from public.modules);
