# FASE 04 — Transcripción, análisis IA y actividad automática en la oportunidad

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye al V3 completo)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (cola `outbound_jobs` + runner `/api/crm/jobs/run`, columnas nuevas de `activities` (`call_id`, `email_message_id`, `message_id`, `conversation_id`, CHECK ampliado), `messages.related_opportunity_id`, CHECK `call_analyses.sentiment` + `mixed`, bucket `crm-call-recordings`, `provider_pricing`, RPC atómicos de créditos, fix C0 `resolveOrgFromExternal`), **F3** (softphone, grabación dual-channel, `call_recordings.status='ready'`, trigger `trg_calls_completed_activity`).
> Bloquea: F5 (llamada manual con audio usa este pipeline), F6 (agente IA reutiliza análisis), F9 (timeline muestra transcripción y análisis).
> Esfuerzo: **L** · Valor: **muy alto** (es la mitad del requisito literal del dueño: "grabar, transcribir y dejar todo en actividades recientes").

---

## 0. Objetivo y alcance

Al terminar esta fase, para una organización de prueba con Twilio + ElevenLabs + Gemini configurados:

1. Toda grabación que llega a `call_recordings.status='ready'` (F3) encola **sin intervención humana** un job `transcribe`; en ≤ 3 minutos para una llamada de 10 min existe una fila `call_transcripts.status='completed'` con `full_text` y segmentos con `speaker_role` correcto (`agent`/`customer`) asignado **por canal** de la grabación dual, no por heurística.
2. Al completarse la transcripción se encola `analyze`; en ≤ 60 s existe `call_analyses` con resumen, sentimiento (incluido `mixed`), score con desglose, objeciones mapeadas al catálogo `objections` de la org, próximos pasos con fecha, etapa sugerida **validada contra el pipeline real** de la oportunidad, tareas sugeridas, etiquetas y temperatura.
3. La llamada aparece en "actividades recientes" de la oportunidad como **una sola** `activities` (`activity_type='call'`, `call_id`, `channel`, `outcome`, `duration_seconds`, `notes`=resumen, `metadata` con ids) y `opportunities.last_contact_at/contact_channel/contact_result/temperature` quedan actualizados.
4. Según política de la org (`auto` | `suggest`): se mueve la etapa (respetando `evaluateStageGate`), se crean `tasks` válidas (`status='open'`, `priority` ∈ CHECK, `related_to_id/related_to_type`), se etiqueta la llamada y se notifica al vendedor con `fn_create_org_notification`.
5. Una llamada registrada a mano con audio subido (F5, `calls.mode='manual'`) y una grabación de reunión subida entran en el mismo pipeline sin código especial.
6. Cada llamada a proveedor debita créditos IA **antes** de ejecutarse vía RPC atómico y deja fila en `ai_usage_logs` con costo real y proveedor; si la org no tiene saldo o superó su presupuesto mensual, el job termina en `failed` con `error_code='INSUFFICIENT_CREDITS'` y la UI lo muestra.
7. Si ElevenLabs cae, el mismo job reintenta con Gemini 2.5 Flash (audio nativo) y, en último término, OpenAI `gpt-transcribe`; el proveedor usado queda en `call_transcripts.provider`.
8. UI: en `/app/crm/llamadas` cada fila se expande y muestra `CallTranscriptPanel` (clic en segmento → seek en `CallPlayer`) y `CallAnalysisPanel` (botones "crear tarea", "aplicar todo", "aplicar etapa"); estados transcribiendo/analizando/error con reintento. Las mismas tarjetas se reutilizan en el timeline (F9).

**No incluye:** softphone ni grabación (F3), registro manual y disposiciones (F5), agente de voz saliente (F6), editor de reglas de automatización (F8), timeline unificado y drawer (F9), UI de configuración general de proveedores (F17; aquí solo la sección "Inteligencia de llamadas").

---

## 1. Estado actual verificado

Hechos tomados de `audit-telephony.md`, `audit-ai-automations.md` y del schema en vivo.

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| `src/lib/services/crm/transcriptionService.ts:365` | 🔴 | Filtra `call_recordings.status='available'`; el CHECK real es `processing|ready|failed|deleted` → siempre `NO_RECORDING` (:380) (**C7**). |
| `transcriptionService.ts:415-417` | 🔴 | Toma el primer segmento de `storage_path` como bucket (`org_7/2026/09/RE.mp3` → bucket "org_7") (**C8**). El bucket real es `crm-call-recordings` (`recordingStorageService.ts:18`), que además no existe hasta F0 (**C6**). |
| `transcriptionService.ts:156,184,208,282,302` | 🔴 | Heurística "speaker 0 = agente"; errónea en ~50 % de inbound y siempre que el cliente habla primero. |
| `transcriptionService.ts:98,240` | 🟡 | Idioma hardcodeado `'es'`; `transcribeWithElevenLabs` se invoca sin idioma (:444). |
| `transcriptionService.ts:243` | 🟡 | `model_id: 'scribe_v1'`; docs-elevenlabs.md fija `scribe_v2`. |
| `transcriptionService.ts:95-107` | 🟡 | Deepgram `nova-2` como proveedor por defecto: fuera de D1. Se elimina. |
| `src/app/api/crm/transcribe/route.ts:13,139,208` | 🟡 | Segundo stack de transcripción (Gemini 2.0 → whisper-1) que descarta el resultado y no persiste nada; consumido por `ActivityActions.tsx:249`. Se elimina en F5/F9. |
| `src/lib/services/crm/callAnalysisService.ts:79` y `:212` | 🔴 | zod y enum Gemini admiten `mixed`, pero el CHECK `call_analyses_sentiment_check` solo admite `positive|neutral|negative` → 23514 en el insert (:471) (**C16**, F0 lo corrige). |
| `callAnalysisService.ts:349` | 🔴 | `customers.name` no existe (hay `full_name`, `company_name`) (**C-6**). |
| `callAnalysisService.ts:363` | 🔴 | `opportunities.title` no existe (es `name`) → el `select` falla, no hay catálogo de etapas en el prompt y `suggested_stage_id` se alucina (**C-6**). |
| `callAnalysisService.ts:133-186` | 🟡 | Prompt sin catálogo de objeciones de la org, sin criterios de salida de etapa, sin temperatura, sin etiquetas. |
| `callAnalysisService.ts:671` | 🔴 | `applyAnalysis` escribe `opportunities.stage_id` directo, sin `evaluateStageGate` ni validar que la etapa pertenezca al pipeline de la oportunidad. |
| `callAnalysisService.ts:691-692` | 🔴 | Inserta `tasks.priority='medium'` y `status='pending'`; los CHECK reales son `low|med|high|critical` y `open|in_progress|done|canceled` → todo insert de tareas falla. (:696-697 `related_to_id/type` sí son correctos.) |
| `callAnalysisService.ts:502` | 🔴 | `analyzeCall` termina en `applyAutoTags`; **nunca escribe `activities`** ni actualiza `opportunities.last_contact_at`. |
| `callAnalysisService.ts:396-418` | 🟡 | Solo Gemini; sin fallback OpenAI; sin débito de créditos (audit-ai §1: "Rutas que NO debitan: … calls/[id]/transcribe, /analyze"). |
| `src/app/api/voice/recording/route.ts:182-195` | 🔴 | Mapea `completed` → `'completed'` (inválido); `recordingStorageService.ts:268` sí escribe `'ready'` (**C5**, lo corrige F3). |
| Disparo automático | 🔴 | `transcribeCall` y `analyzeCall` tienen un solo caller cada uno: su ruta. Nada encadena grabación → transcripción → análisis (audit-ai §3 "Gaps"). |
| `src/app/api/crm/calls/[id]/{transcribe,analyze,analysis/apply,transcript,tags}/route.ts` | ✅ | Existen con `getServerOrgContext()`; ejecutan síncrono dentro de la request (riesgo de timeout). Se conservan y pasan a encolar. |
| `src/lib/services/crm/callTagService.ts` | ✅ | `getCallTags`, `createCallTag`, `tagCall(callId, tagId, source, confidence)`, `untagCall` correctos. |
| `src/lib/services/crm/stageGateService.ts:655` | ✅ | `evaluateStageGate(supabase, orgId, {opportunityId, targetStageId}) → {ok, missing[]}`. |
| `src/components/voice/CallPlayer.tsx:17-31` | 🟡 | Props `{callId, recordingEnabled, className}`; sin API de `seek` ni `onTimeUpdate`. |
| `src/components/voice/CallsTable.tsx:286` | 🟡 | Solo `CallPlayer` por fila; sin transcripción ni análisis (audit-ui "la página buena"). |
| Índices | 🟡 | `idx_analyses_org_call` e `idx_call_analyses_org_call` duplicados sobre `(organization_id, call_id)`; `idx_transcripts_call` es UNIQUE en `call_id` → re-transcribir debe hacer UPDATE, no INSERT. |
| Publicación realtime | 🔴 | `supabase_realtime` solo incluye `tasks` y `messages`; `call_transcripts`, `call_analyses`, `activities`, `calls` no emiten cambios. |
| Datos | — | `calls`, `call_transcripts`, `call_analyses` = 0 filas en producción. |

### 1.b Estado tras la ronda 1 (2026-09-08)

Todos los 🔴/🟡 de la tabla anterior que pertenecen a F4 están cerrados y verificados
contra la BD real (org 125) y contra los proveedores reales. Resumen:

| Hallazgo | Cierre |
|---|---|
| C7 `status='available'` | `transcriptionService` filtra `status='ready'`. |
| C8 bucket derivado del path | Descarga con `RECORDINGS_BUCKET='crm-call-recordings'` + `storage_path` completo. |
| Heurística "speaker 0 = agente" | `callChannelRoles.ts`: saliente canal 0 = agente, entrante invertido, heurística por orden/duración cuando no hay `channel_index`; el mapa queda en `raw_response.channel_role_map` con `method` y `confidence`. **Ver el aviso sobre `method='single'` justo debajo.** |
| Idioma hardcodeado / `scribe_v1` / Deepgram | Idioma desde la política (`spa` por defecto); `scribe_v2`; Deepgram eliminado de la cascada. |
| C16 `mixed` | `sentiment` acepta `positive\|neutral\|negative\|mixed`. |
| C-6 `customers.name` / `opportunities.title` | `customers.first_name/last_name/full_name` y `opportunities.name`. |
| `applyAnalysis` sin gate | `evaluateStageGate` antes de mover etapa; etapa validada contra el pipeline de la oportunidad y contra `stageConfidenceThreshold`. |
| `tasks.priority='medium'` / `status='pending'` | `priority='med'`, `status='open'`, `related_to_type/related_to_id`. |
| Sin actividad ni `last_contact_at` | `callActivityService.upsertCallActivity` (idempotente por `call_id`) + `touchOpportunityFromCall` + `notifyCallAnalyzed`. |
| Sin fallback ni créditos | Cascada Scribe v2 → Gemini → OpenAI (STT) y Gemini → OpenAI (análisis); créditos debitados ANTES del proveedor con reembolso si falla. |
| Nada encadena grabación → transcripción → análisis | Jobs `transcribe` y `analyze` encadenados en `callIntelligenceService`. |
| `CallPlayer` sin `seek` | `seekToMs` + `onTimeUpdate`; `CallTranscriptPanel` hace clic-a-segmento. |

**Sin diarización, TODO el diálogo se atribuye a un solo interlocutor.** El mapa de roles
tiene tres métodos y conviene no confundirlos:

| `method` | Cuándo | Qué asigna | `confidence` |
|---|---|---|---|
| `channel` | ≥ 90 % de los segmentos traen `channel_index` (grabación dual de Scribe v2) | Saliente: canal 0 = AGENTE, canal 1 = CLIENTE. Entrante: invertido. | 1 |
| `heuristic` | Hay 2+ hablantes distintos pero sin `channel_index` | Por orden de intervención y duración; un tercer hablante queda `unknown`. | 0.6 |
| `single` | El proveedor devuelve **un único hablante** | **Todo** el diálogo se marca AGENTE en salientes y CLIENTE en entrantes. | 0.5 |

`method='single'` **es el caso por defecto hoy**: la key de ElevenLabs responde 401, así
que la cascada la sirve `gpt-transcribe`, que no diariza y devuelve un solo `speaker_0`.
Los paneles lo avisan con la insignia «1 hablante», pero el `talk_ratio` y todo lo que
dependa de separar interlocutores hay que leerlo con esa reserva. Se corrige solo cuando
la key de Scribe v2 sea válida (§13.2 nº 2), no con más código.

**Desviaciones que siguen abiertas** (no son deuda de F4, requieren DDL o dueños ajenos):
las columnas `comm_settings.call_ai_*` y varias columnas de §3.1 no existen, así que la
política vive en `provider_configs.settings` y los metadatos extra (`channel_role_map`,
`provider_request_id`, intentos, costo, temperatura, `applied_actions`) viajan dentro de
`raw_response`. Ver §13.

---

## 2. Arquitectura y flujo

```
F3: Twilio RecordingStatusCallback ─► /api/voice/recording ─► downloadAndUploadRecording()
                                                              (stereo, ?RequestedChannels=2)
                                                              call_recordings.status='ready'
                                                                        │
                                              trg_call_recordings_ready_enqueue (BD)
                                                                        │ INSERT outbound_jobs
                                                                        ▼ kind='transcribe' dedupe_key='transcribe:{call_id}'
 pg_cron (1 min) ─► /api/crm/jobs/run (Bearer CRON_SECRET) ─► fn_claim_jobs('transcribe', 5)
                                                                        │
                                                                        ▼
                                              transcribeJob(payload{call_id, organization_id})
                                                │ 1. policy = getCallAiPolicy(org)  (auto_transcribe? min_duration? idioma?)
                                                │ 2. chargeAiCredits('stt.elevenlabs.scribe_v2', minutos)  ← RPC atómico ANTES
                                                │ 3. audio = storage.download('crm-call-recordings', path)
                                                │ 4. adapter = resolveSttAdapter(org) → ElevenLabs ─fallo─► Gemini ─fallo─► OpenAI
                                                │ 5. roles = channelRoleMapper(audio, words, direction)  (ffmpeg silencedetect por canal)
                                                │ 6. piiMasker(segments)
                                                │ 7. UPSERT call_transcripts (+segments) status='completed'
                                                │ 8. INSERT outbound_jobs kind='analyze' dedupe_key='analyze:{transcript_id}'
                                                ▼
                                              analyzeJob(payload{call_id, transcript_id, organization_id})
                                                │ 1. chargeAiCredits('llm.gemini.call_analysis', 1)
                                                │ 2. contexto: calls, customers, opportunities(+stages del pipeline), objections, call_tags
                                                │ 3. Gemini 2.5 Flash responseSchema ─fallo─► OpenAI gpt-5.6-luna responses.parse
                                                │ 4. validar suggested_stage_id ∈ stages(pipeline_id) ; mapear objeciones → objection_ids
                                                │ 5. INSERT call_analyses (temperature, objection_ids, policy)
                                                │ 6. upsertCallActivity(call_id)  → activities (call_id, notes=summary, metadata{...})
                                                │ 7. UPDATE opportunities (last_contact_at, contact_channel, contact_result, temperature, discovery_data)
                                                │ 8. applyPolicy(): auto → mover etapa (gate) + tasks + tags + notificación ; suggest → tags + notificación
                                                ▼
                       Realtime (postgres_changes en activities/call_transcripts/call_analyses) ─► CallsTable fila / Timeline (F9)

Modo async ElevenLabs (audio > 30 min): paso 4 envía webhook:true ─► ElevenLabs POST /api/crm/webhooks/elevenlabs
   (ElevenLabs-Signature) ─► completeTranscriptFromWebhook(request_id) ─► pasos 5-8.
```

**Máquina de estados de `call_transcripts.status`:** `pending` (fila creada por el job al reclamar) → `processing` (audio enviado; en async espera webhook) → `completed` | `failed` (`error_code` ∈ `NO_RECORDING | INSUFFICIENT_CREDITS | PROVIDER_ERROR | AUDIO_TOO_SHORT | AUDIO_EMPTY | WEBHOOK_TIMEOUT`). `failed` + botón "Reintentar" → nuevo job con `force=true` que hace UPDATE de la misma fila (índice único por `call_id`).

**Máquina de estados de `outbound_jobs`** (F0): `queued` → `running` → `done` | `failed` (reintento con backoff 1, 5, 15 min; `max_attempts=3`) → `dead`. `dedupe_key` UNIQUE evita jobs duplicados por el mismo callback repetido de Twilio.

---

## 3. Base de datos

### 3.1 Migraciones (aplicar con MCP `apply_migration`; cero `.sql` en el repo)

#### `202609_crm_v4_f04_call_ai_settings`

```sql
-- Política de inteligencia de llamadas por organización (comm_settings ya es 1 fila por org)
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS call_ai_auto_transcribe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_ai_auto_analyze boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_ai_apply_policy text NOT NULL DEFAULT 'suggest'
    CHECK (call_ai_apply_policy IN ('auto','suggest')),
  ADD COLUMN IF NOT EXISTS call_ai_language text NOT NULL DEFAULT 'spa',
  ADD COLUMN IF NOT EXISTS call_ai_min_duration_seconds integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS call_ai_stage_confidence_threshold numeric(3,2) NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS call_ai_pii_masking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_ai_transcript_retention_days integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS call_ai_monthly_budget_usd numeric(10,2);
```

#### `202609_crm_v4_f04_transcripts_analyses_columns`

```sql
ALTER TABLE call_transcripts
  ADD COLUMN IF NOT EXISTS provider_request_id text,          -- Scribe transcription_id / request_id del webhook
  ADD COLUMN IF NOT EXISTS channel_role_map jsonb,            -- {"0":"agent","1":"customer","method":"channel|heuristic"}
  ADD COLUMN IF NOT EXISTS pii_masked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_provider_request
  ON call_transcripts (provider, provider_request_id) WHERE provider_request_id IS NOT NULL;

ALTER TABLE call_transcript_segments
  ADD COLUMN IF NOT EXISTS channel_index smallint,           -- 0|1 en grabación dual, NULL en mono
  ADD COLUMN IF NOT EXISTS words jsonb;                       -- [{t,s,e}] para karaoke opcional
CREATE INDEX IF NOT EXISTS idx_segments_org_transcript
  ON call_transcript_segments (organization_id, transcript_id, start_ms);

ALTER TABLE call_analyses
  ADD COLUMN IF NOT EXISTS temperature text CHECK (temperature IN ('cold','warm','hot')),
  ADD COLUMN IF NOT EXISTS objection_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applied_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS policy text CHECK (policy IN ('auto','suggest')),
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS cost_amount numeric(10,5),
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text;
-- Duplicado detectado en schema: dos índices idénticos sobre (organization_id, call_id)
DROP INDEX IF EXISTS idx_call_analyses_org_call;
CREATE INDEX IF NOT EXISTS idx_call_analyses_call_created
  ON call_analyses (call_id, created_at DESC);
```

> El CHECK de `sentiment` con `mixed` lo aplica **F0** (`202609_crm_v4_f00_checks`). Verificación en 3.3. Si al aplicar esta migración el CHECK aún no incluye `mixed`, detener: F0 no está desplegada.

#### `202609_crm_v4_f04_enqueue_trigger`

```sql
CREATE OR REPLACE FUNCTION fn_enqueue_transcribe_on_ready()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_auto boolean; v_min integer; v_dur integer;
BEGIN
  IF NEW.status <> 'ready' OR (TG_OP = 'UPDATE' AND OLD.status = 'ready') THEN RETURN NEW; END IF;
  SELECT cs.call_ai_auto_transcribe, cs.call_ai_min_duration_seconds
    INTO v_auto, v_min FROM comm_settings cs WHERE cs.organization_id = NEW.organization_id;
  IF COALESCE(v_auto, true) = false THEN RETURN NEW; END IF;
  SELECT COALESCE(NEW.duration_seconds, c.duration_seconds, 0) INTO v_dur FROM calls c WHERE c.id = NEW.call_id;
  IF v_dur < COALESCE(v_min, 20) THEN RETURN NEW; END IF;
  INSERT INTO outbound_jobs (organization_id, kind, payload, status, run_at, max_attempts, dedupe_key)
  VALUES (NEW.organization_id, 'transcribe',
          jsonb_build_object('call_id', NEW.call_id, 'recording_id', NEW.id, 'organization_id', NEW.organization_id),
          'queued', now(), 3, 'transcribe:' || NEW.call_id::text)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_call_recordings_ready_enqueue ON call_recordings;
CREATE TRIGGER trg_call_recordings_ready_enqueue
  AFTER INSERT OR UPDATE OF status ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_transcribe_on_ready();
```

#### `202609_crm_v4_f04_realtime_publication`

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='call_transcripts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE call_transcripts; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='call_analyses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE call_analyses; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='activities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE activities; END IF;
END $$;
ALTER TABLE call_transcripts REPLICA IDENTITY FULL;
ALTER TABLE call_analyses REPLICA IDENTITY FULL;
```

#### `202609_crm_v4_f04_prompt_templates` (opcional, recomendado)

```sql
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = plantilla global
  kind text NOT NULL CHECK (kind IN ('call_analysis','email_draft','whatsapp_draft','next_action')),
  version integer NOT NULL DEFAULT 1,
  prompt text NOT NULL,
  json_schema jsonb,
  model_hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind, version)
);
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY apt_select ON ai_prompt_templates FOR SELECT USING (
  organization_id IS NULL OR organization_id IN (
    SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
CREATE POLICY apt_insert ON ai_prompt_templates FOR INSERT WITH CHECK (
  organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
CREATE POLICY apt_update ON ai_prompt_templates FOR UPDATE USING (
  organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
CREATE POLICY apt_delete ON ai_prompt_templates FOR DELETE USING (
  organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
```

Patrón RLS idéntico al de `calls` (`calls_select`: `organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true)`).

### 3.2 Seeds

```sql
-- Precios usados por F4 (tabla provider_pricing de F0: provider, sku, unit, unit_cost_usd, credits_per_unit)
INSERT INTO provider_pricing (provider, sku, unit, unit_cost_usd, credits_per_unit) VALUES
  ('elevenlabs','stt.scribe_v2','minute',0.003667,1),
  ('gemini','stt.gemini-2.5-flash-audio','minute',0.0019,1),
  ('openai','stt.gpt-transcribe','minute',0.0045,1),
  ('gemini','llm.call_analysis.gemini-2.5-flash','call',0.003,1),
  ('openai','llm.call_analysis.gpt-5.6-luna','call',0.002,1)
ON CONFLICT (provider, sku) DO NOTHING;

-- Plantilla global v1 del prompt de análisis (organization_id NULL); el texto exacto está en 4.5
INSERT INTO ai_prompt_templates (organization_id, kind, version, prompt, model_hint)
VALUES (NULL, 'call_analysis', 1, '<contenido de CALL_ANALYSIS_PROMPT_V1>', 'gemini-2.5-flash')
ON CONFLICT DO NOTHING;

-- Etiquetas automáticas por org (se crean al vuelo si faltan; seed para la org de prueba)
INSERT INTO call_tags (organization_id, name, color, category, is_auto) VALUES
  (7,'Demo agendada','#10b981','outcome',true), (7,'Objeción de precio','#ef4444','objection',true),
  (7,'Competencia mencionada','#f59e0b','objection',true), (7,'Decisor identificado','#3b82f6','discovery',true),
  (7,'Próximo paso acordado','#8b5cf6','outcome',true), (7,'Sin respuesta / buzón','#94a3b8','quality',true),
  (7,'Caliente','#f97316','temperature',true), (7,'Frío','#60a5fa','temperature',true)
ON CONFLICT (organization_id, name) DO NOTHING;
```

### 3.3 Verificación post-migración

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='call_analyses_sentiment_check';
-- Esperado: contiene 'mixed' (F0). Si no, detener.
SELECT column_name FROM information_schema.columns WHERE table_name='comm_settings' AND column_name LIKE 'call_ai_%';
-- Esperado: 9 filas
SELECT tgname FROM pg_trigger WHERE tgname='trg_call_recordings_ready_enqueue';   -- 1 fila
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'
  AND tablename IN ('call_transcripts','call_analyses','activities');           -- 3 filas
SELECT indexname FROM pg_indexes WHERE tablename='call_analyses';                 -- sin idx_call_analyses_org_call
SELECT conname, confdeltype FROM pg_constraint WHERE contype='f'
  AND conrelid::regclass::text IN ('call_transcripts','call_transcript_segments','call_analyses');
-- Esperado: call_id/transcript_id con confdeltype 'c' (CASCADE) o 'n' (SET NULL) en call_analyses.transcript_id
-- Prueba funcional del trigger (org de prueba, sin proveedor real):
UPDATE call_recordings SET status='ready' WHERE id='<uuid>';
SELECT kind, status, dedupe_key FROM outbound_jobs WHERE dedupe_key='transcribe:<call_id>';  -- 1 fila queued
```

### 3.3.b Índices de unicidad aplicados en la ronda 3 (MCP `apply_migration`)

Migración `crm_v4_f04_r3_unique_objection_and_tag_relations` (2026-09-09, proyecto
`jgmgphmzusbluqhuqihj`). Motivo: `opportunity_objections` y `call_tag_relations` se
escribían con SELECT-then-INSERT, que no es atómico (riesgo señalado por el tester r2),
y `applyAnalysis` usa `upsert(..., { onConflict: 'opportunity_id,objection_id' })`, que
sin el índice falla en runtime con `42P10`. Ambas tablas estaban a 0 filas.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_objections_opp_objection_uidx
  ON public.opportunity_objections (opportunity_id, objection_id);
CREATE UNIQUE INDEX IF NOT EXISTS call_tag_relations_call_tag_uidx
  ON public.call_tag_relations (call_id, tag_id);
```

Verificación (`pg_indexes`, ejecutada tras aplicar): las dos filas existen con
`CREATE UNIQUE INDEX`. Índices previos que ya existían y **no** se tocan:
`activities_call_id_uidx` (DB, ronda 2) e `idx_transcripts_call`.

### 3.4 Impacto en tablas existentes

- `call_transcripts`: una fila por llamada (índice único vigente). Re-transcribir = UPDATE + DELETE de segmentos.
- `call_analyses`: puede haber N por llamada (re-análisis); la UI muestra la última por `created_at`. **Sin UNIQUE por diseño** (es histórico): dos `analyzeCall` concurrentes crearían dos análisis y cobrarían dos veces; lo evita el `dedupe_key` de `outbound_jobs` (`analyze:{call_id}` sobre jobs `queued|running`). Riesgo declarado, no cerrado.
- `opportunity_objections` / `call_tag_relations`: una fila por par (índices únicos de §3.3.b); los INSERT perdedores reutilizan la fila ganadora en vez de duplicar.
- `activities`: la fila de la llamada la crea el trigger `trg_calls_completed_activity` (F0/F3) al completar; F4 la **enriquece** (nunca crea una segunda).
- Deja de usarse: Deepgram en `transcriptionService.ts`, `src/app/api/crm/transcribe/route.ts` (se borra en F5 cuando `ActivityActions` desaparece), `mapRecordingStatus` de `voice/recording` (F3).

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| POST | `/api/crm/calls/[id]/transcribe` (existe, cambia contrato) | sesión | `{ force?: boolean; provider?: 'elevenlabs'|'gemini'|'openai' }` | `202 {success, data:{job_id, transcript_id?, status}}`; `200` si ya `completed` y `!force` | 404 llamada no es de la org; 409 sin grabación `ready`; 402 sin créditos | `dedupe_key='transcribe:{callId}'` (+`:retry:{n}` con force) |
| GET | `/api/crm/calls/[id]/transcript` (existe) | sesión | `?segments=1` | `{success, data:{...call_transcripts, segments:[]}}` | 404 | — |
| POST | `/api/crm/calls/[id]/analyze` (existe, cambia) | sesión | `{ force?: boolean }` | `202 {job_id}` o `200` análisis existente | 409 sin transcripción completada; 402 | `analyze:{transcriptId}` |
| GET | `/api/crm/calls/[id]/analyze` (existe) | sesión | — | último `call_analyses` + `tags` + `objections` hidratadas | 404 | — |
| POST | `/api/crm/calls/[id]/analysis/apply` (existe, cambia) | sesión | `{ analysisId?: string; actions: { stage?: boolean; tasks?: number[]; tags?: boolean; discovery?: boolean }; ignore_gate?: boolean }` | `{success, data:{applied:[...], skipped:[...], gate?: GateResult}}` | 409 gate no cumplido (si `!ignore_gate`) | Cada acción marca `applied_actions[]`; repetir no duplica |
| GET | `/api/crm/calls/[id]/intelligence` **NUEVO** | sesión | — | `{transcript:{status,error_code}, analysis:{status}, jobs:[{kind,status,attempts,last_error}], cost_usd}` | 404 | — (fallback de polling cuando no hay realtime) |
| POST | `/api/crm/webhooks/elevenlabs` **NUEVO** | firma `ElevenLabs-Signature` | payload `speech_to_text_transcription` (4.3) | `200 {received:true}` | 401 firma inválida; 404 request_id desconocido → 200 (no reintentar) | `provider_request_id` único |
| POST | `/api/crm/jobs/run` (F0) | `Authorization: Bearer CRON_SECRET` | `{ kinds?: string[] }` | `{claimed, done, failed}` | 401 fail-closed | `fn_claim_jobs` |
| GET/PATCH | `/api/crm/settings/call-ai` **NUEVO** | sesión (PATCH requiere rol admin de la org) | PATCH: subconjunto de las 9 columnas `call_ai_*` + `stt_provider` (escribe `provider_configs` category `stt`) | `{success, data}` | 403 | — |

Todas las rutas de sesión usan `getServerOrgContext()` (`src/lib/utils/orgContext.ts:24`) y filtran por `ctx.organizationId`; los jobs y el webhook usan `createClient` de `@supabase/supabase-js` con service role y **siempre** filtran por el `organization_id` guardado en el job/fila (D7).

### 4.2 Servicios

**`src/lib/services/crm/stt/types.ts`** (NUEVO)

```ts
export interface SttInput {
  audio: Uint8Array;            // mp3/wav tal cual está en Storage
  mimeType: 'audio/mpeg' | 'audio/wav';
  languageCode: string;         // 'spa' (ElevenLabs) → cada adaptador traduce ('es', ['es'])
  durationSeconds: number;
  channels: 1 | 2;
  diarize: boolean;
  numSpeakers?: number;
  webhook?: { enabled: boolean; webhookId?: string };
}
export interface TranscriptWord { text: string; startMs: number; endMs: number; speakerId: string | null; confidence?: number }
export interface TranscriptResult {
  provider: 'elevenlabs' | 'gemini' | 'openai';
  model: string;
  language: string; languageProbability?: number;
  fullText: string;
  words: TranscriptWord[];                 // vacío en OpenAI gpt-transcribe (solo segments)
  segments: Array<{ speakerId: string | null; startMs: number; endMs: number; text: string; confidence?: number }>;
  durationSeconds: number;
  providerRequestId?: string;              // Scribe transcription_id
  pending?: boolean;                        // true cuando se envió con webhook
  raw: unknown;
}
export interface SttAdapter {
  readonly name: TranscriptResult['provider'];
  readonly supportsDiarization: boolean;
  readonly maxDurationSeconds: number;      // ElevenLabs 36000, Gemini 34200, OpenAI ~1500 (25 MB)
  transcribe(input: SttInput): Promise<TranscriptResult>;
}
```

**`src/lib/services/crm/stt/elevenLabsScribeAdapter.ts`**, **`geminiAudioAdapter.ts`**, **`openaiTranscribeAdapter.ts`** (NUEVOS): una clase cada uno implementando `SttAdapter`; snippets en 4.5.

**`src/lib/services/crm/stt/index.ts`** (NUEVO)

```ts
export async function resolveSttChain(orgId: number, supabase: SupabaseClient, preferred?: string): Promise<SttAdapter[]>;
// Lee provider_configs category 'stt' (priority ASC) vía getActiveProvider; fallback env; orden final:
// [preferido | elevenlabs, gemini, openai] filtrando los que no tengan API key.
```

**`src/lib/services/crm/stt/channelRoleMapper.ts`** (NUEVO)

```ts
export type RoleMap = { byChannel: Record<'0'|'1','agent'|'customer'>; bySpeaker: Record<string,'agent'|'customer'|'unknown'>; method: 'channel'|'heuristic' };
export async function buildRoleMap(audio: Uint8Array, mimeType: string, words: TranscriptWord[],
  call: { direction: 'inbound'|'outbound'; mode: string; channels: 1|2 }): Promise<RoleMap>;
export function assignRoles(segments: TranscriptResult['segments'], map: RoleMap): Array<TranscriptResult['segments'][number] & { speakerRole: 'agent'|'customer'|'unknown'; channelIndex: 0|1|null }>;
```

**`src/lib/services/crm/stt/piiMasker.ts`** (PLANEADO — ⚠️ **NO EXISTE**, ver §14.2)

```ts
export function maskPii(text: string, opts: { cards: boolean; cvv: boolean; ids?: boolean }): { text: string; masked: number };
// Tarjetas: secuencias de 13-19 dígitos (con espacios/guiones) que pasan Luhn → "[TARJETA ****1234]"
// CVV: "cvv|código de seguridad" seguido de 3-4 dígitos → "[CVV]"
// ids (cédula/NIT) opcional, default false
```

> **Desviación (ronda 4, tester r3 §4 nº 14 y 15).** Este archivo nunca se creó: el
> enmascarado vive en `maskSensitiveForLlm` (`callAnalysisRules.ts`), el marcador real es
> **`[OCULTO]`** (no `[CVV]`) y los separadores de tarjeta admitidos son espacios, guiones,
> **puntos** y el salto de línea con prefijo de segmento. Lo de arriba es el plan original y
> se conserva sólo como historia.

**`src/lib/services/crm/transcriptionService.ts`** (refactor; conserva tipos exportados)

```ts
export async function transcribeCall(callId: string, orgId: number, supabase: SupabaseClient,
  opts?: { force?: boolean; preferredProvider?: string; jobId?: string }): Promise<CallTranscript | null>;
export async function completeTranscriptFromWebhook(providerRequestId: string, payload: ScribeWebhookPayload,
  supabase: SupabaseClient /* service role */): Promise<CallTranscript | null>;
export async function persistTranscript(transcriptId: string, orgId: number, result: TranscriptResult, roleMap: RoleMap,
  supabase: SupabaseClient): Promise<CallTranscript>;   // UPDATE fila + DELETE/INSERT segmentos en una RPC fn_replace_transcript_segments
export async function getTranscript(callId: string, orgId: number, supabase: SupabaseClient, withSegments?: boolean): Promise<CallTranscript | null>; // existe
```

Responsabilidades: cargar `call_recordings` con `status='ready'` (fix C7), descargar de `crm-call-recordings` usando `storage_path` completo (fix C8), respetar `comm_settings.call_ai_*`, cobrar créditos, iterar la cadena de adaptadores, mapear roles, enmascarar PII, persistir, encolar `analyze` si `call_ai_auto_analyze`. Deepgram se elimina.

**`src/lib/services/crm/callAnalysisService.ts`** (refactor)

```ts
export async function analyzeCall(callId: string, orgId: number, supabase: SupabaseClient,
  opts?: { force?: boolean; jobId?: string }): Promise<CallAnalysis | null>;
export async function buildAnalysisContext(callId: string, orgId: number, supabase: SupabaseClient): Promise<AnalysisContext>;
export async function applyAnalysis(analysisId: string, orgId: number, userId: string | null, supabase: SupabaseClient,
  actions: ApplyActions, opts?: { ignoreGate?: boolean; source: 'user'|'policy' }): Promise<ApplyResult>;
export async function getAnalysis(callId: string, orgId: number, supabase: SupabaseClient): Promise<CallAnalysis | null>; // existe
export interface AnalysisContext {
  call: { id: string; direction: string; durationSeconds: number; userId: string | null; startedAt: string };
  customer: { id: string; fullName: string | null; companyName: string | null } | null;
  opportunity: { id: string; name: string; amount: number | null; currency: string | null; stageId: string; stageName: string;
    pipelineId: string; stages: Array<{ id: string; name: string; position: number; exitCriteria: unknown }>; discoveryData: Record<string, unknown> } | null;
  objections: Array<{ id: string; title: string; category: string; signals: unknown }>;
  tags: Array<{ id: string; name: string }>;
  recentActivities: Array<{ type: string; outcome: string | null; occurredAt: string }>;
  policy: CallAiPolicy; promptTemplate: { version: number; prompt: string };
}
export type ApplyActions = { stage?: boolean; tasks?: number[] | 'all'; tags?: boolean; discovery?: boolean; opportunity?: boolean };
export interface ApplyResult { applied: string[]; skipped: Array<{ action: string; reason: string }>; gate?: GateResult }
```

Fixes obligatorios: `customers` → `full_name, company_name` (C-6 :349); `opportunities` → `name, stage_id, pipeline_id, discovery_data, salesperson_id` (:363); validar `suggested_stage_id` contra `context.opportunity.stages`, si no pertenece → `null` + `raw_response.rejected_stage_id`; tareas con `priority` mapeada `low→low, medium→med, high→high, urgent→critical`, `status='open'`, `assigned_to = opportunities.salesperson_id ?? calls.user_id`; `sentiment` con `mixed` (CHECK de F0); `applyAnalysis` usa `evaluateStageGate` antes de mover etapa y registra `applied_actions`.

**`src/lib/services/crm/callActivityService.ts`** (NUEVO)

```ts
export interface CallActivityEnrichment {
  summary?: string; sentiment?: string; qualityScore?: number; temperature?: string;
  transcriptId?: string; analysisId?: string; nextSteps?: unknown[]; tags?: string[]; outcome?: string;
}
export async function upsertCallActivity(callId: string, orgId: number, supabase: SupabaseClient,
  enrich?: CallActivityEnrichment): Promise<{ activityId: string; created: boolean }>;
// 1. SELECT activities WHERE call_id=callId AND organization_id=orgId (índice F0 idx_activities_call)
// 2. Si no existe (llamada manual/antigua): INSERT {activity_type:'call', channel: mode==='ai_agent'?'voice_ai':'phone',
//    related_type:'opportunity'|'customer', related_id, user_id: calls.user_id, occurred_at: calls.started_at,
//    duration_seconds, outcome: mapCallStatusToOutcome(status, answered_by)}
// 3. UPDATE notes = enrich.summary ?? notes, metadata = metadata || {transcript_id, analysis_id, sentiment, quality_score, next_steps, tags, temperature}
export async function touchOpportunityFromCall(callId: string, orgId: number, supabase: SupabaseClient,
  patch: { contactResult: string; temperature?: string; discovery?: Record<string, unknown> }): Promise<void>;
// UPDATE opportunities SET last_contact_at=calls.ended_at, contact_channel='call', contact_result, temperature (solo si hot/cold con conf ≥ umbral),
//   discovery_data = discovery_data || patch.discovery (merge superficial, no borra claves existentes)
```

**`src/lib/services/crm/callIntelligencePolicy.ts`** (NUEVO)

```ts
export interface CallAiPolicy { autoTranscribe: boolean; autoAnalyze: boolean; apply: 'auto'|'suggest'; language: string;
  minDurationSeconds: number; stageConfidenceThreshold: number; piiMasking: boolean; retentionDays: number; monthlyBudgetUsd: number | null }
export async function getCallAiPolicy(orgId: number, supabase: SupabaseClient): Promise<CallAiPolicy>;
export async function runPostAnalysisActions(analysis: CallAnalysis, ctx: AnalysisContext, supabase: SupabaseClient): Promise<ApplyResult>;
// auto: applyAnalysis({stage: conf ≥ threshold, tasks:'all', tags:true, discovery:true, opportunity:true}, {source:'policy'})
// suggest: applyAnalysis({tags:true, discovery:true, opportunity:true}) + notificación "Revisa las sugerencias"
// siempre: fn_create_org_notification(orgId, salesperson_id ?? call.user_id, 'in_app', 'call_analyzed', title, content, {call_id, analysis_id, opportunity_id})
```

**`src/lib/services/crm/jobs/handlers/transcribeJob.ts`** y **`analyzeJob.ts`** (NUEVOS; registrados en el runner de F0)

```ts
export const transcribeJob: JobHandler<'transcribe'> = async (job, supabase) => { /* transcribeCall(job.payload.call_id, job.organization_id, supabase, {jobId: job.id, force: job.payload.force}) */ };
export const analyzeJob: JobHandler<'analyze'> = async (job, supabase) => { /* analyzeCall(...) → runPostAnalysisActions */ };
```

**`src/lib/services/aiCostService.ts`** (F0/D6; F4 lo consume)

```ts
export async function estimateCost(provider: string, sku: string, units: number, supabase: SupabaseClient): Promise<{ usd: number; credits: number }>;
export async function chargeAiCredits(orgId: number, params: { provider: string; sku: string; units: number; actionType: string; userId?: string | null; metadata?: Record<string, unknown> }, supabase: SupabaseClient): Promise<{ ok: boolean; credits: number; usd: number; reason?: 'INSUFFICIENT_CREDITS'|'BUDGET_EXCEEDED' }>;
// RPC decrement_ai_credits(p_org_id, p_cost) → boolean; si false → reason; INSERT ai_usage_logs {action_type, model: sku, credits_consumed, metadata{usd, units, provider, call_id}}
export async function settleAiCost(usageLogId: number, actualUsd: number, tokens?: { prompt: number; completion: number }, supabase): Promise<void>;
```

### 4.3 Webhooks / proveedor

**ElevenLabs `speech_to_text_transcription`** (docs-elevenlabs.md §Speech to Text). Payload real:

```json
{ "type": "speech_to_text_transcription", "event_timestamp": 1757340000,
  "data": { "request_id": "stt_01J9...", "transcription": {
     "language_code": "spa", "language_probability": 0.99, "text": "Hola Juan, ...",
     "words": [ { "text": "Hola", "type": "word", "start": 0.12, "end": 0.41, "speaker_id": "speaker_0", "logprob": -0.01 },
                { "text": " ", "type": "spacing", "start": 0.41, "end": 0.43 } ],
     "audio_duration_secs": 612.4, "transcription_id": "stt_01J9..." } } }
```

Verificación y mapeo (`src/app/api/crm/webhooks/elevenlabs/route.ts`):

```ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
export async function POST(req: NextRequest) {
  const raw = await req.text();                                   // firma sobre body crudo (gotcha 5)
  const sig = req.headers.get('ElevenLabs-Signature') ?? '';
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
  let event: { type: string; data: Record<string, unknown> };
  try { event = client.webhooks.constructEvent(raw, sig, process.env.ELEVENLABS_WEBHOOK_SECRET!) as typeof event; }
  catch { return NextResponse.json({ error: 'invalid signature' }, { status: 401 }); }
  if (event.type !== 'speech_to_text_transcription') return NextResponse.json({ received: true });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const requestId = String((event.data as { request_id: string }).request_id);
  // completeTranscriptFromWebhook busca call_transcripts por (provider='elevenlabs', provider_request_id) y usa SU organization_id
  await completeTranscriptFromWebhook(requestId, event.data as ScribeWebhookPayload, admin);
  return NextResponse.json({ received: true });                  // 200 siempre tras verificar: ElevenLabs reintenta 5 veces en 5xx
}
```

Mapeo a BD: `words[]` → agrupar por `speaker_id` en segmentos cuando cambia el hablante o hay pausa > 1.2 s; `start/end` s → ms; `text` → `full_text`; `audio_duration_secs` → `duration_seconds`; `language_probability` → `confidence`; `transcription_id` → `provider_request_id`; `raw_response` = payload sin `words` (peso) salvo `call_ai_debug`.

**Timeout async:** el job `transcribe` en modo webhook deja `status='processing'` y encola `transcribe_check` (`run_at = now()+30min`, `dedupe_key='transcribe_check:{transcript_id}'`); si sigue `processing`, marca `failed` `WEBHOOK_TIMEOUT` y re-encola `transcribe` síncrono con Gemini.

### 4.4 Jobs / cola (`outbound_jobs`, F0)

| kind | payload | Reintentos | Notas |
|---|---|---|---|
| `transcribe` | `{call_id, recording_id, organization_id, force?, provider?}` | 3, backoff 1/5/15 min | Errores no reintentables: `NO_RECORDING`, `AUDIO_EMPTY`, `AUDIO_TOO_SHORT`, `INSUFFICIENT_CREDITS` → `failed` directo (`retryable=false`). |
| `transcribe_check` | `{transcript_id, organization_id}` | 1 | Solo modo webhook. |
| `analyze` | `{call_id, transcript_id, organization_id, force?}` | 3 | Proveedor caído → cambia a fallback en el mismo intento; JSON inválido tras 2 intentos de reparación → siguiente proveedor. |
| `recording_cleanup` (F3, ampliado) | `{organization_id}` diario | 1 | Además de grabaciones: `call_transcripts` con `completed_at < now() - retention_days` → `full_text=NULL`, borra segmentos, `pii_masked=true`, conserva `call_analyses.summary`. |

`fn_claim_jobs(p_kind, p_limit)` con `FOR UPDATE SKIP LOCKED`; `locked_by = 'vercel:' || request id`; `maxDuration = 300` en la ruta del runner; un job de transcripción síncrona no debe exceder 240 s: audio > 30 min → modo webhook obligatorio.

### 4.5 Snippets de las partes no obvias

**ElevenLabs Scribe v2 (SDK `@elevenlabs/elevenlabs-js` ^2.67; nombres verificados en docs-elevenlabs.md)**

```ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
export class ElevenLabsScribeAdapter implements SttAdapter {
  name = 'elevenlabs' as const; supportsDiarization = true; maxDurationSeconds = 36000;
  constructor(private apiKey: string) {}
  async transcribe(input: SttInput): Promise<TranscriptResult> {
    const client = new ElevenLabsClient({ apiKey: this.apiKey });
    const file = new Blob([input.audio], { type: input.mimeType });
    const async = input.webhook?.enabled === true;
    const res = await client.speechToText.convert({
      file, modelId: 'scribe_v2', languageCode: input.languageCode,      // 'spa'
      diarize: input.diarize, numSpeakers: input.numSpeakers ?? 2,
      timestampsGranularity: 'word', tagAudioEvents: false,
      ...(async ? { webhook: true, webhookId: input.webhook!.webhookId } : {}),
    });
    if (async) return { provider: 'elevenlabs', model: 'scribe_v2', language: input.languageCode, fullText: '',
      words: [], segments: [], durationSeconds: input.durationSeconds,
      providerRequestId: (res as { transcriptionId?: string; requestId?: string }).transcriptionId ?? (res as { requestId?: string }).requestId, pending: true, raw: res };
    return mapScribeResponse(res);   // words[]{text,type,start,end,speakerId} → TranscriptWord/segments
  }
}
```

**Asignación de rol por canal (decisión):** la grabación dual de Twilio (F3: `recordingChannels:'dual'`, descarga `?RequestedChannels=2`) es **un solo** archivo estéreo: canal 0 = pierna que originó (agente en outbound, cliente en inbound), canal 1 = la otra. Twilio no entrega dos archivos separados (`recordingTrack` solo elige qué pierna grabar: `inbound|outbound|both`, un archivo). Opciones evaluadas: (a) separar con ffmpeg y transcribir cada canal mono: roles perfectos pero **2× costo Scribe** ($0.44/h) y dos requests; (b) confiar en `channel_index` de `words[]`: aparece como opcional en docs y no está garantizado; (c) **elegida**: una sola transcripción diarizada del archivo estéreo + mapa de actividad por canal calculado con `ffmpeg-static` (`silencedetect` sobre cada canal) → para cada `speaker_id`, votar en qué canal hay voz durante sus palabras. Determinista, 1× costo, sin depender de campos opcionales; si ffmpeg falla o la grabación es mono, cae a heurística por dirección (`method:'heuristic'`).

```ts
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
async function speechIntervals(audio: Uint8Array, channel: 0 | 1): Promise<Array<[number, number]>> {
  // Extrae intervalos con voz del canal: pan a mono + silencedetect (-35 dB, 0.4 s). Salida en stderr.
  const args = ['-hide_banner', '-nostats', '-i', 'pipe:0', '-af',
    `pan=mono|c0=c${channel},silencedetect=noise=-35dB:d=0.4`, '-f', 'null', '-'];
  const stderr = await new Promise<string>((res, rej) => {
    const p = execFile(ffmpegPath as string, args, { maxBuffer: 8 * 1024 * 1024 }, (e, _o, err) => e && !err ? rej(e) : res(err));
    p.stdin!.end(Buffer.from(audio));
  });
  const silences = [...stderr.matchAll(/silence_start: ([\d.]+)|silence_end: ([\d.]+)/g)];
  // invertir silencios → intervalos de voz [startMs, endMs]
  return invertSilences(silences, /*durationMs*/ undefined);
}
export async function buildRoleMap(audio, mimeType, words, call): Promise<RoleMap> {
  const byChannel = call.direction === 'outbound' ? { '0': 'agent', '1': 'customer' } : { '0': 'customer', '1': 'agent' } as const;
  if (call.channels !== 2 || !ffmpegPath) return heuristicMap(words, call, byChannel);
  const [ch0, ch1] = await Promise.all([speechIntervals(audio, 0), speechIntervals(audio, 1)]);
  const votes: Record<string, { c0: number; c1: number }> = {};
  for (const w of words) { if (!w.speakerId) continue; const mid = (w.startMs + w.endMs) / 2;
    votes[w.speakerId] ??= { c0: 0, c1: 0 }; if (inside(ch0, mid)) votes[w.speakerId].c0++; if (inside(ch1, mid)) votes[w.speakerId].c1++; }
  const bySpeaker = Object.fromEntries(Object.entries(votes).map(([s, v]) => [s, v.c0 === v.c1 ? 'unknown' : (v.c0 > v.c1 ? byChannel['0'] : byChannel['1'])]));
  return { byChannel, bySpeaker, method: 'channel' };
}
```

`next.config.js`: añadir `outputFileTracingIncludes: { '/api/crm/jobs/run': ['./node_modules/ffmpeg-static/**'] }` y `serverExternalPackages: ['ffmpeg-static']` (ya existe `outputFileTracingRoot: __dirname` en :51). Binario ≈ 75 MB, dentro del límite de 250 MB de Vercel.

**Gemini 2.5 Flash como STT de fallback (Files API + Interactions con `response_format`; docs-gemini.md)**

```ts
import { GoogleGenAI } from '@google/genai';
const SEGMENTS_SCHEMA = { type: 'object', properties: { language: { type: 'string' },
  segments: { type: 'array', items: { type: 'object', properties: {
    speaker: { type: 'string', enum: ['speaker_0', 'speaker_1'] }, start: { type: 'string' }, end: { type: 'string' }, text: { type: 'string' } },
    required: ['speaker', 'start', 'end', 'text'] } } }, required: ['language', 'segments'] };
export class GeminiAudioAdapter implements SttAdapter {
  name = 'gemini' as const; supportsDiarization = true; maxDurationSeconds = 34200;
  async transcribe(input: SttInput): Promise<TranscriptResult> {
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const tmp = await writeTmp(input.audio, input.mimeType === 'audio/wav' ? 'wav' : 'mp3');
    const file = await client.files.upload({ file: tmp, config: { mimeType: input.mimeType === 'audio/wav' ? 'audio/wav' : 'audio/mp3' } });
    const interaction = await client.interactions.create({
      model: 'gemini-2.5-flash',
      input: [
        { type: 'text', text: 'Transcribe literalmente en español esta llamada comercial. Separa por hablante (speaker_0 = primero que habla). Timestamps MM:SS.mmm. No resumas ni omitas.' },
        { type: 'audio', uri: file.uri, mime_type: file.mimeType },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: SEGMENTS_SCHEMA },
    });
    return mapGeminiSegments(JSON.parse(interaction.output_text), input);   // MM:SS.mmm → ms; words=[]
  }
}
```

**OpenAI `gpt-transcribe` (tercer fallback, sin diarización; `languages` es array, docs-openai.md gotcha 5)**

```ts
const res = await openai.audio.transcriptions.create({
  file: await toFile(Buffer.from(input.audio), 'call.mp3'), model: 'gpt-transcribe',
  languages: ['es'], response_format: 'json', prompt: 'Llamada comercial en español colombiano.',
});
// ≤ 25 MB: si input.audio > 24 MB → recodificar con ffmpeg a 32 kbps mono antes. Segmentos = frases; speakerId=null → roles por heurística de canal imposible → 'unknown' salvo que channelRoleMapper tenga intervalos (usa intervalos por canal para partir frases).
```

**Prompt de análisis en español (`CALL_ANALYSIS_PROMPT_V1`, ≤ 60 líneas; se guarda en `ai_prompt_templates`)**

```text
Eres analista senior de ventas B2B en Colombia. Analiza la transcripción de una llamada comercial y devuelve
EXCLUSIVAMENTE un JSON válido conforme al esquema. No inventes datos: si algo no se dice en la llamada, usa null o [].

CONTEXTO
- Dirección: {{call.direction}} · Duración: {{call.durationSeconds}} s · Fecha: {{call.startedAt}}
- Cliente: {{customer.fullName}} ({{customer.companyName}})
- Oportunidad: {{opportunity.name}} · Monto: {{opportunity.amount}} {{opportunity.currency}}
- Etapa actual: {{opportunity.stageName}} (id {{opportunity.stageId}})
- Etapas del pipeline, en orden (usa SOLO estos ids en suggested_stage_id; null si no hay evidencia clara):
{{#each opportunity.stages}}  - {{id}} | {{name}} | criterios de salida: {{exitCriteriaText}}
{{/each}}
- Catálogo de objeciones de la organización (usa el id en objections[].objection_id; null si no encaja):
{{#each objections}}  - {{id}} | {{title}} | {{category}} | señales: {{signalsText}}
{{/each}}
- Etiquetas disponibles: {{tagsCsv}}
- Discovery ya conocido: {{discoveryJson}}
- Actividades recientes: {{recentActivitiesText}}

REGLAS
1. summary: 3-5 frases, en español neutro, hechos y acuerdos, sin adjetivos vacíos.
2. sentiment: positive | neutral | negative | mixed (mixed = cambia de tono o hay señales opuestas). sentiment_score entre -1 y 1.
3. quality_score 0-100 = promedio ponderado de quality_breakdown (greeting 10 %, discovery 25 %, pitch 20 %,
   objection_handling 20 %, closing 15 %, professionalism 10 %). Sé exigente: 80+ solo con próximo paso fechado.
4. talk_ratio_agent + talk_ratio_customer = 1, calculados con los turnos marcados [AGENTE]/[CLIENTE].
5. objections: cada objeción con objection_id del catálogo o null, quote textual corto y confidence.
6. next_steps: compromisos explícitos; due_date ISO (YYYY-MM-DD) relativa a la fecha de la llamada; owner agent|customer.
7. suggested_stage_id: solo si los criterios de salida de la etapa actual se cumplen en la llamada; confidence 0-1.
8. suggested_tasks: máximo 3, accionables, con due_date; type call|email|whatsapp|meeting|task; priority low|med|high|critical.
9. temperature: hot (decisor + presupuesto + fecha), warm (interés y próximo paso), cold (evasivas, sin próximo paso).
10. discovery: budget, authority, need, timeline (BANT) y goals, obstacles, consequences (GOC); string corto o null.
11. tags: subconjunto de las etiquetas disponibles; añade "Sin respuesta / buzón" si no hubo conversación real.
12. Idioma de salida: español. No incluyas texto fuera del JSON.

TRANSCRIPCIÓN ({{transcript.segmentCount}} turnos)
{{transcript.text}}   ← formato por línea: [mm:ss] [AGENTE|CLIENTE]: texto
```

**Schema JSON exacto de salida** (`CALL_ANALYSIS_JSON_SCHEMA`; se usa como `responseSchema` en Gemini y como `zodTextFormat` en OpenAI):

```json
{ "type":"object","additionalProperties":false,"required":["summary","sentiment","sentiment_score","quality_score","quality_breakdown",
  "talk_ratio_agent","talk_ratio_customer","longest_monologue_seconds","questions_asked","next_steps","objections","competitors",
  "budget_mentioned","decision_maker_identified","discovery","suggested_stage_id","suggested_stage_confidence","suggested_tasks","tags","temperature"],
  "properties":{
   "summary":{"type":"string"},
   "sentiment":{"type":"string","enum":["positive","neutral","negative","mixed"]},
   "sentiment_score":{"type":"number"},
   "quality_score":{"type":"integer"},
   "quality_breakdown":{"type":"object","additionalProperties":false,"required":["greeting","discovery","pitch","objection_handling","closing","professionalism"],
     "properties":{"greeting":{"type":"integer"},"discovery":{"type":"integer"},"pitch":{"type":"integer"},"objection_handling":{"type":"integer"},"closing":{"type":"integer"},"professionalism":{"type":"integer"}}},
   "talk_ratio_agent":{"type":"number"},"talk_ratio_customer":{"type":"number"},
   "longest_monologue_seconds":{"type":"integer"},"questions_asked":{"type":"integer"},
   "next_steps":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["action","owner","due_date"],
     "properties":{"action":{"type":"string"},"owner":{"type":"string","enum":["agent","customer"]},"due_date":{"type":["string","null"]}}}},
   "objections":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["objection_id","label","quote","confidence"],
     "properties":{"objection_id":{"type":["string","null"]},"label":{"type":"string"},"quote":{"type":"string"},"confidence":{"type":"number"}}}},
   "competitors":{"type":"array","items":{"type":"string"}},
   "budget_mentioned":{"type":["number","null"]},
   "decision_maker_identified":{"type":"boolean"},
   "discovery":{"type":"object","additionalProperties":false,"required":["budget","authority","need","timeline","goals","obstacles","consequences"],
     "properties":{"budget":{"type":["string","null"]},"authority":{"type":["string","null"]},"need":{"type":["string","null"]},"timeline":{"type":["string","null"]},
       "goals":{"type":["string","null"]},"obstacles":{"type":["string","null"]},"consequences":{"type":["string","null"]}}},
   "suggested_stage_id":{"type":["string","null"]},"suggested_stage_confidence":{"type":"number"},
   "suggested_tasks":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["title","type","priority","due_date"],
     "properties":{"title":{"type":"string"},"type":{"type":"string","enum":["call","email","whatsapp","meeting","task"]},
       "priority":{"type":"string","enum":["low","med","high","critical"]},"due_date":{"type":["string","null"]}}}},
   "tags":{"type":"array","items":{"type":"string"}},
   "temperature":{"type":"string","enum":["cold","warm","hot"]}}}
```

**Gemini análisis (mantener `generateContent` + `responseSchema` existente en `callAnalysisService.ts:203-285`, ampliado con las claves nuevas; alternativa Interactions):**

```ts
const interaction = await client.interactions.create({
  model: policy.analysisModel ?? 'gemini-2.5-flash',
  input: [{ type: 'text', text: renderPrompt(template.prompt, ctx) }],
  response_format: { type: 'text', mime_type: 'application/json', schema: CALL_ANALYSIS_JSON_SCHEMA },
  generation_config: { temperature: 0.2 },
});
const parsed = analysisZod.parse(JSON.parse(interaction.output_text));   // zod espejo del schema (integer→number, enums)
```

**OpenAI fallback (`responses.parse` + `zodTextFormat`; docs-openai.md)**

```ts
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
const openai = new OpenAI({ apiKey });                       // instancia por org (C-18: nada de singleton de módulo)
const response = await openai.responses.parse({
  model: 'gpt-5.6-luna', reasoning: { effort: 'none' }, store: false,
  input: [{ role: 'system', content: 'Devuelve solo JSON conforme al esquema.' }, { role: 'user', content: renderPrompt(template.prompt, ctx) }],
  text: { format: zodTextFormat(analysisZod, 'call_analysis') },
});
if (response.output[0]?.type === 'refusal') throw new Error('REFUSAL');
const parsed = response.output_parsed!;
```

**Formato de transcripción para el LLM** (`renderTranscriptForLlm(segments)`): `[03:12] [CLIENTE]: ...` con roles ya mapeados; se trunca a 12 000 palabras (≈ 1 h) manteniendo inicio y final; se aplica `maskPii` antes de enviar.

### 4.6 Variables de entorno

| Variable | Nueva | Uso |
|---|---|---|
| `ELEVENLABS_API_KEY` | existe | Scribe (fallback env de `provider_configs.stt`). |
| `ELEVENLABS_WEBHOOK_SECRET` | **nueva** | `constructEvent` en `/api/crm/webhooks/elevenlabs`. |
| `ELEVENLABS_STT_WEBHOOK_ID` | **nueva** | `webhookId` del webhook creado en ElevenLabs Settings → apunta a `${APP_URL}/api/crm/webhooks/elevenlabs`. |
| `GOOGLE_AI_API_KEY` | existe | Gemini audio + análisis. `GEMINI_API_KEY` deja de leerse (unificar). |
| `OPENAI_API_KEY` | existe | `gpt-transcribe` y `gpt-5.6-luna`. |
| `CRON_SECRET` | existe | Runner de jobs (F0). |
| `SUPABASE_SERVICE_ROLE_KEY` | existe | Jobs y webhook. |
| `CALL_AI_DEBUG` | **nueva** (opcional) | Guarda `raw_response` completo con `words[]`. |
| `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL` | eliminar | Deepgram sale del stack. |

### 4.7 Dependencias npm

| Paquete | Versión | Motivo |
|---|---|---|
| `@elevenlabs/elevenlabs-js` | `^2.67.0` | Scribe v2 + `webhooks.constructEvent` (el paquete `elevenlabs` está deprecado). |
| `@google/genai` | `^2.21.0` (subir desde ^2.20.0) | Interactions API + Files API; no pasar a 3.x (exige Node 22). |
| `openai` | `^6.15.0` (mantener) | `responses.parse`/`zodTextFormat` disponibles; 7.x exige Node 22. |
| `ffmpeg-static` | `^5.2.0` | Binario ffmpeg para `silencedetect` y recodificación > 25 MB. |
| `zod` | `^3.25.67` (existe) | Validación de salida. |

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| `/app/crm/llamadas` | `src/app/app/crm/llamadas/page.tsx` (existe, 205 L) | Filas expandibles con transcripción y análisis; entrada en el nav la añade F9/F3 (`AppLayout.tsx:127-138`). |
| `/app/configuracion?modulo=crm` → tab Telefonía → sección "Inteligencia de llamadas" | `src/components/configuracion/crm/CallIntelligenceSettings.tsx` **NUEVO** | Política auto/suggest, idioma, proveedor STT, umbral, PII, retención, presupuesto. |
| Timeline (F9) | `src/components/crm/timeline/entries/CallEntry.tsx` (F9) | Reutiliza `CallPlayer`, `CallTranscriptPanel`, `CallAnalysisPanel`. |

### 5.2 Componentes

| Archivo | Props (TS) | Estado / hooks / servicios | Tamaño |
|---|---|---|---|
| `src/components/voice/CallPlayer.tsx` (modificar) | `{ callId; recordingEnabled; className?; onTimeUpdate?: (ms:number)=>void }` + `forwardRef<CallPlayerHandle>` con `{ seek(ms); play(); pause(); currentMs }` | `useImperativeHandle`; audio `<audio>` sobre `/api/voice/recording/{id}/stream` (existente). | ≤ 220 L |
| `src/components/voice/CallTranscriptPanel.tsx` **NUEVO** | `{ callId; playerRef?: RefObject<CallPlayerHandle>; currentMs?: number; compact?: boolean }` | `useCallIntelligence(callId)`; render virtualizado si > 300 segmentos (`@tanstack/react-virtual` NO está: usar paginación de 100 segmentos "mostrar más"); búsqueda con `<Input>` y resaltado; botón copiar (`navigator.clipboard`); segmento activo por `currentMs`. | ≤ 280 L |
| `src/components/voice/CallAnalysisPanel.tsx` **NUEVO** | `{ callId; opportunityId?: string; onApplied?: () => void; compact?: boolean }` | `useCallIntelligence`; POST `analysis/apply`; abre `GateWarningDialog` (`src/components/crm/pipeline/GateWarningDialog.tsx:15`, props `{open,onClose,onConfirm,missing:string[],stageName}`) cuando `gate.ok=false`; "crear tarea" por índice; "aplicar todo". | ≤ 300 L |
| `src/components/voice/CallIntelligenceStatus.tsx` **NUEVO** | `{ transcript?: {status,error_code}; analysis?: {status}; jobs: JobSummary[]; onRetry: (kind:'transcribe'|'analyze')=>void }` | Badges: "Transcribiendo…" (spinner), "Analizando…", "Error: {mensaje humano}" + botón Reintentar (POST transcribe/analyze con `force:true`); costo estimado. | ≤ 120 L |
| `src/components/voice/hooks/useCallIntelligence.ts` **NUEVO** | `(callId: string) => { transcript, segments, analysis, tags, jobs, loading, error, refetch }` | GET `transcript?segments=1`, GET `analyze`, GET `intelligence`; canal realtime `postgres_changes` en `call_transcripts` y `call_analyses` con filtro `call_id=eq.{callId}` (publicación de 3.1); fallback polling 10 s mientras haya job `queued|running`. | ≤ 160 L |
| `src/components/voice/CallsTable.tsx` (modificar :286) | — | Fila expandible (`<Collapsible>`): `CallPlayer` + `CallTranscriptPanel` + `CallAnalysisPanel` en dos columnas; carga perezosa al expandir. | ≤ 300 L (extraer `CallRowDetail.tsx`) |
| `src/components/configuracion/crm/CallIntelligenceSettings.tsx` **NUEVO** | `{ organizationId: number }` | GET/PATCH `/api/crm/settings/call-ai`; `<Select>` proveedor STT (elevenlabs/gemini/openai), `<Switch>` auto-transcribir/analizar/PII, `<RadioGroup>` auto|suggest, `<Slider>` umbral, inputs retención y presupuesto. | ≤ 260 L |

### 5.3 Flujos de usuario

**A. Llamada real → todo automático (política `auto`)**
1. El vendedor cuelga (F3). En ≤ 10 s aparece la fila en `/app/crm/llamadas` y la actividad "Llamada saliente · 4:12" en el timeline de la oportunidad (trigger F0).
2. La fila muestra "Transcribiendo…"; al terminar, "Analizando…"; al terminar, el resumen sustituye las notas de la actividad y aparecen etiquetas y temperatura.
3. Si el análisis sugirió etapa con confianza ≥ umbral y el gate pasa, la tarjeta del Kanban se mueve sola (F9 realtime) y el vendedor recibe notificación "Oportunidad X movida a Negociación por análisis de llamada".
4. Tareas sugeridas aparecen en "Tareas" asignadas al vendedor.

**B. Política `suggest`**
1-2 igual. 3. La notificación dice "3 sugerencias de la llamada con Juan". 4. Abre el panel: ve "Mover a Negociación (82 %) [Aplicar]", tareas con [Crear tarea], [Aplicar todo]. 5. Clic en Aplicar etapa → si gate falla, `GateWarningDialog` lista faltantes; "Mover de todas formas" solo para roles con permiso `crm.stage.override` (F2).

**C. Error de proveedor**
1. Badge "Error: ElevenLabs no disponible (se usó Gemini)" cuando hubo fallback, o "Error: sin créditos IA" con enlace a Créditos. 2. Botón "Reintentar" encola `force:true`.

**D. Llamada manual con audio (F5)**: al guardar la disposición con archivo, F5 crea `calls` (`mode='manual'`) + `call_recordings` (`storage_provider='supabase'`, `status='ready'`, `channels='1'`) → mismo flujo; roles por heurística (`method:'heuristic'`, canal único). Reunión grabada: idem con `calls.metadata.source='meeting_upload'`.

### 5.4 Wireframes

```
/app/crm/llamadas ── fila expandida ───────────────────────────────────────────────────────
│ ▾ 08 sep 14:30  Saliente  Juan Pérez (El Corral)  04:12  ✅ Completada  [🔥 Caliente] [Demo agendada]     │
│ ┌ Grabación ───────────────────────────┐ ┌ Análisis IA ── gemini-2.5-flash · $0.006 ── [Reanalizar] ┐ │
│ │ ▶ ──●────────────── 01:02 / 04:12    │ │ Resumen: El cliente confirmó interés en POS para 3    │ │
│ │ Buscar: [precio_______] 2 coinc. ⧉  │ │ sedes; pide propuesta antes del viernes; objeción de  │ │
│ │ 00:00 AGENTE  Hola Juan, ¿cómo estás?│ │ precio frente a Siigo.                                 │ │
│ │ 00:05 CLIENTE Bien, ¿qué me cuentas? │ │ Sentimiento: 🙂 positivo (0.6)   Calidad: 78/100      │ │
│ │ 00:45 CLIENTE ¿Y cuánto cuesta? ◀︎    │ │ ▸ Apertura 85 · Discovery 60 · Pitch 80 · Objeciones 70│ │
│ │ ►01:02 AGENTE  El plan básico es...  │ │   Cierre 90 · Profesionalismo 85 · Habla 55 %/45 %     │ │
│ │ 01:30 CLIENTE  Siigo me cobra menos  │ │ Objeciones: [Precio] "Siigo me cobra menos" (0.9)     │ │
│ │  … mostrar 40 más                    │ │ Competidores: Siigo · Presupuesto: $4.5M · Decisor: sí │ │
│ └──────────────────────────────────────┘ │ Próximos pasos                                          │ │
│                                          │  ☐ Enviar propuesta (agente) · 12 sep   [Crear tarea]  │ │
│  Estado: ✅ Transcrito (ElevenLabs)      │  ☐ Confirmar demo (cliente) · 15 sep    [Crear tarea]  │ │
│          ✅ Analizado hace 2 min         │ ┌ Sugerencia de etapa ─────────────────────────────┐   │ │
│                                          │ │ Mover a "Propuesta enviada" · confianza 82 %      │   │ │
│                                          │ │ [Aplicar etapa]  [Descartar]                      │   │ │
│                                          │ └───────────────────────────────────────────────────┘   │ │
│                                          │ Etiquetas: [Demo agendada][Objeción de precio] [+]      │ │
│                                          │                               [Aplicar todo (3)]        │ │
│                                          └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘

Estado en curso / error:
│ ⟳ Transcribiendo con ElevenLabs… (~2 min)  │    │ ⚠ Análisis falló: sin créditos IA  [Comprar créditos] [Reintentar] │
```

```
Configuración › CRM › Telefonía › Inteligencia de llamadas
┌────────────────────────────────────────────────────────────────┐
│ Transcribir automáticamente          [●   ] Sí                 │
│ Analizar automáticamente             [●   ] Sí                 │
│ Aplicar acciones                     (•) Sugerir  ( ) Automático│
│ Umbral para mover etapa              [────●──] 80 %            │
│ Proveedor STT                        [ElevenLabs Scribe v2 ▾]  │
│ Idioma                               [Español (spa) ▾]         │
│ Duración mínima                      [20] s                    │
│ Enmascarar tarjetas/CVV              [●   ] Sí                 │
│ Retención de transcripciones         [365] días                │
│ Presupuesto mensual IA               [$ 50.00] USD  Usado: $3.20│
│                                            [Guardar cambios]   │
└────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos / carga / error

- Sin grabación: "Esta llamada no tiene grabación (grabación desactivada o llamada no contestada)". Sin botones.
- Grabación `ready` pero `call_ai_auto_transcribe=false`: botón "Transcribir ahora (≈ $0.02)".
- Cargando: skeleton de 6 líneas en transcripción y 3 bloques en análisis.
- Error con `error_code` → mensaje humano (`INSUFFICIENT_CREDITS` → "Sin créditos IA", `PROVIDER_ERROR` → "El proveedor no respondió", `AUDIO_TOO_SHORT` → "Audio menor a 20 s", `WEBHOOK_TIMEOUT` → "Tiempo de espera agotado") + Reintentar.
- Análisis sin oportunidad asociada: se oculta la sugerencia de etapa y "crear tarea" liga a `related_to_type='call'`.

### 5.6 Accesibilidad

- Cada segmento es `<button type="button" aria-label="Ir a 01:02, cliente">`; navegación con ↑/↓ y Enter; `aria-current="true"` en el activo.
- Cambios de estado en `aria-live="polite"`; sugerencia de etapa `role="region" aria-labelledby`.
- Contraste de badges de temperatura verificado en claro/oscuro (`dark:` explícitos); iconos con texto, no solo color.
- Foco visible en botones "Crear tarea"; `Esc` cierra `GateWarningDialog`.

### 5.7 Motion

- Aparición de segmentos: `motion.div` `initial={{opacity:0,y:4}}` `animate={{opacity:1,y:0}}` 150 ms, sin stagger si > 50 segmentos.
- Score: transición numérica 300 ms; badges de estado con `AnimatePresence` (fade 150 ms). Respeta `prefers-reduced-motion` vía `MotionProvider`.

### 5.8 Responsive / cross-platform

- < 768 px: transcripción y análisis en pestañas (`Tabs`) dentro de la fila; player pegado arriba.
- Capacitor/PWA: `navigator.clipboard` con fallback `toast` "Copiado" / selección manual; el `<audio>` con `playsInline`. Electron: sin cambios.
- Nada de esta fase usa micrófono; los permisos `RECORD_AUDIO`/`NSMicrophoneUsageDescription` son de F3.

---

## 6. Integración con proveedores

| Proveedor | Llamada | Límites | Precio | Gotchas (docs-*.md) |
|---|---|---|---|---|
| ElevenLabs Scribe v2 | `POST /v1/speech-to-text` multipart (`client.speechToText.convert`) params `model_id=scribe_v2`, `file`, `language_code=spa`, `diarize=true`, `num_speakers=2`, `timestamps_granularity=word`, `tag_audio_events=false`, `webhook=true`+`webhook_id` | 3 GB / 10 h por archivo; 32 hablantes | $0.22/h PAYG (330 créditos/min en planes) | Firmar webhook sobre body crudo; `cloud_storage_url` deprecado → `source_url` (no lo usamos: subimos el archivo); español "Excellent ≤ 5 % WER". |
| Gemini 2.5 Flash | `files.upload` + `interactions.create` con `response_format` JSON schema | 9.5 h audio/prompt; Files API 2 GB, 48 h | $1.00/1M tokens audio → 32 tok/s ≈ $0.0019/min; análisis $0.30 in / $2.50 out | Request en snake_case, Files API camelCase; 2.5 estable sin shutdown; 3.x Flash promo hasta 31-dic-2026. |
| OpenAI | `audio.transcriptions.create` `model=gpt-transcribe`, `languages:['es']`; `responses.parse` `gpt-5.6-luna` `reasoning.effort:'none'` | 25 MB por archivo | $0.0045/min; luna $0.20/$1.20 por 1M | 7.x exige Node 22 (quedarse en 6.x); sin diarización; `store:false`. |
| Twilio (F3) | descarga `.mp3?RequestedChannels=2` con Basic Auth | — | grabación $0.0025/min | Solo grabaciones `dual`; mono si `record="record-from-answer"`. |

Tiempo esperado (10 min de audio): Scribe ≈ 40-90 s; Gemini ≈ 30-60 s; análisis ≈ 8-20 s.

---

## 7. Multi-tenant y seguridad

| Punto | Control | Hallazgo que cierra |
|---|---|---|
| `POST transcribe/analyze/apply` | `getServerOrgContext()`; `calls.id` + `organization_id` en toda query; 404 si no es de la org. | — |
| Jobs | `organization_id` del payload se compara con `calls.organization_id` antes de procesar; service role solo en el runner. | C-A/C-B (nunca org del body de usuario) |
| Webhook ElevenLabs | Fail-closed: sin `ELEVENLABS_WEBHOOK_SECRET` → 500 y log; firma inválida → 401; `request_id` desconocido → 200 sin efecto (evita enumeración). Org derivada de la fila `call_transcripts`, nunca del payload. | D7 |
| Runner | `Bearer CRON_SECRET` fail-closed (patrón `sequences/run:14-21`). | C-C (patrón fail-open eliminado) |
| Prompt | Se construye solo con datos `WHERE organization_id = orgId` (objections, stages, tags, customers). Test de aislamiento en 9.1. | — |
| Créditos | RPC `decrement_ai_credits` atómico, nunca read-modify-write. | C-10 |
| Clientes IA | Instancia por llamada con la key de `provider_configs` de la org; sin singleton de módulo. | C-18 |
| `update_field`-like | `applyAnalysis` solo escribe columnas fijas de `opportunities`/`tasks`/`call_tag_relations`/`opportunity_objections`. | C-H (no se reproduce) |
| Stage | `evaluateStageGate` + pertenencia al pipeline; `ignore_gate` requiere permiso F2. | audit-telephony paso 5 |
| Storage | Descarga con service role desde el job; para UI solo URL firmada de `/api/voice/recording/[id]/stream` (F3). | C6/C8 |
| RLS | `ai_prompt_templates` con política org_member; tablas existentes ya tienen 4 políticas (`tr_*`, `ca_*`). | — |
| PII | `maskPii` antes de persistir y antes de enviar a LLM; `raw_response` sin `words[]` salvo `CALL_AI_DEBUG`. | — |

---

## 8. Créditos, costos y límites

- **Antes** de cada llamada a proveedor: `chargeAiCredits(orgId, {provider, sku, units})` → `estimateCost` con `provider_pricing` → `decrement_ai_credits(p_org_id, p_cost)`; si devuelve `false` → `INSUFFICIENT_CREDITS`, job `failed` no reintentable, notificación al admin de la org.
- Presupuesto mensual: `comm_settings.call_ai_monthly_budget_usd`; suma de `ai_usage_logs.metadata->>'usd'` del mes con `action_type IN ('call_transcribe','call_analyze')`; si estimado + gastado > presupuesto → `BUDGET_EXCEEDED` (alerta al 80 % vía `fn_create_org_notification` una vez al mes).
- Después: `settleAiCost` ajusta `metadata.usd` con el real (`audio_duration_secs` de Scribe; tokens de Gemini/OpenAI). `call_transcripts.cost_amount` y `call_analyses.cost_amount` guardan USD.
- Estimación por minuto (D8): Scribe $0.00367; Gemini audio $0.0019; OpenAI $0.0045; análisis ≈ $0.003 (Gemini) / $0.002 (luna). Llamada de 10 min completa ≈ **$0.04**. Conversión USD→créditos por `provider_pricing.credits_per_unit` (default 1 crédito = $0.01: 10 min ≈ 4 créditos).
- Límite duro: `call_ai_max_minutes_per_call` no existe; se usa `maxDurationSeconds` del adaptador y `call_ai_min_duration_seconds` para no gastar en llamadas de 5 s.
- Tarjeta "Créditos/costos" (F17) muestra desglose `call_transcribe`/`call_analyze`.

---

## 9. Pruebas

### 9.1 Unitarias (`jest`, `testEnvironment: node`)

> ⚠️ **Aviso de exactitud (ronda 4, tester r3 §4 nº 14).** Esta tabla es el PLAN, no el
> inventario. `src/lib/services/crm/stt/__tests__/` **no existe**: no hay
> `elevenLabsScribeAdapter.test.ts`, `channelRoleMapper.test.ts`, `piiMasker.test.ts` ni
> `geminiAudioAdapter.test.ts`, y el marcador de enmascarado real es `[OCULTO]`, no `[CVV]`.
> Las suites que SÍ existen y cubren esta fase son
> `src/lib/services/crm/__tests__/{f4Adversarial,f4AnalysisApply,f4Webhook,f4Round2,f4Round3,f4Round4Builder}.test.ts`
> (ver §16.4).

| Archivo | Casos |
|---|---|
| `src/lib/services/crm/stt/__tests__/elevenLabsScribeAdapter.test.ts` | Mapea fixture `fixtures/scribe_v2_llamada_es.json` (10 min, 2 hablantes, 1 480 palabras) → 41 segmentos; pausa > 1.2 s parte segmento; `type:'spacing'` ignorado; modo webhook devuelve `pending:true` con `providerRequestId`. |
| `.../channelRoleMapper.test.ts` | Con intervalos sintéticos: speaker_0 → canal 0 → `agent` en outbound y `customer` en inbound; empate → `unknown`; mono → `method:'heuristic'`; ffmpeg ausente → heurística sin lanzar. |
| `.../piiMasker.test.ts` | "4111 1111 1111 1111" → `[TARJETA ****1111]`; "cédula 1020304050" intacta por defecto; Luhn inválido intacto; CVV "código 123" → `[CVV]`. |
| `.../geminiAudioAdapter.test.ts` | `MM:SS.mmm` → ms; JSON sin `segments` → error `PROVIDER_ERROR`. |
| `src/lib/services/crm/__tests__/callAnalysisService.test.ts` | `suggested_stage_id` fuera del pipeline → null + `rejected_stage_id`; `priority` `urgent→critical`; `mixed` persiste; objeción `objection_id` inexistente → null; OpenAI fallback cuando Gemini lanza; zod rechaza `quality_score` 120. |
| `.../callActivityService.test.ts` | Segunda llamada a `upsertCallActivity` no crea fila; `metadata` se fusiona; `touchOpportunityFromCall` no pisa `discovery_data` existente. |
| `.../callIntelligencePolicy.test.ts` | `suggest` no mueve etapa; `auto` con conf 0.7 < 0.8 no mueve; `auto` con gate `ok:false` → `skipped` con motivo. |
| `src/__tests__/guardrails.test.ts` (existe) | Añadir: ningún archivo bajo `src/lib/services/crm/stt` importa `@/lib/supabase/config` (cliente browser). |

Fixtures reales en español (anonimizados) en `src/__fixtures__/calls/`: `scribe_v2_llamada_es.json`, `gemini_audio_llamada_es.json`, `elevenlabs_webhook_event.json`, `analysis_gemini_ok.json`, `analysis_openai_ok.json`.

### 9.2 Integración (mocks de webhooks con payload real)

1. `POST /api/crm/webhooks/elevenlabs` con `elevenlabs_webhook_event.json` firmado con secret de prueba → fila `completed`, 41 segmentos, job `analyze` encolado. Misma request repetida → 200 sin duplicar.
2. Firma alterada → 401, sin cambios.
3. Runner con `fn_claim_jobs` sobre 2 jobs `transcribe` del mismo `call_id` con `dedupe_key` distinto (`:retry:1`) → el segundo detecta transcript `completed` y termina `done` sin llamar al proveedor.
4. Trigger BD: `UPDATE call_recordings SET status='ready'` con `call_ai_auto_transcribe=false` → 0 jobs.

### 9.3 E2E (org de prueba, manual y verificable)

1. Configurar `provider_configs` (`stt`: elevenlabs; `analysis`: gemini) y créditos 100.
2. Llamar desde el softphone (F3) a un número propio, hablar 40 s con dos frases del cliente, colgar.
3. Verificar en ≤ 3 min: `SELECT status, provider, speaker_count FROM call_transcripts WHERE call_id=…` → `completed, elevenlabs, 2`; segmentos con `speaker_role` correcto escuchando el audio.
4. `SELECT sentiment, quality_score, temperature, suggested_stage_id FROM call_analyses …` → valores coherentes; `suggested_stage_id` ∈ etapas del pipeline.
5. `SELECT notes, metadata->>'analysis_id', duration_seconds FROM activities WHERE call_id=…` → 1 fila con resumen.
6. UI: fila expandida muestra transcripción; clic en un segmento salta el audio; "Crear tarea" crea `tasks.status='open'`.
7. Desactivar la key de ElevenLabs → repetir → `provider='gemini'` y badge de fallback.
8. Poner créditos en 0 → repetir → `error_code='INSUFFICIENT_CREDITS'` y botón Reintentar visible.

### 9.4 Casos borde (≥ 10)

1. Audio vacío / 0 bytes → `AUDIO_EMPTY`, no se cobra (estimación 0 min).
2. Llamada < 20 s → no se encola (trigger); si se fuerza, `AUDIO_TOO_SHORT`.
3. Un solo hablante (buzón de voz) → `speaker_count=1`, etiqueta "Sin respuesta / buzón", sin sugerencia de etapa.
4. > 1 h → modo webhook obligatorio; `transcribe_check` a los 30 min.
5. Idioma mixto español/inglés → Scribe detecta `language_code`; el análisis siempre en español.
6. Proveedor caído (5xx) → fallback en el mismo intento; los tres caídos → `PROVIDER_ERROR` reintentable (backoff).
7. Job duplicado por callback repetido de Twilio → `ON CONFLICT (dedupe_key) DO NOTHING`.
8. Grabación mono (`channels='1'`) → heurística; `channel_role_map.method='heuristic'` visible en UI como "roles estimados".
9. Oportunidad borrada entre transcripción y análisis → análisis sin sugerencia de etapa; actividad ligada al cliente.
10. LLM devuelve JSON inválido → 1 reintento con "responde solo JSON"; luego fallback OpenAI; luego `failed`.
11. Transcripción con 20 000 palabras → truncado para el LLM, `full_text` completo en BD.
12. Re-análisis (`force`) → nueva fila `call_analyses`; la actividad apunta a la más reciente; acciones ya aplicadas no se repiten (`applied_actions`).
13. Cliente de otra org intenta `GET transcript` → 404.
14. Retención: a los N días `full_text=NULL`, segmentos borrados, resumen conservado; UI muestra "Transcripción eliminada por política de retención".

---

## 10. Definition of Done

- [ ] Migraciones 3.1 aplicadas vía MCP; verificación 3.3 devuelve lo esperado; cero `.sql` en el repo.
- [ ] `trg_call_recordings_ready_enqueue` encola `transcribe` y respeta `call_ai_auto_transcribe`/`min_duration`.
- [ ] Handlers `transcribe`/`analyze`/`transcribe_check` registrados en el runner de F0; `dedupe_key` evita duplicados (prueba 9.2.3).
- [ ] ElevenLabs Scribe v2 como primario (`scribe_v2`, `language_code` de la org, `diarize`, `timestamps word`); Gemini y OpenAI como fallback en cadena; proveedor real guardado en `call_transcripts.provider`.
- [ ] `speaker_role` por canal en grabaciones dual (`channel_role_map.method='channel'`) y heurística documentada en mono.
- [ ] C7, C8, C16, C-6 (:349, :363), `tasks.priority/status` inválidos (:691-692) corregidos; Deepgram y `scribe_v1` eliminados; `guardrails.test.ts` pasa.
- [ ] `call_analyses` incluye `temperature`, `objection_ids` (mapeados a `objections` de la org), `suggested_tags`, `policy`, `applied_actions`, `cost_amount`.
- [ ] `suggested_stage_id` siempre pertenece al pipeline de la oportunidad o es `null`.
- [ ] `upsertCallActivity` deja **una** `activities` por llamada con `call_id`, `channel`, `outcome`, `duration_seconds`, `notes`=resumen y `metadata` con ids; `opportunities.last_contact_at/contact_channel/contact_result/temperature` actualizados.
- [ ] Política `auto` mueve etapa solo con gate OK y confianza ≥ umbral; `suggest` no mueve; ambas notifican con `fn_create_org_notification`.
- [ ] Webhook ElevenLabs verifica `ElevenLabs-Signature` con `constructEvent` sobre body crudo; fail-closed.
- [ ] Cada llamada a proveedor cobra créditos antes vía `decrement_ai_credits` y registra `ai_usage_logs` con USD real; presupuesto mensual corta.
- [ ] `CallTranscriptPanel`, `CallAnalysisPanel`, `CallIntelligenceStatus`, `useCallIntelligence` implementados (≤ 300 L cada uno); fila expandible en `/app/crm/llamadas`; realtime funciona (publicación ampliada).
- [ ] `CallIntelligenceSettings` guarda las 9 opciones y el proveedor STT por org.
- [ ] E2E 9.3 pasos 1-8 verificados en la org de prueba; `npm run lint`, `tsc --noEmit`, `npm test` limpios.

**Métricas de éxito (30 días tras despliegue):** ≥ 95 % de grabaciones `ready` con transcripción `completed` sin intervención; p95 grabación→análisis < 4 min; ≥ 90 % de roles correctos en muestra de 30 llamadas dual auditadas a oído; costo medio por llamada ≤ $0.05; 0 filas `call_analyses` con `suggested_stage_id` fuera de su pipeline; 0 actividades duplicadas por llamada.

---

## 11. Riesgos y decisiones

| Decisión | Por qué X y no Y |
|---|---|
| Scribe v2 primario, Gemini fallback, OpenAI tercero | Scribe: diarización nativa, $0.22/h, español ≤ 5 % WER, webhook async. Gemini audio es más barato ($0.11/h) pero la diarización vía prompt es menos fiable y 3.5-transcribe limita a 30 min con diarización. OpenAI no diariza y sus modelos diarizados se apagan en feb-2027. |
| Roles por canal con `silencedetect` (1 transcripción) en vez de 2 transcripciones mono | Mismo resultado determinista a la mitad de costo; evita depender de `channel_index` opcional. Riesgo: ffmpeg en Vercel (75 MB) → mitigado con `outputFileTracingIncludes`; si falla, heurística y aviso en UI. |
| Trigger BD para encolar (no código en `/api/voice/recording`) | Cubre también llamadas manuales/reuniones (F5) y cualquier futuro origen de grabación; es idempotente por `dedupe_key`. |
| `comm_settings.call_ai_*` en vez de tabla nueva | Ya es 1 fila por org y aloja `voice_recording_*`; evita otra tabla con RLS y otra pantalla. |
| Gemini `generateContent` + `responseSchema` se mantiene; Interactions solo para audio | El código existente (`callAnalysisService.ts:203-285`) funciona; migrar todo a Interactions no aporta valor en F4 y añade riesgo. |
| `activities` enriquecida, no una segunda actividad "análisis" | Requisito del dueño: "todo en actividades recientes" como un solo evento por llamada; el timeline (F9) hidrata por `call_id`. |
| Política por defecto `suggest` | Evita mover etapas por error mientras se calibra el prompt; el dueño puede activar `auto` por org. |
| Jobs en Vercel (runner F0) y no en Railway ws-server | El ws-server no tiene el código CRM ni lockfile (C-17/C23); el runner con `maxDuration=300` cubre audio ≤ 30 min síncrono y webhook para el resto. |
| Riesgo: costo Scribe en llamadas largas | Presupuesto mensual + `min_duration` + estimación previa; alerta al 80 %. |
| Riesgo: alucinación de etapa/objeción | Validación estricta contra ids reales; `null` si no coincide; confianza mínima 0.8 para `auto`. |
| Riesgo: PII en prompts de terceros | Enmascarado antes de enviar; `store:false` en OpenAI; Files API de Gemini borra a 48 h. |

---

## 12. Archivos tocados y orden de PRs (≤ 400 líneas cada uno)

> Plan original abajo, tal como se aprobó. **Lo realmente entregado en la ronda 1**
> se agrupa distinto (los adaptadores y el refactor viajaron juntos porque comparten
> tipos) y algunos nombres cambiaron para no chocar con archivos ya existentes.

### 12.a Entregado en la ronda 1

**Creados**

| Archivo | Qué hace |
|---|---|
| `src/lib/services/crm/stt/types.ts` | Contrato `SttAdapter`, `SttInput`, `TranscriptResult`, `SttProviderError`, helpers de segmentos y `toSttError`. |
| `src/lib/services/crm/stt/elevenLabsScribe.ts` | Scribe v2 vía `client.speechToText.convert`; diarización, `mapScribeResponse`, modo webhook. |
| `src/lib/services/crm/stt/geminiAudio.ts` | Audio inline (≤ 18 MB) o Files API; Interactions API con fallback a `generateContent`; `recommendedGeminiModel` reintenta con el modelo que sugiere la propia API. |
| `src/lib/services/crm/stt/openaiTranscribe.ts` | `gpt-transcribe`; segmentación por palabras y `logprobToConfidence`. |
| `src/lib/services/crm/stt/index.ts` | `resolveSttChain` (orden por `provider_configs`) y `transcribeWithFallback` con `SttChainError` y traza de intentos. |
| `src/lib/services/crm/callChannelRoles.ts` | Roles agente/cliente por canal y heurística; devuelve `method` y `confidence`. |
| `src/lib/services/crm/callAiPolicy.ts` | Política por org desde `provider_configs.settings` (`stt` y `analysis`). |
| `src/lib/services/crm/callAnalysisRules.ts` | Reglas puras: validación de etapa, mapeo de objeciones, `buildTaskRow`, `mergeDiscovery`. |
| `src/lib/services/crm/prompts/callAnalysisPrompt.ts` | Prompt v1 en español + `analysisZod` + enums compartidos. |
| `src/lib/services/crm/callActivityService.ts` | `upsertCallActivity` idempotente, `touchOpportunityFromCall`, `notifyCallAnalyzed`. |
| `src/lib/services/crm/callActivitySync.ts` | Sincroniza actividades de llamadas ya existentes. |
| `src/lib/services/crm/callIntelligenceService.ts` | Orquesta `runTranscribePipeline` / `runAnalysisPipeline` y encola con dedupe. |
| `src/lib/services/crm/manualCallService.ts` | Llamada manual con audio: magic bytes, tope de tamaño **por organización** (`resolveManualAudioMaxBytes` → el `maxBytes` mayor de la cadena STT con credenciales; 25 MB sólo como fallback sin proveedor), subida al bucket, `calls` + `call_recordings` + actividad. Literales `mode`/`status`/`duration_source`/`call_recordings.status` validados contra su CHECK al cargar el módulo. |
| `src/lib/jobs/handlers/transcribe.ts`, `analyze.ts` | Handlers con `JobRetryableError` en 429/5xx y `JobFatalError` en errores terminales. |
| `src/app/api/crm/calls/manual/route.ts` | POST multipart (`?sync=1` para inline). |
| `src/app/api/crm/calls/[id]/analysis/route.ts` | GET del análisis. |
| `src/app/api/crm/webhooks/elevenlabs/route.ts` | Webhook Scribe fail-closed (firma HMAC obligatoria). |
| `src/components/crm/calls/{CallTranscriptPanel,CallAnalysisPanel,CallAnalysisSections,useCallIntelligence,index}.tsx` | UI de transcripción (búsqueda, seek, reintento incluso en `processing` atascado), análisis (objeciones, próximos pasos, etapa con gate). Montados en `CallRowDetail` y en el `CallEntry` del timeline (F9). |
| `src/components/crm/calls/CallAiPolicyCard.tsx` | Tarjeta de política de IA de llamadas. **SÍ está montada** desde la ronda 2: el orquestador aplicó el bloque que F4 pidió en «Integración pendiente» y hoy vive en `src/components/configuracion/crm/ProveedoresTab.tsx:18` (import) y `:106` (render), dentro de Configuración › CRM › Proveedores. La política también se puede editar por `PUT /api/crm/config/providers`. *(Corregido en la ronda 3: hasta hoy este doc afirmaba lo contrario — fallo nº 11 de `TEST-F4-r2.md`.)* |
| `src/components/voice/CallRowDetail.tsx` | Fila expandible con ambos paneles. **Zona exclusiva de F3**: creado por F4 en la ronda 1 sin declararlo; pendiente de validación por F3 (ver `F4-r2.md`). |
| `src/lib/services/crm/__tests__/{stt,callChannelRoles,callAnalysisRules,callActivityService,callIntelligencePipeline}.test.ts` | Suites jest de F4. |

**Modificados**

| Archivo | Cambio |
|---|---|
| `src/lib/services/crm/transcriptionService.ts` | Reescrito: `status='ready'`, bucket real, upsert por `call_id`, créditos antes con reembolso, idioma configurable, cascada, `completeTranscriptFromWebhook`, `reconcileAiUsageModel`. |
| `src/lib/services/crm/callAnalysisService.ts` | Contexto real, prompt v1, cascada Gemini→OpenAI, validación de etapa/objeciones/tareas, `applyAnalysis` con `evaluateStageGate`, etiquetas automáticas. |
| `src/app/api/crm/calls/[id]/{transcribe,analyze,transcript,analysis/apply}/route.ts` | Encolan (202) y aceptan `?sync=1`. |
| `src/app/api/crm/transcribe/route.ts` | Deja de ser un segundo stack: delega en el pipeline real. |
| `src/components/voice/CallPlayer.tsx` | `seekToMs` + `onTimeUpdate` + `variant='full'`. **Zona exclusiva de F3**: modificado por F4 en la ronda 1 sin declararlo; pendiente de validación por F3 (ver `F4-r2.md`). |
| `src/components/crm/calls/CallAiPolicyCard.tsx` | Modelo por defecto `gemini-3.8-flash`; etiqueta del STT de Google corregida a «Gemini 3.8 Flash». |

### 12.b Plan original

**PR-F4-1 · BD y política (≈ 150 L)**: migraciones 3.1 (vía MCP, sin archivos), `src/lib/services/crm/callIntelligencePolicy.ts` (crear), `src/app/api/crm/settings/call-ai/route.ts` (crear), tests de política.

**PR-F4-2 · Adaptadores STT (≈ 380 L)**: `src/lib/services/crm/stt/{types,index,elevenLabsScribeAdapter,geminiAudioAdapter,openaiTranscribeAdapter}.ts` (crear), `package.json` (+`@elevenlabs/elevenlabs-js`, `ffmpeg-static`, `@google/genai ^2.21`), fixtures, tests de adaptadores.

**PR-F4-3 · Roles por canal y PII (≈ 250 L)**: `src/lib/services/crm/stt/{channelRoleMapper,piiMasker}.ts` (crear), `next.config.js` (tracing ffmpeg), tests.

**PR-F4-4 · transcriptionService refactor + webhook (≈ 380 L)**: `src/lib/services/crm/transcriptionService.ts` (modificar: quitar Deepgram/`scribe_v1`, fix C7/C8, adaptadores, `persistTranscript`, `completeTranscriptFromWebhook`), `src/app/api/crm/webhooks/elevenlabs/route.ts` (crear), `src/app/api/crm/calls/[id]/transcribe/route.ts` (modificar: encolar), tests de integración del webhook.

**PR-F4-5 · Análisis (≈ 400 L)**: `src/lib/services/crm/callAnalysisService.ts` (modificar: contexto real, prompt v1 desde `ai_prompt_templates`, schema ampliado, validación de etapa/objeciones, fallback OpenAI, `applyAnalysis` con gate y `applied_actions`), `src/lib/services/crm/prompts/callAnalysisPrompt.ts` (crear: `CALL_ANALYSIS_PROMPT_V1`, `CALL_ANALYSIS_JSON_SCHEMA`, `analysisZod`), `src/app/api/crm/calls/[id]/{analyze,analysis/apply}/route.ts` (modificar contrato), tests.

**PR-F4-6 · Actividad, jobs y acciones (≈ 300 L)**: `src/lib/services/crm/callActivityService.ts` (crear), `src/lib/services/crm/jobs/handlers/{transcribeJob,analyzeJob,transcribeCheckJob}.ts` (crear) + registro en el runner de F0, `src/app/api/crm/calls/[id]/intelligence/route.ts` (crear), ampliación de `recording_cleanup` (F3) para retención de transcripciones, tests de `callActivityService`.

**PR-F4-7 · UI (≈ 400 L)**: `src/components/voice/CallPlayer.tsx` (modificar: ref + `onTimeUpdate`), `src/components/voice/hooks/useCallIntelligence.ts`, `CallTranscriptPanel.tsx`, `CallIntelligenceStatus.tsx` (crear).

**PR-F4-8 · UI análisis y llamadas (≈ 380 L)**: `src/components/voice/CallAnalysisPanel.tsx`, `src/components/voice/CallRowDetail.tsx` (crear), `src/components/voice/CallsTable.tsx` (modificar fila expandible), `src/components/configuracion/crm/CallIntelligenceSettings.tsx` (crear) + montaje en `/app/configuracion?modulo=crm` (F17 define el contenedor; aquí solo la sección).

**Eliminar (en F5/F9 cuando desaparezca `ActivityActions.tsx`)**: `src/app/api/crm/transcribe/route.ts`; `src/lib/services/integrations/twilio/voiceAgent/deepgramSTT.ts` (muerto); env `DEEPGRAM_*`.

**No tocar en F4**: `src/app/api/voice/recording/route.ts` (F3), `src/lib/services/crm/recordingStorageService.ts` (F3), `stageGateService.ts`, `callTagService.ts`, `GateWarningDialog.tsx`.

---

## 13. Registro ronda 1 (2026-09-08)

### 13.1 Verificación ejecutada

- **`tsc`** sobre los archivos de F4 (tsconfig temporal con `stt/**`, `prompts/**`, los
  servicios, los handlers, `api/crm/calls/**`, `api/crm/webhooks/elevenlabs`,
  `components/crm/calls/**` y `components/voice/*`): **0 errores**.
- **`npx jest src/lib/services/crm`**: **27 suites / 253 tests en verde** (1 suite
  saltada, ajena a F4).
- **E2E real contra la BD de producción (org 125)**: llamada manual con un WAV
  **estéreo de 56 s con voz real en español** (dos interlocutores generados por TTS),
  subido con `createManualCallWithAudio` (la misma función que ejecuta
  `POST /api/crm/calls/manual`; la ruta exige sesión de usuario) y drenado con
  `runJobs` (el mismo runner que `POST /api/crm/jobs/run`).

Resultado observado, con proveedores reales:

| Paso | Resultado |
|---|---|
| `transcribe` | `done` en 19,4 s. Cascada: Gemini falla → **OpenAI `gpt-transcribe`** OK. Transcripción `completed`, `language='es'`, 117 palabras, **16 segmentos**, `cost_amount=0.0042`. |
| Encadenado | El handler encoló `analyze` con dedupe `analyze:{call_id}`. |
| `analyze` | `done` en 66,4 s. Cascada: Gemini 404 → reintento con el modelo sugerido → 503 → **OpenAI `gpt-5.6-luna`** OK. `sentiment='positive'`, `quality_score=65`, etapa sugerida válida con `confidence=0.95`, 2 tareas (`priority='high'`, tipos `email`/`meeting`), `temperature='hot'`. |
| Actividad | **UNA** fila en `activities` con `call_id`, `activity_type='call'`, `channel='phone'`, `outcome='answered'`, `related_type='opportunity'`, `notes` = resumen y metadata con `transcript_id`/`analysis_id`/`sentiment`/`quality_score`/`next_steps`/`tags`. |
| Oportunidad | `last_contact_at`, `contact_channel='call'`, `contact_result='answered'`, `temperature='hot'`. |
| Etiquetas | 1 fila en `call_tag_relations` con `source='ia'`. |
| Notificación | 1 fila en `notifications` (`payload.type='call_analyzed'`, canal `app`). |
| Costos | `ai_usage_logs` con el **proveedor y modelo realmente usados** (ver 13.3). |

Todos los datos de prueba se borraron al terminar (transcripción, segmentos, análisis,
actividad, etiquetas, notificación, jobs, logs de uso, grabación, objeto de storage,
llamada y oportunidad): verificado con conteos en cero.

### 13.2 Hallazgos con los proveedores reales

1. **`gemini-2.5-flash` no es utilizable con la key del proyecto.** Aparece en
   `ListModels`, pero `generateContent` responde
   `404 … no longer available to new users. Please update your code to use models/gemini-3.6-flash`.
   Se añadió `recommendedGeminiModel`, que reintenta una vez con el modelo que sugiere
   la propia API, y se cambió el **default a `gemini-3.8-flash`** — es el Flash GA
   (docs-gemini.md) y el único con SKU sembrado y verificado en `provider_pricing`
   (`gemini_3_8_flash_in/out`, $0.75/$3.75 por 1M).
2. **`ELEVENLABS_API_KEY` responde 401 (`invalid_api_key`) y `ELEVENLABS_VOICE_ID` es el
   placeholder `your-voice-id`.** Por eso `resolveSttChain` deja la cadena en
   `google → openai` y **Scribe v2 no se pudo probar en vivo** (sí con fixtures en
   `stt.test.ts`). La diarización real depende de esta key: sin ella, `gpt-transcribe`
   no separa hablantes y `channel_role_map` cae a `method='single'`, `confidence=0.5`.
3. **Los SKU `gemini_2_5_flash_in` / `gemini_2_5_flash_out` que usaba el análisis no
   existen en `provider_pricing`**, así que el costo caía siempre a las constantes del
   código. Corregido a `gemini_3_8_flash_in/out`.
4. **El costo se registraba con el modelo estimado, no con el usado.** Cuando la cascada
   cambia de proveedor, `ai_usage_logs.model` quedaba en `gemini-2.5-flash` aunque la
   llamada la hubiera resuelto OpenAI. Se añadió `reconcileAiUsageModel`
   (`transcriptionService.ts`), que tras un fallback corrige `model` y `metadata.provider`
   y conserva `estimated_model`/`estimated_provider`. Verificado en la E2E: las dos filas
   quedaron como `gpt-transcribe`/`openai` y `gpt-5.6-luna`/`openai`.
5. **Reintento de Gemini STT con audio grande.** Tras el 404, el segundo intento con
   7,2 MB de base64 devolvió `TypeError: unusable` (undici). La cascada cubrió el fallo
   cayendo a OpenAI, pero conviene revisarlo cuando el modelo por defecto ya no falle.
6. **`notifications` no tiene columna `metadata`**: `fn_create_org_notification` guarda
   `title`/`content`/`metadata` dentro de `payload` (jsonb).

### 13.3 Desviaciones que siguen abiertas

- Columnas de §3.1 inexistentes → `channel_role_map`, `provider_request_id`, intentos,
  costo real, temperatura, `objection_ids`, `suggested_tags`, `applied_actions`,
  `prompt_version` y `policy` viajan dentro de `raw_response`.
- `comm_settings.call_ai_*` no existe → la política vive en `provider_configs.settings`.
- El prompt v1 está en código (`prompts/callAnalysisPrompt.ts`), no en
  `ai_prompt_templates`.
- `provider_pricing` no tiene SKU de audio para 3.8; el STT por Gemini se estima con
  `gemini_2_5_flash_audio_in` ($1.00/1M).

---

## 14. Registro ronda 2 (2026-09-08) — respuesta al informe `TEST-F4-r1.md`

El tester ejecutó 166 casos (135 jest nuevos en 3 suites propias, 10 sondas HTTP, 7
consultas a la BD real) y reportó **17 fallos** con una nota de robustez de 7,5/10.
Los 17 están atendidos. Las 3 suites del tester siguen verdes y crecieron a **151 casos**:
los que documentaban un fallo se invirtieron para afirmar el comportamiento corregido, y
se añadieron 16 casos nuevos (B18b, B22, B23, B24, D7b, D10, F16, G19, G20, G21, H9b,
H9c, W11b y la suite P de enmascarado).

### 14.1 Correcciones de la ronda 2

| # | Severidad | Corrección |
|---|---|---|
| 1 | alto | `applyAnalysis` escribía `detected_by='ai'`, fuera del CHECK real (`manual\|ia`): la acción de objeciones **nunca** se aplicaba y el error se tragaba como «omitido». Ahora la fila la construye `buildObjectionRow` y `assertDbEnum` valida el literal contra el CHECK; `call_tag_relations.source` pasa por el mismo filtro. Los valores válidos que aún no están en `src/lib/crm/enums.ts` viven en `callAnalysisRules.ts` (`OBJECTION_DETECTED_BY_VALUES`, `CALL_TAG_SOURCE_VALUES`) con el CHECK citado al lado; se pide a DB llevarlos a `enums.ts` + `db-checks.json`. |
| 2 | alto | Un fallo determinista **posterior** al modelo (CHECK, columna, red a Postgres) salía como `Error` genérico, el handler lo mapeaba a `JobRetryableError` y con `maxAttempts: 3` eran 3 llamadas al LLM, 3 cobros y 0 reembolsos. Ahora todo lo que sigue al cobro va bajo un único `try/catch` con reembolso garantizado, y esos errores son `AnalysisError('PERSIST_ERROR')` / `TranscriptionError('PERSIST_ERROR')` **no reintentables** → `JobFatalError`. Los fallos del proveedor siguen siendo reintentables. Mismo patrón en `transcribeCall`. |
| 3 | alto | `CallAiPolicyCard` seguía sin montarse y el doc afirmaba lo contrario. Se corrige §12.a, se arregla la etiqueta obsoleta «Gemini 2.5 Flash» y el bloque exacto de montaje en `ProveedoresTab` (de REG) queda en «Integración pendiente» del informe. |
| 4 | medio | `reconcileAiUsageModel` corregía el modelo pero no la economía: quedaba el modelo de un proveedor con el `unit_sku`, `units` y `cost_amount` del otro. Ahora reconcilia también costo, SKU, unidades y coste unitario, conservando lo estimado (`estimated_*`). En el camino feliz del análisis el costo ya no es una estimación por `prompt.length/4`: se recalcula con los tokens de entrada **y salida** que devuelve el proveedor. |
| 5 | medio | Los créditos se cobraban a la tarifa del proveedor **estimado** aunque respondiera otro (18 % de infracobro medido). `settleCreditDelta` ajusta la diferencia tras la respuesta: débito adicional si faltaba, reembolso parcial si sobraba; nunca tumba un trabajo ya hecho. |
| 6 | medio | `upsertCallActivity` serializa los upserts concurrentes de la misma llamada dentro del proceso y, si el INSERT falla por una carrera entre procesos, reutiliza la fila ganadora. **Corregido en la ronda 3** (fallo nº 11 de `TEST-F4-r2.md`): cuando se escribió esta línea el índice no existía y aquí se decía que `activities` «no tiene UNIQUE en `call_id`»; DB lo aplicó y hoy **sí existe** `activities_call_id_uidx` (`CREATE UNIQUE INDEX … ON public.activities (call_id) WHERE call_id IS NOT NULL`, verificado con `pg_indexes` el 2026-09-09). Es él quien cierra la carrera entre procesos; el cerrojo en memoria y la relectura siguen siendo la recuperación local. La petición a DB queda cerrada. |
| 7 | medio | Una transcripción atascada en `processing` dejaba la UI con un spinner eterno. `expireStuckTranscript` la marca `failed` (`WEBHOOK_TIMEOUT`) pasados `MAX_PROCESSING_MS` (30 min) conservando `raw_response`. El botón «Reintentar» del panel aparecía a los 3 min; **en la ronda 3 pasa a los 10**, el mismo `STALE_PROCESSING_MS` con el que el servicio da un envío por perdido (ver §15). |
| 8 | medio | `markFailed` reemplazaba el `raw_response` entero y perdía `provider_request_id` —la única forma de recuperar una transcripción enviada por webhook—, además de `recording_id` y `credits`. Ahora fusiona el contenido previo; el paso a `processing` también lo conserva. |
| 9 | medio | Violación del protocolo de archivos: F4 modificó `CallPlayer.tsx` y creó `CallRowDetail.tsx`, zona exclusiva de F3, sin declararlo. En esta ronda **no se han vuelto a tocar**; ambos quedan documentados aquí y en «Integración pendiente» para que F3 los valide. |
| 10 | medio | Se aceptaban 40 MB de audio que ningún adaptador podía procesar. El tope se valida antes de subir y de cobrar, y la cascada salta con 413 el adaptador cuyo `maxBytes` no alcance en vez de gastar la llamada. La ronda 2 puso un tope global de 25 MB; **la ronda 3 lo corrige** (fallo nº 7 de `TEST-F4-r2.md`): el tope es el `maxBytes` MÁXIMO de la cadena con credenciales y 25 MB sólo el fallback sin proveedor (ver §15). |
| 11 | bajo | Eliminada la etiqueta de prueba que quedó en la organización 125 (`call_tags` «Caliente»); conteos verificados en cero. |
| 12 | bajo | Corregido el error TS2352 de `callAnalysisRules.test.ts`. |
| 13 | bajo | `ELEVENLABS_STT_WEBHOOK_ID` falta en `.env.example` (archivo compartido): el bloque exacto se pide en el informe. |
| 14 | bajo | El webhook resuelve su propia idempotencia: `completeTranscriptFromWebhook` marca `already_completed` y la ruta ya no vuelve a encolar `analyze` en un reintento del proveedor (antes dependía del dedupe de la cola). |
| 15 | bajo | Canal unificado en modo puente: `callActivitySync.activityChannelForMode` delega en `callActivityService.callChannel`, y `bridge` es **`mobile`** por las dos rutas. |
| 16 | bajo | El catálogo `objections` sigue vacío en toda la BD, así que el mapeo no se ejerce en producción. Se demostró con `begin; … rollback;` sobre la BD real que, sembrado el catálogo, el INSERT corregido entra (`detected_by='ia'`) y que el valor antiguo `'ai'` lo rechaza el CHECK. |
| 17 | bajo | `method='single'` documentado en §1.b con su tabla y el aviso de que **es el caso por defecto hoy**. |

### 14.2 Enmascarado de datos personales y retención (decisión)

- **Enmascarado: entregado, con alcance acotado** (reescrito en la ronda 3, afinado en la
  ronda 4, ver §15 y §16). `maskSensitiveForLlm` (`callAnalysisRules.ts`) se aplica a la
  transcripción antes de construir el prompt y oculta números de tarjeta (13-19 dígitos que
  pasan Luhn, dejando los 4 últimos) y CVV/PIN/claves dictadas. **No** enmascara nombre,
  empresa, teléfono ni importes: son precisamente el contexto que el prompt envía aparte y
  sin ellos el análisis pierde la mitad de su valor. La decisión es deliberada y está
  cubierta por los casos P1-P3, R25-R35, T8-T10 y B4-B8.
- **Es una heurística, y NO se declara cerrada** (tester r3 N3, r4 P1). La lista **completa**
  de límites (L1-L8, ninguno resuelto) está en **§17.2** y en el docblock de
  `maskSensitiveForLlm`; los ocho están fijados por el caso C3 de `f4Round5Builder.test.ts`
  para que una regresión sea visible. En la ronda 4 esta lista era un **subconjunto** del
  límite real y por eso se reescribe aquí: los límites se declaran enteros o no se declaran.
- **Alcance real, dicho sin adornos** (tester r2 nº 8): esto sólo protege frente al
  **segundo** proveedor. `call_transcripts.full_text` y los segmentos se guardan SIN
  enmascarar, y el audio íntegro ya viajó al proveedor STT. No es una garantía PCI.
- **Retención de transcripciones: NO entregada, y no es de F4.** El plan la colocaba como
  una ampliación de `recording_cleanup` (PR-F4-6), y `src/lib/jobs/handlers/recordingCleanup.ts`
  es zona exclusiva de F3. Queda pedida a F3/DB en el informe con la política concreta.

### 14.3 Verificación de la ronda 2

- `npx tsc` acotado a los archivos de F4 **y a los tests** (`tsconfig.f4-r2.json`): **0 errores**.
- Las 3 suites del tester: **151/151 en verde**. Suites propias de F4 + `guardrails`: 104/104.
- `npx jest src/lib/services/crm`: 31 suites verdes / 1 saltada / 3 rojas, **ninguna de F4**
  (`timelineService`, `opportunityStageService` — F9 — y `whatsapp/testerR1` — F16 —, en
  trabajo simultáneo de esos agentes).
- BD real: `call_tags`, `call_tag_relations`, `call_transcripts`, `call_transcript_segments`,
  `call_analyses`, `calls(mode='manual')`, `ai_usage_logs(action_type like 'call\_%')`,
  `notifications(payload->>type='call_analyzed')` y `storage.objects` del bucket
  `crm-call-recordings` → **0 filas**. Las únicas filas vivas de `call_recordings`,
  `activities(call_id)` y `outbound_jobs(transcribe)` son de la **organización 134** y las
  creó otro agente minutos antes; no se han tocado.

---

## 15. Registro ronda 3 (2026-09-09) — respuesta al informe `TEST-F4-r2.md`

El tester ejecutó 229 casos y reportó **11 fallos** (0 críticos, 2 altos, 5 medios,
4 bajos) con una nota de 8,0/10. Los 11 están atendidos. Nota de honestidad: parte del
trabajo (libro mayor de créditos, enmascarado reescrito, `unit_cost_usd` en STT, rama de
webhook dentro del `try`) ya estaba aplicada en el árbol por una sesión anterior
interrumpida; esta ronda lo verificó caso por caso, terminó lo que quedaba a medias y
convirtió los tests que afirmaban el defecto en tests que afirman el comportamiento
correcto (conservando escenario y datos de entrada).

### 15.1 Correcciones de la ronda 3

| # r2 | Severidad | Corrección | Evidencia |
|---|---|---|---|
| 1 | alto | **Reembolso doble.** `settleCreditDelta` devolvía la diferencia y el `catch` posterior devolvía además el cobro completo (medido: 59 por un cobro de 30). Ahora existe `CreditLedger` (`transcriptionService.ts:807-926`), un libro mayor de la ejecución que anota lo cobrado, lo ajustado y lo devuelto; `refundOutstanding()` devuelve **exactamente el saldo neto vivo** y es idempotente. | `npx jest -t "R6"`: 29 (ajuste) + 1 (cierre) = 30 devueltos por 30 cobrados. |
| 2 | alto | **Débito de ajuste huérfano.** El segundo cobro (`:adjust`) no se devolvía nunca si fallaba la persistencia. El mismo libro mayor lo suma a `charged`, así que el cierre lo incluye. | `npx jest -t "R7"`: devuelto = cobro inicial + delta del ajuste. |
| 3 | alto | **Rama de webhook fuera del `try`.** El modo asíncrono de Scribe (`outcome.result.pending`) vivía antes del `try` y un fallo suyo salía como `Error` genérico → `JobRetryableError` → 3 envíos, 3 cobros, 0 reembolsos. Ahora está **dentro** del mismo `try/catch` (`transcriptionService.ts:636-650`), con reembolso y `PERSIST_ERROR` no reintentable. | `npx jest -t "R12"`: `TranscriptionError` `PERSIST_ERROR` `retryable:false`, 22 créditos devueltos. |
| 4 | medio | **Reembolso invisible.** `refundAiCredits` no lanza: devuelve `false`, y el `.catch()` que lo envolvía nunca corría, mientras la fila anotaba `refunded: true`. `CreditLedger.refundOutstanding` **comprueba el booleano**, escribe `refunded`/`refunded_credits` reales en `raw_response`, añade `refund_error` y `pending_refund_credits` cuando falla, deja un `console.error` y registra una fila conciliable en `ai_usage_logs` con `action_type '<accion>:refund_failed'` y `credits_consumed: 0`. En el análisis el error que se lanza incluye además el aviso de los créditos no devueltos. ⚠️ **Sólo quedó corregido el CIERRE**: el ajuste a la baja de `settleCreditDelta` seguía ignorando el booleano (tester r3 N1) y se cierra en **§16.1 nº 1**; la evidencia «caso R8» que citaba el informe r3 era falsa (R8 afirmaba el defecto) y se corrige en §16.1 nº 2. | `transcriptionService.ts` (`CreditLedger`), `callAnalysisService.ts:513`; casos B22, G6 y, desde la ronda 4, R8 y T1-T6. |
| 5 | medio | **Regla de literales con CHECK.** La cabecera de `callAnalysisRules.ts` lo afirmaba y era falso en 7 sitios. Ahora **todos** pasan por `assertDbEnum` en constantes evaluadas al cargar el módulo: `CALL_ACTIVITY_TYPE` y `CALL_NOTIFICATION_CHANNEL` (`callActivityService.ts:27-28`, reutilizadas por `callActivitySync`), `MANUAL_CALL_MODE`/`MANUAL_CALL_STATUS`/`MANUAL_DURATION_SOURCE`/`MANUAL_RECORDING_STATUS` (`manualCallService.ts:48-51`), `tasks.status` en `buildTaskRow`, y el `source` del body en `POST /api/crm/calls/[id]/tags`. La cabecera se reescribió con la cobertura real. Además `applyAutoTags` ya no se invoca con `.catch(...)`: el fallo se registra como error y queda en `call_analyses.raw_response.tagging_error` (`callAnalysisService.ts:675-684`), y `tagCall` deja de tragarse el error del INSERT (propaga el motivo; si es un choque de UNIQUE reutiliza la fila ganadora). | CHECKs reconfirmados con `pg_constraint` el 2026-09-09; `npx jest -t "R45"`. |
| 6 | medio | **Reintentar a los 3 min podía duplicar el cobro.** `CallTranscriptPanel.STUCK_MS` pasa de 3 a **10 min**, el mismo `STALE_PROCESSING_MS` del servicio; `force` ya no salta la guarda de «envío vivo» (`transcriptionService.ts:470-477`), y la ruta añade sufijo de reintento al `dedupe_key` también cuando la fila lleva `processing` más de esa ventana (antes sólo si estaba `failed`). | `CallTranscriptPanel.tsx:106-118`, `api/crm/calls/[id]/transcribe/route.ts:60-67`. |
| 7 | medio | **Tope global que anulaba el mecanismo por proveedor.** El tope efectivo lo da ahora `resolveSttSizeLimit(orgId, preferred)` = el `maxBytes` MÁXIMO de la cadena con credenciales (ElevenLabs 1 GB, Gemini 2 GB); 25 MB queda como fallback documentado del caso «sin proveedor configurado». `manualCallService` usa `resolveManualAudioMaxBytes(orgId)` y las **dos rutas** (`/api/crm/calls/manual`, `/api/crm/transcribe`) dejan de responder «El audio supera 40 MB»: devuelven el número real, con `max_bytes` y `max_bytes_source` en el cuerpo. | `manualCallService.ts:53-66`, `api/crm/calls/manual/route.ts:26-31`, `api/crm/transcribe/route.ts:28-32`. |
| 8 | medio | **Enmascarado poco fiable en los dos sentidos.** Reescrito: los separadores de tarjeta admiten espacios, guiones, **puntos** y el salto de línea con prefijo de segmento (una tarjeta partida entre dos segmentos se enmascara y las líneas no se funden); el valor de cvv/clave/pin/otp se busca admitiendo conectores («la clave **de acceso es** Secreta99», «el pin **de mi tarjeta es** 4321») pero **sólo se oculta si contiene al menos un dígito**, así que «la clave del negocio es el servicio» o «la clave está en el precio» quedan intactas. ⚠️ Esa regla seguía fallando en los dos sentidos con frases corrientes (destruía `La clave es 20000000 al mes`, dejaba pasar `mi clave personal es Sol2024`): **corregido en §16.1 nº 4**, donde además se declaran sus límites. | `callAnalysisRules.ts`; casos R25-R35 (11/11), T8-T10 y B4-B8. |
| 9 | bajo | **`unit_cost_usd` no se reconciliaba en STT.** Se pasa `unitCostUsd: real.unitCost` a `reconcileAiUsageModel` (`transcriptionService.ts:665`), de modo que el log no queda con el sku de OpenAI y la tarifa por hora de ElevenLabs. | `npx jest -t "R15"`: `unit_sku='gpt_transcribe'` con `unit_cost_usd=0.0045` y `estimated_unit_sku='scribe'`. |
| 10 | bajo | **Reconciliación fallida en silencio.** Sigue sin lanzar (no puede tumbar un trabajo hecho), pero el resultado ya no se ignora: se registra con `console.error` y queda `usage_log_reconciled: false` en `raw_response` de la transcripción y del análisis. | `transcriptionService.ts:671`, `callAnalysisService.ts:600`. |
| 11 | bajo | **Doc falso.** §12.a decía que `CallAiPolicyCard` no estaba montada (sí lo está, `ProveedoresTab.tsx:18,106`) y §14.1 nº 6 que no existía UNIQUE en `activities.call_id` (existe `activities_call_id_uidx`). Ambas corregidas arriba; la «Petición a DB» nº 1 de `F4-r2.md` queda cerrada. | Este documento, §12.a y §14.1. |

### 15.2 Riesgos del tester atendidos

- **Duplicados por concurrencia**: aplicados `opportunity_objections_opp_objection_uidx` y
  `call_tag_relations_call_tag_uidx` (§3.3.b). El `upsert` con `onConflict` de
  `applyAnalysis` ya tiene el índice que necesitaba: sin él fallaba con `42P10`.
- **`call_analyses` sin UNIQUE**: se mantiene así **por diseño** (histórico de
  re-análisis). ~~Queda declarado en §3.4 como riesgo cubierto sólo por el dedupe de la cola.~~
  ⚠️ **Esta frase era FALSA** (tester r3 N4) y se corrige en **§16.2**: el dedupe de
  `outbound_jobs` NO intervenía ni con `?sync=1` ni con `force:true`, que son justamente los
  dos botones de la UI.
- **Carrera de dos entregas simultáneas del webhook**: sin cerrar; sigue dependiendo del
  `dedupe_key` de `outbound_jobs`.

### 15.3 Verificación de la ronda 3

- `npx jest src/lib/services/crm/__tests__/` → **26 suites, 573 tests**; las 4 suites de F4
  y del tester (`f4Adversarial`, `f4AnalysisApply`, `f4Webhook`, `f4Round2`) **196/196 en verde**.
- `npx jest` completo → **1174 verdes, 1 saltado, 2 rojos**, ambos en
  `src/lib/services/website/__tests__/sectionContract.test.ts` (ajena a F4, ya roja en la ronda 1).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → **222 errores** frente a los
  **230** del baseline; **0** en cualquier archivo de F4 (`stt/**`, `transcriptionService`,
  `callAnalysisService`, `callAnalysisRules`, `callActivityService`, `callActivitySync`,
  `callTagService`, `manualCallService`, `api/crm/{calls,transcribe,webhooks}/**`,
  `components/crm/calls/**`, `jobs/handlers/{transcribe,analyze}` y las suites de F4).
  El único archivo con errores que no estaba en el baseline es
  `src/lib/services/crm/__tests__/f8Adversarial.test.ts`, del tester de F8.
- BD real: la migración de §3.3.b aplicada y verificada con `pg_indexes`. No se creó ningún
  dato de prueba en esta ronda (no hizo falta): `opportunity_objections`,
  `call_tag_relations`, `call_analyses`, `objections` y `activities(call_id)` siguen en **0 filas**.
  ⚠️ NO VERIFICADO: nada de esta ronda tocó red ni proveedores reales; ElevenLabs
  (webhook asíncrono incluido) sigue probado sólo con dobles porque `.env.local` no tiene
  `ELEVENLABS_WEBHOOK_SECRET` ni `ELEVENLABS_STT_WEBHOOK_ID`. Tampoco se abrió la UI en el
  navegador (sin sesión de prueba): el cambio de `STUCK_MS` está verificado por código, no
  por render.

### 15.4 Archivos tocados en la ronda 3

| Archivo | Cambio |
|---|---|
| `src/lib/services/crm/transcriptionService.ts` | `CreditLedger` (libro mayor de créditos) + rama de webhook dentro del `try` + `unitCostUsd` en la reconciliación + `isLiveAttempt` respetado con `force`. |
| `src/lib/services/crm/callAnalysisService.ts` | Usa el libro mayor; `applyAutoTags` sin `.catch()` mudo (`tagging_error` en `raw_response`); `upsert` de objeciones con `onConflict`. |
| `src/lib/services/crm/callAnalysisRules.ts` | Enmascarado reescrito; cabecera de la regla con la cobertura real; `tasks.status` por `assertDbEnum`. |
| `src/lib/services/crm/callActivityService.ts` | `CALL_ACTIVITY_TYPE` / `CALL_NOTIFICATION_CHANNEL`; comentario del cerrojo actualizado al índice real. |
| `src/lib/services/crm/callActivitySync.ts` | Reutiliza `CALL_ACTIVITY_TYPE`. |
| `src/lib/services/crm/manualCallService.ts` | Tope por organización; literales validados; compensación del storage sin `.catch()` vacío. |
| `src/lib/services/crm/callTagService.ts` | `tagCall` propaga el error del INSERT y resuelve el choque de UNIQUE releyendo. |
| `src/app/api/crm/calls/manual/route.ts`, `src/app/api/crm/transcribe/route.ts` | Tope y mensaje reales (adiós al «supera 40 MB»). |
| `src/app/api/crm/calls/[id]/transcribe/route.ts` | Sufijo de reintento también con `processing` obsoleto. |
| `src/app/api/crm/calls/[id]/tags/route.ts` | `source` del body validado contra el CHECK (400 si no). |
| `src/components/crm/calls/CallTranscriptPanel.tsx` | `STUCK_MS` 3 min → 10 min. |
| `src/lib/services/crm/__tests__/{f4Round2,f4Adversarial,f4AnalysisApply}.test.ts` | 11 casos que afirmaban el defecto convertidos en casos que afirman el comportamiento correcto (mismo escenario y mismas entradas). |

---

## 16. Registro ronda 4 (2026-09-09) — respuesta al informe `TEST-F4-r3.md`

El tester puntuó la ronda 3 con **8,5/10** y dejó 7 fallos nuevos (1 alto, 3 medios,
3 bajos) más dos ítems parciales y uno corregido sin cobertura. Esta ronda ataca el alto,
los dos parciales, el ítem sin test y la declaración falsa del doc. Los dos «bajos»
restantes (N5 títulos obsoletos, N6 tope de despliegue) se comentan al final.

### 16.1 Correcciones de la ronda 4

| # r3 | Severidad | Corrección | Evidencia |
|---|---|---|---|
| **N1** | **alto** | **`settleCreditDelta` daba por devuelto lo que la RPC rechazaba.** `refundAiCredits` no lanza: devuelve `false`, y el ajuste a la baja ignoraba ese booleano, así que un reembolso rechazado salía como `ok:true, delta:-N`: el libro mayor lo apuntaba como devuelto, `raw_response` publicaba un importe que la organización nunca recuperó y no quedaba ni `console.error` ni fila conciliable. Ahora **los dos sentidos del ajuste** informan de lo que pasó de verdad: al alza (`chargeAiCredits` lanza) y a la baja (`refundAiCredits` devuelve `false`) el ajuste se marca **no aplicado** (`ok:false`, `delta:0`), el importe rechazado viaja en `unrefunded`, se escribe la MISMA fila `ai_usage_logs '<accion>:refund_failed'` (`credits_consumed: 0`, `metadata.stage='settle'`) que ya escribía el cierre, y `raw_response` lleva `credit_settlement_error` + `pending_refund_credits`. Como el saldo vivo **no** baja, un cierre posterior devuelve el cobro íntegro. | `transcriptionService.ts` (`settleCreditDelta`, `recordFailedRefund`, `CreditLedger.settle`), `callAnalysisService.ts` (raw del análisis). `npx jest src/lib/services/crm/__tests__/f4Round3.test.ts -t "T1"` … `-t "T5"` + `f4Round4Builder.test.ts -t "B12"` / `-t "B13"`. |
| **N1b** | alto | **Auditoría de todos los puntos de reembolso de F4.** Búsqueda de `refund` sobre `src/lib/services/crm/**` (sin tests): en código de producción de F4 sólo hay **dos** llamadas a `refundAiCredits` — `CreditLedger.refundOutstanding` (ya comprobaba el booleano desde la ronda 3) y la de `settleCreditDelta` (corregida aquí). No queda ninguna sin mirar el resultado. `withAiCharge` de `aiCostService.ts` también lo ignora, pero **es archivo compartido y F4 no lo usa** (ver «Integración pendiente» del informe). | `transcriptionService.ts` líneas 903 y 1068. |
| **N2** | medio | **El caso R8 seguía afirmando el defecto.** Pasaba por un accidente de vocabulario (`.not.toMatch(/reembols/i)` mientras el mensaje dice «devolver»), así que no vigilaba nada y el informe r3 lo citaba como evidencia. Reescrito **con el mismo escenario y los mismos datos** (cobro 6, INSERT de `call_analyses` que falla, RPC que devuelve `false`): ahora exige que el mensaje diga cuántos créditos no volvieron y dónde conciliarlos, que la cifra **no** se infle sumando el ajuste ya reintentado, y que exista la fila `call_analyze:refund_failed` con `credits_consumed: 0` y `pending_refund_credits: 6`. | `f4Round2.test.ts` R8. |
| **N4** | medio | **La mitigación declarada del doble cobro de análisis no existía** (ni `?sync=1` ni `force:true` pasaban por el dedupe). Ahora: (a) el sufijo de reintento usa `forceRetryBucket()` —marca redondeada a 60 s— en vez de `Date.now()`, así dos clics en «Reanalizar» comparten `dedupe_key` y el índice único parcial `outbound_jobs_dedupe_live_uidx` (`queued`/`running`) deja pasar **un solo job**: exclusión real entre procesos, no un candado en memoria; (b) el camino `?sync=1` comprueba antes con `findLiveCallJob` si hay un job vivo para esa llamada y responde **409 `ANALYSIS_IN_PROGRESS`** en vez de ejecutar y cobrar en paralelo; si esa comprobación falla no se finge que no hay job: la respuesta lleva `dedupe_checked:false`. Lo mismo se aplica al sufijo de la ruta de transcripción. **Lo que sigue abierto está en §16.2.** | `callIntelligenceService.ts` (`FORCE_RETRY_WINDOW_MS`, `forceRetryBucket`, `findLiveCallJob`), `api/crm/calls/[id]/analyze/route.ts`, `api/crm/calls/[id]/transcribe/route.ts`; casos B9-B11. |
| **N3** | medio | **Enmascarado: seguía fallando en los dos sentidos.** La regla de la ronda 3 («un dígito» + lista cerrada de 48 conectores) destruía cifras (`La clave es 20000000 al mes`, `El dato clave es 2026`) y dejaba a la vista credenciales en cuanto había una palabra fuera de la lista (`mi clave personal es Sol2024`). Ahora manda la **forma del valor**: letras+dígitos (4-24) = credencial, se oculta aunque entre medias haya palabras cualesquiera dentro de la ventana y sin cruzar fin de frase (la coma no corta); **sólo dígitos** = camino ambiguo, que exige conectores, longitud 3-8 para palabras clave fuertes y 3-6 para «clave», y descarta años (1900-2099) y cifras seguidas de unidad de negocio («al mes», «pesos», «por ciento»). | `callAnalysisRules.ts` (`findSecretValue`, `WEAK_SECRET_KEYWORD_RE`, `AMOUNT_MARKER_RE`); casos T8-T10 y B4-B8. |
| **N7** | bajo | **El ítem 10 (reconciliación fallida) estaba corregido sin ninguna prueba.** Ya la tiene, en las dos ramas: log inexistente → `raw_response.usage_log_reconciled:false` + `console.error` con el id del log, y el caso positivo → `true` con la economía real en la fila. | `f4Round4Builder.test.ts` B1-B3. |

### 16.2 Doble cobro (análisis **y** STT): qué queda abierto (riesgo asumido por escrito)

> **Ronda 6:** la tabla se llamaba «doble cobro de `call_analyses`» y sólo cubría los caminos
> que cobran análisis. El cobro de **STT** tiene los mismos caminos y no aparecía en ninguna
> parte (tester r5 N1); las dos filas de `transcribe` → cola se añaden aquí.

`call_analyses` sigue **sin** índice único, por diseño: guarda el histórico de re-análisis
(el caso G5 depende de ello). Con las correcciones de §16.1 N4, el riesgo real de cobrar
dos veces queda así, sin adornos:

| Camino | Antes | Ahora |
|---|---|---|
| Cola (`analyze` sin force) | cubierto por `dedupe_key` | cubierto |
| «Reanalizar» (`force:true`) → cola | **NO** cubierto: `:retry:<Date.now()>` daba una clave distinta por clic | cubierto dentro de la ventana de 60 s por el índice único parcial. ⚠️ Corregido en la ronda 5 (tester r4 P4): esta casilla decía «cubierto» y sólo lo estaba **entre dos clics de force**; frente a un job vivo de la cadena automática (clave llana `analyze:{callId}`) la clave `…:retry:{bucket}` era **otra** y pasaba. Ver §17.1 P4 |
| «Reanalizar» con un job vivo de la **cadena automática** | **NO** cubierto (clave distinta → segundo job → segundo cobro) | cubierto desde la ronda 5: la ruta consulta `findLiveCallJob` antes de encolar y devuelve el job vivo (`deduped:true`) |
| `analyze?sync=1` con un job vivo | **NO** cubierto: ejecutaba en línea y cobraba otra vez | cubierto: 409 `ANALYSIS_IN_PROGRESS` |
| `transcribe?sync=1` (encadena análisis en línea) | **NO** cubierto, y el informe r4 decía falsamente que sí | cubierto desde la ronda 5: 409 `TRANSCRIPTION_IN_PROGRESS`/`ANALYSIS_IN_PROGRESS` (§17.1 P2) |
| **`transcribe` → COLA con reintento** (`failed` o `processing` obsoleto) — **cobra STT, no `call_analyses`** | **NO** cubierto hasta la ronda 6: `…:retry:{bucket}` cambia de valor cada 60 s, así que dos clics separados por más de un minuto daban **dos claves y dos jobs**; la UI ofrece «Reintentar» *con el job vivo* a los 10 min. Que el segundo cobrara o no dependía del orden de ejecución de la cola | cubierto desde la ronda 6: la ruta consulta `findLiveCallJob(..., 'transcribe')` **antes de encolar** y devuelve el job vivo con `deduped:true` (§18.1 N1) |
| `transcribe` → COLA sin reintento (llamada nueva, cadena automática, `manual`, `recordingFetch`) | cubierto por la clave llana `transcribe:{callId}` + índice único parcial | cubierto (sin cambios) |
| **Dos `?sync=1` verdaderamente simultáneos** | no cubierto | **SIGUE SIN CUBRIR** |

**Riesgo asumido, con nombre y apellidos:** dos peticiones `?sync=1` para la misma llamada
que se crucen antes de que ninguna haya insertado su fila pueden analizar dos veces y
cobrar dos veces. Cerrarlo de verdad exige un cerrojo en BD (fila de reclamación con índice
único, o `pg_try_advisory_xact_lock`), es decir cambiar cómo se persiste el análisis; se
descarta en esta ronda porque el coste de la carrera es un cobro de 1-30 créditos, el
volumen de la fase es **cero** hoy y el cambio tocaría el camino de persistencia el mismo
día que se toca el dinero. Queda anotado aquí, no sólo en un informe: si el volumen sube,
esto se cierra antes que nada.

### 16.3 Verificación de la ronda 4

- `npx jest src/lib/services/crm/__tests__/` → **31 suites, 640 tests, 640 verdes** (medida
  final; en una pasada intermedia `f6Adversarial` estaba roja —agente de voz, trabajo
  simultáneo— y su propio agente la arregló después). Las suites de F4 y del tester
  (`f4Adversarial`, `f4AnalysisApply`, `f4Webhook`, `f4Round2`, `f4Round3`,
  `f4Round4Builder`) pasan enteras.
- `npx jest` completo → **78 suites, 1261 tests: 1257 verdes, 1 saltado, 3 rojos** en dos
  suites **ajenas**: `src/lib/services/website/__tests__/sectionContract.test.ts` (ya roja
  desde la ronda 1) y `src/__tests__/guardrails.test.ts`, cuyo fallo es la allow-list con
  `api/crm/sequences/run` y `api/crm/voice-agents/campaigns/run` (F8 y F6, en trabajo
  simultáneo; `guardrails.test.ts` es archivo compartido y no se tocó).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → **220 errores** (baseline 230);
  **0** en cualquier archivo de F4 ni en sus suites (comprobado por grep sobre `stt/**`,
  `transcriptionService`, `callAnalysisService`, `callAnalysisRules`, `callActivity*`,
  `callAiPolicy`, `callChannelRoles`, `callIntelligenceService`, `manualCallService`,
  `callTagService`, `prompts/**`, `api/crm/{calls,transcribe,webhooks}/**`,
  `components/crm/calls/**`, `jobs/handlers/{transcribe,analyze}` y `__tests__/f4*`).
- Rutas contra el servidor canónico `http://localhost:3002` sin sesión: `POST .../analyze`,
  `.../analyze?sync=1`, `.../transcribe` y `.../tags` → **307** a `/auth/login`. Fail-closed
  intacto con las rutas modificadas.
- BD real (`jgmgphmzusbluqhuqihj`): `pg_indexes` confirma `outbound_jobs_dedupe_live_uidx`
  = `UNIQUE (organization_id, dedupe_key) WHERE status IN ('queued','running') AND
  dedupe_key IS NOT NULL`, y `pg_get_functiondef('fn_enqueue_job')` confirma que ante
  conflicto **no inserta y devuelve el id del job vivo**: es lo que hace real la mitigación
  de §16.1 N4. **Esta ronda no escribió ni una fila** en la BD (no hizo falta ningún dato de
  prueba) ni aplicó ninguna migración, así que no hay nada que limpiar.
- Conteos finales verificados por MCP tras las pruebas: `call_analyses` 0,
  `call_transcripts` 0, `ai_usage_logs(action_type like 'call%')` 0,
  `outbound_jobs(kind in transcribe,analyze)` 0. Nada que limpiar porque nada se escribió.
- ⚠️ **NO VERIFICADO**: (a) nada se probó contra proveedores
  reales ni contra el navegador (cuarta ronda: `.env.local` sigue sin
  `ELEVENLABS_WEBHOOK_SECRET` ni `ELEVENLABS_STT_WEBHOOK_ID`); (b) el 409
  `ANALYSIS_IN_PROGRESS` y el dedupe por ventana están probados con dobles y contra el
  esquema real (índice y `fn_enqueue_job` leídos de la BD), **no** con dos peticiones
  concurrentes de verdad.

### 16.4 Archivos tocados en la ronda 4

| Archivo | Cambio |
|---|---|
| `src/lib/services/crm/transcriptionService.ts` | `settleCreditDelta` comprueba el resultado del reembolso en los dos sentidos y devuelve `unrefunded`/`error`; `recordFailedRefund` extraído y compartido con el cierre; `CreditLedger` distingue `unrefunded` (deuda definitiva del cierre) de `unsettled` (ajuste rechazado, aún dentro de `outstanding`); `raw_response` con `credit_settlement_error`/`pending_refund_credits`. |
| `src/lib/services/crm/callAnalysisService.ts` | Mismo `credit_settlement_error`/`pending_refund_credits` en el `raw_response` del análisis. |
| `src/lib/services/crm/callAnalysisRules.ts` | Enmascarado: dos niveles de palabra clave, regla por forma del valor, exclusión de años e importes; docblock con los límites que NO cubre. |
| `src/lib/services/crm/callIntelligenceService.ts` | `FORCE_RETRY_WINDOW_MS`, `forceRetryBucket()` y `findLiveCallJob()` (que no traga el error: informa `checked:false`). |
| `src/app/api/crm/calls/[id]/analyze/route.ts` | `?sync=1` respeta el dedupe (409 `ANALYSIS_IN_PROGRESS`); el reintento forzado usa la ventana en vez de `Date.now()`. |
| `src/app/api/crm/calls/[id]/transcribe/route.ts` | Mismo sufijo por ventana. |
| `src/lib/services/crm/__tests__/f4Round2.test.ts` | R8 reescrito (afirmaba el defecto); R1-R4 ajustados a los dos campos nuevos de `CreditSettlement`, con los mismos valores de dinero. |
| `src/lib/services/crm/__tests__/f4Round3.test.ts` (suite del tester) | T1-T5 y T8-T9 pasan a afirmar el comportamiento correcto, conservando escenario y datos; T6, T7, T10-T12 intactos. |
| `src/lib/services/crm/__tests__/f4Round4Builder.test.ts` (NUEVO) | 13 casos: B1-B3 reconciliación fallida (ítem 10, que no tenía prueba), B4-B8 enmascarado y sus límites, B9-B11 dedupe y job vivo, B12-B13 conservación del dinero con el ajuste rechazado. |
| `docs/crm-revenue-os/FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | §5 y §9 marcadas como plan no ejecutado (`piiMasker` no existe, marcador real `[OCULTO]`), §14.2 con los límites del enmascarado, §15.1 nº 4 y nº 8 y §15.2 corregidas, y este §16. |

### 16.5 Lo que NO se hizo, y por qué

- **N5 (títulos de tests obsoletos)** y **N6 (el `max_bytes` prometido puede superar el
  límite de cuerpo del despliegue)**: no atendidos en esta ronda. N6 no es una regresión
  —antes se prometían 40 MB y se aplicaban 25— pero es real: sin `bodySizeLimit` declarado,
  el número que se enseña (hasta 1 GB con ElevenLabs) es inalcanzable en una función
  serverless. La corrección correcta es acotar por el **mínimo** entre el tope de la cadena
  y el del despliegue, y ese segundo número vive en `vercel.json` / `next.config.js`, que son
  **archivos compartidos**: se pide en «Integración pendiente» del informe.
- **Cerrojo real para dos `?sync=1` simultáneos**: ver §16.2.

---

## 17. Registro ronda 5 (2026-09-09) — respuesta al informe `TEST-F4-r4.md`

El tester puntuó la ronda 4 con **9,0/10** (listón 9,5) y dio por **cerrado** el agujero de
dinero: verificó que los dos sentidos del ajuste informan, que el saldo vivo no baja cuando
la RPC rechaza, que la traza es común, que las dos deudas están separadas, que el mensaje da
30 y no 59, y —contra Postgres— que la mitigación del doble cobro no es papel. Dejó seis
fallos nuevos: dos medios (P1 enmascarado, P2 una afirmación falsa del informe) y cuatro
bajos (P3 filas de reembolso que se solapan al conciliar, P4 una casilla optimista, P5
idempotencia latente, P6 una deuda cosmética de 0). Esta ronda los cierra todos.

### 17.1 Correcciones de la ronda 5

| # r4 | Severidad | Corrección | Evidencia |
|---|---|---|---|
| **P1** | medio | **El enmascarado v3 introducía un falso positivo que la v2 no tenía.** La vía alfanumérica se saltaba **a propósito** el corte por conector, así que cualquier token con letras y dígitos en la ventana posterior a «clave» se borraba: `iPhone16`, `Pro2026`, `Fase2`, `Windows11`, `ISO9001`, `Modelo3` —el modelo, la versión y la certificación son justo lo que el análisis necesita leer en una llamada de venta—. La v4 **devuelve el corte por conector a las dos vías** y conserva los aciertos de la v3 ampliando la lista con las palabras del propio dictado de una credencial (`personal`, `que usamos siempre`, `apúntala bien`, `nueva`, `actual`…). Además: (a) tras «clave» (palabra débil) la vía de **sólo dígitos queda cerrada** —eran los dos falsos positivos que sobrevivían de la v2: `el número clave es 150000`, `la cifra clave es 4500`—; (b) «clave» se descarta entera cuando la gramática la usa como adjetivo (`el FACTOR clave`, `el NÚMERO clave`), como modismo (`la clave ESTÁ EN…`) o con genitivo ajeno a una credencial (`la clave DEL negocio/proyecto/éxito`), y **no** cuando el genitivo sí lo es (`la clave DE ACCESO`, `la clave DEL WIFI`). **Antes de darla por buena se pasó la batería COMPLETA de las tres versiones a la vez**, aciertos y falsos positivos: casos C1 (15 aciertos), C2 (21 falsos positivos) y C3 (los 8 límites). | `callAnalysisRules.ts` (`findSecretValue`, `weakKeywordIsIdiom`, `SECRET_CONNECTORS`, `CREDENTIAL_CONTEXT_NOUNS`, `WEAK_ADJECTIVE_HEADS`, `WEAK_IDIOM_VERBS`); `f4Round5Builder.test.ts` C1-C3 y `f4Round4Tester.test.ts` U1-U6d. |
| **P2** | medio | **La guarda de trabajo vivo que el informe r4 decía tener en transcripción NO existía.** `findLiveCallJob` aparecía en un único archivo de producción (`analyze/route.ts`) y `POST /transcribe?sync=1` entraba en `runTranscribePipeline(..., { inlineAnalyze: true })` **sin guarda**, llegando al cobro de análisis por un camino que el 409 no cubría. Ahora esa ruta consulta los **dos** kinds (`transcribe` y `analyze`) antes de ejecutar y responde 409 `TRANSCRIPTION_IN_PROGRESS` / `ANALYSIS_IN_PROGRESS`; si la consulta falla no se finge que no hay job: la respuesta lleva `dedupe_checked:false` y el motivo. El doc r4 sí estaba bien redactado («al **sufijo** de la ruta de transcripción»); el error estaba sólo en el informe, y queda anotado como lo que fue: una cita no comprobada. | `api/crm/calls/[id]/transcribe/route.ts`; `f4Round5Builder.test.ts` C4, `f4Round4Tester.test.ts` U12. |
| **P3** | bajo | **Las filas `:refund_failed` se solapan al conciliar.** Con cobro 30, ajuste de 29 rechazado y cierre de 30 rechazado quedan **dos** filas (`stage:'settle'` 29 y `stage:'close'` 30): el mensaje de error dice 30, que es correcto, pero sumarlas sin filtrar da **59** por una deuda de 30. Ni el doc ni el informe daban la consulta de conciliación. Está en **§17.3**, con la explicación de por qué las dos filas existen. | §17.3; `f4Round4Tester.test.ts` U9. |
| **P4** | bajo | **La casilla «cubierto» de §16.2 sólo lo estaba frente a sí misma.** El dedupe por ventana cubre dos clics de *force* entre sí, pero no el caso mixto: con un job vivo de la cadena automática (clave llana `analyze:{callId}`), forzar generaba `…:retry:{bucket}` —otra clave, otro job, otro cobro—. En vez de sólo corregir la casilla, **se cubre el caso**: la ruta consulta `findLiveCallJob` antes de encolar un reintento forzado y devuelve el job vivo con `deduped:true` en lugar de encolar otro. La tabla de §16.2 queda además corregida y ampliada camino a camino. | `api/crm/calls/[id]/analyze/route.ts`; `f4Round5Builder.test.ts` C5; §16.2. |
| **P5** | bajo | **`CreditLedger.refundOutstanding` dejaba de ser idempotente en su rama de fallo.** Con la RPC rechazando, `outstanding` no baja (correcto: el saldo sigue debitado), pero una segunda llamada repetía el intento y **duplicaba la deuda declarada** (60 por un cobro de 30) y la fila conciliable. No era alcanzable hoy —los cuatro puntos de salida son ramas excluyentes— pero el libro mayor se documenta como idempotente. Ahora el cierre rechazado queda anotado (`closeFailure`) y una segunda llamada con el mismo saldo devuelve **el mismo resultado** sin volver a llamar a la RPC, sin duplicar `unrefunded` y sin escribir una segunda fila. | `transcriptionService.ts` (`CreditLedger.refundOutstanding`); `f4Round5Builder.test.ts` C6, `f4Round4Tester.test.ts` U11. |
| **P6** | muy bajo | **El ajuste al alza rechazado publicaba `pending_refund_credits: 0`**, una clave de «deuda de reembolso» a cero en un caso donde el dinero va en la otra dirección (infracobro). La clave sólo se publica ahora si `unrefunded > 0`; el motivo se sigue leyendo en `credit_settlement_error`. | `transcriptionService.ts` y `callAnalysisService.ts` (`raw_response`); `f4Round5Builder.test.ts` C7, `f4Round4Tester.test.ts` U10. |

### 17.2 Enmascarado v4: la regla y sus límites

> ⚠️ **CORRECCIÓN (ronda 6).** Lo que sigue decía «los ocho límites… **ésta es la lista
> entera**», y **no lo era**: faltaban cuatro clases más y una de ellas no era un límite de la
> heurística sino una **contradicción interna del archivo** (ocho de los diecisiete sustantivos
> declarados «de credencial» no estaban en la lista de conectores, así que `la clave del router
> es Admin2024` viajaba entera al proveedor de análisis). La versión vigente es la **v5** y su
> lista de límites, explícitamente **no exhaustiva**, está en **§18.2**. Este apartado se
> conserva como registro de la ronda 5.

Regla vigente (`maskSensitiveForLlm` en `callAnalysisRules.ts`), tres piezas, todas
gramaticales y ninguna dependiente de la forma del token:

1. entre la palabra clave y el valor **sólo caben conectores** (preposiciones, artículos,
   cópulas y las palabras del dictado de una credencial: `personal`, `que`, `usamos`,
   `siempre`, `bien`, `apúntala`, `nueva`, `actual`…). La primera palabra ajena corta;
2. **«clave» es palabra débil**: no acepta valores de sólo dígitos, y se descarta entera
   cuando la precede un sustantivo que la usa de adjetivo (`el factor clave`, `el número
   clave`), cuando la sigue el modismo `está en`, o cuando la sigue `de/del` + sustantivo
   ajeno a una credencial (`del negocio`, `del proyecto`, `del éxito`);
   > ⚠️ **CORRECCIÓN (ronda 7, tester r6 F4).** Desde la ronda 6 esto **ya no es cierto tal
   > como está escrito**: el genitivo se evalúa **antes** que la cabeza adjetiva, de modo que
   > un genitivo **de credencial** anula la protección del adjetivo (`el tema clave de la
   > cuenta es Premium2024` → `[OCULTO]`). El mecanismo vigente está en el docblock de
   > `maskSensitiveForLlm` y en **L12** de §18.2. Este punto se conserva como registro de la
   > ronda 5, no como descripción del código de hoy.
3. las palabras **fuertes** (`cvv`, `cvc`, `código de seguridad/verificación`, `contraseña`,
   `password`, `pin`, `nip`, `otp`) sí aceptan valores de 3-8 dígitos, salvo unidad de
   negocio detrás (`al mes`, `pesos`, `por ciento`).

**Límites reales, los ocho, ninguno resuelto** (r4 P1 reprochó que la lista declarada fuera
un subconjunto; ésta es la lista entera y está fijada por el caso C3):

| # | Límite | Ejemplo que queda INTACTO |
|---|---|---|
| L1 | credencial de sólo letras | `la clave es Girasol`, `la contraseña es girasol` |
| L2 | credencial de sólo dígitos tras «clave» | `la clave es 1234567` |
| L3 | más de 8 dígitos tras palabra fuerte | `mi contraseña es 987654321` |
| L4 | valor situado **antes** de la palabra clave | `Sol2024 es mi clave` |
| L5 | fin de frase entre palabra clave y valor (la coma y los dos puntos **no** cortan) | `Te digo el pin. Es 4321` |
| L6 | ventana de 6 palabras | `la clave que te dije por teléfono el otro día es Sol2024` |
| L7 | palabra ajena por medio (el precio de no borrar `ISO9001`) | `nuestra clave interna es Sol2024` |
| L8 | **falso positivo vivo**: producto alfanumérico anunciado sin genitivo ni adjetivo | `la clave es el iPhone16` → `la clave es el [OCULTO]` |

Sigue en pie lo dicho en §14.2: esto sólo reduce superficie ante el **segundo** proveedor
(el de análisis); `call_transcripts.full_text` y los segmentos se guardan sin enmascarar y el
audio íntegro ya viajó al STT. **No es una garantía PCI** y **no se declara cerrada**: sin un
corpus real de transcripciones esto no converge (tres versiones seguidas rompieron por donde
la anterior no rompía; ésta es la primera que se valida contra la batería completa de las
tres).

### 17.3 Conciliar la deuda de reembolsos fallidos (tester r4 P3)

Una misma ejecución puede dejar **dos** filas `'<accion>:refund_failed'` cuando la RPC
rechaza dos veces: la del **ajuste** a la baja (`stage:'settle'`, importe parcial) y la del
**cierre** (`stage:'close'`, el saldo vivo entero, que **incluye** lo del ajuste porque éste
nunca bajó `outstanding`). Las dos son útiles —la de `settle` dice que el ajuste no se
aplicó, la de `close` dice cuánto se debe— pero **sumarlas infla la deuda**. La consulta
correcta se queda con una fila por reembolso, prefiriendo la etapa `close`:

```sql
-- Deuda real con cada organización por reembolsos que la RPC rechazó.
select organization_id,
       sum((metadata->>'pending_refund_credits')::int) as creditos_pendientes
from (
  select distinct on (organization_id, metadata->>'refunded_log_id') *
  from ai_usage_logs
  where action_type like '%:refund_failed'
  order by organization_id,
           metadata->>'refunded_log_id',
           (metadata->>'stage' = 'close') desc,   -- el cierre manda sobre el ajuste
           created_at desc
) u
group by organization_id;
```

Con el escenario del tester (cobro 30, ajuste de 29 rechazado, cierre de 30 rechazado) esta
consulta da **30**, la misma cifra que el mensaje de error; la suma ingenua daría 59. Si un
`refunded_log_id` viene `null` (no hubo fila de uso que ajustar), las filas de esa
organización se agrupan en una sola: es el caso degenerado y hay que mirarlas a mano.
Verificado por el caso U9 de `f4Round4Tester.test.ts` **y contra Postgres real**
(`jgmgphmzusbluqhuqihj`, dentro de `begin; … rollback;`): con las dos filas del escenario
insertadas, la consulta devuelve `conciliado = 30` mientras la suma sin filtrar devuelve
`suma_ingenua = 59`. Tras el `rollback`, `ai_usage_logs` vuelve a **0** filas
`%:refund_failed`. La tabla está hoy vacía de filas `call%`, así que **fuera de ese ensayo**
la consulta no se ha ejercido con datos de producción.

### 17.4 Verificación de la ronda 5

- `npx jest src/lib/services/crm/__tests__/ src/__tests__/guardrails.test.ts` → **34 suites,
  722 tests: 721 verdes, 1 rojo**. El rojo es **ajeno**: `f6Adversarial.test.ts` H3
  (`registerJobHandler('ai_call'…)` en `src/lib/jobs/handlers/index.ts`, agente de voz,
  archivo compartido que F4 no toca).
- `src/__tests__/guardrails.test.ts` → **39/39 verdes**, incluida la guarda nueva del
  orquestador que falla si un archivo de producción llama a `refundAiCredits` sin guardar el
  valor devuelto. F4 no añade ninguna llamada nueva: sigue teniendo **dos**, las dos con el
  resultado asignado y comprobado.
- `npx jest src/lib/services/crm/__tests__/f4` → **8 suites, 244 tests, 244 verdes**.
- `npx jest` completo → **81 suites (80 ejecutadas, 1 saltada), 1320 tests: 1316 verdes,
  1 saltado, 3 rojos** en dos suites **ajenas**:
  `src/lib/services/website/__tests__/sectionContract.test.ts` (roja desde la ronda 1) y
  `f6Adversarial.test.ts` (agente de voz).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → **219 errores** (línea base
  230), **0** en archivos de F4 ni en sus suites. En una pasada intermedia fueron 225: los 6
  de diferencia eran de `f8Adversarial.test.ts`, suite de F8 en trabajo simultáneo, y su
  agente los corrigió después.
- Rutas contra el servidor canónico `http://localhost:3002` sin sesión: `POST .../transcribe`,
  `.../transcribe?sync=1`, `.../analyze`, `.../analyze?sync=1` → **307** a `/auth/login`.
  Fail-closed intacto con las dos rutas modificadas hoy.
- **Ninguna migración y ningún archivo `.sql`.** Las únicas escrituras en la BD fueron las
  **dos filas** del ensayo de §17.3, dentro de `begin; … rollback;`; conteos posteriores:
  `ai_usage_logs(action_type like 'call%')` 0, `%:refund_failed` 0, `call_analyses` 0,
  `call_transcripts` 0, `call_transcript_segments` 0, `outbound_jobs(transcribe|analyze)` 0,
  `objections` 0 (sigue sin sembrar, ver «Necesito de DB»).
- ⚠️ **NO VERIFICADO** (quinta ronda consecutiva): nada contra proveedores reales ni contra
  el navegador (`.env.local` sigue sin `ELEVENLABS_WEBHOOK_SECRET` ni
  `ELEVENLABS_STT_WEBHOOK_ID`); los 409 nuevos están probados con dobles y por estructura del
  fuente, **no** con dos peticiones concurrentes de verdad; el enmascarado se sigue midiendo
  con frases sintéticas, no con transcripciones reales.

### 17.5 Archivos tocados en la ronda 5

| Archivo | Cambio |
|---|---|
| `src/lib/services/crm/callAnalysisRules.ts` | Enmascarado v4: corte por conector en las dos vías, lista de conectores ampliada con el léxico del dictado de credenciales, vía de sólo dígitos cerrada para «clave», `weakKeywordIsIdiom` (adjetivo / modismo / genitivo), `CREDENTIAL_CONTEXT_NOUNS`, `WEAK_ADJECTIVE_HEADS`, `WEAK_IDIOM_VERBS`; docblock con los **ocho** límites. |
| `src/lib/services/crm/transcriptionService.ts` | `CreditLedger.refundOutstanding` idempotente también en la rama de fallo (`closeFailure`); `raw_response` publica `pending_refund_credits` sólo si `unrefunded > 0`. |
| `src/lib/services/crm/callAnalysisService.ts` | Mismo criterio en el `raw_response` del análisis (P6). |
| `src/app/api/crm/calls/[id]/transcribe/route.ts` | `?sync=1` consulta `findLiveCallJob` para `transcribe` **y** `analyze` antes del pipeline en línea → 409; `dedupe_checked:false` si la consulta falla. |
| `src/app/api/crm/calls/[id]/analyze/route.ts` | El reintento forzado consulta el job vivo antes de encolar y devuelve el existente (`deduped:true`) en vez de crear un segundo job con otra clave. |
| `src/lib/services/crm/__tests__/f4Round5Builder.test.ts` | **NUEVO**, 7 casos: C1-C3 batería completa del enmascarado (aciertos, falsos positivos y los ocho límites), C4-C5 los guardias de las dos rutas, C6-C7 libro mayor en sus ramas de fallo. |
| `src/lib/services/crm/__tests__/f4Round4Tester.test.ts` (suite del tester) | U1-U6 pasan a afirmar el comportamiento correcto (+U6b/U6c/U6d, batería completa y límites); U9 comprueba la consulta de conciliación de §17.3; U10, U11 y U12 afirman lo corregido; U12b conserva como límite declarado que la exclusión vive en las rutas, no en el servicio. Mismo escenario y mismos datos en todos. |
| `docs/crm-revenue-os/FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | §14.2 remite a la lista completa de límites, §16.2 con la casilla P4 corregida y la tabla ampliada camino a camino, y este §17. |

### 17.6 Lo que NO se hizo, y por qué (sigue abierto y declarado)

- **N5 (títulos de tests obsoletos, `f4Adversarial.test.ts:884`)**: sigue abierto. Es
  cosmético y tocar los títulos de una suite que el tester usa como referencia en cada ronda
  tiene más coste que valor mientras la fase esté en revisión; se hará en la ronda de cierre.
- **N6 (el `max_bytes` prometido puede superar el límite de cuerpo del despliegue)**: sigue
  abierto y **no se puede cerrar desde F4**. Necesita el tope real del despliegue, que vive
  en `vercel.json` / `next.config.js`, **archivos compartidos** (protocolo): se pide otra vez
  en «Integración pendiente» del informe, con el bloque exacto.
- **Cerrojo real para dos `?sync=1` verdaderamente simultáneos**: sigue descartado con el
  motivo de §16.2 (exige cambiar cómo se persiste el análisis; volumen cero hoy).
- **Falso positivo L8 del enmascarado** (`la clave es el iPhone16`): declarado, no resuelto.
  Distinguir `iPhone16` de `Sol2024` sin genitivo ni adjetivo por medio exige conocimiento
  del mundo (un léxico de marcas o un clasificador), no una regla gramatical.

---

## 18. Registro ronda 6 (2026-09-09) — respuesta al informe `TEST-F4-r5.md`

Nota de la ronda 5: **9,2/10** (listón 9,5). Cinco de los seis hallazgos quedaron cerrados;
los tres puntos vivos eran **N1** (el gemelo de la guarda de trabajo vivo en el camino de cola
de `/transcribe`), **N2** (el enmascarado desplazó el fallo hacia el lado que **filtra
credenciales**, y la lista de límites se declaraba completa sin serlo) y **N3** (el memo del
cierre rechazado comparado por importe).

El reproche de fondo —cuatro rondas arreglando un defecto y dejando el gemelo en el archivo de
al lado— se ataca esta vez con una **pasada explícita de búsqueda de gemelos** antes de cerrar;
está en §18.4 y en el informe `F4-r6.md`.

### 18.1 Correcciones de la ronda 6

| # | Qué estaba mal | Qué se hizo |
|---|---|---|
| **N1** | `transcribe/route.ts` aplicaba el sufijo `…:retry:{bucket}` **sin consultar el trabajo vivo**. La ventana cambia cada 60 s → dos clics separados por un minuto = dos claves = dos jobs = segundo cobro de STT si el primero ya drenó. Letra por letra el defecto cerrado en `/analyze` en la r5, en el archivo de al lado y con `findLiveCallJob` ya importado | El camino de cola consulta `findLiveCallJob(org, id, 'transcribe', sb)` **antes** de `enqueueTranscribe` cuando hay sufijo de reintento, y devuelve 202 con el **mismo** `job_id` y `deduped:true`. Si la consulta falla, la respuesta publica `dedupe_checked:false` + motivo (no se finge que no había job). Fila nueva en la tabla de §16.2 |
| **N1-UI** | El panel pintaba «Reintentar» **con el job vivo** (a los 10 min) y el toast prometía una transcripción nueva | Los **dos** paneles (`CallTranscriptPanel` y `CallAnalysisPanel`, el gemelo que nadie había mirado) leen `data.deduped` y dicen «Ya había una transcripción/un análisis en curso… no se cobra dos veces» en vez de «se procesará en el próximo minuto» |
| **N2** | `CREDENTIAL_CONTEXT_NOUNS` (17) y `SECRET_CONNECTORS` eran dos listas escritas a mano: 8 sustantivos declaraban «aquí sí hay credencial» y acto seguido **cortaban** la búsqueda del valor. `la clave del router/sistema/portal/red/plataforma/modem/ingreso/login es <credencial>` viajaba **entera** al LLM. `wifi` se salvaba por estar, por casualidad, en las dos | `SECRET_CONNECTORS` se construye con `...CREDENTIAL_CONTEXT_NOUNS`: la primera lista es **subconjunto** de la segunda por construcción, así que la contradicción no puede reaparecer. Además `wi`/`fi` entran en la lista de sustantivos (la grafía normal es `Wi-Fi` y el tokenizador parte por el guion) y el genitivo se evalúa **antes** que la cabeza adjetiva, con lo que «la **palabra** clave **de acceso** es Verano2025» vuelve a leerse como credencial |
| **N2-doc** | §17.2 decía «ésta es la lista entera» y no lo era | Corregido en §17.2 con una nota, y la lista vigente (§18.2) declara **12** límites y dice explícitamente que **no es exhaustiva** |
| **N3** | `refundOutstanding` comparaba el memo por importe (`closeFailure.credits === credits`): un `settle` al alza posterior cambiaba la cifra y reabría la RPC (30 + 35 = 65 por una deuda de 35) | La comparación es por **cierre**: si hay `closeFailure`, se devuelve el mismo resultado sin RPC, sea cual sea el saldo. El importe se conserva como dato del intento (`unrefunded`); el saldo vivo completo se sigue leyendo en `outstanding` |

### 18.2 Enmascarado v5: la regla y sus límites (lista **no exhaustiva**)

Reglas 1-3 sin cambios respecto de §17.2 (conectores, «clave» como palabra débil, palabras
fuertes con 3-8 dígitos). Lo que cambia en la v5:

- **la lista de conectores incluye, por construcción, todos los sustantivos de credencial**
  (`...CREDENTIAL_CONTEXT_NOUNS`). Era la contradicción interna de N2;
- **`wi` y `fi` son sustantivos de credencial**, porque `Wi-Fi` tokeniza en dos palabras;
- **el genitivo se mira antes que la cabeza adjetiva**: `de/del` + sustantivo de credencial
  manda sobre `WEAK_ADJECTIVE_HEADS`.

| # | Límite | Ejemplo |
|---|---|---|
| L1 | credencial de sólo letras | `la clave es Girasol` → intacta |
| L2 | credencial de sólo dígitos tras «clave» | `la clave es 1234567` → intacta |
| L3 | más de 8 dígitos tras palabra fuerte | `mi contraseña es 987654321` → intacta |
| L4 | valor **antes** de la palabra clave | `Sol2024 es mi clave` → intacta |
| L5 | fin de frase por medio (coma y dos puntos **no** cortan) | `Te digo el pin. Es 4321` → intacta |
| L6 | ventana de 6 palabras | `la clave que te dije por teléfono el otro día es Sol2024` → intacta |
| L7 | palabra ajena por medio (el precio de no borrar `ISO9001`) | `nuestra clave interna es Sol2024` → intacta |
| L8 | **falso positivo vivo**: producto alfanumérico sin genitivo ni adjetivo | `la clave es el iPhone16` → `[OCULTO]` |
| L9 | «palabra clave» **sin** genitivo de credencial se lee como *keyword* (SEO), no como contraseña | `mi palabra clave es Sol2024` → intacta |
| L10 | cualquier **separador** dentro del valor parte el token y corta | `mi contraseña es Sol-2024` / `Sol_2024` / `Sol.2024` / `la clave de acceso es Sol 2024` → intactas |
| L11 | palabra ajena entre la clave fuerte y el número | `el pin es el numero 4321` → intacta (`numero` no es conector) |
| L12 | **falso positivo NUEVO, coste declarado del arreglo de N2**: un sustantivo de credencial usado en sentido comercial arrastra el valor que le sigue, **incluso con cabeza adjetiva delante** (ronda 7, tester r6 F4: el genitivo se mira antes y la cabeza ya no protege) | `la clave del sistema es Windows11`, `el tema clave de la cuenta es Premium2024`, `el codigo de seguridad del sistema es ISO9001` → `[OCULTO]`. Con una palabra ajena por medio (`…es el modulo Pro2026`, `…de seguridad interno es ISO9001`) L7 lo salva |

**Esta lista no es exhaustiva y no se declara como tal.** Es la lista de los límites
*conocidos*, todos fijados por prueba (caso D3 de `f4Round6Builder.test.ts`); una heurística
gramatical sobre lenguaje hablado tiene más. Sigue en pie §14.2: sólo reduce superficie ante el
**segundo** proveedor; `full_text` y los segmentos se guardan **sin** enmascarar y el audio
íntegro ya viajó al STT. **No es garantía PCI.** ⚠️ **NO VERIFICADO** con transcripciones
reales: quinta ronda con frases sintéticas.

### 18.3 Verificación de la ronda 6

```bash
npx jest src/lib/services/crm/__tests__/ src/__tests__/guardrails.test.ts
#  → 36 suites, 752/752 verdes (incluidas las 3 suites del tester)
npx jest src/lib/services/crm/__tests__/f4      # 10 suites, 263/263 verdes
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
#  → 219 errores (línea base 230); filtrado por archivos de F4 → 0
```

Sondas sin sesión contra el servidor canónico `http://localhost:3002`, con las rutas ya
modificadas: `POST …/transcribe`, `POST …/transcribe?sync=1` y `POST …/analyze` → **307** a
`/auth/login`. Fail-closed intacto.

### 18.4 Búsqueda explícita del gemelo (lo que faltó cuatro rondas)

| Arreglo | Dónde busqué el gemelo | Resultado |
|---|---|---|
| Guarda de job vivo (N1) | los puntos de encolado del repo (`grep -rn "enqueueTranscribe(|enqueueAnalyze("`): `calls/[id]/transcribe`, `calls/[id]/analyze`, `calls/manual`, `api/crm/transcribe`, `webhooks/elevenlabs`, `jobs/handlers/recordingFetch` | Sólo las dos rutas de `[id]` calculan sufijo de reintento; las demás usan la clave llana y el índice único parcial las cubre. `calls/manual` y `api/crm/transcribe` ejecutan en línea **sobre una llamada recién creada** (`created.callId`), así que no puede existir un job previo: la guarda sería inerte. Las dos que lo necesitaban están cerradas |
| Aviso al usuario (N1-UI) | los 2 componentes que hacen POST a transcribe/analyze | El gemelo existía: `CallAnalysisPanel` tampoco leía `deduped` (la r5 añadió el campo y nadie lo mostraba). Corregidos los dos |
| Enmascarado (N2) | todos los envíos de transcripción a un LLM (`maskSensitiveForLlm`, `renderTranscriptForLlm`, `full_text`) y todos los lectores de `call_transcripts` | Un solo punto de envío (`callAnalysisService.ts:227`), ya enmascarado. Los demás lectores (`timeline/*`, F9) sólo muestran |
| Memo por importe (N3) | otras comparaciones de idempotencia por cifra en los servicios de F4 (`closeFailure`, `settleCreditDelta`) | `settleCreditDelta` no memoiza pero se invoca una sola vez por ejecución y su rechazo ya no se apunta como devuelto (r4 N1). No hay segundo memo por importe |

### 18.5 Archivos tocados en la ronda 6

| Archivo | Qué |
|---|---|
| `src/lib/services/crm/callAnalysisRules.ts` | v5: `SECRET_CONNECTORS` construida con `...CREDENTIAL_CONTEXT_NOUNS`, `wi`/`fi` como sustantivos de credencial, genitivo evaluado antes que la cabeza adjetiva; docblock con L1-L12 y sin declaración de completitud |
| `src/app/api/crm/calls/[id]/transcribe/route.ts` | El camino de **cola** consulta el job vivo antes de encolar el reintento y devuelve `deduped:true`; `dedupe_checked:false` si la consulta falla |
| `src/components/crm/calls/CallTranscriptPanel.tsx` | El toast dice la verdad cuando la respuesta viene deduplicada |
| `src/components/crm/calls/CallAnalysisPanel.tsx` | Igual (gemelo encontrado en la pasada de §18.4) |
| `src/lib/services/crm/transcriptionService.ts` | `refundOutstanding` compara por **cierre**, no por importe (N3) |
| `src/lib/services/crm/__tests__/f4Round6Builder.test.ts` | **NUEVO**: D1-D3 batería completa de las cuatro versiones + la fuga cerrada + los límites L1-L12; D4-D5 la guarda de cola y los dos paneles; D6 el memo del cierre con el saldo cambiado |
| `src/lib/services/crm/__tests__/f4Round5Tester.test.ts` (suite del tester) | V1, V2, V4 y V7 pasan a exigir el comportamiento correcto (mismas frases, expectativa invertida); V3 se reetiqueta como límite declarado L10/L11; V5 y V6 intactos |
| `docs/crm-revenue-os/FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | §16.2 (título + dos filas nuevas para el cobro de STT), nota de corrección en §17.2 y este §18 |

### 18.6 Lo que NO se hizo, y por qué (sigue abierto y declarado)

- **N5** (títulos de tests obsoletos, `f4Adversarial.test.ts:884`): sigue abierto, cosmético.
- **N6** (`max_bytes` frente al tope de cuerpo del despliegue): sigue abierto y **no se puede
  cerrar desde F4**; el número vive en archivos compartidos (petición en el informe).
- **Cerrojo real para dos `?sync=1` simultáneos**: descartado con el motivo de §16.2.
- **L8 y L12** del enmascarado: falsos positivos declarados, no resueltos; distinguir
  `iPhone16` de `Sol2024` exige conocimiento del mundo, no gramática.
- **L10/L11** (separadores y `el pin es el numero`): **no** se arreglan a propósito. Admitir
  separadores dentro del token obliga a cambiar la tokenización, que es justo la pieza que en
  cuatro rondas ha roto siempre por el lado contiguo; se declaran.
- **Sembrado de `objections`**: quinta ronda pidiéndolo; sin filas no se ejercen ni el `upsert`
  ni la acción `objections` de `applyAnalysis`.

---

## 19. Ronda 7 — los cinco puntos bajos de `TEST-F4-r6.md` (fase ya aprobada, 9,6/10)

Ninguno era bloqueante: la fase se aprobó en la ronda 6. Esta ronda cierra los cinco puntos
bajos que quedaban, **sin cambiar el alcance** y sin tocar archivos compartidos.

### 19.1 Los cinco, uno por uno

| # | Hallazgo r6 | Qué se hizo |
|---|---|---|
| **F1** | Las dos rutas publican `dedupe_checked`/`dedupe_error` y **ningún panel los leía** (el gemelo del gemelo, mismos cuatro archivos, un campo más allá) | Los dos paneles leen `json.data?.dedupe_checked === false` y el toast lo dice: «No se pudo comprobar si ya había otra transcripción / otro análisis en curso, así que podría duplicarse». Ya no se promete «se procesará en el próximo minuto» en el camino degradado |
| **F2** | Asimetría entre las guardas `?sync=1`: `/transcribe` comprobaba los dos kinds y `/analyze` sólo el suyo | `/analyze?sync=1` comprueba los **dos** con el mismo `Promise.all`, devuelve `ANALYSIS_IN_PROGRESS` o `TRANSCRIPTION_IN_PROGRESS` según cuál esté vivo y publica `dedupe_checked:false` si cualquiera de las dos consultas falla. Las dos guardas son ahora la misma |
| **F3** | El **plural** de los sustantivos de credencial se escapaba (`la clave de los sistemas es Sol2024`), clase cerrada y sistemática | Arreglado **por la raíz**: `CREDENTIAL_CONTEXT_NOUNS` se deriva de una lista de singulares con `pluralForms` (+s tras vocal, +es/+s tras consonante para los préstamos). No hay lista de plurales que mantener, y `SECRET_CONNECTORS` los hereda por la construcción de la r6 |
| **F4** | **Afirmación falsa en el código**: el docblock seguía diciendo que «clave» «se descarta entera cuando la frase la usa como adjetivo», y desde la r6 el genitivo manda sobre la cabeza adjetiva | Corregido en el docblock de `maskSensitiveForLlm` (pieza 2), en el de `weakKeywordIsIdiom` (marca 1), en **L12** (con el ejemplo del tester, `el tema clave de la cuenta es Premium2024`) y en §17.2 de este documento con una nota de corrección encima del texto viejo. **El comportamiento no cambia: F4 era documental** |
| **F5** | Residuo aritmético: tras un cierre rechazado con 30 y un `settle` al alza aceptado a 35, `unrefunded` seguía valiendo 30 (infradeclaraba 5) | El cierre ya rechazado **sigue sin reabrir la RPC** (eso era N3), pero si el saldo vivo quedó por encima de lo declarado se anota la **diferencia** (5) y se escribe una segunda fila conciliable por esa diferencia: 30 + 5 = 35, nunca 65. A la baja no se reescribe nada |

### 19.2 Pasada de gemelos de la ronda 7 (qué busqué, no sólo qué encontré)

Es el método que aprobó la fase; se repite sobre todo lo que se toca.

| Carril | Qué busqué | Resultado |
|---|---|---|
| Campo publicado que nadie lee (familia F1) | `grep -rn "dedupe_checked\|dedupe_error\|deduped" src` y todos los consumidores de las respuestas de `/transcribe` y `/analyze` | Los tres campos se leen ahora en los dos paneles y no hay más productores. **Un tercer consumidor existe y NO es mío**: `src/components/crm/timeline/entries/CallPanels.tsx:114` (propiedad de F9) hace `POST /analyze` **sin `force`**, así que nunca puede recibir `deduped` ni `dedupe_checked` (la guarda sólo se consulta cuando habrá sufijo); sí muestra «Análisis generado» ante un **202 encolado**, que es la misma clase de promesa de más. Declarado en §19.5 como petición a F9: no se toca |
| Código de error publicado que nadie interpreta | `grep -rn "IN_PROGRESS" src` | Sólo lo emiten las dos rutas en `?sync=1`, y **ninguna interfaz llama con `?sync=1`** (verificado por grep en `src/components`, `src/hooks`, `src/app/app`): lo consumen clientes de API, que reciben el `code`. Sin gemelo |
| Asimetría entre las dos rutas gemelas (familia F2) | Comparación guarda a guarda de `transcribe/route.ts` y `analyze/route.ts`: 404, 200 existente, camino `?sync=1`, camino de cola y `catch` | Cerrada la de `?sync=1`. La del camino de cola **es sólo aparente**: cada ruta consulta el job vivo exactamente cuando va a producir sufijo de reintento (`retry !== undefined` en transcribe, `force` en analyze), que es el único caso que el índice único no cubre; el principio es el mismo. El `catch` de `/analyze` no mapea `TranscriptionError` y el de `/transcribe` sí: **inerte y verificado en el fuente**, `getTranscript` no lanza (devuelve `null`) y el pipeline de análisis no la produce |
| Lista hermana tratada con otro criterio (familia F3) | Las listas de `callAnalysisRules.ts`: `CREDENTIAL_CONTEXT_NOUNS`, `SECRET_CONNECTORS`, `WEAK_ADJECTIVE_HEADS`, `WEAK_IDIOM_VERBS`, `DETERMINERS` | **Gemelo encontrado y cerrado**: `WEAK_ADJECTIVE_HEADS` llevaba los plurales a mano y le faltaba `momentos`, así que «los **momentos** clave son Pro2026» borraba el nombre del producto mientras «el **momento** clave…» no. Se deriva con el mismo `pluralForms`. `WEAK_IDIOM_VERBS` son formas verbales conjugadas (no hay número que derivar) y `DETERMINERS` ya lleva las cuatro formas |
| Contador aritmético que se desfasa tras una mutación posterior (familia F5) | Los cuatro del `CreditLedger`: `chargedTotal`, `refundedTotal`, `refundFailed`, `settleFailed` | Sólo `refundFailed` podía quedar por debajo del saldo vivo; cerrado. `settleFailed` no se suma a `unrefunded` **a propósito** (r4 N1, documentado en el getter) y sus filas llevan `stage:'settle'`, distinto de `stage:'close'`: la conciliación las distingue |
| Comentario que afirma lo que el código ya no hace (familia F4) | Todos los docblocks de los archivos tocados, más §17.2 y §18.2 de este documento | Corregidas las tres apariciones de la frase (docblock de `maskSensitiveForLlm`, docblock de `weakKeywordIsIdiom`, §17.2). El caso queda fijado por prueba (E2 de `f4Round7Builder.test.ts`, que lee el fuente y **falla si la frase vuelve**) |

### 19.3 Verificación de la ronda 7

```bash
npx jest src/lib/services/crm/__tests__/f4 src/__tests__/guardrails.test.ts
#  → 13 suites, 319/319 verdes (incluye guardrails 39/39 y las 4 suites del tester)
npx jest src/lib/services/crm/__tests__/ src/lib/services/crm/email/ src/__tests__/guardrails.test.ts
#  → pasada final: 52 suites (51 verdes, 1 saltada), 1029 tests, 1028 verdes, 0 rojos.
#    En una pasada anterior (13:33) salieron 7 rojos AJENOS y NO deterministas:
#    f6Adversarial L1-L8, sondas de privilegios contra la BD real que devolvieron
#    503 del RPC (agente de voz, en verificación por otro agente). Se repitieron
#    solas en verde. CERO rojos en F4 en las dos pasadas.
#    Suite de correo (F7): VERDE (13 suites, 225 tests, 1 saltada), no se movió.
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
#  → 221 errores; filtrado por los archivos de F4 → **0**, incluidas las suites nuevas.
#    (El tester midió 219 en la r6; los 2 de diferencia están en archivos de otros
#    agentes, ninguno de F4 y ninguna ruta de F4 en `.next/types/validator.ts`.)
```

### 19.4 Archivos tocados en la ronda 7

| Archivo | Qué |
|---|---|
| `src/lib/services/crm/__tests__/f4Round7Builder.test.ts` | **NUEVO**, escrito **antes** del código: E1/E1b/E1c plurales y su gemelo, E2/E2b el docblock (y que el comportamiento no cambia), E3 los paneles, E4 la simetría de `?sync=1`, E5/E5b/E5c el libro mayor |
| `src/lib/services/crm/callAnalysisRules.ts` | F3 (`pluralForms` + `CREDENTIAL_CONTEXT_NOUNS` derivada), el gemelo (`WEAK_ADJECTIVE_HEADS` derivada), F4 (los dos docblocks y L12) |
| `src/app/api/crm/calls/[id]/analyze/route.ts` | F2: `?sync=1` comprueba los dos kinds, con los dos códigos y `dedupe_checked` |
| `src/components/crm/calls/CallTranscriptPanel.tsx` | F1: lee `dedupe_checked` |
| `src/components/crm/calls/CallAnalysisPanel.tsx` | F1: lee `dedupe_checked` |
| `src/lib/services/crm/transcriptionService.ts` | F5: la diferencia al alza tras un cierre rechazado se declara |
| `src/lib/services/crm/__tests__/f4Round6Builder.test.ts` | D6 pasa a exigir 35 y dos filas (mismas cifras del caso, expectativa corregida por F5) |
| `src/lib/services/crm/__tests__/f4Round6Tester.test.ts` (suite del tester) | W1, W5 y W6 pasan a exigir el comportamiento correcto: **mismas frases, mismas aserciones, expectativa invertida**. W2, W3, W4 y W7 **intactas** |
| `docs/crm-revenue-os/FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | Nota de corrección en §17.2 (punto 2), L12 ampliado en §18.2 y este §19 |

### 19.5 Lo que sigue abierto (declarado, no olvidado)

- **`CallPanels.tsx` (F9)** anuncia «Análisis generado» ante un 202 encolado y no lee `deduped`
  ni `dedupe_checked`. Es la misma familia que F1, pero el archivo está en **propiedad
  exclusiva de F9** (`src/components/crm/timeline/**`): se declara aquí y se pide a F9, no se
  toca.
- **N5** (títulos de tests obsoletos) y **N6** (tope de cuerpo del despliegue, requiere
  `next.config.js`, archivo compartido): siguen abiertos, igual que en §18.6.
- **L1-L12** del enmascarado, incluidos L8 y L12: falsos positivos y negativos **declarados**;
  la lista sigue sin declararse exhaustiva. Sexta ronda con frases sintéticas: ⚠️ **NO
  VERIFICADO** con transcripciones reales.
- **Sembrado de `objections`**: sexta ronda pidiéndolo.
