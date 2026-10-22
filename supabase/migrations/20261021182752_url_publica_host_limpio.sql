-- La URL publica descarta un host que no es un nombre (esquema, ruta,
-- puerto, punto final, vacio) y un updated_at nulo no gana sobre uno
-- con fecha. Misma regla que hostSitio.

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

  select s.limpio into v_host
    from (
      select regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(lower(btrim(d.host)), '^https?://', ''),
                   '/.*$', ''),
                 ':[0-9]+$', ''),
               '\.$', '') as limpio,
             d.updated_at
        from public.organization_domains d
       where d.organization_id = p_org
         and d.domain_type = 'custom_domain'
         and d.is_primary
         and d.is_active
         and d.status = 'verified'
    ) s
   where s.limpio ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
     and length(s.limpio) <= 253
     and position('..' in s.limpio) = 0
   order by s.updated_at desc nulls last
   limit 1;

  if v_host is null then
    select s.limpio into v_host
      from (
        select regexp_replace(
                 regexp_replace(
                   regexp_replace(
                     regexp_replace(lower(btrim(d.host)), '^https?://', ''),
                     '/.*$', ''),
                   ':[0-9]+$', ''),
                 '\.$', '') as limpio,
               d.is_primary,
               d.updated_at
          from public.organization_domains d
         where d.organization_id = p_org
           and d.domain_type = 'system_subdomain'
           and d.is_active
      ) s
     where s.limpio ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
       and length(s.limpio) <= 253
       and position('..' in s.limpio) = 0
     order by s.is_primary desc, s.updated_at desc nulls last
     limit 1;
  end if;

  if v_host is not null then
    return 'https://' || v_host;
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
