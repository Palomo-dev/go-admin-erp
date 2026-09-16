# F0-REG — QA reviewer — Ronda 3 (2026-09-16)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r3.md`,
`F0-REG-tester-r3.md` (8,8/10; 225 casos, 15/16 mutantes muertos + 1 equivalente,
93/93 verificaciones de dry-run con rollback), `F0-REG-qa-r2.md` (8,9/10),
`FASE-00-FUNDACIONES.md`. Verificaciones propias del QA en el repo y en BD
(MCP, proyecto `jgmgphmzusbluqhuqihj`, solo `SELECT` y bloques
`begin; … rollback;` con funciones en `pg_temp`), el 2026-09-16. Sin ramas, sin
commits, sin código tocado. Sin nombres de organizaciones cliente (`org 120`).

Suites relanzadas por el QA:
- `TZ=America/Bogota npx jest src/__tests__/services/f0Reg src/__tests__/guardrails.test.ts --silent`
  → **3 suites, 115/115** (los 2 `it.failing` pasan porque los huecos existen).
- `TZ=UTC` sobre `f0RegTesterR3*`, `guardrails`, `f0RegTester.r1/.r2`,
  `aiCostService`, `crm/aiUsageStats`, `config/__tests__` → **8 suites, 216/216**.

## Calificación: 9,3/10 → requiere-nueva-ronda (r4, corta)

| Dimensión (peso) | Nota | Justificación |
|---|---|---|
| 1. Funcionalidad / contrato (25 %) | 9,0 | Los 7 puntos del QA r2 están cerrados y probados (tabla del tester verificada punto a punto, ver abajo). Un contrato roto real: `POST /api/crm/config/providers/test` con org ajena en el body → excepción sin manejar (500) en vez del 403 prometido. |
| 2. Seguridad (25 %) | 9,5 | Credenciales nunca al cliente (grep del tester reproducido: 0 `service_role` en componentes; `providerCredentials.server.ts` con `assertServerOnly`; `source: 'env'` sin detalle). Cobro antes del proveedor y reembolso después (`withAiCharge` `aiCostService.ts:407-425`), punto único `chargeAiCredits`/`refundAiCredits`, guardarraíl 19 verde. El 500 del punto 1 **no** salta de tenant (`readOrgBody` lanza antes de tocar nada y deja `console.warn`). Resta: la excepción sin manejar y el cobro explícito de `credits: 0.4` que sale gratis. |
| 3. Calidad de código (20 %) | 9,0 | `readOrgBody` envuelto en el PUT (`providers/route.ts:91-97`) y desnudo en `test/route.ts:142`: mismo patrón aplicado de dos formas en la misma carpeta. `fn_ai_usage_month` paga un `Function Scan` completo de `pg_timezone_names` (medido: **59,9 ms**) cuando un `perform … at time zone` en plpgsql cuesta **0,2 ms** (medido). La regla del cupo vive dos veces (SQL + respaldo Node) por diseño hasta aplicar la 43, con tests que la fijan y retirada planificada: aceptable. |
| 4. Pruebas (20 %) | 9,5 | Mutation testing serio (16 mutantes, 5 solo mueren con las suites nuevas, incluido el orden `safeParse` → `checkRateLimit` que la suite r2 no detectaba), ambas TZ, dry-run de las 4 migraciones y rollbacks con md5 dentro de la misma transacción. Falta la concurrencia real (dos conexiones) y `next build` con el dev server parado. |
| 5. Documentación (10 %) | 9,3 | Builder y tester con archivo:línea y comandos reproducibles; cabeceras y verificaciones al pie en las 4 migraciones; `PROGRESS.md` anexado. Una frase falsa en la cabecera de la 44 («la ejecuta el trigger como owner de la tabla»: Postgres ejecuta la función del trigger con el rol que hace el UPDATE; funciona igualmente, ver abajo). |

Media ponderada: 0,25·9,0 + 0,25·9,5 + 0,20·9,0 + 0,20·9,5 + 0,10·9,3 = **9,26 → 9,3**.
No llega a 9,5 por un contrato roto (medio) y por un coste evitable en la 39
que conviene corregir **antes** de aplicarla (editar un `.sql` sin aplicar es
gratis; corregirlo después es una migración más).

## Verificación de los hallazgos del tester (archivo:línea, comprobado por el QA)

| # tester | Veredicto QA | Evidencia propia |
|---|---|---|
| 1 (medio) org ajena en `POST /providers/test` → 500 | **Confirmado** | `src/app/api/crm/config/providers/test/route.ts:142`: `bodySchema.safeParse(readOrgBody(ctx, await request.json().catch(() => null)))` fuera de todo `try`; `readOrgBody` lanza `OrgContextError(403, FOREIGN_ORGANIZATION)` en `src/lib/security/organizationBody.ts:123`. El PUT de `providers/route.ts:91-97` sí lo envuelve con `orgError`. `it.failing` en `f0RegTesterR3.routes.test.ts:136`. |
| 2 (bajo) `isSupportedTimeZone` rechaza canónicos IANA | **Confirmado, y el primer arreglo que propone el tester no sirve** | Node 22.14 / ICU 76.1 local: `supportedValuesOf` tiene `Asia/Calcutta` y `America/Buenos_Aires`, no `Asia/Kolkata` ni `America/Argentina/Buenos_Aires`. Además `new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata'}).resolvedOptions().timeZone` devuelve **`Asia/Calcutta`** (y `EST` → `America/Panama`), así que «`resolvedOptions().timeZone === tz`» seguiría rechazando Kolkata. Hoy no afecta (7 opciones fijas, todas en ambos catálogos). `timezone.ts:53-63`. |
| 3 (bajo) `fn_ai_usage_month` ~60 ms por `pg_timezone_names` | **Confirmado y medido** | `explain analyze` de la expresión de la CTE `tz` (mig. 39 `:208-214`): `Function Scan on pg_timezone_names … Execution Time: 59,881 ms`. Alternativa en `pg_temp` (plpgsql `stable`, `perform timestamptz '2000-01-01Z' at time zone v; exception when invalid_parameter_value then return 'UTC'`): **0,599 ms para 3 llamadas** (`Marte/Fobos`, `America/Bogota`, `'  america/bogota  '`), es decir ~100× menos. Comprobado además que `at time zone 'america/bogota'` da el mismo día que `'America/Bogota'` (Postgres no distingue mayúsculas en `at time zone`), que `'America/Bogota; drop table x'` → `UTC`, `NULL` → `UTC`, `EST` y `Asia/Kolkata` → aceptados. Lo paga cada `GET /credits` y **cada cobro con presupuesto** (`assertWithinBudget`, `aiCostService.ts:199-207`). |
| 4 (bajo) divergencia decimal Node/SQL en `custom_config` | Confirmado por lectura (`fn_ai_plan_quota` `:97` exige `^[0-9]{1,9}$`; Node `customConfigCredits`) | 0 filas hoy; desaparece al aplicar la 43. No requiere acción. |
| 5 (bajo) `chargeAiCredits({ credits: 0.4 })` gratis | **Confirmado** | `aiCostService.ts:86-91` `assertValidCredits` → `Math.round(0.4) = 0`; `:217` lo acepta; la RPC 39 con `p_cost = 0` devuelve `true` (`decrement … if v_remaining < p_cost` no entra) y se inserta log con `credits_consumed: 0`. Ningún llamador actual lo hace (`defaultCreditsForUnits` ≥ 1). |
| 6 (bajo) el hook guarda `calendar_settings` antes que `organizations.timezone` | **Confirmado** | `useCalendarSettings.ts:106-150`: `organization_settings` (`:117-137`) y después `organizations.update({ timezone })` (`:142-148`). Solo alcanzable tras la 44 con una zona del hueco 2. |

Otras comprobaciones del QA:
- BD hoy: 0 funciones nuevas; md5 de las 4 funciones existentes iguales a los del
  builder y del tester; `ai_settings` 0 filas con `credits_reset_at IS NULL`;
  `organizations` 0 zonas fuera de `pg_timezone_names`; `subscriptions.status` es
  `NOT NULL` (0 nulos), así que el `order by (status in (…)) desc` de
  `fn_ai_plan_quota` (43 `:86`) no puede poner un NULL por delante de la activa;
  2 orgs con más de una suscripción (la 43 y el respaldo Node eligen la misma).
- Migración 44 y privilegios: la función del trigger no es SECDEF y corre con el
  rol que hace el UPDATE (`authenticated` desde el navegador). Funciona porque
  (a) los privilegios por defecto de `postgres` en `public` dan EXECUTE a
  `anon/authenticated/service_role` a toda función nueva (`pg_default_acl`
  verificado) y (b) Postgres no re-comprueba EXECUTE al disparar un trigger (los
  15 triggers actuales de `organizations` con ACL solo `postgres/service_role` lo
  demuestran). Solo la frase de la cabecera es inexacta.
- Rollbacks: 39 y 43 con el texto literal de `pg_get_functiondef` (md5
  comprobados por el tester dentro de la transacción); 38 restaura políticas y
  grants (diff 0); 44 elimina trigger y función. Los 4 son aplicables tal cual.
- `getAIFeaturesForOrganization` (`aiCreditsService.ts:133-148`) cae al respaldo
  Node ante **cualquier** error de `fn_ai_plan_quota`, mientras que
  `provisionViaRpc` (`:203-209`) solo cae si la función no existe y lanza en el
  resto. Es defendible (leer un cupo no mueve saldo) y está en la lista de
  retirada del respaldo; lo anoto, no lo puntúo.

## Fortalezas

- La fila «vacía» del navegador se provisiona una sola vez por RPC o por
  respaldo (`is('credits_reset_at', null)` / `on conflict do nothing`), y
  `callDecrement` distingue sin fila / sin provisionar / sin saldo con una consulta.
- Tres capas contra la zona horaria: RPC que resuelve sola, reintento con UTC en
  Node (un solo intento, mismo `since`) y trigger en BD; probadas en SQL, Node y ruta.
- Reembolso simétrico con el cobro (RPC `false`, Node `RangeError`), idempotente
  por `logId`, con rastro `:refund_failed` cuando no se aplica.
- Una sola regla del cupo en SQL (`fn_ai_plan_quota`) reutilizada por trigger,
  cron y app; el cron deja de duplicar filas de orgs con dos suscripciones (el
  `LEFT JOIN subscriptions` sin límite de la versión actual las recorría dos veces)
  y deja de devolver `monthly_credits` NULL.
- Rollbacks byte-idénticos y ACL cerrada a `service_role` en las 8 funciones.

## Instrucciones para el builder — Ronda 4 (prioridad = orden; 1–2 obligatorias)

**1. [obligatorio] `POST /api/crm/config/providers/test`: org ajena → 403.**
`src/app/api/crm/config/providers/test/route.ts:142`. Leer el JSON primero
(`await request.json().catch(() => null)`), envolver `readOrgBody(ctx, body)` en
`try/catch` que convierta `OrgContextError` en
`NextResponse.json({ ok: false, detail: err.message }, { status: err.statusCode })`
(mismo patrón del `try` de `getServerOrgContext` en `:129-136`, o el helper
`orgError` del PUT), y después `bodySchema.safeParse(body)`. El orden
`safeParse` → `checkRateLimit` no cambia. Test: en
`src/__tests__/services/f0RegTesterR3.routes.test.ts:136` pasar el `it.failing`
«HUECO: body con otra organización → 403» a `it`, y conservar el test de evidencia
adaptado (ya no escapa ninguna excepción; `checkRateLimit` 0 llamadas;
`getProviderCredentials` 0 llamadas; `console.warn` registrado).

**2. [obligatorio, antes de aplicar la 39] Resolución de zona sub-milisegundo en
`fn_ai_usage_month`.** Editar
`supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql`:
añadir `public.fn_resolve_timezone(p_tz text) returns text language plpgsql stable`
(sin SECDEF; `set search_path to 'public'`) con:
`v := nullif(btrim(p_tz), ''); if v is null then return 'UTC'; end if;
perform timestamptz '2000-01-01 00:00:00+00' at time zone v; return v;
exception when invalid_parameter_value then return 'UTC';`
y sustituir la CTE `tz` (`:208-214`) por `select public.fn_resolve_timezone(p_tz) as name`.
Revocar EXECUTE a `public/anon/authenticated` y conceder a `service_role` como al
resto (no hace falta más: la llama `fn_ai_usage_month`, que es SECDEF del owner).
Actualizar la cabecera (`:42-47`) y el `comment on` (`:264-265`): «resuelta con
`at time zone` en plpgsql; desconocida → UTC; nunca 22023». En el rollback 39
añadir `drop function if exists public.fn_resolve_timezone(text);`. Verificación
al pie: `explain analyze select fn_ai_usage_month(<org>, date_trunc('month', now()), 'America/Bogota')`
con tiempo < 5 ms, y los mismos casos que ya lista (`Marte/Fobos`, `america/bogota`,
`''`, NULL → sin error). Nota: `at time zone` acepta minúsculas y abreviaturas
del catálogo (`EST`), igual que hoy; el nombre devuelto ya no se canoniza en
mayúsculas, lo cual no afecta a `by_day`. El tester r4 repite el dry-run 39 +
rollback con md5.

**3. [opcional] `isSupportedTimeZone` y los canónicos IANA que ICU renombra.**
`src/lib/utils/timezone.ts:53-63`: aceptar `tz` si está en el set **o** si tiene
forma `Region/City` (`/^[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z_+-]+){1,2}$/`) y
`new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone`
pertenece al set (es un enlace IANA que ICU canoniza a otro nombre: Kolkata →
Calcutta, Argentina/Buenos_Aires → Buenos_Aires, Kyiv → Kiev…). `EST` y demás
abreviaturas siguen rechazadas (dirección segura); la 44 valida en BD de todos
modos. Pasar el `it.failing` de `f0RegTesterR3.test.ts:330` a `it` y añadir
`Asia/Kolkata` → true, `EST` → false, `US/Eastern` → true (está en
`pg_timezone_names`) o false (documentar cuál).

**4. [opcional] `chargeAiCredits` con `credits` explícito < 0,5.**
`aiCostService.ts:217`: si `input.credits` viene informado y `Math.round` da 0,
lanzar `RangeError('créditos de IA: mínimo 1')` (o documentar en `ChargeAiInput`
que `credits: 0` es «sin cobro» y no insertar log). El test «DOCUMENTADO (bajo)»
de `f0RegTesterR3.test.ts:379` pasa a exigir el comportamiento elegido.

**5. [opcional] `useCalendarSettings.saveSettings`**
(`useCalendarSettings.ts:106-150`): escribir `organizations.timezone` **antes**
que `organization_settings`; si la BD la rechaza, no queda ninguna de las dos.

**6. [cosmético, con el punto 2] Cabecera de la 44** (`:22-25`): sustituir «la
ejecuta el trigger como owner de la tabla» por «corre con el rol que hace el
UPDATE; no necesita EXECUTE explícito porque Postgres no lo comprueba al disparar
el trigger y los privilegios por defecto de `public` ya lo conceden».

**Al cerrar la ronda:** `npx jest` de las suites REG + `guardrails` en ambas TZ;
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E "provider|aiCost|aiUsage|pricing|credits|aiCredits|timezone|config/"`
→ 0 líneas; `npx next build` **con el dev server parado** (pendiente desde r1);
`PROGRESS.md` anexado.

## Veredicto sobre aplicar 38 / 39 / 43 / 44

- **38, 43 y 44: aplicables tal cual, ya.** No dependen de la 39 ni del código de
  r4; el código actual funciona antes y después (respaldos en Node). Los rollbacks
  están verificados. La 38 arrastra la decisión del dueño (¿configuración del
  chat IA solo admins?) pero no la bloquea: mantiene el alcance actual.
- **39: NO tal cual.** Aplicarla después del punto 2 del builder r4 (helper
  plpgsql + rollback), con un dry-run del tester r4. Editar el `.sql` sin aplicar
  cuesta minutos; aplicarlo así obliga a una migración 45 para quitar 60 ms de
  cada cobro con presupuesto.
- Recordatorio: la 40 (`cerrar_rpc_crm_anon`) también sigue pendiente y cierra
  `fn_reset_monthly_ai_credits`; el rollback 43 asume que no se reabre (correcto).

## Qué falta para el 10 (sin cambios respecto a r2, salvo lo cerrado)

- Retirar `planQuotaFallback`, `ensureAiSettingsFallback` y el respaldo de
  `aiUsageStatsService` cuando 39 y 43 estén en producción (una ronda posterior).
- Concurrencia real (dos conexiones) sobre `decrement_ai_credits` /
  `fn_provision_ai_settings`; flujo en navegador con sesión real.
- `refundCommCredits`; auditoría de deriva de saldo; Vault para
  `provider_configs.credentials`; migrar los 11 llamadores V3 de
  `consumeAICredits`; `offsetMinutesToISO(0)` → `+00:00`.

## Veredicto

requiere-nueva-ronda (r4 corta: puntos 1 y 2 obligatorios; 38/43/44 pueden
aplicarse ya; 39 tras el punto 2).
