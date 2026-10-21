-- Aplicada el 2026-10-21 con apply_migration (versión 20261021035915).
--
-- Cantidad mínima de unidades, repetición cada N y sobre qué subtotal se
-- mide la compra mínima. En las reglas, cuántas unidades de ese producto
-- entran en un paquete. Las columnas nacen nulas: una promoción ya creada
-- sigue descontando una sola vez y el paquete sigue contando 1 por producto.
--
-- Idempotente. Rollback: supabase/rollbacks/20261021035915_promociones_cantidad_minima_y_paquete_rollback.sql

set lock_timeout = '10s';
alter table public.promotions
  add column if not exists min_quantity integer,
  add column if not exists repeat_every_quantity integer,
  add column if not exists min_purchase_scope text;
alter table public.promotions drop constraint if exists promotions_min_quantity_check;
alter table public.promotions add constraint promotions_min_quantity_check check (min_quantity is null or min_quantity > 0);
alter table public.promotions drop constraint if exists promotions_repeat_every_quantity_check;
alter table public.promotions add constraint promotions_repeat_every_quantity_check check (repeat_every_quantity is null or repeat_every_quantity > 0);
alter table public.promotions drop constraint if exists promotions_min_purchase_scope_check;
alter table public.promotions add constraint promotions_min_purchase_scope_check check (min_purchase_scope is null or min_purchase_scope in ('eligible', 'cart'));
alter table public.promotion_rules add column if not exists quantity integer;
alter table public.promotion_rules drop constraint if exists promotion_rules_quantity_check;
alter table public.promotion_rules add constraint promotion_rules_quantity_check check (quantity is null or quantity > 0);
comment on column public.promotions.min_quantity is
  'Unidades minimas de las lineas que entran en la promo. Solo porcentaje, monto fijo y paquete. NULL = sin minimo de unidades.';
comment on column public.promotions.repeat_every_quantity is
  'Repite el descuento por cada grupo de N unidades (porcentaje y monto fijo). NULL = una sola vez.';
comment on column public.promotions.min_purchase_scope is
  'Sobre que subtotal se mide min_purchase_amount: eligible (lineas de la promo) o cart (toda la cuenta). NULL = toda la cuenta si applies_to es all; si no, solo las lineas de la promo.';
comment on column public.promotion_rules.quantity is
  'Unidades de ese producto en un paquete. NULL = 1. Solo la usa el tipo bundle.';
