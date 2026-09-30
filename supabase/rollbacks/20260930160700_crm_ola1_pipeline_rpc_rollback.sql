-- Rollback de 20260930160700_crm_ola1_pipeline_rpc.sql
--
-- Borra las tres RPC de pipeline. La migración no creó índices ni tocó datos:
-- el índice `unique_default_pipeline_per_org` es anterior y se conserva.
-- Mientras no se revierta también el código, POST /api/crm/pipelines,
-- PATCH/DELETE /api/crm/pipelines/[id] y POST
-- /api/crm/pipeline-templates/[id]/import responden 500. Los pipelines y etapas
-- ya creados por las RPC se conservan.

drop function if exists public.crm_delete_pipeline(integer, uuid);
drop function if exists public.crm_set_default_pipeline(integer, uuid);
drop function if exists public.crm_create_pipeline_with_stages(integer, jsonb);
