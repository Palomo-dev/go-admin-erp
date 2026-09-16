# F0-REG — Builder — Ronda 4 (corta, 2026-09-16)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-qa-r3.md` (9,3/10;
puntos 1–2 obligatorios, 3–6 opcionales) y `F0-REG-tester-r3.md`. Trabajo sobre
`main` (`1c2fe2e5`), sin ramas ni commits. Sin nombres de organizaciones cliente
(la org de prueba es `org 120`, como en r2/r3). Estado de BD al empezar: 38, 43,
44 (y 40) ya aplicadas por otra sesión; la 39 sin aplicar y sin versionar.

## Resumen

| # QA r3 | Estado | Dónde |
|---|---|---|
| 1 (obligatorio) org ajena en `POST /providers/test` → 403 | cerrado | `test/route.ts:140-154`; `f0RegTesterR3.routes.test.ts:135-139` y `:153-159` |
| 2 (obligatorio) `fn_ai_usage_month` sin `pg_timezone_names` | cerrado y **aplicado** (`20260916054927`) | mig. 39 `:86-112` (helper) y `:259-261` (CTE); rollback `:31` |
| 3 (opcional) `isSupportedTimeZone` y canónicos IANA | cerrado | `timezone.ts:49-80`; `f0RegTesterR3.test.ts:316-338` |
| 4 (opcional) `credits` explícito < 0,5 → `RangeError` | cerrado | `aiCostService.ts:104-109` y `:222-227`; `f0RegTesterR3.test.ts:385-396` |
| 5 (opcional) orden de escritura en `useCalendarSettings` | cerrado | `useCalendarSettings.ts:107-119` |
| 6 (cosmético) frase de la cabecera de la 44 | cerrado | mig. 44 `:22-29` (solo comentario) |

## Punto 1 — `POST /api/crm/config/providers/test`: org ajena → 403

`src/app/api/crm/config/providers/test/route.ts:140-154`. Se lee el JSON una
vez (`await request.json().catch(() => null)`), `readOrgBody(ctx, body)` va
dentro de un `try/catch` que convierte `OrgContextError` en
`NextResponse.json({ ok: false, detail }, { status: err.statusCode })` (mismo
patrón que el `try` de `getServerOrgContext` en `:129-136`) y después
`bodySchema.safeParse(body)`. El orden `safeParse` → `checkRateLimit` no cambia.

Tests (`src/__tests__/services/f0RegTesterR3.routes.test.ts`):
- `:135` «body con otra organización → 403 FOREIGN_ORGANIZATION (cerrado en r4)»:
  el `it.failing` pasa a `it` y además exige el JSON
  `{ ok: false, detail: 'Organización no permitida' }`.
- `:153` test de evidencia adaptado: con `orgId: 999` la ruta responde 403, ya
  no escapa ninguna excepción, `checkRateLimit` 0 llamadas,
  `getProviderCredentials` 0 llamadas (contador nuevo `estado.credentialCalls`,
  `:30`, `:44`, `:88`) y `console.warn` registrado con `{ session: 7, body: 999,
  key: 'orgId' }`.
- Cabecera de la suite (`:11-13`) actualizada.

## Punto 2 — Migración 39: `fn_resolve_timezone` en vez de `pg_timezone_names`

`supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql`:
- Pieza **0** nueva (`:86-112`): `public.fn_resolve_timezone(p_tz text) returns
  text`, `language plpgsql stable`, **sin** SECURITY DEFINER, `set search_path
  to 'public'`. `v := nullif(btrim(p_tz), '')`; NULL → `'UTC'`; `perform now()
  at time zone v; return v; exception when invalid_parameter_value then return
  'UTC'`. EXECUTE revocado a `public/anon/authenticated` y concedido a
  `service_role`.
- **Decisión sobre EXECUTE** (documentada en la cabecera `:54-68`): hoy solo la
  invoca `fn_ai_usage_month`, que es SECURITY DEFINER del owner `postgres` y
  ejecuta el helper como owner sin necesitar grant. El grant a `service_role`
  se deja por simetría con las otras cuatro funciones y para que una ruta con
  service client pueda llamarla directamente. `authenticated` no la necesita:
  la zona que la app escribe la valida el trigger de la 44 contra
  `pg_timezone_names` (y `has_function_privilege('authenticated', …)` = false,
  verificado tras aplicar).
- CTE `tz` de `fn_ai_usage_month` (`:256-261`): `select
  public.fn_resolve_timezone(p_tz) as name`.
- Cabecera (`:42-68`) y `comment on` (`:311-312`) actualizados («zona resuelta
  con `at time zone` en plpgsql por fn_resolve_timezone; desconocida, vacía o
  NULL → UTC; nunca 22023»). Verificación al pie (`:363-386`) con los casos
  nuevos y el `explain analyze`.

Rollback `supabase/rollbacks/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas_rollback.sql`:
`drop function if exists public.fn_resolve_timezone(text)` (`:31`, después de
dropear `fn_ai_usage_month`, que la usa); cabecera (`:8-19`) con la comprobación
de que las tres funciones nuevas quedan en 0. El texto literal de
`pg_get_functiondef` de `decrement_ai_credits` y `refund_ai_credits(int,int)`
se conserva intacto.

### Dry-run (MCP `execute_sql`, `begin; …` sin `commit`; pg-meta revierte)

Estado previo comprobado: solo `decrement_ai_credits` (`a68f2598…`) y
`refund_ai_credits(int,int)` (`f0c1222c…`); `fn_resolve_timezone` no existía.

**A. Migración + casos funcionales** (una sola consulta `jsonb` al final):
- `fn_resolve_timezone`: `America/Bogota` → `America/Bogota`; `america/bogota`
  → `america/bogota`; `'  America/Bogota '` → `America/Bogota`; `EST` → `EST`;
  `Asia/Kolkata` → `Asia/Kolkata`; `Marte/Fobos`, `''`, `NULL`,
  `'America/Bogota; drop table x'`, `Nada/Inventado` → `UTC`. Sin error.
- `fn_ai_usage_month(120, mes, 'America/Bogota')` → jsonb con 5 filas,
  `by_day = [2026-09-01]`, 5 créditos; `'america/bogota'` = `'America/Bogota'`
  (true); `'Nada/Inventado'` = `'UTC'` (true); `''` = `'UTC'` (true); `NULL` =
  `'UTC'` (true); `fn_ai_usage_month(-1, …)` → jsonb vacío con claves;
  `fn_comm_usage_month(120, …)` → `{spent_usd 0, rows 0, by_channel []}`.
- Guardas: `decrement(120,null)`, `(120,-1)`, `(-1,1)`, `(null,1)` → false ×4;
  `refund(120,null)`, `(120,-5)`, `(120,0)`, `(-1,5)` → false, false, true,
  false; saldo de la org 120 intacto (3995).
- ACL de las 5 funciones: `{postgres=X, service_role=X}`; `fn_resolve_timezone`
  `prosecdef = false`, `provolatile = s`; `has_function_privilege`:
  authenticated/anon → false, service_role → true.
- Tras el dry-run: solo las 2 funciones originales con sus md5 (revertido).

**B. Tiempos** (`clock_timestamp()` en un `do $$` y `explain analyze`):
`fn_ai_usage_month` 0,90–3,05 ms según la zona (`America/Bogota` 3,054 la
primera llamada, `america/bogota` 1,092, `Nada/Inventado` 1,368, `''` 0,926,
`UTC` 0,901, `NULL` 1,030); `fn_resolve_timezone` ×3 = 0,336 ms; referencia de
la CTE de r3 sobre `pg_timezone_names` en la misma sesión: **75,3 ms**.
`explain analyze select fn_ai_usage_month(120, date_trunc('month', now()),
'America/Bogota')` → `Execution Time: 1,889 ms`.

**C. Migración + rollback en la misma transacción**: punto intermedio con las 3
funciones nuevas (`n_mid = 3`); tras el rollback 0 funciones nuevas,
`md5(pg_get_functiondef)` = `a68f25987e9543ffbf0cfb812f11d92e` y
`f0c1222c7a429941892d70cf348be395` (**iguales** al original), ACL idéntica,
`obj_description` idéntico (decrement sin comentario; refund con el texto
original).

### Aplicación

`apply_migration` con nombre `crm_v4_f00_39_decrement_ai_credits_guardas` →
`supabase_migrations.schema_migrations` versión **`20260916054927`**. Como en
38/43/44 (comprobado en `schema_migrations.statements`), se envió el archivo
íntegro salvo las líneas `begin;`/`commit;`, porque `apply_migration` abre su
propia transacción; el `.sql` del árbol las conserva por convención del
repositorio.

Verificación posterior (consultas del pie del `.sql`, solo SELECT):
- 5 funciones con ACL `{postgres=X, service_role=X}`; `fn_resolve_timezone`
  sin SECDEF; `refund_ai_credits` con 3 parámetros. md5 vivos:
  `decrement c3d96e07…`, `refund(int,int,int) aceb973d…`, `fn_ai_usage_month
  976e0327…`, `fn_comm_usage_month 04d22562…`, `fn_resolve_timezone 73e672c5…`.
- `fn_resolve_timezone` con los 8 casos → como en el dry-run A.
- `decrement(120,null)/(120,-1)/(-1,1)` → false ×3; `refund(120,null)/(120,-5)/
  (120,0)` → false, false, true; `credits_remaining` de la 120 no NULL (3995).
- `fn_ai_usage_month(120, …, 'America/Bogota')` → 5 filas; `Marte/Fobos` =
  `UTC`; `america/bogota` = `America/Bogota`; `''` y `NULL` = `UTC`.
- `explain analyze` en vivo: **3,758 ms** (< 5 ms).

Pendiente para una ronda posterior (ya lo listaba el QA): retirar
`planQuotaFallback`, `ensureAiSettingsFallback` y el respaldo de
`aiUsageStatsService` ahora que 39 y 43 están en producción.

## Punto 3 — `isSupportedTimeZone` (`src/lib/utils/timezone.ts:49-80`)

Se acepta `tz` si está en `Intl.supportedValuesOf('timeZone')` **o** si tiene
forma `Region/City` (`/^[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z_+-]+){1,2}$/`) y
`new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone`
está en el set (enlace IANA que ICU canoniza: Kolkata → Calcutta,
Argentina/Buenos_Aires → Buenos_Aires, Kyiv → Kiev). Medido en Node 22.14 /
ICU 76.1 antes de escribirlo. Decisiones documentadas en el JSDoc: `US/Eastern`
→ **true** (está en `pg_timezone_names`; ICU lo resuelve a `America/New_York`;
la 44 lo admite), `EST` → false (sin barra), `america/bogota` → false. Tests en
`f0RegTesterR3.test.ts:316-338`: el `it.failing` de `America/Argentina/Buenos_Aires`
pasa a `it`; nuevo test `Asia/Kolkata` → true, `US/Eastern` → true, `EST` →
false; `US/Eastern` sale de la lista de rechazados del test anterior.

## Punto 4 — `chargeAiCredits` con `credits` explícito < 0,5

`src/lib/services/crm/aiCostService.ts:222-227`: si `input.credits` viene
informado y `Math.round` da 0 → `RangeError('créditos de IA: mínimo 1 …')`
antes de resolver cliente, precio, presupuesto o RPC. JSDoc de
`ChargeAiInput.credits` (`:104-109`). Ningún llamador actual pasa `credits`
< 1 (grep sobre los 11 llamadores). Test `f0RegTesterR3.test.ts:385-396`: 0.4 y 0
→ `RangeError` sin RPC ni log y saldo intacto; 0.5 → cobra 1.

## Punto 5 — `useCalendarSettings.saveSettings`

`src/components/calendario/configuracion/useCalendarSettings.ts:107-119`:
`organizations.timezone` se escribe **antes** que `organization_settings`; si
el trigger de la 44 la rechaza (22023) no queda ninguna de las dos. Sin test
(el hook usa el cliente de navegador; el QA no pidió uno).

## Punto 6 — Cabecera de la 44

`supabase/migrations/20260915235500_crm_v4_f00_44_organizations_timezone_valida.sql:22-29`:
«corre con el rol que hace el UPDATE; no necesita EXECUTE explícito porque
Postgres no lo comprueba al disparar el trigger y los privilegios por defecto
de `public` ya lo conceden». Solo cambia un comentario; las sentencias aplicadas
(`schema_migrations` `20260916050856`) no.

## Verificación

```
TZ=UTC            npx jest src/__tests__/services/f0Reg src/lib/services/crm src/__tests__/guardrails.test.ts src/lib/services/__tests__/aiCostService --silent
                  → 146 suites, 2873/2873 (1 skipped preexistente)
TZ=America/Bogota (mismo comando)                                       → 146 suites, 2873/2873
TZ=UTC            npx jest src/__tests__/services/f0RegTesterR3.routes.test.ts → 10/10
npx eslint src/app/api/crm/config/providers/test/route.ts src/__tests__/services/f0RegTesterR3.routes.test.ts \
  src/__tests__/services/f0RegTesterR3.test.ts src/lib/services/crm/aiCostService.ts src/lib/utils/timezone.ts \
  src/components/calendario/configuracion/useCalendarSettings.ts                → 0 errores, 0 avisos
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E "providers/test|f0RegTesterR3|aiCostService|utils/timezone|useCalendarSettings"
                  → 0 líneas. Salida completa: 22 líneas, todas en
                    electron/release/win-unpacked/resources/web/src/** (copia empaquetada por
                    otra sesión, ajena a src/; accountSwitcher.ts ×2, deliveryIntegrationService.ts ×9).
```

`npx next build` no se ejecutó en esta ronda (ronda corta; otras sesiones
tienen el dev server y el árbol activos: hay ~20 archivos modificados de F0-SEC
y F0-JOBS ajenos a esta ronda). Sigue pendiente desde r1 para el QA con el dev
server parado.

Archivos tocados por esta ronda (todo lo demás modificado en el árbol es de
otras sesiones):
- `src/app/api/crm/config/providers/test/route.ts`
- `src/__tests__/services/f0RegTesterR3.routes.test.ts`
- `src/__tests__/services/f0RegTesterR3.test.ts`
- `src/lib/services/crm/aiCostService.ts`
- `src/lib/utils/timezone.ts`
- `src/components/calendario/configuracion/useCalendarSettings.ts`
- `supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql` (nuevo en git)
- `supabase/rollbacks/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas_rollback.sql` (nuevo en git)
- `supabase/migrations/20260915235500_crm_v4_f00_44_organizations_timezone_valida.sql` (comentario)
- este informe. `PROGRESS.md` queda para el orquestador (lo están anexando
  otras sesiones en paralelo).

Temporales del dry-run (`mig39_body.sql`, `rb39_body.sql`, `dryrun_a.sql`,
`tsc_r4.txt`) en el scratchpad de la sesión, fuera del árbol.
