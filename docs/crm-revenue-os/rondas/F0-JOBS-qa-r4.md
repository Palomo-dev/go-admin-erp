# F0-JOBS — QA-reviewer — Ronda 4 — 2026-09-16

Insumos: `F0-JOBS-builder-r4.md`, `F0-JOBS-tester-r4.md` (9,0/10; 277 verdes UTC/Bogotá; 27/27 mutaciones
muertas; dry-run de 41 y 42), `F0-JOBS-qa-r3.md` (8,2/10, puntos 1–5), FASE-00 §4.4/§12/§13 y la entrada
«Autorización general del dueño y migraciones aplicadas — 2026-09-16» de `PROGRESS.md` (decisión (b):
`crm_v4_f00_45` aplicada; `f00_37` aplicada; 41 y 42 pendientes de este veredicto).
Sin ramas, sin commits, sin editar código. BD solo `SELECT` por MCP (`jgmgphmzusbluqhuqihj`).

## Verificación ejecutada por QA

| Qué | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/__tests__/guardrails.test.ts` | **19 suites / 277 tests verdes** (198 JOBS + 79 guardrails, caso 18 verde) |
| `TZ=America/Bogota npx jest src/lib/jobs` | **18 suites / 198 verdes** (idéntico a UTC) |
| `git status` del alcance | Solo archivos de JOBS/F16/orgContext modificados + 4 tests nuevos `builderR4`/`testerR4*`; ningún `.sql` de prueba ni script en el árbol |
| BD `permissions`/`role_permissions` | `crm.jobs.view` {1,2,5} y **`crm.jobs.retry` {1,2,5}** (módulo `crm`, categoría `jobs`, `allowed=true`); `schema_migrations` `20260916044635 crm_v4_f00_45_permisos_cola_jobs` |
| BD `check_user_permission` | `(p_user_id uuid, p_organization_id int, p_permission_code text)`, SECURITY DEFINER: miembro activo → super admin ⇒ true → cargo con precedencia (`job_position_permissions`) → rol (`role_permissions`) → false |
| BD `roles` | Solo 5 roles de sistema (1 Super Admin, 2 Admin de organización, 3 Cliente, 4 Empleado, 5 Manager); no hay roles por organización |
| BD `cron.job` 17/18/19 | `active=false` ×3; 17 `* * * * *` `fn_crm_cron_post('/api/crm/jobs/run')`; 19 `30 8 * * *` con `{"kinds":["recording_cleanup","maintenance"]}` — **exactamente** lo que el rollback de la 41 restaura |
| BD `messages` | 259 077 filas, 0 con `client_request_id`; `idx_messages_org_client_request_id` **no existe** (42 sin aplicar); `outbound_jobs.releases` existe (37 aplicada) |
| `fn_crm_cron_post` | `(p_path text, p_body jsonb)`: el `command` de la 41 para el job 19 es válido; el de 17 sigue con un argumento (drena «todo», = Vercel `*/2`) |
| `vercel.json` ↔ `schedule.ts` ↔ 41 | `*/2`, `*/5`, `30 8`; `VERCEL_SCHEDULE_KINDS['30 8']` = los 4 kinds que la 41 pone en el job 19; `testerR3.test.ts:413` ata SQL y `schedule.ts` |
| `tsc` | No re-ejecutado por QA (4 min con heap 8 GB y agentes en paralelo); se acepta el «0 en JOBS» del tester y del builder, ambos con `grep` acotado |

### Hallazgos del tester r4 confirmados con archivo:línea

| Hallazgo | Evidencia | Veredicto |
|---|---|---|
| Punto 1 (T-2) idempotencia fail-closed | `outboundService.ts:287` `if (error) throw new Error('findByClientRequestId: …')`; `whatsapp.ts:49-54` `try/catch` ⇒ `JobRetryableError('idempotency_check_failed…')`, `sendWhatsApp` no se llama; `whatsapp.ts:36` clave `job:{raíz}`; `jobsService.ts:239` raíz solo si string no vacío | Confirmado |
| Punto 2 (T-1) `signal` antes de cada efecto | `whatsapp.ts:45,60`; `email.ts:29,65` con pertenencia `:53-63` (`.eq('organization_id', orgId)`, error ⇒ reintentable, no pertenece ⇒ `not_found`); `transcribe.ts:25` solo entrada, justificado `:16-20`; FASE-00 `:815` contrato honesto | Confirmado |
| Punto 3 permisos | `jobsService.ts:52-59`: `canRetryJobs = hasOrgAdminOrPermission(ctx)` (código por defecto `admin.full_access`), `canViewJobs = isSuperAdmin ∪ STAGE_MANAGER_ROLE_IDS ∪ RPC`; `orgContext.ts:318-330` fail-closed (`!userId || !organizationId` ⇒ false; error ⇒ `warn` + false; `data === true`); `route.ts:21,41` y `retry/route.ts:25` con `await`; `retry/route.ts:24` `readOrgBody` antes del permiso | Confirmado — **pero queda superado por `f00_45`** (ver hallazgo 1) |
| Punto 4 (T-6/T-3/T-4/T-5) | `runner.ts:62` `COMPLETE_RETRY_DELAY_MS = 300`, `:391` guarda `deadlineAt - Date.now() > 300`; `scheduler.ts:256` `exhausted()` antes de la 1.ª consulta, `:265` tras seleccionar, `:184-208` `budgetFor = max(0, …)` y `perTask <= 0` ⇒ `TaskFailure budget_exhausted` | Confirmado |
| Punto 5 trazabilidad | FASE-00 `:733-734`, `:815`, `:825`, `:1244`, `:1502-1518` | Confirmado |
| N-2 doble RPC en GET | `route.ts:21` (`canViewJobs`) + `:41` (`canRetryJobs`): para rol 4 con cargo, dos `check_user_permission` por petición; `JobsMonitor` refresca cada 2 min | Confirmado (bajo) |
| N-3 `maintenance` con total agotado | `scheduler.ts:150` `Math.max(250, remainingFor(opts.budgetMs))` | Confirmado (bajo, es el primer paso del productor) |
| M22/M26 sostenidas por un único test | `testerR3Runner.test.ts:151` y `builderR4.test.ts:299,313` comparan contra `COMPLETE_RETRY_DELAY_MS - 5` (con la constante en 0 pasan solos; la mata solo `:188` `≥ 1_300`); `readOrgBody` en retry solo lo prueba `testerR4Cadena.test.ts:190-214` | Confirmado |
| N-4 bloqueo de la 42 | 1 133 ms en dry-run sobre 259 061 filas; cabecera del `.sql` dice «segundos» | Confirmado, conservador |

## Hallazgos propios de esta ronda

1. **[medio, contrato] La BD ya concede `crm.jobs.retry` al rol 5 (Manager) y el código/doc de r4 dicen lo
   contrario.** `f00_45` (`:32-40`) inserta `crm.jobs.retry` para (1, 2, **5**) bajo la justificación «la misma
   jefatura que tenía acceso antes, NADIE pierde acceso»; pero en r4 el Manager **ve y no reintenta**
   (`jobsService.ts:23-30`, `retry/route.ts:12` «Manager (5) NO reintenta», FASE-00 `:734`,
   `testerR3.test.ts:404`). Hoy no hay exposición porque el código sigue exigiendo `admin.full_access` para
   reintentar; pero en cuanto el builder r5 sustituya el criterio por `hasOrgAdminOrPermission(ctx,
   'crm.jobs.retry')`, el Manager pasará a reintentar **sin que nadie lo haya decidido explícitamente**
   (PROGRESS solo habla de «no perder acceso»). Un retry re-encola efectos con coste (créditos de WhatsApp,
   email) y la idempotencia de `whatsapp` caduca a los 7 días. Hay que resolverlo antes de cambiar el código:
   (A) conservar la semántica de r4 con una migración DML `crm_v4_f00_46` que retire `(5, crm.jobs.retry)` de
   `role_permissions` (+ rollback que lo reinserte), o (B) mantener la concesión y documentarla en FASE-00
   `:734`, la cabecera de `retry/route.ts`, §13 r5 y `PROGRESS.md` como decisión. Recomiendo (A): es lo que
   aprobaron QA r3 y tester r4, y un cargo sigue pudiendo conceder el retry a un Manager concreto.
2. **[bajo, calidad] «Una sola RPC por petición» no es alcanzable literalmente con dos códigos distintos en
   `GET /api/crm/jobs`.** La respuesta lleva `canRetry` además de autorizar la vista, y `check_user_permission`
   resuelve un código por llamada. Opciones honestas: (i) `retry ⇒ view` (si la RPC de `crm.jobs.retry` da
   `true` no se consulta `crm.jobs.view`; solo un cargo «ve pero no reintenta» paga dos RPC) o (ii) dos RPC en
   `Promise.all`. En ambos casos calcular **una vez** en la ruta (`resolveJobsPermissions(ctx) ⇒ {canView,
   canRetry}`) y dejar de llamar a `canViewJobs` y `canRetryJobs` por separado (N-2).
3. **[bajo, docs] Trazabilidad ya desfasada.** `jobsService.ts:34-36` («no existe un código de permiso propio
   (`crm.jobs.view`)… hasta que el dueño lo cree») y FASE-00 §13 r4 «(b) Permiso: provisionalmente
   `admin.full_access`» describen un estado que la BD ya no tiene desde `20260916044635`.
4. **[info, seguridad] Con el criterio nuevo, los roles 1/2 y el super admin siguen entrando por
   `isOrgAdminLike` sin RPC** (`orgContext.ts:319`): un cargo no puede *negar* la cola a un administrador.
   Coherente con `withOrg({admin:true})`; se documenta, no se cambia.
5. **[info] `jobsService.test.ts:24`, `testerR3.test.ts:395-404`, `builderR4.test.ts:198-260` y
   `testerR4.test.ts:11,212-263` afirman `STAGE_MANAGER_ROLE_IDS` / `admin.full_access`**: todos hay que
   voltearlos en r5 (el test estático `builderR4.test.ts:255-260` exige literalmente
   `STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId)` y fallará al quitarlo, como debe).

## Migraciones 41 y 42: ¿aplicables tal cual?

| Migración | Revisión estática | Contra la BD de hoy | Veredicto |
|---|---|---|---|
| `20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql` | `do $$ … cron.alter_job(job_id=>17, schedule=>'*/2 * * * *')` y `alter_job(job_id=>19, command=>…4 kinds)`; guardas `exists … jobid and jobname` (no-op si cambian); no toca `active`; sin credenciales (`fn_crm_cron_post` lee Vault); idéntica a `schedule.ts` (`DRAIN_SCHEDULE`, `VERCEL_SCHEDULE_KINDS`) y atada por `testerR3.test.ts:413` | 17/18/19 existen con esos `jobname`, `active=false`; dry-run del tester en transacción OK | **Aplicable tal cual.** Resultado esperado: 17 `*/2 * * * *`, 19 con 4 kinds, los tres `active=false`. Cosmético: el `jobname` `crm-jobs-every-minute` queda desalineado (anotado en r3/r4) |
| rollback 41 | Restaura `* * * * *` y `{"kinds":["recording_cleanup","maintenance"]}` | El `command` actual del job 19 es **byte a byte** el que el rollback pone; el 17 hoy es `* * * * *` | **Aplicable** (idempotente, no toca `active`) |
| `20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql` | `create index if not exists … (organization_id, (metadata->>'client_request_id')) where direction='outbound' and (metadata->>'client_request_id') is not null` + `comment on index`; sin `CONCURRENTLY` (transacción del MCP); la expresión y el predicado coinciden con `findByClientRequestId` (`outboundService.ts:276-282`, test estático `testerR4Cadena`); sin credenciales ni nombres | Índice ausente; 259 077 filas, 0 con clave (nace vacío); dry-run del tester: 1 133 ms de SHARE lock y `Index Scan using idx_messages_org_client_request_id` | **Aplicable tal cual, ahora** (madrugada Bogotá = horario valle; ~1 s de espera para los INSERT de `messages`). Después: `select indexdef from pg_indexes where indexname='idx_messages_org_client_request_id'` y el `explain` de la cabecera |
| rollback 42 | `drop index if exists public.idx_messages_org_client_request_id;` (ACCESS EXCLUSIVE instantáneo) | n/a | **Aplicable** |

Ninguna de las dos depende del código r5: 41 solo importa si se enciende pg_cron; 42 acelera una consulta que ya
es fail-closed. Aplicarlas no altera el veredicto de esta ronda ni lo condiciona.

## Calificación: 9,1/10 — requiere ronda 5 (corta y exacta)

| Dimensión | Peso | Nota | Por qué |
|---|---|---|---|
| Funcionalidad / contrato | 25 % | 9,2 | Los 5 puntos de r3 con corrección real y probada de punta a punta (cadena `retryJob` → runner → handler con `findByClientRequestId` real). Resta: contrato de retry para Manager contradictorio entre BD (`f00_45`) y código/doc (hallazgo 1) |
| Seguridad (regla 6, fail-closed) | 30 % | 9,0 | `hasOrgAdminOrPermission` fail-closed y con usuario/org de sesión; `readOrgBody` antes del permiso; `data === true`; el nombre de rol no decide (M7/M16/M17/M19/M20/M25/M26 muertas). Resta: `STAGE_MANAGER_ROLE_IDS` sigue siendo una lista cableada que la decisión del dueño ya sustituyó por permisos; la regla 5 en retry la sostiene un único test |
| Calidad (sin duplicados) | 15 % | 8,8 | Sin `MANAGER_ROLE_ID`; `findByClientRequestId` única (F16 y JOBS). Resta: doble RPC en GET (N-2); tests de T-6 que derivan la expectativa de la propia constante (M22 la mata un solo `≥ 1_300`) |
| Pruebas (mutaciones, TZ) | 20 % | 9,3 | 277 verdes en dos zonas (verificado por QA); 27/27 mutaciones muertas con md5; `sendWhatsApp` real de F16 en la harness. Resta: concurrencia `SKIP LOCKED`/reclaim sin prueba contra BD; dos guardas con un test |
| Documentación | 10 % | 9,0 | §4.4/§13 r4 exactos y honestos (T-1/T-5/T-7/T-8). Resta: `jobsService.ts:34-36` y §13 r4 (b) ya desfasados respecto a `f00_45`; §13 r5 pendiente |

Media ponderada: 9,2·0,25 + 9,0·0,30 + 8,8·0,15 + 9,3·0,20 + 9,0·0,10 = **9,08 ⇒ 9,1**.

### Veredicto
requiere-nueva-ronda (r5). El código r4 es correcto y seguro tal cual está; la ronda 5 existe porque la
decisión del dueño (`f00_45`) cambia el criterio de permisos y porque esa decisión trae una ampliación no
declarada (retry para Manager) que hay que cerrar antes de cablearla.

## Lista accionable para el builder r5 (prioridad = orden)

### Obligatorios

1. **[medio] Resolver el retry del Manager ANTES de tocar el código** (hallazgo 1). Recomendado (A):
   `supabase/migrations/<ts>_crm_v4_f00_46_retirar_retry_manager.sql`:
   `delete from public.role_permissions rp using public.permissions p where p.id = rp.permission_id and
   p.code = 'crm.jobs.retry' and rp.role_id = 5;` + rollback que lo reinserte con `not exists`; el
   orquestador la aplica por MCP y lo registra en `PROGRESS.md`. Si se elige (B), la decisión va escrita en
   FASE-00 `:734`, cabecera de `retry/route.ts`, §13 r5 y `PROGRESS.md`, y el test de `testerR3.test.ts:404`
   pasa a esperar `true` con la RPC mockeada. En ambos casos el test de contrato lee la migración `f00_45`
   (+ `f00_46` si existe) y comprueba a qué roles concede cada código, para que BD y doc no vuelvan a
   divergir.
2. **[medio] Permisos por código en `src/lib/services/crm/jobsService.ts:38-59`.** Eliminar el import de
   `STAGE_MANAGER_ROLE_IDS` (`:3`); exportar `JOBS_VIEW_PERMISSION = 'crm.jobs.view'` y
   `JOBS_RETRY_PERMISSION = 'crm.jobs.retry'`; `canViewJobs(ctx) = hasOrgAdminOrPermission(subject,
   JOBS_VIEW_PERMISSION)`, `canRetryJobs(ctx) = hasOrgAdminOrPermission(subject, JOBS_RETRY_PERMISSION)`.
   Añadir `resolveJobsPermissions(ctx): Promise<{canView, canRetry}>` con la política (i) del hallazgo 2
   (`retry ⇒ view`, documentada) o (ii) `Promise.all`; `src/app/api/crm/jobs/route.ts:21,41` la llama **una
   vez** y usa `canView` para el 403 y `canRetry` en la respuesta; `[id]/retry/route.ts:25` sigue con
   `canRetryJobs`. Mensajes de 403: «Requiere permiso crm.jobs.view» / «…crm.jobs.retry». Reescribir el
   comentario `:19-37` (sin la frase «hasta que el dueño lo cree»).
   Tests (`jobsService.test.ts`, `builderR4.test.ts:198-260`, `testerR3.test.ts:395-404`,
   `testerR4.test.ts:212-263`, con `supabase.rpc` mockeado): rol 5 + RPC `true` ⇒ ve (**y reintenta solo si
   (B)**); rol 5 + RPC `false` (cargo que lo niega) ⇒ 403 en GET; rol 4 + `crm.jobs.view` `true` y
   `crm.jobs.retry` `false` ⇒ 200 con `canRetry:false` y retry 403; la RPC recibe `p_permission_code`
   `'crm.jobs.view'`/`'crm.jobs.retry'` (nunca `admin.full_access`) y `p_user_id`/`p_organization_id` de la
   sesión; roles 1/2 y super admin sin RPC; RPC con error ⇒ 403 + `warn`; contexto sin `userId` ⇒ `false`
   sin RPC; **GET con cargo ⇒ la RPC se llama como máximo 2 veces y, con (i), 1 vez cuando `retry` es `true`**
   (convertir el test «observación» de `testerR4.test.ts:274` en aserción). Test estático: `jobsService.ts`
   sin `STAGE_MANAGER_ROLE_IDS`, sin `roleId === N`, sin `roleName`.
3. **[bajo] Documentación coherente con la BD.** FASE-00 `:733-734` (auth de las dos rutas por código de
   permiso; roles por defecto según `f00_45`/`f00_46`), `:815` sin cambios, §13 «ronda 5» con: decisión (b)
   del dueño, resolución del retry del Manager, política de RPC de la GET, y que un cargo no puede negar la
   cola a roles 1/2 ni al super admin (`isOrgAdminLike`). `PROGRESS.md` entrada r5 (la escribe el orquestador).

### Opcionales (no bloquean el 9,5 si los obligatorios quedan con tests)

4. **[bajo] Segunda prueba para las dos guardas de un solo test.** `readOrgBody` en retry: añadir en
   `builderR4`/`jobsService.test.ts` un caso «super admin con body de otra org ⇒ 403 y `getServiceClient` no se
   invoca» (mock del módulo `@/lib/supabase/server-service`). T-6: un test que afirme el literal
   `expect(COMPLETE_RETRY_DELAY_MS).toBe(300)` y otro que mida `Δt ≥ 300` sin restar la constante, para que
   `COMPLETE_RETRY_DELAY_MS = 0` muera por más de un test.
5. **[bajo] N-3.** `scheduler.ts:150`: `if (remainingFor(opts.budgetMs) <= 0)` ⇒ `out.maintenance = {ok:false,
   ms:0, error:'budget_exhausted'}` sin arrancar; convertir el test «RESIDUO» de `testerR4` en aserción.
6. **[info] Cosmético de la 41.** Tras aplicarla, anotar en `schedule.ts` y en el `.sql` que el `jobname`
   `crm-jobs-every-minute` ya no describe la cadencia (pg_cron no renombra sin `unschedule`/`schedule`).

### Veredicto sobre aplicar 41 y 42

**Aplicar ambas tal cual, ahora, en este orden: 42 y luego 41.** Las dos son idempotentes, sin credenciales,
con rollbacks verificados contra el estado real de `cron.job` y `pg_indexes`, y no dependen del código r5.
Tras aplicar: `select indexdef from pg_indexes where indexname='idx_messages_org_client_request_id'`, el
`explain` de la cabecera de la 42 (debe dar `Index Scan using idx_messages_org_client_request_id`) y
`select jobid, schedule, active, command from cron.job where jobid in (17,18,19)` (17 `*/2`, 19 con 4 kinds,
`active=false` ×3). Registrar en `PROGRESS.md` y pasar `get_advisors` (performance) por si el índice parcial
sobre expresión aparece como «unused index»: es esperado mientras haya 0 filas con clave.
