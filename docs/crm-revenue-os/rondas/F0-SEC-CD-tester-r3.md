# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — tester, ronda 3

Fecha: 2026-09-16 (madrugada). Rama `main`, sin ramas ni commits. BD **solo SELECT** por MCP
(`jgmgphmzusbluqhuqihj`); `fn_rate_limit_hit` se ejercitó dentro de `begin; …` sin `commit`
(pg-meta revirtió: 0 filas `t:*` después). Insumos: `F0-SEC-CD-builder-r3.md` (entero),
`F0-SEC-CD-qa-r2.md` (obligatorios 1–7), `F0-SEC-CD-tester-r2.md` y su test
`testerR2CD.f0sec.test.ts`. Alcance mutado: solo `organizationBody.ts`, `rateLimit.ts`,
`orgContext.ts`, `attachments/route.ts`, `transcribe/route.ts` y seis rutas limpias en git de
`crm/**`/`ai-assistant/**` (para el guardarraíl 5). No se tocó nada de `whatsapp/**`,
`ai-assistant/reportes/**`, `jobsService.ts`, `lib/jobs/**`, `crm/config/**` ni `timezone.ts`.

## Resumen

- **Los 7 obligatorios del QA r2 están cerrados y verificados** (tabla abajo): 403 con `code` en
  las dos rutas multipart; guardarraíl 5 acotado por `TOP_LEVEL_RE` (6 de 6 mutaciones «quitar
  `readOrgBody`» muertas, incluidos 3 DELETE y 5 con helper local); `isPlaceholderCredential`
  fuera de `WEBHOOK_RE` (M17 muerta); `readOrgBody` evalúa TODAS las claves y `''`/`' '` cuenta
  como ausente por clave (4 claves × 4 formatos × {ajena, propia, combinada} verdes); RPC de
  permisos que lanza/rechaza/expira → `false` + `warn`, `withOrg({admin})` → 403 sin 500;
  `persistentCount` retirado (solo queda en la cabecera explicando por qué); FASE-00 actualizada.
- **Sub-parte D bajo concurrencia real**: 20 concurrentes con `limit 3` → exactamente 3 en
  memoria (síncrono de punta a punta), 3 con store `db` simulado atómico (el store cuenta 3 y la
  memoria queda en 3), 0 con store que falla (20 errores registrados, memoria intacta), y 3 con
  `createDbRateLimitStore` sobre un cliente RPC doblado. En BD, `fn_rate_limit_hit` es atómica:
  4.ª llamada con `limit 3` → `allowed:false`, `count 4`, fila en 3; multi-clave con una
  bloqueada → la otra no se registra.
- **Un fallo nuevo del guardarraíl 5 (bajo)**: `export { POST } from '…'` es invisible
  (`HANDLER_RE` solo reconoce `export const|function`). Hoy solo lo usa
  `crm/contracts/webhook/route.ts` (legítimo, reexporta el webhook firmado), pero un archivo
  nuevo `export { POST } from './handler'` sin sesión ni `readOrgBody` pasa verde (sonda G7b).
- **Incidente de árbol (no de código)**: a las 01:23:36 otra sesión hizo `git stash` de TODO el
  árbol mientras mi mutación R4 (`rateLimit.ts:137`, `p.limit + 1`) estaba viva, y a las 01:25
  lo aplicó (`stash apply`, luego `reset` a las 01:26:21). El árbol y el índice quedaron con la
  mutación; la restauré desde mi copia (md5 `7ef5ee3d…`, el del constructor) antes de seguir.
  **`stash@{0}` sigue conteniendo la línea mutada**: si alguien vuelve a aplicarlo, reaparece.
  Detalle y verificación abajo («Ninguna mutación viva»).
- jest del alcance: **17 suites, 498 tests verdes** en `TZ=UTC` y `TZ=America/Bogota`
  (81 nuevos en `testerR3CD.f0sec.test.ts`). tsc: ver «Comandos» (0 en el alcance).
- **21 mutaciones: 20 muertas, 1 superviviente** (G7b, el fallo nuevo). Restauración byte a byte
  verificada por md5 en las 21.

## Tabla de verificación (obligatorios 1–7 del QA r2)

| # | Punto | Estado | Evidencia (archivo:línea · test) |
|---|---|---|---|
| 1 | `attachments`/`transcribe` → 403, no 400 | ✅ | `attachments/route.ts:102-121` (`formData()` en su `try` → 400 `BAD_REQUEST`; `readOrgBody(ctx, form, { route })` fuera, `catch instanceof OrgContextError` → `err.statusCode`/`err.code`); `transcribe/route.ts:77-93` idem. `testerR3CD` S5: 8 tests (4 alias × 2 rutas) → 403 `{ error, code: FOREIGN_ORGANIZATION }` + `warn` con `route` + STT no invocada; propia+ajena → 403; `''`/propia → sigue al 400 propio de la ruta; JSON → 400. Mutaciones **A1/T1** (volver a meter `readOrgBody` en el `try` del parseo) → 5 y 6 rojos. |
| 2 | Guardarraíl 5: helper local acotado | ✅ | `guardrails.test.ts:372-386` (`nextTopLevel`, `:375,:381-382`), `offendingHandlers` `:409-433`, test de muestra `:520-546`. Mutaciones **G1** `stages/[id]` DELETE (`fail`, `readStageInOrg`), **G2** `voices` DELETE (`fail`), **G3** `ai-assistant/conversations/[id]` DELETE (`propio`), **G4** `verticales/[id]` PATCH (`isValidId`), **G5** `sequences/[id]` PATCH (`errorResponse`), **G6** `tasks` POST (sin helper) → las 6 **rojas** nombrando el archivo. **G9** (helper que *menciona* `readOrgBody` sin llamarlo + DELETE que usa el helper) → roja: `FOREIGN_RE` exige la llamada. `STRICT_ALLOWLIST` está **vacía** (las 6 rutas las migró `328f1f73`, otra sesión, después del informe del constructor; el test «no obsoletas» sigue verde). |
| 3 | `isPlaceholderCredential` fuera de `WEBHOOK_RE` | ✅ | `guardrails.test.ts:331-333`; test `:548-558`. Mutación **G8** (`tasks` POST: `readOrgBody` → `isPlaceholderCredential("x")`) → roja. |
| 4 | Todas las claves; `''` ausente por clave | ✅ | `organizationBody.ts:88-118` (`isBlank`, `claimedOrganizationsIn` objeto y `ParamsLike`), `:136-151` (`assertNotForeign` itera y registra `key`). `testerR3CD` S1 (32 tests: 4 claves × 4 formatos × ajena/propia, con `key`/`where`/`route`/`userId` en el `warn`) y S2 (por formato: propia+ajena → `key: 'orgId'`; `''`+ajena y `' '`+ajena → 403; 4 vacías → pasa; 4 propias mezclando `" 120 "` → pasa; 4 ajenas → una sola entrada de registro, `organization_id`). Mutaciones **O1** (objeto: `break` tras la primera), **O2** (`ParamsLike`: idem), **O3** (`isBlank` sin `''`), **O4** (sin query), **O5** (comparar como cadena) → rojas (2/5/1/8/4). |
| 5 | RPC de permisos que lanza → deniega, no 500 | ✅ | `orgContext.ts:320-334` (`try/catch` → `warn` «lanzó» + `false`). `testerR3CD` S3: lanza síncrono (`TypeError`), rechaza (`Error` y valor no-Error → `message: String(v)`), expira a los 30 ms (`AbortError`) → `false` + `warn`; `withOrg({ admin: true })` con RPC que lanza → **403 `ADMIN_REQUIRED`**, handler no invocado; con `true` → 200 y la RPC recibe `{ p_user_id, p_organization_id, p_permission_code }` de la sesión. Mutaciones **O6** (relanzar) y **O7** (`return true` en el catch) → 4 rojos cada una. |
| 6 | `persistentCount` retirado | ✅ | `grep persistentCount src/ --include=*.ts` fuera de tests: solo `rateLimit.ts:14` (cabecera). `RateLimitOptions` `:37-42` sin la opción; el único `await` del camino es `store.hit` `:145`. `testerR3CD` S4: 20 concurrentes/limit 3 → 3 (memoria), 3 (store atómico con 10 ms), 0 (store que lanza), 3 (`createDbRateLimitStore` doblado, 20 RPC con `{ key, limit, window_ms }`), multi-clave `[ip 3, user 10]` → 3 y `user` queda en 3. Mutaciones **R1** (store falla → seguir), **R2** (clave ausente → `continue`), **R3** (`Math.min`), **R4** (`> limit + 1`) → rojas (1/1/3/3). |
| 7 | FASE-00 sin líneas obsoletas | ✅ | `FASE-00-FUNDACIONES.md:36` y `:1436` (`requireOrgAdmin` por `is_super_admin` o `role_id ∈ {1,2}`, sin nombres), `:1084` (migración APLICADA 2026-09-16; pendiente `RATE_LIMIT_STORE=db`), `:785` y `:1232` (`persistentCount` retirado; basta `{ store }`). `ORG_ADMIN_ROLE_NAMES`: 0 apariciones en `src/`. |

Estado real de la migración (SELECT por MCP): `rate_limit_buckets` existe, RLS on, 0 políticas,
`anon`/`authenticated` sin SELECT; `fn_rate_limit_hit(jsonb)` SECURITY DEFINER,
`search_path=public`, EXECUTE solo `service_role`; 0 filas. Coincide con el constructor.
Pendiente de despliegue: `RATE_LIMIT_STORE=db` en Vercel.

## Sondas (b) — resultado

| Sonda | Resultado |
|---|---|
| 4 claves × {JSON, form-urlencoded, multipart, query} con org ajena | 403 + `warn { key, where, session, body, route, userId }` en los 16 casos |
| `{organization_id: propia, orgId: ajena}` en los 4 formatos | 403, `key: 'orgId'` |
| `''`, `' '`, `'\t'` por clave | ausentes por clave: 4 vacías pasan; vacía + ajena → 403 |
| `0`, `'0'` (body y query) | 403 (otra organización, fail-closed) |
| `'7'` vs `7` | equivalentes: sesión 7 pasa con ambas; sesión 120 rechaza ambas, registrando `'7'` y `7` |
| arrays | `[999]`, `[120, 999]` → 403; `[120]`, `[]` → pasan (`Number([120]) = 120`, `String([]) = ''`); body raíz array → no se inspecciona (documentado r2) |
| objeto / `true` / `NaN` como valor | 403; el registro vuelca `'[object Object]'`, no el objeto |
| clave repetida `organization_id=120&organization_id=999` (query y form) | **pasa sin registro** (`get()` = primer valor) — fallo nuevo 2 |
| RPC de permisos: lanza / rechaza / expira / nunca resuelve | `false`+`warn` / `false`+`warn` / `false`+`warn` / **queda pendiente** (sin presupuesto de tiempo) — observación 3 |
| `withOrg({admin})` + RPC que lanza | 403 `ADMIN_REQUIRED`, nunca 500 |
| `checkRateLimit` 20 concurrentes, limit 3 | memoria 3 · store atómico 3 · store falla 0 · store no atómico **20** (documentado: por eso la RPC es una sola sentencia transaccional) |
| `fn_rate_limit_hit` en BD (`begin` sin commit) | 1,2,3 permitidas; 4.ª `allowed:false count:4` y la fila queda en 3; `[b(5), a(3)]` con `a` llena → `b` no se registra (`count 1` en la llamada siguiente); clave duplicada en la misma llamada → cuenta 1 (no 2); `[]` → `RAISE` (el TS ya devuelve `[]` antes de llamar) |
| Guardarraíl 5: quitar `readOrgBody` en 6 handlers (3 DELETE, 5 con helper local) | 6/6 rojos con el archivo en la salida |
| Guardarraíl 5: archivo nuevo `export async function POST` sin nada (G7a) | rojo |
| Guardarraíl 5: archivo nuevo `export { POST } from './handler'` sin nada (G7b) | **verde** — fallo nuevo 1 |

## Fallos nuevos (reproducción y severidad)

### 1. [bajo] Guardarraíl 5 no ve reexportaciones `export { POST } from '…'`
`src/__tests__/guardrails.test.ts:336` (`HANDLER_RE` =
`^export\s+(?:const|async\s+function|function)\s+(GET|POST|…)`): un `route.ts` que reexporte
handlers no produce ningún `Handler`, así que `offendingHandlers` devuelve `[]` y el archivo
pasa aunque el destino no tenga sesión ni `readOrgBody`. Reproducir (sonda G7b, directorio
temporal borrado al terminar): `src/app/api/crm/zz/route.ts` = `export { POST } from
'@/app/api/crm/zz/handler'` + `handler.ts` con `export async function POST() { return
NextResponse.json({}) }` → guardarraíl **verde**; el mismo `POST` escrito en `route.ts` → rojo
(G7a). Hoy solo lo usa `crm/contracts/webhook/route.ts:11` (`export { POST, runtime } from
'@/app/api/crm/webhooks/documenso/route'`, webhook firmado: legítimo). Arreglo (una regla):
en ámbito estricto, tratar `^export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b[^}]*\}\s*from` como
ofensor salvo que el destino esté bajo `crm/webhooks/` (o resolver el destino y evaluarlo).

### 2. [bajo] Clave repetida en query/form: solo se inspecciona el primer valor
`organizationBody.ts:105-110`: en `ParamsLike` se usa `get(key)`, que devuelve el PRIMER valor.
`?organization_id=120&organization_id=999` (y el mismo par en form-urlencoded/multipart) pasa
sin registro. Un parser que se quede con el último (`Object.fromEntries(searchParams)` → `999`)
vería la ajena donde el punto único vio la propia. Ninguna ruta usa el valor del body/query
para la organización, así que no hay escritura cruzada; es el contrato «se registra» el que se
esquiva. Test: `testerR3CD` S2 «DOCUMENTADO (bajo): clave repetida». Arreglo: si
`typeof source.getAll === 'function'`, evaluar todos los valores de cada clave.

### 3. [observación] `hasOrgAdminOrPermission` no tiene presupuesto de tiempo propio
`orgContext.ts:326`: una RPC que nunca resuelve deja la promesa pendiente (test S3
«DOCUMENTADO»: sigue pendiente a los 150 ms); en Vercel la corta `maxDuration` (504), que no es
«deniega y registra». El cliente de Supabase no aborta por defecto. Opcional: `Promise.race`
con un tope (p. ej. 5 s) que caiga en el mismo `warn` + `false`.

### 4. [observación] En `attachments`/`transcribe` el 403 consume cupo del rate limit por usuario
`transcribe/route.ts:60` y `attachments/route.ts:81` evalúan el límite antes de leer el
formulario: 10 rechazos 403 seguidos → el 11.º es 429 (test S5 «DOCUMENTADO»). Coherente con
«el límite protege el coste de leer 25 MB», así que no es un fallo; se deja escrito. La query
(`?organization_id=999`) de esas dos rutas no se inspecciona (sobrecarga síncrona; QA r2 §7,
opcional; test S5 «DOCUMENTADO»).

### 5. [incidente, fuera del código] `git stash` externo capturó una mutación viva
Cronología (reflog + `stat`): 01:23:2x mutación **R4** aplicada en `rateLimit.ts:137`
(`p.limit + 1`) y jest en marcha → **01:23:36 `git stash`** por otra sesión (todo el árbol,
incluidos los 12 archivos del constructor r3; el árbol quedó en `HEAD` = versiones r2) →
01:24 mi restauración por copia (correcta, md5 `7ef5ee3d`) → 01:25 `git stash apply` externo
(árbol **e índice** con la línea mutada) → 01:26:21 `git reset` externo. Al detectarlo restauré
`rateLimit.ts` desde mi copia y verifiqué (`sed -n 137p` = `p.count > p.limit`; md5
`7ef5ee3d…` = copia); el `git reset` posterior dejó el índice en `HEAD`, así que no hay nada
mutado en el índice. **`stash@{0}` (01:23:36) conserva `rateLimit.ts` con `p.limit + 1`**: no
lo toco (es de otra sesión y contiene el trabajo de todas); quien lo posea debe `git stash drop`
tras confirmar que ya está aplicado, o revisar `rateLimit.ts:137` si lo vuelve a aplicar. El
R4 con el árbol ya restaurado se repitió: **muerta** (3 rojos).

### Ajeno, solo se reporta
- **[alto, ajeno, commiteado]** `crm/health/[customerId]/route.ts:3-4` y
  `crm/onboarding/templates/route.ts:3-4`: `import { readOrgBody }` metido dentro de otro
  `import {` (commit `328f1f73`, otra sesión). `tsc` y `next build` rojos en todo el repo hasta
  que se mueva la línea. No lo corrijo: es de la sesión F10–F13 y está fuera del alcance C+D.
- `ai-assistant/reportes/**` (otra sesión, F0-SEC r4 en curso): en la línea base de las 01:06
  fallaban 7 tests de `reportesSessionClient.f0secR3` / `testerR3.f0sec` (los archivos se
  estaban editando a las 01:05:28); `readOrgBody(ctx, body.context)` lanza 403 correctamente y
  la ruta lo convertía en 500 porque el test doblaba `OrgContextError` con otra clase. En la
  ejecución final (01:30) las dos suites están verdes: lo cerró esa sesión.
- `crm/contracts/webhook/route.ts`: reexportación legítima (fallo 1 la usa de ejemplo).

## Calificación: **9,3 / 10**

Justificación. Los siete obligatorios están cerrados con el cambio en el sitio que pidió el QA
y con tests que los matan bajo mutación: 20 de 21 mutaciones muertas, incluidas las seis
«quitar `readOrgBody`» sobre handlers con helper local que en r2 sobrevivían, el `try` de
las rutas multipart, las cinco formas de romper `claimedOrganizationsIn`, el `catch` de la RPC y
las cuatro de `rateLimit`. La sub-parte D está probada bajo concurrencia real de 20 en memoria,
con store atómico simulado, con store que falla y contra la RPC de producción dentro de una
transacción revertida. Lo que resta 0,7: el guardarraíl 5 —que es la garantía de no
reincidir— tiene un hueco estructural nuevo (reexportaciones, fallo 1) que una regla de una
línea cierra, y el punto único ignora valores repetidos de una clave (fallo 2). Ninguno permite
escribir en otra organización; los dos afectan a la mitad «se registra» del contrato. Con los
dos cerrados, 9,6+.

## Comandos exactos y resultados

```
# línea base (01:06, antes del stash externo)
TZ=UTC npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/utils src/app/api/ai-assistant
  → Test Suites: 2 failed, 14 passed, 16 total · Tests: 7 failed, 402 passed, 409 total
    (los 7 rojos: ai-assistant/reportes/** en edición concurrente, ajeno; ver arriba)

# tests nuevos
TZ=UTC npx jest src/lib/security/__tests__/testerR3CD.f0sec.test.ts
  → Tests: 81 passed, 81 total
npx eslint src/lib/security/__tests__/testerR3CD.f0sec.test.ts → limpio

# (c) alcance completo, dos zonas horarias (01:30, árbol restaurado)
TZ=UTC            npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/utils src/app/api/ai-assistant
  → Test Suites: 17 passed, 17 total · Tests: 498 passed, 498 total · 39.4 s
TZ=America/Bogota npx jest (mismo comando)
  → Test Suites: 17 passed, 17 total · Tests: 498 passed, 498 total · 40.0 s

# (d) tsc
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
  → ver «tsc» al final

# BD (solo SELECT / begin sin commit, MCP)
select … rate_limit_buckets / fn_rate_limit_hit
  → tabla 1 · rls true · politicas 0 · fn_hit 1 · anon_exec false · auth_exec false · service_exec true ·
    anon_select false · filas 0 · filas_t 0 · secdef true · search_path=public
begin; … fn_rate_limit_hit ×7 (limit 3 ×4, multi-clave, clave duplicada) … select …   (sin commit)
  → paso 1-3 allowed count 1..3 · paso 4 allowed:false count:4 · paso 5 [b,a] allowed:false (a:4, b:1) ·
    paso 6 b count:1 (no se registró en el 5) · paso 7 [e,e] count 1,1 · filas_t 3 dentro de la transacción
select count(*) … key like 't:%'   → 0  (revertido)

# (f) mutaciones (scratchpad/r3cd/mutate.sh: copia en el scratchpad, perl, jest, cp -p, md5)
G1 stages/[id] DELETE sin readOrgBody (helper fail)          MUERTA  guardarraíl 5 rojo   md5 ok
G2 voices DELETE sin readOrgBody (helper fail)               MUERTA  guardarraíl 5 rojo   md5 ok
G3 ai-assistant/conversations/[id] DELETE (helper propio)    MUERTA  guardarraíl 5 rojo   md5 ok
G4 verticales/[id] PATCH (helper isValidId)                  MUERTA  guardarraíl 5 rojo   md5 ok
G5 sequences/[id] PATCH (helper errorResponse)               MUERTA  guardarraíl 5 rojo   md5 ok
G6 tasks POST sin readOrgBody                                MUERTA  guardarraíl 5 rojo   md5 ok
G7a archivo nuevo: export async function POST vacío          MUERTA  (dir temporal borrado)
G7b archivo nuevo: export { POST } from './handler'          SOBREVIVE → fallo 1
G8 tasks POST readOrgBody → isPlaceholderCredential("x")     MUERTA  guardarraíl 5 rojo   md5 ok
G9 helper menciona readOrgBody sin llamarlo + DELETE lo usa  MUERTA  guardarraíl 5 rojo   md5 ok
O1 organizationBody objeto: solo la primera clave            MUERTA  (2 rojos)            md5 ok
O2 organizationBody ParamsLike: solo la primera clave        MUERTA  (5)                  md5 ok
O3 isBlank sin '' (vacía cuenta como presente)               MUERTA  (1)                  md5 ok
O4 sin inspección de la query                                MUERTA  (8)                  md5 ok
O5 comparar como cadena ("7" ≠ 7)                            MUERTA  (4)                  md5 ok
O6 orgContext: relanzar en el catch de la RPC                MUERTA  (4)                  md5 ok
O7 orgContext: return true en el catch                       MUERTA  (4)                  md5 ok
R1 rateLimit: store falla → seguir (fail-open)               MUERTA  (1)                  md5 ok
R2 rateLimit: clave ausente en el store → continue           MUERTA  (1)                  md5 ok
R3 rateLimit: Math.min(p.count, h.count)                     MUERTA  (3)                  md5 ok
R4 rateLimit: memoria bloquea en limit + 1                   MUERTA  (3, repetida tras el incidente)  md5 ok
A1 attachments: readOrgBody dentro del try del parseo        MUERTA  (5)                  md5 ok
T1 transcribe: readOrgBody dentro del try del parseo         MUERTA  (6)                  md5 ok
```

### tsc (resultado)

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` (completo):
**10 errores, 0 en el alcance** (`grep` de `organizationBody|rateLimit|rateLimitStore|
testerR3CD|orgContext|orgContextError|orgAdmin|ai-assistant/(attachments|transcribe)|guardrails`
sobre la salida: vacío). Los 10 son **de sintaxis, ajenos y ya COMMITEADOS** en `328f1f73`
(otra sesión, 01:03:24, «readOrgBody en las seis rutas que quedaban en la allow-list»):
`src/app/api/crm/health/[customerId]/route.ts:4` y
`src/app/api/crm/onboarding/templates/route.ts:4` tienen el
`import { readOrgBody } from '@/lib/security/organizationBody';` insertado **dentro** de un
`import {` multilínea (`TS1003/TS1005/TS1109`, 5 por archivo). Esto rompe `tsc` y `next build`
para todo el repositorio; el guardarraíl 5 no lo ve (solo lee texto) y jest no importa esas
rutas. Arreglo (sesión F10–F13): mover la línea 4 encima del `import {`. Los 21 errores que
citaba el constructor r3 (electron/release, jobs r4) ya no aparecen.

## Ninguna mutación viva — declaración con md5

Cada mutación se aplicó sobre una copia de seguridad en el scratchpad (`r3cd/bak_<id>_*.ts`,
fuera del árbol; ningún `.mutbak` en el árbol), se restauró con `cp -p` y se comparó
`md5 antes = md5 restaurado = md5 copia` en las 21. Estado final del árbol (md5 completo):

| Archivo | md5 árbol | Igual a la copia previa a la mutación |
|---|---|---|
| `src/lib/security/organizationBody.ts` | `7bb00213b0a28f5a405a0db48351dda4` | sí (bak_O1…O5) |
| `src/lib/security/rateLimit.ts` | `7ef5ee3d0f9cd63b30571207e885a210` | sí (bak_R1…R4); `sed -n 137p` = `if (p.count > p.limit) return blocked(…)` |
| `src/lib/utils/orgContext.ts` | `3bcc367dc8e248ed47f19f965b029b83` | sí (bak_O6, O7) |
| `src/app/api/ai-assistant/attachments/route.ts` | `9be93ea38b1d124f52a95f6f5d22aeb4` | sí (bak_A1) |
| `src/app/api/ai-assistant/transcribe/route.ts` | `f5a8d6dd799c77cda95ac3a58592dcf8` | sí (bak_T1) |
| `src/app/api/crm/stages/[id]/route.ts` | `286992fde7dffdc2bf0e8acdd38c7c72` | sí (bak_G1, G9) |
| `src/app/api/crm/voices/route.ts` | `d38d19d76eec7d244080555f90b65cc8` | sí (bak_G2) |
| `src/app/api/ai-assistant/conversations/[id]/route.ts` | `1fe43e5ab12321c13a6e1768b1e5a875` | sí (bak_G3) |
| `src/app/api/crm/verticales/[id]/route.ts` | `77afedbd23556f31c633bbc67cc2c06d` | sí (bak_G4) |
| `src/app/api/crm/sequences/[id]/route.ts` | `92b032fc527e01f845e982d856684e1a` | sí (bak_G5) |
| `src/app/api/crm/tasks/route.ts` | `7b59048d2d9a475a6f21660e653175d0` | sí (bak_G6, G8) |
| `src/app/api/crm/zz-sonda-tester-r3/` (G7) | no existe | `ls src/app/api/crm | grep -c zz-sonda` → 0 |

`guardrails.test.ts`, `rateLimitStore.ts`, `orgContextError.ts`, `orgAdmin.ts`: no mutados
(solo lectura). `git stash list` sigue mostrando `stash@{0}` de las 01:23:36 (de otra sesión;
contiene `rateLimit.ts` con `p.limit + 1`): **no es el árbol**, pero es la única copia mutada que
queda en el repositorio y no la borro yo.

## Archivos del tester

- Nuevo en el repositorio: `src/lib/security/__tests__/testerR3CD.f0sec.test.ts` (81 tests,
  orgs ficticias 120/999/7, sin `it.failing`; 5 casos «DOCUMENTADO» describen los límites
  conocidos: clave repetida, RPC que nunca resuelve, query no inspeccionada en las rutas
  multipart, 403 que consume cupo, store no atómico).
- Este informe.
- Scratchpad (fuera del árbol): `r3cd/{mutate.sh, bak_*.ts, stash_*.ts, jest_*.txt,
  jest-baseline-utc.txt, jest-final-{utc,bogota}.txt, tsc-full.txt}`.
- Temporales en el árbol: ninguno (`zz-sonda-tester-r3` existió < 1 min y se borró; `git
  status` no lo muestra).
