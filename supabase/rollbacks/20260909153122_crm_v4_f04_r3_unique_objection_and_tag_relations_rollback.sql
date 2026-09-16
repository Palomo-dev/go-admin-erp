-- ============================================================
-- ROLLBACK de 20260909153122_crm_v4_f04_r3_unique_objection_and_tag_relations
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita los dos índices UNIQUE (callAnalysisService.applyAnalysis vuelve a fallar con 42P10 en el upsert).
-- ============================================================

begin;
drop index if exists public.call_tag_relations_call_tag_uidx;
drop index if exists public.opportunity_objections_opp_objection_uidx;
commit;
