-- 20260914130000_fase0_1_cerrar_rls_publica_transporte.sql
-- Versión aplicada en Supabase: 20260914133443 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Fase 0.1 (GO-1) — Cierra el acceso anónimo a las tablas de envíos.
--
-- Las cuatro tablas tenían una política FOR SELECT TO public USING (true). La anon key
-- viaja en el bundle de los sitios públicos, así que con ella se leía la tabla entera de
-- envíos de todas las organizaciones (destinatario, teléfono, dirección, coordenadas, valor
-- declarado) y la de transportadoras completa, incluidos metadata y api_credentials_ref.
--
-- Verificado antes de aplicar (vía Supabase MCP, proyecto jgmgphmzusbluqhuqihj):
--   - Cero lectores anónimos en los dos repos (ERP y sitios), incluidos mobile/, print-agent/,
--     electron/ y los assets compilados. Las 9 referencias reales son server-side.
--   - edge_logs: todas las lecturas de /rest/v1/shipments llegan con rol service_role.
--   - authenticated conserva sus GRANT propios (SELECT/INSERT/UPDATE) en las cuatro tablas.
--   - Ensayo completo dentro de begin … rollback con las verificaciones de abajo.
--
-- De paso se reescriben las políticas de pertenencia que quedan debajo, sin cambiar su
-- semántica: `auth.uid()` pasa a `(select auth.uid())` para que Postgres lo evalúe una vez y
-- no por fila, y el subquery anidado de delivery_attempts / proof_of_delivery pasa a un JOIN.
-- Mientras la política abierta las tapaba, ese costo no se pagaba; al quitarla, empieza a
-- pagarse. Con 536 envíos es despreciable, pero es el patrón que ya produjo timeouts en
-- otras tablas de este proyecto.
--
-- Verificación tras aplicar:
--   has_table_privilege('anon', tabla, 'SELECT')          → false en las 4
--   has_table_privilege('authenticated', tabla, 'SELECT') → true  en las 4
--   políticas con qual = true                             → 0
--   políticas por tabla                                   → 1 (la de pertenencia)
--
-- Rollback: supabase/rollbacks/20260914130000_fase0_1_cerrar_rls_publica_transporte_rollback.sql

DROP POLICY IF EXISTS shipments_public_read          ON public.shipments;
DROP POLICY IF EXISTS transport_carriers_public_read ON public.transport_carriers;
DROP POLICY IF EXISTS delivery_attempts_public_read  ON public.delivery_attempts;
DROP POLICY IF EXISTS proof_of_delivery_public_read  ON public.proof_of_delivery;

REVOKE ALL ON public.shipments, public.transport_carriers,
              public.delivery_attempts, public.proof_of_delivery FROM anon;

DROP POLICY IF EXISTS shipments_org_access ON public.shipments;
CREATE POLICY shipments_org_access ON public.shipments FOR ALL TO public
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS transport_carriers_org_access ON public.transport_carriers;
CREATE POLICY transport_carriers_org_access ON public.transport_carriers FOR ALL TO public
  USING (organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS delivery_attempts_org_access ON public.delivery_attempts;
CREATE POLICY delivery_attempts_org_access ON public.delivery_attempts FOR ALL TO public
  USING (shipment_id IN (
    SELECT s.id FROM public.shipments s
    JOIN public.organization_members om ON om.organization_id = s.organization_id
    WHERE om.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS pod_org_access ON public.proof_of_delivery;
CREATE POLICY pod_org_access ON public.proof_of_delivery FOR ALL TO public
  USING (shipment_id IN (
    SELECT s.id FROM public.shipments s
    JOIN public.organization_members om ON om.organization_id = s.organization_id
    WHERE om.user_id = (select auth.uid())
  ));
