# Integración WhatsApp Business – Cloud API (Meta)

> **Ref oficial:** https://developers.facebook.com/docs/whatsapp/cloud-api/  
> **Get Started:** https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/  
> **Webhooks:** https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/  
> **Pricing:** https://developers.facebook.com/docs/whatsapp/pricing  
> **Message Templates:** https://developers.facebook.com/docs/whatsapp/message-templates/  
> **API Reference:** https://developers.facebook.com/docs/whatsapp/cloud-api/reference/  
> **Meta Business Suite:** https://business.facebook.com/  
> **App Dashboard:** https://developers.facebook.com/apps/  
> **Fecha:** 2026-02-09

---

## 1. Resumen General

La integración de WhatsApp Business Cloud API permite a los clientes de GO Admin ERP:

| Funcionalidad                  | Descripción                                                              |
|--------------------------------|--------------------------------------------------------------------------|
| **Mensajería entrante**        | Recibir mensajes de clientes vía WhatsApp en el CRM/Inbox               |
| **Mensajería saliente**        | Responder a clientes dentro de la ventana de 24h                         |
| **Message Templates**          | Enviar mensajes proactivos fuera de la ventana de 24h (preaprobados)     |
| **Notificaciones automáticas** | Enviar confirmaciones de pedido, reserva, pago, etc.                     |
| **Campañas masivas**           | Broadcasts de marketing a segmentos de clientes                          |
| **Webhooks en tiempo real**    | Recibir eventos de entrega, lectura y estado de mensajes                 |
| **Media (archivos)**           | Enviar/recibir imágenes, documentos, audio y video                       |
| **IA conversacional**          | Integración con modo IA (off/hybrid/auto) para respuestas automáticas    |

### Separación con conectores existentes

| Conector en BD         | ID                                     | Provider              | Propósito                     |
|------------------------|----------------------------------------|-----------------------|-------------------------------|
| `whatsapp_cloud`       | `9ba81290-1272-4cf1-9dc5-a06feb762d21` | WhatsApp Business     | WhatsApp Cloud API (Meta)     |
| `twilio_whatsapp`      | `924945c1-4608-4603-8bf6-9ffb8fef68a8` | Twilio                | WhatsApp vía Twilio           |
| `meta_messenger`       | `f33b71cc-eb8f-4872-b93c-0f7278db70e3` | Meta                  | Facebook Messenger            |
| `meta_instagram`       | `712707e4-613f-436c-9825-f3fbf2d37ed4` | Meta                  | Instagram Messaging           |
| `meta_marketing`       | `1894a4af-4be2-46a6-b342-ab734d4e0479` | Meta                  | Catálogo + Pixel + CAPI       |

> **`whatsapp_cloud`** es la integración nativa de WhatsApp Cloud API vía Meta. Se usa directamente con credenciales de la Meta App.
> **`twilio_whatsapp`** es una alternativa vía Twilio (requiere cuenta y número Twilio).

---

## 2. Arquitectura de WhatsApp Business Platform

```
Meta Business Suite
├── Meta Business Account (business_id)
│   ├── WhatsApp Business Account (WABA)
│   │   ├── Phone Number (phone_number_id)
│   │   ├── Message Templates
│   │   └── Business Profile
│   └── Facebook App (app_id + app_secret)
│       ├── WhatsApp Product (habilitado)
│       ├── Webhooks Configuration
│       └── System User Token (access_token)
└── Payment Method (para mensajes de pago)
```

### Conceptos clave

- **WABA (WhatsApp Business Account):** Contenedor de números y templates. Cada empresa tiene uno.
- **Phone Number ID:** Identificador único del número de teléfono registrado en la API.
- **Business Account ID:** ID de la cuenta de WhatsApp Business en Meta.
- **Access Token:** Token permanente de System User para llamadas API (NO expira si es System User).
- **Webhook Verify Token:** Token personalizado para verificar la URL del webhook.
- **Message Template:** Mensajes pre-aprobados por Meta para enviar fuera de la ventana de 24h.
- **Ventana de 24h:** Periodo en que se puede responder libremente después del último mensaje del cliente.

---

## 3. Requisitos Previos

### 3.1. Para GO Admin (una sola vez)

| Requisito                     | Descripción                                                      |
|-------------------------------|------------------------------------------------------------------|
| **Meta Business Account**     | Cuenta de negocio en Meta (business.facebook.com)                |
| **Facebook App**              | App de desarrollo en developers.facebook.com                     |
| **WhatsApp Product**          | Producto WhatsApp habilitado dentro de la Facebook App           |
| **Verificación de negocio**   | Verificar el negocio en Meta Business Manager (opcional inicial) |
| **Servidor con HTTPS**        | Para recibir webhooks (callback URL)                             |

### 3.2. Para cada Cliente de GO Admin

| Requisito                     | Descripción                                                      |
|-------------------------------|------------------------------------------------------------------|
| **WhatsApp Business Account** | WABA propia del cliente                                          |
| **Número de teléfono**        | Número registrado en la Cloud API (NO puede estar en WhatsApp personal) |
| **Verificación de negocio**   | Necesaria para escalar más de 250 conversaciones/día             |
| **Método de pago**            | Configurado en Meta Business Manager para mensajes de pago       |

---

## 4. Credenciales Requeridas

### 4.1. Variables de Entorno (servidor GO Admin)

| Variable                              | Descripción                                      | Dónde obtenerla                                                |
|---------------------------------------|--------------------------------------------------|----------------------------------------------------------------|
| `WHATSAPP_VERIFY_TOKEN`               | Token para verificar webhook (lo defines tú)     | Inventado por GO Admin (string aleatorio)                      |
| `NEXT_PUBLIC_APP_URL`                 | URL base de GO Admin                             | Ya existente: `https://app.goadmin.io`                         |
| `NEXT_PUBLIC_META_APP_ID`             | App ID de Facebook (público, para SDK frontend)  | Meta App Dashboard → Settings → Basic                          |
| `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`      | Configuration ID para Embedded Signup            | Meta App → Facebook Login for Business → Configuration         |
| `META_APP_ID`                         | App ID de Facebook (servidor)                    | Ya existente (compartido con Meta Marketing)                   |
| `META_APP_SECRET`                     | App Secret de Facebook                           | Ya existente (compartido con Meta Marketing)                   |

> **Nota:** GO Admin usa la misma Facebook App que Meta Marketing. Las variables `META_APP_ID` y `META_APP_SECRET` ya existen.

### 4.2. Credenciales por Cliente (en BD: `channel_credentials`)

| Campo                    | Descripción                                        | Cómo se obtiene                                |
|--------------------------|----------------------------------------------------|------------------------------------------------|
| `phone_number_id`        | ID del número de teléfono en la Cloud API          | Meta App → WhatsApp → API Setup                |
| `business_account_id`    | ID de la WABA                                      | Meta App → WhatsApp → API Setup                |
| `access_token`           | Token permanente del System User                   | Meta Business Manager → System Users → Tokens  |
| `webhook_verify_token`   | Token para verificar webhook (compartido)          | Definido por GO Admin                          |
| `app_id`                 | ID de la Facebook App (opcional, para OAuth)        | Meta App Dashboard                             |
| `app_secret`             | Secreto de la Facebook App (opcional)               | Meta App Dashboard                             |

---

## 5. Autenticación

WhatsApp Cloud API usa **Bearer Token** con el `access_token` del System User:

```
Authorization: Bearer {access_token}
```

### Tipos de tokens

| Tipo                   | Duración        | Uso                                           |
|------------------------|-----------------|-----------------------------------------------|
| **Temporary Token**    | 24 horas        | Para pruebas iniciales (Meta App Dashboard)   |
| **System User Token**  | No expira       | Para producción (Meta Business Manager)       |
| **User Token**         | ~60 días        | Para OAuth (renovable)                        |

> **Recomendación:** Usar System User Token en producción (no expira, no requiere refresh).

---

## 5.1. Embedded Signup (Conexión Automática)

GO Admin implementa **WhatsApp Embedded Signup** de Meta, que permite a los clientes conectar su WhatsApp Business API con un solo clic, sin necesidad de copiar credenciales manualmente.

### Flujo

```
1. Cliente hace clic en "Conectar con WhatsApp" (en Integraciones o CRM → Canales)
      ↓
2. Se carga el Facebook JS SDK y se abre popup de Facebook (FB.login)
      ↓
3. El cliente:
   - Se autentica con Facebook
   - Crea o selecciona su WhatsApp Business Account (WABA)
   - Selecciona o registra un número de teléfono
   - Acepta permisos (whatsapp_business_management, whatsapp_business_messaging)
      ↓
4. Facebook devuelve a GO Admin:
   - code (authorization code)
   - phone_number_id (vía sessionInfo / postMessage)
   - waba_id (vía sessionInfo / postMessage)
      ↓
5. GO Admin POST /api/integrations/whatsapp/oauth/callback:
   - Intercambia code → short-lived token → long-lived token
   - Valida acceso al phone_number_id
   - Genera webhook_verify_token automáticamente
   - Guarda credenciales en channel_credentials Y integration_credentials
   - Crea/vincula canal ↔ conexión de integración
   - Registra webhook automáticamente vía POST /{app_id}/subscriptions
      ↓
6. Todo configurado: 0 credenciales manuales
```

### Permisos requeridos en la Facebook App

- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management`

### Configuración en Meta App Dashboard

1. Ir a **Meta App Dashboard** → tu app
2. Productos → **Facebook Login for Business** → agregar
3. Configuration → crear variación **WhatsApp Embedded Signup**
4. Copiar el **Configuration ID** generado
5. Agregarlo a `.env` como `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`

### Código del botón (frontend)

```typescript
FB.login(callback, {
  config_id: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: '',
    sessionInfoVersion: 2,
  },
});
```

### Token exchange (backend)

```
// 1. code → short-lived token
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &code={code}
  &redirect_uri=

// 2. short-lived → long-lived token
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={short_lived_token}
```

### Modos disponibles

| Modo | Descripción | Cuándo usar |
|------|-------------|-------------|
| **Embedded Signup** | Botón "Conectar con WhatsApp" (automático) | Para la mayoría de clientes |
| **Manual** | Campos de credenciales (phone_number_id, access_token, etc.) | System User Token permanente ya existente |

### Archivos involucrados

| Archivo | Descripción |
|---------|-------------|
| `/api/integrations/whatsapp/oauth/callback/route.ts` | API route: intercambia code, guarda credenciales, registra webhook |
| `StepCredentials.tsx` | UI wizard de integraciones: botón Embedded Signup + fallback manual |
| `WhatsAppCredentialsCard.tsx` | UI CRM canales: botón Embedded Signup + fallback manual |

---

## 6. API Base y Endpoints Principales

### 6.1. URL Base

```
https://graph.facebook.com/v21.0
```

> La versión puede cambiar. Actualmente v21.0 (enero 2025). Meta depreca versiones cada ~2 años.

### 6.2. Endpoints Principales

#### Enviar Mensaje de Texto

```
POST /{phone_number_id}/messages
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "text",
  "text": {
    "body": "Hola, tu pedido #1234 ha sido confirmado."
  }
}
```

**Respuesta exitosa:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "573001234567", "wa_id": "573001234567" }],
  "messages": [{ "id": "wamid.XXXXX" }]
}
```

#### Enviar Imagen

```
POST /{phone_number_id}/messages

{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "image",
  "image": {
    "link": "https://example.com/image.jpg",
    "caption": "Tu factura"
  }
}
```

#### Enviar Documento

```
POST /{phone_number_id}/messages

{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "document",
  "document": {
    "link": "https://example.com/factura.pdf",
    "caption": "Factura #1234",
    "filename": "factura_1234.pdf"
  }
}
```

#### Enviar Message Template

```
POST /{phone_number_id}/messages

{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "es" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Juan" },
          { "type": "text", "text": "#1234" }
        ]
      }
    ]
  }
}
```

#### Marcar Mensaje como Leído

```
POST /{phone_number_id}/messages

{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.XXXXX"
}
```

#### Obtener Business Profile

```
GET /{phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical
Authorization: Bearer {access_token}
```

#### Obtener Message Templates

```
GET /{business_account_id}/message_templates?fields=name,language,status,category,components
Authorization: Bearer {access_token}
```

---

## 7. Webhooks

### 7.1. Configuración del Webhook

La URL del webhook de GO Admin para WhatsApp será:

```
https://app.goadmin.io/api/integrations/whatsapp/webhook
```

#### Verificación (GET)

Meta envía un GET para verificar la URL:

```
GET /api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.challenge=CHALLENGE&hub.verify_token=TOKEN
```

GO Admin debe:
1. Verificar que `hub.verify_token` coincida con el `WHATSAPP_VERIFY_TOKEN`
2. Responder con `hub.challenge` como texto plano (status 200)

#### Recepción de Eventos (POST)

Meta envía un POST con eventos:

```
POST /api/integrations/whatsapp/webhook
Content-Type: application/json

{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "573001234567",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{ "profile": { "name": "Juan" }, "wa_id": "573009876543" }],
        "messages": [{
          "from": "573009876543",
          "id": "wamid.XXXXX",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Hola, necesito información" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 7.2. Tipos de Eventos del Webhook

| Campo `field`  | Descripción                                                  |
|----------------|--------------------------------------------------------------|
| `messages`     | Mensajes entrantes (text, image, document, audio, video, etc.) |
| `statuses`     | Estados de mensajes salientes (sent, delivered, read, failed)  |

#### Evento de Status

```json
{
  "statuses": [{
    "id": "wamid.XXXXX",
    "status": "delivered",
    "timestamp": "1234567890",
    "recipient_id": "573009876543"
  }]
}
```

**Estados posibles:**
- `sent` — Mensaje enviado al servidor de WhatsApp
- `delivered` — Mensaje entregado al dispositivo del destinatario
- `read` — Mensaje leído por el destinatario
- `failed` — Error al enviar (incluye `errors[]` con código y mensaje)

### 7.3. Suscripción a Eventos en Meta App

En la **Facebook App → WhatsApp → Configuration**:

1. **Callback URL:** `https://app.goadmin.io/api/integrations/whatsapp/webhook`
2. **Verify Token:** El mismo valor de `WHATSAPP_VERIFY_TOKEN`
3. **Webhook fields** a suscribir:
   - `messages` ✅ (obligatorio)
   - `message_template_status_update` (opcional, para saber si aprueban/rechazan templates)

---

## 8. Message Templates

### 8.1. Categorías

| Categoría         | Descripción                                      | Ejemplo                                   |
|-------------------|--------------------------------------------------|-------------------------------------------|
| **Marketing**     | Promociones, ofertas, noticias                   | "¡20% de descuento hoy!"                 |
| **Utility**       | Actualizaciones de transacciones                 | "Tu pedido #1234 fue enviado"            |
| **Authentication**| Códigos de verificación                          | "Tu código es: 123456"                   |

### 8.2. Estado de Templates

| Estado        | Descripción                           |
|---------------|---------------------------------------|
| `APPROVED`    | Aprobado, listo para usar             |
| `PENDING`     | En revisión por Meta                  |
| `REJECTED`    | Rechazado (debe modificar y reenviar) |

### 8.3. Componentes de un Template

```json
{
  "name": "order_update",
  "language": "es",
  "category": "UTILITY",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Actualización de Pedido"
    },
    {
      "type": "BODY",
      "text": "Hola {{1}}, tu pedido {{2}} está {{3}}."
    },
    {
      "type": "FOOTER",
      "text": "GO Admin ERP"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "URL", "text": "Ver Pedido", "url": "https://example.com/order/{{1}}" }
      ]
    }
  ]
}
```

---

## 9. Precios (desde julio 2025)

### 9.1. Modelo Híbrido

| Tipo                     | Cobro por         | Descripción                                          |
|--------------------------|-------------------|------------------------------------------------------|
| **Service Conversation** | Por conversación  | Cuando respondes a un cliente dentro de 24h           |
| **Marketing Template**   | Por mensaje       | Templates de marketing (siempre cobrados)             |
| **Utility Template**     | Por mensaje       | Templates utilitarios (gratis dentro de 24h)          |
| **Authentication**       | Por mensaje       | Templates de autenticación (siempre cobrados)         |

### 9.2. Conversaciones gratuitas

- **1,000 conversaciones de servicio gratuitas** al mes por WABA
- **Conversaciones desde anuncios/CTA:** Gratis durante 72h (incluye todos los mensajes)

### 9.3. Precios Colombia (referencia)

| Tipo                     | Costo aprox. (USD) |
|--------------------------|--------------------|
| Service Conversation     | ~$0.0088           |
| Marketing Template       | ~$0.0513           |
| Utility Template         | ~$0.0085           |
| Authentication Template  | ~$0.0340           |

> Los precios varían por país. Consultar: https://developers.facebook.com/docs/whatsapp/pricing

---

## 10. Límites de Mensajería

### 10.1. Límites por Tier

| Tier        | Mensajes únicos/24h | Requisito                                      |
|-------------|----------------------|------------------------------------------------|
| **Unverified** | 250               | Sin verificación de negocio                    |
| **Tier 1**  | 1,000                | Verificación de negocio completada             |
| **Tier 2**  | 10,000               | Buena calidad + volumen sostenido              |
| **Tier 3**  | 100,000              | Buena calidad + volumen sostenido              |
| **Tier 4**  | Ilimitado            | Buena calidad + volumen sostenido              |

> Los tier suben automáticamente si la calidad de mensajes es buena (rating: verde).

### 10.2. Límites de API

| Límite                        | Valor                               |
|-------------------------------|--------------------------------------|
| **Rate limit general**        | 80 mensajes/segundo por número       |
| **Media upload**              | 500 requests/min por número          |
| **Template messages**         | Según tier del número                |
| **Ventana de conversación**   | 24h desde último mensaje del cliente |

---

## 11. Tipos de Archivos Soportados

| Tipo       | Formatos                              | Tamaño máximo |
|------------|---------------------------------------|---------------|
| **Audio**  | AAC, AMR, MP3, MP4 Audio, OGG         | 16 MB         |
| **Video**  | MP4, 3GPP                             | 16 MB         |
| **Imagen** | JPEG, PNG                             | 5 MB          |
| **Documento** | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX | 100 MB    |
| **Sticker**| WEBP                                  | 100 KB        |

---

## 12. Base de Datos (Tablas Existentes en GO Admin)

### 12.1. Tablas del CRM/Messaging

| Tabla                        | Descripción                                           |
|------------------------------|-------------------------------------------------------|
| `channels`                   | Canales de comunicación (whatsapp, website, etc.)     |
| `channel_credentials`        | Credenciales por canal (phone_number_id, token, etc.) |
| `channel_website_settings`   | Config del widget web                                 |
| `channel_api_keys`           | API keys para integraciones externas                  |
| `conversations`              | Hilos de conversación por cliente y canal              |
| `messages`                   | Mensajes individuales (inbound/outbound)              |
| `message_events`             | Eventos de entrega/lectura (sent/delivered/read/failed)|
| `message_attachments`        | Archivos adjuntos (bucket, path, mime, tamaño)        |
| `message_reactions`          | Reacciones a mensajes                                 |

### 12.2. Tabla `channels`

| Campo                       | Tipo        | Descripción                                  |
|-----------------------------|-------------|----------------------------------------------|
| `id`                        | uuid (PK)   | ID del canal                                 |
| `organization_id`           | integer      | ID de la organización                        |
| `type`                      | text         | Tipo: `whatsapp`, `website`, `facebook`, etc.|
| `name`                      | text         | Nombre descriptivo del canal                 |
| `status`                    | text         | `active`, `inactive`, `pending`              |
| `public_key`                | text         | Llave pública (para widget web)              |
| `ai_mode`                   | text         | `off`, `hybrid`, `auto`                      |
| `business_hours`            | jsonb        | Horarios de atención                         |
| `auto_close_inactive_hours` | integer      | Horas para cerrar conv. inactivas (def: 24)  |
| `integration_connection_id` | uuid         | FK a `integration_connections` (opcional)     |
| `created_by`                | uuid         | Usuario que creó el canal                    |

### 12.3. Tabla `channel_credentials`

| Campo               | Tipo      | Descripción                                |
|---------------------|-----------|--------------------------------------------|
| `id`                | uuid (PK) | ID                                         |
| `channel_id`        | uuid (FK) | Canal asociado                             |
| `provider`          | text      | `meta` (para WhatsApp Cloud API)           |
| `credentials`       | jsonb     | Objeto con las credenciales (ver sección 4)|
| `is_valid`          | boolean   | Si las credenciales están validadas        |
| `last_validated_at` | timestamptz | Última validación                        |

### 12.4. Tabla `integration_providers` / `integration_connectors`

| Provider BD          | Provider ID                            | Connector                | Connector ID                           |
|----------------------|----------------------------------------|--------------------------|----------------------------------------|
| `whatsapp`           | `ba56a5d0-00df-4a6d-b2c9-c57deccc185f` | `whatsapp_cloud`        | `9ba81290-1272-4cf1-9dc5-a06feb762d21` |

### 12.5. Tabla `notification_channels`

| Canal   | Provider compatible | Descripción                              |
|---------|---------------------|------------------------------------------|
| `whatsapp` | `whatsapp`, `twilio` | Canal de notificaciones vía WhatsApp  |

---

## 13. Servicios Existentes en GO Admin

### 13.1. `whatsappChannelService.ts`

Ubicación: `src/lib/services/whatsappChannelService.ts`

**Métodos existentes:**

| Método                     | Descripción                                         |
|----------------------------|-----------------------------------------------------|
| `getChannel(channelId)`    | Obtener canal WhatsApp con credenciales              |
| `updateChannel(id, data)`  | Actualizar nombre, status, ai_mode, business_hours   |
| `saveCredentials(id, creds)` | Guardar/actualizar credenciales en `channel_credentials` |
| `validateWebhook(id)`      | Validar credenciales (placeholder)                   |
| `activateChannel(id)`      | Activar canal (requiere credenciales válidas)        |
| `getRecentEvents(id)`      | Obtener eventos recientes de mensajes                |
| `getStats(id)`             | Estadísticas: total, hoy, delivery rate, failed      |
| `logAudit(action, details)` | Registrar acción en `chat_audit_logs`               |

### 13.2. `chatChannelsService.ts`

Ubicación: `src/lib/services/chatChannelsService.ts`

Servicio general para TODOS los canales del CRM. Maneja:
- Listado de canales con website_settings y credentials
- CRUD de canales
- Widget sessions y stats

---

## 14. Flujo Completo de Integración

### 14.1. Paso a paso para GO Admin (una sola vez)

```
1. Ir a https://developers.facebook.com/apps/
2. Crear Facebook App (tipo: Business)
   - Nombre: "GO Admin WhatsApp"
   - Agregar producto: "WhatsApp"
3. En WhatsApp → API Setup:
   - Copiar el Phone Number ID de prueba (para testing)
   - Copiar el Temporary Access Token (para testing)
4. Configurar Webhook:
   - Callback URL: https://app.goadmin.io/api/integrations/whatsapp/webhook
   - Verify Token: (definir en WHATSAPP_VERIFY_TOKEN)
   - Suscribir: "messages"
5. Crear System User en Meta Business Manager:
   - Business Settings → System Users → Add
   - Tipo: Admin
   - Generar token con permisos:
     - whatsapp_business_management
     - whatsapp_business_messaging
6. Configurar variables de entorno:
   - WHATSAPP_VERIFY_TOKEN=<token de verificación>
   - (META_APP_ID y META_APP_SECRET ya existen de Meta Marketing)
```

### 14.2. Flujo de Conexión por Cliente

```
1. Cliente abre GO Admin ERP → CRM → Canales → Nuevo Canal WhatsApp
2. Ingresa credenciales:
   - Phone Number ID
   - Business Account ID (WABA ID)
   - Access Token (System User Token)
3. GO Admin valida el token con GET /{phone_number_id}
4. Si válido → Guarda en channel_credentials (is_valid: true)
5. Canal creado con status: active
6. Webhook ya está configurado globalmente → recibe mensajes de TODOS los números
7. GO Admin identifica a qué organización pertenece cada mensaje por phone_number_id
```

### 14.3. Flujo de Mensaje Entrante (Cliente → Negocio)

```
1. Cliente envía mensaje WhatsApp al número del negocio
2. Meta envía POST al webhook de GO Admin
3. GO Admin identifica el canal por phone_number_id
4. Busca/crea conversación en tabla conversations
5. Guarda mensaje en tabla messages (direction: inbound)
6. Si tiene adjuntos → descarga media y guarda en message_attachments
7. Si ai_mode != 'off' → envía a motor IA para respuesta automática
8. Agente ve el mensaje en el inbox del CRM
9. Agente responde → GO Admin envía via Cloud API
10. Guarda respuesta en messages (direction: outbound)
11. Webhook recibe status updates (sent → delivered → read)
```

### 14.4. Flujo de Notificación Automática (GO Admin → Cliente)

```
1. Evento en GO Admin (nueva reserva, pedido confirmado, pago recibido)
2. Sistema busca template aprobado correspondiente
3. Envía mensaje template via Cloud API
4. Guarda en messages (direction: outbound, type: template)
5. Registra evento en message_events
6. Si el cliente responde → abre ventana de 24h para conversación libre
```

---

## 15. Guía Paso a Paso: Configuración Inicial

### 15.1. Crear Facebook App para WhatsApp

1. Ve a https://developers.facebook.com/apps/
2. Clic en **"Create App"**
3. Selecciona **"Other"** como tipo
4. Selecciona **"Business"** como tipo de app
5. Nombre: `GO Admin WhatsApp Integration`
6. Asociar a tu **Meta Business Account**
7. Clic en **"Create App"**

### 15.2. Agregar Producto WhatsApp

1. En el dashboard de la app, busca **"WhatsApp"** en la sección de productos
2. Clic en **"Set Up"**
3. Asociar a tu WhatsApp Business Account (WABA)
4. Verás la pantalla de **"API Setup"** con:
   - **Phone Number ID** de prueba
   - **WhatsApp Business Account ID**
   - **Temporary Access Token** (24h)

### 15.3. Configurar Webhook

1. En la app → **WhatsApp → Configuration**
2. En "Webhook":
   - **Callback URL:** `https://app.goadmin.io/api/integrations/whatsapp/webhook`
   - **Verify Token:** El valor de tu variable `WHATSAPP_VERIFY_TOKEN`
3. Clic en **"Verify and Save"**
4. En "Webhook Fields", suscribir:
   - ✅ `messages`
   - ✅ `message_template_status_update` (opcional)

### 15.4. Crear System User Token (Producción)

1. Ve a **Meta Business Manager → Business Settings**
2. **System Users → Add**
3. Nombre: `GO Admin API`
4. Rol: **Admin**
5. **Generate Token:**
   - App: tu Facebook App
   - Permisos:
     - `whatsapp_business_management`
     - `whatsapp_business_messaging`
   - Token Expiration: **Never** (o 60 days si es User Token)
6. Copiar token → guardarlo como `access_token` en las credenciales

### 15.5. Registrar Número de Teléfono (Producción)

1. En la app → **WhatsApp → API Setup**
2. Clic en **"Add phone number"**
3. Ingresar datos del negocio:
   - Business name (nombre que verán los clientes)
   - Business category
   - Description
4. Ingresar número de teléfono
5. Verificar con código SMS o llamada
6. Copiar el nuevo **Phone Number ID**

> **⚠️ IMPORTANTE:** El número NO puede estar registrado en WhatsApp personal o WhatsApp Business App. Debe eliminarse de ahí primero.

### 15.6. Verificación de Negocio (para escalar)

Sin verificación:
- Máximo 250 conversaciones únicas/24h
- Máximo 2 números de teléfono

Con verificación:
- Hasta 1,000+ conversaciones/24h (escalable)
- Números ilimitados

1. Ve a **Business Settings → Business Info → Business Verification**
2. Sube documentos (registro de empresa, factura de servicios, etc.)
3. Meta revisa en 2-10 días hábiles

---

## 16. Variables de Entorno

### 16.1. Existentes (ya configuradas)

```env
NEXT_PUBLIC_APP_URL=https://app.goadmin.io
META_APP_ID=tu_meta_app_id            # Compartida con Meta Marketing
META_APP_SECRET=tu_meta_app_secret    # Compartida con Meta Marketing
```

### 16.2. Nuevas (a agregar)

```env
WHATSAPP_VERIFY_TOKEN=un_string_aleatorio_seguro
```

> Solo se necesita 1 variable nueva. El resto de credenciales (phone_number_id, access_token, etc.) se guardan por organización en `channel_credentials`.

---

## 17. API Routes (Implementadas ✅)

| Método | Ruta                                         | Descripción                                  | Estado |
|--------|----------------------------------------------|----------------------------------------------|--------|
| GET    | `/api/integrations/whatsapp/webhook`         | Verificación de webhook (challenge)          | ✅     |
| POST   | `/api/integrations/whatsapp/webhook`         | Recibir mensajes y eventos                   | ✅     |
| POST   | `/api/integrations/whatsapp/send`            | Enviar mensaje (texto, media, template)      | ✅     |
| POST   | `/api/integrations/whatsapp/validate`        | Validar credenciales de un canal             | ✅     |
| GET    | `/api/integrations/whatsapp/templates`       | Listar templates de un WABA                  | ✅     |
| POST   | `/api/integrations/whatsapp/mark-read`       | Marcar mensaje como leído                    | ✅     |

### 17.1. Archivos de servicio (Implementados ✅)

| Archivo                                                         | Descripción                              |
|-----------------------------------------------------------------|------------------------------------------|
| `src/lib/services/integrations/whatsapp/whatsappCloudTypes.ts`  | Tipos TypeScript completos               |
| `src/lib/services/integrations/whatsapp/whatsappCloudConfig.ts` | Configuración, URLs, constantes, helpers |
| `src/lib/services/integrations/whatsapp/whatsappCloudService.ts`| Servicio principal (singleton)           |
| `src/lib/services/integrations/whatsapp/index.ts`               | Barrel export                            |

---

## 18. Errores Comunes

### 18.1. Códigos de Error de WhatsApp

| Código | Descripción                                   | Solución                                  |
|--------|-----------------------------------------------|-------------------------------------------|
| 131030 | Recipient phone number not valid              | Verificar formato E.164 (+573001234567)   |
| 131047 | Re-engagement message timeout                 | Ventana de 24h expirada, usar template    |
| 131048 | Spam rate limit hit                           | Reducir frecuencia de mensajes            |
| 131026 | Message undeliverable                         | Número no tiene WhatsApp                  |
| 131051 | Unsupported message type                      | Verificar tipo de mensaje                 |
| 131056 | Business account is restricted                | Verificar cuenta en Meta Business Manager |
| 130472 | User's number is part of experiment           | Reintentar más tarde                      |
| 368    | Temporarily blocked for policies violations   | Revisar políticas de Meta                 |

### 18.2. Errores de Token

| Problema                      | Causa                                       | Solución                               |
|-------------------------------|---------------------------------------------|----------------------------------------|
| Token expirado                | Temporary Token (24h)                       | Usar System User Token                 |
| Token invalidado              | Cambio de contraseña en Facebook            | Regenerar token                        |
| Permisos insuficientes        | Token sin scopes necesarios                 | Regenerar con permisos correctos       |
| "Business eligibility issue"  | Sin método de pago                          | Agregar tarjeta en Business Manager    |

---

## 19. Seguridad

### 19.1. Verificación de Webhook

Siempre verificar que las requests del webhook vienen de Meta:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string, 
  signature: string, 
  appSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
  return `sha256=${expectedSignature}` === signature;
}
```

El header `X-Hub-Signature-256` contiene la firma HMAC-SHA256 del payload.

### 19.2. Buenas Prácticas

- **NUNCA** exponer el `access_token` en el frontend
- **SIEMPRE** verificar `X-Hub-Signature-256` en webhooks
- Guardar credenciales encriptadas en `channel_credentials`
- Usar System User Token (no expira) en producción
- Rotar tokens periódicamente si se usan User Tokens

---

## 20. Diferencias: WhatsApp Cloud API vs On-Premise API vs Twilio

| Aspecto                | Cloud API (Meta)          | On-Premise API         | Twilio WhatsApp        |
|------------------------|---------------------------|------------------------|------------------------|
| **Hosting**            | Meta (gratuito)           | Tu servidor            | Twilio                 |
| **Costo infra**        | $0                        | Alto                   | Pay-per-use            |
| **Setup**              | Fácil (Meta App)          | Complejo               | Medio                  |
| **Escalabilidad**      | Automática                | Manual                 | Automática             |
| **Latencia**           | Baja                      | Muy baja               | Media                  |
| **Personalización**    | Limitada                  | Alta                   | Media                  |
| **Soporte**            | Comunidad/Meta            | Soporte Meta BSP       | Soporte Twilio         |
| **Conector GO Admin**  | `whatsapp_cloud`          | N/A                    | `twilio_whatsapp`      |

> **Recomendación GO Admin:** Usar **Cloud API** como opción principal (gratis, fácil, escalable).
> Ofrecer **Twilio** como alternativa para clientes que ya lo usen.

---

## 21. Templates de Notificaciones Sugeridos para GO Admin

### 21.1. Templates por Módulo

| Módulo    | Template Name              | Categoría | Contenido                                              |
|-----------|----------------------------|-----------|---------------------------------------------------------|
| **POS**   | `order_confirmation`       | Utility   | "Tu pedido {{1}} ha sido confirmado. Total: {{2}}"    |
| **POS**   | `order_shipped`            | Utility   | "Tu pedido {{1}} fue enviado. Tracking: {{2}}"        |
| **PMS**   | `reservation_confirmation` | Utility   | "Reserva confirmada para {{1}}. Check-in: {{2}}"      |
| **PMS**   | `checkout_reminder`        | Utility   | "Recordatorio: tu checkout es mañana {{1}}"            |
| **CRM**   | `welcome_message`          | Marketing | "¡Bienvenido a {{1}}! Estamos para servirte."          |
| **CRM**   | `promo_campaign`           | Marketing | "{{1}}: ¡{{2}}% de descuento solo hoy!"               |
| **Finance**| `payment_received`        | Utility   | "Pago recibido por {{1}}. Ref: {{2}}"                 |
| **Finance**| `invoice_sent`            | Utility   | "Tu factura {{1}} por {{2}} está lista."               |
| **Auth**  | `verification_code`        | Auth      | "Tu código de verificación es: {{1}}"                  |

### 21.2. Envío de Templates desde GO Admin

```
Evento en módulo (POS/PMS/CRM)
    ↓
Sistema busca template mapping en BD
    ↓
Obtiene canal WhatsApp activo de la organización
    ↓
Obtiene phone_number_id y access_token
    ↓
POST /{phone_number_id}/messages (tipo: template)
    ↓
Guarda en messages + message_events
```

---

## 22. Notas Colombia

- WhatsApp es la app de mensajería **más usada** en Colombia (~95% penetración)
- Formato de número: `+57` + código de ciudad/celular + número (ej: `573001234567`)
- Idioma de templates: `es` (español)
- Moneda para pagos: COP
- Zona horaria: UTC-5 (para business_hours)
- **WhatsApp Business App** es muy popular entre PyMEs; la migración a Cloud API requiere eliminar la app del teléfono
- **Verificación de negocio:** Se acepta Cámara de Comercio, RUT, o factura de servicios públicos

---

## 23. Resumen de Implementación Pendiente

### Archivos a Crear

| Archivo                                                         | Descripción                                    |
|-----------------------------------------------------------------|------------------------------------------------|
| `src/app/api/integrations/whatsapp/webhook/route.ts`           | Webhook: verificación + recepción de mensajes  |
| `src/app/api/integrations/whatsapp/send/route.ts`              | Enviar mensaje (texto, media, template)        |
| `src/app/api/integrations/whatsapp/validate/route.ts`          | Validar credenciales del canal                 |
| `src/app/api/integrations/whatsapp/templates/route.ts`         | Listar message templates del WABA              |
| `src/app/api/integrations/whatsapp/mark-read/route.ts`         | Marcar mensaje como leído                      |
| `src/lib/services/integrations/whatsapp/whatsappCloudConfig.ts`| Configuración: URLs, constantes                |
| `src/lib/services/integrations/whatsapp/whatsappCloudService.ts`| Servicio: envío, webhook processing, templates|
| `src/lib/services/integrations/whatsapp/whatsappCloudTypes.ts` | Tipos TypeScript                               |
| `src/lib/services/integrations/whatsapp/index.ts`              | Barrel export                                  |

### Archivos a Modificar

| Archivo                                           | Cambio                                           |
|---------------------------------------------------|--------------------------------------------------|
| `src/lib/services/whatsappChannelService.ts`      | Integrar con el nuevo servicio de Cloud API       |
| `StepCredentials.tsx`                             | Agregar campos para WhatsApp Cloud API            |
| `src/components/notificaciones/canales/types.ts`  | Ya tiene `whatsapp` como ChannelCode ✅           |

---

## 24. Diagrama de Flujo General

```
                    ┌──────────────────┐
                    │   Meta Cloud     │
                    │   (WhatsApp)     │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         Webhook POST   Status POST    Media Download
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────────────────────────────────┐
    │         GO Admin API Routes                  │
    │   /api/integrations/whatsapp/webhook        │
    └─────────────────────┬───────────────────────┘
                          │
              ┌───────────┼───────────────┐
              │           │               │
              ▼           ▼               ▼
         messages    conversations    message_events
         (tabla)      (tabla)          (tabla)
              │           │               │
              └───────────┼───────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │     CRM Inbox         │
              │  (Agentes + IA)       │
              └───────────┬───────────┘
                          │
                    Respuesta del agente
                          │
                          ▼
              ┌───────────────────────┐
              │  POST /send           │
              │  → Cloud API          │
              └───────────────────────┘
```
