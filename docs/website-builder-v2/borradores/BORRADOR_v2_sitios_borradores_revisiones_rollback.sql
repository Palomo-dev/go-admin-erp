-- ============================================================================================
-- BORRADOR — NO APLICADO. Reversión de BORRADOR_v2_sitios_borradores_revisiones.sql.
--
-- ADVERTENCIA: esta reversión BORRA los datos V2 (estados de sitio, borradores, revisiones
-- publicadas y outbox) y no los restaura. Las tablas legacy (website_settings, website_pages,
-- website_page_sections, menús) no se tocan, así que los sitios no adoptados no cambian.
-- Antes de revertir con sitios adoptados:
--   1. Desactivar V2 en cada sitio con set_site_v2_adoption(sitio, false) para que el principal
--      vuelva a legacy. Un outlet solo V2 quedará sin respuesta pública (404).
--   2. Exportar las revisiones que se quieran conservar, por ejemplo con
--      select site_state_id, revision_number, document from public.website_site_revisions
--   3. Desplegar primero el código que ya no lee estas tablas.
--
-- Los permisos website.sites.* se borran con sus asignaciones en role_permissions y
-- job_position_permissions (ON DELETE CASCADE). Si scopes_catalog llegara a referenciarlos, el
-- delete fallaría a propósito: hay que retirar antes esa referencia.
-- ============================================================================================

drop function if exists public.set_site_v2_adoption(uuid, boolean);
drop function if exists public.publish_site_revision(uuid, integer, text);
drop function if exists public.ensure_site_draft(integer, integer, jsonb, integer);

drop table if exists public.website_publication_outbox;

-- El puntero de estado a revisión se retira primero para romper la referencia circular.
alter table if exists public.website_site_states
  drop constraint if exists website_site_states_revision_publicada_fk;

drop table if exists public.website_site_revisions;
drop table if exists public.website_site_drafts;
drop table if exists public.website_site_states;

drop function if exists public.fn_website_site_revisions_inmutable();
drop function if exists public.fn_website_site_drafts_version();
drop function if exists public.fn_website_site_states_dominio_org();
drop function if exists public.fn_website_exigir_permiso(integer, text);
drop function if exists public.fn_website_tiene_permiso(integer, text);

delete from public.permissions where code in ('website.sites.edit', 'website.sites.publish');
