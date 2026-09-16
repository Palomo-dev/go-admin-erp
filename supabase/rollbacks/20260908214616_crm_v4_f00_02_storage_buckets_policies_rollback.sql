-- ============================================================
-- ROLLBACK de 20260908214616_crm_v4_f00_02_storage_buckets_policies
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita las 8 políticas crm_* de storage.objects. El bucket crm-call-recordings
-- se deja: contiene grabaciones (datos de clientes) y borrarlo exige vaciarlo.
-- Si hace falta retirarlo del todo: delete from storage.objects where bucket_id =
-- 'crm-call-recordings'; delete from storage.buckets where id = 'crm-call-recordings'.
--
-- SOBRE LOS DATOS: no borra el bucket ni sus objetos (ver arriba).
-- ============================================================

begin;
drop policy if exists crm_documents_delete on storage.objects;
drop policy if exists crm_documents_update on storage.objects;
drop policy if exists crm_documents_insert on storage.objects;
drop policy if exists crm_documents_select on storage.objects;
drop policy if exists crm_call_recordings_delete on storage.objects;
drop policy if exists crm_call_recordings_update on storage.objects;
drop policy if exists crm_call_recordings_insert on storage.objects;
drop policy if exists crm_call_recordings_select on storage.objects;
commit;
