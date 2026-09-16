-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_01_reconciliacion_checks_columnas`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 ca5c790f9b2774f8e34a0871d4f8dc29). No reformatear.
-- M1: reconciliación de CHECKs y columnas (idempotente, aditivo)

-- call_recordings.updated_at + trigger (set_updated_at() existe)
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_call_recordings_updated_at ON public.call_recordings;
CREATE TRIGGER set_call_recordings_updated_at BEFORE UPDATE ON public.call_recordings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- call_recordings.status: se re-declara como contrato (mismos valores)
ALTER TABLE public.call_recordings DROP CONSTRAINT IF EXISTS call_recordings_status_check;
ALTER TABLE public.call_recordings ADD CONSTRAINT call_recordings_status_check
  CHECK (status IN ('processing','ready','failed','deleted'));

-- call_analyses.sentiment + mixed
ALTER TABLE public.call_analyses DROP CONSTRAINT IF EXISTS call_analyses_sentiment_check;
ALTER TABLE public.call_analyses ADD CONSTRAINT call_analyses_sentiment_check
  CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','mixed'));

-- activities.activity_type ampliado
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_activity_type_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_activity_type_check
  CHECK (activity_type IN ('call','email','whatsapp','sms','meeting','visit','note','system','ai_call','task'));

-- activities: FKs a fuentes del timeline
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS activities_call_id_idx ON public.activities(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_email_message_id_idx ON public.activities(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_message_id_idx ON public.activities(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_conversation_id_idx ON public.activities(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_org_related_occurred_idx ON public.activities(organization_id, related_type, related_id, occurred_at DESC);

-- messages.related_opportunity_id
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS related_opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_related_opportunity ON public.messages(related_opportunity_id, created_at DESC)
  WHERE related_opportunity_id IS NOT NULL;

-- customers.timezone
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota';

-- voice_agents.purpose_type + sell_product, book_meeting
ALTER TABLE public.voice_agents DROP CONSTRAINT IF EXISTS voice_agents_purpose_type_check;
ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_purpose_type_check
  CHECK (purpose_type IN ('qualify_lead','confirm_demo','follow_up_proposal','reactivate_cold',
    'collect_payment','nps_survey','renewal_reminder','sell_product','book_meeting','custom'));

-- templates: bloques + engine + version + preheader
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS blocks_json jsonb,
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'html',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preheader text;
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_engine_check;
ALTER TABLE public.templates ADD CONSTRAINT templates_engine_check CHECK (engine IN ('blocks','html','react'));
CREATE INDEX IF NOT EXISTS templates_org_channel_idx ON public.templates(organization_id, channel, is_active);

-- conversations.last_inbound_at (para la ventana 24h de WhatsApp) + backfill desde messages inbound
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;
UPDATE public.conversations c
   SET last_inbound_at = m.max_created
  FROM (SELECT conversation_id, max(created_at) AS max_created
          FROM public.messages WHERE direction = 'inbound' GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id AND c.last_inbound_at IS NULL;
CREATE INDEX IF NOT EXISTS conversations_last_inbound_at_idx ON public.conversations(organization_id, last_inbound_at DESC)
  WHERE last_inbound_at IS NOT NULL;

-- mantener last_inbound_at al vuelo (trigger ligero, no toca el trigger existente update_conversation_last_message)
CREATE OR REPLACE FUNCTION public.fn_messages_set_last_inbound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, NEW.created_at), NEW.created_at)
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_messages_set_last_inbound ON public.messages;
CREATE TRIGGER trg_messages_set_last_inbound AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_messages_set_last_inbound();