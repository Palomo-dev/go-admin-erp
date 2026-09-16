-- ============================================================
-- ROLLBACK de 20260908215046_crm_v4_f00_05_funciones_cola_eventos_consent
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita vista, triggers, funciones de cola/outbox/consentimiento. Los rollbacks
-- de f00_12/15/16 (que redefinen fn_can_contact, fn_crm_cron_post y crean
-- fn_release_job) y los de F6/F8 (que llaman a fn_enqueue_job) van antes.
-- ============================================================

begin;
drop view if exists public.v_outbound_jobs_failed;
drop function if exists public.fn_can_contact(integer, uuid, text, text);
drop trigger if exists trg_opp_created_enqueue on public.opportunities;
drop function if exists public.fn_opp_created_enqueue();
drop trigger if exists trg_opp_stage_change_enqueue on public.opportunities;
drop function if exists public.fn_opp_stage_change_enqueue();
drop function if exists public.fn_emit_crm_event(integer, text, text, uuid, jsonb);
drop function if exists public.fn_fail_job(uuid, text, text, integer);
drop function if exists public.fn_complete_job(uuid, text, jsonb);
drop function if exists public.fn_claim_jobs(text[], integer, text);
drop function if exists public.fn_enqueue_job(integer, text, jsonb, timestamptz, text, integer);
commit;
