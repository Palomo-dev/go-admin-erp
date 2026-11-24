-- Logística Fase 1 (endurecimiento): el bucket de pruebas de entrega pasa a PRIVADO.
--
-- 20261123153729 lo dejó público: cualquiera con la URL veía la foto de la puerta del cliente, su
-- firma o el comprobante de una transferencia. Ahora:
--   - `public = false`: no hay URL pública; las pantallas piden enlaces firmados de corta duración
--     a `GET /api/logistica/envios/[id]/evidencias`, que los genera en el servidor con la sesión.
--   - Subir: miembro activo de la organización de la primera carpeta y, además, el envío de la
--     segunda carpeta debe ser visible para la sesión (RLS de `shipments`: un domiciliario solo ve
--     los suyos). Ruta: {organización}/{envío}/{tipo}-{uuid}.{ext}.
--   - Leer (firmar): las mismas dos condiciones. Sin esta política la sesión no puede firmar.
--   - Cambiar o borrar: nadie desde el cliente (sin políticas UPDATE/DELETE).
-- Al aplicar no había objetos en el bucket ni URL guardadas (0 pruebas, 0 intentos con fotos).

update storage.buckets set public = false where id = 'shipment-pod';

drop policy if exists shipment_pod_insert_miembros on storage.objects;
create policy shipment_pod_insert_miembros on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shipment-pod'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
        from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and (storage.foldername(name))[2] in (select s.id::text from public.shipments s)
  );

drop policy if exists shipment_pod_select_miembros on storage.objects;
create policy shipment_pod_select_miembros on storage.objects for select to authenticated
  using (
    bucket_id = 'shipment-pod'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
        from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    and (storage.foldername(name))[2] in (select s.id::text from public.shipments s)
  );
