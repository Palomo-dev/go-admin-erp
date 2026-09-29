-- Rollback de 20260929001200_membresias_cron_vencimiento.sql
-- Quita la tarea programada. Las membresías ya vencidas por la tarea no se reactivan.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'membresias-vencer') then
    perform cron.unschedule('membresias-vencer');
  end if;
end $$;
