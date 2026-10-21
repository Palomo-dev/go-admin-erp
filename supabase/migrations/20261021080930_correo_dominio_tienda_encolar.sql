-- El dominio principal verificado solo encola el correo de la tienda.
-- El trabajo (cron o el botón Reintentar) habla con el proveedor y con el
-- DNS. Esta migración no llama APIs.
--
-- El remitente queda en el dominio raíz (pedidos@<dominio>). El proveedor
-- publica sus registros en subdominios; el MX de la raíz no se toca.
-- Al dejar de ser principal, el dominio anterior sigue en el proveedor 30 días.
--
-- Sin credenciales. anon no ejecuta ni lee la cola.

set lock_timeout = '10s';

do $dup$
begin
  if exists (
    select 1
      from public.email_domains
     where is_default
     group by organization_id
    having count(*) > 1
  ) then
    raise exception 'hay mas de un remitente predeterminado por organizacion';
  end if;
end
$dup$;

alter table public.email_domains
  add column if not exists organization_domain_id uuid,
  add column if not exists dns_provider text,
  add column if not exists check_attempts integer not null default 0,
  add column if not exists demoted_at timestamptz;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_domains_organization_domain_id_fkey'
  ) then
    alter table public.email_domains
      add constraint email_domains_organization_domain_id_fkey
      foreign key (organization_domain_id)
      references public.organization_domains (id)
      on delete set null;
  end if;
end
$fk$;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_domains_dns_provider_check'
  ) then
    alter table public.email_domains
      add constraint email_domains_dns_provider_check
      check (dns_provider is null or dns_provider in ('vercel', 'externo'));
  end if;
end
$chk$;

create unique index if not exists email_domains_organization_domain_id_key
  on public.email_domains (organization_domain_id)
  where organization_domain_id is not null;

create unique index if not exists email_domains_un_predeterminado
  on public.email_domains (organization_id)
  where is_default;

update public.email_domains e
   set organization_domain_id = d.id
  from public.organization_domains d
 where e.organization_domain_id is null
   and d.organization_id = e.organization_id
   and d.is_primary
   and d.is_active
   and d.status = 'verified'
   and d.domain_type = 'custom_domain'
   and lower(d.host) = lower(e.domain);

create table if not exists public.email_domain_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  organization_domain_id uuid references public.organization_domains (id) on delete set null,
  accion text not null,
  status text not null default 'pending',
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  provider_domain_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_domain_jobs_accion_check
    check (accion in ('provisionar_correo', 'retirar_correo')),
  constraint email_domain_jobs_status_check
    check (status in ('pending', 'running', 'done', 'failed', 'cancelled'))
);

create index if not exists email_domain_jobs_pendientes
  on public.email_domain_jobs (run_after, created_at)
  where status = 'pending';

create unique index if not exists email_domain_jobs_abierto
  on public.email_domain_jobs (organization_domain_id, accion)
  where status in ('pending', 'running')
    and organization_domain_id is not null;

alter table public.email_domain_jobs enable row level security;

revoke all on table public.email_domain_jobs from public, anon, authenticated;
grant select, insert, update on table public.email_domain_jobs to service_role;

drop policy if exists email_domain_jobs_servicio on public.email_domain_jobs;
create policy email_domain_jobs_servicio
  on public.email_domain_jobs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.fn_correo_dominio_califica(p_row public.organization_domains)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $cal$
  select p_row.is_primary
     and p_row.is_active
     and p_row.status = 'verified'
     and p_row.domain_type in ('custom_domain', 'custom_subdomain', 'www_alias')
     and p_row.host is not null
     and lower(p_row.host) not like '%.goadmin.io';
$cal$;

revoke all on function public.fn_correo_dominio_califica(public.organization_domains)
  from public, anon, authenticated;
grant execute on function public.fn_correo_dominio_califica(public.organization_domains)
  to service_role;

create or replace function public.fn_encolar_correo_dominio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $trg$
declare
  v_ahora boolean;
  v_antes boolean;
begin
  if tg_op is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    update public.email_domains
       set is_default = false,
           demoted_at = coalesce(demoted_at, now()),
           updated_at = now()
     where organization_domain_id = old.id;
    insert into public.email_domain_jobs (
      organization_id, organization_domain_id, accion, status, run_after, provider_domain_id
    )
    select old.organization_id, old.id, 'retirar_correo', 'pending',
           coalesce(e.demoted_at, now()) + interval '30 days', e.provider_domain_id
      from public.email_domains e
     where e.organization_domain_id = old.id
       and e.provider_domain_id is not null
    on conflict (organization_domain_id, accion)
      where status in ('pending', 'running') and organization_domain_id is not null
      do nothing;
    return old;
  end if;

  v_ahora := public.fn_correo_dominio_califica(new);
  v_antes := false;
  if tg_op = 'UPDATE' then
    v_antes := public.fn_correo_dominio_califica(old);
  end if;

  if v_ahora and not v_antes then
    insert into public.email_domain_jobs (organization_id, organization_domain_id, accion, status, run_after)
    values (new.organization_id, new.id, 'provisionar_correo', 'pending', now())
    on conflict (organization_domain_id, accion)
      where status in ('pending', 'running') and organization_domain_id is not null
      do nothing;
    update public.email_domains
       set demoted_at = null, updated_at = now()
     where organization_domain_id = new.id;
    update public.email_domain_jobs
       set status = 'cancelled', updated_at = now()
     where organization_domain_id = new.id
       and accion = 'retirar_correo'
       and status = 'pending';
  elsif v_antes and not v_ahora then
    update public.email_domains
       set is_default = false,
           demoted_at = coalesce(demoted_at, now()),
           updated_at = now()
     where organization_domain_id = old.id;
    update public.email_domain_jobs
       set status = 'cancelled', updated_at = now()
     where organization_domain_id = old.id
       and accion = 'provisionar_correo'
       and status = 'pending';
    insert into public.email_domain_jobs (
      organization_id, organization_domain_id, accion, status, run_after, provider_domain_id
    )
    select old.organization_id, old.id, 'retirar_correo', 'pending', now() + interval '30 days', e.provider_domain_id
      from public.email_domains e
     where e.organization_domain_id = old.id
       and e.provider_domain_id is not null
    on conflict (organization_domain_id, accion)
      where status in ('pending', 'running') and organization_domain_id is not null
      do nothing;
  end if;
  return new;
end;
$trg$;

revoke all on function public.fn_encolar_correo_dominio() from public, anon, authenticated;
grant execute on function public.fn_encolar_correo_dominio() to service_role;

drop trigger if exists trg_encolar_correo_dominio on public.organization_domains;
create trigger trg_encolar_correo_dominio
  after insert or update
  on public.organization_domains
  for each row
  execute function public.fn_encolar_correo_dominio();

drop trigger if exists trg_retirar_correo_dominio on public.organization_domains;
create trigger trg_retirar_correo_dominio
  before delete
  on public.organization_domains
  for each row
  execute function public.fn_encolar_correo_dominio();

create or replace function public.fn_reintentar_correo_tienda(
  p_organization_id integer,
  p_domain_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $rei$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_domains d
     where d.id = p_domain_id
       and d.organization_id = p_organization_id
       and public.fn_correo_dominio_califica(d)
  ) then
    return;
  end if;
  update public.email_domains
     set status = 'pending',
         check_attempts = 0,
         last_error = null,
         updated_at = now()
   where organization_id = p_organization_id
     and organization_domain_id = p_domain_id
     and status = 'failed';
  insert into public.email_domain_jobs (organization_id, organization_domain_id, accion, status, run_after)
  values (p_organization_id, p_domain_id, 'provisionar_correo', 'pending', now())
  on conflict (organization_domain_id, accion)
    where status in ('pending', 'running') and organization_domain_id is not null
    do update set
      run_after = now(),
      last_error = null,
      created_at = now(),
      attempts = 0,
      updated_at = now();
end;
$rei$;

revoke all on function public.fn_reintentar_correo_tienda(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_reintentar_correo_tienda(integer, uuid) to service_role;

create or replace function public.fn_reclamar_jobs_correo_tienda(
  p_organization_id integer default null,
  p_lote integer default 5
)
returns table (
  job_id uuid,
  organization_id integer,
  organization_domain_id uuid,
  accion text,
  creado_en timestamptz,
  intentos integer,
  id_proveedor text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $job$
#variable_conflict use_column
declare
  v_lote integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_lote := least(greatest(coalesce(p_lote, 5), 1), 10);
  perform set_config('lock_timeout', '4s', true);
  perform set_config('statement_timeout', '8s', true);

  update public.email_domain_jobs
     set status = 'pending', updated_at = now()
   where status = 'running'
     and updated_at < now() - interval '15 minutes'
     and (p_organization_id is null or email_domain_jobs.organization_id = p_organization_id);

  return query
  with candidatos as (
    select j.id
      from public.email_domain_jobs j
     where j.status = 'pending'
       and j.run_after <= now()
       and (p_organization_id is null or j.organization_id = p_organization_id)
     order by j.run_after, j.created_at
     limit v_lote
       for update of j skip locked
  ),
  tomados as (
    update public.email_domain_jobs j
       set status = 'running',
           attempts = j.attempts + 1,
           updated_at = now()
      from candidatos c
     where j.id = c.id
    returning j.id, j.organization_id, j.organization_domain_id, j.accion,
              j.created_at, j.attempts, j.provider_domain_id
  )
  select t.id, t.organization_id, t.organization_domain_id, t.accion,
         t.created_at, t.attempts, t.provider_domain_id
    from tomados t;
end;
$job$;

revoke all on function public.fn_reclamar_jobs_correo_tienda(integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_reclamar_jobs_correo_tienda(integer, integer)
  to service_role;

-- Dominio principal verificado que todavía no tiene ese dominio autenticado.
insert into public.email_domain_jobs (organization_id, organization_domain_id, accion, status, run_after)
select d.organization_id, d.id, 'provisionar_correo', 'pending', now()
  from public.organization_domains d
 where public.fn_correo_dominio_califica(d)
   and not exists (
     select 1
       from public.email_domains e
      where e.organization_id = d.organization_id
        and e.status = 'verified'
        and (
          lower(e.domain) = lower(regexp_replace(d.host, '^www\.', ''))
          or lower(e.domain) = 'send.' || lower(regexp_replace(d.host, '^www\.', ''))
        )
   )
on conflict (organization_domain_id, accion)
  where status in ('pending', 'running') and organization_domain_id is not null
  do nothing;

do $prueba$
declare
  n integer;
begin
  select count(*) into n
    from public.email_domain_jobs j
    join public.organization_domains d on d.id = j.organization_domain_id
    join public.email_domains e
      on e.organization_id = d.organization_id
     and e.status = 'verified'
     and lower(e.domain) = lower(regexp_replace(d.host, '^www\.', ''))
   where j.accion = 'provisionar_correo'
     and j.status = 'pending';
  if n <> 0 then
    raise exception 'se encolo una tienda que ya tiene remitente verificado';
  end if;

  select count(*) into n
    from public.fn_reclamar_jobs_correo_tienda(-1, 1);
  if n <> 0 then
    raise exception 'un id inexistente no debe reclamar trabajos';
  end if;
end
$prueba$;
