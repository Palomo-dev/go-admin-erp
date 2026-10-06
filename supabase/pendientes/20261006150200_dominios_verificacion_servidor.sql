-- ⚠️ SIN APLICAR (2026-10-06). Auditoría de Organización 2026-10, P0-8.
--
-- La verificación de dominios era simulada en el navegador (src/lib/services/domainService.ts: al
-- tercer clic quedaba `verified`) y authenticated podía escribir status, verified_at y vercel_state.
-- Desde el código de esta tarea, verificar es POST /api/organizacion/dominios/[id]/verificar: consulta
-- el TXT por DNS en el servidor y solo entonces escribe `verified` con service role. Aquí la base deja
-- de aceptar esa escritura desde el navegador:
--
--   - authenticated/anon no cambian status, verified_at, intentos, vercel_* ni la organización de un
--     dominio. Al insertar, un dominio propio entra siempre `pending` (se ignora lo que mande el cliente).
--   - Cambiar el host de un dominio propio lo devuelve a `pending` (verificado a.com no vale para b.com).
--   - Subdominios del sistema: solo `<nombre>.goadmin.io` (SubdomainManager los crea con la sesión).
--   - Reclamar un host que otra organización ya tiene: mensaje claro antes del UNIQUE global
--     (verificado por otra → «ya está verificado por otra organización»).
--   - Service role (rutas del servidor, compra de dominios) y las funciones SECURITY DEFINER no pasan
--     por estas reglas: el disparador mira current_user, como fn_organization_members_proteger_propia_fila.
--
-- Verificado por MCP (solo SELECT) el 2026-10-06: 24 filas, todas `verified` (12 custom_domain creadas
-- con el token de la base, 12 system_subdomain bajo goadmin.io). Ninguna fila cambia.
--
-- Ensayo 2026-10-06 (do/raise): ENSAYO_OK. Insertar con status verified desde la sesión queda
-- pending; marcarlo verified con la sesión RECHAZADO; editar principal/activo/metadata OK;
-- reclamar el host pendiente o verificado de otra organización RECHAZADO (también cambiando el
-- host); mover un dominio de organización RECHAZADO; verificar con service role OK; cambiar el host
-- lo devuelve a pending; subdominio .goadmin.io OK y uno ajeno como system_subdomain RECHAZADO.
-- (Borrar un dominio no se ensayó: el MCP retiene para confirmación el SQL que borra filas.)

create or replace function public.fn_dominio_en_otra_organizacion(p_host text, p_org integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when d.status = 'verified' then 'verificado' else 'pendiente' end
    from public.organization_domains d
   where d.host = lower(btrim(p_host))
     and d.organization_id <> p_org
   order by (d.status = 'verified') desc
   limit 1
$$;

revoke all on function public.fn_dominio_en_otra_organizacion(text, integer) from public, anon;
grant execute on function public.fn_dominio_en_otra_organizacion(text, integer) to authenticated, service_role;

comment on function public.fn_dominio_en_otra_organizacion(text, integer) is
  'P0-8: estado (verificado/pendiente) de un host en OTRA organización, o null. Solo para el mensaje del disparador de organization_domains.';

create or replace function public.fn_organization_domains_proteger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_otra text;
  v_sistema constant text := '^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.goadmin\.io$';
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'dominios: un dominio no cambia de organización' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.host is distinct from old.host then
    v_otra := public.fn_dominio_en_otra_organizacion(new.host, new.organization_id);
    if v_otra = 'verificado' then
      raise exception 'dominios: este dominio ya está verificado por otra organización' using errcode = '23505';
    elsif v_otra = 'pendiente' then
      raise exception 'dominios: otra organización registró este dominio y aún no lo verifica. Si es tuyo, escribe a soporte.'
        using errcode = '23505';
    end if;
  end if;

  if new.domain_type = 'system_subdomain' or (tg_op = 'UPDATE' and old.domain_type = 'system_subdomain') then
    if tg_op = 'UPDATE' and new.domain_type is distinct from old.domain_type then
      raise exception 'dominios: el tipo de un subdominio del sistema no cambia' using errcode = '42501';
    end if;
    if new.host !~ v_sistema then
      raise exception 'dominios: un subdominio del sistema tiene la forma nombre.goadmin.io' using errcode = '22023';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' or new.host is distinct from old.host then
    new.status := 'pending';
    new.verified_at := null;
    new.verification_attempts := 0;
    new.last_verification_at := null;
    new.vercel_state := '{}'::jsonb;
    new.vercel_domain_id := null;
    new.vercel_project_id := null;
    new.last_vercel_sync_at := null;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.verified_at is distinct from old.verified_at
     or new.verification_attempts is distinct from old.verification_attempts
     or new.last_verification_at is distinct from old.last_verification_at
     or new.vercel_state is distinct from old.vercel_state
     or new.vercel_domain_id is distinct from old.vercel_domain_id
     or new.vercel_project_id is distinct from old.vercel_project_id
     or new.last_vercel_sync_at is distinct from old.last_vercel_sync_at then
    raise exception 'dominios: la verificación la hace el servidor (Verificar dominio)' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_organization_domains_proteger() from public, anon, authenticated;

-- Nombre elegido para correr DESPUÉS de trg_normalize_domain_host y trg_organization_domains_before_insert
-- (los BEFORE se disparan por orden alfabético): ve el host ya normalizado.
create or replace trigger trg_organization_domains_proteger
  before insert or update on public.organization_domains
  for each row execute function public.fn_organization_domains_proteger();
