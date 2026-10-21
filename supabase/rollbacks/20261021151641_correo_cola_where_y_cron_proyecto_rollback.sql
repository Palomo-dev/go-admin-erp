-- Rollback de 20261021151641_correo_cola_where_y_cron_proyecto.sql
--
-- No restaura el alias goadmin-websites-48f5.vercel.app ni el UPDATE sin
-- WHERE. Ese alias responde 401 (no tiene la clave de servicio) y el
-- UPDATE sin WHERE lo rechaza safeupdate con SQLSTATE 21000. Ejecutar
-- este archivo vuelve a dejar las dos funciones como quedaron: el
-- predicado `where c.id is not null` y el post a
-- https://goadmin-websites-8fs1.vercel.app.
-- No desprograma el cron. No toca pedidos ni el log.

set lock_timeout = '10s';

create or replace function public.fn_reclamar_cola_compra_pendiente(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_lote integer default 20
)
returns table (
  web_order_id uuid,
  organization_id integer,
  sello timestamptz,
  accion text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $cola$
#variable_conflict use_column
declare
  v_sello timestamptz := clock_timestamp();
  v_lote integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'ventana invalida' using errcode = '22023';
  end if;
  v_lote := least(greatest(coalesce(p_lote, 20), 1), 50);
  perform set_config('lock_timeout', '4s', true);
  perform set_config('statement_timeout', '8s', true);

  drop table if exists pg_temp.cola_compra_pendiente;
  drop table if exists pg_temp.cola_sellada;
  create temporary table cola_compra_pendiente (
    id uuid primary key,
    organization_id integer not null,
    customer_email text not null,
    cancelled_at timestamptz not null,
    created_at timestamptz,
    accion text not null
  ) on commit drop;
  create temporary table cola_sellada (
    id uuid primary key,
    accion text not null,
    organization_id integer not null,
    customer_email text not null
  ) on commit drop;

  insert into cola_compra_pendiente (id, organization_id, customer_email, cancelled_at, created_at, accion)
  select o.id,
         o.organization_id,
         lower(btrim(o.customer_email)),
         o.cancelled_at,
         o.created_at,
         'esperar'
    from public.web_orders o
   where public.fn_web_order_correo_pendiente_elegible(o, p_desde, p_hasta)
   order by o.cancelled_at desc nulls last, o.created_at desc nulls last, o.id desc
   limit 100
     for update of o skip locked;

  update cola_compra_pendiente c
     set accion = case
       when exists (
         select 1
           from public.web_orders s
          where s.organization_id = c.organization_id
            and s.abandoned_email_sent_at is not null
            and s.abandoned_email_sent_at > v_sello - interval '24 hours'
            and s.customer_email is not null
            and lower(btrim(s.customer_email)) = c.customer_email
       ) then 'omitido'
       when exists (
         select 1
           from public.web_orders n
          where public.fn_web_order_correo_pendiente_elegible(n, p_desde, p_hasta)
            and n.organization_id = c.organization_id
            and lower(btrim(n.customer_email)) = c.customer_email
            and not exists (select 1 from cola_compra_pendiente x where x.id = n.id)
            and (n.cancelled_at, coalesce(n.created_at, n.cancelled_at), n.id)
                > (
                  select y.cancelled_at, coalesce(y.created_at, y.cancelled_at), y.id
                    from cola_compra_pendiente y
                   where y.organization_id = c.organization_id
                     and y.customer_email = c.customer_email
                   order by y.cancelled_at desc nulls last, y.created_at desc nulls last, y.id desc
                   limit 1
                )
       ) then 'esperar'
       when c.id is distinct from (
         select y.id
           from cola_compra_pendiente y
          where y.organization_id = c.organization_id
            and y.customer_email = c.customer_email
          order by y.cancelled_at desc nulls last, y.created_at desc nulls last, y.id desc
          limit 1
       ) then 'omitido'
       else 'enviar'
     end
   where c.id is not null;

  with ranked as (
    select cola_compra_pendiente.id,
           row_number() over (
             order by cola_compra_pendiente.cancelled_at desc nulls last,
                      cola_compra_pendiente.created_at desc nulls last,
                      cola_compra_pendiente.id desc
           ) as n
      from cola_compra_pendiente
     where cola_compra_pendiente.accion = 'enviar'
  )
  update cola_compra_pendiente c
     set accion = 'esperar'
    from ranked r
   where c.id = r.id
     and r.n > v_lote;

  with hecho as (
    update public.web_orders o
       set abandoned_email_sent_at = v_sello
      from cola_compra_pendiente c
     where o.id = c.id
       and c.accion in ('enviar', 'omitido')
       and o.abandoned_email_sent_at is null
    returning o.id, c.accion, c.organization_id, c.customer_email
  )
  insert into cola_sellada (id, accion, organization_id, customer_email)
  select h.id, h.accion, h.organization_id, h.customer_email
    from hecho h;

  insert into public.web_order_email_log (web_order_id, organization_id, email, tipo, estado, error)
  select s.id, s.organization_id, s.customer_email, 'compra_pendiente', 'omitido', 'omitido por duplicado'
    from cola_sellada s
   where s.accion = 'omitido';

  return query
  select s.id, s.organization_id, v_sello, s.accion
    from cola_sellada s
   where s.accion in ('enviar', 'omitido');
end;
$cola$;

revoke all on function public.fn_reclamar_cola_compra_pendiente(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.fn_reclamar_cola_compra_pendiente(timestamptz, timestamptz, integer)
  to service_role;

create or replace function public.fn_websites_cron_post(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $post$
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
$post$;

revoke all on function public.fn_websites_cron_post(text) from public, anon, authenticated, service_role;

do $prueba$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.fn_reclamar_cola_compra_pendiente(timestamptz,timestamptz,integer)'::regprocedure);
  if position('where c.id is not null' in v_def) = 0 then
    raise exception 'el update de la cola sigue sin where';
  end if;

  v_def := pg_get_functiondef('public.fn_websites_cron_post(text)'::regprocedure);
  if position('https://goadmin-websites-8fs1.vercel.app' in v_def) = 0 then
    raise exception 'el cron no apunta al proyecto que puede enviar';
  end if;
  if position('goadmin-websites-48f5.vercel.app' in v_def) > 0 then
    raise exception 'el cron sigue apuntando al proyecto sin clave de servicio';
  end if;
end
$prueba$;

reset lock_timeout;
