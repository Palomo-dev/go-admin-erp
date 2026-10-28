-- Estilo personalizado del contador regresivo (fondo, texto, ícono, temporizador, tamaño).
-- Una sola configuración para todas las ubicaciones del contador (encabezado, carrito, pago,
-- producto y portada). NULL = el contador de siempre (la tienda lo pinta igual que hoy).
-- Formato y lector tolerante: src/lib/website/estiloContador.ts (copia en goadmin-websites).
-- PENDIENTE DE APROBACIÓN: no aplicar en prod sin el OK de Juan. Mientras no exista, el ERP
-- guarda el resto de ajustes sin esta columna y la tienda la ignora.
alter table public.website_settings
  add column if not exists countdown_style jsonb;

comment on column public.website_settings.countdown_style is
  'Estilo del contador regresivo (jsonb: fondo, texto, icono, temporizador, tamano). NULL = aspecto clásico.';

alter table public.website_settings
  drop constraint if exists website_settings_countdown_style_objeto;
alter table public.website_settings
  add constraint website_settings_countdown_style_objeto
  check (countdown_style is null or jsonb_typeof(countdown_style) = 'object');
