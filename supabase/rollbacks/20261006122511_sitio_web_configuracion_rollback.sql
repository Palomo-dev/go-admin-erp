-- Reversión de 20261008150000_sitio_web_configuracion.sql (SIN APLICAR).
-- Quita las dos RPC y las columnas nuevas de website_settings. Lo escrito en esas
-- columnas (mantenimiento, idioma, contacto del sitio, código a medida) se pierde:
-- antes de revertir, exportarlo si hay filas con valores distintos del DEFAULT.

drop function if exists public.delete_website(integer);
drop function if exists public.update_website_settings(integer, jsonb);

alter table public.website_settings
  drop constraint if exists website_settings_contacto_largo,
  drop constraint if exists website_settings_maintenance_message_largo,
  drop constraint if exists website_settings_custom_code_lista,
  drop constraint if exists website_settings_site_locale_valido;

alter table public.website_settings
  drop column if exists whatsapp_greeting,
  drop column if exists whatsapp_number,
  drop column if exists contact_phone,
  drop column if exists contact_email,
  drop column if exists custom_code,
  drop column if exists site_locale,
  drop column if exists maintenance_message,
  drop column if exists maintenance_mode;
