-- Logística ↔ Pedidos online: un solo estado (2026-11-24).
--
-- Reporte del dueño: «El estado que tenga en Logística también lo comparta con los Pedidos
-- online de la web». Hasta hoy `shipments.status` y `web_orders.status` vivían separados: solo
-- `logistica_cambiar_estado` (recogido/en camino → in_delivery) y `logistica_marcar_entregado`
-- (→ delivered) tocaban el pedido; «Listo para salir» no, y nada iba del pedido al envío.
--
-- Regla (la copia en TS es src/lib/logistica/sincronizacionPedidoEnvio.ts; su prueba fija que
-- digan lo mismo):
--   Envío → pedido (solo AVANZA, nunca retrocede; un pedido sin confirmar no se toca):
--     ready / ready_for_pickup                          → ready
--     picked / dispatched / in_transit / out_for_delivery → in_delivery
--     delivered                                          → delivered
--     assigned, failed_attempt (novedad), failed, returned, cancelled → nada (la novedad solo se
--     muestra; cancelar el envío NO cancela el pedido).
--   Pedido → envío:
--     ready                                   → envío draft/pending pasa a ready_for_pickup
--     cancelled / rejected / expired / refunded → envío aún sin salir (draft, pending, ready,
--       ready_for_pickup, assigned) se cancela y libera el vehículo. Queda marcado en
--       metadata.cancelado_por_pedido; si el pedido se reactiva (reembolso fallido, pago tardío)
--       ese envío vuelve a su estado previo.
--     in_delivery / delivered desde Pedidos online NO mueven el envío: la entrega exige prueba,
--       código y cobro de la contraentrega (logistica_marcar_entregado).
--   Envío nuevo de un pedido que ya está listo → nace ready_for_pickup.
--
-- Dónde vive: en la base (triggers), porque el estado del pedido se escribe desde muchos sitios
-- (navegador de Pedidos online, PATCH de la tienda, comanda de cocina, RPC de confirmación,
-- reembolsos, cron de vencidos) y el del envío también (RPC de logística, pantallas viejas de
-- transporte). Un servicio en Node no los cubría todos.
--
-- Sin bucles: cada lado solo actúa si avanza; además, mientras el envío empuja al pedido se
-- marca `app.sincronizando_envio_pedido` (local a la transacción) y el trigger del pedido no
-- devuelve el golpe.
--
-- Efectos de otros triggers (verificados con dry-run en transacción revertida):
--   - fn_auto_journal_web_order: solo actúa en confirmed/completed/delivered. `ready` e
--     `in_delivery` no contabilizan; `delivered` ya lo escribía logistica_marcar_entregado
--     (mismo efecto que antes, una sola vez).
--   - fn_auto_journal_shipment: solo delivered con contraentrega y returned (no web). `cancelled`
--     y `ready_for_pickup` no contabilizan.
--   - fn_web_orders_mark_customer_purchased: solo confirmed. Los demás: updated_at y auditoría.
--
-- Avisos al cliente: los triggers NO avisan (un trigger no puede llamar a Resend ni a WhatsApp,
-- y el backfill no debe avisar). Avisa el código que hizo el cambio: `logistica_cambiar_estado`
-- devuelve `aviso = 'listo'` solo cuando ESTE cambio llevó el pedido a «listo» (o `en_camino`
-- como antes), y la pantalla llama a /api/web-orders/[id]/aviso-estado, que no repite un momento
-- ya enviado.

-- ── Regla pura ───────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_pedido_web_estado_de_envio(p_estado_envio text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_estado_envio
    when 'ready' then 'ready'
    when 'ready_for_pickup' then 'ready'
    when 'picked' then 'in_delivery'
    when 'dispatched' then 'in_delivery'
    when 'in_transit' then 'in_delivery'
    when 'out_for_delivery' then 'in_delivery'
    when 'delivered' then 'delivered'
    else null
  end;
$$;

comment on function public.fn_pedido_web_estado_de_envio(text) is
  'Estado al que el envío lleva al pedido web (null = no lo mueve). Copia en src/lib/logistica/sincronizacionPedidoEnvio.ts.';

-- Orden del camino del pedido. pending (sin confirmar) y los estados finales no tienen rango:
-- la sincronización nunca los mueve.
create or replace function public.fn_pedido_web_rango(p_estado text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_estado
    when 'confirmed' then 1
    when 'preparing' then 2
    when 'ready' then 3
    when 'in_delivery' then 4
    when 'delivered' then 5
    else null
  end;
$$;

comment on function public.fn_pedido_web_rango(text) is
  'Rango del estado del pedido web para «solo avanza» (null = la sincronización no lo mueve).';

revoke execute on function public.fn_pedido_web_estado_de_envio(text) from public, anon;
revoke execute on function public.fn_pedido_web_rango(text) from public, anon;
grant execute on function public.fn_pedido_web_estado_de_envio(text) to authenticated, service_role;
grant execute on function public.fn_pedido_web_rango(text) to authenticated, service_role;

-- ── Envío → pedido ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_shipments_sincroniza_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino text := public.fn_pedido_web_estado_de_envio(new.status);
begin
  if v_destino is null then
    return null;
  end if;
  perform set_config('app.sincronizando_envio_pedido', 'on', true);
  update public.web_orders w set
    status = v_destino,
    ready_at = case when v_destino = 'ready' then coalesce(w.ready_at, now()) else w.ready_at end,
    delivered_at = case when v_destino = 'delivered' then coalesce(new.delivered_at, now()) else w.delivered_at end
   where w.id = new.source_id
     and w.organization_id = new.organization_id
     and public.fn_pedido_web_rango(w.status) < public.fn_pedido_web_rango(v_destino);
  perform set_config('app.sincronizando_envio_pedido', '', true);
  return null;
end;
$$;

revoke execute on function public.fn_shipments_sincroniza_pedido() from public, anon, authenticated;

drop trigger if exists trg_shipments_sincroniza_pedido on public.shipments;
create trigger trg_shipments_sincroniza_pedido
  after update of status on public.shipments
  for each row
  when (new.source_type = 'web_order' and new.source_id is not null and new.status is distinct from old.status)
  execute function public.fn_shipments_sincroniza_pedido();

-- ── Pedido → envío ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_web_orders_sincroniza_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_previo text;
  v_destino text;
  v_canonico text;
begin
  -- El cambio vino del propio envío: no se devuelve el golpe.
  if coalesce(current_setting('app.sincronizando_envio_pedido', true), '') = 'on' then
    return null;
  end if;

  if new.status = 'ready' then
    for v_s in
      select * from public.shipments s
       where s.organization_id = new.organization_id and s.source_type = 'web_order' and s.source_id = new.id
         and s.status in ('draft', 'pending')
       for update
    loop
      update public.shipments set status = 'ready_for_pickup', updated_at = now()
       where id = v_s.id
      returning * into v_s;
      perform public.fn_logistica_registrar_evento(v_s, 'ready_for_pickup', 'ready_for_pickup',
        'Listo para salir: el pedido ' || coalesce(new.order_number, '') || ' se marcó listo', null, null, null,
        jsonb_build_object('origen', 'pedido_web', 'pedido_estado', new.status));
    end loop;

  elsif new.status in ('cancelled', 'rejected', 'expired', 'refunded') then
    for v_s in
      select * from public.shipments s
       where s.organization_id = new.organization_id and s.source_type = 'web_order' and s.source_id = new.id
         and s.status in ('draft', 'pending', 'ready', 'ready_for_pickup', 'assigned')
       for update
    loop
      v_previo := v_s.status;
      update public.shipments set
        status = 'cancelled',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelado_por_pedido',
          jsonb_build_object('estado_previo', v_previo, 'pedido_estado', new.status, 'at', now())),
        updated_at = now()
       where id = v_s.id
      returning * into v_s;
      perform public.fn_logistica_liberar_vehiculo(v_s.vehicle_id, v_s.id);
      perform public.fn_logistica_registrar_evento(v_s, 'cancelled', 'cancelled',
        'Cancelado: el pedido ' || coalesce(new.order_number, '') || ' quedó ' || case new.status
          when 'cancelled' then 'cancelado' when 'rejected' then 'rechazado'
          when 'expired' then 'vencido' else 'reembolsado' end,
        null, null, null,
        jsonb_build_object('origen', 'pedido_web', 'pedido_estado', new.status, 'estado_previo', v_previo));
    end loop;

  elsif old.status in ('cancelled', 'rejected', 'expired', 'refunded')
        and new.status in ('pending', 'confirmed', 'preparing', 'ready') then
    -- Reactivación (reembolso fallido, pago tardío): solo vuelven los envíos que canceló esta
    -- sincronización, a su estado previo.
    for v_s in
      select * from public.shipments s
       where s.organization_id = new.organization_id and s.source_type = 'web_order' and s.source_id = new.id
         and s.status = 'cancelled' and s.metadata ? 'cancelado_por_pedido'
       for update
    loop
      v_previo := coalesce(v_s.metadata -> 'cancelado_por_pedido' ->> 'estado_previo', 'pending');
      v_destino := case when new.status = 'ready' and v_previo in ('draft', 'pending') then 'ready_for_pickup' else v_previo end;
      update public.shipments set
        status = v_destino,
        metadata = metadata - 'cancelado_por_pedido',
        updated_at = now()
       where id = v_s.id
      returning * into v_s;
      v_canonico := case v_destino when 'draft' then 'created' when 'pending' then 'created'
                                   when 'ready' then 'ready_for_pickup' else v_destino end;
      perform public.fn_logistica_registrar_evento(v_s, 'reactivated', v_canonico,
        'Reactivado: el pedido ' || coalesce(new.order_number, '') || ' volvió a estar activo', null, null, null,
        jsonb_build_object('origen', 'pedido_web', 'pedido_estado', new.status, 'estado_previo', v_previo));
    end loop;
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_web_orders_sincroniza_envio() from public, anon, authenticated;

drop trigger if exists trg_web_orders_sincroniza_envio on public.web_orders;
create trigger trg_web_orders_sincroniza_envio
  after update of status on public.web_orders
  for each row
  when (new.status is distinct from old.status)
  execute function public.fn_web_orders_sincroniza_envio();

-- ── Envío nuevo de un pedido que ya está listo ───────────────────────────────────────────────

create or replace function public.fn_shipments_estado_inicial_de_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'draft') in ('draft', 'pending')
     and exists (select 1 from public.web_orders w
                  where w.id = new.source_id and w.organization_id = new.organization_id and w.status = 'ready') then
    new.status := 'ready_for_pickup';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_shipments_estado_inicial_de_pedido() from public, anon, authenticated;

drop trigger if exists trg_shipments_estado_inicial_de_pedido on public.shipments;
create trigger trg_shipments_estado_inicial_de_pedido
  before insert on public.shipments
  for each row
  when (new.source_type = 'web_order' and new.source_id is not null)
  execute function public.fn_shipments_estado_inicial_de_pedido();

-- ── logistica_cambiar_estado: el pedido lo mueve el trigger; aviso «listo» ───────────────────
-- Igual que 20261123150003 salvo: (1) el UPDATE de web_orders a in_delivery se quita (lo hace
-- trg_shipments_sincroniza_pedido, con la misma regla); (2) devuelve `aviso = 'listo'` cuando
-- ESTE cambio llevó el pedido a «listo» y `pedido_estado` con el estado resultante del pedido.
-- `logistica_marcar_entregado` NO se toca: su UPDATE a delivered queda redundante (el trigger ya
-- dejó el pedido entregado y el UPDATE no encuentra fila), sin doble efecto.

create or replace function public.logistica_cambiar_estado(
  p_shipment_id uuid,
  p_estado text,
  p_nota text default null,
  p_lat numeric default null,
  p_lng numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_ahora timestamptz := now();
  v_desc text;
  v_pedido_antes text;
  v_pedido_despues text;
begin
  if p_estado not in ('ready_for_pickup', 'picked', 'in_transit', 'out_for_delivery', 'returned', 'cancelled') then
    raise exception 'ESTADO_NO_PERMITIDO' using errcode = '22023',
      hint = 'Entregar: logistica_marcar_entregado. Novedad: logistica_registrar_novedad. Asignar: logistica_asignar_domiciliario.';
  end if;
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if v_s.status = p_estado then
    return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status, 'sin_cambio', true);
  end if;
  if not public.fn_logistica_transicion_valida(v_s.status, p_estado) then
    raise exception 'TRANSICION_INVALIDA' using errcode = '22023', detail = v_s.status || ' → ' || p_estado;
  end if;

  if v_s.source_type = 'web_order' and v_s.source_id is not null then
    select w.status into v_pedido_antes from public.web_orders w
     where w.id = v_s.source_id and w.organization_id = v_s.organization_id;
  end if;

  -- trg_shipments_sincroniza_pedido mueve el pedido web (listo / en camino) en este UPDATE.
  update public.shipments set
    status = p_estado,
    picked_at = case when p_estado in ('picked', 'in_transit', 'out_for_delivery') then coalesce(picked_at, v_ahora) else picked_at end,
    dispatched_at = case when p_estado in ('in_transit', 'out_for_delivery') then coalesce(dispatched_at, v_ahora) else dispatched_at end,
    internal_notes = case when nullif(btrim(coalesce(p_nota, '')), '') is null then internal_notes
                          else concat_ws(E'\n', internal_notes, btrim(p_nota)) end,
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  if v_s.source_type = 'web_order' and v_s.source_id is not null then
    select w.status into v_pedido_despues from public.web_orders w
     where w.id = v_s.source_id and w.organization_id = v_s.organization_id;
  end if;
  if p_estado in ('returned', 'cancelled') then
    perform public.fn_logistica_liberar_vehiculo(v_s.vehicle_id, v_s.id);
  end if;

  v_desc := case p_estado
    when 'ready_for_pickup' then 'Listo para salir'
    when 'picked' then 'Recogido por el domiciliario'
    when 'in_transit' then 'En tránsito'
    when 'out_for_delivery' then 'En camino al cliente'
    when 'returned' then 'Devuelto'
    when 'cancelled' then 'Cancelado'
  end;
  perform public.fn_logistica_registrar_evento(v_s, p_estado, p_estado,
    v_desc || coalesce(': ' || nullif(btrim(coalesce(p_nota, '')), ''), ''), null, p_lat, p_lng, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status,
                            'pedido_estado', v_pedido_despues,
                            'aviso', case
                              when p_estado = 'out_for_delivery' then 'en_camino'
                              when v_pedido_despues = 'ready' and v_pedido_antes is distinct from 'ready' then 'listo'
                            end);
end;
$$;

revoke execute on function public.logistica_cambiar_estado(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.logistica_cambiar_estado(uuid, text, text, numeric, numeric) to authenticated, service_role;
