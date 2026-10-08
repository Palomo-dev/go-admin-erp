-- Rollback de 20261008131856_voz_resultado_llamada_categoria.
--
-- Antes de aplicarlo, revierte el código que escribe `resultado`
-- (voiceAgentTools.endCall, guardarResultadoLlamada.ts): sin la columna, la
-- escritura de end_call fallaría entera. Se pierde la categoría de cada llamada;
-- el detalle sigue en `outcome`.

drop index if exists public.idx_voice_agent_calls_org_campaign_resultado;
alter table public.voice_agent_calls drop constraint if exists voice_agent_calls_resultado_check;
alter table public.voice_agent_calls drop column if exists resultado;
