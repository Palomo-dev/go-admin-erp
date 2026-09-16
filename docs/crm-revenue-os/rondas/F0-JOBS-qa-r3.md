# F0-JOBS — QA-reviewer — Ronda 3 — 2026-09-15

Insumos: `F0-JOBS-tester-r3.md` (8,5/10; 147/147 en ambas zonas, 16/16 mutaciones muertas, T-1…T-9),
`F0-JOBS-builder-r3.md`, `F0-JOBS-qa-r2.md` (puntos 1–8), FASE-00 §2.2, §4.4 y §13 (r3).
Verificación propia (sin escribir código): `src/lib/jobs/**`, `src/app/api/crm/jobs/**`, `jobsService.ts`,
`outboundService.ts` (F16), `orgAdmin.ts`/`orgContext.ts` (F0-SEC r1), `stagePermissions.ts`; BD solo
`SELECT` por MCP; suites con `TZ=UTC` y `TZ=America/Bogota`.

## Verificación ejecutada por QA (2026-09-15, árbol de trabajo actual)

| Qué | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs` | 14 suites / **146 de 147** verdes. El rojo es `testerR3.test.ts:387` «HUECO (regla 6)»: afirma que `{roleId:9, roleName:'Admin de organización'}` **ve y reintenta**; ya no es así |
| `TZ=America/Bogota npx jest src/lib/jobs` | Mismo resultado: 146/147 |
| `npx jest src/__tests__/guardrails.test.ts` | **73/73** (caso 18 verde) |
| Por qué el rojo | `src/lib/utils/orgAdmin.ts` se reescribió a las 18:56 (F0-SEC r1, agente paralelo) **después** del test del tester (18:41): `isOrgAdminLike` ahora decide solo por `is_super_admin` o `role_id ∈ [1,2]`; `roleName` «NO participa en la decisión». El hueco T-9 quedó cerrado por otra fase; el test del tester tiene la expectativa invertida y hay que voltearlo, no es regresión del builder |
| `whatsapp.ts:36`, `email.ts:22`, `transcribe.ts:20` | `signal.aborted` se lee **una sola vez, al entrar**; `sendWhatsApp`, `dispatchScheduledEmail` y `runTranscribePipeline` no reciben `signal` (T-1 confirmado) |
| `outboundService.ts:265-279` (`findByClientRequestId`) | `const { data } = await …` — **descarta `error`**; un timeout devuelve `null` ⇒ `whatsapp.ts:45` envía (T-2 confirmado) |
| BD `pg_indexes` sobre `messages` | **Ningún** índice sobre `metadata->>'client_request_id'` ni sobre `metadata` (T-2 confirmado; 258 875 filas según tester) |
| BD `permissions` | Solo `admin.full_access` (módulo `admin`) sirve como equivalente de administrador; en `crm` existen `crm.contacts.*`, `crm.customers.*`, `crm.leads.*`, `customer_management`: **no hay** código para la cola de jobs |
| BD `check_user_permission` | `(p_user_id uuid, p_organization_id integer, p_permission_code text)`, `SECURITY DEFINER`; ya lo consume `hasOrgAdminOrPermission` / `requireOrgAdminOrPermission` en `orgContext.ts:315-335`, usado por `withOrg({admin:true})` y `whatsapp/http.ts:32` |
| `jobsService.ts:219` (`retryJob`) | `payload: { ...job.payload, retried_from: job.id }` ⇒ un retry de un retry pisa `retried_from` con el id intermedio (T-2 bis confirmado) |
| `runner.ts:382-390` | Dos intentos de `fn_complete_job` sin espera entre ellos (T-6 confirmado) |
| `src/app/api/crm/jobs/[id]/retry/route.ts` | Trae además `readOrgBody(ctx, request)` de F0-SEC r1 (403 si el body trae otra org): correcto y ajeno a esta ronda |

## Evaluación del `roleId === 5` cableado en `canViewJobs`

- **Cumple la letra de la regla 6**: el `role_id` viene de `getServerOrgContext`, no del cliente ni del nombre.
  El test M13 del tester lo demuestra (mutar a `roleName === 'Manager'` muere).
- **No cumple el patrón del resto del sistema ni la regla 7**: `canViewJobs` = `[1,2] ∪ {5}` es exactamente
  `STAGE_MANAGER_ROLE_IDS = [1, 2, 5]` (`stagePermissions.ts:35`), que ya usan `contracts/[id]/route.ts:19`,
  `commissionTransitions.ts:243`, `f12RouteSupport.ts:27`, `sellerDashboardModel.ts:82` e `inicio/page.tsx:69`.
  Una constante privada `MANAGER_ROLE_ID = 5` es una segunda definición del mismo criterio: si mañana el
  «manager» pasa a ser otro id, JOBS diverge del resto del CRM.
- **No cuenta los cargos**: el usuario pidió expresamente que los cargos (`job_position_permissions`) con permiso
  cuenten, y desde F0-SEC r1 el repo tiene el helper canónico para eso: `hasOrgAdminOrPermission(ctx, code)`
  (síncrono por id y, si no, `check_user_permission` con usuario y org **de la sesión**, fail-closed ante error).
  `canRetryJobs` debería ser ese helper, y `canViewJobs` ese helper ∪ `STAGE_MANAGER_ROLE_IDS`. Como en
  `permissions` no existe un código de jobs, el equivalente hoy es `admin.full_access` (mismo criterio que
  `withOrg({admin:true})`); crear `crm.jobs.view` es opcional y decisión del dueño (migración de seed).
- Veredicto sobre la decisión: **aceptable como paso intermedio, no como cierre.** Es mejor que el nombre
  (r2) pero peor que lo que el propio repo ya ofrece.

## Calificación: 8.2/10

Dimensiones (2 pts c/u): funcionalidad 1,7 · robustez 1,5 · consistencia 1,5 · tester 1,8 ·
documentación/trazabilidad 1,7.

### Fortalezas
- Los 6 puntos de r2 tienen corrección real: productor con presupuesto/`signal`/selectividad (aborto externo
  e interno probados, 0 enqueues tras el corte), `complete_failed` terminal (decisión bien argumentada frente a
  lo que pedí: dejarlo `running` sí reejecutaría el efecto con el reclaim), `Set` de ids por invocación,
  fechas por zona de la org en todos los bordes (Bogotá/UTC/Kiritimati/Pago_Pago), contrato único de
  scheduling con guardarraíl 18 y migración 41 idéntica a `schedule.ts` (test que lo ata).
- 16/16 mutaciones muertas; 147 tests en dos zonas; `tsc` 0 errores en JOBS; nada de prueba en el árbol.
- Migración 41 + rollback revisados contra `cron.job` real, idempotentes, sin `active`, sin credenciales.
- §13 r3 documenta decisión de scheduler, medición del presupuesto y residuos N-5 (org 125).

### Problemas encontrados (ordenados por severidad)
1. [medio] **T-2 — La idempotencia de `whatsapp` se apoya en una consulta que traga errores y no tiene
   índice.** `outboundService.ts:267` descarta `error`; `whatsapp.ts:45` interpreta `null` como «no enviado»
   y envía; sin índice sobre `metadata->>'client_request_id'` en 258 875 filas es la consulta más propensa a
   agotar `statement_timeout`. El contrato N-4 («un reintento nunca es un segundo envío») queda condicionado
   a que la BD responda a tiempo. Además `retryJob` pierde `retried_from` en la 3.ª generación.
2. [medio] **T-1 — `signal` no es cooperativo.** Se lee una vez al entrar; abortada durante
   `findByClientRequestId` (o tras la comprobación de estado en `email`), el envío sale igual con
   `signal.aborted === true`, y el runner ya lo devolvió a `queued`. §4.4 `:815` dice «comprueban
   `signal.aborted` antes del efecto y son idempotentes por estado»: lo primero es cierto solo al entrar; lo
   segundo, para `whatsapp`, depende del punto 1.
3. [medio] **Permisos: constante duplicada y sin cargos.** Ver sección anterior. Y `jobsService.ts:24-27`
   afirma un criterio («NUNCA por el nombre») que hasta hoy la vía canónica no cumplía; hoy sí, pero por otra
   fase. El test `testerR3.test.ts:387` está rojo en el árbol y hay que voltearlo.
4. [bajo] **T-6** reintento inmediato de `fn_complete_job` (`runner.ts:383`): un blip de milisegundos convierte
   un job exitoso en `failed` terminal visible en JobsMonitor.
5. [bajo] **T-3/T-4/T-5** residuos de presupuesto: 3 consultas antes de `exhausted()` (`scheduler.ts:230-249`),
   mínimo 1 s por tarea F11 aunque el total esté agotado (`:174`), y `pending_org_ids` prometido «van primero
   al día siguiente» (`run/route.ts:339`, §13) sin persistirse. Hoy no muerden (1 org con grabaciones).
6. [info] **T-7/T-8** (día UTC como superconjunto solo a las 08:30 UTC; fallback de zona silencioso en el
   productor): documentar como supuestos en §4.4; sin impacto con 84/84 orgs en Bogotá.

### Qué falta para el 10 (si aplica)
- `signal` propagado hasta el `fetch` del proveedor (`sendWhatsApp`, `dispatchScheduledEmail`,
  `runTranscribePipeline`) y no solo comprobado en los puntos de decisión.
- Concurrencia real de dos runners sobre la misma cola (`SKIP LOCKED`) y reclaim de 10 min probados contra BD.
- `pending_org_ids` persistido (o la promesa retirada de §13/`run/route.ts`).
- Un código de permiso propio (`crm.jobs.view`) en `permissions` para que un cargo pueda ver la cola sin ser
  administrador pleno.

### Veredicto
requiere-nueva-ronda

> Regla dura de `loop.md`: esta es la 3.ª ronda consecutiva < 9,5 sobre la misma parte. El bloqueo raíz no
> es de código sino de **decisiones que exceden al builder**: (a) aplicar o no el índice sobre `messages`
> (tabla de F16 con 258 875 filas: `CREATE INDEX CONCURRENTLY` fuera de transacción, lo aplica el
> orquestador tras ver el SQL) y (b) si la cola se abre a cargos vía `admin.full_access` o se crea un
> código `crm.jobs.view`. La ronda 4 es corta y exacta; el orquestador debe registrar ambas decisiones en
> `PROGRESS.md` antes de lanzarla.

## Lista accionable para el builder — ronda 4 (prioridad = orden)

1. **[medio] T-2 — Idempotencia de `whatsapp` fail-closed + índice + `retried_from` estable.**
   - `src/lib/services/crm/whatsapp/outboundService.ts:267`: `const { data, error } = …; if (error) throw
     new Error(\`findByClientRequestId: ${error.message}\`)` (F16 la reutiliza en `sendWhatsApp:196`; allí
     el mismo cambio es correcto: nunca descontar créditos sin saber si ya se envió).
   - `src/lib/jobs/handlers/whatsapp.ts:39`: envolver la consulta en `try/catch` ⇒
     `JobRetryableError('idempotency_check_failed: …')` (backoff de `fn_fail_job`, sin efecto).
   - `src/lib/services/crm/jobsService.ts:219`: `retried_from: (typeof job.payload?.retried_from === 'string'
     && job.payload.retried_from) || job.id`.
   - Migración `supabase/migrations/<ts>_crm_v4_f00_42_idx_messages_client_request_id.sql` + rollback, **sin
     aplicar**: `create index concurrently if not exists idx_messages_org_client_request_id on public.messages
     (organization_id, (metadata->>'client_request_id')) where direction = 'outbound' and metadata ?
     'client_request_id';` (parcial: solo salientes con clave; `concurrently` ⇒ el archivo no puede ir dentro
     de una transacción, anotarlo en cabecera). Rollback: `drop index concurrently if exists …`.
   - Pruebas: `testerR3.test.ts` «HUECO: si la consulta de idempotencia FALLA…» pasa a esperar
     `JobRetryableError` y `sendWhatsApp` **0** llamadas; «retry de un retry» pasa a esperar clave
     `job:{job-1}` en la 3.ª generación; test estático que lea la migración y compruebe la expresión
     `(metadata->>'client_request_id')` y el `where direction = 'outbound'`.

2. **[medio] T-1 — Comprobación de `signal` en cada punto de decisión, y contrato honesto en §4.4.**
   - `whatsapp.ts`: segundo `if (signal.aborted) throw new JobRetryableError('aborted tras la comprobación de
     idempotencia')` justo antes de `sendWhatsApp` (`:44`). `email.ts`: lo mismo entre la comprobación de
     estado y `dispatchScheduledEmail`. `transcribe.ts`: lo mismo tras cargar la grabación y antes de
     `runTranscribePipeline`. Pasar `signal` a las tres funciones **solo si** su firma ya lo admite; si no,
     no tocar F16/F3/F5 en esta ronda.
   - FASE-00 §4.4 `:815`: sustituir «comprueban `signal.aborted` antes del efecto» por «comprueban
     `signal.aborted` al entrar y antes de cada efecto; un abort **durante** el efecto no lo cancela: lo
     cubre la idempotencia (`client_request_id` / `status_sent` / `call_transcripts`)».
   - Pruebas: los dos `it.failing` de `testerR3.test.ts` («signal a MITAD del handler», whatsapp y email)
     pasan a `it` y deben quedar verdes (abort durante `findByClientRequestId` ⇒ `sendWhatsApp` 0 llamadas).

3. **[medio] Permisos — un solo criterio y cargos contados.**
   - `src/lib/services/crm/jobsService.ts:29-39`: eliminar `MANAGER_ROLE_ID`; importar
     `STAGE_MANAGER_ROLE_IDS` de `./stagePermissions` y `hasOrgAdminOrPermission` de `@/lib/utils/orgContext`
     (o de un módulo hoja si `orgContext` arrastra `svix` en Jest: seguir el precedente de `orgAdmin.ts`).
     `canRetryJobs(ctx) = hasOrgAdminOrPermission(ctx)` (async, `admin.full_access`);
     `canViewJobs(ctx) = ctx.isSuperAdmin || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId) || await
     hasOrgAdminOrPermission(ctx)`. Reescribir el comentario `:24-27` con el criterio real.
   - `src/app/api/crm/jobs/route.ts:20,40` y `[id]/retry/route.ts:23`: `await`; actualizar el comentario de
     cabecera del retry («super admin, rol 1/2 o cargo con `admin.full_access`»).
   - `testerR3.test.ts:387`: voltear a `toBe(false)` en ambos `expect` (el hueco lo cerró F0-SEC r1) y
     renombrar el `it` («regla 6: el nombre no concede»).
   - Pruebas (`jobsService.test.ts`, con `supabase.rpc` mockeado): `{roleId:4}` + `check_user_permission`
     ⇒ `true` ⇒ ve **y** reintenta, y la RPC se llamó con `p_user_id`/`p_organization_id` **de `ctx`**;
     `{roleId:4}` + RPC con `error` ⇒ `false` (fail-closed) y `console.warn`; `{roleId:5}` ⇒ ve sin llamar a
     la RPC y **no** reintenta si la RPC dice `false`; `{roleId:9, roleName:'Admin de organización'}` ⇒
     `false` sin RPC concedida.

4. **[bajo] T-6 / T-3 / T-4 / T-5.**
   - `runner.ts:383-390`: `await sleep(300)` entre los dos intentos de `fn_complete_job` (solo si
     `!signal.aborted`); prueba con `jest.useFakeTimers()`: `Δt ≥ 300 ms` y sigue siendo un solo `fn_fail_job`.
   - `scheduler.ts:230`: llamar a `exhausted()` **antes** de `selectOrgsWithExpiredRecordings`; prueba
     «presupuesto 0 y signal YA abortada» ⇒ `queries` = `[]`.
   - `scheduler.ts:174`: `Math.max(0, remainingFor(…))` y, si es `0`, saltar la tarea con
     `reason:'budget_exhausted'` en el resumen; prueba «cada tarea F11 recibe al menos 1 000 ms» pasa a
     esperar `< 500 ms` totales con `totalBudgetMs: 300`.
   - T-5: quitar la promesa «van primero al día siguiente» de `run/route.ts:339` y §13, dejando
     «`pending_org_ids` se registra en el log; la persistencia queda para F0-JOBS r5/N-1b» (o persistirla en
     `outbound_jobs.payload` del propio job `maintenance`, a elección del builder). Prueba: el test «HUECO:
     pending_org_ids no se persiste» pasa a documentar el comportamiento aceptado o a verificar la persistencia.

5. **[bajo] Trazabilidad.** §13 «ronda 4» con: decisión del orquestador sobre el índice y sobre el permiso,
   y una nota de que `STAGE_MANAGER_ROLE_NAMES` (`stagePermissions.ts:36-43`, F9) sigue concediendo por
   nombre — hallazgo para la fase F9, no para JOBS.

No bloquean pero conviene: confirmar `CRON_SECRET` en Vercel; el `jobname` `crm-jobs-every-minute` mentirá
tras aplicar la 41 (cosmético, anotar en el SQL).
