# F0-REG — Tester — Ronda 4 (corta, 2026-09-16)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r4.md`,
`F0-REG-qa-r3.md` (9,3/10; obligatorios 1–2, opcionales 3–6),
`F0-REG-tester-r3.md`. Trabajo sobre `main` (HEAD `e3972da7` al cerrar; otra
sesión hizo commit durante la ronda), sin ramas ni commits. BD: proyecto
`jgmgphmzusbluqhuqihj`, **solo SELECT** (y `explain analyze` de SELECT); la 39
ya estaba aplicada (`20260916054927`), no se ejecutó ningún rollback. Sin
nombres de organizaciones cliente: la org de prueba es `org 120`.

Suite nueva dejada en el repo: `src/__tests__/services/f0RegTesterR4.test.ts`
(26 casos, 1 `it.failing` que documenta un hueco bajo; ids 7/999 inventados).

## Resumen

- Casos ejecutados: 187 automatizados de las suites REG (r1, r2, r3, r4,
  builder, aiUsageStats, config) en `TZ=UTC` y `TZ=America/Bogota` (todos
  verdes); 26 de la suite nueva; 42 sondas en BD por SELECT; 14 mutantes
  (164 casos juez por mutante); 9 comprobaciones de lectura sobre migración y
  rollback.
- Pasaron: 187/187 ×2 TZ; 42/42 sondas; **14/14 mutantes muertos**; cotejo
  árbol↔BD y rollback↔md5 previo: exacto.
- Fallos nuevos: 0 críticos, 0 altos, 0 medios, **1 bajo**, 3 observaciones.
- **Ninguna mutación viva** (md5 árbol = copia del scratchpad en los 4
  archivos; ningún `.mutbak` ni `.bak` en el árbol).

## Tabla de verificación — puntos del QA r3 contra el código r4

| # QA r3 | Qué pedía | Dónde está en r4 (archivo:línea) | Test que lo fija | Veredicto |
|---|---|---|---|---|
| 1 (obligatorio) | Org ajena en `POST /providers/test` → 403 JSON, sin rate limit ni credenciales | `src/app/api/crm/config/providers/test/route.ts:140-155`: JSON leído una vez, `readOrgBody(ctx, body)` en `try/catch` → `{ ok:false, detail }` con `err.statusCode`; `safeParse` después (`:156-160`); `checkRateLimit` después (`:161`) | r3 routes `:135` (403 + JSON) y `:152` (0 rate limit, 0 credenciales, warn con `key`); **R4** ×9: las 4 claves, `"999"`, `" 999 "`, `"7abc"`, `0`, `true`, `-7`, dos claves (propia + ajena), misma org en 5 formas → 200, JSON roto/array/texto/`null`/vacío → 400, sin sesión → 401, ctx 400 → 400, no admin → 403 antes del body, 429 tras validar y antes de credenciales, `TypeError` se propaga | ✅ cerrado (mutantes M1–M4 muertos) |
| 2 (obligatorio) | `fn_ai_usage_month` sin `pg_timezone_names`, helper `fn_resolve_timezone`, < 5 ms, rollback con el helper | Mig. 39 `:86-112` (helper plpgsql `stable`, sin SECDEF, `search_path=public`, revoke/grant), `:259-261` (CTE `tz`), `:311-312` (`comment on`); rollback `:31` (`drop function if exists … fn_resolve_timezone(text)` tras dropear `fn_ai_usage_month`) | Cotejo árbol↔BD (abajo): `md5(statements[1])` de `schema_migrations` = md5 del cuerpo del `.sql` sin `begin;`/`commit;` ni pie de verificación (`3d403f68…`); `pg_get_functiondef` de las 5 funciones = texto del `.sql`; `explain analyze` **3,752 ms**; sondas de la tabla BD | ✅ cerrado y aplicado |
| 3 (opcional) | `isSupportedTimeZone` acepta enlaces IANA que ICU canoniza; documentar `US/Eastern` | `src/lib/utils/timezone.ts:65` (regex `Region/City`), `:67-80` (`set.has(tz) \|\| (regex && set.has(resolved))`), JSDoc `:49-59` con `US/Eastern` → true, `EST` → false, `america/bogota` → false | r3 `:316-338`; **R4**: 18 enlaces (Kolkata, Argentina/Buenos_Aires, Kyiv, Ho_Chi_Minh, Asmara, ComodRivadavia, US/*, Brazil/East, Mexico/General, …) → true y **todos existen en `pg_timezone_names`** (SELECT); los **417 canónicos de ICU 76.1** → true y **los 417 están en `pg_timezone_names`** (SELECT); 28 rechazados; todo enlace aceptado resuelve a un canónico del set | ✅ cerrado (M5–M8 muertos); 1 observación (`Etc/UTC`) |
| 4 (opcional) | `credits` explícito < 0,5 → `RangeError` | `src/lib/services/crm/aiCostService.ts:105-109` (JSDoc), `:222-227` (guarda antes de cliente, precio, presupuesto y RPC) | r3 `:385-396`; **R4**: 0,49 → `RangeError` con «mínimo 1 (recibido 0.49)», 0,5 → cobra 1, `NaN`/`-1`/`'3'`/`Infinity`/`-0`/`0` → `RangeError` sin tocar la BD, ausente o `null` → default (units 0 → 1, 2 500 → 3), 1,5 → 2 | ✅ cerrado (M9–M11 muertos) |
| 5 (opcional) | `organizations.timezone` antes que `organization_settings` | `src/components/calendario/configuracion/useCalendarSettings.ts:107-119` (update + `throw` si `tzError` + `invalidateTimezoneCache`) y luego `:121-147` | **R4** (hook ejecutado sin DOM con un despachador mínimo de React 19): orden `organizations.update` → `organization_settings.update`/`insert`; con 22023 simulado `organization_settings` **no se toca**, `setError` recibe «Zona horaria rechazada: …», `setOriginalSettings` no se llama, caché no invalidada; `EST` → error local sin BD | ✅ cerrado (M12–M14 muertos; el QA no pedía test, ahora lo hay) |
| 6 (cosmético) | Cabecera de la 44 | Mig. 44 `:22-29` (solo comentario; `git diff` = 7 líneas de comentario, 0 sentencias) | — | ✅ |
| Rollback 39 | Deja la BD como antes | Rollback `:28-31` dropea las 3 funciones nuevas; `:34` dropea `refund(int,int,int)`; `:39-96` y `:103-132` texto literal de `pg_get_functiondef` | **Verificado por lectura**: el md5 del bloque literal + `\n` final (como lo devuelve `pg_get_functiondef`) da **`f0c1222c7a429941892d70cf348be395`** (refund) y **`a68f25987e9543ffbf0cfb812f11d92e`** (decrement), iguales a los previos a la 39 (r3 los midió dentro de la transacción); ACL y `comment on` restaurados (`:98-99`, `:134-141`); solo `fn_ai_usage_month` llama a `fn_resolve_timezone` (SELECT sobre `prosrc`, 0 vistas) → el `drop` no rompe nada más | ✅ (no ejecutado, por regla) |

## Cotejo del `.sql` del árbol con la BD (SELECT)

| Comprobación | Resultado |
|---|---|
| `schema_migrations` versión `20260916054927`, nombre `crm_v4_f00_39_decrement_ai_credits_guardas`, 1 sentencia, 15 952 caracteres | md5 `3d403f68d27c13e10ab8041849eb5def` |
| Cuerpo del `.sql` del árbol sin `begin;`/`commit;` ni el pie de verificación (comentarios tras `commit;`), líneas en blanco dobles colapsadas | md5 **`3d403f68d27c13e10ab8041849eb5def`** (idéntico, 15 952 caracteres) |
| `pg_get_functiondef` de `fn_resolve_timezone`, `decrement_ai_credits`, `refund_ai_credits(int,int,int)`, `fn_ai_usage_month` | cuerpo idéntico al del `.sql` (`73e672c5…`, `c3d96e07…`, `aceb973d…`, `976e0327…`; `fn_comm_usage_month` `04d22562…`), iguales a los del builder |
| `prosecdef` / `provolatile` / `proconfig` / owner de `fn_resolve_timezone` | `false` / `s` / `search_path=public` / `postgres` |
| ACL de las 5 funciones | `{postgres=X, service_role=X}`; `has_function_privilege`: authenticated y anon → false, service_role → true |
| `refund_ai_credits` sobrecargas | 1 (3 parámetros) |

## Sondas en BD (`execute_sql`, solo SELECT)

| # | Sonda | Esperado | Obtenido |
|---|---|---|---|
| 1 | `fn_resolve_timezone('america/bogota')` | `america/bogota` (se acepta, sin canonizar) | `america/bogota` |
| 2 | `('Nada/Inventado')` / `('')` / `(NULL)` / `('   ')` | `UTC` ×4 | `UTC` ×4 |
| 3 | `('US/Eastern')` / `('Asia/Kolkata')` / `('EST')` | tal cual | `US/Eastern` / `Asia/Kolkata` / `EST` |
| 4 | `(' UTC ')` | `UTC` (recortada) | `UTC` |
| 5 | `('America/Bogota; drop table x')` / `(repeat('A', 300))` | `UTC` | `UTC` ×2 |
| 6 | `(E'\tAmerica/Bogota\n')` | — | `UTC` (`btrim` solo recorta espacios; ver observación 2) |
| 7 | `('UTC+5')` / `('+05:30')` / `('5')` | — | se aceptan tal cual (POSIX; ver observación 3) |
| 8 | `fn_ai_usage_month(120, mes, 'America/Bogota')` | jsonb con 5 filas | `rows 5, by_day [2026-09-01], spent_credits 5` |
| 9 | `'america/bogota'` = `'America/Bogota'`; `'Nada/Inventado'` / `''` / `NULL` / default = `'UTC'` | true ×5 | true ×5 |
| 10 | `'Asia/Kolkata'` / `'US/Eastern'` | 5 filas, sin error | 5 / 5 |
| 11 | `fn_ai_usage_month(-1, …)` / `(NULL, …)` / `(120, NULL, …)` | jsonb vacío con claves / 0 filas | igual |
| 12 | `explain analyze select fn_ai_usage_month(120, date_trunc('month', now()), 'America/Bogota')` | < 5 ms | **Execution Time: 3,752 ms** |
| 13 | `explain analyze` de 2 × `fn_ai_usage_month` (`Nada/Inventado`, `america/bogota`) + 3 × `fn_resolve_timezone` | < 10 ms | 5,247 ms en total (~2,5 ms por agregado) |
| 14 | Los 417 canónicos de ICU 76.1 (`Intl.supportedValuesOf`) contra `pg_timezone_names` (1 194 filas) | 0 ausentes | **0 ausentes** |
| 15 | 17 enlaces que Node acepta (`Asia/Kolkata`, `Europe/Kyiv`, `US/East-Indiana`, `Etc/UTC`, …) contra `pg_timezone_names` | 0 ausentes | **0 ausentes** |
| 16 | Estado de la org 120 | saldo 3995, `America/Bogota` | 3995, `America/Bogota` (sin cambios) |

## Mutation testing (14 mutantes, uno a uno, jueces en `TZ=America/Bogota`)

Método: script en el scratchpad (`mutate.js`) que copia el archivo del
scratchpad, exige **una única** coincidencia del texto a sustituir (archivos con
CRLF: el patrón se normaliza al salto de línea del archivo), corre las 8 suites
juez (`f0RegTesterR3*`, `f0RegTesterR4`, `f0RegTester.r1/.r2`, `aiCostService`,
`aiUsageStats`, `f0RegTester.r2.routes`; 164 casos), restaura byte a byte y
compara md5 árbol↔copia antes de mutar y después de restaurar (14/14 «restaurado
md5 ok: true»).

| Mutante | Archivo | Estado | Quién lo mata |
|---|---|---|---|
| M1 `readOrgBody` sin `try/catch` (vuelve el 500 de r3) | test/route | muerto (6) | r3 routes ×2, **R4** ×4 |
| M2 `readOrgBody(ctx, {})` (no mira el body) | test/route | muerto (6) | r3 routes ×2, **R4** ×4 |
| M3 `checkRateLimit` antes de `readOrgBody` y `safeParse` | test/route | muerto (8) | r3 routes ×2 (0 llamadas), **R4** ×6 |
| M4 la org del body sustituye a la de sesión en la comprobación (salto silencioso) | test/route | muerto (3) | r3 routes, **R4** ×2 |
| M5 rama `Region/City` sin exigir que la resolución esté en el set | timezone | muerto (2) | **solo R4** (`Etc/UTC` → false; rechazados) |
| M6 regex `Region/City` con `/i` (`america/bogota` pasa) | timezone | muerto (2) | r3, **R4** |
| M7 `return set.has(resolved)` (EST → America/Panama → true) | timezone | muerto (4) | r3 ×2, **R4** ×2 (incl. hook `EST`) |
| M8 sin el caso especial `UTC` | timezone | muerto (2) | r3, **R4** |
| M9 guarda `credits < 1` → `< 0` (nunca dispara) | aiCostService | muerto (3) | r3, **R4** ×2 |
| M10 `Math.round` → `Math.floor` (0,5 → 0; 1,5 → 1) | aiCostService | muerto (3) | r3, **R4** ×2 (1,5 → 2 solo R4) |
| M11 mínimo silencioso: se cobra 1 en vez de lanzar | aiCostService | muerto (3) | r3, **R4** ×2 |
| M12 orden de r3 (`organization_settings` antes que `organizations`) | useCalendarSettings | muerto (3) | **solo R4** |
| M13 el error de `organizations.update` se traga | useCalendarSettings | muerto (1) | **solo R4** |
| M14 sin `isSupportedTimeZone` antes de escribir | useCalendarSettings | muerto (1) | **solo R4** |

Resultado: **14/14 muertos**; 5 (M5, M12, M13, M14 y el borde 1,5 → 2 de M10)
solo mueren con la suite nueva. Antes de r4 el hook no tenía ningún test.

## Fallos encontrados

1. **[bajo] `POST /api/crm/config/providers/test` no mira la query string.**
   `test/route.ts:145` usa la sobrecarga síncrona `readOrgBody(ctx, body)` sobre
   el JSON ya leído; la comprobación de `?organization_id=…` solo existe en la
   sobrecarga con `Request` (`organizationBody.ts:153-161`). `POST …/test?organization_id=999`
   con body limpio → 200 y sin `console.warn`. **No es un salto de tenant**: la
   ruta no lee nada de la query y la org efectiva es la de sesión; es cobertura
   incompleta de la regla 5(b) tal como la describe la cabecera del módulo («si
   el body (o la query) trae OTRA organización → 403»). Mismo patrón en el PUT
   de `providers/route.ts:91` y en ~35 rutas más (`readOrgBody(ctx, body)`), así
   que es de F0-SEC, no de esta ronda. `it.failing` + test de evidencia en
   `f0RegTesterR4.test.ts`. Arreglo barato (para F0-SEC): que la sobrecarga
   síncrona acepte un `url` opcional, o que las rutas llamen además a
   `readOrgBody(ctx, request.nextUrl.searchParams)`.

Observaciones (no fallos):

1. `isSupportedTimeZone('Etc/UTC')` → **false** aunque `Etc/UTC` sea canónico
   IANA y esté en `pg_timezone_names`: `UTC` se acepta por caso especial, pero
   `Etc/UTC` cae en la rama `Region/City` y su resolución (`UTC`) no está en el
   set de ICU. Dirección segura; documentado en la suite R4. Lo mismo para
   `Etc/GMT` y `Etc/GMT±N` (el dígito no cumple la regex).
2. `fn_resolve_timezone` usa `btrim(p_tz)`, que solo recorta espacios: una zona
   con tabulador o salto de línea (`E'\tAmerica/Bogota\n'`) cae a `UTC` en
   silencio. Inalcanzable hoy: `p_tz` sale de `organizations.timezone`, que el
   trigger de la 44 canoniza (también con `btrim`) y Node valida antes.
3. `at time zone` acepta especificaciones POSIX con **signo invertido**:
   `fn_resolve_timezone('UTC+5')`, `('+05:30')` y `('5')` se aceptan y
   `now() at time zone '+05:30'` da UTC−05:30, no UTC+05:30. La cabecera de la
   39 (`:56-58`) menciona las POSIX pero no la inversión. Inalcanzable hoy por
   la misma razón (Node rechaza offsets; el trigger exige `pg_timezone_names`,
   donde `+05:30` no existe). Si algún día `p_tz` llegara de otra fuente,
   conviene filtrar `^[A-Za-z]` antes del `perform`.
4. Durante la ronda (01:23–01:27) otra sesión hizo `git stash` y el árbol
   estuvo ~3 min en estado r3 (74 archivos, incluidos los 7 de esta ronda);
   después volvió (`git stash apply`; `stash@{0}` sigue en la lista). Las
   copias del scratchpad y los md5 se tomaron **después** de la restauración;
   todas las cifras de este informe son del estado r4. Además, el tester de
   F0-SEC mutaba `organizationBody.ts` en paralelo: dos pasadas de la suite R4
   fallaron con sus mutantes vivos (`break;` en `claimedOrganizationsIn`) y
   pasaron al restaurarse (md5 `7bb00213…` del archivo en la pasada verde).

## Cobertura no probada / riesgos pendientes

- Sin cambios respecto a r3: concurrencia real sobre `decrement_ai_credits`,
  flujo en navegador con sesión real, `npx next build` con el dev server parado
  (otras sesiones lo tienen activo; `tsc` limpio en el alcance), retirada de
  `planQuotaFallback` / `ensureAiSettingsFallback` / respaldo de
  `aiUsageStatsService` ahora que 39 y 43 están en producción.
- El rollback 39 se verificó **por lectura** (md5 de los bloques literales) y
  no ejecutándolo, como pedía el encargo; r3 ya lo había ejecutado en seco.
- El test del hook usa el despachador interno de React 19
  (`__CLIENT_INTERNALS…H`); si el repo incorpora `@testing-library/react` o un
  renderer, conviene migrarlo.

## Calificación de robustez

**9,4/10.** Los dos obligatorios están cerrados de verdad: la ruta responde 403
JSON con cualquier clave y forma de org ajena sin consumir cupo ni credenciales
(4 mutantes de la ruta muertos, incluido el salto silencioso M4), y la 39
aplicada coincide byte a byte con el `.sql` del árbol, resuelve la zona en
plpgsql (3,75 ms medidos frente a los ~60 ms de r3), nunca lanza 22023 con 15
entradas hostiles y su rollback restaura las dos funciones originales con los
md5 previos. Los cuatro opcionales también: `isSupportedTimeZone` acepta los
enlaces IANA y **no acepta nada que Postgres no reconozca** (417 canónicos + 17
enlaces cotejados contra `pg_timezone_names`), `credits` < 0,5 ya no sale
gratis, y el hook escribe primero donde la BD valida (ahora con tests y 3
mutantes muertos). 14/14 mutantes muertos, 5 solo por la suite nueva. Resta a
la nota: la query string sin comprobar en la ruta (bajo, heredado del patrón de
F0-SEC), las tres observaciones sobre `Etc/UTC`, `btrim` y POSIX (todas en la
dirección segura o inalcanzables hoy) y `next build` todavía pendiente desde
r1. Nada compromete tenants ni dinero.

## Comandos exactos y resultado

```
# (c) encargo, ambas zonas — el resto del árbol lo mueven otras sesiones (F10/F12/F0-SEC):
TZ=UTC            npx jest src/__tests__/services/f0Reg src/lib/services/crm src/lib/utils src/__tests__/guardrails.test.ts --silent
                  → 147 suites verdes, 1 fallida (guardrails: 2 casos, `verticales/[id]` en la allow-list que el tester F0-SEC
                    estaba editando + NUL en f12Misc.test.ts de otra sesión); 2886/2889 (1 skipped preexistente)
TZ=America/Bogota (mismo comando)
                  → 145 suites verdes, 5 fallidas, TODAS ajenas y modificadas en los últimos minutos por otras sesiones
                    (f10WonCloseF11, f10Round2Tester, f10PaymentLinkAmount, f12Misc; guardrails NUL); 2889/2915
# Relanzado al cerrar (estado final del árbol):
TZ=UTC            npx jest src/__tests__/guardrails.test.ts src/lib/services/crm --silent → 145 suites, 2857/2859: guardrails 83/83 verde;
                    1 fallo en f10Round2Tester.test.ts (modificado por la sesión F10)

# Suites REG (línea base + nueva), ambas zonas
TZ=UTC            npx jest src/__tests__/services/f0Reg src/lib/services/__tests__/f0RegTester src/lib/services/__tests__/aiCostService \
                    src/lib/services/crm/__tests__/aiUsageStats src/app/api/crm/config/__tests__ src/lib/utils --silent → 10 suites, 187/187
TZ=America/Bogota (mismo comando)                                                                     → 10 suites, 187/187
TZ=UTC            npx jest src/__tests__/services/f0RegTesterR4.test.ts                              → 26/26
TZ=America/Bogota npx jest src/__tests__/services/f0RegTesterR4.test.ts src/__tests__/services/f0RegTesterR3 --silent → 3 suites, 63/63
npx eslint src/__tests__/services/f0RegTesterR4.test.ts                                              → 0 errores, 0 avisos

# (d) tsc
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "providers/test|f0RegTesterR[34]|aiCostService|utils/timezone|useCalendarSettings"
                  → 0 líneas. Total 15 errores, todos ajenos: electron/release/win-unpacked/** ×12 (copia empaquetada),
                    f10WonCloseSteps.test.ts, f12MiscCustomerSearch.test.ts, reportesSessionClient.f0secR3.test.ts (otras sesiones)

# (e) mutación: node <scratchpad>/mutate.js M1 … M7 ; … M8 … M14 → 14/14 muertos, «restaurado md5 ok: true» ×14

# md5 de los archivos del alcance (antes de mutar = después de restaurar = al cerrar; md5sum -c → OK ×4)
8a789dcfbfbd37f5c982a9ea040502b8  src/app/api/crm/config/providers/test/route.ts
e04ca789bca0b6f34afac09adf80e0da  src/lib/utils/timezone.ts
970b2e7c74ac458b4d807d5272a28172  src/lib/services/crm/aiCostService.ts
7179ef3e0d5224b32917bccdf5a1e2dd  src/components/calendario/configuracion/useCalendarSettings.ts
48c1146480ebc0ab0b29b87170846b44  src/__tests__/services/f0RegTesterR4.test.ts (nuevo)

# BD (MCP execute_sql, solo SELECT): ver tablas «Cotejo» y «Sondas»; estado de la org 120 intacto (3995, America/Bogota)
```

Temporales (copias `bak/`, `mutate.js`, `mut_*.json`, `tsc_r4.txt`, `icu_set.txt`)
en el scratchpad de la sesión, fuera del árbol. Un test-sonda temporal
(`zzProbeR4.test.ts`) se creó y borró dentro de la ronda; `git status` no lo
lista. En el árbol solo quedan la suite nueva y este informe.
