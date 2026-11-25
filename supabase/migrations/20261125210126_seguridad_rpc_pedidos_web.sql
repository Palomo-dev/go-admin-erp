-- GO-seguridad 2026-11-25 · RPC SECURITY DEFINER de pedidos web (complementa 20261125193932).
--
-- 20261125193932 cerró web_orders y web_order_items por RLS. Una función SECURITY DEFINER no pasa
-- por RLS, así que se auditaron las funciones del esquema public que leen o escriben pedidos web,
-- sus ítems, intentos de pago, anticipos, reservas de stock y envíos ligados. Anon ya no ejecutaba
-- ninguna SECURITY DEFINER de ese grupo; casi todas las que ejecuta authenticated validan la
-- organización del registro con fn_assert_acceso_org / fn_logistica_envio_bloquear. Quedaban:
--
--   1. expire_pending_web_orders(integer): el cron de vencimiento, ejecutable por cualquier sesión
--      y sin search_path fijo. Solo la llama /api/cron/expire-pending-web-orders con service_role
--      (logs de 24 h: solo la clave secreta). → solo service_role + search_path.
--   2. fn_web_order_plazo_minutos(integer, text, integer): sin guarda, leía la configuración de
--      cualquier organización. La llaman la tienda (servidor, service_role) y dos funciones
--      SECURITY DEFINER (fn_web_order_vence_pago_en, fn_web_orders_resumen_pago), que corren como
--      dueño y no dependen de este permiso. → solo service_role.
--   3. Funciones de trigger con EXECUTE para authenticated o sin search_path fijo (un trigger no
--      necesita EXECUTE del rol que hace el INSERT/UPDATE: así funcionan ya fn_auto_journal_payment
--      y el resto). → sin EXECUTE para clientes; search_path fijo.
--   4. get_web_top_products: SECURITY DEFINER sin search_path fijo. → search_path.
--   5. get_web_orders_* y generate_web_order_number (SECURITY INVOKER) seguían concedidas a PUBLIC
--      y anon. Con la RLS cerrada anon ya no ve filas; se quita el permiso para que no vuelvan a
--      servir si alguien reabre la tabla. Ningún consumidor las llama con la clave pública.
--   6. fn_transporte_conductores(integer): devolvía nombre, documento y teléfono de los
--      domiciliarios de CUALQUIER organización a cualquier sesión: fn_logistica_ve_todo(p_org) es
--      true para quien no es domiciliario de esa organización, aunque no sea miembro. Comprobado
--      en seco: un miembro de otra organización veía los conductores ajenos. → esa rama exige ser
--      miembro activo. fn_logistica_ve_todo no se toca: la usan las políticas RLS de shipments,
--      que ya filtran por pertenencia, y meterle otro EXISTS encarece cada fila.
--   7. logistica_revisar_asignacion: mismo hueco (solo fn_logistica_ve_todo). → fn_assert_acceso_org
--      de la organización del envío antes de todo.
--
-- Ojo: CREATE OR REPLACE de expire_pending_web_orders, fn_auto_journal_shipment,
-- fn_notify_payment_registered o get_web_top_products sin cláusula SET borra el search_path que
-- fija esta migración. Quien las redefina, que lleve SET search_path TO 'public', 'pg_temp'.

-- 1 · Cron de vencimiento: solo service_role
revoke all on function public.expire_pending_web_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_pending_web_orders(integer) to service_role;
alter function public.expire_pending_web_orders(integer) set search_path to 'public', 'pg_temp';

-- 2 · Plazo de pago: solo service_role (las SECURITY DEFINER que la usan corren como dueño)
revoke all on function public.fn_web_order_plazo_minutos(integer, text, integer) from public, anon, authenticated;
grant execute on function public.fn_web_order_plazo_minutos(integer, text, integer) to service_role;

-- 3 · Funciones de trigger
revoke all on function public.fn_trg_anticipo_pedido_web_aplicado() from public, anon, authenticated;
revoke all on function public.fn_web_orders_mark_customer_purchased() from public, anon, authenticated;
grant execute on function public.fn_trg_anticipo_pedido_web_aplicado() to service_role;
grant execute on function public.fn_web_orders_mark_customer_purchased() to service_role;
alter function public.fn_web_orders_mark_customer_purchased() set search_path to 'public', 'pg_temp';
alter function public.fn_auto_journal_shipment() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_payment_registered() set search_path to 'public', 'pg_temp';

-- 4 · Productos más vendidos de la tienda: search_path
alter function public.get_web_top_products(integer, text, text, integer) set search_path to 'public', 'pg_temp';

-- 5 · Analítica y numeración (SECURITY INVOKER): fuera anon y PUBLIC
revoke all on function public.get_web_orders_all_by_day(integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_web_orders_all_by_hour(integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_web_orders_revenue_by_day(integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_web_orders_revenue_by_hour(integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.generate_web_order_number(integer) from public, anon;
grant execute on function public.get_web_orders_all_by_day(integer, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_web_orders_all_by_hour(integer, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_web_orders_revenue_by_day(integer, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_web_orders_revenue_by_hour(integer, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.generate_web_order_number(integer) to authenticated, service_role;

-- 6 · Conductores: la rama «ve todo» exige ser miembro activo de la organización
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
          -- GO-seguridad 2026-11-25: fn_logistica_ve_todo no mira la pertenencia.
          or (public.fn_logistica_ve_todo(p_org)
              and exists (select 1 from public.organization_members om
                           where om.user_id = (select auth.uid()) and om.organization_id = p_org
                             and om.is_active)))
   order by dc.full_name;
$function$;

-- 7 · Revisar asignación: pertenencia a la organización del envío antes de todo
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
  -- GO-seguridad 2026-11-25: fn_logistica_ve_todo no mira la pertenencia.
  perform public.fn_assert_acceso_org(v_org);
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
