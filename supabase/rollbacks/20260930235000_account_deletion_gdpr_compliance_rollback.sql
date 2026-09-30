-- Rollback: Revertir cambios de eliminación de cuenta GDPR

-- 1. Eliminar funciones
DROP FUNCTION IF EXISTS public.is_sole_admin_with_active_subscription(uuid);
DROP FUNCTION IF EXISTS public.get_pending_account_deletions(integer);

-- 2. Eliminar índices
DROP INDEX IF EXISTS public.idx_profiles_deletion_requested_at;
DROP INDEX IF EXISTS public.idx_account_deletion_audit_completed_at;
DROP INDEX IF EXISTS public.idx_account_deletion_audit_user_id;

-- 3. Eliminar tabla de auditoría
DROP TABLE IF EXISTS public.account_deletion_audit;

-- 4. Eliminar columna de profiles
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS deletion_requested_at;
