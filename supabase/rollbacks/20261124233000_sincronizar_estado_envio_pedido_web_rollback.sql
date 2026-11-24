-- Rollback de 20261124233000_sincronizar_estado_envio_pedido_web.
--
-- Quita los tres triggers de sincronización y sus funciones, y devuelve logistica_cambiar_estado
-- a su versión de 20261123150003 (con el UPDATE de web_orders a in_delivery dentro de la RPC y
-- sin `aviso = 'listo'`). No revierte datos: los estados que la sincronización ya movió se quedan
-- como están (ver el rollback del backfill 20261124233100).
--
-- Ojo: sin los triggers, logistica_marcar_entregado sigue llevando el pedido a delivered por su
-- propio UPDATE (no se tocó), y la pantalla deja de recibir `aviso = 'listo'`.

drop trigger if exists trg_shipments_sincroniza_pedido on public.shipments;
drop trigger if exists trg_web_orders_sincroniza_envio on public.web_orders;
drop trigger if exists trg_shipments_estado_inicial_de_pedido on public.shipments;

drop function if exists public.fn_shipments_sincroniza_pedido();
drop function if exists public.fn_web_orders_sincroniza_envio();
drop function if exists public.fn_shipments_estado_inicial_de_pedido();
drop function if exists public.fn_pedido_web_estado_de_envio(text);
drop function if exists public.fn_pedido_web_rango(text);

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

  update public.shipments set
    status = p_estado,
    picked_at = case when p_estado in ('picked', 'in_transit', 'out_for_delivery') then coalesce(picked_at, v_ahora) else picked_at end,
    dispatched_at = case when p_estado in ('in_transit', 'out_for_delivery') then coalesce(dispatched_at, v_ahora) else dispatched_at end,
    internal_notes = case when nullif(btrim(coalesce(p_nota, '')), '') is null then internal_notes
                          else concat_ws(E'\n', internal_notes, btrim(p_nota)) end,
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  if v_s.source_type = 'web_order' and v_s.source_id is not null and p_estado in ('picked', 'in_transit', 'out_for_delivery') then
    update public.web_orders set status = 'in_delivery'
     where id = v_s.source_id and organization_id = v_s.organization_id
       and status in ('confirmed', 'preparing', 'ready');
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
                            'aviso', case when p_estado = 'out_for_delivery' then 'en_camino' end);
end;
$$;

revoke execute on function public.logistica_cambiar_estado(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.logistica_cambiar_estado(uuid, text, text, numeric, numeric) to authenticated, service_role;
