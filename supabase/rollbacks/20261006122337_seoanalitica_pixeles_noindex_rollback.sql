-- Reversión de 20261008090000_seoanalitica_pixeles_noindex.sql
-- Las columnas son nuevas: quitarlas no toca datos anteriores a la migración.
alter table public.website_settings
  drop constraint if exists website_settings_meta_pixel_id_formato,
  drop constraint if exists website_settings_gtm_id_formato,
  drop constraint if exists website_settings_google_ads_id_formato,
  drop constraint if exists website_settings_tiktok_pixel_id_formato;

alter table public.website_settings
  drop column if exists meta_pixel_id,
  drop column if exists gtm_id,
  drop column if exists google_ads_id,
  drop column if exists tiktok_pixel_id,
  drop column if exists search_noindex;
