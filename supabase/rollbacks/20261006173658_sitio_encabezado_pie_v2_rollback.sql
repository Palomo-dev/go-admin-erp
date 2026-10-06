-- Rollback de 20261006173658_sitio_encabezado_pie_v2.sql
--
-- Quita las 14 columnas (y con ellas sus CHECK en línea). ADVERTENCIA: no restaura datos; lo que
-- una organización haya guardado en estas columnas se pierde. El sitio vuelve a su default, que es
-- el comportamiento de antes de la migración (goadmin-websites trata la columna ausente como default).

alter table public.website_settings
  drop column if exists header_cta2_text,
  drop column if exists header_cta2_url,
  drop column if exists topbar_show_branch_status,
  drop column if exists topbar_show_free_shipping,
  drop column if exists topbar_show_availability,
  drop column if exists header_show_branch_selector,
  drop column if exists header_show_language,
  drop column if exists site_locales,
  drop column if exists header_booking_bar,
  drop column if exists header_menu_source,
  drop column if exists mobile_bottom_bar,
  drop column if exists footer_show_whatsapp,
  drop column if exists footer_show_map,
  drop column if exists footer_show_payment_methods;
