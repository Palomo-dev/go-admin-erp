-- Inventario B5 · Esquema de producción y recetas (INVENTARIO-PLAN.md §5.6).
--
-- Aditivo: columnas NULL-ables o con DEFAULT, índices y dos guardias.
--
-- production_orders
--   confirmed_at/by, started_by, completed_by, cancelled_at/by, cancel_reason:
--     quién y cuándo en cada paso (antes solo started_at/completed_at).
--   total_cost, unit_cost: costo real del terminado al completar
--     (Σ consumos ÷ producido); antes el terminado entraba a costo 0.
--   client_key, complete_key: idempotencia de crear y de completar.
-- production_order_consumptions
--   unit_cost, total_cost, lot_id: cada consumo con su costo y su lote (FEFO
--   puede partir un ingrediente en varios lotes: una fila por movimiento).
-- product_recipes.created_by: autor de cada versión (hoja «Versiones»).
--
-- Guardias (mismo patrón que B3, fn_traslado_int_guardia): cuando quien escribe
-- es `authenticated`/`anon` directamente (no una RPC SECURITY DEFINER), las
-- órdenes de producción, sus consumos, las recetas y sus ingredientes no se
-- pueden escribir: la orden quedaba «completada» sin mover stock porque el
-- navegador hacía UPDATE status = 'completed' cuando la RPC fallaba. Hoy el
-- único escritor directo es `productionOrderService`/`recipeService`, que en
-- este mismo bloque pasan a RPC. Las RPC (DEFINER) validan por sí mismas.
--
-- Datos: 1 orden (org 142, completada sin consumos, anterior a B5) y 57
-- recetas; no se modifican.

alter table public.production_orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists started_by uuid,
  add column if not exists completed_by uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text,
  add column if not exists total_cost numeric,
  add column if not exists unit_cost numeric,
  add column if not exists client_key text,
  add column if not exists complete_key text;

comment on column public.production_orders.total_cost is
  'Costo real de lo producido al completar: Σ costo de los consumos (ingredientes con y sin inventario, sin opcionales).';
comment on column public.production_orders.unit_cost is
  'Costo real por unidad del terminado = total_cost ÷ produced_qty; con él entra al inventario (promedio ponderado).';
comment on column public.production_orders.client_key is 'Idempotencia de fn_produccion_guardar (doble clic, reintento).';
comment on column public.production_orders.complete_key is 'Idempotencia de complete_production_order.';

create unique index if not exists uq_production_orders_client_key
  on public.production_orders (organization_id, client_key) where client_key is not null;
create index if not exists idx_production_orders_org_creado
  on public.production_orders (organization_id, created_at desc, id desc);
create index if not exists idx_production_orders_org_producto
  on public.production_orders (organization_id, product_id);

alter table public.production_order_consumptions
  add column if not exists unit_cost numeric,
  add column if not exists total_cost numeric,
  add column if not exists lot_id integer references public.lots(id) on delete set null;

comment on column public.production_order_consumptions.unit_cost is
  'Costo unitario con que salió el ingrediente (el del movimiento del kardex; sin inventario: costo vigente).';
comment on column public.production_order_consumptions.stock_movement_id is
  'Movimiento del kardex (NULL si el ingrediente no lleva inventario: se costea pero no descuenta).';

alter table public.product_recipes
  add column if not exists created_by uuid default auth.uid();

comment on column public.product_recipes.created_by is 'Quién guardó esta versión (las versiones no se editan).';

-- ── Guardia ─────────────────────────────────────────────────────────────────
create or replace function public.fn_produccion_int_guardia()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Dentro de una RPC DEFINER current_user es su dueño: esas validan por sí mismas.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_table_name in ('production_orders', 'production_order_consumptions') then
    raise exception 'produccion_solo_por_rpc' using errcode = '42501',
      detail = 'Usa fn_produccion_guardar, fn_produccion_cambiar_estado o complete_production_order.';
  end if;
  raise exception 'receta_solo_por_rpc' using errcode = '42501',
    detail = 'Usa fn_receta_guardar, fn_receta_desactivar o fn_receta_reactivar.';
end;
$$;

revoke all on function public.fn_produccion_int_guardia() from public, anon, authenticated;

drop trigger if exists trg_produccion_guardia on public.production_orders;
create trigger trg_produccion_guardia
  before insert or update or delete on public.production_orders
  for each row execute function public.fn_produccion_int_guardia();

drop trigger if exists trg_produccion_consumo_guardia on public.production_order_consumptions;
create trigger trg_produccion_consumo_guardia
  before insert or update or delete on public.production_order_consumptions
  for each row execute function public.fn_produccion_int_guardia();

drop trigger if exists trg_receta_guardia on public.product_recipes;
create trigger trg_receta_guardia
  before insert or update or delete on public.product_recipes
  for each row execute function public.fn_produccion_int_guardia();

drop trigger if exists trg_receta_ingrediente_guardia on public.recipe_ingredients;
create trigger trg_receta_ingrediente_guardia
  before insert or update or delete on public.recipe_ingredients
  for each row execute function public.fn_produccion_int_guardia();
