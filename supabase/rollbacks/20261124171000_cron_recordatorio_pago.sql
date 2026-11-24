-- Reversión de 20261124171000_cron_recordatorio_pago.sql
do $uns$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'recordatorio-pago-sitio';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$uns$;
