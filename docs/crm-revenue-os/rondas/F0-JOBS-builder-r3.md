# F0-JOBS — Builder — Ronda 3 — 2026-09-15

Insumos: `F0-JOBS-qa-r2.md` (7,5/10; lista accionable 1–8), `F0-JOBS-tester-r2.md` (N-1…N-10) y sus
tests `testerR2Route`/`testerR2Runner`. FASE-00 §2.2, §4.4, §13. BD **solo lectura** por MCP
(`cron.job`, `information_schema.columns` de `call_recordings`, `messages`, `organizations`,
firma de `cron.alter_job`). Sin commits. `fn_release_job` no se tocó (lo lleva F0-DB r3).

## Qué se hizo en esta ronda

- **Contrato único de scheduling**: `src/lib/jobs/schedule.ts` (`JOBS_RUN_PATH`, `DRAIN_INTERVAL_MIN = 2`,
  `DRAIN_SCHEDULE`, `VERCEL_SCHEDULE_KINDS`, `JOBS_RUN_SCHEDULES`). Lo consumen `run/route.ts`,
  `JobsMonitor.tsx` («Se drena cada N minutos», toast «≤N min», aviso de atasco) y
  `jobsService.getJobStats` (`queuedOverdue` = un ciclo de drenaje). **Guardarraíl 18** en
  `src/__tests__/guardrails.test.ts`: `vercel.json` ↔ `schedule.ts` (cada cron de `/api/crm/jobs/run` es
  el drenaje total o una clave de la tabla, y viceversa exactamente una vez) y el código de JOBS no
  cablea cron strings ni «cada minuto».
- **Productor con presupuesto y selectividad** (`scheduler.ts`): `totalBudgetMs` global;
  `enqueueRecordingCleanup(sb, now, log, {signal, budgetMs})` selecciona `comm_settings.is_active` ∩
  orgs con `call_recordings` `ready` y `retention_until < día UTC` (superconjunto del día de cualquier
  org), carga `organizations.timezone` en una consulta y encola con el **día de la organización**
  (clave y `scheduled_for`); corta por presupuesto/`signal` devolviendo `{truncated, pending_org_ids}`.
  `reason:'no_expired_recordings'` cuando no hay trabajo.
- **Ruta `run`**: pasa `totalBudgetMs = 48 s` al productor; sin `Math.max(2_000, …)`; si al volver quedan
  < 2 s responde `{claimed:0, reason:'budget_exhausted'}` sin reclamar; `worker` del body solo
  `/^[A-Za-z0-9._:-]{1,100}$/`.
- **Runner**: `try` del handler separado del de `fn_complete_job`; reintento único de la RPC; si
  persiste, `fn_fail_job(-1)` ⇒ `failed` terminal con `last_error='complete_failed: …'` y
  `summary.completeFailed` (si `fn_fail_job` también falla, queda `running` para el reclaim). `Set` de
  ids ejecutados: un id repetido en un lote posterior se libera con `fn_release_job` y el bucle termina.
  Array del handler ⇒ `p_result null`. Timeout documentado como advisory.
- **Handlers de envío**: `whatsapp` fija `clientRequestId = job:{id}` (hereda `retried_from`), consulta
  `findByClientRequestId` antes de `sendWhatsApp` y devuelve `{skipped:true, reason:'already_sent'}`;
  `whatsapp`/`email`/`transcribe` lanzan `JobRetryableError` si `signal.aborted` antes del efecto.
- **Fechas**: `src/lib/jobs/orgTimezone.ts` (`isValidTimezone`, `loadOrgTimezones`,
  `getOrgTimezoneForJob`, `orgDay` sobre `toPlainDate`/`todayInTz`); `recordingCleanup.ts` corta por el
  día de la org; `JobsTable.tsx` formatea con `useFormatDate().formatDateTime`.
- **Permisos**: `canViewJobs = canRetryJobs(ctx) || ctx.roleId === 5`; `MANAGER_ROLE_NAMES` eliminado.
- **Docs**: FASE-00 §2.2 (decisión, cadencias reales, productor), §4.4 (fila `whatsapp` real, reglas del
  runner r3, productor r3), tabla de estado `:70`, nota `:825`, §12 (archivos r3) y nueva sección
  «§13 — ronda 3».
- **Migración pendiente (NO aplicada)**: `supabase/migrations/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql`
  + rollback. Job 17 → `*/2 * * * *`; job 19 body con los 4 kinds. No activa nada.
- Tests: `src/lib/jobs/__tests__/builderR3.test.ts` (15) y ampliaciones en `scheduler`, `runRoute`,
  `jobsService`, `testerR2Runner`, `testerR2Route`.

## Feedback de la ronda anterior que se atendió

1. **N-1/N-6 (presupuesto y selectividad)** → `scheduler.ts` recibe `signal` + `budgetMs`, devuelve
   `truncated`/`pending_org_ids`, y solo encola orgs con grabaciones vencidas (hoy 1 de 84).
   `run/route.ts` pasa `totalBudgetMs`, elimina `Math.max(2_000, …)` y no drena con
   `budget_exhausted`. Pruebas: 120 orgs × 100 ms con budget 1 s ⇒ `enqueued < 120`, `truncated`, sin
   enqueues tras el corte; productor que consume 49 s ⇒ `runJobs` no se invoca; productor de 40 s ⇒
   `deadlineMs: 10_000`; org sin vencidas ⇒ no se encola.
2. **N-4 (doble ejecución)** → runner: handler OK + `fn_complete_job` fallido ⇒ reintento de la RPC y
   `failed` terminal (`complete_failed:`), `completeFailed:1`, `done:0`, `retried:0`, nunca `queued`.
   `whatsapp` idempotente por `clientRequestId = job:{id}` (segunda ejecución ⇒ `{skipped:true}` y
   `sendWhatsApp` no invocado; retry manual hereda la clave; `duplicate:true` de `sendWhatsApp` ⇒
   skipped). `signal` respetado en `whatsapp`/`email`/`transcribe`; timeout advisory documentado en
   `runner.ts` y §4.4.
3. **N-3 (scheduler)** → decisión documentada (FASE-00 §2.2 y §13 r3): **Vercel primario a `*/2`**,
   pg_cron respaldo apagado. `JobsMonitor`, `jobsService` y FASE-00 (`:70`, `:113-131`, `:825`,
   `:1232`) a `*/2`; «piden exactamente los mismos kinds» corregido. Guardarraíl 18 verde. Migración
   `crm_v4_f00_41` (17 → `*/2`, 19 con 4 kinds) **pendiente de aplicar**.
4. **F-6 (rol por nombre)** → `jobsService.ts` sin `MANAGER_ROLE_NAMES`; test: `{roleId:9,'Gerente'}` ⇒
   false, `{roleId:5,'x'}` ⇒ true, `{roleId:4,'Manager'}` ⇒ false.
5. **N-7 (fechas)** → `recordingCleanup.ts` `cutoff = orgDay(getOrgTimezoneForJob(orgId))`; test con
   `now = 2026-09-16T03:00Z` y org `America/Bogota` ⇒ `.lt('retention_until','2026-09-15')`, Tokio ⇒
   `2026-09-16`, sin zona ⇒ fallback con `org_timezone_fallback`. `scheduler.ts` usa el día de la org
   para clave y `scheduled_for` (documentado en §2.2/§4.4). `JobsTable.tsx` con `useFormatDate()`.
   Verde en `TZ=UTC` y `TZ=America/Bogota`.
6. **N-8 (re-encolado sin backoff)** → `Set` de ids ejecutados; test: el claim devuelve `a,b` en tres
   lotes ⇒ handler 2 llamadas (una por job), `released:2`, solo 2 claims.
7. **N-9/N-10** → array ⇒ `p_result null` (test actualizado); `worker` saneado (test: espacios, `\n`,
   comillas, vacío, 101 chars, no-string ⇒ `makeWorkerId()`).
8. **Trazabilidad** → §13 r3 con decisión, `9c0288a7`, presupuesto medido (29 s + 7–10 s + drenaje) y
   residuos N-5 (org 125, `bbbbbbbb-…`). La entrada de `PROGRESS.md` la escribe el orquestador.

## Decisiones de diseño relevantes

- **`complete_failed` ⇒ `failed` terminal, no `running`.** El QA pedía «no llamar a `fn_fail_job`; dejarlo
  `running`». Con el reclaim de 10 min (`[reclaimed]`, intento quemado, vuelve a `queued`) eso es
  exactamente la doble ejecución que N-4 denuncia, solo que 10 min después. Se cierra terminal con
  `last_error` explícito: visible en JobsMonitor, reintentable solo por admin, y el reintento ya es
  idempotente (`retried_from` hereda la clave). Se conserva la vía «queda `running`» únicamente cuando
  también falla `fn_fail_job`.
- **`whatsapp` sin `{message_id}`+`pending`.** `messages` no tiene `status` ni `provider_message_id`
  (MCP) y el envío lo dispara el INSERT: el contrato de §4.4 no es implementable sin F16. Se usa la
  clave de idempotencia que F16 ya construyó (`client_request_id`, ventana 7 d) en vez de duplicar
  lógica; §4.4 documenta el payload real.
- **Selección por día UTC en el productor, corte por día de la org en el handler.** A las 08:30 UTC el
  día local de cualquier org es UTC−1 o UTC+0, así que `retention_until < díaUTC` es superconjunto:
  ninguna org con trabajo se queda fuera y el handler aplica el corte exacto.
- **Vercel primario.** Es el único scheduler que corre en producción (evidencia BD), y `9c0288a7` lo bajó
  a `*/2` por el circuit-breaker. Encender pg_cron sin la migración 41 daría cadencias distintas y
  tareas F11 solo desde Vercel.
- **Fallback de zona en `getOrgTimezoneForJob`** replica el comportamiento del servicio canónico
  (`console.warn` + `DEFAULT_TIMEZONE`): un job de limpieza no debe morir por no poder leer la zona; el
  productor sí propaga el error de `loadOrgTimezones` como aviso.
- `renewalsSync.ts` (F11) conserva su `loadTimezones` privado: no se tocó por ser de otra fase; podría
  importar `orgTimezone.ts` en su siguiente ronda.

## Verificación

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs` | 12 suites / **111 tests** verdes (85 de r2 + 26 nuevos/ampliados) |
| `TZ=America/Bogota npx jest src/lib/jobs` | 12 suites / **111 tests** verdes (+ `f3Adversarial.test.ts` verde con el cutoff por org) |
| `npx jest src/__tests__/guardrails.test.ts` | **71/71** (4 nuevos, caso 18) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json \| grep -E "lib/jobs\|crm/jobs\|JobsMonitor\|JobsTable"` | **0 errores** en JOBS (el único que apareció, `readonly ScheduledKind[]` en `run/route.ts:118`, se corrigió) |
| BD (solo SELECT) | `cron.job` 17/18/19 `active=false` (19 sin F11); `messages` sin `status`/`provider_message_id`; `call_recordings.retention_until` `date`; `organizations.timezone` `text NOT NULL`; `cron.alter_job(job_id, schedule, command, database, username, active)` |

## Pendientes que dejo explícitamente para revisión

- **Migración PENDIENTE DE APLICAR** (solo si se enciende pg_cron):
  `supabase/migrations/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql` + rollback.
- Confirmar `CRON_SECRET` en el proyecto de Vercel (el Bearer automático depende de ello).
- N-5: 6 jobs `failed` de la org 125 (`entity_id` `bbbbbbbb-…`) — `maintenance` los purga el 2026-10-10;
  el dueño decide si se borran antes (no se tocó la BD).
- `runner.test.ts` y `handlers.test.ts` traen cambios locales previos de otro agente (aparecían `M`
  antes de esta ronda); no se editaron aquí.
- La entrada «F0-JOBS r3» de `PROGRESS.md` y la calificación QA r2 pendiente en `:1184` las anexa el
  orquestador.
