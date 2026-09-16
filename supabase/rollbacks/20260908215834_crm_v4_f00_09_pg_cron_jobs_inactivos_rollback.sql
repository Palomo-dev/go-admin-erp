-- ============================================================
-- ROLLBACK de 20260908215834_crm_v4_f00_09_pg_cron_jobs_inactivos
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Desprograma los 3 jobs de pg_cron y elimina fn_crm_cron_post(text). Si ya se
-- aplicó f00_15 (que la sustituye por la firma (text, jsonb)), ejecutar antes
-- su rollback.
--
-- SOBRE LOS DATOS: no toca datos. Los secretos crm_cron_secret / crm_app_url de Vault no se crearon en la migración y no se tocan.
-- ============================================================

begin;
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('crm-jobs-every-minute','crm-campaigns-5min','crm-daily-maintenance') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
drop function if exists public.fn_crm_cron_post(text);
commit;
