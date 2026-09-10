# ANEXO B — Referencia de proveedores verificada 2026-09-08 (V4)

> Versión: **V4** (reescrito el 2026-09-08). Reemplaza al V3 del 2026-08-31.
> Fuente: documentación oficial de cada proveedor, leída por subagentes de investigación el
> 2026-09-08 y condensada en `docs-twilio-voice.md`, `docs-twilio-messaging.md`,
> `docs-elevenlabs.md`, `docs-openai.md`, `docs-gemini.md`, `docs-resend.md` y
> `docs-meta-whatsapp-calendar.md`. **Nada de este anexo proviene de memoria**: si un dato no
> estaba en esos documentos se marca `NO VERIFICADO`.
> Este anexo es la **fuente de verdad técnica** para todas las fases del plan V4. Si una fase
> contradice este anexo, gana el anexo (o se actualiza el anexo con evidencia nueva).
> Precios en USD de lista; revalidar antes de contratar. Alineado con las decisiones D1 y D8 del
> brief del orquestador.

---

## 0. Qué cambió respecto al V3 (afirmaciones desactualizadas corregidas)

| # | Afirmación del V3 | Estado 2026-09-08 | Corrección en V4 |
|---|---|---|---|
| 1 | Repo usa `OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview` | **Apagado el 2026-05-07** | Realtime GA `gpt-realtime-2.1` (solo experimental en este plan) |
| 2 | `eleven_turbo_v2_5` como modelo "equilibrio" | **Deprecado** (junto con `eleven_turbo_v2`) | `eleven_flash_v2_5` o `eleven_v3_conversational` |
| 3 | Scribe con `detect_speaker_roles` | Parámetro **no aparece** en la referencia actual | Roles por canal (grabación dual) o `speaker_id` + heurística; ver §3.5 |
| 4 | Resend "Audiences" | Migrado a **Contacts + Segments + Topics** | §6.6 |
| 5 | Cal.com header `cal-api-version: 2024-08-13` | Versión vigente para bookings **`2026-02-25`** | §8.1 |
| 6 | ConversationRelay + ElevenLabs "solo `language=en-US`" | **Falso hoy**: hay voces por defecto es-ES / es-US y formato `voiceId-model-params` | §1.8 |
| 7 | TwiML con `language="es-CO"` (V3 y `src/app/api/voice/twiml/ai-agent/route.ts`) | **`es-CO` no existe** en Twilio | Usar `es-MX` o `es-US` |
| 8 | Fallback de análisis `gpt-4o-mini` | Legacy; reemplazo oficial de la gama barata es la familia 5.6 | `gpt-5.6-luna` |
| 9 | Google Cloud STT v2 / Chirp 3 como alternativa | No está en los docs verificados | Eliminado; fallback STT = Gemini 2.5 Flash audio nativo |
| 10 | Twilio Conversational Intelligence ($0.024/min) | No verificado en esta ronda | Eliminado del path; transcripción Twilio `<Record transcribe>` solo en-US y $0.05/min: **no usar** |
| 11 | Telefonía CO "0.014–0.069 USD/min" | Verificado: móvil **$0.0377**, fijo **$0.0700** | §1.9 |
| 12 | `twilio` ^5.12.1 / `openai` ^6.15.0 / `@google/genai` ^2.20.0 (package.json) | `twilio` 6.1.0 exige Node ≥20; `openai` 7.x exige Node ≥22; `@google/genai` 3.x exigirá Node 22 | Tabla §9.4 |
| 13 | Gemini Live `gemini-live-2.5-flash-native-audio` (GA) | Docs listan `gemini-3.1-flash-live-preview` y `gemini-2.5-flash-native-audio-preview-12-2025`, ambos Preview | §5.6 |
| 14 | Sección "Motion (motion.dev)" dentro del anexo de proveedores | Fuera de alcance de este anexo | Movida al brief/D5 (no es proveedor externo) |
| 15 | Twilio Senders v1 de WhatsApp | **Deprecada el 2026-09-01** | Senders **v2** (`client.messaging.v2.channelsSenders`) |

---

## 1. Twilio Voice

### 1.1 SDK y autenticación

- Paquete **`twilio` 6.1.0** (v6 desde abril 2026; **Node ≥20**). El repo tiene `^5.12.1` → actualizar a `^6.1.0`.
- Cliente recomendado con API Key: `twilio(apiKeySid, apiSecret, { accountSid })`. Los **webhooks se firman con el Auth Token** de la (sub)cuenta, no con el API Secret.
- Subcuentas: `client.api.v2010.accounts.create({ friendlyName })` → `sid AC…`, `authToken`, `status active|suspended|closed`; máximo **1000** subcuentas; la facturación sube a la cuenta master. En el CRM: subcuenta por organización **opcional** (D1); por defecto se usa la master con `TWILIO_MASTER_*`.

### 1.2 REST `client.calls.create`

Parámetros verificados (nombres exactos del SDK Node):

| Parámetro | Valores / notas |
|---|---|
| `to`, `from` | `from` debe ser número Twilio o Verified Caller ID |
| `url` \| `twiml` (≤4000 chars) \| `applicationSid` | Uno de los tres |
| `statusCallback`, `statusCallbackMethod`, `statusCallbackEvent` | `['initiated','ringing','answered','completed']` |
| `record` (bool), `recordingChannels` | `mono` \| `dual` |
| `recordingStatusCallback`, `recordingStatusCallbackEvent` | `['in-progress','completed','absent']` |
| `recordingTrack` | `inbound` \| `outbound` \| `both` |
| `trim` | recorte de silencio |
| `machineDetection` | `Enable` \| `DetectMessageEnd` (ignorado si hay `sendDigits`) |
| `machineDetectionTimeout` | default 30 s, rango 3–59 |
| `asyncAmd`, `asyncAmdStatusCallback` | AMD asíncrono; consume 1 de los 4 forks de audio (choca con Media Streams) |
| `timeout` | default 60 s, máx 600 |
| `timeLimit` | duración máxima de la llamada |
| `callerId`, `sendDigits` | |

Precio AMD: **$0.0075/llamada**.

```ts
import twilio from 'twilio';
const client = twilio(process.env.TWILIO_API_KEY!, process.env.TWILIO_API_SECRET!, {
  accountSid: subaccountSid ?? process.env.TWILIO_MASTER_ACCOUNT_SID!,
});
const call = await client.calls.create({
  to: '+573001234567',
  from: orgCallerId,                                      // número Twilio o Verified Caller ID
  url: `${BASE}/api/voice/twiml/outbound?callId=${callId}`,
  statusCallback: `${BASE}/api/voice/status`,
  statusCallbackMethod: 'POST',
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  record: true,
  recordingChannels: 'dual',                              // D1: siempre dual
  recordingStatusCallback: `${BASE}/api/voice/recording`,
  recordingStatusCallbackEvent: ['completed', 'absent'],
  machineDetection: 'DetectMessageEnd',
  timeout: 45,
});
```

### 1.3 Status callback (POST `application/x-www-form-urlencoded`)

`CallSid`, `AccountSid`, `From`, `To`, `Caller`, `Called`, `CallStatus` (`queued|initiated|ringing|in-progress|completed|busy|failed|no-answer|canceled`), `ApiVersion`, `Direction` (`inbound|outbound-api|outbound-dial`), `ParentCallSid`, `Duration` (**minutos**), `CallDuration` (**segundos**, solo estados terminales), `SipResponseCode`, `RecordingUrl`/`RecordingSid`/`RecordingDuration` (solo `completed` con `Record`), `Timestamp`, `CallbackSource`, **`SequenceNumber`** (ordenar por él: los callbacks pueden llegar desordenados), `StirStatus`, `FromCity/State/Zip/Country`, `ToCity/…`.

`AnsweredBy`: con `Enable` → `human|machine_start|fax|unknown`; con `DetectMessageEnd` → `human|machine_end_beep|machine_end_silence|machine_end_other|fax|unknown`; más `MachineDetectionDuration`. El webhook TwiML inicial incluye `CallToken`.

Mapeo al CHECK de `calls.status` (D4): `in-progress`→`in_progress`, `no-answer`→`no_answer`, `busy`→`busy`, `canceled`→`canceled`, `failed`→`failed`, `completed`→`completed`; `AnsweredBy machine_*`→`voicemail`.

### 1.4 TwiML

**`<Dial>`** atributos: `action`, `method`, `timeout` (30), `timeLimit` (14400), `callerId`, `record` = `do-not-record | record-from-answer | record-from-ringing | record-from-answer-dual | record-from-ringing-dual`, `trim`, `recordingStatusCallback`, `recordingStatusCallbackEvent`, `recordingTrack`, `answerOnBridge`, `ringTone`. Al `action` llegan `DialCallStatus`, `DialCallSid`, `DialCallDuration`, `DialBridged`, `RecordingUrl`. `<Dial>` solo añade una pata a una llamada ya activa.

**`<Number>`** atributos: `sendDigits`, `url`, `statusCallback`, `statusCallbackEvent`, `machineDetection`, `amdStatusCallback`.

**`<Record>`**: **siempre mono**; `maxLength` 3600; `transcribe` solo en-US → no usar para llamadas de dos partes (solo buzón de voz).

**`<Say voice language loop>`**: proveedores Polly (Standard/Neural/Generative), Google (Neural2/Wavenet/Chirp3-HD), ElevenLabs (beta). Voces en español verificadas:

| `language` | Voces |
|---|---|
| `es-MX` | `Polly.Mia`, `Polly.Mia-Neural`, `Polly.Mia-Generative`, `Polly.Andres`, `Polly.Andres-Neural`, `Polly.Andres-Generative` |
| `es-US` | `Polly.Lupe(-Neural/-Generative)`, `Polly.Pedro(-Neural/-Generative)`, `Google.es-US-Neural2-A/B/C`, `Google.es-US-Chirp3-HD-{Aoede,Charon,Fenrir,Kore,Leda,Orus,Puck,Zephyr}` |
| `es-ES` | `Polly.Lucia`, `Polly.Sergio`, `Google.es-ES-Neural2-G/H`, `Google.es-ES-Chirp3-HD-*` |
| `es-CO` | **NO EXISTE** → usar `es-MX` o `es-US` |

Límites: Polly 3000 chars, Google 5000. Precio TTS en `<Say>`: Standard $0.0008/100 chars, Neural $0.0032/100 chars, Generative $0.0130/100 chars.

TwiML de salida canónico del CRM (aviso de consentimiento + grabación dual):

```xml
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">{{comm_settings.voice_consent_message}}</Say>
  <Dial callerId="+57XXXXXXXXXX" record="record-from-answer-dual" answerOnBridge="true"
        recordingStatusCallback="https://app.goadmin.io/api/voice/recording"
        recordingStatusCallbackEvent="completed absent"
        action="https://app.goadmin.io/api/voice/twiml/after-dial?callId=…">
    <Number statusCallback="https://app.goadmin.io/api/voice/status"
            statusCallbackEvent="initiated ringing answered completed">+573001234567</Number>
  </Dial>
</Response>
```

### 1.5 Grabaciones y descarga

- Recurso Recording: `sid RE…`, `status processing|completed|absent|deleted`, `channels 1|2`, `source`, `track`, `duration`, `price`.
- `recordingStatusCallback` (POST): `AccountSid`, `CallSid`, `RecordingSid`, `RecordingUrl`, `RecordingStatus` (`in-progress|completed|absent`), `RecordingDuration`, `RecordingChannels`, `RecordingStartTime`, `RecordingSource`, `RecordingTrack`.
- Descarga: `GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.mp3` (32 kbps) o `.wav`; dual → `?RequestedChannels=2` (400 si la grabación es mono). **Basic Auth obligatorio** (`API Key SID:Secret`) → siempre proxear desde backend (`/api/voice/recording/[id]/stream`), nunca exponer la URL.
- Borrado: `DELETE /Recordings/{Sid}.json` → 204 (solo `completed`); metadatos permanecen 40 días.
- Precios: grabación **$0.0025/min**, almacenamiento **$0.0005/min/mes**, transcripción Twilio $0.05/min (**no usar**).
- D1: tras `completed` descargar `.wav?RequestedChannels=2` (para diarización por canal) o `.mp3` (para reproducir), copiar a bucket privado `crm-call-recordings` en `org_{id}/{yyyy}/{mm}/{callId}.mp3`, y programar `DELETE` en Twilio según `comm_settings.voice_recording_retention_days`.

```ts
const auth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
const res = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.wav?RequestedChannels=2`,
  { headers: { Authorization: `Basic ${auth}` } },
);
if (!res.ok) throw new Error(`Twilio recording ${res.status}`);
const bytes = Buffer.from(await res.arrayBuffer());
await supabase.storage.from('crm-call-recordings').upload(storagePath, bytes, { contentType: 'audio/wav' });
```

### 1.6 Voice JavaScript SDK (`@twilio/voice-sdk` 2.18.4)

- Repo `^2.18.3` → compatible; fijar `^2.18.4`.
- Soporte: Chrome/Firefox/Safari/Edge actuales; **Electron compatible**; navegadores móviles **no sostienen la llamada en background**; WebView/PWA no listados como soportados → en Capacitor usar plugin nativo o bridge PSTN (§1.7).
- **AccessToken**: API Key `SK…` + Secret (tipo Main/Standard, **no Restricted**); `ttl ≤ 24 h`; `identity` `[A-Za-z0-9_]`; **≤10 sesiones por identity**. `VoiceGrant({ outgoingApplicationSid, incomingAllow, pushCredentialSid })`.

```ts
import twilio from 'twilio';
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

export function buildVoiceToken(identity: string, twimlAppSid: string) {
  const token = new AccessToken(
    process.env.TWILIO_MASTER_ACCOUNT_SID!, process.env.TWILIO_API_KEY!, process.env.TWILIO_API_SECRET!,
    { identity, ttl: 3600 },
  );
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: true }));
  return token.toJwt();
}
// identity sugerida: `org${orgId}_u${userId}` (solo [A-Za-z0-9_])
```

- **TwiML App**: su `VoiceUrl` recibe POST con `From=client:{identity}`, `To` y los params custom de `device.connect({ params })`; responder `<Dial callerId="+57…" record="record-from-answer-dual" recordingStatusCallback="…"><Number statusCallback="…">…</Number></Dial>`. Entrantes al navegador: `<Dial><Client>{identity}</Client></Dial>`.
- **Device** opciones: `edge` (usar `roaming`), `codecPreferences ['pcmu','opus']`, `logLevel`, `closeProtection`, `allowIncomingWhileBusy`, `tokenRefreshMs` (10000), `appName/appVersion`. Métodos: `register()`, `connect({ params })`, `disconnectAll()`, `updateToken()`, `destroy()`. Eventos: `registered`, `unregistered`, `incoming(call)`, `error`, `tokenWillExpire`, `destroyed`. Audio: `device.audio.setInputDevice`, `device.audio.speakerDevices.set`, `device.audio.speakerDevices.test`.
- **Call**: `accept`, `reject`, `ignore`, `disconnect`, `mute`, `sendDigits`, `status()` → `pending|connecting|ringing|open|closed|reconnecting`, `call.parameters {CallSid, From, To}`, `call.customParameters`. Eventos: `accept`, `cancel`, `disconnect`, `error`, `mute`, `reconnecting`, `reconnected`, `reject`, `ringing`, `volume`, `warning`, `warning-cleared`.
- Buenas prácticas: `getUserMedia` **antes** de crear el `Device`; `unsetInputDevice` al colgar; refrescar token en `tokenWillExpire`; elegir edge cercano.
- Precio SDK **$0.0040/min** + PSTN del `<Dial>`.

```ts
import { Device, Call } from '@twilio/voice-sdk';
await navigator.mediaDevices.getUserMedia({ audio: true });
const device = new Device(token, { edge: 'roaming', codecPreferences: ['pcmu', 'opus'] as any, tokenRefreshMs: 10000 });
device.on('tokenWillExpire', async () => device.updateToken(await fetchToken()));
device.on('incoming', (call: Call) => showIncomingToast(call));   // call.accept() / call.reject()
await device.register();
const call = await device.connect({ params: { To: '+573001234567', callId, opportunityId } });
call.on('accept', () => setStatus('open'));
call.on('disconnect', () => { device.audio.unsetInputDevice(); setStatus('closed'); });
```

### 1.7 Móvil (Capacitor / nativo / bridge)

| Opción | Detalle verificado |
|---|---|
| SDKs oficiales | iOS **6.13.7**, Android **6.10.4**, React Native **1.7.0** (no Capacitor) |
| `@capgo/capacitor-twilio-voice` **8.2.12** | Comunitario; Capacitor ≥8; métodos `login/makeCall/acceptCall/endCall/mute/setSpeaker`; eventos `callInviteReceived…`; VoIP push iOS + FCM Android; **web no soportado** |
| **Click-to-call de 2 patas (bridge)** | Sin SDK en el dispositivo; funciona en cualquier celular; es el modo "llamar desde mi celular" (D1) |

Bridge (2 patas): `calls.create({ to: agentPhone, from: twilioNumber, url: '/api/voice/twiml/agent-leg?bridgeId=…' })` → el TwiML de la pata del agente:

```xml
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Conectando con el cliente. La llamada será grabada.</Say>
  <Dial callerId="+57XXXXXXXXXX" record="record-from-answer-dual" answerOnBridge="true"
        recordingStatusCallback="https://app.goadmin.io/api/voice/recording">
    <Number statusCallback="https://app.goadmin.io/api/voice/bridge/status"
            statusCallbackEvent="initiated ringing answered completed">+573001234567</Number>
  </Dial>
</Response>
```

Con `answerOnBridge="true"` la pata del agente queda "ringing" hasta que el cliente contesta (efecto verificado en `docs-twilio-voice.md`); **NO VERIFICADO**: que ese tiempo no se facture como minutos de la pata del agente (tester ANEXO-B r1 #5; comprobar en la consola de Twilio con una llamada de prueba antes de afirmarlo en la UI de costos). Roles por canal en grabación dual: canal 0 = quien originó (agente en outbound), canal 1 = destino.

### 1.8 ConversationRelay (GA mayo 2025) — motor primario del agente de voz (D1)

- Precio **$0.07/min** + minutos de voz PSTN/SDK. Costo de TTS/STT dentro de CR: los docs verificados no lo desglosan → **NO VERIFICADO** (asumir incluido en $0.07/min hasta confirmar en factura).
- Requisitos: aceptar el **AI/ML Addendum** en Console; `url` **`wss://` obligatorio**; validar `X-Twilio-Signature` en el handshake del WebSocket (D7).
- Atributos de `<ConversationRelay>`: `url`, `welcomeGreeting`, `welcomeGreetingInterruptible`, `language` (default `en-US`), `ttsLanguage`, `transcriptionLanguage`, `ttsProvider` (`ElevenLabs` default | `Google` | `Amazon`), `voice`, `transcriptionProvider` (`Deepgram` | `Google`), `speechModel` (`nova-3-general`), `eotThreshold`, `partialPrompts`, `deepgramSmartFormat`, `interruptible` (`any`), `interruptSensitivity`, `speechTimeout`, `dtmfDetection`, `reportInputDuringAgentSpeech`, `ignoreBackchannel`, `preemptible`, `hints`, `events`, `elevenlabsTextNormalization`, `intelligenceService`, `debug`. Hijos: `<Language code ttsProvider voice …/>` y `<Parameter name value/>` (llegan como `customParameters` en `setup`).
- `action` del `<Connect>` recibe: `SessionId`, `SessionStatus`, `SessionDuration`, `HandoffData`, `ErrorCode`.
- Mensajes **Twilio → app** (JSON por WS): `setup {sessionId, accountSid, callSid, parentCallSid, from, to, callType, direction, customParameters}`, `prompt {voicePrompt, lang, last}`, `interrupt {utteranceUntilInterrupt, durationUntilInterruptMs}`, `dtmf {digit}`, `error`.
- Mensajes **app → Twilio**: `text {token, last, lang, interruptible, preemptible}`, `play {source, loop}`, `sendDigits`, `language {ttsLanguage, transcriptionLanguage}`, `end {handoffData}`.
- **Voces ElevenLabs en CR**: `voice="{voiceId}-{model}-{speed_stability_similarity}"`, p. ej. `NYC9WEgkq1u4jiqBseQ9-flash_v2_5-1.0_0.8_0.6`. Modelos: `flash_v2_5` (default), `flash_v2`, `turbo_v2_5`, `turbo_v2`. Defaults ElevenLabs: `es-ES` → `6xftrpatV0jGmFHxDjUv`, `es-US` → `CaJslL1xziwefCeTNzHv`; **`es-MX` no tiene voz default → fijar `voice` explícito** (la voz clonada IVC del vendedor, D1). Auto-detección de idioma: `language="multi"`.
- STT: Deepgram `nova-3-general`; `hints` se pasan como keyterms.

```xml
<Response>
  <Connect action="https://app.goadmin.io/api/voice/relay/after">
    <ConversationRelay url="wss://ws.goadmin.io/conversation-relay?token={sessionToken}"
        language="es-MX" ttsProvider="ElevenLabs" voice="{voice_id}-flash_v2_5-1.0_0.5_0.75"
        transcriptionProvider="Deepgram" speechModel="nova-3-general"
        welcomeGreeting="Hola, soy el asistente virtual de {{org}}…" welcomeGreetingInterruptible="true"
        interruptible="any" dtmfDetection="true" hints="GoAdmin,factura,cotización">
      <Parameter name="agentId" value="…"/>
      <Parameter name="callId" value="…"/>
      <Parameter name="orgId" value="…"/>
    </ConversationRelay>
  </Connect>
</Response>
```

Bucle mínimo en el ws-server (Railway):

```ts
ws.on('message', async (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'setup') return session.init(msg.customParameters, msg.callSid);
  if (msg.type === 'interrupt') return session.abortCurrentResponse();
  if (msg.type === 'dtmf') return session.onDigit(msg.digit);
  if (msg.type === 'prompt' && msg.last) {
    for await (const token of session.llmStream(msg.voicePrompt)) {
      ws.send(JSON.stringify({ type: 'text', token, last: false }));
    }
    ws.send(JSON.stringify({ type: 'text', token: '', last: true }));
    if (session.shouldEnd) ws.send(JSON.stringify({ type: 'end', handoffData: JSON.stringify(session.outcome) }));
  }
});
```

### 1.9 Colombia

- Salientes: **fijo $0.0700/min**, **móvil $0.0377/min**. Entrantes a número local: **$0.0945/min** + **$14/mes** por número.
- Regulatorio: número local colombiano exige ID/registro mercantil + dirección en la localidad del prefijo.
- **Geo Permissions**: habilitar Colombia en Console (errores `21215` en API / `13227` en `<Dial>` si no está habilitado). Cuenta trial: solo Verified Caller IDs.

### 1.10 Firma `X-Twilio-Signature` en Next.js (App Router)

HMAC-SHA1 con el **Auth Token de la (sub)cuenta**, sobre la URL completa + params POST ordenados, en Base64. Para JSON: query `?bodySHA256=`. SDK: `validateRequest(authToken, signature, url, params)` (prueba con y sin puerto) y `validateRequestWithBody(authToken, signature, url, rawBody)`.

```ts
// src/app/api/voice/status/route.ts
export const runtime = 'nodejs';
import { validateRequest } from 'twilio';

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const { pathname, search } = new URL(req.url);
  const url = `${process.env.TWILIO_WEBHOOK_BASE_URL}${pathname}${search}`; // URL pública exacta
  const authToken = await resolveAuthTokenByAccountSid(params.AccountSid);   // subcuenta o master
  if (!authToken || !validateRequest(authToken, req.headers.get('x-twilio-signature') ?? '', url, params)) {
    return new Response('invalid signature', { status: 403 });                // fail-closed (D7)
  }
  // … procesar params.CallSid / params.CallStatus / params.SequenceNumber
  return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
}
```

Multi-tenant: resolver el token por `AccountSid` del payload **antes** de validar; nunca "primera org activa" (D7). En el ws-server validar en el `upgrade` con la URL `wss://…` completa y además exigir el token por sesión pasado en `<Parameter>`.

### 1.11 Gotchas Twilio Voice

1. `from` debe ser número Twilio o Verified Caller ID.
2. `<Record>` es mono → usar `record-from-answer-dual` en `<Dial>` o `recordingChannels: 'dual'` en la API.
3. Media URLs con Basic Auth → proxy de backend.
4. `identity` ≤10 sesiones; `ttl` ≤24 h.
5. Navegadores móviles no sostienen background → plugin Capacitor o bridge.
6. `es-CO` no existe (el repo lo usa hoy en `src/app/api/voice/twiml/ai-agent/route.ts`).
7. ConversationRelay $0.07/min extra; `es-MX` sin voz ElevenLabs default.
8. `twilio` 6 exige Node ≥20.
9. `asyncAmd` consume un fork de audio → no combinar con Media Streams.
10. Ordenar status callbacks por `SequenceNumber`.

---

## 2. Twilio Programmable Messaging (SMS + WhatsApp)

### 2.1 `client.messages.create`

- Requeridos: `to` (E.164 o `whatsapp:+E164`), uno de `from` | `messagingServiceSid`, uno de `body` | `mediaUrl` | `contentSid`.
- Opcionales: `statusCallback`, `contentVariables` (JSON string; requiere `contentSid`), `scheduleType: 'fixed'` + `sendAt` (15 min – 35 días; **requiere `messagingServiceSid`**; máx 500k programados), `validityPeriod` (1–36000 s), `shortenUrls` (requiere MS), `mediaUrl` (máx 10; jpeg/png/gif ≤5 MB).
- `status`: `queued, sending, sent, failed, delivered, undelivered, receiving, received, accepted, scheduled, read, partially_delivered, canceled` (`read` solo WA/RCS).

```ts
await client.messages.create({
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,   // Sticky Sender + Advanced Opt-Out
  to: '+573001234567',
  body: 'Hola {{nombre}}, le recordamos su demo mañana 10:00. Responda BAJA para no recibir más.',
  statusCallback: `${BASE}/api/integrations/twilio/status-callback`,
  scheduleType: 'fixed', sendAt: new Date(Date.now() + 3600_000),
  validityPeriod: 3600,
});
```

### 2.2 Webhooks (form-urlencoded, firmados con `X-Twilio-Signature`)

- **Status callback**: `MessageSid`, `MessageStatus`, `To`, `From`, `AccountSid`, `MessagingServiceSid`, `ErrorCode` (en failed/undelivered), `ChannelInstallSid`, `ChannelPrefix`, `ChannelStatusMessage`, `EventType` (`READ`), `RawDlrDoneDate`.
- **Inbound**: `MessageSid`, `AccountSid`, `MessagingServiceSid`, `From`, `To`, `Body` (≤1600), `NumMedia`, `MediaUrl{N}`, `MediaContentType{N}`, `ButtonPayload/ButtonText/ButtonType`, `InteractiveData`, `Latitude/Longitude`, `ProfileName`, `WaId`, `Forwarded`, `OriginalRepliedMessageSid`, `Referral*`; `OptOutType` (`START|STOP|HELP`) si Advanced Opt-Out.

### 2.3 WhatsApp por Twilio

- Ventana de **24 h** desde el último mensaje recibido; fuera de ella solo plantillas aprobadas; **opt-in obligatorio**.
- Media: JPG/PNG 5 MB; audio OGG/AMR/AAC/MPEG; video MP4; docs PDF/DOCX/XLSX; 20 MB. Throughput **80 MPS por sender**.
- **1 WABA por cuenta Twilio** → multi-tenant real = 1 subcuenta Twilio por organización (patrón ISV + Embedded Signup de Meta, Tech Provider Program).
- **Senders API v2**: `POST https://messaging.twilio.com/v2/Channels/Senders` `{ sender_id: "whatsapp:+E164", configuration: { waba_id, verification_method }, profile: { name, … }, webhook: { callback_url, status_callback_url } }` → `sid XE…`, `status CREATING|ONLINE|OFFLINE|PENDING_VERIFICATION|VERIFYING|…`. SDK: `client.messaging.v2.channelsSenders.create/update({ configuration: { verification_code } })/fetch`. **v1 deprecada 2026-09-01.**
- Sandbox: `whatsapp:+14155238886`, `join <code>`, expira a los 3 días, sin plantillas custom.
- Categorías: `AUTHENTICATION | UTILITY | MARKETING`. Aprobación `received → pending → approved|rejected` (minutos a 48 h).

### 2.4 Content API (plantillas)

- `POST https://content.twilio.com/v1/Content` `{ friendly_name, language, variables, types }`; SDK `client.content.v1.contents.create`. Aprobación WA: `POST /v1/Content/{Sid}/ApprovalRequests/whatsapp` `{ name (minúsculas/dígitos/_), category }`; estado `GET /ApprovalRequests`; listado `GET /v1/ContentAndApprovals`.
- Tipos: `twilio/text`, `twilio/media`, `twilio/location`, `twilio/quick-reply`, `twilio/call-to-action`, `twilio/list-picker`, `twilio/card`, `twilio/carousel`, `twilio/catalog`, `twilio/pay`, `twilio/flows`, `whatsapp/card`, `whatsapp/authentication`. `location` / `list-picker` / `pay` **no** para business-initiated.
- Variables `{{1}}`, `{{2}}` secuenciales; máx 100; el cuerpo no puede empezar/terminar con variable ni tener variables adyacentes.
- Envío: `messages.create({ contentSid: 'HX…', contentVariables: JSON.stringify({ 1: 'Laura' }), from: 'whatsapp:+…', to: 'whatsapp:+…' })`; **no combinar con `body`/`mediaUrl`**.

### 2.5 Opt-out

- Default (long codes, inglés): `STOP/UNSUBSCRIBE/END/QUIT/STOPALL/REVOKE/OPTOUT/CANCEL`; reactivar `START/UNSTOP`.
- **Advanced Opt-Out** (Messaging Service): keywords por idioma/país (`AYUDA`…), aplica también a senders WhatsApp; el webhook recibe `OptOutType`; envíos posteriores fallan asíncronamente con error **21610**. Si se envía con `from` directo (sin MS) hay que implementar el STOP propio.
- Messaging Services: Sticky Sender, Geomatch, Smart Encoding, Link Shortening, Advanced Opt-Out, Validity Period. D1: SMS **siempre** vía Messaging Service con Advanced Opt-Out; palabras `STOP/BAJA/CANCELAR` inbound → `contact_consents` (D4).

### 2.6 Precios

- SMS Colombia saliente **$0.0592/segmento**; México $0.1819 out / $0.02 in.
- WhatsApp por Twilio: **$0.005/msg** (in y out) + pass-through de Meta (§7.5).

---

## 3. ElevenLabs

Producto de agentes renombrado a **ElevenAgents**. Rutas doc vigentes: `/docs/eleven-agents/…`, `/docs/eleven-api/…`, `/docs/api-reference/…`.

### 3.1 SDK y auth

- **`@elevenlabs/elevenlabs-js` 2.67.0** (el paquete `elevenlabs` está deprecado). Browser: `@elevenlabs/client` 1.25.0, `@elevenlabs/react` 1.15.2. Node 15+.
- `new ElevenLabsClient({ apiKey })` (default env `ELEVENLABS_API_KEY`). Header REST `xi-api-key`; base `https://api.elevenlabs.io/v1/`. API keys con **scope, cuota de créditos e IP allowlist**.
- WS regional: `wss://api.elevenlabs.io/` (default), `api.us.`, `api.eu.residency.`, etc.

### 3.2 Text to Speech

- REST: `POST /v1/text-to-speech/{voice_id}` (JSON → audio), `/stream`, `/with-timestamps` (`audio_base64` + `alignment`).
- WS single: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input` (query `model_id`, `language_code`, `output_format`, `auto_mode`, `sync_alignment`); mensajes `InitializeConnection {text:" ", voice_settings, xi-api-key}`, `SendText {text, flush}`, `CloseConnection {text:""}`; respuestas `audio` (base64), `alignment`, `isFinal`. WS multi-contexto: `/multi-stream-input` (`context_id`, `close_context`).
- `output_format`: `mp3_44100_128` (default), `mp3_22050_32`, `opus_48000_*`, `pcm_8000..48000`, `wav_*`, **`ulaw_8000`** (Twilio Media Streams), `alaw_8000`.
- Body: `text`, `model_id` (default `eleven_multilingual_v2`), `language_code` (**no aplica a multilingual_v2**), `seed`, `previous_text/next_text`, `apply_text_normalization auto|on|off`, `pronunciation_dictionary_locators` (máx 3), `voice_settings { stability 0.5, similarity_boost 0.75, style 0, use_speaker_boost true, speed 1.0 }`.

| Modelo | Estado | Máx chars | Idiomas | Latencia | Uso en el CRM |
|---|---|---|---|---|---|
| `eleven_v3` | GA | 5 000 | 70+ | — | Locuciones de alta calidad (no tiempo real) |
| `eleven_v3_conversational` | GA | — | — | ~280 ms | Agentes (audio tags) |
| `eleven_multilingual_v2` | GA | 10 000 | 29 | — | Long-form estable (España, México) |
| `eleven_flash_v2_5` | GA | 40 000 | 32 | ~75 ms | **Default del agente en español** (0.5 crédito/char) |
| `eleven_flash_v2` | GA | — | inglés | — | No usar en español |
| `eleven_turbo_v2_5`, `eleven_turbo_v2` | **DEPRECADOS** | | | | Migrar a flash_v2_5 |

Concurrencia TTS (semi-verificado): Multilingual v2 Free 2 / Starter 3 / Creator 5 / Pro 10 / Scale 15; Flash 4 / 6 / 10 / 20 / 30.

```ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const audio = await eleven.textToSpeech.stream(voiceId, {
  text, modelId: 'eleven_flash_v2_5', outputFormat: 'ulaw_8000', languageCode: 'es',
  voiceSettings: { stability: 0.5, similarityBoost: 0.75, speed: 1.0 },
});
for await (const chunk of audio) twilioMediaStream.send(chunk);   // solo si se usa Media Streams
```

### 3.3 Precios ElevenLabs

| Plan | $/mes | Créditos/mes | Chars TTS | Horas STT |
|---|---|---|---|---|
| Free | 0 | 10k | — | — |
| Starter | 6 | 30k | 60k | 27 |
| Creator | 22 (11 el primer mes) | 121k | 220k | 100 |
| Pro | 99 | 600k | 990k | 450 |
| Scale | 299 | 1.8M (3 seats) | 2.99M | 1 359 |
| Business | 990 | 6M (10 seats) | 9.9M | 4 500 |

- 1 crédito/char (multilingual_v2 / v3); 0.5–1 crédito/char flash_v2_5; STT 330 créditos/min. Rollover 2 meses.
- **PAYG API**: TTS v3 y multilingual_v2 **$0.10/1k chars**; v3_conversational y flash **$0.05/1k chars**. STT Scribe v2 **$0.22/h**; Scribe v2 Realtime **$0.39/h**; entity detection +$0.07/h; keyterms +$0.05/h. Speech Engine (Agents) **$0.08/min**.
- IVC desde Starter; PVC desde Creator (3 slots; 10 en Business).

### 3.4 Voice cloning (IVC / PVC) y consentimiento

- **IVC**: `POST /v1/voices/add` multipart `{ name, files[], remove_background_noise, description, labels }` → `{ voice_id, requires_verification }`. SDK `client.voices.ivc.create`. 1–2 min de audio limpio de un solo hablante (funciona con 30 s).
- **PVC**: `POST /v1/voices/pvc { name, language, description, labels }`; `POST /v1/voices/pvc/{id}/samples` (multipart `files`); `GET/POST /v1/voices/pvc/{id}/captcha` (grabación de verificación); `POST /v1/voices/pvc/{id}/train { model_id }`. 30–180 min de audio; fine-tuning 3–6 h; 39 idiomas incl. español.
- **Consentimiento**: PVC solo de la propia voz ("Even with their consent, you cannot clone someone else's voice"). En el CRM (D1/D9): cada vendedor/dueño clona **su** voz desde la UI (grabación guiada), la org registra el consentimiento en `voices.consent_recorded_at`, **IVC como default**; PVC solo si el usuario completa la verificación captcha por sí mismo.

```ts
const { voiceId, requiresVerification } = await eleven.voices.ivc.create({
  name: `org${orgId}_${userId}`,
  files: [new File([sampleBytes], 'sample.webm', { type: 'audio/webm' })],
  removeBackgroundNoise: true,
  labels: JSON.stringify({ organization_id: String(orgId), owner_user_id: userId, language: 'es' }),
});
await supabase.from('voices').insert({ organization_id: orgId, provider: 'elevenlabs', provider_voice_id: voiceId,
  owner_user_id: userId, consent_recorded_at: new Date().toISOString(), is_default: true });
```

### 3.5 Speech to Text — Scribe v2 (STT primario, D1)

- `POST /v1/speech-to-text` multipart: `model_id` (`scribe_v2`), `file` (≥100 ms) o `source_url`, `language_code` (`"spa"` / `"es"`), `diarize`, `num_speakers`, `timestamps_granularity word|character`, `tag_audio_events`, `webhook` (bool, asíncrono) + `webhook_id`, `temperature`, `entity_detection`, `keyterms` (≤1000), `no_verbatim`, `additional_formats`. Límite seguro 3 GB / 10 h.
- Respuesta: `language_code`, `language_probability`, `text`, `words[] { text, type word|spacing|audio_event, logprob, start, end, speaker_id, channel_index? }`, `audio_duration_secs`, `entities[]`, `transcription_id`.
- Diarización hasta **32 hablantes**; 90+ idiomas; español "Excellent (≤5 % WER)".
- **Roles agente/cliente**: con grabación dual de Twilio se asignan **por canal** (`channel_index` o transcribiendo cada canal por separado), no por `speaker_id` (D1). `detect_speaker_roles` del V3 no está en la referencia vigente → no usar.
- Realtime: WS `model_id=scribe_v2_realtime`, `audio_format pcm_16000` (default) / `ulaw_8000`, `commit_strategy manual|vad`, `keyterms`; mensajes `input_audio_chunk` → `partial_transcript`, `committed_transcript(_with_timestamps)`; ~150 ms.
- Webhooks: se configuran en settings; evento `speech_to_text_transcription { request_id, transcription { text, language_code, words } }`; header **`ElevenLabs-Signature`**; verificar con `client.webhooks.constructEvent(rawBody, header, secret)`; 5 reintentos en 5xx/429/408; auto-disable tras 10 fallos.

```ts
const result = await eleven.speechToText.convert({
  file: new File([wavBytes], `${callId}.wav`, { type: 'audio/wav' }),
  modelId: 'scribe_v2', languageCode: 'spa',
  diarize: true, numSpeakers: 2, timestampsGranularity: 'word',
  webhook: true,                                   // async → llega a /api/webhooks/elevenlabs
});
// Modo síncrono (llamadas cortas): omitir webhook y leer result.words[] / result.text
```

```ts
// src/app/api/webhooks/elevenlabs/route.ts
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const raw = await req.text();
  const event = eleven.webhooks.constructEvent(raw, req.headers.get('elevenlabs-signature') ?? '', process.env.ELEVENLABS_WEBHOOK_SECRET!);
  if (event.type === 'speech_to_text_transcription') await enqueueJob('transcribe_result', event.data);
  if (event.type === 'post_call_transcription') await enqueueJob('agent_post_call', event.data);
  return new Response('ok');
}
```

### 3.6 ElevenAgents (motor secundario `elevenlabs_agent`, D1)

- Crear agente: `POST /v1/convai/agents/create` con `conversation_config { agent: { prompt: { prompt, llm, temperature, tool_ids[], knowledge_base[], built_in_tools }, first_message, language }, tts: { voice_id, model_id (default eleven_flash_v2 → poner eleven_flash_v2_5 para español), agent_output_audio_format }, asr: { provider: "scribe_realtime", quality, user_input_audio_format }, turn: { turn_timeout 7, turn_eagerness }, conversation: { max_duration_seconds 600, client_events[] } }` → `agent_id`.
- LLMs disponibles: Gemini (3.7 Flash … 2.5 Flash Lite), OpenAI (GPT-5.6 … GPT-4o Mini), Anthropic (Opus 4.8, Sonnet 5, Haiku 4.5), Qwen; LLM custom por endpoint. Costo del LLM pass-through.
- **Tools**: `POST /v1/convai/tools` con `tool_config` tipo `webhook { name, description, api_schema { url, method, path_params_schema, query_params_schema, request_body_schema, request_headers }, response_timeout_secs 5–300, dynamic_variables }` o `client` → `id`. System tools (`built_in_tools`): `end_call`, `language_detection`, `transfer_to_agent`, `transfer_to_number`, `skip_turn`, `play_keypad_touch_tone`, `voicemail_detection`, `update_state`.
- Knowledge base: `POST /v1/convai/knowledge-base/url|text|file` (≤20 MB PDF/TXT/DOCX/HTML/MD). SDK `client.conversationalAi.knowledgeBase.documents.createFrom*`.
- Signed URL para browser/simulador: `GET /v1/convai/conversation/get-signed-url?agent_id=`; cliente `@elevenlabs/client` → `Conversation.startSession({ agentId | signedUrl | conversationToken, connectionType, onMessage, … })`.
- Personalización inbound (Twilio nativo): ElevenLabs hace POST a tu webhook con `{ caller_id, agent_id, called_number, call_sid, conversation_id }` → responder `{ type: "conversation_initiation_client_data", dynamic_variables, conversation_config_override: { agent: { prompt: { prompt }, first_message, language }, tts: { voice_id } } }`.
- **Post-call webhooks**: `post_call_transcription`, `post_call_audio` (MP3 base64), `call_initiation_failure`. Payload `data { conversation_id, agent_id, status, transcript[], metadata, analysis { transcript_summary, evaluation_criteria_results, data_collection_results, call_successful }, conversation_initiation_client_data }`.
- **Twilio nativo**: `POST /v1/convai/phone-numbers { phone_number, label, sid, token, provider: "twilio", agent_id }` → `phone_number_id` (o `provider: sip_trunk`).
- **Outbound**: `POST /v1/convai/twilio/outbound-call { agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data { dynamic_variables, conversation_config_override } }` → `{ success, conversation_id, callSid }`.
- **Batch**: `POST /v1/convai/batch-calling/submit { call_name, agent_id, agent_phone_number_id, recipients[] { phone_number, id, dynamic_variables }, scheduled_time_unix }` → `{ id, status, totals }`.
- Precios Agents: minutos incluidos / concurrencia Free 15/4, Starter 75/6, Creator 275/10, Pro 1 238/20, Scale 3 738/30, Business 12 375/40; overage **$0.08/min**; LLM y telefonía al costo (Twilio aparte). Burst 3× a $0.16/min.

```ts
const call = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
  method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id: agent.provider_agent_id, agent_phone_number_id: phone.provider_phone_id, to_number: customer.phone,
    conversation_initiation_client_data: {
      dynamic_variables: { customer_name: customer.first_name, opportunity_name: opp.name, org_name: org.name },
      conversation_config_override: { agent: { first_message: agent.first_message, language: 'es' }, tts: { voice_id: voice.provider_voice_id } },
    },
  }),
}).then(r => r.json() as Promise<{ success: boolean; conversation_id: string; callSid: string }>);
```

### 3.7 Gotchas ElevenLabs

1. `eleven_turbo_v2_5` deprecado → `eleven_flash_v2_5` o `eleven_v3_conversational`.
2. `language_code` no aplica a `multilingual_v2`.
3. Default TTS del agente `eleven_flash_v2` es solo inglés → fijar `flash_v2_5` + `language: "es"`.
4. `cloud_storage_url` deprecado → `source_url`.
5. Verificar webhooks sobre el **body crudo**.
6. PVC solo voz propia; IVC puede devolver `requires_verification: true`.
7. Twilio Media Streams → `output_format: ulaw_8000` (no aplica a ConversationRelay, donde Twilio hace el TTS).

---

## 4. OpenAI

Docs en `developers.openai.com/api/docs`.

### 4.1 SDK

- **`openai` 7.10.0** exige **Node ≥22**. El repo tiene `^6.15.0` y el ws-server corre en `node:20-slim` → decisión: **subir Railway y Vercel a Node 22 y usar `openai` ^7.10** (o quedarse en 6.x si no se puede). peerDeps opcionales: `ws ^8.21`, `zod ^3.25 || ^4`.
- `new OpenAI({ apiKey, organization, project })`. `client.responses.create/parse` + `zodTextFormat` de `"openai/helpers/zod"`. `OpenAIRealtimeWebSocket` de `'openai/realtime/websocket'`. `client.audio.transcriptions.create`, `client.audio.speech.create`. Webhooks: `client.webhooks.unwrap(rawBody, headers)` con `OPENAI_WEBHOOK_SECRET` (headers `webhook-id/-timestamp/-signature`).

### 4.2 Modelos de texto (Responses API) — USD por 1M tokens in / cached / out

| Modelo | Contexto | Precio | Notas |
|---|---|---|---|
| `gpt-6-astra` | 1.05M | $10 / $1 / $50 | tope; `reasoning.effort low..max` (sin `none`) |
| `gpt-5.6-sol` | 1.05M | $4 / $0.40 / $20 | flagship 5.6 |
| **`gpt-5.6-terra`** | 1.05M | $2 / $0.20 / $12 | **cerebro del agente de voz por defecto (D1)** |
| **`gpt-5.6-luna`** | 1.05M | $0.20 / $0.02 / $1.20 | **tareas baratas: resumen, sentimiento, redacción email/WA** (`reasoning.effort: 'none'`); reemplazo oficial de gpt-4.1-nano |
| `gpt-5.4-nano` | 400K | $0.20 / $0.02 / $1.25 | |
| `gpt-5-mini` | 400K | $0.25 / $0.025 / $2 | |
| `gpt-5-nano` | 400K | $0.05 / $0.005 / $0.40 | el más barato; cutoff may-2024 |
| `gpt-4.1` / `-mini` / `-nano` | — | $2/$8 · $0.40/$1.60 · $0.10/$0.40 | `gpt-4.1-nano` se apaga 2026-10-23 |
| `gpt-4o` / `gpt-4o-mini` | — | $2.50/$10 · $0.15/$0.60 | legacy (el repo los usa hoy) |

- Contexto >272K: 2× input, 1.5× output. Regional +10 %.
- Costo estimado de una extracción estructurada de 3K tokens con `gpt-5.6-luna`: ≈ **$0.001**.
- Estado: `previous_response_id` (30 días, refactura historial) o Conversations API; `store: false` para no guardar (default `true`).

### 4.3 Structured outputs

`text: { format: zodTextFormat(schema, name) }` o `{ type: "json_schema", name, schema, strict: true }`; `additionalProperties: false`; todos los campos `required`; un rechazo llega como item `type: "refusal"`.

```ts
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
const CallAnalysis = z.object({
  summary: z.string(), sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  quality_score: z.number().min(0).max(100), next_steps: z.array(z.string()),
  detected_objections: z.array(z.string()), budget_mentioned: z.boolean(), decision_maker_identified: z.boolean(),
});
const r = await openai.responses.parse({
  model: 'gpt-5.6-luna', reasoning: { effort: 'none' }, store: false,
  input: [{ role: 'system', content: ANALYSIS_PROMPT_ES }, { role: 'user', content: transcriptText }],
  text: { format: zodTextFormat(CallAnalysis, 'call_analysis') },
});
const analysis = r.output_parsed;   // tipado por zod
```

### 4.4 Realtime API (GA; en este plan: `openai_realtime` = experimental, fuera del path crítico)

| Modelo | Precio audio (1M tok in / cached / out) | Precio texto | ≈ USD/min | Límites Tier 1 |
|---|---|---|---|---|
| **`gpt-realtime-2.1`** | $32 / $0.40 / $64 | $4 / $0.40 / $24 | ≈ $0.019 in + $0.077 out (estimado) | 200 RPM / 1000 RPD / 40K TPM |
| `gpt-realtime-2.1-mini` | $10 / $0.30 / $20 | $0.60 / $0.06 / $2.40 | ≈ $0.006 + $0.024 | |
| `gpt-realtime-2` / `-1.5` | GA, como 2.1 | | | |

- Migración GA: quitar header `OpenAI-Beta: realtime=v1`; `session.type`; audio en `session.audio.*`; eventos `response.output_audio.delta` / `response.output_text.delta`.
- Transportes: **WS** servidor `wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1` (Bearer API key). **WebRTC**: `POST /v1/realtime/client_secrets { session: { type: "realtime", model, audio: { output: { voice: "marin" } } } }` → `ek_…` (10–7200 s). **SIP**: trunk `sip:$PROJECT_ID@sip.api.openai.com;transport=tls`; webhook `realtime.call.incoming { call_id }`; `POST /v1/realtime/calls/{id}/accept|reject|refer|hangup`; guía "Connect the Realtime SIP Connector to Twilio Elastic SIP Trunking". Con Twilio Media Streams el formato es `audio.input.format { type: "audio/pcmu" }` (ya no `g711_ulaw`).
- `session.update`: `output_modalities ["audio"]`, `instructions`, `audio.input { format { type: "audio/pcmu" }, noise_reduction { type: "far_field" }, transcription { model: "gpt-transcribe", language: "es" }, turn_detection { type: "server_vad" | "semantic_vad", threshold, prefix_padding_ms, silence_duration_ms, create_response, interrupt_response } }`, `audio.output { format, voice: "marin" }`, `tools [{ type: "function", name, description, parameters }]`.
- Voces: `alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar` (no cambiable tras el primer audio).
- Function calling: en `response.done` llega item `{ type: "function_call", name, call_id, arguments }`; responder `conversation.item.create { type: "function_call_output", call_id, output }` + `response.create`.

```ts
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
const rt = new OpenAIRealtimeWebSocket({ model: 'gpt-realtime-2.1' });
rt.send({ type: 'session.update', session: {
  type: 'realtime', output_modalities: ['audio'], instructions: agent.system_prompt,
  audio: { input: { format: { type: 'audio/pcmu' }, transcription: { model: 'gpt-transcribe', language: 'es' },
                    turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true } },
           output: { format: { type: 'audio/pcmu' }, voice: 'marin' } },
  tools: crmTools,
} });
```

### 4.5 Speech-to-text (`POST /v1/audio/transcriptions`) — tercer fallback (D1)

| Modelo | Precio | Notas |
|---|---|---|
| **`gpt-transcribe`** | $0.0045/min | recomendado; `languages: ["es"]` (array; **no** enviar `language`), `keywords`, `prompt`, `stream`; **sin diarización** |
| `gpt-live-transcribe` | $0.017/min | sesiones de transcripción realtime |
| `gpt-4o-transcribe` | ~$0.006/min | se apaga 2027-02-26 |
| `gpt-4o-mini-transcribe` | ~$0.003/min | se apaga 2027-02-26 |
| `gpt-4o-transcribe-diarize` | ~$0.006/min | único con diarización (`response_format "diarized_json"`, `chunking_strategy "auto"`, `known_speaker_names/references`); se apaga 2027-02-26 |
| `whisper-1` | $0.006/min | `verbose_json/srt/vtt`, `timestamp_granularities`; se apaga 2027-02-26 |

- Archivos ≤25 MB (mp3, mp4, mpeg, mpga, m4a, wav, webm) → partir/comprimir grabaciones largas.
- Conclusión: OpenAI **no** es opción primaria de STT diarizado; con grabación dual de Twilio la diarización se hace por canal, así que `gpt-transcribe` sirve como fallback (un request por canal).

```ts
const tr = await openai.audio.transcriptions.create({
  file: fs.createReadStream(`${callId}_ch0.mp3`), model: 'gpt-transcribe',
  languages: ['es'], prompt: 'Llamada comercial en español colombiano. Marcas: GoAdmin.',
});
```

### 4.6 TTS (`POST /v1/audio/speech`)

`gpt-4o-mini-tts` ($0.60/1M texto + $12/1M audio ≈ $0.015/min), `tts-1` ($15/1M chars), `tts-1-hd` ($30/1M chars). Voces: `alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar`; `instructions` para estilo; `response_format mp3|opus|aac|flac|wav|pcm`. **Voces optimizadas para inglés** → no es el TTS del agente en español (ElevenLabs lo es).

### 4.7 Límites, caching, batch

- Tiers: Free $100/mes … Tier 5 $200k/mes. Headers `x-ratelimit-*`.
- **Batch** 50 % de descuento (24 h; hasta 50k requests) → usar para análisis masivo retroactivo.
- **Prompt caching** hasta 90 % (GPT-5.6+: cached = 0.1×; prefijo ≥1024 tokens) → poner el system prompt del agente y el contexto de la org **al inicio** del input.
- ZDR disponible. Audio dentro de Responses: `gpt-audio-1.5` solo Chat Completions ($32/$64) → más barato transcribir + `gpt-5.6-luna`.

### 4.8 Gotchas OpenAI

1. `openai` 7.x exige Node ≥22. 2. Familia 5.6 = sol/terra/luna. 3. `gpt-4o-realtime-preview` ya apagado (el repo lo referencia en `OPENAI_REALTIME_MODEL`). 4. Diarización OpenAI en deprecación. 5. `gpt-transcribe` usa `languages` (array). 6. Realtime GA sin `OpenAI-Beta`, formatos `audio/pcmu`. 7. `store` es `true` por defecto → `store: false` para datos de clientes.

---

## 5. Google Gemini

Paradigma: **Interactions API** (`client.interactions.create()`) es el camino recomendado; `generateContent` es legacy pero soportado (el análisis existente en el repo lo usa con `responseSchema`: se mantiene, D1).

### 5.1 SDK y auth

- **`@google/genai` 2.21.0** (Node ≥20; **v3.0 exigirá Node 22** → fijar `^2.21.0`). Repo `^2.20.0`.
- `new GoogleGenAI({ apiKey })`; env `GEMINI_API_KEY` o `GOOGLE_API_KEY`. Header REST `x-goog-api-key`; base `https://generativelanguage.googleapis.com/v1beta`. Vertex: `new GoogleGenAI({ enterprise: true, project, location })`.

### 5.2 Modelos (1 048 576 in / 65 536 out) y precios USD/1M tokens

| Modelo | In | Out | Audio in | Batch | Notas |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | 0.75 (1.50 desde 2027) | 3.75 (7.50) | NO VERIFICADO | 50 % | GA 2026-09-02; promo hasta 2026-12-31; thinking low/medium/high; **alternativa configurable del agente (D1)** |
| `gemini-3.5-flash` | 1.50 | 9.00 | NO VERIFICADO | 50 % | |
| `gemini-3.5-flash-lite` | 0.30 | 2.50 | 1.00 | 50 % | |
| `gemini-3.1-flash-lite` | 0.25 | 1.50 | 0.50 | 50 % | |
| `gemini-3.1-pro-preview` | 2.00 / 4.00 | 12 / 18 | — | 50 % | |
| `gemini-2.5-pro` | 1.25 / 2.50 | 10 / 15 | — | 50 % | estable, sin shutdown |
| **`gemini-2.5-flash`** | 0.30 | 2.50 | **1.00** | 50 % | **análisis de llamada (D1) y fallback STT con audio nativo** |
| `gemini-2.5-flash-lite` | 0.10 | 0.40 | 0.30 | 50 % | |
| `gemini-3.5-transcribe` | 2.00 (≈$0.003/min) | 12.00 | | | STT dedicado, GA 2026-08-26 |
| `gemini-3.5-transcribe-live` | 3.50 (≈$0.005/min) | 21.00 | | | STT realtime |
| `gemini-3.1-flash-live-preview` | texto 0.75 / audio 3.00 ($0.005/min) | texto 4.50 / audio 12.00 ($0.018/min) | | | Live API (Preview) |
| `gemini-3.1-flash-tts-preview` | 1.00 | 20.00 (audio) | | | TTS Preview |
| `gemini-2.5-flash-preview-tts` | 0.50 | 10.00 | | | TTS Preview |

- Rate limits ya no se publican por modelo (ver AI Studio). Tiers: Free, T1 (billing), T2 ($100 + 3 días), T3 ($1000 + 30 días).
- Free tier existe pero el contenido se usa para mejorar productos → **no usar con datos de clientes**.
- Caching implícito por defecto (≥4096 tokens en 3.x); explícito solo con `generateContent`.

### 5.3 Structured output y tools

- Interactions: `response_format: { type: 'text', mime_type: 'application/json', schema }` → `interaction.output_text`. Legacy: `config.responseMimeType: 'application/json'` + `responseSchema` / `responseJsonSchema`.
- Subset JSON Schema: `string/number/integer/boolean/object/array/null`, `properties`, `required`, `enum`, `format`, `min/max`, `items`, `anyOf`, `$ref`.
- Function calling: `tools [{ type: 'function', name, description, parameters }]`; `interaction.steps[]` con `step.type === 'function_call'`, `name`, `arguments`; `tool_choice` `auto|any|none`.

### 5.4 Audio understanding (fallback STT + análisis en un solo paso)

- Formatos: WAV/MP3/AAC/OGG/FLAC/M4A/Opus/ALAW/MULAW/WebM. Inline ≤20 MB; **Files API** `client.files.upload({ file, config: { mimeType } })` hasta 2 GB, retención 48 h, gratis.
- Máx **9.5 h** de audio por prompt; **32 tokens/s** (1 min = 1 920 tokens). Llamada de 10 min con `gemini-2.5-flash` ≈ 19 200 tokens ≈ **$0.019**.
- Transcripción + diarización + emoción vía prompt + schema (`speaker`, `timestamp MM:SS`, `content`).
- **`gemini-3.5-transcribe`**: hasta 1 h/request (30 min con diarización/timestamps), 8 hablantes, timestamps por palabra, `custom_vocabulary` (1000), `language_codes ["es-419"]`; `transcription_config.mode { type: "verbatim", diarization_mode: "speaker", timestamp_granularities: ["word"] }`; salida en `steps[].content[].annotations[] { text, speaker "spk_1", start_offset, end_offset }`. Hay un bug reportado en foros con esa config → **probar antes de adoptar**.

```ts
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const file = await ai.files.upload({ file: localPath, config: { mimeType: 'audio/mp3' } });
const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: [
    { type: 'text', text: 'Transcribe en español con etiquetas Agente/Cliente y timestamps MM:SS; luego resume y clasifica el sentimiento (positive|neutral|negative|mixed).' },
    { type: 'audio', uri: file.uri, mime_type: file.mimeType },
  ],
  response_format: { type: 'text', mime_type: 'application/json', schema: callTranscriptSchema },
});
const parsed = JSON.parse(interaction.output_text);
```

### 5.5 Batch y caching

Batch API **50 %** de descuento en todos los modelos listados. Caching implícito automático; explícito solo en `generateContent`.

### 5.6 Live API (Preview) — `gemini_live` = experimental, fuera del path crítico

- `ai.live.connect({ model, config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }, inputAudioTranscription: {}, outputAudioTranscription: {} }, callbacks })`.
- Audio in PCM16 16 kHz mono (`session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })`); out PCM16 24 kHz.
- VAD: `automaticActivityDetection { silenceDurationMs 500-800 }`. Function calling con `toolCall` / `sendToolResponse`.
- Sesión de audio 15 min; con `contextWindowCompression` ilimitada; `sessionResumption` handle 2 h; `GoAway timeLeft`. Contexto 128k.
- Ephemeral tokens: `client.authTokens.create({ config: { uses: 1, expireTime, newSessionExpireTime } })`.
- **Sin integración Twilio nativa**; partners LiveKit, Pipecat, Voximplant, Agora. Puente Twilio Media Streams (mulaw 8 kHz ↔ PCM 16/24 kHz) a mano.
- STT live: `gemini-3.5-transcribe-live` (10 min/sesión, sin diarización).

### 5.7 TTS (Preview)

Interactions: `response_format: { type: 'audio' }`, `generation_config.speech_config: [{ voice: 'Kore' }]`; multi-speaker. Salida base64 PCM 24 kHz (envolver en WAV). 30 voces (Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, …). Español `es`. Estilo por prompt + tags `[whispers]`. 32k tokens/sesión.

### 5.8 Gotchas Gemini

1. Docs JS migraron a Interactions (snake_case en request; Files API camelCase).
2. Explicit caching solo en `generateContent`.
3. Precio 3.x Flash es promocional; presupuestar $1.50/$7.50 desde 2027.
4. Para llamadas en español: `gemini-2.5-flash` ($1.00/1M audio) o `3.5-flash-lite`; `gemini-3.5-transcribe` ($0.003/min) con diarización nativa pero 30 min de tope con esas features.
5. Live API Preview, sin Twilio nativo.

---

## 6. Resend (email)

### 6.1 SDK y auth

- **`resend` 6.26.0** (Node ≥20; deps `postal-mime`, `standardwebhooks`; peer opcional `@react-email/render`). Repo `^6.25.0` → subir a `^6.26.0`.
- `new Resend('re_…')`; base `https://api.resend.com`; Bearer.
- API keys: `POST /api-keys { name (≤50), permission: full_access | sending_access, domain_id (solo con sending_access → key restringida a ese dominio) }` → `{ id, token }` (**token visible una sola vez**).

### 6.2 Emails

- `POST /emails`: `from` (req; `"Name <email>"`), `to` (≤50), `subject`, `cc/bcc` (≤50), `reply_to`, `html`, `text` (autogenerado desde html), `react` (Node), `headers`, `scheduled_at` (natural "in 1 min" o ISO; ≤30 días; cancelado no reprogramable), `topic_id`, `attachments[] ({ content Buffer|base64 | path URL, filename, content_type, content_id <128 })`, `tags[] ({ name, value } ASCII ≤256)`, `template { id, variables }`. Límite **40 MB** incluidos adjuntos base64.
- **Idempotency-Key** (≤256 chars, ventana 24 h; misma key + payload distinto → `409 invalid_idempotent_request`). SDK: `resend.emails.send(payload, { idempotencyKey })`. Formato recomendado `<event>/<entity-id>` → D1: `email/{email_message_id}`.
- `GET /emails/{id}` → `{ …, last_event, html, text, scheduled_at, tags }`. `PATCH /emails/{id} { scheduled_at }`. `POST /emails/{id}/cancel`. `GET /emails?limit≤100&after|before`.
- **Batch** `POST /emails/batch`: ≤100; misma forma; `scheduled_at` por email; Idempotency-Key; **sin attachments**; respuesta `{ data: [{ id }] }` en orden. SDK `resend.batch.send([...])`.
- Rate limit **10 req/s por team** (429; headers `ratelimit-limit/remaining/reset`, `retry-after`; `x-resend-daily-quota` (Free), `x-resend-monthly-quota`). Cada destinatario To/CC/BCC cuenta como un email. Umbrales: bounce <4 %, spam <0.08 %.

```ts
import { Resend } from 'resend';
const resend = new Resend(orgKey ?? process.env.RESEND_API_KEY);
const { data, error } = await resend.emails.send({
  from: `${domain.from_name} <${domain.from_email}>`,
  to: [msg.to_email], replyTo: domain.reply_to, subject: msg.subject,          // SDK Node: camelCase (replyTo), no reply_to
  react: BlockEmail({ blocks: template.blocks_json, vars }),           // React Email
  headers: { 'List-Unsubscribe': `<${APP_URL}/u/${unsubToken}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  tags: [{ name: 'tenant_id', value: String(orgId) }, { name: 'related_type', value: 'opportunity' }, { name: 'related_id', value: oppId }],
  attachments: pdf ? [{ filename: 'cotizacion.pdf', content: pdfBuffer }] : undefined,
  scheduledAt: msg.scheduled_at ?? undefined,                                   // SDK Node: scheduledAt (index.d.mts:575,606)
}, { idempotencyKey: `email/${msg.id}` });
```

Nota (tester ANEXO-B r1 #4): la REST API usa `reply_to`/`scheduled_at` (snake_case), pero el SDK `resend` para Node expone `replyTo` y `scheduledAt` en `CreateEmailOptions` (`node_modules/resend/dist/index.d.mts:575,606`). Lo mismo aplica a `apiKeys.create`: en 6.26 el parámetro es `domainId` (camelCase) mientras que los tipos de 6.25 mostraban `domain_id`; F7 fija `resend` en `^6.26.0` y añade un test de contrato que verifica que la clave creada devuelve `data.domain_id` restringido al dominio de la org.

### 6.3 Dominios (por organización, D1)

- `POST /domains { name, region us-east-1|eu-west-1|sa-east-1|ap-northeast-1, custom_return_path ("send"), open_tracking, click_tracking, tracking_subdomain ("links"), tls opportunistic|enforced, capabilities { sending, receiving } }` → `{ id, name, status, region, records[ { record SPF|DKIM|MX|Tracking, name, type, ttl, status, value, priority } ] }`.
- DNS que Resend pide: `send` MX `feedback-smtp.<region>.amazonses.com` prio 10; `send` TXT `v=spf1 include:amazonses.com ~all`; `resend._domainkey` TXT `p=…`; DMARC recomendado `_dmarc` TXT `v=DMARC1; p=none; rua=…`.
- `POST /domains/{id}/verify` (asíncrono; evento `domain.updated`). Estados: `not_started, pending, verified, partially_verified, partially_failed, failed (72 h), temporary_failure`. `PATCH /domains/{id} { open_tracking, click_tracking, tracking_subdomain, tls, capabilities }`. `GET/DELETE`.
- Límite de dominios: Free 3, Pro 10, Scale 1000, add-on +100 por $20/mes. **Recomendado subdominio** (`crm.cliente.com`) para aislar reputación.
- **Domain Claim** (jul-2026): un dominio solo puede estar activo en un team; `POST /domains/claim` → TXT `resend-domain-verification=…` (7 días); `POST /domains/{id}/claim/verify`.

```ts
const domain = await resend.domains.create({ name: `crm.${orgDomain}`, region: 'us-east-1', capabilities: { sending: true, receiving: true } });
await supabase.from('email_domains').insert({ organization_id: orgId, domain: domain.data!.name, provider: 'resend',
  provider_domain_id: domain.data!.id, status: 'pending', dns_records: domain.data!.records, from_email: `ventas@crm.${orgDomain}` });
// … el cliente publica los registros → botón "Verificar":
await resend.domains.verify(domain.data!.id);                       // resultado llega por webhook domain.updated
const key = await resend.apiKeys.create({ name: `org_${orgId}`, permission: 'sending_access', domainId: domain.data!.id });
await saveEncrypted(orgId, 'email', 'resend', { api_key: key.data!.token });   // token solo una vez
```

### 6.4 Webhooks

- Eventos: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.complained`, `email.bounced`, `email.opened`, `email.clicked`, `email.failed`, `email.received`, `email.scheduled`, `email.suppressed`, `domain.created|updated|deleted`, `contact.*`, `suppression.added|removed`.
- Payload `{ type, created_at, data: { email_id, message_id, from, to[], subject, template_id?, bounce { message, subType, type Permanent|Temporary }, click { ipAddress, link, timestamp, userAgent }, tags { key: value } } }` — **`tags` llega como OBJETO**, no array.
- Verificación: headers `svix-id`, `svix-timestamp`, `svix-signature`; **raw body**; `resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret })` (standardwebhooks). Reintentos 8 (inmediato, 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 10 h); responder 200. IPs: 44.228.126.217, 50.112.21.217, 52.24.126.164, 54.148.139.208.
- API: `POST /webhooks { endpoint, events[] }` → `{ id, signing_secret }`; `PATCH { status enabled|disabled }`. Pro 5 endpoints, Scale 10.

```ts
// src/app/api/email/webhook/route.ts (existente; hacer fail-closed)
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const payload = await req.text();
  const event = resend.webhooks.verify({ payload, headers: {
    id: req.headers.get('svix-id')!, timestamp: req.headers.get('svix-timestamp')!, signature: req.headers.get('svix-signature')! },
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET! });          // lanza si la firma es inválida → 400
  const orgId = Number(event.data.tags?.tenant_id);                 // tags es objeto
  if (!orgId) return new Response('missing tenant', { status: 202 });
  await upsertEmailEvent(orgId, event.data.email_id, event.type, event.created_at, event.data);   // provider_event_id = svix-id
  return new Response('ok');
}
```

### 6.5 Tracking

Off por defecto; se activa **por dominio** (`open_tracking` / `click_tracking` + `tracking_subdomain` con CNAME). Recomendado solo para marketing; transaccionales sin tracking (D1). `tracking_subdomain` no se puede quitar después.

### 6.6 Contacts / Segments / Topics / Broadcasts

- Audiences → **Segments** (contactos globales por team). `POST /contacts { email, first_name, last_name, unsubscribed, properties, segments[{ id }], topics[{ id, subscription opt_in|opt_out }] }`. `POST /segments { name }`. `POST /broadcasts { segment_id, from, subject, html|text|react, name, topic_id, send, scheduled_at }` con `{{{contact.first_name|there}}}` y `{{{RESEND_UNSUBSCRIBE_URL}}}`; `POST /broadcasts/{id}/send`.
- Marketing por contactos: Free 1000; Pro $40–650/mes (5k–150k contactos).
- Decisión: las campañas de email del CRM se envían con `emails/batch` desde `campaign_contacts` (control propio de supresión y métricas), no con Broadcasts; Broadcasts queda como opción futura.

### 6.7 Receiving (inbound → hilo en el timeline, D1)

- MX del dominio → evento `email.received` (**solo metadata**) → `GET /emails/receiving/{id}?html_format=data_uri|cid` → `{ html, text, headers, attachments[{ id, filename, content_type, size }], raw { download_url (1 h) } }`. `GET /emails/receiving/{email_id}/attachments/{id}`. `forward()`. Requiere `capabilities.receiving`.
- Enlazar respuesta a `email_messages` por header `In-Reply-To` / `References` contra `provider_message_id` (Message-ID de Resend).

### 6.8 React Email

`@react-email/components` 1.0.12, `@react-email/render` 2.1.0 (`render()` es **async**), `react-email` 6.9.3. Con Resend: `react: EmailTemplate({...})`. El editor de bloques (D1) renderiza `templates.blocks_json` → componentes React Email → `render()` para preview y `react` para envío.

### 6.9 Precios

Free $0: 3 000/mes, 100/día, 3 dominios. **Pro $20 (50k) / $35 (100k)**; overage **$0.90/1k**; 10 dominios; 5 webhooks. Scale $90 (100k) … $1 150 (2.5M); 1000 dominios; 10 webhooks. IP dedicada $30/mes (Scale+). Automations 10k runs incluidos.

### 6.10 Multi-tenant

- **Opción A (recomendada, D1)**: un team, muchos dominios; `domains.create` + `verify` por org; API key `sending_access` + `domain_id` por org (cifrada en `provider_configs`); `tags [{ name: 'tenant_id', value }]` para enrutar webhooks; el webhook global del team recibe todo.
- **Opción B (BYOK)**: cada org trae su propia key/team (aislamiento total de reputación; más fricción; los webhooks deben registrarse en su team apuntando a nuestra URL con secreto propio guardado por org). No hay API de sub-teams.
- Límite práctico: Pro = 10 dominios → con >10 orgs con dominio propio hace falta **Scale** (1000 dominios) o el add-on de dominios.

### 6.11 Gotchas Resend

1. 10 req/s. 2. `tags` llega como objeto. 3. Batch sin adjuntos. 4. Cada destinatario consume cuota; Free 100/día. 5. Idempotency 24 h. 6. Cancelado irreversible. 7. `tracking_subdomain` no se quita. 8. `PATCH` no cambia `custom_return_path`. 9. `temporary_failure` → `failed` en 72 h. 10. Inbound solo metadata; `download_url` 1 h. 11. Token de key una sola vez. 12. Verificar webhooks con raw body.

---

## 7. Meta WhatsApp Cloud API (canal primario, D1)

### 7.1 Envío

- Graph API **v26.0** (jul-2026). `POST https://graph.facebook.com/{v}/{PHONE_NUMBER_ID}/messages`, Bearer token.
- Token permanente: System User con `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`. Multi-tenant: **Business Integration System User token** vía Embedded Signup.
- Respuesta de `/messages`: `{ contacts: [{ input, wa_id }], messages: [{ id, message_status accepted|held_for_quality_assessment|paused }] }`.

Plantilla con parámetros nombrados:

```json
{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "573001234567",
  "type": "template",
  "template": { "name": "confirmacion_demo", "language": { "code": "es" },
    "components": [ { "type": "body", "parameters": [
      { "type": "text", "parameter_name": "nombre", "text": "Laura" },
      { "type": "text", "parameter_name": "fecha", "text": "mañana 10:00" } ] } ] } }
```

- Texto libre: `{ type: "text", text: { body, preview_url } }`. Interactivos: `button` (≤3 botones, título 20, body 1024), `list` (≤10 filas), `cta_url`, `product`, `flow`.
- `parameter_format` `"named" | "positional"` se fija al crear la plantilla.

### 7.2 Plantillas (Business Management API)

- Crear: `POST /{WABA_ID}/message_templates { name ≤512, category authentication|marketing|utility, language, components, parameter_format }` → `{ id, status, category }`; **solo `APPROVED` se envían**.
- Webhook `message_template_status_update`: `value.event APPROVED|REJECTED|PAUSED|DISABLED|PENDING|…`; `reason ABUSIVE_CONTENT|INCORRECT_CATEGORY|INVALID_FORMAT|PROMOTIONAL|SCAM|TAG_CONTENT_MISMATCH|NONE`. Pausado por calidad: 3 h → 6 h → disabled.
- D1: guardar en `templates` con `channel='whatsapp'`, `kind='hsm'`, `metadata { meta_template_id, status, category, language, components, parameter_format }`.

### 7.3 Ventana de 24 h, opt-in y límites

- Ventana de servicio (CSW) de 24 h desde el último mensaje del usuario → texto libre e interactivos; fuera de ella **solo plantillas APPROVED** (regla en `conversations.last_message_at`, D1).
- **Opt-in obligatorio** (número dado por el usuario + permiso explícito); respetar opt-outs → `contact_consents`.
- Messaging limits (usuarios únicos/24 h fuera de CSW): 250 → 2 000 → 10 000 → 100 000 → ilimitado; suben con Business Verification o 2 000 entregados en 30 días con calidad alta; auto-escalado si se usa ≥50 % en 7 días. Consultar `GET /{WABA_ID}?fields=whatsapp_business_manager_messaging_limit`.
- Throughput **80 mps** default (`GET /{PHONE_NUMBER_ID}?fields=throughput`). Rate limit API **5000 req/h por app/WABA**; par negocio-usuario **1 msg/6 s, ráfaga ≤45 en 6 s** (error `131056`).
- Límite de marketing por usuario: error **`131049`** → **no reintentar en 24 h**. Marketing a números de EE. UU. bloqueado.

### 7.4 Webhooks y firma

- Verificación GET: `hub.mode`, `hub.verify_token`, `hub.challenge`. POST con `X-Hub-Signature-256: sha256={HMAC-SHA256(raw body, App Secret)}`. Suscripción por WABA: `POST /{WABA_ID}/subscribed_apps` (`override_callback_uri` por WABA).
- Payload `messages`: `entry[].changes[].value { metadata { display_phone_number, phone_number_id }, contacts[{ profile.name, wa_id }], messages[] | statuses[{ id, status sent|delivered|read|failed, timestamp, recipient_id, conversation { id, origin { type } }, pricing { billable, pricing_model, category } }], errors }`.

```ts
// src/app/api/integrations/whatsapp/webhook/route.ts (existente; hoy sin verificar firma → C3 msg)
import { createHmac, timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const expected = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!).update(raw).digest('hex');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return new Response('bad sig', { status: 403 });
  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    const phoneNumberId = ch.value?.metadata?.phone_number_id;         // → channels/channel_credentials → organization_id
    if (ch.field === 'messages') await enqueueJob('wa_inbound', { phoneNumberId, value: ch.value });
    if (ch.field === 'message_template_status_update') await enqueueJob('wa_template_status', { wabaId: entry.id, value: ch.value });
  }
  return new Response('EVENT_RECEIVED');   // responder 200 rápido; procesar en cola
}
```

### 7.5 Pricing (desde 2025-07-01, por plantilla entregada)

- Non-template (texto libre dentro de CSW): **gratis**. Utility dentro de CSW: **gratis**. Marketing y authentication: **siempre cobrados**. Free Entry Point 72 h (Click-to-WhatsApp): gratis.
- Tarifas CO/MX exactas solo en el CSV oficial de Meta; valores de terceros: **CO marketing ≈ $0.0125, utility ≈ $0.0008; MX marketing ≈ $0.0305, utility ≈ $0.0085** — **NO VERIFICADO**. Cambios trimestrales (día 1 de cada trimestre) → cargar en `provider_pricing` (D6), no hardcodear.
- Vía Twilio: mismo pass-through de Meta + $0.005/msg de Twilio.

### 7.6 Embedded Signup (Tech Provider) — multi-tenant

- `FB.login` con `config_id`, `response_type: 'code'`, `extras.setup`; listener `message` con `WA_EMBEDDED_SIGNUP` `FINISH { phone_number_id, waba_id }`; **el `code` vive 30 s** → `GET /oauth/access_token?client_id&client_secret&code` (token sin expiración por defecto).
- Post-signup: `POST /{PHONE_NUMBER_ID}/register { messaging_product, pin }`; `POST /{WABA_ID}/subscribed_apps`; el cliente añade su propio método de pago.
- Requiere Business Verification + App Review con advanced access. El repo ya tiene `src/app/api/integrations/whatsapp/oauth/callback` (D1: reutilizar).

### 7.7 Gotchas WhatsApp

1. Docs migradas a `/documentation/business-messaging/whatsapp/`. 2. Marketing a EE. UU. bloqueado; `131049` no reintentar 24 h. 3. Agente: utility template para confirmar cita; interactivos (botones/lista) para elegir slot dentro de CSW; texto libre solo con ventana. 4. Firma con raw body y `timingSafeEqual`. 5. Embedded Signup code 30 s. 6. Encolar por `wa_id` (1 msg/6 s).

---

## 8. Agendamiento: Cal.com v2 y Google Calendar (Nivel 2, opcional)

Decisión D1: `book_meeting` Nivel 1 es interno (`calendar_events` + `business_hours` + ICS por Resend + confirmación WhatsApp utility). Lo siguiente aplica al Nivel 2.

### 8.1 Cal.com API v2

- Base `https://api.cal.com/v2`; Bearer `cal_live_…` o token de managed user (60 min; refresh 1 año); OAuth client headers `x-cal-client-id` + `x-cal-secret-key`. Rate 120 req/min.
- **Header `cal-api-version: 2026-02-25` obligatorio en bookings**; slots `2024-09-04`.
- Slots: `GET /v2/slots?start&end&eventTypeId|eventTypeSlug+username&timeZone&duration` → `{ data: { "2026-09-10": [{ start, end }] } }`.
- Crear: `POST /v2/bookings { start (UTC), eventTypeId, attendee: { name, email, timeZone, phoneNumber, language: "es" }, guests[], metadata (≤50 keys), bookingFieldsResponses, lengthInMinutes, location: { type: "integration", integration: "google-meet" } }` → 201 `{ data: { id, uid, status accepted|pending, start, end, hosts[], attendees[], location } }`. Reschedule `POST /v2/bookings/{uid}/reschedule { start }`; cancel `POST /v2/bookings/{uid}/cancel { cancellationReason }`. `meetingUrl` deprecado → `location`.
- Webhooks: `POST /v2/webhooks { subscriberUrl, triggers [BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, MEETING_STARTED, MEETING_ENDED…], secret }`; firma `x-cal-signature-256` HMAC-SHA256 del raw body.
- Managed users: `POST /v2/oauth-clients/{clientId}/users { email, name, timeZone }` → `{ accessToken, refreshToken }`.
- Pricing: Teams $12/usuario/mes; Organizations $28; Platform (managed users) no publicado (terceros: Essentials $299/mes/500 bookings) — **NO VERIFICADO**.

```ts
const res = await fetch('https://api.cal.com/v2/bookings', {
  method: 'POST',
  headers: { Authorization: `Bearer ${calKey}`, 'cal-api-version': '2026-02-25', 'Content-Type': 'application/json' },
  body: JSON.stringify({ start: slotStartUtc, eventTypeId, lengthInMinutes: 30,
    attendee: { name: customer.full_name, email: customer.email, phoneNumber: customer.phone, timeZone: 'America/Bogota', language: 'es' },
    metadata: { organization_id: String(orgId), opportunity_id: oppId },
    location: { type: 'integration', integration: 'google-meet' } }),
});
```

### 8.2 Google Calendar API

- `POST /calendar/v3/calendars/{calendarId}/events?conferenceDataVersion=1&sendUpdates=all` con `conferenceData.createRequest { requestId, conferenceSolutionKey { type: "hangoutsMeet" } }` → `hangoutLink`; `attendees[{ email, displayName }]`. FreeBusy: `POST /freeBusy { timeMin, timeMax, items[{ id }] }`.
- Scope `calendar.events` es **Sensitive** → verificación OAuth de Google (3–5 días; privacy policy; video). En modo Testing el refresh token **expira a los 7 días**. Quota 600 req/min/usuario. `googleapis` npm 178.1.1.

---

## 9. Cierre: tablas consolidadas

### 9.1 Tarea → proveedor primario + modelo/endpoint + precio + alternativa (alineado con D1)

| Tarea | Primario | Modelo / endpoint exacto | Precio | Alternativa(s) |
|---|---|---|---|---|
| Llamada desde navegador/Electron | Twilio Voice JS SDK | `@twilio/voice-sdk` `Device.connect` + TwiML App `<Dial><Number>` | $0.004/min SDK + PSTN CO móvil $0.0377 / fijo $0.07 | — |
| Llamada desde el celular del vendedor | Twilio bridge 2 patas | `calls.create` → `<Dial answerOnBridge record="record-from-answer-dual"><Number>` | 2 patas PSTN + grabación | `@capgo/capacitor-twilio-voice` 8.2.12 (nativo) |
| Llamada entrante a número de la org | Twilio | `<Dial><Client>identity</Client></Dial>` / bridge al celular | $0.0945/min + $14/mes número CO | — |
| Grabación | Twilio | `record-from-answer-dual` / `recordingChannels:'dual'`; `GET /Recordings/{Sid}.wav?RequestedChannels=2` (Basic Auth) | $0.0025/min + $0.0005/min/mes | — |
| Aviso de consentimiento | Twilio `<Say>` | `language="es-MX" voice="Polly.Mia-Neural"` | Neural $0.0032/100 chars | `es-US` `Polly.Lupe-Neural` |
| Transcripción diarizada | ElevenLabs Scribe v2 | `POST /v1/speech-to-text` `model_id=scribe_v2`, `language_code=spa`, `diarize`, `timestamps_granularity=word`, `webhook` | $0.22/h ($0.0037/min) | Gemini 2.5 Flash audio ($1.00/1M tok ≈ $0.0019/min); OpenAI `gpt-transcribe` $0.0045/min (sin diarización) |
| Análisis de llamada (resumen, sentimiento, next steps, calidad) | Gemini 2.5 Flash | `generateContent` + `responseSchema` (existente) / Interactions `response_format` | $0.30 / $2.50 por 1M tok | OpenAI `gpt-5.6-luna` + `zodTextFormat` ($0.20 / $1.20) |
| Agente de voz (motor primario) | Twilio ConversationRelay | `<Connect><ConversationRelay ttsProvider="ElevenLabs" voice="{voice_id}-flash_v2_5" transcriptionProvider="Deepgram" speechModel="nova-3-general">` + LLM en ws-server | $0.07/min + PSTN + LLM | ElevenAgents `POST /v1/convai/twilio/outbound-call` ($0.08/min + LLM + PSTN) |
| LLM del agente de voz | OpenAI | `gpt-5.6-terra` Responses (streaming) | $2 / $12 por 1M tok | `gemini-3.8-flash` ($0.75 / $3.75 promo); `gpt-5.6-luna` para tareas baratas |
| Voz clonada del vendedor | ElevenLabs IVC | `POST /v1/voices/add` (`client.voices.ivc.create`) | Plan Starter+ (créditos) | PVC `POST /v1/voices/pvc` (solo voz propia verificada) |
| Agente de voz (experimental) | OpenAI Realtime | `gpt-realtime-2.1` vía SIP `sip:$PROJECT_ID@sip.api.openai.com` + Twilio Elastic SIP Trunking | ≈ $0.10/min (D8) | Gemini Live `gemini-3.1-flash-live-preview` (sin Twilio nativo) |
| Redacción de email/WhatsApp con IA | OpenAI | `gpt-5.6-luna` Responses `reasoning.effort:'none'` | ≈ $0.001 por borrador | `gemini-2.5-flash-lite` ($0.10 / $0.40) |
| Email transaccional/comercial | Resend | `POST /emails` (`resend.emails.send` + `idempotencyKey`), `react` con React Email | Pro $20/50k ($0.0004/email); overage $0.90/1k | — |
| Email masivo (campañas) | Resend | `POST /emails/batch` (≤100, sin adjuntos) | idem | Broadcasts + Segments (futuro) |
| Dominio de email por org | Resend | `POST /domains`, `POST /domains/{id}/verify`, `POST /api-keys` `sending_access`+`domain_id` | Pro 10 dominios; Scale 1000 | BYOK (Opción B) |
| Email inbound (respuestas) | Resend Receiving | `email.received` → `GET /emails/receiving/{id}` | incluido | — |
| WhatsApp individual (dentro de 24 h) | Meta Cloud API | `POST /{PHONE_NUMBER_ID}/messages` `type:text|interactive` | gratis (CSW) | Twilio WA (+$0.005), Evolution/QR |
| WhatsApp fuera de ventana / masivo | Meta Cloud API | `type:template` (plantilla APPROVED) | utility CO ≈ $0.0008, marketing ≈ $0.0125 (NO VERIFICADO) | Twilio Content API `contentSid` |
| Plantillas HSM | Meta Business Management | `POST /{WABA_ID}/message_templates` + webhook `message_template_status_update` | — | Twilio Content API `POST /v1/Content` + `/ApprovalRequests/whatsapp` |
| SMS (secundario) | Twilio Messaging Service | `messages.create({ messagingServiceSid, … })` con Advanced Opt-Out | CO $0.0592/segmento | — |
| Agendar reunión (Nivel 1) | Interno + Resend + Meta | `calendar_events` + ICS adjunto + plantilla utility | costo del email/WA | Cal.com `POST /v2/bookings` (`cal-api-version: 2026-02-25`); Google Calendar `events.insert` + Meet |

### 9.2 Estimación de costo por unidad (USD, lista; sin impuestos)

| Unidad | Desglose | Total aprox. |
|---|---|---|
| Llamada de **6 min desde navegador** a móvil CO, grabada | SDK 6×$0.004 = $0.024 · PSTN móvil 6×$0.0377 = $0.226 · grabación 6×$0.0025 = $0.015 · storage $0.003/mes | **≈ $0.27** (+ $0.003/mes) |
| Llamada **bridge de 6 min** (celular del vendedor + cliente, ambos móvil CO) | 2 patas × 6 × $0.0377 = $0.452 · grabación $0.015 · storage $0.003/mes | **≈ $0.47** |
| **Transcripción + análisis** de 6 min | Scribe v2 6/60×$0.22 = $0.022 · análisis Gemini 2.5 Flash (~3K tok in + 0.7K out ≈ $0.003, estimación) | **≈ $0.025** (fallback Gemini audio: 11 520 tok × $1.00/1M = $0.012 + análisis; OpenAI gpt-transcribe: $0.027) |
| **Agente IA 3 min — ConversationRelay** (motor primario) | CR 3×$0.07 = $0.21 · PSTN móvil 3×$0.0377 = $0.113 · grabación $0.0075 · LLM gpt-5.6-terra ~25K tok in acumulados + 1.2K out ≈ $0.064 (estimación; con prompt caching baja a ≈ $0.02) · TTS ElevenLabs dentro de CR: NO VERIFICADO (asumido incluido) | **≈ $0.39** (≈ $0.35 con caching) |
| **Agente IA 3 min — ElevenAgents** | Overage 3×$0.08 = $0.24 · LLM pass-through ≈ $0.05 · PSTN 3×$0.0377 = $0.113 | **≈ $0.40** (menos si hay minutos incluidos en el plan) |
| **Agente IA 3 min — OpenAI Realtime 2.1** (experimental) | ≈ $0.10/min × 3 = $0.30 (D8) · PSTN $0.113 · Elastic SIP Trunking: NO VERIFICADO | **≈ $0.41+** |
| **Agente IA 3 min — Gemini Live** (experimental) | audio in 3×$0.005 = $0.015 · audio out 3×$0.018 = $0.054 · PSTN $0.113 · puente Media Streams propio (cómputo Railway) | **≈ $0.18+** |
| **Email** | Resend Pro $20/50k = $0.0004; overage $0.90/1k = $0.0009 | **$0.0004–0.0009** |
| **WhatsApp utility CO** (fuera de CSW) | Meta ≈ $0.0008 (NO VERIFICADO); vía Twilio +$0.005 | **≈ $0.0008** (≈ $0.0058 vía Twilio) |
| **WhatsApp marketing CO** | Meta ≈ $0.0125 (NO VERIFICADO); vía Twilio +$0.005 | **≈ $0.0125** (≈ $0.0175 vía Twilio) |
| **WhatsApp dentro de CSW** (texto/interactivo) | Meta gratis; vía Twilio $0.005 | **$0 / $0.005** |
| **SMS CO** | Twilio $0.0592/segmento | **$0.0592** |

Estos valores se cargan en `provider_pricing` (D6) y alimentan `deduct_comm_credits` / `decrement_ai_credits` antes de cada llamada a proveedor.

### 9.3 Variables de entorno por proveedor (propósito y dónde viven)

Leyenda: **V** = Vercel (Next.js), **R** = Railway (ws-server), **PC** = `provider_configs.credentials` por organización (cifrado; sobreescribe el env). Estado: existente = ya se lee en el repo; NUEVA = a crear.

| Variable | Proveedor | Propósito | Vive en | Estado |
|---|---|---|---|---|
| `TWILIO_MASTER_ACCOUNT_SID` | Twilio | AccountSid de la cuenta master | V, R | existente |
| `TWILIO_MASTER_AUTH_TOKEN` | Twilio | Validar `X-Twilio-Signature` (master) | V, R | existente |
| `TWILIO_API_KEY` / `TWILIO_API_SECRET` | Twilio | Cliente REST, AccessToken del SDK, Basic Auth de grabaciones | V, R | **existente por nombre** (`.env.example:91-92`; `voiceTokenService.ts:44-45` las lee de `provider.credentials`), **ausente en `.env.local`/Vercel** → C1. Reutilizar estos nombres; NO crear `TWILIO_API_KEY_SID`/`_SECRET` |
| `TWILIO_TWIML_APP_SID` | Twilio | `outgoingApplicationSid` del VoiceGrant (fallback global; por org en `comm_settings.voice_twiml_app_sid`, columna existente con **0 usos en `src`** → uso NUEVO en F3) | V | existente por nombre (`.env.example:93`; `voiceTokenService.ts:46`), ausente en `.env.local` |
| `TWILIO_PUSH_CREDENTIAL_SID_IOS` / `TWILIO_PUSH_CREDENTIAL_SID_ANDROID` | Twilio | `pushCredentialSid` del VoiceGrant para notificaciones de entrantes en apps nativas (solo si F15 adopta el plugin nativo) | V | existente por nombre (`.env.example:98-99`), sin lectores en `src` |
| `TWILIO_WEBHOOK_BASE_URL` | Twilio | URL pública exacta para reconstruir la URL firmada | V | existente (C2: unificar valor) |
| `TWILIO_PHONE_NUMBER` | Twilio | Caller ID global de fallback | V | existente |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio | SMS con Advanced Opt-Out y scheduling | V | NUEVA (en `.env.example` desde r1; fallback env de `sms`) |
| `TWILIO_WHATSAPP_NUMBER` | Twilio | Sender WA fallback (`whatsapp:+…`) | V | existente |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio | Verify (fuera de alcance CRM) | V | existente |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio | Legacy duplicados → eliminar tras migrar a `*_MASTER_*` | V | existente (deprecar) |
| `comm_settings.twilio_subaccount_sid` / `twilio_subaccount_auth_token` | Twilio | Subcuenta por org (opcional) | BD (cifrar) | existente |
| `WS_SERVER_URL` | ws-server | Host `wss://` del ConversationRelay | V | existente |
| `WS_SESSION_SECRET` | ws-server | Firmar el token por sesión de `<Parameter>` | V, R | NUEVA (en `.env.example` desde r1; junto con `WS_PUBLIC_URL` para el ws-server) |
| `ELEVENLABS_API_KEY` | ElevenLabs | TTS, IVC/PVC, Scribe, Agents | V, R, PC | existente |
| `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs | `webhooks.constructEvent` (Scribe async + post-call) | V | NUEVA (en `.env.example` desde r1) |
| `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` | ElevenLabs | Voz/modelo por defecto si la org no tiene `voices` | V, R | `ELEVENLABS_MODEL` existente, valor `eleven_flash_v2_5` en `.env.example` (r1); lo lee `providerRegistry.defaultSettings('tts')`. `ELEVENLABS_VOICE_ID` eliminada de `.env.example` (la voz es por org) |
| `DEEPGRAM_API_KEY` / `DEEPGRAM_MODEL` | Deepgram | STT de grabaciones **hoy vivo**: `transcriptionService.ts:95-110` llama a Deepgram `nova-2` (`:101`, `:477`) como proveedor primario; `.env.example:107` dice `DEEPGRAM_MODEL=nova-3` pero el código fija `nova-2` (la variable no se lee para el modelo). Con ConversationRelay el STT de la llamada en vivo lo pone Twilio (`nova-3-general`), no este código | V, R | existente; **se reemplaza por Scribe v2 en F4. No borrar antes de migrar** (tester ANEXO-B r1 #2) |
| `ELEVENLABS_SCRIBE_MODEL` | ElevenLabs | Modelo STT (`scribe_v2`) para F4 | V | existente por nombre (`.env.example:113`), sin lectores en `src` (el código fija `scribe_v1` en `transcriptionService.ts:243-247,477`) |
| `OPENAI_API_KEY` | OpenAI | Responses (análisis, redacción, cerebro del agente) | V, R, PC | existente |
| `OPENAI_MODEL` / `OPENAI_CHAT_MODEL` | OpenAI | Default → `gpt-5.6-luna` (tareas) | V, R | existente; `OPENAI_MODEL=gpt-5.6-luna` en `.env.example` (r1) y es la variable que lee `providerRegistry` para `llm.model`/`cheap_model`. `OPENAI_CHAT_MODEL` no se usa. Nuevas en r1: `OPENAI_CHEAP_MODEL`, `OPENAI_CONVERSATION_MODEL=gpt-5.6-terra`, `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe` |
| `OPENAI_VOICE_AGENT_MODEL` | OpenAI | Default del cerebro del agente → `gpt-5.6-terra` | R | NUEVA |
| `OPENAI_REALTIME_MODEL` | OpenAI | Experimental → `gpt-realtime-2.1` | R | existente (valor roto: `gpt-4o-realtime-preview`) |
| `OPENAI_WEBHOOK_SECRET` | OpenAI | Solo si se usa SIP connector (`realtime.call.incoming`) | V | NUEVA (experimental) |
| `GOOGLE_AI_API_KEY` | Google | Análisis de llamadas, fallback STT, alternativa LLM. **Es la variable que el repo lee hoy**: `callAnalysisService.ts:397-400`, `providerRegistry.ts:24`, `.env.example:120`, presente en `.env.local`. `GEMINI_API_KEY` solo existe como **clave dentro de `provider_configs.credentials`** (`callAnalysisService.ts:398`) para BYOK por org | V, R, PC | existente. **Decisión**: el env de plataforma se llama `GOOGLE_AI_API_KEY` (no se renombra); la credencial por org en `provider_configs(llm\|analysis, google).credentials` se llama `GEMINI_API_KEY`; `providerRegistry` mapea una a otra. `PLAN.md` §4.8 corregido en consecuencia (tester ANEXO-B r1 #1) |
| `RESEND_API_KEY` | Resend | Key `full_access` del team (dominios, api keys, webhooks, fallback de envío) | V | existente |
| `RESEND_WEBHOOK_SECRET` | Resend | `webhooks.verify` (svix) | V | existente |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | Resend | Remitente global de fallback (dominio de GoAdmin) | V | existente |
| `provider_configs(email,resend).credentials.RESEND_API_KEY` | Resend | Key `sending_access` por org (`domain_id` en `settings`); las claves de `provider_configs.credentials` usan los MISMOS nombres que las variables de entorno (`CREDENTIAL_FIELDS` en `src/lib/crm/providerCatalog.ts`) | PC | NUEVA (r1: escritura vía `PUT /api/crm/config/providers`) |
| `META_APP_ID` / `META_APP_SECRET` | Meta | Embedded Signup, firma `X-Hub-Signature-256` | V | existente |
| `META_WEBHOOK_VERIFY_TOKEN` (y alias `WHATSAPP_VERIFY_TOKEN`) | Meta | `hub.verify_token` | V | existente (unificar en uno) |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Meta | `config_id` del `FB.login` | V | NUEVA (en `.env.example` desde r1) |
| `channel_credentials.credentials { access_token, phone_number_id, waba_id }` | Meta | Token de sistema por org (Embedded Signup) | BD (cifrar) | existente |
| `CALCOM_API_KEY` | Cal.com | Nivel 2 (opcional) | V, PC | existente |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar | Nivel 2 (OAuth por vendedor) | V | NUEVA (opcional) |
| `CRON_SECRET` | pg_cron/pg_net → `/api/crm/jobs/run` | Bearer del job runner (fail-closed) | V (+ `vault` en Postgres para `net.http_post`) | existente |
| `NEXT_PUBLIC_APP_URL` | app | Base para links de baja, ICS, callbacks | V | existente |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Webhooks y jobs (nunca en cliente) | V, R | existente |
| `PROVIDER_SECRETS_KEY` | app | Clave AES para cifrar `provider_configs.credentials` (si no se usa `vault`) | V, R | NO usada en r1: las credenciales se guardan en claro en `provider_configs.credentials` (columna sin SELECT para `authenticated`; único lector `providerCredentials.server.ts` con service role). Vault/AES queda para el PR-05 |

### 9.4 Versiones npm objetivo y requisitos de Node

| Paquete | Repo hoy | Objetivo | Node mínimo | Notas |
|---|---|---|---|---|
| Node runtime | **r1:** engines `>=20.0.0`; Railway `node:20-slim` | Node 22 en PR separado (ver FASE-00 §4.7) | — | Decisión r1: quedarse en Node 20 + `openai` 6.x; Node 22 exige cambiar engines, Dockerfile y runtime de Vercel a la vez |
| `twilio` | **r1: `^6.1.0` (6.1.0 instalado)** | `^6.1.0` | ≥20 | v6 desde abril 2026; `tsc` sin errores nuevos en `voice/call`, `voiceTokenService`, `twilioConfig`, `twilioWebhook` |
| `@twilio/voice-sdk` | **r1: `^2.18.4`** | `^2.18.4` | — (browser) | Electron ok; PWA/WebView no soportado |
| `@capgo/capacitor-twilio-voice` | — | `^8.2.12` | Capacitor ≥8 | Solo si se implementa softphone nativo |
| `@elevenlabs/elevenlabs-js` | **r1: `^2.67.0` (2.67.0)** | `^2.67.0` | ≥15 | Reemplaza paquete `elevenlabs` deprecado; verificado en `node_modules`: `client.user.subscription.get()` (`tier`, `characterCount`, `characterLimit`), `client.voices.search({ pageSize })` |
| `@elevenlabs/client` / `@elevenlabs/react` | — | `^1.25.0` / `^1.15.2` | browser | Simulador de agente en `/app/crm/agentes-ia` (opcional) |
| `openai` | `^6.15.0` (**se mantiene en r1**) | `^7.10.0` en el PR Node 22 | **≥22** | peer opcional `ws ^8.21`, `zod ^3.25 \|\| ^4`; `client.models.list()` verificado para la prueba de conexión |
| `@google/genai` | **r1: `^2.21.0` (2.21.0)** | `^2.21.0` (**no** 3.x aún) | ≥20 | 3.x exigirá Node 22; verificado: `ai.models.list({ config: { pageSize } })` devuelve un `Pager` async-iterable |
| `resend` | **r1: `^6.26.0` (6.26.0)** | `^6.26.0` | ≥20 | deps `standardwebhooks`, `postal-mime`; `domains.list()` verificado; tipos 6.26: `ListDomainsResponse`, `domainId?: string[]` en `CreateApiKeyOptions` (tester #4) |
| `react-email` | `^6.9.3` | `^6.9.3` | — | CLI/preview |
| `@react-email/components` | **r1: `^1.0.12`** (npm marca los subpaquetes `@react-email/*` 0.x como deprecados: son avisos del monorepo, no bloquean) | `^1.0.12` | — | Bloques del editor |
| `@react-email/render` | **r1: `^2.1.0`** | `^2.1.0` | — | `render()` async |
| `googleapis` | — | `^178.1.1` | — | Solo Nivel 2 |
| `ws` | `^8.19.0` | `^8.21.0` | — | ws-server + peer de openai |
| `zod` | `^3.25.67` | `^3.25.67` (o 4.x) | — | `zodTextFormat` |
| `sanitize-html` + `@types/sanitize-html` | **r1: `^2.17.7`** | — | — | Sanear HTML de plantillas/emails (F7) |
| `next` / `react` | `15.5.7` / `^19` | sin cambio | — | |

### 9.5 Webhooks entrantes (proveedor → ruta en la app → verificación → eventos)

| Proveedor | Ruta en la app | Verificación (fail-closed) | Eventos / payload | Estado |
|---|---|---|---|---|
| Twilio Voice status | `POST /api/voice/status` | `validateRequest(authToken de la (sub)cuenta por AccountSid, X-Twilio-Signature, TWILIO_WEBHOOK_BASE_URL+path, params)` | `CallStatus`, `CallDuration`, `AnsweredBy`, `SequenceNumber` | existente (corregir C0/C2) |
| Twilio Voice recording | `POST /api/voice/recording` | idem | `RecordingStatus completed\|absent`, `RecordingSid`, `RecordingChannels`, `RecordingDuration` | existente (C3–C8) |
| Twilio TwiML App (browser) | `POST /api/voice/twiml/outbound` | idem (incluye `CallToken`) | `From=client:…`, `To`, params custom | existente |
| Twilio inbound voice | `POST /api/voice/twiml/inbound` | idem | `From`, `To`, `CallSid` | existente |
| Twilio bridge patas | `POST /api/voice/twiml/agent-leg`, `/customer-leg`, `POST /api/voice/bridge/status` | idem | `DialCallStatus`, `DialCallSid`, `DialBridged` | existente (`es-CO` también aparece 6 veces en `twiml/agent-leg/route.ts` → corregir a `es-MX` en F5) |
| Twilio inbound voice (legacy) | `POST /api/integrations/twilio/voice/incoming` | firma solo en producción (`:33`); org por `comm_settings.phone_number` con fallback "primera org activa" (`:131-140`) | `From`, `To`, `CallSid` | existente, **duplica** `/api/voice/twiml/inbound` → F0 lo deja como `<Redirect>` y F3 lo elimina (tester ANEXO-B r1 #7) |
| Twilio Media Streams (legacy) | `GET /api/integrations/twilio/voice/media-stream` | — | responde HTTP 410 | existente, código muerto → **eliminar** en F0/F6 (tester ANEXO-B r1 #7) |
| Twilio ConversationRelay TwiML | `POST /api/voice/twiml/ai-agent` | idem; corregir `es-CO` | genera `<ConversationRelay>` | existente |
| Twilio ConversationRelay WS | `wss://ws.goadmin.io/conversation-relay` (Railway) | `X-Twilio-Signature` en el `upgrade` + token de sesión en `<Parameter>` | `setup`, `prompt`, `interrupt`, `dtmf`, `error` | existente (sin auth → **C22 voz**, `ws-server.ts:41-48`; tester ANEXO-B r1 #6) |
| Twilio ConversationRelay action | `POST /api/voice/relay/after` | `validateRequest` | `SessionStatus`, `SessionDuration`, `HandoffData`, `ErrorCode` | NUEVA |
| Twilio Messaging status | `POST /api/integrations/twilio/status-callback` | `validateRequest` | `MessageStatus`, `ErrorCode`, `EventType READ` | existente |
| Twilio Messaging inbound (SMS/WA) | `POST /api/integrations/twilio/incoming-message` | `validateRequest` | `Body`, `From`, `WaId`, `OptOutType`, `ButtonPayload` | existente |
| ElevenLabs (Scribe async + Agents post-call) | `POST /api/webhooks/elevenlabs` | `client.webhooks.constructEvent(rawBody, ElevenLabs-Signature, secret)` | `speech_to_text_transcription`, `post_call_transcription`, `post_call_audio`, `call_initiation_failure` | NUEVA |
| ElevenAgents inbound personalization | `POST /api/webhooks/elevenlabs/init` | secreto compartido en header + allowlist | `{ caller_id, agent_id, called_number, call_sid }` → responder `conversation_initiation_client_data` | NUEVA (solo motor secundario) |
| OpenAI Realtime SIP | `POST /api/webhooks/openai` | `client.webhooks.unwrap(rawBody, headers)` | `realtime.call.incoming { call_id }` | NUEVA (experimental) |
| Resend | `POST /api/email/webhook` | `resend.webhooks.verify` (svix-id/timestamp/signature, raw body) | `email.*`, `domain.updated`, `suppression.*` | existente (revisar fail-closed) |
| Meta WhatsApp | `GET/POST /api/integrations/whatsapp/webhook` | `hub.verify_token`; `X-Hub-Signature-256` HMAC-SHA256(App Secret) `timingSafeEqual` | `messages`, `statuses`, `message_template_status_update`, `account_update` | existente (sin firma → C3 msg) |
| Meta Embedded Signup | `GET /api/integrations/whatsapp/oauth/callback` | `code` (30 s) → `GET /oauth/access_token` | `phone_number_id`, `waba_id` | existente |
| Cal.com | `POST /api/webhooks/calcom` | `x-cal-signature-256` HMAC-SHA256(raw body, secret) | `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED` | NUEVA (Nivel 2) |
| pg_cron → job runner | `POST /api/crm/jobs/run` | `Authorization: Bearer CRON_SECRET` (401 si falta) | drena `outbound_jobs` | NUEVA (D3) |

Regla transversal (D7): leer **siempre** `await req.text()` antes de parsear, `export const runtime = 'nodejs'`, resolver la organización a partir de identificadores del payload (`AccountSid`, `phone_number_id`, `tags.tenant_id`, `agent_id`) con `resolveOrgFromExternal` reparado (service role), y responder 2xx solo después de encolar.

### 9.6 Deprecaciones con fecha que afectan al repo

| Fecha | Proveedor | Qué | Impacto en el repo | Acción |
|---|---|---|---|---|
| **2026-05-07 (ya ocurrió)** | OpenAI | `gpt-4o-realtime-preview` apagado | `OPENAI_REALTIME_MODEL` y `voiceAgent/realtimeSession.ts` rotos | Cambiar a `gpt-realtime-2.1` (experimental) o eliminar código muerto |
| **2026-09-01 (ya ocurrió)** | Twilio | WhatsApp Senders API v1 deprecada | Cualquier onboarding de sender WA por Twilio | Usar `client.messaging.v2.channelsSenders` |
| ya vigente | ElevenLabs | `eleven_turbo_v2_5` / `eleven_turbo_v2` deprecados | `voiceAgent/elevenLabsTTS.ts` y `ELEVENLABS_MODEL` | `eleven_flash_v2_5` (o `eleven_v3_conversational`) |
| ya vigente | ElevenLabs | paquete npm `elevenlabs` deprecado; `cloud_storage_url` → `source_url` | Si se adopta SDK | Usar `@elevenlabs/elevenlabs-js` |
| ya vigente | Cal.com | `meetingUrl` deprecado → `location`; versión `2026-02-25` | Ninguno hoy (no hay integración) | Usar header y campo nuevos |
| ya vigente | Resend | Audiences → Contacts/Segments/Topics | Ninguno (no se usaba) | Documentado |
| **2026-10-23** | OpenAI | `gpt-4.1-nano` se apaga | Verificar usos en `ai-assistant/*` | Migrar a `gpt-5.6-luna` |
| **2026-12-11** | OpenAI | `gpt-5-2025-08-07` y `o3` se apagan | Verificar usos | Migrar a familia 5.6 |
| **2026-12-31** | Google | Fin del precio promocional de `gemini-3.8-flash` ($0.75/$3.75 → $1.50/$7.50) | `provider_pricing` | Actualizar tarifa en 2027 |
| **2027-01-20** | OpenAI | `gpt-realtime`, `gpt-realtime-mini`, `gpt-4o-realtime*`, `gpt-audio`, `gpt-4o-audio` se apagan | Código Realtime experimental | Usar solo `gpt-realtime-2.x` |
| **2027-02-26** | OpenAI | `whisper-1` y toda la familia `gpt-4o-*transcribe*` (incl. `-diarize`) se apagan | `whisper-1` está en `voiceAgent/realtimeSession.ts:104`, `api/crm/transcribe/route.ts:205,220` y `api/ai-assistant/transcribe/route.ts:106` (**no** en `transcriptionService.ts`, que usa Deepgram/ElevenLabs) | STT primario Scribe v2; fallback OpenAI solo `gpt-transcribe`; `crm/transcribe` se retira en F4 y `realtimeSession.ts` en F0 |
| sin fecha (legacy) | OpenAI | `gpt-4o` / `gpt-4o-mini` legacy | Usados hoy en análisis/redacción | Migrar a `gpt-5.6-luna` |
| trimestral (día 1) | Meta | Cambios de tarifas WhatsApp por país | `provider_pricing` | Job trimestral de revisión manual |
| `@google/genai` 3.0 (sin fecha) | Google | Exigirá Node 22 | Pin `^2.21.0` | Subir cuando Node 22 esté en ambos runtimes |

---

## 10. Lo que NO es posible o NO se hará (documentar, no prometer)

1. Grabar llamadas celulares nativas → por eso existe el modo **bridge** de 2 patas. Justificación técnica **NO VERIFICADA** en esta ronda (afirmación habitual: iOS no expone el audio de la llamada; Android restringe `MediaRecorder.AudioSource.VOICE_CALL` a apps del sistema); no citar como hecho hasta contrastarla con la documentación de Apple/Android (tester ANEXO-B r1 #10). La decisión de diseño (bridge) se sostiene igualmente porque la grabación ocurre en Twilio, no en el dispositivo.
2. `<Say>` / `<ConversationRelay language>` con `es-CO`: no existe; usar `es-MX` o `es-US`.
3. OpenAI Realtime con número PSTN propio: siempre requiere Twilio (SIP trunk o Media Streams).
4. Gemini Live con Twilio sin puente propio: no hay integración nativa.
5. Clonar la voz de terceros en ElevenLabs: prohibido por términos incluso con consentimiento (PVC solo voz propia).
6. Crear teams de Resend por API: no existe; solo dominios y API keys (Opción A).
7. Transcribir con `<Record transcribe>` de Twilio en español: solo en-US.
8. Enviar WhatsApp marketing a números de EE. UU.: bloqueado por Meta.
9. Usar el free tier de Gemini con datos de clientes: el contenido se usa para mejorar productos.
10. Voces de OpenAI TTS para el agente en español: optimizadas para inglés; el TTS del agente es ElevenLabs.
