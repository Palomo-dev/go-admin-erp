-- El cron del sitio llega a la base, pero se devuelve antes de leer la cola
-- cuando el despliegue no tiene RESEND_API_KEY. La clave de envío vive en
-- el vault (resend_api_key), fuera de este archivo. El servidor la lee con
-- fn_leer_secreto_vault. pg_cron llama al sitio cada 15 minutos con el
-- secreto que ya usa el ERP (crm_cron_secret), por si el horario de Vercel
-- no decide la cola.
--
-- No hay comprobación de organización: son secretos de la plataforma, no
-- datos de un tenant. anon y authenticated no ejecutan.

set lock_timeout = '10s';

create or replace function public.fn_secreto_vault_coincide(p_nombre text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_esperado text;
begin
  if p_nombre is distinct from 'crm_cron_secret' then
    return false;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    return false;
  end if;
  if p_token is null or length(p_token) = 0 or length(p_token) > 512 then
    return false;
  end if;
  select s.decrypted_secret into v_esperado
  from vault.decrypted_secrets s
  where s.name = p_nombre
  order by s.created_at desc
  limit 1;
  if v_esperado is null or length(v_esperado) = 0 then
    return false;
  end if;
  return extensions.digest(convert_to(v_esperado, 'utf8'), 'sha256')
      = extensions.digest(convert_to(p_token, 'utf8'), 'sha256');
end;
$$;

create or replace function public.fn_leer_secreto_vault(p_nombre text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v text;
begin
  if p_nombre is distinct from 'resend_api_key' then
    return null;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    return null;
  end if;
  select s.decrypted_secret into v
  from vault.decrypted_secrets s
  where s.name = p_nombre
  order by s.created_at desc
  limit 1;
  return v;
end;
$$;

revoke all on function public.fn_secreto_vault_coincide(text, text) from public, anon, authenticated;
revoke all on function public.fn_leer_secreto_vault(text) from public, anon, authenticated;
grant execute on function public.fn_secreto_vault_coincide(text, text) to service_role;
grant execute on function public.fn_leer_secreto_vault(text) to service_role;

create or replace function public.fn_websites_cron_post(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_req bigint;
  v_base constant text := 'https://goadmin-websites-48f5.vercel.app';
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_path is distinct from '/api/cron/carritos-abandonados' then
    raise exception 'ruta no permitida' using errcode = '22023';
  end if;
  select s.decrypted_secret into v_secret
  from vault.decrypted_secrets s
  where s.name = 'crm_cron_secret'
  order by s.created_at desc
  limit 1;
  if v_secret is null or length(v_secret) < 16 then
    raise exception 'fn_websites_cron_post: crm_cron_secret ausente en vault (fail-closed)';
  end if;
  select net.http_post(
    url := v_base || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json',
      'X-Cron-Source', 'pg_cron'
    ),
    timeout_milliseconds := 55000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.fn_websites_cron_post(text) from public, anon, authenticated, service_role;

do $uns$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'compra-pendiente-sitio';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$uns$;

select cron.schedule(
  'compra-pendiente-sitio',
  '*/15 * * * *',
  $cron$select public.fn_websites_cron_post('/api/cron/carritos-abandonados')$cron$
);
