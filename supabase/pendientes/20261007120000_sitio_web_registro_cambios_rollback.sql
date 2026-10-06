-- Reversión de 20261007120000_sitio_web_registro_cambios.sql (PENDIENTE: no aplicada).
-- Quita los disparadores, las funciones y la tabla del registro de cambios.
-- No toca website_site_drafts ni website_site_revisions.

drop trigger if exists website_site_drafts_registra_cambio on public.website_site_drafts;
drop trigger if exists website_site_revisions_registra_cambio on public.website_site_revisions;
drop function if exists public.trg_website_draft_registra_cambio();
drop function if exists public.trg_website_revision_registra_cambio();
drop function if exists public.fn_website_resumen_cambios(jsonb, jsonb);
drop table if exists public.website_site_change_events;
