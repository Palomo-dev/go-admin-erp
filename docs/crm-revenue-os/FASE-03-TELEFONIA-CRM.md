# FASE 03 — Llamar desde el pipeline y la oportunidad (navegador) con grabación y consentimiento

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye la V3 completa)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Repo: `go-admin-erp` (Next.js 15.5 App Router, React 19, Vercel iad1)
> Depende de: **F0** (fix `resolveOrgFromExternal`, firmas fail-closed, CHECKs de `calls`/`call_recordings` reconciliados en TS, bucket `crm-call-recordings`, `outbound_jobs` + pg_cron, registry `provider_configs` con credenciales cifradas y fallback env, permisos de micrófono Capacitor/Electron) y **F2** (timeline unificado + `activities.call_id`; si F2 no ha corrido, F3 aplica la parte mínima de forma idempotente, ver 3.1).
> Bloquea: F4 (transcripción/análisis consume `call_recordings.status='ready'` y el job `transcribe`), F5 (bridge celular reutiliza status/recording/consent/disposition de F3), F6 (agente IA reutiliza números, caller id y grabación).
> Esfuerzo: **L** (3 PRs de backend + 4 PRs de UI, ~2.400 líneas netas). Valor: **crítico** (hoy 0 llamadas; es la primera capacidad del objetivo del dueño).

---

## 0. Objetivo y alcance

Al terminar esta fase, con una organización de prueba que tenga un número Twilio y créditos de voz:

1. Desde la tarjeta Kanban, el drawer y el detalle de la oportunidad (y la ficha de cliente) el vendedor pulsa **Llamar → Navegador** y en ≤3 s el cliente recibe la llamada con el caller id de la organización; el `SoftphoneDock` muestra timbrando / en llamada / timer / indicador de grabación.
2. El cliente escucha el aviso de consentimiento (`comm_settings.voice_consent_message`, voz `Polly.Mia-Neural` es-MX) antes de conectarse; el aviso queda en `call_consents` y `calls.consent_given=true`.
3. La llamada queda en `calls` con `mode='browser'`, `status` final correcto según la máquina de estados, `duration_seconds` real del proveedor, `opportunity_id`/`customer_id`/`user_id` correctos.
4. La grabación dual-channel se descarga de Twilio (Basic Auth con API Key) y se copia al bucket privado `crm-call-recordings` (`org_{id}/{yyyy}/{mm}/{callId}.mp3`); `call_recordings.status` pasa `processing → ready`; se reproduce vía URL firmada de 10 min desde `/api/voice/recording/[id]/stream`; se encola un job `transcribe` (F4 lo procesa).
5. Al colgar aparece el **diálogo de disposición** (contactado / no contesta / buzón / ocupado / número inválido + próxima acción + nota); se guarda en `calls.metadata.disposition`, en la actividad de la llamada y en `opportunities.last_contact_at/contact_channel/contact_result`.
6. La llamada aparece en "actividades recientes" de la oportunidad (trigger `trg_calls_completed_activity` → `activities` con `activity_type='call'`, `call_id`, `duration_seconds`, `outcome`) y en `/app/crm/llamadas` (tabla con filtros + player), con entrada en el menú lateral.
7. Llamadas entrantes al número de la org suenan en el navegador del usuario asignado (`phone_numbers.assigned_user_id`) o en ring group, con `IncomingCallToast` que muestra quién llama (cliente/oportunidades abiertas); sin respuesta → buzón grabado.
8. Tab **Telefonía** en `/app/configuracion?modulo=crm`: números (listar/importar/comprar), caller id, grabación on/off, mensaje de consentimiento editable con preview TTS, retención, timeout, "mi celular" (compartido con F5).

**No incluye:** transcripción y análisis IA (F4), llamada de dos patas al celular y registro manual con audio (F5), agente de voz IA (F6), SMS/WhatsApp (F7/F8), compra de subcuentas Twilio automatizada (F0 la deja opcional), power dialer, transferencia asistida a otro agente (solo transferencia ciega básica), cola de espera con música (`<Enqueue>` queda fuera).

---

## 1. Estado actual verificado

Todo lo siguiente proviene de `audit-telephony.md`, `audit-ui.md` y del schema live (2026-09-08). Leyenda: ✅ sirve tal cual · 🟡 sirve con cambios · 🔴 roto o inexistente.

| Componente / archivo:línea | Estado | Qué está mal (hallazgo) |
|---|---|---|
| `src/lib/utils/orgContext.ts:89-93` `resolveOrgFromExternal` | 🔴 (F0) | `createServerClient` de `@supabase/ssr` sin `cookies` → throw en TODOS los webhooks de voz (**C0**). F3 asume el fix de F0 (`createClient` de `@supabase/supabase-js` + service role). |
| `src/lib/services/crm/voiceTokenService.ts:44-56` | 🔴 | Exige `TWILIO_API_KEY/API_SECRET/TWIML_APP_SID` en `provider.credentials`; `providerRegistry.ts:17` solo cae a `ACCOUNT_SID/AUTH_TOKEN`; `provider_configs` con 0 filas → `/api/voice/token` 500 → `deviceState='error'` (**C1**). |
| `voiceTokenService.ts:66-69` identity = `userId` (UUID con guiones) | 🟡 | La identity debe ser `[A-Za-z0-9_]` (docs-twilio-voice.md) y codificar la org para resolver el tenant en el TwiML App: pasa a `u_{uuid sin guiones}_o_{orgId}`. |
| `src/components/voice/SoftphoneProvider.tsx:266-276` + `:286` | 🔴 | **Doble marcación (C10)**: POST `/api/voice/call` (Twilio marca al cliente por REST) y luego `device.connect({params:{To}})` (Twilio marca de nuevo desde el TwiML App). El leg browser no tiene fila `calls` → `twiml/outbound:55` cae a `buildBasicOutboundTwiml` (sin consentimiento ni grabación). |
| `src/app/api/voice/twiml/outbound/route.ts:47` resuelve org por `CallSid` | 🔴 | En llamada client-originated el `CallSid` es nuevo (no existe en `calls`) → nunca resuelve. Debe resolver por `From=client:{identity}`. `:115` `<Say language="es-MX">` sin `voice`; `:121-123` `<Dial>` sin `callerId`, sin `statusCallback`, sin `recordingStatusCallback`. |
| `src/app/api/voice/call/route.ts:113,119` | 🔴 | `mode:'click-to-call'` y `status:'queued'` violan `calls_mode_check`/`calls_status_check` (**C3**). Este endpoint deja de usarse para browser; queda para modo `bridge` (F5) y `ai_agent` (F6) con enums válidos. |
| `src/lib/services/crm/callManagementService.ts:15-26` | 🔴 | `CallMode`, `CallStatus`, `BridgeMode` TS no coinciden con los CHECK de BD (**C3**). F0 reconcilia las uniones; F3 los consume. |
| `callManagementService.ts:307` y `:322` (verificado por el builder, no está en el audit) | 🔴 | `createCall` pone `status: data.status ?? 'queued'` (inválido) y `duration_source: data.duration_source ?? null` sobre una columna **NOT NULL** (`calls.duration_source text!`) → 23502 aun con datos válidos; `:309` `started_at ?? null` sobre `started_at NOT NULL`. |
| `src/app/api/voice/status/route.ts:143-164` | 🔴 | Mapea a `'queued'`, `'in-progress'`, `'no-answer'` (inválidos, **C3**); `:36` salta la firma si falta `TWILIO_MASTER_AUTH_TOKEN` (**C12**); `:34` URL de firma desde `request.url` (**C13**); no usa `SequenceNumber`; no distingue leg padre/hijo (`ParentCallSid`). |
| `src/app/api/voice/recording/route.ts:182-195` | 🔴 | `status:'completed'` inválido (BD `processing|ready|failed|deleted`) (**C5**); `:36` `parseInt(RecordingChannels)` sobre columna `text NOT NULL`; `:111,:131` `storage_path: recordingUrl || null` sobre NOT NULL; `:153` descarga fire-and-forget (Vercel puede matar la función al responder). |
| `callManagementService.ts:449` `updated_at` en `call_recordings` | 🔴 (F0) | La columna no existe → toda actualización de grabación falla (**C5**). |
| `src/lib/services/crm/recordingStorageService.ts:18` bucket `crm-call-recordings` | 🔴 (F0) | El bucket no existe (verificado: solo `crm-documents` privado) (**C6**). |
| `recordingStorageService.ts:67-76` Basic Auth con `TWILIO_MASTER_ACCOUNT_SID:AUTH_TOKEN` | 🟡 | Funciona para master, pero grabaciones de subcuenta requieren credenciales de esa subcuenta; pasar a API Key (`SK…:secret`) del registry. `:19` URL firmada 3600 s → 600 s. |
| `src/app/api/voice/recording/[id]/stream/route.ts:33-57` | ✅ | Sesión + org + redirect 302 a URL firmada. Solo cambia la expiración. |
| `src/app/api/voice/twiml/inbound/route.ts:130` `<Client>incoming</Client>` | 🔴 | Identity hardcodeada: ningún navegador recibe entrantes (**C21**). `:72` `mode:'manual'` para inbound (debe ser `'inbound'`); `:66` no pasa `duration_source` (23502, ver arriba); `:128` `<Say>` sin `voice`. |
| `src/app/api/integrations/twilio/voice/incoming/route.ts:131-140` | 🔴 | Fallback "primera org activa" cross-tenant (**C11**); `:111` `language="en-US"`; `:33` firma solo en producción. F3 lo **elimina** (una sola ruta inbound: `/api/voice/twiml/inbound`). |
| `src/lib/services/integrations/twilio/twilioWebhook.ts:25-31` | 🔴 (F0) | Valida siempre con `TWILIO_MASTER_AUTH_TOKEN`; subcuentas nunca validan (**C12**). F3 consume el helper nuevo de F0 y documenta la URL reconstruida (**C13**). |
| `src/lib/services/integrations/twilio/twilioConfig.ts:83` | 🔴 (F0) | Default `https://app.goadmin.io/api/integrations/twilio` contradice `.env.example` (**C2**). F3 asume `TWILIO_WEBHOOK_BASE_URL` = **origin** sin path. |
| `src/lib/services/integrations/twilio/twilioSubaccounts.ts:9` `getCommSettings` | 🔴 | Usa el cliente anon de browser en servidor → `null` → `voice_recording_enabled` cae a `false` (`twiml/outbound:66`, `twiml/inbound:62`) (**C15**). F3 lee `comm_settings` con el service client del webhook. |
| `src/app/app/layout.tsx:17-31` | 🔴 | Sin `SoftphoneProvider`; el provider vive solo en `src/app/app/crm/llamadas/page.tsx:201` (**B7**). |
| `src/components/app-layout/AppLayout.tsx:127-138` | 🔴 | Submenú CRM sin "Llamadas" ni "Leads" (**B8**); `src/config/moduleConfig.ts:136-141` lista inconsistente. |
| `src/components/crm/pipeline/drawer/ActivityActions.tsx:272` | 🔴 | POST `/api/integrations/twilio/click-to-call` no existe (404) (**C20/B1**); `:364` abre `tel:`; el CallDialog (`:229-454`) mezcla manual + transcripción por upload. |
| `src/components/voice/CallButton.tsx:56` | 🟡 | Correcto (deshabilitado hasta `deviceState==='registered'`, `stopPropagation` en `:58-60`) pero sin importadores. Se reutiliza dentro de `QuickActionsBar`. |
| `src/components/voice/SoftphoneDock.tsx` (362L) | 🟡 | Dial pad, timer, mute local; sin selector de audio, sin DTMF a la llamada (`call.sendDigits`), sin nota en vivo, sin indicador de grabación. Se parte en subcomponentes. |
| `src/components/voice/IncomingCallToast.tsx:20-40` | 🟡 | Solo "Tienes una llamada esperando…"; sin lookup de cliente ni foco accesible. |
| `src/app/app/crm/llamadas/page.tsx:149` | 🟡 | Filtra perdidas por `'no-answer'` (inválido en BD). `CallsTable.tsx` (299L) y `CallPlayer.tsx` (180L) se conservan. |
| `src/app/api/crm/calls/route.ts`, `calls/[id]/route.ts`, `phone-numbers/route.ts` | ✅ | Sesión + org via `getServerOrgContext`; `PATCH calls/[id]` acepta `CallUpdateInput` sin validación (se añade zod + disposition). |
| `call_consents` (tabla) | ✅ | Existe con `consent_type, announced_at, method, locale, recorded_announcement_text`; nadie escribe en ella. |
| `phone_numbers` (tabla) | ✅ | `e164, provider_sid, capabilities, assigned_user_id, is_primary, is_active`; UNIQUE `(organization_id, e164)`; 0 filas; sin uso real en TwiML. |
| `comm_settings.voice_*` (7 columnas) | ✅ | Existen; nadie las lee con el cliente correcto. |
| `user_comm_preferences`, `provider_pricing`, `outbound_jobs` | 🔴 NUEVO | No existen en el schema (verificado). `outbound_jobs` la crea F0; las otras dos, F3 (3.1). |
| Bucket `crm-call-recordings`, cron de retención | 🔴 (F0) | Inexistentes. F3 consume el bucket y define el job `recording_cleanup`. |
| Tablas `calls`, `call_recordings`, `call_consents`, `phone_numbers` | ✅ | 0 filas. RLS activa con 4/4/2/4 políticas patrón `organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active)`. Índices: `idx_calls_provider_sid` UNIQUE parcial `(organization_id, provider_call_sid)`, `idx_calls_org_started`, `idx_calls_org_customer`, `idx_calls_org_opp`, `idx_recordings_sid` UNIQUE parcial. |

**Por qué hoy hay 0 llamadas (cadena de fallos):** el softphone nunca registra (C1) → `CallButton` siempre deshabilitado y sin importadores (B7) → el único botón visible (`ActivityActions:272`) llama a una ruta inexistente (C20) → si se forzara el `Device`, la doble marcación (C10) haría que el cliente reciba dos llamadas y la del browser no tendría fila en `calls` → los webhooks crashean en `resolveOrgFromExternal` (C0) → aunque no crashearan, `calls`/`call_recordings` violan CHECKs (C3, C5) y el bucket no existe (C6) → aunque todo eso pasara, nada crea la `activity` (audit §4). F3 corta cada eslabón.

---

### 1.1 Estado tras la ronda 1 (implementado, 2026-09-08)

Verificado con `tsc` (0 errores en los archivos de F3), `jest` (guardarraíles 38/38 + unitarias de F3) y un POST firmado real contra el dev server. Leyenda: ✅ hecho y probado · 🟡 hecho, sin prueba end-to-end con Twilio real.

| Qué | Dónde (archivo:línea) | Estado |
|---|---|---|
| TwiML saliente client-originated: la fila `calls` se crea en el webhook (fin de la doble marcación C10) | `src/app/api/voice/twiml/outbound/route.ts:64` `handleClientOriginated` | ✅ probado con firma válida (200 + fila `calls` mode `browser`/`dialing`) |
| Identity `u_{uuid sin guiones}_o_{orgId}` + parseo inverso | `src/lib/services/crm/voiceTokenService.ts:31` `buildVoiceIdentity`, `:42` `parseVoiceIdentity` | ✅ `src/lib/services/integrations/twilio/__tests__/voiceIdentity.test.ts` |
| Membresía activa obligatoria antes de marcar (aislamiento multi-tenant) | `twiml/outbound/route.ts:81` → `voiceContextService.ts:176` `isActiveMember` | ✅ probado (identity de no-miembro → `<Say>` + `<Hangup/>`) |
| Caller ID real (`voice_caller_id` → `phone_numbers.is_primary` → `comm_settings.phone_number`) | `src/lib/services/crm/voiceContextService.ts` `pickCallerId` | ✅ **corregido en la ronda 2**: el escalón `TWILIO_PHONE_NUMBER` es de la PLATAFORMA, se devuelve como `source:platform` y `twiml/outbound` lo rechaza (antes todas las orgs marcaban desde el número de la org 105) |
| Reserva de 1 minuto ANTES del `<Dial>` (`deduct_comm_credits`) | `src/lib/services/crm/callCreditsService.ts` `reserveVoiceMinutes`; uso en `twiml/outbound/route.ts` | ✅ probado (198 → 197 por llamada). Los créditos viven en `comm_settings.voice_minutes_remaining` (**no existe ninguna tabla `comm_credits`**); DB dejó la función fail-closed y rellenó las 83 orgs. Queda vivo el caso `voice_minutes_remaining IS NULL` = ilimitado (0 filas hoy) |
| TwiML §4.5.1: `answerOnBridge`, `record-from-answer-dual`, `action=dial-complete`, `<Number url=consent-whisper>`, `statusCallback` | `src/lib/services/crm/twimlBuilders.ts:86` `buildOutboundBrowserTwiml` | ✅ snapshot en `__tests__/twimlBuilders.test.ts` |
| Consentimiento oído por el CLIENTE (no por el agente), texto congelado en `call_consents` | `src/app/api/voice/twiml/consent-whisper/route.ts` + `twimlBuilders.ts:62` `buildConsentTwiml` | ✅ fila `call_consents` creada en la prueba |
| Idempotencia del TwiML (reintento de Twilio con el mismo `CallSid` → mismo XML, sin fila duplicada) | `twiml/outbound/route.ts:99-120` | ✅ probado (XML idéntico byte a byte) |
| `dial-complete`: estado final, `DialCallDuration`, `customer_leg_sid`, liquidación de créditos y actividad | `src/app/api/voice/dial-complete/route.ts`; `callStateMachine.ts` `applyDialComplete` + `mergeTerminalOutcome` | ✅ probado con payloads firmados (ronda 2). **Terminal pegajoso también aquí** y la duración nunca se pisa con 0; si el desenlace cambia los minutos, `settleVoiceCall(..., {reconcile:true})` concilia el cobro |
| Status callback idempotente (leg padre/hijo por `ParentCallSid`, `SequenceNumber`, terminales pegajosos) | `src/app/api/voice/status/route.ts`; `callStateMachine.ts` `applyStatusEvent` | ✅ probado con payloads firmados (ronda 2). Se liquida al ser terminal **y** tener `ended_at`: el buzón (`AnsweredBy=machine_*`) marca `voicemail` sin cerrar y cobra al cerrar con la duración real. Un `CallStatus` desconocido se ignora (antes mataba la llamada como `failed`) |
| Mapeo Twilio → enums de BD (nunca `queued`/`in-progress`/`no-answer`) | `src/lib/crm/enums.ts` `twilioCallStatusToDb` (usado en `callStateMachine.ts:82,151`) | ✅ |
| Grabación: upsert `call_recordings` (`processing`) + job `recording_fetch` con dedupe por `RecordingSid` | `src/app/api/voice/recording/route.ts:24` | 🟡 |
| Job `recording_fetch`: descarga Basic Auth → bucket `crm-call-recordings/org_{id}/{yyyy}/{mm}/{callId}.ext` → `ready` + `retention_until` → encola `transcribe` | `src/lib/jobs/handlers/recordingFetch.ts` | ✅ `__tests__/recordingFetch.test.ts` |
| Job `recording_cleanup`: borra por `retention_until < hoy` (Storage + Twilio) y marca `deleted` | `src/lib/jobs/handlers/recordingCleanup.ts` + `recordingStorageService.deleteRecording` | ✅ ronda 2: `deleted` **solo** si Storage y el proveedor borraron de verdad (un 404 cuenta como borrado); si no, lanza y el lote lo cuenta en `failed` y reintenta |
| Entrantes: UNA sola ruta; org por `To`; `<Client>` con identity real (fin de C21); sin fallback "primera org" | `src/app/api/voice/twiml/inbound/route.ts:24`; `phoneNumberService.resolveInboundTargets` | 🟡 |
| Ruta legacy `integrations/twilio/voice/incoming` → valida firma y delega en la canónica (no 308: conserva la URL firmada) | `src/app/api/integrations/twilio/voice/incoming/route.ts:24` | ✅ guardarraíl 7 verde |
| Softphone global montado una vez para todo `/app/*` (lazy, `ssr:false`) | `src/app/app/layout.tsx:22` → `src/components/voice/SoftphoneShell.tsx:14` | ✅ |
| `useSoftphone()` seguro (`{available:false}` sin provider) + `useSoftphoneStrict()` | `src/components/voice/SoftphoneProvider.tsx` (289 L tras dividirlo) | ✅ |
| 409 `VOICE_NOT_CONFIGURED` no bloquea el render (estado `not_configured`, backoff 30 s) | `src/components/voice/hooks/useTwilioDevice.ts` | ✅ |
| `tokenWillExpire` → `updateToken`; 31205 → re-token | `src/components/voice/hooks/useTwilioDevice.ts` | ✅ |
| `makeCall` SOLO `device.connect` (sin POST previo a `/api/voice/call`) | `SoftphoneProvider.tsx:387-414` | ✅ |
| Motivos de error legibles (31201/31202/31204 credenciales, 31208 micrófono, red) | `hooks/useTwilioDevice.ts` `describeDeviceError` (reexportado por `SoftphoneProvider`) | ✅ |
| Selector de micrófono / salida | `src/components/voice/hooks/useAudioDevices.ts` (usado en `SoftphoneProvider.tsx:162`) | ✅ |
| Dock partido en subcomponentes (≤300 líneas cada uno) | `src/components/voice/SoftphoneDock.tsx` (182L) + `dock/{DockHeader,Keypad,CallControls,LiveNote}.tsx`; provider dividido en `hooks/useTwilioDevice.ts` (242L) + `softphoneTypes.ts` (70L) | ✅ ronda 2 (antes `SoftphoneProvider.tsx` tenía 533 L) |
| Atajo Ctrl+Shift+C (llama a la entidad enfocada con `data-phone`); Ctrl+Shift+D/M/A | `SoftphoneDock.tsx:39`; `SoftphoneProvider.tsx` | 🟡 **corregido a medias en la ronda 2**: `CallsTable` ya renderiza `CallButton` y expone `data-phone`/`data-customer-id`/`data-opportunity-id` en cada fila (con `tabIndex`), así que el atajo funciona en `/app/crm/llamadas`. En las tarjetas del pipeline sigue sin haber `data-phone` (**pendiente de F9**) |
| Diálogo de disposición al colgar | `src/components/voice/CallDispositionDialog.tsx` + `callDispositionService.ts:58` `applyDisposition` | ✅ |
| Página Llamadas con fila expandible (player + transcripción + análisis) y deep link `?call=` | `src/app/app/crm/llamadas/page.tsx`, `src/components/voice/CallsTable.tsx:90`, `CallRowDetail.tsx` | 🟡 (sin sesión de navegador en esta ronda) |
| Pestaña Telefonía (números, caller id, grabación, consentimiento, retención, timeout, "Mi celular" con OTP `mobile_verification`) | `src/components/configuracion/crm/TelefoniaTab.tsx:20` + `telefonia/{PhoneNumbersSection,RecordingConsentSection,MyMobileSection}.tsx` | 🟡 |
| Importar números reales de Twilio a `phone_numbers` | `src/app/api/crm/phone-numbers/import/route.ts:19` | 🟡 |

**Pendiente de esta fase (ronda 2):** llamada real end-to-end con un número Twilio + ngrok (webhooks `status`, `dial-complete`, `recording`), verificación visual del dock con sesión iniciada, y borrado definitivo de `integrations/twilio/voice/incoming` cuando ningún número apunte allí.

### 1.2 Estado tras la ronda 2 (2026-09-09)

Cierra el informe del tester (`TEST-F3-r1`: 122 casos, 19 fallos, 7,5/10). Verificado con `tsc`
acotado (0 errores propios), `jest` (32 casos en `f3Adversarial` + suites de F3) y **payloads
firmados contra el dev server con lectura por SQL de la fila resultante**; los datos de prueba
se borraron y se comprobó por SQL que no queda ninguno.

| Defecto (tester) | Corrección | Evidencia |
|---|---|---|
| **A1 · `dial-complete` degradaba un terminal y borraba la duración** | `mergeTerminalOutcome` (`callStateMachine.ts`): un terminal no se degrada y la duración nunca se pisa con 0; solo se refina un terminal "sin información" (`canceled`/`no_answer` con 0 s) cuando el `<Dial>` demuestra conversación. `dial-complete` concilia el cobro con `settleVoiceCall(..., {reconcile:true})` | `status completed dur=120` → `completed`/120 s/0.0884; `dial-complete no-answer` sin duración → **sigue** `completed`/120 s/0.0884, con `metadata.dial_call_status='no-answer'` |
| **A2 · `customerId`/`opportunityId` de otra organización** | `filterOrgOwnedRefs` (`voiceContextService.ts`) valida la pertenencia antes de escribir; los ids ajenos se descartan a `null` y quedan en `metadata.rejected_refs` | Llamada de la org 134 con un cliente de la 135 → `customer_id=null`, `rejected_refs=[customer:4008a396…]`; con un cliente propio → se conserva y se crea 1 `activities` |
| **A3 · el buzón liquidaba la llamada al contestar** | El AMD marca `voicemail` + `metadata.awaiting_close` **sin** `ended_at`; `status` solo liquida si el estado es terminal **y** hay `ended_at`; el evento de cierre sobre un terminal aporta `ended_at`/duración sin degradar el estado | `in-progress AnsweredBy=machine_start` → `voicemail`, sin cerrar, sin liquidar, 0 filas en `comm_usage_logs`; cierre `completed dur=35` → `ended_at`, 35 s y 1 minuto cobrado (0.0442) |
| **M1 · webhooks sin acotar por organización** | `accountSidMatchesOrg` en `dial-complete`, `status`, `recording`, `consent-whisper` y `twiml/inbound`: la (sub)cuenta firmante debe ser la de la org de la fila (o la master) | Subcuenta simulada en la org 135 firmando un `dial-complete` con el `callId` de la 134 → **403** y la fila intacta |
| **M2 · caller id de la plataforma para todas las orgs** | `pickCallerId` devuelve `source`; `twiml/outbound` cuelga con "no tiene un número de salida configurado" cuando el origen es `platform` (escape solo con `VOICE_ALLOW_PLATFORM_CALLER_ID=true`) | Org 134 sin número → `<Say>…Configúralo en Configuración, CRM, Telefonía.</Say><Hangup/>`, **sin fila `calls` y sin consumir crédito** |
| **M3 · `/api/voice/call` usaba la env cruda** | Usa `getTwilioWebhookOrigin()` (mismo criterio que el resto) y responde 500 `WEBHOOK_BASE_URL_MISSING` si falta | Con `TWILIO_WEBHOOK_BASE_URL=https://app.goadmin.io/api/integrations/twilio` ya no genera `…/api/integrations/twilio/api/voice/twiml/outbound` (404) |
| **M4 · `deleteRecording` marcaba `deleted` sin borrar** | Solo marca `deleted` si Storage y el proveedor borraron (un 404 = ya no existe); si no, lanza y el lote lo cuenta en `failed` | Test invertido en `f3Adversarial.test.ts` + 2 casos nuevos |
| **M5 · `consent_given=true` sin anuncio** | La fila `calls` saliente nace con `consent_given=false`; solo `consent-whisper` lo pone a `true` cuando el aviso suena de verdad | Fila creada en la prueba: `consent_given=false` con `recording_enabled=true` |
| **M7 · `SoftphoneProvider.tsx` con 533 líneas** | Dividido en `hooks/useTwilioDevice.ts` (242 L) y `softphoneTypes.ts` (70 L); el provider queda en **289 L** | `wc -l` |
| **M8 · el atajo no encontraba la entidad** | `CallsTable` renderiza `CallButton` por fila y expone `data-phone`/`data-customer-id`/`data-opportunity-id` + `tabIndex` | Sigue pendiente en las tarjetas del pipeline (**F9**) |
| **B1/B2/B3 · bajos** | `To` exige un E.164 de ≥10 dígitos (`+5712345` ya no pasa); la entrante anónima usa el número llamado como `callerId`; un `CallStatus` desconocido se ignora en vez de cerrar la llamada como `failed` | `f3Adversarial.test.ts` |
| **Doc · 5 afirmaciones falsas** | Corregidas en §1.1, §2.1 y §13 (ver "Correcciones de documentación" en el registro de la ronda 2) | — |

**Deuda declarada tras la ronda 2**: `dock/DialPad.tsx` y `dock/AudioDeviceSelector.tsx` siguen
sin existir como archivos separados (viven en `dock/Keypad.tsx` y `hooks/useAudioDevices.ts`), y
`data-phone` sigue faltando en las tarjetas del pipeline (F9). Sin llamada real end-to-end.


---

## 2. Arquitectura y flujo

### 2.1 Vista general

```
┌─ Navegador / Electron ──────────────────────────────────────────────────────────┐
│ src/app/app/layout.tsx                                                            │
│  AuthGuard → MotionProvider → SoftphoneProvider ─┬─ AppLayout(children)          │
│                                                  ├─ SoftphoneDock (fixed)         │
│                                                  └─ IncomingCallToast             │
│ QuickActionsBar(card|drawer|detail) → "Llamar" → menú Navegador | Mi celular(F5) │
│   | Agente IA(F6)  → useSoftphone().makeCall(to,{opportunityId,customerId})       │
└──────────────┬────────────────────────────────────────────────────────────────────┘
               │ (0) POST /api/voice/token  → AccessToken(VoiceGrant outgoingApplicationSid, incomingAllow)
               │ (1) device.connect({ params:{ To, opportunityId, customerId } })  ← NO hay precheck (desviación 3)
               ▼
┌─ Twilio ───────────────────────────────────────────────────────────────────────┐
│ TwiML App (VoiceUrl)                                                            │
│ (3) POST {BASE}/api/voice/twiml/outbound  From=client:u_…_o_7  To=+57…  CallSid │
│     ← <Response><Say>aviso agente</Say>                                          │
│        <Dial callerId record=… recordingStatusCallback action=…/dial-complete>   │
│          <Number url=…/twiml/consent statusCallback=…/status>+57…</Number>       │
│ (4) POST {BASE}/api/voice/twiml/consent-whisper?callId (whisper al cliente)      │
│ (5) POST {BASE}/api/voice/status (leg hijo: initiated/ringing/answered/completed)│
│ (5') POST {BASE}/api/voice/status (leg padre vía Status Callback del TwiML App)  │
│ (6) POST {BASE}/api/voice/dial-complete?callId (DialCallStatus, DialCallDuration)│
│ (7) POST {BASE}/api/voice/recording (RecordingStatus=completed, RecordingSid)    │
└──────────────┬─────────────────────────────────────────────────────────────────┘
               ▼
┌─ Backend (Vercel, runtime nodejs) ─────────────────────────────────────────────┐
│ (3) resolveIdentity(From) → {userId, orgId} → service client (+ ids validados)   │
│     deduct_comm_credits(org,'voice',1) → INSERT calls(mode browser, dialing)     │
│     INSERT call_consents → TwiML                                                 │
│ (5) UPDATE calls (estados, SequenceNumber, answered_at, ended_at); liquida solo  │
│     si es terminal Y hay ended_at (el buzón no cierra la llamada)               │
│ (6) UPDATE calls: terminal pegajoso + duración que nunca se pisa con 0           │
│     → callActivitySync.upsertCallActivity (código, no trigger) → activities      │
│     → comm_usage_logs (minutos reales × provider_pricing) + ajuste de créditos   │
│ (7) UPSERT call_recordings(processing) → after(): descarga Basic Auth API Key    │
│     → Storage crm-call-recordings → status ready → outbound_jobs(transcribe)     │
└──────────────┬─────────────────────────────────────────────────────────────────┘
               ▼
┌─ UI ───────────────────────────────────────────────────────────────────────────┐
│ Realtime postgres_changes(calls WHERE id=…) → Dock (estado, grabación)           │
│ call.on('disconnect') → CallDispositionDialog → PATCH /api/crm/calls/[id]        │
│ OpportunityTimeline (F2) muestra la actividad con CallPlayer (+ F4 transcript)   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Secuencia saliente (browser), paso a paso

1. **Montaje**: `SoftphoneProvider` pide `getUserMedia({audio:true})` (best practice del SDK) y luego `POST /api/voice/token`; crea `new Device(token, { codecPreferences:['opus','pcmu'], closeProtection:true, logLevel:1, tokenRefreshMs:10000 })`; `device.register()`. En `tokenWillExpire` vuelve a pedir token y `device.updateToken()`.
2. **Clic Llamar → Navegador**: `QuickActionsBar` → `makeCall(to, {opportunityId, customerId})`. **`/api/voice/precheck` NO existe** (desviación 3 de la ronda 1): `makeCall` va directo a `device.connect` y las comprobaciones (E.164, caller id propio de la org, créditos) las hace `twiml/outbound`, que cuelga con un `<Say>` explicando el motivo. Consecuencia asumida: sin saldo se consume un `CallSid` y queda una fila `calls` `failed`.
3. `device.connect({ params: { To:'+57…', opportunityId, customerId } })`. Twilio crea el leg padre (`CallSid` CA…, `From=client:u_…_o_7`) y pide TwiML al **VoiceUrl** del TwiML App.
4. `POST /api/voice/twiml/outbound`: valida firma (token de la (sub)cuenta por `AccountSid`), parsea identity → `{userId, orgId}`, lee `comm_settings` + caller id, hace `deduct_comm_credits(org,'voice',1)` (reserva de 1 minuto; si `false` → `<Say>Sin créditos</Say><Hangup/>` y `calls.status='failed'` con `metadata.reason='no_credits'`), inserta `calls` (`provider_call_sid=CallSid`, `mode='browser'`, `status='dialing'`, `from_number=callerId`, `to_number=To`, `user_id`, `opportunity_id`, `customer_id`, `recording_enabled`, `metadata.identity`), inserta `call_consents` y responde el TwiML de 4.5.1.
5. Twilio marca al cliente (leg hijo `outbound-dial`, `ParentCallSid=CallSid`). Al contestar, reproduce el whisper `<Number url>` (consentimiento) al cliente y luego conecta. `record-from-answer-dual` empieza a grabar al contestar, así el aviso queda dentro de la grabación como evidencia.
6. `POST /api/voice/status` recibe eventos del hijo (`initiated → ringing → in-progress → completed|busy|no-answer|failed|canceled`) y del padre (vía Status Callback URL del TwiML App). Solo el hijo mueve `calls.status` (2.4); el padre solo cierra si el hijo nunca llegó (agente colgó antes de timbrar).
7. `POST /api/voice/dial-complete?callId=` (action de `<Dial>`; **no cuelga de `twiml/`**) recibe `DialCallStatus`, `DialCallSid`, `DialCallDuration`, `DialBridged`: fija el estado final **sin degradar un terminal ya escrito** y `duration_seconds` (fuente `provider`, nunca se pisa con 0), guarda `customer_leg_sid=DialCallSid`, responde `<Hangup/>`. Es el punto que crea la actividad (`callActivitySync.upsertCallActivity`, en código) y concilia los créditos.
8. `POST /api/voice/recording` con `RecordingStatus=completed`: upsert `call_recordings` (`processing`), y en `after()` descarga + sube a Storage + `ready` + `retention_until` + `outbound_jobs(kind='transcribe')`. Si `absent` → `failed`.
9. En el browser, `call.on('disconnect')` abre `CallDispositionDialog` (resultado, próxima acción, nota) → `PATCH /api/crm/calls/[id]`. La fila `calls.id` la conoce el cliente por Realtime (`postgres_changes` filtrado por `provider_call_sid = call.parameters.CallSid`).

### 2.3 Secuencia entrante

1. Twilio recibe llamada en un número de la org (VoiceUrl del número = `{BASE}/api/voice/twiml/inbound`).
2. Firma → `resolveOrgFromExternal(To,'phone')` (F0) → `phone_numbers` (`assigned_user_id`, `organization_id`) → `comm_settings`.
3. Si `From` es el celular verificado de un vendedor (`user_comm_preferences.mobile_phone_e164`) → rama "llamada desde el celular sin abrir la app" (F5, opcional).
4. Inserta `calls` (`direction='inbound'`, `mode='inbound'`, `status='ringing'`, `from_number=From`, `to_number=To`, `customer_id` por lookup de `customers.phone`), responde `<Say>aviso</Say><Dial timeout callerId=From record=… action=…/inbound-after><Client statusCallback>identity</Client>[…]</Dial>`; ring group si no hay asignado: hasta 10 `<Client>` (miembros activos con `default_call_mode='browser'`).
5. Si `DialCallStatus != completed` en `inbound-after` → `<Say>buzón</Say><Record maxLength="120" recordingStatusCallback playBeep>` (mono) o `<Redirect>` al agente IA (F6) si `comm_settings.voice_agent_enabled`.

### 2.4 Máquina de estados `calls.status`

| Estado | Desde | Evento Twilio (leg) | Quién escribe | Efectos |
|---|---|---|---|---|
| `dialing` | (inicial) | insert en `twiml/outbound` (browser) / `bridge/initiate` (F5) / `twiml/ai-agent` (F6) | webhook TwiML / API sesión | `started_at=now()` |
| `ringing` | `dialing` | `CallStatus=ringing` (hijo) · entrante: insert en `twiml/inbound` | `/api/voice/status` | `metadata.ringing_at` |
| `in_progress` | `dialing`, `ringing` | `CallStatus=in-progress` (hijo) · entrante: `in-progress` del `<Client>` | `/api/voice/status` | `answered_at=now()`, `ring_seconds=answered_at-started_at` |
| `completed` | `in_progress` | `DialCallStatus=completed` (action) o `CallStatus=completed` con `answered_at` | `dial-complete` / `status` | `ended_at`, `duration_seconds=DialCallDuration`, `duration_source='provider'`; actividad vía `callActivitySync` (código, no trigger); `comm_usage_logs` |
| `busy` | `dialing`, `ringing` | `DialCallStatus=busy` / `CallStatus=busy` | `dial-complete` / `status` | `ended_at`; `duration_seconds=0` |
| `no_answer` | `ringing` | `DialCallStatus=no-answer` / `CallStatus=no-answer` (timeout) | idem | `ended_at` |
| `failed` | `dialing`, `ringing` | `DialCallStatus=failed` / `CallStatus=failed` / sin créditos / error TwiML | idem + `twiml/outbound` | `metadata.reason`, `SipResponseCode` |
| `canceled` | `dialing`, `ringing` | `DialCallStatus=canceled` / `CallStatus=canceled` (agente colgó antes) / padre `completed` sin `answered_at` | `dial-complete` / `status` | `ended_at` |
| `voicemail` | `in_progress` | `AnsweredBy in (machine_start, machine_end_*)` (solo si `voice_amd_enabled`) | `/api/voice/status` | `answered_by='machine'`, `metadata.awaiting_close=true`; **NO cierra la llamada**: sin `ended_at` no se liquida, y el cierre posterior aporta la duración real (ronda 2). La disposición del usuario también puede fijarlo |

Reglas: los estados terminales (`completed|busy|no_answer|failed|canceled|voicemail`) son **pegajosos** en `status` **y en `dial-complete`** (ronda 2, `mergeTerminalOutcome`): solo `voicemail` puede sobrescribir `completed` por disposición manual, y un terminal "sin información" (`canceled`/`no_answer` con 0 s) se refina a `completed` si el `<Dial>` trae duración > 0. La duración nunca se sobrescribe con 0. Los eventos se aplican solo si `SequenceNumber` > `metadata.last_seq[leg]` (idempotencia ante reintentos y desorden); un evento terminal sobre una llamada ya terminal solo rellena `ended_at`/`duration_seconds`. Un `CallStatus` fuera del vocabulario de Twilio se **ignora**. El padre (`client:` leg) nunca escribe `in_progress`. `answered_by` se mapea `human|machine|fax|unknown` (`machine_*` → `machine`).

---

## 3. Base de datos

### 3.1 Migraciones (aplicar SOLO con MCP `apply_migration`; nada de `.sql` en el repo)

#### `202609_crm_v4_f03_user_comm_preferences`

```sql
-- Preferencias de comunicación por usuario y organización (D4: elegido sobre profiles.phone).
CREATE TABLE IF NOT EXISTS public.user_comm_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mobile_phone_e164 text CHECK (mobile_phone_e164 IS NULL OR mobile_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  mobile_verified_at timestamptz,
  default_call_mode text NOT NULL DEFAULT 'browser' CHECK (default_call_mode IN ('browser','mobile')),
  default_caller_id_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  voice_id uuid,                              -- FK lógica a voices (F6); sin constraint hasta que exista
  audio_input_label text,                     -- solo etiqueta; el deviceId real vive en localStorage
  audio_output_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_ucp_org_mobile ON public.user_comm_preferences (organization_id, mobile_phone_e164)
  WHERE mobile_phone_e164 IS NOT NULL;

ALTER TABLE public.user_comm_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ucp_select ON public.user_comm_preferences;
CREATE POLICY ucp_select ON public.user_comm_preferences FOR SELECT
  USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS ucp_insert ON public.user_comm_preferences;
CREATE POLICY ucp_insert ON public.user_comm_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid() AND organization_id IN (SELECT om.organization_id FROM public.organization_members om
                             WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS ucp_update ON public.user_comm_preferences;
CREATE POLICY ucp_update ON public.user_comm_preferences FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- mobile_phone_e164 / mobile_verified_at solo se escriben desde el servidor (service role) tras OTP (F5).

CREATE OR REPLACE FUNCTION public.fn_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_ucp_touch ON public.user_comm_preferences;
CREATE TRIGGER trg_ucp_touch BEFORE UPDATE ON public.user_comm_preferences
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
```

#### `202609_crm_v4_f03_calls_indexes_and_settings`

```sql
-- Índices que F3 consume (los existentes se conservan).
CREATE INDEX IF NOT EXISTS idx_calls_org_user_started ON public.calls (organization_id, user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_customer_leg_sid ON public.calls (customer_leg_sid) WHERE customer_leg_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_org_active ON public.calls (organization_id)
  WHERE status IN ('dialing','ringing','in_progress');
CREATE INDEX IF NOT EXISTS idx_calls_metadata_disposition ON public.calls ((metadata->>'disposition_outcome'))
  WHERE metadata ? 'disposition_outcome';
CREATE INDEX IF NOT EXISTS idx_recordings_retention ON public.call_recordings (retention_until)
  WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS idx_phone_numbers_assigned ON public.phone_numbers (organization_id, assigned_user_id)
  WHERE is_active = true;

-- Ajustes de telefonía nuevos (las 7 columnas voice_* ya existen).
ALTER TABLE public.comm_settings
  ADD COLUMN IF NOT EXISTS voice_amd_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_consent_voice text NOT NULL DEFAULT 'Polly.Mia-Neural',
  ADD COLUMN IF NOT EXISTS voice_consent_language text NOT NULL DEFAULT 'es-MX'
    CHECK (voice_consent_language IN ('es-MX','es-US','es-ES')),
  ADD COLUMN IF NOT EXISTS voice_contact_hours jsonb NOT NULL DEFAULT '{"tz":"America/Bogota","from":"07:00","to":"20:00","days":[1,2,3,4,5,6]}'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_inbound_ring_group boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_voicemail_enabled boolean NOT NULL DEFAULT true;

-- Backfill: el mensaje de consentimiento no puede quedar vacío si hay grabación.
UPDATE public.comm_settings SET voice_consent_message =
  'Esta llamada será grabada con fines de calidad y servicio. Si no está de acuerdo, por favor cuelgue.'
  WHERE coalesce(btrim(voice_consent_message),'') = '';
ALTER TABLE public.comm_settings DROP CONSTRAINT IF EXISTS comm_settings_consent_required;
ALTER TABLE public.comm_settings ADD CONSTRAINT comm_settings_consent_required
  CHECK (voice_recording_enabled = false OR length(btrim(voice_consent_message)) >= 20);
```

#### `202609_crm_v4_f03_provider_pricing`

```sql
-- Precios de proveedor (D6). Si F0 ya la creó, esta migración es no-op.
CREATE TABLE IF NOT EXISTS public.provider_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,                       -- twilio | elevenlabs | openai | google | resend | meta
  sku text NOT NULL,                            -- voice_out_mobile_co, voice_out_landline_co, voice_sdk_min, recording_min, amd_call, ...
  unit text NOT NULL CHECK (unit IN ('minute','call','message','1k_chars','hour','month','1m_tokens')),
  unit_price numeric(12,6) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  country text,                                 -- ISO-3166 alpha-2 o NULL (global)
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, sku, country, valid_from)
);
ALTER TABLE public.provider_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_select_all ON public.provider_pricing;
CREATE POLICY pp_select_all ON public.provider_pricing FOR SELECT TO authenticated USING (true);
-- Escritura solo service role (sin política de INSERT/UPDATE para authenticated).

CREATE OR REPLACE FUNCTION public.fn_price(p_provider text, p_sku text, p_country text DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_price FROM public.provider_pricing
   WHERE provider = p_provider AND sku = p_sku
     AND (country = p_country OR country IS NULL)
     AND valid_from <= current_date AND (valid_to IS NULL OR valid_to >= current_date)
   ORDER BY country NULLS LAST, valid_from DESC LIMIT 1;
$$;
```

#### `202609_crm_v4_f03_calls_activity_trigger`

```sql
-- Parte mínima de D4 que F3 necesita; idempotente frente a F2.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_call ON public.activities (call_id) WHERE call_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_calls_completed_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_outcome text; v_related_type text; v_related_id uuid;
BEGIN
  IF NEW.status NOT IN ('completed','busy','no_answer','failed','canceled','voicemail') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status AND (OLD.metadata->>'disposition_outcome') IS NOT DISTINCT FROM (NEW.metadata->>'disposition_outcome') THEN RETURN NEW; END IF;
  v_outcome := coalesce(NEW.metadata->>'disposition_outcome',
                 CASE NEW.status WHEN 'completed' THEN 'contacted' WHEN 'no_answer' THEN 'no_answer'
                   WHEN 'busy' THEN 'busy' WHEN 'voicemail' THEN 'voicemail' ELSE 'failed' END);
  IF NEW.opportunity_id IS NOT NULL THEN v_related_type := 'opportunity'; v_related_id := NEW.opportunity_id;
  ELSIF NEW.customer_id IS NOT NULL THEN v_related_type := 'customer'; v_related_id := NEW.customer_id; END IF;

  INSERT INTO public.activities (organization_id, activity_type, user_id, notes, related_type, related_id,
                                 occurred_at, channel, outcome, duration_seconds, call_id, metadata)
  VALUES (NEW.organization_id, 'call', NEW.user_id,
          coalesce(NEW.metadata->>'disposition_note', NEW.metadata->>'live_note'),
          v_related_type, v_related_id, NEW.started_at,
          CASE NEW.mode WHEN 'bridge' THEN 'mobile' WHEN 'ai_agent' THEN 'ai_call' ELSE 'phone' END,
          v_outcome, NEW.duration_seconds, NEW.id,
          jsonb_build_object('direction', NEW.direction, 'mode', NEW.mode, 'status', NEW.status,
                             'from', NEW.from_number, 'to', NEW.to_number,
                             'next_action', NEW.metadata->'disposition_next_action'))
  ON CONFLICT DO NOTHING;   -- protegido por el índice único de abajo

  -- Si ya existía (segundo paso: disposición), actualiza en vez de duplicar.
  UPDATE public.activities SET
     notes = coalesce(NEW.metadata->>'disposition_note', notes),
     outcome = v_outcome, duration_seconds = NEW.duration_seconds,
     metadata = metadata || jsonb_build_object('status', NEW.status, 'next_action', NEW.metadata->'disposition_next_action'),
     updated_at = now()
   WHERE call_id = NEW.id AND organization_id = NEW.organization_id;

  IF NEW.opportunity_id IS NOT NULL AND NEW.status IN ('completed','voicemail') THEN
    UPDATE public.opportunities SET last_contact_at = coalesce(NEW.ended_at, now()),
           contact_channel = 'call', contact_result = v_outcome
     WHERE id = NEW.opportunity_id AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activities_call ON public.activities (call_id) WHERE call_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_calls_completed_activity ON public.calls;
CREATE TRIGGER trg_calls_completed_activity AFTER UPDATE OF status, metadata ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.fn_calls_completed_activity();

-- Realtime para el dock y F5.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;
```

> Nota sobre `activities.activity_type`: el CHECK actual admite `call` (verificado), así que el trigger no depende de la ampliación de F2. `channel` es texto libre; se usa `phone|mobile|ai_call`.

### 3.2 Seeds

```sql
INSERT INTO public.provider_pricing (provider, sku, unit, unit_price, country) VALUES
 ('twilio','voice_out_mobile','minute',0.0377,'CO'),
 ('twilio','voice_out_landline','minute',0.0700,'CO'),
 ('twilio','voice_in_local','minute',0.0945,'CO'),
 ('twilio','voice_sdk','minute',0.0040,NULL),
 ('twilio','recording','minute',0.0025,NULL),
 ('twilio','recording_storage','minute',0.0005,NULL),
 ('twilio','amd','call',0.0075,NULL),
 ('twilio','phone_number_local','month',14.00,'CO'),
 ('twilio','tts_neural','1k_chars',0.032,NULL)
ON CONFLICT (provider, sku, country, valid_from) DO NOTHING;
-- Org de prueba (id 7 en dev): un número y preferencias del vendedor.
-- INSERT INTO phone_numbers (organization_id,e164,provider,provider_sid,capabilities,is_primary) VALUES (7,'+5760XXXXXXX','twilio','PN…','{"voice":true,"sms":true}',true);
```

### 3.3 Verificación post-migración

```sql
SELECT count(*) FROM information_schema.columns WHERE table_name='user_comm_preferences';          -- 12
SELECT count(*) FROM pg_policies WHERE tablename='user_comm_preferences';                            -- 3
SELECT column_name FROM information_schema.columns WHERE table_name='comm_settings' AND column_name LIKE 'voice_%' ORDER BY 1;
-- 13 filas (7 previas + amd_enabled, consent_language, consent_voice, contact_hours, inbound_ring_group, voicemail_enabled)
SELECT conname FROM pg_constraint WHERE conname='comm_settings_consent_required';                    -- 1
SELECT count(*) FROM provider_pricing WHERE provider='twilio';                                        -- 9
SELECT tgname FROM pg_trigger WHERE tgname='trg_calls_completed_activity';                           -- 1
SELECT indexname FROM pg_indexes WHERE tablename='activities' AND indexname='uq_activities_call';    -- 1
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls'; -- 1
SELECT id, public FROM storage.buckets WHERE id='crm-call-recordings';                                -- 1 fila, false (F0)
SELECT proname FROM pg_proc WHERE proname IN ('fn_price','fn_calls_completed_activity','deduct_comm_credits'); -- 3
-- Prueba funcional del trigger (rollback):
BEGIN;
INSERT INTO calls (organization_id,provider,direction,mode,from_number,to_number,status,user_id,duration_source)
 VALUES (7,'twilio','outbound','browser','+571','+572','in_progress',NULL,'provider') RETURNING id;
UPDATE calls SET status='completed', duration_seconds=95 WHERE organization_id=7 AND to_number='+572';
SELECT activity_type, outcome, duration_seconds, call_id IS NOT NULL FROM activities WHERE organization_id=7 ORDER BY created_at DESC LIMIT 1;
-- call | contacted | 95 | true
ROLLBACK;
```

### 3.4 Impacto en tablas existentes

- `calls`: sin cambios de estructura (F0 ya reconcilió los CHECK). Se empieza a escribir `metadata` con claves fijas: `identity`, `last_seq` (`{parent:n, child:n}`), `reason`, `disposition_outcome`, `disposition_next_action` (`{type: task|meeting|email|whatsapp|none, due_at}`), `disposition_note`, `live_note`, `caller_id_id`, `sip_code`, `credits_reserved_min`, `credits_final_min`, `cost_breakdown`.
- `call_recordings`: se escribe `channels='2'` (texto), `storage_provider='supabase'`, `retention_until`. `storage_provider='twilio'` deja de ser fallback permanente: solo estado transitorio mientras `status='processing'`.
- `comm_usage_logs`: se empieza a usar con `channel='voice'`, `module='crm_voice'`, `credits_used=minutos`, `recipient=to_number`, `metadata{call_id, cost_amount, sku}`.
- `activities`: nueva columna `call_id`; las llamadas ya no se registran con `notes="Duración: 120s"` (`ActivityActions:291-297`) sino por trigger.
- Se **dejan de usar**: `src/app/api/integrations/twilio/voice/incoming/route.ts` (eliminar), `src/app/api/integrations/twilio/voice/media-stream` (ya 410, eliminar), `src/lib/services/callService.ts` (muerto; su única lógica útil, `createCallActivity :87-109`, la reemplaza el trigger), `ActivityActions.CallDialog` (`:229-454`), `twilioSubaccounts.getCommSettings` para voz.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query (tipos) | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| POST | `/api/voice/token` (modificar) | sesión | — | `{token, identity, ttl:3600, callerId, recordingEnabled}` | 401 sin sesión; 409 `VOICE_NOT_CONFIGURED` (sin API Key/TwiML App/número) | n/a |
| POST | `/api/voice/precheck` (NUEVO) | sesión | `{to: string, opportunityId?: uuid, customerId?: uuid, mode:'browser'\|'mobile'}` | `{ok:true, to:E164, callerId, estimatedPerMinute, creditsMinutes, concurrent, contactAllowed}` | 400 número inválido; 402 `NO_CREDITS`; 409 `MAX_CONCURRENT`; 423 `OUTSIDE_CONTACT_HOURS`; 451 `DO_NOT_CALL` | sin efectos |
| POST | `/api/voice/twiml/outbound` (reescribir) | firma Twilio (sub)cuenta | form: `CallSid, AccountSid, From=client:{identity}, To, Caller, Direction, opportunityId?, customerId?` | `text/xml` TwiML 4.5.1 | firma inválida 403; identity inválida → TwiML `<Say>` + `<Hangup/>`; sin créditos → TwiML hangup | UNIQUE `(organization_id, provider_call_sid)`: reintento de Twilio devuelve el mismo TwiML sin duplicar |
| POST | `/api/voice/twiml/consent` (NUEVO) | firma + `callId` + `t` (HMAC) | query `callId, t`; form estándar | `<Response><Say language voice>{consent}</Say></Response>` | 403 | insert `call_consents` con `ON CONFLICT DO NOTHING` por `(call_id, consent_type)` |
| POST | `/api/voice/twiml/dial-complete` (NUEVO) | firma + `callId` + `t` | form: `DialCallStatus, DialCallSid, DialCallDuration, DialBridged, RecordingUrl?` | `<Response><Hangup/></Response>` | 403 | estado terminal pegajoso |
| POST | `/api/voice/status` (reescribir) | firma | form: `CallSid, ParentCallSid?, CallStatus, SequenceNumber, CallDuration?, AnsweredBy?, SipResponseCode?, Timestamp` | `<Response/>` 200 siempre tras validar firma | 403 | `SequenceNumber` + terminales pegajosos |
| POST | `/api/voice/recording` (reescribir) | firma | form: `RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration, RecordingChannels, CallSid, RecordingSource, RecordingStartTime` | `<Response/>` | 403 | upsert por `provider_recording_sid` (índice único) |
| GET | `/api/voice/recording/[id]/stream` (modificar) | sesión | — | 302 a URL firmada 600 s | 401/404 | n/a |
| POST | `/api/voice/twiml/inbound` (reescribir) | firma | form: `CallSid, From, To, CallerName?, FromCity…` | TwiML 4.5.4 | número no configurado → TwiML "no disponible" | insert `calls` por `provider_call_sid` único |
| POST | `/api/voice/twiml/inbound-after` (NUEVO) | firma + `callId` + `t` | `DialCallStatus, DialCallSid, DialCallDuration` | TwiML buzón / `<Hangup/>` | 403 | idem |
| GET | `/api/crm/calls` (modificar) | sesión | query `status, direction, mode, user_id, customer_id, opportunity_id, from_date, to_date, outcome, has_recording, q, limit≤200, offset` | `{data: CallRow[], count}` con join `customers(full_name), opportunities(name), profiles(first_name,last_name), call_recordings(id,status,duration_seconds)` | 400 filtros inválidos (zod) | n/a |
| GET | `/api/crm/calls/[id]` (modificar) | sesión | — | `{...call, recordings, consents, transcript?:summary (F4), analysis?:summary (F4)}` | 404 | n/a |
| PATCH | `/api/crm/calls/[id]` (modificar) | sesión | zod: `{disposition?:{outcome:'contacted'\|'no_answer'\|'voicemail'\|'busy'\|'wrong_number'\|'callback_requested', next_action?:{type:'task'\|'meeting'\|'email'\|'whatsapp'\|'none', due_at?:string, title?:string}, note?:string}, live_note?:string, status?:'voicemail'}` | `{data: call}` | 400 zod; 404; 409 si la llamada es de otro usuario y el rol no es admin | update por `id+organization_id` |
| GET/POST | `/api/crm/phone-numbers` (modificar) | sesión (POST: rol admin) | POST `{e164, label?, assigned_user_id?, is_primary?}` → valida contra Twilio `incomingPhoneNumbers.list({phoneNumber})` de la (sub)cuenta y guarda `provider_sid` + `capabilities` reales | `{data}` | 404 `NUMBER_NOT_IN_ACCOUNT`; 409 duplicado | UNIQUE `(organization_id,e164)` |
| GET | `/api/crm/phone-numbers/available` (NUEVO, opcional) | sesión admin | `country='CO', contains?` | `{data:[{phoneNumber, locality, capabilities, monthly}]}` (`availablePhoneNumbers('CO').local.list`) | 502 Twilio | n/a |
| POST | `/api/crm/phone-numbers/purchase` (NUEVO, opcional) | sesión admin | `{phoneNumber}` | crea `incomingPhoneNumbers.create({phoneNumber, voiceUrl, voiceMethod:'POST', statusCallback})` + fila `phone_numbers` | 402 créditos; 502 | por `phoneNumber` |
| PATCH | `/api/crm/phone-numbers/[id]` (modificar) | sesión admin | `{label?, assigned_user_id?, is_primary?, is_active?}`; al activar/asignar sincroniza `voiceUrl`/`statusCallback` en Twilio | `{data}` | 404 | n/a |
| GET/PATCH | `/api/crm/settings/telephony` (NUEVO) | sesión (PATCH admin) | PATCH zod: `{voice_recording_enabled, voice_consent_message (≥20 chars si grabación), voice_consent_voice, voice_consent_language, voice_recording_retention_days 7..730, voice_ring_timeout_seconds 10..60, voice_max_concurrent_calls 1..50, voice_caller_id (E.164 verificado o número de la org), voice_amd_enabled, voice_contact_hours, voice_inbound_ring_group, voice_voicemail_enabled}` | `{data: comm_settings.voice_*}` | 400; 403 rol | n/a |
| POST | `/api/crm/settings/telephony/consent-preview` (NUEVO) | sesión | `{text, voice, language}` | `audio/mpeg` (TTS de Polly vía Twilio no es descargable; se usa ElevenLabs `eleven_flash_v2_5` **solo para preview** si hay key, si no, Web Speech API en el cliente) | 501 sin proveedor | n/a |
| GET/PATCH | `/api/crm/me/comm-preferences` (NUEVO) | sesión | PATCH `{default_call_mode?, default_caller_id_id?, audio_input_label?, audio_output_label?}` (el celular se escribe solo por OTP, F5) | `{data}` | 400 | upsert PK |
| POST | `/api/voice/call` (modificar) | sesión | `{to, mode:'bridge'\|'ai_agent', opportunityId?, customerId?}` | delega a F5/F6; `mode:'browser'` → 400 `USE_SDK` | 400 | n/a |
| POST | `/api/crm/jobs/run` (F0) | cron `Bearer CRON_SECRET` | procesa kinds `recording_fetch`, `recording_cleanup` de F3 (4.4) | `{claimed, done, failed}` | 401 | `fn_claim_jobs` |

Todas las rutas de voz declaran `export const runtime = 'nodejs'` y `export const dynamic = 'force-dynamic'`; las de webhook leen `await request.text()` (no `formData()`) para reconstruir los params exactos de la firma.

### 4.2 Servicios

| Archivo | Acción | Exports (firma TS) | Responsabilidad |
|---|---|---|---|
| `src/lib/services/crm/voiceTokenService.ts` | modificar (≤120L) | `buildVoiceIdentity(userId: string, orgId: number): string` · `parseVoiceIdentity(identity: string): {userId: string; orgId: number} \| null` · `generateVoiceToken(orgId, userId, supabase): Promise<{token, identity, ttl}>` | AccessToken + VoiceGrant con credenciales del registry (`TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID` de `provider_configs` o env). Identity `u_{uuid sin guiones}_o_{orgId}`. |
| `src/lib/services/crm/voiceContextService.ts` | NUEVO (≤200L) | `resolveVoiceOrg(input: {identity?: string; accountSid?: string; toNumber?: string}): Promise<VoiceOrgContext>` donde `VoiceOrgContext = {organizationId, userId?, serviceClient, settings: TelephonySettings, twilio: {accountSid, authToken, apiKey, apiSecret, client}, callerId: string}` · `getTelephonySettings(orgId, client): Promise<TelephonySettings>` · `pickCallerId(orgId, userId, client): Promise<{e164, phoneNumberId}>` · `isWithinContactHours(settings, now?): boolean` | Única fuente de contexto para webhooks: resuelve org por identity (client-originated), por `To` (inbound) o por `AccountSid` (subcuenta); lee `comm_settings` con service client (cierra C15) y credenciales descifradas del registry (F0). |
| `src/lib/services/crm/callManagementService.ts` | modificar (F0 reconcilia tipos; F3 añade) | `CallMode = 'browser'\|'bridge'\|'ai_agent'\|'manual'\|'inbound'` · `CallStatus = 'dialing'\|…\|'voicemail'` · `createCall(orgId, input: CallCreateInput, client)` con `started_at` default `now()` y `duration_source` default `'provider'` · `applyStatusEvent(callId, orgId, ev: TwilioStatusEvent, leg: 'parent'\|'child', client): Promise<CallRecord>` (máquina de estados + `SequenceNumber`) · `applyDialComplete(callId, orgId, ev: DialCompleteEvent, client)` · `setDisposition(callId, orgId, userId, d: Disposition, client)` · `listCalls(orgId, client, filters: CallFilters): Promise<{data: CallRow[]; count}>` · `countActiveCalls(orgId, client): Promise<number>` | CRUD y transiciones válidas; lanza `CallStateError` en transición inválida (se loguea y se ignora en webhooks). |
| `src/lib/services/crm/twimlBuilders.ts` | NUEVO (≤220L) | `buildOutboundBrowserTwiml(p: OutboundTwimlParams): string` · `buildConsentTwiml(text, voice, language): string` · `buildInboundTwiml(p: InboundTwimlParams): string` · `buildVoicemailTwiml(p): string` · `buildHangupTwiml(sayText?): string` · `escapeXml(s: string): string` · `buildCallbackUrl(path: string, query: Record<string,string>): string` (siempre `encodeURIComponent` + `&` escapado en atributos) | Todo TwiML sale de aquí (testeable, cierra C9 por construcción). |
| `src/lib/services/crm/recordingStorageService.ts` | modificar (≤260L) | `buildStoragePath(orgId, callId, ext='mp3'): string` (path por **callId**, no por RecordingSid) · `downloadFromTwilio(url: string, creds: {apiKey, apiSecret}, opts?: {dual: boolean}): Promise<DownloadResult>` (añade `.mp3?RequestedChannels=2`) · `storeRecording(recordingId, orgId, client): Promise<'ready'\|'failed'>` · `getRecordingSignedUrl(recordingId, orgId, client, expiresIn=600)` · `deleteRecording(recordingId, orgId, client, twilio?)` (Storage + `DELETE /Recordings/{Sid}.json` + `status='deleted'`) · `computeRetentionUntil(days): string` | Descarga con Basic Auth API Key de la (sub)cuenta; nunca escribe `updated_at`. |
| `src/lib/services/crm/callCreditsService.ts` | NUEVO (≤160L) | `reserveVoiceMinutes(orgId, minutes, client): Promise<boolean>` (RPC `deduct_comm_credits(p_org_id, 'voice', p_amount)`) · `settleVoiceCall(call: CallRecord, client): Promise<{minutes, cost}>` (minutos reales `ceil(duration/60)`, ajusta diferencia con la reserva, inserta `comm_usage_logs`) · `estimateCallCost(to: string, mode: 'browser'\|'bridge', client): Promise<{perMinute, sku}>` (`fn_price('twilio', sku, 'CO')`; móvil CO = prefijo `+573`, fijo = `+571`/`+57[2-8]`) | D6. |
| `src/lib/services/integrations/twilio/twilioSignature.ts` | NUEVO (F0 lo crea; F3 lo consume) | `verifyTwilioWebhook(req: Request, rawBody: string, opts: {authTokenResolver: (accountSid: string) => Promise<string \| null>}): Promise<{ok: boolean; params: Record<string,string>; accountSid: string}>` · `signCallbackToken(payload: string): string` (HMAC-SHA256 con `VOICE_CALLBACK_SECRET`, 32 hex) · `verifyCallbackToken(payload, token): boolean` (`timingSafeEqual`) | Fail-closed; URL reconstruida con `TWILIO_WEBHOOK_BASE_URL + pathname + search` (C13); token de subcuenta por `AccountSid` (C12). |
| `src/lib/services/crm/phoneNumberService.ts` | NUEVO (≤220L) | `listOrgNumbers(orgId, client)` · `importNumber(orgId, e164, twilio, client)` (valida `incomingPhoneNumbers.list({phoneNumber})`, guarda `provider_sid`, `capabilities`) · `searchAvailable(twilio, {country:'CO', contains?})` · `purchaseNumber(orgId, phoneNumber, twilio, client)` · `syncNumberWebhooks(number, twilio)` (`incomingPhoneNumbers(sid).update({voiceUrl, voiceMethod:'POST', statusCallback, statusCallbackMethod:'POST'})`) · `resolveInboundTarget(orgId, toE164, client): Promise<{identities: string[]; userIds: string[]}>` | Números y su cableado a webhooks. |
| `src/lib/services/crm/callDispositionService.ts` | NUEVO (≤120L) | `applyDisposition(callId, orgId, userId, d: Disposition, client)` → `calls.metadata` + crea `tasks`/`calendar_events` según `next_action` + (opcional) `activities` se actualiza por trigger | Un solo lugar para "qué pasa al colgar". |
| `src/lib/services/crm/telephonySettingsService.ts` | NUEVO (≤120L) | `getTelephonySettings(orgId, client)` · `updateTelephonySettings(orgId, patch, client)` (zod) | Config tab. |

### 4.3 Webhooks / proveedor (payload real → verificación → mapeo)

**`POST /api/voice/twiml/outbound`** (client-originated). Payload real (form-urlencoded): `AccountSid=AC…&ApiVersion=2010-04-01&ApplicationSid=AP…&CallSid=CA…&CallStatus=ringing&Caller=client:u_1f2e…_o_7&Direction=inbound&From=client:u_1f2e…_o_7&To=+573001234567&opportunityId=…&customerId=…`. Nota: para el TwiML App, `Direction=inbound` (la llamada "entra" desde el cliente WebRTC) y el `CallToken` viene en el primer webhook. Verificación: firma con token resuelto por `AccountSid`. Mapeo: identity → `{userId, orgId}`; comprobar que `userId` es miembro activo de `orgId` (`organization_members`); `To` → E.164 (`libphonenumber-js`); insert `calls`.

**`POST /api/voice/status`**: `CallSid, ParentCallSid, AccountSid, From, To, CallStatus, SequenceNumber, Timestamp, CallbackSource=call-progress-events, Direction=outbound-dial|inbound, CallDuration (solo terminales), SipResponseCode, AnsweredBy, MachineDetectionDuration`. Resolución: si `ParentCallSid` presente → `calls.provider_call_sid = ParentCallSid` (leg hijo); si no → `provider_call_sid = CallSid` (padre o entrante). Aplicar `applyStatusEvent`. Para inbound `<Client>`, el hijo es el browser: `in-progress` → `in_progress`.

**`POST /api/voice/twiml/dial-complete?callId&t`**: `DialCallStatus (completed|answered|busy|no-answer|failed|canceled), DialCallSid, DialCallDuration, DialBridged (true|false), RecordingUrl?`. Mapeo directo a estado final; `duration_seconds = DialCallDuration`. Si `DialBridged=false` y `DialCallStatus=completed` (contestó pero no llegó a bridge, p. ej. colgó durante el whisper) → `completed` con duración 0 y `metadata.reason='hangup_during_consent'`.

**`POST /api/voice/recording`**: `AccountSid, CallSid, RecordingSid, RecordingUrl (sin extensión), RecordingStatus (in-progress|completed|absent), RecordingDuration, RecordingChannels (1|2), RecordingSource (DialVerb|RecordVerb|…), RecordingStartTime, RecordingTrack (both)`. Solo suscribimos `completed absent`. `completed` → upsert `call_recordings {provider_recording_sid, channels: String(RecordingChannels), duration_seconds, storage_path: buildStoragePath(orgId, callId), storage_provider:'supabase', status:'processing', retention_until}` y `after(() => storeRecording(...))`; si `storeRecording` falla → encola `outbound_jobs(kind:'recording_fetch', payload:{recording_id}, run_at: now()+2min, max_attempts:5)`. `absent` → `status='failed'`, `metadata.reason='absent'` en la llamada.

**`POST /api/voice/twiml/inbound`**: `CallSid, AccountSid, From, To, CallStatus=ringing, Direction=inbound, CallerName?, FromCity, FromCountry, ForwardedFrom?`. Resolución por `To` (`phone_numbers.e164`, `is_active`). Mapeo 4.5.4.

### 4.4 Jobs / cola (`outbound_jobs`, F0)

| kind | payload | Productor | Consumidor | Reintentos |
|---|---|---|---|---|
| `recording_fetch` (F3 añade el valor al CHECK de `outbound_jobs.kind`; coordinar con F0) | `{recording_id, organization_id}` | `/api/voice/recording` cuando `after()` falla; cron de reconciliación (grabaciones `processing` > 10 min) | `storeRecording` | 5 intentos, backoff 2·4·8·16·32 min; `dead` → `status='failed'` + notificación al admin (`fn_create_org_notification`) |
| `transcribe` | `{call_id, recording_id, organization_id, channels: 2, direction}` | `storeRecording` al pasar a `ready` (`dedupe_key = 'transcribe/'+recording_id`) | F4 | definido en F4 |
| `recording_cleanup` | `{organization_id?}` | pg_cron diario 03:00 America/Bogota (F0) | `deleteRecording` para `call_recordings WHERE status='ready' AND retention_until < current_date` (lotes de 200) | 3 |
| `calls_reconcile` (NUEVO, opcional) | `{}` | pg_cron cada 15 min | Llamadas en `dialing|ringing|in_progress` con `started_at < now()-4h` → consulta `client.calls(sid).fetch()` y cierra con el estado real (evita zombies si un callback se perdió) | 3 |

### 4.5 Snippets no obvios

#### 4.5.1 TwiML saliente (browser) exacto

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Conectando. Esta llamada se grabará.</Say>
  <Dial callerId="+5760XXXXXXX"
        record="record-from-answer-dual"
        recordingStatusCallback="https://app.goadmin.io/api/voice/recording"
        recordingStatusCallbackEvent="completed absent"
        recordingStatusCallbackMethod="POST"
        answerOnBridge="true"
        timeout="30"
        action="https://app.goadmin.io/api/voice/twiml/dial-complete?callId=9b2f…&amp;t=4e1c…"
        method="POST">
    <Number statusCallback="https://app.goadmin.io/api/voice/status"
            statusCallbackEvent="initiated ringing answered completed"
            statusCallbackMethod="POST"
            url="https://app.goadmin.io/api/voice/twiml/consent?callId=9b2f…&amp;t=4e1c…"
            machineDetection="Enable">+573001234567</Number>
  </Dial>
</Response>
```

Decisiones: (a) el `<Say>` inicial lo oye **solo el agente** (leg browser); el consentimiento **al cliente** va en `<Number url>` (whisper reproducido al contestar, antes del bridge) para que el cliente lo escuche siempre y quede dentro de la grabación; (b) `machineDetection` se emite solo si `voice_amd_enabled` (cuesta $0.0075/llamada); (c) `&` escapado como `&amp;` dentro de atributos (C9); (d) `timeout` = `voice_ring_timeout_seconds`.

#### 4.5.2 TwiML de consentimiento (`/api/voice/twiml/consent`)

```xml
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Hola, le habla {org.name}. Esta llamada será grabada con fines de calidad y servicio. Si no está de acuerdo, por favor cuelgue.</Say>
</Response>
```
Al terminar el TwiML del whisper, Twilio hace el bridge. `call_consents` insert: `{consent_type:'recording', method:'voice_announcement', locale:'es-MX', recorded_announcement_text: text, announced_at: now()}` y `calls.consent_given=true`.

#### 4.5.3 AccessToken (servidor)

```ts
import twilio from 'twilio';
const { AccessToken } = twilio.jwt; const { VoiceGrant } = AccessToken;
export function buildVoiceIdentity(userId: string, orgId: number) {
  return `u_${userId.replace(/-/g, '')}_o_${orgId}`;           // [A-Za-z0-9_] obligatorio
}
export function parseVoiceIdentity(identity: string) {
  const m = /^u_([0-9a-f]{32})_o_(\d{1,9})$/i.exec(identity.replace(/^client:/, ''));
  if (!m) return null;
  const h = m[1];
  return { userId: `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`, orgId: Number(m[2]) };
}
const token = new AccessToken(creds.TWILIO_ACCOUNT_SID, creds.TWILIO_API_KEY, creds.TWILIO_API_SECRET,
  { identity: buildVoiceIdentity(userId, orgId), ttl: 3600 });
token.addGrant(new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: true }));
return { token: token.toJwt(), identity: token.identity, ttl: 3600 };
```
`twimlAppSid` = `comm_settings.voice_twiml_app_sid` (subcuenta) o `TWILIO_TWIML_APP_SID` (master).

#### 4.5.4 TwiML entrante

```xml
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Gracias por llamar a {org.name}. Esta llamada será grabada.</Say>
  <Dial callerId="+573009998877" timeout="25" answerOnBridge="true"
        record="record-from-answer-dual" recordingStatusCallback="…/api/voice/recording"
        recordingStatusCallbackEvent="completed absent"
        action="…/api/voice/twiml/inbound-after?callId=…&amp;t=…" method="POST">
    <Client statusCallback="…/api/voice/status" statusCallbackEvent="initiated ringing answered completed">u_1f2e…_o_7</Client>
    <Client statusCallback="…/api/voice/status" statusCallbackEvent="initiated ringing answered completed">u_77aa…_o_7</Client>
  </Dial>
</Response>
```
`inbound-after` con `DialCallStatus` ∈ `no-answer|busy|failed` y `voice_voicemail_enabled` → `<Say>…deje su mensaje después del tono</Say><Record maxLength="120" playBeep="true" recordingStatusCallback="…/api/voice/recording" recordingStatusCallbackEvent="completed absent"/>` (mono, `channels='1'`, `calls.status='voicemail'`, `direction='inbound'`).

#### 4.5.5 Verificación de firma con URL reconstruida y token de (sub)cuenta

```ts
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const { pathname, search } = new URL(req.url);
  const url = `${process.env.TWILIO_WEBHOOK_BASE_URL}${pathname}${search}`;   // BASE = origin, sin path
  const authToken = await resolveAuthTokenByAccountSid(params.AccountSid);     // master o subcuenta (F0, cifrado)
  if (!authToken || !twilio.validateRequest(authToken, req.headers.get('x-twilio-signature') ?? '', url, params)) {
    return new Response('Forbidden', { status: 403 });                          // fail-closed, sin "warn & continue"
  }
  // … handler
}
```

#### 4.5.6 Descarga de grabación dual con API Key y `after()`

```ts
import { after } from 'next/server';
const auth = Buffer.from(`${creds.TWILIO_API_KEY}:${creds.TWILIO_API_SECRET}`).toString('base64');
const res = await fetch(`${recordingUrl}.mp3?RequestedChannels=2`, { headers: { Authorization: `Basic ${auth}` },
  signal: AbortSignal.timeout(20_000) });
if (!res.ok) throw new Error(`twilio ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
await client.storage.from('crm-call-recordings').upload(path, buf, { contentType: 'audio/mpeg', upsert: true });
// en el handler del webhook:
after(async () => { const r = await storeRecording(recId, orgId, client); if (r === 'failed') await enqueue('recording_fetch', …); });
return new Response('<Response/>', { headers: { 'Content-Type': 'application/xml' } });
```

#### 4.5.7 Cliente: `Device` y `connect`

```ts
await navigator.mediaDevices.getUserMedia({ audio: true });                    // pedir permiso ANTES del Device
const device = new Device(token, { codecPreferences: ['opus', 'pcmu'], closeProtection: true, logLevel: 1,
  tokenRefreshMs: 10_000, allowIncomingWhileBusy: false, appName: 'goadmin-crm', appVersion: APP_VERSION });
device.on('tokenWillExpire', async () => device.updateToken((await fetchVoiceToken()).token));
await device.register();
const call = await device.connect({ params: { To: e164, opportunityId: oppId ?? '', customerId: custId ?? '' } });
call.on('accept', () => setCallSid(call.parameters.CallSid));                   // clave para Realtime y disposición
call.sendDigits('1'); call.mute(true); call.disconnect();
await device.audio.setInputDevice(inputId); device.audio.speakerDevices.set(outputId);
```

### 4.6 Variables de entorno

| Variable | Nueva/cambia | Uso |
|---|---|---|
| `TWILIO_WEBHOOK_BASE_URL` | cambia (F0) | **Origin público sin path** (`https://app.goadmin.io`); en dev, URL de ngrok. |
| `TWILIO_API_KEY`, `TWILIO_API_SECRET` | nuevas | Fallback global (master) para AccessToken y Basic Auth de grabaciones; el registry las expone como `provider.credentials.TWILIO_API_KEY/SECRET`. Tipo Main/Standard (no Restricted). |
| `TWILIO_TWIML_APP_SID` | nueva | TwiML App master (VoiceUrl → `/api/voice/twiml/outbound`, Status Callback → `/api/voice/status`). |
| `TWILIO_MASTER_ACCOUNT_SID`, `TWILIO_MASTER_AUTH_TOKEN` | existentes | Firma de webhooks de la cuenta master; creación de subcuentas. |
| `VOICE_CALLBACK_SECRET` | nueva | HMAC de los tokens `t` en `action`/`url` de TwiML (defensa en profundidad además de la firma). 32+ bytes aleatorios. |
| `NEXT_PUBLIC_APP_VERSION` | nueva (opcional) | `appVersion` del Device para diagnósticos en Voice Insights. |
| `ELEVENLABS_API_KEY` | existente | Solo para preview TTS del mensaje de consentimiento (F4/F6 la usan de verdad). |

### 4.7 Dependencias npm

| Paquete | Versión | Motivo |
|---|---|---|
| `twilio` | `^6.1.0` (subir desde `^5.12.1`; exige Node ≥20 → `engines.node >=20`, Railway `node:20-slim`) | `AccessToken`, `validateRequest`, `calls.create`, `incomingPhoneNumbers`. |
| `@twilio/voice-sdk` | `^2.18.4` (desde `^2.18.3`) | Device/Call en browser y Electron; importar con `dynamic(..., {ssr:false})` en el provider. |
| `libphonenumber-js` | `^1.11` (NUEVO) | Normalización E.164 y clasificación móvil/fijo CO (reemplaza `formatE164` ingenuo de `twilioConfig.ts:89`). |
| `zod` | existente | Validación de PATCH/settings. |

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| (global) | `src/app/app/layout.tsx` (modificar) | Monta `SoftphoneProvider` dentro de `AuthGuard`/`MotionProvider`, y `SoftphoneDock` + `IncomingCallToast` una sola vez. |
| `/app/crm/llamadas` | `src/app/app/crm/llamadas/page.tsx` (modificar, ≤120L) | Quita el provider local (`:199-205`); stats + `CallsTable` + `CallDetailSheet`. Entrada en nav. |
| `/app/crm/llamadas?call={id}` | misma página | Abre `CallDetailSheet` por query (deep link desde timeline/notificaciones). |
| `/app/configuracion?modulo=crm&tab=telefonia` | `src/components/configuracion/crm/TelephonySettingsTab.tsx` (NUEVO) | Números, caller id, grabación, consentimiento, retención, timeout, AMD, horario, mi celular. |
| `/app/crm/pipeline`, `/app/crm/oportunidades/[id]`, `/app/crm/clientes/[id]` | `PipelineStages.tsx:956`, `OpportunityDrawer.tsx:438`, `OpportunityDetail.tsx:747`, `clientes/[id]/page.tsx` | Insertan `QuickActionsBar` (variant `card|drawer|detail`). |

### 5.2 Componentes

| Archivo | Acción / tamaño | Props (TS) | Estado / hooks / servicios |
|---|---|---|---|
| `src/components/voice/SoftphoneProvider.tsx` | reescribir ≤220L | `{children}` | Estado `deviceState: 'unregistered'\|'registering'\|'registered'\|'error'\|'no_permission'\|'not_configured'`, `callStatus: 'idle'\|'precheck'\|'connecting'\|'ringing'\|'connected'\|'ended'`, `activeCall: {callSid, callId?, to, opportunityId?, customerId?, startedAt?, recording: boolean}`, `incoming: {call, from, customer?, openOpportunities}`, `muted`, `audioDevices`. Métodos: `makeCall(to, ctx)`, `hangup()`, `mute(b)`, `sendDigits(d)`, `acceptIncoming()`, `rejectIncoming()`, `setInputDevice(id)`, `setOutputDevice(id)`, `saveLiveNote(text)`. Usa `useTwilioDevice` y `useCallRealtime`. Sin `POST /api/voice/call`. |
| `src/components/voice/hooks/useTwilioDevice.ts` | NUEVO ≤180L | `(opts:{enabled:boolean}) => {device, deviceState, error}` | `import('@twilio/voice-sdk')` dinámico; `getUserMedia` previo; `register`/`destroy`; `tokenWillExpire`; `error` code 31204/31205 → re-token; 31208 → `no_permission`; token 409 → `not_configured` (sin reintentos cada 5 s: backoff 30 s, máx 5). |
| `src/components/voice/hooks/useCallRealtime.ts` | NUEVO ≤80L | `(callSid: string \| null) => {call: CallRow \| null}` | `supabase.channel('call:'+sid).on('postgres_changes', {event:'UPDATE', schema:'public', table:'calls', filter:'provider_call_sid=eq.'+sid})`; carga inicial vía `GET /api/crm/calls?provider_call_sid=`. |
| `src/components/voice/SoftphoneDock.tsx` | reescribir ≤200L (shell) | — | Estados: colapsado / marcador / en llamada / finalizada. Subcomponentes abajo. `role="region" aria-label="Softphone"`. |
| `src/components/voice/dock/DialPad.tsx` | extraer ≤90L | `{value, onChange, onCall, disabled}` | Teclas navegables; teclado físico. |
| `src/components/voice/dock/CallControls.tsx` | NUEVO ≤120L | `{muted, onMute, onDigits, onHangup, onTransfer?, recording, duration}` | Mute, DTMF (`call.sendDigits`), colgar, indicador `● REC` (rojo) si `recording`, timer `mm:ss`; transferencia ciega básica: `POST /api/crm/calls/[id]/transfer {to: identity\|E164}` (opcional, hace `client.calls(customerLegSid).update({twiml})`). |
| `src/components/voice/dock/AudioDeviceSelector.tsx` | NUEVO ≤90L | `{inputs, outputs, inputId, outputId, onInput, onOutput}` | `device.audio.availableInputDevices/availableOutputDevices`; `speakerDevices.set` solo en Chrome/Edge (feature-detect); persiste en `localStorage('goadmin.voice.audio')`. |
| `src/components/voice/dock/LiveNote.tsx` | NUEVO ≤70L | `{callId, onSaved}` | Textarea con autosave (debounce 1,5 s) → `PATCH /api/crm/calls/[id] {live_note}`; al colgar se copia al diálogo de disposición. |
| `src/components/voice/IncomingCallToast.tsx` | reescribir ≤110L | — | Muestra `from`, cliente resuelto (`GET /api/crm/customers/lookup?phone=` NUEVO o reutiliza búsqueda existente), oportunidades abiertas (conteo), botones Aceptar/Rechazar; `role="alertdialog"`, foco en Aceptar, `Esc` rechaza. |
| `src/components/voice/CallButton.tsx` | conservar (≤120L) | ya definidas | Se usa dentro de `QuickActionsBar` como acción "Navegador". |
| `src/components/crm/shared/QuickActionsBar.tsx` | NUEVO ≤160L | `{opportunityId?: string; customerId?: string; phone?: string \| null; email?: string \| null; variant: 'card'\|'drawer'\|'detail'; onActionCompleted?: (kind) => void}` | Botones Llamar (menú), Email (F7), WhatsApp (F8), Reunión, Tarea, Nota. `card` = icon-only con `stopPropagation` (B17). Llamar abre `CallModeMenu`. |
| `src/components/crm/shared/CallModeMenu.tsx` | NUEVO ≤120L | `{phone, opportunityId?, customerId?, onSelect}` | DropdownMenu: **Navegador** (estado del dispositivo: verde registrado / gris "sin micrófono" / naranja "no configurado → Configurar"), **Mi celular** (F5; deshabilitado con tooltip si no hay celular verificado), **Agente IA** (F6). Recuerda `default_call_mode`. |
| `src/components/voice/CallDispositionDialog.tsx` | NUEVO ≤200L | `{callId, defaultNote?, onClose}` | Radio resultado (contactado / no contesta / buzón / ocupado / número inválido / pidió que lo llamen), próxima acción (ninguna / tarea con fecha / reunión / email / WhatsApp), nota (prefill `live_note`). `PATCH /api/crm/calls/[id]`. `Ctrl+Enter` guarda. |
| `src/components/voice/CallsTable.tsx` | modificar ≤260L | `{filters, onOpen}` | Columnas: fecha, dirección/modo (icono), contacto (cliente → oportunidad), usuario, duración, resultado, grabación (▶), estado. Filtros: rango, dirección, modo, usuario, resultado, "con grabación", búsqueda. Estados válidos de BD. |
| `src/components/voice/CallDetailSheet.tsx` | NUEVO ≤220L | `{callId, open, onOpenChange}` | Sheet con cabecera (contacto, números, duración, estado, usuario), `CallPlayer`, disposición editable, `CallTranscriptPanel` (F4, lazy), etiquetas (`/api/crm/calls/[id]/tags`). |
| `src/components/voice/CallPlayer.tsx` | conservar (180L) | `{recordingId}` | Reproduce `/api/voice/recording/{id}/stream`; añade velocidad 1x/1.5x/2x y `aria-label`. |
| `src/components/configuracion/crm/TelephonySettingsTab.tsx` | NUEVO ≤120L (shell con tabs internas) | — | Secciones abajo. |
| `src/components/configuracion/crm/telephony/PhoneNumbersSection.tsx` | NUEVO ≤220L | — | Tabla de números (e164, etiqueta, asignado a, capacidades, primario, activo), "Importar número de la cuenta", "Comprar número (CO)" (opcional), asignar usuario, activar. Vacío → CTA. |
| `src/components/configuracion/crm/telephony/RecordingConsentSection.tsx` | NUEVO ≤200L | — | Switch grabación, textarea consentimiento (mín 20 chars, contador, variables `{{org.name}}`), select voz (`Polly.Mia-Neural`, `Polly.Andres-Neural`, `Polly.Lupe-Neural`), idioma (`es-MX|es-US|es-ES`), botón "Escuchar" (preview), retención (slider 7–730), timeout, concurrencia, AMD, horario de contacto, ring group, buzón. |
| `src/components/configuracion/crm/telephony/MyMobileSection.tsx` | NUEVO ≤160L (compartido con F5) | — | Mi celular (E.164) + OTP (F5), modo de llamada por defecto, caller id por defecto, dispositivos de audio. |
| `src/components/app-layout/AppLayout.tsx:127-138` y `src/config/moduleConfig.ts:136-141` | modificar | — | Añadir `{name:'Llamadas', href:'/app/crm/llamadas', icon:<Phone/>}` y `{name:'Leads', href:'/app/crm/leads'}`. |
| `src/components/crm/pipeline/drawer/ActivityActions.tsx` | modificar | — | Eliminar `CallDialog` (`:229-454`) y el botón `:116`; la barra la sustituye `QuickActionsBar`. |

### 5.3 Flujos de usuario

**A. Llamar desde la tarjeta Kanban**
1. Hover/focus en la tarjeta → aparece `QuickActionsBar` (`card`) con 📞 ✉️ 💬.
2. Clic 📞 (no abre el drawer: `stopPropagation`) → `CallModeMenu`. Primera vez: si `default_call_mode` no existe, muestra los tres modos; después, el modo por defecto está primero y con `Enter` se ejecuta directo.
3. "Navegador": el dock se expande, muestra "Verificando…" (precheck) → "Llamando a Juan Pérez · +57 300…" con pulso; el vendedor oye "Conectando. Esta llamada se grabará".
4. Cliente contesta → oye el consentimiento → bridge; dock muestra `● REC 00:07`, mute, DTMF, nota en vivo.
5. Colgar (botón, `Ctrl+Shift+D`, o el cliente cuelga) → `CallDispositionDialog` con la nota en vivo precargada.
6. Guardar → toast "Llamada registrada (2:35)"; la tarjeta muestra "Último contacto: hoy · llamada" (viene de `opportunities.last_contact_at`, F2 la renderiza); el timeline muestra la actividad con player al quedar `ready` (≈30–90 s después) y transcripción cuando F4 termina.

**B. Desde el drawer / detalle**: mismo menú en la barra sticky (`drawer`) o en la cabecera (`detail`); el detalle además lista llamadas previas de la oportunidad (`GET /api/crm/calls?opportunity_id=`).

**C. Entrante**: suena (tono del SDK) + `IncomingCallToast` arriba a la derecha con "Juan Pérez · Rest. El Corral · 2 oportunidades abiertas" → Aceptar (`Enter`) → dock en llamada; al colgar, disposición; si nadie contesta en 25 s → buzón; el vendedor ve la llamada perdida en `/app/crm/llamadas` con badge "Buzón" y player.

**D. Configurar telefonía (admin)**: `/app/configuracion?modulo=crm&tab=telefonia` → sección Números vacía con CTA "Importar número" → modal pide E.164 → valida contra Twilio → guarda → asignar usuario → activar (cablea VoiceUrl) → Grabación ON → editar consentimiento → "Escuchar" → guardar. El dock de todos los usuarios pasa de "no configurado" a registrado en el siguiente refresco de token (≤60 s) sin recargar.

### 5.4 Wireframes ASCII

```
Tarjeta Kanban (hover)                      CallModeMenu
┌───────────────────────────────┐          ┌──────────────────────────────────┐
│ Rest. El Corral · $12.500.000 │          │ 🖥  Navegador          ● listo    │
│ Juan Pérez · cierra 30 sep    │          │ 📱  Mi celular  +57 310…  ✓      │
│ 🔥 caliente · último: hoy 📞  │          │ 🤖  Agente IA   "Confirmar demo" │
│                 [📞][✉️][💬][…]│          └──────────────────────────────────┘
└───────────────────────────────┘

SoftphoneDock (en llamada)                            IncomingCallToast
┌──────────────────────────────────────────────┐    ┌──────────────────────────────┐
│ ● REC  02:34   Juan Pérez · Rest. El Corral   │    │ 📞 Llamada entrante           │
│ +57 300 123 4567 · Oportunidad: Renovación    │    │ Juan Pérez · +57 300 123 4567 │
│ [🔇 Mute] [⌨ DTMF] [🎧 Audio] [↪ Transferir] │    │ Rest. El Corral · 2 abiertas  │
│ [✖ Colgar Ctrl+Shift+D]                        │    │ [Rechazar]      [Aceptar ⏎]   │
│ Nota en vivo: "Pide cotización con 2 espacios"│    └──────────────────────────────┘
└──────────────────────────────────────────────┘

CallDispositionDialog                                  /app/crm/llamadas
┌──────────────────────────────────────────────┐    ┌────────────────────────────────────────────────────┐
│ Resultado de la llamada (2:34)                │    │ Llamadas   [Hoy ▾][Dirección ▾][Usuario ▾][Resultado ▾]│
│ (•) Contactado ( ) No contesta ( ) Buzón      │    │ Fecha  Dir  Contacto            Usuario Dur  Res.  ▶ │
│ ( ) Ocupado ( ) Número inválido ( ) Pidió…    │    │ 10:32  ↗🖥  Juan Pérez › Renov.  Ana    2:34 Cont. ▶ │
│ Próxima acción: [Tarea ▾] [mañana 9:00]       │    │ 09:15  ↙    +57 301… › (nuevo)   —      0:00 Buzón ▶ │
│ Nota: [Pide cotización con 2 espacios…]       │    │ 08:50  ↗📱  María Ruiz › Demo   Luis   6:12 Cont. ▶ │
│                    [Omitir]  [Guardar Ctrl+⏎] │    └────────────────────────────────────────────────────┘
└──────────────────────────────────────────────┘

Configuración › Telefonía
┌────────────────────────────────────────────────────────────────────┐
│ [Números] [Grabación y consentimiento] [Mi celular]                 │
│ Números                                    [Importar] [Comprar CO] │
│ +57 601 234 5678  "Principal"  Asignado: Ana  voz/sms  ● activo    │
│ Grabación: [ON]  Retención: [90] días  Timeout: [30] s  AMD: [OFF] │
│ Mensaje: "Esta llamada será grabada con fines de…"  (72/500) [▶ Escuchar]│
│ Voz: [Polly.Mia-Neural ▾]  Idioma: [es-MX ▾]  Horario: L-S 07:00–20:00│
└────────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos / carga / error

| Situación | UI |
|---|---|
| Org sin número (`phone_numbers` vacío) | Dock colapsado gris "Telefonía no configurada" con CTA "Configurar" (admin) / "Pide a tu administrador" (resto). `CallModeMenu` muestra Navegador deshabilitado con el mismo texto. |
| Sin permiso de micrófono | `deviceState='no_permission'`: banner en el dock "Permite el micrófono en el navegador" con enlace a ayuda; Electron: se auto-aprueba (F0). |
| Token 409 `VOICE_NOT_CONFIGURED` | Igual que sin número; sin reintentos agresivos (backoff). |
| Precheck 402/409/423/451 | Toast destructivo con motivo exacto y acción ("Comprar créditos", "Reintentar a las 07:00", "Ver consentimiento"). |
| Llamada `failed` con `SipResponseCode` | Dock "No se pudo conectar (código 480)" + botón Reintentar; disposición se abre con "Número inválido" preseleccionado si 404/484. |
| Grabación `processing` | Timeline y tabla muestran chip "Procesando grabación…" (skeleton del player); `failed` → "Grabación no disponible" con tooltip del motivo. |
| Tabla sin llamadas | Ilustración + "Aún no hay llamadas. Llama desde el pipeline o la oportunidad" + botón "Ir al pipeline". |
| Realtime desconectado | El dock hace polling `GET /api/crm/calls/[id]` cada 5 s **solo** mientras hay llamada activa. |

### 5.6 Accesibilidad

- Atajos globales (solo con sesión y fuera de inputs): `Ctrl+Shift+C` llamar a la entidad enfocada (tarjeta/drawer/detalle con `data-phone`), `Ctrl+Shift+D` colgar, `Ctrl+Shift+M` mute, `Ctrl+Shift+A` aceptar entrante. Se documentan en el tooltip y en `/app/ayuda`.
- `aria-live="assertive"` para cambios de estado ("Llamando", "En llamada", "Finalizada", "Llamada entrante de Juan Pérez"); `aria-live="polite"` para el timer cada 30 s (no cada segundo).
- `IncomingCallToast` es `role="alertdialog"` con foco inicial en Aceptar y trampa de foco; `Esc` rechaza.
- `DialPad` y `CallControls` navegables con Tab; DTMF acepta teclado físico (`0-9 * #`).
- Contraste AA en dark mode (pares `dark:` explícitos); indicador REC no depende solo del color (texto "REC").
- `CallDispositionDialog`: radios con `fieldset/legend`, `Ctrl+Enter` guarda, `Esc` = Omitir (queda `outcome` automático del trigger).

### 5.7 Motion (sobrio)

- Dock: `motion.div` entra con `y: 24 → 0, opacity 0 → 1`, `duration 0.2`, `ease-out`; sale igual invertido. Sin springs exagerados.
- Estado "timbrando": pulso de opacidad `1 → 0.6 → 1` cada 1,5 s en el icono, no en todo el dock.
- Indicador REC: parpadeo cada 2 s (respeta `prefers-reduced-motion` → estático).
- Toast entrante: slide desde arriba 0,2 s. Todo vía `motion/react` + `MotionProvider` existente.

### 5.8 Responsive / cross-platform

| Plataforma | Softphone (SDK) | Notas |
|---|---|---|
| Web escritorio (Chrome, Edge, Firefox, Safari actuales) | ✅ | HTTPS obligatorio (dev: `localhost` o ngrok). `speakerDevices.set` solo Chromium. |
| Electron (`electron/`) | ✅ | Voice SDK soportado; F0 añade `session.setPermissionRequestHandler` para `media` en `electron/src/main/index.ts` (hoy no existe: verificado). Notificación nativa de entrante con `new Notification()`. |
| PWA escritorio | ✅ | `public/sw.js`: no cachear `*.twilio.com` ni `wss://`. |
| Navegador móvil / PWA móvil | ⚠️ | El SDK funciona en primer plano, pero la llamada cae al bloquear pantalla o cambiar de app (docs). `CallModeMenu` detecta `matchMedia('(pointer:coarse)')` + UA móvil y **preselecciona "Mi celular"** (F5). |
| Capacitor (`mobile/`, WebView de URL remota) | ❌ para SDK | WebView no está en la lista soportada; `RECORD_AUDIO`/`NSMicrophoneUsageDescription` los añade F0 pero F3 **no** ofrece "Navegador" cuando `Capacitor.isNativePlatform()`; usa F5 (bridge) o ruta B futura (plugin nativo). |
| Layout | — | Dock ocupa `bottom-4 right-4 w-[360px]`; en `<640px` pasa a barra inferior de ancho completo colapsable; `QuickActionsBar` `card` se muestra siempre (sin hover) en pantallas táctiles. |

---

## 6. Integración con proveedores (Twilio)

- **TwiML App** (Console → Voice → TwiML Apps): `Voice Request URL = {BASE}/api/voice/twiml/outbound` (POST), `Status Callback URL = {BASE}/api/voice/status` (POST). Una por (sub)cuenta; el SID va a `TWILIO_TWIML_APP_SID` (master) o `comm_settings.voice_twiml_app_sid` (subcuenta). Opcional: `client.applications.create({friendlyName, voiceUrl, voiceMethod:'POST', statusCallback})` al provisionar subcuenta (F0).
- **API Key**: crear en Console → Account → API keys, tipo **Main/Standard** (Restricted no sirve para AccessToken). Guardar SID `SK…` y secret en `provider_configs.credentials` cifrados (F0) o env.
- **Números**: `client.incomingPhoneNumbers(sid).update({ voiceUrl: '{BASE}/api/voice/twiml/inbound', voiceMethod: 'POST', statusCallback: '{BASE}/api/voice/status', statusCallbackMethod: 'POST' })`. Compra: `client.availablePhoneNumbers('CO').local.list({ voiceEnabled: true, limit: 20 })` → `client.incomingPhoneNumbers.create({ phoneNumber, voiceUrl, voiceMethod:'POST' })`. Regulatorio CO: número local exige bundle regulatorio (ID/registro mercantil + dirección); si la cuenta no lo tiene, la compra falla con 21649 → mostrar instrucciones y ofrecer importar.
- **Geo Permissions**: habilitar Colombia en Voice → Settings → Geo permissions; errores 21215 (API) / 13227 (`<Dial>`) se mapean a `failed` con `metadata.reason='geo_permission'` y toast "Habilita Colombia en Twilio".
- **Verified Caller ID**: `voice_caller_id` debe ser un número Twilio de la org o un Verified Caller ID (`client.validationRequests.create({ phoneNumber, friendlyName })` → llamada con código). Cuentas trial solo pueden marcar a Verified Caller IDs (documentar en la UI de números).
- **Subcuenta por org (opcional)**: `client.api.v2010.accounts.create({ friendlyName })` (F0). Cada subcuenta tiene su Auth Token → el resolver de firma busca `comm_settings.twilio_subaccount_sid = AccountSid`. Números y TwiML App deben crearse **dentro** de la subcuenta.
- **Límites**: ≤10 sesiones simultáneas por identity (la identity incluye org y usuario; varias pestañas comparten identity → `allowIncomingWhileBusy:false` y la última pestaña registrada recibe entrantes; documentar); ttl del token ≤24 h (usamos 3600 s); `<Say>` Polly ≤3000 chars (`voice_consent_message` ≤500); `<Dial timeout>` ≤600; `timeLimit` por defecto 4 h (fijamos 7200 s vía `timeLimit="7200"` en `<Dial>`).
- **Precios** (D8): SDK $0.004/min + PSTN CO móvil $0.0377/min o fijo $0.07/min + grabación $0.0025/min (+ $0.0005/min/mes almacenamiento en Twilio hasta borrar) + AMD $0.0075/llamada + TTS Neural $0.0032/100 chars (aviso de 150 chars ≈ $0.005). Número local $14/mes. Llamada browser→móvil CO de 5 min ≈ **$0.23**.
- **Gotchas**: `es-CO` no existe (usar `es-MX`/`es-US`); `<Record>` es mono (solo buzón); `RecordingUrl` sin extensión → añadir `.mp3`; dual-channel requiere `?RequestedChannels=2`; metadatos de grabación 40 días tras DELETE; el whisper `<Number url>` retrasa el bridge el tiempo del aviso (~6 s) — el agente oye ringback mientras tanto (`answerOnBridge="true"`); `Direction=inbound` en el webhook del TwiML App para llamadas del cliente WebRTC.

---

## 7. Multi-tenant y seguridad

| Endpoint | Controles | Hallazgo que cierra |
|---|---|---|
| `/api/voice/token` | sesión; identity derivada del servidor (nunca del body); credenciales del registry descifradas en servidor | C1, C21 |
| `/api/voice/precheck` | sesión; `to` normalizado; `customerId/opportunityId` verificados con `.eq('organization_id', ctx.organizationId)` | IDOR |
| `/api/voice/twiml/outbound` | firma fail-closed con token por `AccountSid`; identity → `{userId, orgId}` y comprobación de membresía activa; si `AccountSid` es de subcuenta, `comm_settings.organization_id` debe coincidir con `orgId` de la identity (evita usar la identity de otra org en otra cuenta); `To` validado E.164; sin fallback de org | C0, C10, C11, C12, C13 |
| `/api/voice/twiml/consent`, `dial-complete`, `inbound-after` | firma + token HMAC `t` ligado a `callId` (`timingSafeEqual`); todas las queries `eq('organization_id', call.organization_id)` | C14 (patrón), C19 |
| `/api/voice/status`, `/api/voice/recording` | firma fail-closed; resolución de org **por la fila `calls`** (CallSid/ParentCallSid) y nunca por parámetros del body; `SequenceNumber`; 200 vacío si no se encuentra (sin filtrar información) | C0, C12, C13, C15 |
| `/api/voice/twiml/inbound` | firma; org por `phone_numbers.e164` (`is_active`), **sin** fallback "primera org activa"; se elimina `integrations/twilio/voice/incoming` | C11, C21 |
| `/api/voice/recording/[id]/stream` | sesión + `eq('organization_id')`; URL firmada 600 s; `Cache-Control: private, no-store` | fuga de grabaciones |
| `/api/crm/calls*`, `/api/crm/phone-numbers*`, `/api/crm/settings/telephony` | sesión; rol admin para escritura de números/settings (`ctx.roleName in ('admin','owner')` o `isSuperAdmin`); zod en todos los bodies; `PATCH calls/[id]` solo el dueño de la llamada o admin | IDOR |
| Storage `crm-call-recordings` (F0) | bucket privado; políticas `storage.objects` por prefijo `org_{current_org_id()}/` para SELECT; escritura solo service role | C6 |
| Secretos | `twilio_subaccount_auth_token`, API secrets: cifrados (F0), nunca seleccionados con cliente anon; logs sin tokens ni números completos (`+57300****567`) | D7 |
| Compliance CO (D9) | aviso de grabación obligatorio (constraint `comm_settings_consent_required`), `call_consents` con texto exacto, horario de contacto por org, `fn_can_contact(customer,'voice')` cuando exista (`contact_consents`), retención con borrado en Twilio + Storage | D9 |

---

## 8. Créditos, costos y límites

- **Reserva**: en `twiml/outbound` (y `bridge/initiate` en F5) `deduct_comm_credits(org,'voice',1)` antes de marcar. `voice_minutes_remaining IS NULL` = ilimitado (Enterprise). `false` → la llamada no se marca (`<Say>` "Su organización no tiene minutos disponibles" + `Hangup`) y `calls.status='failed'`, `metadata.reason='no_credits'`.
- **Liquidación**: en `dial-complete`/terminal: `minutes = ceil(duration_seconds/60)`; si `minutes > 1` → `deduct_comm_credits(org,'voice', minutes-1)` (si devuelve `false`, se deja en negativo lógico registrando `metadata.credits_overrun=true` y alerta al admin; nunca se corta una llamada en curso por créditos). Inserta `comm_usage_logs {channel:'voice', module:'crm_voice', credits_used: minutes, recipient: to_number, direction, status, metadata:{call_id, cost_amount, cost_breakdown:{pstn, sdk, recording, amd, tts}}}` con precios de `fn_price`. `calls.cost_amount` = suma; `cost_currency='USD'`.
- **Presupuesto y alertas**: `comm_settings.voice_minutes_remaining` visible en el tab Telefonía y en el dock (chip "128 min"); al 20 % y 5 % restantes → `fn_create_org_notification`. Límite duro: sin créditos no hay llamada. Límite de concurrencia: `voice_max_concurrent_calls` (precheck cuenta `idx_calls_org_active`).
- **Entrantes**: no reservan; se liquidan al completar con sku `voice_in_local`.
- **Costo estimado mostrado** al usuario en el menú (tooltip): "≈ $0,05/min" para browser; F5 muestra el doble.

---

## 9. Pruebas

### 9.1 Unitarias (`src/lib/services/__tests__/`)

- `voiceIdentity.test.ts`: `buildVoiceIdentity` produce `[A-Za-z0-9_]`; `parseVoiceIdentity` acepta `client:` prefijo, rechaza `u_x_o_1`, `u_{32hex}_o_abc`, longitudes erróneas; round-trip con 50 UUIDs aleatorios.
- `callStateMachine.test.ts`: tabla completa de transiciones válidas/inválidas; terminales pegajosos; `SequenceNumber` menor ignorado; `AnsweredBy=machine_start` → `voicemail` solo con AMD; padre `completed` sin `answered_at` → `canceled`.
- `twimlBuilders.test.ts`: snapshot del TwiML saliente/entrante/consent/buzón; `&` en URLs → `&amp;`; texto con `<>&"'` escapado; `machineDetection` presente solo con `voice_amd_enabled`; `timeout` clamp 10..60; `<Client>` ≤10.
- `twilioSignature.test.ts`: firma correcta con URL reconstruida con/sin puerto, firma inválida → false, token de subcuenta por `AccountSid`, `signCallbackToken/verifyCallbackToken` (`timingSafeEqual`, longitud distinta → false).
- `callCreditsService.test.ts`: `estimateCallCost` clasifica `+5730…` móvil, `+5760…` fijo; `settleVoiceCall` calcula `ceil`, diferencia con reserva, `cost_breakdown`.
- `recordingStorageService.test.ts`: `buildStoragePath` (org/año/mes/callId.mp3); descarga usa `Authorization: Basic` con API Key y `?RequestedChannels=2`; 401 → error; `computeRetentionUntil(90)`.
- `phoneNumberService.test.ts`: `importNumber` rechaza número que no está en la cuenta; `syncNumberWebhooks` construye URLs con BASE sin path.

### 9.2 Integración (mocks de webhooks con payloads reales; `src/__tests__/api/voice/*.test.ts` con `next-test-api-route-handler` o llamada directa al handler)

1. `twiml/outbound` con `From=client:u_…_o_7&To=+573001234567&CallSid=CA1` firmado → 200 XML con `<Dial callerId … record="record-from-answer-dual">`, fila `calls` (`mode='browser'`, `status='dialing'`, `opportunity_id` del param), `call_consents` tras `consent`.
2. Mismo `CallSid` reenviado → no duplica (índice único), mismo TwiML.
3. `status` hijo: `initiated (seq 0) → ringing (1) → in-progress (2) → completed (3, CallDuration=155)`; luego `dial-complete` `DialCallStatus=completed&DialCallDuration=155&DialBridged=true` → `completed`, `duration_seconds=155`, `answered_at` presente, actividad creada con `outcome='contacted'`, `comm_usage_logs` con `credits_used=3`.
4. Desorden: `completed (3)` antes de `ringing (1)` → `ringing` ignorado; estado final `completed`.
5. `dial-complete` `DialCallStatus=busy` → `busy`, `duration 0`, actividad `busy`, sin grabación.
6. `recording` `RecordingStatus=completed&RecordingChannels=2&RecordingSid=RE1&RecordingUrl=https://api.twilio.com/…/RE1` con fetch mockeado → `call_recordings` `processing → ready`, `storage_path=org_7/2026/09/{callId}.mp3`, `outbound_jobs` con `kind='transcribe'` y `dedupe_key='transcribe/{recording_id}'`; segundo callback idéntico → no duplica.
7. `recording` `absent` → `failed`.
8. Firma inválida en cualquier webhook → 403 y ninguna escritura.
9. `twiml/inbound` `To` no registrado → TwiML "no configurado", sin insert; `To` registrado → `calls` `inbound/ringing` y `<Client>` con identity del asignado; sin asignado y ring group → N `<Client>`.
10. `inbound-after` `DialCallStatus=no-answer` → `<Record>` y `calls.status='voicemail'` tras `recording` mono (`channels='1'`).
11. `PATCH /api/crm/calls/[id]` con disposition `no_answer` + `next_action task` → `calls.metadata`, `tasks` creada (`related_to_type='opportunity'`), `opportunities.contact_result='no_answer'`, actividad actualizada (no duplicada).
12. `precheck` con `voice_minutes_remaining=0` → 402; con 5 llamadas activas y límite 5 → 409; fuera de horario → 423.

### 9.3 E2E manual (org de prueba con número Twilio real y ngrok)

1. Configurar `TWILIO_WEBHOOK_BASE_URL=https://xxxx.ngrok.app`, TwiML App apuntando a ngrok; importar número; grabación ON.
2. Abrir `/app/crm/pipeline` → dock "● listo" en ≤3 s tras aceptar micrófono.
3. Tarjeta → 📞 → Navegador → llamar a un celular propio: oír "Conectando…", el celular recibe con el caller id de la org, oír el aviso, hablar 20 s, colgar desde el celular → diálogo de disposición → guardar.
4. Verificar en BD: `calls` (`completed`, `duration_seconds≈20`, `consent_given=true`), `call_consents` 1, `call_recordings` `ready` con `channels='2'`, objeto en Storage, `activities` 1 con `call_id`, `comm_usage_logs` 1, `outbound_jobs` `transcribe` 1.
5. `/app/crm/llamadas` → fila → player reproduce; `?call=` abre el sheet.
6. Llamar al número de la org desde el celular → toast entrante con nombre del cliente (si el número existe en `customers.phone`) → aceptar → hablar → colgar → misma verificación con `direction='inbound'`.
7. No contestar → buzón → grabación mono y `status='voicemail'`.
8. Electron: repetir 3 (micrófono auto-aprobado).
9. Poner `voice_minutes_remaining=0` → el menú muestra 402 y no marca.

### 9.4 Casos borde (≥10)

1. Agente cuelga mientras suena → hijo `canceled`; padre `completed` sin `answered_at` → `canceled`; sin grabación; sin cobro.
2. Cliente cuelga durante el whisper → `DialBridged=false` → `completed` con 0 s, `metadata.reason='hangup_during_consent'`; grabación puede llegar de 0–5 s → se guarda igual.
3. Dos pestañas con la misma identity → ambas reciben `incoming`; la que acepta gana; la otra recibe `cancel`.
4. Token expira en medio de la llamada → la llamada sigue (el token solo afecta registro); `tokenWillExpire` la renueva.
5. Pérdida de red en el browser → `reconnecting`/`reconnected`; si >30 s Twilio cierra → `completed` con la duración real.
6. Número con formato local `3001234567` → normalizado a `+573001234567`; `300123` → 400 en precheck.
7. `phone_numbers` inactivo recibe llamada → TwiML "no configurado" (no se enruta a nadie).
8. Grabación de 4 h (límite `timeLimit=7200` la evita) → si llegara, descarga con timeout 20 s falla → job `recording_fetch` la reintenta.
9. Twilio reenvía `recording completed` 3 veces → 1 fila, 1 job (`dedupe_key`).
10. `voice_recording_enabled=false` → TwiML sin `record`, sin `<Number url>` de consentimiento, `calls.recording_enabled=false`, sin fila `call_recordings`, precio sin grabación.
11. Usuario sin membresía activa intenta token → 403; identity de un usuario dado de baja en `twiml/outbound` → `<Hangup/>` y `failed` con `reason='identity_not_member'`.
12. Subcuenta: webhook con `AccountSid` de subcuenta y firma con token master → 403.
13. `SequenceNumber` ausente (callbacks de `<Client>` entrante lo incluyen; el `action` de `<Dial>` no) → `dial-complete` no usa secuencia, solo pegajosidad.
14. Cambio de `voice_consent_message` durante una llamada → el texto usado queda en `call_consents.recorded_announcement_text` (no se reescribe).

---

## 10. Definition of Done y métricas

- [ ] Migraciones 3.1 aplicadas vía MCP; consultas 3.3 devuelven lo esperado; cero `.sql` en el repo.
- [ ] `POST /api/voice/token` devuelve JWT con identity `u_{32hex}_o_{org}` y `VoiceGrant` con `outgoingApplicationSid` correcto por org.
- [ ] `SoftphoneProvider` montado en `src/app/app/layout.tsx`; el dock aparece en todas las páginas de `/app/*` y registra en ≤3 s con número configurado.
- [ ] `SoftphoneProvider.makeCall` **no** llama a `/api/voice/call`; una sola llamada llega al cliente (verificado en Twilio Console → Monitor → Calls: 1 padre + 1 hijo).
- [ ] `twiml/outbound` responde el TwiML de 4.5.1 (snapshot test) y crea `calls` con `mode='browser'`, `opportunity_id`, `customer_id`, `user_id`.
- [ ] El cliente oye el consentimiento; `call_consents` tiene 1 fila por llamada con el texto exacto; `calls.consent_given=true`.
- [ ] `status`/`dial-complete` dejan `calls.status` válido en 100 % de los casos de 9.2 y `duration_seconds` = `DialCallDuration`.
- [ ] `recording` produce `call_recordings.status='ready'`, `channels='2'`, objeto en `crm-call-recordings` con path `org_{id}/{yyyy}/{mm}/{callId}.mp3`, `retention_until` y job `transcribe` encolado.
- [ ] `recording/[id]/stream` redirige a URL firmada de 600 s; usuario de otra org → 404.
- [ ] Trigger crea/actualiza exactamente 1 `activities` por llamada (`uq_activities_call`) y actualiza `opportunities.last_contact_at/contact_channel/contact_result`.
- [ ] `CallDispositionDialog` aparece al colgar y persiste resultado/próxima acción/nota; `tasks` creada cuando aplica.
- [ ] `QuickActionsBar` visible en tarjeta (hover/touch), drawer y detalle; clic en 📞 no abre el drawer.
- [ ] Entrantes: `IncomingCallToast` con nombre del cliente; ring group; buzón grabado cuando nadie contesta.
- [ ] Tab Telefonía funcional: importar número, asignar, grabación, consentimiento con preview, retención, timeout.
- [ ] Nav CRM incluye Llamadas y Leads; `moduleConfig.ts` sincronizado.
- [ ] Todos los webhooks de voz devuelven 403 con firma inválida (test) y no existe ningún `warn & continue`.
- [ ] `comm_usage_logs` registra minutos reales y costo por llamada; `deduct_comm_credits` se invoca antes de marcar.
- [ ] `integrations/twilio/voice/incoming`, `media-stream` y `callService.ts` eliminados; `ActivityActions.CallDialog` eliminado.
- [ ] `npm run lint`, `tsc --noEmit`, `npm test` limpios; PRs ≤400 líneas.

**Métricas de éxito (30 días tras release en la org piloto):** ≥95 % de llamadas con `status` terminal válido y `duration_source='provider'`; ≥90 % de llamadas completadas con grabación `ready` en ≤2 min; 100 % con `call_consents`; ≥80 % con disposición guardada; 0 callbacks 403 legítimos; tiempo clic→timbrado p50 ≤4 s.

---

## 11. Riesgos y decisiones

| Decisión / riesgo | Por qué así y no de otra forma |
|---|---|
| Crear `calls` en el webhook del TwiML App (no en un POST previo desde el browser) | Elimina la doble marcación (C10) y la carrera "webhook antes que insert". El browser no necesita el `callId` para conectar; lo obtiene por Realtime/`CallSid`. |
| Consentimiento en `<Number url>` (whisper) y no solo en `<Say>` antes de `<Dial>` | Un `<Say>` previo al `<Dial>` lo oye el **agente**, no el cliente. El whisper garantiza que el cliente lo escuche y que quede dentro de la grabación (`record-from-answer-dual` arranca al contestar). Costo: ~6 s de espera del agente. |
| Estado final desde `action` de `<Dial>` (`DialCallStatus`) además de `statusCallback` | `DialCallDuration` es la duración conversada (sin ringback ni whisper) y llega una sola vez; los `statusCallback` del hijo dan el detalle intermedio. |
| Una fila `calls` por conversación (padre) y `customer_leg_sid` para el hijo | La grabación de `<Dial>` pertenece al `CallSid` padre; F5 reutiliza el mismo modelo (`agent_leg_sid`/`customer_leg_sid`). Dos filas duplicarían actividades. |
| Identity `u_{uuid}_o_{org}` en vez de solo `userId` | Resolver la org sin consultar `calls` (llamada nueva) y respetar `[A-Za-z0-9_]`. Multi-org: un usuario en dos orgs tiene dos identities. |
| `after()` + job `recording_fetch` en vez de fire-and-forget | En Vercel la función puede terminar al responder; `after()` extiende hasta `maxDuration`; el job cubre fallos. |
| Path de grabación por `callId` (no `RecordingSid`) | Estable y predecible para F4/retención; una llamada puede tener varias grabaciones (buzón) → sufijo `-{n}` si ya existe. |
| `user_comm_preferences` y no `profiles.phone` | El celular y el modo por defecto dependen de la org (D4); `profiles` es global. |
| AMD opcional y apagado por defecto | $0.0075/llamada y falsos positivos en CO; el vendedor marca "Buzón" en la disposición. |
| Voz `Polly.Mia-Neural` es-MX | `es-CO` no existe; Mia es la más neutra para CO en pruebas; configurable por org. |
| Riesgo: cuenta trial / geo permissions no habilitadas | Mapeo de errores 21215/13227/21649 a mensajes accionables en el tab Telefonía. |
| Riesgo: ≤10 sesiones por identity con muchas pestañas | `closeProtection` + advertencia al abrir >3 pestañas con dock registrado (`BroadcastChannel`). |
| Riesgo: Realtime no habilitado en `calls` | La migración añade la tabla a `supabase_realtime`; fallback polling 5 s solo en llamada activa. |

---

## 12. Archivos tocados y orden de PRs

### 12.1 Archivos realmente tocados (ronda 1, 2026-09-08)

**Creados**
- Rutas: `src/app/api/voice/dial-complete/route.ts`, `src/app/api/voice/twiml/consent-whisper/route.ts`, `src/app/api/crm/phone-numbers/import/route.ts`, `src/app/api/crm/settings/telephony/route.ts`, `src/app/api/crm/settings/telephony/consent-preview/route.ts`, `src/app/api/crm/me/comm-preferences/route.ts`
- Servicios: `src/lib/services/crm/{twimlBuilders,callStateMachine,callCreditsService,callDispositionService,phoneNumberService,voiceContextService,telephonySettingsService}.ts`
- Jobs: `src/lib/jobs/handlers/recordingFetch.ts`, `src/lib/jobs/handlers/recordingCleanup.ts`
- UI voz: `src/components/voice/{SoftphoneShell,CallDispositionDialog,CallRowDetail}.tsx`, `src/components/voice/dock/{DockHeader,Keypad,CallControls,LiveNote}.tsx`, `src/components/voice/hooks/{useAudioDevices,useCallRealtime}.ts`
- UI configuración: `src/components/configuracion/crm/TelefoniaTab.tsx`, `src/components/configuracion/crm/telefonia/{PhoneNumbersSection,RecordingConsentSection,MyMobileSection,useTelephonySettings}.{tsx,ts}`
- Tests: `src/lib/services/crm/__tests__/{twimlBuilders,callStateMachine,callCreditsService,recordingFetch}.test.ts`, `src/lib/services/integrations/twilio/__tests__/voiceIdentity.test.ts`

**Modificados**
- `src/app/api/voice/{token,call,status,recording}/route.ts`, `src/app/api/voice/twiml/{outbound,inbound,agent-leg,customer-leg,ai-agent}/route.ts`, `src/app/api/voice/bridge/status/route.ts`
- `src/app/api/integrations/twilio/voice/incoming/route.ts` (valida firma y delega en la ruta canónica), `src/app/api/crm/phone-numbers/[id]/route.ts`
- `src/lib/services/crm/{callManagementService,recordingStorageService,voiceTokenService}.ts`
- `src/lib/services/integrations/twilio/{twilioConfig,twilioService,twilioSubaccounts,twilioWebhook}.ts`
- `src/components/voice/{SoftphoneProvider,SoftphoneDock,CallsTable,CallButton,CallPlayer,IncomingCallToast,index}.{tsx,ts}`
- `src/app/app/layout.tsx` (monta `SoftphoneShell`), `src/app/app/crm/llamadas/page.tsx` (sin provider local)

**Archivos compartidos que NO tocó F3** (los aplica el orquestador): `src/lib/jobs/handlers/index.ts` (registro de `recording_fetch`/`recording_cleanup` — ya presente), `src/components/configuracion/panels/crm/CrmConfigTabs.tsx` (pestaña Telefonía — ya presente), `src/lib/services/crm/index.ts`, `src/config/crmNav.ts`, `src/middleware.ts`, `src/__tests__/guardrails.test.ts`, `.env.example`, `package.json`.

#### Archivos tocados en la ronda 2 (2026-09-09)

**Creados**
- `src/components/voice/hooks/useTwilioDevice.ts` (ciclo de vida del `Device`: token, micrófono, SDK, reintentos, renovación).
- `src/components/voice/softphoneTypes.ts` (tipos del contexto; el provider los reexporta).

**Modificados**
- Rutas: `src/app/api/voice/dial-complete/route.ts` (terminal pegajoso + conciliación del cobro + `accountSidMatchesOrg`), `status/route.ts` (liquida solo con `ended_at`; `accountSidMatchesOrg`), `recording/route.ts` y `twiml/{inbound,consent-whisper}/route.ts` (`accountSidMatchesOrg`), `twiml/outbound/route.ts` (validación de `customerId`/`opportunityId`, caller id propio obligatorio, `consent_given=false`, E.164 ≥10 dígitos), `call/route.ts` (`getTwilioWebhookOrigin`).
- Servicios: `callStateMachine.ts` (`mergeTerminalOutcome`, `isKnownTwilioCallStatus`, buzón sin cierre, terminal que sí completa `ended_at`/duración), `callCreditsService.ts` (`settleVoiceCall(..., {reconcile})`), `voiceContextService.ts` (`pickCallerId.source`, `accountSidMatchesOrg`, `filterOrgOwnedRefs`), `recordingStorageService.ts` (`deleteRecording` fail-closed), `twimlBuilders.ts` (`calledNumber` para entrantes anónimas), `callDispositionService.ts` (comentario: el canal real es `call`).
- UI: `SoftphoneProvider.tsx` (533 → 289 L), `CallsTable.tsx` (`CallButton` por fila + `data-phone`/`data-customer-id`/`data-opportunity-id` + `tabIndex`), `src/app/app/crm/llamadas/page.tsx` (deja de pedir las estadísticas dos veces al montar).
- Tests: `src/lib/services/crm/__tests__/f3Adversarial.test.ts` (del tester: 2 casos de defecto **invertidos** + 6 nuevos → 32 verdes) y `callCreditsService.test.ts` (2 casos de conciliación).

**Validados, no reescritos (zona de F3 tocada por F4 en su ronda 1)**: `src/components/voice/CallPlayer.tsx` (props `seekToMs`/`onTimeUpdate`/`variant='full'`) y `src/components/voice/CallRowDetail.tsx`. Se aceptan tal cual: cumplen la regla de ≤300 líneas y los pares `dark:`, `CallsTable` ya los usa y retirarlos rompería la tabla. **Convención de canal del modo puente: gana `mobile`** (`callActivityService.callChannel`, F4); F3 no filtra por `activities.channel` en ninguna vista, así que no hay nada que migrar.


### 12.2 Plan original

**Crear**
- `src/lib/services/crm/voiceContextService.ts`, `twimlBuilders.ts`, `callCreditsService.ts`, `phoneNumberService.ts`, `callDispositionService.ts`, `telephonySettingsService.ts`
- `src/app/api/voice/precheck/route.ts`, `src/app/api/voice/twiml/consent/route.ts`, `src/app/api/voice/twiml/dial-complete/route.ts`, `src/app/api/voice/twiml/inbound-after/route.ts`
- `src/app/api/crm/settings/telephony/route.ts`, `src/app/api/crm/settings/telephony/consent-preview/route.ts`, `src/app/api/crm/me/comm-preferences/route.ts`, `src/app/api/crm/phone-numbers/available/route.ts`, `src/app/api/crm/phone-numbers/purchase/route.ts`
- `src/components/voice/hooks/useTwilioDevice.ts`, `hooks/useCallRealtime.ts`, `dock/DialPad.tsx`, `dock/CallControls.tsx`, `dock/AudioDeviceSelector.tsx`, `dock/LiveNote.tsx`, `CallDispositionDialog.tsx`, `CallDetailSheet.tsx`
- `src/components/crm/shared/QuickActionsBar.tsx`, `src/components/crm/shared/CallModeMenu.tsx`
- `src/components/configuracion/crm/TelephonySettingsTab.tsx`, `telephony/PhoneNumbersSection.tsx`, `telephony/RecordingConsentSection.tsx`, `telephony/MyMobileSection.tsx`
- Tests de 9.1 y 9.2.

**Modificar**
- `src/lib/services/crm/voiceTokenService.ts`, `callManagementService.ts`, `recordingStorageService.ts`
- `src/app/api/voice/token/route.ts`, `twiml/outbound/route.ts`, `twiml/inbound/route.ts`, `status/route.ts`, `recording/route.ts`, `recording/[id]/stream/route.ts`, `call/route.ts`
- `src/app/api/crm/calls/route.ts`, `calls/[id]/route.ts`, `phone-numbers/route.ts`, `phone-numbers/[id]/route.ts`
- `src/components/voice/SoftphoneProvider.tsx`, `SoftphoneDock.tsx`, `IncomingCallToast.tsx`, `CallsTable.tsx`, `CallPlayer.tsx`
- `src/app/app/layout.tsx`, `src/app/app/crm/llamadas/page.tsx`, `src/components/app-layout/AppLayout.tsx`, `src/config/moduleConfig.ts`
- `src/components/crm/pipeline/PipelineStages.tsx` (:956), `drawer/OpportunityDrawer.tsx` (:438), `drawer/ActivityActions.tsx`, `src/components/crm/oportunidades/OpportunityDetail.tsx` (:747), `src/app/app/crm/clientes/[id]/page.tsx`
- `package.json` (twilio ^6.1, voice-sdk ^2.18.4, libphonenumber-js, engines node ≥20), `.env.example`, `public/sw.js`

**Eliminar**
- `src/app/api/integrations/twilio/voice/incoming/route.ts`, `src/app/api/integrations/twilio/voice/media-stream/route.ts`, `src/lib/services/callService.ts` (+ su caso en `src/__tests__/guardrails.test.ts:202`).

**Orden de PRs (cada uno ≤400 líneas, con tests):**
1. **PR-F3-01 BD + precios**: migraciones 3.1 (4), seeds, `telephonySettingsService`, `callCreditsService`, tests unitarios de créditos. (Requiere F0 aplicado.)
2. **PR-F3-02 Contexto + firma + token**: `voiceContextService`, `voiceTokenService` (identity), `/api/voice/token`, `/api/voice/precheck`, tests de identity/firma.
3. **PR-F3-03 TwiML saliente + estados**: `twimlBuilders`, `twiml/outbound`, `twiml/consent`, `twiml/dial-complete`, `status` reescrito, `callManagementService.applyStatusEvent/applyDialComplete`, tests de máquina de estados y snapshots.
4. **PR-F3-04 Grabación**: `recording` reescrito, `recordingStorageService`, `stream` 600 s, jobs `recording_fetch`/`recording_cleanup`/`calls_reconcile`, tests de integración 6–7.
5. **PR-F3-05 Entrantes + números**: `phoneNumberService`, `phone-numbers*`, `twiml/inbound`, `inbound-after`, eliminación de `integrations/twilio/voice/*`, tests 9–10.
6. **PR-F3-06 Softphone global**: `SoftphoneProvider` + hooks + dock (subcomponentes) + `IncomingCallToast` + `layout.tsx` + nav + `llamadas/page.tsx` sin provider local.
7. **PR-F3-07 Acciones y disposición**: `QuickActionsBar`, `CallModeMenu`, `CallDispositionDialog`, `callDispositionService`, `PATCH calls/[id]`, inserción en Kanban/drawer/detalle/cliente, eliminación de `CallDialog`.
8. **PR-F3-08 Llamadas y configuración**: `CallsTable` filtros, `CallDetailSheet`, `TelephonySettingsTab` + secciones, `settings/telephony`, `me/comm-preferences`, E2E manual documentado en el PR.

---

## 13. Registro de implementación — ronda 1 (2026-09-08)

### Qué se hizo

**Backend de voz (webhooks Twilio, todos con firma fail-closed vía `@/lib/security/webhookSignatures`)**
- `POST /api/voice/twiml/outbound` reescrito con dos ramas: **A** client-originated (`From=client:u_…_o_…`) que resuelve la org por la identity, valida membresía, comprueba que el `AccountSid` corresponde a la (sub)cuenta de la org, elige caller id, **reserva 1 minuto de créditos** e inserta la fila `calls` (`mode='browser'`, `status='dialing'`) + `call_consents`; **B** REST-originated (F5/F6) que resuelve por `CallSid`. Idempotente por `CallSid`.
- `POST /api/voice/twiml/consent-whisper?callId=` (nuevo): aviso de grabación al **cliente** dentro del `<Number url=…>` con `answerOnBridge`, así queda dentro de la grabación dual y el agente no lo oye dos veces. Texto congelado en `call_consents.recorded_announcement_text`.
- `POST /api/voice/dial-complete?callId=` (nuevo): `action` del `<Dial>`; mapea `DialCallStatus` a los enums de BD, guarda `DialCallDuration` (`duration_source='provider'`), `customer_leg_sid`, `ended_at`, liquida créditos (`fn_unit_cost` → `comm_usage_logs`) y crea/actualiza la actividad.
- `POST /api/voice/status` reescrito: distingue leg padre/hijo por `ParentCallSid`, idempotencia por `SequenceNumber`, estados terminales pegajosos, `completed` sin respuesta → `canceled`.
- `POST /api/voice/recording` reescrito: upsert de `call_recordings` con enums válidos (`processing`) y encolado del job `recording_fetch` con dedupe por `RecordingSid` (nada de descargas fire-and-forget).
- `POST /api/voice/twiml/inbound`: única ruta de entrantes; org resuelta por `To`; `<Client>` con las identities reales de los agentes.
- `src/app/api/integrations/twilio/voice/incoming/route.ts`: pasa a validar la firma y **delegar** en la ruta canónica.

**Servicios**
- Nuevos: `twimlBuilders`, `callStateMachine`, `callCreditsService`, `callDispositionService`, `phoneNumberService`, `voiceContextService`, `telephonySettingsService`.
- Reconciliados con los enums reales de BD: `callManagementService`, `recordingStorageService`, `voiceTokenService` (identity), `twilioConfig`/`twilioSubaccounts`/`twilioWebhook`.

**Jobs**
- `recordingFetch`: descarga con Basic Auth de la (sub)cuenta, sube a `crm-call-recordings/org_{id}/{yyyy}/{mm}/{callId}.{ext}`, marca `ready`, calcula `retention_until` y encola `transcribe` (F4).
- `recordingCleanup`: borra en lotes las grabaciones vencidas (Storage + Twilio) y las marca `deleted`.

**UI**
- `SoftphoneShell` (lazy, `ssr:false`) montado **una sola vez** en `src/app/app/layout.tsx`; eliminado el provider duplicado de `llamadas/page.tsx`.
- `SoftphoneProvider`: SDK cargado con `import()`, 409 `VOICE_NOT_CONFIGURED` sin bloquear el render, `tokenWillExpire` → `updateToken`, `makeCall` solo con `device.connect`, motivos de error legibles (31201/31202/31204/31205/31208), selector de micrófono, `useSoftphone()` seguro.
- Dock partido en `dock/{DockHeader,Keypad,CallControls,LiveNote}` + `CallDispositionDialog`; atajos Ctrl+Shift+C/D/M/A.
- Página Llamadas con fila expandible (`CallRowDetail`), pestaña **Telefonía** en configuración (números, caller id, grabación, consentimiento, retención, timeout, "Mi celular" con OTP `mobile_verification`).

### Desviaciones respecto al plan

1. **La ruta legacy `/api/integrations/twilio/voice/incoming` no se borra ni responde 308.** El plan pedía 308 → `/api/voice/twiml/inbound`. Se optó por *validar la firma y delegar*: un redirect obliga a Twilio a un segundo salto por llamada y la firma se calcula sobre la URL original, de modo que la delegación es equivalente y más barata. Se borrará cuando ningún número apunte allí (F6).
2. **`/api/voice/twiml/dial-complete` se llama `/api/voice/dial-complete`** (no cuelga de `twiml/` porque no es una VoiceUrl, es un `action`). Igual con `twiml/consent` → `twiml/consent-whisper`.
3. **`/api/voice/precheck` y `twiml/inbound-after` no se implementaron**: el precheck quedó absorbido por el 409 `VOICE_NOT_CONFIGURED` del token y el buzón de voz entra con F6.
4. **La actividad de la llamada se delega en `callActivityService` de F4 con import estático** (no dinámico) porque el módulo ya existe y compila; se mantiene el *fallback* mínimo si su upsert falla (`callActivitySync.ts:107`).
5. **`hooks/useTwilioDevice.ts` y `dock/DialPad.tsx`/`AudioDeviceSelector.tsx` no existen como archivos separados**: la lógica del `Device` vive en `SoftphoneProvider` y el teclado/selector en `dock/Keypad.tsx` + `hooks/useAudioDevices.ts`.
6. **`CallDetailSheet` se sustituyó por `CallRowDetail`** (fila expandible en la tabla, como pide §5.1) en vez de un panel lateral.

### Pendientes

- Llamada real end-to-end con número Twilio + ngrok: `status`, `dial-complete` y `recording` solo tienen pruebas unitarias y un POST firmado sintético.
- Verificación visual del dock con sesión iniciada (esta ronda no dispuso de sesión de navegador).
- Borrar `integrations/twilio/voice/incoming` y `voiceAgent/*` sobrantes cuando F6 tome ConversationRelay.
- ~~`comm_credits` está vacía en el proyecto: la reserva de minutos devuelve "ilimitado". Sembrar una fila para probar el corte por saldo.~~ **FALSO (corregido en la ronda 2)**: no existe ninguna tabla `comm_credits`; los créditos viven en `comm_settings.voice_minutes_remaining`, estaban poblados y la reserva sí descontaba. Ver §14.

---

## 14. Registro de implementación — ronda 2 (2026-09-09)

Entrada: `TEST-F3-r1` (122 casos, 103 verdes, 19 fallos, 7,5/10). Se atendieron los 3 altos, los
7 medios, 3 bajos y las 5 afirmaciones falsas del documento.

### Qué se hizo

**Dinero y estados (los tres altos)**
- `mergeTerminalOutcome` en `callStateMachine.ts`: `dial-complete` ya no degrada un estado terminal
  ni pisa la duración con 0. Solo refina un terminal "sin información" cuando el `<Dial>` demuestra
  conversación (`completed` con duración > 0). `voicemail` gana a cualquier desenlace.
- `settleVoiceCall(call, client, { reconcile: true })`: si el desenlace final cambia los minutos
  facturables, cobra **solo la diferencia** (los minutos ya cobrados hacen de reserva) y registra el
  ajuste en `comm_usage_logs.metadata.reason='settlement_reconcile'`. Si la nueva duración es menor
  no devuelve créditos (no hay RPC de abono): lo deja anotado en `metadata.settlement_overcharge_min`.
- Buzón de voz: `AnsweredBy=machine_*` marca `voicemail` + `metadata.awaiting_close` **sin** cerrar la
  llamada; `/api/voice/status` liquida cuando el estado es terminal **y** hay `ended_at`, así que el
  cierre real cobra los minutos consumidos. Un evento terminal sobre una llamada ya terminal aporta
  `ended_at` y la duración sin cambiar el estado.
- `filterOrgOwnedRefs`: `customerId`/`opportunityId` se comprueban contra la organización antes de
  escribir la fila `calls` (y por tanto la `activities` derivada).

**Aislamiento multi-tenant**
- `accountSidMatchesOrg(orgId, accountSid)` en las cinco rutas que localizan una fila por `callId` o
  `CallSid` (`dial-complete`, `status`, `recording`, `consent-whisper`, `twiml/inbound`): la firma solo
  prueba que el `AccountSid` es resoluble, no que sea el de esa organización.
- Caller id: `pickCallerId` devuelve `source`; el número global de la plataforma ya no se usa como
  caller id de ninguna organización (escape explícito `VOICE_ALLOW_PLATFORM_CALLER_ID=true`).

**Cumplimiento y robustez**
- `consent_given` nace en `false` y solo lo pone a `true` `consent-whisper` (antes una llamada fallida
  por saldo quedaba con `consent_given=true` y 0 filas en `call_consents`).
- `deleteRecording` solo marca `deleted` si Storage y el proveedor borraron de verdad.
- `/api/voice/call` construye las URLs con `getTwilioWebhookOrigin()`.
- `To` exige un E.164 de ≥10 dígitos; la entrante anónima usa el número llamado como `callerId`; un
  `CallStatus` fuera del vocabulario de Twilio se ignora en vez de cerrar la llamada como `failed`.

**UI**
- `SoftphoneProvider.tsx` 533 → 289 L (`hooks/useTwilioDevice.ts` + `softphoneTypes.ts`).
- `CallsTable` renderiza `CallButton` por fila y expone `data-phone`/`data-customer-id`/
  `data-opportunity-id` con `tabIndex`, de modo que Ctrl+Shift+C llama al contacto de la fila enfocada.
- `/app/crm/llamadas` ya no pide las estadísticas dos veces al montar.

### Correcciones de documentación (5 afirmaciones falsas del tester)

1. **`comm_credits` NO existe.** Los créditos de voz viven en `comm_settings.voice_minutes_remaining`,
   estaban poblados y la reserva **sí** descontaba (198 → 196 en la propia prueba de la ronda 1). Lo que
   estaba roto era el camino "org sin fila de configuración", que cerró el agente DB (función
   fail-closed + backfill de 83 orgs). Corregido en §1.1 y aquí; eliminado de "Pendientes".
2. **Precios de voz sembrados.** Las 5 SKUs (`voice_out_co_mobile/landline`, `voice_in_local_co`,
   `voice_sdk_client`, `recording`) existen en `provider_pricing`; no hay nada que pedir a DB.
3. **Diagrama §2.1 corregido**: se elimina `(1) POST /api/voice/precheck` (nunca se implementó,
   desviación 3), `twiml/consent` pasa a `twiml/consent-whisper`, `twiml/dial-complete` a
   `dial-complete`, y la actividad la crea `callActivitySync.upsertCallActivity` en código, no un
   trigger `trg_calls_completed_activity`.
4. **`recordingFetch` encola `transcribe` con `{call_id, recording_id, force, provider}`** (no
   `storage_path`); es compatible con `handlers/transcribe.ts`, que solo exige `call_id`.
5. **Caller id ✅ era optimista**: con `phone_numbers` vacío el único camino ejercitado era el fallback
   a la env de la plataforma. Corregido en el código (ahora falla explícitamente) y en la tabla de §1.1.
   También se corrige la cifra de la suite (`jest` completo no está en "56 verdes / 1 roja") y el
   comentario de `callDispositionService`, que decía `contact_channel='phone'` cuando el código
   escribe `'call'`.

### Desviaciones y deuda que quedan

- Se mantienen las 6 desviaciones de la ronda 1; la 5 (`useTwilioDevice.ts` inexistente) queda
  **cerrada**: el hook ya existe. Siguen sin existir `dock/DialPad.tsx` y `dock/AudioDeviceSelector.tsx`
  (cubiertos por `dock/Keypad.tsx` y `hooks/useAudioDevices.ts`); se declara como deuda consciente.
- La desviación 3 (`precheck`) sigue en pie: sin saldo, la falta de créditos se descubre **después** de
  marcar (se consume un `CallSid` y se crea una fila `failed`). Con el caller id ahora obligatorio, el
  caso más común ("org sin telefonía configurada") sí se corta antes de sonar.
- `voice_minutes_remaining IS NULL` = ilimitado sigue vivo en el código (0 filas hoy).
- `activities.call_id` tiene índice único (DB, ronda 2), así que la unicidad ya no depende solo del código.

### Pendientes (ronda 3)

- Llamada real end-to-end con número Twilio + ngrok: `status` vs `dial-complete` en orden real,
  susurro de consentimiento oído por el cliente y grabación dual.
- Verificación visual del dock con sesión iniciada.
- `data-phone` en las tarjetas del pipeline y en el drawer (**F9**).
- Borrar `integrations/twilio/voice/incoming` y `voiceAgent/*` sobrantes cuando F6 tome ConversationRelay.
- Ruta de reembolso de créditos cuando la conciliación detecta sobrecobro (hoy solo se anota).
