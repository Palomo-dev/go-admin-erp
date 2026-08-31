# ANEXO B — Proveedores y APIs: documentación condensada y decisiones

> Investigación realizada el 2026-08-31 contra documentación oficial.
> Los precios son orientativos y deben revalidarse antes de contratar.
> Este anexo es la **fuente de verdad técnica** para todas las fases. Si una fase contradice
> este anexo, gana el anexo (o se actualiza el anexo con evidencia nueva).

---

## 1. Twilio

### 1.1 Voice JavaScript SDK — Web / PWA / Electron

Paquete: **`@twilio/voice-sdk`**

| Operación | API exacta |
|---|---|
| Instanciar | `const device = new Device(token, options?)` |
| Registrar | `await device.register()` |
| Llamada saliente | `const call = await device.connect({ params: { To: '+57...' } })` |
| Llamada entrante | `device.on('incoming', (call) => call.accept())` |
| Colgar | `call.disconnect()` / `device.disconnectAll()` |
| Renovar token | `device.updateToken(token)` |
| Mute | `call.mute(true)` |
| DTMF | `call.sendDigits('123')` |

```ts
import { Device } from '@twilio/voice-sdk';

const device = new Device(token, { logLevel: 1, codecPreferences: ['opus', 'pcmu'] });
await device.register();

const call = await device.connect({
  params: { To: '+573001234567', opportunityId, organizationId: String(orgId) },
});
call.on('disconnect', () => { /* ... */ });
```

**Token en el backend (Node):**

```ts
import twilio from 'twilio';
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

const voiceGrant = new VoiceGrant({
  outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID!, // obligatorio
  incomingAllow: true,
  pushCredentialSid: pushSid, // opcional, para móvil
});

const token = new AccessToken(accountSid, apiKey, apiSecret, {
  identity: `org${orgId}_user${userId}`, // alfanumérico + underscore, ≤64 chars
  ttl: 3600,
});
token.addGrant(voiceGrant);
return token.toJwt();
```

Reglas duras:
- `outgoingApplicationSid` es **obligatorio** en el `VoiceGrant`.
- `identity` solo alfanumérico y `_`, máximo 64 caracteres.
- El `Device` **no marca directamente**: envía `params` a la `VoiceUrl` de la TwiML App y el backend responde con `<Dial>`.
- Máximo **10 dispositivos registrados por `identity`**.
- Requiere HTTPS y permiso de micrófono (`getUserMedia`).

### 1.2 Capacitor / móvil nativo

| Opción | Detalle |
|---|---|
| **Oficial React Native** | `@twilio/voice-react-native-sdk` — clase `Voice`, `voice.register(token)`, `voice.connect(token, { params })`, evento `callInvite`. **No es Capacitor.** |
| **Plan A (recomendado)** | Plugin de Capacitor propio que envuelve `TwilioVoice` (iOS, CocoaPods) y `com.twilio:voice-android` (Android). |
| **Plan B** | `@capgo/capacitor-twilio-voice` — comunitario, iOS 13+, Android API 23+, **Web ❌**. |
| **Plan C (siempre disponible)** | Modo **bridge** (click-to-call de 2 patas): no requiere ningún SDK en el dispositivo. |

Requisitos nativos: iOS → certificado VoIP de Apple + Push Credential en Twilio + `PKPushRegistry`. Android → FCM (`google-services.json`) + Push Credential.

### 1.3 Grabación

```xml
<Response>
  <Say language="es-MX">Esta llamada será grabada para calidad y entrenamiento.</Say>
  <Dial record="record-from-answer-dual"
        recordingStatusCallback="https://app.goadmin.io/api/voice/recording"
        recordingStatusCallbackEvent="completed"
        recordingStatusCallbackMethod="POST"
        callerId="+5715551234">
    <Number statusCallback="https://app.goadmin.io/api/voice/status"
            statusCallbackEvent="initiated ringing answered completed">+573001234567</Number>
  </Dial>
</Response>
```

- `<Dial record="true">` (o `record-from-answer-dual`) graba **ambas partes**.
- `<Record>` graba solo a quien llama (buzón de voz).
- Las grabaciones de dos patas son **dual-channel por defecto** → canal 0 = agente, canal 1 = cliente → **diarización gratis**.
- `RecordingStatusCallback` devuelve `AccountSid`, `CallSid`, `RecordingSid`, `RecordingUrl`, `RecordingDuration`, `RecordingStatus`.
- La `RecordingUrl` **requiere autenticación básica** con las credenciales de la cuenta → nunca exponerla al cliente; siempre proxy firmado.

### 1.4 Transcripción de Twilio (opción, no default)

- Batch Transcription: `/v2/Transcriptions`.
- Conversational Intelligence: `client.intelligence.v2.transcripts.create({ sourceRecordingSid, transcriptionConfigurationId })` → recursos `Transcript`, `TranscriptSentence`, `TranscriptOperatorResults`.
- `CustomerKey` permite mapear a `organization_id`.
- Language Operators: sentimiento, extracción de datos, redacción de PII.
- Precios: batch **$0.024/min** · streaming **$0.027/min** · operators estándar **$0.004/min**.

→ **Decisión:** no es el default por precio (4–8× más caro que Scribe/OpenAI). Se deja como proveedor seleccionable.

### 1.5 Media Streams

```xml
<Connect><Stream url="wss://ws.goadmin.io/media" /></Connect>
```

- Audio: `audio/x-mulaw`, **8 kHz, mono**, payload base64.
- Mensajes: `connected`, `start`, `media`, `dtmf`, `stop`, `mark`.
- Tracks: `inbound_track`, `outbound_track`, `both_tracks`.
- `<Start><Stream>` = unidireccional (fork). `<Connect><Stream>` = bidireccional.
- Costo ≈ **$0.004/min**.

### 1.6 ConversationRelay (GA desde 2025) — ya parcialmente implementado

```xml
<Connect>
  <ConversationRelay url="wss://ws.goadmin.io/conversation-relay"
                     ttsProvider="Google" voice="es-US-Neural2-A"
                     transcriptionProvider="Google" language="es-CO"
                     welcomeGreeting="Hola, le llamo de ..." interruptible="true" />
</Connect>
```

- Twilio gestiona STT, TTS, barge-in y orquestación. Tu WS recibe `prompt` (texto) y responde `text` (tokens) o `play` (audio).
- Mensajes entrantes al WS: `setup`, `prompt`, `interrupt`, `dtmf`, `error`.
- Mensajes salientes: `text` (con `last: true/false`), `play`, `sendDigits`, `end`.
- ⚠️ **Limitación documentada:** con `ttsProvider="ElevenLabs"` la doc oficial indica `language="en-US"`. Para español conviene `ttsProvider="Google"`/`"Amazon"` **o** construir el TTS propio con `play` + ElevenLabs.
- Costo de orquestación ≈ **$0.07/min** + telefonía + STT/TTS/LLM externos.

### 1.7 Llamada saliente PSTN

```ts
const call = await client.calls.create({
  from: orgTwilioNumber,
  to: '+573001234567',
  url: 'https://app.goadmin.io/api/voice/twiml/outbound?callRef=...',
  statusCallback: 'https://app.goadmin.io/api/voice/status',
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  statusCallbackMethod: 'POST',
  record: true,
  recordingStatusCallback: 'https://app.goadmin.io/api/voice/recording',
  machineDetection: 'DetectMessageEnd', // buzón de voz
});
```

### 1.8 Webhooks — payloads exactos

**StatusCallback** (`application/x-www-form-urlencoded`):
`CallSid`, `ParentCallSid`, `CallStatus` (`queued|initiated|ringing|in-progress|busy|failed|no-answer|completed|canceled`), `CallDuration` (solo en `completed`, **segundos**), `From`, `To`, `Direction`, `AnsweredBy` (si `machineDetection`), `CallbackSource`, `Timestamp`, `SequenceNumber`, `AccountSid`.

**RecordingStatusCallback:**
`AccountSid`, `CallSid`, `RecordingSid`, `RecordingUrl`, `RecordingDuration`, `RecordingStatus`, `RecordingChannels`, `RecordingSource`.

**Validación obligatoria:** header `X-Twilio-Signature` + `twilio.validateRequest(authToken, signature, url, params)`. Para subcuentas, usar el `authToken` de la subcuenta correcta.

### 1.9 Twilio Programmable Messaging (SMS)

- `MessagingServiceSid` en lugar de `From` → Twilio elige el sender del pool.
- Opt-out automático: `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`. Desde marzo 2026 el opt-out es **cross-channel** (RCS/SMS/MMS).
- A2P 10DLC obligatorio para EE.UU. (Brand + Campaign en Trust Hub; máx. 5 campaigns por brand). No aplica a LATAM.
- Precios: EE.UU. ~$0.0083/segmento · Colombia ~$0.0592 · México ~$0.1819. Números desde ~$1.15/mes.
- México: no usar números MX para marketing unidireccional (bloqueo). No enviar 21:00–09:00.
- Colombia: requiere opt-in; posible bloqueo de sender ID en Virgin Mobile.

---

## 2. ElevenLabs

### 2.1 Text to Speech

| Modelo | Latencia | Idiomas | Máx chars | Uso |
|---|---|---|---|---|
| `eleven_v3` | ~280 ms | 70+ | 3 000 | Máxima fidelidad emocional |
| `eleven_v3_conversational` | ~280 ms | 70+ | — | **Agentes de voz** (default recomendado) |
| `eleven_flash_v2_5` | **~75 ms** | 32 | 40 000 | Tiempo real / baja latencia |
| `eleven_turbo_v2_5` | 250–300 ms | 32 | 40 000 | Equilibrio |

- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
- Header: `xi-api-key`
- Precios: `eleven_v3` ≈ **$0.10/1k chars** · `flash_v2_5` / `v3_conversational` ≈ **$0.05/1k chars**.
- Para Twilio: pedir `output_format=ulaw_8000` para evitar transcodificación.

### 2.2 ElevenLabs Agents (antes Conversational AI)

- Integración **nativa con Twilio**: se importa el número y ElevenLabs configura los webhooks inbound/outbound.
- `client tools` → llamadas HTTP a tu API (ej. mover etapa del pipeline).
- `transfer_to_number` → transferencia a humano (warm / blind / SIP REFER).
- Transcripción y análisis post-llamada incluidos.
- Precio: minutos incluidos en el plan; adicional **$0.08/min** (burst $0.16). LLM y telefonía aparte.

Ejemplo de tool:
```json
{
  "name": "move_pipeline_stage",
  "description": "Mueve la oportunidad a otra etapa del pipeline",
  "parameters": {
    "type": "object",
    "properties": {
      "opportunity_id": { "type": "string" },
      "new_stage_id": { "type": "string" },
      "reason": { "type": "string" }
    },
    "required": ["opportunity_id", "new_stage_id"]
  }
}
```

### 2.3 Voice cloning (voces personalizadas)

| Método | Requisitos | Calidad | Tiempo |
|---|---|---|---|
| **Instant Voice Clone (IVC)** | 1–5 min de audio | Buena, menos estable | Inmediato |
| **Professional Voice Clone (PVC)** | 30 min – 3 h de audio limpio | Indistinguible | 3–6 h de entrenamiento |

⚠️ Requiere **consentimiento explícito verificado** del dueño de la voz. Guardar la evidencia del consentimiento por organización.

### 2.4 Scribe v2 (STT) — **default del sistema**

```ts
const fd = new FormData();
fd.append('file', audioBlob);
fd.append('model_id', 'scribe_v2');
fd.append('language_code', 'spa');
fd.append('diarize', 'true');
fd.append('timestamps_granularity', 'word');
fd.append('detect_speaker_roles', 'true');

await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
  method: 'POST', headers: { 'xi-api-key': KEY }, body: fd,
});
```

- 90+ idiomas, español `spa`.
- **Diarización hasta 32 hablantes**, `detect_speaker_roles` etiqueta `agent`/`customer`.
- Timestamps por palabra o carácter.
- Precio: batch **$0.22/hora ≈ $0.0037/min** · realtime $0.39/hora.

---

## 3. OpenAI

### 3.1 Realtime API (voz)

| Modelo | Audio in | Audio out | ≈ USD/min |
|---|---|---|---|
| `gpt-realtime-2.1` | $32/1M tok | $64/1M tok | ~$0.019 escuchando + ~$0.077 hablando |
| `gpt-realtime-2.1-mini` | $10/1M tok | $20/1M tok | ~$0.006 + ~$0.024 |

- Transporte: **WebRTC** (browser) · **WebSocket** `wss://api.openai.com/v1/realtime` (servidor) · **SIP** `sip:<project_id>@sip.api.openai.com` con Twilio Elastic SIP Trunk.
- Con SIP: OpenAI dispara webhook `realtime.call.incoming`; se acepta con `realtime.calls.accept`.
- ❌ **No tiene números PSTN propios** → siempre requiere Twilio como puente.
- Function calling: `tools` en `session.update`; el modelo emite `tool_calls`; se responde con `tool_response`.

### 3.2 Transcripción

| Modelo | Diarización | Timestamps | Precio |
|---|---|---|---|
| `gpt-4o-transcribe-diarize` | ✅ (`diarized_json` con `speaker/start/end`) | ✅ | $0.006/min |
| `gpt-4o-transcribe` | ❌ | ✅ | $0.006/min |
| `gpt-4o-mini-transcribe` | ❌ | ✅ | $0.003/min |
| `whisper-1` | ❌ | ✅ (`timestamp_granularities[]`) | $0.006/min |

- `POST https://api.openai.com/v1/audio/transcriptions`
- Límite de archivo: **25 MB** (Whisper). Audios largos requieren chunking o usar el canal por segmentos.

### 3.3 TTS

| Modelo | Precio |
|---|---|
| `tts-1` | $15/1M chars |
| `tts-1-hd` | $30/1M chars |
| `gpt-4o-mini-tts` | $0.60/1M tok texto + $12/1M tok audio |

Voces: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`, `marin`, `cedar`. Recomendadas `marin` / `cedar`.

### 3.4 Imagen

`dall-e-3` ya está integrado en `/api/ai-assistant/generate-image`.

---

## 4. Google

### 4.1 Gemini Live API (audio bidireccional)

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=...
```

Modelos: `gemini-live-2.5-flash-native-audio` (GA) · `gemini-3.1-flash-live-preview` · `gemini-2.5-flash-live-preview`.

- Input: **raw 16-bit PCM, 16 kHz, little-endian**. Output: **raw 16-bit PCM, 24 kHz**.
- Tool use / function calling, barge-in, traducción en vivo, transcripción del audio.
- Audio efectivo ≈ **$0.0368/min**.
- ⚠️ Requiere resample entre 8 kHz mulaw (Twilio) y 16/24 kHz PCM.

### 4.2 Cloud Speech-to-Text v2 / Chirp 3

```python
config = cloud_speech.RecognitionConfig(
    model="chirp_3",
    language_codes=["es-US"],
    features=cloud_speech.RecognitionFeatures(
        diarization_config=cloud_speech.SpeakerDiarizationConfig(),
        enable_word_time_offsets=True,
        enable_automatic_punctuation=True,
    ),
)
```

- Métodos: `Recognize`, `StreamingRecognize`, `BatchRecognize`.
- Diarización disponible en `BatchRecognize`/`Recognize` para `es-ES` y `es-US`.
- Precios: v2 estándar **$0.016/min** (0–500k min/mes) hasta **$0.004/min** por volumen · dynamic batch **$0.003/min**.

### 4.3 Análisis de texto, imagen y video

| Uso | Modelo | Precio |
|---|---|---|
| Análisis de transcripción (resumen, sentimiento, next steps) | `gemini-2.5-flash` | ~$0.75/1M in · ~$3.75/1M out |
| Análisis profundo / coaching | `gemini-2.5-pro` | ~$2/1M in · ~$12/1M out |
| Imagen | `Imagen 4` | por imagen |
| Video | `Veo 3` / `Veo 3.1` | por segundo |

→ **Decisión:** `gemini-2.5-flash` como default de análisis de llamadas (mejor $/contexto). `gpt-4o-mini` como fallback (ya está cableado).

---

## 5. Captura de llamadas del celular personal — la verdad

### 5.1 Android

- `READ_CALL_LOG` / `WRITE_CALL_LOG` / `PROCESS_OUTGOING_CALLS` pertenecen al grupo **CALL_LOG**.
- **Google Play solo lo permite si la app es el manejador de teléfono/asistente por defecto** y el call log es funcionalidad central. Un CRM **no califica** → rechazo de publicación.
- Grabación: `MediaRecorder.AudioSource.VOICE_CALL` / `VOICE_UPLINK` / `VOICE_DOWNLINK` están **restringidos a apps del sistema desde Android 9 (API 28/29)**. Android 11 bloqueó también el truco de Accessibility Services.
- Lo máximo posible con app normal: grabar el micrófono del dispositivo (solo la voz propia, mala calidad, requiere altavoz).

### 5.2 iOS

- `CallKit` / `CXCallObserver` permite detectar `dialing`, `incoming`, `connected`, `ended` → se puede calcular **duración**.
- ❌ **No entrega el número** de llamadas celulares a terceros.
- ❌ **No existe API para grabar** el audio de llamadas del sistema. Las apps del App Store que "graban" usan puente de 3 vías o servidores.

### 5.3 Alternativas reales

| # | Alternativa | Viabilidad | Graba ambos lados | Da número | Da duración | Legal |
|---|---|---|---|---|---|---|
| 1 | **Click-to-call de 2 patas por Twilio** | 🟢 Alta | ✅ | ✅ | ✅ | ✅ con aviso |
| 2 | Número Twilio como proxy del celular | 🟢 Media-alta | ✅ | ✅ | ✅ | ✅ con aviso |
| 3 | Conferencia inversa (agente marca al número Twilio) | 🟢 Alta | ✅ | ✅ | ✅ | ✅ con aviso |
| 4 | Registro manual + subida de audio | 🟡 Alta pero friccionante | Depende | Manual | Manual | Del usuario |
| 5 | App de grabación de terceros + upload | 🔴 Media | Un lado | ❌ | ✅ | Frágil |
| 6 | Leer call log nativo | 🔴 No viable | ❌ | ❌ | ✅ | Rechazo en Play |

→ **Decisión: alternativa 1 como principal, 3 como complemento (marcar al número de la org desde el móvil), 4 como fallback manual.** La 6 se descarta y se documenta el porqué.

### 5.4 Compliance de grabación

| País | Requisito |
|---|---|
| **Colombia** | **Consentimiento de todas las partes** (art. 192 Código Penal). Grabar sin acuerdo es delito. |
| **México** | Una parte participante puede grabar, pero LFPDPPP exige aviso de privacidad. |
| **EE.UU.** | Federal one-party; ~12 estados all-party (CA, FL, IL, MA, PA, WA, CT, MD, MI, MT, NH, OR). |
| **UE / GDPR** | Consentimiento explícito + finalidad + base legal. |

→ **Implementación obligatoria:** `<Say>` con aviso al inicio de toda llamada grabada, no desactivable; registro en `call_consents`; toggle por organización para desactivar grabación completa; retención configurable.

---

## 6. Resend (email)

### 6.1 Envío

`POST https://api.resend.com/emails` — campos: `from`, `to` (≤50), `subject`, `html`, `text`, `react`, `cc`, `bcc`, `reply_to`, `scheduled_at` (ISO 8601 o lenguaje natural), `headers`, `tags` (key/value), `topic`, `attachments`.

```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Ventas GoAdmin <ventas@cliente.com>',
  to: ['prospecto@empresa.com'],
  subject: 'Propuesta',
  react: <ProposalEmail name="Ana" />,
  tags: { organization_id: String(orgId), opportunity_id: oppId },
  scheduled_at: '2026-09-01T14:00:00Z',
}, { idempotencyKey: `org${orgId}/opp${oppId}/step3` });
```

- Límite: **40 MB** por email incluyendo adjuntos base64.
- Batch: `POST /emails/batch`, hasta **100 emails**, **sin adjuntos**; el índice de `data[]` corresponde 1:1 con el request.
- Idempotencia: header `Idempotency-Key` (≤256 chars, expira en 24 h).
- Rate limit: **10 req/s** por team (escala con plan).

### 6.2 React Email

```bash
npm install react-email
```

```tsx
import { Html, Head, Body, Container, Heading, Text, Button, Tailwind, render } from 'react-email';

export function ProposalEmail({ name }: { name: string }) {
  return (
    <Html><Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto py-12">
            <Heading className="text-2xl">Hola {name}</Heading>
            <Text>Tu propuesta está lista.</Text>
            <Button href="..." className="bg-black text-white px-4 py-2 rounded">Ver propuesta</Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
const html = await render(<ProposalEmail name="Ana" />);
```

### 6.3 Marketing: Contacts + Segments + Topics + Broadcasts

Resend migró de **Audiences** a **Contacts + Segments + Topics**.

- `POST /contacts` (`email`, `first_name`, `last_name`, `unsubscribed`, `segments[]`, `topics[]`)
- `POST /contacts/{id}/segments/{segmentId}`
- `POST /broadcasts` (`segmentId`, `from`, `subject`, `html`, `send`, `scheduled_at`, `topic`)
- Placeholders: `{{{contact.first_name|there}}}`, `{{{RESEND_UNSUBSCRIBE_URL}}}` (obligatorio en marketing).

### 6.4 Webhooks

Eventos: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.scheduled`, `email.suppressed`, `email.received`, `domain.verified`.

```ts
const result = resend.webhooks.verify({
  payload: await req.text(),
  headers: {
    id: req.headers.get('svix-id')!,
    timestamp: req.headers.get('svix-timestamp')!,
    signature: req.headers.get('svix-signature')!,
  },
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
});
```

### 6.5 Multi-tenant (crítico para el CRM)

Patrón elegido — **single account + dominio y API key por organización**:

```ts
const domain = await resend.domains.create({ name: 'cliente.com' });      // devuelve registros DNS
await resend.domains.verify(domain.id);                                    // tras que el cliente los publique
const apiKey = await resend.apiKeys.create({
  name: `org_${orgId}`, permission: 'sending_access', domain_id: domain.id,
});  // el token solo se devuelve una vez → guardar cifrado en email_domains
```

- Resend genera SPF (`TXT`), DKIM (`TXT`/`CNAME`) y MX de feedback. DMARC se agrega manualmente después.
- Un dominio solo puede estar activo en un team de Resend.
- Alternativa BYOK (cada cliente su propia cuenta Resend): mejor aislamiento de reputación, más fricción.

### 6.6 Precios

Free 3 000/mes (100/día, 3 dominios) · Pro $20 (50k) / $35 (100k) · Scale desde $90 (100k) · overage **$0.90/1k** · dominios extra $20/mes por 100 · IP dedicada $30/mes en Scale.

---

## 7. WhatsApp

### 7.1 Cloud API (Meta) — proveedor elegido

`POST https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/messages`

| Categoría | Uso | Precio 2026 |
|---|---|---|
| **Marketing** | Promos, retargeting | Siempre cobrado por mensaje **entregado** |
| **Utility** | Confirmaciones, recordatorios | Gratis dentro de la ventana de servicio; cobrado fuera |
| **Authentication** | OTP | Cobrado por entregado |
| **Service** | Respuestas dentro de 24 h | Precio de servicio |

Cambio 2025/2026: facturación **por mensaje entregado**, ya no por conversación (modelo por conversación depreciado el 2025-07-01).

- Plantillas obligatorias para mensajes iniciados por la empresa: `POST /{WABA_ID}/message_templates`, `category: MARKETING|UTILITY|AUTHENTICATION`. Aprobación hasta 24 h. Máx. 100 plantillas/hora por WABA. TTL 30 días (auth: 10 min).
- Ventana de 24 h: si el usuario escribe, se abre ventana de servicio para mensajes libres; fuera de ella solo plantillas.
- Webhooks: suscribirse a `messages` y `whatsapp_business_management`. `statuses[]` con `sent|delivered|read|failed` + objeto `pricing`.

### 7.2 Multi-tenant: Embedded Signup

- Flow web que crea WABA + número + permisos para tu app, en nombre del cliente.
- Requiere ser **Tech Provider** (más rápido de aprobar; el cliente pone su método de pago) o **Solution Partner** (puedes compartir línea de crédito y facturar tú).
- Webhook obligatorio: `account_update` para detectar cuando un cliente completa el flow.
- **Sin este estatus no se puede escalar el onboarding de WhatsApp a muchos clientes.**

### 7.3 Twilio WhatsApp vs Cloud API

| Aspecto | Cloud API directa | Twilio WhatsApp |
|---|---|---|
| Costo variable | Solo tarifa Meta | Tarifa Meta + **$0.005/mensaje** (in y out) + $0.001 fallidos |
| Ingeniería | Mayor | Menor |
| Multi-tenant | WABA por cliente (Embedded Signup) | Más fácil al inicio, más caro a escala |

→ **Decisión:** Cloud API directa (ya integrada) como principal; Twilio WhatsApp y Baileys QR (ya integrados) como alternativas configurables por organización.

---

## 8. Motion (motion.dev) — animaciones

### 8.1 Paquetes e imports (2026)

```bash
npm install motion
```

| Uso | Import | Tamaño |
|---|---|---|
| React declarativo | `import { motion, AnimatePresence } from 'motion/react'` | ~34 KB pre-bundled |
| Bundle reducido | `import * as m from 'motion/react-m'` + `<LazyMotion features={domAnimation}>` | **~4.6 KB inicial** |
| Server-friendly | `import * as motion from 'motion/react-client'` | Reduce JS inicial, SSR del `initial` |
| Vanilla | `import { animate, scroll, spring } from 'motion'` | 2.3 KB mini / 5.2 KB+ |
| View transitions | `import { animateView } from 'motion'` | ligero |

**Next.js App Router:** `'use client'` sigue siendo obligatorio para componentes animados. `motion/react-client` reduce el JS inicial pero no convierte el componente en RSC puro. Requiere React ≥ 18.2.

### 8.2 API que usaremos

`initial` · `animate` · `exit` · `whileHover` · `whileTap` · `whileInView` · `variants` · `transition` · `layout` · `layoutId` · `drag`
`AnimatePresence` · `LayoutGroup` · `Reorder.Group` / `Reorder.Item` · `MotionConfig`
`useAnimate` (2.3 KB) · `useScroll` · `useSpring` · `useMotionValue` · `useTransform` · `useInView` (0.6 KB) · `useReducedMotion` · `stagger`

### 8.3 Patrones listos para el CRM

**Drawer / Sheet (oportunidad, softphone):**
```tsx
'use client';
import { AnimatePresence, motion } from 'motion/react';

<AnimatePresence>
  {open && (
    <>
      <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }}
        exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black z-40" />
      <motion.div key="panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', visualDuration: 0.4, bounce: 0.2 }}
        className="fixed right-0 top-0 h-full w-[min(560px,100vw)] bg-background z-50 shadow-xl">
        {children}
      </motion.div>
    </>
  )}
</AnimatePresence>
```

**Kanban reorder:**
```tsx
import { Reorder } from 'motion/react';
<Reorder.Group axis="y" values={items} onReorder={setItems}>
  {items.map((item) => (
    <Reorder.Item key={item.id} value={item} whileDrag={{ scale: 1.03 }}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <OpportunityCard {...item} />
    </Reorder.Item>
  ))}
</Reorder.Group>
```

**Tabs con indicador deslizante (`layoutId`):**
```tsx
{active === tab && (
  <motion.div layoutId="crmActiveTab" className="absolute inset-0 bg-muted rounded-full -z-10"
    transition={{ type: 'spring', visualDuration: 0.3 }} />
)}
```

**Stagger de listas:**
```tsx
const list = { open: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } }, closed: {} };
const item = { open: { opacity: 1, y: 0 }, closed: { opacity: 0, y: 16 } };
```

**Reduced motion (obligatorio, a11y):**
```tsx
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```

### 8.4 Reglas de performance para este proyecto

- Animar solo `transform`, `opacity`, `clipPath`, `filter` (GPU). **Prohibido** animar `width`/`height`/`top`/`left` en listas.
- Kanban con >100 tarjetas: `m` + `LazyMotion`, sin `layout` por tarjeta, `whileInView` con `{ once: true }`.
- Aprovechar la virtualización ya presente (`react-virtuoso`).
- `React.memo` en tarjetas animadas dentro de bucles densos.

Referencias: `motion.dev/docs/react-installation`, `/react-motion-component`, `/react-reduce-bundle-size`, `/react-reorder`, `/react-animate-presence`, `/react-use-scroll`, `/react-use-in-view`, `/react-accessibility`, `/stagger`, `/ui/components/sheet`, `/ui/components/skeleton`, `/docs/animate-view`.

---

## 9. Integraciones complementarias recomendadas

| Función | Proveedor | API clave | Veredicto |
|---|---|---|---|
| Agendamiento embebido | **Cal.com API v2** | `POST /v2/bookings` (header `cal-api-version: 2024-08-13`) | ✅ Sí — scheduling con marca de la organización |
| Sync de calendario del usuario | Google Calendar API | `POST /calendars/{id}/events` + `conferenceData.createRequest` (Meet) | ✅ Sí |
| Calendario B2B Microsoft | Microsoft Graph | `POST /me/calendar/events` | 🟡 Opcional |
| Videollamada de demo + transcripción | **Daily.co** | `POST /v1/rooms`, `POST /rooms/{name}/transcription/start` | ✅ Sí — UX embebida, ~$0.004/participant-min |
| Videollamada si usan Workspace | Google Meet API | `POST /v2/spaces` | 🟡 Alternativa |
| Videollamada si usan Zoom | Zoom API | `POST /v2/users/me/meetings` (cloud recording + transcript) | 🟡 Alternativa |
| Firma electrónica | **Documenso** | `POST /api/v2/envelope/create` | ✅ Sí — open source, self-host |
| Firma con marca líder | DocuSign | `POST /restapi/v2.1/accounts/{id}/envelopes` | 🟡 Alternativa |
| Firma punto medio | Dropbox Sign | `POST /v3/signature_request/send` | 🟡 Alternativa |
| Enriquecimiento B2B | **Apollo.io** | `GET /people/enrichment`, `POST /people/bulk` (≤10) | ✅ Sí (plan Custom para API) |
| ❌ Clearbit | — | — | ❌ Ya no existe standalone (es HubSpot Breeze) |
| Analítica de producto → health score | **PostHog** | 1M eventos gratis; $0.00005/evento después | ✅ Sí |
| Lead Ads Meta | Meta webhook `leadgen` | webhook `page`/`leadgen` → `GET /{leadgen_id}` | ✅ Sí |
| Lead Ads Google | Google Ads Lead Form webhook | POST con `lead_id`, `user_column_data[]`, `google_key` | ✅ Sí |
| Lead Gen TikTok | TikTok Business API | `/page/lead/task/...` + Events API | 🟡 Si corren TikTok |
| Cierre con pago | **Stripe Payment Links / Checkout** (ya integrado) | `POST /v1/payment_links`, `POST /v1/checkout/sessions` | ✅ Sí |

---

## 10. Tabla consolidada de costos por minuto de llamada

| Capa | Servicio | USD/min aprox. |
|---|---|---|
| Telefonía saliente PSTN (Colombia) | Twilio | 0.014–0.069 |
| Telefonía WebRTC (browser/app) | Twilio | 0.004 |
| Grabación | Twilio Recording | 0.0025 + 0.0005/min/mes storage |
| **Transcripción (default)** | **ElevenLabs Scribe v2** | **0.0037** |
| Transcripción alt. | OpenAI `gpt-4o-transcribe-diarize` | 0.006 |
| Transcripción alt. económica | Google Chirp 3 dynamic batch | 0.003 |
| Transcripción alt. Twilio | Twilio CI batch | 0.024 |
| **Análisis IA de llamada** | **Gemini 2.5 Flash** | ~0.001–0.003 por llamada |
| TTS agente (baja latencia) | ElevenLabs Flash v2.5 | ~0.05 (a 1k chars/min) |
| TTS agente (calidad) | ElevenLabs v3 | ~0.10 |
| Orquestación agente IA | Twilio ConversationRelay | 0.07 |
| Agente IA todo-en-uno | ElevenLabs Agents | +0.08 |
| LLM del agente | OpenAI Realtime 2.1 mini | ~0.03 |

**Costo estimado de una llamada saliente de 5 min con grabación, transcripción y análisis:**
Telefonía 5×0.02 = $0.10 · Grabación 5×0.0025 = $0.013 · Scribe 5×0.0037 = $0.019 · Análisis ≈ $0.002 → **≈ $0.134 por llamada**.
Con agente IA de voz: + ConversationRelay 5×0.07 = $0.35 + TTS/LLM ≈ $0.15 → **≈ $0.63 por llamada**.

Estos números deben alimentar el sistema de créditos por organización (`comm_settings.voice_minutes_remaining`, `ai_settings.credits_remaining`).

---

## 11. Lo que NO es posible (documentar, no prometer)

1. ❌ Grabar llamadas nativas del iPhone — iOS no expone el audio de llamadas del sistema.
2. ❌ Grabar ambos lados de una llamada celular en Android publicado en Google Play — `VOICE_CALL` restringido a apps del sistema desde API 29.
3. ❌ Obtener el número marcado en iOS — `CXCallObserver` no entrega el `handle` de llamadas celulares.
4. ❌ Leer el call log en una app de Google Play que no sea el dialer por defecto.
5. ❌ OpenAI Realtime con número de teléfono propio — requiere puente SIP/Twilio.
6. ⚠️ `ttsProvider="ElevenLabs"` en ConversationRelay está documentado con `language="en-US"` — para español usar Google/Amazon TTS en Relay, o TTS propio vía mensajes `play`.
7. ❌ Crear equipos/cuentas de Resend por API — solo dominios y API keys.
