-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_11_advisors_trigger_fn_grants_fk_indexes`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 922cd8e5ffaeea815f71a5113b1ffe55). No reformatear.
-- Hallazgos de get_advisors (security): funciones trigger SECURITY DEFINER no deben ser ejecutables vía /rest/v1/rpc
REVOKE ALL ON FUNCTION public.fn_messages_set_last_inbound() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_opp_created_enqueue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_opp_stage_change_enqueue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_seed_provider_configs_on_org() FROM PUBLIC, anon, authenticated;
-- fn_unit_cost / fn_crm_cron_post / fn_seed_provider_configs ya restringidas; fn_can_contact es intencionalmente ejecutable por authenticated

-- Hallazgos de get_advisors (performance): FKs sin índice en tablas nuevas/CRM (tablas con 0 filas; coste nulo)
CREATE INDEX IF NOT EXISTS user_comm_preferences_user_id_idx ON public.user_comm_preferences(user_id);
CREATE INDEX IF NOT EXISTS user_comm_preferences_default_caller_id_idx ON public.user_comm_preferences(default_caller_id_id) WHERE default_caller_id_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS call_recordings_call_id_idx ON public.call_recordings(call_id);
CREATE INDEX IF NOT EXISTS call_analyses_call_id_idx ON public.call_analyses(call_id);
CREATE INDEX IF NOT EXISTS call_analyses_transcript_id_idx ON public.call_analyses(transcript_id) WHERE transcript_id IS NOT NULL;