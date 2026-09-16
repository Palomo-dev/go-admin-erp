# F0-JOBS — QA-reviewer — Ronda 2 — 2026-09-15

Insumos: `F0-JOBS-tester-r2.md` (7,5/10; 152 casos, 150 pasan), entradas «F0-JOBS r1/r2» de
`PROGRESS.md`, FASE-00 §2.2, §2.3, §4.4 y §13 (r2). Verificación propia (sin escribir código):
`src/lib/jobs/**`, `src/app/api/crm/jobs/run/route.ts`, `jobsService.ts`, `JobsMonitor`/`JobsTable`,
`vercel.json`; BD solo `SELECT` por MCP (`cron.job`, `outbound_jobs`, `fn_complete_job`,
`call_recordings.retention_until`); suites con `TZ=UTC` y `TZ=America/Bogota`.

## Verificación ejecutada por QA (2026-09-15, árbol de trabajo actual)

| Qué | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs` | **11 suites / 85 tests verdes** |
| `TZ=America/Bogota npx jest src/lib/jobs` | **11 suites / 85 tests verdes** (N-2 del tester ya no reproduce: `renewalMilestones.ts` se modificó a las 17:26, después del re-test de las 16:54; el F11 builder lo corrigió en paralelo) |
| `npx jest src/__tests__/guardrails.test.ts` | **67/67** (el rojo de `inicio/page.tsx` que vio el tester también desapareció) |
| BD `cron.job` 17/18/19 | los tres `active=false`; 19 pide `recording_cleanup,maintenance` (sin `health_recalculate`/`renewals_sync`) |
| BD `outbound_jobs` kind `recording_cleanup` 09-11…09-15 | 83–84 jobs/día; primer `created_at` 08:30:28–29; encolar 84 orgs tarda **7,4–10,2 s**; último `done` 08:30:51–56 ⇒ la invocación diaria vive **52–57 s** de un `maxDuration=60` |
| BD `call_recordings` | **1** org con grabaciones; `comm_settings.is_active` = 84; 0 jobs `recording_cleanup` con `deleted>0` (N-6 confirmado: 83 de 84 jobs diarios son ruido) |
| BD `retention_until` | tipo `date` ⇒ comparar con el día de la **organización**, no con el día UTC (N-7) |
| BD `fn_complete_job` | `UPDATE … WHERE status='running' AND locked_by=p_worker`; devuelve `false` si el lock no es nuestro (N-4 confirmado en el flujo del runner) |

## Calificación: 7.5/10

Dimensiones (2 pts c/u): funcionalidad 1,6 · robustez 1,3 · consistencia 1,5 · tester 1,7 ·
documentación/trazabilidad 1,4.

### Fortalezas
- Los diez fallos de r1 tienen corrección verificable en código, RPC y BD; el runner es fail-closed
  en todos los caminos (sin `CRON_SECRET`, secreto vacío, prefijo/sufijo, `?token=`) y nunca lanza.
- Kinds inválidos ⇒ 400 en la ruta y `claimed:0` en el runner; liberación por deadline con
  `fn_release_job` sin quemar intentos ni pisar `last_error`; `noop` en el CHECK; grants de las 7 RPC
  solo a `service_role`.
- La suite completa de JOBS (85 tests, incluidos los 26 del tester r2) está verde en los **dos** TZ
  obligatorios, y `guardrails.test.ts` 67/67. Cola de producción sana (0 `running` atascados, 0
  `queued` vencidos).
- El productor programado existe y corre en producción desde el 09-11 (evidencia real en BD).
- Redacción de `payload_preview` por allow-list; retención de 30 d completa; resync acotado a 3.

### Problemas encontrados (ordenados por severidad)

1. [alto] **N-1 — El cron diario opera al 87–95 % de `maxDuration` y el productor de
   `recording_cleanup` no tiene presupuesto ni `signal`.** `scheduler.ts:152-182` encola hasta
   1 000 orgs con 84 RPC secuenciales (7–10 s) sin mirar el reloj; `run/route.ts:44-56` presupuesta
   20+12+12 s pero no cuenta el encolado, y `:119` entra a drenar con `Math.max(2_000, …)` aunque el
   límite ya esté superado. Con ~110 orgs activas (crece ≈1/día) Vercel matará la función: jobs
   `running` hasta el reclaim de 10 min (intento quemado) y tareas F11 cortadas sin resumen. Además
   (N-6) 83 de los 84 jobs son ruido: solo 1 org tiene `call_recordings`.
2. [alto] **N-4 — Doble ejecución del efecto tras un handler exitoso.** `runner.ts:292` lanza si
   `fn_complete_job` falla ⇒ `catch` de `:305` ⇒ `fn_fail_job(null)` ⇒ `queued` ⇒ el handler se
   ejecuta otra vez. Misma clase de fallo con el timeout de `:287-290`: `runWithTimeout` rechaza pero
   el handler sigue corriendo (ni `whatsapp.ts` ni `email.ts` ni `transcribe.ts` leen `signal`), y
   si termina después el job ya volvió a la cola. Exposición real: `handlers/whatsapp.ts:11-18`
   **no es idempotente**: el payload es `message_request` (no `{message_id}` como dice §4.4) y cada
   ejecución crea y envía un `messages` nuevo con `force:true`. `email` sí es idempotente
   (`dispatchScheduledEmail` salta `status!='pending' || provider_message_id`).
3. [medio] **N-3 — Schedulers divergentes y promesa «cada minuto» incumplida.** pg_cron 17/18/19
   `active=false` una semana después; Vercel a `*/2` (`vercel.json:9`, commit `9c0288a7`); latencia
   real media 39–56 s, máx 131 s. `cron.job` 19 no pide `health_recalculate`/`renewals_sync`
   (`VERCEL_SCHEDULE_KINDS` en `run/route.ts:60` sí): cuando se active pg_cron, F11 correrá solo
   desde Vercel o dos veces. `JobsMonitor.tsx:80` («≤1 min») y `:102` («Se drena cada minuto»),
   FASE-00 `:70`, `:128`, `:825` («los dos schedulers piden exactamente los mismos kinds» — falso),
   `:1232` siguen diciendo `* * * * *`.
4. [medio] **F-6 parcial — `canViewJobs` decide por nombre de rol.** `jobsService.ts:24,33`
   (`MANAGER_ROLE_NAMES.has(ctx.roleName)`) viola la regla 6 de CLAUDE.md; `roleId === 5` basta.
5. [medio] **N-7 — Día calendario derivado en UTC.** `scheduler.ts:66-68` (`dayKey`) y
   `handlers/recordingCleanup.ts:18` usan `toISOString().slice(0,10)` (equivalente al
   `split('T')[0]` prohibido, regla 1). `retention_until` es `date`: el `cutoff` debe salir de
   `todayInTz(getOrganizationTimezone(orgId))`. `JobsTable.tsx:31-34` (`fmtDate`) renderiza con
   `toLocaleString('es-CO')` sin `useFormatDate()` (regla 3).
6. [medio] **N-8 — `retryAfterSeconds: 0` re-encola sin backoff dentro de la misma invocación.**
   `runner.ts:110-112` + `fn_fail_job(0)` ⇒ `run_at=now()`; si el lote venía lleno el mismo job se
   reclama en el siguiente lote y puede agotar `max_attempts` en segundos.
7. [bajo] **N-5** — 6 jobs `failed` residuales de la org 125 (`event_not_found`, `entity_id`
   sintéticos `bbbbbbbb-…`) creados el 09-10 por un smoke ajeno; `maintenance` los purga el 10-10.
   **N-9** — `runner.ts:291` pasa un array a `p_result` como si fuera objeto. **N-10** —
   `run/route.ts:111` acepta `worker` del body sin sanear (acaba en `locked_by` y logs).
8. [bajo] **Trazabilidad** — la entrada «F0-JOBS r2» de `PROGRESS.md:1184` sigue con
   «Calificación QA: pendiente» y afirma «documentación y `JobsMonitor` alineados», lo que dejó de
   ser cierto tras `9c0288a7`. FASE-00 §13 (r2) no registra el cambio a `*/2` ni por qué.

### Qué falta para el 10 (si aplica)
- Concurrencia real de dos runners sobre la misma cola (`SKIP LOCKED`) probada, no solo por
  definición de la RPC.
- Handlers de envío (`whatsapp`, `email`, `transcribe`) cooperativos con `signal` y con `dedupe`
  por estado de la entidad, de modo que «reintento» nunca signifique «segundo envío».
- Un solo scheduler activo y documentado, con `pg_cron` 17/18/19 encendidos y `net._http_response`
  verificado, o bien la decisión explícita de que Vercel es el primario y pg_cron el respaldo.

### Veredicto
requiere-nueva-ronda

## Lista accionable para el builder (prioridad = orden)

1. **[alto] N-1 / N-6 — Presupuesto y selectividad del productor.**
   - `src/lib/jobs/scheduler.ts:152-182` (`enqueueRecordingCleanup`): recibir `signal` y `budgetMs`;
     cortar el bucle al agotarse y devolver `{ enqueued, orgs, truncated: true, pending_org_ids }`.
     Seleccionar solo orgs con trabajo: `select distinct organization_id from call_recordings where
     status='ready' and retention_until < <hoy>` (cruzado con `comm_settings.is_active`), en vez de
     las 84 activas. Alternativa aceptable: una RPC `fn_enqueue_recording_cleanup(p_day)` que encole
     en un solo round-trip (migración + rollback, sin aplicar hasta ver el SQL).
   - `src/app/api/crm/jobs/run/route.ts:116-123`: pasar el presupuesto al productor y, si al volver
     `Date.now()-started > TOTAL_BUDGET_MS - 2_000`, **no drenar** (`claimed:0`,
     `reason:'budget_exhausted'`); eliminar el `Math.max(2_000, …)` de `:119`.
   - Prueba: `scheduler.test.ts` — 120 orgs mockeadas con `enqueueJob` de 100 ms y `budgetMs:1_000`
     ⇒ `enqueued < 120`, `truncated:true`, ningún `enqueueJob` tras el aborto; `runRoute.test.ts` —
     productor que consume 49 s ⇒ `runJobs` **no** se invoca y la respuesta lleva `budget_exhausted`;
     `recordingCleanup`/scheduler — org sin `call_recordings` vencidas ⇒ no se encola.

2. **[alto] N-4 — `fn_complete_job` fallido no debe re-encolar; envíos idempotentes.**
   - `src/lib/jobs/runner.ts:286-316`: separar el `try` del handler del `try` de `completeJob`. Si
     el handler tuvo éxito y `fn_complete_job` lanza: reintentar la RPC una vez; si sigue fallando,
     **no** llamar a `fn_fail_job`; dejar el job `running` (lo rescata el reclaim) y contar
     `summary.completeFailed`, log `complete_rpc_error` con `job_id`.
   - `src/lib/jobs/handlers/whatsapp.ts:11-18` (coordinar con F16): el payload debe ser
     `{ message_id }` de una fila `messages` ya creada en `pending` (como manda §4.4), y el envío
     debe saltar si `status != 'pending'` o ya hay `provider_message_id`. Mientras F16 no lo cambie,
     como mínimo el handler debe comprobar por `dedupe_key`/`metadata.job_id` que no exista ya un
     `messages` enviado para ese job antes de llamar a `sendWhatsApp`.
   - `runner.ts:160-177`: documentar que el timeout es advisory y exigir `signal` en los handlers
     de envío (`whatsapp.ts`, `email.ts`, `transcribe.ts` no lo leen).
   - Prueba: `testerR2Runner.test.ts` «fn_complete_job lanza tras un handler EXITOSO» ⇒ cambiar la
     expectativa a `fn_fail_job` **no** llamado, `completeFailed:1`, `done:0`; nuevo test del handler
     `whatsapp`: segunda ejecución con el mismo `message_id` ya enviado ⇒ `{skipped:true}` y
     `sendWhatsApp` no invocado.

3. **[medio] N-3 — Un solo contrato de scheduling, consistente en código, BD, docs y UI.**
   - Decisión a registrar en `PROGRESS.md` y FASE-00 §2.2: Vercel primario a `*/2` (por el
     circuit-breaker de `9c0288a7`) y pg_cron respaldo, o al revés. Si se activan 17/18/19, el body
     del 19 debe ser `["recording_cleanup","maintenance","health_recalculate","renewals_sync"]`
     (migración `crm_v4_f00_17` + rollback, aplicada solo por el orquestador tras ver el SQL).
   - `src/components/crm/config/JobsMonitor.tsx:80,102`: sustituir «≤1 min»/«cada minuto» por una
     constante `DRAIN_INTERVAL_MIN` (2) leída del mismo módulo que `VERCEL_SCHEDULE_KINDS`.
   - FASE-00 `:70`, `:128`, `:825`, `:1232`: `*/2 * * * *` y quitar «piden exactamente los mismos
     kinds» (o hacerlo cierto).
   - Prueba: test de guardarraíl que lea `vercel.json` y compruebe que cada `schedule` de
     `/api/crm/jobs/run` es o bien el de drenaje total o una clave de `VERCEL_SCHEDULE_KINDS`, y que
     `DRAIN_INTERVAL_MIN` coincide con el `*/N` de drenaje total.

4. **[medio] F-6 — `src/lib/services/crm/jobsService.ts:24,33`**: eliminar `MANAGER_ROLE_NAMES`;
   `canViewJobs = canRetryJobs(ctx) || ctx.roleId === MANAGER_ROLE_ID`.
   Prueba: `jobsService.test.ts` — `{ roleName:'Manager', roleId:4 }` ⇒ `canViewJobs` **false**;
   `{ roleName:'x', roleId:5 }` ⇒ true.

5. **[medio] N-7 — Fechas por zona de la organización.**
   - `src/lib/jobs/handlers/recordingCleanup.ts:18`: `const today = todayInTz(await
     getOrganizationTimezone(orgId))` (helpers de `src/lib/utils/dateDisplay.ts`).
   - `src/lib/jobs/scheduler.ts:66-68`: si la clave diaria se mantiene en UTC por ser global,
     documentarlo en el comentario y en §4.4; el `payload.scheduled_for` debe ser el día de la org.
   - `src/components/crm/config/JobsTable.tsx:31-34`: `fmtDate` ⇒ `useFormatDate()` desde el
     componente (pasar el formateador como prop o convertir `fmtDate` en hook).
   - Prueba (`TZ=UTC` y `TZ=America/Bogota`): `handlers.test.ts` — con `now = 2026-09-16T03:00:00Z`
     y org en `America/Bogota` el `cutoff` es `2026-09-15`; el `.lt('retention_until', …)` mockeado
     recibe ese valor.

6. **[medio] N-8 — `src/lib/jobs/runner.ts:237-320`**: llevar un `Set` de ids ejecutados en la
   invocación; si `fn_claim_jobs` devuelve un id ya ejecutado, liberarlo con `fn_release_job` y
   terminar el bucle (el siguiente cron lo recoge). Prueba: `testerR2Runner` «retryAfterSeconds: 0»
   ampliado — el claim devuelve el mismo job en dos lotes ⇒ handler invocado **una** vez,
   `released:1`.

7. **[bajo] N-9 / N-10.** `runner.ts:291`: `Array.isArray(result) ? null : …`.
   `run/route.ts:111`: aceptar `worker` solo si cumple `/^[A-Za-z0-9._:-]{1,100}$/`; si no,
   `makeWorkerId()`. Prueba: `testerR2Route` «worker del body» ⇒ un worker con espacios/`\n` se
   ignora; `testerR2Runner` «array» ⇒ `p_result: null` explícito.

8. **[bajo] Trazabilidad.** Anexar (no reescribir) en `PROGRESS.md` la calificación QA r2 y en
   FASE-00 §13 una entrada «r3» con: decisión de scheduler, cambio a `*/2` (`9c0288a7`), el
   presupuesto real del cron diario medido en BD (29 s + 7–10 s + drenaje) y la lista de orgs
   residuales de N-5 (`org 125`, `bbbbbbbb-…`) para que el dueño decida si se borran antes del 10-10.

No bloquean pero conviene: verificar con el orquestador que `CRON_SECRET` está en Vercel (el Bearer
automático depende de ello) y leer `net._http_response` tras activar pg_cron.
