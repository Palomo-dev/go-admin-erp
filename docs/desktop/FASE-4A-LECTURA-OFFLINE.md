# Fase 4A — Lectura offline del POS en Go Admin Desktop

Fecha: 2026-09-16. Roadmap: `docs/ROADMAP-DESKTOP.md` §Fase 4, puntos 2 (variante
IndexedDB) y 6. Auditoría de partida: `docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md`
§1.8 y §1.10.

## 1. Problema que resuelve

Probado por el dueño en el `.exe` sin red: el POS cargaba la carcasa pero mostraba
«Error al cargar productos». Dos causas:

1. `POSService.getProductsPaginated` empieza por la RPC `pos_product_ranking`
   (`POST /rest/v1/rpc/...`). La caché offline de `offlineCache.ts` solo guardaba y
   servía `GET`, así que la RPC fallaba siempre sin red.
2. Peor: el interceptor de `config.ts` trataba cualquier `POST` como escritura y
   **encolaba la RPC** en `action-queue`. Las «7 acciones pendientes» del banner eran
   lecturas (`pos_product_ranking`, `get_organization_currencies`, …) que, al volver
   la red, se reenviaban sin sentido.

Y aunque la RPC se hubiera cacheado, la caché por URL solo cubre lo que se visitó con
red (§1.10): una búsqueda o una página no pedidas antes seguirían fallando.

## 2. Diseño

Dos capas, ambas solo en Desktop (`isDesktop()`), la web no cambia:

### 2.1 Interceptor: RPC como lectura cacheable (`offlineCache.ts` + `config.ts`)

- `POST /rest/v1/rpc/<fn>` se guarda con red bajo la clave
  `rpc:<fn>:<FNV-1a del body>` (misma store `query-cache` de `goadmin-offline`), y sin
  red se sirve por esa clave. Si no hay entrada: `503 Offline: no cached data`.
- **Una RPC nunca se encola.** La cola `action-queue` queda para `POST/PATCH/PUT/DELETE`
  REST, como antes (la fase 4B además saca de la cola las tablas de venta).
- Las RPC cuyo nombre indica escritura (`fn_register_*`, `decrement_*`, `update_*`,
  `issue_invoice`, `set_organization_base_currency`, …; ver `RPC_WRITE_RE`) no se
  cachean ni se sirven: servir una respuesta guardada haría creer a la UI que la
  escritura se hizo. `set_org_context`, `set_session_org_id` y `set_config` son
  setters de sesión sin efecto persistente y sí se cachean.
- `purgeQueuedRpcActions()` retira de la cola las RPC que el interceptor anterior
  encoló por error; se llama al cargar `offlineCache.ts` en Desktop.
  `getQueueCountsByType()` devuelve `{ total, rpc, rest, byMethod }`.
- Toda la decisión sin red vive en `resolveOfflineDataRequest()`; `config.ts` solo la
  llama. Los fallbacks por timeout / último intento también usan
  `getCachedForRequest()` (GET o RPC de lectura).

### 2.2 Catálogo local (`src/lib/offline/`)

IndexedDB **`goadmin-catalog`** (versión 1, independiente de `goadmin-offline`):
filas por entidad, no respuestas HTTP. Todas llevan `organization_id` (se añade al
escribir en las tablas que no lo tienen en Postgres) e índice `by_org`; donde aplica,
`by_product`, `by_org_branch`, `by_org_parent`, `by_org_barcode`, `by_org_category`.
La store `meta` guarda `replicated_at` y `count` por store y organización.

| Archivo | Papel |
|---|---|
| `catalogStore.ts` | Apertura, tipos de fila, `putCatalogRows`, `pruneCatalogRows`, lecturas por índice, `getCatalogStatus()`, `clearCatalog()`. |
| `catalogReplicator.ts` | `replicateCatalog({ organizationId })`: paginación PostgREST de 500, escribe cada lote al llegar, cede el hilo entre lotes, poda lo que desapareció y anota `replicated_at`. `startCatalogReplication()` programa el refresco cada 10 min con red (con conteo de suscriptores). Evento `goadmin:catalog-replicated`. |
| `posOfflineReads.ts` | Resolutores con **la misma forma de salida** que `posService`. `CatalogNotReplicatedError` («Catálogo local aún no replicado: conecta a internet una vez»). |
| `useDesktopCatalog.ts` | Hook para la UI: estado, `replicateNow()`, arranca la replicación al montar. |

En `posService.ts` cada lectura del POS empieza por un único interruptor:

```ts
if (this.usesLocalCatalog()) return posOfflineReads.X(this.organizationId, ...);
```

`usesLocalCatalog()` = `isDesktop() && !isAppOnline()`. El SQL online no se duplica:
el resolutor offline devuelve la misma forma y, cuando había un mapeo posterior
(métodos de pago, monedas), se extrajo a una función compartida
(`mapPaymentMethodRow`) o se reutiliza el mapeo existente sobre filas con la forma de
la RPC. Lecturas cubiertas: `getProductsPaginated`, `getProductVariants`,
`getCategories`, `getCategoryRanking`, `getProductByBarcode`, `getProductById`,
`searchCustomers`, `getPaymentMethods`, `getCurrencies` (y por tanto
`getBaseCurrency`), `getOrganizationTaxes`, `getProductTaxes`. `checkout` y el resto
de escrituras no se tocan (fase 4B).

Cuándo replica (solo Desktop, con red): al entrar al POS (`LocalCatalogNotice` dentro
de `ProductSearch`), a `/app/inicio` (`useDesktopCatalog` en la página) y desde el
banner `OfflineIndicator` (montado en todo `/app`); después, cada 10 minutos en
background. Botón «Actualizar catálogo ahora» en ambos sitios.

## 3. Tablas replicadas y columnas verificadas por MCP (2026-09-16)

Todas las columnas se comprobaron con `execute_sql` sobre `information_schema.columns`
antes de escribir las consultas. Recordatorio de las trampas de `CLAUDE.md`:
`products` no tiene `price`/`cost`/`is_active`; precios en `product_prices` con
vigencia; `stock_levels.branch_id` NOT NULL.

| Store | Origen | Filtro | Columnas |
|---|---|---|---|
| `products` | `products` | `organization_id`, `status = 'active'` (padres y variantes) | `id, organization_id, uuid, sku, name, description, barcode, status, category_id, unit_code, parent_product_id, is_parent, variant_data, track_stock, track_serial, tag_id, station, product_type, production_type, is_composite, brand, reference, warranty_months, created_at, updated_at` + `is_favorite` (de `product_favorites.product_id`) |
| `product_prices` | `product_prices` | `product_id IN (ids)`, `effective_to IS NULL` | `id, product_id, price, compare_price, effective_from, effective_to` |
| `product_images` | `product_images` | `product_id IN (ids)`; se conserva una por producto (primaria o menor `display_order`) | `id, product_id, storage_path, is_primary, display_order` |
| `stock_levels` | `stock_levels` | `branch_id IN (sucursales de la org)`, `lot_id IS NULL` | `id, product_id, branch_id, lot_id, qty_on_hand, qty_reserved` |
| `categories` | `categories` | `organization_id` | `*` + `is_favorite` (de `category_favorites.category_id`) |
| `customers` | `customers` | `organization_id`, orden `updated_at DESC`, máximo 2000 | `id, organization_id, branch_id, first_name, last_name, full_name, email, phone, doc_type, doc_number, identification_type, identification_number, company_name, trade_name, address, city, customer_type, avatar_url, roles, tags, preferences, fiscal_municipality_id, created_at, updated_at` |
| `payment_methods` | `organization_payment_methods` ⋈ `payment_methods` | `organization_id`, `is_active` | `payment_method_code, is_active, settings, payment_methods(name)` |
| `organization_taxes` | `organization_taxes` | `organization_id`, `is_active` | `*` (`id uuid, name, rate, is_default, tax_included, …`) |
| `product_tax_relations` | `product_tax_relations` | `product_id IN (ids)` | `product_id, tax_id` |
| `currencies` | RPC `get_organization_currencies` | `p_organization_id` | `code, name, symbol, decimals, auto_update, is_base, org_auto_update` |
| `product_modifier_groups` | `product_modifier_groups` | `organization_id` | `id, organization_id, product_id` (solo ids) |
| `product_recipes` | `product_recipes` | `organization_id`, `is_active` | `id, organization_id, product_id, name` |

`branches` se consulta solo para obtener los ids de sucursal (`id`,
`organization_id`); no se guarda.

## 4. Límites conocidos

- **Ranking simplificado.** `pos_product_ranking` ordena por favorito → ventas de 90
  días → id. Sin red no hay ventas: el orden es favorito → nombre, y
  `sales_count_90d` es 0 (también en `getCategoryRanking`). La UI no muestra el
  «más vendido» offline.
- **Búsqueda por modificador.** Online la RPC encuentra productos por nombre de grupo
  u opción de modificador; offline solo se replican los ids de los grupos (para el
  indicador «tiene modificadores»), así que esa búsqueda no está.
- **Clientes.** Solo los 2000 más recientes por `updated_at`. Crear un cliente sin red
  sigue siendo una escritura REST encolada (comportamiento anterior).
- **Precios.** Se replican los de `effective_to IS NULL`; el vigente es el de
  `effective_from` más reciente, igual que online. `product_costs` no se replica (el
  POS no lo usa).
- **Stock.** Todas las sucursales de la organización, sin lote. El consolidado
  «todas las sucursales» funciona; el stock por lote no.
- **Imágenes.** Solo la ruta de Storage; la imagen en sí necesita red salvo que
  Chromium la tenga en su caché HTTP.
- **Frescura.** Lo replicado tiene hasta 10 minutos de antigüedad con red; sin red,
  la del momento en que se perdió la conexión. El aviso muestra esa hora en la zona
  de la organización.
- **Tamaño.** Un catálogo de 5 000 productos ronda los pocos MB en IndexedDB.
  La replicación va en lotes de 500 y cede el hilo entre lotes; no bloquea la UI.

## 5. Cómo probar sin red

1. Con red, abrir la app de escritorio, entrar a `/app/inicio` o al POS y esperar
   la línea «Catálogo local: N productos · actualizado hh:mm» bajo el buscador (o
   pulsar «Actualizar catálogo ahora»).
2. Cortar la red. Sin tocar adaptadores:
   `& "release\win-unpacked\Go Admin ERP.exe" --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"`
   (ver `docs/desktop/FASE-3-NEXT-EMBEBIDO.md` §5). La prueba definitiva es apagar
   el WiFi.
3. En el POS: los productos cargan, paginan, se filtran por categoría y se buscan por
   nombre/SKU/código de barras; el buscador de clientes responde; el diálogo de cobro
   lista métodos de pago, moneda e impuestos. Bajo el buscador aparece «Catálogo local
   del hh:mm · N productos · M clientes» en ámbar.
4. Banner superior: «Sin conexión con el servidor — Modo offline · catálogo local:
   N productos · actualizado hh:mm». El contador de acciones pendientes **no** sube
   al navegar ni buscar (antes subía con cada RPC).
5. DevTools → Application → IndexedDB: `goadmin-catalog` con las 12 stores y `meta`;
   `goadmin-offline › action-queue` sin URLs `/rest/v1/rpc/`.
6. Sin haber replicado nunca (instalación limpia sin red): el POS muestra «Catálogo
   local aún no replicado: conecta a internet una vez» en lugar del error genérico.

Tests: `npx jest src/lib/offline` (`catalogStore`, `posOfflineReads`, `rpcCache`) con
`fake-indexeddb` (añadida como devDependency en esta fase; IndexedDB en memoria para
jest en entorno node). Corren en `TZ=UTC` y `TZ=America/Bogota`.

## 6. Qué NO hace esta fase

Escrituras (venta, pagos, movimientos de stock, favoritos) y su sincronización: fase 4B
(`salesOutbox.ts`, en paralelo). Impresión local: hecha en
`docs/desktop/IMPRESION-LOCAL-DESKTOP.md`.
