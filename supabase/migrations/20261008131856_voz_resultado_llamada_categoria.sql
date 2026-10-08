-- Categoría fija del resultado de cada llamada del agente de voz.
-- Pedido del dueño de la org 125 (2026-10-08): casi ninguna llamada contestada
-- tenía un resultado contable; outcome es texto libre y se conserva como detalle.
alter table public.voice_agent_calls add column if not exists resultado text;
alter table public.voice_agent_calls add constraint voice_agent_calls_resultado_check check (resultado is null or resultado in ('cita_agendada','devolver_llamada','interesado','pide_informacion','no_es_encargado','sin_interes','no_contactar','numero_equivocado','conversacion_sin_resultado','transferida','colgo_en_saludo','buzon','fax','no_contesto','ocupado','fallida'));
create index if not exists idx_voice_agent_calls_org_campaign_resultado on public.voice_agent_calls (organization_id, campaign_id, resultado);
comment on column public.voice_agent_calls.resultado is 'Categoría fija del resultado de la llamada (src/lib/services/crm/voiceAgent/resultadoLlamada.ts). outcome conserva el detalle en texto libre.';
