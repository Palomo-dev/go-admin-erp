-- Rollback de 20261021074746_correo_pedido_dedupe_y_log.sql
--
-- Borra el log de correos: las filas no se recuperan.
-- Vuelve a programar el job compra-pendiente-sitio y deja la funcion HTTP
-- como estaba (solo Authorization). No toca el secreto del vault ni la
-- marca abandoned_email_sent_at de los pedidos.

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

create or replace function public.fn_websites_cron_post(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $post$
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
$post$;

revoke all on function public.fn_websites_cron_post(text) from public, anon, authenticated, service_role;

select cron.schedule(
  'compra-pendiente-sitio',
  '*/15 * * * *',
  $cron$select public.fn_websites_cron_post('/api/cron/carritos-abandonados')$cron$
);

drop function if exists public.fn_reclamar_cola_compra_pendiente(timestamptz, timestamptz, integer);
drop function if exists public.fn_web_order_correo_pendiente_elegible(public.web_orders, timestamptz, timestamptz);

drop table if exists public.web_order_email_log;

drop index if exists public.idx_web_orders_correo_enviado_reciente;

alter table public.email_domains
  drop column if exists last_check_at,
  drop column if exists last_error;
