-- Rollback de 20260911180000_move_service_role_key_to_vault.sql
-- Revierte el fix de seguridad: vuelve a exponer EXECUTE a public/anon/authenticated
-- y restaura el JWT hardcodeado en el cron job.
--
-- ADVERTENCIA: este rollback reintroduce el agujero de seguridad. Usar solo
-- si la migracion causa un fallo critico y no hay alternativa.

-- 1. Restaurar EXECUTE publico (default de Postgres)
revoke execute on function public.fn_cron_actualizar_tasas() from postgres;
grant execute on function public.fn_cron_actualizar_tasas()
  to public, anon, authenticated, postgres;

-- 2. Restaurar el cron job con el JWT incrustado
-- (NO se incluye el JWT aqui — el repositorio es publico)
-- Si se necesita revertir completamente, restaurar el comando original via MCP:
-- select cron.alter_job(job_id := 4, command := '<comando original con JWT>');

-- 3. Opcional: drop function
-- drop function if exists public.fn_cron_actualizar_tasas();
