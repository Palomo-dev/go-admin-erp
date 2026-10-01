-- El cron de Vercel no procesaba los envíos programados. pg_cron llama
-- POST /api/cron/reportes-programados cada 15 minutos. El secreto y la URL
-- salen de Vault, dentro de fn_crm_cron_post. Sin credenciales en este archivo.
do $$
declare
  j record;
  v_id bigint;
begin
  for j in select jobid from cron.job where jobname = 'reportes-programados' loop
    perform cron.unschedule(j.jobid);
  end loop;
  v_id := cron.schedule(
    'reportes-programados',
    '*/15 * * * *',
    $cmd$select public.fn_crm_cron_post('/api/cron/reportes-programados')$cmd$
  );
end $$;
