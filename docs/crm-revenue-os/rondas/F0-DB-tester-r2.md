# F0-DB — Informe del tester — Ronda 2 (QA de las migraciones `crm_v4_f00_12..16`)

Fecha: 2026-09-15 · Proyecto Supabase `jgmgphmzusbluqhuqihj` · Solo lectura (SELECT vía MCP, `list_migrations`, `get_advisors`).
Alcance: los ocho pendientes P1–P8 de la ronda 1, coherencia repo↔BD, advisors, integridad de datos e higiene de los `.sql` del repo.
Las organizaciones se citan solo por id.

## Resumen de pruebas
- Casos ejecutados: 74
- Pasaron: 66
- Fallaron: 8 (1 alto, 1 medio, 6 bajos; el 8 está fuera del perímetro de F0)

Los ocho puntos P1–P8 están aplicados en la base de datos tal y como PROGRESS.md los describe. El único hallazgo alto no está en la base sino en el repositorio: ninguna de las 35 migraciones `crm_v4_f00_*` (ni las 23 `crm_v4_f04..f09` posteriores) tiene su `.sql` en `supabase/migrations/` ni su reversión en `supabase/rollbacks/`.

## Verificación P1–P8 (evidencia)

| P | Qué se pedía | Consulta | Resultado |
|---|---|---|---|
| P1 | `noop` en el CHECK de `outbound_jobs.kind` | `select pg_get_constraintdef(oid) from pg_constraint where conname='outbound_jobs_kind_check'` | PASA. 15 kinds, incluye `noop` y `time_events`. `status` CHECK: queued/running/done/failed/dead. 0 filas fuera de ambos CHECK. |
| P2 | `fn_can_contact` fail-closed | `select fn_can_contact(org, cust, 'fax')`, `(…, NULL)`, `(…, 'EMAIL')`, `(…, 'email')`, cliente inexistente, `(-1, cust, 'email')`, purpose inválido | PASA. `fax`→false, `NULL`→false, `EMAIL`→false (sensible a mayúsculas: los llamadores deben normalizar), `email`→true, cliente inexistente→false, org ajena→false, purpose inválido→true (se ignora, documentado en la función). `SECURITY DEFINER`, `search_path=public`, `anon` sin EXECUTE. |
| P3 | `(select auth.uid())` en las políticas F0 | `select qual, with_check from pg_policies where tablename in (…)` | PASA para las 21 políticas F0 (outbound_jobs 1, crm_events 1, contact_consents 4, user_comm_preferences 4, provider_configs 1, comm_settings 2, storage crm-documents 4, storage crm-call-recordings 4). Ninguna con `qual = true` salvo `provider_pricing_select` (catálogo global, `TO authenticated`, sin escritura, `anon` sin SELECT: aceptable). **Fallo 2**: `call_recordings` (`rec_select/insert/update/delete`) sigue con `auth.uid()` sin subselect. |
| P4 | Vistas solo lectura | `information_schema.role_table_grants` para `v_outbound_jobs_failed`, `v_provider_configs_safe` | PASA. `authenticated`: solo SELECT; `anon`: nada; ambas `security_invoker=true`. `has_column_privilege('authenticated','provider_configs','credentials','SELECT')=false`; `comm_settings.twilio_subaccount_auth_token` también oculto. `authenticated` sin INSERT/UPDATE/DELETE en `outbound_jobs`, `crm_events`, `provider_pricing`. |
| P5 | Límites del bucket `crm-documents` | `select file_size_limit, allowed_mime_types, public from storage.buckets` | PASA. 26 214 400 B (25 MB), 28 MIME (los del plan, incl. `application/octet-stream`, sin html/svg/js), privado. `crm-call-recordings`: 200 MB, 8 MIME de audio, privado. 8 políticas de storage con `(select auth.uid())` y membresía activa. |
| P6 | `fn_crm_cron_post(p_path, p_body)` y jobs 18/19 | `select * from cron.job where jobid in (17,18,19)`; `pg_get_functiondef` | PASA. 17 `* * * * *` sin body; 18 `*/5` body `{"kinds":["campaign_batch"]}`; 19 `30 8` body `{"kinds":["recording_cleanup","maintenance"]}`. Los tres `active=false`; 0 filas en `cron.job_run_details`. La función lee `crm_cron_secret` y `crm_app_url` de Vault (ambos existen desde 2026-09-08), falla cerrada si faltan, timeout 55 s, solo `service_role`. |
| P7 | `fn_release_job` | `pg_get_functiondef('fn_release_job')` + grants | PASA. Guarda `status='running' AND locked_by=p_worker`, `attempts = GREATEST(attempts-1,0)`, `run_at=now()`, devuelve boolean. Solo `postgres`/`service_role`. Igual para `fn_claim_jobs` (reclama huérfanos >10 min: dead si `attempts>=max_attempts`), `fn_fail_job` (`-1`→failed, `>=max`→dead, backoff 60·2^n máx 1 h + jitter), `fn_complete_job`, `fn_enqueue_job` (dedupe con índice parcial `outbound_jobs_dedupe_live_uidx`), `fn_emit_crm_event` (inserta y encola `crm_event:{id}`). Triggers `trg_opp_created_enqueue` y `trg_opp_stage_change_enqueue` activos; sus funciones sin EXECUTE para anon/authenticated. |
| P8 | `crm_events.attempts/last_error` | `information_schema.columns` | PASA. `attempts integer NOT NULL DEFAULT 0`, `last_error text NULL`. Consumidor real: `src/lib/jobs/handlers/crmEvent.ts` (`markEventFailed`) y `maintenance.ts` (abandona con `attempts>=3`). |

## Fallos encontrados

1. **[alto] Las migraciones de F0 no existen en el repositorio: ni `.sql` ni rollback.**
   - Reproducir: `list_migrations` devuelve 35 entradas `crm_v4_f00_01..35` (versiones 20260908214513 … 20260909050212) y 23 más `crm_v4_f04/f05/f06/f08/f09*`. `ls supabase/migrations | grep crm_v4` y `ls supabase/rollbacks | grep crm_v4` devuelven 0 archivos; `git ls-files | grep crm_v4` también 0. Tampoco están en los repos hermanos (`goadmin-websites`, `go-admin-sellers`, `go-admin-super`).
   - Esperado (CLAUDE.md regla 1 y `docs/POLITICA-MIGRACIONES.md`): cada migración deja su `.sql` y su reversión en el mismo commit.
   - Obtenido: el SQL aplicado solo vive en `supabase_migrations.schema_migrations` de producción; la afirmación de la ronda 2 «Verificado en rollback» no es verificable ni repetible. Atenuante: las rondas 1–2 (2026-09-08) son anteriores a la política vigente desde 2026-09-09, que sustituyó la regla «cero .sql en el repo»; pero las 19 migraciones del 2026-09-09 (17–35) y las 23 de F04–F09 ya caen bajo la nueva política y tampoco están. Es deuda que hay que saldar antes de cerrar F0: extraer el SQL de `schema_migrations` (`select version, name, statements from supabase_migrations.schema_migrations where name like 'crm_v4_%'`) y escribir los pares migración/rollback.

2. **[medio] `call_recordings`: 4 políticas RLS con `auth.uid()` sin `(select …)`.**
   - Consulta: `select policyname, qual from pg_policies where tablename='call_recordings'` → `rec_select/insert/update/delete` usan `om.user_id = auth.uid()`.
   - `get_advisors(performance)` las lista en `auth_rls_initplan`. Son de la tabla que F0-01 tocó (`call_recordings.updated_at`) y cuyo bucket F0-02 creó, así que la afirmación «advisors initplan de F0: 21→0» es cierta solo si se excluye esta tabla. Corregir en la próxima migración con el mismo patrón que el resto.

3. **[bajo] `fn_can_contact` es un oráculo entre organizaciones para `authenticated`.**
   - Consulta: `has_function_privilege('authenticated','fn_can_contact(integer,uuid,text,text)','EXECUTE')=true` y la función acepta `p_org` arbitrario. Un usuario de la org A puede llamar `fn_can_contact(B, uuid, 'email')` y obtener true/false: revela si el uuid existe en B y si tiene opt-out. Requiere adivinar uuids, por eso es bajo. El documento lo declara intencional; sugerencia: comprobar pertenencia de `auth.uid()` a `p_org` cuando el rol no sea `service_role`, o revocar a `authenticated` si solo lo llama el servidor.

4. **[bajo] `comm_usage_logs` y `ai_usage_logs`: políticas heredadas con `auth.uid()` sin subselect y `roles={public}`.**
   - `has_table_privilege('anon','comm_usage_logs','SELECT')=true` (RLS filtra, devuelve 0 filas, pero el grant sobra). F0-17 añadió `cost_amount` a ambas tablas, así que entran en su perímetro. Advisor `auth_rls_initplan` las lista.

5. **[bajo] 6 jobs `crm_event` en `failed` que apuntan a eventos que ya no existen.**
   - Consulta: `select j.id, j.last_error, e.id from outbound_jobs j left join crm_events e on e.id=(j.payload->>'event_id')::uuid where j.kind='crm_event' and j.status='failed'` → 6 filas de la org 125, 2026-09-10 00:18–00:19 UTC, `last_error='JobFatalError: event_not_found:…'`, `e.id` NULL en todas. `crm_events` tiene 23 filas y los jobs referencian 29 eventos distintos: alguien borró 6 eventos (limpieza manual de pruebas de F0-JOBS) sin borrar sus jobs. `failed` es terminal y `v_outbound_jobs_failed` los mostrará para siempre; no hay retención para `failed/dead`. Limpiar y decidir retención en `maintenance`.

6. **[bajo] `fn_release_job` no tiene tope de liberaciones.**
   - Por diseño resta un intento y reencola con `run_at=now()`. Un handler que libere siempre por deadline (F0-JOBS «liberación por deadline quema intentos») hace que el job gire indefinidamente sin agotar `max_attempts` ni dejar rastro en `last_error`. No es un bug de la función sino un límite que falta: contador de liberaciones o `run_at = now() + backoff`.

7. **[bajo] `fn_can_contact` distingue mayúsculas (`'EMAIL'` → false).**
   - Fail-closed correcto, pero ningún llamador lo documenta. Normalizar con `lower(p_channel)` en la función o en `enums.ts`.

8. **[bajo, fuera de F0] El nombre literal de la org 2 aparece en un comentario versionado.**
   - `supabase/migrations/20260910201206_vertical_del_prompt_por_organizacion.sql` L4 y `supabase/functions/ai-auto-response/index.ts` L1204 («… generó 111.745 mensajes de IA con ese prompt»). Coincide carácter a carácter con `organizations.name` de la org 2. Aunque parece un nombre de ejemplo, es el nombre real de una organización de la plataforma; CLAUDE.md regla 2 pide sustituirlo por `org 2`. No es de F0-DB, se anota porque el barrido lo pedía la tarea.

## Coherencia repo↔BD
- BD: 1 699 migraciones; 58 `crm_v4_*` (35 `f00`, 1 `f04`, 3 `f05`, 12 `f06`, 4 `f08`, 1 `f09`, más 2 `crm_*` de 2026-09-11/14).
- Repo: 76 archivos en `supabase/migrations`, 68 rollbacks. Solo 2 de CRM (`20260911160000_sucursal_por_defecto_en_tablas_crm`, `20260914100000_crm_semillas_de_configuracion_por_organizacion`), ambos con rollback.
- Sin `.sql` ni rollback en el repo: las 58 `crm_v4_*` (fallo 1).

## Advisors (`get_advisors`)
- **security** (914 hallazgos en total): atribuibles a F0 solo 1 → `authenticated_security_definer_function_executable` en `fn_can_contact` (fallo 3, declarado intencional). `function_search_path_mutable`: 0 en funciones F0 (todas con `search_path=public`), 35 en funciones CRM heredadas (`fn_campaign_mark_*`, `update_opportunity_stage_*`, `fn_customer_health`, …). `anon_security_definer_function_executable`: 0 en F0, 23 en CRM heredado.
- **performance** (3 370 en total): `auth_rls_initplan` 899 en toda la base, 6 en perímetro F0 (4 `call_recordings` + `comm_usage_logs` + `ai_usage_logs`, fallos 2 y 4) y 137 en tablas CRM heredadas (customers, opportunities, activities, campaigns, notes, templates, pipelines, stages, …). `unused_index`: 8 en F0 (`provider_pricing_vigente_idx`, 2 de `user_comm_preferences`, 3 de `comm_usage_logs`, 2 de `ai_usage_logs`) — esperable sin tráfico. `multiple_permissive_policies`: 0 en F0, 55 en CRM heredado. `unindexed_foreign_keys`: 0 en F0.

## Integridad de datos
- `outbound_jobs`: 479 filas (done 473: 447 `recording_cleanup`, 23 `crm_event`, 1 `analyze`, 1 `transcribe`, 1 `recording_fetch`; failed 6 `crm_event`). 0 fuera del CHECK, 0 `running` con lock viejo, 0 con `attempts > max_attempts`, 0 `queued` vencidos, 0 con organización inexistente, 0 en cola ahora.
- `contact_consents`: 0 filas; UNIQUE `(organization_id, customer_id, channel)` existe, duplicados imposibles.
- `crm_events`: 23 filas (22 processed, 1 skipped), `attempts` máx 0, `last_error` nulo en todas, 0 pending sin job.
- `provider_pricing` 36 filas; `provider_configs` 384 filas, 0 con credenciales en la tabla (todo en Vault); `comm_settings` 84 = 84 organizaciones.
- Realtime: `outbound_jobs` y `notes` publicadas; `crm_events`/`contact_consents` no (coherente con el plan).

## Higiene de los `.sql` del repo
- Nombres de organizaciones cliente (36 nombres de ≥6 caracteres, de 84 organizaciones; barrido con Python porque el `grep -q` de Git Bash aborta) en `supabase/migrations`, `supabase/rollbacks`, `supabase/functions` y `docs/crm-revenue-os` (184 archivos): 0 coincidencias en las migraciones/rollbacks de CRM. Dos coincidencias fuera del perímetro F0: (a) una descripción genérica del vertical («la tienda de tenis») en `20260909150000_buscador_catalogo_funcion.sql` L22 y en `ai-auto-response/index.ts` — permitida por CLAUDE.md, es una descripción, no un nombre; (b) el nombre literal de la org 2 en un comentario de `20260910201206_vertical_del_prompt_por_organizacion.sql` L4 y en `ai-auto-response/index.ts` L1204 (fallo 8).
- Credenciales (JWT `eyJ…`, `sk-…`, `sk_live/test`, `re_…`, SID de Twilio, `postgres://user:pass@`, `service_role_key = '…'`, `api_key/secret/password/token = '…'`) en `supabase/migrations`, `supabase/rollbacks` y `supabase/functions/**/*.sql`: 0 reales (solo el placeholder `<service_role_key>` en `supabase/functions/push/trigger.sql`). Correos: 0.

## Cobertura no probada / riesgos pendientes
- No se ejecutó nada que escriba: `fn_claim_jobs`/`fn_fail_job`/`fn_release_job` se verificaron por definición y grants, no por concurrencia real (dos workers, `SKIP LOCKED`). Cubierto parcialmente por los tests de F0-JOBS.
- Rollbacks de 12–16 no reproducibles (fallo 1).
- `pg_cron` sigue inactivo; `fn_crm_cron_post` no se ha disparado nunca (0 corridas), así que la llamada `net.http_post` con `Authorization: Bearer` y el `X-Cron-Source` no están probados extremo a extremo.
- `contact_consents` sin filas: `fn_can_contact` con `opted_out` real y con flags `metadata.do_not_*` no se probó con datos.
- Bucket `crm-documents` con 0 objetos: el límite de 25 MB y la lista MIME se verificaron en `storage.buckets`, no subiendo archivos.
- No se revisó el código TypeScript de la ronda (fuera de alcance de F0-DB).

## Calificación de robustez (1-10)
8,5/10 — Los ocho pendientes de la ronda 1 están cerrados en la base y con evidencia; las funciones de cola tienen guardas correctas, `search_path` fijo y grants mínimos; las políticas nuevas usan el patrón correcto; no hay datos inconsistentes ni fugas en los `.sql` del repo. Lo que impide más nota es que el trabajo no es reproducible ni reversible desde el repositorio (58 migraciones CRM sin `.sql` ni rollback) y que `call_recordings` quedó fuera del barrido de `(select auth.uid())`.
