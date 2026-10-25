-- Rollback de 20261025120100_revisiones_sitio_sin_etiquetas_nulas
drop trigger if exists trg_revision_sitio_exigir_etiquetas on public.website_site_revisions;
drop function if exists public.fn_revision_sitio_exigir_etiquetas();
