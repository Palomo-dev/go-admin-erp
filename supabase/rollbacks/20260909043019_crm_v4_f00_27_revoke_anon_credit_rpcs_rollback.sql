-- ============================================================
-- ROLLBACK de 20260909043019_crm_v4_f00_27_revoke_anon_credit_rpcs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE a anon sobre las dos RPC de créditos (estado inseguro anterior).
--
-- SOBRE LOS DATOS: no toca datos. Reabre el débito/abono de saldo de cualquier organización desde la clave anónima.
-- ============================================================

begin;
grant execute on function public.decrement_ai_credits(integer, integer) to anon;
grant execute on function public.deduct_comm_credits(integer, text, integer) to anon;
commit;
