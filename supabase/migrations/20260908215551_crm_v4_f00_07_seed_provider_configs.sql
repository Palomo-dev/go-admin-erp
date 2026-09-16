-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_07_seed_provider_configs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 c51eb77f02ae8810ccfbdca47b771924). No reformatear.
-- M7: seed idempotente de provider_configs por org + trigger para orgs nuevas
CREATE OR REPLACE FUNCTION public.fn_seed_provider_configs(p_org integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
BEGIN
  INSERT INTO public.provider_configs (organization_id, category, provider, credentials, settings, is_active, priority) VALUES
    (p_org,'voice','twilio','{}'::jsonb,'{"use_master_account":true,"recording_channels":"dual","consent_language":"es-MX","consent_voice":"Polly.Mia-Neural"}'::jsonb,true,10),
    (p_org,'stt','elevenlabs','{}'::jsonb,'{"model_id":"scribe_v2","language_code":"spa","diarize":true,"timestamps_granularity":"word"}'::jsonb,true,10),
    (p_org,'tts','elevenlabs','{}'::jsonb,'{"model_id":"eleven_flash_v2_5"}'::jsonb,true,10),
    (p_org,'llm','openai','{}'::jsonb,'{"model":"gpt-5.6-luna","conversation_model":"gpt-5.6-terra","cheap_model":"gpt-5.6-luna","monthly_budget_usd":50}'::jsonb,true,10),
    (p_org,'analysis','google','{}'::jsonb,'{"model":"gemini-2.5-flash"}'::jsonb,true,10),
    (p_org,'email','resend','{}'::jsonb,'{"tracking_marketing_only":true}'::jsonb,true,10),
    (p_org,'whatsapp','meta','{}'::jsonb,'{}'::jsonb,true,10),
    (p_org,'sms','twilio','{}'::jsonb,'{"advanced_opt_out":true}'::jsonb,true,10),
    (p_org,'esign','none','{}'::jsonb,'{}'::jsonb,false,100),
    (p_org,'calendar','none','{}'::jsonb,'{}'::jsonb,false,100),
    (p_org,'video','none','{}'::jsonb,'{}'::jsonb,false,100),
    (p_org,'enrichment','none','{}'::jsonb,'{}'::jsonb,false,100)
  ON CONFLICT (organization_id, category, provider) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_seed_provider_configs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_provider_configs(integer) TO service_role;

-- Orgs nuevas: trigger hermano de trg_create_default_org_structure (no se modifica esa función para no tocar nómina/departamentos).
-- Nunca bloquea la creación de la org.
CREATE OR REPLACE FUNCTION public.fn_seed_provider_configs_on_org() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.fn_seed_provider_configs(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_seed_provider_configs_on_org(%) falló: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_seed_provider_configs_on_org ON public.organizations;
CREATE TRIGGER trg_seed_provider_configs_on_org AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_seed_provider_configs_on_org();

-- Backfill: todas las orgs con comm_settings
SELECT sum(public.fn_seed_provider_configs(organization_id)) AS inserted FROM public.comm_settings;