-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_02_stage_agents_voices_tool_runs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 a915d6926c2216bb3df0b11dbf525e5a). No reformatear.
-- FASE 06 · F6-15/F6-16: configuracion del agente POR ETAPA del embudo, catalogo de voces
-- (voz clonada del vendedor) y trazabilidad de herramientas ejecutadas por el agente.

-- ─── voices ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider            text NOT NULL DEFAULT 'elevenlabs'
                        CHECK (provider IN ('elevenlabs','google','amazon','twilio')),
  provider_voice_id   text NOT NULL,
  name                text NOT NULL,
  description         text,
  owner_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind                text NOT NULL DEFAULT 'library'
                        CHECK (kind IN ('library','cloned','designed')),
  language            text NOT NULL DEFAULT 'es',
  model_id            text NOT NULL DEFAULT 'eleven_flash_v2_5',
  sample_path         text,
  consent_recorded_at timestamptz,
  consent_evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default          boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voices_org_provider_voice_key UNIQUE (organization_id, provider, provider_voice_id),
  CONSTRAINT voices_cloned_requires_consent
    CHECK (kind <> 'cloned' OR consent_recorded_at IS NOT NULL)
);

COMMENT ON CONSTRAINT voices_cloned_requires_consent ON public.voices IS
  'D9 (Colombia): no se clona la voz de un tercero. Una voz clonada exige consentimiento registrado.';

CREATE INDEX IF NOT EXISTS idx_voices_org ON public.voices (organization_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voices_one_default_per_org
  ON public.voices (organization_id) WHERE is_default = true;

ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voices_select ON public.voices;
CREATE POLICY voices_select ON public.voices FOR SELECT
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS voices_insert ON public.voices;
CREATE POLICY voices_insert ON public.voices FOR INSERT
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS voices_update ON public.voices;
CREATE POLICY voices_update ON public.voices FOR UPDATE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS voices_delete ON public.voices;
CREATE POLICY voices_delete ON public.voices FOR DELETE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));

-- ─── stage_agents: que hace el agente al llamar, POR ETAPA ────────────────
CREATE TABLE IF NOT EXISTS public.stage_agents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id         uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  voice_agent_id   uuid REFERENCES public.voice_agents(id) ON DELETE SET NULL,
  channel          text NOT NULL DEFAULT 'voice'
                     CHECK (channel IN ('voice','email','whatsapp','multi')),
  objective        text NOT NULL
                     CHECK (objective IN ('sell_product','book_meeting','qualify_lead',
                                          'recover_cart','confirm_demo','follow_up_proposal',
                                          'collect_payment','reactivate_cold','nps_survey',
                                          'renewal_reminder','custom')),
  objective_prompt text,
  product_id       integer REFERENCES public.products(id) ON DELETE SET NULL,
  offer            jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_on       text NOT NULL DEFAULT 'manual'
                     CHECK (trigger_on IN ('enter','sla_breach','no_response_days','manual')),
  trigger_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_tools    text[] NOT NULL DEFAULT '{}'::text[],
  action_policy    text NOT NULL DEFAULT 'suggest' CHECK (action_policy IN ('auto','suggest')),
  max_attempts     integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 10),
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_agents_stage_channel_key UNIQUE (stage_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_stage_agents_org ON public.stage_agents (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stage_agents_stage ON public.stage_agents (stage_id);

ALTER TABLE public.stage_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_agents_select ON public.stage_agents;
CREATE POLICY stage_agents_select ON public.stage_agents FOR SELECT
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS stage_agents_insert ON public.stage_agents;
CREATE POLICY stage_agents_insert ON public.stage_agents FOR INSERT
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS stage_agents_update ON public.stage_agents;
CREATE POLICY stage_agents_update ON public.stage_agents FOR UPDATE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS stage_agents_delete ON public.stage_agents;
CREATE POLICY stage_agents_delete ON public.stage_agents FOR DELETE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));

-- ─── voice_agent_tool_runs: cada herramienta ejecutada por el agente ──────
CREATE TABLE IF NOT EXISTS public.voice_agent_tool_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  voice_agent_call_id  uuid REFERENCES public.voice_agent_calls(id) ON DELETE CASCADE,
  tool                 text NOT NULL,
  args                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  result               jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'applied'
                         CHECK (status IN ('applied','suggested','denied','failed')),
  error_message        text,
  applied_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vatr_org_call
  ON public.voice_agent_tool_runs (organization_id, voice_agent_call_id);

ALTER TABLE public.voice_agent_tool_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vatr_select ON public.voice_agent_tool_runs;
CREATE POLICY vatr_select ON public.voice_agent_tool_runs FOR SELECT
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS vatr_insert ON public.voice_agent_tool_runs;
CREATE POLICY vatr_insert ON public.voice_agent_tool_runs FOR INSERT
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS vatr_update ON public.voice_agent_tool_runs;
CREATE POLICY vatr_update ON public.voice_agent_tool_runs FOR UPDATE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                  WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS vatr_delete ON public.voice_agent_tool_runs;
CREATE POLICY vatr_delete ON public.voice_agent_tool_runs FOR DELETE
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));