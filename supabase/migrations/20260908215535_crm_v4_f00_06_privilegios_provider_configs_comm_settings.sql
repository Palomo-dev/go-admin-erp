-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_06_privilegios_provider_configs_comm_settings`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 0f5784c5826df0ffe3f7b7924496dd44). No reformatear.
-- M5: privilegios (tester #3)

-- provider_configs: escrituras solo por service_role (route con service role + check admin). Lectura sin la columna credentials.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.provider_configs FROM anon, authenticated;
DROP POLICY IF EXISTS provider_configs_insert ON public.provider_configs;
DROP POLICY IF EXISTS provider_configs_update ON public.provider_configs;
DROP POLICY IF EXISTS provider_configs_delete ON public.provider_configs;
REVOKE SELECT ON public.provider_configs FROM anon, authenticated;
GRANT SELECT (id, organization_id, category, provider, settings, is_active, priority, created_at, updated_at) ON public.provider_configs TO authenticated;
-- la política de SELECT existente (provider_configs_select, patrón calls) se conserva

CREATE OR REPLACE VIEW public.v_provider_configs_safe WITH (security_invoker = true) AS
  SELECT id, organization_id, category, provider, settings, is_active, priority,
         (credentials IS NOT NULL AND credentials <> '{}'::jsonb) AS has_credentials,
         created_at, updated_at
    FROM public.provider_configs;
GRANT SELECT ON public.v_provider_configs_safe TO authenticated, service_role;
REVOKE ALL ON public.v_provider_configs_safe FROM anon;

-- comm_settings: select solo miembros activos; update solo admins (is_super_admin o role_id 1 Super Admin / 2 Admin de organización)
DROP POLICY IF EXISTS comm_settings_select ON public.comm_settings;
CREATE POLICY comm_settings_select ON public.comm_settings FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS comm_settings_update ON public.comm_settings;
CREATE POLICY comm_settings_update ON public.comm_settings FOR UPDATE TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true
                             AND (om.is_super_admin = true OR om.role_id IN (1,2))))
WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                WHERE om.user_id = auth.uid() AND om.is_active = true
                                  AND (om.is_super_admin = true OR om.role_id IN (1,2))));
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.comm_settings FROM anon, authenticated;
REVOKE ALL ON public.comm_settings FROM anon;
-- token de subcuenta Twilio: oculto a authenticated (columna sensible); server usa service_role
REVOKE SELECT ON public.comm_settings FROM authenticated;
GRANT SELECT (id, organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining, twilio_subaccount_sid, phone_number,
  whatsapp_number, voice_agent_enabled, voice_agent_config, is_active, credits_reset_at, created_at, updated_at, voice_twiml_app_sid,
  voice_recording_enabled, voice_recording_retention_days, voice_consent_message, voice_caller_id, voice_ring_timeout_seconds,
  voice_max_concurrent_calls) ON public.comm_settings TO authenticated;
-- UPDATE por columnas para admins: todo menos el token
GRANT UPDATE (phone_number, whatsapp_number, voice_agent_enabled, voice_agent_config, is_active, voice_twiml_app_sid,
  voice_recording_enabled, voice_recording_retention_days, voice_consent_message, voice_caller_id, voice_ring_timeout_seconds,
  voice_max_concurrent_calls, updated_at) ON public.comm_settings TO authenticated;
REVOKE UPDATE (twilio_subaccount_auth_token, twilio_subaccount_sid, sms_remaining, whatsapp_remaining, voice_minutes_remaining, credits_reset_at) ON public.comm_settings FROM authenticated;

-- channel_credentials: NO se revoca SELECT todavía (chatChannelsService.ts:192-197,236-241 y WhatsAppCredentialsCard lo leen con anon) → pendiente F16.
-- Se elimina el acceso de anon (no hay flujo público que lo requiera).
REVOKE ALL ON public.channel_credentials FROM anon;