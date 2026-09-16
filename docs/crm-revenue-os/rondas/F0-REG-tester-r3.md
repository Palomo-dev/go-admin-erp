# F0-REG — Tester — Ronda 3 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r3.md`,
`F0-REG-qa-r2.md` (8,9/10; puntos 1–5 y «para el 10»), `F0-REG-tester-r2.md`
(8,5/10). Migraciones PENDIENTES probadas en seco (MCP, `begin; … rollback;`,
**nada aplicado**): 38, 39, 43 y 44 con sus rollbacks. BD: proyecto
`jgmgphmzusbluqhuqihj`. Sin nombres de organizaciones cliente: la org de prueba es
`org 120` (la misma que en r2), y en el dry-run de la 43 las orgs «sin fila» se
eligieron por consulta, no por nombre.

**Ronda reanudada.** El tester anterior murió por el apagado del equipo sin dejar
informe ni archivos: no existía ningún `f0RegTester*R3*` en el árbol ni borrador de
este documento. Se partió de cero sobre el código r3, sin rehacer lo que r1 y r2 ya
cubren (sus suites se relanzaron como línea base y como jueces de la mutación).

Suites nuevas dejadas en el repo (sin datos reales; ids 7/9/999 y valores inventados):
- `src/__tests__/services/f0RegTesterR3.test.ts` — 28 casos (1 `it.failing` que
  documenta el hueco 2).
- `src/__tests__/services/f0RegTesterR3.routes.test.ts` — 10 casos con `next/server`
  real (1 `it.failing` que documenta el hueco 1).

## Resumen de pruebas

- Casos ejecutados: 225 automatizados (189 de la línea base r1/r2/builder +
  guardarraíl y 36 nuevos), cada uno en `TZ=UTC` y `TZ=America/Bogota` y contado una
  vez; 93 verificaciones en BD (dry-run de 38/39/43/44 con rollback); 16 mutantes
  (137 casos juez por mutante); 9 verificaciones manuales de código.
- Pasaron: todos los automatizados (los 2 `it.failing` pasan porque el hueco existe);
  93/93 del dry-run; 15/16 mutantes muertos + 1 equivalente; en las manuales, 2 fallos nuevos y 4
  observaciones.
- Fallos nuevos: 0 críticos, 0 altos, **1 medio**, **5 bajos**.

## Tabla de verificación — puntos del QA r2 contra el código r3

| # QA r2 | Qué pedía | Dónde está en r3 (archivo:línea) | Test que lo fija | Veredicto |
|---|---|---|---|---|
| 1 (medio) | Fila «vacía» (`credits_reset_at NULL`) se provisiona y se cobra; `callDecrement` devuelve `unprovisioned`; `it.failing` → `it` | `aiCostService.ts:158-164` (`select organization_id, credits_reset_at` → `unprovisioned`), `:232-247` (rama con `missingRow \|\| unprovisioned`, un reintento); `aiCreditsService.ts:197-271` (`ensureAiSettings` → RPC 43 o respaldo con `update … is('credits_reset_at', null)`, 23505/0 filas → releer, máx. 2) | r2 `:442` y `:491` (ya `it`); `aiCostService.test.ts` (fila NULL y plan sin cupo); **R3**: camino por RPC 43 sin respaldo, RPC rota (42501) → 402 sin caer al respaldo, RPC basura → respaldo, org inexistente → 402 con 1 RPC, saldo en texto, fila provisionada con 0 → 402 sin consultar el plan | ✅ cerrado |
| 2 (medio) | Zona horaria a prueba de catálogo en las dos capas; `22023` → reintento con UTC; test en ruta | Mig. 39 `:208-214` (CTE `tz` con `lower(...)`, `btrim`, `nullif`, `coalesce → 'UTC'`); `aiUsageStatsService.ts:101-105` (`isUnknownTimeZoneError`) y `:113-119` (un reintento, `tz !== 'UTC'`, mismo `since`); `timezone.ts:53-63` (`isSupportedTimeZone`); `useCalendarSettings.ts:93-101` y `:142-148` (valida antes y ya no traga el error); mig. 44 (trigger) | `aiUsageStats.test.ts` (22023 → 2 llamadas, UTC no reintenta); r2 routes `:163`; **R3**: 22023 sin «time zone» no reintenta, mensaje vacío sí, segundo 22023 → error controlado en 2 llamadas, `utc`/`''` reintentan, `isSupportedTimeZone` bordes; ruta: 22023 persistente → 500 controlado sin filtrar el mensaje; dry-run 39 filas 18-27 y 44 filas 1-13 | ✅ cerrado (con 2 bajos: ICU≠IANA y coste de `pg_timezone_names`) |
| 3 (bajo) | Rollback 39 byte-idéntico (`md5(pg_get_functiondef)`) | `rollbacks/…39_rollback.sql:31-88` y `:95-124` (texto literal, mayúsculas) | Dry-run `begin; 39; rollback-39; …; rollback;` → md5 `a68f2598…` y `f0c1222c…` **iguales** a los actuales; comentarios (`obj_description`) idénticos; ACL idéntica; 0 funciones `fn_*_usage_month` | ✅ cerrado |
| 4 (bajo) | Reembolso simétrico: NULL/negativo → `false` en la RPC, `RangeError` en Node; `0` sigue `true` | Mig. 39 `:133-135`; `aiCostService.ts:357-358` | r1 (actualizado), r2 `:211`; dry-run 39: `refund(120,null)=false`, `refund(120,-5)=false`, `refund(120,0)=true`, `refund(-1,5)=false`, saldo intacto; **R3**: `-0`/`0` sin RPC, `-Infinity`/`-0.4` → `RangeError`, RPC `false` → `false` sin fila `:refund` ni dedupe | ✅ cerrado |
| 5 (bajo) | `safeParse` antes de `checkRateLimit` en `POST /providers/test` | `test/route.ts:142-150` | r2 routes `:246` (**no distingue el orden**: su doble no cuenta llamadas; mutante M13 sobrevivía); **R3 routes**: body inválido → 0 llamadas a `checkRateLimit`, válido → 1 | ✅ cerrado (test de r2 sin dientes, ver mutación) |
| 6 (bajo, «para el 10») | Una sola fuente del cupo del plan | Mig. 43 `fn_ai_plan_quota` `:75-112`, `fn_provision_ai_settings` `:123-177`, trigger `:188-219` y cron `:230-284` reescritos sobre ella; `aiCreditsService.ts:100-149` (respaldo Node con la misma regla y `fn_ai_plan_quota` primero) | Dry-run 43 (29 verificaciones: cupos de 84 orgs = 75 `plan` + 9 `custom_config`, fila vacía provisionada una sola vez, org sin fila `created=true` y luego `false`, trigger y cron sin cambiar el saldo de la org 120 fuera de lo esperado); **R3**: custom 0 gana al plan, camelCase, texto con espacios, valores no enteros → plan, cancelada reciente no gana a activa, sin suscripción → 0; divergencia decimal documentada | ✅ cerrado (1 bajo: divergencia con decimales, 0 filas hoy) |
| 7 (bajo) | Informe del builder con el estado real de `eslint`/`tsc` | `F0-REG-builder-r3.md` §Verificación | Reproducido: `tsc` 13 errores, **0 de REG** (ver comandos); `eslint` 0 en los archivos tocados | ✅ |
| Regla 5 | Org de sesión, nunca del body (`readOrgBody` en PUT y en `test`) | `providers/route.ts:91-97` (en `try/catch` → 403); `test/route.ts:142` (**fuera** de todo `try`) | **R3 routes**: PUT con `organization_id`/`organizationId`/`orgId`/`org_id` ajenos → 403 y sin upsert; misma org (7 y "7") → 200 con la org de sesión; `POST /test` misma org → 200; **org ajena → excepción sin manejar** (`it.failing` + test de evidencia) | ⚠️ **fallo nuevo 1 (medio)** |
| Credenciales | Jamás salen al cliente | `grep` de `SUPABASE_SERVICE_ROLE_KEY`/`service_role` en `src/components` y `src/app/**/*.tsx` → 0; ningún `'use client'` importa `server-service`, `providerCredentials.server`, `aiCostService` ni `aiCreditsService`; `providerCredentials.server.ts:53` `assertServerOnly()`; `listProviderConfigsSafe` solo devuelve `configured`/`settings` (contrato r1/r2) | r1/r2 `providerConfigContract.tester`, r2 routes (`source: 'env'` sin detalle, secretos enmascarados) | ✅ |
| Nunca se cobra una generación fallida | Cobro antes del proveedor, reembolso después | `aiCostService.ts:407-425` (`withAiCharge`), `aiCreditsService.ts:442-459` (`withAICreditsCheck` delega) | r1, r2 `:119-156`, `aiCostService.test.ts` (rastro `:refund_failed`); guardarraíl 19 (79/79) | ✅ |

## Dry-run de las migraciones (MCP `execute_sql`, `begin; <migración>; <verificaciones>; rollback;`)

Método: el MCP devuelve la última consulta con filas antes del `rollback`, así que cada
bloque termina en un `select jsonb_build_object(...)` (o una tabla temporal `on commit
drop` agregada) con todas las verificaciones. Probé antes que `begin; create table …;
rollback;` revierte de verdad (la tabla no existe después). Se quitaron `begin;`/`commit;`
propios de cada `.sql` (misma nota que en r2). Estado de la BD comprobado **antes y
después de cada bloque**: md5 de las cuatro funciones existentes iguales a los del
informe del builder, 0 filas `tester_r3%` en `ai_usage_logs`, saldo de la org 120 = 3995,
`organizations.timezone` de la 120 = `America/Bogota`, 0 funciones nuevas.

### Migración 39 (guardas + `fn_ai_usage_month` con zona resuelta) — 30/30

| # | Prueba | Esperado | Obtenido |
|---|---|---|---|
| 1 | `decrement(120, NULL)` / `(120, -1)` / `(-1, 1)` / `(NULL, 1)` | false ×4, sin excepción | false ×4 |
| 2 | `decrement(120, 0)` | true (no-op) | true; saldo sigue 3995 |
| 3 | `refund(120, NULL)` / `(120, -5)` / `(120, 0)` / `(-1, 5)` / `(120, 0, -99)` | false / false / true / false / true | exactamente eso; saldo 3995 |
| 4 | sobrecargas de `refund_ai_credits` | 1 (3 parámetros) | 1 |
| 5 | ACL de las 4 funciones | solo `postgres` y `service_role` | `{postgres=X,service_role=X}` ×4 |
| 6 | `has_function_privilege`: authenticated en `fn_ai_usage_month`, anon en `decrement` / service_role en `fn_ai_usage_month` y `refund(int,int,int)` | false, false / true, true | igual |
| 7 | 4 filas insertadas a las 04:30–04:33Z de mañana (= 23:30 de hoy en Bogotá): cobro 7 (0.5 USD en columna), cobro 3 (`metadata.cost_amount: 1.25` sin columna), cobro 2 (`metadata.cost_amount: "9.99"` **texto**), reembolso −7 | Bogotá: `by_day = [hoy]`, credits 5, usd **1.75** (el texto no cuenta), `calls` 2 en m1 y 1 en m2 (el reembolso no es llamada); UTC: `by_day = [mañana]` | exactamente eso (`2026-09-16` Bogotá, `2026-09-17` UTC; `expected_day_*` calculados en SQL) |
| 8 | `p_tz = 'Marte/Fobos'` | jsonb **sin error**, igual que UTC | igual a UTC (`marte_eq_utc = true`) |
| 9 | `p_tz = 'america/bogota'` / `'AMERICA/BOGOTA'` / `'  America/Bogota '` | igual que `America/Bogota` | true ×3 |
| 10 | `p_tz = ''` / `NULL` | igual que UTC | true ×2 |
| 11 | `p_tz = 'EST'` (abreviatura del catálogo) | se acepta (está en `pg_timezone_names`) | `by_day` en EST (`2026-09-16`) |
| 12 | `fn_ai_usage_month(-1, …)` / `fn_comm_usage_month(120, now())` | jsonb vacío con claves / claves `spent_usd/rows/by_channel` | OK / OK |
| 13 | `comment on` de `fn_ai_usage_month` menciona «nunca 22023» | true | true |
| 14 | **39 + rollback 39** en la misma transacción → `md5(pg_get_functiondef)` | `a68f25987e9543ffbf0cfb812f11d92e` y `f0c1222c7a429941892d70cf348be395` | **iguales**; `obj_description` de ambas idéntico al actual; ACL idéntica; `fn_*_usage_month` = 0 |

### Migración 43 (cupo único) — 29/29

| # | Prueba | Esperado | Obtenido |
|---|---|---|---|
| 1 | `fn_ai_plan_quota(120)` | plan de la org: 2000 / rollover 2000 / modelo / 8000 / `plan` | igual |
| 2 | `fn_ai_plan_quota(-1)` / `(NULL)` | 0, 0, `gpt-4o-mini`, 1000, `none` | igual ×2 |
| 3 | `fn_provision_ai_settings(120)` (fila ya provisionada) | `created=false, provisioned=false`, saldo intacto | igual; saldo 3995 antes y después |
| 4 | `fn_provision_ai_settings(-1)` / `(NULL)` | `created=false, provisioned=false, credits_remaining 0, source none` | igual ×2 |
| 5 | fuentes del cupo en las 84 orgs | mayoría `plan`, `custom_config` para las enterprise | `plan: 75, custom_config: 9` (coincide con las 9 suscripciones con `custom_config` numérico) |
| 6 | fila «vacía» simulada (`insert (organization_id, temperature)` en una org sin fila con suscripción activa) | nace con `credits_remaining 0`, `credits_reset_at NULL` | igual (defaults de columna) |
| 7 | `fn_provision_ai_settings(<esa org>)` dos veces | 1.ª `provisioned=true`, 2.ª `provisioned=false` (idempotente), saldo = cupo | true / false; el cupo de esa org es 0 (plan gratuito) y queda 0 con `credits_reset_at` puesto |
| 8 | org sin fila (`max(id)` sin `ai_settings`) dos veces | 1.ª `created=true`, 2.ª `created=false, provisioned=false` | true / false; cupo 10 000 por `custom_config` |
| 9 | `count(*) … credits_reset_at is null` tras provisionar | 0 | 0 |
| 10 | trigger: `update subscriptions set status = status` en la activa de la 120 | saldo `greatest(3995, 2000)` = 3995 | 3995 |
| 11 | cron `fn_reset_monthly_ai_credits()` sobre las 39 filas | 39 filas, `monthly_credits` nunca NULL (bug del cron viejo corregido); org 120: monthly 2000 + rollover `least(3995, 2000)` = 4000 | 39 filas, 0 NULL, 120 → 4000 |
| 12 | ACL de las 4 funciones | solo `postgres` y `service_role`; authenticated sin EXECUTE en `fn_provision_ai_settings` | igual |
| 13 | **43 + rollback 43** → md5 de `sync_ai_credits_on_subscription()` y `fn_reset_monthly_ai_credits()` | `1ead735d7b2f1df2c2571717c7ed2ba5` y `1639c30c7347a0792e8316bab9cabb8a` | **iguales**; comentarios idénticos; `fn_ai_plan_quota`/`fn_provision_ai_settings` = 0. La ACL de `fn_reset_monthly_ai_credits` queda cerrada (hoy está abierta a `anon`/`authenticated`/public): documentado en la cabecera del rollback y correcto. |

### Migración 44 (trigger de zona horaria) — 17/17

| # | `update organizations set timezone = …` (org 120) | Esperado | Obtenido |
|---|---|---|---|
| 1 | `'america/bogota'` / `'AMERICA/MEXICO_CITY'` / `'  Europe/Madrid '` / `'utc'` | canonizado | `America/Bogota` / `America/Mexico_City` / `Europe/Madrid` / `UTC` |
| 2 | `'EST'` / `'US/Eastern'` | se aceptan (están en el catálogo) | `EST` / `US/Eastern` (ver bajo 2: Node los rechaza; la BD es más laxa que la app) |
| 3 | `''` / `'   '` / `NULL` | `America/Bogota` (fallback), sin violar NOT NULL | igual ×3 |
| 4 | `'Marte/Fobos'` / `'America/Bogota; drop table x'` | `22023` con mensaje | `ERR 22023 Zona horaria no reconocida por Postgres: …` ×2 |
| 5 | `update … set updated_at = updated_at` | no dispara (`UPDATE OF timezone`) | sin error |
| 6 | coste de una escritura de `timezone` | «~1 200 filas» | 63 ms (`pg_timezone_names` materializa entero) |
| 7 | trigger `O`, función sin SECURITY DEFINER, 0 orgs fuera del catálogo | 1 fila `O` / false / 0 | igual |
| 8 | **44 + rollback 44** | trigger 0, función 0, los otros 15 triggers de `organizations` intactos | 0 / 0 / 15 |

### Migración 38 (sin cambios desde r2) — 17/17

Instantánea de `pg_policies`, `role_table_grants` y `column_privileges` antes → 38 → rollback
38 → `except` en las dos direcciones = **0 diferencias** en políticas, grants de tabla y
grants de columna. Tras la 38: 3 políticas (`select/insert/update` a `{authenticated}`),
`authenticated` sin UPDATE en `credits_remaining` ni INSERT en `credits_reset_at`, con
UPDATE en `model`; `anon` sin SELECT; `authenticated` sin DELETE; `service_role` con UPDATE.
(El dry-run con miembro impersonado de rol 4 es el de r2, filas 6-15; no se repitió.)

## Mutation testing (aiCostService / aiCreditsService / aiUsageStatsService / test/route / timezone)

16 mutantes aplicados uno a uno con un script en el scratchpad (sustitución exacta,
única coincidencia), jueces: `f0RegTester.r1`, `f0RegTester.r2`, `aiCostService`,
`aiUsageStats`, `f0RegTester.r2.routes`, `f0RegTesterR3`, `f0RegTesterR3.routes`
(`TZ=America/Bogota`, `--silent`). Restauración byte a byte tras cada mutante y
`md5sum -c` final sobre los cinco archivos: **5/5 OK** (`aiCostService.ts
66b33cba…`, `aiCreditsService.ts 24f3b877…`, `aiUsageStatsService.ts c344859b…`,
`test/route.ts c336da37…`, `timezone.ts 5ff95a08…`, iguales antes y después).

| Mutante | Archivo | Estado | Quién lo mata |
|---|---|---|---|
| M1 rama de auto-provisión sin `\|\| outcome.unprovisioned` | aiCostService | muerto (7) | aiCostService ×3, r2, **R3** ×2 |
| M2 `credits_reset_at == null` → `=== undefined` | aiCostService | muerto (7) | aiCostService ×3, r2, **R3** ×3 |
| M3 reembolso sin `assertValidCredits` (vuelve a `max(0, round)`) | aiCostService | muerto (4) | r1, r2, aiCostService, **R3** |
| M4 reintento con UTC aunque `tz === 'UTC'` | aiUsageStats | muerto (2) | aiUsageStats, **R3 routes** |
| M5 `isUnknownTimeZoneError`: cualquier 22023 → true | aiUsageStats | muerto (3) | aiUsageStats, **R3** ×2 |
| M6 `provisionViaRpc` traga cualquier error de la RPC (→ respaldo) | aiCreditsService | muerto (1) | **solo R3** («RPC rota 42501 → 402 sin respaldo») |
| M7 plan gana a `custom_config` (`plan \|\| custom`) | aiCreditsService | muerto (3) | **solo R3** (custom 0, camelCase, decimal) |
| M8 reintento del cobro con `credits_remaining >= 0` | aiCostService | muerto (3) | aiCostService ×2, **R3** |
| M9 `rows[0]` sin priorizar activa/en prueba | aiCreditsService | muerto (1) | **solo R3** («cancelada reciente no gana») |
| M10 reintento UTC recalcula `p_since` con `new Date()` | aiUsageStats | muerto (3) | aiUsageStats, r2 routes, **R3** |
| M11 fila con `credits_reset_at NULL` tratada como provisionada | aiCreditsService | muerto (5) | aiCostService ×2, r2 ×2, **R3** |
| M12 `.is('credits_reset_at', null)` → `.is('credits_reset_at', row.credits_reset_at)` | aiCreditsService | **equivalente** (sobrevive) | en la única rama alcanzable `row.credits_reset_at` ya es `null`: mismo SQL. No es un hueco de tests. |
| M13 `checkRateLimit` antes de `safeParse` (orden de r1 otra vez) | test/route | **sobrevivía** → muerto (1) | El test r2 «400 sin consumir cupo» no lo detecta porque su doble de `checkRateLimit` no cuenta llamadas. Test nuevo en **R3 routes** que exige 0 llamadas con body inválido y 1 con válido. |
| M14 `isSupportedTimeZone` sin la pertenencia a `supportedValuesOf` | timezone | muerto (2) | **R3** (alias/abreviaturas rechazados) + el `it.failing` (pasa a verde con el mutante → falla) |
| M15 `custom_config` 0 ignorado (`> 0`) | aiCreditsService | muerto (1) | **solo R3** («custom 0 gana al plan») |
| M16 reembolso: RPC `false` tratado como éxito | aiCostService | muerto (2) | aiCostService («deja rastro»), **R3** |

Resultado: **15/16 muertos + 1 equivalente**; 14/16 con las suites previas, y 4 (M6,
M7, M9, M15) más M13 solo mueren con las suites nuevas.

## Fallos encontrados

1. **[medio] `POST /api/crm/config/providers/test` con otra organización en el body
   revienta con una excepción sin manejar (500 de Next), no con el 403 que promete el
   builder.** `src/app/api/crm/config/providers/test/route.ts:142`:
   `bodySchema.safeParse(readOrgBody(ctx, await request.json().catch(() => null)))` está
   fuera de todo `try`; `readOrgBody` lanza `OrgContextError(403, FOREIGN_ORGANIZATION)`
   (`src/lib/security/organizationBody.ts:123`) y nadie la convierte en respuesta. El PUT
   de `providers/route.ts:91-97` sí la envuelve. Reproducción:
   `POST /api/crm/config/providers/test` con `{ "category": "calendar", "organization_id": 999 }`
   como admin de la org 7 → la promesa de `POST` rechaza con `OrgContextError` (test
   «la excepción que escapa es OrgContextError(403, FOREIGN_ORGANIZATION)» en
   `f0RegTesterR3.routes.test.ts`; `it.failing` «HUECO: body con otra organización →
   403»). El `console.warn` sí se registra y la petición **no** se ejecuta, así que no
   es un salto de tenant; es un contrato roto y un 500 espurio en los logs. Arreglo:
   envolver como en el PUT (o `withOrg`).

2. **[bajo] `isSupportedTimeZone` rechaza nombres canónicos de IANA que Postgres sí
   reconoce.** `Intl.supportedValuesOf('timeZone')` devuelve los canónicos de **ICU**:
   en Node 22 / ICU 76 lista `America/Buenos_Aires` y `Asia/Calcutta`, y NO
   `America/Argentina/Buenos_Aires` ni `Asia/Kolkata` (los canónicos de IANA). Hoy no
   afecta: las 7 opciones del selector (`types.ts:98-106`) están en la lista y en
   `pg_timezone_names`. Afectaría a un selector más amplio o a un valor tecleado, y
   depende del ICU del navegador (Chrome ≠ Firefox). `it.failing` en `f0RegTesterR3`.
   Arreglo barato: aceptar también `new Intl.DateTimeFormat('en-US', { timeZone: tz
   }).resolvedOptions().timeZone === tz` o mantener un mapa de alias IANA.

3. **[bajo] `fn_ai_usage_month` paga ~60 ms por llamada en `pg_timezone_names`** (la
   SRF materializa las 1 194 filas aunque haya `limit 1`; medido 60-63 ms para
   `America/Bogota`, `Pacific/Tongatapu` y `Marte/Fobos`). Antes de r3 la función no
   consultaba el catálogo. Lo paga `GET /credits` y **cada cobro con presupuesto
   configurado** (`assertWithinBudget`). Alternativa sub-milisegundo: resolver la zona en
   plpgsql con `begin perform now() at time zone p_tz; exception when
   invalid_parameter_value then … 'UTC'; end` (o `language sql` + función auxiliar
   `immutable`). No bloquea: 60 ms por cobro es tolerable, pero conviene anotarlo antes
   de aplicar la 39.

4. **[bajo] Divergencia Node/SQL en el cupo con un decimal en `custom_config`.** Un
   `ai_credits: 10000.0` es `"10000"` para Node (`String(10000)`) y `"10000.0"` para
   `jsonb ->>` (verificado por SELECT) → no cumple `^[0-9]{1,9}$` → SQL da el cupo del
   plan y Node el custom. Hoy **0** filas con decimales (9 con `custom_config` numérico,
   todas enteras). Desaparece al aplicar la 43 (solo manda SQL). Documentado en test.

5. **[bajo] `chargeAiCredits({ credits: 0.4 })` sale gratis.** `assertValidCredits`
   redondea a 0, el RPC recibe `p_cost: 0` (true, no-op) y se registra un log con
   `credits_consumed: 0`. Ningún llamador actual lo hace (`creditsForUsd` y los
   demás garantizan ≥ 1), pero el contrato «importe válido» debería exigir ≥ 1 cuando
   `credits` viene explícito, o documentar que 0 es «sin cobro». Test «DOCUMENTADO
   (bajo)» en `f0RegTesterR3`.

6. **[bajo] `useCalendarSettings.saveSettings` guarda `calendar_settings` antes de
   `organizations.timezone`** (`useCalendarSettings.ts:104-148`): si la BD rechaza la
   zona (trigger 44 con una zona que ICU acepta y Postgres no), la UI muestra error pero
   la configuración del calendario ya quedó con esa zona y `organizations.timezone` no.
   Solo alcanzable tras aplicar la 44 y con una zona del hueco 2. Escribir primero
   `organizations` (que valida) y luego el resto lo evita.

Observaciones (no fallos):
- La 44 acepta `EST`/`US/Eastern` (están en el catálogo) y Node los rechaza: la app es
  más estricta que la BD, en la dirección segura.
- Rollback 43 deja `fn_reset_monthly_ai_credits` con EXECUTE solo a `service_role`
  (hoy está abierta a public/anon/authenticated). Documentado en la cabecera del
  rollback; la 40 (`crm_v4_f00_40_cerrar_rpc_crm_anon`, también pendiente) la cierra
  igual. Correcto.
- `planQuotaFallback` limita a 5 suscripciones y PostgREST ordena NULL primero en
  `created_at desc`; SQL usa `nulls last` sin límite. Hoy: 0 orgs con más de 5
  suscripciones, 2 con más de una. Irrelevante en la práctica.
- La fila «vacía» provisionada conserva `model`/`max_tokens` de los defaults de columna
  (500 tokens) en vez de los del plan; coherente con «no reescribe el modelo elegido».

## Cobertura no probada / riesgos pendientes

- Concurrencia real (dos conexiones) sobre `decrement_ai_credits` /
  `fn_provision_ai_settings`: el MCP ofrece una conexión; se confía en `FOR UPDATE`, el
  `on conflict do nothing` y el `update … where credits_reset_at is null`.
- Flujo en navegador con sesión real y `POST /providers/test` contra proveedores reales.
- `npx next build` no ejecutado en esta ronda (presupuesto de tiempo; `tsc` limpio en REG
  y el builder reporta «Compiled successfully» con el fallo conocido de `.next`
  compartido). Pendiente para el QA r3 con el dev server parado.
- Sigue fuera («para el 10»): `refundCommCredits` no existe (grep: 0), los 11 llamadores
  V3 de `consumeAICredits` siguen en la allow-list, `offsetMinutesToISO(0)` sigue dando
  `-00:00` (`timezone.ts:118`), Vault para `provider_configs.credentials`.

## Calificación de robustez

**8,8/10.** Los cinco puntos del QA r2 están cerrados de verdad y resisten: la fila
«vacía» se provisiona por RPC o por respaldo sin duplicar el cupo, la zona horaria ya no
puede tumbar `GET /credits` ni el cobro con presupuesto (tres capas probadas en SQL, en
Node y en ruta), los rollbacks 39 y 43 restauran las cuatro funciones **byte a byte**
(md5 comprobado dentro de la misma transacción), el reembolso es simétrico con el cobro y
el rate limit ya no se consume con bodies inválidos. Las cuatro migraciones hacen lo que
dicen, con 93 verificaciones verdes y la BD intacta al final. 15/16 mutantes muertos (+1 equivalente), 5
de ellos solo por las suites nuevas, incluido el orden validación → rate limit que la
suite r2 no detectaba. Resta a la nota: un contrato roto real (org ajena en
`POST /providers/test` → 500 en vez de 403, medio), el coste de 60 ms que la 39 añade a
cada cobro con presupuesto, y la validación de zona que confunde canónicos de ICU con los
de IANA. Ninguno compromete tenants ni dinero.

## Comandos exactos y resultado

```
# Línea base (suites del builder + r1 + r2 + guardarraíl), ambas zonas
TZ=UTC            npx jest src/lib/services/__tests__/f0RegTester src/lib/services/__tests__/aiCostService \
  src/lib/services/__tests__/pricingService src/lib/services/crm/__tests__/aiUsageStats \
  src/app/api/crm/config/__tests__ src/__tests__/guardrails.test.ts --silent   → 7 suites, 189/189
TZ=America/Bogota (mismo comando)                                              → 7 suites, 189/189

# Suites nuevas
TZ=America/Bogota npx jest src/__tests__/services/f0RegTesterR3               → 2 suites, 36/36
TZ=UTC            npx jest src/__tests__/services/f0RegTesterR3               → 2 suites, 36/36
TZ=UTC            npx jest src/__tests__/guardrails.test.ts --silent          → 79/79 (con las suites nuevas en el árbol)

# Encargo (c). Nota: `src/lib/services/crm/__tests__/aiCost*` no existe (los tests de aiCost
# viven en `src/lib/services/__tests__/aiCostService.test.ts`); se añadió esa ruta.
TZ=UTC            npx jest src/__tests__/services/f0Reg* src/lib/services/crm/__tests__/aiCost*   src/__tests__/guardrails.test.ts --silent                                   → 3 suites, 115/115
TZ=America/Bogota npx jest src/__tests__/services/f0Reg src/lib/services/crm/__tests__/aiCost   src/lib/services/__tests__/aiCostService src/__tests__/guardrails.test.ts --silent → 4 suites, 137/137

# (d) tsc (ejecutado dos veces: antes y después de crear las suites nuevas)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1   | grep -E "aiCostService|src/lib/ai/|ai-settings|aiSettings|f0Reg"          → 0 líneas
  (2.ª pasada: 11 errores totales, todos ajenos: .next/types/** ×6 generados por otra sesión,
   FormularioEdicionProducto.tsx ×2, security/__tests__/testerR2CD.f0sec.test.ts ×1,
   deliveryIntegrationService.ts ×1; 1.ª pasada: 13, también ajenos)

npx eslint src/__tests__/services/f0RegTesterR3.test.ts src/__tests__/services/f0RegTesterR3.routes.test.ts → 0 errores, 0 avisos

# BD (MCP execute_sql), estado antes y después de cada dry-run
select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) … proname in ('decrement_ai_credits','refund_ai_credits',
  'sync_ai_credits_on_subscription','fn_reset_monthly_ai_credits','fn_ai_usage_month','fn_comm_usage_month','fn_ai_plan_quota',
  'fn_provision_ai_settings','fn_validate_org_timezone')
  → 4 filas (a68f2598…, f0c1222c…, 1ead735d…, 1639c30c…), 0 funciones nuevas
select count(*) from ai_usage_logs where action_type like 'tester_r3%'          → 0
select credits_remaining from ai_settings where organization_id = 120           → 3995
select timezone from organizations where id = 120                               → America/Bogota
```

Temporales: los `.sql` de trabajo, copias de seguridad y el script de mutación viven en
el scratchpad de la sesión (fuera del árbol). En el árbol solo quedan las dos suites
nuevas y este informe.
