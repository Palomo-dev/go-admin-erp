-- ============================================================
-- ROLLBACK de 20260910071154_crm_v4_f05_otp_fn_service_role_only
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE a authenticated sobre fn_mobile_otp_allowed (estado de f05_mobile_verification).
-- ============================================================

begin;
grant execute on function public.fn_mobile_otp_allowed(uuid, text) to authenticated;
commit;
