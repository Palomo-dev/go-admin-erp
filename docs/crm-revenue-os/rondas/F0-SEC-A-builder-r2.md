# F0-SEC — sub-parte A: secretos reales y webhook de WhatsApp por entrada — constructor, ronda 2

Fecha: 2026-09-15. Insumos: `rondas/F0-SEC-qa-r1.md` (sub-parte A, instrucciones 1-4),
`rondas/F0-SEC-tester-r1.md` (fallos 1 y 3; anexo A, sonda de 36 tests con 18 rojos),
entrada «Seguridad — Secretos de relleno aceptados como buenos — 2026-09-10» de `PROGRESS.md`.
Sin cambios en la base de datos, sin credenciales reales, sin commits. Las organizaciones de
los tests son ficticias (7, 8, 9, 10).

## Qué se hizo en esta ronda

### 1. Un solo criterio de «secreto real»: `src/lib/security/secrets.ts` (nuevo)
- `secretProblem(value, min)` → `'missing' | 'placeholder' | 'too_short' | null`;
  `isRealSecret(value, min)`; `readRealSecret(name, { min, aliases })` → `string | null`;
  `requireRealSecret(name, { min, aliases, status, code })` → lanza `WebhookError`;
  `assertRealSecret(value, label, …)` para valores que no vienen de `process.env`
  (app_secret de un canal, token de subcuenta, secreto pasado por parámetro).
- Longitud mínima por defecto **16** (`DEFAULT_MIN_SECRET_LENGTH`); un `min <= 0` o `NaN`
  no desactiva la comprobación. `WS_SESSION_SECRET` exige **32**.
- Hacia fuera, «falta», «relleno» y «corto» devuelven el **mismo** código
  (`<name>_not_configured`, 401 por defecto): el motivo exacto va al log del servidor,
  **una sola línea por proceso y variable** (`reportOnce`), nunca el valor. Distinguirlo en
  la respuesta solo le diría a un tercero que el despliegue está mal configurado.
- `WebhookError` se movió a `src/lib/security/errors.ts` y `webhookSignatures.ts` la
  reexporta: así `secrets.ts` y `wsSessionToken.ts` la lanzan sin arrastrar twilio/svix/Supabase
  (el ws-server importa `wsSessionToken.ts` en Node puro). Ningún importador cambia.

### 2. `isPlaceholderCredential` ampliado (`src/lib/crm/providerCatalog.ts`)
Además de `your-…`/`SKxxxx…`, ahora son relleno: las palabras completas `changeme`,
`change-me`, `replace-me`, `todo`, `fixme`, `example`, `sample`, `secret`, `password`, `test`,
`dummy`, `placeholder`, `none`, `null`, `undefined`, `xxx`, `redacted` (con o sin prefijo de
proveedor: `whsec_changeme`); los prefijos `changeme-…`, `cambia-esto…`, `genera-uno…`,
`generate-…`, `todo-…`; y los huecos de plantilla `<…>`, `${…}`, `{{…}}`. Se compara contra
el **valor entero** a propósito: `sk_test_…` de Stripe o un secreto real que contenga `test`
no son relleno (caso negativo en el test). El test `secrets.test.ts` recorre el `.env.example`
real y comprueba que **todos** los valores de claves `*SECRET|*TOKEN|*_KEY|*PASSWORD|*AUTH`
no vacíos son relleno: si alguien pone ahí un valor que el sistema aceptaría, el test cae.

### 3. La capa `src/lib/security/` falla cerrada con relleno
| Verificación | Antes | Ahora |
|---|---|---|
| `verifyCronSecret` (y por tanto `withCron` de `orgContext.ts`, `jobs/run`, `health/recalculate`, `renewals/sync`, `voice-agents/campaigns/run`, `qr/dispatch-pending`) | `!process.env.CRON_SECRET` | `requireRealSecret('CRON_SECRET')` → 401 `cron_secret_not_configured` con relleno o < 16 |
| `verifyMetaSignature` | `!appSecret` | `!isRealSecret(appSecret)` → `false` aunque el HMAC cuadre |
| `verifyResendWebhook` | `!secret` | `assertRealSecret` → 401 `resend_webhook_secret_missing` **antes** de svix (`whsec_your-webhook-secret` base64-decodifica y svix lo aceptaría) |
| `resolveTwilioAuthToken` | devolvía `TWILIO_MASTER_AUTH_TOKEN` tal cual; token de subcuenta `\|\| null` | `readRealSecret` para master/legacy; `realSubaccountToken()` rechaza un token de relleno o corto guardado en `comm_settings` (log con el AccountSid, nunca el valor) |
| `verifyTwilioRequest` | `!opts.authToken` | `assertRealSecret` → 403 `twilio_auth_token_missing` |
| `verifyTwilioUrlSignature` (ws-server) | `!authToken` | `!isRealSecret(authToken)` → `false`; admite `params` opcionales |
| `wsSessionToken.getSecret()` | `!s` | `readWsSessionSecret()` = `readRealSecret('WS_SESSION_SECRET', { min: 32 })`; sin secreto real no se emite ni se verifica |
| `wsSessionToken.verify` | — | además rechaza `orgId` no entero o `<= 0` y `exp > now + 3600` (`MAX_TTL_SECONDS`, aplicado al verificar para que un emisor mal configurado se note) |
| `rateLimit.checkRateLimit` | `windowMs: 0` reiniciaba el cubo en cada hit y nunca bloqueaba | `windowMs <= 0 \| NaN` → bloqueado (fail-closed) |

Consumidores fuera de `security/` que el veredicto nombraba y ahora usan el mismo criterio:
`webhooks/elevenlabs/route.ts` (`readRealSecret('ELEVENLABS_WEBHOOK_SECRET')`),
`voice/twiml/ai-agent/route.ts` (`readWsSessionSecret()` antes de tocar la base),
`bridgeTokens.ts` (`readRealSecret('VOICE_CALLBACK_SECRET')` en vez de `length >= 16`: el literal
`genera-uno-con-openssl-rand-hex-32` de `.env.example` cumplía el 16),
`ws-server.ts` (`getTwilioAuthTokenForOrg` → `realSubaccountToken` + `resolveTwilioMasterAuthToken()`;
el aviso de arranque usa `readWsSessionSecret()`). `orgContext.ts` **no se tocó**: `withCron`
llama a `verifyCronSecret` y hereda el cambio.

### 4. Webhook de WhatsApp: autorización por entrada
- Nuevo módulo puro `src/lib/services/integrations/whatsapp/webhookAuthorization.ts`
  (`planWebhookAuthorization(payload, resolver, globalSecret)`), con el resolver contra la base
  inyectado desde la ruta. `whatsappCloudService` gana `findChannelsByBusinessAccountId(wabaId)`
  (aditivo) para los cambios sin `phone_number_id` (estado/calidad de plantillas, cuyo
  `entry.id` es el WABA).
- La ruta (`integrations/whatsapp/webhook/route.ts`): sin `X-Hub-Signature-256` → 403 antes de
  consultar nada; plan → `reject` (403 `mixed_channels` / `signature_secret_missing` /
  `too_many_channels`, con registro) o `verify` (un único secreto); `verifyMetaSignature` con ese
  secreto; `processWebhookPayload({ ...payload, entry: plan.entries })` solo con las entradas
  autorizadas. `META_APP_SECRET` (alias `WHATSAPP_APP_SECRET`) pasa por `readRealSecret`.

### 5. Tests
- `src/lib/security/__tests__/placeholderSecrets.test.ts`: la sonda del anexo A **tal cual**,
  sin cambiar expectativas: **36/36 verdes** (P1 1/1, P2 5/5, P3 5/5, P4 1/1, P5 3/3, P6 7/7,
  P7 6/6, P8 1/1).
- `src/lib/security/__tests__/secrets.test.ts` (47 casos): detector ampliado (positivos y
  negativos), `.env.example` entero, `secretProblem`/`min`, alias, códigos, registro único y
  sin valor, `assertRealSecret`.
- `src/lib/services/integrations/whatsapp/__tests__/webhookAuthorization.test.ts` (20 casos)
  y `src/app/api/integrations/whatsapp/webhook/__tests__/multiOrg.f0sec.test.ts` (16 casos,
  ruta real con HMAC calculado de verdad; solo se dobla el servicio de canales y el
  procesamiento): el caso exacto del tester (A firma con su secreto + `entry[1]` de B → 403 y
  ningún INSERT), orden invertido, A + canal de la plataforma, A + plantilla del WABA de B,
  A + WABA desconocido (200 y **solo** se procesa A), firmado por B, firmado con el global, dos
  organizaciones bajo la plataforma (200, ambas), `META_APP_SECRET` de relleno con firma que
  cuadra → 403, JSON inválido → 400, > 25 ids → 403 sin consultar.
- Existentes actualizados: `webhookSignatures.test.ts` (+2 casos de relleno; fixtures con la
  forma de secretos reales) y `wsSessionToken.test.ts` (secreto de 64).

### 6. `.env.example`
Tres comentarios: junto a `CRON_SECRET` (todo `your-…`/`changeme`/`cambia-esto…` del archivo es
relleno y nunca válido; mínimo 16, WS 32), en la convención del bloque CRM (lista de variables que
`secrets.ts` trata así) y junto a `WS_SESSION_SECRET` (32, `openssl rand -hex 32`). Ningún valor
cambió.

## Feedback de la ronda anterior que se atendió
- **[crítico 1] Secretos de relleno aceptados por toda la capa `security/`** → cerrado con
  `secrets.ts` + tabla del punto 3; sonda 36/36 verde; `.env.example` custodiado por test.
- **[alto 4] Webhook de WhatsApp: firma con el secreto del primer `phone_number_id` y
  procesamiento de todas las entradas** → cerrado con `planWebhookAuthorization`: ámbito único
  por payload, 403 `mixed_channels`, descarte de entradas no resolubles bajo secreto de canal.
- **Instrucción 2 (lista de sitios)**: `verifyCronSecret`, `getSecret()` de `wsSessionToken`
  (min 32), `verifyResendWebhook`, `resolveTwilioAuthToken` (master, legacy y subcuenta),
  `resolveAppSecret` del webhook (ahora dentro del plan: canal → `isRealSecret`, global →
  `readRealSecret`), `verifyMetaSignature`, `webhooks/elevenlabs`, `voice/twiml/ai-agent`,
  `bridgeTokens.ts`. Todos hechos.
- **Instrucción 4 (adoptar el anexo A sin cambiar expectativas)**: hecho; P6 (orgId 0/-1, tope
  de TTL) y P7 (`windowMs: 0`) también verdes, con cambios mínimos en `wsSessionToken.ts` y
  `rateLimit.ts`. Los casos «replay N veces», «persistentCount lanza → fail-open» y
  «`checkRateLimits` consume claves previas» siguen verdes porque **documentan el comportamiento
  actual**; cambiarlo (jti, fail-closed de `persistentCount`, evaluación previa de claves) es de
  la sub-parte D y exigirá actualizar esas tres expectativas allí.

## Decisiones de diseño relevantes
- **Webhook multi-organización: rechazar todo, no procesar parcialmente.** Hay UNA firma por
  cuerpo y la calcula UNA app de Meta; «verificar por entrada» no tiene sentido criptográfico.
  Lo que sí se hace por entrada es resolver a qué secreto pertenece (canal por `phone_number_id`,
  o WABA por `entry.id` para plantillas) y exigir que **todas** coincidan. Dos secretos de canal
  distintos, o un secreto de canal más el global, → 403 `mixed_channels` y registro con las
  organizaciones implicadas. Un payload legítimo de Meta nunca mezcla apps, así que el 403 no
  cuesta ningún evento real y hace ruidoso el intento. Bajo el secreto **global** (app de la
  plataforma) sí pueden ir varias organizaciones en un payload: es el caso normal del Embedded
  Signup y ninguna organización cliente conoce ese secreto.
- **Entradas no resolubles.** Bajo secreto de canal se descartan (con aviso e índices): sin esto,
  A podía colar una plantilla de un WABA desconocido y `applyTemplateStatusUpdate`, que busca por
  `meta_template_id` en todas las organizaciones, tocaría plantillas (y pausaría campañas) de B.
  Bajo secreto global se procesan todas: `processWebhookPayload` ya ignora los números
  desconocidos y las plantillas las firmó Meta.
- **`app_secret` de relleno en `channel_credentials` = sin secreto propio** → el canal cae al
  global (que a su vez tiene que ser real). No se rechaza de plano porque una organización que
  guardó `your-app-secret` por error y opera bajo la plataforma seguiría funcionando como hasta
  ahora; lo que nunca ocurre es que ese relleno valide una firma.
- **Tope de 25 identificadores distintos por payload** (`MAX_LOOKUPS`): un cuerpo con miles de
  `phone_number_id` inventados produciría miles de consultas antes de verificar la firma.
- **Código de error uniforme y registro único.** Ver punto 1. `_resetSecretReports()` existe
  solo para tests.
- **Tope de TTL del token ws aplicado al verificar.** `issueWsSessionToken` no recorta ni lanza
  para que la sonda («ttl 1 año → null») pase sin cambiar su expectativa y para que un emisor mal
  configurado falle en el handshake, visible, en vez de emitir tokens silenciosamente recortados.
- **`orgContext.ts` intacto** (la sub-parte C lo rediseña): hereda el cambio a través de
  `verifyCronSecret`.
- **Longitud mínima 16 / 32 y el entorno real.** Comprobado por longitud, sin imprimir valores,
  que en `.env.local` `CRON_SECRET`, `META_APP_SECRET`, `TWILIO_*_AUTH_TOKEN` (32),
  `RESEND_WEBHOOK_SECRET` (38), `WS_SESSION_SECRET` y `VOICE_CALLBACK_SECRET` (64) superan el
  mínimo. **El orquestador debe confirmar lo mismo en Vercel y Railway antes de desplegar**: un
  `WS_SESSION_SECRET` real pero de menos de 32 caracteres apagaría el agente de voz (TwiML de
  «no configurado» y 401 en el upgrade).

## Verificación
- `npx jest src/lib/security src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/__tests__/guardrails.test.ts`
  → **9 suites, 219 tests, todos verdes** (guardarraíles 67/67 incluido el caso 7 sobre la ruta
  del webhook, que sigue importando `verifyMetaSignature` de `webhookSignatures`).
- Suites de otras fases que fijaban secretos de prueba: `f3Round3Routes`, `f3f5Round4/5/6/7/8*`,
  `f6Adversarial`, `f4Webhook`, `f11*`, `jobs/*`, `email/*`, `services/__tests__/*`
  → verdes tras alargar los fixtures (`'ws-secret-for-tests'` → 52 caracteres,
  `'secreto-de-prueba'` → 50, `'wsec_test_f4'` → 34) y actualizar dos afirmaciones de texto de
  `f6Adversarial` (G3: `if (!readWsSessionSecret())`; H1: `requireRealSecret('CRON_SECRET', …)`)
  que comprobaban la forma antigua del código. Ninguna expectativa de comportamiento cambió.
- `tsc` acotado a los archivos tocados (tsconfig temporal, borrado): **0 errores** en
  `security/**`, `whatsapp/webhook/**`, `orgContext.ts`, `webhookAuthorization.ts`,
  `providerCatalog.ts`, `ws-server.ts`, `bridgeTokens.ts`, `elevenlabs/route.ts`,
  `ai-agent/route.ts`. El `tsc` completo se detiene hoy en un error **sintáctico** ajeno
  (`src/components/crm/shared/EntitySearchList.tsx:80`, archivo sin seguimiento de otra fase),
  que impide que reporte los semánticos; por eso la comprobación acotada.
- `npx jest` completo: ver el resumen al final de este informe.

## Pendientes que dejo explícitamente para revisión
1. **`src/lib/crm/providerCatalog.ts` es archivo compartido en este momento**: mientras trabajaba,
   otro constructor (F0-REG, «QA r1 bajo 18») amplió `isFillerCredential` (relleno corto sin
   prefijo). Los dos cambios conviven y los tests de ambos pasan; el tester debe verlo como un
   único diff.
2. **Fuera del alcance de A pero del mismo tipo**, para que el orquestador decida dónde caen:
   - `src/app/api/webhooks/{facebook,instagram}/[channelId]/route.ts` verifican la firma **solo
     si el canal tiene `app_secret`** y procesan igualmente si no lo tiene (fail-open), con
     `metaMessagingService.verifySignature` que acepta relleno. Están en la allow-list del
     guardarraíl 7.
   - Rutas cron del ERP (no CRM) que comparan `process.env.CRON_SECRET` a mano:
     `api/cron/{expire-old-notifications,expire-pending-web-orders,reconcile-web-orders,update-exchange-rates}`,
     `api/web-orders/[id]/{auto-confirm,refund,release-stock}`, `api/integrations/qr/expire-sessions`;
     y `services/website/revalidarCatalogoWeb.ts` que **envía** `CRON_SECRET` como
     `x-webhook-secret`. Deberían pasar por `verifyCronSecret`/`readRealSecret`.
   - `twilioConfig.ts:18`, `twilioWebhook.ts:36` (deprecated, sin llamadores),
     `recordingStorageService.ts:90`, `templateProvider.ts:105`, `metaMarketingService.ts:152/176`,
     `meta/oauth/callback`, `whatsapp/oauth/callback` leen los tokens en crudo para llamar a la
     API del proveedor (no para verificar firmas): con relleno fallan contra el proveedor, no
     abren nada, pero convendría unificar. Intenté `twilioWebhook.ts` y lo revertí: importar
     `webhookSignatures` arrastra svix (ESM) a dos suites que no lo doblan.
   - `whatsappCloudConfig.verifyWhatsAppWebhookSignature` (comparación no constante, sin
     comprobación de relleno) sigue existiendo sin llamadores fuera de
     `whatsappCloudService.verifySignature`, que tampoco tiene llamadores. Candidata a borrar en D.
3. Sub-parte D hereda de la sonda: `jti`/consumo único del token ws, `persistentCount` que lanza
   debe bloquear, `checkRateLimits` evaluar antes de registrar. Las tres expectativas están en
   `placeholderSecrets.test.ts` P6/P7 documentando el comportamiento actual.
4. No hay `integration_events` por cada rechazo (`mixed_channels`, cron con relleno…): sigue
   siendo `console.warn/error`. Es el punto «para el 10» del veredicto.

## `npx jest` completo (resumen)
`Test Suites: 6 failed, 1 skipped, 239 passed · Tests: 34 failed, 1 skipped, 4312 passed`.
Ninguno de los rojos es de esta sub-parte:
- `src/lib/services/website/__tests__/sectionContract.test.ts`: los 2 fallos conocidos (CLAUDE.md, F2.6 pendiente).
- `src/__tests__/pos-display/{transport,qa-transport-edge}.test.ts` (archivos sin seguimiento de otra fase) y
  `src/lib/services/crm/__tests__/f10Round{1Tester,2TesterB}.test.ts`: **verdes al ejecutarlos aparte**
  (114/114 y 79/79); caen solo dentro de la corrida completa en paralelo (tiempos de espera), sin relación con
  secretos ni con el webhook. El sexto «failed» es el mismo `sectionContract` contado por suite.
