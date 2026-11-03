-- Rollback de 20261103211712_storage_buckets_proyecto_nuevo.
-- Quita las políticas añadidas. Los buckets solo se borran si están vacíos:
-- con archivos dentro, borrarlos perdería fotos y documentos de clientes.
drop policy if exists buckets_extra_insert on storage.objects;
drop policy if exists buckets_extra_select_propios on storage.objects;
drop policy if exists buckets_extra_update_propios on storage.objects;
drop policy if exists buckets_extra_delete_propios on storage.objects;
delete from storage.buckets b
 where b.id in ('product-images','logos','organization_images','categories','profiles','attachments',
                'space-images','supplier-logos','organization-assets','crm-documents','crm','shipping-labels')
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
