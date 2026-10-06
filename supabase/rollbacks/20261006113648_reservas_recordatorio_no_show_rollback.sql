-- Rollback de 20261007100400_reservas_recordatorio_no_show.
-- Primero se quitan los cron; las columnas se borran al final (se pierden las marcas
-- de recordatorio / no-show / aviso: el estado `no_show` de las reservas se conserva).

select cron.unschedule(jobid) from cron.job where jobname in ('reservas-mesas-retraso', 'reservas-mesas-recordatorios');
drop function if exists public.fn_reservas_mesa_avisos_retraso();
drop function if exists public.fn_reservas_mesa_recordatorios_reclamar(integer);
drop index if exists public.idx_restaurant_reservations_vivas;
alter table public.restaurant_reservations
  drop column if exists arrival_wait_until,
  drop column if exists late_alert_sent_at,
  drop column if exists no_show_at,
  drop column if exists reminder_sent_at;
