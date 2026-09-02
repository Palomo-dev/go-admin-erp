# FASE 07 — Email propio: Resend, React Email y editor de plantillas

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0 (registry de proveedores)
> Bloquea: F8 (secuencias usan plantillas de email)
>
> **Dependencias npm (NO instaladas aún — verificar `package.json`):** el
> `package.json` actual NO contiene `resend`, `react-email`, `svix` ni
> `@react-email/components`. Instalar explícitamente antes de empezar:
> ```bash
> npm install resend react-email @react-email/components svix juice
> ```
> - `resend` — SDK oficial de Resend (envío + dominios).
> - `react-email` + `@react-email/components` — plantillas TSX de sistema.
> - `svix` — verificación oficial de webhooks (`Webhook.verify`).
> - `juice` — inline CSS para compatibilidad Outlook/Gmail.

---

## 0. Objetivo y alcance

**Qué resuelve:** el requisito del dueño: *"me gustaría poder personalizar y crear correos"* con Resend, multi-tenant: cada organización con su dominio, su marca y sus plantillas. Nada hardcodeado.

**Qué NO entra:** secuencias multicanal automáticas (F8), envío desde el agente IA (F6 usa este servicio).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `sendgridService.ts` | ✅ 429+ líneas, email actual | `src/lib/services/integrations/sendgrid/sendgridService.ts` |
| `/api/integrations/sendgrid/send` + `/webhook` + `/bounces` + `/stats` + `/templates` + `/health-check` | ✅ completo vía fetch | `src/app/api/integrations/sendgrid/` |
| `twilioEmailService.ts` | ✅ | `src/lib/services/twilioEmailService.ts` |
| `EmailNotifications.tsx` | ✅ | `src/components/crm/pipeline/EmailNotifications.tsx` |
| `templates` tabla con `kind` | ✅ existe (onboarding usa `kind='onboarding'`) | `src/lib/services/crm/onboardingService.ts:218` |
| `campaigns` / `campaign_contacts` / `segments` | ✅ existen | BD |
| `notification_templates` / `notification_channels` | ✅ existen (`notification_templates` con `channel`, `subject`, `body_html`, `body_text`, `variables`, `version`) | `src/lib/services/notificationService.ts:182` |
| `integration_credentials` (con `value_encrypted`, `secret_ref`, `purpose`, `connection_id`) | ✅ existe | `src/lib/services/integrationsService.ts:655` |
| `channel_credentials` (con `credentials` jsonb) | ✅ existe | `src/lib/services/chatChannelsService.ts:88` |
| Editor de texto enriquecido | ✅ | grep `RichTextEditor` + `docs/integraciones/editor-texto-enriquecido.md` |
| `emailAuth.ts` | ✅ emails de auth | `src/lib/auth/emailAuth.ts` |
| `resend` / `react-email` / `svix` / `@react-email/components` / `juice` | ❌ NO en `package.json` (instalar en F7) | — |
| `email_domains` / `email_messages` / `email_events` | ❌ | — |
| Editor de bloques | ❌ | — |

---

## 2. Arquitectura

```
┌─ Configuración (UI) ────────────────────────────────────────┐
│  Dominio: midominio.com → Resend verify → DNS records       │
│  API key por dominio (cifrada)                               │
│  Remitente: nombre@midominio.com                             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Editor de plantillas (UI) ─────────────────────────────────┐
│  Nivel A: Editor de bloques (drag & drop, sin código)       │
│  Nivel B: React Email (TSX para plantillas de sistema)      │
│  Variables: {{customer.first_name}}, {{opportunity.amount}} │
│  Renderer único → HTML compatible Outlook/Gmail             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Envío (API) ───────────────────────────────────────────────┐
│  POST /api/email/send                                        │
│  → Resuelve dominio + proveedor (registry de F0)             │
│  → Renderiza plantilla con branding de la org                │
│  → Idempotency-Key                                           │
│  → Rate limit 10 req/s (cola)                                │
│  → INSERT email_messages                                     │
│  → INSERT activities (activity_type='email')                 │
│  → Resend API                                                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Webhook (Resend → Svix) ───────────────────────────────────┐
│  POST /api/email/webhook                                     │
│  → Verificación Svix                                         │
│  → Idempotente por provider_event_id                         │
│  → Mapeo de 12 eventos → email_messages + email_events       │
│  → Bounce duro → suppression list                            │
│  → Queja → do_not_email                                      │
└───────────────────────────────────────────────────────────────┘
```

**Convivencia Resend/SendGrid:** el `provider_configs` de F0 decide qué proveedor usa cada org por categoría `email`. SendGrid ya está integrado → no se rompe. Resend se añade como default para nuevas organizaciones.

---

## 3. Base de datos

### 3.1 Migraciones

#### Migración 1 — `email_domains`

> **NO guarda API keys aquí.** Las API keys de Resend se almacenan en
> `integration_credentials` (tabla existente, ver §4.4) referenciada vía
> `credential_id`. `email_domains` solo guarda metadatos del dominio.

```sql
CREATE TABLE email_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_domain_id text,
  credential_id uuid REFERENCES integration_credentials(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verifying','verified','failed')),
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  dmarc_configured boolean NOT NULL DEFAULT false,
  from_name text,
  from_email text NOT NULL,
  reply_to text,
  is_default boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain)
);

CREATE INDEX idx_email_domains_org ON email_domains (organization_id, is_default);
ALTER TABLE email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY ed_select ON email_domains FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ed_insert ON email_domains FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ed_update ON email_domains FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ed_delete ON email_domains FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — `email_messages` y `email_events`

```sql
CREATE TABLE email_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_customer_id integer,
  cc text[],
  bcc text[],
  from_email text NOT NULL,
  subject text NOT NULL,
  body_html_snapshot text,
  related_type text,
  related_id text,
  sequence_step_run_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed'
  )),
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  bounced_at timestamptz,
  bounce_type text,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  idempotency_key text NOT NULL,
  cost_amount numeric(10,4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX idx_email_messages_org_sent ON email_messages (organization_id, sent_at DESC);
CREATE INDEX idx_email_messages_org_customer ON email_messages (organization_id, to_customer_id);
CREATE INDEX idx_email_messages_provider_id ON email_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY em_select ON email_messages FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY em_insert ON email_messages FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY em_update ON email_messages FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY em_delete ON email_messages FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE email_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  provider_event_id text NOT NULL,
  UNIQUE (provider_event_id)
);

CREATE INDEX idx_email_events_message ON email_events (email_message_id, occurred_at);
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ee_select ON email_events FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ee_insert ON email_events FOR INSERT WITH CHECK (organization_id = current_org_id());
```

#### Migración 3 — Extender `templates` con `blocks_json` y `channel`

```sql
-- F7 extiende la tabla `templates` EXISTENTE (NO crea una tabla nueva).
-- `templates` ya tiene `kind` (usado por onboarding: kind='onboarding'),
-- `is_active`, `body_html`, `organization_id`, `name`, `description`, `variables`.
-- Se añade `blocks_json` para el editor visual y `channel` para multicanal.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS blocks_json jsonb,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';
  -- ❌ SIN CHECK constraint en `channel`: el sistema ya usa `kind='onboarding'`
  --    y could surgir canales nuevos (whatsapp, sms, onboarding, ...). Validar
  --    canal en la capa de aplicación (zod enum) para nuevos canales, no en BD.
```

> **Relación con `notification_templates` (NO duplicación):**
>
> El sistema ya tiene DOS tablas de plantillas que **coexisten** y sirven
> propósitos distintos. F7 **NO crea ninguna tabla nueva** de plantillas:
>
> | Tabla | Propósito | Quién edita | Ejemplos |
> |---|---|---|---|
> | `notification_templates` | Notificaciones push del **sistema** (auth, alertas, recordatorios de pago). Canal fijo por plantilla. | No editable por el usuario final (configuración técnica) | "Recordatorio de pago", "Verificación de email" |
> | `templates` | Plantillas del **CRM** (marketing + transaccionales) editables con drag & drop. Multicanal vía `channel`. | Usuario final (SDR, AE, CS, Marketing) | "Primer contacto", "Envío de propuesta" |
>
> **Por qué no se unifican ahora:** `notification_templates` tiene campos
> específicos (`subject`, `body_text`, `variables`, `version`) y es consumida
> por `notificationService.ts` con su propio flujo (`processEmailNotifications`).
> Migrar todo a `templates` rompería las notificaciones existentes. F7 extiende
> `templates` (que ya existía y es usada por onboarding) con `blocks_json` +
> `channel` para el editor visual del CRM.
>
> **Si en el futuro se unifican:** `templates` puede absorber a
> `notification_templates` porque ya soporta `channel` libre y `blocks_json`.
> El plan de migración sería:
> 1. Añadir a `templates` las columnas faltantes (`subject`, `body_text`,
>    `version`) si no existen.
> 2. Migrar filas de `notification_templates` a `templates` con
>    `kind='notification'`, `channel=<canal original>`.
> 3. Actualizar `notificationService.ts` para leer de `templates`.
> 4. Deprecar `notification_templates` (no borrar hasta F+1).
>
> **Extender `notification_templates` sin duplicar:** si una notificación del
> sistema necesita el editor de bloques, añadir `blocks_json` también a
> `notification_templates` (misma migración) y reusar `emailRenderer.ts`. NO
> crear una tercera tabla.

### 3.2 Schema de `templates.blocks_json`

Array de bloques tipados. Cada bloque tiene `type`, `props`, y `style`.

```typescript
type Block =
  | { type: 'heading'; props: { text: string; level: 1 | 2 | 3 }; style?: BlockStyle }
  | { type: 'text'; props: { text: string }; style?: BlockStyle }
  | { type: 'image'; props: { src: string; alt: string; width?: string }; style?: BlockStyle }
  | { type: 'button'; props: { text: string; href: string }; style?: BlockStyle }
  | { type: 'divider'; props: {}; style?: BlockStyle }
  | { type: 'spacer'; props: { height: number }; style?: BlockStyle }
  | { type: 'columns'; props: { columns: Block[][] }; style?: BlockStyle }
  | { type: 'product_card'; props: { name: string; price: string; image: string }; style?: BlockStyle }
  | { type: 'quote_summary'; props: { quotationId: string }; style?: BlockStyle }
  | { type: 'signature'; props: { name: string; role: string; phone: string }; style?: BlockStyle }
  | { type: 'social'; props: { links: { platform: string; url: string }[] }; style?: BlockStyle }
  | { type: 'footer_legal'; props: { orgName: string; address: string; unsubscribeUrl: string }; style?: BlockStyle };

interface BlockStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  textAlign?: 'left' | 'center' | 'right';
  padding?: string;
  borderRadius?: string;
}
```

Validación con zod:

```typescript
const BlockStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  color: z.string().optional(),
  fontSize: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  padding: z.string().optional(),
  borderRadius: z.string().optional(),
}).partial();

const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), props: z.object({ text: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('text'), props: z.object({ text: z.string() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('image'), props: z.object({ src: z.string(), alt: z.string(), width: z.string().optional() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('button'), props: z.object({ text: z.string(), href: z.string() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('divider'), props: z.object({}), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('spacer'), props: z.object({ height: z.number() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('columns'), props: z.object({ columns: z.array(z.array(BlockSchema)) }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('product_card'), props: z.object({ name: z.string(), price: z.string(), image: z.string() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('quote_summary'), props: z.object({ quotationId: z.string() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('signature'), props: z.object({ name: z.string(), role: z.string(), phone: z.string() }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('social'), props: z.object({ links: z.array(z.object({ platform: z.string(), url: z.string() })) }), style: BlockStyleSchema.optional() }),
  z.object({ type: z.literal('footer_legal'), props: z.object({ orgName: z.string(), address: z.string(), unsubscribeUrl: z.string() }), style: BlockStyleSchema.optional() }),
]);

export const BlocksSchema = z.array(BlockSchema);
```

### 3.3 Catálogo de variables/merge tags por contexto

| Contexto | Variables disponibles |
|---|---|
| Cliente | `{{customer.first_name}}`, `{{customer.last_name}}`, `{{customer.full_name}}`, `{{customer.company_name}}`, `{{customer.email}}`, `{{customer.phone}}`, `{{customer.city}}` |
| Oportunidad | `{{opportunity.name}}`, `{{opportunity.amount}}`, `{{opportunity.currency}}`, `{{opportunity.stage_name}}`, `{{opportunity.expected_close_date}}` |
| Cotización | `{{quotation.number}}`, `{{quotation.total}}`, `{{quotation.currency}}`, `{{quotation.pdf_url}}` |
| Agente | `{{agent.name}}`, `{{agent.role}}`, `{{agent.phone}}`, `{{agent.email}}` |
| Organización | `{{organization.name}}`, `{{organization.logo_url}}` |
| Sistema | `{{unsubscribe_url}}`, `{{date}}`, `{{time}}` |

Sintaxis: `{{variable}}` o `{{variable|valor_default}}` (ej: `{{customer.first_name|estimado cliente}}`).

### 3.4 Seeds — biblioteca opcional de 8 plantillas

Importable con un clic (no automática):

| Plantilla | Canal | Uso |
|---|---|---|
| Primer contacto | email | SDR → lead nuevo |
| Seguimiento post-demo | email | AE → después de demo |
| Envío de propuesta | email | AE → con PDF adjunto |
| Recordatorio de propuesta | email | AE → si no responde en 48h |
| Caso de éxito | email | Marketing → nurturing |
| Reactivación | email | CS → cliente inactivo |
| Renovación | email | CS → 30 días antes de expirar |
| Pedir referido | email | CS → cliente satisfecho |

### 3.5 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('email_domains','email_messages','email_events');
-- Esperado: 3 filas, todas true

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'templates' AND column_name IN ('blocks_json','channel');
-- Esperado: 2 filas
```

---

## 4. Backend

### 4.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/email/send` | `src/app/api/email/send/route.ts` | crear | POST | Envío con idempotencia |
| `/api/email/batch` | `src/app/api/email/batch/route.ts` | crear | POST | Batch hasta 100 |
| `/api/email/preview` | `src/app/api/email/preview/route.ts` | crear | POST | Render sin enviar |
| `/api/email/test-send` | `src/app/api/email/test-send/route.ts` | crear | POST | Enviarse a sí mismo |
| `/api/email/webhook` | `src/app/api/email/webhook/route.ts` | crear | POST | Webhook Resend (Svix) |
| `/api/email/domains` | `src/app/api/email/domains/route.ts` | crear | GET, POST | CRUD dominios |
| `/api/email/domains/[id]/verify` | `src/app/api/email/domains/[id]/verify/route.ts` | crear | POST | Verificar dominio |
| `/api/crm/templates` | `src/app/api/crm/templates/route.ts` | crear | GET, POST | CRUD plantillas |
| `/api/crm/templates/[id]` | `src/app/api/crm/templates/[id]/route.ts` | crear | PATCH, DELETE | |
| `/api/crm/templates/import-library` | `src/app/api/crm/templates/import-library/route.ts` | crear | POST | Importar 8 plantillas |

### 4.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/email/emailService.ts` | **crear** | Orquestador de envío |
| `src/lib/services/email/resendProvider.ts` | **crear** | Adaptador Resend |
| `src/lib/services/email/sendgridProvider.ts` | **crear** | Adaptador SendGrid (envuelve `sendgridService.ts`) |
| `src/lib/services/email/emailRenderer.ts` | **crear** | blocks_json → HTML + React Email → HTML |
| `src/lib/services/email/domainService.ts` | **crear** | Gestión de dominios |
| `src/lib/services/email/webhookHandlerService.ts` | **crear** | Parsing + verificación Svix reutilizable (separado del route handler) |
| `src/lib/services/email/suppressionService.ts` | **crear** | Bounce duro, quejas, unsubscribe, suppression list por org |

#### Interfaz `EmailProvider`

```typescript
export interface EmailProvider {
  send(params: SendParams): Promise<{ messageId: string }>;
  sendBatch(params: SendBatchParams): Promise<{ messageIds: string[] }>;
  verifyDomain(domain: string): Promise<DnsRecords>;
  checkDomainStatus(domainId: string): Promise<DomainStatus>;
  parseWebhook(payload: unknown, headers: Record<string, string>): WebhookEvent[];
}

export interface SendParams {
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  tags?: { name: string; value: string }[];
  scheduledAt?: string;
}
```

### 4.3 Renderer

```typescript
// src/lib/services/email/emailRenderer.ts
export async function renderTemplate(params: {
  templateId?: number;
  blocksJson?: Block[];
  variables: Record<string, string>;
  branding: { logoUrl?: string; primaryColor?: string; font?: string };
}): Promise<string> {
  // 1. Resolver variables en el texto de cada bloque
  const resolvedBlocks = resolveVariables(params.blocksJson, params.variables);

  // 2. Convertir bloques → HTML con tablas (compatibilidad Outlook/Gmail)
  const html = blocksToHtml(resolvedBlocks, params.branding);

  // 3. Inline CSS (crítico para email clients)
  const inlined = inlineCss(html);

  return inlined;
}

// Restricciones reales de HTML de email:
// - Usar <table> para layout (no flexbox/grid)
// - Inline CSS (Gmail strip <style>)
// - width="600" max (no responsive con media queries — usar fluid hybrid)
// - No <form>, no <script>, no <video>
// - Imágenes con alt + width + height
// - Botones como <a> con padding (no <button>)
```

### 4.4 Flujo de verificación de dominio

```typescript
// 1. Org agrega dominio
const domain = await resend.domains.create({ name: 'midominio.com' });
// → devuelve records: [{ record: 'SPF', value: 'v=spf1 ...' }, { record: 'DKIM', value: '...' }, ...]

// 2. Guardar en email_domains con status='verifying' + dns_records
await supabase.from('email_domains').insert({
  organization_id: orgId, domain: 'midominio.com',
  provider_domain_id: domain.id, status: 'verifying',
  dns_records: domain.records,
});

// 3. UI muestra los records DNS para que el cliente los publique

// 4. Cliente pulsa "Verificar"
const verified = await resend.domains.verify(domain.id);
if (verified.status === 'verified') {
  // 5. Crear API key con permission: 'sending_access' + domain_id
  const apiKey = await resend.apiKeys.create({
    name: `org_${orgId}_midominio`,
    permission: 'sending_access',
    domain_id: domain.id,
  });
  // 6. Cifrar y guardar
  await supabase.from('email_domains').update({
    status: 'verified', verified_at: new Date().toISOString(),
    provider_api_key_encrypted: encrypt(apiKey.token),
  }).eq('id', domainRecord.id);
}
```

> **Cifrado:** investigar el patrón existente en `channel_credentials`/`integration_credentials` (grep `encrypt` en `src/lib/services/`). Si no hay helper, crear `cryptoService.ts` con AES-256-GCM usando `ENCRYPTION_KEY` de env.

### 4.5 Webhook idempotente

```typescript
// src/app/api/email/webhook/route.ts
import { Resend } from 'resend';
import { getProvider } from '@/lib/services/email/emailService';

export async function POST(req: Request) {
  const payload = await req.text(); // body crudo (Svix firma el raw body)
  const headers = Object.fromEntries(req.headers.entries());

  // 1. Verificar firma Svix con la firma correcta del SDK de Resend.
  //    resend.webhooks.verify recibe un objeto { payload, headers, webhookSecret }
  //    donde headers debe contener { id, timestamp, signature } (cabeceras svix-*).
  //    Lanza si la firma es inválida → envolver en try/catch.
  const resend = new Resend(process.env.RESEND_API_KEY!);
  let verifiedPayload: unknown;
  try {
    verifiedPayload = await resend.webhooks.verify({
      payload,
      headers: {
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    });
  } catch (err) {
    console.warn('Webhook Svix: firma inválida', err);
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Normalizar evento vía el adaptador del proveedor (EmailProvider.parseWebhook).
  //    El route handler NO parsea el payload a mano: delega en parseWebhook para
  //    que Resend y SendGrid mapeen su formato particular a WebhookEvent[].
  const provider = getProvider('resend') as EmailProvider;
  const events = provider.parseWebhook(verifiedPayload, headers);

  for (const event of events) {
    // 3. Idempotencia por provider_event_id
    const { data: existing } = await supabase
      .from('email_events')
      .select('id')
      .eq('provider_event_id', event.evt_id)
      .single();
    if (existing) continue;

    // 4. Resolver org desde tags.organization_id o provider_message_id
    const orgId = event.tags?.organization_id || await resolveOrgFromMessageId(event.email_id);
    if (!orgId) continue; // log anomalía, no fallar

    // 5. Mapear evento
    const mapping = EVENT_MAP[event.event_type]; // ver tabla abajo
    if (!mapping) continue;

    // 6. INSERT email_events + UPDATE email_messages
    await supabase.from('email_events').insert({
      organization_id: orgId, email_message_id: messageId,
      event_type: event.event_type, payload: event,
      provider_event_id: event.evt_id,
    });

    await supabase.from('email_messages').update(mapping.update).eq('id', messageId);

    // 7. Bounce duro → suppression
    if (event.event_type === 'email.bounced' && event.bounce_type === 'hard') {
      await addToSuppressionList(orgId, event.to);
    }
    // 8. Queja → do_not_email
    if (event.event_type === 'email.complained') {
      await markDoNotEmail(orgId, event.to);
    }
  }

  return new Response('OK', { status: 200 });
}
```

> **Firma de `resend.webhooks.verify`:** el SDK de Resend expone
> `webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret })`
> — NO la forma posicional `verify(body, headers, secret)`. `payload` es el body crudo
> como string (no parseado); `headers` son las tres cabeceras `svix-*`; `webhookSecret`
> es el secreto configurado en el dashboard de Resend. El método **lanza** si la firma
> no coincide, por eso va en `try/catch` y se responde 401.

Mapeo de los 12 eventos de Resend:

| Evento Resend | `email_messages.status` | Campos actualizados |
|---|---|---|
| `email.sent` | `sent` | `sent_at` |
| `email.delivered` | `delivered` | `delivered_at` |
| `email.opened` | `opened` | `first_opened_at`, `open_count++` |
| `email.clicked` | `clicked` | `first_clicked_at`, `click_count++` |
| `email.bounced` | `bounced` | `bounced_at`, `bounce_type` |
| `email.complained` | `complained` | `complained_at` |
| `email.unsubscribed` | `unsubscribed` | `unsubscribed_at` |

### 4.6 Idempotencia, rate limit y cola

- `Idempotency-Key`: `org{orgId}/{contexto}/{relatedType}/{relatedId}/{messageId}` → unique en `email_messages`.
  - `messageId` es el ID que devuelve el proveedor (Resend `message_id`), **no** un timestamp.
  - Para envíos nuevos (aún sin `messageId` del proveedor) se usa un UUID v4 generado
    client-side como placeholder; una vez que Resend responde, el `provider_message_id`
    queda persistido en `email_messages` y los reintentos usan esa misma key.
  - Esto garantiza idempotencia real: reintentos del mismo envío producen la misma key.
- Rate limit: 10 req/s de Resend → cola simple con `setInterval` o `p-queue`.
- `scheduled_at` para envíos programados (lo usa F8).

### 4.7 Variables de entorno

| Variable | Requerida | Para qué |
|---|---|---|
| `RESEND_API_KEY` | sí | API principal |
| `RESEND_WEBHOOK_SECRET` | sí | Verificación Svix |
| `ENCRYPTION_KEY` | sí | Cifrar API keys por dominio |
| `SENDGRID_API_KEY` | no | Fallback |

### 4.8 Dependencias npm

`resend`, `react-email`, `svix` instalados en F0.

---

## 5. UI

### 5.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/plantillas` | `src/app/app/crm/plantillas/page.tsx` | crear | Lista de plantillas por canal |
| `/app/crm/plantillas/[id]` | `src/app/app/crm/plantillas/[id]/page.tsx` | crear | Editor de bloques |

### 5.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/plantillas/TemplateList.tsx` | **crear** | — | Lista por canal (email/WA/SMS) |
| `src/components/crm/plantillas/EmailTemplateEditor.tsx` | **crear** | `template?` | Editor de bloques con preview |
| `src/components/crm/plantillas/BlockPalette.tsx` | **crear** | — | Paleta de bloques arrastrables |
| `src/components/crm/plantillas/BlockPropsPanel.tsx` | **crear** | `block`, `onChange` | Panel de propiedades |
| `src/components/crm/plantillas/EmailPreview.tsx` | **crear** | `html` | Preview desktop/móvil |
| `src/components/crm/plantillas/EmailComposer.tsx` | **crear** | `customerId?`, `opportunityId?` | Redactar y enviar |
| `src/components/crm/plantillas/EmailThreadPanel.tsx` | **crear** | `customerId` | Historial de emails |
| `src/components/crm/plantillas/DomainPanel.tsx` | **crear** | — | Gestión de dominios + DNS |

### 5.3 Wireframes

```
┌─ Editor de bloques ──────────────────────────────────────────┐
│  ┌─ Paleta ──┐  ┌─ Canvas ──────────────┐  ┌─ Props ──────┐ │
│  │ Heading   │  │ ┌─ Heading ─────────┐ │  │ Text:        │ │
│  │ Text      │  │ │ Bienvenido        │ │  │ [Bienvenido] │ │
│  │ Image     │  │ └───────────────────┘ │  │ Level: [H1▼] │ │
│  │ Button    │  │ ┌─ Text ────────────┐ │  │ Color: [#..] │ │
│  │ Divider   │  │ │ Gracias por tu... │ │  │ Align: [L▼]  │ │
│  │ Spacer    │  │ └───────────────────┘ │  └──────────────┘ │
│  │ Columns   │  │ ┌─ Button ──────────┐ │                    │
│  │ Product   │  │ │ [Ver propuesta]   │ │  [Desktop|Móvil]  │
│  │ Quote     │  │ └───────────────────┘ │                    │
│  │ Signature │  │ ┌─ Signature ───────┐ │  [Preview ▼]      │
│  │ Social    │  │ │ Juan Pérez        │ │                    │
│  │ Footer    │  │ │ AE | +57...       │ │  [Guardar]        │
│  └───────────┘  └─────────────────────┘                    │
└────────────────────────────────────────────────────────────────┘

┌─ Panel de dominios ─────────────────────────────────────────┐
│  Dominio: midominio.com  [Verificado ✓]                    │
│  Remitente: ventas@midominio.com                            │
│  ── Registros DNS ──                                         │
│  SPF:  v=spf1 include:_spf.resend.com ~all  [📋 Copiar]    │
│  DKIM: resend._domainkey.midominio.com  [📋 Copiar]        │
│  DMARC: _dmarc.midominio.com  [📋 Copiar]                   │
│  [+ Añadir dominio]                                         │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 Animaciones Motion

```tsx
// Reorder de bloques con Motion
import { Reorder } from 'motion/react';

<Reorder.Group values={blocks} onReorder={setBlocks}>
  {blocks.map(block => (
    <Reorder.Item key={block.id} value={block}>
      <BlockCard block={block} />
    </Reorder.Item>
  ))}
</Reorder.Group>

// Panel de props con AnimatePresence
<AnimatePresence mode="wait">
  <motion.div
    key={selectedBlock?.id}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
  >
    <BlockPropsPanel block={selectedBlock} />
  </motion.div>
</AnimatePresence>

// Preview desktop/móvil con layout
<motion.div
  animate={{ width: isMobile ? '375px' : '600px' }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <EmailPreview html={html} />
</motion.div>
```

### 5.5 Accesibilidad

- Paleta de bloques: cada bloque es un `button` con `aria-label` descriptivo.
- Reorder con teclado: `Reorder.Item` soporta tab + flechas.
- Panel de props: cada control tiene `label` + `aria-describedby`.
- Preview con `role="iframe"` + `title`.

---

## 6. Opt-out, compliance y supresión

- `{{unsubscribe_url}}` obligatorio en plantillas de marketing.
- Página pública de baja (`/unsubscribe?token=...`).
- `List-Unsubscribe` header en todos los marketing.
- Distinción transaccional vs marketing: los transaccionales no llevan baja pero tampoco pueden ser marketing disfrazado.
- Suppression list por organización (bounce duro + quejas).
- CAN-SPAM/GDPR/Habeas Data.

---

## 7. Entregabilidad y reputación por organización

- Warm-up de dominio nuevo: límites progresivos (100 → 500 → 1000 → 5000 por día).
- Monitoreo de tasa de bounce y queja por organización.
- Alerta si bounce > 5% o queja > 0.1%.
- Corte automático si supera umbrales críticos.
- **No** usar dominio compartido para marketing (impacta reputación de todos).

---

## 8. Migración desde SendGrid

| Qué usa SendGrid hoy | Se migra | Notas |
|---|---|---|
| Emails de auth (`emailAuth.ts`) | No | SendGrid se mantiene para auth |
| Notificaciones del sistema | No | SendGrid se mantiene |
| Email marketing del CRM | Sí | Resend vía `provider_configs` |
| Email transaccional del CRM | Sí | Resend vía `provider_configs` |

> No se rompe nada: `provider_configs` decide. Orgs existentes pueden seguir con SendGrid; nuevas usan Resend por defecto.

---

## 9. Multi-tenant y seguridad

- Cada organización con su dominio, su API key (cifrada), sus plantillas.
- Merge tags solo del catálogo declarativo — no interpolación de campos arbitrarios.
- Webhook resuelve org desde `tags.organization_id` o `provider_message_id` — nunca default.
- API keys cifradas con AES-256-GCM.

---

## 10. Pruebas

### 10.1 Render de los 12 tipos de bloque

- Cada tipo de bloque renderiza a HTML válido con tablas.
- `columns` con 2 columnas → `<table>` con 2 `<td>`.
- `button` → `<a>` con padding inline.
- `image` → `<img>` con alt + width + height.

### 10.2 Casos borde

- Variable inexistente → usa default o string vacío.
- Variable de otra org → imposible (el catálogo solo tiene campos del contexto).
- Webhook duplicado → idempotente por `provider_event_id`.
- Webhook con firma inválida → 401.
- Bounce duro → añade a suppression list.
- Batch de 101 → 400 (límite 100).
- Adjunto de 41 MB → 413 (límite 40 MB).
- Dominio no verificado → 400 "dominio no verificado".
- Rate limit excedido → cola espera.

---

## 11. Definition of Done

- [ ] `email_domains`, `email_messages`, `email_events` existen con RLS.
- [ ] `templates.blocks_json` y `templates.channel` existen.
- [ ] `EmailProvider` con adaptadores Resend y SendGrid.
- [ ] Flujo de verificación de dominio funciona (create → DNS → verify → API key).
- [ ] Renderer convierte `blocks_json` → HTML compatible Outlook/Gmail.
- [ ] 12 tipos de bloque renderizan correctamente.
- [ ] Variables/merge tags se resuelven con defaults.
- [ ] `POST /api/email/send` con idempotencia.
- [ ] `POST /api/email/webhook` con verificación Svix + idempotencia.
- [ ] Mapeo de 12 eventos de Resend.
- [ ] Suppression list + do_not_email.
- [ ] `EmailTemplateEditor` con drag & drop + preview desktop/móvil.
- [ ] `EmailComposer` en drawer/detalle.
- [ ] `EmailThreadPanel` muestra historial con estados.
- [ ] `DomainPanel` con DNS copiables.
- [ ] Biblioteca de 8 plantillas importable.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 12. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Dominio no verificado → emails van a spam | Verificación obligatoria antes de enviar; fallback a subdominio compartido con advertencia |
| HTML de email no se ve bien en Outlook | Usar tablas + inline CSS; testar con Litmus o preview real |
| API key de dominio se filtra | Cifrado AES-256-GCM; nunca en logs; nunca al cliente |
| Webhook pierde eventos | Resend reintenta; idempotencia por `provider_event_id` |
| SendGrid y Resend duplican envíos | `provider_configs` decide uno solo por org; no coexisten para el mismo email |

---

## 13. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/email/emailService.ts` | crear | Orquestador |
| `src/lib/services/email/resendProvider.ts` | crear | Adaptador Resend |
| `src/lib/services/email/sendgridProvider.ts` | crear | Adaptador SendGrid |
| `src/lib/services/email/emailRenderer.ts` | crear | Renderer blocks→HTML |
| `src/lib/services/email/domainService.ts` | crear | Gestión dominios |
| `src/lib/services/email/webhookService.ts` | crear | Procesamiento webhooks |
| `src/lib/services/email/types.ts` | crear | Interfaz `EmailProvider` |
| `src/app/api/email/send/route.ts` | crear | Envío |
| `src/app/api/email/batch/route.ts` | crear | Batch |
| `src/app/api/email/preview/route.ts` | crear | Preview |
| `src/app/api/email/test-send/route.ts` | crear | Test send |
| `src/app/api/email/webhook/route.ts` | crear | Webhook |
| `src/app/api/email/domains/route.ts` + `[id]/verify` | crear | CRUD dominios |
| `src/app/api/crm/templates/route.ts` + `[id]` | crear | CRUD plantillas |
| `src/app/api/crm/templates/import-library/route.ts` | crear | Importar biblioteca |
| `src/app/app/crm/plantillas/page.tsx` + `[id]` | crear | UI plantillas |
| `src/components/crm/plantillas/TemplateList.tsx` | crear | Lista |
| `src/components/crm/plantillas/EmailTemplateEditor.tsx` | crear | Editor bloques |
| `src/components/crm/plantillas/BlockPalette.tsx` | crear | Paleta |
| `src/components/crm/plantillas/BlockPropsPanel.tsx` | crear | Panel props |
| `src/components/crm/plantillas/EmailPreview.tsx` | crear | Preview |
| `src/components/crm/plantillas/EmailComposer.tsx` | crear | Composer |
| `src/components/crm/plantillas/EmailThreadPanel.tsx` | crear | Thread |
| `src/components/crm/plantillas/DomainPanel.tsx` | crear | Dominios |
| `src/emails/` | crear | Plantillas TSX React Email de sistema |
