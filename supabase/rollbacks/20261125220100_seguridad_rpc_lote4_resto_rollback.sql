-- Reversión de 20261125220100_seguridad_rpc_lote4_resto (versión 20261125220000 en la base).
-- Devuelve cuerpos, políticas, permisos y search_path a como estaban antes. No toca datos.
-- Ninguna de las funciones revocadas tenía PUBLIC ni anon antes de la migración.
-- OJO: reabre public.set_config (cualquier parámetro, de sesión, desde cualquier sesión: app.current_org_id
-- ajeno e interruptores de guarda), las ramas app.current_org_id de 5 políticas y la creación de
-- puestos en viajes ajenos.

-- 1 · set_config (cuerpo anterior)
create or replace function public.set_config(setting_name text, setting_value text)
 returns void
 language plpgsql
 security definer
as $function$
BEGIN
  PERFORM set_config(setting_name, setting_value, false);
END;
$function$;

-- 2 · set_session_org_id (cuerpo anterior)
create or replace function public.set_session_org_id(org_id integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  perform public.fn_assert_acceso_org(org_id::integer);
  -- Configurar el parámetro de sesión
  PERFORM set_config('app.current_org_id', org_id::text, false);
END;
$function$;

-- 3 · Políticas (expresiones anteriores)
alter policy rates_org_access on public.rates
  using ((organization_id in (select organization_members.organization_id from organization_members
          where ((organization_members.user_id = auth.uid()) and (organization_members.is_active = true))))
         or (organization_id = (current_setting('app.current_org_id'::text, true))::integer))
  with check ((organization_id in (select organization_members.organization_id from organization_members
          where ((organization_members.user_id = auth.uid()) and (organization_members.is_active = true))))
         or (organization_id = (current_setting('app.current_org_id'::text, true))::integer));
alter policy folios_org_isolation on public.folios
  using ((reservation_id in (select r.id from reservations r where (r.organization_id in (select om.organization_id
            from organization_members om where ((om.user_id = auth.uid()) and (om.is_active = true))))))
         or (reservation_id in (select r.id from reservations r
            where ((r.organization_id = coalesce((nullif(current_setting('app.current_org_id'::text, true), ''::text))::integer, 0))
              and (0 <> coalesce((nullif(current_setting('app.current_org_id'::text, true), ''::text))::integer, 0))))))
  with check ((reservation_id in (select r.id from reservations r where (r.organization_id in (select om.organization_id
            from organization_members om where ((om.user_id = auth.uid()) and (om.is_active = true))))))
         or (reservation_id in (select r.id from reservations r
            where ((r.organization_id = coalesce((nullif(current_setting('app.current_org_id'::text, true), ''::text))::integer, 0))
              and (0 <> coalesce((nullif(current_setting('app.current_org_id'::text, true), ''::text))::integer, 0))))));
alter policy reservations_member_update on public.reservations
  using ((organization_id in (select om.organization_id from organization_members om where (om.user_id = auth.uid())))
         or (organization_id = (current_setting('app.current_org_id'::text, true))::integer));
alter policy reservation_blocks_org_isolation on public.reservation_blocks
  to public
  using (organization_id = (current_setting('app.current_org_id'::text, true))::integer);
alter policy reservation_customers_isolation on public.reservation_customers
  to public
  using (reservation_id in (select reservations.id from reservations
          where (reservations.organization_id = (current_setting('app.current_org_id'::text))::integer)));

-- 4 · fn_initialize_trip_seats (cuerpo anterior, sin guarda)
create or replace function public.fn_initialize_trip_seats(p_trip_id uuid)
 returns integer
 language plpgsql
 security definer
as $function$
DECLARE
  v_vehicle_id UUID;
  v_org_id INTEGER;
  v_count INTEGER := 0;
BEGIN
  SELECT vehicle_id, organization_id INTO v_vehicle_id, v_org_id
  FROM trips WHERE id = p_trip_id;

  IF v_vehicle_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO trip_seats (organization_id, trip_id, vehicle_seat_id, seat_label, status)
  SELECT v_org_id, p_trip_id, vs.id, vs.seat_label, 'available'
  FROM vehicle_seats vs
  WHERE vs.vehicle_id = v_vehicle_id
    AND vs.is_available = true
    AND vs.seat_type = 'passenger'
  ON CONFLICT (trip_id, vehicle_seat_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE trips SET available_seats = (
    SELECT COUNT(*) FROM trip_seats WHERE trip_id = p_trip_id AND status = 'available'
  ) WHERE id = p_trip_id;

  RETURN v_count;
END;
$function$;

-- 5 · Permisos
grant execute on function public.migrate_public_images() to authenticated;
grant execute on function public.sync_space_status_with_reservations() to authenticated;
grant execute on function public.create_product_with_images(jsonb, integer[]) to authenticated;
grant execute on function public.associate_image_to_product(integer, integer, integer, boolean) to authenticated;
grant execute on function public.register_shared_image(text, text, text, integer, text, jsonb, boolean, text[]) to authenticated;
grant execute on function public.upload_temporary_image(text, text, text, integer, text, jsonb, text[]) to authenticated;
grant execute on function public.fn_costo_unitario_producto(integer, integer, numeric) to authenticated;
grant execute on function public.fn_get_trip_available_seats(uuid) to authenticated;
grant execute on function public.fn_clasificar_producto_restaurante(integer, integer) to authenticated;
grant execute on function public.get_permanent_image_url(text) to authenticated;
grant execute on function public.fn_product_image_archivo_disponible(text) to authenticated;
grant execute on function public.get_section_default_content(text, text, integer) to authenticated;
grant execute on function public.fn_ai_credits_inicio_periodo(integer) to authenticated;
grant execute on function public.fn_ai_credits_proxima_renovacion(integer) to authenticated;

-- 6 · search_path
alter function public.assign_core_modules_to_organization() reset search_path;
alter function public.associate_image_to_product(integer, integer, integer, boolean) reset search_path;
alter function public.audit_finance_changes() reset search_path;
alter function public.calculate_reservation_total(integer, uuid, date, date, text) reset search_path;
alter function public.check_email_exists(text) reset search_path;
alter function public.check_rate_conflicts(integer, uuid, date, date, text, uuid) reset search_path;
alter function public.cleanup_residual_signup_data() reset search_path;
alter function public.cleanup_signup_data(text) reset search_path;
alter function public.crear_tipo_variante(text, integer, text[]) reset search_path;
alter function public.create_default_website_settings(integer, integer, text) reset search_path;
alter function public.create_product_with_images(jsonb, integer[]) reset search_path;
alter function public.create_rate_with_validation(integer, uuid, date, date, numeric, integer, jsonb, boolean) reset search_path;
alter function public.create_rate(integer, uuid, date, date, numeric, jsonb, boolean) reset search_path;
alter function public.create_rate(integer, uuid, date, date, numeric, jsonb) reset search_path;
alter function public.deactivate_product(integer, integer) reset search_path;
alter function public.deactivate_product(integer) reset search_path;
alter function public.execute_alert_condition(text, integer) reset search_path;
alter function public.fn_consume_ai_credits_on_message() reset search_path;
alter function public.fn_create_default_branch_and_period() reset search_path;
alter function public.fn_create_default_org_structure() reset search_path;
alter function public.fn_get_trip_available_seats(uuid) reset search_path;
alter function public.fn_meta_product_price_sync() reset search_path;
alter function public.fn_meta_product_sync() reset search_path;
alter function public.generate_missing_currencies() reset search_path;
alter function public.get_ai_tokens_usage(integer) reset search_path;
alter function public.get_branch_usage(integer) reset search_path;
alter function public.get_current_plan(integer) reset search_path;
alter function public.get_enterprise_pricing() reset search_path;
alter function public.get_module_usage(integer) reset search_path;
alter function public.get_permanent_image_url(text) reset search_path;
alter function public.get_plan_pricing(text) reset search_path;
alter function public.get_products_with_latest_costs(integer) reset search_path;
alter function public.get_products_with_latest_prices(integer) reset search_path;
alter function public.get_rate_for_date(integer, uuid, date, text) reset search_path;
alter function public.get_section_default_content(text, text, integer) reset search_path;
alter function public.initialize_org_preferences() reset search_path;
alter function public.insert_shared_image_simple(text, text, text, integer, text, integer) reset search_path;
alter function public.is_super_admin(uuid) reset search_path;
alter function public.manual_refresh_forecast() reset search_path;
alter function public.migrate_public_images() reset search_path;
alter function public.refresh_forecast_view_trigger() reset search_path;
alter function public.register_price_change() reset search_path;
alter function public.register_shared_image(text, text, text, integer, text, jsonb, boolean, text[]) reset search_path;
alter function public.revoke_other_sessions(uuid) reset search_path;
alter function public.revoke_session(bigint) reset search_path;
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date, text) reset search_path;
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint, date) reset search_path;
alter function public.save_exchange_rates(integer, uuid, jsonb, text, bigint) reset search_path;
alter function public.save_exchange_rates(integer, uuid, jsonb, text) reset search_path;
alter function public.save_global_exchange_rates(jsonb, text, bigint, date, text) reset search_path;
alter function public.set_org_context(bigint) reset search_path;
alter function public.setup_organization_defaults(integer, text) reset search_path;
alter function public.sync_comm_credits_on_subscription() reset search_path;
alter function public.sync_space_status_with_reservations() reset search_path;
alter function public.test_alert_condition(text, integer) reset search_path;
alter function public.toggle_rate_active(uuid, integer) reset search_path;
alter function public.trg_fn_auto_create_accounting_rules() reset search_path;
alter function public.trg_fn_auto_create_chart_of_accounts() reset search_path;
alter function public.trigger_create_default_pages() reset search_path;
alter function public.trigger_sync_space_status() reset search_path;
alter function public.update_all_exchange_rates_with_api(jsonb, text, bigint, date) reset search_path;
alter function public.update_all_exchange_rates() reset search_path;
alter function public.update_all_exchange_rates(jsonb, text, bigint, date) reset search_path;
alter function public.update_exchange_rates(integer) reset search_path;
alter function public.update_image_url() reset search_path;
alter function public.update_stage_bypass_triggers(uuid, text, text, text, numeric) reset search_path;
alter function public.update_stage_bypass(uuid, uuid, text) reset search_path;
alter function public.update_stage_safe(uuid, text, numeric, text, text) reset search_path;
alter function public.upload_temporary_image(text, text, text, integer, text, jsonb, text[]) reset search_path;
alter function public.validate_branch_limit(integer) reset search_path;
alter function public.validate_module_limit(integer) reset search_path;
