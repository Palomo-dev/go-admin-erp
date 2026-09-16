-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_15_cron_post_body_kinds`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 44a79ac250b03531f90efdc38a5ab6ad). No reformatear.
-- P6 (tester riesgo cron 19 / JOBS "Necesito de DB" b): fn_crm_cron_post acepta body jsonb.
-- Se elimina la sobrecarga de 1 argumento para que fn_crm_cron_post('/ruta') no sea ambigua.
DROP FUNCTION IF EXISTS public.fn_crm_cron_post(text);

CREATE OR REPLACE FUNCTION public.fn_crm_cron_post(p_path text DEFAULT '/api/crm/jobs/run'::text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net'
AS $function$
DECLARE v_secret text; v_url text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'crm_cron_secret' ORDER BY created_at DESC LIMIT 1;
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'crm_app_url' ORDER BY created_at DESC LIMIT 1;
  IF v_secret IS NULL OR v_url IS NULL OR length(v_secret) < 16 THEN
    RAISE EXCEPTION 'fn_crm_cron_post: crm_cron_secret / crm_app_url ausentes en vault (fail-closed)';
  END IF;
  SELECT net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := COALESCE(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json', 'X-Cron-Source', 'pg_cron'),
    timeout_milliseconds := 55000) INTO v_req;
  RETURN v_req;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_crm_cron_post(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_cron_post(text, jsonb) TO service_role;

-- Los 3 jobs (siguen INACTIVOS) envian kinds por body, espejo de vercel.json.
SELECT cron.alter_job(jobid, command := $$SELECT public.fn_crm_cron_post('/api/crm/jobs/run')$$)
  FROM cron.job WHERE jobname = 'crm-jobs-every-minute';
SELECT cron.alter_job(jobid, command := $$SELECT public.fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["campaign_batch"]}'::jsonb)$$)
  FROM cron.job WHERE jobname = 'crm-campaigns-5min';
SELECT cron.alter_job(jobid, command := $$SELECT public.fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["recording_cleanup","maintenance"]}'::jsonb)$$)
  FROM cron.job WHERE jobname = 'crm-daily-maintenance';