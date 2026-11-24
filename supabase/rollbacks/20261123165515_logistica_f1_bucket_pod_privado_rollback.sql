-- Reversión de 20261123165515_logistica_f1_bucket_pod_privado.
--
-- Deja el bucket `shipment-pod` como lo dejó 20261123153729: público, subida por miembro activo de
-- la organización de la primera carpeta y sin política de lectura. No toca objetos. OJO: al volver a
-- público, cualquier foto o firma subida mientras estuvo privado queda visible con su URL; y las
-- pantallas actuales guardan la RUTA (no la URL pública): revertir también el código.

update storage.buckets set public = true where id = 'shipment-pod';

drop policy if exists shipment_pod_select_miembros on storage.objects;

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
