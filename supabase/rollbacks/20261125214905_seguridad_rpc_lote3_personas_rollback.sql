-- Reversión de 20261125214905_seguridad_rpc_lote3_personas.
-- Devuelve EXECUTE a authenticated y quita el search_path fijado. Ninguna de estas funciones tenía
-- PUBLIC ni anon antes de la migración, y ninguna tenía search_path fijo. No toca datos.
-- OJO: reabre el cambio de preferencias de notificación de cualquier usuario desde cualquier sesión.

grant execute on function public.save_user_notification_preferences(uuid, text, boolean, text[], time, time) to authenticated;
grant execute on function public.get_user_notification_preferences(uuid, text) to authenticated;
grant execute on function public.increment_fragment_usage(uuid[]) to authenticated;
grant execute on function public.increment_quick_reply_usage(uuid) to authenticated;
grant execute on function public.expire_old_notifications() to authenticated;
grant execute on function public.fn_check_periodic_notifications() to authenticated;
grant execute on function public.fn_hr_documentos_exigidos(uuid) to authenticated;
grant execute on function public.fn_roles_permisos_validos(integer[]) to authenticated;

alter function public.save_user_notification_preferences(uuid, text, boolean, text[], time, time) reset search_path;
alter function public.get_user_notification_preferences(uuid, text) reset search_path;
alter function public.increment_fragment_usage(uuid[]) reset search_path;
alter function public.increment_quick_reply_usage(uuid) reset search_path;
alter function public.expire_old_notifications() reset search_path;
alter function public.fn_check_periodic_notifications() reset search_path;
alter function public.check_user_can_insert_product_image() reset search_path;
alter function public.fn_create_org_notification(integer, uuid, text, text, text, text, jsonb) reset search_path;
alter function public.get_user_permissions(uuid, integer) reset search_path;
alter function public.get_user_permissions_with_precedence(uuid, integer) reset search_path;
alter function public.auto_close_inactive_conversations() reset search_path;
alter function public.cleanup_temporary_members() reset search_path;
alter function public.complete_invitation_registration(text, uuid, text, text, text, text, text) reset search_path;
alter function public.direct_update_opportunity(uuid, uuid, text) reset search_path;
alter function public.direct_update_opportunity_bypass(uuid, uuid, text) reset search_path;
alter function public.fix_update_opportunity_stage(uuid, uuid, text) reset search_path;
alter function public.update_opportunity_stage_safe(uuid, uuid, text) reset search_path;
alter function public.update_opportunity_stage_without_refresh(uuid, uuid) reset search_path;
alter function public.fn_apply_conversation_tag(uuid, text, text) reset search_path;
alter function public.fn_auto_tag_conversation() reset search_path;
alter function public.fn_campaign_mark_bounced(uuid, uuid) reset search_path;
alter function public.fn_campaign_mark_clicked(uuid, uuid) reset search_path;
alter function public.fn_campaign_mark_opened(uuid, uuid) reset search_path;
alter function public.fn_campaign_mark_replied(uuid, uuid) reset search_path;
alter function public.fn_campaign_mark_sent(uuid, uuid) reset search_path;
alter function public.fn_get_campaign_metrics(uuid) reset search_path;
alter function public.fn_get_conversation_for_summary(uuid) reset search_path;
alter function public.fn_save_conversation_summary(uuid, text, text[], text) reset search_path;
alter function public.get_conversation_stats(integer, timestamptz, timestamptz) reset search_path;
alter function public.mark_conversation_messages_as_read(uuid, bigint) reset search_path;
alter function public.fn_notify_calendar_event() reset search_path;
alter function public.fn_notify_calendar_event_cancelled() reset search_path;
alter function public.fn_notify_new_member() reset search_path;
alter function public.fn_notify_opportunity_changed() reset search_path;
alter function public.fn_notify_reservation_created() reset search_path;
alter function public.fn_notify_reservation_status() reset search_path;
alter function public.fn_notify_role_changed() reset search_path;
alter function public.fn_notify_stock_low() reset search_path;
alter function public.fn_notify_subscription_changed() reset search_path;
alter function public.fn_notify_task_assigned() reset search_path;
alter function public.fn_sync_address_to_customer() reset search_path;
alter function public.fn_sync_customer_to_address() reset search_path;
alter function public.fn_track_conversation_assignment() reset search_path;
alter function public.fn_track_conversation_status_change() reset search_path;
alter function public.notify_push() reset search_path;
alter function public.notify_waiter_on_ticket_ready() reset search_path;
alter function public.prepare_invitation_email(text, integer, integer, text) reset search_path;
alter function public.send_invitation_email(text, integer, integer, text) reset search_path;
alter function public.refresh_mv_crm_forecast_safely() reset search_path;
alter function public.reset_user_password(uuid, text) reset search_path;
alter function public.update_customer_avatar() reset search_path;
alter function public.validate_invitation_by_code(text) reset search_path;
