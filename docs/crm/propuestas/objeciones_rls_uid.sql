-- Preserve the existing read contract; cache auth.uid() once per statement.
ALTER POLICY objection_responses_read ON public.objection_responses USING (
 EXISTS(SELECT 1 FROM public.organization_members om WHERE om.organization_id=objection_responses.organization_id AND om.user_id=(SELECT auth.uid()) AND om.is_active) AND EXISTS(
 SELECT 1 FROM public.calls c LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=c.organization_id
 LEFT JOIN public.customers customer ON customer.id=c.customer_id AND customer.organization_id=c.organization_id
 WHERE c.id=call_id AND c.organization_id=objection_responses.organization_id
 AND (c.user_id=(SELECT auth.uid()) OR public.fn_crm_tiene_permiso(c.organization_id,'crm.calls.view_all'))
 AND public.app_branch_access(coalesce(o.branch_id::integer,customer.branch_id))));
NOTIFY pgrst,'reload schema';
