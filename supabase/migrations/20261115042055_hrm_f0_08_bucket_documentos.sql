-- HRM fase 0 · paso 8: bucket privado de documentos de RR. HH. ADR-001 §10.
--
-- Ruta: {organización}/{grupo}/{persona}/{uuid}.{ext}. Grupos: los seis de
-- fn_hr_grupos_datos(). 10 MB; PDF e imágenes.
-- Subir: authenticated con hr.data.<grupo>.edit en esa organización y una
-- persona de esa organización (o el servidor con una URL firmada de subida).
-- Leer, cambiar o borrar: NINGÚN rol de cliente. La descarga es siempre una URL
-- firmada de corta vida que crea el servidor después de
-- fn_hr_documento_autorizar_descarga (permiso + registro de accesos).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-documentos', 'hr-documentos', false, 10485760,
        array['application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fn_hr_storage_puede_subir(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_partes text[] := storage.foldername(p_name);
  v_org integer;
  v_persona uuid;
begin
  if auth.uid() is null or cardinality(v_partes) <> 3 or p_name like '%..%' then
    return false;
  end if;
  if v_partes[1] !~ '^[0-9]{1,9}$' or not (v_partes[2] = any (public.fn_hr_grupos_datos()))
     or v_partes[3] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_org := v_partes[1]::integer;
  v_persona := v_partes[3]::uuid;
  if not exists (select 1 from public.hr_people p where p.id = v_persona and p.organization_id = v_org) then
    return false;
  end if;
  return public.fn_hr_puede(v_org, 'hr.data.' || v_partes[2] || '.edit');
end;
$$;
revoke execute on function public.fn_hr_storage_puede_subir(text) from public, anon;
grant execute on function public.fn_hr_storage_puede_subir(text) to authenticated, service_role;

drop policy if exists hr_documentos_insert on storage.objects;
create policy hr_documentos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-documentos' and public.fn_hr_storage_puede_subir(name));
