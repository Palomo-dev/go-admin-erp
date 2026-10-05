-- Despachador de campañas del agente de voz cada 5 minutos (FASE-06, paso 3).
-- Antes no había ninguna tarea programada: una campaña «en curso» solo
-- llamaba cuando alguien pulsaba «Ejecutar ahora». El despachador
-- (/api/voice/agent-campaigns/run, Bearer CRON_SECRET) solo atiende campañas
-- running sin parada de emergencia y aplica horario de la campaña, Ley 2300,
-- exclusiones, topes, concurrencia y créditos antes de cada llamada.
select cron.schedule('voz-campanas-5min', '*/5 * * * *', $c$select public.fn_crm_cron_post('/api/voice/agent-campaigns/run')$c$);
