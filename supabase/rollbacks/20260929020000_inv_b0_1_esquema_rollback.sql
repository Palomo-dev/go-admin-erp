-- Reversión de 20260929020000_inv_b0_1_esquema.sql
-- Advertencia: las columnas nuevas se eliminan con sus datos (autor y costo tras
-- el movimiento de stock_movements, organización/sucursal/notas de lots,
-- products.track_lots). Aplicar solo después de revertir las migraciones 2–7 del
-- bloque B0, que las usan.

drop trigger if exists trg_lots_organizacion on public.lots;
drop function if exists public.fn_lots_completar_organizacion();

drop index if exists public.lots_org_product_code_key;
drop index if exists public.idx_lots_org_product_expiry;
alter table public.lots
  drop column if exists organization_id,
  drop column if exists branch_id,
  drop column if exists notes,
  drop column if exists created_by;

drop index if exists public.idx_stock_movements_kardex;
alter table public.stock_movements drop constraint if exists stock_movements_created_by_fkey;
alter table public.stock_movements
  drop column if exists created_by,
  drop column if exists avg_cost_after;

alter table public.products drop column if exists track_lots;
