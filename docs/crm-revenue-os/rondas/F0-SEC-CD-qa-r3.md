# F0-SEC — Sub-partes C (org del body → 403) y D (verify/ws/rate limit) — QA, ronda 3

Fecha: 2026-09-16. Rama `main` (`e3972da7`), sin ramas, sin commits, sin editar código: solo
lectura, ejecución y este informe. Insumos: `F0-SEC-CD-builder-r3.md`, `F0-SEC-CD-tester-r3.md`
(9,3/10; 21 mutaciones, 20 muertas, 1 superviviente), `F0-SEC-CD-qa-r2.md` (obligatorios 1–7),
`src/lib/security/__tests__/testerR3CD.f0sec.test.ts` (81 tests). Cada hallazgo del tester se
verificó leyendo el archivo y la línea; el md5 de los 5 archivos de producción del alcance
coincide con el que declara el tester en «Ninguna mutación viva»
(`organizationBody.ts 7bb00213…`, `rateLimit.ts 7ef5ee3d…`, `orgContext.ts 3bcc367d…`,
`attachments/route.ts 9be93ea3…`, `transcribe/route.ts f5a8d6dd…`).

Contexto ajeno, no cuenta contra esta fase: el `import { readOrgBody }` metido dentro de otro
`import {` en `crm/health/[customerId]/route.ts:4` y `crm/onboarding/templates/route.ts:4`
(commit `328f1f73`, otra sesión) **ya está corregido en el árbol** (sin commit): las dos rutas
tienen la línea 3 como import propio y el `import {` multilínea empieza en la 4. No hizo falta
`--testPathIgnorePatterns` ni un tsconfig acotado.

## Calificación: **9,5 / 10** — APROBADO (umbral 9,5)

| Dimensión | Peso | Nota | Por qué |
|---|---|---|---|
| Funcionalidad / contrato (regla dura 5 en todos los handlers) | 25 % | 9,5 | `STRICT_ALLOWLIST` **vacía** (`guardrails.test.ts:260-265`): los 180 handlers de escritura de `crm/**` y `ai-assistant/**` resuelven la org por sesión y llaman al punto único. Las dos rutas multipart devuelven 403 `FOREIGN_ORGANIZATION` con `code` (`attachments/route.ts:102-121`, `transcribe/route.ts:77-93`). `claimedOrganizationsIn` evalúa las 4 claves y `''`/espacios cuentan como ausente por clave (`organizationBody.ts:88-118`). Resta: clave repetida en query/form solo mira el primer valor (§2). |
| Seguridad (regla dura 6, fail-closed) | 30 % | 9,6 | La org efectiva siempre sale de la sesión (`organizationBody.ts:27-30`, nunca se usa el valor del body). RPC de permisos que lanza/rechaza/expira → `false` + `warn` (`orgContext.ts:320-334`); `withOrg({admin})` → 403, nunca 500. Rate limit fail-closed y atómico: el único `await` del camino es `store.hit` (`rateLimit.ts:140-145`), store que falla → bloquea (`:146-150`), clave ausente → bloquea (`:152-156`). `fn_rate_limit_hit` verificada por el tester dentro de una transacción revertida. Resta: la RPC de permisos no tiene presupuesto de tiempo propio (§3, observación: la plataforma la corta en 504, no concede acceso). |
| Calidad de código (punto único, regla 7) | 15 % | 9,4 | `persistentCount` retirado: fuera de `RateLimitOptions` (`rateLimit.ts:37-42`), solo queda en la cabecera explicando por qué (`:14-18`); `grep` fuera de tests = 1 línea de comentario. `offendingHandlers(content, strict)` extraída y reutilizada por el `beforeAll` y por los tests de muestra. Resta (fuera del alcance, legacy): 8 duplicados inline del predicado fuera del CRM (QA r2, opcional). |
| Pruebas (guardarraíl real, mutaciones, TZ) | 20 % | 9,2 | Ejecutado: `npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/utils` → **15 suites, 478 tests verdes** (49 s); `TZ=America/Bogota` sobre `organizationBody` + `rateLimit` → 38 verdes. 0 `it.failing` reales (las 2 apariciones son comentarios de cabecera). 20/21 mutaciones muertas, incluidas las 6 «quitar `readOrgBody`» que en r2 sobrevivían y las 4 de `rateLimit`. El superviviente G7b **no es equivalente** (§1): el guardarraíl 5 no ve `export { POST } from '…'`. |
| Documentación | 10 % | 9,5 | FASE-00 sin nombres de rol (`:36`, `:1436`), estado real de la migración (`:1084`: APLICADA, pendiente `RATE_LIMIT_STORE=db`), `persistentCount` retirado (`:785`, `:1232`). Los tres informes de r3 son coherentes entre sí y con el árbol. Resta: dejar escrito en la cabecera de `organizationBody.ts` el límite de la clave repetida (§2) hasta que se cierre. |

Media ponderada: 9,5·0,25 + 9,6·0,30 + 9,4·0,15 + 9,2·0,20 + 9,5·0,10 = **9,46 → 9,5**.

Veredicto: **aprobado**. Los 7 obligatorios del QA r2 están cerrados con el cambio en el sitio
exacto que se pidió, y cada uno tiene un test que lo mata bajo mutación. Ninguno de los dos
huecos que restan permite escribir en otra organización ni conceder acceso; los dos afectan a la
mitad «se registra» del contrato o a la garantía de no reincidir, y cada uno se cierra con una
línea. No justifican una ronda r4 completa: van en «para el 10» y pueden entrar en el commit de
cierre (con un test cada uno) sin volver a pasar por tester.

## Verificación ejecutada

```
npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/utils
  → Test Suites: 15 passed, 15 total · Tests: 478 passed, 478 total · 49.4 s

TZ=America/Bogota npx jest src/lib/security/__tests__/{organizationBody,rateLimit}.test.ts
  → Test Suites: 2 passed · Tests: 38 passed

grep -rn "it.failing\|test.failing" src/lib/security/__tests__ src/app/api/__tests__
  → 2 apariciones, ambas en comentarios de cabecera (testerR2CD:6, testerR3:9)

grep -rnE "^export\s*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE)\b[^}]*\}\s*from" src/app/api --include=route.ts
  → 1: crm/contracts/webhook/route.ts:11 (reexporta el webhook firmado de Documenso: legítimo)

git stash list → stash@{0} (WIP on main: e3972da7); git show stash@{0}:src/lib/security/rateLimit.ts | sed -n 137p
  → `if (p.count > p.limit + 1) …`  (la mutación R4 del tester sigue dentro del stash; el árbol está limpio)
```

## Hallazgos verificados (archivo:línea)

### Obligatorios del QA r2 — los 7 cerrados

| # | Punto | Verificado en |
|---|---|---|
| 1 | 403 en multipart | `attachments/route.ts:102-121`: `formData()` en su `try` → 400 `BAD_REQUEST`; `readOrgBody(ctx, form, { route })` fuera, con `catch instanceof OrgContextError` → `err.statusCode`/`err.code`. `transcribe/route.ts:77-93` idem. Integración: `orgBodyRoutes.f0sec.test.ts:169-211` (403 + `warn` con `route` + STT no invocada). |
| 2 | Helper local acotado | `guardrails.test.ts:372-386`: `nextTopLevel` = `TOP_LEVEL_RE` con `^` → `\n`; el cuerpo del helper acaba en `min(siguiente declRe, siguiente línea de nivel superior)`. Test de muestra `:520-546`. Mutaciones G1–G6 y G9 muertas (tester). |
| 3 | `isPlaceholderCredential` fuera de `WEBHOOK_RE` | `guardrails.test.ts:331-333` (solo verificaciones de firma). Test `:548-558`; G8 muerta. |
| 4 | Todas las claves; vacío por clave | `organizationBody.ts:89-91` (`isBlank`), `:102-118` (`claimedOrganizationsIn`, objeto y `ParamsLike` sin `has()`), `:136-151` (`assertNotForeign` itera y registra `key`). O1–O5 muertas. |
| 5 | RPC que lanza → deniega | `orgContext.ts:320-334`. O6/O7 muertas. |
| 6 | `persistentCount` retirado | `rateLimit.ts:37-42` (sin la opción), `:140-145` (único `await`). R1–R4 muertas. |
| 7 | FASE-00 | `:36`, `:785`, `:1084`, `:1232`, `:1436` leídas: sin nombres de rol, migración APLICADA, `persistentCount` retirado. |

### 1. [bajo · para el 10] Guardarraíl 5 no ve `export { POST } from '…'` — mutante G7b, NO equivalente
Confirmado en `guardrails.test.ts:336`: `HANDLER_RE = /^export\s+(?:const|async\s+function|function)\s+(GET|POST|…)/`.
Un `route.ts` que reexporte handlers no produce ningún `Handler` en `splitHandlers` (`:341-356`),
`offendingHandlers` devuelve `[]` (`:409-433`) y el archivo pasa aunque el destino no tenga
sesión ni `readOrgBody`. **No es equivalente**: el comportamiento observable del guardarraíl
cambia (verde donde debería ser rojo) y el patrón ya existe en el repositorio
(`crm/contracts/webhook/route.ts:11`, legítimo porque el destino está bajo `crm/webhooks/`).
Es un hueco de la garantía de no reincidir, no del código de producción: hoy 0 rutas lo
explotan. Arreglo de una regla en ámbito estricto: tratar
`^export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]` como ofensor
salvo que el destino case con `/crm\/webhooks\//`; test de muestra con `content` sintético
(`export { POST } from './handler'` → `['POST']`; `from '@/app/api/crm/webhooks/x/route'` → `[]`).

### 2. [bajo · para el 10] Clave repetida en query/form: solo se inspecciona el primer valor
Confirmado en `organizationBody.ts:105-110`: en `ParamsLike` se usa `source.get(key)`, que en
`URLSearchParams`/`FormData` devuelve el primer valor. `?organization_id=120&organization_id=999`
pasa sin registro (test «DOCUMENTADO» `testerR3CD:206-215`). Ninguna ruta usa el valor del
body/query para la organización (`organizationBody.ts:27-30`), así que no hay escritura cruzada;
se esquiva la mitad «se registra». Arreglo: en `claimedOrganizationsIn`, si
`typeof source.getAll === 'function'`, iterar `getAll(key)` y añadir cada valor no vacío
(`ParamsLike` gana `getAll?(name): unknown[]`); el test «DOCUMENTADO» pasa a esperar 403 con
`key: 'organization_id'`.

### 3. [observación] `hasOrgAdminOrPermission` sin presupuesto de tiempo propio
`orgContext.ts:326`: una RPC que nunca resuelve deja la promesa pendiente; en Vercel la corta
`maxDuration` (504). No concede acceso (sigue siendo fail-closed en efecto), pero no es «deniega
y registra». Opcional: `Promise.race` con tope (5 s) que caiga en el mismo `warn` + `false`.
No bloquea.

### 4. [observación] El 403 de `attachments`/`transcribe` consume cupo del rate limit
`attachments/route.ts:81` y `transcribe/route.ts:60`: `checkRateLimit` se evalúa antes de leer
el formulario, así que 10 rechazos 403 seguidos → el 11.º es 429. Coherente con «el límite
protege el coste de leer 20/25 MB» y con la cabecera de `rateLimit.ts:23-27` (lo que NO
consume cupo es una petición *bloqueada por el propio limiter*, no un 403 posterior). Se deja
escrito; no es un fallo. La query de esas dos rutas no se inspecciona (sobrecarga síncrona;
QA r2 §7, opcional).

### 5. [higiene del repositorio, fuera del código] `stash@{0}` conserva la mutación R4
Verificado: `git show stash@{0}:src/lib/security/rateLimit.ts | sed -n 137p` →
`p.count > p.limit + 1`. El árbol y el índice están limpios (md5 `7ef5ee3d…`, `sed -n 137p` =
`p.count > p.limit`). Es un stash de otra sesión (`WIP on main: e3972da7`, 01:23:36) que
capturó todo el árbol con la mutación viva. **Acción para quien lo posea**: `git stash drop`
tras confirmar que su contenido ya está aplicado; si se vuelve a aplicar, revisar
`rateLimit.ts:137` (el test `rateLimit.test.ts:74-77` y `testerR3CD` S4 lo pondrían en rojo,
pero mejor no depender de eso).

### Confirmado como correcto (sin acción)
- Punto único: `assertNotForeign` (`organizationBody.ts:136-151`) es el único sitio que lanza
  `FOREIGN_ORGANIZATION`; `readOrgBody` sobrecarga `Request` / valor parseado (`:213-218`);
  `claimedOrganizationIn` conservada como azúcar (`:125-127`).
- Guardarraíl 5: `inlineAliases` resuelve `export const POST = withOrg(handler)` (`:393-404`);
  `usesHelper` exige llamada o referencia (`:389-391`); `crm/webhooks/**` excluido por diseño
  con motivo (`:455-459`); `ENOENT` tolerado (`:447-452`); test «allow-list no obsoleta» verde
  con la lista vacía.
- Rate limit: validación fail-closed (`rateLimit.ts:119-133`), «evaluar todo, luego registrar»
  (`:135-137`, `:159-176`), `Math.max(p.count, h.count)` (`:157`).
- Migración `rate_limit_buckets`: APLICADA (verificada por el tester con SELECT: RLS on, 0
  políticas, EXECUTE solo `service_role`). Pendiente de despliegue, no de código:
  `RATE_LIMIT_STORE=db` en Vercel.

## Qué falta para el 10 (no bloquea; recomendado en el commit de cierre, con un test cada uno)

| # | Archivo | Cambio | Test |
|---|---|---|---|
| A | `src/__tests__/guardrails.test.ts:336-356` | Regla de reexportación en ámbito estricto (§1): `export { POST\|PUT\|PATCH\|DELETE … } from '…'` es ofensor salvo destino bajo `crm/webhooks/`. | Muestra sintética → `['POST']`; con destino `crm/webhooks/**` → `[]`. Sonda G7b del tester → rojo. |
| B | `src/lib/security/organizationBody.ts:61-64, 105-110` | `getAll?` en `ParamsLike`; `claimedOrganizationsIn` recorre todos los valores de cada clave (§2). | `testerR3CD:206` deja de ser «DOCUMENTADO»: `organization_id=120&organization_id=999` → 403 + `warn` con `key: 'organization_id'`; `organizationBody.test.ts` idem con `FormData`. |
| C | `src/lib/utils/orgContext.ts:326` | Opcional: tope de tiempo (`Promise.race`, 5 s) → mismo `warn` + `false` (§3). | `testerR3CD:255` pasa de «queda pendiente» a `false` + `warn` en < tope. |
| D | Despliegue | `RATE_LIMIT_STORE=db` en Vercel; `git stash drop` de `stash@{0}` por su dueño (§5). | — |

## Veredicto

**Aprobado, 9,5 / 10.** F0-SEC sub-partes C+D cierran: regla dura 5 (b) «403 **y** registro» en
los 180 handlers de escritura de `crm/**` y `ai-assistant/**` con allow-list vacía, regla dura 6
fail-closed en permisos y rate limit, un solo punto de decisión y un solo mecanismo persistente,
20/21 mutaciones muertas y el superviviente acotado a una regla del guardarraíl. Los puntos A y B
son de una línea y conviene que entren en el mismo commit de cierre; C y D quedan como opcional
y acción de despliegue respectivamente.
