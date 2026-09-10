# GoAdmin Revenue OS — Plan maestro V4: llamadas, email, WhatsApp y agente IA que funcionan de verdad

> Fecha: **2026-09-08** · Versión: **V4** · Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Repo: `go-admin-erp` (Next.js 15.5 App Router + React 19 + Supabase; Vercel iad1 + Railway ws-server)
>
> Documentos que este plan **reemplaza**: `PLAN.md` V3 (2026-08-31) y `ANEXO-A-INVENTARIO-ACTUAL.md` V3.
> Documentos que **conserva**: `FASE-01`, `FASE-02`, `FASE-10` a `FASE-15` (V3), `ANEXO-B-PROVEEDORES-Y-APIS.md` (se complementa con `docs-*.md` verificados el 2026-09-08).
> Documentos que **reescribe** (V4): `FASE-00`, `FASE-03`, `FASE-04`, `FASE-05`, `FASE-06`, `FASE-07`, `FASE-08`, `FASE-09`. Documento **nuevo**: `FASE-16-WHATSAPP-INDIVIDUAL-Y-MASIVO.md`.

## Qué cambia respecto a V3

| | V3 (2026-08-31) | V4 (2026-09-08) |
|---|---|---|
| Punto de partida | "No existe nada": había que crear `calls`, `voice_agents`, `email_*`, `sequences`, `automation_rules`, `provider_configs`… | **Todo eso ya existe** (30+ tablas, 40+ rutas, 15+ servicios, softphone UI) pero **con 0 filas y bugs que impiden que opere end-to-end** |
| Naturaleza del trabajo | Construir desde cero | **Reparar + conectar + completar + UX** |
| Diagnóstico | Supuesto (lista de huecos) | **Verificado archivo:línea** contra código y Supabase live (4 audits + schema) |
| Proveedores | Elegidos por criterio general | Elegidos con **docs verificadas sep-2026** (modelos vigentes, deprecaciones, precios) |
| Automatización | 4 sistemas paralelos tolerados | **Un solo motor** (`automation_rules` + `sequences`) con outbox + cola + scheduler real |
| Seguridad | 17 bugs (G1–G17) | **26 hallazgos de seguridad** cerrados en F0 antes de cualquier feature |
| Fases | 16 (F0–F15) | 17: F0, F3–F9 reescritas; **F16 WhatsApp** nueva; F1, F2, F10–F15 conservadas |
| Costos | Cualitativo | **Modelo de costos por org** con precios verificados y política de créditos |

---

## 1. Lo que pidió el dueño (5 capacidades) y cómo se cumple

Objetivo literal (resumido): desde el pipeline o el detalle de la oportunidad, (1) llamar por la plataforma o por el celular propio, grabar, transcribir y dejar todo en "actividades recientes"; (2) enviar correos personalizados y profesionales con editor de bloques y modo HTML; (3) WhatsApp individual o masivo; (4) un agente IA que llame, escriba email y WhatsApp y haga lo que el dueño configure por etapa; (5) usar OpenAI, Gemini, Twilio, Resend y ElevenLabs (voz clonada del agente). Todo multi-tenant, "a la perfección", fase por fase.

| # | Capacidad | Fases | Componentes UI | Servicios / rutas | Tablas clave |
|---|---|---|---|---|---|
| 1 | Llamar desde pipeline/oportunidad (navegador **o** celular propio), grabar, transcribir, analizar y dejar la actividad | **F3** (softphone + grabación + consentimiento), **F5** (celular 2 patas), **F4** (transcripción → análisis → actividad), **F9** (timeline) | `SoftphoneProvider`/`SoftphoneDock`/`IncomingCallToast` en layout global; `QuickActionsBar` (Llamar: navegador / mi celular / agente IA); `OpportunityTimeline` + `CallPlayer` + `CallTranscriptPanel` | `/api/voice/token`, `/api/voice/twiml/outbound`, `/api/voice/status`, `/api/voice/recording`, `/api/voice/bridge/*`, `/api/crm/calls/[id]/{transcribe,analyze}`, `/api/crm/jobs/run`; `callManagementService`, `recordingStorageService`, `transcriptionService`, `callAnalysisService`, `mobileBridgeService` | `calls`, `call_recordings`, `call_consents`, `call_transcripts(+segments)`, `call_analyses`, `mobile_call_bridges`, `user_comm_preferences`, `activities(+call_id)` |
| 2 | Correos personalizados y profesionales (bloques + HTML), dominio propio por org | **F7** (+ F0 crea `GET /api/crm/templates`) | `ComposeEmailDialog` (tabs Bloques / HTML / IA / Plantilla; adjuntos; preview; programar); `EmailBlockEditor`; `/app/crm/plantillas`; tab Email en `/app/configuracion?modulo=crm` (dominios + DNS + verificar) | `/api/email/send`, `/api/email/preview`, `/api/email/ai-draft`, `/api/email/domains/[id]/verify`, `/api/email/webhook` (inbound incluido), `/api/crm/templates`; `emailService`, `emailRenderService` (React Email) | `email_domains`, `email_messages`, `email_events`, `templates(+blocks_json)`, `documents` (adjuntos), `contact_consents` |
| 3 | WhatsApp individual y masivo | **F16** (+ F0 cierra IDOR/firma) | `ComposeWhatsAppDialog` (individual/masivo, plantilla HSM con variables, indicador ventana 24h, preview); `CampanaNuevaPage` mejorada; tab WhatsApp en configuración (canal, plantillas, opt-out) | `/api/crm/messages/send`, `/api/crm/campaigns/[id]/send`, `/api/integrations/whatsapp/templates` (create/sync), `/api/integrations/whatsapp/webhook`; `messagingService`, Edge Function `channel-dispatch` (existente) | `messages(+related_opportunity_id)`, `conversations`, `channels`, `channel_credentials`, `templates(channel='whatsapp')`, `campaigns`, `campaign_contacts`, `outbound_jobs`, `contact_consents` |
| 4 | Agente IA multicanal por etapa (vender, agendar, confirmar demo, cobrar, reactivar, calificar, custom) | **F6** (agente) + **F8** (motor que lo dispara por etapa) + **F0** (cola) | `/app/crm/agentes-ia` (lista; editor con tabs Propósito / Guion / Voz / Herramientas / Guardarraíles / Horario / Pruebas; simulador; campañas; historial); `AIAgentDialog` en `QuickActionsBar`; `/app/crm/automatizaciones` (reglas por etapa) | `/api/voice/twiml/ai-agent`, `/api/voice/relay/after`, `/api/voice/ai-agent/status`, `/api/crm/voice-agents/**`, `/api/crm/stage-agents`, `/api/crm/voices`, `/api/crm/jobs/run`; `conversationRelayHandler` (agent-aware), `crm/voiceAgentTools` (vivo), `voiceAgentService`, `automationService`, `sequenceService` | `voice_agents`, `stage_agents`, `voice_agent_calls`, `voice_agent_tool_runs`, `voices`, `voice_agent_campaigns`, `crm_events`, `outbound_jobs`, `calendar_events` |
| 5 | Proveedores: OpenAI, Gemini, Twilio, Resend, ElevenLabs (voz clonada) configurables por org | **F0** (registry cifrado + precios + créditos) + F4/F6/F7 | Tab IA en configuración (proveedores, modelos, presupuesto mensual, voces); tab Créditos/costos | `providerRegistry` (cifrado, sin placeholders), `/api/crm/provider-configs`, `/api/crm/usage`; RPC `decrement_ai_credits`, `deduct_comm_credits` | `provider_configs`, `provider_pricing`, `voices`, `ai_settings`, `comm_settings`, `ai_usage_logs`, `comm_usage_logs` |

---

## 2. Principios innegociables

Conservados de V3:

1. **Cero hardcode, cero datos de otras organizaciones.** Toda tabla nueva lleva `organization_id integer` + RLS `org_member`. GoAdmin es una organización más.
2. **Todo configurable por organización.** Etapas, plantillas, secuencias, agentes, voces, proveedores, presupuesto: datos, no código.
3. **Reutilizar antes de crear.** El path vivo de WhatsApp (`messages` → `trg_channel_dispatch` → Edge Function), `calendar_events`, `documents`, `templates`, `segments`, `campaigns`, `conversations`, RPCs de créditos: se montan encima.
4. **Migraciones solo vía MCP de Supabase** (`apply_migration`). Prohibido crear `.sql` en el repo.
5. **Honestidad técnica.** Lo que la plataforma no permite (grabar llamadas nativas del celular, leer call log) se resuelve con bridge de 2 patas, no con humo.
6. **Frontera de plataforma.** El CRM no toca `organizations`, `subscriptions`, `plans`, `sellers*`. Vendedores = `organization_members.user_id` → `profiles.id`.
7. **Métricas por RPC**, no vistas materializadas.
8. **Consentimiento y compliance primero.**
9. **Tipos de FK verificados**: `organizations.id` es `integer`; el resto del CRM `uuid`.
10. **RLS con política, no solo `ENABLE`.**

Nuevos en V4:

11. **Fail-closed siempre.** Sin `CRON_SECRET` → 401. Sin firma válida del proveedor → 403. Sin token de la (sub)cuenta correcta → no se procesa. Nunca "warn & continue".
12. **Un solo motor de automatización.** `automation_rules` + `sequences` con `crm_events` (outbox) + `outbound_jobs` (cola). Se eliminan `automations` legacy, `followupEngineService`, `AutomationSettings`/`stage_automations`, `EmailNotifications.ts/.tsx` y las heurísticas cliente de `OpportunityAutomations.tsx`.
13. **Una sola shape de `messages`.** `direction`, `role`, `channel_id`, `content`, `content_type`, `payload`, `sender_member_id|sender_customer_id`, `related_opportunity_id`. Inbound también rellena `content`.
14. **Todo envío saliente pasa por cola/outbox.** Nada corre "desde el browser cada 5 s". El único scheduler es `pg_cron` + `pg_net` → `/api/crm/jobs/run` (Vercel cron como respaldo con el mismo header).
15. **Créditos atómicos antes del proveedor.** RPC (`decrement_ai_credits`, `deduct_comm_credits`) con `cost_amount` real desde `provider_pricing`; si no hay saldo, no se llama al proveedor.
16. **Cero fallback "primera org".** `organization_id` viene de la sesión (`getServerOrgContext`) o de un identificador persistido (`CallSid`, `phone_numbers.e164`, `tags.tenant_id`, `channel_id`). Si no resuelve, se rechaza.
17. **Secretos cifrados y nunca seleccionados con cliente anon.** `provider_configs.credentials` y `channel_credentials.credentials` se leen solo server-side con service role y se descifran en memoria.
18. **Cada fase se corta en ≥ 9.5/10 con `/loop`** (builder → tester → qa-reviewer) y con una org de prueba distinta a GoAdmin.

---

## 3. Diagnóstico verificado 2026-09-08

Fuentes: `audit-ui.md`, `audit-telephony.md`, `audit-messaging.md`, `audit-ai-automations.md`, schema live (todas en el brief). Detalle completo con archivo:línea, severidad y fase en `ANEXO-A-INVENTARIO-ACTUAL.md §7` (mapa de bugs SEC/SCH/WIRE/UX).

### 3.1 Resumen ejecutivo: las 12 causas raíz por las que "no funciona"

| # | Causa raíz | Evidencia (archivo:línea) | Efecto visible | Fase |
|---|---|---|---|---|
| R1 | `resolveOrgFromExternal` crashea: usa `createServerClient` de `@supabase/ssr` sin `cookies` | `src/lib/utils/orgContext.ts:89-93`; rethrow en `voice/status:55-67`, `voice/recording:61-73`, `twiml/outbound:47-62`, `twiml/inbound:45-58` | **Todos los webhooks Twilio devuelven 500**; toda llamada entrante falla; ninguna saliente llega a grabar | F0 |
| R2 | El softphone nunca registra: el token exige `TWILIO_API_KEY/API_SECRET/TWIML_APP_SID` desde `provider_configs` (0 filas) y el fallback env solo tiene SID/TOKEN | `voiceTokenService.ts:44-56`, `providerRegistry.ts:18`, `SoftphoneProvider.tsx:213-217`, `CallButton.tsx:56` | `deviceState='error'`, botón Llamar deshabilitado siempre | F0/F3 |
| R3 | `TWILIO_WEBHOOK_BASE_URL` tiene dos significados (origin vs `…/api/integrations/twilio`) y 7 call sites anteponen el path completo | `twilioConfig.ts:83`; `voice/call:89-91`, `mobileBridgeService.ts:159-160`, `agent-leg:113,130-131`, `customer-leg:116-117`, `bridge/status:66`, `voiceAgentService.ts:838,843` | URLs `…/api/integrations/twilio/api/voice/…` → 404 y firma 403 | F0 |
| R4 | Uniones TS y CHECKs de BD no coinciden en `calls` y `call_recordings` | `callManagementService.ts:15-24` (`click-to-call`, `queued`, `in-progress`…), `voice/call:113,119`, `voice/status:143-164`, `callManagementService.ts:449` (`updated_at` inexistente), `voice/recording:182-195` (`status 'completed'`) | `23514` en cada insert/update: ninguna llamada ni grabación puede persistirse | F0 |
| R5 | Bucket `crm-call-recordings` no existe; el servicio lo asume y además toma el bucket del primer segmento del `storage_path` | `recordingStorageService.ts:18`; `transcriptionService.ts:415-417` | Upload de grabación falla; transcripción busca en bucket `org_7` | F0/F4 |
| R6 | Transcripción filtra `call_recordings.status='available'` (valor inexistente) | `transcriptionService.ts:365,380` | Siempre `NO_RECORDING`; nunca se transcribe | F4 |
| R7 | Doble marcación: el browser hace `POST /api/voice/call` (Twilio marca al cliente por REST) **y luego** `device.connect()`; el TwiML vuelve a `<Dial><Number>` | `SoftphoneProvider.tsx:266-286`, `twiml/outbound:121-123` | Cliente recibe dos llamadas; leg browser sin fila `calls` → sin consentimiento ni grabación | F3 |
| R8 | Botones del pipeline apuntan a rutas inexistentes o con contrato equivocado | `ActivityActions.tsx:272` (`/api/integrations/twilio/click-to-call` 404), `:478` (`/api/email/templates` 404), `:619-627` (WhatsApp Cloud 400 / Twilio 401) | Click-to-call, plantillas y WhatsApp desde la oportunidad **no funcionan** | F0/F16 |
| R9 | Una llamada nunca genera una `activity`: ni ruta `voice/*`, ni servicio, ni trigger BD; el único código que lo hacía (`callService.createCallActivity`) está muerto | `audit-telephony §4`; `callService.ts:87-109` (solo en `guardrails.test.ts:202`); `opportunitiesService.createActivity:571-594` nunca escribe `channel/outcome/duration_seconds` | "Actividades recientes" no muestra llamadas; duración va concatenada en `notes` | F3 |
| R10 | No existe scheduler: `vercel.json` (10 crons, 0 CRM) y `pg_cron` (7 jobs, 0 CRM); no hay cola | `audit-ai §6`; `sequences/run`, `campaigns/run`, `followup/run` nunca invocados; `qr/dispatch-pending` se dispara desde cada pestaña cada 5 s (`bandeja/page.tsx:57-67`) | Secuencias, campañas y agentes "en papel" | F0 |
| R11 | El agente de voz descarta su configuración y sus tools están rotas | `twiml/ai-agent/route.ts:63-66` (selecciona 6 columnas; ignora `first_message`, `voice_id`, `llm_model`…), `:101-108` (sin `ttsProvider/voice`); `conversationRelayHandler.ts:105-106,179-180` (descarta `agentId/callId`), `:356-359` (tool calls malformados), `:462-479` (prompt de hotel/PMS); `crm/voiceAgentTools.ts` con 0 importadores | El agente es un recepcionista de hotel con voz por defecto de Twilio y sin acciones CRM | F6 |
| R12 | Campañas y automatizaciones rotas por schema y por fragmentación | `crm/voiceAgentService.ts:517,592,616,781` (`customers.timezone/do_not_call/do_not_call_list` no existen); `CampanasService.ts:247-263` (solo `UPDATE status='sending'`, `campaign_contacts` nunca escrito); 4 sistemas de automatización paralelos (`audit-ai §5`); `sequenceService.ts:616-617` y `automationService.ts:499-500` (`related_id` vs `related_to_id`, status `pending` inválido) | Campañas encolan nada; reglas nunca se evalúan; pasos de tarea siempre fallan | F0/F8/F16 |

### 3.2 Tablas del plan V3 que existen con 0 filas (verificado live)

| Dominio | Tablas (todas con 0 filas) | RLS |
|---|---|---|
| Telefonía | `calls`, `call_recordings`, `call_transcripts`, `call_transcript_segments`, `call_analyses`, `call_tags`, `call_tag_relations`, `call_consents`, `phone_numbers`, `mobile_call_bridges` | ✅ políticas `org_member` (patrón `calls`) |
| Agente IA | `voice_agents`, `voice_agent_calls`, `voice_agent_campaigns` | ✅ |
| Email | `email_domains`, `email_messages`, `email_events`, `templates` | ✅ |
| Automatización | `sequences`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs`, `automation_rules`, `automation_runs` | ✅ |
| Config | `provider_configs` (0 filas → 100 % env global) | ✅ |
| Documentos | `documents` | ✅ (bucket `crm-documents` privado existe) |
| A revisar (1 sola política) | `scoring_configs`, `loss_reasons`, `health_score_configs`, `health_score_snapshots`, `opportunity_stage_history`, `opportunity_products`, `opportunity_spaces` | 🟡 F0 verifica que la política cubra `FOR ALL` con `WITH CHECK` |

Datos vivos que sí existen y condicionan el diseño: `comm_settings` 31 filas (fallback "primera org activa" es real riesgo cross-tenant), `ai_usage_logs` 111 339 filas (único subsistema IA en producción), `automations` 1 fila (migrar a `automation_rules`), `customers` 31 620, `opportunities` 25.

### 3.3 Hallazgos de seguridad críticos (se cierran TODOS en F0)

Numeración del mapa unificado (`ANEXO-A §7.1`); entre paréntesis el id del audit original.

| # | Hallazgo | Archivo:línea |
|---|---|---|
| SEC-01 | `twilio/verify/send` y `verify/check` sin auth y excluidos del middleware → SMS pumping con cuenta master (msg C1) | `verify/send/route.ts:9-25`, `middleware.ts:83,778` |
| SEC-02 | IDOR WhatsApp: `whatsapp/send` sin `getServerOrgContext`, `channel_id` y `organization_id` del body con service role; mismo patrón en `mark-read`, `qr/send`, `qr/start|stop|logout|status` (msg C2) | `whatsapp/send/route.ts:7-38,111-130` |
| SEC-03 | Webhook WhatsApp no verifica `X-Hub-Signature-256` (comentario "se salta"); el verificador usa `===` no constant-time (msg C3) | `whatsapp/webhook/route.ts:27,36-38`; `whatsappCloudConfig.ts:71-82` |
| SEC-04 | IDOR Twilio: `send-whatsapp` y `send-sms` toman `orgId` del body sin membership (msg C4) | `send-whatsapp/route.ts:29-38`, `send-sms/route.ts:30-39` |
| SEC-05 | `sendgrid/send` y `notifications/process` aceptan `connection_id/organization_id` del body sin ownership (msg C5) | `sendgrid/send/route.ts:20-51`, `notifications/process/route.ts:23-32` |
| SEC-06 | `sendgrid/webhook` verifica solo si hay headers y usa `connections[0]` → org equivocada (msg C6) | `sendgrid/webhook/route.ts:31-38,60-74` |
| SEC-07 | `incoming-message` construye TwiML sin escapar y valida firma solo en producción (msg C7) | `incoming-message/route.ts:28-34,50-53` |
| SEC-08 | Secretos en claro alcanzables desde el browser: `select('*')` de `channel_credentials` con cliente anon; `integration_credentials.secret_ref` plano (msg C8) | `chatChannelsService.ts:192-197,236-241`, `WhatsAppCredentialsCard.tsx:39-42`, `sendgridService.ts:29-49`, `providerRegistry.ts:57-73` |
| SEC-09 | Código server usa cliente browser (RLS sin sesión → escrituras descartadas en silencio) (msg C9; voz C15) | `twilioService.ts:9`, `twilioWebhook.ts:9`, `notificationService.ts`, `followupEngineService.ts:1`, `twilioSubaccounts.ts:9` |
| SEC-10 | `qr/dispatch-pending` sin org ni `CRON_SECRET`, service role, todas las orgs, invocado cada 5 s por pestaña (msg C10) | `qr/dispatch-pending/route.ts:9-40` |
| SEC-11 | `whatsapp/validate` autentica pero no autoriza `channel_id` (msg C11) | `whatsapp/validate/route.ts` |
| SEC-12 | `getServerOrgContext` toma la membresía más antigua con `.limit(1)` si no llega `X-Organization-Id` (msg C21) | `orgContext.ts:58-66` |
| SEC-13 | Fallback a "primera org activa" al resolver número entrante (msg C22; voz C11; IA C-G) | `twilioWebhook.ts:151-163`, `twilio/voice/incoming/route.ts:129-140`, `conversationRelayHandler.ts:493-502` |
| SEC-14 | `/api/crm/followup/run` fail-open (`if (expectedToken)`) con `organization_id` del body (msg C24; IA C-C) | `followup/run/route.ts:18-27` |
| SEC-15 | Endpoints IA sin auth con `organizationId` del body y service role: `chat/ai/auto-response` (debita créditos), `ai-assistant/{improve-text,generate-image,pm-assist,pm-planner,seo-keywords,chat,reportes}` (IA C-A) | `chat/ai/auto-response/route.ts:9-21,181`; `improve-text:17`, `generate-image:8`, `pm-assist:59-60`, `pm-planner:48`, `seo-keywords:18-26`, `chat/route.ts:6`, `reportes:11` |
| SEC-16 | `chat/ai/{generate-response,classify-intent,generate-summary}` verifican user pero confían en org del body; `consumeAICredits` con service role → drenar créditos ajenos (IA C-B) | `generate-response/route.ts:11-17` |
| SEC-17 | JWT anon hardcodeado (IA C-D) | `ai-assistant/dynamic-options/route.ts:6` |
| SEC-18 | Firma Twilio opcional ("warn & continue") en 8 rutas voice; `twiml/ai-agent` la salta si falta `TWILIO_MASTER_AUTH_TOKEN`; `incoming` solo en producción (IA C-E; voz C12) | `twiml/ai-agent/route.ts:41-42`, `voice/status:36`, `twilio/voice/incoming/route.ts:33` |
| SEC-19 | Updates/lookups con service role sin `organization_id`: `voice_agent_calls` por id, `calls` por `provider_call_sid`, `mobile_call_bridges` por id (PII de `customers` en `agent-leg`) (IA C-F; voz C14, C19) | `twiml/ai-agent:84-91`, `bridge/status:121,134`, `agent-leg:63-68,92-102`, `customer-leg:61-65` |
| SEC-20 | `update_field` escribe en tabla/columna arbitraria del JSON del usuario (IA C-H) | `automationService.ts:534-547` |
| SEC-21 | `ws-server` sin autenticación en el upgrade: cualquiera abre una sesión facturada de OpenAI y debita créditos (voz C22) | `ws-server.ts:41-48`, `conversationRelayHandler.ts:274,410` |
| SEC-22 | `validateTwilioSignature` usa el token master aunque la org use subcuenta → webhooks de subcuenta nunca validan (voz C12) | `twilioWebhook.ts:25` |
| SEC-23 | URL de firma reconstruida desde `request.url` (frágil tras Vercel) o desde `getWebhookBaseUrl` (erróneo) (voz C13) | rutas `voice/*` |
| SEC-24 | `consumeAICredits` read-modify-write no atómico; existe RPC `decrement_ai_credits` (IA C-10) | `aiCreditsService.ts:209-234` |
| SEC-25 | Supresión `do_not_email` se escribe pero nunca se lee en `sendEmail`, secuencias ni campañas (msg C18) | `emailService.ts:799` vs `:231-394` |
| SEC-26 | Rutas IA que no debitan créditos (`crm/ia/*`, `crm/transcribe`, `calls/[id]/{transcribe,analyze}`, `ai-assistant/chat`, loop LLM de ConversationRelay) | `audit-ai §1` |

---

## 4. Arquitectura objetivo

### 4.1 Flujo de llamada desde el navegador (F3 + F4)

```
Vendedor en tarjeta / drawer / detalle
  │ clic "Llamar → Navegador"   (QuickActionsBar → useSoftphone().connect)
  ▼
SoftphoneProvider (montado en src/app/app/layout.tsx; Device registrado con /api/voice/token; identity = userId)
  │ device.connect({ params: { To, opportunityId, customerId } })        ← NO hace POST /api/voice/call
  ▼
Twilio (TwiML App VoiceUrl) ── POST /api/voice/twiml/outbound   From=client:{userId}, To, params
  ▼
API: firma validada con el token de la (sub)cuenta (por AccountSid) → org por identity (organization_members) → comm_settings (server, service role)
  │ INSERT calls { mode:'browser', status:'dialing', direction:'outbound', from_number: voice_caller_id, to_number: To,
  │                opportunity_id, customer_id, user_id, recording_enabled, consent_given:false }
  │ TwiML:
  │   <Say language="es-MX" voice="Polly.Mia-Neural">{comm_settings.voice_consent_message}</Say>   (no desactivable si graba)
  │   <Dial callerId="{voice_caller_id}" record="record-from-answer-dual"
  │         recordingStatusCallback="/api/voice/recording" recordingStatusCallbackEvent="completed absent">
  │     <Number statusCallback="/api/voice/status" statusCallbackEvent="initiated ringing answered completed">{To}</Number>
  │   </Dial>
  │ INSERT call_consents { call_id, consent_type:'recording', announced_at, method:'ivr', locale:'es-MX', recorded_announcement_text }
  ▼
Twilio marca al cliente (una sola vez) ── conversación ── cuelga
  │ POST /api/voice/status   → UPDATE calls (status mapeado al CHECK, answered_at, ended_at, duration_seconds=CallDuration, ring_seconds; orden por SequenceNumber)
  │ POST /api/voice/recording → INSERT call_recordings { status:'processing', channels:'2', provider_recording_sid, storage_path (destino) }
  │                              → outbound_jobs { kind:'recording_fetch' } → GET Recordings/{Sid}.mp3?RequestedChannels=2 (Basic Auth API Key)
  │                              → Storage crm-call-recordings/org_{id}/{yyyy}/{mm}/{callId}.mp3 → status 'ready', retention_until
  ▼
trigger trg_calls_completed_activity (AFTER UPDATE OF status ON calls WHEN NEW.status='completed')
  │ INSERT/UPDATE activities { activity_type:'call', channel:'voice', call_id, duration_seconds, outcome, related_type:'opportunity', related_id, user_id }
  ▼
outbound_jobs { kind:'transcribe' }  → pipeline §4.3 → activities.notes = resumen; metadata { transcript_id, analysis_id, sentiment, quality_score, next_steps }
  ▼
OpportunityTimeline (consumidor de /api/crm/timeline) → TimelineEntryCard(call) = CallPlayer + CallTranscriptPanel + análisis
```

Entrantes: `POST /api/voice/twiml/inbound` resuelve la org por `phone_numbers.e164 = To` (sin fallback), inserta `calls{mode:'inbound'}` y responde `<Dial><Client>{phone_numbers.assigned_user_id}</Client></Dial>` (hoy hardcodea `incoming`, `twiml/inbound:130`). `IncomingCallToast` global acepta/rechaza.

### 4.2 Flujo de llamada desde el celular personal, 2 patas (F5)

```
Vendedor: "Llamar → Mi celular"  (QuickActionsBar; muestra el número guardado en user_comm_preferences.mobile_phone_e164)
  │ POST /api/voice/call { mode:'bridge', to, opportunityId, customerId }   (sesión)
  ▼
API (server): lee user_comm_preferences (nunca del body) → comm_settings → créditos
  │ INSERT mobile_call_bridges { status:'initiating', agent_phone, target_phone, user_id, opportunity_id, confirm_digit_required:true, whisper_text }
  │ INSERT calls { mode:'bridge', bridge_mode:'agent_leg', from_number: caller_id, to_number: target, status:'dialing' }
  │ twilio.calls.create({ to: agentPhone, from: callerId, url: '{BASE}/api/voice/twiml/agent-leg?bridgeId=…',
  │                       statusCallback: '{BASE}/api/voice/bridge/status?leg=agent&bridgeId=…', statusCallbackEvent:['initiated','ringing','answered','completed'], timeout: ring_timeout })
  ▼
PATA 1: suena el celular del vendedor
  │ contesta → TwiML agent-leg (firma + bridge org-scoped):
  │   <Say language="es-MX" voice="Polly.Mia-Neural">{whisper: "Conectando con {cliente}. Pulse 1 para continuar"}</Say>
  │   <Gather numDigits="1" action="{BASE}/api/voice/twiml/customer-leg?bridgeId=…" timeout="8"/>
  │   (sin dígito → status 'agent_rejected', calls 'canceled')
  ▼
PATA 2: TwiML customer-leg (dígito 1):
  │   <Say language="es-MX" voice="Polly.Mia-Neural">{voice_consent_message}</Say>
  │   <Dial callerId="{caller_id}" record="record-from-answer-dual" answerOnBridge="true"
  │         recordingStatusCallback="{BASE}/api/voice/recording" action="{BASE}/api/voice/bridge/status?leg=dial&amp;bridgeId=…">
  │     <Number statusCallback="{BASE}/api/voice/bridge/status?leg=customer&amp;bridgeId=…" statusCallbackEvent="initiated ringing answered completed">{cliente}</Number>
  │   </Dial>                                            (& escapado como &amp;; hoy rompe con error 12100)
  ▼
Cliente contesta → conversación (vendedor en su celular; Twilio en medio grabando ambos canales)
  ▼
bridge/status → mobile_call_bridges.status (initiating→agent_ringing→agent_answered→customer_dialing→in_progress→completed|failed|agent_no_answer|agent_rejected)
             → calls.status/duration (siempre con organization_id del bridge) → trigger → activity
recording   → misma pipeline que §4.1 → transcripción → análisis → actividad enriquecida
```

Capacitor/Electron: el bridge no necesita SDK; Electron además soporta `@twilio/voice-sdk` (modo navegador); Capacitor puede añadir `@capgo/capacitor-twilio-voice` en F15 (permisos `RECORD_AUDIO`, `NSMicrophoneUsageDescription`).

### 4.3 Pipeline grabación → transcripción → análisis → actividad (F4)

```
call_recordings.status = 'ready'
  │ (recording_fetch encola)
  ▼
outbound_jobs { kind:'transcribe', payload:{ call_id, recording_id }, dedupe_key:'transcribe/{recording_id}' }
  │ /api/crm/jobs/run (cron 1 min) → fn_claim_jobs('transcribe', 5)  FOR UPDATE SKIP LOCKED
  ▼
transcriptionService.transcribeCall(recordingId)
  │ 1) provider_pricing → costo estimado → deduct_comm_credits(org,'voice_stt',…) atómico; sin saldo → job 'failed' + activity nota "sin créditos"
  │ 2) descarga desde Storage: bucket fijo 'crm-call-recordings', path = call_recordings.storage_path
  │ 3) ElevenLabs Scribe v2:  client.speechToText.convert({ file, modelId:'scribe_v2', languageCode:'spa', diarize:true, numSpeakers:2,
  │                                                        timestampsGranularity:'word' })       ($0.22/h)
  │    fallback Gemini 2.5 Flash (Files API + response_format JSON schema) → fallback OpenAI gpt-transcribe (languages:['es'], sin diarización)
  │ 4) roles por CANAL (dual): channel_index 0 = quien originó → outbound: agente; inbound: cliente. Nunca "speaker 0 = agente"
  ▼
call_transcripts { status:'completed', provider, provider_model, language:'es', full_text, word_count, speaker_count, cost_amount }
call_transcript_segments { speaker_label, speaker_role agent|customer, start_ms, end_ms, text, confidence }
  │ encola outbound_jobs { kind:'analyze' }
  ▼
callAnalysisService.analyzeCall(callId)
  │ contexto REAL: opportunities.name (no title), stages del pipeline de la oportunidad (catálogo válido), customers.full_name/first_name
  │ Gemini 2.5 Flash con responseSchema (existente) → fallback OpenAI gpt-5.6-luna structured outputs (reasoning.effort:'none')
  │ decrement_ai_credits antes de llamar
  ▼
call_analyses { summary, sentiment ∈ positive|neutral|negative|mixed, sentiment_score, quality_score, quality_breakdown, talk_ratio_*,
                next_steps[], detected_objections[], detected_competitors[], budget_mentioned, decision_maker_identified,
                discovery_fields, suggested_stage_id (validado contra el pipeline), suggested_stage_confidence, suggested_tasks[] }
  │ applyAutoTags → call_tag_relations (source:'ai')
  ▼
UPDATE activities SET notes = summary, outcome = sentiment,
       metadata = metadata || { transcript_id, analysis_id, sentiment, quality_score, next_steps, suggested_stage_id }
INSERT crm_events { type:'call.analyzed', entity:'opportunity' }   → F8 (reglas: crear tarea, notificar, sugerir etapa)
  ▼
UI: CallTranscriptPanel (Transcribir / Analizar / Aplicar sugerencias) dentro de la TimelineEntryCard; /analysis/apply mueve etapa (gates) y crea tasks (related_to_id)
```

### 4.4 Email: editor → render React Email → Resend → webhook → timeline; inbound (F7)

```
ComposeEmailDialog  [Bloques | HTML | Redactar con IA]  + Plantilla + Variables + Adjuntos (documents) + Preview + Test + Programar
  │ POST /api/email/preview { blocks_json | html, context:{ opportunity_id } }  → emailRenderService (React Email) → HTML + text
  │ POST /api/email/send    { to, cc, bcc, subject, template_id?, blocks_json?, html?, variables, attachments:[document_id], scheduled_at?, related_type:'opportunity', related_id }
  ▼
emailService.sendEmail (server)
  │ fn_can_contact(customer_id,'email') = false → 422 { code:'DO_NOT_EMAIL' }
  │ dominio: email_domains (org, status='verified', is_default) → from "{from_name} <{from_email}>", reply_to; API key sending_access (vault) → sin dominio verificado → 422 { code:'NO_VERIFIED_DOMAIN' }
  │ render: templates.blocks_json → React Email (@react-email/components) | html crudo saneado; variables {{contact.first_name|cliente}} con escape HTML
  │ INSERT email_messages { status:'pending', idempotency_key:'email/{id}' (determinista), to_customer_id, related_type, related_id, body_html_snapshot }
  │ resend.emails.send({ from, to, subject, html, text, reply_to, attachments:[{ filename, content }], scheduled_at,
  │                       headers:{ 'List-Unsubscribe':'<{APP}/unsubscribe/{token}>', 'List-Unsubscribe-Post':'List-Unsubscribe=One-Click' },
  │                       tags:[{name:'tenant_id',value:org},{name:'email_message_id',value:id},{name:'related_type',value},{name:'related_id',value}] },
  │                     { idempotencyKey:'email/{id}' })
  │ UPDATE email_messages { status:'sent', provider_message_id, sent_at }
  │ INSERT activities { activity_type:'email', channel:'email', email_message_id, related_type, related_id }   (ÚNICA: ActivityActions deja de crear otra)
  ▼
Resend → POST /api/email/webhook  (resend.webhooks.verify sobre raw body; tags llega como OBJETO)
  │ email_events { provider_event_id UNIQUE } → email_messages.status por orden lógico (sent<delivered<opened<clicked; bounced/complained terminales) + open_count/click_count atómicos
  │ email.bounced (Permanent) / email.complained → contact_consents { email, opted_out, source:'bounce|complaint' }
  │ crm_events { type:'email.opened|clicked|bounced' } → F8
  ▼
Inbound: Resend Receiving en crm.{dominio} (MX) → email.received (solo metadata) → GET /emails/receiving/{id} → email_messages { direction:'inbound', in_reply_to } enlazado por In-Reply-To/References
       → activity 'email' (inbound) → timeline muestra el hilo; crm_events { type:'email.replied' } (secuencia sale / vendedor notificado)
Baja pública: GET /unsubscribe/[token] → contact_consents { email, opted_out, source:'unsubscribe_link' } (+ POST one-click)
```

### 4.5 WhatsApp: compose → messages → trg_channel_dispatch → Edge Function; campañas → outbound_jobs (F16)

```
INDIVIDUAL
ComposeWhatsAppDialog (desde QuickActionsBar): indicador de ventana 24h (conversations.last_message_at del último inbound), texto libre o plantilla HSM APPROVED con variables, preview, "ver hilo"
  │ POST /api/crm/messages/send { channel:'whatsapp', customer_id, opportunity_id, text? | template?:{ name, language, components } }
  ▼
messagingService.sendOutbound (server; sesión)
  │ fn_can_contact(customer,'whatsapp') → 422 si opted_out
  │ canal: channels (org, type='whatsapp', status activo) + customer_channel_identities (wa_id); si no hay identidad → crear con customers.phone E.164
  │ ventana: último inbound < 24h → texto libre permitido; fuera → exige templates(channel='whatsapp', metadata.status='APPROVED') → 422 { code:'TEMPLATE_REQUIRED' }
  │ deduct_comm_credits(org,'whatsapp', costo desde provider_pricing por categoría)
  │ find/create conversations → INSERT messages { direction:'outbound', role:'agent', channel_id, content (texto renderizado), content_type:'text'|'template',
  │                                              payload:{ template }, sender_member_id, related_opportunity_id }
  ▼
trg_channel_dispatch → Edge Function channel-dispatch (existente) → Meta Cloud API POST /{PHONE_NUMBER_ID}/messages (o Twilio / Evolution según channel_credentials)
  │ message_events { sent } + messages.metadata.dispatched + external_message_id
  ▼
Webhook Meta POST /api/integrations/whatsapp/webhook (X-Hub-Signature-256 timingSafeEqual)
  │ statuses → message_events (delivered/read/failed con error_code; 131049 → marcar customer "marketing_capped_until")
  │ messages inbound → messages { direction:'inbound', role:'customer', content ← payload.text.body } → conversations.last_message_at
  │                  → trigger trg_messages_activity → activities { activity_type:'whatsapp', message_id, related_type:'opportunity' si hay oportunidad abierta }
  │                  → STOP|BAJA|CANCELAR|NO MAS → contact_consents { whatsapp, opted_out, source:'keyword' } + respuesta de confirmación
  │ message_template_status_update → templates.metadata.status (APPROVED|REJECTED|PAUSED|DISABLED) + reason
MASIVO
CampanaNuevaPage: segmento + plantilla HSM APPROVED + mapeo de variables + programación + estimación de costo
  │ POST /api/crm/campaigns/[id]/send   (sesión; campaigns.channel='whatsapp')
  ▼
campaignService.materialize: segments.filter_json → customers (excluye opted_out y sin wa_id) → INSERT campaign_contacts (state pendiente en metadata)
  │ outbound_jobs { kind:'campaign_batch', payload:{ campaign_id } } → por contacto outbound_jobs { kind:'whatsapp', run_at escalonado (1 msg/6 s por wa_id; ≤80 mps global; ráfaga ≤45), dedupe_key:'campaign/{id}/{customer_id}', max_attempts:3 }
  ▼
/api/crm/jobs/run → misma ruta messagingService.sendOutbound (idempotente por dedupe_key) → dispatch
  │ message_events → fn_campaign_mark_sent/…/replied(p_campaign_id, p_customer_id) → campaigns.statistics; error 131049 → no reintentar 24 h; 131056 → backoff 6 s
UI: CampanaDetallePage con métricas reales (fn_get_campaign_metrics), pausar/reanudar (outbound_jobs.status)
```

### 4.6 Agente IA multicanal por etapa (F6, disparado por F8)

```
CONFIGURACIÓN  /app/crm/agentes-ia
  voice_agents { purpose_type ∈ qualify_lead|confirm_demo|follow_up_proposal|reactivate_cold|collect_payment|nps_survey|renewal_reminder|sell_product|book_meeting|custom,
                 system_prompt, first_message, engine conversation_relay|elevenlabs_agent, llm_provider openai|gemini, llm_model, temperature,
                 voice_provider:'elevenlabs', voice_id (FK voices), allowed_tools[], guardrails, transfer_to_human_rules, business_hours, max_turns, max_duration_seconds }
  voices { provider:'elevenlabs', provider_voice_id (IVC), owner_user_id, consent_recorded_at, sample_path }   ← solo voz propia, con consentimiento grabado
  stage_agents { stage_id, voice_agent_id, channel voice|email|whatsapp|multi, trigger_on enter|sla_breach|no_response_days, config:{ delay_minutes, days, max_attempts, fallback_channel } }

DISPARO
  opportunities.stage_id cambia → trg_opp_stage_change_enqueue → crm_events { type:'stage.changed', payload:{ from, to } }
  → /api/crm/jobs/run: stage_agents(trigger_on='enter') + business_hours + fn_can_contact + presupuesto → outbound_jobs { kind:'ai_call' | 'ai_draft' (email/whatsapp), run_at }
  → o manual: AIAgentDialog (elegir agente/propósito, ver guion, "Lanzar ahora" / "Programar") → mismo job
  → o campaña: voice_agent_campaigns (segment | pipeline_stage | manual_list) → campaigns/run → outbound_jobs por contacto (max_calls_per_day, max_concurrent, horario local por customers.timezone)

VOZ (engine conversation_relay)
  jobs/run → voiceAgentService.startCall: deduct_comm_credits('voice_ai') + decrement_ai_credits → INSERT voice_agent_calls { status:'pending' } + calls { mode:'ai_agent', voice_agent_id, from_number, to_number }
  → twilio.calls.create({ to, from, url:'{BASE}/api/voice/twiml/ai-agent?agentId&callId', statusCallback:'{BASE}/api/voice/ai-agent/status', statusCallbackEvent:[…],
                          record:true, recordingChannels:'dual', recordingStatusCallback:'{BASE}/api/voice/recording', machineDetection:'Enable', timeout:25 })
  → TwiML (lee voice_agents completo):
     <Response><Connect action="{BASE}/api/voice/relay/after">
       <ConversationRelay url="wss://{WS}/conversation-relay" language="es-MX" ttsProvider="ElevenLabs" voice="{provider_voice_id}-flash_v2_5"
           transcriptionProvider="Deepgram" speechModel="nova-3-general" welcomeGreeting="{first_message}" interruptible="any" dtmfDetection="true" hints="{org.name},{producto}">
         <Parameter name="agentId" value="…"/><Parameter name="callId" value="…"/><Parameter name="sessionToken" value="{jwt 10 min}"/>
       </ConversationRelay></Connect></Response>
  → ws-server (Railway): valida X-Twilio-Signature en el upgrade + sessionToken en setup.customParameters → carga voice_agents por id+org
  → LLM (gpt-5.6-terra | gemini-3.8-flash | gpt-5.6-luna) con historial de tool calls bien formado y tools CRM filtradas por allowed_tools:
       get_customer_context · move_opportunity_stage (stageGateService) · create_task (related_to_id) · book_meeting (calendar_events + ICS + WA utility)
       send_followup_message (email/whatsapp por §4.4/§4.5) · collect_payment_link (quotations/Stripe link existente) · transfer_to_human (<Dial> al vendedor) · end_call
  → cada tool → voice_agent_tool_runs { tool, args, result, applied_at }
  → end/handoff → /api/voice/relay/after (SessionStatus, HandoffData) + /api/voice/ai-agent/status → voice_agent_calls { completed, outcome, conversation_log, turns_count, duration }
  → calls completed → trigger → activities { activity_type:'ai_call', metadata:{ voice_agent_call_id, outcome, tools:[…] } } → grabación → §4.3 análisis
VOZ (engine elevenlabs_agent, alternativo por org)
  POST /v1/convai/twilio/outbound-call { agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data:{ dynamic_variables, conversation_config_override } }
  → webhook /api/webhooks/elevenlabs (constructEvent) post_call_transcription { transcript, analysis } → mismo mapeo a voice_agent_calls/activities; tools = webhook tools apuntando a /api/crm/agent-tools/[tool] con firma
EMAIL / WHATSAPP POR AGENTE
  outbound_jobs { kind:'ai_draft', payload:{ channel, agent_id, opportunity_id } } → gpt-5.6-luna redacta (propósito + guion + guardarraíles + contexto de la oportunidad) → §4.4 / §4.5 → activity
  → respuesta inbound (email.replied / whatsapp.replied) → crm_events → siguiente turno (máx N) o handoff al vendedor (tarea + notificación)
```

### 4.7 Motor de automatizaciones y secuencias: outbox + cola + scheduler (F0 + F8)

```
PRODUCTORES → crm_events (outbox: id, organization_id, type, entity_type, entity_id, payload, created_at, processed_at, error)
  • trg_opp_stage_change_enqueue  AFTER UPDATE OF stage_id ON opportunities        → 'stage.changed'
  • trg_calls_completed_activity                                                    → 'call.completed' ; F4 → 'call.analyzed'
  • /api/email/webhook                                                              → 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.replied'
  • /api/integrations/whatsapp/webhook                                              → 'whatsapp.replied' | 'whatsapp.opted_out'
  • pg_cron diario (fn_enqueue_schedule_events): sla_breach (stages.sla_days), no_response_days, recontact_at, renewals
  • UI "Ejecutar ahora" (manual)                                                    → 'manual'
        │
SCHEDULER  pg_cron '* * * * *' → net.http_post('{APP_URL}/api/crm/jobs/run', headers:{ Authorization:'Bearer {CRON_SECRET}' })
           pg_cron '*/5 * * * *' → jobs/run?scope=campaigns ; '0 3 * * *' → jobs/run?scope=maintenance (retención grabaciones, limpieza jobs dead)
           vercel.json cron equivalente como respaldo (mismo header); sin CRON_SECRET → 401 SIEMPRE
        ▼
/api/crm/jobs/run (service role; ≤ 50 s por invocación)
  1) drena crm_events no procesados (por org) → automationService.evaluateTrigger(rule) → conditions (campo/operador/valor sobre opportunity+customer) → actions
     · inmediatas: create_task, create_activity, update_field (allow-list opportunities.{next_action,temperature,next_contact_at,…} / customers.{lifecycle_stage,tags}), notify_user, enroll_sequence
     · diferidas: send_email, send_whatsapp, send_sms, start_ai_call, ai_draft_email, book_meeting, webhook → outbound_jobs
     · automation_runs { status, result, error_message }
  2) sequences: sequence_step_runs con scheduled_at ≤ now → outbound_jobs por canal
     · email | whatsapp | sms | call (tarea "Llamar a X" al vendedor) | ai_call | task | wait | condition (evaluada de verdad: opened?/replied?/stage=?/field op value)
     · exit_conditions reales: replied, stage_changed, won/lost, opted_out
  3) fn_claim_jobs(p_kind, p_limit) FOR UPDATE SKIP LOCKED → handler por kind → done | failed (attempts+1, run_at = backoff 1m/5m/30m) | dead (attempts ≥ max_attempts)
  4) métricas: jobs procesados, fallos, latencia → logs estructurados (Sentry)
UI   /app/crm/automatizaciones (reglas por etapa; reemplaza AutomationsView + AutomationSettings) · /app/crm/secuencias (builder de pasos) · historial de runs por oportunidad en el timeline
```

### 4.8 Topología de despliegue y dónde vive cada secreto

```
┌──────────────────────── Vercel iad1 — Next.js 15 App Router (Node 22) ────────────────────────┐
│ UI + Route Handlers: /api/voice/*, /api/email/*, /api/crm/*, /api/integrations/*, /api/webhooks/* │
│ Env (secretos de plataforma):                                                                    │
│   SUPABASE_SERVICE_ROLE_KEY · CRON_SECRET · APP_ENCRYPTION_KEY (AES-256-GCM para provider_configs) │
│   TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN / TWILIO_API_KEY / TWILIO_API_SECRET / TWILIO_TWIML_APP_SID (fallback master) │
│   TWILIO_WEBHOOK_BASE_URL (= origin puro, p.ej. https://app.goadmin.io) · WS_SERVER_URL (wss://…)  │
│   RESEND_API_KEY (full_access, solo para crear dominios/keys) · RESEND_WEBHOOK_SECRET               │
│   ELEVENLABS_API_KEY · ELEVENLABS_WEBHOOK_SECRET · OPENAI_API_KEY · GOOGLE_AI_API_KEY              │
│   META_APP_ID / META_APP_SECRET / WHATSAPP_VERIFY_TOKEN · EVOLUTION_API_URL/KEY (opcional)          │
│ vercel.json: crons de respaldo → /api/crm/jobs/run (header Authorization)                        │
└──────────────┬───────────────────────────────────────────────┬───────────────────────────────────┘
               │ service role / RPC / Storage                   │ wss (ConversationRelay)
┌──────────────▼──────────────────────────┐        ┌───────────▼──────────────────────────────────┐
│ Supabase jgmgphmzusbluqhuqihj            │        │ Railway ws-server (node:22-slim, package-lock) │
│ Postgres + RLS · pg_cron 1.6 · pg_net    │        │ /conversation-relay · /health                  │
│ vault (claves Resend/Twilio por org)     │        │ Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY  │
│ Storage privado: crm-call-recordings,    │        │      TWILIO_MASTER_AUTH_TOKEN (+ subcuentas    │
│   crm-documents · Edge Fn channel-dispatch│        │      desde comm_settings) · OPENAI_API_KEY ·    │
│ provider_configs.credentials (cifrado)   │        │      GOOGLE_AI_API_KEY · WS_PORT · WS_PUBLIC_URL│
│ pg_cron: jobs/run 1 min, campañas 5 min, │        │ Dockerfile copia src/lib/services/crm/** +     │
│   mantenimiento diario                   │        │   integrations/twilio/** + zod/resend/@google  │
└──────────────┬──────────────────────────┘        └───────────┬──────────────────────────────────┘
               │ webhooks entrantes (firma verificada, raw body) │
┌──────────────▼────────────────────────────────────────────────▼──────────────────────────────────┐
│ Twilio (Voice, Messaging, ConversationRelay, subcuentas) · Meta Cloud API · Resend · ElevenLabs   │
│ (Scribe v2, TTS flash_v2_5, IVC, ElevenAgents) · OpenAI (Responses) · Gemini (Interactions)       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
Clientes: Web/PWA (@twilio/voice-sdk) · Electron (@twilio/voice-sdk) · Capacitor (bridge 2 patas; plugin nativo opcional F15)
Por organización (en BD, cifrado): subcuenta Twilio (comm_settings.twilio_subaccount_*), API key Resend sending_access + domain_id (email_domains.credential_id → vault),
  token Meta (channel_credentials), claves propias opcionales de OpenAI/Gemini/ElevenLabs (provider_configs BYOK).
```

---

## 5. Decisiones de proveedor por función (verificadas sep-2026)

Fuente: `brief.md D1/D8` y `docs-twilio-voice.md`, `docs-twilio-messaging.md`, `docs-elevenlabs.md`, `docs-openai.md`, `docs-gemini.md`, `docs-resend.md`, `docs-meta-whatsapp-calendar.md`. Registry `provider_configs` por org (categoría + prioridad), fallback env de plataforma.

| Función | Primario (modelo / endpoint exacto) | Alternativa configurable | Precio verificado (USD) | Por qué |
|---|---|---|---|---|
| Telefonía PSTN + WebRTC | Twilio Programmable Voice: `client.calls.create({to, from, url|applicationSid, statusCallback, statusCallbackEvent, record, recordingChannels:'dual', recordingStatusCallback, machineDetection, timeout})`; browser `@twilio/voice-sdk` con `AccessToken` + `VoiceGrant({outgoingApplicationSid, incomingAllow:true})` | Subcuenta Twilio por org (`client.api.v2010.accounts.create`) vs master | CO móvil $0.0377/min, fijo $0.07/min; SDK $0.004/min; número local $14/mes + $0.0945/min entrante | Único que cubre Web/PWA/Electron/Capacitor/PSTN con un backend; ya integrado |
| Grabación | Twilio `record="record-from-answer-dual"` en `<Dial>` / `recordingChannels:'dual'`; descarga `GET /Recordings/{Sid}.mp3?RequestedChannels=2` con Basic Auth (API Key); `DELETE /Recordings/{Sid}.json` tras copiar | — | $0.0025/min; almacenamiento Twilio $0.0005/min/mes (se borra al copiar) | Dual-channel = diarización por canal gratis; `<Record>` es mono |
| Aviso de consentimiento | `<Say language="es-MX" voice="Polly.Mia-Neural">` (es-CO no existe) | `es-US` Polly.Lupe-Neural / Google.es-US-Neural2 | Neural $0.0032/100 chars | Obligatorio en Colombia; no desactivable con grabación activa |
| STT (transcripción) | ElevenLabs Scribe v2: `client.speechToText.convert({file, modelId:'scribe_v2', languageCode:'spa', diarize:true, numSpeakers:2, timestampsGranularity:'word', webhook?})` | 2º Gemini 2.5 Flash (Files API + schema); 3º OpenAI `gpt-transcribe` (`languages:['es']`, sin diarización) | $0.22/h; Gemini ≈ $0.02 por 10 min; OpenAI $0.0045/min | Mejor WER en español, diarización nativa; `whisper-1` y `gpt-4o-*transcribe*` se apagan 2027-02-26 |
| Análisis de llamada | Gemini `gemini-2.5-flash` con `responseSchema` (existente, se mantiene) | OpenAI `gpt-5.6-luna` structured outputs (`text.format = zodTextFormat`) | Gemini $0.30/$2.50 por 1M; luna $0.20/$1.20 | Barato, contexto grande, ya implementado; añadir `mixed` al CHECK |
| Agente de voz (motor primario) | Twilio ConversationRelay: `<ConversationRelay url ttsProvider="ElevenLabs" voice="{voice_id}-flash_v2_5" transcriptionProvider="Deepgram" speechModel="nova-3-general" language="es-MX">`; cerebro en ws-server: OpenAI `gpt-5.6-terra` (conversación) / `gpt-5.6-luna` (tareas baratas) | `voice_agents.llm_provider='gemini'` → `gemini-3.8-flash`; motor `elevenlabs_agent` (ElevenAgents: `POST /v1/convai/twilio/outbound-call`, batch-calling, webhook `post_call_transcription`) | CR $0.07/min + PSTN; terra $2/$12; luna $0.20/$1.20; Gemini 3.8 Flash $0.75/$3.75 (promo hasta 2026-12-31); ElevenAgents $0.08/min | GA, wss + firma, voz clonada ElevenLabs nativa, control total del loop y de las tools; `gpt-4o-realtime-preview` ya está apagado |
| Voz clonada del agente | ElevenLabs IVC `POST /v1/voices/add` (multipart: name, files[], remove_background_noise) → `voice_id`; TTS `eleven_flash_v2_5` | PVC (`/v1/voices/pvc` + captcha + train) desde plan Creator | TTS flash $0.05/1k chars; IVC desde Starter | Solo voz propia con verificación; `eleven_turbo_v2_5` deprecado |
| Futuro / experimental (no en path crítico) | OpenAI Realtime `gpt-realtime-2.1` vía SIP connector; Gemini Live `gemini-3.1-flash-live-preview` | — | ≈ $0.10/min; ≈ $0.023/min | Documentados en `voice_agents.engine` pero sin implementación en V4 |
| Email | Resend `resend.emails.send(payload, { idempotencyKey })`; dominios `POST /domains` + `POST /domains/{id}/verify`; keys `POST /api-keys { permission:'sending_access', domain_id }`; webhooks svix; Receiving | SendGrid (stack existente) solo como fallback opcional por org | Pro $20/50k (+$0.90/1k), Scale $90/100k; Free 3k/mes, 100/día | Idempotencia, dominios por org, tags para multi-tenant, inbound |
| Render de email | `@react-email/components` desde `templates.blocks_json`; HTML crudo saneado | — | — | Componentes probados en clientes de correo |
| Redacción con IA (email/WA) | OpenAI `gpt-5.6-luna` (`reasoning.effort:'none'`) | Gemini `gemini-2.5-flash-lite` | ≈ $0.001 por borrador | Volumen barato, structured outputs |
| WhatsApp | Meta Cloud API v26.0 por org: `POST /{PHONE_NUMBER_ID}/messages`; plantillas `POST /{WABA_ID}/message_templates`; webhook `X-Hub-Signature-256`; Embedded Signup existente | Twilio WhatsApp (Content API + Senders v2) o QR/Evolution por org | Meta CO ≈ marketing $0.0125, utility $0.0008 (no verificado); free-form en CSW gratis; Twilio +$0.005/msg | Sin markup; path vivo ya existe (`trg_channel_dispatch`) |
| SMS | Twilio Messaging Service (Advanced Opt-Out, Sticky Sender) | — | CO $0.0592/segmento | Canal secundario para secuencias/recordatorios |
| Agendar reunión | Nivel 1 interno: `calendar_events` + `business_hours` + ICS (Resend attachment) + WA utility template | Nivel 2: Google Calendar OAuth por vendedor o Cal.com managed users (`cal-api-version: 2026-02-25`) | $0 / Cal.com Teams $12/usuario | No bloquear el agente por integraciones externas |

### 5.1 Versiones npm objetivo y decisión sobre Node

| Paquete | Hoy | Objetivo | Requisito |
|---|---|---|---|
| `twilio` | ^5.12.1 | **^6.1.0** | Node ≥ 20 |
| `@twilio/voice-sdk` | ^2.18.3 | **^2.18.4** | browser/Electron |
| `resend` | ^6.25.0 | **^6.26.0** | Node ≥ 20 |
| `@elevenlabs/elevenlabs-js` | no instalado (fetch crudo) | **^2.67.0** | Node ≥ 15 |
| `openai` | ^6.15.0 | **^7.10.0** | **Node ≥ 22** |
| `@google/genai` | ^2.20.0 | **^2.21.0** (fijar ^2; v3 exigirá Node 22) | Node ≥ 20 |
| `@react-email/components` | instalado, sin uso | **^1.0.12** (+ `@react-email/render` ^2.1) | — |
| `zod` | presente | ^3.25 o ^4 (peer de openai) | — |

**Decisión: Node 22 LTS en todo el stack** (`engines.node: ">=22"`, Vercel Project Settings → Node 22.x, `ws-server.Dockerfile` → `node:22-slim`). Justificación: (a) `openai` 7.x exige Node 22 y es la línea con Responses API, `zodTextFormat`, webhooks y Realtime GA; quedarse en 6.x congela el SDK en una rama que no recibirá los modelos 5.6; (b) `@google/genai` v3 también exigirá Node 22, así que la subida es inevitable en meses; (c) Vercel soporta Node 22 sin cambios de código; (d) el ws-server de Railway ya se reconstruye en F0 (lockfile + copia de `crm/**`), por lo que cambiar la imagen base no añade trabajo. Riesgo: alguna dependencia nativa no compile en Node 22 → F0 lo verifica con `npm ci && npm run build && npm test` en Node 22 **antes** de cambiar `engines`; si falla, plan B documentado: Node 20 + `openai` ^6.15 (misma API de Responses) y se reevalúa en F6.

---

## 6. Modelo de datos V4

### 6.1 Tablas nuevas

Todas con `id uuid PK default gen_random_uuid()`, `organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`, `created_at/updated_at`, RLS `org_member` (patrón de `calls`), índices por `(organization_id, …)`.

| Tabla | Columnas clave | Propósito | Fase |
|---|---|---|---|
| `outbound_jobs` | `kind CHECK (email|whatsapp|sms|ai_call|ai_draft|sequence_step|automation|transcribe|analyze|recording_fetch|recording_cleanup|campaign_batch)`, `payload jsonb`, `status CHECK (queued|running|done|failed|dead)`, `run_at timestamptz`, `attempts int`, `max_attempts int default 3`, `last_error text`, `locked_at`, `locked_by text`, `dedupe_key text UNIQUE`; índice `(status, run_at) WHERE status='queued'`; RPC `fn_claim_jobs(p_kind, p_limit)` SECURITY DEFINER con `FOR UPDATE SKIP LOCKED` | Cola única de todo lo diferido | F0 |
| `crm_events` | `type text`, `entity_type text`, `entity_id uuid`, `payload jsonb`, `processed_at timestamptz`, `error text`; índice `(processed_at) WHERE processed_at IS NULL` | Outbox de eventos de dominio (stage.changed, call.analyzed, email.opened, whatsapp.replied…) | F0 |
| `contact_consents` | `customer_id uuid FK`, `channel CHECK (email|whatsapp|sms|voice)`, `status CHECK (opted_in|opted_out|unknown)`, `source text`, `evidence jsonb`, `changed_at`; `UNIQUE (organization_id, customer_id, channel)`; función `fn_can_contact(p_customer_id, p_channel) → boolean` (opted_out = false; unknown = true salvo `comm_settings.require_opt_in`) | Habeas Data por canal, enforced en todo envío | F0 |
| `provider_pricing` | `provider text`, `sku text`, `unit CHECK (minute|message|char|token_in|token_out|hour|email)`, `unit_cost numeric(12,6)`, `currency text default 'USD'`, `country text`, `valid_from`, `valid_to`, `organization_id NULL` (NULL = global) | Precios sin hardcode; `fn_estimate_cost(provider, sku, qty)` | F0 |
| `user_comm_preferences` | `user_id uuid FK auth.users`, `mobile_phone_e164 text`, `default_call_mode CHECK (browser|mobile)`, `default_caller_id_id uuid FK phone_numbers`, `voice_id uuid FK voices`, `signature_html text`; `UNIQUE (organization_id, user_id)` | Celular del vendedor, modo por defecto, firma | F0 (tabla) / F5 (UI) |
| `voices` | `provider text default 'elevenlabs'`, `provider_voice_id text`, `name text`, `owner_user_id uuid`, `consent_recorded_at timestamptz`, `sample_path text` (Storage), `is_default boolean`, `settings jsonb` | Voces clonadas (IVC) con consentimiento | F6 |
| `stage_agents` | `stage_id uuid FK stages`, `voice_agent_id uuid FK voice_agents`, `channel CHECK (voice|email|whatsapp|multi)`, `trigger_on CHECK (enter|sla_breach|no_response_days)`, `config jsonb`, `is_active boolean`; `UNIQUE (stage_id, voice_agent_id, trigger_on)` | Qué agente actúa en qué etapa y cuándo | F6 |
| `voice_agent_tool_runs` | `voice_agent_call_id uuid FK`, `tool text`, `args jsonb`, `result jsonb`, `status CHECK (ok|error|blocked)`, `applied_at timestamptz` | Auditoría de acciones del agente | F6 |

No se crean: `whatsapp_templates` (se usa `templates` con `channel='whatsapp'`), `email_attachments` (se usa `documents`), `stage_automations` (se elimina el componente que la asumía), `do_not_call_list` (se usa `contact_consents`), `ai_credits` (se usa `ai_settings.credits_remaining`).

### 6.2 Columnas nuevas y CHECKs ajustados en tablas existentes

| Tabla | Cambio | Fase |
|---|---|---|
| `activities` | `+ call_id uuid FK calls`, `+ email_message_id uuid FK email_messages`, `+ message_id uuid FK messages`, `+ conversation_id uuid`, `+ voice_agent_call_id uuid`; CHECK `activity_type` → `call|email|whatsapp|sms|meeting|visit|note|system|ai_call|task`; índices `(organization_id, related_type, related_id, occurred_at desc)`, `(call_id)`, `(email_message_id)`; usar `channel/outcome/duration_seconds` existentes | F0 |
| `messages` | `+ related_opportunity_id uuid` (índice); backfill `content` desde `payload.text.body` donde `content` sea vacío; trigger `trg_messages_activity` (inbound/outbound → activity `whatsapp`/`sms`) | F0 (columna) / F16 (trigger) |
| `calls` | mantener CHECKs; reconciliar TS: `CallMode = browser|bridge|ai_agent|manual|inbound`, `CallStatus = dialing|ringing|in_progress|completed|failed|busy|no_answer|canceled|voicemail`, `BridgeMode = agent_leg|customer_leg|full_bridge`; trigger `trg_calls_completed_activity`; índice `(organization_id, opportunity_id, started_at desc)` | F0 |
| `call_recordings` | `+ updated_at timestamptz default now()` + trigger; `retention_until` poblado al pasar a `ready`; TS `RecordingStatus = processing|ready|failed|deleted` | F0 |
| `call_analyses` | CHECK `sentiment` → `positive|neutral|negative|mixed` | F0 |
| `voice_agents` | CHECK `purpose_type` + `sell_product|book_meeting`; `+ voice_ref_id uuid FK voices` (mantener `voice_id text` para ids externos); `+ stage_default_config jsonb` | F6 |
| `customers` | `+ timezone text NOT NULL default 'America/Bogota'` | F0 |
| `tasks` | sin cambios de schema; código usa `related_to_id/related_to_type` y `status open|in_progress|done|canceled` | F0 |
| `templates` | `+ blocks_json jsonb`, `+ body_text text`, `+ preview_text text`; CHECK `channel` incluye `email|whatsapp|sms`; `kind` incluye `hsm|onboarding|sequence|manual`; `metadata` para HSM (`meta_template_id, status, category, language, components, parameter_format`) | F7 / F16 |
| `email_messages` | `+ direction CHECK (outbound|inbound) default 'outbound'`, `+ in_reply_to text`, `+ thread_key text`, `+ list_unsubscribe_token text` | F7 |
| `email_domains` | `credential_id` → referencia a vault; `+ receiving_enabled boolean`, `+ tracking_enabled boolean` | F7 |
| `comm_settings` | `+ voice_stt_provider`, `+ ai_budget_monthly numeric`, `+ contact_hours jsonb` (horario permitido), `+ require_opt_in boolean default false` | F0 |
| `sequence_steps` | CHECK `channel` + `ai_call`; `action_config` documentado por canal | F8 |
| `provider_configs` | `credentials` pasa a cifrado (`enc:v1:` prefijo) + `credentials_hash`; función server `decryptCredentials` | F0 |
| `opportunities` | trigger `trg_opp_stage_change_enqueue` (AFTER UPDATE OF stage_id → `crm_events`) | F0 |
| `stages` | `+ agent_summary jsonb` (cache de `stage_agents` para el Kanban) — opcional | F6 |

### 6.3 Diagrama ER (relaciones oportunidad ↔ actividades ↔ canales)

```
                         ┌──────────────┐        ┌──────────────┐
                         │  customers   │◄───────│ contact_     │
                         │ (+timezone)  │        │ consents     │ channel / status
                         └──────┬───────┘        └──────────────┘
                                │ customer_id
                         ┌──────▼───────┐  stage_id   ┌───────────┐   ┌──────────────┐
                         │opportunities │────────────►│  stages   │──►│ stage_agents │──► voice_agents ──► voices
                         └──────┬───────┘             └───────────┘   └──────────────┘
      related_type='opportunity'│ related_id                                   │
                         ┌──────▼──────────────────────────────────────────┐    │
                         │ activities  (activity_type, channel, outcome,    │    │
                         │  duration_seconds, notes=resumen, metadata)      │    │
                         └─┬──────────┬───────────┬───────────┬────────────┘    │
                 call_id   │  email_  │ message_  │ voice_    │ (task/note/meeting
                           │  message │ id        │ agent_    │  sin FK: metadata)
                           ▼  _id     ▼           ▼  call_id  ▼
                  ┌────────────┐ ┌─────────────┐ ┌──────────┐ ┌──────────────────┐
                  │   calls    │ │email_messages│ │ messages │ │voice_agent_calls │
                  │ mode/status│ │ status/events│ │ +related_│ │ outcome, log     │
                  └─┬───┬───┬──┘ └──────┬──────┘ │ opp_id   │ └───┬──────────────┘
                    │   │   │           │        └────┬─────┘     │
     call_recordings│   │   │call_      │email_events │conversations│voice_agent_tool_runs
                    │   │   │consents   ▼             ▼             ▼
                    ▼   ▼   ▼      (webhook)   trg_channel_dispatch  tools → tasks / calendar_events / opportunities.stage_id
   call_transcripts ──► call_transcript_segments
        │
        ▼
   call_analyses ──► call_tag_relations ──► call_tags
                         │
                         ▼ (apply)
              opportunities.stage_id · tasks(related_to_id)

Motor:  opportunities/calls/webhooks ──► crm_events (outbox) ──► automation_rules / sequences ──► outbound_jobs ──► handlers ──► (email_messages | messages | calls | tasks | activities)
Config: provider_configs (cifrado) · provider_pricing · comm_settings · ai_settings · user_comm_preferences · phone_numbers · email_domains · channels/channel_credentials
```

### 6.4 Contratos de la cola (`outbound_jobs`) y del outbox (`crm_events`)

Los documentos de fase usan exactamente estos `kind`, payloads y tipos de evento; cualquier cambio se hace aquí primero.

| `kind` | Payload mínimo (jsonb) | Handler (servicio) | Reintentos | `dedupe_key` | Fase |
|---|---|---|---|---|---|
| `recording_fetch` | `{ call_id, recording_id, provider_recording_sid, account_sid }` | `recordingStorageService.fetchAndStore` | 5 (1m, 5m, 30m, 2h, 6h) | `recording_fetch/{recording_id}` | F3 |
| `transcribe` | `{ call_id, recording_id }` | `transcriptionService.transcribeCall` | 3 | `transcribe/{recording_id}` | F4 |
| `analyze` | `{ call_id, transcript_id }` | `callAnalysisService.analyzeCall` | 3 | `analyze/{transcript_id}` | F4 |
| `recording_cleanup` | `{ recording_id }` | `recordingStorageService.deleteExpired` | 3 | `cleanup/{recording_id}` | F3 |
| `email` | `{ email_message_id }` (la fila ya existe en `pending`) | `emailService.dispatchQueued` | 3 (respeta 429 `retry-after`) | `email/{email_message_id}` | F7 |
| `whatsapp` · `sms` | `{ customer_id, opportunity_id?, campaign_id?, text? , template? }` | `messagingService.sendOutbound` | 3; 131049 → `dead` con `retry_after=24h`; 131056 → +6 s | `campaign/{id}/{customer_id}` o `msg/{uuid}` | F16 |
| `campaign_batch` | `{ campaign_id }` | `campaignService.materialize` | 1 | `campaign_batch/{campaign_id}` | F16 |
| `sequence_step` | `{ step_run_id }` | `sequenceService.processStepRun` | 3 | `step_run/{step_run_id}` | F8 |
| `automation` | `{ crm_event_id, rule_id }` | `automationService.executeAutomationRule` | 2 | `automation/{crm_event_id}/{rule_id}` | F8 |
| `ai_draft` | `{ channel:'email'|'whatsapp', voice_agent_id, opportunity_id, stage_agent_id? }` | `agentDraftService.draftAndSend` | 2 | `ai_draft/{stage_agent_id}/{opportunity_id}/{n}` | F6 |
| `ai_call` | `{ voice_agent_id, opportunity_id, customer_id, campaign_id?, attempt }` | `voiceAgentService.startCall` | según `voice_agents.retry_policy` | `ai_call/{voice_agent_id}/{opportunity_id}/{attempt}` | F6 |

Máquina de estados de un job: `queued → running → done | failed → (run_at = now + backoff, attempts+1) → queued … → dead` (cuando `attempts ≥ max_attempts`). `fn_claim_jobs` marca `running` con `locked_at/locked_by`; un job `running` con `locked_at < now - 10 min` vuelve a `queued` (worker caído).

| `crm_events.type` | Productor | Payload | Consumidores | Fase |
|---|---|---|---|---|
| `stage.changed` | `trg_opp_stage_change_enqueue` | `{ from_stage_id, to_stage_id, changed_by }` | reglas `stage_change`, `stage_agents(enter)`, salida de secuencias | F0 / F8 / F6 |
| `call.completed` | `trg_calls_completed_activity` | `{ call_id, mode, direction, duration_seconds }` | reglas `event`, métricas | F3 |
| `call.analyzed` | `callAnalysisService` | `{ call_id, analysis_id, sentiment, suggested_stage_id }` | reglas `event` (crear tarea, notificar), `stage_agents(no_response)` | F4 |
| `email.opened` · `email.clicked` · `email.bounced` · `email.replied` | `/api/email/webhook` | `{ email_message_id, customer_id, link? }` | condiciones de secuencia, exit `replied`, reglas | F7 / F8 |
| `whatsapp.replied` · `whatsapp.opted_out` | `/api/integrations/whatsapp/webhook` | `{ message_id, conversation_id, customer_id }` | exit de secuencia, handoff de agente, consents | F16 / F8 |
| `sla.breached` · `no_response.days` · `recontact.due` | `fn_enqueue_schedule_events` (pg_cron diario) | `{ opportunity_id, stage_id, days }` | reglas `schedule`, `stage_agents(sla_breach|no_response_days)` | F8 / F6 |
| `agent.call_finished` | `voiceAgentService` | `{ voice_agent_call_id, outcome, tools:[…] }` | reglas `event`, siguiente paso de secuencia | F6 |
| `manual` | UI "Ejecutar ahora" | `{ rule_id, opportunity_id }` | reglas | F8 |

Máquina de estados de `calls.status` (CHECK real): `dialing → ringing → in_progress → completed` · terminales alternativos `failed | busy | no_answer | canceled | voicemail`. Mapeo desde Twilio `CallStatus`: `queued|initiated → dialing`, `ringing → ringing`, `in-progress → in_progress`, `completed → completed`, `busy → busy`, `no-answer → no_answer`, `failed → failed`, `canceled → canceled`; `AnsweredBy ∈ machine_* → voicemail`.

---

## 7. Las fases V4

| Fase | Nombre | Documento | Esfuerzo | Valor | Depende de | Estado V3 → V4 |
|---|---|---|---|---|---|---|
| **F0** | Fundaciones: seguridad, schema, cola/scheduler, registry cifrado, config CRM, nav | `FASE-00-FUNDACIONES.md` | L | 🔴 Crítico | — | Reescrita: V3 era higiene + registry; V4 cierra SEC-01..26, SCH críticos, crea `outbound_jobs`/`crm_events`/`contact_consents`/`provider_pricing`/`user_comm_preferences`, `/api/crm/jobs/run` + pg_cron, hoist `SoftphoneProvider`, `GET /api/crm/templates`, Node 22, Dockerfile ws |
| F1 | Estructura comercial (ICP, verticales, roles, playbooks) | `FASE-01-ESTRUCTURA-COMERCIAL.md` | M | Alto | F0 | **Conservada V3** (parcialmente ejecutada; no bloquea F3–F9) |
| F2 | Pipeline profesional (gates, scoring, discovery, objeciones, closed-lost) | `FASE-02-PIPELINE-PROFESIONAL.md` | M | Muy alto | F0, F1 | **Conservada V3** (pipelines por plantilla ya en producción según `PROGRESS.md`) |
| **F3** | Telefonía en el CRM: softphone global, llamada desde pipeline/oportunidad, grabación dual, consentimiento, entrantes, actividad automática | `FASE-03-TELEFONIA-CRM.md` | L | Muy alto | F0 | Reescrita: repara R2/R3/R4/R7/R9; TwiML App client-originated; trigger `calls`→`activities`; retención |
| **F4** | Transcripción → análisis IA → actividad enriquecida (pipeline automático por cola) | `FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | M | Muy alto | F3, F0 | Reescrita: repara R5/R6; Scribe v2 + roles por canal; encadenamiento por jobs; `CallTranscriptPanel` |
| **F5** | Llamadas desde el celular personal (bridge 2 patas) + Capacitor/Electron | `FASE-05-LLAMADAS-MOVIL-PERSONAL.md` | M | Alto | F3 | Reescrita: UI del bridge, `user_comm_preferences`, TwiML escapado, `calls/manual` con audio |
| **F6** | Agente IA multicanal por etapa: voz clonada ElevenLabs + OpenAI/Gemini + email + WhatsApp + tools | `FASE-06-AGENTE-IA-VOZ.md` | XL | Muy alto | F3, F4, F7, F8, F16 | Reescrita: repara R11; handler agent-aware; tools CRM vivas; `stage_agents`; `voices`; UI completa `/app/crm/agentes-ia` |
| **F7** | Email y plantillas: editor de bloques + HTML, React Email, dominios por org, IA, inbound, baja | `FASE-07-EMAIL-Y-PLANTILLAS.md` | L | Alto | F0 | Reescrita: Resend Domains API, `blocks_json`, `ComposeEmailDialog`, idempotencia real, supresión, hilos |
| **F8** | Motor único de automatizaciones y secuencias + builders | `FASE-08-AUTOMATIZACIONES-SECUENCIAS.md` | L | Muy alto | F0, F7, F16 | Reescrita: repara R10/R12; productor real (`crm_events`); steps completos; elimina 3 sistemas legacy; UI reglas + secuencias |
| **F9** | Ficha 360: timeline unificado, `QuickActionsBar`, drawer con tabs, detalle, Kanban unificado, cliente | `FASE-09-FICHA-360.md` | L | Muy alto | F0 (puede arrancar en paralelo con F3) | Reescrita: primer consumidor de `/api/crm/timeline`; porta gates/realtime/WonCloseModal a `PipelineStages`; borra Kanban muerto |
| **F16** | WhatsApp individual y masivo (una sola shape, HSM, ventana 24h, opt-out, campañas con cola) | `FASE-16-WHATSAPP-INDIVIDUAL-Y-MASIVO.md` | M | Alto | F0 | **Nueva** |
| F10 | Demo, propuesta, contrato y pago | `FASE-10-PROPUESTA-CONTRATO-PAGO.md` | M | Alto | F2, F7, F9 | Conservada V3 (usa `ComposeEmailDialog` de F7) |
| F11 | Post-venta: onboarding, health, renovación, expansión | `FASE-11-POSTVENTA.md` | M | Alto | F2, F8 | Conservada V3 (secuencias de renovación sobre el motor F8) |
| F12 | Referidos y partners | `FASE-12-REFERIDOS-PARTNERS.md` | M | Medio | F11 | Conservada V3 |
| F13 | Equipo, cuotas, comisiones, dashboard vendedor | `FASE-13-EQUIPO-COMISIONES.md` | M | Alto | F2, F14 | Conservada V3 (añade métricas de llamadas de F4) |
| F14 | Revenue OS: métricas, forecast, matemática comercial | `FASE-14-REVENUE-OS.md` | M | Alto | F2, F11 | Conservada V3 |
| F15 | Motion UX + cross-platform | `FASE-15-MOTION-CROSS-PLATFORM.md` | M | Medio-alto | F0, F3, F5 | Conservada V3; absorbe permisos Capacitor (`RECORD_AUDIO`, `NSMicrophoneUsageDescription`), plugin `@capgo/capacitor-twilio-voice` opcional, softphone en Electron |

Esfuerzo: S = 1–3 días · M = 1 semana · L = 2 semanas · XL = 3 semanas (un builder; los paralelismos suponen dos builders).

### 7.1 Orden recomendado y calendario

```
Semanas 1–2    F0  ──────────────────────────────────────────────  (nada arranca sin F0 en ≥ 9.5)
Semanas 3–4    F3 (telefonía)          ∥   F9 (ficha 360: timeline + QuickActionsBar + drawer tabs; usa datos de activities/tasks/notes/email desde el día 1)
Semanas 5–6    F4 (transcripción/IA)   ∥   F5 (celular 2 patas)
Semanas 7–8    F7 (email)              ∥   F16 (WhatsApp)
Semanas 9–10   F8 (motor automatizaciones + secuencias)              ← necesita email y WhatsApp como acciones
Semanas 11–13  F6 (agente IA multicanal por etapa)                   ← necesita F3/F4/F7/F8/F16
Semana 14+     F10 · F11 · F12 · F13 · F14 · F15 (V3, en el orden de V3)
F1 y F2 (V3) se continúan en paralelo a F0–F3 por un tercer builder si existe; no bloquean.
```

Reglas: (1) F0 es prerrequisito duro; (2) F9 arranca en paralelo con F3 porque consume `/api/crm/timeline` con las fuentes que ya existen y añade la fuente `calls` cuando F3 cierre; (3) F6 es la última de las "nuevas" porque orquesta todos los canales; (4) cada fase se cierra con `/loop` en ≥ 9.5/10 (tester con org de prueba + qa-reviewer) antes de empezar la siguiente dependiente; (5) máximo 3 rondas seguidas sin escalar a input humano.

### 7.2 Ejecución en curso (2026-09-08): olas de implementación del orquestador

El calendario de §7.1 supone dos builders secuenciales. El dueño pidió pasar a ejecución el mismo día, así que el orquestador reparte el trabajo en **olas** de agentes paralelos (`.devin/workflows/loop.md`: builder → tester → qa-reviewer por parte). Cada ola cierra con `PROGRESS.md` actualizado y ≥ 9.5 en todas sus partes antes de arrancar la siguiente.

| Ola | Partes en paralelo (agente → alcance → archivos propios) | Entrada | Salida verificable |
|---|---|---|---|
| **1** (en curso) | **F0-DB**: migraciones M1–M9 vía MCP `apply_migration` (CHECKs, columnas `activities`/`messages`/`customers`, bucket `crm-call-recordings` + políticas de `crm-documents`, `outbound_jobs`/`crm_events`/`contact_consents`/`provider_pricing`/`user_comm_preferences`, RPCs de cola con `p_worker`, REVOKE de escritura en `provider_configs`, seeds M9, cron inactivo hasta que exista el runner) · **F0-SEC**: `orgContext.ts` (service role, header/cookie), `src/lib/supabase/server-service.ts`, `src/lib/security/webhookSignatures.ts`, `src/lib/crm/enums.ts`, cierre de SEC-01…26 en las rutas, auth del `ws-server`, guardrails #5–#10 · **F0-JOBS**: `src/lib/jobs/**` (runner, registry, handlers `noop/maintenance/crmEvent`, dispatcher de `crm_events`), `POST /api/crm/jobs/run` con `withCron` y `maxDuration = 60`, cron de respaldo en `vercel.json`, `JobsMonitor` · **F0-REG**: `providerRegistry` con Vault, credenciales server-only, `provider_pricing`/`fn_unit_cost` en código, tabs Proveedores/IA y Créditos en `/app/configuracion?modulo=crm`, nav CRM (`crmNav.ts`), `npm install` (único agente que toca `package.json`), `.env.example`, Dockerfile ws, permisos Capacitor/Electron · **DOCS**: `PLAN.md` §7.2, `ANEXO-C`, correcciones de testers en `ANEXO-B` y `FASE-00`, cabeceras "Estado V4" en F1/F2/F10–F13, `ANEXO-A` §3–§7 | brief D1–D9, `FASE-00` V4, `tester-F00-r1`, `tester-ANEXO-B-r1` | DoD de `FASE-00` §10; `npx tsc --noEmit` sin errores nuevos vs `tsc-baseline.txt`; `npm test` verde; informe por agente en `scratchpad/reports/<AGENTE>-r<N>.md` |
| **2** | **F9** (shell UI: `QuickActionsBar`, `OpportunityTimeline` consumidor de `/api/crm/timeline`, drawer con tabs, `SoftphoneProvider` hoisteado; porta gates/`WonCloseModal`/realtime a `PipelineStages`) ∥ **F3** (softphone: TwiML App client-originated, una sola marcación, consentimiento, grabación dual, trigger `calls → activities`, entrantes por `phone_numbers`) ∥ **F4** (transcripción Scribe v2 + roles por canal, análisis Gemini, encadenamiento por `outbound_jobs`, `CallTranscriptPanel`) ∥ **F7 backend** (`emailService` reescrito: dominios por org vía Resend Domains API, `templates.blocks_json` + render React Email, idempotencia `email/{id}`, supresión `contact_consents`, webhook fail-closed, inbound, `GET /api/crm/templates`) ∥ **F16 backend** (una sola shape de `messages`, firma Meta fail-closed, HSM vía Business Management API, ventana 24 h, opt-out STOP/BAJA, campañas → `campaign_contacts` → `outbound_jobs` con rate limit) | Ola 1 aprobada | DoD global §14 puntos 1–3 y 5 (F3/F4/F9); tests de contrato de email y WhatsApp con payloads reales; `PROGRESS.md` |
| **3** | **UI de compose**: `ComposeEmailDialog` (bloques + HTML + IA + plantillas + adjuntos + preview + programar) y `ComposeWhatsAppDialog` (individual/masivo, HSM con variables, indicador de ventana, preview), ambos enganchados a `QuickActionsBar` ∥ **F5** (bridge 2 patas desde la UI, `user_comm_preferences`, TwiML escapado, `calls/manual` con audio, Capacitor) ∥ **Config por canal**: tabs Telefonía / Email / WhatsApp en `/app/configuracion?modulo=crm` (números, caller id, grabación, retención, mi celular; dominios + DNS + verificar, remitentes, tracking, firma; canal, plantillas HSM, opt-out) | Ola 2 aprobada | DoD global §14 puntos 4, 6–9 |
| **4** | **F6** (agente IA: handler ConversationRelay agent-aware, `ttsProvider="ElevenLabs" voice="{voice_id}-flash_v2_5"`, `voices` + IVC con consentimiento, tools CRM vivas incl. `book_meeting`, `stage_agents`, motor secundario `elevenlabs_agent`, páginas `/app/crm/agentes-ia`) + **F8** (motor único: reglas `automation_rules` + `sequences` sobre `crm_events`/`outbound_jobs`, steps completos, eliminación de los 3 sistemas legacy, builders `/app/crm/secuencias` y `/app/crm/automatizaciones`) | Ola 3 aprobada | DoD global §14 puntos 10–14 |
| **5** | **QA E2E global** (§14 completo con una org de prueba distinta de GoAdmin; Web, PWA, Electron, Capacitor) + **F10–F15 reconciliados** según `ANEXO-C` §6: seeds de configuración (`ANEXO-C` §7), montaje de los componentes V3 huérfanos (`ObjecionesList`, `DiscoveryWizard`, `ProposalBuilderDialog`, `OnboardingChecklist`), páginas faltantes (`/app/crm/{objeciones,partners,referidos}`), cuotas/dashboard de vendedor, dashboard Revenue OS, permisos móviles restantes, kinds `health_recalculate`/`renewals_sync` en el job diario | Ola 4 aprobada | DoD global §14 puntos 15–20 + DoD de cada FASE V3 |

Reglas de coordinación (vigentes para todas las olas; detalle en `scratchpad/rules-implementacion.md`):

1. **Un solo agente aplica DDL** (F0-DB, luego el agente "DB" de cada ola) y solo con MCP `apply_migration` (`crm_v4_fXX_<descripcion>`); prohibido crear `.sql` en el repo. Los demás piden columnas/funciones en la sección "Necesito de DB" de su informe.
2. **Un solo agente ejecuta `npm install` / toca `package.json`** (F0-REG en la Ola 1; el orquestador designa uno por ola). Ya instalado hoy: `twilio ^6.1.0`, `@twilio/voice-sdk ^2.18.4`, `resend ^6.26.0`, `@google/genai ^2.21.0`, `@elevenlabs/elevenlabs-js ^2.67.0`, `@react-email/components ^1.0.12`, `@react-email/render ^2.1.0`, `sanitize-html ^2.17.7`.
3. **Archivos por agente**: cada agente recibe una lista propia de rutas/carpetas y no edita fuera de ella salvo importaciones mínimas; si un archivo compartido ya fue tocado (`git diff --stat`), los cambios son mínimos y aditivos. En la Ola 1 los cortes de `FASE-00` son: DB → §3, JOBS → §4.4, REG → §4.1–4.2/§5, SEC → §4.3/§4.5/§7, DOCS → §1/§5.1–5.2/§5.8/§7/§9.1/§10/§11.
4. **No tocar** (WIP del dueño): `src/app/app/inicio/page.tsx`, `src/components/inicio/DashboardKPIs.tsx`, `src/components/inicio/KpiDetailDialog.tsx`, `src/lib/services/integrations/whatsapp/whatsappQrService.ts`.
5. **Enums/CHECKs**: valores exactos de la BD centralizados en `src/lib/crm/enums.ts`; si el doc contradice el schema real o a un `tester-*.md`, gana el schema/tester y se anota la desviación en el doc de fase (§13 "Registro de implementación").
6. **Cierre de cada parte**: doc de fase actualizado (§1 con ✅ y `archivo:línea` real, §12 real, §13 registro), informe en `scratchpad/reports/`, sin commits ni push; `PROGRESS.md` lo edita solo el orquestador.
7. **Pendientes que arrastra la Ola 1 al dueño**: rotar la service key de Supabase y reescribir el `cron.job` 4 (§13); definir `TWILIO_API_KEY`/`TWILIO_API_SECRET`/`TWILIO_TWIML_APP_SID` en Vercel (hoy solo en `.env.example`).

---

## 8. Mapa de rutas API finales

Estado: **N** = nueva · **M** = modificada · **=** = sin cambios · **E** = eliminada. Auth: `sesión` = `getServerOrgContext`; `firma` = firma del proveedor verificada fail-closed; `cron` = `Authorization: Bearer CRON_SECRET`; `público` = sin auth (con token opaco).

### 8.1 Voz

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/voice/token` | POST | sesión | F3 | M | API Key/Secret/TwiML App desde registry (org o env master); `identity=userId`; ttl 3600 |
| `/api/voice/call` | POST | sesión | F3/F5/F6 | M | Solo `mode ∈ bridge|ai_agent|manual`; browser NO la usa; valores válidos del CHECK; créditos |
| `/api/voice/twiml/outbound` | POST | firma | F3 | M | Client-originated (`From=client:{userId}`); crea `calls`; `<Say>` consentimiento + `<Dial record dual>` |
| `/api/voice/twiml/inbound` | POST | firma | F3 | M | Org por `phone_numbers.e164` sin fallback; `<Client>{assigned_user_id}</Client>`; voicemail |
| `/api/voice/status` | POST | firma | F3 | M | Mapeo a CHECK; `SequenceNumber`; `organization_id` siempre; encola `crm_events` |
| `/api/voice/recording` | POST | firma | F3/F4 | M | `status:'processing'` → job `recording_fetch` → `ready`; encola `transcribe` |
| `/api/voice/recording/[id]/stream` | GET | sesión | F3 | = | 302 a signed URL del bucket |
| `/api/voice/twiml/agent-leg` | POST | firma | F5 | M | Org-scoped por `bridgeId`; `&amp;` escapado; whisper es-MX |
| `/api/voice/twiml/customer-leg` | POST | firma | F5 | M | Consentimiento + `<Dial record dual answerOnBridge>` |
| `/api/voice/bridge/initiate` | POST | sesión | F5 | M | Teléfono desde `user_comm_preferences` (server); inserts válidos (`from_number/to_number`) |
| `/api/voice/bridge/status` | POST | firma | F5 | M | Solo `leg ∈ agent|customer|dial`; updates con `organization_id` |
| `/api/voice/twiml/ai-agent` | POST | firma | F6 | M | Lee `voice_agents` completo; `ttsProvider/voice/transcriptionProvider`; `sessionToken`; `<Connect action>` |
| `/api/voice/relay/after` | POST | firma | F6 | N | Action de `<Connect>`: `SessionStatus`, `HandoffData` → `voice_agent_calls` |
| `/api/voice/ai-agent/status` | POST | firma | F6 | N | Status callback dedicado (reemplaza `bridge/status?leg=ai_agent`) |
| `/api/integrations/twilio/voice/incoming` | POST | — | F3 | **E** | Duplicado de `twiml/inbound` con fallback cross-tenant |
| `/api/integrations/twilio/voice/media-stream` | GET | — | F0 | **E** | Responde 410 |

### 8.2 Llamadas CRM, transcripción y análisis

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/crm/calls` · `/[id]` | GET/POST · GET/PATCH | sesión | F3 | M | Filtros por oportunidad/cliente/usuario; PATCH solo campos permitidos |
| `/api/crm/calls/manual` | POST | sesión | F5 | N | Registrar llamada manual (+ audio opcional → bucket → job `transcribe`) |
| `/api/crm/calls/[id]/transcribe` | POST | sesión | F4 | M | Encola job (no ejecuta inline); créditos |
| `/api/crm/calls/[id]/transcript` | GET | sesión | F4 | = | |
| `/api/crm/calls/[id]/analyze` · `/analysis` · `/analysis/apply` | POST · GET · POST | sesión | F4 | M | Encola; `suggested_stage_id` validado; apply escribe activity |
| `/api/crm/calls/[id]/tags` · `/api/crm/call-tags` | GET/POST | sesión | F4 | = | |
| `/api/crm/transcribe` | POST | sesión | F4 | M | Persiste en `call_transcripts` (llamada manual); debita créditos |
| `/api/crm/phone-numbers` | GET/POST | sesión | F3 | M | Compra/asignación de números (Twilio) y caller id verificado |
| `/api/crm/call-quality` | GET | sesión | F4 | = | RPC `fn_call_quality` |

### 8.3 Cola, eventos, configuración y consentimientos

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/crm/jobs/run` | POST | cron | F0 | N | Drena `crm_events` + `outbound_jobs` (`?scope=default|campaigns|maintenance`) |
| `/api/crm/jobs` · `/[id]/retry` | GET · POST | sesión | F0 | N | Observabilidad por org (tabla de jobs, reintentar dead) |
| `/api/crm/provider-configs` · `/[id]` | GET/POST · PATCH/DELETE | sesión (admin) | F0 | N | Credenciales cifradas; nunca devuelve secretos (solo `has_credentials`, `last4`) |
| `/api/crm/settings/comm` | GET/PATCH | sesión | F0 | N | `comm_settings` (server) + `user_comm_preferences` del usuario |
| `/api/crm/consents` | GET/POST | sesión | F0 | N | `contact_consents` por cliente/canal; `fn_can_contact` |
| `/api/crm/usage` | GET | sesión | F0 | N | Créditos, costos por canal/mes, presupuesto |
| `/api/crm/templates` · `/[id]` | GET/POST · GET/PATCH/DELETE | sesión | F0 (GET) / F7 (CRUD) | N | Reemplaza `/api/email/templates` inexistente; `?channel=email|whatsapp|sms` |
| `/api/crm/followup/run` | POST | cron | F0 → F8 | M → **E** | F0: fail-closed; F8: eliminada (absorbida por `jobs/run`) |
| `/api/crm/sequences/run` | POST | cron | F8 | **E** | Absorbida por `jobs/run` (kind `sequence_step`) |
| `/api/crm/voice-agents/campaigns/run` | POST | cron | F6 | M | Solo materializa `outbound_jobs`; el envío lo hace `jobs/run` |
| `/api/integrations/whatsapp/qr/dispatch-pending` | POST | cron | F0 | M | `CRON_SECRET` + org explícita; deja de llamarse desde el browser |

### 8.4 Email

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/email/send` | POST | sesión | F7 | M | `blocks_json|html|template_id`, variables con contexto, adjuntos, `scheduled_at`, `fn_can_contact`, idempotencia determinista, una sola activity |
| `/api/email/preview` | POST | sesión | F7 | N | Render React Email + variables resueltas |
| `/api/email/ai-draft` | POST | sesión | F7 | N | `gpt-5.6-luna` con contexto de oportunidad; debita créditos |
| `/api/email/webhook` | POST | firma (svix) | F7 | M | `tags` objeto; orden de eventos; `email.received` (inbound); consents |
| `/api/email/messages` · `/[id]` | GET | sesión | F7 | = | `?events=true` |
| `/api/email/domains` · `/[id]` | GET/POST · PATCH/DELETE | sesión (admin) | F7 | M | `POST /domains` en Resend, `dns_records`, API key `sending_access` por dominio (vault) |
| `/api/email/domains/[id]/verify` | POST | sesión (admin) | F7 | N | `POST /domains/{id}/verify` + refresco de estado |
| `/api/email/unsubscribe/[token]` | GET/POST | público | F7 | N | Baja one-click (`List-Unsubscribe-Post`) |
| `/api/integrations/sendgrid/*` | — | sesión/firma | F0 | M | Cerrar SEC-05/06; queda como proveedor de fallback opcional (`provider_configs.category='email'`) |
| `/api/notifications/process` | POST | cron | F0 | M | `CRON_SECRET`; org de la notificación, no del body |

### 8.5 WhatsApp y SMS

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/crm/messages/send` | POST | sesión | F16 | N | Envío individual WhatsApp/SMS desde oportunidad → `messages` (shape único) → dispatch |
| `/api/crm/campaigns/[id]/send` · `/pause` · `/resume` | POST | sesión | F16 | N | Materializa `campaign_contacts` + `outbound_jobs`; control de cola |
| `/api/crm/campaigns/[id]/metrics` | GET | sesión | F16 | N | `fn_get_campaign_metrics` |
| `/api/integrations/whatsapp/send` | POST | sesión | F0 / F16 | M | SEC-02; F16: reescrito para insertar `messages` (shape único) en vez de llamar a Meta directo |
| `/api/integrations/whatsapp/webhook` | GET/POST | firma (X-Hub-Signature-256) | F0 / F16 | M | SEC-03; `content` en inbound; statuses; `message_template_status_update`; STOP |
| `/api/integrations/whatsapp/templates` · `/sync` | GET/POST · POST | sesión | F16 | M/N | Crear en `POST /{WABA_ID}/message_templates`; sincronizar estados a `templates` |
| `/api/integrations/whatsapp/validate` · `/mark-read` · `/oauth/callback` | — | sesión | F0 | M | Autorización por `channel_id` de la org |
| `/api/integrations/whatsapp/qr/{start,stop,status,logout,inbound}` | — | sesión / firma | F0 | M | SEC-02; `qr/send` y `qr/mark-read` → **E** (F16) |
| `/api/integrations/twilio/send-whatsapp` · `/send-sms` | POST | sesión | F0 / F16 | M | SEC-04; F16: delegan en `messagingService` |
| `/api/integrations/twilio/incoming-message` | POST | firma | F0 / F16 | M | Escape TwiML; firma siempre; STOP/BAJA → `contact_consents`; inbound → `messages` |
| `/api/integrations/twilio/status-callback` | POST | firma | F0 | M | Firma siempre (no solo producción) |
| `/api/integrations/twilio/verify/send` · `/check` | POST | sesión + rate limit | F0 | M | SEC-01 |
| `/api/integrations/twilio/credits` · `/usage` | GET | sesión | F0 | = | |

### 8.6 IA, agentes, automatizaciones, timeline

| Ruta | Método | Auth | Fase | Estado | Cambio |
|---|---|---|---|---|---|
| `/api/crm/voice-agents` · `/[id]` · `/campaigns` · `/campaigns/[id]` | CRUD | sesión | F6 | M | Validación zod contra CHECKs; `voice_ref_id`; `allowed_tools` allow-list |
| `/api/crm/voice-agents/[id]/test-chat` | POST | sesión | F6 | N | Simulador de texto (mismo cerebro, sin Twilio) |
| `/api/crm/voice-agents/[id]/start-call` | POST | sesión | F6 | N | Lanzar ahora / programar → `outbound_jobs{ai_call}` |
| `/api/crm/voice-agent-calls` · `/[id]` | GET | sesión | F6 | M | Conversación + tool runs |
| `/api/crm/voices` · `/[id]/preview` | GET/POST · POST | sesión | F6 | N | IVC en ElevenLabs con consentimiento; preview TTS |
| `/api/crm/stage-agents` · `/[id]` | CRUD | sesión | F6 | N | Agente por etapa |
| `/api/crm/agent-tools/[tool]` | POST | firma (ElevenLabs / token de sesión) | F6 | N | Webhook tools para engine `elevenlabs_agent` |
| `/api/webhooks/elevenlabs` | POST | firma (`constructEvent`) | F4 / F6 | N | `speech_to_text_transcription`, `post_call_transcription`, `post_call_audio` |
| `/api/crm/meetings` | POST | sesión | F6 | N | `book_meeting`: `calendar_events` + ICS + WA utility; usado por tool y por `QuickActionsBar` |
| `/api/crm/automations/rules` · `/[id]` · `/[id]/run` | CRUD · POST | sesión | F8 | N (ruta canónica; verificar la existente y renombrar) | Reglas por etapa; ejecución manual |
| `/api/crm/automations/runs` | GET | sesión | F8 | N | Historial |
| `/api/crm/sequences` · `/[id]` · `/[id]/enroll` · `/[id]/steps` | CRUD | sesión | F8 | M | Builder; `enroll` respeta `fn_can_contact` |
| `/api/crm/timeline/[type]/[id]` | GET | sesión | F9 | M | WhatsApp por `related_opportunity_id`; `ai_call`; cursor; filtros por tipo |
| `/api/crm/ia/next-action` · `/discovery-summary` | POST | sesión | F0 / F9 | M | Debita créditos (`decrement_ai_credits`); modelo `gpt-5.6-luna`; UI en drawer tab IA |
| `/api/chat/ai/*` · `/api/ai-assistant/*` | POST | sesión | F0 | M | SEC-15/16/17; org de sesión; créditos atómicos |
| `/api/crm/leads/[id]/convert` | POST | sesión | — | = | |
| `/api/crm/health/recalculate` · `/renewals/sync` | POST | cron | — | = | Ya fail-closed |

---

## 9. Mapa de rutas UI finales

### 9.1 Páginas

| Ruta | Archivo | Fase | Estado | Contenido |
|---|---|---|---|---|
| `/app/crm/pipeline` | `src/app/app/crm/pipeline/page.tsx` → `PipelineView` → `PipelineStages` | F9 | M | Kanban único (gates + realtime + `WonCloseModal` portados); tarjeta `OpportunityKanbanCard` con `QuickActionsBar variant='card'`; tab Automatización → enlace a `/app/crm/automatizaciones` |
| `/app/crm/oportunidades/[id]` | `OpportunityDetail.tsx` (shell ≤ 300 L) | F9 | M | Header + `QuickActionsBar variant='detail'` + tabs Resumen · Actividad (`OpportunityTimeline`) · Tareas · Notas · Documentos · Productos · IA · Analítica |
| Drawer de oportunidad | `OpportunityDrawer.tsx` (shell ≤ 300 L) | F9 | M | Tabs Resumen · Actividad · Tareas · Notas · Documentos · IA; barra sticky con `QuickActionsBar variant='drawer'`; `useOpportunityData` con refetch granular |
| `/app/crm/leads` | existente | F0 (nav) / F9 | M | Entra al nav; acciones de contacto por fila |
| `/app/crm/llamadas` | existente | F0 (nav) / F3 / F4 | M | Entra al nav; `SoftphoneProvider` sale de la página (va al layout); `CallsTable` + `CallTranscriptPanel` |
| `/app/crm/clientes/[id]` | existente | F9 | M | `QuickActionsBar` + `OpportunityTimeline entityType='customer'` |
| `/app/crm/agentes-ia` · `/nuevo` · `/[id]` | nuevos | F6 | N | Lista; editor con tabs Propósito · Guion · Voz · Herramientas · Guardarraíles · Horario · Pruebas (simulador); campañas; historial de llamadas con conversación y tool runs |
| `/app/crm/plantillas` · `/nueva` · `/[id]` | nuevos | F7 (email) / F16 (whatsapp, sms) | N | Biblioteca por canal; editor de bloques + HTML + preview + test; HSM con estado de aprobación |
| `/app/crm/secuencias` · `/nueva` · `/[id]` | nuevos | F8 | N | Builder de pasos (canal, retraso, plantilla, condición); inscritos; métricas |
| `/app/crm/automatizaciones` | nuevo (reemplaza `AutomationsView`) | F8 | N | Reglas por etapa (trigger, condiciones, acciones), historial de runs, "ejecutar ahora" |
| `/app/crm/campanas/*` | existentes | F16 | M | Campañas WhatsApp reales (plantilla HSM, variables, costo estimado, cola, métricas) |
| `/app/configuracion?modulo=crm` | `src/components/configuracion/crm/*` | F0 (shell) / F3 / F7 / F16 / F6 | N | Tabs: **Telefonía** (números, caller id, grabación, consentimiento, retención, mi celular/modo por defecto) · **Email** (dominios + DNS + verificar, remitentes, tracking, firma) · **WhatsApp** (canal, plantillas, opt-out, ventana) · **IA** (proveedores/modelos por función, presupuesto mensual, voces clonadas) · **Créditos y costos** (saldo, consumo por canal, precios) |
| `/unsubscribe/[token]` | público | F7 | N | Página de baja (email) |
| `/app/crm/actividades` | existente | F0 | M | `ActivityType` alineado al CHECK; muestra `channel/outcome/duration` |

### 9.2 Componentes globales (montados una sola vez)

`src/app/app/layout.tsx`: `AuthGuard → MotionProvider → SoftphoneProvider → AppLayout → {children} + SoftphoneDock + IncomingCallToast` (F0 hoist; F3 funcional).

### 9.3 Nav CRM final (una sola fuente: `src/config/moduleConfig.ts`; `AppLayout.tsx` la consume)

Pipeline · Leads · Oportunidades · Clientes · Actividades · **Llamadas** · Campañas · Segmentos · **Plantillas** · **Secuencias** · **Automatizaciones** · **Agentes IA** · Equipo · Pronóstico · Salud Clientes · Identidades. (Negrita = nuevas en el nav.) `CRMQuickNav.tsx:112` apunta a `/app/configuracion?modulo=crm`.

---

## 10. Código a ELIMINAR (con fase)

| Archivo / ruta | Motivo | Fase |
|---|---|---|
| `src/lib/services/callService.ts` (292 L) | Muerto (solo `guardrails.test.ts:202`); `organizationId:1`, `user_profiles`; su `createCallActivity` se sustituye por el trigger `trg_calls_completed_activity` | F0 (ajustar el test) |
| `src/lib/services/integrations/twilio/voiceAgent/realtimeSession.ts` | Muerto; `gpt-4o-realtime-preview` apagado | F0 |
| `…/voiceAgent/elevenLabsTTS.ts` | Muerto; `eleven_turbo_v2` deprecado; TTS lo hace ConversationRelay | F0 |
| `…/voiceAgent/deepgramSTT.ts` | Muerto; STT lo hace ConversationRelay/Scribe | F0 |
| `…/voiceAgent/voiceAgentService.ts` (Media Stream) | Muerto (media-stream → 410); el vivo es `crm/voiceAgentService.ts` | F0 |
| `src/app/api/integrations/twilio/voice/media-stream/route.ts` | Responde 410 | F0 |
| `src/app/api/integrations/twilio/voice/incoming/route.ts` | Duplicado de `twiml/inbound`; fallback cross-tenant; `en-US` | F3 (tras mover el agente entrante a `twiml/inbound` + `stage_agents`/`voice_agents.inbound`) |
| `…/voiceAgent/voiceAgentTools.ts` (PMS: `check_availability`, `create_reservation`…) y `voiceAgentPrompts.ts` (hotel) | Se sustituyen por `crm/voiceAgentTools.ts`; si una org PMS necesita el recepcionista, se modela como `voice_agents.purpose_type='custom'` con tools PMS registradas | F6 |
| `src/components/crm/pipeline/EmailNotifications.ts` y `EmailNotifications.tsx` | Stubs con `console.log`, mismo basename, firmas divergentes | F8 |
| `src/components/crm/pipeline/AutomationSettings.tsx` (405 L) | Nunca montado; escribe en `stage_automations` (no existe) | F8 |
| `src/lib/services/crm/followupEngineService.ts` + `src/app/api/crm/followup/run/route.ts` | Fail-open; columnas inexistentes; reemplazado por reglas `schedule` del motor | F8 (F0 lo deja fail-closed mientras tanto) |
| Tabla `automations` (1 fila) + `AutomationsView.tsx` + heurísticas `OpportunityAutomations.tsx:176-218` | Migrar la fila a `automation_rules`; el cambio de etapa lo produce el trigger BD | F8 |
| `src/app/api/crm/sequences/run/route.ts` | Absorbida por `jobs/run` | F8 |
| `src/components/crm/pipeline/KanbanBoard.tsx` (931 L), `KanbanColumn.tsx` (174 L), `OpportunityCard.tsx` (147 L) | Muertos; **primero** portar `evaluateStageGate`+`GateWarningDialog`, realtime, `WonCloseModal`, `StructuredLossDialog` a `PipelineStages`, luego borrar (y limpiar `index.ts:3-5`) | F9 |
| Timeline manual en `OpportunityDetail.tsx:908-970` y `opportunitiesService:959-972` | Sustituidos por `OpportunityTimeline` | F9 |
| `ActivityActions.tsx` (844 L) | Se descompone en `QuickActionsBar` + `ComposeEmailDialog` + `ComposeWhatsAppDialog` + `CallActionMenu` + `MeetingDialog` (≤ 300 L cada uno); el archivo se borra al terminar F16 | F9 → F16 |
| `src/app/api/integrations/whatsapp/qr/send` y `qr/mark-read`, `whatsapp/mark-read` | Muertos; el envío pasa por `messages` | F16 |
| `src/app/api/integrations/sendgrid/*` + `sendgridService.ts` como stack paralelo | Se conserva **solo** como proveedor de fallback detrás de `providerRegistry` (`category='email', provider='sendgrid'`); las rutas públicas propias se retiran | F7 |
| Tabla de precios hardcodeada `openaiService.ts:337-345`; `WHATSAPP_RATE_LIMITS/TIERS` no leídos | Reemplazados por `provider_pricing` y por la cola | F0 / F16 |
| `src/components/crm/configuracion/ConfiguracionHub.tsx`, `customers/CustomersList.tsx` | Huérfanos (V3 G14) | F0 |
| `mailto:`/`wa.me` sin log en `pipelineUtils:78-90`, `CustomersTable:173,255`, `CustomerDetailsModal:65`, `HoyView:102,118`; `tel:` en `CustomersTable:183`, `CustomerDetailsModal:78`, `HoyView:110` | Reemplazados por `QuickActionsBar` | F9 |

---

## 11. Modelo de costos por organización y política de créditos

### 11.1 Escenario de referencia (mes)

500 llamadas humanas de 6 min (3 000 min) + 2 000 emails + 3 000 WhatsApp + 200 llamadas de agente IA de 3 min (600 min). Precios de `brief.md D8` y `docs-*.md` (USD, lista, sep-2026). Los precios de Meta CO no están verificados oficialmente.

| Concepto | Cálculo | Costo |
|---|---|---|
| PSTN saliente CO móvil (llamadas humanas, modo navegador) | 3 000 min × $0.0377 | $113.10 |
| Voice SDK (leg browser) | 3 000 min × $0.004 | $12.00 |
| Grabación dual | 3 000 min × $0.0025 | $7.50 |
| Aviso de consentimiento (Polly Neural, ~150 chars) | 500 × $0.0048 | $2.40 |
| STT ElevenLabs Scribe v2 | 50 h × $0.22 | $11.00 |
| Análisis Gemini 2.5 Flash (~2.5k in + 1k out por llamada) | 500 × $0.00325 | $1.63 |
| Número local Twilio | 1 × $14 | $14.00 |
| Email (Resend Pro $20/50k es de plataforma; prorrateo) | 2 000 × $0.0004 | $0.80 |
| WhatsApp Meta CO (1 000 marketing + 1 000 utility + 1 000 free-form en CSW) | 1 000 × $0.0125 + 1 000 × $0.0008 | $13.30 |
| Agente IA: PSTN | 600 min × $0.0377 | $22.62 |
| Agente IA: ConversationRelay (STT Deepgram + TTS incluidos según docs; recargo por voz ElevenLabs no verificado) | 600 min × $0.07 | $42.00 |
| Agente IA: LLM gpt-5.6-terra (~10 turnos, caché 80 %) | 200 × $0.03 | $6.00 |
| Agente IA: grabación + análisis | 600 × $0.0025 + 200 × $0.003 | $2.10 |
| **Total modo navegador** | | **≈ $248 / mes** |
| Variante: llamadas humanas por celular (2 patas: agente + cliente, ambos móvil CO) | 3 000 × $0.0754 en vez de $113.10 + $12 | **≈ $350 / mes** |
| Variante: agente con gpt-5.6-luna | 200 × $0.003 | −$5.40 |
| Variante: agente con ElevenAgents | 600 × $0.08 en vez de CR $42 | +$6.00 |

Costos fijos de plataforma (no por org): Resend Pro $20, ElevenLabs Creator $22 (IVC + 100 h STT incluidas), Railway ws-server, Twilio sin cuota.

### 11.2 Política de créditos (D6)

1. **Dos libros, un solo punto de débito.** IA (`ai_settings.credits_remaining`, `ai_usage_logs`) para LLM/STT/análisis/redacción; comunicaciones (`comm_settings.voice_minutes_remaining|sms_remaining|whatsapp_remaining`, `comm_usage_logs`) para PSTN/CR/WA/SMS. Cada servicio debita **antes** de llamar al proveedor con RPC atómico (`decrement_ai_credits`, `deduct_comm_credits`) y registra `cost_amount` real desde `provider_pricing` (`fn_estimate_cost`); al cerrar la llamada se ajusta con `CallDuration` real (reconciliación).
2. **Presupuesto mensual por org** (`comm_settings.ai_budget_monthly`) con límite duro: al 80 % notificación (`fn_create_org_notification`), al 100 % los jobs de `ai_call`/`ai_draft`/campañas quedan `queued` con `last_error='BUDGET_EXCEEDED'` hasta recarga; las llamadas humanas siguen mientras haya minutos.
3. **Sin saldo → sin proveedor**: el job pasa a `failed` con motivo legible y la UI muestra el estado en el timeline (nunca silencio).
4. **Precios en datos**: `provider_pricing` global (plataforma) con override por org (margen); UI de "Créditos y costos" muestra consumo por canal, por usuario y por agente.
5. **Reset mensual** ya existe para IA (`pg_cron reset-monthly-ai-credits`); F0 añade el equivalente para comunicaciones si `credits_reset_at` lo indica.

---

## 12. Compliance (Colombia)

| Requisito | Implementación | Fase |
|---|---|---|
| Aviso de grabación obligatorio | `<Say>` con `comm_settings.voice_consent_message` antes de cualquier `<Dial record>`; no desactivable si `voice_recording_enabled`; `call_consents` registra texto, locale, método y hora; el agente IA lo incluye en `welcomeGreeting` | F3 / F5 / F6 |
| Habeas Data (Ley 1581 de 2012) | `contact_consents` por canal con `source` y `evidence`; `fn_can_contact` enforced en email, WhatsApp, SMS, llamadas de agente y secuencias; exportación del historial de consentimientos por cliente | F0 → todas |
| Opt-in / opt-out por canal | Email: `List-Unsubscribe` + página pública + bounce/complaint; WhatsApp: STOP/BAJA/CANCELAR + Meta opt-out; SMS: Advanced Opt-Out de Twilio Messaging Service + keywords propios; Voz: "no volver a llamar" desde el análisis o manual | F7 / F16 / F8 |
| Horario permitido de contacto | `comm_settings.contact_hours` (por defecto L–V 8–20, S 8–13, hora `customers.timezone`); agentes y campañas fuera de horario se reprograman | F0 / F6 / F16 |
| Identificación del agente IA | `first_message` obligatorio con "asistente virtual de {org}"; guardarraíl que impide negarlo; transferencia a humano disponible (`transfer_to_human`) | F6 |
| No clonar voces ajenas | `voices` solo con `owner_user_id` = usuario autenticado que sube su muestra + `consent_recorded_at` + texto de consentimiento leído en la muestra; ElevenLabs IVC/PVC bajo la política "solo tu voz" | F6 |
| Retención de grabaciones | `voice_recording_retention_days` (default 365) → `retention_until`; job diario `recording_cleanup` borra en Storage y en Twilio (`DELETE /Recordings/{Sid}.json`) y marca `deleted` | F3 |
| Acceso a grabaciones | Bucket privado; solo via `/api/voice/recording/[id]/stream` con sesión y org; sin URLs Twilio directas | F3 |

---

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Subida a Node 22 rompe una dependencia | F0 valida `npm ci && build && test` en Node 22 antes de cambiar `engines`; plan B Node 20 + `openai` 6.x documentado (§5.1) |
| `twilio` 6 cambia firmas del SDK | Los parámetros usados están verificados en `docs-twilio-voice.md`/`docs-twilio-messaging.md`; tests de contrato en `src/lib/services/__tests__` |
| Webhooks con firma fail-closed rompen entornos de preview de Vercel | `TWILIO_WEBHOOK_BASE_URL` = origin por entorno; validación con `validateRequest` probando con y sin puerto; entorno de staging con subcuenta Twilio propia |
| Costos de IA/telefonía se disparan | Créditos atómicos + presupuesto mensual duro + `provider_pricing` + alertas 80 % (§11.2) |
| Grabar sin consentimiento | `<Say>` no desactivable + `call_consents`; tests que fallan si un TwiML con `record` no lleva `<Say>` |
| Fuga cross-tenant en webhooks (service role) | Resolución de org solo por identificadores persistidos; test automatizado que falla ante `.limit(1).single()` sobre `comm_settings`/`organizations` sin filtro de org (guardrail) |
| Meta pausa/deshabilita plantillas de marketing por calidad | Sincronización de `message_template_status_update`; campañas se pausan solas si la plantilla deja de estar `APPROVED`; error 131049 sin reintento 24 h |
| Límite 10 req/s de Resend y 100/día en Free | Cola con rate limit por proveedor; plan Pro de plataforma; `batch.send` (≤ 100, sin adjuntos) para secuencias masivas |
| ConversationRelay en es-MX sin voz ElevenLabs por defecto | `voice` siempre explícito (`{voice_id}-flash_v2_5`); fallback a `Polly.Mia-Neural` si la voz no existe |
| Railway ws-server desincronizado del repo | Dockerfile con `package-lock`, copia de `src/lib/services/crm/**`, CI que construye la imagen en cada PR de F6 |
| `openai 7` / `@google/genai` cambian de API | Adaptadores `llmClient.ts` por proveedor con interfaz única (`chat`, `structured`, `toolLoop`); singletons por org (no por módulo) |
| Doble motor de automatización durante la transición | F8 migra la única fila de `automations` y borra el legacy en el mismo PR; feature flag `crm.automation_engine='v4'` durante la ronda de QA |
| Alcance se infla | Regla de corte ≥ 9.5 por fase con `/loop`; máximo 3 rondas sin escalar; DoD verificable por fase |
| Capacitor sin SDK Twilio oficial | Bridge 2 patas (F5) funciona sin SDK; `@capgo/capacitor-twilio-voice` opcional en F15 |
| Precios de Meta CO no verificados | `provider_pricing` editable; F16 valida con el CSV oficial de la WABA de la org de prueba |
| **`cron.job` id 4 (`mantener-datos-reales-diarios`, `0 2 * * 1-6`) lleva un JWT `service_role` en texto plano dentro de `command`** (verificado 2026-09-08; `ANEXO-C` §1.4). Cualquiera con lectura de `cron.job` obtiene la clave maestra | **Rotación de la service key pendiente por el dueño** (Supabase → Settings → API → rotate; actualizar Vercel, Railway y la Edge Function). F0-DB reescribe el job para que lea el secreto desde Vault (`fn_crm_cron_post`) en vez de embeberlo; guardrail: consulta en `FASE-00` §3.3 que falla si `cron.job.command ILIKE '%eyJ%'` |
| Bucket `crm-documents` (privado, creado 2026-09-01) **sin ninguna política en `storage.objects`**: con RLS activo nadie puede leer/subir documentos de la ficha 360 (`ANEXO-C` §1.4) | Lo corrige **F0-DB (M3)** con el mismo patrón `org_{id}/` de `crm-call-recordings` (`crm_documents_select/insert/delete` para miembros activos); F9 lo verifica en su DoD (subir y descargar un documento desde el drawer) |
| Tablas de configuración vacías hacen que la UI V3 parezca rota (`verticals`, `objections`, `icp_profiles`, `onboarding_templates`, `partner_tiers`, `referral_programs`, `call_tags` = 0 filas; `scoring_configs` solo org 134) | Seeds idempotentes por organización definidos en `ANEXO-C` §7; los aplica el agente DB de la Ola 5 (o antes si F4 necesita `call_tags`) |

---

## 14. Definition of Done global (con una org de prueba distinta a GoAdmin)

1. Con `provider_configs` vacío y solo env de plataforma, el softphone registra en < 3 s al entrar a cualquier página de `/app` (`deviceState='registered'`).
2. Desde la tarjeta del Kanban, "Llamar → Navegador" marca **una sola vez** al cliente, reproduce el aviso de grabación en es-MX y al colgar existen: `calls` (`completed`, `duration_seconds` = `CallDuration`), `call_recordings` (`ready`, archivo en `crm-call-recordings/org_{id}/…`), `call_consents`, y **una** `activities` con `activity_type='call'`, `call_id`, `channel`, `duration_seconds`.
3. En ≤ 3 min tras colgar, esa actividad tiene `notes` = resumen, `metadata.transcript_id` y `metadata.analysis_id`; el timeline muestra player, transcripción diarizada (roles por canal) y análisis con `sentiment` (incl. `mixed`) y `suggested_stage_id` válido para el pipeline.
4. "Llamar → Mi celular" suena en el celular guardado en `user_comm_preferences`, pide "1", conecta con el cliente y produce exactamente los mismos artefactos que el punto 2–3.
5. Una llamada entrante al número de la org suena en el navegador del usuario asignado (`IncomingCallToast`), se contesta, y genera `calls{mode:'inbound'}` + actividad.
6. `ComposeEmailDialog` envía un email con bloques (logo, texto con `{{contact.first_name|cliente}}`, botón, firma, footer legal) desde el dominio verificado de la org (no desde `EMAIL_FROM_ADDRESS`), con adjunto de `documents`, y el timeline muestra `sent → delivered → opened` desde el webhook; un doble clic no duplica el envío (idempotencia).
7. Responder ese email desde el cliente crea `email_messages{direction:'inbound'}` enlazado al hilo y aparece en el timeline; hacer clic en "Cancelar suscripción" pone `contact_consents{email, opted_out}` y el siguiente envío devuelve 422.
8. `ComposeWhatsAppDialog` envía texto libre dentro de la ventana de 24 h y exige plantilla `APPROVED` fuera de ella; el mensaje sale por `messages → trg_channel_dispatch → channel-dispatch`, llega al teléfono, y la respuesta del cliente aparece en el timeline de la oportunidad (`related_opportunity_id`); escribir "BAJA" bloquea envíos futuros.
9. Una campaña WhatsApp a un segmento de 50 contactos materializa 50 `campaign_contacts`, encola 50 `outbound_jobs` escalonados, entrega ≥ 48, y `campaigns.statistics` refleja sent/delivered/read/replied vía `fn_campaign_mark_*`.
10. Mover una oportunidad a la etapa "Demo agendada" (por drag) inserta `crm_events{stage.changed}` y, dentro de 2 min, la regla configurada envía el email de confirmación, el WhatsApp con plantilla y crea la tarea a 48 h; `automation_runs` lo registra.
11. Una secuencia de 4 pasos (email → wait 2 d → whatsapp → condition(replied) → call task) avanza sola por `jobs/run`, sale al detectar respuesta y nunca envía a un cliente `opted_out`.
12. Un agente IA con `purpose_type='confirm_demo'`, voz clonada (IVC del vendedor con consentimiento) y `llm_provider='openai'`, disparado por `stage_agents{trigger_on:'enter'}`, llama solo, se identifica como asistente virtual, confirma la demo, ejecuta `book_meeting` (aparece en `calendar_events` + ICS por email) y `move_opportunity_stage` (respetando gates), y deja `voice_agent_calls{completed}`, `voice_agent_tool_runs` y una actividad `ai_call` con la conversación.
13. El mismo agente con `llm_provider='gemini'` y con `engine='elevenlabs_agent'` completa el punto 12 (tests de paridad).
14. El agente puede redactar y enviar el email y el WhatsApp de seguimiento (`ai_draft`) y detiene la secuencia cuando el cliente responde.
15. Ningún endpoint acepta `organizationId` del body; todos los webhooks devuelven 403 con firma inválida y 401 sin `CRON_SECRET`; `ws-server` rechaza upgrades sin firma/token; el test de guardrails detecta cualquier `.limit(1)` sobre `comm_settings` sin filtro de org.
16. Cada acción de IA/telefonía/WA debita créditos **antes** del proveedor; al agotar el presupuesto mensual los jobs quedan en espera con motivo visible; `ai_usage_logs`/`comm_usage_logs` cuadran con `provider_pricing` ± 5 %.
17. `provider_configs.credentials` y `channel_credentials.credentials` nunca viajan al browser (test de red en `/app/configuracion`).
18. `npm run lint`, `tsc --noEmit`, `npm test` limpios en Node 22; cero `.sql` en el repo; cero referencias a `organizationId = 1`; los archivos de §10 no existen.
19. Todo lo anterior funciona en Web, PWA y Electron; en Capacitor funcionan el bridge de 2 patas, email, WhatsApp y el agente (el softphone WebRTC queda para F15).
20. Documentación: cada fase tiene su `FASE-XX.md` V4 con DoD verificable y `PROGRESS.md` registra cada ronda con calificación ≥ 9.5.

---

## 15. Índice de documentos

| Documento | Contenido | Versión |
|---|---|---|
| `PLAN.md` | Este documento | V4 |
| `ANEXO-A-INVENTARIO-ACTUAL.md` | Inventario verificado 2026-09-08 por capa + mapa de bugs SEC/SCH/WIRE/UX | V4 |
| `ANEXO-B-PROVEEDORES-Y-APIS.md` | Referencia de proveedores verificada 2026-09-08 (Twilio Voice/Messaging, ElevenLabs, OpenAI, Gemini, Resend, Meta WhatsApp, Cal.com/Google Calendar) + tablas de costos, env vars, versiones npm, webhooks y deprecaciones; corregida con `tester-ANEXO-B-r1` (nombres de env existentes: `TWILIO_API_KEY`/`TWILIO_API_SECRET`/`TWILIO_TWIML_APP_SID`, `GOOGLE_AI_API_KEY`, `DEEPGRAM_*` vivo hasta F4) | V4 |
| `ANEXO-C-RECONCILIACION-2026-09.md` | Reconciliación línea por línea de las fases V3 (F1, F2, F10–F15) contra la BD y el código reales: conteos `count(*)`, políticas RLS de las 10 tablas "con una política", H1–H6 confirmadas, componentes V3 huérfanos, hallazgos nuevos (SCH-21…24, SEC-27…29, WIRE-51…53) y seeds recomendados | V4 (nuevo) |
| `FASE-00-FUNDACIONES.md` | Seguridad, schema, cola/scheduler, registry cifrado, config, nav, Node 22 | V4 |
| `FASE-01-ESTRUCTURA-COMERCIAL.md` · `FASE-02-PIPELINE-PROFESIONAL.md` | Estructura comercial y pipeline profesional | V3 (conservadas; cabecera "Estado V4" con la reconciliación de `ANEXO-C` §4.1–4.2) |
| `FASE-03-TELEFONIA-CRM.md` | Softphone global, llamada desde pipeline, grabación, consentimiento, entrantes, actividad | V4 |
| `FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | Pipeline por cola hasta la actividad enriquecida | V4 |
| `FASE-05-LLAMADAS-MOVIL-PERSONAL.md` | Bridge 2 patas, preferencias del vendedor, Capacitor/Electron | V4 |
| `FASE-06-AGENTE-IA-VOZ.md` | Agente multicanal por etapa, voz clonada, tools, UI | V4 |
| `FASE-07-EMAIL-Y-PLANTILLAS.md` | Editor bloques + HTML, dominios por org, IA, inbound, baja | V4 |
| `FASE-08-AUTOMATIZACIONES-SECUENCIAS.md` | Motor único + builders | V4 |
| `FASE-09-FICHA-360.md` | Timeline unificado, QuickActionsBar, drawer/detalle, Kanban unificado | V4 |
| `FASE-16-WHATSAPP-INDIVIDUAL-Y-MASIVO.md` | WhatsApp individual y masivo | V4 (nueva) |
| `FASE-10` … `FASE-15` | Propuesta/contrato/pago, post-venta, referidos, equipo, Revenue OS, Motion/cross-platform | V3 (conservadas; F10–F13 con cabecera "Estado V4" según `ANEXO-C` §4.3–4.6; F14/F15 reconciliadas en `ANEXO-C` §4.7–4.8) |
| `PROGRESS.md` | Estado, rondas y calificaciones (`/loop`) | vivo |

---

## 16. Seguimiento: `PROGRESS.md` + `/loop`

- **Fuente de verdad**: `docs/crm-revenue-os/PROGRESS.md`. Se agrega, nunca se reescribe desde cero. La tabla "Fases" lleva las 17 fases V4 con estado `pendiente | en_progreso | en_revision | aprobado`, ronda actual, última calificación y responsable.
- **Ciclo por fase** (`.devin/workflows/loop.md`): `builder` (construye la parte + resumen) → `tester` (pruebas reales con la org de prueba; reporte con casos ejecutados/pasados/fallados, evidencia, calificación de robustez) → `qa-reviewer` (rubric de 5 dimensiones, calificación 1–10, lista priorizada) → actualización de `PROGRESS.md` → nueva ronda si < 9.5.
- **Formato de ronda** en `PROGRESS.md`:

```
### Fase: F3 Telefonía — Ronda 2 — 2026-09-xx
- Calificación QA: 8.5/10 · Calificación Tester: 8/10 (1 fallo alto)
- Qué se hizo: …
- Qué falta / feedback recibido:
  1. [alto] …  2. [medio] …
- Próxima acción: …
```

- **Reglas duras**: no se aprueba sin pruebas reales del tester; máximo 3 rondas seguidas sobre la misma parte sin escalar el bloqueo raíz a input humano; partes independientes se construyen y prueban en paralelo; los documentos de fase se actualizan en la misma ronda en que cambia una decisión.
- **Ronda 1 (esta)**: reescritura de `PLAN.md` y `ANEXO-A` (V4); las fases F0, F3–F9 y F16 se reescriben a continuación con la estructura obligatoria del brief; `PROGRESS.md` recibe la tabla de fases V4 al cerrar la ronda.
