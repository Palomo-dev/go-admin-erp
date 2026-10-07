-- Rollback de 20261007032847_voz_recolector_llamadas_colgadas.
--
-- Quita la función del recolector. Antes de aplicarlo, desplegar una versión
-- de `runCampaignQueue` que no la llame: el código actual registra el fallo y
-- sigue (los conteos de concurrencia ignoran por su cuenta las filas sin
-- actualizar en 15 min), pero cada pasada del cron dejaría un error en el log.
--
-- NO revierte datos: las filas que el recolector ya cerró (rastro en
-- `calls.metadata.recolector` y, por inactividad, `voice_agent_calls.last_error_code
-- = 'RECOLECTOR'`) se quedan cerradas. Reabrirlas a `in_progress` volvería a
-- bloquear la concurrencia.

drop function if exists public.fn_vac_recoger_colgadas(integer, integer);
