-- ============================================================
-- ROLLBACK de 20260908222832_crm_v4_f00_15_cron_post_body_kinds
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Vuelve a la firma de un argumento fn_crm_cron_post(text) (cuerpo de f00_09) y
-- deja los jobs 18/19 con la ruta por query string, como antes de P6.
-- ============================================================

begin;
drop function if exists public.fn_crm_cron_post(text, jsonb);

create or replace function public.fn_crm_cron_post(p_path text default '/api/crm/jobs/run')
returns bigint language plpgsql security definer set search_path = public, vault, net as $$
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
revoke all on function public.fn_crm_cron_post(text) from public, anon, authenticated;

select cron.alter_job(jobid, command := $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run')$c$)
  from cron.job where jobname = 'crm-jobs-every-minute';
select cron.alter_job(jobid, command := $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run?kind=campaign_batch')$c$)
  from cron.job where jobname = 'crm-campaigns-5min';
select cron.alter_job(jobid, command := $c$SELECT public.fn_crm_cron_post('/api/crm/jobs/run?kind=maintenance')$c$)
  from cron.job where jobname = 'crm-daily-maintenance';
commit;
