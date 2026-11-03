-- Buckets de Storage que el código usa y que no existían en el proyecto nuevo
-- (taqjemqjtumhwptchcxk, recreado el 2026-11-03 tras borrarse el anterior).
-- Los públicos sirven fotos por /storage/v1/object/public/...; los privados se
-- leen con URL firmada. Las políticas de los públicos ya existen
-- (restore_buckets_*); aquí se añaden las de los cuatro que no cubren.
insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('logos', 'logos', true),
  ('organization_images', 'organization_images', true),
  ('categories', 'categories', true),
  ('profiles', 'profiles', true),
  ('attachments', 'attachments', true),
  ('space-images', 'space-images', true),
  ('supplier-logos', 'supplier-logos', true),
  ('organization-assets', 'organization-assets', true),
  ('crm-documents', 'crm-documents', false),
  ('crm', 'crm', false),
  ('shipping-labels', 'shipping-labels', false)
on conflict (id) do nothing;

create policy buckets_extra_insert on storage.objects for insert to authenticated
  with check (bucket_id = any (array['supplier-logos','organization-assets','crm','shipping-labels']));
create policy buckets_extra_select_propios on storage.objects for select to authenticated
  using (bucket_id = any (array['supplier-logos','organization-assets','crm','shipping-labels']) and owner_id = (auth.uid())::text);
create policy buckets_extra_update_propios on storage.objects for update to authenticated
  using (bucket_id = any (array['supplier-logos','organization-assets','crm','shipping-labels']) and owner_id = (auth.uid())::text)
  with check (bucket_id = any (array['supplier-logos','organization-assets','crm','shipping-labels']) and owner_id = (auth.uid())::text);
create policy buckets_extra_delete_propios on storage.objects for delete to authenticated
  using (bucket_id = any (array['supplier-logos','organization-assets','crm','shipping-labels']) and owner_id = (auth.uid())::text);
