# Twilio - Documentación de Integración

> **Tipo:** Plataforma de comunicaciones en la nube (CPaaS)  
> **Servicios:** SMS, WhatsApp, Voz, Email, Verify (OTP)  
> **Documentación oficial:** https://www.twilio.com/docs  
> **Consola:** https://www.twilio.com/console  
> **SDK Node.js:** `twilio` (npm)

---

## 1. Resumen

Twilio es una plataforma de comunicaciones que permite enviar y recibir mensajes (SMS, WhatsApp, MMS, RCS), hacer llamadas de voz, verificar usuarios (OTP) y enviar emails. Los servicios relevantes para GO Admin ERP son:

1. **Programmable Messaging** — SMS, MMS, WhatsApp, RCS vía una sola API.
2. **Programmable Voice** — Llamadas salientes/entrantes, IVR, grabación.
3. **Verify** — OTP multicanal (SMS, WhatsApp, email, llamada) para autenticación.
4. **Lookup** — Validación y enriquecimiento de números telefónicos.
5. **SendGrid Email** — Envío de emails transaccionales y marketing.

---

## 2. Autenticación

### 2.1 Credenciales

| Credencial | Formato | Descripción |
|---|---|---|
| **Account SID** | `AC` + 32 hex chars | Identificador único de la cuenta |
| **Auth Token** | 32 hex chars | Token secreto para autenticar requests |
| **API Key SID** | `SK` + 32 hex chars | Alternativa recomendada para producción |
| **API Key Secret** | 32 hex chars | Secreto del API Key |

> **Recomendación:** Usar API Keys en producción en vez de Account SID + Auth Token. Los API Keys se pueden rotar sin afectar toda la cuenta.

### 2.2 Autenticación HTTP Basic

```
Authorization: Basic base64(AccountSid:AuthToken)
```

O con API Key:

```
Authorization: Basic base64(ApiKeySid:ApiKeySecret)
```

### 2.3 Variables de Entorno Requeridas

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15557122661
TWILIO_WHATSAPP_NUMBER=+14155238886
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. SDK Node.js — Instalación y Uso

### 3.1 Instalación

```bash
npm install twilio
```

### 3.2 Inicialización

```typescript
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
```

---

## 4. Programmable Messaging (SMS / WhatsApp / MMS / RCS)

### 4.1 URL Base

```
https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
```

### 4.2 Enviar SMS

```typescript
const message = await client.messages.create({
  body: 'Hola desde GO Admin!',
  from: '+15557122661',       // Número Twilio
  to: '+573001234567',        // Destinatario E.164
});
console.log(message.sid);     // SM + 32 hex
```

### 4.3 Enviar WhatsApp

```typescript
const message = await client.messages.create({
  body: 'Tu pedido #1234 está listo para recoger.',
  from: 'whatsapp:+14155238886',   // Número WhatsApp Twilio
  to: 'whatsapp:+573001234567',    // Destinatario
});
```

> **WhatsApp requiere:** Registro de número como WhatsApp Sender, Business Account (WABA) y templates aprobados para mensajes fuera de ventana de 24h.

### 4.4 Enviar MMS (con media)

```typescript
const message = await client.messages.create({
  body: 'Mira esta imagen',
  from: '+15557122661',
  to: '+573001234567',
  mediaUrl: ['https://miapp.com/imagen.jpg'],
});
```

### 4.5 Enviar con Messaging Service

```typescript
const message = await client.messages.create({
  body: 'Mensaje via Messaging Service',
  messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  to: '+573001234567',
});
```

> **Messaging Services** permiten pool de números, escalado automático, y compliance A2P 10DLC.

### 4.6 Parámetros del Request (POST /Messages.json)

| Parámetro | Tipo | Requerido | Descripción |
|---|---|---|---|
| `To` | string | Sí | Destinatario en E.164 o `whatsapp:+XXXXXXXXXXX` |
| `From` | string | Condicional | Número Twilio o channel address |
| `MessagingServiceSid` | string | Condicional | SID del Messaging Service (alternativa a `From`) |
| `Body` | string | Condicional | Texto del mensaje (hasta 1600 chars) |
| `MediaUrl` | string[] | Condicional | URLs de media para MMS |
| `ContentSid` | string | Condicional | SID de Content Template |
| `ContentVariables` | JSON string | No | Variables para Content Template |
| `StatusCallback` | URL | No | URL para recibir status updates |
| `ValidityPeriod` | int | No | Segundos en cola (1-36000, default: 36000) |
| `ScheduleType` | string | No | `fixed` para programar envío |
| `SendAt` | ISO 8601 | No | Hora de envío programado |

### 4.7 Estados de un Mensaje

| Estado | Dirección | Descripción |
|---|---|---|
| `queued` | Saliente | Encolado para envío |
| `sending` | Saliente | En proceso de envío |
| `sent` | Saliente | Enviado al carrier |
| `delivered` | Saliente | Entregado al destinatario |
| `undelivered` | Saliente | No se pudo entregar |
| `failed` | Saliente | Falló el envío |
| `receiving` | Entrante | En proceso de recepción |
| `received` | Entrante | Recibido por Twilio |
| `read` | Saliente | Leído (solo WhatsApp/RCS) |
| `accepted` | Saliente | Aceptado por Messaging Service |
| `scheduled` | Saliente | Programado para envío futuro |
| `canceled` | Saliente | Envío programado cancelado |

### 4.8 Consultar Mensaje

```typescript
const message = await client.messages('SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX').fetch();
console.log(message.status);
```

### 4.9 Listar Mensajes

```typescript
const messages = await client.messages.list({
  from: '+15557122661',
  dateSent: new Date('2026-02-12'),
  limit: 20,
});
```

---

## 5. Programmable Voice

### 5.1 URL Base

```
https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json
```

### 5.2 Realizar Llamada

```typescript
const call = await client.calls.create({
  from: '+15557122661',
  to: '+573001234567',
  url: 'https://miapp.com/api/twilio/voice-response',  // TwiML
});
console.log(call.sid);
```

### 5.3 TwiML (Twilio Markup Language)

TwiML es XML que controla el flujo de la llamada. Se sirve desde tu servidor:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-CO" voice="Polly.Mia">
    Hola, tu reserva ha sido confirmada. Gracias por usar GO Admin.
  </Say>
</Response>
```

**Verbos TwiML principales:**

| Verbo | Descripción |
|---|---|
| `<Say>` | Texto a voz (TTS) |
| `<Play>` | Reproducir audio |
| `<Gather>` | Capturar entrada DTMF o voz |
| `<Record>` | Grabar audio |
| `<Dial>` | Conectar a otro número |
| `<Redirect>` | Redirigir a otra URL TwiML |
| `<Pause>` | Pausar N segundos |
| `<Hangup>` | Colgar |

### 5.4 IVR (Respuesta Interactiva de Voz)

```xml
<Response>
  <Gather numDigits="1" action="/api/twilio/ivr-handler" method="POST">
    <Say language="es-CO">
      Presione 1 para ventas, 2 para soporte, 3 para reservas.
    </Say>
  </Gather>
  <Say language="es-CO">No recibimos entrada. Adiós.</Say>
</Response>
```

---

## 6. Verify API (OTP / Verificación)

### 6.1 URL Base

```
https://verify.twilio.com/v2/
```

### 6.2 Flujo de Verificación (3 pasos)

#### Paso 1: Crear Verification Service (una sola vez)

```typescript
const service = await client.verify.v2.services.create({
  friendlyName: 'GO Admin ERP',
  codeLength: 6,
});
// Guardar service.sid → VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Paso 2: Enviar código de verificación

```typescript
const verification = await client.verify.v2
  .services('VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  .verifications.create({
    channel: 'sms',            // 'sms' | 'call' | 'email' | 'whatsapp'
    to: '+573001234567',
  });
console.log(verification.status);  // 'pending'
```

#### Paso 3: Verificar código ingresado por el usuario

```typescript
const check = await client.verify.v2
  .services('VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  .verificationChecks.create({
    code: '123456',               // Código ingresado por el usuario
    to: '+573001234567',
  });
console.log(check.status);       // 'approved' o 'pending' (si falla)
console.log(check.valid);        // true o false
```

### 6.3 Canales de Verificación

| Canal | Valor | Descripción |
|---|---|---|
| **SMS** | `sms` | Código OTP vía mensaje de texto |
| **Llamada** | `call` | Código OTP vía llamada de voz |
| **Email** | `email` | Código OTP vía email (requiere SendGrid) |
| **WhatsApp** | `whatsapp` | Código OTP vía WhatsApp |

### 6.4 Configuración del Service

| Propiedad | Tipo | Default | Descripción |
|---|---|---|---|
| `friendlyName` | string | — | Nombre que aparece en el mensaje |
| `codeLength` | int | 4 | Longitud del código (4-10) |
| `lookupEnabled` | boolean | false | Validar número antes de enviar |
| `skipSmsToLandlines` | boolean | false | No enviar SMS a fijos |
| `dtmfInputRequired` | boolean | false | Requerir DTMF en llamadas |

---

## 7. Lookup API (Validación de Números)

### 7.1 URL Base

```
https://lookups.twilio.com/v2/PhoneNumbers/{PhoneNumber}
```

### 7.2 Validar Número

```typescript
const lookup = await client.lookups.v2
  .phoneNumbers('+573001234567')
  .fetch({ fields: 'line_type_intelligence' });

console.log(lookup.valid);                              // true
console.log(lookup.callingCountryCode);                 // '57'
console.log(lookup.nationalFormat);                     // '300 123 4567'
console.log(lookup.lineTypeIntelligence.type);          // 'mobile'
```

### 7.3 Tipos de Línea

| Tipo | Descripción |
|---|---|
| `mobile` | Línea celular |
| `landline` | Línea fija |
| `fixedVoip` | VoIP fijo |
| `nonFixedVoip` | VoIP no fijo |
| `tollFree` | Línea gratuita |
| `voicemail` | Buzón de voz |

---

## 8. Webhooks (Mensajes Entrantes y Status Callbacks)

### 8.1 Webhook de Mensajes Entrantes

Configurar URL en el número Twilio para recibir mensajes entrantes vía HTTP POST:

**Parámetros que envía Twilio:**

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `MessageSid` | `SMXXXXXXXX` | ID único del mensaje |
| `AccountSid` | `ACXXXXXXXX` | SID de la cuenta |
| `From` | `+573001234567` | Remitente |
| `To` | `+15557122661` | Tu número Twilio |
| `Body` | `Hola, necesito ayuda` | Texto del mensaje |
| `NumMedia` | `0` | Cantidad de archivos adjuntos |
| `MediaUrl0` | URL | URL del primer adjunto |
| `MediaContentType0` | `image/jpeg` | MIME type del adjunto |
| `FromCity` | `BOGOTA` | Ciudad del remitente |
| `FromCountry` | `CO` | País del remitente |

**Parámetros adicionales WhatsApp:**

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `ProfileName` | `Juan Pérez` | Nombre del perfil WhatsApp |
| `WaId` | `573001234567` | WhatsApp ID |
| `Forwarded` | `true` | Si el mensaje fue reenviado |

### 8.2 Responder a Mensaje Entrante (TwiML)

```typescript
// Next.js API Route: /api/twilio/incoming-message
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const body = formData.get('Body') as string;
  const from = formData.get('From') as string;

  // Procesar mensaje...

  // Responder con TwiML
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Message>Gracias por contactarnos. Te responderemos pronto.</Message>
  </Response>`;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
```

### 8.3 Status Callback (Estado de Mensajes Salientes)

Configurar `StatusCallback` URL al enviar mensaje para recibir actualizaciones de estado:

```typescript
const message = await client.messages.create({
  body: 'Mensaje con tracking',
  from: '+15557122661',
  to: '+573001234567',
  statusCallback: 'https://miapp.com/api/twilio/status-callback',
});
```

**Parámetros del Status Callback:**

| Parámetro | Descripción |
|---|---|
| `MessageSid` | ID del mensaje |
| `MessageStatus` | Estado actual (`sent`, `delivered`, `failed`, etc.) |
| `ErrorCode` | Código de error (si aplica) |
| `ErrorMessage` | Mensaje de error (si aplica) |

### 8.4 Validar Autenticidad del Webhook

```typescript
import twilio from 'twilio';

function validateTwilioRequest(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, twilioSignature, url, params);
}

// En API Route:
const signature = req.headers.get('x-twilio-signature') || '';
const isValid = validateTwilioRequest(
  process.env.TWILIO_AUTH_TOKEN!,
  signature,
  'https://miapp.com/api/twilio/incoming-message',
  Object.fromEntries(formData)
);

if (!isValid) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
}
```

---

## 9. WhatsApp — Detalles Específicos

### 9.1 Tipos de Mensaje

| Tipo | Ventana | Descripción |
|---|---|---|
| **Conversational** | Dentro de 24h | Respuesta libre dentro de ventana de 24h |
| **Template** | Fuera de 24h | Requiere template aprobado por Meta |

### 9.2 Enviar Template (Fuera de ventana 24h)

```typescript
const message = await client.messages.create({
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+573001234567',
  contentSid: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',  // Template SID
  contentVariables: JSON.stringify({ '1': 'Juan', '2': '#1234' }),
});
```

### 9.3 Sandbox para Desarrollo

Para probar WhatsApp sin registro formal:
1. Ir a https://www.twilio.com/console/sms/whatsapp/sandbox
2. Enviar `join <palabra-clave>` al número sandbox de Twilio
3. Usar el número sandbox como `from` en desarrollo

### 9.4 Registro de Número WhatsApp (Producción)

1. Crear cuenta WhatsApp Business (WABA) en Twilio Console
2. Registrar número vía **WhatsApp Self Sign-up**
3. Verificar negocio con Meta
4. Crear y aprobar templates de mensaje

---

## 10. Precios y Costos

### 10.1 Modelo de Precios

| Servicio | Modelo | Precio Aprox. (Colombia) |
|---|---|---|
| **SMS Saliente** | Por mensaje | ~$0.0075 USD/msg |
| **SMS Entrante** | Por mensaje | ~$0.0075 USD/msg |
| **WhatsApp** | Por conversación (24h) | ~$0.005 - $0.08 USD según categoría |
| **Llamada Saliente** | Por minuto | ~$0.0220 USD/min |
| **Llamada Entrante** | Por minuto | ~$0.0085 USD/min |
| **Verify SMS** | Por verificación | ~$0.05 USD |
| **Lookup** | Por consulta | ~$0.005 USD (line type) |
| **Número Twilio** | Por mes | ~$1.15 USD/mes (número colombiano) |

> Los precios varían por país y volumen. Consultar https://www.twilio.com/en-us/pricing

### 10.2 Categorías WhatsApp Business (Meta)

| Categoría | Descripción | Costo Aprox. |
|---|---|---|
| **Marketing** | Promos, ofertas, boletines | Más alto |
| **Utility** | Confirmaciones, actualizaciones | Medio |
| **Authentication** | OTP, verificaciones | Más bajo |
| **Service** | Soporte al cliente (dentro de 24h) | Gratis |

---

## 11. Arquitectura GO Admin — Cuenta Maestra + Subaccounts

### 11.1 Decisión de Arquitectura

**GO Admin controla Twilio** (no el cliente). Razones:

1. **Voice Agent** — Requiere control total de webhooks, TwiML y lógica IA.
2. **Producto diferenciador** — Comunicaciones y Voice Agent como servicio incluido en planes.
3. **Simplicidad para el cliente** — No necesita crear cuenta Twilio ni entender APIs.
4. **Monetización** — Créditos de comunicación incluidos en cada plan, igual que los AI credits.
5. **Compliance** — GO Admin gestiona registro WhatsApp Business, A2P 10DLC, etc.

### 11.2 Twilio Subaccounts

Cada organización recibe su propia **subcuenta Twilio**, aislando datos y números:

```
Cuenta Twilio Maestra (GO Admin)
  ├── Subaccount: Org "Hotel Paraíso"    → +573001111111
  ├── Subaccount: Org "Restaurante XYZ"  → +573002222222
  └── Subaccount: Org "Tienda ABC"       → +573003333333
```

```typescript
// Crear subcuenta al activar comunicaciones para una org
const subaccount = await masterClient.api.accounts.create({
  friendlyName: `GO Admin - ${organizationName}`,
});
// subaccount.sid → ACxxxxxxxx
// subaccount.authToken → token de la subcuenta
```

### 11.3 Variables de Entorno (solo GO Admin backend)

```env
# Cuenta maestra Twilio — SOLO en .env.local del backend
TWILIO_MASTER_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MASTER_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **El cliente NUNCA ve estas credenciales.** El backend las usa internamente.

---

## 12. Integración con Planes GO Admin

### 12.1 Planes Activos y Créditos de Comunicación

Los créditos de comunicación siguen el **mismo patrón** que los AI credits (`ai_credits_monthly` → `ai_settings` → `deduct_ai_credits`).

| | **Pro** ($20/mes) | **Business** ($49/mes) | **Ultimate** ($199/mes) | **Enterprise** (custom) |
|---|---|---|---|---|
| **SMS/mes** | 50 | 200 | 1,000 | Ilimitado |
| **WhatsApp/mes** | 50 | 200 | 1,000 | Ilimitado |
| **Voz (min/mes)** | 0 | 30 | 200 | Ilimitado |
| **Voice Agent** | ❌ | ❌ | ✅ Básico | ✅ Avanzado |
| **Número dedicado** | Compartido | Dedicado | Dedicado + WhatsApp | Múltiples |

### 12.2 Campos nuevos en tabla `plans`

```sql
-- Agregar a la tabla plans (misma lógica que ai_credits_monthly)
ALTER TABLE plans ADD COLUMN comm_sms_monthly INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN comm_whatsapp_monthly INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN comm_voice_minutes_monthly INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN comm_voice_agent_enabled BOOLEAN DEFAULT false;
```

**Valores por plan:**

| Plan | `comm_sms_monthly` | `comm_whatsapp_monthly` | `comm_voice_minutes_monthly` | `comm_voice_agent_enabled` |
|---|---|---|---|---|
| Pro (id=2) | 50 | 50 | 0 | false |
| Business (id=3) | 200 | 200 | 30 | false |
| Ultimate (id=5) | 1000 | 1000 | 200 | true |
| Enterprise (id=4) | NULL (ilimitado) | NULL (ilimitado) | NULL (ilimitado) | true |

### 12.3 Nueva tabla `comm_settings` (igual que `ai_settings`)

```sql
CREATE TABLE comm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER UNIQUE REFERENCES organizations(id),
  -- Créditos restantes
  sms_remaining INTEGER DEFAULT 0,
  whatsapp_remaining INTEGER DEFAULT 0,
  voice_minutes_remaining INTEGER DEFAULT 0,
  credits_reset_at TIMESTAMPTZ DEFAULT NOW(),
  -- Twilio subaccount
  twilio_subaccount_sid TEXT,
  twilio_subaccount_auth_token TEXT,  -- cifrado
  phone_number TEXT,                   -- número asignado
  whatsapp_number TEXT,                -- número WhatsApp (puede ser el mismo)
  -- Voice Agent
  voice_agent_enabled BOOLEAN DEFAULT false,
  voice_agent_config JSONB DEFAULT '{}',
  -- Estado
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.4 Trigger `sync_comm_credits_on_subscription`

Mismo patrón que `sync_ai_credits_on_subscription`:

```sql
CREATE OR REPLACE FUNCTION sync_comm_credits_on_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_sms INTEGER;
  v_whatsapp INTEGER;
  v_voice INTEGER;
  v_voice_agent BOOLEAN;
BEGIN
  IF NEW.status IN ('active', 'trialing') THEN
    SELECT 
      COALESCE(comm_sms_monthly, 0),
      COALESCE(comm_whatsapp_monthly, 0),
      COALESCE(comm_voice_minutes_monthly, 0),
      COALESCE(comm_voice_agent_enabled, false)
    INTO v_sms, v_whatsapp, v_voice, v_voice_agent
    FROM plans WHERE id = NEW.plan_id;

    INSERT INTO comm_settings (organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining, voice_agent_enabled, credits_reset_at, is_active)
    VALUES (NEW.organization_id, v_sms, v_whatsapp, v_voice, v_voice_agent, NOW(), true)
    ON CONFLICT (organization_id)
    DO UPDATE SET
      sms_remaining = CASE WHEN v_sms > comm_settings.sms_remaining THEN v_sms ELSE comm_settings.sms_remaining END,
      whatsapp_remaining = CASE WHEN v_whatsapp > comm_settings.whatsapp_remaining THEN v_whatsapp ELSE comm_settings.whatsapp_remaining END,
      voice_minutes_remaining = CASE WHEN v_voice > comm_settings.voice_minutes_remaining THEN v_voice ELSE comm_settings.voice_minutes_remaining END,
      voice_agent_enabled = v_voice_agent,
      is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_comm_credits
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_comm_credits_on_subscription();
```

### 12.5 Función `deduct_comm_credits`

```sql
CREATE OR REPLACE FUNCTION deduct_comm_credits(
  p_organization_id INTEGER,
  p_channel TEXT,        -- 'sms', 'whatsapp', 'voice'
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_current INTEGER;
  v_column TEXT;
BEGIN
  -- Determinar columna según canal
  v_column := CASE p_channel
    WHEN 'sms' THEN 'sms_remaining'
    WHEN 'whatsapp' THEN 'whatsapp_remaining'
    WHEN 'voice' THEN 'voice_minutes_remaining'
    ELSE NULL
  END;

  IF v_column IS NULL THEN RETURN FALSE; END IF;

  -- Obtener créditos con bloqueo
  EXECUTE format('SELECT %I FROM comm_settings WHERE organization_id = $1 FOR UPDATE', v_column)
    INTO v_current USING p_organization_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  -- NULL = ilimitado (Enterprise)
  IF v_current IS NULL THEN RETURN TRUE; END IF;
  IF v_current < p_amount THEN RETURN FALSE; END IF;

  -- Descontar
  EXECUTE format('UPDATE comm_settings SET %I = %I - $1, updated_at = NOW() WHERE organization_id = $2', v_column, v_column)
    USING p_amount, p_organization_id;

  -- Registrar uso
  INSERT INTO comm_usage_logs (organization_id, channel, credits_used, created_at)
  VALUES (p_organization_id, p_channel, p_amount, NOW());

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 12.6 Tabla `comm_usage_logs`

```sql
CREATE TABLE comm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER REFERENCES organizations(id),
  channel TEXT NOT NULL,           -- 'sms', 'whatsapp', 'voice'
  credits_used INTEGER DEFAULT 1,
  twilio_message_sid TEXT,         -- SID del mensaje en Twilio
  recipient TEXT,                  -- número destino
  status TEXT,                     -- 'sent', 'delivered', 'failed'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 13. Casos de Uso por Módulo

| Módulo | Caso de Uso | Canal |
|---|---|---|
| **PMS** | Confirmación de reserva | SMS / WhatsApp |
| **PMS** | Recordatorio de check-in (día anterior) | WhatsApp |
| **PMS** | Encuesta post-checkout | WhatsApp |
| **PMS** | Código de acceso digital (check-in online) | SMS |
| **POS** | Confirmación de pedido | WhatsApp |
| **POS** | Pedido listo para recoger | SMS / WhatsApp |
| **POS** | Envío de factura electrónica | WhatsApp |
| **CRM** | Notificaciones a clientes | SMS / WhatsApp |
| **CRM** | Campañas de marketing | WhatsApp (template) |
| **CRM** | Seguimiento post-venta | WhatsApp |
| **CRM** | Encuestas de satisfacción | WhatsApp |
| **HRM** | Código OTP para marcación de asistencia | SMS / WhatsApp |
| **HRM** | Notificación de turno asignado | WhatsApp |
| **HRM** | Recordatorio de turno próximo | SMS |
| **HRM** | Alertas de ausencia/retardo | SMS |
| **Inventario** | Alerta de stock bajo | SMS / WhatsApp |
| **Inventario** | Notificación de recepción de mercancía | WhatsApp |
| **Inventario** | Alerta de producto próximo a vencer | SMS |
| **Finanzas** | Recordatorio de pago pendiente | SMS / WhatsApp |
| **Finanzas** | Confirmación de pago recibido | WhatsApp |
| **Finanzas** | Alerta de factura vencida | SMS |
| **Calendario** | Recordatorio de evento/cita | SMS / WhatsApp |
| **Calendario** | Confirmación de asistencia | WhatsApp |
| **Calendario** | Cancelación/reprogramación | SMS |
| **Chat** | Canal WhatsApp integrado (entrante/saliente) | WhatsApp |
| **Chat** | Escalamiento de conversación a humano | WhatsApp |
| **Notificaciones** | Alertas críticas del sistema | SMS |
| **Notificaciones** | Resumen diario de actividad | WhatsApp |
| **Notificaciones** | Alertas de seguridad (login sospechoso) | SMS |
| **Gimnasio** | Recordatorio de clase/sesión | WhatsApp |
| **Gimnasio** | Confirmación de inscripción | SMS / WhatsApp |
| **Gimnasio** | Alerta de membresía próxima a vencer | WhatsApp |
| **Gimnasio** | Promociones y ofertas | WhatsApp (template) |
| **Parqueadero** | Notificación de entrada/salida de vehículo | SMS |
| **Parqueadero** | Alerta de tiempo límite próximo | WhatsApp |
| **Parqueadero** | Envío de recibo de pago | WhatsApp |
| **Transporte** | Confirmación de boleto/reserva | SMS / WhatsApp |
| **Transporte** | Notificación de salida de viaje | SMS |
| **Transporte** | Tracking de envío (actualizaciones de estado) | WhatsApp |
| **Transporte** | Alerta de cambio/cancelación de viaje | SMS |
| **Auth** | Verificación 2FA | Verify API |
| **Voice Agent** | Atención automática por teléfono | Voz + IA |

### 13.1 Voice Agent — Casos de Uso

| Módulo | Voice Agent puede... |
|---|---|
| **PMS** | Consultar disponibilidad, crear reservas, dar precios por teléfono |
| **POS** | Recibir pedidos por teléfono, confirmar estado de pedido |
| **CRM** | Atender consultas, agendar citas, dar seguimiento |
| **HRM** | Confirmar turnos, reportar ausencias |
| **Gimnasio** | Consultar horarios de clases, inscribir a sesiones |
| **Parqueadero** | Consultar disponibilidad, reservar espacio |
| **Transporte** | Consultar horarios, reservar boletos, tracking de envíos |
| **Calendario** | Agendar/cancelar citas, consultar disponibilidad |
| **Inventario** | Consultar existencias, reportar faltantes |
| **Finanzas** | Consultar saldo pendiente, confirmar pagos |

### 13.2 Voice Agent — Stack Tecnológico

#### Componentes del Stack

| Servicio | Rol | Descripción |
|---|---|---|
| **Twilio** | Infraestructura telefónica | Recibe/hace llamadas, números, SIP trunking. Es el "tubo" por donde viaja el audio |
| **OpenAI Realtime API** | Cerebro / IA conversacional | Modelo de lenguaje que entiende al usuario y genera respuestas. Soporta streaming bidireccional (audio-in → audio-out) y **function calling** para ejecutar acciones en el ERP |
| **Deepgram** | Speech-to-Text (STT) | Convierte voz del usuario a texto. Latencia ~300ms, buena precisión en español, streaming en tiempo real, diarización |
| **ElevenLabs** | Text-to-Speech (TTS) | Convierte respuesta de la IA a voz ultra-realista. Soporta clonación de voz y voces personalizadas por negocio |

#### Fases de Implementación

| Fase | Stack | Servicios | Razón |
|---|---|---|---|
| **v1 — MVP** | Twilio + OpenAI Realtime | 2 | OpenAI Realtime ya incluye STT + TTS integrados. Lanzar rápido con menor costo |
| **v2 — Mejora de Voz** | + ElevenLabs (reemplaza TTS de OpenAI) | 3 | Voces mucho más naturales, personalizables y con clonación |
| **v3 — Enterprise** | + Deepgram (reemplaza STT de OpenAI) | 4 | Mayor control sobre STT, mejor precisión en español, diarización, timestamps por palabra |

#### Arquitectura — Flujo de una Llamada

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VOICE AGENT FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Cliente llama al número Twilio                                     │
│       ↓                                                             │
│  Twilio → Media Stream (WebSocket) → Backend GO Admin               │
│       ↓                                                             │
│  ┌──────────────────────────────────────────────┐                   │
│  │ v1: OpenAI Realtime API (STT + LLM + TTS)   │                   │
│  │ v2: Deepgram (STT) → OpenAI (LLM) → ElevenLabs (TTS) │         │
│  └──────────────────────────────────────────────┘                   │
│       ↓                                                             │
│  Function Calling → Supabase (consultar/crear datos ERP)            │
│  Ejemplos:                                                          │
│    - crearReserva(fecha, espacio, cliente)                           │
│    - consultarDisponibilidad(fecha, tipoEspacio)                    │
│    - registrarPedido(items, cliente)                                 │
│    - consultarSaldo(clienteId)                                      │
│       ↓                                                             │
│  Respuesta de voz → Twilio → Cliente escucha la respuesta           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Variables de Entorno — Voice Agent

```env
# Fase v1 (mínimo)
OPENAI_API_KEY=sk-...                   # Ya existe en GO Admin
OPENAI_REALTIME_MODEL=gpt-4o-realtime   # Modelo para voz

# Fase v2 (+ ElevenLabs)
ELEVENLABS_API_KEY=xi_...
ELEVENLABS_VOICE_ID=...                 # Voz por defecto
ELEVENLABS_MODEL=eleven_turbo_v2        # Modelo de baja latencia

# Fase v3 (+ Deepgram)
DEEPGRAM_API_KEY=dg_...
DEEPGRAM_MODEL=nova-2                   # Modelo recomendado para español
```

#### Integración con OpenAI Existente

GO Admin ya cuenta con `src/lib/services/openaiService.ts` que expone:

- **`generateResponse()`** — Chat completions (gpt-4o, gpt-4o-mini)
- **`generateChatResponse()`** — Respuesta con contexto de conversación
- **`classifyIntent()`** — Clasificación de intención del mensaje
- **`generateConversationSummary()`** — Resumen de conversación
- **`calculateCost()`** — Cálculo de costo por tokens

Para Voice Agent, se creará un servicio separado `twilioVoiceAgent.ts` que:
1. Reutiliza la configuración de OpenAI existente (`OPENAI_API_KEY`)
2. Usa la **Realtime API** (WebSocket) en vez de Chat Completions (REST)
3. Define **function tools** para ejecutar acciones en el ERP vía Supabase
4. Gestiona el estado de la conversación de voz en tiempo real

#### Function Calling — Herramientas del Voice Agent

```typescript
// Ejemplo de tools que el Voice Agent puede ejecutar
const voiceAgentTools = [
  {
    type: 'function',
    name: 'consultar_disponibilidad',
    description: 'Consulta disponibilidad de espacios/habitaciones',
    parameters: {
      type: 'object',
      properties: {
        fecha_checkin: { type: 'string', description: 'Fecha de entrada (YYYY-MM-DD)' },
        fecha_checkout: { type: 'string', description: 'Fecha de salida (YYYY-MM-DD)' },
        tipo_espacio: { type: 'string', description: 'Tipo de espacio solicitado' },
      },
      required: ['fecha_checkin'],
    },
  },
  {
    type: 'function',
    name: 'crear_reserva',
    description: 'Crea una nueva reserva en el sistema',
    parameters: {
      type: 'object',
      properties: {
        cliente_telefono: { type: 'string' },
        fecha_checkin: { type: 'string' },
        fecha_checkout: { type: 'string' },
        ocupantes: { type: 'number' },
      },
      required: ['cliente_telefono', 'fecha_checkin', 'fecha_checkout'],
    },
  },
  {
    type: 'function',
    name: 'consultar_pedido',
    description: 'Consulta el estado de un pedido existente',
    parameters: {
      type: 'object',
      properties: {
        codigo_pedido: { type: 'string' },
      },
      required: ['codigo_pedido'],
    },
  },
];
```

#### Costos Estimados por Llamada (v1)

| Componente | Métrica | Costo aprox. |
|---|---|---|
| **Twilio Voice** | Por minuto entrante | ~$0.0085/min |
| **OpenAI Realtime** | Audio input | ~$0.06/min |
| **OpenAI Realtime** | Audio output | ~$0.24/min |
| **Total v1** | **Por minuto de llamada** | **~$0.31/min** |

> **Nota:** Con Deepgram ($0.0043/min) + ElevenLabs ($0.18/1000 chars) el costo puede ser menor que OpenAI Realtime nativo, pero con mayor complejidad.

#### Archivos Adicionales — Voice Agent

```
src/lib/services/integrations/twilio/
  voiceAgent/
    voiceAgentService.ts       # Orquestador principal del Voice Agent
    realtimeSession.ts         # Gestión de sesión OpenAI Realtime (WebSocket)
    voiceAgentTools.ts         # Definición de function tools por módulo
    voiceAgentPrompts.ts       # System prompts por tipo de negocio
    deepgramSTT.ts             # (v3) Servicio Deepgram Speech-to-Text
    elevenLabsTTS.ts           # (v2) Servicio ElevenLabs Text-to-Speech

src/app/api/integrations/twilio/voice/
  agent/
    route.ts                   # Endpoint WebSocket para Voice Agent
    tools/route.ts             # Ejecuta function calls contra Supabase
```

---

## 14. Flujo General

```
1. Módulo (CRM, POS, PMS, etc.) necesita enviar comunicación
   ↓
2. Llama a twilioService.send(orgId, channel, to, body)
   ↓
3. twilioService obtiene comm_settings WHERE org_id = X
   ↓
4. Verifica créditos disponibles (deduct_comm_credits)
   ↓
5. Si hay créditos → Crea cliente Twilio con subcuenta de la org
   ↓
6. Envía mensaje/llamada → Registra en comm_usage_logs
   ↓
7. Status Callback actualiza estado del mensaje
   ↓
8. Si es Voice Agent → ConversationRelay + IA + datos ERP
```

---

## 15. Archivos a Crear

```
src/lib/services/integrations/
  twilio/
    twilioService.ts           # Servicio principal (enviar SMS, WhatsApp, llamar)
    twilioSubaccounts.ts       # Gestión de subcuentas por org
    twilioVerifyService.ts     # Servicio de verificación OTP
    twilioVoiceAgent.ts        # Voice Agent con IA
    twilioWebhook.ts           # Procesamiento de webhooks
    twilioTypes.ts             # Interfaces TypeScript
    twilioConfig.ts            # Configuración y helpers

src/app/api/integrations/
  twilio/
    send-sms/route.ts          # API para enviar SMS
    send-whatsapp/route.ts     # API para enviar WhatsApp
    incoming-message/route.ts  # Webhook mensajes entrantes
    status-callback/route.ts   # Webhook status de mensajes
    voice/
      incoming/route.ts        # Webhook llamadas entrantes → TwiML
      agent/route.ts           # Voice Agent IA endpoint
    verify/
      send/route.ts            # Enviar código OTP
      check/route.ts           # Verificar código OTP
```

### 15.1 Tablas de Supabase

| Tabla | Estado | Relación |
|---|---|---|
| `plans` | ✅ Existe (agregar campos comm_*) | Créditos por plan |
| `subscriptions` | ✅ Existe | Vincula org ↔ plan |
| `comm_settings` | 🆕 Crear | Créditos y config Twilio por org |
| `comm_usage_logs` | 🆕 Crear | Registro de cada mensaje/llamada |
| `integration_providers` | ✅ Existe (Twilio ya registrado) | Provider code: 'twilio' |
| `integration_connections` | ✅ Existe | Conexión org ↔ Twilio |
| `customers` | ✅ Existe | Teléfonos de destinatarios |
| `organization_members` | ✅ Existe | Teléfonos del equipo |

---

## 16. Content Templates (Rich Messages)

### 16.1 Crear Template

Los Content Templates permiten crear mensajes ricos reutilizables:

```typescript
const template = await client.content.v1.contents.create({
  friendlyName: 'reservation_confirmation',
  language: 'es',
  variables: { '1': 'nombre', '2': 'fecha', '3': 'habitacion' },
  types: {
    'twilio/text': {
      body: 'Hola {{1}}, tu reserva para el {{2}} en la habitación {{3}} ha sido confirmada.',
    },
  },
});
```

### 16.2 Tipos de Content

| Tipo | Descripción |
|---|---|
| `twilio/text` | Texto plano con variables |
| `twilio/media` | Mensaje con imagen/video/documento |
| `twilio/quick-reply` | Botones de respuesta rápida |
| `twilio/call-to-action` | Botones de acción (URL, teléfono) |
| `twilio/list-picker` | Lista de opciones seleccionables |
| `twilio/card` | Tarjeta con imagen, título, descripción |
| `twilio/catalog` | Catálogo de productos (WhatsApp Commerce) |

---

## 17. Seguridad

1. **Credenciales** solo en backend (variables de entorno, nunca en frontend).
2. **Validar firma** de todos los webhooks con `twilio.validateRequest()`.
3. **API Keys** en producción en vez de Auth Token.
4. **HTTPS obligatorio** para todas las URLs de webhook.
5. **Rate limiting** en endpoints que llaman a Twilio para evitar abuso.
6. **No almacenar** Auth Token en base de datos en texto plano — usar cifrado.
7. **Geo Permissions** — Restringir países destino desde Twilio Console.

---

## 18. Límites y Restricciones

| Restricción | Valor |
|---|---|
| **SMS body max** | 1,600 caracteres |
| **SMS segment** | 160 chars GSM-7 / 70 chars UCS-2 |
| **MMS max media** | 10 archivos |
| **MMS max size** | 5 MB por archivo |
| **WhatsApp template** | Requiere aprobación de Meta (24-48h) |
| **WhatsApp ventana** | 24h para mensajes conversacionales |
| **Verify OTP** | Expira en 10 minutos por defecto |
| **Verify intentos** | 5 intentos máximo por verificación |
| **Rate limit SMS** | 1 msg/seg por número (configurable con Messaging Service) |
| **Validity period** | 1-36,000 segundos (default 36,000) |

---

## 19. Números de Prueba

### 19.1 Magic Numbers para Verify

| Número | Código | Resultado |
|---|---|---|
| `+15005550006` | `123456` | Siempre APPROVED |
| `+15005550009` | cualquiera | Siempre falla |

### 19.2 Sandbox WhatsApp

- Número sandbox: Se asigna en Console
- Conectar enviando `join <keyword>` al número sandbox
- Solo funciona con números verificados en el sandbox

---

## 20. Manejo de Errores

### 20.1 Códigos de Error Comunes

| Código | Descripción | Solución |
|---|---|---|
| `20003` | Authentication error | Verificar Account SID y Auth Token |
| `20404` | Resource not found | Verificar SID del recurso |
| `21211` | Invalid phone number | Número en formato incorrecto |
| `21408` | Permission not enabled | Habilitar permisos en Console |
| `21610` | Unsubscribed recipient | El destinatario se dio de baja |
| `21614` | Not a valid mobile number | No es número móvil |
| `30003` | Unreachable destination | Teléfono apagado o sin servicio |
| `30005` | Unknown destination | Número no existe |
| `30006` | Landline or unreachable | Es línea fija |
| `30007` | Carrier violation | Bloqueado por el carrier |
| `30008` | Unknown error | Error del carrier |
| `63016` | WhatsApp: Template not found | Template no existe o no aprobado |
| `63032` | WhatsApp: Outside 24h window | Necesita template para enviar |

### 20.2 Manejo en TypeScript

```typescript
try {
  const message = await client.messages.create({ ... });
  return { success: true, sid: message.sid };
} catch (error: any) {
  console.error('Twilio Error:', {
    code: error.code,
    message: error.message,
    moreInfo: error.moreInfo,
  });
  return { success: false, error: error.message };
}
```

---

## 21. Roadmap de Implementación

### Resumen de Fases

| Fase | Nombre | Estimado | Dependencia |
|---|---|---|---|
| **0** | Cuenta Twilio + Configuración | 1 día | — |
| **1** | Migraciones de Base de Datos | 2 días | Fase 0 |
| **2** | Servicio Core Twilio (Backend) | 3 días | Fase 1 |
| **3** | API Routes + Webhooks | 2 días | Fase 2 |
| **4** | Panel de Configuración (UI) | 2 días | Fase 3 |
| **5** | Integración por Módulo — Mensajería | 5 días | Fase 3 |
| **6** | Voice Agent v1 (Twilio + OpenAI Realtime) | 5 días | Fase 3 |
| **7** | Voice Agent v2 (+ ElevenLabs TTS) | 3 días | Fase 6 |
| **8** | Voice Agent v3 (+ Deepgram STT) | 3 días | Fase 6 |
| **9** | Testing + Deploy | 3 días | Todas |
| | **Total estimado** | **~29 días** | |

---

### Fase 0 — Cuenta Twilio + Configuración ✅

**Objetivo:** Tener la cuenta maestra de GO Admin lista.

**Estado:** Completada

**Checklist:**

- [x] Agregar variables de entorno al proyecto (`.env.local`)
- [ ] Crear cuenta Twilio en [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
- [ ] Obtener Account SID y Auth Token → Reemplazar en `.env.local`
- [ ] Comprar número de teléfono (SMS + Voice) → Reemplazar `TWILIO_PHONE_NUMBER`
- [ ] Configurar Geo Permissions → [Console > Messaging > Geo permissions](https://www.twilio.com/console/sms/settings/geo-permissions)
- [ ] (Opcional) Solicitar WhatsApp Business API → Reemplazar `TWILIO_WHATSAPP_NUMBER`

**Paso a paso:**

1. **Crear cuenta:** Ir a [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   - Registrarse con email corporativo (ej: admin@goadmin.io)
   - Verificar número de teléfono personal
   - La cuenta trial incluye ~$15 USD de crédito para pruebas

2. **Obtener credenciales:** Ir a [Console Dashboard](https://www.twilio.com/console)
   - **Account SID** → empieza con `AC` → copiar a `TWILIO_MASTER_ACCOUNT_SID`
   - **Auth Token** → clic en "Show" → copiar a `TWILIO_MASTER_AUTH_TOKEN`

3. **Comprar número:** Ir a [Console > Phone Numbers > Buy](https://www.twilio.com/console/phone-numbers/search)
   - Buscar número con capacidad **SMS + Voice**
   - Preferir número de EE.UU. (+1) para mejor cobertura
   - Copiar número a `TWILIO_PHONE_NUMBER` (formato E.164: `+1XXXXXXXXXX`)

4. **Geo Permissions:** Ir a [Console > Messaging > Settings](https://www.twilio.com/console/sms/settings/geo-permissions)
   - Habilitar países destino: Colombia, USA, México, España (según clientes)
   - Desactivar países no necesarios para evitar fraude

5. **Webhook URL (desarrollo):** Para pruebas locales usar [ngrok](https://ngrok.com/):
   ```bash
   ngrok http 3000
   # Ejemplo: https://abc123.ngrok.io → usar como TWILIO_WEBHOOK_BASE_URL
   ```

**Variables de entorno en `.env.local`:**

```env
# ─── Twilio (Fase 0) ───────────────────────────────────
TWILIO_MASTER_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MASTER_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+1xxxxxxxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WEBHOOK_BASE_URL=https://app.goadmin.io/api/integrations/twilio

# ─── Voice Agent (Fase 6) ──────────────────────────────
OPENAI_REALTIME_MODEL=gpt-4o-realtime
# ELEVENLABS_API_KEY=xi_...       (Fase 7)
# DEEPGRAM_API_KEY=dg_...         (Fase 8)
```

**Entregable:** Cuenta Twilio operativa con credenciales en `.env.local`.

---

### Fase 1 — Migraciones de Base de Datos ✅

**Objetivo:** Preparar todas las tablas, columnas, funciones y triggers.

**Estado:** Completada

**Checklist:**
- [x] Agregar columnas `comm_sms_monthly`, `comm_whatsapp_monthly`, `comm_voice_minutes_monthly`, `comm_voice_agent_enabled` a `plans`
- [x] Actualizar valores por plan (Free=0, Pro=50, Business=200, Ultimate=1000, Enterprise=NULL ilimitado)
- [x] Crear tabla `comm_settings` (créditos, subcuenta Twilio, config Voice Agent)
- [x] Crear tabla `comm_usage_logs` (historial de uso por canal)
- [x] Crear función `sync_comm_credits_on_subscription()` + trigger
- [x] Crear función `deduct_comm_credits(org_id, channel, amount)`
- [x] Crear RLS policies para ambas tablas
- [x] Crear índices en `comm_usage_logs`

**1.1 Agregar columnas a `plans`:**

```sql
ALTER TABLE plans
  ADD COLUMN comm_sms_monthly INTEGER DEFAULT 0,
  ADD COLUMN comm_whatsapp_monthly INTEGER DEFAULT 0,
  ADD COLUMN comm_voice_minutes_monthly INTEGER DEFAULT 0,
  ADD COLUMN comm_voice_agent_enabled BOOLEAN DEFAULT FALSE;

-- Actualizar planes existentes
UPDATE plans SET comm_sms_monthly = 50,  comm_whatsapp_monthly = 50,  comm_voice_minutes_monthly = 0,   comm_voice_agent_enabled = FALSE WHERE code = 'pro';
UPDATE plans SET comm_sms_monthly = 200, comm_whatsapp_monthly = 200, comm_voice_minutes_monthly = 30,  comm_voice_agent_enabled = FALSE WHERE code = 'business';
UPDATE plans SET comm_sms_monthly = 1000,comm_whatsapp_monthly = 1000,comm_voice_minutes_monthly = 200, comm_voice_agent_enabled = TRUE  WHERE code = 'ultimate';
UPDATE plans SET comm_sms_monthly = NULL,comm_whatsapp_monthly = NULL,comm_voice_minutes_monthly = NULL,comm_voice_agent_enabled = TRUE  WHERE code = 'enterprise';
-- NULL = ilimitado
```

**1.2 Crear tabla `comm_settings`:**

```sql
CREATE TABLE comm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Créditos restantes (NULL = ilimitado)
  sms_remaining INTEGER,
  whatsapp_remaining INTEGER,
  voice_minutes_remaining INTEGER,
  -- Twilio Subaccount
  twilio_subaccount_sid TEXT,
  twilio_subaccount_auth_token TEXT, -- Cifrado
  -- Números asignados
  phone_number TEXT,
  whatsapp_number TEXT,
  -- Voice Agent
  voice_agent_enabled BOOLEAN DEFAULT FALSE,
  voice_agent_config JSONB DEFAULT '{}',
  -- Control
  is_active BOOLEAN DEFAULT TRUE,
  credits_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

ALTER TABLE comm_settings ENABLE ROW LEVEL SECURITY;
```

**1.3 Crear tabla `comm_usage_logs`:**

```sql
CREATE TABLE comm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'voice')),
  credits_used INTEGER DEFAULT 1,
  twilio_message_sid TEXT,
  recipient TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  module TEXT, -- 'pms', 'pos', 'crm', etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comm_usage_org ON comm_usage_logs(organization_id);
CREATE INDEX idx_comm_usage_channel ON comm_usage_logs(channel);
CREATE INDEX idx_comm_usage_created ON comm_usage_logs(created_at);

ALTER TABLE comm_usage_logs ENABLE ROW LEVEL SECURITY;
```

**1.4 Crear función `sync_comm_credits_on_subscription`:**

```sql
-- Trigger: al cambiar suscripción → sincronizar créditos de comunicación
CREATE OR REPLACE FUNCTION sync_comm_credits_on_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_plan RECORD;
BEGIN
  SELECT comm_sms_monthly, comm_whatsapp_monthly, comm_voice_minutes_monthly, comm_voice_agent_enabled
  INTO v_plan FROM plans WHERE id = NEW.plan_id;

  INSERT INTO comm_settings (organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining, voice_agent_enabled, credits_reset_at)
  VALUES (NEW.organization_id, v_plan.comm_sms_monthly, v_plan.comm_whatsapp_monthly, v_plan.comm_voice_minutes_monthly, v_plan.comm_voice_agent_enabled, NOW() + INTERVAL '1 month')
  ON CONFLICT (organization_id) DO UPDATE SET
    sms_remaining = v_plan.comm_sms_monthly,
    whatsapp_remaining = v_plan.comm_whatsapp_monthly,
    voice_minutes_remaining = v_plan.comm_voice_minutes_monthly,
    voice_agent_enabled = v_plan.comm_voice_agent_enabled,
    credits_reset_at = NOW() + INTERVAL '1 month',
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_comm_credits
AFTER INSERT OR UPDATE OF plan_id ON subscriptions
FOR EACH ROW EXECUTE FUNCTION sync_comm_credits_on_subscription();
```

**1.5 Crear función `deduct_comm_credits`:**

```sql
CREATE OR REPLACE FUNCTION deduct_comm_credits(
  p_org_id INTEGER,
  p_channel TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Obtener créditos restantes
  EXECUTE format(
    'SELECT %I FROM comm_settings WHERE organization_id = $1 AND is_active = TRUE',
    p_channel || '_remaining'
  ) INTO v_remaining USING p_org_id;

  -- NULL = ilimitado (Enterprise)
  IF v_remaining IS NULL THEN RETURN TRUE; END IF;

  -- Verificar suficientes créditos
  IF v_remaining < p_amount THEN RETURN FALSE; END IF;

  -- Descontar
  EXECUTE format(
    'UPDATE comm_settings SET %I = %I - $1, updated_at = NOW() WHERE organization_id = $2',
    p_channel || '_remaining', p_channel || '_remaining'
  ) USING p_amount, p_org_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**1.6 RLS Policies:**

```sql
-- comm_settings: org solo ve/edita la suya
CREATE POLICY comm_settings_org ON comm_settings
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- comm_usage_logs: org solo ve los suyos
CREATE POLICY comm_usage_logs_org ON comm_usage_logs
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
```

**Entregable:** Todas las tablas, funciones y triggers creados en Supabase.

---

### Fase 2 — Servicio Core Twilio (Backend) ✅

**Objetivo:** Crear los servicios TypeScript que interactúan con la API de Twilio.

**Estado:** Completada

**Checklist:**
- [x] `npm install twilio`
- [x] `twilioTypes.ts` — Interfaces y errores personalizados
- [x] `twilioConfig.ts` — Cliente master, helpers E.164, WhatsApp
- [x] `twilioSubaccounts.ts` — Crear/obtener/suspender subcuentas por org
- [x] `twilioService.ts` — Enviar SMS/WhatsApp con créditos y logging
- [x] `twilioVerifyService.ts` — OTP: enviar y verificar código
- [x] `twilioWebhook.ts` — Procesar mensajes entrantes, status callbacks, llamadas
- [x] `commCreditsService.ts` — Consultar créditos, historial, resumen mensual
- [x] `index.ts` — Barrel export

**Dependencia:** `npm install twilio`

**Archivos a crear:**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/services/integrations/twilio/twilioConfig.ts` | Cliente Twilio master, helpers, tipos base |
| `src/lib/services/integrations/twilio/twilioTypes.ts` | Interfaces TypeScript |
| `src/lib/services/integrations/twilio/twilioSubaccounts.ts` | Crear/obtener subcuenta por org |
| `src/lib/services/integrations/twilio/twilioService.ts` | Enviar SMS, WhatsApp, llamar |
| `src/lib/services/integrations/twilio/twilioVerifyService.ts` | OTP: enviar y verificar código |
| `src/lib/services/integrations/twilio/twilioWebhook.ts` | Procesar webhooks entrantes |
| `src/lib/services/commCreditsService.ts` | Gestión de créditos (deducir, consultar, reset) |

**Flujo principal de `twilioService.send()`:**

```
1. Recibe: orgId, channel, to, body, module
2. Consulta comm_settings → obtiene subcuenta y créditos
3. Llama deduct_comm_credits() → ¿hay créditos?
   - NO → throw InsufficientCreditsError
   - SÍ → continuar
4. Crea cliente Twilio con subcuenta
5. Envía mensaje según canal (SMS/WhatsApp)
6. Registra en comm_usage_logs
7. Retorna SID del mensaje
```

**Entregable:** Servicios funcionales, se puede enviar SMS/WhatsApp desde código.

---

### Fase 3 — API Routes + Webhooks ✅

**Objetivo:** Exponer endpoints REST y recibir webhooks de Twilio.

**Estado:** Completada

**Checklist:**
- [x] `send-sms/route.ts` — POST enviar SMS (auth + créditos)
- [x] `send-whatsapp/route.ts` — POST enviar WhatsApp (auth + créditos)
- [x] `incoming-message/route.ts` — Webhook mensajes entrantes (valida firma)
- [x] `status-callback/route.ts` — Webhook status updates
- [x] `verify/send/route.ts` — Enviar código OTP
- [x] `verify/check/route.ts` — Verificar código OTP
- [x] `voice/incoming/route.ts` — Llamada entrante → TwiML
- [x] `credits/route.ts` — GET créditos restantes + uso mensual
- [x] `usage/route.ts` — GET historial de uso con filtros

**Archivos a crear:**

```
src/app/api/integrations/twilio/
  send-sms/route.ts            # POST — Enviar SMS
  send-whatsapp/route.ts       # POST — Enviar WhatsApp
  incoming-message/route.ts    # POST — Webhook: mensaje entrante
  status-callback/route.ts     # POST — Webhook: status update
  verify/
    send/route.ts              # POST — Enviar OTP
    check/route.ts             # POST — Verificar OTP
  voice/
    incoming/route.ts          # POST — Llamada entrante → TwiML
    agent/route.ts             # POST/WS — Voice Agent endpoint
  credits/route.ts             # GET — Consultar créditos restantes
  usage/route.ts               # GET — Historial de uso
```

**Seguridad en webhooks:**
- Validar firma Twilio con `twilio.validateRequest()`
- Rate limiting en endpoints de envío
- Autenticación JWT en endpoints de consulta

**Entregable:** APIs listas para enviar mensajes y recibir webhooks.

---

### Fase 4 — Panel de Configuración (UI) ✅

**Objetivo:** Interfaz para que el admin de la organización vea y configure comunicaciones.

**Estado:** Completada

**Checklist:**
- [x] Página `/app/integraciones/twilio` con dashboard de comunicaciones
- [x] Tarjetas de créditos restantes (SMS, WhatsApp, Voz)
- [x] Uso mensual por canal
- [x] Status de Voice Agent (si habilitado)
- [x] Historial de actividad reciente (últimos 10 logs)
- [x] Badges de estado por mensaje
- [x] Fecha de reinicio de créditos
- [x] Soporte dark mode completo

**Ruta:** `/app/integraciones/twilio`

**Componentes:**

```
src/components/integraciones/twilio/
  TwilioOverview.tsx          # Estado general (activo/inactivo, plan, número)
  CommCreditsCard.tsx         # Créditos restantes (SMS, WhatsApp, Voz)
  CommUsageHistory.tsx        # Tabla de historial de uso
  CommUsageChart.tsx          # Gráfico de uso por canal/mes
  TwilioSettings.tsx          # Configuración (activar, número, webhook URLs)
  VoiceAgentConfig.tsx        # Configuración Voice Agent (prompt, voz, tools)
```

**Funcionalidades:**
- Ver créditos restantes por canal
- Ver historial de mensajes enviados/recibidos
- Activar/desactivar canales
- Configurar Voice Agent (solo Ultimate/Enterprise)
- Ver número de teléfono asignado

**Entregable:** Panel funcional de gestión de comunicaciones.

---

### Fase 5 — Integración por Módulo — Mensajería 

**Objetivo:** Conectar cada módulo del ERP con el servicio de envío.

**Estado:** Completada

**Checklist:**
- [x] `commNotificationService.ts` — Servicio centralizado con templates por módulo
- [x] Templates para 13 módulos: Auth, PMS, POS, CRM, Calendario, HRM, Finanzas, Inventario, Chat, Notificaciones, Gimnasio, Parqueadero, Transporte
- [x] `notify()` — Envío con template + variables
- [x] `sendCustom()` — Envío con mensaje personalizado
- [x] `notifyBulk()` — Envío masivo con rate limiting
- [x] `getTemplatesForModule()` — Listar templates disponibles por módulo

**Patrón general por módulo:**

```typescript
// Ejemplo en cualquier módulo
import { twilioService } from '@/lib/services/integrations/twilio/twilioService';

// Al confirmar reserva (PMS)
await twilioService.send({
  orgId: reservation.organization_id,
  channel: 'whatsapp',
  to: customer.phone,
  body: `Hola ${customer.first_name}, tu reserva #${reservation.code} está confirmada.`,
  module: 'pms',
});
```

**Orden de integración recomendado:**

| Prioridad | Módulo | Caso de uso inicial | Tabla principal |
|---|---|---|---|
| 1 | **Auth** | Verificación 2FA (OTP) | `auth.users` |
| 2 | **PMS** | Confirmación de reserva | `reservations`, `customers` |
| 3 | **POS** | Pedido listo para recoger | `orders`, `customers` |
| 4 | **CRM** | Campañas de marketing | `customers`, `campaigns` |
| 5 | **Calendario** | Recordatorio de evento | `custom_events` |
| 6 | **HRM** | Notificación de turno | `employees`, `shifts` |
| 7 | **Finanzas** | Recordatorio pago pendiente | `accounts_receivable` |
| 8 | **Inventario** | Alerta stock bajo | `products`, `inventory` |
| 9 | **Chat** | Canal WhatsApp integrado | `conversations`, `messages` |
| 10 | **Notificaciones** | Alertas críticas SMS | `notifications` |
| 11 | **Gimnasio** | Recordatorio clase | `gym_classes`, `gym_members` |
| 12 | **Parqueadero** | Notificación entrada/salida | `parking_sessions` |
| 13 | **Transporte** | Confirmación boleto | `transport_tickets` |

**Por cada módulo se necesita:**
1. Identificar el **evento** que dispara el envío (ej: reserva confirmada)
2. Identificar la **tabla** de donde sale el teléfono del destinatario
3. Definir el **template** del mensaje
4. Agregar la llamada a `twilioService.send()` en el punto correcto del flujo
5. Opcionalmente, agregar toggle en UI para activar/desactivar notificación

**Entregable:** Cada módulo puede enviar SMS/WhatsApp en sus flujos clave.

---

### Fase 6 — Voice Agent v1 (Twilio + OpenAI Realtime) ✅

**Objetivo:** Agente de voz IA que atiende llamadas y ejecuta acciones en el ERP.

**Estado:** Completada

**Checklist:**
- [x] `voiceAgentPrompts.ts` — System prompts dinámicos por org, idioma, tono, módulos
- [x] `voiceAgentTools.ts` — 7 function tools (check_availability, create/lookup/cancel reservation, get_business_info, transfer_to_agent, take_message)
- [x] `realtimeSession.ts` — Sesión WebSocket bidireccional con OpenAI Realtime API
- [x] `voiceAgentService.ts` — Orquestador: conecta Twilio Media Stream ↔ OpenAI, gestiona créditos, logs
- [x] `voice/media-stream/route.ts` — Placeholder WebSocket (requiere servidor dedicado en producción)
- [x] `voiceAgent/index.ts` — Barrel export

**Dependencias:** OpenAI Realtime API (ya tiene `OPENAI_API_KEY`)

**Archivos a crear:**

```
src/lib/services/integrations/twilio/voiceAgent/
  voiceAgentService.ts        # Orquestador principal
  realtimeSession.ts          # Gestión de sesión OpenAI Realtime (WebSocket)
  voiceAgentTools.ts          # Function tools por módulo
  voiceAgentPrompts.ts        # System prompts por tipo de negocio
```

**Arquitectura: ConversationRelay (texto ↔ texto)**

Twilio maneja STT/TTS automáticamente. Nuestro servidor solo procesa texto.

```
1. Cliente llama al número Twilio de la organización
   ↓
2. Twilio webhook → POST /api/integrations/twilio/voice/incoming
   ↓
3. Responde con TwiML: <Connect><ConversationRelay url="wss://..."> 
   ↓
4. Twilio conecta WebSocket a ws-server.ts (puerto 8080)
   ↓
5. Twilio hace STT → envía TEXTO al WS server (evento "prompt")
   ↓
6. conversationRelayHandler → OpenAI Chat Completions (con streaming)
   ↓
7. Si OpenAI decide ejecutar function → voiceAgentTools ejecuta contra Supabase
   ↓
8. Respuesta TEXTO → WS server → Twilio hace TTS → Cliente escucha
   ↓
9. Conversación continúa hasta que cuelgue
   ↓
10. Al colgar → registrar en comm_usage_logs (minutos, acciones ejecutadas)
```

**Ventajas vs Media Stream:**
- No requiere OpenAI Realtime API (usa Chat Completions estándar)
- Twilio maneja STT+TTS — menor latencia y complejidad
- Servidor solo procesa texto JSON — mucho más simple
- Soporta interrupciones nativas

**Archivos clave:**
```
ws-server.ts                                          # Servidor WebSocket standalone (puerto 8080)
src/lib/services/integrations/twilio/voiceAgent/
  conversationRelayHandler.ts   # Handler principal (texto ↔ OpenAI Chat)
  voiceAgentTools.ts            # Function tools por módulo (sin cambios)
  voiceAgentPrompts.ts          # System prompts (sin cambios)
```

**Variables de entorno:**
```env
WS_SERVER_URL=wss://tu-dominio.com:8080
WS_PORT=8080
```

**Ejecución del WS server:**
```bash
npx tsx ws-server.ts
```

**Function Tools iniciales:**

| Tool | Módulo | Acción |
|---|---|---|
| `consultar_disponibilidad` | PMS | Busca espacios disponibles por fecha |
| `crear_reserva` | PMS | Crea reserva con datos del cliente |
| `consultar_pedido` | POS | Busca pedido por código |
| `registrar_pedido` | POS | Crea pedido por teléfono |
| `agendar_cita` | Calendario | Crea evento/cita |
| `consultar_horarios` | Gimnasio | Lista horarios de clases |
| `consultar_saldo` | Finanzas | Consulta saldo pendiente |

**Entregable:** Voice Agent funcional que atiende llamadas y ejecuta acciones en el ERP.

---

### Fase 7 — Voice Agent v2 (+ ElevenLabs TTS) ✅

**Objetivo:** Reemplazar TTS de OpenAI con voces más naturales de ElevenLabs.

**Estado:** Completada

**Checklist:**
- [x] `elevenLabsTTS.ts` — `textToSpeech()` y `textToSpeechStream()` con API de ElevenLabs

**Archivos a crear:**

```
src/lib/services/integrations/twilio/voiceAgent/
  elevenLabsTTS.ts            # Servicio ElevenLabs
```

**Cambios:**
- `realtimeSession.ts` envía solo texto a ElevenLabs en vez de usar TTS de OpenAI
- ElevenLabs genera audio y lo envía por el WebSocket de Twilio
- Configuración de voz por organización en `voice_agent_config` (JSONB)

**Beneficios:**
- Voces ultra-realistas
- Clonación de voz (voz personalizada por negocio)
- Múltiples idiomas y acentos

---

### Fase 8 — Voice Agent v3 (+ Deepgram STT) ✅

**Objetivo:** Reemplazar STT de OpenAI con Deepgram para mayor control.

**Estado:** Completada

**Checklist:**
- [x] `deepgramSTT.ts` — `createDeepgramStream()` (WebSocket streaming) y `transcribeAudio()` (batch)

**Archivos a crear:**

```
src/lib/services/integrations/twilio/voiceAgent/
  deepgramSTT.ts              # Servicio Deepgram
```

**Cambios:**
- Audio del cliente va primero a Deepgram (STT) → texto
- Texto va a OpenAI (solo LLM, sin audio) → respuesta texto
- Respuesta texto va a ElevenLabs (TTS) → audio
- Mayor control sobre: idioma, diarización, timestamps, confianza

---

### Fase 9 — Testing + Deploy

**Objetivo:** Asegurar que todo funciona antes de producción.

**9.1 Testing Sandbox:**
- Usar números de prueba de Twilio (Magic Numbers)
- Sandbox de WhatsApp para pruebas
- OpenAI Realtime en modo test

**9.2 Tests unitarios:**
- `twilioService.test.ts` — Envío de SMS/WhatsApp mock
- `commCreditsService.test.ts` — Deducción de créditos
- `voiceAgentTools.test.ts` — Function calling

**9.3 Tests de integración:**
- Flujo completo: módulo → servicio → Twilio → webhook → log
- Voice Agent: llamada → STT → LLM → function → TTS → respuesta

**9.4 Checklist pre-deploy:**
- [ ] Variables de entorno en producción
- [ ] Webhook URLs apuntan a dominio de producción
- [ ] Geo Permissions configurados
- [ ] Rate limiting activo
- [ ] Firma de webhooks validada
- [ ] RLS policies activas
- [ ] Créditos sincronizados con planes en Stripe
- [ ] Monitoreo de errores activo

**Entregable:** Sistema en producción, estable y monitoreado.

---

### Dependencias entre Fases

```
Fase 0 (Cuenta Twilio)
  ↓
Fase 1 (Base de Datos)
  ↓
Fase 2 (Servicio Core)
  ↓
┌─────────────┬──────────────┐
↓             ↓              ↓
Fase 3        Fase 4         Fase 6
(API Routes)  (UI Config)    (Voice Agent v1)
↓                            ↓
Fase 5                  ┌────┴────┐
(Módulos)               ↓         ↓
                    Fase 7    Fase 8
                    (ElevenLabs) (Deepgram)
                        ↓         ↓
                    └────┬────┘
                         ↓
                      Fase 9 (Testing + Deploy)
```

> **Nota:** Fases 3, 4 y 6 pueden trabajarse **en paralelo** después de Fase 2. Fases 7 y 8 son opcionales y solo aplican si se quiere mejorar la calidad del Voice Agent.

---

## 22. Referencias

- [Documentación General](https://www.twilio.com/docs)
- [Messaging API](https://www.twilio.com/docs/messaging/api/message-resource)
- [WhatsApp Business](https://www.twilio.com/docs/whatsapp)
- [Voice API](https://www.twilio.com/docs/voice/api/call-resource)
- [Verify API](https://www.twilio.com/docs/verify/api)
- [Lookup API](https://www.twilio.com/docs/lookup)
- [Content Templates](https://www.twilio.com/docs/content)
- [Webhooks](https://www.twilio.com/docs/messaging/guides/webhook-request)
- [Precios](https://www.twilio.com/en-us/pricing)
- [Consola](https://www.twilio.com/console)
- [Status de API](https://status.twilio.com)
- [SDK Node.js](https://www.twilio.com/docs/libraries/reference/twilio-node)
