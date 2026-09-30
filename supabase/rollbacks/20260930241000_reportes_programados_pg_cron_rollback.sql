-- Quita el job de pg_cron de los envíos programados. No borra envíos ni correos.
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'reportes-programados' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
