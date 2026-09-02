# FASE 04 — Transcripción, análisis IA y calificación automática de llamadas

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F3 (tabla `calls`, grabaciones, `RecordingStatusCallback`)
> Bloquea: F5 (análisis de llamadas manuales), F6 (agente IA usa el mismo pipeline)

---

## 0. Objetivo y alcance

**Qué resuelve:** el requisito literal del dueño: *"que transcriba todo lo que hablaron, y califique esa llamada y le ponga una etiqueta, y si considera que en la llamada quedaron pendientes de otra actividad, crearla y programarla, y si cree que pasaron de estado, también pasarlo automáticamente."*

**Qué NO entra:** agente IA de voz que llama solo (F6), registro manual de llamadas (F5).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `/api/ai-assistant/transcribe` | 🟡 Whisper, sin auth/org/límite (F0 corrige) | `src/app/api/ai-assistant/transcribe/route.ts` |
| `openaiService.ts` | ✅ | `src/lib/services/openaiService.ts` |
| `aiCreditsService.ts` | ✅ | `src/lib/services/aiCreditsService.ts` |
| `aiSettingsService.ts` | ✅ | `src/lib/services/aiSettingsService.ts` |
| `aiJobsService.ts` | ✅ patrón de jobs asíncronos | `src/lib/services/aiJobsService.ts` |
| `/api/chat/ai/generate-summary` + `classify-intent` | ✅ validan org (patrón a imitar) | `src/app/api/chat/ai/` |
| `deepgramSTT.ts` | 🟡 escrito, no cableado (F0 marca `// F4: cablear`) | `src/lib/services/integrations/twilio/voiceAgent/deepgramSTT.ts` |
| `stageGateService.ts` | ✅ (F2 lo extiende) | `src/lib/services/crm/stageGateService.ts` |
| `activityService.ts` | ✅ | `src/lib/services/activityService.ts` |
| `call_transcripts` / `call_analyses` | ❌ | — |
| Pipeline asíncrono de transcripción | ❌ | — |
| Motor de acciones automáticas | ❌ | — |

---

## 2. Arquitectura

```
RecordingStatusCallback (F3)
        │
        ▼
INSERT call_transcripts (status='pending')
        │
        ▼
Cola (ai_jobs o cron /api/crm/calls/process-queue)
        │
        ▼
┌─ STT Provider (registry de F0) ──────────────────────┐
│  ElevenLabs Scribe v2 (default)                       │
│  OpenAI gpt-4o-transcribe-diarize                     │
│  Google Chirp 3 (batch)                               │
│  Deepgram (adaptador existente)                       │
└──────────────────────────┬────────────────────────────┘
                           │ TranscriptionResult
                           ▼
INSERT call_transcript_segments
        │
        ▼
┌─ Analysis Provider (registry de F0) ─────────────────┐
│  Gemini 2.5 Flash (default, barato, contexto grande)  │
│  GPT-4o-mini (fallback)                               │
│  Prompt configurable por org + contexto del pipeline  │
│  Salida: JSON validado con zod                        │
└──────────────────────────┬────────────────────────────┘
                           │ CallAnalysisResult
                           ▼
INSERT call_analyses
        │
        ▼
┌─ Motor de acciones automáticas ──────────────────────┐
│  • Etiquetar (call_tag_relations, source='ia')        │
│  • Actualizar opportunities (last_contact, discovery) │
│  • Crear tasks desde next_steps                        │
│  • Sugerir/aplicar cambio de etapa (respeta gate)     │
│  • Notificar al agente                                 │
└───────────────────────────────────────────────────────┘
```

---

## 3. Base de datos

### 3.1 Migraciones

#### Migración 1 — `call_transcripts` y `call_transcript_segments`

```sql
CREATE TABLE call_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_model text,
  language text NOT NULL DEFAULT 'es',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  full_text text,
  word_count integer,
  confidence numeric(3,2),
  speaker_count integer,
  duration_seconds integer,
  cost_amount numeric(10,4),
  raw_response jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcripts_org_call ON call_transcripts (organization_id, call_id);
CREATE UNIQUE INDEX idx_transcripts_call ON call_transcripts (call_id);
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_select ON call_transcripts FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY tr_insert ON call_transcripts FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY tr_update ON call_transcripts FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY tr_delete ON call_transcripts FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE call_transcript_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript_id uuid NOT NULL REFERENCES call_transcripts(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  speaker_label text NOT NULL,
  speaker_role text CHECK (speaker_role IN ('agent','customer','unknown')),
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  text text NOT NULL,
  confidence numeric(3,2),
  sentiment text
);

CREATE INDEX idx_segments_transcript ON call_transcript_segments (transcript_id, start_ms);
ALTER TABLE call_transcript_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY seg_select ON call_transcript_segments FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY seg_insert ON call_transcript_segments FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY seg_delete ON call_transcript_segments FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — `call_analyses`

```sql
CREATE TABLE call_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  transcript_id uuid REFERENCES call_transcripts(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  summary text,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  sentiment_score numeric(3,2),
  quality_score integer CHECK (quality_score >= 0 AND quality_score <= 100),
  quality_breakdown jsonb,
  talk_ratio_agent numeric(5,2),
  talk_ratio_customer numeric(5,2),
  longest_monologue_seconds integer,
  questions_asked integer,
  next_steps jsonb,
  detected_objections jsonb,
  detected_competitors text[],
  budget_mentioned numeric(14,2),
  decision_maker_identified boolean,
  discovery_fields jsonb,
  suggested_stage_id text,
  suggested_stage_confidence numeric(3,2),
  suggested_tasks jsonb,
  applied boolean NOT NULL DEFAULT false,
  applied_by uuid,
  applied_at timestamptz,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_org_call ON call_analyses (organization_id, call_id);
ALTER TABLE call_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_select ON call_analyses FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ca_insert ON call_analyses FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ca_update ON call_analyses FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ca_delete ON call_analyses FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 3 — `call_tags` y `call_tag_relations`

```sql
CREATE TABLE call_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  category text,
  is_auto boolean NOT NULL DEFAULT false,
  rules jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_call_tags_org ON call_tags (organization_id);
ALTER TABLE call_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY ct_select ON call_tags FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ct_insert ON call_tags FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ct_update ON call_tags FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ct_delete ON call_tags FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE call_tag_relations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES call_tags(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ia')),
  confidence numeric(3,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tag_relations_call ON call_tag_relations (organization_id, call_id);
ALTER TABLE call_tag_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctr_select ON call_tag_relations FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ctr_insert ON call_tag_relations FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ctr_delete ON call_tag_relations FOR DELETE USING (organization_id = current_org_id());
```

### 3.2 `fn_call_quality` — función, NO vista materializada

**Por qué se descartó `mv_call_quality`.** El borrador tenía dos defectos verificados:

| Defecto | Detalle |
|---|---|
| 🔴 **Fuga cross-tenant** | Una vista materializada de PostgreSQL **no hereda RLS**. Cualquier usuario autenticado habría podido leer las métricas de llamadas de todas las organizaciones |
| 🔴 **`COUNT(*)` inflado** | `LEFT JOIN call_analyses` produce fan-out: una llamada con 2 análisis se contaba **2 veces** en `total_calls`. Los promedios también se sesgaban |

Se usa una **función** con el mismo criterio que F11 y F14: el `org_id` viaja como
parámetro (sin fuga) y la agregación de análisis se hace en una subconsulta previa
al `JOIN` (sin fan-out):

```sql
CREATE OR REPLACE FUNCTION fn_call_quality(
  p_org_id  integer,
  p_start   date,
  p_end     date,
  p_user_id uuid DEFAULT NULL          -- NULL = todos los vendedores
) RETURNS TABLE (
  user_id               uuid,
  call_date             date,
  total_calls           bigint,
  analyzed_calls        bigint,
  avg_quality           numeric,
  avg_talk_ratio_agent  numeric,
  avg_duration_seconds  numeric
) AS $$
  WITH analysis AS (
    -- Una fila por llamada: colapsa N análisis antes del JOIN → sin fan-out
    SELECT
      ca.call_id,
      AVG(ca.quality_score)      AS quality_score,
      AVG(ca.talk_ratio_agent)   AS talk_ratio_agent
    FROM call_analyses ca
    WHERE ca.organization_id = p_org_id
    GROUP BY ca.call_id
  )
  SELECT
    c.user_id,
    DATE_TRUNC('day', c.started_at)::date        AS call_date,
    COUNT(DISTINCT c.id)                          AS total_calls,
    COUNT(DISTINCT c.id) FILTER (WHERE a.call_id IS NOT NULL) AS analyzed_calls,
    ROUND(AVG(a.quality_score), 2)                AS avg_quality,
    ROUND(AVG(a.talk_ratio_agent), 4)             AS avg_talk_ratio_agent,
    ROUND(AVG(c.duration_seconds), 1)             AS avg_duration_seconds
  FROM calls c
  LEFT JOIN analysis a ON a.call_id = c.id
  WHERE c.organization_id = p_org_id
    AND c.status = 'completed'
    AND c.started_at >= p_start
    AND c.started_at <  p_end
    AND (p_user_id IS NULL OR c.user_id = p_user_id)
  GROUP BY c.user_id, DATE_TRUNC('day', c.started_at)
  ORDER BY call_date DESC, c.user_id;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION fn_call_quality(integer, date, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_call_quality(integer, date, date, uuid) TO authenticated;

-- Índice que la función necesita para no hacer seq scan sobre calls
CREATE INDEX IF NOT EXISTS idx_calls_org_started_status
  ON calls (organization_id, started_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_call_analyses_org_call
  ON call_analyses (organization_id, call_id);
```

> `analyzed_calls` se añade para distinguir "llamadas totales" de "llamadas con
> análisis": con la vista materializada anterior era imposible saber si un promedio
> bajo venía de mala calidad o de pocas llamadas analizadas.

### 3.3 Seeds

```sql
-- Etiquetas por defecto (editables)
INSERT INTO call_tags (organization_id, name, color, category, is_auto) VALUES
  ($org_id, 'Demo agendada', '#10b981', 'outcome', true),
  ($org_id, 'Objeción de precio', '#ef4444', 'objection', true),
  ($org_id, 'Objeción de competencia', '#f59e0b', 'objection', true),
  ($org_id, 'Decisor identificado', '#3b82f6', 'discovery', true),
  ($org_id, 'Próximo paso acordado', '#8b5cf6', 'outcome', true),
  ($org_id, 'Llamada corta', '#94a3b8', 'quality', true)
ON CONFLICT (organization_id, name) DO NOTHING;
```

### 3.4 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('call_transcripts','call_transcript_segments','call_analyses','call_tags','call_tag_relations');
-- Esperado: 5 filas, todas true

SELECT proname FROM pg_proc WHERE proname = 'fn_call_quality';
-- Esperado: 1 fila
```

---

## 4. Backend

### 4.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/crm/calls/[id]/transcribe` | `src/app/api/crm/calls/[id]/transcribe/route.ts` | crear | POST | Forzar/reintentar transcripción |
| `/api/crm/calls/[id]/analyze` | `src/app/api/crm/calls/[id]/analyze/route.ts` | crear | POST | Forzar/reintentar análisis |
| `/api/crm/calls/[id]/apply-actions` | `src/app/api/crm/calls/[id]/apply-actions/route.ts` | crear | POST | Aplicar acciones sugeridas |
| `/api/crm/calls/process-queue` | `src/app/api/crm/calls/process-queue/route.ts` | crear | POST | Cron: procesar cola de transcripción |

### 4.2 Interfaces TypeScript

```typescript
// src/lib/services/voice/transcription/types.ts
export interface TranscriptionProvider {
  transcribe(audio: Buffer, opts: {
    language: string;
    diarize: boolean;
    speakerRoles?: { channel0: 'agent' | 'customer'; channel1: 'agent' | 'customer' };
  }): Promise<TranscriptionResult>;
}

export interface TranscriptionResult {
  fullText: string;
  segments: { speaker: string; startMs: number; endMs: number; text: string; confidence?: number }[];
  language: string;
  durationSeconds: number;
  costAmount: number;
  rawResponse: unknown;
}

// src/lib/services/voice/analysis/types.ts
export interface CallAnalysisProvider {
  analyze(transcript: TranscriptionResult, context: AnalysisContext): Promise<CallAnalysisResult>;
}

export interface AnalysisContext {
  organizationId: number;
  opportunityData: {
    name: string; amount: number; currency: string;
    stageName: string; stageExitCriteria: unknown;
    nextStages: { id: string; name: string }[];
    scoreTotal: number; icpBand: string;
  };
  customerData: { name: string; company: string; city: string };
  recentActivities: { type: string; outcome: string; occurredAt: string }[];
  rubric: RubricConfig;
  systemPromptTemplate: string;
}

export interface CallAnalysisResult {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  qualityScore: number;
  qualityBreakdown: { dimension: string; score: number; notes: string }[];
  talkRatioAgent: number;
  talkRatioCustomer: number;
  longestMonologueSeconds: number;
  questionsAsked: number;
  nextSteps: { description: string; dueDate?: string; type: string }[];
  detectedObjections: { objectionId?: number; title: string; confidence: number }[];
  detectedCompetitors: string[];
  budgetMentioned?: number;
  decisionMakerIdentified: boolean;
  discoveryFields: Record<string, unknown>;
  suggestedStageId?: string;
  suggestedStageConfidence?: number;
  suggestedTasks: { title: string; dueDate: string; type: string }[];
}
```

### 4.3 Adaptadores de STT

#### ElevenLabs Scribe v2 (default)

```typescript
// src/lib/services/voice/transcription/elevenLabsScribeProvider.ts
export class ElevenLabsScribeProvider implements TranscriptionProvider {
  async transcribe(audio: Buffer, opts): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('file', new Blob([audio]), 'call.mp3');
    formData.append('model_id', 'scribe_v2');
    formData.append('language_code', opts.language || 'spa');
    formData.append('diarize', String(opts.diarize));
    formData.append('timestamps_granularity', 'word');
    formData.append('detect_speaker_roles', 'true');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      body: formData,
    });
    const data = await res.json();
    // Mapear respuesta a TranscriptionResult
    return mapScribeResponse(data, opts);
  }
}
```

#### OpenAI gpt-4o-transcribe-diarize

```typescript
// src/lib/services/voice/transcription/openaiTranscribeProvider.ts
export class OpenAITranscribeProvider implements TranscriptionProvider {
  async transcribe(audio: Buffer, opts): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('file', new Blob([audio]), 'call.mp3');
    formData.append('model', 'gpt-4o-transcribe-diarize');
    formData.append('language', opts.language || 'es');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });
    return mapOpenAIResponse(await res.json());
  }
}
```

#### Google Chirp 3 (batch)

Usa `BatchRecognize` con diarización. Requiere `GOOGLE_APPLICATION_CREDENTIALS`. Más lento pero más barato ($0.003/min).

#### Atajo dual-channel

```typescript
// Si el audio es dual-channel de Twilio:
// Canal 0 = agente, Canal 1 = cliente
// Diarización determinista sin depender del modelo
if (audioChannels === 2 && opts.speakerRoles) {
  // Separar canales → transcribir cada uno → asignar speaker_role directamente
  const [agentAudio, customerAudio] = splitChannels(audio);
  const [agentText, customerText] = await Promise.all([
    transcribeMono(agentAudio),
    transcribeMono(customerAudio),
  ]);
  // Merge por timestamps → segments con speaker_role determinista
}
```

### 4.4 Prompt de análisis

```typescript
// src/lib/services/voice/analysis/promptBuilder.ts
export function buildAnalysisPrompt(ctx: AnalysisContext): { system: string; user: string } {
  const system = ctx.systemPromptTemplate
    .replace('{{stage_name}}', ctx.opportunityData.stageName)
    .replace('{{exit_criteria}}', JSON.stringify(ctx.opportunityData.stageExitCriteria))
    .replace('{{next_stages}}', JSON.stringify(ctx.opportunityData.nextStages))
    .replace('{{objections_catalog}}', JSON.stringify(ctx.organizationObjections))
    .replace('{{rubric}}', JSON.stringify(ctx.rubric));

  const user = `Transcripción de la llamada:
${ctx.transcript.fullText}

Contexto del cliente:
- Nombre: ${ctx.customerData.name}
- Empresa: ${ctx.customerData.company}
- Ciudad: ${ctx.customerData.city}

Contexto de la oportunidad:
- Nombre: ${ctx.opportunityData.name}
- Monto: ${ctx.opportunityData.amount} ${ctx.opportunityData.currency}
- Etapa actual: ${ctx.opportunityData.stageName}
- Score: ${ctx.opportunityData.scoreTotal}
- ICP: ${ctx.opportunityData.icpBand}

Actividades recientes:
${ctx.recentActivities.map(a => `- ${a.type}: ${a.outcome} (${a.occurredAt})`).join('\n')}

Devuelve SOLO un JSON válido con este schema:
${JSON.stringify(ANALYSIS_SCHEMA, null, 2)}`;

  return { system, user };
}
```

#### Schema zod de la respuesta

```typescript
import { z } from 'zod';

export const ANALYSIS_SCHEMA = z.object({
  summary: z.string().min(20),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  sentimentScore: z.number().min(-1).max(1),
  qualityScore: z.number().min(0).max(100),
  qualityBreakdown: z.array(z.object({
    dimension: z.string(),
    score: z.number().min(0).max(100),
    notes: z.string(),
  })),
  talkRatioAgent: z.number().min(0).max(1),
  talkRatioCustomer: z.number().min(0).max(1),
  longestMonologueSeconds: z.number(),
  questionsAsked: z.number(),
  nextSteps: z.array(z.object({
    description: z.string(),
    dueDate: z.string().optional(),
    type: z.enum(['call', 'email', 'whatsapp', 'sms', 'meeting', 'task']),
  })),
  detectedObjections: z.array(z.object({
    objectionId: z.number().optional(),
    title: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  detectedCompetitors: z.array(z.string()),
  budgetMentioned: z.number().optional(),
  decisionMakerIdentified: z.boolean(),
  discoveryFields: z.record(z.unknown()),
  suggestedStageId: z.string().optional(),
  suggestedStageConfidence: z.number().min(0).max(1).optional(),
  suggestedTasks: z.array(z.object({
    title: z.string(),
    dueDate: z.string(),
    type: z.enum(['call', 'email', 'whatsapp', 'sms', 'meeting', 'task']),
  })),
});
```

### 4.5 Motor de acciones automáticas

```typescript
// src/lib/services/voice/analysis/actionEngine.ts
export async function applyAnalysisActions(
  supabase: SupabaseClient,
  orgId: number,
  callId: number,
  analysis: CallAnalysisResult,
  mode: 'suggest_only' | 'auto_if_confident' | 'auto_always',
  confidenceThreshold: number
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied = [];
  const skipped = [];

  // 1. Etiquetar automático
  for (const tag of autoTagFromAnalysis(analysis)) {
    await supabase.from('call_tag_relations').insert({
      organization_id: orgId, call_id: callId,
      tag_id: tag.id, source: 'ia', confidence: tag.confidence,
    });
    applied.push(`tag:${tag.name}`);
  }

  // 2. Actualizar oportunidades
  await supabase.from('opportunities').update({
    last_contact_at: new Date().toISOString(),
    contact_channel: 'call',
    contact_result: analysis.sentiment,
    discovery_data: mergeDiscovery(opp.discovery_data, analysis.discoveryFields),
  }).eq('id', oppId);

  // 3. Crear tareas desde next_steps
  for (const step of analysis.nextSteps) {
    await supabase.from('tasks').insert({
      organization_id: orgId,
      title: step.description,
      due_date: step.dueDate || defaultDueDate(),
      related_type: 'opportunity',
      related_id: oppId,
      // ...
    });
    applied.push(`task:${step.description}`);
  }

  // 4. Sugerir/aplicar cambio de etapa
  if (analysis.suggestedStageId) {
    const shouldApply =
      mode === 'auto_always' ||
      (mode === 'auto_if_confident' && analysis.suggestedStageConfidence >= confidenceThreshold);

    if (shouldApply) {
      // RESPETAR stageGateService de F2
      const gate = await evaluateStageGate(supabase, orgId, {
        opportunityId: oppId,
        targetStageId: analysis.suggestedStageId,
      });

      if (gate.ok) {
        await supabase.from('opportunities').update({
          stage_id: analysis.suggestedStageId,
        }).eq('id', oppId);
        applied.push(`stage:${analysis.suggestedStageId} (by ai, gate passed)`);
      } else {
        // No mover — registrar la intención
        await supabase.from('call_analyses').update({
          metadata: { gate_failed: gate.missing },
        }).eq('call_id', callId);
        skipped.push(`stage:${analysis.suggestedStageId} (gate failed: ${gate.missing.map(m => m.label).join(', ')})`);
      }
    } else {
      skipped.push(`stage:${analysis.suggestedStageId} (suggest_only or below threshold)`);
    }
  }

  // 5. Marcar como aplicado
  await supabase.from('call_analyses').update({
    applied: true, applied_by: userId, applied_at: new Date().toISOString(),
  }).eq('call_id', callId);

  return { applied, skipped };
}
```

### 4.6 Cola, reintentos e idempotencia

- `RecordingStatusCallback` (F3) crea `call_transcripts` con `status='pending'`.
- Cron `/api/crm/calls/process-queue` (protegido por `CRON_SECRET`) procesa pendings.
- Reintentos exponenciales: 1 min, 5 min, 15 min, 1 h. Máximo 4 reintentos.
- Dead-letter: si falla 4 veces, `status='failed'` + notificación al admin.
- Idempotencia: una sola transcripción por `call_id` (unique index).

### 4.7 Variables de entorno

| Variable | Requerida | Para qué |
|---|---|---|
| `ELEVENLABS_API_KEY` | sí | Scribe v2 |
| `ELEVENLABS_SCRIBE_MODEL` | no | `scribe_v2` (default) |
| `OPENAI_API_KEY` | sí | Fallback STT + análisis |
| `GOOGLE_AI_API_KEY` | no | Gemini análisis + Chirp 3 |
| `GOOGLE_APPLICATION_CREDENTIALS` | no | Chirp 3 batch |
| `DEEPGRAM_API_KEY` | no | STT alternativo |
| `CRON_SECRET` | sí | Proteger cola |

---

## 5. UI

### 5.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/llamadas/[id]` | ya existe (F3) | modificar | Añadir transcripción + análisis |

### 5.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/voice/CallTranscriptViewer.tsx` | **crear** | `transcriptId` | Transcripción con timeline + sync audio |
| `src/components/voice/CallAnalysisPanel.tsx` | **crear** | `callId` | Resumen, score, talk ratio, etiquetas, próximos pasos |
| `src/components/voice/StageSuggestionCard.tsx` | **crear** | `suggestedStageId`, `confidence` | Tarjeta "Mover a etapa X" con Aplicar/Descartar |
| `src/components/voice/CallTagsDisplay.tsx` | **crear** | `callId` | Etiquetas con color + source (manual/IA) |

### 5.3 Wireframes

```
┌─ CallTranscriptViewer ───────────────────────────────────────┐
│  [▶ Player de audio]  00:42 / 04:12                          │
│  ── Transcripción ──                                          │
│  [00:00] Agente:   Hola Juan, ¿cómo estás?                   │
│  [00:05] Cliente:  Bien, ¿qué me cuentas del ERP?            │
│  [00:12] Agente:   Te cuento que...                          │
│  [00:45] Cliente:  ¿Y cuánto cuesta?  ← objeción de precio   │
│  [01:02] Agente:   El plan básico es...                      │
│                                                                │
│  [Buscar en transcripción: _____________]                    │
└────────────────────────────────────────────────────────────────┘

┌─ CallAnalysisPanel ──────────────────────────────────────────┐
│  Resumen: El cliente mostró interés en el módulo de POS...   │
│  Sentimiento: 😐 Neutral (0.1)                               │
│  Calidad: 78/100                                             │
│  ┌─ Rúbrica ──────────────────┐                              │
│  │ Apertura:        85        │                              │
│  │ Discovery:       60        │                              │
│  │ Objeciones:      70        │                              │
│  │ Próximo paso:    90        │                              │
│  │ Talk ratio: 55%/45% ✓     │                              │
│  └────────────────────────────┘                              │
│                                                                │
│  Etiquetas: [Demo agendada] [Objeción de precio]             │
│                                                                │
│  Próximos pasos:                                              │
│  ☐ Enviar propuesta por email — vence en 24h  [Crear tarea]  │
│  ☐ Llamar para confirmar demo — vence en 48h  [Crear tarea]  │
│                                                                │
│  ┌─ Sugerencia de etapa ──────────────────────────┐          │
│  │ Mover a "Negociación" (confianza: 82%)         │          │
│  │ [Aplicar]  [Descartar]                         │          │
│  └─────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 Animaciones Motion

```tsx
// Segmentos con stagger
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    hidden: { opacity: 0 },
    visible: { transition: { staggerChildren: 0.03 } },
  }}
>
  {segments.map(seg => (
    <motion.div
      key={seg.id}
      variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
      className={seg === activeSegment ? 'bg-yellow-100' : ''}
    >
      [{formatTime(seg.startMs)}] {seg.speaker}: {seg.text}
    </motion.div>
  ))}
</motion.div>

// Score con AnimateNumber
<motion.span
  key={qualityScore}
  initial={{ scale: 0.5, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
>
  {qualityScore}/100
</motion.span>
```

### 5.5 Accesibilidad

- Transcripción navegable con flechas arriba/abajo.
- Cada segmento es un `button` que salta el audio al tiempo del segmento.
- `aria-live="polite"` cuando se carga el análisis.
- Tarjeta de sugerencia de etapa con `role="alert"`.

---

## 6. Costos, créditos y presupuesto

- Descontar de `ai_settings.credits_remaining`.
- Registrar en `ai_usage_logs` con `module='crm_call_analysis'`.
- Mostrar costo estimado por llamada en la UI.
- Presupuesto mensual por organización con corte automático.

| Componente | Costo |
|---|---|
| ElevenLabs Scribe v2 | $0.22/hora |
| OpenAI gpt-4o-transcribe | $0.006/min ($0.36/h) |
| Google Chirp 3 (batch) | $0.003/min ($0.18/h) |
| Gemini 2.5 Flash (análisis) | ~$0.0001 por llamada |
| GPT-4o-mini (análisis fallback) | ~$0.0005 por llamada |

---

## 7. Privacidad, PII y retención

- Redacción opcional de PII en la transcripción (números de tarjeta, cédulas).
- Retención configurable de transcripciones.
- Borrado en cascada: al borrar una llamada, se borran transcripción, segmentos y análisis.
- Las transcripciones de una org nunca entran en el contexto de análisis de otra.

---

## 8. Multi-tenant y seguridad

- El prompt de análisis se construye con datos SOLO de la organización dueña de la llamada.
- `call_id` se valida: pertenece a la org del usuario antes de procesar.
- El contexto del pipeline (etapas, objeciones, rúbrica) se carga de la org, no global.
- Las grabaciones y transcripciones están bajo RLS.

---

## 9. Pruebas

### 9.1 Casos con fixtures de transcripción real

1. Transcripción de 4 min en español → Scribe v2 devuelve segments con diarización.
2. Audio dual-channel → diarización determinista por canal.
3. JSON inválido del modelo → reintento con reparación, luego fallo controlado.
4. Audio corrupto → `status='failed'` + error_code.
5. Audio de 45 min → chunking si > 25 MB (OpenAI); Scribe acepta más.
6. Idioma mezclado español/inglés → Scribe detecta; Gemini analiza en español.
7. Llamada de 3 segundos → transcripción vacía → análisis con score bajo.
8. Transcript de otra org → 403 al intentar analizar.
9. Doble procesamiento del mismo `call_id` → idempotente (unique index).

### 9.2 Motor de acciones

- `suggest_only` → no aplica etapa, solo sugiere.
- `auto_if_confident` con confianza 0.9 y gate cumplido → aplica.
- `auto_if_confident` con confianza 0.5 → no aplica.
- `auto_always` con gate fallido → no aplica, registra intención.
- Tareas se crean con `due_date` correcta.

---

## 10. Definition of Done

- [ ] `call_transcripts`, `call_transcript_segments`, `call_analyses`, `call_tags`, `call_tag_relations` existen con RLS.
- [ ] `fn_call_quality` existe y NO se creo `mv_call_quality` (una vista materializada no hereda RLS). `COUNT(DISTINCT c.id)` no se infla con multiples analisis por llamada.
- [ ] Pipeline asíncrono procesa transcripciones pendientes vía cron.
- [ ] ElevenLabs Scribe v2 funciona como default.
- [ ] Gemini 2.5 Flash funciona como análisis default.
- [ ] JSON del análisis validado con zod.
- [ ] Motor de acciones aplica etiquetas, actualiza opp, crea tareas, sugiere etapa.
- [ ] Auto-avance de etapa respeta `stageGateService`.
- [ ] `CallTranscriptViewer` sincroniza con player de audio.
- [ ] `CallAnalysisPanel` muestra resumen, score, etiquetas, próximos pasos.
- [ ] `StageSuggestionCard` permite Aplicar/Descartar.
- [ ] Costos descontados de créditos.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 11. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Costos de IA se disparan con llamadas largas | Presupuesto mensual + corte automático + mostrar costo por llamada |
| El modelo devuelve JSON inválido | zod + reintento con "responde SOLO JSON válido" + fallo controlado |
| Latencia del análisis bloquea el webhook | Pipeline asíncrono — el webhook solo encola |
| Fuga de datos cross-tenant en el prompt | Contexto construido solo de la org dueña; test de aislamiento |
| Scribe v2 no soporta todos los idiomas | Fallback a OpenAI/Google; configurable por org |

---

## 12. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/voice/transcription/types.ts` | crear | Interfaz STT |
| `src/lib/services/voice/transcription/elevenLabsScribeProvider.ts` | crear | Default STT |
| `src/lib/services/voice/transcription/openaiTranscribeProvider.ts` | crear | Fallback STT |
| `src/lib/services/voice/transcription/googleChirpProvider.ts` | crear | STT barato |
| `src/lib/services/voice/transcription/deepgramProvider.ts` | crear | Reutiliza `deepgramSTT.ts` |
| `src/lib/services/voice/analysis/types.ts` | crear | Interfaz análisis |
| `src/lib/services/voice/analysis/geminiAnalysisProvider.ts` | crear | Default análisis |
| `src/lib/services/voice/analysis/openaiAnalysisProvider.ts` | crear | Fallback análisis |
| `src/lib/services/voice/analysis/promptBuilder.ts` | crear | Prompt configurable |
| `src/lib/services/voice/analysis/actionEngine.ts` | crear | Motor de acciones |
| `src/lib/services/voice/analysis/queueProcessor.ts` | crear | Cola + reintentos |
| `src/app/api/crm/calls/[id]/transcribe/route.ts` | crear | Forzar transcripción |
| `src/app/api/crm/calls/[id]/analyze/route.ts` | crear | Forzar análisis |
| `src/app/api/crm/calls/[id]/apply-actions/route.ts` | crear | Aplicar acciones |
| `src/app/api/crm/calls/process-queue/route.ts` | crear | Cron cola |
| `src/components/voice/CallTranscriptViewer.tsx` | crear | Viewer |
| `src/components/voice/CallAnalysisPanel.tsx` | crear | Panel análisis |
| `src/components/voice/StageSuggestionCard.tsx` | crear | Sugerencia etapa |
| `src/components/voice/CallTagsDisplay.tsx` | crear | Etiquetas |
| `src/app/api/ai-assistant/transcribe/route.ts` | modificar | F0 corrige; F4 unifica con nuevo servicio |
| `src/lib/services/integrations/twilio/voiceAgent/deepgramSTT.ts` | modificar | Cablear como adaptador |
