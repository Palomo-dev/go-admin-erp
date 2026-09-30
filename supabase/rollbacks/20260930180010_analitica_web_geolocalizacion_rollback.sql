-- Reversión de 20260930180010_analitica_web_geolocalizacion.
--
-- ADVERTENCIA: borrar las columnas pierde la ciudad y la región de las visitas
-- registradas desde que se aplicó la migración (no se pueden reconstruir).
-- Antes de revertir, desplegar la versión del sitio que no escribe `city` ni
-- `region`: si no, cada visita falla al insertar.
-- `fn_analitica_web` lee estas columnas: revertir antes 20260930180030.
-- `country` no se toca (ya existía); su comentario se deja.

drop index if exists public.idx_website_visits_org_iphash_created;

alter table public.website_visits
  drop column if exists city,
  drop column if exists region;
