-- Ultimate y Enterprise quedaron con max_modules NULL («sin límite») en el proyecto
-- nuevo, y moduleManagementService calcula `plan.max_modules || 0`: NULL se volvía 0 y
-- ninguna organización de esos planes podía encender un módulo pago
-- («Has alcanzado el límite de módulos de tu plan (0)»; POST /api/modules → 400).
-- Afectaba a las 20 organizaciones en Ultimate el 2026-11-03.
--
-- Se fija al total de módulos pagos (17 hoy), que equivale a «sin límite».
-- Ensayo (ENSAYO_OK): 2 planes, max_modules = 17; get_current_plan(org 333) → 17.
-- Pendiente en código: tratar NULL como ilimitado en moduleManagementService.
-- Rollback: supabase/rollbacks/20261103230644_planes_sin_limite_de_modulos_como_numero_rollback.sql
update public.plans p
   set max_modules = (select count(*) from public.modules m where not m.is_core),
       updated_at = now()
 where p.code in ('ultimate', 'enterprise')
   and p.max_modules is null;
