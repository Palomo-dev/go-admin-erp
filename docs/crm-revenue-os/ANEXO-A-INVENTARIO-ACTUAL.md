# ANEXO A — Inventario verificado del CRM (UI · BD · Backend · Integraciones) — V4

> Fecha de verificación: **2026-09-08** · Versión: **V4** (reemplaza al ANEXO-A V3 del 2026-08-31, que asumía que las tablas de telefonía/email/automatización no existían).
> Método: cuatro auditorías por subagente contra el código del repo y Supabase live `jgmgphmzusbluqhuqihj` (`audit-ui.md`, `audit-telephony.md`, `audit-messaging.md`, `audit-ai-automations.md`) + schema verificado en el brief del orquestador.
> Convención: `archivo:línea` tal como lo reportó el audit. **Nada de este documento es supuesto**; lo que no se verificó lleva la marca ⚠️ *no verificado*.
> Leyenda de estado: ✅ funciona · 🟡 funciona parcialmente / aislado · 🔴 roto · 💀 código muerto (sin importadores) · ❌ no existe.
> Secciones: §0 resumen · §1 BD · §2 rutas · §3 servicios · §4 UI · §5 integraciones/env · §6 cross-platform · §7 mapa de bugs (SEC/SCH/WIRE/UX) · §8 lo que funciona · §9 no verificado. Ronda 2 (2026-09-08, tarde): §3–§9 incorporados; hallazgos nuevos SCH-21…24, SEC-27…29, WIRE-51…53 verificados en `ANEXO-C-RECONCILIACION-2026-09.md`; conteos reales actualizados (§1.1: `messages` 255 144, `customers` 32 961, `opportunities` 26, `loss_reasons` 8).

---

## 0. Resumen en una pantalla

| Capa | Qué hay | Qué opera de verdad |
|---|---|---|
| BD | 30+ tablas del plan V3 creadas con RLS (`calls`, `call_*`, `phone_numbers`, `mobile_call_bridges`, `voice_agents`, `voice_agent_*`, `email_*`, `templates`, `sequences*`, `automation_rules/runs`, `provider_configs`, `documents`) | **Todas con 0 filas**. Vivas: `activities`, `opportunities` (25), `customers` (31 620), `conversations/messages`, `comm_settings` (31), `ai_settings`/`ai_usage_logs` (111 339), `campaigns/segments`, `calendar_events`, `automations` (1) |
| Backend | 14 rutas `voice/*`, 12 rutas `crm/calls*`, 8 email, 15 WhatsApp, 9 Twilio, 10 IA/agentes, 4 secuencias, timeline, jobs de cron existentes (no CRM) | Email individual (Resend happy path), WhatsApp desde la bandeja de chat, webhook WA inbound, SMS `twilioService.send` (sin UI), agente entrante de hotel (PMS), CRUD APIs org-scoped. **Ninguna llamada CRM ha ocurrido** |
| Servicios | ~25 servicios de voz/IA/mensajería | Cableados 14; muertos 6 (`callService`, `realtimeSession`, `elevenLabsTTS`, `deepgramSTT`, `voiceAgent/voiceAgentService`, `crm/voiceAgentTools`) |
| UI | Pipeline (Kanban `PipelineStages`), drawer 1013 L, detalle 1330 L, `ActivityActions` 844 L, softphone completo (solo en `/app/crm/llamadas`), llamadas, leads, campañas, chat reutilizable | Llamar (manual `tel:`), email (textarea HTML), reunión (insert cliente). Click-to-call 404, plantillas 404, WhatsApp 400/401, softphone nunca registra, sin agentes IA, sin secuencias, sin automatizaciones por etapa |
| Integraciones | Twilio (master), Resend (global), Meta Cloud API (por canal), Evolution/Baileys, OpenAI, Gemini, ElevenLabs/Deepgram (fetch crudo), SendGrid | `provider_configs` vacío → 100 % env global; `TWILIO_WEBHOOK_BASE_URL` con dos significados |
| Cross-platform | `mobile/` Capacitor 8 (wrapper URL remota), `electron/` v33, PWA (`manifest.json`, `sw.js`) | Sin permisos de micrófono en Capacitor; Electron sin softphone; ninguno importa `@twilio/voice-sdk` |

---

## 1. Base de datos

### 1.0 Tipos de llaves y política RLS canónica (vigente desde V3, re-verificado)

| Tabla | PK | Tipo | FK a usar |
|---|---|---|---|
| `organizations` | `id` | **integer** | `organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` |
| `branches` | `id` | integer | `branch_id integer` |
| `organization_members` | `id` | **bigint** | usar `user_id uuid`; `assigned_member_id bigint` en `conversations` sí referencia `id` |
| `auth.users` / `profiles` | `id` | uuid | `user_id uuid REFERENCES auth.users(id)` |
| `customers`, `opportunities`, `stages`, `pipelines`, `calls`, `templates`, `campaigns`, `tasks`, `activities`, `calendar_events`, `documents`, `voice_agents`, `email_messages`, `messages`, `conversations`, `channels` | `id` | uuid | `*_id uuid` |

Política canónica (patrón de `calls`, usarla igual en toda tabla nueva):

```sql
CREATE POLICY org_member_all ON <tabla> FOR ALL TO authenticated
  USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
```

Helper SQL existente: `current_org_id()`. Extensiones: `pg_cron 1.6`, `pg_net 0.14`, `vector`.

### 1.1 Telefonía (todas con 0 filas; RLS `org_member` ok)

| Tabla | Columnas verificadas (`!` = NOT NULL) y CHECKs |
|---|---|
| `calls` | `id, organization_id!, provider!, provider_call_sid, parent_call_sid, direction! CHECK (inbound|outbound), mode! CHECK (browser|bridge|ai_agent|manual|inbound), from_number!, to_number!, customer_id, opportunity_id, user_id, voice_agent_id, status! CHECK (dialing|ringing|in_progress|completed|failed|busy|no_answer|canceled|voicemail), answered_by, started_at!, answered_at, ended_at, duration_seconds, ring_seconds, recording_enabled!, consent_given!, cost_amount, cost_currency!, metadata!, created_at, updated_at, bridge_mode CHECK (agent_leg|customer_leg|full_bridge), agent_leg_sid, customer_leg_sid, duration_source! CHECK (provider|estimated|manual)` |
| `call_recordings` | `id, organization_id!, call_id!, provider_recording_sid, channels text!, duration_seconds, storage_path!, storage_provider!, size_bytes, status! CHECK (processing|ready|failed|deleted), retention_until date, created_at` — **sin `updated_at`** |
| `call_transcripts` | `id, organization_id!, call_id!, provider!, provider_model, language!, status! CHECK (pending|processing|completed|failed), full_text, word_count, confidence, speaker_count, duration_seconds, cost_amount, raw_response, error_code, error_message, started_at, completed_at, created_at, updated_at` |
| `call_transcript_segments` | `id, transcript_id!, organization_id!, speaker_label!, speaker_role, start_ms!, end_ms!, text!, confidence, sentiment` |
| `call_analyses` | `id, organization_id!, call_id!, transcript_id, provider!, model, summary, sentiment CHECK (positive|neutral|negative), sentiment_score, quality_score 0–100, quality_breakdown, talk_ratio_agent, talk_ratio_customer, longest_monologue_seconds, questions_asked, next_steps jsonb, detected_objections jsonb, detected_competitors[], budget_mentioned, decision_maker_identified, discovery_fields jsonb, suggested_stage_id text, suggested_stage_confidence, suggested_tasks jsonb, applied!, applied_by, applied_at, raw_response, created_at, updated_at` |
| `call_tags` · `call_tag_relations` | `call_tag_relations(source, confidence)` |
| `call_consents` | `call_id, consent_type, announced_at, method, locale, recorded_announcement_text` |
| `phone_numbers` | `id, organization_id!, e164!, provider!, provider_sid, capabilities jsonb!, assigned_user_id, label, is_primary!, is_active!` |
| `mobile_call_bridges` | `id, organization_id!, user_id!, agent_phone!, target_phone!, customer_id, opportunity_id, agent_leg_sid, customer_leg_sid, status! CHECK (initiating|agent_ringing|agent_answered|customer_dialing|in_progress|completed|failed|agent_no_answer|agent_rejected), confirm_digit_required!, whisper_text` |

### 1.2 Agente IA y proveedores (0 filas)

| Tabla | Columnas verificadas |
|---|---|
| `voice_agents` | `id, organization_id!, name!, slug!, description, engine! CHECK (conversation_relay|elevenlabs_agent|openai_realtime|gemini_live), purpose_type! CHECK (qualify_lead|confirm_demo|follow_up_proposal|reactivate_cold|collect_payment|nps_survey|renewal_reminder|custom), system_prompt!, first_message!, voice_provider!, voice_id, voice_settings!, language!, stt_provider!, llm_provider!, llm_model!, temperature!, max_turns!, max_duration_seconds!, allowed_tools[]!, guardrails!, transfer_to_human_rules!, business_hours!, retry_policy!, is_active!, created_by` — **ninguna de las 18 columnas de configuración se lee en tiempo de llamada** (`twiml/ai-agent/route.ts:63-66`) |
| `voice_agent_calls` | `id, organization_id!, voice_agent_id!, campaign_id, call_id, customer_id, opportunity_id, status! CHECK (pending|in_progress|completed|failed|transferred), outcome, conversation_log!, turns_count!, duration_seconds, scheduled_at, started_at, completed_at, error_message` |
| `voice_agent_campaigns` | `id, organization_id!, voice_agent_id!, name!, objective, target_source! CHECK (segment|pipeline_stage|manual_list|sequence_step|followup_due), target_config!, schedule!, max_calls_per_day!, max_concurrent!, status! CHECK (draft|scheduled|running|paused|completed), stats!` |
| `provider_configs` | `organization_id!, category! CHECK (voice|stt|tts|llm|email|whatsapp|sms|analysis|esign|calendar|video|enrichment), provider!, credentials jsonb!, settings jsonb!, is_active!, priority!` — **0 filas**; credenciales en claro |
| `ai_settings` | `organization_id!, provider!, model!, temperature, max_tokens, system_rules, tone, language, credits_remaining, purchased_credits, purchased_credits_expires_at, credits_reset_at, last_rollover_amount, auto_response_*, confidence_threshold, is_active` (vivo) |
| `ai_usage_logs` | `organization_id!, user_id, action_type!, model!, prompt_tokens, completion_tokens, total_tokens, credits_consumed!, credits_before, credits_after, metadata` — **111 339 filas** |

### 1.3 Email y plantillas (0 filas salvo `notification_templates` 15)

| Tabla | Columnas verificadas |
|---|---|
| `email_domains` | `id, organization_id!, domain!, provider!, provider_domain_id, credential_id, status! CHECK (pending|verifying|verified|failed), dns_records!, dmarc_configured!, from_name, from_email!, reply_to, is_default!, verified_at` |
| `email_messages` | `id, organization_id!, provider!, provider_message_id, template_id, to_email!, to_customer_id, cc[], bcc[], from_email!, subject!, body_html_snapshot, related_type, related_id text, sequence_step_run_id, status! CHECK (pending|sent|delivered|opened|clicked|bounced|complained|unsubscribed|failed), scheduled_at, sent_at, delivered_at, first_opened_at, open_count!, first_clicked_at, click_count!, bounced_at, bounce_type, complained_at, unsubscribed_at, idempotency_key!, cost_amount, metadata!` |
| `email_events` | `email_message_id!, event_type!, occurred_at!, payload, provider_event_id!` |
| `templates` | `id, organization_id!, name!, channel!, body_html!, variables[], subject, description, is_active, created_by, kind, metadata!` — **sin `blocks_json`**; solo la escribe `onboardingService` (`kind='onboarding'`); ningún editor |
| `notification_templates` | `organization_id, channel, name, subject, body_html, body_text, variables, version` — 15 filas; editor real en `components/notificaciones/plantillas/PlantillaEditorDialog.tsx` (HTML crudo + chips `{{var}}` + preview `:166-183`) |

### 1.4 Mensajería / chat (vivo)

| Tabla | Columnas verificadas |
|---|---|
| `conversations` | `id, organization_id!, channel_id!, customer_id!, status! CHECK (open|pending|closed|archived), priority, assigned_member_id bigint, last_message_at, last_agent_message_at, message_count, unread_count, metadata, branch_id` |
| `messages` | `id, organization_id!, conversation_id!, channel_id!, direction! CHECK (inbound|outbound), role! CHECK (customer|agent|ai|system), sender_customer_id, sender_member_id bigint, content_type! CHECK (text|image|file|audio|video|location|template), content!, payload, external_message_id, is_read, read_at, metadata, branch_id` |
| Triggers en `messages` | `trg_channel_dispatch` (→ Edge Function `channel-dispatch`), `trg_ai_auto_response`, `trg_auto_tag_conversation`, `trg_consume_ai_credits_on_message`, `trg_update_customer_channel_identity`, `update_conversation_last_message`, `calculate_first_response_time` |
| `channels` | `id, organization_id!, type! CHECK (website|whatsapp|instagram|facebook), name!, status!, public_key, ai_mode! CHECK (auto|hybrid|manual), business_hours, integration_connection_id` |
| `channel_credentials` | `channel_id, provider, credentials jsonb, is_valid, connection_method` — en claro; leído con cliente anon (`chatChannelsService.ts:192-197,236-241`) |
| `customer_channel_identities` | `customer_id, channel_id, identity_type, identity_value, verified` |
| `message_events` | `message_id, event_type, provider_payload, error_code, error_message, correlation_id, event_time` |
| `whatsapp_qr_sessions` | Baileys/Evolution |

Dos shapes incompatibles en `messages` (msg C20): path vivo `{direction, role, channel_id, content, sender_member_id}` (`bandeja/page.tsx:336-345`, `conversationDetailService.ts:243-252`; el dispatcher lee `msg.content` en `channel-dispatch/index.ts:222,275`) vs rutas WA `{sender_type, role, content_type, payload}` sin `direction/channel_id/content` (`whatsapp/send/route.ts:114-123`, `qr/send:25-34`, inbound `whatsappCloudService.ts:413-423`) → el inbound tiene `payload.text` sin `content` y la bandeja filtra por `content` (`bandeja:96`, `SearchPanel:59`).

### 1.5 Automatización, secuencias y campañas

| Tabla | Columnas verificadas | Filas |
|---|---|---|
| `sequences` | `id, organization_id!, name!, description, trigger_type! CHECK (manual|lead_capture|stage_change|custom), trigger_config!, exit_conditions!, is_active!` | 0 |
| `sequence_steps` | `sequence_id!, step_number!, delay_days!, channel! CHECK (email|whatsapp|sms|call|task|wait|condition), template_id, action_config!, is_active!` — sin `ai_call` | 0 |
| `sequence_enrollments` | `sequence_id!, opportunity_id, customer_id, status! CHECK (active|paused|completed|exited), enrolled_at!, exited_at, exit_reason` | 0 |
| `sequence_step_runs` | `enrollment_id!, step_id!, status!, scheduled_at!, executed_at, result, error_message` | 0 |
| `automation_rules` | `id, organization_id!, name!, description, trigger_type! CHECK (stage_change|field_change|schedule|event|manual), trigger_config!, conditions!, actions!, is_active!, priority!` | 0 |
| `automation_runs` | `automation_rule_id!, trigger_type!, trigger_payload, status!, started_at, completed_at, result, error_message` | 0 |
| `automations` (legacy) | `trigger_json, actions_json, active, last_run_at, executions_count` | 1 |
| `stage_automations` | ❌ **no existe** (la asume `AutomationSettings.tsx:86,155,165`) | — |
| `campaigns` | `id, organization_id!, name!, channel CHECK (email|whatsapp), status CHECK (draft|scheduled|sending|sent), scheduled_at, template_id, segment_id, content, statistics, created_by` | ⚠️ no verificado |
| `campaign_contacts` | `campaign_id, customer_id, state CHECK (sent|opened|clicked|replied|bounced), sent_at, opened_at, clicked_at, replied_at, bounced_at, metadata` — solo lectura en `CampanasService.ts:187`; **nunca escrita** | 0 ⚠️ |
| `segments` | `filter_json, is_dynamic, customer_count, last_run_at` | vivo |
| Funciones | `fn_campaign_mark_sent/opened/clicked/replied/bounced(p_campaign_id, p_customer_id)`, `fn_get_campaign_metrics` | existen |

### 1.6 Núcleo CRM (vivo)

| Tabla | Columnas verificadas relevantes | Notas |
|---|---|---|
| `activities` | `id, organization_id int!, activity_type! CHECK (call|email|whatsapp|visit|note|system), user_id, notes, related_type, related_id uuid, occurred_at, created_at, updated_at, metadata jsonb, channel, outcome, duration_seconds, branch_id` | RLS 4 políticas. **Sin `title`/`description`** (los usan `crm/voiceAgentTools.ts:87-88,207-208,257-258`, `followupEngineService.ts:420-421,491-492`). `channel/outcome/duration_seconds` existen pero `opportunitiesService.createActivity:571-594` nunca los escribe |
| `opportunities` | `id, organization_id!, pipeline_id!, stage_id!, customer_id, name!, amount, currency, expected_close_date, status CHECK (open|won|lost), loss_reason, created_by, salesperson_id, commission_*, metadata, source, vertical_id, next_contact_at, billing_cycle_months, parent_opportunity_id, score_total, score_data, temperature, icp_band, icp_fit_score, record_type! CHECK (lead|deal), last_contact_at, contact_channel, contact_result, objection_id, loss_reason_value, competitor_name, competitor_price, missing_features[], recontact_at, discovery_data!, closed_at, deal_type, win_data, next_action, sales_team_id, territory_id, branch_id` | **`name`, no `title`** (`callAnalysisService.ts:363` usa `title`). Triggers: `fn_log_stage_change` (→ `opportunity_stage_history`), `fn_sync_status_from_stage`, `fn_opportunities_set_closed_at`, `fn_create_commission_on_opportunity_won`, `fn_notify_opportunity_changed`, `notify_forecast_update` |
| `stages` | `id, pipeline_id!, name!, position!, probability, color, description, sla_days, exit_criteria jsonb, is_won, is_lost` | |
| `pipelines` | `…, pipeline_type` (sales/onboarding/renewal por plantilla, `pipelineTemplates.ts`) | |
| `customers` | `id, organization_id, branch_id, email, phone, first_name, last_name, full_name (nullable), company_name, customer_type!, lifecycle_stage!, health_score, tags[], metadata, preferences, avatar_url, vertical_id, company_size, current_software…` | **Sin `timezone`, sin `do_not_call`, sin `name`** (`crm/voiceAgentService.ts:592,616,781`; `callAnalysisService.ts:349`). `metadata.do_not_email` escrito por `emailService.ts:799`. 31 620 filas |
| `tasks` | `id, organization_id!, title!, description, due_date, assigned_to, priority CHECK (low|med|high|critical), status CHECK (open|in_progress|done|canceled), created_by, start_time, related_to_id uuid, related_to_type text, remind_*, type, completed_at, customer_id, parent_task_id, project_id, tags[]` | `related_to_id/related_to_type` (no `related_id/related_type`): rotos en `automationService.ts:499-500`, `sequenceService.ts:616-617`, `crm/voiceAgentTools.ts:127-128,329-330`, `followupEngineService.ts:437-438`; correcto en `callAnalysisService.ts:696-697`. `status 'pending'` inválido en `sequenceService` |
| `notes` | `user_id!, body!, related_type, related_id, is_pinned` | |
| `documents` | `organization_id!, folder_id, name!, file_path!, file_type!, mime_type, uploaded_by, related_type!, related_id text!, tags[]!, is_confidential!` | bucket `crm-documents` (privado) existe |
| `calendar_events` | `organization_id, branch_id, title, description, location, start_at, end_at, all_day, timezone, recurrence_rule, assigned_to, customer_id, event_type, color, status, metadata, created_by` | insert desde el cliente en `ActivityActions.tsx:741-760` |
| `profiles` | `id, email, first_name, last_name, avatar_url, phone, metadata, preferred_language, last_org_id` | `phone` existe; nadie lo lee para el bridge |
| `organization_members` | `id bigint, organization_id, user_id, role_id, job_position_id, is_active` | |
| `opportunity_stage_history` | trigger `fn_log_stage_change` | 1 política RLS (revisar) |

### 1.7 Configuración y créditos

| Tabla | Columnas verificadas | Notas |
|---|---|---|
| `comm_settings` | `id, organization_id!, sms_remaining, whatsapp_remaining, voice_minutes_remaining, twilio_subaccount_sid, twilio_subaccount_auth_token, phone_number, whatsapp_number, voice_agent_enabled, voice_agent_config jsonb, is_active, credits_reset_at, voice_twiml_app_sid, voice_recording_enabled!, voice_recording_retention_days!, voice_consent_message!, voice_caller_id, voice_ring_timeout_seconds!, voice_max_concurrent_calls!` | RLS select+update. **31 filas** → el fallback "primera org activa" apunta a una org real. `getCommSettings` (`twilioSubaccounts.ts:9`) usa cliente anon en servidor → `null` → `voice_recording_enabled` cae a `false` |
| `comm_usage_logs` | `channel!, credits_used, twilio_message_sid, recipient!, status, direction, module, metadata` | |
| RPC existentes | `decrement_ai_credits(p_org_id, p_cost)`, `deduct_ai_credits(p_organization_id, p_amount)`, `deduct_comm_credits(p_org_id, p_channel, p_amount)`, `fn_call_quality(p_org_id, p_start, p_end, p_user_id)`, `fn_revenue_metrics`, `fn_pipeline_funnel`, `fn_customer_health`, `fn_create_org_notification(...)`, `current_org_id()` | `consumeAICredits` (`aiCreditsService.ts:209-234`) hace read-modify-write en vez de usar el RPC |
| `ai_credits` | ❌ no existe (lo asume `voiceAgentService.hasAICredits`, `crm/voiceAgentService.ts:529-541` lee `ai_settings`) | |

### 1.8 Cron, buckets, Edge Functions

| Elemento | Estado |
|---|---|
| `pg_cron` | 7 jobs; **ninguno CRM**. Existe `reset-monthly-ai-credits` |
| `vercel.json` | 10 crons; **ninguno CRM** (`sequences/run`, `followup/run`, `campaigns/run` nunca invocados) |
| Storage | `crm-documents` (privado) ✅ · `attachments`, `chat-images` ✅ · **`crm-call-recordings` ❌ no existe** (lo asume `recordingStorageService.ts:18`) · `ai-generated/{org}` escrito por `generate-image` |
| Edge Function | `supabase/functions/channel-dispatch/index.ts` (311 L): `sendWhatsApp` (:50-78), `sendMeta` (:81-115), Evolution/Baileys (:198-258); lee `msg.content` (:222,275); escribe `message_events` + `messages.metadata.dispatched` |

### 1.9 Columnas y tablas que el código asume y NO existen

| Referencia en código | Realidad |
|---|---|
| `customers.timezone`, `customers.do_not_call`, tabla `do_not_call_list` (`crm/voiceAgentService.ts:517,592,616,781`) | ❌ → campañas del agente encolan nada |
| `customers.name` (`callAnalysisService.ts:349`), `opportunities.title` (`:363`) | ❌ (`full_name`/`first_name`; `name`) → prompt sin catálogo de etapas → `suggested_stage_id` alucinado |
| `activities.title/description` | ❌ |
| `activities.activity_type` ∈ `stage_change`, `email_sent`, `transfer` (`crm/voiceAgentTools.ts:86,206,256`), `follow_up`, `reminder`, `automation_log` (`followupEngineService.ts:419,209,490`), `meeting` (`actividades/types.ts`) | ❌ CHECK solo `call|email|whatsapp|visit|note|system` |
| `calls.phone_number` (`mobileBridgeService.ts:183-195`, `bridge/status:144-159`, `voiceAgentService.ts:861-871`) | ❌ (y faltan `from_number/to_number` NOT NULL) |
| `calls.mode` ∈ `click-to-call|voice-agent|power-dialer`; `status` ∈ `queued|in-progress|no-answer` (`callManagementService.ts:15-24`, `voice/call:113,119`, `voice/status:143-164`) | ❌ CHECK |
| `call_recordings.updated_at` (`callManagementService.ts:449`); `status 'completed'` (`voice/recording:182-195`); `status 'available'` (`transcriptionService.ts:365`) | ❌ |
| `stage_automations` (`AutomationSettings.tsx`) | ❌ |
| `tasks.related_id/related_type`, `tasks.status 'pending'` | ❌ |
| `templates.blocks_json` | ❌ (F7 la crea) |
| `user_profiles` (`callService.ts:262`) | ❌ (es `profiles`) |
| `voice_agents.purpose_type` ∈ `follow_up|survey` (TS) | ❌ CHECK |
| `sequence_steps.channel = 'ai_call'` | ❌ CHECK |
| `call_analyses.sentiment = 'mixed'` (zod `:79`, Gemini enum `:212`) | ❌ CHECK → 23514 en `:471` |

### 1.10 RLS a revisar en F0

`scoring_configs`, `loss_reasons`, `health_score_configs`, `health_score_snapshots`, `opportunity_stage_history`, `opportunity_products`, `opportunity_spaces`: 1 sola política cada una (verificar que sea `FOR ALL` con `USING` + `WITH CHECK`). El resto de tablas del CRM tiene políticas `org_member` completas.

**Verificado en ronda 2 (`ANEXO-C` §2)**: las siete anteriores más `verticals` y `ai_credit_purchases` son `FOR ALL` (las `org_member_all` con `WITH CHECK` explícito; las `*_org_isolation` con `WITH CHECK` NULL, que Postgres resuelve con `USING`) → sin agujero de escritura. `loss_reasons` tiene además `loss_reasons_global_select` (`is_global = true`). La única realmente incompleta es **`comm_usage_logs`: solo `SELECT`** → toda escritura debe venir del service role (hoy `twilioService.ts:172` escribe con el cliente browser y se pierde: SEC-27). `provider_configs` tiene 4 políticas de escritura para `authenticated` (WIRE-51).

---

## 2. Backend: rutas verificadas

Auth: `sesión` = `getServerOrgContext()` (`src/lib/utils/orgContext.ts:24`, devuelve `{organizationId, userId, supabase}`; toma la membresía más antigua con `.limit(1)` si no llega `X-Organization-Id`, `:58-66`); `firma` = validación `X-Twilio-Signature`/Svix/Meta; `SR` = service role; `cron` = `CRON_SECRET`.

### 2.1 `src/app/api/voice/**`

| Ruta | Auth | Resolución de org | Escribe | Estado / problema |
|---|---|---|---|---|
| `POST token` | sesión `:15` | registry `provider_configs` | — | 🔴 exige `TWILIO_API_KEY/API_SECRET/TWIML_APP_SID` de `provider.credentials` (`voiceTokenService.ts:44-56`); registry fallback solo SID/TOKEN (`providerRegistry.ts:18`) → 500 |
| `POST call` | sesión `:27` | — | `calls :107` | 🔴 `mode 'click-to-call'` (`:113`) + `status 'queued'` (`:119`) violan CHECK; URLs con `TWILIO_WEBHOOK_BASE_URL` + path completo (`:88-91`) |
| `POST status` | firma `:33-41` (**se salta si falta `TWILIO_MASTER_AUTH_TOKEN`** `:36`) | `resolveOrgFromExternal(callSid,'call_sid') :55` | `calls :70,:120` | 🔴 crash C0 (`orgContext.ts:89-93`); mapeo a valores inválidos `:143-164` |
| `POST recording` | firma `:39-47` | `resolveOrgFromExternal :61` | `calls :76`, `call_recordings :95-139`; upload fire-and-forget `:153` | 🔴 C0; `status 'completed'` `:182-195`; `channels` parseInt/null `:36,109,127`; `storage_path` null `:112,131` |
| `GET recording/[id]/stream` | sesión `:33` | — | — | ✅ 302 a signed URL (bucket inexistente) |
| `POST twiml/outbound` | firma `:33-41` | `resolveOrgFromExternal :47` | lee `calls`, `comm_settings :65`; fallback `buildBasicOutboundTwiml :55` | 🔴 C0; `<Dial><Number>{To}</Number>` `:121-123` duplica la marcación del leg browser (C10) |
| `POST twiml/inbound` | firma `:31-39` | `resolveOrgFromExternal(to,'phone')` → `phone_numbers` | `comm_settings :61`, insert `calls :66` | 🔴 C0; `<Dial><Client>incoming</Client>` hardcodeado `:130` (los tokens usan identity = userId, `voiceTokenService.ts:68`) |
| `POST twiml/agent-leg` | firma `:38-46` | SR `:17-24` + `bridgeId` query | lee `mobile_call_bridges :63,:82`, `customers :92` | 🟠 sin org check (`:63-68`, PII `:92-102`); `&` sin escapar `:131` (error 12100); URL con path duplicado `:113,130-131` |
| `POST twiml/customer-leg` | firma `:37-45` | SR + `bridgeId` | `mobile_call_bridges :61,:82,:102` | 🟠 sin org check `:61-65`; `&` `:117`; `<Dial record="record-from-answer-dual">` `:112-121` ✅ |
| `POST twiml/ai-agent` | firma `:38-46` (**salta si falta token** `:41-42`) | SR + `agentId/callId` | `voice_agents :63`, `voice_agent_calls :83` | 🟠 selecciona solo `id,name,language,is_active,first_message,organization_id` (`:63-66`); update `voice_agent_calls` por id sin org (`:84-91`); `<ConversationRelay url="${WS_SERVER_URL}/conversation-relay">` sin `ttsProvider/voice` (`:94-110`) |
| `POST bridge/initiate` | sesión `:16` | — | `mobile_call_bridges`, `calls` | 🟡 sin UI; `agent_phone` del body (`mobileBridgeService.ts:19`) |
| `POST bridge/status` | firma `:65-73` | SR + `bridgeId :61` | `calls :121,:134` sin `organization_id`; `:144-159` insert con `phone_number` | 🔴 `status` crudo Twilio `:110`; `leg=ai_agent` sin `bridgeId` → early return `:75-77` (C18) |

### 2.2 `src/app/api/integrations/twilio/**`

| Ruta | Auth | Problema |
|---|---|---|
| `POST voice/incoming` | firma solo si `NODE_ENV==='production'` `:33` | 🔴 org por `comm_settings.phone_number :120-143` con fallback "primera org activa" `:131-140`; `comm_usage_logs organization_id: orgId||0 :57`; `language="en-US" :111`; asume prefijo en `:35`. Duplica `voice/twiml/inbound` |
| `GET voice/media-stream` | — | 💀 HTTP 410 |
| `POST send-sms` · `send-whatsapp` | sesión ✗: `orgId` del body sin membership (`send-whatsapp:29-38`, `send-sms:30-39`) | 🔴 IDOR; `send-sms` sin callers; `send-whatsapp` 1 caller roto |
| `POST status-callback` | firma en prod `:24-31` | 🟡 → `comm_usage_logs.status` (`twilioWebhook.ts:78-81`) |
| `POST incoming-message` | firma solo prod `:28-34` | 🟠 TwiML sin escapar `:50-53`; sin STOP/BAJA (`twilioWebhook.ts:37-70`) |
| `POST verify/send` · `verify/check` | **sin auth** `:9-25`; excluidos en `middleware.ts:83,778` | 🔴 SMS pumping con cuenta master |
| `GET credits` · `usage` | sesión | ✅ |

### 2.3 `src/app/api/crm/**`

| Ruta | Auth | Estado |
|---|---|---|
| `GET/POST calls` · `GET/PATCH calls/[id]` | sesión | ✅ lectura (0 filas) |
| `POST calls/[id]/transcribe` · `GET transcript` · `POST analyze` · `GET analysis` · `POST analysis/apply` · `tags` · `call-tags` | sesión | 🟡 correctos pero sin caller automático; `transcribeCall`/`analyzeCall` tienen 1 caller cada uno (su ruta); no debitan créditos; `applyAnalysis` escribe `opportunities.stage_id :671` y `tasks :701`, nunca `activities` |
| `POST transcribe` | sesión ok pero resultado descartado `:13` | 🟡 Gemini `gemini-2.0-flash :139-147` → Whisper `:208`; no persiste; usado por `ActivityActions.tsx:249` |
| `phone-numbers` · `call-quality` | sesión | ✅ (`fn_call_quality` firma coincide) |
| `voice-agents` · `[id]` · `campaigns` · `campaigns/[id]` · `voice-agent-calls` | sesión | ✅ CRUD org-scoped; sin UI |
| `POST voice-agents/campaigns/run` | cron fail-closed `:28-42` | 🟡 nunca programado; `runCampaignQueue` roto por schema (C-1) |
| `sequences/**` (4 rutas) · `POST sequences/run` | sesión / cron fail-closed `:14-21` | 🟡 headless; no en `vercel.json` |
| `POST followup/run` | **fail-open** `:18-27` (`if (expectedToken)`), `organization_id` del body | 🔴 |
| `GET timeline/[type]/[id]` | sesión | 🟡 6 fuentes con cursor (`timelineService.ts:99,141,181,220,261,302`); **0 consumidores**; WhatsApp solo si `entityType==='customer'` (`:300`) |
| `POST ia/next-action` · `ia/discovery-summary` | sesión ✅ | 🟡 `gpt-4o-mini` (`:246`, `:213`); sin créditos; sin UI |
| `POST leads/[id]/convert` | sesión | ✅ |
| `health/recalculate` · `renewals/sync` | cron | ✅ |
| `automation_rules` | ⚠️ ruta no verificada en los audits ("solo POST manual"; `evaluateTrigger :223` sin caller) | 🟡 |

### 2.4 Email

| Ruta | Auth | Estado |
|---|---|---|
| `POST /api/email/send` (60 L) | sesión | ✅ happy path → `emailService.sendEmail`: provider `:231`, `email_messages pending :297`, `activities :311-327`, Resend `:364-367`, sent `:384-394`. Requiere `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS` globales |
| `POST /api/email/webhook` (53 L) | Svix `:675-683`, SR | ✅ idempotencia `provider_event_id :695-707`, `email_events :724-735`, status `:743-778` (sobrescribe con último evento; counts stale `:757,761`), `do_not_email :781-811` |
| `GET /api/email/messages` · `/[id]?events=true` | sesión | ✅ sin consumidor UI |
| `/api/email/domains` · `/[id]` PATCH | sesión | 🔴 `createEmailDomain :530-563` escribe `pending` sin llamar a Resend; `dns_records` vacío; `resolveDefaultDomain :195-210` siempre `null` → todo sale de `EMAIL_FROM_ADDRESS :239-240` |
| `GET /api/email/templates` | — | ❌ **no existe** (`ActivityActions.tsx:478`) |
| `/api/integrations/sendgrid/{send,webhook,templates,stats,bounces,health-check}` | `send:20-51` org del body; `webhook:31-38` firma opcional, `:60-74 connections[0]` | 🔴 stack paralelo; `emailService:404-405` lanza "Provider no soportado" para sendgrid |
| `POST /api/notifications/process` | `:23-32` org del body | 🔴 |

### 2.5 WhatsApp

| Ruta | Auth | Estado |
|---|---|---|
| `POST /api/integrations/whatsapp/send` | **sin `getServerOrgContext`** `:7-38`; `channel_id`/`organization_id` del body; SR | 🔴 IDOR; inserta `messages` con shape `{sender_type, role, content_type, payload}` `:111-130` |
| `GET/POST /api/integrations/whatsapp/webhook` | GET verify `:6-21` ✅; POST **sin verificar firma** (`:27` lee header, `:36-38` "se salta") | 🔴; `processWebhookPayload` (`whatsappCloudService.ts:340-378`) ignora `change.field !== 'messages'` (`:345`) → `message_template_status_update` descartado; inbound → `customers` find-or-create `:479-540`, `customer_channel_identities`, `conversations :543-577`, `messages :413-423`, statuses → `message_events :433-476` |
| `GET /api/integrations/whatsapp/templates` | ownership ✅ `:34-46` | 🟡 read-only (`listTemplates :221-237`); sin crear/aprobar |
| `validate` · `mark-read` | sesión sin authz de `channel_id` / sin org | 🟠 / 🔴 |
| `oauth/callback` | Embedded Signup existente | ✅ |
| `qr/{start,stop,status,logout}` | mismo patrón IDOR que `send` | 🔴 |
| `qr/send` · `qr/mark-read` | — | 💀 sin callers |
| `POST qr/inbound` | `mapEvolutionWebhook :119-207` → `processInboundCallback` | ✅ |
| `POST qr/dispatch-pending` | **sin org, SR, sin `CRON_SECRET`** `:9-40`; polled cada 5 s desde `bandeja/page.tsx:57-67`; throttle `slice(0,1)` | 🔴 |
| Métodos inalcanzables | `verifySignature` (`whatsappCloudConfig.ts:71-82`, `===`), `sendImage/sendDocument/getMediaUrl/downloadMedia` | 💀 |

### 2.6 IA y asistentes

| Ruta | Auth | Créditos | Modelo | Estado |
|---|---|---|---|---|
| `POST /api/chat/ai/auto-response` | **sin auth** `:9-21`; SR `:21`; org del body `:12` | debita `:181` | gpt-4o-mini | 🔴 |
| `POST /api/chat/ai/{generate-response,classify-intent,generate-summary}` | user ✅, org del body `:11-17` | `consumeAICredits` SR | gpt-4o-mini | 🔴 |
| `POST /api/ai-assistant/{improve-text:17, generate-image:8, pm-assist:59-60, pm-planner:48, seo-keywords:18-26, chat:6, reportes:11}` | sin auth / org del body | improve-text, generate-image, pm-*, seo sí debitan; chat/reportes no | gpt-4o-mini, dall-e-3 | 🔴 |
| `POST /api/ai-assistant/transcribe` | — | RPC `decrement_ai_credits` | whisper-1 `:106` | 🟡 |
| `GET /api/ai-assistant/dynamic-options` | JWT anon hardcodeado `:6` | — | — | 🔴 |
| Loop LLM de ConversationRelay | — | `deduct_comm_credits` `conversationRelayHandler.ts:410-414`; **nunca `ai_settings`** | gpt-4o `:275,381`, `max_tokens 200 :286` | 🟡 |

### 2.7 ws-server (Railway)

`ws-server.ts` (75 L): `/conversation-relay :41`, `/health :29`, `WS_PORT 8080`; **sin autenticación en el upgrade** (`:41-48`). Railway `WS_SERVER_URL=wss://go-admin-erp-production.up.railway.app`. `ws-server.Dockerfile` (`node:20-slim`): `npm init -y && npm install ws dotenv openai @supabase/supabase-js twilio tsx typescript` **sin lockfile**; copia solo `integrations/twilio/` + `commCreditsService` + `ws-config.ts→config.ts`; **no copia `src/lib/services/crm/**`** ni instala `zod`/`resend` → cualquier import CRM en el handler crashea en Railway. `railway.toml` presente. Script `npm run ws:test` → `scripts/test-conversation-relay.ts`.

### 2.8 Utilidad de contexto

`src/lib/utils/orgContext.ts`: `getServerOrgContext()` `:24` ✅ (con la salvedad `:58-66`); `resolveOrgFromExternal(value, kind)` `:85` 🔴 usa `createServerClient` de `@supabase/ssr` sin opción `cookies` (`:89-93`) → throw "must be initialized with cookie options"; el patrón correcto (`createClient` de `@supabase/supabase-js` con service role) ya existe en `twiml/agent-leg/route.ts:17-24`.


---

## 3. Servicios: cableados vs muertos

### 3.1 Telefonía / voz (`src/lib/services/`)

| Servicio | Líneas | Estado | Consumidores / problema |
|---|---|---|---|
| `crm/callManagementService.ts` | 589 | 🟡 cableado | Uniones TS inválidas vs CHECK (`:15-24`); escribe `call_recordings.updated_at` (`:449`) → todo update falla (incl. `deleteRecording :217`, `downloadAndUploadRecording :261`) |
| `crm/voiceTokenService.ts` | 77 | 🔴 | Exige API Key/Secret/TwiML App de `provider.credentials` (`:44-56`); identity = userId (`:68`) |
| `crm/recordingStorageService.ts` | 280 | 🔴 | Bucket `crm-call-recordings` inexistente (`:18`); `status 'ready'` válido (`:268`) pero no en la unión TS (`:126`) |
| `crm/transcriptionService.ts` | 637 | 🔴 | Deepgram nova-2 (`:95-107`) / ElevenLabs `scribe_v1` (`:236-247`); filtra `status='available'` (`:365`) → `NO_RECORDING :380`; bucket desde `storage_path` (`:415-417`); heurística speaker 0 = agente (`:156,184,208,282,302`); idioma `'es'` hardcodeado (`:98,240`); `transcribeWithElevenLabs` sin language (`:444`); consumidor registry `:431` |
| `crm/callAnalysisService.ts` | 756 | 🟡 | Gemini 2.5 Flash con `responseSchema` (`:197-285`) + zod (`:77-123`) ✅; `customers.name` (`:349`), `opportunities.title` (`:363`) ❌; `sentiment 'mixed'` → 23514 (`:471`); `applyAutoTags :510-558`; `applyAnalysis :633-730` (tasks con columnas correctas `:696-697`; `suggested_stage_id` sin validar `:671`) |
| `crm/callTagService.ts` | — | ✅ | |
| `crm/mobileBridgeService.ts` | 392 | 🔴 | Solo `bridge/initiate`; `agent_phone` del body (`:19`); `calls.phone_number` (`:183-195`); URL con path duplicado (`:159-160`); registry `:85`, credenciales `:89-96` |
| `crm/voiceAgentService.ts` | 921 | 🔴 | `runCampaignQueue :644-892` completo "en papel" (ventana `:471`, max_concurrent/day `:706-710`, créditos `:672,:773`, horario `:546`, DNC `:511`) pero roto por `customers.timezone/do_not_call` (`:592,616,781`), `do_not_call_list :517`, `calls.phone_number :861-871`, statusCallback a `bridge/status?leg=ai_agent` (`:843`), URLs `:838,843`; `hasAICredits :529-541` |
| `crm/voiceAgentTools.ts` | 491 | 💀 | **0 importadores**. Tools `move_opportunity_stage` (respeta `stageGateService`), `create_task`, `send_followup_message` (sms/whatsapp reales vía `twilioService.send`; email STUB `:202-212`), `transfer_to_human`, `get_customer_context`; allow-list `:438`; inserts inválidos en `activities` (`:86-88,206-208,256-258`) y `tasks` (`:127-128,329-330`) |
| `integrations/twilio/voiceAgent/conversationRelayHandler.ts` | 515 | 🟡 vivo (único consumidor `ws-server.ts:21`) | Descarta `agentId/callId` (`:105-106`); `handleSetup :179-180` solo `orgId`; prompt desde `comm_settings.voice_agent_config` (`:462-479`) = hotel/PMS (`voiceAgentPrompts.ts:34-68`); tool calls malformados (`:356-359`, `mapToOpenAIMessages :83-95`); `.single()` multi-fila (`:191-195,459,465`); `findOrgByNumber` fallback (`:493-502`); `process.env` directo (`:101-103`); gpt-4o `:275,381`; `max_tokens 200 :286` |
| `…/voiceAgent/voiceAgentTools.ts` (PMS) | — | 🟡 vivo | `check_availability`, `create_reservation`, `lookup_reservation`, `cancel_reservation`, `get_business_info`, `transfer_to_agent` (devuelve JSON, nunca transfiere), `take_message` (`:28-138`) |
| `…/voiceAgent/voiceAgentService.ts` (Media Stream) | — | 💀 | media-stream → 410; `deduct_comm_credits :170-174` |
| `…/voiceAgent/realtimeSession.ts` | — | 💀 | `gpt-4o-realtime-preview` + header `OpenAI-Beta realtime=v1` (`:49-61`) — modelo **apagado 2026-05-07**; whisper-1 `:104` |
| `…/voiceAgent/elevenLabsTTS.ts` | — | 💀 | `eleven_turbo_v2` (`:34,81`) deprecado |
| `…/voiceAgent/deepgramSTT.ts` | — | 💀 | |
| `callService.ts` (raíz) | 292 | 💀 | Solo `guardrails.test.ts:202`; `organizationId:1` (`:270,292`), `user_profiles :262`; único código que convertía llamada en activity (`createCallActivity :87-109`) |
| `integrations/twilio/{twilioConfig,twilioWebhook,twilioSubaccounts,twilioService,twilioVerifyService}.ts` | — | 🟡 | `twilioConfig.ts:83` `getWebhookBaseUrl()` devuelve `…/api/integrations/twilio`; `defaultCountryCode '+57' :89`; `twilioWebhook.ts:25` valida con token MASTER; `:151-163` fallback org aleatoria; `twilioService.ts:9`, `twilioWebhook.ts:9`, `twilioSubaccounts.ts:9` usan cliente browser en servidor; `twilioService.send :31-99` ✅ (`deduct_comm_credits :146`, subcuenta/master `:53-55`, `comm_usage_logs :172`) |
| `providerRegistry.ts` | — | 🟡 | 12 categorías = CHECK; resolución por org `:57-75`; fallback env `:16-29`; keys placeholder cuentan como activas (`:80`); secretos leídos con cliente anon (`:57-73`). **Solo 7 consumidores**: `voice/call:57`, `callAnalysisService:396`, `emailService:231`, `mobileBridgeService:85`, `transcriptionService:431`, `voiceAgentService:900`, `voiceTokenService:37`; el resto lee `process.env` |
| `timelineService.ts` | 355 | 💀 (0 consumidores) | 6 fuentes: activities `:99`, tasks `:141`, notes `:181`, calls `:220`, email_messages `:261`, messages `:302` (solo customer `:300`) |

### 3.2 Email / mensajería

| Servicio | Líneas | Estado | Problema |
|---|---|---|---|
| `crm/emailService.ts` | 815 | 🟡 | `resolveDefaultDomain :195-210` siempre null; `renderTemplate :182-190` `{{\w+}}` sin rutas con punto, sin defaults, sin escape; `generateIdempotencyKey :172-176` = `Date.now()+random`; `template_id` → `sendPayload.template` (no existe en SDK) `:352-356`; `:257` acepta `template_id` como contenido → payload sin html → failed; `createEmailDomain :530-563` no llama a Resend; `handleEmailWebhook :663-815` ✅; `do_not_email` escrito `:799` nunca leído; `SendEmailInput :103-119` sin adjuntos; sendgrid lanza `:404-405` |
| `integrations/sendgrid/sendgridService.ts` | — | 🟡 paralelo | `getCredentials :29-49` lee `integration_credentials.secret_ref` plano |
| `notificationService.ts` | — | 🟡 | `:380` notificaciones → SendGrid; cliente browser en servidor |
| `integrations/whatsapp/whatsappCloudService.ts` | 671 | 🔴 | `processWebhookPayload :340-378` enruta bien, pero **`processIncomingMessage :413-423` inserta en `messages` columnas inexistentes (`sender_type`, `sender_id`, `external_id`, `status`) y `role: 'user'` (CHECK `customer|agent|ai|system`), sin `direction/channel_id/content` NOT NULL → 42703/23502: el inbound Cloud API nunca persiste** (SCH-21; los 37 mensajes `whatsapp` en BD entraron por bandeja/Evolution); `processStatusUpdate :437` busca `external_id` (la columna es `external_message_id`) → estados nunca se aplican (SCH-22); `listTemplates :221-237` read-only; `sendImage/sendDocument/getMediaUrl/downloadMedia` inalcanzables |
| `integrations/whatsapp/whatsappQrService.ts` | 540 | 🟡 | Evolution/Baileys; `mapEvolutionWebhook :119-207` |
| `whatsappCloudConfig.ts` | — | 🟡 | `verifySignature :71-82` (`===`) nunca invocada; `WHATSAPP_RATE_LIMITS/TIERS :56-69` no leídos |
| `whatsappSyncService`, `whatsappClientService`, `whatsappCloudTypes` | — | 🟡 | |
| `chatChannelsService.ts` | — | 🔴 | `select('*')` de `channel_credentials` con cliente anon (`:192-197,236-241`) |
| `conversationsService`, `conversationDetailService` (`:243-252` shape vivo), `chatChannelsService`, `newConversationService` | — | ✅ | path vivo de la bandeja |
| `components/crm/campanas/CampanasService.ts` | 268 | 🔴 | "enviar" = `UPDATE status='sending'` (`:247-263`); `campaign_contacts` solo lectura (`:187`) |
| `components/crm/segmentos/SegmentosService.ts` | 284 | ✅ | `getSegmentCustomers :171-201`, `previewFilter`, `applyFilter` evalúan `filter_json` |

### 3.3 IA y automatización

| Servicio | Líneas | Estado | Problema |
|---|---|---|---|
| `openaiService.ts` | — | 🟡 | gpt-4o `:98`; precios hardcodeados `:337-345`; singleton a nivel módulo `:3` (también `next-action:18`, `discovery-summary:18`) |
| `aiCreditsService.ts` | — | 🟡 vivo | `checkAICredits :106`; `consumeAICredits :200` read-modify-write (`:209-234`); `ai_usage_logs :242` |
| `aiSettingsService.ts` | — | 🟡 | `:66-82` ofrece anthropic/gemini; `openaiService` los envía a `api.openai.com` → 400 |
| `crm/automationService.ts` | — | 🟡 sin productor | `evaluateTrigger :223` sin caller; `executeAction :458-577`: `send_email ✅ (:474)`, `create_activity ✅`, `enroll_sequence ✅`, `update_field` tabla arbitraria (`:534-547`), `create_task` columnas erróneas (`:499-500`); sin sms/whatsapp/call |
| `crm/sequenceService.ts` | — | 🟡 headless | `processStepRun :558-645`: email ✅ (`:575`), task ⚠️ (`:616-617` + `status 'pending'`), wait ✅, condition ❌ (`:637-641` evalúa nada), whatsapp/sms `pending_implementation` (`:592-601`), call → `default unknown_channel :643`; `customers.full_name` (`C-15`) |
| `crm/followupEngineService.ts` | — | 🔴 | Cliente browser (`:1`); `activities.title/description` (`:420-421,491-492`); `.ilike('description') :468` → idempotencia siempre false; `activity_type` inválidos (`:419,209,490`); `tasks.related_id :437-438`; `send_notifications :46` flag muerto |
| `components/crm/pipeline/OpportunityAutomations.tsx` | — | 🟡 vivo | `handleStageChangeAutomation` llamado desde `KanbanBoard:529,594,668` (muerto) y `PipelineStages:744`; heurísticas cliente `:176-218` comparando nombres `'ganado','perdido','negociación'`; llama `EmailNotifications` (`:100,104` pasa Number) |
| `components/crm/pipeline/EmailNotifications.ts` / `.tsx` | — | 💀 | stubs `console.log :82-87 / :84-91`; firmas divergentes; mismo basename |
| `components/crm/pipeline/AutomationSettings.tsx` | 405 | 💀 | nunca montado; escribe `stage_automations` (`:86,155,165`) |
| `components/crm/pipeline/AutomationsView.tsx` | — | 🟡 montado (`PipelineView:180`) | 5 switches sobre `automations` (1 fila); "por etapa próximamente" |
| `crm/pipelineTemplates.ts` | — | ✅ | `createPipelineFromTemplate` (sales/onboarding/renewal); provisión automática en `api/modules/route.ts` |
| `crm/stageGateService.ts`, `lossReasonService.ts`, `scoringService.ts`, `onboardingService.ts`, `renewalService.ts`, `leadCaptureService.ts`, `commercialMetricsService.ts` | — | ✅ / 🟡 | V3 (ver PROGRESS) |

---

## 4. UI: páginas y componentes

### 4.1 Layout y navegación

| Elemento | Archivo | Estado |
|---|---|---|
| Layout de app | `src/app/app/layout.tsx` (33 L): `AuthGuard → MotionProvider → AppLayout → Suspense` | 🔴 sin `SoftphoneProvider` ni dock global |
| Nav CRM | `src/components/app-layout/AppLayout.tsx:122-139` (`MODULES_WITH_SUBMENU`): Clientes, Pipeline, Oportunidades, Equipo, Pronóstico, Actividades, Segmentos, Campañas, Salud Clientes, Identidades | 🟠 faltan Llamadas y Leads; segunda lista inconsistente en `src/config/moduleConfig.ts:136-141` |
| Enlace a configuración | `CRMQuickNav.tsx:112` → `/app/crm/configuracion` (no existe) | 🟡 debe ser `/app/configuracion?modulo=crm` |
| Huérfanos | `components/crm/configuracion/ConfiguracionHub.tsx`, `components/crm/customers/CustomersList.tsx` | 💀 |

### 4.2 Pipeline

| Componente | Líneas | Estado |
|---|---|---|
| `pipeline/page.tsx` → `PipelineView.tsx` | 27 / 191 | tabs Kanban · Tabla · Pronóstico · Clientes · Automatización (`:116-187`) |
| `PipelineStages.tsx` (Kanban vivo) | 1041 | tarjeta inline `:917-965` (nombre, pill won/lost, cliente, fecha, monto; sin avatar/temperatura/próxima acción/vencido/botones); `onClick` en toda la tarjeta `:921-924` sobre el mismo nodo que `dragHandleProps` `:920-921`; drag `:903-967` (`@hello-pangea/dnd`); nueva oportunidad `:970-980`; config etapa `:866,876,883`; **sin realtime, sin gates, sin WonCloseModal**; llama `handleStageChangeAutomation :744` |
| `KanbanBoard.tsx` / `KanbanColumn.tsx` / `OpportunityCard.tsx` | 931 / 174 / 147 | 💀 solo en `index.ts:3-5`; contienen realtime (`realtimeService.subscribeToOpportunities/Stages`), `evaluateStageGate`+`GateWarningDialog`, `WonCloseModal`, `StructuredLossDialog`, `handleStageChangeAutomation` (`:1-56`); `KanbanColumn.tsx:40` `bg-[${stage.color}]` no compila en JIT; `Badge variant success/warning` (`OpportunityCard:41-45`, `KanbanColumn:81`) ⚠️ verificar en `badge.tsx` |
| `PipelineHeader.tsx` | — | ✅ selector de pipelines con badges y creación por plantilla (PROGRESS 2026-09) |

### 4.3 Drawer, detalle y acciones

| Componente | Líneas | Estado |
|---|---|---|
| `OpportunityDrawer.tsx` | 1013 | `Sheet` right `max-w-2xl`, **sin tabs**, 12 secciones apiladas: header Editar/Ganada/Perdida `:391-418`; `ActivityActions :438-442`; `FollowupSection` (214 L) `:453`; Info `:463-499`; `SalesTeamTerritorySelectors :504`; `ScoringSection` (240 L) `:515`; `DiscoverySection` (216 L) `:521`; Cliente + `CustomerEditDialog :532-612`; Productos/Espacios/Conceptos `:713-801`; Actividades inline `:804-845` (rama de duración inalcanzable `:831-835`); `TasksSection` (244 L) `:855`; Notas `RichTextEditor :866-934`; `DocumentUploader :939-956`. `loadData :242-286` = 7 queries `Promise.allSettled` por apertura y por mutación; `window.dispatchEvent(new Event('refresh-pipeline-data'))` `:342,356`; `:508` lee `oppData?.salesperson_id` no declarado en `OpportunityFull :132-160`; declara `channel/outcome/duration_seconds :81-90` |
| `OpportunityDetail.tsx` (`/app/crm/oportunidades/[id]`) | 1330 | Header Ganar/Perder/Editar/Duplicar/Eliminar `:419-471`; embudo clicable `:488-514`; 9 tabs `:523-594` (Productos, Espacios, Conceptos, Actividades, Tareas, Notas, Documentos, Timeline, Analítica); tab Actividades `:743-795` embebe `ActivityActions :747`; tab Timeline `:908-970` = merge cliente activities+tasks+notes `:919-922` (**no usa `/api/crm/timeline`**); `getOpportunityActivities :93` |
| `ActivityActions.tsx` | 844 | 4 diálogos: **CallDialog `:229-454`** (manual default → `window.open('tel:') :364` + formulario; click-to-call → `POST /api/integrations/twilio/click-to-call :272` **404**; upload audio → `/api/crm/transcribe :249`; guarda `logActivity(...,'call', notesCombined)+registerContact :299-300` con duración/transcripción concatenadas en `notes :291-297`); **EmailDialog `:466-594`** (`POST /api/email/send :502`; textarea HTML crudo `:573-578`; `fetch /api/email/templates :478` **404** con catch silencioso `:483-485` y Select oculto `:543`; efecto async dentro de `useState` `:475-487`; crea activity extra `:519` + `logContact :520`); **WhatsAppDialog `:606-708`** (toggle Cloud `/api/integrations/whatsapp/send` vs Twilio `/api/integrations/twilio/send-whatsapp` `:619-622`; Cloud envía `{to,type,text:string,conversation_id:opportunityId}` → 400; Twilio sin Authorization/orgId → 401); **MeetingDialog `:720-844`** (`supabase.from('calendar_events').insert` cliente `:747`); todos → `logActivity :54-71` → `opportunitiesService.createActivity` |
| `opportunitiesService.ts` | — | `getOpportunityActivities :200-210` (solo `activities`, sin join/paginación); `createActivity :571-594` escribe `organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at` (nunca `channel/outcome/duration_seconds/call_id`); timeline propio `:959-972`; `CreateActivityInput` en `types.ts:40-47` |
| `actividades/types.ts` (138 L) | — | `ActivityType = call|email|meeting|note|visit|whatsapp|system` (`meeting` no está en el CHECK); `Activity` sin `channel/outcome/duration`; `ACTIVITY_TYPE_CONFIG :82-138` (icono/color reutilizable) |
| `actividades/ActividadesService.ts` (352 L), `ActividadForm.tsx` (264 L), `ActividadesPage.tsx` (383 L; embebe `ActivityActions` con `opportunityId=undefined` `:302-312`) | — | 🟡 |

### 4.4 Telefonía (`src/components/voice/`)

| Componente | Líneas | Estado |
|---|---|---|
| `SoftphoneProvider.tsx` | 354 | `Device :24`; token `/api/voice/token :67`; incoming `:184`; refresh `:199`; `deviceState='error' :213-217` cuando el token falla; `makeCall :266-276` `POST /api/voice/call` **y luego** `:286 device.connect({To})` (doble marcación); `useSoftphone` lanza fuera del provider `:348-352`. **Montado solo en `crm/llamadas/page.tsx:201`** |
| `SoftphoneDock.tsx` | 362 | flotante; ok |
| `CallButton.tsx` | 114 | props `phoneNumber, customerId, opportunityId, recordingEnabled`; `disabled` salvo `deviceState==='registered' :56`; `stopPropagation+preventDefault :58-60` (modelo para tarjeta); **0 importadores** |
| `CallsTable.tsx` | 299 | filtros dirección/fechas; `CallPlayer` por fila `:286` |
| `CallPlayer.tsx` | 180 | reproduce `/api/voice/recording/{id}/stream` |
| `IncomingCallToast.tsx` | 66 | ok |
| `/app/crm/llamadas/page.tsx` | 205 | 3 stat cards de `/api/crm/calls :132`; sin visor de transcripción ni análisis pese a existir las APIs; **fuera del nav** |
| `@twilio/voice-sdk` | — | importado solo en `SoftphoneProvider:24`; cero en `mobile/` y `electron/` |

### 4.5 Otras páginas CRM

| Página | Archivo | Estado |
|---|---|---|
| `/app/crm/leads` | `leads/page.tsx` (405 L) | tabla + "Convertir a deal" (`POST /api/crm/leads/[id]/convert :190`); sin acciones de contacto; fila → `/app/crm/oportunidades/{id} :317`; fuera del nav |
| `/app/crm/clientes/[id]` | `clientes/[id]/page.tsx` (500 L) | tabs con `CustomerFoliosSection`, `ClientHealthCard`, `DocumentUploader`; **no embebe `ActivityActions`** |
| `/app/crm/campanas` (+ `/nuevo`, `/[id]`) | `CampanasPage` (369 L), `CampanaNuevaPage` (contenido textarea `:249`), `CampanaDetallePage` | 🔴 envío no real |
| `/app/crm/equipo` | `EquipoPage` (98 L) 4 tabs | ✅ |
| `/app/crm/actividades` | `ActividadesPage` | 🟡 |
| `/app/crm/segmentos/**`, `/identidades`, `/pronostico`, `/salud`, `/reportes`, `/metricas` | — | V3 (sin cambios en V4) |
| `tel:`/`mailto:`/`wa.me` sin log | `pipelineUtils:78-90`, `CustomersTable:173,183,255`, `CustomerDetailsModal:65,78`, `HoyView:102,110,118` | 🟡 |

### 4.6 Chat reutilizable (`src/components/chat/conversations/id/`)

`MessageTimeline` (340 L), `MessageInput` (320 L), `ConversationHeader` (320 L), `ConversationActions` (352 L), `AIAssistantPanel` (274 L), `CustomerPanel` (206 L), `NotesPanel` (222 L), `QuickRepliesPanel` (175 L), `activity/ActivityItem` (231 L). Keyed por `conversation_id`; el CRM no tiene vínculo oportunidad → conversación (solo `CRMQuickNav → /app/chat/bandeja`). `WhatsAppCredentialsCard.tsx:39-42` muestra credenciales leídas con anon.

### 4.7 Convenciones de diseño (para todos los builders)

shadcn/ui + Radix (`@/components/ui/*`: tabs, sheet, dialog, command, popover, scroll-area, badge). `cn`/`formatCurrency` desde `@/utils/Utils`. Sheet = drawer de registro; Dialog = formularios; AlertDialog = destructivo. Toast: `import { toast } from '@/components/ui/use-toast'` (434 archivos); `react-hot-toast` legacy en 13. Sin react-query: `useState + useCallback + Promise.allSettled`, refetch total tras mutación. Realtime: `src/lib/services/realtimeService.ts` (`subscribeToOpportunities`, `subscribeToStages`) usado solo por `KanbanBoard` (muerto), `ForecastView`, `ForecastSidebar`. `motion@13` (`motion/react`) + `MotionProvider`. `next-themes` con pares `dark:` manuales. `RichTextEditor.tsx` (118 L, contentEditable + execCommand) + `HtmlContentRenderer`. 3 libs DnD (`@hello-pangea/dnd` en CRM, `@dnd-kit`, `react-dnd`). Tests: jest (`src/__tests__/guardrails.test.ts`, `src/lib/services/__tests__/*`).

---

## 5. Integraciones y entorno

### 5.1 SDKs instalados

| Paquete | Versión | Uso real |
|---|---|---|
| `twilio` | ^5.12.1 | voz/mensajería (v6 exige Node ≥ 20) |
| `@twilio/voice-sdk` | ^2.18.3 | solo `SoftphoneProvider` |
| `openai` | ^6.15.0 | chat, whisper, dall-e, realtime por WS crudo |
| `@google/genai` | ^2.20.0 | solo `callAnalysisService` |
| `resend` | ^6.25.0 | `emailService` |
| `ws` | ^8.19.0 | ws-server |
| `react-email` / `@react-email/*` | instalado | **nunca importado**; sin `emails/` |
| `@whiskeysockets/baileys` | ^7.0.0-rc14 | QR |
| No instalados | `@elevenlabs/elevenlabs-js` (fetch crudo), Deepgram SDK (fetch/ws crudo), `anthropic` (aparece en dropdown UI) |

Modelos usados hoy: gpt-4o (`openaiService.ts:98`, `conversationRelayHandler.ts:275,381`); gpt-4o-realtime-preview (**apagado**); whisper-1 (`realtimeSession.ts:104`, `ai-assistant/transcribe:106`); gpt-4o-mini (`crm/ia/*`, `improve-text:92`, pm-*, seo); dall-e-3 (`generate-image:52`); gemini-2.5-flash (`callAnalysisService.ts:197,421`); gemini-2.0-flash (`crm/transcribe:147`); Deepgram nova-2; ElevenLabs scribe_v1 y eleven_turbo_v2 (**deprecado**).

### 5.2 Variables de entorno leídas por el código

| Grupo | Variables |
|---|---|
| Supabase / infra | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `WS_SERVER_URL`, `WS_PORT` |
| Twilio | `TWILIO_MASTER_ACCOUNT_SID`, `TWILIO_MASTER_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_WEBHOOK_BASE_URL` (**`.env.local` = `…/api/integrations/twilio`; `.env.example` = origin**). Solo desde BD (`provider_configs.credentials`, 0 filas): `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_SUBACCOUNT_SID/AUTH_TOKEN` |
| IA | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_CHAT_MODEL`, `OPENAI_REALTIME_MODEL`, `GOOGLE_AI_API_KEY`, `GEMINI_API_KEY` (solo como credencial en `provider_configs`, `callAnalysisService:398`), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`; `ANTHROPIC_API_KEY` nunca se lee |
| Email | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_VERIFICATION_KEY` |
| WhatsApp | `WHATSAPP_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` |
| Edge Function | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_*` |
| Placeholders | `DOCUMENSO_API_KEY`, `CALCOM_API_KEY`, `DAILY_API_KEY`, `APOLLO_API_KEY` |

### 5.3 Twilio: qué se usa hoy

Firma: `validateTwilioSignature` (`twilioWebhook.ts:25`) con token master; URL desde `request.url` o `getWebhookBaseUrl` (voz C13). Subcuentas: `comm_settings.twilio_subaccount_sid/auth_token` (31 filas). Verify: `TWILIO_VERIFY_SERVICE_SID`. `<ConversationRelay>` en `twiml/ai-agent` y `voice/incoming` sin `ttsProvider/voice`.

---

## 6. Cross-platform

| Plataforma | Evidencia | Estado |
|---|---|---|
| Capacitor 8 | `mobile/capacitor.config.ts` (appId `io.goadmin.app`, wrapper de URL remota `https://app.goadmin.io`); plugins biometría, BLE, cámara, geolocalización, push, NFC, share | 🔴 `AndroidManifest` solo `INTERNET` (falta `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`); `Info.plist` sin `NSMicrophoneUsageDescription`; sin plugin Twilio; sin `Capacitor.isNativePlatform` en CRM |
| Electron 33 | `electron/src/main/index.ts`, `preload/index.ts`; impresoras, cajón, autostart, updates, deep links `goadmin://` | 🟡 sin softphone ni gestión de permisos de micrófono (`@twilio/voice-sdk` es compatible con Electron) |
| PWA | `public/manifest.json`, `public/sw.js` (cache, network-first, push, notification click), web-push | 🟡 sin manejo de `tel:` ni WebRTC específico |
| Bridge móvil server-side | `mobileBridgeService.ts` + `bridge/initiate` + `twiml/agent-leg|customer-leg` | 🟡 backend existe, sin UI ni teléfono guardado |

---

## 7. Mapa de bugs unificado

Severidad: 🔴 crítico · 🟠 alto · 🟡 medio · ⚪ bajo. "Fase" = fase V4 que lo cierra. Ids de origen entre paréntesis (audit-messaging = msg, audit-telephony = voz, audit-ai = IA, audit-ui = UI).

### 7.1 SEC — seguridad y multi-tenant

| Id | Hallazgo | Archivo:línea | Sev | Fase |
|---|---|---|---|---|
| SEC-01 | `verify/send` y `verify/check` sin auth; excluidos del middleware → SMS pumping (msg C1) | `twilio/verify/send/route.ts:9-25`; `middleware.ts:83,778` | 🔴 | F0 |
| SEC-02 | IDOR WhatsApp: `send`, `mark-read`, `qr/send`, `qr/start|stop|logout|status` con `channel_id`/`organization_id` del body y service role (msg C2) | `whatsapp/send/route.ts:7-38,111-130` | 🔴 | F0 |
| SEC-03 | Webhook WhatsApp sin verificar `X-Hub-Signature-256`; verificador con `===` (msg C3). Plantilla del fix: `webhooks/facebook/[channelId]:43-53`, `instagram:43-52`, `integrations/meta/webhook:54-56` | `whatsapp/webhook/route.ts:27,36-38`; `whatsappCloudConfig.ts:71-82` | 🔴 | F0 |
| SEC-04 | IDOR Twilio `send-whatsapp`/`send-sms`: `orgId` del body (msg C4) | `send-whatsapp/route.ts:29-38`; `send-sms/route.ts:30-39` | 🔴 | F0 |
| SEC-05 | `sendgrid/send` y `notifications/process`: `connection_id`/`organization_id` del body sin ownership (msg C5) | `sendgrid/send/route.ts:20-51`; `notifications/process/route.ts:23-32` | 🔴 | F0 |
| SEC-06 | `sendgrid/webhook` verifica solo si hay headers; `connections[0]` → org equivocada (msg C6) | `sendgrid/webhook/route.ts:31-38,60-74` | 🟠 | F0 |
| SEC-07 | `incoming-message`: TwiML sin escapar; firma solo en producción (msg C7) | `incoming-message/route.ts:28-34,50-53` | 🟠 | F0 |
| SEC-08 | Secretos en claro alcanzables por el browser (msg C8) | `chatChannelsService.ts:192-197,236-241`; `WhatsAppCredentialsCard.tsx:39-42`; `sendgridService.ts:29-49`; `providerRegistry.ts:57-73` | 🟠 | F0 |
| SEC-09 | Código server con cliente browser → RLS sin sesión, escrituras descartadas (msg C9; voz C15) | `twilioService.ts:9`; `twilioWebhook.ts:9`; `twilioSubaccounts.ts:9`; `notificationService.ts`; `followupEngineService.ts:1` | 🟠 | F0 |
| SEC-10 | `qr/dispatch-pending` sin org ni `CRON_SECRET`; polled cada 5 s por pestaña (msg C10) | `qr/dispatch-pending/route.ts:9-40`; `bandeja/page.tsx:57-67` | 🟠 | F0 |
| SEC-11 | `whatsapp/validate` autentica pero no autoriza `channel_id` (msg C11) | `whatsapp/validate/route.ts` | 🟡 | F0 |
| SEC-12 | `getServerOrgContext` toma la membresía más antigua sin `X-Organization-Id` (msg C21) | `orgContext.ts:58-66` | 🟠 | F0 |
| SEC-13 | Fallback "primera org activa" al resolver número (msg C22; voz C11; IA C-G) | `twilioWebhook.ts:151-163`; `twilio/voice/incoming/route.ts:129-140`; `conversationRelayHandler.ts:493-502` | 🟠 | F0 |
| SEC-14 | `followup/run` fail-open con `organization_id` del body (msg C24; IA C-C) | `followup/run/route.ts:18-27` | 🔴 | F0 |
| SEC-15 | Endpoints IA sin auth, `organizationId` del body, service role (IA C-A) | `chat/ai/auto-response/route.ts:9-21,181`; `ai-assistant/improve-text:17`, `generate-image:8`, `pm-assist:59-60`, `pm-planner:48`, `seo-keywords:18-26`, `chat/route.ts:6`, `reportes:11` | 🔴 | F0 |
| SEC-16 | `chat/ai/generate-response|classify-intent|generate-summary` confían en org del body; `consumeAICredits` SR (IA C-B) | `generate-response/route.ts:11-17` | 🔴 | F0 |
| SEC-17 | JWT anon hardcodeado (IA C-D) | `ai-assistant/dynamic-options/route.ts:6` | 🟠 | F0 |
| SEC-18 | Firma opcional ("warn & continue") en 8 rutas voice; `twiml/ai-agent` la salta sin token; `incoming` solo prod (IA C-E; voz C12) | `twiml/ai-agent/route.ts:41-42`; `voice/status:36`; `twilio/voice/incoming:33` | 🔴 | F0 |
| SEC-19 | Updates/lookups con service role sin `organization_id` (IA C-F; voz C14, C19) | `twiml/ai-agent:84-91`; `bridge/status:121,134`; `agent-leg:63-68,92-102`; `customer-leg:61-65` | 🟠 | F0 |
| SEC-20 | `update_field` escribe tabla/columna arbitraria (IA C-H) | `automationService.ts:534-547` | 🔴 | F0 (deshabilitar) / F8 (allow-list) |
| SEC-21 | `ws-server` sin auth en el upgrade → sesiones OpenAI facturadas y créditos ajenos (voz C22) | `ws-server.ts:41-48`; `conversationRelayHandler.ts:274,410` | 🟠 | F0 |
| SEC-22 | `validateTwilioSignature` con token master aunque la org use subcuenta (voz C12) | `twilioWebhook.ts:25` | 🟠 | F0 |
| SEC-23 | URL de firma desde `request.url` / `getWebhookBaseUrl` (voz C13) | rutas `voice/*` | 🟡 | F0 |
| SEC-24 | `consumeAICredits` no atómico (IA C-10) | `aiCreditsService.ts:209-234` | 🟠 | F0 |
| SEC-25 | `do_not_email` escrito pero nunca leído (msg C18) | `emailService.ts:799` vs `:231-394`; `sequenceService`, campañas | 🔴 | F0 (enforce) / F7 |
| SEC-26 | Rutas IA que no debitan créditos (IA §1) | `crm/ia/*`, `crm/transcribe`, `calls/[id]/{transcribe,analyze}`, `ai-assistant/chat`, `reportes`, loop CR | 🟠 | F0 |
| SEC-27 | `comm_usage_logs` solo tiene política `SELECT`; `twilioService` inserta con el cliente browser → el log de uso/costo SMS/WA se pierde en silencio (`ANEXO-C` §2) | `pg_policies comm_usage_logs_select`; `twilioService.ts:9,172` | 🟠 | F0 (`getServiceClient`) |
| SEC-28 | Bucket `crm-documents` (privado) sin ninguna política en `storage.objects` → miembros no pueden leer/subir (`ANEXO-C` §1.4) | `storage.buckets`/`pg_policies schemaname=storage` | 🟠 | F0-DB (M3) / F9 |
| SEC-29 | `cron.job` id 4 (`mantener-datos-reales-diarios`) con JWT `service_role` embebido en `command` (`ANEXO-C` §1.4) | `cron.job` | 🔴 (fuera de CRM) | dueño rota la key; F0-DB reescribe el job con Vault |

### 7.2 SCH — schema vs código

| Id | Hallazgo | Archivo:línea | Sev | Fase |
|---|---|---|---|---|
| SCH-01 | `calls.mode/status` TS inválidos vs CHECK (voz C3) | `callManagementService.ts:15-24`; `voice/call:113,119`; `voice/status:143-164`; `bridge/status:110` | 🔴 | F0 |
| SCH-02 | Inserts en `calls` con `phone_number` inexistente y sin `from_number/to_number` (voz C4) | `mobileBridgeService.ts:183-195`; `bridge/status:144-159`; `crm/voiceAgentService.ts:861-871` | 🔴 | F0 |
| SCH-03 | `call_recordings`: `updated_at` inexistente; `status 'completed'`; `channels` null; `storage_path` null (voz C5) | `callManagementService.ts:449`; `voice/recording:36,109,112,127,131,182-195`; `recordingStorageService.ts:126,268` | 🔴 | F0 |
| SCH-04 | Bucket `crm-call-recordings` no existe (voz C6) | `recordingStorageService.ts:18` | 🔴 | F0 |
| SCH-05 | `call_analyses.sentiment` sin `mixed` (voz C16) | `callAnalysisService.ts:79,212,471` | 🟡 | F0 |
| SCH-06 | `customers.timezone/do_not_call/name` y `do_not_call_list` no existen (IA C-1) | `crm/voiceAgentService.ts:517,592,616,781`; `callAnalysisService.ts:349` | 🔴 | F0 |
| SCH-07 | `activities.title/description` no existen (IA C-2; voz C17) | `crm/voiceAgentTools.ts:87-88,207-208,257-258`; `followupEngineService.ts:420-421,468,491-492` | 🔴 | F0 (código) / F6 / F8 |
| SCH-08 | `tasks.related_id/related_type` y `status 'pending'` (IA C-3) | `automationService.ts:499-500`; `sequenceService.ts:616-617`; `crm/voiceAgentTools.ts:127-128,329-330`; `followupEngineService.ts:437-438` | 🔴 | F0 / F8 |
| SCH-09 | `activity_type` fuera del CHECK: `stage_change`, `email_sent`, `transfer`, `follow_up`, `reminder`, `automation_log`, `meeting` (IA C-4; UI) | `crm/voiceAgentTools.ts:86,206,256`; `followupEngineService.ts:419,209,490`; `actividades/types.ts` | 🟠 | F0 (amplía CHECK) |
| SCH-10 | `purpose_type` TS (`follow_up`, `survey`) ≠ CHECK (IA C-5) | `crm/voiceAgentService.ts` tipos | 🟡 | F6 |
| SCH-11 | `opportunities.title` en el prompt de análisis → sin catálogo de etapas (IA C-6) | `callAnalysisService.ts:363` | 🟠 | F4 |
| SCH-12 | `stage_automations` no existe (IA C-7) | `AutomationSettings.tsx:86,155,165` | 🟠 | F8 (eliminar) |
| SCH-13 | Dos shapes en `messages`; inbound sin `content` (msg C20) | `whatsapp/send:114-123`; `qr/send:25-34`; `whatsappCloudService.ts:413-423`; `bandeja:96`; `SearchPanel:59` | 🟠 | F0 (backfill) / F16 |
| SCH-14 | `templates` sin `blocks_json`; `template_id` reenviado a Resend como template de Resend (msg C13, B4) | `emailService.ts:257,352-356` | 🔴 | F7 |
| SCH-15 | `sequence_steps.channel` sin `ai_call`; `call` no está en el switch (IA §5) | `sequenceService.ts:643` | 🟡 | F8 |
| SCH-16 | `customers.full_name` nullable usado como nombre (IA C-15) | `sequenceService.ts` | ⚪ | F8 |
| SCH-17 | `BridgeMode` TS (`agent-first`…) ≠ CHECK `agent_leg|customer_leg|full_bridge` (voz C3) | `callManagementService.ts` | 🟡 | F5 |
| SCH-18 | Tablas con 1 sola política RLS a verificar | `scoring_configs`, `loss_reasons`, `health_score_*`, `opportunity_stage_history`, `opportunity_products/spaces` | 🟡 | F0 |
| SCH-19 | `call_recordings.retention_until` nunca poblado; sin cron de retención (voz D) | `recordingStorageService.ts` | 🟡 | F3 |
| SCH-20 | `provider_configs.credentials` en claro; keys placeholder cuentan como activas | `providerRegistry.ts:80` | 🟠 | F0 |
| SCH-21 | Inbound WhatsApp Cloud API inserta columnas inexistentes en `messages` (`sender_type, sender_id, external_id, status`), `role 'user'` fuera del CHECK y sin `direction/channel_id/content` NOT NULL → **ningún mensaje entrante por Cloud API se persiste** (corrige "A2 funciona" del audit de mensajería) | `whatsappCloudService.ts:413-423`; columnas reales en `ANEXO-C` §5 | 🔴 | F16 (F0-SEC si toca el webhook) |
| SCH-22 | `processStatusUpdate` busca por `external_id` (columna real `external_message_id`) → `sent/delivered/read` nunca se aplican | `whatsappCloudService.ts:437` | 🟠 | F16 |
| SCH-23 | `createCall` inserta `status: data.status ?? 'queued'` (fuera del CHECK) y `duration_source: … ?? null` en columna NOT NULL → ningún insert por este servicio puede tener éxito aunque `mode` sea válido | `callManagementService.ts:307,322` | 🔴 | F0-SEC (`enums.ts`) / F3 |
| SCH-24 | `applyAnalysis` crea `tasks` con `priority 'medium'` (CHECK `low|med|high|critical`) y `status 'pending'` (CHECK `open|in_progress|done|canceled`) → 23514 al aplicar cualquier análisis con tareas sugeridas | `callAnalysisService.ts:691-692` | 🔴 | F4 |

### 7.3 WIRE — desconexiones y cableado roto

| Id | Hallazgo | Archivo:línea | Sev | Fase |
|---|---|---|---|---|
| WIRE-01 | `resolveOrgFromExternal` crashea (voz C0) → todos los webhooks Twilio 500 | `orgContext.ts:89-93`; `voice/status:55-67`; `voice/recording:61-73`; `twiml/outbound:47-62`; `twiml/inbound:45-58` | 🔴 | F0 |
| WIRE-02 | Softphone nunca registra (voz C1) | `voiceTokenService.ts:44-56`; `providerRegistry.ts:18`; `SoftphoneProvider.tsx:213-217`; `CallButton.tsx:56` | 🔴 | F0 / F3 |
| WIRE-03 | `TWILIO_WEBHOOK_BASE_URL` con dos significados; `getWebhookBaseUrl` + path completo (voz C2; IA C-8) | `twilioConfig.ts:83`; `voice/call:89-91`; `mobileBridgeService.ts:159-160`; `agent-leg:113,130-131`; `customer-leg:116-117`; `bridge/status:66`; `voiceAgentService.ts:838,843`; `incoming:35` | 🔴 | F0 |
| WIRE-04 | Transcripción filtra `status='available'` (voz C7) | `transcriptionService.ts:365,380` | 🔴 | F4 |
| WIRE-05 | Bucket tomado del primer segmento del `storage_path` (voz C8) | `transcriptionService.ts:415-417` | 🔴 | F4 |
| WIRE-06 | TwiML con `&` sin escapar → error 12100 (voz C9) | `agent-leg:131`; `customer-leg:117` | 🟠 | F5 |
| WIRE-07 | Doble marcación browser (voz C10) | `SoftphoneProvider.tsx:266-286`; `twiml/outbound:121-123,55` | 🟠 | F3 |
| WIRE-08 | Status callback del agente IA → `bridge/status?leg=ai_agent` → early return; `voice_agent_calls` nunca sale de `in_progress` (voz C18; IA C-9) | `crm/voiceAgentService.ts:843`; `bridge/status:75-77` | 🟠 | F6 |
| WIRE-09 | `<Client>incoming</Client>` hardcodeado; `language="en-US"`; `defaultCountryCode '+57'` (voz C21; IA C-11) | `twiml/inbound:130`; `incoming:111`; `twilioConfig.ts:89` | 🟡 | F3 |
| WIRE-10 | Dockerfile ws sin lockfile; no copia `crm/**`; sin zod/resend (voz C23; IA C-17) | `ws-server.Dockerfile` | 🟠 | F0 |
| WIRE-11 | Click-to-call → ruta inexistente (UI B1; voz C20). Correctas: `POST /api/voice/call`, `POST /api/voice/bridge/initiate` | `ActivityActions.tsx:272` | 🔴 | F0 |
| WIRE-12 | `/api/email/templates` no existe; catch silencioso (UI B2; msg B3) | `ActivityActions.tsx:478,483-485,543` | 🔴 | F0 |
| WIRE-13 | Botón WhatsApp del pipeline roto en ambos paths (msg C12) | `ActivityActions.tsx:619-627` | 🔴 | F16 |
| WIRE-14 | Idempotencia no-op (`Date.now()+random`) (msg C14) | `emailService.ts:172-176` | 🟠 | F7 |
| WIRE-15 | Activities duplicadas en email (msg C15) | `emailService.ts:311-327`; `ActivityActions.tsx:519-520` | 🟠 | F7 |
| WIRE-16 | Webhook sobrescribe status con el último evento; counts stale (msg C16) | `emailService.ts:743-778,757,761` | 🟠 | F7 |
| WIRE-17 | `unsubscribed` inalcanzable; sin `List-Unsubscribe` ni página de baja (msg C17) | `emailService.ts` | 🟡 | F7 |
| WIRE-18 | `EmailNotifications.ts` vs `.tsx` mismo basename, firmas distintas (msg C19) | `OpportunityAutomations.tsx:100,104` | 🟡 | F8 |
| WIRE-19 | `renderTemplate` sin rutas con punto, sin defaults, sin escape (inyección HTML); solo `customer_name` (msg C23) | `emailService.ts:182-190` | 🟠 | F7 |
| WIRE-20 | Dominios sin Resend Domains API; `resolveDefaultDomain` siempre null (msg B2) | `emailService.ts:195-210,239-240,530-563` | 🔴 | F7 |
| WIRE-21 | `react-email` instalado y nunca importado (msg B1) | `package.json` | 🟡 | F7 |
| WIRE-22 | Secuencias/campañas/followup sin scheduler (msg B6; IA §6) | `vercel.json`; `pg_cron` | 🔴 | F0 (scheduler) / F8 |
| WIRE-23 | Steps whatsapp/sms/call/condition sin implementar; `ai_call` ausente (msg B7; IA §5) | `sequenceService.ts:592-601,637-643` | 🟠 | F8 |
| WIRE-24 | `timelineService` con 0 consumidores; 3 implementaciones de timeline (UI B6; msg B8) | `timelineService.ts`; `OpportunityDetail.tsx:919-922`; `opportunitiesService.ts:959-972` | 🟠 | F9 |
| WIRE-25 | Endpoints WA muertos e inalcanzables (msg B9) | `qr/send`, `qr/mark-read`, `whatsapp/mark-read`, `verifySignature`, `sendImage/sendDocument/getMediaUrl/downloadMedia` | 🟡 | F16 |
| WIRE-26 | `message_template_status_update` descartado (msg B15) | `whatsappCloudService.ts:345` | 🟠 | F16 |
| WIRE-27 | Sin cola, rate limit ni retry; `WHATSAPP_RATE_LIMITS/TIERS` no leídos (msg B16) | `whatsappCloudConfig.ts:56-69` | 🟠 | F0 / F16 |
| WIRE-28 | Una llamada nunca genera `activity` (voz §4) | ninguna ruta `voice/*`; `applyAnalysis :671,:701` | 🔴 | F3 |
| WIRE-29 | Teléfono del vendedor no se guarda ni lee; `profiles.phone` sin lectores (voz §5) | `mobileBridgeService.ts:19` | 🟠 | F0 (tabla) / F5 |
| WIRE-30 | Agente de voz descarta su configuración; prompt de hotel (IA §2) | `twiml/ai-agent:63-66,101-108`; `conversationRelayHandler.ts:105-106,179-180,462-479`; `voiceAgentPrompts.ts:34-68` | 🔴 | F6 |
| WIRE-31 | Historial de tool calls malformado → function calling roto (IA C-13) | `conversationRelayHandler.ts:83-95,356-359` | 🔴 | F6 |
| WIRE-32 | `crm/voiceAgentTools.ts` sin importadores; sin `book_meeting` (IA §2) | `crm/voiceAgentTools.ts:355-424` | 🔴 | F6 |
| WIRE-33 | `<ConversationRelay>` sin `ttsProvider/voice`; `voice_id` nunca leído (IA §2) | `twiml/ai-agent:101-108` | 🟠 | F6 |
| WIRE-34 | Campañas: "enviar" solo cambia status; `campaign_contacts` nunca escrito; sin worker (msg D) | `CampanasService.ts:187,247-263`; `CampanaNuevaPage:249` | 🔴 | F16 |
| WIRE-35 | 4 sistemas de automatización paralelos; `automation_rules.stage_change` sin productor; heurísticas cliente (IA §5) | `OpportunityAutomations.tsx:176-218`; `automationService.ts:223`; `AutomationsView.tsx`; `AutomationSettings.tsx`; `followupEngineService.ts` | 🔴 | F8 |
| WIRE-36 | Sin encadenamiento automático grabación → transcripción → análisis (IA §3) | `voice/recording`; `voice/status`; `transcribeCall`/`analyzeCall` 1 caller c/u | 🔴 | F4 |
| WIRE-37 | Heurística speaker 0 = agente; idioma hardcodeado; sin language en ElevenLabs (IA §3) | `transcriptionService.ts:98,156,184,208,240,282,302,444` | 🟠 | F4 |
| WIRE-38 | Modelos deprecados/apagados: `gpt-4o-realtime-preview`, `eleven_turbo_v2`, `scribe_v1`, `whisper-1` (2027-02), `gpt-4o` legacy | `realtimeSession.ts:49-61`; `elevenLabsTTS.ts:34,81`; `transcriptionService.ts:243-247`; `openaiService.ts:98` | 🟠 | F0 / F4 / F6 |
| WIRE-39 | Singletons OpenAI a nivel módulo → fijarán la key de la primera org (IA C-18) | `openaiService.ts:3`; `next-action:18`; `discovery-summary:18` | 🟡 | F0 |
| WIRE-40 | `aiSettingsService` ofrece anthropic/gemini → `openaiService` los manda a OpenAI → 400 (IA C-12) | `aiSettingsService.ts:66-82` | 🟡 | F0 |
| WIRE-41 | `.single()` en lookups multi-fila (IA C-14) | `conversationRelayHandler.ts:191-195,459,465` | 🟡 | F6 |
| WIRE-42 | `mailto:`/`wa.me`/`tel:` sin log (msg B12) | `pipelineUtils:78-90`; `CustomersTable:173,183,255`; `CustomerDetailsModal:65,78`; `HoyView:102,110,118` | 🟡 | F9 |
| WIRE-43 | Sin deep-link oportunidad → conversación (msg B14) | `CRMQuickNav` | 🟡 | F9 / F16 |
| WIRE-44 | Dos stacks de transcripción (`crm/transcribe` vs `transcriptionService`); `crm/transcribe` no persiste (voz D) | `crm/transcribe/route.ts:13,139,208` | 🟡 | F4 |
| WIRE-45 | SendGrid como stack paralelo; `emailService` lo rechaza (msg B11) | `sendgrid/*`; `emailService.ts:404-405` | 🟡 | F7 |
| WIRE-46 | Realtime solo en `KanbanBoard` (muerto); el board vivo no tiene realtime (UI) | `realtimeService.ts`; `PipelineStages.tsx` | 🟡 | F9 |
| WIRE-47 | Código muerto: `callService.ts`, `realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`, `voiceAgent/voiceAgentService.ts`, `media-stream` (410), `KanbanBoard/Column/Card` | ver §3 | ⚪ | F0 / F9 |
| WIRE-48 | `getCommSettings` con cliente anon en servidor → `voice_recording_enabled` cae a false (voz C15) | `twilioSubaccounts.ts:9`; `voice/call:75`; `twiml/outbound:65`; `twiml/inbound:61`; `twilioWebhook:142` | 🟠 | F0 |
| WIRE-49 | `voice/incoming` duplica `twiml/inbound` con fallback cross-tenant y `en-US` | `twilio/voice/incoming/route.ts` | 🟠 | F3 |
| WIRE-50 | Dos libros de créditos que nunca cuadran (comm voice minutes vs ai credits); CR nunca debita `ai_settings` (IA C-16) | `conversationRelayHandler.ts:410-414`; `crm/voiceAgentService.ts:529-541` | 🟠 | F0 |
| WIRE-51 | `provider_configs` con políticas INSERT/UPDATE/DELETE para `authenticated` → cualquier miembro altera credenciales sin pasar por el control admin del PUT (tester F00 r1 #3) | `pg_policies provider_configs_{insert,update,delete}` | 🟠 | F0-DB (REVOKE) |
| WIRE-52 | Seis componentes V3 terminados sin importadores: `ObjecionesList` (492 L), `DiscoveryWizard` (666), `ProposalBuilderDialog` (385), `OnboardingChecklist` (221), `HoyView` (426), `FunnelView` (`ANEXO-C` §4) | `grep -rl` sin resultados fuera del propio archivo | 🟡 | F9 / F10 / F11 / F14 |
| WIRE-53 | Cinco rutas con `CRON_SECRET` sin ningún scheduler: `health/recalculate`, `renewals/sync`, `sequences/run`, `voice-agents/campaigns/run`, `followup/run` | `vercel.json` (10 crons, 0 CRM); `cron.job` sin `crm-*` | 🟠 | F0-JOBS (kinds en el job diario) |

### 7.4 UX — interfaz

| Id | Hallazgo | Archivo:línea | Sev | Fase |
|---|---|---|---|---|
| UX-01 | Tarjeta Kanban sin acciones (llamar/email/WhatsApp), sin avatar/temperatura/próxima acción/vencido | `PipelineStages.tsx:917-965` | 🟠 | F9 |
| UX-02 | Drawer de 1013 L sin tabs ni barra sticky; Documentos/Notas al fondo (UI B13) | `OpportunityDrawer.tsx` | 🟠 | F9 |
| UX-03 | Tormenta de refetch: 7 queries por cualquier mutación; evento global `refresh-pipeline-data` (UI B14) | `OpportunityDrawer.tsx:242-286,342,356` | 🟡 | F9 |
| UX-04 | `OpportunityDetail` 1330 L con 9 tabs y timeline manual | `OpportunityDetail.tsx:523-594,908-970` | 🟠 | F9 |
| UX-05 | `KanbanBoard/KanbanColumn/OpportunityCard` muertos con features (gates, realtime, WonCloseModal) que el board vivo no tiene (UI B4) | `pipeline/index.ts:3-5`; `KanbanBoard.tsx:1-56` | 🟠 | F9 |
| UX-06 | `bg-[${stage.color}]` no compila en Tailwind JIT (UI B5) | `KanbanColumn.tsx:40` | ⚪ | F9 (se borra) |
| UX-07 | `SoftphoneProvider` solo en `/app/crm/llamadas`; `CallButton` sin importadores; lanza fuera del provider (UI B7) | `crm/llamadas/page.tsx:201`; `SoftphoneProvider.tsx:348-352` | 🔴 | F0 (hoist) / F3 |
| UX-08 | `/app/crm/llamadas` y `/app/crm/leads` fuera del sidebar (UI B8) | `AppLayout.tsx:127-138` | 🟠 | F0 |
| UX-09 | Metadatos de llamada destruidos al guardar (duración/transcripción en `notes`) (UI B9) | `ActivityActions.tsx:291-297`; `OpportunityDrawer.tsx:831-835` | 🟠 | F3 / F9 |
| UX-10 | Transcripción manual "al revés" (subir audio) cuando existen stream + transcribe (UI B10) | `ActivityActions.tsx:420-428` | 🟡 | F5 |
| UX-11 | Insert cliente en `calendar_events` (UI B11) | `ActivityActions.tsx:741-760` | 🟡 | F9 |
| UX-12 | `salesperson_id` no declarado en `OpportunityFull` (UI B12) | `OpportunityDrawer.tsx:508,132-160` | ⚪ | F9 |
| UX-13 | Timeline de oportunidad nunca muestra WhatsApp (solo customer) (UI B15) | `timelineService.ts:300` | 🟠 | F0 (columna) / F9 |
| UX-14 | `Badge variant success/warning` a verificar en `badge.tsx` (UI B16) | `OpportunityCard.tsx:41-45`; `KanbanColumn.tsx:81` | ⚪ | F9 |
| UX-15 | `onClick` en el mismo nodo que `dragHandleProps` (UI B17) | `PipelineStages.tsx:920-921` | 🟡 | F9 |
| UX-16 | APIs sin UI: `voice-agents/**`, `voice-agent-calls`, `sequences/**`, `ia/next-action`, `ia/discovery-summary` (UI B18) | — | 🟠 | F6 / F8 / F9 |
| UX-17 | Efecto async dentro de `useState` initializer (UI B3) | `ActivityActions.tsx:475-487` | 🟡 | F0 |
| UX-18 | Compose de email = textarea HTML crudo; sin editor visual ni plantillas ni adjuntos (msg D) | `ActivityActions.tsx:571-579` | 🟠 | F7 |
| UX-19 | Sin UI de agentes IA, voces, campañas de agente (IA §2) | — | 🔴 | F6 |
| UX-20 | Sin UI de dominios de email ni de plantillas `templates` (msg B2, B4) | — | 🟠 | F7 |
| UX-21 | `clientes/[id]` sin acciones de contacto ni timeline unificado (UI) | `clientes/[id]/page.tsx` | 🟡 | F9 |
| UX-22 | Nav duplicada e inconsistente (`AppLayout` vs `moduleConfig`) (UI) | `AppLayout.tsx:122-139`; `moduleConfig.ts:136-141` | 🟡 | F0 |
| UX-23 | Capacitor sin `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`/`NSMicrophoneUsageDescription` (UI corrección) | `mobile/` AndroidManifest e Info.plist (⚠️ path exacto no verificado) | 🟠 | F5 / F15 |
| UX-24 | Electron sin softphone ni permisos de micrófono | `electron/src/main/index.ts` | 🟡 | F15 |
| UX-25 | `ActivityType 'meeting'` en UI no admitido por el CHECK | `actividades/types.ts` | 🟡 | F0 |
| UX-26 | 3 librerías DnD, 3 de charts, 2 de toast | `package.json` | ⚪ | F15 |
| UX-27 | Sin visor de transcripción/análisis en `/app/crm/llamadas` pese a existir las APIs | `crm/llamadas/page.tsx` | 🟡 | F4 |
| UX-28 | `AutomationsView` anuncia "por etapa próximamente" | `AutomationsView.tsx` | 🟡 | F8 |

### 7.5 Resumen por fase

| Fase | SEC | SCH | WIRE | UX | Total |
|---|---|---|---|---|---|
| F0 | 26 + 27, 28, 29 | 12 (01–09, 13, 18, 20) + 23 | 13 (01–03, 10–12, 22, 27, 29, 38, 39, 40, 47, 48, 50) + 51, 53 | 6 (07, 08, 13, 17, 22, 25) | 63 |
| F3 | — | 19 | 07, 09, 28, 49 | 09 | 6 |
| F4 | — | 11 | 04, 05, 36, 37, 44 | 27 | 7 |
| F5 | — | 17 | 06, 29 | 10, 23 | 5 |
| F6 | — | 07, 10 | 08, 30–33, 41 | 19 | 9 |
| F7 | 25 | 14 | 14–17, 19–21, 45 | 18, 20 | 12 |
| F8 | 20 | 07, 08, 12, 15, 16 | 18, 22, 23, 35 | 16, 28 | 12 |
| F9 | — | — | 24, 42, 43, 46, 47 | 01–06, 09, 11–16, 21 | 19 |
| F16 | — | 13, 21, 22 | 13, 25, 26, 27, 34, 43 | — | 9 |
| F4 (+) | — | 24 | — | — | +1 (SCH-24) |
| F9–F14 (+) | — | — | 52 | — | +1 (WIRE-52) |
| F15 | — | — | — | 23, 24, 26 | 3 |

(Un mismo hallazgo puede aparecer en dos fases cuando F0 aplica la corrección mínima y la fase funcional la completa.)

---

## 8. Lo que SÍ funciona hoy end-to-end (no romperlo)

1. Bandeja de chat → WhatsApp/Messenger/Instagram saliente: `bandeja/page.tsx:334-346` inserta `messages{direction:'outbound', role:'agent', channel_id, content}` → `trg_channel_dispatch` → Edge Function `channel-dispatch` → proveedor → `message_events`. **Este es el path que reutiliza F16.**
2. WhatsApp inbound **QR/Evolution** (`qr/inbound` → `mapEvolutionWebhook :119-207` → `processInboundCallback`). **Corrección ronda 2**: el inbound por **Cloud API** (`whatsapp/webhook` POST → `processWebhookPayload`) enruta el payload pero no persiste el mensaje (SCH-21); no cuenta como funcionando.
3. Email individual desde oportunidad (happy path Resend) + webhook Resend con Svix, idempotencia por `provider_event_id` y supresión escrita.
4. `twilioService.send` (SMS/WA por Twilio) con créditos y `comm_usage_logs` (sin UI que lo llame bien).
5. Segmentos (`getSegmentCustomers`, `previewFilter`, `applyFilter`).
6. Editor de plantillas de notificaciones (`notification_templates`).
7. AI assistant (`improve-text`, `generate-image`, `seo`, `pm-*`, `transcribe`) con créditos; chat AI.
8. Agente de voz entrante hotel/PMS: Twilio → `/api/integrations/twilio/voice/incoming` → CR → Railway ws → gpt-4o + 7 tools PMS → `comm_usage_logs`.
9. Transcripción manual de audio (`/api/crm/transcribe`, sin persistencia).
10. CRUD APIs org-scoped de agentes, campañas de agente, secuencias, reglas, llamadas, tags, números; `fn_call_quality`.
11. Provider registry (resolución por org + fallback env) para sus 7 consumidores.
12. Log manual de llamada (`ActivityActions.tsx:299-300`) y registro de reunión.
13. Pipelines por plantilla (sales/onboarding/renewal) y provisión automática al activar CRM (PROGRESS 2026-09).

---

## 9. No verificado en esta ronda (marcar antes de asumir)

- ~~Ruta exacta de la API de `automation_rules`~~ → verificado ronda 2: `api/crm/automation-rules`, `automation-rules/[id]`, `automation-rules/[id]/trigger`, `automation-runs` (4 rutas).
- ~~Conteo de filas de `campaigns`, `campaign_contacts`, `segments`, `calendar_events`, `documents`, `notification_templates`~~ → verificado ronda 2 (`ANEXO-C` §1.1): 4 / 0 / 3 / 8 / 0 / 15.
- ~~Contenido exacto de las políticas de las 7 tablas con 1 sola política~~ → verificado ronda 2 (`ANEXO-C` §2; ver §1.10).
- `Badge` variants `success/warning` en `src/components/ui/badge.tsx`.
- Precios de WhatsApp Meta para Colombia (solo terceros).
- Recargo de voces ElevenLabs dentro de ConversationRelay.
- Compatibilidad de todas las dependencias con Node 22 (F0 lo prueba).
- Paths exactos de `AndroidManifest.xml` e `Info.plist` en `mobile/` (el audit UI reporta el contenido, no el path).
- Si `voice_agent_campaigns`/`voice_agent_calls` tienen políticas RLS completas (el brief dice "RLS ok en la mayoría").
