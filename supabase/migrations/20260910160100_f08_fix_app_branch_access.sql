-- F-08: Corregir app_branch_access (v2)
--
-- Cuatro cambios:
-- 1. (2) acotada por organizacion: ser admin de la org A no da acceso a sucursales de la org B
-- 2. (3) con is_active: un miembro desactivado no conserva acceso a sus sucursales
-- 3. (4) nueva: miembro de la org sin sucursales asignadas en esa org = sin restriccion configurada
-- 4. STABLE: permite a Postgres cachear el resultado por sentencia
--
-- Antes: un empleado sin sucursales asignadas veia 0 filas en 19 tablas.
-- Ahora: ve todo lo de su organizacion (semantica: "no configurado" = sin restriccion).
--
-- Historial de versiones:
-- v0 (original): (4) no existia. Empleado sin branches -> bloqueado.
-- v1: (4) sin acotar por org. Empleado sin branches -> veia todo de TODAS las orgs.
-- v2 (esta): (4) acotada por org + membresia verificada. Correcta.

CREATE OR REPLACE FUNCTION public.app_branch_access(p_branch_id integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $function$
  SELECT
    -- (1) Sin sucursal especificada: permitir
    p_branch_id IS NULL
    -- (2) Super admin o Admin de la organizacion dueña del branch
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
        AND om.organization_id = (
          SELECT b.organization_id FROM branches b WHERE b.id = p_branch_id
        )
        AND (
          om.is_super_admin = true
          OR om.role_id IN (
            SELECT r.id FROM roles r
            WHERE r.name = ANY (ARRAY['Super Admin','Admin de organización'])
          )
        )
    )
    -- (3) Empleado con sucursal especifica asignada (miembro activo)
    OR EXISTS (
      SELECT 1 FROM member_branches mb
      JOIN organization_members om ON om.id = mb.organization_member_id
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
        AND mb.branch_id = p_branch_id
    )
    -- (4) Miembro de la org sin sucursales asignadas en esa org = sin restriccion
    OR (
      EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND om.organization_id = (
            SELECT b.organization_id FROM branches b WHERE b.id = p_branch_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM member_branches mb
        JOIN organization_members om ON om.id = mb.organization_member_id
        JOIN branches b ON b.id = mb.branch_id
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND b.organization_id = (
            SELECT b2.organization_id FROM branches b2 WHERE b2.id = p_branch_id
          )
      )
    )
$function$;
