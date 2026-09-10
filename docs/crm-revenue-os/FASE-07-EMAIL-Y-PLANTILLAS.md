# FASE 07 — Email profesional desde la oportunidad: editor de bloques + HTML, plantillas, dominio propio por organización, IA, tracking e inbound

> Fecha: 2026-09-08 · Estado: **reescrito V4** (reemplaza el V3 que asumía SendGrid como stack vivo y no tenía editor de bloques real)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (seguridad, `outbound_jobs` + pg_cron + `/api/crm/jobs/run`, `contact_consents` + `fn_can_contact`, `templates.blocks_json/engine/version`, `activities.email_message_id`, secretos cifrados en `vault`), **F9** (timeline + `QuickActionsBar` que abre `ComposeEmailDialog`).
> Bloquea: F8 (secuencias y reglas usan `sendEmail` + plantillas), F16 (campañas de email reutilizan `outbound_jobs` kind `email`), F6 (agente IA usa `ai_draft_email`).
> Esfuerzo: **XL** (5 PRs backend + 5 PRs UI). Valor: alto (el dueño pidió literalmente "correos personalizados y profesionales, con widgets y modo HTML").

---

## 0. Objetivo y alcance

Al terminar esta fase, con una organización de prueba, se puede verificar que:

1. Desde la tarjeta Kanban, el drawer o el detalle de la oportunidad, el vendedor abre `ComposeEmailDialog`, elige plantilla o redacta con bloques (o HTML crudo), inserta variables reales (`{{contact.first_name|cliente}}`, `{{opportunity.amount|money}}`), adjunta el PDF de la cotización y envía; el correo llega desde `nombre@crm.dominio-de-la-org.com` con DKIM/SPF alineados.
2. El envío crea **una sola** fila en `email_messages` y **una sola** `activities` (con `email_message_id`), y aparece en el timeline como `EmailPreviewCard` con estado, eventos y cuerpo colapsable.
3. Los webhooks de Resend actualizan el estado sin retrocesos (sent < delivered < opened < clicked; bounced/complained terminales) y los contadores se incrementan de forma atómica.
4. El cliente responde al correo y la respuesta entra por Resend Receiving a `crm.{dominio}` → `email_messages.direction='inbound'` + activity + notificación al vendedor + adjuntos en `documents`.
5. La organización registra su dominio en Configuración → Email, copia los registros DNS, verifica, y desde ese momento envía con su propia identidad (API key `sending_access` restringida al dominio, cifrada en `vault`). Sin dominio verificado, envía vía dominio global de GoAdmin con la nota "enviado vía GoAdmin" (política configurable).
6. Un contacto con `contact_consents.status='opted_out'` (o `customers.metadata.do_not_email=true`) **no** recibe correos: `sendEmail`, secuencias y campañas fallan cerrado con error `CONTACT_OPTED_OUT`. Cada correo de marketing lleva `List-Unsubscribe` y un enlace público `/u/{token}` que da de baja sin login.
7. "Redactar con IA" genera asunto + preheader + bloques con `gpt-5.6-luna` usando el contexto de la oportunidad (etapa, productos, último análisis de llamada, objeciones) y debita créditos IA.
8. `/app/crm/plantillas` lista, crea, versiona, duplica y muestra uso de plantillas de email con el mismo editor a pantalla completa. 6 plantillas base en español vienen sembradas por organización.

**No incluye:** secuencias multipaso (F8), plantillas HSM de WhatsApp (F16, aunque comparten la tabla `templates`), SMS, marketing por Audiences/Broadcasts de Resend (usamos `batch.send` sobre nuestros propios `campaign_contacts`), calendario ICS (F6/F9 lo adjuntan usando `attachments` de esta fase), migración/eliminación del stack SendGrid (se deprecia en F0/F8: aquí solo se deja de usar).

---

## 1. Estado actual verificado

Fuentes: `audit-messaging.md`, `audit-ui.md`, schema consultado el 2026-09-08. Todas las tablas de email tienen **0 filas**.

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| `src/app/api/email/send/route.ts` (60L) → `sendEmail` (A4) | ✅ | Happy path funciona con `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS` globales. Acepta `template_id` como contenido suficiente (`emailService.ts:257`) aunque nunca se lee. |
| `src/app/api/email/webhook/route.ts` (53L) → `handleEmailWebhook` (A5) | ✅ | Svix `:675-683`, idempotencia por `provider_event_id` `:695-707`, `email_events` `:724-735`. Funciona; ver C16 para el orden de eventos. |
| `react-email` `^6.9.3` y `resend` `^6.25.0` en `package.json` (B1) | 🟡 | Instalados, nunca importados; no existe `src/emails/`. `@react-email/components` y `@react-email/render` NO están instalados. |
| `createEmailDomain` `emailService.ts:530-563` (B2) | 🔴 | Escribe `status='pending'` y nunca llama a Resend Domains API; `dns_records` queda `[]`. |
| `resolveDefaultDomain` `emailService.ts:195-210` (B2) | 🔴 | Filtra `status='verified'` → siempre `null` → todas las orgs envían desde `EMAIL_FROM_ADDRESS` (`:239-240`). Sin UI de dominios. |
| `/api/email/templates` (B3) | 🔴 | No existe; `ActivityActions.tsx:478` lo llama y silencia el error (`:483-485`); `useState` usado como efecto (`:475-487`). |
| Tabla `templates` (B4) | 🔴 | 0 filas, sin editor; solo `onboardingService` (`kind='onboarding'`). `sendEmail` no la lee. |
| `EmailNotifications.ts/.tsx` (B5, C19) | 🔴 | Stubs con `console.log` (`:82-87` / `:84-91`), mismo basename con firmas distintas. Se eliminan (D2). |
| Dos stacks de email (B11) | 🟡 | `emailService.ts:404-405` lanza "Provider no soportado" para sendgrid; `/api/integrations/sendgrid/*` sigue vivo con IDOR (C5) y `connections[0]` (C6). F0 cierra C5/C6; aquí se deja de usar. |
| `mailto:` sin registro (B12) | 🟡 | `pipelineUtils:78-90`, `CustomersTable:173,255`, `CustomerDetailsModal:65`, `HoyView:102,118`. Se reemplazan por `ComposeEmailDialog`. |
| `clientes/[id]/page.tsx` (B13) | 🟡 | Sin compose. F9 monta `QuickActionsBar`; esta fase entrega el diálogo. |
| `sendPayload.template` `emailService.ts:352-356` (C13) | 🔴 | `template` no existe en el SDK; `template_id` es uuid local que nunca se lee → payload sin `html` → `failed`. |
| `generateIdempotencyKey` `emailService.ts:172-176` (C14) | 🟠 | `Date.now()+random` → doble clic envía dos veces. |
| Activities duplicadas (C15) | 🟠 | `emailService.ts:311-327` crea una y `ActivityActions.tsx:519` otra (+ `logContact` `:520`). |
| Webhook sobrescribe estado (C16) | 🟠 | `:743-778` aplica el último evento sin orden; `open_count`/`click_count` con lectura stale (`:757,761`). |
| `unsubscribed` inalcanzable (C17) | 🟡 | Sin `List-Unsubscribe`, sin página de baja. |
| Supresión no leída (C18) | 🔴 | `do_not_email` escrito en `:799` y nunca consultado por `sendEmail`, `sequenceService:575` ni `automationService:474`. |
| `renderTemplate` `emailService.ts:182-190` (C23) | 🟠 | `{{\w+}}` plano, sin rutas con punto, sin defaults, sin escape HTML (inyección), solo `customer_name`; la UI no envía `template_variables`. |
| `EmailDialog` `src/components/crm/pipeline/drawer/ActivityActions.tsx:466-594` | 🔴 | Textarea HTML crudo (`:571-579`), 1 destinatario, sin cc/bcc, adjuntos, preview, variables ni firma. |
| `PlantillaEditorDialog.tsx` (A8) | 🟡 | Único editor real (HTML + texto + chips + preview `:166-183`) pero sobre `notification_templates`; sirve de referencia de UX, no se reutiliza. |
| `RichTextEditor.tsx` (118L, contentEditable + `execCommand`) | 🟡 | Se reutiliza dentro del bloque `text` del editor de bloques; no como editor de correo completo. |
| `email_domains` / `email_messages` / `email_events` (schema) | 🟡 | Existen con RLS `org_member` (políticas `ed_*`, `em_*`). Faltan `direction`, `in_reply_to`, `thread_id`, `attachments`, `preheader`, `list_unsubscribe_token`; `email_domains` sin `region`, `tracking_subdomain`, `receiving_enabled`, `api_key_secret_id`. |
| `templates` (schema) | 🟡 | `channel`/`kind` sin CHECK; RLS `templates_*_policy` sin `is_active`. F0 añade `blocks_json`, `engine`, `version`. |
| `timelineService.ts:261` | 🟡 | Lee `email_messages` por `related_type/related_id`; 0 consumidores (F9 lo consume). |
| `resolveOrgFromExternal` `orgContext.ts:85` | 🔴 | Roto (F0). El webhook de email no lo usa: resuelve org por `provider_message_id`; el inbound necesita resolver por dominio → depende del fix de F0. |


### 1.1 Implementado — ronda 1 (2026-09-08)

La tabla anterior es la auditoría **previa** a la implementación; se conserva como registro. Estado real tras la ronda 1 de F7:

| Pieza | Estado | Archivo:línea |
|---|---|---|
| Render de bloques (13 tipos) + HTML crudo, tablas compatibles Outlook | ✅ | `src/lib/services/crm/email/renderBlocks.ts:45,205`, esquema zod en `blocks.ts:32-116` |
| Motor de variables con rutas con punto, `\|default`, `\|money`/`\|date`, escape HTML y catálogo | ✅ | `variables.ts:88,167,200,258,291` |
| Sanitizado de HTML (allowlist, sin `<script>`/`on*`/`javascript:`) + `htmlToText` | ✅ | `sanitize.ts:68,77,89` |
| `renderEmail` (plantilla \| bloques \| html) con preheader y variables faltantes | ✅ | `render.ts:49` |
| Plantillas CRUD + duplicar + preview + test-send + `usage_count` | ✅ | `templatesService.ts:88-254`; rutas `src/app/api/email/templates/**` |
| 6 plantillas semilla en español (`is_system`, `seed_key`) | ✅ | `seeds/emailTemplates.ts:31-135` (`follow_up_call`, `proposal_sent`, `demo_reminder`, `reactivation`, `thank_you_close`, `friendly_collection`) |
| Dominios: alta en Resend, DNS (incl. DMARC propio), verificar, por defecto, remitentes, tracking, borrado | ✅ | `domainsService.ts:62,109,155,186,223,227`; rutas `src/app/api/email/domains/**` |
| `resolveSender`: dominio verificado de la org → fallback global con aviso "enviado vía GoAdmin" | ✅ | `domainsService.ts:268` |
| Envío v2: `fn_can_contact` fail-closed → fila `email_messages` → **una** activity → adjuntos → Resend | ✅ | `sendService.ts:85,160`; activity única en `messageStore.ts:71` |
| `Idempotency-Key` = `email/{id}` (no `Date.now()`) + dedupe por `client_request_id` | ✅ | `messageStore.ts:12,44`; uso en `sendService.ts:148` |
| Payload Resend en **camelCase** (`replyTo`, `scheduledAt`) — tester-ANEXO-B #4 | ✅ | `sendService.ts:107-141` |
| `List-Unsubscribe` + `List-Unsubscribe-Post` **solo** en `marketing`/`sequence` | ✅ | `sendService.ts:115-120` |
| `Reply-To` `crm+{email_message_id}@{dominio de recepción}` para enhebrar respuestas | ✅ | `sendService.ts:210` |
| Programado: ≤1 h → `scheduledAt` de Resend; >1 h → `outbound_jobs` kind `email`; máx. 30 días | ✅ | `sendService.ts:175-181,237-241`; `types.ts` (`MAX_SCHEDULE_DAYS`, `RESEND_SCHEDULE_WINDOW_MS`) |
| Cancelar programado (Resend + job) y responder en hilo | ✅ | `sendService.ts:265,280` |
| Adjuntos desde `documents` con tope de 40 MB por correo | ✅ | `attachments.ts:16` |
| Tags `tenant_id` / `email_message_id` / `related` | ✅ | `sendService.ts:121-126` |
| Webhook: firma svix fail-closed, idempotencia por `svix-id`, estados monótonos, contadores con update optimista | ✅ | `webhookService.ts:71,105,173` |
| Webhook: `bounced` (Permanent) / `complained` → `contact_consents` opted-out | ✅ | `webhookService.ts:151-161` + `unsubscribe.ts:65` |
| `email.received` → `email_messages` inbound + activity + adjuntos a `documents` | ✅ | `inboundService.ts:22,84` |
| Página pública de baja `/u/[token]` (GET + POST One-Click) con token HMAC | ✅ | `src/app/u/[token]/route.ts:35,42`; token en `unsubscribe.ts:32,37` |
| Handler de jobs `email` (programado, lote ≤100 sin adjuntos, reintento inbound) | ✅ | `src/lib/jobs/handlers/email.ts:15`; lote en `batchService.ts:24` |
| Borrador con IA + cobro de créditos | ✅ | `aiDraftService.ts:99`; ruta `src/app/api/crm/ia/draft-email/route.ts:15` |
| Editor visual de bloques (paleta, canvas @dnd-kit, panel de propiedades, variables) | ✅ | `src/components/crm/email/editor/{EmailBlockEditor,BlockPalette,BlockCanvas,BlockPropertiesPanel,useBlockDocument}.tsx` + `editor/blocks/*` |
| Editor HTML crudo y vista previa en iframe sandbox (escritorio/móvil) | ✅ | `src/components/crm/email/EmailHtmlEditor.tsx`, `EmailPreview.tsx` |
| Compose completo (destinatarios, remitente, adjuntos, programar, IA, plantilla) | ✅ | `src/components/crm/email/ComposeEmailDialogFull.tsx` + `compose/*` |
| `/app/crm/plantillas` (lista + editor a pantalla completa) con pestaña WhatsApp de F16 vía `next/dynamic` | ✅ | `src/app/app/crm/plantillas/**`, `src/components/crm/plantillas/**` |
| Configuración › CRM › Email (dominios/DNS/verificar/por defecto, remitentes, tracking, política, firma) | ✅ | `src/components/configuracion/crm/EmailTab.tsx` + `configuracion/crm/email/*` |
| Tests jest (variables, render por bloque, sanitize, envío, webhook, dominios, baja) | ✅ | `src/lib/services/crm/email/__tests__/*` — 62 tests verdes |

Pendiente de la fase (no entra en ronda 1): sustituir el `EmailDialog` de `ActivityActions.tsx:466-594` y los `mailto:` sueltos por `ComposeEmailDialogFull` (depende de F9), y `EmailPreviewCard` en el timeline (F9).

### 1.2 Correcciones de la ronda 2 (2026-09-08)

Ronda 2 = los 14 fallos del informe del tester (`TEST-F7-r1.md`, 202 casos, 8.0/10). Todos atendidos:

| # | Hallazgo | Estado | Archivo:linea |
|---|---|---|---|
| 1 | **CRITICO** XSS almacenada en `/u/[token]`: `organizations.name` sin escapar en pagina publica sin sesion | ✅ corregido | `email/publicPage.ts:25,47,83` (escape explicito + CSP `default-src 'none'` con el `<style>` por hash + `nosniff`), consumido en `src/app/u/[token]/route.ts:25` |
| 2 | **ALTO** `settings.font` rompia el atributo `style` | ✅ corregido | allow-list zod en `blocks.ts:21,24` (`FONT_STACK_RE`, normaliza al stack por defecto) + revalidacion en el render (`renderBlocks.ts:82,86,90`, `render.ts:44`) |
| 3 | **ALTO** `javascript:` sobrevivia por variable en el motor HTML crudo | ✅ corregido | `sanitize.ts:170,180` (`isSafeUrlValue`/`enforceSafeUrlAttributes`, allow-list http/https/mailto/tel/cid + `data:image` solo en `src`), aplicado en `render.ts:103` y en `renderPrimitives.ts:78` (`varsInHtml`) |
| 4 | **MEDIO** el arreglo de svix no tenia test | ✅ cubierto | `__tests__/svixReal.test.ts` + `__tests__/svixReal.harness.mts` (paquete `svix` REAL en proceso aparte con `tsx`; 7 casos) |
| 5 | **MEDIO** inbound sin cruzar dominio ↔ organizacion | ✅ corregido | `inboundService.ts:56` (`domainMatchesOrg`: `metadata.reply_to` emitido por el servidor → `email_domains` de esa org → dominio global) |
| 6 | **MEDIO** `sendPendingBatch` resolvia un solo remitente (`ready[0]`) | ✅ corregido | `batchService.ts:64,81` (`groupBySender` por `email_domain_id::kind`, un `batch.send` por grupo) |
| 7 | **MEDIO** CAS agotado devolvia 200 en silencio | ✅ corregido | `webhookService.ts:118,232,235` (`applied:false` → se borra la fila de `email_events` y se lanza `WebhookError(503,'transition_conflict')` para que Resend reintente) |
| 8 | **MEDIO** `test-send` a cualquier destinatario y sin rastro | ✅ corregido | `src/app/api/email/templates/[id]/test-send/route.ts:31` (solo el correo del usuario o un dominio de la org, 403 en otro caso) + activity de prueba (`sendService.ts:225`) |
| 9 | **MEDIO** API keys de Resend en texto plano | ✅ mitigado | `domainStore.ts:81,109` AES-256-GCM en reposo (`EMAIL_CREDENTIALS_SECRET`, compatible con filas antiguas). Sin Vault disponible; el riesgo residual queda documentado en §11 |
| 10 | **MEDIO** cero zod en las rutas de email | ✅ corregido | `email/schemas.ts` (nuevo) usado por las 12 rutas con body/query de `/api/email/**` y `crm/ia/draft-email` |
| 11 | **BAJO-MEDIO** pestana WhatsApp sin fallback de error | ✅ corregido | `PlantillasPage.tsx:24,42-45` (`.catch` + comprobacion del export + aviso accesible) |
| 12 | **BAJO** `dmarcRecord` fallaba con `.com.co`/`.co.uk` | ✅ corregido | `domainRules.ts:41,59` (`registrableDomain` con sufijos de segundo nivel) |
| 13 | **BAJO** `<style>` conservado | ✅ decidido | se conserva en el camino SALIENTE (lo escribe un usuario de la org y los clientes de correo lo necesitan) y se DESCARTA en el entrante: `sanitize.ts:88` (`sanitizeInboundHtml`), usado en `inboundService.ts:141` |
| 14 | **BAJO** base64 en linea sin validar | ✅ corregido | `attachments.ts:27` (`decodeInlineBase64`: valida el alfabeto y el padding, calcula bytes REALES y aplica un tope de 25 MB por adjunto) |
| 15 | Ruido: `custom.__amt` en `used[]` | ✅ corregido | `renderBlocks.ts:142-146` (el formateador ya no acumula en `used`) |
| doc | `variables.ts` con 432 lineas (limite 300) | ✅ corregido | dividido en `variables.ts` (274) + `variablesContext.ts` (177); `domainsService.ts` → + `domainRules.ts` |



---

### 1.3 Correcciones de la ronda 3 (2026-09-09)

Ronda 3 = los 8 fallos nuevos del informe `TEST-F7-r2.md` (236 casos, 8,2/10) y los 4 items que ese informe marco como PARCIALES (2, 6, 8, 9). Las lineas de la tabla 1.2 tambien se corrigieron aqui: el tester detecto 6 referencias desplazadas.

| # | Hallazgo r2 | Estado | Archivo:linea | Prueba |
|---|---|---|---|---|
| 1 | **ALTO** el texto LITERAL de las props de bloque (`header.alt`, `image.alt`, `product_card.name`, `button.label`, `footer_legal.company`...) no se escapaba: **7 manejadores `on*` reales** en el HTML enviado y guardado | ✅ corregido | `variables.ts:212,215` (opcion `escapeLiteral`) + `renderPrimitives.ts:53` (`textProp`; en la ronda 3 vivia en `renderBlocks.ts:49`, ver §1.4) usado en las **15** llamadas de `renderBlocks.ts`: `:46,65,82,106,120,121,122,127,135,152,182,183,184,191,200` | `roundThree.test.ts` "r2 #1" — cuenta los `on*` con **htmlparser2**, no con regex |
| 2 | **ALTO** XSS almacenada en el origen de la app: `BlockPreview` inyectaba `blocks_json` sin sanear y con `escapeHtml:false`, fuera del `iframe sandbox=""` | ✅ corregido | `BlockPreview.tsx:38` (`vHtml`: `escapeHtml:true` + saneado) + `editor/blocks/previewSanitize.ts:147` (allow-list sobre `DOMParser`, documento inerte; `:90` etiquetas que se descartan con su contenido; `:138` la degradacion sin `DOMParser`) + defensa en el guardado: `sanitize.ts:120` (`sanitizeBlockDocument`) llamado en `templatesService.ts:76` | 16 vectores en **navegador real**, 0 `alert()` (ver §13.3); parte pura en `roundThree.test.ts` "r2 #2" |
| 3 | **MEDIO** regresion propia: el lote no aislaba fallos entre grupos de remitente (envio parcial silencioso, sin reintento) | ✅ corregido | `batchService.ts:64-72` (try/catch por grupo, `retryable:true`, la funcion ya no lanza una vez empezado el envio) + `lib/jobs/handlers/email.ts:25-31` (`JobRetryableError` en vez de `JobFatalError`) | `roundThree.test.ts` "r2 #3" (4 casos ejecutados de verdad, con `resolveSender` mockeado) |
| 4 | **MEDIO** regresion propia: activar el cifrado destruia en silencio las credenciales guardadas; la UI seguia diciendo que existian | ✅ corregido | `domainStore.ts:71-141` (llavero: formato `encv2:<kid>.<iv>.<tag>.<ct>`, se prueban TODAS las claves, `encv1`/texto plano se siguen leyendo) + `:243` re-cifrado progresivo con la clave principal + `:273` `listDomainKeyStates` → `ok`/`unreadable`, `domainsSupport.ts:63` (`withExtras`, movido en la ronda 4) lo propaga como `api_key_unreadable` y `src/components/configuracion/crm/email/EmailDomainsCard.tsx:64-65` lo muestra | `roundThree.test.ts` "r2 #4" (3 casos) + `adversarialR2.test.ts` |
| 5 | **BAJO-MEDIO** `orgOwnsDomain` aceptaba el dominio PADRE y dominios sin verificar (`crm.gmail.com` autorizaba cualquier `@gmail.com`) | ✅ corregido | `domainsService.ts:45-53` (`.eq('status','verified')` en `:48` y sin la rama del padre) | `roundTwo.test.ts` "orgOwnsDomain" (5 casos, incluida la comprobacion del filtro) |
| 6 | **BAJO** `text.font_size` era el unico numerico sin `Math.trunc` + clamp | ✅ corregido | `renderBlocks.ts:59` (`Math.max(10, Math.min(32, Math.trunc(...) || 15))`) | `roundThree.test.ts` "r2 #6" |
| 7 | **BAJO** `registrableDomain` fallaba fuera de la lista escrita a mano (`com.pl`, `co.in`, `com.tr`) | ✅ ampliado (decision) | `domainRules.ts:33-40,41-66` (lista ampliada; NO se anade la PSL: seria una dependencia nueva y `package.json` es archivo compartido) | `adversarialR2.test.ts`, `roundTwo.test.ts` |
| 8 | **BAJO** ruido y precision: error del `update` descartado, inbound sin `verified`, ids de ruta sin validar como uuid, `logo_url` doblemente escapado, lineas del doc desplazadas | ✅ corregido | `webhookService.ts:155-164` (el `error` del update se propaga al log) · `inboundService.ts:65` (`.eq('status','verified')`) · `zUuid` en **las 9** rutas con `[id]` (`domains/[id]`, `domains/[id]/verify`, `domains/[id]/default`, `messages/[id]`, `messages/[id]/cancel`, `messages/[id]/reply`, `templates/[id]`, `templates/[id]/duplicate`, `templates/[id]/test-send`) · `renderBlocks.ts:45` (`escapeHtml:false`, `safeUrl` escapa una sola vez) · tabla §1.2 reescrita con las lineas reales | `roundThree.test.ts` "r2 #8" |
| 11 | PARCIAL r2: la pestana de WhatsApp degradaba ante un fallo de import pero no ante un throw en render | ✅ completado | `plantillas/TabErrorBoundary.tsx` montado en las dos pestanas (`PlantillasPage.tsx:87,92`) | — |

### 1.4 Correcciones de la ronda 4 (2026-09-09)

Ronda 4 = el informe `TEST-F7-r3.md` (347 casos, 9,0/10), que cerro los 8 fallos y los 4 parciales de r2 y dejo 5 hallazgos nuevos.

| # | Hallazgo r3 | Estado | Archivo:linea | Prueba |
|---|---|---|---|---|
| 1 | **MEDIO** regresion propia del arreglo r3 #1: la parte **`text/plain`** del correo y el **preheader** (la linea que se lee en la bandeja SIN abrir el correo) salian con entidades HTML. Con una empresa llamada `Perez & Asociados` el destinatario veia `Perez &amp; Asociados` y `Ver &quot;oferta&quot;`. Afectaba a `header.alt`, `button.label`, `image.alt`, `product_card.*`, `quote_summary.title`, `footer_legal.*` y al bloque `variable`; `columns` salia bien, y esa inconsistencia era la huella del fallo | ✅ corregido | `renderPrimitives.ts:67` (`plainProp`: misma prop, salida sin escapar) usado en `renderBlocks.ts:47,66,83,107,123,124,125,136,185,186,187,201`; el importe de `quote_summary` se formatea sin escapar para el texto (`:146` el formateador con `escape`, `:154` la salida de texto); `social` interpola el `href` una vez y lo comparte con el texto (`:176,178`); `columns` renderiza una sola vez y deriva las dos salidas de ahi (`:105-116`) | `roundFour.test.ts` (14 casos sobre `text` y preheader; uno de ellos cruza las dos salidas del mismo render) |
| 2 | **BAJO** riesgo de desajuste de hidratacion: `sanitizePreviewHtml` degradaba a texto en el servidor y devolvia marcado en el cliente sobre el mismo `dangerouslySetInnerHTML` | ✅ cerrado | `previewSanitize.ts:138` (`previewTextFallback`, la degradacion ahora es publica y unica) + `BlockPreview.tsx:48` (`useHydrated`) y `:38` (`vHtml` pinta la degradacion hasta que monta, asi el HTML del servidor y el de la primera pasada de cliente coinciden) | `roundFour.test.ts` "r3 #2" (igualdad exacta de las dos salidas) |
| 3 | **BAJO** el aislamiento del lote seguia teniendo una prueba por **expresion regular sobre el codigo fuente** | ✅ borrada | `adversarialR2.test.ts:130-146` (queda solo el comentario que explica por que se quito) | el escenario se ejerce ejecutando `sendPendingBatch` en `roundThree.test.ts` "r2 #3" |
| 4 | **BAJO** afirmacion factualmente incorrecta sobre la BD en el informe `F7-r3.md` (§1.4): decia que `provider_configs(category='email')` estaba vacia | ✅ corregida | consultado por MCP el 2026-09-09: **31 filas** (`provider='resend'`, 31 organizaciones distintas), **0 con credenciales** (`credentials = '{}'`, sin ninguna clave). `email_domains`, `email_messages` y `email_events` siguen a **0 filas** | la conclusion no cambia: no hay nada que migrar, pero la premisa ahora esta medida, no supuesta |
| 5 | **BAJO** higiene: ruta de componente citada a medias, una referencia desplazada una linea y un modulo por encima del tope de 300 lineas | ✅ corregido | `EmailDomainsCard.tsx` con ruta completa e `inboundService.ts:65` en §1.3 · `domainsService.ts` 311 -> **255** lineas (`domainsSupport.ts` nuevo: contratos, DNS, extras, remitente global) · `renderBlocks.ts` 311 -> **222** (`renderPrimitives.ts` nuevo: interpolacion y saneado de valores) | `wc -l` sobre `src/lib/services/crm/email/**` -> ningun modulo > 300 |

**Ademas, encontrado al revisar la salida de texto** (no lo pedia el informe): `columns[].title` y `social[].href` usaban el valor **crudo** de la prop en la parte de texto, asi que las variables no se sustituian ahi; y `htmlFragmentToText`/`htmlToText` encadenaban `.replace()` de entidades, con lo que `&amp;lt;` se decodificaba **dos** veces y acababa en `<`. Las dos cosas estan arregladas (`renderPrimitives.ts:83`, `sanitize.ts:207` `decodeBasicEntities`) y cubiertas en `roundFour.test.ts`.

---

## 2. Arquitectura y flujo

### 2.1 Secuencia de envío individual desde la oportunidad

```
Vendedor (Kanban/drawer/detalle)
  │ 1. QuickActionsBar → <ComposeEmailDialog opportunityId customerId/>
  ▼
ComposeEmailDialog ── GET /api/email/templates?channel=email
  │                 ── GET /api/email/domains (remitentes verificados)
  │                 ── GET /api/email/variables?context=opportunity&id=… (catálogo + valores)
  │                 ── POST /api/email/templates/{id}/preview (render con contexto real)
  │ 2. Enviar (o Programar)
  ▼
POST /api/email/send  (sesión: getServerOrgContext)
  │ a. fn_can_contact(customer_id,'email') = false → 422 CONTACT_OPTED_OUT
  │ b. resolver dominio (org verificado | global GoAdmin) + API key (vault)
  │ c. renderEmail({template|blocks|html, context}) → {html, text, subject, preheader}
  │ d. validar variables faltantes (422 MISSING_VARIABLES si strict)
  │ e. INSERT email_messages (status 'pending' | 'scheduled')  idempotency_key = 'email/{id}'
  │ f. INSERT activities (1 sola, email_message_id)      ← el cliente NO crea otra
  │ g. si scheduled_at → INSERT outbound_jobs kind 'email' run_at=scheduled_at → 202
  │ h. si inmediato → adjuntos (documents signed URL → base64) → resend.emails.send(payload, {idempotencyKey})
  │ i. UPDATE email_messages provider_message_id, status 'sent'
  ▼
Resend ──► destinatario
  │ eventos email.sent/delivered/opened/clicked/bounced/complained/failed/received
  ▼
POST /api/email/webhook (firma svix, raw body)
  │ j. idempotencia provider_event_id → email_events
  │ k. RPC fn_email_apply_event (monótono, contadores atómicos)
  │ l. bounced Permanent / complained → contact_consents opted_out + customers.metadata.do_not_email
  │ m. email.received → emailInboundService.ingest(email_id) → email_messages inbound + activity + notificación + documents
  ▼
UI: timeline (F9) ── GET /api/crm/timeline/opportunity/{id} → EmailPreviewCard (estado, eventos, cuerpo, Responder)
```

### 2.2 Máquina de estados de `email_messages.status`

```
                ┌──────────── cancel ───────────┐
                ▼                               │
 pending ─► scheduled ─► sent ─► delivered ─► opened ─► clicked
    │                    │         │            │          │
    │                    ├─► bounced (terminal) ◄┘──────────┘
    │                    ├─► complained (terminal)
    │                    └─► unsubscribed (terminal, desde /u/{token})
    └─► failed (terminal; reintentable creando nuevo email_message)
 received (solo direction='inbound')
```

Rango numérico usado por `fn_email_apply_event`: pending 0, scheduled 1, sent 2, delivered 3, opened 4, clicked 5; terminales bounced 8, complained 9, unsubscribed 9, failed 8, canceled 8. Regla: `new_rank > current_rank` o evento terminal; nunca se baja de rango. `opened`/`clicked` siempre incrementan contador aunque no cambien el estado.

### 2.3 Modelo de plantillas único

Una sola tabla `templates` para email, WhatsApp y SMS (F16 usa `channel='whatsapp'`). Para email:

- `engine='blocks'`: fuente de verdad `blocks_json`; `body_html` es el render cacheado (se regenera al guardar).
- `engine='html'`: fuente de verdad `body_html` (sanitizado al guardar y al enviar).
- `engine='react'`: plantillas de sistema en `src/emails/*.tsx` (auth, ICS, notificaciones), referenciadas por `metadata.react_key`; no editables desde UI.

---

## 3. Base de datos

Todas las migraciones se aplican SOLO con MCP `apply_migration`. Patrón RLS: el de `calls` (`organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true)`).

Columnas que **ya crea F0** y esta fase asume: `templates.blocks_json jsonb`, `templates.engine text`, `templates.version integer`, `activities.email_message_id uuid`, tabla `contact_consents` + `fn_can_contact(p_customer_id uuid, p_channel text) returns boolean`, tabla `outbound_jobs` + `fn_claim_jobs(p_kind text, p_limit int)`.

### 3.1 Migraciones

#### `202609_crm_v4_f07_templates_email`

```sql
-- CHECKs y columnas de plantillas (blocks_json/engine/version vienen de F0)
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS preheader text,
  ADD COLUMN IF NOT EXISTS body_text text,
  ADD COLUMN IF NOT EXISTS parent_template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE templates SET kind = 'transactional' WHERE kind IS NULL AND channel = 'email';
UPDATE templates SET engine = 'html' WHERE engine IS NULL;

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_channel_check;
ALTER TABLE templates ADD CONSTRAINT templates_channel_check
  CHECK (channel IN ('email','whatsapp','sms'));
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_kind_check;
ALTER TABLE templates ADD CONSTRAINT templates_kind_check
  CHECK (kind IN ('transactional','marketing','sequence','signature','hsm','onboarding'));
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_engine_check;
ALTER TABLE templates ADD CONSTRAINT templates_engine_check
  CHECK (engine IN ('blocks','html','react'));

CREATE UNIQUE INDEX IF NOT EXISTS templates_org_channel_name_version_key
  ON templates (organization_id, channel, lower(name), version);
CREATE INDEX IF NOT EXISTS templates_org_channel_active_idx
  ON templates (organization_id, channel, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS templates_blocks_gin ON templates USING gin (blocks_json jsonb_path_ops);

-- Versionado: al editar una plantilla usada se crea una fila nueva con version+1 y parent_template_id
CREATE OR REPLACE FUNCTION fn_template_touch_usage(p_template_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE templates SET usage_count = usage_count + 1, last_used_at = now() WHERE id = p_template_id;
$$;
```

#### `202609_crm_v4_f07_email_messages_v2`

```sql
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS in_reply_to uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preheader text,
  ADD COLUMN IF NOT EXISTS body_text_snapshot text,
  ADD COLUMN IF NOT EXISTS list_unsubscribe_token text,
  ADD COLUMN IF NOT EXISTS from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_domain_id uuid REFERENCES email_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider_inbound_id text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'transactional';

ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_direction_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_direction_check
  CHECK (direction IN ('outbound','inbound'));
ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_kind_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_kind_check
  CHECK (kind IN ('transactional','marketing','sequence','system'));
ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_status_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_status_check
  CHECK (status IN ('pending','scheduled','sent','delivered','opened','clicked',
                    'bounced','complained','unsubscribed','failed','canceled','received'));

```

Índices de la misma migración:

```sql
UPDATE email_messages SET thread_id = id WHERE thread_id IS NULL;
ALTER TABLE email_messages ALTER COLUMN thread_id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_unsub_token_key
  ON email_messages (list_unsubscribe_token) WHERE list_unsubscribe_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_inbound_key
  ON email_messages (provider_inbound_id) WHERE provider_inbound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS email_messages_related_idx
  ON email_messages (organization_id, related_type, related_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_messages_scheduled_idx
  ON email_messages (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS email_messages_campaign_idx
  ON email_messages (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_events_org_type_idx ON email_events (organization_id, event_type, occurred_at DESC);
```

#### `202609_crm_v4_f07_email_domains_v2` (secretos en `vault`)

```sql
ALTER TABLE email_domains
  ADD COLUMN IF NOT EXISTS api_key_secret_id uuid,          -- vault.secrets.id (nunca el token)
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'us-east-1',
  ADD COLUMN IF NOT EXISTS tracking_subdomain text NOT NULL DEFAULT 'links',
  ADD COLUMN IF NOT EXISTS open_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS click_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receiving_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS provider_status text,             -- estado literal de Resend
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_mode text NOT NULL DEFAULT 'managed';  -- managed | byok

ALTER TABLE email_domains DROP CONSTRAINT IF EXISTS email_domains_status_check;
ALTER TABLE email_domains ADD CONSTRAINT email_domains_status_check
  CHECK (status IN ('pending','verifying','verified','partially_verified','failed','temporary_failure'));
ALTER TABLE email_domains DROP CONSTRAINT IF EXISTS email_domains_region_check;
ALTER TABLE email_domains ADD CONSTRAINT email_domains_region_check
  CHECK (region IN ('us-east-1','eu-west-1','sa-east-1','ap-northeast-1'));
ALTER TABLE email_domains DROP CONSTRAINT IF EXISTS email_domains_key_mode_check;
ALTER TABLE email_domains ADD CONSTRAINT email_domains_key_mode_check CHECK (key_mode IN ('managed','byok'));

CREATE UNIQUE INDEX IF NOT EXISTS email_domains_provider_domain_id_key
  ON email_domains (provider_domain_id) WHERE provider_domain_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_domains_one_default_per_org
  ON email_domains (organization_id) WHERE is_default = true;

```

Funciones de acceso al secreto (misma migración):

```sql
-- Lectura del secreto SOLO desde service role (SECURITY DEFINER, revocado a anon/authenticated)
CREATE OR REPLACE FUNCTION fn_email_domain_api_key(p_domain_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret_id uuid; v_key text;
BEGIN
  SELECT api_key_secret_id INTO v_secret_id FROM email_domains WHERE id = p_domain_id;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION fn_email_domain_api_key(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_email_domain_store_api_key(p_domain_id uuid, p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_id uuid;
BEGIN
  SELECT vault.create_secret(p_token, 'resend_domain_' || p_domain_id::text) INTO v_id;
  UPDATE email_domains SET api_key_secret_id = v_id, updated_at = now() WHERE id = p_domain_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION fn_email_domain_store_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
```

#### `202609_crm_v4_f07_email_signatures`

```sql
CREATE TABLE IF NOT EXISTS email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Principal',
  blocks_json jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  body_html text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_signatures_default_key
  ON email_signatures (organization_id, user_id) WHERE is_default = true;
ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS es_select ON email_signatures;
CREATE POLICY es_select ON email_signatures FOR SELECT USING (
  organization_id IN (SELECT om.organization_id FROM organization_members om
                      WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS es_write ON email_signatures;
CREATE POLICY es_write ON email_signatures FOR ALL
  USING (user_id = auth.uid() AND organization_id IN (SELECT om.organization_id FROM organization_members om
         WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (user_id = auth.uid());
```

Política de email por organización: se añade a `comm_settings` (ya existe, RLS select+update) en vez de crear tabla:

```sql
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS email_fallback_policy text NOT NULL DEFAULT 'global_with_notice',
  ADD COLUMN IF NOT EXISTS email_monthly_quota integer,           -- NULL = sin límite propio
  ADD COLUMN IF NOT EXISTS email_sent_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_tracking_transactional boolean NOT NULL DEFAULT false;
ALTER TABLE comm_settings DROP CONSTRAINT IF EXISTS comm_settings_email_fallback_check;
ALTER TABLE comm_settings ADD CONSTRAINT comm_settings_email_fallback_check
  CHECK (email_fallback_policy IN ('global_with_notice','global_silent','block'));
```

#### `202609_crm_v4_f07_email_functions` (máquina de estados + contadores atómicos + baja)

```sql
CREATE OR REPLACE FUNCTION fn_email_status_rank(p_status text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'pending' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3
    WHEN 'opened' THEN 4 WHEN 'clicked' THEN 5
    WHEN 'failed' THEN 8 WHEN 'canceled' THEN 8 WHEN 'bounced' THEN 8
    WHEN 'complained' THEN 9 WHEN 'unsubscribed' THEN 9 ELSE 0 END $$;

CREATE OR REPLACE FUNCTION fn_email_apply_event(
  p_email_message_id uuid, p_event_type text, p_occurred_at timestamptz, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS email_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new text; v_row email_messages; v_bounce text;
BEGIN
  v_new := CASE p_event_type
    WHEN 'email.sent' THEN 'sent' WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.opened' THEN 'opened' WHEN 'email.clicked' THEN 'clicked'
    WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained'
    WHEN 'email.failed' THEN 'failed' WHEN 'email.scheduled' THEN 'scheduled'
    WHEN 'email.suppressed' THEN 'failed' ELSE NULL END;
  v_bounce := lower(coalesce(p_payload #>> '{data,bounce,type}', ''));   -- Permanent | Temporary
  UPDATE email_messages SET
    status = CASE WHEN v_new IS NOT NULL AND (fn_email_status_rank(v_new) > fn_email_status_rank(status)
                   OR fn_email_status_rank(v_new) >= 8) AND fn_email_status_rank(status) < 8
                  THEN v_new ELSE status END,
    delivered_at   = CASE WHEN v_new = 'delivered' THEN coalesce(delivered_at, p_occurred_at) ELSE delivered_at END,
    first_opened_at= CASE WHEN v_new = 'opened' THEN coalesce(first_opened_at, p_occurred_at) ELSE first_opened_at END,
    open_count     = open_count + CASE WHEN v_new = 'opened' THEN 1 ELSE 0 END,
    first_clicked_at=CASE WHEN v_new = 'clicked' THEN coalesce(first_clicked_at, p_occurred_at) ELSE first_clicked_at END,
    click_count    = click_count + CASE WHEN v_new = 'clicked' THEN 1 ELSE 0 END,
    bounced_at     = CASE WHEN v_new = 'bounced' THEN coalesce(bounced_at, p_occurred_at) ELSE bounced_at END,
    bounce_type    = CASE WHEN v_new = 'bounced' THEN (CASE WHEN v_bounce = 'permanent' THEN 'hard' ELSE 'soft' END) ELSE bounce_type END,
    complained_at  = CASE WHEN v_new = 'complained' THEN coalesce(complained_at, p_occurred_at) ELSE complained_at END,
    failed_at      = CASE WHEN v_new = 'failed' THEN coalesce(failed_at, p_occurred_at) ELSE failed_at END,
    last_error     = CASE WHEN v_new = 'failed' THEN coalesce(p_payload #>> '{data,failed,reason}', p_payload #>> '{data,bounce,message}') ELSE last_error END,
    updated_at = now()
  WHERE id = p_email_message_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION fn_email_apply_event(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
```

Nota: un `bounced` con `bounce.type='Temporary'` (soft) NO debe ser terminal. El servicio llama a la RPC solo con `email.bounced` cuando `type='Permanent'`; para `Temporary` inserta el `email_events` y deja el estado (ver §4.3).

```sql
-- Baja pública: la verificación del token firmado ocurre en Node; la RPC solo aplica el efecto
CREATE OR REPLACE FUNCTION fn_email_unsubscribe(p_email_message_id uuid, p_source text DEFAULT 'list_unsubscribe')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_msg email_messages;
BEGIN
  SELECT * INTO v_msg FROM email_messages WHERE id = p_email_message_id;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE email_messages SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now()
   WHERE id = v_msg.id;
  IF v_msg.to_customer_id IS NOT NULL THEN
    INSERT INTO contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
    VALUES (v_msg.organization_id, v_msg.to_customer_id, 'email', 'opted_out', p_source,
            jsonb_build_object('email_message_id', v_msg.id, 'to_email', v_msg.to_email), now())
    ON CONFLICT (organization_id, customer_id, channel) DO UPDATE
      SET status = 'opted_out', source = EXCLUDED.source, evidence = EXCLUDED.evidence, changed_at = now();
    UPDATE customers SET metadata = coalesce(metadata,'{}'::jsonb) ||
      jsonb_build_object('do_not_email', true, 'email_suppressed_reason', p_source, 'email_suppressed_at', now())
     WHERE id = v_msg.to_customer_id AND organization_id = v_msg.organization_id;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION fn_email_unsubscribe(uuid, text) FROM PUBLIC, anon, authenticated;
```

`contact_consents` (F0) debe tener `UNIQUE (organization_id, customer_id, channel)`; si F0 no lo creó, esta migración lo añade con `CREATE UNIQUE INDEX IF NOT EXISTS contact_consents_org_customer_channel_key`.

Contador mensual (para cuota por org):

```sql
CREATE OR REPLACE FUNCTION fn_email_reserve_quota(p_org_id integer, p_count integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quota integer; v_used integer;
BEGIN
  SELECT email_monthly_quota, email_sent_this_month INTO v_quota, v_used
    FROM comm_settings WHERE organization_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;                 -- sin comm_settings = sin cuota propia
  IF v_quota IS NOT NULL AND v_used + p_count > v_quota THEN RETURN false; END IF;
  UPDATE comm_settings SET email_sent_this_month = email_sent_this_month + p_count WHERE organization_id = p_org_id;
  RETURN true;
END $$;
-- pg_cron (F0 crea el job runner): reset mensual
SELECT cron.schedule('crm-email-quota-reset', '10 0 1 * *',
  $$UPDATE comm_settings SET email_sent_this_month = 0$$);
```

### 3.2 Seeds

6 plantillas base en español por organización, `engine='blocks'`, `kind='transactional'` salvo "reactivación" (`marketing`), `is_system=true` (no borrables, sí duplicables). Se siembran con `fn_seed_email_templates(p_org_id)` invocada al activar el módulo CRM (`src/app/api/modules/route.ts`, donde ya se provisionan pipelines) y una vez para las orgs existentes.

| name | kind | subject | bloques principales |
|---|---|---|---|
| Seguimiento tras llamada | transactional | `Gracias por tu tiempo, {{contact.first_name\|hola}}` | header, text (resumen `{{custom.summary}}`), text (próximos pasos), button "Agendar siguiente paso", signature, footer_legal |
| Propuesta enviada | transactional | `Propuesta {{opportunity.name}} para {{org.name}}` | header, text, quote_summary, button "Ver propuesta" (`{{quote.url}}`), signature, footer_legal |
| Recordatorio de demo | transactional | `Tu demo es {{custom.demo_date\|pronto}}` | header, text, button "Unirme a la demo" (`{{custom.meeting_url}}`), divider, text (qué preparar), signature, footer_legal |
| Reactivación | marketing | `¿Seguimos, {{contact.first_name\|hola}}?` | header, text, product_card, button, social, footer_legal (unsubscribe obligatorio) |
| Agradecimiento por cierre | transactional | `¡Bienvenido a {{org.name}}!` | header, text, columns(2: qué sigue / tu contacto), signature, footer_legal |
| Cobro amable | transactional | `Recordatorio: pago pendiente {{opportunity.name}}` | header, text (`{{opportunity.amount\|money}}`), button "Pagar ahora" (`{{custom.payment_url}}`), text (soporte), signature, footer_legal |

Ejemplo del seed (bloques abreviados; el resto sigue el mismo shape):

```sql
INSERT INTO templates (organization_id, name, channel, kind, engine, subject, preheader, body_html, variables, blocks_json, is_active, is_system, version)
SELECT p_org_id, 'Seguimiento tras llamada', 'email', 'transactional', 'blocks',
  'Gracias por tu tiempo, {{contact.first_name|hola}}', 'Resumen y próximos pasos de nuestra conversación', '',
  ARRAY['contact.first_name','custom.summary','custom.next_step_url','user.first_name','org.name'],
  '{"version":1,"settings":{"width":600,"bg":"#f4f5f7","font":"Inter, Arial, sans-serif","brand":{"primary":"#2563eb","logo_url":"{{org.logo_url}}"}},
    "blocks":[
      {"id":"b1","type":"header","props":{"logo_url":"{{org.logo_url}}","alt":"{{org.name}}","align":"left"}},
      {"id":"b2","type":"text","props":{"html":"<p>Hola {{contact.first_name|hola}},</p><p>Gracias por la llamada de hoy. Te dejo el resumen:</p><p>{{custom.summary}}</p>"}},
      {"id":"b3","type":"button","props":{"label":"Agendar siguiente paso","href":"{{custom.next_step_url}}","style":"primary"}},
      {"id":"b4","type":"signature","props":{"source":"user_default"}},
      {"id":"b5","type":"footer_legal","props":{"address":"{{org.address}}","unsubscribe":false}}]}'::jsonb,
  true, true, 1
WHERE NOT EXISTS (SELECT 1 FROM templates WHERE organization_id = p_org_id AND channel='email' AND name='Seguimiento tras llamada');
```

`body_html` vacío en el seed se rellena la primera vez que el servicio renderiza (cache lazy: `emailTemplateService.ensureRendered`).

### 3.3 Verificación post-migración

```sql
SELECT count(*) FROM information_schema.columns WHERE table_name='email_messages'
  AND column_name IN ('direction','in_reply_to','thread_id','attachments','preheader','list_unsubscribe_token','campaign_id'); -- 7
SELECT count(*) FROM information_schema.columns WHERE table_name='email_domains'
  AND column_name IN ('api_key_secret_id','region','tracking_subdomain','receiving_enabled','key_mode');          -- 5
SELECT proname FROM pg_proc WHERE proname IN ('fn_email_apply_event','fn_email_unsubscribe','fn_email_domain_api_key',
  'fn_email_domain_store_api_key','fn_email_reserve_quota','fn_template_touch_usage','fn_seed_email_templates');      -- 7 filas
SELECT has_function_privilege('anon','fn_email_domain_api_key(uuid)','EXECUTE');                                    -- false
SELECT count(*) FROM templates WHERE organization_id = :org AND channel='email' AND is_system;                       -- 6
SELECT (fn_email_apply_event(:msg,'email.opened',now(),'{}')).status;  -- tras 'email.clicked' sigue 'clicked'
SELECT jobname FROM cron.job WHERE jobname='crm-email-quota-reset';                                                 -- 1
```

### 3.4 Impacto en tablas existentes

- `notification_templates`: se deja de usar para correos del CRM (sigue en notificaciones de sistema). No se migra.
- `email_messages.template_id` pasa a apuntar a `templates.id` (uuid local); `body_html_snapshot` guarda el render final SIEMPRE (auditoría).
- `email_domains.credential_id` (→ `integration_credentials`) queda deprecado; se usa `api_key_secret_id` (vault).
- `customers.metadata.do_not_email` se mantiene como caché de lectura rápida; la fuente de verdad es `contact_consents`.
- `activities`: el servicio escribe `channel='email'`, `email_message_id`, `metadata{subject,to,status}`; la UI ya no crea actividades manuales de email.

---

## 4. Backend

### 4.1 Endpoints

Auth "sesión" = `getServerOrgContext()` (orgId nunca del body). Errores en JSON `{success:false, error, code}`.

| Método | Ruta | Auth | Body / query (TS) | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| POST | `/api/email/send` | sesión | `SendEmailRequest` (§4.2) | 201 `{data: EmailMessage}` / 202 si programado | 400 VALIDATION, 422 CONTACT_OPTED_OUT / MISSING_VARIABLES / NO_SENDER / QUOTA_EXCEEDED / ATTACHMENTS_TOO_LARGE, 502 PROVIDER | `client_request_id` (uuid del cliente) → `email_messages.metadata.client_request_id` único por org; `idempotency_key='email/{email_message_id}'` hacia Resend |
| GET | `/api/email/templates` | sesión | `?channel=email&kind=&q=&active=true&page=` | `{data: TemplateSummary[], total}` | – | – |
| POST | `/api/email/templates` | sesión | `CreateTemplateInput` | 201 `{data: Template}` | 400, 409 NAME_EXISTS | – |
| GET/PATCH/DELETE | `/api/email/templates/[id]` | sesión + ownership | `UpdateTemplateInput` | `{data}` | 404, 409 SYSTEM_TEMPLATE (delete), 422 INVALID_BLOCKS | PATCH sobre plantilla con `usage_count>0` crea versión nueva (`version+1`, `parent_template_id`) y desactiva la anterior |
| POST | `/api/email/templates/[id]/preview` | sesión | `{context: RenderContextRef, overrides?: {blocks_json?, body_html?, subject?}}` | `{html, text, subject, preheader, missing: string[]}` | 404, 422 | – |
| POST | `/api/email/templates/[id]/test-send` | sesión | `{to: string, context: RenderContextRef}` | 201 `{data: EmailMessage}` | como send | `kind='system'`, tag `test:true`, sin activity |
| POST | `/api/email/templates/[id]/duplicate` | sesión | `{name?: string}` | 201 | 404 | – |
| GET | `/api/email/variables` | sesión | `?context=opportunity\|customer&id=uuid` | `{catalog: VariableDef[], values: Record<string,unknown>}` | 404 | – |
| GET/POST | `/api/email/domains` | sesión (rol admin de la org) | `CreateEmailDomainInput` | 201 `{data: EmailDomain}` (con `dns_records`) | 400 INVALID_DOMAIN, 409 DOMAIN_EXISTS, 502 PROVIDER | POST idempotente por `(organization_id, domain)` |
| GET/PATCH/DELETE | `/api/email/domains/[id]` | sesión admin | `{from_name?, from_email?, reply_to?, is_default?, open_tracking?, click_tracking?, receiving_enabled?}` | `{data}` | 404 | PATCH propaga tracking a Resend `domains.update` |
| POST | `/api/email/domains/[id]/verify` | sesión admin | – | `{data: EmailDomain}` (status tras `domains.verify` + `domains.get`) | 404, 502 | Reintentable |
| GET | `/api/email/domains/[id]/dns` | sesión | – | `{records: DnsRecord[], dmarc_suggested: DnsRecord}` | 404 | – |
| GET/POST/PATCH | `/api/email/signatures` | sesión | `{name, blocks_json, is_default}` | `{data}` | – | – |
| GET | `/api/email/messages` | sesión | `?related_type&related_id&status&direction&page` | `{data: EmailMessage[], total}` | – | – |
| GET | `/api/email/messages/[id]` | sesión + ownership | – | `{data: EmailMessage & {events: EmailEvent[]}}` | 404 | – |
| GET | `/api/email/messages/[id]/events` | sesión | – | `{data: EmailEvent[]}` | 404 | – |
| POST | `/api/email/messages/[id]/reply` | sesión | `SendEmailRequest` parcial (`html\|blocks`, `attachments?`) | 201 | 404 | Fija `in_reply_to`, `thread_id`, header `In-Reply-To`/`References` |
| POST | `/api/email/messages/[id]/cancel` | sesión | – | `{data}` | 409 NOT_SCHEDULED | `resend.emails.cancel(provider_message_id)` + job `dead` |
| POST | `/api/email/webhook` | firma svix (raw body) | payload Resend | 200 `{processed}` | 401 firma, 200 con `processed:false` si desconocido | `provider_event_id = svix-id` |
| GET | `/u/[token]` | pública (token firmado) | – | página HTML de confirmación | 404 token inválido | – |
| POST | `/u/[token]` | pública (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) | form vacío | 200 | 404 | idempotente |
| POST | `/api/crm/ia/draft-email` | sesión | `{opportunityId, tone, goal, templateId?, language?}` | `{subject, preheader, blocks, plain_text, tokens, credits_used}` | 402 NO_CREDITS, 404 | – |
| POST | `/api/crm/ia/improve-text` | sesión | `{text, instruction: 'shorter'\|'formal'\|'friendly'\|'fix'\|string}` | `{text}` | 402 | – |
| POST | `/api/crm/jobs/run` (F0) handler `kind='email'` | cron `CRON_SECRET` | `outbound_jobs.payload` §4.4 | – | – | `dedupe_key='email/{email_message_id}'` |

`/u/[token]` y `/api/email/webhook` se añaden a la lista de rutas públicas de `src/middleware.ts` (junto a `:84`), con `runtime='nodejs'` para leer raw body.

### 4.2 Servicios

Todos en `src/lib/services/crm/email/` (se parte el `emailService.ts` de 815L). Server-only (`import 'server-only'`), reciben `SupabaseClient` explícito.

#### `emailService.ts` (orquestador; ≤300L)

```ts
export interface SendEmailRequest {
  to: string[];                       // ≤50 total con cc/bcc
  cc?: string[]; bcc?: string[];
  to_customer_id?: string;
  from_domain_id?: string;            // dominio verificado de la org; si falta, resolveSender decide
  from_user_id?: string;              // firma + reply routing
  subject: string; preheader?: string;
  content: { template_id: string; variables?: Record<string, unknown> }
         | { blocks: BlockDocument; variables?: Record<string, unknown> }
         | { html: string; text?: string; variables?: Record<string, unknown> };
  attachments?: Array<{ document_id: string } | { filename: string; content_base64: string; content_type: string }>;
  related_type?: 'opportunity' | 'customer' | 'quotation' | 'contract';
  related_id?: string;
  kind?: 'transactional' | 'marketing' | 'sequence' | 'system';
  scheduled_at?: string;              // ISO, ≤30 días
  sequence_step_run_id?: string; campaign_id?: string;
  client_request_id?: string;         // idempotencia desde UI
  strict_variables?: boolean;         // default true en UI, false en secuencias
  tags?: Array<{ name: string; value: string }>;
  metadata?: Record<string, unknown>;
}
export interface SendEmailResult { message: EmailMessage; scheduled: boolean; warnings: string[] }

export async function sendEmail(orgId: number, userId: string | null, req: SendEmailRequest, supabase: SupabaseClient): Promise<SendEmailResult>;
export async function sendEmailBatch(orgId: number, reqs: SendEmailRequest[], supabase: SupabaseClient): Promise<{ sent: string[]; failed: Array<{ index: number; error: string }> }>; // ≤100, sin adjuntos
export async function dispatchScheduledEmail(emailMessageId: string, service: SupabaseClient): Promise<void>;   // llamado por job 'email'
export async function cancelScheduledEmail(orgId: number, emailMessageId: string, supabase: SupabaseClient): Promise<EmailMessage>;
export async function replyToEmail(orgId: number, userId: string, emailMessageId: string, req: Partial<SendEmailRequest>, supabase: SupabaseClient): Promise<SendEmailResult>;
export function buildIdempotencyKey(emailMessageId: string): string; // 'email/{id}'
```

Orden interno de `sendEmail` (cada paso falla cerrado): validar → `fn_can_contact` → `resolveSender` → `renderEmail` → `validateVariables` → `fn_email_reserve_quota` → INSERT `email_messages` (+`list_unsubscribe_token` si `kind='marketing'`) → INSERT `activities` (1) → si `scheduled_at` encolar y devolver → adjuntos → `resend.emails.send` → UPDATE. El cliente **nunca** crea la actividad (cierra C15).

#### `emailRenderService.ts` (≤300L + `render/blocks/*.tsx`)

```ts
export type RenderSource = { template: Template } | { blocks: BlockDocument } | { html: string; text?: string };
export interface RenderContext { contact: ContactCtx; opportunity?: OpportunityCtx; org: OrgCtx; user?: UserCtx; quote?: QuoteCtx; custom: Record<string, unknown>; unsubscribe_url?: string }
export interface RenderOutput { html: string; text: string; subject: string; preheader: string; missing: string[]; used: string[] }

export async function renderEmail(source: RenderSource, ctx: RenderContext, opts?: { subject?: string; preheader?: string; inlineCss?: boolean; strict?: boolean }): Promise<RenderOutput>;
export function interpolate(input: string, ctx: RenderContext, opts?: { escapeHtml: boolean }): { out: string; missing: string[]; used: string[] };
export function sanitizeHtml(html: string): string;             // sanitize-html con allow-list de email
export async function buildRenderContext(orgId: number, ref: RenderContextRef, supabase: SupabaseClient): Promise<RenderContext>;
export const VARIABLE_CATALOG: VariableDef[];                     // {path, label, group, example, format?}
```

Sintaxis de variables (propia, sin Handlebars): `{{path}}`, `{{path|default}}`, `{{path|money}}`, `{{path|date}}`, `{{path|date:short}}`, `{{path|upper}}`, `{{path|raw}}` (solo permitido en `engine='html'` y bloques `text` para HTML de confianza generado por el propio editor; nunca para valores de contacto). Escape HTML por defecto en todo lo demás. `money` usa `opportunity.currency` (fallback `org.currency`) con `Intl.NumberFormat('es-CO')`; `date` usa `Intl.DateTimeFormat('es-CO', {timeZone: org.timezone})`.

Catálogo (`VARIABLE_CATALOG`): `contact.{first_name,last_name,full_name,email,phone,company_name}`, `opportunity.{name,amount,currency,expected_close_date,stage_name,pipeline_name,next_action,url}`, `org.{name,logo_url,address,phone,website,currency,timezone}`, `user.{first_name,last_name,full_name,email,phone,job_title,signature_html}`, `quote.{number,total,currency,valid_until,url,items_html}`, `custom.*` (libre, declarado por plantilla en `variables[]`).

#### `emailTemplateService.ts`

```ts
export async function listTemplates(orgId, filters: { channel?: 'email'|'whatsapp'|'sms'; kind?; q?; active?; page? }, supabase): Promise<{ data: TemplateSummary[]; total: number }>;
export async function getTemplate(orgId, id, supabase): Promise<Template | null>;
export async function createTemplate(orgId, userId, input: CreateTemplateInput, supabase): Promise<Template>;   // valida BlockDocument con zod, renderiza y cachea body_html
export async function updateTemplate(orgId, userId, id, input: UpdateTemplateInput, supabase): Promise<Template>; // versiona si usage_count>0
export async function duplicateTemplate(orgId, userId, id, name?, supabase): Promise<Template>;
export async function deleteTemplate(orgId, id, supabase): Promise<void>;   // 409 si is_system; soft: is_active=false si usage_count>0
export async function ensureRendered(template: Template, supabase): Promise<Template>;
export const BlockDocumentSchema: z.ZodType<BlockDocument>;                  // en render/blockSchema.ts, compartido con UI
```

#### `emailDomainService.ts`

```ts
export async function createDomain(orgId, input: { domain: string; region?: Region; from_name: string; from_email_local: string; reply_to?: string; key_mode?: 'managed'|'byok'; byok_token?: string }, supabase): Promise<EmailDomain>;
export async function verifyDomain(orgId, id, supabase): Promise<EmailDomain>;
export async function refreshDomainFromProvider(providerDomainId: string, service: SupabaseClient): Promise<void>;   // webhook domain.updated
export async function updateTracking(orgId, id, patch: { open_tracking?; click_tracking?; receiving_enabled? }, supabase): Promise<EmailDomain>;
export async function deleteDomain(orgId, id, supabase): Promise<void>;     // resend.domains.remove + apiKeys.remove
export async function resolveSender(orgId, opts: { domainId?: string; userId?: string | null; kind: EmailKind }, supabase): Promise<ResolvedSender>;
export interface ResolvedSender { mode: 'org'|'global'; domain: EmailDomain | null; from: string; replyTo: string; apiKey: string; notice: string | null }
export function getResendClient(apiKey: string): Resend;                    // cache por key (WeakMap/LRU 50)
```

`resolveSender`: 1) dominio `is_default` verificado de la org (o el `domainId` pedido si verificado); 2) si no hay, lee `comm_settings.email_fallback_policy`: `block` → 422 NO_SENDER; `global_*` → `EMAIL_GLOBAL_DOMAIN` con `from = "{org.name} vía GoAdmin <{slug}@{EMAIL_GLOBAL_DOMAIN}>"`, `reply_to = user.email` y `notice` para el bloque `footer_legal` ("Enviado vía GoAdmin en nombre de {org.name}") salvo `global_silent`.

#### `emailInboundService.ts`

```ts
export async function ingestReceivedEmail(resendEmailId: string, toAddresses: string[], service: SupabaseClient): Promise<{ email_message_id: string | null; reason?: string }>;
export function parseReplyAddress(address: string): { email_message_id: string } | null;   // crm+{uuid}@crm.dominio
export async function storeInboundAttachments(orgId, emailMessageId, atts: ReceivedAttachment[], service): Promise<string[]>; // documents ids
```

#### `emailUnsubscribeService.ts`

```ts
export function signUnsubscribeToken(emailMessageId: string, customerId: string | null): string;   // base64url(payload).hmac-sha256(EMAIL_UNSUBSCRIBE_SECRET) truncado 32
export function verifyUnsubscribeToken(token: string): { email_message_id: string; customer_id: string | null } | null; // timingSafeEqual
export async function applyUnsubscribe(token: string, source: 'list_unsubscribe'|'one_click'|'page', service): Promise<boolean>; // RPC fn_email_unsubscribe
```

#### `aiEmailDraftService.ts` (en `src/lib/services/crm/ai/`)

```ts
export interface DraftEmailInput { opportunityId: string; tone: 'formal'|'cercano'|'directo'|'entusiasta'; goal: 'seguimiento'|'propuesta'|'demo'|'reactivar'|'cobrar'|'agradecer'|'custom'; customGoal?: string; templateId?: string; language?: 'es'|'en' }
export interface DraftEmailOutput { subject: string; preheader: string; blocks: Block[]; plain_text: string; usage: { prompt_tokens: number; completion_tokens: number }; credits_used: number }
export async function draftEmail(orgId, userId, input: DraftEmailInput, supabase): Promise<DraftEmailOutput>;
export async function improveText(orgId, userId, text: string, instruction: string, supabase): Promise<string>;
```

### 4.3 Webhook Resend: verificación y mapeo

Ruta `src/app/api/email/webhook/route.ts` (existente, se mantiene) → `handleEmailWebhook` refactorizado:

1. `const raw = await request.text()`; headers `svix-id`, `svix-timestamp`, `svix-signature` (el código actual lee `webhook-*`: Resend documenta `svix-*`; se aceptan ambos). Verificación con `svix` (`new Webhook(RESEND_WEBHOOK_SECRET).verify(raw, headers)`); fallo → 401. Sin secreto → 500 (fail-closed).
2. `provider_event_id = headers['svix-id']` (único por entrega; sustituye el compuesto `type-email_id-created_at` de `:692`). INSERT `email_events` con `ON CONFLICT (provider_event_id) DO NOTHING`; si 0 filas → 200 `{processed:false, duplicate:true}`.
3. Resolver `email_messages` por `data.email_id` = `provider_message_id`. Si no existe y `type='email.received'` → paso 6. Si no existe y es otro tipo → 200 `processed:false` (puede ser un correo enviado por el dominio global desde otra app).
4. Mapeo `type → fn_email_apply_event` (tabla). `email.bounced` con `data.bounce.type='Temporary'` no cambia estado (solo evento y `metadata.soft_bounces += 1`). `email.delivery_delayed` solo evento.
5. Post-efectos: `bounced Permanent` o `complained` → `fn_email_unsubscribe(msg.id, 'hard_bounce'|'complaint')`; `clicked` → `fn_campaign_mark_clicked` si `campaign_id`; `opened` → `fn_campaign_mark_opened`; `delivered/bounced` → `fn_campaign_mark_*`.
6. `email.received`: `data.to[]` contiene `crm+{uuid}@crm.{dominio}` → `ingestReceivedEmail(data.email_id, data.to, service)`: `resend.emails.receiving.get(email_id, {html_format: 'cid'})` → INSERT `email_messages {direction:'inbound', status:'received', provider_inbound_id, in_reply_to, thread_id (del original), from_email, to_email, subject, body_html_snapshot (sanitizado), body_text_snapshot, received_at, related_type/related_id (heredados), to_customer_id (heredado o match por from_email en customers de la org)}` → INSERT `activities {activity_type:'email', channel:'email', email_message_id, notes: subject, user_id: salesperson}` → `fn_create_org_notification(org, salesperson_id, 'app', 'email_reply', 'Respondió {contact}', preview)` → adjuntos: `resend.emails.receiving.attachments.get(email_id, attachment_id)` → `documents` (bucket `crm-documents`, `related_type='opportunity'`, `related_id`, `tags:['email','inbound']`). Si el `to` no parsea, se busca `thread_id` por header `In-Reply-To` (`headers['in-reply-to']` contiene `<{email_message_id}@crm.{dominio}>` porque se envía `Message-ID` propio) y si tampoco, se crea inbound sin relación (bandeja "Sin asignar" en F9).
7. Eventos de dominio: `domain.updated` → `refreshDomainFromProvider(data.id)` → `resend.domains.get(id)` → `status`, `dns_records`, `verified_at`.

Payload real de referencia (`email.clicked`):

```json
{"type":"email.clicked","created_at":"2026-09-08T14:02:11.401Z",
 "data":{"email_id":"56761188-7520-42d8-8898-ff6fc54ce618","from":"Ana <ana@crm.acme.co>","to":["cliente@empresa.com"],
   "subject":"Propuesta Plan Pro para Empresa","tags":{"tenant_id":"42","related":"opportunity:9c1e...","email_message_id":"3f7b..."},
   "click":{"ipAddress":"190.24.1.1","link":"https://app.goadmin.io/p/abc","timestamp":"2026-09-08T14:02:10.000Z","userAgent":"Mozilla/5.0"}}}
```

Nota de docs-resend.md: `tags` llega como **objeto** `{key:value}`, no como array.

### 4.4 Jobs / cola (`outbound_jobs`, F0)

| kind | payload | dedupe_key | reintentos | handler |
|---|---|---|---|---|
| `email` | `{email_message_id}` | `email/{email_message_id}` | 5; backoff 1m, 5m, 15m, 1h, 6h; 429 usa `retry-after`; 4xx no-429 → `dead` + `email_messages.status='failed'` | `dispatchScheduledEmail` |
| `email_batch` | `{campaign_id, email_message_ids: string[≤100]}` | `email_batch/{campaign_id}/{batch_no}` | 5 (mismo backoff); respuesta parcial: ids sin `id` devuelto → reencolar individual como `email` | `sendEmailBatch` (F16 los produce) |
| `email_inbound` | `{resend_email_id, to: string[]}` | `email_inbound/{resend_email_id}` | 3 (Resend guarda el correo; `download_url` 1h) | `ingestReceivedEmail` (el webhook encola y responde 200 rápido) |

Rate limit 10 req/s (docs-resend.md): token bucket en memoria del job runner (`src/lib/jobs/rateLimiter.ts`, capacidad 10, refill 10/s) compartido por todos los handlers de email de la misma invocación; `fn_claim_jobs('email', 40)` por corrida de 1 minuto (con Vercel `maxDuration=60`). Un 429 aplica `retry-after` a **todo** el lote restante (se reencola con `run_at = now() + retry_after`).

### 4.5 Snippets no obvios

Envío con Resend (nombres verificados en docs-resend.md):

```ts
const resend = getResendClient(sender.apiKey);
const payload = {
  from: sender.from,                                  // "Ana Gómez <ana@crm.acme.co>"
  to: req.to, cc: req.cc, bcc: req.bcc,
  reply_to: `crm+${msg.id}@crm.${sender.domain?.domain ?? EMAIL_GLOBAL_DOMAIN}`,
  subject: rendered.subject,
  html: rendered.html, text: rendered.text,
  headers: {
    'Message-ID': `<${msg.id}@crm.${domainHost}>`,
    ...(msg.in_reply_to ? { 'In-Reply-To': `<${msg.in_reply_to}@crm.${domainHost}>`, References: `<${msg.thread_id}@crm.${domainHost}>` } : {}),
    ...(msg.kind === 'marketing' ? {
      'List-Unsubscribe': `<mailto:unsubscribe@crm.${domainHost}?subject=unsub-${msg.list_unsubscribe_token}>, <${APP_URL}/u/${msg.list_unsubscribe_token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    } : {}),
  },
  tags: [
    { name: 'tenant_id', value: String(orgId) },
    { name: 'email_message_id', value: msg.id },
    ...(req.related_type ? [{ name: 'related', value: `${req.related_type}:${req.related_id}` }] : []),
  ],
  attachments: attachments.map(a => ({ filename: a.filename, content: a.base64, content_type: a.content_type })),
  ...(req.scheduled_at ? { scheduled_at: req.scheduled_at } : {}),
};
const { data, error } = await resend.emails.send(payload, { idempotencyKey: buildIdempotencyKey(msg.id) });
```

Decisión: `scheduled_at` de Resend se usa SOLO para ventanas ≤ 1 h (permite cancelar con `resend.emails.cancel`); ventanas mayores se guardan como `status='scheduled'` + job `email` con `run_at` (evita que un cambio de plantilla o una baja posterior llegue tarde: el job vuelve a comprobar `fn_can_contact` antes de enviar).

Adjuntos desde `documents` (bucket privado `crm-documents`):

```ts
async function loadAttachments(orgId: number, items: SendEmailRequest['attachments'], supabase: SupabaseClient) {
  const out: Array<{ filename: string; base64: string; content_type: string; bytes: number }> = [];
  for (const it of items ?? []) {
    if ('document_id' in it) {
      const doc = await getDocument(it.document_id, orgId, supabase);          // documentService.ts:143 (valida org)
      if (!doc) throw new EmailError('ATTACHMENT_NOT_FOUND', it.document_id);
      const url = await getDownloadUrl(doc.id, orgId, supabase);                 // documentService.ts:297 (signed 1h)
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      out.push({ filename: doc.name, base64: buf.toString('base64'), content_type: doc.mime_type ?? 'application/octet-stream', bytes: buf.length });
    } else {
      out.push({ filename: it.filename, base64: it.content_base64, content_type: it.content_type, bytes: Math.floor(it.content_base64.length * 0.75) });
    }
  }
  const total = out.reduce((s, a) => s + a.bytes, 0) + Buffer.byteLength(renderedHtml);
  if (total > 40 * 1024 * 1024) throw new EmailError('ATTACHMENTS_TOO_LARGE', `${total} bytes`);
  return out;
}
```

Render con React Email (`@react-email/components` 1.0.x, `@react-email/render` 2.1.x, `render()` async):

```tsx
import { Html, Head, Preview, Body, Container, Section, Row, Column, Text, Button, Img, Hr, Link } from '@react-email/components';
import { render } from '@react-email/render';

export async function renderBlocks(doc: BlockDocument, ctx: RenderContext, subject: string, preheader: string) {
  const el = (
    <Html lang="es"><Head /><Preview>{preheader}</Preview>
      <Body style={{ background: doc.settings.bg, fontFamily: doc.settings.font, margin: 0 }}>
        <Container style={{ width: doc.settings.width, maxWidth: '100%', background: '#fff' }}>
          {doc.blocks.map(b => <BlockRenderer key={b.id} block={b} ctx={ctx} settings={doc.settings} />)}
        </Container>
      </Body></Html>);
  const html = await render(el);                          // async en @react-email/render 2.x
  const text = await render(el, { plainText: true });
  return { html, text };
}
// BlockRenderer: switch(block.type) → HeaderBlock | TextBlock | ButtonBlock | ImageBlock | DividerBlock | SpacerBlock
//   | ColumnsBlock | ProductCardBlock | QuoteSummaryBlock | SignatureBlock | SocialBlock | FooterLegalBlock | VariableChip (inline)
// TextBlock: interpolate(props.html, ctx, {escapeHtml:true}) → sanitizeHtml → <Section><Text dangerouslySetInnerHTML/></Section>
```

Modo HTML crudo: `sanitizeHtml(html)` (allow-list: `p,br,a[href|target],strong,em,u,h1-h4,ul,ol,li,table,thead,tbody,tr,td,th,img[src|alt|width|height],div,span,hr,blockquote,center`; `style` permitido pero filtrado a propiedades de layout/tipografía; `script/iframe/form/on*` eliminados; `href` solo `https:|mailto:|tel:|{{`) → `interpolate` → `juice(html)` si `opts.inlineCss` (por defecto true para `engine='html'`, false para bloques que ya salen inline).

Dominios (nombres exactos del SDK):

```ts
const master = new Resend(process.env.RESEND_API_KEY!);          // key full_access global
const { data: dom, error } = await master.domains.create({
  name: input.domain,                         // recomendado subdominio: crm.acme.co
  region: input.region ?? 'us-east-1',
  custom_return_path: 'send',
  open_tracking: false, click_tracking: false, tracking_subdomain: 'links',
  capabilities: { sending: 'enabled', receiving: 'enabled' },
});
// dom.records[] = [{record:'SPF'|'DKIM'|'MX'|'Tracking', name, type, ttl, status, value, priority?}]
const { data: key } = await master.apiKeys.create({ name: `org-${orgId}-${input.domain}`.slice(0, 50), permission: 'sending_access', domain_id: dom.id });
await supabase.rpc('fn_email_domain_store_api_key', { p_domain_id: row.id, p_token: key.token }); // token solo se ve una vez
// verificación: await master.domains.verify(dom.id); luego await master.domains.get(dom.id) → status
// tracking: await master.domains.update({ id: dom.id, open_tracking: true, click_tracking: true });
```

Se guarda además `dns_records` con el registro DMARC sugerido (`_dmarc.{domain} TXT "v=DMARC1; p=none; rua=mailto:dmarc@{domain}"`) marcado `recommended:true`, y para receiving el MX del subdominio `crm.{domain}` hacia `inbound-smtp.{region}.amazonses.com` (valor devuelto por Resend en `records` con `record:'MX'`; si el dominio registrado ya es `crm.{domain}` no se necesita uno adicional).

IA (`gpt-5.6-luna`, structured outputs, docs-openai.md):

```ts
const schema = z.object({
  subject: z.string().max(120), preheader: z.string().max(140),
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), html: z.string() }),
    z.object({ type: z.literal('button'), label: z.string().max(40), href: z.string() }),
    z.object({ type: z.literal('divider') }),
  ])).min(1).max(8),
  plain_text: z.string(),
});
const res = await openai.responses.parse({
  model: 'gpt-5.6-luna', reasoning: { effort: 'none' }, store: false,
  input: [{ role: 'system', content: SYSTEM_ES_EMAIL },
          { role: 'user', content: JSON.stringify({ tone, goal, opportunity, stage, products, last_call_analysis, objections, variables_allowed: VARIABLE_CATALOG.map(v => v.path) }) }],
  text: { format: zodTextFormat(schema, 'email_draft') },
});
const draft = res.output_parsed;   // refusal → item.type === 'refusal' → 422 AI_REFUSED
```

Antes de llamar: `decrement_ai_credits(p_org_id, p_cost)` con costo desde `provider_pricing` (F0) para `llm/gpt-5.6-luna` (≈1 crédito); tras la llamada `ai_usage_logs {action_type:'draft_email', model, prompt_tokens, completion_tokens, credits_consumed}`. El servicio convierte los bloques IA a `Block` con ids y añade `header`, `signature{source:'user_default'}` y `footer_legal` automáticamente.

### 4.6 Variables de entorno

| Variable | Nuevo | Uso |
|---|---|---|
| `RESEND_API_KEY` | existe | Key `full_access` global: dominios, api keys, receiving y dominio global |
| `RESEND_WEBHOOK_SECRET` | existe | svix |
| `EMAIL_GLOBAL_DOMAIN` | NUEVO | p.ej. `mail.goadmin.io` (verificado en Resend con receiving) para fallback |
| `EMAIL_GLOBAL_FROM_NAME` | NUEVO | "GoAdmin" |
| `EMAIL_UNSUBSCRIBE_SECRET` | NUEVO | HMAC de tokens `/u/{token}` (32+ bytes) |
| `EMAIL_CREDENTIALS_SECRET` | NUEVO (ronda 2) | Clave de cifrado AES-256-GCM de las API keys de Resend por dominio en `provider_configs.credentials` (`domainStore.ts`). **Opcional**: si falta se deriva de `EMAIL_UNSUBSCRIBE_SECRET` o de `SUPABASE_SERVICE_ROLE_KEY`. Cambiarla invalida las keys ya cifradas (hay que volver a generarlas desde Configuración › CRM › Email) |
| `APP_URL` | existe como `NEXT_PUBLIC_APP_URL`; usar la misma | enlaces `/u/`, `/p/` |
| `OPENAI_API_KEY` | existe | draft-email |
| `CRON_SECRET` | existe (F0 lo hace obligatorio) | job runner |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SENDGRID_*` | se eliminan tras migrar el fallback a `EMAIL_GLOBAL_DOMAIN` | – |

### 4.7 Dependencias npm

| Paquete | Versión | Motivo |
|---|---|---|
| `resend` | `^6.26.0` (subir desde ^6.25) | `emails.receiving.get`, `domains.*`, `apiKeys.create`, `batch.send` |
| `@react-email/components` | `^1.0.12` | primitivas de render |
| `@react-email/render` | `^2.1.0` | `render()` async + `plainText` |
| `sanitize-html` + `@types/sanitize-html` | `^2.17` | HTML crudo e inbound |
| `juice` | `^11` (opcional) | inline CSS en `engine='html'` |
| `svix` | existe `^2.2` | verificación |
| `@dnd-kit/core` `^6.3.1`, `@dnd-kit/sortable` `^10`, `@dnd-kit/utilities` | existen | reorder de bloques |
| `openai` | existe `^6.15` (Node 20; no subir a 7.x hasta Node 22) | `responses.parse` |
| `react-email` | existe; solo dev (`email dev` para previsualizar `src/emails/*`) | – |

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Propósito |
|---|---|---|
| (diálogo) | `src/components/crm/email/ComposeEmailDialog.tsx` | Compose desde Kanban/drawer/detalle/cliente (lo abre `QuickActionsBar` de F9) |
| `/app/crm/plantillas` | `src/app/app/crm/plantillas/page.tsx` → `src/components/crm/plantillas/PlantillasPage.tsx` | Lista por canal (tabs Email \| WhatsApp (F16) \| SMS), buscador, categorías, uso |
| `/app/crm/plantillas/nueva` y `/app/crm/plantillas/[id]` | `.../plantillas/nueva/page.tsx`, `.../plantillas/[id]/page.tsx` → `TemplateEditorPage.tsx` | Editor a pantalla completa (mismo `EmailBlockEditor`), versiones, duplicar, estadísticas |
| `/app/configuracion?modulo=crm` tab **Email** | `src/components/configuracion/crm/email/EmailSettingsTab.tsx` | Dominios + DNS + verificar, remitentes, tracking, política de fallback, cuota, firma |
| `/u/[token]` | `src/app/u/[token]/page.tsx` + `route.ts` (POST) | Página pública de baja (sin layout de app, sin auth) |
| Nav | `src/components/app-layout/AppLayout.tsx:122-139` | Añadir "Plantillas" al submenú CRM (con Llamadas y Leads de F3/F9) |

### 5.2 Componentes

| Archivo | Props (TS) | Estado / hooks | Servicios | ≤L |
|---|---|---|---|---|
| `email/ComposeEmailDialog.tsx` | `{open, onOpenChange, opportunityId?, customerId?, customer?: {id, email, first_name, full_name}, defaultTemplateId?, replyTo?: EmailMessage, onSent?: (m: EmailMessage) => void}` | `useComposeEmail()` (estado del borrador: recipients, sender, subject, mode 'blocks'\|'html', doc, html, attachments, scheduledAt); tab activa; `sending` | `GET /api/email/domains`, `/templates`, `/variables`, `POST /send` | 280 |
| `email/compose/useComposeEmail.ts` | `(init: ComposeInit) => ComposeState & actions` | reducer + autosave en `localStorage` (`compose:{opportunityId}`) | – | 200 |
| `email/compose/RecipientsField.tsx` | `{value: Recipient[], onChange, suggestions: Recipient[], showCc, showBcc}` | chips (`Badge` + `Command` para sugerencias de contactos de la org) | `GET /api/customers?q=` (existente) | 180 |
| `email/compose/SenderSelector.tsx` | `{domains: EmailDomain[], signatures: EmailSignature[], value, onChange}` | `Select`; banner si ninguno verificado | – | 120 |
| `email/compose/AttachmentsPanel.tsx` | `{opportunityId?, customerId?, value: AttachmentRef[], onChange, maxBytes}` | lista de `documents` de la oportunidad (checkbox) + `DocumentUploader` existente + tamaño total | `GET /api/crm/documents?related=` | 200 |
| `email/compose/ScheduleSendPopover.tsx` | `{value: string \| null, onChange, timezone}` | `Popover` + `Calendar` + hora; presets "Mañana 8:00", "Lunes 9:00" | – | 120 |
| `email/compose/AIDraftPopover.tsx` | `{opportunityId, onDraft: (d: DraftEmailOutput) => void}` | tono, objetivo, `loading`, muestra créditos | `POST /api/crm/ia/draft-email` | 160 |
| `email/editor/EmailBlockEditor.tsx` | `{value: BlockDocument, onChange, context: RenderContext \| null, readOnly?}` | `useBlockDocument` (undo/redo 50 pasos, selección), `DndContext` + `SortableContext` (@dnd-kit) | – | 260 |
| `email/editor/useBlockDocument.ts` | `(initial) => {doc, select, update, insert, move, remove, duplicate, undo, redo, canUndo, canRedo}` | historial inmutable | – | 180 |
| `email/editor/BlockPalette.tsx` | `{onInsert: (type: BlockType) => void}` | grid de 12 tipos con icono + `draggable` | – | 120 |
| `email/editor/BlockCanvas.tsx` | `{doc, selectedId, onSelect, ctx}` | render WYSIWYG aproximado (mismos componentes de bloque en modo edición, `useSortable`) | – | 220 |
| `email/editor/BlockPropertiesPanel.tsx` | `{block, settings, onChange, onChangeSettings}` | formulario por tipo (`blocks/*.props.tsx`) | – | 240 |
| `email/editor/blocks/{Header,Text,Button,Image,Divider,Spacer,Columns,ProductCard,QuoteSummary,Signature,Social,FooterLegal}Block.tsx` | `{block, ctx, editing, onChange}` | cada uno ≤120L; `TextBlock` embebe `RichTextEditor` + `VariablePicker` inline | – | 120 c/u |
| `email/editor/blockSchema.ts` | zod `BlockDocumentSchema`, `BLOCK_DEFAULTS`, `BlockType` | compartido server/cliente | – | 200 |
| `email/EmailHtmlEditor.tsx` | `{value, onChange, onInsertVariable}` | `textarea` monoespaciada con resaltado ligero (overlay `pre` coloreado por regex de tags/variables), Tab → 2 espacios; opcional CodeMirror 6 lazy (`@codemirror/lang-html`) detrás de flag | – | 180 |
| `email/EmailPreviewPane.tsx` | `{html, text, subject, preheader, device: 'desktop'\|'mobile', missing: string[]}` | `iframe sandbox="" srcDoc` (sin scripts), toggle 600px/375px, pestaña Texto | `POST /templates/{id}/preview` (debounce 500ms) | 150 |
| `email/TemplatePicker.tsx` | `{channel: 'email', kind?, onPick: (t: Template) => void}` | `Command` con buscador, grupos por `kind`, preview lateral, "Gestionar plantillas" | `GET /api/email/templates` | 180 |
| `email/VariablePicker.tsx` | `{catalog: VariableDef[], values?, onInsert: (path: string) => void, trigger?: ReactNode}` | `Popover` + `Command`, muestra valor real de ejemplo, opción de default | – | 140 |
| `email/EmailPreviewCard.tsx` (timeline F9) | `{entry: TimelineEntry & {email: EmailMessageSummary}, onReply: () => void}` | `expanded`; carga `GET /api/email/messages/{id}` al expandir; línea de eventos (sent/delivered/opened×n/clicked×n/bounced) con `Tooltip`; inbound con avatar del contacto | `GET /api/email/messages/[id]` | 220 |
| `plantillas/PlantillasPage.tsx` | – | tabs por canal, tabla (`TemplateListTable`), filtros | `listTemplates` | 200 |
| `plantillas/TemplateListTable.tsx` | `{rows, onDuplicate, onToggle, onDelete}` | menú por fila | – | 180 |
| `plantillas/TemplateEditorPage.tsx` | `{templateId?: string}` | header (nombre, kind, activo, Guardar, Enviar prueba), split: editor \| preview | templates CRUD, preview, test-send | 280 |
| `plantillas/TemplateVersionsPanel.tsx` | `{templateId}` | lista `parent_template_id` chain, restaurar como nueva versión | – | 120 |
| `plantillas/TemplateStatsCard.tsx` | `{templateId}` | uso, enviados, tasa apertura/click (agregado de `email_messages` por `template_id`) | `GET /api/email/messages?template_id&stats=1` | 100 |
| `configuracion/crm/email/EmailDomainsCard.tsx` | – | lista de dominios con `Badge` de estado, botón "Añadir dominio" (`AddDomainDialog`) | domains CRUD | 220 |
| `configuracion/crm/email/DnsRecordsTable.tsx` | `{records: DnsRecord[], onVerify, verifying}` | tabla tipo/nombre/valor/estado, botón copiar por celda (`navigator.clipboard`), DMARC sugerido | – | 160 |
| `configuracion/crm/email/SendersCard.tsx` | `{domain}` | from_name/from_email/reply_to, tracking toggles, receiving toggle | `PATCH /api/email/domains/[id]` | 150 |
| `configuracion/crm/email/SignatureEditor.tsx` | – | `EmailBlockEditor` restringido a `text,image,social,divider` + preview | signatures | 160 |
| `configuracion/crm/email/EmailPolicyCard.tsx` | – | `email_fallback_policy`, cuota mensual, tracking en transaccionales | `comm_settings` | 120 |

Se elimina `EmailDialog` de `ActivityActions.tsx:466-594` (la barra de F9 abre `ComposeEmailDialog`), `EmailNotifications.ts/.tsx` y los `mailto:` de B12.

### 5.3 Flujos de usuario

**A. Enviar propuesta con PDF desde el Kanban**
1. Clic en icono de sobre de la tarjeta (`QuickActionsBar variant='card'`, `stopPropagation`). Se abre el `Sheet` ancho (`max-w-4xl`) con "Para" precargado con el email del cliente y remitente por defecto.
2. Clic "Plantilla" → `TemplatePicker` → "Propuesta enviada". Asunto y bloques se cargan; los chips de variables muestran valores reales (`{{opportunity.name}}` → "Plan Pro Empresa").
3. Pestaña Bloques: edita el texto (RichTextEditor inline), arrastra el bloque `quote_summary` bajo el texto. Panel derecho: botón "Ver propuesta" → href `{{quote.url}}`.
4. Adjuntos → marca "Cotización-0042.pdf" (documento de la oportunidad). Contador "1 adjunto · 312 KB / 40 MB".
5. Pestaña Vista previa → desktop/móvil; sin variables faltantes (si faltara `custom.x`, se muestra en rojo y "Enviar" queda deshabilitado en modo estricto).
6. "Enviar prueba" (a mi correo) opcional. "Enviar" → toast "Enviado" → `onSent` → el timeline muestra la `EmailPreviewCard` con estado `sent` que pasa a `delivered` por realtime (F9 suscribe `email_messages`).

**B. Programar y cancelar**: "Programar" → popover → "Lunes 9:00" → botón cambia a "Programar para lun 9:00" → 202 → en timeline aparece con `Badge` "Programado" y acción "Cancelar" (`POST /cancel`).

**C. Redactar con IA**: "Redactar con IA" → tono "cercano", objetivo "seguimiento" → 3-6 s → bloques reemplazan el canvas (con undo disponible) y asunto/preheader se rellenan; chip "1 crédito IA".

**D. Responder desde el timeline**: `EmailPreviewCard` de un inbound → "Responder" → `ComposeEmailDialog replyTo=msg` (asunto "Re: …", cita colapsada, hilo conservado).

**E. Registrar dominio (admin)**: Configuración → CRM → Email → "Añadir dominio" → `crm.acme.co`, remitente "Ventas" `ventas@crm.acme.co` → se crea en Resend → `DnsRecordsTable` con copiar → el admin publica DNS → "Verificar" → estado `verifying` → webhook `domain.updated` → `verified` (realtime en la tarjeta) → toggle "Tracking de clics/aperturas (solo marketing)".

**F. Baja pública**: el cliente abre `/u/{token}` → página "¿Deseas dejar de recibir correos de {org}?" → botón → `fn_email_unsubscribe` → "Listo". Gmail One-Click hace `POST` sin UI.

### 5.4 Wireframes

```
┌ ComposeEmailDialog (Sheet, max-w-4xl) ──────────────────────────────────────────────┐
│ Nuevo correo · Oportunidad: Plan Pro Empresa                               [x]      │
│ De  [Ventas <ventas@crm.acme.co> ▾]   Firma [Ana Gómez ▾]      ⚠ Sin dominio → banner│
│ Para [cliente@empresa.com ×] [+ contacto…]                          Cc  Bcc         │
│ Asunto [Propuesta {{opportunity.name}} para {{org.name}}      ] [{{ }} Variables]    │
│ Preheader [Detalle y próximos pasos                            ]                    │
│ [Plantilla ▾] [✨ Redactar con IA]                    [Bloques] [HTML] [Vista] [Texto]│
│ ┌ Paleta ─────┐ ┌ Canvas 600px ───────────────────────┐ ┌ Propiedades ────────────┐ │
│ │ ▣ Encabezado│ │ ⠿ [logo ACME]                       │ │ Botón                   │ │
│ │ ¶ Texto     │ │ ⠿ Hola {{contact.first_name|hola}}, │ │ Texto  [Ver propuesta ] │ │
│ │ ▭ Botón     │ │   te comparto la propuesta…         │ │ Enlace [{{quote.url}}  ]│ │
│ │ ▨ Imagen    │ │ ⠿ ┌ Cotización #0042 ─────────────┐ │ │ Estilo (•)Primario ( )  │ │
│ │ ─ Divisor   │ │   │ Plan Pro x12   $ 1.200.000    │ │ │ Alineación [Centro ▾]   │ │
│ │ ␣ Espacio   │ │   │ Total          $ 1.200.000    │ │ │                         │ │
│ │ ▥ Columnas  │ │   └───────────────────────────────┘ │ │ ── Documento ──         │ │
│ │ ▤ Producto  │ │ ⠿ [ Ver propuesta ]  ← seleccionado │ │ Ancho 600  Fondo #f4f5f7│ │
│ │ ▦ Cotización│ │ ⠿ Ana Gómez · Ventas · +57 300…     │ │ Fuente [Inter ▾]        │ │
│ │ ✎ Firma     │ │ ⠿ ACME S.A.S · Cra 7 #1-1 Bogotá    │ │ Color marca [#2563eb]   │ │
│ │ ◎ Social    │ │   Darse de baja (solo marketing)    │ │                         │ │
│ │ § Legal     │ └─────────────────────────────────────┘ └─────────────────────────┘ │
│ Adjuntos: [☑ Cotización-0042.pdf 312 KB] [Subir…]   1 adjunto · 0.3/40 MB           │
│ [Guardar como plantilla] [Enviar prueba]        [Programar ▾]  [Enviar ▸]           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌ EmailPreviewCard (timeline) ────────────────────────────────────────────────────────┐
│ ✉ Propuesta Plan Pro Empresa           ana@crm.acme.co → cliente@empresa.com        │
│ ● sent 10:02 ─ ● delivered 10:02 ─ ● opened ×2 10:40 ─ ○ clicked      [Abierto]     │
│ ▸ Ver contenido      📎 Cotización-0042.pdf                     [Responder] [⋯]      │
│ ↩ Respuesta de Carlos Pérez · 11:15  "Perfecto, lo reviso con el equipo…"  [Ver]    │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌ Configuración › Email › Dominios ───────────────────────────────────────────────────┐
│ crm.acme.co   [● Verificado]  Remitente: Ventas <ventas@crm.acme.co>  Tracking: off │
│ mail.acme.co  [◐ Pendiente ]  Registros DNS pendientes 2/4  [Ver DNS] [Verificar]   │
│ ┌ DNS ───────────────────────────────────────────────────────────────────────────┐ │
│ │ Tipo │ Nombre                  │ Valor                              │ Estado │📋│ │
│ │ MX   │ send.mail.acme.co       │ feedback-smtp.us-east-1.amazonses… │ ✓      │📋│ │
│ │ TXT  │ send.mail.acme.co       │ v=spf1 include:amazonses.com ~all  │ ✓      │📋│ │
│ │ TXT  │ resend._domainkey.mail… │ p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCB… │ pend.  │📋│ │
│ │ TXT  │ _dmarc.mail.acme.co     │ v=DMARC1; p=none; rua=mailto:…     │ recom. │📋│ │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
│ [+ Añadir dominio]                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos, carga y error

- Sin dominio verificado: banner ámbar en el compose "Tus correos saldrán vía GoAdmin. Configura tu dominio" con enlace; si `email_fallback_policy='block'` el botón Enviar se deshabilita con tooltip.
- Sin plantillas: `TemplatePicker` muestra "Aún no hay plantillas" + "Crear desde este correo".
- Variables faltantes: lista en rojo bajo la vista previa; en modo estricto bloquea; en secuencias se envía vacío con warning en `email_messages.metadata.missing`.
- Sin créditos IA: el popover muestra "Sin créditos" y enlace a Configuración › Créditos.
- Errores de envío: toast con `code` legible (`CONTACT_OPTED_OUT` → "El contacto pidió no recibir correos"); el borrador se conserva (autosave).
- Carga: skeleton en `EmailPreviewPane` y `TemplatePicker`; `EmailPreviewCard` carga el cuerpo solo al expandir.
- Webhook atrasado: la tarjeta muestra `sent` y se actualiza por realtime; nunca "pendiente" indefinido (si `status='pending'` > 2 min se muestra "Verificando…" y un job de reconciliación lee `resend.emails.get(id).last_event`).

### 5.6 Accesibilidad

- `Sheet` con `aria-labelledby`, foco inicial en "Para", `Escape` cierra con confirmación si hay cambios.
- Editor de bloques: cada bloque es un `button` con `aria-label="Bloque de texto, posición 2 de 6"`; reordenar por teclado con `KeyboardSensor` de @dnd-kit (Espacio + flechas) además del drag; `Alt+↑/↓` mueve; `Delete` elimina con undo.
- Chips de variables con `role="button"` y texto visible del valor real en tooltip; contraste ≥ 4.5:1 en estados de eventos (no solo color: texto "Abierto ×2").
- `EmailHtmlEditor`: `textarea` real (lectores de pantalla), `aria-describedby` con el conteo de variables.
- Página `/u/[token]`: HTML semántico, botón único, sin dependencias de JS para el POST (form nativo).

### 5.7 Motion (sobrio)

`motion/react` con `MotionProvider` existente: aparición de bloques al insertar (`opacity 0→1, y 4→0`, 150 ms), reorder con `layout` en `BlockCanvas`, transición de pestañas Bloques/HTML/Vista con `AnimatePresence mode="wait"` 120 ms, `prefers-reduced-motion` desactiva todo (ya lo gestiona el provider). Timeline de eventos: los puntos se rellenan con `scale 0.6→1` cuando llega un evento por realtime.

### 5.8 Responsive / cross-platform

- < 1024px: el compose pasa a `Sheet side="bottom"` altura 95vh; paleta de bloques como `Drawer` inferior; propiedades como `Sheet` derecho al tocar un bloque. Vista previa móvil por defecto.
- PWA/Capacitor (`mobile/`): sin permisos nuevos; adjuntar "Subir…" usa `<input type=file accept="application/pdf,image/*">` (funciona en WebView). Drag de bloques en touch usa `TouchSensor` con `delay 150ms`. `navigator.clipboard` requiere HTTPS (ok en app.goadmin.io).
- Electron (`electron/`): sin cambios; abrir `/u/{token}` y `{{quote.url}}` con `shell.openExternal` ya cubierto por el handler de enlaces externos existente.
- Autosave en `localStorage` por oportunidad evita perder borradores al cambiar de app en móvil.

---

## 6. Integración con proveedores (Resend + OpenAI)

| Llamada | Nombre exacto | Límite / gotcha (docs-resend.md) |
|---|---|---|
| Envío | `resend.emails.send(payload, { idempotencyKey })` | 10 req/s por team; cada destinatario To/CC/BCC cuenta; 40 MB con adjuntos; `Idempotency-Key` ventana 24 h, misma key con payload distinto → 409 `invalid_idempotent_request` (por eso la key incluye el `email_message_id`, que es único por render) |
| Programado | `scheduled_at` (ISO, ≤30 días) · `resend.emails.update({id, scheduled_at})` · `resend.emails.cancel(id)` | Cancelado no reprogramable → creamos nuevo `email_message` |
| Lote | `resend.batch.send([...≤100])` | Sin adjuntos; respuesta `{data:[{id}]}` en orden; `scheduled_at` por email |
| Estado | `resend.emails.get(id)` → `last_event` | Reconciliación cuando falta webhook |
| Dominios | `resend.domains.create({name, region, custom_return_path, open_tracking, click_tracking, tracking_subdomain, tls, capabilities})`, `.verify(id)`, `.get(id)`, `.update({id, ...})`, `.remove(id)` | Pro 10 dominios, Scale 1000 (+100 por $20/mes); `tracking_subdomain` no se quita; `custom_return_path` no cambia por PATCH; `temporary_failure` → `failed` a las 72 h; Domain Claim: un dominio activo en un solo team (si la org ya lo usa en su propio Resend, pedir BYOK) |
| API keys | `resend.apiKeys.create({name ≤50, permission:'sending_access', domain_id})` → `{id, token}` · `.remove(id)` | Token visible una vez → vault inmediatamente |
| Webhooks | eventos `email.*`, `domain.*`; verificación svix con raw body; 8 reintentos | `tags` como objeto; responder 200 rápido (inbound se encola) |
| Receiving | `resend.emails.receiving.get(id, {html_format:'cid'|'data_uri'})`, `resend.emails.receiving.attachments.get(emailId, attachmentId)` | Solo metadata en el webhook; `raw.download_url` 1 h; activar `capabilities.receiving` |
| OpenAI | `openai.responses.parse({model:'gpt-5.6-luna', reasoning:{effort:'none'}, text:{format: zodTextFormat(...)}, store:false})` | $0.20/$1.20 por 1M; ~3K tokens ≈ $0.001; `refusal` posible |

---

## 7. Multi-tenant y seguridad

Checklist por endpoint (todos usan `getServerOrgContext()`; orgId nunca del body):

- `/api/email/send`, `/reply`, `/cancel`: `to_customer_id`, `related_id`, `document_id`, `template_id`, `from_domain_id` se validan contra `organization_id` de la sesión (consulta con filtro; 404 si no pertenece). Cierra el patrón IDOR de C4/C5 aplicado a email. `strict` de variables no revela datos de otra org porque el contexto se construye con el cliente RLS de la sesión.
- Dominios: solo roles admin de la org (`organization_members.role_id` → permiso `crm.settings`); el token de API nunca vuelve al cliente; `fn_email_domain_api_key` revocada a `anon/authenticated` y solo la ejecuta el cliente service role del servidor (`SUPABASE_SERVICE_ROLE_KEY`). Cierra C8 (secretos en claro) para email.
- Webhook: firma svix fail-closed (sin secreto → 500, firma inválida → 401); `runtime='nodejs'`; el `organization_id` sale de la fila `email_messages` (nunca del payload ni de `tags`); inbound resuelve org por el dominio destino (`email_domains.domain` exacto, `status='verified'`) o por el `email_message_id` del `reply_to`, nunca por "primera org" (cierra C22-equivalente).
- `/u/[token]`: token HMAC con `timingSafeEqual`; no expone email ni nombre; responde igual (200) para tokens repetidos; rate limit 30/min por IP en middleware.
- Supresión enforced (C18): `fn_can_contact` se consulta en `sendEmail` (individual, secuencias F8, campañas F16 en materialización y de nuevo en el job).
- XSS: `sanitize-html` en HTML crudo, en `TextBlock.html` y en inbound; `interpolate` escapa por defecto; `EmailPreviewPane` usa `iframe sandbox` sin `allow-scripts`; `EmailPreviewCard` usa `HtmlContentRenderer` sobre HTML ya sanitizado en servidor.
- Adjuntos: solo `documents` de la misma org; tamaño total validado; `content_type` de la fila, no del cliente.
- IA: `opportunityId` validado por org; el prompt solo incluye datos de la org; `store:false`.
- Logs: nunca se loguea `apiKey` ni `token` (redacción en `emailDomainService`).

---

## 8. Créditos, costos y límites

- Resend: plan Pro $20/50k (o Scale $90/100k) del team GoAdmin; overage $0.90/1k. Cada destinatario cuenta. Cuota por org: `comm_settings.email_monthly_quota` (NULL = ilimitado dentro del plan) reservada por `fn_email_reserve_quota` antes de enviar; al 80 % se crea notificación `fn_create_org_notification(org, null, 'app', 'warning', 'Cuota de correo al 80 %')`; al 100 % `QUOTA_EXCEEDED`. Reset mensual por pg_cron.
- Costo por correo registrado en `email_messages.cost_amount` desde `provider_pricing` (F0; fila `resend/email/unit` = 0.0004 USD estimado: 20/50000) para reportes; no se debitan créditos de `comm_settings` por email (política: incluido en el plan), pero queda listo el hook `deduct_comm_credits(org,'email',n)` si se decide cobrar (requiere añadir `email_remaining` a la RPC; hoy devuelve `false` para canales distintos de sms/whatsapp/voice, así que NO se llama).
- IA: `decrement_ai_credits` antes de `draft-email`/`improve-text`; costo real en `ai_usage_logs.metadata.cost_usd` (tokens × precio de `provider_pricing`).
- Límites de Resend por dominio: 10 (Pro) → alerta al super admin cuando quedan 2; el flujo pide add-on o Scale.
- Presupuesto: panel Créditos/costos (D5) suma `email_messages.cost_amount` + `ai_usage_logs` del mes.

---

## 9. Pruebas

### 9.1 Unitarias (`src/lib/services/crm/email/__tests__/`)

- `interpolate.test.ts`: rutas con punto, defaults, `money`/`date`, escape de `<script>`, `raw` solo en HTML, `missing[]` exacto, variables inexistentes en catálogo.
- `render.test.ts`: cada uno de los 12 bloques renderiza HTML válido (snapshot) y texto plano; `columns` 2 y 3; `footer_legal` con `unsubscribe:true` obliga `unsubscribe_url`; documento inválido (zod) → error.
- `sanitize.test.ts`: elimina `script`, `onerror`, `javascript:`; conserva tablas e `img`; inbound con `cid:`.
- `idempotency.test.ts`: `buildIdempotencyKey` determinista; doble `sendEmail` con el mismo `client_request_id` devuelve la misma fila.
- `resolveSender.test.ts`: verificado → org; sin dominio + `global_with_notice` → global con notice; `block` → `NO_SENDER`.
- `unsubscribeToken.test.ts`: firma/verificación, tamper → null.
- `fn_email_apply_event` (SQL, vía `execute_sql` en test de integración): `clicked` luego `opened` → sigue `clicked`, `open_count=1`; `bounced` luego `delivered` → sigue `bounced`.

**Estado real tras la ronda 2** (`npx jest src/lib/services/crm/email src/lib/security` → 13 suites, **201 tests + 1 skip**). Los nombres reales de los archivos son los de §12, no los del plan:

- `variables.test.ts`, `render.test.ts`, `sanitize.test.ts`, `sendService.test.ts`, `webhook.test.ts`, `domainsService.test.ts`, `unsubscribe.test.ts` — 62 tests de la ronda 1.
- `adversarial.test.ts` (suite del tester, **70 tests**): render, sanitizado, los 13 bloques, payload de Resend, adjuntos, token de baja, dominios y máquina de estados. Los 6 casos que documentaban un defecto están invertidos a `[CORREGIDO r2]`; `<style>` queda como `[DECISIÓN r2]`.
- `roundTwo.test.ts` (**38 tests**, ronda 2): escapado y cabeceras de `/u/[token]`, allow-list de esquemas, dominio↔org del inbound, agrupación de lotes, CAS agotado con rollback del evento, `orgOwnsDomain`, los schemas zod, `registrableDomain` y el cifrado de credenciales.
- `svixReal.test.ts` + `svixReal.harness.mts` (**8 tests**, ronda 2): `verifyResendWebhook` con el paquete `svix` REAL en un proceso `tsx` aparte (jest no puede cargar ESM puro).
- `live.integration.test.ts`: skip salvo `RUN_LIVE=1`.
- `adversarialR2.test.ts` (suite del tester r2, **14 tests**): los 8 casos `[BUG r2]` estan invertidos a `[CORREGIDO r3]` conservando el mismo enunciado y el mismo vector.
- `roundThree.test.ts` (**17 tests**, ronda 3): los `on*` del HTML del correo contados con **htmlparser2** (no con regex, que da falsos positivos sobre `alt="ACME&quot; onerror=..."`), clamp de `font_size`, la parte pura de `sanitizePreviewHtml`, el aislamiento de fallos del lote ejecutado de verdad, el llavero de credenciales y `zUuid` en los ids de ruta.

- `roundFour.test.ts` (**14 tests**, ronda 4): la salida en **texto plano** y el **preheader**. Uno de los casos (el vector de inyeccion) comprueba las DOS salidas del mismo render: que el texto va sin entidades y que el marcado sigue escapado e inerte (contado con `htmlparser2`); el resto cubre una de las dos, el preheader, o funciones sueltas. Incluye la decodificacion de entidades en una sola pasada y la igualdad servidor/cliente de `sanitizePreviewHtml`.

**Estado real tras la ronda 4**: `npx jest src/lib/services/crm/email/` -> **13 suites, 224 tests + 1 skip, todas verdes** (r3: 12 suites y 211 tests; +14 de `roundFour.test.ts` y -1 por la prueba de regex borrada).

### 9.2 Integración (mocks con payloads reales)

- Webhook: 7 payloads reales (`email.sent`, `delivered`, `opened`, `clicked`, `bounced Permanent`, `bounced Temporary`, `complained`) enviados fuera de orden y duplicados (mismo `svix-id`) → 1 `email_events` por id, estado final correcto, `contact_consents` `opted_out` solo en Permanent/complained.
- `email.received` con 1 adjunto PDF (mock de `emails.receiving.get`) → inbound + activity + notificación + `documents` 1 fila; `to` no parseable → inbound sin relación.
- `domains.create` mock → `dns_records` 4 registros + DMARC sugerido; `domain.updated` → `verified`.
- Job `email`: `scheduled` + `run_at` pasado → envía; contacto que optó por salir entre programación y envío → `failed` con `CONTACT_OPTED_OUT` y activity actualizada.
- 429 con `retry-after: 2` → reencola todo el lote con `run_at`+2 s.

### 9.3 E2E manual (org de prueba `QA Revenue`)

1. Registrar `crm.qa-goadmin.test` (dominio real de pruebas del equipo) → publicar DNS → verificar → `verified`.
2. Enviar "Propuesta enviada" con PDF desde Kanban → recibir en Gmail con DKIM `pass`, adjunto abierto, `reply_to` `crm+…@crm.qa-goadmin.test`.
3. Abrir y clicar → timeline muestra `opened ×1`, `clicked ×1` en < 30 s.
4. Responder desde Gmail → inbound en timeline + campana de notificación.
5. Enviar marketing "Reactivación" → cabecera `List-Unsubscribe` visible en Gmail ("Cancelar suscripción") → clic → `/u/{token}` → intentar reenviar → `CONTACT_OPTED_OUT`.
6. Programar para +2 min, cancelar antes → `canceled`; programar +2 min sin cancelar → llega.
7. Redactar con IA → bloques coherentes con la etapa → créditos descontados en Configuración.
8. Org sin dominio: enviar → llega desde `mail.goadmin.io` con "Enviado vía GoAdmin"; cambiar política a `block` → botón deshabilitado.

### 9.4 Casos borde (≥10)

1. 51 destinatarios → 400 `TOO_MANY_RECIPIENTS`. 2. Adjuntos 41 MB → 422. 3. Plantilla desactivada seleccionada por id → 404. 4. Variables con `{{` sin cerrar → se deja literal, sin crash. 5. `scheduled_at` > 30 días → 400. 6. Inbound duplicado (mismo `email_id`) → índice único `provider_inbound_id` → ignorado. 7. Dominio ya reclamado por otro team en Resend → error `domain_claimed` → UI ofrece BYOK. 8. Token de API rotado en Resend → 401 en envío → `email_domains.status='failed'`, notificación admin, fallback global si política lo permite. 9. Cliente sin `email` → botón Email deshabilitado con tooltip. 10. Doble clic en Enviar → 1 correo (`client_request_id`). 11. Webhook llega antes del UPDATE `provider_message_id` (carrera) → reintento de Resend en 5 s lo resuelve; además `sendEmail` hace el UPDATE antes de devolver. 12. Bloque `quote_summary` sin cotización → render "Sin cotización" y `missing:['quote']`. 13. HTML crudo con `<style>` → conservado y `juice` lo inlinea. 14. Preheader vacío → se usa el primer texto del cuerpo (80 chars).

---

## 10. Definition of Done

1. Migraciones aplicadas y §3.3 devuelve los valores esperados; `anon` no puede ejecutar `fn_email_domain_api_key`.
2. `npm run build` y `jest` verdes; `guardrails.test.ts` amplía la regla "ningún archivo bajo `src/lib/services/crm/email/` importa `@/lib/supabase/config`".
3. Un envío crea exactamente 1 `email_messages` y 1 `activities` (test de integración lo afirma).
4. Doble clic no duplica; `email_messages.idempotency_key = 'email/{id}'`.
5. Webhook fuera de orden y duplicado no degrada estado ni duplica contadores.
6. Dominio por org creado, verificado y usado como remitente; token de API solo en `vault`.
7. Inbound crea `direction='inbound'`, activity, notificación y documento adjunto.
8. `List-Unsubscribe` + `/u/{token}` funcionan y `fn_can_contact` bloquea el reenvío.
9. 12 bloques renderizan (snapshots) y HTML crudo pasa por sanitización; ningún `<script>` llega a Resend.
10. `ComposeEmailDialog` disponible en tarjeta, drawer, detalle y cliente (vía F9); `EmailDialog` viejo, `EmailNotifications.*` y `mailto:` de B12 eliminados.
11. `/app/crm/plantillas` con 6 seeds por org, versiones y duplicar; editor ≤300 L por archivo.
12. IA redacta con `gpt-5.6-luna` y debita créditos; `improve-text` inline funciona.
13. Sin `EMAIL_FROM_ADDRESS` en el código; fallback solo por `EMAIL_GLOBAL_DOMAIN` y política.

Métricas de éxito (30 días tras release): ≥ 60 % de los correos del CRM salen desde dominios propios; bounce < 4 % y spam < 0.08 % por dominio (dashboard de Resend); ≥ 1 respuesta inbound capturada por cada 10 enviados con `reply_to`; tiempo de composición mediano < 3 min con plantilla.

---

## 11. Riesgos y decisiones

- **Editor propio de bloques vs Unlayer/GrapesJS/MJML**: propio con shadcn + @dnd-kit (ya instalado) porque el shape `blocks_json` debe ser compartido con IA, seeds y F16, sin licencias ni iframes de terceros; MJML descartado por peso de dependencia (juice + mjml > 5 MB) y porque React Email cubre compatibilidad Outlook/Gmail con tablas.
- **React Email en servidor** (no en el cliente): `@react-email/render` usa `renderToStaticMarkup` de `react-dom/server`; se ejecuta en route handlers Node. La vista previa del cliente es una aproximación (mismos componentes en modo edición) y la definitiva viene de `/preview`.
- **Un dominio por org en un solo team Resend** (opción A de docs-resend.md) en vez de sub-teams (no existen) o BYOK obligatorio: menor fricción; BYOK disponible para orgs con Resend propio o dominio reclamado.
- **Subdominio `crm.{dominio}`** recomendado: aísla reputación del dominio corporativo y permite receiving sin tocar el MX principal.
- **Variables propias** en vez de Handlebars: superficie mínima, escape por defecto, sin helpers arbitrarios ni prototipo pollution; las mismas reglas sirven en WhatsApp (F16).
- **Tracking off por defecto en transaccionales** (recomendación Resend + privacidad); on por dominio para marketing.
- **Programación híbrida** (Resend ≤1 h, cola propia >1 h): cancelabilidad y recomprobación de consentimiento.
- **Inbound por `reply_to` con `crm+{id}`** en vez de parsear `In-Reply-To` únicamente: los clientes de correo no siempre conservan `References`.
- **Sin cobro de créditos por email** en esta fase (incluido en plan), para no bloquear adopción; el hook queda documentado.
- **Riesgos**: (1) Resend Domain Claim puede rechazar dominios ya activos en otro team → BYOK; (2) `openai` 7.x exige Node 22 → nos quedamos en 6.x; (3) `render()` async cambia firmas si alguien usa `react-email` viejo (no hay uso previo); (4) volumen de webhooks `opened` con tracking → índices ya previstos; (5) HTML pegado desde Word con CSS complejo → sanitizador lo reduce, se avisa en preview.

**Decisiones de la ronda 2 (seguridad):**

- **Todo lo dinámico de `/u/[token]` se escapa y la página lleva CSP propia.** Es la única superficie pública sin sesión de la fase y va enlazada desde el `List-Unsubscribe` de todo el correo de marketing; se trata como hostil aunque el dato venga de nuestra propia BD.
- **`settings.font` se normaliza, no se rechaza.** `parseBlockDocument` valida entrada *y* renderiza documentos ya guardados; rechazar dejaría plantillas antiguas sin poder renderizarse.
- **`<style>` sí en el correo saliente, no en el entrante.** Los clientes de correo necesitan CSS en `<head>` y el autor del saliente es un usuario autenticado de la org; el entrante lo escribe cualquiera de internet.
- **API keys de Resend cifradas con AES-256-GCM en `provider_configs.credentials`** (`EMAIL_CREDENTIALS_SECRET`, con derivación de `EMAIL_UNSUBSCRIBE_SECRET`/service-role key si falta). **Riesgo residual aceptado**: protege ante lectura de la tabla, dump o backup y ante un futuro fallo de RLS, pero **no** ante quien ya tenga el entorno del servidor, porque la clave vive en el mismo proceso. El sustituto definitivo es Supabase Vault + `email_domains.api_key_secret_id` (pedido a DB); mientras tanto, `credentials` sigue sin ser legible por el rol `authenticated` y solo `domainStore.ts` lo lee.
- **El webhook responde 503 cuando el update optimista agota los reintentos** en vez de 200 silencioso: se prefiere un reintento de Resend a perder contadores de apertura/clic sin traza.

---

## 12. Archivos tocados (real, ronda 1)

> El plan original preveía 10 PRs; la ronda 1 se entregó como un único bloque coherente. Rutas reales:

**Servicios (`src/lib/services/crm/email/`)** — `types.ts`, `blocks.ts`, `variables.ts`, `sanitize.ts`, `render.ts`, `renderBlocks.ts`, `resendClient.ts`, `attachments.ts`, `messageStore.ts`, `domainStore.ts`, `domainsService.ts`, `templatesService.ts`, `messagesService.ts`, `sendService.ts`, `batchService.ts`, `webhookService.ts`, `inboundService.ts`, `unsubscribe.ts`, `aiDraftService.ts`, `http.ts`, `seeds/emailTemplates.ts`.

**Tests (`src/lib/services/crm/email/__tests__/`)** — `variables.test.ts`, `render.test.ts`, `sanitize.test.ts`, `sendService.test.ts`, `webhook.test.ts`, `domainsService.test.ts`, `unsubscribe.test.ts`, `fakeSupabase.ts`, `live.integration.test.ts` (skip por defecto).

**API (`src/app/api/`)** — `email/send/route.ts`, `email/messages/route.ts`, `email/messages/[id]/{route,reply/route,cancel/route}.ts`, `email/templates/{route,preview/route}.ts`, `email/templates/[id]/{route,duplicate/route,test-send/route}.ts`, `email/domains/{route}.ts`, `email/domains/[id]/{route,verify/route,default/route}.ts`, `email/settings/route.ts`, `email/variables/route.ts`, `email/webhook/route.ts`, `crm/ia/draft-email/route.ts`.

**Público** — `src/app/u/[token]/route.ts` (baja GET+POST One-Click).

**Jobs** — `src/lib/jobs/handlers/email.ts` (+ registro en el archivo compartido `handlers/index.ts:41`).

**UI CRM (`src/components/crm/email/`)** — `ComposeEmailDialogFull.tsx`, `emailApi.ts`, `EmailHtmlEditor.tsx`, `EmailPreview.tsx`, `TemplatePicker.tsx`, `VariablePicker.tsx`, `compose/{useComposeEmail.ts,AttachmentsPanel,ScheduleSendPopover,AIDraftPopover}.tsx`, `editor/{EmailBlockEditor,BlockPalette,BlockCanvas,BlockPropertiesPanel,useBlockDocument}.tsx`, `editor/blocks/{BlockPreview,BlockPropsForm,fields}.tsx`.

**Plantillas** — `src/app/app/crm/plantillas/{page,nueva/page,[id]/page}.tsx`; `src/components/crm/plantillas/{PlantillasPage,TemplateList,TemplateEditorPage,TemplateEditorHeader,TestSendDialog,useTemplateEditor}.tsx`.

**Configuración** — `src/components/configuracion/crm/EmailTab.tsx`; `src/components/configuracion/crm/email/{EmailDomainsCard,AddDomainDialog,DnsRecordsTable,DomainSendersForm,EmailPolicyCard,SignatureEditor,useEmailSettings}.tsx` (+ montaje en el archivo compartido `CrmConfigTabs.tsx:24,76`).

**Compartidos tocados por el orquestador (no por F7)** — `src/lib/jobs/handlers/index.ts`, `src/components/configuracion/panels/crm/CrmConfigTabs.tsx`, `src/config/crmNav.ts:56`, `src/middleware.ts:94,96,784` (rutas públicas `/api/email/webhook` y `/u/`), `.env.example`.

**Ronda 2 (2026-09-08) — nuevos**: `src/lib/services/crm/email/{publicPage.ts,schemas.ts,domainRules.ts,variablesContext.ts}`; tests `__tests__/{roundTwo.test.ts,svixReal.test.ts,svixReal.harness.mts}`.

**Ronda 2 — modificados**: `src/app/u/[token]/route.ts`; servicios `blocks.ts`, `render.ts`, `renderBlocks.ts`, `sanitize.ts`, `variables.ts`, `attachments.ts`, `batchService.ts`, `inboundService.ts`, `webhookService.ts`, `sendService.ts`, `messageStore.ts`, `domainStore.ts`, `domainsService.ts`; rutas `email/{send,templates,templates/preview,templates/[id],templates/[id]/duplicate,templates/[id]/test-send,domains,domains/[id],messages,messages/[id]/reply,settings,variables}/route.ts` y `crm/ia/draft-email/route.ts`; UI `src/components/crm/plantillas/PlantillasPage.tsx`; tests `__tests__/{adversarial.test.ts,sendService.test.ts}`.

**Ronda 3 (2026-09-09) — nuevos**: `src/components/crm/email/editor/blocks/previewSanitize.ts`, `src/components/crm/plantillas/TabErrorBoundary.tsx`, tests `__tests__/roundThree.test.ts`.

**Ronda 3 — modificados**: servicios `renderBlocks.ts`, `variables.ts`, `sanitize.ts`, `batchService.ts`, `domainStore.ts`, `domainsService.ts`, `domainRules.ts`, `inboundService.ts`, `webhookService.ts`, `templatesService.ts`; `src/lib/jobs/handlers/email.ts`; rutas `email/domains/[id]/route.ts`, `email/domains/[id]/{verify,default}/route.ts`, `email/messages/[id]/{route,cancel/route}.ts`; UI `editor/blocks/BlockPreview.tsx`, `plantillas/PlantillasPage.tsx`, `configuracion/crm/email/EmailDomainsCard.tsx`; tests `__tests__/{roundTwo.test.ts,adversarialR2.test.ts}`.

**Ronda 4 (2026-09-09) — nuevos**: `src/lib/services/crm/email/renderPrimitives.ts` (interpolacion de props y saneado de valores, extraidos de `renderBlocks.ts`), `src/lib/services/crm/email/domainsSupport.ts` (contratos, DNS, extras y remitente global, extraidos de `domainsService.ts`), tests `__tests__/roundFour.test.ts`.

**Ronda 4 — modificados**: `src/lib/services/crm/email/{renderBlocks.ts,sanitize.ts,domainsService.ts}`; `src/components/crm/email/editor/blocks/{previewSanitize.ts,BlockPreview.tsx}`; tests `__tests__/adversarialR2.test.ts` (se borra la prueba por regex sobre el codigo fuente); `docs/crm-revenue-os/FASE-07-EMAIL-Y-PLANTILLAS.md`.

Sigue pendiente de eliminar (necesita F9): `src/components/crm/pipeline/EmailNotifications.ts` / `.tsx`, el `EmailDialog` de `ActivityActions.tsx:466-594` y los `mailto:` de `pipelineUtils.ts:78-90`, `CustomersTable.tsx:173,255`, `CustomerDetailsModal.tsx:65`, `HoyView.tsx:102,118`.

## 13. Registro de implementación

### 13.1 Ronda 1 (2026-09-08)

**Qué se hizo.** Se completó la fase entera salvo lo que depende de F9. Backend: render de 13 bloques + HTML, motor de variables, sanitizado, plantillas con seeds, dominios con Resend + DNS/DMARC, envío v2 (consentimiento fail-closed, fila antes de enviar, `Idempotency-Key` `email/{id}`, adjuntos ≤40 MB desde `documents`, `List-Unsubscribe` solo marketing/sequence, `Reply-To` `crm+{id}@…`, programación ≤30 d por `outbound_jobs`, tags `tenant_id`/`related`, **una sola** activity), webhook con svix fail-closed + idempotencia por `svix-id` + estados monótonos + opt-out, inbound `email.received`, baja `/u/[token]`, handler de jobs `email` (programado + lote ≤100 sin adjuntos) y borrador con IA con cobro de créditos. UI: editor visual de bloques con @dnd-kit, editor HTML, vista previa en iframe sandbox escritorio/móvil, selector de plantillas y de variables, compose completo, `/app/crm/plantillas` y la pestaña Email de Configuración › CRM.

**Bug real encontrado y corregido en la verificación en vivo.** Con el paquete `svix` REAL (v2.2.0) instalado, `Webhook.verify()` **valida pero devuelve `void`** (en 1.x devolvía el payload parseado). Por eso `verifyResendWebhook()` de `src/lib/security/webhookSignatures.ts:169-181` devuelve `undefined` y **todo webhook con firma válida respondía 500** (`Cannot read properties of undefined (reading 'created_at')`). Se corrigió de forma defensiva en `webhookService.ts:177-187`: se parsea el body **después** de que la firma haya sido validada, con 400 `invalid_json` / `invalid_payload` si no es un evento bien formado. La causa raíz está en un archivo de la zona compartida de solo lectura (`src/lib/security/**`) y se reporta a SEC. Cubierto por test (`webhook.test.ts`, caso "svix ≥2 (verify devuelve void)").

**Desviaciones respecto al plan.**
- Se consolidaron los 10 PRs del §12 en una entrega única.
- `src/app/u/[token]` se implementó como **route handler** (GET + POST en la misma URL) en vez de `page.tsx` + server action, para que el POST One-Click de Gmail funcione sin `next-action`.
- No se usan `@react-email/components` ni `juice`: el render de bloques emite tablas HTML con estilos inline directamente (`renderBlocks.ts`), sin dependencias nuevas (regla 8: solo REG instala paquetes).
- Los servicios viven en `src/lib/services/crm/email/**` (un módulo por responsabilidad, ≤300 líneas) en lugar de los nombres planos `emailRenderService.ts` / `emailTemplateService.ts` / `emailDomainService.ts` del plan.
- La pestaña WhatsApp de `/app/crm/plantillas` monta ya el componente real de F16 (`@/components/crm/whatsapp/WhatsAppTemplatesTab`) por `next/dynamic`; se eliminó el stub de solo lectura que F7 había dejado en `src/components/crm/plantillas/whatsapp/`.

**Pendientes.** *(revisados en la ronda 2: los tres puntos de SEC/F16/.env.example ya estaban resueltos cuando el tester los comprobó; se dejan tachados como registro)*
- F9 (**sigue abierto**): sustituir `EmailDialog` de `ActivityActions.tsx` y los `mailto:` por `ComposeEmailDialogFull`; `EmailPreviewCard` en el timeline; realtime de `email_messages`.
- ~~SEC: arreglar `verifyResendWebhook` para que devuelva el payload con svix ≥2~~ → **hecho** en `src/lib/security/webhookSignatures.ts:177-202`; desde la ronda 2 tiene cobertura jest con svix real (`__tests__/svixReal.test.ts`).
- ~~F16: `CrmConfigTabs.tsx:82` usa `<WhatsAppTab />` sin importarlo~~ → **hecho**, `CrmConfigTabs.tsx:25,84` importa y monta la pestaña.
- ~~`.env.example` sin las variables de F7~~ → **hecho**: ya declara `EMAIL_GLOBAL_DOMAIN`, `EMAIL_GLOBAL_FROM_NAME`, `EMAIL_UNSUBSCRIBE_SECRET` y `OPENAI_EMAIL_DRAFT_MODEL` (falta solo `EMAIL_CREDENTIALS_SECRET`, ver ronda 2).
- Verificación en vivo: rutas con sesión contra el servidor canónico **:3002** (307 sin sesión); webhook y `/u/[token]` por HTTP real contra **:3013** (401 sin firma / 200 "Enlace no válido"), porque en :3002 esas dos rutas se cuelgan compilando y :3010 tiene la caché `.next` corrupta. Además se ejecutó el route handler en proceso con el paquete `svix` real, que fue lo que permitió aislar el bug de `verify()`.

### 13.2 Ronda 2 (2026-09-08) — correcciones del informe del tester

**Entrada.** `TEST-F7-r1.md`: 202 casos, 188 correctos, **14 fallos** + 4 hallazgos por inspeccion, nota 8.0/10. Ademas el tester dejo `__tests__/adversarial.test.ts` con 61 tests, 6 de ellos marcados `[BUG]` documentando el comportamiento defectuoso.

**Que se hizo.** Los 14 fallos y los 4 hallazgos estan atendidos (tabla completa en §1.2). En orden de gravedad:

1. **XSS almacenada en `/u/[token]` (CRITICO).** El HTML de la pagina publica se construye ahora en `email/publicPage.ts`, que escapa **siempre** titulo, cuerpo y boton (son texto, nunca marcado) y devuelve cabeceras `Content-Security-Policy: default-src 'none'; style-src 'sha256-…'; script-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: no-referrer`. El `<style>` de la pagina se autoriza por hash, sin un solo `unsafe-inline`. El nombre de la organizacion se corta ademas a 120 caracteres.
2. **`settings.font` (ALTO).** `blocks.ts` valida `font` con `FONT_STACK_RE` (letras con acentos, digitos, espacio, coma, punto, guion y comilla simple; nunca `"`, `;`, `<`, `>`, `(`, `)`, `:`) y **normaliza** al stack por defecto cuando no encaja — se prefiere normalizar a rechazar para no romper documentos ya guardados. El render revalida con `safeFont`/`safeColor`/`safeAlign` y sanea tambien anchos, alturas y grosores numericos.
3. **`javascript:` por variable (ALTO).** `enforceSafeUrlAttributes` se aplica al HTML **ya interpolado** en los dos motores (crudo y bloques) e impone la misma allow-list que `safeUrl`. Cubre comillas dobles, simples y sin comillas, entidades numericas, `&colon;`, espacios y tabuladores dentro del esquema.
4. **svix real bajo jest (MEDIO).** `svix@2.2.0` es ESM puro y jest corre en CJS (`require` y `createRequire` fallan), que es justo lo que oculto el bug. `svixReal.test.ts` ejecuta `svixReal.harness.mts` con `tsx` en un proceso aparte: firma valida → payload parseado; JSON invalido → 400 `invalid_json`; firma invalida, cuerpo alterado y replay de 20 min → 401; sin secreto → 401 fail-closed; y se afirma la premisa (`verify()` devuelve `void`).
5. **Inbound dominio ↔ org (MEDIO).** `domainMatchesOrg` valida el dominio de `crm+{uuid}@…` contra el `reply_to` que emitio el propio servidor y, si no consta, contra `email_domains` de esa org o el dominio global.
6. **Lotes (MEDIO).** `groupBySender` agrupa por `email_domain_id::kind` y se envia un `batch.send` por grupo con su propio remitente.
7. **CAS agotado (MEDIO).** Tras 3 conflictos se borra la fila de `email_events` recien insertada (para que el reintento no choque con el `UNIQUE` de `provider_event_id`) y se lanza `WebhookError(503,'transition_conflict')`, de modo que Resend reintenta en vez de perder el contador.
8. **`test-send` (MEDIO).** El destinatario debe ser el correo del usuario autenticado o pertenecer a un dominio de la organizacion (`orgOwnsDomain`), y el envio de prueba **si** crea su activity (`metadata.test = true`, notas "Prueba de plantilla a …").
9. **Resto.** API keys de Resend cifradas en reposo (AES-256-GCM); zod en todas las rutas de email; fallback de error en la pestana de WhatsApp; DMARC con sufijos de segundo nivel; `<style>` conservado en saliente y descartado en entrante; base64 en linea validado con tope de 25 MB por adjunto; `custom.__amt` fuera de `used[]`; `variables.ts` y `domainsService.ts` de vuelta por debajo de 300 lineas.

**Decisiones tomadas.**
- `settings.font` fuera de la allow-list **se normaliza** (no se rechaza): `parseBlockDocument` se usa tanto para validar entrada como para renderizar documentos guardados, y rechazar dejaria plantillas antiguas sin renderizar.
- El `<style>` **se mantiene** en el camino saliente (`allowVulnerableTags: true` es deliberado: los clientes de correo necesitan CSS y el autor es un usuario de la org) y se **elimina** en el entrante, donde el autor es cualquiera de internet.
- Cifrado de credenciales **en el propio modulo de F7** y no en `src/lib/security/**` (zona de solo lectura). Es una mitigacion ante lectura de la tabla o un dump, no ante quien ya tenga el entorno del servidor; el sustituto definitivo sigue siendo Vault + `email_domains.api_key_secret_id`.
- El CAS agotado responde **503** (Resend reintenta) en vez de 200 silencioso; se acepta el coste de un reintento del proveedor a cambio de no perder contadores.

**Estado de los tests.** `npx jest src/lib/services/crm/email src/lib/security` → **13 suites verdes, 201 tests + 1 skip**. `adversarial.test.ts` pasa de 61 a **70 tests**, con los 6 `[BUG]` invertidos a `[CORREGIDO r2]` (y `<style>` reetiquetado `[DECISION r2]`); nuevos `roundTwo.test.ts` (38) y `svixReal.test.ts` (8). Se ajustaron dos fixtures propias: el adjunto de 41 MB de `adversarial.test.ts` ahora es base64 **valido** (multiplo de 4) porque el contenido en linea se valida de verdad, y el test de `sendService.test.ts` que afirmaba "test: sin activity" ahora afirma "una activity marcada como prueba".

**Harness del tester re-ejecutados sin tocarlos.** `f7-tester-svix.mts` 28/30 (los 2 "fallos" son W15, que ahora devuelve 503, y W29, informativo); `f7-tester-send.mts` 33/35 (S26 = `test:true` ahora crea activity; S24 = fixture con base64 inválido); `f7-tester-inbound.mts` 12/21 tal cual y **19/21 con la fixture corregida** (`ORIGINAL.metadata` no traía `reply_to`, que en producción siempre escribe `sendService.ts:215`), quedando como fallos solo U1 y J7 — los dos defectos ya corregidos.

**Verificacion.** `npx tsc -p scratchpad/tsconfig.f7b.json` → **0 errores en archivos de F7** (siguen los 2 de `chat/channels/website/**`, del baseline). `npx jest` completo → 59 suites verdes; las 2 rojas son `website/sectionContract.test.ts` (editor-web, ya roja antes) y `crm/__tests__/activityService.test.ts` (F9, archivo sin trackear que otro agente esta editando). Por HTTP real contra **:3002**: `/u/token-invalido` → 200 con la CSP y `nosniff` nuevos; las 8 rutas de email sin sesion → 307; `POST /api/email/webhook` sin firma → 401 `resend_signature_invalid`. La demostracion del payload XSS se hizo con `scratchpad/f7r2-u-token-http.mts`, que sirve el **route handler real** por HTTP con un PostgREST falso que devuelve `organizations.name = '<img src=x onerror=…>'` (la tabla `email_messages` esta vacia en el proyecto Supabase y no se puede escribir en BD): el nombre sale como `&lt;img src=x onerror=…&gt;` y las 9 comprobaciones pasan.

**Pendientes de la ronda 2.**
- `.env.example` (archivo compartido): anadir `EMAIL_CREDENTIALS_SECRET` (clave de cifrado de las API keys de Resend; sin ella se deriva de `EMAIL_UNSUBSCRIBE_SECRET` o de la service-role key). Bloque exacto en el informe `F7-r2.md`.
- SEC: `src/lib/security/__tests__/webhookSignatures.test.ts` sigue mockeando svix **1.x**; conviene que apunte a `svixReal.test.ts` o repita alli el harness.
- DB: `fn_can_contact` ignora `p_purpose`, asi que la distincion marketing/utility de `sendService.ts:86` hoy no tiene efecto; y `email_events.provider_event_id` es `UNIQUE` global (correcto con `svix-id`, pero el fallback `${type}-${email_id}-${occurredAt}` podria colisionar entre tenants).
- Sin probar todavia: UI en navegador con sesion, llamadas reales a Resend, RLS con dos JWT reales y concurrencia real sobre la misma fila.

### 13.3 Ronda 3 (2026-09-09) — correcciones del informe `TEST-F7-r2.md`

**Entrada.** `TEST-F7-r2.md`: 236 casos, **8 fallos nuevos** (2 con impacto de seguridad) y 4 items de la ronda 1 reclasificados como PARCIALES (2, 6, 8, 9). Nota 8,2/10.

**Punto de partida real.** Una ronda anterior quedo interrumpida a mitad: el arbol ya traia la mayoria de los arreglos aplicados pero con `roundTwo.test.ts` en rojo (2 casos que seguian afirmando el comportamiento ANTIGUO: `orgOwnsDomain` aceptando el dominio padre, y el prefijo `encv1:` del cifrado) y un error nuevo de `tsc` en `sanitize.ts`. Ambos cerrados.

**Que se hizo** (detalle con archivo:linea en §1.3):

1. **Escapado del texto literal de las props (ALTO, fallo #1).** `renderVariables` gana la opcion `escapeLiteral` y `renderBlocks` un helper `textProp` que la usa en las **14** props de texto libre. Antes solo se escapaba el VALOR sustituido de `{{...}}`, nunca el literal, asi que `alt: 'ACME" onerror="alert(1)'` rompia el atributo y `label: '<img src=x onerror=alert(1)>'` inyectaba una etiqueta entera. Las props de URL siguen pasando solo por `safeUrl` (escaparlas antes las escaparia dos veces) y las props `html` siguen pasando por `sanitizeFragment`.
2. **XSS almacenada en el canvas del editor (ALTO, fallo #2).** `BlockPreview` interpola ahora con `escapeHtml:true` y pasa el resultado por `sanitizePreviewHtml`, una allow-list cerrada construida sobre `DOMParser` (documento **inerte**: no ejecuta scripts, no dispara `onerror` y no descarga recursos). Ademas el `blocks_json` se sanea **al guardarlo** (`sanitizeBlockDocument`), asi que el dato en reposo tambien esta limpio y el filtro del cliente es la segunda capa, no la unica.
3. **Aislamiento de fallos del lote (MEDIO, fallo #3, regresion propia).** Cada grupo de remitente va en su try/catch; `sendPendingBatch` devuelve SIEMPRE el resultado parcial y marca lo no enviado como `retryable` (la fila sigue `pending`); el handler de jobs lanza `JobRetryableError` en vez de `JobFatalError`, asi que el reintento recoge esos correos y salta los ya enviados (`status_sent` -> `skipped`).
4. **Llavero de credenciales (MEDIO, fallo #4, regresion propia).** El valor cifrado pasa a `encv2:<kid>.<iv>.<tag>.<ct>`: el `kid` identifica la clave, al descifrar se prueban TODAS las disponibles y lo legible con una clave secundaria se re-cifra con la principal en la primera lectura. `encv1:` y las filas en claro se siguen leyendo. Lo que ninguna clave descifra se reporta como `unreadable` y la UI pide regenerar la API key en vez de decir que hay una.
5. **Resto:** `orgOwnsDomain` exige `status='verified'` y ya no acepta el dominio padre; `text.font_size` acotado; lista de sufijos DNS ampliada (com.pl, co.in, com.tr y mercados hispanohablantes/UE); el `error` del `update` del CAS llega al log; el inbound filtra `verified` tambien cuando no hay `reply_to`; los 5 `[id]` de ruta se validan como uuid; `logo_url` por variable deja de escaparse dos veces; `TabErrorBoundary` cubre el throw en render de las dos pestanas de plantillas; y las 6 referencias `archivo:linea` desplazadas de §1.2 estan corregidas.

**Verificacion.**
- `npx jest src/lib/services/crm/email` -> **12 suites, 211 tests + 1 skip, verdes**. `npx jest src/lib/services/crm/email/ src/lib/services/crm/__tests__/` -> 37 suites, **la unica roja es `f8Adversarial.test.ts` (F8)**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` -> **219 errores en 97 archivos** (misma cifra que midio el tester en r2; baseline 230), **0 en cualquier ruta de F7**.
- **Navegador real** (servidor estatico efimero en :3199 sirviendo `previewSanitize.ts` compilado con esbuild): 16 vectores contra `sanitizePreviewHtml`, montados en el DOM real -> **16/16 inertes, 0 `alert()`**, sin `script`/`iframe`/`svg`/`form`, sin atributos `on*`, sin `href` peligroso, y el marcado legitimo (estilo + enlace `https`) conservado.
- Harness del tester re-ejecutados: `f7r2-tester-batch.mts` muestra ahora resultado parcial sin excepcion y `retryable:true` (era el fallo #3).

**Dos avisos sobre los harness del tester** (defectos de los propios harness, no del codigo):
- `f7r2-tester-attrs.mts` cuenta los `on*` con una **regex**, asi que sigue reportando 7 sobre HTML ya escapado: `alt="ACME&quot; onerror=&quot;alert(1)"` es UN atributo inerte, no un manejador. Con un parser real (`htmlparser2`) el resultado es **0**, y eso es lo que afirma `roundThree.test.ts`.
- `f7r2-tester-misc.mts` (caso Z18) llama `decodeInlineBase64('QUJDRA==', 'a.txt')` con los argumentos **invertidos** (la firma es `(filename, content)`) y espera un `Buffer` donde la funcion devuelve un numero de bytes; por eso lanza y corta el script. Comprobado aparte: `decodeInlineBase64('a.txt','QUJDRA==') === 4`. `f7r2-tester-r2risks.mts` (caso B2) intenta reasignar `resolveSender` sobre un namespace ESM (solo-lectura), lo que lanza siempre; el mismo escenario esta ejecutado de verdad en `roundThree.test.ts`.

**Pendiente de la ronda 3.**
- **`.env.example` (archivo compartido, no editable por F7):** el comentario de la linea 176 (*"Sin ella, las credenciales por dominio no se guardan"*) es **falso** y es justo el que induce el fallo #4. Bloque de reemplazo exacto en el informe `F7-r3.md`.
- SEC: `src/lib/security/__tests__/webhookSignatures.test.ts` sigue mockeando svix **1.x**.
- DB: `fn_can_contact` ignora `p_purpose`; `email_events.provider_event_id` es `UNIQUE` global.
- Sin probar todavia: UI con sesion en el navegador, llamadas reales a Resend, RLS con dos JWT reales, concurrencia real sobre la misma fila y `sendPendingBatch` con 100 correos reales.

### 13.4 Ronda 4 (2026-09-09) — correcciones del informe `TEST-F7-r3.md`

**Entrada.** `TEST-F7-r3.md`: 347 casos, **9,0/10**. Los 8 fallos y los 4 parciales de r2 quedaron **cerrados y verificados por el tester con instrumentos propios** (parser real, navegador real con 42 vectores, el camino real del lote, 25 casos de criptografia y la BD dentro de `begin; ... rollback;`). Quedaron **5 hallazgos nuevos**, ninguno de seguridad: 1 MEDIO y 4 BAJOS. Detalle con archivo:linea en §1.4.

**Que se hizo.**

1. **Texto plano y preheader (MEDIO, fallo #1, regresion propia de la ronda 3).** El arreglo del escapado se habia propagado a la salida que NO debe llevar marcado. Ahora cada propiedad de texto libre tiene **dos** salidas explicitas y nunca se reutiliza una en el sitio de la otra: `textProp` (escapada) para el HTML y `plainProp` (sin escapar) para `text/plain`. El preheader se deriva del texto (`render.ts:109`), asi que se arregla con el mismo cambio. `columns` renderiza una sola vez y deriva de ahi las dos salidas (antes llamaba dos veces a `varsInHtml` y usaba el titulo **crudo** en el texto), y el importe de `quote_summary` se formatea sin escapar para la parte de texto.
2. **Cobertura del hueco que lo permitio.** `roundFour.test.ts` anade 14 casos sobre la salida `text` y el `preheader`.
   **Correccion de la causa raiz (tester r4, hallazgo #1):** la ronda 4 afirmo que era la primera suite que miraba esa
   salida, y es **falso**: `render.test.ts`, de la ronda 1, ya asertaba sobre `r.text` (incluido el del bloque `button`,
   uno de los afectados) y sobre la derivacion del preheader. El hueco real era otro y conviene no olvidarlo: **ninguna
   fixture llevaba `&`, comillas ni `<`**, asi que el escapado era una operacion nula y no habia nada que observar.
   Lo que protege esta fase no es mirar `text`, es que las fixtures lleven caracteres que el escapado altere.
   De los 14 casos, **uno** asserta sobre `html` y `text` del mismo objeto de render (el vector de inyeccion), cuatro miran
   solo `text`, uno solo `html`, tres el preheader y cinco no renderizan un correo. El par html/texto del vector de
   inyeccion es el que fija la disciplina.
3. **Hidratacion (BAJO, riesgo #2) — cerrado, no justificado.** La degradacion sin `DOMParser` pasa a ser publica (`previewTextFallback`) y `BlockPreview` la pinta hasta que monta (`useHydrated`), de modo que el HTML del servidor y el de la primera pasada de cliente son **la misma cadena**. En la practica hoy no habia flash visible (la ruta `/nueva` arranca con el documento vacio y `/[id]` con el esqueleto de carga), pero el riesgo estructural queda cerrado en vez de documentado.
4. **Prueba por regex borrada (BAJO, #3).** `adversarialR2.test.ts` ya no lee `batchService.ts` con una expresion regular; el escenario esta ejecutado de verdad en `roundThree.test.ts`.
5. **Afirmacion sobre la BD corregida (BAJO, #4).** Consultado por MCP antes de escribir: `provider_configs(category='email')` tiene **31 filas** (no cero), todas con `credentials = '{}'`. La conclusion operativa se mantiene (no hay nada que migrar) pero ahora esta medida.
6. **Higiene (BAJO, #5).** Referencias del doc corregidas y los dos modulos por encima del tope divididos: `domainsService.ts` 311 -> 255 y `renderBlocks.ts` (que con el arreglo se habia ido a 311) -> 222.

**Verificacion.**
- `npx jest src/lib/services/crm/email/` -> **13 suites, 224 tests + 1 skip, todas verdes**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` -> **220 errores** (baseline 230; el tester midio 232 con archivos de otros agentes en vuelo), **0 en cualquier ruta de F7**.
- Autocomprobacion fuera de jest (`scratchpad/f7r4-selfcheck.mts`, **23/23**): vuelca las dos salidas del render y el preheader con el caso exacto del informe (`Perez & Asociados`), cuenta los `on*` con `htmlparser2` y comprueba que un vector de inyeccion sale inerte en el marcado y literal en el texto.
- **BD por MCP** (proyecto `jgmgphmzusbluqhuqihj`, solo lecturas agregadas): `provider_configs` con `category='email'` = 31 filas / 0 con credenciales; `email_domains`, `email_messages`, `email_events` = 0 filas. Sin DDL, sin escrituras, sin archivos `.sql`.
- Sin correos: ningun envio real, ni a Resend ni a ninguna direccion.

**Pendiente al cierre de la ronda 4.**
- **`.env.example`** (archivo compartido): el bloque de reemplazo del comentario falso ya lo aplico el orquestador en la ronda 3 y esta verificado. Sin nada nuevo que pedir.
- SEC: `src/lib/security/__tests__/webhookSignatures.test.ts` ya imita svix >= 2 con guarda de version (aplicado por el orquestador); el harness con el paquete real sigue en `crm/email/__tests__/svixReal.test.ts`.
- REG: `jest-environment-jsdom` seguiria convirtiendo la verificacion en navegador de `sanitizePreviewHtml` en regresion automatica. **No bloqueante.**
- DB: `fn_can_contact` ignora `p_purpose`; `email_events.provider_event_id` es `UNIQUE` global.
- Sin probar: UI con sesion en el navegador, llamadas reales a Resend, RLS con dos JWT reales, concurrencia real sobre la misma fila y `sendPendingBatch` con 100 correos reales.
