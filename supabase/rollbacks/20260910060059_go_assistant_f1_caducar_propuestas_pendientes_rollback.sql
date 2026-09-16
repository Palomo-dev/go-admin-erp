-- Reversión de 20260910060059_go_assistant_f1_caducar_propuestas_pendientes.sql
select cron.unschedule('go-assistant-expire-actions')
 where exists (select 1 from cron.job where jobname = 'go-assistant-expire-actions');
drop function if exists public.fn_expire_ai_agent_actions();
