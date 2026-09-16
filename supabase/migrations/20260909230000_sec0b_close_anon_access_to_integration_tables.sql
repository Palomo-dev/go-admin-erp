-- 20260909230000_sec0b_close_anon_access_to_integration_tables.sql
-- Versión aplicada en Supabase: 20260909234239 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Versionada a posteriori: se aplicó bajo la regla anterior ("cero .sql en el repo").
--
-- SEC-0.b (GO-1) — Cierra el acceso anónimo a las tablas del backbone de integraciones.
--
-- Motivo: las políticas "Allow anon select …" eran FOR SELECT TO public USING (true),
-- y la anon key viaja en el bundle de los sitios públicos. Eso hacía legible
-- integration_credentials.secret_ref, que en ese momento contenía el secreto literal:
-- 16 credenciales de una pasarela de pagos, de 4 organizaciones, 3 de ellas en producción.
--
-- Verificado antes de aplicar (últimas 24 h de edge_logs):
--   integration_credentials  → 74 peticiones, TODAS con rol service_role
--   integration_connections  → 76.628 peticiones, TODAS con rol service_role
--   integration_connectors   → catálogo; los lectores del ERP van como authenticated
-- Y en el código: los consumidores de ambos repos son server-side con service role.
--
-- Queda cubierto el acceso legítimo por las políticas ya existentes:
--   integration_credentials  → "Credentials are viewable by organization admins"  (authenticated)
--   integration_connections  → "Connections are viewable by organization members" (authenticated)
--                            + "Connections are manageable by organization admins"
--   integration_connectors   → "Connectors are viewable by authenticated users"   (authenticated)
-- El rol `authenticated` tiene sus propios GRANT (SELECT/INSERT/UPDATE) en las tres
-- tablas, así que revocar a `anon` no afecta a la UI del ERP.
--
-- organization_payment_methods NO entra aquí a propósito: tenía 186 lecturas con anon key
-- en 24 h, incluidas 163 de Edge Functions cuyo rol no se pudo atribuir desde los logs.
--
-- Rollback: supabase/rollbacks/20260909230000_sec0b_close_anon_access_to_integration_tables_rollback.sql

DROP POLICY IF EXISTS "Allow anon select integration_credentials" ON public.integration_credentials;
REVOKE ALL ON public.integration_credentials FROM anon;

DROP POLICY IF EXISTS "Allow anon select integration_connections" ON public.integration_connections;
REVOKE ALL ON public.integration_connections FROM anon;

DROP POLICY IF EXISTS "Allow anon select integration_connectors" ON public.integration_connectors;
REVOKE ALL ON public.integration_connectors FROM anon;
