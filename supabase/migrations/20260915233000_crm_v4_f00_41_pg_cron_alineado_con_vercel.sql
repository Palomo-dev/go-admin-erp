-- crm_v4_f00_41 — pg_cron alineado con el contrato de scheduling (F0-JOBS r3, QA r2 N-3)
--
-- ESTADO: PENDIENTE DE APLICAR. La ronda r3 de JOBS es de solo lectura sobre la BD;
-- el orquestador la aplica con `apply_migration` tras revisar este SQL.
--
-- Contexto (verificado por MCP el 2026-09-15, solo SELECT sobre cron.job):
--   17 crm-jobs-every-minute   '* * * * *'   active=false  body '{}'
--   18 crm-campaigns-5min      '*/5 * * * *' active=false  body {"kinds":["campaign_batch"]}
--   19 crm-daily-maintenance   '30 8 * * *'  active=false  body {"kinds":["recording_cleanup","maintenance"]}
--
-- Decisión (FASE-00 §2.2 / §13 r3, src/lib/jobs/schedule.ts): Vercel Cron es el
-- scheduler PRIMARIO (drenaje total */2 desde 9c0288a7; evidencia real en BD desde
-- 2026-09-11) y pg_cron el RESPALDO. Esta migración NO activa nada: solo deja los
-- tres jobs espejo exacto de vercel.json / VERCEL_SCHEDULE_KINDS para que, si el
-- dueño los enciende (cron.alter_job(jobid, active => true)), no haya doble
-- ejecución con cadencias distintas ni tareas F11 que solo corran desde Vercel.
--
--   17: '* * * * *' → '*/2 * * * *'   (misma cadencia que DRAIN_SCHEDULE)
--   19: body añade "health_recalculate" y "renewals_sync"
--   18: sin cambios (ya coincide con '*/5 * * * *' → campaign_batch)
--
-- Idempotente: cron.alter_job sobre jobs existentes; si un jobid no existe, no hace nada.
-- Sin credenciales: fn_crm_cron_post lee el secreto de Vault (crm_cron_secret).

do $$
begin
  if exists (select 1 from cron.job where jobid = 17 and jobname = 'crm-jobs-every-minute') then
    perform cron.alter_job(job_id => 17, schedule => '*/2 * * * *');
  end if;

  if exists (select 1 from cron.job where jobid = 19 and jobname = 'crm-daily-maintenance') then
    perform cron.alter_job(
      job_id  => 19,
      command => $cmd$SELECT public.fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["recording_cleanup","maintenance","health_recalculate","renewals_sync"]}'::jsonb)$cmd$
    );
  end if;
end
$$;

-- Verificación (esperado: 17 '*/2 * * * *'; 19 con los 4 kinds; los tres active=false):
-- select jobid, jobname, schedule, active, command from cron.job where jobid in (17,18,19) order by jobid;
