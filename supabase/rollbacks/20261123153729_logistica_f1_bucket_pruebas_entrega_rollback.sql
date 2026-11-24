-- Reversión de 20261123153729_logistica_f1_bucket_pruebas_entrega.
--
-- Quita la política de subida y el bucket. NO revierte datos: si ya hay fotos o firmas, el bucket no
-- se puede borrar con SQL (Supabase bloquea el DELETE directo sobre storage.objects); hay que
-- vaciarlo antes con la API de Storage. Las URL guardadas en proof_of_delivery / delivery_attempts
-- dejarán de abrir.

drop policy if exists shipment_pod_insert_miembros on storage.objects;
delete from storage.buckets
 where id = 'shipment-pod'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'shipment-pod');
