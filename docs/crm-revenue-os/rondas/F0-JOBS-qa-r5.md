# F0-JOBS — QA-reviewer — Ronda 5 — 2026-09-16

Insumos: `F0-JOBS-builder-r5.md`, `F0-JOBS-tester-r5.md` (9,2/10; 41 tests; 13 mutaciones: 11 muertas, 1
equivalente, 1 muerta tras test; N-1 [medio]), `F0-JOBS-qa-r4.md` (9,1/10; obligatorios 1–3, opcionales 4–5),
FASE-00 §4.1 `:733-734` y §13 r5 `:1520-1531`. Sin ramas, sin commits, sin editar código ni BD.
Decisión del orquestador para N-1 recibida antes de esta revisión: **opción (b), fail-closed** (reintentar exige
`crm.jobs.retry` **y** `crm.jobs.view`; `resolveJobsPermissions` consulta `view` primero y cortocircuita en
`false`). Este informe da la nota del estado ACTUAL y, aparte, la CONDICIONADA a que (b) quede implementada con test.

## Verificación ejecutada por QA

| Qué | Resultado |
|---|---|
| `TZ=UTC npx jest src/lib/jobs src/__tests__/guardrails.test.ts` | **21 suites / 344 verdes** (263 JOBS + 81 guardrails). La 1.ª ejecución dio **1 rojo transitorio** en `guardrails.test.ts:1348` (caso 21, «ningún `.ts` con bytes de control»): repetido dos veces ⇒ 83/83 y 344/344. Árbol compartido: otra sesión escribió un archivo con un byte de control durante el paseo; no es de JOBS (hallazgo 5) |
| `TZ=America/Bogota …` (mismo patrón) | **21 suites / 344 verdes**, idéntico a UTC |
| `git status` del alcance | 8 archivos r5 modificados + `builderR5.test.ts`, `testerR5.test.ts` y dos informes nuevos; `git stash list` vacío; `supabase/migrations/` **sin** `f00_46`; ningún `.sql` de prueba |
| `grep` del alcance (`jobsService.ts`, `route.ts`, `retry/route.ts`) | Sin `STAGE_MANAGER_ROLE_IDS`, `admin.full_access` ni `roleName` como criterio (`:50,:58` solo lo mencionan/tipan) |
| Consumidores de `canViewJobs`/`canRetryJobs`/`resolveJobsPermissions` fuera de tests | Solo las dos rutas (`route.ts:3,23`, `retry/route.ts:5,29`) |
| BD | No re-consultada: el tester r5 la verificó con el MCP (grants `{1,2,5}` para los dos códigos, `schema_migrations` sin `f00_46`, dry-run del cargo con `rollback`); sus lecturas coinciden con las de QA r4 |
| `tsc` | No re-ejecutado (4 min con heap 8 GB y agentes en paralelo); se acepta el «0 errores» del builder y del tester con tsconfig acotado |

## Hallazgos del tester r5 confirmados con archivo:línea

| Hallazgo | Evidencia | Veredicto |
|---|---|---|
| Obligatorio 1 (retry del Manager, opción B, sin `f00_46`) | `jobsService.ts:34-40`, `retry/route.ts:13-16`, FASE-00 `:734` y `:1524`; `ls supabase/migrations` sin `f00_46` | Confirmado |
| Obligatorio 2 (permisos por código, una resolución por petición) | `jobsService.ts:54-55` códigos; `:66-74` `permissionSubject` (`isSuperAdmin === true`; sin sesión ⇒ `''`/`0` ⇒ `hasOrgAdminOrPermission` devuelve `false` en `orgContext.ts:319`); `:77-85` `try/catch`; `:101-104` `resolveJobsPermissions`; `route.ts:23-26,44`; `retry/route.ts:28-31` (`readOrgBody` antes del permiso) | Confirmado |
| Obligatorio 3 (doc) | FASE-00 `:733-734`, `:1520-1531` | Confirmado, con la salvedad N-1 |
| Opcional 4 (2.ª guarda M22/M26) | `builderR5.test.ts` r5·4a/4b; M13 del tester pasa de 1 a 11 tests rojos | Confirmado |
| Opcional 5 (N-3) | `scheduler.ts:150-154` (`remaining <= 0` ⇒ `budget_exhausted` + `warn`, sin `runMaintenance`), `:157` `Math.max(250, remaining)` conservado | Confirmado |
| QA r4 h.4 (un cargo no niega a 1/2/super admin) | `orgContext.ts:318` `isOrgAdminLike` antes de la RPC; `testerR5` «CERO RPC» | Confirmado y documentado (FASE-00 `:1527`) |
| **N-1 [medio] `retry ⇒ view` anula la negación explícita de `view` por cargo** | `jobsService.ts:102` `if (await canRetryJobs(ctx)) return { canView: true, canRetry: true }` ⇒ con cargo `view=false, retry=true` la GET responde 200 (`route.ts:23-26`) y `retry/route.ts:29` deja reintentar; `crm.jobs.view` **nunca se consulta**. `canViewJobs(ctx)` (`:91-93`) devuelve `false` para el mismo sujeto: las dos exportadas se contradicen (`testerR5.test.ts:212-224` lo afirma como comportamiento real). Lo prometen al revés FASE-00 `:1527` («un cargo que le niegue `crm.jobs.view` lo deja fuera aunque sea Manager»), `jobsService.ts:39-40` y `retry/route.ts:16` («un cargo puede negárselo con precedencia»). Todos los tests «cargo que niega» del builder niegan **ambos** códigos (`rpcByCode({})`: `jobsService.test.ts:53-58`, `builderR4.test.ts:239-247`), por eso no lo vieron | **Confirmado.** No es fuga entre tenants ni escalada: el sujeto es miembro activo con `retry` concedido por su rol. Es un **deny explícito ignorado**: viola la promesa de precedencia del cargo y la regla 6 en espíritu (el servidor resuelve, pero descarta una de las dos respuestas de la BD) |
| N-3 [info] `budgetMs: 0` del paso también salta `maintenance` | `scheduler.ts:150-152` (`remainingFor(opts.budgetMs) = min(paso, total-restante)`) | Aceptado como semántica: la ruta real usa `SCHEDULED_BUDGET_MS > 0`; una línea en §4.4 basta (opcional) |
| N-2 [bajo, proceso] `commit`+`stash` ajenos durante M1 | `e3972da7` en `git log`; la repetición de M1 fue limpia | Aceptado; misma recomendación que r4 N-7 |

## Hallazgos propios de esta ronda

1. **[medio, seguridad] Con (b) la política deja de ser `retry ⇒ view` y pasa a ser `retry = retry ∧ view`; el
   retry también tiene que pagar la segunda RPC.** Hoy `retry/route.ts:29` consulta solo `crm.jobs.retry`. Con
   (b) no basta cambiar `resolveJobsPermissions`: si `canRetryJobs` sigue siendo
   `hasJobsPermission(ctx, JOBS_RETRY_PERMISSION)` (`jobsService.ts:87-89`), el POST seguiría reintentando con
   `view=false`. **Punto único (regla 7):** `resolveJobsPermissions` es la única función que decide `canRetry`;
   `canRetryJobs(ctx)` debe delegar en ella (`(await resolveJobsPermissions(ctx)).canRetry`) o la ruta debe
   llamarla directamente. Si se elige lo primero, los tests estáticos `builderR4.test.ts` r4·3 y
   `testerR5.test.ts:395-400` (orden `await canRetryJobs(ctx)` en el retry) siguen válidos; si lo segundo, hay
   que voltearlos.
2. **[bajo, calidad] N-2 se reabre parcialmente y hay que decirlo.** Con `view` primero, el Manager por defecto
   (`view=true, retry=true`) paga **2 RPC** en la GET y 2 en el retry (hoy 1 y 1); quien no ve paga 1 (hoy 2).
   `JobsMonitor` refresca cada 2 min; el coste es aceptable y es el precio del fail-closed. `Promise.all` no
   reduce el conteo (siempre 2) y pierde el cortocircuito: la política secuencial del orquestador es la correcta.
   FASE-00 `:733` («una sola RPC cuando `crm.jobs.retry` es `true`»), `jobsService.ts:42-47,95-99` y
   `route.ts:12-13` quedan falsos con (b) y hay que reescribirlos.
3. **[bajo, contrato] Cambio de semántica para el cargo que concede SOLO `retry` a un rol sin `view`.** Hoy
   `testerR5.test.ts:200-210` (rol 4 + cargo `retry=true`) ⇒ 200/404; con (b) ⇒ 403/403 (1 RPC). Es lo
   coherente con «reintentar exige ambos», pero es una regresión funcional visible para quien haya configurado
   un cargo así: debe quedar escrito en §4.1 y §13 r5 («para conceder el retry por cargo hay que conceder
   también la vista»). En la BD de hoy no hay ninguna fila `job_position_permissions` con `crm.jobs.%` (tester
   r5), así que nadie pierde acceso real.
4. **[info, pruebas] Tests que pasan a rojo con (b) y hay que voltear en el mismo cambio** (conteo/orden de
   RPC o aserción del comportamiento N-1): `jobsService.test.ts:66-79` (1 RPC con retry; orden `[retry, view]`),
   `builderR4.test.ts:249-259` (orden; 1 RPC), `builderR5.test.ts:118-133` (rol 5 ⇒ 1 RPC; rol 3/4 ⇒ 2),
   `testerR4.test.ts:267,311` (orden; 1 RPC), `testerR5.test.ts:166-218` (seis casos con `getCodes`),
   `testerR5.test.ts:402-410` (estático: `canRetryJobs(ctx)` antes de `canViewJobs(ctx)` en el cuerpo).
   `testerR5.test.ts:412` (N-1 documental) **se conserva**: con (b) la frase de `:1527` pasa a ser verdad.
5. **[info, proceso] Rojo transitorio en guardrails 21.** Un archivo bajo `src/` tuvo un byte de control
   durante mi primera ejecución y desapareció antes de la segunda. No hay nada que corregir en JOBS; si vuelve a
   aparecer en el cierre, el detector imprime `ruta:línea (0xNN)` y hay que mirar la sesión que lo escribió.

## Calificación del estado ACTUAL: 9,2/10

| Dimensión | Peso | Nota | Por qué |
|---|---|---|---|
| Funcionalidad / contrato | 25 % | 9,3 | Obligatorios 1–3 y opcionales 4–5 cerrados con evidencia triple (código, BD, tests). Resta: N-1, el contrato del código contradice la precedencia del cargo que la doc promete |
| Seguridad (regla 6, fail-closed) | 30 % | 9,1 | Sin listas de roles; RPC con usuario/org de sesión; `data === true`; error/excepción ⇒ 403 + `warn`, nunca 500; `readOrgBody` antes del permiso con 2.ª guarda (M13: 11 tests). Resta: una negación explícita de `view` por cargo se ignora en GET y retry (N-1) |
| Calidad (punto único, sin duplicados) | 15 % | 9,2 | `resolveJobsPermissions` única en la GET; `hasJobsPermission` único punto de captura. Resta: `canViewJobs` y `resolveJobsPermissions` dan respuestas distintas al mismo sujeto; `try/catch` duplicado con `orgContext.ts:325-334` (M3/M6 equivalentes, documentado como defensa en profundidad) |
| Pruebas (mutaciones, TZ) | 20 % | 9,5 | 344 verdes en dos zonas (verificado por QA); 12/13 mutaciones muertas con md5, la restante equivalente; conteo y orden de RPC afirmados; rutas reales con doble fiel de la RPC. Resta: `testerR5:212` afirma el comportamiento indeseado; el mínimo de 250 ms lo sostiene un solo test (M11) |
| Documentación | 10 % | 8,8 | §4.1 y §13 r5 exactos en todo salvo `:1527`, que promete lo contrario de `jobsService.ts:102`; `jobsService.ts:39-40` y `retry/route.ts:16` repiten la promesa |

Media ponderada: 9,3·0,25 + 9,1·0,30 + 9,2·0,15 + 9,5·0,20 + 8,8·0,10 = **9,215 ⇒ 9,2**.

## Calificación CONDICIONADA a (b) implementada con test: 9,6/10 — aprobada si el test demuestra lo de abajo

| Dimensión | Peso | Nota | Qué cambia |
|---|---|---|---|
| Funcionalidad / contrato | 25 % | 9,6 | Código, BD y doc dicen lo mismo: el cargo manda sobre cada código |
| Seguridad | 30 % | 9,6 | Deny explícito respetado; fail-closed con cortocircuito en `view=false` |
| Calidad | 15 % | 9,4 | Un solo punto decide `canRetry`; `canRetryJobs` ya no puede contradecir a `resolveJobsPermissions` |
| Pruebas | 20 % | 9,6 | El caso N-1 pasa de «aserción del comportamiento real» a contrato; conteo de RPC por sujeto |
| Documentación | 10 % | 9,5 | `:733-734`, `:1527`, cabeceras reescritas; hallazgo 3 registrado |

Media: 9,6·0,25 + 9,6·0,30 + 9,4·0,15 + 9,6·0,20 + 9,5·0,10 = **9,56 ⇒ 9,6**.

### Lo que el test de cierre debe demostrar (todo con `TZ=UTC` y `TZ=America/Bogota`, rutas reales, RPC con la semántica de la BD)

1. **rol 5 + cargo que niega SOLO `crm.jobs.view`** (RPC: `view=false`, `retry=true`): `GET /api/crm/jobs` ⇒
   **403** «Requiere permiso crm.jobs.view» con **exactamente 1 RPC** y `p_permission_code = 'crm.jobs.view'`
   (`crm.jobs.retry` no se pregunta); `POST …/retry` ⇒ **403** con **0** `getServiceClient` y sin llegar a
   `retryJob`; `resolveJobsPermissions(s)` ⇒ `{canView:false, canRetry:false}`; `canRetryJobs(s)` ⇒ `false`
   y `canViewJobs(s)` ⇒ `false` (las tres funciones coinciden).
2. **rol 5 por defecto** (`f00_45`, ambos `true`): GET 200 `canRetry:true` con **exactamente 2 RPC en el orden
   `['crm.jobs.view', 'crm.jobs.retry']`**; retry llega a `retryJob` (404 en el arnés) con 1 `getServiceClient`.
3. **rol 5 + cargo que niega SOLO `crm.jobs.retry`**: GET 200 `canRetry:false` (2 RPC); retry 403, 0 service.
4. **rol 4 + cargo que concede SOLO `crm.jobs.retry`**: GET 403 (1 RPC, `view`); retry 403 (hallazgo 3, volteo
   de `testerR5:200`).
5. **rol 4 sin cargo**: GET 403 con **1 RPC** (`view`); retry 403 con 0 service.
6. **rol 1/2 y super admin**: ambos `true` con **0 RPC** (sin cambios).
7. **Fail-closed**: RPC que lanza / `{error}` / `'true'` / `1` / `null` en la consulta de `view` ⇒ 403 con 1
   RPC y sin consultar `retry`; en la de `retry` (con `view=true`) ⇒ 200 `canRetry:false` y retry 403.
8. **Estático**: en el cuerpo de `resolveJobsPermissions` la consulta de `view` precede a la de `retry`
   (`indexOf`); el retry no contiene ninguna llamada a `hasJobsPermission(ctx, JOBS_RETRY_PERMISSION)` ni a
   `hasOrgAdminOrPermission(…, 'crm.jobs.retry')` que evite `view` (o, si `canRetryJobs` delega, su cuerpo
   contiene `resolveJobsPermissions(ctx)`). **Mutaciones que deben morir:** invertir el orden (retry primero),
   quitar el cortocircuito (`view=false` ⇒ seguir preguntando), `canRetry: retry` sin `&& view`, y
   `canRetryJobs` volviendo a consultar solo `retry`.
9. **Doc**: FASE-00 `:733` sin «una sola RPC cuando `crm.jobs.retry` es `true`» y con «reintentar exige ambos
   códigos; `view=false` cierra la cola con 1 RPC»; `:734` «el Manager reintenta si además puede ver»; `:1527`
   se conserva y se completa con el hallazgo 3; `jobsService.ts:42-47,95-99`, `route.ts:12-13` y
   `retry/route.ts:11-16` reescritos; el test documental de `builderR5` y `testerR5:412` verdes. Entrada r5 de
   `PROGRESS.md` (orquestador) con la decisión (b) y el coste de RPC.
10. Suites `src/lib/jobs` + `guardrails` verdes en las dos zonas; el resto de tests del hallazgo 4 volteados,
    no borrados.

Con esos 10 puntos demostrados, F0-JOBS queda **aprobada (9,6)** sin ronda 6. Si el cierre llega sin el punto 1
o sin el 8 (mutaciones), la nota se queda en 9,2 y (b) pasa a ser el único obligatorio de r6.

## Opcionales (no condicionan la aprobación)

- Un segundo test para el mínimo de 250 ms de `maintenance` (M11 muere por uno solo).
- Una línea en §4.4: «`budgetMs` del paso en 0 también salta `maintenance`» (N-3 info del tester).
- Retirar el `try/catch` de `hasJobsPermission` (M3/M6 equivalentes) o dejarlo: decisión de estilo; si se
  queda, la cabecera ya lo justifica.
- Cosmético de la 41 (`jobname crm-jobs-every-minute`), pendiente desde r3.
