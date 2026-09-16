-- ============================================================
-- F13 · RLS de escritura de `sales_targets` por rol
-- ============================================================
-- Deuda verificada el 2026-09-15 (FASE-13 §5.1): `st_insert`, `st_update`
-- y `st_delete` solo exigían pertenencia activa, así que cualquier miembro
-- (rol 4, Empleado) podía crear, alterar o borrar cuotas ajenas llamando a
-- PostgREST directamente. Las rutas ya exigen admin/manager por id de rol
-- (`STAGE_MANAGER_ROLE_IDS = [1, 2, 5]`); la BD ahora dice lo mismo.
-- Lectura (`st_select`) intacta: por pertenencia. `IN (SELECT …)` con
-- `(select auth.uid())`, sin EXISTS anidado (coste de RLS ya sufrido).
-- Tabla con 0 filas al aplicar. Verificado por MCP: roles 1 Super Admin,
-- 2 Admin de organización, 5 Manager; `organization_members(user_id,
-- role_id, is_active, is_super_admin)`.
-- ============================================================

DROP POLICY IF EXISTS st_insert ON public.sales_targets;
DROP POLICY IF EXISTS st_update ON public.sales_targets;
DROP POLICY IF EXISTS st_delete ON public.sales_targets;

CREATE POLICY st_insert ON public.sales_targets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid()) AND om.is_active
      AND (om.role_id IN (1, 2, 5) OR om.is_super_admin)));

CREATE POLICY st_update ON public.sales_targets
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid()) AND om.is_active
      AND (om.role_id IN (1, 2, 5) OR om.is_super_admin)))
  WITH CHECK (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid()) AND om.is_active
      AND (om.role_id IN (1, 2, 5) OR om.is_super_admin)));

CREATE POLICY st_delete ON public.sales_targets
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid()) AND om.is_active
      AND (om.role_id IN (1, 2, 5) OR om.is_super_admin)));
