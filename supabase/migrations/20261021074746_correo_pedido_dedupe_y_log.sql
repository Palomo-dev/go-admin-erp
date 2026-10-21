-- Un solo correo de compra pendiente por comprador y tienda cada 24 horas,
-- solo si el pedido expiro por falta de pago. Dos ejecuciones a la vez
-- (el cron de Vercel y, antes, pg_cron) no pueden sellar el mismo pedido:
-- el reclamo bloquea la fila con FOR UPDATE SKIP LOCKED.
--
-- pg_cron deja de disparar la cola. El unico disparador queda en Vercel.
-- La funcion de HTTP sigue, y ademas manda X-Webhook-Secret, por si mas
-- adelante se vuelve a programar: la ruta ya prefiere esa cabecera.
-- No se reescribe 20261020151713: sigue aplicada y su archivo coincide
-- con el cuerpo que guarda la base.
--
-- Sin credenciales. anon y authenticated no ejecutan ni leen el log.

set lock_timeout = '10s';

alter table public.email_domains
  add column if not exists last_check_at timestamptz,
  add column if not exists last_error text;

create table if not exists public.web_order_email_log (
  id uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references public.web_orders (id) on delete cascade,
  organization_id integer not null references public.organizations (id) on delete cascade,
  email text not null,
  tipo text not null,
  resend_id text,
  estado text not null,
  error text,
  created_at timestamptz not null default now(),
  constraint web_order_email_log_tipo_check
    check (tipo in ('pedido_pagado', 'compra_pendiente')),
  constraint web_order_email_log_estado_check
    check (estado in ('enviado', 'omitido', 'error'))
);

create index if not exists idx_web_order_email_log_org_fecha
  on public.web_order_email_log (organization_id, created_at desc);

create index if not exists idx_web_order_email_log_pedido
  on public.web_order_email_log (web_order_id);

create index if not exists idx_web_orders_correo_enviado_reciente
  on public.web_orders (organization_id, abandoned_email_sent_at)
  where abandoned_email_sent_at is not null;

alter table public.web_order_email_log enable row level security;

revoke all on table public.web_order_email_log from public, anon, authenticated;
grant select, insert on table public.web_order_email_log to service_role;

drop policy if exists web_order_email_log_servicio on public.web_order_email_log;
create policy web_order_email_log_servicio
  on public.web_order_email_log
  for all
  to service_role
  using (true)
  with check (true);

-- Un metodo vacio no es pasarela: fn_web_order_metodo_nativo devuelve false
-- y aqui se excluye aparte. La razon de sistema es exactamente la que escribe
-- expire_pending_web_orders. Cualquier otra, o un cancelled_by, es manual.
create or replace function public.fn_web_order_correo_pendiente_elegible(
  p_order public.web_orders,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $eleg$
  select p_order.abandoned_email_sent_at is null
     and p_order.source = 'website'
     and p_order.payment_status = 'failed'
     and p_order.cancelled_by is null
     and p_order.cancelled_at is not null
     and p_order.cancelled_at >= p_desde
     and p_order.cancelled_at <= p_hasta
     and (
       (p_order.status = 'expired'
         and (p_order.cancellation_reason is null
              or p_order.cancellation_reason = 'Expirado por falta de pago'))
       or (p_order.status = 'cancelled'
           and p_order.cancellation_reason = 'Expirado por falta de pago')
     )
     and p_order.customer_email is not null
     and length(btrim(p_order.customer_email)) between 3 and 254
     and btrim(p_order.customer_email) ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+\.[^[:space:]@<>"]+$'
     and coalesce(p_order.delivery_type, '') <> 'dine_in'
     and p_order.restaurant_table_id is null
     and not (
       coalesce(p_order.delivery_type, '') = 'pickup'
       and position('[Comer aquí]' in coalesce(p_order.internal_notes, '')) = 1
     )
     and coalesce(btrim(p_order.payment_method), '') <> ''
     and public.fn_web_order_metodo_nativo(p_order.organization_id, p_order.payment_method) = false
     and not exists (
       select 1
         from public.web_orders pagado
        where pagado.organization_id = p_order.organization_id
          and pagado.id <> p_order.id
          and pagado.payment_status = 'paid'
          and pagado.customer_email is not null
          and lower(btrim(pagado.customer_email)) = lower(btrim(p_order.customer_email))
          and pagado.created_at > p_order.created_at
     );
$eleg$;

revoke all on function public.fn_web_order_correo_pendiente_elegible(public.web_orders, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_web_order_correo_pendiente_elegible(public.web_orders, timestamptz, timestamptz)
  to service_role;

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
     end;

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

-- Ventana en el futuro: no hay pedidos, asi que no sella nada. Si la funcion
-- no compila o reclama filas, esta migracion se revierte entera.
do $prueba$
declare
  n integer;
begin
  select count(*) into n
    from public.fn_reclamar_cola_compra_pendiente(
      now() + interval '10 years',
      now() + interval '11 years',
      1
    );
  if n <> 0 then
    raise exception 'la ventana futura no debe reclamar pedidos';
  end if;
end
$prueba$;
