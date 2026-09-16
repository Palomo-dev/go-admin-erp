-- Rollback de crm_v4_f00_41 — devuelve los jobs 17 y 19 de pg_cron a su definición
-- anterior (DB-r2, crm_v4_f00_15). No toca `active` (ambos estaban en false).
-- Sin credenciales: fn_crm_cron_post lee el secreto de Vault.

do $$
begin
  if exists (select 1 from cron.job where jobid = 17 and jobname = 'crm-jobs-every-minute') then
    perform cron.alter_job(job_id => 17, schedule => '* * * * *');
  end if;

  if exists (select 1 from cron.job where jobid = 19 and jobname = 'crm-daily-maintenance') then
    perform cron.alter_job(
      job_id  => 19,
      command => $cmd$SELECT public.fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["recording_cleanup","maintenance"]}'::jsonb)$cmd$
    );
  end if;
end
$$;
