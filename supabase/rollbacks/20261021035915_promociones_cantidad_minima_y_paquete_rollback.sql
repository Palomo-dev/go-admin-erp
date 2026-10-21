-- Revierte 20261021035915_promociones_cantidad_minima_y_paquete.
-- Quita la cantidad mínima, la repetición, el alcance de la compra mínima
-- y las unidades por producto del paquete. No había filas que migrar:
-- las columnas nacieron nulas. Lo que se haya escrito después se pierde.

set lock_timeout = '10s';
alter table public.promotions drop constraint if exists promotions_min_quantity_check;
alter table public.promotions drop constraint if exists promotions_repeat_every_quantity_check;
alter table public.promotions drop constraint if exists promotions_min_purchase_scope_check;
alter table public.promotion_rules drop constraint if exists promotion_rules_quantity_check;
alter table public.promotions
  drop column if exists min_quantity,
  drop column if exists repeat_every_quantity,
  drop column if exists min_purchase_scope;
alter table public.promotion_rules
  drop column if exists quantity;
