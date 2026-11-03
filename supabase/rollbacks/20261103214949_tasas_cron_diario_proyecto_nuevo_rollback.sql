-- Rollback de 20261103214949_tasas_cron_diario_proyecto_nuevo.
-- Quita el job diario de tasas. No toca `currency_rates`: las filas que el job
-- haya escrito se conservan (son datos del catálogo, no estructura).
-- La Edge Function `actualizar-tasas-cambio` no es parte de la migración; para
-- dejar de servirla hay que retirarla o desplegar otra versión aparte.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mantener-datos-reales-diarios') then
    perform cron.unschedule('mantener-datos-reales-diarios');
  end if;
end $$;
