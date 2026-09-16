-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_02_storage_buckets_policies`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 31946a93833a9ffb6f1aa927459c4278). No reformatear.
-- M2: bucket privado crm-call-recordings + políticas storage.objects (recordings y crm-documents)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crm-call-recordings','crm-call-recordings', false, 209715200,
        ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/aac'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- crm-call-recordings: path obligatorio org_{organization_id}/{yyyy}/{mm}/{callId}.mp3
DROP POLICY IF EXISTS crm_call_recordings_select ON storage.objects;
CREATE POLICY crm_call_recordings_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-call-recordings'
  AND substring(name from '^org_([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_call_recordings_insert ON storage.objects;
CREATE POLICY crm_call_recordings_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-call-recordings'
  AND substring(name from '^org_([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_call_recordings_update ON storage.objects;
CREATE POLICY crm_call_recordings_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'crm-call-recordings'
  AND substring(name from '^org_([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
)
WITH CHECK (
  bucket_id = 'crm-call-recordings'
  AND substring(name from '^org_([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_call_recordings_delete ON storage.objects;
CREATE POLICY crm_call_recordings_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-call-recordings'
  AND substring(name from '^org_([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);

-- crm-documents: documentService.ts:174 usa el prefijo `{orgId}/{related_type}/{related_id}/...` (sin "org_")
DROP POLICY IF EXISTS crm_documents_select ON storage.objects;
CREATE POLICY crm_documents_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-documents'
  AND substring(name from '^([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_documents_insert ON storage.objects;
CREATE POLICY crm_documents_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-documents'
  AND substring(name from '^([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_documents_update ON storage.objects;
CREATE POLICY crm_documents_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'crm-documents'
  AND substring(name from '^([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
)
WITH CHECK (
  bucket_id = 'crm-documents'
  AND substring(name from '^([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS crm_documents_delete ON storage.objects;
CREATE POLICY crm_documents_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-documents'
  AND substring(name from '^([0-9]+)/')::integer IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);