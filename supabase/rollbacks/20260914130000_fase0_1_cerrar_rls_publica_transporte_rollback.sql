-- 20260914130000_fase0_1_cerrar_rls_publica_transporte_rollback.sql
-- Revierte 20260914130000_fase0_1_cerrar_rls_publica_transporte.sql
--
-- Restaura el estado anterior EXACTO: las cuatro políticas abiertas al público, el GRANT
-- SELECT a anon, y las políticas de pertenencia con su forma original (auth.uid() sin
-- envolver y subquery anidado). Se restaura fiel y no la forma optimizada a propósito: un
-- rollback debe dejar la base como estaba, no como nos gustaría que estuviera.
--
-- Este rollback vuelve a exponer con la anon key los envíos y transportadoras de todas las
-- organizaciones. Úsalo sólo si el cierre rompió algo que no se pudo arreglar de otra forma,
-- y por el menor tiempo posible.
--
-- No toca datos: la migración no modificó ninguna fila.

GRANT SELECT ON public.shipments, public.transport_carriers,
                public.delivery_attempts, public.proof_of_delivery TO anon;

DROP POLICY IF EXISTS shipments_public_read ON public.shipments;
CREATE POLICY shipments_public_read ON public.shipments FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS transport_carriers_public_read ON public.transport_carriers;
CREATE POLICY transport_carriers_public_read ON public.transport_carriers FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS delivery_attempts_public_read ON public.delivery_attempts;
CREATE POLICY delivery_attempts_public_read ON public.delivery_attempts FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS proof_of_delivery_public_read ON public.proof_of_delivery;
CREATE POLICY proof_of_delivery_public_read ON public.proof_of_delivery FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS shipments_org_access ON public.shipments;
CREATE POLICY shipments_org_access ON public.shipments FOR ALL TO public
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS transport_carriers_org_access ON public.transport_carriers;
CREATE POLICY transport_carriers_org_access ON public.transport_carriers FOR ALL TO public
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS delivery_attempts_org_access ON public.delivery_attempts;
CREATE POLICY delivery_attempts_org_access ON public.delivery_attempts FOR ALL TO public
  USING (shipment_id IN (
    SELECT shipments.id FROM public.shipments
    WHERE shipments.organization_id IN (
      SELECT organization_members.organization_id FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS pod_org_access ON public.proof_of_delivery;
CREATE POLICY pod_org_access ON public.proof_of_delivery FOR ALL TO public
  USING (shipment_id IN (
    SELECT shipments.id FROM public.shipments
    WHERE shipments.organization_id IN (
      SELECT organization_members.organization_id FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
    )
  ));
