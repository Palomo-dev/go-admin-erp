-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_14_vistas_solo_lectura_bucket_documents_limites`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 61d9e315c40ab3384d346c9d758cd804). No reformatear.
-- P4 (tester F4): las vistas seguras son solo lectura para clientes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.v_provider_configs_safe, public.v_outbound_jobs_failed FROM authenticated, anon;
GRANT SELECT ON public.v_provider_configs_safe, public.v_outbound_jobs_failed TO authenticated;

-- P5 (riesgo tester #55): bucket crm-documents con limite 25 MB y lista MIME.
-- La UI (DocumentUploader.tsx <input type="file" multiple> sin `accept`) no restringe tipos y
-- documentService.ts:180 sube con contentType = file.type || 'application/octet-stream'; por eso la
-- lista incluye 'application/octet-stream' (fallback de archivos sin MIME detectado por el navegador:
-- se sirven como descarga, nunca renderizados) y excluye contenido activo (text/html, image/svg+xml, js).
UPDATE storage.buckets
   SET file_size_limit = 26214400,
       allowed_mime_types = ARRAY[
         'application/pdf','image/png','image/jpeg','image/webp','image/gif',
         'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/rtf','text/plain','text/csv','text/markdown',
         'application/zip','application/x-zip-compressed',
         'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm',
         'video/mp4','video/webm',
         'application/octet-stream']
 WHERE id = 'crm-documents';