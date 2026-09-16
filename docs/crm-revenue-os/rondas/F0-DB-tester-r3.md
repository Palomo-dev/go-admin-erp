# F0-DB — Informe del tester — Ronda 3 (B1–B7 del constructor)

Fecha: 2026-09-15 · Proyecto Supabase `jgmgphmzusbluqhuqihj` · Insumos: `rondas/F0-DB-builder-r3.md`, `rondas/F0-DB-qa-r2.md`, `rondas/F0-DB-tester-r2.md`, `docs/POLITICA-MIGRACIONES.md`.
Método: SELECT vía MCP; los dry-run de las 3 migraciones pendientes se ejecutaron **dentro de un bloque `DO` que termina en `RAISE EXCEPTION`** (la excepción devuelve las mediciones y aborta la transacción: nada queda aplicado). Verificación de B1 con script propio (`sha256` + longitud en caracteres del cuerpo sin las 2 líneas de cabecera, contra `sha256(convert_to(array_to_string(statements, E'\n'),'UTF8'))` de `supabase_migrations.schema_migrations`), no con el md5 del constructor. Las organizaciones se citan solo por id. **Nada se aplicó**: el estado final de la base es el previo (ver §6).

## Resumen de pruebas
- Casos ejecutados: 50
- Pasaron: 43
- Fallaron: 7 (2 medios, 5 bajos; 3 de ellos fuera del perímetro de F0-DB)

## 1. B1 — Reconstrucción de las 56 migraciones

| # | Comprobación | Resultado |
|---|---|---|
| 1 | 56 filas en `schema_migrations` (`crm_v4_%` + `crm_customer_lifecycle_ladder`), todas con `array_length(statements,1) = 1` | PASA (56/56, n=1) |
| 2 | Cuerpo del archivo (sin cabecera) = `statements[1]`: sha256 **y** longitud en caracteres, script propio | **PASA: 56/56 idénticos** |
| 3 | Cabecera exactamente 2 líneas (`-- Aplicada el …` / `-- Motivo: …`), UTF-8, LF | PASA (56/56) |
| 4 | Comprobación puntual de `crm_v4_f00_13` (`crm\_%`, `auth\.uid\(\)`): las barras del archivo coinciden con la base | PASA |
| 5 | 56 rollbacks presentes y no vacíos | PASA |
| 6 | Credenciales en los 171 `.sql` nuevos/modificados de `supabase/` (JWT, `sk-`, `sk_live/test`, `re_`, SID Twilio, DSN con password, `*_key/secret/password/token = '…'`, `vault.create_secret('…')`, `Bearer …`) | PASA: 0 |
| 7 | Nombres de `organizations.name` (≥ 6 caracteres, 84 orgs) en los mismos 171 archivos | PASA: 25 coincidencias, **todas la org 6** (palabra genérica «organizaciones», falso positivo ya documentado) |
| 8 | B7: nombre de la org 2 fuera de `20260910201206_vertical_del_prompt_por_organizacion.sql` L4 y de `ai-auto-response/index.ts` (ahora L1240) | PASA («la org 2»; 0 coincidencias en `supabase/**` y `docs/crm-revenue-os`) |
| 9 | Rollback `f00_29` no-op «porque la versión previa no está en el repositorio y era defectuosa» | **FALLA (bajo)**: la versión previa **sí es recuperable**: `schema_migrations` versión `20260110211238` (`trigger_customer_channel_identities_omnicanal`, 2 296 caracteres) contiene el `CREATE OR REPLACE FUNCTION fn_update_customer_channel_identity()` anterior. La decisión de no-op es defendible (esa versión revertía todo INSERT entrante), pero la justificación escrita («no recuperable») es falsa y el archivo debería citar la fuente para que quien lo necesite pueda reconstruirla con criterio. |
| 10 | Rollback `f00_30` «reconstrucción semántica porque el texto exacto no existe» | **FALLA (medio)**: el texto exacto anterior está en `schema_migrations` versión `20260901202059` (`f2_fn_sync_status_from_stage`, 1 282 caracteres) y **difiere** de la reconstrucción (la original estampa `closed_at = now()` sin `COALESCE` y actualiza sin la guarda `status IS DISTINCT FROM`). Además, `fn_sync_status_from_stage` fue redefinida **después** por `20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre`, `crm_v4_f09_stage_write_hardening` y `crm_customer_lifecycle_ladder`: ejecutar este rollback hoy pisa esas tres versiones y el archivo no lo advierte. Mismo riesgo de orden, sin advertencia, en `f00_32`/`f00_33` (`f00_35` volvió a tocar esas funciones, aunque solo grants/`search_path`). |

## 2. Dry-run de las 3 migraciones pendientes (todo dentro de una transacción abortada)

Datos usados: usuario A = miembro activo **solo** de la org 145 (88 filas en `ai_usage_logs`), usuario B = miembro solo de la org 113 (10 507 filas), cliente de la org 145 y cliente de la org 113. Impersonación con `set local role authenticated` + `set_config('request.jwt.claims', '{"sub":…,"role":"authenticated"}', true)`.

| Migración | Comprobación | Resultado |
|---|---|---|
| f00_36 | `has_table_privilege('anon', …)` INSERT/SELECT en `ai_usage_logs` y `comm_usage_logs` | PASA: false/false en ambas |
| f00_36 | `authenticated`: INSERT y UPDATE en ambas tablas → false; SELECT → true; `service_role` INSERT → true | PASA |
| f00_36 | Como `authenticated` A: `INSERT INTO ai_usage_logs (organization_id) VALUES (145)` | PASA: `42501 permission denied` |
| f00_36 | Como `anon`: SELECT/INSERT en `ai_usage_logs`, SELECT en `call_recordings` | PASA: 42501 en los tres |
| f00_36 | Como `authenticated` A: `count(*)` de `ai_usage_logs` = 88 y 0 de otras organizaciones; B: 10 507 y 0 de otras | PASA (lectura solo de su organización) |
| f00_36 | `pg_policies` de las 3 tablas: total 6; 0 con `auth.uid()` sin `(select`; 0 con `roles={public}` o `with_check=true` | PASA (las 4 `rec_*` quedan con `(select auth.uid())`) |
| f00_36 | Idempotencia: aplicada dos veces seguidas → mismo md5 de políticas+grants | PASA |
| f00_36 rollback | Migración + rollback en la misma transacción → md5 de políticas+grants de las 3 tablas = baseline (`a7839fff…`) | PASA: restaura **exactamente** |
| f00_37 (antes) | Como `authenticated` A, estado actual: `fn_can_contact(113, <cliente de 113>, 'email')` | `true` (oráculo entre organizaciones confirmado); `'EMAIL'` → false |
| f00_37 | Como `authenticated` A tras la migración: org ajena → `false`; `'EMAIL'` = `'email'` = `' Email '` → `true`; `NULL`/`'fax'`/cliente de B en org A/org −1 → `false` | PASA |
| f00_37 | Como `service_role` (claims role=service_role): org 113 → true, org 145 → true (sin guarda, como pide el QA); como `anon`: 42501 | PASA |
| f00_37 | ACL de `fn_can_contact` antes = después (`{postgres,authenticated,service_role}`); `fn_release_job` `{postgres,service_role}` | PASA |
| f00_37 | Rol `authenticated` **sin claims JWT** (`auth.role()` = NULL): org ajena → `true` | **FALLA (bajo)**: la guarda depende de `request.jwt.claims`, no del rol de sesión. Por PostgREST los claims siempre viajan, así que hoy no es explotable; queda documentado como límite del diseño `auth.role()` (una conexión directa con rol `authenticated` sin JWT no existe en Supabase). |
| f00_37 | `fn_release_job` con worker ajeno y con worker NULL sobre un job `running` de `w1` | PASA: false/false, fila intacta |
| f00_37 | 10 liberaciones seguidas (job `noop` de prueba, `max_attempts=5`, re-reclamado entre llamadas) | PASA: `releases` 1→10; `run_at − now()` = **30, 60, 120, 240, 480, 900, 900, 900, 900, 900 s**; `attempts` 0; `status` `queued` hasta la 9.ª y **`dead` en la 10.ª** con `last_error = 'released_limit: 10 liberaciones por deadline (worker w1)'` |
| f00_37 | 11.ª llamada sobre el job `dead` → `false`, sin cambios; el job aparece en `v_outbound_jobs_failed` | PASA |
| f00_37 | Trigger `set_outbound_jobs_updated_at` existe → `updated_at` se refresca al morir y la retención de 30 d de `maintenance` le aplica | PASA |
| f00_37 | Columna `releases` aditiva (`int NOT NULL DEFAULT 0`); aplicada dos veces sin error | PASA |
| f00_37 rollback | Migración + rollback → md5 de `pg_get_functiondef` de `fn_can_contact` (`86100765…`) y `fn_release_job` (`8b2433b2…`) **iguales al baseline**, ACL igual, comment NULL, columna `releases` ausente | PASA: restaura exactamente |
| limpieza | Jobs `crm_event` con `payload->>'event_id'` que no es uuid (el cast del `NOT EXISTS` fallaría) | PASA: 0 |
| limpieza | DELETE → filas borradas, ids y organización | PASA: **6**, los 6 ids del comentario de la migración, todos org 125, evento inexistente |
| limpieza | Antes/después: total 481 → 475 (Δ = 6), `v_outbound_jobs_failed` 6 → 0, `crm_event` `failed` 6 → 0, `crm_event` `done` intactos (25) | PASA: solo desaparecen los 6 huérfanos |
| limpieza | Segunda ejecución del mismo DELETE | PASA: 0 filas (idempotente) |
| limpieza rollback | `select 1` con aviso «NO restaura datos» | PASA (coherente con POLITICA-MIGRACIONES) |

Observación cosmética (no cuenta como fallo): al morir por tope, `fn_release_job` deja `run_at = now() + 900 s` en el job `dead`; inocuo (`dead` no se reclama) pero confuso en la vista.

## 3. Código

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `TZ=UTC npx jest src/lib/jobs src/lib/services/__tests__/aiCostService.test.ts src/__tests__/guardrails.test.ts` (paralelo) | 234/238: 4 fallos por `Exceeded timeout of 5000 ms` en `testerR2Runner`/`testerR3Runner` (presupuestos con reloj real); en aislamiento 25/25 |
| 2 | Lo mismo con `--runInBand`: UTC → 237/238 (`roles › ver la cola…`, `jobsService.test.ts`); Bogotá → 235/238 (el mismo + 2 de `handler whatsapp — idempotente`); dos repeticiones seriadas posteriores de `src/lib/jobs` → **147/147 y 147/147** | **FALLA (bajo, no atribuible a F0-DB)**: no determinista; los archivos son de F0-JOBS/F0-REG y el árbol está siendo editado en paralelo por otros builders (`git status` los marca modificados). |
| 3 | Suites tocadas por F0-DB r3 (`runner.test.ts`, `handlers.test.ts`) + `aiCostService` + `guardrails`, `TZ=America/Bogota` | PASA: 115/115 (incluye «tope de liberaciones: 12 liberaciones → backoff 30…900 s y dead desde la 10.ª») |
| 4 | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` filtrado por `lib/jobs|aiCost|maintenance|commCredits` | PASA: 0 (5 errores totales en el repo, todos en `deliveryIntegrationService.ts`, ajenos) |
| 5 | `runner.ts` fallback = regla SQL (`releaseBackoffSeconds`: 30·2^(n−1) tope 900; `releaseCap` = `max_attempts·2`; `releases` solo si la fila lo trae) | PASA (lectura de código) |

## 4. Documentación (B3)

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `FASE-00` §3 remite a `docs/POLITICA-MIGRACIONES.md` y declara derogada la regla «prohibido crear `.sql`»; §10 tacha «Cero `.sql` nuevos»; §13.1 firmas de `fn_release_job`/`fn_can_contact` y línea «Archivos versionados en la ronda 3»; §4.4 tope de liberaciones | PASA, coherente con la política (MCP + `.sql` + rollback en el mismo commit) |
| 2 | `POLITICA-MIGRACIONES.md` «Deuda actual»: saldadas las 55 + 1 con las limitaciones de 29/30 y de los seeds | PASA (pero hereda la inexactitud del punto B1-9/10: las versiones previas sí están en `schema_migrations`) |
| 3 | Referencias a `scratchpad/reports/DB-0-r1..r4.md` | PASA: sustituidas |
| 4 | Referencias rotas restantes en `FASE-00`: L1408 `scratchpad/reports/REG-0-r1.md`, L1472 `scratchpad/jobs-http-harness.ts` | **FALLA (bajo, fuera de F0-DB)**: zonas REG/JOBS; el constructor lo declaró |
| 5 | `docs/crm-revenue-os/PROGRESS.md`: entrada «F0-DB — Ronda 3 construida — 2026-09-15» aparece **dos veces** (L59 y L99) con contenido distinto | **FALLA (bajo)**: duplicado; conviene fusionar en una sola (el archivo solo se anexa, así que basta una nota) |
| 6 | Recuento 55 `crm_v4_*` + 1 = 56 (el QA contó 58) | PASA: 56 filas en la base con `name like 'crm_v4_%' or name = 'crm_customer_lifecycle_ladder'` |

## 5. Hallazgo del constructor: `commCreditsService.ts` con cliente de navegador en el servidor

Confirmado y clasificado: **bug funcional preexistente, medio, fuera del perímetro de F0-DB (zona Twilio/F16); no es de seguridad ni una regresión de f00_36.**
- `src/lib/services/commCreditsService.ts:8` importa `supabase` de `@/lib/supabase/config` (cliente anon sin cookie en servidor) y lo usan dos route handlers: `src/app/api/integrations/twilio/credits/route.ts:32-33` y `src/app/api/integrations/twilio/usage/route.ts:31`.
- Estado **hoy** (medido): `has_table_privilege('anon','comm_settings','SELECT') = false` desde `crm_v4_f00_06` → `getCreditsStatus` recibe error → `null` → **`/api/integrations/twilio/credits` responde 404** «No se encontraron créditos». `comm_usage_logs` sí concede SELECT a `anon` pero la política filtra por `auth.uid()` → `/usage` y el resumen mensual devuelven vacío/ceros en silencio.
- Tras f00_36: `comm_usage_logs` pasa de «0 filas» a «42501 permission denied», que ambos métodos capturan (`console.error` + `{ data: [], count: 0 }` / ceros). Resultado observable idéntico: **sin regresión**.
- Corrección (para F16/Twilio, no para esta ronda): pasar `ctx.supabase` (sesión, RLS por pertenencia) o `getServiceClient()` con la org ya validada; de paso `getMonthlyUsageSummary` calcula `startOfMonth` con la hora local del servidor, no con `todayInTz(tz)` (regla de fechas 1/6).
- No está en la `ALLOWLIST` del guardrail 6 (`src/__tests__/guardrails.test.ts:338`): revisar por qué el guardrail no lo detecta (probablemente el barrido solo cubre `app/api/**` y `lib/services/crm/**`).

## 6. Estado de la base al terminar (nada aplicado)

Snapshot md5 (políticas y grants de las 3 tablas + `outbound_jobs`, `pg_get_functiondef`+ACL+comment de las 2 funciones, columnas de `outbound_jobs`, conteo e ids de jobs) **antes y después de los 5 dry-run: `30214e74270c6b7e889702c7dc1e0603` en ambos**. Comprobaciones directas: 7 políticas en las 3 tablas (`Service role can insert AI usage logs` sigue con `with_check=true`), `has_table_privilege('anon','ai_usage_logs','INSERT') = true` (estado inseguro previo, como corresponde hasta que el dueño aplique f00_36), sin columna `outbound_jobs.releases`, 481 jobs (6 `failed`), 0 jobs de prueba residuales (`kind='noop'`, `payload.dry`), 0 sesiones `idle in transaction`, comment de `fn_can_contact` NULL, md5 de las dos funciones = baseline.

## Fallos encontrados
1. **[medio] Rollback de `crm_v4_f00_30` es una reconstrucción cuando el texto exacto existe, y pisa tres redefiniciones posteriores sin avisar.** Reproducir: `select statements[1] from supabase_migrations.schema_migrations where version='20260901202059'` → cuerpo original de `fn_sync_status_from_stage` (difiere: `closed_at = now()` sin `COALESCE`, sin guarda `status IS DISTINCT FROM`). `select version, name from schema_migrations where version > '20260909045035' and array_to_string(statements,E'\n') like '%fn_sync_status_from_stage%'` → `20260909052947`, `crm_v4_f09_stage_write_hardening`, `crm_customer_lifecycle_ladder`. Esperado: rollback con el cuerpo exacto (o, si se prefiere la semántica, decirlo con la cita) y una advertencia «solo válido si antes se revirtieron X, Y, Z». Obtenido: reconstrucción etiquetada como «no existe el texto» y sin advertencia de orden.
2. **[medio, fuera de F0-DB] `commCreditsService` en servidor con cliente anon**: `/api/integrations/twilio/credits` ya responde 404 hoy y `/usage` vacío (ver §5). Esperado: datos de la organización de la sesión. Obtenido: 404 / `{data:[],count:0}`. No es regresión de f00_36.
3. **[bajo] Rollback de `crm_v4_f00_29` justificado con un dato falso** («versión previa no recuperable»): está en `schema_migrations` versión `20260110211238`. Esperado: no-op con la cita y el motivo real (era defectuosa). Obtenido: no-op con motivo parcialmente incorrecto.
4. **[bajo] Guarda de `fn_can_contact` basada en `auth.role()`**: con rol `authenticated` y sin `request.jwt.claims` la guarda no aplica (medido: org ajena → `true`). No explotable por PostgREST; documentar el supuesto en el comentario de la función.
5. **[bajo, fuera de F0-DB] Suites de `src/lib/jobs` no deterministas** (timeouts de 5 s en `testerR2Runner`/`testerR3Runner` en paralelo; `roles › ver la cola` y 2 de `handler whatsapp` en serie una vez, 147/147 en las dos repeticiones siguientes). Zona JOBS/REG con el árbol en edición concurrente.
6. **[bajo, fuera de F0-DB] Referencias rotas** en `FASE-00` L1408 (`scratchpad/reports/REG-0-r1.md`) y L1472 (`scratchpad/jobs-http-harness.ts`).
7. **[bajo] Entrada «F0-DB — Ronda 3 construida» duplicada** en `docs/crm-revenue-os/PROGRESS.md` (L59 y L99).

## Cobertura no probada / riesgos pendientes
- Las 3 migraciones se probaron en transacción abortada, no aplicadas: el `apply_migration` real y los advisors (`auth_rls_initplan` a 0 en las 3 tablas) quedan para después de que el dueño las aplique. Orden recomendado: f00_36 → f00_37 → limpieza (independientes entre sí; f00_39 de F0-SEC delega los grants de `*_usage_logs` a f00_36).
- `fn_release_job` se probó con un solo worker y llamadas secuenciales; no con dos workers concurrentes (`SKIP LOCKED` en `fn_claim_jobs`), igual que en la ronda 2.
- Los 15 escritores de `*_usage_logs` con `service_role` se aceptan por la trazabilidad del constructor (ruta → cliente); no se ejecutó una transcripción real contra la base.
- `contact_consents` sigue sin filas: la rama `opted_out` de `fn_can_contact` no se probó con datos.
- Rollbacks de B1 (56) no se ejecutaron (ni en transacción): se revisaron 29/30/32/33/35 y los de seeds por lectura. Solo los 3 rollbacks nuevos se probaron de verdad.
- Los archivos temporales de esta ronda (`compare.py`, `scan.py`, `db_hashes.tsv`) viven en el scratchpad de la sesión, no en el repositorio; el listado de nombres de organizaciones usado por `scan.py` se borró al terminar.

## Calificación de robustez (1-10, opinión técnica)
9,0/10 — Las tres migraciones pendientes hacen exactamente lo que dicen, son idempotentes y sus rollbacks restauran el estado byte a byte (md5 igual al baseline) en transacción; la reconstrucción B1 es 56/56 idéntica por sha256 y longitud con verificación independiente, sin credenciales ni nombres de clientes. Lo que resta: los rollbacks 29/30 se justificaron con «texto no recuperable» cuando `schema_migrations` lo conserva, y el de 30 aplicado hoy regresaría tres migraciones posteriores sin avisar; la guarda por `auth.role()` es correcta bajo PostgREST pero merece dejar escrito el supuesto.
