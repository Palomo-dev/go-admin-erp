# FASE 03 — Telefonía en el CRM: softphone multiplataforma y grabación

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0 (registry, `getServerOrgContext`, `@twilio/voice-sdk` instalado)
> Bloquea: F4 (transcripción necesita grabación), F5 (móvil necesita infra de voz), F6 (agente IA necesita voz)

---

## 0. Objetivo y alcance

**Qué resuelve:** el vendedor pulsa "Llamar" en el CRM y habla desde el navegador (Web/PWA/Electron). Twilio graba, devuelve duración/números/estado, y el CRM persiste todo en una tabla `calls` de primera clase. Funciona en las 4 plataformas.

**Qué NO entra:** transcripción y análisis IA (F4), llamadas desde celular personal vía bridge (F5), agente IA de voz (F6).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `twilio@5.12.1` (SDK servidor) | ✅ | `package.json` |
| `@twilio/voice-sdk` (browser) | ❌ (F0 lo instala) | `package.json` |
| `twilioService.ts` | ✅ envía SMS/WhatsApp | `src/lib/services/integrations/twilio/twilioService.ts` |
| `twilioConfig.ts` | ✅ config de subcuentas | `src/lib/services/integrations/twilio/twilioConfig.ts` |
| `twilioSubaccounts.ts` | ✅ | `src/lib/services/integrations/twilio/twilioSubaccounts.ts` |
| `twilioWebhook.ts` | ✅ validación de firma | `src/lib/services/integrations/twilio/twilioWebhook.ts` |
| `/api/integrations/twilio/voice/incoming` | ✅ existe (entrante básico) | `src/app/api/integrations/twilio/voice/incoming/route.ts` |
| `/api/integrations/twilio/status-callback` | ✅ existe | `src/app/api/integrations/twilio/status-callback/route.ts` |
| `callService.ts` | 🔴 bugs G1/G2 (F0 corrige) | `src/lib/services/callService.ts:8,262,270,292` |
| `comm_settings` con `voice_agent_enabled` | ✅ | BD |
| `commCreditsService.ts` | ✅ | `src/lib/services/commCreditsService.ts` |
| `ws-server.ts` | ✅ (para F6) | raíz |
| Llamada saliente (`client.calls.create`) | ❌ | — |
| `/api/voice/token` | ❌ | — |
| TwiML app de outbound | ❌ | — |
| `RecordingStatusCallback` | ❌ | — |
| Tabla `calls` | ❌ (vive en `activities.metadata`) | — |
| Softphone UI | ❌ | — |
| `/app/crm/llamadas` | ❌ | — |

---

## 2. Arquitectura

```
┌─ Cliente (Web/PWA/Electron) ──────────────────────────────┐
│  SoftphoneProvider → Device (@twilio/voice-sdk)            │
│  Device.connect({ params: { customerId, opportunityId } }) │
└──────────────────────────┬─────────────────────────────────┘
                           │ 1. POST /api/voice/token
                           │    → AccessToken + VoiceGrant
                           ▼
┌─ Backend ──────────────────────────────────────────────────┐
│  2. Device → Twilio (con TwiML App SID)                    │
│  3. Twilio → POST /api/voice/twiml/outbound                │
│     → INSERT calls (status='dialing')                      │
│     → <Say> aviso grabación + <Dial record="dual">         │
│  4. Twilio conecta al cliente                              │
│  5. StatusCallback → POST /api/voice/status                │
│     → UPDATE calls (status, duration, answered_at)         │
│     → INSERT comm_usage_logs                               │
│     → INSERT activities (activity_type='call')             │
│  6. RecordingStatusCallback → POST /api/voice/recording    │
│     → Descarga audio → Supabase Storage                    │
│     → INSERT call_recordings                               │
│     → Encola transcripción (F4)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Base de datos

### 3.1 Migraciones

#### Migración 1 — `calls`

```sql
CREATE TABLE calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio',
  provider_call_sid text,
  parent_call_sid text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  mode text NOT NULL CHECK (mode IN ('browser','bridge','ai_agent','manual','inbound')),
  from_number text NOT NULL,
  to_number text NOT NULL,
  customer_id integer,
  opportunity_id uuid,
  user_id uuid,
  voice_agent_id bigint,
  status text NOT NULL DEFAULT 'dialing' CHECK (status IN (
    'dialing','ringing','in_progress','completed','failed','busy','no_answer','canceled','voicemail'
  )),
  answered_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  ring_seconds integer,
  recording_enabled boolean NOT NULL DEFAULT true,
  consent_given boolean NOT NULL DEFAULT false,
  cost_amount numeric(10,4),
  cost_currency text NOT NULL DEFAULT 'USD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_calls_provider_sid ON calls (organization_id, provider_call_sid)
  WHERE provider_call_sid IS NOT NULL;
CREATE INDEX idx_calls_org_started ON calls (organization_id, started_at DESC);
CREATE INDEX idx_calls_org_customer ON calls (organization_id, customer_id);
CREATE INDEX idx_calls_org_opp ON calls (organization_id, opportunity_id);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY calls_select ON calls FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY calls_insert ON calls FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY calls_update ON calls FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY calls_delete ON calls FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — `call_recordings`, `call_consents`, `phone_numbers`

```sql
CREATE TABLE call_recordings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id bigint NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  provider_recording_sid text,
  channels text NOT NULL DEFAULT 'dual',
  duration_seconds integer,
  storage_path text NOT NULL,
  storage_provider text NOT NULL DEFAULT 'supabase',
  size_bytes bigint,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed','deleted')),
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recordings_org_call ON call_recordings (organization_id, call_id);
CREATE UNIQUE INDEX idx_recordings_sid ON call_recordings (provider_recording_sid)
  WHERE provider_recording_sid IS NOT NULL;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY rec_select ON call_recordings FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY rec_insert ON call_recordings FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY rec_update ON call_recordings FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY rec_delete ON call_recordings FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE call_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id bigint NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  announced_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'voice_announcement',
  locale text NOT NULL DEFAULT 'es-CO',
  recorded_announcement_text text
);

CREATE INDEX idx_consents_org_call ON call_consents (organization_id, call_id);
ALTER TABLE call_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY cons_select ON call_consents FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY cons_insert ON call_consents FOR INSERT WITH CHECK (organization_id = current_org_id());

CREATE TABLE phone_numbers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  provider text NOT NULL DEFAULT 'twilio',
  provider_sid text,
  capabilities jsonb NOT NULL DEFAULT '{"voice":true,"sms":true,"whatsapp":false}'::jsonb,
  assigned_user_id uuid,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, e164)
);

CREATE INDEX idx_phone_numbers_org ON phone_numbers (organization_id, is_active);
CREATE INDEX idx_phone_numbers_e164 ON phone_numbers (e164);
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY pn_select ON phone_numbers FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY pn_insert ON phone_numbers FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY pn_update ON phone_numbers FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY pn_delete ON phone_numbers FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 3 — Columnas en `comm_settings`

```sql
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS voice_twiml_app_sid text,
  ADD COLUMN IF NOT EXISTS voice_recording_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_recording_retention_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS voice_consent_message text NOT NULL DEFAULT 'Esta llamada será grabada para fines de calidad y servicio.',
  ADD COLUMN IF NOT EXISTS voice_caller_id text,
  ADD COLUMN IF NOT EXISTS voice_ring_timeout_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS voice_max_concurrent_calls integer NOT NULL DEFAULT 5;
```

### 3.2 Máquina de estados de `calls.status`

| Estado | Transición válida desde | Mapeo desde `CallStatus` de Twilio |
|---|---|---|
| `dialing` | (initial) | `queued` |
| `ringing` | `dialing` | `ringing` |
| `in_progress` | `dialing`, `ringing` | `in-progress` |
| `completed` | `dialing`, `ringing`, `in_progress` | `completed` |
| `failed` | `dialing`, `ringing` | `failed` |
| `busy` | `ringing` | `busy` |
| `no_answer` | `ringing` | `no-answer` |
| `canceled` | `dialing`, `ringing` | `canceled` |
| `voicemail` | `in_progress` | (detectado por `AnsweredBy: 'machine'`) |

### 3.3 Storage

- **Bucket:** `crm-call-recordings` (privado, no público).
- **Path:** `org_{organization_id}/{yyyy}/{mm}/{callSid}.mp3`
- **Políticas:** RLS — solo usuarios de la organización pueden leer.
- **Retención:** job cron que elimina grabaciones con `retention_until < now()` y actualiza `status='deleted'`.

### 3.4 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('calls','call_recordings','call_consents','phone_numbers');
-- Esperado: 4 filas, todas true

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'comm_settings' AND column_name LIKE 'voice_%';
-- Esperado: 7 filas
```

---

## 4. Backend

### 4.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/voice/token` | `src/app/api/voice/token/route.ts` | crear | POST | AccessToken + VoiceGrant |
| `/api/voice/twiml/outbound` | `src/app/api/voice/twiml/outbound/route.ts` | crear | POST | TwiML de salida con grabación |
| `/api/voice/twiml/inbound` | `src/app/api/voice/twiml/inbound/route.ts` | crear | POST | TwiML de entrada |
| `/api/voice/call` | `src/app/api/voice/call/route.ts` | crear | POST | Iniciar llamada server-side |
| `/api/voice/call/[id]` | `src/app/api/voice/call/[id]/route.ts` | crear | GET, PATCH | Estado, mute, hold, transferir, colgar |
| `/api/voice/status` | `src/app/api/voice/status/route.ts` | crear | POST | StatusCallback de Twilio |
| `/api/voice/recording` | `src/app/api/voice/recording/route.ts` | crear | POST | RecordingStatusCallback |
| `/api/voice/recording/[id]/stream` | `src/app/api/voice/recording/[id]/stream/route.ts` | crear | GET | Proxy firmado del audio |
| `/api/crm/calls` | `src/app/api/crm/calls/route.ts` | crear | GET | Historial con filtros |
| `/api/crm/calls/[id]` | `src/app/api/crm/calls/[id]/route.ts` | crear | GET | Detalle de llamada |

### 4.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/voice/voiceService.ts` | **crear** | Orquestador de voz |
| `src/lib/services/voice/twilioVoiceProvider.ts` | **crear** | Adaptador que implementa `VoiceProvider` |
| `src/lib/services/voice/callRepository.ts` | **crear** | CRUD de `calls` |
| `src/lib/services/voice/recordingStorageService.ts` | **crear** | Subir/descargar grabaciones |
| `src/lib/services/voice/callConsentService.ts` | **crear** | Registrar consentimientos |
| `src/lib/services/callService.ts` | modificar | F0 lo arregla; F3 lo migra a `calls` |

#### Interfaz `VoiceProvider`

```typescript
// src/lib/services/voice/types.ts
export interface VoiceProvider {
  generateToken(params: { identity: string; twimlAppSid: string }): string;
  createOutboundCall(params: {
    to: string; from: string; url: string;
    record: boolean; statusCallback: string;
  }): Promise<{ callSid: string }>;
  updateCall(callSid: string, params: { status?: 'completed'; muted?: boolean }): Promise<void>;
  validateWebhookSignature(params: { url: string; body: string; signature: string; authToken: string }): boolean;
  downloadRecording(recordingUrl: string, authToken: string): Promise<Buffer>;
}

export interface VoiceCallParams {
  organizationId: number;
  userId: string;
  toNumber: string;
  fromNumber: string;
  customerId?: number;
  opportunityId?: string;
  mode: 'browser' | 'bridge' | 'manual';
  recordingEnabled: boolean;
}
```

### 4.3 TwiML generado

#### Outbound (browser)

```xml
<!-- /api/voice/twiml/outbound -->
<Response>
  <Say voice="Polly.Lupepe" language="es-CO">
    Esta llamada será grabada para fines de calidad y servicio.
  </Say>
  <Dial
    record="record-from-answer-dual"
    recordingStatusCallback="/api/voice/recording"
    recordingStatusCallbackEvent="completed"
    statusCallback="/api/voice/status"
    statusCallbackEvent="ringing,answered,completed"
    answerOnBridge="true"
  >
    <Number>{{to_number}}</Number>
  </Dial>
</Response>
```

#### Inbound a agente humano

```xml
<!-- /api/voice/twiml/inbound -->
<Response>
  <Say voice="Polly.Lupepe" language="es-CO">
    Gracias por llamar. Esta llamada será grabada.
  </Say>
  <Dial
    record="record-from-answer-dual"
    recordingStatusCallback="/api/voice/recording"
    statusCallback="/api/voice/status"
    answerOnBridge="true"
  >
    <Client>{{agent_identity}}</Client>
  </Dial>
</Response>
```

#### Inbound a cola (si no hay agente disponible)

```xml
<Response>
  <Enqueue waitUrl="/api/voice/twiml/queue-wait">support_{{org_id}}</Enqueue>
</Response>
```

### 4.4 Validación de firma de Twilio en subcuentas

```typescript
// twilioWebhook.ts ya tiene validación — reutilizar.
// Trampa a evitar: cada subcuenta tiene su propio authToken.
// El webhook debe resolver la subcuenta desde el número destino (phone_numbers)
// y usar el authToken de ESA subcuenta, no el de la cuenta principal.

import twilio from 'twilio';

export function validateTwilioSignature(
  url: string,
  body: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  return twilio.validateRequest(authToken, signature, url, body);
}

// En el handler:
const phoneNumber = body.To; // o body.From para inbound
const { data: phoneRecord } = await supabase
  .from('phone_numbers')
  .select('organization_id, provider_sid')
  .eq('e164', phoneNumber)
  .single();
// Resolver el authToken de la subcuenta de phoneRecord.organization_id
// NO usar el authToken global
```

### 4.5 Refactor de `callService.ts`

F0 elimina los bugs (service-role, `organizationId: 1`, `user_profiles`). F3 lo migra:

- `callService.logCallActivity()` → escribe en `calls` (no solo en `activities.metadata`).
- Crea una `activity` vinculada con `related_type='call'`, `related_id=call.id`.
- `activityService` actualiza `opportunities.last_contact_at` (hook de F2).

### 4.6 Variables de entorno

| Variable | Requerida | Para qué |
|---|---|---|
| `TWILIO_API_KEY` | sí | AccessToken (no el auth token) |
| `TWILIO_API_SECRET` | sí | AccessToken |
| `TWILIO_TWIML_APP_SID` | sí | TwiML App de Voice |
| `TWILIO_ACCOUNT_SID` | sí | Subcuenta |
| `TWILIO_AUTH_TOKEN` | sí | Webhook signature |
| `TWILIO_PHONE_NUMBER` | sí | Número default |
| `TWILIO_WEBHOOK_BASE_URL` | sí | URL pública |

### 4.7 Dependencias npm

`@twilio/voice-sdk` instalado en F0.

---

## 5. UI

### 5.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/llamadas` | `src/app/app/crm/llamadas/page.tsx` | crear | Historial con filtros + player |
| `/app/crm/llamadas/[id]` | `src/app/app/crm/llamadas/[id]/page.tsx` | crear | Detalle + player + (F4) transcripción |

### 5.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/voice/SoftphoneProvider.tsx` | **crear** | `children` | Context global del `Device` |
| `src/components/voice/useSoftphone.ts` | **crear** | — | Hook de estado de llamada |
| `src/components/voice/SoftphoneDock.tsx` | **crear** | — | Barra flotante persistente |
| `src/components/voice/IncomingCallToast.tsx` | **crear** | — | Toast de llamada entrante |
| `src/components/voice/CallButton.tsx` | **crear** | `to`, `customerId?`, `opportunityId?` | Botón reutilizable |
| `src/components/voice/DialPad.tsx` | **crear** | — | Marcador manual |
| `src/components/voice/CallPlayer.tsx` | **crear** | `recordingUrl` | Player de audio con waveform |
| `src/components/voice/CallsTable.tsx` | **crear** | — | Tabla de historial con filtros |

### 5.3 Wireframes

```
┌─ SoftphoneDock (estado: in_progress) ────────────────────────┐
│  📞 Juan Pérez — Rest. El Corral                             │
│  ⏱ 02:34   [🔇 Mute] [⏸ Hold] [⌨ DTMF] [📞 Transfer] [✖ Colgar] │
│  [Notas en vivo: _____________________________]              │
└────────────────────────────────────────────────────────────────┘

┌─ IncomingCallToast ──────────────────────────────────────────┐
│  📞 Llamada entrante                                         │
│  +57 300 123 4567 → Rest. El Corral                          │
│  Oportunidades abiertas: 2                                   │
│  [Rechazar]  [Responder]                                     │
└────────────────────────────────────────────────────────────────┘

┌─ /app/crm/llamadas ──────────────────────────────────────────┐
│  [Filtros: Fecha ▼] [Dirección ▼] [Agente ▼] [Cliente ▼]    │
│                                                                │
│  Fecha       Dirección  De          A           Dur.  Grab.   │
│  2026-09-01  Saliente   +57...      +57...      4:12  ▶       │
│  2026-09-01  Entrante   +57...      +57...      1:30  ▶       │
│  2026-08-31  Saliente   +57...      +57...      —     —       │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 Animaciones Motion

```tsx
// Dock que sube desde abajo
<motion.div
  initial={{ y: 100, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 100, opacity: 0 }}
  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
>
  <SoftphoneDock ... />
</motion.div>

// Pulso del estado "timbrando"
<motion.div
  animate={{ scale: [1, 1.05, 1] }}
  transition={{ repeat: Infinity, duration: 1.5 }}
>
  📞 Timbrando...
</motion.div>

// Cronómetro con AnimateNumber (sin librería extra)
<motion.span
  key={seconds}
  initial={{ opacity: 0.5 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.1 }}
>
  {formatTime(seconds)}
</motion.span>

// Toast entrante con spring
<motion.div
  initial={{ x: 400, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
>
  <IncomingCallToast ... />
</motion.div>
```

### 5.5 Accesibilidad

- Anuncios ARIA `aria-live="assertive"` para estado de llamada ("Llamada en curso", "Llamada finalizada").
- Atajos de teclado: `Ctrl+Shift+D` colgar, `Ctrl+Shift+M` mute.
- Foco automático en el botón "Responder" del toast entrante.
- `DialPad` navegable con teclado (tab + enter).

---

## 6. Multiplataforma

| Plataforma | Estrategia | Cambios exactos |
|---|---|---|
| **Web** | `@twilio/voice-sdk` (WebRTC) | Sin cambios extra |
| **PWA** | Igual que web | `public/sw.js`: añadir `twilio` y dominios de Twilio a la lista de no-cachear (network-first). WebRTC no funciona offline — el SW no debe cachear el WebSocket de Twilio. |
| **Electron** | Igual que web + permisos | `electron/src/main/index.ts`: añadir `setPermissionRequestHandler` para `media` (micrófono) que auto-aprueba solo para el origen de la app. Notificaciones nativas para llamada entrante via `new Notification()`. |
| **Capacitor** | Plan A: plugin propio. Plan B: `@capgo/capacitor-twilio-voice`. Plan C: modo bridge de F5. | `mobile/capacitor.config.ts`: sin cambios en F3. La detección de plataforma (`Capacitor.isNativePlatform()`) decide si usar SDK o bridge. |

#### `platformCapabilities.ts`

```typescript
// src/lib/services/voice/platformCapabilities.ts
import { Capacitor } from '@capacitor/core';

export function getCallMode(): 'browser' | 'bridge' {
  if (typeof window !== 'undefined') {
    // Capacitor nativo → bridge (F5)
    if (Capacitor.isNativePlatform?.()) return 'bridge';
    // Electron → browser (WebRTC funciona)
    if (window.electron) return 'browser';
    // Web/PWA → browser
    if (navigator.mediaDevices) return 'browser';
  }
  return 'bridge'; // fallback seguro
}

export function canUseWebRTC(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
```

---

## 7. Consentimiento, compliance y retención

- `<Say>` de aviso de grabación **no desactivable** cuando `voice_recording_enabled=true`.
- Toggle por organización para desactivar grabación entera (`voice_recording_enabled=false`).
- `call_consents` registra cada aviso con timestamp, texto y locale.
- Retención configurable (`voice_recording_retention_days`); job cron purga.
- Marco legal: Colombia exige consentimiento de todas las partes (Ley 1581/2012 + Habeas Data).

---

## 8. Créditos, costos y límites

- Descontar de `comm_settings.voice_minutes_remaining`.
- Registrar en `comm_usage_logs` con `module='crm_voice'`.
- Bloquear la llamada si no hay saldo.
- Límite de llamadas concurrentes por organización (`voice_max_concurrent_calls`).

---

## 9. Multi-tenant y seguridad

- El webhook resuelve la org desde `phone_numbers.e164` o `calls.provider_call_sid`.
- Si no encuentra la org → responde 200 con TwiML vacío + log en `integration_events`. **Nunca** cae a default.
- `AccessToken` usa `identity = org{orgId}_user{userId}` — único por usuario+org.
- `VoiceGrant` con `outgoingApplicationSid` de la organización.
- Grabaciones en Storage con path `org_{id}/...` + RLS.
- `recording/[id]/stream` valida org antes de firmar la URL.

---

## 10. Pruebas

### 10.1 Unitarios

- Máquina de estados: todas las transiciones válidas pasan; inválidas fallan.
- `validateTwilioSignature` con payload real + firma correcta → true.
- `validateTwilioSignature` con firma incorrecta → false.
- `getCallMode()` detecta correctamente web/electron/capacitor.

### 10.2 Mock del webhook de Twilio

- `POST /api/voice/status` con payload real de Twilio (`CallStatus=completed`, `CallDuration=120`) → actualiza `calls`.
- `POST /api/voice/recording` con `RecordingUrl` → descarga mock + sube a Storage + crea `call_recordings`.

### 10.3 Casos borde

- Llamada sin contestar → `status='no_answer'`, `duration_seconds=0`, sin grabación.
- Buzón de voz → `status='voicemail'`, grabación existe.
- Doble callback (Twilio reenvía) → idempotente por `provider_call_sid`.
- Callback fuera de orden (recording antes que status) → ambos se procesan independientemente.
- Grabación que nunca llega → job cron marca `calls` sin `call_recordings` como `recording_failed`.
- Número de otra org → 404 en el webhook.
- Saldo agotado → 402 antes de crear la llamada.

### 10.4 E2E Puppeteer

- Navegar a una oportunidad, pulsar "Llamar", verificar que el dock aparece.
- Mock de `Device.connect()` → verificar que se crea la fila en `calls`.
- Navegar a `/app/crm/llamadas`, verificar que la llamada aparece.

---

## 11. Definition of Done

- [ ] `calls`, `call_recordings`, `call_consents`, `phone_numbers` existen con RLS.
- [ ] `comm_settings.voice_*` existe (7 columnas).
- [ ] `/api/voice/token` devuelve AccessToken válido.
- [ ] `/api/voice/twiml/outbound` devuelve TwiML con grabación dual-channel.
- [ ] `/api/voice/status` actualiza `calls` idempotentemente.
- [ ] `/api/voice/recording` descarga audio + sube a Storage + crea `call_recordings`.
- [ ] `SoftphoneDock` montado en el layout, funcional en web.
- [ ] `CallButton` insertado en `OpportunityDrawer`, `HoyView`, ficha de cliente.
- [ ] `/app/crm/llamadas` lista llamadas con filtros + player.
- [ ] `IncomingCallToast` aparece en llamada entrante.
- [ ] Consentimiento registrado en `call_consents`.
- [ ] Créditos descontados en `comm_usage_logs`.
- [ ] Funciona en web y Electron.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 12. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| WebRTC no funciona en HTTP (solo HTTPS) | La app ya sirve HTTPS en producción; en dev usar `ngrok` o `localhost` (excepción de Chrome) |
| `@twilio/voice-sdk` en SSR causa errores | Importar dinámicamente con `dynamic(() => import(...), { ssr: false })` |
| Capacitor sin SDK oficial | Plan C (bridge de F5) siempre disponible; no bloquea F3 |
| Costos de grabación dual-channel | Dual-channel es gratis en Twilio (solo cuesta el minuto de la llamada) |
| Fuga de grabaciones cross-tenant | RLS en Storage + path `org_{id}/...` + URL firmada con expiración corta |

---

## 13. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/voice/voiceService.ts` | crear | Orquestador |
| `src/lib/services/voice/twilioVoiceProvider.ts` | crear | Adaptador Twilio |
| `src/lib/services/voice/types.ts` | crear | Interfaz `VoiceProvider` |
| `src/lib/services/voice/callRepository.ts` | crear | CRUD calls |
| `src/lib/services/voice/recordingStorageService.ts` | crear | Storage |
| `src/lib/services/voice/callConsentService.ts` | crear | Consentimientos |
| `src/lib/services/voice/platformCapabilities.ts` | crear | Detección de plataforma |
| `src/lib/services/callService.ts` | modificar | Migrar a `calls` |
| `src/app/api/voice/token/route.ts` | crear | AccessToken |
| `src/app/api/voice/twiml/outbound/route.ts` | crear | TwiML salida |
| `src/app/api/voice/twiml/inbound/route.ts` | crear | TwiML entrada |
| `src/app/api/voice/call/route.ts` + `[id]` | crear | Iniciar/gestionar llamada |
| `src/app/api/voice/status/route.ts` | crear | StatusCallback |
| `src/app/api/voice/recording/route.ts` + `[id]/stream` | crear | RecordingCallback + proxy |
| `src/app/api/crm/calls/route.ts` + `[id]` | crear | Historial |
| `src/app/app/crm/llamadas/page.tsx` + `[id]` | crear | UI historial |
| `src/components/voice/SoftphoneProvider.tsx` | crear | Context global |
| `src/components/voice/useSoftphone.ts` | crear | Hook |
| `src/components/voice/SoftphoneDock.tsx` | crear | Barra flotante |
| `src/components/voice/IncomingCallToast.tsx` | crear | Toast entrante |
| `src/components/voice/CallButton.tsx` | crear | Botón reutilizable |
| `src/components/voice/DialPad.tsx` | crear | Marcador |
| `src/components/voice/CallPlayer.tsx` | crear | Player de audio |
| `src/components/voice/CallsTable.tsx` | crear | Tabla historial |
| `src/app/app/layout.tsx` | modificar | Montar `SoftphoneProvider` |
| `electron/src/main/index.ts` | modificar | `setPermissionRequestHandler` |
| `public/sw.js` | modificar | No cachear dominios de Twilio |
