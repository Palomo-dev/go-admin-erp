-- Programa el recordatorio «Termina tu pago» cada 5 minutos, por pg_cron (como
-- 'compra-pendiente-sitio'), no en vercel.json de la tienda.
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

select cron.schedule(
  'recordatorio-pago-sitio',
  '*/5 * * * *',
  $cron$select public.fn_websites_cron_post('/api/cron/recordatorio-pago')$cron$
);
