-- Reversión de 20261007150100_website_instantaneas_borrador.sql (SIN APLICAR).
-- Quita la tabla de instantáneas y sus funciones. El borrador y las revisiones no cambian.

drop table if exists public.website_site_draft_snapshots;
drop function if exists public.fn_website_instantaneas_retencion();
drop function if exists public.fn_website_instantanea_mismo_tenant();
