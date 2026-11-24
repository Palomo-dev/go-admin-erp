-- Corrección de lo existente tras 20261124233000_sincronizar_estado_envio_pedido_web (2026-11-24).
--
-- Solo en la dirección segura (la que AVANZA) y solo hasta «listo»: en camino / entregado no se
-- corrigen aquí (entregado crearía la factura de un pedido pagado por fn_auto_journal_web_order).
--   A. Pedido confirmed/preparing con su envío ya listo (ready / ready_for_pickup) → pedido ready.
--   B. Pedido ready con su envío aún en draft/pending → envío ready_for_pickup, con su evento.
-- Conteo al planearlo (dry-run en transacción revertida, 2026-11-24): A = 156 pedidos (1 org),
-- B = 297 envíos (2 orgs). Sin asientos, facturas, cartera ni avisos: `ready` y `ready_for_pickup`
-- no disparan contabilidad, y los triggers no avisan al cliente (son pedidos viejos).
-- Idempotente: una segunda pasada no encuentra filas.

do $$
declare
  v_s public.shipments;
begin
  -- A. El trigger del pedido no tiene nada que empujar (el envío ya está listo); se marca igual.
  perform set_config('app.sincronizando_envio_pedido', 'on', true);
  update public.web_orders w set
    status = 'ready',
    ready_at = coalesce(w.ready_at,
                        (select max(te.event_time) from public.transport_events te
                          where te.reference_type = 'shipment' and te.reference_id = s.id
                            and te.canonical_status = 'ready_for_pickup'),
                        s.updated_at, now())
    from public.shipments s
   where s.source_type = 'web_order' and s.source_id = w.id and s.organization_id = w.organization_id
     and s.status in ('ready', 'ready_for_pickup')
     and w.status in ('confirmed', 'preparing');
  perform set_config('app.sincronizando_envio_pedido', '', true);

  -- B. trg_shipments_sincroniza_pedido no mueve el pedido (ya está listo).
  for v_s in
    select s.* from public.shipments s
      join public.web_orders w on w.id = s.source_id and w.organization_id = s.organization_id
     where s.source_type = 'web_order' and w.status = 'ready' and s.status in ('draft', 'pending')
       for update of s
  loop
    update public.shipments set status = 'ready_for_pickup', updated_at = now()
     where id = v_s.id
    returning * into v_s;
    perform public.fn_logistica_registrar_evento(v_s, 'ready_for_pickup', 'ready_for_pickup',
      'Listo para salir: alineado con el pedido (corrección 2026-11-24)', null, null, null,
      jsonb_build_object('origen', 'correccion_sincronizacion'));
  end loop;
end;
$$;
