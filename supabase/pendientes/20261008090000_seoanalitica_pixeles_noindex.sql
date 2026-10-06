-- ============================================================================
-- Ensayo 2026-10-06 (integrador, execute_sql, do/raise que se deshace solo): las columnas y
-- los cuatro CHECK, validados sobre las 92 filas de website_settings → ENSAYO_OK. No se aplicó.
-- Sitio web › SEO y redes / Analítica (Figma B/08 y B/09) — PENDIENTE, sin aplicar.
--
-- 1) Píxeles como campos tipados (B/09-05): Meta Pixel, Google Tag Manager,
--    Google Ads y TikTok Pixel. Google Analytics 4 reutiliza `analytics_id`
--    (ya existe): no se crea una segunda columna para GA4.
--    Los <script> libres siguen en `custom_scripts` (Configuración › Código).
-- 2) «Ocultar de los buscadores» (B/08-01): `search_noindex`. Es distinto del
--    modo mantenimiento (área configuración): el sitio sigue visible para las
--    personas, solo pide `noindex` a los buscadores.
--
-- Aditiva: columnas NULL-ables o con DEFAULT; los CHECK solo validan valores
-- nuevos (todas las filas actuales quedan en NULL / false). Las lee y escribe
-- el ERP por servidor (`/api/sitio-web/analitica/pixeles`, `/api/sitio-web/seo`).
-- El repo goadmin-websites debe leerlas en un PR aparte (dependencia declarada).
-- `google_site_verification` YA existe: no se toca.
-- ============================================================================

alter table public.website_settings
  add column if not exists meta_pixel_id   text null,
  add column if not exists gtm_id          text null,
  add column if not exists google_ads_id   text null,
  add column if not exists tiktok_pixel_id text null,
  add column if not exists search_noindex  boolean not null default false;

alter table public.website_settings
  add constraint website_settings_meta_pixel_id_formato
    check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{8,20}$') not valid,
  add constraint website_settings_gtm_id_formato
    check (gtm_id is null or gtm_id ~ '^GTM-[A-Z0-9]{4,12}$') not valid,
  add constraint website_settings_google_ads_id_formato
    check (google_ads_id is null or google_ads_id ~ '^AW-[0-9]{6,15}$') not valid,
  add constraint website_settings_tiktok_pixel_id_formato
    check (tiktok_pixel_id is null or tiktok_pixel_id ~ '^[A-Z0-9]{15,25}$') not valid;

-- Todas las filas actuales tienen NULL: validar no bloquea ni falla.
alter table public.website_settings validate constraint website_settings_meta_pixel_id_formato;
alter table public.website_settings validate constraint website_settings_gtm_id_formato;
alter table public.website_settings validate constraint website_settings_google_ads_id_formato;
alter table public.website_settings validate constraint website_settings_tiktok_pixel_id_formato;

comment on column public.website_settings.meta_pixel_id is 'ID del Meta Pixel (solo dígitos). Lo pinta el sitio público; se edita en Sitio web › Analítica.';
comment on column public.website_settings.gtm_id is 'Contenedor de Google Tag Manager (GTM-XXXX). Se edita en Sitio web › Analítica.';
comment on column public.website_settings.google_ads_id is 'Etiqueta de Google Ads (AW-XXXXXXXX). Se edita en Sitio web › Analítica.';
comment on column public.website_settings.tiktok_pixel_id is 'ID del TikTok Pixel. Se edita en Sitio web › Analítica.';
comment on column public.website_settings.search_noindex is 'Ocultar de los buscadores: el sitio público responde con noindex. Se edita en Sitio web › SEO y redes.';
