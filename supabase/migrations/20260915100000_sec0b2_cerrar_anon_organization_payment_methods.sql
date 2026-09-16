-- 20260915100000_sec0b2_cerrar_anon_organization_payment_methods.sql
-- Versión aplicada en Supabase: ver `select version from supabase_migrations.schema_migrations where name = 'sec0b2_cerrar_anon_organization_payment_methods'`.
-- SEC-0.b (parte 2, GO-1) — Cierra el acceso anónimo a organization_payment_methods.
--
-- Quedó fuera del primer lote (2026-09-09) porque tenía 186 lecturas con anon key en 24 h,
-- 163 de ellas desde Edge Functions cuyo rol los logs no etiquetaban. Resuelto leyendo
-- el fuente desplegado de la única función que la consulta (chat-widget): usa
-- SUPABASE_SERVICE_ROLE_KEY para todo su acceso a la base. Las claves en formato nuevo
-- (no-JWT) no llevan rol en el payload y por eso el log las mostraba vacías. Las 17
-- lecturas de navegador iban con sesión `authenticated`, cubierta por
-- payment_methods_lectura (miembro activo de la organización).
--
-- La lectura pública real del checkout (app/checkout/page.tsx del sitio) es server-side
-- con service role: no se ve afectada.
--
-- Verificado en begin … rollback y tras aplicar con la anon key real: 42501 permission
-- denied; el checkout con service role sigue en 200. authenticated y service_role intactos,
-- 0 políticas abiertas, quedan payment_methods_lectura y payment_methods_escritura.
--
-- Rollback: supabase/rollbacks/20260915100000_sec0b2_cerrar_anon_organization_payment_methods_rollback.sql

DROP POLICY IF EXISTS "Allow anon select organization_payment_methods" ON public.organization_payment_methods;
REVOKE ALL ON public.organization_payment_methods FROM anon;
