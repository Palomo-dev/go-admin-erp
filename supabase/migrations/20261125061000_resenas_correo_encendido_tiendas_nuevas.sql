-- Correo «¿Qué te pareció tu compra?» ENCENDIDO por defecto para las tiendas NUEVAS (aprobado por
-- el dueño el 2026-11-25). Aditiva y sin tocar datos:
--   * Solo cambia el DEFAULT de la columna: las 46 filas que ya existen siguen en NULL (= apagado,
--     así lo leen `leerAjustesResenas` del ERP y de la tienda).
--   * Las filas nuevas nacen con true. Las crean `create_default_website_settings`,
--     `fn_editor_guardar_legacy` y los insert del ERP (websiteSettingsService, editorLegacy.server);
--     ninguno escribe esta columna, así que todos toman el DEFAULT.
--   * La tienda solo envía si además el pedido se entrega y hay correo; el dueño de la tienda lo
--     apaga en Sitio web › Tienda › Reseñas › Ajustes de reseñas.

alter table public.website_settings alter column reviews_request_enabled set default true;

comment on column public.website_settings.reviews_request_enabled is
  'Correo «¿Qué te pareció tu compra?» tras la entrega. NULL = apagado (tiendas anteriores al 2026-11-25); las tiendas nuevas nacen con true.';
