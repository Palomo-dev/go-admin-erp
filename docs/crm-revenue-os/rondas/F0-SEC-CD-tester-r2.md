# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — tester, ronda 2

Fecha: 2026-09-15 (noche). Rama `main`, sin ramas ni commits. BD **solo SELECT** por MCP
(`jgmgphmzusbluqhuqihj`). Modo «inspeccionar y completar»: el tester anterior de esta ronda
murió por apagado sin informe; dejó en el scratchpad una sonda de 66 casos (`sondaCD.test.ts`)
y un inventario estático (`audit.js`). Se ejecutó la sonda (66/66 verdes: sus casos «ESQUIVE»
documentan huecos reales), se adoptó lo útil en un test del repositorio y se completó lo que
faltaba: rutas reales, guardarraíl 5 bajo mutación, inventario cruzado, tsc, BD.

Insumos: `F0-SEC-CD-builder-r2.md` (entero), `F0-SEC-qa-r1.md` (10–19), `F0-SEC-tester-r1.md`
(fallos 6, 7, 14; sondas P7/P8). Ajeno y solo reportado: `api/crm/{roi,demos,proposals,contracts,
payments,webhooks/stripe,webhooks/documenso,health,onboarding,renewals,partners,referrals,
commissions,sales-targets,seller-dashboard}/**`, `webhookAuthorization.ts`, `ai-assistant/reportes`.

Nota de rutas: el encargo cita `src/lib/auth/orgContext.ts` y `orgAdmin.ts`; en el árbol viven en
`src/lib/utils/`. `src/lib/auth/` existe (`accountSwitcher`, `checkProvider`) y se incluyó en la
ejecución de jest por completitud.

## Resumen

- El **punto único** (`readOrgBody`) hace lo que dice en JSON, multipart, form-urlencoded y query,
  con «7» ≡ 7, alias, 400 para body inválido y 403 + `console.warn` para org ajena. Está aplicado en
  **137 llamadas / 112 archivos**; ninguna ruta de escritura de `crm/**` ni `ai-assistant/**` de
  este alcance acepta la organización del body sin pasar por él o por el predicado compartido.
- **Sin embargo el 403 no siempre llega al cliente**: `ai-assistant/attachments` y
  `ai-assistant/transcribe` envuelven la llamada en un `try/catch` que convierte CUALQUIER error en
  400 «Petición mal formada» / «tiene que ser multipart». El registro sí ocurre y no se escribe nada,
  pero el contrato (403 `FOREIGN_ORGANIZATION`) se incumple y el guardarraíl 5 no lo ve (fallo 1).
- El **guardarraíl 5 por handler** mata la mutación «quitar `readOrgBody` de `tasks` POST», pero
  **sobrevive** «quitar `readOrgBody` del `DELETE` de `stages/[id]`»: `localHelpersMatching` corta el
  cuerpo de un helper local en la siguiente *declaración* que casa (`function x`/`const x = (`), no en
  la siguiente línea de nivel superior, así que un helper declarado antes de los handlers (`fail`,
  `errorResponse`, `getOpenAIClient`…) «absorbe» el texto de los handlers y hereda su `readOrgBody`.
  **33 de 176 handlers (19 %) en 25 archivos** quedan sin vigilancia efectiva (fallo 2). Además,
  `WEBHOOK_RE` contiene `isPlaceholderCredential`: mencionarlo exime del guardarraíl (mutación M17
  sobrevive; hoy nadie lo explota).
- `readOrgBody` mira **solo la primera clave presente**: `{organization_id: 120, organizationId: 999}`
  y `{organization_id: '', orgId: 999}` pasan sin registro (fallo 3).
- Sub-parte D: `rateLimit` fail-closed y «evaluar todo, luego registrar» verificados, incluido bajo
  concurrencia con store atómico simulado y «reinicio» de instancia; la migración
  `rate_limit_buckets` **ya está aplicada** (la aplicó otra sesión durante esta ronda; verificada por
  SELECT: RLS on, 0 políticas, EXECUTE solo `service_role`). Queda una carrera en el camino legado
  `persistentCount` (5 de 5 pasan con `limit: 3`), sin consumidor hoy. `jti` de un solo uso verificado
  y matado por mutación. `orgAdmin` decide por id/permiso; `check_user_permission(uuid,int,text)` y
  `admin.full_access` existen en BD; una RPC que **lanza** (no que devuelve `{error}`) se propaga →
  500 en vez de denegar.
- **18 mutaciones: 16 muertas, 2 supervivientes** (las dos del guardarraíl 5). Restauración byte a
  byte verificada por md5 en las 18.
- jest (`guardrails` + `security` + `auth` + `utils/__tests__` + `api/__tests__`): **17 suites, 415
  tests verdes** en `TZ=UTC` y `TZ=America/Bogota`. tsc: **0 errores en el alcance**; 13 ajenos.

## Tabla de verificación (QA 10–19, fallos 6/7/14, P7/P8)

| Punto | Estado | Evidencia (archivo:línea · test) |
|---|---|---|
| QA 10 punto único + registro | ✅ parcial | `src/lib/security/organizationBody.ts:110-124` (`assertNotForeign`: `console.warn` + `OrgContextError(403,'FOREIGN_ORGANIZATION')`), `:126-169` (query, multipart/form, JSON, 400 `INVALID_JSON`/`INVALID_BODY`); `orgContextError.ts` clase única (`instanceof` cruza: `organizationBody.test.ts`). Helpers F10/F12/F13 delegan en `foreignOrganizationInBody` (`grep`: `f10RouteHelpers.ts`, `f12RouteSupport.ts`, `f13RouteSupport.ts`, `voiceLibrary.ts`). `withWhatsAppRoute`: `noOrgInBody` retirado (`schemas.ts:38` solo lo menciona en comentario; `whatsapp/send/route.ts:24`). Falta: `integration_events` por rechazo (el constructor lo deja pendiente); y el 403 se pierde en 2 rutas (fallo 1). Tests: `organizationBody.test.ts`, `orgBodyRoutes.f0sec.test.ts`, `testerR2CD.f0sec.test.ts` C1. |
| QA 11 aplicar a ~99 + 15 wa + 17 IA; crons a `withCron` | ✅ | 112 archivos con `readOrgBody` (`grep -rl`), 137 llamadas. Inventario §(b): en el ámbito estricto, los 25 archivos sin `readOrgBody` que leen org son F10–F13 (`rejectForeignOrganization`/`foreignOrganizationInBody`, ajenos) o cron (`health/recalculate`, `renewals/sync` con `verifyCronSecret` —F11, ajenos—; `voice-agents/campaigns/run` ya con `withCron`). |
| QA 12 admin sin nombres; test rol 99 | ✅ | `src/lib/utils/orgAdmin.ts:41-43` (solo `isSuperAdmin` o `role_id ∈ [1,2]`; `roleName` no participa). `orgContext.ts:316-336` `hasOrgAdminOrPermission` con `p_user_id`/`p_organization_id` de la sesión; `withOrg({admin})` y `withWhatsAppRoute({admin})` la usan (`orgContext.ts:440`, `whatsapp/http.ts:32`). BD (SELECT): roles 1 «Super Admin», 2 «Admin de organización»; 0 roles con esos nombres y otro id; `check_user_permission(p_user_id uuid, p_organization_id integer, p_permission_code text)` y `permissions.code='admin.full_access'` existen. Tests: `orgAdmin.test.ts`, `orgContext.f0sec.test.ts`, `testerR2CD` C3. Mutaciones M8/M10/M12 muertas. Pendiente: RPC que lanza → 500 (fallo 5). |
| QA 13 guardarraíl por handler; allow-list documentada; ENOENT | ⚠️ | `src/__tests__/guardrails.test.ts:227-499`: `splitHandlers`, `inlineAliases`, `STRICT_ALLOWLIST` con motivo (6 entradas F10–F13, test «no obsoletas» verde), `ENOENT` tolerado en `readFile` (`:411-414`; no en `readdirSync` de `walkDir`, `:42-47`). Mutación M16 muerta (tasks POST sin `readOrgBody`), **M17 y M18 sobreviven** (fallo 2). Sonda `guardrail5_probe.js`: 33/176 handlers ciegos. |
| QA 14 integración 4 rutas con `getServerOrgContext` doblado | ✅ | `src/app/api/__tests__/orgBodyRoutes.f0sec.test.ts` (chat POST, whatsapp/send POST, activities POST, teams/[id] DELETE por query): 403 + warn + servicio no invocado; camino feliz; JSON inválido 400. `demos/[id]` y `objections` sustituidas (ajenas / ya cubiertas). Añadido por el tester: `attachments`/`transcribe` multipart (fallo 1). |
| QA 15 `persistentCount` inyectado, fail-closed, cifra única | ✅ (diseño distinto) | Sustituido por store atómico: `rateLimit.ts:160-182` (store falla → bloquea y `console.error`), `rateLimitStore.ts:55-67` (RPC `fn_rate_limit_hit`), `verify/send/route.ts:22,52-56`, `verify/check/route.ts:21,51-55`, `invite/resend/route.ts:82-85` pasan `{ store: getRateLimitStore() }`. 5/10 min en código y en FASE-00 §7 (l. 41, 739, 1083). `persistentCount` legado sigue soportado y fail-closed (`:144-158`) pero con carrera (fallo 4). Mutaciones M5/M6/M7/M15 muertas. |
| QA 16 `resolveOrgFromExternal` `.limit(2)` → 409 | ✅ | `orgContext.ts:382-408`; `orgContext.f0sec.test.ts` (1 org / 2 orgs / 2 filas misma org / vacío); M11 muerta. Nota F3/F7 en el comentario `:377-381`. |
| QA 17 ws token: TTL, `orgId`, `jti` | ✅ | `wsSessionToken.ts:111-114` (exp ≤ now+3600, `orgId` entero > 0, `jti` 1..64), `:140-149` `consumeWsSessionJti`; `conversationRelayHandler.ts:149-162` consume en `setup` y cierra 1008. M13/M14 muertas. Documentado: `issueWsSessionToken` no valida `orgId` al emitir (solo el verify lo frena); el upgrade (`ws-server.ts:117`) no consume, así que un handshake capturado sigue abriendo sockets hasta `setup` (solo coste de recursos). |
| QA 18 `windowMs <= 0`, evaluar-todo, cubo `unknown` | ✅ | `rateLimit.ts:106-113,126-142,184-202`; cabecera `:16-28`. `rateLimit.test.ts` «sub-parte D»; `testerR2CD` D1. |
| QA 19 docs §7/§7.1, guardarraíl 7, `verifyElevenLabsWebhook`, F-11 | ⚠️ | §7/§7.1 unificados (5/10 min). `email/webhook` **sigue** en la allow-list del guardarraíl 7 (`guardrails.test.ts:620`) con motivo actualizado (la ruta no importa el verificador; lo hace `webhookService.ts`) — decisión razonable, distinta de lo pedido. `verifyElevenLabsWebhook` **no existe** en `webhookSignatures.ts` (la ruta usa `client.webhooks.constructEvent`, `webhooks/elevenlabs/route.ts:37`); `docs/hallazgos/F-11.md` no menciona `fn_reporte_crm_*` ni el 216→184 (SEC-B, ajeno a C+D). |
| Fallo 6 (guardarraíl a nivel de archivo) | ⚠️ | Corregido para el caso denunciado (`renewals/sync`: test `:478-497`, M16 muerta) pero reincide por otra vía en 25 archivos (fallo 2). |
| Fallo 7 (`requireOrgAdmin` por nombre) | ✅ | `ORG_ADMIN_ROLE_NAMES` no existe en el árbol (`grep`: 0). Ver QA 12. |
| Fallo 14 (`ENOENT` en recorrido) | ✅ parcial | `readFile` tolerante (`:411-414`); `walkDir` no (si el directorio se borra entre `readdirSync` y la recursión, cae). Bajo. |
| P7 (bordes rate limit) | ✅ | `persistentCount` que lanza → bloquea; `windowMs: 0` → bloquea; `checkRateLimits` no consume claves previas; `getClientIp` `'unknown'` documentado. `rateLimit.test.ts:67-115`, `testerR2CD` D1. |
| P8 (`foreignOrganizationInBody`) | ✅ | Contrato conservado (`organizationBody.test.ts:143`); `'0x78'`≡120, `'1e2'`≡100, `'120.5'` ajena (`testerR2CD` C1). |

## Inventario de rutas (b)

Método: `grep -rL readOrgBody src/app/api --include=route.ts` (270 de 382 `route.ts`) cruzado con
lecturas de `organization_id|organizationId|orgId|org_id` en body/query/form (`inventario.js`,
scratchpad). Resultado completo en el scratchpad; resumen:

| Ámbito | Archivos sin `readOrgBody` que leen org | Tratamiento |
|---|---|---|
| Estricto `crm/**` + `ai-assistant/**` | 25 | 19 F12/F13 (`rejectForeignOrganization`, incluidos 2 por query: `partners/[id]/deals` GET, `referrals` GET, `sales-targets/progress` GET) · 3 F11 (`foreignOrganizationInBody` inline en `onboarding/instances/**`) · 3 cron (`health/recalculate`, `renewals/sync` POST con `verifyCronSecret`; `voice-agents/campaigns/run` con `withCron`; en los tres la org del body acota la pasada, no la sesión). **Ninguna** en el alcance de esta sesión acepta org del body sin pasar por el predicado. |
| Legacy (resto de `src/app/api`) | 89 | Deuda anterior a F0 cubierta por `ALLOWLIST` del guardarraíl 5 (factus, integrations/*, stripe, subscriptions, modules…). 5 rutas `chat/ai/*` reimplementan inline `Number(body.organizationId) !== organizationId` (regla 7: duplicado del predicado; fuera del CRM). `auth/invite` idem (`:113-116`). |

Rutas de este alcance con `readOrgBody` cuya llamada vive **dentro de un `try/catch` que se traga el
403** (`catchscan.js`, 137 llamadas revisadas): 2 → `ai-assistant/attachments/route.ts:103-110`,
`ai-assistant/transcribe/route.ts:78-82`. Las 135 restantes propagan `OrgContextError` (wrapper
`withOrg`/`withWhatsAppRoute`, `emailErrorResponse`, `revenueRouteError` o `catch` con
`instanceof OrgContextError`).

Rutas ajenas (solo reporte, sin tocar): las 6 de `STRICT_ALLOWLIST` (`health/[customerId]` POST,
`onboarding/templates` POST, `partners/[id]` DELETE, `partners/tiers/[id]` DELETE,
`payments/register` POST, `referrals/programs/[id]` DELETE) siguen pendientes del cambio de una
línea descrito por el constructor en §(b); `f10PaymentsRegisterTester.test.ts:56` ya lo marca
`it.failing`.

## Fallos nuevos (reproducción y severidad)

### 1. [alto] `ai-assistant/attachments` y `ai-assistant/transcribe` responden 400 (no 403) a una organización ajena
`src/app/api/ai-assistant/attachments/route.ts:103-110`:
```ts
try { form = readOrgBody(ctx, await request.formData()); }
catch { return NextResponse.json({ error: 'La subida tiene que ser multipart/form-data.', code: 'BAD_REQUEST' }, { status: 400 }); }
```
`transcribe/route.ts:78-82` idem («Petición mal formada»). Reproducir: `POST` multipart con
`organization_id=999` y sesión de la 120 → **400 `BAD_REQUEST`** (test `testerR2CD` C4-a/C4-b,
`it.failing`; el caso «se registra y no transcribe» es verde). El `console.warn` sí se emite y no se
escribe nada, así que el riesgo es de contrato y de diagnóstico (el cliente recibe un mensaje falso),
no de fuga. El guardarraíl 5 no puede verlo (busca la llamada, no su `catch`). Arreglo: separar el
`await request.formData()` (400) de `readOrgBody(ctx, form)` fuera del `try`, o `if (err instanceof
OrgContextError) return …err.statusCode` antes del 400. Revisar también el patrón en cualquier ruta
nueva: `catchscan.js` del scratchpad lo detecta.

### 2. [alto] Guardarraíl 5: `localHelpersMatching` deja ciegos 33 de 176 handlers (19 %) en 25 archivos
`src/__tests__/guardrails.test.ts:367-378`: el cuerpo de un helper local va desde su declaración
hasta la **siguiente declaración que casa con `declRe`** (`^function x` / `^const x = (`), y los
`export async function POST` no casan, así que un helper declarado antes de los handlers (`fail`,
`errorResponse`, `getOpenAIClient`, `toISODate`, `isValidId`…) abarca todo el resto del archivo y
«contiene» el `readOrgBody` de los handlers. Cualquier handler que llame a ese helper pasa aunque no
tenga ni `readOrgBody` ni sesión (el mismo defecto afecta a `sessionHelpers`, `cronHelpers` y
`webhookHelpers`). Reproducir: mutación **M18** (quitar `await readOrgBody(ctx, request);` del
`DELETE` de `crm/stages/[id]/route.ts:122`) → guardarraíl **verde**. Lista de los 33 (sonda
`guardrail5_probe.js`): `ai-assistant/{conversations/[id] DELETE, improve-text, pm-assist,
pm-planner, seo-keywords, stream, transcribe}`, `crm/{automation-rules(3), config/providers(2),
contracts, ia/discovery-summary, ia/next-action, referrals/[id]/convert, roi, sequences(3),
stage-agents(2), stages(4), verticales/[id](2), voices(5)}`. Arreglo (una línea de intención): en
`localHelpersMatching` acotar el cuerpo del helper hasta la siguiente línea que case con
`TOP_LEVEL_RE` (como ya hace `splitHandlers`), y añadir un test de muestra con `function fail()`
antes de un `export async function DELETE` sin `readOrgBody` que deba ser rojo. Este es el mismo
espíritu del fallo 6 de r1: el guardarraíl vuelve a ser «a nivel de archivo» para estos 25.

### 3. [medio] `readOrgBody` solo inspecciona la PRIMERA clave de organización presente
`organizationBody.ts:98-100` devuelve la primera de `ORG_BODY_KEYS` con valor no nulo; `:46` trata
`''` como ausente pero la clave ya «ganó». Reproducir: `readOrgBody(ctx, { organization_id: 120,
organizationId: 999 })` y `readOrgBody(ctx, { organization_id: '', orgId: 999 })` → pasan sin
registro (`testerR2CD` C1-a/C1-b, `it.failing`). Ninguna ruta usa el valor del body, así que no hay
escritura cruzada; pero el contrato «cualquier org ajena → 403 + registro» se esquiva con dos claves
y el registro (que es la mitad del valor de la regla) no se produce. Arreglo: comprobar TODAS las
claves presentes y tratar `''` como ausente por clave.

### 4. [medio] Carrera en el camino legado `persistentCount` de `checkRateLimits`
`rateLimit.ts:144-158` hace `await fn(...)` entre la proyección en memoria (`:128-142`) y el
registro (`:184-202`): N peticiones concurrentes en la misma instancia proyectan todas `count = 1`.
Reproducir: 5 `checkRateLimit('k', { limit: 3, persistentCount: async () => 0 })` en `Promise.all`
→ **5 permitidas** (`testerR2CD` D1-a, `it.failing`; sin `persistentCount` pasan exactamente 3, y con
`store` atómico también 3). Hoy ningún consumidor pasa `persistentCount` (`grep`: solo
`rateLimit.ts`), por eso es medio y no alto. Arreglo: reservar el hit en memoria antes del `await` y
revertir si bloquea, o retirar el camino legado ahora que existe el store.

### 5. [medio] `hasOrgAdminOrPermission`: una RPC que lanza no es «denegado y registrado», es un 500
`orgContext.ts:319-329` solo trata `{ error }`; si `supabase.rpc` rechaza (red, timeout del cliente)
la promesa se propaga y `withOrg` responde 500 sin registro específico. Reproducir: `testerR2CD` C3-a
(`it.failing`). El resultado sigue siendo «no entra», así que es de robustez/diagnóstico. Arreglo:
`try/catch` alrededor del `rpc` con el mismo `console.warn` y `return false`.

### 6. [bajo] Guardarraíl 5: mencionar `isPlaceholderCredential(` exime del contrato
`guardrails.test.ts:337` (`WEBHOOK_RE` incluye `isPlaceholderCredential`). Mutación **M17**
(`tasks/route.ts` POST sin `readOrgBody` + `isPlaceholderCredential('x')`) → verde. Hoy 0 handlers
estrictos se saltan por esta vía (sonda). Arreglo: quitar `isPlaceholderCredential` de `WEBHOOK_RE`
(no es verificación de firma) o exigir que vaya junto a un `verify*`.

### 7. [bajo] Sobrecarga síncrona de `readOrgBody` no ve la query; `bodyUsed` devuelve `{}` en silencio
`organizationBody.ts:139,188-190`. ~35 rutas usan `readOrgBody(ctx, await request.json()…)` (POST
con body): un `?organization_id=999` en la query de esas rutas no se inspecciona, mientras que en
las que pasan la `Request` sí. Y `readOrgBody(ctx, request)` tras consumir el body devuelve `{}` sin
avisar (no ocurre en ninguna ruta hoy: `catchscan`/`grep` no encuentran doble consumo). Documentado
en `testerR2CD` C1. Arreglo opcional: `readOrgBody(ctx, body, { request })` para comprobar también
la query, o dejarlo escrito en la cabecera del módulo como límite conocido.

### Observaciones sin severidad
- `walkDir` (`guardrails.test.ts:42-47`) no tolera `ENOENT` en `readdirSync` (fallo 14 cerrado a
  medias).
- Durante la primera ejecución completa en `TZ=UTC` fallaron 3 tests de `builderR3.f0sec` /
  `testerR3.f0sec` (SEC-AB): `src/lib/security/secrets.ts` fue modificado por otra sesión a las
  23:50:04 en mitad de la ejecución. Las dos repeticiones posteriores fueron verdes; no es de C+D.
- La migración `20260916000000_crm_v4_f0sec_rate_limit_buckets.sql` cambió de estado durante esta
  ronda (cabecera «APLICADA el 2026-09-16 por el MCP», otra sesión). Verificado por SELECT (abajo).
  Falta el paso «`RATE_LIMIT_STORE=db` en Vercel»: hasta entonces `verify/*` e `invite/resend`
  siguen en modo memoria (`limit × instancias`), como documenta el propio código.
- `ws-server.ts:117` verifica el token en el upgrade pero no consume el `jti` (solo `setup`): un
  handshake capturado abre sockets que mueren en `setup`. Coste de recursos, no de sesión.
- Los archivos de `crm/**` tocados quedan con `LF` (git avisa CRLF): sin cambio de contenido.

## Calificación: **7 / 10**

Justificación. La sub-parte C está mecánicamente completa (112 archivos, 137 llamadas, un solo
predicado, 403 + registro verificados en 4 rutas con sesión doblada y 16 mutaciones muertas), y la
D cierra todos los bordes pedidos (fail-closed, evaluar-todo, `jti`, tope de TTL, `ORG_AMBIGUOUS`
en header/cookie y en `resolveOrgFromExternal`) con la migración ya aplicada y correcta en BD. Lo que
resta un punto y medio: (1) dos rutas del asistente devuelven 400 en vez de 403 y el guardarraíl no
puede verlo; (2) el guardarraíl 5 —que es la garantía de no reincidir— está ciego en el 19 % de los
handlers por un corte de helper mal delimitado, y sobrevive a dos de las tres mutaciones que lo
atacan directamente; (3) `readOrgBody` se esquiva con dos claves, sin registro. Ninguno de los tres
permite escribir en otra organización (la org efectiva siempre sale de la sesión), por eso no baja
más; pero el contrato de la regla dura 5 (b) es precisamente «403 **y** se registra», y hoy tiene
tres agujeros conocidos. Un 9 exige cerrar 1–3 y añadir el test de muestra del guardarraíl.

## Comandos exactos y resultados

```
# (previa) sonda del tester anterior, desde el scratchpad (66 casos)
npx jest --roots <scratchpad>/tester-cd-r2 --rootDir . --modulePaths ./node_modules <scratchpad>/tester-cd-r2
  → Tests: 66 passed, 66 total   ([sonda] concurrentes con persistentCount que pasan: 5)

# (b) inventario
grep -rL readOrgBody src/app/api --include=route.ts | wc -l      → 270   (con readOrgBody: 112; route.ts totales: 382)
node <scratchpad>/tester-cd-r2/inventario.js                     → estricto 25 archivos (19 F12/F13, 3 F11, 3 cron) · legacy 89
node <scratchpad>/tester-cd-r2/catchscan.js                      → readOrgBody calls: 137 swallow: 2 (attachments:104, transcribe:79)
node <scratchpad>/tester-cd-r2/guardrail5_probe.js               → 176 handlers · 33 ciegos en 25 archivos · 0 saltados como webhook

# (d) jest — dos zonas horarias (tras añadir testerR2CD.f0sec.test.ts, 41 tests: 35 verdes + 6 it.failing)
TZ=UTC            npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/auth src/lib/utils/__tests__ src/app/api/__tests__
  → Test Suites: 17 passed, 17 total · Tests: 415 passed, 415 total · 29.4 s
TZ=America/Bogota npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/auth src/lib/utils/__tests__ src/app/api/__tests__
  → Test Suites: 17 passed, 17 total · Tests: 415 passed, 415 total · 39.9 s
  (1.ª pasada UTC: 3 rojos en builderR3/testerR3 por edición concurrente de secrets.ts a las 23:50:04; repetida 2 veces verde)

# (e) tsc
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "organizationBody|orgContextError|rateLimitStore|orgContext.ts|orgAdmin.ts|src/app/api/"
  → (vacío)  — 0 errores en el alcance
  total: 13 errores, todos ajenos y preexistentes o de otras sesiones activas:
    FormularioEdicionProducto.tsx ×2 · deliveryIntegrationService.ts:661 · f13Round3Tester.test.ts ×2 (los 5 que citaba el constructor)
    src/lib/jobs/__tests__/testerR4.test.ts ×7 (JOBS r4, archivo sin versionar) · src/lib/services/printJobsService.ts:244 ×1 (modificado por otra sesión tras el informe del constructor)
  El test nuevo compila con ts-jest (diagnósticos activos) en las dos pasadas.

# (f) mutation testing (node <scratchpad>/tester-cd-r2/mutate.js; restaura byte a byte y compara md5)
M1  organizationBody predicado nunca ajeno                MUERTA  (28 rojos)   md5 ok
M2  organizationBody no mira la query                     MUERTA  (4)          md5 ok
M3  organizationBody formularios no se parsean            MUERTA  (3)          md5 ok
M4  organizationBody 403 → 400                            MUERTA  (17)         md5 ok
M5  rateLimit store que falla → fail-open                 MUERTA  (2)          md5 ok
M6  rateLimit limit inválido permitido                    MUERTA  (3)          md5 ok
M7  rateLimit registrar antes de evaluar                  MUERTA  (12)         md5 ok
M8  orgAdmin admin por nombre                             MUERTA  (4)          md5 ok
M9  orgContext header gana en silencio                    MUERTA  (6)          md5 ok
M10 orgContext RPC no-true concede                        MUERTA  (3)          md5 ok
M11 orgContext resolveOrgFromExternal limit(1)            MUERTA  (1)          md5 ok
M12 orgContext withOrg({admin}) sin permiso por cargo     MUERTA  (1)          md5 ok
M13 wsSessionToken jti reutilizable                       MUERTA  (5)          md5 ok
M14 wsSessionToken sin tope de TTL                        MUERTA  (4)          md5 ok
M15 rateLimitStore error de RPC silenciado                MUERTA  (2)          md5 ok
M16 tasks POST sin readOrgBody                            MUERTA  (guardarraíl 5 rojo)   md5 ok
M17 tasks POST sin readOrgBody + isPlaceholderCredential( SOBREVIVE (79/79 verdes)        md5 ok   → fallo 6
M18 stages/[id] DELETE sin readOrgBody                    SOBREVIVE (79/79 verdes)        md5 ok   → fallo 2

# BD (solo SELECT, MCP)
select … rate_limit_buckets / fn_rate_limit_hit
  → tabla_existe 1 · rls true · politicas 0 · fn_hit 1 · anon_exec false · auth_exec false · service_exec true ·
    anon_sweep false · anon_select false · auth_select false · filas 0 · secdef true · search_path=public
select … check_user_permission / permissions / roles
  → check_user_permission(p_user_id uuid, p_organization_id integer, p_permission_code text) · admin.full_access existe ·
    roles 1 «Super Admin», 2 «Admin de organización» · 0 roles con esos nombres y otro id
```

## Archivos del tester

- Nuevo en el repositorio: `src/lib/security/__tests__/testerR2CD.f0sec.test.ts` (41 tests; los 6
  `it.failing` son los fallos 1, 3, 4 y 5 de arriba: al cerrarlos hay que quitar el `.failing`).
- Scratchpad (fuera del árbol): `tester-cd-r2/{sondaCD.test.ts, inventario.js, inventario.txt,
  catchscan.js, guardrail5_probe.js, mutate.js, mutaciones.json, jest-*.txt, tsc-full.txt}`.
- Temporales en el árbol: ninguno (`zz_verify_tmp.test.ts` se usó 30 s para confirmar el 400 de
  `attachments` y se borró; `git status` solo muestra el test nuevo y este informe).
- No se tocó ningún archivo de otra sesión ni `guardrails.test.ts`/`orgContext.ts` (solo mutación
  con restauración verificada).
