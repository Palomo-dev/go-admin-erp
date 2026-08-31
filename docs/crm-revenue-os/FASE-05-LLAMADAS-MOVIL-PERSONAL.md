# FASE 05 — Llamadas desde el celular personal

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F3 (infra de voz, `calls`, grabación), F4 (transcripción/análisis)
> Bloquea: — (F6 no depende de F5 directamente)

---

## 0. Objetivo y alcance

**Qué resuelve:** el requisito del dueño: *"si no hago la llamada desde el CRM sino desde el celular, que el CRM tome todo el tiempo de la llamada, el número que llamó y transcriba las llamadas."*

**La verdad técnica primero:** la captura nativa de llamadas celulares **NO es posible**:
- **Android:** `READ_CALL_LOG` solo se aprueba en Google Play si la app es el dialer por defecto — un CRM no califica. `MediaRecorder.AudioSource.VOICE_CALL` está restringido a apps del sistema desde API 29. Android 11 cerró el truco de Accessibility Services.
- **iOS:** `CXCallObserver` da estados y duración pero **no el número**, y no existe API para grabar el audio de llamadas del sistema.

Este documento entrega la arquitectura que SÍ cumple el requisito al 100% del resultado deseado (número + duración + grabación + transcripción + análisis) sin depender de permisos rechazables.

**Qué NO entra:** agente IA de voz (F6), softphone browser (F3).

---

## 1. La verdad técnica

### 1.1 Tabla de las 6 alternativas con viabilidad

| # | Alternativa | Plataforma | Viabilidad | Por qué |
|---|---|---|---|---|
| 1 | `READ_CALL_LOG` + `VOICE_CALL` | Android | ❌ | Google Play rechaza salvo dialer por defecto |
| 2 | Accessibility Services para leer llamadas | Android | ❌ | Android 11 cerró el acceso a call log via A11y |
| 3 | `CXCallObserver` | iOS | ⚠️ parcial | Da duración pero NO número ni audio |
| 4 | **Click-to-call de 2 patas (Twilio)** | Todas | ✅ | Twilio controla la llamada → graba, transcribe, reporta |
| 5 | **Conferencia inversa (marcar número Twilio)** | Todas | ✅ | Igual que 4 pero el usuario inicia desde su teléfono |
| 6 | **Registro manual + subida de audio** | Todas | ✅ | El usuario graba con su app y sube el archivo |

### 1.2 Evidencia

- Google Play Policy: `READ_CALL_LOG` solo para apps que son el dialer/asistente por defecto del dispositivo.
- Android API 29+: `MediaRecorder.AudioSource.VOICE_CALL` → `SecurityException` para apps no-sistema.
- iOS CallKit: `CXCallObserver` no expone el número marcado por privacidad. Sin API de grabación de audio del sistema.

---

## 2. Arquitectura de los 4 modos

### Modo A — Click-to-call de dos patas (principal)

```
Vendedor pulsa "Llamar" en CRM (móvil o web)
        │
        ▼
POST /api/voice/call { mode: 'bridge', agentPhone, targetPhone, customerId, opportunityId }
        │
        ▼
Twilio: client.calls.create({ to: agentPhone, from: orgNumber, url: '/api/voice/twiml/agent-leg' })
        │
        ▼
Twilio llama al móvil personal del vendedor
        │
        ▼
Vendedor contesta → escucha whisper + pulsa 1
        │
        ▼
TwiML: <Dial record="dual"> → llama al cliente
        │
        ▼
Cliente contesta → aviso de grabación → conversación
        │
        ▼
StatusCallback → UPDATE calls (duration, status)
RecordingStatusCallback → Storage → F4 transcribe
```

### Modo B — Conferencia inversa

```
Vendedor marca el número Twilio de la org desde su celular
        │
        ▼
Twilio identifica por From → resuelve org + usuario
        │
        ▼
IVR: "Pulse 1 para marcar un número, 2 para el siguiente lead pendiente"
        │
        ▼
<Dial record="dual"> → llama al cliente
```

### Modo C — Registro manual con subida de audio

```
Vendedor graba con app de su teléfono → sube archivo al CRM
        │
        ▼
POST /api/crm/calls/manual { to, direction, duration, notes, audioFile }
        │
        ▼
INSERT calls (mode='manual') → sube audio a Storage → F4 transcribe
```

### Modo D — Recordatorio proactivo (complemento)

```
CRM detecta llamada saliente via tel: que el propio CRM disparó
        │
        ▼
App va a background → App.appStateChange registra tiempo
        │
        ▼
App vuelve a foreground → "Detectamos una llamada de ~4:12, ¿fue con un cliente?"
        │
        ▼
Usuario confirma → CRM registra con duration_source='estimated'
```

---

## 3. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `mobile/capacitor.config.ts` | ✅ carga URL remota | `mobile/capacitor.config.ts` |
| Plugins Capacitor | ✅ biometría, cámara, push, etc. | `mobile/package.json` |
| `tel:` en el repo | buscar | grep `tel:` |
| `electron/src/main/index.ts` | ✅ | — |
| `public/sw.js` | ✅ | — |
| `twilioVerifyService.ts` | ✅ verifica números | `src/lib/services/integrations/twilio/twilioVerifyService.ts` |
| `mobile_call_bridges` | ❌ | — |
| `calls.bridge_mode`/`agent_leg_sid`/`customer_leg_sid` | ❌ | — |
| `calls.duration_source` | ❌ | — |
| IVR del Modo B | ❌ | — |

---

## 4. Base de datos

### 4.1 Migraciones

#### Migración 1 — `mobile_call_bridges`

```sql
CREATE TABLE mobile_call_bridges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  agent_phone text NOT NULL,
  target_phone text NOT NULL,
  customer_id integer,
  opportunity_id uuid,
  agent_leg_sid text,
  customer_leg_sid text,
  status text NOT NULL DEFAULT 'initiating' CHECK (status IN (
    'initiating','agent_ringing','agent_answered','customer_dialing',
    'in_progress','completed','failed','agent_no_answer','agent_rejected'
  )),
  confirm_digit_required boolean NOT NULL DEFAULT true,
  whisper_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridges_org_user ON mobile_call_bridges (organization_id, user_id, created_at DESC);
ALTER TABLE mobile_call_bridges ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcb_select ON mobile_call_bridges FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY mcb_insert ON mobile_call_bridges FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY mcb_update ON mobile_call_bridges FOR UPDATE USING (organization_id = current_org_id());
```

#### Migración 2 — Columnas en `calls`

```sql
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS bridge_mode text CHECK (bridge_mode IN ('agent_leg','customer_leg','full_bridge')),
  ADD COLUMN IF NOT EXISTS agent_leg_sid text,
  ADD COLUMN IF NOT EXISTS customer_leg_sid text,
  ADD COLUMN IF NOT EXISTS duration_source text NOT NULL DEFAULT 'provider'
    CHECK (duration_source IN ('provider','estimated','manual'));
```

### 4.2 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'mobile_call_bridges';
-- Esperado: 1 fila, true

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'calls' AND column_name IN ('bridge_mode','agent_leg_sid','customer_leg_sid','duration_source');
-- Esperado: 4 filas
```

---

## 5. Backend

### 5.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/voice/twiml/agent-leg` | `src/app/api/voice/twiml/agent-leg/route.ts` | crear | POST | TwiML de la pata del agente |
| `/api/voice/twiml/ivr-inbound` | `src/app/api/voice/twiml/ivr-inbound/route.ts` | crear | POST | IVR del Modo B |
| `/api/crm/calls/manual` | `src/app/api/crm/calls/manual/route.ts` | crear | POST | Registro manual + subida de audio |
| `/api/voice/call` | ya existe (F3) | modificar | POST | Añadir `mode='bridge'` |

### 5.2 TwiML exacto

#### Pata del agente (Modo A)

```xml
<!-- /api/voice/twiml/agent-leg -->
<Response>
  <Gather numDigits="1" action="/api/voice/twiml/agent-leg-confirm" method="POST" timeout="10">
    <Say voice="Polly.Lupepe" language="es-CO">
      Conectando con {{customer_name}} de {{company_name}}.
      Esta llamada será grabada. Pulse 1 para continuar.
    </Say>
  </Gather>
  <Say voice="Polly.Lupepe" language="es-CO">
    No se recibió confirmación. Colgando.
  </Say>
  <Hangup/>
</Response>

<!-- /api/voice/twiml/agent-leg-confirm (recibe el dígito) -->
<Response>
  <Say voice="Polly.Lupepe" language="es-CO">
    Conectando. Esta llamada será grabada para fines de calidad y servicio.
  </Say>
  <Dial
    record="record-from-answer-dual"
    recordingStatusCallback="/api/voice/recording"
    statusCallback="/api/voice/status"
    answerOnBridge="true"
  >
    <Number>{{target_phone}}</Number>
  </Dial>
</Response>
```

#### IVR del Modo B

```xml
<!-- /api/voice/twiml/ivr-inbound -->
<Response>
  <Gather numDigits="10" action="/api/voice/twiml/ivr-dial" method="POST" timeout="15">
    <Say voice="Polly.Lupepe" language="es-CO">
      Bienvenido. Marque el número destino o pulse 0 para su siguiente llamada pendiente.
    </Say>
  </Gather>
</Response>

<!-- /api/voice/twiml/ivr-dial (recibe el dígito) -->
<Response>
  <Say voice="Polly.Lupepe" language="es-CO">
    Conectando. Esta llamada será grabada.
  </Say>
  <Dial record="record-from-answer-dual" ...>
    <Number>{{resolved_number}}</Number>
  </Dial>
</Response>
```

### 5.3 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/voice/bridgeService.ts` | **crear** | Orquesta click-to-call de 2 patas |
| `src/lib/services/voice/ivrService.ts` | **crear** | IVR del Modo B |
| `src/lib/services/voice/manualCallService.ts` | **crear** | Registro manual + subida |

#### `bridgeService.ts` — firmas

```typescript
export async function initiateBridgeCall(params: {
  organizationId: number;
  userId: string;
  agentPhone: string; // móvil del vendedor (verificado)
  targetPhone: string; // número del cliente
  customerId?: number;
  opportunityId?: string;
}): Promise<{ bridgeId: number; agentLegSid: string }>;

export async function correlateBridgeLegs(
  supabase: SupabaseClient,
  callSid: string,
  legType: 'agent' | 'customer'
): Promise<void>;
```

### 5.4 Correlación de las dos patas

```
1. initiateBridgeCall() → INSERT mobile_call_bridges + INSERT calls (agent_leg, status='dialing')
2. Twilio llama al agente → agent contesta → pulsa 1
3. TwiML hace <Dial> al cliente → INSERT calls (customer_leg, parent_call_sid=agent_leg_sid)
4. StatusCallback del agent_leg → UPDATE calls + UPDATE mobile_call_bridges.agent_leg_sid
5. StatusCallback del customer_leg → UPDATE calls + UPDATE mobile_call_bridges.customer_leg_sid
6. Si llegan desordenados: cada callback busca por parent_call_sid y actualiza lo que falte
```

### 5.5 Variables de entorno

F5 no añade variables nuevas — usa las de F3.

---

## 6. UI

### 6.1 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/voice/CallModeSelector.tsx` | **crear** | `to`, `customerId?`, `opportunityId?` | Selector de modo de llamada |
| `src/components/voice/MobileBridgeStatus.tsx` | **crear** | `bridgeId` | Estado en vivo de las 2 patas |
| `src/components/voice/ManualCallDialog.tsx` | **crear** | `customerId?`, `opportunityId?` | Form de registro manual + dropzone |
| `src/components/voice/UnloggedCallPrompt.tsx` | **crear** | — | Recordatorio proactivo del Modo D |

### 6.2 Wireframes

```
┌─ CallModeSelector ───────────────────────────────────────────┐
│  Llamar a Juan Pérez (+57 300 123 4567)                     │
│                                                                │
│  ○ Llamar desde el navegador (WebRTC)                         │
│  ● Llamar a mi celular (+57 310 765 4321)                    │
│  ○ Marcar con mi teléfono (tel:)                              │
│  ○ Registrar llamada manual                                   │
│                                                                │
│  [Cancelar]  [Llamar]                                         │
└────────────────────────────────────────────────────────────────┘

┌─ MobileBridgeStatus ─────────────────────────────────────────┐
│  📞 Llamando a tu celular...                                  │
│  Pata agente:  ⏱ Timbrando                                    │
│  Pata cliente: ⏸ Esperando                                    │
│  [Cancelar llamada]                                           │
└────────────────────────────────────────────────────────────────┘

┌─ ManualCallDialog ───────────────────────────────────────────┐
│  Registrar llamada manual                                     │
│                                                                │
│  Número: [+57 300 123 4567]                                  │
│  Dirección: [Saliente ▼]                                      │
│  Duración: [04:12]                                            │
│  Resultado: [Interesado ▼]                                    │
│  Notas: [________________________]                           │
│  Audio (opcional): [📁 Arrastra archivo .mp3]                │
│                                                                │
│  [Cancelar]  [Registrar]                                      │
└────────────────────────────────────────────────────────────────┘

┌─ UnloggedCallPrompt ─────────────────────────────────────────┐
│  📞 Detectamos una llamada de ~4:12 hace un momento.         │
│  ¿Fue con un cliente?                                        │
│  [No]  [Sí, seleccionar cliente]                             │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 Animaciones Motion

```tsx
// Selector con AnimatePresence
<AnimatePresence mode="wait">
  <motion.div key={selectedMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    {modeContent}
  </motion.div>
</AnimatePresence>

// Bridge status con pulso en "timbrando"
<motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
  Timbrando...
</motion.div>
```

### 6.4 Accesibilidad

- Selector navegable con flechas + enter.
- `ManualCallDialog` con foco en el primer campo.
- `UnloggedCallPrompt` con `role="alert"` + foco automático.

---

## 7. Cross-platform

| Plataforma | Modo disponible | Cambios |
|---|---|---|
| **Web** | A (bridge), C (manual) | Sin cambios extra |
| **PWA** | A, C, D | `public/sw.js`: no interferir con `tel:` scheme |
| **Electron** | A, C | Sin cambios extra |
| **Capacitor iOS** | A, B, C, D | Modo D: plugin propio con `CXCallObserver` para detectar duración (sin número). `tel:` con `App.openUrl`. |
| **Capacitor Android** | A, B, C, D | Modo D: NO pedir `READ_CALL_LOG`. Usar `App.appStateChange` para estimar duración. `tel:` con `App.openUrl`. |

#### Plugin propio iOS (Modo D — opcional)

```swift
// CallObserverPlugin.swift
import CallKit

@objc(CallObserverPlugin)
class CallObserverPlugin: CAPPlugin {
  let callObserver = CXCallObserver()

  public override func load() {
    callObserver.setDelegate(self, queue: nil)
  }

  func callObserver(_ observer: CXCallObserver, callChanged call: CXCall) {
    if call.hasEnded {
      let duration = call.hasConnected ? Date().timeIntervalSince(call.connectDate) : 0
      notifyListeners("callEnded", data: ["duration": duration])
      // NO se puede obtener el número — iOS no lo expone
    }
  }
}
```

#### Android (Modo D — sin permisos rechazables)

```typescript
// Usar @capacitor/app para detectar background→foreground
import { App } from '@capacitor/app';

let backgroundTime: number | null = null;

App.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) {
    backgroundTime = Date.now();
  } else if (backgroundTime) {
    const duration = Math.round((Date.now() - backgroundTime) / 1000);
    // Solo si el CRM disparó el tel: → sabemos a quién llamó
    if (lastDialedNumber) {
      showUnloggedCallPrompt(lastDialedNumber, duration, 'estimated');
    }
    backgroundTime = null;
  }
});
```

---

## 8. Compliance y consentimiento

- El aviso de grabación aplica igual en las dos patas.
- Consentimiento del propio agente para grabar su pata (verificado al pulsar 1).
- Colombia: consentimiento de todas las partes (Ley 1581/2012).
- Configuración por organización y por país del cliente.

---

## 9. Costos comparados de los 4 modos

| Modo | Costo por minuto | Costo por llamada de 5 min |
|---|---|---|
| A — Bridge (2 patas) | 2 × $0.015 = $0.030/min | $0.15 |
| B — Conferencia inversa | 2 × $0.015 = $0.030/min | $0.15 |
| C — Manual (sin Twilio) | $0 (solo STT/análisis) | $0 |
| Navegador (F3) | 1 × $0.015 = $0.015/min | $0.075 |

> El modo bridge cuesta el doble que el navegador. Mostrar esto en la UI de configuración.

---

## 10. Multi-tenant y seguridad

- Verificación del móvil del agente con `twilioVerifyService.ts` antes de permitir bridge.
- Anti-abuso: no permitir marcar a números arbitrarios sin registro; límite de llamadas por usuario/hora.
- El IVR del Modo B resuelve la org desde `phone_numbers.e164` del número marcado.
- Si el `From` no corresponde a un usuario verificado → rechazar.

---

## 11. Pruebas

### 11.1 Casos

1. Agente no contesta → `status='agent_no_answer'` después de `ring_timeout`.
2. Agente cuelga antes que el cliente → `customer_leg` se cancela.
3. Cliente ocupado → `status='busy'` en `customer_leg`.
4. Buzón de voz en cualquiera de las patas → `status='voicemail'`.
5. Callbacks desordenados (customer_leg antes que agent_leg) → correlación por `parent_call_sid`.
6. Número no verificado → 403.
7. Audio manual de 200 MB → 413 (límite configurable, default 40 MB).
8. MIME falso (archivo .txt renombrado a .mp3) → 415.

---

## 12. Definition of Done

- [ ] `mobile_call_bridges` existe con RLS.
- [ ] `calls.bridge_mode`/`agent_leg_sid`/`customer_leg_sid`/`duration_source` existen.
- [ ] Modo A: pulsar "Llamar a mi celular" → Twilio llama al agente → agente contesta + pulsa 1 → llama al cliente.
- [ ] Modo B: marcar número Twilio → IVR → marcar destino → conexión con grabación.
- [ ] Modo C: `ManualCallDialog` sube audio → F4 transcribe.
- [ ] Modo D: `UnloggedCallPrompt` aparece al volver de una llamada `tel:`.
- [ ] `CallModeSelector` muestra solo opciones disponibles por plataforma.
- [ ] Verificación de móvil del agente funciona.
- [ ] Costos visibles en la UI de configuración.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 13. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| El agente no pulsa 1 → llamada no se completa | Timeout de 10s → colgar; registrar `agent_no_answer` |
| Costo doble del bridge | Mostrar costo en UI; recomendar navegador cuando sea posible |
| `tel:` no funciona en Electron | Electron maneja `tel:` via `shell.openExternal` — documentar |
| Plugin iOS de `CXCallObserver` requiere Apple Developer | Es opcional (Modo D); el bridge funciona sin él |

---

## 14. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/voice/bridgeService.ts` | crear | Click-to-call 2 patas |
| `src/lib/services/voice/ivrService.ts` | crear | IVR Modo B |
| `src/lib/services/voice/manualCallService.ts` | crear | Registro manual |
| `src/app/api/voice/twiml/agent-leg/route.ts` | crear | TwiML pata agente |
| `src/app/api/voice/twiml/agent-leg-confirm/route.ts` | crear | Confirmación + Dial |
| `src/app/api/voice/twiml/ivr-inbound/route.ts` | crear | IVR entrada |
| `src/app/api/voice/twiml/ivr-dial/route.ts` | crear | IVR dial |
| `src/app/api/crm/calls/manual/route.ts` | crear | Registro manual |
| `src/app/api/voice/call/route.ts` | modificar | Añadir mode='bridge' |
| `src/components/voice/CallModeSelector.tsx` | crear | Selector |
| `src/components/voice/MobileBridgeStatus.tsx` | crear | Estado bridge |
| `src/components/voice/ManualCallDialog.tsx` | crear | Dialog manual |
| `src/components/voice/UnloggedCallPrompt.tsx` | crear | Recordatorio |
| `mobile/` (plugin iOS opcional) | crear | CallObserver Modo D |
