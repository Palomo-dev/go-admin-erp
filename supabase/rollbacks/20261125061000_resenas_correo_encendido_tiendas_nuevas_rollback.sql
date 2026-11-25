-- Reversión de 20261125060000_resenas_correo_encendido_tiendas_nuevas.sql.
-- Quita el DEFAULT: las filas nuevas vuelven a nacer con NULL (= apagado).
-- OJO: no toca las filas creadas mientras el DEFAULT estuvo activo; esas siguen en true hasta que
-- el dueño de cada tienda lo apague o se actualicen a mano.

alter table public.website_settings alter column reviews_request_enabled drop default;

comment on column public.website_settings.reviews_request_enabled is
  'Correo «¿Qué te pareció tu compra?» tras la entrega. NULL = apagado.';
