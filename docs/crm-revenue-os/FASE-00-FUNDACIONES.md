# FASE 00 — Fundaciones: seguridad multi-tenant, cola/scheduler, registry de proveedores e higiene

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye íntegramente el V3)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Repo: `go-admin-erp` (Next.js 15.5 App Router + React 19 + Supabase + Vercel iad1 + Railway ws-server)
> Dependencias: ninguna (es la base). Bloquea: F1–F16 (nada arranca sin F0 completa).
> Esfuerzo: **XL** (≈ 12 PRs ≤400 líneas + 9 migraciones) · Valor: **crítico** (hoy ningún webhook Twilio responde, hay IDOR/SMS-pumping abiertos y no existe ningún scheduler)

---

## 0. Objetivo y alcance

Al terminar F0 se cumple, de forma verificable:

1. **Cero fugas multi-tenant**: todos los route handlers bajo `/api` resuelven `organizationId` desde sesión (`getServerOrgContext`) o desde firma verificada (`resolveOrgFromExternal`); ningún endpoint acepta `organizationId` del body sin verificar membership; los tres fallbacks "primera org activa" desaparecen; `update_field` solo escribe columnas de una allow-list.
2. **Webhooks fail-closed**: Twilio (token de la (sub)cuenta resuelto por `AccountSid` ANTES de validar, URL reconstruida desde `TWILIO_WEBHOOK_BASE_URL` = origin puro), Meta (`X-Hub-Signature-256` con `timingSafeEqual` y `app_secret` del canal), Resend (svix), ElevenLabs (`constructEvent`) y el ws-server (X-Twilio-Signature en el upgrade + token por sesión). Sin secreto configurado → 401/403, nunca "warn & continue".
3. **Secretos cifrados** en Supabase Vault (`vault.create_secret` / `vault.decrypted_secrets`); las columnas `provider_configs.credentials`, `channel_credentials.credentials` y `comm_settings.twilio_subaccount_auth_token` dejan de ser legibles por `authenticated`/`anon`; el único lector es `getProviderCredentials(orgId, category)` server-only con service role.
4. **Schema reconciliado**: los CHECKs de `calls`, `call_recordings`, `call_analyses`, `activities`, `voice_agents`, más `customers.timezone`, `messages.related_opportunity_id`, `templates.blocks_json/engine/version`, `call_recordings.updated_at` y el bucket privado `crm-call-recordings` existen y los tipos TS se derivan de un único `src/lib/crm/enums.ts`.
5. **Cola y scheduler operativos**: `outbound_jobs` + `crm_events` con `fn_claim_jobs` (FOR UPDATE SKIP LOCKED), `fn_complete_job`, `fn_fail_job` (backoff exponencial, `dead`), trigger `trg_opp_stage_change_enqueue`, y tres jobs pg_cron que golpean `POST /api/crm/jobs/run` (fail-closed con `CRON_SECRET` desde Vault). Vercel cron queda documentado como respaldo.
6. **Registry de proveedores configurable por org**: seed de `provider_configs` por categoría con fallback env, `provider_pricing` con los precios de D8, endpoints `GET/PUT /api/crm/config/providers` y `POST /api/crm/config/providers/test`, y el contenedor `CrmConfigTabs` en `/app/configuracion?modulo=crm` con los tabs Proveedores/IA y Créditos funcionando.
7. **Higiene**: `.env.example` completo, versiones npm fijadas (Node 22), Dockerfile del ws-server con lockfile y `src/lib/services/crm/**`, código muerto eliminado, nav CRM final, permisos de micrófono en Capacitor y Electron.
8. **Guardarraíles**: `guardrails.test.ts` ampliado con 6 reglas nuevas que fallan el build ante cualquier regresión de los puntos anteriores.

**NO incluye**: softphone/llamadas (F3), grabación+transcripción+análisis (F4), bridge móvil (F5), agente IA (F6), email/plantillas (F7), automatizaciones/secuencias (F8), ficha 360 (F9), WhatsApp (F16). F0 solo deja el suelo firme; los handlers de job por `kind` se registran en cada fase.

---

## 1. Estado actual verificado

Fuente: `audit-telephony.md`, `audit-messaging.md`, `audit-ai-automations.md`, `audit-ui.md` y consultas SQL en vivo (2026-09-08). Solo hechos.

> **Fe de erratas ronda 1 (tester F00 r1, aplicada por DOCS el 2026-09-08).** Correcciones ya hechas en este documento: citas `voiceAgentService:837,843` (la 838 es línea en blanco), ruta real `src/components/chat/channels/whatsapp/id/WhatsAppCredentialsCard.tsx`, sin `ComingSoon` en §5, PWA sin `getUserMedia` (§5.8), 13 webhooks (§10), guardarraíl #7 con allow-list para `webhooks/facebook|instagram` (§9.1), DoD del cron verificado por `net._http_response` (§10). Correcciones que pertenecen a secciones editadas por otros agentes de la Ola 1 y que ellos deben aplicar: **§4.2** fila `apiClient.ts` cita `src/lib/supabase/config.ts:130` → `currentOrganizationId` está en `:773` y `:864` (REG); **§12** misma cita en PR-04 y ruta de `WhatsAppCredentialsCard` (REG); **§12** quitar `ComingSoonSection.tsx` de "Crear" (REG); **§3.2** revisar el marcado `verified` de `voice_in_local_co 0.0945`, `recording_storage 0.0005` y `amd 0.0075` contra `docs-twilio-voice.md` (DB); **§3.3/M3** política de storage con `substring(name from '^org_([0-9]+)/')::integer` (DB); **§2.2** nomenclatura: `verifyCronSecret` es la función interna y `withCron` el wrapper público de §4.2, usar solo `withCron` en diagramas (JOBS); **§4.2** `ElevenLabsClient.user.get()`, `voices.search` y `GoogleGenAI.models.list` marcados como "no verificados" hasta que REG los pruebe con la clave real. Hallazgos nuevos de BD (H1 JWT en `cron.job` 4, H2 `crm-documents` sin políticas, `comm_settings_select` `TO public` sin `is_active`, `current_org_id()` NULL para usuarios normales, `app.settings.cron_secret` inexistente → Vault) están en §7 y en `ANEXO-C` §1.4/§2.

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| `src/lib/utils/orgContext.ts:235` `resolveOrgFromExternal` | ✅ r1 SEC | Usa `getServiceClient()` (`src/lib/supabase/server-service.ts:26`) + `.limit(1).maybeSingle()`; kinds nuevos `channel_id`, `account_sid`, `bridge_id`, `voice_agent_call_id` (C0 cerrado) |
| `src/lib/utils/orgContext.ts:128` `getServerOrgContext(req?)` | ✅ r1 SEC | Header `X-Organization-Id` → cookie `goadmin_org_id` → `profiles.last_org_id` (consulta directa por `organization_id`, sin `limit(2)`, tester #7) → única membresía → 400 `ORG_AMBIGUOUS` (:178). `requireOrgAdmin` :201 (criterio de `rbac.ts` + `is_super_admin`), `withOrg` :286, `withCron` :305 (C21 msg cerrado) |
| `src/app/api/chat/ai/auto-response/route.ts:17` | ✅ r1 SEC | `getServerOrgContext(request)`; `organizationId` del body solo si coincide (403); service client filtrado por `ctx.organizationId` (C-A cerrado) |
| `src/app/api/ai-assistant/{improve-text:18, generate-image:11, pm-assist:60, pm-planner:49, seo-keywords:18, chat:11, reportes:14}` | ✅ r1 SEC | Sesión + org de `ctx`; se ignora `organizationId` del body; `chat`/`reportes` fuerzan `context.organizationId = ctx.organizationId` (C-A cerrado) |
| `src/app/api/chat/ai/{generate-response:14, classify-intent:14, generate-summary:14}` | ✅ r1 SEC | Org de sesión (403 si el body trae otra); `consumeAICredits(ctx.organizationId)` (C-B cerrado; C-10 atomicidad la cierra REG en `aiCreditsService`) |
| `src/app/api/ai-assistant/dynamic-options/route.ts` | ✅ r1 SEC | JWT literal eliminado; `ctx.supabase` (RLS) + `ctx.organizationId` (C-D cerrado) |
| `src/app/api/integrations/twilio/verify/{send:50, check:49}` | ✅ r1 SEC | Sesión + `checkRateLimits` 5/10 min por IP, usuario y número (`src/lib/security/rateLimit.ts:54`); `purpose:'mobile_verification'` registra/valida `profiles.metadata.pending_mobile_verification` y guarda `profiles.phone` (C1 msg cerrado) |
| `src/app/api/integrations/whatsapp/send/route.ts:60-74,208` y `mark-read:29`, `validate:35`, `qr/_shared.ts:12` (`requireOwnedChannel` para `qr/{send,start,stop,logout,status,mark-read}`) | ✅ r1 SEC | Sesión + `channels.organization_id = ctx.organizationId` (404 si no). `send` ya NO llama a Meta: inserta en `messages` con la shape viva (`direction/role/channel_id/content/sender_member_id`) y despacha `trg_channel_dispatch`; find-or-create de conversación por cliente+canal; sin cliente → 400 (C2, C11, C12, C20 msg cerrados) |
| `src/app/api/integrations/twilio/{send-whatsapp:14, send-sms:14}` (+ `credits:14`, `usage:14`) | ✅ r1 SEC | `getServerOrgContext`; `orgId` del body/query ignorado (403 si difiere) (C4 msg cerrado) |
| `src/app/api/integrations/sendgrid/send:16,47-56`, `notifications/process:16,34` | ✅ r1 SEC | Sesión; `connection_id` verificado contra `integration_connections.organization_id`; `NotificationService.processEmailNotifications(orgId, getServiceClient())` (C5 msg cerrado) |
| `src/app/api/integrations/whatsapp/webhook/route.ts:84` | ✅ r1 SEC | `verifyMetaSignature` (`webhookSignatures.ts:157`, `timingSafeEqual`) sobre raw body con `channel_credentials.credentials.app_secret` del canal (por `phone_number_id`) o `META_APP_SECRET`; sin secreto → 403 (C3 msg cerrado) |
| `src/lib/security/webhookSignatures.ts:73,131` (antes `twilioWebhook.ts:25-37`) | ✅ r1 SEC | `resolveTwilioAuthToken(AccountSid)`: master → env; subcuenta → `comm_settings.twilio_subaccount_auth_token`; desconocido → 403. `verifyTwilioWebhook(req)` reconstruye la URL desde `TWILIO_WEBHOOK_BASE_URL` (origin) + pathname + search (C12, C13 voz cerrados). `validateTwilioSignature` queda `@deprecated` |
| 8 rutas voz (`voice/status:28`, `recording:31`, `twiml/outbound:26`, `twiml/inbound:27`, `agent-leg:33`, `customer-leg:34`, `ai-agent:46`, `bridge/status:55`) + `integrations/twilio/{voice/incoming:50, status-callback:22, incoming-message:31}` | ✅ r1 SEC | `verifyTwilioWebhook` fail-closed en dev y prod (403 sin firma/token). `voice/status` y `bridge/status` mapean con `twilioCallStatusToDb` (`enums.ts:229`); `bridge/status` inserta `from_number/to_number` + `mode:'bridge'` (C12, C-E, C3 parcial, C4 parcial cerrados) |
| `src/lib/services/integrations/twilio/twilioConfig.ts:83` `getWebhookBaseUrl()` + call sites | ✅ r1 SEC | Devuelve SIEMPRE el origin (`new URL(x).origin`); las rutas construyen `${origin}/api/voice/...`; `twilioService` usa `${origin}/api/integrations/twilio/status-callback` (C2 voz, C-8 cerrados) |
| `src/app/api/crm/followup/run/route.ts` + `followupEngineService.ts` | ✅ r1 SEC | **Eliminados** (junto con sus re-exports en `crm/index.ts`). Único motor: `automationService` + `sequenceService` (C-C, C24 msg cerrados) |
| `ws-server.ts:97,141` | ✅ r1 SEC | `noServer` + `authenticateUpgrade`: token `?st=` (`wsSessionToken.ts:58`, HMAC `WS_SESSION_SECRET`, 10 min) + `X-Twilio-Signature` sobre `WS_PUBLIC_URL`+path+query con el token de la (sub)cuenta de la org; `conversationRelayHandler.ts:130` re-verifica `customParameters.token` en `setup` y cierra 1008 (C22 voz cerrado) |
| `integrations/twilio/voice/incoming:70-75`, `conversationRelayHandler.ts` `findOrgByNumber`, `twilioWebhook.ts:270` | ✅ r1 SEC | Fallback eliminado: sin match en `comm_settings` → `<Say language="es-MX">…no está configurado</Say><Hangup/>` / null; `incoming` ya no inserta `comm_usage_logs` con `organization_id: 0` (C11, C-G, C22 msg cerrados) |
| `src/lib/services/crm/automationService.ts:464,492` | ✅ r1 SEC | `UPDATE_FIELD_ALLOWLIST` (opportunities: temperature, next_contact_at, next_action, expected_close_date, amount, recontact_at, source, deal_type; customers: lifecycle_stage, tags; tasks: priority, due_date; **sin** stage_id) + `validateUpdateField` con tipos (C-H cerrado) |
| `twilioService.ts:9`, `twilioWebhook.ts:17`, `twilioSubaccounts.ts:9`, `notificationService.ts` | ✅ r1 SEC | `getServiceClient()`; `notificationService` recibe `client?: SupabaseClient` (default browser para la UI). `followupEngineService` eliminado. Deuda legacy restante en allow-list del guardarraíl #6 (C9 msg, C15 voz cerrados) |
| `chatChannelsService.ts:192-197,236-241`, `src/components/chat/channels/whatsapp/id/WhatsAppCredentialsCard.tsx:39-42`, `sendgridService.getCredentials:29-49`, `providerRegistry.ts:57-73` | 🟡 | Secretos en claro seleccionados con cliente anon/browser (C8 msg) → **r1 (REG):** `providerRegistry.getActiveProvider` ya no selecciona `credentials` con el cliente de sesión; delega en `providerCredentials.server.ts` (service role). `chatChannelsService`/`WhatsAppCredentialsCard`/`sendgridService` quedan para F16/SEC |
| `provider_configs` (BD) | ✅ | Existe, RLS 4 políticas `authenticated`, UNIQUE(org,category,provider), **0 filas** → todo cae a env global; `credentials jsonb` legible por cualquier miembro → **r1 (REG):** DB sembró 372 filas (31 orgs × 12); `authenticated` sin SELECT sobre `credentials`; endpoints `GET/PUT /api/crm/config/providers` + `POST …/test` y UI "Proveedores e IA" operativos |
| `comm_settings.twilio_subaccount_auth_token` (BD) | 🟡 | Texto plano; política `comm_settings_select` para `public` con solo `user_id = auth.uid()` (sin `is_active`); 31 filas, 0 tokens hoy |
| `channel_credentials` (BD, 1 fila) | 🟡 | Política solo super admins, pero el browser la lee con anon (C8) |
| `vault` (BD) | ✅ | `supabase_vault 0.3.1` instalado, 0 secretos; `pgsodium` NO instalado |
| `calls` CHECKs vs `callManagementService.ts:15-24` | 🔴 | TS `click-to-call|voice-agent|power-dialer`, `queued|in-progress|no-answer`, `agent-first|…` vs BD `browser|bridge|ai_agent|manual|inbound`, `dialing|…|in_progress|no_answer`, `agent_leg|customer_leg|full_bridge`; `voice/status:143-164` mapea a valores inválidos (C3) |
| `call_recordings` (BD) | 🔴 | Sin `updated_at` pero `callManagementService:449` lo escribe; `voice/recording:182-195` escribe status `completed` (inválido) (C5) |
| `call_analyses.sentiment` CHECK | 🟡 | Sin `mixed` aunque zod `:79` y Gemini enum `:212` lo emiten → 23514 (C16) |
| `activities.activity_type` CHECK | 🔴 | `call|email|whatsapp|visit|note|system`; el código usa `meeting`, `stage_change`, `email_sent`, `transfer`, `follow_up`, `reminder`, `automation_log` (C-4); sin `call_id/email_message_id/message_id/conversation_id` |
| `customers.timezone`, `do_not_call` | 🔴 | No existen; `crm/voiceAgentService.ts:592,616,781` los consulta (C-1) |
| `messages.related_opportunity_id` | 🔴 | No existe → timeline de oportunidad nunca muestra WhatsApp (B15 UI) |
| `templates` | 🟡 | Sin `blocks_json`/`engine`/`version`; solo `metadata` |
| `voice_agents.purpose_type` CHECK | 🟡 | Sin `sell_product`/`book_meeting`; TS usa `follow_up`,`survey` (C-5) |
| Bucket `crm-call-recordings` | 🔴 | No existe; `recordingStorageService.ts:18` lo usa (C6). `crm-documents` existe (privado) pero **sin ninguna política en `storage.objects`** |
| `tasks` | ✅ | CHECK `open|in_progress|done|canceled`, columnas `related_to_id/related_to_type`; el código usa `related_id` y `pending` (C-3) |
| pg_cron | 🟡 r2 DB/JOBS | Jobs 17/18/19 `crm-*` creados (`active=false`, 0 ejecuciones) con `fn_crm_cron_post(p_path, p_body)` y body `{"kinds":[…]}` (18/19); el orquestador los activa tras el deploy. El job 4 sigue con el **JWT service_role embebido** (H1, fuera de CRM) |
| `vercel.json` crons + `src/app/api/crm/jobs/run/route.ts` | ✅ r2 JOBS | 3 crons a `/api/crm/jobs/run` (`* * * * *`, `*/5`, `30 8`; `vercel.json:8-19`); ruta fail-closed (`run/route.ts:60`), kinds inválidos ⇒ 400 (`:77-82`), productor programado antes de drenar (`:91-93`, `src/lib/jobs/scheduler.ts:60`) |
| Cola `outbound_jobs` (código) | ✅ r2 JOBS | `src/lib/jobs/runner.ts:179` `runJobs` (claim/complete/fail/`fn_release_job` `:142`), `enqueue.ts:37` `enqueueJob` (valida `runAt` `:28`), handlers `noop|crm_event|maintenance` (+ placeholders), `jobsService.ts:28-54` roles y `redactPayload`, `GET /api/crm/jobs` (`route.ts:19-21`, admin/Manager), `retry` (`[id]/retry/route.ts:20-22`, admin), UI `JobsMonitor.tsx` + `JobsTable.tsx` |
| `ws-server.Dockerfile` | ✅ | `npm init -y && npm install …` sin lockfile; no copia `src/lib/services/crm/**` ni instala zod/resend (C-17, C23) → **r1 (REG):** `COPY package.json package-lock.json` + `npm ci --include=dev` + `COPY src/lib/ src/types/` (cubre `security/`, `supabase/`, `services/**`); imagen ≈1.6–1.9 GB, build ≈3–5 min (ver cabecera del Dockerfile) |
| `package.json` | ✅ | engines `^18.18 || ^19.8 || >=20`; `twilio ^5.12.1`, `openai ^6.15.0`, `@google/genai ^2.20.0`, `resend ^6.25.0`, `@twilio/voice-sdk ^2.18.3`; sin `@elevenlabs/elevenlabs-js`; local Node v22.14 → **r1 (REG):** instalados `twilio 6.1.0`, `@twilio/voice-sdk 2.18.4`, `resend 6.26.0`, `@elevenlabs/elevenlabs-js 2.67.0`, `@google/genai 2.21.0`, `@react-email/components 1.0.12`, `@react-email/render 2.1.0`, `sanitize-html 2.17.7`; `engines.node >=20.0.0`; `openai` se mantiene en `^6.15` (Node 20 en Railway; plan 7.x en §4.7); `tsc` sin errores nuevos por los upgrades |
| Nav CRM `AppLayout.tsx:122-139` y `moduleConfig.ts:136-141` | ✅ | Sin Llamadas/Leads/Agentes IA/Plantillas/Secuencias/Automatizaciones; dos listas inconsistentes → **r1 (REG):** única fuente `src/config/crmNav.ts` (`CRM_NAV`, `CRM_NAV_ENABLED`, `CRM_MODULE_SUBROUTES`); `AppLayout.tsx` y `moduleConfig.ts` la consumen; Agentes IA/Plantillas/Secuencias/Automatizaciones con `enabled:false` hasta F6/F7/F8 |
| `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/templates/Info.plist:37` | 🟡 | Sin `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`; plist solo `NSCameraUsageDescription` |
| `electron/src/main/index.ts:52`, `windows/mainWindow.ts:117-123` | 🟡 | Sin `setPermissionRequestHandler` → getUserMedia puede denegarse silenciosamente |
| `src/__tests__/guardrails.test.ts:221,331,434,473,497` | ✅ r1 SEC | 9 reglas: (1) org=1, (2) tablas plataforma, (3) display_order, (4) `callService.ts` no existe, (5) org del body sin `getServerOrgContext` (allow-list legacy explícita + detección de entradas obsoletas), (6) `@/lib/supabase/config` en server (allow-list legacy), (7) webhooks importan `verify*` (allow-list facebook/instagram/email), (8) sin `comm_settings.limit(1).single()`, (9) `enums.ts` == `src/lib/crm/__fixtures__/db-checks.json` (snapshot de `pg_constraint`, con `planned_extras`) |
| Código muerto: `callService.ts` (292L), `realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`, `voiceAgent/voiceAgentService.ts`, `twilio/voice/media-stream` (410), `pipeline/EmailNotifications.ts/.tsx`, `AutomationSettings.tsx` (tabla inexistente), `followupEngineService.ts` + `followup/run`, `KanbanBoard/KanbanColumn/OpportunityCard` | 🟡 | Ver audits §2/§B; `automations` legacy tiene 1 fila (migrar en F8) → **r1 (REG):** eliminados por REG `voiceAgent/{realtimeSession,elevenLabsTTS,deepgramSTT,voiceAgentService}.ts` (+ exports en `voiceAgent/index.ts`), `pipeline/EmailNotifications.ts/.tsx`, `pipeline/AutomationSettings.tsx`; `OpportunityAutomations.tsx` deja `sendStageChangeNotification` como no-op con TODO F8; `callService.ts`, `media-stream`, `followupEngineService`/`followup/run` los eliminó SEC; Kanban* queda para F9 |

---

## 2. Arquitectura y flujo

### 2.1 Resolución de identidad y organización (dos únicas puertas)

```
Browser/Capacitor/Electron                     Next.js route handler                    Postgres
────────────────────────────                   ─────────────────────────                ────────
fetch('/api/...', {                            getServerOrgContext(req)
  headers:{'X-Organization-Id': org}           ├─ supabase.auth.getUser()  ── JWT ──►  auth
  cookie: goadmin_org_id=org })                ├─ orgId := header ?? cookie ?? profiles.last_org_id
                                               ├─ organization_members WHERE user_id=uid
                                               │     AND organization_id=orgId AND is_active
                                               │     → 0 filas ⇒ 403 ORG_FORBIDDEN
                                               │     → sin header/cookie y >1 membresía ⇒ 400 ORG_REQUIRED
                                               └─ {organizationId, userId, roleName, supabase(RLS)}

Twilio / Meta / Resend / ElevenLabs            verifyXWebhook(req) (raw body)           
  POST + firma ──────────────────────────────► ├─ resolver secreto: AccountSid→token,
                                               │    channel→app_secret, svix secret…
                                               ├─ validar firma (fail-closed 403)
                                               └─ resolveOrgFromExternal(id, kind) ── service role ──► phone_numbers|calls|email_domains|email_messages|channels
                                                    → 404 ⇒ 200 vacío + integration_events (Twilio no reintenta), NUNCA fallback
pg_cron ─ net.http_post Bearer CRON_SECRET ──► verifyCronSecret(req) ⇒ 401 si falta/errado
```

### 2.2 Cola y scheduler

```
opportunities UPDATE stage_id ──trg_opp_stage_change_enqueue──► crm_events(pending)
API/servicios (F3–F16) ──enqueueJob(kind,payload,dedupe_key)──► outbound_jobs(queued)

pg_cron 'crm-jobs-every-minute' (* * * * *)  [job 17, hoy active=false]
  └─ fn_crm_cron_post('/api/crm/jobs/run') → net.http_post {vault:crm_app_url}/api/crm/jobs/run  body '{}'
       Authorization: Bearer <vault:crm_cron_secret>  (o header x-cron-secret; NUNCA ?token=)
       └─ runJobs(): deadline = 50 s (menos lo que gaste el productor programado)
            loop: fn_claim_jobs(kinds|null, 25, worker) ── FOR UPDATE SKIP LOCKED (attempts+1 en el claim)
                  for job: handler = registry[kind] ?? fn_fail_job(id, worker, 'no_handler', -1) ⇒ `failed` (terminal)
                           try  → fn_complete_job(id, worker, result)
                           catch→ fn_fail_job(id, worker, error, retry_after|null|-1)
                                  (null ⇒ backoff 60s·2^attempts máx 1 h + jitter; attempts≥max ⇒ dead; -1 ⇒ failed)
                  sin presupuesto → fn_release_job(id, worker) (DB-r2; fallback UPDATE attempts-1) ⇒ `released`
            devuelve {success, kinds, worker, claimed, done, skipped, retried, failed, dead, released, ms, byKind, scheduled?}
pg_cron 'crm-campaigns-5min'    (*/5 * * * *) [job 18, inactivo] → fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["campaign_batch"]}')
pg_cron 'crm-daily-maintenance' (30 8 * * *)  [job 19, inactivo] → fn_crm_cron_post('/api/crm/jobs/run', '{"kinds":["recording_cleanup","maintenance"]}')
                                 (08:30 UTC = 03:30 Bogotá; pg_cron usa GMT. DB-r2 `crm_v4_f00_15`: kinds por body, espejo exacto de vercel.json;
                                  `recording_cleanup` no encola nada hasta que F3 registre el handler real)
Vercel cron (respaldo, vercel.json, Bearer automático): '* * * * *' (todos) · '*/5 * * * *' (campaign_batch) ·
                                 '30 8 * * *' (recording_cleanup,maintenance) — se distinguen por el header x-vercel-cron-schedule
Productor programado (F0 r2, tester F-1): cuando la petición pide `maintenance`/`recording_cleanup` (query, body o header
  Vercel), ANTES de drenar corre `runScheduledKinds`: `maintenance` se ejecuta directamente (global, idempotente; no cabe en
  la cola porque organization_id es NOT NULL/FK) y `recording_cleanup` encola un singleton diario por org
  (`recording_cleanup:{yyyy-mm-dd}`) solo cuando F3 registre el handler real.
`?kind=` o `body.kinds` con un valor que no es JobKind ⇒ 400 (tester F-3): un typo en un cron nunca drena toda la cola.
```

### 2.3 Máquina de estados de un job

```
queued ──claim (attempts+1)──► running ──ok──► done   (result.skipped=true ⇒ además "skipped")
   ▲                              │
   │  fail & retryable & attempts<max (retry_after ⇒ run_at explícito; null ⇒ backoff)
   ├──────────────────────────────┤
   │  release por deadline del runner (fn_release_job / fallback: attempts-1, last_error intacto)
   │                              │
   │                              ├── fail & !retryable (p_retry_after_seconds = -1: no_handler, JobFatalError) ──► failed  (TERMINAL)
   │                              └── fail & retryable & attempts ≥ max_attempts ────────────────────────────────► dead    (TERMINAL)
running con locked_at < now()-10 min ──reclaim (fn_claim_jobs)──► queued (o dead si attempts ≥ max)
failed|dead ──POST /api/crm/jobs/[id]/retry (admin)──► job NUEVO queued (mismo dedupe_key; el original queda intacto)
```
Semántica real de `fail` (verificada contra `fn_fail_job`, tester r1 #19-#21): `failed` = no reintentable (4xx definitivo,
handler ausente, `JobFatalError`); `dead` = agotó intentos. Ambos son terminales y solo salen por retry manual (job nuevo)
o por la retención de 30 d de `maintenance`.

### 2.4 Secretos

```
UI (admin de la org) ──PUT /api/crm/config/providers {category, provider, credentials}──► route (sesión, rol admin)
   └─ getServiceClient().rpc('fn_set_provider_secret', {org, category, provider, secret_json})
        └─ vault.create_secret(json, 'pc:{org}:{category}:{provider}') → secret_id ─► provider_configs.secret_id
Server (F3–F16) ── getProviderCredentials(orgId,'voice') ──► rpc fn_get_provider_secret (SECURITY DEFINER, solo service_role)
   └─ vault.decrypted_secrets WHERE id = secret_id → JSON → merge con fallback env
Browser ── select('*') de provider_configs ──► permiso denegado sobre la columna credentials; usa vista v_provider_configs_safe
```

---

## 3. Base de datos

Todas las migraciones se aplican con `apply_migration` del MCP (prohibido crear `.sql` en el repo). Idempotentes. Patrón RLS copiado de `calls` (verificado en `pg_policies`): rol `authenticated`, `organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = (select auth.uid()) AND om.is_active = true)`. Desde la ronda 2 (`crm_v4_f00_13`) las políticas de F0 usan `(select auth.uid())` (initplan, advisor `auth_rls_initplan`), no el literal `auth.uid()` de las políticas antiguas.

### 3.1 Migraciones exactas

> **Estado de aplicación — ronda 1 (2026-09-08, agente DB).** Todo lo de abajo se aplicó en producción con `apply_migration` (MCP). Los bloques SQL originales de este documento se conservan como diseño; la verdad es la migración real listada aquí (nombres en `supabase_migrations.schema_migrations`). Desviaciones obligadas por `tester-F00-r1.md` y por el schema real.
>
> | Bloque del doc | Migración real (APLICADA) | Desviaciones |
> |---|---|---|
> | M1 enums + M2 activities/messages/templates | `crm_v4_f00_01_reconciliacion_checks_columnas` | Unidas en una. Añadido `templates.preheader`, `conversations.last_inbound_at` (backfill 20.465 conversaciones desde `messages.direction='inbound'`) + trigger `trg_messages_set_last_inbound` (AFTER INSERT ON messages). `calls`: sin cambios (el código se adapta a los CHECK). |
> | M3 storage | `crm_v4_f00_02_storage_buckets_policies` | Bucket `crm-call-recordings` (private, 200 MB, MIME audio/*). Políticas SELECT/INSERT/UPDATE/DELETE para `authenticated` con `substring(name from '^org_([0-9]+)/')::integer IN (miembros activos)` (tester #22). Además 4 políticas equivalentes para `crm-documents` (antes sin ninguna) con el prefijo real de `documentService.ts:174` = `{orgId}/…` (sin `org_`). |
> | M4 outbound_jobs/crm_events + M7 provider_pricing | `crm_v4_f00_03_tablas_cola_eventos_consents_pricing_prefs` | `outbound_jobs` sin `priority/created_by/completed_at`; kinds = email\|whatsapp\|sms\|ai_call\|sequence_step\|automation\|transcribe\|analyze\|recording_fetch\|recording_cleanup\|campaign_batch\|crm_event\|maintenance (+ `noop` desde ronda 2, `crm_v4_f00_12`). Índice único **parcial** `(organization_id, dedupe_key) WHERE status IN ('queued','running')` (tester #5). `crm_events` sin `actor_user_id/occurred_at` (el actor va en `payload.changed_by`); `attempts int NOT NULL DEFAULT 0` y `last_error text` añadidos en ronda 2 (`crm_v4_f00_16`). Nuevas: `contact_consents` (UNIQUE org+customer+channel, RLS CRUD miembros), `provider_pricing` (+ `credits_per_unit`, `verified` default false; SELECT authenticated, escritura solo service_role), `user_comm_preferences` (RLS: fila propia; lectura admins = `is_super_admin` o `role_id IN (1,2)`). `stage_agents`, `voices`, `voice_agent_tool_runs` NO en F0 (F6). |
> | §3.2 seed pricing | `crm_v4_f00_04_seed_provider_pricing` | 29 filas (24 `verified=true`, con `source_url`). `verified=true` solo si el precio figura en docs-twilio-voice/messaging, docs-elevenlabs, docs-openai, docs-gemini o docs-resend; `realtime_2_1` y Meta CO/MX = `false` (tester #18). Añadidos `openai/gpt_transcribe` (0.0045/min) y `elevenlabs/tts_multilingual`. |
> | M5 RPCs | `crm_v4_f00_05_funciones_cola_eventos_consent` | Firmas finales en §13. `fn_complete_job`/`fn_fail_job` exigen `p_worker` y `status='running' AND locked_by=p_worker` (tester #6). `fn_fail_job`: backoff `60s·2^attempts` (máx 1 h) + jitter, `p_retry_after_seconds=-1` ⇒ `failed` (no reintentable), `attempts>=max_attempts` ⇒ `dead` (tester #19: `failed` sí existe). `fn_enqueue_job` devuelve el job vivo en conflicto, nunca uno done/dead. `fn_emit_crm_event` inserta en `crm_events` **y** encola `crm_event` con dedupe `crm_event:{id}` (tester #2). Triggers `trg_opp_stage_change_enqueue` (AFTER UPDATE OF stage_id WHEN distinct) y `trg_opp_created_enqueue` (AFTER INSERT) → `fn_emit_crm_event`. No se emite `opportunity.won/lost` desde trigger (lo hará el handler `crm_event` leyendo `status`). `fn_can_contact(p_org, p_customer, p_channel, p_purpose)` ejecutable por `authenticated`. Vista `v_outbound_jobs_failed` (`security_invoker`). |
> | M6 Vault | **NO APLICADA** (tester #1) | No se vacían `provider_configs.credentials` ni `channel_credentials.credentials`; no se crean `fn_set/get_provider_secret` ni columnas `secret_id`. El cifrado de credenciales se pospone: provider_configs → PR-05 (agente SEC, en server con service role), channel_credentials → F16. Sí se aplicó la parte de privilegios (fila siguiente). |
> | M6 §4 privilegios | `crm_v4_f00_06_privilegios_provider_configs_comm_settings` + `crm_v4_f00_10_fix_comm_settings_update_columnas` | `provider_configs`: REVOKE INSERT/UPDATE/DELETE a anon/authenticated + DROP de las políticas insert/update/delete; SELECT por columnas sin `credentials` (`has_column_privilege('authenticated','provider_configs','credentials','SELECT') = false`); vista `v_provider_configs_safe` (`has_credentials`). `comm_settings`: `comm_settings_select` → `TO authenticated` + membresía activa (`om.is_active = true` de `organization_members`, **no** `comm_settings.is_active`); `comm_settings_update` → solo admins (`is_super_admin` o `role_id IN (1,2)`, patrón de `organizationService.ts:199` role_id 2 = Admin de organización); UPDATE por columnas (nunca token/saldos/subaccount_sid); `twilio_subaccount_auth_token` oculto a `authenticated`. `channel_credentials`: **NO** se revoca SELECT (lo leen `chatChannelsService.ts:192-197,236-241` y `WhatsAppCredentialsCard` con anon) → pendiente F16; solo se retira `anon`. |
> | M8 pg_cron | `crm_v4_f00_09_pg_cron_jobs_inactivos` | Secretos creados en Vault: `crm_cron_secret` (= `CRON_SECRET` de `.env.local`) y `crm_app_url` (`https://app.goadmin.io`). `fn_crm_cron_post(p_path text, p_body jsonb DEFAULT '{}')` fail-closed (RAISE si faltan secretos; firma con `p_body` desde ronda 2, `crm_v4_f00_15`). Jobs 17/18/19 `crm-jobs-every-minute` (todos los kinds), `crm-campaigns-5min` (body `{"kinds":["campaign_batch"]}`), `crm-daily-maintenance` (body `{"kinds":["recording_cleanup","maintenance"]}`, espejo de `vercel.json`; `30 8 * * *` UTC = 03:30 Bogotá, tester #20) creados con **`active=false`** (vía `cron.alter_job`; `UPDATE cron.job` no está permitido al rol de migración). El orquestador los activa cuando `/api/crm/jobs/run` esté desplegado. |
> | M9 seed provider_configs | `crm_v4_f00_07_seed_provider_configs` | 12 filas/org (una por categoría; `analysis` → provider `google` como en `providerRegistry.ts:44`, no "gemini"); `calendar`/`esign`/`video`/`enrichment` → `none`, `is_active=false`. Backfill: 31 orgs con `comm_settings` → 372 filas. Trigger nuevo `trg_seed_provider_configs_on_org` AFTER INSERT ON organizations (hermano de `trg_create_default_org_structure`, no se modificó esa función; nunca bloquea la creación de la org). |
> | Realtime (nuevo) | `crm_v4_f00_08_realtime_publication` | Añadidas a `supabase_realtime`: calls, activities, call_transcripts, call_analyses, email_messages, opportunity_stage_history, outbound_jobs (conversations/messages ya estaban). Todas con RLS. |
> | Advisors (nuevo) | `crm_v4_f00_11_advisors_trigger_fn_grants_fk_indexes` | REVOKE EXECUTE de las 4 funciones trigger a anon/authenticated; índices FK en `user_comm_preferences`, `call_recordings.call_id`, `call_analyses.call_id/transcript_id`. |
>
> **Estado de aplicación — ronda 2 (2026-09-08, agente DB; correcciones de `TEST-DB-0-r1.md` y peticiones de `JOBS-0-r1.md`).** Todas aplicadas en producción, idempotentes y aditivas; sin cambios en código TS.
>
> | Petición | Migración real (APLICADA) | Contenido |
> |---|---|---|
> | P1 (F1 alto) + P2 (F2 medio) | `crm_v4_f00_12_kind_noop_can_contact_fail_closed` | `outbound_jobs_kind_check` recreado con la lista completa + `noop` (`DROP CONSTRAINT IF EXISTS` + `ADD`). `fn_can_contact` fail-closed: `IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN RETURN false` al inicio; `p_purpose` se ignora explícitamente en F0. Conserva SECDEF, `search_path=public` y grants (authenticated + service_role). |
> | P3 (F3 medio) | `crm_v4_f00_13_rls_initplan_select_auth_uid` | `ALTER POLICY … USING/WITH CHECK` reescribiendo `auth.uid()` → `(select auth.uid())` en las 21 políticas de F0: 13 en `public` (`outbound_jobs_select`, `crm_events_select`, `provider_configs_select`, `comm_settings_select/update`, `contact_consents_{select,insert,update,delete}`, `user_comm_preferences_{select,insert,update,delete}`) + 8 `crm_call_recordings_*`/`crm_documents_*` en `storage.objects`. Bloque `DO` idempotente (no re-envuelve). Advisor `auth_rls_initplan` en políticas F0: 21 → 0. |
> | P4 (F4 bajo) + P5 (riesgo #55) | `crm_v4_f00_14_vistas_solo_lectura_bucket_documents_limites` | `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON v_provider_configs_safe, v_outbound_jobs_failed FROM authenticated, anon` (queda solo SELECT a authenticated). Bucket `crm-documents`: `file_size_limit = 26214400` (25 MB) y `allowed_mime_types` de 28 tipos (pdf, png/jpeg/webp/gif, doc/docx, xls/xlsx, ppt/pptx, rtf, txt/csv/md, zip, audio mpeg/mp3/wav/x-wav/mp4/x-m4a/ogg/webm, video mp4/webm y `application/octet-stream`). **Desviación respecto a la lista del tester**: la UI (`DocumentUploader.tsx:160-166,231-237`, `<input type="file" multiple>` sin `accept`) no restringe tipos y `documentService.ts:180` sube con `file.type \|\| 'application/octet-stream'`; por eso se incluye `octet-stream` (archivos sin MIME detectado por el navegador; se sirven como descarga, no se renderizan) y se excluye contenido activo (`text/html`, `image/svg+xml`, JS). 0 objetos y 0 filas en `documents` en el momento del cambio. |
> | P6 (riesgo cron 19 / JOBS b) | `crm_v4_f00_15_cron_post_body_kinds` | `DROP FUNCTION fn_crm_cron_post(text)` + nueva `fn_crm_cron_post(p_path text DEFAULT '/api/crm/jobs/run', p_body jsonb DEFAULT '{}') RETURNS bigint` (mismo cuerpo; `body := COALESCE(p_body,'{}')`; EXECUTE solo service_role). `cron.alter_job` de los 3 jobs (siguen `active=false`): 17 sin body (todos los kinds), 18 `{"kinds":["campaign_batch"]}`, 19 `{"kinds":["recording_cleanup","maintenance"]}` — coincide con `VERCEL_SCHEDULE_KINDS` de `route.ts:27-30` y con la prioridad `body.kinds` de `route.ts:60-63`. |
> | P8 (JOBS c + pendiente `fn_release_job`) | `crm_v4_f00_16_fn_release_job_crm_events_diag` | `fn_release_job(p_job_id uuid, p_worker text) RETURNS boolean` (SECDEF, `search_path=public`, EXECUTE solo service_role): `running AND locked_by = p_worker` → `queued`, `attempts = GREATEST(attempts-1,0)`, `locked_at/locked_by = NULL`, `run_at = now()`; `false` si la guarda no se cumple. `crm_events.attempts int NOT NULL DEFAULT 0`, `crm_events.last_error text` (`ADD COLUMN IF NOT EXISTS`). |

> **Estado de aplicacion — ronda 3 (2026-09-08, agente DB; peticiones P10–P19 de `REG-0-r1.md`, `F3-r1.md`, `F4-r1.md`, `F9-r1.md`, `F16-r1.md`).** Todas aplicadas en produccion, idempotentes y aditivas; sin borrar datos ni tocar codigo TS.
>
> | Peticion | Migracion real (APLICADA) | Contenido y desviaciones |
> |---|---|---|
> | P10 (REG a) | `crm_v4_f00_17_usage_logs_cost_amount` | `ai_usage_logs.cost_amount numeric(12,6)` y `comm_usage_logs.cost_amount numeric(12,6)` (+ `COMMENT`). Los privilegios de ambas tablas son a nivel de tabla, asi que la columna hereda los grants. La migracion de valores desde `metadata->>'cost_amount'` se incluye pero es **no-op**: 0 de 111.408 filas en `ai_usage_logs` y 0 de 69 en `comm_usage_logs` tenian esa clave. |
> | P11 (REG b) | `crm_v4_f00_18_refund_ai_credits` + `crm_v4_f00_19_refund_ai_credits_tope_realista` | `refund_ai_credits(p_org_id integer, p_amount integer) RETURNS boolean`, plpgsql SECDEF `search_path=public`, `FOR UPDATE` sobre `ai_settings` (mismo estilo que `decrement_ai_credits`), EXECUTE **solo `service_role`**. **Desviacion sobre el tope del plan**: la 18 aplicaba un tope duro (`plans.ai_credits_max_rollover + ai_settings.purchased_credits`); medido en produccion, **27 de 38** organizaciones ya tienen saldo por encima de ese tope, asi que el reembolso habria sido no-op para el 71% y se habrian perdido creditos reales. La 19 lo corrige: el tope solo se aplica si el saldo actual todavia no lo supera. `p_amount<=0` → no-op `true`; org sin `ai_settings` → `false` (no `RAISE`, para no romper el camino de reembolso). |
> | P12 (REG d) | `crm_v4_f00_20_provider_pricing_valid_to` | `provider_pricing.valid_to date` (NULL = vigente) + CHECK `valid_to >= valid_from` + indice parcial `provider_pricing_vigente_idx (provider, sku, valid_from DESC) WHERE valid_to IS NULL`. `fn_unit_cost` anade `AND (valid_to IS NULL OR valid_to >= p_at)`; conserva `STABLE`, SECURITY INVOKER, `search_path` y ACL. Las 30 filas actuales tienen `valid_to = NULL`, asi que ningun precio cambia de resultado. |
> | P13 (F3) | `crm_v4_f00_21_comm_credits_fail_closed_y_seed_por_plan` + `crm_v4_f00_22_deduct_comm_credits_reembolso_acotado` | **La tabla `comm_credits` NO existe**; el saldo vive en `comm_settings` (`sms_remaining`/`whatsapp_remaining`/`voice_minutes_remaining`). Agujero real encontrado: `deduct_comm_credits` hacia `EXECUTE … INTO v_remaining` y, si la org no tenia fila, `v_remaining` quedaba `NULL`, que la funcion interpreta como “ilimitado” → `TRUE`. Habia **52 de 83 organizaciones sin fila** (la org 2 ya tenia 11 `comm_usage_logs` asi). Cuatro piezas: (1) `DEFAULT 0` en las tres columnas de saldo (`telephonySettingsService.ts:81` inserta sin ellas y dejaba `NULL`); (2) `fn_seed_comm_settings(p_org)` + backfill de las 52 orgs con el **cupo de su plan** (`plans.comm_sms_monthly`/`comm_whatsapp_monthly`/`comm_voice_minutes_monthly`, `COALESCE` a 0) — es el patron que ya seguian las 31 filas existentes (1000/1000/200 ultimate, 200/200/30 business, 50/50/0 pro), asi que ninguna org queda distinta de las de su plan y ninguna integracion viva se corta (org 2 = business → 200/200/30); las 8 orgs de plan `enterprise` quedan en 0/0/0 porque ese plan tiene los cupos a `NULL` y necesitan configuracion explicita; (3) `deduct_comm_credits` reescrita: fail-closed sin fila activa, `FOR UPDATE` real (antes habia carrera entre el `SELECT` y el `UPDATE`), `search_path=public` fijado (era mutable en una SECDEF con SQL dinamico) y canal validado — `NULL` en la columna sigue siendo “ilimitado”, pero ahora **solo si un administrador lo pone a proposito**; (4) trigger `trg_seed_comm_settings_on_org` AFTER INSERT ON `organizations` para que las orgs nuevas nazcan con su cupo. **La 22 corrige a la 21**: `campaignService.ts:111` devuelve los creditos no usados de una campana con `deduct_comm_credits(org,'whatsapp', -n)` y la 21 neutralizaba los importes negativos; se restaura el reembolso, acotado a `plans.comm_<canal>_monthly`. |
> | P14 (F3) | `crm_v4_f00_23_activities_call_id_unique` | `activities_call_id_uidx UNIQUE (call_id) WHERE call_id IS NOT NULL`. Comprobado antes: `count(*) = count(DISTINCT call_id) = 0` para `call_id IS NOT NULL` → sin duplicados. Se elimina `activities_call_id_idx` (mismas columnas y predicado, sin UNIQUE) para no duplicar escrituras ni disparar el advisor `duplicate_index`. |
> | P15 (F3/F4) | `crm_v4_f00_24_seed_pricing_gemini_3_8_audio_in` | Auditados contra el codigo **todos** los SKU en uso (`callCreditsService.ts:13,106,107`; `transcriptionService.ts:189,193,198`; `callAnalysisService.ts:459-460`; `whatsapp/costs.ts:28,38`; `campaignEvents.ts:55`; `aiDraftService.ts:113`): los 29 sembrados en `crm_v4_f00_04` los cubren todos, incluidos `gemini_3_8_flash_in`/`_out`. El unico que faltaba es el de audio: se anade `google/gemini_3_8_flash_audio_in` con **`verified=false`** porque `docs-gemini.md` deja el “Audio in” de gemini-3.8-flash **sin publicar** (“?”); se estima con la tarifa de audio-in de gemini-2.5-flash ($1.00/1M), que es la que hoy usa `transcriptionService.ts:189` como aproximacion. Re-verificar cuando Google publique el precio. Total: 30 filas, 24 verificadas. |
> | P16 (F16) | `crm_v4_f00_25_campaign_contacts_state_check` | `campaign_contacts_state_check` pasa de 5 a 11 valores: `pending, queued, sent, delivered, read, opened, clicked, replied, bounced, failed, skipped` (los 5 originales conservados). Es exactamente el tipo `ContactState` de `whatsapp/types.ts:255`. **No se anade `sending`**: no pertenece a `ContactState`, es un valor de `campaigns.status`. Los datos actuales (10 `sent` + 16 `NULL`) siguen siendo validos. |
> | P17 + P18 (F9) | `crm_v4_f00_26_realtime_notes_indices_timeline` | `notes` anadida a `supabase_realtime` (RLS activa, 4 politicas); era la unica de las 7 tablas a las que se suscribe `useTimeline.ts:140-147` que faltaba. Indices del camino de acceso del timeline que no existian: `tasks_org_related_created_idx (organization_id, related_to_type, related_to_id, created_at DESC, id DESC)`, `notes_org_related_created_idx` y `email_messages_org_related_created_idx` (`activities` y `calls` ya los tenian). |
> | P19 (advisors) | `crm_v4_f00_27_revoke_anon_credit_rpcs` + `crm_v4_f00_28_revoke_public_credit_rpcs` | `decrement_ai_credits` y `deduct_comm_credits` son SECDEF que mueven saldo con `p_org_id` arbitrario y eran ejecutables por `anon` (via PUBLIC). Revocado `anon`/`PUBLIC` y re-concedido explicitamente a `authenticated` + `service_role`. La 28 corrige a la 27: el primer `REVOKE … FROM anon` quito el grant explicito pero la ACL conservaba `=X/postgres` (EXECUTE a PUBLIC, el default de `CREATE FUNCTION`), asi que `anon` seguia pudiendo llamarlas. Advisor `anon_security_definer_function_executable`: 337 → 335; `function_search_path_mutable`: 440 → 439. **No** se revoca `authenticated` porque `src/app/api/ai-assistant/transcribe/route.ts:79` llama a `decrement_ai_credits` con el cliente de sesion (rol `authenticated`); queda pedido a REG/SEC. |
>
> **P18 — `fn_crm_timeline` NO se crea (decision, con medicion).** `EXPLAIN (ANALYZE, BUFFERS)` sobre la oportunidad con mas historial de la base (org 2, 20 actividades): `Index Scan using activities_org_related_occurred_idx` → **Execution Time 0,158 ms** (planning 0,995 ms); y `tasks` con el indice nuevo, **0,648 ms** y sin `Sort`. Volumenes reales: `messages` 106 filas, `activities` 26, `calls` 1, y `tasks`/`notes`/`email_messages`/`opportunity_stage_history` a 0. El coste del timeline no esta en SQL sino en el ida y vuelta HTTP; una RPC monolitica anadiria una segunda implementacion del cursor `(occurred_at, id)` y del dedupe por `activities.call_id/email_message_id/message_id/metadata.stage_history_id` que hoy vive en TS (`timeline/assemble.ts`), duplicando la logica sin ganancia medible. Recomendacion: mantener el diseno en TypeScript y reevaluar solo si alguna de las 8 fuentes supera ~10^5 filas por organizacion.

> **Estado de aplicacion — ronda 4 (2026-09-09, agente DB; bloqueantes de `TEST-F16-r1.md` #1 y `TEST-F9-r1.md` F9-01, mas el cierre del hallazgo H de la r3).** Todas aplicadas en produccion, idempotentes y aditivas; sin borrar datos ni tocar codigo TS.
>
> | Origen | Migracion real (APLICADA) | Contenido y decision |
> |---|---|---|
> | TEST-F16 #1 (CRITICO) | `crm_v4_f00_29_fix_customer_channel_identity_trigger` | **Ningun mensaje entrante de la Cloud API podia persistirse.** `fn_update_customer_channel_identity` (AFTER INSERT ON `messages`) escribia `identity_type = channels.type` (`whatsapp\|website\|instagram\|facebook`), valores que `customer_channel_identities_identity_type_check` NO admite (`widget_anon\|widget_identified\|whatsapp_phone\|instagram_user\|facebook_psid`), y ademas usaba `external_message_id` (un `wamid.*`) como **valor de identidad**. Al ser un trigger en la misma transaccion, el CHECK revertia el INSERT del mensaje entero → sin `last_inbound_at`, sin ventana de 24 h, sin opt-out ni atribucion. **Se corrige el TRIGGER, no el CHECK**: todo el codigo lector usa ya los valores del CHECK (`channelService.ts:188` filtra `whatsapp_phone`; `supabase/functions/channel-dispatch/index.ts:173` mapea `{facebook:facebook_psid, instagram:instagram_user, whatsapp:whatsapp_phone}`; `metaMessagingService.ts:31-34` el mismo mapeo; `whatsappCloudService.ts:633` y `whatsappQrService.ts:502` insertan `whatsapp_phone` a mano). Ampliar el CHECK habria creado identidades que ningun lector consulta y habria roto la resolucion de destinatario. Cambios: mapeo `channels.type → identity_type`; **nunca** `external_message_id`; valor por canal (whatsapp: `payload.phone\|wa_id\|whatsapp_id` o `metadata.phone\|wa_id`, normalizado a digitos igual que `normalizePhoneDigits`; instagram/facebook: `sender_id\|psid\|igsid`; website: `email` → `widget_identified`, si no `visitor_id\|session_id` → `widget_anon`); tipo de canal desconocido → no se inventa nada; **bloque `EXCEPTION WHEN OTHERS → RAISE WARNING`** para que un fallo de identidad no pueda volver a tumbar un mensaje; `SET search_path = public` (era SECDEF con search_path mutable). |
> | TEST-F9 F9-01 (CRITICO) | `crm_v4_f00_30_sync_status_from_stage_por_is_won_is_lost` | `fn_sync_status_from_stage` derivaba el status de `stages.probability` (100→won, 0→lost) y estampaba `closed_at`, pisando en un segundo UPDATE lo que escribe `opportunityStageService.ts` (que decide por `is_won/is_lost`). Nueva semantica: **la fuente de verdad es `is_won`/`is_lost`**. Etapa `is_won` → `status='won'` (solo si aun no lo es); etapa `is_lost` → `'lost'`; etapa NO terminal → **no se toca nada**, salvo que la oportunidad viniera cerrada *por la etapa anterior* (que si era terminal), en cuyo caso se reabre a `'open'`. La funcion **ya no escribe `closed_at`**: esa columna la gobierna `fn_opportunities_set_closed_at` (BEFORE UPDATE OF status), que respeta con `COALESCE` el `closed_at` que ya venga y lo limpia al reabrir. Etapa con `is_won` e `is_lost` a la vez → `WARNING` y no se toca. El UPDATE anidado solo toca `status`, asi que no re-dispara el trigger y deja de emitirse cuando no hace falta. |
> | TEST-F9 F9-01 (backfill) | `crm_v4_f00_31_backfill_stages_is_won_is_lost` | **14 filas** (7 `is_won` + 7 `is_lost`) en 5 organizaciones: org 2 (sus 3 pipelines), 120, 125, 130, 133. Heuristica **solo por nombre normalizado** (minusculas, sin tildes, trim): won `^(ganad[oa]\|won\|cerrad[oa] ?ganad[oa]\|closed[ _-]?won\|venta ganada)$`, lost `^(perdid[oa]\|lost\|cerrad[oa] ?perdid[oa]\|closed[ _-]?lost\|cancelad[oa]\|anulad[oa]\|descartad[oa])$`. **La probabilidad NO se usa como criterio y los datos reales explican por que**: de las 13 etapas con `probability=0`, solo 7 son de perdida por nombre; entre las otras 6 estan "Contacto Inicial" y "Reunion Agendada" de la org 2 (intermedias) y —sobre todo— la etapa **"Ganado" de la org 2 (pipeline `4462350e`) que tiene `probability=0`**: con el criterio de probabilidad se habria marcado como perdedora la etapa de cierre ganado. Y de las 10 etapas con `probability=100`, dos no se llaman "Ganado" ("Business Review 30d" org 134, "Contrato/pago" org 135) y ya tenian `is_won=true` a mano: por eso el backfill **nunca borra un flag existente**, solo rellena los que estan a `false`. Etapas ambiguas dejadas intactas a proposito: "Contacto Inicial" (pos 0) y "Reunion Agendada" (pos 1) del pipeline `4462350e` de la org 2, ambas con `probability=0` — eran justo las que el trigger antiguo convertia en perdidas. Resultado: **11 de 11 pipelines** tienen etapa `is_won`; 10 de 11 tienen `is_lost` (el pipeline de onboarding `04925e46` de la org 134 no tiene etapa de perdida, es correcto). `COMMENT` en ambas columnas dejando claro que `probability` es solo forecast. |
> | Coherencia del cierre (hallado al verificar) | `crm_v4_f00_32_fix_commission_payee_id_uuid` + `crm_v4_f00_33_fix_auto_journal_commission_memo_cast` | Al certificar `trg_create_commission_on_opportunity_won` aparecieron **dos errores de tipos latentes encadenados** que hacian fallar la transaccion **completa** del cambio de etapa al cerrar como ganada una oportunidad con comision: (1) `fn_create_commission_on_opportunity_won` insertaba `NEW.salesperson_id::text` en `commissions.payee_id`, que es **uuid** → `42804`; (2) ya corregido eso, `fn_auto_journal_commission` (AFTER INSERT ON `commissions`) construia el memo con `COALESCE(NEW.payee_name, NEW.payee_id, 'N/A')` (text + uuid) → `42804` en tiempo de plan, y se dispara siempre que la org tiene una `accounting_rules` activa de `source_type='commission'` (**las 83 la tienen**). Nunca habia saltado porque hoy **0 oportunidades** tienen `commission_type<>'none' + commission_rate>0 + salesperson_id`, y `commissions` no tiene ninguna fila con `source_type='opportunity'`. Corregidos ambos casts (nada mas de la logica cambia) y `search_path` fijado. Verificado en rollback: etapa `is_won` → `status='won'` + `closed_at` + 1 comision (50,00 = 5% de 1000) + 1 asiento contable; reabrir y volver a ganar **no duplica**; etapa no terminal → 0 comisiones. |
> | Hallazgo H de la r3 (seguridad) | `crm_v4_f00_34_revoke_authenticated_credit_rpcs` | `decrement_ai_credits` y `deduct_comm_credits` (SECDEF, `p_org_id` arbitrario, importes negativos) dejan de ser ejecutables por `authenticated`. Desbloqueado porque `ai-assistant/transcribe/route.ts:85` ya usa `getServiceClient()`. Verificados **los 10** llamantes del repo: todos con cliente service_role (`transcribe/route.ts:85`, `aiCreditsService.ts:214` —factory local con `SUPABASE_SERVICE_ROLE_KEY`—, `aiCostService.ts:82,141,212` via `resolveClient()`, `callCreditsService.ts:66` ← `voice/twiml/outbound/route.ts:84`, `campaignService.ts:71,111`, `outboundService.ts:186`, `twilioService.ts:152`, `conversationRelayHandler.ts:429`). ACL final de las tres RPC: `{postgres=X/postgres,service_role=X/postgres}`. |
> | Advisors (r4) | `crm_v4_f00_35_advisors_r4_trigger_functions` | `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` sobre las 4 funciones de trigger reescritas esta ronda (`fn_update_customer_channel_identity`, `fn_sync_status_from_stage`, `fn_create_commission_on_opportunity_won`, `fn_auto_journal_commission`) mas `fn_opportunities_set_closed_at`, y `search_path` fijo en esta ultima. **Los triggers no se ven afectados**: PostgreSQL comprueba `EXECUTE` sobre la funcion al *crear* el trigger, no al dispararlo (verificado en rollback: mensaje+identidad y cierre+comision siguen funcionando tras el REVOKE). Advisors: `anon_security_definer_function_executable` 335 → **332**, `authenticated_security_definer_function_executable` 336 → **333**, `function_search_path_mutable` 437 → **436**. Unico hallazgo de seguridad atribuible a F0 que queda: `fn_can_contact` ejecutable por `authenticated` (intencional). |
>
> **Estado inconsistente preexistente que NO se toca (para F9).** Dos oportunidades de la org 2 estan en una etapa terminal con `status='open'`: `d12db563…` en "Ganado" (`e5113e38`) y `f4ac603c…` en "Perdida" (`e393ba79`). Se crearon directamente en esa etapa (el trigger es AFTER UPDATE OF `stage_id`, no dispara en INSERT). No se corrigen por migracion porque cerrarlas estamparia `closed_at` y dispararia la comision **sin datos de cierre**, que es justo el defecto que esta ronda arregla: deben pasar por `changeStage` con `wonData`/`lossData`.

#### M1 — `202609_crm_v4_f00_enums_reconciliacion`

```sql
-- calls: los CHECKs actuales son correctos; se adapta el código (ver enums.ts). Solo se asegura updated_at.
ALTER TABLE call_recordings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_call_recordings_updated_at ON call_recordings;
CREATE TRIGGER set_call_recordings_updated_at BEFORE UPDATE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();          -- set_updated_at() existe (usada en activities/opportunities)

-- call_recordings.status ya es processing|ready|failed|deleted: se re-declara para fijarlo como contrato
ALTER TABLE call_recordings DROP CONSTRAINT IF EXISTS call_recordings_status_check;
ALTER TABLE call_recordings ADD CONSTRAINT call_recordings_status_check
  CHECK (status IN ('processing','ready','failed','deleted'));

-- call_analyses.sentiment + mixed
ALTER TABLE call_analyses DROP CONSTRAINT IF EXISTS call_analyses_sentiment_check;
ALTER TABLE call_analyses ADD CONSTRAINT call_analyses_sentiment_check
  CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','mixed'));

-- voice_agents.purpose_type + sell_product, book_meeting
ALTER TABLE voice_agents DROP CONSTRAINT IF EXISTS voice_agents_purpose_type_check;
ALTER TABLE voice_agents ADD CONSTRAINT voice_agents_purpose_type_check
  CHECK (purpose_type IN ('qualify_lead','confirm_demo','follow_up_proposal','reactivate_cold',
    'collect_payment','nps_survey','renewal_reminder','sell_product','book_meeting','custom'));

-- customers.timezone (do_not_call NO se añade: los opt-outs viven en contact_consents, F16/F6)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota';
```

#### M2 — `202609_crm_v4_f00_activities_messages_templates`

```sql
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS activities_call_id_idx ON activities(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_email_message_id_idx ON activities(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_message_id_idx ON activities(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_conversation_id_idx ON activities(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activities_org_related_occurred_idx ON activities(organization_id, related_type, related_id, occurred_at DESC);

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_activity_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_activity_type_check
  CHECK (activity_type IN ('call','email','whatsapp','sms','meeting','visit','note','system','ai_call','task'));

ALTER TABLE messages ADD COLUMN IF NOT EXISTS related_opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_related_opportunity ON messages(related_opportunity_id, created_at DESC)
  WHERE related_opportunity_id IS NOT NULL;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS blocks_json jsonb,
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'html',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_engine_check;
ALTER TABLE templates ADD CONSTRAINT templates_engine_check CHECK (engine IN ('blocks','html','react'));
CREATE INDEX IF NOT EXISTS templates_org_channel_idx ON templates(organization_id, channel, is_active);
```

#### M3 — `202609_crm_v4_f00_storage_call_recordings`

`crm-documents` no tiene políticas propias en `storage.objects` (verificado), así que se define el patrón aquí y F9 lo replica para documentos. Path obligatorio: `org_{organization_id}/{yyyy}/{mm}/{callId}.mp3`.

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crm-call-recordings','crm-call-recordings', false, 209715200,
        ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lectura: miembros activos de la org cuyo prefijo coincide. Escritura/borrado: solo service_role (sin política ⇒ denegado).
DROP POLICY IF EXISTS crm_call_recordings_select ON storage.objects;
CREATE POLICY crm_call_recordings_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-call-recordings'
  AND (storage.foldername(name))[1] ~ '^org_[0-9]+$'
  AND split_part((storage.foldername(name))[1], '_', 2)::integer IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid() AND om.is_active = true)
);
```

#### M4 — `202609_crm_v4_f00_outbound_jobs_crm_events`

```sql
CREATE TABLE IF NOT EXISTS outbound_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','whatsapp','sms','ai_call','sequence_step','automation',
    'transcribe','analyze','recording_cleanup','campaign_batch','crm_event','maintenance','noop')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  priority integer NOT NULL DEFAULT 100,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  result jsonb,
  locked_at timestamptz,
  locked_by text,
  dedupe_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_jobs_dedupe_key_uidx ON outbound_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbound_jobs_claim_idx ON outbound_jobs(kind, priority, run_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS outbound_jobs_running_idx ON outbound_jobs(locked_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS outbound_jobs_org_status_idx ON outbound_jobs(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_jobs_done_cleanup_idx ON outbound_jobs(completed_at) WHERE status = 'done';
DROP TRIGGER IF EXISTS set_outbound_jobs_updated_at ON outbound_jobs;
CREATE TRIGGER set_outbound_jobs_updated_at BEFORE UPDATE ON outbound_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,                 -- opportunity.stage_changed | opportunity.won | opportunity.lost | opportunity.created | call.completed | email.replied | whatsapp.inbound | task.completed | meeting.booked
  entity_type text NOT NULL,                -- opportunity | call | email_message | message | task | customer
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_events_pending_idx ON crm_events(occurred_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS crm_events_org_entity_idx ON crm_events(organization_id, entity_type, entity_id, occurred_at DESC);

ALTER TABLE outbound_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;
-- Solo lectura para miembros (observabilidad en UI). Escrituras exclusivamente vía service_role / RPC.
DROP POLICY IF EXISTS outbound_jobs_select ON outbound_jobs;
CREATE POLICY outbound_jobs_select ON outbound_jobs FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS crm_events_select ON crm_events;
CREATE POLICY crm_events_select ON crm_events FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true));

-- Productor real de stage_change (convive con trg_opp_stage_history / trg_sync_status_from_stage existentes)
CREATE OR REPLACE FUNCTION fn_opp_stage_change_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO crm_events (organization_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.organization_id, 'opportunity.stage_changed', 'opportunity', NEW.id,
            jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id,
                               'pipeline_id', NEW.pipeline_id, 'customer_id', NEW.customer_id,
                               'amount', NEW.amount, 'status', NEW.status),
            auth.uid());
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won','lost') THEN
    INSERT INTO crm_events (organization_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.organization_id, 'opportunity.' || NEW.status, 'opportunity', NEW.id,
            jsonb_build_object('stage_id', NEW.stage_id, 'amount', NEW.amount, 'loss_reason', NEW.loss_reason), auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_opp_stage_change_enqueue ON opportunities;
CREATE TRIGGER trg_opp_stage_change_enqueue AFTER UPDATE OF stage_id, status ON opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_opp_stage_change_enqueue();
```

#### M5 — `202609_crm_v4_f00_job_rpcs`

```sql
CREATE OR REPLACE FUNCTION fn_claim_jobs(p_kinds text[] DEFAULT NULL, p_limit integer DEFAULT 25, p_worker text DEFAULT NULL)
RETURNS SETOF outbound_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1) recuperar jobs huérfanos (worker muerto)
  UPDATE outbound_jobs SET status = 'queued', locked_at = NULL, locked_by = NULL,
         last_error = COALESCE(last_error,'') || ' [reclaimed]'
   WHERE status = 'running' AND locked_at < now() - interval '10 minutes';
  -- 2) reclamar
  RETURN QUERY
  UPDATE outbound_jobs j SET status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   WHERE j.id IN (
     SELECT id FROM outbound_jobs
      WHERE status = 'queued' AND run_at <= now() AND (p_kinds IS NULL OR kind = ANY (p_kinds))
      ORDER BY priority ASC, run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(p_limit, 200)))
  RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION fn_complete_job(p_job_id uuid, p_result jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbound_jobs SET status = 'done', result = p_result, completed_at = now(), locked_at = NULL, locked_by = NULL
   WHERE id = p_job_id AND status = 'running';
$$;

CREATE OR REPLACE FUNCTION fn_fail_job(p_job_id uuid, p_error text, p_retryable boolean DEFAULT true, p_retry_after_seconds integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts int; v_max int; v_delay interval; v_status text;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max FROM outbound_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF NOT p_retryable OR v_attempts >= v_max THEN
    v_status := 'dead';
    UPDATE outbound_jobs SET status = 'dead', last_error = left(p_error, 4000), locked_at = NULL, locked_by = NULL, completed_at = now() WHERE id = p_job_id;
  ELSE
    v_status := 'queued';
    -- backoff exponencial: 1,2,4,8,16,32 min (tope 60) + jitter 0-30 s; o el retraso explícito del handler (p. ej. 24 h por error Meta 131049)
    v_delay := COALESCE(make_interval(secs => p_retry_after_seconds),
                        make_interval(mins => LEAST(power(2, v_attempts - 1)::int, 60)) + make_interval(secs => floor(random()*30)));
    UPDATE outbound_jobs SET status = 'queued', run_at = now() + v_delay, last_error = left(p_error, 4000), locked_at = NULL, locked_by = NULL WHERE id = p_job_id;
  END IF;
  RETURN v_status;
END $$;

CREATE OR REPLACE FUNCTION fn_enqueue_job(p_org integer, p_kind text, p_payload jsonb, p_run_at timestamptz DEFAULT now(),
  p_dedupe_key text DEFAULT NULL, p_priority integer DEFAULT 100, p_max_attempts integer DEFAULT 5)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO outbound_jobs (organization_id, kind, payload, run_at, dedupe_key, priority, max_attempts)
  VALUES (p_org, p_kind, p_payload, p_run_at, p_dedupe_key, p_priority, p_max_attempts)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Las RPC de cola NO se exponen a usuarios: solo service_role (el runner) las invoca.
REVOKE ALL ON FUNCTION fn_claim_jobs(text[], integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_complete_job(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_fail_job(uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_enqueue_job(integer, text, jsonb, timestamptz, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_claim_jobs(text[], integer, text), fn_complete_job(uuid, jsonb),
  fn_fail_job(uuid, text, boolean, integer), fn_enqueue_job(integer, text, jsonb, timestamptz, text, integer, integer) TO service_role;

-- Vista de observabilidad (respeta RLS con security_invoker)
CREATE OR REPLACE VIEW v_outbound_jobs_failed WITH (security_invoker = true) AS
  SELECT id, organization_id, kind, status, attempts, max_attempts, last_error, run_at, locked_at, created_at, completed_at
    FROM outbound_jobs WHERE status IN ('failed','dead') OR (status = 'queued' AND attempts > 0);
```

#### M6 — `202609_crm_v4_f00_vault_secrets`

```sql
-- 1) columnas de referencia a Vault
ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS secret_id uuid;               -- vault.secrets.id (sin FK cross-schema)
ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS credential_hint text;         -- p. ej. 'SK…a1b2' para la UI
ALTER TABLE comm_settings ADD COLUMN IF NOT EXISTS twilio_subaccount_token_secret_id uuid;
ALTER TABLE channel_credentials ADD COLUMN IF NOT EXISTS secret_id uuid;

-- 2) setter/getter SECURITY DEFINER, ejecutables solo por service_role
CREATE OR REPLACE FUNCTION fn_set_provider_secret(p_org integer, p_category text, p_provider text, p_secret jsonb, p_hint text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_name text := format('pc:%s:%s:%s', p_org, p_category, p_provider); v_id uuid;
BEGIN
  SELECT secret_id INTO v_id FROM provider_configs WHERE organization_id = p_org AND category = p_category AND provider = p_provider;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_secret::text, v_name, 'provider_configs credentials');
  ELSE
    PERFORM vault.update_secret(v_id, p_secret::text, v_name);
  END IF;
  INSERT INTO provider_configs (organization_id, category, provider, credentials, secret_id, credential_hint)
  VALUES (p_org, p_category, p_provider, '{}'::jsonb, v_id, p_hint)
  ON CONFLICT (organization_id, category, provider) DO UPDATE
    SET secret_id = EXCLUDED.secret_id, credentials = '{}'::jsonb, credential_hint = EXCLUDED.credential_hint, updated_at = now();
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION fn_get_provider_secret(p_org integer, p_category text, p_provider text DEFAULT NULL)
RETURNS TABLE (provider text, settings jsonb, priority integer, credentials jsonb)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, vault AS $$
  SELECT pc.provider, pc.settings, pc.priority,
         COALESCE(ds.decrypted_secret::jsonb, '{}'::jsonb) AS credentials
    FROM provider_configs pc
    LEFT JOIN vault.decrypted_secrets ds ON ds.id = pc.secret_id
   WHERE pc.organization_id = p_org AND pc.category = p_category AND pc.is_active = true
     AND (p_provider IS NULL OR pc.provider = p_provider)
   ORDER BY pc.priority ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_get_vault_secret_by_name(p_name text)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_set_provider_secret(integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_get_provider_secret(integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_get_vault_secret_by_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_set_provider_secret(integer, text, text, jsonb, text), fn_get_provider_secret(integer, text, text),
  fn_get_vault_secret_by_name(text) TO service_role;

-- 3) migrar lo que hoy está en claro (0 tokens comm_settings, 1 fila channel_credentials, 0 provider_configs) y vaciar
DO $$ DECLARE r record; v_id uuid; BEGIN
  FOR r IN SELECT id, organization_id, twilio_subaccount_sid, twilio_subaccount_auth_token FROM comm_settings
            WHERE twilio_subaccount_auth_token IS NOT NULL LOOP
    v_id := vault.create_secret(r.twilio_subaccount_auth_token, format('twilio_sub:%s', r.organization_id), 'twilio subaccount auth token');
    UPDATE comm_settings SET twilio_subaccount_token_secret_id = v_id, twilio_subaccount_auth_token = NULL WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT cc.id, cc.channel_id, cc.credentials, c.organization_id FROM channel_credentials cc JOIN channels c ON c.id = cc.channel_id
            WHERE cc.secret_id IS NULL AND cc.credentials IS NOT NULL AND cc.credentials::text <> '{}' LOOP
    v_id := vault.create_secret(r.credentials::text, format('chan:%s:%s', r.organization_id, r.channel_id), 'channel credentials');
    UPDATE channel_credentials SET secret_id = v_id, credentials = '{}'::jsonb WHERE id = r.id;
  END LOOP;
END $$;

-- 4) ocultar columnas sensibles a anon/authenticated (privilegios de columna + RLS existente)
REVOKE SELECT ON provider_configs FROM anon, authenticated;
GRANT SELECT (id, organization_id, category, provider, settings, is_active, priority, credential_hint, created_at, updated_at) ON provider_configs TO authenticated;
REVOKE SELECT ON comm_settings FROM anon, authenticated;
GRANT SELECT (id, organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining, twilio_subaccount_sid, phone_number,
  whatsapp_number, voice_agent_enabled, voice_agent_config, is_active, credits_reset_at, created_at, updated_at, voice_twiml_app_sid,
  voice_recording_enabled, voice_recording_retention_days, voice_consent_message, voice_caller_id, voice_ring_timeout_seconds,
  voice_max_concurrent_calls) ON comm_settings TO authenticated;
REVOKE SELECT ON channel_credentials FROM anon, authenticated;
GRANT SELECT (id, channel_id, provider, is_valid, connection_method, created_at, updated_at) ON channel_credentials TO authenticated;

CREATE OR REPLACE VIEW v_provider_configs_safe WITH (security_invoker = true) AS
  SELECT id, organization_id, category, provider, settings, is_active, priority, credential_hint,
         (secret_id IS NOT NULL) AS has_credentials, created_at, updated_at FROM provider_configs;
GRANT SELECT ON v_provider_configs_safe TO authenticated;
```

> `comm_settings_select` es hoy `FOR SELECT TO public` sin `is_active`: se recrea con el patrón de `calls` (`TO authenticated`, `om.is_active = true`) dentro de M6 (`DROP POLICY IF EXISTS comm_settings_select …; CREATE POLICY …`). Todo código server que necesite el token de subcuenta usa `getTwilioAccountForOrg(orgId)` (§4.2), nunca la columna.

#### M7 — `202609_crm_v4_f00_provider_pricing`

```sql
CREATE TABLE IF NOT EXISTS provider_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,          -- twilio | elevenlabs | openai | google | resend | meta
  sku text NOT NULL,               -- p. ej. voice_out_co_mobile_min
  unit text NOT NULL CHECK (unit IN ('minute','message','char_1k','hour','token_1m_in','token_1m_out','month','call','email_1k')),
  unit_cost_usd numeric(12,6) NOT NULL CHECK (unit_cost_usd >= 0),
  currency text NOT NULL DEFAULT 'USD',
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  verified boolean NOT NULL DEFAULT true,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, sku, valid_from)
);
ALTER TABLE provider_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_pricing_select ON provider_pricing;
CREATE POLICY provider_pricing_select ON provider_pricing FOR SELECT TO authenticated USING (true);  -- catálogo global, sin org

CREATE OR REPLACE FUNCTION fn_unit_cost(p_provider text, p_sku text, p_at date DEFAULT current_date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT unit_cost_usd FROM provider_pricing
   WHERE provider = p_provider AND sku = p_sku AND valid_from <= p_at AND (valid_to IS NULL OR valid_to >= p_at)
   ORDER BY valid_from DESC LIMIT 1;
$$;
```

#### M8 — `202609_crm_v4_f00_pg_cron_jobs`

Prerrequisito manual (una vez, desde SQL editor con rol `postgres`): `SELECT vault.create_secret('<CRON_SECRET>', 'crm_cron_secret', 'Bearer para /api/crm/jobs/run');` y `SELECT vault.create_secret('https://app.goadmin.io', 'crm_app_url', 'origin público');` (mismo valor que `CRON_SECRET` y `NEXT_PUBLIC_APP_URL` en Vercel). `app.settings.cron_secret` no está definido (verificado `current_setting(...,true)` = NULL) y Vault es preferible a un `ALTER DATABASE … SET`.

```sql
CREATE OR REPLACE FUNCTION fn_crm_cron_post(p_kinds text[] DEFAULT NULL, p_path text DEFAULT '/api/crm/jobs/run')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, net AS $$
DECLARE v_secret text; v_url text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'crm_cron_secret';
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'crm_app_url';
  IF v_secret IS NULL OR v_url IS NULL THEN RAISE EXCEPTION 'crm_cron_secret / crm_app_url ausentes en vault'; END IF;
  SELECT net.http_post(
    url := v_url || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json', 'X-Cron-Source', 'pg_cron'),
    body := jsonb_build_object('kinds', to_jsonb(p_kinds), 'source', 'pg_cron'),
    timeout_milliseconds := 55000) INTO v_req;
  RETURN v_req;
END $$;
REVOKE ALL ON FUNCTION fn_crm_cron_post(text[], text) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('crm-jobs-every-minute','crm-campaigns-5min','crm-daily-maintenance');
SELECT cron.schedule('crm-jobs-every-minute', '* * * * *',
  $$SELECT fn_crm_cron_post(ARRAY['email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze','crm_event','noop'])$$);
SELECT cron.schedule('crm-campaigns-5min', '*/5 * * * *', $$SELECT fn_crm_cron_post(ARRAY['campaign_batch'])$$);
SELECT cron.schedule('crm-daily-maintenance', '30 3 * * *', $$SELECT fn_crm_cron_post(ARRAY['recording_cleanup','maintenance'])$$);
-- El job 'maintenance' (handler en F0) hace: DELETE outbound_jobs done > 30 d; crm_events processed > 30 d; resync de jobs 'running' huérfanos.
```

#### M9 — `202609_crm_v4_f00_seed_provider_configs`

```sql
CREATE OR REPLACE FUNCTION fn_seed_provider_configs(p_org integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
BEGIN
  INSERT INTO provider_configs (organization_id, category, provider, credentials, settings, is_active, priority) VALUES
    (p_org,'voice','twilio','{}','{"use_master_account":true,"recording_channels":"dual"}',true,10),
    (p_org,'stt','elevenlabs','{}','{"model_id":"scribe_v2","language_code":"spa","diarize":true}',true,10),
    (p_org,'stt','google','{}','{"model":"gemini-2.5-flash"}',true,20),
    (p_org,'tts','elevenlabs','{}','{"model":"eleven_flash_v2_5"}',true,10),
    (p_org,'llm','openai','{}','{"conversation_model":"gpt-5.6-terra","cheap_model":"gpt-5.6-luna","monthly_budget_usd":50}',true,10),
    (p_org,'llm','google','{}','{"model":"gemini-3.8-flash"}',true,20),
    (p_org,'analysis','google','{}','{"model":"gemini-2.5-flash"}',true,10),
    (p_org,'email','resend','{}','{"tracking_marketing_only":true}',true,10),
    (p_org,'whatsapp','meta','{}','{}',true,10),
    (p_org,'sms','twilio','{}','{"advanced_opt_out":true}',true,10),
    (p_org,'calendar','internal','{}','{}',true,10),
    (p_org,'esign','none','{}','{}',false,100),
    (p_org,'video','none','{}','{}',false,100),
    (p_org,'enrichment','none','{}','{}',false,100)
  ON CONFLICT (organization_id, category, provider) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION fn_seed_provider_configs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_seed_provider_configs(integer) TO service_role;
-- Backfill: orgs que ya tienen comm_settings (31). Las demás se siembran de forma perezosa en el primer GET de /api/crm/config/providers.
SELECT fn_seed_provider_configs(organization_id) FROM comm_settings;
```

### 3.2 Seeds

`provider_pricing` (valores de D8, verificados sep-2026 salvo los marcados):

```sql
INSERT INTO provider_pricing (provider, sku, unit, unit_cost_usd, verified, notes) VALUES
 ('twilio','voice_out_co_mobile','minute',0.0377,true,'Colombia móvil saliente'),
 ('twilio','voice_out_co_landline','minute',0.0700,true,'Colombia fijo saliente'),
 ('twilio','voice_in_local_co','minute',0.0945,true,'entrante número local CO'),
 ('twilio','voice_sdk_client','minute',0.0040,true,'Voice JS SDK por minuto'),
 ('twilio','recording','minute',0.0025,true,'grabación'),
 ('twilio','recording_storage','minute',0.0005,true,'almacenamiento por minuto/mes'),
 ('twilio','conversation_relay','minute',0.0700,true,'ConversationRelay'),
 ('twilio','phone_number_local_co','month',14.0000,true,'número local CO'),
 ('twilio','sms_out_co','message',0.0592,true,'SMS Colombia por segmento'),
 ('twilio','whatsapp_fee','message',0.0050,true,'fee Twilio por mensaje WA'),
 ('twilio','amd','call',0.0075,true,'Answering Machine Detection'),
 ('elevenlabs','scribe','hour',0.2200,true,'Scribe v2 STT'),
 ('elevenlabs','tts_flash','char_1k',0.0500,true,'TTS flash v2.5'),
 ('elevenlabs','agents','minute',0.0800,true,'ElevenAgents'),
 ('google','gemini_2_5_flash_audio_in','token_1m_in',1.0000,true,'audio nativo'),
 ('google','gemini_3_8_flash_in','token_1m_in',0.7500,true,'promo'),
 ('google','gemini_3_8_flash_out','token_1m_out',3.7500,true,'promo'),
 ('openai','gpt_5_6_luna_in','token_1m_in',0.2000,true,NULL),
 ('openai','gpt_5_6_luna_out','token_1m_out',1.2000,true,NULL),
 ('openai','gpt_5_6_terra_in','token_1m_in',2.0000,true,NULL),
 ('openai','gpt_5_6_terra_out','token_1m_out',12.0000,true,NULL),
 ('openai','realtime_2_1','minute',0.1000,false,'estimado in+out'),
 ('resend','pro_50k','email_1k',0.4000,true,'Resend Pro $20/50k'),
 ('meta','wa_marketing_co','message',0.0125,false,'terceros, no verificado'),
 ('meta','wa_utility_co','message',0.0008,false,'terceros, no verificado')
ON CONFLICT (provider, sku, valid_from) DO UPDATE SET unit_cost_usd = EXCLUDED.unit_cost_usd, verified = EXCLUDED.verified, notes = EXCLUDED.notes;
```

### 3.3 Verificación post-migración

```sql
-- CHECKs nuevos
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN
 ('activities_activity_type_check','call_analyses_sentiment_check','voice_agents_purpose_type_check','templates_engine_check');
-- Esperado: 4 filas; activities incluye 'ai_call' y 'task'; sentiment incluye 'mixed'; purpose incluye 'book_meeting'
SELECT column_name FROM information_schema.columns WHERE table_name='call_recordings' AND column_name='updated_at';          -- 1 fila
SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='timezone';                  -- 1 fila
SELECT column_name FROM information_schema.columns WHERE table_name='activities' AND column_name IN ('call_id','email_message_id','message_id','conversation_id'); -- 4
SELECT column_name FROM information_schema.columns WHERE table_name='messages' AND column_name='related_opportunity_id';   -- 1
SELECT column_name FROM information_schema.columns WHERE table_name='templates' AND column_name IN ('blocks_json','engine','version'); -- 3
SELECT id, public FROM storage.buckets WHERE id='crm-call-recordings';                                                     -- 1 fila, false
SELECT policyname FROM pg_policies WHERE tablename='objects' AND policyname='crm_call_recordings_select';                  -- 1
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('outbound_jobs','crm_events','provider_pricing');           -- 3 filas, true
SELECT tgname FROM pg_trigger WHERE tgname='trg_opp_stage_change_enqueue';                                                 -- 1
SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('fn_claim_jobs','fn_complete_job','fn_fail_job','fn_enqueue_job',
  'fn_set_provider_secret','fn_get_provider_secret','fn_seed_provider_configs','fn_crm_cron_post');                        -- 8 filas, todas true
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'crm-%';                                                         -- 3 filas
SELECT count(*) FROM provider_pricing;                                                                                     -- 25
SELECT count(DISTINCT organization_id) FROM provider_configs;                                                              -- ≥ 31
SELECT has_column_privilege('authenticated','provider_configs','credentials','SELECT');                                    -- false
SELECT has_column_privilege('authenticated','comm_settings','twilio_subaccount_auth_token','SELECT');                      -- false
SELECT count(*) FROM vault.secrets WHERE name IN ('crm_cron_secret','crm_app_url');                                        -- 2 (tras el paso manual)
-- Prueba funcional de la cola (con service_role):
SELECT fn_enqueue_job(7,'noop','{"hello":1}',now(),'test:noop:1');  SELECT count(*) FROM fn_claim_jobs(ARRAY['noop'],10,'manual'); -- 1
```

**Resultado real tras la ronda 1 (2026-09-08):** CHECKs: 5 filas con los valores esperados (`ai_call`/`task`, `mixed`, `sell_product`/`book_meeting`, `blocks|html|react`). Columnas: 12/12 presentes (incl. `templates.preheader`, `conversations.last_inbound_at`). Bucket `crm-call-recordings` `public=false`; 4 políticas `crm_call_recordings_*` + 4 `crm_documents_*`. RLS activa en `outbound_jobs`, `crm_events`, `provider_pricing`, `contact_consents`, `user_comm_preferences`. Triggers: 5 (`trg_opp_stage_change_enqueue`, `trg_opp_created_enqueue`, `trg_messages_set_last_inbound`, `set_call_recordings_updated_at`, `trg_seed_provider_configs_on_org`). Funciones SECURITY DEFINER: 8 (`fn_unit_cost` es INVOKER a propósito). `cron.job`: 3 filas `crm-%`, `active=false`. `provider_pricing`: 29 (24 verified). `provider_configs`: 372 filas / 31 orgs. `has_column_privilege('authenticated','provider_configs','credentials','SELECT')=false`; `…('comm_settings','twilio_subaccount_auth_token','SELECT')=false`; `has_table_privilege('authenticated','comm_settings','UPDATE')=false` y `has_column_privilege(...,'voice_recording_enabled','UPDATE')=true`. `vault.secrets`: 2. Prueba funcional (org 105, kind `maintenance`, filas de prueba borradas después): dedupe devuelve el mismo id; `fn_claim_jobs` → 1 fila, `attempts=1`; `fn_fail_job` con worker incorrecto → `ignored`; correcto → `queued` con `run_at ≈ +120 s`; segundo fallo con `max_attempts=2` → `dead`; re-encolar con la misma `dedupe_key` tras `dead` → id nuevo; `fn_complete_job` con worker incorrecto → `false`, correcto → `true`. `fn_can_contact` con cliente inexistente → `false`. `fn_unit_cost('twilio','voice_out_co_mobile')` = 0.0377. **Nota**: el kind `noop` del ejemplo no existe en el CHECK final; usar `maintenance` para pruebas.

### 3.4 Impacto en tablas existentes

- `automations` (legacy, 1 fila): dejar de usar; F8 migra la fila a `automation_rules` y elimina la tabla.
- `comm_settings.twilio_subaccount_auth_token`: queda NULL y oculta; se mantiene la columna hasta F3 para no romper tipos generados, luego `DROP COLUMN`.
- `provider_configs.credentials`: siempre `{}`; la verdad está en Vault. Se mantiene por compatibilidad con `providerRegistry.ts` hasta el PR-05.
- `channel_credentials.credentials`: `{}` + `secret_id`; F16 adapta `chatChannelsService` y la Edge Function `channel-dispatch` (que corre con service role y llamará `fn_get_channel_secret` que define F16).
- `notification_templates`: no cambia; `templates` pasa a ser el único modelo de plantillas CRM (F7).
- `tasks`: no cambia; el código debe usar `related_to_id/related_to_type` y `status` del CHECK.
- Se deja de leer `customers.do_not_call`/`do_not_call_list` (nunca existieron).

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| GET/POST | `/api/crm/jobs/run` (real r2) | cron: `Authorization: Bearer CRON_SECRET` o `x-cron-secret` (fail-closed, `verifyCronSecret`) | POST `{kinds?: JobKind[], limit?: ≤200, worker?: ≤100 chars}`; GET `?kind=a,b&limit=`; header `x-vercel-cron-schedule` | `{success, kinds: JobKind[]|'all', worker, claimed, done, skipped, retried, failed, dead, released, releasedWithoutRpc?, ms, byKind: Record<JobKind,{claimed,done,skipped,retried,failed,dead}>, scheduled?: {maintenance?: {ok, ms, result|error}, recording_cleanup?: {enqueued, orgs, reason?}}}` | 401 sin/mal secreto; **400 `{error:'kinds inválidos', invalid[], valid[]}`** si algún kind no existe; 200 siempre que corra | Sí: SKIP LOCKED + `dedupe_key`; llamadas concurrentes no duplican trabajo |
| GET | `/api/crm/jobs` (real r2) | sesión (`getServerOrgContext(request)`: header `X-Organization-Id`/cookie) + rol **admin de la org o Manager (role_id 5)** | `?status=&kind=&page=&pageSize=` (≤200) | `{success, items: JobListItem[], total, page, pageSize, stats:{byStatus,byKind,queuedOverdue}, recentFailed[≤50], canRetry}`; `payload_preview` **redactado** (solo `*_id`, `kind`, `campaign_id`, `event_type`, `entity_type`, `reason`, `resync`, `scheduled_for`, `retried_from`; ≤500 chars) | 401/400 org/403 rol | n/a |
| POST | `/api/crm/jobs/[id]/retry` (real r2) | sesión + admin de la org (`isOrgAdminContext`) | – | `{success, jobId, status:'queued'}` | 400 id; 403; 404 si no es de la org; 409 si no está en `dead|failed` | Sí: reutiliza el `dedupe_key` original (o `job:{id}:retry:{attempts}`) |
| GET | `/api/crm/config/providers` (NUEVO) | sesión | `?category=` | `{items: ProviderConfigSafe[]}` (siembra perezosa si 0 filas) | 401/403 | n/a |
| PUT | `/api/crm/config/providers` (NUEVO) | sesión, `roleName in ('admin','owner') or isSuperAdmin` | `{category, provider, settings?, credentials?: Record<string,string>, is_active?, priority?}` | `{item: ProviderConfigSafe}` (nunca devuelve credentials) | 400 zod; 403 rol; 422 provider no soportado en la categoría | PUT idempotente por (org,category,provider) |
| POST | `/api/crm/config/providers/test` (NUEVO) | sesión admin | `{category, provider}` | `{ok, latencyMs, detail}` | 502 si el proveedor responde error (detalle saneado) | n/a; rate limit 5/min/org |
| GET | `/api/crm/config/credits` (NUEVO) | sesión | – | `{ai:{credits_remaining, monthly_budget_usd, spent_month_usd}, comm:{sms_remaining, whatsapp_remaining, voice_minutes_remaining}, pricing: ProviderPricing[]}` | 401 | n/a |
| POST | `/api/integrations/twilio/verify/{send,check}` (modificar) | sesión + rate limit 3/10 min por user y por `to` | igual | igual | 401, 429 | – |
| * | `/api/ai-assistant/*`, `/api/chat/ai/*`, `/api/integrations/twilio/send-*`, `/api/integrations/whatsapp/{send,mark-read,validate,qr/*}`, `/api/integrations/sendgrid/send`, `/api/notifications/process` (modificar) | sesión (`getServerOrgContext`) | se ignora `organizationId` del body; para `channel_id`/`connection_id` se verifica `organization_id = ctx.organizationId` | igual | 401/403/404 | – |
| POST | `/api/crm/followup/run` | **eliminar** (junto con `followupEngineService`) | | | | |
| POST | `/api/voice/*`, `/api/integrations/twilio/*` webhooks (modificar) | firma Twilio fail-closed vía `verifyTwilioWebhook` | form-urlencoded | TwiML/204 | 403 firma; 200 vacío si org no resuelta | – |
| POST | `/api/integrations/whatsapp/webhook` (modificar) | `X-Hub-Signature-256` fail-closed por canal | JSON raw | 200 | 403 | provider ids |
| POST | `/api/email/webhook` (ya svix) | sin cambios de contrato; 401 si falta `RESEND_WEBHOOK_SECRET` (hoy lanza 500) | | | | |

**Estado real ronda 1 (REG) — contratos implementados de `config/*`:**

- `GET /api/crm/config/providers?category=` → `{ success, items: ProviderConfigSafe[], can_edit }`. `ProviderConfigSafe = { id?, category, provider, settings, is_active, priority, configured, platform_available, credential_keys: string[], updated_at }`. `configured` = la org tiene credenciales propias reales (sin placeholders `your-…`); `platform_available` = existe fallback env válido; `credential_keys` = nombres sin valores. Si la org no tiene filas llama `fn_seed_provider_configs(p_org)` y relee; si aún así faltan categorías devuelve filas virtuales del catálogo (`src/lib/crm/providerCatalog.ts`). Nunca devuelve `credentials`.
- `PUT /api/crm/config/providers` (admin: `isOrgAdmin` de `src/lib/utils/rbac.ts`) body zod `{ category, provider, settings?, credentials?: Record<string, string|null>, is_active?, priority? }` → `{ success, item }`. Valida `provider ∈ SUPPORTED_PROVIDERS[category]` y claves ∈ `CREDENTIAL_FIELDS[provider]` (422). Credenciales: merge con las existentes; `null`/vacío/placeholder borra la clave. Upsert `ON CONFLICT (organization_id, category, provider)` con service role. Vault (M6) no está aplicado: el valor se guarda en `provider_configs.credentials` (columna sin SELECT para `authenticated`).
- `POST /api/crm/config/providers/test` (admin; 5/min/org) body `{ category, provider? }` → `{ ok, detail, latencyMs, provider, source: 'org'|'env'|'none' }` (502 si el proveedor falla; 200 `ok:false` si no hay credenciales). Llamadas verificadas en `node_modules` (2026-09-08): twilio `client.api.v2010.accounts(sid).fetch()` (con API Key: `twilio(apiKey, apiSecret, { accountSid })`), resend `domains.list()`, elevenlabs `client.user.subscription.get()` (`tier`, `characterCount`, `characterLimit`), openai `models.list()`, google `new GoogleGenAI({apiKey}).models.list({config:{pageSize:5}})` (Pager async-iterable), meta `GET graph.facebook.com/v22.0/{phone_number_id}?fields=display_phone_number,verified_name`, deepgram `GET /v1/projects` (legacy). El detalle se sanea (los valores de las credenciales se sustituyen por `••••`).
- `GET /api/crm/config/credits` (sesión) → `{ success, period, ai: { credits_remaining, purchased_credits, credits_reset_at, monthly_budget_usd, spent_month_usd, spent_month_credits, budget_used_pct, by_model[], by_day[] }, comm: { sms_remaining, whatsapp_remaining, voice_minutes_remaining, is_active, spent_month_usd, by_channel[] }, pricing: PricingRow[] }`. El costo USD del mes se agrega desde `ai_usage_logs.metadata.cost_amount` / `comm_usage_logs.metadata.cost_amount` (ver "Necesito de DB": columna `cost_amount`). `monthly_budget_usd` sale de `provider_configs(llm, openai).settings.monthly_budget_usd`.

### 4.2 Servicios

| Archivo | Acción | Exportaciones (firma TS) | Responsabilidad |
|---|---|---|---|
| `src/lib/utils/orgContext.ts` | modificar | `getServerOrgContext(req?: Request): Promise<ServerOrgContext>`; `resolveOrgFromExternal(identifier: string, kind: 'phone'\|'call_sid'\|'domain'\|'message_id'\|'channel_id'\|'phone_number_id'\|'account_sid'): Promise<{organizationId:number; serviceClient: SupabaseClient}>`; `OrgContextError` | Sesión + org activa (header `X-Organization-Id` → cookie `goadmin_org_id` → `profiles.last_org_id` → única membresía; si ≥2 y nada indicado → 400 `ORG_REQUIRED`). `resolveOrgFromExternal` usa `getServiceClient()` y `.maybeSingle()`; `phone_number_id` resuelve `channels` vía `channel_credentials.metadata`/`whatsapp_qr_sessions` (F16 fija la columna), `account_sid` → `comm_settings.twilio_subaccount_sid` |
| `src/lib/supabase/service.ts` (NUEVO) | crear | `getServiceClient(): SupabaseClient` (singleton `createClient(url, SERVICE_ROLE_KEY, {auth:{persistSession:false, autoRefreshToken:false}})`; lanza si falta la key); `assertServerOnly()` (throw si `typeof window !== 'undefined'`) | Único cliente service-role. Prohibido importar `@/lib/supabase/config` en `src/app/api/**`, `src/lib/services/**` server y `ws-server` |
| `src/lib/api/withOrg.ts` (NUEVO) | crear | `withOrg(handler: (ctx: ServerOrgContext, req: NextRequest, params) => Promise<Response>, opts?: {roles?: string[]})`; `withCron(handler)`; `jsonError(status, code, message)` | Wrapper que convierte `OrgContextError` en 401/403/400 y aplica roles. `withCron` valida `Authorization: Bearer ${CRON_SECRET}` con `timingSafeEqual`, 401 si `CRON_SECRET` no está definido |
| `src/lib/api/apiClient.ts` (NUEVO, client) | crear | `apiFetch(input, init?)`; `setActiveOrgCookie(orgId: number)` | Inyecta `X-Organization-Id` desde `localStorage.currentOrganizationId` (ya se escribe en `src/lib/supabase/config.ts:130`) y escribe cookie `goadmin_org_id` (`SameSite=Lax; Secure; Path=/`) al seleccionar org, para que los `fetch` no migrados sigan funcionando |
| `src/lib/services/providerRegistry.ts` (+ `providerCredentials.server.ts`, `src/lib/crm/providerCatalog.ts`) | modificado (REG r1) | `providerCatalog.ts` (isomórfico, sin env): `PROVIDER_CATEGORIES`, `UI_PROVIDER_CATEGORIES`, `SUPPORTED_PROVIDERS`, `CREDENTIAL_FIELDS`, `SETTING_FIELDS`, `isPlaceholderCredential(v)`, `hasRequiredCredentials(provider, creds)`. `providerRegistry.ts`: `buildEnvFallbacks()`, `resolveEnvFallback(category, provider?)`, `defaultSettings(category, provider)`, `hasPlatformCredentials(category, provider)`, `sanitizeCredentials(creds)`, `DEFAULT_PROVIDER`, `listProvidersSafe(orgId, client, category?)` (vista `v_provider_configs_safe` → fallback columnas), `getActiveProvider(orgId, category, _ignored?)` **deprecado** (delega por `import()` dinámico en el server-only). `providerCredentials.server.ts` (service role): `getProviderCredentials(orgId, category, provider?): Promise<ProviderConfig & {source}>`, `getProviderSettings(orgId, category, provider?)`, `listProviderConfigsSafe(orgId, category?)`, `upsertProviderConfig(orgId, input)`, `ProviderValidationError`, `__setProviderCredentialsClient(client)` (tests). Fallback env de `voice` ampliado con `TWILIO_API_KEY/SECRET/TWIML_APP_SID/PHONE_NUMBER` (alias `*_MASTER_*`); `stt` ElevenLabs (`scribe_v2`), `tts` ElevenLabs (`model_id: eleven_flash_v2_5`), `llm` OpenAI (`gpt-5.6-luna`), `analysis` google (`GOOGLE_AI_API_KEY \|\| GEMINI_API_KEY`, `gemini-2.5-flash`), `email` resend, `whatsapp` meta, `sms` twilio. Los placeholders `your-…`/`sk-your…` cuentan como NO configurados (tester r1) | Registry único; los 7 consumidores (`voice/call`, `voiceTokenService`, `callAnalysisService`, `transcriptionService`, `emailService`, `mobileBridgeService`, `crm/voiceAgentService`) siguen funcionando sin cambios porque el tercer parámetro se ignora; `setProviderCredentials` del plan es `upsertProviderConfig`; `testProvider` vive en la ruta `providers/test` |
| `src/lib/services/integrations/twilio/twilioAccounts.ts` (NUEVO; sustituye `twilioSubaccounts.ts`) | crear | `getTwilioAccountForOrg(orgId): Promise<{accountSid, authToken, apiKeySid?, apiKeySecret?, twimlAppSid?, isSubaccount}>`; `getTwilioAuthTokenByAccountSid(accountSid): Promise<string \| null>`; `getTwilioClient(orgId)` | Token master desde env; subcuenta desde Vault (`twilio_sub:{org}`) o `provider_configs(voice)`; nunca desde la columna |
| `src/lib/webhooks/verifyTwilio.ts` (NUEVO) | crear | `verifyTwilioWebhook(req: NextRequest): Promise<{params: Record<string,string>; accountSid: string; organizationId: number \| null}>`; `getWebhookBaseUrl(): string` (origin puro, valida con `new URL` y rechaza path) | Ver snippet §4.5.1 |
| `src/lib/webhooks/verifyMeta.ts` (NUEVO) | crear | `verifyMetaSignature(rawBody: string, header: string \| null, appSecret: string): boolean` (`crypto.timingSafeEqual` sobre buffers de igual longitud); `resolveWaChannelByPhoneNumberId(phoneNumberId): Promise<{channelId, organizationId, appSecret}>` | Sustituye `whatsappCloudConfig.verifyWhatsAppWebhookSignature` (`===`) |
| `src/lib/webhooks/verifyResend.ts` (NUEVO) | crear | `verifyResendWebhook(rawBody, headers): ResendEvent` (usa `resend.webhooks.verify({payload, headers:{id,timestamp,signature}, webhookSecret})` de `docs-resend.md`; 401 si falta secreto) | Hoy `emailService.handleEmailWebhook` lo hace inline: se extrae |
| `src/lib/webhooks/verifyElevenLabs.ts` (NUEVO) | crear | `verifyElevenLabsWebhook(rawBody, signatureHeader, secret)` con `client.webhooks.constructEvent(rawBody, signatureHeader, secret)` | Preparado para F4/F6 (Scribe async, post_call_transcription) |
| `src/lib/crm/enums.ts` (NUEVO) | crear | `CALL_MODES`, `CALL_STATUSES`, `BRIDGE_MODES`, `RECORDING_STATUSES`, `SENTIMENTS`, `ACTIVITY_TYPES`, `TASK_STATUSES`, `PURPOSE_TYPES`, `JOB_KINDS`, `JOB_STATUSES` como `as const` + tipos derivados + `mapTwilioCallStatus(s: string): CallStatus` | Única fuente de verdad sincronizada con los CHECKs (§4.5.3) |
| `src/lib/jobs/queue.ts` (NUEVO) | crear | `enqueueJob(input: {organizationId:number; kind: JobKind; payload: Record<string,unknown>; runAt?: Date; dedupeKey?: string; priority?: number; maxAttempts?: number}): Promise<string>`; `JobHandler = (job: OutboundJob, ctx: JobContext) => Promise<unknown>`; `registerJobHandler(kind: JobKind, fn: JobHandler)`; `runJobs(opts: {kinds?: JobKind[]; limit?: number; deadlineMs?: number; worker: string}): Promise<RunSummary>`; `JobRetryableError`, `JobFatalError` (con `retryAfterSeconds?`) | Runner; usa `getServiceClient().rpc('fn_claim_jobs' …)`. Registra `noop`, `crm_event` (marca `processed` y delega a `automationService.evaluateTrigger` cuando F8 lo conecte; hasta entonces `skipped`) y `maintenance` |
| `src/lib/jobs/handlers/maintenance.ts` (NUEVO) | crear | `maintenanceHandler` | Borra `outbound_jobs` done > 30 d, `crm_events` processed > 30 d, expira `whatsapp_qr_sessions`; F3/F4 añaden `recording_cleanup` |
| `src/lib/observability/log.ts` (NUEVO) | crear | `logger.child({org_id, job_kind, job_id, request_id})` → JSON por línea; `withSentryTags({org_id, job_kind})` | Logs estructurados; Sentry vía el SDK ya configurado en `sentry.server.config.ts` |
| `src/lib/services/crm/automationService.ts:534-547` | modificar | `UPDATE_FIELD_ALLOWLIST: Record<'opportunities'\|'customers'\|'tasks', string[]>` = opportunities: `temperature,next_action,next_contact_at,recontact_at,source,deal_type,metadata` (nunca `stage_id/status/amount/organization_id`); customers: `lifecycle_stage,tags,metadata,timezone`; tasks: `status,priority,due_date` | Cierra C-H |
| `src/lib/services/aiCreditsService.ts` (`consumeAICredits`) + `src/lib/services/crm/{pricingService,aiCostService}.ts` (NUEVOS, REG r1) | hecho | `consumeAICredits(orgId, amount, opts?)` → `rpc('decrement_ai_credits', {p_org_id, p_cost})` (atómico; log en `ai_usage_logs` con `action_type/model` opcionales). `pricingService`: `getUnitCost(provider, sku): Promise<number\|null>` (cache 5 min, `provider_pricing` real: `valid_from` sin `valid_to`), `estimateCost(items: {provider, sku, quantity}[]): Promise<{total_usd, lines, complete}>`, `listPricing()`, `units.{minutes,hours,char1k,tokens1m}`, `clearPricingCache()`. `aiCostService`: `chargeAiCredits({orgId, actionType, model, units, unitSku?, provider?, credits?, userId?, metadata?})` (RPC ANTES del proveedor; `InsufficientCreditsError` 402; log con `metadata.cost_amount` USD real), `refundAiCredits({orgId, credits, actionType, reason?, logId?})` (mismo RPC con `p_cost` negativo: `FOR UPDATE` → atómico), `withAiCharge(input, fn)` (cobro → proveedor → reembolso en fallo), `chargeCommCredits({orgId, channel, amount?, recipient, unitSku?, units?, …})` → `deduct_comm_credits(p_org_id, p_channel, p_amount)` + `comm_usage_logs` | Cierra C-10; D6 (RPC atómico siempre antes del proveedor, precios desde `provider_pricing`, sin hardcode) |
| `ws-server.ts` | modificar | `server.on('upgrade', verifyUpgrade)`; `issueWsSessionToken(callId, orgId): string` / `verifyWsSessionToken(token): {callId, orgId} \| null` en `src/lib/services/integrations/twilio/voiceAgent/wsAuth.ts` (NUEVO; HMAC-SHA256 con `WS_SESSION_SECRET`, exp 15 min) | §4.5.2 |

#### 4.2.1 Implementado en ronda 1 (SEC) — rutas reales y desviaciones respecto a la tabla

| Planificado en §4.2 | Implementado (archivo real) | Desviación |
|---|---|---|
| `src/lib/supabase/service.ts` `getServiceClient()` | `src/lib/supabase/server-service.ts:26` `getServiceClient()` + `assertServerOnly()` | Nombre `server-service.ts` (indicación del orquestador). Cliente de usuario con cookies extraído a `src/lib/supabase/server-user.ts` `getServerUserClient()` |
| `src/lib/api/withOrg.ts` (`withOrg`, `withCron`, `jsonError`) | `src/lib/utils/orgContext.ts:286,305,270` | Viven en `orgContext.ts` para no crear un módulo más; misma firma (`withOrg(handler, {admin?})`, `withCron(handler)`) |
| `src/lib/webhooks/{verifyTwilio,verifyMeta,verifyResend,verifyElevenLabs}.ts` | `src/lib/security/webhookSignatures.ts` (un solo módulo): `getTwilioWebhookOrigin` :49, `resolveTwilioAuthToken` :73, `verifyTwilioRequest(req, rawBody, {authToken})` :109, `verifyTwilioWebhook(req)` :131, `verifyTwilioUrlSignature` :146, `verifyMetaSignature` :157, `verifyResendWebhook` :169 (svix), `verifyCronSecret` :189, `WebhookError` | `verifyElevenLabsWebhook` NO se creó (no hay SDK instalado; F4/F6 lo añaden cuando REG instale `@elevenlabs/elevenlabs-js`). `getTwilioWebhookOrigin` acepta un valor legacy con path y toma solo `.origin` (no lanza) para no romper `.env.local` |
| `twilioAccounts.ts` `getTwilioAuthTokenByAccountSid` (Vault) | `resolveTwilioAuthToken` lee `comm_settings.twilio_subaccount_auth_token` con service client | Vault/`fn_get_provider_secret` es del agente DB/REG; cuando exista, cambiar solo esta función |
| `wsAuth.ts` `issueWsSessionToken/verifyWsSessionToken` (exp 15 min) | `src/lib/security/wsSessionToken.ts:45,58` (exp **10 min**, sin dependencias de Next para que el ws-server lo importe) | El token va en `?st=` de la URL wss Y en `<Parameter name="token">`; el ws-server valida ambos (upgrade y `setup`) |
| `src/lib/security/rateLimit.ts` (no estaba en §4.2) | `checkRateLimit` :54 (ventana fija en memoria por instancia; `persistentCount` opcional inyectable), `checkRateLimits` :91, `getClientIp` | Sin tabla nueva: el contador persistente se inyecta si alguna fase lo necesita |
| `enums.ts` `mapTwilioCallStatus` | `src/lib/crm/enums.ts` `twilioCallStatusToDb` :229 (+ alias `mapTwilioCallStatus`), `twilioRecordingStatusToDb`, `DB_CHECK_ENUMS` :252 (tabla para el guardarraíl) | Incluye `recording_fetch` (CHECK real) y `noop` como `planned_extras` (JOBS) |
| `whatsapp/send` → Meta directo | Inserta en `messages` (shape viva) y despacha `trg_channel_dispatch` | Decisión D1: un solo path de salida |
| `qr/send` | Persiste con shape viva + `metadata.dispatched=true, dispatch_channel='baileys'` (ya enviado por Evolution; el trigger no debe reenviar) | Verificar en F16 que `channel-dispatch` respeta `metadata.dispatched` |

### 4.3 Webhooks / proveedor (verificación y mapeo)

| Proveedor | Cabecera / mecanismo | Secreto | Resolución de org | Fallo |
|---|---|---|---|---|
| Twilio (voz, SMS, WA, recording, status) | `X-Twilio-Signature` = HMAC-SHA1(token, URL completa + params POST ordenados) (`docs-twilio-messaging.md` §Firma) | Token de la (sub)cuenta: `AccountSid === TWILIO_MASTER_ACCOUNT_SID` → `TWILIO_MASTER_AUTH_TOKEN`; si no → `getTwilioAuthTokenByAccountSid` (Vault). Token desconocido → 403 | `CallSid`→`calls.provider_call_sid` \| `To`→`phone_numbers.e164` \| `AccountSid`→`comm_settings.twilio_subaccount_sid` | 403 firma; 200 `<Response/>` si org no resuelta + `integration_events` |
| Twilio ConversationRelay (WS) | `X-Twilio-Signature` en el handshake sobre la URL wss completa con query (sin params) | igual que arriba | `sessionToken` en query/`<Parameter>` → `callId`→`calls.organization_id` | cierre 4401 antes de aceptar |
| Meta WhatsApp | `X-Hub-Signature-256: sha256=HMAC-SHA256(raw body, App Secret)` (`docs-meta-whatsapp-calendar.md`) | `app_secret` del canal (Vault `chan:{org}:{channel}`) o `META_APP_SECRET` global si el canal usa la app de la plataforma | `entry[].changes[].value.metadata.phone_number_id` → canal | 403; nunca procesar sin firma |
| Resend | `svix-id`, `svix-timestamp`, `svix-signature` sobre raw body | `RESEND_WEBHOOK_SECRET` (uno por endpoint) | `data.tags.tenant_id` (objeto) → org; fallback `data.email_id` → `email_messages.provider_message_id` | 401 |
| ElevenLabs | `ElevenLabs-Signature` → `client.webhooks.constructEvent` | `ELEVENLABS_WEBHOOK_SECRET` | `metadata.organization_id` enviado al crear la tarea | 401 |
| pg_cron / Vercel cron | `Authorization: Bearer CRON_SECRET` (timingSafeEqual) | Vault `crm_cron_secret` = env `CRON_SECRET` | n/a (multi-org por job) | 401 |

### 4.4 Jobs / cola

| kind | Fase que registra handler | payload | max_attempts / política |
|---|---|---|---|
| `noop` | F0 | `{}` | 1; solo para pruebas del runner |
| `crm_event` | F0 (skeleton) → F8 | `{event_id}` | 3; falla no reintentable si el evento no existe |
| `maintenance` | F0 | `{}` | 1 |
| `recording_cleanup` | F3/F4 | `{organization_id?}` | 3 |
| `transcribe` / `analyze` | F4 | `{call_id, recording_id}` / `{call_id, transcript_id}` | 4; `dedupe_key = transcribe:{recording_id}` |
| `email` | F7 | `{email_message_id}` | 5; `dedupe_key = email:{email_message_id}` |
| `whatsapp` / `sms` | F16 / F8 | `{message_id}` / `{comm_usage_log_id}` | 5; error Meta 131049 → `JobRetryableError(retryAfterSeconds: 86400)` |
| `ai_call` | F6 | `{voice_agent_call_id}` | 3 |
| `sequence_step` / `automation` | F8 | `{step_run_id}` / `{automation_run_id}` | 3 |
| `campaign_batch` | F16 | `{campaign_id, offset, size}` | 5; solo cron `crm-campaigns-5min` |

Reglas del runner (reales, r2): `deadlineMs = 50000` menos lo que consuma el productor programado (máx 20 s); lotes de 25 (≤200); timeout por job `min(30 s, deadline restante)` con `AbortController` (no 45 s ni `AbortSignal.timeout`); resultado por job → `fn_complete_job`/`fn_fail_job`; lo no ejecutado se libera con `fn_release_job` (o fallback `attempts-1`); log JSON con `worker, org_id, job_id, kind, attempt, outcome, ms, error`. `max_attempts` reales: `crm_event` encolado por `fn_emit_crm_event` = 5 (default de la RPC), por resync/retry = 3; `crm_events.attempts` (DB-r2) limita el resync a 3 intentos de procesamiento por evento.

**Implementado en ronda 1 (JOBS) — desviaciones respecto a la tabla anterior (schema real verificado 2026-09-08):**

- Archivos reales: `src/lib/jobs/{types,registry,enqueue,runner}.ts`, `src/lib/jobs/handlers/{index,noop,crmEvent,maintenance}.ts`, `src/lib/jobs/dispatch/eventDispatcher.ts` (+ `listeners/stageChangedActivity.ts`). No existe `queue.ts` (se dividió).
- `JOB_KINDS` vive en `src/lib/crm/enums.ts` (re-exportado por `jobs/types.ts`). El CHECK real de `outbound_jobs.kind` incluye `recording_fetch` y, desde DB-r2 (`crm_v4_f00_12`), también `noop` (14 kinds = `JOB_KINDS`; `db-checks.json` regenerado en JOBS-r2 con `planned_extras` vacío). `outbound_jobs` no tiene `priority`, `created_by` ni `completed_at`; `crm_events` no tiene `occurred_at` ni `actor_user_id`, y desde DB-r2 (`crm_v4_f00_16`) SÍ tiene `attempts int NOT NULL DEFAULT 0` y `last_error text`.
- RPC reales: `fn_claim_jobs(p_kinds, p_limit, p_worker)`, `fn_complete_job(p_job_id, p_worker, p_result) → boolean`, `fn_fail_job(p_job_id, p_worker, p_error, p_retry_after_seconds) → text` (sin `p_retryable`: `p_retry_after_seconds = -1` ⇒ estado terminal `failed`; `attempts ≥ max_attempts` ⇒ `dead`; backoff `60s·2^attempts` máx 1 h), `fn_enqueue_job(p_org, p_kind, p_payload, p_run_at, p_dedupe_key, p_max_attempts)` (sin `p_priority`; con dedupe vivo devuelve el job existente), `fn_emit_crm_event(p_org, p_type, p_entity_type, p_entity_id, p_payload) → uuid` (inserta el evento **y** encola `crm_event` con `dedupe_key = crm_event:{id}`, tester #2).
- Estados del runner: `done` (incluye `skipped` cuando el handler devuelve `{skipped:true}`), `retried` (vuelve a `queued`), `failed` (terminal: `no_handler` o `JobFatalError`), `dead` (agotó intentos), `released` (reclamado pero devuelto a la cola por deadline). Tester #19: `failed` sí se produce.
- `crm_event`: evento inexistente ⇒ `JobFatalError`; sin listeners ⇒ evento `skipped`; listener falla ⇒ evento `failed` y job reintentado (los listeners deben ser idempotentes). Listener F0 registrado: `opportunity.stage_changed` → activity `system` "Etapa cambiada de X a Y" con dedupe por `metadata.stage_history_id` o (oportunidad, `to_stage_id`, ±90 s), que también cubre la activity que hoy inserta el cliente (`OpportunityAutomations.tsx:315-330`).
- `maintenance` (r2): borra `outbound_jobs` `done|failed|dead` con `updated_at` > 30 d, `crm_events` `processed|skipped` con `processed_at` > 30 d y `failed` con `created_at` > 30 d; re-encola `crm_event` para eventos `pending|failed` de entre 2 min y 7 d con `attempts < 3` (resync del outbox; `events_abandoned` cuenta los que superan 3). **Productor**: lo ejecuta directamente `runScheduledKinds` (`src/lib/jobs/scheduler.ts`) cuando el cron diario pide `kind=maintenance`; el handler `maintenance` sigue registrado para pruebas/encolado manual y usa la misma función `runMaintenance`.
- `recording_cleanup` (r2): productor diario por org (`recording_cleanup:{yyyy-mm-dd}`, orgs con `comm_settings.is_active`) que solo encola cuando F3 registre el handler real (`hasRealJobHandler`); con el placeholder de F0 responde `reason:'handler_not_registered'` sin ensuciar la cola. **Ya activo**: con el handler de F3 registrado, una llamada a `?kind=recording_cleanup` encoló y completó un job por org activa (verificado 2026-09-09 en `outbound_jobs`, `dedupe_key='recording_cleanup:2026-09-09'`, todos `done`).
- Liberación por deadline (tester F-4): `fn_release_job(p_job_id, p_worker)` (DB-r2) resta el intento del claim sin tocar `last_error`; hasta que exista, fallback `UPDATE … SET status='queued', attempts=attempts_del_claim-1 WHERE status='running' AND locked_by=worker` (`releasedWithoutRpc` en el resumen).
- Kinds inválidos (tester F-3): la ruta responde 400 y `runJobs({kinds:[solo inválidos]})` no reclama nada (`claimed:0`, log `no_valid_kinds`).
- `crm_events.attempts/last_error` (DB-r2): el handler `crm_event` los escribe al fallar (`attempts+1`, `last_error` ≤2000 chars) y hace fallback a `status='failed'` si las columnas aún no existen (PGRST204/42703).
- Placeholders: en r1 `recording_cleanup` y `campaign_batch` se registraban como **placeholder** (`{skipped:true, reason:'handler_not_registered'}`). Tras la integración de la ola 2 el índice compartido `src/lib/jobs/handlers/index.ts` ya registra los handlers REALES de F3 (`recording_fetch`, `recording_cleanup`), F4 (`transcribe`, `analyze`), F7 (`email`) y F16 (`whatsapp`, `campaign_batch`), y `PLACEHOLDER_KINDS` está vacío. El mecanismo (`registerJobHandler(kind, fn, {placeholder:true})` + `hasRealJobHandler`) se conserva para los kinds que aún no tienen fase (`ai_call` F6, `sequence_step`/`automation`/`sms` F8): sin handler el runner los deja en `failed` (`no_handler`), no en `dead`.
- Selección de kinds en `/api/crm/jobs/run`: `body.kinds` → `?kind=a,b` → header `x-vercel-cron-schedule` (`*/5 * * * *` ⇒ `campaign_batch`; `30 8 * * *` ⇒ `recording_cleanup,maintenance`; 08:30 UTC = 03:30 Bogotá, tester #20) → todos; cualquier valor desconocido en body/query ⇒ 400. `maxDuration = 60` (plan Pro; tester #9). Vercel Cron envía `Authorization: Bearer CRON_SECRET` automáticamente cuando la variable existe en el proyecto (docs Vercel "Securing cron jobs", verificado 2026-09-08); `verifyCronSecret` (SEC) acepta también `x-cron-secret`; no se acepta `?token=`.
- pg_cron real (DB r2, verificado 2026-09-08 con `cron.job`): jobs 17 `crm-jobs-every-minute` (`* * * * *`, sin body ⇒ todos los kinds), 18 `crm-campaigns-5min` (`*/5 * * * *`, body `{"kinds":["campaign_batch"]}`), 19 `crm-daily-maintenance` (`30 8 * * *`, body `{"kinds":["recording_cleanup","maintenance"]}`), **todos `active=false`** hasta que el runner esté desplegado; `fn_crm_cron_post(p_path text DEFAULT '/api/crm/jobs/run', p_body jsonb DEFAULT '{}') → bigint` (la sobrecarga `(text)` de r1 se eliminó). Los dos schedulers (pg_cron y Vercel) piden exactamente los mismos kinds; la ruta prioriza `body.kinds`. El M8 de §3.1 con `fn_crm_cron_post(p_kinds text[], p_path)` y `30 3 * * *` es el plan original, no lo aplicado.

### 4.5 Snippets no obvios

#### 4.5.1 `verifyTwilioWebhook` (fail-closed, token por AccountSid, URL desde origin)

```ts
// src/lib/webhooks/verifyTwilio.ts  — runtime nodejs
import { validateRequest } from 'twilio';
export function getWebhookBaseUrl(): string {
  const raw = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!raw) throw new Error('TWILIO_WEBHOOK_BASE_URL requerido');
  const u = new URL(raw);
  if (u.pathname !== '/' || u.search) throw new Error('TWILIO_WEBHOOK_BASE_URL debe ser un origin puro (https://app.goadmin.io)');
  return u.origin;
}
export async function verifyTwilioWebhook(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const accountSid = params.AccountSid ?? '';
  const token = accountSid && accountSid === process.env.TWILIO_MASTER_ACCOUNT_SID
    ? process.env.TWILIO_MASTER_AUTH_TOKEN ?? null
    : await getTwilioAuthTokenByAccountSid(accountSid);          // Vault; null si desconocido
  if (!signature || !token) throw new WebhookError(403, 'twilio_signature_unresolved');
  const { pathname, search } = new URL(req.url);
  const url = `${getWebhookBaseUrl()}${pathname}${search}`;     // nunca req.url (Vercel reescribe host)
  if (!validateRequest(token, signature, url, params)) throw new WebhookError(403, 'twilio_signature_invalid');
  const organizationId = accountSid === process.env.TWILIO_MASTER_ACCOUNT_SID ? null
    : (await resolveOrgFromExternal(accountSid, 'account_sid')).organizationId;
  return { params, accountSid, organizationId };
}
```

#### 4.5.2 ws-server: firma en el upgrade + token de sesión

```ts
// ws-server.ts
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? '/', process.env.WS_PUBLIC_URL);          // wss://go-admin-erp-production.up.railway.app
    if (url.pathname !== '/conversation-relay') return socket.destroy();
    const sig = String(req.headers['x-twilio-signature'] ?? '');
    const session = verifyWsSessionToken(url.searchParams.get('st') ?? '');   // {callId, orgId} | null
    if (!session) return reject(socket, 401);
    const token = await getTwilioAuthTokenForOrg(session.orgId);              // master o subcuenta (Vault)
    if (!sig || !token || !validateRequest(token, sig, url.toString(), {})) return reject(socket, 403);
    wss.handleUpgrade(req, socket, head, (ws) => handleConversationRelayConnection(ws, session));
  } catch { socket.destroy(); }
});
// TwiML (F6): <ConversationRelay url="wss://…/conversation-relay?st={issueWsSessionToken(callId, orgId)}"> …
```

#### 4.5.3 `enums.ts` y mapeo Twilio → BD

```ts
// src/lib/crm/enums.ts — sincronizado con los CHECKs (guardrail #6 lo verifica)
export const CALL_MODES = ['browser','bridge','ai_agent','manual','inbound'] as const;
export const CALL_STATUSES = ['dialing','ringing','in_progress','completed','failed','busy','no_answer','canceled','voicemail'] as const;
export const BRIDGE_MODES = ['agent_leg','customer_leg','full_bridge'] as const;
export const RECORDING_STATUSES = ['processing','ready','failed','deleted'] as const;
export const SENTIMENTS = ['positive','neutral','negative','mixed'] as const;
export const ACTIVITY_TYPES = ['call','email','whatsapp','sms','meeting','visit','note','system','ai_call','task'] as const;
export const TASK_STATUSES = ['open','in_progress','done','canceled'] as const;
export const JOB_KINDS = ['email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze','recording_cleanup','campaign_batch','crm_event','maintenance','noop'] as const;
export type CallStatus = typeof CALL_STATUSES[number];
const TWILIO_TO_DB: Record<string, CallStatus> = {
  queued: 'dialing', initiated: 'dialing', ringing: 'ringing', 'in-progress': 'in_progress',
  completed: 'completed', busy: 'busy', failed: 'failed', 'no-answer': 'no_answer', canceled: 'canceled',
};
export const mapTwilioCallStatus = (s: string): CallStatus => TWILIO_TO_DB[s] ?? 'failed';
// Modos: 'click-to-call'→'browser', 'voice-agent'→'ai_agent', 'power-dialer'→'browser' (F3), bridge→'bridge'.
// Recording: RecordingStatus 'completed'→'ready', 'in-progress'→'processing', 'absent'→'failed'.
```

#### 4.5.4 `getServerOrgContext` con org activa

```ts
const requested = req?.headers.get('x-organization-id') ?? cookieStore.get('goadmin_org_id')?.value ?? null;
let q = supabase.from('organization_members').select('organization_id, is_super_admin, role_id, organizations(name), roles!inner(name)')
  .eq('user_id', user.id).eq('is_active', true);
if (requested) q = q.eq('organization_id', Number(requested));
const { data: rows } = await q.limit(2);
if (!rows?.length) throw new OrgContextError(requested ? 'No perteneces a esa organización' : 'Sin organización', 403);
if (!requested && rows.length > 1) {
  const { data: p } = await supabase.from('profiles').select('last_org_id').eq('id', user.id).maybeSingle();
  const m = rows.find(r => r.organization_id === p?.last_org_id);
  if (!m) throw new OrgContextError('Indica la organización activa (X-Organization-Id)', 400);
  return build(m);
}
return build(rows[0]);
```

### 4.6 Variables de entorno (contenido íntegro de `.env.example`, agrupado)

```
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL= · NEXT_PUBLIC_SUPABASE_ANON_KEY= · SUPABASE_SERVICE_ROLE_KEY=   (server-only; ws-server también)
# ── App / cron ──
NEXT_PUBLIC_APP_URL=https://app.goadmin.io           # origin público del ERP
CRON_SECRET=                                          # = vault 'crm_cron_secret'; sin él /api/crm/jobs/run responde 401
WS_SESSION_SECRET=                                    # HMAC de tokens de sesión ConversationRelay (NUEVO)
ENCRYPTION_KEY=                                       # reservado: NO se usa; los secretos van a Vault
# ── Twilio ──
TWILIO_MASTER_ACCOUNT_SID=AC… · TWILIO_MASTER_AUTH_TOKEN=            # cuenta master (webhooks + subcuentas)
TWILIO_ACCOUNT_SID=AC… · TWILIO_AUTH_TOKEN=                          # alias legacy = master (se eliminan en F3)
TWILIO_API_KEY=SK… · TWILIO_API_SECRET= · TWILIO_TWIML_APP_SID=AP…   # fallback env para orgs sin provider_configs(voice)
TWILIO_PHONE_NUMBER=+57… · TWILIO_WHATSAPP_NUMBER=whatsapp:+57… · TWILIO_VERIFY_SERVICE_SID=VA… · TWILIO_MESSAGING_SERVICE_SID=MG…
TWILIO_WEBHOOK_BASE_URL=https://app.goadmin.io       # ORIGIN PURO (esquema+host, sin path ni barra final). Todas las rutas
                                                      # se construyen como `${origin}/api/voice/…`. Usar túnel https en dev.
WS_SERVER_URL=wss://go-admin-erp-production.up.railway.app   # lo consume Next.js para el TwiML
WS_PUBLIC_URL=wss://go-admin-erp-production.up.railway.app   # lo consume el ws-server para validar la firma del upgrade
WS_PORT=8080
TWILIO_PUSH_CREDENTIAL_SID_IOS=CR… · TWILIO_PUSH_CREDENTIAL_SID_ANDROID=CR…   # F5
# ── IA ──
OPENAI_API_KEY= · OPENAI_CONVERSATION_MODEL=gpt-5.6-terra · OPENAI_CHEAP_MODEL=gpt-5.6-luna · OPENAI_TRANSCRIBE_MODEL=gpt-transcribe · OPENAI_WEBHOOK_SECRET=
GOOGLE_AI_API_KEY= · GEMINI_ANALYSIS_MODEL=gemini-2.5-flash · GEMINI_CHAT_MODEL=gemini-3.8-flash
ELEVENLABS_API_KEY= · ELEVENLABS_SCRIBE_MODEL=scribe_v2 · ELEVENLABS_TTS_MODEL=eleven_flash_v2_5 · ELEVENLABS_WEBHOOK_SECRET=
DEEPGRAM_API_KEY=                                     # solo si transcriptionProvider Deepgram fuera de ConversationRelay (opcional)
# ── Email ──
RESEND_API_KEY=re_… · RESEND_WEBHOOK_SECRET=whsec_… · EMAIL_FROM_NAME= · EMAIL_FROM_ADDRESS=   # fallback si la org no tiene dominio verificado
SENDGRID_API_KEY= · SENDGRID_WEBHOOK_VERIFICATION_KEY=                                        # legacy notificaciones
# ── WhatsApp / Meta ──
META_APP_ID= · META_APP_SECRET= · WHATSAPP_VERIFY_TOKEN= · META_EMBEDDED_SIGNUP_CONFIG_ID=
EVOLUTION_API_URL= · EVOLUTION_API_KEY=
# ── Calendario / otros (fases posteriores) ──
CALCOM_API_KEY= · GOOGLE_CALENDAR_CLIENT_ID= · GOOGLE_CALENDAR_CLIENT_SECRET= · DOCUMENSO_API_KEY= · DAILY_API_KEY= · APOLLO_API_KEY=
# ── Observabilidad ──
SENTRY_DSN= · NEXT_PUBLIC_SENTRY_DSN= · LOG_LEVEL=info
# (se conservan las existentes: Stripe, OpenExchangeRates, Google Maps, Google Ads, TripAdvisor, DIAN, VAPID, sellers…)
```

Eliminadas: `OPENAI_MODEL`, `OPENAI_CHAT_MODEL`, `OPENAI_REALTIME_MODEL` (=`gpt-4o-realtime-preview`, apagado 2026-05-07 según `docs-openai.md`), `ELEVENLABS_MODEL=eleven_v3`/`ELEVENLABS_VOICE_ID` (la voz es por org en `voices`, F6), `DEEPGRAM_MODEL`, `GOOGLE_APPLICATION_CREDENTIALS`, `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_APP_SECRET` (por canal en Vault), `POSTHOG_KEY`.

**Estado real ronda 1 (REG):** `.env.example` (sección "CRM Revenue OS V4 — Integraciones por proveedor y fase", desde la línea 74) es la fuente de verdad y aplica las correcciones del tester ANEXO-B #1–#3: `GOOGLE_AI_API_KEY` existente (con `GEMINI_API_KEY` como alias aceptado por el registry), `TWILIO_API_KEY`/`TWILIO_API_SECRET`/`TWILIO_TWIML_APP_SID` con sus nombres existentes, `TWILIO_PUSH_CREDENTIAL_SID_IOS/ANDROID`, `ELEVENLABS_SCRIBE_MODEL=scribe_v2`, `ELEVENLABS_MODEL=eleven_flash_v2_5`, `WS_SESSION_SECRET`, `WS_PUBLIC_URL`, `GEMINI_ANALYSIS_MODEL=gemini-2.5-flash`, `GEMINI_CHAT_MODEL`, `OPENAI_MODEL=gpt-5.6-luna` (se conserva: es la variable que lee el registry para el modelo barato), `OPENAI_CONVERSATION_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `DEEPGRAM_*` marcadas "legacy: se retira en F4" (no se borran: `transcriptionService.ts` sigue vivo), `TWILIO_WEBHOOK_BASE_URL` documentado como ORIGIN PURO (esquema+host, sin path ni barra final) y `WS_SERVER_URL`/`WS_PUBLIC_URL` como host `wss://` sin path. `.env.local` no se tocó. Los valores `your-…` son placeholders y el registry los ignora.

### 4.7 Dependencias npm (versiones fijadas)

| Paquete | Versión | Motivo |
|---|---|---|
| Node | **22.x** (`engines: {"node": ">=22.0.0"}`, Vercel Node 22.x, `ws-server.Dockerfile` `node:22-slim`) | `openai` 7.x exige Node ≥22; local ya es v22.14; `twilio` 6 exige ≥20; `@google/genai` 3.x exigirá 22 |
| `twilio` | `^6.1.0` | `docs-twilio-*`: v6 abr-2026 |
| `@twilio/voice-sdk` | `^2.18.4` | Electron compatible |
| `openai` | `^7.10.0` | `client.webhooks.unwrap`, Responses API, `zodTextFormat`, Realtime GA |
| `@google/genai` | `^2.21.0` (fijar, no `^3`) | `docs-gemini.md` |
| `@elevenlabs/elevenlabs-js` | `^2.67.0` | paquete `elevenlabs` deprecado; hoy no hay SDK |
| `resend` | `^6.26.0` | `webhooks.verify`, batch, domains |
| `@react-email/components` `^1.0.12`, `@react-email/render` `^2.1.0` | F7 los usa; `react-email ^6.9.3` ya está | render `async` |
| `svix` `^2.2.0`, `zod` `^3.25`, `ws` `^8.19`, `motion` `^13.1` | ya instalados | – |
| `@sentry/nextjs` | alinear con la versión de `@sentry/react` `10.69.0` ya presente | tags `org_id`/`job_kind` en server |

**Decisión ronda 1 (REG, 2026-09-08): quedarse en Node 20 + `openai ^6.15` en este ciclo.** Railway corre `node:20-slim` y Vercel está en 20.x; subir a 22 exige `engines.node >=22`, `FROM node:22-slim` y cambiar el runtime de Vercel en el mismo PR, y ningún consumidor F0–F16 necesita `webhooks.unwrap` todavía (los webhooks OpenAI son solo del SIP connector experimental). Instalado en r1: `twilio ^6.1.0` (6.1.0), `@twilio/voice-sdk ^2.18.4`, `resend ^6.26.0`, `@elevenlabs/elevenlabs-js ^2.67.0`, `@google/genai ^2.21.0` (2.21.0), `@react-email/components ^1.0.12`, `@react-email/render ^2.1.0`, `sanitize-html ^2.17.7` + `@types/sanitize-html`; `engines.node` = `>=20.0.0`; `npx tsc --noEmit` no añade errores por los upgrades (0 archivos tocados por ese motivo; los 230 errores del baseline son previos: stripe, PMS, etc.). `@sentry/nextjs` NO se instala (tester #11). **Plan Node 22 (PR separado, después de F0):** (1) `engines.node >=22.0.0`, (2) `ws-server.Dockerfile` `FROM node:22-slim`, (3) Vercel → Node 22.x en Settings, (4) `npm i openai@^7.10.0` y adaptar `client.webhooks.unwrap`/Responses en los call sites (`ai-assistant/*`, `chat/ai/*`, `callAnalysisService`, ws-server), (5) `npx tsc --noEmit` + smoke de `/api/crm/config/providers/test` con `llm/openai`.

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| `/app/configuracion?modulo=crm` | `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` (NUEVO, r1) montado por `ConfiguracionPanelRenderer.tsx` (`crm:`); `CRMConfigPanel.tsx` (838 L, sin tocar) queda como contenido de la pestaña **General** | Pestañas General · Proveedores e IA · Créditos y sistema; activa en `?tab=general\|proveedores\|creditos` |
| `/app/crm/llamadas`, `/app/crm/leads` | existentes | Se añaden al nav |
| `/app/crm/agentes-ia`, `/app/crm/plantillas`, `/app/crm/secuencias`, `/app/crm/automatizaciones` | F6/F7/F8 crean las páginas | F0 **no** crea placeholders ni páginas vacías: cada entrada se añade a `CRM_NAV` en el mismo PR en que su fase entrega la página funcional (feature flag `CRM_NAV_V4` en `moduleConfig.ts` para poder desplegar el nav antes de tiempo sin mostrar entradas muertas) |

Nav CRM final (`AppLayout.tsx:122-139` y `moduleConfig.ts:136-141` derivan de una única constante `CRM_NAV` en `src/config/crmNav.ts` NUEVO): Pipeline, Leads, Oportunidades, Clientes, Llamadas, Actividades, Plantillas, Secuencias, Automatizaciones, Agentes IA, Campañas, Segmentos, Pronóstico, Equipo, Salud, Identidades. "Salud Clientes" se renombra a "Salud".

### 5.2 Componentes (todos ≤300 líneas, `'use client'`, shadcn, pares `dark:` explícitos)

| Archivo | Props | Estado / hooks | Servicios |
|---|---|---|---|
| `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` (NUEVO) | `{ initialTab?: 'proveedores'\|'telefonia'\|'email'\|'whatsapp'\|'creditos'; organizationId: number }` | `Tabs` de `@/components/ui/tabs`; tab activo en `?tab=`; en F0 solo se registran los tabs `proveedores` y `creditos` (array `TABS` filtrado por los componentes existentes); los tabs Telefonía/Email/WhatsApp se registran en el PR de F3/F7/F16 que entrega su componente, nunca antes | – |
| `src/components/configuracion/panels/crm/providers/ProvidersAiTab.tsx` (NUEVO) | `{ organizationId: number; canEdit: boolean }` | `useProviderConfigs()`; agrupa por categoría (`llm`, `analysis`, `stt`, `tts`, `voice`, `email`, `whatsapp`, `sms`); presupuesto mensual (`settings.monthly_budget_usd`) con `Slider`+`Input` | `GET/PUT /api/crm/config/providers` |
| `.../providers/ProviderCard.tsx` (NUEVO) | `{ item: ProviderConfigSafe; supported: string[]; onSave(input: PutProviderInput): Promise<void>; onTest(): Promise<TestResult>; disabled?: boolean }` | `Badge` estado (`has_credentials` → "Clave propia" / "Usa clave de la plataforma"), `Switch` `is_active`, `Select` provider, `Select` modelo desde `settings` | – |
| `.../providers/ProviderCredentialForm.tsx` (NUEVO) | `{ category: ProviderCategory; provider: string; hint?: string; onSubmit(creds: Record<string,string>): Promise<void> }` | `Dialog`; campos por proveedor (`FIELD_SCHEMAS` zod); inputs `type=password`; nunca muestra valores existentes, solo `hint` | – |
| `.../providers/useProviderConfigs.ts` (NUEVO) | – | `{ items, loading, error, save(input), test(category, provider), refresh }` con `useState/useCallback` (sin react-query); refetch granular por categoría | `apiFetch` |
| `.../credits/CreditsTab.tsx` (NUEVO) | `{ organizationId: number }` | `useCredits()`: KPIs IA/SMS/WA/voz, tabla `provider_pricing` agrupada por proveedor, alerta cuando `spent_month_usd ≥ 80%` del presupuesto | `GET /api/crm/config/credits` |
| `src/components/crm/jobs/JobsMonitor.tsx` (NUEVO, opcional en tab Créditos › "Cola") | `{ organizationId: number }` | lista `v_outbound_jobs_failed` + botón Reintentar | `GET /api/crm/jobs`, `POST /api/crm/jobs/[id]/retry` |

**Implementado ronda 1 (REG, rutas reales):** `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` (`{ initialTab?: 'general'|'proveedores'|'creditos' }`; la org no se pasa por props: siempre se resuelve en el servidor desde la sesión) · `src/components/configuracion/crm/ProveedoresTab.tsx` (agrupa por `UI_PROVIDER_CATEGORIES`; skeleton ×8, `Alert` destructivo con Reintentar, badge "Solo lectura (administradores)" cuando `can_edit=false`) · `src/components/configuracion/crm/ProviderCard.tsx` (`{ item: ProviderConfigSafe; canEdit; onSave(PutProviderInput); onTest(category, provider) }`: badge Clave propia / Clave de la plataforma / Sin configurar, `Switch` activo, settings desde `SETTING_FIELDS` (modelos, presupuesto, diarización…), "Usar mi clave / Cambiar clave", "Probar conexión" con resultado inline `role=status` y latencia) · `src/components/configuracion/crm/ProviderCredentialForm.tsx` (`Dialog`, inputs `type=password autoComplete=new-password`, nunca muestra valores: placeholder `•••••••••••• (guardada)`, botón Borrar por clave, `aria-describedby`) · `src/components/configuracion/crm/useProviderConfigs.ts` (`{ items, canEdit, loading, error, refresh, save, test }`, `fetch` con `credentials:'include'`, sin react-query) · `src/components/configuracion/crm/CreditosTab.tsx` (KPIs IA/SMS/WA/voz, presupuesto con `Progress` y aviso ≥80 %, gráfico diario `recharts` `BarChart`, tabla por modelo/canal, tabla `provider_pricing`, y monta `JobsMonitor` de `src/components/crm/config/JobsMonitor.tsx` (JOBS) vía `next/dynamic` con skeleton). Sin tabs Telefonía/Email/WhatsApp ni `ComingSoonSection` (tester #16).

Regla (brief, "nada de próximamente"): F0 no entrega ningún componente placeholder; lo que se monta funciona. Si un tab o entrada de nav no tiene implementación, no se renderiza.

### 5.3 Flujo de usuario (admin configura su clave de OpenAI)

1. Configuración → módulo CRM → tab **Proveedores/IA**.
2. Tarjeta "LLM (OpenAI)": Badge "Usa clave de la plataforma". Clic **Usar mi clave** → `ProviderCredentialForm` (campo `OPENAI_API_KEY`).
3. Guardar → `PUT /api/crm/config/providers` → RPC Vault → toast "Clave guardada (sk-…a1b2)". La tarjeta pasa a "Clave propia".
4. Clic **Probar conexión** → `POST …/test` → `models.list` con la clave → toast con latencia; si 401 del proveedor → toast destructivo con "Clave inválida".
5. Ajustar presupuesto mensual → `PUT` con `settings.monthly_budget_usd` → tab Créditos refleja el límite.

### 5.4 Wireframe

```
┌ Configuración › CRM ──────────────────────────────────────────────────────────┐
│ [Proveedores/IA] [Telefonía] [Email] [WhatsApp] [Créditos]                    │
├───────────────────────────────────────────────────────────────────────────────┤
│ Modelos de lenguaje                                    Presupuesto mensual    │
│ ┌ OpenAI ─────────────── ● Clave propia ─┐  ┌ Gemini ──── ○ Plataforma ─┐  │
│ │ Conversación [gpt-5.6-terra ▾]         │  │ Modelo [gemini-3.8-flash ▾]│  │
│ │ Tareas       [gpt-5.6-luna  ▾]         │  │ [Usar mi clave] [Probar]   │  │
│ │ [Cambiar clave] [Probar conexión] [✓]  │  └────────────────────────────┘  │
│ └────────────────────────────────────────┘   USD [ 50 ] ▂▃▅ 62% usado        │
│ Transcripción (STT)  ElevenLabs Scribe v2 ● · fallback Gemini 2.5 Flash      │
│ Voz (TTS)            ElevenLabs flash v2.5 ●                                  │
│ Telefonía            Twilio (cuenta plataforma) ● → detalles en tab Telefonía │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados
- Vacío: sin `provider_configs` → el GET siembra y devuelve 14 filas; nunca se muestra vacío.
- Carga: `Skeleton` por tarjeta (8). Error: `Alert` destructivo con "Reintentar".
- Sin permiso (`canEdit=false`): tarjetas en solo lectura con tooltip "Solo administradores".
- Test en curso: botón con spinner y `aria-busy`.

### 5.6 Accesibilidad
`Tabs` con roving tabindex (Radix); inputs de clave con `autoComplete="off"` y `aria-describedby` del hint; toasts `role=status`; contraste AA en badges (`success`/`warning` de `badge.tsx`); foco devuelto al botón que abrió el diálogo.

### 5.7 Motion
Solo `AnimatePresence` para entrada/salida del diálogo y `layout` en el cambio de badge (respeta `reducedMotion: 'user'` del `MotionProvider` existente).

### 5.8 Responsive / cross-platform
- Grid 1 columna <768px; tarjetas apiladas.
- **Capacitor** (`mobile/android/app/src/main/AndroidManifest.xml`): añadir `<uses-permission android:name="android.permission.RECORD_AUDIO"/>` y `MODIFY_AUDIO_SETTINGS` (bloque "permisos peligrosos"). `mobile/templates/Info.plist`: `NSMicrophoneUsageDescription` = "GO Admin usa el micrófono para llamadas desde la app". F5 decide plugin nativo vs bridge.
- **Electron** (`electron/src/main/index.ts` tras `session.defaultSession.setSpellCheckerEnabled(false)` :52): `session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['media','notifications','clipboard-read'].includes(permission)))` y `setPermissionCheckHandler` equivalente restringido al origin `NEXT_PUBLIC_APP_URL`.
- **PWA**: según `docs-twilio-voice.md`, el Voice JavaScript SDK **no soporta** WebView ni PWA instalada (ni escritorio ni móvil); F0 no promete softphone en PWA. En PWA el flujo de llamada es el bridge de 2 patas (F5) o `tel:` con registro manual; el softphone WebRTC queda para Web (pestaña normal) y Electron (`@twilio/voice-sdk` compatible con Electron). `platformCapabilities.ts` (F3/F15) expone `canUseWebRtc()` para ocultar la opción "Navegador" cuando `display-mode: standalone` o `Capacitor.isNativePlatform()`.

---

## 6. Integración con proveedores (solo lo que F0 toca)

| Proveedor | Llamada exacta usada por `testProvider` | Límite/gotcha |
|---|---|---|
| OpenAI | `new OpenAI({apiKey}).models.list()` | 7.x Node ≥22; `store` true por defecto → `store:false` en fases IA |
| Gemini | `new GoogleGenAI({apiKey}).models.list()` | fijar `^2.21.0` |
| ElevenLabs | `new ElevenLabsClient({apiKey}).user.get()` | keys con scope; sin scope de voces la prueba pasa pero F6 fallará: la prueba lista también `voices.search({pageSize:1})` |
| Twilio | `twilio(apiKeySid, apiSecret, {accountSid}).api.v2010.accounts(accountSid).fetch()`; con Auth Token `twilio(accountSid, authToken)` | subcuentas máx 1000; webhooks exigen Auth Token (no API Key) |
| Resend | `new Resend(key).domains.list()` | 10 req/s; key `sending_access` restringida a `domain_id` (F7) |
| Meta | `GET https://graph.facebook.com/v26.0/{WABA_ID}?fields=id,name` Bearer token del canal | token de System User; Embedded Signup existente (`oauth/callback`) |
| Supabase Vault | `vault.create_secret(secret, name, description)`, `vault.update_secret(id, secret)`, vista `vault.decrypted_secrets` | solo roles con acceso al schema `vault` (postgres/service_role vía SECURITY DEFINER); nunca exponer la vista por PostgREST |

---

## 7. Multi-tenant y seguridad (checklist por endpoint y hallazgo cerrado)

| Endpoint / archivo | Cambio | Cierra |
|---|---|---|
| `orgContext.ts:85-93` | `getServiceClient()` + `.maybeSingle()`; nuevos kinds | C0 voz |
| `orgContext.ts:53-66` | header/cookie/last_org_id; 400 si ambiguo | C21 msg |
| `chat/ai/auto-response`, `ai-assistant/*` (8 rutas), `chat/ai/{generate-response,classify-intent,generate-summary}` | `withOrg`; org de `ctx`; `consumeAICredits` vía RPC `decrement_ai_credits` con `ctx.organizationId` | C-A, C-B, C-10 |
| `ai-assistant/dynamic-options:6` | eliminar JWT literal; `ctx.supabase` | C-D |
| `twilio/verify/{send,check}` | sesión + rate limit (`Map` en memoria por instancia + `comm_usage_logs` como contador persistente: máx 3 envíos / 10 min por `to` y por user) | C1 msg |
| `whatsapp/{send,mark-read,validate}`, `qr/{send,start,stop,logout,status}` | `withOrg`; `channels.organization_id = ctx.organizationId` obligatorio | C2, C11 msg |
| `twilio/{send-whatsapp,send-sms}` | `withOrg`; orgId de ctx | C4 msg |
| `sendgrid/send`, `notifications/process` | `withOrg`; `integration_connections.organization_id` verificado | C5 msg |
| `whatsapp/webhook` | `verifyMetaSignature` por canal, fail-closed | C3 msg |
| `sendgrid/webhook:31-38,60-74` | firma obligatoria; org por `connection_id` del evento, sin `connections[0]` | C6 msg |
| `voice/*` (8 rutas), `integrations/twilio/{voice/incoming,status-callback,incoming-message}` | `verifyTwilioWebhook` (403 sin firma/token; producción y dev por igual) | C12, C13, C-E |
| `twilioConfig.ts:83` + 7 call sites | `getWebhookBaseUrl()` origin puro; rutas `${origin}/api/voice/...` | C2 voz, C-8 |
| `integrations/twilio/voice/incoming:131-140`, `conversationRelayHandler:493-502`, `twilioWebhook:152-163` | eliminar fallback; org no resuelta ⇒ `<Response><Say language="es-MX" voice="Polly.Mia-Neural">Número no configurado.</Say><Hangup/></Response>` + `integration_events` | C11, C-G, C22 msg |
| `integrations/twilio/voice/incoming` | queda como **redirect TwiML** (`<Redirect method="POST">{origin}/api/voice/twiml/inbound</Redirect>`) un release; se elimina en F3. El único inbound es `/api/voice/twiml/inbound` (resuelve por `phone_numbers`, español) | duplicado inbound |
| `bridge/status:121,134`, `agent-leg:63-68`, `customer-leg:61-65`, `ai-agent:63-68,84-91` | añadir `.eq('organization_id', orgId)` (org de `verifyTwilioWebhook` o de la fila de bridge) | C14 voz, C-F |
| `followup/run` + `followupEngineService` | eliminar | C-C, C24 |
| `ws-server.ts:41-48` | firma en upgrade + token sesión | C22 voz |
| `automationService:534-547` | allow-list | C-H |
| `twilioService:9`, `twilioWebhook:9`, `notificationService`, `twilioSubaccounts:9`, `aiSettingsService`, `commCreditsService` (usados en server) | `getServiceClient()` o cliente de `ctx` | C9, C15 |
| `chatChannelsService:192-241`, `src/components/chat/channels/whatsapp/id/WhatsAppCredentialsCard.tsx:39-42`, `sendgridService:29-49`, `providerRegistry:57-73` | columnas revocadas + Vault; UI lee `v_provider_configs_safe` | C8 |
| `comm_settings_select` | política `authenticated` + `is_active` | endurecimiento |
| `webhooks/facebook/[channelId]:43-53`, `webhooks/instagram/[channelId]:43-52`, `integrations/meta/webhook:54-56` | ya verifican con `metaMessagingService.verifySignature`; se mantienen y entran en la allow-list del guardarraíl #7 (§9.1) hasta que F16 unifique en `verifyMetaSignature` | (referencia para C3 msg) |
| `provider_configs` (BD) | `REVOKE INSERT, UPDATE, DELETE ON provider_configs FROM authenticated`; escrituras solo vía `PUT /api/crm/config/providers` (service role + check de rol admin) → M6 (tester F00 r1 #3) | privilegio excesivo |
| `channel_credentials.credentials` (BD) | **no vaciar en F0**: `channel-dispatch/index.ts:192-195`, `whatsappCloudService.ts:53-58,76-79` y `webhooks/facebook|instagram/[channelId]:25,53` filtran por `credentials->>phone_number_id` y `channel_credentials.metadata` no existe; el cifrado de esta tabla se pospone a F16 con columna en claro `phone_number_id` + `fn_get_channel_secret` (tester F00 r1 #1, #12) | evita romper el path vivo |
| `qr/dispatch-pending` + polling `bandeja/page.tsx:57-67` | eliminar la ruta y el polling; el despacho pendiente de Baileys pasa a job `whatsapp_qr_dispatch` en la cola (tester F00 r1 #4) | C10 msg |
| **Hallazgo nuevo H1**: `cron.job` id 4 (`mantener-datos-reales-diarios`, `0 2 * * 1-6`) contiene un JWT `service_role` en texto plano (`length(command)=757`; verificado de nuevo 2026-09-08 21:52 UTC, `ANEXO-C` §1.4) | **rotación de la service key por el dueño** (Supabase → Settings → API), actualizar Vercel/Railway/Edge Function; F0-DB reescribe el job para leer el secreto desde Vault (`fn_crm_cron_post`-style); verificación en §3.3: `select count(*) from cron.job where command ilike '%eyJ%'` = 0 | fuera de CRM pero bloqueante de seguridad |
| **Hallazgo nuevo H2**: `crm-documents` (privado, 2026-09-01) sin ninguna política en `storage.objects` (44 políticas existentes, ninguna para este bucket; `ANEXO-C` §1.4) | **F0-DB (M3)** añade `crm_documents_select/insert/delete` con el patrón `org_{id}/` de `crm-call-recordings`; F9 lo prueba subiendo/descargando desde el drawer | bucket inutilizable para miembros |

Reglas transversales: `runtime = 'nodejs'` en todos los webhooks (raw body); ningún `console.log` de payloads con PII; `integration_events` registra cada rechazo de firma con `request_id`.

#### 7.1 Estado real tras ronda 1 (SEC) — verificación por endpoint

| Endpoint | Auth implementada | Prueba (sin credenciales) | Cierra |
|---|---|---|---|
| `POST /api/integrations/twilio/verify/{send,check}` | sesión + rate limit 5/10 min (IP, user, número) + ownership del número (`purpose:'mobile_verification'`) | `curl` sin cookie → **401** (verificado local) | C1 msg |
| `POST /api/voice/*` (8) y `POST /api/integrations/twilio/{voice/incoming,status-callback,incoming-message}` | `verifyTwilioWebhook` (token por AccountSid; URL desde origin) | `curl` sin `X-Twilio-Signature` → **403** (verificado local) | C12, C13, C-E |
| `POST /api/integrations/whatsapp/webhook` | `verifyMetaSignature` fail-closed (canal o `META_APP_SECRET`) | firma inválida → **403** (verificado local) | C3 msg |
| `GET /api/integrations/whatsapp/webhook` | `WHATSAPP_VERIFY_TOKEN` obligatorio (antes tenía default literal) | sin env → 403 | endurecimiento |
| `POST /api/integrations/whatsapp/qr/dispatch-pending` | `verifyCronSecret` fail-closed; polling del browser eliminado (`bandeja/page.tsx`, `WhatsAppQrCard.tsx`) | sin Bearer → **401** (verificado local) | C10 msg |
| `POST /api/integrations/whatsapp/{send,mark-read,validate}`, `qr/*` | sesión + canal de la org (`requireOwnedChannel`) | sin sesión → 401/307 (middleware) | C2, C11, C12, C20 msg |
| `POST /api/chat/ai/*`, `/api/ai-assistant/*` | sesión + org de ctx (body solo si coincide) | sin sesión → 401/307 | C-A, C-B, C-D |
| `POST /api/integrations/twilio/send-*`, `GET credits/usage` | sesión; orgId del body/query ignorado | sin sesión → **401** (verificado local) | C4 msg |
| `POST /api/integrations/sendgrid/send`, `/api/notifications/process` | sesión; `connection_id` de la org | sin sesión → 401/307 | C5 msg |
| `POST /api/integrations/sendgrid/webhook` | firma ECDSA obligatoria (403 sin `SENDGRID_WEBHOOK_VERIFICATION_KEY`/cabeceras); conexión SOLO por `email.send` previo | — | C6 msg |
| `/api/crm/followup/run` | **eliminado** (404) | — | C-C, C24 |
| ws-server `/conversation-relay` | token `?st=` + `X-Twilio-Signature` en upgrade + token en `setup` | sin token → HTTP 401 en handshake | C22 voz |
| `update_field` (automationService) | allow-list + tipos | unit test pendiente F8 | C-H |

Middleware (`src/middleware.ts`): se añadieron `/api/voice/` y `/api/integrations/whatsapp/qr/dispatch-pending` a `skipPatterns` y al `matcher` (los handlers hacen su propia auth fail-closed). Sin esto el middleware respondía **307 → /auth/login** a los webhooks de voz de Twilio (hallazgo nuevo H3). Pendiente (REG): `/api/integrations/sendgrid/webhook` sigue detrás del middleware (307) y `/api/email/webhook` no está excluido.

---

## 8. Créditos, costos y límites

- F0 no debita nada nuevo; deja las piezas: `provider_pricing` + `fn_unit_cost`, `settings.monthly_budget_usd` en `provider_configs(llm)`, y `GET /api/crm/config/credits` que suma `ai_usage_logs.credits_consumed` y `comm_usage_logs` del mes.
- Regla obligatoria para F3–F16 (guardrail #7 futuro): antes de llamar a un proveedor se ejecuta el RPC atómico (`decrement_ai_credits` / `deduct_comm_credits`) y el `cost_amount` se calcula con `fn_unit_cost(provider, sku)`; nunca precios hardcodeados (hoy `openaiService.ts:337-345`).
- Alertas: `CreditsTab` muestra aviso al 80% y bloqueo al 100% del presupuesto (`monthly_budget_usd`); el runner marca `JobFatalError('budget_exceeded')` (no reintentable) cuando el handler lo detecta.
- Costo de F0 en proveedores: 0 (solo `models.list`/`domains.list` en pruebas de conexión, gratuitos).

---

## 9. Pruebas

### 9.1 Unitarias (jest, `src/__tests__` y `src/lib/**/__tests__`)
- `guardrails.test.ts` (ampliado, ver §0.8): (1) org=1; (2) tablas plataforma; (3) display_order; (4) callService; **(5) ningún archivo bajo `src/app/api/**` usa `organizationId`/`organization_id` del body** (regex `body\??\.(organizationId|organization_id)|\{[^}]*organization(Id|_id)[^}]*\}\s*=\s*(await\s+)?(req|request)\.json\(\)`) salvo allow-list explícita vacía; **(6) ningún archivo en `src/app/api/**`, `src/lib/services/**` (salvo lista `CLIENT_ONLY_SERVICES`) ni `ws-server.ts` importa `@/lib/supabase/config`**; **(7) todo `route.ts` bajo rutas webhook (`/api/voice/**`, `/api/integrations/twilio/**`, `/api/integrations/whatsapp/webhook`, `/api/email/webhook`, `/api/webhooks/**`) importa uno de `verifyTwilioWebhook|verifyMetaSignature|verifyResendWebhook|verifyElevenLabsWebhook|withCron`, con allow-list explícita `WEBHOOK_VERIFIER_ALLOWLIST = ['src/app/api/webhooks/facebook/[channelId]/route.ts', 'src/app/api/webhooks/instagram/[channelId]/route.ts', 'src/app/api/integrations/meta/webhook/route.ts']` que ya verifican con `metaMessagingService.verifySignature` (tester F00 r1 #17); la allow-list se vacía cuando F16 unifique en `verifyMetaSignature`**; **(8) ningún `.from('comm_settings')` seguido de `.limit(1)`/`.single()` sin `.eq('organization_id'` en el mismo encadenamiento**; **(9) ningún `.from('activities').insert(` con `activity_type:` literal fuera de `ACTIVITY_TYPES`**; **(10) `enums.ts` coincide con los CHECKs**: test que lee un snapshot `src/lib/crm/__fixtures__/db-checks.json` (generado por `scripts/dump-checks.sql` vía MCP y commiteado) y compara arrays.
- `orgContext.test.ts`: header válido/no miembro (403), cookie, sin indicación con 1 y con 2 membresías (200/400), `resolveOrgFromExternal` desconocido (404, sin fallback).
- `verifyTwilio.test.ts`: firma válida master, firma válida subcuenta (token desde mock Vault), AccountSid desconocido (403), `TWILIO_WEBHOOK_BASE_URL` con path (throw), URL con query.
- `verifyMeta.test.ts`: `timingSafeEqual` con longitudes distintas no lanza; firma válida/inválida.
- ~~`queue.test.ts`~~ → real: `src/lib/jobs/__tests__/{runner,runnerTimeout,handlers,eventDispatcher,scheduler,runRoute,jobsService}.test.ts` (44 casos, r2): `runJobs` respeta deadline y libera con `fn_release_job`/fallback, handler ausente ⇒ **`failed`** (terminal, no `dead`), `JobRetryableError(retryAfterSeconds)` ⇒ `fn_fail_job` con delay, kinds inválidos ⇒ no reclama / ruta 400, productor `maintenance`/`recording_cleanup`, roles y redacción de `GET /api/crm/jobs`, retry con dedupe reutilizado.
- `enums.test.ts`: `mapTwilioCallStatus` para los 9 valores + desconocido ⇒ `failed`.
- `providerRegistry.test.ts`: merge Vault→env; `provider:'none'` inactivo cuando no hay nada; `setProviderCredentials` nunca escribe `credentials` en la tabla.

### 9.2 Integración (mocks con payloads reales)
- Twilio status callback (form: `CallSid, AccountSid, CallStatus=no-answer, SequenceNumber, Timestamp`) → 403 sin firma; con firma → `calls.status='no_answer'`.
- Meta webhook (`entry[].changes[].value.statuses[]`) con `X-Hub-Signature-256` correcta/incorrecta.
- Resend `email.delivered` con headers svix válidos y con secreto ausente (401).
- `POST /api/crm/jobs/run` sin header → 401; con header y 3 jobs `noop` → `{claimed:3, done:3}`; dos llamadas concurrentes → suma `claimed` = 3.
- `PUT /api/crm/config/providers` como miembro no admin → 403; como admin → fila con `credentials='{}'`, `secret_id` no nulo, `has_credentials=true` en la vista; `GET` nunca contiene la clave.
- SQL: `SELECT credentials FROM provider_configs` como `authenticated` ⇒ `permission denied`.

### 9.3 E2E manual (org de prueba `organization_id = 7`)
1. Login con usuario de 2 orgs; cambiar org en el selector → cookie `goadmin_org_id` cambia → `GET /api/crm/config/providers` devuelve filas de esa org.
2. Configuración › CRM › Proveedores: guardar clave OpenAI de prueba → probar → toast OK; en Supabase `vault.secrets` aparece `pc:7:llm:openai`.
3. `SELECT fn_enqueue_job(105,'noop','{}')` → en ≤60 s `status='done'` sin intervención (pg_cron activo). Smoke oficial (DB-r2 ya admite `noop`): `npx tsx scripts/crm-jobs-smoke.ts --kind noop --org 105 [--url http://localhost:3000]` → `?kind=bogus` 400, sin header 401, con Bearer 200, job `done`, y borra sus filas al terminar (`--keep` para conservarlas); `--kind maintenance` añade `scheduled.maintenance`; `--kind crm_event` deja el evento `skipped`.
4. Mover una oportunidad de etapa en el Kanban → fila en `crm_events` `pending` → tras el minuto `processed`/`skipped`.
5. `curl -X POST https://app.goadmin.io/api/voice/status -d 'CallSid=CAxxx'` sin firma → 403.
6. `curl -X POST …/api/crm/jobs/run` sin Bearer → 401.
7. `npm run build` con `TWILIO_WEBHOOK_BASE_URL=https://app.goadmin.io/api/integrations/twilio` → el primer webhook responde 500 con mensaje claro (config inválida), no 404 silencioso.

### 9.4 Casos borde (≥10)
1. Usuario con membresía inactiva envía `X-Organization-Id` de esa org → 403.
2. Header y cookie contradictorios → gana el header.
3. `AccountSid` de subcuenta cuya org fue eliminada → token null → 403 (no 500).
4. Webhook Twilio con `bodySHA256` (JSON) → se usa `validateRequestWithBody`.
5. Job cuyo handler tarda >45 s → abortado, `fn_fail_job` retryable.
6. Dos runners simultáneos (pg_cron + Vercel) → `SKIP LOCKED` evita doble ejecución; `dedupe_key` evita doble encolado.
7. `fn_fail_job` con `attempts = max_attempts` → `dead`, `completed_at` fijado.
8. Reclaim: job `running` con `locked_at` de hace 15 min → vuelve a `queued` sin sumar intento extra en el reclaim (el claim posterior sí suma).
9. `PUT providers` con `provider` no soportado para la categoría (`whatsapp` + `openai`) → 422.
10. `fn_seed_provider_configs` ejecutado dos veces → 0 filas nuevas (ON CONFLICT DO NOTHING).
11. Secreto Vault borrado a mano → `fn_get_provider_secret` devuelve `credentials='{}'` → fallback env y warning en log.
12. `vault.create_secret` con nombre duplicado (`pc:…`) → `update_secret` en su lugar (la función lo maneja por `secret_id`).
13. Meta envía firma con longitud distinta (cabecera truncada) → `timingSafeEqual` no lanza, devuelve false.
14. `TWILIO_WEBHOOK_BASE_URL` con barra final `https://app.goadmin.io/` → `URL.origin` la normaliza (válido).

---

## 10. Definition of Done

- [ ] Las 9 migraciones aplicadas; las consultas de §3.3 devuelven exactamente lo esperado.
- [ ] `has_column_privilege('authenticated','provider_configs','credentials','SELECT')` = false; ídem `comm_settings.twilio_subaccount_auth_token` y `channel_credentials.credentials`.
- [ ] `cron.job` contiene `crm-jobs-every-minute`, `crm-campaigns-5min`, `crm-daily-maintenance`. Como `pg_net` solo encola la petición, `cron.job_run_details.status='succeeded'` **no prueba nada** (tester F00 r1 #10): la verificación es `select status_code, count(*) from net._http_response where created > now() - interval '15 minutes' group by 1` → solo `200`, y `outbound_jobs` con el job `noop` en `done`. Horarios: `cron.timezone` es GMT, así que `30 3 * * *` = 22:30 Bogotá del día anterior; documentar en `FASE-00` §3.1/M8 y usar `30 8 * * *` (03:30 Bogotá) para el mantenimiento diario.
- [ ] `POST /api/crm/jobs/run` sin Bearer → 401; con Bearer y job `noop` → `done` en ≤60 s; la ruta declara `export const maxDuration = 60` (deadline interno 50 s; requiere plan Vercel Pro o superior, documentado en §4.4).
- [ ] Un `curl` sin firma a cada uno de los **13** webhooks (Twilio: `voice/status`, `voice/recording`, `twiml/outbound`, `twiml/inbound`, `twiml/agent-leg`, `twiml/customer-leg`, `twiml/ai-agent`, `bridge/status`, `integrations/twilio/status-callback`, `integrations/twilio/incoming-message`, `integrations/twilio/voice/incoming` (redirect); Meta: `integrations/whatsapp/webhook`; Resend: `email/webhook`) responde 401/403 (tabla en el PR; tester F00 r1 #21).
- [ ] `grep -rn "limit(1)" src | grep comm_settings` sin resultados fuera de tests; `grep -rn "@/lib/supabase/config" src/app/api src/lib/services ws-server.ts` solo en `CLIENT_ONLY_SERVICES`.
- [ ] `guardrails.test.ts` pasa con las 10 reglas; `npm test`, `npm run lint`, `tsc --noEmit` limpios.
- [ ] `package.json` `engines.node >=22`, versiones de §4.7; Railway despliega `node:22-slim` con `npm ci` y `/health` responde; `ws-server` rechaza un upgrade sin `st` con 401.
- [ ] `.env.example` contiene todas las variables de §4.6; Vercel y Railway tienen `TWILIO_WEBHOOK_BASE_URL` = origin puro y `WS_PUBLIC_URL`.
- [ ] Nav CRM muestra Llamadas y Leads (y las nuevas entradas detrás del flag); `moduleConfig.ts` y `AppLayout.tsx` derivan de `CRM_NAV`.
- [ ] Tab Proveedores/IA y Créditos operativos: guardar/probar clave, presupuesto, tabla de precios (25 filas).
- [ ] Archivos de §12 "eliminar" ya no existen; `AndroidManifest.xml` e `Info.plist` con permisos de micrófono; Electron con `setPermissionRequestHandler`.
- [ ] Hallazgo H1 (JWT en `cron.job` 4) resuelto y service key rotada.
- [ ] Cero `.sql` nuevos en el repo.

Métricas de éxito: 0 webhooks aceptados sin firma en `integration_events` durante 7 días; latencia media de `jobs/run` < 5 s con cola vacía; 100% de rutas `/api` con `withOrg`/`withCron`/`verify*` (guardrail).

---

## 11. Riesgos y decisiones

| Decisión | Por qué X y no Y |
|---|---|
| Vault en vez de pgsodium/AES en app | Vault ya está instalado (0.3.1) y gestiona la clave raíz; pgsodium no está instalado y AES en app obliga a custodiar `ENCRYPTION_KEY` en dos runtimes (Vercel+Railway) |
| Privilegios de columna + vista `security_invoker` en vez de mover secretos a otra tabla | Mínimo cambio de schema; `select('*')` desde el browser falla ruidosamente (permiso) en vez de filtrar datos; la vista mantiene la DX |
| Adaptar el código a los CHECKs de `calls` (no al revés) | Los CHECKs de BD son coherentes (snake_case) y los usa `fn_call_quality`; cambiar la BD rompería la RPC y el V3 ya desplegado |
| pg_cron+pg_net → HTTP al runner (no Edge Function ni worker Railway) | Reusa Vercel (código y secretos ya allí), sin nuevo servicio; Vercel cron como respaldo si pg_net falla; 50 s de deadline cubre lotes de 25 |
| `FOR UPDATE SKIP LOCKED` en RPC SECURITY DEFINER solo para `service_role` | Evita exponer la cola por PostgREST a usuarios; el runner es el único cliente |
| Org activa por header+cookie (no JWT claim) | El JWT de Supabase no lleva `organization_id` (`current_org_id()` devuelve NULL para usuarios normales); cambiar claims exige hook de auth y re-login masivo |
| Eliminar `followupEngineService` en F0 (no en F8) | Es fail-open y escribe con cliente browser; mantenerlo un ciclo más es riesgo puro; su única fila legacy se migra en F8 desde `automations` |
| Node 22 | Ver §4.7 |
| Inbound único en `/api/voice/twiml/inbound` | Resuelve por `phone_numbers` (multi-tenant real) y está en español; el de `integrations/twilio` tiene fallback cross-tenant y `en-US` |
| No crear `customers.do_not_call` | Los opt-outs por canal viven en `contact_consents` (D4); una columna booleana duplicaría la verdad |
| Riesgo: revocar `SELECT` en `comm_settings` rompe `select('*')` existentes | Mitigación: grep de `.from('comm_settings')` (twilioSubaccounts, commCreditsService, UI créditos) y cambio a lista explícita de columnas en el mismo PR |
| Riesgo: `trg_opp_stage_change_enqueue` con `auth.uid()` NULL desde service role | `actor_user_id` nullable; el payload lleva el contexto necesario |
| Riesgo: pg_net sin `timeout_milliseconds` en versiones antiguas | pg_net 0.14 lo soporta (verificado versión instalada) |
| Sin softphone WebRTC en PWA/WebView (no placeholder) | `docs-twilio-voice.md` es explícito: el Voice JS SDK no soporta WebView ni PWA. Mejor ocultar la opción "Navegador" con `platformCapabilities.canUseWebRtc()` que prometer algo que falla en la primera llamada; el bridge de 2 patas (F5) cubre móvil |
| `withCron` como único nombre público del guard de cron | El tester r1 encontró `verifyCronSecret` y `withCron` usados como sinónimos; queda `withCron(handler)` (wrapper en `src/lib/api/withOrg.ts`) como API y `verifyCronSecret(req)` solo como función interna no exportada, para que el guardarraíl #7 tenga un único identificador que buscar |
| `dedupe_key` UNIQUE global impedía re-encolar tras `done`/`dead` | Índice parcial `UNIQUE (dedupe_key) WHERE status IN ('queued','running')` (tester F00 r1 #5); `fn_fail_job`/`fn_complete_job` exigen `status='running' AND locked_by=p_worker` (#6). Ya reflejado por F0-DB: las RPC desplegadas llevan `p_worker` (`ANEXO-C` §1.3) |
| Precios `verified=true` sin fuente explícita en M7 | Regla: solo `verified=true` si el valor aparece en un `docs-*.md` con fecha; `voice_in_local_co`, `recording_storage` y `amd` están en `docs-twilio-voice.md` (tester #18); el resto de filas marcadas `true` sin cita pasan a `false` hasta que DB las contraste |
| Org E2E `organization_id = 7` sin miembros ni `comm_settings` | Usar una org con miembros activos y `comm_settings` (105, 106 o 110 según el tester); §9.3 la actualiza el agente que ejecute el E2E |
| `@sentry/nextjs` no instalado y `sentry.server.config.ts` no-op | No instalar `@sentry/nextjs` en F0; `src/lib/observability/log.ts` usa `console` estructurado + `integration_events`; Sentry queda como riesgo aceptado hasta F15 |

---

## 12. Archivos tocados y orden de PRs

### Crear
`src/lib/supabase/service.ts` · `src/lib/api/withOrg.ts` · `src/lib/api/apiClient.ts` · `src/lib/crm/enums.ts` · `src/lib/crm/__fixtures__/db-checks.json` · `src/lib/jobs/queue.ts` · `src/lib/jobs/handlers/{noop,crmEvent,maintenance}.ts` · `src/lib/observability/log.ts` · `src/lib/webhooks/{verifyTwilio,verifyMeta,verifyResend,verifyElevenLabs}.ts` · `src/lib/services/integrations/twilio/twilioAccounts.ts` · `src/lib/services/integrations/twilio/voiceAgent/wsAuth.ts` · `src/app/api/crm/jobs/run/route.ts` · `src/app/api/crm/jobs/route.ts` · `src/app/api/crm/jobs/[id]/retry/route.ts` · `src/app/api/crm/config/providers/route.ts` · `src/app/api/crm/config/providers/test/route.ts` · `src/app/api/crm/config/credits/route.ts` · `src/config/crmNav.ts` · `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` · `.../providers/{ProvidersAiTab,ProviderCard,ProviderCredentialForm}.tsx` · `.../providers/useProviderConfigs.ts` · `.../credits/CreditsTab.tsx` · `src/components/crm/jobs/JobsMonitor.tsx` · `src/components/shared/ComingSoonSection.tsx` · tests de §9.1.

**Creados en ronda 1 (JOBS, real):** `src/lib/jobs/types.ts` · `src/lib/jobs/registry.ts` · `src/lib/jobs/enqueue.ts` · `src/lib/jobs/runner.ts` · `src/lib/jobs/handlers/{index,noop,crmEvent,maintenance}.ts` · `src/lib/jobs/dispatch/eventDispatcher.ts` · `src/lib/jobs/dispatch/listeners/stageChangedActivity.ts` · `src/lib/jobs/__tests__/{runner,eventDispatcher}.test.ts` · `src/lib/services/crm/jobsService.ts` · `src/app/api/crm/jobs/run/route.ts` · `src/app/api/crm/jobs/route.ts` · `src/app/api/crm/jobs/[id]/retry/route.ts` · `src/components/crm/config/JobsMonitor.tsx` (ruta real; no `crm/jobs/`) · `scripts/crm-jobs-smoke.ts`. **Modificados (JOBS):** `vercel.json` (3 crons `/api/crm/jobs/run`: `* * * * *`, `*/5 * * * *`, `30 8 * * *`) · `src/middleware.ts` (`/api/crm/jobs/run` en `skipPatterns` y `matcher`) · `src/lib/crm/enums.ts` (`JOB_KINDS` + `recording_fetch`).
**Ronda 2 (JOBS, real).** Creados: `src/lib/jobs/scheduler.ts` · `src/components/crm/config/JobsTable.tsx` · `src/lib/jobs/__tests__/{scheduler,runRoute,jobsService}.test.ts` (+ `handlers`/`runnerTimeout` del tester r1). Modificados: `src/lib/jobs/{runner,types,enqueue}.ts` · `src/lib/jobs/handlers/{maintenance,crmEvent}.ts` · `src/lib/services/crm/jobsService.ts` · `src/app/api/crm/jobs/{run/route,route,[id]/retry/route}.ts` · `src/app/api/crm/sequences/run/route.ts` (solo `verifyCronSecret`) · `src/components/crm/config/JobsMonitor.tsx` · `scripts/crm-jobs-smoke.ts` · `src/lib/jobs/__tests__/{runner,handlers}.test.ts`.

### Modificar
`src/lib/utils/orgContext.ts` · `src/lib/services/providerRegistry.ts` · `src/lib/services/integrations/twilio/{twilioConfig,twilioWebhook,twilioService}.ts` · `src/lib/services/{notificationService,aiCreditsService,aiSettingsService,commCreditsService}.ts` · `src/lib/services/crm/{automationService,callManagementService,recordingStorageService,transcriptionService,callAnalysisService,mobileBridgeService,voiceAgentService}.ts` (solo tipos → `enums.ts` y `getServiceClient`) · `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` (:493-502 y firma de `handleConversationRelayConnection(ws, session)`) · `src/lib/services/integrations/whatsapp/whatsappCloudConfig.ts` · `src/lib/services/chatChannelsService.ts` · `src/lib/services/integrations/sendgrid/sendgridService.ts` · `ws-server.ts` · `ws-server.Dockerfile` · `railway.toml` · `package.json` · `vercel.json` (cron respaldo `/api/crm/jobs/run` `*/5 * * * *`) · `.env.example` · `src/middleware.ts` (excluir `/api/crm/jobs/run` y `/api/email/webhook` del matcher; **quitar** la exclusión general de `/api/integrations/twilio/` y dejar solo los webhooks: `voice/incoming`, `status-callback`, `incoming-message`) · `src/app/api/{ai-assistant/**,chat/ai/**,integrations/twilio/**,integrations/whatsapp/**,integrations/sendgrid/**,notifications/process,voice/**,email/webhook}/route.ts` · `src/app/api/integrations/twilio/voice/incoming/route.ts` (redirect TwiML) · `src/components/app-layout/AppLayout.tsx:122-139` · `src/config/moduleConfig.ts:136-141` · `src/components/configuracion/panels/crm/CRMConfigPanel.tsx` · `src/components/chat/channels/WhatsAppCredentialsCard.tsx` · `src/__tests__/guardrails.test.ts` · `mobile/android/app/src/main/AndroidManifest.xml` · `mobile/templates/Info.plist` · `electron/src/main/index.ts`.

### Eliminar
`src/lib/services/callService.ts` · `src/lib/services/integrations/twilio/voiceAgent/{realtimeSession,elevenLabsTTS,deepgramSTT,voiceAgentService}.ts` · `src/app/api/integrations/twilio/voice/media-stream/route.ts` · `src/components/crm/pipeline/EmailNotifications.ts` y `.tsx` · `src/components/crm/pipeline/AutomationSettings.tsx` · `src/lib/services/crm/followupEngineService.ts` · `src/app/api/crm/followup/run/route.ts` · `src/lib/services/integrations/twilio/twilioSubaccounts.ts` (sustituido por `twilioAccounts.ts`) · `src/app/api/ai-assistant/dynamic-options` (JWT) se conserva pero saneado. `KanbanBoard/KanbanColumn/OpportunityCard` se eliminan en F9 tras portar gates/realtime/WonCloseModal (no en F0).

**Ronda 1 (REG, real).** Creados: `src/lib/crm/providerCatalog.ts` · `src/lib/services/providerCredentials.server.ts` · `src/lib/services/crm/pricingService.ts` · `src/lib/services/crm/aiCostService.ts` · `src/app/api/crm/config/providers/route.ts` · `src/app/api/crm/config/providers/test/route.ts` · `src/app/api/crm/config/credits/route.ts` · `src/config/crmNav.ts` · `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` · `src/components/configuracion/crm/{ProveedoresTab,ProviderCard,ProviderCredentialForm,CreditosTab}.tsx` · `src/components/configuracion/crm/useProviderConfigs.ts` · `src/lib/services/__tests__/{providerRegistry,pricingService,aiCostService}.test.ts`. Modificados: `package.json` (deps + `engines`), `package-lock.json`, `.env.example`, `ws-server.Dockerfile`, `src/lib/services/providerRegistry.ts`, `src/lib/services/aiCreditsService.ts`, `src/components/configuracion/layout/ConfiguracionPanelRenderer.tsx`, `src/components/app-layout/AppLayout.tsx`, `src/config/moduleConfig.ts`, `src/components/crm/pipeline/OpportunityAutomations.tsx`, `src/lib/services/integrations/twilio/voiceAgent/index.ts`. Eliminados: `src/lib/services/integrations/twilio/voiceAgent/{realtimeSession,elevenLabsTTS,deepgramSTT,voiceAgentService}.ts`, `src/components/crm/pipeline/EmailNotifications.ts`, `src/components/crm/pipeline/EmailNotifications.tsx`, `src/components/crm/pipeline/AutomationSettings.tsx`. No creados (plan → realidad): `ComingSoonSection.tsx` (prohibido), `.../providers/ProvidersAiTab.tsx` → `ProveedoresTab.tsx`, `.../credits/CreditsTab.tsx` → `CreditosTab.tsx`, `src/lib/supabase/service.ts` → `server-service.ts` (SEC), `apiClient.ts` (no necesario: los `fetch` usan la cookie de sesión y la org se resuelve en el servidor; la cita `src/lib/supabase/config.ts:130` del plan es incorrecta, `currentOrganizationId` está en `:773`/`:864`). `railway.toml` sin cambios (healthcheck `/health` ya presente).

### Archivos reales tocados en ronda 1 (SEC)

**Creados**: `src/lib/supabase/server-service.ts` · `src/lib/supabase/server-user.ts` · `src/lib/crm/enums.ts` · `src/lib/crm/__fixtures__/db-checks.json` · `src/lib/security/webhookSignatures.ts` · `src/lib/security/rateLimit.ts` · `src/lib/security/wsSessionToken.ts` · `src/app/api/integrations/whatsapp/qr/_shared.ts` · tests: `src/lib/security/__tests__/{webhookSignatures,rateLimit,wsSessionToken}.test.ts`, `src/lib/crm/__tests__/enums.test.ts`.

**Modificados**: `src/lib/utils/orgContext.ts` (reescrito) · `src/app/api/chat/ai/{auto-response,classify-intent,generate-response,generate-summary}/route.ts` · `src/app/api/ai-assistant/{improve-text,generate-image,pm-assist,pm-planner,seo-keywords,chat,reportes,dynamic-options}/route.ts` · `src/app/api/integrations/twilio/{verify/send,verify/check,send-sms,send-whatsapp,credits,usage,status-callback,incoming-message,voice/incoming}/route.ts` · `src/app/api/integrations/whatsapp/{send,mark-read,validate,webhook}/route.ts` · `src/app/api/integrations/whatsapp/qr/{start,stop,status,logout,send,mark-read,dispatch-pending}/route.ts` · `src/app/api/integrations/sendgrid/{send,webhook}/route.ts` · `src/app/api/notifications/process/route.ts` · `src/app/api/voice/{status,recording,bridge/status,twiml/outbound,twiml/inbound,twiml/agent-leg,twiml/customer-leg,twiml/ai-agent}/route.ts` · `src/lib/services/integrations/twilio/{twilioWebhook,twilioService,twilioSubaccounts,twilioConfig}.ts` · `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` · `src/lib/services/crm/{automationService,index}.ts` · `src/lib/services/notificationService.ts` · `ws-server.ts` · `src/middleware.ts` (2 exclusiones) · `src/app/app/chat/bandeja/page.tsx` · `src/components/chat/channels/whatsapp/id/WhatsAppQrCard.tsx` · `src/__tests__/guardrails.test.ts`.

**Eliminados**: `src/app/api/crm/followup/run/route.ts` · `src/lib/services/crm/followupEngineService.ts` · `src/lib/services/callService.ts` · `src/app/api/integrations/twilio/voice/media-stream/route.ts`.

### Orden de PRs (≤400 líneas cada uno)
1. **PR-01 Schema I** — M1+M2+M3 vía MCP + `enums.ts` + fixture de CHECKs + guardrail #10 + adaptación de tipos en `callManagementService`/`voice/status` (mapeo).
2. **PR-02 Cola** — M4+M5 + `queue.ts` + handlers `noop/maintenance/crmEvent` + `POST /api/crm/jobs/run` + `withCron` + tests `queue.test.ts`.
3. **PR-03 Scheduler** — M8 (tras crear secretos en Vault) + `vercel.json` cron respaldo + `GET /api/crm/jobs` + `retry` + `JobsMonitor`.
4. **PR-04 Org context** — `orgContext.ts`, `service.ts`, `withOrg.ts`, `apiClient.ts` + cookie en el selector de org (`src/lib/supabase/config.ts:130`) + tests.
5. **PR-05 Vault + registry** — M6+M7+M9 + `providerRegistry.ts` + `twilioAccounts.ts` + cambios de `select('*')` en `comm_settings`/`channel_credentials`.
6. **PR-06 Webhooks** — `verifyTwilio/Meta/Resend/ElevenLabs` + `twilioConfig.getWebhookBaseUrl` + las 8 rutas `voice/*` + `integrations/twilio/*` + `whatsapp/webhook` + eliminación de fallbacks + redirect inbound + middleware.
7. **PR-07 ws-server** — `wsAuth.ts`, upgrade con firma, Dockerfile `node:22-slim` + `npm ci` + copia de `src/lib/{services/crm,services/integrations,crm,supabase/ws-config.ts→config.ts,webhooks,jobs,observability}`, `railway.toml`.
8. **PR-08 Endpoints IA/mensajería** — `withOrg` en ai-assistant/*, chat/ai/*, twilio/send-*, whatsapp/*, sendgrid/send, notifications/process, verify/* (rate limit); `dynamic-options` sin JWT; `automationService` allow-list; `aiCreditsService` RPC.
9. **PR-09 Código muerto** — eliminaciones de §12 + `followup/run`; actualizar `guardrails.test.ts` regla 4 (callService ya no existe).
10. **PR-10 Config UI** — `CrmConfigTabs`, Proveedores/IA, Créditos, endpoints `config/providers*`, `config/credits`.
11. **PR-11 Higiene** — `package.json` (Node 22, versiones), `.env.example`, `crmNav.ts` + nav, Capacitor/Electron permisos, `@sentry` tags.
12. **PR-12 Guardarraíles** — reglas #5–#9 activadas (después de que PR-04…PR-09 dejen el código limpio) + H1 (rotación de service key y job 4).

---

## 13. Registro de implementación — ronda 1 (2026-09-08)

### 13.1 Parte BD (agente DB) — APLICADA en producción

Migraciones (en orden, `supabase_migrations.schema_migrations`): `crm_v4_f00_01_reconciliacion_checks_columnas`, `crm_v4_f00_02_storage_buckets_policies`, `crm_v4_f00_03_tablas_cola_eventos_consents_pricing_prefs`, `crm_v4_f00_04_seed_provider_pricing`, `crm_v4_f00_05_funciones_cola_eventos_consent`, `crm_v4_f00_06_privilegios_provider_configs_comm_settings`, `crm_v4_f00_07_seed_provider_configs`, `crm_v4_f00_08_realtime_publication`, `crm_v4_f00_09_pg_cron_jobs_inactivos`, `crm_v4_f00_10_fix_comm_settings_update_columnas`, `crm_v4_f00_11_advisors_trigger_fn_grants_fk_indexes`. **Ronda 2 (correcciones del tester)**: `crm_v4_f00_12_kind_noop_can_contact_fail_closed`, `crm_v4_f00_13_rls_initplan_select_auth_uid`, `crm_v4_f00_14_vistas_solo_lectura_bucket_documents_limites`, `crm_v4_f00_15_cron_post_body_kinds`, `crm_v4_f00_16_fn_release_job_crm_events_diag`. **Ronda 3 (peticiones P10–P19 de REG/F3/F4/F9/F16)**: `crm_v4_f00_17_usage_logs_cost_amount`, `crm_v4_f00_18_refund_ai_credits`, `crm_v4_f00_19_refund_ai_credits_tope_realista`, `crm_v4_f00_20_provider_pricing_valid_to`, `crm_v4_f00_21_comm_credits_fail_closed_y_seed_por_plan`, `crm_v4_f00_22_deduct_comm_credits_reembolso_acotado`, `crm_v4_f00_23_activities_call_id_unique`, `crm_v4_f00_24_seed_pricing_gemini_3_8_audio_in`, `crm_v4_f00_25_campaign_contacts_state_check`, `crm_v4_f00_26_realtime_notes_indices_timeline`, `crm_v4_f00_27_revoke_anon_credit_rpcs`, `crm_v4_f00_28_revoke_public_credit_rpcs`. Detalle de desviaciones en las tres tablas de §3.1.

Aclaraciones tras el tester (ronda 2): (1) `comm_settings_select` = `TO authenticated` + membresía activa **`om.is_active`** (de `organization_members`), no `comm_settings.is_active`; (2) las vistas `v_provider_configs_safe` y `v_outbound_jobs_failed` tienen **solo SELECT** para `authenticated` (INSERT/UPDATE/DELETE revocados; `anon` nada); (3) `outbound_jobs.kind` admite **`noop`** (solo pruebas del runner, `scripts/crm-jobs-smoke.ts`); (4) todas las políticas de F0 usan `(select auth.uid())`.

**Firmas exactas (contrato para el runner y los demás agentes; todas `SECURITY DEFINER SET search_path = public`, EXECUTE solo `service_role` salvo donde se indica):**

```sql
fn_enqueue_job(p_org integer, p_kind text, p_payload jsonb, p_run_at timestamptz DEFAULT now(),
               p_dedupe_key text DEFAULT NULL, p_max_attempts integer DEFAULT 5) RETURNS uuid
  -- conflicto con job queued/running de la misma (org, dedupe_key) → devuelve ese id
fn_claim_jobs(p_kinds text[] DEFAULT NULL, p_limit integer DEFAULT 25, p_worker text DEFAULT NULL) RETURNS SETOF outbound_jobs
  -- reclaim de running con locked_at < now()-10 min (→ queued, o dead si attempts>=max); FOR UPDATE SKIP LOCKED; attempts+1
fn_complete_job(p_job_id uuid, p_worker text, p_result jsonb DEFAULT NULL) RETURNS boolean
  -- true solo si status='running' AND locked_by=p_worker
fn_fail_job(p_job_id uuid, p_worker text, p_error text, p_retry_after_seconds integer DEFAULT NULL) RETURNS text
  -- 'queued' (backoff 60s·2^attempts máx 3600 s + jitter, o p_retry_after_seconds) | 'dead' (attempts>=max_attempts)
  -- | 'failed' (p_retry_after_seconds = -1, no reintentable) | 'ignored' (guarda status/worker no cumplida)
fn_emit_crm_event(p_org integer, p_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}') RETURNS uuid
  -- inserta crm_events(pending) + fn_enqueue_job(kind 'crm_event', payload {event_id,event_type,entity_type,entity_id}, dedupe 'crm_event:{id}')
fn_release_job(p_job_id uuid, p_worker text) RETURNS boolean   -- ronda 2
  -- true solo si status='running' AND locked_by=p_worker: vuelve a 'queued', attempts=GREATEST(attempts-1,0), lock NULL, run_at=now()
  -- (para jobs reclamados que el runner no llega a procesar por deadline; no consume intento)
fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text DEFAULT 'utility') RETURNS boolean   -- authenticated + service_role
  -- false si p_channel es NULL o no está en email|whatsapp|sms|voice (fail-closed, ronda 2), si el cliente no es de la org,
  -- si contact_consents.status='opted_out' o si customers.metadata.do_not_{email|whatsapp|sms|call}='true'; p_purpose ignorado en F0
fn_seed_provider_configs(p_org integer) RETURNS integer      -- filas insertadas (ON CONFLICT DO NOTHING)
fn_crm_cron_post(p_path text DEFAULT '/api/crm/jobs/run', p_body jsonb DEFAULT '{}') RETURNS bigint   -- id de net.http_post; RAISE si faltan secretos en Vault
  -- ronda 2: p_body se envía como JSON (los jobs 18/19 pasan {"kinds":[...]}); la sobrecarga de 1 argumento se eliminó
fn_unit_cost(p_provider text, p_sku text, p_at date DEFAULT current_date) RETURNS numeric   -- INVOKER; authenticated + service_role
  -- ronda 3: respeta valid_to (AND (valid_to IS NULL OR valid_to >= p_at)); NULL si no hay precio vigente

-- ronda 3 (creditos)
refund_ai_credits(p_org_id integer, p_amount integer) RETURNS boolean          -- solo service_role
  -- suma creditos con FOR UPDATE sobre ai_settings; tope = plans.ai_credits_max_rollover + ai_settings.purchased_credits,
  -- aplicado SOLO si el saldo actual todavia no lo supera (27 de 38 orgs ya estan por encima); p_amount<=0 = no-op true;
  -- false si la org no tiene ai_settings. Sustituye a decrement_ai_credits(org, -n) en refundAiCredits().
deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer DEFAULT 1) RETURNS boolean   -- authenticated + service_role
  -- ronda 3: FAIL-CLOSED. Sin fila activa en comm_settings o canal fuera de sms|whatsapp|voice -> false
  -- (antes devolvia true = "ilimitado"). FOR UPDATE real, search_path=public. NULL en la columna = ilimitado explicito.
  -- p_amount<0 = reembolso acotado a plans.comm_<canal>_monthly (lo usa campaignService.ts:111).
fn_seed_comm_settings(p_org integer) RETURNS integer                            -- solo service_role
  -- crea comm_settings con el cupo del plan de la org (COALESCE a 0). ON CONFLICT (organization_id) DO NOTHING.
  -- Trigger hermano: trg_seed_comm_settings_on_org AFTER INSERT ON organizations.

-- ronda 4: las 3 RPC de creditos quedan SOLO para service_role
--   decrement_ai_credits / deduct_comm_credits / refund_ai_credits -> ACL {postgres=X/postgres,service_role=X/postgres}

-- ronda 4 (funciones de trigger reescritas; ninguna es invocable por anon/authenticated)
fn_update_customer_channel_identity()  -- AFTER INSERT ON messages; SECDEF, search_path=public
  -- mapea channels.type -> identity_type valido (whatsapp->whatsapp_phone, instagram->instagram_user,
  -- facebook->facebook_psid, website->widget_identified si hay email / widget_anon con visitor_id|session_id).
  -- NUNCA usa external_message_id como identidad (era la causa de que ningun inbound Cloud API se guardara).
  -- Telefono normalizado a digitos. EXCEPTION WHEN OTHERS -> WARNING: una identidad fallida no revierte el mensaje.
fn_sync_status_from_stage()            -- AFTER UPDATE OF stage_id ON opportunities; SECDEF, search_path=public
  -- fuente de verdad: stages.is_won / stages.is_lost (NO stages.probability, que es solo forecast).
  -- is_won -> 'won'; is_lost -> 'lost'; etapa no terminal -> no toca nada salvo reabrir a 'open' lo que
  -- habia cerrado la etapa ANTERIOR (si esa si era terminal). No escribe closed_at (lo hace
  -- fn_opportunities_set_closed_at). is_won+is_lost a la vez -> WARNING y no toca.
fn_opportunities_set_closed_at()       -- BEFORE UPDATE OF status ON opportunities; ronda 4: search_path=public
  -- unica duena de closed_at: COALESCE(closed_at, now()) al pasar a won|lost; NULL al salir de won|lost.
fn_create_commission_on_opportunity_won()  -- AFTER UPDATE OF status; ronda 4: payee_id sin ::text (es uuid)
fn_auto_journal_commission()               -- AFTER INSERT/UPDATE OF status ON commissions
  -- ronda 4: COALESCE(payee_name, payee_id::text, 'N/A') (antes text+uuid -> 42804) + search_path=public
```

Cola desde TS (service role): `supabase.rpc('fn_claim_jobs', { p_kinds: [...], p_limit: 25, p_worker: 'vercel:<id>' })`, `rpc('fn_complete_job', { p_job_id, p_worker, p_result })`, `rpc('fn_fail_job', { p_job_id, p_worker, p_error, p_retry_after_seconds })`, `rpc('fn_release_job', { p_job_id, p_worker })` (lote no procesado por deadline). El evento `crm_event` llega con `payload.event_id`; el handler marca `crm_events.status` (`processed|skipped|failed`), `processed_at` y, opcionalmente, `attempts`/`last_error` (columnas de ronda 2 para diagnóstico en BD).

**Pendientes que deja la parte BD:**
- Activar los jobs pg_cron (`SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname LIKE 'crm-%'`) cuando `POST /api/crm/jobs/run` esté desplegado y responda 401 sin Bearer / 200 con él. Verificar con `net._http_response.status_code = 200` (tester #10).
- Cifrado de `provider_configs.credentials` en Vault (M6 original) → PR-05 en server; `channel_credentials` → F16 con `phone_number_id` en claro (tester #1/#12).
- `REVOKE SELECT ON channel_credentials FROM authenticated` → F16 (tras adaptar `chatChannelsService.ts` y `WhatsAppCredentialsCard`).
- `providerRegistry.ts:58-63,96-98` selecciona `credentials`: con cliente `authenticated` ahora falla (columna sin privilegio) y cae al fallback env; con service role sigue funcionando. PR-05 debe dejar de leer `credentials` desde clientes no service-role.
- pg_cron job 4 (`mantener-datos-reales-diarios`) sigue con JWT service_role en texto plano: rotar la key (H1, PR-12). No tocado.
- Advisors previos no atribuibles a F0 (auth_rls_initplan en políticas antiguas, índices duplicados `idx_analyses_org_call`/`idx_call_analyses_org_call`, políticas permisivas múltiples en `customers`/`conversations`/`channel_credentials`) quedan documentados en `scratchpad/reports/DB-0-r1.md`.
- **Cerrado en ronda 2** (`scratchpad/reports/DB-0-r2.md`): `noop` en el CHECK; `fn_can_contact` fail-closed; `(select auth.uid())` en las 21 políticas F0 (advisor `auth_rls_initplan` F0 = 0); vistas solo SELECT; bucket `crm-documents` 25 MB + MIME; cron 18/19 con body `{"kinds":[...]}`; `fn_release_job`; `crm_events.attempts/last_error`. Sigue pendiente: activar pg_cron, Vault de credenciales (PR-05/F16), `channel_credentials` (F16), rotación H1. Advisor security restante atribuible a F0: solo `fn_can_contact` ejecutable por `authenticated` (intencional: devuelve boolean, valida org y canal).
- **Cerrado en ronda 3** (`scratchpad/reports/DB-0-r3.md`): `cost_amount` en `ai_usage_logs`/`comm_usage_logs`; `refund_ai_credits`; `provider_pricing.valid_to` + `fn_unit_cost` con vigencia; **creditos de comunicacion fail-closed** (52 de 83 orgs podian enviar sin control por ausencia de fila en `comm_settings`; ahora las 83 tienen saldo del cupo de su plan y `deduct_comm_credits` rechaza sin fila activa); `activities.call_id` UNIQUE; SKU `google/gemini_3_8_flash_audio_in`; `campaign_contacts.state` con los 11 estados de `ContactState`; `notes` en realtime + 3 indices del timeline; `anon` sin EXECUTE sobre las dos RPC de creditos.
- **Descartado en ronda 3**: `fn_crm_timeline` (P18) no se crea — medicion en §3.1; el diseno en TypeScript cumple y una RPC duplicaria la logica de cursor y dedupe.
- **Pendiente para REG/SEC (bloqueante para cerrar el agujero de creditos)**: ~~(a) `src/app/api/ai-assistant/transcribe/route.ts:79` llama a `decrement_ai_credits` con `ctx.supabase`~~ → **CERRADO en ronda 4**: la ruta usa `getServiceClient()` (`:85`) y la migracion 34 revoco `authenticated` en las tres RPC. (b) `refundAiCredits` (`aiCostService.ts:141`) debe llamar a `refund_ai_credits({ p_org_id, p_amount })` en vez de `decrement_ai_credits` con negativo. (c) `campaignService.ts:111` puede pasar a una RPC de reembolso explicita cuando exista; hoy sigue funcionando con el negativo acotado.
- **Cerrado en ronda 4** (`scratchpad/reports/DB-0-r4.md`, migraciones 29–35): (1) **WhatsApp entrante desbloqueado** — `fn_update_customer_channel_identity` derivaba un `identity_type` invalido y usaba `external_message_id` como identidad, y el CHECK revertia el INSERT del mensaje; corregido el trigger (no el CHECK) y blindado con `EXCEPTION`. (2) **Cierre de oportunidades por `is_won`/`is_lost`** — `fn_sync_status_from_stage` redefinida y backfill de 14 etapas en 5 organizaciones (2, 120, 125, 130, 133); ya no se cierra una oportunidad ni se marca perdida por la probabilidad de la etapa. (3) Dos errores de tipo latentes en la cadena de comisiones (`payee_id` uuid) que habrian hecho fallar el cambio de etapa completo al cerrar el primer trato con comision. (4) `authenticated` sin EXECUTE sobre `decrement_ai_credits`/`deduct_comm_credits`/`refund_ai_credits`. (5) Advisors: `anon_security_definer` 335→332, `authenticated_security_definer` 336→333, `function_search_path_mutable` 437→436.
- **Pendiente para F9 (no se toca por migracion)**: dos oportunidades de la org 2 estan en etapa terminal con `status='open'` (`d12db563…` en "Ganado", `f4ac603c…` en "Perdida"); se crearon con INSERT directo en esa etapa. Cerrarlas por SQL estamparia `closed_at` y dispararia la comision sin datos de cierre; deben pasar por `changeStage` con `wonData`/`lossData`. Ademas, la etapa "Ganado" del pipeline `4462350e` de la org 2 tiene `probability=0`: ya no afecta al cierre (solo al forecast ponderado), pero conviene corregirla desde la UI de pipelines.

### 13.2 Parte JOBS (cola, scheduler, outbox)

**Qué se hizo**
- Cola: `src/lib/jobs/types.ts` (tipos `OutboundJob`, `CrmEvent`, `JobHandler`, errores `JobRetryableError(retryAfterSeconds?)` / `JobFatalError`), `registry.ts` (`registerJobHandler`, `getJobHandler`, placeholders sobreescribibles), `enqueue.ts` (`enqueueJob`, `emitCrmEvent`; solo server), `runner.ts` (`runJobs({kinds, limit=25, deadlineMs=50000, jobTimeoutMs=30000, worker})`: claim → handler → timeout por job → `fn_complete_job`/`fn_fail_job`; libera el resto del lote al llegar al deadline; nunca lanza; logs JSON por línea con `worker, org_id, job_id, kind, attempt, ms, outcome`).
- Handlers F0: `noop`, `crm_event` (carga `crm_events` por `payload.event_id`, despacha a `dispatch/eventDispatcher.ts`, marca `processed|skipped|failed`), `maintenance` (retención 30 d + resync del outbox); placeholders `recording_cleanup` (F3) y `campaign_batch` (F16).
- Listener F0 `opportunity.stage_changed` → activity `system` "Etapa cambiada de X a Y" (idempotente; `dispatch/listeners/stageChangedActivity.ts`).
- Endpoints: `GET|POST /api/crm/jobs/run` (cron, fail-closed, `maxDuration=60`), `GET /api/crm/jobs` (sesión; lista + stats + últimos 50 fallidos), `POST /api/crm/jobs/[id]/retry` (admin de la org; re-encola con `dedupe:retry:{attempts}`), servicio `src/lib/services/crm/jobsService.ts`.
- UI: `src/components/crm/config/JobsMonitor.tsx` (206 L; tabla por estado, KPIs, botón Reintentar; para montar en el tab Créditos/Sistema del contenedor del agente REG).
- Scheduler de respaldo: `vercel.json` (3 crons a `/api/crm/jobs/run`), `src/middleware.ts` (exclusión de la ruta), documentación del header `x-vercel-cron-schedule`.
- Tests: `src/lib/jobs/__tests__/runner.test.ts` (7 casos) y `eventDispatcher.test.ts` (4 casos), jest verde. Script manual `scripts/crm-jobs-smoke.ts`.

**Desviaciones respecto al plan**
- Nombres de archivo (`queue.ts` → `types/registry/enqueue/runner`), `JobsMonitor` en `components/crm/config/`.
- `fn_fail_job` real no tiene `p_retryable`: no reintentable = `p_retry_after_seconds = -1` ⇒ estado `failed` (terminal), `dead` solo por agotar `max_attempts`.
- `outbound_jobs` sin `priority/created_by/completed_at`; `crm_events` sin `occurred_at/actor_user_id`; `kind` con `recording_fetch` (ver §4.4). ~~Sin `noop` ni `crm_events.attempts/last_error`~~ → añadidos por DB-r2.
- `crm_event` procesa un evento por job (lo encola `fn_emit_crm_event`), no un "singleton por tick".
- Helpers compartidos: `getServiceClient()` y `verifyCronSecret()` los creó el agente SEC (versión final); JOBS se adaptó a `verifyCronSecret(req): void` que lanza `WebhookError(401)`.

**Pendientes / necesito de otros agentes**
- DB: ~~añadir `noop` al CHECK de `outbound_jobs.kind`~~ **hecho en DB-r2 (`crm_v4_f00_12`)**; ~~confirmar los 3 jobs pg_cron~~ **corrección r2 (tester #46): los jobs 17/18/19 `crm-*` SÍ existen, con `active=false` y 0 ejecuciones**; ~~columnas `crm_events.last_error/attempts`~~ **hecho en DB-r2 (`crm_v4_f00_16`)**.
- REG: montar `<JobsMonitor />` en el tab Créditos/Sistema de `CrmConfigTabs`.
- F8: registrar listeners/handlers reales (`automation`, `sequence_step`) sobre `eventDispatcher`/`registry`.

### 13.3 Parte REG (registry, configuración, dependencias, env, higiene)

**Qué se hizo**
- Dependencias (`npm install` único): `twilio 6.1.0`, `@twilio/voice-sdk 2.18.4`, `resend 6.26.0`, `@elevenlabs/elevenlabs-js 2.67.0`, `@google/genai 2.21.0`, `@react-email/components 1.0.12`, `@react-email/render 2.1.0`, `sanitize-html 2.17.7`, `@types/sanitize-html`. `openai` se mantiene en `^6.15` (decisión y plan en §4.7). `engines.node >=20.0.0`. `tsc` no añade errores por los upgrades (0 archivos corregidos por ese motivo).
- Registry: `src/lib/crm/providerCatalog.ts` (catálogo isomórfico + detección de placeholders), `src/lib/services/providerRegistry.ts` (fallback env ampliado, `getActiveProvider` deprecado sin lectura de `credentials` con cliente de sesión, `listProvidersSafe`), `src/lib/services/providerCredentials.server.ts` (único lector/escritor de `provider_configs.credentials` con service role: `getProviderCredentials`, `getProviderSettings`, `listProviderConfigsSafe` con seed perezoso `fn_seed_provider_configs`, `upsertProviderConfig`).
- Costos: `src/lib/services/crm/pricingService.ts` (`getUnitCost` cache 5 min sobre `provider_pricing`, `estimateCost`, `listPricing`) y `src/lib/services/crm/aiCostService.ts` (`chargeAiCredits` → `decrement_ai_credits` ANTES del proveedor, `refundAiCredits`, `withAiCharge`, `chargeCommCredits` → `deduct_comm_credits`). `aiCreditsService.consumeAICredits` reescrito sobre el RPC (C-10).
- Endpoints: `GET/PUT /api/crm/config/providers`, `POST /api/crm/config/providers/test` (pruebas reales por SDK, 5/min/org), `GET /api/crm/config/credits` (contratos en §4.1).
- UI: `CrmConfigTabs` (General · Proveedores e IA · Créditos y sistema) montado en `ConfiguracionPanelRenderer` para `?modulo=crm`; `ProveedoresTab`/`ProviderCard`/`ProviderCredentialForm`/`useProviderConfigs`/`CreditosTab` (con `JobsMonitor` de JOBS). Sin placeholders.
- Navegación: `src/config/crmNav.ts` como única fuente (12 entradas activas; Agentes IA/Plantillas/Secuencias/Automatizaciones `enabled:false`); `AppLayout.tsx` y `moduleConfig.ts` la consumen. "Salud Clientes" → "Salud".
- Higiene: `.env.example` reescrito (§4.6), `ws-server.Dockerfile` con lockfile (`npm ci --include=dev`, `COPY src/lib/ src/types/`), código muerto eliminado (§12), `OpportunityAutomations.tsx` sin dependencia de `EmailNotifications`.
- Tests: `providerRegistry.test.ts` (27 casos), `pricingService.test.ts` (10), `aiCostService.test.ts` (12) → 56 verdes.

**Desviaciones respecto al plan**
- Node 20 + `openai ^6.15` (no Node 22 + `openai ^7.10`) en esta ronda; ver §4.7.
- Vault (M6) no aplicado por DB en r1 → las credenciales viven en `provider_configs.credentials` (columna sin SELECT para `authenticated`); `providerCredentials.server.ts` es el único punto a cambiar cuando exista `fn_get/set_provider_secret`.
- `provider_pricing` real no tiene `valid_to` (solo `valid_from`) y sí `credits_per_unit`: `pricingService` se adaptó. `ai_usage_logs`/`comm_usage_logs` no tienen `cost_amount`: se persiste en `metadata.cost_amount` hasta que DB añada la columna.
- El seed real usa `tts.settings.model_id` (no `model`) y `calendar → none` (no `internal`): catálogo y defaults alineados.
- Sin `apiClient.ts`/`withOrg.ts` (no existían al implementar): las rutas usan `getServerOrgContext()` + `isOrgAdmin()` (`src/lib/utils/rbac.ts`).
- `refundAiCredits` usa `decrement_ai_credits` con `p_cost` negativo (el RPC hace `FOR UPDATE` y `remaining - p_cost`); se pide a DB un `refund_ai_credits` explícito.
- Prueba en navegador: el dev server requiere sesión; ver `scratchpad/reports/REG-0-r1.md` "Cómo probarlo".

**Pendientes / necesito de otros agentes**
- DB: `ALTER TABLE ai_usage_logs ADD COLUMN cost_amount numeric(12,6)`, `ALTER TABLE comm_usage_logs ADD COLUMN cost_amount numeric(12,6)` (hoy en `metadata`); RPC `refund_ai_credits(p_org_id, p_amount)`; Vault para `provider_configs.credentials` (M6) cuando se decida.
- SEC: `voiceTokenService`, `callAnalysisService`, `transcriptionService`, `emailService`, `mobileBridgeService`, `crm/voiceAgentService`, `voice/call` pueden migrar de `getActiveProvider(org, cat, supabase)` a `getProviderCredentials(org, cat)` (misma respuesta; el alias ya delega).
- F3/F7/F16: registrar sus pestañas en `CrmConfigTabs.TABS` cuando el componente exista.
- Orquestador: PR Node 22 + `openai` 7.x (§4.7).

---

## 13. Registro de implementación — ronda 1 (SEC, 2026-09-08)

**Alcance ejecutado (seguridad y contexto multi-tenant, D7):**
- Helpers: `getServiceClient()` (singleton service-role, `server-service.ts`), `getServerUserClient()` (`server-user.ts`), `enums.ts` (+ fixture `db-checks.json` generado desde `pg_constraint`), `webhookSignatures.ts` (Twilio por AccountSid + origin, Meta `timingSafeEqual`, Resend svix, cron fail-closed), `rateLimit.ts`, `wsSessionToken.ts`.
- `orgContext.ts`: `resolveOrgFromExternal` con service client (C0); `getServerOrgContext(req?)` con header → cookie → `profiles.last_org_id` (consulta directa, tester #7) → única membresía → 400 `ORG_AMBIGUOUS`; `requireOrgAdmin` (criterio `rbac.ts`: `is_super_admin` o rol 'Super Admin'/'Admin de organización' o role_id 1|2); `withOrg`/`withCron`.
- 43 route handlers endurecidos (ver §7.1) y 4 archivos eliminados (`followup/run`, `followupEngineService`, `callService`, `media-stream`).
- ws-server: upgrade autenticado (token + firma Twilio) y re-verificación en `setup`; TwiML de `ai-agent` e `incoming` emiten el token.
- `automationService.update_field` con allow-list y validación de tipo.
- Opt-out SMS/WhatsApp (STOP/BAJA/CANCELAR/NO MAS/UNSUBSCRIBE/SALIR/DETENER y opt-in START/ALTA/INICIAR) → `contact_consents` + `customers.metadata.do_not_whatsapp|do_not_sms` (`twilioWebhook.ts:83`); `contact_consents` ya existe en BD (verificado), el insert va en try/catch por si se ejecuta en un entorno sin la migración.
- Guardarraíles 5–9 y 4 suites unitarias nuevas (51 tests verdes junto a guardrails 38/38).

**Desviaciones respecto al plan (§4.2/§12):** nombres de módulo (`server-service.ts` en vez de `service.ts`; `security/webhookSignatures.ts` en vez de `webhooks/verify*.ts`; `withOrg/withCron` dentro de `orgContext.ts`; `wsSessionToken.ts` en vez de `wsAuth.ts`, exp 10 min); `verifyElevenLabsWebhook` no creado (sin SDK); `getTwilioWebhookOrigin` tolera un valor legacy con path; `middleware.ts` tocado mínimamente (2 exclusiones) para que los webhooks de voz no reciban 307; `whatsapp/send` cambia de contrato (ya no devuelve `data` de Meta; devuelve `message_id` local + `conversation_id`); `qr/send` marca `metadata.dispatched=true`.

**No hecho a propósito (fuera de alcance SEC):** mapeo `RecordingStatus` en `voice/recording` (F4, existe `twilioRecordingStatusToDb`); `aiCreditsService` atómico (REG); Vault para secretos (DB/REG); `chatChannelsService`/`WhatsAppCredentialsCard` con secretos en claro (C8, REG/F16); redirect TwiML de `integrations/twilio/voice/incoming` a `voice/twiml/inbound` (F3); cambios de lógica TwiML/estados (F3/F5/F6).

**Hallazgos nuevos:** H3 middleware bloqueaba `/api/voice/*` (307) — corregido; H4 `/api/integrations/sendgrid/webhook` y `/api/email/webhook` siguen detrás del middleware (307) — pendiente REG; H5 `commNotificationService.ts` importa `twilioService` (ahora server-only): si algún componente cliente lo importa, `getServiceClient()` lanzará en runtime del browser (grep no encontró usos desde componentes; vigilar).

**Pendientes para próximas rondas:** conectar `verifyResendWebhook` en `/api/email/webhook` (F7); `integration_events` por rechazo de firma (observabilidad); test de `validateUpdateField` (F8); Dockerfile del ws-server debe copiar `src/lib/security/**` y `src/lib/supabase/server-service.ts` (REG); `WS_SESSION_SECRET` y `WS_PUBLIC_URL` en Railway/Vercel (dueño).

## 13. Registro de implementación — ronda 2 (JOBS, 2026-09-08)

**Qué se hizo (informe del tester `TEST-JOBS-0-r1.md`, F-1…F-10 + riesgos)**
- F-1 Productor de mantenimiento: `src/lib/jobs/scheduler.ts` (`runScheduledKinds`). `maintenance` se ejecuta directamente (global; `organization_id` NOT NULL/FK impide un job "del sistema" y encolar uno por org sería N limpiezas idénticas); `recording_cleanup` encola un singleton diario por org (`recording_cleanup:{yyyy-mm-dd}`) solo cuando F3 registre el handler real. La ruta `run` lo invoca antes de drenar cuando la petición pide esos kinds (`?kind=`, body o `x-vercel-cron-schedule`) y devuelve `scheduled`.
- F-3 Kinds inválidos: `parseKinds` devuelve `{invalid}` ⇒ 400 con `invalid[]`/`valid[]`; `runJobs` con kinds pedidos pero ninguno válido no reclama nada (`no_valid_kinds`). `runner.test.ts` corregido (antes consagraba `p_kinds: null`).
- F-4 Liberación por deadline: `fn_release_job(p_job_id, p_worker)` (DB-r2) con fallback `UPDATE … attempts = attempts_del_claim - 1` guardado por `locked_by`; ya no se pisa `last_error`; `releasedWithoutRpc` en el resumen indica que se usó el fallback.
- F-5 `noop`: DB-r2 (`crm_v4_f00_12`) lo añadió al CHECK (verificado con `pg_get_constraintdef`: 14 kinds); `src/lib/crm/__fixtures__/db-checks.json` regenerado con `execute_sql` de solo lectura (`noop` pasa de `planned_extras` a `checks`; 25 CHECKs, 1 diferencia); nota de `enums.ts:195` actualizada; `scripts/crm-jobs-smoke.ts` usa `noop` por defecto, comprueba además `?kind=bogus` ⇒ 400 y **borra sus filas** al terminar (`--keep` para conservarlas; tester #44).
- F-6/F-7 Roles y redacción: `canRetryJobs` = `isOrgAdminContext` (orgContext.ts; adiós `'admin'|'owner'`), `canViewJobs` = admin o Manager (`roles` real: 5 Manager); `GET /api/crm/jobs` exige ese rol, usa `getServerOrgContext(request)` y devuelve `canRetry`; `payload_preview` redactado por allow-list (`redactPayload`).
- F-8 Retención: `maintenance` purga también `failed|dead` > 30 d y `crm_events.failed` > 30 d; resync respeta `crm_events.attempts` (máx 3) y el handler `crm_event` escribe `attempts+1`/`last_error` con fallback si DB-r2 aún no aplicó las columnas.
- F-2 Guardarraíles: `npx jest src/__tests__/guardrails.test.ts` verde en el árbol actual (SEC corrigió las reglas 5/7; `sequences/run` sigue en la allow-list de la regla 5 porque acota el lote por `organization_id` opcional del cron). Cambio mínimo de JOBS: `sequences/run` usa `verifyCronSecret` en vez de su comparación manual.
- Riesgos: `enqueueJob` valida `runAt` (ISO/Date); retry reutiliza el `dedupe_key` original (un solo job vivo por evento aunque el resync ya lo haya encolado); `JobsMonitor` (185 L) + `JobsTable` (117 L): `failed` = "Fallidos (definitivo)", `dead` = "Muertos (sin intentos)", `queued` con intentos = "reintento", sección "Últimos fallos" (`recentFailed`), botón Reintentar solo si `canRetry`, paginación 50/página, header `X-Organization-Id` opcional.
- F-9/F-10 Docs: §2.2, §2.3, §4.1, §4.4, §9.1, §9.3, §12, §13.2 actualizados con el contrato real.

**Desviaciones respecto al plan**
- `maintenance` no pasa por la cola cuando lo dispara el cron (ejecución directa e idempotente); el job `maintenance` en cola queda para pruebas/encolado manual.
- `fn_release_job` y `crm_events.attempts/last_error` existen desde DB-r2 (`crm_v4_f00_16`) y son la ruta principal; el código conserva la detección en runtime (PGRST202/PGRST204 → fallback) como cinturón por si se restaura un snapshot anterior. En producción `releasedWithoutRpc` debe ser siempre `undefined`.
- `stages` (listener `stage_changed_activity`, `:89`) se consulta por `id` sin filtro de organización porque **la tabla no tiene `organization_id`** (cuelga de `pipelines`); los ids llegan del payload del trigger de la propia org y solo se usan para el texto de la activity. Toda escritura (`activities`) y el resto de lecturas sí llevan `.eq('organization_id', orgId)`. Si se quiere cerrar del todo (regla 3) hace falta un join con `pipelines` o que DB añada la columna.

**Verificación ejecutada (2026-09-09)**
- `npx jest src/lib/jobs` → **7 suites / 44 tests verdes** (incluye `handlers.test.ts` y `runnerTimeout.test.ts` del tester r1). `npx jest src/__tests__/guardrails.test.ts` → 38/38 verdes.
- `npx tsc` con un tsconfig acotado a los archivos de JOBS (+ `orgContext`, `webhookSignatures`, `enums`, `middleware`, `sequences/run`) → **0 errores**.
- BD (MCP, solo lectura): `outbound_jobs_kind_check` con los 14 kinds incluido `noop`; `fn_release_job(uuid,text)` existe; `crm_events.attempts/last_error` existen.
- HTTP contra el módulo real de la ruta: sin header → 401; `Bearer` erróneo → 401; `?kind=bogus` y `?kind=noop,bogus` → **400** con `invalid[]`/`valid[]`; `?kind=maintenance` → **200** con `scheduled.maintenance.ok=true` (`events_resynced:1`, resto 0); `?kind=crm_event` drenó el evento real pendiente → `done/skipped:1` (sin listeners para `opportunity.created`).
- `npx tsx scripts/crm-jobs-smoke.ts --kind noop --org 105 --url <base>` → **OK** (job `done` con `result.echoed`, filas borradas; cola en 0 `queued|running` al terminar y sin restos de smoke en la org 105).
- Nota de entorno: los `next dev` del repo comparten el mismo `.next` y su caché de webpack está corrupta (`TypeError: Cannot read properties of undefined (reading 'call')` al cargar `server-service.ts`; falla igual `/api/email/webhook`, de F7). No es un fallo de código: la verificación HTTP se hizo montando el módulo real de `run/route.ts` en un servidor `http` aislado (`scratchpad/jobs-http-harness.ts`). Antes de dar por buena la ruta en dev conviene parar todos los `next dev` y borrar `.next`.

**Pendientes / necesito de otros agentes**
- DB: ~~`fn_release_job`, `'noop'` en el CHECK, `crm_events.attempts/last_error`~~ **aplicados en DB-r2** (`crm_v4_f00_12`, `_15`, `_16`; jobs 18/19 ya piden `recording_cleanup,maintenance` por body).
- SEC: ~~mover `noop` de `planned_extras` a `checks`~~ **hecho por JOBS-r2** (fixture regenerado; `planned_extras` vacío). Sin cambios en `guardrails.test.ts`.
- Orquestador: activar pg_cron 17/18/19 (`cron.alter_job`) tras desplegar; comprobar `net._http_response.status_code = 200`.
- F3: registrar el handler real de `recording_cleanup` (el productor diario se activa solo).
