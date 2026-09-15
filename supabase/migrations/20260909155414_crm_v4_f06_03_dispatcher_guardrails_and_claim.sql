-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_03_dispatcher_guardrails_and_claim`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 dd4ed3fc749d1494f37ea10ceb9a0cad). No reformatear.
-- FASE 06 · F6-06/F6-07/F6-18: topes reales de marcacion, claim atomico de la cola
-- y correlacion CallSid <-> voice_agent_calls.

-- ─── voice_agent_calls: correlacion, reintentos y claim ──────────────────
ALTER TABLE public.voice_agent_calls
  ADD COLUMN IF NOT EXISTS provider_call_sid text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_agent_id uuid REFERENCES public.stage_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS consent_given boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_error_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vac_provider_sid
  ON public.voice_agent_calls (provider_call_sid) WHERE provider_call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vac_campaign_created
  ON public.voice_agent_calls (campaign_id, created_at DESC);

-- Estados que la maquina real necesita (F6 §2.2). Se conservan los 5 previos.
ALTER TABLE public.voice_agent_calls DROP CONSTRAINT IF EXISTS voice_agent_calls_status_check;
ALTER TABLE public.voice_agent_calls ADD CONSTRAINT voice_agent_calls_status_check
  CHECK (status = ANY (ARRAY['pending','queued','in_progress','completed','failed',
                             'transferred','no_answer','voicemail','canceled','skipped']));

-- ─── voice_agent_campaigns: segunda barrera independiente del conteo ─────
ALTER TABLE public.voice_agent_campaigns
  ADD COLUMN IF NOT EXISTS max_calls_per_hour integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS emergency_stop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stopped_reason text,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.voice_agent_campaigns DROP CONSTRAINT IF EXISTS voice_agent_campaigns_hourly_cap_check;
ALTER TABLE public.voice_agent_campaigns ADD CONSTRAINT voice_agent_campaigns_hourly_cap_check
  CHECK (max_calls_per_hour BETWEEN 1 AND 500);

COMMENT ON COLUMN public.voice_agent_campaigns.emergency_stop IS
  'F6: parada de emergencia. Con true el despachador no marca aunque status=running.';

-- ─── voice_agents: identificacion obligatoria como IA y voz del catalogo ─
ALTER TABLE public.voice_agents
  ADD COLUMN IF NOT EXISTS identity_disclosure text,
  ADD COLUMN IF NOT EXISTS voice_ref_id uuid REFERENCES public.voices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.voice_agents.identity_disclosure IS
  'D9: frase con la que el agente se identifica como asistente virtual. Si es NULL el runtime usa la frase por defecto; NUNCA se omite.';

-- ─── Claim atomico: una fila pending -> in_progress, sin carreras ────────
-- Reserva ANTES de marcar. Cualquier intento (aunque falle) queda en 'in_progress'
-- primero, de modo que consume cuota diaria y horaria.
CREATE OR REPLACE FUNCTION public.fn_claim_voice_agent_calls(
  p_org integer,
  p_campaign uuid,
  p_limit integer,
  p_worker text
) RETURNS SETOF public.voice_agent_calls
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT vac.id
      FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org
       AND vac.campaign_id = p_campaign
       AND vac.status IN ('pending','queued')
       AND (vac.scheduled_at IS NULL OR vac.scheduled_at <= now())
     ORDER BY vac.scheduled_at NULLS FIRST, vac.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.voice_agent_calls v
     SET status = 'in_progress',
         claimed_at = now(),
         locked_by = p_worker,
         attempts = v.attempts + 1,
         updated_at = now()
    FROM candidatos c
   WHERE v.id = c.id
  RETURNING v.*;
END $function$;

REVOKE ALL ON FUNCTION public.fn_claim_voice_agent_calls(integer, uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_claim_voice_agent_calls(integer, uuid, integer, text) TO service_role;

-- ─── Parada de emergencia desde el propio despachador ────────────────────
CREATE OR REPLACE FUNCTION public.fn_stop_voice_campaign(
  p_org integer,
  p_campaign uuid,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.voice_agent_campaigns
     SET emergency_stop = true, status = 'paused',
         stopped_reason = p_reason, stopped_at = now(), updated_at = now()
   WHERE id = p_campaign AND organization_id = p_org;
  RETURN FOUND;
END $function$;

REVOKE ALL ON FUNCTION public.fn_stop_voice_campaign(integer, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_stop_voice_campaign(integer, uuid, text) TO authenticated, service_role;