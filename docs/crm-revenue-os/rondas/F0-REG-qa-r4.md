# F0-REG — QA reviewer — Ronda 4 (2026-09-16)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos). Insumos: `F0-REG-builder-r4.md`,
`F0-REG-tester-r4.md` (9,4/10; 26 tests nuevos, 1 `it.failing`; 14/14 mutantes
muertos; migración 39 aplicada = `.sql` byte a byte), `F0-REG-qa-r3.md` (9,3;
obligatorios 1–2, opcionales 3–6), `F0-SEC-CD-qa-r3.md` (para situar el
`it.failing`). Verificaciones propias del QA en el repo, el 2026-09-16, sobre
`main` (HEAD `e3972da7`), sin ramas, sin commits, sin código tocado. Sin nombres
de organizaciones cliente (`org 120`). Migraciones 38/39/43/44 aplicadas según
builder y tester; este QA no tocó la BD (la ronda pedía verificación en repo).

Suite relanzada por el QA:
- `TZ=UTC npx jest src/__tests__/services/f0Reg src/__tests__/guardrails.test.ts --silent`
  → **4 suites, 146/146** (`f0RegTesterR3`, `f0RegTesterR3.routes`,
  `f0RegTesterR4`, `guardrails` 83/83; el `it.failing` pasa porque el hueco existe).

## Calificación: 9,6/10 → APROBADA (umbral 9,5)

| Dimensión (peso) | Nota | Justificación |
|---|---|---|
| 1. Funcionalidad / contrato (25 %) | 9,7 | Los 2 obligatorios y los 4 opcionales del QA r3 están cerrados y verificados archivo:línea (tabla abajo). El único contrato que sigue incompleto (query string en `POST /providers/test`) no es de esta fase: ver §«Sobre el `it.failing`». |
| 2. Seguridad (25 %) | 9,7 | Org ajena → 403 JSON **antes** de `checkRateLimit` y de `getProviderCredentials` (`test/route.ts:143-160`); `fn_resolve_timezone` sin SECURITY DEFINER, `search_path` fijo, EXECUTE solo `service_role` (mig. 39 `:85-108`); punto único de cobro intacto (`chargeAiCredits`/`refundAiCredits`), un `credits` explícito < 0,5 ya no produce log gratuito (`aiCostService.ts:222-227`). Resta: la query no inspeccionada (heredado de F0-SEC; sin salto de tenant) y la inversión de signo POSIX en `at time zone` (observación 3 del tester, inalcanzable hoy: el trigger 44 exige `pg_timezone_names`). |
| 3. Calidad de código (20 %) | 9,5 | El patrón del PUT y del POST de `providers/` ya es el mismo (`try/catch` → `{ ok:false, detail }`); la resolución de zona vive una vez en SQL (helper plpgsql, 3,75 ms medidos por el tester frente a ~60–75 ms). Resta: `planQuotaFallback`, `ensureAiSettingsFallback` y el respaldo de `aiUsageStatsService` siguen duplicando la regla ahora que 39 y 43 están en producción (retirada planificada, no de esta ronda); `UTC` → true pero `Etc/UTC` → false en `isSupportedTimeZone` (asimetría documentada, dirección segura). |
| 4. Pruebas (20 %) | 9,6 | 14/14 mutantes muertos, 5 solo por la suite nueva (M5, M12–M14 y el borde 1,5 → 2); ambas TZ; el hook tiene test por primera vez; 417 canónicos + 17 enlaces cotejados contra `pg_timezone_names`; rollback 39 verificado por md5 de los bloques literales. Resta: `next build` con el dev server parado (pendiente desde r1), concurrencia real sobre `decrement_ai_credits`, y el test del hook depende del despachador interno de React 19. |
| 5. Documentación (10 %) | 9,6 | Builder y tester con archivo:línea y comandos exactos; cabecera y `comment on` de la 39 al día; cabecera de la 44 corregida (`:22-29`, 7 líneas de comentario, 0 sentencias); `PROGRESS.md` anexado por el orquestador. Resta: la cabecera de la 39 menciona las POSIX pero no que `at time zone '+05:30'` invierte el signo. |

Media ponderada: 0,25·9,7 + 0,25·9,7 + 0,20·9,5 + 0,20·9,6 + 0,10·9,6 = **9,63 → 9,6**.

## Verificación de la tabla del tester (archivo:línea, comprobado por el QA)

| # QA r3 | Veredicto QA | Evidencia propia |
|---|---|---|
| 1 (obligatorio) org ajena en `POST /providers/test` → 403 | **Cerrado** | `src/app/api/crm/config/providers/test/route.ts:143` lee el JSON una vez; `:144-151` `readOrgBody(ctx, body)` en `try/catch` que convierte solo `OrgContextError` (el resto se relanza, `:150`); `:154-157` `safeParse` → 400; `:159` `checkRateLimit` después; `:164` credenciales al final. `null` y arrays: `claimedOrganizationsIn` devuelve `[]` (`organizationBody.ts:103,112`) y `safeParse` responde 400. Tests: `f0RegTesterR3.routes.test.ts:135,153`; `f0RegTesterR4.test.ts:134-233` (11 casos). |
| 2 (obligatorio) `fn_ai_usage_month` sin `pg_timezone_names` | **Cerrado y aplicado** | Mig. 39 `:85-108`: `fn_resolve_timezone` plpgsql `stable`, sin SECDEF, `set search_path to 'public'`, `nullif(btrim(p_tz), '')` → `'UTC'`, `perform now() at time zone v`, `exception when invalid_parameter_value then return 'UTC'`; `:110-111` revoke/grant; `:259-261` CTE `tz`. Rollback `:28-31`: dropea `fn_ai_usage_month` y `fn_comm_usage_month` **antes** que el helper (orden correcto). Cotejo árbol↔BD y `explain analyze` 3,752 ms: del tester (SELECT), no repetido aquí. |
| 3 (opcional) `isSupportedTimeZone` y enlaces IANA | **Cerrado** | `src/lib/utils/timezone.ts:65` regex `Region/City`; `:67-80` `set.has(tz) \|\| (IANA_REGION_CITY.test(tz) && set.has(resolved))`; JSDoc `:49-59` con `US/Eastern` → true, `EST` → false, `america/bogota` → false. La rama nueva no acepta nada que ICU no canonice a un nombre del set (`f0RegTesterR4.test.ts:284`). |
| 4 (opcional) `credits` explícito < 0,5 | **Cerrado** | `aiCostService.ts:105-109` JSDoc; `:222-227` `if (input.credits != null && credits < 1) throw new RangeError(...)` antes de `resolveClient()` (`:228`). El default (`credits` ausente o `null`) sigue en `defaultCreditsForUnits` (≥ 1). |
| 5 (opcional) orden de escritura del hook | **Cerrado** | `useCalendarSettings.ts:107-119`: `organizations.update({ timezone })` → `throw` si `tzError` → `invalidateTimezoneCache`; `organization_settings` desde `:122`. Test del tester `f0RegTesterR4.test.ts:407-455` (5 casos, M12–M14 muertos). |
| 6 (cosmético) cabecera de la 44 | **Cerrado** | Mig. 44 `:22-29`; `git diff --stat` = 7 inserciones / 3 borrados, todo comentario. |

## Sobre el `it.failing` (`f0RegTesterR4.test.ts:235`): es de F0-SEC, no de esta fase

Hecho verificado: `readOrgBody` con la sobrecarga síncrona (`organizationBody.ts:213`,
valor ya parseado) no mira la query; solo `readFromRequest` (`:153-161`) la comprueba.
`grep` sobre `src/app/api/**` (sin tests): **106** llamadas con `Request` y **37** con
un valor ya parseado (`readOrgBody(ctx, body|raw|…)`), entre ellas `providers/test`
(`:145`) y `providers` PUT (`:91`). No es un salto de tenant: ninguna ruta lee la
organización de la query y la efectiva es siempre la de la sesión
(`organizationBody.ts:27-30`). Es cobertura incompleta de la promesa de la cabecera
del módulo («si el body (o la query) trae OTRA organización → 403»).

Dónde pertenece: `organizationBody.ts` es el punto único de F0-SEC C+D, aprobado en
`F0-SEC-CD-qa-r3.md` (9,5), que **ya lo dejó escrito** como límite conocido («la query
de esas dos rutas no se inspecciona (sobrecarga síncrona; QA r2 §7, opcional)», `:104`) y
el tester CD r3 lo documenta en su S5. Con 37 rutas afectadas y no 2, conviene
**abrirlo como deuda en F0-SEC**, junto a sus pendientes (A) `HANDLER_RE` y (B) `getAll`
en `claimedOrganizationsIn`: (C) que la sobrecarga síncrona acepte un `url`/`searchParams`
opcional (o que `readOrgBody(ctx, body, { url: request.url })` reutilice
`assertNotForeign(..., 'query')`), con un guardarraíl que impida llamar a la sobrecarga
síncrona sin pasar la query en un handler con `request`. Coste: una tarde. No resta a
F0-REG: la ruta de esta fase cumple exactamente el contrato del punto único tal como F0-SEC
lo aprobó. Cuando F0-SEC lo cierre, el `it.failing` de `f0RegTesterR4.test.ts:235` se pondrá
rojo y hay que pasarlo a `it` (dejarlo anotado en el encargo de F0-SEC).

## Observaciones del tester: veredicto

1. `Etc/UTC` → false: confirmado por lectura (`timezone.ts:74` solo especial-casea `UTC`;
   `Etc/UTC` resuelve a `UTC`, que no está en `supportedValuesOf`). Dirección segura, la BD
   lo aceptaría. Para el 10: `if (tz === 'UTC' || tz === 'Etc/UTC') return true` o incluir
   `resolved === 'UTC'` en la rama del enlace. Opcional.
2. `btrim` no recorta `\t`/`\n`: inalcanzable (el trigger 44 canoniza con el mismo `btrim`
   y Node valida antes). Sin acción.
3. POSIX con signo invertido en `at time zone`: inalcanzable hoy por el trigger 44. Para el
   10, una línea en la cabecera de la 39 (`:56-58`) y, si algún día `p_tz` llega de otra
   fuente, `if v !~ '^[A-Za-z]' then return 'UTC'` antes del `perform`. No requiere
   migración ahora.
4. `stash@{0}` de otra sesión y mutantes de F0-SEC en paralelo: higiene del repositorio,
   fuera del código de esta fase; las cifras del tester se tomaron tras la restauración.

## Fortalezas

- El 403 de org ajena llega antes de gastar cupo o resolver credenciales, y un error que
  no es `OrgContextError` no se disfraza de 403 (`test/route.ts:150`; test `:223`).
- La zona se resuelve una vez por llamada en plpgsql con `exception` acotada a
  `invalid_parameter_value`: nunca 22023, cualquier otra excepción se propaga.
- Rollback 39 en el orden correcto de dependencias y con el texto literal de las funciones
  originales (md5 iguales a los previos, verificado por el tester).
- `isSupportedTimeZone` acepta los enlaces IANA que Postgres reconoce sin aceptar nada que
  ICU no canonice a un nombre del set; el trigger 44 sigue siendo la última palabra.

## Qué falta para el 10 (rondas posteriores, ninguna bloquea el cierre)

1. Retirar `planQuotaFallback`, `ensureAiSettingsFallback` y el respaldo de
   `aiUsageStatsService` ahora que 39 y 43 están en producción (una sola regla del cupo).
2. `npx next build` con el dev server parado (pendiente desde r1; `tsc` limpio en el alcance).
3. Concurrencia real (dos conexiones) sobre `decrement_ai_credits` / `fn_provision_ai_settings`.
4. Deuda para F0-SEC (C): query string en la sobrecarga síncrona de `readOrgBody` (37 rutas).
5. Menores: `Etc/UTC` en `isSupportedTimeZone`; nota de signo POSIX en la cabecera de la 39;
   migrar el test del hook a un renderer cuando el repo lo tenga.
6. Arrastrados desde r2: `refundCommCredits`, auditoría de deriva de saldo, Vault para
   `provider_configs.credentials`, migrar los 11 llamadores V3 de `consumeAICredits`,
   `offsetMinutesToISO(0)` → `+00:00`.

## Veredicto

**Aprobada, 9,6/10.** F0-REG cierra: credenciales server-only, punto único de cobro con
saldo comprobado antes del proveedor y cobro después, regla dura 5 en `providers/test` y
`providers` PUT, migraciones 38/39/43/44 aplicadas con rollbacks verificados. El único
`it.failing` es deuda de F0-SEC (punto único `organizationBody.ts`) y se abre allí.
