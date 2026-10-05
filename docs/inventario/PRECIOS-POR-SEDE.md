# Precios y costos por sede

> Estado: 2026-10-05. Migración **escrita y NO aplicada**:
> `supabase/migrations/20261005230615_precios_y_costos_por_sede.sql`, con su reversión en
> `supabase/rollbacks/20261005230615_precios_y_costos_por_sede_rollback.sql`. El timestamp es
> provisional: al aplicarla con `apply_migration` se renombran los dos archivos con la versión real
> y se actualiza la constante `NOMBRE` de `src/__tests__/inventario/preciosSede/migracionPreciosSede.test.ts`.

## 1. Qué resuelve

Cada sede (sucursal) puede tener su propio precio de venta y su propio costo para cualquier
producto: simples, padres, variantes (hijos), insumos y productos con receta. Sin precio o costo
propio, la sede usa el general de la organización, igual que hoy.

## 2. Modelo

| Tabla | Qué guarda |
|---|---|
| `product_prices` / `product_costs` | Precio y costo **generales** de la organización. No cambian. |
| `product_branch_prices` | Precio propio de **una** sede: `organization_id`, `branch_id`, `product_id`, `price`, `compare_price`, `effective_from`, `effective_to`. |
| `product_branch_costs` | Costo propio de **una** sede: igual, con `cost` y `supplier_id`. |

Reglas de las tablas nuevas:

- `branch_id` es NOT NULL: lo general vive en las tablas de siempre.
- Trigger `fn_producto_sede_tg_coherencia`: el producto, la sede y el proveedor tienen que ser de la
  `organization_id` de la fila (23514 si no).
- Una sola fila abierta (`effective_to IS NULL`) por (producto, sede): índice parcial único. **No** hay
  UNIQUE por `(product_id, effective_from)`: dos sedes pueden fijar precio en el mismo instante.
- Índices `(product_id, branch_id, effective_from desc)` para buscar el vigente y
  `(organization_id, branch_id)` para listados y RLS.
- RLS: leen los miembros **activos** de la organización. `authenticated` no tiene INSERT, UPDATE ni
  DELETE: se escribe solo con la RPC. `anon` no tiene acceso.

### 2.1 Por qué no `branch_id NULL` en `product_prices` / `product_costs`

Esa era la propuesta inicial. El análisis del 2026-10-05 la descartó: todo lo que hoy lee o escribe
esas tablas filtra **solo por `product_id`**. La primera fila de sede se habría mezclado con el
precio general en:

- **~30 funciones SQL** (`pg_proc` con `prosrc ilike '%product_prices%'` o `'%product_costs%'`).
  Las peores escriben:
  - `fn_producto_int_fijar_precio` y `fn_producto_int_fijar_costo` cierran **todas** las filas vivas
    del producto, así que cambiar el precio general habría cerrado también los de sede;
  - `assistant_set_product_price` cierra «la más reciente», que puede ser la de una sede.
- **Triggers**:
  - `trg_meta_price_sync` habría enviado a Meta el precio de una sede como precio del catálogo;
  - `trg_membresias_precio_legado` también habría tomado ese precio.
- **~45 archivos TS del ERP**. Por ejemplo, deshacer del asistente borra y reabre filas por
  `product_id`, y el scraper inserta y cierra por `product_id`.
- **El repositorio de la web.** Usa service role, así que no hay RLS. Embebe `product_prices` con
  `effective_to is null` y toma la fila más reciente. Habría mostrado y cobrado en los 83 sitios el
  precio de una sede como precio general. Ese repositorio no se toca en esta tarea y se despliega
  después.

Con tablas propias, el precio general queda intacto y solo ven los precios de sede los consumidores
que se adaptan a propósito. En la práctica equivale a la propuesta original: «`branch_id` NULL = el
general» son las filas de `product_prices` y `product_costs`.

## 3. Resolución

Para (producto, sede, instante):

| Prioridad | Origen | Fuente |
|---|---|---|
| 1 | `sede` | fila vigente de `product_branch_prices` / `_costs` de esa sede |
| 2 | `general` | fila vigente de `product_prices` / `product_costs` |
| 3 | `padre_sede` | solo con `p_heredar_padre`: lo mismo para el padre en esa sede |
| 4 | `padre_general` | solo con `p_heredar_padre`: el general del padre |

- **Vigente**: `effective_from <= instante < coalesce(effective_to, ∞)`. Entre varias filas gana la de
  `effective_from` más reciente y, si empatan, la de `id` mayor. Es la misma regla de
  `fn_pos_precio_base_vigente` y de `src/lib/pos/precioVigente.ts`.
- **Herencia hijo→padre**: hoy **no existe** en el POS ni en la validación del servidor. Una variante
  sin precio propio no se vende. Solo la usan las etiquetas (`etiquetasProductoService`) y la UI de
  variantes de la web. Por eso es opcional (`p_heredar_padre`, `false` por defecto) y el POS no la
  activa.
- **Fechas**: la vigencia se compara por instante (`timestamptz`), nunca por día calendario. Para
  programar «desde el lunes» se manda el instante con zona (`2026-10-06T00:00:00-05:00`, zona de la
  organización). Test: `src/__tests__/timezone/preciosSedeVigencia.test.ts`.

### 3.1 Funciones

| Función | Tipo | Uso |
|---|---|---|
| `fn_precios_vigentes_lote(org, sede, ids[], en?, heredar_padre?)` | STABLE, **INVOKER** | Listados: devuelve `product_id, precio, precio_comparacion, origen, origen_product_id, origen_id`. |
| `fn_costos_vigentes_lote(...)` | STABLE, **INVOKER** | Igual, con `costo` y `supplier_id`. |
| `fn_precio_vigente(producto, sede, en?, heredar_padre?)` / `fn_costo_vigente(...)` | STABLE, **INVOKER** | Un producto. Delegan en el lote: la regla es una sola. |
| `fn_productos_sede_fijar(org, tipo, sedes[], productos[], valor, comparacion?, desde?, incluir_variantes?, proveedor?)` | **DEFINER** | Fija o quita el precio o costo de sede en una transacción. |
| `fn_receta_costo_teorico_sede(org, sede, receta, en?)` | STABLE, DEFINER | Costo teórico de una receta en una sede. |

**SECURITY INVOKER en la lectura.** Con la sesión de un usuario se aplica la RLS de las cuatro
tablas. Un producto de otra organización sale sin precio, así que no hay fuga. Las llamadas desde
funciones DEFINER (validación del POS, recetas) leen como su dueño, con el producto ya validado. Una
sede de otra organización no tiene filas, porque el trigger lo impide, y resuelve al precio general.

**`fn_productos_sede_fijar`:**

- Exige los mismos permisos que la edición masiva de precios: `inventory.edit`, `product_management`
  o `inventory_management`, con `fn_productos_exigir_permiso`.
- Rechaza el lote entero si una sede, un producto o el proveedor no son de la organización (42501).
- Bloquea los productos en orden de `id`.
- Por cada (producto, sede) anula lo programado después de `desde`, cierra lo que rige en `desde` y
  abre la fila nueva. Es el mismo algoritmo que `fn_producto_int_fijar_precio`.
- `valor = NULL` quita el precio de sede, y vuelve a regir el general.
- `incluir_variantes` arrastra a todas las variantes no eliminadas de cada padre.
- No admite `desde` en el pasado, porque cambiaría ventas ya cerradas.
- Topes: 1 000 productos, 200 sedes y 20 000 celdas.

### 3.2 Recetas

**Costo teórico** (`fn_receta_costo_teorico_sede`) = Σ (cantidad bruta en la unidad del insumo × costo
vigente del insumo en la sede).

- La cantidad sale de `fn_receta_int_calcular`, la misma regla de merma y de conversión de unidades
  que descuenta el stock. Ojo: es `bruta = neta / (1 − merma/100)`, **no** `neta × (1 + merma)`.
- No usa el costo promedio del inventario: es el costo de catálogo de la sede.
- No cambia cómo se descuenta el stock.
- Un costo vigente de 0 cuenta como 0, mientras que `fn_receta_costo` lo trata como «sin costo».

**`fn_receta_costo`** (pantalla de recetas) y **`fn_costo_unitario_producto`** (kardex):

- El orden sigue siendo el mismo: promedio de la sede, luego costo vigente, luego fallback.
- Lo único que cambia es que el «costo vigente» ahora es `fn_costo_vigente(insumo, sede)`.
- Sin costo de sede, el resultado es el de hoy.

## 4. POS: cobro validado en el servidor

`pos_checkout_v1` rechaza una línea cuyo precio no sea el vigente (`fn_pos_validar_linea_venta`). Por
eso el cliente y el servidor tienen que resolver con la misma sede:

- **Nueva firma** `fn_pos_validar_linea_venta(..., p_branch_id, p_aceptar_general)`:
  - sin sede, aplica exactamente la regla de hoy (`fn_pos_precio_base_vigente`);
  - con sede, usa `fn_precio_vigente(producto, sede, momento)`, sin herencia.
- **La firma de 5 argumentos** queda como envoltorio que llama a la nueva sin sede.
- **`pos_checkout_v1`** se parchea solo en sus dos llamadas:
  - venta nueva: la sede del sobre, que la función ya comprobó contra la organización;
  - mesa: la sede de la venta guardada.

  El parche tiene guarda md5:
  - si el cuerpo vivo cambió desde el análisis, la migración aborta (fail-closed) y hay que regenerar
    el parche;
  - si ya está aplicado, no hace nada.
- **Sin conexión** (`offline = true`): se acepta también el precio general. El catálogo local del
  escritorio todavía no replica precios de sede (ver §7).
- **Cliente** (`src/lib/services/posService.ts`):
  - la grilla, las variantes, `getProductById` y el carrito superponen el precio de la sucursal
    actual con `filasDeSede` + `precioVigenteEnSede`;
  - si la lectura de sede falla, el carrito **no** cae al precio general: lanza
    `ProductoSinPrecioError('consulta_fallida')`, porque el servidor validaría otro precio;
  - las pantallas de catálogo sí caen al general;
  - con «Todas las sucursales» no se consulta la sede.

## 5. Impacto por módulo

Leyenda: **Hecho** = resuelve por sede en esta entrega. **General (correcto)** = debe seguir con el
precio o costo general. **Pendiente** = debería resolver por sede, se deja para otra fase.

### 5.1 Base de datos (funciones que leen `product_prices` / `product_costs`)

| Función | Estado |
|---|---|
| `fn_pos_validar_linea_venta` + `pos_checkout_v1` | **Hecho** |
| `fn_receta_costo`, `fn_costo_unitario_producto` | **Hecho** (costo de sede) |
| `fn_producto_int_fijar_precio/_costo`, `fn_productos_precio_masivo`, `fn_importar_productos_lote`, `fn_producto_para_formulario`, `fn_producto_resumen`, `catalogo_productos_lote`, `get_catalogo_productos`, `buscar_productos`, `variantes_de_productos`, `get_product_variations`, `get_parent_product_stock_summary`, `get_products_with_latest_prices/_costs`, `assistant_create_product`, `assistant_set_product_price` | General (correcto): editan o muestran el precio de la organización |
| `fn_membresias_int_precio_vigente`, `fn_membresias_generar_renovaciones`, `trg_membresias_precio_legado`, `trg_meta_price_sync` | General (correcto) |
| `fn_producto_historial` | Pendiente: el historial no muestra cambios de sede |
| `assistant_register_sale`, `assistant_register_sales_invoice` (reciben `p_branch_id`) | Pendiente: cuando el usuario no da precio, deberían usar `fn_precio_vigente(producto, sede)` |
| `assistant_create_purchase_order`, `fn_kardex_entrada_compra_int` | Pendiente de decidir: la recepción de compra hoy actualiza el costo general |
| `fn_reporte_stock_critico_detalle`, `fn_recetas_listado`, `fn_producto_generar_seriales` | Pendiente: costo o precio de la sede del filtro |
| `fn_productos_exportar_plu` (básculas) | Pendiente: la báscula imprime el precio general; debería exportarse por sede |

### 5.2 ERP (TypeScript)

| Consumidor | Estado |
|---|---|
| `src/lib/pos/precioVigente.ts` | **Hecho**: `precioVigenteEnSede`, `importePrecioVigenteEnSede` |
| `src/lib/services/posService.ts` (grilla, variantes, carrito, `getProductById`) | **Hecho** |
| `src/lib/services/documentos/edicionDocumento.ts` (factura de venta, factura y orden de compra) | **Hecho**: precio y costo de la sucursal del documento; el costo del proveedor sigue mandando |
| `src/lib/services/website/cartaSedeService.ts` | **Hecho**: el placeholder de `web_price` es el precio de la sede (`precio_origen`) |
| `src/lib/offline/*` (catálogo local del escritorio) | Pendiente (§7) |
| `etiquetasProductoService.ts` (con herencia del padre) | Pendiente: `fn_precios_vigentes_lote(..., heredar_padre => true)` con la sede de impresión |
| `ai/agent/tools/ventas.ts`, `facturas.ts` | Pendiente: hoy toman `effective_to = null` del general |
| `components/crm/oportunidades/opportunitiesService.ts`, `serialTrackingService.ts`, `shipmentsService.ts` | Pendiente |
| `inventoryDashboardService.ts`, `reportes/modulos/inventarioReports.ts`, `purchaseOrderService.ts` | Pendiente (costos por sede en valoración y compras) |
| `facebookFeedService.ts`, `integrations/meta`, `integrations/tiktok`, `membresias/*`, `gymReports.ts`, catálogo, exportación CSV, imágenes, `categoryRulesService.ts`, `product-scraper` | General (correcto) |

### 5.3 API nueva

| Ruta | Qué hace |
|---|---|
| `GET /api/inventario/precios-sede?product_id=` | Precio y costo general del producto, y lo propio de cada sede activa. Los costos solo se devuelven con `inventory.costs.view`. |
| `POST /api/inventario/precios-sede` | Fija o quita el precio o costo de sede (llama a la RPC). |
| `POST /api/inventario/precios-sede/resolver` | Lote de hasta 500 ids con la regla de la base. Una sede ajena da 404. Pedir costos sin `inventory.costs.view` da 403. |

Las tres rutas usan `withOrg` + `readOrgBody`: una organización ajena en el body o en la query
responde 403 y queda registrada. Servicio en `src/lib/services/inventario/preciosSede.ts` (contrato y
lectura compartida) y `preciosSedeService.ts` (servidor).

## 6. Despliegue: el ERP primero, la web después

1. **Aplicar la migración** (MCP `apply_migration`).
   - Sin filas de sede no cambia ningún resultado. Verificado en seco con SELECT sobre 3 000
     productos de las 3 organizaciones con más catálogo: 0 diferencias frente a
     `fn_pos_precio_base_vigente`.
   - Después correr `get_advisors` (security y performance).
2. **Desplegar el ERP.** Es seguro en cualquier orden respecto del paso 1: si la tabla todavía no
   existe, `filasDeSede` la trata como «sin filas» y todo usa el precio general.
3. **Habilitar la escritura** de precios de sede (UI o API) para organizaciones **sin** venta web por
   sede. La web sigue mostrando el precio general: no se contamina, pero aún no muestra el de la sede.
4. **PR en `goadmin-websites`**, separado y declarando la dependencia (§8). Solo después de
   desplegarlo, las organizaciones con carta web por sede ven `web_price ?? precio de la sede ??
   general`.
5. **Escritorio**: replicar los precios de sede en el catálogo local y luego pasar
   `p_aceptar_general` a `false` en el cobro offline (§7).

## 7. Riesgos y deuda conocida

- **`pos_checkout_v1` cambia entre el análisis y la aplicación**: la guarda md5 aborta la migración.
  Hay que regenerar el parche (son dos `replace`) y recalcular los md5.
- **Venta sin conexión** en una sede con precio propio: se acepta el precio general, que es lo que
  muestra el catálogo local. Hasta replicar `product_branch_prices` en el escritorio
  (`replicationManifest.ts`, `catalogStore.ts`, `catalogReplicator.ts`), esa sede puede cobrar el
  general cuando está offline.
- **POS en «Todas las sucursales»**: muestra el precio general. Si el carrito pertenece a una sede
  con precio propio, el servidor responde `precio_no_coincide` con el precio esperado: un rechazo
  explícito, no un cobro equivocado.
- **Etiquetas y básculas** imprimen el precio general mientras el POS cobra el de la sede (§5).
  Hay que adaptarlas antes de que una organización con etiquetas de góndola o PLU use precios de sede.
- **Lectura del navegador**: la RLS de las tablas nuevas exige ser miembro **activo**. Un usuario sin
  fila activa en `organization_members` no ve los precios de sede. Su carrito cae al general y el
  servidor rechaza la línea.
- **`fn_costo_unitario_producto`** (kardex) cambia solo cuando el promedio de la sede es 0 y existe un
  costo de sede.

## 8. Lo que queda para el repositorio de la web (`goadmin-websites`, sin modificar aquí)

Lecturas de precio encontradas el 2026-10-05:

- `lib/supabase/queries.ts`: ~12 consultas embeben `product_prices (id, price, compare_price,
  effective_to)` con `.is('product_prices.effective_to', null)` + `normalizeProductPrices`. También
  `getMembershipPlans` (`precioVigente(product.product_prices)`).
- `app/productos/[id]/page.tsx`: 4 consultas iguales.
- `app/api/products/search/route.ts`, `lib/menu/menuFull.ts`, `lib/memberships/precio.ts`,
  `lib/get-current-price.ts`.
- Componentes que leen `product_prices[0]`: `ProductCard`, `ProductsGrid`, `FeaturedProducts*`,
  `OffersGrid`, `CategoryProducts`, `MenuView`, `MenuPreviewTabs`, `SpecialtiesFeatured`,
  `StickyAddToCart` y `VariantSelector` (estos dos heredan del padre), `ProductGrid`,
  `RelatedProducts`, `CartPageClient`, favoritos.

Qué cambiar, por sede del sitio:

1. Precio a mostrar = `website_branch_products.web_price` si no es NULL; si es NULL,
   `fn_precios_vigentes_lote(org, sede, ids, now(), heredar_padre => true)`. La web hoy hereda del
   padre en variantes. Como usa service role, la función corre sin RLS: la organización **tiene** que
   salir de `get-org-context`, nunca del request.
2. El cobro de `/api/orders` debe resolver el precio con la misma regla (`web_price ?? fn_precio_vigente`)
   en el servidor; se trabaja en `goadmin-websites` en un cambio aparte.
3. Declarar en `types/database.ts` las dos tablas nuevas con sus columnas reales.
4. Ampliar `npm run verify:tracking` o crear un `verify:precios` con el mismo patrón para los
   `select` nuevos.

## 9. Verificación

- **Jest**:
  - `src/__tests__/inventario/preciosSede/` (resolución pura y carrito del POS, rutas con org ajena
    → 403, documentos, contrato de la migración);
  - `src/__tests__/timezone/preciosSedeVigencia.test.ts` (corre en `npm run test:tz-all`);
  - `src/lib/services/website/__tests__/cartaSedeService.test.ts`.
  - Junto con `guardrails.test.ts`, POS y documentos: 215 suites y 4 054 tests en verde, con
    `TZ=UTC` y con `TZ=America/Bogota`.
- **Base de datos (solo SELECT, sin aplicar nada)**:
  - paridad con `fn_pos_precio_base_vigente` (0/3 000 diferencias);
  - prioridad sede > general, con histórico cerrado, precio futuro y otra sede ignorados;
  - herencia `padre_sede` / `padre_general` solo con la bandera, sobre un hijo real sin precio propio;
  - costo teórico de una receta real con un costo de sede simulado para un insumo;
  - md5 de los cuerpos «previos» del rollback idénticos a los vivos (`fn_pos_validar_linea_venta`,
    `fn_receta_costo`, `fn_costo_unitario_producto`).
