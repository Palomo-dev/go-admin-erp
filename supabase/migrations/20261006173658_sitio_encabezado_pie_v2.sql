-- Aplicada el 2026-10-06 con apply_migration (versión 20261006173658).
-- Encabezado y pie por plantilla (Figma «16 Sitio web» 2028:38223, aprobado el 2026-10-06).
--
-- Columnas aditivas en website_settings para los sitios legacy. En los sitios V2 las mismas
-- opciones viven en shell.header.opciones / shell.footer.opciones del documento y no necesitan
-- esta migración. Contrato: src/lib/website/v2/mapeoAjustes.ts (OPCIONES_SHELL con nueva: true,
-- COLUMNAS_NUEVAS_SHELL), copiado en goadmin-websites.
--
-- Cada default es el comportamiento de hoy: con estas columnas en su default, un sitio se ve
-- exactamente igual que antes de la migración.
--
-- CHECK existentes: website_settings_header_style_check ya admite 'transparent';
-- footer_background no tiene CHECK, así que 'tema' no necesita cambio. No se toca ningún CHECK.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (con su CHECK en línea, que se omite si la columna ya
-- existe) y COMMENT ON. Rollback: supabase/rollbacks/20261006173658_sitio_encabezado_pie_v2_rollback.sql

set lock_timeout = '10s';
alter table public.website_settings
  add column if not exists header_cta2_text text
    constraint website_settings_header_cta2_text_largo check (header_cta2_text is null or char_length(header_cta2_text) <= 40),
  add column if not exists header_cta2_url text
    constraint website_settings_header_cta2_url_largo check (header_cta2_url is null or char_length(header_cta2_url) <= 500),
  add column if not exists topbar_show_branch_status boolean not null default false,
  add column if not exists topbar_show_free_shipping boolean not null default false,
  add column if not exists topbar_show_availability boolean not null default false,
  add column if not exists header_show_branch_selector boolean not null default false,
  add column if not exists header_show_language boolean not null default false,
  add column if not exists site_locales text[] not null default array['es-CO']::text[]
    constraint website_settings_site_locales_validos check (
      cardinality(site_locales) between 1 and 4
      and site_locales <@ array['es-CO', 'en', 'fr', 'pt']::text[]
    ),
  add column if not exists header_booking_bar boolean not null default false,
  add column if not exists header_menu_source text not null default 'menu'
    constraint website_settings_header_menu_source_check check (header_menu_source in ('menu', 'categorias_carta')),
  add column if not exists mobile_bottom_bar text not null default 'auto'
    constraint website_settings_mobile_bottom_bar_check check (
      mobile_bottom_bar in ('auto', 'ninguna')
      or mobile_bottom_bar ~ '^(pedir|reservar|agendar|prueba|llamar|whatsapp|como_llegar)(,(pedir|reservar|agendar|prueba|llamar|whatsapp|como_llegar)){0,3}$'
    ),
  add column if not exists footer_show_whatsapp boolean not null default false,
  add column if not exists footer_show_map boolean not null default false,
  add column if not exists footer_show_payment_methods boolean not null default false;

comment on column public.website_settings.header_cta2_text is
  'Segundo botón del encabezado (estilo contorno). NULL = sin segundo botón (lo de antes).';
comment on column public.website_settings.header_cta2_url is
  'Enlace del segundo botón: ruta propia, https, tel:, mailto: o los especiales whatsapp / maps.';
comment on column public.website_settings.topbar_show_branch_status is
  'Barra superior: sede y «Abierto ahora / Cierra a las…» con el horario de la sede y la zona horaria de la organización.';
comment on column public.website_settings.topbar_show_free_shipping is
  'Barra superior: «Envío gratis desde …» con free_shipping_threshold.';
comment on column public.website_settings.topbar_show_availability is
  'Barra superior: cupos libres del parqueadero.';
comment on column public.website_settings.header_show_branch_selector is
  'true = selector de sede dentro del encabezado; false = franja bajo el encabezado (lo de antes). Solo con 2 o más sedes publicadas.';
comment on column public.website_settings.header_show_language is
  'Selector de idioma en el encabezado con los idiomas de site_locales.';
comment on column public.website_settings.site_locales is
  'Idiomas que ofrece el selector del encabezado (es-CO, en, fr, pt).';
comment on column public.website_settings.header_booking_bar is
  'Hotel: barra de reserva con fechas bajo el encabezado.';
comment on column public.website_settings.header_menu_source is
  'Origen del menú principal: menu (el del sitio, lo de antes) o categorias_carta (categorías de la carta).';
comment on column public.website_settings.mobile_bottom_bar is
  'Barra fija del celular: auto (lo de antes: solo restaurantes), ninguna, o una lista «a,b» de hasta 4 acciones.';
comment on column public.website_settings.footer_show_whatsapp is
  'Pie: bloque de WhatsApp con whatsapp_number.';
comment on column public.website_settings.footer_show_map is
  'Pie: mapa de la sede con «Cómo llegar».';
comment on column public.website_settings.footer_show_payment_methods is
  'Pie: medios de pago (organization_payment_methods.show_on_website).';
