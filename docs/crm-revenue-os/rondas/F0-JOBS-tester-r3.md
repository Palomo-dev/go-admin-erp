# F0-JOBS — Tester — Ronda 3 — 2026-09-15

Alcance: cola/outbox (`src/lib/jobs/**`), `/api/crm/jobs/**`, `jobsService.ts`, `JobsMonitor`/`JobsTable`,
guardarraíl 18, migración pendiente `crm_v4_f00_41` (+ rollback) y `cron.job`/`outbound_jobs` en BD.
Insumos: `F0-JOBS-builder-r3.md`, `F0-JOBS-qa-r2.md` (puntos 1–6), `F0-JOBS-tester-r2.md`.
BD: solo `SELECT` por MCP (proyecto `jgmgphmzusbluqhuqihj`); la migración **no se aplicó**. Sin commits.
Nada de prueba quedó en el árbol salvo los dos tests nuevos (abajo); scripts de mutación en el scratchpad.

## Resumen

- Los 6 puntos del QA r2 tienen corrección verificable en código y en tests: **5 resueltos, 1 parcial**
  (punto 2, `signal`: los handlers de envío solo miran la señal **al entrar**; un abort a mitad no cancela
  nada, y la idempotencia de `whatsapp` depende de una consulta que traga errores).
- Suites: `TZ=UTC` y `TZ=America/Bogota` ⇒ **14 suites / 147 tests verdes** (111 del builder + 36 del
  tester r3, 2 de ellos `it.failing` que documentan huecos). `guardrails.test.ts` **73/73**. `tsc` con heap
  8 GB: **0 errores en archivos de JOBS**.
- Mutation testing: **16/16 mutaciones muertas** (restauración byte a byte verificada por md5). Seis de ellas
  mueren por **un solo** test (M1, M7, M8, M10, M14, M16): la cobertura es correcta pero delgada en la ruta.
- Producción (evidencia real): `outbound_jobs` = `done` 475, `failed` 6 (residuos N-5), 0 `queued|running|dead`;
  `cron.job` 17/18/19 siguen `active=false` con las definiciones **exactamente** iguales a las que el
  rollback restaura (17 `* * * * *`, 19 `recording_cleanup,maintenance`). El código r3 aún no está
  desplegado: el 09-15 se crearon **84** `recording_cleanup` (productor viejo).
- Las 84 organizaciones están en `America/Bogota`, así que los huecos de zona (T-7, T-8) no muerden hoy.

## Verificación de los 6 puntos del QA r2

| # | Punto QA | Estado | Evidencia (archivo:línea) y prueba |
|---|---|---|---|
| 1 | N-1/N-6 presupuesto y selectividad | **Resuelto** | `scheduler.ts:220-275` (`deadlineAt`, `exhausted()`, `truncated`/`pending_org_ids`), `:205-218` (∩ `comm_settings.is_active`), `run/route.ts:404-425` (`totalBudgetMs: 48_000`, `budget_exhausted`, sin `Math.max(2_000)`). Tests: `scheduler.test.ts:185,203`, `runRoute.test.ts:108,125`; tester r3 `testerR3.test.ts` «aborto EXTERNO a mitad del bucle» (40 orgs × 20 ms, abort a 130 ms ⇒ 5–7 encoladas, `pending_org_ids` = resto en orden, **0 enqueues tras el abort**), «budgetMs SIN signal» (el reloj propio corta), mutaciones M2/M7/M8/M9/M10 muertas. Residuos: T-3, T-4, T-5 |
| 2 | N-4 `complete_failed` + envíos idempotentes + `signal` | **Parcial** | Runner `runner.ts:378-405`: `try` separado, reintento único, `fn_fail_job(-1)` ⇒ `failed` terminal `complete_failed:`; tester r3 `testerR3Runner.test.ts` «handler OK + fn_complete_job falla 2 veces» simula la BD y comprueba que en la **siguiente invocación** el claim ya no lo devuelve (handler 1 vez, `retried:0`, `queued` nunca); `data:false` ⇒ `complete_ignored` sin `fn_fail_job`; M4/M6 muertas. `whatsapp.ts:38-43` idempotente por `job:{id}` con `findByClientRequestId` **real** sobre un store en memoria: dos ejecuciones ⇒ 1 `sendWhatsApp`; retry `retried_from` ⇒ skipped; M3/M15 muertas. **Pero**: `signal` solo se lee al entrar (`whatsapp.ts:36`, `email.ts:78`, `transcribe.ts:133`); ver T-1, T-2, T-6 |
| 3 | N-3 contrato único de scheduling | **Resuelto** | `schedule.ts:298-317`; `run/route.ts:281,393`; `JobsMonitor.tsx:10,85,107,146` (`DRAIN_INTERVAL_MIN`); `jobsService.ts:150` (`queuedOverdue`); guardarraíl 18 (`guardrails.test.ts:948-985`) verde 4/4; FASE-00 `:70,:114,:130,:831,:1484` a `*/2`. Migración: ver §Migración |
| 4 | F-6 `canViewJobs` | **Resuelto (con matiz)** | `jobsService.ts:29,37-39`: `roleId === 5`. Tests `jobsService.test.ts:23`, tester r3: coincide con `STAGE_MANAGER_ROLE_IDS` para role_id 1..5 y 9; M13 muerta. Matiz T-9: constante duplicada y `isOrgAdminLike` sigue concediendo por **nombre** |
| 5 | N-7 fechas por zona de la org | **Resuelto** | `orgTimezone.ts:276-278` (`orgDay` = `toPlainDate`/`todayInTz`), `recordingCleanup.ts:179,185`, `scheduler.ts:254-260`, `JobsTable.tsx:38-42` (`useFormatDate().formatDateTime`). Tester r3: borde de medianoche 04:59:59Z ⇒ `2026-09-15` en Bogotá / `2026-09-16` en UTC; 05:00:00Z ⇒ `16`; Kiritimati (+14) y Pago_Pago (−11); productor a 08:30Z ⇒ clave `…:2026-09-15` (Bogotá) y `…:2026-09-14` (Pago_Pago); test estático: ningún `toISOString().slice(0,10)`/`split('T')` en `src/lib/jobs/**`; M11/M12 muertas. Residuo T-7 (selección por día UTC fuera de las 08:30) |
| 6 | N-8 `Set` de ids ejecutados | **Resuelto** | `runner.ts:283,321-333,420`. Tester r3: id repetido **dentro del mismo lote** ⇒ segundo liberado y el resto del lote sigue (`claimed:2, done:2, released:1`); `fn_release_job` con error real ⇒ `released:0`, sin fallback UPDATE, bucle termina, un solo `fn_fail_job`; el `Set` es por invocación (dos `runJobs` seguidos ⇒ 2 ejecuciones, correcto); M5 muerta |

## Fallos nuevos (r3), con pasos reproducibles

### T-1 [medio] `signal` solo se comprueba al entrar: un abort a mitad no detiene el envío
- `whatsapp.ts:36` mira `signal.aborted` antes de `findByClientRequestId` (`:39`) y nunca más; `sendWhatsApp`
  (`:46`) no recibe la señal. `email.ts:78` y `transcribe.ts:133` igual (`dispatchScheduledEmail`,
  `runTranscribePipeline` sin `signal`).
- Test: `testerR3.test.ts` «signal a MITAD del handler»: `it.failing` whatsapp (abort durante la consulta de
  la clave ⇒ `sendWhatsApp` **sí** se invoca), `it.failing` email (abort tras la comprobación ⇒ **envía**),
  y dos `it` que prueban que ni `sendWhatsApp` ni `runTranscribePipeline` reciben `signal`.
- Efecto real: `testerR3Runner.test.ts` «handler que tarda más que jobTimeoutMs»: el runner marca
  `queued` (`timeout after 30ms`) y el handler no cooperativo produce el efecto **después**, con
  `signal.aborted === true` ⇒ el siguiente drenaje repite el efecto. Para `whatsapp` lo salva la clave
  `job:{id}` (T-2 aparte); para `transcribe` lo salva `call_transcripts` salvo `force`; `email` batch
  depende de `status_sent`.
- El informe del builder dice «signal respetado» y el QA pedía «cooperativos con signal»: solo es cierto
  como «no se inicia un envío ya abortado».

### T-2 [medio] La idempotencia de `whatsapp` cae a «no enviado» si la consulta falla, y caduca a los 7 días
- `outboundService.ts:265-279` (`findByClientRequestId`): `const { data } = …` — **descarta `error`**. Un
  `statement timeout` o un corte de red devuelven `null` ⇒ `whatsapp.ts:45` envía otra vez.
  `sendWhatsApp:196` repite la misma consulta con el mismo problema. No hay índice sobre
  `metadata->>client_request_id` en `messages` (258 875 filas; verificado `pg_indexes`), así que la
  consulta recorre `idx_messages_organization` y filtra en memoria: justo la que más fácil agota tiempo.
- Ventana `CLIENT_REQUEST_ID_WINDOW_MS` = 7 d: un retry manual de un `failed` de hace 8 días vuelve a enviar.
- Tests: «HUECO: si la consulta de idempotencia FALLA…» (store con `failSelect` ⇒ `sendWhatsApp` 1 vez,
  `message_id: m-dup`) y «HUECO: la ventana… 8 días ⇒ vuelve a enviar». Es código de F16, pero el
  contrato de N-4 se apoya en él; como mínimo el handler debería tratar `error` como `JobRetryableError`.
- Además el cruce con `retryJob` (`jobsService.ts:219`): un **retry de un retry** sobreescribe
  `retried_from` con el id intermedio ⇒ la clave de la 3ª generación es `job:{job-2}`, no `job:{job-1}`
  (test «retry de un retry»). Rara, pero rompe la promesa «un retry nunca es un segundo envío».

### T-3 [bajo] Con presupuesto 0 / señal ya abortada el productor sigue haciendo 3 consultas
- `scheduler.ts:230-243`: `selectOrgsWithExpiredRecordings` (2 round-trips) y `loadOrgTimezones` (1) se
  ejecutan **antes** de la primera llamada a `exhausted()` (`:249`). Con `maintenance` habiendo agotado
  el total, el encolado aún gasta ~200 ms en producción. Test «HUECO: con presupuesto 0 y signal YA
  abortada…» (`queries` = `['comm_settings','call_recordings','organizations']`).

### T-4 [bajo] Las tareas F11 reciben mínimo 1 000 ms cada una aunque el total esté agotado
- `scheduler.ts:174` `Math.max(1_000, remainingFor(…))`. Test «HUECO: cada tarea F11 recibe al menos
  1 000 ms…»: `totalBudgetMs: 300` ⇒ el productor tarda **> 2 000 ms**. En la ruta: 48 s + ~2 s = 50 s ⇒
  `remaining ≈ 0` ⇒ `budget_exhausted`; no mata la función (60 s) pero vacía el margen que N-1 quería.

### T-5 [bajo] `pending_org_ids` no se persiste: «van primero al día siguiente» es falso
- `run/route.ts:339-340` y §13 lo prometen; `scheduler.ts:216` ordena por id ascendente y nada guarda
  los pendientes. Con truncado recurrente las mismas orgs (ids altos) quedan fuera cada día. Test
  «HUECO: pending_org_ids no se persiste…» (dos días con el mismo presupuesto ⇒ misma cola de pendientes).
  Hoy irrelevante (1 org con grabaciones), pero es exactamente el crecimiento que N-1 anticipa.

### T-6 [bajo] El reintento de `fn_complete_job` es inmediato
- `runner.ts:383-390`: dos intentos sin espera. Un blip de red de milisegundos convierte un job **exitoso**
  en `failed` terminal (`complete_failed`), que además cuenta como `failed` en `JobsMonitor`. Test «el
  reintento de fn_complete_job es INMEDIATO» (`Δt < 50 ms`). Un `await sleep(250–500)` entre intentos
  reduciría los falsos terminales.

### T-7 [bajo] La selección «por día UTC es superconjunto» solo vale a las 08:30 UTC
- `scheduler.ts:196-206`: a las 23:00 UTC una org en `Asia/Tokyo` ya está en el día siguiente; una
  grabación con `retention_until = díaUTC` vence para ella pero `lt('retention_until', díaUTC)` no la
  selecciona. Afecta a `?kind=recording_cleanup` manual y a pg_cron si alguien cambiara la hora. Test
  «selección por día UTC: a las 23:00 UTC…» (clave `…:2026-09-16` vs filtro `< 2026-09-15`). Sin impacto
  hoy (todas las orgs en Bogotá; cron a 08:30 UTC).

### T-8 [info] Fallback silencioso de zona en el productor
- `scheduler.ts:238-243`: si `loadOrgTimezones` falla, **todas** las orgs se encolan con `DEFAULT_TIMEZONE`
  y un único `warn`; correcto como degradación, pero la clave diaria puede diferir de la del handler (que
  vuelve a consultar). Con dedupe solo sobre `queued|running` puede producir dos jobs el mismo día para una
  org fuera de Bogotá. Documentar o encolar con la misma zona que resolverá el handler.

### T-9 [info] `canViewJobs`: constante duplicada y nombre de rol por la puerta de atrás
- `jobsService.ts:29` `MANAGER_ROLE_ID = 5` duplica `STAGE_MANAGER_ROLE_IDS = [1,2,5]`
  (`stagePermissions.ts:35`), que es lo que usan contratos, comisiones, F12 y el dashboard. Regla 7.
- `canRetryJobs` → `isOrgAdminLike` (`orgAdmin.ts:26-31`) concede por `ORG_ADMIN_ROLE_NAMES`: test
  «HUECO (regla 6)»: `{roleId:9, roleName:'Admin de organización'}` ⇒ ver **y reintentar**. Es el helper
  canónico del repo, así que no es del builder; pero el comentario de `jobsService.ts:24-27` («NUNCA por el
  nombre del rol») no es cierto. En BD `roles` es global (5 filas `is_system`, sin `organization_id`), luego
  hoy nombre e id son equivalentes. Un «cargo» (`job_position_permissions`) con permiso de ver jobs queda
  fuera, igual que en el resto de rutas del CRM: nadie lee esa tabla en servidor (solo cliente).

## Migración pendiente `crm_v4_f00_41` (revisada, NO aplicada)

- Sintaxis: `do $$ … $$` con `perform cron.alter_job(job_id => …, schedule|command => …)`; la firma real
  en BD es `cron.alter_job(job_id, schedule, command, database, username, active)` (el builder la
  verificó; los nombres de parámetro coinciden). El cuerpo del 19 usa `$cmd$…$cmd$`, válido dentro de `$$`.
- Idempotente: guardada por `jobid` **y** `jobname`; repetirla no cambia nada. Si alguien renombró el job,
  la migración queda sin efecto en silencio (aceptable, pero conviene la SELECT de verificación).
- No activa nada: sin `active =>` fuera de comentarios; no toca el 18. **Coincide con el informe** y con
  `schedule.ts`: 17 → `'*/2 * * * *'` = `DRAIN_SCHEDULE`; 19 → los 4 kinds en el mismo orden que
  `VERCEL_SCHEDULE_KINDS['30 8 * * *']` (test «migración pendiente ↔ schedule.ts», que además fallará si
  alguien cambia `schedule.ts` sin tocar el SQL).
- Rollback: devuelve 17 a `'* * * * *'` y 19 a `{"kinds":["recording_cleanup","maintenance"]}`; verificado
  contra `cron.job` **actual** (comando y schedule idénticos carácter a carácter). No toca `active`.
- Sin credenciales ni nombres de organizaciones cliente en ninguno de los dos `.sql`.
- Observación: el `jobname` `crm-jobs-every-minute` quedará mintiendo tras pasar a `*/2`; cosmético.

## Mutation testing (16 mutaciones a mano, `npx jest src/lib/jobs`, restauración por md5)

| # | Mutación | Resultado | Tests que la matan |
|---|---|---|---|
| M1 | `whatsapp.ts` quitar `if (signal.aborted)` | muerta | 1 (builderR3) |
| M2 | `scheduler.ts` `truncated = false` | muerta | 6 |
| M3 | `whatsapp.ts` quitar `clientRequestId` del envío | muerta | 3 |
| M4 | `runner.ts` `complete_failed` con `retryable: true` | muerta | 2 |
| M5 | `runner.ts` quitar el `Set` (N-8) | muerta | 5 |
| M6 | `runner.ts` sin reintento de `fn_complete_job` | muerta | 4 |
| M7 | `route.ts` drenar aunque `remaining < 2 s` | muerta | 1 (runRoute) |
| M8 | `route.ts` no pasar `totalBudgetMs` | muerta | 1 (runRoute) |
| M9 | `scheduler.ts` `exhausted() ⇒ false` | muerta | 6 |
| M10 | `scheduler.ts` sin cruce con `comm_settings.is_active` | muerta | 1 (scheduler) |
| M11 | `recordingCleanup.ts` cutoff en UTC | muerta | 2 |
| M12 | `scheduler.ts` clave diaria en UTC | muerta | 3 |
| M13 | `jobsService.ts` `roleName === 'Manager'` | muerta | 2 |
| M14 | `runner.ts` array ⇒ `p_result` (N-9) | muerta | 1 (testerR2Runner) |
| M15 | `whatsapp.ts` ignorar `retried_from` | muerta | 4 |
| M16 | `email.ts` quitar `if (signal.aborted)` | muerta | 1 (builderR3) |

**16/16 muertas.** md5 de los 7 archivos mutados idéntico antes y después
(`runner.ts`, `scheduler.ts`, `whatsapp.ts`, `email.ts`, `recordingCleanup.ts`, `run/route.ts`, `jobsService.ts`).

## Resultados de suites y herramientas

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs` | 14 suites / **147** tests verdes |
| `TZ=America/Bogota npx jest src/lib/jobs` | 14 suites / **147** tests verdes |
| `npx jest src/__tests__/guardrails.test.ts` | **73/73** (caso 18: 4/4) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json \| grep -E "lib/jobs\|crm/jobs\|JobsMonitor\|JobsTable"` | **0 líneas** (0 errores en JOBS) |
| BD `cron.job` 17/18/19 | `active=false` los tres; 17 `* * * * *` sin body; 18 `*/5` `campaign_batch`; 19 `30 8` `recording_cleanup,maintenance` — idéntico a lo que asume el rollback |
| BD `outbound_jobs` por status | `done` 475 (último `created_at` 2026-09-15 23:22 UTC), `failed` 6 (org 125, 2026-09-10), 0 `queued|running|dead` |
| BD 2026-09-15 | `recording_cleanup` **84** `done` (código r2 desplegado, aún no r3), `crm_event` 4 |
| BD `organizations.timezone` | 84/84 `America/Bogota` |
| BD `messages` | 258 875 filas; **sin índice** sobre `metadata->>client_request_id` |
| BD `roles` | 5 roles de sistema globales (1 Super Admin · 2 Admin de organización · 3 Cliente · 4 Empleado · 5 Manager); activos: 93 rol 2, 42 rol 4, **1** rol 5 |

Tests añadidos (mocks, sin datos reales): `src/lib/jobs/__tests__/testerR3Runner.test.ts` (11) y
`src/lib/jobs/__tests__/testerR3.test.ts` (25; 2 `it.failing` para T-1 que se pondrán rojos —«expected to
fail»— cuando el builder cierre el hueco, y entonces deben pasar a `it`). Ningún `.sql` ni archivo temporal
quedó en el árbol.

## Cobertura no probada

- HTTP real contra `next dev` / Vercel Cron: solo el módulo de la ruta con `NextRequest`; el código r3 no está
  desplegado, así que no hay evidencia en BD del productor selectivo ni de `budget_exhausted`.
- Concurrencia real de dos runners (`SKIP LOCKED`) y el reclaim de 10 min: solo por definición de las RPC.
- `sendWhatsApp` real (créditos, `trg_channel_dispatch`): mockeado; la carrera entre `findByClientRequestId`
  y el INSERT (sin índice único) sigue sin prueba.
- `JobsMonitor`/`JobsTable` en navegador (solo lectura estática de `useFormatDate` y `DRAIN_INTERVAL_MIN`).
- La migración no se ejecutó (ni en rama): revisión estática + comparación con `cron.job`.

## Calificación de robustez: 8.5/10

Sube desde 7,5 porque los seis puntos del QA tienen corrección real y verificable, el runner cierra el
doble-efecto de `complete_failed` de forma terminal, el productor tiene presupuesto de verdad (abortos
externos e internos probados), las fechas salen de la zona de la org en todos los bordes probados, la suite
está verde en los dos TZ con 147 tests y las 16 mutaciones mueren. No llega a 9 por T-1 (la cancelación
cooperativa que N-4 pedía no existe: la señal solo evita *iniciar* un envío) y T-2 (la idempotencia de
`whatsapp` descansa en una consulta sin índice que trata un error como «no enviado» y caduca a los 7 días),
y por los residuos de presupuesto T-3/T-4/T-5 que reaparecerán cuando haya más de una org con grabaciones.
