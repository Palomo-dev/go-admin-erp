-- Reversión de 20260929150000_inv_b5_1_esquema.sql
-- Quita las guardias y las columnas nuevas de producción y recetas.
-- Advertencias:
--   * Revertir antes 20260929150250, 150200, 150150 y 150100 (las funciones usan estas columnas).
--   * Sin las guardias, el navegador vuelve a poder escribir órdenes y recetas
--     directamente (la RLS sigue siendo FOR ALL por pertenencia hasta B10).
--   * Se pierden confirmed_*, started_by, completed_by, cancelled_*, cancel_reason,
--     total_cost, unit_cost, client_key, complete_key; el costo y el lote de cada
--     consumo, y el autor de cada versión de receta. Ningún dato anterior se modificó.

drop trigger if exists trg_receta_ingrediente_guardia on public.recipe_ingredients;
drop trigger if exists trg_receta_guardia on public.product_recipes;
drop trigger if exists trg_produccion_consumo_guardia on public.production_order_consumptions;
drop trigger if exists trg_produccion_guardia on public.production_orders;
drop function if exists public.fn_produccion_int_guardia();

drop index if exists public.uq_production_orders_client_key;
drop index if exists public.idx_production_orders_org_creado;
drop index if exists public.idx_production_orders_org_producto;

alter table public.product_recipes drop column if exists created_by;

alter table public.production_order_consumptions
  drop column if exists lot_id,
  drop column if exists total_cost,
  drop column if exists unit_cost;

alter table public.production_orders
  drop column if exists complete_key,
  drop column if exists client_key,
  drop column if exists unit_cost,
  drop column if exists total_cost,
  drop column if exists cancel_reason,
  drop column if exists cancelled_by,
  drop column if exists cancelled_at,
  drop column if exists completed_by,
  drop column if exists started_by,
  drop column if exists confirmed_by,
  drop column if exists confirmed_at;
