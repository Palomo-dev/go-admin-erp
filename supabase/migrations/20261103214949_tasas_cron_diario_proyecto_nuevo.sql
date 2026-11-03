-- Cron diario del catálogo global de tasas en el proyecto nuevo
-- (taqjemqjtumhwptchcxk, recreado el 2026-11-03 tras borrarse el anterior).
--
-- El job `mantener-datos-reales-diarios` no llegó a `cron.job` al restaurar el
-- esquema desde migraciones: se programaba a mano. Se recrea con el mismo
-- horario que documenta el ADR-004 (`0 2 * * 1-6`, 02:00 UTC de lunes a sábado)
-- y la misma entrada, `public.fn_cron_actualizar_tasas()`, que lee la clave
-- secreta de Vault (`service_role_key`) y llama a la Edge Function
-- `actualizar-tasas-cambio` (versionada en supabase/functions/ desde este commit).
--
-- La Edge Function decide el día con `fn_today_system()`. A las 02:00 UTC eso es
-- el día anterior en la zona del catálogo, así que el job escribe las tasas del
-- día que está terminando (domingo a viernes en esa zona); quien lee busca la
-- vigente con `rate_date <= día`, y el sábado usa la del viernes.
--
-- No se programa `auto_update_exchange_rates()` (el antiguo job 5): manda una
-- clave de ejemplo redactada en lugar de una clave real y su llamada siempre
-- sería rechazada; con un solo job basta.
--
-- Idempotente: `cron.schedule` con un nombre ya existente actualiza ese job en
-- vez de crear otro. Sin credenciales: la clave sale de Vault en cada ejecución.
select cron.schedule(
  'mantener-datos-reales-diarios',
  '0 2 * * 1-6',
  $c$select public.fn_cron_actualizar_tasas();$c$
);
