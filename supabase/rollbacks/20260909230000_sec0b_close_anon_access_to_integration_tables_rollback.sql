-- 20260909230000_sec0b_close_anon_access_to_integration_tables_rollback.sql
-- Revierte 20260909230000_sec0b_close_anon_access_to_integration_tables.sql
--
-- Restaura el GRANT SELECT a anon (el único privilegio que se verificó que anon tenía
-- antes) y las tres políticas abiertas al público.
--
-- ADVERTENCIA: este rollback vuelve a hacer legibles con la anon key pública las
-- credenciales de todas las integraciones de todas las organizaciones. Úsalo sólo si el
-- cierre rompió algo irreparable de otra forma, y por el menor tiempo posible.
--
-- No toca datos: la migración no modificó ninguna fila.

GRANT SELECT ON public.integration_credentials TO anon;
DROP POLICY IF EXISTS "Allow anon select integration_credentials" ON public.integration_credentials;
CREATE POLICY "Allow anon select integration_credentials"
  ON public.integration_credentials FOR SELECT TO public USING (true);

GRANT SELECT ON public.integration_connections TO anon;
DROP POLICY IF EXISTS "Allow anon select integration_connections" ON public.integration_connections;
CREATE POLICY "Allow anon select integration_connections"
  ON public.integration_connections FOR SELECT TO public USING (true);

GRANT SELECT ON public.integration_connectors TO anon;
DROP POLICY IF EXISTS "Allow anon select integration_connectors" ON public.integration_connectors;
CREATE POLICY "Allow anon select integration_connectors"
  ON public.integration_connectors FOR SELECT TO public USING (true);
