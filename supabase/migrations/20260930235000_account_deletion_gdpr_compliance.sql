-- Migración: Cumplimiento GDPR para eliminación de cuentas
-- Fecha: 2026-09-30
-- Ticket: Eliminación de cuenta con retención legal

-- 1. Agregar columna deletion_requested_at a profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS 
'Fecha y hora en que el usuario solicitó eliminar su cuenta. NULL si no ha solicitado eliminación. El proceso programado borra los datos personales después de la fecha indicada en la política de privacidad.';

-- 2. Crear tabla de auditoría para eliminaciones de cuenta
CREATE TABLE IF NOT EXISTS public.account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  deletion_requested_at timestamptz NOT NULL,
  deletion_completed_at timestamptz NOT NULL DEFAULT now(),
  reason text DEFAULT 'user_request',
  actions_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  retained_data jsonb DEFAULT '{}'::jsonb,
  processed_by text,
  organization_ids integer[] DEFAULT ARRAY[]::integer[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.account_deletion_audit IS 
'Registro de auditoría de eliminaciones de cuenta. Conserva registro mínimo sin datos personales para cumplimiento legal y auditorías. NO contiene datos personales identificables.';

COMMENT ON COLUMN public.account_deletion_audit.user_id IS 'UUID del usuario eliminado (conservado para trazabilidad)';
COMMENT ON COLUMN public.account_deletion_audit.email IS 'Email del usuario al momento de solicitar la eliminación (sin hash, necesario para soporte)';
COMMENT ON COLUMN public.account_deletion_audit.deletion_requested_at IS 'Cuándo solicitó la eliminación';
COMMENT ON COLUMN public.account_deletion_audit.deletion_completed_at IS 'Cuándo se procesó la eliminación';
COMMENT ON COLUMN public.account_deletion_audit.actions_taken IS 'Lista de acciones ejecutadas: ["anonymized_profile", "removed_from_orgs", "disabled_auth"]';
COMMENT ON COLUMN public.account_deletion_audit.retained_data IS 'Referencias a datos retenidos por obligación legal: {"invoices": [123, 456], "accounting_entries": [789]}';
COMMENT ON COLUMN public.account_deletion_audit.processed_by IS 'Sistema o usuario que ejecutó el proceso';
COMMENT ON COLUMN public.account_deletion_audit.organization_ids IS 'IDs de organizaciones a las que pertenecía';

-- 3. Índices para la tabla de auditoría
CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_user_id 
ON public.account_deletion_audit(user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_completed_at 
ON public.account_deletion_audit(deletion_completed_at);

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_requested_at 
ON public.profiles(deletion_requested_at) 
WHERE deletion_requested_at IS NOT NULL;

-- 4. RLS para la tabla de auditoría (solo plataforma)
ALTER TABLE public.account_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede leer/escribir (admin de plataforma con herramientas específicas)
CREATE POLICY account_deletion_audit_platform_only 
ON public.account_deletion_audit
FOR ALL 
USING (false);

-- 5. Función para obtener solicitudes pendientes de eliminación
-- Retorna los perfiles que cumplan:
--   - status = 'pending_deletion'
--   - deletion_requested_at no es NULL
--   - han pasado más de p_days_after días calendario desde la solicitud
CREATE OR REPLACE FUNCTION public.get_pending_account_deletions(
  p_days_after integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  deletion_requested_at timestamptz,
  days_since_request integer,
  organization_ids integer[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.deletion_requested_at,
    EXTRACT(DAY FROM (now() - p.deletion_requested_at))::integer as days_since_request,
    COALESCE(
      ARRAY_AGG(DISTINCT om.organization_id) FILTER (WHERE om.organization_id IS NOT NULL),
      ARRAY[]::integer[]
    ) as organization_ids
  FROM public.profiles p
  LEFT JOIN public.organization_members om ON om.user_id = p.id
  WHERE p.status = 'pending_deletion'
    AND p.deletion_requested_at IS NOT NULL
    AND p.deletion_requested_at <= (now() - (p_days_after || ' days')::interval)
  GROUP BY p.id, p.email, p.first_name, p.last_name, p.deletion_requested_at
  ORDER BY p.deletion_requested_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_pending_account_deletions IS
'Obtiene las cuentas pendientes de eliminación que han superado el plazo legal (por defecto 10 días calendario). Solo service_role.';

-- Grant solo a service_role
REVOKE ALL ON FUNCTION public.get_pending_account_deletions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_account_deletions(integer) TO service_role;

-- 6. Función auxiliar para verificar si un usuario es único admin/owner con suscripción activa
CREATE OR REPLACE FUNCTION public.is_sole_admin_with_active_subscription(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_org record;
  v_admin_count integer;
  v_blocking_orgs jsonb := '[]'::jsonb;
BEGIN
  -- Buscar organizaciones donde es el único admin/owner con suscripción activa
  FOR v_org IN
    SELECT DISTINCT
      om.organization_id,
      o.name as org_name,
      os.stripe_subscription_id,
      os.stripe_subscription_status
    FROM organization_members om
    INNER JOIN organizations o ON o.id = om.organization_id
    LEFT JOIN organization_subscriptions os ON os.organization_id = om.organization_id
    WHERE om.user_id = p_user_id
      AND om.is_active = true
      AND (om.is_super_admin = true OR EXISTS (
        SELECT 1 FROM roles r 
        WHERE r.id = om.role_id 
        AND (r.name ILIKE '%admin%' OR r.name ILIKE '%owner%')
      ))
      AND os.stripe_subscription_status IN ('active', 'trialing')
  LOOP
    -- Contar otros admins en esta organización
    SELECT COUNT(*) INTO v_admin_count
    FROM organization_members om2
    WHERE om2.organization_id = v_org.organization_id
      AND om2.user_id != p_user_id
      AND om2.is_active = true
      AND (om2.is_super_admin = true OR EXISTS (
        SELECT 1 FROM roles r2 
        WHERE r2.id = om2.role_id 
        AND (r2.name ILIKE '%admin%' OR r2.name ILIKE '%owner%')
      ));
    
    -- Si es el único admin, agregar a la lista de bloqueo
    IF v_admin_count = 0 THEN
      v_blocking_orgs := v_blocking_orgs || jsonb_build_object(
        'organization_id', v_org.organization_id,
        'organization_name', v_org.org_name,
        'subscription_id', v_org.stripe_subscription_id,
        'subscription_status', v_org.stripe_subscription_status
      );
    END IF;
  END LOOP;
  
  v_result := jsonb_build_object(
    'is_blocked', jsonb_array_length(v_blocking_orgs) > 0,
    'blocking_organizations', v_blocking_orgs,
    'reason', CASE 
      WHEN jsonb_array_length(v_blocking_orgs) > 0 
      THEN 'Usuario es el único administrador de una o más organizaciones con suscripción activa'
      ELSE null
    END
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.is_sole_admin_with_active_subscription IS
'Verifica si un usuario es el único administrador/propietario de alguna organización con suscripción activa. Retorna JSON con is_blocked y detalles.';

REVOKE ALL ON FUNCTION public.is_sole_admin_with_active_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_sole_admin_with_active_subscription(uuid) TO service_role;
