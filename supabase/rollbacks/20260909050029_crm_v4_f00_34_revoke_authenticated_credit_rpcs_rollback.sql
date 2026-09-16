-- ============================================================
-- ROLLBACK de 20260909050029_crm_v4_f00_34_revoke_authenticated_credit_rpcs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE a authenticated sobre las tres RPC de créditos (estado anterior a la tarea 3 de r4).
--
-- SOBRE LOS DATOS: no toca datos. refund_ai_credits ya era solo service_role desde f00_18/19 y no se reabre. Estado inseguro anterior (hallazgo H de r3).
-- ============================================================

begin;
grant execute on function public.decrement_ai_credits(integer, integer) to authenticated;
grant execute on function public.deduct_comm_credits(integer, text, integer) to authenticated;
commit;
