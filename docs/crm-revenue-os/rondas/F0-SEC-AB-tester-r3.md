# F0-SEC — Sub-partes A + B: webhook de WhatsApp por cambio, asistente de reportes con sesión, detector de relleno, secretos server-only y rate limit — Tester — Ronda 3 (2026-09-15/16)

Insumos: `rondas/F0-SEC-AB-builder-r3.md`, `rondas/F0-SEC-AB-tester-r2.md` (fallos 1–6, anexo A: H1/H2/H3),
`rondas/F0-SEC-qa-r1.md`, `FASE-00-FUNDACIONES.md` §seguridad. El tester anterior de esta ronda no dejó
informe ni archivos `testerR3*` en el alcance (los `src/lib/jobs/__tests__/testerR3*.test.ts` son de otra fase):
no había nada que completar, se empezó desde el árbol del constructor r3.

Método: verificación de cada fallo r2 contra el código r3 con archivo:línea y test; sondas adversarias nuevas en
4 archivos permanentes `__tests__/testerR3*.test.ts` (106 casos, 2 de ellos `test.failing` = hueco abierto);
suites del alcance en `TZ=UTC` y `TZ=America/Bogota`; `tsc` completo filtrado; 20 mutaciones manuales con
restauración byte a byte verificada por md5 (script en el scratchpad, fuera del repositorio); dry-run de la
migración B dentro de `begin; … rollback;` por el MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`), con
impersonación; fuera de eso solo `SELECT`. Sin credenciales reales, sin commits, sin nada aplicado en la base
(estado al terminar: **216** SECURITY DEFINER ejecutables por `anon`, **0** `fn_reporte_*` con guarda, **0**
sesiones «idle in transaction», `request.jwt.claims` vacío). Organizaciones citadas por id; los usuarios del
dry-run no se identifican. No se tocó `organizationBody.ts`, `orgContext.ts`, `orgAdmin.ts` ni rutas F10–F13.

**Congelación**: a mitad de la ronda el orquestador congeló el árbol para un commit. En ese momento no había
ninguna mutación viva (las 20 estaban restauradas con md5 verificado; `find src -name "*.mutbak"` → 0). Lo único
que se editó después fue un error de tipos de **mi propio** test (`reportes/__tests__/testerR3.f0sec.test.ts`).
Ningún archivo de producción de este informe fue modificado por el tester en ningún momento (las mutaciones se
restauraron en el mismo comando que las aplicó).

Nada de lo que sigue es un veredicto de aprobado/rechazado: eso lo decide el qa-reviewer.

## Resumen de pruebas
- Casos ejecutados: **106 nuevos** (31 ruta del webhook + 17 servicio + 48 seguridad + 10 reportes) + **20
  mutaciones** + **9 comprobaciones del dry-run** + suites del alcance completas.
- Suites del alcance (`npx jest src/lib/security src/app/api/integrations/whatsapp
  src/lib/services/integrations/whatsapp src/lib/services/crm/whatsapp src/app/api/ai-assistant
  src/__tests__/guardrails.test.ts`): línea base antes de mis tests `TZ=UTC` → **31 suites, 615 tests, verdes**;
  con mis tests `TZ=America/Bogota` → **36 suites, 762 tests, verdes** (los 41 tests de diferencia que no son
  míos entraron en el árbol durante la ronda desde F0-SEC-CD, sobre el que no opino). La repetición final en
  `TZ=UTC` está en la sección «Comandos».
- Fallos r2 verificados contra r3: **1 (H1) cerrado**, **2 (H2) cerrado en sus dos vectores**, **3 cerrado**,
  **4 cerrado**, **5 cerrado** en los casos que el constructor listó (bordes conservados con test), **6** sin cambios.
- Hallazgos nuevos: **1 alto** (H4: la plantilla de B se pausa con la firma de A por un vector distinto al H2),
  **1 medio** (la lista blanca de reportes del asistente viene del body), **6 bajos** anotados con test.
- Mutaciones: **20 muertas / 20** (ninguna superviviente; ver anexo B).
- `tsc`: **0 errores** en los archivos de esta ronda (producción y tests del tester). En el árbol quedan los
  ajenos ya conocidos (`FormularioEdicionProducto.tsx`, `deliveryIntegrationService.ts`) más uno nuevo de F0-SEC-CD
  (`src/lib/security/__tests__/testerR2CD.f0sec.test.ts(277)`, `userEmail` ausente en un doble de
  `ServerOrgContext`) y ruido de `.next*/types` generado por builds concurrentes; ninguno es de esta ronda.
- Dry-run B: coherente con el r2 (C01, C02, C04, C06, C07, C16, C21, C23) y restaurado.

## Tabla de verificación (fallos r2 → código r3)

| # r2 | Qué se comprobó | Evidencia (archivo:línea) | Test | Estado |
|---|---|---|---|---|
| 1 (H1) crítico | `phone_number_id` numérico de B en la entrada de A | `webhookAuthorization.ts:125-132` (`normalizeMetaId`: entero seguro ≥ 0 → decimal), `:216-230` (se consulta y suma ámbito), `:254-265` (unión > 1 → 403); `whatsappCloudService.ts:428` (misma función antes de PostgREST) | `webhook/__tests__/testerR3.f0sec.test.ts` › «123 (número) + pn-a … → 403 mixed_channels; el 123 SÍ se consultó (como string)»; `" 123 "` → 403; `testerR2.f0sec.test.ts` H1 en verde sin `.failing` | **Cerrado** |
| 1 (H1) tipos raros | float, −1, `true`, objeto, array, `''`, `'   '`, `null`, `2^53+1` y `1e400` como números JSON crudos | `webhookAuthorization.ts:149-157` (`describeChange` → `phoneInvalid`), `:220-222` (no se consulta, `invalid_phone_number_id`), `:303-309` (descarte por `change`) | ídem › `test.each` de 8 tipos + «2^53+1 y 1e400 … se descartan sin consultar» (`lookups` = solo `pn-a`, `droppedChanges[0]` = `{entryIndex 0, changeIndex 1}`) | **Cerrado** |
| 2 (H2) alto | plantilla de B en la entrada de A: `entry.id` de B / desconocido / ausente / entrada separada | `webhookAuthorization.ts:231-241` (resolución por WABA por `change`), `:303-309`; `whatsappCloudService.ts:405-423` (orgs del WABA, descarte si ∅); `webhookTemplateStatus.ts:55-58` (`.in('organization_id', orgIds)`, fail-closed) | ídem › 4 tests H2 (403 / `unknown_waba` / `missing_waba` / entrada separada 403); `services/integrations/whatsapp/__tests__/testerR3.f0sec.test.ts` › controles 1–3 | **Cerrado** (pero ver H4) |
| 3 alto | `POST /api/ai-assistant/reportes` como `anon` | `reportes/route.ts:60-67` (pasa `ctx.supabase`); `reportesEngine.ts:31`; 19 módulos `const db = client ?? browserSupabase` (guardarraíl estático del constructor) | `reportes/__tests__/testerR3.f0sec.test.ts` › sin sesión → 401 sin OpenAI/RPC; org ajena en raíz → 403; RPC 42501 → 200 con aviso y browser sin tocar | **Cerrado** |
| 4 bajo | `AAAA…A=` base64 de ceros | `providerCatalog.ts:192` (`replace(/={1,2}$/, '')`) | `security/__tests__/testerR3.f0sec.test.ts` › 3 variantes + `whsec_` | **Cerrado** |
| 5 bajo | `1234changeme5678`, `undefinedundefined`, `undefined-undefined`, `null_null`… | `providerCatalog.ts:230` (`PLACEHOLDER_ANYWHERE`), `:238` (`PLACEHOLDER_WORDS_ONLY`), `:273-274` | ídem › 15 casos → `placeholder`; bordes conservados (`abc-your-…` ≥ 48 ok, `abcdefgh-todo-…` rechazado) | **Cerrado** en lo listado; nuevos bordes en «bajos» |
| 6 bajo | M11/M16 (cobertura) | sin cambios de código | `testerR2.f0sec.test.ts` sigue verde | Sin cambios |
| H3 (anexo A r2) | reportes anon = fallo 3 | ver fila 3 | ver fila 3 | **Cerrado** |
| alias | principal de relleno + alias real avisa una vez, sin valor | `secrets.ts:100, 111-117` | `security/__tests__/testerR3.f0sec.test.ts` › «readRealSecret · alias» (3) | **Cerrado** |

## Fallos encontrados

### 1. [alto] H4 — la plantilla de B se pausa con la firma de A si la `change` de plantilla trae el `phone_number_id` de A
La regla 1 del plan resuelve CADA `change` por `value.metadata.phone_number_id` **si lo trae**, sea cual sea su
`field` (`webhookAuthorization.ts:149-157` y `:223-230`). Un webhook real de `message_template_status_update`
no trae `metadata.phone_number_id`, pero nada impide que el atacante (org 7, con app_secret propio) lo añada:
la `change` resuelve a A por el número, se conserva, y la entrada se reconstruye con su `id` original
(`:278`, `id: normalizeMetaId(entry.id)` = `waba-b`). En el procesamiento, la plantilla no mira el número: resuelve
las organizaciones **por el WABA de la entrada** (`whatsappCloudService.ts:412-416`,
`findChannelsByBusinessAccountId('waba-b')` → `[8]`) y `applyTemplateStatusUpdate(update, 'waba-b', …, [8])`
encuentra la plantilla de la org 8 por `meta_template_id`, la marca `DISABLED` y `pauseCampaignsUsingTemplate`
pausa su campaña `sending`. El «segundo muro» de r3 (organizaciones explícitas) se alimenta de un dato —`entry.id`—
que el plan no exigió que perteneciera al secreto firmante cuando la `change` resolvió por número.
Es el H2 del r2 reabierto por un vector distinto (H2 cubría `entry.id` de B **sin** número inyectado, que sí da 403).

Reproducir (ambos en `test.failing`, rojo = hueco):
- Ruta: `webhook/__tests__/testerR3.f0sec.test.ts` › «H4 … NO debe llegar al procesamiento con el WABA de B» y la
  evidencia junto a él: `POST` firmado por A con
  `{ id: 'waba-b', changes: [{ field: 'message_template_status_update', value: { event: 'DISABLED',
  message_template_id: 'meta-tpl-of-org-8', metadata: { phone_number_id: 'pn-a' } } }] }` → **200**,
  `lookups = ['phone:pn-a:string']` (el WABA ni se consulta), `processWebhookPayload` recibe la entrada con
  `id: 'waba-b'` y la plantilla de B, sin aviso de descarte. Variante `message_template_quality_update`: igual.
- Extremo a extremo: `services/integrations/whatsapp/__tests__/testerR3.f0sec.test.ts` › «H4 … la plantilla de la
  org 8 NO debe cambiar» — plan real + `processWebhookPayload` real + `applyTemplateStatusUpdate` real sobre una tabla
  doble que evalúa `eq/in/->>`: `templates.tpl-8.metadata.status` pasa de `APPROVED` a **`DISABLED`** y
  `campaigns.camp-8.statistics.state` a **`paused`**; `plan.organizationIds = [7]`, `plan.droppedChanges = []`.
- Controles verdes: sin el número inyectado → 403 `mixed_channels`; bajo `waba-a` → se procesa con `[7]` y no toca
  nada de B; con `pn-b` inyectado → 403.

Esperado (cualquiera de los dos, mejor ambos): (a) en el plan, las `change` de plantilla (`field` que empieza por
`message_template_`) se resuelven **siempre** por el WABA y nunca por `metadata.phone_number_id`; o, más general,
cuando una `change` resuelve por número, exigir que `entry.id` (si viene) resuelva al mismo ámbito o descartar la
`change`; (b) en el procesamiento, pasar a `applyTemplateStatusUpdate` la intersección entre las organizaciones del
WABA y `plan.organizationIds` (hoy el servicio no recibe el plan: la ruta le entrega solo `plan.entries`).

### 2. [medio] El asistente de reportes toma la lista de módulos activos del BODY: un miembro ejecuta reportes de módulos que su plan no tiene
`reportes/route.ts:25-36` lee `modulosActivos` del body y `reportAgentService.ts:213-216` lo usa como lista blanca
(`getReportesVisibles(modulosActivos)`) para decidir qué `reportId` puede ejecutar el modelo. Con la sesión de un
miembro de la org 7 y `modulosActivos: ['hrm']`, el reporte `hrm-nomina` se ejecuta (`payroll_periods` con el
cliente de sesión); con `['crm']` responde «no está disponible». RLS limita los datos a la propia organización,
así que no es un cruce de tenants, pero es un salto de plan y viola la regla dura 6 (permisos en el servidor,
nunca con un valor del cliente). Además `context.userRole` del body va al prompt (solo cosmético).
Reproducir: `reportes/__tests__/testerR3.f0sec.test.ts` › «lista blanca de reportes: viene del body» (2 tests).
Esperado: resolver los módulos activos en el servidor (`moduleManagementService` / `organization_modules`) y usar
el body, como mucho, para intersecar.

### 3. [bajo] `context.organizationId` ajeno (anidado) no da 403 ni se registra
`readOrgBody` solo mira las claves de nivel raíz (`organizationBody.ts:98-101`, fuera de mi alcance); la ruta
sobrescribe `context.organizationId` con el de la sesión (`route.ts:37-40`), así que el efecto es seguro, pero la
regla dura 5 («403 y se registra») no se cumple para ese campo. Test: «context.organizationId ajeno (anidado) →
se ignora … (ANOTADO: sin 403 ni registro)». Esperado: `readOrgBody(ctx, body.context)` además del body.

### 4. [bajo] Coste antes de la firma en el webhook: hasta 25 consultas (+25 de credenciales) por petición sin firma válida, sin rate limit
`route.ts:89` resuelve el plan ANTES de verificar la firma (inevitable: el secreto sale del payload), y el único
tope es `MAX_LOOKUPS = 25` ids distintos. Una firma basura con 25 números desconocidos cuesta 25
`findChannelByPhoneNumberId` (más `getCredentialsByChannelId` por cada acierto) antes del 403; la ruta no usa
`checkRateLimits` (sí lo usan `crm/whatsapp/send` y las rutas del asistente). Test: «OBSERVADO: 25 números
desconocidos con firma basura → 25 consultas». Esperado: rate limit por IP en el webhook (Meta llega desde rangos
conocidos) o bajar `MAX_LOOKUPS` a lo que Meta agrupa de verdad (normalmente 1 entrada).

### 5. [bajo] Replay del webhook: la ruta no lo impide; la deduplicación vive en el servicio
Un cuerpo firmado por Meta reenviado N veces se procesa N veces (test «replay: el MISMO cuerpo firmado …»). Los
mensajes entrantes se deduplican por `external_message_id` (`whatsappCloudService.ts:505-511`), pero un
`message_template_status_update` PAUSED capturado se re-aplica cuando se reenvía (re-pausa una plantilla ya
aprobada). Requiere capturar un payload firmado (TLS), así que es bajo. Esperado: idempotencia por
`(waba, template, event, timestamp)` o ignorar eventos con `last_webhook_at` posterior.

### 6. [bajo] Bordes del detector de relleno que siguen pasando (anotados con test)
`undefined:undefined` (separador fuera de `[-_.]`), `[object Object][object Object]` (30 chars, típico de
`${obj}${obj}`), `undefined-undefined1`, `AAAA…A===` (tres `=`; base64 inválido) y `NaNNaNNaNNaNNaNNaN` → `null`
(aceptados). Ninguno aparece en documentación real. Test: «ANOTADO (bajo): plantillas mal interpoladas …».
También verificado que **no hay falsos positivos** en 14 formas realistas (hex 64, base64 con `=`, `sk_test_`,
`sk_live_`, `re_`, `SK`/`AC` Twilio, JWT, passphrase, `abcdefghtodo…`, `a1b2test3…`).

### 7. [bajo] Rate limit: notas de comportamiento (sin regresión)
- `getClientIp` toma el PRIMER salto de `x-forwarded-for`: si el proxy **appenda** (no sobrescribe), el cliente
  elige su propio cubo. Vercel sobrescribe; en Railway/otros hay que comprobarlo. Test «getClientIp: con varios
  saltos manda el PRIMERO».
- Con `persistentCount` (legado, async) dos peticiones simultáneas con `limit: 1` pasan ambas (TOCTOU en memoria);
  con el store atómico solo pasa una; sin ninguno el camino es síncrono y la segunda ya ve la primera. Tests en
  «rate limit · por IP y por organización».
- `fn_rate_limit_hit` **no existe** en la base (SELECT sobre `pg_proc`): con `RATE_LIMIT_STORE=db` todo bloquearía
  (fail-closed, como está documentado). Hoy el límite es solo por instancia. Es de F0-SEC-CD; se anota.

### 8. [bajo] Token WS: `orgId = 2^53+2` se acepta y `callId`/`agentId` no se validan de tipo (ya anotado en r2, sin impacto; test «ANOTADO (bajo, sin impacto)»)

## Sondas adversarias sin hallazgo (verdes)
- Firma con el secreto de B sobre payload de A → 403 `invalid_signature`; con el global sobre un canal con
  app_secret propio → 403; canal sin app_secret (`pn-g`) solo con el global; `pn-a` + `pn-g` en el mismo payload →
  403 con cualquiera de los dos; formatos de firma sin `sha256=`, mayúsculas, truncada, vacía → 403 sin procesar.
- 26 ids → 403 `too_many_channels` **sin** consultar; el mismo id 25 veces → 1 consulta (memoización).
- `entry.id` numérico (12345) → se consulta y llega como `"12345"`; `object` ≠ `whatsapp_business_account` con
  firma válida → 200 `ignored` sin procesar; `entry`/`changes` con formas raras (string, null, números) → 403
  `signature_secret_missing` sin consultas ni excepción.
- `normalizeMetaId`: `123,456`, `*`, `123)`, NUL, `​`, `  123  ` → `'123'`, dígitos fullwidth,
  `0x7b`, `1e3`, `007` se conservan literales (van a `eq.` y no a `in.()`/`or()`); `7` y `'007'` son ids distintos.
- `parseTemplateStatusUpdate` con `message_template_id` objeto → `'[object Object]'` (no rompe, no encuentra).
- Token WS: caducado por 1 s → null; `exp == now` y `exp = now + MAX_TTL` → válidos, +2 → null; firmado con otra
  clave real → null y válido al cambiar la clave; secreto de 32 chars de relleno (`changeme`×4) → no emite ni
  verifica; dos puntos, firma truncada, base64 no-url, payload no JSON, sin punto, vacío → null; `exp` string/null,
  `orgId` string/0/−1/1.5/ausente, `jti` objeto/vacío/65 chars → null; replay del `jti` → false, sin `jti` → false,
  caducado → false.
- Rate limit: org agota cupo aunque cambie de IP y la petición bloqueada no consume la IP nueva; otra org desde la
  misma IP pasa; `limit 1.5` admite 1; store con `count` negativo o `resetAt` en el pasado no abre el cupo.
- Reportes: sin créditos → ni OpenAI ni RPC; `reportId` inventado por el modelo (`../../etc/passwd`) nunca se
  ejecuta; body incompleto → 400 sin OpenAI. `conversationHistory` con `role: 'system'` se reenvía tal cual al
  modelo (anotado, bajo: solo afecta al prompt del propio usuario; la lista blanca se aplica después).

## Sub-parte B — dry-run (migración PENDIENTE, no aplicada)
Archivo en disco: md5 `e15bc882…` (migración), `c13835724…` (rollback); ambos sin commit (`??`). Dry-run en una
transacción (`begin;` + cuerpo sin sus 32 `begin/commit` + bloque `DO` con sub-bloques `EXCEPTION` + `SELECT` de la
tabla temporal + `rollback;`), org 135, un miembro activo y un usuario activo de otra organización:

| # | Caso | Obtenido |
|---|---|---|
| C01 | `anon` → `fn_reporte_crm_funnel(135, …)` | `42501 permission denied for function fn_reporte_crm_funnel` |
| C02 | `authenticated` miembro (JWT `sub`) → funnel | OK |
| C04 | `authenticated` NO miembro → ranking | `42501 ORG_FORBIDDEN` |
| C06 | `authenticated` sin JWT → funnel | `42501 ORG_FORBIDDEN` |
| C07 | `service_role` sin JWT → funnel | `42501 ORG_FORBIDDEN` (en mi primer arnés salió «EJECUTÓ» porque `request.jwt.claims` del C02 seguía puesto —`set_config(…, true)` dura toda la transacción—; repetido en transacción aparte con claims vacíos: rechaza, como en r2) |
| C16 | `anon` con EXECUTE en `fn_reporte_crm_*` | 0 |
| C21 | SECURITY DEFINER ejecutables por `anon` | 184 (216 antes) |
| C23 | `fn_reporte_*` con `ORG_FORBIDDEN` | 2 |
| Estado final | 216 / 0 con guarda / 0 idle in transaction / claims vacío | restaurado |

Con el fallo 3 cerrado en código, la migración B se puede aplicar en el mismo despliegue que r3 sin romper el
asistente (test «la RPC devuelve 42501 … → 200 con aviso» cubre el caso de que se aplique antes). Requiere la
autorización habitual; no la aplico.

## Cobertura no probada / riesgos pendientes
- No se ejecutó el webhook contra Meta ni `processWebhookPayload` contra Supabase: H4 se demuestra con HMAC real
  en la ruta (servicio doblado) y con plan + servicio + `applyTemplateStatusUpdate` reales sobre tablas dobles.
- No se probó `fn_rate_limit_hit` (no existe en la base) ni el ws-server real.
- El árbol cambió durante la ronda: otro agente (F0-SEC-CD) mutó `wsSessionToken.ts` (quitó la guarda de `jti`
  consumido) y lo restauró minutos después; mis mutaciones M18–M20 sobre `src/lib/security/` se hicieron con md5
  antes/después iguales, pero las suites se corrieron sobre el estado final del árbol, no sobre un snapshot.
- La regla 4 (ámbito global conserva todo, incluidos tipos raros) se acepta como diseño: el servicio los ignora.

## Calificación de robustez (1-10, opinión técnica del tester)
**7/10** — Lo que el r2 pidió está cerrado y bien cerrado: la unidad de autorización ya coincide con la de
procesamiento, `normalizeMetaId` es única y compartida (20/20 mutaciones muertas, incluidas las que tocan
justamente H1/H2, el `.in(organization_id)`, el relleno base64/anywhere/words-only, el aviso de alias, la caducidad
del token y el `>` del rate limit), el asistente de reportes corre con la sesión y la migración B es aplicable.
El detector de relleno y el token WS resisten todas las sondas de tipo y forma. Pero el webhook sigue teniendo un
camino por el que la organización A afecta a datos de B (H4: plantilla + campañas pausadas), y es el mismo tipo de
defecto que H2 —dos datos del payload (`phone_number_id` y `entry.id`) que se autorizan por separado y se usan
cruzados—; mientras el procesamiento no reciba las organizaciones que el plan autorizó, cada nuevo `field` de Meta
es un vector potencial. A eso se suma que la lista blanca del asistente de reportes viene del cliente (salto de
plan) y que el webhook no tiene rate limit (25 consultas por petición sin firma válida).

## Comandos exactos y resultado
```
TZ=UTC npx jest src/lib/security src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/lib/services/crm/whatsapp src/app/api/ai-assistant src/__tests__/guardrails.test.ts
  → línea base (antes de mis tests): Test Suites: 31 passed, 31 total · Tests: 615 passed, 615 total
  → final (con mis tests): ver «Resultado final» al pie
TZ=America/Bogota npx jest <mismos paths>
  → Test Suites: 36 passed, 36 total · Tests: 762 passed, 762 total
TZ=UTC npx jest <cada testerR3.f0sec.test.ts>  → 31 / 17 / 48 / 10 passed (2 test.failing = H4, fallan como se espera)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "webhookAuthorization|whatsappCloudService|src/lib/security|ai-assistant/reportes|webhooks/whatsapp"
  → 1 línea, ajena: src/lib/security/__tests__/testerR2CD.f0sec.test.ts(277,102) TS2345 (F0-SEC-CD). 0 en archivos de esta ronda.
npx eslint <los 4 testerR3.f0sec.test.ts>  → limpio
MCP execute_sql (dry-run begin…rollback; y SELECT de estado)  → tabla de la sección B; estado final 216/0/0
```

## Anexo A — Archivos del tester (todos nuevos, sin tocar producción)
- `src/app/api/integrations/whatsapp/webhook/__tests__/testerR3.f0sec.test.ts` (31 casos; 1 `test.failing` H4)
- `src/lib/services/integrations/whatsapp/__tests__/testerR3.f0sec.test.ts` (17 casos; 1 `test.failing` H4)
- `src/lib/security/__tests__/testerR3.f0sec.test.ts` (48 casos)
- `src/app/api/ai-assistant/reportes/__tests__/testerR3.f0sec.test.ts` (10 casos)
- `docs/crm-revenue-os/rondas/F0-SEC-AB-tester-r3.md` (este informe)
- Temporales (scratchpad de la sesión, fuera del repositorio): `mutate.sh`, `mig_body.sql`, `dryrun.sql`,
  salidas de jest/tsc. Nada en el árbol.

Nota sobre `test.failing`: cuando el constructor cierre H4, jest los marcará «passing unexpectedly» y hay que
quitar el `.failing` (rojo antes, verde después), como se hizo en r3 con los de r2.

## Anexo B — Mutaciones (20/20 muertas; restauración byte a byte verificada por md5 en cada una)
| # | Archivo · mutación | Muerta por (tests fallidos) |
|---|---|---|
| M01 | `webhookAuthorization.ts` · números nunca se normalizan (`if (false)`) | 15 — H1 ruta/plan, «number 7 y "007" distintos» |
| M02 | ídem · permitir enteros negativos | 2 — `-1 → null`, «negativo -1 … se DESCARTA sin consultarse» |
| M03 | ídem · `rebuild(() => true)` (no descartar por change) | 19 — H2 unknown_waba, número desconocido… |
| M04 | ídem · tipo inválido tratado como «sin número» (cae a WABA) | 1 — «tipo inutilizable … no se consulta y se descarta» |
| M05 | ídem · `scopeOf` siempre `'global'` | 49 — todo lo de ámbito de canal |
| M06 | `whatsappCloudService.ts` · `String(entry.id)` en vez de `normalizeMetaId` | 1 — «sin entry.id (o tipo inválido) → se descarta sin consultar» |
| M07 | ídem · no descartar con WABA sin organizaciones | 2 — «WABA desconocido → se descarta …» |
| M08 | ídem · `phone_number_id` sin normalizar antes de PostgREST | 1 — «número → se consulta como STRING» |
| M09 | `webhookTemplateStatus.ts` · quitar `.in('organization_id', orgIds)` | 3 — H2 r2, PAUSED, control 2 de H4 |
| M10 | ídem · quitar `if (orgIds.length === 0) return` | 1 — «sin organizaciones autorizadas → no consulta nada» |
| M11 | `route.ts` · no registrar `droppedChanges` | 11 — todos los que exigen el aviso |
| M12 | `route.ts` · procesar `payload` en vez de `plan.entries` | 17 — H1/H2 ruta |
| M13 | `providerCatalog.ts` · quitar `PLACEHOLDER_ANYWHERE` | 4 — `1234changeme5678`… |
| M14 | ídem · no quitar `=` finales | 9 — `AAAA…A=`, `////…/=`… |
| M15 | ídem · quitar `PLACEHOLDER_WORDS_ONLY` | 14 — `undefinedundefined`… |
| M16 | `reportAgentService.ts` · quitar la lista blanca `todosIds.includes` | 1 — «modulosActivos ["crm"] y el modelo pide hrm-nomina → no disponible» |
| M17 | `reportes/route.ts` · pasar `undefined` en vez de `ctx.supabase` | 4 — constructor + tester (browser tocado) |
| M18 | `wsSessionToken.ts` · `exp < now - 60` | 2 — «token expirado», «caducado por 1 s» |
| M19 | `rateLimit.ts` · `count > limit + 1` | 10 — «permite hasta limit y bloquea el siguiente»… |
| M20 | `secrets.ts` · quitar `reportAliasOnce` | 3 — alias (constructor + tester) |

## Resultado final (tras la congelación, sin mutaciones vivas)
`TZ=UTC npx jest <paths del alcance>` → **Test Suites: 36 passed, 36 total · Tests: 762 passed, 762 total**
(igual que `TZ=America/Bogota`). `find src -name "*.mutbak"` → 0.
