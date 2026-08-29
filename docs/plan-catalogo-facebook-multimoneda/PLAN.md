# Plan — Catálogo Facebook Multi-Moneda

> Fuente de verdad para la extensión del feed de catálogo de Facebook a múltiples
> monedas, reutilizando la integración existente con OpenExchangeRates y las
> monedas configuradas en el módulo `/app/app/finanzas/monedas`.
>
> **Estado:** IMPLEMENTADO Y APROBADO (Ronda 2: QA 9.6/10, Tester 9.5/10).
> Ver `PROGRESS.md` para el historial de rondas.
> **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`
> **Stack:** Next.js App Router · Supabase/Postgres · TypeScript estricto · shadcn/ui

---

## 1. Objetivo funcional

Permitir que el feed de catálogo de Facebook (`/api/facebook-feed`) se genere en
cualquier moneda activa de la organización (COP, MXN, CLP, USD, EUR, etc.),
convirtiendo los precios desde la moneda base de la organización usando las tasas
almacenadas por la integración existente con OpenExchangeRates.

### Requisito crítico — no romper lo que ya funciona

> **Hay tiendas en producción usando la URL actual del feed.** El feed sin el
> parámetro `currency` debe producir un CSV **byte-idéntico** al de hoy:
> misma moneda base, mismo `formatPrice` con `toFixed(2)`, mismo orden de
> columnas, mismo `Cache-Control`, mismos headers. **Cero cambios** en el path
> sin `currency`.

La multi-moneda es **opt-in**: solo se activa cuando la URL lleva
`&currency=CODE`. Sin ese parámetro, el código ejecuta exactamente la misma
rama que hoy. No se refactoriza `formatPrice` existente; se añade una función
nueva `formatPriceWithDecimals` que solo usa la rama multi-moneda.

### Requisitos no negociables

1. **Preservar byte-a-byte el feed actual** (sin `currency` en la URL).
   Esto incluye no "corregir" `formatPrice` para COP: si hoy sirve
   `100,000.00 COP`, sigue sirviendo eso. La corrección de decimales solo
   aplica cuando se pide explícitamente una moneda con `&currency=`.
2. Reutilizar `src/lib/services/openexchangerates.ts` y las tablas
   `currencies`, `organization_currencies`, `currency_rates` ya existentes.
3. No crear tablas nuevas salvo que sea estrictamente necesario (no lo es).
4. No exponer la API key de OpenExchangeRates ni datos privados en el feed público.
5. Soportar **todas** las monedas activas de la organización, no una lista hardcodeada.
6. Respetar los `decimals` de cada moneda **solo en la rama multi-moneda**
   (CLP/JPY/COP = 0; USD/MXN/EUR = 2).
7. Mantener el token revocable actual como mecanismo de autorización del feed.
8. La URL actual sin `currency` no cambia en absoluto — las tiendas existentes
   no necesitan tocar nada en Facebook Commerce Manager.

---

## 2. Hallazgos del análisis

### 2.1 Flujo actual del feed

```
UI (FacebookFeedDialog)
  → POST /api/facebook-feed/token { action: 'get' | 'regenerate' }
  → obtiene token desde organization_preferences.settings.facebook_feed_token
  → muestra URL: /api/facebook-feed?org_id=X&token=Y

Facebook Commerce Manager
  → GET /api/facebook-feed?org_id=X&token=Y
  → validateFeedToken(orgId, token)
  → generateFacebookFeedCSV(organizationId)
       · lee organization_currencies.is_base=true → currency (default 'COP')
       · lee organization_domains (host primario verificado)
       · lee organizations.name
       · pagina products (padres activos, no service, no deleted)
       · consulta hijos (variantes) en batches de 200
       · consulta product_prices, product_images, stock_levels, product_tags
       · buildFacebookRow(...) con currency + webDomain + organizationName
       · formatPrice(amount, currency) → amount.toFixed(2) + separador miles + " " + currency
       · buildCSV(rows) usando FACEBOOK_CATALOG_HEADERS
  → responde text/csv, Content-Disposition inline, Cache-Control public max-age=3600
```

Archivos involucrados:

| Archivo | Rol |
|---|---|
| `src/components/inventario/productos/FacebookFeedDialog.tsx` | UI del dialog que muestra la URL |
| `src/components/inventario/productos/ProductosPageHeader.tsx` | Menú "URL Feed para Facebook" |
| `src/components/inventario/productos/CatalogoProductos.tsx` | Orquesta el dialog |
| `src/components/inventario/productos/facebookCatalogExport.ts` | Export CSV client-side + helpers `getOrganizationCurrency`, `getOrganizationDomain`, `formatPrice`, `FACEBOOK_CATALOG_HEADERS` |
| `src/lib/services/facebookFeedService.ts` | Generación server-side del feed + gestión del token |
| `src/app/api/facebook-feed/route.ts` | Route handler GET del feed |
| `src/app/api/facebook-feed/token/route.ts` | Route handler POST del token |
| `src/lib/services/openexchangerates.ts` | Integración OpenExchangeRates + persistencia en `currency_rates` |

### 2.2 Esquema de base de datos relevante

#### `currencies` (catálogo global, 10 filas activas)

| Columna | Tipo | Notas |
|---|---|---|
| `code` | `char(3)` PK | AUD, BRL, CAD, CLP, COP, EUR, GBP, JPY, MXN, USD |
| `name` | `text` | |
| `symbol` | `text` | |
| `decimals` | `integer` | **CLP=0, COP=0, JPY=0, resto=2** |
| `auto_update` | `boolean` default `true` | |
| `is_active` | `boolean` default `true` | |

#### `organization_currencies` (multi-tenant)

| Columna | Tipo | Notas |
|---|---|---|
| `organization_id` | `integer` | parte de PK |
| `currency_code` | `char(3)` | parte de PK, FK a `currencies.code` |
| `is_base` | `boolean` default `false` | una sola por organización |
| `auto_update` | `boolean` default `true` | |

#### `currency_rates` (tasas diarias, base USD)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `code` | `varchar` | moneda destino |
| `rate_date` | `date` | |
| `rate` | `numeric` | unidades de `code` por 1 USD |
| `source` | `text` | `openexchangerates` |
| `base_currency_code` | `varchar` | siempre `'USD'` |
| `api_data` | `jsonb` | payload crudo opcional |

Última fecha con tasas: `2026-08-28`. Todas las monedas activas tienen tasa.

#### `organization_preferences` (jsonb settings)

| Columna | Tipo | Notas |
|---|---|---|
| `organization_id` | `integer` PK | |
| `settings` | `jsonb` | contiene `facebook_feed_token` |

#### `products` / `product_prices`

- `products.organization_id` filtra por tenant.
- `product_prices.price` y `product_prices.compare_price` son `numeric`, en la
  moneda base de la organización (la que tenga `is_base=true`).
- No hay columna de moneda en `product_prices`: se asume moneda base.

### 2.3 RLS relevante

- `products`: select para miembros de la organización + una policy `Allow anon
  select products` con `qual=true` (ancho, ya existente — el feed público
  depende de esto vía service_role, no de anon).
- `product_prices`: policy `Allow anon select product_prices` con `qual=true`.
- `currencies`: select pública (`qual=true`).
- `currency_rates`: select pública (`qual=true`).
- `organization_currencies`: select solo para miembros/owners.
- `organization_preferences`: select solo para miembros; all para admins/superadmins.

**Importante:** el feed usa `SUPABASE_SERVICE_ROLE_KEY` (sin RLS), por lo que
las policies no limitan la lectura del feed. El control de acceso público se
hace exclusivamente vía el token revocable en `organization_preferences`.

### 2.4 Servicio OpenExchangeRates

`src/lib/services/openexchangerates.ts` expone:

- `obtenerTasasDeCambio(base='USD')` — latest, con retry y `AbortSignal.timeout`.
- `obtenerTasasHistoricas(fecha, base='USD')` — histórico.
- `guardarTasasDeCambio(rates, fecha, source, apiTimestamp, baseCurrency)` —
  upsert en `currency_rates`.
- `actualizarTasasDeCambioGlobal()` — actualiza todas las `currencies.auto_update=true`.
- `actualizarTasasViaRPC()` — fallback por RPC.
- `obtenerMonedaBase(orgId)` — resuelve moneda base con 5 niveles de fallback.

La API key se lee de `process.env.NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY`.

### 2.5 Problemas detectados en el código actual

1. **`formatPrice` ignora `decimals`**: usa `toFixed(2)` siempre. Para CLP/JPY/COP
   produce valores como `9.261,30 CLP` que Facebook rechaza o muestra mal.
2. **Feed sin parámetro de moneda**: la URL solo lleva `org_id` y `token`. No hay
   forma de pedir el catálogo en otra moneda.
3. **No hay selector de moneda en `FacebookFeedDialog`**: el usuario no puede
   elegir la moneda del feed desde la UI.
4. **Conversión inexistente**: el feed asume que los precios ya están en la
   moneda base y los sirve tal cual. No convierte.

---

## 3. Diseño de la solución

### 3.1 Principios

- **Mínima superficie de cambio**: se extiende el feed existente, no se reemplaza.
- **Sin tablas nuevas**: se reutilizan `currencies`, `organization_currencies`,
  `currency_rates`, `organization_preferences`.
- **Tasas almacenadas, no en tiempo real**: el feed lee la tasa más reciente de
  `currency_rates` (ya persistida por `actualizarTasasDeCambioGlobal`). No
  consulta OpenExchangeRates en cada request del feed (evita exponer la API key
  y evita latencia/costos).
- **Conversión vía USD**: las tasas en `currency_rates` están base USD. Para
  convertir de moneda base `B` a moneda destino `D`:
  `precio_D = precio_B / rate_B * rate_D` donde `rate_X` = unidades de X por 1 USD.
- **Moneda destino validada contra `organization_currencies`**: solo se permite
  generar el feed en una moneda que la organización tenga configurada.
- **Decimales por moneda**: se respetan `currencies.decimals` al formatear.

### 3.2 Parámetro de moneda en la URL

Se extiende la URL del feed con un parámetro `currency` **opcional**:

```
/api/facebook-feed?org_id=123&token=abc&currency=MXN
```

- Si `currency` no está → comportamiento actual (moneda base de la organización).
- Si `currency` está → debe ser una moneda presente en `organization_currencies`
  para esa organización. Si no, `400` con error estructurado.
- El parámetro se valida contra la lista de monedas activas de la organización,
  no contra el catálogo global, para evitar exponer monedas que la org no usa.

### 3.3 Persistencia de la moneda por defecto (opcional)

Se guarda la última moneda seleccionada en
`organization_preferences.settings.facebook_feed_default_currency` para que el
dialog la recuerde entre sesiones. Esto **no** afecta la URL: la URL siempre
lleva `currency` explícito cuando no es la base. La preferencia es solo UX.

### 3.4 Conversión de precios (solo rama multi-moneda)

**Solo se ejecuta cuando la URL lleva `&currency=CODE`** y `CODE` ≠ moneda base.
Sin ese parámetro, el feed usa el flujo actual sin conversión y sin leer tasas.

Para cada producto con precio `P` en moneda base `B`:

1. Obtener `rate_B` y `rate_D` de `currency_rates` para la fecha más reciente
   donde ambas existan.
2. `P_D = P * (rate_D / rate_B)` — aritmética decimal, no float.
3. Redondear `P_D` a `currencies.decimals` de `D` usando
   `Decimal.round` (o `Math.round` con factor 10^decimals, controlando banker's
   rounding si es necesario — ver §3.5).
4. Formatear con separador de miles `,` y `decimals` decimales, seguido de
   ` ` y el código de moneda.

Ejemplo:
- P = 100.000 COP, base COP, destino MXN.
- `rate_COP = 3125.648631`, `rate_MXN = 16.966900`.
- `P_MXN = 100000 * (16.966900 / 3125.648631) = 542.876...`
- Redondear a 2 decimales (MXN): `542.88`.
- Formatear: `542.88 MXN`.

### 3.5 Aritmética decimal

JavaScript `number` es float64. Para montos grandes (CLP, COP) la precisión es
suficiente para catálogo (no para ledger), pero para evitar errores de
redondeo visibles se usará una de estas opciones (a decidir en implementación):

- **Opción A (preferida):** usar `Intl.NumberFormat` con `minimumFractionDigits`
  y `maximumFractionDigits` iguales a `decimals`, y `roundingMode: 'halfEven'`
  (soportado en Node 20+). Esto delega el redondeo al runtime.
- **Opción B:** calcular con `Number` y redondear manualmente con
  `Math.round(P_D * 10^decimals) / 10^decimals`. Aceptable para catálogo.
- **Opción C:** usar una librería decimal (`decimal.js`, `dinero.js`). Se
  descarta por ahora para no añadir dependencias.

Se recomienda **Opción A** por simplicidad y porque el proyecto ya usa Node 20+.

### 3.6 Manejo de tasas faltantes o stale

- **Tasa faltante para moneda destino:** el feed responde `503` con error
  estructurado `{"error":{"code":"RATE_UNAVAILABLE","message":"...","details":{"currency":"MXN"}}}`.
  No se sirve el feed con precios en moneda base si el usuario pidió otra.
- **Tasa faltante para moneda base:** esto no debería ocurrir (la base siempre
  tiene tasa 1 si es USD, o se obtiene del catálogo). Si ocurre, `503`.
- **Tasa stale:** se define un umbral configurable (default 72h). Si la tasa
  más reciente es más antigua, se sirve el feed igual pero se añade un header
  `X-Rate-Warning: stale` y `X-Rate-Date: YYYY-MM-DD`. No se bloquea el feed
  porque Facebook puede estar programado y un error 503 rompería la sincronización.
- **Organización sin monedas configuradas:** se usa el fallback existente
  (`obtenerMonedaBase`) y el feed se sirve en esa moneda. Si se pide `currency`
  explícito y no está en `organization_currencies`, `400`.

### 3.7 Formato de precio

**Función existente `formatPrice(amount, currency)` — INTACTA.** Sigue usando
`toFixed(2)` y se usa en la rama sin `currency` (feed actual). No se toca.

**Función nueva `formatPriceWithDecimals(amount, currency, decimals)` —
solo para la rama multi-moneda:**

```ts
function formatPriceWithDecimals(amount: number, currency: string, decimals: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(amount);
  return `${formatted} ${currency}`;
}
```

Esto garantiza que el feed sin `currency` sea byte-idéntico al actual.

---

## 4. Fases de implementación

### Fase 0 — Backend: conversión y formato (sin UI)

**Objetivo:** que `generateFacebookFeedCSV(organizationId, currency?)` produzca
el feed en la moneda solicitada **sin alterar el comportamiento cuando
`currency` no se pasa**.

**Regla de oro de esta fase:** el diff del CSV sin `currency` antes y después
del cambio debe ser vacío. Si no lo es, la fase no está terminada.

**Cambios:**

1. **`src/lib/services/facebookFeedService.ts`**
   - Añadir parámetro `targetCurrency?: string` a `generateFacebookFeedCSV`.
   - **Si `targetCurrency` es undefined o igual a la moneda base → flujo actual
     sin cambios.** Misma función `formatPrice` con `toFixed(2)`, misma lógica,
     mismo orden. No se refactoriza nada de la rama existente.
   - **Si `targetCurrency` está presente y ≠ base** (rama nueva):
     - Validar que exista en `organization_currencies` para la org.
     - Leer `currencies.decimals` para la moneda destino.
     - Leer la tasa más reciente de `currency_rates` para moneda base y destino.
     - Si alguna falta → lanzar error tipado `RateUnavailableError`.
     - Para cada precio/compare_price, aplicar conversión §3.4.
     - Usar `formatPriceWithDecimals` (función nueva, §3.7), **no** `formatPrice`.
   - **No se toca la función `formatPrice` existente.** Se añade
     `formatPriceWithDecimals` como función nueva separada.
   - Añadir helper `getLatestRates(supabase, baseCode, targetCode)` que
     devuelve `{ rateBase, rateTarget, rateDate }` de la fecha más reciente
     donde ambas existan.
   - Añadir helper `getOrgCurrencies(supabase, orgId)` que devuelve las
     monedas activas de la org con sus `decimals`.

2. **`src/app/api/facebook-feed/route.ts`**
   - Leer `currency` de query params.
   - **Si `currency` no está → ejecutar exactamente el código actual.** Mismo
     `generateFacebookFeedCSV(organizationId)`, mismos headers, mismo
     `Cache-Control`. Cero cambios en este path.
   - **Si `currency` está** → pasar a `generateFacebookFeedCSV(orgId, currency)`:
     - Manejar `RateUnavailableError` → `503` con error estructurado.
     - Manejar moneda no válida → `400` con error estructurado.
     - Añadir headers `X-Feed-Currency` y `X-Rate-Date` en la respuesta.
     - `Cache-Control: public, max-age=3600` (determinista por URL+token+currency).

3. **`src/components/inventario/productos/facebookCatalogExport.ts`**
   - **Sin cambios.** El export CSV client-side sigue en moneda base con
     `formatPrice` actual. La multi-moneda es solo del feed server-side.
   - Si en el futuro se quiere multi-moneda en el export client-side, se hace
     en otra fase, pero no ahora para no tocar lo que funciona.

**Verificación (crítica):**
- **Test de regresión byte-a-byte:** capturar el CSV actual de una org de
  prueba (sin `currency`), aplicar el cambio, capturar de nuevo, y hacer
  `diff`. Debe ser vacío. Si no lo es, hay que encontrar qué se rompió.
- Lint + `next build` + `npm test`.
- Test manual: `curl '/api/facebook-feed?org_id=1&token=X&currency=MXN'` →
  precios en `MXN` con 2 decimales.
- Test con `currency=CLP` → 0 decimales.
- Test con `currency=XYZ` (no configurada) → 400.
- Test sin `currency` → idéntico al actual (regresión byte-a-byte).

### Fase 1 — UI: selector de moneda en el dialog

**Objetivo:** que el usuario pueda elegir la moneda del feed desde
`FacebookFeedDialog` y copiar la URL correcta.

**Cambios:**

1. **`src/components/inventario/productos/FacebookFeedDialog.tsx`**
   - Añadir estado `currencies: {code, name, decimals}[]` y `selectedCurrency: string`.
   - Al abrir, cargar las monedas activas de la organización desde un endpoint
     nuevo o desde Supabase client (ver §4.1).
   - Añadir un `<Select>` de shadcn/ui con label "Moneda del catálogo".
     - Opción por defecto: "Moneda base (COP)" — sin `currency` en la URL.
     - Opciones: una por moneda activa de la org, mostrando `code - name`.
   - Al cambiar la moneda, reconstruir `feedUrl`:
     - Si es la base → URL sin `currency`.
     - Si es otra → URL con `&currency=CODE`.
   - Persistir la selección en `organization_preferences.settings.facebook_feed_default_currency`
     vía `POST /api/facebook-feed/token` extendido (ver §4.1) o vía un
     endpoint pequeño. Al reabrir el dialog, precargar esa preferencia.
   - Mostrar un aviso si la tasa de la moneda seleccionada está stale (>72h):
     "Última tasa: YYYY-MM-DD. Considera actualizar las tasas en
     Finanzas → Monedas."
   - Mantener accesibilidad: el `<Select>` debe tener `aria-label`, ser
     navegable por teclado, y el aviso de staleness debe ser `role="status"`.

2. **`src/components/inventario/productos/ProductosPageHeader.tsx`**
   - Sin cambios (el menú ya abre el dialog).

**Verificación:**
- Lint + build + test.
- Test E2E: abrir dialog, cambiar moneda, copiar URL, pegar en navegador,
  verificar CSV en la moneda elegida.
- Test a11y: navegar el dialog solo con teclado, verificar `aria-label` del
  select y foco visible.

### Fase 2 — Endpoint de monedas activas para el dialog

**Objetivo:** exponer las monedas activas de la organización al dialog sin
exponer datos sensibles.

**Decisión de diseño (§4.1):**

- **Opción preferida:** no crear endpoint nuevo. El dialog ya llama a
  `/api/facebook-feed/token` con `organization_id`. Se extiende ese endpoint
  para que en la respuesta incluya `currencies: [{code, name, decimals,
  is_base, rate_date}]` y `default_currency` (de `organization_preferences`).
  Así se reutiliza una ruta autenticada existente y se evita un endpoint nuevo.
- El endpoint ya valida implícitamente que el usuario pertenece a la org (usa
  el Supabase client del navegador con RLS). No se expone nada público aquí.

**Cambios:**

1. **`src/app/api/facebook-feed/token/route.ts`**
   - En la respuesta de `action: 'get'`, añadir:
     - `currencies`: lista de monedas activas de la org con `decimals` y `is_base`.
     - `rate_date`: fecha de la tasa más reciente.
     - `default_currency`: valor de `settings.facebook_feed_default_currency`.
   - En `action: 'regenerate'`, devolver lo mismo (el dialog refresca estado).
   - Añadir `action: 'set_default_currency'` con body `{ currency: string }`
     que guarde en `organization_preferences.settings.facebook_feed_default_currency`.
     Validar que la moneda esté en `organization_currencies`.

2. **`src/lib/services/facebookFeedService.ts`**
   - Añadir `getFeedConfig(organizationId)` que devuelva
     `{ token, currencies, rateDate, defaultCurrency }`.
   - Refactorizar `getOrCreateFeedToken` y `regenerateFeedToken` para que
     usen `getFeedConfig` internamente o que el route los orqueste.

**Verificación:**
- Lint + build + test.
- Test: `POST /api/facebook-feed/token` con `action: 'get'` devuelve
  `currencies` no vacío para org 1 (COP) y org 2 (COP, USD, CAD).
- Test: `action: 'set_default_currency'` con `currency: 'MXN'` en una org
  que no tiene MXN → 400.

### Fase 3 — Tests automatizados

**Objetivo:** cubrir la lógica de conversión y el endpoint.

**Cambios:**

1. **Test unitario de conversión** (`src/lib/services/__tests__/facebookFeedService.test.ts`):
   - `convertPrice(100000, 'COP', 'MXN', {rateBase: 3125.64, rateTarget: 16.96})` → `≈542.88`.
   - `formatPrice(542.88, 'MXN', 2)` → `"542.88 MXN"`.
   - `formatPrice(926130, 'CLP', 0)` → `"926,130 CLP"`.
   - Caso base = destino → sin conversión.
   - Tasa faltante → lanza `RateUnavailableError`.

2. **Test de integración del endpoint** (si hay infra de integration tests):
   - GET sin `currency` → 200, header `X-Feed-Currency: COP`.
   - GET con `currency=MXN` → 200, precios terminan en `MXN`.
   - GET con `currency=INVALID` → 400.
   - GET con token inválido → 403.

**Verificación:**
- `npm test` pasa.
- Cobertura de la lógica de conversión ≥ 90%.

### Fase 4 — Documentación y migración

**Objetivo:** documentar el cambio y dejar registro.

**Cambios:**

1. **Este documento** (`docs/plan-catalogo-facebook-multimoneda/PLAN.md`):
   - Marcar fases como `aprobado` al implementar.
2. **`PROGRESS.md`**: añadir fila de fase.
3. **No se requieren migraciones SQL**: no se crean tablas ni columnas. El
   único cambio en `organization_preferences` es usar una key nueva en el
   jsonb `settings`, lo cual no requiere migración.
4. **README del módulo productos** (si existe): añadir nota sobre feed
   multi-moneda.

---

## 5. Contrato de API

### 5.1 `GET /api/facebook-feed`

**Query params:**

| Param | Requerido | Tipo | Descripción |
|---|---|---|---|
| `org_id` | sí | integer | ID de la organización |
| `token` | sí | string | Token revocable del feed |
| `currency` | no | string(3) | Código ISO 4217 de la moneda destino |

**Respuestas:**

| Status | Content-Type | Body | Headers |
|---|---|---|---|
| 200 | `text/csv; charset=utf-8` | CSV del catálogo | `X-Product-Count`, `X-Feed-Currency`, `X-Rate-Date`, `X-Rate-Warning` (si stale), `Cache-Control: public, max-age=3600` |
| 400 | `application/json` | `{"error":{"code":"INVALID_CURRENCY","message":"...","details":{"currency":"XYZ"}}}` | — |
| 403 | `application/json` | `{"error":{"code":"INVALID_TOKEN","message":"Token inválido o no autorizado"}}` | — |
| 404 | `application/json` | `{"error":{"code":"NO_PRODUCTS","message":"No hay productos activos para exportar"}}` | — |
| 500 | `application/json` | `{"error":{"code":"INTERNAL","message":"...","details":{}}}` | — |
| 503 | `application/json` | `{"error":{"code":"RATE_UNAVAILABLE","message":"...","details":{"currency":"MXN","rate_date":null}}}` | — |

**Seguridad:**
- El token se valida contra `organization_preferences.settings.facebook_feed_token`.
- `currency` se valida contra `organization_currencies` de la org.
- No se expone la API key de OpenExchangeRates (la conversión usa tasas
  persistidas, no llamadas en vivo).
- `Cache-Control: public, max-age=3600` es seguro porque el feed es determinista
  por `(org_id, token, currency)` y el token es un capability revocable.

### 5.2 `POST /api/facebook-feed/token`

**Body:**

```json
{ "organization_id": 123, "action": "get" | "regenerate" | "set_default_currency", "currency": "MXN" }
```

`currency` solo se requiere para `set_default_currency`.

**Respuesta 200 (action: get | regenerate):**

```json
{
  "success": true,
  "token": "abc-123-xyz",
  "currencies": [
    { "code": "COP", "name": "Peso colombiano", "decimals": 0, "is_base": true },
    { "code": "USD", "name": "Dólar estadounidense", "decimals": 2, "is_base": false }
  ],
  "rate_date": "2026-08-28",
  "default_currency": "COP"
}
```

**Respuesta 200 (action: set_default_currency):**

```json
{ "success": true, "default_currency": "MXN" }
```

**Errores:** 400 (moneda no válida para la org), 500 (interno).

**Seguridad:** este endpoint usa el Supabase client del navegador (con cookies
de sesión), por lo que RLS de `organization_currencies` y
`organization_preferences` aplica. Solo miembros de la org pueden ver/modificar.

---

## 6. Decisiones de diseño y trade-offs

### 6.1 ¿Tasas en vivo o almacenadas?

**Decisión:** almacenadas (`currency_rates`).

**Por qué:**
- El feed es público (lo lee Facebook). Llamar a OpenExchangeRates en cada
  request expondría la API key al flujo público y añadiría latencia/costos.
- Las tasas ya se actualizan periódicamente vía `actualizarTasasDeCambioGlobal`.
- Facebook programa la lectura del feed (típicamente diaria), así que una tasa
  con algunas horas de antigüedad es aceptable.

**Trade-off:** si las tasas no se han actualizado en días, el feed sirve precios
desactualizados. Se mitiga con el header `X-Rate-Warning: stale` y el aviso en
la UI.

### 6.2 ¿Snapshot o dinámico?

**Decisión:** dinámico (como hoy). El feed se genera en cada request.

**Por qué:** ya es dinámico y funciona. Un snapshot añadiría una tabla nueva,
complejidad de invalidación y riesgo de desync con el catálogo real.

### 6.3 ¿Moneda en la URL o en el token?

**Decisión:** en la URL (`?currency=MXN`).

**Por qué:**
- Permite tener múltiples feeds (uno por moneda) sin múltiples tokens.
- Facebook puede programar varias fuentes de datos con la misma URL base.
- El token sigue siendo el capability de acceso; la moneda es un parámetro
  de formato.

### 6.4 ¿Validar `currency` contra `organization_currencies` o contra `currencies`?

**Decisión:** contra `organization_currencies`.

**Por qué:** si la org no configuró MXN, no debería poder publicar en MXN. Esto
también evita exponer el catálogo global de monedas en el feed público.

### 6.5 ¿Decimales hardcoded o por moneda?

**Decisión:** por moneda, leyendo `currencies.decimals` — **pero solo en la
rama multi-moneda** (`&currency=`). El feed sin `currency` sigue usando
`toFixed(2)` como hoy para no romper tiendas en producción.

**Por qué:** CLP, COP y JPY usan 0 decimales. Servir `926,130.00 CLP` no es
ideal, pero es lo que hoy reciben las tiendas configuradas y funciona. Cambiarlo
sin aviso causaría un diff masivo en Facebook Commerce Manager. La rama
multi-moneda sí respeta `decimals` porque es nueva y no hay tiendas
configuradas con ella todavía.

### 6.6 ¿Redondeo half-even o half-up?

**Decisión:** half-even (banker's rounding) vía `Intl.NumberFormat` con
`roundingMode: 'halfEven'` (Node 20+).

**Por qué:** es el default de `Intl.NumberFormat` y evita sesgo hacia arriba en
catálogos grandes. Para catálogo de Facebook la diferencia es irrelevante, pero
es el modo más correcto.

---

## 7. Seguridad

### 7.1 Modelo de amenazas

- **Actor:** cualquiera con la URL del feed (Facebook, pero también un
  atacante que la filtre).
- **Asset:** catálogo de productos de la organización (precios, SKUs, imágenes,
  descripciones, stock agregado).
- **Asset no expuesto:** API key de OpenExchangeRates, datos de otros tenants,
  datos privados de clientes/proveedores, costos (`product_costs` no se consulta).

### 7.2 Controles

1. **Token revocable:** ya existe. Regenerar invalida la URL anterior.
2. **Validación server-side de `currency`:** contra `organization_currencies`,
   no contra input crudo.
3. **Service role key server-only:** nunca se envía al cliente.
4. **Sin CORS restrictivo:** el feed necesita `Access-Control-Allow-Origin: *`
   porque lo lee Facebook, pero el token actúa como bearer capability.
5. **Rate limiting:** no existe hoy. Recomendado añadir en el futuro (ej.
  Vercel Edge Middleware o Upstash) para evitar scraping del feed. Fuera de
  scope de este plan.
6. **No logging de tokens:** el route handler no debe loguear el token. Los
  errores se loguean sin el token.
7. **Cache determinista:** `Cache-Control` es seguro porque el feed es
  determinista por `(org_id, token, currency)`.

### 7.3 RLS

- El feed usa `service_role` (sin RLS), igual que hoy. El control de acceso es
  el token.
- El endpoint `/api/facebook-feed/token` usa el client del navegador con RLS,
  por lo que solo miembros de la org pueden obtener/regenerar el token y ver
  las monedas activas.

---

## 8. Testing

### 8.1 Unit tests

- `convertPrice`: casos base=destino, base→destino, destinos con 0 y 2
  decimales, tasas faltantes.
- `formatPrice`: 0 decimales (CLP), 2 decimales (MXN), montos grandes
  (millones), montos pequeños (<1).
- `getLatestRates`: fecha más reciente donde ambas tasas existen.

### 8.2 Integration tests

- GET feed sin `currency` → 200, `X-Feed-Currency: COP`.
- GET feed con `currency=MXN` → 200, precios en MXN, 2 decimales.
- GET feed con `currency=CLP` → 200, precios en CLP, 0 decimales.
- GET feed con `currency=INVALID` → 400.
- GET feed con token inválido → 403.
- GET feed sin productos → 404.
- POST token `action: 'get'` → incluye `currencies` y `default_currency`.
- POST token `action: 'set_default_currency'` con moneda no configurada → 400.

### 8.3 E2E (manual o con skill `go-admin-erp-e2e`)

- Abrir Productos → Más opciones → URL Feed para Facebook.
- Cambiar moneda en el select → URL se actualiza con `&currency=CODE`.
- Copiar URL, abrir en navegador → CSV en la moneda elegida.
- Regenerar token → URL anterior da 403, nueva URL funciona.
- Verificar que el select recuerda la última moneda (preferencia persistida).

### 8.4 Regresión

- Feed sin `currency` debe ser idéntico al comportamiento actual (diff del
  CSV antes/después, salvo formato de precio si se corrige `decimals` para
  COP — ver §8.5).

### 8.5 Nota sobre `formatPrice` para COP en el feed actual

El `formatPrice` actual usa `toFixed(2)` siempre. Para COP (decimals=0) esto
produce `100,000.00 COP` en el feed **sin `currency`**. **Esto NO se cambia**
porque hay tiendas en producción usando esa URL y un cambio de formato podría
causar un diff masivo en Facebook Commerce Manager.

Si el usuario quiere el formato "correcto" (0 decimales para COP), debe usar
la URL con `&currency=COP` explícito, que activa la rama multi-moneda con
`formatPriceWithDecimals` y respeta `currencies.decimals`. El feed sin
`currency` sigue sirviendo `100,000.00 COP` como hoy.

---

## 9. Migración y despliegue

### 9.1 Migraciones SQL

**Ninguna.** No se crean tablas ni columnas. El único cambio en
`organization_preferences` es usar una key nueva en el jsonb `settings`
(`facebook_feed_default_currency`), lo cual no requiere migración.

### 9.2 Variables de entorno

**Ninguna nueva.** Se reutilizan:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY` (solo para actualización de tasas,
  no para el feed).

### 9.3 Despliegue

- Deploy normal de Next.js en Vercel.
- No hay edge functions nuevas.
- No hay cron jobs nuevos (la actualización de tasas ya existe).

### 9.4 Rollback

- Revertir el PR.
- El feed vuelve al comportamiento anterior (sin `currency`, `formatPrice`
  con `toFixed(2)`).
- Las preferencias `facebook_feed_default_currency` quedan en `settings` pero
  se ignoran (no afectan nada).

---

## 10. Orden de ejecución

1. **Fase 0** — Backend (conversión + formato + endpoint).
2. **Fase 2** — Endpoint de monedas (necesario para Fase 1).
3. **Fase 1** — UI (selector de moneda).
4. **Fase 3** — Tests automatizados.
5. **Fase 4** — Documentación y PROGRESS.md.

Fase 0 y Fase 2 pueden ir en el mismo PR. Fase 1 en un PR dependiente. Fase 3
puede ir en cualquiera de los dos.

---

## 11. Archivos que se modificarán

| Archivo | Fase | Módulo (code-style) | Cambio |
|---|---|---|---|
| `src/lib/services/facebookFeedService.ts` | 0, 2 | inventario (servicio) | rama multi-moneda (sin tocar rama actual), `formatPriceWithDecimals` nueva, `getFeedConfig` |
| `src/app/api/facebook-feed/route.ts` | 0 | inventario (API) | param `currency` (sin tocar path sin `currency`), headers, errores |
| `src/app/api/facebook-feed/token/route.ts` | 2 | inventario (API) | `currencies`, `default_currency`, `set_default_currency` |
| `src/components/inventario/productos/facebookCatalogExport.ts` | — | — | **SIN CAMBIOS** (export client-side intacto) |
| `src/components/inventario/productos/FacebookFeedDialog.tsx` | 1 | inventario | selector de moneda |
| `src/lib/services/__tests__/facebookFeedService.test.ts` | 3 | inventario (test) | nuevo |
| `docs/plan-catalogo-facebook-multimoneda/PLAN.md` | 4 | docs | este archivo |
| `PROGRESS.md` | 4 | raíz | fila de fase |

**Archivos fuera de scope del módulo `inventario` que se tocan:**
- `src/app/api/facebook-feed/*` — rutas API del feed, conceptualmente del
  módulo inventario aunque vivan en `app/api`. Confirmar con el usuario si
  se considera fuera de scope antes de modificar (regla code-style §1).

---

## 12. Pendientes de confirmación con el usuario

1. **¿Separador de miles en `price`?** Facebook spec estricta dice sin
   separador (`1234.56 USD`), pero en práctica acepta comas. Se usa `en-US`
   (con comas) por legibilidad. Si Commerce Manager rechaza, cambiar a
   `useGrouping: false`.
2. **¿Umbral de staleness?** Default 72h. ¿Ajustar?
3. **¿Soportar `currency` en el export CSV client-side también?** Hoy el
   plan solo lo añade al feed server-side. El export client-side
   (`exportToFacebookCatalog`) sigue en moneda base. ¿Extenderlo?
4. **¿Rate limiting para el feed público?** Fuera de scope de este plan, pero
   recomendado.
5. **¿Crear tarea en Jira (proyecto GO)?** El usuario no lo pidió
   explícitamente. Si lo desea, se crea con la skill `jira-task-creator`.

---

## 13. Glosario

- **Feed**: URL pública que devuelve un CSV con el catálogo en formato Facebook.
- **Token**: string aleatorio revocable almacenado en
  `organization_preferences.settings.facebook_feed_token`.
- **Moneda base**: moneda con `is_base=true` en `organization_currencies` de
  la organización. Es la moneda en que están los precios en `product_prices`.
- **Moneda destino**: moneda en la que se sirve el feed, elegida por el usuario.
- **Tasa**: valor en `currency_rates.rate`, unidades de la moneda por 1 USD.
- **Stale**: tasa cuya `rate_date` es más antigua que el umbral (72h default).
