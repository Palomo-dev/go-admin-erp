-- Reversión de 20261104021030: deja de programar la limpieza (la función no se toca).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'widget-limpiar-rate-limit') then
    perform cron.unschedule('widget-limpiar-rate-limit');
  end if;
end $$;
