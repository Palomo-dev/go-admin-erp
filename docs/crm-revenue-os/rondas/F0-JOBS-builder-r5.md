# F0-JOBS — Builder — Ronda 5 (corta) — 2026-09-16

Insumos: `F0-JOBS-qa-r4.md` (9,1/10; obligatorios 1–3, opcionales 4–5) y `F0-JOBS-tester-r4.md` (N-2, N-3, M22,
M26). Estado BD ya aplicado por el orquestador: `f00_37`, `f00_41`, `f00_42`, `f00_45` (`crm.jobs.view` y
`crm.jobs.retry` concedidos a roles 1, 2 y 5). Sin migraciones nuevas, sin `.sql` de prueba, sin ramas, sin
commits. No se tocaron `src/__tests__/guardrails.test.ts`, `src/lib/security/**` ni `src/lib/utils/orgContext.ts`.

## Decisión del orquestador (autorizada por el dueño) — obligatorio 1

Opción **B** del QA r4: el Manager (rol 5) **SÍ reintenta**. Se conserva la concesión de `crm.jobs.retry` de
`f00_45` y **no hay `f00_46`**. Razón: reintentar un job `dead|failed` es idempotente (reutiliza el
`dedupe_key` y la clave `job:{raíz}` de `whatsapp`) y de bajo riesgo; la jefatura comercial que ve la cola debe
poder destrabarla; un cargo (`job_position_permissions`) puede negárselo con precedencia. Contrato:
`retry ⇒ view`. Está escrito en `jobsService.ts` (cabecera), `retry/route.ts` (cabecera), FASE-00 §4.1
`:733-734` y §13 «ronda 5». Un test de contrato (`builderR5.test.ts`) lee `f00_45`, comprueba que concede los
dos códigos exactos del código a `[1, 2, 5]`, que no existe `f00_46` ni ningún `.sql` posterior que retire
`(5, crm.jobs.retry)`, y que la doc ya no dice `admin.full_access`/`STAGE_MANAGER_ROLE_IDS`/«Manager NO».

## Cambios

| Archivo | Qué |
|---|---|
| `src/lib/services/crm/jobsService.ts` | Sin `STAGE_MANAGER_ROLE_IDS` (import y uso). `JOBS_VIEW_PERMISSION = 'crm.jobs.view'`, `JOBS_RETRY_PERMISSION = 'crm.jobs.retry'`. `canViewJobs(ctx) = hasOrgAdminOrPermission(ctx, 'crm.jobs.view')`, `canRetryJobs(ctx) = hasOrgAdminOrPermission(ctx, 'crm.jobs.retry')`, ambas por `hasJobsPermission` con `try/catch` (fail-closed también ante excepción del cliente; `orgContext` de F0-SEC C+D ya la captura, esto es defensa en profundidad). Nueva `resolveJobsPermissions(ctx): Promise<{canView, canRetry}>`: consulta `crm.jobs.retry`; si `true` ⇒ `{true,true}` con **una** RPC; si no, consulta `crm.jobs.view`. Cabecera reescrita con la decisión (sin «hasta que el dueño lo cree») |
| `src/app/api/crm/jobs/route.ts` | Una sola `await resolveJobsPermissions(ctx)`; `canView` ⇒ 403 «Requiere permiso crm.jobs.view»; `canRetry` en la respuesta. N-2 cerrado |
| `src/app/api/crm/jobs/[id]/retry/route.ts` | Solo cabecera (decisión) y mensaje 403 «Requiere permiso crm.jobs.retry». Sigue `readOrgBody` → `canRetryJobs` |
| `src/lib/jobs/scheduler.ts` | N-3 (opcional 5): `maintenance` con `remainingFor(budgetMs) <= 0` ⇒ `{ok:false, ms:0, error:'budget_exhausted'}` + `log.warn('maintenance_skipped')`, sin `runMaintenance` ni timer; con presupuesto positivo el mínimo de 250 ms se conserva |
| `docs/crm-revenue-os/FASE-00-FUNDACIONES.md` | `:733-734` (auth por código, roles por defecto según `f00_45`, `retry ⇒ view`) y nuevo `## 13 … ronda 5` (anexado al final; otro builder edita el mismo archivo en paralelo, solo se tocaron esas líneas) |

### Tests volteados / añadidos

| Archivo | Cambio |
|---|---|
| `src/lib/jobs/__tests__/jobsService.test.ts` | Sin sesión completa ⇒ solo rol 1/2/super admin (rol 5 ⇒ `false`, sin RPC). Manager con sesión ve y reintenta por RPC con `crm.jobs.*` (nunca `admin.full_access`); cargo que niega ⇒ fuera aunque sea rol 5; rol 4 con `view` y sin `retry`. `resolveJobsPermissions`: 1 RPC con retry; 2 en orden `[retry, view]` sin él; admin/super admin sin RPC; RPC con `error` y cliente que lanza ⇒ ambos `false` + `warn` |
| `src/lib/jobs/__tests__/builderR4.test.ts` r4·3 | Volteado a códigos; test estático: `jobsService.ts` sin `STAGE_MANAGER_ROLE_IDS`, `roleId === N`, `roleName`, `admin.full_access`; GET con **una** `resolveJobsPermissions(ctx)` y sin `can*Jobs(`; retry con `await canRetryJobs(ctx)` |
| `src/lib/jobs/__tests__/testerR3.test.ts:390-420` | Sin sesión: coincide con `ORG_ADMIN_ROLE_IDS` (no con lista propia); Manager reintenta con `f00_45`; cargo que niega lo deja fuera |
| `src/lib/jobs/__tests__/testerR4.test.ts` rutas | Rol 4 sin permisos ⇒ 403/403 con los mensajes nuevos y sin `admin.full_access`; rol 4 con `retry` ⇒ 200 `canRetry:true`, **1 RPC**, POST llega a `retryJob` (404); rol 4 solo `view` ⇒ 200 `canRetry:false`, 2 RPC, POST 403; Manager con ambos ⇒ 200 y POST llega a `retryJob`; Manager con cargo que niega ⇒ 403/403; contexto parcial rol 5 ⇒ `false` sin RPC; «GET con cargo» convertido en aserción (≤ 2, exactamente 1 con retry). N-3: «RESIDUO» ⇒ aserción `not.toHaveBeenCalled` + `{ok:false, ms:0, error:'budget_exhausted'}`; nuevo caso positivo < 250 ms |
| `src/lib/jobs/__tests__/builderR5.test.ts` (nuevo, 11 tests) | Contrato BD ↔ código ↔ doc (arriba); `resolveJobsPermissions` por rol de sistema con los grants de `f00_45`; **opcional 4**: `readOrgBody` en retry con super admin y `organizationId`/`org_id`/`orgId` ajenos en body y `?organization_id=` en query ⇒ 403 sin `getServiceClient` ni RPC (2.ª guarda de M26); misma org ⇒ pasa (404); T-6: `expect(COMPLETE_RETRY_DELAY_MS).toBe(300)`, literal en `runner.ts`, y Δt ≥ 295 ms medido sin restar la constante (2.ª guarda de M22) |

## Verificación

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/lib/services/crm/__tests__ src/app/api/crm/jobs src/__tests__/guardrails.test.ts` | **121 suites / 2 352 tests verdes** |
| `TZ=America/Bogota …` (mismo patrón) | **121 suites / 2 352 verdes** |
| `TZ=UTC npx jest src/lib/jobs src/__tests__/guardrails.test.ts` | 20 suites / **301** (220 JOBS + 81 guardrails) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p <tsconfig acotado: src/types/**, src/lib/jobs/**, jobsService.ts, api/crm/jobs/**, JobsMonitor, JobsTable>` | **exit 0, 0 errores** (tsconfig temporal borrado) |
| `npx eslint` sobre los 9 archivos tocados | limpio |
| Mutaciones (restauración por `cp` en `trap EXIT` + `md5sum -c`) | M1 `resolveJobsPermissions` siempre `canView:true` ⇒ 13 rojos; M2 `canViewJobs` consulta `crm.jobs.retry` ⇒ 8; M3 sin cortocircuito (siempre 2 RPC) ⇒ 11; M4 GET sin resolver permisos ⇒ 8; M5 `maintenance` sin guarda ⇒ 1; M6 `hasJobsPermission` concede ante excepción ⇒ **equivalente** (el `try/catch` de `orgContext` de F0-SEC C+D atrapa antes; la guarda de JOBS solo actúa si esa captura desaparece). md5 de los 3 archivos = baseline al cerrar |

## Incidente de árbol compartido (para el orquestador)

Durante esta ronda otra sesión hizo `git stash` y `git stash pop` sobre `main`: por unos segundos el árbol volvió
a `HEAD` (mis archivos y los del builder de F0-SEC aparecieron sin cambios) y luego se restauró completo. Todo lo
de esta ronda se verificó en disco después (`git status`, `grep`, suites verdes). Misma recomendación que el
tester r4 (N-7): no correr `stash`/mutaciones sobre `main` con builders en paralelo.

## Pendientes / notas

- `PROGRESS.md` entrada r5: la escribe el orquestador.
- Cosmético de la 41 (opcional 6, `jobname crm-jobs-every-minute`): no tocado en esta ronda (corta).
- `orgContext.ts` (otro builder) ya captura excepciones de la RPC; el `try/catch` de `hasJobsPermission` queda
  como defensa en profundidad y así se documenta en la cabecera. Si el QA prefiere una sola captura, retirar
  `hasJobsPermission` es un cambio de 6 líneas sin efecto en tests (M6).
