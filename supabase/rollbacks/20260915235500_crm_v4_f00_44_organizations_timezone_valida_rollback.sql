-- =============================================================================
-- ROLLBACK de crm_v4_f00_44_organizations_timezone_valida
-- Elimina el trigger y su función. No toca datos: las zonas ya canonizadas
-- se quedan como están (siguen siendo válidas).
--
-- ADVERTENCIA: al revertir, `organizations.timezone` vuelve a aceptar cualquier
-- texto desde sesión; la app sigue validando con Intl.supportedValuesOf en
-- `useCalendarSettings`, y `fn_ai_usage_month` (mig. 39) resuelve por sí misma
-- una zona desconocida a UTC, así que no hay 500 por esta vía.
-- =============================================================================

begin;

drop trigger if exists trg_validate_org_timezone on public.organizations;
drop function if exists public.fn_validate_org_timezone();

commit;
