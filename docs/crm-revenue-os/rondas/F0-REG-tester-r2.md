# F0-REG — Tester — Ronda 2 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r2.md`,
`F0-REG-qa-r1.md` (6/10), `F0-REG-tester-r1.md` (suite `f0RegTester.r1.test.ts`).
Migraciones PENDIENTES probadas en seco: `crm_v4_f00_38_ai_settings_solo_rpc` y
`crm_v4_f00_39_decrement_ai_credits_guardas` (+ rollbacks). BD: proyecto
`jgmgphmzusbluqhuqihj`, MCP, **nada aplicado**; el estado previo quedó verificado
al final (políticas `{public}` = 3, grants de `anon`/`authenticated` = ALL,
`decrement_ai_credits` y `refund_ai_credits(int,int)` con el mismo md5 de
`pg_get_functiondef` que antes, 0 funciones `fn_*_usage_month`, saldo de la org de
prueba intacto, 0 filas `tester_r2%` en `ai_usage_logs`).

Suites nuevas dejadas en el repo:
- `src/lib/services/__tests__/f0RegTester.r2.test.ts` (32 casos; 1 `it.failing`
  que documenta un hueco, ver fallo 1).
- `src/app/api/crm/config/__tests__/f0RegTester.r2.routes.test.ts` (12 casos:
  `GET /credits` y `POST /providers/test` con `next/server` real y mocks de
  contexto, service client, rate limit y SDK de Twilio).

## Resumen de pruebas

- Casos ejecutados: 411 (337 automatizados en 12 suites, cada una con `TZ=UTC` y
  `TZ=America/Bogota`; 62 verificaciones del dry-run en BD; 12 verificaciones
  manuales de código/BD)
- Pasaron: 407
- Fallaron: 4 verificaciones → 8 hallazgos (0 críticos, 0 altos, 2 medios, 6 bajos)
  + 1 decisión pendiente del dueño

Comandos:

```
TZ=UTC / TZ=America/Bogota npx jest \
  src/lib/services/__tests__/{f0RegTester.r1,aiCostService,pricingService,providerConfigContract.tester,providerRegistry}.test.ts \
  src/lib/services/crm/__tests__/{aiUsageStats,f10ProviderReadiness}.test.ts       → 144/144 (ambas TZ)
TZ=UTC / TZ=America/Bogota npx jest src/__tests__/guardrails.test.ts \
  src/__tests__/services/goAssistantF0.test.ts src/__tests__/services/goAssistantF1.test.ts → 149/149 (ambas TZ)
TZ=UTC / TZ=America/Bogota npx jest src/lib/services/__tests__/f0RegTester.r2.test.ts \
  src/app/api/crm/config/__tests__/f0RegTester.r2.routes.test.ts                     → 44/44 (ambas TZ)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
  | grep -E "provider|aiCost|aiUsage|pricing|credits|ai-assistant|aiCredits|rbac|f0RegTester" → 0 líneas de REG
  (197 errores totales: TODOS en rutas que otro agente está migrando en paralelo a
  `readOrgBody` — `pm-assist`, `generate-image`, `seo-keywords`, `crm/voice-agents`,
  `crm/stage-agents`, … — cuerpo tipado `{}`; ajenos a REG. El builder reportó 4.)
npx eslint <12 archivos del informe + r1 + aiUsageStats + 2 suites nuevas>
  → 2 errores, ambos PREEXISTENTES en `src/__tests__/guardrails.test.ts:608,616`
    (`require()` del caso 13, GO Assistant; están en HEAD). Los 11 archivos de REG: 0.
```

### Lo que SÍ está bien (evidencia)

- **Cobro antes del proveedor, reembolso después, nunca cobrar una generación
  fallida.** `withAiCharge` y ahora también `withAICreditsCheck` (deprecated) ejecutan
  `decrement_ai_credits` ANTES de `fn()`; con `false` lanzan `InsufficientCreditsError`
  (402) y `fn` no se ejecuta; si `fn` lanza, `refund_ai_credits` recibe
  `{p_org_id, p_amount, p_previous}` y el error original se propaga intacto (probado por
  comportamiento en r2, no solo por texto como el guardarraíl 19).
- **Importes inválidos mueren antes del RPC**: NaN, ±Infinity, negativos (incluido -1
  y -0.4) → `RangeError` en `chargeAiCredits`, `chargeCommCredits`, `consumeAICredits`
  y `withAICreditsCheck`; 0 RPC en todos los casos.
- **Org sin fila → 402, nunca 500**, con el RPC actual (excepción «ai_settings no
  encontrada») y con el de la 39 (`false` + `maybeSingle`): auto-provisión con el cupo
  del plan y un único reintento; plan sin cupo → 402.
- **Presupuesto (§8)**: `spent + estimado > presupuesto` → `BudgetExceededError`
  (402, `code: 'budget_exceeded'`, `instanceof InsufficientCreditsError`); el borde
  exacto (== presupuesto) pasa; sin `unitSku` el estimado es 0; `monthly_budget_usd`
  basura (`'mucho'`, 0, negativo, `null`) se ignora y se toma el primer válido por
  prioridad; si `provider_configs` falla, no se bloquea el cobro ni se consulta el consumo.
- **Reembolso idempotente**: memoria (`org:logId`) + fila `:refund` en BD; si la
  consulta de dedupe falla se reembolsa igual; `p_previous` solo viaja cuando es número
  finito; la fila `:refund` lleva `cost_amount: 0` y `refunded_log_id`.
- **`GET /credits`** (ruta real): a las 22:00 del 30/09 en Bogotá (= 01/10 03:00Z) el
  periodo es septiembre (`since = 2026-09-01T00:00:00.000-05:00`, `p_tz` correcto);
  para una org en UTC ya es octubre; `truncated` viaja en `ai` y `comm`; org sin fila
  `ai_settings` → 200 con `credits_remaining: null`; RPC ausente (PGRST202) → respaldo
  en Node con el día en la zona de la org; otro error de la RPC → 500 controlado sin
  filtrar el mensaje.
- **`POST /providers/test`** con `source: 'env'`: `detail` = «Conexión de la plataforma
  operativa» / «La plataforma no pudo conectar»; ni el `friendlyName`, ni el `status`,
  ni el token, ni el mensaje del SDK aparecen en la respuesta (éxito y fallo). Con
  `source: 'org'` el admin ve su detalle con secretos enmascarados. Rol llamado «Admin
  de organización» con id 4 → 403; rate limit → 429.
- **`isOrgAdmin`** por `roleId ∈ {1,2}` o `isSuperAdmin`; el nombre no cuenta
  (`roleName: 'Super Admin'` con id 7 → false; `roleId: 2` con `'Vendedor'` → true).
  Ids verificados en `roles` por el builder; `requireRole` (por nombre) sigue existiendo
  en `rbac.ts` pero ninguna ruta de REG la usa.
- **`validateProviderSettings`**: > 4096 bytes, tipo, rango, `select` fuera de opciones
  y clave desconocida → 422; `null` borra; `'12'` numérico se acepta como 12.
- **Escritores de `ai_settings` desde el navegador compatibles con la 38**:
  `aiSettingsService.createSettings/updateSettings/toggleAI` y la página
  `/app/chat/ia/configuracion` solo escriben `organization_id` + columnas de
  comportamiento (todas dentro del `grant insert/update (…)`); ningún componente cliente
  escribe `credits_*` ni `id`/`created_at`. La Edge Function `ai-auto-response` solo lee.

## Dry-run de las migraciones (MCP, un solo bloque `DO` que termina en `RAISE EXCEPTION` → rollback atómico)

Miembro impersonado: usuario real de la org 120 con `role_id = 4` (no admin, no super
admin, 1 sola org), `set local role authenticated` + `request.jwt.claims`. Otra org con
fila: 139. Plan de la org 120: `ai_credits_max_rollover = 2000`, `purchased_credits = 0`.

| # | Migración | Prueba | Esperado | Obtenido | OK |
|---|---|---|---|---|---|
| 1 | 38 | `has_column_privilege(authenticated, credits_remaining, UPDATE)` | false | false | ✅ |
| 2 | 38 | `… purchased_credits UPDATE` / `credits_remaining INSERT` | false / false | false / false | ✅ |
| 3 | 38 | `… model UPDATE` / tabla SELECT authenticated | true / true | true / true | ✅ |
| 4 | 38 | `has_table_privilege(anon, SELECT)` / authenticated DELETE | false / false | false / false | ✅ |
| 5 | 38 | políticas tras aplicar | 3: select/insert/update a `{authenticated}`, ninguna ALL | exactamente eso | ✅ |
| 6 | 38 | authenticated (rol 4): `UPDATE ai_settings SET credits_remaining = 999999 WHERE org = 120` | error de privilegio | `42501 permission denied for table ai_settings` | ✅ |
| 7 | 38 | authenticated: `UPDATE … SET temperature = temperature WHERE org = 120` | 1 fila | 1 fila | ✅ |
| 8 | 38 | authenticated: mismo UPDATE sobre org 139 | 0 filas | 0 filas | ✅ |
| 9 | 38 | authenticated: `SELECT count(*) FROM ai_settings` | 1 (solo su org) | 1 | ✅ |
| 10 | 38 | authenticated: `INSERT (organization_id, temperature) VALUES (139, …)` | RLS | `42501 new row violates row-level security policy` | ✅ |
| 11 | 38 | authenticated: `INSERT (organization_id, credits_remaining) VALUES (120, 5)` | privilegio de columna | `42501 permission denied for table ai_settings` | ✅ |
| 12 | 38 | authenticated: `DELETE … WHERE org = 120` | privilegio | `42501 permission denied` | ✅ |
| 13 | 38 | authenticated: `UPDATE … SET organization_id = 139 WHERE org = 120` (mover fila) | privilegio (columna no concedida) | `42501 permission denied` | ✅ |
| 14 | 38 | anon: `SELECT count(*) FROM ai_settings` | privilegio | `42501 permission denied` | ✅ |
| 15 | 38 | service_role: `UPDATE … SET credits_remaining = credits_remaining WHERE org = 120` | 1 fila | 1 fila | ✅ |
| 16 | 38-RB | rollback → `pg_policies` (nombre, cmd, roles, qual, with_check) idéntico al previo | true | true | ✅ |
| 17 | 38-RB | rollback → grants de tabla idénticos; `credits_remaining UPDATE` authenticated | true / true | true / true | ✅ |
| 18 | 39 | `decrement_ai_credits(120, NULL)` y saldo después | false, saldo 3995 (no NULL) | false, 3995 | ✅ |
| 19 | 39 | `decrement(120, -1)` / `decrement(-1, 1)` / `decrement(NULL, 1)` | false / false (sin excepción) / false | false / false / false | ✅ |
| 20 | 39 | `decrement(120, 0)` | true (no-op) | true | ✅ (documentado) |
| 21 | 39 | `decrement(120, 3996)` con saldo 3995 / `decrement(120, 3995)` | false / true → saldo 0 | false / true, 0 | ✅ |
| 22 | 39 | saldo NULL forzado: `decrement(120, 1)` / `decrement(120, 0)` | false / true → saldo 0 (no NULL) | false / true, 0 | ✅ |
| 23 | 39 | saldo 2003 (techo 2000): `decrement(120, 10)` → `refund(120, 10, 2003)` | 1993 → 2003 (antes 2000) | 1993 → 2003 | ✅ |
| 24 | 39 | desde 1993: `refund(120, 10)` sin `p_previous` | 2000 (comportamiento anterior) | 2000 | ✅ |
| 25 | 39 | desde 1993: `refund(120, 10, 999999)` (p_previous abusivo) | 2003 (solo suma `p_amount`) | 2003 | ✅ |
| 26 | 39 | desde 1993: `refund(120, 500, 2003)` | 2003 (techo efectivo = previo) | 2003 | ✅ |
| 27 | 39 | `refund(120, NULL)` / `refund(120, -5)` / `refund(-1, 5)` | true no-op / true no-op / false | true / true (saldo intacto) / false | ✅ (ver bajo 4) |
| 28 | 39 | sobrecargas de `refund_ai_credits` tras DROP+CREATE | 1 (3 params) | 1 | ✅ |
| 29 | 39 | `fn_ai_usage_month(120, inicio de mes Bogotá, 'America/Bogota')` vs suma manual con `coalesce` | mismas filas y USD; claves `spent_usd/spent_credits/rows/by_model/by_day` | 5 = 5 filas, 0 = 0 USD, claves OK | ✅ |
| 30 | 39 | 4 filas insertadas a las 04:30–04:33Z del 01/10 (= 23:30 del 30/09 Bogotá): cobro 7 (0.5 USD columna), reembolso -7, `metadata.cost_amount: 1.25` sin columna, `metadata.cost_amount: "9.99"` (texto) | Bogotá: `by_day = [2026-09-30]`, credits 6, usd 1.75, `calls` no cuenta el reembolso, texto ignorado; UTC: `by_day = [2026-10-01]` | exactamente eso | ✅ |
| 31 | 39 | `p_tz = ''` / `NULL` | día en UTC | `2026-10-01` | ✅ |
| 32 | 39 | `p_tz = 'Marte/Fobos'` | error | `22023 time zone "Marte/Fobos" not recognized` | ✅ (ver medio 2) |
| 33 | 39 | `fn_ai_usage_month(-1, …)` / `fn_comm_usage_month(120, …)` | jsonb vacío con claves / claves `spent_usd/rows/by_channel` | OK / OK | ✅ |
| 34 | 39 | EXECUTE: authenticated y anon en las 4 funciones / service_role | false / true | false / true | ✅ |
| 35 | 39 | authenticated (rol 4) llama `fn_ai_usage_month` | error | `42501 permission denied for function fn_ai_usage_month` | ✅ |
| 36 | 39 | service_role llama `fn_ai_usage_month` y `decrement(120, 1)` | OK / true | OK / true | ✅ |
| 37 | 39-RB | rollback → `fn_*_usage_month` eliminadas, `refund_ai_credits(int,int)` de vuelta, ACL idéntica | 0 / 2 params / true | 0 / 2 / true | ✅ |
| 38 | 39-RB | rollback → `decrement(-1, 1)` vuelve a lanzar la excepción original | `P0001 ai_settings no encontrada…` | igual | ✅ |
| 39 | 39-RB | rollback → `pg_get_functiondef` byte a byte igual al previo | true | **false**: la BD guarda `DECLARE/BEGIN/SELECT…` en MAYÚSCULAS y el rollback las escribe en minúsculas; semánticamente idéntico | ⚠️ bajo 3 |

Nota operativa: ambos `.sql` llevan `begin;`/`commit;` propios. Con `apply_migration`
funcionan; para probarlos dentro de una transacción externa hay que quitar esas dos
líneas (si no, el `commit` interno confirma). Lo hice así.

## Mutation testing (aiCostService / pricingService)

16 mutantes, restauración byte a byte verificada por md5 tras cada uno
(`aiCostService.ts b0cc2052…`, `pricingService.ts 80a79907…`, iguales al final).
Suites juez: `aiCostService`, `f0RegTester.r1`, `f0RegTester.r2`, `pricingService`,
`f0RegTester.r2.routes`.

| Mutante | Estado | Quién lo mata |
|---|---|---|
| M1 `value < 0` → `value < -1` | SOBREVIVÍA → **muerto** con test nuevo r2 (-1, -0.4) | r2 «M1» |
| M2 sin `Number.isFinite` | muerto | r1 NaN, r2 withAICreditsCheck NaN, r2 comm NaN |
| M3 `missingRow: !row` → `false` | muerto | aiCostService «auto-provisiona» |
| M4 presupuesto `>` → `>=` | muerto | r2 borde exacto |
| M5 `v > 0` → `v >= 0` | muerto | r2 basura en presupuesto |
| M6 rastro de reembolso fallido invertido | muerto | aiCostService «deja rastro» |
| M7 sin dedupe en memoria | muerto | r1 idempotencia |
| M8 `p_previous` NaN viaja | muerto | r2 p_previous finito |
| M9 presupuesto ignora el estimado | muerto | r2 «un centavo por encima», aiCostService |
| M10 `previousBalance` con signo invertido | muerto | r2, aiCostService ×2 |
| M11 comm `Math.max(1,…)` → `Math.max(0,…)` | muerto | r2 comm amount 0 |
| M12 `cost_amount: null` en el log | muerto | r1 columna cost_amount |
| M13 excepción del RPC viejo no reconocida | muerto | r1 «org sin fila → 402» |
| M14 pricing cachea errores | muerto | r1 error transitorio |
| M15 `getUnitCost` sin filtro `valid_to` | SOBREVIVÍA (el test r1 se conformaba con ver `valid_to` en el `select`) → **muerto** con test nuevo r2 que exige `or(valid_to.is.null,valid_to.gte.<hoy>)` | r2 «M15» |
| M16 `round6` a 4 decimales | muerto | pricingService helpers |

Resultado: **16/16 muertos** tras añadir los 2 tests; 14/16 con las suites que dejó el
builder.

## Fallos encontrados

1. **[medio] Una fila `ai_settings` creada desde el navegador nace con 0 créditos y
   `chargeAiCredits` nunca le provisiona el cupo del plan.** Pasos: org sin fila (hay 27
   con CRM activo) → un miembro entra en `/app/chat/ia/configuracion` y guarda →
   `AISettingsService.createSettings` inserta `organization_id` + comportamiento;
   `credits_remaining` toma el default 0 y `credits_reset_at` queda NULL → cualquier
   acción IA del CRM: `ensureAiSettings` ve la fila «existente» con 0 → 402
   «insuficientes» sin intentar el cupo del plan. Solo `checkAICredits` (legacy, reset
   mensual por `credits_reset_at` NULL → 1970) la repararía si alguien pasa por el
   asistente/chat. Esperado: `ensureAiSettings` trate `credits_reset_at IS NULL` como
   «sin provisionar» (o la 38 deje `credits_reset_at` fuera del grant de INSERT y lo
   rellene un trigger/RPC). Hoy 0 filas en ese estado (verificado), riesgo latente.
   Test `it.failing` en r2 («fila existente con saldo 0 y credits_reset_at NULL»). El
   builder ya listó «`chargeAiCredits` no ejecuta el reset mensual» como pendiente; esto
   es su consecuencia concreta.

2. **[medio] Zona horaria inválida en `organizations.timezone` → 500 en `GET /credits`
   y en todo cobro con presupuesto configurado (tras aplicar la 39).**
   `fn_ai_usage_month` falla con `22023` (fila 32 del dry-run); `getAiUsageMonth` no lo
   trata como «RPC ausente» y lanza. Mitigación actual: `getOrgTimezoneServer` valida con
   `Intl.DateTimeFormat` y cae a `America/Bogota`, pero el catálogo de Intl (ICU) y el de
   Postgres (`pg_timezone_names`) no son idénticos. Esperado: `coalesce` defensivo en la
   RPC (`case when p_tz in (select name from pg_timezone_names) …`) o capturar `22023`
   en Node y reintentar con UTC. Probado en ruta (r2 routes: «error de la RPC que no sea
   no existe → 500 controlado»): al menos no filtra el mensaje.

3. **[bajo] El rollback de la 39 no restaura `decrement_ai_credits` ni
   `refund_ai_credits` byte a byte** (fila 39): la cabecera dice «tomada con
   `pg_get_functiondef`», pero el cuerpo está en minúsculas y la BD lo tiene en
   mayúsculas. Idéntico en semántica y ACL; distinto md5. Cosmético, pero un
   `pg_get_functiondef` comparado por hash tras un rollback daría falso negativo.

4. **[bajo] `refund_ai_credits` con `p_amount` negativo o NULL devuelve `true` sin hacer
   nada** (fila 27) y `refundAiCredits` en Node hace lo mismo (negativo → 0 → `true`).
   Coherente pero silencioso: un llamador que pase un negativo por error cree que
   reembolsó. Esperado: `false` (o `RangeError` en Node, como en el cobro).

5. **[bajo] `POST /providers/test` consume cupo del rate limit antes de validar el body**
   (r2 routes lo documenta): 5 bodies inválidos bloquean al admin un minuto. Reordenar
   validación → rate limit.

6. **[bajo] `offsetMinutesToISO(0)` devuelve `-00:00`** (`src/lib/utils/timezone.ts:77`,
   preexistente): `monthStartInTz('UTC')` produce `2026-10-01T00:00:00.000-00:00`.
   Postgres y `Date` lo aceptan como UTC (verificado), pero RFC 3339 reserva `-00:00`
   para «offset desconocido». Fuera de REG; el test r2 lo tolera y lo anota.

7. **[bajo] El informe del builder dice «eslint sobre los 12 archivos: 0 problemas» y
   «tsc 4 errores»**; hoy `guardrails.test.ts` tiene 2 errores preexistentes (`require`
   en el caso 13, GO Assistant, presentes en HEAD) y `tsc` da 197, todos por la migración
   concurrente a `readOrgBody` de otro agente. Nada de esto es de REG, pero la
   verificación del informe no lo separa.

8. **[bajo] `metadata.cost_amount` en texto se descarta** en la RPC
   (`jsonb_typeof = 'number'`) y en el respaldo Node (`typeof === 'number'`),
   coherentemente. En BD no hay ningún valor así (8 `null`, 2 `number` en
   `ai_usage_logs`; 3 `number` en `comm_usage_logs`), así que es solo un contrato a
   dejar escrito en la cabecera de `fn_ai_usage_month`.

**Decisión pendiente del dueño (no es un fallo):** con la 38, cualquier miembro activo
(rol 4 «vendedor» en el dry-run, fila 7) sigue pudiendo cambiar `model`, `temperature`,
`system_rules`, `is_active` del chat IA de su organización. El builder lo deja abierto;
el dry-run confirma que hoy es así y que basta cambiar la política de escritura al
aplicar si se quiere solo admins (`om.is_super_admin` o `role_id in (1,2)`).

## Cobertura no probada / riesgos pendientes

- Concurrencia real de `decrement_ai_credits`/`refund_ai_credits` (dos transacciones
  con `FOR UPDATE`): el MCP ofrece una sola conexión; se confía en la definición.
- `next build` no ejecutado (presupuesto de tiempo; `tsc` limpio en REG).
- No se ejecutó el flujo en navegador con sesión real ni `POST /providers/test` contra
  proveedores reales (SDK de Twilio doblado con `jest.mock`).
- Los 11 llamadores V3 de `consumeAICredits` siguen cobrando después del proveedor
  (allow-list del guardarraíl 19; fuera de esta ronda).
- Stripe webhook (`src/app/api/stripe/webhook/route.ts:209,355`) cae a la clave `anon`
  si falta `SUPABASE_SERVICE_ROLE_KEY`: tras la 38 ese camino no podría escribir
  `ai_settings`; ya hoy tampoco funciona (anon + `auth.uid()` NULL), no es regresión.
- `channel_credentials` en navegador: registrado en §11, sigue abierto (SEC/F16).
- `src/lib/security/__tests__/zz_tester_r2_probe.test.ts` (sin trackear) no es mío:
  pertenece al agente que está migrando rutas a `readOrgBody`.

## Calificación de robustez

**8,5/10** — Los 7 puntos del QA r1 que tocaban REG están cerrados y resisten a las
pruebas: el cobro es único, va antes del proveedor, rechaza importes inválidos, no da
500 por falta de fila, bloquea por presupuesto, reembolsa una sola vez y agrega el
consumo en la zona horaria de la organización (probado en el borde 30/09 22:00 Bogotá,
en ruta real y en SQL). Las dos migraciones hacen exactamente lo que dicen, sus
rollbacks restauran políticas y grants byte a byte (38) y las funciones en semántica
(39), y ningún escritor legítimo desde el navegador queda fuera de los grants por
columna. 16/16 mutantes muertos (14 con las suites del builder). Lo que resta a la nota:
un hueco latente real (fila creada desde el navegador con 0 créditos que el nuevo
cobro nunca provisiona), la fragilidad ante una zona horaria que Postgres no reconozca
una vez aplicada la 39, y los pendientes ya conocidos (concurrencia real, `next build`,
llamadores V3).
