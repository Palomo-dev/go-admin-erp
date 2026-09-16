# F0-REG — Builder — Ronda 2 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Lista de tareas: veredicto del QA r1
(`F0-REG-qa-r1.md`, 6/10, puntos 1–7 + instrucciones 1–12) apoyado en el informe del
tester (`F0-REG-tester-r1.md`, suite `f0RegTester.r1.test.ts`).

Reglas de la ronda respetadas: MCP de Supabase SOLO lectura (grants, políticas y
`pg_get_functiondef` verificados antes de escribir SQL); ninguna migración aplicada;
ningún SQL sobre `ai_usage_logs`/`comm_usage_logs` salvo dos funciones de LECTURA
(`fn_*_usage_month`, ver decisiones); sin commits; sin nombres de organizaciones
cliente.

## Migraciones PENDIENTES DE APLICAR (el orquestador las muestra al dueño)

| Migración | Rollback | Qué hace |
|---|---|---|
| `supabase/migrations/20260915220000_crm_v4_f00_38_ai_settings_solo_rpc.sql` | `supabase/rollbacks/20260915220000_crm_v4_f00_38_ai_settings_solo_rpc_rollback.sql` | `revoke all` a `anon`; a `authenticated` solo SELECT de tabla + INSERT/UPDATE por columna (comportamiento, nunca `credits_*`); sustituye las **tres** políticas `{public}` (dos `FOR ALL` + una `SELECT`, no una como decía el QA) por `ai_settings_select/insert/update` a `authenticated` por pertenencia activa. Decisión abierta para el dueño: si la configuración del chat IA debe ser solo de admins, se cambia la política de escritura al aplicar |
| `supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql` | `supabase/rollbacks/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas_rollback.sql` | `decrement_ai_credits`: NULL/negativo → false, sin fila → false (no excepción), saldo NULL = 0. `refund_ai_credits(p_org_id, p_amount, p_previous default null)` (DROP + CREATE: cambiar parámetros con `CREATE OR REPLACE` crearía una sobrecarga ambigua). `fn_ai_usage_month(p_org, p_since, p_tz)` y `fn_comm_usage_month(p_org, p_since)`: agregados en SQL, `coalesce(cost_amount, metadata->>'cost_amount')`, día en `p_tz`. Todas SECDEF, `search_path=public`, EXECUTE solo `service_role` |

Cada archivo lleva al pie las consultas de verificación (SELECT) para después de aplicar.
El código funciona **antes** de aplicarlas (respaldo en Node para los agregados; detección
del mensaje `ai_settings no encontrada` del RPC antiguo) y **después** (RPC).

## Qué se hizo en esta ronda

- `src/lib/services/crm/aiCostService.ts` (reescrito): `assertValidCredits` (RangeError
  antes del RPC); `callDecrement` distingue «sin saldo» de «sin fila» (una `maybeSingle`);
  auto-provisión con `ensureAiSettings` + un reintento; `cost_amount` en **columna**
  (y en `metadata` una ronda más); `credits_before/after` en el log; `previousBalance`
  en `ChargeAiResult`; `refundAiCredits` idempotente por `logId` (Set acotado en memoria
  + fila `:refund` en BD) y con `p_previous` solo cuando se conoce; `BudgetExceededError`
  (402, `code: 'budget_exceeded'`); `getMonthlyBudgetUsd` exportada; `chargeCommCredits`
  con guarda de importe y columna `cost_amount`. Cabecera actualizada (ya no dice que
  persiste en `metadata`).
- `src/lib/services/aiCreditsService.ts`: `ensureAiSettings(orgId, client?)` extraída de
  `checkAICredits` (que ahora la usa); `consumeAICredits` `@deprecated` + RangeError;
  `withAICreditsCheck` `@deprecated` delegando en `withAiCharge` (misma firma + `options`
  opcional). `any` preexistente eliminado del archivo.
- `src/lib/services/crm/aiUsageStatsService.ts` (nuevo): `monthStartInTz`, `rowCostUsd`,
  `isMissingFunctionError`, `getAiUsageMonth`, `getCommUsageMonth`.
- `src/app/api/crm/config/credits/route.ts`: zona horaria con `getOrgTimezoneServer`,
  inicio de mes en la zona de la org, agregados vía servicio, `truncated` en la respuesta,
  presupuesto desde `getMonthlyBudgetUsd` (mismo valor que el bloqueo).
- `src/lib/services/crm/pricingService.ts`: `valid_to` en `getUnitCost`/`listPricing`,
  `todayInTz('UTC')`, errores transitorios sin cachear, comentarios corregidos,
  `PricingRow.valid_to`.
- `src/lib/services/providerCredentials.server.ts`: dos pasadas (org > env);
  `validateProviderSettings` (+ `MAX_SETTINGS_BYTES`); `listProviderConfigsSafe(orgId,
  category, { seed })`.
- `src/app/api/crm/config/providers/route.ts`: seed solo si `isOrgAdmin`.
- `src/app/api/crm/config/providers/test/route.ts`: `source: 'env'` sin detalle de cuenta;
  `checkRateLimit`.
- `src/lib/utils/rbac.ts`: `isOrgAdmin` por `roleId ∈ {1, 2}` o `isSuperAdmin`; ids
  verificados en `roles` por MCP (1 = Super Admin, 2 = Admin de organización).
- `src/lib/crm/providerCatalog.ts`: relleno corto (`0000`, `xxxx`) = placeholder.
- `src/components/configuracion/crm/ProviderCard.tsx`: envía solo las claves de
  `SETTING_FIELDS` (los defaults derivados como `model` de `llm:openai` no viajan).
- `src/__tests__/guardrails.test.ts`: caso 19 (allow-list cerrada de los 11 llamadores
  V3 de `consumeAICredits`; `withAICreditsCheck` delega en `withAiCharge`).
- Tests: `f0RegTester.r1.test.ts` (9 `it.failing` → `it`; 2 «documenta el
  comportamiento actual» invertidos; `or` en el fake), `providerConfigContract.tester.test.ts`
  (`test.failing` de settings → `test`; `or` en el fake), `aiCostService.test.ts`
  (+6 casos; `or` en el fake; el test «propaga error del RPC» pasa a usar un error
  genérico porque «no encontrada» ahora es 402), `crm/__tests__/aiUsageStats.test.ts` (nuevo, 8).
- Docs: `FASE-00-FUNDACIONES.md` §11 (dos filas: `channel_credentials` → SEC, rate-limit
  por instancia) y §13.3 (anexo «Ronda 2»).

## Feedback de la ronda anterior que se atendió

1. **[crítico] Saldo editable desde el navegador** → migración 38 (sin aplicar). En BD
   había tres políticas, no una; el rollback las recrea con el texto exacto de `pg_policies`.
   **Resuelto (pendiente de aplicar).**
2. **[crítico] `ai_usage_logs` abierta + `GET /credits` suma `metadata`** → la migración
   la escribe F0-DB r3; REG deja de depender de `metadata`: escribe la columna y agrega
   con `coalesce`. **Resuelto en la parte de REG.**
3. **[alto] NaN → org ilimitada** → `RangeError` en `chargeAiCredits`, `chargeCommCredits`
   y `consumeAICredits` + guardas en la RPC (mig. 39). Los importes negativos también se
   rechazan (antes se recortaban a 0). **Resuelto.**
4. **[alto] 27 orgs sin fila → 500** → `ensureAiSettings` + reintento; sin cupo → 402.
   Funciona con el RPC actual (detecta el mensaje de la excepción) y con el de la 39
   (`false` + `maybeSingle`). **Resuelto.**
5. **[alto] `cost_amount` en columna** → escrita en `chargeAiCredits`, `refundAiCredits`,
   `recordFailedRefund`, `chargeCommCredits`; leída con `coalesce` en RPC y respaldo.
   **Resuelto.**
6. **[alto] `withAICreditsCheck` segundo punto de cobro** → delega en `withAiCharge`;
   `@deprecated`; guardarraíl 19. Los 11 llamadores de `consumeAICredits` quedan en la
   allow-list (no se tocan en esta ronda, como pedía el QA). **Resuelto.**
7. **[alto] `channel_credentials` en navegador** → registrado en §11 con decisión
   explícita (riesgo aceptado temporalmente con RLS `is_super_admin`; tarea para SEC).
   **Registrado, no implementado (según instrucción).**
8. Prioridad org > env → dos pasadas. **Resuelto.**
9. Validar `settings` → `validateProviderSettings` (422, ≤ 4 KB, `null` borra). **Resuelto.**
10. Reembolso idempotente y sin pérdida → dedupe por `logId` + `p_previous`. **Resuelto
    (la parte SQL pendiente de aplicar).**
11. `GET /credits` agregando en SQL → `fn_*_usage_month` + respaldo. **Resuelto (RPC
    pendiente de aplicar; hasta entonces respaldo con `truncated`).**
12. Fechas → `todayInTz('UTC')`, `monthStartInTz(tz)`, `toPlainDate(created_at, tz)`,
    `(created_at at time zone p_tz)::date`. **Resuelto.**
13. Presupuesto que bloquee → `BudgetExceededError`. **Resuelto** (mapeo a
    `JobFatalError` por herencia de `InsufficientCreditsError`, ver decisiones).
14. `providers/test` con `source: 'env'` → sin detalle; `checkRateLimit`. **Resuelto**
    (por instancia; documentado en §11).
15. `isOrgAdmin` sin nombre de rol. **Resuelto** en `rbac.ts`.
16. `pricingService` con `valid_to`. **Resuelto.**
17. `GET /providers` siembra solo admin. **Resuelto.**
18. Bordes: placeholder corto, cache de errores, `by_model.calls`. **Resueltos.**

## Decisiones de diseño relevantes

- **`fn_ai_usage_month` / `fn_comm_usage_month` viven en la migración 39** (mía) aunque
  leen `ai_usage_logs`: son funciones de LECTURA con `EXECUTE` solo para `service_role`;
  no tocan grants ni políticas de esas tablas (eso es de F0-DB r3, mig. 36). Si el
  orquestador prefiere separarlas en una migración propia, es cortar y pegar.
- **`BudgetExceededError extends InsufficientCreditsError`**: los handlers de jobs
  (`transcribe`, `analyze`) y las rutas ya mapean esa clase a `JobFatalError`/402. Así el
  bloqueo llega a todos los consumidores sin tocar `runner.ts` ni handlers (JOBS/F4). El
  mensaje contiene `budget_exceeded` y `code = 'budget_exceeded'`.
- **Respaldo en Node en `aiUsageStatsService`**: transitorio hasta aplicar la 39 (la
  ruta y el presupuesto deben funcionar hoy contra la BD real). Tope 10 000 filas con
  `truncated: true` visible; eliminar el respaldo cuando la 39 esté en producción.
- **`previousBalance` se lee tras el RPC** (`credits_after + credits`): no es atómico con
  el débito; un desfase por concurrencia solo afecta al techo del reembolso, nunca al saldo.
  Solo se envía `p_previous` cuando se conoce (los tests fijan los args exactos sin él).
- **Dedupe de reembolsos en memoria + BD**: la BD cubre reintentos entre instancias; la
  memoria cubre el caso real (reintento del mismo job en la misma lambda) y evita una
  consulta. Si la consulta de dedupe falla, se reembolsa: la deuda con la org pesa más
  que un posible doble abono, que además queda trazado.
- **Importes negativos → RangeError** (no recorte a 0): un negativo por `credits` sería
  un abono disfrazado; el test del tester que consagraba el recorte se invirtió y lo dice.
- **`ProviderCard` envía solo claves editables**: la validación estricta contra
  `SETTING_FIELDS` rechazaría `model` (default derivado de `llm:openai`) si la tarjeta
  siguiera mandando el objeto completo.
- **`PROGRESS.md` no se toca**: lo actualiza el orquestador al cerrar la ronda (está
  modificado en el árbol por otras fases).

## Verificación

- `npx jest` (suites REG: `f0RegTester.r1`, `aiCostService`, `pricingService`,
  `providerRegistry`, `providerConfigContract.tester`, `crm/f10ProviderReadiness`,
  `crm/aiUsageStats`): **144/144** con `TZ=UTC` y con `TZ=America/Bogota`.
- `npx jest src/__tests__/guardrails.test.ts src/__tests__/services/goAssistantF0.test.ts
  src/__tests__/services/goAssistantF1.test.ts`: **149/149**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E
  "provider|aiCost|aiUsage|pricing|credits|ai-assistant|aiCredits|rbac"`: **0 líneas**
  (4 errores totales, todos `TS6053` de `.next/types` apuntando a páginas
  `auth/verify-f10-r3` que otro agente borró; ajenos a REG).
- `npx eslint` sobre los 12 archivos tocados: **0 problemas**.
- `npx next build`: no ejecutado en esta ronda (presupuesto de tiempo; `tsc` limpio en REG).

## Pendientes que dejo explícitamente para revisión

- Aplicar las migraciones 38 y 39 (orquestador → dueño) y después: relanzar
  `aiCostService.test.ts`, una transcripción real (inserts con service role) y las
  consultas de verificación al pie de cada `.sql`. Tras aplicar la 39, retirar el
  respaldo en Node de `aiUsageStatsService`.
- Consumir la migración de F0-DB r3 (`crm_v4_f00_36…`) cuando exista: REG no escribió
  SQL sobre `ai_usage_logs`.
- `src/lib/utils/orgAdmin.ts` (`isOrgAdminLike`, GO Assistant) sigue resolviendo por nombre
  de rol; el comentario de `orgContext.ts:19` también lo menciona. Otra fase.
- `chargeAiCredits` no ejecuta el reset mensual con rollover (solo `checkAICredits` legacy
  lo hace): preexistente en `withAiCharge`; candidato a RPC `fn_reset_ai_credits` en DB.
- Los 11 llamadores V3 de `consumeAICredits` siguen cobrando después del proveedor;
  migrarlos a `withAiCharge` es trabajo de GO Assistant / chat, uno por PR, quitándolos
  de la allow-list del guardarraíl 19.
- `refundCommCredits`, auditoría de saldo y prueba de concurrencia real de
  `decrement_ai_credits`: siguen en «qué falta para el 10» del QA.
