-- Logística Fase 1 — 5/5: envío desde la venta POS, rastreo público y aviso «novedad».
--
-- 1. web_order_notices.moment suma 'novedad' (en_camino y entregado ya estaban en el CHECK). Y los
--    eventos 'created' sin canonical_status (escritos por el servicio TS) pasan a 'created'.
-- 2. logistica_crear_envio_venta_pos(venta, entrega, domiciliario?): el POS crea el envío con
--    domicilio en UNA transacción. Lee la venta del servidor (organización, sede, cliente, total,
--    saldo, líneas): la contraentrega es el SALDO de la venta (lo que falta cobrar), nunca un monto
--    del navegador. Si la entrega trae municipio DANE, barrio, código postal o coordenadas, el flete
--    sale de logistica_cotizar_envio (canal pos); si no, se guarda el que mandó el POS y se marca
--    metadata.shipping_fee_source = 'pos_cliente'. Idempotente: idx_shipments_sale_unique (1/5).
--    No toca la venta ni sus pagos (posService / pos_checkout_v1 siguen siendo los dueños).
-- 3. logistica_rastreo_publico(org, pedido web): datos del rastreo para la tienda, SOLO service
--    role (la tienda valida antes el token HMAC de goadmin-websites lib/orders/tokenSeguimiento.ts).
--    Devuelve estado, línea de tiempo canónica (sin actores ni notas internas), fecha estimada,
--    nombre de pila del domiciliario y, en contraentrega en curso, el código de entrega para que el
--    cliente se lo diga al domiciliario.

-- ── 1. Aviso «novedad» ─────────────────────────────────────────────────────────────────────────
alter table public.web_order_notices drop constraint if exists web_order_notices_moment_check;
alter table public.web_order_notices add constraint web_order_notices_moment_check
  check (moment = any (array['recibido', 'confirmado', 'listo', 'en_camino', 'entregado', 'novedad', 'rechazado']));

-- Línea de tiempo canónica: los eventos 'created' que escribía el servicio en TS no llevaban
-- canonical_status (1.411 filas). Se completa para que el rastreo público y los reportes los vean.
update public.transport_events set canonical_status = 'created'
 where reference_type = 'shipment' and event_type = 'created' and canonical_status is null;

-- ── 2. Envío desde venta POS ───────────────────────────────────────────────────────────────────
create or replace function public.logistica_crear_envio_venta_pos(
  p_sale_id uuid,
  p_entrega jsonb,
  p_driver_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    perform public.logistica_asignar_domiciliario(v_id, p_driver_id, null, null);
  end if;

  return jsonb_build_object('ok', true, 'ya_existia', false, 'shipment_id', v_id, 'shipment_number', v_numero,
                            'cod_amount', v_cod, 'shipping_fee', v_flete, 'shipping_fee_source', v_fuente,
                            'cotizacion', v_cot);
end;
$$;
revoke execute on function public.logistica_crear_envio_venta_pos(uuid, jsonb, uuid) from public, anon;
grant execute on function public.logistica_crear_envio_venta_pos(uuid, jsonb, uuid) to authenticated, service_role;

-- ── 3. Rastreo público (solo service role) ─────────────────────────────────────────────────────
create or replace function public.logistica_rastreo_publico(p_organization_id integer, p_web_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s public.shipments;
  v_nombre text;
  v_codigo text;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'SOLO_SERVIDOR' using errcode = '42501';
  end if;
  select * into v_s from public.shipments s
   where s.organization_id = p_organization_id and s.source_type = 'web_order' and s.source_id = p_web_order_id
   order by s.created_at desc limit 1;
  if not found then
    return null;
  end if;

  select coalesce(split_part(nullif(btrim(dc.full_name), ''), ' ', 1), p.first_name::text)
    into v_nombre
    from public.driver_credentials dc
    left join public.profiles p on p.id = dc.user_id
   where dc.id = v_s.driver_id;

  if v_s.delivery_code_required and v_s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit',
                                                   'out_for_delivery', 'failed_attempt') then
    select c.code into v_codigo from public.shipment_delivery_codes c
     where c.shipment_id = v_s.id and c.verified_at is null;
  end if;

  return jsonb_build_object(
    'estado', v_s.status,
    'modo', v_s.fulfillment_mode,
    'numero_guia', v_s.tracking_number,
    'fecha_estimada', v_s.expected_delivery_date,
    'asignado_en', v_s.assigned_at,
    'entregado_en', v_s.delivered_at,
    'domiciliario', v_nombre,
    'intentos_fallidos', v_s.failed_attempts,
    'motivo_novedad', case when v_s.status = 'failed_attempt' then v_s.exception_reason end,
    'contraentrega', case when coalesce(v_s.cod_amount, 0) > 0 then jsonb_build_object(
                       'monto', v_s.cod_amount, 'moneda', v_s.currency, 'estado', v_s.cod_status,
                       'codigo_entrega', v_codigo) end,
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                           'estado', e.canonical_status, 'fecha', e.event_time, 'motivo', e.reason_code)
                           order by e.event_time, e.created_at)
                           from public.transport_events e
                          where e.reference_type = 'shipment' and e.reference_id = v_s.id
                            and e.organization_id = v_s.organization_id
                            and e.canonical_status is not null), '[]'::jsonb));
end;
$$;
revoke execute on function public.logistica_rastreo_publico(integer, uuid) from public, anon, authenticated;
grant execute on function public.logistica_rastreo_publico(integer, uuid) to service_role;
