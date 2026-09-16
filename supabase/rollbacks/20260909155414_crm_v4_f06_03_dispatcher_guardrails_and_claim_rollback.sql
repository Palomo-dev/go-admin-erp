-- ============================================================
-- ROLLBACK de 20260909155414_crm_v4_f06_03_dispatcher_guardrails_and_claim
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita las dos funciones de F6-06/07, las columnas y los índices añadidos a
-- voice_agent_calls / voice_agent_campaigns / voice_agents y devuelve el CHECK de
-- status a los 5 valores previos. Si se aplicaron f06_04 (redefine
-- fn_claim_voice_agent_calls) o f06_08 (índice sobre status), revertirlas antes.
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos (se pierden CallSid, intentos, consentimiento y topes). Si hay llamadas con los 5 estados nuevos el ADD CONSTRAINT falla: normalizarlas antes.
-- ============================================================

begin;
drop function if exists public.fn_stop_voice_campaign(integer, uuid, text);
drop function if exists public.fn_claim_voice_agent_calls(integer, uuid, integer, text);

alter table public.voice_agents drop column if exists voice_ref_id, drop column if exists identity_disclosure;

alter table public.voice_agent_campaigns drop constraint if exists voice_agent_campaigns_hourly_cap_check;
alter table public.voice_agent_campaigns
  drop column if exists consecutive_failures, drop column if exists stopped_at, drop column if exists stopped_reason,
  drop column if exists emergency_stop, drop column if exists max_calls_per_hour;

alter table public.voice_agent_calls drop constraint if exists voice_agent_calls_status_check;
alter table public.voice_agent_calls add constraint voice_agent_calls_status_check
  check (status = any (array['pending','queued','in_progress','completed','failed']));
drop index if exists public.idx_vac_campaign_created;
drop index if exists public.idx_vac_provider_sid;
alter table public.voice_agent_calls
  drop column if exists last_error_code, drop column if exists consent_given, drop column if exists locked_by,
  drop column if exists claimed_at, drop column if exists stage_agent_id, drop column if exists attempts,
  drop column if exists provider_call_sid;
commit;
