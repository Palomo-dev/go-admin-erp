# F0-SEC — Sub-partes A + B: H4 por los dos lados, lista blanca de reportes en servidor, rate limit del webhook y guardarraíl de bytes de control — Tester — Ronda 4 (2026-09-16)

Insumos: `rondas/F0-SEC-AB-builder-r4.md` (entero), `rondas/F0-SEC-AB-qa-r3.md` (7,8; obligatorios 1–4, opcionales
5–7), `rondas/F0-SEC-AB-tester-r3.md` y los 4 `testerR3.f0sec.test.ts`. Alcance: `webhookAuthorization.ts`,
`whatsappCloudService.ts`, `webhook/route.ts`, `ai-assistant/reportes/**`, caso 21 de `guardrails.test.ts`
(+ `webhookTemplateStatus.ts`, que el builder r4 tocó para el opcional 6). `main` = `e3972da7`, sin ramas, sin
commits. Base de datos: **solo `SELECT`** por el MCP (`jgmgphmzusbluqhuqihj`), organizaciones por id.

Método: verificación de cada obligatorio/opcional con archivo:línea y test; **109 sondas adversarias nuevas** en 4
archivos permanentes `testerR4.f0sec.test.ts` (36 ruta + 27 servicio extremo a extremo + 30 reportes + 16 guardarraíl);
suites del alcance en `TZ=UTC` y `TZ=America/Bogota`; `tsc` acotado con un `tsconfig` temporal en el scratchpad
(0 errores, cubre también los módulos importados transitivamente); **21 mutaciones** (una a la vez, copia en el
scratchpad, restauración byte a byte y md5 árbol↔copia por ruta tras cada una; ningún `.mutbak`). Organizaciones de
los tests ficticias (7, 8, 9); secretos inventados; ningún byte de control en mis archivos.

**Estado del árbol durante la ronda.** Al empezar, mi alcance era idéntico a `stash@{0}` (`git diff --stat stash@{0}
-- <7 rutas>` vacío) y distinto de `HEAD` (el r4 está sin commitear). A mitad de ronda el stash **desapareció** (otra
sesión lo hizo `pop`/`drop`); los 7 archivos de mi alcance siguen con el md5 de mi línea base, así que ningún rojo se
atribuye a eso. No se tocó nada fuera del alcance (`crm/config`, `timezone.ts`, `aiCostService.ts`, `jobsService.ts`,
`lib/jobs` intactos por mi parte).

Nada de lo que sigue es un veredicto de aprobado/rechazado: eso lo decide el qa-reviewer.

## Resumen de pruebas
- Suites del alcance (`npx jest src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp
  src/app/api/ai-assistant/reportes src/__tests__/guardrails.test.ts src/__tests__/testerR4.f0sec.test.ts`):
  línea base antes de mis tests `TZ=UTC` → **11 suites, 263 tests, verdes**; con mis tests → **15 suites, 372
  tests, verdes** en `TZ=UTC` y en `TZ=America/Bogota` (ver «Comandos»).
- `tsc` acotado (`tsconfig.scope.json` en el scratchpad, `types: [jest, node]`, heap 8 GB): **0 errores**.
- `eslint` sobre mis 4 tests: limpio.
- Obligatorios 1–4: **cerrados y verificados**. Opcionales 5–7: **cerrados**.
- Hallazgos nuevos: **0 altos, 0 medios, 4 bajos** anotados con test (ninguno bloquea).
- Mutaciones: **21 muertas / 21** (3 de ellas —M05, M06, M09— sobrevivieron a mi primera versión de los tests y
  murieron tras añadir aserciones fijas; ver anexo).
- BD (solo `SELECT`): las dos `fn_reporte_crm_*` → `has_function_privilege('anon', …, 'EXECUTE') = false`,
  `authenticated = true`, `SECURITY DEFINER` con guarda `ORG_FORBIDDEN`; `SECURITY DEFINER` ejecutables por `anon`
  = **184**; `fn_rate_limit_hit` = 1; `rate_limit_buckets` = 1; migración `f00_40` = 1 en `schema_migrations`.
  RLS de `organization_modules` (`SELECT` para miembros activos de la organización) y `modules` (`SELECT` para
  `authenticated`): `getActiveModules(orgId, ctx.supabase)` con el cliente de sesión **sí** devuelve el plan del
  miembro (no queda en «solo core» por RLS).

## Tabla de verificación (qa r3 → código r4)

| # qa r3 | Qué se comprobó | Evidencia (archivo:línea) | Test (mío salvo que se diga) | Estado |
|---|---|---|---|---|
| 1a H4 plan | `field` de plantilla NUNCA por número; con `metadata.phone_number_id` → `phone_number_on_template_change`, sin consultar, en todo ámbito | `webhookAuthorization.ts:128-130` (`isTemplateField`), `:200-213` (`describeChange`), `:122` (`DROP_IN_ANY_SCOPE`), `:369-378` (global: descarta y registra) | `webhook/__tests__/testerR4` › «H4 · variantes» (8 tipos: string A/B, 123, 1.5, objeto, array, `''`, `false` → 0 consultas, 403 `invalid_signature`); `null` cuenta como ausente (resuelve por WABA); número fuera de `metadata` no cuenta; **la propia B** con número inyectado también se descarta; bajo el global → 200 con `droppedChanges[reason=phone_number_on_template_change]` | **Cerrado** |
| 1a coherencia | número de A bajo `entry.id` de B → `mixed_channels` | `:293-307` | ídem › «coherencia · bordes»: WABA de B **sin** app_secret → 403 con A y con global; WABA compartido por 8 y 9 → 403 con los tres secretos; simétrico (pn-b bajo waba-a firmado por B → 403); mismo tenant con otro secreto (waba-a2) → 200 con A / 403 con A2; memoización (6 cambios → 2 consultas) | **Cerrado** |
| 1b procesamiento | `processWebhookPayload(payload, { authorizedOrganizationIds })`, intersección para plantillas y mensajes; `[]` = nadie | `whatsappCloudService.ts:48-54`, `:409-410`, `:442-452`, `:471-479`; `route.ts:154-157` | `services/…/testerR4` › «H4 extremo a extremo» (plan real + servicio real + `applyTemplateStatusUpdate` real: `tpl-8` sigue `APPROVED` en 7 variantes; plantilla de B bajo waba-a se busca solo en la 7 y la de A sí se aplica; fallback nombre+idioma no cruza); «tipos raros»: `['8']`, `[NaN]`, `[0]`, `[-8]`, `[8.5]`, `[null]`, `[]` → nada; mensajes de pn-b se saltan y pn-a del mismo lote se procesa. Ruta: `optsSeen = [[7],[7],[8]]`, global → `undefined`, nunca `[]` | **Cerrado** |
| 1c tests | sin `.failing`; nuevos casos del builder | `webhook/__tests__/testerR3.f0sec.test.ts:211-262`, `services/…/testerR3.f0sec.test.ts:102-172`, `webhookProcessing.f0secR3.test.ts` | verdes sin `.failing` (263 base) | **Cerrado** |
| 2 `modulosActivos` en servidor | `getActiveModules(ctx.organizationId, ctx.supabase)`, intersección, aviso, ya no obligatorio; `userRole` de sesión | `reportes/route.ts:21-35`, `:72`, `:75`, `:89` | `reportes/__tests__/testerR4` › `['crm','hrm']` con plan `['crm']` → crm sí, aviso `fueraDelPlan: ['hrm']`; `['HRM']`, duplicados, espacios, `'hrm\u0000'`, 10 000 elementos, `__proto__` → no amplían; `getActiveModules` lanza → 500 sin OpenAI ni créditos (fail-closed); devuelve `[]` → ni crm; orden módulos < créditos < OpenAI; sesión de la 8 lee el plan de la 8; `roleName` ausente → «Rol: miembro», nunca el del body | **Cerrado** |
| 3 rate limit + `MAX_LOOKUPS` | `checkRateLimit('wa_webhook:ip:<ip>', 120/60 s)` antes del JSON; 429 + `Retry-After`; `MAX_LOOKUPS = 10` | `route.ts:72`, `:83-91`; `webhookAuthorization.ts:163`, `:243-259` | ruta › la 121.ª **legítima** también 429; 120 basuras + 1 legítima → 429; XFF primer salto; el 429 no consume `request.text()` (`bodyUsed = false`); cubo propio (`otra_ruta:ip:` libre); 50 anomalías de plantilla no consumen presupuesto (2 consultas); mismo WABA en 30 entradas = 1 consulta; 10 exactos se consultan; 11 WABAs → `too_many_channels` sin consultar; `MAX_LOOKUPS === 10` y 10 números + WABA = 11 → 403 sin consultar | **Cerrado** |
| 4 NUL + caso 21 | `\u0000` como escape; caso 21 sin allow-list, `latin1`, `archivo:línea (0xNN)`; byte 0x01 del regex JOBS → `\1` | `services/…/testerR3.f0sec.test.ts:222`; `guardrails.test.ts:1312-1349`, `:1208` | `src/__tests__/testerR4` › regex extraído del guardarraíl detecta NUL/SOH/BEL/BS/VT/FF/SO/US/ESC como bytes reales en un dir temporal y tolera TAB/LF/CR/DEL/UTF-8; barrido simulado → `lib/sucio.test.ts:3 (0x00)`; barrido independiente de `src/` = 0; el test r3 no contiene 0x00 y sí `'pn-a\u0000'`; `guardrails.test.ts` sin 0x01 y el regex de cron CASA con `*/5 * * * *` | **Cerrado** |
| 5 `readOrgBody(ctx, body.context)` | 403 + `console.warn` antes de módulos/créditos/OpenAI | `reportes/route.ts:66` | reportes › sesión 8 + `context.organizationId: 7` → 403 sin módulos; `orgId`, `organization_id`, `org_id`, `'8 '`, `'7abc'`, `{organizationId: 8, organization_id: 7}`, `{organizationId: 7, orgId: 8}` → 403 con `console.warn({session: 7})`; `'7'`, `7.0`, `' 7 '`, `null`, `''` → 200 con la 7 | **Cerrado** |
| 6 idempotencia | `templateEventKey` + `metadata.last_webhook_event` | `webhookTemplateStatus.ts:60-66`, `:92-93` | servicio › mismo cuerpo 5 veces → 2 updates en total y la campaña reanudada no se re-pausa; `templateEventKey`: string decimal y con espacios = número; `'1e9'`, `Infinity`, `NaN`, 17 dígitos → `null`; field y event distinguen; dos plantillas con el mismo `time` se aplican las dos; `applyTemplateStatusUpdate` directo → `{1,1}` y luego `{0,0}` | **Cerrado** (ver bajo 1) |
| 7 docs | `FASE-00-FUNDACIONES.md:232` (fila `f00_40` APLICADA, 216 → 184, `fn_rate_limit_hit` existe, `RATE_LIMIT_STORE=db` pendiente); `docs/hallazgos/F-11.md:4,26-38` | coincide con lo que devuelve la BD hoy (184 / 1 / 1) | — | **Cerrado** |

## Fallos encontrados (todos bajos; ninguno bloquea)

### 1. [bajo] Replay fuera de orden: un `PAUSED@t1` capturado se re-aplica después de un `APPROVED@t2` legítimo
`webhookTemplateStatus.ts:92` compara solo con el **último** evento aplicado (`last_webhook_event === eventKey`). La
secuencia PAUSED@1700000000 → APPROVED@1700000060 → replay de PAUSED@1700000000 vuelve a dejar la plantilla `PAUSED`
y re-pausa la campaña. El replay idéntico e inmediato (el caso del qa r3 §5) sí está cubierto. Requiere capturar un
cuerpo firmado (TLS), como en r3. Test: `services/…/testerR4` › «ANOTADO (bajo): replay FUERA DE ORDEN». Esperado
(cuando se quiera cerrar): guardar además `last_webhook_time` y saltar eventos con `time` **menor** que el aplicado.

### 2. [bajo] `context` no-objeto en reportes: string/número/`true` → 200; array `[{organizationId: 8}]` esquiva el 403
`reportes/route.ts:66-75`: `readOrgBody` devuelve tal cual lo que no es objeto/params (arrays incluidos:
`organizationBody.ts:104`), `!claimedContext` solo rechaza falsy, y `{ ...'8' }` esparce caracteres. Efecto **seguro**
(la organización efectiva siempre es `ctx.organizationId`, créditos y RPC van a la 7), pero el contrato «403 y se
registra» no se cumple para `context: [{organizationId: 8}]` y un `context: '8'` recibe 200 en vez de 400. Tests:
reportes › «ANOTADO (bajo): context como string / número / true» y «context como ARRAY». Esperado: `typeof context
=== 'object' && !Array.isArray(context)` en la validación 400.

### 3. [bajo] Rate limit del webhook: cubo `unknown` sin cabecera de IP y cubo compartido por organización de egreso
- `getClientIp` (`rateLimit.ts:203-207`, fuera del alcance) devuelve `'unknown'` sin `x-forwarded-for` /
  `x-real-ip` / `cf-connecting-ip`: todas esas peticiones comparten un cubo de 120/min. En Vercel la cabecera
  siempre viene; en otro proxy hay que confirmarlo. Test: ruta › «ANOTADO (bajo): sin x-forwarded-for…».
- El cubo es por **IP de Meta**, no por organización: si Meta concentra la entrega de todos los tenants de la
  plataforma en pocas IPs de egreso, un pico multi-tenant supera 120/min y Meta reintenta con backoff (retraso, no
  pérdida). Es funcional, no de seguridad; sugiero vigilar el `console.warn('Rate limit por IP superado')` en
  producción las primeras semanas. Comprobado también que el 429 va **antes** de la firma: un tercero solo puede
  agotar el cubo de Meta si comparte su IP. Test: ruta › «la 121.ª petición LEGÍTIMA … también recibe 429».

### 4. [bajo · ajeno a r4] El regex de cron strings del caso JOBS (`guardrails.test.ts:1208`) no cubre `M H * * *`
Con el `\1` restaurado la guarda ya casa `'*/5 * * * *'` y `'* * * * *'`, pero la alternativa `\d+ \d+` exige
**seis** campos (`"0 3 * * * *"`): un cron de cinco campos con hora fija (`"0 3 * * *"`) no casa. No es de esta
ronda (el builder r4 solo cambió el byte); se anota con test (`src/__tests__/testerR4` › «…lleva \1…»). Esperado:
`(\*\/\d+|\d+ \d+|\*) \* \* \*` con tres asteriscos en esa alternativa, o dos regex.

## Sondas adversarias sin hallazgo (verdes)
- H4: 8 tipos de número inyectado × firma de A → 0 consultas; `null` = ausente; número fuera de `metadata` ignorado;
  B con número inyectado también se descarta; entrada mixta A+B en entradas separadas → `mixed_channels` con la
  plantilla sin consultar; en la misma entrada `waba-a` → 200, solo el mensaje pasa, descarte registrado con índices
  y el servicio recibe `[7]`; `field` futuro `message_template_components_update` (builder) igual.
- Coherencia: WABA de B sin secreto, WABA compartido 8/9 (403 con B, global y A), simetría, mismo tenant con dos
  secretos, memoización del WABA.
- Servicio: `tpl-8` `APPROVED` en todas las variantes; fallback nombre+idioma acotado a `.in('organization_id',
  autorizadas)`; bajo global `waba-g` aplica y `waba-b` (secreto propio) no; duplicados `[8, 8, 7]` aplican;
  llamada legada sin `opts` = global.
- Rate limit: 429 antes del JSON y sin consumir el body; cubo por primer salto; cubo propio del webhook; JSON
  inválido consume cupo.
- `MAX_LOOKUPS`: anomalías no cuentan; entradas con cambios inválidos no aportan su WABA; 10 exactos se consultan;
  11 → sin consultar, tanto números como WABAs.
- Reportes: `__proto__` en `context` y en `modulosActivos` inofensivos; `organizationId` ajeno en la raíz gana al
  `context` correcto; 401 antes del body no-JSON; `modulosActivos: null` = ausente.
- Caso 21: los 9 bytes de control en archivo real; DEL y UTF-8 multibyte tolerados; escapes en fuente no disparan.

## Anexo A — Mutaciones (21/21 muertas)

| # | Archivo | Mutación | Resultado (`TZ=UTC`) |
|---|---|---|---|
| M01 | `webhookAuthorization.ts` | `isTemplateField` → `return false` | 18 rojos / 61 |
| M02 | ídem | quitar el descarte `phone_number_on_template_change` (número ignorado en vez de descartado) | 13 rojos |
| M03 | ídem | `coherent = true` (sin coherencia número ↔ WABA) | 5 rojos |
| M04 | ídem | coherencia solo por ámbito (sin `organizationId ===`) | 1 rojo (mismo tenant con otro secreto) |
| M05 | ídem | `MAX_LOOKUPS = 25` | **sobrevivió** a la v1 (tests relativos a la constante) → añadido `expect(MAX_LOOKUPS).toBe(10)` + 10 números + WABA → 1 rojo |
| M06 | ídem | el WABA no cuenta en el presupuesto cuando la `change` trae número | **sobrevivió** a la v1 → mismo test nuevo → 1 rojo |
| M07 | ídem | `DROP_IN_ANY_SCOPE` sin `phone_number_on_template_change` | 1 rojo (global entrega la anomalía) |
| M08 | `whatsappCloudService.ts` | `isAuthorized = () => true` | 7 rojos / 26 |
| M09 | ídem | `[]` tratado como global | **sobrevivió** a la v1 (el caso `[]` estaba solo en el test del builder, que sí lo mata) → añadido `[]` a mis tipos raros → 2 rojos / 52 |
| M10 | ídem | mensajes sin comprobar `isAuthorized` | 7 rojos |
| M11 | `webhook/route.ts` | siempre `authorizedOrganizationIds: undefined` | 4 rojos / 36 |
| M12 | ídem | `limit: 1000` | 6 rojos |
| M13 | ídem | clave sin IP (`wa_webhook:ip:all`) | 1 rojo |
| M14 | `reportes/route.ts` | unión en vez de intersección | 4 rojos / 30 |
| M15 | ídem | `context` sin `readOrgBody` | 8 rojos |
| M16 | ídem | `userRole` del body con prioridad | 2 rojos |
| M17 | ídem | `modulosActivos` del body si es array (saltar el servidor) | 8 rojos |
| M18 | `webhookTemplateStatus.ts` | quitar el `continue` de idempotencia | 2 rojos / 27 |
| M19 | `guardrails.test.ts` | `CONTROL_BYTE` sin `\x00` | 3 rojos / 16 (mi test) |
| M20 | árbol | sonda `src/lib/__sonda_r4_nul.ts` con NUL real | caso 21 → `lib/__sonda_r4_nul.ts:1 (0x00)` y mi barrido en rojo; sonda borrada |
| M21 | `guardrails.test.ts` | `\1` → byte 0x01 (el estado anterior al r4) | 3 rojos / 99: caso 21 sobre sí mismo + mis dos tests |

Cada mutación se aplicó con un `replace` que exige exactamente una coincidencia, se ejecutó con `TZ=UTC`, se
restauró copiando la copia del scratchpad y se comparó el md5 con la línea base (`mutaciones.log` en el scratchpad).

**Ninguna mutación viva.** md5 final del alcance = línea base:
```
7d27515414cb10f72057237784817162  src/lib/services/integrations/whatsapp/webhookAuthorization.ts
4b613650ffc84a3189113e73b516701a  src/lib/services/integrations/whatsapp/whatsappCloudService.ts
ad1e2c9c93dabbadc93038731c72c49b  src/lib/services/integrations/whatsapp/index.ts
03c3ea8c1cfbff2535a93f4a474b30e3  src/app/api/integrations/whatsapp/webhook/route.ts
4c641b41c651076d7f522e3f94ccdf18  src/app/api/ai-assistant/reportes/route.ts
b4e46e585801122f7074d54e89d6eafe  src/lib/services/crm/whatsapp/webhookTemplateStatus.ts
d4ee93722156d758e2da2ce737502f6e  src/__tests__/guardrails.test.ts
find src -name "*.mutbak" -o -name "__sonda*" → 0
```

## Anexo B — El caso 21 atrapó a mi propia herramienta
Al escribir dos de mis tests, la herramienta de escritura decodificó `\u0000`, `\u0001` y `\u007f` a **bytes
reales** (exactamente la clase de fallo que motivó el caso 21 y el §Ciclo /loop de CLAUDE.md). La primera ejecución
de `src/__tests__/testerR4.f0sec.test.ts` (barrido independiente) los señaló en `reportes/__tests__/testerR4…:197` y
`__tests__/testerR4…:14,118`; el caso 21 del guardarraíl los habría señalado igual. Se sustituyeron por secuencias
de escape con un script del scratchpad antes de la entrega. Evidencia de que el guardarraíl funciona sobre tests
nuevos, no solo sobre el histórico.

## Comandos con resultado
```
TZ=UTC            npx jest src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/app/api/ai-assistant/reportes src/__tests__/guardrails.test.ts
                  → (línea base, antes de mis tests) Test Suites: 11 passed · Tests: 263 passed · 40,7 s
TZ=UTC            npx jest … + src/__tests__/testerR4.f0sec.test.ts
                  → Test Suites: 15 passed · Tests: 372 passed · 28,0 s
TZ=America/Bogota (misma orden) → Test Suites: 15 passed · Tests: 372 passed · 27,2 s
tsc:              NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p <scratchpad>/tsconfig.scope.json
                  (extends tsconfig.json; include = 7 archivos del alcance + sus __tests__ + d.ts globales;
                   types jest/node; typeRoots node_modules/@types) → 0 errores (exit 0)
eslint:           npx eslint <mis 4 testerR4.f0sec.test.ts> → limpio
git diff --stat stash@{0} -- <7 rutas del alcance> → vacío (al inicio; el stash desapareció después)
md5sum -c md5-baseline.txt → 7/7 OK (final)
MCP execute_sql (solo SELECT):
  fn_reporte_crm_funnel / fn_reporte_crm_ranking_vendedores: anon_exec=false · auth_exec=true · prosecdef=true · has_guard=true
  secdef_anon=184 · fn_rate_limit_hit=1 · rate_limit_buckets=1 · schema_migrations f00_40=1
  pg_policies organization_modules: SELECT para miembros activos de la org · modules: SELECT para authenticated
```

## Cobertura no probada / riesgos pendientes
- No se ejecutó el webhook contra Meta ni `processWebhookPayload` contra Supabase real: H4 se demuestra con HMAC real
  en la ruta (servicio doblado) y con plan + servicio + `applyTemplateStatusUpdate` reales sobre tablas dobles que
  evalúan `eq/in/->>`.
- El rate limit se probó con el store en memoria (`_resetRateLimits`); `RATE_LIMIT_STORE=db` y `fn_rate_limit_hit`
  no se ejercitaron (F0-SEC C+D). Sin la variable en Vercel el límite del webhook es por instancia.
- Lo que el qa r3 dejó para el 10 sigue igual: `integration_events` por rechazo (`mixed_channels`,
  `invalid_signature`, `rate_limited`, descartes) con `request_id`; Vault para `app_secret`.

## Calificación de robustez (1-10, opinión técnica del tester)
**9,2/10.** Los dos muros de H4 están donde el QA los pidió y aguantan 40 variantes (incluida la propia B con número
inyectado, el WABA compartido y el mismo tenant con dos secretos); el plan y el procesamiento ya comparten una única
fuente de autorización (`authorizedOrganizationIds`) y 21/21 mutaciones mueren, tres de ellas solo tras endurecer mis
propios tests. La lista blanca de reportes vive en el servidor y es fail-closed ante error o plan vacío; el 403 del
`context` anidado se registra; el rate limit va antes de cualquier coste; el caso 21 detectó bytes reales en tests
nuevos en su primera ejecución. Lo que resta es bajo y está anotado con test: replay fuera de orden (clave por último
evento, no monotónica), `context` no-objeto/array sin 400/403, el cubo `unknown` y el cubo compartido por IP de
egreso de Meta, y el regex de cron de 5 campos ajeno a esta ronda.
