-- Reversión de 20260929073000_inv_b3_1_esquema.sql.
-- Revertir antes 20260929073100/073200/073300/073400 (las RPC fn_traslado_*,
-- fn_distribucion_* y la limpieza de 2025 usan estas columnas y la tabla).
-- ADVERTENCIA: borra el código, las fechas y autores de despacho/recepción, el
-- motivo de cancelación, el vínculo con la orden de producción, el costo con el
-- que salió cada renglón, los faltantes, las devoluciones, los seriales que
-- viajan y todo el seguimiento de los traslados creados desde entonces. Los
-- movimientos de kardex no se tocan.

drop table if exists public.inventory_transfer_events;

drop index if exists public.idx_transfer_items_traslado;
alter table public.transfer_items drop constraint if exists transfer_items_cantidades_validas;
alter table public.transfer_items
  drop column if exists serial_ids,
  drop column if exists difference_reason,
  drop column if exists returned_qty,
  drop column if exists missing_qty,
  drop column if exists unit_cost;

drop trigger if exists trg_traslado_codigo on public.inventory_transfers;
drop function if exists public.fn_traslado_int_codigo();

drop index if exists public.idx_inventory_transfers_produccion;
drop index if exists public.idx_inventory_transfers_org_fecha;
drop index if exists public.inventory_transfers_org_client_key;
drop index if exists public.inventory_transfers_org_code_key;

alter table public.inventory_transfers
  drop column if exists client_key,
  drop column if exists production_order_id,
  drop column if exists cancel_reason,
  drop column if exists cancelled_by,
  drop column if exists cancelled_at,
  drop column if exists received_by,
  drop column if exists received_at,
  drop column if exists shipped_by,
  drop column if exists shipped_at,
  drop column if exists code;
