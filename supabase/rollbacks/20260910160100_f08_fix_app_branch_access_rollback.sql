-- Reversion de F-08 fix app_branch_access: restaurar la funcion original
--
-- ADVERTENCIA: al revertir se restaura el bug donde un empleado sin
-- sucursales asignadas no ve ninguna fila en las 19 tablas con
-- branch_access_restrictive. Revertir solo si se entiende el impacto.

CREATE OR REPLACE FUNCTION public.app_branch_access(p_branch_id integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT
    p_branch_id IS NULL
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
        AND (
          om.is_super_admin = true
          OR om.role_id IN (
            SELECT r.id FROM roles r
            WHERE r.name = ANY (ARRAY['Super Admin','Admin de organización'])
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM member_branches mb
      JOIN organization_members om ON om.id = mb.organization_member_id
      WHERE om.user_id = auth.uid()
        AND mb.branch_id = p_branch_id
    );
$function$;
