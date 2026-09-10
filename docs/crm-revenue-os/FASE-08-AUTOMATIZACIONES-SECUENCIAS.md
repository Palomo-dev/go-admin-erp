# FASE 08 — Un solo motor de automatizaciones y secuencias multicanal por etapa (con scheduler real y builder visual)

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye la V3 completa)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Vercel iad1 (Next.js) + pg_cron/pg_net
> Depende de: F0 (`outbound_jobs` + `fn_claim_jobs`, outbox `crm_events` + `trg_opp_stage_change_enqueue`, pg_cron → `/api/crm/jobs/run` fail-closed, fixes `tasks`/`activities`/`customers.timezone`, `contact_consents` + `fn_can_contact`, eliminación de `automations` legacy + `followupEngineService` + `AutomationSettings` + `EmailNotifications`), F2 (etapas, gates `stageGateService`, `pipelineTemplates.ts`), F3 (llamadas: task de llamada con guion), F6 (agente IA: `agentDispatcher.dispatchAgent`, `ai_draft_email`), F7 (email: `sendEmail`, plantillas, eventos `email.*`), F16 (WhatsApp: envío vía `messages`, HSM, ventana 24h, `whatsapp.received`), F9 (timeline)
> Bloquea: F11 (onboarding/renovación usan reglas y secuencias seed), F10 (pago recibido dispara reglas)
> Esfuerzo: **L** · Valor: **alto** (convierte el pipeline en un sistema que actúa solo, con trazabilidad)

---

## 0. Objetivo y alcance

Al terminar, con una org de prueba se verifica que:

1. Existe **un solo** motor: `crm_events` (outbox) → runner de jobs → `automation_rules` (evento + condiciones DSL + acciones ordenadas con delay) → `outbound_jobs` → `automation_runs` con resultado por acción. Los cuatro sistemas paralelos (legacy `automations` + `followupEngineService`, `stage_automations` + `AutomationSettings`, `automationService` sin productor, `sequenceService` headless) quedan reducidos a uno; la fila de `automations` de la org 125 migra a `automation_rules`.
2. Mover una oportunidad a "Propuesta" ejecuta la regla seed "al entrar a Propuesta → email plantilla + tarea a 3 días + WhatsApp a 5 días si no abrió" **sin que el navegador haga nada** (pg_cron cada minuto), y `automation_runs` muestra cada acción con estado y error.
3. Las 14 acciones (`send_email, send_whatsapp, send_sms, create_task, create_activity, update_field (allow-list), enroll_sequence, unenroll_sequence, start_ai_agent, ai_draft_email, book_meeting_request, notify_user, webhook_out, move_stage`) ejecutan contra el schema real (C-3, C-4, C-H cerrados).
4. Secuencias con pasos `email|whatsapp|sms|call|ai_call|task|wait|condition` (con ramas `next_step_on_true/false`), `send_at_local_time`, `business_days_only`, zona horaria del cliente, exit conditions reales (`replied, meeting_booked, stage_changed, won_lost, opted_out`), pausa automática cuando el cliente responde y reanudación manual; ejecución idempotente con reintentos.
5. `/app/crm/automatizaciones` y `/app/crm/secuencias` permiten crear, probar en seco, activar/desactivar, inscribir desde `QuickActionsBar`/acciones masivas y ver historial/métricas por paso. `AutomationsView.tsx` ("próximamente") es reemplazado; `StageConfigDialog` tiene tab "Automatización".
6. Al crear un pipeline desde plantilla (`sales|onboarding|renewal`), se siembran reglas y secuencias por defecto (activables), sustituyendo las heurísticas por nombre de etapa de `OpportunityAutomations.tsx`.
7. Solo admins editan reglas/secuencias; webhooks salientes firmados; cada acción debita su canal; nada se ejecuta desde el browser.

**No incluye:** captura de leads desde Meta/Google/TikTok Lead Ads (se mueve a F1/F9 como `lead.captured`, aquí solo se consume el evento), editor de plantillas (F7/F16), agente IA en sí (F6), motor de créditos (D6/F0), campañas masivas de WhatsApp (F16).

---

## 1. Estado actual verificado

> **AVISO (2026-09-09, tras la ronda 3 de implementación):** la tabla de abajo es la
> foto **previa** a construir la fase (schema live 2026-09-08) y varias de sus filas ya
> **no describen el repo actual**. El estado real está en **§13 (ronda 1)**, **§14 (ronda 2)**
> —orden de ejecución de los pasos, barrido de respaldo enganchado, reanudación de
> inscripciones— y **§15 (ronda 3)**, que es la que hace que el paso de condición se pueda
> configurar y corte de verdad, y que el barrido no pueda quedarse muerto. Correcciones concretas a esta tabla, verificadas
> por el tester (TEST-F8-r1) y por el builder:
>
> - `followupEngineService.ts` y `/api/crm/followup/run` **ya no existen** (los borró F0):
>   todo el detalle de C-C/C-2/C-3/C-4 de la fila "Sistema 1" es historia.
> - `AutomationSettings.tsx` **ya no existe** en el repo (`stage_automations` sigue sin existir).
> - `OpportunityAutomations.tsx` no tenía ya ningún importador y **se eliminó en esta ronda**
>   (era código muerto de 360 L con el `tasks.related_id` roto).
> - `automationService.executeAction`: `update_field` **ya no es escritura arbitraria**
>   (allow-list + validación de tipo + filtro por organización). C-H está cerrado.
> - `/api/crm/sequences/run`: su `verifyCronSecret` **nunca llegaba a ejecutarse** porque
>   `src/middleware.ts` no lo eximía y devolvía 307 a `/auth/login` incluso con el secreto
>   correcto. **La ruta se eliminó** en esta ronda (el plan §4.1 ya lo mandaba).
> - Scheduler: hoy hay **10** jobs en `pg_cron`, tres de ellos del CRM (jobid 17/18/19,
>   creados por F0/JOBS) y **los tres con `active = false`**. Sigue siendo cierto que nada
>   del CRM se ejecuta solo hasta que el dueño los active (decisión de despliegue).
> - `crm_events` **sí** tiene `attempts` y `last_error` (DB-r2); sigue sin `occurred_at`
>   ni `actor_user_id`.

Fuentes: `audit-ai-automations.md` §5–6, schema live 2026-09-08.

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| Sistema 1: tabla `automations` (1 fila: org 125, `trigger_json.event_type='pipeline_change'`, `actions_json{create_tasks,log_activity,update_status,send_reminders,send_notifications}`) + `src/lib/services/crm/followupEngineService.ts` + `src/app/api/crm/followup/run/route.ts` | 🔴 legacy | `followup/run` fail-**open** (:18-27 `if (expectedToken)`, C-C); inserts en `activities` con `title/description` inexistentes (:420-421,:491-492, C-2), `activity_type` inválidos `follow_up`/`reminder`/`automation_log` (:419,:209,:490, C-4); `tasks.related_id` (:437-438, C-3); guard de idempotencia `.ilike('description', …)` (:468) siempre falso → re-dispara |
| `src/components/crm/pipeline/AutomationsView.tsx` (395 L, montado en `PipelineView.tsx:180`) | 🔴 | Lee `automations`; "La configuración avanzada por etapa estará disponible próximamente" (:386) |
| Sistema 2: `src/components/crm/pipeline/AutomationSettings.tsx` (405 L) | 🔴 C-7 | Nunca montado; lee/escribe tabla `stage_automations` (:86,:155,:165) que **no existe** |
| Sistema 3: `automation_rules` (0 filas; CHECK `trigger_type ∈ stage_change|field_change|schedule|event|manual`; `priority`) + `automation_runs` (0; `automation_rule_id`, `trigger_type`, `trigger_payload`, `status ∈ pending|running|completed|failed`, `result`) + `src/lib/services/crm/automationService.ts` | 🟡 | CRUD ok (`/api/crm/automation-rules`, `[id]`, `[id]/trigger` manual). `evaluateTrigger` (:223) **sin ningún caller** (sin productor de eventos); `evaluateConditions` (:307-320) solo AND plano sobre `payload[cond.field]` con `Number()` forzado (:331-332) |
| `automationService.executeAction` (:458-577) | 🔴 | `send_email` ✅; `create_activity` ✅; `enroll_sequence` ✅; `create_task` ❌ `related_id/related_type` + `status:'pending'` (:499-500,:503, C-3); `update_field` ❌ `supabase.from(action.entity).update({[field_name]: field_value})` con entity/field del JSON del usuario (:534-547, **C-H**: escritura arbitraria); sin `send_whatsapp/send_sms/start_ai_call/notify_user/move_stage` |
| Sistema 4: `sequences` (CHECK `trigger_type ∈ manual|lead_capture|stage_change|custom`), `sequence_steps` (`channel ∈ email|whatsapp|sms|call|task|wait|condition`, `delay_days`, `template_id`, `action_config`), `sequence_enrollments` (`status ∈ active|paused|completed|exited`, `customer_id uuid`), `sequence_step_runs` (`status ∈ pending|running|completed|failed|skipped`) — 0 filas + `src/lib/services/crm/sequenceService.ts` | 🟡 | `processStepRun` (:558-645): `email` ✅ vía `sendEmail`; `whatsapp/sms` ❌ `pending_implementation` (:595-601); `task` ❌ `related_id` + `status 'pending'` (:616-617,:621, C-3); `wait` ✅; `condition` ❌ no evalúa nada (:637-641); `call` ❌ cae en `default unknown_channel` (:643); `ai_call` ❌ no está en el CHECK; usa `customers.full_name` nullable (C-15) |
| `sequenceService.checkExitConditions` (:689-760) | 🟡 | Solo `won/lost` y "todos los runs completados"; ignora `exit_conditions` jsonb, respuestas del cliente, reuniones, opt-out |
| `src/app/api/crm/sequences/run/route.ts` | 🟡 | `CRON_SECRET` fail-closed correcto (:14-21) pero **nadie lo llama** |
| Scheduler | 🔴 | `vercel.json`: 10 crons (exchange-rates, open-finance ×5, qr, web-orders ×2, notifications), **ninguno CRM**; pg_cron: 7 jobs, ninguno CRM. F0 instala `pg_cron → /api/crm/jobs/run` |
| Path vivo stage_change → acciones: `src/components/crm/pipeline/OpportunityAutomations.tsx` (344 L) `handleStageChangeAutomation` | 🔴 | Llamado desde `KanbanBoard.tsx:529,594,668` y `PipelineStages.tsx:744` (cliente); heurísticas por nombre de etapa `'ganado'|'perdido'|'negociación'` y `position === 1000/999` (:176-218); crea tareas desde el navegador |
| Trigger BD `fn_log_stage_change` (`trg_opp_stage_history` AFTER UPDATE ON opportunities) | ✅ | Escribe `opportunity_stage_history`; F0 añade `trg_opp_stage_change_enqueue` (AFTER UPDATE OF stage_id) → `crm_events` |
| `templates` (channel, kind, body_html, subject, variables, metadata) | ✅ | F7/F16 completan `blocks_json`/HSM; aquí solo se referencian por `template_id` |
| `notification_templates`, `fn_create_org_notification(p_organization_id, p_recipient_user_id, p_channel, p_type, p_title, p_content, p_metadata)` | ✅ | Base de `notify_user` |
| `pipelineTemplates.ts` (`sales` 9 etapas, `onboarding` 7, `renewal` 6; `createPipelineFromTemplate`) | ✅ | Punto de anclaje para seeds de reglas/secuencias por plantilla |
| `stageGateService.evaluateStageGate(sb, orgId, {opportunityId, targetStageId})` :655 | ✅ | Reutilizado por `move_stage` |
| `KanbanBoard.tsx` (931 L), `KanbanColumn`, `OpportunityCard` | 🔴 muertos | F2/F9 los eliminan; las llamadas a `handleStageChangeAutomation` desaparecen con ellos |
| UI de reglas/secuencias | ❌ | No existe |
| **Outbox + runner (F0 ronda 1, 2026-09-08)**: `crm_events` + `outbound_jobs` + `fn_emit_crm_event` (inserta y encola `crm_event`) + trigger `trg_opp_stage_change_enqueue` (payload `{from_stage_id,to_stage_id,status,pipeline_id,customer_id,changed_by}`) y `trg_opp_created_enqueue`; runner `src/lib/jobs/runner.ts` + `POST/GET /api/crm/jobs/run` (cron cada minuto) | ✅ listo | El motor de esta fase se conecta registrando listeners en `src/lib/jobs/dispatch/eventDispatcher.ts` (`onCrmEvent('opportunity.stage_changed', evaluateRules)`, `onCrmEvent('*', …)`) y handlers `automation`/`sequence_step` con `registerJobHandler` en `src/lib/jobs/handlers/index.ts`; productores usan `emitCrmEvent()` de `src/lib/jobs/enqueue.ts`. Nota: `crm_events` real NO tiene `occurred_at/attempts/last_error/actor_user_id` (usar `created_at` y `payload.changed_by`); el kind `time_events` de §4.4 aún no está en el CHECK (pedir a DB). El handler `crm_event` procesa **un evento por job** (`payload.event_id`), no el "singleton por tick" de §4.4 |

---

## 2. Arquitectura y flujo

### 2.1 Diagrama de secuencia (regla por etapa con delay + secuencia)

```
UI (PipelineStages drag)   Next.js API          BD (Postgres)                         pg_cron/pg_net       /api/crm/jobs/run (runner F0)                 Proveedor (F7/F16/F6)
──────────────────────     ───────────          ─────────────                         ────────────────     ─────────────────────────────                 ─────────────────────
│ PATCH opportunities.stage_id ─────────────────▶│ trg_opp_stage_history → opportunity_stage_history
│                                                │ trg_opp_stage_change_enqueue (F0) → INSERT crm_events(event_type='opportunity.stage_changed', entity_type='opportunity', entity_id, payload{from_stage_id,to_stage_id,pipeline_id,customer_id,amount,status})
│                                                │ (también: emitCrmEvent() desde servicios para call.completed, email.opened, whatsapp.inbound…)
│                                                │                                     │ cada minuto: fn_crm_cron_post([...,'crm_event',...]) → net.http_post(APP_URL/api/crm/jobs/run, Bearer CRON_SECRET)
│                                                │◀── job kind 'crm_event' (F0): SELECT crm_events WHERE status='pending' ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 200 ──│
│                                                │                                                        automationEngine.evaluateRules(event):
│                                                │◀── SELECT automation_rules WHERE org & event & (stage_id|pipeline_id) & is_active
│                                                │                                                        conditions DSL (TS) contra contexto cargado (opp, customer, stage, last_call, consent)
│                                                │                                                        run_once_per_opportunity / cooldown_hours → skip
│                                                │◀── INSERT automation_runs(status='running', actions_plan[])
│                                                │◀── fn_enqueue_job(org,'automation',{run_id,action_index,...}, run_at = now + action.delay, dedupe_key=rule:{id}:opp:{id}:event:{id}:action:{n})
│                                                │◀── stage_agents (F6) → fn_enqueue_job(org,'agent_orchestration',…)
│                                                │◀── UPDATE crm_events SET status='processed', processed_at=now()   (error → status='failed', attempts+1, last_error)
│                                                │                                                        siguiente tick: fn_claim_jobs(ARRAY['automation'], 25, worker) → executeAction(action, ctx)
│                                                │                                                          send_email → sendEmail (F7) ───────────────────────────────────▶ Resend
│                                                │                                                          send_whatsapp → INSERT messages (F16) ─────────────────────────▶ trg_channel_dispatch → Edge channel-dispatch → Meta
│                                                │                                                          create_task → INSERT tasks (related_to_id/type, status 'open')
│                                                │                                                          enroll_sequence → sequenceEngine.enroll → step_runs + jobs 'sequence_step'
│                                                │◀── UPDATE automation_runs.result[n] = {status, ids, error}; status completed|failed
│                                                │ webhook Resend email.opened (F7) → emitCrmEvent('email.opened') → regla "si no abrió en 5 días" se evalúa por cron no_response
│◀── realtime activities / automation_runs (UI historial, timeline F9)
```

### 2.2 Máquinas de estado

```
automation_runs.status:  pending ─▶ running ─▶ completed
                                        └─────▶ failed   (≥1 acción failed tras reintentos; result[] conserva el detalle por acción)
                                        └─────▶ skipped  (NUEVO: condiciones no cumplidas / cooldown / run_once)

sequence_enrollments.status: active ─(cliente responde: whatsapp.inbound | email.replied)─▶ paused ─(reanudar manual)─▶ active
                              │ ─(exit condition: meeting_booked | stage_changed | won_lost | opted_out)─▶ exited (exit_reason)
                              └ ─(último paso completado)─▶ completed

sequence_step_runs.status: pending ─(job claim)─▶ running ─▶ completed ─▶ programa el siguiente (next_step_on_true/false o step_number+1)
                                        └──▶ failed (reintentos agotados; la secuencia sigue con el siguiente paso si action_config.continue_on_error)
                                        └──▶ skipped (enrollment no activo, DNC, condición falsa sin rama)
```

### 2.3 Catálogo de eventos (`crm_events.event_type`; `entity_type/entity_id` apuntan a la fila origen)

| Evento | Productor | payload |
|---|---|---|
| `opportunity.created` | trigger `trg_opp_created_enqueue` (AFTER INSERT; NUEVO en esta fase, §3.1: F0 solo cubre UPDATE) | `{pipeline_id, stage_id, customer_id, source, record_type}` (entity = opportunity) |
| `opportunity.stage_changed` | trigger F0 `trg_opp_stage_change_enqueue` (AFTER UPDATE OF stage_id, status) | `{from_stage_id, to_stage_id, pipeline_id, customer_id, amount, status}` + `actor_user_id` |
| `opportunity.won` / `opportunity.lost` | mismo trigger F0 | `{stage_id, amount, loss_reason}` |
| `lead.captured` | `leadCaptureService` (F1/F9) vía `emitCrmEvent` | `{opportunity_id, customer_id, source}` |
| `call.completed` | `/api/voice/status` (F3) vía `emitCrmEvent` (requisito para F3/F6) | `{call_id, opportunity_id, customer_id, mode, outcome, duration_seconds}` |
| `call.analyzed` | `runPostAnalysisActions` (F4) vía `emitCrmEvent` (requisito para F4) | `{call_id, analysis_id, sentiment, suggested_stage_id, objections[]}` |
| `email.opened` / `email.clicked` / `email.replied` / `email.bounced` | webhook Resend + `ingestReceivedEmail` (F7) vía `emitCrmEvent` (requisito para F7; `email.received` con `thread_id` → `email.replied`) | `{email_message_id, opportunity_id?, customer_id, link?}` |
| `whatsapp.inbound` (nombre de F0) | webhook inbound Meta/Twilio/Evolution (F16) vía `emitCrmEvent` (requisito para F16) | `{message_id, conversation_id, customer_id, opportunity_id?}` |
| `task.overdue` | cron `no_response` (esta fase, cada hora) | `{task_id, opportunity_id, assigned_to}` |
| `sla.breached` | cron (esta fase, cada hora): `stages.sla_days` vs `opportunity_stage_history.entered_at` | `{opportunity_id, stage_id, days_in_stage}` |
| `meeting.booked` | `book_meeting` tool (F6) / `calendar_events` | `{calendar_event_id, opportunity_id, customer_id, start_at}` |
| `payment.received` | webhooks Stripe/Wompi (F10) | `{invoice_id, opportunity_id, amount}` |
| `no_response.N_days` | cron (esta fase, cada hora): sin inbound (`messages`, `email_events.replied`, `calls inbound`) desde `last_contact_at` | `{opportunity_id, days, last_channel}` (N ∈ configurable por regla; emite `no_response.3_days`, `no_response.7_days`…) |

### 2.4 DSL de condiciones (evaluada en TS, no en SQL)

```json
{ "op": "and", "rules": [
  { "field": "opportunity.amount", "operator": "gte", "value": 5000000 },
  { "op": "or", "rules": [
    { "field": "opportunity.icp_band", "operator": "in", "value": ["A","B"] },
    { "field": "last_call.sentiment", "operator": "eq", "value": "positive" } ] },
  { "field": "consent.whatsapp", "operator": "eq", "value": "opted_in" },
  { "field": "stage.name", "operator": "not_contains", "value": "Perdido" } ] }
```

Operadores: `eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, is_null, is_not_null, before, after, within_days`. Campos permitidos (allow-list `CONDITION_FIELDS`): `opportunity.{amount, currency, status, temperature, icp_band, icp_fit_score, score_total, record_type, source, expected_close_date, last_contact_at, contact_channel, contact_result, deal_type, days_in_stage}`, `customer.{customer_type, lifecycle_stage, health_score, tags, company_size, timezone, has_email, has_phone}`, `stage.{id, name, position, probability, is_won, is_lost, sla_days}`, `pipeline.{id, pipeline_type}`, `last_call.{sentiment, quality_score, outcome, days_ago}`, `last_email.{status, opened, clicked, days_ago}`, `consent.{email, whatsapp, sms, voice}`, `event.{event_type, payload.*}` (solo lectura del payload del evento). Cualquier `field` fuera de la lista → regla inválida (400 en el editor, `skipped` en runtime).

---

## 3. Base de datos

### 3.1 Migraciones (MCP `apply_migration`)

`crm_events` y `outbound_jobs` usan la definición de F0: `crm_events(id, organization_id, event_type, entity_type, entity_id, payload, actor_user_id, status pending|processed|failed|skipped, attempts, last_error, occurred_at, processed_at)`; `outbound_jobs(kind CHECK …, payload, status, priority, run_at, attempts, max_attempts, dedupe_key, locked_at, locked_by)` con RPC `fn_enqueue_job(p_org, p_kind, p_payload, p_run_at, p_dedupe_key, …)`, `fn_claim_jobs(p_kinds text[], p_limit, p_worker)`, `fn_complete_job`, `fn_fail_job`; cron `crm-jobs-every-minute` → `fn_crm_cron_post(kinds[])`. Los kinds de esta fase son `crm_event` (drenado del outbox), `automation` (acción de regla) y `sequence_step` (ya en F0) más `time_events` (nuevo, horario). Aquí solo se añaden columnas, tablas y triggers propios.

#### `202609_crm_v4_f08_automation_rules_v2`

```sql
-- Productor de opportunity.created (F0 solo cubre UPDATE de stage_id/status)
CREATE OR REPLACE FUNCTION public.fn_opp_created_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO crm_events (organization_id, event_type, entity_type, entity_id, payload, actor_user_id)
  VALUES (NEW.organization_id, 'opportunity.created', 'opportunity', NEW.id,
          jsonb_build_object('pipeline_id', NEW.pipeline_id, 'stage_id', NEW.stage_id, 'customer_id', NEW.customer_id,
                             'source', NEW.source, 'record_type', NEW.record_type, 'amount', NEW.amount), auth.uid());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_opp_created_enqueue ON public.opportunities;
CREATE TRIGGER trg_opp_created_enqueue AFTER INSERT ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.fn_opp_created_enqueue();

-- Kind horario para eventos de tiempo (extiende el CHECK de F0; F6 añade los suyos con el mismo patrón)
ALTER TABLE public.outbound_jobs DROP CONSTRAINT IF EXISTS outbound_jobs_kind_check;
ALTER TABLE public.outbound_jobs ADD CONSTRAINT outbound_jobs_kind_check CHECK (kind IN (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze','recording_cleanup','campaign_batch',
  'crm_event','maintenance','noop','agent_orchestration','ai_whatsapp','ai_draft_email','time_events'));
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'crm-time-events-hourly';
SELECT cron.schedule('crm-time-events-hourly', '5 * * * *', $$SELECT fn_crm_cron_post(ARRAY['time_events'])$$);

ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS event text,                                  -- crm_events.type (p.ej. 'opportunity.stage_changed')
  ADD COLUMN IF NOT EXISTS run_once_per_opportunity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cooldown_hours integer NOT NULL DEFAULT 0 CHECK (cooldown_hours >= 0),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_key text,                           -- seed de plantilla de pipeline
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS runs_count integer NOT NULL DEFAULT 0;
-- trigger_type se mantiene (CHECK existente); 'event' es el genérico, 'stage_change' = event 'opportunity.stage_changed' + stage_id
-- conditions pasa a ser objeto DSL (antes array plano); se normaliza en la migración de datos:
UPDATE public.automation_rules SET conditions = jsonb_build_object('op','and','rules', conditions)
 WHERE jsonb_typeof(conditions) = 'array';
CREATE INDEX IF NOT EXISTS idx_ar_org_event_stage ON public.automation_rules (organization_id, event, stage_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_ar_pipeline ON public.automation_rules (pipeline_id) WHERE pipeline_id IS NOT NULL;

ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.crm_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actions_plan jsonb NOT NULL DEFAULT '[]'::jsonb,   -- acciones con run_at calculado
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_version integer;
ALTER TABLE public.automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('pending','running','completed','failed','skipped'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_aruns_rule_event ON public.automation_runs (automation_rule_id, event_id) WHERE event_id IS NOT NULL AND dry_run = false;
CREATE INDEX IF NOT EXISTS idx_aruns_opp ON public.automation_runs (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aruns_org_created ON public.automation_runs (organization_id, created_at DESC);
```

#### `202609_crm_v4_f08_sequences_v2`

```sql
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_window jsonb NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb,
  ADD COLUMN IF NOT EXISTS pause_on_reply boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE public.sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN ('manual','lead_capture','stage_change','event','custom'));
-- exit_conditions: ['replied','meeting_booked','stage_changed','won_lost','opted_out'] (+ {type:'stage_is', stage_id})
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_exit_conditions_check;
ALTER TABLE public.sequences ADD CONSTRAINT sequences_exit_conditions_check CHECK (jsonb_typeof(exit_conditions) = 'array');

ALTER TABLE public.sequence_steps
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS delay_hours integer NOT NULL DEFAULT 0 CHECK (delay_hours BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS send_at_local_time time,                    -- p.ej. 09:30 en tz del cliente
  ADD COLUMN IF NOT EXISTS business_days_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_step_on_true uuid,                     -- solo channel='condition'
  ADD COLUMN IF NOT EXISTS next_step_on_false uuid,
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid REFERENCES public.voice_agents(id) ON DELETE SET NULL,   -- ai_call
  ADD COLUMN IF NOT EXISTS condition jsonb,                            -- DSL §2.4 (solo condition)
  ADD COLUMN IF NOT EXISTS continue_on_error boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sequence_steps DROP CONSTRAINT IF EXISTS sequence_steps_channel_check;
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_channel_check
  CHECK (channel IN ('email','whatsapp','sms','call','ai_call','task','wait','condition'));
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_branch_fk_true
  FOREIGN KEY (next_step_on_true) REFERENCES public.sequence_steps(id) ON DELETE SET NULL;
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_branch_fk_false
  FOREIGN KEY (next_step_on_false) REFERENCES public.sequence_steps(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seq_steps_order ON public.sequence_steps (sequence_id, step_number);

ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS current_step_id uuid REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrolled_by uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',       -- manual|rule|stage|bulk|lead_capture
  ADD COLUMN IF NOT EXISTS timezone text,                                -- snapshot de customers.timezone
  ADD COLUMN IF NOT EXISTS steps_done integer NOT NULL DEFAULT 0;
-- una inscripción activa/pausada por oportunidad y secuencia
CREATE UNIQUE INDEX IF NOT EXISTS idx_enroll_active_unique ON public.sequence_enrollments (sequence_id, opportunity_id)
  WHERE status IN ('active','paused') AND opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enroll_next_run ON public.sequence_enrollments (organization_id, next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enroll_customer ON public.sequence_enrollments (customer_id, status);

ALTER TABLE public.sequence_step_runs
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voice_agent_call_id uuid REFERENCES public.voice_agent_calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_taken boolean;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssr_enrollment_step ON public.sequence_step_runs (enrollment_id, step_id, attempts);
CREATE INDEX IF NOT EXISTS idx_ssr_pending ON public.sequence_step_runs (organization_id, status, scheduled_at) WHERE status IN ('pending','running');
```

#### `202609_crm_v4_f08_rls_y_funciones`

```sql
-- RLS: sequence_steps, sequence_enrollments, sequence_step_runs, automation_runs ya tienen políticas org_member (verificar en pg_policies);
-- se añade la política faltante de DELETE en sequence_step_runs y automation_runs (solo admins via API; RLS org_member)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sequence_step_runs','automation_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))', t||'_delete', t);
  END LOOP;
END $$;

-- Cron auxiliar: emite eventos de tiempo (sla.breached, task.overdue, no_response.N_days) — se llama desde el runner cada hora
CREATE OR REPLACE FUNCTION public.fn_emit_time_events(p_org_id integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0;
BEGIN
  -- sla.breached: una vez por opp+stage
  INSERT INTO crm_events (organization_id, event_type, entity_type, entity_id, payload)
  SELECT o.organization_id, 'sla.breached', 'opportunity', o.id,
         jsonb_build_object('opportunity_id', o.id, 'stage_id', o.stage_id, 'days_in_stage', extract(day from now() - h.entered_at))
  FROM opportunities o
  JOIN stages s ON s.id = o.stage_id AND s.sla_days IS NOT NULL
  JOIN LATERAL (SELECT max(created_at) AS entered_at FROM opportunity_stage_history WHERE opportunity_id = o.id AND to_stage_id = o.stage_id) h ON true
  WHERE o.organization_id = p_org_id AND o.status = 'open' AND h.entered_at < now() - make_interval(days => s.sla_days)
    AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.event_type = 'sla.breached' AND e.entity_id = o.id AND (e.payload->>'stage_id')::uuid = o.stage_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  -- no_response.N_days para N in (3,7,14,30): una vez por opp+N desde last_contact_at
  INSERT INTO crm_events (organization_id, event_type, entity_type, entity_id, payload)
  SELECT o.organization_id, 'no_response.'||d||'_days', 'opportunity', o.id,
         jsonb_build_object('opportunity_id', o.id, 'days', d, 'last_channel', o.contact_channel)
  FROM opportunities o CROSS JOIN unnest(ARRAY[3,7,14,30]) d
  WHERE o.organization_id = p_org_id AND o.status = 'open' AND o.last_contact_at IS NOT NULL
    AND o.last_contact_at < now() - make_interval(days => d)
    AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.entity_id = o.id AND e.event_type = 'no_response.'||d||'_days' AND e.occurred_at > o.last_contact_at);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_emit_time_events(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_emit_time_events(integer) TO service_role;

-- Pausa automática de secuencias al recibir respuesta (idempotente; la llama el runner al procesar whatsapp.inbound / email.replied)
CREATE OR REPLACE FUNCTION public.fn_pause_sequences_on_reply(p_org_id integer, p_opportunity_id uuid, p_customer_id uuid, p_channel text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE sequence_enrollments e SET status = 'paused', paused_reason = 'customer_replied_'||p_channel, paused_at = now()
  FROM sequences s
  WHERE e.sequence_id = s.id AND e.organization_id = p_org_id AND e.status = 'active' AND s.pause_on_reply
    AND (e.opportunity_id = p_opportunity_id OR (p_opportunity_id IS NULL AND e.customer_id = p_customer_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_pause_sequences_on_reply(integer, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_pause_sequences_on_reply(integer, uuid, uuid, text) TO service_role, authenticated;
```

> **Corregido tras el tester de F9 (ronda 5), 2026-09-09.** Este bloque prescribia el
> permiso **solo** para el rol de servicio, y no es lo que necesitan los llamadores
> reales: la ruta de inscripcion pasa el cliente de **sesion**. Lo que hay desplegado
> concede el permiso a sesion y **revoca PUBLIC y anonimo**, que es lo correcto.
>
> Y la razon por la que la revocacion no es opcional: la guarda que usan estas
> funciones tiene la forma «si hay sesion y no pertenece, error». Para un anonimo el
> identificador de usuario es **nulo**, de modo que la guarda **se salta entera**.
> En este esquema, la comprobacion de pertenencia y la revocacion de anonimo son
> **una sola medida**: aplicar una sin la otra deja la puerta abierta.

Se decide **no** implementar `fn_evaluate_conditions` en SQL: la DSL en TS (`conditionsDsl.ts`) es testeable con jest, comparte tipos con el editor y evita duplicar allow-lists.

#### `202609_crm_v4_f08_migrar_legacy` (coordinada con F0, que hace el `DROP`)

```sql
-- 1 fila: org 125, pipeline 21039f16-…; actions_json = flags booleanos → reglas equivalentes explícitas
INSERT INTO public.automation_rules (organization_id, name, description, trigger_type, event, pipeline_id, trigger_config, conditions, actions, is_active, priority, template_key)
SELECT a.organization_id,
       'Migrada: '||a.name, 'Migrada automáticamente desde la tabla legacy automations el 2026-09-08',
       'stage_change', 'opportunity.stage_changed', (a.trigger_json->>'pipeline_id')::uuid,
       jsonb_build_object('pipeline_id', a.trigger_json->>'pipeline_id'),
       '{"op":"and","rules":[]}'::jsonb,
       jsonb_build_array(
         jsonb_build_object('type','create_task','title','Seguimiento: {{stage.name}}','due_in_days',2,'priority','med','assign_to','owner'),
         jsonb_build_object('type','create_activity','activity_type','system','notes','Oportunidad movida a {{stage.name}} (regla migrada)'),
         jsonb_build_object('type','notify_user','to','owner','title','Oportunidad en {{stage.name}}','content','{{opportunity.name}} cambió de etapa')
       ),
       COALESCE(a.active, false), 100, 'legacy_migrated'
FROM public.automations a
WHERE NOT EXISTS (SELECT 1 FROM public.automation_rules r WHERE r.organization_id = a.organization_id AND r.template_key = 'legacy_migrated');
-- F0 ejecuta después: DROP TABLE public.automations; y elimina followupEngineService.ts, followup/run, AutomationSettings.tsx, EmailNotifications.ts/.tsx
```

### 3.2 Seeds por plantilla de pipeline (`src/lib/services/crm/automationSeeds.ts`, NUEVO; invocado por `createPipelineFromTemplate` tras insertar etapas, con `is_active=false` salvo indicación)

| Plantilla | Regla / secuencia (template_key) | Definición |
|---|---|---|
| `sales` | `sales.lead_new.welcome` (activa) | `opportunity.created` en pipeline → `send_whatsapp` HSM `lead_welcome` (si consent) o `send_email` "Bienvenida" + `create_task` "Primer contacto" `due_in_hours:4` `assign_to:owner` |
| `sales` | `sales.proposal.followup` (activa) | `opportunity.stage_changed` a "Propuesta" → `send_email` plantilla `proposal_sent` (delay 0) → `create_task` "Llamar para resolver dudas" (delay `3d`) → `send_whatsapp` plantilla `proposal_reminder` (delay `5d`, condición `last_email.opened = false`) |
| `sales` | `sales.demo.confirm_agent` | `opportunity.stage_changed` a "Demo" → `start_ai_agent` (agente `confirm_demo` si existe; si no, `create_task`) |
| `sales` | `sales.won.onboarding` (activa) | `opportunity.won` → `create_activity` system + `notify_user` owner; el onboarding lo crea `onboardingService` existente (`WonCloseModal`) — la regla solo notifica y `enroll_sequence` "Bienvenida cliente" |
| `sales` | `sales.lost.recontact` (activa) | `opportunity.lost` → `create_task` "Registrar razón estructurada" si `opportunity.loss_reason_value is_null` + `enroll_sequence` `seq.recontact_90d` |
| `sales` | `sales.no_response_7d` | `no_response.7_days` + condición `stage.is_won=false, stage.is_lost=false` → `enroll_sequence` `seq.reactivation` |
| `sales` | `sales.sla_breached` (activa) | `sla.breached` → `notify_user` owner + manager + `create_task` "Revisar oportunidad estancada" |
| `sales` | secuencia `seq.sdr_followup` | manual/`lead_capture`: día 0 WhatsApp HSM → día 1 `call` (task con guion) → día 3 email → día 5 `condition(last_email.opened)` true→ `call`, false→ WhatsApp → día 10 `ai_call` (agente `reactivate_cold`) → día 14 email caso de éxito → día 30 `task` "Cerrar como sin respuesta". Exit: `replied, meeting_booked, stage_changed, won_lost, opted_out` |
| `sales` | secuencia `seq.recontact_90d` | `wait 90d` → email "¿Cambió algo?" → día 93 WhatsApp → día 97 `ai_call` reactivación |
| `sales` | secuencia `seq.reactivation` | día 0 email → día 2 WhatsApp → día 4 `ai_call` |
| `onboarding` | `onb.kickoff.tasks` (activa), `onb.stalled` | al entrar a cada etapa → `create_task` con checklist (`action_config.checklist[]`); `sla.breached` → notificar CSM |
| `renewal` | `ren.pending.reminder` (activa) | `opportunity.created` en pipeline renewal → `enroll_sequence` `seq.renewal_60d`: día 0 email recordatorio → día 15 WhatsApp → día 30 `ai_call` (`renewal_reminder`) → día 45 `task` llamada CSM |

Las plantillas de email/HSM referenciadas (`proposal_sent`, `proposal_reminder`, `lead_welcome`…) se siembran en F7/F16 con las mismas claves (`templates.metadata.template_key`); si no existen al ejecutar, la acción falla con `template_missing` y la UI lo muestra como "Crear plantilla".

### 3.3 Verificación post-migración

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='automation_rules' AND column_name IN ('pipeline_id','stage_id','event','run_once_per_opportunity','cooldown_hours','version'); -- 6
SELECT column_name FROM information_schema.columns WHERE table_name='sequence_steps' AND column_name IN ('send_at_local_time','business_days_only','next_step_on_true','next_step_on_false','ai_agent_id'); -- 5
SELECT column_name FROM information_schema.columns WHERE table_name='sequence_enrollments' AND column_name IN ('current_step_id','next_run_at','paused_reason'); -- 3
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='sequence_steps_channel_check'; -- incluye 'ai_call'
SELECT count(*) FROM automation_rules WHERE template_key='legacy_migrated';                          -- 1 (org 125)
SELECT proname FROM pg_proc WHERE proname IN ('fn_emit_time_events','fn_pause_sequences_on_reply','fn_opp_created_enqueue'); -- 3
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_opp_created_enqueue';                                 -- 1
SELECT jobname FROM cron.job WHERE jobname = 'crm-time-events-hourly';                                  -- 1
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='outbound_jobs_kind_check';           -- incluye 'time_events'
SELECT count(*) FROM pg_policies WHERE tablename IN ('sequence_step_runs','automation_runs') AND cmd='DELETE'; -- 2
-- Tras F0: SELECT to_regclass('public.automations'); → NULL; SELECT to_regclass('public.stage_automations'); → NULL
```

### 3.4 Impacto en tablas existentes

- `automations`: migrada y **eliminada** (F0). `stage_automations`: nunca existió; `AutomationSettings.tsx` se borra.
- `automation_rules.trigger_config`: sigue existiendo para compatibilidad (`{pipeline_id, stage_id, field}`), pero el runtime usa las columnas `event/pipeline_id/stage_id`.
- `sequence_steps.delay_days` + `delay_hours` + `send_at_local_time`: el cálculo de `scheduled_at` cambia (§4.5).
- `opportunities.last_contact_at / contact_channel`: pasan a actualizarse por trigger F0 en `activities` (cualquier canal) para que `no_response.N_days` sea fiable.
- `tasks`: inserts con `related_to_id/related_to_type/status='open'/type` (fix C-3).
- `activities`: `activity_type='system'` para logs de automatización (fix C-4), `metadata{automation_run_id, rule_id}`.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| GET | `/api/crm/automation-rules` | sesión | `?pipelineId&stageId&event&is_active` | `{data: Rule[] (+runs_7d, last_run_at)}` | 401 | — |
| POST | `/api/crm/automation-rules` | sesión admin | `RuleInput` (zod `ruleSchema`: `event ∈ EVENT_TYPES`, `conditions` DSL válida con `CONDITION_FIELDS`, `actions[]` cada una con su zod, `delay {value, unit:'minutes'|'hours'|'days'}`) | 201 | 400 detalle por acción, 403 | `UNIQUE(org,name)` |
| GET/PATCH/DELETE | `/api/crm/automation-rules/[id]` | sesión admin | PATCH incrementa `version` | `{data}` | 404 | — |
| POST | `/api/crm/automation-rules/[id]/test-run` | sesión admin | `{opportunityId, event?: {type, payload}}` | `{matched: bool, conditions_trace[], actions_plan[] (con run_at y preview de email/WA renderizado), warnings[]}`; escribe `automation_runs(dry_run=true)` | 404 | — |
| GET | `/api/crm/automation-rules/[id]/runs` | sesión | `?status&from&to&cursor` | `{data: Run[] (result por acción)}` | — | — |
| POST | `/api/crm/automation-rules/[id]/trigger` (existe) | sesión admin | `{opportunityId}` | encola evento `manual` para esa opp (ya no ejecuta inline) | — | `dedupe_key` |
| GET/POST | `/api/crm/sequences` (existe) | sesión / admin | `?pipelineId` / `SequenceInput` + `steps[]` | `{data}` | 400 grafo inválido (ramas a pasos inexistentes / ciclos) | `UNIQUE(org,name)` |
| GET/PATCH/DELETE | `/api/crm/sequences/[id]` (existe) | sesión admin | incluye `steps[]` reemplazo atómico (RPC `fn_replace_sequence_steps`, NUEVA, transaccional) | `{data}` | 409 si hay inscritos activos y se borran pasos con runs pendientes | — |
| POST | `/api/crm/sequences/[id]/enroll` (existe) | sesión | `{opportunityIds?: uuid[], customerIds?: uuid[], startAt?: ISO}` | `{enrolled: n, skipped: [{id, reason: 'already_active'|'dnc'|'no_channel'}]}` | 400 | índice único activo |
| POST | `/api/crm/sequences/[id]/unenroll` | sesión | `{enrollmentIds[]|opportunityIds[], reason}` | `{exited: n}` | — | — |
| POST | `/api/crm/sequences/enrollments/[id]/pause` / `resume` | sesión | `{}` | `{data}` | 409 estado | — |
| GET | `/api/crm/sequences/[id]/enrollments` | sesión | `?status&cursor` | `{data: Enrollment[] (+customer, opportunity, current_step, next_run_at)}` | — | — |
| GET | `/api/crm/sequences/[id]/stats` | sesión | `?from&to` | `{per_step: [{step_id, sent, delivered, opened, clicked, replied, failed}], enrollments: {active, paused, completed, exited_by_reason}}` | — | — |
| POST | `/api/crm/sequences/run` (existe) | cron | **se elimina**: el runner de F0 procesa `sequence_step` | — | — | — |
| POST | `/api/crm/jobs/run` (F0) | `Bearer CRON_SECRET` fail-closed | `{kinds?: string[]}` | `{claimed, done, failed}` | 401 | `fn_claim_jobs(p_kinds, 25, worker)` |
| DELETE | `/api/crm/followup/run` | — | **eliminado** (C-C) | — | — | — |

### 4.2 Servicios (firmas TS)

| Archivo | Exporta | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/events/emitCrmEvent.ts` (NUEVO) | `emitCrmEvent(sb, orgId, type: CrmEventType, payload, aggregate?: {type, id}): Promise<string>`; `CRM_EVENT_TYPES` | Inserta en `crm_events`; usado por F3/F4/F6/F7/F10/F16 |
| `src/lib/services/crm/automation/automationEngine.ts` (NUEVO; sustituye `automationService.ts` :223-577) | `evaluateRules(sb, event: CrmEvent): Promise<{runs: AutomationRun[]}>`; `loadRuleContext(sb, orgId, opportunityId, event): Promise<RuleContext>`; `planActions(rule, ctx): PlannedAction[]`; `executeAction(sb, action: RuleAction, ctx: RuleContext, run: AutomationRun): Promise<ActionResult>` | Núcleo; sin I/O a proveedores directo: cada acción encola su `outbound_jobs` del canal salvo las que son solo BD (`create_task`, `create_activity`, `update_field`, `enroll/unenroll`, `move_stage`, `notify_user`) |
| `src/lib/services/crm/automation/conditionsDsl.ts` (NUEVO) | `type ConditionNode = Group | Rule`; `evaluate(node, ctx): {result: boolean, trace: Trace[]}`; `validate(node): ZodResult`; `CONDITION_FIELDS`, `OPERATORS`; `getField(ctx, path)` | DSL §2.4, tipado y con trace para el dry run |
| `src/lib/services/crm/automation/actions/{sendEmail,sendWhatsapp,sendSms,createTask,createActivity,updateField,enrollSequence,unenrollSequence,startAiAgent,aiDraftEmail,bookMeetingRequest,notifyUser,webhookOut,moveStage}.ts` | `schema` (zod) + `run(sb, action, ctx, run): Promise<ActionResult>` | Una acción por archivo (≤120 L); `ACTION_REGISTRY` en `actions/index.ts` |
| `src/lib/services/crm/automation/templateVars.ts` (NUEVO; F7 exporta el renderer real) | `renderVars(text, ctx, {escape: 'text'|'html'})` | `{{contact.first_name|cliente}}`, `{{opportunity.name}}`, `{{stage.name}}`, `{{user.first_name}}`, `{{org.name}}`, `{{quote.total}}` |
| `src/lib/services/crm/sequence/sequenceEngine.ts` (NUEVO; sustituye `sequenceService.ts` :462-800) | `enroll(sb, orgId, {sequenceId, opportunityId?, customerId?, source, startAt?, by?}): Promise<EnrollResult>`; `scheduleNextStep(sb, enrollment, fromStep?: Step, branch?: boolean): Promise<StepRun|null>`; `runStep(sb, job): Promise<StepRunResult>`; `evaluateExit(sb, enrollment, event?): Promise<{exit: boolean, reason?}>`; `pause/resume/unenroll` | Máquina §2.2 |
| `src/lib/services/crm/sequence/scheduling.ts` (NUEVO) | `computeNextRunAt({from: Date, delayDays, delayHours, sendAtLocalTime?, businessDaysOnly, tz, sendWindow}): Date` | Cálculo determinista (§4.5) |
| `src/lib/services/crm/sequence/sequenceService.ts` (reescribir, solo CRUD + validación de grafo) | `getSequences`, `getSequence`, `createSequence`, `updateSequence`, `deleteSequence`, `validateStepGraph(steps): Issue[]`, `getStats` | CRUD |
| `src/lib/services/crm/automation/automationService.ts` (reescribir, solo CRUD) | `getRules`, `getRule`, `createRule`, `updateRule`, `deleteRule`, `ruleSchema`, `testRun(sb, orgId, ruleId, opportunityId, event?)` | CRUD + dry run |
| `src/lib/services/crm/automationSeeds.ts` (NUEVO) | `seedAutomationsForPipeline(sb, orgId, pipelineId, templateKey)`; `AUTOMATION_SEEDS` | §3.2; llamado desde `createPipelineFromTemplate` |
| `src/lib/services/crm/jobs/handlers/{crmEvent,automation,sequenceStep,timeEvents}.ts` (nombres = kinds `crm_event`, `automation`, `sequence_step`, `time_events`) | `handle(sb, job)` | `crmEvent`: drena `crm_events` `status='pending'` (SELECT … FOR UPDATE SKIP LOCKED, lotes de 200, marca `processed|failed`) → `evaluateRules` + `stage_agents` (F6) + `evaluateExit` de inscripciones afectadas + `fn_pause_sequences_on_reply`; `timeEvents`: cada hora `fn_emit_time_events` por org con CRM activo |

### 4.3 Webhooks / proveedor

Esta fase no expone webhooks propios de entrada: consume eventos que F7 (Resend `email.opened/clicked/bounced/received→replied`), F16 (Meta `messages` → `whatsapp.inbound`), F3 (Twilio status → `call.completed`), F4 (`call.analyzed`), F6 (`meeting.booked`), F10 (Stripe/Wompi → `payment.received`) traducen a `emitCrmEvent(sb, orgId, event_type, payload, {type, id})`. Esas fases deben añadir la llamada en el punto indicado en §2.3 (una línea cada una; sin ella el evento simplemente no existe y ninguna regla se dispara). Salida: `webhook_out` (§4.5) hacia URLs de la org.

### 4.4 Jobs de la cola (`outbound_jobs`)

| `kind` | payload | Handler | Reintentos / política |
|---|---|---|---|
| `crm_event` (kind de F0; un job singleton por tick con `dedupe_key='crm_event:tick'` reencolado al terminar) | `{}` | `crmEvent.handle` | Drena `crm_events` pendientes en lotes de 200; evento con error → `status='failed'`, `attempts+1`, `last_error`; se reintenta hasta 3 veces (vuelve a `pending` con `occurred_at` original), luego `skipped` |
| `automation` (kind de F0) | `{run_id, rule_id, action_index, opportunity_id, customer_id, event_id}` | `automation.handle` → `executeAction` | `max_attempts=3` (`fn_fail_job` con backoff de F0); `dedupe_key = rule:{rule_id}:opp:{opp_id}:event:{event_id}:action:{n}`; al agotar → `automation_runs.result[n].status='failed'`, run `failed` |
| `sequence_step` (kind de F0) | `{step_run_id}` | `sequenceStep.handle` → `runStep` | `max_attempts=3`; `dedupe_key = seqrun:{step_run_id}`; re-verifica `enrollment.status='active'` y `evaluateExit` antes de ejecutar; DNC (`fn_can_contact`) → `skipped` y sigue |
| `time_events` (NUEVO kind, cron horario `crm-time-events-hourly`) | `{}` | `timeEvents.handle` | por org con CRM activo; `fn_emit_time_events` es idempotente |
| `email` / `whatsapp` / `sms` / `ai_call` / `agent_orchestration` | (definidos en F7/F16/F3/F6) | — | Las acciones de esta fase solo los encolan con `metadata{automation_run_id|sequence_step_run_id}` para que los callbacks (`email.opened`…) enlacen métricas por paso |

### 4.5 Snippets

**DSL: evaluación con trace**

```ts
export function evaluate(node: ConditionNode, ctx: RuleContext): { result: boolean; trace: Trace[] } {
  const trace: Trace[] = [];
  const ev = (n: ConditionNode): boolean => {
    if ('op' in n) {
      const rs = n.rules.map(ev);
      return n.op === 'and' ? rs.every(Boolean) : rs.some(Boolean);
    }
    if (!CONDITION_FIELDS.has(n.field)) { trace.push({ field: n.field, ok: false, reason: 'field_not_allowed' }); return false; }
    const actual = getField(ctx, n.field);                       // p.ej. ctx.opportunity.amount
    const ok = OPERATORS[n.operator](actual, n.value, ctx.now);   // within_days usa ctx.now
    trace.push({ field: n.field, operator: n.operator, expected: n.value, actual, ok });
    return ok;
  };
  return { result: ev(node), trace };
}
// OPERATORS.within_days = (a, v, now) => a != null && differenceInDays(now, new Date(a)) <= Number(v)
// OPERATORS.gte = (a, v) => typeof a === 'number' && typeof v === 'number' && a >= v   (sin Number() forzado: fix :331-332)
```

**Evaluación de reglas (idempotente por evento)**

```ts
export async function evaluateRules(sb: SupabaseClient, event: CrmEvent) {
  const oppId = event.entity_type === 'opportunity' ? event.entity_id : (event.payload.opportunity_id as string | undefined);
  const { data: rules } = await sb.from('automation_rules').select('*').eq('organization_id', event.organization_id)
    .eq('is_active', true).eq('event', event.event_type).order('priority');
  const ctx = oppId ? await loadRuleContext(sb, event.organization_id, oppId, event) : null;
  for (const rule of rules ?? []) {
    if (rule.pipeline_id && rule.pipeline_id !== ctx?.pipeline.id) continue;
    if (rule.stage_id && rule.stage_id !== (event.payload.to_stage_id ?? ctx?.stage.id)) continue;
    if (rule.run_once_per_opportunity && await alreadyRan(sb, rule.id, oppId)) { await logSkip(sb, rule, event, 'run_once'); continue; }
    if (rule.cooldown_hours > 0 && await ranWithin(sb, rule.id, oppId, rule.cooldown_hours)) { await logSkip(sb, rule, event, 'cooldown'); continue; }
    const { result, trace } = evaluate(rule.conditions, ctx ?? emptyCtx(event));
    if (!result) { await logSkip(sb, rule, event, 'conditions', trace); continue; }
    const plan = planActions(rule, ctx);                                                   // run_at por delay
    const { data: run, error } = await sb.from('automation_runs').insert({ organization_id: event.organization_id, automation_rule_id: rule.id,
      trigger_type: rule.trigger_type, trigger_payload: event.payload, event_id: event.id, opportunity_id: oppId,
      status: 'running', started_at: new Date().toISOString(), actions_plan: plan, rule_version: rule.version }).select().single();
    if (error?.code === '23505') continue;                                                   // ya procesado (idx_aruns_rule_event)
    for (const [n, a] of plan.entries()) {
      await sb.rpc('fn_enqueue_job', { p_org: event.organization_id, p_kind: 'automation', p_run_at: a.run_at,
        p_payload: { run_id: run.id, rule_id: rule.id, action_index: n, opportunity_id: oppId, customer_id: ctx?.customer.id, event_id: event.id },
        p_dedupe_key: `rule:${rule.id}:opp:${oppId}:event:${event.id}:action:${n}` });                 // RPC de F0 (idempotente por dedupe_key)
    }
  }
}
```

**`update_field` con allow-list (fix C-H)**

```ts
export const UPDATE_FIELD_ALLOWLIST = {
  opportunities: ['temperature', 'next_contact_at', 'recontact_at', 'contact_result', 'next_action', 'expected_close_date', 'deal_type', 'source'],
  customers: ['lifecycle_stage', 'tags'],
} as const;
export const schema = z.object({ type: z.literal('update_field'), entity: z.enum(['opportunities', 'customers']),
  field: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]) })
  .refine(a => (UPDATE_FIELD_ALLOWLIST[a.entity] as readonly string[]).includes(a.field), { message: 'field_not_allowed' });
export async function run(sb, action, ctx) {
  const id = action.entity === 'opportunities' ? ctx.opportunity.id : ctx.customer.id;
  const { error } = await sb.from(action.entity).update({ [action.field]: renderVars(action.value, ctx) })
    .eq('id', id).eq('organization_id', ctx.orgId);
  if (error) throw new ActionError('update_field', error.message);
  return { ok: true, entity: action.entity, id, field: action.field };
}
```

**`create_task` correcto (fix C-3) con asignación `owner|round_robin|user`**

```ts
const assignedTo = action.assign_to === 'owner' ? ctx.opportunity.salesperson_id ?? ctx.opportunity.created_by
  : action.assign_to === 'user' ? action.user_id : await nextRoundRobin(sb, ctx.orgId, action.team_id);
const due = addBusinessTime(ctx.now, action.due_in_days ?? 0, action.due_in_hours ?? 0, ctx.customer.timezone);
const { data, error } = await sb.from('tasks').insert({ organization_id: ctx.orgId, title: renderVars(action.title, ctx),
  description: renderVars(action.description ?? '', ctx), due_date: due.toISOString(), priority: action.priority ?? 'med',
  status: 'open', assigned_to: assignedTo, created_by: null, type: action.task_type ?? 'followup',
  related_to_id: ctx.opportunity.id, related_to_type: 'opportunity', customer_id: ctx.customer.id }).select('id').single();
```

**Cálculo de `next_run_at` (días hábiles + hora local + zona horaria + ventana de envío)**

```ts
import { TZDate } from '@date-fns/tz';
export function computeNextRunAt(p: SchedInput): Date {
  let d = new TZDate(p.from, p.tz);
  let days = p.delayDays;
  while (days > 0) { d = addDays(d, 1); if (!p.businessDaysOnly || isBusinessDay(d, p.holidays)) days--; }
  d = addHours(d, p.delayHours);
  if (p.sendAtLocalTime) { const [h, m] = p.sendAtLocalTime.split(':').map(Number); d = set(d, { hours: h, minutes: m, seconds: 0 });
    if (d <= p.from) d = addDays(d, 1); }
  // ventana de envío de la org (send_window) y días permitidos
  for (let guard = 0; guard < 14; guard++) {
    const dow = getISODay(d), hh = format(d, 'HH:mm');
    if (p.sendWindow.days.includes(dow) && hh >= p.sendWindow.start && hh <= p.sendWindow.end) break;
    if (hh > p.sendWindow.end || !p.sendWindow.days.includes(dow)) d = set(addDays(d, 1), { hours: +p.sendWindow.start.slice(0, 2), minutes: +p.sendWindow.start.slice(3) });
    else d = set(d, { hours: +p.sendWindow.start.slice(0, 2), minutes: +p.sendWindow.start.slice(3) });
  }
  return new Date(d.getTime());
}
```

**Ejecución de un paso con ramas**

```ts
export async function runStep(sb, job): Promise<StepRunResult> {
  const run = await loadStepRun(sb, job.payload.step_run_id);                   // + step + enrollment + sequence
  if (run.enrollment.status !== 'active') return finish(sb, run, 'skipped', { reason: run.enrollment.status });
  const exit = await evaluateExit(sb, run.enrollment); if (exit.exit) return finish(sb, run, 'skipped', { reason: exit.reason });
  const ctx = await loadRuleContext(sb, run.organization_id, run.enrollment.opportunity_id, null);
  let branch: boolean | undefined; let result: Record<string, unknown> = {};
  switch (run.step.channel) {
    case 'condition': branch = evaluate(run.step.condition, ctx).result; result = { branch }; break;
    case 'wait': break;
    case 'call': result = await createCallTask(sb, ctx, run.step.action_config);                          // task type 'call' + guion en description
      break;
    case 'ai_call': result = await dispatchAgent(sb, ctx.orgId, { agentId: run.step.ai_agent_id, opportunityId: ctx.opportunity.id, when: 'now', source: 'sequence' }); break;
    case 'email': case 'whatsapp': case 'sms': case 'task':
      result = await ACTION_REGISTRY[`send_${run.step.channel}` in ACTION_REGISTRY ? `send_${run.step.channel}` : 'create_task']
        .run(sb, { ...run.step.action_config, template_id: run.step.template_id }, ctx, { sequence_step_run_id: run.id }); break;
  }
  await finish(sb, run, 'completed', result, branch);
  const next = branch === undefined ? nextByNumber(run) : (branch ? run.step.next_step_on_true : run.step.next_step_on_false);
  return next ? scheduleNextStep(sb, run.enrollment, next) : completeEnrollment(sb, run.enrollment);
}
```

**`webhook_out` firmado**

```ts
const body = JSON.stringify({ event: ctx.event?.type, rule_id: action.rule_id, opportunity: pick(ctx.opportunity, PUBLIC_OPP_FIELDS), sent_at: ctx.now });
const ts = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', await getOrgWebhookSecret(sb, ctx.orgId)).update(`${ts}.${body}`).digest('hex');
await fetch(action.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GoAdmin-Signature': `t=${ts},v1=${sig}` }, body, signal: AbortSignal.timeout(8000) });
// URL validada: https, sin IPs privadas (SSRF), dominio en allow-list de la org (provider_configs.settings.webhook_domains)
```

### 4.6 Variables de entorno

| Variable | Uso |
|---|---|
| `CRON_SECRET` (existe) | runner F0 |
| `APP_URL` (F0) | destino de `net.http_post` |
| `AUTOMATION_WEBHOOK_SECRET_SALT` (NUEVA) | deriva el secreto por org de `webhook_out` (`HMAC(salt, orgId)`), mostrado una vez en UI |
| Sin nuevas claves de proveedor: email/WA/SMS/IA usan las de F7/F16/F3/F6 |

### 4.7 Dependencias npm

`date-fns@^4` + `@date-fns/tz@^1.2` (NUEVAS; cálculo de fechas con zona horaria sin `moment`), `zod@^3.25` (existe). Nada de bull/inngest: la cola es `outbound_jobs` (D3).

---

## 5. UI

### 5.1 Rutas

| Ruta | Archivo | Propósito |
|---|---|---|
| `/app/crm/automatizaciones` | `src/app/app/crm/automatizaciones/page.tsx` | Lista de reglas por pipeline/etapa, activar/desactivar, historial |
| `/app/crm/automatizaciones/[id]` | `.../automatizaciones/[id]/page.tsx` | Editor "Cuando → Si → Entonces" + prueba en seco + runs |
| `/app/crm/secuencias` | `src/app/app/crm/secuencias/page.tsx` | Lista con métricas |
| `/app/crm/secuencias/[id]` | `.../secuencias/[id]/page.tsx` | Builder vertical + inscritos + métricas por paso |
| Pipeline tab "Automatización" (`PipelineView.tsx:178`) | reemplaza `AutomationsView.tsx` por `PipelineAutomationSummary.tsx` | Resumen por etapa con accesos |

Nav CRM: "Automatizaciones" (icono `Workflow`) y "Secuencias" (icono `ListOrdered`).

### 5.2 Componentes (`src/components/crm/automatizaciones/` y `src/components/crm/secuencias/`; ≤300 L)

| Archivo | Props | Estado/hooks | Servicios |
|---|---|---|---|
| `RuleList.tsx` | `{pipelineId?}` | agrupado por etapa (`Accordion`), switch activar, badge runs 7d/fallos | `GET automation-rules` |
| `RuleEditor.tsx` | `{ruleId?: string, defaults?: Partial<Rule>}` | `react-hook-form` + `ruleSchema`; secciones `WhenSection`, `IfSection`, `ThenSection`; guardado con `version+1` | `POST/PATCH automation-rules` |
| `WhenSection.tsx` | `{form}` | selector de evento (`Select` agrupado: Pipeline / Comunicación / Tiempo), pipeline + etapa (si aplica), `run_once`, `cooldown_hours` | `GET pipelines/stages` |
| `IfSection.tsx` (`ConditionBuilder`) | `{value: ConditionNode, onChange}` | árbol AND/OR anidable (máx 3 niveles), fila = campo (Combobox `CONDITION_FIELDS` con etiqueta legible) + operador + valor (input según tipo: número, fecha, enum, multiselect) | — |
| `ThenSection.tsx` | `{form}` | lista ordenable de acciones (`ActionCard` con formulario propio por tipo + `delay`); "+ Añadir acción" abre `Command` con las 14 acciones | — |
| `actions/{SendEmailForm,SendWhatsappForm,SendSmsForm,CreateTaskForm,CreateActivityForm,UpdateFieldForm,EnrollSequenceForm,StartAiAgentForm,AiDraftEmailForm,BookMeetingRequestForm,NotifyUserForm,WebhookOutForm,MoveStageForm}.tsx` | `{value, onChange}` | plantilla (selector con preview F7/F16), variables, remitente, agente (F6), campo allow-list, URL (+ secreto copiar) | `GET templates`, `GET voice-agents`, `GET sequences` |
| `RuleTestRunDialog.tsx` | `{ruleId}` | elegir oportunidad (Command búsqueda) → muestra `conditions_trace` (✔/✘ por fila), `actions_plan` con fecha/hora calculada y preview del mensaje renderizado | `POST test-run` |
| `RuleRunsTable.tsx` | `{ruleId}` | tabla de runs: fecha, oportunidad, estado, acciones (chips con ✔/✘), error expandible; "Reintentar acción fallida" | `GET runs`, `POST jobs retry` (F0) |
| `PipelineAutomationSummary.tsx` (reemplaza `AutomationsView.tsx`) | `{pipelineId}` | por etapa: nº reglas activas, secuencias que la disparan, agente IA asignado (F6); botones "Ver"/"Nueva regla en esta etapa" | GET reglas/secuencias/stage-agents |
| `StageAutomationTab.tsx` (tab "Automatización" en `StageConfigDialog`) | `{stageId}` | mismo resumen para una etapa + "Crear regla" con `defaults{event:'opportunity.stage_changed', stage_id}` | — |
| `SequenceList.tsx` | `{}` | tabla: nombre, trigger, pasos, inscritos activos, tasa respuesta, switch activo | `GET sequences` |
| `SequenceBuilder.tsx` | `{sequenceId?}` | lista vertical de `StepCard` con conectores; drag & drop (dnd-kit) y reorder por teclado; ramas de `condition` renderizadas como dos columnas indentadas (true/false) con selector "ir al paso N"; validación de grafo en vivo (`validateStepGraph`) | `PATCH sequences/[id]` |
| `StepCard.tsx` | `{step, index, onEdit, onDelete, issues[]}` | icono por canal, título, "día 3 · 09:30 hora del cliente · solo hábiles", plantilla/agente, badges de error | — |
| `StepEditorSheet.tsx` | `{step, onSave}` | formulario por canal: email (plantilla + asunto override), whatsapp (HSM o texto con aviso de ventana 24h), sms, call (guion en textarea, asignación), ai_call (agente F6), task, wait, condition (`ConditionBuilder` + selectores de rama) | `GET templates`, `GET voice-agents` |
| `SequenceCalendarPreview.tsx` | `{steps, tz, startAt}` | línea de tiempo (14/30 días) con los pasos en la fecha calculada por `computeNextRunAt` (mismo código que el backend, importado) | — |
| `EnrollmentTable.tsx` | `{sequenceId}` | inscritos: cliente, oportunidad, paso actual, próximo envío, estado (badge), motivo de pausa; acciones pausar/reanudar/desinscribir; filtros | `GET enrollments`, `POST pause/resume/unenroll` |
| `SequenceStepStats.tsx` | `{sequenceId}` | tabla por paso: enviados, entregados, abiertos, clics, respondidos, fallidos (barras proporcionales) | `GET stats` |
| `EnrollInSequenceDialog.tsx` (`src/components/crm/shared/`) | `{opportunityIds: string[], open, onOpenChange}` | selector de secuencia (solo activas), fecha de inicio, resumen del primer paso, advertencias DNC/sin canal; usado por `QuickActionsBar` (F9) y acciones masivas de `TableView` | `POST enroll` |
| `AutomationActivityEntry.tsx` (`src/components/crm/timeline/`, F9) | `{entry}` | "Regla X ejecutó: email enviado, tarea creada" con link al run | — |

### 5.3 Flujos de usuario

**A. Regla "al entrar a Propuesta"**
1. CRM → Automatizaciones → "+ Nueva regla" (o desde engranaje de la etapa → Automatización → Crear).
2. Cuando: evento "Oportunidad cambia de etapa" → Pipeline "Ventas" → Etapa "Propuesta"; "ejecutar una vez por oportunidad" ✔.
3. Si: `opportunity.amount ≥ 5.000.000` AND `consent.email = opted_in`.
4. Entonces: (1) Enviar email plantilla "Propuesta enviada" ahora; (2) Crear tarea "Llamar para resolver dudas" en 3 días al dueño; (3) Enviar WhatsApp HSM "Recordatorio propuesta" en 5 días **si** `last_email.opened = false` (condición por acción).
5. "Probar en seco" → elegir oportunidad "Acme" → trace ✔✔, plan con fechas (vie 12 sep 09:00 Bogotá…), preview del email → Guardar → Activar.
6. Mover "Acme" a Propuesta → en ≤1 min, historial muestra run `running` con acción 1 ✔; a los 3 días la tarea; la UI del run muestra `email.opened` recibido → acción 3 `skipped (conditions)`.

**B. Secuencia SDR con rama**
1. Secuencias → "+ Nueva" → plantilla sugerida "Seguimiento SDR" → se cargan 8 pasos → editar paso 5 (condición "abrió el email del paso 3": true → llamada, false → WhatsApp) → vista previa de calendario muestra fechas para un cliente en `America/Mexico_City` → Guardar → Activar.
2. Oportunidad → `QuickActionsBar` → "Inscribir en secuencia" → SDR → hoy 09:00 → inscrito. El cliente responde por WhatsApp el día 1 → inscripción `paused (customer_replied_whatsapp)` visible con botón "Reanudar".

**C. Historial y fallos**
Automatizaciones → regla → tab Ejecuciones → run `failed` (acción 1 `template_missing`) → botón "Crear plantilla" (deep link a F7) → "Reintentar acción" → ✔.

### 5.4 Wireframes ASCII

```
┌─ /app/crm/automatizaciones ─────────────────────────────────────────────────────────┐
│ Automatizaciones            Pipeline: [Ventas ▾]                     [+ Nueva regla]  │
│ ▾ Lead nuevo (2 reglas)                                                               │
│   ● Bienvenida al lead            Cuando: creada · Entonces: WA + tarea     7d: 12 ✔ 0 ✘ [⏻] │
│   ○ Calificar con agente IA       Cuando: creada · Si: ICP A/B · Entonces: agente   [⏻] │
│ ▾ Propuesta (1 regla)                                                                 │
│   ● Seguimiento de propuesta      Cuando: entra · Entonces: email → tarea 3d → WA 5d  [⏻] │
│ ▾ Sin etapa (eventos)                                                                 │
│   ● SLA vencido                   Cuando: sla.breached · Entonces: notificar + tarea  [⏻] │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─ Editor de regla ────────────────────────────────────────────────────────────────────┐
│ Nombre [Seguimiento de propuesta        ]  Versión 3 · Activa ●                       │
│ CUANDO  [Oportunidad cambia de etapa ▾]  Pipeline [Ventas ▾]  Etapa [Propuesta ▾]     │
│         ☑ una vez por oportunidad   Enfriamiento [0] h                                │
│ SI      ┌ Y ───────────────────────────────────────────────────────────────┐          │
│         │ [Monto ▾] [≥ ▾] [5.000.000]                                  [✕] │          │
│         │ [Consentimiento email ▾] [= ▾] [Sí ▾]                        [✕] │          │
│         │ [+ condición] [+ grupo O]                                        │          │
│         └───────────────────────────────────────────────────────────────────┘          │
│ ENTONCES 1 ✉ Enviar email  plantilla [Propuesta enviada ▾]  de [Ventas <ventas@…> ▾]  ahora   [⋮] │
│          2 ☑ Crear tarea  "Llamar para resolver dudas"  para [Dueño ▾]  en [3] días  [⋮]       │
│          3 💬 WhatsApp  HSM [Recordatorio propuesta ▾]  en [5] días  si [no abrió email] [⋮]     │
│          [+ Añadir acción]                                                            │
│ [Probar en seco]                                              [Guardar] [Activar]     │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─ SequenceBuilder: Seguimiento SDR ──────────────────────────────┐ ┌─ Vista previa ─────────┐
│ Trigger [Manual ▾]  Ventana 08:00–18:00 L-V  ☑ pausar si responde│ │ Cliente tz: Bogotá      │
│ ┌ 1 💬 WhatsApp · día 0 · HSM "Primer contacto"        [✎][⋮] ┐ │ │ mié 10 sep 09:00  WA    │
│ │                                                              │ │ │ jue 11 sep 09:00  Llam. │
│ ┌ 2 📞 Llamada · día 1 · tarea con guion               [✎][⋮] ┐ │ │ lun 15 sep 09:30  Email │
│ ┌ 3 ✉ Email · día 3 · 09:30 hora del cliente · hábiles [✎][⋮] ┐ │ │ mié 17 sep  ◇ condición │
│ ┌ 4 ◇ Condición · día 5 · abrió email del paso 3       [✎][⋮] ┐ │ │ …                       │
│ │   ✔ sí → 5 📞 Llamada          ✘ no → 6 💬 WhatsApp          │ │ └────────────────────────┘
│ ┌ 7 🤖 Llamada IA · día 10 · agente "Reactivador"      [✎][⋮] ┐ │
│ [+ Añadir paso]        Salir si: [respondió][reunión][cambió etapa][ganada/perdida][opt-out] │
└──────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos, carga y error
- Sin reglas: "Este pipeline aún no tiene automatizaciones" + 3 plantillas sugeridas (una por seed) con botón "Usar".
- Sin secuencias: idem con "Seguimiento SDR", "Recontacto 90 días", "Renovación 60 días".
- Regla con plantilla faltante: badge ámbar "Plantilla no encontrada" y CTA.
- Runs: skeleton; error 500 → `Alert` con reintentar; run `failed` con detalle del error por acción.
- Builder con grafo inválido (rama a paso borrado, ciclo): banner rojo, no permite activar.

### 5.6 Accesibilidad
- `ConditionBuilder`: cada fila es un `group` con `aria-label="Condición 2: Monto mayor o igual a 5.000.000"`; botones eliminar con texto oculto.
- `SequenceBuilder`: reorder por teclado (Alt+↑/↓) y anuncio `aria-live` "Paso 3 movido a posición 2"; ramas con `aria-describedby`.
- Switches activar/desactivar con `aria-checked` y confirmación cuando hay inscritos activos.
- Contraste de badges de estado según `badge` variants.

### 5.7 Motion
- Conectores entre pasos: `initial={{scaleY:0}} animate={{scaleY:1}}` 120 ms al añadir; `layout` en reorder (`LayoutGroup`), desactivado con `prefers-reduced-motion`.
- Trace de dry run: filas ✔/✘ con fade escalonado 40 ms.

### 5.8 Responsive / cross-platform
- Builder en móvil: una columna, vista previa de calendario en `Sheet` inferior; drag deshabilitado (usar menú ⋮ mover arriba/abajo).
- Sin dependencias nativas; PWA/Capacitor/Electron solo consumen API.

---

## 6. Integración con proveedores

Ninguna directa. Cada acción delega en el módulo dueño del canal, respetando sus límites: `send_email` → F7 (`Idempotency-Key email/{email_message_id}`, `tags[{name:'tenant_id'}]`, 10 req/s por team, batch sin adjuntos, `fn_can_contact(customer,'email')` enforced); `send_whatsapp` → F16 (`messages` con `metadata.source='sequence'|'crm'`, `content_type='template'` para HSM APPROVED fuera de ventana 24h; texto libre dentro; `fn_can_contact(customer,'whatsapp', category)`; 1 msg/6 s por wa_id; `131049` → sin reintento 24 h); `send_sms` → F3/F16 (Messaging Service con Advanced Opt-Out); `start_ai_agent`/`ai_call` → F6 (`dispatchAgent`, créditos y DNC de voz); `ai_draft_email` → F6/F7 (`gpt-5.6-luna` con structured output `{subject, blocks_json}`, `reasoning.effort:'none'`); `book_meeting_request` → crea tarea al vendedor con enlace "proponer horarios" (Nivel 1) y, si hay agente `book_meeting`, lo lanza; `notify_user` → `fn_create_org_notification(p_organization_id, p_recipient_user_id, 'app', 'info', p_title, p_content, p_metadata)`; `webhook_out` → HTTP firmado (§4.5).

---

## 7. Multi-tenant y seguridad

Cierra: C-C (fail-open), C-H (update_field arbitrario), C-3, C-4, C-7, C-15, ejecución desde el browser (`OpportunityAutomations.tsx`).

- [ ] CRUD de reglas/secuencias: `getServerOrgContext()` + helper `requireOrgAdmin(ctx)` (NUEVO en `src/lib/utils/orgContext.ts`: `organization_members.role_id` → `roles.name IN ('admin','owner')`; F0 no define permisos granulares, por lo que se usa el rol); lectores ven runs/inscripciones.
- [ ] Toda referencia externa validada en la org: `pipeline_id/stage_id` (join a `pipelines.organization_id`), `template_id`, `sequence_id`, `voice_agent_id`, `user_id` (miembro activo).
- [ ] `conditions` y `actions` validadas con zod en API y re-validadas en runtime (`ACTION_REGISTRY[type].schema.safeParse`); tipo desconocido → acción `failed`, nunca `unknown_action` silencioso.
- [ ] `update_field` solo `UPDATE_FIELD_ALLOWLIST`; `move_stage` solo etapas del pipeline de la opp y siempre por `evaluateStageGate`; `enroll_sequence` solo secuencias activas de la org.
- [ ] Runner: `Bearer CRON_SECRET` fail-closed (sin secreto → 401); service role SIEMPRE con `organization_id` del job/evento; nunca "todas las orgs" sin filtro por fila.
- [ ] Idempotencia: `idx_aruns_rule_event`, `dedupe_key` en jobs, `idx_ssr_enrollment_step`, `idx_enroll_active_unique`.
- [ ] `webhook_out`: HTTPS obligatorio, bloqueo de IPs privadas/metadata (SSRF), allow-list de dominios por org, firma `X-GoAdmin-Signature`, timeout 8 s, sin reintentos infinitos (3).
- [ ] Sin ejecución desde el navegador: `handleStageChangeAutomation` eliminado con `KanbanBoard/PipelineStages` (F2/F9); `PipelineStages` solo hace `PATCH stage_id`.
- [ ] `followup/run` eliminado; `sequences/run` eliminado (solo el runner F0).
- [ ] Consentimiento: toda acción de canal pasa por `fn_can_contact(customer_id, channel)`; `opted_out` → `skipped` con motivo visible.
- [ ] Variables en plantillas escapadas según canal (HTML en email, texto en WA/SMS); nunca se interpola contenido del cliente como instrucción para IA (F6).
- [ ] Datos en `automation_runs.result` sin PII innecesaria (ids, no cuerpos de mensaje).

---

## 8. Créditos, costos y límites

- Cada acción debita su canal en el módulo dueño (email: cuota Resend; WhatsApp/SMS/voz: `deduct_comm_credits(p_org_id, p_channel, p_amount)` en F16/F3; IA: `decrement_ai_credits` en F6/F7) **antes** de llamar al proveedor; sin saldo → acción `failed (insufficient_credits)` y notificación al admin (una por día por org, `cooldown` en `notifications.metadata`).
- Límites por org (`comm_settings`/`ai_settings`, D6): `max_automation_actions_per_day` (default 2000), `max_sequence_sends_per_day` (default 1000); al superar → jobs quedan `queued` con `run_at = mañana 08:00` (no se pierden).
- Presupuesto mensual IA (F6) también corta `start_ai_agent`/`ai_draft_email`.
- Métricas de costo por regla/secuencia: suma de `cost_amount` de `email_messages`, `comm_usage_logs`, `voice_agent_calls` enlazados por `metadata.automation_run_id|sequence_step_run_id` (vista `v_automation_costs`, NUEVA, sin migración adicional: se crea en `202609_crm_v4_f08_rls_y_funciones`).

---

## 9. Pruebas

### 9.1 Unitarias (`src/lib/services/__tests__/`)
- `conditionsDsl.test.ts`: AND/OR anidados; cada operador; campo no permitido → false + trace; tipos no coercidos (`'10' >= 5` es false); `within_days`.
- `scheduling.test.ts`: `computeNextRunAt` con días hábiles cruzando fin de semana, `send_at_local_time` en `America/Mexico_City` vs `America/Bogota`, DST inexistente en CO, ventana 08:00–18:00, delay 0 dentro/fuera de ventana.
- `automationEngine.test.ts` (Supabase mock): `run_once`, `cooldown`, filtro `stage_id/pipeline_id`, plan con delays, `23505` → no duplica, acciones inválidas → `failed`.
- `actions/*.test.ts`: `update_field` allow-list; `create_task` columnas correctas y `round_robin` rota; `move_stage` respeta gate; `webhook_out` rechaza `http://`, `10.0.0.1`, dominios fuera de allow-list.
- `sequenceEngine.test.ts`: inscripción única activa; rama true/false; `pause_on_reply`; exit por `meeting_booked`; `continue_on_error`; `skipped` por DNC; completar al último paso.
- `validateStepGraph.test.ts`: rama a paso inexistente, ciclo, condición sin ramas.
- `automationSeeds.test.ts`: `createPipelineFromTemplate('sales')` siembra 7 reglas + 3 secuencias con `template_key`, idempotente.

### 9.2 Integración
- Evento `opportunity.stage_changed` insertado a mano en `crm_events` → tras `POST /api/crm/jobs/run` (Bearer) hay `automation_runs(running)` + 3 `outbound_jobs` con `run_at` escalonados; segundo `run` no duplica.
- `POST test-run` devuelve `matched:false` con trace cuando `amount` es menor; `dry_run=true` no encola jobs.
- `whatsapp.inbound` (payload de F16) → `fn_pause_sequences_on_reply` pausa la inscripción y `crm_events.status='processed'` con `processed_at`.
- Migración legacy: fila org 125 → 1 regla `legacy_migrated` con 3 acciones; `automations` desaparece tras F0.
- `POST /api/crm/jobs/run` sin header → 401; con `CRON_SECRET` vacío → 401 (fail-closed).

### 9.3 E2E manual (org de prueba)
1. Crear pipeline "Ventas" desde plantilla → Automatizaciones muestra 7 reglas (2 activas) y 3 secuencias.
2. Activar "Seguimiento de propuesta"; mover oportunidad a Propuesta → email llega en ≤2 min; `activities` muestra "Regla ejecutó: email"; tarea aparece con fecha +3 días hábiles.
3. Abrir el email → `email.opened` → a los 5 días (o forzando `run_at` en BD) la acción 3 queda `skipped (conditions)`.
4. Inscribir en "Seguimiento SDR" con cliente en `America/Mexico_City` → `next_run_at` = mañana 09:00 CDMX; responder por WhatsApp → `paused`; reanudar → continúa.
5. Regla con `webhook_out` a `https://webhook.site/...` → recibe firma válida.
6. Poner créditos WA en 0 → acción `send_whatsapp` `failed (insufficient_credits)` + notificación.
7. Editar regla activa (versión 4) → runs nuevos muestran `rule_version=4`.
8. Desactivar secuencia con inscritos → confirmación; inscripciones pasan a `paused (sequence_inactive)`.

### 9.4 Casos borde (≥10)
1. Oportunidad borrada antes de ejecutar la acción → `skipped (opportunity_missing)`. 2. Cliente sin email y acción `send_email` → `skipped (no_channel)` y sigue. 3. Dos reglas misma etapa distinta prioridad → orden por `priority`, ambas corren. 4. Evento duplicado (retry del trigger) → índice único evita doble run. 5. `delay` 30 días y regla desactivada a mitad → job verifica `is_active` al ejecutar → `skipped (rule_inactive)`. 6. Cambio de etapa dentro de la secuencia con exit `stage_changed` → `exited`. 7. `send_at_local_time` 23:30 fuera de ventana → salta al siguiente día hábil 08:00. 8. Timezone inválida en `customers.timezone` → fallback `America/Bogota` + warning en run. 9. Plantilla HSM PAUSED/REJECTED → `failed (template_not_approved)`. 10. Paso `ai_call` sin agente activo → `failed (agent_inactive)` y `continue_on_error`. 11. Runner detenido 3 h → al reanudar procesa por `run_at` sin enviar de golpe fuera de ventana (recalcula si `send_window`). 12. `round_robin` con un solo miembro activo. 13. Orden de acciones con delays desiguales (acción 2 en 0 min y acción 1 en 2 días) se respeta por `run_at`, no por índice.

---

## 10. Definition of Done

Estado tras la **ronda 1** (2026-09-09). Marcado honesto: `[x]` cumplido y verificable,
`[~]` parcial (con el detalle de lo que falta), `[ ]` no hecho.

- [~] Migraciones aplicadas por MCP (`crm_v4_f08_01_engine_schema`, `crm_v4_f08_02_enroll_rpc`), 0 `.sql` en repo. **Falta:** `fn_emit_time_events`, `trg_opp_created_enqueue` ya lo puso F0, la migración de la fila legacy de `automations` (la elimina F0) y el canal `ai_call` en `sequence_steps` (depende de F6).
- [~] Productor y cola conectados: el trigger de F0 emite `opportunity.stage_changed` → job `crm_event` → listener `automation_rules_engine` → job `automation` por regla; handlers `automation` y `sequence_step` implementados. **Falta:** que `src/lib/jobs/handlers/index.ts` (archivo compartido) importe `./f8Automations` y el kind `time_events` en `enums.ts` (el CHECK de BD ya lo admite).
- [x] `automationEngine.evaluateRulesForEvent` es idempotente por regla+evento (`dedupe_key` + índice único `idx_aruns_rule_event`); ámbito por `event + pipeline_id + stage_id`; `run_once_per_opportunity` y `cooldown_hours` reales; DSL con allow-list y traza.
- [~] 9 de las 14 acciones implementadas contra el esquema real (`send_email`, `send_whatsapp`, `create_task`, `create_activity`, `update_field`, `enroll_sequence`, `unenroll_sequence`, `notify_user`, `move_stage` con gate). Las 5 restantes (`send_sms`, `start_ai_agent`, `ai_draft_email`, `book_meeting_request`, `webhook_out`) **fallan explícitamente** (`action_not_implemented`): ninguna se reporta como éxito. C-3/C-4/C-H cerrados.
- [~] Secuencias: canales `email|whatsapp|call|task|wait|condition` reales, `condition` evaluada de verdad (corta la secuencia si es falsa), exit conditions leídas de `sequences.exit_conditions` (`won_lost`, `opted_out`, fin de pasos), una sola inscripción viva por oportunidad/secuencia (índice único parcial), reclamo atómico y recuperación de pasos huérfanos. **Falta:** ramas `next_step_on_true/false` (columnas creadas, sin usar), `send_at_local_time`, `business_days_only`, zona horaria y ventana de envío; `sms` y `ai_call`.
- [x] Nada del CRM se ejecuta desde el navegador: `OpportunityAutomations.tsx` eliminado, `AutomationsView.tsx` solo lee por la ruta de servidor, `followupEngineService`/`followup/run` (F0) y `sequences/run` eliminados.
- [ ] Seeds por plantilla de pipeline (`automationSeeds.ts`): no hechos (deliberado: sin seeds no hay envíos sorpresa al crear un pipeline).
- [~] UI: `/app/crm/automatizaciones` (lista, alta/edición con editor de acciones, simulación en seco, historial real con `failed`/`skipped`) y `/app/crm/secuencias` (lista, alta con pasos, inscribir, inscripciones, desinscribir). **Falta:** activar las entradas en `src/config/crmNav.ts` (archivo compartido), builder con arrastre, tab en `StageConfigDialog` y `EnrollInSequenceDialog` desde `QuickActionsBar`.
- [~] Seguridad §7: `requireOrgAdmin` en las 6 rutas mutantes, destinatario resuelto del cliente (nunca del cuerpo), RLS con política real + políticas DELETE nuevas, filtro por organización en todas las lecturas/escrituras del motor. **Falta:** `webhook_out` firmado con anti-SSRF (acción no implementada).
- [ ] Créditos §8: sin débito por canal en esta fase (los envíos los hacen F7/F16, que sí debitan en su camino).
- [x] `tsc --noEmit`: 219 errores, **0 en archivos de F8** (línea base 230). `npx jest`: suites de F8 verdes (68 casos: 56 adversarios + 9 DSL + 3 motor).

Métricas de éxito: latencia evento → primera acción ≤ 90 s (p95); 0 runs duplicados por evento; ≥95 % de acciones `completed` (excluyendo `skipped` por consentimiento); cada oportunidad en Propuesta recibe seguimiento sin intervención humana; tiempo de creación de una regla < 3 min en la UI.

---

## 11. Riesgos y decisiones

| Decisión / riesgo | Por qué así |
|---|---|
| Outbox `crm_events` + runner de jobs en vez de llamar `evaluateTrigger` desde los servicios | Los eventos vienen de triggers BD, webhooks y servicios distintos; el outbox garantiza "al menos una vez" y el índice único "exactamente una vez" por regla/evento; nada depende del navegador |
| DSL en TS y no `fn_evaluate_conditions` SQL | Misma implementación en editor (validación/preview), dry run y runtime; testeable con jest; la allow-list vive en un solo sitio |
| Reglas y secuencias separadas (no un solo "flujo") | Reglas = reacción a un evento con pocas acciones; secuencias = cadencia larga con estado por inscrito. Unirlas complica el builder; `enroll_sequence` es el puente |
| `delay` por acción en reglas | Cubre el 80 % de "email ahora + tarea en 3 días" sin crear una secuencia |
| Cálculo de fechas con `date-fns` + `@date-fns/tz` | Ligero, sin `moment`; mismo código en server y vista previa del cliente |
| Seeds desactivados por defecto (salvo bienvenida, propuesta, SLA, ganado/perdido) | Evita envíos sorpresa a clientes reales al crear un pipeline; las activas son inocuas (tareas/notificaciones/email transaccional) |
| Riesgo: envíos duplicados tras caída del runner | `dedupe_key`, `FOR UPDATE SKIP LOCKED`, `locked_at` con expiración (F0) y `idx_ssr_enrollment_step` |
| Riesgo: reglas en cascada infinitas (`move_stage` dispara `stage_changed` que dispara `move_stage`) | `run_once_per_opportunity` por defecto; límite de profundidad `event.payload.depth ≤ 3` (el runner propaga `depth+1` en eventos generados por acciones) |
| Riesgo: `no_response.N_days` ruidoso | Solo con `status='open'`, una vez por `last_contact_at`, y reglas seed desactivadas por defecto |
| Riesgo: `webhook_out` como vector SSRF | Allow-list de dominios, bloqueo de rangos privados, HTTPS, timeout |
| Eliminar `automations`/`followupEngine` en vez de refactorizarlos (contrario a V3) | Su modelo (flags booleanos) no expresa acciones reales; el único uso (1 fila) se migra a una regla explícita |

---

## 12. Archivos tocados y orden de PRs (≤400 líneas)

**PR-1 (BD + eventos):** migraciones `202609_crm_v4_f08_automation_rules_v2`, `_sequences_v2`, `_rls_y_funciones`, `_migrar_legacy` (MCP); `src/lib/services/crm/events/emitCrmEvent.ts` (crear); verificación §3.3.

**PR-2 (DSL + scheduling):** `src/lib/services/crm/automation/conditionsDsl.ts`, `src/lib/services/crm/sequence/scheduling.ts` (crear) + tests `conditionsDsl.test.ts`, `scheduling.test.ts`; deps `date-fns`, `@date-fns/tz`.

**PR-3 (acciones):** `src/lib/services/crm/automation/actions/index.ts` + 14 archivos (crear) + `templateVars.ts`; tests `actions/*.test.ts`.

**PR-4 (motor de reglas):** `src/lib/services/crm/automation/automationEngine.ts`, `automationService.ts` (reescribir CRUD + `testRun`), `src/lib/services/crm/jobs/handlers/{crmEvent,automation,timeEvents}.ts` (crear), registro en runner F0 (`JOB_KINDS` + `time_events`), `src/lib/utils/orgContext.ts` (modificar: `requireOrgAdmin`); `src/app/api/crm/automation-rules/route.ts`, `[id]/route.ts`, `[id]/trigger/route.ts` (modificar), `[id]/test-run/route.ts`, `[id]/runs/route.ts` (crear); tests `automationEngine.test.ts`.

**PR-5 (motor de secuencias):** `src/lib/services/crm/sequence/sequenceEngine.ts` (crear), `sequenceService.ts` (mover a `sequence/` y reescribir CRUD + `validateStepGraph`), `jobs/handlers/sequenceStep.ts`; API `src/app/api/crm/sequences/[id]/{unenroll,enrollments,stats}/route.ts`, `sequences/enrollments/[id]/{pause,resume}/route.ts` (crear), `sequences/route.ts`, `[id]/route.ts`, `[id]/enroll/route.ts` (modificar); eliminar `sequences/run/route.ts`; tests `sequenceEngine.test.ts`, `validateStepGraph.test.ts`.

**PR-6 (seeds + limpieza legacy):** `src/lib/services/crm/automationSeeds.ts` (crear), `pipelineTemplates.ts` (modificar: llama a `seedAutomationsForPipeline`), `src/app/api/modules/route.ts` (modificar: siembra al activar CRM); eliminar `src/components/crm/pipeline/OpportunityAutomations.tsx`, `AutomationSettings.tsx`, `AutomationsView.tsx`, `src/lib/services/crm/followupEngineService.ts`, `src/app/api/crm/followup/run/route.ts` (coordinado con F0/F2: `KanbanBoard.tsx` y `PipelineStages.tsx:14,744` dejan de importar `handleStageChangeAutomation`); tests `automationSeeds.test.ts`.

**PR-7 (UI reglas):** `src/app/app/crm/automatizaciones/{page,[id]/page}.tsx`, `src/components/crm/automatizaciones/{RuleList,RuleEditor,WhenSection,IfSection,ThenSection,RuleTestRunDialog,RuleRunsTable}.tsx` (crear), nav (modificar).

**PR-8 (UI formularios de acción):** `src/components/crm/automatizaciones/actions/*.tsx` (13 archivos, crear).

**PR-9 (UI secuencias):** `src/app/app/crm/secuencias/{page,[id]/page}.tsx`, `src/components/crm/secuencias/{SequenceList,SequenceBuilder,StepCard,StepEditorSheet,SequenceCalendarPreview,EnrollmentTable,SequenceStepStats}.tsx` (crear); dep `@dnd-kit/core` + `@dnd-kit/sortable` (si no están ya).

**PR-10 (integración pipeline/timeline):** `src/components/crm/automatizaciones/PipelineAutomationSummary.tsx`, `StageAutomationTab.tsx`, `src/components/crm/shared/EnrollInSequenceDialog.tsx`, `src/components/crm/timeline/AutomationActivityEntry.tsx` (crear); `PipelineView.tsx:178-186` (modificar: monta el resumen), `StageConfigDialog.tsx` (modificar: tab), `TableView.tsx` (modificar: acción masiva "Inscribir en secuencia"), `QuickActionsBar` (F9, modificar).

**PR-11 (E2E + docs):** ejecución §9.3, ajustes, `PROGRESS.md` (modificar) con la migración de la regla legacy y métricas iniciales.

### 12.1 Archivos realmente tocados en la ronda 1 (2026-09-09)

**Creados:** `src/lib/services/crm/automation/{conditionsDsl,ruleContext,actions,automationEngine}.ts`;
`src/lib/jobs/handlers/{automation,sequenceStep,f8Automations}.ts`;
`src/app/api/crm/sequences/[id]/enrollments/route.ts`;
`src/app/app/crm/{automatizaciones,secuencias}/page.tsx`;
`src/components/crm/automatizaciones/{AutomatizacionesPage,RuleFormDialog,RuleActionsEditor}.tsx` + `useAutomationRules.ts`;
`src/components/crm/secuencias/{SecuenciasPage,SequenceFormDialog}.tsx` + `useSequences.ts`;
`src/lib/services/crm/__tests__/{conditionsDsl,automationEngine}.test.ts`.

**Modificados:** `src/lib/services/crm/{automationService,sequenceService}.ts`;
`src/app/api/crm/automation-rules/{route.ts,[id]/route.ts,[id]/trigger/route.ts}`;
`src/app/api/crm/automation-runs/route.ts`;
`src/app/api/crm/sequences/{route.ts,[id]/route.ts,[id]/enroll/route.ts}`;
`src/components/crm/pipeline/AutomationsView.tsx`;
`src/lib/services/crm/__tests__/f8Adversarial.test.ts`;
este documento.

**Eliminados:** `src/app/api/crm/sequences/run/route.ts`,
`src/components/crm/pipeline/OpportunityAutomations.tsx`.

**No tocados por ser compartidos** (bloques exactos en §13.4): `src/lib/jobs/handlers/index.ts`,
`src/config/crmNav.ts`, `src/lib/crm/enums.ts`, `src/lib/crm/__fixtures__/db-checks.json`,
`src/__tests__/guardrails.test.ts`, `src/middleware.ts`.

### 12.2 Archivos realmente tocados en la ronda 2 (2026-09-09)

**Creados:** `src/lib/jobs/handlers/timeEvents.ts`;
`src/app/api/crm/sequences/[id]/enroll/preview/route.ts`;
`src/components/crm/secuencias/EnrollDialog.tsx`.

**Modificados:** `src/lib/services/crm/sequenceService.ts` (cadena de pasos, guarda de orden,
pausa no destructiva, `resumeEnrollment`); `src/lib/services/crm/automationService.ts`
(`force` retirado, `finishRun` con filtro de organización);
`src/lib/services/crm/automation/{actions,ruleContext}.ts` (N4 y N8);
`src/lib/jobs/handlers/{f8Automations,sequenceStep}.ts`;
`src/app/api/crm/automation-rules/[id]/trigger/route.ts`;
`src/app/api/crm/sequences/[id]/enrollments/route.ts` (PATCH resume);
`src/components/crm/secuencias/{SecuenciasPage.tsx,useSequences.ts}`;
`src/components/crm/pipeline/AutomationsView.tsx`;
`src/lib/services/crm/__tests__/f8Adversarial.test.ts`; este documento.

**Eliminados:** ninguno.

**No tocados por ser compartidos:** los mismos de §12.1. La ronda 2 **no dejó ningún bloque
pendiente de integración**: el barrido de respaldo viaja por el kind `time_events`, que ya está
en `enums.ts` y en el CHECK de BD, y lo drena el cron 17 (que no filtra por kind).

### 12.3 Archivos realmente tocados en la ronda 3 (2026-09-09)

**Creados:** `src/lib/services/crm/sequenceSweep.ts` (programación del barrido, fuera del handler
para no crear un ciclo con `sequenceService`); `src/components/crm/secuencias/ConditionEditor.tsx`
(editor de condiciones, N10).

**Modificados:** `src/lib/services/crm/sequenceService.ts` (validación de la condición, fail-closed
en ejecución, `continue_on_error` que no aplica a `condition`, aislamiento por run del barrido,
`qualifyVarsForEmail` en el paso `email`, orden de `skipRemainingSteps`);
`src/lib/services/crm/automation/conditionsDsl.ts` (`countConditionRules` / `isEmptyConditionTree`,
aditivos: la semántica de las reglas no cambia); `src/lib/jobs/handlers/timeEvents.ts`;
`src/components/crm/secuencias/{SequenceFormDialog,EnrollDialog}.tsx`;
`src/components/crm/secuencias/useSequences.ts`;
`src/app/api/crm/sequences/[id]/enroll/preview/route.ts` (`condition_rules` en la previsualización);
`src/lib/services/crm/__tests__/f8Adversarial.test.ts`; este documento.

**Eliminados:** ninguno.

**No tocados por ser compartidos:** los mismos de §12.1, y en particular `src/config/crmNav.ts`
(la casilla de `secuencias` la decide el orquestador; ver §15.7). La ronda 3 **tampoco deja ningún
bloque pendiente de integración**.

---

## 13. Registro de implementación — ronda 1 (2026-09-09)

Punto de partida: informe del tester `TEST-F8-r1.md` (3,5/10, "motor desconectado", 12 defectos).
Esta ronda ataca los 12 y conecta el motor de punta a punta. Lo que **no** se hizo queda
declarado abajo, no maquillado.

### 13.1 Base de datos (aplicada por MCP, cero `.sql` en el repo)

| Migración | Contenido |
|---|---|
| `crm_v4_f08_01_engine_schema` | Columnas nuevas de `automation_rules` (`event, pipeline_id, stage_id, run_once_per_opportunity, cooldown_hours, version, template_key, created_by, updated_by, last_run_at, runs_count`), `automation_runs` (`opportunity_id, event_id, actions_plan, dry_run, rule_version, skip_reason`), `sequences` (`pipeline_id, stage_id, pause_on_reply, template_key, created_by, stats`), `sequence_steps` (`name, delay_hours, next_step_on_true/false, condition, continue_on_error, updated_at`), `sequence_enrollments` (`current_step_id, next_run_at, paused_reason, paused_at, enrolled_by, source, timezone, steps_done`), `sequence_step_runs` (`job_id, attempts, email_message_id, task_id, branch_taken`). CHECK `automation_runs.status` + `skipped`; CHECK `outbound_jobs.kind` + `time_events`; CHECK `sequences.trigger_type` + `event`; CHECK `sequence_steps.delay_days BETWEEN 0 AND 3650` y `delay_hours BETWEEN 0 AND 23`. Índice único parcial **`idx_enroll_active_unique (sequence_id, opportunity_id) WHERE status IN ('active','paused')`** (permite reinscribir a quien ya salió) + variante por `customer_id`; `idx_aruns_rule_event` único por regla+evento. Políticas **DELETE** en `sequence_step_runs` y `automation_runs`. |
| `crm_v4_f08_02_enroll_rpc` | `fn_enroll_in_sequence(p_org, p_sequence_id, p_opportunity_id, p_customer_id, p_source, p_enrolled_by, p_start_at)`: valida membresía (si hay `auth.uid()`), secuencia **activa**, oportunidad/cliente de la organización, corta la inscripción duplicada, exige pasos activos y crea inscripción + `sequence_step_runs` + jobs `sequence_step` (`fn_enqueue_job`, `dedupe_key = seqrun:{id}`, `run_at = scheduled_at`) **en una sola transacción**. `fn_pause_sequences_on_reply(org, opp, customer, canal)` para pausar al responder el cliente. |

Verificación (rollback garantizado con `RAISE EXCEPTION` al final del bloque): la RPC creó 2 pasos
y 2 jobs, la segunda llamada devolvió `already_active`, y con la secuencia desactivada lanzó
`sequence_inactive`. Conteos posteriores:
`sequences / sequence_enrollments / sequence_step_runs / automation_rules / automation_runs = 0`,
`outbound_jobs = 33` (los de otras fases, **sin drenar**).

### 13.2 Código

| Archivo | Qué se hizo |
|---|---|
| `src/lib/services/crm/automation/conditionsDsl.ts` (NUEVO) | DSL §2.4 real: allow-list `CONDITION_FIELDS`, 15 operadores sin `Number()` forzado, normalización del formato legacy, `validateConditions` y traza. |
| `src/lib/services/crm/automation/ruleContext.ts` (NUEVO) | `loadRuleContext` (oportunidad, cliente, etapa, pipeline, consentimiento) **siempre filtrando por organización**; variables de plantilla. |
| `src/lib/services/crm/automation/actions.ts` (NUEVO) | Catálogo de 14 acciones; 9 implementadas, 5 lanzan `action_not_implemented`; `insertAutomationTask` (único INSERT en `tasks`, con `related_to_id/related_to_type` y `status:'open'`); `validateUpdateField` + allow-list; destinatario de email resuelto del cliente con `to_customer_id` e `idempotency_key`; WhatsApp por la cola de F16 (opt-out y ventana de 24 h las aplica F16). |
| `src/lib/services/crm/automation/automationEngine.ts` (NUEVO) | Listeners del outbox: `automation_rules_engine` (evalúa reglas y encola un job `automation` por regla, `dedupe_key = rule:{id}:event:{id}`) y `sequence_reactions` (pausa por respuesta del cliente, reevalúa condiciones de salida). Da por fin un caller a `evaluateTrigger`. |
| `src/lib/services/crm/automationService.ts` | Reescrito: CRUD con validación, `evaluateTrigger` con ámbito y DSL, `executeAutomationRule` con estados honestos (`completed` / `failed` / `skipped` + `skip_reason` + `error_message`), `run_once` y `cooldown`, `testRunAutomationRule` (dry run). Sin `console.warn` que se trague errores. |
| `src/lib/services/crm/sequenceService.ts` | Reescrito: CRUD con `validateSequenceSteps` (delay 0–3650, canal del CHECK, `step_number` único), `enrollInSequence` sobre la RPC atómica, `claimStepRun` atómico + `reclaimStaleStepRuns`, canales `email/whatsapp/call/task/wait/condition` reales, `checkExitConditions` con filtro de organización y lectura de `exit_conditions`. |
| `src/lib/jobs/handlers/automation.ts`, `sequenceStep.ts`, `f8Automations.ts` (NUEVOS) | Handlers de los dos kinds + registro (side-effect) y alta de listeners. |
| `src/app/api/crm/automation-rules/**`, `src/app/api/crm/sequences/**` | `requireOrgAdmin` en las 6 rutas mutantes, validación de entrada (400 con `issues`), `dry_run` en `/trigger`, inscripción masiva con `skipped[]`, nueva `sequences/[id]/enrollments` (GET/DELETE). |
| `src/app/api/crm/sequences/run/route.ts` | **ELIMINADA** (§4.1). Era inalcanzable: el middleware la redirigía a `/auth/login` incluso con el `CRON_SECRET` correcto, así que su `verifyCronSecret` nunca corría. La ejecución va por la cola (`sequence_step`), no por una ruta propia: así tampoco hay que tocar `src/middleware.ts` (archivo compartido). |
| `src/components/crm/pipeline/AutomationsView.tsx` | Reescrito: lee `automation_rules` por la ruta de servidor, sin cliente de navegador, sin escribir la tabla legacy `automations`, sin "próximamente". |
| `src/components/crm/pipeline/OpportunityAutomations.tsx` | **ELIMINADO** (360 L de código muerto, sin importadores, con el `tasks.related_id` roto). |
| `src/app/app/crm/{automatizaciones,secuencias}/page.tsx` + `src/components/crm/{automatizaciones,secuencias}/**` (NUEVOS) | Las dos pantallas que faltaban. |
| Tests | `f8Adversarial.test.ts` actualizada (56 casos: mismo escenario y datos, ahora afirmando el comportamiento correcto), `conditionsDsl.test.ts` (9) y `automationEngine.test.ts` (3), nuevos. |

### 13.3 Desviaciones respecto al plan

1. **La ejecución de una regla no se parte en un job por acción** (§4.5 lo sugiere): un job por regla
   ejecuta sus acciones en orden. Motivo: sin `delay` por acción todavía, N jobs solo multiplican las
   oportunidades de duplicar envíos. El `dedupe_key` y el índice único siguen garantizando
   "una ejecución por regla y evento".
2. **Un fallo de acción es terminal** (`JobFatalError`), no reintentable: reintentar re-ejecutaría las
   acciones que sí salieron bien (tareas y correos duplicados). El detalle queda en
   `automation_runs.result[]` y en `outbound_jobs.last_error`.
3. **`ai_call` no se añadió al CHECK de `sequence_steps.channel`** ni `agent_orchestration` a los kinds:
   dependen de F6 y `src/lib/crm/enums.ts` es zona compartida de solo lectura.
4. **Sin seeds de reglas por plantilla de pipeline**: crear un pipeline no debe encender envíos.
5. **Sin `send_window` / días hábiles / zona horaria**: el cálculo de `scheduled_at` es
   `enrolled_at + delay_days + delay_hours` dentro de la RPC.

### 13.4 Pendiente de integración (archivos compartidos, los aplica el orquestador)

- `src/lib/jobs/handlers/index.ts`: `import './f8Automations';` (registra `automation`, `sequence_step`
  y los listeners del outbox).
- `src/config/crmNav.ts`: `enabled: true` en las entradas `secuencias` y `automatizaciones`
  (las páginas ya existen).
- `src/lib/crm/enums.ts` + `src/lib/crm/__fixtures__/db-checks.json`: añadir `'time_events'` a
  `JOB_KINDS` y a `outbound_jobs.kind` (el CHECK de BD ya lo admite; deben ir juntos para no romper
  el guardarraíl 9).
- `src/__tests__/guardrails.test.ts`: quitar `'app/api/crm/sequences/run/route.ts'` de la allow-list
  del caso 5 (la ruta ya no existe).
- **Despliegue (decisión del dueño):** los `cron.job` 17/18/19 del CRM siguen `active = false`.
  Mientras lo estén, ninguna regla ni paso se ejecuta solo aunque el motor esté conectado. Activarlos
  es lo único que falta para que corra cada minuto, y hay 33 jobs vivos de otras fases en la cola que
  se despacharían en el primer tick: la activación debe hacerse revisando antes esa cola.

---

## 14. Registro de implementación — ronda 2 (2026-09-09)

Punto de partida: `TEST-F8-r2.md` (**7,5/10**; 11 de los 12 defectos de r1 corregidos y verificados
contra la base, 1 parcial, **0 afirmaciones falsas**). Esta ronda cierra los 8 hallazgos nuevos.

### 14.1 N1 (BLOQUEANTE) — la condición no protegía el paso siguiente por la cola

**El fallo, tal como lo demostró el tester.** `fn_enroll_in_sequence` encolaba un job por paso con
`run_at = scheduled_at`. Dos pasos con `delay_days = 0, delay_hours = 0` reciben el **mismo
timestamp al microsegundo**, y `fn_claim_jobs` reclama con `ORDER BY run_at ASC` **sin desempate**
(verificado hoy otra vez en `pg_get_functiondef`). Si el job del paso `email` se reclamaba primero,
**el correo salía**, y cuando después corría el paso `condition` y evaluaba a falso,
`skipRemainingSteps` solo marcaba `skipped` lo que seguía `pending`. El caso `E4` estaba verde
porque ejercita el barrido secuencial, no la cola.

**La corrección: programación encadenada + guarda de orden.**

1. **Migración `crm_v4_f08_03_enroll_chain_and_resume`.** `fn_enroll_in_sequence` sigue creando
   TODOS los `sequence_step_runs` dentro de la misma transacción (la inscripción sigue siendo
   atómica y visible), pero **encola solo el job del primer paso por `step_number`**. Ya no hay dos
   jobs que puedan empatar.
2. **`processStepRun` encola el siguiente** (`advanceChain`, `sequenceService.ts`) cuando el paso
   anterior alcanza un estado terminal, con `run_at = max(scheduled_at, now)` y
   `dedupe_key = seqrun:{id}`. **No** avanza cuando la condición es falsa, cuando el paso falla con
   `continue_on_error: false`, ni cuando `checkExitConditions` saca la inscripción.
3. **Guarda de seguridad.** Antes de ejecutar nada, `processStepRun` comprueba si queda algún paso
   ANTERIOR (`step_number` menor) en `pending`/`running`. Si lo hay, devuelve el paso a `pending`
   con `result.reason = 'waiting_previous_step'` y lo reencola a 60 s con una clave propia
   (`seqrun:{id}:wait:{n}`; `seqrun:{id}` está ocupado por el job vivo). Esto protege el **barrido
   de respaldo** —que ordena por `scheduled_at` y también empata— y cualquier job duplicado.
   Superadas 30 esperas el paso se marca `skipped` (`waiting_previous_step_timeout`): se corta en
   seco antes que enviar saltándose el paso anterior.

**Verificado en la base** (bloque `DO $$ … RAISE EXCEPTION $$`, rollback garantizado), secuencia
`condition → email → task` con los tres a día 0:

```
ENROLL={"steps": 3, "created": true, ...}   runs=3   seq_jobs=1 (esperado 1)
job_step_number=1 (esperado 1)              time_events=1
```

**Verificado por la COLA en la suite** (casos nuevos `N1a`–`N1e`): un helper `drainQueue`
reproduce `fn_claim_jobs` —ordena solo por `run_at` y, en el empate, elige el **último** job, que
es el orden más adverso— y ejecuta `processStepRun`. `N1a` comprueba que solo hay un job vivo y que
`sendEmail` **no se llama**; `N1b` fabrica a mano el job empatado del paso 2 (el que encolaba la RPC
antes de esta ronda) y comprueba que la guarda lo frena; `N1e` comprueba que la cadena avanza sola
por los tres pasos.

### 14.2 N2 (MEDIO) — el barrido de respaldo ya tiene llamador

`reclaimStaleStepRuns` y `processPendingStepRuns` no tenían ningún consumidor en producción: un job
que agotaba sus 3 intentos dejaba el paso sin ejecutar, la inscripción `active` para siempre y —por
el índice único parcial— la oportunidad sin poder reinscribirse.

- **NUEVO `src/lib/jobs/handlers/timeEvents.ts`**: handler del kind `time_events` (ya en el CHECK de
  BD y en `enums.ts`). Recupera los `running` huérfanos, ejecuta los `pending` vencidos y **se
  reprograma a 15 min mientras queden inscripciones vivas** (`active|paused`) en la organización;
  cuando no queda ninguna, la cadena se apaga sola.
- **La siembra la hace la propia RPC** (`fn_enroll_in_sequence` y `fn_resume_sequence_enrollment`
  encolan `time_events` con `dedupe_key = time_events:{org}`, singleton por organización).
- **No hace falta cron nuevo ni tocar `scheduler.ts`** (archivo de JOBS): el `cron.job` 17
  (`* * * * *`) llama a `/api/crm/jobs/run` **sin filtrar kinds**, y `fn_claim_jobs` con
  `p_kinds IS NULL` reclama cualquier kind. Sigue `active = false`, como pidió el tester.
- Casos `N2a` (handler registrado + siembra), `N2b` (job `dead` → el barrido ejecuta el paso y
  cierra la inscripción), `N2c` (se reprograma solo si quedan inscripciones vivas).

### 14.3 N3 (MEDIO) — pausar ya no es una puerta de un solo sentido

- **`processStepRun` ya no consume los pasos de una inscripción `paused`**: libera el reclamo y deja
  el run en `pending` con `result.reason = 'enrollment_paused'`. Antes cada job pendiente lo marcaba
  `skipped` y la secuencia moría en silencio.
- **`fn_resume_sequence_enrollment(p_org, p_enrollment_id)`** (misma migración): valida membresía y
  organización, vuelve a `active`, limpia `paused_reason`/`paused_at`, **reprograma a `now()` el
  siguiente paso pendiente cuya hora ya pasó** y encola su job. Devuelve
  `{resumed:false, reason:'not_paused'}` si no procede y cierra la inscripción como `completed` si
  ya no quedan pasos. Es una RPC `SECURITY DEFINER` y no TS porque `fn_enqueue_job` tiene EXECUTE
  revocado para `authenticated`.
- **`PATCH /api/crm/sequences/[id]/enrollments`** con `{enrollment_id, action:'resume'}`, con
  `requireOrgAdmin` (reanudar reprograma envíos reales).
- **Botón «Reanudar»** en la lista de inscripciones, visible solo en las `paused`, junto al motivo de
  la pausa.
- Verificado en vivo: `RESUME={"status":"active","resumed":true,"next_run_at":…}` y una segunda
  llamada `{"reason":"not_paused"}`. Casos `N3a`–`N3d`.

### 14.4 Exposición de las dos páginas

El tester demostró que **ocultarlas del menú no era contención**: `AutomationsView` está montada en
`PipelineView` y tenía dos `<Link>` visibles a `/app/crm/automatizaciones`. Ahora esos enlaces se
renderizan **solo si la entrada `automatizaciones` de `src/config/crmNav.ts` está `enabled`**, de
modo que la casilla del menú es el único interruptor real (caso `N-UI`). Con `enabled: false` la
vista sigue mostrando las reglas del pipeline (lectura) y explica que el editor no está habilitado.

`/app/crm/secuencias` no tiene ningún enlace en el producto: solo la entrada de menú.

### 14.5 Hallazgos bajos

| # | Corrección |
|---|---|
| **N5** | **`force` retirado por completo.** `executeAutomationRule` lanza si se lo pasan y el interruptor `is_active` es absoluto; `POST /trigger` con `force` devuelve **400 `FORCE_REMOVED`** y remite a `dry_run`. Ninguna pantalla lo usaba. |
| **N6** | `automationService.finishRun` recibe `orgId` y actualiza con `.eq('id', runId).eq('organization_id', orgId)`, como ya hacía el de secuencias. |
| **N7** | Inscribir dejó de ser un UUID pegado a mano: **`EnrollDialog`** (NUEVO) busca la oportunidad por nombre contra **`GET /api/crm/sequences/[id]/enroll/preview`** (NUEVA, solo lectura y solo de la org), muestra cliente y email, marca las **ya inscritas**, lista **los pasos que se van a ejecutar y cuándo**, avisa si la secuencia envía mensajes reales y exige **Confirmar inscripción**. |
| **N4** | Un `to` fijo que **no** corresponde a ningún cliente de la organización se **rechaza** (`recipient_not_a_customer`), porque F7 no podría consultar `fn_can_contact`. Para avisos internos hay que declararlo explícitamente con `allow_non_customer: true`. |
| **N8** | El asunto y el HTML se entregan a F7 **sin sustituir**: `qualifyVarsForEmail` solo reescribe el NOMBRE de las variables planas de F8 (`{{customer_name}}` → `{{custom.customer_name}}`) y el valor lo sustituye y escapa `renderVariables(..., {escapeHtml:true})` de F7, que es quien renderiza. Las variables ya cualificadas de F7 (`{{contact.first_name}}`, `{{org.name}}`…) no se tocan. |

### 14.6 Lo que sigue SIN hacer (criterio de terminado propio)

1. **5 de las 14 acciones** siguen sin implementación (`send_sms`, `start_ai_agent`,
   `ai_draft_email`, `book_meeting_request`, `webhook_out`): lanzan `action_not_implemented` y se
   ven en rojo. `send_sms` no tiene proveedor; las de IA dependen de F6; `webhook_out` necesita el
   anti-SSRF y el secreto por organización de §4.5.
2. **Sin zona horaria ni ventana de envío** (`send_at_local_time`, `business_days_only`): el
   `scheduled_at` sigue siendo `enrolled_at + delay_days + delay_hours`. Seis pasos a día 0 siguen
   siendo seis envíos seguidos — ahora **en cadena**, uno tras otro, no en el mismo tick.
3. **Sin eventos temporales de negocio** (`sla.breached`, `no_response.N_days`, `task.overdue`): el
   kind `time_events` ya tiene handler, pero solo hace el barrido de secuencias. No existe
   `fn_emit_time_events` ni las reglas «sin respuesta en N días».
4. **Ramas `next_step_on_true` / `next_step_on_false`**: columnas creadas y **sin usar**. Una
   condición falsa corta la secuencia en vez de ramificar.
5. **`ai_call` sigue fuera del CHECK de `sequence_steps.channel`** (depende de F6): no hay paso de
   llamada del agente.
6. **Sin seeds** de reglas por plantilla de pipeline (deliberado: crear un pipeline no debe encender
   envíos) y la fila legacy de `automations` sigue ahí (la elimina F0).
7. **Las dos páginas no se han abierto con sesión real** y la cadena completa no se ha ejercido en
   vivo: **no se drenó `/api/crm/jobs/run`** (hay un `crm_event` en cola que despertaría los
   oyentes de esta fase) y los `cron.job` 17/18/19 **siguen `active = false`**.

### 14.7 Cuándo se puede activar cada página

- **`/app/crm/automatizaciones`: activable ya.** N5 está cerrado (una regla desactivada no se
  ejecuta ni forzándola), N6 también, las 6 rutas mutantes exigen administrador y el botón de probar
  es `dry_run`. Poner `enabled: true` en `crmNav.ts` habilita a la vez la página y el enlace del
  pipeline.
- **`/app/crm/secuencias`: activable tras revisar esta ronda.** N1 y N7 —los dos que el tester puso
  como condición— están cerrados: la condición protege el paso siguiente también por la cola, y
  inscribir exige elegir de una lista y confirmar viendo los pasos. Queda declarado que la cadena
  completa no se ha ejercido en vivo.
- **`cron.job` 17/18/19: siguen `active = false` y no se tocaron.** Es decisión de despliegue del
  dueño. En el primer tick del 17 se despacharían los jobs vivos de otras fases que haya en la cola.

---

## 15. Registro de implementación — ronda 3 (2026-09-09)

> Partida: `TEST-F8-r3.md` (8,5/10). Los ocho hallazgos de la ronda 2 quedaron cerrados y sin
> declaraciones falsas; el tester, al cerrar la puerta de la cola, encontró otras tres: **N10**
> (el paso de condición no se podía configurar desde el producto y, vacío, evaluaba a VERDADERO),
> **N11** (una condición que falla al evaluarse mandaba el correo igual) y **N9** (el barrido de
> respaldo podía morir para siempre). Se cierran las tres, más N12 y N14, y aparece un fallo
> **adicional** del barrido que nadie había visto (§15.3).

### 15.1 N10 (MEDIO-ALTO, bloqueante de la página) — la condición ya se configura y ya corta

El canal `condition` existía en el selector y `EnrollDialog` lo anunciaba como «Condición (puede
cortar la secuencia)», pero **no había editor**: `sequence_steps.condition` no se rellenaba nunca
desde la interfaz, y `normalizeConditions(null)` produce un grupo `and` vacío que evalúa a
**verdadero**. El paso decía frenar y dejaba pasar siempre.

Se cierra por **cuatro** sitios a la vez:

1. **Editor real** — NUEVO `src/components/crm/secuencias/ConditionEditor.tsx` (241 L): combinación
   `TODAS`/`ALGUNA`, filas campo/operador/valor con la allow-list `CONDITION_FIELDS` agrupada por
   raíz y los 15 operadores del DSL; el valor se tipa solo (número, booleano, lista para `in`), y
   los operadores `is_null`/`is_not_null` ocultan el campo de valor. Montado en
   `SequenceFormDialog.tsx` para todo paso `condition`.
2. **Validación al guardar** — `validateSequenceSteps` (`sequenceService.ts`) rechaza un paso
   `condition` sin ninguna regla hoja y pasa cualquier condición por `validateConditions` (que ya
   existía y **no se llamaba**): un `field` fuera de la allow-list se rechaza al crear, no en
   ejecución.
3. **Fail-closed en ejecución** — `processStepRun` lanza `condition_not_configured` si la condición
   está vacía o malformada. **Decisión y motivo:** una condición vacía **no** se da por cumplida en
   silencio; corta la secuencia y queda en rojo con su motivo (`exit_reason =
   condition_unevaluable`). Dejar pasar un envío a un cliente por una configuración incompleta es el
   fallo caro; cortar solo cuesta un reintento manual. Las filas heredadas (creadas antes de esta
   ronda) caen por este camino.
4. **Respaldo en la base** — migración `crm_v4_f08_04_condition_step_fail_closed`:
   `sequence_steps_condition_required_chk`. Verificado en vivo (§15.6).

`normalizeConditions` y `evaluateConditionTree` **no cambian**: una `automation_rule` sin
condiciones se sigue ejecutando siempre, que es lo correcto ahí. La distinción la hace el nuevo
`isEmptyConditionTree` / `countConditionRules` de `conditionsDsl.ts`, que solo usa la ruta de
secuencias.

### 15.2 N11 (MEDIO) — `continue_on_error` no aplica a los pasos de condición

`continue_on_error` es `true` por DEFECTO en la base, y en el `catch` de `processStepRun` eso
significaba: si la condición revienta (un error transitorio leyendo `opportunities`, `customers`,
`stages`, `pipelines` o `contact_consents`), **encola el paso siguiente igual** — es decir, manda el
correo sin haber evaluado nada.

Cambio de comportamiento por defecto, en tres capas:

- ejecución: `const cutsOnError = step.continue_on_error === false || step.channel === 'condition'`;
- escritura: `createSequence` guarda todo paso `condition` con `continue_on_error: false`;
- base: `sequence_steps_condition_no_continue_chk` lo impide para ese canal.

Los demás canales conservan el comportamiento anterior (un `sms` fallido sigue dejando avanzar la
cadena si así se configuró).

### 15.3 N9 (MEDIO) — el barrido de respaldo ya no puede quedarse muerto

Cuatro cambios, y **uno de ellos corrige un fallo peor que el declarado**:

1. **Aislamiento por ejecución** — `processPendingStepRuns` envuelve cada `processStepRun` en su
   `try/catch`: un run defectuoso ya no aborta el lote. Los fallos se **cuentan y se devuelven**
   (`errors`, `first_error` en el nuevo `SweepCounters`) y el handler los registra: no se tragan.
2. **Reprogramación incondicional** — `timeEventsJobHandler` reprograma el barrido **también cuando
   el lote falla**, antes de propagar el error. Antes vivía en el camino feliz: tres barridos
   fallidos dejaban la organización sin red para siempre.
3. **El fallo nuevo (no estaba en el informe del tester):** `fn_enqueue_job` deduplica sobre
   `status IN ('queued','running')` y, al chocar, **devuelve el id del job vivo**. El job del barrido
   está `running` mientras corre su propio handler, así que al reprogramarse **chocaba consigo
   mismo**: no creaba nada y devolvía su propio id. La cadena de barridos se apagaba tras la
   **primera** vuelta, no solo al fallar. NUEVO `src/lib/services/crm/sequenceSweep.ts` detecta ese
   choque (id devuelto == job en curso), comprueba que no haya ya otro barrido en cola y encola el
   sucesor **sin clave de deduplicación**; ese sucesor recupera la clave estable en su siguiente
   vuelta, así que vuelve a ser singleton por sí solo. Caso `N9c`.
4. **La red tiene red** — `advanceChain`, cuando no consigue encolar el paso siguiente (escribe
   `chain_error` y confía en el barrido), **siembra el barrido**. Antes solo lo sembraban inscribir y
   reanudar, y la tarea programada drena la cola pero no la llena.

### 15.4 N12 y N14 (bajos)

- **N12:** el paso `email` de secuencia pasa asunto y HTML por `qualifyVarsForEmail`, como ya hacía
  la ruta de reglas. Sin esto, `{{customer_name}}` —la variable que el propio paso construye— no
  resolvía y `strict_variables` hacía fallar el envío con `MISSING_VARIABLES` (422).
- **N14:** en la rama de condición falsa, `skipRemainingSteps` se ejecuta **antes** de escribir
  `completed`. Se cierra la ventana en la que la condición ya no estaba en `pending|running` —así que
  la guarda de orden no frenaba a nadie— y el correo seguía `pending`.

### 15.5 Archivos tocados en la ronda 3

```
src/lib/services/crm/sequenceSweep.ts                        (NUEVO)
src/components/crm/secuencias/ConditionEditor.tsx            (NUEVO)
src/lib/services/crm/sequenceService.ts
src/lib/services/crm/automation/conditionsDsl.ts
src/lib/jobs/handlers/timeEvents.ts
src/components/crm/secuencias/SequenceFormDialog.tsx
src/components/crm/secuencias/EnrollDialog.tsx
src/components/crm/secuencias/useSequences.ts
src/app/api/crm/sequences/[id]/enroll/preview/route.ts
src/lib/services/crm/__tests__/f8Adversarial.test.ts
```

Migración por MCP (cero `.sql` en el repo): `20260909180354
crm_v4_f08_04_condition_step_fail_closed`. Es **solo DDL de restricciones**: no crea ninguna función,
así que no hay nada con elevación de privilegios que revocar a `anon`.

### 15.6 Verificación

- **Suite de la fase: 90/90 verdes** (76 de la ronda 2 intactos + 14 nuevos: `N9a`–`N9d`,
  `N10a`–`N10f`, `N11`, `N11b`, `N12`, `N14`). El doble de BD replica los dos CHECK nuevos.
- **`npx jest` completo:** `1 failed, 1 skipped, 82 passed, 83 de 84` · `2 failed, 1 skipped,
  1362 passed, 1365`. La única suite roja es `website/__tests__/sectionContract.test.ts`, ajena y
  declarada. `guardrails` y la suite de correo, verdes.
- **`npx tsc --noEmit`: 219 errores, 0 en archivos de F8.**
- **Contra la base real** (bloque `DO $$ … RAISE EXCEPTION $$`, reversión garantizada):
  `A(sin condicion)=RECHAZADO 23514 | B(continue_on_error=true)=RECHAZADO 23514 |
  C(bien formado)=ACEPTADO`. Conteos posteriores: todas las tablas de la fase a 0,
  `outbound_jobs = 33`, `cron.job 17/18/19 = false`.

### 15.7 Cuándo se puede activar cada página (actualiza §14.7)

- **`/app/crm/automatizaciones`: ya activa** (la casilla la puso el orquestador en esta ronda,
  siguiendo la recomendación del tester). Ninguno de los hallazgos nuevos toca esa pantalla.
- **`/app/crm/secuencias`: ya se puede activar.** El bloqueante era N10 y está cerrado por los
  cuatro sitios (editor, validación, ejecución fail-closed y CHECK de BD); N11 y N12 también.
  Sigue siendo cierto que **nadie ha visto la cadena completa en vivo** ni las páginas con sesión.
- **`cron.job` 17/18/19: siguen `active = false` y no se tocaron.** Con N9 y N10 cerrados, el 17 es
  el interruptor que da vida a la fase; es decisión de despliegue del dueño.

### 15.8 Lo que sigue SIN hacer (sin cambios respecto a §14.6)

Los siete puntos de §14.6 siguen vigentes: 5 de las 14 acciones sin implementar, sin zona horaria ni
ventana de envío, sin eventos temporales de negocio, ramas `next_step_on_true/false` creadas y sin
usar, `ai_call` fuera del CHECK (depende de F6), sin seeds, y la cadena completa sin ejercer en vivo.
Punto 4 con un matiz nuevo: una condición falsa **corta** la secuencia, y ahora también corta cuando
no se puede evaluar; ramificar sigue sin implementarse.
