# F0-DB — Informe del builder — Ronda 3

Fecha: 2026-09-15 · Insumos: `rondas/F0-DB-qa-r2.md` (7,5/10, B1–B7) y `rondas/F0-DB-tester-r2.md`.
Proyecto Supabase `jgmgphmzusbluqhuqihj`, **solo lectura** (SELECT vía MCP). Ninguna migración nueva se aplicó: quedan como `.sql` + rollback para que el orquestador las muestre al dueño. Las organizaciones se citan solo por id.

## Qué se hizo en esta ronda

1. **B1 — 56 pares `.sql` + rollback reconstruidos** desde `supabase_migrations.schema_migrations` (`version`, `name`, `statements[1]`): 55 `crm_v4_*` + `crm_customer_lifecycle_ladder` (20260910000134, también huérfana y de CRM). Cada `supabase/migrations/<version>_<name>.sql` lleva una cabecera de dos líneas (`-- Aplicada el <fecha> vía MCP … reconstruido … el 2026-09-15` / `-- Motivo: …; md5 …`) y a continuación el cuerpo **byte a byte**. Verificación: md5 del cuerpo (sin las dos líneas de cabecera) contra `md5(array_to_string(statements, E'\n'))` de la base → **56/56 idénticos** (tabla al final). Barrido previo en la base y posterior sobre los 127 `.sql` nuevos/modificados de `supabase/`: 0 credenciales (`eyJ…`, `sk-`, `sk_live/test_`, `re_…`, SID Twilio, `postgres://…:…@`, `*_key/secret/password/token = '…'`; la única coincidencia es la palabra `re_operational` en la migración f00_40 de F0-SEC) y 0 nombres de organizaciones cliente (`organizations.name` ≥ 6 caracteres; la única coincidencia es la org 6, cuyo nombre es la palabra genérica «organizaciones», falso positivo ya documentado por el QA).
2. **B2 — `supabase/migrations/20260915230000_crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan.sql`** (+ rollback): revoca INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER a `anon` y `authenticated` y SELECT a `anon` en `ai_usage_logs` y `comm_usage_logs`; elimina la política `"Service role can insert AI usage logs"` (`with_check = true`, roles `{public}`); recrea las dos políticas de SELECT `TO authenticated` con `(select auth.uid())` y `om.is_active = true`; `ALTER POLICY` de `rec_select/insert/update/delete` de `call_recordings` con `(select auth.uid())`; y `REVOKE ALL ON call_recordings FROM anon` (las 4 políticas ya eran `TO authenticated`: anon no tenía acceso efectivo). **Pendiente de aplicar.**
3. **B4 + B6 — `supabase/migrations/20260915231000_crm_v4_f00_37_can_contact_guarda_y_release_job_tope.sql`** (+ rollback). `fn_can_contact`: `lower(btrim(p_channel))` antes de validar y guarda de pertenencia cuando `auth.role() = 'authenticated'` (equivale a `current_setting('request.jwt.claim.role', true)`, pero `auth.role()` también lee `request.jwt.claims`, que es lo que exponen las versiones actuales de PostgREST); misma firma, STABLE, SECDEF, `search_path=public`, ACL `{postgres, authenticated, service_role}` intacta. `fn_release_job`: columna aditiva `outbound_jobs.releases int NOT NULL DEFAULT 0`, `releases+1` en cada liberación, `run_at = now() + least(30·2^(releases-1), 900) s` (nunca `now()`), y `dead` + `last_error = 'released_limit: N liberaciones por deadline (worker …)'` al llegar a `max_attempts*2`. **Pendiente de aplicar.**
4. **B5 — `supabase/migrations/20260915232000_crm_v4_f00_limpieza_jobs_huerfanos.sql`** (+ rollback «no restaura datos»): DELETE por condición (`kind='crm_event'`, `status='failed'`, `last_error like 'JobFatalError: event_not_found%'`, evento inexistente) → 6 filas de la org 125; los 6 ids y sus `event_id` quedan como comentario. **Pendiente de aplicar.** La retención de `failed|dead` con `updated_at > 30 d` **ya existía** en `runMaintenance` (tester r1 F-8, documentada en FASE-00 §4.4); el QA la dio por ausente. Se endureció el test (`handlers.test.ts`) para fijar que la ventana es `updated_at < cutoff` (mismo cutoff de 30 d que `done`).
5. **B6 en el runner** (`src/lib/jobs/runner.ts`, `types.ts`): `releaseBackoffSeconds(releases)` y `releaseCap(maxAttempts)` exportados; el fallback UPDATE (cuando la RPC no existe) replica la regla: `run_at` con backoff siempre, y `releases`/`dead`/`last_error` solo si la fila reclamada trae la columna (`OutboundJob.releases?: number`). Tests nuevos en `runner.test.ts`: «tope de liberaciones: 12 liberaciones seguidas → backoff 30…900 s y `dead` desde la 10.ª» y los valores de `releaseBackoffSeconds`/`releaseCap`; el test existente de deadline ahora exige `run_at ≥ now + 30 s`.
6. **B3 — `docs/crm-revenue-os/FASE-00-FUNDACIONES.md`**: §3 apunta a `docs/POLITICA-MIGRACIONES.md` (MCP + `.sql` + rollback en el mismo commit) y declara derogada la regla «prohibido crear `.sql`»; §10 DoD tacha «Cero `.sql` nuevos»; §13.1 firmas de `fn_release_job` y `fn_can_contact` actualizadas (tope/backoff; normalización y guarda) y línea nueva «Archivos versionados en la ronda 3 de QA (2026-09-15)» con el recuento y las migraciones pendientes; las cuatro referencias a `scratchpad/reports/DB-0-r1..r4.md` sustituidas (los informes no existen en el árbol; se remite a `docs/crm-revenue-os/rondas/F0-DB-*.md` y a los `.sql` versionados). §4.4 documenta el tope de liberaciones. `docs/POLITICA-MIGRACIONES.md` «Deuda actual»: saldada la deuda de `crm_v4_*` con las limitaciones de tres rollbacks.
7. **B7**: nombre literal de la org 2 → «La org 2» / «la org 2» en `supabase/migrations/20260910201206_vertical_del_prompt_por_organizacion.sql` L4 y en `supabase/functions/ai-auto-response/index.ts` L1204 (solo comentarios; sin migración).
8. `docs/crm-revenue-os/PROGRESS.md`: entrada «F0-DB — Ronda 3 construida» con la lista de los 56 nombres versionados y las 3 migraciones pendientes.

## Feedback de la ronda anterior que se atendió

| Punto | Estado | Cómo |
|---|---|---|
| B1 (problema 1, alto) | resuelto | 56/56 pares; md5 idéntico; barrido 0/0; lista en PROGRESS.md. Recuento: el QA contó 58 porque sumó las dos `crm_*` de 2026-09-11/14 (ya tenían archivo) y un `f06` de más (son 11, no 12). |
| B2 (problemas 2, 3, 9) | resuelto en `.sql`, **pendiente de aplicar** | `crm_v4_f00_36`. Los 15 puntos de escritura en `*_usage_logs` (13 INSERT + 2 UPDATE) usan service_role, rastreados hasta la ruta/handler: no hace falta política de INSERT para `authenticated`; `chargeAiCredits`/`refundAiCredits` no cambian. |
| B3 (problema 4) | resuelto | FASE-00 §3, §10, §13.1, §4.4; POLITICA-MIGRACIONES «Deuda actual». |
| B4 (problemas 5 y 8) | resuelto en `.sql`, **pendiente de aplicar** | `crm_v4_f00_37` parte A. `sendService.test.ts` sigue verde (100/100 con guardrails y aiCostService). |
| B5 (problema 6) | resuelto en `.sql` (DML), **pendiente de aplicar**; retención ya existente + test | `crm_v4_f00_limpieza_jobs_huerfanos`; `handlers.test.ts` fija `updated_at < cutoff(30 d)` para `failed|dead`. |
| B6 (problema 7) | resuelto en `.sql` + runner + test, **pendiente de aplicar** | `crm_v4_f00_37` parte B (opción completa: columna `releases`); `runner.ts` fallback; `runner.test.ts` 12 liberaciones. |
| B7 (problema 10) | resuelto | dos comentarios editados; grep del nombre en `supabase/**` y `docs/crm-revenue-os` = 0. |

## Decisiones de diseño relevantes

- **Cuerpos reconstruidos sin reformatear**: el `.sql` es `statements[1]` exacto; la cabecera son dos líneas de comentario y el script de verificación las descarta (`scratchpad/verify.py`, no versionado). Lección del proceso: en el JSON del MCP `\\` es una sola barra (`crm\_%` en f00_13); el md5 lo detectó al primer intento.
- **Rollbacks de funciones sin versión previa en el repo (29–33)**: el `baseline_schema.sql` es posterior a la ronda 4, así que los cuerpos anteriores no existen en el árbol. f00_32 y f00_33 restauran el cuerpo anterior **exacto** porque la migración afirma que solo cambió un cast (con advertencia: reintroducen el ERROR 42804); f00_30 restaura la **semántica** anterior descrita (probabilidad 100/0 + `closed_at`), etiquetada como reconstrucción; f00_29 es un **no-op documentado**: la versión anterior era defectuosa (revertía todo INSERT entrante) y reconstruirla a ciegas rompería WhatsApp; no se hace `DROP FUNCTION` en ninguno (los triggers siguen apuntando). f00_35 usa `ALTER FUNCTION … RESET search_path`. La única reversión exacta de 29 es PITR; queda dicho en el archivo y en POLITICA-MIGRACIONES.
- **Rollbacks de seeds/backfills** (`f00_04`, `f00_07`, `f00_21`, `f00_24`, `f00_31`, `f06_01`, `crm_customer_lifecycle_ladder`): aviso «restaura la estructura, no los datos». `f00_07` y `f00_21` **no borran** las filas sembradas (son configuración/saldo editable, sin marca de origen), igual que el criterio ya usado en `crm_semillas_de_configuracion_por_organizacion_rollback.sql`.
- **`auth.role()` en vez de `current_setting('request.jwt.claim.role', true)`**: hace lo mismo (es un `coalesce` de las dos variables) y no depende de la versión de PostgREST. Con service_role no hay guarda, como pide el QA.
- **Tope de liberaciones = opción completa** (columna `releases`), porque la opción mínima (backoff por `attempts`) no acota: `attempts` vuelve a 0 en cada liberación. `releases` nunca se decrementa. Efecto colateral positivo: el backoff mínimo de 30 s cierra el caso N-8 del runner (mismo job reclamado dos veces en una ejecución), que solo era posible con `run_at = now()`.
- **`REVOKE ALL ON call_recordings FROM anon`** en f00_36: fuera del texto literal del QA, pero sin riesgo (RLS activa y 4 políticas `TO authenticated`; los webhooks de grabación usan `getServiceClient()`) y coherente con «anon fuera del todo».
- **`crm_customer_lifecycle_ladder`** incluida en B1 aunque no es `crm_v4_*`: es de CRM, estaba aplicada sin archivo y su reconstrucción cuesta lo mismo.

## Verificación

- `npx jest src/lib/jobs` → 12 suites, **111/111**.
- `npx jest src/__tests__/guardrails.test.ts src/lib/services/__tests__/aiCostService.test.ts src/lib/services/crm/email/__tests__/sendService.test.ts` → **100/100**.
- `tsc --noEmit` acotado a `src/lib/jobs/{runner,types}.ts` y sus dos tests → 0 errores.
- Barrido de credenciales y nombres de organizaciones sobre los `.sql` nuevos/modificados de `supabase/` (127 archivos): 0 reales.
- 56 migraciones + 56 rollbacks de B1 presentes en disco; 3 migraciones nuevas + 3 rollbacks.

## Migraciones nuevas PENDIENTES DE APLICAR (orquestador → dueño → `apply_migration`)

| Orden | Migración | Rollback | Qué toca |
|---|---|---|---|
| 1 | `supabase/migrations/20260915230000_crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan.sql` | `supabase/rollbacks/20260915230000_crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan_rollback.sql` | grants/políticas `ai_usage_logs`, `comm_usage_logs`, `call_recordings` |
| 2 | `supabase/migrations/20260915231000_crm_v4_f00_37_can_contact_guarda_y_release_job_tope.sql` | `supabase/rollbacks/20260915231000_crm_v4_f00_37_can_contact_guarda_y_release_job_tope_rollback.sql` | `fn_can_contact`, `fn_release_job`, columna `outbound_jobs.releases` |
| 3 | `supabase/migrations/20260915232000_crm_v4_f00_limpieza_jobs_huerfanos.sql` | `supabase/rollbacks/20260915232000_crm_v4_f00_limpieza_jobs_huerfanos_rollback.sql` | DML: 6 filas de `outbound_jobs` (org 125) |

Comprobaciones tras aplicar (solo lectura): `pg_policies` de las tres tablas sin `auth.uid()` suelto, sin `roles={public}`, sin `with_check=true`; `has_table_privilege('anon','public.ai_usage_logs','INSERT'|'SELECT') = false` y `('authenticated', …, 'INSERT') = false`; `get_advisors(performance)` sin `auth_rls_initplan` en las tres tablas; como `authenticated` de la org A `fn_can_contact(B, <uuid de B>, 'email') = false` y `fn_can_contact(A, <uuid de A>, 'EMAIL') = fn_can_contact(A, <uuid de A>, 'email')`; `select count(*) from v_outbound_jobs_failed = 0`; flujo de créditos: `npx jest src/lib/services/__tests__/aiCostService.test.ts` y una transcripción real (los inserts van con service_role, que no depende de grants ni políticas).

## Pendientes que dejo explícitamente para revisión

- **Lectores de `comm_usage_logs` con el cliente de navegador en el servidor** (`src/lib/services/commCreditsService.ts:44,87`, llamados desde `api/integrations/twilio/usage` y `api/integrations/twilio/credits`): hoy ya devuelven 0 filas (ejecutan como `anon` y la política filtra por `auth.uid()`); tras f00_36 recibirán «permission denied», que ambos métodos capturan y convierten en vacío (`console.error` + `{ data: [], count: 0 }` / ceros). Sin regresión funcional, pero es un bug preexistente (import de `@/lib/supabase/config` en servidor, `CLIENT_ONLY_SERVICES` del guardrail) que conviene cerrar en la zona de Twilio/F16 pasando `ctx.supabase`.
- `src/app/app/integraciones/twilio/page.tsx:54,74` lee `comm_usage_logs` con sesión de usuario: sigue funcionando (SELECT `TO authenticated` por pertenencia activa).
- Rollback de `crm_v4_f00_29` es no-op y el de `f00_30` es reconstrucción semántica (ver decisiones). Si el dueño conserva un backup anterior al 2026-09-09 04:46 UTC, se pueden extraer los cuerpos exactos con `pg_get_functiondef` y sustituirlos.
- `FASE-00` §13.3 sigue citando `scratchpad/reports/REG-0-r1.md` (zona REG, no DB); no lo toqué.
- Las migraciones `crm_v4_f00_38/39/40` que aparecieron en `supabase/migrations/` durante esta ronda son de los builders de F0-REG y F0-SEC (paralelos); f00_39 declara que no toca grants ni políticas de `*_usage_logs` y los delega a f00_36. No hay solapamiento; f00_36 y f00_39 son independientes y el orden entre ellas no importa.
- El tope `max_attempts*2` puede matar un job que siempre quede en la cola de un lote lleno (inanición) en vez de un job roto; es lo que pidió el QA y queda visible en `v_outbound_jobs_failed` con `released_limit`. Si aparece en producción, subir el multiplicador o priorizar por `releases` en `fn_claim_jobs`.

## Tabla de verificación byte a byte (B1)

Método: `md5(cuerpo del archivo sin las 2 líneas de cabecera)` vs `md5(array_to_string(statements, E'\n'))` en `supabase_migrations.schema_migrations` (todas las filas tienen un único elemento en `statements`). Script: `scratchpad/verify.py` (no versionado; reproducible con el SELECT de md5 de la base).

| # | version | name | md5 BD (statements[1]) | md5 archivo (sin cabecera) | resultado |
|---|---|---|---|---|---|
| 1 | 20260908214513 | `crm_v4_f00_01_reconciliacion_checks_columnas` | `ca5c790f9b2774f8e34a0871d4f8dc29` | `ca5c790f9b2774f8e34a0871d4f8dc29` | IDENTICO |
| 2 | 20260908214616 | `crm_v4_f00_02_storage_buckets_policies` | `31946a93833a9ffb6f1aa927459c4278` | `31946a93833a9ffb6f1aa927459c4278` | IDENTICO |
| 3 | 20260908214724 | `crm_v4_f00_03_tablas_cola_eventos_consents_pricing_prefs` | `67d7e435c1a7ddd3ac3edb65b25a19a5` | `67d7e435c1a7ddd3ac3edb65b25a19a5` | IDENTICO |
| 4 | 20260908215005 | `crm_v4_f00_04_seed_provider_pricing` | `d511fdeea3726ca9aca4b07ee77074f0` | `d511fdeea3726ca9aca4b07ee77074f0` | IDENTICO |
| 5 | 20260908215046 | `crm_v4_f00_05_funciones_cola_eventos_consent` | `0550068566f92d19d9a8b050b77e10af` | `0550068566f92d19d9a8b050b77e10af` | IDENTICO |
| 6 | 20260908215535 | `crm_v4_f00_06_privilegios_provider_configs_comm_settings` | `0f5784c5826df0ffe3f7b7924496dd44` | `0f5784c5826df0ffe3f7b7924496dd44` | IDENTICO |
| 7 | 20260908215551 | `crm_v4_f00_07_seed_provider_configs` | `c51eb77f02ae8810ccfbdca47b771924` | `c51eb77f02ae8810ccfbdca47b771924` | IDENTICO |
| 8 | 20260908215612 | `crm_v4_f00_08_realtime_publication` | `38cb420d5e267584b36f60edae6f91b7` | `38cb420d5e267584b36f60edae6f91b7` | IDENTICO |
| 9 | 20260908215834 | `crm_v4_f00_09_pg_cron_jobs_inactivos` | `ffa666c4d9ef7b5b0b5d0123fd23fb3c` | `ffa666c4d9ef7b5b0b5d0123fd23fb3c` | IDENTICO |
| 10 | 20260908215838 | `crm_v4_f00_10_fix_comm_settings_update_columnas` | `019534068063129390cc6bb64c69157d` | `019534068063129390cc6bb64c69157d` | IDENTICO |
| 11 | 20260908220220 | `crm_v4_f00_11_advisors_trigger_fn_grants_fk_indexes` | `922cd8e5ffaeea815f71a5113b1ffe55` | `922cd8e5ffaeea815f71a5113b1ffe55` | IDENTICO |
| 12 | 20260908222543 | `crm_v4_f00_12_kind_noop_can_contact_fail_closed` | `e91a2ba23cd9d2ea771c66f140d1a438` | `e91a2ba23cd9d2ea771c66f140d1a438` | IDENTICO |
| 13 | 20260908222619 | `crm_v4_f00_13_rls_initplan_select_auth_uid` | `3894da4b890e8ac1157a21841326ac93` | `3894da4b890e8ac1157a21841326ac93` | IDENTICO |
| 14 | 20260908222739 | `crm_v4_f00_14_vistas_solo_lectura_bucket_documents_limites` | `61d9e315c40ab3384d346c9d758cd804` | `61d9e315c40ab3384d346c9d758cd804` | IDENTICO |
| 15 | 20260908222832 | `crm_v4_f00_15_cron_post_body_kinds` | `44a79ac250b03531f90efdc38a5ab6ad` | `44a79ac250b03531f90efdc38a5ab6ad` | IDENTICO |
| 16 | 20260908222845 | `crm_v4_f00_16_fn_release_job_crm_events_diag` | `d854e11f4f27fc2668b7d259ce2fc30d` | `d854e11f4f27fc2668b7d259ce2fc30d` | IDENTICO |
| 17 | 20260909042123 | `crm_v4_f00_17_usage_logs_cost_amount` | `3a4b99d69f02ee244cdf4d95342b75d5` | `3a4b99d69f02ee244cdf4d95342b75d5` | IDENTICO |
| 18 | 20260909042156 | `crm_v4_f00_18_refund_ai_credits` | `54f77ec7965658062a2b7ad53dae7069` | `54f77ec7965658062a2b7ad53dae7069` | IDENTICO |
| 19 | 20260909042307 | `crm_v4_f00_19_refund_ai_credits_tope_realista` | `0e1e123bfb90c6846997a09a4f6266a6` | `0e1e123bfb90c6846997a09a4f6266a6` | IDENTICO |
| 20 | 20260909042434 | `crm_v4_f00_20_provider_pricing_valid_to` | `849b52d3055f498f4377cfce8f129810` | `849b52d3055f498f4377cfce8f129810` | IDENTICO |
| 21 | 20260909042544 | `crm_v4_f00_21_comm_credits_fail_closed_y_seed_por_plan` | `37e03a5b5a3b5819c29148b6b3721a22` | `37e03a5b5a3b5819c29148b6b3721a22` | IDENTICO |
| 22 | 20260909042657 | `crm_v4_f00_22_deduct_comm_credits_reembolso_acotado` | `da2ebe84260fe6be06357e9c9b55f7a1` | `da2ebe84260fe6be06357e9c9b55f7a1` | IDENTICO |
| 23 | 20260909042724 | `crm_v4_f00_23_activities_call_id_unique` | `944b9aecfe108ff63876b1bfe67c530a` | `944b9aecfe108ff63876b1bfe67c530a` | IDENTICO |
| 24 | 20260909042807 | `crm_v4_f00_24_seed_pricing_gemini_3_8_audio_in` | `be4ad57f13e555ae9479a4fe754010c9` | `be4ad57f13e555ae9479a4fe754010c9` | IDENTICO |
| 25 | 20260909042840 | `crm_v4_f00_25_campaign_contacts_state_check` | `f35a87f63e1875f50cba170217275f3c` | `f35a87f63e1875f50cba170217275f3c` | IDENTICO |
| 26 | 20260909042908 | `crm_v4_f00_26_realtime_notes_indices_timeline` | `4e7c7110ae81c2d110845800085a2646` | `4e7c7110ae81c2d110845800085a2646` | IDENTICO |
| 27 | 20260909043019 | `crm_v4_f00_27_revoke_anon_credit_rpcs` | `80f664329938530c0a38fa638c123d2c` | `80f664329938530c0a38fa638c123d2c` | IDENTICO |
| 28 | 20260909043152 | `crm_v4_f00_28_revoke_public_credit_rpcs` | `ddf9c34dfad12aeb1f99965a118a06c1` | `ddf9c34dfad12aeb1f99965a118a06c1` | IDENTICO |
| 29 | 20260909044626 | `crm_v4_f00_29_fix_customer_channel_identity_trigger` | `b1fa3c050c660077069d1c06228a58b2` | `b1fa3c050c660077069d1c06228a58b2` | IDENTICO |
| 30 | 20260909045035 | `crm_v4_f00_30_sync_status_from_stage_por_is_won_is_lost` | `3b44613ec63564ca32cacc7da9e6ecb9` | `3b44613ec63564ca32cacc7da9e6ecb9` | IDENTICO |
| 31 | 20260909045132 | `crm_v4_f00_31_backfill_stages_is_won_is_lost` | `d1529615bac7f439708562b834dc5ead` | `d1529615bac7f439708562b834dc5ead` | IDENTICO |
| 32 | 20260909045617 | `crm_v4_f00_32_fix_commission_payee_id_uuid` | `21322fcf8deaecac328d188f8ea522aa` | `21322fcf8deaecac328d188f8ea522aa` | IDENTICO |
| 33 | 20260909045821 | `crm_v4_f00_33_fix_auto_journal_commission_memo_cast` | `ff891d598a6f9165ce7fb1398d00d208` | `ff891d598a6f9165ce7fb1398d00d208` | IDENTICO |
| 34 | 20260909050029 | `crm_v4_f00_34_revoke_authenticated_credit_rpcs` | `6e0f35229e2cda60e0870d90516b1067` | `6e0f35229e2cda60e0870d90516b1067` | IDENTICO |
| 35 | 20260909050212 | `crm_v4_f00_35_advisors_r4_trigger_functions` | `b61282f68d49f0680c6b213242adc098` | `b61282f68d49f0680c6b213242adc098` | IDENTICO |
| 36 | 20260909153122 | `crm_v4_f04_r3_unique_objection_and_tag_relations` | `51b0e2e7c9a5f5fa063cec41dad89827` | `51b0e2e7c9a5f5fa063cec41dad89827` | IDENTICO |
| 37 | 20260909155202 | `crm_v4_f06_01_do_not_call_column_and_consent_gate` | `fac3ccb0cf3db0a9eac4f8214cf5ed4d` | `fac3ccb0cf3db0a9eac4f8214cf5ed4d` | IDENTICO |
| 38 | 20260909155341 | `crm_v4_f06_02_stage_agents_voices_tool_runs` | `a915d6926c2216bb3df0b11dbf525e5a` | `a915d6926c2216bb3df0b11dbf525e5a` | IDENTICO |
| 39 | 20260909155414 | `crm_v4_f06_03_dispatcher_guardrails_and_claim` | `dd4ed3fc749d1494f37ea10ceb9a0cad` | `dd4ed3fc749d1494f37ea10ceb9a0cad` | IDENTICO |
| 40 | 20260909155525 | `crm_v4_f08_01_engine_schema` | `7d617a0c7b795834bb50aa2d26103cce` | `7d617a0c7b795834bb50aa2d26103cce` | IDENTICO |
| 41 | 20260909155631 | `crm_v4_f08_02_enroll_rpc` | `5446ca2428e9057b380768671ac23d07` | `5446ca2428e9057b380768671ac23d07` | IDENTICO |
| 42 | 20260909170742 | `crm_v4_f08_03_enroll_chain_and_resume` | `43db146040f6d1cd03fbb32023d4e2bd` | `43db146040f6d1cd03fbb32023d4e2bd` | IDENTICO |
| 43 | 20260909172831 | `crm_v4_f06_04_revoke_anon_y_guarda_de_pertenencia` | `b4f22b8df24c368f5908879aab7c387d` | `b4f22b8df24c368f5908879aab7c387d` | IDENTICO |
| 44 | 20260909173358 | `crm_v4_f06_04_attempt_ledger_and_dispatch_guardrails` | `256bdc658f06de9db1832958613100b6` | `256bdc658f06de9db1832958613100b6` | IDENTICO |
| 45 | 20260909180354 | `crm_v4_f08_04_condition_step_fail_closed` | `1d9d2e732008ed7cba703b01aba69a38` | `1d9d2e732008ed7cba703b01aba69a38` | IDENTICO |
| 46 | 20260909181513 | `crm_v4_f06_05_consent_membership_y_libro_inmutable` | `25ccdb2471d7a5e2bf00b7ce363a4b47` | `25ccdb2471d7a5e2bf00b7ce363a4b47` | IDENTICO |
| 47 | 20260909182204 | `crm_v4_f06_05_privilege_snapshot_for_tests` | `8a694b913e9e61bf1943793a9588db08` | `8a694b913e9e61bf1943793a9588db08` | IDENTICO |
| 48 | 20260909183951 | `crm_v4_f06_06_tool_runs_audit_inmutable` | `0150371890da831cfa8b2a6da569174e` | `0150371890da831cfa8b2a6da569174e` | IDENTICO |
| 49 | 20260909184551 | `crm_v4_f06_07_privilege_snapshot_incluye_tool_runs` | `42a16f87549338f6cd9dac3818b07391` | `42a16f87549338f6cd9dac3818b07391` | IDENTICO |
| 50 | 20260909184837 | `crm_v4_f06_08_dedupe_atomico_despacho_puntual` | `1cb638a6059874bfde8e3e6b953d0790` | `1cb638a6059874bfde8e3e6b953d0790` | IDENTICO |
| 51 | 20260909185302 | `crm_v4_f06_09_privilege_snapshot_incluye_indices` | `d92869fab80530f487d156b485390e0d` | `d92869fab80530f487d156b485390e0d` | IDENTICO |
| 52 | 20260909190500 | `crm_v4_f09_stage_write_hardening` | `bee45de29f0e6cc8354b822a53a4d0b8` | `bee45de29f0e6cc8354b822a53a4d0b8` | IDENTICO |
| 53 | 20260910000134 | `crm_customer_lifecycle_ladder` | `5d7e183c65ac14363f6d18ddc0310590` | `5d7e183c65ac14363f6d18ddc0310590` | IDENTICO |
| 54 | 20260910063313 | `crm_v4_f05_bridges_call_link` | `085eb8d2cd59bf5fd9d70c23b285d15d` | `085eb8d2cd59bf5fd9d70c23b285d15d` | IDENTICO |
| 55 | 20260910063342 | `crm_v4_f05_mobile_verification` | `1ce51ba306473b554768cb6bff4fb4f5` | `1ce51ba306473b554768cb6bff4fb4f5` | IDENTICO |
| 56 | 20260910071154 | `crm_v4_f05_otp_fn_service_role_only` | `da7d6f7c03dd242bead3a4b5a793bd2d` | `da7d6f7c03dd242bead3a4b5a793bd2d` | IDENTICO |

Resultado: **56/56 IDENTICO**.
