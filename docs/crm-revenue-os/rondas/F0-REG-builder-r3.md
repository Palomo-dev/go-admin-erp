# F0-REG — Builder — Ronda 3 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Lista de tareas: veredicto del QA r2
(`F0-REG-qa-r2.md`, 8,9/10, puntos 1–3 obligatorios, 4–5 opcionales y «qué falta para
el 10») apoyado en el informe del tester (`F0-REG-tester-r2.md`, 8,5/10).

**Ronda reanudada.** El constructor anterior fue detenido a medias (parada total del
2026-09-15 ~19:35, `docs/HANDOFF-2026-09-15.md` §1) con la obra casi completa en el
árbol y sin informe. Esta reanudación **inspeccionó y completó**, no rehízo: se verificó
cada pieza contra el veredicto y contra la BD (MCP, SOLO `SELECT`), se corrigió lo que
quedaba rojo, se limpió el único error de lint del archivo tocado y se escribió este
informe. Ninguna migración aplicada; sin commits; sin nombres de organizaciones cliente.

## Migraciones PENDIENTES DE APLICAR (el orquestador las muestra al dueño)

| Migración | Rollback | Qué hace |
|---|---|---|
| `supabase/migrations/20260915220000_crm_v4_f00_38_ai_settings_solo_rpc.sql` (r2, sin cambios) | `…/rollbacks/20260915220000_…_rollback.sql` | Saldo de créditos solo por RPC (grants por columna, políticas por pertenencia). Dry-run OK (tester r2). |
| `supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql` (**editada en r3**) | `…/rollbacks/20260915221000_…_rollback.sql` (**reescrito en r3**) | Guardas NaN/negativo/sin fila en `decrement_ai_credits`; `refund_ai_credits(p_org_id, p_amount, p_previous)` con NULL/negativo → `false` (bajo 4); `fn_ai_usage_month` resuelve `p_tz` **una vez** en la CTE `tz` con `coalesce((select name from pg_timezone_names where lower(name) = lower(nullif(btrim(p_tz),'')) limit 1), 'UTC')` → nunca `22023`; contrato «`metadata.cost_amount` en texto se descarta» documentado en cabecera y en `comment on`. Rollback con el texto **literal** de `pg_get_functiondef`. |
| `supabase/migrations/20260915235000_crm_v4_f00_43_cupo_plan_ia_unica_fuente.sql` (**nueva en r3**) | `…/rollbacks/20260915235000_…_rollback.sql` | Una sola fuente del «cupo del plan» (bajo 6 y «para el 10»): `fn_ai_plan_quota(p_org)` y `fn_provision_ai_settings(p_org)` (idempotente: INSERT `on conflict do nothing` o UPDATE filtrado por `credits_reset_at is null`); `sync_ai_credits_on_subscription` y `fn_reset_monthly_ai_credits` reescritas para leer de ella. SECDEF, EXECUTE solo `service_role`. Rollback literal (md5 igual). |
| `supabase/migrations/20260915235500_crm_v4_f00_44_organizations_timezone_valida.sql` (**nueva en r3**) | `…/rollbacks/20260915235500_…_rollback.sql` | Trigger `trg_validate_org_timezone` BEFORE INSERT/UPDATE OF `timezone`: canoniza contra `pg_timezone_names` (mayúsculas), vacío → default de la columna, desconocida → `22023` con hint. Sin datos tocados. |

Cada archivo lleva al pie las consultas de verificación (SELECT). El código funciona
**antes** de aplicarlas (respaldo en Node: `ensureAiSettingsFallback`, detección
`PGRST202`/`42883`, reintento UTC ante `22023`) y **después** (RPC).

Verificado por MCP (SELECT) en esta reanudación, 2026-09-15:
- `md5(pg_get_functiondef)` en BD: `decrement_ai_credits(integer,integer)` =
  `a68f25987e9543ffbf0cfb812f11d92e`, `refund_ai_credits(integer,integer)` =
  `f0c1222c7a429941892d70cf348be395`, `sync_ai_credits_on_subscription()` =
  `1ead735d7b2f1df2c2571717c7ed2ba5`, `fn_reset_monthly_ai_credits()` =
  `1639c30c7347a0792e8316bab9cabb8a`. El md5 del bloque `CREATE OR REPLACE … $function$\n`
  de cada rollback (39 y 43), calculado en Node sobre el archivo en UTF-8 (LF, sin CR),
  coincide byte a byte con los cuatro valores. Ninguna de las cuatro funciones nuevas
  (`fn_ai_usage_month`, `fn_comm_usage_month`, `fn_ai_plan_quota`,
  `fn_provision_ai_settings`) existe hoy en BD: 38, 39, 43 y 44 siguen sin aplicar.
- La expresión de la CTE `tz` ejecutada como `SELECT` suelto: `'Marte/Fobos'` → `UTC`,
  `'america/bogota'` → `America/Bogota`, `NULL` → `UTC`.
- `ai_settings`: 39 filas, **0** con `credits_reset_at IS NULL`; `organizations`: **0**
  con zona fuera de `pg_timezone_names`.

## Qué se hizo en esta ronda

Ya estaba en el árbol al reanudar (verificado línea a línea contra el veredicto):

- `src/lib/services/aiCreditsService.ts`: `ensureAiSettings(orgId, client?)` devuelve
  `{created, provisioned, credits_remaining, aiModel, aiMaxTokens}`; primero intenta la
  RPC `fn_provision_ai_settings` (mig. 43) y, si no existe, el respaldo en Node: fila
  ausente → `insert` (23505 → releer); fila con `credits_reset_at IS NULL` →
  `update({credits_remaining: greatest(saldo, cupo), credits_reset_at: now})` filtrado por
  `.is('credits_reset_at', null)` (0 filas → releer, máx. 2 reintentos); fila provisionada
  → se devuelve tal cual. `getAIFeaturesForOrganization` consulta `fn_ai_plan_quota` y, sin
  ella, `planQuotaFallback` con la **misma** regla (custom_config `ai_credits`/`aiCredits`
  entero incluido 0 → ese valor; si no, `plans.ai_credits_monthly`; sin suscripción → 0,
  ya no 10 000). `consumeAICredits` y `withAICreditsCheck` marcadas `@deprecated`.
- `src/lib/services/crm/aiCostService.ts`: `callDecrement` selecciona
  `organization_id, credits_reset_at` y devuelve `{ok:false, missingRow, unprovisioned}`;
  `chargeAiCredits` entra en la auto-provisión con `missingRow || unprovisioned` y un único
  reintento; `refundAiCredits` lanza `RangeError` con NaN/±Infinity/negativo
  (`assertValidCredits`, simetría con el cobro, bajo 4).
- `src/lib/services/crm/aiUsageStatsService.ts`: `isUnknownTimeZoneError` (`22023` con
  «time zone» en el mensaje, o el mensaje de Postgres sin código) y en `getAiUsageMonth` un
  solo reintento con `p_tz: 'UTC'` (mismo `p_since`) precedido de `console.warn`; con
  `tz === 'UTC'` no reintenta.
- `src/lib/utils/timezone.ts`: `isSupportedTimeZone(tz)` — pertenencia exacta a
  `Intl.supportedValuesOf('timeZone')` (+ `UTC`), con `DateTimeFormat` como respaldo donde
  no exista `supportedValuesOf`. `DEFAULT_TIMEZONE` sigue siendo solo fallback.
- `src/components/calendario/configuracion/useCalendarSettings.ts`: valida la zona con
  `isSupportedTimeZone` antes de escribir `organizations.timezone` y ya **no traga** el
  error del `update` (antes decía «guardado» aunque la BD rechazara).
- `src/app/api/crm/config/providers/test/route.ts`: `safeParse` del body **antes** de
  `checkRateLimit` (bajo 5); `readOrgBody(ctx, body)` en `providers/route.ts` PUT y en
  `test` (patrón de F0-SEC-CD: org de sesión, body con otra org → 403).
- Migraciones 39 (editada), 43 y 44 (nuevas) con sus rollbacks.
- Tests: `f0RegTester.r2.test.ts:442` `it.failing` → `it` (+ caso de dos peticiones
  concurrentes sobre la fila sin provisionar); `aiCostService.test.ts`: «fila con
  `credits_reset_at NULL` y plan con cupo → provisiona (update … is(credits_reset_at,
  null)) y cobra» y «plan sin cupo → 402, un solo RPC, fila queda provisionada con 0»;
  reembolso negativo/NaN/Infinity → `RangeError`; `aiUsageStats.test.ts`: «22023 →
  reintento con UTC, 2 llamadas, mismo `p_since`», «22023 con zona UTC no reintenta»,
  `isUnknownTimeZoneError`; `f0RegTester.r2.routes.test.ts`: «`GET /credits` con zona que
  Postgres no reconoce → 200», «body inválido → 400 sin consumir cupo; el siguiente válido
  → 429»; `f0RegTester.r1.test.ts`: el test que consagraba `true` para el reembolso
  negativo pasa a esperar `RangeError`.

Hecho en esta reanudación:

- `src/app/api/crm/config/__tests__/f0RegTester.r2.routes.test.ts` (test del 22023): el
  fake sobreescrito devolvía el error **sin registrar** la primera llamada en `rpcCalls`, y
  la aserción «2 llamadas» fallaba con 1 (era el único rojo de la suite). El fixture ahora
  registra la llamada rechazada; el código de la ruta no cambió.
- `useCalendarSettings.ts`: `userId` destructurado y nunca usado (error de ESLint
  preexistente en un archivo tocado por la ronda) → se deja en las props, no se
  destructura.
- Verificación completa (abajo) y este informe.

## Feedback de la ronda anterior que se atendió

- [medio 1] Fila `ai_settings` del navegador (0 créditos, `credits_reset_at NULL`) nunca
  recibía el cupo → `ensureAiSettings` trata `credits_reset_at IS NULL` como «sin
  provisionar» (RPC 43 o respaldo idempotente por `is('credits_reset_at', null)`);
  `callDecrement` devuelve `unprovisioned`; `chargeAiCredits` provisiona y reintenta una
  vez. `it.failing` → `it`; tests nuevos en `aiCostService.test.ts`.
- [medio 2] Zona válida para Intl y no para Postgres → `22023` → 500 → tres capas:
  `fn_ai_usage_month` resuelve la zona contra `pg_timezone_names` una vez (`coalesce` →
  `UTC`); Node reintenta una vez con UTC; la escritura desde configuración valida con
  `isSupportedTimeZone` y la BD con el trigger de la 44. Tests en `aiUsageStats` y rutas.
- [bajo 3] Rollback 39 no byte-idéntico → reescrito con el texto literal de
  `pg_get_functiondef`; md5 comprobado (arriba). Comentarios `obj_description` restaurados
  tal cual (decrement sin comentario; refund con el suyo).
- [bajo 4] Reembolso negativo/NULL → `false` en la RPC (`p_amount is null or < 0`), `= 0`
  sigue `true`; `RangeError` en Node. Tests de r1 y r2 actualizados.
- [bajo 5] `POST /providers/test` valida el body antes del rate limit; test de r2 routes
  ajustado (400 no consume cupo; el siguiente válido da 429).
- [bajo 6] Tres implementaciones del cupo → migración 43 (`fn_ai_plan_quota`) y el
  respaldo en Node con la misma regla; trigger y cron reescritos sobre ella.
- [bajo 7] Informe desactualizado en `eslint`/`tsc` → sección «Verificación» con el estado
  real y lo ajeno separado.

## Decisiones de diseño relevantes

- **`credits_reset_at IS NULL` es la señal de «no provisionada»**, no «saldo 0»: una org
  legítimamente en 0 (con fecha de reset) recibe 402 sin que cada cobro consulte el plan.
  La 38 deja esa columna fuera de los grants de sesión, así que solo el navegador produce
  filas con NULL y solo service role/RPC las provisionan.
- **Idempotencia sin bloqueo explícito**: el UPDATE filtrado por `credits_reset_at is
  null` (o el `on conflict do nothing`) garantiza que dos peticiones concurrentes
  provisionan una vez; la que actualiza 0 filas relee. Mismo contrato en SQL (43) y en el
  respaldo Node.
- **La RPC 39 resuelve la zona sola** (no depende de que Node capture `22023`), y Node
  además reintenta: el reintento cubre la función actual **y** cualquier otra RPC con
  `p_tz`. `since` no se recalcula en el reintento: el inicio del periodo sigue siendo el de
  la zona de la organización; solo cambia el corte diario de `by_day`.
- **Validación de zona más estricta al escribir que al leer**: escribir exige pertenencia
  exacta a `Intl.supportedValuesOf` (alias como `US/Eastern` o `EST` se rechazan porque
  Postgres no los garantiza); leer una zona ya guardada sigue con la comprobación laxa y
  cae al fallback sin tumbar nada.
- **Rollback 43 no reabre EXECUTE de `fn_reset_monthly_ai_credits` a public**: la 40 la
  cierra igualmente y reabrirla sería un retroceso; está documentado en la cabecera.
- **Efecto de la 43 sobre datos reales** (cabecera de la migración, verificado por MCP en
  r3): 82/84 orgs conservan el cupo; 6 enterprise con `aiCredits` camelCase pasan de 0 a
  su valor en el cron (Node ya se lo daba); 2 enterprise en prueba con `aiCredits: 0`
  pasan de 10 000 (Node) a 0 (lo que dice su configuración). Ninguna de esas 2 tiene fila.

## Verificación

- `TZ=UTC` y `TZ=America/Bogota`: `f0RegTester.r1`, `f0RegTester.r2`,
  `src/app/api/crm/config/__tests__/**` (`f0RegTester.r2.routes`), `aiCostService`,
  `pricingService`, `providerRegistry`, `providerConfigContract.tester`,
  `crm/aiUsageStats`, `src/__tests__/guardrails.test.ts` → **9 suites, 263/263** en ambas
  zonas. El guardarraíl **no** está roto por la obra de F0-SEC-CD en el estado actual del
  árbol.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`: **5 errores,
  todos ajenos** a REG y ya listados en el handoff
  (`FormularioEdicionProducto.tsx` ×2, `crm/__tests__/f13Round3Tester.test.ts` ×2 — otra
  sesión —, `deliveryIntegrationService.ts:661`). `grep -E
  "provider|aiCost|aiUsage|pricing|credits|aiCredits|ai-assistant|config/|rbac|timezone"`
  → **0 líneas**. El error de `webhookTemplateStatus.test.ts:28` del handoff ya no aparece.
- `npx eslint` sobre los 12 archivos tocados (servicios, rutas, utilidades, hook, tests)
  → **0 errores, 0 avisos** (tras quitar el `userId` sin uso).
- `npx next build`: **«Compiled successfully in 9.8min»** (0 errores de compilación en
  toda la app), pero la fase siguiente «Collecting page data» abortó con
  `PageNotFoundError: Cannot find module for page: /_document` (exit 1). Es el síntoma
  conocido de un `next dev` de **otra sesión** corriendo en la misma carpeta y compartiendo
  `.next` durante el build (había uno activo); no señala ningún archivo de REG. Repetir el
  build con el dev server parado antes del QA r3.
- BD (MCP, SELECT): md5 de las cuatro funciones restauradas por los rollbacks 39 y 43
  iguales al archivo; 0 filas `ai_settings` sin provisionar; 0 orgs con zona fuera del
  catálogo; expresión de la CTE `tz` probada con zona inválida, minúsculas y NULL.

## Pendientes que dejo explícitamente para revisión

- **Migraciones 38, 39, 43 y 44 sin aplicar** (decisión del dueño; la 38 arrastra la
  pregunta de si la configuración del chat IA es solo de admins). El dry-run de 39
  (`'Marte/Fobos'` → jsonb sin error), 43 (`fn_provision_ai_settings` sobre una fila
  «vacía» simulada dentro de `begin … rollback`) y 44 (`'america/bogota'` canonizada,
  `'Marte/Fobos'` → 22023) queda para el tester con rol real impersonado; este constructor
  es solo lectura en BD.
- La regla del cupo vive **dos** veces mientras la 43 no esté aplicada (SQL + respaldo
  Node con la misma regla y tests que la fijan). Al aplicarla, retirar `planQuotaFallback`
  y `ensureAiSettingsFallback` en una ronda posterior, igual que el respaldo de
  `aiUsageStatsService` cuando la 39 esté en producción.
- `useCalendarSettings` mantiene `userId` en la interfaz de props por compatibilidad con
  los llamadores; si se quiere retirar, hay que tocar `ConfiguracionCalendario` (fuera de
  REG).
- Sigue fuera de esta ronda (lista «para el 10» del QA): concurrencia real con dos
  conexiones sobre `decrement_ai_credits`/`refund_ai_credits`; `refundCommCredits`;
  auditoría de deriva de saldo; Vault para `provider_configs.credentials`; migrar los 11
  llamadores V3 de `consumeAICredits`; `offsetMinutesToISO(0)` → `+00:00`.
