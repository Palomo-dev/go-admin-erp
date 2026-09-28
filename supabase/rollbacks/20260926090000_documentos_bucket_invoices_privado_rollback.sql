-- Reversión de 20260926090000_documentos_bucket_invoices_privado.
--
-- ADVERTENCIA: restaura el estado INSEGURO anterior (bucket público y
-- escritura de cualquier usuario autenticado sobre cualquier objeto). Solo
-- tiene sentido si hay que volver atrás el motor de documentos. No toca los
-- objetos del bucket.

update storage.buckets
   set public = true,
       file_size_limit = null,
       allowed_mime_types = null
 where id = 'invoices';

drop policy if exists "Public read access for invoices" on storage.objects;
create policy "Public read access for invoices" on storage.objects
  for select to public using (bucket_id = 'invoices');

drop policy if exists "Authenticated users can upload invoices" on storage.objects;
create policy "Authenticated users can upload invoices" on storage.objects
  for insert to authenticated with check (bucket_id = 'invoices');

drop policy if exists "Authenticated users can update invoices" on storage.objects;
create policy "Authenticated users can update invoices" on storage.objects
  for update to authenticated using (bucket_id = 'invoices');

drop policy if exists "Authenticated users can delete invoices" on storage.objects;
create policy "Authenticated users can delete invoices" on storage.objects
  for delete to authenticated using (bucket_id = 'invoices');
