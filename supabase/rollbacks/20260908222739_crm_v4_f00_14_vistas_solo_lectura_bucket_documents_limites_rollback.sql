-- ============================================================
-- ROLLBACK de 20260908222739_crm_v4_f00_14_vistas_solo_lectura_bucket_documents_limites
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve los grants de escritura sobre las vistas (estado previo: default de
-- CREATE VIEW con grants a authenticated/anon) y el bucket crm-documents a como
-- estaba antes: sin límite de tamaño ni lista MIME (valores NULL, que es lo que
-- tenía; medido antes de aplicar P5).
--
-- SOBRE LOS DATOS: no toca objetos del bucket.
-- ============================================================

begin;
grant insert, update, delete, truncate, references, trigger
  on public.v_provider_configs_safe, public.v_outbound_jobs_failed to authenticated, anon;
update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'crm-documents';
commit;
