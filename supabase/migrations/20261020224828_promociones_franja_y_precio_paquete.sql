-- Aplicada el 2026-10-20 con apply_migration (versión 20261020224828).
--
-- Franja horaria de una promoción (en la zona de la organización) y precio
-- fijo del paquete. Las tres columnas son nulas: una promoción ya creada
-- sigue aplicando todo el día y el paquete sigue usando el porcentaje.
-- Si end_time es anterior a start_time, la franja cruza la medianoche.
--
-- Idempotente. Rollback: supabase/rollbacks/20261020224828_promociones_franja_y_precio_paquete_rollback.sql

set lock_timeout = '10s';
alter table public.promotions
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists bundle_price numeric;
alter table public.promotions drop constraint if exists promotions_bundle_price_nonneg;
alter table public.promotions
  add constraint promotions_bundle_price_nonneg
  check (bundle_price is null or bundle_price >= 0);
comment on column public.promotions.start_time is
  'Hora de inicio de la franja diaria, en la zona de la organizacion. NULL = sin hora de inicio.';
comment on column public.promotions.end_time is
  'Hora de fin de la franja diaria, en la zona de la organizacion. Si es anterior a start_time, la franja cruza la medianoche. NULL = sin hora de fin.';
comment on column public.promotions.bundle_price is
  'Precio del paquete cuando la promocion es bundle. Si es mayor que cero y los productos incluidos estan en la cuenta, el descuento es la diferencia contra ese precio. NULL = se usa el porcentaje de discount_value.';
