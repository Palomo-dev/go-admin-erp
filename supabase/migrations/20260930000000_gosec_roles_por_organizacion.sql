-- GO-sec (2026-09-30) — Roles por organización: cerrar brecha multi-tenant
-- permitiendo que cada organización gestione sus propios roles personalizados.
--
-- Problema: las tablas `roles` y `role_permissions` son globales sin filtrado
-- por organización, permitiendo que cualquier admin de cualquier organización
-- modifique roles y permisos de todas las organizaciones, incluyendo roles
-- del sistema. Documentado públicamente en go-admin-investors.
--
-- Solución: agregar `organization_id` a `roles` para que cada organización
-- tenga sus propios roles personalizados, manteniendo roles del sistema
-- (organization_id = NULL) compartidos.
--
-- Verificado en la base viva antes de aplicar:
--   * Solo existen 5 roles, TODOS son is_system = true:
--     - Rol 1 "Super Admin": 0 miembros
--     - Rol 2 "Admin de organización": 99 miembros en 86 organizaciones
--     - Rol 3 "Cliente": 0 miembros
--     - Rol 4 "Empleado": 42 miembros en 7 organizaciones
--     - Rol 5 "Manager": 1 miembro en 1 organización
--   * NO hay roles personalizados (is_system = false) creados por clientes
--   * organization_id será INTEGER (organizations.id es int4)
--   * Funciones helper disponibles: check_user_permission, fn_is_platform_admin
--
-- Después de esta migración:
--   * Los 5 roles del sistema se mantienen con organization_id = NULL
--   * Cada organización puede crear y gestionar sus propios roles personalizados
--   * RLS impide que una org vea o modifique roles de otra org
--   * Los roles del sistema solo los gestiona platform admin o service role
--   * Un miembro solo puede tener un rol del sistema o de su misma organización

-- ============================================================================
-- 1. AGREGAR COLUMNA organization_id A roles
-- ============================================================================

-- Agregar columna organization_id (NULL = rol del sistema)
ALTER TABLE public.roles 
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Índice para performance en queries filtradas por organización
CREATE INDEX IF NOT EXISTS idx_roles_organization_id 
  ON public.roles(organization_id) 
  WHERE organization_id IS NOT NULL;

-- Índice compuesto para unicidad de nombre por organización
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name_unique 
  ON public.roles(organization_id, LOWER(name)) 
  WHERE organization_id IS NOT NULL;

-- Comentarios para documentar
COMMENT ON COLUMN public.roles.organization_id IS 
  'Organización dueña del rol. NULL = rol del sistema compartido por todas las organizaciones.';

-- ============================================================================
-- 2. BACKFILL - Los roles existentes son todos del sistema, se quedan en NULL
-- ============================================================================

-- Verificación: todos los roles actuales son is_system = true, así que
-- organization_id se queda en NULL (ya es el default de la columna nueva).
-- No hay roles personalizados que migrar.

DO $$
DECLARE
  v_roles_sistema INTEGER;
  v_roles_personalizados INTEGER;
BEGIN
  -- Contar roles del sistema
  SELECT COUNT(*) INTO v_roles_sistema FROM public.roles WHERE is_system = true;
  
  -- Contar roles personalizados (debería ser 0)
  SELECT COUNT(*) INTO v_roles_personalizados FROM public.roles WHERE is_system = false;
  
  -- Log para verificación
  RAISE NOTICE 'Backfill de roles: % roles del sistema (quedan con organization_id = NULL), % roles personalizados', 
    v_roles_sistema, v_roles_personalizados;
  
  -- Validación: si hay roles personalizados, fallar para revisión manual
  IF v_roles_personalizados > 0 THEN
    RAISE EXCEPTION 'Se encontraron % roles personalizados. Esta migración espera solo roles del sistema. Revisar manualmente.', 
      v_roles_personalizados;
  END IF;
END $$;

-- ============================================================================
-- 3. TRIGGER: Impedir cambiar organization_id de un rol existente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_roles_prevent_org_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Permitir INSERT (NEW.organization_id se establece una vez)
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- En UPDATE, impedir cambio de organization_id
  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'No se puede cambiar organization_id de un rol existente (rol id: %, de org % a org %)', 
        OLD.id, OLD.organization_id, NEW.organization_id
        USING ERRCODE = '23514'; -- check_violation
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_prevent_org_change ON public.roles;
CREATE TRIGGER trg_roles_prevent_org_change
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_roles_prevent_org_change();

COMMENT ON FUNCTION public.fn_roles_prevent_org_change() IS
  'Impide cambiar organization_id de un rol existente para mantener integridad referencial.';

-- ============================================================================
-- 4. TRIGGER: Validar que organization_members.role_id apunte a rol válido
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_org_members_validate_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_org_id INTEGER;
BEGIN
  -- Obtener organization_id del rol
  SELECT organization_id INTO v_role_org_id
  FROM public.roles
  WHERE id = NEW.role_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol % no existe', NEW.role_id
      USING ERRCODE = '23503'; -- foreign_key_violation
  END IF;
  
  -- Validar: el rol debe ser del sistema (NULL) o de la misma organización
  IF v_role_org_id IS NOT NULL AND v_role_org_id != NEW.organization_id THEN
    RAISE EXCEPTION 'No se puede asignar rol % de org % a miembro de org %', 
      NEW.role_id, v_role_org_id, NEW.organization_id
      USING ERRCODE = '23514'; -- check_violation
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_members_validate_role ON public.organization_members;
CREATE TRIGGER trg_org_members_validate_role
  BEFORE INSERT OR UPDATE OF role_id, organization_id ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_members_validate_role();

COMMENT ON FUNCTION public.fn_org_members_validate_role() IS
  'Valida que un miembro solo pueda tener un rol del sistema o de su misma organización.';

-- ============================================================================
-- 5. TRIGGER: Impedir borrar roles con miembros asignados
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_roles_prevent_delete_with_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_count INTEGER;
BEGIN
  -- Contar miembros que usan este rol
  SELECT COUNT(*) INTO v_member_count
  FROM public.organization_members
  WHERE role_id = OLD.id;
  
  IF v_member_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar el rol % porque tiene % miembros asignados', 
      OLD.name, v_member_count
      USING ERRCODE = '23503', -- foreign_key_violation
            HINT = 'Reasigna los miembros a otro rol antes de eliminar.';
  END IF;
  
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_prevent_delete_with_members ON public.roles;
CREATE TRIGGER trg_roles_prevent_delete_with_members
  BEFORE DELETE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_roles_prevent_delete_with_members();

COMMENT ON FUNCTION public.fn_roles_prevent_delete_with_members() IS
  'Impide eliminar roles que tienen miembros asignados.';

-- ============================================================================
-- 6. RLS PARA roles: SELECT por pertenencia, WRITE solo para admins de la org
-- ============================================================================

-- Eliminar políticas anteriores
DROP POLICY IF EXISTS "permissions_write_platform_admins_only" ON public.roles;
DROP POLICY IF EXISTS "roles_write_platform_admins_only" ON public.roles;
DROP POLICY IF EXISTS "roles_select_for_authenticated" ON public.roles;
DROP POLICY IF EXISTS "roles_manage_for_superadmins" ON public.roles;
DROP POLICY IF EXISTS "roles_system_protection" ON public.roles;
DROP POLICY IF EXISTS "Solo admins pueden crear roles" ON public.roles;

-- Habilitar RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- SELECT: roles del sistema + roles de las orgs a las que pertenece el usuario
CREATE POLICY "roles_select_system_and_own_org" ON public.roles
  FOR SELECT TO authenticated
  USING (
    -- Roles del sistema (organization_id IS NULL) visibles para todos
    organization_id IS NULL
    OR
    -- Roles de organizaciones a las que pertenece el usuario
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

-- INSERT: solo admins de la organización (para roles personalizados)
-- Platform admins pueden crear roles del sistema
CREATE POLICY "roles_insert_org_admins" ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Platform admins pueden crear cualquier rol
    (SELECT public.fn_is_platform_admin())
    OR
    -- Admins de la org pueden crear roles de su org
    (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = roles.organization_id
          AND om.role_id = ANY(ARRAY[1, 2]) -- Super Admin o Admin de organización
          AND om.is_active = true
      )
      AND is_system = false -- Solo pueden crear roles personalizados, no del sistema
    )
  );

-- UPDATE: solo admins de la organización dueña o platform admins para roles del sistema
CREATE POLICY "roles_update_org_admins" ON public.roles
  FOR UPDATE TO authenticated
  USING (
    -- Platform admins pueden modificar cualquier rol
    (SELECT public.fn_is_platform_admin())
    OR
    -- Admins de la org pueden modificar roles de su org (no del sistema)
    (
      organization_id IS NOT NULL
      AND is_system = false
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = roles.organization_id
          AND om.role_id = ANY(ARRAY[1, 2])
          AND om.is_active = true
      )
    )
  )
  WITH CHECK (
    -- Mantener mismas condiciones en WITH CHECK
    (SELECT public.fn_is_platform_admin())
    OR
    (
      organization_id IS NOT NULL
      AND is_system = false
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = roles.organization_id
          AND om.role_id = ANY(ARRAY[1, 2])
          AND om.is_active = true
      )
    )
  );

-- DELETE: solo admins de la organización dueña o platform admins para roles del sistema
CREATE POLICY "roles_delete_org_admins" ON public.roles
  FOR DELETE TO authenticated
  USING (
    -- Platform admins pueden eliminar cualquier rol
    (SELECT public.fn_is_platform_admin())
    OR
    -- Admins de la org pueden eliminar roles de su org (no del sistema)
    (
      organization_id IS NOT NULL
      AND is_system = false
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = roles.organization_id
          AND om.role_id = ANY(ARRAY[1, 2])
          AND om.is_active = true
      )
    )
  );

-- ============================================================================
-- 7. RLS PARA role_permissions: gestión por admins de la org del rol
-- ============================================================================

-- Eliminar políticas anteriores
DROP POLICY IF EXISTS "role_permissions_write_platform_admins_only" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_select_for_authenticated" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_insert_for_org_admins" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_update_for_org_admins" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_delete_for_org_admins" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_all_for_superadmins" ON public.role_permissions;

-- Habilitar RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- SELECT: permisos de roles que el usuario puede ver (misma lógica que roles)
CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    role_id IN (
      SELECT r.id
      FROM public.roles r
      WHERE r.organization_id IS NULL -- Roles del sistema
         OR r.organization_id IN (
           SELECT om.organization_id
           FROM public.organization_members om
           WHERE om.user_id = auth.uid() AND om.is_active = true
         )
    )
  );

-- INSERT/UPDATE/DELETE: solo admins de la org del rol o platform admins
CREATE POLICY "role_permissions_write" ON public.role_permissions
  FOR ALL TO authenticated
  USING (
    -- Platform admins pueden gestionar permisos de cualquier rol
    (SELECT public.fn_is_platform_admin())
    OR
    -- Admins de la org pueden gestionar permisos de roles de su org
    role_id IN (
      SELECT r.id
      FROM public.roles r
      WHERE r.organization_id IS NOT NULL
        AND r.is_system = false
        AND EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = r.organization_id
            AND om.role_id = ANY(ARRAY[1, 2])
            AND om.is_active = true
        )
    )
  )
  WITH CHECK (
    -- Mismas condiciones para WITH CHECK
    (SELECT public.fn_is_platform_admin())
    OR
    role_id IN (
      SELECT r.id
      FROM public.roles r
      WHERE r.organization_id IS NOT NULL
        AND r.is_system = false
        AND EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = r.organization_id
            AND om.role_id = ANY(ARRAY[1, 2])
            AND om.is_active = true
        )
    )
  );

-- ============================================================================
-- 8. RLS PARA permissions: lectura para autenticados, escritura para platform admins
-- ============================================================================

-- Eliminar política anterior
DROP POLICY IF EXISTS "permissions_write_platform_admins_only" ON public.permissions;
DROP POLICY IF EXISTS "permissions_select_for_authenticated" ON public.permissions;
DROP POLICY IF EXISTS "permissions_manage_for_superadmins" ON public.permissions;

-- Habilitar RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado puede ver el catálogo de permisos
CREATE POLICY "permissions_select_all" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

-- WRITE: solo platform admins pueden modificar el catálogo
CREATE POLICY "permissions_write_platform_admins" ON public.permissions
  FOR ALL TO authenticated
  USING ((SELECT public.fn_is_platform_admin()))
  WITH CHECK ((SELECT public.fn_is_platform_admin()));

-- ============================================================================
-- 9. REVOCAR GRANTS EXCESIVOS
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.role_permissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.permissions FROM anon, authenticated;

-- ============================================================================
-- 10. COMENTARIOS FINALES
-- ============================================================================

COMMENT ON POLICY "roles_select_system_and_own_org" ON public.roles IS
  'Permite ver roles del sistema (NULL) y roles de organizaciones a las que pertenece el usuario.';

COMMENT ON POLICY "roles_insert_org_admins" ON public.roles IS
  'Platform admins pueden crear cualquier rol. Admins de org solo pueden crear roles personalizados de su org.';

COMMENT ON POLICY "roles_update_org_admins" ON public.roles IS
  'Platform admins pueden modificar cualquier rol. Admins de org solo pueden modificar roles personalizados de su org.';

COMMENT ON POLICY "roles_delete_org_admins" ON public.roles IS
  'Platform admins pueden eliminar cualquier rol. Admins de org solo pueden eliminar roles personalizados de su org (protegido además por trigger que impide borrar roles con miembros).';

COMMENT ON POLICY "role_permissions_select" ON public.role_permissions IS
  'Permite ver permisos de roles que el usuario puede ver según políticas de roles.';

COMMENT ON POLICY "role_permissions_write" ON public.role_permissions IS
  'Platform admins gestionan permisos de cualquier rol. Admins de org solo gestionan permisos de roles personalizados de su org.';

COMMENT ON POLICY "permissions_select_all" ON public.permissions IS
  'Cualquier usuario autenticado puede ver el catálogo de permisos disponibles.';

COMMENT ON POLICY "permissions_write_platform_admins" ON public.permissions IS
  'Solo platform admins pueden modificar el catálogo de permisos.';
