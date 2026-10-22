-- URL pública de la tienda.
-- Fuente: organization_domains. Primero el dominio propio principal,
-- verificado y activo. Si no hay, el subdominio del sistema. Si tampoco,
-- organizations.subdomain. organizations.custom_domain queda como espejo
-- de ese dominio propio (null si no hay). El rollback no restaura los
-- valores anteriores de la columna.

set lock_timeout = '10s';

create or replace function public.fn_url_publica_org(p_org integer)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $url$
declare
  v_rol text := coalesce(auth.role(), '');
  v_host text;
  v_sub text;
begin
  if p_org is null or p_org <= 0 then
    return null;
  end if;

  if v_rol = 'authenticated' then
    if auth.uid() is null or not exists (
      select 1
        from public.organization_members m
       where m.organization_id = p_org
         and m.user_id = auth.uid()
         and m.is_active
    ) then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
  elsif v_rol is distinct from 'service_role' and v_rol <> '' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select d.host into v_host
    from public.organization_domains d
   where d.organization_id = p_org
     and d.domain_type = 'custom_domain'
     and d.is_primary
     and d.is_active
     and d.status = 'verified'
   order by d.updated_at desc
   limit 1;

  if v_host is null or position('/' in v_host) > 0 or position(' ' in v_host) > 0 then
    select d.host into v_host
      from public.organization_domains d
     where d.organization_id = p_org
       and d.domain_type = 'system_subdomain'
       and d.is_active
     order by d.is_primary desc, d.updated_at desc
     limit 1;
  end if;

  if v_host is not null and position('/' in v_host) = 0 and position(' ' in v_host) = 0 then
    return 'https://' || lower(btrim(v_host));
  end if;

  select nullif(lower(btrim(o.subdomain)), '') into v_sub
    from public.organizations o
   where o.id = p_org;

  if v_sub is not null and v_sub ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return 'https://' || v_sub || '.goadmin.io';
  end if;

  return null;
end;
$url$;

revoke all on function public.fn_url_publica_org(integer) from public, anon;
grant execute on function public.fn_url_publica_org(integer) to authenticated, service_role;

comment on function public.fn_url_publica_org(integer) is
  'URL pública https de la tienda. Espejo de hostSitio: dominio propio principal verificado, si no el subdominio del sistema, si no organizations.subdomain.';

create or replace function public.fn_sync_custom_domain_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $sync$
declare
  v_org integer := coalesce(new.organization_id, old.organization_id);
  v_host text;
begin
  if v_org is null then
    return null;
  end if;

  select d.host into v_host
    from public.organization_domains d
   where d.organization_id = v_org
     and d.domain_type = 'custom_domain'
     and d.is_primary
     and d.is_active
     and d.status = 'verified'
   order by d.updated_at desc
   limit 1;

  update public.organizations o
     set custom_domain = v_host
   where o.id = v_org
     and o.custom_domain is distinct from v_host;

  return null;
end;
$sync$;

revoke all on function public.fn_sync_custom_domain_org() from public, anon, authenticated;

drop trigger if exists trg_organization_domains_sync_custom_domain on public.organization_domains;
create trigger trg_organization_domains_sync_custom_domain
  after insert or update of is_primary, is_active, status, host or delete
  on public.organization_domains
  for each row
  execute function public.fn_sync_custom_domain_org();

update public.organizations o
   set custom_domain = d.host
  from public.organization_domains d
 where d.organization_id = o.id
   and d.domain_type = 'custom_domain'
   and d.is_primary
   and d.is_active
   and d.status = 'verified'
   and o.custom_domain is distinct from d.host;

update public.organizations o
   set custom_domain = null
 where coalesce(o.custom_domain, '') <> ''
   and not exists (
     select 1
       from public.organization_domains d
      where d.organization_id = o.id
        and d.domain_type = 'custom_domain'
        and d.is_primary
        and d.is_active
        and d.status = 'verified'
        and lower(d.host) = lower(o.custom_domain)
   );

do $comprueba$
declare
  v_malos integer;
begin
  select count(*) into v_malos
    from public.organizations o
    join public.organization_domains d
      on d.organization_id = o.id
     and d.domain_type = 'custom_domain'
     and d.is_primary
     and d.is_active
     and d.status = 'verified'
   where o.custom_domain is distinct from d.host;
  if v_malos <> 0 then
    raise exception 'custom_domain no espeja el dominio principal';
  end if;

  select count(*) into v_malos
    from public.organizations o
   where coalesce(o.custom_domain, '') <> ''
     and not exists (
       select 1
         from public.organization_domains d
        where d.organization_id = o.id
          and d.domain_type = 'custom_domain'
          and d.is_primary
          and d.is_active
          and d.status = 'verified'
          and lower(d.host) = lower(o.custom_domain)
     );
  if v_malos <> 0 then
    raise exception 'custom_domain sin principal verificado';
  end if;
end
$comprueba$;

reset lock_timeout;
