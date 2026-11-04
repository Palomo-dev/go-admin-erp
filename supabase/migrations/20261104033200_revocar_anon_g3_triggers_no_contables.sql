-- Grupo 3 de 4: 58 funciones de trigger NO contables (notificaciones, auditoría, defaults, sitio web, CRM).
--   Postgres comprueba EXECUTE de la función solo al CREAR el trigger, no al dispararlo:
--   los triggers siguen corriendo para cualquier rol (ensayado con un trigger real como anon).
--   Nadie puede llamar una función de trigger directamente. Incluye 3 sin trigger hoy
--   (register_price_change, update_customer_avatar, update_image_url).
-- Aplicada por MCP el 2026-11-04, después de 20261104031500 (las 12 críticas), en orden 1 → 4,
-- con una sonda como anon después de cada grupo (395 tablas/vistas + 14 rutas de una tienda real).
-- service_role y postgres conservan EXECUTE. Se quedan para anon, a propósito, las 6 que evalúan
-- las políticas RLS de las tiendas: app_branch_access, can_access_account_receivable, fn_mis_orgs,
-- get_public_menu, is_user_member_of_org, user_belongs_to_organization.
--
-- Rollback: supabase/rollbacks/20261104033200_revocar_anon_g3_triggers_no_contables_rollback.sql

revoke execute on function
  public.assign_core_modules_to_organization(),
  public.audit_ops_changes(),
  public.audit_products_changes(),
  public.auto_assign_base_permissions_to_job_position(),
  public.create_default_subscription(),
  public.create_employment_for_new_member(),
  public.fn_ai_assistant_touch_conversation(),
  public.fn_auto_tag_conversation(),
  public.fn_branch_set_default(),
  public.fn_branch_write_audit(),
  public.fn_carta_mismo_tenant(),
  public.fn_create_default_branch_and_period(),
  public.fn_create_default_org_structure(),
  public.fn_meta_product_price_sync(),
  public.fn_meta_product_sync(),
  public.fn_notify_calendar_event(),
  public.fn_notify_calendar_event_cancelled(),
  public.fn_notify_cash_session_closed(),
  public.fn_notify_cash_session_opened(),
  public.fn_notify_housekeeping_assigned(),
  public.fn_notify_new_member(),
  public.fn_notify_opportunity_changed(),
  public.fn_notify_payment_registered(),
  public.fn_notify_payroll_approved(),
  public.fn_notify_purchase_invoice(),
  public.fn_notify_reservation_created(),
  public.fn_notify_reservation_status(),
  public.fn_notify_role_changed(),
  public.fn_notify_shift_assigned(),
  public.fn_notify_stock_low(),
  public.fn_notify_subscription_changed(),
  public.fn_notify_task_assigned(),
  public.fn_seed_ai_assistant_settings(),
  public.fn_seed_org_project(),
  public.fn_set_updated_at(),
  public.fn_sync_address_to_customer(),
  public.fn_sync_customer_to_address(),
  public.fn_track_conversation_assignment(),
  public.fn_track_conversation_status_change(),
  public.fn_update_round_shares_issued(),
  public.fn_website_instantanea_mismo_tenant(),
  public.fn_website_instantaneas_retencion(),
  public.fn_website_programada_mismo_tenant(),
  public.fn_widget_limite_de_tasa(),
  public.initialize_org_preferences(),
  public.log_role_changes(),
  public.notify_waiter_on_ticket_ready(),
  public.refresh_forecast_view_trigger(),
  public.register_price_change(),
  public.safe_refresh_crm_forecast(),
  public.sync_comm_credits_on_subscription(),
  public.sync_read_at_to_notification_reads(),
  public.trigger_create_default_pages(),
  public.trigger_create_website_settings(),
  public.trigger_setup_organization_defaults(),
  public.trigger_sync_space_status(),
  public.update_customer_avatar(),
  public.update_image_url()
from public, anon, authenticated;

do $verificar$
declare v_f text;
begin
  foreach v_f in array array['public.assign_core_modules_to_organization()', 'public.audit_ops_changes()', 'public.audit_products_changes()', 'public.auto_assign_base_permissions_to_job_position()', 'public.create_default_subscription()', 'public.create_employment_for_new_member()', 'public.fn_ai_assistant_touch_conversation()', 'public.fn_auto_tag_conversation()', 'public.fn_branch_set_default()', 'public.fn_branch_write_audit()', 'public.fn_carta_mismo_tenant()', 'public.fn_create_default_branch_and_period()', 'public.fn_create_default_org_structure()', 'public.fn_meta_product_price_sync()', 'public.fn_meta_product_sync()', 'public.fn_notify_calendar_event()', 'public.fn_notify_calendar_event_cancelled()', 'public.fn_notify_cash_session_closed()', 'public.fn_notify_cash_session_opened()', 'public.fn_notify_housekeeping_assigned()', 'public.fn_notify_new_member()', 'public.fn_notify_opportunity_changed()', 'public.fn_notify_payment_registered()', 'public.fn_notify_payroll_approved()', 'public.fn_notify_purchase_invoice()', 'public.fn_notify_reservation_created()', 'public.fn_notify_reservation_status()', 'public.fn_notify_role_changed()', 'public.fn_notify_shift_assigned()', 'public.fn_notify_stock_low()', 'public.fn_notify_subscription_changed()', 'public.fn_notify_task_assigned()', 'public.fn_seed_ai_assistant_settings()', 'public.fn_seed_org_project()', 'public.fn_set_updated_at()', 'public.fn_sync_address_to_customer()', 'public.fn_sync_customer_to_address()', 'public.fn_track_conversation_assignment()', 'public.fn_track_conversation_status_change()', 'public.fn_update_round_shares_issued()', 'public.fn_website_instantanea_mismo_tenant()', 'public.fn_website_instantaneas_retencion()', 'public.fn_website_programada_mismo_tenant()', 'public.fn_widget_limite_de_tasa()', 'public.initialize_org_preferences()', 'public.log_role_changes()', 'public.notify_waiter_on_ticket_ready()', 'public.refresh_forecast_view_trigger()', 'public.register_price_change()', 'public.safe_refresh_crm_forecast()', 'public.sync_comm_credits_on_subscription()', 'public.sync_read_at_to_notification_reads()', 'public.trigger_create_default_pages()', 'public.trigger_create_website_settings()', 'public.trigger_setup_organization_defaults()', 'public.trigger_sync_space_status()', 'public.update_customer_avatar()', 'public.update_image_url()'] loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por anon', v_f;
    end if;
    if not has_function_privilege('service_role', v_f::regprocedure, 'execute') then
      raise exception '% perdió service_role', v_f;
    end if;
    if has_function_privilege('authenticated', v_f::regprocedure, 'execute') <> false then
      raise exception '% authenticated quedó distinto de lo esperado', v_f;
    end if;
  end loop;
end
$verificar$;
