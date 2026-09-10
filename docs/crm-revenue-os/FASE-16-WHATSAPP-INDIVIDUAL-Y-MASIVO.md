# FASE 16 — WhatsApp individual y masivo desde el CRM

> Fecha: 2026-09-08 · Estado: **nuevo en V4** (antes el WhatsApp del CRM estaba repartido entre F7/F8 sin diseño propio)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (IDOR C2/C4 y firma del webhook C3 cerrados; `outbound_jobs` + pg_cron + `/api/crm/jobs/run` + `fn_claim_jobs`; `contact_consents` + `fn_can_contact`; `messages.related_opportunity_id`; `activities.message_id`; `provider_pricing`; secretos cifrados), **F7** (tabla `templates` unificada, `interpolate` y `VARIABLE_CATALOG` reutilizados para variables HSM; `outbound_jobs` kind `email_batch` para campañas de email), **F9** (timeline + `QuickActionsBar` + `WhatsAppEntry`).
> Bloquea: F8 (steps `whatsapp` de secuencias usan `whatsappOutboundService`), F6 (el agente IA escribe WhatsApp con el mismo servicio).
> Esfuerzo: **XL**. Valor: alto (hoy NO se puede enviar WhatsApp desde el pipeline: C12).

---

## 0. Objetivo y alcance

Al terminar, con una organización de prueba con canal WhatsApp Cloud API conectado:

1. Desde tarjeta/drawer/detalle de oportunidad, `ComposeWhatsAppDialog` muestra el canal, el estado de la ventana de 24 h y permite enviar texto libre (ventana abierta) o una plantilla HSM APROBADA con variables resueltas desde el contexto de la oportunidad (ventana cerrada). El mensaje se inserta en `messages` con el **mismo shape que la bandeja de chat** y lo despacha `trg_channel_dispatch` → Edge Function `channel-dispatch`.
2. El envío crea 1 `activities` (`activity_type='whatsapp'`, `message_id`, `related_type='opportunity'`) y aparece en el timeline (`WhatsAppEntry` de F9) con estados sent/delivered/read/failed provenientes de `message_events`. Las respuestas del cliente aparecen en el mismo hilo y notifican al vendedor.
3. El inbound del webhook Cloud rellena `content` (una sola shape, fix C20), actualiza `conversations.last_inbound_at`, detecta palabras de baja (STOP/BAJA/CANCELAR/NO MÁS) y registra `contact_consents` `opted_out`; `fn_can_contact(customer,'whatsapp')` bloquea envíos posteriores (individual, campañas, secuencias, agente).
4. Plantillas HSM se crean desde `/app/crm/plantillas` (tab WhatsApp) → `POST /{WABA_ID}/message_templates` (Graph v26.0) o Twilio Content API → estado de aprobación sincronizado por webhook `message_template_status_update` y por `GET /{WABA_ID}/message_templates`.
5. Campañas masivas: origen segmento / etapa del pipeline / selección del Kanban → `fn_campaign_materialize` escribe `campaign_contacts` (dedupe, excluye opt-out, ventana y duplicados) → `outbound_jobs` kind `campaign_batch` (lotes de 50, 1 msg/6 s por wa_id, ≤80 mps global, reintentos, 131049 sin reintento 24 h) → `messages` → despachador → `message_events` → `fn_campaign_mark_*`. Pausar/reanudar/cancelar; métricas en vivo; costo estimado vs real; verificación del `messaging_limit` del WABA antes de lanzar.
6. Configuración WhatsApp por org: canal por defecto, palabras de baja, horario permitido, límite diario; capacidades por tipo de canal (Cloud / Twilio / QR) claras en la UI.
7. `BulkActionsDialog` del Kanban gana la pestaña "Mensaje" (WhatsApp masivo a la selección; email masivo reutiliza F7).

**No incluye:** conexión de canales (Embedded Signup y QR ya existen en `oauth/callback` y `WhatsAppQrCard`; aquí solo se seleccionan), Flows/catálogo/pagos de WhatsApp, chatbot IA de la bandeja (`trg_ai_auto_response` sigue igual), SMS masivo (solo se documenta el hook), Messenger/Instagram (el despachador los sigue soportando sin cambios).

---

## 1. Estado actual verificado

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| Bandeja → `messages` → `trg_channel_dispatch` → Edge `channel-dispatch` (A1) | ✅ | Único path real. `bandeja/page.tsx:334-346` inserta `{direction:'outbound', role:'agent', channel_id, content, sender_member_id, content_type, metadata}`; `index.ts:50-78` Cloud, `:81-115` Meta, `:198-258` Evolution. Solo texto (`type:'text'`, `:67`); Graph `v21.0` (`:21`). |
| Inbound Cloud API (A2) `whatsappCloudService.ts:340-378` | 🟡 | El insert `:413-423` usa `sender_type`, `sender_id`, `external_id`, `status` (columnas que NO existen en `messages`) y `role:'user'` (fuera del CHECK `customer\|agent\|ai\|system`); faltan `direction`, `channel_id`, `content` (NOT NULL) → el insert falla y el error no se maneja. `processStatusUpdate` `:437` busca `external_id` (no existe; la columna es `external_message_id`). Solo el path QR (`whatsappQrService.ts:385-395`) inserta con la shape correcta. |
| Inbound QR/Evolution (A3) | ✅ | `qr/inbound` → `processInboundCallback` → insert correcto con `content`. |
| Botón WhatsApp del pipeline (C12) `src/components/crm/pipeline/drawer/ActivityActions.tsx:606-708` | 🔴 | Cloud: envía `{to, type:'text', text: string, conversation_id: opportunityId}` a `whatsapp/send` que exige `channel_id` (400) y `text.body`; Twilio: sin `Authorization` ni `orgId` → 401. |
| `POST /api/integrations/whatsapp/send` (C2) `send/route.ts:7-38` | 🔴 | Sin `getServerOrgContext`; `channel_id`/`organization_id` del body; insert `:111-130` con shape inválida. F0 lo cierra; esta fase lo **reemplaza** por `/api/crm/whatsapp/send`. |
| Webhook Cloud (C3) `whatsapp/webhook/route.ts:27,36-38` | 🔴 | Lee `x-hub-signature-256` y no verifica; `verifyWhatsAppWebhookSignature` (`whatsappCloudConfig.ts:71-82`) usa `===` no constant-time. F0 lo cierra con el patrón de `webhooks/facebook/[channelId]:43-53`. |
| `message_template_status_update` (B15) `whatsappCloudService.ts:345` | 🔴 | `if (change.field !== 'messages') continue;` descarta los cambios de estado de plantillas. |
| Plantillas (B15) `listTemplates` `:221-237` | 🟡 | Read-only con `fields=name,language,status,category,components`; sin crear, sin persistir, sin `parameter_format`. |
| Endpoints WA muertos (B9) | 🔴 | `qr/send`, `qr/mark-read`, `mark-read`, `templates` sin callers; `sendImage/sendDocument/getMediaUrl/downloadMedia` inalcanzables. |
| Twilio WA `twilio/send-whatsapp` (B10, C4) | 🟡 | `twilioService.sendWhatsApp(orgId,to,message,module,mediaUrl)` (`twilioService.ts:116`) funciona pero sin `contentSid`; usa cliente browser (`:9`, C9); IDOR (F0). |
| Sin deep-link oportunidad → conversación (B14) | 🟡 | Solo `CRMQuickNav` → `/app/chat/bandeja`. |
| Sin colas ni rate limit (B16) | 🔴 | `WHATSAPP_RATE_LIMITS`/`TIERS` (`whatsappCloudConfig.ts:56-69`) nunca se leen; único throttle `dispatch-pending slice(0,1)`. |
| Campañas `CampanasService.ts:247-263` | 🔴 | "Enviar" = `UPDATE campaigns SET status='sending'`. `campaign_contacts` solo se lee (`:184-205`), nunca se escribe. Contenido = `Textarea` (`CampanaNuevaPage.tsx:248-256`) con variables `{nombre}` inventadas. Sin worker, sin plantilla HSM, sin ventana, sin opt-out. |
| Schema `campaigns` | 🟡 | CHECK `status IN (draft,scheduled,sending,sent)` (sin paused/canceled); `channel IN (email,whatsapp)`; sin `channel_id`, `source_type`, `throttle`, costos. RLS `campaigns_*_policy` sin `is_active`. |
| Schema `campaign_contacts` | 🟡 | CHECK `state IN (sent,opened,clicked,replied,bounced)` (sin pending/queued/delivered/read/failed/skipped); sin `organization_id`, `opportunity_id`, `message_id`, errores. `fn_campaign_mark_sent` hace INSERT sin `organization_id` (ok hoy porque la columna no existe). |
| Schema `messages` / `conversations` | 🟡 | `messages` con `content NOT NULL`, `content_type` incluye `template`, `payload jsonb`, `external_message_id` (índice parcial existente). `conversations.last_message_at` se actualiza para cualquier dirección (`update_conversation_last_message`) → no sirve para ventana 24 h; falta `last_inbound_at`. |
| `timelineService.ts:300-302` (B15 UI) | 🟡 | WhatsApp solo si `entityType==='customer'` (liga por `sender_customer_id`). F0 añade `related_opportunity_id`; F9 lo consume. |
| Opt-out (C18 + audit D) | 🔴 | `twilioWebhook.ts:37-70` no procesa STOP; `consentService.ts` solo cubre grabación (`ConsentType` `recording\|data_processing\|marketing\|custom`). |
| Secretos (C8) `chatChannelsService.ts:192-197, 236-241` | 🔴 | `select('*')` de `channel_credentials` con cliente anon. F0 lo cierra; aquí ningún componente nuevo lee `channel_credentials` desde el browser. |
| `BulkActionsDialog.tsx` (934L) | 🟡 | Tabs de productos/espacios/conceptos; sin acción de mensajería. |

### 1.1 Estado tras la ronda 2 (2026-09-08)

La tabla anterior es el diagnóstico **previo**. Tras las rondas 1 y 2 quedan así
(la columna «Dónde se resolvió» incluye lo corregido en la ronda 2 a partir del
informe del tester `TEST-F16-r1.md`):

| Hallazgo | Estado | Dónde se resolvió |
|---|---|---|
| A1 Edge `channel-dispatch` solo texto / Graph v21.0 | ✅ resuelto | `supabase/functions/channel-dispatch/index.ts` reescrita: `v26.0` (`WHATSAPP_GRAPH_VERSION`), ramas `text` / `template` (parámetros nombrados) / `image` / `document`, rama Twilio (`ContentSid` + `ContentVariables`) y rama Baileys; escribe `messages.external_message_id` y `message_events.error_code`. **Desplegada por MCP (versión 8)**. Ronda 2: la consulta de `channel_credentials` ya no usa `maybeSingle()` sin filtro — `channel_credentials` es `UNIQUE (channel_id, provider)`, así que un canal con credenciales `meta` **y** `twilio` habría roto todos sus envíos con `NO_CREDENTIALS` en silencio (tester r1 · 11). |
| A2 Inbound Cloud con columnas inexistentes | ⛔ **bloqueado por BD** | Las columnas son correctas (`whatsappCloudService.ts:437-473`: `direction`, `channel_id`, `content` NOT NULL, `content_type`, `payload`, `external_message_id`, idempotencia por `external_message_id`), **pero el INSERT se revierte entero**: el disparador preexistente `fn_update_customer_channel_identity` inserta `identity_type = 'whatsapp'` y el CHECK de `customer_channel_identities` solo admite `whatsapp_phone` (tester r1 · 1; verificado con INSERT + rollback contra la BD: 17 inbound de WhatsApp y **0** con `external_message_id`). Ronda 2: el fallo **ya no se traga** — `WhatsAppInboundPersistError` se registra con detalle y se propaga, y la ruta del webhook responde 500 para que Meta reintente. Además `findOrCreateCustomer` inserta la identidad con `organization_id` e `identity_type='whatsapp_phone'` (antes faltaban ambos NOT NULL y fallaba siempre en silencio) y el inbound guarda `payload.phone` para que el disparador no use el `wamid` como identidad. **Requiere el DDL de §13 · Ronda 2.** |
| A3 Inbound QR | ✅ ya correcto | Sin cambios. |
| B15 `message_template_status_update` descartado | ✅ resuelto | `whatsappCloudService.ts:349` acepta `message_template_status_update` y `message_template_quality_update`; `webhookTemplateStatus.ts` aplica el cambio a `templates`. |
| B15 Plantillas read-only | ✅ resuelto | `templateService.ts`: CRUD sobre `templates` (`channel='whatsapp'`, `kind='hsm'`), `syncFromMeta` y `submitToMeta` (Graph v26.0 con el token del canal) y alternativa Twilio Content API. |
| B16 Sin colas ni rate limit | ✅ resuelto | `campaignBatch.ts`: lotes ≤50, throttle 1 msg/6 s por `wa_id` y ≤80/s global (`planDelay`), `131049` sin reintento 24 h, `131056`/`130429` reencolan (`classifySendError`). Ronda 2: la reclamación de contactos es **atómica** (`claimContacts` condiciona el UPDATE por `metadata->>state` y escribe un `claim_token` por lote), así que dos lotes concurrentes ya no envían dos veces (tester r1 · 2; antes 8 contactos → 16 mensajes, ahora 8/8 verificado en vivo); y un `131056` sobre una campaña ya cerrada la **reabre** y encola un lote nuevo en vez de dejar el contacto huérfano (`reopenCampaignForRetry`, tester r1 · 4). |
| C2 `/api/integrations/whatsapp/send` | ✅ sustituido | `POST /api/crm/whatsapp/send` con contexto de org del servidor. |
| C12 Botón WhatsApp del pipeline | ⚠️ **parcial — falta un import de F9** | El compositor de F16 (`src/components/crm/whatsapp/ComposeWhatsAppDialog.tsx`, ventana 24 h + plantillas + costo + programación) está montado en `BulkActionsDialog`, pero `QuickActionsBar.tsx:46,208` (punto de entrada del pipeline) sigue importando el provisional de F9 `src/components/crm/shared/ComposeWhatsAppDialog.tsx` (tester r1 · 6). El cambio de import es de una línea y `src/components/crm/shared/**` es propiedad de F9: pedido en «Integración pendiente» del informe `F16-r2.md`. Ronda 2: además el masivo del Kanban ya **se lanza** (antes «Calcular» invalidaba la materialización y «Enviar» devolvía 409 en bucle — tester r1 · 3). |
| C20 Múltiples shapes de `messages` | ✅ resuelto en ronda 2 | `outboundService.sendWhatsApp` es el único insert saliente **de WhatsApp**: la bandeja de chat (`src/app/app/chat/bandeja/page.tsx`) insertaba `messages` outbound a mano, sin ventana ni `fn_can_contact` (tester r1 · 7); ahora, cuando el canal de la conversación es WhatsApp, envía por `POST /api/crm/whatsapp/send`. Queda `whatsappQrService.ts:385` (WIP de su dueño, regla 7). Shape: `content` SIEMPRE, `content_type` `text\|template\|image\|file`, `payload.template`, `related_opportunity_id`, `sender_member_id`; el despacho lo hace `trg_channel_dispatch`. |
| Campañas sin worker/materialización | ✅ resuelto | `campaignMaterialize` (idempotente, exclusiones), `campaignService` (launch/pause/resume/cancel/stats) y el handler `campaign_batch`. |
| Validación de esquema en las rutas | ✅ ronda 2 | Ninguna ruta de la fase usaba zod (tester r1 · 9): ahora todas validan con `src/lib/services/crm/whatsapp/schemas.ts` (`parseWith` → `WhatsAppError('VALIDATION', …, 400)`), incluidos los query params y `/api/integrations/whatsapp/send`. El body nunca puede traer `organization_id`. |
| Acciones admin-only ofrecidas a todos | ✅ ronda 2 | `GET /api/crm/campaigns`, `/campaigns/[id]` y `/whatsapp/channels` devuelven `can_manage` (admin de organización) y la UI (lista, detalle, compositor masivo y pestaña de plantillas) deshabilita y explica en vez de mostrar un 403 genérico (tester r1 · 8). |
| C3 Webhook Cloud sin verificar firma | ↪️ SEC | Cerrado por SEC-0 (no es de esta fase). |
| B9 Endpoints WA muertos, B10/C4 Twilio, C8 secretos | ↪️ pendiente | Ver §13 «Pendiente». |


---

## 2. Arquitectura y flujo

### 2.1 Principio: una sola shape de `messages`, un solo despachador

Toda salida de WhatsApp de la plataforma (bandeja, CRM individual, campañas, secuencias F8, agente F6) hace **INSERT en `messages`** con:

```
organization_id, conversation_id (find-or-create por customer+channel), channel_id,
direction 'outbound', role 'agent'|'ai', sender_member_id,
content_type 'text'|'template'|'image'|'file', content (SIEMPRE: texto o cuerpo de la plantilla ya resuelto),
payload { template:{name, language, components} }  (solo HSM)  |  { media:{url, mime, filename} },
related_opportunity_id, campaign_id, metadata { source:'crm'|'campaign'|'sequence'|'agent', client_request_id }
```

`trg_channel_dispatch` (existente, sin cambios) llama a la Edge Function, que se amplía para enviar `type:'template'` (Cloud), `contentSid`+`contentVariables` (Twilio) o texto (Evolution) y para escribir `messages.external_message_id` (columna real) además de `message_events`. El inbound (webhook Cloud, QR, Twilio) también inserta con esta shape y rellena `content`.

### 2.2 Secuencia individual

```
Vendedor → QuickActionsBar → <ComposeWhatsAppDialog opportunityId customerId/>
  │ GET /api/crm/whatsapp/window/{customerId}?channelId → {open, expires_at, last_inbound_at, channel{type,capabilities}}
  │ GET /api/crm/whatsapp/templates?status=APPROVED   (solo si ventana cerrada o el usuario elige Plantilla)
  │ POST /api/crm/whatsapp/templates/{id}/preview {context}  → cuerpo con variables resueltas + categoría + costo
  ▼
POST /api/crm/whatsapp/send  (sesión; ownership de customer/opportunity/channel/template)
  │ a. fn_can_contact(customer,'whatsapp') = false → 422 CONTACT_OPTED_OUT
  │ b. ventana: si cerrada y text → 422 WINDOW_CLOSED; si template no APPROVED → 422 TEMPLATE_NOT_APPROVED
  │ c. canal QR + template → 422 CHANNEL_NO_TEMPLATES ; marketing a +1 (EE.UU.) → 422 US_MARKETING_BLOCKED
  │ d. horario permitido (comm_settings.whatsapp_allowed_hours) → si fuera y no `force` → 422 OUTSIDE_HOURS (o programar)
  │ e. deduct_comm_credits(org,'whatsapp',1) = false → 402 NO_CREDITS
  │ f. find-or-create conversation (status open) → INSERT messages (shape §2.1) → trigger → Edge Function
  │ g. trigger trg_messages_crm_activity → INSERT activities (whatsapp, message_id, related_opportunity_id)
  │ h. respuesta 201 {message_id, conversation_id, activity_id}
  ▼
Edge channel-dispatch → Graph /{PHONE_NUMBER_ID}/messages (text|template) | Twilio Messages | Evolution
  │ message_events 'sent'|'failed' (+error_code) ; messages.external_message_id
  ▼
Webhook Cloud (firma) → statuses[] → message_events delivered|read|failed (por external_message_id)
                     → messages[] inbound → content + last_inbound_at + opt-out + activity + notificación
  ▼
UI: timeline (F9) WhatsAppEntry realtime sobre messages/message_events ; bandeja de chat ve el mismo hilo
```

### 2.3 Secuencia masiva (campaña)

```
/app/crm/campanas/nueva → POST /api/crm/campaigns {channel:'whatsapp', channel_id, template_id, source, schedule, throttle_mps}
  → POST /api/crm/campaigns/{id}/materialize → RPC fn_campaign_materialize → campaign_contacts (pending|skipped:reason) + estimado
  → POST /api/crm/campaigns/{id}/launch → verifica messaging_limit (GET /{WABA_ID}?fields=whatsapp_business_manager_messaging_limit),
       créditos (deduct_comm_credits por total pending), status 'scheduled'|'sending' → outbound_jobs kind 'campaign_batch' (batch 1)
pg_cron (cada minuto) → /api/crm/jobs/run → handler campaign_batch:
  claim 50 contacts (pending → queued FOR UPDATE SKIP LOCKED) → por contacto: re-chequear fn_can_contact + ventana + límite por wa_id
  → INSERT messages (content_type 'template', campaign_id, related_opportunity_id) → fn_campaign_mark_sent
  → si quedan pending: reencolar batch N+1 con run_at = now() + ceil(50 / throttle_mps) s
Webhook statuses → message_events → trigger fn_campaign_sync_from_event → fn_campaign_mark_delivered/read/failed
Inbound del contacto (≤72 h) → fn_campaign_mark_replied + campaign_contacts.replied_at + activity en la oportunidad
Pausa: status 'paused' → el handler no reclama; Reanudar → 'sending' + job; Cancelar → 'canceled' + pending→skipped:'canceled'
```

### 2.4 Máquinas de estado

`campaigns.status`: `draft → scheduled → sending ⇄ paused → sent | canceled | failed` (`failed` solo si el canal deja de estar disponible o 3 lotes seguidos fallan al 100 %).

`campaign_contacts.state`: `pending → queued → sent → delivered → read`; ramas `replied` (desde cualquier estado ≥ sent), `failed` (con `error_code`), `skipped` (`skipped_reason`: opted_out | no_phone | window_required | duplicate | canceled | rate_limited_24h | us_marketing | invalid_number). Monótono: `read` nunca vuelve a `delivered`.

`messages` (WhatsApp) no tiene columna de estado: el estado es el último `message_events.event_type` por `message_id` (`sent < delivered < read`; `failed` terminal). La UI usa la vista `v_message_last_event` (§3.1).

---

## 3. Base de datos

Patrón RLS `org_member` de `calls`. Migraciones solo vía MCP `apply_migration`.

### 3.1 Migraciones

#### `202609_crm_v4_f16_conversations_last_inbound`

```sql
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;
UPDATE conversations c SET last_inbound_at = m.max_in
  FROM (SELECT conversation_id, max(created_at) AS max_in FROM messages WHERE direction = 'inbound' GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id AND c.last_inbound_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_customer_channel_inbound
  ON conversations (customer_id, channel_id, last_inbound_at DESC);

-- Reemplaza la función existente (misma firma; añade last_inbound_at)
CREATE OR REPLACE FUNCTION update_conversation_last_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    unread_count = CASE WHEN NEW.direction = 'inbound' AND NEW.role = 'customer' THEN unread_count + 1 ELSE unread_count END,
    last_agent_message_at = CASE WHEN NEW.role = 'agent' THEN NEW.created_at ELSE last_agent_message_at END,
    last_inbound_at = CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at ELSE last_inbound_at END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_whatsapp_window(p_customer_id uuid, p_channel_id uuid)
RETURNS TABLE (is_open boolean, last_inbound_at timestamptz, expires_at timestamptz, conversation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (c.last_inbound_at IS NOT NULL AND c.last_inbound_at > now() - interval '24 hours'),
         c.last_inbound_at, c.last_inbound_at + interval '24 hours', c.id
  FROM conversations c
  WHERE c.customer_id = p_customer_id AND c.channel_id = p_channel_id
    AND c.organization_id = current_org_id()
  ORDER BY c.last_inbound_at DESC NULLS LAST LIMIT 1 $$;
```

#### `202609_crm_v4_f16_messages_crm`

```sql
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_related_opp ON messages (related_opportunity_id, created_at DESC)
  WHERE related_opportunity_id IS NOT NULL;                       -- related_opportunity_id viene de F0
CREATE INDEX IF NOT EXISTS idx_message_events_message_time ON message_events (message_id, event_time DESC NULLS LAST, created_at DESC);

ALTER TABLE message_events DROP CONSTRAINT IF EXISTS message_events_event_type_check;
ALTER TABLE message_events ADD CONSTRAINT message_events_event_type_check
  CHECK (event_type IN ('queued','sent','delivered','read','failed','deleted'));

CREATE OR REPLACE VIEW v_message_last_event WITH (security_invoker = true) AS
  SELECT DISTINCT ON (message_id) message_id, event_type, error_code, error_message,
         coalesce(event_time, created_at) AS at
  FROM message_events
  ORDER BY message_id, CASE event_type WHEN 'failed' THEN 9 WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END DESC,
           coalesce(event_time, created_at) DESC;

```

Trigger de actividad (misma migración):

```sql
-- Actividad automática por mensaje de WhatsApp ligado al CRM (saliente e inbound)
CREATE OR REPLACE FUNCTION fn_messages_crm_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text; v_opp uuid; v_customer uuid; v_user uuid;
BEGIN
  SELECT type INTO v_type FROM channels WHERE id = NEW.channel_id;
  IF v_type <> 'whatsapp' THEN RETURN NEW; END IF;
  SELECT customer_id INTO v_customer FROM conversations WHERE id = NEW.conversation_id;
  v_opp := NEW.related_opportunity_id;
  IF v_opp IS NULL AND NEW.direction = 'inbound' THEN           -- enlazar a la oportunidad abierta más reciente del cliente
    SELECT id INTO v_opp FROM opportunities WHERE customer_id = v_customer AND organization_id = NEW.organization_id
      AND status = 'open' ORDER BY updated_at DESC LIMIT 1;
    IF v_opp IS NOT NULL THEN UPDATE messages SET related_opportunity_id = v_opp WHERE id = NEW.id; END IF;
  END IF;
  IF NEW.direction = 'outbound' THEN
    SELECT user_id INTO v_user FROM organization_members WHERE id = NEW.sender_member_id;
  ELSE
    SELECT salesperson_id INTO v_user FROM opportunities WHERE id = v_opp;
  END IF;
  INSERT INTO activities (organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at,
                          channel, outcome, message_id, conversation_id, metadata)
  VALUES (NEW.organization_id, 'whatsapp', v_user, left(NEW.content, 500),
          CASE WHEN v_opp IS NOT NULL THEN 'opportunity' ELSE 'customer' END, coalesce(v_opp, v_customer), NEW.created_at,
          'whatsapp', CASE WHEN NEW.direction = 'inbound' THEN 'received' ELSE 'sent' END, NEW.id, NEW.conversation_id,
          jsonb_build_object('direction', NEW.direction, 'content_type', NEW.content_type, 'campaign_id', NEW.campaign_id,
                             'template_id', NEW.template_id, 'customer_id', v_customer));
  IF NEW.direction = 'inbound' AND v_user IS NOT NULL THEN
    PERFORM fn_create_org_notification(NEW.organization_id, v_user, 'app', 'whatsapp_reply',
      'Respuesta por WhatsApp', left(NEW.content, 140),
      jsonb_build_object('conversation_id', NEW.conversation_id, 'opportunity_id', v_opp, 'message_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_messages_crm_activity ON messages;
CREATE TRIGGER trg_messages_crm_activity AFTER INSERT ON messages FOR EACH ROW
  WHEN (NEW.role IN ('customer','agent','ai') AND NEW.content_type <> 'system')
  EXECUTE FUNCTION fn_messages_crm_activity();
```

Nota: la bandeja de chat también dispara esta actividad (deseado: "el chat no genera actividades" era una brecha del audit). Para conversaciones sin oportunidad abierta se registra sobre el cliente. `activities.message_id`/`conversation_id` vienen de F0 (D4).

#### `202609_crm_v4_f16_whatsapp_optout`

```sql
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_default_channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_optout_keywords text[] NOT NULL DEFAULT ARRAY['STOP','BAJA','CANCELAR','NO MAS','NO MÁS','UNSUBSCRIBE','SALIR'],
  ADD COLUMN IF NOT EXISTS whatsapp_optin_keywords text[] NOT NULL DEFAULT ARRAY['START','ALTA','VOLVER'],
  ADD COLUMN IF NOT EXISTS whatsapp_allowed_hours jsonb NOT NULL DEFAULT '{"tz":"America/Bogota","days":[1,2,3,4,5,6],"from":"08:00","to":"20:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_daily_limit integer,          -- NULL = solo límite de Meta
  ADD COLUMN IF NOT EXISTS whatsapp_sent_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_today_date date NOT NULL DEFAULT current_date;

```

Detección de baja/alta por palabra clave (misma migración):

```sql
CREATE OR REPLACE FUNCTION fn_whatsapp_detect_optout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kw text[]; v_in text[]; v_customer uuid; v_norm text; v_type text;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.content_type <> 'text' THEN RETURN NEW; END IF;
  SELECT type INTO v_type FROM channels WHERE id = NEW.channel_id;
  IF v_type <> 'whatsapp' THEN RETURN NEW; END IF;
  SELECT whatsapp_optout_keywords, whatsapp_optin_keywords INTO v_kw, v_in FROM comm_settings WHERE organization_id = NEW.organization_id;
  v_norm := upper(regexp_replace(unaccent(coalesce(NEW.content,'')), '[^[:alnum:] ]', '', 'g'));
  SELECT customer_id INTO v_customer FROM conversations WHERE id = NEW.conversation_id;
  IF v_norm = ANY (SELECT upper(unaccent(k)) FROM unnest(coalesce(v_kw, ARRAY['STOP','BAJA','CANCELAR'])) k) THEN
    INSERT INTO contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
    VALUES (NEW.organization_id, v_customer, 'whatsapp', 'opted_out', 'inbound_keyword',
            jsonb_build_object('message_id', NEW.id, 'text', NEW.content), now())
    ON CONFLICT (organization_id, customer_id, channel) DO UPDATE
      SET status = 'opted_out', source = EXCLUDED.source, evidence = EXCLUDED.evidence, changed_at = now();
    UPDATE customers SET metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('do_not_whatsapp', true, 'whatsapp_optout_at', now())
     WHERE id = v_customer;
    UPDATE campaign_contacts SET state = 'skipped', skipped_reason = 'opted_out', updated_at = now()
     WHERE customer_id = v_customer AND state IN ('pending','queued');
  ELSIF v_norm = ANY (SELECT upper(unaccent(k)) FROM unnest(coalesce(v_in, ARRAY['START'])) k) THEN
    INSERT INTO contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
    VALUES (NEW.organization_id, v_customer, 'whatsapp', 'opted_in', 'inbound_keyword', jsonb_build_object('message_id', NEW.id), now())
    ON CONFLICT (organization_id, customer_id, channel) DO UPDATE SET status = 'opted_in', source = EXCLUDED.source, changed_at = now();
    UPDATE customers SET metadata = coalesce(metadata,'{}'::jsonb) - 'do_not_whatsapp' WHERE id = v_customer;
  ELSE
    -- primer inbound = opt-in implícito (Habeas Data: evidencia = el propio mensaje)
    INSERT INTO contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
    VALUES (NEW.organization_id, v_customer, 'whatsapp', 'opted_in', 'inbound_message', jsonb_build_object('message_id', NEW.id), now())
    ON CONFLICT (organization_id, customer_id, channel) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_whatsapp_detect_optout ON messages;
CREATE TRIGGER trg_whatsapp_detect_optout AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION fn_whatsapp_detect_optout();
CREATE EXTENSION IF NOT EXISTS unaccent;
```

Uso de `contact_consents` en esta fase: `status='opted_in'` se escribe con el primer inbound (`source='inbound_message'`), por formulario web (`source='web_form'`, escrito por `leadCaptureService`) o manualmente desde la ficha (`source='manual'`, con `evidence.note`). `opted_out` por palabra clave, por Twilio `OptOutType=STOP`, o manual. `fn_can_contact(customer,'whatsapp')` (F0) devuelve `false` si `opted_out` o `customers.metadata.do_not_whatsapp=true`; con `unknown`/sin fila devuelve `true` solo para `kind='utility'`; para `marketing` exige `opted_in` (parámetro `p_purpose` que F0 debe aceptar: `fn_can_contact(p_customer_id, p_channel, p_purpose text default 'utility')`).

#### `202609_crm_v4_f16_campaigns_v2`

```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'segment',
  ADD COLUMN IF NOT EXISTS source_config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {segment_id} | {pipeline_id, stage_ids[], filters} | {opportunity_ids[]} | {customer_ids[]}
  ADD COLUMN IF NOT EXISTS default_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS throttle_mps integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota',
  ADD COLUMN IF NOT EXISTS respect_allowed_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS total_contacts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(12,4),
  ADD COLUMN IF NOT EXISTS actual_cost numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS started_at timestamptz, ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz, ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"131049": 12, "131026": 3}
  ADD COLUMN IF NOT EXISTS next_batch_no integer NOT NULL DEFAULT 1;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft','materializing','scheduled','sending','paused','sent','canceled','failed'));
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_source_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_source_type_check
  CHECK (source_type IN ('segment','pipeline_stage','opportunity_list','customer_list'));
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_throttle_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_throttle_check CHECK (throttle_mps BETWEEN 1 AND 80);
CREATE INDEX IF NOT EXISTS campaigns_org_status_idx ON campaigns (organization_id, status, scheduled_at);

```

`campaign_contacts` (misma migración):

```sql
ALTER TABLE campaign_contacts
  ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient text,                  -- wa_id E.164 sin + | email
  ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skipped_reason text,
  ADD COLUMN IF NOT EXISTS error_code text, ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS batch_no integer,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz, ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz, ADD COLUMN IF NOT EXISTS cost_amount numeric(10,5);
UPDATE campaign_contacts cc SET organization_id = c.organization_id FROM campaigns c WHERE c.id = cc.campaign_id AND cc.organization_id IS NULL;
ALTER TABLE campaign_contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE campaign_contacts ALTER COLUMN state SET DEFAULT 'pending';
ALTER TABLE campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_state_check;
ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_state_check
  CHECK (state IN ('pending','queued','sent','delivered','read','opened','clicked','replied','bounced','failed','skipped'));
CREATE INDEX IF NOT EXISTS campaign_contacts_claim_idx ON campaign_contacts (campaign_id, state, id) WHERE state IN ('pending','queued');
CREATE INDEX IF NOT EXISTS campaign_contacts_message_idx ON campaign_contacts (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_contacts_org_customer_idx ON campaign_contacts (organization_id, customer_id, created_at DESC);

-- RLS: reemplazar las políticas actuales (sin is_active) por el patrón org_member
DROP POLICY IF EXISTS campaign_contacts_select_policy ON campaign_contacts;  -- y insert/update/delete
CREATE POLICY cc_select ON campaign_contacts FOR SELECT USING (organization_id IN
  (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
CREATE POLICY cc_write ON campaign_contacts FOR ALL USING (organization_id IN
  (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
```

(Las 4 políticas de `campaigns` se recrean igual con `is_active = true`.)

#### `202609_crm_v4_f16_campaign_functions`

```sql
CREATE OR REPLACE FUNCTION fn_campaign_materialize(p_campaign_id uuid)
RETURNS TABLE (total integer, pending integer, skipped integer, estimated_cost numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c campaigns; v_unit numeric; v_category text; v_channel_type text;
BEGIN
  SELECT * INTO c FROM campaigns WHERE id = p_campaign_id AND organization_id = current_org_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found'; END IF;
  IF c.status NOT IN ('draft','scheduled') THEN RAISE EXCEPTION 'campaign not editable'; END IF;
  UPDATE campaigns SET status = 'materializing' WHERE id = c.id;
  DELETE FROM campaign_contacts WHERE campaign_id = c.id AND state IN ('pending','skipped');
  SELECT lower(metadata->>'category') INTO v_category FROM templates WHERE id = c.template_id;
  SELECT type INTO v_channel_type FROM channels WHERE id = c.channel_id;

  -- 1) candidatos según origen (customer_id, opportunity_id)
  CREATE TEMP TABLE tmp_cand ON COMMIT DROP AS
  SELECT DISTINCT ON (x.customer_id) x.customer_id, x.opportunity_id FROM (
    SELECT s.customer_id, NULL::uuid AS opportunity_id
      FROM fn_segment_customers((c.source_config->>'segment_id')::uuid) s WHERE c.source_type = 'segment'
    UNION ALL
    SELECT o.customer_id, o.id FROM opportunities o
      WHERE c.source_type = 'pipeline_stage' AND o.organization_id = c.organization_id AND o.status = 'open'
        AND o.stage_id::text IN (SELECT jsonb_array_elements_text(c.source_config->'stage_ids'))
    UNION ALL
    SELECT o.customer_id, o.id FROM opportunities o
      WHERE c.source_type = 'opportunity_list' AND o.organization_id = c.organization_id
        AND o.id::text IN (SELECT jsonb_array_elements_text(c.source_config->'opportunity_ids'))
    UNION ALL
    SELECT cu.id, NULL::uuid FROM customers cu
      WHERE c.source_type = 'customer_list' AND cu.organization_id = c.organization_id
        AND cu.id::text IN (SELECT jsonb_array_elements_text(c.source_config->'customer_ids'))
  ) x ORDER BY x.customer_id, x.opportunity_id NULLS LAST;

```

Continuación de `fn_campaign_materialize` (mismo cuerpo):

```sql
  -- 2) insertar con razones de exclusión
  INSERT INTO campaign_contacts (campaign_id, organization_id, customer_id, opportunity_id, recipient, state, skipped_reason)
  SELECT c.id, c.organization_id, t.customer_id, t.opportunity_id,
         CASE WHEN c.channel = 'whatsapp' THEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ELSE cu.email END,
         CASE WHEN r.reason IS NULL THEN 'pending' ELSE 'skipped' END, r.reason
  FROM tmp_cand t JOIN customers cu ON cu.id = t.customer_id
  LEFT JOIN LATERAL (SELECT CASE
      WHEN c.channel = 'whatsapp' AND coalesce(cu.phone,'') !~ '^\+?[0-9]{8,15}$' THEN 'no_phone'
      WHEN c.channel = 'email' AND coalesce(cu.email,'') !~ '^[^@]+@[^@]+$' THEN 'no_email'
      WHEN NOT fn_can_contact(cu.id, c.channel, coalesce(v_category,'utility')) THEN 'opted_out'
      WHEN c.channel = 'whatsapp' AND v_category = 'marketing' AND cu.phone ~ '^\+?1' THEN 'us_marketing'
      WHEN c.channel = 'whatsapp' AND v_channel_type = 'whatsapp' AND c.template_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.customer_id = cu.id AND cv.channel_id = c.channel_id
                           AND cv.last_inbound_at > now() - interval '24 hours') THEN 'window_required'
      WHEN EXISTS (SELECT 1 FROM campaign_contacts p JOIN campaigns pc ON pc.id = p.campaign_id
                   WHERE p.customer_id = cu.id AND pc.template_id = c.template_id AND pc.id <> c.id
                     AND p.sent_at > now() - interval '7 days') THEN 'duplicate_recent'
      ELSE NULL END AS reason) r ON true
  ON CONFLICT (campaign_id, customer_id) DO NOTHING;

  SELECT unit_cost INTO v_unit FROM provider_pricing
   WHERE provider = CASE WHEN v_channel_type = 'whatsapp' THEN 'meta' ELSE 'resend' END
     AND channel = c.channel AND coalesce(category,'') = coalesce(v_category,'') AND country = 'CO' LIMIT 1;
  UPDATE campaigns SET status = 'draft', total_contacts = (SELECT count(*) FROM campaign_contacts WHERE campaign_id = c.id),
         estimated_cost = v_unit * (SELECT count(*) FROM campaign_contacts WHERE campaign_id = c.id AND state = 'pending'),
         updated_at = now() WHERE id = c.id;
  RETURN QUERY SELECT total_contacts, (SELECT count(*)::int FROM campaign_contacts WHERE campaign_id = c.id AND state='pending'),
         (SELECT count(*)::int FROM campaign_contacts WHERE campaign_id = c.id AND state='skipped'), estimated_cost FROM campaigns WHERE id = c.id;
END $$;
```

`fn_segment_customers(p_segment_id)` es NUEVA: porta `SegmentosService.applyFilter` (`SegmentosService.ts:171-201`, reglas `FilterRule {field, operator, value}` sobre `customers`) a SQL dinámico con allow-list de columnas (`lifecycle_stage, tags, city, customer_type, created_at, health_score, vertical_id, company_size`) y operadores (`eq, neq, in, contains, gt, lt, between, is_null`). Se mantiene la implementación TS para la vista previa en UI, pero la materialización usa la SQL (misma semántica, probada con los mismos casos).

```sql
-- reclamo de lote (SKIP LOCKED) y marcas de estado
CREATE OR REPLACE FUNCTION fn_campaign_claim_contacts(p_campaign_id uuid, p_limit integer DEFAULT 50, p_batch_no integer DEFAULT 1)
RETURNS SETOF campaign_contacts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM campaign_contacts WHERE campaign_id = p_campaign_id AND state = 'pending'
    ORDER BY id LIMIT p_limit FOR UPDATE SKIP LOCKED)
  UPDATE campaign_contacts cc SET state = 'queued', batch_no = p_batch_no, attempts = attempts + 1, updated_at = now()
  FROM picked WHERE cc.id = picked.id RETURNING cc.*;
END $$;

CREATE OR REPLACE FUNCTION fn_campaign_mark_sent(p_campaign_id uuid, p_customer_id uuid) RETURNS uuid  -- misma firma, cuerpo nuevo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE campaign_contacts SET state = 'sent', sent_at = now(), updated_at = now()
   WHERE campaign_id = p_campaign_id AND customer_id = p_customer_id AND state IN ('pending','queued') RETURNING id INTO v_id;
  UPDATE campaigns SET statistics = fn_campaign_stats(p_campaign_id), updated_at = now() WHERE id = p_campaign_id;
  RETURN v_id;
END $$;
-- fn_campaign_mark_delivered / _read / _failed(p_campaign_id, p_customer_id, p_error_code, p_error_message) / _skipped(…, p_reason): mismo patrón, monótono
-- fn_campaign_mark_replied existente: se reescribe para aceptar cualquier estado >= sent y fijar replied_at una sola vez
CREATE OR REPLACE FUNCTION fn_campaign_stats(p_campaign_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('total', count(*), 'pending', count(*) FILTER (WHERE state IN ('pending','queued')),
    'sent', count(*) FILTER (WHERE state IN ('sent','delivered','read','replied')),
    'delivered', count(*) FILTER (WHERE state IN ('delivered','read','replied')), 'read', count(*) FILTER (WHERE state IN ('read','replied')),
    'replied', count(*) FILTER (WHERE replied_at IS NOT NULL), 'failed', count(*) FILTER (WHERE state = 'failed'),
    'skipped', count(*) FILTER (WHERE state = 'skipped'), 'cost', coalesce(sum(cost_amount),0))
  FROM campaign_contacts WHERE campaign_id = p_campaign_id $$;

```

Sincronización desde `message_events` y enlace de respuestas (misma migración):

```sql
-- Sincroniza estados desde message_events (webhook) a campaign_contacts
CREATE OR REPLACE FUNCTION fn_campaign_sync_from_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign uuid; v_customer uuid; v_cost numeric;
BEGIN
  SELECT m.campaign_id, cv.customer_id INTO v_campaign, v_customer FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE m.id = NEW.message_id;
  IF v_campaign IS NULL THEN RETURN NEW; END IF;
  v_cost := CASE WHEN (NEW.provider_payload->'pricing'->>'billable')::boolean THEN
    (SELECT unit_cost FROM provider_pricing WHERE provider='meta' AND channel='whatsapp' AND category = lower(NEW.provider_payload->'pricing'->>'category') AND country='CO' LIMIT 1) END;
  IF NEW.event_type = 'delivered' THEN PERFORM fn_campaign_mark_delivered(v_campaign, v_customer, v_cost);
  ELSIF NEW.event_type = 'read' THEN PERFORM fn_campaign_mark_read(v_campaign, v_customer);
  ELSIF NEW.event_type = 'failed' THEN PERFORM fn_campaign_mark_failed(v_campaign, v_customer, NEW.error_code, NEW.error_message);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campaign_sync_from_event ON message_events;
CREATE TRIGGER trg_campaign_sync_from_event AFTER INSERT ON message_events FOR EACH ROW EXECUTE FUNCTION fn_campaign_sync_from_event();

```

```sql
-- Respuesta inbound enlaza a la campaña (72 h) y a la oportunidad
CREATE OR REPLACE FUNCTION fn_campaign_link_reply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cc campaign_contacts;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  SELECT cc.* INTO v_cc FROM campaign_contacts cc JOIN conversations cv ON cv.customer_id = cc.customer_id AND cv.id = NEW.conversation_id
   WHERE cc.sent_at > now() - interval '72 hours' AND cc.replied_at IS NULL ORDER BY cc.sent_at DESC LIMIT 1;
  IF FOUND THEN
    PERFORM fn_campaign_mark_replied(v_cc.campaign_id, v_cc.customer_id);
    UPDATE messages SET campaign_id = v_cc.campaign_id, related_opportunity_id = coalesce(related_opportunity_id, v_cc.opportunity_id) WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campaign_link_reply ON messages;
CREATE TRIGGER trg_campaign_link_reply AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION fn_campaign_link_reply();
```

Orden de triggers en `messages` AFTER INSERT (alfabético en Postgres): `trg_ai_auto_response`, `trg_auto_tag_conversation`, `trg_campaign_link_reply`, `trg_channel_dispatch`, `trg_consume_ai_credits_on_message`, `trg_messages_crm_activity`, `trg_update_customer_channel_identity`, `trg_update_customer_online`, `trg_whatsapp_detect_optout`, `trigger_calculate_first_response_time`, `trigger_update_conversation_last_message`. `trg_campaign_link_reply` corre antes que `trg_messages_crm_activity`, por lo que la actividad ya ve `related_opportunity_id`.

#### `202609_crm_v4_f16_whatsapp_templates`

Sin tabla nueva: `templates` con `channel='whatsapp'`, `kind='hsm'`, `engine='html'` (no aplica; `body_html` = cuerpo BODY con `{{contact.first_name}}`), `metadata`:

```json
{"provider":"meta","meta_template_id":"1234567890","waba_id":"1020304050","channel_id":"uuid",
 "status":"APPROVED","category":"utility","language":"es","parameter_format":"named","quality_score":"GREEN",
 "components":[{"type":"HEADER","format":"TEXT","text":"Confirmación de reunión"},
   {"type":"BODY","text":"Hola {{nombre}}, confirmamos tu reunión el {{fecha}} a las {{hora}}. ¿Nos vemos?","example":{"body_text_named_params":[{"param_name":"nombre","example":"Laura"},{"param_name":"fecha","example":"10 de septiembre"},{"param_name":"hora","example":"3:00 pm"}]}},
   {"type":"FOOTER","text":"Responde BAJA para no recibir más mensajes"},
   {"type":"BUTTONS","buttons":[{"type":"QUICK_REPLY","text":"Confirmar"},{"type":"QUICK_REPLY","text":"Reprogramar"}]}],
 "variable_map":{"nombre":"contact.first_name|cliente","fecha":"custom.meeting_date|date","hora":"custom.meeting_time"},
 "rejected_reason":null,"last_synced_at":"2026-09-08T12:00:00Z",
 "twilio":{"content_sid":null,"approval_status":null}}
```

```sql
CREATE UNIQUE INDEX IF NOT EXISTS templates_whatsapp_meta_id_key ON templates ((metadata->>'meta_template_id'))
  WHERE channel = 'whatsapp' AND metadata ? 'meta_template_id';
CREATE INDEX IF NOT EXISTS templates_whatsapp_status_idx ON templates (organization_id, (metadata->>'status')) WHERE channel = 'whatsapp';
```

### 3.2 Seeds

`fn_seed_whatsapp_templates(p_org_id)`: 4 filas `templates` en estado `metadata.status='DRAFT'` (no enviadas a Meta hasta que el admin pulse "Enviar a aprobación", porque el nombre debe ser único por WABA y la categoría la revisa Meta):

| name (Meta `name`) | category | BODY |
|---|---|---|
| `confirmacion_reunion` | utility | Hola {{nombre}}, confirmamos tu reunión el {{fecha}} a las {{hora}}. Responde "Confirmar" o "Reprogramar". |
| `seguimiento_propuesta` | utility | Hola {{nombre}}, te enviamos la propuesta "{{oportunidad}}" el {{fecha}}. ¿Tienes alguna duda que podamos resolver? |
| `recordatorio_pago` | utility | Hola {{nombre}}, tienes un pago pendiente de {{monto}} por "{{oportunidad}}". Puedes pagar aquí: {{enlace}} |
| `novedades_producto` | marketing | Hola {{nombre}}, en {{empresa}} tenemos novedades que pueden interesarte: {{resumen}}. Responde BAJA si no quieres recibir más mensajes. |

`variable_map` por defecto: `nombre→contact.first_name|cliente`, `oportunidad→opportunity.name`, `fecha→custom.date|date`, `hora→custom.time`, `monto→opportunity.amount|money`, `enlace→custom.payment_url`, `empresa→org.name`, `resumen→custom.summary`. Todas con FOOTER de baja (compliance D9).

### 3.3 Verificación post-migración

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='last_inbound_at';   -- 1
SELECT count(*) FROM information_schema.columns WHERE table_name='campaign_contacts' AND column_name IN ('organization_id','opportunity_id','message_id','skipped_reason','error_code','batch_no'); -- 6
SELECT conname FROM pg_constraint WHERE conname='campaigns_status_check' AND pg_get_constraintdef(oid) LIKE '%paused%';    -- 1
SELECT proname FROM pg_proc WHERE proname IN ('fn_campaign_materialize','fn_campaign_claim_contacts','fn_campaign_stats','fn_campaign_sync_from_event',
  'fn_campaign_link_reply','fn_whatsapp_window','fn_whatsapp_detect_optout','fn_messages_crm_activity','fn_segment_customers','fn_seed_whatsapp_templates'); -- 10
SELECT tgname FROM pg_trigger WHERE tgrelid='messages'::regclass AND tgname IN ('trg_messages_crm_activity','trg_whatsapp_detect_optout','trg_campaign_link_reply'); -- 3
SELECT count(*) FROM templates WHERE organization_id=:org AND channel='whatsapp' AND kind='hsm';                          -- 4
-- Simulación: insertar inbound 'BAJA' en una conversación de prueba → contact_consents opted_out = 1
SELECT status FROM contact_consents WHERE customer_id=:cust AND channel='whatsapp';                                       -- opted_out
SELECT policyname FROM pg_policies WHERE tablename='campaign_contacts';                                                  -- cc_select, cc_write
```

### 3.4 Impacto en tablas existentes

- `messages`: shape única; los inserts de `whatsappCloudService.ts:413-423` y `whatsapp/send/route.ts:114-123` se reescriben; `external_message_id` pasa a ser la columna de correlación (el Edge Function la escribe).
- `campaigns.content` (text) se conserva solo para campañas de email con HTML crudo legado; las nuevas usan `template_id`.
- `campaign_contacts.state` amplía valores; `fn_campaign_mark_opened/clicked/bounced` (email) quedan como están para F7/F8.
- `comm_usage_logs`: cada envío WA inserta `{channel:'whatsapp', recipient, direction:'outbound', module:'crm'|'campaign', credits_used:1, metadata{message_id, campaign_id, category}}` (patrón de `twilioService.ts:172`).
- `notification_templates`, `whatsapp_qr_sessions`: sin cambios.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| POST | `/api/crm/whatsapp/send` | sesión | `SendWhatsAppRequest` (§4.2) | 201 `{message_id, conversation_id, activity_id, external_message_id?}` | 400, 402 NO_CREDITS, 404 (customer/opportunity/channel/template no de la org), 422 CONTACT_OPTED_OUT / WINDOW_CLOSED / TEMPLATE_NOT_APPROVED / CHANNEL_NO_TEMPLATES / US_MARKETING_BLOCKED / OUTSIDE_HOURS / MISSING_VARIABLES / DAILY_LIMIT | `client_request_id` único en `messages.metadata` por org (índice parcial) |
| GET | `/api/crm/whatsapp/window/[customerId]` | sesión | `?channelId=` | `{is_open, last_inbound_at, expires_at, conversation_id, channel:{id,type,provider,capabilities:{templates,media,free_text}}}` | 404 | – |
| GET | `/api/crm/whatsapp/channels` | sesión | – | `{data: ChannelSummary[], default_channel_id}` | – | – |
| GET | `/api/crm/whatsapp/templates` | sesión | `?status=APPROVED&category=&q=&channelId=` | `{data: WhatsAppTemplate[]}` | – | – |
| POST | `/api/crm/whatsapp/templates` | sesión admin | `CreateHsmInput` | 201 `{data}` (status DRAFT) | 409 NAME_EXISTS, 422 INVALID_COMPONENTS | – |
| PATCH/DELETE | `/api/crm/whatsapp/templates/[id]` | sesión admin | `UpdateHsmInput` | `{data}` | 409 si APPROVED y se cambia BODY (crea nueva versión con sufijo `_v2`) | – |
| POST | `/api/crm/whatsapp/templates/[id]/submit` | sesión admin | `{channelId}` | `{data}` (status PENDING, `meta_template_id`) | 502 PROVIDER (`error.error_user_msg` de Graph) | Si ya tiene `meta_template_id` → no reenvía |
| POST | `/api/crm/whatsapp/templates/sync` | sesión admin | `{channelId}` | `{created, updated}` | 502 | – |
| POST | `/api/crm/whatsapp/templates/[id]/preview` | sesión | `{context: RenderContextRef, variables?}` | `{body, header?, buttons[], missing[], category, estimated_cost}` | 404 | – |
| GET/POST | `/api/crm/campaigns` | sesión | `CreateCampaignInput` | 201 `{data: Campaign}` | 400, 404 template/channel/segment | – |
| GET/PATCH/DELETE | `/api/crm/campaigns/[id]` | sesión | `UpdateCampaignInput` (solo draft/scheduled) | `{data}` | 409 NOT_EDITABLE | – |
| POST | `/api/crm/campaigns/[id]/materialize` | sesión | – | `{total, pending, skipped, skipped_by_reason, estimated_cost}` | 409 | Re-ejecutable (borra pending/skipped) |
| POST | `/api/crm/campaigns/[id]/launch` | sesión admin | `{scheduled_at?}` | `{data: Campaign}` (`scheduled`\|`sending`) | 402 NO_CREDITS, 409 NOT_MATERIALIZED / TIER_EXCEEDED (`messaging_limit` < pending) / TEMPLATE_NOT_APPROVED | `dedupe_key = campaign_batch/{id}/1` |
| POST | `/api/crm/campaigns/[id]/pause` · `/resume` · `/cancel` | sesión admin | – | `{data}` | 409 estado inválido | – |
| GET | `/api/crm/campaigns/[id]/stats` | sesión | – | `{statistics, by_error_code, timeline[{minute, sent, delivered, read, failed}]}` | 404 | – |
| GET | `/api/crm/campaigns/[id]/contacts` | sesión | `?state=&q=&page=&export=csv` | `{data, total}` o CSV | – | – |
| POST | `/api/integrations/whatsapp/webhook` (existente) | firma `X-Hub-Signature-256` (F0) | payload Meta | 200 | 401 firma | `external_message_id` + `statuses[].id` |
| POST | `/api/integrations/twilio/incoming-message` (existente) | firma Twilio (F0) | form | TwiML vacío | 401 | `MessageSid` |
| POST | `/api/integrations/twilio/status-callback` (existente) | firma | form | 200 | 401 | `MessageSid`+`MessageStatus` |
| POST | `/api/crm/jobs/run` (F0) handlers `whatsapp`, `campaign_batch` | cron | – | – | – | ver §4.4 |

Se eliminan/redirigen: `/api/integrations/whatsapp/send` (301 lógico: devuelve 410 `USE_/api/crm/whatsapp/send`), `qr/send`, `mark-read`, `qr/mark-read` (B9) tras cerrar F0; `twilio/send-whatsapp` se mantiene solo para el módulo de notificaciones (F0 le pone sesión + ownership).

### 4.2 Servicios (`src/lib/services/crm/whatsapp/`)

#### `whatsappOutboundService.ts`

```ts
export interface SendWhatsAppRequest {
  customerId: string; opportunityId?: string; channelId?: string;   // channelId default: comm_settings.whatsapp_default_channel_id
  content: { text: string } | { templateId: string; variables?: Record<string, unknown> }
         | { media: { document_id: string } | { url: string; mime: string; filename?: string }; caption?: string };
  scheduledAt?: string; force?: boolean;                             // force: saltar horario permitido (solo utility)
  source: 'crm' | 'campaign' | 'sequence' | 'agent' | 'bulk';
  campaignId?: string; sequenceStepRunId?: string; clientRequestId?: string;
  role?: 'agent' | 'ai';
}
export interface SendWhatsAppResult { messageId: string; conversationId: string; activityId: string | null; scheduled: boolean }
export async function sendWhatsApp(orgId: number, userId: string | null, req: SendWhatsAppRequest, supabase: SupabaseClient): Promise<SendWhatsAppResult>;
export async function getWindow(orgId: number, customerId: string, channelId: string, supabase): Promise<WindowState>;
export async function resolveChannel(orgId: number, channelId: string | undefined, supabase): Promise<ChannelInfo>;   // {id,type,provider:'cloud'|'twilio'|'baileys',capabilities}
export async function findOrCreateConversation(orgId: number, customerId: string, channelId: string, supabase): Promise<string>; // porta whatsappCloudService.ts:543-577
export async function checkAllowedHours(orgId: number, at: Date, supabase): Promise<{ allowed: boolean; next_slot: Date }>;
export function buildTemplatePayload(tpl: WhatsAppTemplate, resolved: Record<string, string>): { name: string; language: { code: string }; components: TemplateComponent[] };
export function buildTemplateBody(tpl: WhatsAppTemplate, resolved: Record<string, string>): string;   // texto plano para messages.content
```

Orden de `sendWhatsApp`: validar/ownership → `resolveChannel` → `fn_can_contact(customer,'whatsapp', category)` → ventana/plantilla/capacidades → horario → `daily_limit` (`comm_settings.whatsapp_sent_today`) → `deduct_comm_credits(org,'whatsapp',1)` → resolver variables con `interpolate` de F7 (`escapeHtml:false`, texto plano) → `MISSING_VARIABLES` si faltan → `findOrCreateConversation` → si `scheduledAt` → `outbound_jobs` kind `whatsapp` → INSERT `messages` → leer `activities` creada por trigger → `comm_usage_logs` → resultado.

#### `whatsappTemplateService.ts`

```ts
export interface WhatsAppTemplate { id: string; name: string; language: string; category: 'utility'|'marketing'|'authentication'; status: 'DRAFT'|'PENDING'|'APPROVED'|'REJECTED'|'PAUSED'|'DISABLED'; components: MetaComponent[]; variable_map: Record<string,string>; meta_template_id?: string; channel_id: string; quality_score?: string; rejected_reason?: string }
export async function listHsm(orgId, filters, supabase): Promise<WhatsAppTemplate[]>;
export async function createHsm(orgId, userId, input: CreateHsmInput, supabase): Promise<WhatsAppTemplate>;        // valida nombre ^[a-z0-9_]{1,512}$, ≤1024 chars BODY, variables no adyacentes ni al inicio/fin
export async function submitHsm(orgId, id, channelId, supabase): Promise<WhatsAppTemplate>;                         // Graph o Twilio según canal
export async function syncHsm(orgId, channelId, supabase): Promise<{ created: number; updated: number }>;           // GET /{WABA_ID}/message_templates
export async function applyTemplateStatusUpdate(value: TemplateStatusUpdateValue, service: SupabaseClient): Promise<void>; // webhook
export async function previewHsm(orgId, id, ctx: RenderContext, extra: Record<string, unknown>, supabase): Promise<HsmPreview>;
export function estimateCost(category: string, country: string, provider: 'meta'|'twilio', pricing: ProviderPricing[]): number;
```

#### `campaignService.ts`

```ts
export async function createCampaign(orgId, userId, input: CreateCampaignInput, supabase): Promise<Campaign>;
export async function materialize(orgId, id, supabase): Promise<MaterializeResult>;                   // RPC fn_campaign_materialize + conteo por skipped_reason
export async function launch(orgId, userId, id, opts: { scheduledAt?: string }, supabase, service): Promise<Campaign>; // messaging_limit, créditos, job
export async function pause(orgId, id, supabase): Promise<Campaign>; export async function resume(...): Promise<Campaign>; export async function cancel(...): Promise<Campaign>;
export async function runBatch(job: OutboundJob, service: SupabaseClient): Promise<BatchResult>;      // handler campaign_batch
export async function getStats(orgId, id, supabase): Promise<CampaignStats>;
export async function checkMessagingLimit(channel: ChannelInfo, creds: CloudCredentials): Promise<{ tier: string; limit: number; used_24h: number }>;
```

#### `consentService.ts` (ampliado; el archivo existente `src/lib/services/crm/consentService.ts` solo cubre `call_consents`)

```ts
export type ContactChannel = 'email' | 'whatsapp' | 'sms' | 'voice';
export async function setConsent(orgId, customerId, channel: ContactChannel, status: 'opted_in'|'opted_out'|'unknown', source: string, evidence: Record<string, unknown>, supabase): Promise<void>;
export async function canContact(customerId, channel: ContactChannel, purpose: 'utility'|'marketing', supabase): Promise<boolean>;  // RPC fn_can_contact
export async function listConsents(orgId, customerId, supabase): Promise<ContactConsent[]>;
export function isOptOutKeyword(text: string, keywords: string[]): boolean;   // misma normalización que el trigger (unaccent + upper)
```

### 4.3 Webhooks / proveedor

**Meta Cloud (`whatsappCloudService.processWebhookPayload`, reescrito):**

- `change.field === 'messages'` → `value.messages[]`: find-or-create customer (`:479-540`, se mantiene) → `findOrCreateConversation` → INSERT `messages {organization_id, conversation_id, channel_id, direction:'inbound', role:'customer', sender_customer_id, content_type, content: extractText(msg) (text.body | caption | '[imagen]' | '[audio]' | button.text | interactive.*.title), payload: mensaje original, external_message_id: msg.id, metadata{wa_id, profile_name}}` con `ON CONFLICT (external_message_id) DO NOTHING` (índice único parcial NUEVO sobre `external_message_id` cuando no es null; hoy el índice es no único). Media: descargar con `getMediaUrl/downloadMedia` (`whatsappCloudService.ts`, hoy inalcanzables) a bucket `chat-images`/`attachments` y guardar `payload.media.url`.
- `value.statuses[]`: buscar `messages` por `external_message_id = status.id` → INSERT `message_events {event_type: status.status, provider_payload:{timestamp, recipient_id, conversation, pricing}, error_code: errors[0].code, error_message: errors[0].title, event_time: to_timestamp(timestamp)}`; `read` → `messages.read_at`. Mapeo de errores relevantes: `131049` (límite marketing por usuario) → `campaign_contacts.skipped_reason='rate_limited_24h'` y `contact_consents.evidence.meta_131049_until = now()+24h` (el job no reintenta); `131056` (pair rate) → reencolar +6 s; `131026`/`131047` (no en WhatsApp / re-engagement) → `failed` sin reintento; `130429` (throughput) → reencolar +30 s con `throttle_mps` reducido a la mitad.
- `change.field === 'message_template_status_update'` (fix `:345`): `value = {event:'APPROVED'|'REJECTED'|'PAUSED'|'DISABLED'|'PENDING'|'IN_APPEAL', message_template_id, message_template_name, message_template_language, reason}` → `applyTemplateStatusUpdate` → `templates.metadata.status/rejected_reason` por `meta_template_id`; `PAUSED`/`DISABLED` → pausar campañas `sending` que usen esa plantilla (`status='paused'`, `error_summary.template_paused=true`) + notificación admin.
- `change.field === 'message_template_quality_update'` → `metadata.quality_score`.

Payload real (status con pricing):

```json
{"object":"whatsapp_business_account","entry":[{"id":"1020304050","changes":[{"field":"messages","value":{
  "messaging_product":"whatsapp","metadata":{"display_phone_number":"573001234567","phone_number_id":"1098765"},
  "statuses":[{"id":"wamid.HBgLNTczMDA...","status":"delivered","timestamp":"1757340131","recipient_id":"573109876543",
    "conversation":{"id":"a1b2","origin":{"type":"utility"}},"pricing":{"billable":true,"pricing_model":"PMP","category":"utility"}}]}}]}]}
```

**Twilio (`twilio/incoming-message`, `twilio/status-callback`):** inbound `From: whatsapp:+57…`, `Body`, `WaId`, `ProfileName`, `OptOutType` (Advanced Opt-Out) → mismo insert inbound (canal `channels` con `channel_credentials.provider='twilio'`); `OptOutType='STOP'` → `setConsent(...,'opted_out','twilio_optout')`. Status callback `MessageStatus` `queued|sent|delivered|read|failed|undelivered` + `ErrorCode` (63016 fuera de ventana sin plantilla; 21610 opt-out) → `message_events` por `external_message_id = MessageSid`.

**Evolution/QR (`qr/inbound`):** sin cambios (ya inserta `content`); el trigger de opt-out cubre este path automáticamente.

### 4.4 Jobs / cola

| kind | payload | dedupe_key | reintentos | handler |
|---|---|---|---|---|
| `whatsapp` | `{message_request: SendWhatsAppRequest, org_id, user_id}` (envío programado) | `whatsapp/{client_request_id}` | 3; backoff 1m/5m/15m; `WINDOW_CLOSED`/`CONTACT_OPTED_OUT` → `dead` con `last_error` | `sendWhatsApp` |
| `campaign_batch` | `{campaign_id, batch_no}` | `campaign_batch/{campaign_id}/{batch_no}` | el lote no reintenta como unidad: cada contacto tiene `attempts` (máx 3); el job siguiente siempre se encola mientras haya `pending` | `campaignService.runBatch` |
| `whatsapp_template_sync` | `{channel_id}` | `hsm_sync/{channel_id}/{yyyymmddhh}` | 2 | `syncHsm` (pg_cron cada 6 h como respaldo del webhook) |

`runBatch` (≤55 s por invocación, `maxDuration=60`):

1. Cargar campaña; si `status <> 'sending'` → `done` sin acción. Comprobar `respect_allowed_hours` → si fuera de horario, reencolar en `next_slot`.
2. `fn_campaign_claim_contacts(campaign_id, 50, batch_no)`.
3. Por contacto: `fn_can_contact` (de nuevo) → `wa_id` último envío (`Map` en memoria + consulta `messages` por `conversation_id` últimos 6 s) → si < 6 s, `sleep` hasta cumplir (máx 45 en ráfaga) → token bucket global `throttle_mps` (≤80) → `sendWhatsApp({source:'campaign', campaignId, content:{templateId, variables: default_variables ⊕ contact.variables}})` → `fn_campaign_mark_sent` + `campaign_contacts.message_id`. Errores 422 → `fn_campaign_mark_skipped(reason)`; 402 → pausar campaña (`error_summary.no_credits=true`) y salir.
4. Al terminar el lote: si quedan `pending` → INSERT `outbound_jobs {kind:'campaign_batch', payload:{campaign_id, batch_no+1}, run_at: now() + max(1, ceil(50/throttle_mps)) s}`; si no → `status='sent'`, `finished_at`, `statistics = fn_campaign_stats`.
5. Cada 10 contactos: `UPDATE campaigns SET statistics = fn_campaign_stats(id)` (la UI lo lee por realtime).

Rate limit global efectivo: con `throttle_mps=10` → 600 contactos/min; 1.000 contactos ≈ 2 lotes de 1 min. El límite de 80 mps de Meta nunca se alcanza desde un solo runner; el límite real es `messaging_limit` del WABA (250/2k/10k/100k únicos por 24 h) que `launch` verifica.

### 4.5 Snippets

Graph API v26.0 plantilla con parámetros nombrados (docs-meta-whatsapp-calendar.md):

```ts
// buildTemplatePayload → payload.template ; el Edge Function lo envía tal cual
const body = {
  messaging_product: 'whatsapp', recipient_type: 'individual', to: '573109876543',
  type: 'template',
  template: {
    name: 'confirmacion_reunion', language: { code: 'es' },
    components: [
      { type: 'header', parameters: [{ type: 'text', parameter_name: 'empresa', text: 'ACME' }] },   // solo si HEADER con variable
      { type: 'body', parameters: [
        { type: 'text', parameter_name: 'nombre', text: 'Laura' },
        { type: 'text', parameter_name: 'fecha', text: '10 de septiembre' },
        { type: 'text', parameter_name: 'hora', text: '3:00 pm' } ] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'abc123' }] } ], // solo botones URL dinámicos
  },
};
// Respuesta: {contacts:[{input, wa_id}], messages:[{id:'wamid…', message_status:'accepted'|'held_for_quality_assessment'|'paused'}]}
```

Crear plantilla en Meta (`submitHsm`):

```ts
const res = await fetch(`https://graph.facebook.com/v26.0/${creds.business_account_id}/message_templates`, {
  method: 'POST', headers: { Authorization: `Bearer ${creds.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: tpl.name, category: tpl.category.toUpperCase(), language: tpl.language,
    parameter_format: 'named', components: tpl.components }),           // components con example.body_text_named_params
});
const data = await res.json();   // {id, status:'PENDING', category}  | {error:{message, error_user_msg, code}}
```

Twilio Content API + envío (docs-twilio-messaging.md):

```ts
const content = await client.content.v1.contents.create({
  friendlyName: tpl.name, language: tpl.language, variables: { '1': 'Laura', '2': '10 de septiembre' },
  types: { 'twilio/text': { body: 'Hola {{1}}, confirmamos tu reunión el {{2}}.' } },
});
await fetch(`https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`, {
  method: 'POST', headers: { Authorization: basic, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: tpl.name, category: tpl.category.toUpperCase() }) });
// envío (Edge Function, rama provider === 'twilio')
await client.messages.create({ from: `whatsapp:${creds.from}`, to: `whatsapp:+${recipient}`,
  contentSid: creds.content_sid, contentVariables: JSON.stringify(positional), statusCallback: `${BASE}/api/integrations/twilio/status-callback` });
```

Twilio usa variables posicionales `{{1}}`: `metadata.twilio.positional_map = ['nombre','fecha','hora']` traduce desde el `variable_map` nombrado.

**Edge Function `supabase/functions/channel-dispatch/index.ts` — cambios exactos:**

- `:21` `const GRAPH = "https://graph.facebook.com/v26.0";`
- `:165` select añade `payload, related_opportunity_id, campaign_id, template_id`.
- Nueva función tras `:78`:

```ts
async function sendWhatsAppTemplate(creds: Record<string,string>, to: string, template: unknown): Promise<SendResult> {
  const res = await fetch(`${GRAPH}/${creds.phone_number_id}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${creds.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, externalId: data?.messages?.[0]?.id, error: data?.error?.message, errorCode: data?.error?.code, raw: data };
}
async function sendWhatsAppMedia(creds, to, media: {url:string; mime:string; filename?:string; caption?:string}): Promise<SendResult> { /* type image|document con link */ }
async function sendTwilioWhatsApp(creds, to, msg): Promise<SendResult> {
  const auth = btoa(`${creds.account_sid}:${creds.auth_token}`);
  const form = new URLSearchParams({ From: `whatsapp:${creds.from}`, To: `whatsapp:+${to}`, StatusCallback: creds.status_callback_url });
  if (msg.content_type === "template") { form.set("ContentSid", msg.payload.twilio.content_sid); form.set("ContentVariables", JSON.stringify(msg.payload.twilio.variables)); }
  else form.set("Body", cleanText(msg.content));
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}` }, body: form });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, externalId: data?.sid, error: data?.message, errorCode: data?.code ? String(data.code) : undefined, raw: data };
}
```

- `:198` rama `baileys`: si `msg.content_type === 'template'` → `message_events failed` con `error_code='CHANNEL_NO_TEMPLATES'` (defensa; el servicio ya lo impide). Añadir rama `credRow?.provider === 'twilio'` → `sendTwilioWhatsApp`.
- `:275-278` sustituir por:

```ts
const result = channel.type !== "whatsapp" ? await sendMeta(channel.type, creds, recipient, cleanText(msg.content || ""))
  : msg.content_type === "template" ? await sendWhatsAppTemplate(creds, recipient, msg.payload?.template)
  : ["image","file"].includes(msg.content_type) ? await sendWhatsAppMedia(creds, recipient, msg.payload?.media)
  : await sendWhatsApp(creds, recipient, cleanText(msg.content || ""));
```

- `:281-287` `message_events` añade `error_code: result.errorCode ?? null` y `event_time: new Date().toISOString()`.
- `:289-300` `messages.update` añade columna real `external_message_id: result.externalId || null` (además de `metadata.external_message_id`) para que `processStatusUpdate` correlacione.
- `SendResult` (`:42-47`) gana `errorCode?: string`.
- Redeploy con `deploy_edge_function` (MCP), no con archivos .sql.

### 4.6 Variables de entorno

| Variable | Nuevo | Uso |
|---|---|---|
| `META_APP_SECRET` | existe | firma del webhook (F0) |
| `WHATSAPP_VERIFY_TOKEN` | existe | GET verify |
| `WHATSAPP_GRAPH_VERSION` | NUEVO (`v26.0`) | `whatsappCloudConfig` + Edge (`Deno.env`) |
| `TWILIO_MASTER_*`, `TWILIO_WEBHOOK_BASE_URL` | existen (F0 los reconcilia) | rama Twilio |
| `CRON_SECRET` | existe | job runner |
| `EVOLUTION_API_URL/KEY` | existen | QR |

Sin claves en env por org: las credenciales del canal siguen en `channel_credentials.credentials` (F0 las cifra y solo el servidor/Edge las leen).

### 4.7 Dependencias npm

Ninguna nueva. Reutiliza `twilio ^6.1` (F0 lo sube), `zod`, `@dnd-kit` (no aplica aquí), `motion`. Edge Function: `@supabase/supabase-js@2` vía esm.sh (ya).

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| (diálogo) | `src/components/crm/whatsapp/ComposeWhatsAppDialog.tsx` | Individual y masivo desde Kanban/drawer/detalle/cliente/`BulkActionsDialog` |
| `/app/crm/campanas` | `src/components/crm/campanas/CampanasPage.tsx` (reescrita) | Lista con estado, progreso y métricas en vivo |
| `/app/crm/campanas/nueva` | `campanas/nuevo/CampanaNuevaPage.tsx` (reescrita) → `CampaignWizard.tsx` | Wizard 4 pasos: canal+plantilla → audiencia → programación/throttle → revisión |
| `/app/crm/campanas/[id]` | `campanas/id/CampanaDetallePage.tsx` (reescrita) | Progreso, pausa/reanuda/cancela, errores por código, contactos, exportar CSV |
| `/app/crm/plantillas` tab WhatsApp | `src/components/crm/plantillas/whatsapp/WhatsAppTemplatesTab.tsx` | Estados de aprobación, crear, sincronizar |
| `/app/crm/plantillas/whatsapp/nueva` y `/[id]` | `.../whatsapp/HsmEditorPage.tsx` | Editor de componentes con vista previa tipo burbuja |
| `/app/configuracion?modulo=crm` tab WhatsApp | `src/components/configuracion/crm/whatsapp/WhatsAppSettingsTab.tsx` | Canal por defecto, palabras de baja/alta, horario, límite diario, capacidades |
| Kanban | `src/components/crm/pipeline/modals/BulkActionsDialog.tsx` | Nueva pestaña "Mensaje" |

### 5.2 Componentes

| Archivo | Props | Estado / hooks | Servicios | ≤L |
|---|---|---|---|---|
| `whatsapp/ComposeWhatsAppDialog.tsx` | `{open, onOpenChange, mode: 'single'\|'bulk', opportunityId?, customerId?, customer?, recipients?: BulkRecipient[] (bulk), defaultChannelId?, onSent?}` | `useWhatsAppCompose()`; tab `text`\|`template`; `sending` | window, templates, send, campaigns (bulk) | 280 |
| `whatsapp/compose/useWhatsAppCompose.ts` | `(init) => state & actions` | canal, ventana (poll 60 s + realtime `conversations`), plantilla, variables, media, schedule, estimado | `GET /window`, `/templates`, `/templates/{id}/preview` | 200 |
| `whatsapp/compose/ChannelSelector.tsx` | `{channels, value, onChange}` | muestra tipo (Cloud / Twilio / QR) y capacidades con iconos; aviso "QR: solo texto, riesgo de bloqueo" | – | 110 |
| `whatsapp/compose/WindowIndicator.tsx` | `{window: WindowState}` | `Badge` verde "Ventana abierta · vence en 5 h 12 m" (countdown) / gris "Ventana cerrada · usa una plantilla" | – | 80 |
| `whatsapp/compose/TextComposer.tsx` | `{value, onChange, disabled, maxLen: 4096, onInsertVariable}` | textarea + `VariablePicker` (F7) + emoji nativo; contador | – | 120 |
| `whatsapp/compose/TemplateComposer.tsx` | `{templates, value: {templateId, variables}, onChange, ctx, preview}` | buscador por nombre/categoría, `Badge` categoría, campos por variable (`variable_map` prellenado, editable), costo estimado | preview | 220 |
| `whatsapp/compose/WhatsAppBubblePreview.tsx` | `{header?, body, footer?, buttons[], media?}` | render tipo burbuja WhatsApp (fondo `#e7ffdb` dark `#005c4b`) | – | 120 |
| `whatsapp/compose/MediaAttachment.tsx` | `{opportunityId?, value, onChange}` | documentos de la oportunidad (PDF ≤ 20 MB) o subir imagen (≤ 5 MB) | `GET /api/crm/documents` | 140 |
| `whatsapp/compose/BulkAudiencePanel.tsx` | `{source: AudienceSource, onChange, counts}` | origen: segmento \| etapa \| selección; conteo total, exclusiones por razón (chips), throttle slider (1–80), horario, costo estimado, confirmación con checkbox "He verificado el opt-in" | `materialize` | 260 |
| `whatsapp/WhatsAppThreadPreview.tsx` (usa `WhatsAppEntry` de F9) | `{conversationId, opportunityId, limit?: 5, onReplyInline}` | últimos N mensajes con estado (`v_message_last_event`), realtime `messages`/`message_events`; input inline que llama `send` | `GET /api/crm/timeline` + realtime | 220 |
| `campanas/CampanasPage.tsx` | – | tabla con `Badge` de estado, barra de progreso, sent/delivered/read/replied, costo; filtros; realtime `campaigns` | campaigns list | 220 |
| `campanas/CampaignWizard.tsx` + `steps/{ChannelTemplateStep, AudienceStep, ScheduleStep, ReviewStep}.tsx` | `{campaignId?}` | reducer por pasos; validación por paso | create/update/materialize/launch | 200 + 4×150 |
| `campanas/CampaignDetail.tsx` | `{id}` | header con acciones, `CampaignProgressCard` (realtime `statistics`), `CampaignErrorsCard` (por `error_code` con texto humano: 131049 "Límite de marketing por usuario, se omitió"), `CampaignContactsTable` (filtro por estado, exportar) | stats, contacts | 260 |
| `plantillas/whatsapp/WhatsAppTemplatesTab.tsx` | – | tabla: nombre, categoría, idioma, estado (`APPROVED` verde, `PENDING` ámbar, `REJECTED` rojo con motivo, `PAUSED`), calidad; botones Crear, Sincronizar | listHsm, sync | 200 |
| `plantillas/whatsapp/HsmEditorPage.tsx` | `{templateId?}` | formulario: nombre (slug), categoría, idioma, HEADER (texto/imagen), BODY con chips `{{nombre}}` y mapeo a variables del CRM, FOOTER, BUTTONS (quick reply/url/phone ≤3), ejemplos; preview burbuja; "Guardar borrador" / "Enviar a aprobación" | createHsm, submitHsm | 280 |
| `configuracion/crm/whatsapp/WhatsAppSettingsTab.tsx` | – | canal por defecto (Select), palabras de baja/alta (chips editables), horario (días + rango + tz), límite diario, tabla de capacidades por canal, estado del `messaging_limit` (GET al abrir) | `comm_settings`, channels | 240 |
| `pipeline/modals/BulkActionsDialog.tsx` | (existente) | nueva `TabsTrigger value="message"` → `<ComposeWhatsAppDialog mode='bulk' recipients={selected}/>` o email masivo (F7 `sendEmailBatch` vía campaña `source_type='opportunity_list'`) | – | +60 |

### 5.3 Flujos de usuario

**A. Individual con ventana abierta**: icono WhatsApp en la tarjeta → diálogo; `WindowIndicator` verde; pestaña Texto activa; escribe "Hola {{contact.first_name}}, ¿pudiste ver la propuesta?"; el chip muestra "Laura"; Enviar → toast → `WhatsAppThreadPreview` en el timeline muestra la burbuja con ✓, luego ✓✓ y azul al leer (realtime `message_events`).

**B. Individual con ventana cerrada**: `WindowIndicator` gris; pestaña Texto deshabilitada con tooltip "Han pasado más de 24 h desde su último mensaje"; pestaña Plantilla: buscar "seguimiento_propuesta" (`APPROVED`, utility, "≈ $0.0008"); variables prellenadas (`nombre`=Laura, `oportunidad`=Plan Pro, `fecha`=hoy); preview burbuja; Enviar.

**C. Responder inline desde el timeline**: el cliente respondió "¿Cuál es el precio?" → notificación → abrir oportunidad → `WhatsAppThreadPreview` → escribir en el input inline → Enviar (ventana abierta por el inbound).

**D. Crear plantilla HSM**: Plantillas → WhatsApp → Crear → nombre `recordatorio_demo`, categoría utility, BODY "Hola {{nombre}}, tu demo es el {{fecha}}…" → mapear `nombre → contact.first_name`, `fecha → custom.demo_date|date` → ejemplos → "Enviar a aprobación" → estado PENDING → webhook → APPROVED (badge se actualiza por realtime `templates`).

**E. Campaña a etapa del pipeline**: Campañas → Nueva → canal Cloud "Ventas CO", plantilla `novedades_producto` (marketing) → Audiencia: "Etapa del pipeline" → Ventas › "Propuesta enviada" + "Negociación" → "Calcular audiencia" → 1.240 candidatos: 1.102 pendientes, 138 excluidos (91 opt-out, 30 sin teléfono, 17 enviados hace < 7 días) → costo estimado $13.78 → Programación: lunes 9:00, throttle 10 mps, respetar horario → Revisión: `messaging_limit` 2.000/24 h OK, créditos WA 5.000 OK → checkbox opt-in → "Programar" → estado `scheduled` → lunes 9:00 empieza; detalle muestra barra 0→1.102 en ~2 min, entregados/leídos subiendo, 12 errores 131049 listados.

**F. Pausar y cancelar**: en detalle "Pausar" → `paused` en < 1 min (el lote en curso termina sus ≤50); "Reanudar" → `sending`; "Cancelar" → pending→skipped:canceled; los ya enviados conservan métricas.

**G. Masivo desde el Kanban**: seleccionar 8 tarjetas → "Acciones" → pestaña Mensaje → WhatsApp → plantilla utility → preview por contacto (flechas) → Enviar → se crea campaña `source_type='opportunity_list'` con `throttle 5` y se lanza al instante; toast con enlace al detalle.

### 5.4 Wireframes

```
┌ ComposeWhatsAppDialog · individual ─────────────────────────────────────────────┐
│ WhatsApp a Laura Gómez (+57 310 987 6543)                                   [x] │
│ Canal [Ventas CO · Cloud API ▾]        ● Ventana abierta · vence en 5 h 12 min   │
│ [ Texto ] [ Plantilla ]                                                          │
│ ┌──────────────────────────────────────────────┐ ┌ Vista previa ───────────────┐ │
│ │ Hola {{contact.first_name}}, ¿pudiste ver la  │ │        ┌──────────────────┐│ │
│ │ propuesta que te envié ayer?                  │ │        │Hola Laura, ¿pudis││ │
│ │                                               │ │        │te ver la propuest││ │
│ │                                  128 / 4096   │ │        │a…      10:42 ✓✓  ││ │
│ └──────────────────────────────────────────────┘ │        └──────────────────┘│ │
│ [{{ }} Variables] [📎 Adjuntar]                   └────────────────────────────┘ │
│ Costo: gratis (dentro de la ventana)                    [Programar ▾] [Enviar ▸] │
└──────────────────────────────────────────────────────────────────────────────────┘

┌ ComposeWhatsAppDialog · plantilla (ventana cerrada) ────────────────────────────┐
│ ○ Ventana cerrada · último mensaje del cliente hace 3 días → solo plantillas     │
│ [ Texto (deshabilitado) ] [ Plantilla ]                                          │
│ Buscar [seguimiento         ]  Categoría [Todas ▾]                               │
│ ▸ seguimiento_propuesta   utility   es   ● APPROVED   ≈ $0.0008                  │
│   nombre      [Laura                ]  ← contact.first_name                      │
│   oportunidad [Plan Pro Empresa     ]  ← opportunity.name                        │
│   fecha       [8 sep 2026           ]  ← custom.date|date   ⚠ verifica            │
│ ┌ Vista previa ────────────────────────────────────────────────────────────────┐ │
│ │ Hola Laura, te enviamos la propuesta "Plan Pro Empresa" el 8 sep 2026.        │ │
│ │ ¿Tienes alguna duda que podamos resolver?                                     │ │
│ │ Responde BAJA para no recibir más mensajes                        [Sí] [No]   │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                             [Programar ▾] [Enviar]│
└──────────────────────────────────────────────────────────────────────────────────┘

┌ Campaña · Novedades septiembre · ● Enviando ───────────────────────────────────┐
│ [Pausar] [Cancelar] [Exportar CSV]        Canal Ventas CO · Plantilla novedades │
│ ████████████████████░░░░░░░░  742 / 1.102 enviados · 9 mps · termina ≈ 0:40     │
│ Enviados 742 │ Entregados 701 │ Leídos 388 │ Respondieron 23 │ Fallidos 12 │ Omitidos 138 │
│ Costo estimado $13.78 · real $8.76                                               │
│ Errores: 131049 Límite de marketing por usuario (12) · 131026 No usa WhatsApp (0) │
│ Contactos [Todos ▾] [Buscar…]                                                    │
│ Laura Gómez   +57 310…  leído 09:03   respondió 09:10  → Oportunidad Plan Pro    │
│ Carlos Pérez  +57 300…  fallido 131049  omitido 24 h                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos, carga y error

- Sin canal WhatsApp: el diálogo muestra "Conecta un canal de WhatsApp" con enlace a `/app/chat/canales`; el botón de la tarjeta queda con tooltip.
- Cliente sin teléfono válido: botón deshabilitado "Sin número".
- Sin plantillas aprobadas y ventana cerrada: "No tienes plantillas aprobadas" + "Crear plantilla" + "Sincronizar desde Meta".
- Opt-out: banner rojo "Este contacto pidió no recibir WhatsApp (BAJA el 3 sep)"; Enviar deshabilitado; enlace "Registrar consentimiento manual" (solo admin, exige nota).
- Fuera de horario: aviso ámbar con botón "Programar para 08:00" (utility permite "Enviar ahora igualmente" con `force`; marketing no).
- Créditos insuficientes: 402 → "Sin créditos de WhatsApp" + enlace a Créditos.
- Campaña sin audiencia: paso 2 bloquea "Continuar" hasta calcular; 0 pendientes → "Nadie cumple los criterios".
- Cargas: skeleton en lista de plantillas y contactos; el conteo de audiencia muestra spinner y se cancela con `AbortController`.
- Error de despacho (`message_events.failed`): la burbuja muestra ⚠ con `error_message` y botón "Reintentar" (crea nuevo `messages`; nunca reutiliza el fallido).

### 5.6 Accesibilidad

- `WindowIndicator` con `role="status"` y texto (no solo color); countdown `aria-live="polite"` actualizado cada minuto (no cada segundo).
- Pestaña Texto deshabilitada con `aria-disabled` + descripción del motivo.
- Campos de variables con `label` visible del nombre en la plantilla y `aria-describedby` con el origen (`contact.first_name`).
- Vista previa burbuja con `aria-label="Vista previa del mensaje"`; los botones de la plantilla son `span` no interactivos.
- Tabla de contactos de campaña navegable con teclado; exportar como enlace con `download`.
- Contraste de badges de estado ≥ 4.5:1 en claro y oscuro.

### 5.7 Motion

Burbujas nuevas en `WhatsAppThreadPreview` entran con `opacity 0→1, y 6→0` 150 ms; ticks de estado ✓ → ✓✓ → azul con `scale 0.8→1` 120 ms; barra de progreso de campaña con `transition: width 600ms ease-out` (CSS, no JS); `prefers-reduced-motion` respetado por `MotionProvider`.

### 5.8 Responsive / cross-platform

- < 768 px: diálogo como `Sheet side="bottom"` 95 vh; preview bajo el editor; wizard de campaña en pasos de pantalla completa.
- Capacitor: adjuntar imagen usa `<input type=file accept="image/*" capture="environment">`; sin permisos nuevos (no se accede a contactos del teléfono).
- Electron: sin cambios; enlaces `wa.me` ya no se usan (B12).
- PWA offline: el compose se deshabilita sin red (`navigator.onLine`), sin cola local (el envío exige validación de ventana en servidor).

---

## 6. Integración con proveedores

| Proveedor | Llamada exacta | Límites / gotchas |
|---|---|---|
| Meta Cloud | `POST https://graph.facebook.com/v26.0/{PHONE_NUMBER_ID}/messages` `type:'text'` / `'template'` (`parameter_name`) / `'image'`/`'document'` (`link`) | Par negocio-usuario 1 msg/6 s, ráfaga ≤45 (131056); throughput 80 mps (`GET /{PHONE_NUMBER_ID}?fields=throughput`); 5.000 req/h/app/WABA; `message_status: held_for_quality_assessment` → tratar como `sent` pendiente |
| Meta plantillas | `POST /{WABA_ID}/message_templates {name, category, language, components, parameter_format:'named'}`; `GET /{WABA_ID}/message_templates?fields=name,language,status,category,components,quality_score`; webhooks `message_template_status_update`, `message_template_quality_update` | Solo APPROVED se envía; PAUSED 3 h → 6 h → DISABLED por calidad; `REJECTED` con `reason` (INVALID_FORMAT, TAG_CONTENT_MISMATCH…); nombres únicos por WABA; categoría puede ser recategorizada por Meta |
| Meta límites | `GET /{WABA_ID}?fields=whatsapp_business_manager_messaging_limit` | 250 → 2k → 10k → 100k → ilimitado usuarios únicos/24 h fuera de CSW; subir con Business Verification o 2.000 entregados en 30 días con calidad alta |
| Meta pricing | webhook `statuses[].pricing {billable, pricing_model:'PMP', category}` | Desde 1-jul-2025 por plantilla entregada; utility dentro de CSW gratis; marketing y auth siempre; marketing a EE.UU. bloqueado; 131049 límite por usuario (24 h); tarifas CO en `provider_pricing` (marketing ≈ 0.0125, utility ≈ 0.0008 USD, no verificado; ajustar trimestralmente) |
| Twilio | `client.messages.create({from:'whatsapp:+…', to:'whatsapp:+…', contentSid, contentVariables, statusCallback})`; `client.content.v1.contents.create`; `POST /v1/Content/{Sid}/ApprovalRequests/whatsapp`; Senders API v2 `client.messaging.v2.channelsSenders.create` | 1 WABA por (sub)cuenta → subcuenta por org; +$0.005/msg; `OptOutType` con Advanced Opt-Out (Messaging Service); error 63016 fuera de ventana; v1 Senders deprecada 1-sep-2026 |
| Evolution/QR | `POST {EVOLUTION_API_URL}/message/sendText/{instance}` | Sin plantillas ni ventana formal; riesgo de bloqueo por volumen → la UI limita a envíos individuales y campañas ≤ 50/día con aviso |

---

## 7. Multi-tenant y seguridad

- Todos los endpoints `/api/crm/whatsapp/*` y `/api/crm/campaigns/*` usan `getServerOrgContext()`; `customerId`, `opportunityId`, `channelId`, `templateId`, `segmentId`, `campaignId` se validan por `organization_id` de sesión (404 si no). Reemplaza el `whatsapp/send` con `channel_id`/`organization_id` del body (C2) y el `send-whatsapp` con `orgId` del body (C4).
- Nada del cliente lee `channel_credentials` (C8): el diálogo recibe `ChannelSummary {id, name, type, provider, capabilities}` sin credenciales; Edge Function y servidor usan service role.
- Webhook Meta: `X-Hub-Signature-256` con `timingSafeEqual` sobre raw body (F0, patrón `webhooks/facebook/[channelId]:43-53`); org resuelta por `phone_number_id` → `channel_credentials` → `channels.organization_id` (`findChannelByPhoneNumberId`, se mantiene), nunca del payload.
- Twilio: `validateRequest` con el auth token de la subcuenta resuelta por `AccountSid` (F0); `incoming-message` escapa TwiML (C7).
- Opt-out enforced en 4 puntos: `sendWhatsApp`, `fn_campaign_materialize`, `runBatch` (recheck) y `sequenceService`/agente (F8/F6 llaman al mismo servicio). Marketing exige `opted_in` explícito (Habeas Data D9, evidencia guardada).
- Inserts en `messages` desde el servidor usan el cliente RLS de sesión (política `Organization members can create messages`), no service role; el Edge Function usa service role solo para leer/actualizar el mensaje ya insertado.
- Rate limit de UI: `/api/crm/whatsapp/send` 30 req/min por usuario (middleware) para evitar "masivo manual" fuera de campañas.
- Logs sin tokens; `provider_payload` de `message_events` no incluye credenciales.
- Cierra: C2, C4 (reemplazo), C12, C18 (WhatsApp), C20, B9, B14, B15, B16.

---

## 8. Créditos, costos y límites

- Antes de cada envío: `deduct_comm_credits(org,'whatsapp',1)` (RPC existente; `NULL` = ilimitado). Campañas: `launch` reserva `pending` créditos de una vez (si `whatsapp_remaining < pending` → 402 con el faltante); los omitidos en `runBatch` se devuelven (`UPDATE comm_settings SET whatsapp_remaining = whatsapp_remaining + n`, dentro de `fn_campaign_mark_skipped`).
- Costo real: `campaign_contacts.cost_amount` y `messages.metadata.cost_amount` desde `pricing.category` × `provider_pricing` (`provider='meta'|'twilio'`, `channel='whatsapp'`, `category`, `country`), sumado en `campaigns.actual_cost`; Twilio suma el fee fijo 0.005.
- Estimado en UI: `pending × unit_cost(category, país del número)`; para ventana abierta y utility se muestra "gratis".
- Presupuesto mensual por org (D6): `comm_settings` + panel Créditos; alerta al 80 % con `fn_create_org_notification`.
- Límites: `messaging_limit` del WABA verificado en `launch` (`TIER_EXCEEDED` si `pending > limit - used_24h`, con opción de dividir en días); `whatsapp_daily_limit` propio por org; `throttle_mps` 1–80.
- `comm_usage_logs` por mensaje para reporting (`module:'crm'|'campaign'`).

---

## 9. Pruebas

### 9.1 Unitarias (`src/lib/services/crm/whatsapp/__tests__/`)

- `buildTemplatePayload.test.ts`: named params en header/body/button url; variables faltantes → `MISSING_VARIABLES`; Twilio positional map.
- `window.test.ts`: `last_inbound_at` 23 h 59 m → abierta; 24 h 1 m → cerrada; sin conversación → cerrada.
- `optout.test.ts`: `isOptOutKeyword('  baja ')`, `'Cancelar.'`, `'NO MÁS'`, `'no mas'` → true; `'no quiero bajar'` → false.
- `allowedHours.test.ts`: tz America/Bogota, domingo → `next_slot` lunes 08:00.
- `estimateCost.test.ts`: utility en ventana = 0; marketing CO = 0.0125; Twilio +0.005.
- SQL (integración): `fn_campaign_materialize` con 6 candidatos (1 opt-out, 1 sin teléfono, 1 duplicado 7 días, 1 EE.UU. marketing, 2 ok) → 2 pending + 4 skipped con razones exactas; `fn_campaign_claim_contacts` concurrente (2 conexiones) no reparte el mismo contacto.

### 9.2 Integración (payloads reales)

- Webhook inbound texto + imagen → `messages.content` no vacío, `last_inbound_at` actualizado, actividad y notificación creadas.
- Webhook `statuses` sent→delivered→read fuera de orden → `v_message_last_event` = read; `failed` con `errors[{code:131049}]` → `campaign_contacts.skipped_reason='rate_limited_24h'`.
- Webhook `message_template_status_update` APPROVED/REJECTED/PAUSED → `templates.metadata.status`; PAUSED pausa campaña `sending`.
- Inbound "BAJA" → `contact_consents opted_out`, `campaign_contacts pending → skipped`; luego `POST /send` → 422.
- Edge Function con mock de Graph: `content_type='template'` envía `type:'template'`; Twilio rama con `ContentSid`; `external_message_id` escrito.
- Twilio inbound con `OptOutType=STOP` → opted_out.

### 9.3 E2E manual (org `QA Revenue`, número de pruebas del equipo)

1. Enviar texto con ventana abierta → llega; ✓✓ y azul en timeline; bandeja de chat muestra el mismo mensaje.
2. Esperar/forzar ventana cerrada (usar cliente sin inbound) → Texto deshabilitado → plantilla utility aprobada → llega; `pricing.category='utility'`.
3. Responder desde el teléfono → notificación + burbuja inbound + `related_opportunity_id` de la oportunidad abierta.
4. Responder "BAJA" → banner de opt-out; envío bloqueado; "START" → reactivado.
5. Crear plantilla en UI → PENDING → APPROVED en Meta (minutos-horas) → badge cambia sin recargar.
6. Campaña de 1.000 contactos sintéticos (`customers` de prueba con números del sandbox/test numbers de Meta): materializar → 1.000 pending; lanzar con `throttle 10` → termina en ≈ 2 min; pausar a la mitad → se detiene ≤ 1 min; reanudar → termina; stats coherentes (`sent = delivered + failed + pending`); ningún wa_id con 2 envíos en < 6 s (consulta sobre `messages.created_at`).
7. Kanban → 5 tarjetas → Acciones › Mensaje → campaña `opportunity_list` creada y enviada.
8. Canal QR: pestaña Plantilla oculta; aviso de riesgo; texto llega vía Evolution.

### 9.4 Casos borde (≥10)

1. Cliente con 2 conversaciones (Cloud y QR) → la ventana se evalúa por canal elegido. 2. Número con `+` y espacios → normalizado a dígitos para `recipient`. 3. Plantilla APPROVED en Meta pero `DISABLED` después → `sync` la marca y `send` da 422. 4. `throttle_mps=80` con `messaging_limit` 250 → `TIER_EXCEEDED`. 5. Job `campaign_batch` duplicado por reintento de cron → `dedupe_key` único, segundo `queued`→ignorado. 6. Runner muere a mitad de lote → contactos `queued` con `updated_at` > 10 min vuelven a `pending` (`fn_campaign_requeue_stale`, cron cada 5 min). 7. Variables con HTML (`<b>`) → se envían literales (WhatsApp no interpreta HTML). 8. BODY > 1.024 chars al crear HSM → 422. 9. Cliente cambia de número → `customer_channel_identities` nuevo; el envío usa la identidad más reciente (`resolveRecipient` del Edge). 10. Campaña con `template_id` de otra org → 404 en creación. 11. `131056` en 3 contactos seguidos → `throttle_mps` se reduce a la mitad para el resto del lote. 12. Inbound de un número sin `customers` → find-or-create (ya existe) y actividad sobre el cliente nuevo. 13. Mensaje programado cuya ventana se cierra antes de ejecutarse → job `dead` con `WINDOW_CLOSED` y notificación al vendedor. 14. Dos campañas simultáneas al mismo contacto → segunda lo marca `duplicate_recent` si misma plantilla en 7 días.

---

## 10. Definition of Done

1. Migraciones §3.1 aplicadas y §3.3 devuelve lo esperado; `campaign_contacts` con `organization_id NOT NULL` y RLS `org_member`.
2. `POST /api/crm/whatsapp/send` funciona desde tarjeta, drawer, detalle y cliente; `WhatsAppDialog` de `ActivityActions.tsx:606-708` eliminado; `/api/integrations/whatsapp/send` responde 410.
3. Un envío = 1 `messages` + 1 `message_events sent` + 1 `activities` con `message_id`; inbound = 1 `messages` (con `content`) + 1 `activities` + 1 notificación.
4. `whatsappCloudService.processIncomingMessage/processStatusUpdate` insertan con la shape válida (test de integración con payload real pasa; antes fallaba por columnas inexistentes).
5. Ventana 24 h correcta en UI y en servidor; texto libre fuera de ventana → 422 siempre.
6. Plantilla HSM creada desde UI llega a Meta (PENDING) y su estado se sincroniza por webhook y por `sync`.
7. Opt-out por palabra clave (Cloud, QR, Twilio) y manual; `fn_can_contact` bloquea en los 4 puntos.
8. Campaña de 1.000 contactos completa con métricas coherentes, pausa/reanuda/cancela, sin violar 1 msg/6 s por wa_id ni `throttle_mps`; 131049 no se reintenta.
9. Edge Function desplegada con soporte template/media/Twilio y `external_message_id`; Graph v26.0.
10. `/app/crm/campanas` (lista, wizard, detalle), `/app/crm/plantillas` tab WhatsApp, Configuración › WhatsApp y `BulkActionsDialog` › Mensaje operativos; archivos ≤300 L.
11. `comm_usage_logs` y `campaigns.actual_cost` reflejan costos reales de `pricing`.
12. `jest` verde incluyendo casos §9.1; `guardrails.test.ts` prohíbe `channel_credentials` en `src/components/**`.

Métricas de éxito: ≥ 90 % de mensajes WA del CRM con `related_opportunity_id`; tasa de fallo por 131049/131056 < 2 % en campañas; tiempo medio entre inbound y notificación < 5 s; 0 envíos a contactos `opted_out` (query diaria).

---

## 11. Riesgos y decisiones

- **Insert en `messages` + trigger existente** en vez de llamar a Graph desde el servicio: un solo despachador (bandeja, CRM, campañas, secuencias, agente) y un solo lugar donde viven las credenciales; el costo es la latencia del `net.http_post` (≈ 200-500 ms) aceptable.
- **Ventana por `conversations.last_inbound_at`** y no por `last_message_at` (que se actualiza con salientes): sin esto la ventana quedaría "abierta" tras cada envío propio.
- **Opt-out como trigger de BD** en vez de en cada webhook: cubre Cloud, QR y Twilio con una implementación y no depende de que cada handler lo recuerde.
- **`campaign_contacts` materializado** (no evaluar el segmento al vuelo): auditabilidad, razones de exclusión visibles, reanudación exacta tras pausa.
- **Lotes de 50 con reencolado** en vez de un job largo: encaja en `maxDuration` de Vercel y permite pausar con latencia ≤ 1 min.
- **Meta como primario, Twilio como alternativa** (D1): Twilio exige subcuenta por org para WABA propio; se soporta pero no se recomienda para orgs nuevas.
- **Plantillas en `templates`** con `metadata` y no tabla propia: mismo picker, mismo versionado y misma página que email.
- **Opt-in implícito con el primer inbound** para utility (evidencia guardada) y explícito para marketing: equilibrio entre Habeas Data y uso real.
- **Riesgos**: (1) recategorización de plantillas por Meta cambia el costo → se recalcula al `sync`; (2) calidad baja pausa plantillas y baja el tier → alertas y `PAUSED` pausa campañas; (3) Graph v26.0 puede deprecar `parameter_format` positional → siempre named; (4) tarifas CO no verificadas → `provider_pricing` editable por super admin; (5) `unaccent` requiere extensión (incluida en Supabase); (6) volumen de `activities` por chat → índice `activities(organization_id, related_type, related_id, occurred_at)` (F0).

---

## 12. Archivos tocados y orden de PRs (≤400 líneas cada uno)

**PR-1 · BD base (F16-A)**: migraciones `202609_crm_v4_f16_conversations_last_inbound`, `_messages_crm`, `_whatsapp_optout` (vía MCP); ampliar `src/lib/services/crm/consentService.ts` (`setConsent`, `canContact`, `isOptOutKeyword`); tests `optout`, `window`.
**PR-2 · Inbound shape única (F16-B)**: `src/lib/services/integrations/whatsapp/whatsappCloudService.ts` (`processIncomingMessage :390-431`, `processStatusUpdate :434-476`, `processWebhookPayload :340-378` con `message_template_status_update`), índice único parcial `external_message_id`; `src/app/api/integrations/twilio/incoming-message/route.ts` y `status-callback/route.ts` (inserts con shape + `OptOutType`); tests con payloads reales.
**PR-3 · Edge Function (F16-C)**: `supabase/functions/channel-dispatch/index.ts` (`GRAPH` v26.0, `sendWhatsAppTemplate`, `sendWhatsAppMedia`, `sendTwilioWhatsApp`, rama por `content_type`, `external_message_id`, `error_code`); deploy con MCP; env `WHATSAPP_GRAPH_VERSION`.
**PR-4 · Envío individual (F16-D)**: `src/lib/services/crm/whatsapp/whatsappOutboundService.ts`; rutas `src/app/api/crm/whatsapp/send/route.ts`, `window/[customerId]/route.ts`, `channels/route.ts`; handler `whatsapp` en `src/lib/jobs/handlers/whatsapp.ts`; `src/app/api/integrations/whatsapp/send/route.ts` → 410; eliminar `qr/send`, `mark-read`, `qr/mark-read`; eliminar `WhatsAppDialog` de `src/components/crm/pipeline/drawer/ActivityActions.tsx:606-708`; reemplazar `wa.me` en `pipelineUtils.ts:78-90`, `CustomersTable.tsx:173,255`, `CustomerDetailsModal.tsx:65`, `HoyView.tsx:102,118`.
**PR-5 · Plantillas HSM (F16-E)**: migración `202609_crm_v4_f16_whatsapp_templates` + `fn_seed_whatsapp_templates`; `whatsappTemplateService.ts`; rutas `src/app/api/crm/whatsapp/templates/{route.ts, [id]/route.ts, [id]/submit/route.ts, [id]/preview/route.ts, sync/route.ts}`; eliminar `src/app/api/integrations/whatsapp/templates/route.ts` (B9); pg_cron `crm-hsm-sync` cada 6 h.
**PR-6 · Campañas BD + servicio (F16-F)**: migraciones `202609_crm_v4_f16_campaigns_v2`, `_campaign_functions` (`fn_campaign_materialize`, `fn_segment_customers`, `fn_campaign_claim_contacts`, `fn_campaign_mark_*`, `fn_campaign_stats`, `fn_campaign_sync_from_event`, `fn_campaign_link_reply`, `fn_campaign_requeue_stale`); `campaignService.ts`; rutas `src/app/api/crm/campaigns/{route.ts, [id]/route.ts, [id]/materialize, [id]/launch, [id]/pause, [id]/resume, [id]/cancel, [id]/stats, [id]/contacts}`; handler `campaign_batch` en `src/lib/jobs/handlers/campaignBatch.ts`; `src/components/crm/campanas/CampanasService.ts` reducido a lecturas (`getCampaigns`, `getCampaignById`, `getStats`) y `types.ts` alineado con los CHECKs nuevos; tests SQL de materialización y claim.
**PR-7 · Compose UI (F16-G)**: `src/components/crm/whatsapp/ComposeWhatsAppDialog.tsx`, `compose/{useWhatsAppCompose, ChannelSelector, WindowIndicator, TextComposer, TemplateComposer, WhatsAppBubblePreview, MediaAttachment}.tsx`, `WhatsAppThreadPreview.tsx` (registrado en `TimelineEntryCard`/`WhatsAppEntry` de F9).
**PR-8 · Campañas UI (F16-H)**: `campanas/CampanasPage.tsx` (reescrita), `campanas/nuevo/CampanaNuevaPage.tsx` → `CampaignWizard.tsx` + `steps/*`, `campanas/id/CampanaDetallePage.tsx` → `CampaignDetail.tsx` + `CampaignProgressCard`, `CampaignErrorsCard`, `CampaignContactsTable`; `compose/BulkAudiencePanel.tsx`; `src/components/crm/pipeline/modals/BulkActionsDialog.tsx` (+ pestaña Mensaje).
**PR-9 · Plantillas y configuración UI (F16-I)**: `src/components/crm/plantillas/whatsapp/{WhatsAppTemplatesTab, HsmEditorPage, HsmComponentsForm}.tsx`, rutas `src/app/app/crm/plantillas/whatsapp/{nueva, [id]}/page.tsx`; `src/components/configuracion/crm/whatsapp/WhatsAppSettingsTab.tsx`; nav sin cambios (Campañas y Plantillas ya listadas).

Eliminados al final: `src/app/api/integrations/whatsapp/{send (410 → borrar en F8), mark-read, templates}/route.ts`, `qr/{send, mark-read}/route.ts`, `WhatsAppDialog` en `ActivityActions.tsx`, `WHATSAPP_RATE_LIMITS`/`WHATSAPP_MESSAGING_TIERS` hardcodeados en `whatsappCloudConfig.ts:56-69` (sustituidos por `provider_pricing` + `messaging_limit` real), `CampanasService.updateCampaignStatus` (`:247-263`).

### 12.1 Lo que realmente se entregó (rondas 1 y 2)

El plan de PRs de arriba se ejecutó **agrupado**, no PR a PR. Correspondencia real
(los nombres de archivo difieren del plan en varios puntos):

| PR del plan | Estado | Archivos reales |
|---|---|---|
| PR-2 Inbound shape única | ⚠️ código correcto, bloqueado por el disparador de identidades (§1.1 A2) | `src/lib/services/integrations/whatsapp/whatsappCloudService.ts` (r2: `WhatsAppInboundPersistError`, identidad con `organization_id`+`identity_type`, `payload.phone`), `whatsappCloudTypes.ts`, `whatsappQrService.ts`, `src/app/api/integrations/whatsapp/webhook/route.ts` (r2: espera el procesamiento y responde 500 si falla) |
| PR-3 Edge Function | ✅ desplegada (**v8** en la ronda 2) | `supabase/functions/channel-dispatch/index.ts` |
| PR-4 Envío individual | ✅ | `src/lib/services/crm/whatsapp/{outboundService,windowService,channelService,consent,costs,allowedHours}.ts`; `src/app/api/crm/whatsapp/{send,window/[customerId],channels,reply,settings}/route.ts`; `src/lib/jobs/handlers/whatsapp.ts` |
| PR-5 Plantillas HSM | ✅ | `templateService.ts`, `templateProvider.ts`, `templateRender.ts`, `webhookTemplateStatus.ts`; `src/app/api/crm/whatsapp/templates/{route.ts,sync,[id]/{route.ts,submit,preview}}` |
| PR-6 Campañas BD + servicio | ✅ (sin migraciones nuevas) | `campaignStore.ts`, `campaignMaterialize.ts`, `campaignService.ts`, `campaignBatch.ts`, `campaignEvents.ts`, **`schemas.ts` (zod, r2)**; `src/app/api/crm/campaigns/**`; `src/lib/jobs/handlers/campaignBatch.ts` |
| PR-7 Compose UI | ⚠️ montado en `BulkActionsDialog`; falta el import de `QuickActionsBar` (F9) | `src/components/crm/whatsapp/{ComposeWhatsAppDialog,WhatsAppThreadPreview,HsmEditorDialog,WhatsAppTemplatesTab,api}.tsx` + `compose/*` (**10 archivos**: `BubblePreview`, `BulkAudience`, `ChannelSelect`, `CostEstimate`, `MediaAttachment`, `MessageForm`, `TemplatePicker`, `WindowBadge`, `useBulkSend`, `useWhatsAppCompose` — la ronda 1 decía 9) |
| PR-8 Campañas UI | ✅ | `src/components/crm/campanas/{CampanasPage,CampanasService,types}.ts(x)`, `nuevo/{CampanaNuevaPage,AudienceStep,ScheduleStep}.tsx`, `id/{CampanaDetallePage,CampaignContactsTable}.tsx` |
| PR-9 Configuración UI | ✅ | `src/components/configuracion/crm/WhatsAppTab.tsx` |
| PR-1 migraciones BD | ↪️ DB-0 | La fase se implementó **sobre el esquema vivo** (`campaigns.statistics` jsonb como config v2, `campaign_contacts.metadata` como estado). Ver §13. |

**Archivos añadidos/tocados en la ronda 2:** `src/lib/services/crm/whatsapp/schemas.ts`
(nuevo, zod), `campaignBatch.ts`, `campaignEvents.ts`, `campaignStore.ts`, `types.ts`,
`__tests__/round2.test.ts` (nuevo) y `__tests__/testerR1.test.ts` (los dos tests que
documentaban defectos quedan invertidos); `src/lib/jobs/handlers/campaignBatch.ts`;
las 19 rutas de `src/app/api/crm/{whatsapp,campaigns}/**` más
`src/app/api/integrations/whatsapp/{send,webhook}/route.ts`;
`src/lib/services/integrations/whatsapp/whatsappCloudService.ts`;
`supabase/functions/channel-dispatch/index.ts` (v8);
`src/components/crm/whatsapp/{api.ts,ComposeWhatsAppDialog.tsx,WhatsAppTemplatesTab.tsx,compose/useWhatsAppCompose.ts}`,
`src/components/crm/campanas/{CampanasService.ts,CampanasPage.tsx,id/CampanaDetallePage.tsx}`
y `src/app/app/chat/bandeja/page.tsx` (cambio mínimo y aditivo: el saliente de WhatsApp
pasa por la API en vez de insertarse a mano).

**Desviación documentada:** no se crearon columnas nuevas. La configuración v2 de
campaña vive en `campaigns.statistics` (`CampaignConfig`) y el estado por contacto
en `campaign_contacts.metadata` (`CampaignContactMeta`), porque los CHECK actuales
de `campaigns.status` y `campaign_contacts.state` no admiten los estados nuevos.
`countContacts` lee de `metadata` con la columna `state` como respaldo.

---

## 13. Registro de implementación

### Ronda 1

**Fecha:** 2026-09-08 · **Agente:** builder F16 · **Ronda:** 1 (tercer intento; los dos
anteriores se cortaron por límite de API dejando el trabajo a medias).

### Verificación ejecutada

- **tsc** — `tsconfig` acotado a los archivos de F16: **0 errores propios**. Los 6 que
  quedan en ese proyecto son preexistentes y de otros dueños
  (`chat/channels/website/*` ×2, `inventario/productos/nuevo/TrazabilidadSeccion.tsx` ×4),
  arrastrados por importación transitiva. `templateService.ts`, que era el archivo con
  errores al arrancar la ronda, quedó limpio.
- **jest** — `npx jest src/lib/services/crm/whatsapp`: **6 suites / 57 tests en verde**
  (53 previos + 4 nuevos de regresión).
- **Prueba controlada E2E** (org 2, sin credenciales Meta → ningún mensaje real salió;
  el script aborta si detecta `access_token` + `phone_number_id` en el canal):
  4 clientes ficticios (`+1555010000x`), campaña de texto, materialización, lanzamiento,
  ejecución del handler `campaign_batch` por el runner real y limpieza total verificada
  por SQL (0 filas residuales). Resultados en «Cómo probarlo» del informe `F16-r1.md`.

### Bugs encontrados y corregidos durante la verificación

1. **`validateAudience` no validaba `audience.source`** (`campaignStore.ts:61`). Un
   `source` desconocido (p. ej. `'customers'` por un typo del cliente de la API)
   pasaba la validación, se guardaba en `campaigns.statistics` y la campaña se
   materializaba con **0 contactos en silencio**: sin error, sin aviso, campaña vacía.
   Corregido con una allow-list (`segment | stage | manual`) → 400. Test nuevo.
2. **El texto libre no pasaba por el motor de variables de F7**
   (`outboundService.ts`, rama `else`). Solo la rama de plantilla interpolaba; el texto
   plano se insertaba tal cual, de modo que una campaña con `{{contact.first_name}}`
   enviaba al cliente el literal `{{contact.first_name}}`. Corregido: si el texto
   contiene `{{` se construye el contexto (`buildContext`) y se renderiza con
   `renderVariables(..., {escapeHtml:false})`; si falta alguna variable se lanza
   `MISSING_VARIABLES` (que `campaignBatch.classifySendError` ya mapea a
   `skip/missing_variables`) en vez de enviar el marcador. Se añadió
   `SendWhatsAppInput.variables` y `campaignBatch` lo pasa en las campañas de texto.
   Dos tests nuevos (interpolación correcta y no llamar a `buildContext` sin `{{`).

### Edge Function

`channel-dispatch` desplegada por MCP tras leer íntegra la versión desplegada:
**v6 → v7**, `verify_jwt:false` conservado. Se comprobó antes que ningún canal tiene
más de una fila en `channel_credentials` (la consulta nueva usa `maybeSingle()` sin
filtrar por `provider`). La ejecución en vivo devolvió `NO_CREDENTIALS`, un código que
**solo existe en la versión nueva**, lo que confirma que v7 está activa.

### Pendiente (no bloquea la fase)

- **B9** — endpoints WhatsApp muertos (`qr/send`, `qr/mark-read`, `mark-read`,
  `integrations/whatsapp/templates`) siguen en el árbol; el plan los borra en F8.
- **B10 / C4** — `twilio/send-whatsapp` sigue sin `contentSid` y con cliente browser.
- **PR-1** — columnas nuevas de `campaigns` / `campaign_contacts` (ver §12.1). Mientras
  no existan, `campaign_contacts.state` queda en `null` para los contactos omitidos
  (el estado real está en `metadata.state`); las lecturas ya lo contemplan.
- El servidor de desarrollo del puerto 3010 tenía la caché de webpack corrupta
  (`Cannot read properties of undefined (reading 'call')` en `webpack-runtime.js`),
  ajeno a esta fase; la prueba del job se hizo llamando a `runJobs` con el mismo
  registro de handlers que usa la ruta HTTP.

---

### Ronda 2 (2026-09-08) — correcciones del informe `TEST-F16-r1.md`

**Agente:** builder F16 · **Entrada:** 106 casos del tester, 18 fallos, 6,5/10.

#### Corregido, por severidad

| # tester | Severidad | Qué se hizo |
|---|---|---|
| 1 | CRÍTICO | **Inbound que no se puede guardar.** Causa raíz en BD (disparador `fn_update_customer_channel_identity`), pedida abajo como DDL bloqueante. En el código: el error deja de tragarse — `WhatsAppInboundPersistError` con `organization_id`/`channel_id`/`external_message_id`/`code`/`details`, `processWebhookPayload` agrega los fallos del lote y los lanza, y `POST /api/integrations/whatsapp/webhook` **espera** el procesamiento y responde 500 (Meta reintenta) en vez del `.catch(console.error)` en fire-and-forget. `findOrCreateCustomer` inserta la identidad con `organization_id` e `identity_type='whatsapp_phone'` (los dos son NOT NULL y faltaban: ese INSERT fallaba siempre en silencio) y el mensaje entrante guarda `payload.phone`/`payload.wa_id`, para que el disparador use el teléfono como identidad y no el `wamid` (que crearía una identidad nueva por cada mensaje). |
| 2 | CRÍTICO | **Reclamación atómica de contactos.** `claimContacts` condiciona el UPDATE por el estado previo (`.eq('metadata->>state', prev)` / `.is('metadata->>state', null)`) y escribe `claim_token` + `claimed_at`; Postgres reevalúa el WHERE bajo el lock de la fila, así que de dos UPDATE simultáneos solo uno gana. Se sobre-consulta (`limit*4`) y se **reintenta** con el siguiente candidato hasta llenar el lote; los candidatos perdidos se cuentan (`campaign_claim_contested` en el log). Las escrituras posteriores del lote (`setMeta`) exigen el mismo `claim_token`, de modo que el lote perdedor no pisa al ganador. **No hizo falta ninguna función nueva en BD.** |
| 3 | ALTO | **«Calcular → Enviar».** `updateCampaign` solo invalida `materialized_at` cuando la audiencia **cambia de verdad** (`sameAudience`, orden de ids irrelevante), cambia `template_id` o cambia `purpose` (que altera las exclusiones). El compositor masivo reenvía el mismo body al pulsar «Enviar», y eso ya no borra el cálculo. |
| 4 | ALTO | **Contacto huérfano tras 131056/130429.** `applyMessageEventToCampaign` llama a `reopenCampaignForRetry`: si la campaña está `sent`, la devuelve a `sending` (limpia `finished_at`) y encola `campaign_batch` para la hora del reintento; si está `sending` no hace nada (ya encadena lotes) y si está pausada/cancelada/borrador tampoco. Se conserva `previous_message_id` al liberar `message_id`. |
| 5 | MEDIO | **Org del job.** `runCampaignBatch` acepta `expectedOrgId` y devuelve `org_mismatch` si no coincide con `campaigns.organization_id`; el handler lo pasa desde `job.organization_id` y convierte ese caso en `JobFatalError`. |
| 6 | MEDIO | **Dos compositores.** El de F16 es el bueno; el cambio de import está en `QuickActionsBar.tsx` (propiedad de F9) y se pide en «Integración pendiente» de `F16-r2.md`. |
| 7 | MEDIO | **Bandeja de chat.** `src/app/app/chat/bandeja/page.tsx` ya no inserta `messages` salientes cuando el canal es WhatsApp: usa `POST /api/crm/whatsapp/send` (ventana 24 h, `fn_can_contact`, créditos, `activities`). Cambio mínimo y aditivo; el resto de canales sigue igual. |
| 8 | MEDIO | **Admin-only visible.** `can_manage` en `GET /api/crm/campaigns`, `/campaigns/[id]` y `/whatsapp/channels`; lista y detalle de campañas ocultan lanzar/pausar/reanudar/cancelar, el compositor masivo deshabilita «Enviar a N» con el motivo y la pestaña de plantillas queda en solo lectura con aviso. |
| 9 | MEDIO | **zod en todas las rutas.** `src/lib/services/crm/whatsapp/schemas.ts` valida bodies y query de las 19 rutas de la fase más `/api/integrations/whatsapp/send`; el body no puede traer `organization_id`. |
| 10 | BAJO | `patchCampaignStats` ya no recibe la clave dinámica `[action.reason]: true`; la razón va solo en `pause_reason`. |
| 11 | BAJO | Edge Function: la consulta de `channel_credentials` usa `order(updated_at).limit(5)` y prefiere la fila con token, en vez de `maybeSingle()` sin filtro. Desplegada **v8** (`verify_jwt:false`). |
| 12 | BAJO | `contactState`: `metadata.state = 'replied'` (y `read`) gana sobre la columna `state='sent'`, así que filtrar por `replied` en `listCampaignContacts` funciona. |

**No corregido en esta ronda** (anotado en el informe): #13 `WhatsAppThreadPreview` sin
montar (depende de F9), #14 `duplicate_recent` solo con plantilla, #15 ventana y
conversación pueden ser conversaciones distintas, #16 `fn_can_contact` ignora
`p_purpose` (es de F0/DB), #17 `patchCampaignStats` es read-modify-write sin bloqueo
(necesita una RPC), #18 endpoints muertos (los borra F8).

#### Verificación ejecutada

- **jest** — `npx jest src/lib/services/crm/whatsapp`: **8 suites / 78 tests verdes**
  (los 9 del tester incluidos, con los dos que documentaban defectos **invertidos**, más
  12 nuevos en `__tests__/round2.test.ts`). Suite completa: 61 suites verdes; la única
  roja sigue siendo `website/__tests__/sectionContract.test.ts`, de F0.6.
- **tsc** acotado a F16: **0 errores propios** (los 6 restantes son preexistentes de
  `chat/channels/website/*` e `inventario/productos/*`). `chat/bandeja/page.tsx`
  comprobado aparte: 0 errores.
- **Concurrencia real** (org 2, canal sin credenciales, teléfonos `+1555010901..908`):
  dos `runCampaignBatch` en paralelo sobre la misma campaña de 8 pendientes →
  `a.claimed 2 / a.sent 2` y `b.claimed 6 / b.sent 6`, **8 mensajes para 8
  destinatarios, 0 duplicados** (en la ronda 1: 8+8 = 16 con los 8 duplicados).
- **«Calcular → Enviar»**: `create → materialize → update(mismo body) → launch` →
  `materialized_at` intacto y campaña en `sending`, sin el 409 `NOT_MATERIALIZED`.
- **Aislamiento por org**: lote con `expectedOrgId` ajeno → `org_mismatch`, 0 reclamados.
- **Limpieza verificada por SQL**: 0 clientes `+1555010%`, 0 campañas `F16%`, 0
  `campaign_contacts`, 0 `outbound_jobs` `campaign_batch`, 0 mensajes, 0 conversaciones
  en el canal WhatsApp de la org 2, 0 `comm_usage_logs` de números de prueba (se
  borraron también 11 residuos de la ronda 1) y `customer_channel_identities` de vuelta
  en 6. `campaigns` vuelve a 4 y los canales WhatsApp a 2.
- **Cero mensajes reales**: se usó la org 2 (canal sin `channel_credentials`) y el
  script aborta si detecta `access_token` + `phone_number_id`. La org 135 no se tocó.

#### Petición a DB (BLOQUEANTE)

`fn_update_customer_channel_identity` (AFTER INSERT en `messages`) inserta
`identity_type = v_channel_type`, es decir `'whatsapp'`, y el CHECK
`customer_channel_identities_identity_type_check` solo admite
`widget_anon | widget_identified | whatsapp_phone | instagram_user | facebook_psid`.
Como el disparador no captura la excepción, **el INSERT del mensaje se revierte
entero**. Reproducido con `INSERT` + `ROLLBACK`: con `external_message_id` →
`violates check constraint "customer_channel_identities_identity_type_check"`; sin él →
aceptado. Evidencia de que nunca ha funcionado: `messages` tiene 17 inbound de canales
WhatsApp y 128 650 de `website`, y **ninguno** con `external_message_id`.

**Opción correcta: arreglar el disparador, NO ampliar el CHECK.** `identity_type`
describe *qué clase de identificador* es (un teléfono, un PSID, un anónimo del widget),
no el tipo de canal; las 6 filas existentes usan `whatsapp_phone`. Ampliar el CHECK con
`'whatsapp'` crearía un vocabulario paralelo para lo mismo y, como la unicidad es
`UNIQUE (channel_id, identity_type, identity_value)`, el mismo teléfono podría existir
dos veces en el mismo canal con dos `identity_type` distintos; las lecturas que buscan
por `(channel_id, identity_value)` devolverían duplicados y `resolveRecipient` (que
filtra por `identity_type='whatsapp_phone'`) no encontraría las nuevas. Además el
`COALESCE` que calcula `identity_value` cae en `NEW.external_message_id`: un `wamid` es
único por mensaje, así que crearía una identidad basura por cada mensaje entrante.

```sql
-- crm_v4_f16_fix_identity_trigger
CREATE OR REPLACE FUNCTION public.fn_update_customer_channel_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_channel_type   text;
  v_identity_type  text;
  v_identity_value text;
BEGIN
  IF NEW.direction = 'inbound' AND NEW.sender_customer_id IS NOT NULL THEN
    SELECT type INTO v_channel_type FROM channels WHERE id = NEW.channel_id;

    -- El tipo de canal NO es el tipo de identidad (CHECK:
    -- widget_anon | widget_identified | whatsapp_phone | instagram_user | facebook_psid)
    v_identity_type := CASE v_channel_type
      WHEN 'whatsapp'  THEN 'whatsapp_phone'
      WHEN 'instagram' THEN 'instagram_user'
      WHEN 'facebook'  THEN 'facebook_psid'
      WHEN 'website'   THEN 'widget_anon'
      ELSE NULL
    END;

    -- El identificador es el telefono/psid, nunca el id del mensaje del proveedor
    v_identity_value := COALESCE(
      NEW.payload->>'phone',
      NEW.metadata->>'wa_id',
      NEW.payload->>'whatsapp_id',
      NEW.payload->>'email',
      NEW.payload->>'psid'
    );

    IF v_identity_type IS NOT NULL AND v_identity_value IS NOT NULL THEN
      INSERT INTO customer_channel_identities (
        organization_id, customer_id, channel_id, identity_type, identity_value,
        verified, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (
        NEW.organization_id, NEW.sender_customer_id, NEW.channel_id,
        v_identity_type, v_identity_value, false, NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (customer_id, channel_id, identity_value)
      DO UPDATE SET last_seen_at = NOW(), updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
```

Filas afectadas (consultadas por MCP en solo lectura, sin escribir nada):
`customer_channel_identities` = 6 filas, **todas** `identity_type='whatsapp_phone'`, así
que el cambio no invalida ninguna fila existente; el `ON CONFLICT` sigue apuntando al
índice único real `idx_customer_channel_identities_unique (customer_id, channel_id,
identity_value)`. Dos de esas 6 filas tienen como `identity_value` lo que parece un
`phone_number_id` (`107907496599684`, `184756775997595`), residuo del camino QR; no las
toca esta migración.

**Mientras el DDL no se aplique**, ningún mensaje entrante de la Cloud API se guarda y,
en cascada, no hay ventana de 24 h, ni opt-out por palabra clave, ni atribución de
respuestas a campañas. La diferencia con la ronda 1 es que ahora **se ve**: el webhook
responde 500 y el log lleva el detalle del constraint.

