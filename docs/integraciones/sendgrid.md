# Twilio SendGrid – Servicio de Email Transaccional y Marketing

> **Tipo:** Email API (transaccional + marketing)  
> **Proveedor:** Twilio (SendGrid)  
> **Cobertura:** Global  
> **Documentación oficial:** https://www.twilio.com/docs/sendgrid/for-developers  
> **API Reference:** https://www.twilio.com/docs/sendgrid/api-reference  
> **Dashboard:** https://app.sendgrid.com  
> **SDK Node.js:** https://github.com/sendgrid/sendgrid-nodejs  
> **Fecha:** 2026-02-17

---

## 1. Resumen General

Twilio SendGrid es una plataforma de envío de email a escala que ofrece:

- **Email Transaccional** — Confirmaciones de pedido, reseteo de contraseña, notificaciones del sistema
- **Email Marketing** — Campañas masivas, newsletters, automatizaciones
- **Dynamic Templates** — Plantillas con Handlebars para personalización avanzada
- **Inbound Parse** — Recibir y procesar emails entrantes vía webhook
- **Event Webhook** — Tracking de delivered, opened, clicked, bounced, etc.
- **Email Validation** — Verificar si un email es válido antes de enviar

### Formas de integración

| Tipo | Descripción |
|------|-------------|
| **Web API v3** | REST API completa (la que usaremos) |
| **SMTP Relay** | Enviar vía SMTP con credenciales SendGrid |
| **SDK Node.js** | `@sendgrid/mail` — Wrapper oficial para la API |
| **Webhooks** | Recibir eventos de email (entrega, apertura, clic, etc.) |
| **Inbound Parse** | Procesar emails entrantes como webhooks |

> Para GO Admin ERP usamos **Web API v3** vía SDK `@sendgrid/mail` + **Event Webhook** + **Dynamic Templates**.

---

## 2. Ambientes y Autenticación

### 2.1 URL Base

| Región | URL Base |
|--------|----------|
| **Global** | `https://api.sendgrid.com/v3/` |
| **EU** | `https://api.eu.sendgrid.com/v3/` (requiere plan Pro+) |

> SendGrid NO tiene un ambiente sandbox separado como Wompi/PayU. Se usa la misma API con la misma API Key. Para pruebas, enviar a emails propios o usar Sink Emails.

### 2.2 Autenticación

Todas las peticiones usan **Bearer Token** con la API Key:

```
Authorization: Bearer SG.xxxxxxxxxxxxxxxxxxxx
```

### 2.3 Tipos de API Keys

| Tipo | Descripción | Uso |
|------|-------------|-----|
| **Full Access** | Acceso completo a toda la API | NO recomendado |
| **Restricted Access** | Permisos granulares por servicio | ✅ Recomendado |
| **Billing Access** | Solo gestión de facturación | Administración |

> Para GO Admin ERP se necesita una API Key con permisos: **Mail Send (Full Access)**, **Template Engine (Read)**, **Tracking (Read)**.

---

## 3. Credenciales

Se obtienen en **Settings → API Keys** en https://app.sendgrid.com

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `api_key` | API Key con permisos de Mail Send | `SG.xxxxxxxx.yyyyyyyy` |
| `from_email` | Email del remitente verificado (Sender Identity) | `noreply@midominio.com` |
| `from_name` | Nombre del remitente | `GO Admin` |

> **Solo 1 credencial principal** (API Key). El `from_email` debe estar verificado como Sender Identity o pertenecer a un dominio autenticado.

### 3.1 Cómo obtener las credenciales paso a paso

1. Registrarse en https://signup.sendgrid.com/
2. Ir a **Settings → API Keys → Create API Key**
3. Seleccionar **Restricted Access**
4. Habilitar permisos necesarios:
   - **Mail Send** → Full Access
   - **Template Engine** → Read Access
   - **Tracking** → Read Access
5. Copiar la API Key generada (solo se muestra UNA vez)
6. Ir a **Settings → Sender Authentication** → Autenticar dominio (DNS records)
7. Opcionalmente: **Settings → Sender Authentication → Single Sender Verification** para verificar email individual

### 3.2 Autenticación de Dominio (Domain Authentication)

Para mejorar deliverability, configurar registros DNS:

| Tipo | Host | Valor | Propósito |
|------|------|-------|-----------|
| CNAME | `em1234.midominio.com` | `u1234.wl.sendgrid.net` | Verificación |
| CNAME | `s1._domainkey.midominio.com` | `s1.domainkey.u1234.wl.sendgrid.net` | DKIM |
| CNAME | `s2._domainkey.midominio.com` | `s2.domainkey.u1234.wl.sendgrid.net` | DKIM |

> SendGrid provee los valores exactos en el wizard de autenticación de dominio.

---

## 4. API Principal – Mail Send v3

### 4.1 Enviar Email Simple

```
POST /v3/mail/send
Authorization: Bearer {api_key}
Content-Type: application/json
```

**Body:**
```json
{
  "personalizations": [
    {
      "to": [
        { "email": "cliente@example.com", "name": "Juan Pérez" }
      ],
      "subject": "Confirmación de pedido #1234"
    }
  ],
  "from": {
    "email": "noreply@midominio.com",
    "name": "GO Admin"
  },
  "content": [
    {
      "type": "text/plain",
      "value": "Tu pedido #1234 ha sido confirmado."
    },
    {
      "type": "text/html",
      "value": "<h1>Pedido Confirmado</h1><p>Tu pedido #1234 ha sido confirmado.</p>"
    }
  ]
}
```

**Respuesta exitosa:** `202 Accepted` (sin body — el email se encola para envío).

### 4.2 Enviar con Dynamic Template

```json
{
  "personalizations": [
    {
      "to": [{ "email": "cliente@example.com" }],
      "dynamic_template_data": {
        "nombre": "Juan Pérez",
        "numero_pedido": "1234",
        "total": "$150,000 COP",
        "items": [
          { "nombre": "Producto A", "cantidad": 2, "precio": "$50,000" },
          { "nombre": "Producto B", "cantidad": 1, "precio": "$50,000" }
        ]
      }
    }
  ],
  "from": { "email": "noreply@midominio.com", "name": "GO Admin" },
  "template_id": "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

> Los `template_id` que empiezan con `d-` son Dynamic Templates y soportan Handlebars.

### 4.3 Enviar a Múltiples Destinatarios (Batch)

```json
{
  "personalizations": [
    {
      "to": [{ "email": "juan@example.com" }],
      "dynamic_template_data": { "nombre": "Juan" }
    },
    {
      "to": [{ "email": "maria@example.com" }],
      "dynamic_template_data": { "nombre": "María" }
    }
  ],
  "from": { "email": "noreply@midominio.com" },
  "template_id": "d-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

> Máximo **1,000 personalizations** por request. Cada personalization puede tener datos diferentes.

### 4.4 Enviar con Adjuntos

```json
{
  "personalizations": [{ "to": [{ "email": "cliente@example.com" }] }],
  "from": { "email": "noreply@midominio.com" },
  "subject": "Tu factura adjunta",
  "content": [{ "type": "text/html", "value": "<p>Adjuntamos tu factura.</p>" }],
  "attachments": [
    {
      "content": "BASE64_ENCODED_CONTENT",
      "type": "application/pdf",
      "filename": "factura-001.pdf",
      "disposition": "attachment"
    }
  ]
}
```

### 4.5 Programar Envío

```json
{
  "personalizations": [{ "to": [{ "email": "cliente@example.com" }] }],
  "from": { "email": "noreply@midominio.com" },
  "subject": "Recordatorio",
  "content": [{ "type": "text/plain", "value": "..." }],
  "send_at": 1700000000
}
```

> `send_at` es un **Unix timestamp**. Máximo 72 horas en el futuro.

---

## 5. Dynamic Templates (Handlebars)

### 5.1 Crear Template en Dashboard

1. Ir a **Email API → Dynamic Templates → Create a Dynamic Template**
2. Agregar una versión al template
3. Usar el **Design Editor** (drag & drop) o **Code Editor** (HTML + Handlebars)
4. Copiar el `template_id` (formato: `d-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

### 5.2 Sintaxis Handlebars Soportada

#### Sustitución simple

```handlebars
Hola {{nombre}}, tu pedido #{{numero_pedido}} está listo.
```

#### Condicionales

```handlebars
{{#if es_nuevo_cliente}}
  <p>¡Bienvenido a nuestra tienda!</p>
{{else}}
  <p>Gracias por tu compra recurrente.</p>
{{/if}}
```

#### Iteraciones (loops)

```handlebars
<table>
  {{#each items}}
    <tr>
      <td>{{this.nombre}}</td>
      <td>{{this.cantidad}}</td>
      <td>{{this.precio}}</td>
    </tr>
  {{/each}}
</table>
```

#### Comparaciones

```handlebars
{{#equals status "approved"}}
  <span style="color: green;">Aprobado</span>
{{/equals}}

{{#greaterThan total 100000}}
  <p>¡Envío gratis!</p>
{{/greaterThan}}
```

### 5.3 Templates Recomendados para GO Admin

| Template | Uso | Variables clave |
|----------|-----|-----------------|
| **Confirmación de pedido** | POS / E-commerce | `nombre`, `numero_pedido`, `items[]`, `total` |
| **Factura electrónica** | Finanzas | `numero_factura`, `cliente`, `items[]`, `subtotal`, `impuestos`, `total` |
| **Reseteo de contraseña** | Auth | `nombre`, `reset_link`, `expiracion` |
| **Bienvenida** | Auth/Registro | `nombre`, `organizacion`, `plan` |
| **Recordatorio de pago** | CxC | `nombre`, `monto`, `fecha_vencimiento`, `link_pago` |
| **Confirmación de reserva** | PMS | `nombre`, `checkin`, `checkout`, `espacio`, `total` |
| **Alerta del sistema** | Notificaciones | `titulo`, `mensaje`, `accion_url` |
| **Reporte diario** | Reportes | `fecha`, `ventas_total`, `pedidos`, `top_productos[]` |

---

## 6. Event Webhook (Tracking)

SendGrid notifica cambios de estado de cada email enviado vía webhook HTTP POST.

### 6.1 Tipos de Eventos

| Evento | Descripción |
|--------|-------------|
| `processed` | Email recibido por SendGrid para envío |
| `deferred` | Envío diferido temporalmente (reintentará) |
| `delivered` | Email entregado al servidor del destinatario |
| `bounce` | Email rebotado (dirección inválida, servidor rechazó) |
| `dropped` | Email descartado (email inválido, previamente rebotado, unsubscribed) |
| `open` | Email abierto por el destinatario |
| `click` | Destinatario hizo clic en un enlace |
| `spam_report` | Destinatario reportó como spam |
| `unsubscribe` | Destinatario se desinscribió |
| `group_unsubscribe` | Desinscripción de grupo específico |
| `group_resubscribe` | Re-inscripción a grupo |

### 6.2 Estructura del Evento

SendGrid envía un **array de eventos** en cada POST:

```json
[
  {
    "email": "cliente@example.com",
    "timestamp": 1700000000,
    "smtp-id": "<14c5d75ce93.dfd.64b469@ismtpd-555>",
    "event": "delivered",
    "category": ["pedido_confirmacion"],
    "sg_event_id": "rDm3kVOuTKCX...",
    "sg_message_id": "14c5d75ce93.dfd.64b469.filter0001...",
    "response": "250 2.0.0 OK",
    "ip": "168.1.1.1",
    "tls": 1,
    "cert_err": 0
  },
  {
    "email": "cliente@example.com",
    "timestamp": 1700000060,
    "event": "open",
    "sg_event_id": "abc123...",
    "sg_message_id": "14c5d75ce93...",
    "useragent": "Mozilla/5.0...",
    "ip": "200.100.50.25"
  }
]
```

### 6.3 Configuración

1. Ir a **Settings → Mail Settings → Event Webhooks**
2. Click **Create new webhook**
3. Configurar:
   - **Post URL:** `https://app.goadmin.io/api/integrations/sendgrid/webhook`
   - **Actions:** Seleccionar eventos deseados
   - **Security:** Habilitar **Signed Event Webhook** (verificación de firma)
4. Click **Save**

### 6.4 Verificación de Firma (Signed Event Webhook)

SendGrid firma cada webhook con ECDSA usando la clave pública proporcionada.

Headers enviados:
- `X-Twilio-Email-Event-Webhook-Signature` — Firma ECDSA en Base64
- `X-Twilio-Email-Event-Webhook-Timestamp` — Timestamp del envío

```javascript
const { EventWebhook } = require('@sendgrid/eventwebhook');

function verifyWebhook(publicKey, payload, signature, timestamp) {
  const eventWebhook = new EventWebhook();
  const ecPublicKey = eventWebhook.convertPublicKeyToECDSA(publicKey);
  return eventWebhook.verifySignature(ecPublicKey, payload, signature, timestamp);
}
```

### 6.5 Reintentos

- Si el servidor no responde con **2xx**, SendGrid reintenta con intervalos crecientes
- Reintentos durante un máximo de **24 horas** (período rolling)
- Cada evento nuevo tiene su propio período de 24 horas

---

## 7. Inbound Parse (Recepción de Emails)

Permite recibir emails entrantes y procesarlos como webhooks.

### 7.1 Configuración DNS

Crear un registro MX:

| Tipo | Host | Valor | Prioridad |
|------|------|-------|-----------|
| MX | `inbound.midominio.com` | `mx.sendgrid.net` | 10 |

### 7.2 Configurar en Dashboard

1. Ir a **Settings → Inbound Parse → Add Host & URL**
2. Configurar dominio y URL del webhook
3. Seleccionar si se quiere el raw email o parsed

### 7.3 Datos Recibidos (Parsed)

| Campo | Descripción |
|-------|-------------|
| `from` | Remitente |
| `to` | Destinatario(s) |
| `subject` | Asunto |
| `text` | Cuerpo en texto plano |
| `html` | Cuerpo en HTML |
| `attachments` | Número de adjuntos |
| `attachment1`, etc. | Archivos adjuntos |
| `envelope` | JSON con from/to del sobre SMTP |
| `spam_score` | Puntuación de spam |

> Útil para: soporte por email, CRM (capturar respuestas de clientes), procesar facturas recibidas.

---

## 8. Otras APIs Útiles

### 8.1 Contacts API (Marketing)

```
PUT /v3/marketing/contacts
```

Gestionar listas de contactos para campañas de marketing.

### 8.2 Stats API

```
GET /v3/stats?start_date=2026-01-01&end_date=2026-01-31
```

Obtener estadísticas agregadas de emails enviados.

### 8.3 Suppressions API

```
GET /v3/suppression/bounces
GET /v3/suppression/blocks
GET /v3/suppression/spam_reports
GET /v3/suppression/unsubscribes
```

Gestionar listas de supresión (emails que no se deben contactar).

### 8.4 Email Validation API

```
POST /v3/validations/email
```

```json
{
  "email": "cliente@example.com",
  "source": "signup"
}
```

> Requiere plan de pago adicional. Valida formato, dominio MX, y si el buzón existe.

---

## 9. SDK Node.js (`@sendgrid/mail`)

### 9.1 Instalación

```bash
npm install @sendgrid/mail
```

### 9.2 Uso Básico

```typescript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const msg = {
  to: 'cliente@example.com',
  from: { email: 'noreply@midominio.com', name: 'GO Admin' },
  subject: 'Confirmación de pedido',
  text: 'Tu pedido ha sido confirmado.',
  html: '<strong>Tu pedido ha sido confirmado.</strong>',
};

const [response] = await sgMail.send(msg);
console.log(response.statusCode); // 202
```

### 9.3 Con Dynamic Template

```typescript
const msg = {
  to: 'cliente@example.com',
  from: { email: 'noreply@midominio.com', name: 'GO Admin' },
  templateId: 'd-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  dynamicTemplateData: {
    nombre: 'Juan Pérez',
    numero_pedido: '1234',
    total: '$150,000 COP',
    items: [
      { nombre: 'Producto A', cantidad: 2, precio: '$50,000' },
    ],
  },
};

await sgMail.send(msg);
```

### 9.4 Envío Múltiple

```typescript
const messages = [
  {
    to: 'juan@example.com',
    from: { email: 'noreply@midominio.com', name: 'GO Admin' },
    templateId: 'd-xxxx',
    dynamicTemplateData: { nombre: 'Juan' },
  },
  {
    to: 'maria@example.com',
    from: { email: 'noreply@midominio.com', name: 'GO Admin' },
    templateId: 'd-xxxx',
    dynamicTemplateData: { nombre: 'María' },
  },
];

await sgMail.send(messages);
```

---

## 10. Planes y Precios

| Plan | Emails/mes | Precio | Características |
|------|-----------|--------|-----------------|
| **Free** | 100/día (60 días trial) | $0 | API, 1 Sender Identity |
| **Essentials** | 100,000 | ~$19.95/mes | + Ticket support, templates |
| **Pro** | 100,000 - 1.5M | ~$89.95/mes | + Dedicated IP, subusers, EU region |
| **Premier** | Personalizado | Personalizado | + SLA, soporte dedicado |

> El plan Free permite hasta **100 emails por día** durante 60 días de prueba. Después se debe upgrade.

### 10.1 Rate Limits

| Endpoint | Límite |
|----------|--------|
| `POST /v3/mail/send` | Varía según plan (Free: ~100/día) |
| Personalizations por request | 1,000 máximo |
| Tamaño del request | 30 MB máximo |
| Adjuntos | 30 MB total por email |

---

## 11. Flujo de Integración con GO Admin ERP

### 11.1 Flujo General de Envío de Email

```
1. Evento ocurre en GO Admin (venta, reserva, alerta, etc.)
   ↓
2. Sistema determina template y destinatario(s)
   ↓
3. Backend obtiene credenciales de la conexión SendGrid activa
   ↓
4. Backend construye payload con dynamic_template_data
   ↓
5. Backend envía vía @sendgrid/mail SDK
   ↓
6. SendGrid responde 202 Accepted
   ↓
7. Email se entrega al destinatario
   ↓
8. Event Webhook notifica: delivered, open, click, bounce
   ↓
9. Backend registra eventos en integration_events
```

### 11.2 Flujo de Notificaciones

```
1. Sistema genera notificación (alerta, recordatorio, etc.)
   ↓
2. notification_channels.email tiene connection_id vinculado
   ↓
3. Obtener credenciales de integration_credentials vía connection_id
   ↓
4. Obtener template de notification_templates
   ↓
5. Enviar email vía SendGrid API
   ↓
6. Registrar en notification_logs
```

### 11.3 Archivos a Crear

```
src/lib/services/integrations/
  sendgrid/
    sendgridTypes.ts           # Interfaces TypeScript
    sendgridConfig.ts          # URLs, constantes
    sendgridService.ts         # Servicio principal (enviar, templates, stats)
    index.ts                   # Re-exportaciones

src/app/api/integrations/
  sendgrid/
    send/route.ts              # POST — Enviar email
    webhook/route.ts           # POST — Recibir event webhooks
    health-check/route.ts      # POST — Verificar API Key
    templates/route.ts         # GET — Listar templates disponibles
```

### 11.4 Tablas de Supabase Relacionadas

| Tabla | Relación |
|-------|----------|
| `integration_providers` | Provider `sendgrid` (ID: `c692cbd6-f66d-41d5-a1d1-ead1572ce002`) |
| `integration_connectors` | Crear connector `sendgrid_email` |
| `integration_connections` | Conexión activa por organización |
| `integration_credentials` | API Key + from_email + from_name |
| `integration_events` | Registro de webhooks recibidos |
| `notification_channels` | Canal `email` con connection_id |
| `notification_templates` | Templates con template_id de SendGrid |
| `notifications` | Notificaciones enviadas |

### 11.5 Connector a Crear en BD

```sql
INSERT INTO integration_connectors (
  provider_id, code, name, supported_countries, is_active
) VALUES (
  'c692cbd6-f66d-41d5-a1d1-ead1572ce002',
  'sendgrid_email',
  'SendGrid Email',
  '["*"]',
  true
);
```

### 11.6 Credenciales a Guardar (3 registros por conexión)

| purpose | credential_type | Descripción |
|---------|----------------|-------------|
| `api_key` | `api_key` | API Key de SendGrid (SG.xxx) |
| `from_email` | `config` | Email verificado del remitente |
| `from_name` | `config` | Nombre del remitente |

---

## 12. Códigos de Error HTTP

| Código | Descripción |
|--------|-------------|
| `202` | Accepted — Email encolado para envío |
| `400` | Bad Request — Payload inválido |
| `401` | Unauthorized — API Key inválida o faltante |
| `403` | Forbidden — Sin permisos suficientes |
| `404` | Not Found — Recurso no encontrado |
| `413` | Content Too Large — Payload excede 30 MB |
| `429` | Too Many Requests — Rate limit excedido |
| `500` | Internal Server Error — Error de SendGrid |

---

## 13. Consideraciones de Seguridad

1. **API Key solo en backend** — Nunca exponer en frontend o repositorio.
2. **Verificar firma de webhooks** — Usar ECDSA para validar autenticidad de Event Webhooks.
3. **Autenticar dominio** — Configurar DKIM, SPF para mejorar deliverability y evitar que emails lleguen a spam.
4. **Gestionar bounces** — Implementar lógica para manejar emails rebotados y no reenviar.
5. **Respetar unsubscribes** — Honrar desinscripciones vía la Suppression API.
6. **Rate limiting** — Respetar límites del plan para evitar bloqueos.
7. **Mínimo privilegio** — Crear API Key con solo los permisos necesarios.

---

## 14. Testing y Sandbox

SendGrid no tiene un ambiente sandbox separado. Para pruebas:

### 14.1 Sink Emails

Enviar a direcciones que no generan entrega real:
- Usar subdominios propios de prueba
- Enviar a emails propios controlados

### 14.2 Event Webhook Testing

1. En el dashboard, al configurar un webhook, usar **"Test Your Integration"**
2. Localmente, usar herramientas como **ngrok** para exponer el endpoint local:

```bash
ngrok http 3000
# Usar la URL generada como Post URL del webhook
```

### 14.3 Verificar API Key

```bash
curl -X GET https://api.sendgrid.com/v3/scopes \
  -H "Authorization: Bearer SG.xxxx"
```

Si responde `200`, la API Key es válida. La respuesta incluye los permisos asignados.

---

## 15. Comparativa con Otros Proveedores de Email

| Característica | SendGrid | Amazon SES | Mailgun | Postmark |
|---------------|----------|------------|---------|----------|
| **Free tier** | 100/día (60d trial) | 62,000/mes (si usas EC2) | 1,000/mes (3 meses) | 100/mes |
| **Dynamic Templates** | ✅ Handlebars | ❌ (custom) | ✅ Handlebars | ✅ |
| **Event Webhook** | ✅ | ✅ (SNS) | ✅ | ✅ |
| **Inbound Parse** | ✅ | ✅ | ✅ | ✅ |
| **SDK Node.js** | ✅ Oficial | ✅ AWS SDK | ✅ Oficial | ✅ Oficial |
| **Dashboard UI** | ✅ Completo | Básico | ✅ | ✅ |
| **Marketing** | ✅ Built-in | ❌ | ❌ | ❌ |
| **Dificultad** | Fácil | Media | Fácil | Fácil |

---

## 16. Casos de Uso en GO Admin ERP

### 16.1 Emails Transaccionales

| Caso | Trigger | Template sugerido |
|------|---------|-------------------|
| Confirmación de venta | `sales.created` | Detalle del pedido con items |
| Factura electrónica | `invoice_sales.created` | PDF adjunto + resumen |
| Confirmación de reserva | `reservations.created` | Fechas, espacio, total |
| Check-in exitoso | `reservations.status = 'checked_in'` | Info del huésped, WiFi |
| Recordatorio de pago | `accounts_receivable.overdue` | Monto, fecha, link de pago |
| Reseteo de contraseña | Auth event | Link temporal |
| Bienvenida | `auth.users.created` | Guía de inicio |

### 16.2 Emails de Marketing

| Caso | Frecuencia | Contenido |
|------|-----------|-----------|
| Newsletter | Semanal/Mensual | Novedades, promociones |
| Cumpleaños | Automático | Descuento especial |
| Carrito abandonado | Automático | Productos pendientes |
| Re-engagement | Automático | Inactividad > 30 días |

### 16.3 Notificaciones del Sistema

| Caso | Canal | Urgencia |
|------|-------|----------|
| Alerta de inventario bajo | email | Media |
| Reporte diario de ventas | email | Baja |
| Membresía por vencer (Gym) | email + app | Alta |
| Pago recibido (CxC) | email + app | Media |

---

## 17. Variables de Entorno

```env
# SendGrid (credenciales por organización en BD, estas son fallback global)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@goadmin.io
SENDGRID_FROM_NAME=GO Admin
SENDGRID_WEBHOOK_VERIFICATION_KEY=MFkwEwYH... # Clave pública ECDSA para verificar webhooks
```

> Las credenciales **por cliente/organización** se guardan en `integration_credentials` vía el wizard de integraciones. Las variables de entorno son para el envío global de GO Admin (reseteo de contraseña, bienvenida, etc.).

---

## 18. Implementación Paso a Paso

### Fase 1: Setup base (~2 horas)
1. Crear connector `sendgrid_email` en BD
2. Crear `sendgridService.ts` con métodos: `sendEmail()`, `sendWithTemplate()`, `healthCheck()`
3. Crear `sendgridConfig.ts` y `sendgridTypes.ts`
4. Agregar override en `StepCredentials.tsx` para SendGrid (3 campos: api_key, from_email, from_name)
5. Crear API route `health-check` para validar API Key

### Fase 2: Envío de emails ✅
1. ✅ Crear API route `send` → `src/app/api/integrations/sendgrid/send/route.ts`
2. ✅ Crear API route `templates` → `src/app/api/integrations/sendgrid/templates/route.ts`
3. ✅ Integrar con sistema de notificaciones (canal `email`)

### Fase 3: Event Webhook ✅
1. ✅ Crear API route `webhook` → `src/app/api/integrations/sendgrid/webhook/route.ts`
2. ✅ Implementar verificación de firma ECDSA (`verifyWebhookSignature`)
3. ✅ Registrar eventos en `integration_events`
4. ✅ Procesar bounce/spam para marcar notificaciones como fallidas

### Fase 4: Integración con Notificaciones ✅
1. ✅ `NotificationService.sendEmailViaSendGrid()` — Envío individual
2. ✅ `NotificationService.processEmailNotifications()` — Procesamiento batch
3. ✅ `NotificationService.linkSendGridChannel()` — Vincular canal email
4. ✅ API route `POST /api/notifications/process` para procesar pendientes
5. ✅ Vinculación automática del canal al guardar conexión SendGrid

### Fase 5: Stats, Bounces y Seguridad ✅
1. ✅ API route `GET /api/integrations/sendgrid/stats` — Estadísticas de envío
2. ✅ API route `GET /api/integrations/sendgrid/bounces` — Emails rebotados
3. ✅ Verificación ECDSA en webhook con `SENDGRID_WEBHOOK_VERIFICATION_KEY`
4. ✅ Bounce/spam/unsubscribe → marcar notificaciones `pending` como `failed`

### Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `src/lib/services/integrations/sendgrid/sendgridTypes.ts` | Interfaces TypeScript |
| `src/lib/services/integrations/sendgrid/sendgridConfig.ts` | Constantes de configuración |
| `src/lib/services/integrations/sendgrid/sendgridService.ts` | Servicio principal (credenciales, envío, templates, stats, bounces, ECDSA) |
| `src/lib/services/integrations/sendgrid/index.ts` | Re-exportaciones |
| `src/app/api/integrations/sendgrid/health-check/route.ts` | POST — Validar credenciales |
| `src/app/api/integrations/sendgrid/send/route.ts` | POST — Enviar email |
| `src/app/api/integrations/sendgrid/templates/route.ts` | GET — Listar Dynamic Templates |
| `src/app/api/integrations/sendgrid/webhook/route.ts` | POST — Event Webhook (ECDSA) |
| `src/app/api/integrations/sendgrid/stats/route.ts` | GET — Estadísticas de envío |
| `src/app/api/integrations/sendgrid/bounces/route.ts` | GET — Emails rebotados |
| `src/app/api/notifications/process/route.ts` | POST — Procesar notificaciones pendientes |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/services/notificationService.ts` | +5 métodos: envío vía SendGrid, procesamiento batch, vinculación canal, helpers HTML |
| `src/app/app/integraciones/conexiones/nueva/page.tsx` | Vinculación automática canal email al guardar conexión SendGrid |
| `.env.example` | Variable `SENDGRID_WEBHOOK_VERIFICATION_KEY` |

### Variable de entorno requerida

```env
# Clave pública ECDSA para verificar webhooks de SendGrid
# Se obtiene en: Settings > Mail Settings > Event Webhook > Verification Key
SENDGRID_WEBHOOK_VERIFICATION_KEY=your-ecdsa-public-key
```

---

## 19. Referencias

- [Documentación para Desarrolladores](https://www.twilio.com/docs/sendgrid/for-developers)
- [API Reference](https://www.twilio.com/docs/sendgrid/api-reference)
- [Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)
- [Dynamic Templates](https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates)
- [Using Handlebars](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/using-handlebars)
- [Event Webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook)
- [Event Webhook Security](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features)
- [Inbound Parse](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
- [Personalizations](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/personalizations)
- [Node.js Quickstart](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/quickstart-nodejs)
- [SDK Node.js (GitHub)](https://github.com/sendgrid/sendgrid-nodejs)
- [Domain Authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication)
- [Sender Identity](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sender-identity)
- [Pricing](https://sendgrid.com/pricing/)
- [Dashboard](https://app.sendgrid.com)
