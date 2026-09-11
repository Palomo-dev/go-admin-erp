-- 20260911180000_move_service_role_key_to_vault.sql
-- F-sec: service_role key incrustada en cron.job.command (jobid 4)
--
-- Antes: el job 'mantener-datos-reales-diarios' tenia el JWT service_role
-- hardcodeado en el header Authorization del comando. Cualquiera con acceso
-- de lectura a cron.job o un respaldo tenia la llave y saltaba RLS.
--
-- Despues: el job llama a fn_cron_actualizar_tasas(), que lee la llave
-- desde vault.decrypted_secrets (name='service_role_key') en runtime.
-- El comando del cron ya no contiene la llave.
--
-- La llave misma se gestiona desde el dashboard de Supabase (Vault) y
-- las variables de entorno de Vercel. No se escribe en este archivo ni
-- en ningun archivo del repo.
--
-- Pasos aplicados via Supabase MCP (project jgmgphmzusbluqhuqihj):
--   1. create or replace function public.fn_cron_actualizar_tasas()
--      SECURITY DEFINER, search_path='public'
--      Lee vault.decrypted_secrets where name='service_role_key'
--      Llama net.http_post a la edge function actualizar-tasas-cambio
--   2. cron.alter_job(job_id=4, command='select public.fn_cron_actualizar_tasas();')
--
-- Verificacion:
--   select command from cron.job where jobid=4;
--   -> 'select public.fn_cron_actualizar_tasas();'  (sin llave)
--   select proname from pg_proc where prosrc ilike '%eyJ%' or prosrc ilike '%sb_secret%';
--   -> 0 filas
--   Ejecucion manual: HTTP 200, 10 tasas actualizadas, log success=true

-- Esta migracion es documental. Los cambios ya fueron aplicados via MCP.
-- Se incluye para trazabilidad y reproducibilidad.

create or replace function public.fn_cron_actualizar_tasas()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key text;
  v_req_id bigint;
begin
  select decrypted_secret
  into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    raise exception 'service_role_key no encontrado en Vault';
  end if;

  select net.http_post(
    url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/actualizar-tasas-cambio',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json',
      'X-Supabase-Scheduled', 'true'
    ),
    body := jsonb_build_object(
      'source', 'daily_real_api',
      'scheduled', true,
      'use_real_api', true
    )
  ) into v_req_id;

  return v_req_id;
end;
$$;

-- El alter_job no es idempotente en un script de migracion (cron.alter_job
-- requiere que el job exista). Se ejecuto via MCP. Si se necesita reproducir:
-- select cron.alter_job(job_id := 4, command := 'select public.fn_cron_actualizar_tasas();');
