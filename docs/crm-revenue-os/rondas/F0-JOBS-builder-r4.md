# F0-JOBS — Builder — Ronda 4 — 2026-09-15

Insumos: `F0-JOBS-qa-r3.md` (8,2/10; lista accionable 1–5) y `F0-JOBS-tester-r3.md` (T-1…T-9) con sus
tests `testerR3.test.ts` / `testerR3Runner.test.ts`. FASE-00 §4.4, §12, §13. BD **solo lectura** por MCP
(`information_schema.columns` de `messages` y `email_messages`; `pg_indexes` de `messages`; conteo: 258 899
filas, 353 MB, **0** con `client_request_id`). Sin commits. `orgAdmin.ts`/`orgContext.ts` (F0-SEC) se usan,
no se editan. Ningún `.sql` de prueba ni archivo temporal quedó en el árbol.

## Qué se hizo en esta ronda

- **(1) Idempotencia fail-closed + `retried_from` estable + migración 42.**
  `findByClientRequestId` (`outboundService.ts`, F16) hace `const { data, error }` y **lanza**
  `Error('findByClientRequestId: …')` si hay error: nunca «no enviado» por timeout. El handler `whatsapp`
  envuelve la consulta y lanza `JobRetryableError('idempotency_check_failed: …')` sin llamar a
  `sendWhatsApp` (backoff estándar de `fn_fail_job`). `retryJob` (`jobsService.ts`) hereda
  `retried_from` de la raíz: `payload.retried_from` si es string no vacío, si no `job.id` ⇒ la clave
  `job:{raíz}` es idéntica en la 2.ª, 3.ª… generación.
  Migración **PENDIENTE DE APLICAR**
  `supabase/migrations/20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql` + rollback:
  `create index if not exists idx_messages_org_client_request_id on public.messages (organization_id,
  (metadata->>'client_request_id')) where direction = 'outbound' and (metadata->>'client_request_id') is not null`.
  Sin `CONCURRENTLY` (no cabe en la transacción de `apply_migration`); la cabecera documenta el bloqueo
  esperado (SHARE lock: bloquea escrituras de `messages` durante un recorrido de 258 899 filas; segundos),
  la alternativa `CONCURRENTLY` a mano fuera de transacción y la verificación con `explain`.
- **(2) `signal` antes de cada efecto, contrato honesto.** `whatsapp`: segunda comprobación tras
  `findByClientRequestId`. `email` (envío programado): comprobación nueva de pertenencia
  (`email_messages` por `id` **y** `organization_id`; `dispatchScheduledEmail` busca solo por id) y segunda
  comprobación de `signal` antes de despachar; no pertenece ⇒ `{skipped:true, reason:'not_found'}`; la
  consulta falla ⇒ `JobRetryableError`. `transcribe`: solo al entrar (documentado: `transcribeCall` hace
  pertenencia + transcripción existente + cobro en una secuencia). Ninguna de las tres funciones de efecto
  admite `signal`: F16/F7/F4 no se tocaron. §4.4 dice ahora «al entrar y antes de cada efecto; un abort
  durante el efecto no lo cancela: lo cubre la idempotencia».
- **(3) Permisos, un solo criterio.** `jobsService.ts` sin `MANAGER_ROLE_ID`: importa
  `STAGE_MANAGER_ROLE_IDS` (`stagePermissions.ts`) y `hasOrgAdminOrPermission` (`orgContext.ts`, sobre
  `check_user_permission`, fail-closed). `canRetryJobs(ctx) = hasOrgAdminOrPermission(ctx)`;
  `canViewJobs(ctx) = isSuperAdmin || STAGE_MANAGER_ROLE_IDS.includes(roleId) || hasOrgAdminOrPermission(ctx)`.
  Ambas `async`; `route.ts` y `[id]/retry/route.ts` con `await` y comentarios de cabecera reescritos. Código
  de permiso: `admin.full_access` (`ORG_ADMIN_PERMISSION_CODE`), decisión provisional del orquestador.
- **(4) Presupuesto y reintento.** `runner.ts`: `COMPLETE_RETRY_DELAY_MS = 300` entre los dos intentos de
  `fn_complete_job`, solo si `deadlineAt - now > 300`. `scheduler.ts`: `exhausted()` antes de la primera
  consulta (presupuesto 0 / señal abortada ⇒ `{enqueued:0, orgs:0, truncated:true, reason:'budget_exhausted'}`
  sin round-trips) y otra vez tras seleccionar (⇒ `pending_org_ids` = todas, sin cargar zonas); F11 sin
  `Math.max(1_000, …)`: presupuesto recalculado antes de cada tarea y, si es `≤ 0`, la tarea no arranca
  (`TaskFailure { ok:false, error:'budget_exhausted', reason:'budget_exhausted' }`). `pending_org_ids`:
  **no se persiste**; la promesa «van primero al día siguiente» se retiró de `run/route.ts`, `scheduler.ts` y
  FASE-00 `:825`.
- **(5) Trazabilidad.** FASE-00: tabla de endpoints §4.4 (`GET /api/crm/jobs`, `POST …/retry`), reglas del
  runner §4.4 (T-1/T-2/T-6), nota `:825` (T-3/T-4/T-5 + supuestos T-7/T-8), §12 «Ronda 4», nueva sección
  «§13 — ronda 4» con las dos decisiones del orquestador y el hallazgo de F9 (`STAGE_MANAGER_ROLE_NAMES`
  sigue concediendo por nombre).
- Tests: nuevo `src/lib/jobs/__tests__/builderR4.test.ts` (17); `testerR3.test.ts`: los dos `it.failing` y los
  «HUECO» de T-1…T-4 pasan a `it` con la expectativa corregida, T-5 queda como comportamiento aceptado, el
  de la regla 6 (`:387`) volteado y renombrado; `testerR3Runner.test.ts` (T-6) espera la espera;
  `jobsService.test.ts` y `builderR3.test.ts` adaptados (`await`, fixture `email_messages`);
  `scheduler.test.ts` +1 caso y el de presupuesto 0 al nuevo contrato.

## Feedback de la ronda anterior que se atendió

1. **[medio] T-2** → error de la consulta ⇒ `JobRetryableError`, 0 envíos (`testerR3` «si la consulta de
   idempotencia FALLA…», `builderR4` «propaga el error…», «handler whatsapp: consulta fallida…»);
   `retried_from` raíz en 3 generaciones + valor no string ignorado (`builderR4`, `testerR3` «retry de un
   retry conserva la raíz»); test estático de la migración (expresión, `where direction = 'outbound'`,
   `is not null`, sin `CONCURRENTLY`, sin credenciales) y del rollback.
2. **[medio] T-1** → `testerR3` «whatsapp: abort mientras se consulta la clave» y «email: abort durante la
   comprobación de pertenencia» ya son `it` verdes; `builderR4` añade abort con `findByClientRequestId`
   real, «ya enviado + abort tardío ⇒ skipped», `email` de otra org ⇒ `not_found` sin despachar, error de
   pertenencia ⇒ reintentable.
3. **[medio] Permisos** → `builderR4` con `check_user_permission` mockeada: `{roleId:4}` + `true` ⇒ ve y
   reintenta y la RPC recibe `p_user_id`/`p_organization_id` de `ctx`; `{roleId:4}` + `false` ⇒ nada;
   RPC con `error` ⇒ `false` + `console.warn`; `{roleId:5}` ve sin RPC y no reintenta si la RPC dice
   `false`; roles 1/2 y super admin sin RPC; `{roleId:9, roleName:'Admin de organización'}` ⇒ `false` (la
   RPC sí se consulta: decide la BD, no el nombre); test estático: `jobsService.ts` sin `roleId === N` ni
   `roleName ===`, rutas con `await`. `testerR3.test.ts:387` volteado.
4. **[bajo] T-6/T-3/T-4/T-5** → `testerR3Runner` (Δt ≥ 300 ms, un solo `fn_fail_job`); `builderR4` (segundo
   intento acierta ⇒ `done`; deadline inminente ⇒ sin espera); `testerR3` «presupuesto 0 y signal YA
   abortada ⇒ queries = []», «presupuesto 0 sin abortar», «tareas F11 sin mínimo de 1 s ⇒ < 500 ms y
   `reason:'budget_exhausted'`», T-5 documentado; `scheduler.test.ts` presupuesto agotado tras seleccionar.
5. **[bajo] Trazabilidad** → §13 ronda 4 y §4.4 (arriba).

## Decisiones de diseño relevantes

- **Predicado del índice parcial**: `(metadata->>'client_request_id') is not null` en vez del
  `metadata ? 'client_request_id'` que proponía el QA. Postgres solo usa un índice parcial si puede
  demostrar su predicado desde el WHERE de la consulta: `expr = $2` (operador estricto) implica
  `expr is not null`, pero no implica `?`. Con `?` el índice existiría y `findByClientRequestId` seguiría
  sin usarlo. Verificable tras aplicar con el `explain` de la cabecera.
- **Sin `CONCURRENTLY` en el `.sql`**: el MCP corre en transacción. Documentado el bloqueo (escrituras de
  `messages`, segundos) y la vía manual `CONCURRENTLY`; ambas dejan el mismo índice y el rollback las cubre.
- **`email`: comprobación de pertenencia en el handler** (una `select id` por PK+org) en vez de pasar
  `orgId` a `dispatchScheduledEmail` (F7, fuera de esta ronda). Es una guarda multi-tenant, no lógica de
  negocio duplicada; además da el segundo punto de decisión real para `signal`.
- **`transcribe` sin segundo punto**: añadir una consulta a `calls` duplicaría exactamente la de
  `transcribeCall` (regla 7); se documenta que el único punto es la entrada.
- **Permisos con contexto parcial**: `canViewJobs`/`canRetryJobs` aceptan `JobsPermissionContext` (rol +
  opcionalmente `userId`/`organizationId`/`supabase`); sin sesión completa solo decide el criterio síncrono
  (`hasOrgAdminOrPermission` devuelve `false` sin `userId`). Así los tests antiguos siguen siendo válidos y
  las rutas, que pasan `ServerOrgContext` completo, sí consultan la RPC.
- **Espera de `fn_complete_job` acotada por el deadline** (`deadlineAt - now > 300`): la espera nunca
  provoca un `released` ni se come el margen del runner; con deadline inminente el reintento es inmediato.
- **`pending_org_ids` no se persiste** (opción ofrecida por el QA). Razón: con la selectividad de r3 hoy hay
  1 org con grabaciones y caben ~600 en 48 s; persistir en `outbound_jobs.payload` del `maintenance` o rotar
  el orden es trabajo para r5/N-1b si el truncado llegara a repetirse. Docs, ruta y scheduler lo dicen.
- **`TaskFailure`** con `reason:'budget_exhausted'` (log `warn`, no `error`) para distinguir «no arrancó por
  presupuesto» de «falló».

## Verificación

| Comando | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs` | 15 suites / **166 tests** verdes |
| `TZ=America/Bogota npx jest src/lib/jobs` | 15 suites / **166 tests** verdes |
| `npx jest src/__tests__/guardrails.test.ts` | **76/76** |
| `npx jest src/lib/services/crm/whatsapp src/lib/services/crm/email` (F16/F7, por el cambio en `findByClientRequestId`) | 29 suites / 549 verdes (1 skipped preexistente) |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json \| grep -E "lib/jobs\|crm/jobs\|JobsMonitor\|JobsTable\|outboundService"` | **0** (8 errores totales, todos preexistentes y ajenos: `FormularioEdicionProducto.tsx` ×2, `f13Round3Tester.test.ts` ×2, `webhookTemplateStatus.test.ts`, `deliveryIntegrationService.ts`, `webhookCoercion.testerR2.test.ts`) |
| `npx eslint` sobre los archivos tocados | limpio |

## Migraciones PENDIENTES DE APLICAR

- `supabase/migrations/20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql` +
  `supabase/rollbacks/20260915234000_crm_v4_f00_42_idx_messages_client_request_id_rollback.sql` — índice
  parcial; aplicar fuera de horario comercial o con `CONCURRENTLY` a mano (cabecera).
- `supabase/migrations/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql` (r3) — solo si se
  enciende pg_cron.

## Pendientes que dejo explícitamente para revisión

- Decisión del dueño: crear `crm.jobs.view` en `permissions` (seed) y cambiar el código en `jobsService.ts`;
  hoy un cargo solo entra con `admin.full_access`.
- Hallazgo para **F9**: `STAGE_MANAGER_ROLE_NAMES` (`stagePermissions.ts:36-43`) concede
  `canOverrideStageGate`/`canManageStages` por nombre de rol (regla 6).
- **F16**: `CLIENT_REQUEST_ID_WINDOW_MS` = 7 días; un retry manual de un `failed` de más de 7 días vuelve a
  enviar (T-2, sin cambio en esta ronda).
- Sin probar contra BD: concurrencia real de dos runners (`SKIP LOCKED`), reclaim de 10 min, `explain` del
  índice (requiere aplicarlo).
- `CRON_SECRET` en Vercel; el `jobname` `crm-jobs-every-minute` mentirá tras aplicar la 41 (cosmético).
- Entrada «F0-JOBS r4» de `PROGRESS.md` (la escribe el orquestador).
