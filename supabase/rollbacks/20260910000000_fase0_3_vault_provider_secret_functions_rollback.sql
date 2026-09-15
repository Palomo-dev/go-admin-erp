-- 20260910000000_fase0_3_vault_provider_secret_functions_rollback.sql
-- Revierte 20260910000000_fase0_3_vault_provider_secret_functions.sql
--
-- Elimina las dos funciones. No toca vault.secrets ni integration_credentials.
--
-- ADVERTENCIA sobre datos: cualquier credencial que ya se haya guardado por
-- fn_set_provider_secret tiene su `secret_ref` como uuid del vault. Sin la función de
-- lectura, ese secreto sigue existiendo en vault.secrets pero ningún código de la
-- aplicación lo puede resolver. Antes de aplicar este rollback, comprueba cuántas hay:
--   select count(*) from integration_credentials
--    where secret_ref ~ '^[0-9a-f-]{36}$';
-- Si es > 0, este rollback deja esas integraciones sin credencial usable.

DROP FUNCTION IF EXISTS public.fn_get_provider_secret(uuid, text);
DROP FUNCTION IF EXISTS public.fn_set_provider_secret(uuid, text, text, text);
