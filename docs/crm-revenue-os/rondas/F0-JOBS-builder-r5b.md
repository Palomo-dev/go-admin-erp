# F0-JOBS — Builder — Ronda 5b (cierre, opción b del QA r5) — 2026-09-16

Insumos: `F0-JOBS-qa-r5.md` (10 puntos del cierre, hallazgo 4 con los 24 tests rojos) y `F0-JOBS-tester-r5.md`
(N-1). Código ya cambiado por el orquestador (no revertido, ningún test demostró defecto): `jobsService.ts`
(`resolveJobsPermissions` consulta `crm.jobs.view` primero, `false` ⇒ `{canView:false, canRetry:false}` con 1
RPC; `true` ⇒ consulta `crm.jobs.retry`, 2 RPC en orden `[view, retry]`; `canRetryJobs = resolveJobsPermissions(ctx).canRetry`)
y `retry/route.ts` (`(await resolveJobsPermissions(ctx)).canRetry`, 403 «Requiere permisos crm.jobs.view y
crm.jobs.retry»). Sin ramas, sin commits, sin BD, sin `.sql`. Nada fuera de JOBS.

## Tests volteados (24 rojos ⇒ verdes; ninguno borrado)

| Archivo | Qué cambió | Por qué |
|---|---|---|
| `jobsService.test.ts` | `describe` de `resolveJobsPermissions`: nuevo caso «ambos true ⇒ 2 RPC `[view, retry]`»; «solo retry» ⇒ `{false,false}` con 1 RPC (`view`); orden `[view, retry]` con «solo view»; «ninguno» ⇒ 1 RPC; cliente que lanza ⇒ 1 llamada. Nuevo «cargo que niega SOLO view ⇒ las tres funciones coinciden en `false`» | Contrato (b): `view` primero, cortocircuito, `canRetry = view ∧ retry` |
| `builderR4.test.ts` r4·3 | Manager: 1 RPC tras `canViewJobs`, 3 tras `canRetryJobs` (`[view, view, retry]`); Empleado con ambos: 3; orden `[view, retry]`; «solo retry» ⇒ `{false,false}` 1 RPC; estático: el retry usa `(await resolveJobsPermissions(ctx)).canRetry` una vez y no contiene `canRetryJobs(`/`hasOrgAdminOrPermission(`/`hasJobsPermission(` | `canRetryJobs` delega (2 RPC); punto único en el retry |
| `builderR5.test.ts` r5·2 | rol 5 ⇒ 2 RPC `[view, retry]`; rol 3/4 ⇒ 1 RPC (`view`); cargo que niega solo `view` ⇒ `{false,false}` 1 RPC; cabecera actualizada | Conteos de (b) |
| `testerR4.test.ts` | rol 4 sin permisos: retry 403 con el mensaje nuevo, códigos `[view, view]` (retry nunca se pregunta); «solo retry por cargo» ⇒ 403/403 con 1 RPC (hallazgo 3); nuevo «view y retry por cargo ⇒ 200 `canRetry:true`, `[view, retry]`, retry 404»; «solo view» orden `[view, retry]`; «GET con cargo»: 1 RPC cuando `view=false` | Hallazgo 3 del QA r5 y orden nuevo |
| `testerR5.test.ts` | Matriz: rol 5 ⇒ `[view, retry]` en GET y retry (2 RPC, 1 service); rol 4 ⇒ 1 RPC `view` en GET y retry, mensaje nuevo; «solo view» ⇒ retry 2 RPC; «solo retry» ⇒ 403/403; «niega ambos» ⇒ 1 RPC; **N-1 pasa de documentar el defecto a demostrar la corrección** (GET 403 con EXACTAMENTE 1 RPC `crm.jobs.view`, retry 403 con 0 `getServiceClient`, las tres funciones `false`); «RPC recibe sesión» ⇒ 4 llamadas; `permissionSubject` ⇒ 1 RPC; estáticos: retry con `(await resolveJobsPermissions(ctx)).canRetry` y sin `canRetryJobs`; `jobsService.ts` consulta `view` y luego `retry`, `canRetryJobs` contiene `resolveJobsPermissions(ctx)`. `:412` (N-1 documental) **conservado** | Punto 1 del QA r5 |

## Nuevo `builderR5b.test.ts` (27 tests): los 10 puntos del QA r5

1 (3 tests: GET 403 con 1 RPC `view`, retry 403 con `getServiceClient` que lanzaría si se abriera, las tres
funciones coinciden) · 2 (rol 5 ⇒ `[view, retry]`, retry 404 con 1 service) · 3 (niega solo `retry`) · 4 (rol 4 +
solo `retry` ⇒ 403/403, 1 RPC) · 5 (rol 4 sin cargo) · 6 (rol 1/2/super admin: 0 RPC en las tres vías) · 7
(fail-closed por código: lanza / `{error}` / `'true'` / `1` / `null` en `view` ⇒ 403, 1 RPC, sin `retry`; en
`retry` con `view=true` ⇒ 200 `canRetry:false`, retry 403; 10 casos) · 8 (estático: `view` precede a `retry` con
`return {false,false}` entre ambas; sin `Promise.all`; `canRetryJobs` sin `hasJobsPermission`/`JOBS_RETRY_PERMISSION`;
retry/route.ts sin `hasOrgAdminOrPermission(`/`canRetryJobs(`, orden de guardas) · 9 (doc: §4.1 GET sin «una sola
RPC cuando `crm.jobs.retry` es `true`» y con «reintentar exige ambos códigos»/«`view=false` cierra la cola con 1
RPC»; POST «el Manager reintenta si además puede ver»; §13 r5 conserva `:1527`, registra el hallazgo 3 y el
«Cierre r5»; cabeceras sin «retry ⇒ view»). El punto 10 son las suites (abajo).

## Mutaciones (script `mutate*.sh` en el scratchpad; md5 = baseline antes y después de cada una, restauración por `cp` byte a byte)

| # | Mutación | Archivo | Rojos (`TZ=UTC npx jest src/lib/jobs src/app/api/crm/jobs`) |
|---|---|---|---|
| M1 | orden invertido con cortocircuito (= N-1 original, `retry ⇒ view`) | `jobsService.ts` `resolveJobsPermissions` | **47** (r5b, testerR5, builderR4/R5, jobsService, testerR4) |
| M2 | orden invertido sin cortocircuito (`retry` y luego `view`, `view && retry`) | ídem | **46** |
| M3 | orden correcto sin cortocircuito (`view=false` sigue preguntando `retry`) | ídem | **29** |
| M4 | `canRetry: retry` sin `&& view` | ídem | **29** |
| M5 | `canRetryJobs` consultando solo `retry` (`hasJobsPermission(ctx, JOBS_RETRY_PERMISSION)`) | `jobsService.ts:96` | **8** (builderR4, r5b, jobsService, testerR5) |
| M6 | retry/route.ts con `hasOrgAdminOrPermission(ctx, 'crm.jobs.retry')` directo | `retry/route.ts:2,30` | **20** (r5b, testerR5, testerR4, builderR4) |

Ninguna viva. `md5sum -c md5-before.txt` ⇒ `jobsService.ts: OK`, `retry/route.ts: OK` tras cada mutación y al final.

## Docs

FASE-00 `:734` (GET: sin «una sola RPC cuando `crm.jobs.retry` es `true`»; con «reintentar exige ambos códigos»,
«`view=false` cierra la cola con 1 RPC», orden `[view, retry]`), `:735` (POST: ambos códigos, «el Manager reintenta
si además puede ver», mensaje 403 nuevo), `:1525` (el contrato `retry ⇒ view` queda como historia, sustituido por
`view ∧ retry`), `:1527` (política (ii) secuencial, `canRetryJobs` delega, frase «lo deja fuera aunque sea Manager»
conservada y completada con «también le impide reintentar» + hallazgo 3), párrafo de tests r5 marcado como histórico
y nuevo párrafo **«Cierre r5 (2026-09-16, QA r5 N-1, opción b)»** con el coste de RPC (Manager 2+2, quien no ve 1)
y el cambio de semántica visible. Cabecera de `jobsService.ts:23-25` (`canRetryJobs = resolveJobsPermissions(ctx).canRetry`);
`route.ts` y `retry/route.ts` ya estaban bien (sin «retry ⇒ view», verificado por r5b·9). `PROGRESS.md` no lo toco
(entrada r5 del orquestador).

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/app/api/crm/jobs src/__tests__/guardrails.test.ts` | **22 suites / 374 verdes** (293 JOBS + 81 guardrails) |
| `TZ=America/Bogota …` (mismo patrón) | **22 suites / 374 verdes**, idéntico |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p <tsconfig acotado en el scratchpad: src/types/**, src/lib/jobs/**, jobsService.ts, api/crm/jobs/**>` | **exit 0, 0 errores** |
| `npx eslint` sobre los 6 tests, `jobsService.ts`, `route.ts`, `retry/route.ts` | limpio |
| `file` de los CRLF (`jobsService.test.ts`, `builderR4.test.ts`, `testerR4.test.ts`, FASE-00) | CRLF conservado |
| `ls supabase/migrations \| grep f00_46` / `git stash list` | 0 / vacío |

Fuera de alcance y no tocado: `guardrails.test.ts`, `orgContext.ts`, `security/**`, `scheduler.ts`, `testerR3.test.ts`.
