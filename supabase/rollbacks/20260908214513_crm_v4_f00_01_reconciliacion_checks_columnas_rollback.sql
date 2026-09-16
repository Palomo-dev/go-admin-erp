-- ============================================================
-- ROLLBACK de 20260908214513_crm_v4_f00_01_reconciliacion_checks_columnas
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Orden inverso a M1. Los CHECK que la migración "amplió" se vuelven a crear
-- sin los valores nuevos (ai_call/task, mixed, sell_product/book_meeting,
-- engine); la lista anterior exacta no quedó registrada, así que si alguna fila
-- ya usa un valor nuevo el ADD CONSTRAINT fallará y habrá que limpiar antes.
-- call_recordings_status_check se re-declaró con los MISMOS valores: no se toca.
--
-- SOBRE LOS DATOS: este rollback restaura la estructura, no los datos. El backfill de
-- conversations.last_inbound_at y los valores escritos después en las columnas
-- nuevas (customers.timezone, activities.*_id, messages.related_opportunity_id,
-- templates.blocks_json/engine/version/preheader) se pierden al quitar las columnas.
-- ============================================================

begin;

-- last_inbound_at (trigger, índice, columna: pierde el backfill)
drop trigger if exists trg_messages_set_last_inbound on public.messages;
drop function if exists public.fn_messages_set_last_inbound();
drop index if exists public.conversations_last_inbound_at_idx;
alter table public.conversations drop column if exists last_inbound_at;

-- templates
drop index if exists public.templates_org_channel_idx;
alter table public.templates drop constraint if exists templates_engine_check;
alter table public.templates
  drop column if exists blocks_json,
  drop column if exists engine,
  drop column if exists version,
  drop column if exists preheader;

-- voice_agents.purpose_type sin sell_product/book_meeting
alter table public.voice_agents drop constraint if exists voice_agents_purpose_type_check;
alter table public.voice_agents add constraint voice_agents_purpose_type_check
  check (purpose_type in ('qualify_lead','confirm_demo','follow_up_proposal','reactivate_cold',
    'collect_payment','nps_survey','renewal_reminder','custom'));

-- customers.timezone
alter table public.customers drop column if exists timezone;

-- messages.related_opportunity_id
drop index if exists public.idx_messages_related_opportunity;
alter table public.messages drop column if exists related_opportunity_id;

-- activities: índices, FKs y CHECK ampliado
drop index if exists public.activities_org_related_occurred_idx;
drop index if exists public.activities_conversation_id_idx;
drop index if exists public.activities_message_id_idx;
drop index if exists public.activities_email_message_id_idx;
drop index if exists public.activities_call_id_idx;
alter table public.activities
  drop column if exists conversation_id,
  drop column if exists message_id,
  drop column if exists email_message_id,
  drop column if exists call_id;
alter table public.activities drop constraint if exists activities_activity_type_check;
alter table public.activities add constraint activities_activity_type_check
  check (activity_type in ('call','email','whatsapp','sms','meeting','visit','note','system'));

-- call_analyses.sentiment sin mixed
alter table public.call_analyses drop constraint if exists call_analyses_sentiment_check;
alter table public.call_analyses add constraint call_analyses_sentiment_check
  check (sentiment is null or sentiment in ('positive','neutral','negative'));

-- call_recordings.updated_at + trigger
drop trigger if exists set_call_recordings_updated_at on public.call_recordings;
alter table public.call_recordings drop column if exists updated_at;

commit;
