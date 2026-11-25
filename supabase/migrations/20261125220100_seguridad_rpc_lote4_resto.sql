-- GO-seguridad 2026-11-25 · Lote 4 de la auditoría de SECURITY DEFINER por módulos: EL RESTO
-- (inventario, compras, PMS, transporte, sitios web, imágenes, IA/créditos). Método y formato de
-- 20261125210126_seguridad_rpc_pedidos_web.
-- (En la base quedó registrada como versión 20261125220000; el archivo lleva 20261125220100 para no
-- chocar con 20261125220000_logistica_envio_fragil.sql del repositorio.)
--
-- Revisadas las SECURITY DEFINER que ejecuta authenticated y que no tenían guarda reconocible.
-- Inventario, productos, recetas, lotes, seriales, listas de precios, sitios web, cartas y
-- básculas delegan en fn_inventario_exigir_permiso / fn_productos_exigir_permiso /
-- fn_website_exigir_permiso / fn_lista_precios_exigir_* / fn_seriales_int_exigir /
-- fn_pos_basculas_exigir_permiso; el portal de inversionistas en fn_es_inversionista /
-- fn_mi_investor_user_id + MFA. Quedaban:
--
--   1. GRAVE · public.set_config(text, text): SECURITY DEFINER sin guarda que hacía
--      set_config(nombre, valor, false) — cualquier parámetro, a nivel de SESIÓN. Una sesión
--      cualquiera podía:
--        a) poner app.current_org_id de OTRA organización: las políticas de rates, folios,
--           reservations (UPDATE), reservation_blocks y reservation_customers aceptaban ese
--           parámetro como alternativa a la pertenencia (probado en seco: un miembro de otra
--           organización pasó de ver 1 bloqueo a ver 2, el ajeno incluido);
--        b) encender los interruptores internos que las funciones de guarda leen
--           (app.contabilidad_mantenimiento salta la inmutabilidad de asientos publicados,
--           app.nomina_motor la de nómina, app.saldo_bancario_por_movimiento la del saldo
--           bancario, app.propinas_rpc la de propinas…; probado: quedó en «on»).
--      Y como el valor era de sesión, quedaba pegado a la conexión del pool y lo heredaba la
--      siguiente petición de OTRO usuario. Lo llaman ratesService y reservationBlocksService
--      (navegador, sin mirar el error). → solo acepta app.current_org_id, de una organización de
--      la que se es miembro (fn_assert_acceso_org), y local a la transacción.
--   2. set_session_org_id: validaba pertenencia pero también dejaba el valor de sesión pegado a
--      la conexión (checkoutService del PMS). → local a la transacción.
--   3. Las 5 políticas que aceptaban app.current_org_id: se quita esa rama. rates, folios y
--      reservations ya tenían la de pertenencia (los miembros no pierden nada);
--      reservation_blocks tenía además reservation_blocks_miembros; reservation_customers pasa a
--      pertenencia por la reserva. Con esto una conexión ya contaminada deja de abrir datos.
--   4. fn_initialize_trip_seats(viaje): sin guarda, creaba los puestos de un viaje de cualquier
--      organización. La llama el ERP con sesión (ticketsService) y fn_transporte_puestos_viaje.
--      → fn_assert_acceso_org de la organización del viaje.
--   5. Sin guarda y sin consumidor (grep en los 5 repositorios y Edge Functions; solo los llaman
--      otras SECURITY DEFINER o nadie): migrate_public_images y
--      sync_space_status_with_reservations (recorren TODAS las organizaciones),
--      create_product_with_images / associate_image_to_product / register_shared_image /
--      upload_temporary_image (legado: leen una organización del JWT que no existe),
--      fn_costo_unitario_producto (costo promedio de cualquier producto),
--      fn_get_trip_available_seats, fn_clasificar_producto_restaurante, get_permanent_image_url,
--      fn_product_image_archivo_disponible, get_section_default_content, fn_ai_credits_inicio_periodo
--      y fn_ai_credits_proxima_renovacion (la llama /api/me/plan con service_role).
--      → solo service_role.
--   6. search_path fijo en las 73 SECURITY DEFINER que quedaban sin él y que no usan objetos del
--      esquema extensions ni están en una política RLS (excluidas: check_user_permission,
--      search_knowledge_fragments, create_user_fallback, audit_ops_changes,
--      audit_products_changes, auto_update_exchange_rates, log_role_changes).
--
-- Ojo: CREATE OR REPLACE de cualquiera de estas sin cláusula SET borra el search_path que fija
-- esta migración. Quien las redefina, que lleve SET search_path TO 'public', 'pg_temp'.
-- Ojo: ninguna política debe volver a aceptar current_setting('app.…') como alternativa a la
-- pertenencia: cualquier valor «de sesión» se hereda entre usuarios por el pool de conexiones.

-- 1 · set_config: solo el contexto de organización propia, local a la transacción
create or replace function public.set_config(setting_name text, setting_value text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- GO-seguridad 2026-11-25: antes ponía cualquier parámetro a nivel de sesión (interruptores de
  -- guarda incluidos) y app.current_org_id de cualquier organización.
  if setting_name is distinct from 'app.current_org_id' then
    raise exception 'set_config: parámetro no permitido' using errcode = '42501';
  end if;
  if setting_value is null or setting_value !~ '^[0-9]{1,9}$' then
    raise exception 'set_config: organización inválida' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(setting_value::integer);
  perform pg_catalog.set_config('app.current_org_id', setting_value, true);
end;
$function$;

-- 2 · set_session_org_id: local a la transacción
create or replace function public.set_session_org_id(org_id integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(org_id::integer);
  -- GO-seguridad 2026-11-25: local (true). De sesión quedaba pegado a la conexión del pool.
  perform pg_catalog.set_config('app.current_org_id', org_id::text, true);
end;
$function$;

-- 3 · Políticas: sin la rama app.current_org_id
alter policy rates_org_access on public.rates
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy folios_org_isolation on public.folios
  using (reservation_id in (select r.id from public.reservations r
                              join public.organization_members om on om.organization_id = r.organization_id
                             where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (reservation_id in (select r.id from public.reservations r
                                   join public.organization_members om on om.organization_id = r.organization_id
                                  where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy reservations_member_update on public.reservations
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid())));

alter policy reservation_blocks_org_isolation on public.reservation_blocks
  to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy reservation_customers_isolation on public.reservation_customers
  to authenticated
  using (reservation_id in (select r.id from public.reservations r
                              join public.organization_members om on om.organization_id = r.organization_id
                             where om.user_id = (select auth.uid()) and om.is_active = true));

-- 4 · Puestos de un viaje: solo de una organización propia
create or replace function public.fn_initialize_trip_seats(p_trip_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_vehicle_id uuid;
  v_org_id integer;
  v_count integer := 0;
begin
  select vehicle_id, organization_id into v_vehicle_id, v_org_id
    from public.trips where id = p_trip_id;

  if v_vehicle_id is null then
    return 0;
  end if;
  -- GO-seguridad 2026-11-25: antes creaba los puestos de un viaje de cualquier organización.
  perform public.fn_assert_acceso_org(v_org_id);

  insert into public.trip_seats (organization_id, trip_id, vehicle_seat_id, seat_label, status)
  select v_org_id, p_trip_id, vs.id, vs.seat_label, 'available'
    from public.vehicle_seats vs
   where vs.vehicle_id = v_vehicle_id
     and vs.is_available = true
     and vs.seat_type = 'passenger'
  on conflict (trip_id, vehicle_seat_id) do nothing;

  get diagnostics v_count = row_count;

  update public.trips set available_seats = (
    select count(*) from public.trip_seats where trip_id = p_trip_id and status = 'available'
  ) where id = p_trip_id;

  return v_count;
end;
$function$;

-- 5 · Solo service_role
revoke all on function public.migrate_public_images() from public, anon, authenticated;
revoke all on function public.sync_space_status_with_reservations() from public, anon, authenticated;
revoke all on function public.create_product_with_images(jsonb, integer[]) from public, anon, authenticated;
revoke all on function public.associate_image_to_product(integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.register_shared_image(text, text, text, integer, text, jsonb, boolean, text[]) from public, anon, authenticated;
revoke all on function public.upload_temporary_image(text, text, text, integer, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.fn_costo_unitario_producto(integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.fn_get_trip_available_seats(uuid) from public, anon, authenticated;
revoke all on function public.fn_clasificar_producto_restaurante(integer, integer) from public, anon, authenticated;
revoke all on function public.get_permanent_image_url(text) from public, anon, authenticated;
revoke all on function public.fn_product_image_archivo_disponible(text) from public, anon, authenticated;
revoke all on function public.get_section_default_content(text, text, integer) from public, anon, authenticated;
revoke all on function public.fn_ai_credits_inicio_periodo(integer) from public, anon, authenticated;
revoke all on function public.fn_ai_credits_proxima_renovacion(integer) from public, anon, authenticated;
grant execute on function public.migrate_public_images() to service_role;
grant execute on function public.sync_space_status_with_reservations() to service_role;
grant execute on function public.create_product_with_images(jsonb, integer[]) to service_role;
grant execute on function public.associate_image_to_product(integer, integer, integer, boolean) to service_role;
grant execute on function public.register_shared_image(text, text, text, integer, text, jsonb, boolean, text[]) to service_role;
grant execute on function public.upload_temporary_image(text, text, text, integer, text, jsonb, text[]) to service_role;
grant execute on function public.fn_costo_unitario_producto(integer, integer, numeric) to service_role;
grant execute on function public.fn_get_trip_available_seats(uuid) to service_role;
grant execute on function public.fn_clasificar_producto_restaurante(integer, integer) to service_role;
grant execute on function public.get_permanent_image_url(text) to service_role;
grant execute on function public.fn_product_image_archivo_disponible(text) to service_role;
grant execute on function public.get_section_default_content(text, text, integer) to service_role;
grant execute on function public.fn_ai_credits_inicio_periodo(integer) to service_role;
grant execute on function public.fn_ai_credits_proxima_renovacion(integer) to service_role;

-- 6 · search_path fijo en las SECURITY DEFINER que quedaban sin él
alter function public.assign_core_modules_to_organization() set search_path to 'public', 'pg_temp';
alter function public.associate_image_to_product(integer, integer, integer, boolean) set search_path to 'public', 'pg_temp';
alter function public.audit_finance_changes() set search_path to 'public', 'pg_temp';
alter function public.calculate_reservation_total(integer, uuid, date, date, text) set search_path to 'public', 'pg_temp';
alter function public.check_email_exists(text) set search_path to 'public', 'pg_temp';
alter function public.check_rate_conflicts(integer, uuid, date, date, text, uuid) set search_path to 'public', 'pg_temp';
alter function public.cleanup_residual_signup_data() set search_path to 'public', 'pg_temp';
alter function public.cleanup_signup_data(text) set search_path to 'public', 'pg_temp';
alter function public.crear_tipo_variante(text, integer, text[]) set search_path to 'public', 'pg_temp';
alter function public.create_default_website_settings(integer, integer, text) set search_path to 'public', 'pg_temp';
alter function public.create_product_with_images(jsonb, integer[]) set search_path to 'public', 'pg_temp';
alter function public.create_rate_with_validation(integer, uuid, date, date, numeric, integer, jsonb, boolean) set search_path to 'public', 'pg_temp';
alter function public.create_rate(integer, uuid, date, date, numeric, jsonb, boolean) set search_path to 'public', 'pg_temp';
alter function public.create_rate(integer, uuid, date, date, numeric, jsonb) set search_path to 'public', 'pg_temp';
alter function public.deactivate_product(integer, integer) set search_path to 'public', 'pg_temp';
alter function public.deactivate_product(integer) set search_path to 'public', 'pg_temp';
alter function public.execute_alert_condition(text, integer) set search_path to 'public', 'pg_temp';
alter function public.fn_consume_ai_credits_on_message() set search_path to 'public', 'pg_temp';
alter function public.fn_create_default_branch_and_period() set search_path to 'public', 'pg_temp';
alter function public.fn_create_default_org_structure() set search_path to 'public', 'pg_temp';
alter function public.fn_get_trip_available_seats(uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_meta_product_price_sync() set search_path to 'public', 'pg_temp';
alter function public.fn_meta_product_sync() set search_path to 'public', 'pg_temp';
alter function public.generate_missing_currencies() set search_path to 'public', 'pg_temp';
alter function public.get_ai_tokens_usage(integer) set search_path to 'public', 'pg_temp';
alter function public.get_branch_usage(integer) set search_path to 'public', 'pg_temp';
alter function public.get_current_plan(integer) set search_path to 'public', 'pg_temp';
alter function public.get_enterprise_pricing() set search_path to 'public', 'pg_temp';
alter function public.get_module_usage(integer) set search_path to 'public', 'pg_temp';
alter function public.get_permanent_image_url(text) set search_path to 'public', 'pg_temp';
alter function public.get_plan_pricing(text) set search_path to 'public', 'pg_temp';
alter function public.get_products_with_latest_costs(integer) set search_path to 'public', 'pg_temp';
alter function public.get_products_with_latest_prices(integer) set search_path to 'public', 'pg_temp';
alter function public.get_rate_for_date(integer, uuid, date, text) set search_path to 'public', 'pg_temp';
alter function public.get_section_default_content(text, text, integer) set search_path to 'public', 'pg_temp';
alter function public.initialize_org_preferences() set search_path to 'public', 'pg_temp';
alter function public.insert_shared_image_simple(text, text, text, integer, text, integer) set search_path to 'public', 'pg_temp';
alter function public.is_super_admin(uuid) set search_path to 'public', 'pg_temp';
alter function public.manual_refresh_forecast() set search_path to 'public', 'pg_temp';
alter function public.migrate_public_images() set search_path to 'public', 'pg_temp';
alter function public.refresh_forecast_view_trigger() set search_path to 'public', 'pg_temp';
alter function public.register_price_change() set search_path to 'public', 'pg_temp';
alter function public.register_shared_image(text, text, text, integer, text, jsonb, boolean, text[]) set search_path to 'public', 'pg_temp';
alter function public.revoke_other_sessions(uuid) set search_path to 'public', 'pg_temp';
alter function public.revoke_session(bigint) set search_path to 'public', 'pg_temp';
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date, text) set search_path to 'public', 'pg_temp';
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date) set search_path to 'public', 'pg_temp';
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint) set search_path to 'public', 'pg_temp';
alter function public.save_exchange_rates(integer, uuid, jsonb, text) set search_path to 'public', 'pg_temp';
alter function public.save_global_exchange_rates(jsonb, text, bigint, date, text) set search_path to 'public', 'pg_temp';
alter function public.set_org_context(bigint) set search_path to 'public', 'pg_temp';
alter function public.setup_organization_defaults(integer, text) set search_path to 'public', 'pg_temp';
alter function public.sync_comm_credits_on_subscription() set search_path to 'public', 'pg_temp';
alter function public.sync_space_status_with_reservations() set search_path to 'public', 'pg_temp';
alter function public.test_alert_condition(text, integer) set search_path to 'public', 'pg_temp';
alter function public.toggle_rate_active(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.trg_fn_auto_create_accounting_rules() set search_path to 'public', 'pg_temp';
alter function public.trg_fn_auto_create_chart_of_accounts() set search_path to 'public', 'pg_temp';
alter function public.trigger_create_default_pages() set search_path to 'public', 'pg_temp';
alter function public.trigger_sync_space_status() set search_path to 'public', 'pg_temp';
alter function public.update_all_exchange_rates_with_api(jsonb, text, bigint, date) set search_path to 'public', 'pg_temp';
alter function public.update_all_exchange_rates() set search_path to 'public', 'pg_temp';
alter function public.update_all_exchange_rates(jsonb, text, bigint, date) set search_path to 'public', 'pg_temp';
alter function public.update_exchange_rates(integer) set search_path to 'public', 'pg_temp';
alter function public.update_image_url() set search_path to 'public', 'pg_temp';
alter function public.update_stage_bypass_triggers(uuid, text, text, text, numeric) set search_path to 'public', 'pg_temp';
alter function public.update_stage_bypass(uuid, uuid, text) set search_path to 'public', 'pg_temp';
alter function public.update_stage_safe(uuid, text, numeric, text, text) set search_path to 'public', 'pg_temp';
alter function public.upload_temporary_image(text, text, text, integer, text, jsonb, text[]) set search_path to 'public', 'pg_temp';
alter function public.validate_branch_limit(integer) set search_path to 'public', 'pg_temp';
alter function public.validate_module_limit(integer) set search_path to 'public', 'pg_temp';
