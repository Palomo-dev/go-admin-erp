-- Reversión de 20261124200000: solo la ruta de compra pendiente.
create or replace function public.fn_websites_cron_post(p_path text)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_secret text;
  v_req bigint;
  v_base constant text := 'https://goadmin-websites-8fs1.vercel.app';
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
      'X-Webhook-Secret', v_secret,
      'Content-Type', 'application/json',
      'X-Cron-Source', 'pg_cron'
    ),
    timeout_milliseconds := 55000
  ) into v_req;
  return v_req;
end;
$function$;
