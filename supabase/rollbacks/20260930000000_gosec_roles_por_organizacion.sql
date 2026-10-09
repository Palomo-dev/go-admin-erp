-- ROLLBACK de GO-sec 20260930000000_gosec_roles_por_organizacion.sql
--
-- ADVERTENCIA: Este rollback elimina la columna organization_id de roles,
-- lo que causa pérdida de datos si las organizaciones ya crearon roles
-- personalizados. Solo usar en caso de emergencia durante el despliegue
-- inicial antes de que se creen roles personalizados.

-- ============================================================================
-- 1. ELIMINAR POLÍTICAS RLS NUEVAS
-- ============================================================================

-- Políticas de roles
DROP POLICY IF EXISTS "roles_select_system_and_own_org" ON public.roles;
DROP POLICY IF EXISTS "roles_insert_org_admins" ON public.roles;
DROP POLICY IF EXISTS "roles_update_org_admins" ON public.roles;
DROP POLICY IF EXISTS "roles_delete_org_admins" ON public.roles;

-- Políticas de role_permissions
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_write" ON public.role_permissions;

-- Políticas de permissions
DROP POLICY IF EXISTS "permissions_select_all" ON public.permissions;
DROP POLICY IF EXISTS "permissions_write_platform_admins" ON public.permissions;

-- ============================================================================
-- 2. ELIMINAR TRIGGERS Y FUNCIONES
-- ============================================================================

DROP TRIGGER IF EXISTS trg_roles_prevent_org_change ON public.roles;
DROP FUNCTION IF EXISTS public.fn_roles_prevent_org_change();

DROP TRIGGER IF EXISTS trg_org_members_validate_role ON public.organization_members;
DROP FUNCTION IF EXISTS public.fn_org_members_validate_role();

DROP TRIGGER IF EXISTS trg_roles_prevent_delete_with_members ON public.roles;
DROP FUNCTION IF EXISTS public.fn_roles_prevent_delete_with_members();

-- ============================================================================
-- 3. ELIMINAR ÍNDICES
-- ============================================================================

DROP INDEX IF EXISTS public.idx_roles_organization_id;
DROP INDEX IF EXISTS public.idx_roles_org_name_unique;

-- ============================================================================
-- 4. ELIMINAR COLUMNA organization_id
-- ============================================================================

-- ADVERTENCIA: Esto eliminará datos si hay roles personalizados creados
ALTER TABLE public.roles DROP COLUMN IF EXISTS organization_id;

-- ============================================================================
-- 5. RESTAURAR POLÍTICAS RLS ANTERIORES (las permisivas vulnerables)
-- ============================================================================

-- Políticas de permissions
CREATE POLICY "permissions_manage_for_superadmins" ON public.permissions
  FOR ALL TO authenticated
  USING ((SELECT public.fn_is_platform_admin()))
  WITH CHECK ((SELECT public.fn_is_platform_admin()));

CREATE POLICY "permissions_select_for_authenticated" ON public.permissions
  FOR SELECT TO public
  USING (auth.role() = 'authenticated');

-- Políticas de roles
CREATE POLICY "roles_select_for_authenticated" ON public.roles
  FOR SELECT TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY "roles_manage_for_superadmins" ON public.roles
  FOR ALL TO public
  USING (
    (EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.is_super_admin = true
        AND organization_members.is_active = true
    ))
    AND ((is_system IS NULL) OR (is_system = false))
  )
  WITH CHECK (NULL);

CREATE POLICY "roles_system_protection" ON public.roles
  FOR ALL TO public
  USING ((is_system IS NULL) OR (is_system = false))
  WITH CHECK (NULL);

CREATE POLICY "Solo admins pueden crear roles" ON public.roles
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.organization_id = COALESCE(organization_members.organization_id, 1)
        AND (
          organization_members.is_super_admin = true
          OR organization_members.role_id = 2
        )
        AND organization_members.is_active = true
    )
  );

-- Políticas de role_permissions
CREATE POLICY "role_permissions_select_for_authenticated" ON public.role_permissions
  FOR SELECT TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY "role_permissions_all_for_superadmins" ON public.role_permissions
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.is_super_admin = true
        AND organization_members.is_active = true
    )
  )
  WITH CHECK (NULL);

CREATE POLICY "role_permissions_insert_for_org_admins" ON public.role_permissions
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role_id = ANY (ARRAY[1, 2])
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "role_permissions_update_for_org_admins" ON public.role_permissions
  FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role_id = ANY (ARRAY[1, 2])
        AND organization_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role_id = ANY (ARRAY[1, 2])
        AND organization_members.is_active = true
    )
  );

CREATE POLICY "role_permissions_delete_for_org_admins" ON public.role_permissions
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role_id = ANY (ARRAY[1, 2])
        AND organization_members.is_active = true
    )
  );
