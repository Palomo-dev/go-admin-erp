-- BORRADOR DE ACTIVACIÓN: no aplicar antes de desplegar los escritores RPC.
-- Las rutas antiguas crean calls con la sesión y dejarían de poder insertar.
-- Mantiene las políticas originales; estas restricciones son aditivas.

DROP POLICY IF EXISTS crm_calls_lectura_autoria ON public.calls;
CREATE POLICY crm_calls_lectura_autoria ON public.calls AS RESTRICTIVE
FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id=calls.organization_id AND om.user_id=auth.uid() AND om.is_active)
  AND (calls.user_id=auth.uid() OR public.fn_crm_tiene_permiso(calls.organization_id,'crm.calls.view_all'))
  AND (calls.customer_id IS NULL OR EXISTS(SELECT 1 FROM public.customers c
    WHERE c.id=calls.customer_id AND c.organization_id=calls.organization_id AND public.app_branch_access(c.branch_id::integer)))
  AND (calls.opportunity_id IS NULL OR EXISTS(SELECT 1 FROM public.opportunities o
    WHERE o.id=calls.opportunity_id AND o.organization_id=calls.organization_id
      AND o.customer_id IS NOT DISTINCT FROM calls.customer_id AND public.app_branch_access(o.branch_id::integer)))
);

DROP POLICY IF EXISTS crm_calls_insert_solo_servidor ON public.calls;
CREATE POLICY crm_calls_insert_solo_servidor ON public.calls AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS crm_calls_update_solo_servidor ON public.calls;
CREATE POLICY crm_calls_update_solo_servidor ON public.calls AS RESTRICTIVE
FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS crm_calls_delete_solo_servidor ON public.calls;
CREATE POLICY crm_calls_delete_solo_servidor ON public.calls AS RESTRICTIVE
FOR DELETE TO authenticated USING (false);

-- El historial manual sin referencia de llamada conserva su flujo canónico.
-- Las comprobaciones de OLD y NEW impiden borrar o agregar una referencia para
-- eludir el flujo específico de llamadas. También se protege metadata con valor null.
DROP POLICY IF EXISTS crm_activities_call_insert_solo_rpc ON public.activities;
CREATE POLICY crm_activities_call_insert_solo_rpc ON public.activities AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (call_id IS NULL AND NOT coalesce(metadata ? 'call_id',false));
DROP POLICY IF EXISTS crm_activities_call_update_solo_rpc ON public.activities;
CREATE POLICY crm_activities_call_update_solo_rpc ON public.activities AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (call_id IS NULL AND NOT coalesce(metadata ? 'call_id',false))
WITH CHECK (call_id IS NULL AND NOT coalesce(metadata ? 'call_id',false));
DROP POLICY IF EXISTS crm_activities_call_delete_solo_rpc ON public.activities;
CREATE POLICY crm_activities_call_delete_solo_rpc ON public.activities AS RESTRICTIVE
FOR DELETE TO authenticated USING (call_id IS NULL AND NOT coalesce(metadata ? 'call_id',false));
