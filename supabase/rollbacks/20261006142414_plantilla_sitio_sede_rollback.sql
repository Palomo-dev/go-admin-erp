-- Rollback de 20261006142414_plantilla_sitio_sede.
-- Quita la RPC y la marca de plantilla de website_site_states. NO borra los sitios de sede que la
-- RPC haya creado ni sus borradores e instantáneas (son contenido del usuario): solo se pierde
-- qué plantilla los armó. El ERP sigue funcionando sin la RPC (la sede nace con la plantilla por
-- ensure_site_draft; «Aplicar plantilla» responde 503 no_disponible).
drop function if exists public.fn_website_plantilla_sede(integer, integer, text, jsonb, integer, text, integer);
alter table public.website_site_states drop constraint if exists website_site_states_plantilla_tipo_valido;
alter table public.website_site_states drop constraint if exists website_site_states_plantilla_version_positiva;
alter table public.website_site_states drop column if exists plantilla_aplicada_at;
alter table public.website_site_states drop column if exists plantilla_version_borrador;
alter table public.website_site_states drop column if exists plantilla_tipo;
