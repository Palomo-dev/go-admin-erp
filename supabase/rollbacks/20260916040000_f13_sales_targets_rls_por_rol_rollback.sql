-- ROLLBACK de 20260916040000_f13_sales_targets_rls_por_rol
-- Restaura las políticas de escritura por pertenencia (cualquier miembro
-- activo). No recomendado: reabre la escritura de cuotas ajenas por PostgREST.
DROP POLICY IF EXISTS st_insert ON public.sales_targets;
DROP POLICY IF EXISTS st_update ON public.sales_targets;
DROP POLICY IF EXISTS st_delete ON public.sales_targets;

CREATE POLICY st_insert ON public.sales_targets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true));

CREATE POLICY st_update ON public.sales_targets
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true));

CREATE POLICY st_delete ON public.sales_targets
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true));
