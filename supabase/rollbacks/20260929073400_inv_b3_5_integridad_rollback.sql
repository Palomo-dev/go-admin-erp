-- Reversión de 20260929073400_inv_b3_5_integridad.sql.
-- ADVERTENCIA: vuelve a dejar que cualquier miembro cambie desde el navegador
-- cantidades y estados de traslados despachados (la RLS sigue FOR ALL hasta B10).

drop trigger if exists trg_traslado_renglon_guardia on public.transfer_items;
drop trigger if exists trg_traslado_guardia on public.inventory_transfers;
drop function if exists public.fn_traslado_int_guardia();
