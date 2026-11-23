-- Logística Fase 1: bucket de las pruebas de entrega y de las novedades del domiciliario.
--
-- «Mis envíos» (y el diálogo viejo de Transporte) suben a `shipment-pod`, pero el bucket no pasó al
-- proyecto nuevo (2026-11-03): toda subida fallaba. Se recrea como lo usa el código: público (las
-- pantallas guardan getPublicUrl en proof_of_delivery.photo_urls / signature_url y
-- delivery_attempts.photo_urls y las pintan con <img>), 5 MB, solo imágenes.
--
-- Ruta: {organización}/{envío}/{uuid}.{ext}. Subir: miembro activo de la organización de la primera
-- carpeta. Leer: por la URL pública (nombre con uuid, no adivinable); sin política SELECT, nadie
-- lista el bucket con la API. Cambiar o borrar: nadie desde el cliente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shipment-pod', 'shipment-pod', true, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists shipment_pod_insert_miembros on storage.objects;
create policy shipment_pod_insert_miembros on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shipment-pod'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
        from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
  );
