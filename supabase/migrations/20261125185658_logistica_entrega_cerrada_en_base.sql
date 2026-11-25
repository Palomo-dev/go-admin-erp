-- Logística: la entrega se cierra en la base (decisiones del dueño, 2026-11-25).
--
-- 1. «Solo deben poder entregar el domiciliario asignado a ese envío o alguien con un permiso de
--    oficina». Hasta hoy `logistica_marcar_entregado` dejaba entregar a CUALQUIER miembro que no
--    fuera domiciliario (fn_logistica_envio_bloquear solo frena a los domiciliarios con envíos
--    ajenos), y la política RLS `shipments_update` permitía poner status = 'delivered' con un UPDATE
--    directo, sin prueba, sin código y sin cuadre.
-- 2. «"Cobrar y entregar" debe abrir el mismo registro de entrega de Logística»: una sola RPC
--    transaccional que registra la entrega (misma regla, misma prueba, mismo código) y cobra el
--    pedido en la caja de la sesión con `fn_cobrar_pedido_web_en_caja` (factura + pago por la vía
--    normal). Si algo falla, no queda nada a medias.
--
-- Piezas:
--   a. Permiso nuevo `logistica.entregar_oficina` («Registrar entregas en oficina») para los que hoy
--      entregan desde la oficina: roles de sistema Super Admin (1), Admin de organización (2) y
--      Manager (5), y el cargo «Despachador» (LOG-DESPACHO) de cada organización (también los que
--      cree `fn_logistica_crear_cargos`). El rol «Empleado» (4) NO: los puestos dan permisos por cargo.
--   b. `fn_logistica_via_entrega(shipment)`: 'domiciliario' (auth.uid() es el usuario del
--      domiciliario asignado), 'oficina' (permiso por fn_caja_puede: cargo/rol, super admin, roles 1
--      y 2) o 'sistema' (sin usuario y sin rol anon/authenticated: service_role, crons, webhooks).
--      Si no, SIN_PERMISO_ENTREGA (42501).
--   c. `logistica_marcar_entregado`: misma firma; exige la vía ANTES de contar intentos del código,
--      guarda la vía y quién en `shipments.metadata.entrega` y en el evento `delivered`.
--   d. `logistica_entregar_y_cobrar_en_caja`: entrega + cobro en caja + factura en una transacción.
--      La contraentrega cobrada en caja queda `remitted` (no entra al cuadre del domiciliario).
--   e. Guardas (triggers BEFORE) para anon/authenticated sin pasar por el registro:
--      - shipments: status a/desde 'delivered', delivered_at, cod_collected_*, cod_status a
--        collected/remitted y cod_amount ya cobrado.
--      - proof_of_delivery: insertar, cambiar o borrar.
--      - web_orders: 'delivered' con un envío activo (el pedido no se adelanta al envío).
--      El registro marca la transacción con `app.logistica_registro_entrega`; service_role y postgres
--      no se frenan (procesos internos legítimos).
--   f. `logistica_cuadre_recibir_linea` marca la transacción antes de pasar la línea a `remitted`
--      (mismo cuerpo; solo se envuelve ese UPDATE).

-- ── a. Permiso ──────────────────────────────────────────────────────────────

insert into public.permissions (code, name, description, module, category)
values ('logistica.entregar_oficina', 'Registrar entregas en oficina',
        'Registra la entrega de un envío sin ser el domiciliario asignado: recogida en mostrador, taquilla o «Cobrar y entregar» en la caja',
        'logistica', 'logistica')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.id, p.id, true
  from public.roles r
  join public.permissions p on p.code = 'logistica.entregar_oficina'
 where r.id in (1, 2, 5)
   and not exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);

insert into public.job_position_permissions (job_position_id, permission_id, allowed)
select jp.id, p.id, true
  from public.job_positions jp
  join public.permissions p on p.code = 'logistica.entregar_oficina'
 where jp.code = 'LOG-DESPACHO'
on conflict (job_position_id, permission_id) do nothing;

create or replace function public.fn_logistica_crear_cargos(p_org integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_despachador uuid;
  v_domiciliario uuid;
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
    (p_org, v_dept, 'LOG-DESPACHO', 'Despachador', 'Prepara y despacha envíos, asigna domiciliarios y recibe cuadres', 'junior', true),
    (p_org, v_dept, 'LOG-DOMICILIO', 'Domiciliario', 'Entrega pedidos a domicilio y cobra contraentregas', 'junior', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'LOG-DESPACHO';
  select id into v_domiciliario from public.job_positions where organization_id = p_org and code = 'LOG-DOMICILIO';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('logistica.view', 'logistica.manage', 'logistica.entregar_oficina')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_domiciliario, p.id, true from public.permissions p
   where v_domiciliario is not null and p.code = 'logistica.deliver'
  on conflict (job_position_id, permission_id) do nothing;

  if v_domiciliario is not null
     and not exists (select 1 from public.job_position_module_access where job_position_id = v_domiciliario)
     and not exists (select 1 from public.job_position_page_access where job_position_id = v_domiciliario) then
    insert into public.job_position_module_access (job_position_id, module_code, can_view, can_access)
    values (v_domiciliario, 'logistica', true, true);
    insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
    values (v_domiciliario, 'logistica', '/app/logistica/mis-envios', true, true);
  end if;
end;
$$;

-- ── b. Quién puede entregar este envío ──────────────────────────────────────

create or replace function public.fn_logistica_via_entrega(p_s public.shipments)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'SIN_PERMISO_ENTREGA' using errcode = '42501';
    end if;
    return 'sistema';
  end if;
  if p_s.driver_id is not null and exists (
       select 1 from public.driver_credentials dc
        where dc.id = p_s.driver_id and dc.user_id = v_uid and dc.organization_id = p_s.organization_id) then
    return 'domiciliario';
  end if;
  if public.fn_caja_puede(p_s.organization_id, 'logistica.entregar_oficina') then
    return 'oficina';
  end if;
  raise exception 'SIN_PERMISO_ENTREGA' using errcode = '42501',
    hint = 'Solo entrega el domiciliario asignado o quien tenga «Registrar entregas en oficina» (logistica.entregar_oficina).';
end;
$$;

revoke all on function public.fn_logistica_via_entrega(public.shipments) from public, anon, authenticated;
grant execute on function public.fn_logistica_via_entrega(public.shipments) to service_role;

-- ── c. Registro de entrega ──────────────────────────────────────────────────

create or replace function public.logistica_marcar_entregado(p_shipment_id uuid, p_prueba jsonb, p_codigo text default null::text, p_cobro jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_via text;
  c_max_intentos constant integer := 5;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  -- Quién entrega (decisión del dueño 2026-11-25): antes de todo, también antes de contar intentos.
  v_via := public.fn_logistica_via_entrega(v_s);
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

  -- Desde aquí escribe el registro: las guardas de shipments / proof_of_delivery / web_orders lo dejan pasar.
  perform set_config('app.logistica_registro_entrega', 'on', true);

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
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('entrega', jsonb_build_object('via', v_via, 'por', auth.uid(), 'at', v_ahora)),
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
  perform set_config('app.logistica_registro_entrega', '', true);
  perform public.fn_logistica_liberar_vehiculo(v_s.vehicle_id, v_s.id);

  perform public.fn_logistica_registrar_evento(v_s, 'delivered', 'delivered',
    'Entregado a ' || btrim(v_prueba ->> 'nombre')
      || case v_via when 'oficina' then ' (registrado en oficina)' when 'sistema' then ' (proceso interno)' else '' end,
    null, v_lat, v_lng,
    jsonb_build_object('proof_id', v_prueba_id, 'cod_monto', v_monto, 'cod_metodo', v_metodo,
                       'via', v_via, 'entrego', auth.uid()));

  return jsonb_build_object('ok', true, 'shipment_id', v_s.id, 'status', v_s.status, 'proof_id', v_prueba_id,
                            'cod_status', v_s.cod_status, 'cod_esperado', v_s.cod_amount,
                            'cod_recibido', v_monto, 'aviso', 'entregado', 'via', v_via);
end;
$function$;

-- ── d. «Cobrar y entregar» en la caja con envío activo ──────────────────────

create or replace function public.logistica_entregar_y_cobrar_en_caja(
  p_shipment_id uuid,
  p_prueba jsonb,
  p_codigo text default null,
  p_metodo text default null,
  p_referencia text default null,
  p_factura jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.shipments;
  v_wo public.web_orders;
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_cobra boolean;
  v_r jsonb;
  v_cobro jsonb;
  v_monto numeric;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  if v_s.source_type is distinct from 'web_order' or v_s.source_id is null then
    raise exception 'ORIGEN_NO_SOPORTADO' using errcode = '22023';
  end if;
  select * into v_wo from public.web_orders
   where id = v_s.source_id and organization_id = v_s.organization_id
   for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_cobra := v_wo.payment_status is distinct from 'paid';
  if (v_cobra or coalesce(v_s.cod_amount, 0) > 0) and v_metodo not in ('cash', 'card', 'transfer', 'qr') then
    raise exception 'METODO_INVALIDO' using errcode = '22023';
  end if;

  -- 1. El MISMO registro de Logística: vía (domiciliario u oficina), receptor, código y contraentrega.
  v_r := public.logistica_marcar_entregado(
    p_shipment_id, p_prueba, p_codigo,
    case when coalesce(v_s.cod_amount, 0) > 0 then jsonb_build_object('metodo', v_metodo, 'monto', v_s.cod_amount) end);
  if coalesce((v_r ->> 'ok')::boolean, false) is not true then
    -- Código errado: el intento quedó contado y no se cobra nada.
    return v_r;
  end if;

  -- 2. Cobro por la vía normal de la caja (factura + pago a la caja abierta de quien cobra).
  if v_cobra then
    v_cobro := public.fn_cobrar_pedido_web_en_caja(v_wo.id, v_metodo, p_factura, p_referencia, null);
    select p.amount into v_monto from public.payments p where p.id = nullif(v_cobro ->> 'payment_id', '')::uuid;

    -- 3. La contraentrega ya está en la caja: no entra al cuadre del domiciliario.
    perform set_config('app.logistica_registro_entrega', 'on', true);
    update public.shipments set
      cod_status = case when coalesce(cod_amount, 0) > 0 then 'remitted' else cod_status end,
      cod_remitted_at = case when coalesce(cod_amount, 0) > 0 then now() else cod_remitted_at end,
      cod_collected_amount = case when coalesce(cod_amount, 0) > 0 then coalesce(v_monto, cod_collected_amount)
                                  else cod_collected_amount end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cobro_en_caja', jsonb_strip_nulls(jsonb_build_object(
        'cash_session_id', v_cobro -> 'cash_session_id', 'payment_id', v_cobro -> 'payment_id',
        'invoice_id', v_cobro -> 'invoice_id', 'invoice_number', v_cobro -> 'invoice_number',
        'ya_cobrado', v_cobro -> 'ya_cobrado', 'metodo', v_metodo, 'monto', v_monto,
        'por', auth.uid(), 'at', now()))),
      updated_at = now()
     where id = v_s.id
    returning * into v_s;
    perform set_config('app.logistica_registro_entrega', '', true);

    perform public.fn_logistica_registrar_evento(v_s, 'cod_cobrado_en_caja', null,
      'Cobrado en la caja ' || coalesce(v_cobro ->> 'cash_session_id', '') ||
        coalesce(' · factura ' || (v_cobro ->> 'invoice_number'), ''),
      null, null, null,
      jsonb_build_object('via', v_r ->> 'via', 'cobro', v_cobro, 'metodo', v_metodo, 'monto', v_monto));
  end if;

  return v_r || jsonb_build_object('cobrado_en_caja', v_cobra, 'cobro', v_cobro)
             || case when v_cobra then jsonb_build_object('cod_status', v_s.cod_status) else '{}'::jsonb end;
end;
$$;

revoke all on function public.logistica_entregar_y_cobrar_en_caja(uuid, jsonb, text, text, text, jsonb) from public, anon;
grant execute on function public.logistica_entregar_y_cobrar_en_caja(uuid, jsonb, text, text, text, jsonb) to authenticated, service_role;

-- ── e. Guardas: la vía directa queda cerrada ────────────────────────────────

create or replace function public.fn_shipments_guarda_entrega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('app.logistica_registro_entrega', true), '') = 'on' then
    return new;
  end if;
  if (new.status = 'delivered' and old.status is distinct from 'delivered')
     or (old.status = 'delivered' and new.status is distinct from 'delivered')
     or new.delivered_at is distinct from old.delivered_at
     or new.cod_collected_amount is distinct from old.cod_collected_amount
     or new.cod_collected_method is distinct from old.cod_collected_method
     or new.cod_collected_at is distinct from old.cod_collected_at
     or (new.cod_status is distinct from old.cod_status and new.cod_status in ('collected', 'remitted'))
     or (old.cod_status in ('collected', 'remitted') and new.cod_status is distinct from old.cod_status)
     or (old.cod_status in ('collected', 'remitted') and new.cod_amount is distinct from old.cod_amount) then
    raise exception 'ENTREGA_SOLO_POR_REGISTRO' using errcode = '42501',
      hint = 'La entrega y el cobro de un envío se registran con logistica_marcar_entregado.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_shipments_guarda_entrega() from public, anon, authenticated;

drop trigger if exists trg_shipments_guarda_entrega on public.shipments;
create trigger trg_shipments_guarda_entrega
  before update on public.shipments
  for each row execute function public.fn_shipments_guarda_entrega();

create or replace function public.fn_proof_of_delivery_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_setting('app.logistica_registro_entrega', true), '') <> 'on' then
    raise exception 'ENTREGA_SOLO_POR_REGISTRO' using errcode = '42501',
      hint = 'La prueba de entrega la escribe logistica_marcar_entregado.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_proof_of_delivery_guarda() from public, anon, authenticated;

drop trigger if exists trg_proof_of_delivery_guarda on public.proof_of_delivery;
create trigger trg_proof_of_delivery_guarda
  before insert or update or delete on public.proof_of_delivery
  for each row execute function public.fn_proof_of_delivery_guarda();

create or replace function public.fn_web_orders_entrega_con_envio_activo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'delivered' or old.status = 'delivered' then
    return new;
  end if;
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('app.logistica_registro_entrega', true), '') = 'on'
     or coalesce(current_setting('app.sincronizando_envio_pedido', true), '') = 'on' then
    return new;
  end if;
  if exists (select 1 from public.shipments s
              where s.organization_id = new.organization_id
                and s.source_type = 'web_order' and s.source_id = new.id
                and s.status not in ('delivered', 'returned', 'cancelled')) then
    raise exception 'PEDIDO_CON_ENVIO_ACTIVO' using errcode = '22023',
      hint = 'El pedido tiene un envío activo: se entrega con el registro de entrega de Logística.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_web_orders_entrega_con_envio_activo() from public, anon, authenticated;

drop trigger if exists trg_web_orders_entrega_con_envio_activo on public.web_orders;
create trigger trg_web_orders_entrega_con_envio_activo
  before update of status on public.web_orders
  for each row execute function public.fn_web_orders_entrega_con_envio_activo();

-- ── f. El cuadre del domiciliario marca su UPDATE a 'remitted' ──────────────

do $$
declare
  v_def text;
  c_viejo constant text := E'  update public.shipments set cod_status = ''remitted'', cod_remitted_at = now(), updated_at = now()\n   where id = v_l.shipment_id;';
  c_nuevo constant text := E'  perform set_config(''app.logistica_registro_entrega'', ''on'', true);\n'
                        || E'  update public.shipments set cod_status = ''remitted'', cod_remitted_at = now(), updated_at = now()\n   where id = v_l.shipment_id;\n'
                        || E'  perform set_config(''app.logistica_registro_entrega'', '''', true);';
begin
  v_def := pg_get_functiondef('public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text)'::regprocedure);
  if position('app.logistica_registro_entrega' in v_def) > 0 then
    return;
  end if;
  if position(c_viejo in v_def) = 0 then
    raise exception 'logistica_cuadre_recibir_linea cambió: no se encontró el UPDATE a remitted';
  end if;
  execute replace(v_def, c_viejo, c_nuevo);
end;
$$;
