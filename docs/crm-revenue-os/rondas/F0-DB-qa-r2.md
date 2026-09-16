# F0-DB — Veredicto del qa-reviewer — Ronda 2

Fecha: 2026-09-15 · Insumos: `rondas/F0-DB-tester-r2.md` (8,5/10; 74 casos, 66 pasan), entradas «F0-DB — Ronda 1/2 — 2026-09-08» de `PROGRESS.md`, `FASE-00-FUNDACIONES.md` §3 y §13.1, `docs/POLITICA-MIGRACIONES.md`.
Comprobaciones propias: solo `SELECT` vía MCP sobre `jgmgphmzusbluqhuqihj` (`supabase_migrations.schema_migrations`, `pg_policies`, `information_schema.role_table_grants`, `pg_proc`, `outbound_jobs`/`crm_events`) y `grep` sobre el repositorio. Las organizaciones se citan solo por id.

## Calificación: 7,5/10

Desglose por dimensión (2 puntos cada una):

| Dimensión | Nota | Por qué |
|---|---|---|
| 1. Funcionalidad completa | 1,4 | Los ocho pendientes P1–P8 de la ronda 1 están en la base con evidencia. Pero el entregable de una fase de migraciones son **tres piezas** (aplicación + `.sql` + rollback, `POLITICA-MIGRACIONES.md`) y solo existe la primera: 0 de 58 migraciones `crm_v4_*` tienen archivo ni reversión en el repo. |
| 2. Robustez | 1,7 | Funciones de cola con guardas `status='running' AND locked_by=p_worker`, backoff con tope y jitter, dedupe con índice parcial, `search_path` fijo, `fn_can_contact` y `fn_crm_cron_post` fail-closed. Faltan: tope de liberaciones en `fn_release_job`, normalización de `p_channel`, retención de `failed/dead`. |
| 3. Consistencia con el sistema | 1,4 | El patrón `(select auth.uid())` se aplicó a las 21 políticas nuevas pero no a las 4 de `call_recordings` (tabla que F0-01 y F0-02 tocaron) ni a las 2 de `*_usage_logs` (F0-17). Y la fase se cerró con la regla «cero `.sql` en el repo» de `FASE-00` §3, que la política del 2026-09-09 derogó: 42 de las 58 migraciones son posteriores a esa fecha. |
| 4. Resultados del tester | 1,6 | 66/74. Sin fallo crítico (no hay pérdida de datos, lectura cruzada entre organizaciones ni módulo roto). Hallazgo propio no listado por el tester: `ai_usage_logs` admite `INSERT` desde `anon` (ver problema 2). |
| 5. Documentación / trazabilidad | 1,4 | `FASE-00` §3.1 y §13.1 documentan cada migración con sus desviaciones y `PROGRESS.md` tiene las cuatro rondas. Pero los informes que cita (`scratchpad/reports/DB-0-r1..r4.md`) no existen en el árbol, y «Verificado en rollback» no es reproducible por nadie sin el `.sql`. |

### Fortalezas
- Los ocho pendientes de la ronda 1 están cerrados **en la base**, no en el papel: `noop` en `outbound_jobs_kind_check`; `fn_can_contact` devuelve `false` con canal `NULL`, inválido, cliente ajeno u organización ajena; 21 políticas F0 con `(select auth.uid())`; vistas `v_provider_configs_safe`/`v_outbound_jobs_failed` solo `SELECT` para `authenticated` y nada para `anon`; bucket `crm-documents` 25 MB / 28 MIME privado; `fn_crm_cron_post(p_path, p_body)` con jobs 18/19 y cuerpo de `kinds`; `fn_release_job`; `crm_events.attempts/last_error`.
- Todas las RPC de cola (`fn_enqueue_job`, `fn_claim_jobs`, `fn_complete_job`, `fn_fail_job`, `fn_release_job`, `fn_emit_crm_event`, `fn_crm_cron_post`) son `SECURITY DEFINER`, con `search_path=public`, y su ACL es exactamente `{postgres, service_role}` (verificado en `pg_proc.proacl`). `anon` no ejecuta ninguna función de F0.
- Integridad de datos limpia: 0 filas fuera de CHECK, 0 `running` con lock vencido, 0 `attempts > max_attempts`, `contact_consents` con UNIQUE `(organization_id, customer_id, channel)`, 0 credenciales dentro de `provider_configs` (todo en Vault).
- Los 58 `statements` en `supabase_migrations.schema_migrations` **no contienen credenciales** (barrido de JWT, `sk-`, `sk_live/test`, `re_`, SID de Twilio, `vault.create_secret`: 0 coincidencias; los secretos de Vault se crearon fuera de la migración) ni nombres de organizaciones cliente (la única coincidencia, en las migraciones 19 y 21, es la palabra genérica «organizaciones» que coincide con el nombre de la org 6: falso positivo). Es decir: **se pueden volcar al repositorio público tal cual**.
- El documento de fase registra cada desviación respecto al diseño (M6 Vault no aplicada, `analysis → google`, `om.is_active` en vez de `comm_settings.is_active`, etc.), lo que hace auditable el porqué.

### Problemas encontrados (ordenados por severidad)

1. **[alto] 58 migraciones `crm_v4_*` aplicadas sin `.sql` ni rollback en el repositorio.** Confirmado: `schema_migrations` tiene 35 `crm_v4_f00_01..35` (20260908214513 … 20260909050212) y 23 `crm_v4_f04/f05/f06/f08/f09*` (hasta 20260910071154), todas con `statements` completo (entre 406 y 10 114 caracteres cada una); `git ls-files supabase/migrations supabase/rollbacks | grep -c crm_v4` = 0. Incumple CLAUDE.md regla 1 y `POLITICA-MIGRACIONES.md` («los tres pasos van en el mismo commit»). Atenuante real: las migraciones 01–16 son del 2026-09-08, un día antes de la política; las 42 restantes no tienen atenuante. Consecuencia práctica: la afirmación «Verificado en rollback» de PROGRESS.md no la puede repetir nadie, y una reversión en producción habría que reconstruirla de memoria.

2. **[alto] `ai_usage_logs` acepta `INSERT` desde `anon` y `authenticated` para cualquier organización.** No lo reporta el tester (solo anota el `SELECT` a `anon`). Evidencia: política `"Service role can insert AI usage logs"` con `cmd=INSERT`, `roles={public}`, `with_check=true`; `information_schema.role_table_grants` da a `anon` y `authenticated` `INSERT, UPDATE, DELETE, TRUNCATE` sobre `ai_usage_logs` y `comm_usage_logs`; RLS activa sin `FORCE`. Con la clave anónima pública se puede insertar una fila con `organization_id` de cualquier organización y `cost_amount` (columna que **F0-17 añadió**), y esa fila aparece en el panel de créditos (`src/app/api/crm/config/credits/route.ts:65` lee `ai_usage_logs` por organización). No es crítico según el rubric (no hay pérdida de datos ni lectura cruzada: `service_role` salta RLS y la política de SELECT filtra) y es herencia previa a F0, pero está en el perímetro de F0-17 y cierra en una migración de diez líneas. `comm_usage_logs` no tiene política de INSERT, así que los grants de escritura ahí son inertes mientras RLS siga activa; conviene revocarlos igual.

3. **[medio] `call_recordings`: `rec_select/insert/update/delete` con `auth.uid()` sin `(select …)`.** Confirmado en `pg_policies`. La tabla la tocó F0-01 (`updated_at`) y F0-02 creó su bucket; el advisor `auth_rls_initplan` la lista. La afirmación «advisors initplan de F0: 21 → 0» es cierta solo excluyendo esta tabla.

4. **[medio] `FASE-00-FUNDACIONES.md` §3 sigue diciendo «prohibido crear `.sql` en el repo».** Es la instrucción que el próximo builder de BD va a leer primero, y contradice la política vigente. `POLITICA-MIGRACIONES.md` lo excusa para «rondas ya cerradas», pero F0-DB no está cerrada.

5. **[bajo] `fn_can_contact` es un oráculo entre organizaciones para `authenticated`.** ACL `{postgres, authenticated, service_role}` y `p_org` arbitrario. No se puede simplemente revocar a `authenticated`: los tres llamadores (`email/sendService.ts:86`, `voiceAgentService.ts:634`, `whatsapp/consent.ts:22`) reciben el cliente inyectado y no está garantizado que sea `service_role`. La corrección correcta es la guarda de pertenencia dentro de la función (ver abajo).

6. **[bajo] 6 jobs `crm_event` en `failed` cuyo `event_id` ya no existe** (org 125, 2026-09-10 00:18–00:19 UTC, `last_error='JobFatalError: event_not_found'`). Confirmado: 23 `done` con evento, 6 `failed` sin evento. `failed` es terminal y `v_outbound_jobs_failed` los mostrará para siempre; no hay retención de `failed/dead` en `maintenance`.

7. **[bajo] `fn_release_job` sin tope de liberaciones.** Un handler que libere siempre por deadline gira indefinidamente sin agotar `max_attempts` ni dejar rastro en `last_error`.

8. **[bajo] `fn_can_contact` distingue mayúsculas en `p_channel`** (`'EMAIL'` → `false`). Fail-closed correcto, pero silencioso; normalizar en la función.

9. **[bajo] `comm_usage_logs_select` y la política de SELECT de `ai_usage_logs` con `auth.uid()` sin subselect y `roles={public}`.** Se resuelve en la misma migración del problema 2.

10. **[bajo, fuera de F0-DB] Nombre literal de la org 2 en `supabase/migrations/20260910201206_vertical_del_prompt_por_organizacion.sql` L4** (y en `supabase/functions/ai-auto-response/index.ts` L1204). Es un comentario, así que se corrige en el archivo del repositorio sin nueva migración (la base no guarda comentarios de `--`); sustituir por «la org 2».

### Instrucciones para el builder (orden de ejecución)

**B1 — Reconstruir los 58 pares migración/rollback (problema 1).**
- Fuente: `select version, name, statements from supabase_migrations.schema_migrations where name like 'crm_v4_%' order by version` (58 filas, `statements` tiene un único elemento por fila). **No volver a aplicar nada**: ya están en producción.
- Escribir `supabase/migrations/<version>_<name>.sql` con el contenido de `statements[1]` **exactamente como se aplicó**, precedido de una cabecera de dos líneas: `-- Aplicada el <fecha de version> vía MCP (apply_migration). Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15.` No reformatear ni «mejorar» el SQL.
- Escribir `supabase/rollbacks/<version>_<name>_rollback.sql` por cada una. Las que sembraron o transformaron datos deben llevar el aviso que exige la política («este rollback restaura la estructura, no los datos»): al menos `f00_01` (backfill `conversations.last_inbound_at`), `f00_04`/`f00_24` (seed `provider_pricing`), `f00_07` (seed `provider_configs` + trigger), `f00_21` (seed `comm_settings` en 52 organizaciones), `f00_31` (backfill `stages.is_won/is_lost` en 14 filas). Los rollbacks de `f00_29/30/32/33` deben restaurar la **versión anterior** de la función de trigger, no hacer `DROP FUNCTION` (los triggers siguen apuntando a ellas).
- Antes del commit, barrido obligatorio sobre los 116 archivos nuevos: (a) credenciales (`eyJ[A-Za-z0-9_-]{20,}`, `sk-`, `sk_(live|test)_`, `re_[A-Za-z0-9]{10,}`, `AC[0-9a-f]{32}`, `postgres://.*:.*@`); (b) nombres de organizaciones cliente (comparar contra `organizations.name` con longitud ≥ 6; la coincidencia con la org 6 en `f00_19` y `f00_21` es la palabra genérica «organizaciones» y **no** hay que tocarla). Ambos barridos deben dar 0 reales.
- Comprobación de cierre: `git ls-files supabase/migrations | grep -c crm_v4` = 58, `git ls-files supabase/rollbacks | grep -c crm_v4` = 58, y un script en el scratchpad que compare byte a byte cada archivo (sin la cabecera) con `statements[1]` de la base: 58 iguales. Actualizar la sección «Deuda actual» de `POLITICA-MIGRACIONES.md` si algún rollback queda pendiente (no debería).
- Dejar en `PROGRESS.md` la lista de los 58 nombres versionados para que el próximo tester los verifique sin `list_migrations`.

**B2 — Cerrar `ai_usage_logs`/`comm_usage_logs` y `call_recordings` en una sola migración (problemas 2, 3 y 9).** Nombre sugerido: `crm_v4_f00_36_usage_logs_call_recordings_rls`. Con su `.sql` y su rollback en el mismo commit, aplicada por MCP:
```sql
-- 1) Escritura: solo service_role (salta RLS). anon fuera del todo.
revoke insert, update, delete, truncate, references, trigger on public.ai_usage_logs, public.comm_usage_logs from anon, authenticated;
revoke select on public.ai_usage_logs, public.comm_usage_logs from anon;
drop policy if exists "Service role can insert AI usage logs" on public.ai_usage_logs;
-- 2) Lectura por pertenencia, con initplan y rol explícito.
drop policy if exists "Members can view AI usage logs of their organization" on public.ai_usage_logs;
create policy ai_usage_logs_select on public.ai_usage_logs for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active = true));
drop policy if exists comm_usage_logs_select on public.comm_usage_logs;
create policy comm_usage_logs_select on public.comm_usage_logs for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active = true));
-- 3) call_recordings: mismo patrón que crm_v4_f00_13 (ALTER POLICY … USING/WITH CHECK con (select auth.uid())) para rec_select, rec_insert, rec_update, rec_delete.
```
- Antes de aplicar, confirmar que ningún escritor de `ai_usage_logs`/`comm_usage_logs` usa cliente de sesión: los doce puntos de inserción (`aiCreditsService.ts:235`, `aiCostService.ts:151,209`, `transcriptionService.ts:1035`, `callCreditsService.ts:177`, `whatsapp/outboundService.ts:241`, `twilioService.ts:178`, `twilioWebhook.ts:196,277`, `conversationRelayHandler.ts:301`, `voiceAgentTools.ts:399`, `ai-auto-response/index.ts:1609`). Los que reciben el cliente inyectado (`transcriptionService`, `callCreditsService`, `twilioWebhook`) hay que seguirlos hasta la ruta. Si alguno resulta ser de sesión, en vez de revocar `INSERT` a `authenticated` se crea una política `for insert to authenticated with check (<pertenencia activa>)`.
- Comprobación: `select policyname, roles, qual, with_check from pg_policies where tablename in ('ai_usage_logs','comm_usage_logs','call_recordings')` → 0 con `auth.uid()` sin subselect, 0 con `roles={public}`, 0 con `with_check = true`; `has_table_privilege('anon','ai_usage_logs','INSERT')` y `('anon','ai_usage_logs','SELECT')` = `false`; `get_advisors(performance)` sin `auth_rls_initplan` en las tres tablas. Repetir el flujo de créditos del tester (`npx jest src/lib/services/__tests__/aiCostService.test.ts`) y una transcripción real contra la base para confirmar que los inserts siguen entrando.

**B3 — Corregir `FASE-00-FUNDACIONES.md` §3 (problema 4).** Sustituir la primera frase de §3 por la referencia a `docs/POLITICA-MIGRACIONES.md` (aplicación por MCP + `.sql` + rollback en el mismo commit) y añadir en §13.1 una línea «Archivos versionados en la ronda 3 de QA (2026-09-15): 58 migraciones + 58 rollbacks». Reemplazar las referencias a `scratchpad/reports/DB-0-r1..r4.md` (no existen en el árbol) por `docs/crm-revenue-os/rondas/F0-DB-*.md`, o recuperar esos informes si alguien los conserva.

**B4 — `fn_can_contact`: guarda de pertenencia y normalización (problemas 5 y 8).** En la misma migración que B2 o en `crm_v4_f00_37`, `CREATE OR REPLACE` conservando firma, SECDEF, `search_path=public` y ACL:
```sql
-- al inicio del cuerpo, antes de cualquier lectura:
p_channel := lower(trim(p_channel));
if p_channel is null or p_channel not in ('email','whatsapp','sms','voice') then return false; end if;
if current_setting('request.jwt.claim.role', true) = 'authenticated'
   and not exists (select 1 from public.organization_members om where om.user_id = (select auth.uid()) and om.organization_id = p_org and om.is_active = true)
then return false; end if;
```
Comprobación: como `authenticated` de la org A, `fn_can_contact(B, <uuid>, 'email')` → `false` aunque el cliente exista en B; `fn_can_contact(A, <cliente de A>, 'EMAIL')` → igual que con `'email'`; el test de `sendService` que usa `fn_can_contact` sigue verde. Documentar en `FASE-00` §13.1 que `p_channel` se normaliza.

**B5 — Limpieza de los 6 jobs huérfanos y retención (problema 6).** No es migración de esquema pero sí de datos: `delete from outbound_jobs where kind='crm_event' and status='failed' and last_error like 'JobFatalError: event_not_found%' and not exists (select 1 from crm_events e where e.id = nullif(payload->>'event_id','')::uuid)` → 6 filas; guardar los ids borrados en el `.sql` como comentario. Y añadir al handler `maintenance` (`src/lib/jobs/handlers/maintenance.ts`, F0-JOBS) la retención: `failed/dead` con `updated_at < now() - interval '30 days'` se borran (o se archivan), con el número documentado en `FASE-00` §4.4. Comprobación: `select count(*) from v_outbound_jobs_failed` → 0 tras la limpieza.

**B6 — Tope en `fn_release_job` (problema 7).** Opción mínima sin columna nueva: `run_at = now() + make_interval(secs => least(60 * power(2, attempts), 900))` y anotar `last_error = coalesce(last_error, '') || ' | released by ' || p_worker` truncado a 500 caracteres; opción completa: columna `outbound_jobs.releases int not null default 0` con `dead` al superar `max_attempts * 2`. Elegir una, documentarla en la firma de §13.1 y cubrirla con un test en `src/lib/jobs/__tests__` que libere 12 veces y compruebe que el job no sigue `queued` con `run_at = now()`.

**B7 — Comentario con nombre de organización (problema 10, fuera de F0-DB pero trivial).** Editar L4 de `supabase/migrations/20260910201206_vertical_del_prompt_por_organizacion.sql` y L1204 de `supabase/functions/ai-auto-response/index.ts` para decir «la org 2». Sin migración: la base no guarda comentarios `--`.

### Qué falta para el 10
- Que `npm run test:tz-all` / `npx jest` incluyan un test de contrato que lea `supabase/migrations/*.sql` y falle si aparece un nombre de `organizations.name` o un patrón de credencial (hoy el barrido es manual y depende de que cada builder se acuerde).
- Prueba de concurrencia real de `fn_claim_jobs` con dos workers (`SKIP LOCKED`) contra la base, no solo por definición.
- Activar los tres jobs de `pg_cron` y verificar `net._http_response.status_code = 200`, que sigue pendiente desde la ronda 1 (bloqueado por el despliegue del runner, no por esta fase).
- `contact_consents` con datos: probar `fn_can_contact` con un `opted_out` real y con `metadata.do_not_*` antes de que F7/F16 dependan de ello en producción.

### Veredicto
requiere-nueva-ronda
