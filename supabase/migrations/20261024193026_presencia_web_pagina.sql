create table if not exists public.website_active_views (
  organization_id integer not null references public.organizations(id) on delete cascade,
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  page_path text not null check (length(page_path) between 1 and 500 and page_path like '/%'),
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, session_hash)
);
alter table public.website_active_views enable row level security;
revoke all on public.website_active_views from public, anon, authenticated;
grant select, insert, update, delete on public.website_active_views to service_role;
drop policy if exists presencia_solo_servidor on public.website_active_views;
create policy presencia_solo_servidor on public.website_active_views for all to service_role using (true) with check (true);
create index if not exists idx_website_active_views_pagina on public.website_active_views (organization_id, page_path, last_seen_at);

create or replace function public.website_registrar_presencia(p_organization_id integer, p_session_hash text, p_page_path text)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare total integer;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' or p_page_path is null or length(p_page_path) not between 1 and 500 or p_page_path not like '/%' or p_page_path ~ '[?#]' then
    raise exception 'presencia_invalida' using errcode = '22023';
  end if;
  insert into public.website_active_views (organization_id, session_hash, page_path, last_seen_at)
  values (p_organization_id, p_session_hash, p_page_path, clock_timestamp())
  on conflict (organization_id, session_hash) do update
    set page_path = excluded.page_path, last_seen_at = excluded.last_seen_at;
  select count(*)::integer into total from public.website_active_views
    where organization_id = p_organization_id and page_path = p_page_path
      and last_seen_at > clock_timestamp() - interval '90 seconds';
  return total;
end;
$$;
revoke all on function public.website_registrar_presencia(integer,text,text) from public, anon, authenticated;
grant execute on function public.website_registrar_presencia(integer,text,text) to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'website-presencia-expirada') then
    perform cron.schedule('website-presencia-expirada', '17 * * * *',
      $job$delete from public.website_active_views where last_seen_at < now() - interval '1 day'$job$);
  end if;
end;
$$;
comment on table public.website_active_views is 'Presencia efímera por página: hash de sesión, sin IP ni datos personales. Lectura y escritura solo desde el servidor; ventana activa de 90 segundos.';
