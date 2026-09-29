-- Reversión de 20260929130000_inv_b2_1_esquema.sql
-- Quita los disparadores, los índices y las columnas nuevas de ajustes, y deja el
-- CHECK de estado como estaba (draft/posted).
-- Advertencias:
--   * Revertir 2/3 y 3/3 antes (las funciones usan estas columnas).
--   * Los ajustes descartados ('cancelled') no caben en el CHECK anterior: la
--     reversión los devuelve a 'draft' (siguen sin mover stock) y el motivo se pierde.
--   * Se pierden code, mode, counted_at, posted_at/by, cancelled_*, apply_key,
--     system_qty, difference y applied_cost. Ningún dato anterior se había
--     modificado: solo se rellenaron columnas nuevas.

drop trigger if exists trg_ajuste_item_proteger on public.adjustment_items;
drop trigger if exists trg_ajuste_proteger on public.inventory_adjustments;
drop trigger if exists trg_ajuste_antes_insertar on public.inventory_adjustments;
drop function if exists public.fn_ajuste_int_item_proteger();
drop function if exists public.fn_ajuste_int_proteger();
drop function if exists public.fn_ajuste_int_antes_insertar();

update public.inventory_adjustments set status = 'draft' where status = 'cancelled';

alter table public.inventory_adjustments drop constraint if exists inventory_adjustments_status_check;
alter table public.inventory_adjustments
  add constraint inventory_adjustments_status_check
  check (status = any (array['draft'::text, 'posted'::text]));
alter table public.inventory_adjustments drop constraint if exists inventory_adjustments_mode_check;

drop index if exists public.idx_stock_movements_ajuste;
drop index if exists public.idx_adjustment_items_ajuste;
drop index if exists public.idx_inventory_adjustments_org_fecha;
drop index if exists public.inventory_adjustments_org_code_key;

alter table public.adjustment_items
  drop column if exists applied_cost,
  drop column if exists difference,
  drop column if exists system_qty;

alter table public.inventory_adjustments
  drop column if exists apply_key,
  drop column if exists cancel_reason,
  drop column if exists cancelled_by,
  drop column if exists cancelled_at,
  drop column if exists posted_by,
  drop column if exists posted_at,
  drop column if exists counted_at,
  drop column if exists mode,
  drop column if exists code;
