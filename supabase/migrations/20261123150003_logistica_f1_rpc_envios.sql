-- Logística Fase 1 — 3/5: operación del envío en RPC transaccionales (asignar, cambiar estado,
-- entregar con prueba/código/recaudo, novedad).
--
-- Antes cada paso eran 3–4 llamadas sueltas desde el navegador (envío, vehículo, pedido web,
-- evento) y la asignación pisaba shipments.metadata entero. Ahora cada paso es UNA RPC:
--
-- - logistica_asignar_domiciliario(envío, domiciliario, vehículo?, fecha?): el vehículo es
--   opcional. Escribe driver_id/vehicle_id/assigned_at y deja el espejo en metadata con `||`
--   (nunca lo reemplaza). Libera el vehículo anterior si cambió.
-- - logistica_cambiar_estado(envío, estado, nota?, lat?, lng?): ready_for_pickup, picked,
--   in_transit, out_for_delivery, returned, cancelled, con la tabla de transiciones de
--   fn_logistica_transicion_valida (la misma que src/lib/logistica/estadosEnvio.ts). Propaga
--   «en camino» al pedido web y libera el vehículo al cerrar.
-- - logistica_marcar_entregado(envío, prueba, código?, cobro?): exige receptor; en contraentrega
--   exige el código de 4 dígitos y el cobro (monto y medio). Un código errado NO lanza error:
--   devuelve {ok:false, error:'CODIGO_INVALIDO', intentos_restantes} para que el intento fallido
--   quede contado (un RAISE lo desharía). A los 5 errores, CODIGO_BLOQUEADO (lo destraba un
--   administrador con logistica_codigo_entrega_reiniciar).
-- - logistica_registrar_novedad(envío, motivo, detalle?, reprogramar?, fotos?, lat?, lng?):
--   intento fallido con motivo en delivery_attempts y en el evento (reason_code); el envío queda en
--   failed_attempt con exception_reason.
-- - logistica_codigo_entrega(envío) / logistica_codigo_entrega_reiniciar(envío): solo
--   administradores (fn_caja_puede con 'logistica.codigo_entrega.ver') o service role.
--
-- Guarda común (fn_logistica_envio_bloquear): miembro activo de la organización del envío
-- (fn_assert_acceso_org) y acceso a su sede (app_branch_access), con FOR UPDATE. Todas SECURITY
-- DEFINER, search_path fijo, EXECUTE revocado a public y anon. Las auxiliares internas se revocan
-- también a authenticated.

-- ── Auxiliares ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_logistica_transicion_valida(p_desde text, p_hacia text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select case p_desde
    when 'draft' then p_hacia in ('ready_for_pickup', 'assigned', 'cancelled')
    when 'pending' then p_hacia in ('ready_for_pickup', 'assigned', 'cancelled')
    when 'ready' then p_hacia in ('ready_for_pickup', 'assigned', 'picked', 'out_for_delivery', 'cancelled')
    when 'ready_for_pickup' then p_hacia in ('assigned', 'picked', 'out_for_delivery', 'cancelled')
    when 'assigned' then p_hacia in ('ready_for_pickup', 'picked', 'out_for_delivery', 'cancelled')
    when 'picked' then p_hacia in ('in_transit', 'out_for_delivery', 'returned')
    when 'dispatched' then p_hacia in ('in_transit', 'out_for_delivery', 'returned')
    when 'in_transit' then p_hacia in ('out_for_delivery', 'returned')
    when 'out_for_delivery' then p_hacia in ('returned')
    when 'failed_attempt' then p_hacia in ('assigned', 'out_for_delivery', 'returned', 'cancelled')
    else false
  end;
$$;

create or replace function public.fn_logistica_envio_bloquear(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
begin
  select * into v_s from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if auth.uid() is not null and v_s.branch_id is not null and not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_ACCESO_SEDE' using errcode = '42501';
  end if;
  return v_s;
end;
$$;
revoke execute on function public.fn_logistica_envio_bloquear(uuid) from public, anon, authenticated;

create or replace function public.fn_logistica_registrar_evento(
  p_s public.shipments,
  p_evento text,
  p_canonico text,
  p_descripcion text,
  p_motivo text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_es_domiciliario boolean := false;
begin
  if v_uid is not null and p_s.driver_id is not null then
    select exists (select 1 from public.driver_credentials dc where dc.id = p_s.driver_id and dc.user_id = v_uid)
      into v_es_domiciliario;
  end if;
  insert into public.transport_events (organization_id, reference_type, reference_id, event_type, canonical_status,
                                       reason_code, event_time, actor_type, actor_id, latitude, longitude,
                                       description, payload, source)
  values (p_s.organization_id, 'shipment', p_s.id, p_evento, p_canonico, p_motivo, now(),
          case when v_uid is null then 'system' when v_es_domiciliario then 'driver' else 'user' end,
          v_uid, p_lat, p_lng, p_descripcion, coalesce(p_payload, '{}'::jsonb),
          case when v_es_domiciliario then 'driver_app' else 'internal' end);
end;
$$;
revoke execute on function public.fn_logistica_registrar_evento(public.shipments, text, text, text, text, numeric, numeric, jsonb)
  from public, anon, authenticated;

create or replace function public.fn_logistica_liberar_vehiculo(p_vehicle_id uuid, p_salvo_envio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_vehicle_id is null then
    return;
  end if;
  if not exists (select 1 from public.shipments s
                  where s.vehicle_id = p_vehicle_id and s.id <> p_salvo_envio
                    and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit',
                                     'out_for_delivery', 'failed_attempt')) then
    update public.vehicles set status = 'available', current_driver_id = null, updated_at = now()
     where id = p_vehicle_id and status = 'in_use';
  end if;
end;
$$;
revoke execute on function public.fn_logistica_liberar_vehiculo(uuid, uuid) from public, anon, authenticated;

-- ── Asignar domiciliario ───────────────────────────────────────────────────────────────────────
create or replace function public.logistica_asignar_domiciliario(
  p_shipment_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_fecha_estimada date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_dc public.driver_credentials;
  v_v public.vehicles;
  v_ahora timestamptz := now();
  v_vehiculo_anterior uuid;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if v_s.status not in ('draft', 'pending', 'ready', 'ready_for_pickup', 'assigned', 'failed_attempt') then
    raise exception 'ESTADO_NO_ASIGNABLE' using errcode = '22023', detail = v_s.status;
  end if;
  select * into v_dc from public.driver_credentials
   where id = p_driver_id and organization_id = v_s.organization_id and coalesce(is_active, true);
  if not found then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;
  if p_vehicle_id is not null then
    select * into v_v from public.vehicles
     where id = p_vehicle_id and organization_id = v_s.organization_id and coalesce(is_active, true)
       and status in ('available', 'in_use');
    if not found then
      raise exception 'VEHICULO_INVALIDO' using errcode = '22023';
    end if;
  end if;

  v_vehiculo_anterior := v_s.vehicle_id;

  update public.shipments set
    driver_id = p_driver_id,
    vehicle_id = p_vehicle_id,
    assigned_at = v_ahora,
    status = 'assigned',
    expected_delivery_date = coalesce(p_fecha_estimada, expected_delivery_date),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'driver_id', p_driver_id, 'vehicle_id', p_vehicle_id, 'assigned_at', v_ahora),
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  if p_vehicle_id is not null then
    update public.vehicles set status = 'in_use', current_driver_id = v_dc.user_id, updated_at = v_ahora
     where id = p_vehicle_id;
  end if;
  if v_vehiculo_anterior is not null and v_vehiculo_anterior is distinct from p_vehicle_id then
    perform public.fn_logistica_liberar_vehiculo(v_vehiculo_anterior, v_s.id);
  end if;

  perform public.fn_logistica_registrar_evento(
    v_s, 'assigned', 'assigned',
    'Domiciliario asignado' || case when p_vehicle_id is not null then ' con vehículo' else '' end,
    null, null, null, jsonb_build_object('driver_id', p_driver_id, 'vehicle_id', p_vehicle_id));

  return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status, 'driver_id', v_s.driver_id,
                            'vehicle_id', v_s.vehicle_id, 'assigned_at', v_s.assigned_at);
end;
$$;
revoke execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) to authenticated, service_role;

-- ── Cambiar estado ─────────────────────────────────────────────────────────────────────────────
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

-- ── Entregar ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.logistica_marcar_entregado(
  p_shipment_id uuid,
  p_prueba jsonb,
  p_codigo text default null,
  p_cobro jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_prueba jsonb := coalesce(p_prueba, '{}'::jsonb);
  v_ahora timestamptz := now();
  v_codigo public.shipment_delivery_codes;
  v_usuario_dom uuid;
  v_metodo text;
  v_monto numeric;
  v_prueba_id uuid;
  v_lat numeric;
  v_lng numeric;
  v_fotos text[];
  c_max_intentos constant integer := 5;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if v_s.status = 'delivered' then
    raise exception 'YA_ENTREGADO' using errcode = '22023';
  end if;
  if v_s.status not in ('assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit',
                        'out_for_delivery', 'failed_attempt') then
    raise exception 'ESTADO_NO_ENTREGABLE' using errcode = '22023', detail = v_s.status;
  end if;
  if nullif(btrim(coalesce(v_prueba ->> 'nombre', '')), '') is null then
    raise exception 'RECEPTOR_REQUERIDO' using errcode = '22023';
  end if;
  begin
    v_lat := nullif(v_prueba ->> 'lat', '')::numeric;
    v_lng := nullif(v_prueba ->> 'lng', '')::numeric;
  exception when others then
    v_lat := null;
    v_lng := null;
  end;
  if jsonb_typeof(v_prueba -> 'fotos') = 'array' then
    select array_agg(value) into v_fotos from jsonb_array_elements_text(v_prueba -> 'fotos');
  end if;

  -- Código de entrega (solo contraentrega propia).
  if v_s.delivery_code_required then
    select * into v_codigo from public.shipment_delivery_codes where shipment_id = v_s.id for update;
    if not found then
      raise exception 'CODIGO_NO_EMITIDO' using errcode = '22023';
    end if;
    if v_codigo.failed_tries >= c_max_intentos then
      raise exception 'CODIGO_BLOQUEADO' using errcode = '22023',
        hint = 'Un administrador debe reiniciar el código (logistica_codigo_entrega_reiniciar).';
    end if;
    if p_codigo is null or btrim(p_codigo) <> v_codigo.code then
      update public.shipment_delivery_codes set failed_tries = failed_tries + 1 where shipment_id = v_s.id;
      return jsonb_build_object('ok', false, 'error', 'CODIGO_INVALIDO',
                                'intentos_restantes', greatest(c_max_intentos - v_codigo.failed_tries - 1, 0));
    end if;
  end if;

  -- Recaudo de la contraentrega.
  if coalesce(v_s.cod_amount, 0) > 0 then
    v_metodo := lower(btrim(coalesce(p_cobro ->> 'metodo', '')));
    begin
      v_monto := (p_cobro ->> 'monto')::numeric;
    exception when others then
      v_monto := null;
    end;
    if v_metodo not in ('cash', 'card', 'transfer', 'qr') or v_monto is null or v_monto < 0 then
      raise exception 'COBRO_REQUERIDO' using errcode = '22023',
        hint = 'Contraentrega: p_cobro = {"metodo": "cash|card|transfer|qr", "monto": <número>}.';
    end if;
  end if;

  select dc.user_id into v_usuario_dom from public.driver_credentials dc where dc.id = v_s.driver_id;

  insert into public.proof_of_delivery (shipment_id, delivered_at, recipient_name, recipient_doc_type,
                                        recipient_doc_number, recipient_relationship, signature_url, photo_urls,
                                        latitude, longitude, delivery_location_type, driver_id, courier_id, notes,
                                        delivery_code_verified, cod_collected_amount, cod_collected_method)
  values (v_s.id, v_ahora, btrim(v_prueba ->> 'nombre'), nullif(v_prueba ->> 'tipo_documento', ''),
          nullif(v_prueba ->> 'documento', ''), nullif(v_prueba ->> 'relacion', ''), nullif(v_prueba ->> 'firma_url', ''),
          v_fotos, v_lat, v_lng, nullif(v_prueba ->> 'tipo_lugar', ''), v_usuario_dom, v_s.driver_id,
          nullif(v_prueba ->> 'notas', ''), v_s.delivery_code_required, v_monto, v_metodo)
  returning id into v_prueba_id;

  update public.shipments set
    status = 'delivered',
    delivered_at = v_ahora,
    picked_at = coalesce(picked_at, v_ahora),
    dispatched_at = coalesce(dispatched_at, v_ahora),
    cod_status = case when coalesce(cod_amount, 0) > 0 then 'collected' else cod_status end,
    cod_collected_amount = case when coalesce(cod_amount, 0) > 0 then v_monto else cod_collected_amount end,
    cod_collected_method = case when coalesce(cod_amount, 0) > 0 then v_metodo else cod_collected_method end,
    cod_collected_at = case when coalesce(cod_amount, 0) > 0 then v_ahora else cod_collected_at end,
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  if v_s.delivery_code_required then
    update public.shipment_delivery_codes set verified_at = v_ahora where shipment_id = v_s.id;
  end if;

  if v_s.source_type = 'web_order' and v_s.source_id is not null then
    update public.web_orders set status = 'delivered', delivered_at = v_ahora
     where id = v_s.source_id and organization_id = v_s.organization_id
       and status in ('confirmed', 'preparing', 'ready', 'in_delivery');
  end if;
  perform public.fn_logistica_liberar_vehiculo(v_s.vehicle_id, v_s.id);

  perform public.fn_logistica_registrar_evento(v_s, 'delivered', 'delivered',
    'Entregado a ' || btrim(v_prueba ->> 'nombre'), null, v_lat, v_lng,
    jsonb_build_object('proof_id', v_prueba_id, 'cod_monto', v_monto, 'cod_metodo', v_metodo));

  return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status, 'proof_id', v_prueba_id,
                            'cod_status', v_s.cod_status, 'cod_esperado', v_s.cod_amount,
                            'cod_recibido', v_monto, 'aviso', 'entregado');
end;
$$;
revoke execute on function public.logistica_marcar_entregado(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.logistica_marcar_entregado(uuid, jsonb, text, jsonb) to authenticated, service_role;

-- ── Novedad / intento fallido ──────────────────────────────────────────────────────────────────
create or replace function public.logistica_registrar_novedad(
  p_shipment_id uuid,
  p_motivo text,
  p_detalle text default null,
  p_reprogramar date default null,
  p_fotos text[] default null,
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
  v_intento smallint;
  v_usuario_dom uuid;
  v_ahora timestamptz := now();
begin
  if p_motivo is null or p_motivo not in ('not_home', 'wrong_address', 'incomplete_address', 'rejected', 'damaged',
                                          'lost', 'access_denied', 'business_closed', 'weather', 'vehicle_issue',
                                          'customer_request', 'other') then
    raise exception 'MOTIVO_INVALIDO' using errcode = '22023';
  end if;
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if v_s.status not in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery',
                        'failed_attempt') then
    raise exception 'ESTADO_SIN_NOVEDAD' using errcode = '22023', detail = v_s.status;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_intento from public.delivery_attempts where shipment_id = v_s.id;
  select dc.user_id into v_usuario_dom from public.driver_credentials dc where dc.id = v_s.driver_id;

  insert into public.delivery_attempts (shipment_id, attempt_number, attempted_at, status, failure_reason_code,
                                        failure_reason_text, latitude, longitude, driver_id, courier_id,
                                        reschedule_date, reschedule_notes, photo_urls)
  values (v_s.id, v_intento, v_ahora, 'failed', p_motivo, nullif(btrim(coalesce(p_detalle, '')), ''),
          p_lat, p_lng, v_usuario_dom, v_s.driver_id, p_reprogramar, null, p_fotos);

  update public.shipments set
    status = 'failed_attempt',
    exception_reason = p_motivo,
    exception_detail = nullif(btrim(coalesce(p_detalle, '')), ''),
    failed_attempts = failed_attempts + 1,
    expected_delivery_date = coalesce(p_reprogramar, expected_delivery_date),
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  perform public.fn_logistica_registrar_evento(v_s, 'failed_attempt', 'failed_attempt',
    'Intento ' || v_intento || ' fallido' || coalesce(': ' || nullif(btrim(coalesce(p_detalle, '')), ''), ''),
    p_motivo, p_lat, p_lng, jsonb_build_object('attempt_number', v_intento, 'reprogramar', p_reprogramar));

  return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status, 'intento', v_intento,
                            'motivo', p_motivo, 'aviso', 'novedad');
end;
$$;
revoke execute on function public.logistica_registrar_novedad(uuid, text, text, date, text[], numeric, numeric) from public, anon;
grant execute on function public.logistica_registrar_novedad(uuid, text, text, date, text[], numeric, numeric) to authenticated, service_role;

-- ── Código de entrega: ver y reiniciar (administradores o service role) ─────────────────────────
create or replace function public.logistica_codigo_entrega(p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_c public.shipment_delivery_codes;
begin
  select * into v_s from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if auth.uid() is not null and not public.fn_caja_puede(v_s.organization_id, 'logistica.codigo_entrega.ver') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  select * into v_c from public.shipment_delivery_codes where shipment_id = v_s.id;
  return jsonb_build_object('requerido', v_s.delivery_code_required, 'codigo', v_c.code,
                            'intentos_fallidos', coalesce(v_c.failed_tries, 0), 'verificado_en', v_c.verified_at);
end;
$$;
revoke execute on function public.logistica_codigo_entrega(uuid) from public, anon;
grant execute on function public.logistica_codigo_entrega(uuid) to authenticated, service_role;

create or replace function public.logistica_codigo_entrega_reiniciar(p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if auth.uid() is not null and not public.fn_caja_puede(v_s.organization_id, 'logistica.codigo_entrega.ver') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_s.status = 'delivered' then
    raise exception 'YA_ENTREGADO' using errcode = '22023';
  end if;
  update public.shipment_delivery_codes set failed_tries = 0, code = public.fn_logistica_codigo_4_digitos()
   where shipment_id = v_s.id;
  perform public.fn_logistica_registrar_evento(v_s, 'delivery_code_reset', null, 'Código de entrega reiniciado',
                                               null, null, null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.logistica_codigo_entrega_reiniciar(uuid) from public, anon;
grant execute on function public.logistica_codigo_entrega_reiniciar(uuid) to authenticated, service_role;
