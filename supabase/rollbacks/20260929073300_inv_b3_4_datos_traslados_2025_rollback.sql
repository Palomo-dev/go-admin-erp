-- Reversión de 20260929073300_inv_b3_4_datos_traslados_2025.sql.
-- Vuelve a abrir los 3 traslados de julio de 2025 de la org 2 (ids 1 y 2 a
-- pending, id 4 a in_transit) solo si siguen cancelados por esta limpieza, y
-- borra su evento de seguimiento. No mueve stock (la migración tampoco lo hizo).

with limpieza as (
  select e.transfer_id from public.inventory_transfer_events e
   where e.organization_id = 2 and e.tipo = 'cancelado' and e.detalle->>'limpieza' = 'b3_2025'
)
update public.inventory_transfers t
   set status = case when t.id = 4 then 'in_transit' else 'pending' end,
       cancelled_at = null, cancelled_by = null, cancel_reason = null, updated_at = now()
 where t.organization_id = 2 and t.id in (1, 2, 4) and t.status = 'cancelled'
   and t.id in (select transfer_id from limpieza);

delete from public.inventory_transfer_events e
 where e.organization_id = 2 and e.tipo = 'cancelado' and e.detalle->>'limpieza' = 'b3_2025';
