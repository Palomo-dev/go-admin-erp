-- Limpieza diaria de public.widget_rate_limit (ventanas de más de 2 días) con pg_cron.
-- La función public.widget_limpiar_rate_limit() existe desde 20260910193850 pero nunca se programó.
-- Aplicada por MCP el 2026-11-04 (versión 20261104021030).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'widget-limpiar-rate-limit') then
    perform cron.unschedule('widget-limpiar-rate-limit');
  end if;
end $$;
select cron.schedule('widget-limpiar-rate-limit', '23 4 * * *', $$select public.widget_limpiar_rate_limit()$$);
