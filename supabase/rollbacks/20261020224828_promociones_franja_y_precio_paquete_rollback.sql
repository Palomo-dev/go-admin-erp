-- Revierte 20261020224828_promociones_franja_y_precio_paquete.
-- Quita la franja horaria y el precio del paquete. No hay datos que restaurar:
-- las columnas nacieron nulas y lo que se haya escrito en ellas se pierde.

set lock_timeout = '10s';
alter table public.promotions drop constraint if exists promotions_bundle_price_nonneg;
alter table public.promotions
  drop column if exists start_time,
  drop column if exists end_time,
  drop column if exists bundle_price;
