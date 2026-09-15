-- ============================================================
-- ROLLBACK de 20260909184837_crm_v4_f06_08_dedupe_atomico_despacho_puntual
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita el índice único parcial (la deduplicación de dispatchAgentCall vuelve a ser consulta+insert, con carrera).
-- ============================================================

begin;
drop index if exists public.voice_agent_calls_una_viva_por_cliente;
commit;
