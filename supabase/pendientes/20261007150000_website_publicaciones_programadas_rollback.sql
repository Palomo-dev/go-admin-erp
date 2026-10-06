-- Reversión de 20261007150000_website_publicaciones_programadas.sql (SIN APLICAR).
-- Quita el job, la función, la tabla y su trigger. Las revisiones publicadas por el job se
-- conservan (viven en website_site_revisions).

select cron.unschedule(jobid) from cron.job where jobname = 'website-publicaciones-programadas';

drop function if exists public.fn_website_ejecutar_programadas();
drop table if exists public.website_site_scheduled_publications;
drop function if exists public.fn_website_programada_mismo_tenant();
