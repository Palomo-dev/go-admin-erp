# F0-JOBS — Tester — Ronda 4 — 2026-09-15

Alcance: `src/lib/jobs/**`, `/api/crm/jobs/**`, `jobsService.ts`, `JobsMonitor`/`JobsTable`, guardarraíl 18,
migraciones PENDIENTES `crm_v4_f00_41` y `crm_v4_f00_42` (+ rollbacks) y `outbound_jobs`/`cron.job` en BD.
Insumos: `F0-JOBS-builder-r4.md`, `F0-JOBS-qa-r3.md` (puntos 1–5), `F0-JOBS-tester-r3.md` (T-1…T-9),
FASE-00 §4.4/§12/§13. BD: solo `SELECT` y dos dry-runs `begin; …; rollback;` por MCP (proyecto
`jgmgphmzusbluqhuqihj`); **ninguna migración se aplicó**. Sin commits. Sin `.sql` ni scripts en el árbol
(mutaciones y logs en el scratchpad).

## Estado heredado del tester r4 anterior (murió por apagado del equipo)

- Dejó en el árbol `src/lib/jobs/__tests__/testerR4.test.ts` (18 tests) y `testerR4Outbound.test.ts` (3),
  sin informe. Ambos se verificaron y se conservan tal cual (verdes en los dos TZ).
- Dejó en el scratchpad su baseline md5 de 7 archivos, `mutate.sh` con 18 mutaciones y los logs de
  **M1–M17 (todas muertas, md5 ok)**. Murió **durante M18** («whatsapp ignora `retried_from`»): el árbol
  quedó con la mutación viva en `src/lib/jobs/handlers/whatsapp.ts:36` (`const origin = jobId;`) y el
  `backup.tmp` sin restaurar. **Restaurado** a `const origin = typeof payload.retried_from === 'string' &&
  payload.retried_from ? payload.retried_from : jobId;`; md5 posterior `36f90d4472fbc0d4aac5c083ec5ce606`
  = su baseline y = su `backup.tmp`; `md5sum -c` de los 7 archivos: OK. Antes de restaurar, la suite mostraba
  exactamente 5 rojos (builderR3 ×2, testerR3 ×2, testerR4 ×1): esa mutación muere, y por eso se vio.
- Lección para el ciclo: una mutación en curso es un riesgo real de corrupción del árbol; el script debe
  restaurar en `trap EXIT` y verificar la escritura (su `mutate.sh` no lo hacía; el mío de la primera pasada
  tampoco y sufrió un `cp` sin efecto en M24, ver tabla; `rerun.sh` ya lo hace).

## Resumen

- Los 5 puntos del QA r3 y los T-1…T-9 del tester r3 tienen corrección verificable en código y en tests:
  **5/5 resueltos** (T-5, T-7, T-8 como comportamiento aceptado/documentado, según pedía el QA).
- Suites `TZ=UTC` y `TZ=America/Bogota`: ver tabla final (idénticas en ambas zonas). `guardrails.test.ts`
  verde. `tsc` con heap 8 GB (completo y acotado): **0 errores** en `src/lib/jobs|jobsService|api/crm/jobs|JobsMonitor|JobsTable` — tras corregir 13 errores de tipo en los tests del tester que `ts-jest` no reporta (N-6).
- Mutation testing: **27/27 muertas** — 17 del tester anterior (sus logs, md5 ok) + 10 propias (M18 rehecha + M19–M27), md5 de los 8 archivos = baseline al cerrar. Ver tabla y los dos incidentes de restauración.
- Producción (solo SELECT): `outbound_jobs` = `done` 476, `failed` 6 (residuos org 125 del 09-10),
  0 `queued|running|dead`; `cron.job` 17/18/19 `active=false` con las definiciones exactas que asume el
  rollback de la 41; `messages` = 259 061 filas, **0** con `client_request_id`, sin índice sobre `metadata`;
  84/84 orgs en `America/Bogota`; `permissions` no tiene ningún `crm.jobs.*`, solo `admin.full_access`.
- **Dry-run real de la migración 42** (transacción con `rollback`): el `CREATE INDEX` sin `CONCURRENTLY`
  tardó **1 133 ms** sobre 259 061 filas (índice de 8 192 bytes: nace vacío) y el `explain` de la consulta
  exacta de `findByClientRequestId` da **`Index Scan using idx_messages_org_client_request_id`** con
  `Index Cond: (organization_id = 1) AND ((metadata ->> 'client_request_id') = 'job:x')`. La decisión del
  builder (predicado `is not null` en vez de `?`) queda demostrada. Tras el `rollback`: `pg_indexes` = 0.
- **Dry-run real de la migración 41 y su rollback** en una sola transacción: tras la 41, 17 = `*/2 * * * *`
  y 19 con los 4 kinds; tras el rollback, 17 = `* * * * *` y 19 = `recording_cleanup,maintenance`;
  `active=false` en los tres en todo momento. Tras el `rollback` externo, `cron.job` intacto.

## Verificación de los 5 puntos del QA r3

| # | Punto QA r3 | Estado | Evidencia (archivo:línea) y prueba |
|---|---|---|---|
| 1 | T-2 idempotencia fail-closed + índice + `retried_from` estable | **Resuelto** | `outboundService.ts:287` `if (error) throw new Error(\`findByClientRequestId: …\`)`; `whatsapp.ts:49-54` `try/catch` ⇒ `JobRetryableError('idempotency_check_failed: …')` sin `sendWhatsApp`; `whatsapp.ts:36` clave `job:{raíz}`; `jobsService.ts:239` `retriedFrom` = raíz si string no vacío. Migración 42 + rollback (dry-run arriba). Tests: `builderR4` «propaga el error…», «consulta fallida ⇒ JobRetryableError…», «retried_from apunta a la raíz…»; `testerR4` «timeout de BD ⇒ fn_fail_job con backoff estándar… CERO envíos» (desde el runner); `testerR4Outbound` (F16 real: consulta fallida ⇒ ni `deduct_comm_credits` ni INSERT); **`testerR4Cadena`** «3.ª generación… el runner lo completa como already_sent con la clave job:job-1» (cadena `retryJob` → runner → handler con `findByClientRequestId` real). Mutaciones M2/M3/M4/M18/M24/M27 muertas |
| 2 | T-1 `signal` antes de cada efecto + contrato honesto | **Resuelto (con el alcance que el QA aceptó)** | `whatsapp.ts:45,60`; `email.ts:29,65` (+ pertenencia `:53-63`); `transcribe.ts:25` (solo entrada, documentado `:16-20`). FASE-00 `:815` «al entrar y antes de cada efecto; un abort durante el efecto no lo cancela». Tests: `testerR3` (los dos ex-`it.failing` ahora `it`), `builderR4` «abort durante findByClientRequestId (real)», «email: abort durante la comprobación»; `testerR4` «timeout ADVISORY a mitad de la consulta ⇒ … NO envía»; **`testerR4Cadena`** «email… timeout advisory DURANTE la comprobación de pertenencia ⇒ retried:1 y CERO despachos» (y un solo `fn_fail_job`: el handler tardío no re-falla el job). Mutaciones M1/M8/M9/M10/M21 muertas |
| 3 | Permisos: un solo criterio y cargos contados | **Resuelto** | `jobsService.ts:2-3,52-59`: sin `MANAGER_ROLE_ID`; `canRetryJobs = hasOrgAdminOrPermission`, `canViewJobs = isSuperAdmin ∪ STAGE_MANAGER_ROLE_IDS ∪ hasOrgAdminOrPermission`; `orgContext.ts:315-335` fail-closed y `data === true`. `route.ts:21,41` y `retry/route.ts:25` con `await`. Tests: `builderR4` r4·3 (6), `testerR4` «permisos en las rutas» (8: 403/200/`canRetry` por rol y RPC, rol 9 llamado «Super Admin» ⇒ 403, contexto parcial sin RPC, `data==='true'|1` no concede); **`testerR4Cadena`** «POST retry: body con org AJENA ⇒ 403 sin abrir el service client; misma org ⇒ llega a retryJob». Mutaciones M5/M6/M7/M16/M17/M19/M20/M25/M26 muertas |
| 4 | T-6 / T-3 / T-4 / T-5 | **Resuelto** (T-5 = aceptado y documentado) | `runner.ts:62,391` (`COMPLETE_RETRY_DELAY_MS = 300`, guarda `deadlineAt - now > 300`); `scheduler.ts:256` (`exhausted()` antes de la 1.ª consulta), `:265` (tras seleccionar), `:185-205` (`budgetFor = max(0, …)`, `perTask <= 0` ⇒ `TaskFailure budget_exhausted`); `run/route.ts:65-66` «NO se persisten». Tests: `testerR3Runner` (Δt ≥ 300, un `fn_fail_job`), `builderR4` r4·4 (2), `testerR3` T-3/T-4/T-5, `scheduler.test.ts`, `testerR4` «presupuesto (T-3/T-4)» (3, incl. el residuo de `maintenance`). Mutaciones M11/M12/M13/M14/M15/M22/M23 muertas |
| 5 | Trazabilidad | **Resuelto** | FASE-00 `:733-734` (endpoints), `:815` (runner), `:825` (T-3/T-4/T-5 + supuestos T-7/T-8), `:1244` (§12 ronda 4), `:1502-1518` (§13 ronda 4: decisiones índice/permiso + hallazgo F9 `STAGE_MANAGER_ROLE_NAMES`). Test: `testerR4` «nada promete que pending_org_ids van primero al día siguiente» (ruta, scheduler, FASE-00) |

## Verificación T-1…T-9 del tester r3 contra r4

| T | Estado r4 | Evidencia |
|---|---|---|
| T-1 signal solo al entrar | **Cerrado (contrato honesto)** | ver punto 2. Sigue siendo cierto que `sendWhatsApp`/`dispatchScheduledEmail`/`runTranscribePipeline` no reciben `signal` (F16/F7/F4, fuera de alcance; `testerR3` lo sigue afirmando) |
| T-2 idempotencia traga errores / sin índice / `retried_from` | **Cerrado** (índice pendiente de aplicar, dry-run OK) | ver punto 1. Residuo documentado: ventana de 7 días (F16) |
| T-3 3 consultas con presupuesto 0 | **Cerrado** | `scheduler.ts:256`; `testerR3` «queries = []» ×2; M13 |
| T-4 mínimo 1 s por tarea F11 | **Cerrado** | `scheduler.ts:185-188`; `testerR3` «< 500 ms», `testerR4` «la primera tarea consume el total ⇒ la segunda ni arranca»; M15/M23 |
| T-5 `pending_org_ids` no se persiste | **Aceptado y documentado** | `run/route.ts:65-66`, FASE-00 `:825`; `testerR3` «comportamiento aceptado»; `testerR4` trazabilidad |
| T-6 reintento inmediato de `fn_complete_job` | **Cerrado** | `runner.ts:391`; `testerR3Runner`; `builderR4` (deadline inminente ⇒ sin espera); M11/M12/M22 |
| T-7 día UTC superconjunto solo a 08:30 | **Documentado como supuesto** | FASE-00 `:825` |
| T-8 fallback silencioso de zona | **Documentado como supuesto** | FASE-00 `:825`; `scheduler.ts:269-272` un `warn` |
| T-9 constante duplicada / nombre de rol | **Cerrado** | `jobsService.ts` sin ids ni nombres (`builderR4` test estático); `testerR3:387` volteado; hallazgo F9 en §13 |

## Fallos nuevos (r4), con pasos reproducibles

### N-1 [medio, proceso] El árbol quedó con una mutación viva por la muerte del tester anterior
- Pasos: `git diff src/lib/jobs/handlers/whatsapp.ts` mostraba `-const origin = typeof payload.retried_from …` /
  `+const origin = jobId;`; `TZ=UTC npx jest src/lib/jobs` ⇒ 5 rojos. Si el orquestador hubiera lanzado al QA
  o hecho commit en ese estado, la promesa «un retry nunca es un segundo envío» habría salido rota a `main`.
- Corregido en esta ronda (restauración byte a byte, verificada por md5 contra dos copias independientes).
- Recomendación: los scripts de mutación deben restaurar con `trap 'cp backup file' EXIT` y el orquestador
  debe correr `git diff --stat` + suite antes de encadenar agentes tras una muerte.

### N-2 [bajo] `GET /api/crm/jobs` consulta `check_user_permission` dos veces por petición para un cargo
- `route.ts:21` (`canViewJobs`) y `:41` (`canRetryJobs`): para un rol 4 con permiso por cargo, ambas llegan a
  la RPC (la primera no memoriza). Test «GET con cargo: la RPC se consulta dos veces» (`testerR4`). Con
  `JobsMonitor` refrescando cada 2 min es despreciable; se anota por si se añade polling más agresivo.
  Arreglo trivial: calcular `canRetry` una vez y derivar `canView = canRetry || STAGE_MANAGER || superadmin`.

### N-3 [bajo, residuo conocido] `maintenance` arranca aunque el presupuesto total esté agotado
- `scheduler.ts:150` `Math.max(250, remainingFor(opts.budgetMs))`: con `totalBudgetMs` ya consumido,
  `maintenance` recibe 250 ms igualmente. Test «RESIDUO (bajo): maintenance con totalBudgetMs 0 sí arranca»
  (`testerR4`). Es el primer paso del productor, así que en la ruta real nunca llega con el total agotado;
  solo importa si se reordenan los pasos.

### N-4 [info] Aplicación de la migración 42: bloqueo medido
- Dry-run en transacción: 1 133 ms de `CREATE INDEX` (SHARE lock sobre `messages`; escrituras esperan ese
  tiempo). La cabecera decía «segundos»: correcto y conservador. Aplicable con `apply_migration` en horario
  valle sin necesidad del `CONCURRENTLY` manual; el índice nace vacío (0 filas con clave).

### N-5 [info] `cron.job` 17 tiene `command` de un solo argumento
- `SELECT public.fn_crm_cron_post('/api/crm/jobs/run')` (sin body): la migración 41 solo le cambia el
  `schedule`, así que sigue drenando «todo» como Vercel. Coherente; se anota porque el rollback tampoco toca
  el `command` y así debe ser.

### N-6 [bajo, proceso] `ts-jest` no comprueba tipos: los tests del tester anterior tenían 13 errores de `tsc`
- `tsconfig.json:14` `isolatedModules: true` ⇒ `ts-jest` transpila sin diagnóstico semántico. `testerR4.test.ts`
  (heredado) tenía 7 errores (`rpc` autorreferente ⇒ `any` implícito, TS7022/TS7006; `rpc.mock.calls[0]`
  sobre tupla `[]`, TS2493) y la suite estaba verde igual; mi `testerR4Cadena.test.ts` heredó el patrón (6).
- Pasos: `npx tsc --noEmit -p <tsconfig acotado>` ⇒ 13 errores; `npx jest` ⇒ verde.
- Corregido en ambos archivos (`let claims` + `jest.Mock<…>` tipado; `(c: unknown[])`). El `grep` de `tsc`
  del cierre es la única guarda: no basta con «jest verde» para archivos de test.

### N-7 [medio, proceso] Árbol compartido entre agentes: mutaciones ajenas dan rojos falsos (y viceversa)
- La primera pasada final `TZ=UTC` dio 8 rojos en permisos porque otro agente mutó `orgContext.ts` en ese
  minuto (mtime 23:45:06; md5 = baseline segundos después). Un tester que no verifique md5 antes/después
  atribuiría el rojo al builder; y a la inversa, una mutación propia puede colarse en la suite de otro.
- Recomendación para el orquestador: no correr dos testers con mutación sobre `main` a la vez, o que cada
  uno mute en un worktree propio (`git worktree`), aunque el resto del ciclo siga en `main`.


## Migraciones pendientes (NO aplicadas): revisión + dry-run

| Migración | Estática | Dry-run (`begin; …; rollback;`) |
|---|---|---|
| `crm_v4_f00_42` índice parcial | expresión `(organization_id, (metadata->>'client_request_id'))`, predicado `direction = 'outbound' and (…) is not null`, `if not exists`, sin `CONCURRENTLY`, sin credenciales; `findByClientRequestId` filtra exactamente `organization_id`, `direction='outbound'` y `metadata->>client_request_id` (test estático `testerR4Cadena` que ata consulta ↔ predicado) | 1 133 ms; `indexdef` idéntica a la esperada; 8 192 bytes; `explain` ⇒ **Index Scan** con `Index Cond` sobre org + clave (el `created_at >= …` queda como `Filter`, correcto: el índice no lo incluye y no hace falta con 0–1 filas por clave) |
| rollback 42 | `drop index if exists public.idx_messages_org_client_request_id;` | n/a (el índice no existe en producción; tras el rollback del dry-run, `pg_indexes` = 0) |
| `crm_v4_f00_41` pg_cron | idéntica a r3 (`schedule.ts` ↔ SQL atado por test de `testerR3`) | 17 ⇒ `*/2 * * * *`, 19 ⇒ 4 kinds, `active=false`; el rollback los devuelve a `* * * * *` / 2 kinds carácter a carácter |

## Mutation testing

Restauración por copia y verificación md5 (baselines en el scratchpad `tester-r4/md5-before.txt` y
`tester-r4b/md5-before.txt`). Comando por mutación: `TZ=UTC npx jest src/lib/jobs --silent`.

Tester anterior (logs `tester-r4/mutations/m1..m17.log`, todos con `md5 ok`):

| # | Mutación | Resultado | Tests rojos |
|---|---|---|---|
| M1 | `whatsapp` sin la 2.ª comprobación de `signal` | muerta | 3 |
| M2 | `whatsapp` consulta fallida ⇒ `previo = null` (envía) | muerta | 3 |
| M3 | `outboundService` `findByClientRequestId` traga el error | muerta | 5 |
| M4 | `jobsService` `retried_from = job.id` siempre | muerta | 2 |
| M5 | `canViewJobs` sin `STAGE_MANAGER_ROLE_IDS` | muerta | 6 |
| M6 | `canRetryJobs = canViewJobs` | muerta | 4 |
| M7 | `permissionSubject` `isSuperAdmin: true` | muerta | 15 |
| M8 | `email` sin `.eq('organization_id')` en la pertenencia | muerta | 3 |
| M9 | `email` error de pertenencia ignorado | muerta | 1 |
| M10 | `email` sin la 2.ª comprobación de `signal` | muerta | 2 |
| M11 | `runner` sin espera entre intentos de `fn_complete_job` | muerta | 2 |
| M12 | `runner` espera sin guarda de deadline | muerta | 1 |
| M13 | `scheduler` sin `exhausted()` antes de la 1.ª consulta | muerta | 4 |
| M14 | `scheduler` sin `exhausted()` tras seleccionar | muerta | 1 |
| M15 | `scheduler` `perTask <= 0` ⇒ `< 0` | muerta | 2 |
| M16 | `orgContext` RPC con error ⇒ concede | muerta | 2 |
| M17 | `orgContext` `data === true` ⇒ `!!data` | muerta | 1 |

Esta ronda (logs `tester-r4b/mutations/m18..m27.log`):

| # | Mutación | Archivo | Resultado | Tests rojos |
|---|---|---|---|---|
| M18 | `whatsapp` ignora `retried_from` en la clave (la que quedó huérfana) | `handlers/whatsapp.ts:36` | muerta | 7 (builderR3 ×2, testerR3 ×2, testerR4 ×1, testerR4Cadena ×2) |
| M19 | `GET route.ts` sin `await` en `canViewJobs` (promesa truthy ⇒ todos ven) | `api/crm/jobs/route.ts:21` | muerta | 3 |
| M20 | `retry/route.ts` sin `await` en `canRetryJobs` (todos reintentan) | `[id]/retry/route.ts:25` | muerta | 6 |
| M21 | `email` despacha aunque la fila no pertenezca a la org (`if (!owned)` ⇒ `if (false)`) | `handlers/email.ts:60` | muerta | 2 |
| M22 | `COMPLETE_RETRY_DELAY_MS = 0` | `runner.ts:62` | muerta | 1 (testerR3Runner Δt ≥ 300) |
| M23 | vuelve `Math.max(1_000, …)` por tarea F11 | `scheduler.ts:185` | muerta | 3 |
| M24 | `retried_from` hereda cualquier tipo (`??` en vez de `typeof string`) | `jobsService.ts:239` | muerta | 4 — **la restauración por `cp` no surtió efecto** (archivo bloqueado en Windows; mtime = hora de la mutación); restaurado a mano con `perl`, md5 = baseline `753b1fd0…` |
| M25 | `hasOrgAdminOrPermission` sin guarda `!ctx.userId || !ctx.organizationId` | `orgContext.ts:318` | muerta | 8 en la 1.ª pasada (contaminada por M24 viva); **6** repetida limpia (M25b) |
| M26 | `retry/route.ts` sin `readOrgBody` (body con otra org pasa) | `[id]/retry/route.ts:24` | muerta | **1** (solo `testerR4Cadena` «org AJENA en el body ⇒ 403»; repetida limpia M26b: 1) — cobertura delgada, la regla 5 en esta ruta la sostiene un único test |
| M27 | `whatsapp` ignora el previo (`if (previo)` ⇒ `if (false)`: siempre envía) | `handlers/whatsapp.ts:55` | muerta | 7 |

**27/27 muertas** (17 heredadas + 10). md5 final de los 8 archivos = baseline (`md5sum -c … : OK` ×8).
Aviso de proceso: en dos de las 28 restauraciones de esta ronda (M18 del tester anterior por apagado; M24
por `cp` sin efecto) el árbol quedó mutado; ambas se detectaron por md5/diff y se corrigieron. Los scripts
de mutación de r5 deben restaurar en `trap EXIT` con escritura verificada (el `rerun.sh` de esta ronda lo hace).

## Resultados de suites y herramientas

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/lib/services/crm/__tests__/jobsService src/__tests__/guardrails.test.ts` | **19 suites / 277 tests verdes** (198 en `src/lib/jobs` + 79 `guardrails`; el patrón `services/crm/__tests__/jobsService` no casa con nada: `jobsService.test.ts` vive en `src/lib/jobs/__tests__`). Una primera pasada dio 8 rojos de permisos: `orgContext.ts` estaba mutado por **otro agente en paralelo** (mtime 23:45:06, md5 = baseline al terminar); repetida con `md5sum -c` antes y después ⇒ 277/277 |
| `TZ=America/Bogota npx jest …` (mismo patrón) | **19 suites / 277 tests verdes** |
| `npx jest src/__tests__/guardrails.test.ts` | **79/79** (caso 18 verde) |
| `TZ=UTC` / `TZ=America/Bogota` `npx jest src/lib/jobs/__tests__/testerR4.test.ts …/testerR4Cadena.test.ts` (tras corregir tipos) | 29/29 en ambas |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p <tsconfig acotado al alcance: src/lib/jobs/**, api/crm/jobs/**, jobsService.ts, JobsMonitor.tsx, JobsTable.tsx, src/types/**>` | **exit 0, 0 errores** (antes de corregir: 13 errores TS7006/TS7022/TS2493 en `testerR4.test.ts` ×7 y `testerR4Cadena.test.ts` ×6 — ver N-6) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "src/lib/jobs\|jobsService\|api/crm/jobs\|JobsMonitor\|JobsTable"` | **0** en JOBS (grep vacío). Compilación completa: exit 2 con 11 errores ajenos — 7 en `.next/types/app/api/**` (tipos generados por un `next build` concurrente de otro agente; no existen fuera de `.next`), `FormularioEdicionProducto.tsx` ×2, `deliveryIntegrationService.ts` ×1 (preexistentes, estado conocido) y `src/lib/security/__tests__/testerR2CD.f0sec.test.ts:277` ×1 (F0-SEC, ajeno). Nota: el primer intento tardó 41 min sin terminar por cuatro `tsc` completos simultáneos de distintos agentes; se relanzó y acabó en ~4 min |
| `npx eslint` sobre los 3 archivos `testerR4*.test.ts` | limpio |
| BD `select status, count(*), max(created_at) from outbound_jobs group by status` | `done` 476 (último 2026-09-16 03:21 UTC), `failed` 6 (último 2026-09-10) |
| BD `outbound_jobs` desde 2026-09-15 por `kind,status` | `crm_event/done` 5, `recording_cleanup/done` 84 (productor viejo: el código r3/r4 no está desplegado) |
| BD `cron.job` 17/18/19 | `active=false` ×3; 17 `* * * * *` (`fn_crm_cron_post('/api/crm/jobs/run')`, sin body); 18 `*/5` `campaign_batch`; 19 `30 8` `recording_cleanup,maintenance` |
| BD `messages` | 259 061 filas; 0 con `client_request_id`; sin índice sobre `metadata` (`idx_messages_*` ×10 + pk) |
| BD `organizations` / `permissions` | 84/84 `America/Bogota`; `admin.full_access` existe; ningún `crm.jobs.*` |
| BD dry-run 42 (`begin; create index …; explain …; rollback;`) | 1 133 ms; `Index Scan using idx_messages_org_client_request_id`; tras rollback `pg_indexes` = 0 |
| BD dry-run 41 + rollback 41 (una transacción, `rollback` final) | 17 `*/2` / 19 4 kinds ⇒ 17 `* * * * *` / 19 2 kinds; `cron.job` intacto después |

Tests añadidos por el tester r4 (mocks, sin datos reales ni nombres de clientes):
- `src/lib/jobs/__tests__/testerR4.test.ts` (18, del tester anterior, verificados): idempotencia vista desde
  el runner, `whatsappJobClientRequestId`, orden de guardas en `email`, permisos en las rutas con
  `check_user_permission` mockeada, presupuesto F11, trazabilidad.
- `src/lib/jobs/__tests__/testerR4Outbound.test.ts` (3, del tester anterior, verificados): `sendWhatsApp`
  real con la harness de F16: consulta fallida ⇒ ni créditos ni INSERT; previo ⇒ `duplicate`; feliz.
- `src/lib/jobs/__tests__/testerR4Cadena.test.ts` (11, nuevos): cadena `retryJob` → runner → `whatsapp`
  (3.ª generación, `clientRequestId` explícito, `retried_from: ''`, `payload: null`, camino feliz);
  `POST …/retry` con org ajena en body (403 sin service client) / misma org / rol 4; `email` desde el runner
  (abort a mitad, feliz); coherencia estática consulta ↔ índice 42 y rollback sin credenciales.

## Cobertura no probada

- Concurrencia real de dos runners (`SKIP LOCKED`) y reclaim de 10 min: solo por definición de las RPC.
- `sendWhatsApp` contra proveedor real / `trg_channel_dispatch`; la carrera entre `findByClientRequestId` y
  el INSERT (sin índice único sobre la clave) sigue sin prueba: el índice 42 no es `UNIQUE` y no la cierra.
- `JobsMonitor`/`JobsTable` en navegador (sin cambios en r4; `git status` limpio en esos archivos).
- HTTP real contra `next dev`/Vercel: el código r4 no está desplegado (el 09-15 en BD siguen 84
  `recording_cleanup` del productor viejo; 5 `crm_event`).

## Calificación de robustez: 9,0/10

Sube desde 8,5 (r3) porque los cinco puntos del QA r3 tienen corrección real y comprobada de tres formas:
código (archivo:línea), tests que la ejercitan de punta a punta (cadena `retryJob` → runner → handler con
`findByClientRequestId` real; rutas con `check_user_permission` mockeada; `sendWhatsApp` real de F16) y
27/27 mutaciones muertas con md5 verificado. La idempotencia de `whatsapp` ya es fail-closed en los dos
sitios donde se decide (handler y F16), la clave sobrevive a N generaciones de retry, `signal` se mira antes
de cada efecto, los permisos salen de un solo criterio resuelto en la BD (fail-closed, sin ids ni nombres
cableados, el `await` de las rutas probado por mutación) y el presupuesto del productor no gasta nada con
el total agotado. La migración 42 no es solo texto: el dry-run demuestra 1,1 s de bloqueo y que el
planificador usa el índice con el predicado elegido.

No llega a 9,5 por lo que sigue abierto y no es de esta ronda: `signal` no llega al `fetch` del proveedor
(un abort durante el envío depende de la idempotencia, y la de `whatsapp` caduca a los 7 días y no tiene
índice único: la carrera `findByClientRequestId`/INSERT sigue sin cerrarse); concurrencia real de dos
runners y reclaim sin prueba contra BD; un cargo solo entra con `admin.full_access` (sin `crm.jobs.view`);
y dos guardas importantes las sostiene **un único test** (M26 `readOrgBody` en retry, M22 la espera de
`fn_complete_job`). Los incidentes de proceso (mutación huérfana, `cp` sin efecto, mutaciones ajenas en el
árbol) no restan al código, pero sí obligan al orquestador a verificar `git diff` + md5 antes de encadenar
agentes.
