# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — constructor, ronda 2

Fecha: 2026-09-15 (reanudación tras la «Parada total» de `docs/HANDOFF-2026-09-15.md` §1).
Insumos: `rondas/F0-SEC-qa-r1.md` (puntos 10–19), `rondas/F0-SEC-tester-r1.md` (fallos 6, 7, 14
y sondas P7/P8). BD **solo lectura** por MCP en la ronda anterior (roles 1/2 verificados en
`roles`); esta reanudación no tocó la BD. Sin commits. **La migración de esta sub-parte NO se
aplicó.**

Modo «inspeccionar y completar»: el árbol ya tenía casi todo el trabajo; esta pasada verificó cada
pieza, completó los tests que faltaban, reparó dos daños colaterales y escribe el informe que no
existía.

## Qué se hizo en esta ronda

### Sub-parte C — punto único de la regla dura 5 (b)

- `src/lib/security/organizationBody.ts` — `readOrgBody(ctx, request | body, { route? })`:
  parsea JSON / multipart / form-urlencoded **y la query string**, compara
  `organization_id | organizationId | orgId | org_id` con `ctx.organizationId` y, si difiere,
  `console.warn` estructurado (`{ route, where, key, session, body, userId }`) + `OrgContextError(403,
  'FOREIGN_ORGANIZATION')`. Sobrecarga síncrona para bodies ya leídos (rutas con su propio 400 de
  JSON inválido). `foreignOrganizationInBody` (predicado puro) se conserva y `readOrgBody` delega en
  él; `voiceLibrary.ts`, `f10RouteHelpers.ts`, `f12RouteSupport.ts` y `f13RouteSupport.ts` lo
  importan de aquí (una sola implementación). Módulo hoja: solo importa `orgContextError.ts`.
- `src/lib/utils/orgContextError.ts` (nuevo, hoja) — `OrgContextError` extraído para que
  `organizationBody.ts` y los tests con `orgContext` doblado compartan LA MISMA clase
  (`instanceof` cruza; test explícito).
- `src/lib/utils/orgContext.ts` — re-exporta `readOrgBody` y `OrgContextError`; header y cookie
  discrepantes → **403 `ORG_AMBIGUOUS` + registro** (antes ganaba el header en silencio), detectado
  ANTES de consultar membresías; `resolveOrgFromExternal` con `.limit(2)` → **409 `ORG_AMBIGUOUS`**
  si dos organizaciones comparten el identificador; `hasOrgAdminOrPermission` /
  `requireOrgAdminOrPermission` (`check_user_permission` con usuario y org **de la sesión**, RPC
  fallida = denegado y registrado); `withOrg({ admin })` usa esa variante.
- `src/lib/utils/orgAdmin.ts` — `ORG_ADMIN_ROLE_NAMES` eliminado; decisión síncrona solo por
  `is_super_admin` o `role_id ∈ [1, 2]`; `ORG_ADMIN_PERMISSION_CODE = 'admin.full_access'`.
- `readOrgBody` aplicado a **112 archivos de ruta** (ver tabla §(a)): 17 de `ai-assistant/**`
  (incluida `tts`, nueva), 80 de `crm/**` con `getServerOrgContext`/`withOrg`, y las 15 de
  `withWhatsAppRoute` (`whatsapp/**`, `campaigns/**`): `schemas.ts` ya no envuelve con
  `noOrgInBody` (400) — ahora 403 + registro; zod sigue validando el resto.
- `crm/voice-agents/campaigns/run` migrado a `withCron` (GET y POST).
- `src/__tests__/guardrails.test.ts` caso 5 **por handler exportado** (`splitHandlers` +
  `inlineAliases` para `export const POST = withCron(handle)`): todo POST/PUT/PATCH/DELETE bajo
  `crm/**` y `ai-assistant/**` debe (a) resolver la org por sesión y (b) llamar a
  `readOrgBody`/`rejectForeignOrganization`/`foreignOrgResponse`/`foreignOrganizationInBody`
  (directo o vía helper local). Cron y webhooks firmados quedan fuera automáticamente;
  `crm/webhooks/**` se salta por diseño (firma, guardarraíl 7). `STRICT_ALLOWLIST` con motivo por
  entrada + test de entradas obsoletas; tolera `ENOENT` (fallo 14). El ámbito legacy (resto de
  `src/app/api`) conserva su `ALLOWLIST` de deuda anterior a F0.
- Tests (todos verdes en `TZ=UTC` y `TZ=America/Bogota`):
  - `src/lib/security/__tests__/organizationBody.test.ts` — unidad del punto único.
  - `src/lib/utils/__tests__/orgContext.f0sec.test.ts` (**completado en esta reanudación**):
    header/cookie iguales y distintos, sin `req` (usa `headers()`), cookie legacy, ambigüedad antes
    de membresía, 401 antes que nada, `resolveOrgFromExternal` (1 org / 2 orgs / 2 filas misma org /
    vacío), admin por id y no por nombre, `check_user_permission` con user/org de sesión, RPC
    `false|null|error` → denegado, `withOrg({admin})` 200/403, ambigüedad → 403 JSON.
  - `src/lib/utils/__tests__/orgAdmin.test.ts` (**nuevo**): módulo hoja sin mocks; rol 99 con
    nombre «Admin de organización» / «Super Admin» → no admin; valores raros no conceden.
  - `src/app/api/__tests__/orgBodyRoutes.f0sec.test.ts` — integración con `getServerOrgContext`
    doblado sobre 4 rutas representativas (`ai-assistant/chat` POST, `whatsapp/send` POST vía
    `withWhatsAppRoute`, `activities` POST con `.catch(() => null)`, `teams/[id]` DELETE con la org
    ajena en la **query**): 403 + `console.warn` + servicio NO invocado; sin org o con la de la
    sesión → camino feliz; JSON inválido sigue 400.

### Sub-parte D — verify, ws-server, rate limit

- `src/lib/security/rateLimit.ts` — **fail-closed**: clave vacía, `limit` inválido, `windowMs <= 0`
  / NaN, `persistentCount` que lanza o `store` que falla → bloqueado y registrado (`console.error`).
  `checkRateLimits` evalúa TODAS las claves y solo si todas caben registra el hit (una petición
  bloqueada no consume cupo). Cubo `'unknown'` documentado en la cabecera.
- `src/lib/security/rateLimitStore.ts` (nuevo) — backend persistente y **atómico** sobre la RPC
  `fn_rate_limit_hit(p_entries jsonb)` / tabla `rate_limit_buckets`; selección por
  `RATE_LIMIT_STORE=db|memory` (`.env.example`), aviso único en producción en modo memoria.
  `twilio/verify/{send,check}` e `invite/resend` pasan `{ store: getRateLimitStore() }`; cifra
  unificada **5 / 10 min** por IP, usuario y `to` (FASE-00 §7 y §7.1 alineados).
- Migración **pendiente de aplicar**: `supabase/migrations/20260916000000_crm_v4_f0sec_rate_limit_buckets.sql`
  + `supabase/rollbacks/…_rollback.sql` (ver §(c)).
- `src/lib/security/wsSessionToken.ts` — `jti` aleatorio (12 bytes) en cada token; `consumeWsSessionJti`
  con `Map` jti → exp y barrido por expiración; verificación exige `orgId` entero > 0 y `jti` con
  forma válida; TTL acotado. `conversationRelayHandler.ts` consume el `jti` en `setup` y rechaza el
  segundo uso (registro). Tokens anteriores sin `jti` verifican pero no se pueden consumir.
- `resolveOrgFromExternal` (ver C) cubre el punto 16; nota para F3/F7 sobre unicidad global de
  `e164`/`domain` en el comentario del código y en FASE-00.

### Reparaciones colaterales hechas en esta reanudación

- `docs/crm-revenue-os/FASE-00-FUNDACIONES.md`: una edición anterior (JOBS r4) había dejado la
  celda de auth de `POST /api/crm/jobs/[id]/retry` **pegada delante del título `# FASE 00`** (línea 1)
  y la celda `?status=` de `GET /api/crm/jobs` duplicada. Se movió el fragmento a su fila (734) y se
  quitó el duplicado; nada más cambió.
- Guardarraíl 7: motivo de la entrada `app/api/email/webhook/route.ts` actualizado (la firma la
  verifica `crm/email/webhookService.ts` con `verifyResendWebhook`; la ruta no lo importa).

## Feedback de la ronda anterior que se atendió

| Punto QA r1 | Cómo se resolvió |
|---|---|
| 10 punto único `readOrgBody` + registro | `organizationBody.ts`; helpers F10/F12/F13 delegan en `foreignOrganizationInBody` de ese módulo; `withWhatsAppRoute` deja `noOrgInBody` (400 → 403 + registro). |
| 11 aplicar a ~99 rutas + 15 whatsapp + 17 IA; crons a `withCron` | 112 archivos migrados (§a). `voice-agents/campaigns/run` → `withCron`. `health/recalculate` y `renewals/sync` son F11 (otra sesión): ya usan `verifyCronSecret` (aceptado por el guardarraíl); el paso a `withCron` es opcional para ellos (§b). |
| 12 admin sin nombres de rol; test rol 99 | `orgAdmin.ts` + `orgAdmin.test.ts` + `orgContext.f0sec.test.ts`; `hasOrgAdminOrPermission` para cargos con `admin.full_access`. |
| 13 guardarraíl por handler, allow-list documentada, `ENOENT` | Caso 5 reescrito; `STRICT_ALLOWLIST` = 6 rutas F10–F13 con el cambio exacto (§b); test «no obsoletas». |
| 14 integración 4 rutas con `getServerOrgContext` doblado | `orgBodyRoutes.f0sec.test.ts` (chat, whatsapp/send, activities, teams DELETE — `demos/[id]` y `objections` se sustituyeron por rutas propias de esta sesión; `objections.contract.test.ts` ya cubre la suya). |
| 15 `persistentCount` inyectado, fail-closed, cifra única | Sustituido por el store atómico (`fn_rate_limit_hit`): evita el problema de `limit × instancias` y el doble conteo; `persistentCount` legado sigue soportado y fail-closed. 5/10 min en código y docs. |
| 16 `resolveOrgFromExternal` `.limit(2)` → 409 | Hecho + tests; nota F3/F7. |
| 17 ws token: TTL, `orgId`, `jti` consumo único | Hecho + 6 tests de `jti`. |
| 18 `windowMs <= 0`, evaluar-todo-luego-registrar, cubo `unknown` | Hecho + `rateLimit.test.ts`. |
| 19 docs §7/§7.1 y guardarraíl 7 | §7/§7.1 unificados; motivo de `email/webhook` corregido (la entrada sigue: la ruta no importa el verificador). `docs/hallazgos/F-11.md` (216 → 184) lo anotó SEC-B r2. |

## Decisiones de diseño relevantes

- `readOrgBody` devuelve `any` a propósito en la sobrecarga con `Request` (sustituye a
  `request.json()`, que también es `any`): las 112 rutas conservan su tipado y sus casts.
- La misma organización en el body **no** es un error (antes `withWhatsAppRoute` devolvía 400):
  clientes antiguos que la mandan siguen funcionando; solo una organización DISTINTA es 403.
- Header/cookie discrepantes → 403 y no «gana el header»: un cliente coherente nunca manda dos
  organizaciones; se comprueba antes de la membresía para no revelar a qué orgs pertenece.
- `RATE_LIMIT_STORE` por defecto `memory`: activar `db` sin la migración aplicada apagaría
  `verify/*` e `invite/resend` de golpe (fail-closed). Orden: migración → env → deploy.
- El consumo de `jti` vive en memoria del ws-server (una instancia en Railway). Si algún día hay
  varias, hay que moverlo a la BD (misma tabla `rate_limit_buckets` serviría con `window_ms = ttl`).

## (a) Ruta → estado

Ámbito estricto del guardarraíl 5: 187 `route.ts` bajo `crm/**` y `ai-assistant/**`; 154 con
handlers de escritura, 33 solo `GET`. Mecanismo por archivo:

| Mecanismo | Archivos | Rutas |
|---|---|---|
| `readOrgBody` (sesión: `getServerOrgContext`/`withOrg`) | 96 | `ai-assistant/{attachments,chat,conversations/[id],dynamic-options,execute-action,generate-image,improve-text,pm-assist,pm-planner,reject-action,reportes,seo-keywords,stream,suggestions,transcribe,tts,undo-action}` · `crm/{activities, automation-rules(3), call-tags(2), calls(8), config/providers(2), discovery(3), documents(2), ia(3), icp(5), jobs/[id]/retry, leads(2), me/comm-preferences, meetings(2), notes, objections(3), opportunities/[id]/stage, phone-numbers(3), pipeline-templates/[id]/import, revenue/inputs, roi/templates(2)*, roles(2), scoring/config, sequences(4), settings/telephony(2), stage-agents, stages(3), tasks, teams(4), territories(2), transcribe, verticales(3), voice-agents(5), voices(3)}` |
| `readOrgBody` + `withWhatsAppRoute` | 15 | `crm/whatsapp/{reply,send,settings,templates,templates/[id],templates/[id]/preview,templates/[id]/submit,templates/sync}` · `crm/campaigns/{route,[id],[id]/cancel,[id]/launch,[id]/materialize,[id]/pause,[id]/resume}` |
| `readOrgBody` + `withCron` | 1 | `crm/voice-agents/campaigns/run` (GET+POST) |
| `withCron`/`verifyCronSecret` (sin sesión, fuera del guardarraíl) | 3 | `crm/jobs/run` · `crm/health/recalculate` (F11) · `crm/renewals/sync` (F11) |
| Webhook firmado (`crm/webhooks/**`, guardarraíl 7) | 3 | `crm/webhooks/{stripe,elevenlabs,documenso}` |
| `rejectForeignOrganization` (F12/F13, delega en `foreignOrganizationInBody`) | 19 | `crm/{commissions(4), partners(6), referrals(7), sales-targets(2)}` — 4 con DELETE/POST sin body pendientes (§b) |
| `foreignOrgResponse` (F10, delega en `foreignOrganizationInBody`) | 9 | `crm/{contracts(2), demos(2), payments/link, proposals(3), roi/route}` |
| `foreignOrganizationInBody` inline (F11) | 5 | `crm/health/[customerId]/snapshot`, `crm/health/refresh`, `crm/onboarding/instances/{route,[id],[id]/steps/[stepId]}` |
| **Pendiente (STRICT_ALLOWLIST, otra sesión)** | 6 | ver §(b) |

\* `crm/roi/templates/**` es de F10 pero ya estaba tocada por la ronda anterior (import de
`readOrgBody` en `route.ts` y `[id]/route.ts`, DELETE recibe `request`): queda **compilando y verde**;
no se tocó nada más de `roi/`.

Verificación: `TZ=UTC` y `TZ=America/Bogota` · `npx jest src/lib/security src/lib/utils
src/__tests__/guardrails.test.ts src/app/api/__tests__ src/app/api/crm/{objections,whatsapp,revenue,config,referrals}
src/app/api/integrations/twilio src/app/api/ai-assistant` → **20 suites, 448 tests; 447 verdes**.
El único rojo es `src/lib/security/__tests__/builderR3.f0sec.test.ts:69` (`'testtesttesttest'`
debería ser secreto válido): test de **SEC-AB r3**, no de C+D; lo cierra ese constructor.
`tsc` (heap 8 GB): **0 errores** en `orgContext|orgAdmin|security/|api/crm|ai-assistant`; los 5
restantes son ajenos (`FormularioEdicionProducto.tsx` ×2, `f13Round3Tester.test.ts` ×2,
`deliveryIntegrationService.ts:661`). El `webhookTemplateStatus.test.ts:28` del handoff ya no aparece.

## (b) Rutas de F10–F13 (otra sesión) y el cambio de una línea que necesitan

Están en `STRICT_ALLOWLIST` del guardarraíl 5 con este mismo motivo; al aplicarlo hay que **quitar
la entrada** (el test «no contiene entradas obsoletas» avisa). `readOrgBody` se importa de
`@/lib/security/organizationBody` (o de `@/lib/utils/orgContext`, que lo re-exporta).

| Ruta | Handler | Cambio |
|---|---|---|
| `src/app/api/crm/payments/register/route.ts` | POST (l. 23) | `const body = await request.json();` → `const body = await readOrgBody(ctx, request);` |
| `src/app/api/crm/onboarding/templates/route.ts` | POST (l. 37) | `const body = await request.json();` → `const body = await readOrgBody(ctx, request);` |
| `src/app/api/crm/health/[customerId]/route.ts` | POST (l. 61–66, sin lectura de body) | tras `const ctx = await getServerOrgContext();` añadir `await readOrgBody(ctx, request);` (la org ajena podría venir en la query) |
| `src/app/api/crm/partners/[id]/route.ts` | DELETE (l. 41–43) | `_request` → `request`; tras el `ctx` añadir `await readOrgBody(ctx, request);` |
| `src/app/api/crm/partners/tiers/[id]/route.ts` | DELETE (l. 28–30) | idem |
| `src/app/api/crm/referrals/programs/[id]/route.ts` | DELETE (l. 35–37) | idem |

Opcional (no lo exige el guardarraíl): `crm/health/recalculate` y `crm/renewals/sync` (F11) pueden
pasar de `verifyCronSecret` + `try/catch` propio a `export const POST = withCron(handle)`, como
`voice-agents/campaigns/run`. Y los helpers `rejectForeignOrganization` (F12/F13) y
`foreignOrgResponse` (F10) podrían reducirse a `readOrgBody(ctx, body, { route })` para heredar el
registro estructurado; hoy ya delegan en el mismo predicado y son aceptados.

## (c) Migraciones pendientes (NO aplicadas)

| Archivo | Rollback | Qué hace | Dry-run |
|---|---|---|---|
| `supabase/migrations/20260916000000_crm_v4_f0sec_rate_limit_buckets.sql` | `supabase/rollbacks/20260916000000_crm_v4_f0sec_rate_limit_buckets_rollback.sql` | Tabla `rate_limit_buckets` (RLS sin políticas, `REVOKE` a public/anon/authenticated), `fn_rate_limit_hit(jsonb)` atómica multi-clave y `fn_rate_limit_sweep()`, EXECUTE solo `service_role`. Bloque de verificación comentado al final. | Pendiente del tester (`begin; … select fn_rate_limit_hit('[…]'); … rollback;`). Sin la migración el código sigue en `memory`. |

Orden de despliegue: aplicar → `RATE_LIMIT_STORE=db` en Vercel → desplegar. El rollback exige
quitar antes la variable (si no, `verify/*` e `invite/resend` bloquean por fail-closed).

## Pendientes que dejo explícitamente para revisión

- Las 6 rutas de §(b) (otra sesión) — hasta entonces `STRICT_ALLOWLIST` las documenta.
- `builderR3.f0sec.test.ts:69` rojo (SEC-AB r3).
- Para el 10 (QA): un `integration_events` por cada rechazo de org ajena / ambigüedad con
  `request_id` (hoy solo `console.warn`); test del handshake real del ws-server con `ws` y firma
  Twilio; `jti` en BD si el ws-server pasa a varias instancias.
- Los archivos tocados quedan con `LF` (git avisa que pasarán a `CRLF`): no es un cambio de
  contenido.
