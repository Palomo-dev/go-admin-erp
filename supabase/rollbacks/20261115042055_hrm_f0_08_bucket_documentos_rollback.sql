-- Revierte HRM fase 0 · paso 8: quita la política de subida y la función.
-- El bucket hr-documentos NO se borra si tiene objetos (se perderían documentos
-- laborales con plazo legal de conservación); solo se borra si está vacío.
-- No restaura datos.

drop policy if exists hr_documentos_insert on storage.objects;
drop function if exists public.fn_hr_storage_puede_subir(text);
delete from storage.buckets b
 where b.id = 'hr-documentos'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'hr-documentos');
