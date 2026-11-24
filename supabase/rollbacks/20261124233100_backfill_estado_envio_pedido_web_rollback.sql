-- Rollback de 20261124233100_backfill_estado_envio_pedido_web.
--
-- ADVERTENCIA: es una corrección de datos; este archivo NO la deshace del todo.
--   A. Los 156 pedidos que pasaron de confirmed a ready no quedaron marcados: no se pueden separar
--      con certeza de los que alguien marcó listos a mano. No se revierten.
--   B. Los 297 envíos que pasaron de pending a ready_for_pickup sí quedaron marcados por su evento
--      (`transport_events.payload->>'origen' = 'correccion_sincronizacion'`). El bloque de abajo
--      los devuelve a pending SOLO si siguen en ready_for_pickup (los que ya avanzaron no se
--      tocan) y borra esos eventos.
--
-- Si 20261124233000 sigue aplicada, devolver el envío a pending no mueve el pedido (la
-- sincronización solo avanza).

do $$
begin
  update public.shipments s set status = 'pending', updated_at = now()
   where s.status = 'ready_for_pickup'
     and exists (select 1 from public.transport_events te
                  where te.reference_type = 'shipment' and te.reference_id = s.id
                    and te.payload ->> 'origen' = 'correccion_sincronizacion');
  delete from public.transport_events te
   where te.reference_type = 'shipment' and te.payload ->> 'origen' = 'correccion_sincronizacion'
     and exists (select 1 from public.shipments s where s.id = te.reference_id and s.status = 'pending');
end;
$$;
