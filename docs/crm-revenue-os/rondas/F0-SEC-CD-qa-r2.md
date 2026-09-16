# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — QA, ronda 2

Fecha: 2026-09-16. Rama `main`, sin ramas, sin commits, sin editar código: solo lectura,
verificación y este informe. Insumos: `F0-SEC-CD-builder-r2.md`, `F0-SEC-CD-tester-r2.md`
(7/10), `F0-SEC-qa-r1.md` (puntos 10–19), `FASE-00-FUNDACIONES.md`, test del tester
`src/lib/security/__tests__/testerR2CD.f0sec.test.ts` (6 `it.failing`). Contexto: la migración
`rate_limit_buckets` **ya está aplicada**; falta `RATE_LIMIT_STORE=db` en Vercel.

Cada hallazgo del tester se verificó leyendo el archivo y la línea; donde el número del tester no
se reprodujo (guardarraíl 5) se anota la medición propia. Sonda propia en el scratchpad
(`probe5b.js`: quita `readOrgBody` de cada handler estricto y comprueba si el guardarraíl actual
lo detecta; normaliza CRLF, cosa que la primera versión no hacía y daba 2 falsos positivos en
`roi`/`proposals`).

## Calificación: **7,7 / 10** — requiere-nueva-ronda (umbral 9,5)

| Dimensión | Peso | Nota | Por qué |
|---|---|---|---|
| Funcionalidad / contrato (regla dura 5) | 25 % | 7,5 | 112 archivos migrados y 4 rutas verificadas con sesión doblada; pero 2 rutas devuelven **400** en vez de 403 (§1), `readOrgBody` se esquiva con dos claves sin registro (§3) y la sobrecarga síncrona no mira la query en ~35 rutas (§7). |
| Seguridad (regla dura 6, fail-closed) | 30 % | 8,5 | La org efectiva siempre sale de la sesión; rate limit fail-closed y atómico; `jti` de un solo uso; admin por id/permiso. Resta: RPC de permisos que lanza → 500 sin registro (§5) y `foreignOrgResponse` (F10, otra sesión) solo mira `organization_id`. |
| Calidad de código (punto único, regla 7) | 15 % | 8,0 | Un predicado y un punto único; helpers F10/F12/F13 delegan. Resta: camino legado `persistentCount` sin consumidor y con carrera (§4); 8 duplicados inline del predicado fuera del CRM (legacy, se listan). |
| Pruebas (guardarraíl real, mutaciones) | 20 % | 6,5 | 370 tests verdes; 16/18 mutaciones muertas. Pero el guardarraíl 5 —la garantía de no reincidir— **no ve** que se quite `readOrgBody` en 15 de 170 handlers (§2) y `isPlaceholderCredential(` lo exime (§6). |
| Documentación | 10 % | 8,0 | Informe del constructor completo y honesto. FASE-00 tiene 3 líneas obsoletas (§8). |

Media ponderada: 7,5·0,25 + 8,5·0,30 + 8,0·0,15 + 6,5·0,20 + 8,0·0,10 = **7,7**.

## Verificación ejecutada

```
npx jest src/__tests__/guardrails.test.ts src/lib/security
  → Test Suites: 12 passed, 12 total · Tests: 370 passed, 370 total · 46 s
  (incluye los 6 `it.failing` del tester, que «pasan» porque siguen fallando;
   `builderR3.f0sec.test.ts:69`, rojo en el informe del constructor, ya está verde: lo cerró SEC-AB r3)

node <scratchpad>/probe5b.js
  → handlers de escritura estrictos: 180 · con readOrgBody directo: 170
  → sobreviven a «quitar readOrgBody» con el guardarraíl ACTUAL: 15
  → sobreviven con el helper acotado por TOP_LEVEL_RE: 0
```

## Hallazgos verificados (archivo:línea)

### 1. [alto · obligatorio] `ai-assistant/attachments` y `transcribe` responden 400 a una org ajena
Confirmado. `src/app/api/ai-assistant/attachments/route.ts:103-110` y
`src/app/api/ai-assistant/transcribe/route.ts:78-82`: `form = readOrgBody(ctx, await request.formData())`
dentro de un `try/catch` sin `instanceof OrgContextError` que devuelve 400 `BAD_REQUEST` /
«Petición mal formada». El `console.warn` sí se emite y no se escribe nada (la mitad «registro»
se cumple), pero el contrato «403 `FOREIGN_ORGANIZATION`» no. Tests: `testerR2CD` C4-a/C4-b.

### 2. [alto · obligatorio] Guardarraíl 5: helper local mal acotado deja handlers ciegos
Confirmado en `src/__tests__/guardrails.test.ts:367-378` (`localHelpersMatching`): el cuerpo de
un helper llega hasta la **siguiente declaración que casa con `declRe`**; como `export async
function POST` no casa, un `function fail()` / `const errorResponse = (` declarado antes de los
handlers «contiene» el `readOrgBody` de todos ellos y cualquier handler que llame a `fail(`
pasa sin `readOrgBody` propio.

Medición propia (mutación «quitar `readOrgBody` del handler»): **15 de 170 handlers**
sobreviven —`automation-rules/[id]` (PATCH, DELETE), `sequences/[id]` (PATCH, DELETE),
`stage-agents` (POST, DELETE), `stages/[id]` (PATCH, DELETE), `stages` (POST, PUT),
`verticales/[id]` (PATCH, DELETE), `voices` (POST, PATCH, DELETE)—. El tester contó 33 con otra
métrica (handlers «cubiertos» por un helper mal acotado, incluidos varios de `ai-assistant/**`
que en mi mutación sí se detectan); la cifra exacta no cambia el veredicto: **M18 sobrevive** y
el guardarraíl vuelve a ser «a nivel de archivo» en esos 7 archivos. Con el cuerpo del helper
acotado en la siguiente línea que case con `TOP_LEVEL_RE` (lo que ya hace `splitHandlers`)
sobreviven **0**: el arreglo propuesto por el tester es suficiente.

### 3. [medio · obligatorio] `readOrgBody` solo inspecciona la primera clave presente
Confirmado en `src/lib/security/organizationBody.ts:98-100`: devuelve la primera de
`ORG_BODY_KEYS` con valor `!= null`; `''` cuenta como presente y «gana», y luego
`foreignOrganizationInBody(:46)` la trata como ausente. `{organization_id: 120, organizationId:
999}` y `{organization_id: '', orgId: 999}` pasan sin registro. Mismo defecto en la rama
`ParamsLike` (`:89-94`, `has()`). Tests: `testerR2CD` C1-a/C1-b.

### 4. [medio · obligatorio] Carrera en el camino legado `persistentCount`
Confirmado en `src/lib/security/rateLimit.ts:128-142` (proyección sin mutar) → `:144-158`
(`await fn`) → `:184-202` (registro). N concurrentes proyectan `count = 1`. Sin consumidor en
producción (`grep persistentCount`: solo `rateLimit.ts` y tests), por eso medio. Test: `testerR2CD`
D1-a.

### 5. [medio · obligatorio] `hasOrgAdminOrPermission`: RPC que lanza → 500
Confirmado en `src/lib/utils/orgContext.ts:319-329`: solo trata `{ error }`; una promesa
rechazada se propaga y `withOrg` (`:442-444`) relanza lo que no es `OrgContextError` → 500 sin el
registro «se deniega». El propio docstring (`:314`) promete «un error de la RPC cuenta como no».
Test: `testerR2CD` C3-a.

### 6. [bajo · obligatorio, una línea] `isPlaceholderCredential(` exime del guardarraíl 5
Confirmado en `guardrails.test.ts:337` (`WEBHOOK_RE`). No es verificación de firma. Mutación M17
sobrevive; hoy 0 handlers estrictos la explotan.

### 7. [bajo · opcional] Sobrecarga síncrona no ve la query; `bodyUsed` → `{}` en silencio
Confirmado (`organizationBody.ts:139, 188-190`). Las ~35 rutas con `readOrgBody(ctx, await
request.json()…)` no inspeccionan `?organization_id=999`. Documentado por el tester; sin
explotación conocida (ninguna de esas rutas usa la query para la org).

### 8. [bajo · obligatorio, solo docs] FASE-00 con 3 líneas obsoletas
- `docs/crm-revenue-os/FASE-00-FUNDACIONES.md:36` y `:1435`: `requireOrgAdmin` descrito como
  «criterio de `rbac.ts` … rol 'Super Admin'/'Admin de organización' o role_id 1|2». Los nombres
  ya no participan (`src/lib/utils/orgAdmin.ts:41-43`, `ORG_ADMIN_ROLE_NAMES` = 0 apariciones).
- `:1083`: «migración pendiente de aplicar» → aplicada el 2026-09-16; falta `RATE_LIMIT_STORE=db`.
- El informe del constructor (`F0-SEC-CD-builder-r2.md:6-7, 75, 172-179`) dice «NO aplicada»;
  el de r3 debe dejar el estado real.

### Confirmado como correcto (sin acción)
- Punto único: `organizationBody.ts:110-124` (`console.warn` estructurado + `OrgContextError(403,
  'FOREIGN_ORGANIZATION')`), `orgContextError.ts` clase única; `f12RouteSupport.ts:16`,
  `f13RouteSupport.ts:10`, `voiceLibrary.ts:217` (re-export), `f10RouteHelpers.ts:9` (vía
  `voiceLibrary`) delegan en el mismo predicado. `withWhatsAppRoute` sin `noOrgInBody`.
- Header/cookie discrepantes → 403 `ORG_AMBIGUOUS` antes de membresías (`orgContext.ts:116-154`);
  `resolveOrgFromExternal` `.limit(2)` → 409 (`:380-408`).
- Admin por id/permiso: `orgAdmin.ts:41-43`; `check_user_permission` con user/org de la sesión
  (`orgContext.ts:319-323`); `withOrg({admin})` la usa (`:440`).
- Rate limit: validación fail-closed (`rateLimit.ts:105-135`), evaluar-todo-luego-registrar,
  store atómico `fn_rate_limit_hit` (`rateLimitStore.ts:55-67`), error de RPC → bloquea; cifra
  5/10 min en `verify/{send,check}:22/21` e `invite/resend`.
- ws: `exp ≤ now+3600`, `orgId` entero > 0, `jti` 1..64 (`wsSessionToken.ts:111-114`);
  `consumeWsSessionJti` con barrido (`:140-149`).
- Integración: `src/app/api/__tests__/orgBodyRoutes.f0sec.test.ts` (chat, whatsapp/send,
  activities, teams DELETE por query), 8 tests.
- `STRICT_ALLOWLIST` con motivo por entrada + test «no obsoletas»; `ENOENT` tolerado en `readFile`.

## Puntos OBLIGATORIOS para el builder r3 (en este orden)

| # | Archivo | Cambio | Test que lo demuestra |
|---|---|---|---|
| 1 | `src/app/api/ai-assistant/attachments/route.ts:103-110` y `transcribe/route.ts:78-82` | Separar: `let form; try { form = await request.formData(); } catch { return 400 }` y **fuera** del `try`: `form = readOrgBody(ctx, form, { route })` (el `catch (err instanceof OrgContextError)` que ya tienen las rutas lo convierte en 403). | Quitar `.failing` de `testerR2CD` C4-a y C4-b → verdes. Añadir al `orgBodyRoutes.f0sec.test.ts` el caso multipart de ambas (403 + `warn` + servicio no invocado). |
| 2 | `src/__tests__/guardrails.test.ts:367-378` `localHelpersMatching` | Acotar el cuerpo del helper en `min(siguiente declRe, siguiente línea que case con TOP_LEVEL_RE)` (misma técnica que `splitHandlers:351-357`). | Test de muestra nuevo: `function fail() {…}` + `export async function POST { getServerOrgContext(); readOrgBody(); fail(); }` + `export async function DELETE { getServerOrgContext(); fail(); }` → `DELETE` debe ser ofensor. Mutación M18 (`stages/[id]/route.ts:122`) debe poner el guardarraíl en rojo. `probe5b.js` → 0 supervivientes. |
| 3 | `guardrails.test.ts:337` `WEBHOOK_RE` | Quitar `isPlaceholderCredential`. | Mutación M17 (`tasks/route.ts` POST sin `readOrgBody` + `isPlaceholderCredential('x')`) → rojo. Comprobar que ningún handler estricto pasa a ofensor (hoy 0). |
| 4 | `src/lib/security/organizationBody.ts:87-102` `claimedOrganizationIn` | Devolver TODAS las claves presentes con valor no vacío (`''`/whitespace = ausente por clave); `assertNotForeign` evalúa cada una y lanza en la primera ajena (registrando `key`). Aplica a objeto y a `ParamsLike`. | Quitar `.failing` de C1-a y C1-b; añadir en `organizationBody.test.ts` el caso `URLSearchParams('organization_id=&orgId=999')` → 403. El test «null / '' pasan» sigue verde. |
| 5 | `src/lib/utils/orgContext.ts:319-329` `hasOrgAdminOrPermission` | `try { rpc } catch (err) { console.warn('[orgContext] check_user_permission lanzó; se deniega', {...}); return false; }`. | Quitar `.failing` de C3-a; mutación «quitar el try» → rojo. |
| 6 | `src/lib/security/rateLimit.ts:144-158` | O bien **retirar** la opción `persistentCount` (sin consumidor; el store atómico la sustituye; actualizar `rateLimit.test.ts`, `placeholderSecrets.test.ts` y `testerR3.f0sec.test.ts` que la citan), o bien reservar el hit en memoria antes del `await` y revertir si bloquea. Preferible retirar (regla 7: un solo mecanismo). | Quitar `.failing` de D1-a (si se retira la opción, reescribir D1-a como «`persistentCount` ya no existe en `CheckRateLimitOptions`»). |
| 7 | `docs/crm-revenue-os/FASE-00-FUNDACIONES.md:36, 1083, 1435` | Quitar los nombres de rol de la descripción de `requireOrgAdmin`; «migración aplicada 2026-09-16, pendiente `RATE_LIMIT_STORE=db` en Vercel». Informe r3: estado real de la migración. | Revisión de QA r3. |

Al cerrar 1–6 los 6 `it.failing` de `testerR2CD.f0sec.test.ts` pasan a rojo por «ya no falla»:
hay que quitar el `.failing` en el mismo cambio.

## Opcionales (no bloquean el 9,5)

- `organizationBody.ts`: `readOrgBody(ctx, body, { request })` para que la sobrecarga síncrona
  también inspeccione la query; o dejarlo escrito como límite conocido en la cabecera (§7).
- `guardrails.test.ts:42-47` `walkDir`: tolerar `ENOENT` en `readdirSync` (fallo 14 a medias).
- `integration_events` por cada rechazo de org ajena / ambigüedad con `request_id` (QA r1 «para
  el 10»); hoy solo `console.warn`.
- Duplicados inline del predicado fuera del CRM (regla 7, legacy, fuera del alcance de F0-SEC):
  `chat/ai/{auto-response,classify-intent,generate-response,generate-summary,lab-test}`,
  `integrations/sendgrid/send`, `integrations/whatsapp/send`, `notifications/process`
  → `readOrgBody` cuando una fase los toque.

## Otra sesión (F10–F13, solo se listan; no tocar desde SEC C+D)

- Las 6 rutas de `STRICT_ALLOWLIST` (`health/[customerId]` POST, `onboarding/templates` POST,
  `partners/[id]` DELETE, `partners/tiers/[id]` DELETE, `payments/register` POST,
  `referrals/programs/[id]` DELETE): cambio de una línea en `F0-SEC-CD-builder-r2.md §(b)`.
- `src/lib/services/crm/f10RouteHelpers.ts:11-16` `foreignOrgResponse`: solo mira
  `body.organization_id` (no `organizationId`/`orgId`/`org_id` ni la query). `rejectForeignOrganization`
  (F12/F13) recibe el `claimed` que cada ruta extrae, con el mismo límite. Recomendación: reducir
  ambos a `readOrgBody(ctx, body, { route })` para heredar alias, query y registro estructurado.
- `crm/health/recalculate` y `crm/renewals/sync` → `withCron` (opcional).
- `ws-server.ts:117`: el upgrade verifica pero no consume el `jti` (solo `setup`); coste de
  recursos, no de sesión. Decisión de F16/ws.

## Veredicto

requiere-nueva-ronda. Ninguno de los huecos permite escribir en otra organización —la org
efectiva siempre sale de la sesión—, pero el contrato de la regla dura 5 (b) es «403 **y**
registro en todos los handlers» y el guardarraíl que lo garantiza no ve 15 handlers ni el
`try/catch` de 2 rutas. Con los 7 obligatorios cerrados y sus tests, esta sub-parte queda en
9,5+.
