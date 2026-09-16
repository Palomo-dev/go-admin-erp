-- ============================================================
-- ROLLBACK de 20260908220220_crm_v4_f00_11_advisors_trigger_fn_grants_fk_indexes
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita los 5 índices y devuelve EXECUTE (default PUBLIC) a las 4 funciones de trigger.
-- ============================================================

begin;
drop index if exists public.call_analyses_transcript_id_idx;
drop index if exists public.call_analyses_call_id_idx;
drop index if exists public.call_recordings_call_id_idx;
drop index if exists public.user_comm_preferences_default_caller_id_idx;
drop index if exists public.user_comm_preferences_user_id_idx;
grant execute on function public.fn_messages_set_last_inbound() to public;
grant execute on function public.fn_opp_created_enqueue() to public;
grant execute on function public.fn_opp_stage_change_enqueue() to public;
grant execute on function public.fn_seed_provider_configs_on_org() to public;
commit;
