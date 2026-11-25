-- Reversión de 20261125210126_seguridad_rpc_pedidos_web.
-- Devuelve permisos, search_path y cuerpos a como estaban antes. No toca datos (la migración
-- tampoco los tocaba). OJO: reabre la fuga de conductores de fn_transporte_conductores y el acceso
-- de cualquier sesión a logistica_revisar_asignacion de otra organización.

-- 1 · Cron de vencimiento
grant execute on function public.expire_pending_web_orders(integer) to authenticated;
alter function public.expire_pending_web_orders(integer) reset search_path;

-- 2 · Plazo de pago
grant execute on function public.fn_web_order_plazo_minutos(integer, text, integer) to authenticated;

-- 3 · Funciones de trigger
grant execute on function public.fn_trg_anticipo_pedido_web_aplicado() to authenticated;
grant execute on function public.fn_web_orders_mark_customer_purchased() to authenticated;
alter function public.fn_web_orders_mark_customer_purchased() set search_path to 'public';
alter function public.fn_auto_journal_shipment() reset search_path;
alter function public.fn_notify_payment_registered() reset search_path;

-- 4 · Productos más vendidos
alter function public.get_web_top_products(integer, text, text, integer) reset search_path;

-- 5 · Analítica y numeración
grant execute on function public.get_web_orders_all_by_day(integer, text, timestamptz, timestamptz) to public, anon;
grant execute on function public.get_web_orders_all_by_hour(integer, text, timestamptz, timestamptz) to public, anon;
grant execute on function public.get_web_orders_revenue_by_day(integer, text, timestamptz, timestamptz) to public, anon;
grant execute on function public.get_web_orders_revenue_by_hour(integer, text, timestamptz, timestamptz) to public, anon;
grant execute on function public.generate_web_order_number(integer) to public, anon;

-- 6 · Conductores (cuerpo anterior)
create or replace function public.fn_transporte_conductores(p_org integer)
 returns table(id uuid, user_id uuid, nombre text, documento_tipo text, documento text, telefono text,
               licencia_categoria text, licencia_vence date, examen_vence date, activo boolean, sede_id integer)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select dc.id, dc.user_id, dc.full_name, dc.document_type, dc.document_number, dc.phone,
         dc.license_category, dc.license_expiry, dc.medical_certificate_expiry,
         coalesce(dc.is_active, true), dc.branch_id
    from public.driver_credentials dc
   where dc.organization_id = p_org
     and (public.fn_caja_puede(p_org, 'transporte.view')
          or public.fn_caja_puede(p_org, 'transporte.despachar')
          or public.fn_logistica_ve_todo(p_org))
   order by dc.full_name;
$function$;

-- 7 · Revisar asignación (cuerpo anterior, sin fn_assert_acceso_org)
create or replace function public.logistica_revisar_asignacion(p_shipment_ids uuid[], p_driver_id uuid,
                                                               p_vehicle_id uuid default null::uuid,
                                                               p_sin_vehiculo text default null::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_s public.shipments;
  v_vehicle uuid;
  v_sin text;
  v_origen text := 'elegido';
  v_peso numeric;
  v_volumen numeric;
  v_tz text;
  v_ocupado boolean := false;
begin
  if coalesce(array_length(p_shipment_ids, 1), 0) = 0 then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  select * into v_s from public.shipments where id = p_shipment_ids[1];
  if v_s.id is null then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  v_org := v_s.organization_id;
  if not public.fn_logistica_ve_todo(v_org) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if exists (select 1 from public.shipments s where s.id = any (p_shipment_ids) and s.organization_id <> v_org) then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.driver_credentials dc where dc.id = p_driver_id and dc.organization_id = v_org) then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;

  if p_sin_vehiculo is not null then
    v_sin := case when p_sin_vehiculo in ('on_foot', 'bicycle') then p_sin_vehiculo end;
  elsif p_vehicle_id is not null then
    v_vehicle := p_vehicle_id;
  else
    select g.vehicle_id, g.sin_vehiculo, g.origen into v_vehicle, v_sin, v_origen
      from public.fn_logistica_vehiculo_sugerido(v_org, p_driver_id,
             case when array_length(p_shipment_ids, 1) = 1 then v_s.vehicle_id end,
             case when array_length(p_shipment_ids, 1) = 1 then v_s.driver_id end, p_shipment_ids) g;
  end if;
  if v_vehicle is not null then
    if not exists (select 1 from public.vehicles v where v.id = v_vehicle and v.organization_id = v_org) then
      raise exception 'VEHICULO_INVALIDO' using errcode = '22023';
    end if;
    v_ocupado := exists (select 1 from public.shipments s
                          where s.vehicle_id = v_vehicle and not (s.id = any (p_shipment_ids)) and s.driver_id is distinct from p_driver_id
                            and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt'));
  end if;

  select c.peso, c.volumen into v_peso, v_volumen from public.fn_logistica_carga_vehiculo(v_vehicle, p_driver_id, p_shipment_ids) c;
  v_tz := coalesce((select o.timezone from public.organizations o where o.id = v_org), 'America/Bogota');
  return public.fn_logistica_cumplimiento_asignacion(v_org, p_driver_id, v_vehicle, v_sin, (now() at time zone v_tz)::date, v_peso, v_volumen)
    || jsonb_build_object('vehiculo_id', v_vehicle, 'origen', v_origen, 'vehiculo_ocupado', v_ocupado);
end;
$function$;
