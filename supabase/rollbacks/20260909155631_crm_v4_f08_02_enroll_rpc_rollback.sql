-- ============================================================
-- ROLLBACK de 20260909155631_crm_v4_f08_02_enroll_rpc
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina fn_enroll_in_sequence y fn_pause_sequences_on_reply (si se aplicó f08_03, que las redefine/añade fn_resume_sequence_enrollment, revertirla antes). sequenceService vuelve al camino en 3 pasos solo si se revierte el TS.
-- ============================================================

begin;
drop function if exists public.fn_pause_sequences_on_reply(integer, uuid, uuid, text);
drop function if exists public.fn_enroll_in_sequence(integer, uuid, uuid, uuid, text, uuid, timestamptz);
commit;
