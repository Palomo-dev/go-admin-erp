-- ============================================================
-- ROLLBACK de 20260908222845_crm_v4_f00_16_fn_release_job_crm_events_diag
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina fn_release_job (si ya se aplicó f00_37, revertirla antes: redefine la
-- función y añade outbound_jobs.releases) y las dos columnas de diagnóstico de
-- crm_events. El runner detecta la ausencia (PGRST202/PGRST204) y usa fallback.
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos: se pierden attempts/last_error de crm_events.
-- ============================================================

begin;
drop function if exists public.fn_release_job(uuid, text);
alter table public.crm_events drop column if exists last_error;
alter table public.crm_events drop column if exists attempts;
commit;
