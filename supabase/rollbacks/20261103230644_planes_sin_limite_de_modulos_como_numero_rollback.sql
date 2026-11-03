-- Rollback de 20261103230644: devuelve Ultimate y Enterprise a max_modules NULL.
-- OJO: mientras moduleManagementService trate NULL como 0, esto vuelve a bloquear
-- la activación de módulos pagos en esos planes.
update public.plans set max_modules = null, updated_at = now()
 where code in ('ultimate', 'enterprise');
