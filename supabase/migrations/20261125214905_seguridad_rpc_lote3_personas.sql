-- GO-seguridad 2026-11-25 · Lote 3 de la auditoría de SECURITY DEFINER por módulos: DATOS DE
-- CLIENTES Y PERSONAS (clientes, CRM, campañas, teléfono, chat, notificaciones, HRM, miembros y
-- roles, domiciliarios). Método y formato de 20261125210126_seguridad_rpc_pedidos_web.
--
-- Revisadas las SECURITY DEFINER del dominio que ejecuta authenticated. Las de clientes, CRM,
-- campañas, teléfono, HRM, miembros, roles y logística delegan en guardas que rechazan a quien no
-- es miembro (fn_clientes_exigir_permiso, fn_crm_exigir_permiso, crm_campaign_read_context,
-- fn_phone_assert_actor_core, fn_rol_exigir, fn_miembro_gestion_guarda, fn_hr_actor_puede_empleo,
-- fn_logistica_envio_bloquear, fn_lista_precios_exigir_miembro…) y cargan el registro por id
-- para validar SU organización (revisadas las que reciben uuid: aprobaciones y cambios de HRM,
-- colillas de nómina, miembros, cuadres de domiciliarios, reservas, mesas). Quedaban:
--
--   1. save_user_notification_preferences(usuario, …): sin guarda. Cualquier sesión cambiaba las
--      preferencias de notificación de CUALQUIER usuario (silenciarle un canal, horario de no
--      molestar). get_user_notification_preferences leía las de cualquiera. Ningún consumidor las
--      llama (grep en los 5 repositorios y Edge Functions; logs de 24 h: 0). → solo service_role.
--   2. increment_fragment_usage / increment_quick_reply_usage: sin guarda, sumaban uso a
--      fragmentos de conocimiento y respuestas rápidas de cualquier organización. Nadie las llama.
--      → solo service_role.
--   3. expire_old_notifications() y fn_check_periodic_notifications(): trabajos globales (todas las
--      organizaciones) con EXECUTE para cualquier sesión. El primero lo llama
--      /api/cron/expire-old-notifications con service_role; el segundo, nadie. → solo service_role.
--   4. fn_hr_documentos_exigidos y fn_roles_permisos_validos: ayudantes internos sin guarda que
--      solo llaman otras SECURITY DEFINER. → solo service_role.
--   5. search_path fijo en las SECURITY DEFINER del dominio que no lo tenían. Excluidas a
--      propósito: check_user_permission (la evalúan 21 políticas RLS fila a fila; un SET por
--      llamada encarece cada consulta), search_knowledge_fragments (usa el tipo y el operador de
--      vector del esquema extensions) y create_user_fallback (crypt/gen_salt de extensions).
--
-- Anotado para otro lote: check_user_permission, get_user_permissions y
-- get_user_permissions_with_precedence responden por cualquier usuario y organización (dicen qué
-- permisos tiene otra persona). La guarda cambia la ruta caliente de las políticas y de las
-- funciones que preguntan por un tercero (aprobaciones); necesita su propia prueba de rendimiento.
--
-- Ojo: CREATE OR REPLACE de cualquiera de estas sin cláusula SET borra el search_path que fija
-- esta migración. Quien las redefina, que lleve SET search_path TO 'public', 'pg_temp'.

-- 1-4 · Solo service_role
revoke all on function public.save_user_notification_preferences(uuid, text, boolean, text[], time, time) from public, anon, authenticated;
revoke all on function public.get_user_notification_preferences(uuid, text) from public, anon, authenticated;
revoke all on function public.increment_fragment_usage(uuid[]) from public, anon, authenticated;
revoke all on function public.increment_quick_reply_usage(uuid) from public, anon, authenticated;
revoke all on function public.expire_old_notifications() from public, anon, authenticated;
revoke all on function public.fn_check_periodic_notifications() from public, anon, authenticated;
revoke all on function public.fn_hr_documentos_exigidos(uuid) from public, anon, authenticated;
revoke all on function public.fn_roles_permisos_validos(integer[]) from public, anon, authenticated;
grant execute on function public.save_user_notification_preferences(uuid, text, boolean, text[], time, time) to service_role;
grant execute on function public.get_user_notification_preferences(uuid, text) to service_role;
grant execute on function public.increment_fragment_usage(uuid[]) to service_role;
grant execute on function public.increment_quick_reply_usage(uuid) to service_role;
grant execute on function public.expire_old_notifications() to service_role;
grant execute on function public.fn_check_periodic_notifications() to service_role;
grant execute on function public.fn_hr_documentos_exigidos(uuid) to service_role;
grant execute on function public.fn_roles_permisos_validos(integer[]) to service_role;

-- 5 · search_path fijo
alter function public.save_user_notification_preferences(uuid, text, boolean, text[], time, time) set search_path to 'public', 'pg_temp';
alter function public.get_user_notification_preferences(uuid, text) set search_path to 'public', 'pg_temp';
alter function public.increment_fragment_usage(uuid[]) set search_path to 'public', 'pg_temp';
alter function public.increment_quick_reply_usage(uuid) set search_path to 'public', 'pg_temp';
alter function public.expire_old_notifications() set search_path to 'public', 'pg_temp';
alter function public.fn_check_periodic_notifications() set search_path to 'public', 'pg_temp';
alter function public.check_user_can_insert_product_image() set search_path to 'public', 'pg_temp';
alter function public.fn_create_org_notification(integer, uuid, text, text, text, text, jsonb) set search_path to 'public', 'pg_temp';
alter function public.get_user_permissions(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.get_user_permissions_with_precedence(uuid, integer) set search_path to 'public', 'pg_temp';
alter function public.auto_close_inactive_conversations() set search_path to 'public', 'pg_temp';
alter function public.cleanup_temporary_members() set search_path to 'public', 'pg_temp';
alter function public.complete_invitation_registration(text, uuid, text, text, text, text, text) set search_path to 'public', 'pg_temp';
alter function public.direct_update_opportunity(uuid, uuid, text) set search_path to 'public', 'pg_temp';
alter function public.direct_update_opportunity_bypass(uuid, uuid, text) set search_path to 'public', 'pg_temp';
alter function public.fix_update_opportunity_stage(uuid, uuid, text) set search_path to 'public', 'pg_temp';
alter function public.update_opportunity_stage_safe(uuid, uuid, text) set search_path to 'public', 'pg_temp';
alter function public.update_opportunity_stage_without_refresh(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_apply_conversation_tag(uuid, text, text) set search_path to 'public', 'pg_temp';
alter function public.fn_auto_tag_conversation() set search_path to 'public', 'pg_temp';
alter function public.fn_campaign_mark_bounced(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_campaign_mark_clicked(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_campaign_mark_opened(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_campaign_mark_replied(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_campaign_mark_sent(uuid, uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_get_campaign_metrics(uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_get_conversation_for_summary(uuid) set search_path to 'public', 'pg_temp';
alter function public.fn_save_conversation_summary(uuid, text, text[], text) set search_path to 'public', 'pg_temp';
alter function public.get_conversation_stats(integer, timestamptz, timestamptz) set search_path to 'public', 'pg_temp';
alter function public.mark_conversation_messages_as_read(uuid, bigint) set search_path to 'public', 'pg_temp';
alter function public.fn_notify_calendar_event() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_calendar_event_cancelled() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_new_member() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_opportunity_changed() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_reservation_created() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_reservation_status() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_role_changed() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_stock_low() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_subscription_changed() set search_path to 'public', 'pg_temp';
alter function public.fn_notify_task_assigned() set search_path to 'public', 'pg_temp';
alter function public.fn_sync_address_to_customer() set search_path to 'public', 'pg_temp';
alter function public.fn_sync_customer_to_address() set search_path to 'public', 'pg_temp';
alter function public.fn_track_conversation_assignment() set search_path to 'public', 'pg_temp';
alter function public.fn_track_conversation_status_change() set search_path to 'public', 'pg_temp';
alter function public.notify_push() set search_path to 'public', 'pg_temp';
alter function public.notify_waiter_on_ticket_ready() set search_path to 'public', 'pg_temp';
alter function public.prepare_invitation_email(text, integer, integer, text) set search_path to 'public', 'pg_temp';
alter function public.send_invitation_email(text, integer, integer, text) set search_path to 'public', 'pg_temp';
alter function public.refresh_mv_crm_forecast_safely() set search_path to 'public', 'pg_temp';
alter function public.reset_user_password(uuid, text) set search_path to 'public', 'pg_temp';
alter function public.update_customer_avatar() set search_path to 'public', 'pg_temp';
alter function public.validate_invitation_by_code(text) set search_path to 'public', 'pg_temp';
