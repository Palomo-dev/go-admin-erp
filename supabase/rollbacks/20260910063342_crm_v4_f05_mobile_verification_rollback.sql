-- ============================================================
-- ROLLBACK de 20260910063342_crm_v4_f05_mobile_verification
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina el índice único del celular verificado, fn_mobile_otp_allowed (f05_otp_fn_service_role_only va antes) y la tabla de intentos.
--
-- SOBRE LOS DATOS: destruye el registro de intentos de OTP (PII). El rate limit desaparece.
-- ============================================================

begin;
drop index if exists public.uq_ucp_org_verified_mobile;
drop function if exists public.fn_mobile_otp_allowed(uuid, text);
drop table if exists public.mobile_verification_attempts cascade;
commit;
