-- Rollback de 20261021182752_url_publica_host_limpio.sql
-- Restaura el cuerpo anterior de fn_url_publica_org (el de
-- 20261021175551). No toca el espejo ni el trigger.

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
