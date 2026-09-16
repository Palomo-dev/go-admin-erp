# F0-JOBS — Tester — Ronda 5 (corta) — 2026-09-16

Alcance: `src/lib/services/crm/jobsService.ts` (`resolveJobsPermissions`, `canViewJobs`, `canRetryJobs`),
`src/app/api/crm/jobs/**`, `src/lib/jobs/scheduler.ts` (N-3), `src/lib/jobs/__tests__/*`, FASE-00 `:733-734` y
§13 r5. Insumos: `F0-JOBS-builder-r5.md`, `F0-JOBS-qa-r4.md` (9,1; obligatorios 1–3), `F0-JOBS-tester-r4.md`.
BD (proyecto `jgmgphmzusbluqhuqihj`): solo `SELECT` + un dry-run `begin; …; rollback;` (verificado vacío después).
Sin ramas, sin commits, sin `.sql` ni scripts en el árbol (mutaciones, tsconfig acotado y logs en el scratchpad).
Test nuevo: `src/lib/jobs/__tests__/testerR5.test.ts` (41 tests).

## Resumen

- Obligatorios 1–3 del QA r4 y opcional N-3: **resueltos** con evidencia archivo:línea y test (tabla).
- BD verificada con el MCP: `role_permissions` concede `crm.jobs.view` y `crm.jobs.retry` a `{1,2,5}` (y
  `admin.full_access` a `{1,2}`); `schema_migrations` tiene `f00_37`, `f00_45`, `f00_42`, `f00_41` y **no** `f00_46`;
  `check_user_permission` con un miembro activo real de cada rol existente (2, 2+super admin, 4, 5; no hay
  miembros activos con rol 1 ni 3): rol 2 ⇒ `v=r=a=true`; rol 4 ⇒ todo `false`; rol 5 ⇒ `v=r=true, a=false`.
- **N-1 [medio, contrato/doc]**: el contrato `retry ⇒ view` del código prevalece sobre la precedencia del cargo.
  Dry-run real (rol 5 de org 128 + cargo con `crm.jobs.view=false` y nada sobre `retry`, `rollback` al final):
  la RPC da `view=false, retry=true`; el código responde `GET 200 canRetry:true` y deja reintentar **sin consultar
  nunca `crm.jobs.view`**. FASE-00 §13 r5 afirma «un cargo que le niegue `crm.jobs.view` lo deja fuera aunque
  sea Manager»: solo es cierto si el cargo niega **ambos** códigos. Ver «Fallos».
- Suites `TZ=UTC` y `TZ=America/Bogota`: idénticas (tabla final). `tsc` acotado: **0 errores**. Mutaciones:
  **13 mutaciones, 11 muertas + M4b muerta con un test nuevo + 1 equivalente (M3)**; M13 (retry sin `readOrgBody`) pasa de 1 a 11 tests rojos y M22/M26 del r4 ya tienen 2.ª guarda.
- Incidente de árbol compartido: durante mi M1 otra sesión hizo `git commit` (`e3972da7`) + `git stash`; el
  árbol volvió a `HEAD` en 5 de mis 7 archivos vigilados y mi restauración por `cp` reescribió `jobsService.ts`
  r5 sobre un árbol «stasheado». Lo devolví a `HEAD` con `git checkout --` para no bloquear el `stash pop`
  ajeno, esperé a que los md5 volvieran al baseline (≈1 min) y repetí M1 desde cero. Ningún rojo de esta
  ronda se atribuye sin md5 = baseline antes y después.

## Verificación de los obligatorios y opcionales del QA r4

| # | Punto | Estado | Evidencia (archivo:línea) | Test que lo sostiene |
|---|---|---|---|---|
| 1 | Retry del Manager: decisión B, `retry ⇒ view`, sin `f00_46` | **Resuelto** | `jobsService.ts:34-47` (cabecera con la decisión y el contrato), `retry/route.ts:13-16`, FASE-00 `:733-734` y `:1520-1524` (§13 r5); BD: `role_permissions` `{1,2,5}` para los dos códigos; `supabase/migrations/` sin `f00_46`; `schema_migrations` sin `f00_46` | `builderR5` r5·1 (4: lee `f00_45`, `[1,2,5]`, sin `f00_46`, doc sin `admin.full_access`/`STAGE_MANAGER_ROLE_IDS`/«Manager NO»); `testerR5` «rol 5 (Manager) con los grants de f00_45 ⇒ 200 canRetry:true con EXACTAMENTE 1 RPC» y «retry pasa con 1 RPC» |
| 2 | Permisos por código y una resolución por petición | **Resuelto** | `jobsService.ts:54-55` (`JOBS_VIEW_PERMISSION`/`JOBS_RETRY_PERMISSION`), `:77-85` (`hasJobsPermission` fail-closed con `try/catch`), `:87-93`, `:101-104` (`resolveJobsPermissions`: retry primero, view solo si `false`); `route.ts:23-26,44` (una llamada, 403 «Requiere permiso crm.jobs.view», `canRetry` en la respuesta); `retry/route.ts:28-31` (`readOrgBody` → `await canRetryJobs`, 403 «Requiere permiso crm.jobs.retry»); `grep` del alcance sin `STAGE_MANAGER_ROLE_IDS`, `admin.full_access` ni «hasta que el dueño» | `testerR5` matriz (13), fail-closed (10), estático (3: una `resolveJobsPermissions(ctx)` en la GET antes de `listJobs`, orden de guardas en retry, orden retry→view en el servicio); `testerR4` rutas (volteadas), `jobsService.test.ts`, `builderR4` r4·3 |
| 3 | Documentación coherente con la BD | **Resuelto con salvedad (N-1)** | FASE-00 `:733` (GET: `crm.jobs.view`, `resolveJobsPermissions`, roles 1/2/5, `retry ⇒ view`), `:734` (retry: `crm.jobs.retry`, «el Manager SÍ reintenta»), `:1520-1531` §13 r5 (decisión, política de RPC, hallazgo 4 del QA: un cargo no niega a 1/2/super admin) | `builderR5` r5·1 doc; `testerR5` «N-1 documental» ata la frase que N-1 contradice |
| 5 (opc.) | N-3 `maintenance` con presupuesto agotado | **Resuelto** | `scheduler.ts:150-154` (`remaining <= 0` ⇒ `{ok:false, ms:0, error:'budget_exhausted'}` + `warn('maintenance_skipped')`, sin `runMaintenance` ni timer), `:156-158` (`Math.max(250, remaining)` conservado) | `testerR5` N-3 (4: total negativo, `budgetMs` 0 con total infinito, 1 ms ⇒ arranca y aborta a ~250 ms, `recording_cleanup` en el mismo lote); `testerR4` «N-3 (cerrado en r5)» + caso positivo |
| 4 (opc.) | Segunda guarda de M22/M26 | **Resuelto** | `builderR5` r5·4a (3: super admin con `organizationId`/`org_id`/`orgId` en body y `?organization_id=` ⇒ 403 sin `getServiceClient` ni RPC) y r5·4b (2: literal 300 y Δt ≥ 295) | `testerR5` regla 5 (9: seis variantes body/query con rol 5, rol 4 sin permiso ⇒ 403 por la org y no por el permiso, misma org como string, id no UUID ⇒ 400) |
| N-2 | Doble RPC en la GET | **Cerrado** | `route.ts:23` una sola llamada; rol 5 / cargo con retry ⇒ **1** RPC; cargo «solo ve» ⇒ 2 (`[retry, view]`) | `testerR5` «rol 4 sin cargo ⇒ 2 RPC en ese orden», «rol 5 ⇒ EXACTAMENTE 1» |
| QA h.4 | Un cargo no niega la cola a 1/2/super admin | **Verificado y documentado** | `orgContext.ts:318` `isOrgAdminLike` antes de la RPC | `testerR5` «super admin … CERO RPC», «rol 1/2 … sin RPC» |

## Matriz de permisos (rutas reales, `getServerOrgContext` doblado, `hasOrgAdminOrPermission` REAL, RPC con la semántica de la BD)

| Sujeto | GET | `canRetry` | RPC GET (códigos) | POST retry | RPC retry | Service client |
|---|---|---|---|---|---|---|
| super admin (rol 9) | 200 | true | 0 | 404 (llega a `retryJob`) | 0 | 1 |
| rol 1 / rol 2 | 200 | true | 0 | 404 | 0 | 1 |
| rol 5 (grants `f00_45`) | 200 | true | 1 `[retry]` | 404 | 1 | 1 |
| rol 4 sin cargo | 403 «Requiere permiso crm.jobs.view» | – | 2 `[retry, view]` | 403 «Requiere permiso crm.jobs.retry» | 1 | 0 |
| rol 3 | 403 | – | 2 | 403 | 1 | 0 |
| rol 4 + cargo `view=true` | 200 | false | 2 | 403 | 1 | 0 |
| rol 4 + cargo `retry=true` | 200 | true | 1 | 404 | 1 | 1 |
| rol 5 + cargo `view=false, retry=false` | 403 | – | 2 | 403 | 1 | 0 |
| **rol 5 + cargo `view=false` (solo)** | **200** | **true** | **1 `[retry]`** | **404** | 1 | 1 |
| rol 5 + cargo `retry=false` (solo) | 200 | false | 2 | 403 | 1 | 0 |
| rol 5 con membresía inactiva (RPC `false`) | 403 | – | 2 | 403 | 1 | 0 |
| rol 5, RPC lanza / rechaza / `{error}` / `'true'` / `1` / `null` / `undefined` | 403 | – | – | 403 | – | 0 (nunca 500) |
| rol 5, RPC tarda 150 ms y falla | 403 + `warn` | – | – | – | – | – |
| rol 5 sin sesión completa (sin `supabase`/`userId`) | `{false,false}` sin RPC | – | 0 | – | – | – |
| rol 5 + org ajena en body/query (6 variantes) | – | – | – | 403 «Organización no permitida» | **0** | **0** |

## Fallos (r5)

### N-1 [medio, contrato/doc] `retry ⇒ view` anula la precedencia del cargo sobre `crm.jobs.view`
- BD real (dry-run con `rollback`; rol 5 de org 128 asignado a un cargo existente de su org):
  `cargo sin filas` ⇒ `v=true,r=true`; `niega SOLO view` ⇒ **`v=false,r=true`**; `niega view y retry` ⇒
  `false,false`; `niega SOLO retry` ⇒ `v=true,r=false`. `check_user_permission` resuelve un código por llamada
  y no conoce el contrato del código.
- Código: `jobsService.ts:102` `if (await canRetryJobs(ctx)) return { canView: true, canRetry: true }` ⇒ para
  «niega SOLO view» la GET responde 200 con la cola y `retry/route.ts:29` deja reintentar; `crm.jobs.view`
  **nunca se consulta**. Además `canViewJobs(ctx)` devuelve `false` para ese mismo miembro: las dos funciones
  exportadas se contradicen (hoy solo las rutas las usan, `grep` sin otros consumidores).
- Doc que lo contradice: FASE-00 `:1527` («un cargo que le niegue `crm.jobs.view` lo deja fuera aunque sea
  Manager»), `jobsService.ts:39-40` («un cargo puede negárselo con precedencia»), títulos de
  `jobsService.test.ts:53` y `builderR4.test.ts:239`, comentario `testerR3.test.ts:417`. Todos los tests que
  «niegan por cargo» niegan **ambos** códigos (`rpcByCode({})`), por eso no lo vieron.
- Reproducción: `testerR5` «N-1 · rol 5 con cargo que niega SOLO crm.jobs.view …» (aserción del comportamiento
  real) y el test estático «N-1 documental» (ata la frase de §13 r5).
- Opciones para el QA: (a) doc + cabecera: «para dejar fuera a un Manager hay que negarle **ambos** códigos;
  negar solo `view` no cierra nada» (sin cambio de código; los tests de N-1 pasan a ser contrato); o (b)
  política (ii) del QA: `canRetry = retry && view` (dos RPC en `Promise.all`, `retry/route.ts` también
  comprueba `view`), con lo que el cargo sí manda sobre cada código. No es fuga entre tenants: el sujeto es
  miembro activo con el retry concedido por su rol.

### N-2 [bajo, proceso] Árbol compartido: `commit` + `stash` ajenos durante una mutación
- Cronología (hora local): 01:23 M1 corre con 15 rojos «raros» (`canViewJobs` de un contexto sin `rpc`
  devolvió `true`) ⇒ md5 de `orgContext.ts` OK al terminar, pero al repetir M1 el `md5sum -c` final marcó 6/7
  archivos distintos: `git log` ya tenía `e3972da7` y `stash@{0}` con exactamente las versiones r5 (md5
  normalizados = mis copias). Mi `trap EXIT` reescribió `jobsService.ts` r5 sobre el árbol en `HEAD`;
  `git checkout -- jobsService.ts` (01:24:52) para no romper el `pop` ajeno; a 01:26 los 7 md5 = baseline
  (los archivos volvieron **staged**, `M ` en el índice: la otra sesión hizo `stash apply`/`add`).
- Consecuencia: la primera M1 no cuenta; se repitió limpia. Recomendación (igual que r4 N-7 y builder r5):
  ningún `stash` sobre `main` con agentes en paralelo; el orquestador debe mirar `git stash list` antes de
  encadenar.

### N-3 [info] `budgetMs` del paso en 0 también salta `maintenance`
- `scheduler.ts:150` `remainingFor(opts.budgetMs) = min(budgetMs, total-restante)`: con `budgetMs: 0` y
  total infinito, `remaining = 0` ⇒ `budget_exhausted` (antes corría 250 ms). La ruta real usa
  `SCHEDULED_BUDGET_MS` > 0, así que no hay efecto; se anota porque cambia la semántica de «mínimo 250 ms»
  también para el presupuesto del paso, no solo para el total. Test: `testerR5` «budgetMs del paso en 0 …».

## Mutation testing

Script `mutate.sh` (scratchpad): comprueba md5 = baseline de los 7 archivos vigilados antes, muta con
`perl -0pi`, exige que el md5 cambie, corre `TZ=UTC npx jest src/lib/jobs src/app/api/crm/jobs --silent`,
restaura desde la copia del scratchpad en `trap EXIT` (reescritura binaria si `cp` no surte efecto) y verifica
md5 = baseline del archivo y de todo el alcance. Logs en `tester-r5/mut/M*.log`.

| # | Mutación (cambio r5) | Archivo:línea | Resultado | Tests rojos (suites) |
|---|---|---|---|---|
| M1 | fallback de `resolveJobsPermissions` con `canRetry: true` (ver concede reintentar) | `jobsService.ts:103` | muerta | 11 (jobsService ×3, testerR5 ×3, builderR5 ×2, builderR4 ×2, testerR4 ×1) |
| M2 | `JOBS_RETRY_PERMISSION = 'crm.jobs.view'` (los dos códigos preguntan por `view`) | `jobsService.ts:55` | muerta | 17 (testerR4 ×4, builderR4 ×4, testerR5 ×4, jobsService ×4, builderR5 ×1) |
| M3 | `hasJobsPermission` concede ante excepción (`return true` en el `catch`) | `jobsService.ts:83` | **equivalente** (0 rojos): `orgContext.ts:325-334` captura antes; el `catch` de JOBS es inalcanzable hoy (igual que M6 del builder) | 0 |
| M4 | `permissionSubject` `isSuperAdmin: ctx.isSuperAdmin !== false` | `jobsService.ts:69` | **sobrevivió** en la 1.ª pasada (por tipo `boolean` es equivalente; por valor no: `undefined`/`'true'` ⇒ super admin). Añadido test «isSuperAdmin ausente/undefined/"true"/1 NO es super admin» ⇒ **M4b muerta** | 0 → 1 (testerR5) |
| M5 | GET: `if (!permissions.canRetry)` (el cargo «solo ve» recibe 403) | `route.ts:24` | muerta | 4 (testerR5 ×3, testerR4 ×1) |
| M6 | GET: `canRetry: permissions.canView` | `route.ts:44` | muerta | 4 (testerR5 ×3, testerR4 ×1) |
| M7 | GET sin `await` en `resolveJobsPermissions` (promesa ⇒ `canView` undefined ⇒ 403 para todos) | `route.ts:23` | muerta | 15 (testerR5 ×10, testerR4 ×4, builderR4 ×1) |
| M8 | retry: `readOrgBody` DESPUÉS de `canRetryJobs` (el permiso se consulta con org ajena en el body) | `retry/route.ts:28-31` | muerta | 8 (testerR5 regla 5 ×7, estático ×1) — 1.ª pasada abortada por `
` vs CRLF, repetida con `
?
` |
| M9 | retry: `canViewJobs as canRetryJobs` (quien ve reintenta) | `retry/route.ts:5` | muerta | 7 (testerR5 ×5, testerR4 ×2) |
| M10 | scheduler: `remaining < 0` (presupuesto 0 arranca `maintenance`) | `scheduler.ts:151` | muerta | 3 (testerR5 ×2, testerR4 ×1) |
| M11 | scheduler: `Math.max(250, remaining)` ⇒ `remaining` (sin mínimo) | `scheduler.ts:158` | muerta | 1 (testerR5 «1 ms ⇒ arranca y aborta a ~250 ms») — cobertura delgada, se anota |
| M12 | scheduler: el bloque «skipped» ya no excluye la ejecución (`else` eliminado: salta Y corre) | `scheduler.ts:154-155` | muerta | 4 (testerR5 ×3, testerR4 ×1) — 1.ª pasada abortada por CRLF, repetida |
| M13 | retry: sin `readOrgBody` (M26 del tester r4, ahora con 2.ª guarda) | `retry/route.ts:28` | muerta | 11 (testerR5 ×8, builderR5 ×2, testerR4Cadena ×1) — en r4 la mataba **1** test |

**13 mutaciones distintas: 11 muertas, 1 equivalente (M3), 1 muerta tras añadir un test (M4→M4b).** Ninguna
mutación quedó viva: cada línea `[Mx] restore md5=… baseline=… OK` en `mut/summary*.log`. Nota: el «AVISO … DESPUÉS»
del primer lote se emite antes del `trap` de restauración y solo nombra el archivo mutado (falso positivo del
orden del script, corregido en el segundo lote); el aviso real de árbol ajeno fue el de la M1 descartada.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/lib/services/crm/__tests__ src/app/api/crm/jobs src/__tests__/guardrails.test.ts` (antes de mis tests) | **122 suites / 2 366 verdes** |
| `TZ=UTC …` (mismo patrón, con `testerR5`) | **125 suites / 2 437 tests: 124 verdes, 1 rojo AJENO** (`src/lib/services/crm/__tests__/f10Round2Tester.test.ts` «D1b el paso onboarding de F10 no crea instancia…»: F10/F11, `onboardingService.ts` y ese test están modificados por otra sesión en curso; fuera de mi alcance, mismo rojo en ambas zonas). El patrón `src/lib/services/crm/__tests__` arrastra 104 suites del CRM ajenas a JOBS |
| `TZ=America/Bogota …` (mismo patrón, con `testerR5`) | **125 suites / 2 437: 124 verdes, el mismo rojo ajeno** (idéntico a UTC) |
| `TZ=UTC npx jest src/lib/jobs src/__tests__/guardrails.test.ts` | **21 suites / 344 verdes** (263 JOBS + 81 guardrails) |
| `TZ=UTC` / `TZ=America/Bogota npx jest src/lib/jobs/__tests__/testerR5.test.ts` | 40/40 y luego 41/41 en ambas |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p <tsconfig acotado en el scratchpad: src/types/**, src/lib/jobs/**, jobsService.ts, api/crm/jobs/**; typeRoots del repo>` | **exit 0, 0 errores** (tras corregir 1 error de tipo en mi propio test; el tsconfig vive en el scratchpad, no en el árbol) |
| `npx eslint src/lib/jobs/__tests__/testerR5.test.ts` | limpio |
| BD `permissions`/`role_permissions` (`crm.jobs.*`, `admin.full_access`) | `crm.jobs.view {1,2,5}`, `crm.jobs.retry {1,2,5}`, `admin.full_access {1,2}`; sin filas `allowed=false` |
| BD `schema_migrations` `f00_(37|41|42|45|46)` | 37, 45, 42, 41 aplicadas (en ese orden); **46 no existe** |
| BD `pg_get_functiondef(check_user_permission)` | miembro activo → super admin ⇒ true → cargo (`FOUND` ⇒ `COALESCE(allowed,false)`) → rol → false; un código por llamada |
| BD `check_user_permission` con un miembro activo real por rol (ids de org, sin nombres) | rol 2 (org 1): `v=r=a=true`; rol 2 super admin (org 67): todo `true`; rol 4 (org 57): todo `false`; rol 5 (org 128): `v=r=true, a=false`. No hay miembros activos con rol 1 ni 3 |
| BD dry-run cargo (`begin … rollback`, rol 5 org 128) | `sin filas: t/t` · `niega solo view: f/t` · `niega ambos: f/f` · `niega solo retry: t/f`; después: 0 filas `job_position_permissions` con `crm.jobs.%` y el miembro sin cargo |
| `git status` del alcance | 9 archivos r5 modificados (hoy **staged** por la otra sesión) + `builderR5.test.ts` y `testerR5.test.ts` nuevos; ningún `.sql` de prueba ni `.mutbak` míos. Hay un `tsconfig.pos-display.tmp.json` en la raíz (01:28, de la sesión del POS display; no es mío y no lo toco) |

## Ninguna mutación viva

`md5sum -c md5-before.txt` al cerrar: 

```
src/lib/services/crm/jobsService.ts: OK           854795be6ec3e65694e9b501b378bb58
src/app/api/crm/jobs/route.ts: OK                  66d8c0ccefcf0d21c9813a79d20ab96e
src/app/api/crm/jobs/[id]/retry/route.ts: OK       15924e3ccd9b2f82ac80a44c113915b3
src/lib/jobs/scheduler.ts: OK                      4a86a6f438a68f1c47ef0ba3709ff7eb
src/lib/jobs/runner.ts: OK                         f7e95dc4125049f6c9d3481cfbb7de55
src/lib/utils/orgContext.ts: OK                    3bcc367dc8e248ed47f19f965b029b83
src/lib/security/organizationBody.ts: OK           7bb00213b0a28f5a405a0db48351dda4
```

(`md5sum -c md5-before.txt` ejecutado tras el último lote y tras las suites finales; baseline tomado al empezar,
con copia byte a byte en el scratchpad. Los md5 de la copia y del árbol coinciden por ruta.)

## Cobertura no probada

- `check_user_permission` contra la BD **desde las rutas** (HTTP real): la RPC se ejercitó por MCP con
  miembros reales y las rutas con un doble fiel; no hay `next dev` en esta ronda.
- Concurrencia real de dos runners y reclaim (igual que r4).
- `JobsMonitor`/`JobsTable` en navegador (sin cambios en r5).

## Calificación de robustez: 9,2/10

Sube desde 9,0 (r4) porque los tres obligatorios y los dos opcionales del QA r4 están cerrados con evidencia
triple: código (archivo:línea), BD real (grants `{1,2,5}`, `check_user_permission` con miembros reales de cada
rol, migraciones 37/45/42/41 aplicadas y sin `f00_46`) y tests que ejercitan las rutas reales con la semántica
exacta de la RPC (41 nuevos + los volteados del builder). El permiso ya no depende de ninguna lista de roles, la
GET resuelve una vez por petición (1 RPC para quien reintenta, 2 como máximo), el retry comprueba la org del
body antes del permiso y antes de la BD (M13: 11 tests, frente a 1 en r4), la RPC que lanza/rechaza/tarda/devuelve
basura da 403 y nunca 500, y `maintenance` ya no gasta 250 ms con el total agotado. 12 de 13 mutaciones sobre
los cambios r5 mueren (la restante es equivalente por la captura previa de `orgContext`).

No llega a 9,5 por N-1: el contrato `retry ⇒ view` está implementado en el código pero **no** en la BD, así que
la promesa de la doc («un cargo puede negarle la vista al Manager») solo se cumple si el cargo niega los dos
códigos; `canViewJobs` y `resolveJobsPermissions` se contradicen para ese miembro y ningún test del builder lo
cubre (todos niegan ambos). Es un cierre de una frase en la doc o de seis líneas en el código (política ii), y
el QA debe elegir. Residuos menores: el mínimo de 250 ms lo sostiene un solo test (M11) y `budgetMs: 0` del paso
también salta `maintenance` (N-3 info). El incidente de `commit`+`stash` ajeno durante M1 no resta al código,
pero confirma la recomendación de r4: sin `stash` sobre `main` con agentes en paralelo.
