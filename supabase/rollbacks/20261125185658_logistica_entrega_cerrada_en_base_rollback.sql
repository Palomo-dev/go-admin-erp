-- Reversión de 20261125185658_logistica_entrega_cerrada_en_base.sql.
--
-- Deja la base como antes: cualquier miembro que no sea domiciliario vuelve a poder entregar y la
-- vía directa (UPDATE a shipments / web_orders, INSERT en proof_of_delivery) se vuelve a abrir.
-- Datos: borra el permiso `logistica.entregar_oficina` con sus asignaciones a roles y cargos (si el
-- dueño lo dio a otros cargos desde el editor, también se pierde). `shipments.metadata.entrega` y
-- `metadata.cobro_en_caja` y los eventos `cod_cobrado_en_caja` ya escritos se quedan (son historia).

-- f. Cuadre del domiciliario sin la marca.
do $$
declare
  v_def text;
  c_nuevo constant text := E'  perform set_config(''app.logistica_registro_entrega'', ''on'', true);\n'
                        || E'  update public.shipments set cod_status = ''remitted'', cod_remitted_at = now(), updated_at = now()\n   where id = v_l.shipment_id;\n'
                        || E'  perform set_config(''app.logistica_registro_entrega'', '''', true);';
  c_viejo constant text := E'  update public.shipments set cod_status = ''remitted'', cod_remitted_at = now(), updated_at = now()\n   where id = v_l.shipment_id;';
begin
  v_def := pg_get_functiondef('public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text)'::regprocedure);
  if position(c_nuevo in v_def) > 0 then
    execute replace(v_def, c_nuevo, c_viejo);
  end if;
end;
$$;

-- e. Guardas.
drop trigger if exists trg_web_orders_entrega_con_envio_activo on public.web_orders;
drop function if exists public.fn_web_orders_entrega_con_envio_activo();
drop trigger if exists trg_proof_of_delivery_guarda on public.proof_of_delivery;
drop function if exists public.fn_proof_of_delivery_guarda();
drop trigger if exists trg_shipments_guarda_entrega on public.shipments;
drop function if exists public.fn_shipments_guarda_entrega();

-- d. Cobrar y entregar.
drop function if exists public.logistica_entregar_y_cobrar_en_caja(uuid, jsonb, text, text, text, jsonb);

-- c. Registro de entrega: cuerpo anterior (sin vía).
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
$function$;

-- b. Vía de entrega.
drop function if exists public.fn_logistica_via_entrega(public.shipments);

-- a. Cargos al activar Logística: cuerpo anterior (sin el permiso de oficina).
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
   where v_despachador is not null and p.code in ('logistica.view', 'logistica.manage')
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

-- a. Permiso y sus asignaciones.
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code = 'logistica.entregar_oficina');
delete from public.role_permissions
 where permission_id in (select id from public.permissions where code = 'logistica.entregar_oficina');
delete from public.permissions where code = 'logistica.entregar_oficina';
