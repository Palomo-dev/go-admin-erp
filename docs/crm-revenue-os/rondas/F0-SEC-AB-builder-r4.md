# F0-SEC — sub-partes A + B: H4 cerrado por los dos lados, lista blanca de reportes en servidor, rate limit del webhook y guardarraíl de bytes de control — constructor, ronda 4

Fecha: 2026-09-16. Base: `main` = `1c2fe2e5` al empezar (durante la ronda otras sesiones
avanzaron `main` hasta `e3972da7`; ver «Incidencia de coordinación» al final). Insumos:
`rondas/F0-SEC-AB-qa-r3.md` (7,8/10; obligatorios 1–4, opcionales 5–7),
`F0-SEC-AB-tester-r3.md`, `F0-SEC-AB-builder-r3.md`, los 4 `testerR3.f0sec.test.ts`.
Sin ramas, sin commits, sin tocar la base de datos (ni una consulta). Organizaciones de los
tests ficticias (7, 8, 9); secretos inventados. **No se tocaron** `organizationBody.ts`,
`rateLimit.ts`, `rateLimitStore.ts`, `orgContext.ts`, `wsSessionToken.ts` ni rutas F10–F13.

## Obligatorios

### 1. H4 — cerrado en el plan Y en el procesamiento
`src/lib/services/integrations/whatsapp/webhookAuthorization.ts`
- **Regla 1 reescrita por `field`.** Los `field` de plantilla (`message_template_*`,
  `isTemplateField` exportada) se resuelven SIEMPRE por el WABA `entry.id`, nunca por
  `metadata.phone_number_id`. Si un cambio de plantilla trae número —Meta no lo envía ahí—
  se descarta como anomalía con el motivo nuevo **`phone_number_on_template_change`**, en
  todo ámbito (también bajo la app de la plataforma: `DROP_IN_ANY_SCOPE`), sin consultar la
  base, y la ruta lo registra (`droppedChanges` también se rellena en ámbito global).
- **Regla general de coherencia número ↔ WABA (`entry_waba_mismatch`).** Si una `change`
  resuelve por número y el `entry.id` de su entrada resuelve a canales que no comparten ni
  ámbito ni organización con el número, la `change` carga con los dos ámbitos y el payload
  entero cae en la regla 2 → **403 `mixed_channels`**. Desviación deliberada respecto al
  «descartar la change» que sugería el QA: rechazar todo es más fuerte (nada se procesa) y
  conserva el contrato que ya fijaban r2/r3 (`{waba-b, [pn-a, plantilla de B]}` firmado por A
  → `mixed_channels`, esperado en `testerR2`, `testerR3`, `webhookCoercion` y `multiOrg`;
  con el descarte habría pasado a `invalid_signature` y rompía tres suites del tester). Un
  WABA que no resuelve a nadie no contradice al número (canal sin `business_account_id`
  guardado) y un WABA de la misma organización tampoco (dos números del mismo WABA, uno con
  `app_secret` y otro sin él: un solo tenant). Coste: una consulta por WABA distinto,
  memoizada; cuenta en `MAX_LOOKUPS`.
- Cabecera actualizada (reglas 1, 4, 5 y la nueva 6: «lo que el plan autorizó viaja al
  procesamiento»).

`src/lib/services/integrations/whatsapp/whatsappCloudService.ts`
- **`processWebhookPayload(payload, { authorizedOrganizationIds? })`** (`ProcessWebhookOptions`,
  exportado también desde `index.ts`). Plantillas: `applyTemplateStatusUpdate` recibe
  `wabaOrgs ∩ authorized`; intersección vacía → aviso y `continue`. Mensajes: si
  `channelInfo.organizationId ∉ authorized` → aviso y `continue`. `undefined` = ámbito global
  (sin intersección, como en r3); `[]` = nadie (fail-closed). La rama de plantillas usa
  `isTemplateField` (cubre los `field` que Meta añada con ese prefijo).

`src/app/api/integrations/whatsapp/webhook/route.ts`
- Pasa `{ authorizedOrganizationIds: plan.scope === 'channel' ? plan.organizationIds : undefined }`.

Tests: quitados los dos `.failing` (ahora verdes sin `.failing`). Reescrito el «evidencia
del hueco» de la ruta (ahora: 403 `invalid_signature`, `lookups = []`, sin procesamiento;
y bajo el global: 200 con la change descartada y registrada) y el del servicio (plan
`reject`, sin consultas, sin `updates`). Nuevos en `webhookProcessing.f0secR3.test.ts`:
«`[7]` + WABA de `[8]` → `applyTemplateStatusUpdate` no se llama», «`[8, 9]` → exactamente
`[8]`», «global → sin intersección», «`[]` → nadie», «plantilla con número → se resuelve por
WABA, el número ni se consulta», «mensajes de un canal no autorizado → se saltan». Nuevo
`describe` «coherencia número ↔ WABA» en la ruta (4 casos + mismo tenant). Mutaciones
comprobadas a mano: quitar la intersección del servicio o el descarte del plan deja rojos
los casos correspondientes.

### 2. `modulosActivos` se resuelve en el servidor (regla dura 6)
`src/app/api/ai-assistant/reportes/route.ts`
- `resolveModulosActivos`: `moduleManagementService.getActiveModules(ctx.organizationId,
  ctx.supabase)` (cliente de sesión, misma fuente que la página `app/reportes`) `.map(code)`;
  si el body trae `modulosActivos`, **intersección** (nunca unión) y aviso con los códigos
  fuera del plan; tipos raros no amplían nada. `modulosActivos` deja de ser obligatorio en el
  400. `context.userRole` del body se sustituye por `ctx.roleName || 'miembro'` (solo texto
  del prompt: los permisos no salen de ahí).
- Tests (`reportes/__tests__/testerR3.f0sec.test.ts`, mock de `moduleManagementService`):
  org 7 sin `hrm` + body `['hrm']` + modelo pide `hrm-nomina` → «no está disponible»,
  `payroll_periods` NO se consulta, `getActiveModules(7, SESSION_CLIENT)`, aviso «fuera del
  plan»; con `hrm` en el plan sí se ejecuta; el body restringe; sin `modulosActivos` se usan
  todos los del plan; `userRole` inventado no llega al prompt. Invertida la expectativa del
  caso «viene del body». `reportesSessionClient.f0secR3.test.ts`: mock del módulo añadido.

### 3. Rate limit por IP en el webhook + `MAX_LOOKUPS = 10`
- `route.ts`: `checkRateLimit(`wa_webhook:ip:${getClientIp(request)}`, { limit: 120,
  windowMs: 60_000 })` **antes** de parsear el JSON y de planificar → 429 `rate_limited` con
  `Retry-After`. Solo se consume `rateLimit.ts`, no se edita (la constante no se exporta:
  un `route.ts` solo puede exportar handlers y config de Next).
- `MAX_LOOKUPS = 10` (`webhookAuthorization.ts`). Tests: 121.ª petición → 429 sin
  `findChannelByPhoneNumberId` ni procesamiento, otra IP no comparte cubo, 429 antes del
  JSON; 9 números + WABA → ≤ 10 consultas antes del 403; 10 números + WABA = 11 →
  `too_many_channels` sin consultar. Los tests importan `MAX_LOOKUPS` en vez de cablear 25/26.

### 4. Byte NUL y guardarraíl
- `services/…/__tests__/testerR3.f0sec.test.ts:189`: `'pn-a\u0000'` como secuencia de
  escape. `file` → «JavaScript source, Unicode text, UTF-8 text»; `git diff` textual.
- `src/__tests__/guardrails.test.ts`: **caso 21 nuevo al final** (`describe` de nivel
  superior, fuera del bloque existente): ningún `.ts/.tsx` bajo `src/` (tests incluidos,
  bytes crudos vía `latin1`) contiene `[\x00-\x08\x0B\x0C\x0E-\x1F]`; sin allow-list;
  informa `archivo:línea (0xNN)`. Comprobado con una sonda con NUL (rojo) y retirada.
- **Excepción documentada a «sin tocar lo existente»:** el propio `guardrails.test.ts`
  llevaba un byte **0x01** en el regex de cron strings del caso JOBS (`:1208`, donde tenía
  que ir `\1`, la retrorreferencia de la comilla). Ese regex nunca casaba: la guarda estaba
  muerta. Se sustituyó el byte por `\1` (un byte, lejos de `localHelpersMatching`/`WEBHOOK_RE`)
  tras comprobar que no aparece ningún ofensor en `lib/jobs`, `api/crm/jobs` ni
  `components/crm/config`; sin ese arreglo el caso 21 no podía estar verde.
- Durante la ronda el caso 21 detectó además NUL crudos en `src/lib/utils/postgrestFilters.ts`
  y `src/lib/services/crm/__tests__/f12Misc.test.ts` (archivos nuevos de otra sesión); esa
  sesión los corrigió por su cuenta antes del cierre. Hoy: 0 archivos con bytes de control.

## Opcionales
5. **`readOrgBody(ctx, body.context)`** (sobrecarga síncrona) en la ruta de reportes:
   `context.organizationId` ajeno → 403 `FOREIGN_ORGANIZATION` + `console.warn`, antes de
   OpenAI, créditos, RPC y módulos. Test invertido (antes «se ignora sin 403»).
6. **Idempotencia de plantillas**: `templateEventKey(update, entry.time)` →
   `<field>:<event>:<time>` (solo con `time` entero no negativo o su decimal en string);
   `applyTemplateStatusUpdate(…, eventKey)` (5.º parámetro opcional, compatible) salta las
   filas con `metadata.last_webhook_event === eventKey` y lo escribe al aplicar. Test: mismo
   cuerpo dos veces → segunda sin `updates` y la campaña reanudada no se vuelve a pausar;
   otro `time` sí aplica; sin `time` o con tipo raro se aplica como en r3.
7. **Docs**: `FASE-00-FUNDACIONES.md` (fila nueva en la tabla de migraciones aplicadas:
   `f00_40` APLICADA, 216 → 184, `fn_rate_limit_hit` existe, `RATE_LIMIT_STORE=db`
   pendiente en Vercel) y `docs/hallazgos/F-11.md` (estado y sección «Actualización
   2026-09-16»).

## Verificación
```
TZ=UTC            npx jest src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp
                           src/app/api/ai-assistant/reportes src/lib/services/crm/whatsapp src/__tests__/guardrails.test.ts
                  → Test Suites: 25 passed · Tests: 507 passed
TZ=America/Bogota → Test Suites: 25 passed · Tests: 507 passed
tsc (heap 8 GB, proyecto entero): 0 errores en los archivos tocados (los 10 que reporta son
  errores de sintaxis en crm/health y crm/onboarding/templates, archivos en edición de otra sesión)
eslint sobre los 14 archivos tocados: limpio
git diff --numstat: ningún «-» (sin binarios); 0 bytes de control bajo src/
```
Una ejecución en UTC dio 2 rojos en los tests del rate limit mientras otra sesión reescribía
`rateLimit.ts` en el árbol (`git diff` lo muestra a medias); las tres repeticiones siguientes
en UTC pasaron 43/43. Solo se consumen `checkRateLimit` y `getClientIp`, presentes en ambas
versiones.

## Incidencia de coordinación (leer antes de `git stash pop`)
A mitad de ronda otra sesión hizo `git stash` del árbol completo (`stash@{0}`, «WIP on main:
e3972da7», 74 archivos) y commiteó `328f1f73` y `e3972da7`. Mis 15 archivos quedaron dentro
del stash y fuera del árbol. Se restauraron desde `stash@{0}` con `git show stash@{0}:<ruta>`
uno a uno **solo si el archivo estaba limpio respecto a HEAD**; `guardrails.test.ts` no se
restauró del stash (HEAD ya llevaba el cambio de `328f1f73` sobre él): se reaplicó el parche
(byte `\1` + caso 21) sobre la versión de HEAD. El stash **sigue existiendo** y contiene
también el WIP de otras sesiones (63 archivos ajenos): quien lo haga `pop` verá conflictos en
mis 15 archivos (contenido idéntico) y en `guardrails.test.ts` (base anterior al commit). No lo
he tocado: decide el coordinador.

## Archivos tocados
`src/lib/services/integrations/whatsapp/{webhookAuthorization,whatsappCloudService,index}.ts`,
`src/lib/services/integrations/whatsapp/__tests__/{testerR3.f0sec,webhookProcessing.f0secR3,webhookCoercion.testerR2}.test.ts`,
`src/app/api/integrations/whatsapp/webhook/route.ts` y `__tests__/testerR3.f0sec.test.ts`,
`src/lib/services/crm/whatsapp/webhookTemplateStatus.ts`,
`src/app/api/ai-assistant/reportes/route.ts` y `__tests__/{testerR3.f0sec,reportesSessionClient.f0secR3}.test.ts`,
`src/__tests__/guardrails.test.ts` (caso 21 + 1 byte), `docs/crm-revenue-os/FASE-00-FUNDACIONES.md`,
`docs/hallazgos/F-11.md`, este informe.

## Qué falta para el 10 (sin cambios respecto al QA r3)
- `integration_events` por cada rechazo del webhook (`mixed_channels`, `invalid_signature`,
  `rate_limited`, descartes) con `request_id`, y test.
- Vault para `channel_credentials.credentials.app_secret` (F16/REG).
- `RATE_LIMIT_STORE=db` en Vercel (fuera del código).
