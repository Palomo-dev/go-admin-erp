-- Reversión de 20261125044314_logistica_1b_domiciliario_vehiculo.sql.
--
-- Restaura las funciones anteriores (cuerpos tomados de la base el 2026-11-24 antes de aplicar) y
-- quita columnas, restricciones, bitácora, permiso y funciones nuevas.
--
-- ADVERTENCIA: no restaura datos. Se pierden el uso, el dueño y el vehículo por defecto guardados,
-- la bitácora de asignación y el espejo del vehículo en `shipments.metadata` queda como dato muerto.
-- Antes de volver a poner `vehicles.plate` NOT NULL, las bicis o vehículos de terceros sin placa
-- deben recibir una placa (o borrarse); si no, el `set not null` falla y la reversión se detiene.

-- ── Funciones nuevas ────────────────────────────────────────────────────────
drop function if exists public.logistica_vincular_vehiculo(uuid, uuid, jsonb);
drop function if exists public.logistica_revisar_asignacion(uuid[], uuid, uuid, text);
drop function if exists public.logistica_asignar_domiciliario(uuid, uuid, uuid, date, text, text, text, uuid);
drop function if exists public.fn_logistica_carga_vehiculo(uuid, uuid, uuid[]);
drop function if exists public.fn_logistica_cumplimiento_asignacion(integer, uuid, uuid, text, date, numeric, numeric);
drop function if exists public.fn_logistica_vehiculo_sugerido(integer, uuid, uuid, uuid, uuid[]);
drop function if exists public.fn_flota_categorias_licencia(text);
drop function if exists public.fn_logistica_hay_autorizador_con_pin(integer);
drop function if exists public.fn_logistica_autorizadores(integer);
drop function if exists public.fn_logistica_bloqueo_documentos(integer);

-- ── Asignar (versión de 20261123165617) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logistica_asignar_domiciliario(p_shipment_id uuid, p_driver_id uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_fecha_estimada date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s public.shipments;
  v_dc public.driver_credentials;
  v_v public.vehicles;
  v_ahora timestamptz := now();
  v_vehiculo_anterior uuid;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  -- Asignar es de quien despacha: un domiciliario sin permiso no se asigna ni reasigna envíos.
  if auth.uid() is not null and not public.fn_logistica_ve_todo(v_s.organization_id) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_s.status not in ('draft', 'pending', 'ready', 'ready_for_pickup', 'assigned', 'failed_attempt') then
    raise exception 'ESTADO_NO_ASIGNABLE' using errcode = '22023', detail = v_s.status;
  end if;
  select * into v_dc from public.driver_credentials
   where id = p_driver_id and organization_id = v_s.organization_id and coalesce(is_active, true);
  if not found then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;
  -- «¿Cobra contraentrega?» del domiciliario (metadata.cobra_contraentrega; sin dato = sí).
  if coalesce(v_s.cod_amount, 0) > 0 and coalesce(v_dc.metadata ->> 'cobra_contraentrega', 'true') = 'false' then
    raise exception 'DOMICILIARIO_NO_COBRA' using errcode = '22023';
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
$function$;

revoke execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) to authenticated, service_role;

-- ── Liberar (borraba el conductor) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_logistica_liberar_vehiculo(p_vehicle_id uuid, p_salvo_envio uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ── POS (asignaba sin vehículo y sin atrapar el error) ──────────────────────
CREATE OR REPLACE FUNCTION public.logistica_crear_envio_venta_pos(p_sale_id uuid, p_entrega jsonb, p_driver_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale public.sales;
  v_e jsonb := coalesce(p_entrega, '{}'::jsonb);
  v_existente uuid;
  v_id uuid;
  v_cot jsonb;
  v_flete numeric;
  v_fuente text;
  v_zona uuid;
  v_cod numeric;
  v_contacto text;
  v_telefono text;
  v_numero text;
  v_items integer;
  v_org_nombre text;
  v_s public.shipments;
  v_asignacion text;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'VENTA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_sale.branch_id) then
    raise exception 'SIN_ACCESO_SEDE' using errcode = '42501';
  end if;
  if v_sale.status in ('cancelled', 'voided', 'void', 'refunded') then
    raise exception 'VENTA_ANULADA' using errcode = '22023';
  end if;

  select s.id into v_existente from public.shipments s where s.source_type = 'sale' and s.source_id = v_sale.id;
  if v_existente is not null then
    select * into v_s from public.shipments where id = v_existente;
    return jsonb_build_object('ok', true, 'ya_existia', true, 'shipment_id', v_s.id,
                              'shipment_number', v_s.shipment_number, 'cod_amount', v_s.cod_amount,
                              'shipping_fee', v_s.shipping_fee);
  end if;
  if nullif(btrim(coalesce(v_e ->> 'direccion', '')), '') is null then
    raise exception 'DIRECCION_REQUERIDA' using errcode = '22023';
  end if;

  -- Flete: la cotización del servidor manda cuando hay datos para ubicar la dirección.
  if coalesce(v_e ->> 'municipio_dane', v_e ->> 'barrio', v_e ->> 'codigo_postal', v_e ->> 'lat') is not null then
    v_cot := public.logistica_cotizar_envio(v_sale.organization_id, v_sale.branch_id, v_e, 'pos',
                                            coalesce(v_sale.subtotal, v_sale.total, 0), '{}'::jsonb);
    v_flete := nullif(v_cot ->> 'precio', '')::numeric;
    v_zona := nullif(v_cot -> 'zona' ->> 'id', '')::uuid;
    v_fuente := 'cotizacion';
  end if;
  if v_flete is null then
    begin
      v_flete := greatest(coalesce(nullif(v_e ->> 'costo_envio', '')::numeric, 0), 0);
    exception when others then
      v_flete := 0;
    end;
    v_fuente := 'pos_cliente';
  end if;

  v_cod := greatest(coalesce(v_sale.balance, 0), 0);

  select coalesce(nullif(btrim(v_e ->> 'contacto_nombre'), ''), c.full_name),
         coalesce(nullif(btrim(v_e ->> 'contacto_telefono'), ''), c.phone)
    into v_contacto, v_telefono
    from (select 1) x
    left join public.customers c on c.id = v_sale.customer_id;

  select o.name into v_org_nombre from public.organizations o where o.id = v_sale.organization_id;
  select count(*) into v_items from public.sale_items si where si.sale_id = v_sale.id;

  v_numero := 'POS-' || upper(right(replace(v_sale.id::text, '-', ''), 8));
  if exists (select 1 from public.shipments where organization_id = v_sale.organization_id and shipment_number = v_numero) then
    v_numero := v_numero || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  end if;

  insert into public.shipments (organization_id, branch_id, source_type, source_id, shipment_number, tracking_number,
                                customer_id, delivery_address, delivery_city, delivery_postal_code, delivery_latitude,
                                delivery_longitude, delivery_contact_name, delivery_contact_phone, delivery_instructions,
                                package_count, declared_value, shipping_fee, total_cost, currency, status, payment_status,
                                fulfillment_mode, cod_amount, cod_status, shipping_zone_id, notes, created_by, metadata)
  values (v_sale.organization_id, v_sale.branch_id, 'sale', v_sale.id, v_numero,
          'TRK' || upper(substr(md5(gen_random_uuid()::text), 1, 10)),
          v_sale.customer_id, btrim(v_e ->> 'direccion'), nullif(btrim(coalesce(v_e ->> 'ciudad', '')), ''),
          nullif(btrim(coalesce(v_e ->> 'codigo_postal', '')), ''),
          case when (v_e ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_e ->> 'lat')::numeric end,
          case when (v_e ->> 'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_e ->> 'lng')::numeric end,
          v_contacto, v_telefono, nullif(btrim(coalesce(v_e ->> 'instrucciones', '')), ''),
          greatest(v_items, 1), v_sale.total, v_flete, coalesce(v_sale.total, 0) + v_flete, null, 'pending',
          case when v_cod > 0 then 'cod' when v_sale.payment_status = 'paid' then 'paid' else 'pending' end,
          'own', v_cod, case when v_cod > 0 then 'pending' end, v_zona,
          'Venta POS ' || v_numero, auth.uid(),
          jsonb_build_object('pos_sale_id', v_sale.id, 'pos_total', v_sale.total, 'shipping_fee', v_flete,
                             'shipping_fee_source', v_fuente, 'shipping_rate_id', nullif(v_e ->> 'tarifa_id', ''),
                             'barrio', nullif(v_e ->> 'barrio', ''), 'municipio_dane', nullif(v_e ->> 'municipio_dane', ''),
                             'sender_name', v_org_nombre, 'items_count', v_items))
  returning id into v_id;

  insert into public.shipment_items (shipment_id, product_id, sale_item_id, description, sku, qty, unit_value, total_value)
  select v_id, si.product_id, si.id, coalesce(p.name, 'Producto'), p.sku, si.quantity, si.unit_price, si.total
    from public.sale_items si
    left join public.products p on p.id = si.product_id
   where si.sale_id = v_sale.id;

  select * into v_s from public.shipments where id = v_id;
  perform public.fn_logistica_registrar_evento(v_s, 'created', 'created', 'Envío creado desde la venta POS ' || v_numero,
                                               null, null, null, '{}'::jsonb);

  if p_driver_id is not null then
    if v_cod > 0 and exists (select 1 from public.driver_credentials dc
                              where dc.id = p_driver_id and dc.organization_id = v_sale.organization_id
                                and coalesce(dc.metadata ->> 'cobra_contraentrega', 'true') = 'false') then
      v_asignacion := 'DOMICILIARIO_NO_COBRA';
    else
      perform public.logistica_asignar_domiciliario(v_id, p_driver_id, null, null);
      v_asignacion := 'asignado';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'ya_existia', false, 'shipment_id', v_id, 'shipment_number', v_numero,
                            'cod_amount', v_cod, 'shipping_fee', v_flete, 'shipping_fee_source', v_fuente,
                            'cotizacion', v_cot, 'asignacion', v_asignacion);
end;
$function$;

-- ── Transporte: cumplimiento con su revisión propia (versión de 20261123234500) ─
CREATE OR REPLACE FUNCTION public.fn_transporte_cumplimiento_interno(p_trip uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t public.trips;
  v public.vehicles;
  d public.driver_credentials;
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_doc record;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null then
    return null;
  end if;

  if t.vehicle_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_vehiculo', 'grupo', 'asignacion', 'excepcion', false);
  else
    select * into v from public.vehicles where id = t.vehicle_id and organization_id = t.organization_id;
    for v_doc in
      select * from (values ('soat', v.soat_expiry), ('tecnomecanica', v.techno_expiry), ('poliza', v.insurance_expiry), ('tarjeta_operacion', v.operating_card_expiry)) x(causa, vence)
      union all
      select vd.doc_type, vd.expires_on from public.vehicle_documents vd
       where vd.vehicle_id = t.vehicle_id and vd.is_active and vd.blocks_dispatch
         and vd.doc_type in ('matricula', 'navegabilidad', 'otro') and vd.expires_on is not null
    loop
      if v_doc.vence is not null and v_doc.vence < t.trip_date then
        v_bloqueos := v_bloqueos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence,
          'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosVehiculo'));
      elsif v_doc.vence is not null and v_doc.vence <= t.trip_date + 30 then
        v_avisos := v_avisos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence, 'dias', v_doc.vence - t.trip_date);
      end if;
    end loop;
  end if;

  if t.driver_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_conductor', 'grupo', 'asignacion', 'excepcion', false);
  else
    select * into d from public.driver_credentials
     where user_id = t.driver_id and organization_id = t.organization_id and coalesce(is_active, true)
     order by updated_at desc nulls last
     limit 1;
    if d.id is null then
      v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_credencial', 'grupo', 'conductor',
        'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosConductor'));
    else
      for v_doc in
        select * from (values ('licencia', d.license_expiry), ('examen_medico', d.medical_certificate_expiry)) x(causa, vence)
        union all
        select vd.doc_type, vd.expires_on from public.vehicle_documents vd
         where vd.driver_credential_id = d.id and vd.is_active and vd.blocks_dispatch
           and vd.doc_type = 'otro' and vd.expires_on is not null
      loop
        if v_doc.vence is not null and v_doc.vence < t.trip_date then
          v_bloqueos := v_bloqueos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence,
            'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosConductor'));
        elsif v_doc.vence is not null and v_doc.vence <= t.trip_date + 30 then
          v_avisos := v_avisos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence, 'dias', v_doc.vence - t.trip_date);
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'trip_id', t.id,
    'fecha', t.trip_date,
    'bloqueos', v_bloqueos,
    'avisos', v_avisos,
    'admite_excepcion', jsonb_array_length(v_bloqueos) > 0
      and not exists (select 1 from jsonb_array_elements(v_bloqueos) b where (b ->> 'excepcion')::boolean is not true),
    'pide_pin', public.fn_transporte_ajuste_excepcion(t.organization_id, 'pedirPin')
  );
end;
$function$;

drop function if exists public.fn_flota_revisar_documentos(integer, uuid, uuid, date, text[], boolean, text[], integer);

-- ── Cargos de Transporte sin el permiso nuevo ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_transporte_crear_cargos(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dept uuid;
  v_despachador uuid;
  v_supervisor uuid;
begin
  if p_org is null then
    return;
  end if;

  select d.id into v_dept
    from public.departments d
   where d.organization_id = p_org and d.code = 'OPE'
   order by d.created_at
   limit 1;

  insert into public.job_positions (organization_id, department_id, code, name, description, level, is_active)
  values
    (p_org, v_dept, 'TRA-DESPACHO', 'Despachador de transporte', 'Da salida a los viajes del día e imprime la planilla de despacho', 'junior', true),
    (p_org, v_dept, 'TRA-SUPERVISOR', 'Supervisor de despacho', 'Programa la operación y autoriza excepciones de despacho con su PIN', 'mid', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'TRA-DESPACHO';
  select id into v_supervisor from public.job_positions where organization_id = p_org and code = 'TRA-SUPERVISOR';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('transporte.view', 'transporte.despachar', 'transporte.vender')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_supervisor, p.id, true from public.permissions p
   where v_supervisor is not null and p.code in ('transporte.view', 'transporte.manage', 'transporte.despachar', 'transporte.despacho.excepcion', 'transporte.vender')
  on conflict (job_position_id, permission_id) do nothing;
end;
$function$;

delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code = 'logistica.asignacion.excepcion');
delete from public.permissions where code = 'logistica.asignacion.excepcion';

-- ── Bitácora ────────────────────────────────────────────────────────────────
drop table if exists public.shipment_assignment_log;

-- ── driver_credentials ──────────────────────────────────────────────────────
drop trigger if exists trg_flota_espejo_conductor on public.driver_credentials;
drop trigger if exists trg_flota_guardar_defecto on public.driver_credentials;
drop function if exists public.fn_flota_espejo_conductor();
drop function if exists public.fn_flota_guardar_defecto();
drop index if exists public.uq_driver_credentials_default_vehicle;
alter table public.driver_credentials drop constraint if exists driver_credentials_usage_check;
alter table public.driver_credentials drop column if exists usage;
alter table public.driver_credentials drop column if exists default_vehicle_id;

-- ── vehicles ────────────────────────────────────────────────────────────────
drop trigger if exists trg_flota_guardar_vehiculo on public.vehicles;
drop function if exists public.fn_flota_guardar_vehiculo();
drop index if exists public.idx_vehicles_owner_driver;
drop index if exists public.idx_vehicles_org_usage;
alter table public.vehicles drop constraint if exists vehicles_placa_check;
alter table public.vehicles alter column plate set not null;
alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
alter table public.vehicles add constraint vehicles_vehicle_type_check check (vehicle_type = any (array[
  'motorcycle', 'car', 'van', 'truck', 'bus', 'minibus', 'trailer', 'other', 'boat', 'yacht']));
alter table public.vehicles drop constraint if exists vehicles_usage_check;
alter table public.vehicles drop constraint if exists vehicles_ownership_check;
alter table public.vehicles drop column if exists usage;
alter table public.vehicles drop column if exists owner_driver_id;
alter table public.vehicles drop column if exists ownership;
comment on column public.vehicles.current_driver_id is null;
