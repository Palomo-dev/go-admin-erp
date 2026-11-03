-- 20261103230644 fijó Ultimate y Enterprise en el total de módulos PAGOS (17), pero la
-- página Mi Organización › Módulos (lib/organizacion/modulos.ts, cupoOpcionales)
-- descuenta los básicos del tope: 17 − 5 = 12 opcionales, y bloqueaba los 5 restantes.
-- Se sube al total de módulos (básicos + pagos, 22 hoy), que cubre las dos lecturas
-- hasta que el código que trata NULL como ilimitado (2393978c) esté en producción y se
-- pueda volver a NULL.
-- Rollback: supabase/rollbacks/20261103231312_planes_sin_limite_cubre_tambien_basicos_rollback.sql
update public.plans p
   set max_modules = (select count(*) from public.modules),
       updated_at = now()
 where p.code in ('ultimate', 'enterprise')
   and p.max_modules = (select count(*) from public.modules m where not m.is_core);
