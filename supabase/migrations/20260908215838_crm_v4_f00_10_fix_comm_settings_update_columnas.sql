-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_10_fix_comm_settings_update_columnas`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 019534068063129390cc6bb64c69157d). No reformatear.
-- Corrección: el GRANT de tabla UPDATE previo seguía vigente; se revoca a nivel tabla y se concede solo por columnas.
REVOKE UPDATE ON public.comm_settings FROM authenticated;
GRANT UPDATE (phone_number, whatsapp_number, voice_agent_enabled, voice_agent_config, is_active, voice_twiml_app_sid,
  voice_recording_enabled, voice_recording_retention_days, voice_consent_message, voice_caller_id, voice_ring_timeout_seconds,
  voice_max_concurrent_calls, updated_at) ON public.comm_settings TO authenticated;