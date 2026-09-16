-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_09_pg_cron_jobs_inactivos`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 ffa666c4d9ef7b5b0b5d0123fd23fb3c). No reformatear.
-- M6: pg_cron + pg_net → /api/crm/jobs/run (jobs creados INACTIVOS hasta que el runner esté desplegado)
CREATE OR REPLACE FUNCTION public.fn_crm_cron_post(p_path text DEFAULT '/api/crm/jobs/run')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, net AS $$
DECLARE v_secret text; v_url text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'crm_cron_secret' ORDER BY created_at DESC LIMIT 1;
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'crm_app_url' ORDER BY created_at DESC LIMIT 1;
  IF v_secret IS NULL OR v_url IS NULL OR length(v_secret) < 16 THEN
    RAISE EXCEPTION 'fn_crm_cron_post: crm_cron_secret / crm_app_url ausentes en vault (fail-closed)';
  END IF;
  SELECT net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json', 'X-Cron-Source', 'pg_cron'),
    timeout_milliseconds := 55000) INTO v_req;
  RETURN v_req;
END $$;
REVOKE ALL ON FUNCTION public.fn_crm_cron_post(text) FROM PUBLIC, anon, authenticated;

-- (re)crear jobs de forma idempotente y dejarlos inactivos (cron.alter_job; UPDATE directo sobre cron.job no está permitido al rol de migración)
DO $$
DECLARE j record; v_id bigint;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('crm-jobs-every-minute','crm-campaigns-5min','crm-daily-maintenance') LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  v_id := cron.schedule('crm-jobs-every-minute', '* * * * *', $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run')$c$);
  PERFORM cron.alter_job(v_id, active := false);
  v_id := cron.schedule('crm-campaigns-5min', '*/5 * * * *', $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run?kind=campaign_batch')$c$);
  PERFORM cron.alter_job(v_id, active := false);
  -- cron.timezone = GMT: 08:30 UTC = 03:30 America/Bogota
  v_id := cron.schedule('crm-daily-maintenance', '30 8 * * *', $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run?kind=maintenance')$c$);
  PERFORM cron.alter_job(v_id, active := false);
END $$;