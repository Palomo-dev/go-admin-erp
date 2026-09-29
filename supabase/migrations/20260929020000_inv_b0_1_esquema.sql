-- Inventario B0 · 1/7 — Esquema del núcleo de existencias
-- docs/implementacion/INVENTARIO-PLAN.md §5.1 (migraciones 1 y 2).
--
-- Todo aditivo: columnas NULL-ables o con DEFAULT, sin DROP ni cambios de tipo.
--
-- 1. stock_movements: quién hizo el movimiento (`created_by`) y el costo promedio
--    de la fila de existencias justo después (`avg_cost_after`). Las escribe
--    `fn_inv_int_mover` (migración 3); los movimientos históricos quedan en NULL.
--    Índice para el kardex por producto y sucursal en orden cronológico. La tabla
--    tiene 14.910 filas (2026-09-28): el índice se crea en milisegundos, por eso
--    va dentro de la migración y no `concurrently`.
-- 2. lots: organización (con relleno desde el producto: 3 lotes, 0 choques de
--    código por organización), sucursal, notas y autor; código único por
--    organización y producto. Un disparador completa la organización cuando el
--    alta llega sin ella (LotesService.ts sigue insertando sin ella hasta B1).
-- 3. products.track_lots: el producto se controla por lotes (FEFO al vender).
--    Todos arrancan en false: nada cambia hasta que una organización lo active.

-- ── 1. stock_movements ───────────────────────────────────────────────────────
alter table public.stock_movements
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists avg_cost_after numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_created_by_fkey') then
    alter table public.stock_movements
      add constraint stock_movements_created_by_fkey foreign key (created_by)
      references auth.users(id) on delete set null;
  end if;
end $$;

comment on column public.stock_movements.created_by is
  'Usuario que registró el movimiento (auth.uid() o el usuario que pasa la RPC). NULL en los movimientos anteriores al núcleo B0.';
comment on column public.stock_movements.avg_cost_after is
  'Costo promedio de la fila de existencias (producto, sucursal, lote) justo después del movimiento. Lo escribe fn_inv_int_mover; NULL en los históricos.';

create index if not exists idx_stock_movements_kardex
  on public.stock_movements (organization_id, product_id, branch_id, created_at, id);

-- ── 2. lots ──────────────────────────────────────────────────────────────────
alter table public.lots
  add column if not exists organization_id integer references public.organizations(id) on delete cascade,
  add column if not exists branch_id integer references public.branches(id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_by uuid default auth.uid();

update public.lots l
   set organization_id = p.organization_id
  from public.products p
 where p.id = l.product_id
   and l.organization_id is null;

create unique index if not exists lots_org_product_code_key
  on public.lots (organization_id, product_id, lot_code);
create index if not exists idx_lots_org_product_expiry
  on public.lots (organization_id, product_id, expiry_date);

comment on column public.lots.organization_id is
  'Organización dueña del lote. La completa trg_lots_organizacion desde el producto si llega NULL.';
comment on column public.lots.branch_id is
  'Sucursal donde se recibió el lote (informativo: la existencia por sucursal vive en stock_levels.lot_id).';

create or replace function public.fn_lots_completar_organizacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    select p.organization_id into new.organization_id from public.products p where p.id = new.product_id;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_lots_completar_organizacion() from anon, public, authenticated;

drop trigger if exists trg_lots_organizacion on public.lots;
create trigger trg_lots_organizacion
  before insert or update of product_id, organization_id on public.lots
  for each row execute function public.fn_lots_completar_organizacion();

-- ── 3. products.track_lots ───────────────────────────────────────────────────
alter table public.products
  add column if not exists track_lots boolean not null default false;

comment on column public.products.track_lots is
  'El producto se controla por lotes: las salidas sin lote explícito consumen primero el lote que vence antes (FEFO, fn_inv_int_mover).';
