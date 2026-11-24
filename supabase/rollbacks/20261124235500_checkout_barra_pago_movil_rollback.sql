-- Reversión de 20261124235500_checkout_barra_pago_movil.
-- ADVERTENCIA: borra el estilo elegido por cada tienda; no lo restaura. Sin la columna, la tienda
-- pinta C (lee la fila con select('*') y trata la ausencia como «sin elegir»). Antes de revertir,
-- quitar `barraPago` de COLUMNAS_CHECKOUT (src/components/sitio-web/ventas/estadoVentas.ts) y de la
-- lectura de ventasSitio.server.ts, o el ERP fallará al leer los ajustes del checkout.

set lock_timeout = '10s';

alter table public.website_settings
  drop constraint if exists website_settings_checkout_mobile_bar_style_valido;

alter table public.website_settings
  drop column if exists checkout_mobile_bar_style;
