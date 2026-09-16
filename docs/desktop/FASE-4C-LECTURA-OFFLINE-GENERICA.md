# Fase 4C — Lectura offline genérica en Go Admin Desktop

Fecha: 2026-09-16. Roadmap: `docs/ROADMAP-DESKTOP.md` §Fase 4, punto 8. Continúa
la fase 4A (catálogo del POS, `FASE-4A-LECTURA-OFFLINE.md`) y la 4B (venta sin red,
`FASE-4B-VENTA-OFFLINE.md`).

## 1. Problema que resuelve

Probado por el dueño en el `.exe` sin red con el catálogo del POS ya replicado: el
POS funciona, pero el resto del ERP no. CRM → Clientes decía «Error desconocido al
cargar clientes» con todos los totales en 0; Finanzas → Facturas de compra salía
vacía y sin proveedores en el filtro; Inventario → Stock avisaba «No se pudieron
actualizar los datos de stock»; POS → Historial de ventas decía «No hay ventas»
(ni siquiera la venta hecha sin red, que está en el outbox).

La causa es estructural: la caché por URL de `offlineCache.ts` solo sirve lo que se
pidió antes con red, con la misma URL. Cualquier filtro, página u orden distinto
falla. Y el 4A resolvía eso solo para el POS, escribiendo a mano un resolutor por
lectura (`posOfflineReads.ts`), lo que no escala a 19 módulos.

## 2. Diseño: un motor, cero cambios por pantalla

Sin red, en Desktop, cada `GET /rest/v1/<tabla>?...` que emite `supabase-js` se
**parsea y evalúa localmente** contra una réplica de las tablas en IndexedDB, y se
responde exactamente como lo haría PostgREST. Los servicios no se tocan: siguen
llamando a `supabase.from(...)` y reciben `data`, `count` y `error` como siempre.

```
supabase-js ──fetch──▶ interceptor (config.ts) ──sin red──▶ resolveOfflineDataRequest (offlineCache.ts)
                                                                 │ GET/HEAD tabla del manifiesto
                                                                 ▼
                                             resolveLocalPostgrest (postgrestLocal.ts)
                                               parse URL+cabeceras → plan → evaluación sobre
                                               offlineDb.ts (IndexedDB goadmin-replica)
                                                 ├─ 200/206 + Content-Range  → se devuelve
                                                 ├─ 406 PGRST116 (.single()) → se devuelve
                                                 └─ null (sin replicar, sintaxis no soportada)
                                                        │
                                                        ▼
                                              caché por URL (4A) → 503 «Offline: no cached data»
```

| Archivo | Papel |
|---|---|
| `src/lib/offline/replicationManifest.ts` | Manifiesto: 45 tablas con columnas verificadas por MCP, PK, ámbito, ventana, tope, columna incremental, índices y FKs (para embeds). |
| `src/lib/offline/offlineDb.ts` | IndexedDB `goadmin-replica` (un store por tabla, índices `by_org` + `by_<col>`), meta por tabla, estado agregado (`getOfflineDbStatus`), capa IndexedDB genérica que ahora también usa `catalogStore.ts`. |
| `src/lib/offline/offlineReplicator.ts` | Replicación por lotes de 500, completa/incremental, poda, estado por tabla; planificador ÚNICO (catálogo del POS + réplica) al iniciar y cada 10 min. |
| `src/lib/offline/postgrestLocal.ts` | Parser de la petición y evaluador (filtros, or/and, order, range, count, single, embeds). |
| `src/lib/offline/rpcLocal.ts` | Equivalentes locales de RPC de lectura con argumentos variables (hoy `get_accounts_receivable_for_customers`). |
| `src/lib/offline/outboxVirtualRows.ts` | Ventas del outbox (4B) como filas virtuales de `sales`/`sale_items` con `status = 'pending_sync'`. |
| `src/lib/offline/useOfflineData.ts` | Hook de estado para la UI. |
| `src/lib/utils/offlineCache.ts` | Enganche: local → caché por URL → 503 (GET/HEAD); RPC: local → caché por body → 503. |
| `src/components/configuracion/panels/datos-offline/DatosOfflinePanel.tsx` | Configuración → Datos sin conexión (solo Desktop). |
| `src/components/offline/LocalDataNotice.tsx` | «Estás viendo datos locales del hh:mm», montado en `AppLayout` (todos los módulos). |

Fuera del Desktop **nada cambia**: `config.ts` solo llama a
`resolveOfflineDataRequest` cuando `isDesktop() && !isAppOnline()`, y los hooks
devuelven `isDesktop: false` sin abrir IndexedDB.

### 2.1 Réplica (`offlineDb.ts` + `offlineReplicator.ts`)

- Un object store por tabla, clave = PK real (simple o compuesta), índice `by_org`
  sobre `organization_id` y `by_<col>` por cada columna de `indexes` del manifiesto
  (FKs más consultadas, `created_at`, `barcode`, `number`...).
- Las tablas sin `organization_id` en Postgres (`stock_levels`, `product_prices`,
  `sale_items`, `invoice_items`, ...) se replican filtrando por el padre en la misma
  consulta PostgREST (`products!inner(organization_id)&products.organization_id=eq.N`)
  y se les añade `organization_id` solo localmente; el resolutor lo retira de la
  salida. `invoice_items` cuelga de facturas de venta y de compra: dos pasadas unidas.
- Pasada **completa** (con poda de lo borrado o fuera de ventana) la primera vez y
  como máximo cada 2 h; entre medias, **incremental** con `updated_at > cursor`
  (estrictamente mayor: los lotes importados comparten `updated_at`) en las tablas
  que lo tienen; `product_prices`/`product_costs` van por `created_at` (un cambio
  de precio crea fila nueva; el cierre de la anterior llega con la pasada completa,
  y mientras tanto el vigente sigue siendo el de `effective_from` más reciente).
  Las que no tienen columna monótona (`product_tax_relations`, catálogos globales)
  se recorren completas: son pequeñas. `updated_at` lo mantiene la aplicación (sin
  trigger, verificado por MCP): una escritura que no lo toque se recoge en la
  siguiente pasada completa.
- Un error en una tabla (RLS, timeout) queda en su `meta.error` y no detiene las
  demás. Cambiar de organización vacía la réplica.
- Cadencia única: `startOfflineReplication()` (suscripción con conteo, como en 4A)
  replica el catálogo del POS y después la réplica genérica; `useDesktopCatalog` y
  `useOfflineData` se suscriben a él; «Actualizar/Sincronizar ahora» hace ambas.

### 2.2 Resolutor PostgREST local (`postgrestLocal.ts`)

Soportado (con tests en `postgrestLocal.parse.test.ts` y `postgrestLocal.eval.test.ts`):

| Aspecto | Soporte |
|---|---|
| `select` | columnas, `alias:col`, `col::cast` (se ignora), `*` = columnas del manifiesto; columna pedida a mano y no replicada → `null` |
| Embeds | 1–3 niveles; directos (objeto o `null`) por FK del manifiesto; inversos (array) derivados; hint `!nombre_fk` o `!columna`; `!inner` descarta padres sin hijo (antes del count y del range); alias `cliente:customers(...)`; filtros, `order`, `limit`, `offset` sobre el embed (`rel.col=eq.x`, `rel.order=`) |
| Filtros | `eq, neq, gt, gte, lt, lte, like, ilike, match, imatch, is (null/true/false), in, cs, cd, ov, fts/plfts/phfts/wfts`; `like(any)`/`like(all)`; `not.` |
| Lógica | `or=(...)`, `and=(...)`, anidados, `not.and(...)`, `col.not.op.v` |
| Orden | varias columnas, `asc/desc`, `nullsfirst/nullslast` (por defecto ASC → nulos al final, DESC → al principio, como Postgres) |
| Paginación | `limit`/`offset` y cabecera `Range`; `Content-Range: a-b/total`; 206 si parcial; `*/0` sin filas |
| Conteo | `Prefer: count=exact` (también `planned`/`estimated`, que aquí son exactos); `HEAD` solo cabeceras |
| Objeto | `Accept: application/vnd.pgrst.object+json` (`.single()`): 406 `PGRST116` con `details: "The result contains N rows"` (`.maybeSingle()` lo entiende) |
| Tipos | coerción numérica, booleana y de fechas ISO; comparación de texto con `localeCompare('es')` |

Devuelve `null` (y el interceptor cae a la caché por URL) con: agregados
(`count()`, `total.sum()`), rutas JSON (`data->>k`), spread (`...rel`), operadores de
rango (`sl, sr, nxl, nxr, adj`), `order` por columna embebida, relación sin FK en el
manifiesto o ambigua sin hint (como PostgREST), tabla sin replicar todavía. `fts` es
una aproximación: todas las palabras deben aparecer, sin acentos ni mayúsculas, sin
stemming.

Siempre filtra por la organización de la sesión (`currentOrganizationId`), aunque la
consulta no lo haga: la réplica solo contiene una organización.

### 2.3 RPC con equivalente local (`rpcLocal.ts`)

La caché de RPC de 4A solo acierta si se llamó antes con el mismo body. Las RPC con
ids variables se resuelven aquí sobre la réplica, replicando su SQL verificado:

| RPC | Base | Salida |
|---|---|---|
| `get_accounts_receivable_for_customers(customer_ids, org_id)` | `accounts_receivable` por `customer_id` y organización | `customer_id, balance, days_overdue, status, due_date` |

Orden sin red: resolutor local → caché por body → 503. Añadir una RPC = una entrada
en `LOCAL_RPC_RESOLVERS` con su definición SQL citada.

### 2.4 Ventas del outbox en las lecturas

`withOutboxRows()` envuelve la fuente local: `sales` y `sale_items` incluyen los
sobres `pending`/`syncing`/`needs_review` del outbox (4B) con la forma de la tabla,
`status = 'pending_sync'`, `payment_status` real y extras locales
(`receipt_number_local`, `pending_sync`, `outbox_status`, `outbox_error`; solo salen si
se piden por nombre). Si la venta ya llegó al servidor (misma `id` replicada), gana
la fila real. El historial de ventas la pinta con el badge «Pendiente de
sincronizar».

## 3. Manifiesto (topes y ventana)

Columnas verificadas por MCP (`information_schema`) el 2026-09-16. Trampas: `products`
sin `price/cost/is_active`; `customers.full_name/doc_type/doc_number` generadas;
`stock_levels.branch_id` NOT NULL y sin `organization_id`; **`warehouses` no existe**;
`invoice_purchase` no tiene tabla de líneas propia: son `invoice_items` con
`invoice_purchase_id`.

| Grupo | Tabla | Ámbito | Ventana (12 m) | Tope | Incremental | Índices locales |
|---|---|---|---|---|---|---|
| Organización | `organizations` (columnas no sensibles) | `id = org` | — | 1 | — | — |
| | `branches` | org | — | 500 | `updated_at` | — |
| | `organization_members` (sin nada sensible: id, user_id, role_id, is_active, is_super_admin, job_position_id, is_temporary) | org | — | 2 000 | — | user_id, role_id |
| | `profiles` (id, email, nombre, avatar, status) | vía `organization_members!inner` | — | 2 000 | — | — |
| | `roles` | global | — | 500 | — | — |
| Catálogos | `currencies`, `units`, `payment_methods`, `tax_templates`, `municipalities` | global | — | 500 / 500 / 200 / 1 000 / 2 000 | — | `code` |
| | `organization_currencies`, `organization_payment_methods`, `organization_taxes` | org | — | 100 / 200 / 500 | — | — |
| Inventario | `categories` | org | — | 5 000 | `updated_at` | parent_id |
| | `products` | org | — | 25 000 | `updated_at` | category_id, parent_product_id, barcode, sku, uuid |
| | `product_prices` (solo `effective_to IS NULL`) | vía `products` | — | 25 000 | `created_at` | product_id |
| | `product_costs` (solo vigentes) | vía `products` | — | 15 000 | `created_at` | product_id, supplier_id |
| | `product_images` | vía `products` | — | 15 000 | `updated_at` | product_id |
| | `product_tax_relations` | vía `products` | — | 10 000 | — | product_id, tax_id |
| | `product_modifier_groups` / `product_modifiers` | org / vía grupos | — | 10 000 / 10 000 | `updated_at` | product_id / group_id |
| | `product_suppliers`, `lots` | vía `products` | — | 10 000 / 10 000 | `updated_at` | product_id, supplier_id |
| | `stock_levels` (con y sin lote) | vía `branches` | — | 25 000 | `updated_at` | product_id, branch_id, lot_id |
| | `stock_movements` | org | `created_at` | 20 000 | `created_at` | product_id, branch_id, created_at, source_id |
| | `inventory_adjustments`, `inventory_transfers` | org | `created_at` | 10 000 / 10 000 | `updated_at` | branch_id / origen y destino |
| Compras | `suppliers` | org | — | 10 000 | `updated_at` | parent_supplier_id |
| | `invoice_purchase` | org | `created_at` | 10 000 | `updated_at` | supplier_id, branch_id, po_id, issue_date |
| | `purchase_orders` / `purchase_order_items` | org / vía órdenes | `created_at` | 10 000 / 10 000 | `updated_at` | supplier_id, branch_id / purchase_order_id, product_id |
| Clientes | `customers` (completo) | org | — | 25 000 | `updated_at` | branch_id, identification_number, email, phone, parent_customer_id |
| | `customer_company_links` | org | — | 5 000 | `updated_at` | person_id, company_id |
| Ventas | `sales` / `sale_items` | org / vía ventas | `created_at` | 20 000 / 20 000 | `updated_at` | customer_id, branch_id, created_at, user_id / sale_id, product_id |
| | `web_orders` / `web_order_items` | org / vía pedidos | `created_at` | 5 000 / 10 000 | `updated_at` / `created_at` | customer_id, branch_id, sale_id / web_order_id, product_id |
| Finanzas | `invoice_sales` (sin `qr_image`) | org | `created_at` | 20 000 | `updated_at` | customer_id, sale_id, branch_id, related_invoice_id, number, issue_date |
| | `invoice_items` (venta y compra) | vía `invoice_sales` + vía `invoice_purchase` | `created_at` | 20 000 | `updated_at` | invoice_id, invoice_sales_id, invoice_purchase_id, product_id |
| | `payments` | org | `created_at` | 20 000 | `updated_at` | source_id, branch_id, method, created_at |
| | `accounts_receivable` / `accounts_payable` (sin ventana: los saldos abiertos importan) | org | — | 10 000 / 10 000 | `updated_at` | customer_id, invoice_id, sale_id / supplier_id, invoice_id |
| | `cash_sessions`, `cash_movements`, `cash_counts` | org | `created_at` | 10 000 cada una | `updated_at` / `created_at` | branch_id, opened_by, status / cash_session_id |

Presupuesto: suma de topes ≈ 445 000 filas (`totalMaxRows()`, test que lo vigila
< 450 000). A ~0,3 KB por fila (JSON medido en fixtures) son ≈ 135 MB solo si TODAS
las tablas tocan su tope a la vez; la organización más grande hoy suma ≈ 100 000
filas (≈ 30 MB). Con ventana, el tope conserva lo más reciente (orden descendente
por la columna de la ventana). El tamaño estimado se muestra en Configuración.

FKs del manifiesto (para embeds): todas las de `information_schema` entre estas
tablas, con su nombre real (`fk_invoice_sales_customer`,
`customer_company_links_person_id_fkey`, `inventory_transfers_origin_branch_id_fkey`, ...).
`organization_currencies` NO tiene FK a `currencies` (PostgREST tampoco la embebe).

## 4. UI

- **Configuración → Datos sin conexión** (`datos-offline`, registrado en
  `configModulesRegistry.ts` con `desktopOnly: true`; `useActiveConfigModules` lo
  oculta fuera del Desktop): estado, última replicación, filas y tamaño estimado,
  catálogo del POS, tabla por entidad agrupada (filas, última replicación,
  ventana/tope, estado o error), «Sincronizar ahora» y «Replicación completa».
- **Banner** `OfflineIndicator`: «datos locales actualizados hh:mm» junto al catálogo,
  botón «Sincronizar datos ahora» (hace catálogo + réplica).
- **Aviso** `LocalDataNotice` en `AppLayout`: sin red, «Estás viendo datos locales del
  hh:mm · N tablas sin replicar»; sin réplica, «conecta a internet una vez». Todas las
  horas por `useFormatDate()` (zona de la organización); nunca `toISOString().split`.
- Historial de ventas: badge «Pendiente de sincronizar» para `status = 'pending_sync'`.

## 5. Límites conocidos

- **Escrituras**: sin cambios. Fuera del POS siguen yendo a la cola HTTP genérica
  (202 con `data: null`), con las limitaciones de la auditoría §1.8. Esta fase es de
  lectura.
- **RPC**: solo `get_accounts_receivable_for_customers` tiene equivalente local; el
  resto depende de la caché por body de 4A (funciona si se llamó antes con los
  mismos argumentos). Dashboards con RPC de agregados (`fn_reporte_*`) se ven con la
  última respuesta cacheada o fallan con 503.
- **Precios/costos**: solo los vigentes; la historia no está.
- **Ventana**: 12 meses por `created_at`. Una factura de hace 14 meses no aparece ni
  en el detalle; las cuentas por cobrar/pagar sí (sin ventana).
- **Frescura**: hasta 10 min con red (incremental) y hasta 2 h para borrados y
  para escrituras que no toquen `updated_at` (solo la pasada completa las recoge).
  Sin red, lo del momento en que se perdió la conexión.
- **Rutas JSON, agregados, `order` por embed**: caen a la caché por URL.
- **Imágenes**: solo la ruta; el binario necesita red salvo caché de medios (4D).
- **Otras tablas** (reservas, folios, kitchen_tickets, CRM avanzado, HRM, PMS): no
  están en el manifiesto; se ven solo si su URL exacta está en la caché por URL.
  Añadir una tabla = una entrada en el manifiesto con columnas verificadas por MCP
  y subir `OFFLINE_DB_VERSION`.
- La réplica usa la sesión del usuario (RLS): solo replica lo que ese usuario puede
  leer. Datos de otra organización nunca entran (y se vacía al cambiar).

## 6. Cómo probar sin red, módulo por módulo

Preparación: con red, iniciar sesión en el Desktop, esperar a que el banner o
Configuración → Datos sin conexión muestre «Última replicación hh:mm» y todas las
entidades «Al día» (la primera pasada completa de una organización grande tarda
1–3 min). Luego cortar la red (WiFi apagado; o `--host-resolver-rules="MAP * ~NOTFOUND,
EXCLUDE 127.0.0.1, EXCLUDE localhost"`, ver FASE-3 §5). Debe aparecer el banner ámbar y,
bajo la cabecera, «Estás viendo datos locales del hh:mm».

Casos del criterio de aceptación del dueño (probados con las consultas exactas en
`src/lib/offline/__tests__/screensOffline.test.ts`):

1. **CRM → Gestión de clientes** (`/app/crm/clientes`): la lista carga con paginación y
   búsqueda; «Total clientes» es el conteo real (HEAD + `count=exact`); «Con saldo»,
   «Cuentas por cobrar» y «Vencidas» salen de la RPC resuelta localmente sobre
   `accounts_receivable`; el filtro de sucursal funciona; en empresas aparece el
   contacto principal; los municipios se muestran. Ya no sale «Error desconocido al
   cargar clientes».
2. **Finanzas → Facturas de compra**: lista con proveedor, filtros por estado,
   proveedor, texto y fechas, paginación con total; el desplegable de proveedores
   está lleno; las tarjetas «Facturas próximas a vencer / Total por pagar / Vencidas /
   Críticas» se calculan con las facturas locales.
3. **Inventario → Stock**: la tabla carga (con producto, categoría y sucursal
   embebidos), los totales (productos, valor, sin stock, bajo mínimo, sucursales) se
   calculan, y el filtro de sucursal lista las sucursales activas. Ya no sale «No se
   pudieron actualizar los datos de stock».
4. **POS → Historial de ventas**: aparecen las ventas de los últimos 12 meses con
   cliente y líneas, y la venta hecha sin red figura arriba con el badge «Pendiente
   de sincronizar» (desaparece como virtual y aparece como real al sincronizar).

Otros módulos (mismo mecanismo):

- **Inventario → Productos / Categorías / Proveedores / Movimientos / Ajustes / Kardex /
  Lotes**: listas, búsquedas y detalles; el kardex muestra los movimientos de 12 meses.
- **Finanzas → Facturas de venta / Cuentas por cobrar / Cuentas por pagar / Pagos /
  Caja**: listas con cliente o proveedor embebido, filtros y totales de tarjetas
  calculados en cliente. Los reportes que llaman RPC de agregados solo se ven si se
  abrieron antes con red.
- **Compras → Órdenes de compra**: lista con proveedor y sucursal, detalle con líneas.
- **Clientes / Proveedores**: fichas completas.
- **Configuración → Datos sin conexión**: la tabla muestra filas y hora por entidad; el
  botón «Sincronizar ahora» avisa «Sin conexión» y no hace nada.

Verificación técnica: DevTools → Application → IndexedDB → `goadmin-replica` con un
store por tabla y `meta`; Network → las peticiones a `/rest/v1/...` no salen (las
responde el interceptor) y en consola no hay «Offline: no cached data» para tablas
del manifiesto. Al volver la red, en ≤ 10 min «Última replicación» avanza.

Tests:

```bash
TZ=UTC            npx jest src/lib/offline
TZ=America/Bogota npx jest src/lib/offline
npx jest src/__tests__/guardrails.test.ts src/__tests__/pos-display
```

- `postgrestLocal.parse.test.ts` — parser: select/alias/casts/embeds, operadores,
  `or` anidado, filtros sobre embeds, order, limit/offset/Range, count, single, HEAD,
  rechazos.
- `postgrestLocal.eval.test.ts` — evaluador contra fixtures: facturas con líneas y
  cliente embebidos, count exacto, `.single()` 406, `!inner`, hints, self-join,
  operadores, order con nulos, `*` sin `organization_id` sintético.
- `offlineDb.test.ts` — manifiesto coherente y presupuesto, stores/índices, poda,
  meta/estado, cambio de organización, IndexedDB → resolutor de punta a punta.
- `offlineReplicator.test.ts` — lotes de 500, ámbito por padre, filtros extra,
  ventana, incremental estricto y pasada completa a las 6 h, tope anotado, error
  aislado por tabla, reentrada, planificador único solo en Desktop.
- `offlineHook.test.ts` — enganche: réplica → caché por URL → 503; `.single()` 406;
  HEAD; RPC local antes que la caché por body; RPC y escrituras sin cambios.
- `screensOffline.test.ts` — las cuatro pantallas del criterio de aceptación.

Datos inventados: organización 120, sucursal 7. Sin migraciones: no toca la base.
