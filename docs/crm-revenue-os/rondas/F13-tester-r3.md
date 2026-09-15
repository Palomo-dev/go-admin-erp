# F13 — Equipo, cuotas y comisiones — Tester — Ronda 3 (2026-09-15)

Alcance: `PROGRESS.md` «F13 — Ronda 2 evaluada» (9,4/10: faltaban el contraste de «Cancelar» del
`ConfirmDialog` en oscuro, el estado de error del `SellerLeaderboardWidget` y la propuesta de RLS en
el repo) y «F13 — Ronda 3 construida» (`AlertDialogCancel` con variante oscura dentro de
`ConfirmDialog`; el ranking recibe `error` y `SellerSection` se lo pasa). Documento de fase:
`FASE-13-EQUIPO-COMISIONES.md`.

Archivos bajo prueba: `src/components/ui/{confirm-dialog,alert-dialog}.tsx`,
`src/components/inicio/widgets/**`, `src/components/inicio/sections/SellerSection.tsx`,
`src/components/finanzas/comisiones/**`, `src/lib/services/crm/{commissionAdminService,
commissionTransitions,quotaProgress,sellerDashboardModel,sellerDashboardService,f13RouteSupport,
salesTargetService}.ts`, `src/lib/security/organizationBody.ts`, `src/app/api/crm/{commissions,
sales-targets,seller-dashboard}/**`.

Método: suites existentes de la fase (con `TZ=UTC` y `TZ=America/Bogota`), una suite nueva del
tester (`src/lib/services/crm/__tests__/f13Round3Tester.test.ts`, 43 casos, **queda en el repo**),
cálculo WCAG del contraste con los valores hexadecimales reales de Tailwind 3 (`gray-*`), render SSR
real del widget con `react-dom/server` (arnés en el scratchpad, fuera del repo), 4 mutaciones sobre los
dos cambios de la ronda (copia → mutar → suite → restaurar con md5 verificado), `tsc` filtrado, y
9 lecturas por el MCP de Supabase (solo `SELECT`, sin escrituras). Nada de lo que sigue es un veredicto:
eso lo decide el qa-reviewer.

## Resumen de pruebas
- Casos ejecutados: **330** = 194 (12 suites existentes de la fase) + 43 (suite nueva del tester)
  + 67 (`guardrails.test.ts`) + 5 contrastes + 6 estados del widget renderizados + 4 mutaciones
  + 9 hechos de BD + 1 `tsc` acotado + 1 barrido de consumidores del `ConfirmDialog`.
- Pasaron: **324**.
- Fallaron: **6** = 3 huecos del servidor (documentados como `it.failing` en la suite nueva, para que
  el constructor los voltee) + 1 mutante superviviente + 1 contraste no textual del borde (< 3:1,
  preexistente en el kit) + 1 rojo de `guardrails` **ajeno** a F13.

Comandos y resultados exactos:

| Comando | Resultado |
|---|---|
| `npx jest src/lib/services/crm/__tests__/f13 src/components/finanzas/comisiones/__tests__ src/app/api/crm/commissions/__tests__ src/app/api/crm/sales-targets/__tests__ src/components/inicio/widgets/__tests__` (antes de la suite nueva) | 1.ª ejecución: **2 failed, 192 passed** (ver Observación A); 2.ª ejecución, mismo comando, 20 min después: **12 suites, 194/194** |
| Mismo comando con la suite nueva incluida, `TZ=America/Bogota` | **13 suites, 237/237** |
| `npx jest src/lib/services/crm/__tests__/f13Round3Tester.test.ts` | **43/43** (40 verdes + 3 `it.failing` que fallan como se espera) |
| `npx jest src/__tests__/guardrails.test.ts` | **66/67**; el rojo es «Carga de páginas tolerante… el inicio espera sucursal y permisos» (`src/app/app/inicio/page.tsx` sin `permissionsLoading`, modificado por el dueño a las 16:00, WIP declarado en `SellerSection.tsx`): ajeno a F13 |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` filtrado por `comisiones|commission|sales-targets|seller|SellerSection|confirm|inicio/widgets|quotaProgress|f13|organizationBody` | **0 errores en la fase**; 14 en total, todos ajenos (`referralsService.ts` ×9, `stripePaymentLinkService.ts` ×2, `FormularioEdicionProducto.tsx` ×2, `deliveryIntegrationService.ts` ×1) |

### Lo que faltaba en r2, verificado
**(a) Contraste de «Cancelar»/«No, volver» en oscuro.** `ConfirmDialog` añade a `AlertDialogCancel`
`dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700` (mismo patrón que
la variante `outline` de `button.tsx`). Con los hex de Tailwind 3 (`gray-200 #e5e7eb`, `gray-700
#374151`, `gray-800 #1f2937`, `gray-900 #111827`):

| Estado | Par | Ratio | WCAG AA texto (≥ 4,5:1) |
|---|---|---|---|
| Oscuro, reposo | gray-200 sobre gray-800 | **11,86:1** | cumple |
| Oscuro, hover | gray-200 sobre gray-700 | **8,33:1** | cumple |
| Oscuro, `disabled:opacity-50` | ≈ 4,43:1 | exento (1.4.3 excluye controles inactivos) |
| Claro | `#000` sobre blanco | 21:1 | cumple |
| Antes (r2) | `#000` heredado sobre gray-900 | 1,18:1 | no cumplía |

Por qué estaba a 1,18:1: `tailwind.config.js` **no define** `background`, `input`, `accent` ni
`muted`; `bg-background`, `border-input`, `hover:bg-accent` y `text-muted-foreground` del kit no generan
CSS, así que el botón heredaba `color: rgb(var(--foreground-rgb))` = negro de `globals.css`. La clase
`dark:` nueva no colisiona con nada en `twMerge` (variantes distintas) — comprobado en `cn`.

**(b) Estado de error del ranking.** Render SSR real (`renderToStaticMarkup`) de
`SellerLeaderboardWidget` en 6 estados:

| Estado | Resultado |
|---|---|
| `error` + `leaderboard: null` | tarjeta «Ranking del equipo» con `<p role="status">No se pudo cargar: …</p>` |
| `error` + `leaderboard: undefined` (primera carga fallida) | ídem |
| `error` + `loading` + datos viejos | error, sin cifras viejas (no se llama al modelo) |
| sin error + `null` (rol sin ranking) | no se pinta (correcto) |
| sin error + `[]` | «Aún no hay miembros activos con ventas este mes.» |
| sin error + `loading` + `undefined` | no se pinta (evita salto de layout) |

`SellerSection.tsx` pasa `error={error}` a los cuatro widgets (línea 48 incluida). Verificado además
que `useSellerDashboard` no vacía `data` en error, y que `WidgetCard` sustituye el contenido por el
error: ningún widget enseña cifras viejas mientras dice «No se pudo cargar».

**(c) Consumidores del `ConfirmDialog`.** Hoy son **25** (los 22 de la ronda + `PartnerDealList`,
`PartnersPage`, `TierEditor`, `ReferidosPage`, `ReferralProgramsSheet` de F12 menos solapes). La
interfaz solo añadió la prop opcional `onCloseAutoFocus`; ninguno pasa `className` ni sobreescribe el
`Cancel`, así que los 25 reciben la misma variante. Sin regresión posible por contrato.

## Fallos encontrados

### 1. [medio] `POST /api/crm/sales-targets` con `target_amount: true` responde 201 y crea una cuota de 1
`validateQuotaInput` hace `Number(raw.target_amount)` cuando no es número; `Number(true) === 1` pasa
`isFinite && > 0`. Reproducir: `f13Round3Tester.test.ts` → «HUECO: POST cuota con target_amount: true»
(`it.failing`) y la «evidencia» contigua (verde: `insert.row.target_amount === 1`). Esperado: 400 con
`field: 'target_amount'` y sin escritura. Obtenido: 201 y `INSERT` con `target_amount: 1`. Los
otros nueve valores basura (`-1`, `0`, `'abc'`, `'-5'`, `'1e400'`, `null`, `[]`, `{}`, `'NaN'`) sí dan
400. Arreglo obvio: exigir `typeof === 'number'` o rechazar booleanos antes de `Number()`.

### 2. [medio] El motivo de `reject`/`clawback` no tiene tope en el servidor
`ReasonDialog` impone `REASON_MAX = 500`; las rutas `[id]/reject` y `[id]/clawback` solo hacen
`trim()`. `commissions.notes` es `text` sin límite (hoy máx. 68 caracteres en producción). Reproducir:
`POST /api/crm/commissions/c-1/reject {reason: 'x'.repeat(10000)}` → **200** y `notes` de 10 000
caracteres («evidencia del hueco» verde; el `it.failing` espera 400). Esperado: 400 por encima de
`REASON_MAX` (la constante debería vivir en el servicio, como `NOTES_MAX` de F2, y la UI importarla).

### 3. [bajo] `PATCH /api/crm/sales-targets/[id]` con `target_currency: null` responde 200 sin efecto
`validateQuotaPatch` cuenta `null` como «enviado» (`!== undefined`), `validateQuotaInput` lo trata
como ausente, el patch sale `{ target_currency: undefined }` y `updateSalesTarget` solo escribe
`updated_at`. Reproducir: cuota en EUR (base COP) + `PATCH {target_currency: null}` → 200, sigue en
EUR, `UPDATE` con únicamente `updated_at` (test «evidencia del hueco» verde; el `it.failing` espera 400
o vuelta a la base). Esperado: 400 (`field: 'target_currency'`) o reset a la moneda base; nunca un 200
que no hace nada.

### 4. [bajo] Mutante superviviente: quitar `!error &&` de la guarda del ranking reintroduce el hueco de r2 y ninguna suite lo ve
Mutación M3 en `SellerLeaderboardWidget.tsx`: `if (!error && (leaderboard === null || …)) return null`
→ `if ((leaderboard === null || …)) return null`. Con la primera carga fallida (`data` null →
`leaderboard` undefined) el ranking vuelve a desaparecer mientras los otros tres dicen «No se pudo
cargar». Resultado: `comisiones/__tests__` + `widgets/__tests__` **32/32 verdes con el mutante**. El
test de ronda 3 (`f13Widgets.test.ts` «ronda 3 — SellerLeaderboardWidget recibe y pinta el error…»)
es una expresión regular sobre el fuente (`error?:` en las props y `error={error}` en las etiquetas);
no ejecuta el componente. Las otras tres mutaciones sí mueren (M1 quitar `dark:text-gray-200` → 1 rojo;
M2 `SellerSection` sin `error` al ranking → 1 rojo; M4 el widget sin `error` a `WidgetCard` → 1 rojo).
Causa de fondo: `jest.config` solo transpila `.ts` (`testMatch: **/*.test.ts`, sin `jsx`); un test de
render con `react-dom/server` no puede importar el `.tsx`. Lo verifiqué fuera de jest con un arnés
`ts.transpileModule` + `renderToStaticMarkup` (tabla de (b)); ese arnés no está en el repo.

### 5. [bajo] Con error, un vendedor sin ranking ve una tarjeta «Ranking del equipo» que nunca ve en verde
El servidor manda `leaderboard: null` a los roles sin permiso; con `error` el widget se pinta igual
(decisión comentada en el código para no dejar cifras viejas). Efecto: un vendedor ve cuatro tarjetas en
error, una de ellas de un ranking que no existe para él, y cuando el error se va desaparece. Esperado:
si `data?.leaderboard === null` (respuesta previa válida sin ranking), seguir oculto también en error;
pintar solo cuando no se sabe (`undefined`). Evidencia: fila 1 de la tabla de (b).

### 6. [bajo · preexistente en el kit] El borde del `Cancel` no llega a 3:1 (WCAG 1.4.11) en ningún tema
Oscuro: `gray-700` sobre `gray-900` = **1,72:1**; fondo `gray-800` sobre `gray-900` = 1,21:1. Claro:
borde por defecto `#e5e7eb` sobre blanco = 1,24:1 (`border-input` no genera CSS, ver (a)). El texto
identifica el control, así que no es bloqueante, pero el botón «flota». Fuera del alcance de la fase:
es `alert-dialog.tsx` y los tokens ausentes del `tailwind.config.js`.

## Observaciones de proceso (sin severidad)
- **A. Rojo transitorio no reproducible.** En la primera ejecución fallaron `f13Round2Routes.test.ts`
  R2-5 y `f13Round2Tester.test.ts` R2T-2 con `pending_total: 11444.54` (= 100 COP + 11 344,54 USD, la
  mezcla de monedas de r1) y `accrued_total: 200` (incoherente con la función actual, que calcula
  `accrued = pending + paid`). Ambas suites pasaron aisladas y el mismo comando completo dio 194/194
  20 minutos después. En ese intervalo `src/app/api/crm/commissions/route.ts` tenía mtime 17:20 y
  `SellerSection.tsx` cambió de md5 entre mi línea base (17:24:28) y 17:24:51 con contenido idéntico;
  hay un arnés de mutaciones de otra sesión (`f10_mutations.sh`, `mut.py`) vivo sobre el mismo árbol.
  Lo más probable es una mutación ajena viva sobre `commissionTransitions.ts` en el momento de la
  primera ejecución. Consecuencia: **los resultados de esta fase deben leerse con md5 de la zona antes
  de cualquier commit**, como ya pedía r2.
- **B.** Mi archivo temporal `zz_dbg_tester.test.ts` (creado y borrado en < 10 s para depurar A) fue
  visto por el guardarraíl 17 de otro tester (`ENOENT`) — el caso es sensible a archivos transitorios.
  Queda borrado; no hay temporales míos en el repo.
- **C.** Hechos de BD verificados por MCP (solo lectura): `commissions` 229 filas, todas `accrued`,
  0 negativas, 0 con `currency` nula o rara, `notes` máx. 68; `sales_targets` 0 filas;
  `commission_amount numeric NOT NULL` **sin CHECK ≥ 0**; `sales_targets.target_amount` **sin CHECK
  > 0**; `sales_targets.target_currency NOT NULL DEFAULT 'USD'` (la app usa la base de la organización;
  el default de la columna es engañoso pero inocuo mientras la ruta siempre lo rellene).

## Cobertura no probada / riesgos pendientes
- **Clic real en navegador** del `Cancel` en oscuro: no repetido esta ronda (el contraste está
  calculado a partir de las clases, y r2 ya validó el foco por coordenadas). Otro chat tiene un servidor
  de desarrollo en esta carpeta y este no puede alcanzarlo.
- **Los 129 usos directos de `<AlertDialogCancel>`** fuera del `ConfirmDialog` siguen a 1,18:1 en
  oscuro (r2 hablaba de 69 consumidores del kit): la ronda arregló el envoltorio, no la primitiva.
  Fuera de F13, pero es la misma deuda.
- **Propuesta de RLS por rol** de `sales_targets` (§5.1 del documento de fase): sigue **sin aplicar**;
  cualquier miembro puede `UPDATE/DELETE` por PostgREST directo. No probado en vivo (solo lectura).
- `GET` con `?organization_id=` ajeno en `commissions`, `sales-targets` y `seller-dashboard`: hoy se
  **ignora en silencio** (la sesión manda y no se filtra nada de la otra organización — 3 casos verdes
  en R3T-5), pero no responde 403 ni registra como sí hace `sales-targets/progress`. Regla dura 5 habla
  del body; queda como inconsistencia menor, no como fallo.
- `Intl.NumberFormat` con moneda inválida cae al `try/catch` de `formatCurrency` salvo en la rama
  `value == null`, que no tiene `try`: solo explotaría con `achieved_amount` nulo **y** moneda inválida
  a la vez; no encontré camino real.
- Suites `.tsx` sin render: mientras jest no transpile JSX, los guardarraíles de UI de la fase seguirán
  siendo regex sobre el fuente (fallo 4).

## Calificación de robustez (1-10, opinión técnica del tester)
**9,3/10** — Lo pedido en r2 está cerrado y medido (11,86:1 y 8,33:1; el ranking pinta el error y la
sección se lo pasa; 25 consumidores sin regresión posible por contrato), dinero y tenencia siguen
sólidos (carreras clawback/clawback y pay/reject → exactamente uno gana, 409 el otro; clawback sobre
cancelada → 409 sin escribir; ajena → 404; lotes de 201 → 400; query ajeno no filtra nada), y la
fase compila limpia. Lo que impide más: dos huecos de validación de entrada en rutas de dinero
(`true` → cuota de 1; motivo sin tope), un `PATCH` que responde 200 sin hacer nada, y un mutante que
demuestra que el guardarraíl del estado de error es solo textual.
