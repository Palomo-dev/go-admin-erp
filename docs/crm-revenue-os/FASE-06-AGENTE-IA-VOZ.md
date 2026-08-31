# FASE 06 — Agente de IA de voz con propósito

> Proyecto Supabase: `jgmgphmzusbluqhuqhij`
> Depende de: F3 (infra de voz, `calls`), F4 (transcripción/análisis pipeline)
> Bloquea: — (F8 no depende de F6 directamente)

---

## 0. Objetivo y alcance

**Qué resuelve:** el requisito del dueño: *"quisiera también que uno pudiera asignarle a un agente de IA llamadas con un propósito, y que el agente, según el pipeline, las actividades y el propósito, haga las llamadas y pase la oportunidad o al cliente de estado en el pipeline."* Y: voces personalizadas y muy humanas con ElevenLabs.

**Qué NO entra:** transcripción/análisis post-llamada (F4 ya lo hace — el agente reusa ese pipeline), softphone humano (F3).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `conversationRelayHandler.ts` | ✅ **Activo** — WS handler de ConversationRelay (STT/TTS Twilio + OpenAI Chat + function calling) | `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` |
| `voiceAgentTools.ts` | ✅ Tools del agente (12 KB) | `src/lib/services/integrations/twilio/voiceAgent/voiceAgentTools.ts` |
| `voiceAgentService.ts` | 🟡 Orquestador con Media Stream (no es el flujo activo) | `src/lib/services/integrations/twilio/voiceAgent/voiceAgentService.ts` |
| `voiceAgentPrompts.ts` | ✅ | `src/lib/services/integrations/twilio/voiceAgent/voiceAgentPrompts.ts` |
| `realtimeSession.ts` | 🟡 OpenAI Realtime — escrito, no cableado (F0 marca `// F6: cablear`) | `src/lib/services/integrations/twilio/voiceAgent/realtimeSession.ts` |
| `elevenLabsTTS.ts` | 🟡 escrito, no cableado (F0 marca `// F6: cablear`) | `src/lib/services/integrations/twilio/voiceAgent/elevenLabsTTS.ts` |
| `deepgramSTT.ts` | 🟡 escrito, no cableado (F0 marca `// F4: cablear`) | `src/lib/services/integrations/twilio/voiceAgent/deepgramSTT.ts` |
| `ws-server.ts` | ✅ levanta WS `/conversation-relay` | raíz |
| `scripts/test-conversation-relay.ts` | ✅ script de prueba | raíz |
| `/api/integrations/twilio/voice/incoming` | ✅ enruta entrantes a ConversationRelay | `src/app/api/integrations/twilio/voice/incoming/route.ts` |
| `comm_settings.voice_agent_enabled` + `voice_agent_config` | ✅ existen | BD |
| `stageGateService.ts` | ✅ (F2 lo extiende) | `src/lib/services/crm/stageGateService.ts` |
| `followupService.ts` | ✅ | `src/lib/services/crm/followupService.ts` |
| `aiCreditsService.ts` | ✅ | `src/lib/services/aiCreditsService.ts` |
| Agente saliente con propósito | ❌ | — |
| Cola de llamadas del agente | ❌ | — |
| `voice_agents` / `voice_agent_calls` / `voice_agent_runs` | ❌ | — |
| Motor de contexto | ❌ | — |
| Voces personalizadas UI | ❌ | — |

**Solo funciona para llamadas ENTRANTES.** No hay agente saliente, ni cola con propósito, ni persistencia de la conversación de voz.

---

## 2. Arquitectura

```
┌─ Configuración del agente (UI) ─────────────────────────────┐
│  Propósito: confirmar asistencia a demo                      │
│  Motor: ConversationRelay (default)                          │
│  Voz: ElevenLabs (clonada) / Google neural es-CO             │
│  Tools: [move_stage] [create_task] [send_whatsapp] ...       │
│  Guardarraíles: no prometer descuentos, escalar si negativa  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Campaña (UI) ──────────────────────────────────────────────┐
│  Audiencia: pipeline_stage='Demo realizada' + sin respuesta  │
│  Schedule: lun-vie 9-18, timezone America/Bogota             │
│  Max: 50 llamadas/día, 3 concurrentes                        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Despachador (cron) ────────────────────────────────────────┐
│  /api/voice/agents/run-queue (CRON_SECRET)                   │
│  → respeta schedule, max_concurrent, max_calls_per_day       │
│  → respeta saldo de créditos                                 │
│  → respeta horario local del cliente                         │
│  → respeta do_not_call list                                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Llamada saliente ──────────────────────────────────────────┐
│  client.calls.create({ to: customer, from: orgNumber,        │
│    url: '/api/voice/twiml/ai-agent?agentId=X&callId=Y' })    │
│  → INSERT calls (mode='ai_agent', voice_agent_id=X)          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ TwiML → <Connect><ConversationRelay> ──────────────────────┐
│  url: wss://app.goadmin.io/conversation-relay                │
│  → ws-server.ts → conversationRelayHandler.ts                │
│  → ContextBuilder arma el contexto de la org                 │
│  → OpenAI Chat con tools + system prompt                     │
│  → TTS: ElevenLabs (play) o Google neural                    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Tools (function calling) ──────────────────────────────────┐
│  move_opportunity_stage → respeta stageGateService           │
│  create_task → INSERT tasks                                  │
│  send_followup_message → F7/F8                               │
│  transfer_to_human → <Dial> a agente humano                  │
│  ... (ver §5.3)                                               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Post-llamada ──────────────────────────────────────────────┐
│  StatusCallback → UPDATE calls                               │
│  RecordingStatusCallback → F4 transcribe + analyze           │
│  → voice_agent_calls.outcome = analysis result               │
│  → voice_agent_runs persiste la conversación                 │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Comparativa de los 4 motores

| Motor | Latencia | Voz español | Costo/min | Esfuerzo | Barge-in | Madurez | Recomendación |
|---|---|---|---|---|---|---|---|
| **ConversationRelay** | ~300ms | Google/Amazon neural ✅ | $0.015 (Twilio) + LLM | Bajo (ya existe) | ✅ | Alta | **Default** |
| **ElevenLabs Agent** | ~500ms | ElevenLabs (mejor) ✅ | $0.015 + $0.08 (Eleven) | Medio | ✅ | Media | Cuando se necesita voz premium |
| **OpenAI Realtime** | ~200ms | OpenAI TTS ⚠️ | $0.06 (audio) + LLM | Alto (cablear `realtimeSession.ts`) | ✅ | Media | Cuando se necesita latencia mínima |
| **Gemini Live** | ~400ms | Gemini TTS ⚠️ | $0.07 (audio) + LLM | Alto (resample mulaw↔PCM) | ✅ | Baja | Experimental |

> **Limitación documentada de ConversationRelay + ElevenLabs:** `ttsProvider="ElevenLabs"` está documentado con `language="en-US"`. Para español: usar `ttsProvider="Google"` con voz neural es-CO/es-MX, **o** enviar audio propio con mensajes `play` generados por ElevenLabs (`output_format=ulaw_8000`).

---

## 4. Base de datos

### 4.1 Migraciones

#### Migración 1 — `voice_agents`

```sql
CREATE TABLE voice_agents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  engine text NOT NULL DEFAULT 'conversation_relay' CHECK (engine IN (
    'conversation_relay','elevenlabs_agent','openai_realtime','gemini_live'
  )),
  purpose_type text NOT NULL CHECK (purpose_type IN (
    'qualify_lead','confirm_demo','follow_up_proposal','reactivate_cold',
    'collect_payment','nps_survey','renewal_reminder','custom'
  )),
  system_prompt text NOT NULL,
  first_message text NOT NULL,
  voice_provider text NOT NULL DEFAULT 'google',
  voice_id text,
  voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  language text NOT NULL DEFAULT 'es-CO',
  stt_provider text NOT NULL DEFAULT 'twilio',
  llm_provider text NOT NULL DEFAULT 'openai',
  llm_model text NOT NULL DEFAULT 'gpt-4o-mini',
  temperature numeric(2,1) NOT NULL DEFAULT 0.7,
  max_turns integer NOT NULL DEFAULT 20,
  max_duration_seconds integer NOT NULL DEFAULT 300,
  allowed_tools text[] NOT NULL DEFAULT '{}',
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer_to_human_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX idx_voice_agents_org ON voice_agents (organization_id, is_active);
ALTER TABLE voice_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY va_select ON voice_agents FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY va_insert ON voice_agents FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY va_update ON voice_agents FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY va_delete ON voice_agents FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — `voice_agent_campaigns` y `voice_agent_calls`

```sql
CREATE TABLE voice_agent_campaigns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  voice_agent_id bigint NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  target_source text NOT NULL CHECK (target_source IN (
    'segment','pipeline_stage','manual_list','sequence_step','followup_due'
  )),
  target_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_calls_per_day integer NOT NULL DEFAULT 50,
  max_concurrent integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','scheduled','running','paused','completed'
  )),
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vac_org ON voice_agent_campaigns (organization_id, status);
ALTER TABLE voice_agent_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY vac_select ON voice_agent_campaigns FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY vac_insert ON voice_agent_campaigns FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY vac_update ON voice_agent_campaigns FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY vac_delete ON voice_agent_campaigns FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE voice_agent_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id bigint REFERENCES voice_agent_campaigns(id) ON DELETE CASCADE,
  voice_agent_id bigint NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  call_id bigint REFERENCES calls(id) ON DELETE SET NULL,
  customer_id integer,
  opportunity_id uuid,
  purpose_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','dialing','in_progress','completed','failed','no_answer','voicemail','skipped'
  )),
  outcome text,
  outcome_data jsonb,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacalls_org_status ON voice_agent_calls (organization_id, status, scheduled_at);
ALTER TABLE voice_agent_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY vacalls_select ON voice_agent_calls FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY vacalls_insert ON voice_agent_calls FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY vacalls_update ON voice_agent_calls FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY vacalls_delete ON voice_agent_calls FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 3 — `voice_agent_runs`

```sql
CREATE TABLE voice_agent_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  voice_agent_id bigint NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  voice_agent_call_id bigint REFERENCES voice_agent_calls(id) ON DELETE CASCADE,
  call_id bigint REFERENCES calls(id) ON DELETE CASCADE,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_invoked jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_amount numeric(10,4),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_varuns_org ON voice_agent_runs (organization_id, started_at DESC);
ALTER TABLE voice_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY varuns_select ON voice_agent_runs FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY varuns_insert ON voice_agent_runs FOR INSERT WITH CHECK (organization_id = current_org_id());
```

#### Migración 4 — Columna en `calls`

```sql
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS voice_agent_id bigint REFERENCES voice_agents(id) ON DELETE SET NULL;
```

### 4.2 Schema jsonb canónico

#### `voice_agents.system_prompt` — variables disponibles

| Variable | Descripción |
|---|---|
| `{{customer.name}}` | Nombre del cliente |
| `{{customer.company}}` | Empresa |
| `{{customer.city}}` | Ciudad |
| `{{opportunity.name}}` | Nombre de la oportunidad |
| `{{opportunity.amount}}` | Monto |
| `{{opportunity.stage_name}}` | Etapa actual |
| `{{opportunity.next_stages}}` | Etapas siguientes posibles |
| `{{opportunity.exit_criteria}}` | Criterios de salida de la etapa actual |
| `{{opportunity.score}}` | Score GOC |
| `{{opportunity.icp_band}}` | ICP band |
| `{{recent_activities}}` | Últimas N actividades |
| `{{pending_tasks}}` | Tareas pendientes |
| `{{previous_objections}}` | Objeciones previas |
| `{{last_call_summary}}` | Resumen de la última llamada (F4) |
| `{{purpose}}` | Propósito de la campaña |
| `{{organization.name}}` | Nombre de la organización |
| `{{guardrails}}` | Guardarraíles de la org |

#### `voice_agents.guardrails`

```json
{
  "forbidden_topics": ["precios de la competencia", "descuentos no autorizados"],
  "forbidden_phrases": ["te garantizo", "es gratis"],
  "no_promises_without_auth": true,
  "escalation_keywords": ["hablar con un humano", "gerente", "supervisor"],
  "max_consecutive_negative_turns": 3,
  "must_announce_ai": true,
  "must_announce_recording": true
}
```

#### `voice_agents.retry_policy`

```json
{
  "no_answer": { "delay_minutes": 240, "max_retries": 3 },
  "busy": { "delay_minutes": 30, "max_retries": 2 },
  "voicemail": { "action": "leave_message", "max_retries": 1 }
}
```

#### `voice_agents.business_hours`

```json
{
  "timezone": "America/Bogota",
  "days": ["mon","tue","wed","thu","fri"],
  "start": "09:00",
  "end": "18:00"
}
```

### 4.3 Seeds

```sql
-- Catálogo de propósitos (ya está en CHECK constraint, no necesita seed)
-- Agente de ejemplo DESACTIVADO (la org lo edita y activa)
INSERT INTO voice_agents (organization_id, name, slug, description, purpose_type,
  system_prompt, first_message, is_active)
VALUES ($org_id, 'Asistente de demo (ejemplo)', 'demo-assistant-example',
  'Confirma asistencia a demos agendadas. Ejemplo — edítalo antes de activar.',
  'confirm_demo',
  'Eres un asistente de {{organization.name}}. Tu propósito es {{purpose}}. ...',
  'Hola {{customer.name}}, te llamo de {{organization.name}} para confirmar tu demo agendada.',
  false)
ON CONFLICT (organization_id, slug) DO NOTHING;
```

### 4.4 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('voice_agents','voice_agent_campaigns','voice_agent_calls','voice_agent_runs');
-- Esperado: 4 filas, todas true
```

---

## 5. Backend

### 5.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/voice/agents` | `src/app/api/voice/agents/route.ts` | crear | GET, POST | CRUD agentes |
| `/api/voice/agents/[id]` | `src/app/api/voice/agents/[id]/route.ts` | crear | GET, PATCH, DELETE | |
| `/api/voice/agents/[id]/dispatch` | `src/app/api/voice/agents/[id]/dispatch/route.ts` | crear | POST | Encolar llamadas |
| `/api/voice/agents/[id]/simulate` | `src/app/api/voice/agents/[id]/simulate/route.ts` | crear | POST | Dry run en texto |
| `/api/voice/agents/run-queue` | `src/app/api/voice/agents/run-queue/route.ts` | crear | POST | Cron: ejecutar cola |
| `/api/voice/agents/campaigns` | `src/app/api/voice/agents/campaigns/route.ts` | crear | CRUD | Campañas |
| `/api/voice/agents/campaigns/[id]` | `src/app/api/voice/agents/campaigns/[id]/route.ts` | crear | PATCH | Pausar/reanudar |
| `/api/voice/twiml/ai-agent` | `src/app/api/voice/twiml/ai-agent/route.ts` | crear | POST | TwiML → ConversationRelay |
| `/api/voice/relay` | `ws-server.ts` (ya existe) | modificar | WS | Handler con contexto del agente |

### 5.2 Motor de contexto

```typescript
// src/lib/services/voice/agentContextBuilder.ts
export async function buildAgentContext(
  supabase: SupabaseClient,
  orgId: number,
  params: { voiceAgentCallId: number }
): Promise<AgentContext> {
  // 1. Cargar voice_agent_call + customer + opportunity
  const { data: vac } = await supabase
    .from('voice_agent_calls')
    .select('*, customers(*), opportunities(*)')
    .eq('id', params.voiceAgentCallId).single();

  // 2. Cargar etapas del pipeline con exit_criteria
  const { data: stages } = await supabase
    .from('stages').select('id, name, exit_criteria, is_won, is_lost')
    .eq('pipeline_id', vac.opportunities.pipeline_id)
    .order('position');

  // 3. Cargar últimas 5 actividades
  const { data: activities } = await supabase
    .from('activities')
    .select('activity_type, outcome, occurred_at')
    .eq('related_type', 'opportunity')
    .eq('related_id', vac.opportunity_id)
    .order('occurred_at', { ascending: false })
    .limit(5);

  // 4. Cargar objeciones previas
  const { data: objections } = await supabase
    .from('opportunity_objections')
    .select('objections(title), resolved')
    .eq('opportunity_id', vac.opportunity_id);

  // 5. Cargar última llamada + resumen (F4)
  const { data: lastCall } = await supabase
    .from('calls')
    .select('id, call_analyses(summary)')
    .eq('opportunity_id', vac.opportunity_id)
    .order('started_at', { ascending: false })
    .limit(1);

  // 6. Cargar tareas pendientes
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, due_date')
    .eq('related_type', 'opportunity')
    .eq('related_id', vac.opportunity_id)
    .is('completed_at', null);

  // 7. Construir contexto compacto (límite de tokens)
  return {
    customer: { name: vac.customers?.full_name, company: vac.customers?.company_name, city: vac.customers?.city },
    opportunity: {
      name: vac.opportunities?.name,
      amount: vac.opportunities?.amount,
      currency: vac.opportunities?.currency,
      stageName: stages?.find(s => s.id === vac.opportunities?.stage_id)?.name,
      stageExitCriteria: stages?.find(s => s.id === vac.opportunities?.stage_id)?.exit_criteria,
      nextStages: stages?.filter(s => s.position > currentStage.position && !s.is_lost),
      score: vac.opportunities?.score_total,
      icpBand: vac.opportunities?.icp_band,
    },
    recentActivities: activities || [],
    previousObjections: objections || [],
    lastCallSummary: lastCall?.[0]?.call_analyses?.[0]?.summary,
    pendingTasks: tasks || [],
    purpose: vac.purpose_context?.purpose,
    organizationName: vac.purpose_context?.orgName,
  };
}
```

> **Garantía de aislamiento:** todas las queries filtran por `organization_id` implícitamente via RLS. El contexto NUNCA incluye datos de otro cliente ni de otra organización.

### 5.3 Tools del agente

| Tool | JSON Schema (params) | Endpoint interno | Validación |
|---|---|---|---|
| `get_opportunity_context` | `{}` | `buildAgentContext()` | — |
| `move_opportunity_stage` | `{ opportunityId, targetStageId }` | `stageGateService.evaluateStageGate()` → si ok, UPDATE | Respeta gate de F2 |
| `create_task` | `{ title, dueDate, type }` | INSERT tasks | org_id del contexto |
| `create_activity` | `{ type, notes }` | INSERT activities | org_id del contexto |
| `schedule_callback` | `{ datetime }` | UPDATE opportunities.next_contact_at | — |
| `log_objection` | `{ objectionTitle, notes }` | INSERT opportunity_objections | Busca en catálogo de la org |
| `update_discovery_field` | `{ field, value }` | UPDATE opportunities.discovery_data | — |
| `mark_not_interested` | `{ reason }` | UPDATE opportunities (status='lost', loss_reason) | Usa loss_reasons de la org |
| `send_followup_message` | `{ channel, templateId }` | F7/F8 | — |
| `transfer_to_human` | `{ reason }` | `<Dial>` a agente humano | — |
| `book_meeting` | `{ datetime }` | Cal.com API (F10) | — |
| `end_call` | `{ summary }` | Cuelga via Twilio API | — |

Cada invocación se registra en `voice_agent_runs.tools_invoked`.

### 5.4 Adaptadores por motor

#### ConversationRelay (default) — español

```typescript
// Opción 1: Google neural es-CO (recomendado para español)
const twiml = `
<Response>
  <Connect>
    <ConversationRelay
      url="wss://${WS_URL}/conversation-relay"
      language="es-CO"
      ttsProvider="google"
      voice="es-CO-NeutralkVoice"
      sttProvider="google"
    />
  </Connect>
</Response>`;

// Opción 2: ElevenLabs via play (para voz clonada en español)
// ConversationRelay con ttsProvider="google" pero el handler
// intercepta los mensajes de texto y genera audio con ElevenLabs
// output_format="ulaw_8000" → envía como mensaje "play"
```

#### ElevenLabs Agent

```typescript
// Integración nativa ElevenLabs ↔ Twilio
// El agente se crea en ElevenLabs dashboard con:
// - system_prompt del voice_agents
// - first_message
// - voice_id (clonada o predefinida)
// - client tools apuntando a nuestra API
// - transfer_to_number = número de la org
// Twilio: <Connect><ConversationRelay> → ElevenLabs Agent
```

#### OpenAI Realtime

```typescript
// Cablear realtimeSession.ts (ya escrito)
// Media Streams de Twilio → OpenAI Realtime API
// STT/TTS por OpenAI; barge-in nativo
```

#### Gemini Live

```typescript
// Twilio Media Streams → resample mulaw 8kHz → PCM 16kHz
// → Gemini Live API
// ← PCM 24kHz → resample → mulaw 8kHz → Twilio
// Documentar el resample con node-web-audio-api o similar
```

### 5.5 Despachador, scheduler y reintentos

```typescript
// src/lib/services/voice/agentDispatcher.ts
export async function runQueue(supabase, orgId) {
  // 1. Obtener campañas activas (status='running')
  const { data: campaigns } = await supabase
    .from('voice_agent_campaigns')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'running');

  for (const campaign of campaigns) {
    // 2. Verificar schedule (business_hours + timezone)
    if (!isWithinBusinessHours(campaign.schedule)) continue;

    // 3. Verificar max_concurrent
    const { count: inProgress } = await supabase
      .from('voice_agent_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'in_progress');
    if (inProgress >= campaign.max_concurrent) continue;

    // 4. Verificar max_calls_per_day
    const today = new Date().toISOString().split('T')[0];
    const { count: todayCount } = await supabase
      .from('voice_agent_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .gte('created_at', today);
    if (todayCount >= campaign.max_calls_per_day) continue;

    // 5. Verificar saldo de créditos
    const credits = await aiCreditsService.getBalance(orgId);
    if (credits <= 0) continue;

    // 6. Obtener siguientes llamadas en cola
    const { data: queued } = await supabase
      .from('voice_agent_calls')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'queued')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(campaign.max_concurrent - inProgress);

    for (const vac of queued) {
      // 7. Verificar horario local del cliente
      if (!isWithinCustomerHours(vac.customer_timezone)) continue;

      // 8. Verificar do_not_call
      if (await isDoNotCall(supabase, orgId, vac.customer_id)) {
        await supabase.from('voice_agent_calls')
          .update({ status: 'skipped' }).eq('id', vac.id);
        continue;
      }

      // 9. Iniciar llamada
      await initiateAgentCall(supabase, vac);
    }
  }
}
```

### 5.6 Guardarraíles y escalamiento

```typescript
// En el handler de ConversationRelay, antes de enviar el turno al LLM:
function applyGuardrails(turn: string, agent: VoiceAgent): { blocked: boolean; reason?: string } {
  const guardrails = agent.guardrails;

  // Temas prohibidos
  if (guardrails.forbidden_topics?.some(t => turn.toLowerCase().includes(t.toLowerCase()))) {
    return { blocked: true, reason: 'forbidden_topic' };
  }

  // Frases prohibidas (en la respuesta del LLM, no del usuario)
  // Se aplica después de generar la respuesta

  // Palabras clave de escalamiento
  if (guardrails.escalation_keywords?.some(k => turn.toLowerCase().includes(k.toLowerCase()))) {
    return { blocked: true, reason: 'escalation_requested' };
  }

  return { blocked: false };
}

// Después de generar la respuesta del LLM:
function checkResponseGuardrails(response: string, agent: VoiceAgent): { blocked: boolean } {
  if (agent.guardrails.forbidden_phrases?.some(p => response.includes(p))) {
    return { blocked: true };
  }
  return { blocked: false };
}

// Si blocked → transferir a humano o responder con mensaje predefinido
```

### 5.7 Variables de entorno

| Variable | Requerida | Para qué |
|---|---|---|
| `WS_SERVER_URL` | sí | URL del WS server |
| `WS_PORT` | sí | Puerto del WS server |
| `OPENAI_API_KEY` | sí | LLM del agente |
| `OPENAI_REALTIME_MODEL` | no | Realtime API |
| `ELEVENLABS_API_KEY` | sí | TTS + voces clonadas |
| `GOOGLE_AI_API_KEY` | no | Gemini Live |
| `CRON_SECRET` | sí | Proteger run-queue |

---

## 6. UI

### 6.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/agentes-ia` | `src/app/app/crm/agentes-ia/page.tsx` | crear | Lista de agentes + campañas |
| `/app/crm/agentes-ia/[id]` | `src/app/app/crm/agentes-ia/[id]/page.tsx` | crear | Editor de agente + simulador |
| `/app/crm/agentes-ia/campaigns/[id]` | `src/app/app/crm/agentes-ia/campaigns/[id]/page.tsx` | crear | Monitor de campaña en vivo |

### 6.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/voice/agent/VoiceAgentList.tsx` | **crear** | — | Lista de agentes con estado |
| `src/components/voice/agent/VoiceAgentEditor.tsx` | **crear** | `agent?` | Editor completo |
| `src/components/voice/agent/PromptEditor.tsx` | **crear** | `prompt`, `variables[]` | Editor con insertador de variables |
| `src/components/voice/agent/VoiceSelector.tsx` | **crear** | `voiceId` | Selector de voz con preview |
| `src/components/voice/agent/ToolsSelector.tsx` | **crear** | `allowedTools` | Checkboxes de tools |
| `src/components/voice/agent/GuardrailsEditor.tsx` | **crear** | `guardrails` | Editor de guardarraíles |
| `src/components/voice/agent/CampaignEditor.tsx` | **crear** | `campaign?` | Editor de campaña |
| `src/components/voice/agent/CampaignMonitor.tsx` | **crear** | `campaignId` | Monitor en vivo |
| `src/components/voice/agent/AgentCallDetail.tsx` | **crear** | `callId` | Detalle de llamada del agente |
| `src/components/voice/agent/Simulator.tsx` | **crear** | `agentId` | Dry run en texto |

### 6.3 Wireframes

```
┌─ /app/crm/agentes-ia ────────────────────────────────────────┐
│  [+ Nuevo agente]                                             │
│                                                                │
│  Agente                    Propósito           Estado   Min/mes│
│  Asistente de demo         Confirmar demo      Activo   142    │
│  Reactivador de cold       Reactivar cold      Pausado  0      │
│  Cobrador de pagos         Cobrar pagos        Borrador —      │
│                                                                │
│  ── Campañas ──                                               │
│  [+] Campaña                Agente       Estado   Progreso     │
│  Confirmar demos sept       Demo asist.  Running  23/50       │
└────────────────────────────────────────────────────────────────┘

┌─ Editor de agente ───────────────────────────────────────────┐
│  Nombre: [Asistente de demo_____________________]            │
│  Propósito: [confirm_demo ▼]                                 │
│  Motor: [ConversationRelay ▼]                                │
│                                                                │
│  ── Prompt ──                                                 │
│  Eres un asistente de {{organization.name}}...               │
│  [Insertar variable ▼: customer.name, opportunity.stage...]  │
│                                                                │
│  ── Primer mensaje ──                                         │
│  Hola {{customer.name}}, te llamo de {{organization.name}}..│
│                                                                │
│  ── Voz ──                                                    │
│  Proveedor: [Google ▼]  Voz: [es-CO-NeutralkVoice ▼] [▶]    │
│  [Clonar voz propia →]                                        │
│                                                                │
│  ── Tools ──                                                  │
│  [☑] move_opportunity_stage  [☑] create_task                 │
│  [☑] send_followup_message   [☐] book_meeting                │
│  [☑] transfer_to_human       [☑] end_call                    │
│                                                                │
│  ── Guardarraíles ──                                          │
│  Temas prohibidos: [precios competencia] [+]                 │
│  Escalar si: [hablar con humano] [gerente] [+]               │
│  ☑ Anunciar que es IA  ☑ Anunciar grabación                  │
│                                                                │
│  ── Horarios ──                                               │
│  Lun-Vie 09:00-18:00 (America/Bogota)                        │
│                                                                │
│  [Simular (dry run)]  [Guardar]  [Activar]                    │
└────────────────────────────────────────────────────────────────┘

┌─ Monitor de campaña en vivo ────────────────────────────────┐
│  Campaña: Confirmar demos sept                                │
│  Progreso: 23/50  |  En curso: 2  |  Cola: 5                 │
│                                                                │
│  Llamada            Cliente         Estado      Outcome       │
│  #101               Rest. Corral    Completada  Confirmó      │
│  #102               Hotel Bogotá    En curso    —             │
│  #103               Ferretería S.   Cola        —             │
│  [Pausar campaña]                                            │
└────────────────────────────────────────────────────────────────┘
```

### 6.4 Animaciones Motion

```tsx
// Monitor en vivo: llamadas que aparecen con stagger
<motion.div initial="hidden" animate="visible" variants={{
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.05 } },
}}>
  {calls.map(call => (
    <motion.div key={call.id} variants={{
      hidden: { opacity: 0, x: -20 },
      visible: { opacity: 1, x: 0 },
    }}>
      <CallRow call={call} />
    </motion.div>
  ))}
</motion.div>

// Indicador "en curso" con pulso
<motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
  ● En curso
</motion.div>
```

### 6.5 Accesibilidad

- Editor de prompt con `aria-describedby` listando variables disponibles.
- Checkboxes de tools con `label` descriptivo + tooltip de qué hace cada tool.
- Monitor navegable con tab; cada fila es un `button` que abre el detalle.

---

## 7. Voces personalizadas y consentimiento

- Listar voces de la cuenta ElevenLabs: `GET /v1/voices`.
- Instant Voice Clone: `POST /v1/voice-add` con 1–5 min de audio.
- Professional Voice Clone: 30 min–3 h de audio.
- **Consentimiento verificado obligatorio** del dueño de la voz:
  - Checkbox "Confirmo que tengo el consentimiento de [nombre] para clonar su voz" + evidencia (audio del consentimiento o documento firmado).
  - Almacenar evidencia en `voice_agent_runs` o tabla de consentimientos.
- Preview con texto de prueba antes de asignar.
- Costo por caracteres visible.

---

## 8. Costos y créditos

| Componente | Costo |
|---|---|
| ConversationRelay (Twilio) | $0.015/min |
| ElevenLabs TTS | $0.18/1k chars (~$0.01/min) |
| ElevenLabs Agent | +$0.08/min |
| OpenAI gpt-4o-mini (LLM) | ~$0.0003/turno |
| Gemini 2.5 Flash (LLM) | ~$0.0001/turno |

**Costo total por llamada de 3 min (ConversationRelay + gpt-4o-mini):** ~$0.05

- Descontar de `ai_settings.credits_remaining`.
- Registrar en `ai_usage_logs` con `module='crm_voice_agent'`.
- Mostrar costo por llamada en la UI.

---

## 9. Multi-tenant y seguridad

- El prompt y el contexto se construyen SOLO con datos de la organización dueña del agente.
- `voice_agent_id` se valida: pertenece a la org del usuario.
- Whitelist de tools: el agente solo puede invocar las tools en `allowed_tools`.
- Anti-abuso: `do_not_call` list, límite de intentos, horarios.
- Las voces clonadas son por organización (API key de ElevenLabs de la org).

---

## 10. Ética, legal y calidad

- **Aviso obligatorio de IA**: el primer mensaje del agente debe indicar que es un asistente virtual (configurable pero recomendado on).
- **Aviso de grabación**: obligatorio.
- **Do-not-call list**: tabla o columna de supresión.
- **Límite de intentos**: `retry_policy.max_retries`.
- **Modo shadow**: el agente sugiere acciones, un humano aprueba antes de aplicar (configurable por agente).
- **Dry run**: simulación en texto sin gastar minutos.

---

## 11. Pruebas

### 11.1 Dry run con 5 escenarios

1. Cliente confirma asistencia → agente crea tarea "preparar demo" + mueve etapa.
2. Cliente pide posponer → agente agenda callback + no mueve etapa.
3. Cliente dice "no me interesa" → agente marca not_interested con razón.
4. Cliente pide hablar con humano → agente transfiere.
5. Cliente hace objeción de precio → agente registra objeción + responde con biblioteca.

### 11.2 Casos borde

- Tool que falla (endpoint caído) → agente informa error + continúa o transfiere.
- Gate que rechaza el movimiento → agente no mueve + registra intención.
- Cliente que pide humano en turno 1 → transfiere inmediatamente.
- Buzón de voz → `machineDetection` → dejar mensaje o colgar.
- Timeout (max_turns) → agente despide + cuelga.
- Cuelgue en turno 1 → `status='completed'` con duración corta.
- Agente de otra org → 403 al intentar dispatch.
- Cola con 500 llamadas → respeta max_concurrent + max_calls_per_day.

---

## 12. Definition of Done

- [ ] `voice_agents`, `voice_agent_campaigns`, `voice_agent_calls`, `voice_agent_runs` existen con RLS.
- [ ] `calls.voice_agent_id` existe.
- [ ] `conversationRelayHandler.ts` funciona con contexto del agente (no hardcoded).
- [ ] Motor de contexto arma contexto solo de la org dueña.
- [ ] Tools funcionan con validación de org + respeto al gate.
- [ ] Despachador respeta schedule, max_concurrent, max_calls_per_day, créditos, horario del cliente, do_not_call.
- [ ] Guardarraíles bloquean temas/frases prohibidas + escalan.
- [ ] Modo dry run funciona en texto.
- [ ] Modo shadow funciona (sugiere, no aplica).
- [ ] UI `/app/crm/agentes-ia` con editor + monitor + simulador.
- [ ] Voces personalizadas con consentimiento verificado.
- [ ] Costos descontados de créditos.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 13. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| El agente promete cosas que no debe | Guardarraíles + forbidden_phrases + modo shadow |
| Costos se disparan con campañas grandes | max_calls_per_day + presupuesto mensual + corte automático |
| ConversationRelay + ElevenLabs en español | Doble camino: Google neural (default) o ElevenLabs via play |
| El agente mueve etapa sin cumplir gate | `stageGateService` es obligatorio en `move_opportunity_stage` |
| Voces clonadas sin consentimiento | Checkbox obligatorio + evidencia almacenada |
| El agente llama a números en do_not_call | Verificación en despachador antes de cada llamada |

---

## 14. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/voice/agentContextBuilder.ts` | crear | Motor de contexto |
| `src/lib/services/voice/agentDispatcher.ts` | crear | Despachador + scheduler |
| `src/lib/services/voice/agentTools.ts` | crear | Ejecutor de tools |
| `src/lib/services/voice/agentGuardrails.ts` | crear | Guardarraíles |
| `src/lib/services/voice/agentSimulator.ts` | crear | Dry run |
| `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` | modificar | Contexto del agente |
| `src/lib/services/integrations/twilio/voiceAgent/realtimeSession.ts` | modificar | Cablear (F0 marcó) |
| `src/lib/services/integrations/twilio/voiceAgent/elevenLabsTTS.ts` | modificar | Cablear (F0 marcó) |
| `src/app/api/voice/agents/route.ts` + `[id]` | crear | CRUD agentes |
| `src/app/api/voice/agents/[id]/dispatch/route.ts` | crear | Encolar |
| `src/app/api/voice/agents/[id]/simulate/route.ts` | crear | Dry run |
| `src/app/api/voice/agents/run-queue/route.ts` | crear | Cron cola |
| `src/app/api/voice/agents/campaigns/route.ts` + `[id]` | crear | CRUD campañas |
| `src/app/api/voice/twiml/ai-agent/route.ts` | crear | TwiML ConversationRelay |
| `ws-server.ts` | modificar | Handler con contexto |
| `src/app/app/crm/agentes-ia/page.tsx` + `[id]` + `campaigns/[id]` | crear | UI |
| `src/components/voice/agent/VoiceAgentList.tsx` | crear | Lista |
| `src/components/voice/agent/VoiceAgentEditor.tsx` | crear | Editor |
| `src/components/voice/agent/PromptEditor.tsx` | crear | Editor prompt |
| `src/components/voice/agent/VoiceSelector.tsx` | crear | Selector voz |
| `src/components/voice/agent/ToolsSelector.tsx` | crear | Selector tools |
| `src/components/voice/agent/GuardrailsEditor.tsx` | crear | Editor guardarraíles |
| `src/components/voice/agent/CampaignEditor.tsx` | crear | Editor campaña |
| `src/components/voice/agent/CampaignMonitor.tsx` | crear | Monitor |
| `src/components/voice/agent/AgentCallDetail.tsx` | crear | Detalle llamada |
| `src/components/voice/agent/Simulator.tsx` | crear | Simulador |
