# F0-JOBS — Tester — Ronda 2 (re-test) — 2026-09-15

Alcance: cola/outbox (`src/lib/jobs/**`), `/api/crm/jobs/**`, `jobsService.ts`,
`JobsMonitor`/`JobsTable`, `vercel.json`, `middleware.ts`, RPC y `cron.job` en BD.
Base: PROGRESS.md «F0-JOBS r1» (6/10, F-1…F-10) y «F0-JOBS r2»; FASE-00 §2.2, §2.3, §4.4, §13 (r2).
BD: solo `SELECT` por MCP (proyecto `jgmgphmzusbluqhuqihj`). No se tocó nada. Sin commits.

## Resumen

- Los 10 fallos de r1 están atendidos: **8 resueltos, 2 parciales** (F-9 docs y F-10 UI
  volvieron a desalinearse por un cambio posterior en `vercel.json`).
- Suites: `npx jest src/lib/jobs` → **8/9 suites, 58/59 tests** (el rojo es
  `f11ScheduledTasks.test.ts`, depende del TZ del host: pasa con `TZ=UTC`, falla con
  `TZ=America/Bogota`). `guardrails.test.ts` → **66/67** (el rojo es la página `inicio`, ajeno).
  Tests nuevos del tester: **26/26** verdes (`testerR2Route.test.ts`, `testerR2Runner.test.ts`).
- Fail-closed del runner verificado: sin `CRON_SECRET` → 401 aunque el Bearer "coincida";
  `CRON_SECRET=''` → 401; Bearer/`x-cron-secret` erróneos, prefijo, sufijo y `bearer` en
  minúscula → 401; `?token=` → 401; kind inválido → 400 y `runJobs` no se invoca; deadline
  → `fn_release_job` (attempts-1, `run_at=now()`, sin tocar `last_error`).
- Producción (evidencia real): la cola está sana (0 `running` atascados, 0 `queued` vencidos,
  473 `done`, 6 `failed` que son residuos de prueba). El cron diario de Vercel **sí corre** desde
  el 09-11 (84 jobs `recording_cleanup` por día) y termina a 52–57 s de un `maxDuration` de 60 s.
- Los jobs `pg_cron` 17/18/19 siguen `active=false` una semana después; el cron de Vercel bajó a
  `*/2` (commit `9c0288a7`), así que el drenaje real es cada 2 min (latencia media 39–56 s,
  máx 131 s), no "cada minuto" como prometen docs y UI.
- `tsc` (heap 8 GB): **0 errores en archivos de JOBS**; 4 errores ajenos.

## Re-verificación de F-1…F-10 (r1)

| # | Fallo r1 | Estado | Evidencia (archivo:línea) |
|---|---|---|---|
| F-1 | `maintenance`/`recording_cleanup` sin productor | **Resuelto** | `scheduler.ts:96-150` (`runScheduledKinds`), `run/route.ts:115-117`; BD: `recording_cleanup:2026-09-11..15` = 83–84 jobs/día, todos `done` |
| F-2 | Guardarraíles rojos por archivos ajenos | **Resuelto** (para JOBS) | `guardrails.test.ts` 66/67; el único rojo es «el inicio espera sucursal y permisos» (`src/app/app/inicio/page.tsx`), no de JOBS. Regla 9 (enums vs `db-checks.json`) verde con 15 kinds |
| F-3 | Kind inválido drenaba toda la cola | **Resuelto** | `run/route.ts:68-75, 98-103` (400 + `invalid[]`/`valid[]`), `runner.ts:218-222` (`no_valid_kinds`, `claimed:0`); tests `runRoute.test.ts:45`, `runner.test.ts:263`, `testerR2Route` (no-string, `[]`+query, `NOOP`) |
| F-4 | Liberación por deadline quemaba intentos | **Resuelto** | `runner.ts:142-157`; BD `fn_release_job(uuid,text)`: `attempts = GREATEST(attempts-1,0)`, `run_at = now()`, guardado por `status='running' AND locked_by`. Residual aceptable: si la RPC falla con un error que NO es "función ausente" el job queda `running` hasta el reclaim de 10 min (que sí quema el intento y anota `[reclaimed]`) — `testerR2Runner` caso 1 |
| F-5 | `noop` fuera del CHECK | **Resuelto** | BD `outbound_jobs_kind_check` = 15 kinds (incl. `noop`, `time_events`); `enums.ts:181-197` = 15; grants de las 7 RPC: solo `service_role` |
| F-6 | Admin check divergente | **Resuelto / parcial** | `canRetryJobs = isOrgAdminContext` (`jobsService.ts:28-30`). Parcial: `canViewJobs` añade `MANAGER_ROLE_NAMES.has(ctx.roleName)` (`:24,33`) — comprobación por **nombre** de rol, contra la regla 6 de CLAUDE.md (el `roleId === 5` bastaría) |
| F-7 | `payload_preview` sin redacción | **Resuelto** | `redactPayload` allow-list (`jobsService.ts:42-54`), test `jobsService.test.ts:33`. Nota: la RLS `outbound_jobs_select` deja leer `payload` crudo a cualquier miembro activo por PostgREST; la redacción es solo de la API (hoy los payloads son ids, sin PII) |
| F-8 | Retención incompleta | **Resuelto** | `maintenance.ts:160-179` (`failed|dead` > 30 d, eventos `failed` > 30 d), `:199-204` (`attempts < 3`, `events_abandoned`) |
| F-9 | Docs desactualizadas | **Parcial** | FASE-00 `:70`, `:128`, `:1232` dicen Vercel `* * * * *`; `vercel.json:9` es `*/2 * * * *` desde `9c0288a7`. FASE-00 `:825` dice "los dos schedulers piden exactamente los mismos kinds": falso, `cron.job` 19 pide `recording_cleanup,maintenance` y Vercel `30 8` añade `health_recalculate,renewals_sync` (`run/route.ts:60`) |
| F-10 | `JobsMonitor` etiquetas | **Parcial** | Etiquetas `failed`/`dead`/reintento correctas (`JobsTable.ts:14`). Pero `JobsMonitor.tsx:102` "Se drena cada minuto" y `:80` "≤1 min" no se cumplen en producción (ver N-3); `JobsTable.tsx:31-34` `fmtDate` renderiza con `toLocaleString('es-CO')` sin la zona de la organización (regla 3 de fechas) |

## Fallos nuevos (r2), con pasos reproducibles

### N-1 [medio-alto] El cron diario corre al 87–95 % de `maxDuration` y el productor de `recording_cleanup` no tiene presupuesto
- Evidencia BD (`outbound_jobs`, kind `recording_cleanup`, 09-11…09-15): el cron dispara a 08:30:00;
  el primer job se crea a **08:30:29** (29 s de `maintenance` + `health_recalculate` + `renewals_sync`);
  encolar 84 orgs tarda **7,4–10,2 s** (84 RPC secuenciales); último `done` a 08:30:51–56.
  Total ≈ **52–57 s** de 60 s.
- Código: `scheduler.ts:152-182` (`enqueueRecordingCleanup`) itera hasta 1 000 orgs sin `signal`
  ni presupuesto; `run/route.ts:44-56` presupuesta 20 + 12 + 12 s pero no cuenta el encolado; el
  drenaje entra con `Math.max(2_000, …)` (`:119`) aunque ya se haya pasado el límite.
- Consecuencia: con 84 → ~110 orgs activas (crece 1/día) Vercel matará la función a los 60 s:
  jobs `running` hasta el reclaim de 10 min (con intento quemado) y tareas F11 cortadas sin resumen.
- Reproducir: `GET /api/crm/jobs/run` con `x-vercel-cron-schedule: 30 8 * * *` y ≥ 90 filas en
  `comm_settings.is_active`; medir `ms` de la respuesta.

### N-2 [medio] `npx jest src/lib/jobs` no está verde con `TZ=America/Bogota`
- `f11ScheduledTasks.test.ts:175` espera `expected_close_date: '2027-08-31'` y recibe `'2027-09-01'`.
  Con `TZ=UTC` pasa; con `TZ=America/Bogota` (el TZ del host y uno de los dos de `test:tz-all`) falla.
  `buildRenewalPlan` aislado devuelve `2027-08-31` en ambos TZ, así que la dependencia del TZ del
  host está en el camino `runRenewalsSync → syncRenewalsForOrg → scheduleRenewalForParent` o en el
  mock del test. Archivo de F11, pero forma parte de la suite que r2 declaró "7 suites verdes".
- Reproducir: `cross-env TZ=America/Bogota npx jest src/lib/jobs/__tests__/f11ScheduledTasks.test.ts -t runRenewalsSync`.

### N-3 [medio] Los dos schedulers divergen y la promesa "cada minuto" no se cumple
- `cron.job` 17/18/19: `active=false` (verificado 2026-09-15). Vercel: `*/2 * * * *` (`vercel.json:9`).
- BD: latencia `created_at → updated_at` de jobs `done` (sin `recording_cleanup`): media 39–56 s, máx
  **131 s** (`analyze`, 09-12), 75 s (`crm_event`, 09-14).
- `cron.job` 19 no pide `health_recalculate`/`renewals_sync`: cuando se active pg_cron y Vercel sea
  el respaldo, las tareas F11 solo correrán desde Vercel (o dos veces si coinciden).
- UI/docs afectados: `JobsMonitor.tsx:80,102`; FASE-00 `:70,:113,:128,:825,:1232`.

### N-4 [medio] Doble ejecución del efecto cuando `fn_complete_job` falla tras un handler exitoso
- `runner.ts:292` lanza si la RPC falla → cae al `catch` de `:305` → `fn_fail_job` con
  `p_retry_after_seconds: null` → el job vuelve a `queued` y el handler (p. ej. `email`, `whatsapp`)
  se ejecuta otra vez. El `dedupe_key` no protege: solo cubre `queued|running`.
- Test que lo documenta: `testerR2Runner.test.ts` «fn_complete_job lanza tras un handler EXITOSO».
- Mitigación esperada: que los handlers de envío marquen la entidad (`email_messages`/`messages`)
  antes de devolver y sean idempotentes por ese estado, o que `complete` fallido no dispare `fail`.

### N-5 [bajo] Residuos de prueba en producción
- `outbound_jobs`: 6 jobs `failed` (`JobFatalError: event_not_found`) de la org 125, `entity_id`
  sintéticos `bbbbbbbb-0000-4000-8000-00000000000{1..5}`, creados 2026-09-10 00:18–00:19; los
  `crm_events` referenciados ya no existen (se borraron los eventos, no los jobs). Los purgará
  `maintenance` el ~2026-10-10. La limpieza de ese test/smoke no cubre `outbound_jobs`.

### N-6 [bajo] Ruido diario de `recording_cleanup`
- 84 jobs/día para las 84 orgs con `comm_settings.is_active`, **todos** con `deleted:0, remaining:0`
  (447 filas ya). Se encola aunque la org no tenga `call_recordings`. ~2 500 filas/30 d de retención.

### N-7 [bajo] Reglas de fechas
- `scheduler.ts:67` (`dayKey`) y `recordingCleanup.ts:18` derivan el día con
  `toISOString().slice(0, 10)` (día UTC; equivalente al `split('T')[0]` prohibido por la regla 1).
  A 08:30 UTC coincide con Bogotá, pero la clave `recording_cleanup:{día}` y el `cutoff` de
  `retention_until` no salen de la zona de la organización.
- `JobsTable.tsx:31-34`: `fmtDate` sin `useFormatDate()` (regla 3).

### N-8 [bajo] `JobRetryableError(retryAfterSeconds: 0)` re-encola sin backoff
- `runner.ts:110-112` + `fn_fail_job` (`make_interval(secs => 0)`) → `run_at = now()`. Si el lote
  venía lleno, el mismo job puede reclamarse en el siguiente lote de la **misma** invocación y agotar
  `max_attempts` en segundos. Test: `testerR2Runner` «retryAfterSeconds: 0».

### N-9 [bajo] Handler que devuelve un array
- `runner.ts:291`: un array es `object` y se pasa tal cual a `p_result` (`jsonb`); no rompe, pero
  el contrato dice "registro plano". Test: `testerR2Runner` «string / número / array».

### N-10 [info] `worker` del body se acepta tal cual (≤100 chars)
- `run/route.ts:111`. Va parametrizado a las RPC (sin inyección) pero acaba en `locked_by` y en
  los logs sin sanear. Test: `testerR2Route` «worker del body».

## Resultados de suites y herramientas

| Comando | Resultado |
|---|---|
| `npx jest src/lib/jobs` (TZ host = America/Bogota) | 8/9 suites, **58/59** (rojo: `f11ScheduledTasks` N-2) |
| `TZ=UTC npx jest src/lib/jobs/__tests__/f11ScheduledTasks.test.ts` | verde |
| `npx jest src/lib/jobs/__tests__/testerR2*` (nuevos) | 2 suites, **26/26** |
| `npx jest src/__tests__/guardrails.test.ts` | **66/67** (rojo ajeno: `inicio/page.tsx`) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` | 4 errores, **0 en JOBS** (`FormularioEdicionProducto.tsx` ×2, `f10Round2Tester.test.ts`, `deliveryIntegrationService.ts`) |
| BD `outbound_jobs` por status | `done` 473, `failed` 6, `queued`/`running`/`dead` 0; `running` con `locked_at` > 10 min: 0; `queued` vencidos > 2 min: 0 |
| BD `crm_events` | `processed` 22, `skipped` 1; `attempts` máx 0; sin `pending` viejos |
| BD `cron.job` 17/18/19 | existen, `active=false` los tres; 19 con body `recording_cleanup,maintenance` |
| BD RPC | `fn_release_job`, `fn_fail_job`, `fn_claim_jobs` con guardas `status='running' AND locked_by = p_worker`; EXECUTE solo `service_role` |

Tests añadidos (sin datos reales, mocks): `src/lib/jobs/__tests__/testerR2Route.test.ts` (14) y
`src/lib/jobs/__tests__/testerR2Runner.test.ts` (12). Ningún archivo temporal ni `.sql` quedó en el árbol.

## Cobertura no probada

- Ejecución HTTP contra `next dev` (r2 ya documentó la caché `.next` corrupta; se verificó el módulo
  de la ruta con `NextRequest` real, no el servidor).
- Vercel Cron real: solo por evidencia indirecta en BD (jobs creados a 08:30:29 cada día); no se
  leyeron logs de Vercel ni `net._http_response` (pg_cron inactivo).
- Concurrencia real de dos runners sobre la misma cola (`SKIP LOCKED`): solo por definición de la RPC.
- `retryJob` extremo a extremo con sesión (rol Manager/Admin) contra la API; solo unit tests.
- Handlers reales de otras fases (`email`, `whatsapp`, `transcribe`, `ai_call`, `time_events`): fuera
  de alcance; solo se comprobó que están registrados y que `sms` sigue sin handler (→ `failed no_handler`).
- `JobsMonitor` en navegador (accesibilidad, paginación, dark mode).

## Calificación de robustez: 7.5/10

Sube desde 6/10 porque los diez fallos de r1 tienen corrección verificable en código, RPC y BD, el
runner es fail-closed en todos los caminos probados y la cola de producción está limpia. No llega a 9
por N-1 (el cron diario opera al borde del `maxDuration` con un productor sin presupuesto), N-2 (la
suite no está verde en los dos TZ obligatorios), N-3 (schedulers divergentes y latencia real 2× la
prometida) y N-4 (doble ejecución posible en envíos).
