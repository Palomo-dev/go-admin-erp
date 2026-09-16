# F0-SEC — Deuda C (query string en la sobrecarga síncrona de `readOrgBody`) — builder

Fecha: 2026-09-16. Rama `main` (`ac249896`), sin ramas ni commits. BD no tocada (solo código,
tests y este informe). Insumos: `F0-REG-qa-r4.md` (deuda C, l. 56-60 y punto 4),
`F0-SEC-CD-qa-r3.md:104` («la query de esas dos rutas no se inspecciona»),
`f0RegTesterR4.test.ts:235` (`it.failing`), `testerR2CD.f0sec.test.ts:169` y
`testerR3CD.f0sec.test.ts:454` («documentado»). No se tocó `whatsapp/**`, `rateLimit.ts`,
`aiCostService.ts` ni `webhookTemplateStatus.ts` (otro builder), ni nada de `pos-display/**`,
`messages/*.json`, `docs/pos-doble-pantalla/**` o `PROGRESS.md` (otra sesión).

## El hueco

`readOrgBody(ctx, request)` comprobaba query string y body. La sobrecarga síncrona
`readOrgBody(ctx, bodyYaParseado)` —la que usan las rutas que parsean el JSON/FormData por su
cuenta para responder su propio 400— solo miraba el body. Resultado: en **37 llamadas de 36
rutas** de `crm/**` y `ai-assistant/**`, `?organization_id=999` con body limpio pasaba sin 403 ni
registro. No era un salto de tenant (la organización efectiva siempre fue la de sesión), pero
incumplía el contrato del punto único («si el body o la query trae OTRA organización → 403»).

## Cambio en el punto único (sin duplicar lógica)

`src/lib/security/organizationBody.ts`:

- `ReadOrgBodyOptions.request?: Pick<Request, 'url'>` (`:60-68`). Solo la usa la sobrecarga
  síncrona; el tipo mínimo (`url`) admite `Request`, `NextRequest` y dobles de test.
- La lectura de la query que vivía dentro de `readFromRequest` se extrajo a
  `assertQueryNotForeign(ctx, req, opts)` (`:175-183`): `new URL(req.url)` → `assertNotForeign(ctx,
  url.searchParams, opts, 'query')`; una `url` que no parsea (relativa, `undefined`) no se
  inspecciona, como antes. `readFromRequest` la llama (`:187`) y la sobrecarga síncrona también,
  **antes** del body (`:247`): mismo código, mismo orden, mismo `warn`/403 `where: 'query'`.
- Sin `opts.request` la sobrecarga síncrona se comporta exactamente como antes (solo body): las
  ~110 rutas ya migradas a la sobrecarga con `Request` y los servicios que la usan con un objeto
  no cambian.

## Rutas migradas (inventario mecánico, 37 sitios en 36 archivos)

Guion de una pasada (`scratchpad/migrate.js`, no versionado): para cada `route.ts` de
`src/app/api/{crm,ai-assistant}/**` sin `whatsapp/`, cada `readOrgBody(` cuyo 2.º argumento no
es `request|req|nextRequest|nextReq` (es decir, la sobrecarga síncrona) recibe `{ request }` (o
`, request` si ya tenía `{ route }`). Todos los handlers afectados nombran su parámetro
`request`; 0 casos sin request disponible. Segunda pasada en seco: 0 sitios pendientes. EOL
conservado (los 36 archivos son CRLF; verificado antes/después con un contador de `\r\n`).

| Ruta (`src/app/api/`) | Llamada |
|---|---|
| `ai-assistant/attachments/route.ts` | `readOrgBody(ctx, form, { route: 'ai-assistant/attachments', request })` |
| `ai-assistant/stream/route.ts` | `readOrgBody(ctx, body, { request })` |
| `ai-assistant/transcribe/route.ts` | `readOrgBody(ctx, formData, { route: 'ai-assistant/transcribe', request })` |
| `ai-assistant/tts/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/activities/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/automation-rules/[id]/trigger/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/calls/manual/route.ts` | `readOrgBody(ctx, await request.formData(), { request })` |
| `crm/calls/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/calls/[id]/analysis/apply/route.ts` | `readOrgBody(ctx, raw, { request })` |
| `crm/calls/[id]/analyze/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/calls/[id]/link/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/calls/[id]/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/calls/[id]/transcribe/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/config/providers/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/config/providers/test/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/documents/route.ts` | `readOrgBody(ctx, await request.formData(), { request })` |
| `crm/leads/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/leads/[id]/convert/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/me/comm-preferences/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/meetings/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/meetings/[id]/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/notes/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/opportunities/[id]/stage/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/phone-numbers/[id]/route.ts` | `readOrgBody(ctx, await request.json().catch(() => ({})), { request })` |
| `crm/pipeline-templates/[id]/import/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/revenue/inputs/route.ts` | `readOrgBody(ctx, await readJson(request), { request })` |
| `crm/sequences/[id]/enrollments/route.ts` | `readOrgBody(ctx, body, { request })` |
| `crm/settings/telephony/consent-preview/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/settings/telephony/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/stages/route.ts` (POST y PATCH: 2 sitios) | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/stages/[id]/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/tasks/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |
| `crm/transcribe/route.ts` | `readOrgBody(ctx, await request.formData(), { request })` |
| `crm/voice-agents/[id]/dispatch/route.ts` | `readOrgBody(ctx, await request.json().catch(() => ({})), { request })` |
| `crm/voices/clone/route.ts` | `readOrgBody(ctx, await request.formData(), { request })` |
| `crm/voices/library/route.ts` | `readOrgBody(ctx, await request.json().catch(() => null), { request })` |

Las rutas con la sobrecarga con `Request` (`readOrgBody(ctx, request)` / `(ctx, req)`) no
cambian: ya miraban la query.

## Guardarraíl 5 (`src/__tests__/guardrails.test.ts`)

- Regla nueva en ámbito estricto (`:339-346`, `:420-466`, `:486-507`): `syncReadsWithoutQuery`
  recorre cada `readOrgBody(` del handler (más los helpers locales con `readOrgBody` que invoca),
  separa los argumentos de nivel superior con paréntesis balanceados (`callArgs`) y cuenta como
  ofensora toda llamada cuyo 2.º argumento no es request-like (`REQUEST_ARG_RE`) y cuyas opciones
  no llevan `request` (`OPTS_REQUEST_RE`: `{ request }`, `{ request: req }`, `{ route, request }`),
  salvo que en el mismo texto haya `readOrgBody(ctx, request)`. Un handler con ofensoras entra en
  `strictOffenders` como los que no tienen sesión o no llaman al punto único.
- `localHelpersMatching` pasa a apoyarse en `localHelperBodies` (nombre + cuerpo), sin cambio de
  semántica (misma acotación por `TOP_LEVEL_RE`).
- Test de muestra `:643-693`: POST sin opción → `['POST']`; PATCH con `{ request }` y PUT con
  `{ route, request: request }` → cumplen; DELETE con `readOrgBody(ctx, request)` + síncrona sin
  opción → cubierto; fuera del ámbito estricto no aplica; helper local con la síncrona sin opción
  contagia al handler; genérica `readOrgBody<Body>(…)` y alias `req` reconocidos.
- El test M18 (`:611-628`) ajusta su helper a `readOrgBody(ctx, msg, { request })`: con la regla
  nueva, un helper que llama a la síncrona sin la opción ya no «cubre» a nadie (comentado ahí).
- `STRICT_ALLOWLIST` sigue vacía: las 36 rutas cumplen.

## Tests

- `src/lib/security/__tests__/organizationBody.test.ts:108-171` (describe nuevo, 7 tests): query
  ajena + body propio → 403 `where: 'query'` con `route`/`userId`; query propia + body ajeno → 403
  `where: 'body'`; ambas ajenas → un solo 403, el de la query (orden); query propia/sin org →
  devuelve el MISMO body/FormData sin registro; clave repetida en la query → 403; **sin opts (o
  solo `{ route }`) ⇒ comportamiento anterior** (solo body); doble `{ url }` válida → 403,
  relativa/`undefined` → solo body.
- `testerR2CD.f0sec.test.ts:169`: «documentado» → «CERRADO»: con `{ request }` 403 `where: query`;
  sin opción sigue sin mirar la query; body consumido → `{}`.
- `testerR3CD.f0sec.test.ts:454`: «DOCUMENTADO (bajo)» → «CERRADO»: `transcribe` con
  `?organization_id=999` → 403 `{ code }` + `warn where: query, route`; `attachments` con
  `?orgId=999` → 403; query propia → sigue llegando al 400 del formulario.
- `f0RegTesterR4.test.ts:235`: `it.failing` → `it`: 403 `{ ok:false, detail }`, `warn` `where:
  query`, sin `checkRateLimit` ni credenciales. El test «evidencia del hueco» (200 con query
  ajena) se sustituye por «query PROPIA `?organization_id=7` → 200 sin warn» (`:244`). Cabecera
  actualizada.

## Verificación

- `npx jest src/__tests__/guardrails.test.ts src/lib/security src/__tests__/services/f0RegTesterR4.test.ts src/app/api`
  con `TZ=UTC` y con `TZ=America/Bogota`: 54 suites, **1040 passed, 9 failed** en ambos, los 9
  **no atribuibles**: `integrations/whatsapp/webhook/__tests__/{testerR2,testerR4,multiOrg}.f0sec`
  (8) y `auth/invite/resend/__tests__/resend.test.ts` (1, `signInWithOtp` sin llamadas). Sus rutas
  no se tocaron; dependen de `rateLimit.ts`, `integrations/whatsapp/webhook/route.ts` y
  `webhookTemplateStatus.ts`, con cambios sin commitear del otro builder (`git status`). Lo de
  `pos-display` y `sectionContract` no entra en estos patrones.
- `tsc` acotado a los 112 archivos (36 rutas + punto único + 5 suites + resto de rutas con
  `readOrgBody`) con un `tsconfig` temporal en el scratchpad (extiende el del repo, `files`
  explícitos, 8 GB de heap): **0 errores**; la sonda `{ request: 5 }` sí da TS2769 (el tsconfig
  temporal se borró; `git status` limpio de él).
- `eslint` sobre los 42 archivos modificados: 0 errores, 0 avisos.
- 4 mutaciones a mano (`scratchpad/mutate.js`, copia + md5 antes, restauración comprobada por
  md5 IGUAL en las 4):
  1. Quitar `if (opts?.request) assertQueryNotForeign(...)` de la sobrecarga síncrona → **7
     rojos** (`organizationBody.test` ×4, `testerR2CD`, `testerR3CD`, `f0RegTesterR4`).
  2. Quitar `{ request }` de `crm/config/providers/test/route.ts` → **2 rojos**: guardarraíl 5
     nombra `app/api/crm/config/providers/test/route.ts` y `f0RegTesterR4` (403 esperado).
  3. Invertir el orden (body antes que query) → **1 rojo** (`organizationBody.test` «ambas
     ajenas → el de la query»).
  4. Guardarraíl sin `|| syncWithoutQuery` → **1 rojo** (test de muestra de la deuda C).
- EOL: los 112 archivos conservan su terminador original (36 rutas y 3 suites CRLF; punto único,
  `f0RegTesterR4` y `testerR3CD` LF).

## Fuera de alcance / notas para QA

- **Deuda que sigue abierta (fuera del encargo, se deja escrita):** los envoltorios de F10–F13
  `rejectForeignOrganization(tag, body.organization_id, ctx)` (`f12RouteSupport.ts:39`,
  `f13RouteSupport.ts:26`) y `foreignOrgResponse` (`f10RouteHelpers.ts:13`) miran **una sola
  clave del body**; ni la query ni los alias (`organizationId`, `orgId`, `org_id`). 29 rutas de
  `crm/{commissions,contracts,demos,partners,payments/link,proposals,referrals,roi,sales-targets}`
  los usan sin `readOrgBody(ctx, request)` en el mismo handler (`grep` en el scratchpad; 3 más sí
  lo tienen para su DELETE). El guardarraíl 5 los admite porque `FOREIGN_RE` los cuenta como
  punto único. Cierre natural: que esas rutas pasen a `readOrgBody(ctx, request)` (o a la
  síncrona con `{ request }`) y los envoltorios queden como azúcar sobre `readOrgBody`; es el
  mismo patrón mecánico de este informe, una tarde. No se hizo aquí para no abrir F10–F13.
- `docs/crm-revenue-os/rondas/F0-SEC-CD-qa-r3.md:104` y `F0-REG-qa-r4.md` describen el hueco tal
  como estaba: son informes históricos, no se reescriben.
