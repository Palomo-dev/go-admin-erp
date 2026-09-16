# F0-REG — QA reviewer — Ronda 2 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r2.md`,
`F0-REG-tester-r2.md` (8,5/10; 411 casos, 407 pasan; 16/16 mutantes muertos; dry-run
de las migraciones 38 y 39 con rollback atómico), veredicto previo `F0-REG-qa-r1.md`
(6/10). Verificaciones propias en BD (solo `SELECT`, MCP, proyecto
`jgmgphmzusbluqhuqihj`) y en el repo el 2026-09-15. Los ~197 errores de `tsc` son del
refactor concurrente de F0-SEC a `readOrgBody` y no se cuentan aquí.

Suites relanzadas por el QA: `f0RegTester.r1`, `f0RegTester.r2`, `aiCostService`,
`pricingService`, `crm/aiUsageStats`, `f0RegTester.r2.routes`, `guardrails` →
**177/177** con `TZ=America/Bogota`; las tres de r2 también con `TZ=UTC` (62/62).
El único `it.failing` vivo es el del hueco 1 (pasa mientras el hueco exista).

## Calificación: 8,9/10

| Dimensión (2 pts c/u) | Puntos | Justificación |
|---|---|---|
| 1. Funcionalidad completa | 1,8 | Los 18 puntos del QA r1 que tocaban REG están cerrados y probados: cobro antes del proveedor, guardas de importe, auto-provisión, `cost_amount` en columna, presupuesto que bloquea, agregados en SQL, prioridad org > env, validación de `settings`, `isOrgAdmin` por id, `valid_to`. Falta que la auto-provisión cubra la fila «vacía» creada desde el navegador (hueco 1). |
| 2. Robustez | 1,6 | Sin críticos ni altos. Quedan: zona horaria que Postgres no reconozca → 500 tras la 39 (hueco 2); `refund_ai_credits` negativo/NULL → `true` silencioso; rate limit consumido antes de validar el body. |
| 3. Consistencia | 1,8 | Patrones respetados (org de sesión, service role solo donde toca, RPC SECDEF con EXECUTE a `service_role`, fechas por `dateDisplay.ts`/`p_tz`). Pero el «cupo del plan» ya vive **tres veces**: `getAIFeaturesForOrganization` (TS), `fn_reset_monthly_ai_credits` y `sync_ai_credits_on_subscription` (SQL), con defaults distintos (TS: 10 000 si no hay suscripción; SQL: 0). Regla 7 de CLAUDE.md. |
| 4. Resultados del tester | 1,8 | 407/411, 0 críticos, 0 altos, 2 medios, 6 bajos; 16/16 mutantes muertos; dry-run 38/39 de 39 filas verdes en BD con rol real impersonado. |
| 5. Documentación/trazabilidad | 1,9 | Builder y tester dejan evidencia exacta, migraciones con cabecera, rollback y consultas de verificación al pie. Resta: el informe del builder dice «eslint 0 / tsc 4» y hoy son 2 errores preexistentes en `guardrails.test.ts` y 197 de `tsc` (ajenos); la cabecera del rollback 39 dice «tomada con `pg_get_functiondef`» y no es byte-idéntica. |

Suma **8,9** → requiere-nueva-ronda (no hay tope por crítico; la distancia a 9,5 son
dos huecos medios acotados y un cosmético).

### Verificaciones propias del QA (BD y repo, 2026-09-15)

- **Zonas horarias hoy**: `organizations.timezone` es `text NOT NULL DEFAULT
  'America/Bogota'`; las **84** organizaciones tienen `America/Bogota` y las 84 están en
  `pg_timezone_names` (**0** fuera). El único escritor desde el navegador es
  `src/components/calendario/configuracion/useCalendarSettings.ts:130-133`
  (`from('organizations').update({ timezone })`) con un `Select` de 7 valores
  (`TIMEZONE_OPTIONS`, `types.ts:98-106`): los 7 existen en `pg_timezone_names`
  (verificado). Pero la columna se escribe con cliente de sesión y PostgREST acepta
  cualquier texto: el hueco 2 es latente, no ficticio. Ni `aiUsageStatsService.ts` ni
  `aiCostService.ts` tratan el código `22023` (grep: 0 coincidencias).
- **Cómo se provisiona el cupo del plan hoy** (tres caminos, ninguno pasa por
  `chargeAiCredits` salvo cuando falta la fila):
  1. Trigger `trigger_sync_ai_credits` (`AFTER INSERT OR UPDATE OF plan_id, status ON
     subscriptions`) → `sync_ai_credits_on_subscription`: inserta `ai_settings` con
     `credits_remaining = plans.ai_credits_monthly`, `credits_reset_at = now()`; en
     conflicto sube el saldo al cupo si es mayor. Solo dispara al cambiar la suscripción:
     por eso 27 orgs con CRM siguen sin fila.
  2. Cron `reset-monthly-ai-credits` (`5 0 1 * *`, activo) → `fn_reset_monthly_ai_credits`:
     recorre **todas** las filas de `ai_settings` (sin mirar `credits_reset_at`) y pone
     `mensual + rollover + comprados`; salta solo si mensual = 0 y comprados = 0.
  3. `checkAICredits` (legacy, Node): reset por mes calendario si `credits_reset_at`
     cambió de mes (NULL → 1970 → resetea), y `ensureAiSettings` si no hay fila.
  Consecuencia para el hueco 1: una fila creada desde el navegador con 0 créditos y
  `credits_reset_at NULL` recibe 402 en todo cobro del CRM **hasta el día 1 del mes
  siguiente** (el cron la repara), no «permanente» como dice el tester; sigue siendo un
  hueco real porque `ensureAiSettings` la considera provisionada (`existing` → devuelve
  0) y `callDecrement` solo distingue «sin fila». Hoy: 39 filas, 0 con
  `credits_reset_at NULL`, 1 con saldo 0 (y `credits_reset_at` no nulo: legítima).
- La migración 38 deja `credits_reset_at` fuera de los grants de INSERT/UPDATE a
  `authenticated` (correcto: es columna de saldo); por eso la fila del navegador nace
  con NULL ahí. Es la señal exacta de «no provisionada».
- `POST /providers/test`: `checkRateLimit` en la línea 140, `safeParse` en la 145
  (confirmado el bajo 5 del tester).
- `refund_ai_credits` (mig. 39): `v_amount := greatest(coalesce(p_amount, 0), 0)` y
  `if v_amount = 0 then return true` (confirmado el bajo 4).

### Fortalezas

- El punto único de cobro es real: `withAiCharge` y `withAICreditsCheck` ejecutan
  `decrement_ai_credits` **antes** del proveedor, reembolsan en fallo y propagan el error
  original; guardarraíl 19 cierra la allow-list de los 11 llamadores V3.
- Importes inválidos (NaN, ±Infinity, negativos) mueren con `RangeError` antes del RPC
  en las cuatro entradas; la RPC de la 39 también los rechaza (`false`) y trata el saldo
  NULL como 0. Cierra el «org ilimitada» de r1 en los dos extremos.
- Migración 38 por columna: ningún escritor legítimo del navegador queda fuera
  (`aiSettingsService`, página `/app/chat/ia/configuracion`), y el saldo solo lo tocan
  service role y las RPC. Dry-run con miembro real de rol 4: 15/15 pruebas de privilegio
  y RLS como se esperaba; rollback byte-idéntico en políticas y grants.
- `GET /credits` y el presupuesto agregan en SQL con el día calendario de la zona de la
  organización (borde 30/09 22:00 Bogotá probado en ruta real y en SQL); respaldo en Node
  con `truncated` visible hasta aplicar la 39.
- Reembolso idempotente (memoria + fila `:refund`) y sin pérdida (`p_previous`), probado
  en BD con saldo 2003 / techo 2000.
- 16/16 mutantes muertos; el tester añadió los dos tests que faltaban (M1, M15).

### Problemas encontrados (ordenados por severidad)

1. **[medio] Fila `ai_settings` creada desde el navegador (0 créditos,
   `credits_reset_at NULL`) nunca recibe el cupo del plan por el camino del CRM.**
   `ensureAiSettings` devuelve `existing` con 0 y `chargeAiCredits` lanza 402 hasta que
   el cron del día 1 la repare. `it.failing` en `f0RegTester.r2.test.ts:440`.
2. **[medio] Zona horaria válida para Intl pero no para Postgres → `fn_ai_usage_month`
   22023 → 500 en `GET /credits` y en cada cobro con presupuesto, tras aplicar la 39.**
   Hoy 0 orgs afectadas (84/84 en `pg_timezone_names`), pero la columna se escribe desde
   sesión sin validar contra el catálogo de Postgres, y Node no captura el código.
3. **[bajo] Rollback 39 no byte-idéntico**: el cuerpo de `decrement_ai_credits` y
   `refund_ai_credits` está en minúsculas y la BD lo guarda en mayúsculas; la cabecera
   promete «tomada con `pg_get_functiondef`». Semántica y ACL idénticas.
4. **[bajo] `refund_ai_credits(org, negativo|NULL)` devuelve `true`** sin tocar el
   saldo, y `refundAiCredits` en Node hace lo mismo; el cobro sí lanza `RangeError`.
   Asimetría silenciosa.
5. **[bajo] `POST /providers/test` consume rate limit antes de validar el body**
   (`route.ts:140` vs `:145`): 5 bodies inválidos bloquean al admin un minuto.
6. **[bajo] Tres implementaciones del «cupo del plan»** (TS + 2 SQL) con defaults
   distintos para org sin suscripción (10 000 vs 0). No lo introduce REG, pero
   `ensureAiSettings` lo consolida en vez de reutilizar la SQL. Anotado para el 10.
7. **[bajo] Informe del builder desactualizado** en `eslint`/`tsc` (ver dimensión 5).

### Instrucciones para el builder — Ronda 3 (prioridad = orden; 1–3 obligatorias)

**1. Provisión del cupo del plan en `ensureAiSettings` para filas no provisionadas.**
`src/lib/services/aiCreditsService.ts`: en el `select` añadir `credits_reset_at`; si
`existing` tiene `credits_reset_at IS NULL`, tratarla como «sin provisionar»: calcular
`initialCredits` con `getAIFeaturesForOrganization` y hacer
`update({ credits_remaining: greatest(actual, initialCredits), credits_reset_at: now })`
filtrando `.eq('organization_id', orgId).is('credits_reset_at', null)` (idempotente
frente a dos peticiones concurrentes; si actualiza 0 filas, releer). Devolver
`created: false, provisioned: true`.
`src/lib/services/crm/aiCostService.ts` `callDecrement`: el `maybeSingle` de
distinción pasa a seleccionar `organization_id, credits_reset_at` y devuelve
`{ ok: false, missingRow: false, unprovisioned: row.credits_reset_at == null }`;
`chargeAiCredits` entra en la rama de auto-provisión también con `unprovisioned`.
Pasar el `it.failing` de `f0RegTester.r2.test.ts:440` a `it`; añadir en
`aiCostService.test.ts` el caso «fila con `credits_reset_at NULL` y plan con cupo →
provisiona y cobra» y «plan sin cupo → 402». Comprobación: ambas suites verdes en
`TZ=UTC` y `TZ=America/Bogota`; `select count(*) from ai_settings where
credits_reset_at is null` sigue en 0 tras una transcripción real (MCP, SELECT).

**2. Zona horaria a prueba de catálogo, en las dos capas.**
- Migración 39 (aún sin aplicar, editar el mismo archivo y su rollback):
  `fn_ai_usage_month` calcula `day` con
  `coalesce((select name from pg_timezone_names where name = nullif(p_tz, '') limit 1), 'UTC')`
  resuelto **una vez** en una CTE (`tz as (select ... as name)`), no por fila. Añadir
  al pie la verificación `select fn_ai_usage_month(<org>, date_trunc('month', now()),
  'Marte/Fobos')` → jsonb con días en UTC, sin error. Documentar en la cabecera el
  contrato «`metadata.cost_amount` en texto se descarta» (bajo 8 del tester).
- `src/lib/services/crm/aiUsageStatsService.ts` `getAiUsageMonth`: si `error.code ===
  '22023'`, `console.warn` y reintentar una vez con `p_tz: 'UTC'`; nunca 500 por zona.
  Test nuevo en `crm/__tests__/aiUsageStats.test.ts` («22023 → reintento con UTC, 2
  llamadas al RPC») y uno en `f0RegTester.r2.routes.test.ts` («`GET /credits` con zona
  inválida en Postgres → 200»).
- `America/Bogota` sigue siendo solo fallback (`DEFAULT_TIMEZONE`); no cablear.

**3. Rollback 39 exacto.** Sustituir los cuerpos de `decrement_ai_credits` y
`refund_ai_credits(integer, integer)` por la salida literal de `pg_get_functiondef`
(MCP, SELECT; mayúsculas incluidas). Comprobación en dry-run: `md5(pg_get_functiondef(oid))`
igual antes de la 39 y después del rollback, para las dos funciones. Si se prefiere no
prometer identidad, cambiar la cabecera a «equivalente en semántica y ACL» — pero la
identidad es barata y evita un falso negativo en auditoría.

**4. [bajo, no bloquea] Simetría del reembolso.** `refund_ai_credits`: `p_amount IS NULL
OR p_amount < 0` → `return false` (el `= 0` sigue siendo no-op `true`);
`refundAiCredits` en Node → `RangeError` como el cobro. Actualizar la fila 27 del dry-run
y los tests que consagran el `true`.

**5. [bajo, no bloquea] `POST /providers/test`**: validar el body (`safeParse`) antes
de `checkRateLimit`; el 422 no consume cupo. Ajustar el test de r2 routes que lo
documenta.

**Al cerrar la ronda:** `npx jest` de las suites REG + `guardrails` en ambas TZ;
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E
"provider|aiCost|aiUsage|pricing|credits|aiCredits|rbac"` → 0 líneas; `npx next build`
(pendiente desde r1); el informe del builder debe reflejar el estado real de `eslint`
y `tsc` separando lo ajeno; nueva entrada en `PROGRESS.md` (añadir, no reescribir).
Migraciones 38 y 39 siguen **sin aplicar** hasta que el orquestador las muestre al dueño
(decisión pendiente: escritura de la configuración del chat IA solo para admins).

### Qué falta para el 10 (además de lo anterior)

- Una sola fuente del «cupo del plan»: RPC `fn_provision_ai_settings(p_org)` SECDEF que
  reutilicen `ensureAiSettings`, `sync_ai_credits_on_subscription` y
  `fn_reset_monthly_ai_credits`, con el mismo default para org sin suscripción.
- Retirar el respaldo en Node de `aiUsageStatsService` cuando la 39 esté en producción.
- Prueba de concurrencia real de `decrement_ai_credits`/`refund_ai_credits` (dos
  conexiones) y flujo en navegador con sesión real.
- `refundCommCredits` en `aiCostService`; auditoría de deriva de saldo
  (`credits_remaining` vs suma de `ai_usage_logs` desde el último reset).
- Vault (M6) para `provider_configs.credentials` o decisión documentada.
- Migrar los 11 llamadores V3 de `consumeAICredits` a `withAiCharge` (GO Assistant/chat,
  uno por PR, retirándolos de la allow-list del guardarraíl 19).
- `offsetMinutesToISO(0)` → `+00:00` (`src/lib/utils/timezone.ts:77`, fuera de REG).

### Veredicto

requiere-nueva-ronda
