-- ============================================================
-- ROLLBACK de 20260909155341_crm_v4_f06_02_stage_agents_voices_tool_runs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina las 3 tablas de F6-15/16 (voice_agent_tool_runs, stage_agents, voices) con sus políticas e índices. CASCADE por las FKs de f06_03/f06_04 (voice_agent_calls.stage_agent_id, voice_agents.voice_ref_id, voice_agent_call_attempts).
--
-- SOBRE LOS DATOS: destruye la configuración por etapa, el catálogo de voces y la auditoría de herramientas del agente. No recuperable sin backup.
-- ============================================================

begin;
drop table if exists public.voice_agent_tool_runs cascade;
drop table if exists public.stage_agents cascade;
drop table if exists public.voices cascade;
commit;
