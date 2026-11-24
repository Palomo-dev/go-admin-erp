-- Logística Fase 1 (endurecimiento): quién escribe domiciliarios y qué envíos ve un domiciliario.
--
-- Antes: `driver_credentials_miembros` (FOR ALL) dejaba a cualquier miembro activo crear, editar o
-- borrar domiciliarios, y `shipments_org_access` dejaba a un domiciliario leer (y escribir) los
-- envíos de todos. Ahora:
--
-- 1. Permiso de logística = `fn_caja_puede(org, 'pos.create')`: el mismo de cuadres y del alta de
--    domiciliarios (`src/lib/logistica/permisosDomiciliarios.server.ts`). Incluye administradores,
--    super admin y `admin.full_access`. Aún no hay códigos `logistica.*` en `permissions`
--    (FASE1-CIMIENTOS, TODO 8): si se crean, se cambia SOLO `fn_logistica_gestiona`.
-- 2. «Ve todo» en una organización = miembro activo que NO es domiciliario allí, o que lo es pero
--    tiene el permiso. Un domiciliario sin permiso solo ve sus envíos (`shipments.driver_id`), los
--    eventos, intentos, pruebas y renglones de esos envíos, y sus propios cuadres.
-- 3. Escribir `driver_credentials`: solo con el permiso. El fin de jornada del propio domiciliario
--    pasa por `logistica_fin_jornada` (antes era un UPDATE directo).
-- 4. RPC: `fn_logistica_envio_bloquear` (la usan asignar, cambiar estado, entregar, novedad y el
--    código) rechaza a un domiciliario sin permiso sobre un envío que no es suyo (ENVIO_AJENO);
--    asignar exige «ve todo» y respeta «¿Cobra contraentrega?» (DOMICILIARIO_NO_COBRA). La venta
--    POS con domiciliario que no cobra crea el envío sin asignar en vez de fallar.
--
-- Las funciones de ayuda son SECURITY DEFINER para que la política de `driver_credentials` no se
-- consulte a sí misma (recursión infinita).

-- ── Ayudas ──────────────────────────────────────────────────────────────────

create or replace function public.fn_logistica_gestiona(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_caja_puede(p_org, 'pos.create');
$$;

create or replace function public.fn_logistica_ve_todo(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (not exists (select 1 from public.driver_credentials dc
                       where dc.organization_id = p_org and dc.user_id = auth.uid())
          or public.fn_logistica_gestiona(p_org));
$$;

revoke execute on function public.fn_logistica_gestiona(integer) from public, anon;
revoke execute on function public.fn_logistica_ve_todo(integer) from public, anon;
grant execute on function public.fn_logistica_gestiona(integer) to authenticated, service_role;
grant execute on function public.fn_logistica_ve_todo(integer) to authenticated, service_role;

comment on function public.fn_logistica_gestiona(integer) is
  'Logística: permiso para gestionar domiciliarios, asignar y ver todos los envíos (hoy = fn_caja_puede pos.create).';
comment on function public.fn_logistica_ve_todo(integer) is
  'Logística: la sesión ve todos los envíos de la organización (no es domiciliario allí o tiene fn_logistica_gestiona).';

-- ── driver_credentials ──────────────────────────────────────────────────────

drop policy if exists driver_credentials_miembros on public.driver_credentials;
drop policy if exists driver_credentials_select on public.driver_credentials;
drop policy if exists driver_credentials_insert on public.driver_credentials;
drop policy if exists driver_credentials_update on public.driver_credentials;
drop policy if exists driver_credentials_delete on public.driver_credentials;

create policy driver_credentials_select on public.driver_credentials for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
    or (user_id = (select auth.uid())
        and organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active))
  );

create policy driver_credentials_insert on public.driver_credentials for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_gestiona(om.organization_id))
  );

create policy driver_credentials_update on public.driver_credentials for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_gestiona(om.organization_id))
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_gestiona(om.organization_id))
  );

create policy driver_credentials_delete on public.driver_credentials for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_gestiona(om.organization_id))
  );

-- ── shipments ───────────────────────────────────────────────────────────────

drop policy if exists shipments_org_access on public.shipments;
drop policy if exists shipments_select on public.shipments;
drop policy if exists shipments_insert on public.shipments;
drop policy if exists shipments_update on public.shipments;
drop policy if exists shipments_delete on public.shipments;

create policy shipments_select on public.shipments for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
    or driver_id in (
      select dc.id from public.driver_credentials dc
        join public.organization_members om on om.organization_id = dc.organization_id and om.user_id = dc.user_id
       where om.user_id = (select auth.uid()) and om.is_active)
  );

-- Escribir directo: solo quien ve todo. El domiciliario escribe por las RPC logistica_*.
create policy shipments_insert on public.shipments for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
  );

create policy shipments_update on public.shipments for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
  );

create policy shipments_delete on public.shipments for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
  );

-- proof_of_delivery, delivery_attempts y shipment_items ya filtran con `shipment_id IN (SELECT …
-- FROM shipments …)`: heredan esta restricción (la RLS de shipments aplica dentro de la subconsulta).

-- ── transport_events (lectura) ──────────────────────────────────────────────
-- Los eventos de envío llevan notas y coordenadas: el domiciliario ve solo los de sus envíos. Los
-- demás eventos (viajes, rutas) siguen como estaban para los miembros activos.

drop policy if exists transport_events_select_org on public.transport_events;
create policy transport_events_select_org on public.transport_events for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
    or (reference_type = 'shipment' and reference_id in (select s.id from public.shipments s))
    or (reference_type is distinct from 'shipment'
        and organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active))
  );

-- ── Cuadres (lectura) ───────────────────────────────────────────────────────

drop policy if exists courier_settlements_select on public.courier_settlements;
create policy courier_settlements_select on public.courier_settlements for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
    or driver_id in (
      select dc.id from public.driver_credentials dc
        join public.organization_members om on om.organization_id = dc.organization_id and om.user_id = dc.user_id
       where om.user_id = (select auth.uid()) and om.is_active)
  );

drop policy if exists courier_settlement_lines_select on public.courier_settlement_lines;
create policy courier_settlement_lines_select on public.courier_settlement_lines for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
         and public.fn_logistica_ve_todo(om.organization_id))
    or settlement_id in (select cs.id from public.courier_settlements cs)
  );

-- ── RPC: guarda del domiciliario ────────────────────────────────────────────

create or replace function public.fn_logistica_envio_bloquear(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- Domiciliario sin permiso de logística: solo sus envíos.
  if auth.uid() is not null and not public.fn_logistica_ve_todo(v_s.organization_id)
     and not exists (select 1 from public.driver_credentials dc
                      where dc.id = v_s.driver_id and dc.user_id = auth.uid()
                        and dc.organization_id = v_s.organization_id) then
    raise exception 'ENVIO_AJENO' using errcode = '42501';
  end if;
  return v_s;
end;
$function$;

create or replace function public.logistica_asignar_domiciliario(p_shipment_id uuid, p_driver_id uuid, p_vehicle_id uuid default null::uuid, p_fecha_estimada date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

-- Venta POS con domiciliario: si no cobra contraentrega y la venta tiene saldo, el envío se crea
-- SIN asignar (queda en «Por despachar») y la respuesta lo dice en `asignacion`; no se pierde el
-- envío de una venta ya hecha. Cualquier otro error de la asignación sigue abortando.
create or replace function public.logistica_crear_envio_venta_pos(p_sale_id uuid, p_entrega jsonb, p_driver_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

-- ── Fin de jornada del domiciliario de la sesión ────────────────────────────

create or replace function public.logistica_fin_jornada(p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_ahora timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'SOLO_SESION' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  update public.driver_credentials
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('fin_jornada_at', v_ahora),
         updated_at = v_ahora
   where organization_id = p_organization_id and user_id = auth.uid() and coalesce(is_active, true)
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  return jsonb_build_object('driver_id', v_id, 'fin_jornada_at', v_ahora);
end;
$function$;

revoke execute on function public.logistica_fin_jornada(integer) from public, anon;
grant execute on function public.logistica_fin_jornada(integer) to authenticated, service_role;

-- CREATE OR REPLACE conserva el ACL; se repite por si alguna se creara de cero.
revoke execute on function public.fn_logistica_envio_bloquear(uuid) from public, anon, authenticated;
revoke execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) from public, anon;
revoke execute on function public.logistica_crear_envio_venta_pos(uuid, jsonb, uuid) from public, anon;
grant execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date) to authenticated, service_role;
grant execute on function public.logistica_crear_envio_venta_pos(uuid, jsonb, uuid) to authenticated, service_role;
