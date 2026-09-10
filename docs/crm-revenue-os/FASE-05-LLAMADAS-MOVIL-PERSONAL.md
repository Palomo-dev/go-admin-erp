# FASE 05 — Llamar desde mi celular (click-to-call de 2 patas) con la misma grabación y transcripción

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye la V3 completa)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Repo: `go-admin-erp`
> Depende de: **F0** (fix `resolveOrgFromExternal`, firmas fail-closed con token de (sub)cuenta, `TWILIO_WEBHOOK_BASE_URL` = origin, CHECKs de `calls` reconciliados, bucket `crm-call-recordings`, `outbound_jobs`, `twilio/verify/*` autenticados, permisos de micrófono en manifests) y **F3** (`voiceContextService`, `twimlBuilders`, `callCreditsService`, `/api/voice/status`, `/api/voice/recording`, `twiml/consent`, `CallDispositionDialog`, `QuickActionsBar`/`CallModeMenu`, `user_comm_preferences`, `MyMobileSection`, trigger `trg_calls_completed_activity`).
> Bloquea: nada crítico (F4 transcribe cualquier `call_recordings.ready`; F6 no depende de F5).
> Esfuerzo: **M** (2 PRs backend + 2 PRs UI, ~1.300 líneas netas). Valor: **alto** (es la única forma de llamar con grabación desde la app Capacitor y desde móviles en general).

---

## 0. Objetivo y alcance

Al terminar, con la org de prueba de F3 y un vendedor con celular verificado:

1. Desde tarjeta/drawer/detalle, **Llamar → Mi celular** hace que Twilio llame al celular del vendedor en ≤3 s con el caller id de la org; el vendedor contesta, oye "Llamada a Juan Pérez por Renovación 2027. Presiona 1 para conectar" y al pulsar 1 Twilio marca al cliente con el mismo aviso de consentimiento de F3.
2. El teléfono del vendedor **nunca viaja en el body**: se lee de `user_comm_preferences.mobile_phone_e164` y solo existe si fue verificado por OTP (`mobile_verified_at`).
3. La UI muestra el progreso en vivo por Realtime: *llamando a tu celular → contesta y presiona 1 → conectando al cliente → en llamada (timer) → finalizada*, con cancelar en cualquier punto previo a la conexión.
4. La conversación queda en **una** fila `calls` (`mode='bridge'`, `bridge_mode='agent_leg'`, `agent_leg_sid`, `customer_leg_sid`, `duration_seconds = DialCallDuration`) y en `mobile_call_bridges` con estados coherentes; misma grabación dual (canal 0 = vendedor, canal 1 = cliente), mismo `call_recordings`, mismo job `transcribe` (F4), misma actividad (trigger de F3), misma disposición.
5. Funciona en web, Electron, PWA móvil y la app Capacitor sin SDK ni permisos de micrófono (ruta A).
6. **Opcional (flag por org)**: el vendedor marca el número Twilio de la org desde su celular verificado, un IVR mínimo le pide el destino (o le ofrece la última oportunidad abierta) y la llamada sale grabada por el mismo pipeline, sin abrir la app.
7. **Registro manual** de una llamada hecha fuera de Twilio, con subida opcional de audio (≤40 MB) que entra al mismo pipeline de transcripción con `mode='manual'`.
8. Verificación OTP del celular desde Configuración › Telefonía › Mi celular, autenticada y con límite de intentos.

**No incluye:** captura nativa del registro/audio de llamadas del sistema (imposible sin ser dialer por defecto en Android; iOS no expone número ni audio: se mantiene la conclusión de la V3), ruta B (plugin nativo `@capgo/capacitor-twilio-voice`) más allá de su especificación, grabación desde la app con el micrófono del celular, conferencias de 3, SMS de seguimiento.

---

## 1. Estado actual verificado

> **Actualizado en la ronda 1 de construcción (2026-09-10).** La columna "Estado" refleja el árbol
> DESPUÉS de esta ronda; entre paréntesis queda el diagnóstico original (V4, 2026-09-08) y el
> hallazgo del informe `TEST-F5-r1.md` que cierra. Lo que sigue pendiente está en §13.

| Componente / archivo:línea | Estado | Situación |
|---|---|---|
| `src/app/api/voice/bridge/initiate/route.ts:26-42` | ✅ | Reescrita: zod sobre el body, que **solo** trae el número del cliente; `agent_phone` ya no existe en el contrato. Códigos 400 `INVALID_PHONE`/`SAME_NUMBER`, 402 `NO_CREDITS`, 409 `MOBILE_NOT_VERIFIED`/`BRIDGE_IN_PROGRESS`/`CALLER_ID_NOT_CONFIGURED`, 502 `PROVIDER_ERROR`, 503 sin `VOICE_CALLBACK_SECRET`. (Cierra **B2**.) |
| `src/lib/services/crm/mobileBridgeService.ts:206` `initiateBridge(ctx, input)` | ✅ | Celular del vendedor desde `user_comm_preferences` verificado (`:122 getVerifiedMobile`); reserva de 2 minutos ANTES del proveedor; **UNA** fila `calls` (`mode='bridge'`, `bridge_mode='agent_leg'`, `from_number=callerId`, `to_number=cliente`) con el `{error}` comprobado y reembolso si falla; `mobile_call_bridges.call_id` enlazado; `call_consents` con el texto exacto; URLs con `t=HMAC`. (Cierra **B1**, **A3**, **A4**, **M3**, **M5**.) |
| `mobileBridgeService.ts:101 getBridgeSettings` + `voiceContextService` (F3) | ✅ | Credenciales, caller id y ajustes salen de `voiceContextService` (`getTwilioClientForOrg`, `pickCallerId`) y de `comm_settings.voice_bridge_*`. Un caller id de la PLATAFORMA se rechaza con 409 en vez de marcar con el número global. |
| `src/app/api/voice/twiml/agent-leg/route.ts:49-70` | ✅ | Firma Twilio + `verifyBridgeToken` + `accountSidMatchesOrg`; org desde la fila; `customers`/`opportunities` leídos con `eq('organization_id')`; TwiML desde `bridgeTwimlBuilders` (`es-MX` + `Polly.Mia-Neural`); `<Gather>` "1 conectar / 2 cancelar" con `timeout="8"`; rama AMD (`AnsweredBy=machine_*` → `<Hangup/>` + `agent_no_answer`); `agent_answered` solo desde `initiating\|agent_ringing`. (Cierra **A1**, **M4**, y F5-35/36/37.) |
| `src/app/api/voice/twiml/customer-leg/route.ts:53-75` | ✅ | Mismo blindaje. `<Dial callerId action=…/api/voice/dial-complete?callId=…>` con `record="record-from-answer-dual"`, `recordingStatusCallbackEvent="completed absent"` y `<Number statusCallback=…&amp;leg=customer statusCallbackEvent url=…consent-whisper?callId=…>`. `Digits≠1` → `agent_rejected` + `calls.status='canceled'` + reembolso. (Cierra **B3**, **B4**.) |
| `src/app/api/voice/bridge/status/route.ts:88-107` | ✅ | Firma + token + `accountSidMatchesOrg`; sin `bridgeId` responde **400** (ya no 200 mudo); `calls` se localiza por `bridge.call_id`; `SequenceNumber` por leg y terminales pegajosos (`callStateMachine` de F3); el `CallDuration` del vendedor va a `metadata.agent_call_duration` (la conversación la fija `dial-complete`); una excepción responde **500** para que Twilio reintente. (Cierra **B4**, **A1**, **A3**.) |
| `mobileBridgeService.ts:450 cancelBridge(id, orgId, userId, isAdmin, client)` | ✅ | Compara el dueño (o admin), consulta el estado real de cada pata (`calls(sid).fetch()`) y manda `canceled` en `queued\|ringing` o `completed` en `in-progress`; si Twilio rechaza, **502 y el bridge NO se marca terminado**; `cancel_requested_at` + `last_error='canceled_by_user'`; reembolso del minuto no usado. Ruta `POST /api/voice/bridge/[id]/cancel`. (Cierra **A2**.) |
| `src/lib/services/integrations/twilio/twilioConfig.ts:91` `formatE164` | 🟡 | Sigue anteponiendo `+57` a ciegas, pero **F5 ya no lo usa**: `bridgeState.ts:109 normalizeE164` rechaza lo que no sea E.164 válido (`"abc"`, `"900609"` → `null`). Queda para F3. |
| `src/app/api/integrations/twilio/verify/{send,check}/route.ts` | ✅ (F0) | Autenticadas (401 sin sesión), `purpose:'mobile_verification'`, escriben `mobile_phone_e164` + `mobile_verified_at`. F5 **las consume** desde el bridge. Las rutas propias de §4.1 (`/api/crm/me/comm-preferences/mobile/*`) siguen pendientes (§13). |
| Teléfono del vendedor | ✅ | `user_comm_preferences.mobile_phone_e164` + `mobile_verified_at` por org; índice único `uq_ucp_org_verified_mobile` (migración de esta ronda). |
| UI de bridge | 🟡 | `src/components/crm/shared/MobileCallDialog.tsx` reescrito: sin campo editable, exige celular verificado de la org, Realtime sobre `mobile_call_bridges` con respaldo `GET /api/voice/bridge/[id]`, botón "Cancelar llamada". Faltan `MobileBridgeStatus` en el dock, `CallModeMenu`, `MyMobileSection` y `ManualCallDialog` (§13). |
| `mobile_call_bridges` (tabla) | ✅ | + `call_id`, `cancel_requested_at`, `last_error`; índices `idx_bridges_call/agent_leg/org_active`; trigger `trg_mcb_touch`; **política `mcb_update` por DUEÑO**; publicada en `supabase_realtime`. |
| `comm_settings` | ✅ | + `voice_mobile_ivr_enabled`, `voice_bridge_confirm_digit`, `voice_bridge_agent_timeout` (CHECK 10–60). |
| `calls.bridge_mode/agent_leg_sid/customer_leg_sid/duration_source` | ✅ | Se usan de verdad: una fila por conversación con ambos SIDs. |
| `mobile/capacitor.config.ts:27-34` | ✅ | Sin cambios: la ruta A no necesita SDK ni micrófono. |
| `src/app/api/crm/transcribe/route.ts:13` | 🟡 | Sigue existiendo (§12 pedía eliminarlo). No se toca en esta ronda: su sustituto `POST /api/crm/calls/manual` es de F4 y hay que comprobar que nadie lo importe. |

## 2. Arquitectura y flujo

### 2.1 Ruta A (recomendada ahora): bridge de 2 patas

```
UI (web / Electron / PWA / Capacitor)
 │ QuickActionsBar → CallModeMenu → "Mi celular"
 │ (1) POST /api/voice/bridge/initiate { to, opportunityId?, customerId? }
 ▼
Backend (sesión)
 │ agentPhone = user_comm_preferences.mobile_phone_e164 (verificado)   ← nunca del body
 │ precheck (E.164, horario, do-not-call, concurrencia, créditos: reserva 2 min)
 │ INSERT calls (mode bridge, bridge_mode agent_leg, status dialing, from callerId, to cliente)
 │ INSERT mobile_call_bridges (call_id, status initiating, whisper_text)
 │ t = HMAC(bridgeId)
 │ (2) twilio.calls.create({ to: agentPhone, from: callerId,
 │        url: BASE/api/voice/twiml/agent-leg?bridgeId&t,
 │        statusCallback: BASE/api/voice/bridge/status?bridgeId&leg=agent&t,
 │        statusCallbackEvent: ['initiated','ringing','answered','completed'],
 │        timeout: 25, machineDetection: 'Enable' (opcional) })
 │ UPDATE calls.provider_call_sid = agent_leg_sid = CA_agent ; bridges.status = agent_ringing
 ▼
Twilio → celular del vendedor
 │ (3) POST agent-leg  → <Gather numDigits="1" action=customer-leg><Say>whisper</Say></Gather>
 │ (4) vendedor pulsa 1 → POST customer-leg (Digits=1)
 │     → <Say>aviso breve</Say><Dial callerId record=dual recordingStatusCallback action=bridge/dial-complete>
 │         <Number url=twiml/consent statusCallback=bridge/status?leg=customer>+57 cliente</Number></Dial>
 │ (5) status leg=customer: initiated/ringing/in-progress/completed → calls + bridges
 │ (6) cliente contesta → whisper de consentimiento (F3) → bridge → grabación dual empieza
 │ (7) POST bridge/dial-complete: DialCallStatus, DialCallSid (=customer_leg_sid), DialCallDuration
 │ (8) POST /api/voice/recording (F3; CallSid = CA_agent → misma fila calls) → ready → job transcribe
 ▼
BD → Realtime (calls + mobile_call_bridges) → UI MobileBridgeStatus → CallDispositionDialog (F3)
```

### 2.2 Ruta B (futuro): SDK nativo en Capacitor

Especificada en 5.8; no forma parte del path crítico. La app remota seguiría llamando a `/api/voice/token`, pero el `Device` viviría en el plugin nativo (`@capgo/capacitor-twilio-voice`) con VoIP push (iOS PushKit) / FCM (Android) y `VoiceGrant({pushCredentialSid})`.

### 2.3 Variante "sin abrir la app" (opcional, flag `voice_mobile_ivr_enabled`)

```
Vendedor marca +57 601… (número Twilio de la org) desde su celular verificado
 → POST /api/voice/twiml/inbound (F3): From ∈ user_comm_preferences(org).mobile_phone_e164 verificado
 → rama agent-originated:
   <Gather input="dtmf" finishOnKey="#" timeout="8" action=twiml/agent-dial?userId&t>
     <Say>Hola {nombre}. Marca el número del cliente y termina con numeral, o pulsa 1 para llamar a {última oportunidad}</Say>
   </Gather>
 → agent-dial: Digits='1' → to = teléfono del cliente de la última oportunidad abierta del vendedor;
              Digits='3001234567#' → normaliza E.164; busca customer/opportunity por teléfono
   INSERT calls (mode bridge, bridge_mode full_bridge, direction outbound, provider_call_sid = CallSid entrante,
                 from callerId, to cliente, user_id, customer_id?, opportunity_id?)
   <Dial callerId record=dual … action=bridge/dial-complete><Number url=consent statusCallback=…>cliente</Number></Dial>
 → mismo pipeline (status, recording, actividad, disposición pendiente en la app: notificación "Registra el resultado de tu llamada a Juan Pérez")
```

### 2.4 Máquina de estados `mobile_call_bridges.status` (y su reflejo en `calls.status`)

| `bridges.status` | Evento | `calls.status` | Quién escribe |
|---|---|---|---|
| `initiating` | insert en `bridge/initiate` | `dialing` | API sesión |
| `agent_ringing` | `calls.create` ok; `status leg=agent CallStatus=initiated\|ringing` | `dialing` | API / `bridge/status` |
| `agent_answered` | `leg=agent in-progress` o llegada a `agent-leg` | `dialing` (todavía no suena el cliente) | `bridge/status` / `agent-leg` |
| `customer_dialing` | `customer-leg` con `Digits=1`; `leg=customer initiated\|ringing` | `ringing` | `customer-leg` / `bridge/status` |
| `in_progress` | `leg=customer in-progress` | `in_progress` (`answered_at`) | `bridge/status` |
| `completed` | `dial-complete DialCallStatus=completed` con `DialBridged=true` | `completed` (`duration=DialCallDuration`) | `bridge/dial-complete` |
| `agent_no_answer` | `leg=agent no-answer\|busy\|failed`, o `AnsweredBy=machine_*`, o `leg=agent completed` sin haber pasado por `agent_answered` | `no_answer` (`metadata.reason='agent_no_answer'`) | `bridge/status` |
| `agent_rejected` | `customer-leg` con `Digits!='1'` o timeout del `<Gather>` | `canceled` (`reason='agent_rejected'`) | `customer-leg` / `agent-leg` fallback |
| `failed` | `dial-complete DialCallStatus=busy\|no-answer\|failed\|canceled`, error Twilio en `calls.create`, cancelación del usuario | `busy` / `no_answer` / `failed` / `canceled` (según `DialCallStatus`) | `bridge/dial-complete` / API |

Reglas: terminales pegajosos; `leg=agent completed` que llega **después** de `in_progress` no cambia nada (el `dial-complete` ya cerró); `SequenceNumber` por leg en `calls.metadata.last_seq.{agent,customer}`.

---

## 3. Base de datos

### 3.1 Migraciones (MCP `apply_migration`)

#### `202609_crm_v4_f05_bridges_call_link`

```sql
ALTER TABLE public.mobile_call_bridges
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS idx_bridges_call ON public.mobile_call_bridges (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridges_agent_leg ON public.mobile_call_bridges (agent_leg_sid) WHERE agent_leg_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridges_org_active ON public.mobile_call_bridges (organization_id, user_id)
  WHERE status IN ('initiating','agent_ringing','agent_answered','customer_dialing','in_progress');

-- Solo el dueño puede cancelar; el resto de escrituras son del servidor.
DROP POLICY IF EXISTS mcb_update ON public.mobile_call_bridges;
CREATE POLICY mcb_update ON public.mobile_call_bridges FOR UPDATE
  USING (user_id = auth.uid() AND organization_id IN (SELECT om.organization_id FROM public.organization_members om
         WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_mcb_touch ON public.mobile_call_bridges;
CREATE TRIGGER trg_mcb_touch BEFORE UPDATE ON public.mobile_call_bridges
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();   -- creada en F3

ALTER TABLE public.comm_settings
  ADD COLUMN IF NOT EXISTS voice_mobile_ivr_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_bridge_confirm_digit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_bridge_agent_timeout integer NOT NULL DEFAULT 25
    CHECK (voice_bridge_agent_timeout BETWEEN 10 AND 60);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='mobile_call_bridges') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_call_bridges;
  END IF;
END $$;
```

#### `202609_crm_v4_f05_mobile_verification`

```sql
-- Intentos de OTP por usuario (rate limit servidor; no se expone al cliente).
CREATE TABLE IF NOT EXISTS public.mobile_verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('send','check')),
  success boolean NOT NULL DEFAULT false,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mva_user_recent ON public.mobile_verification_attempts (user_id, created_at DESC);
ALTER TABLE public.mobile_verification_attempts ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service role

CREATE OR REPLACE FUNCTION public.fn_mobile_otp_allowed(p_user_id uuid, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) < CASE p_kind WHEN 'send' THEN 3 ELSE 6 END
    FROM public.mobile_verification_attempts
   WHERE user_id = p_user_id AND kind = p_kind AND created_at > now() - interval '1 hour';
$$;

-- Un celular verificado no puede pertenecer a dos usuarios de la misma org (evita suplantación en la variante IVR).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ucp_org_verified_mobile ON public.user_comm_preferences (organization_id, mobile_phone_e164)
  WHERE mobile_verified_at IS NOT NULL;
```

### 3.2 Seeds

```sql
-- Vendedor de prueba con celular verificado (solo dev; en prod se llega por OTP).
-- INSERT INTO user_comm_preferences (user_id, organization_id, mobile_phone_e164, mobile_verified_at, default_call_mode)
-- VALUES ('<uuid>', 7, '+573101234567', now(), 'mobile') ON CONFLICT (user_id, organization_id) DO UPDATE SET mobile_phone_e164=EXCLUDED.mobile_phone_e164, mobile_verified_at=now();
```

### 3.3 Verificación post-migración

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='mobile_call_bridges' AND column_name IN ('call_id','cancel_requested_at','last_error'); -- 3
SELECT policyname, qual FROM pg_policies WHERE tablename='mobile_call_bridges' AND policyname='mcb_update';                                  -- contiene user_id = auth.uid()
SELECT column_name FROM information_schema.columns WHERE table_name='comm_settings' AND column_name LIKE 'voice_bridge_%' OR column_name='voice_mobile_ivr_enabled'; -- 3
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename IN ('calls','mobile_call_bridges');            -- 2
SELECT count(*) FROM pg_policies WHERE tablename='mobile_verification_attempts';                                                             -- 0 (solo service role)
SELECT public.fn_mobile_otp_allowed('00000000-0000-0000-0000-000000000000','send');                                                          -- true
SELECT indexname FROM pg_indexes WHERE indexname='uq_ucp_org_verified_mobile';                                                               -- 1
```

### 3.4 Impacto en tablas existentes

- `calls`: modo `bridge` con `bridge_mode='agent_leg'` (ruta A) o `'full_bridge'` (IVR); `provider_call_sid = agent_leg_sid` (la grabación de `<Dial>` cuelga del leg del vendedor); `customer_leg_sid = DialCallSid`; `from_number = callerId`, `to_number = cliente`; `metadata.bridge_id`, `metadata.agent_phone_masked`.
- `mobile_call_bridges`: se usa de verdad; `call_id` enlaza la conversación; `whisper_text` guarda el texto exacto reproducido.
- `activities`: nada nuevo (trigger de F3 pone `channel='mobile'`).
- `user_comm_preferences`: `mobile_phone_e164`/`mobile_verified_at` escritos solo por servidor tras OTP.
- Se deja de usar: `ActivityActions` modo `tel:` (`:364`) y su upload a `/api/crm/transcribe` (`:249`); `bridge/initiate` con `agent_phone` en body.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| POST | `/api/voice/bridge/initiate` (reescribir) | sesión | zod `{to: string, opportunityId?: uuid, customerId?: uuid, whisper?: string ≤200}` | 201 `{bridgeId, callId, status:'agent_ringing', agentPhoneMasked:'+57 310 *** 4567'}` | 400 número inválido; 402 `NO_CREDITS`; 409 `MOBILE_NOT_VERIFIED` / `BRIDGE_IN_PROGRESS` (ya hay uno activo del usuario) / `MAX_CONCURRENT`; 423 horario; 451 do-not-call; 502 Twilio (bridge `failed`, `last_error`) | header `Idempotency-Key` opcional → `metadata.idempotency_key` con UNIQUE parcial (10 min) |
| POST | `/api/voice/bridge/[id]/cancel` (NUEVO) | sesión (dueño o admin) | — | `{status}` | 404; 409 si ya terminal | idempotente |
| GET | `/api/voice/bridge/[id]` (NUEVO) | sesión | — | `{bridge, call}` (fallback de Realtime) | 404 | n/a |
| POST | `/api/voice/twiml/agent-leg` (reescribir) | firma + `t` | query `bridgeId, t`; form `CallSid, AccountSid, CallStatus, AnsweredBy?` | TwiML 4.5.1 | 403; bridge inexistente/terminal → `<Hangup/>` | update `agent_answered` solo desde `agent_ringing` |
| POST | `/api/voice/twiml/customer-leg` (reescribir) | firma + `t` | form `Digits?` | TwiML 4.5.2 o hangup | 403 | `customer_dialing` solo desde `agent_answered` (un segundo POST con Digits repite el mismo TwiML sin re-insertar) |
| POST | `/api/voice/bridge/status` (reescribir) | firma + `t` | query `bridgeId, leg=agent\|customer, t`; form `CallSid, ParentCallSid?, CallStatus, SequenceNumber, CallDuration?, AnsweredBy?` | `<Response/>` | 403 | `SequenceNumber` por leg; terminales pegajosos |
| POST | `/api/voice/bridge/dial-complete` (NUEVO) | firma + `t` | form `DialCallStatus, DialCallSid, DialCallDuration, DialBridged` | `<Response><Say>Llamada finalizada.</Say><Hangup/></Response>` | 403 | terminal pegajoso |
| POST | `/api/voice/twiml/agent-dial` (NUEVO, opcional IVR) | firma + `t` | query `userId, orgId, t`; form `Digits, CallSid, From` | TwiML 4.5.3 | 403; `From` ≠ celular verificado → hangup | insert `calls` por `provider_call_sid` único |
| POST | `/api/crm/me/comm-preferences/mobile/send-otp` (NUEVO) | sesión | `{phone: string}` | `{status:'pending', maskedPhone}` | 400 inválido; 429 `fn_mobile_otp_allowed=false`; 409 celular ya verificado por otro usuario de la org | n/a |
| POST | `/api/crm/me/comm-preferences/mobile/check-otp` (NUEVO) | sesión | `{phone, code}` | `{verified:true, phone}` → upsert `user_comm_preferences` (service role) | 400 código inválido (`status:'pending'`); 429 | n/a |
| DELETE | `/api/crm/me/comm-preferences/mobile` (NUEVO) | sesión | — | `{ok}` (borra número y `mobile_verified_at`; `default_call_mode='browser'`) | — | idempotente |
| POST | `/api/crm/calls/manual` (NUEVO) | sesión | `multipart/form-data`: `to (E.164), direction ('inbound'\|'outbound'), occurred_at (ISO), duration_seconds (0..14400), outcome (Disposition.outcome), note?, opportunityId?, customerId?, audio? (File ≤40 MB; mime `audio/mpeg\|audio/mp4\|audio/x-m4a\|audio/aac\|audio/ogg\|audio/wav\|audio/webm`)` | 201 `{callId, recordingId?}` | 400 zod; 413 > 40 MB; 415 mime/magic bytes inválidos; 451 | n/a (cada envío es una llamada) |
| POST | `/api/voice/call` (F3) | sesión | `{mode:'bridge', …}` → redirige internamente a `bridge/initiate` | idem | idem | idem |

### 4.2 Servicios

| Archivo | Acción | Exports (firma TS) | Responsabilidad |
|---|---|---|---|
| `src/lib/services/crm/mobileBridgeService.ts` | reescribir (≤300L) | `initiateBridge(ctx: {organizationId, userId, supabase}, input: {to: string; opportunityId?: string; customerId?: string; whisper?: string}): Promise<{bridge: MobileCallBridge; call: CallRecord}>` · `cancelBridge(bridgeId, orgId, userId, isAdmin, client)` · `getBridge(bridgeId, orgId, client)` · `applyAgentLegEvent(bridge, ev: TwilioStatusEvent, client)` · `applyCustomerLegEvent(bridge, ev, client)` · `applyBridgeDialComplete(bridge, ev: DialCompleteEvent, client)` · `buildWhisper(p: {customerName: string; opportunityName?: string; confirmDigit: boolean}): string` · `getVerifiedMobile(userId, orgId, client): Promise<string \| null>` · `signBridgeToken(bridgeId): string` / `verifyBridgeToken(bridgeId, t): boolean` (usa `twilioSignature.signCallbackToken`) | Toda la lógica del bridge; usa `voiceContextService` (F3) para credenciales/caller id/settings y `callCreditsService` para créditos. |
| `src/lib/services/crm/twimlBuilders.ts` (F3) | ampliar (+60L) | `buildAgentLegTwiml(p: {whisper: string; actionUrl: string; confirmDigit: boolean; voice; language; timeout: number}): string` · `buildCustomerLegTwiml(p: {to: string; callerId: string; recordingEnabled: boolean; recordingCallbackUrl; statusCallbackUrl; consentUrl; dialCompleteUrl; timeout; voice; language}): string` · `buildAgentDialGatherTwiml(p)` (IVR) | XML escapado por construcción. |
| `src/lib/services/crm/mobileVerificationService.ts` | NUEVO (≤140L) | `sendMobileOtp(ctx, phone, ip): Promise<{maskedPhone}>` · `checkMobileOtp(ctx, phone, code, ip): Promise<{verified: boolean}>` · `removeMobile(ctx)` · `maskPhone(e164): string` | Usa `twilioVerifyService.sendCode/checkCode`; registra `mobile_verification_attempts` con service role; aplica `fn_mobile_otp_allowed`. |
| `src/lib/services/crm/manualCallService.ts` | NUEVO (≤200L) | `createManualCall(ctx, input: ManualCallInput, audio?: {buffer: Buffer; mime: string; size: number}): Promise<{call: CallRecord; recording?: CallRecording}>` · `sniffAudioMime(buf: Buffer): string \| null` (ID3/`fffb` mp3, `ftyp` m4a/mp4, `OggS`, `RIFF…WAVE`, EBML webm) | Inserta `calls` (`mode='manual'`, `duration_source='manual'`, `status='completed'`, `provider='manual'`), sube audio a `crm-call-recordings` (`org_{id}/{yyyy}/{mm}/{callId}.{ext}`), `call_recordings` (`channels='1'`, `storage_provider='supabase'`, `status='ready'`, `provider_recording_sid=null`), encola `transcribe` con `payload.channels=1`. |
| `src/lib/services/crm/voiceContextService.ts` (F3) | ampliar (+40L) | `resolveAgentByMobile(orgId, fromE164, client): Promise<{userId, firstName} \| null>` · `getLastOpenOpportunityForUser(orgId, userId, client): Promise<{id, name, customerPhone, customerId} \| null>` | Variante IVR. |
| `src/lib/services/integrations/twilio/twilioVerifyService.ts` | conservar | `sendCode`, `checkCode` | Ya funciona. |

### 4.3 Webhooks / proveedor (payload real → verificación → mapeo)

- **`agent-leg`** (URL de `calls.create`): form `CallSid=CA_agent, AccountSid, From=+57601…(callerId), To=+57310…(vendedor), CallStatus=in-progress, Direction=outbound-api, AnsweredBy?`. Verificación: firma Twilio (token por `AccountSid`) **y** `verifyBridgeToken(bridgeId, t)`. Si `AnsweredBy` ∈ `machine_*` → `<Hangup/>` y `agent_no_answer` (`reason='agent_voicemail'`). Si bridge no está en `agent_ringing|initiating` → `<Hangup/>` (repetición). Mapeo: `bridges.status='agent_answered'`, `bridges.agent_leg_sid=CallSid` si faltaba.
- **`customer-leg`** (`action` del `<Gather>`): form `Digits=1`, `CallSid=CA_agent`, `msg=Gather End`? (cuando expira el Gather sin dígito, Twilio sigue al siguiente verbo del TwiML original, no llama al `action`; por eso el TwiML de agent-leg lleva `<Say>` + `<Hangup/>` de fallback y marca `agent_rejected` vía `bridge/status leg=agent completed` sin `customer_dialing`). `Digits='1'` → `customer_dialing`, `calls.status='ringing'`, TwiML 4.5.2. Otro dígito → `agent_rejected`, `calls.status='canceled'`, `<Say>Llamada cancelada</Say><Hangup/>`.
- **`bridge/status?leg=agent`**: `CallSid=CA_agent, CallStatus ∈ initiated|ringing|in-progress|completed|busy|no-answer|failed|canceled, SequenceNumber, CallDuration?`. Mapeo 2.4. `completed` con bridge en `agent_ringing|agent_answered` (nunca llegó `customer_dialing`) → `agent_rejected` si hubo `agent_answered`, `agent_no_answer` si no.
- **`bridge/status?leg=customer`**: `CallSid=CA_customer, ParentCallSid=CA_agent, Direction=outbound-dial, CallStatus …`. `initiated` → `customer_leg_sid=CallSid` en `calls` y `bridges`; `in-progress` → `in_progress` + `answered_at`; terminales → no cierran (espera `dial-complete`), salvo que `dial-complete` no llegue en 60 s (job `calls_reconcile` de F3).
- **`bridge/dial-complete`**: `DialCallStatus=completed|busy|no-answer|failed|canceled, DialCallSid=CA_customer, DialCallDuration=185, DialBridged=true`. → `calls.status` final, `duration_seconds=DialCallDuration`, `ended_at`, `bridges.status` (`completed` o `failed`), liquidación de créditos (F3 `settleVoiceCall`, sku de 2 patas), y responde `<Say>` corto + `<Hangup/>` para cerrar el leg del vendedor.
- **`/api/voice/recording`** (F3, sin cambios): `CallSid=CA_agent` → `calls.provider_call_sid` → misma fila. `RecordingChannels=2`: canal 0 = leg padre (**vendedor**), canal 1 = cliente. Coincide con la regla de F4 "canal 0 = quien originó = agente en outbound".
- **Twilio Verify** (`sendCode`): `POST /v2/Services/{VA…}/Verifications {To, Channel:'sms'}` → `status:'pending'`; `checkCode`: `POST /VerificationCheck {To, Code}` → `status:'approved'`. Errores 60200 (número inválido), 60203 (máx intentos), 60202 (máx checks) → 400/429 con mensaje.

### 4.4 Jobs / cola

| kind | payload | Productor | Consumidor |
|---|---|---|---|
| `transcribe` (F4) | `{call_id, recording_id, organization_id, channels: 2 \| 1, direction, mode:'bridge'\|'manual'}` | `storeRecording` (F3) / `createManualCall` | F4 (mono → sin asignación por canal; diarización por hablante) |
| `calls_reconcile` (F3) | — | pg_cron 15 min | Cierra bridges en estados activos > 2 h consultando `client.calls(agent_leg_sid).fetch()` y `customer_leg_sid`; marca `failed` + `last_error='reconciled'`. |
| `bridge_disposition_reminder` (NUEVO, opcional) | `{call_id, user_id}` | `dial-complete` de la variante IVR (sin app abierta) | `fn_create_org_notification` al vendedor: "Registra el resultado de tu llamada a {cliente}" (push existente) |

### 4.5 Snippets

#### 4.5.1 `calls.create` + TwiML del leg del vendedor

```ts
const t = signBridgeToken(bridge.id);
const q = `bridgeId=${bridge.id}&t=${t}`;
const call = await ctx.twilio.client.calls.create({
  to: agentPhone, from: ctx.callerId,
  url: `${BASE}/api/voice/twiml/agent-leg?${q}`, method: 'POST',
  statusCallback: `${BASE}/api/voice/bridge/status?${q}&leg=agent`,
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'], statusCallbackMethod: 'POST',
  timeout: settings.voice_bridge_agent_timeout,                     // 25 s por defecto
  ...(settings.voice_amd_enabled ? { machineDetection: 'Enable', machineDetectionTimeout: 5 } : {}),
});
```

```xml
<Response>
  <Gather numDigits="1" action="https://app.goadmin.io/api/voice/twiml/customer-leg?bridgeId=…&amp;t=…" method="POST" timeout="8">
    <Say language="es-MX" voice="Polly.Mia-Neural">Llamada a Juan Pérez por Renovación 2027. Presiona 1 para conectar, o 2 para cancelar.</Say>
  </Gather>
  <Say language="es-MX" voice="Polly.Mia-Neural">No recibimos confirmación. Hasta luego.</Say>
  <Hangup/>
</Response>
```
Con `voice_bridge_confirm_digit=false` el TwiML es directamente el de 4.5.2 precedido del whisper (sin `<Gather>`). El whisper se construye con `escapeXml(buildWhisper(...))` y `&` en la URL va como `&amp;` (C9).

#### 4.5.2 TwiML del leg del cliente (`customer-leg`, `Digits=1`)

```xml
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Conectando. Esta llamada se grabará.</Say>
  <Dial callerId="+5760XXXXXXX" record="record-from-answer-dual"
        recordingStatusCallback="https://app.goadmin.io/api/voice/recording"
        recordingStatusCallbackEvent="completed absent" recordingStatusCallbackMethod="POST"
        answerOnBridge="true" timeout="30" timeLimit="7200"
        action="https://app.goadmin.io/api/voice/bridge/dial-complete?bridgeId=…&amp;t=…" method="POST">
    <Number statusCallback="https://app.goadmin.io/api/voice/bridge/status?bridgeId=…&amp;t=…&amp;leg=customer"
            statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST"
            url="https://app.goadmin.io/api/voice/twiml/consent?callId=…&amp;t=…">+573001234567</Number>
  </Dial>
</Response>
```
El consentimiento al cliente reutiliza `twiml/consent` de F3 (whisper al contestar, dentro de la grabación). El `<Say>` inicial lo oye el vendedor.

#### 4.5.3 Variante IVR: rama en `twiml/inbound` (F3) y `agent-dial`

```xml
<!-- inbound, From = celular verificado del vendedor y voice_mobile_ivr_enabled -->
<Response>
  <Gather input="dtmf" finishOnKey="#" timeout="8" action="…/api/voice/twiml/agent-dial?userId=…&amp;orgId=7&amp;t=…" method="POST">
    <Say language="es-MX" voice="Polly.Mia-Neural">Hola Ana. Marca el número del cliente y termina con numeral, o pulsa 1 para llamar a Rest. El Corral por Renovación 2027.</Say>
  </Gather>
  <Say language="es-MX" voice="Polly.Mia-Neural">No recibimos un número. Hasta luego.</Say><Hangup/>
</Response>
```
`agent-dial`: verifica que `From` sigue siendo el celular verificado de `userId` en `orgId` (no confía solo en la query), resuelve destino, inserta `calls` (`mode='bridge'`, `bridge_mode='full_bridge'`, `provider_call_sid=CallSid`) y responde el TwiML 4.5.2 (sin `bridgeId`; `dial-complete` y `status` reciben `callId` en vez de `bridgeId`).

#### 4.5.4 Token de bridge (sin UUID adivinable)

```ts
import { createHmac, timingSafeEqual } from 'crypto';
export const signBridgeToken = (bridgeId: string) =>
  createHmac('sha256', process.env.VOICE_CALLBACK_SECRET!).update(`bridge:${bridgeId}`).digest('hex').slice(0, 32);
export const verifyBridgeToken = (bridgeId: string, t: string) => {
  const a = Buffer.from(signBridgeToken(bridgeId)); const b = Buffer.from(t ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
};
```

#### 4.5.5 Cancelación correcta según estado del leg

```ts
const legs = [bridge.agent_leg_sid, bridge.customer_leg_sid].filter(Boolean) as string[];
for (const sid of legs) {
  const c = await client.calls(sid).fetch();
  if (['queued', 'ringing'].includes(c.status)) await client.calls(sid).update({ status: 'canceled' });
  else if (c.status === 'in-progress') await client.calls(sid).update({ status: 'completed' });
}
```

### 4.6 Variables de entorno

**Corregido en la ronda 1:** `VOICE_CALLBACK_SECRET` se daba por existente "(F3)" y **no existe** ni en el entorno ni en el código previo. Esta ronda lo crea (`bridgeTokens.ts`), lo documenta en `.env.example` y hace la fase fail-closed sin él (503 al iniciar, 403 en los callbacks). El dueño debe definirlo.

Ninguna nueva: reutiliza `TWILIO_WEBHOOK_BASE_URL` (origin), `VOICE_CALLBACK_SECRET` (F3), `TWILIO_VERIFY_SERVICE_SID` (existente), credenciales del registry (F0). Opcional: `VOICE_MANUAL_AUDIO_MAX_MB` (default 40).

### 4.7 Dependencias npm

Las de F3 (`twilio ^6.1`, `libphonenumber-js`). Para `sniffAudioMime` no se añade librería (magic bytes propios, ≤40L). Ruta B (futuro): `@capgo/capacitor-twilio-voice ^8.2.12` en `mobile/package.json` (no se instala en esta fase).

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| (global) | `SoftphoneDock` (F3) | Muestra `MobileBridgeStatus` en lugar del panel WebRTC mientras hay bridge activo del usuario. |
| `/app/configuracion?modulo=crm&tab=telefonia` › Mi celular | `src/components/configuracion/crm/telephony/MyMobileSection.tsx` (F3, completar) | OTP, modo por defecto, borrar celular. |
| Tarjeta/drawer/detalle/cliente | `QuickActionsBar` + `CallModeMenu` (F3) | Opción "Mi celular" y "Registrar llamada manual". |
| `/app/crm/llamadas` | `CallsTable`/`CallDetailSheet` (F3) | Icono 📱 para `mode='bridge'`, ✍️ para `manual`; columna "Vendedor desde" con celular enmascarado. |

### 5.2 Componentes

| Archivo | Acción / tamaño | Props (TS) | Estado / hooks / servicios |
|---|---|---|---|
| `src/components/voice/MobileBridgeStatus.tsx` | NUEVO ≤200L | `{bridgeId: string; callId: string; onFinished: (callId) => void}` | `useBridgeRealtime(bridgeId)` (canal `postgres_changes` sobre `mobile_call_bridges` filter `id=eq.` + `calls` filter `id=eq.`); pasos con iconos y texto; timer desde `answered_at`; botón Cancelar (`POST /api/voice/bridge/[id]/cancel`) visible hasta `in_progress`; al terminal `completed|failed|…` llama `onFinished` → `CallDispositionDialog` (F3) si `completed`, o mensaje con "Reintentar" si `agent_no_answer|agent_rejected|failed`. `aria-live="polite"`. |
| `src/components/voice/hooks/useBridgeRealtime.ts` | NUEVO ≤90L | `(bridgeId: string \| null) => {bridge, call, connected}` | Realtime + fallback `GET /api/voice/bridge/[id]` cada 4 s si `connected=false` o durante 20 s tras iniciar (los primeros callbacks pueden llegar antes de suscribirse). |
| `src/components/crm/shared/CallModeMenu.tsx` (F3) | ampliar (+40L) | — | "Mi celular · +57 310 *** 4567" con tooltip de costo ("≈ $0,08/min, 2 patas"); si no hay celular verificado → ítem deshabilitado "Verifica tu celular" que abre `MyMobileSection` en un `Sheet`. Ítem "Registrar llamada manual" al final. Preselección en móvil/Capacitor. |
| `src/components/voice/SoftphoneProvider.tsx` (F3) | ampliar (+50L) | añade `startBridge(to, ctx): Promise<{bridgeId, callId}>`, `activeBridge: {bridgeId, callId} \| null`, `cancelBridge()` | Un solo bridge activo por usuario (409 del servidor se refleja en toast). |
| `src/components/configuracion/crm/telephony/MyMobileSection.tsx` (F3) | completar ≤180L | — | Input E.164 con selector de país (CO por defecto), botón "Enviar código" (cooldown 60 s, máx 3/h), input de 6 dígitos con autofocus, "Verificar", estado "Verificado el {fecha}", "Quitar celular", radio modo por defecto (Navegador / Mi celular), aviso de costo. |
| `src/components/voice/ManualCallDialog.tsx` | NUEVO ≤220L | `{opportunityId?, customerId?, phone?, onCreated}` | Campos: número (prefill), dirección, fecha/hora (default ahora), duración (mm:ss), resultado (mismas opciones que la disposición), nota, audio (dropzone; valida mime/tamaño en cliente; barra de progreso). `POST /api/crm/calls/manual` (multipart). Reemplaza `ActivityActions.CallDialog` modo manual. |
| `src/components/voice/CallsTable.tsx` (F3) | ampliar (+20L) | — | Iconos por modo; filtro `mode`. |
| `src/app/api/...` | — | — | Ver 4.1. |

### 5.3 Flujos de usuario

**A. Verificar mi celular (una vez)**
1. Configuración › Telefonía › Mi celular → escribir `310 123 4567` (se normaliza a `+573101234567`) → "Enviar código".
2. SMS con código de 6 dígitos → escribirlo → "Verificar" → "Verificado hoy 10:32". Se ofrece "Usar mi celular como modo por defecto".

**B. Llamar desde mi celular**
1. Tarjeta → 📞 → "Mi celular". El dock muestra `MobileBridgeStatus`: "Llamando a tu celular +57 310 *** 4567…" (pulso).
2. El celular suena (caller id de la org). Contesta → oye "Llamada a Juan Pérez por Renovación 2027. Presiona 1 para conectar, o 2 para cancelar". Dock: "Contesta y presiona 1".
3. Pulsa 1 → dock: "Conectando al cliente…"; oye "Conectando. Esta llamada se grabará" y ringback.
4. El cliente contesta → oye el consentimiento → conversación. Dock: "● REC En llamada 02:14" (timer por `answered_at`).
5. Cualquiera cuelga → dock "Finalizada (2:14)" → `CallDispositionDialog` → guardar. La actividad aparece en el timeline con player cuando la grabación esté `ready`; F4 transcribe.
6. Si no contesta su celular en 25 s: dock "No contestaste en tu celular" + Reintentar / Usar navegador. Si pulsa 2: "Cancelaste la llamada".

**C. Llamar sin abrir la app (opcional)**
1. Desde su celular verificado, el vendedor marca el número de la org.
2. Oye "Hola Ana. Marca el número del cliente y termina con numeral, o pulsa 1 para llamar a Rest. El Corral por Renovación 2027".
3. Pulsa 1 → misma secuencia desde el paso B.3. Al terminar recibe notificación push/in-app "Registra el resultado de tu llamada a Rest. El Corral" que abre `CallDetailSheet` con la disposición.

**D. Registrar llamada manual**
1. 📞 → "Registrar llamada manual" → `ManualCallDialog` → completar → arrastrar `.m4a` grabado con la app del celular (opcional) → "Registrar".
2. Se crea `calls` (`manual`), actividad, y si hay audio, `call_recordings` + job `transcribe`. El timeline muestra "Transcribiendo…" hasta que F4 termine.

### 5.4 Wireframes ASCII

```
MobileBridgeStatus (dock)                          MyMobileSection
┌──────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
│ 📱 Llamada desde mi celular               │    │ Mi celular                                │
│ ✔ Llamando a tu celular +57 310 *** 4567  │    │ [🇨🇴 +57 ▾] [310 123 4567] [Enviar código]│
│ ● Contesta y presiona 1        (pulso)    │    │ Código: [_ _ _ _ _ _]        [Verificar]  │
│ ○ Conectando al cliente                   │    │ ✔ Verificado el 8 sep 2026, 10:32         │
│ ○ En llamada                              │    │ Modo por defecto: (•) Navegador ( ) Mi cel│
│                         [Cancelar llamada]│    │ ℹ Llamar desde el celular cuesta ≈ 2×     │
└──────────────────────────────────────────┘    │                          [Quitar celular]  │
                                                 └─────────────────────────────────────────┘
MobileBridgeStatus (en llamada)                    ManualCallDialog
┌──────────────────────────────────────────┐    ┌─────────────────────────────────────────┐
│ ● REC  En llamada 02:14                   │    │ Registrar llamada manual                  │
│ Juan Pérez · Rest. El Corral              │    │ Número: [+57 300 123 4567]  Dir: [Sal. ▾] │
│ +57 300 123 4567 · Renovación 2027        │    │ Fecha: [08/09/2026 10:15]  Dur: [04:12]   │
│ (controles en tu celular)                 │    │ Resultado: [Contactado ▾]                 │
└──────────────────────────────────────────┘    │ Nota: [___________________________]       │
                                                 │ Audio: [⬆ Arrastra .mp3/.m4a (≤40 MB)]    │
CallModeMenu (móvil)                             │                    [Cancelar] [Registrar] │
┌──────────────────────────────────────────┐    └─────────────────────────────────────────┘
│ 📱 Mi celular +57 310 *** 4567  ≈$0,08/min│
│ 🖥 Navegador  (no disponible en móvil)    │
│ 🤖 Agente IA                              │
│ ✍️ Registrar llamada manual               │
└──────────────────────────────────────────┘
```

### 5.5 Estados vacíos / carga / error

| Situación | UI |
|---|---|
| Sin celular verificado | Ítem "Mi celular" deshabilitado con CTA "Verificar celular" (abre `MyMobileSection` en Sheet sin salir del pipeline). |
| 429 OTP | "Has pedido 3 códigos en la última hora. Intenta a las 11:32." |
| 409 `BRIDGE_IN_PROGRESS` | "Ya tienes una llamada en curso desde tu celular" + botón "Ver". |
| 402 / 423 / 451 | Mismos toasts de F3 (créditos, horario, no contactar). |
| `agent_no_answer` | "No contestaste en tu celular. ¿Reintentar o llamar desde el navegador?" |
| `agent_rejected` | "Cancelaste la llamada (pulsaste 2 / sin respuesta)". |
| `failed` con `DialCallStatus=busy\|no-answer` | "El cliente está ocupado / no contestó" → disposición con resultado preseleccionado. |
| Realtime caído | Polling 4 s; chip "Actualizando…". |
| Audio manual inválido | 415: "Formato no soportado (mp3, m4a, aac, ogg, wav, webm)"; 413: "Máximo 40 MB". |
| Capacitor sin red | El botón queda deshabilitado con "Sin conexión" (`navigator.onLine`). |

### 5.6 Accesibilidad

- `MobileBridgeStatus`: lista ordenada `<ol>` con `aria-current="step"`; `aria-live="polite"` anuncia cada cambio de paso; Cancelar accesible con `Esc` cuando el dock tiene foco.
- OTP: input con `inputmode="numeric"`, `autocomplete="one-time-code"`, `aria-describedby` con el mensaje de error.
- `ManualCallDialog`: dropzone con botón alternativo "Elegir archivo"; errores asociados por `aria-describedby`.
- Atajo `Ctrl+Shift+C` (F3) respeta `default_call_mode='mobile'`.

### 5.7 Motion

Pulso de opacidad en el paso activo (1,5 s); check verde con fade 0,2 s al completar cada paso; sin desplazamientos. `prefers-reduced-motion` → estático.

### 5.8 Responsive / cross-platform

| Plataforma | Ruta A (bridge) | Notas |
|---|---|---|
| Web escritorio / Electron / PWA escritorio | ✅ | Útil cuando no hay micrófono o el vendedor prefiere su celular. Electron usa el softphone de F3 por defecto. |
| Navegador móvil / PWA móvil | ✅ (preselección) | Sin micrófono ni background: el bridge es el modo por defecto. |
| Capacitor iOS/Android (`mobile/`) | ✅ | Sin SDK ni permisos de audio; el WebView solo dispara `POST bridge/initiate` y escucha Realtime (`*.supabase.co` ya en `allowNavigation`). Al recibir la llamada, iOS/Android ponen la app en background; al volver, `useBridgeRealtime` re-sincroniza. Notificación push (plugin existente) "Llamada finalizada: registra el resultado" si la app estaba en background al colgar. |
| **Ruta B (futuro)**: `@capgo/capacitor-twilio-voice` 8.2.12 | ⏳ | Requisitos: Capacitor ≥8 (ok), Apple Developer con VoIP Services certificate (PushKit) y Push Credential en Twilio (`client.notify.v1.credentials.create({type:'apn', ...})`), FCM Server Key para Android, `VoiceGrant({outgoingApplicationSid, incomingAllow:true, pushCredentialSid})` en `/api/voice/token` cuando `platform` sea nativa, `RECORD_AUDIO`/`NSMicrophoneUsageDescription` (F0). Límites: web no soportado por el plugin; llamada en background exige CallKit/ConnectionService (el plugin lo hace); revisión de App Store por VoIP. Costo: SDK $0.004/min (igual que browser) frente a 2 patas PSTN. Esfuerzo estimado L (2–3 semanas incl. pruebas en dispositivos). |
| Layout | — | `MobileBridgeStatus` a ancho completo en `<640px`; `ManualCallDialog` a pantalla completa en móvil (`Sheet side="bottom"`). |

---

## 6. Integración con proveedores

- `calls.create` (twilio 6.1): parámetros exactos `to, from, url, method, statusCallback, statusCallbackEvent, statusCallbackMethod, timeout, machineDetection, machineDetectionTimeout`. `from` debe ser número Twilio de la (sub)cuenta o Verified Caller ID (`voice_caller_id`); si no, error 21210 → 502 con mensaje "Configura el caller id".
- `<Gather numDigits="1" action method timeout>`: cuando expira sin dígitos Twilio **no** llama a `action`, continúa con el siguiente verbo → por eso el fallback `<Say>+<Hangup/>` y el cierre por `bridge/status leg=agent completed`.
- `<Dial action>`: recibe `DialCallStatus, DialCallSid, DialCallDuration, DialBridged, RecordingUrl`; `DialCallDuration` es la duración conversada. `<Number statusCallback statusCallbackEvent url>` para el leg del cliente. `record="record-from-answer-dual"` en `<Dial>` graba el **leg padre** (vendedor) → `RecordingStatusCallback` llega con `CallSid=CA_agent`.
- AMD en el leg del vendedor (`machineDetection:'Enable'`, $0.0075/llamada): detecta buzón del propio vendedor y evita "hablarle" al buzón; `AnsweredBy` llega en el webhook `agent-leg` (sin `asyncAmd`). Opcional por org (`voice_amd_enabled`).
- Twilio Verify: `TWILIO_VERIFY_SERVICE_SID` existente; canal `sms` (CO $0.0592/segmento) o `call` como alternativa si el SMS no llega; límites: 5 códigos por número por 10 min (Twilio) además de los nuestros.
- Precios (D8): 2 patas móvil CO = 2 × $0.0377 = $0.0754/min + grabación $0.0025 + TTS (whisper ~120 chars + consentimiento ~150 chars ≈ $0.009) → **≈ $0.08/min**; llamada de 5 min ≈ $0.40 (vs ≈ $0.23 browser). Si el cliente es fijo: $0.0377 + $0.07 = $0.1077/min. Los minutos se cuentan sobre `DialCallDuration` para la pata del cliente y `CallDuration` del leg del vendedor para la pata del agente (incluye whisper y espera): se debitan ambos.
- Gotchas: el vendedor con "llamada en espera" o doble SIM puede recibir con retraso (timeout 25 s configurable); `sendDigits` no aplica; si el vendedor tiene el número Twilio guardado como contacto, el caller id se muestra con nombre; en iOS, contestar desde la pantalla de bloqueo y pulsar 1 requiere abrir el teclado (documentar en el whisper: "abre el teclado y presiona 1" solo la primera vez, `metadata.first_bridge`).

---

## 7. Multi-tenant y seguridad

| Endpoint | Controles | Hallazgo |
|---|---|---|
| `bridge/initiate` | sesión; `agentPhone` de `user_comm_preferences` (verificado) del **mismo** `userId`/`orgId`; `to` E.164 validado; `opportunityId/customerId` con `eq('organization_id')`; precheck (créditos, horario, `fn_can_contact`, concurrencia, 1 bridge activo por usuario); rate limit 20 bridges/usuario/hora | body con `agent_phone` (fraude de caller id), C4 |
| `agent-leg`, `customer-leg`, `bridge/status`, `bridge/dial-complete` | firma Twilio fail-closed con token por `AccountSid` **y** `verifyBridgeToken`; bridge por `id` y luego **todo** con `eq('organization_id', bridge.organization_id)`; `calls` por `bridge.call_id` (no por `provider_call_sid` suelto); `customers` por `id`+`organization_id`; `AccountSid` debe ser el de la (sub)cuenta de esa org | C12, C13, C14, C19, C9 |
| `agent-dial` (IVR) | firma; `From` recomprobado contra `user_comm_preferences` verificado de la org resuelta por `To`; índice único `uq_ucp_org_verified_mobile` | suplantación por caller id falso (mitigada, no eliminada: STIR/SHAKEN no aplica en CO; por eso es opcional y desactivado por defecto) |
| `bridge/[id]/cancel` | sesión; dueño (`user_id`) o admin; `eq('organization_id')` | IDOR |
| `send-otp` / `check-otp` | sesión; `fn_mobile_otp_allowed`; número normalizado; no revela si el número pertenece a otro usuario más allá del 409 genérico; nunca expone `twilio/verify/*` sin auth (F0 los cierra) | SMS pumping |
| `calls/manual` | sesión; zod; magic bytes; tamaño; path `org_{ctx.organizationId}/…`; `user_id = ctx.userId` | subida arbitraria |
| Datos | celular enmascarado en logs y respuestas (`+57 310 *** 4567`); `mobile_verification_attempts` sin políticas (service role) | PII |
| Compliance CO (D9) | consentimiento al cliente igual que F3; el vendedor consiente al pulsar 1 tras oír "se grabará" (`call_consents` extra `consent_type='agent_recording'`, `method='dtmf'`); horario de contacto; retención | D9 |

---

## 8. Créditos, costos y límites

- Reserva en `bridge/initiate`: `deduct_comm_credits(org,'voice',2)` (1 min por pata). `false` → 402 antes de llamar a Twilio.
- Liquidación en `dial-complete`: `minutes_customer = ceil(DialCallDuration/60)`, `minutes_agent = ceil(agentCallDuration/60)` (llega en `bridge/status leg=agent completed`; si aún no llegó, se usa `DialCallDuration + 30 s` y se corrige al llegar). `credits_used = minutes_customer + minutes_agent - 2` adicionales; `comm_usage_logs` con `metadata.cost_breakdown {pstn_agent, pstn_customer, recording, tts, amd}` y `sku='voice_bridge'`.
- `agent_no_answer`/`agent_rejected`: se debita solo el leg del vendedor (`ceil(CallDuration/60)`, normalmente 1) y se libera el minuto reservado del cliente (`deduct_comm_credits` con `p_amount` negativo no existe → se hace `UPDATE comm_settings SET voice_minutes_remaining = voice_minutes_remaining + 1` vía RPC nueva `refund_comm_credits(p_org_id, p_channel, p_amount)` SECURITY DEFINER, definida en esta fase).
- Manual: sin costo de voz; el job `transcribe` debita créditos IA en F4.
- Límites: 1 bridge activo por usuario; `voice_max_concurrent_calls` compartido con F3; tooltip de costo en el menú; chip de minutos restantes en el dock.

---

## 9. Pruebas

### 9.1 Unitarias

- `mobileBridgeService.test.ts`: `buildWhisper` con/sin oportunidad y con `&`/`<` en nombres → texto escapado; `signBridgeToken` determinista, `verifyBridgeToken` rechaza longitud distinta y token de otro bridge; `applyAgentLegEvent` mapea `initiated|ringing → agent_ringing`, `in-progress → agent_answered`, `no-answer|busy|failed → agent_no_answer`, `completed` sin `agent_answered` → `agent_no_answer`, `completed` tras `customer_dialing` → sin cambio; `applyCustomerLegEvent` `initiated → customer_dialing/ringing`, `in-progress → in_progress` con `answered_at`; `applyBridgeDialComplete` para los 5 `DialCallStatus` (+ `DialBridged=false`).
- `twimlBuilders.test.ts` (+casos): snapshots de `agent-leg` (con y sin `<Gather>`), `customer-leg`, `agent-dial`; URLs con `&amp;`; `timeout` clamp.
- `mobileVerificationService.test.ts`: normalización `310 123 4567` → `+573101234567`; `maskPhone`; 429 cuando `fn_mobile_otp_allowed=false` (mock); 409 si otro usuario verificó el mismo número.
- `manualCallService.test.ts`: `sniffAudioMime` para mp3 (ID3 y frame sync), m4a (`ftyp`), ogg, wav, webm, y `.txt` renombrado → null; límite 40 MB; `calls.mode='manual'`, `duration_source='manual'`, `provider='manual'`; job `transcribe` con `channels=1`.
- `callCreditsService.test.ts` (+casos): reserva 2, liquidación con ambas patas, reembolso en `agent_no_answer`.

### 9.2 Integración (payloads reales)

1. `POST bridge/initiate` con usuario sin celular → 409 `MOBILE_NOT_VERIFIED`; con celular y Twilio mockeado → 201, `calls` (`mode='bridge'`, `bridge_mode='agent_leg'`, `from_number=callerId`, `to_number=+57300…`, `provider_call_sid=agent_leg_sid=CA_agent`), `mobile_call_bridges` (`agent_ringing`, `call_id`), `calls.create` llamado con `url` que contiene `bridgeId` y `t` y `statusCallbackEvent` de 4 eventos.
2. `POST agent-leg?bridgeId&t` firmado con form `CallSid=CA_agent&CallStatus=in-progress` → 200 XML con `<Gather numDigits="1" action="…customer-leg?bridgeId=…&amp;t=…">`; `bridges.status='agent_answered'`. Con `t` incorrecto → 403. Con `AnsweredBy=machine_start` → `<Hangup/>` y `agent_no_answer`.
3. `POST customer-leg` con `Digits=1` → XML con `<Dial callerId record="record-from-answer-dual" action="…dial-complete…"><Number statusCallback="…&amp;leg=customer" url="…consent…">`; `bridges.status='customer_dialing'`, `calls.status='ringing'`. `Digits=2` → `agent_rejected`, `calls.status='canceled'`, `<Hangup/>`.
4. `POST bridge/status?leg=customer` secuencia `initiated(0) → ringing(1) → in-progress(2)` → `customer_leg_sid` en `calls` y `bridges`, `in_progress`, `answered_at`.
5. `POST bridge/dial-complete` `DialCallStatus=completed&DialCallSid=CA_customer&DialCallDuration=185&DialBridged=true` → `calls.status='completed'`, `duration_seconds=185`, `bridges.status='completed'`, actividad creada (`channel='mobile'`), `comm_usage_logs` con 2 patas.
6. `bridge/status?leg=agent CallStatus=completed&CallDuration=230` **después** del paso 5 → sin cambios de estado; ajusta minutos del agente.
7. Orden inverso (`dial-complete` antes de `in-progress` del cliente) → terminal pegajoso; `in-progress` tardío ignorado.
8. `POST /api/voice/recording` (F3) con `CallSid=CA_agent`, `RecordingChannels=2` → `call_recordings` en la misma `calls.id`; job `transcribe` con `mode:'bridge'`.
9. `bridge/status?leg=agent CallStatus=no-answer` sin `agent_answered` → `agent_no_answer`, `calls.status='no_answer'`, reembolso 1 minuto.
10. Firma válida pero `bridgeId` de otra org con `AccountSid` de subcuenta distinta → 403; queries nunca tocan la otra org (spy en supabase mock).
11. `send-otp` ×4 en una hora → cuarto 429; `check-otp` con código correcto (mock `checkCode` `approved`) → `user_comm_preferences.mobile_verified_at` seteado con service role.
12. `calls/manual` multipart con `.m4a` de 2 MB → 201, objeto en Storage `org_7/…/{callId}.m4a`, `call_recordings.channels='1'`, job `transcribe`; con `.txt` renombrado → 415; 41 MB → 413.
13. IVR: `twiml/inbound` con `From` = celular verificado y flag activo → `<Gather input="dtmf" finishOnKey="#">`; `agent-dial` `Digits=1` → `calls` `full_bridge` y TwiML de Dial; `From` distinto en `agent-dial` → hangup.

### 9.3 E2E manual (org de prueba, número Twilio real, celular real)

1. Verificar celular por OTP en Configuración; comprobar `mobile_verified_at`.
2. Tarjeta → 📞 → Mi celular. El celular suena en ≤3 s con el número de la org; contestar; oír whisper con nombre del cliente y oportunidad; pulsar 1; oír "Conectando…"; el cliente (otro celular) recibe la llamada con el caller id de la org y el consentimiento; hablar 30 s; colgar desde el celular del cliente.
3. Dock: pasos en orden correcto con timer; al colgar, disposición; guardar.
4. BD: 1 fila `calls` (`bridge`, `agent_leg_sid` y `customer_leg_sid` distintos, `duration≈30`, `completed`), 1 `mobile_call_bridges` (`completed`, `call_id`), 1 `call_recordings` `ready` con `channels='2'`, 1 `activities` (`channel='mobile'`), `comm_usage_logs` con 2 patas, job `transcribe`.
5. Reproducir la grabación: canal izquierdo = vendedor, derecho = cliente (verifica la regla de F4).
6. Repetir sin contestar el celular → `agent_no_answer` + reembolso; repetir pulsando 2 → `agent_rejected`.
7. Cancelar desde el dock mientras suena el celular → el celular deja de sonar; `failed` con `cancel_requested_at`.
8. Capacitor (build Android debug apuntando a ngrok): repetir 2 con la app; volver a la app tras colgar y ver el diálogo de disposición.
9. Activar `voice_mobile_ivr_enabled`, marcar al número de la org desde el celular verificado, pulsar 1 → llamada al cliente de la última oportunidad; notificación de disposición al colgar.
10. Registrar llamada manual con audio `.m4a` → aparece en timeline con "Transcribiendo…".

### 9.4 Casos borde (≥10)

1. El vendedor contesta y cuelga sin pulsar nada → `Gather` expira → `<Say>` + `Hangup` → `leg=agent completed` con `agent_answered` → `agent_rejected`, `canceled`.
2. El vendedor pulsa 1 pero el cliente no contesta → `DialCallStatus=no-answer` → `failed` (bridge) / `no_answer` (call); el vendedor oye "Llamada finalizada".
3. El vendedor cuelga durante el ringback del cliente → leg cliente `canceled` → `dial-complete DialCallStatus=canceled` → `canceled`.
4. El cliente cuelga durante el consentimiento → `DialBridged=false` → `completed` 0 s, `reason='hangup_during_consent'` (F3).
5. Buzón del vendedor con AMD apagado → el buzón "contesta", el `Gather` no recibe dígitos → `agent_rejected`; con AMD → `agent_no_answer` inmediato.
6. Doble clic en "Mi celular" → segundo `initiate` → 409 `BRIDGE_IN_PROGRESS`.
7. Usuario cambia de org (multi-org) → `user_comm_preferences` es por org: sin celular verificado en la nueva org.
8. Número del cliente = celular del vendedor → 400 `SAME_NUMBER`.
9. Callback `bridge/status` duplicado (Twilio reintenta por timeout) → `SequenceNumber` igual → ignorado.
10. `dial-complete` nunca llega (webhook caído) → `calls_reconcile` cierra con `client.calls(customer_leg_sid).fetch()` (`status`, `duration`).
11. Grabación `absent` (cliente colgó al instante) → `call_recordings.failed`; actividad sin player.
12. OTP a número fijo → Verify error 60200 → 400 "Debe ser un celular".
13. Audio manual de 39,9 MB en conexión lenta → progreso; timeout del cliente 120 s; el servidor valida tamaño por `Content-Length` antes de leer el cuerpo.
14. IVR: dos vendedores intentan verificar el mismo celular en la misma org → `uq_ucp_org_verified_mobile` → 409.

---

## 10. Definition of Done y métricas

- [ ] Migraciones 3.1 aplicadas vía MCP; consultas 3.3 devuelven lo esperado; cero `.sql` en el repo.
- [ ] `bridge/initiate` rechaza `agent_phone` en el body (ignorado) y responde 409 sin celular verificado; con celular, crea `calls` + `mobile_call_bridges` enlazados y llama a Twilio con las URLs de 4.5.1 (test).
- [ ] `agent-leg`/`customer-leg` producen el TwiML de 4.5.1/4.5.2 (snapshots) con `&amp;`, `callerId`, `record="record-from-answer-dual"`, `recordingStatusCallbackEvent="completed absent"`, `<Number statusCallback url>`.
- [ ] Todas las rutas de bridge exigen firma Twilio **y** token HMAC; 403 en tests con cualquiera de los dos inválidos; ninguna query sin `organization_id`.
- [ ] Máquina de estados de `mobile_call_bridges` y `calls` cubierta al 100 % por tests unitarios; `bridge/status` nunca escribe valores fuera del CHECK.
- [ ] `duration_seconds = DialCallDuration`; una sola fila `calls` por bridge; grabación dual asociada a esa fila; job `transcribe` encolado; actividad con `channel='mobile'`.
- [ ] `MobileBridgeStatus` muestra los 5 pasos por Realtime en web y en la app Capacitor; cancelar funciona antes de `in_progress`.
- [ ] OTP: verificación completa desde la UI, rate limit 3 envíos/hora, número enmascarado, `twilio/verify/*` no invocados desde el browser.
- [ ] `ManualCallDialog` + `calls/manual` crean llamada, suben audio y encolan transcripción; límites 413/415 verificados.
- [ ] Créditos: reserva 2 min, liquidación de 2 patas, reembolso en `agent_no_answer`; `comm_usage_logs` con `cost_breakdown`.
- [ ] Variante IVR desactivada por defecto; con flag, E2E 9.3.9 pasa.
- [ ] `ActivityActions` sin modo `tel:` ni upload a `/api/crm/transcribe`; `/api/crm/transcribe` eliminado o marcado deprecado hasta F4.
- [ ] `npm run lint`, `tsc --noEmit`, `npm test` limpios; PRs ≤400 líneas.

**Métricas (30 días, org piloto):** ≥90 % de bridges iniciados terminan en `completed|agent_no_answer|agent_rejected|failed` con causa (0 zombies); tiempo `initiate → agent_ringing` p50 ≤3 s; ≥95 % de bridges completados con grabación `ready`; ≥60 % de vendedores móviles con celular verificado en la primera semana; 0 incidentes de caller id con número no verificado.

---

## 11. Riesgos y decisiones

| Decisión / riesgo | Por qué |
|---|---|
| Celular del vendedor solo desde `user_comm_preferences` verificado | Evita que cualquier usuario haga que la org llame a números arbitrarios con su caller id (fraude/toll) y cumple "nunca del body". |
| Una fila `calls` por bridge (padre = leg del vendedor) | La grabación de `<Dial>` cuelga del `CallSid` padre; el recording callback de F3 la asocia sin lógica extra; una actividad por conversación. |
| `bridge_mode='agent_leg'` para ruta A y `'full_bridge'` para IVR | Reutiliza el CHECK existente; `customer_leg` queda para futuras llamadas iniciadas por el cliente. |
| HMAC `t` además de la firma Twilio | La firma protege el transporte; el token liga la URL a un bridge concreto y evita que una URL filtrada de otro bridge se reutilice contra este. |
| Estado final desde `<Dial action>` y no desde `statusCallback` | `DialCallDuration` = tiempo conversado; los `statusCallback` del leg cliente son intermedios. Igual que F3. |
| Reembolso vía RPC nueva `refund_comm_credits` | `deduct_comm_credits` no acepta negativos; sin reembolso el vendedor pagaría 2 minutos por un intento fallido. |
| Ruta A antes que ruta B | Funciona hoy en todas las plataformas sin certificados VoIP ni revisión de tienda; ruta B se justifica solo si el volumen móvil hace relevante el ahorro (~$0.035/min) o se exige llamada in-app. |
| IVR opcional y apagado | El caller id se puede falsificar; sin STIR/SHAKEN en CO, el riesgo residual es aceptable solo si la org lo activa conscientemente; mitigado por número verificado único y whisper con nombre. |
| No se intenta capturar llamadas nativas | Android bloquea `READ_CALL_LOG`/`VOICE_CALL` fuera del dialer por defecto; iOS no expone número ni audio. Se conserva la conclusión de la V3 y se elimina el "Modo D" (estimación por background) por su baja fiabilidad. |
| Riesgo: retraso del whisper + Gather (≈10 s) antes de que suene el cliente | Aceptado: es el precio de la confirmación; `voice_bridge_confirm_digit=false` lo reduce a ≈4 s para orgs que lo prefieran. |
| Riesgo: el vendedor confunde la llamada con spam | Caller id de la org + instrucción en la UI de guardar el número como contacto "GoAdmin CRM"; whisper inmediato al contestar. |

---

## 12. Archivos tocados y orden de PRs

> **Real tras la ronda 1 (2026-09-10).** Lo que sigue en "Planificado y no hecho" está detallado en §13.

**Creados en la ronda 1**
- `src/lib/services/crm/bridgeState.ts` (215 L) — tipos, `BridgeError`, `normalizeE164`, `maskPhone`, `buildWhisper` y la máquina de estados pura (`applyAgentLegEvent`, `applyCustomerLegEvent`, `customerLegNeverDialed`).
- `src/lib/services/crm/bridgeTokens.ts` (55 L) — `signBridgeToken` / `verifyBridgeToken` / `isBridgeSigningConfigured` sobre `VOICE_CALLBACK_SECRET`.
- `src/lib/services/crm/bridgeTwimlBuilders.ts` (169 L) — `buildAgentLegTwiml`, `buildCustomerLegTwiml`, `buildAgentDialGatherTwiml`, `buildBridgeHangupTwiml`.
- `src/app/api/voice/bridge/[id]/route.ts` (50 L, GET) y `src/app/api/voice/bridge/[id]/cancel/route.ts` (44 L, POST).

**Modificados en la ronda 1**
- `src/lib/services/crm/mobileBridgeService.ts` (reescrito, 529 L), `callCreditsService.ts` (+`legs` en `computeSettlement`, +`refundVoiceMinutes`, +`defaultLegsForMode`).
- `src/app/api/voice/bridge/initiate/route.ts`, `bridge/status/route.ts`, `twiml/agent-leg/route.ts`, `twiml/customer-leg/route.ts` (los cuatro reescritos).
- `src/components/crm/shared/MobileCallDialog.tsx` (reescrito, 265 L), `src/components/crm/shared/realtimeTables.ts` (+`mobile_call_bridges`).
- `src/lib/services/crm/__tests__/f5Adversarial.test.ts` (66 casos convertidos + 11 nuevos = 77), `__tests__/callCreditsService.test.ts` (1 aserción: el bridge cuesta 2 patas).
- `.env.example` (+`VOICE_CALLBACK_SECRET`, con instrucciones).

**Migraciones aplicadas por MCP (cero `.sql` en el repo)**
- `crm_v4_f05_bridges_call_link`, `crm_v4_f05_mobile_verification`.

**Planificado y NO hecho en esta ronda** (ver §13.4)
- `mobileVerificationService.ts` + rutas `/api/crm/me/comm-preferences/mobile/{send-otp,check-otp,DELETE}`.
- `twiml/agent-dial` y la rama IVR de `twiml/inbound` (§2.3, apagada por defecto).
- `MobileBridgeStatus.tsx`, `useBridgeRealtime.ts`, `ManualCallDialog.tsx`, `CallModeMenu`, `MyMobileSection`, iconos de `CallsTable`.
- Eliminar `/api/crm/transcribe` y el modo `tel:` de `ActivityActions.tsx`.
- `manualCallService` + `/api/crm/calls/manual`: **ya existen** (los construyó F4).

**Orden de PRs (≤400 líneas cada uno):**
1. **PR-F5-01 BD + servicio de bridge** ✅ hecho: migraciones, `bridgeState`/`bridgeTokens`/`bridgeTwimlBuilders`, `mobileBridgeService` reescrito, créditos de 2 patas con reembolso.
2. **PR-F5-02 Rutas de bridge** ✅ hecho: `initiate`, `agent-leg`, `customer-leg`, `bridge/status`, `[id]`, `[id]/cancel` (el `action` del `<Dial>` reutiliza `/api/voice/dial-complete` de F3 en vez de crear `bridge/dial-complete`).
3. **PR-F5-03 Verificación de celular + manual** ⏳ pendiente (el OTP funciona hoy por `/api/integrations/twilio/verify/*`).
4. **PR-F5-04 UI en vivo + Capacitor** 🟡 parcial: `MobileCallDialog` con Realtime y cancelar; falta el dock y el resto de componentes.
5. **PR-F5-05 (opcional) IVR sin app** ⏳ pendiente (flag `voice_mobile_ivr_enabled` ya existe, apagado).

---

## 13. Registro de implementación — ronda 1 (2026-09-10)

Constructor: agente F5. Punto de partida: `scratchpad/reports/TEST-F5-r1.md` (**2,5/10**, "la fase nunca se construyó"). Se siguió el orden de trabajo del tester (1 bloqueantes → 9 leves).

### 13.1 Base de datos (MCP `apply_migration`, cero `.sql` en el repo)

| Migración | Contenido | Verificación §3.3 |
|---|---|---|
| `crm_v4_f05_bridges_call_link` | `mobile_call_bridges` + `call_id` (FK a `calls`, ON DELETE SET NULL), `cancel_requested_at`, `last_error`; índices `idx_bridges_call`, `idx_bridges_agent_leg`, `idx_bridges_org_active`; **`mcb_update` por dueño** (`user_id = auth.uid()`); `fn_touch_updated_at()` (con `SET search_path` y `REVOKE … FROM PUBLIC, anon`) + trigger `trg_mcb_touch`; `comm_settings` + `voice_mobile_ivr_enabled`, `voice_bridge_confirm_digit`, `voice_bridge_agent_timeout` (CHECK 10–60); `ALTER PUBLICATION supabase_realtime ADD TABLE mobile_call_bridges` | 3 columnas ✔ · 3 columnas ✔ · trigger 1 ✔ · publicación 1 ✔ · `mcb_update` contiene `user_id = auth.uid()` ✔ |
| `crm_v4_f05_mobile_verification` | Tabla `mobile_verification_attempts` (RLS activa y **sin políticas**: solo service role, + `REVOKE` a `anon`/`authenticated`); `idx_mva_user_recent`; `fn_mobile_otp_allowed(uuid,text)` SECURITY DEFINER con `search_path`, guarda de pertenencia (`auth.uid()` solo consulta lo suyo) y `REVOKE … FROM PUBLIC, anon`; índice único `uq_ucp_org_verified_mobile` | tabla ✔ · función ✔ (`select fn_mobile_otp_allowed(…, 'send')` → true) · 0 políticas ✔ · índice ✔ |
| `crm_v4_f05_otp_fn_service_role_only` | `REVOKE` de `fn_mobile_otp_allowed` también a `authenticated`: solo `service_role` la ejecuta. Cierra el aviso del linter de Supabase ("SECURITY DEFINER ejecutable por `authenticated` vía `/rest/v1/rpc`"); la guarda de pertenencia se queda como segunda barrera, no como única | `role_routine_grants` → solo `postgres` y `service_role` ✔ |

**Aviso del linter que queda a propósito:** `mobile_verification_attempts` aparece como "RLS activa sin políticas". Es lo que pide §3.1: la tabla guarda intentos de OTP (PII) y solo la toca el service role. Se anota aquí para que no se confunda con las cinco tablas de facturación/marketplace que el tester encontró en el mismo estado sin querer.

**Desviación respecto al doc:** §8 pedía una RPC nueva `refund_comm_credits`. No hace falta: `deduct_comm_credits` (verificada en `pg_proc` el 2026-09-10) **ya acepta importes negativos** y acota el abono al cupo del plan. El reembolso se hace con `p_amount` negativo desde `callCreditsService.refundVoiceMinutes`.

### 13.2 Los cuatro bloqueantes del informe

1. **B1 — el `INSERT` en `calls` fallaba siempre y nadie miraba el error.** El payload ya no usa `phone_number` (columna inexistente) y trae los NOT NULL reales (`mode='bridge'`, `from_number`, `to_number`, `provider`, `started_at`, `direction`). El `{error}` se comprueba: si falla, `initiateBridge` lanza `CALL_INSERT_FAILED`, **no llama a Twilio** y devuelve los 2 minutos reservados. La fila `calls` se crea ANTES de marcar, así que `provider_call_sid = agent_leg_sid` permite que `/api/voice/recording` (F3) resuelva la grabación, que F4 transcriba y que `dial-complete` cree la actividad en la oportunidad.
2. **B2 — el número del vendedor venía del body.** `initiateBridge(ctx, input)` lo lee de `user_comm_preferences.mobile_phone_e164` exigiendo `mobile_verified_at` y `organization_id`; sin él, 409 `MOBILE_NOT_VERIFIED`. El body pasa por zod y solo lleva el número del cliente (`to`), validado con `normalizeE164` (E.164 estricto: `"abc"`/`"900609"` → 400). Además: 409 `BRIDGE_IN_PROGRESS` (un bridge activo por vendedor), 400 `SAME_NUMBER` y 409 `CALLER_ID_NOT_CONFIGURED` si el caller id sería el número global de la plataforma. La UI ya no tiene campo editable.
3. **B3 — el aviso de grabación lo oía el vendedor.** El `<Number>` lleva `url="…/api/voice/twiml/consent-whisper?callId=…"`: el aviso lo oye **el cliente** al contestar y entra en la grabación dual. `initiateBridge` escribe `call_consents` (`consent_type='recording'`, `locale='es-MX'`, `recorded_announcement_text = comm_settings.voice_consent_message`) y la ruta de F3 marca `calls.consent_given`. La grabación ahora respeta `voice_recording_enabled` (antes era incondicional por accidente).
4. **B4 — la máquina de estados era inalcanzable.** `statusCallback`/`statusCallbackEvent` viven en el `<Number>` (TwiML los ignora en `<Dial>`) y el `<Dial>` lleva `action="…/api/voice/dial-complete?callId=…"`. Con eso, `DialCallDuration` fija la duración conversada, `settleVoiceCall` liquida y `upsertCallActivity` crea la actividad: trabajo de F3 que ya estaba hecho. El `CallDuration` del leg del vendedor (timbre + whisper) va a `metadata.agent_call_duration`, no a `duration_seconds`.

### 13.3 Altos, medios y leves

- **A1** `accountSidMatchesOrg` en las tres rutas del bridge (`agent-leg:67`, `customer-leg:70`, `bridge/status:107`), como en las cinco de F3. Además `verifyBridgeToken` (HMAC `t=`) en las tres.
- **A2** `cancelBridge(id, orgId, userId, isAdmin, client)`: compara el dueño, consulta el estado real de cada pata antes de elegir el verbo, **propaga el error del proveedor** (502) sin marcar el bridge como terminado, deja `cancel_requested_at` + `last_error` y reembolsa. Ruta `POST /api/voice/bridge/[id]/cancel` (+ `GET /api/voice/bridge/[id]` como respaldo de Realtime).
- **A3** Token HMAC en todas las URLs, `SequenceNumber` por leg y terminales pegajosos (`callStateMachine` de F3); un `bridgeId` ausente devuelve 400 y una excepción 500 (Twilio reintenta).
- **A4** Créditos: reserva de 2 minutos **antes** del proveedor (D6), `computeSettlement` cobra las **dos** patas PSTN del bridge (`legs`, por defecto 2 en `mode='bridge'`) y `refundVoiceMinutes` devuelve el minuto del cliente en `agent_no_answer`, `agent_rejected`, cancelación y fallo de Twilio.
- **M1/M2** UI: Realtime sobre `mobile_call_bridges` (ya publicada) con respaldo HTTP cada 4 s solo mientras el canal no está suscrito; celular verificado y filtrado por organización, sin caída a `profiles.phone`; botón "Cancelar llamada" hasta `in_progress`.
- **M3** `customer_id`/`opportunity_id` se validan con `filterOrgOwnedRefs` (F3): los ajenos entran como `null` y quedan anotados en `calls.metadata.rejected_refs`.
- **M4** Todo el TwiML sale de `bridgeTwimlBuilders` con `es-MX` + `Polly.Mia-Neural` (`es-CO` no existe en Twilio) y `recordingStatusCallbackEvent="completed absent"`.
- **M5** El caller id sale de `pickCallerId` (F3); `source='platform'` se rechaza con 409.
- **L1** `<Gather>` con "1 conectar / 2 cancelar" y `timeout="8"`; rama AMD (`AnsweredBy=machine_*` → colgar + `agent_no_answer`); `agent_answered` no se escribe sobre un estado terminal; un segundo POST con `Digits=1` devuelve el mismo TwiML sin reescribir el estado; `whisper_text` acotado a 200 caracteres.

### 13.4 Pendiente (no entra en esta ronda)

1. Rutas propias de OTP (`/api/crm/me/comm-preferences/mobile/*`) y `mobileVerificationService` con `fn_mobile_otp_allowed` + `mobile_verification_attempts` (la función y la tabla **ya están** en la base; hoy el OTP funciona por `/api/integrations/twilio/verify/*`, autenticado).
2. Variante IVR §2.3 (`twiml/agent-dial` + rama en `twiml/inbound`); `voice_mobile_ivr_enabled` existe y está apagado.
3. UI restante: `MobileBridgeStatus` en el `SoftphoneDock`, `useBridgeRealtime`, `CallModeMenu`, `MyMobileSection`, `ManualCallDialog`, iconos por modo en `CallsTable`.
4. Eliminar `/api/crm/transcribe` y el modo `tel:` de `ActivityActions.tsx` (hay que comprobar importadores; `calls/manual` de F4 ya lo sustituye funcionalmente).
5. Job `calls_reconcile` para bridges zombis > 2 h y `bridge_disposition_reminder`.
6. `VOICE_CALLBACK_SECRET` **no está en el entorno**: hasta que el dueño lo defina (ya documentado en `.env.example`), `initiate` responde 503 `VOICE_CALLBACK_SECRET_MISSING` y los callbacks 403. Es fail-closed a propósito: sin secreto no se puede verificar quién llama al webhook.

### 13.5 Pruebas

- `npx jest src/lib/services/crm/__tests__/f5Adversarial.test.ts` → **77/77 verdes** (los 66 casos del tester, con su escenario y sus datos, convertidos a la aserción correcta + 11 nuevos: `F5-04b/04c`, `F5-07b`, `F5-13b`, `F5-14b`, `F5-20b`, `F5-30b`, `F5-67..F5-70`).
- **Mordida comprobada:** 9 mutaciones sobre el código de producción (statusCallback al `<Dial>`, quitar `action`, quitar `url=consent-whisper`, devolver `phone_number` al INSERT, teléfono del vendedor desde el input, quitar `accountSidMatchesOrg`, mandar `agent_phone` desde la UI, reserva de créditos después del proveedor) → **9 de 9 en rojo**, todas revertidas con md5 idéntico.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → **0 errores en archivos de F5**.
- Prohibido marcar números reales: todo con dobles en memoria (`jest.mock` de Twilio) y con el doble de Postgres que valida columnas, NOT NULL y CHECK reales.
