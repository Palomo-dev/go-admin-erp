# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — builder, ronda 3

Fecha: 2026-09-16. Rama `main` (`1c2fe2e5`), sin ramas ni commits. BD no tocada (no hacía
falta: los 7 obligatorios son de código, tests y docs). Insumos: `F0-SEC-CD-qa-r2.md` (7,7/10,
obligatorios 1–7) y `F0-SEC-CD-tester-r2.md` (6 `it.failing` en
`src/lib/security/__tests__/testerR2CD.f0sec.test.ts`). Se respetó: `withOrg`/`withCron` con
segundo parámetro obligatorio `{ params }` (no se tocaron), guardarraíl de F14 (`readOrgBody(`),
y la lista de rutas ajenas (`api/crm/{roi,demos,proposals,contracts,payments,webhooks/*,health,
onboarding,renewals,partners,referrals,commissions,sales-targets,seller-dashboard}/**`,
`webhookAuthorization.ts`, `whatsappCloudService.ts`): ni una línea.

## Estado real de la migración `rate_limit_buckets`

`20260916000000_crm_v4_f0sec_rate_limit_buckets.sql` está **APLICADA** (otra sesión, 2026-09-16;
verificada por el tester r2 con SELECT: RLS on, 0 políticas, EXECUTE solo `service_role`). Lo que
sigue pendiente es **`RATE_LIMIT_STORE=db` en Vercel**: hasta entonces `verify/{send,check}` e
`invite/resend` corren en modo memoria (`limit × instancias`). El informe r2 (`§(b)`, l. 6-7, 75,
172-179) que decía «NO aplicada» queda superado por este.

## Obligatorios del QA r2 — qué se hizo, dónde y qué test lo demuestra

| # | Punto | Cambio (archivo:línea) | Test |
|---|---|---|---|
| 1 | `attachments`/`transcribe` respondían 400 a una org ajena | `src/app/api/ai-assistant/attachments/route.ts:102-121`: `form = await request.formData()` dentro del `try` (400 `BAD_REQUEST`) y **fuera** `readOrgBody(ctx, form, { route })` con `catch (err instanceof OrgContextError)` → `err.statusCode`/`err.code`. `transcribe/route.ts:77-93` idem (ahora la respuesta 403 lleva `code`). Etiqueta `route` en el registro. | `testerR2CD` C4-a (`:289`), C4-b (`:295`) sin `.failing`; el tercer test de C4 (`:301`) pasa de esperar 400 a 403 y añade «no multipart sigue siendo 400». `src/app/api/__tests__/orgBodyRoutes.f0sec.test.ts:169-211`: 4 tests nuevos (403 + `warn` con `route` + STT no invocada; misma org no es 403; JSON en vez de multipart → 400). |
| 2 | Guardarraíl 5: helper local mal acotado (15 handlers ciegos) | `src/__tests__/guardrails.test.ts:378-392` `localHelpersMatching`: el cuerpo del helper acaba en `min(siguiente declRe, siguiente línea que case con TOP_LEVEL_RE)` (`nextTopLevel`, `:381,:387-388`), misma técnica que `splitHandlers`. La evaluación por handler se extrajo a `offendingHandlers(content, strict)` (`:415-439`) para poder ejecutarla sobre una muestra; `beforeAll` la usa (`:446-470`), sin cambio de semántica. | Test de muestra `:526-552`: `function fail()` + `POST` con `readOrgBody` + `DELETE` sin él → `['DELETE']`; y si `fail` llama a `readOrgBody`, cubre a quien lo invoca. **Mutación M18** (`stages/[id]/route.ts:122` sin `readOrgBody`) → guardarraíl **rojo** (1 failed), archivo restaurado por md5. Sonda propia (`scratchpad/probe_r3.js`, replica la lógica y quita `readOrgBody` handler a handler): 180 handlers estrictos · sobrevivían **15** con el helper sin acotar (los mismos 15 del QA) · sobreviven **0** con el acotado. Ofensores de base: exactamente las 6 rutas de `STRICT_ALLOWLIST` (otra sesión, solo se reportan). |
| 3 | `isPlaceholderCredential` en `WEBHOOK_RE` | `guardrails.test.ts:337-339`: retirado (con el motivo en comentario). Ningún handler estricto pasa a ofensor (suite verde; sonda: 6 ofensores = allow-list). | Test `:554-564`: `POST` con sesión + `isPlaceholderCredential('x')` sin `readOrgBody` → `['POST']`; con `readOrgBody` → `[]`. **Mutación M17** (`tasks/route.ts:27`) → guardarraíl **rojo**, restaurado por md5. |
| 4 | `readOrgBody` solo miraba la primera clave; `''` «ganaba» | `src/lib/security/organizationBody.ts:83-127`: nueva `claimedOrganizationsIn(source)` devuelve TODAS las claves de `ORG_BODY_KEYS` con valor no vacío (`isBlank` `:89`: `null`/`undefined`/`''`/solo espacios = ausente **por clave**), en objeto y en `ParamsLike` (ya no usa `has()`); `claimedOrganizationIn` queda como azúcar (`[0] ?? null`, `:125`, mismo contrato en los tests que la importan). `assertNotForeign` (`:136-150`) itera todas y lanza en la primera ajena registrando su `key`. `orgContext.ts:45` re-exporta la nueva. | `testerR2CD` C1-a (`:130`), C1-b (`:134`) sin `.failing` + comprobación de la `key` registrada. `organizationBody.test.ts:79-96`: `{organization_id: 7, organizationId: 9}`, `{organization_id: '', orgId: 9}`, `URLSearchParams('organization_id=&orgId=999')`, `FormData` propia + `org_id` ajena → 403; todas propias/vacías → pasa sin registro. `:178-186` `claimedOrganizationsIn`. El test «null / '' pasan» sigue verde. |
| 5 | `hasOrgAdminOrPermission`: RPC que lanza → 500 | `src/lib/utils/orgContext.ts:317-339`: `try { ({ data, error } = await rpc(...)) } catch (err) { console.warn('[orgContext] check_user_permission lanzó; se deniega', {code, organizationId, message}); return false; }`. El `{ error }` sigue tratándose igual. | `testerR2CD` C3-a (`:266`) sin `.failing` + aserción del `warn`. Mutación «relanzar en el catch» → C3-a **roja** (1 failed), restaurado por md5. |
| 6 | Carrera en `persistentCount` (legado, sin consumidor) | **Retirado** (regla 7: un solo mecanismo persistente, el store atómico). `src/lib/security/rateLimit.ts`: fuera de `RateLimitOptions` (`:37-42`), fuera del paso 2 (ahora `:140-141` es el store, el único `await` del camino), cabecera `:13-19` explica por qué. `grep persistentCount src/`: solo tests y comentarios históricos. | `testerR2CD` D1-a (`:336`) reescrito: `// @ts-expect-error` sobre la opción (ts-jest con diagnósticos activos → compila solo si la opción NO existe) + 5 concurrentes/limit 3 → 3. `rateLimit.test.ts:38-43` (idem, `count` solo memoria) y `:74-77` (concurrencia sin store → exactamente 3); `placeholderSecrets.test.ts:82-88` (`@ts-expect-error`); `testerR3.f0sec.test.ts:239-242` (SEC-AB; el caso «ANOTADO TOCTOU» pasa a «CERRADO», sin el camino legado). |
| 7 | FASE-00 con líneas obsoletas | `docs/crm-revenue-os/FASE-00-FUNDACIONES.md:36` y `:1435`: `requireOrgAdmin` descrito por `is_super_admin` o `role_id ∈ {1, 2}` vía `orgAdmin.ts`, sin nombres de rol. `:1083`: «migración APLICADA el 2026-09-16 por el MCP; pendiente `RATE_LIMIT_STORE=db` en Vercel». Además `:784` (fila de `rateLimit.ts`: `persistentCount` retirado, nivel 2 = `store`) y `:1231` (rate-limit de `config/providers/test`: el almacén compartido ya existe, basta pasar `{ store }`), que citaban `persistentCount` como camino futuro. CRLF conservado. | Revisión QA r3. |

## Además

- `guardrails.test.ts:844,852` (caso 13, preexistente): la directiva `eslint-disable-next-line`
  citaba `no-var-requires`, regla que ya no está activa, y el archivo daba 2 errores de
  `no-require-imports`. Se cambió el nombre de la regla en la directiva (sin tocar el `require`)
  para dejar limpio el archivo tocado.
- Cabecera de `testerR2CD.f0sec.test.ts:6-14`: ya no anuncia «6 `it.failing`»; describe los 6
  como «CERRADO r3».

## Qué NO se hizo y por qué

- Las 6 rutas de `STRICT_ALLOWLIST` (`health/[customerId]` POST, `onboarding/templates` POST,
  `partners/[id]` DELETE, `partners/tiers/[id]` DELETE, `payments/register` POST,
  `referrals/programs/[id]` DELETE): fuera del alcance (F10–F13). La sonda confirma que son
  los **únicos** ofensores de base del guardarraíl acotado; el cambio de una línea sigue descrito
  en `F0-SEC-CD-builder-r2.md §(b)`.
- Opcionales del QA (sobrecarga síncrona con `{ request }` para mirar la query; `walkDir` con
  `ENOENT`; `integration_events` por rechazo; duplicados inline fuera del CRM): no bloquean el
  9,5 y no se abordaron para no ampliar el diff de una ronda de cierre.
- `RATE_LIMIT_STORE=db` en Vercel: acción de despliegue, no de código.

## Verificación

```
TZ=UTC            npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/utils src/app/api/ai-assistant src/app/api/__tests__
  → Test Suites: 17 passed · Tests: 421 passed · 25.3 s
TZ=America/Bogota (mismo comando)
  → Test Suites: 17 passed · Tests: 421 passed · 30.1 s
  (0 `it.failing`; `sectionContract` no está en este alcance)

Mutaciones (restauración verificada por md5sum -c):
  M18 stages/[id] DELETE sin readOrgBody            → guardarraíl 5 ROJO (1 failed)   ✔ muerta
  M17 tasks POST readOrgBody→isPlaceholderCredential → guardarraíl 5 ROJO (1 failed)   ✔ muerta
  «relanzar en el catch de check_user_permission»    → testerR2CD C3-a ROJA           ✔ muerta

node scratchpad/probe_r3.js
  → 180 handlers estrictos · 15 sobrevivían con el helper sin acotar · 0 con el acotado
  → ofensores de base: 6 = STRICT_ALLOWLIST

npx eslint <12 archivos tocados>  → limpio (tras corregir la directiva preexistente del caso 13)

NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
  → ver «tsc» abajo
```

### tsc

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` (completo, ~9 min): **21 errores, 0 en
el alcance** (`grep` de los 12 archivos tocados sobre la salida: vacío). Los 21 son ajenos y
concurrentes, no de esta ronda:

- 12 en `electron/release/win-unpacked/resources/web/src/**` (copia empaquetada de una build de
  escritorio, directorio ignorado por git; `tsc` la recoge porque cuelga de la raíz). Preexistente.
- 9 en `src/lib/jobs/__tests__/{builderR4,builderR5,jobsService}.test.ts`: importan
  `JOBS_RETRY_PERMISSION`/`JOBS_VIEW_PERMISSION`/`resolveJobsPermissions` de `jobsService`, que
  aún no los exporta. Son archivos modificados/sin versionar de la sesión JOBS que corre en
  paralelo (`git status`), a mitad de su propia ronda.

## Archivos tocados (12 + este informe)

`src/app/api/ai-assistant/attachments/route.ts`, `src/app/api/ai-assistant/transcribe/route.ts`,
`src/lib/security/organizationBody.ts`, `src/lib/security/rateLimit.ts`,
`src/lib/utils/orgContext.ts`, `src/__tests__/guardrails.test.ts`,
`src/lib/security/__tests__/{testerR2CD.f0sec,rateLimit,placeholderSecrets,testerR3.f0sec,organizationBody}.test.ts`,
`src/app/api/__tests__/orgBodyRoutes.f0sec.test.ts`, `docs/crm-revenue-os/FASE-00-FUNDACIONES.md`.
Sonda en el scratchpad (fuera del árbol): `probe_r3.js`. Sin `.sql`, sin cambios en BD.
