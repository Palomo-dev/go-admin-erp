-- ============================================================
-- ROLLBACK de 20260909043152_crm_v4_f00_28_revoke_public_credit_rpcs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE a PUBLIC (default de CREATE FUNCTION) sobre las dos RPC de créditos.
--
-- SOBRE LOS DATOS: no toca datos. Estado inseguro anterior.
-- ============================================================

begin;
grant execute on function public.decrement_ai_credits(integer, integer) to public;
grant execute on function public.deduct_comm_credits(integer, text, integer) to public;
commit;
