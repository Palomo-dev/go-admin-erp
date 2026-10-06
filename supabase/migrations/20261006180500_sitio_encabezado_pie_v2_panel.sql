-- Encabezado y pie por plantilla, segunda tanda: opciones del panel del editor aprobado en Figma
-- («16 Sitio web» 2058:40377 / 2064:102) que el contrato aún no traía.
--
-- Columnas aditivas en website_settings para los sitios legacy; en V2 viven en
-- shell.header.opciones / shell.footer.opciones. Contrato: src/lib/website/v2/mapeoAjustes.ts
-- (OPCIONES_SHELL con nueva: true), copiado en goadmin-websites.
--
-- Cada default es el comportamiento de hoy:
--   header_show_currency  true  → el selector de moneda sale como siempre (con 2 o más monedas);
--   header_text_color     NULL  → el texto del encabezado sigue el tema;
--   header_sticky         true  → el encabezado sigue fijo al bajar;
--   footer_text_color     NULL  → el texto del pie sigue el tema / el fondo elegido;
--   footer_show_dividers  true  → las líneas separadoras del pie siguen.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS con su CHECK en línea (se omite si la columna existe).
-- Rollback: supabase/rollbacks/20261006180500_sitio_encabezado_pie_v2_panel_rollback.sql

set lock_timeout = '10s';
alter table public.website_settings
  add column if not exists header_show_currency boolean not null default true,
  add column if not exists header_text_color text
    constraint website_settings_header_text_color_hex check (header_text_color is null or header_text_color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'),
  add column if not exists header_sticky boolean not null default true,
  add column if not exists footer_text_color text
    constraint website_settings_footer_text_color_hex check (footer_text_color is null or footer_text_color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'),
  add column if not exists footer_show_dividers boolean not null default true;

comment on column public.website_settings.header_show_currency is
  'Selector de moneda en el encabezado. true (lo de antes): sale con 2 o más monedas.';
comment on column public.website_settings.header_text_color is
  'Color fijo del texto y los enlaces del encabezado (#RGB o #RRGGBB). NULL = sigue el tema (lo de antes).';
comment on column public.website_settings.header_sticky is
  'Encabezado fijo al bajar. true = lo de antes.';
comment on column public.website_settings.footer_text_color is
  'Color fijo del texto del pie (#RGB o #RRGGBB). NULL = sigue el tema o el fondo elegido (lo de antes).';
comment on column public.website_settings.footer_show_dividers is
  'Líneas separadoras del pie. true = lo de antes.';
