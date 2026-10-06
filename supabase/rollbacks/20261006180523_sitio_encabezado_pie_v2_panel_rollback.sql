-- Rollback de 20261006180523_sitio_encabezado_pie_v2_panel.sql
--
-- Quita las 5 columnas (y sus CHECK en línea). ADVERTENCIA: no restaura datos; lo guardado en
-- ellas se pierde y el sitio vuelve al default, que es el comportamiento de antes (goadmin-websites
-- trata la columna ausente como default).

alter table public.website_settings
  drop column if exists header_show_currency,
  drop column if exists header_text_color,
  drop column if exists header_sticky,
  drop column if exists footer_text_color,
  drop column if exists footer_show_dividers;
