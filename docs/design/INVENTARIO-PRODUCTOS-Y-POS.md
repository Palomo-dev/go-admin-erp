# Productos y buscador del POS — inventario funcional, hallazgos UX y arquitectura de componentes

Insumo para rediseñar en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`)
el dominio de **productos** sin perder ninguna función: catálogo, nuevo, editar, duplicar,
detalle, acciones masivas, stock por sucursal y ajustes, importador CSV, importador con IA
(scraping y carga masiva del GO Assistant), diálogo de Facebook/Meta, menú de opciones y el
buscador de productos del **POS**. Complementa a `docs/design/INVENTARIO-NAVEGACION-Y-HEADER.md`
(shell, header, `MobileHeader` modos root/page/pos, `MobileTabBar`) y a
`docs/design/PARIDAD-BLOQUE-SESION.md`.

Fecha del inventario: 2026-09-21. Solo lectura de código; verificación de BD con `SELECT` por
el MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente.
Todas las rutas son relativas a la raíz del repositorio.

Regla: **ninguna función actual se pierde**. Lo que no quepa en el diseño se anota en la tabla
de paridad (§4) antes de quitarlo, no después.

---

## 0. Esquema verificado (para no diseñar sobre columnas que no existen)

| Tabla | Columnas relevantes para el diseño | Trampas |
|---|---|---|
| `products` | `id, uuid, organization_id, sku!, name!, category_id, unit_code, description, barcode, status, parent_product_id, is_parent, variant_data(jsonb), tax_id(int, legado), station, track_stock!, is_composite, production_type, product_type, brand, reference, track_serial, serial_pattern, auto_generate_serial, warranty_months, rating_avg, reviews_count, weight_kg, length_cm, width_cm, height_cm` | **No hay** `price`, `cost`, `is_active`, `supplier_id` real (el tipo `Producto` lo declara en `src/components/inventario/productos/types.ts:16` pero la columna no existe). El estado es `status` (`active/inactive/discontinued/deleted`). |
| `product_prices` | `product_id, price!, compare_price, effective_from!, effective_to` | Vigencia: precio actual = fila con `effective_to IS NULL` o futura, ordenada por `effective_from DESC`. Sin listas de precios (`price_lists`/`product_price_lists` **no existen**). |
| `product_costs` | `product_id, cost!, effective_from!, effective_to, supplier_id` | Misma vigencia. |
| `stock_levels` | `product_id!, branch_id!, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level` | UNIQUE incluye `lot_id` (NULL admitido): el upsert no deduplica. **No hay** `max_level`. |
| `stock_movements` | `branch_id!, product_id!, lot_id, direction!, qty!, unit_cost, source!, source_id, note` | Kardex. |
| `inventory_adjustments` | `branch_id!, type!, reason!, status, notes` (+ `adjustment_items`) | `type`: `gain/loss`; `status`: `draft/posted`. |
| `inventory_transfers` | `origin_branch_id!, dest_branch_id!, status!, notes` | |
| `product_images` | `product_id!, storage_path!, display_order!, is_primary, alt_text, shared_image_id` | Bucket `product-images` (y `organization_images` legado, `ProductosTable.tsx:304-306`). |
| Variantes | **No existe `product_variants`**: una variante es un `products` hijo con `parent_product_id` + `variant_data`. Catálogo de atributos en `variant_types(organization_id, name)` y `variant_values(variant_type_id, value, display_order)`; `product_variant_relations` existe pero el código usa `variant_data`. | |
| `product_modifier_groups` / `product_modifiers` | `name!, selection_mode!, min_selections!, max_selections, required!, display_order!` / `name!, extra_price!, is_active!, display_order!` | |
| Impuestos | `organization_taxes(id uuid, name, rate, is_default, is_active, tax_included)` + `product_tax_relations(product_id, tax_id uuid)`. **No existe `taxes`**. `products.tax_id` (int) es legado. | Un producto puede tener N relaciones; la UI solo captura una. |
| `categories` | `id, parent_id, name!, slug!, rank!, icon, color, image_url, description, is_active, display_order, station, requires_preparation, branch_id` + `product_category_relations(assigned_by_rule)` + `category_favorites` + `category_rules` | `slug` NOT NULL sin default. |
| `suppliers` / `product_suppliers` | `suppliers.contact` (no `contact_name`), `supplier_type!`; `product_suppliers(cost!, lead_time_days, min_order_qty, is_preferred, supplier_sku, notes)` | |
| Etiquetas | `product_tags(name!, color)` + `product_tag_relations` | `color` guarda **hex** desde el formulario y **clase Tailwind** desde la pestaña (§2.1). |
| Notas | `product_notes(content!, user_id!)` + `product_note_files(name, size, url, storage_path)` | Bucket `product-documents`. |
| Seriales / lotes | `serial_numbers` (30 columnas: `status!, branch_id, current_branch_id, warranty_start/end, cost_at_purchase, price_at_sale, sold_to_customer_id…`), `lots(lot_code!, expiry_date, supplier_id)` | |
| Recetas | `product_recipes(name, yield_qty, yield_unit_code, is_active, version)` + `recipe_ingredients(ingredient_product_id!, quantity!, unit_code!, is_optional)` | |
| Otros | `product_favorites(organization_id, product_id)` (favoritos del POS), `product_reviews`, `products_audit_log(entity_type, entity_id, action_type, changes jsonb, user_id)`, `units(code!, name!, conversion_factor!, unit_type)`, `branches(is_web_stock_source!, is_main, is_active)` | |
| RPC | `get_catalogo_productos(p_organization_id, p_page, p_page_size, p_search, p_category_id, p_status, p_branch_id, p_sort_by, p_sort_dir)`, `soft_delete_product(p_product_id)`, `fn_register_stock_entry`, `pos_product_ranking`, `pos_category_ranking`, `assistant_bulk_load_products`, `decrement_stock_with_recipe` | |

---

## 1. Inventario de funciones actuales por pantalla

### 1.1 Catálogo `/app/inventario/productos`

Página: `src/app/app/inventario/productos/page.tsx:13-19` → `CatalogoProductos` (`src/components/inventario/productos/CatalogoProductos.tsx`, 1.183 líneas), que compone `ProductosPageHeader` + `FiltrosProductos` + `AccionesMasivas` + `ProductosTable` + `ScrapingProductos` + diálogo de borrado + `FacebookFeedDialog` (`:1089-1181`).

#### 1.1.1 Header (`ProductosPageHeader.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Icono en caja azul + h1 «Catálogo de Productos» + subtítulo «N productos en el catálogo» | `ProductosPageHeader.tsx:59-82` | Mientras carga el resto: «Cargando de N…» con spinner (`:71-76`) |
| Botón icono «Refrescar» (`RefreshCw` girando) | `:88-98` | `setRefreshKey` (`CatalogoProductos.tsx:1099-1102`) |
| Botón primario **morado** «Importar con IA» | `:101-109` | Abre el **scraping web** (`ScrapingProductos`), no la carga masiva del asistente |
| Botón primario azul «Nuevo Producto» (`Link` + `Button` anidados) | `:112-120` | `handleCrear` guarda una plantilla vacía en `sessionStorage` y navega (`CatalogoProductos.tsx:629-664`) |
| Menú «Más opciones» (`DropdownMenu`): Importar desde CSV · Importar desde web (IA) · — · Exportar a CSV · Exportar a Facebook (CSV) · URL Feed para Facebook | `:123-172` | «Importar desde web (IA)» duplica el botón morado. **No hay** etiquetas/códigos de barras, ni impresión, ni carga masiva del asistente |
| Exportar CSV (26 columnas, incluye variantes como filas con «SKU Padre» y modificadores serializados) | `CatalogoProductos.tsx:886-1032` | Espera a que termine la carga en background (`:889-893`); columnas Proveedor/Impuesto/Stock Mínimo/Etiquetas/Notas se exportan **vacías** (`:977-986`) |
| Exportar a Facebook (CSV, 31 columnas Meta) | `:1034-1087`; `facebookCatalogExport.ts:65-162` | Consulta todos los productos activos no-servicio con moneda y dominio de la org |

#### 1.1.2 Buscador y filtros — **hay dos buscadores** (`FiltrosProductos.tsx` y `ProductosTable.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| **Buscador 1 (servidor)**: `Input` «Buscar productos…», debounce 400 ms | `FiltrosProductos.tsx:72-98, 134-143` | Busca `name/sku/barcode ilike` (`CatalogoProductos.tsx:229-233`) y en la RPC (`:115-125`). Cada cambio relanza la carga híbrida completa |
| Chip «Sucursal: Todas / nombre» (solo lectura, viene del selector global del header) | `FiltrosProductos.tsx:124-131` | Color azul = todas, fucsia = una |
| Filtro Categoría: `SearchSelect` con «Todas» | `:145-158` | Único uso de `SearchSelect` como filtro en toda la app |
| Filtro Estado: `Select` Todos/Activo/Inactivo/Descontinuado/Eliminado | `:161-179` | Por defecto (sin filtro) se ocultan los `deleted` (`CatalogoProductos.tsx:240-247`) |
| «Ordenar por»: `Select` Nombre/SKU/Precio/Fecha | `:182-199` | Orden **de servidor**; convive con la ordenación por cabecera de la tabla |
| Botón «Limpiar filtros» (texto «Limpiar» en móvil) | `:204-218` | |
| Layout: card gris con grid 1/2/4 columnas | `:122, 132` | |
| **Buscador 2 (cliente)**: `Input` «Filtrar rápido en lista…» (`h-7`, `text-xs`) con botón × | `ProductosTable.tsx:113-116, 425-444` | Filtra sobre lo ya cargado por `name/sku/barcode/brand/reference` (`:146-156`); no dispara servidor |
| Filtro rápido «Todas las imágenes / Con imagen / Sin imagen» (`DropdownMenu`) | `:449-469`, lógica `:158-172` | Considera «sin imagen» las URLs que fallaron al cargar (`:121-123, 633-640`) |
| Filtro rápido Estado (Todos/Activos/Inactivos/Descontinuados) — **duplica** al de arriba | `:470-484`, lógica `:174-177` | Este actúa en cliente; el de `FiltrosProductos` en servidor |
| Contador «X de Y productos» | `:485-488` | |
| Segundo botón «Limpiar» (rojo, ghost) | `:489-499` | Limpia solo los filtros de la tabla |

#### 1.1.3 Tabla (`ProductosTable.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Carga híbrida: RPC `get_catalogo_productos` trae 50 filas calculadas en <1 s y en paralelo `fetchProductos` trae **todo** por lotes de 1.000 con 6 consultas de relaciones por lote (precios, costos, stock, imágenes, hijos, modificadores) | `CatalogoProductos.tsx:95-198, 200-494, 496-534` | Skeleton solo hasta que responde la RPC; después «Cargando de N…» en el header. Cancelación por token al cambiar filtros (`:506-515`) |
| Realtime: recarga silenciosa (debounce 1,5 s) ante cambios en `products/stock_levels/product_prices/product_costs` | `:536-584` | |
| Selección: checkbox por fila, checkbox de página + menú ▾ «Seleccionar esta página (n) / Seleccionar todos (N) / Limpiar selección» | `:243-283, 506-559, 610-620` | Checkbox **nativo** `<input type=checkbox>`; sin estado indeterminado |
| Columnas: Imagen (48/56 px, enlace al detalle) · Código (md+) · Nombre (`CopyableId`, copia el uuid) · Atributos (md+: chips Servicio / N variantes / N modificadores) · Categoría (lg+) · Precio (con comparación tachada y -%) · Margen (xl+, verde ≥30 / ámbar ≥10 / rojo) · Costo (xl+) · Stock · Estado (sm+) · Acciones | `:560-601, 604-827` | En móvil quedan Imagen · Nombre · Precio · Stock · Acciones |
| Ordenación por cabecera: sku, name, category, price, stock, status (`ArrowUpDown`) | `:104-141, 561-599` | Stock ordena por `claveOrdenStock` (`stockVisible.ts:57`): «sin seguimiento» siempre al final |
| Celda Stock: «Sin seguimiento» · chips por sucursal (rojo ≤0 / ámbar <5 / verde) filtrados por sucursal global · «0» en rojo si la sucursal elegida no tiene fila | `:717-777` | Fila con fondo rojo/ámbar según stock total (`:352-364, 607`) |
| Estado con punto de color (verde/gris/rojo/morado) | `:316-350` | |
| Clic en fila → detalle (`handleVer` precarga el producto completo en `sessionStorage`) | `:608`; `CatalogoProductos.tsx:748-790` | |
| Menú ⋯ por fila: Ver detalle · Editar · Duplicar · — · Eliminar (rojo) | `:779-826` | Hay además un `RenderAcciones` con 4 botones sueltos **sin uso** (`CatalogoProductos.tsx:852-884`) |
| Eliminar: `Dialog` «¿Eliminar producto?» → RPC `soft_delete_product` | `CatalogoProductos.tsx:792-849, 1144-1171` | |
| Paginación **en cliente** sobre todo lo cargado: `<select>` **nativo** 25/50/100 + «Anterior · n / N · Siguiente» («« »» en móvil) | `ProductosTable.tsx:99-101, 237-241, 834-881` | Corrige la página si la lista encoge (`:232-235`) |
| Estados: skeleton de 8 filas (`:366-405`), vacío con icono y «Intente con otros filtros o cree un nuevo producto» (`:407-419`) | | No hay estado de error en la tabla (solo toast) |
| Vista cuadrícula | — | **No existe** en el catálogo (sí en el POS) |
| Columnas configurables / densidad | — | No existen |

### 1.2 Acciones masivas (`bulk/AccionesMasivas.tsx` + `bulk/bulkService.ts`)

Barra `sticky top-2 z-20` azul, visible con selección (`AccionesMasivas.tsx:244-319`): «N seleccionados» + botones outline `sm`: **Precios · Precio → Comparación · Redondear · Stock · Categoría · Estado ▾ · Eliminar (rojo) · ×**.

| Acción | Diálogo / campos | Archivo:línea | Servicio y semántica |
|---|---|---|---|
| Precios | Tipo (venta / compra=costo / comparación) · Modo (fijo / por valor $ / por %) · Dirección Aumentar/Disminuir (botones toggle propios) · Cantidad · aviso ámbar «sin costo previo no se afectan» | `:321-424` | `bulkUpdatePrices` (`bulkService.ts:152`): expande padres↔hijos (`:57`), cierra vigencia e inserta nueva fila en `product_prices`/`product_costs` por lotes de 200/100 (`:185-355`) |
| Precio → Comparación | Checkbox nativo «Sobrescribir también los que ya tienen» + caja azul explicativa | `:683-722` | `bulkCopyPriceToCompare` (`:578`) |
| Redondear | Precio a redondear · Modo «A múltiplo de N» (chips 10/50/100/500/1000 + personalizado) / «Reemplazar últimos dígitos» (cuántos 1-5 + valor + chips 000/500/900/990/999/050) + ejemplos | `:522-681` | `bulkRoundPrices` (`:730`) |
| Stock | Sucursal (`Select`, preselecciona la global) · Modo «Establecer» / «Sumar/restar» · Cantidad | `:426-484` | `bulkUpdateStock` (`:382`): solo `track_stock`, upsert `stock_levels` con `lot_id IS NULL` (`:435-504`). **No genera `stock_movements`** (no queda en kardex) |
| Categoría | `Select` de categorías (sin búsqueda) | `:486-520` | `bulkAssignCategory` (`:926`): solo `category_id` principal |
| Estado ▾ | Activar · Desactivar · — · Descontinuar | `:280-303` | `bulkUpdateStatus` (`:525`) |
| Eliminar | «¿Eliminar productos?» → «Eliminar todos» | `:724-744` | `bulkDelete` → RPC `soft_delete_product` por id (`:553-558`) |
| Resultado | Toast «N productos actualizados» o destructivo «parcial: n exitosos, m fallidos» + `avisarCambioCatalogo()` + recarga silenciosa + limpiar selección | `:121-137` | |

No existen (y valdría añadir sin cambiar el modelo): asignar etiqueta, asignar impuesto, cambiar proveedor preferido, exportar solo seleccionados, imprimir etiquetas de seleccionados, «Deshacer».

### 1.3 Nuevo producto `/app/inventario/productos/nuevo`

Página `src/app/app/inventario/productos/nuevo/page.tsx:12-51`: header sticky con flecha «Volver», icono, «Nuevo Producto», subtítulo oculto en móvil; monta `NuevoProductoForm` (wrapper `src/components/inventario/productos/NuevoProductoForm.tsx` → `nuevo/NuevoProductoForm.tsx`, 780 líneas). El mismo formulario se embebe en un modal `max-w-7xl` desde `src/components/shared/form-dialogs/ProductoFormDialog.tsx:47-54` (crear producto desde facturas).

Layout (`nuevo/NuevoProductoForm.tsx:652-778`): **columna única de 9 `Card`** en orden fijo, sin pestañas ni índice; barra `sticky bottom-0` con «Cancelar» y «Guardar Producto» (`:748-777`). No hay «Guardar y crear otro». Validación solo por toast (`:154-196`): SKU requerido, nombre ≥2, precio/costo ≥0, stock inicial >0 exige costo >0. Ningún campo se marca en rojo.

| # | Sección (archivo) | Campos y controles | Archivo:línea |
|---|---|---|---|
| 1 | Información Básica (`nuevo/InformacionBasica.tsx`) | SKU* (`Input` mayúsculas + botón regenerar `PROD-001-XYZ`) · Código de barras (`Input` + botón EAN-13 aleatorio) · Tipo (`Select` Producto/Servicio; servicio ⇒ `track_stock=false`) · Nombre* · Descripción (`RichTextEditor` + «Mejorar con IA» → `/api/ai-assistant/improve-text`) · Categoría (`SearchSelect` + «Nueva» → `QuickCreateDialog`+`QuickCategoryForm`) · Categorías adicionales (chips toggle, 20 + «Ver más») · Unidad (`SearchSelect` de `units`) · Impuesto (`SearchSelect` de `organization_taxes`, uno solo) · Proveedor principal (`SearchSelect` + «Nuevo» → `NuevoProveedorForm` completo embebido) · Marca · Referencia · Estación cocina/bar (`Select`, hereda de categoría) | `:229-579`; SKU `:159-170`; EAN `:177-182`; IA `:191-199`; diálogos `:583-608` |
| 2 | Precios y Costos (`nuevo/PreciosYCostos.tsx`) | Precio de venta* (`$`) · Precio de comparación (muestra «-N% descuento») · Costo (`$`) · Margen % (derivado; editarlo recalcula el costo) · nota azul | `:47-163`; margen `:23-29` |
| 3 | Inventario (`nuevo/Inventario.tsx`) | Switch «Rastrear inventario» · botón «Agregar Sucursal» · filas: Sucursal (**`<select>` nativo**) · Cantidad inicial · Stock mínimo · eliminar · aviso ámbar si hay variantes · 5 estados vacíos | `:93-290`; select nativo `:219-229` |
| 4 | Envío (`nuevo/Envio.tsx`) | `Collapsible` cerrado: Peso kg · Largo · Ancho · Alto cm · volumen calculado (`aria-live`); oculto si servicio | `:69-131` |
| 5 | Imágenes (`nuevo/Imagenes.tsx`) | «Generar con IA» (`/api/ai-assistant/generate-image`) · «Subir Imágenes» (máx. 5, 5 MB solo como texto) · grid 2/3/5 con overlay **solo hover** (Principal ★ / ×) | `:51-113, 152-172, 203-256` |
| 6 | Variantes (`nuevo/Variantes.tsx`, 980 líneas) | Switch «Tiene variantes» · Tipos de atributo (badges + `Select` existente + `Input` nuevo, **se persisten al instante** en `variant_types`) · Generador de combinaciones (chips de valores por tipo + nuevo valor → `variant_values`; producto cartesiano; contador «Se generarán N») · «Agregar variante manual» · tarjeta colapsable por variante: SKU* · Barcode (hereda) · Nombre* (se recalcula al guardar) · Precio · Costo · Atributos (`Input`+`datalist`+chips) · Stock por sucursal (grid de inputs) · eliminar con `AlertDialog` | `:481-976`; cartesiano `:329-361`; persistencia inmediata `:240-286` |
| 7 | Trazabilidad (`nuevo/TrazabilidadSeccion.tsx`) | Checkbox «Requiere número de serial» → Meses de garantía · Checkbox «Auto-generar» → Patrón por tokens (`{SEQ} {YYYY} {YY} {MM} {DD}` + texto fijo) con vista previa | `:80-233` |
| 8 | Notas (`nuevo/Notas.tsx`) | Un `RichTextEditor` → una fila en `product_notes` | `:33-41` |
| 9 | Etiquetas (`nuevo/Etiquetas.tsx`) | Buscar · «Disponibles (N)» badges toggle (20 + ver más) · «Seleccionadas (N)» · «Nueva Etiqueta» (`Dialog`: nombre, 10 colores + `<input type=color>` nativo, vista previa) | `:157-388` |

Guardado (`nuevo/NuevoProductoForm.tsx:198-650`), **13 pasos secuenciales sin transacción**: unicidad de SKU → `products` → `product_prices` → `product_costs` (con `supplier_id`) → `product_tax_relations` → `product_suppliers` (preferido) → `stock_levels` en 0 para todas las sucursales activas + RPC `fn_register_stock_entry` para qty>0 → Storage `product-images` + `product_images` → `product_notes` → `product_tag_relations` → `product_category_relations` → por variante: `products` hijo + precio + costo + impuesto + `stock_levels` + `stock_movements` **a mano** (`:557-598`, sin pasar por el RPC) → `avisarCambioCatalogo()` → redirige al detalle. `min_level` de sucursales con qty>0 se pierde (`:369` vs RPC).

### 1.4 Duplicar `/app/inventario/productos/[id]/duplicar`

`src/app/app/inventario/productos/[id]/duplicar/page.tsx`: dos cards `lg:grid-cols-2` (`:295`): «Nuevo Producto» (SKU* prellenado `-COPY`, Nombre* `(Copia)`, `:72-76, 297-324`) y «Opciones» con 6 checkboxes: variantes, precios, costos, imágenes, etiquetas, impuestos (`:326-420`). Botones Cancelar / «Duplicar Producto» no sticky (`:424-445`). Reimplementa el guardado (`:99-232`): **no copia** brand, reference, station, track_stock, product_type, envío, seriales, notas, categorías adicionales, proveedor, `compare_price`; **no crea `stock_levels`** (el producto queda invisible en POS/tienda); las imágenes **reusan el mismo `storage_path`** (`:191-195`); no revalida la tienda.

### 1.5 Editar `/app/inventario/productos/[id]/editar`

Página `src/app/app/inventario/productos/[id]/editar/page.tsx:18-53` (header sticky con ← al detalle, icono ámbar, «Editar Producto»). Formulario `src/components/inventario/productos/editar/FormularioEdicionProducto.tsx` (1.214 líneas): **reutiliza las 9 secciones de `nuevo/`** (`:20-28`) en una sola `Card` apilada (`:1058, 1104-1116`), pero **duplica** carga (11 consultas secuenciales, `:160-415`) y guardado (`:419-1055`). Botones Cancelar / «Guardar Cambios» **al final del scroll, no sticky** (`:1126-1206`). `zodResolver` definido pero no usado (`:32-84, 1138-1194`).

Diferencias de guardado frente a nuevo: `notes` y `tags` **no se persisten** (`:690`); proveedor preferido se borra y recrea perdiendo `lead_time_days/min_order_qty/supplier_sku/notes` (`:603-625`); stock del producto simple se **sobrescribe** en `stock_levels` sin `stock_movements` (`:697-769`); variantes eliminadas = `DELETE` físico (`:788-797`); no hay control de `status`. La sección Inventario sigue titulada «Inventario Inicial» con nota «se registrará como movimiento» (`nuevo/Inventario.tsx:100, 283-290`).

### 1.6 Detalle `/app/inventario/productos/[id]`

Página `src/app/app/inventario/productos/[id]/page.tsx:40-62` (carga por uuid con joins) → `id/DetalleProducto.tsx`.

| Zona | Función | Archivo:línea |
|---|---|---|
| Volver | Botón ghost «Volver al catálogo» | `DetalleProducto.tsx:193-200` |
| `ProductoHeader` | Card: mini-galería 1/4 (principal + hasta 5 miniaturas, «+N») · badge de estado (Activo/Inactivo/Borrador/Eliminado) + h1 · metadatos inline: SKU, Categoría, Unidad, Proveedor (campo legado), Tipo, Marca, Ref, Impuesto · **3 KPI**: Precio (con -% y tachado), Costo, Stock (por sucursal global, «Sin seguimiento» si no rastrea) · Descripción HTML colapsable | `id/ProductoHeader.tsx:158-457`; KPIs `:331-446` |
| Barra de acciones (`flex-wrap`, 6 botones) | Editar · Duplicar · Ajustar Stock (→ `/ajustes/nuevo?producto_id=`) · Transferir (→ `/transferencias/nuevo?producto_id=`, **el formulario no lee el parámetro**) · Desactivar/Activar · Eliminar (`AlertDialog`, soft-delete) | `DetalleProducto.tsx:207-277`; handlers `:100-187` |
| 11 pestañas (`Tabs` con icono, `overflow-x-auto`, no persistidas en URL) | Detalles · Variantes · Modificadores · Stock · Seriales · Imágenes · Precios · Proveedores · Etiquetas · Notas · Auditoría | `:73-85, 280-361` |
| Detalles | **Formulario inline** (segunda vía de edición): Nombre, SKU, Barcode (+EAN), Categoría (`SearchSelect`), Categorías adicionales, Unidad, Proveedor, Descripción (rich), Estación, Switch rastrear, Tipo, Marca, Referencia · «Trazabilidad»: Switch serial, garantía, Switch auto-generar, Patrón (`Input` libre con ayuda `{PROD}{YYYY}{####}` distinta a la del formulario) · «Creado/Modificado hace…» · «Guardar Cambios». No incluye impuesto, precio, costo, envío, notas, etiquetas, imágenes | `id/tabs/DetallesTab.tsx:276-641`; guardado `:153-257` |
| Variantes | Resumen de atributos (badges) · tabla 7 col (SKU, Nombre, Atributos, Precio, Costo, Stock, Acciones) · `Dialog` crear/editar (SKU, Nombre, Precio, Costo, Atributos + catálogo, Stock por sucursal, Barcode) · eliminar = `DELETE` físico | `id/tabs/VariantesTab.tsx:646-1090`; guardado `:386-631` |
| Modificadores | Card por grupo: nombre, `Select` modo Única/Múltiple, Switch Obligatorio, eliminar (`confirm()` nativo) · opciones nombre + «+$» + eliminar (sin confirmación) · chips de sugerencias · fila «Nueva opción» · card «Nuevo grupo» (chips de nombres existentes + `Input` + `Select`). Sin `min/max_selections`, sin editar opción, sin reordenar | `id/tabs/ModificadoresTab.tsx:184-350`; `src/lib/services/productModifiersService.ts:56-247` |
| Stock | Si no rastrea: vacío · 3 cards Total/Reservado/Disponible (sucursal global) · botones «Registrar Entrada» / «Registrar Salida» / «Ver Historial» (kardex) · tabla 5 col por sucursal activa (padre+hijos) con ↑/↓ que abren ajuste con `branchId`. Sin mínimo, sin costo promedio, sin lotes, sin transferir desde fila | `id/tabs/StockTab.tsx:163-309` |
| Seriales | Si no `track_serial`: vacío + «Editar producto» · badges de configuración + «Generar seriales» (`Dialog`: cantidad, sucursal, «Generar los N faltantes») · 4 stats · filtros (búsqueda, `Select` de 8 estados, Exportar CSV) · tabla 8 col clicable → `/inventario/seriales/{id}` · paginación `ui/pagination` + tamaño 10/20/50/100 · `CreateClaimDialog` | `id/tabs/SerialesTab.tsx:307-773` |
| Imágenes | «Subir Imágenes» (`label` dentro de `Button`) · grid 2-5 col con ring en principal · overlay hover: Ver (preview), Principal, Eliminar (`Dialog`). Sin límite, sin IA, sin reordenar, sin `alt_text`. `ImageGallery.tsx` (333 líneas) es equivalente y **no se usa** | `id/tabs/ImagenesTab.tsx:242-436` |
| Precios | Card precio actual + «Actualizar Precio» (`Dialog`: actual, nuevo, comparación; cierra vigentes e inserta) · card «Evolución de Precios» **vacía** (recharts stubeado `:91-97`) · tabla historial 6 col (colSpan 5). Sin historial ni edición de costo | `id/tabs/PreciosTab.tsx:336-571`; hook propio `useOrganization` `:121-151` |
| Proveedores | Tabla 7 col (Proveedor+NIT, Costo, Días entrega, Pedido mín., SKU proveedor, Preferido ★, Acciones) · `Dialog` crear/editar (`Select` proveedor, costo, días, mínimo, SKU, notas) | `id/tabs/ProveedoresTab.tsx:304-553` |
| Etiquetas | Buscar (dropdown absoluto hecho a mano) · Crear (color aleatorio de clase Tailwind) · pills asignadas con × · card «¿Para qué sirven?» | `id/tabs/EtiquetasTab.tsx:331-453` |
| Notas | «Nueva Nota» (`Textarea` + adjuntos + Guardar) · historial de notas con avatar, rol «usuario» hardcoded, adjuntos descargables, eliminar | `id/tabs/NotasTab.tsx:406-591` |
| Auditoría | Tabla Fecha · Usuario (avatar local) · Acción (badge) · Cambios «campo: viejo → nuevo» desde `products_audit_log` (100 últimos), sin filtros ni paginación | `id/tabs/AuditoriaTab.tsx:259-409` |

### 1.7 Stock por sucursal, ajustes, movimientos, kardex, transferencias

| Pantalla | Función | Archivo:línea |
|---|---|---|
| Niveles de stock `/app/inventario/stock` | Header (Actualizar, Exportar CSV, Movimientos, Nuevo Ajuste) · `BranchBadge` · 5 stats (Total productos, Valor, Bajo mínimo, Sin stock, Sucursales) · filtros: búsqueda, Sucursal (sincronizada con la global), Categoría, Estado (Todos/Con disponibilidad/Bajo mínimo/Sin stock), Limpiar (filtrado en cliente) · tabla **11 columnas** (Producto, SKU, Sucursal, Categoría, Disponible*, Reservado, Mínimo, Costo prom.*, Valor total*, Estado*, ⋯) con ordenación en las marcadas · tamaño 10/25/50/100 arriba · paginación propia con «ir a página» en móvil · menú ⋯: Ver producto, Crear ajuste (sin preselección), Crear transferencia (**sin handler**) | `src/app/app/inventario/stock/page.tsx:109-160`; `src/components/inventario/stock/StockHeader.tsx:38-80`, `StockStats.tsx:23-64`, `StockFilters.tsx:56-103`, `StockTable.tsx:92-478` |
| Nuevo ajuste `/app/inventario/ajustes/nuevo` | Query `productId|producto_id`, `type=entrada|salida`, `branchId` (padre ⇒ una línea por variante) · `lg:grid-cols-3`: card «Información» (Sucursal*, Tipo* Entrada/Salida, Razón* dependiente 8/9 opciones, Notas **rich text**) · «Agregar productos» (`ProductSearchCombobox`, solo `track_stock`, excluye padres) · tabla 7 col (Producto, Stock sistema, Conteo físico `Input`, Diferencia ±, Costo unit. solo lectura, Impacto $, ×) + `SerialCaptureSection` si `track_serial` · resumen sticky (productos, diferencia, impacto) · «Guardar como borrador» / «Guardar y aplicar» | `src/components/inventario/ajustes/nuevo/NuevoAjusteForm.tsx:87-97, 262-374, 653-950`; `adjustmentService.ts:94-122, 398-583` |
| Lista y detalle de ajustes | Stats, filtros (Sucursal, Tipo, Estado), tabla 8 col con ⋯ (Ver/Editar/Aplicar/Cancelar/Eliminar en borrador), `DataTablePagination`; detalle con ítems y movimientos generados. **«Cancelar» borra** el ajuste; ruta `/ajustes/[id]/editar` **no existe** aunque se enlaza | `src/app/app/inventario/ajustes/page.tsx`; `ajustes/AjustesTable.tsx:112-249`; `ajustes/detalle/AjusteDetalle.tsx:293-319`; `adjustmentService.ts:604-609` |
| Movimientos y kardex | Filtros (búsqueda 300 ms, Sucursal, Origen, Dirección, Desde/Hasta con `Popover+Calendar` a mano, «Solo ingredientes») · tabla 11 col · `DataTablePagination` 50. Kardex requiere `?producto=` | `src/components/inventario/movimientos/MovimientosFilters.tsx:76-160`, `MovimientosTable.tsx`; `src/app/app/inventario/kardex/page.tsx:33`, `kardex/KardexTable.tsx:125-150` |
| Transferencias | `NuevaTransferenciaForm` no lee `searchParams` ⇒ «Transferir» del detalle no preselecciona | `src/components/inventario/transferencias/nuevo/NuevaTransferenciaForm.tsx` |
| Servicios | `stockService` (`getStockLevels`, `getStockLevelsSimple`, `getStockStats`, `getStockMovements`, `exportStockToCSV`…) · `stockMovementService` (`decrementOnSale` → RPC `decrement_stock_with_recipe`, `reserveStock`, `releaseStockReservation`, `incrementOnPurchase`) | `src/lib/services/stockService.ts:122-538`; `stockMovementService.ts:165-359` |

### 1.8 Importador CSV/Excel `/app/inventario/productos/importar` (`importar/page.tsx`, 2.272 líneas)

Máquina de estados `upload → preview → importing → complete` (`:151`); **no hay paso de mapeo** (automático por alias de cabecera) ni de opciones (solo el modo de importación dentro de preview).

| Función | Control | Archivo:línea |
|---|---|---|
| Volver · «Exportar Productos» (26 col) · «Descargar Plantilla» (26 col + 5 ejemplos) | Link + 2 botones de header | `:1863-1887`, export `:1642-1821`, plantilla `:1823-1839` |
| Dropzone principal (`.csv,.xls,.xlsx`) — texto «Arrastra…» **sin `onDrop`** | Card clicable | `:156-172, 1906-1933` |
| Segunda dropzone verde «archivo de saldos» (formato de un software contable; mapea Total→stock, Valor unitario→costo) | Card | `:174-179, 841-908, 1979-2019` |
| Detección de 3 formatos: «formato A» (3 columnas Nombre/Compra/Venta con categorías como filas separadoras), «formato B» (sin SKU, variantes por prefijo de talla), genérico/contable (cabecera en las 10 primeras filas, ~27 alias) | automática, toasts | `:437-575`, `:186-425`, `:639-835` |
| Dedupe de SKU en archivo (descarta en silencio), autodetección de variantes por prefijo de SKU | toasts | `:711-716, 777-819` |
| `<details>` «Ver columnas y formatos compatibles» (26 ítems) | | `:1935-1974` |
| Preview: 4 stats (Total/Importados/Errores/Pendientes) · modo (3 botones toggle: crear+actualizar / solo crear / solo actualizar) · tabla **18 col `min-w-[1800px]`**, solo lectura, **máx. 100 filas**, estado por fila con tooltip `title` | | `:2027-2052, 2177-2230, 2054-2174` |
| Validaciones tardías al pulsar Importar: stock sin costo (aborta, cita solo la primera fila), sin sucursal global | toasts | `:1011-1031, 922-933` |
| Ejecución fila a fila sin lotes ni transacción: upsert `products` por `(organization_id, sku)`, categorías y proveedores al vuelo, impuestos por nombre, precios/costos con vigencia solo si cambian, stock inicial por RPC solo en productos **nuevos**, etiquetas y notas solo nuevos, imágenes por URL (descarga en el navegador; en update borra las anteriores), modificadores (en update **borra dentro del bucle**: solo sobrevive el último grupo) | botón «Importar N Productos» | `:910-1640`; modificadores `:1519-1589` |
| Resultado: «Ver Productos» / «Importar Otro Archivo». **Sin descarga de errores, sin barra de progreso** | | `:2236-2253` |

### 1.9 Importador con IA: scraping web y carga masiva del GO Assistant

**Scraping** (`scraping/ScrapingProductos.tsx`, `Dialog` «Importar productos con IA», pasos `url → preview → resultado`, `:120`): Input URL (`:497-513`) → Edge Function `product-scraper` `preview` con timeout 180 s (`:278-340`) → lista de cards editables (nombre, precio, comparación, categoría, stock inicial; SKU/barcode/marca/imágenes no editables, `:576-632`) con scroll infinito +50 (`:141-159`), enriquecimiento en background (hasta 100, concurrencia 5, **oculta el botón Importar** mientras corre, `:187-269, 741-751`), «Seleccionar todos», `Select` «Si ya existe: omitir / actualizar / crear» (`:532-544`) → importa en lotes de 10 con barra «Lote x de y» (`:350-442`) → resultado con contadores y errores (sin descarga, sin deshacer, `:681-708`). No muestra coste en créditos.

**Carga masiva del asistente** (`src/lib/ai/agent/tools/cargaMasiva.ts`; UI en `src/components/app-layout/Header/assistant/BulkPreviewTable.tsx` y `Header/ActionConfirmationForm.tsx:50-68`): **sin entrada desde el catálogo**; se llega adjuntando CSV/XLSX (≤20 MB, `attachments.ts:12-24`) o foto/PDF (vía `leer_documento`, 3 créditos) en el chat. Reconoce 8 columnas (name, sku, barcode, brand, description, price, cost, stock; `cargaMasiva.ts:82-121`), parseo numérico regional (`:124-143`), concilia por SKU → barcode → nombre normalizado (`:228-298`), marca errores por fila, tope `bulkMaxRows` 500 (`:502-508`), `stock_mode add|set` inferido por el modelo (`:442-446`). Preview colapsable virtualizada de 5 columnas (`BulkPreviewTable.tsx:14-56`) + botones Confirmar / Corregir (volver al chat) / Rechazar. Ejecuta **una RPC transaccional** `assistant_bulk_load_products` (`:585-591`) y ofrece **Deshacer** compensatorio (`undoService.ts:362-416`). No crea categorías ni impuestos; sin selector de sucursal.

### 1.10 Facebook / Meta

| Función | Archivo:línea |
|---|---|
| `FacebookFeedDialog` (un solo panel, sin pestañas): token automático con caché en `sessionStorage` · URL principal readonly + copiar · un feed por moneda no base (`&currency=`) · banner ámbar «tasa >72 h» · caja azul con 6 pasos de Commerce Manager · «Regenerar token» **sin confirmación** · «Vista previa» (abre el CSV) | `src/components/inventario/productos/FacebookFeedDialog.tsx:50-77, 105-217, 258-406` |
| Persistencia: `organization_preferences.settings.facebook_feed_token` / `.facebook_feed_default_currency` (la moneda por defecto tiene API y servicio pero **no control en el diálogo**) | `src/lib/services/facebookFeedService.ts:701-806, 931-989` |
| Exportación CSV Meta (31 columnas; `buildFacebookRow` duplicada cliente/servidor; `sale_price` recibe el precio de comparación, invertido respecto al estándar de Meta) | `facebookCatalogExport.ts:13-45, 166-368`; `facebookFeedService.ts:385-579` |
| Sincronización directa: `POST /api/integrations/meta/catalog-sync`, `/meta/product-sync` (upsert/delete por `product_ids`, registra `integration_events`), `/tiktok/product-sync`. **Ningún componente las invoca**: no hay UI «Sincronizar catálogo» ni selección de productos ni estado de sincronización en el módulo | `src/app/api/integrations/meta/product-sync/route.ts:16-165`; `catalog-sync/route.ts:6-70` |

### 1.11 Buscador de productos del POS

Montaje: `src/app/app/pos/page.tsx:678` (escritorio ≥1024: `PanelGroup` productos 75 % / carrito 25 %, `:745-770`; móvil: vistas excluyentes `products|cart` + botón flotante «Carrito» con total, `:59, 777-815`) y `src/components/pos/ventas/nuevo/NuevaVentaPage.tsx:264` (sin alternancia móvil). Única prop: `onProductSelect`. Ficheros `pos/product-search.tsx`, `product-grid.tsx`, `pos/barcode-scanner.tsx` y `main-pos.tsx` (vacío) son **código muerto**.

| Función | Archivo:línea | Detalle |
|---|---|---|
| Caja de búsqueda con lupa y × | `src/components/pos/ProductSearch.tsx:456-487` | Placeholder «nombre, SKU, código de barras, variantes o modificadores». Debounce 300 ms (`:195-206`); triple carga al montar (`:208-216`). Sin `autoFocus`, sin atajos |
| Búsqueda en servidor: RPC `pos_product_ranking` | `src/lib/services/posService.ts:229-238`; SQL `supabase/migrations/20260911000000_pos_product_ranking_guarda_pertenencia.sql:84-120` | `sku/name/description ILIKE`, `barcode =` exacto, variantes y modificadores → padre. Orden: favorito → ventas 90 d → id. Enriquecimiento por página con 8 consultas paralelas (`:305-391`) |
| Búsqueda offline (Desktop): réplica IndexedDB `goadmin-catalog` | `src/lib/offline/posOfflineReads.ts:113-151`; `src/lib/offline/catalogStore.ts:27-73` | Sin modificadores ni ventas 90 d ⇒ orden distinto. `LocalCatalogNotice` (rojo/ámbar/gris + «Actualizar catálogo ahora», `LocalCatalogNotice.tsx:21-78`) |
| Botón «Escanear» (cámara) | `ProductSearch.tsx:466-474, 942-947`; `src/components/ui/barcode-scanner.tsx:20-58` | **Simulado**: abre la cámara y a los 3 s devuelve `7501234567890`. Solo rellena el buscador |
| Lector físico (wedge USB/BT): ráfaga de teclas ≤80 ms, ≥4 chars, Enter/Tab o silencio 150 ms | `src/hooks/useHardwareBarcodeScanner.ts:46-93`; `src/lib/pos/barcodeWedge.ts:24-46` | Se ignora si hay un `Dialog` abierto. Resolución (`ProductSearch.tsx:296-364`): no encontrado → toast · agotado → toast · variante → agrega directo (o abre diálogo si el padre tiene modificadores) · simple → carrito · padre → diálogo |
| Barra de categorías con 3 modos configurables por org (`searchselect` combobox / `buttons` chips con color e icono, scroll horizontal arrastrable, badge «Top», ★ / `images` tarjetas 80×80) · orden `favorites / name / rank / display_order` · ranking RPC `pos_category_ranking` · favorito optimista | `src/components/pos/CategoryFilterBar.tsx:60-78, 93-254`; `ProductSearch.tsx:176-186, 491-499`; config `configuracionService.ts:93-99, 141-145` | |
| Controles: «N prod.» · selector de límite por página (▲▼ cíclico 12/18/24 ó 8/12/16, **oculto en móvil**) · densidad compacta/amplia (2 iconos, no persistida) · «Limpiar» | `ProductSearch.tsx:501-586` | No hay vista lista |
| Grid: amplia 2/2/3/4, compacta 2/3/4/5/6 columnas; **siempre 2 en móvil** | `:652-655` | |
| Tarjeta: `CachedProductImage` (h-24…h-48) · hasta 5 badges sobre la imagen (Categoría, Agotado, -%, «N var.», «Personalizable», «Top») + ★ favorito · nombre `line-clamp-1` · descripción (amplia) · precio + comparación tachada · SKU · icono receta (`ChefHat` → `Dialog` de solo lectura) · botón «Agregar / Elegir / +» | `:665-853`; receta `:370-388, 959-1067`; favorito `:392-444` | Agotado = opacidad 60 % + deshabilitado; el **stock no se muestra**; sin precio sigue clicable |
| Clic: agotado → toast · variantes/modificadores → `VariantSelectorDialog` · simple → carrito ×1 | `:247-265` | |
| `VariantSelectorDialog`: botones por atributo (combinaciones inexistentes deshabilitadas) · lista alternativa · resumen (nombre, SKU, precio+extras) · grupos de modificadores (`Checkbox`, «Elige 1 / Hasta N», obligatorio *) · Cancelar / «Agregar al carrito». **Sin cantidad, sin stock por variante** | `src/components/pos/VariantSelectorDialog.tsx:71-182, 223-439` | Compartido con facturas y CRM |
| `SerialSelectorDialog`: se abre en el **cobro** (`CheckoutDialog.tsx:944-975`) para ítems `track_serial`; búsqueda por serial (un solo término para todos los productos) | `src/components/pos/SerialSelectorDialog.tsx:36-304` | |
| Paginación 1..5 + última (sin ventana móvil) · skeleton de 12 tarjetas que reemplaza todo el grid · error con «Reintentar» (+ toast) · vacío con «Limpiar filtros» | `:594-649, 859-935` | |
| No existe: ocultar agotados / vender sin stock, listas de precios o precio por cliente, cantidad al agregar, atajos de teclado, persistencia de densidad | — | |

### 1.12 Buscador compartido y otros buscadores de producto

| Componente | Usos | Archivo:línea | Diferencias |
|---|---|---|---|
| `ProductSearchDialog` (`mode sale|purchase`, `supplierId`, `branchId`, `showCreateButton`) | facturas de venta y compra, oportunidades CRM, acciones masivas del pipeline | `src/components/shared/product-search/ProductSearchDialog.tsx:29-39`; usos `ItemsFactura.tsx:190`, `ItemsListForm.tsx:242`, `OpportunityForm.tsx:786`, `BulkActionsDialog.tsx:607` | Overlay `fixed` propio sin `role=dialog` (`:551-574`); **carga todo el catálogo en memoria** y filtra en cliente (`:124-367`); no busca por `barcode`; lista de filas sin imagen con stock «Disponible»; toggle «Solo del proveedor»; «Crear Producto» → `ProductoFormDialog`; copia literal del diálogo de receta y del favorito del POS (`:436-499, 948-1056`) |
| `ProductSearchCombobox` | órdenes de compra, ajustes, transferencias, recetas | `src/components/inventario/ordenes-compra/ProductSearchCombobox.tsx:29-43` | Carga todos los activos con `track_stock` paginado 1.000 |
| `ProductSearchSelect` | oportunidades CRM | `src/components/crm/oportunidades/ProductSearchSelect.tsx` | Combo simple |
| `ui/search-select.tsx` | filtro de categoría, selects del formulario | `src/components/ui/search-select.tsx:17-28` | `Popover` + `Input` + botones; sin multi, sin async, sin teclado, ancho fijo 320 px |

---

## 2. Hallazgos UX y de código

### 2.1 Duplicados

1. **Dos buscadores en el catálogo** (`FiltrosProductos.tsx:136-142` servidor 400 ms vs `ProductosTable.tsx:428-434` cliente), **dos filtros de estado** (`FiltrosProductos.tsx:162-178` vs `ProductosTable.tsx:471-484`), **dos «Limpiar»** (`FiltrosProductos.tsx:205-218` vs `ProductosTable.tsx:490-499`) y **dos ordenaciones** («Ordenar por» `FiltrosProductos.tsx:183-198` vs cabeceras `ProductosTable.tsx:126-141`). El usuario no sabe cuál manda: el de arriba relanza todo, el de abajo solo filtra lo cargado.
2. **Dos formularios de edición**: `DetallesTab` (inline, `DetallesTab.tsx:52-69`) y `FormularioEdicionProducto`, con reglas de guardado distintas (`DetallesTab.tsx:222-237` vs `FormularioEdicionProducto.tsx:603-625`). Y **tres implementaciones del guardado de producto**: nuevo, editar y duplicar, ya divergentes (duplicar pierde 10 campos; editar no guarda notas/etiquetas).
3. Imágenes en tres sitios con reglas distintas (`nuevo/Imagenes.tsx` con IA y máx. 5; `ImagenesTab.tsx` sin límite; `ImageGallery.tsx` sin uso). Variantes en dos (`nuevo/Variantes.tsx` generador cartesiano vs `VariantesTab.tsx` diálogo) con nombres generados distintos. Etiquetas en dos con dos modelos de color. Notas: un rich text (no persistido) vs hilo con adjuntos. Patrón de serial: constructor de tokens `{SEQ}{YYYY}` vs `Input` libre `{PROD}{####}` (`TrazabilidadSeccion.tsx:23-29` vs `DetallesTab.tsx:599-603`).
4. Ajustar stock accesible desde 5 puntos (header del detalle, StockTab ×3, StockHeader, StockTable ⋯) y solo algunos preseleccionan producto/sucursal.
5. **Cuatro buscadores de producto** (POS, `ProductSearchDialog`, `ProductSearchCombobox`, `ProductSearchSelect`) con campos y orden distintos; el diálogo de receta y el favorito copiados literalmente (`ProductSearch.tsx:392-444, 959-1067` = `ProductSearchDialog.tsx:458-499, 948-1056`).
6. Importar: **cuatro normalizadores de nombre**, tres detecciones de cabecera, dos listas de alias distintas (`importar/page.tsx:662-687` vs `cargaMasiva.ts:82-91`) y `buildFacebookRow` duplicada cliente/servidor.
7. En toda la app: **4 familias de paginación** (`ui/DataTablePagination` en 23 archivos; `ui/pagination` con ventana reimplementada; **21** `*Pagination.tsx` propios; botones inline en productos, proveedores, órdenes, facturas de compra, stock), **12 `*PageHeader`** con props incompatibles, debounce reimplementado 5 veces (400/300/ref/submit/ninguno) pese a existir `src/lib/hooks/useDebounce.ts`, 4 controles de fecha, 3 detecciones de móvil (`AppLayout.tsx:524-530` <1024, `AppHeader.tsx:26-33` <768, `hooks/useMediaQuery.ts`).

### 2.2 Inconsistencias entre módulos (tablas, paginación, botones, inputs, selects)

| Aspecto | Evidencia |
|---|---|
| `<select>` nativo junto a `ui/select` y `SearchSelect` | `ProductosTable.tsx:837-848` (tamaño de página), `nuevo/Inventario.tsx:219-229` (sucursal), `inventario/FiltrosInventario.tsx:60,80`, `TopSKUTable.tsx:121` |
| Checkbox nativo vs `ui/checkbox` | `ProductosTable.tsx:509-516, 612-618`, `AccionesMasivas.tsx:701-705` vs `Checkbox` de shadcn en HRM/CxP |
| Switch vs Checkbox para el mismo tipo de decisión | Switch «Rastrear inventario» / «Tiene variantes» vs Checkbox «Requiere serial» / «Auto-generar» (`TrazabilidadSeccion.tsx:82, 127`) |
| Modales: `Dialog` shadcn, `AlertDialog`, `QuickCreateDialog` custom con portal sin `role=dialog` ni Escape (`nuevo/QuickCreateDialog.tsx:39-71`), overlay `fixed` en `ProductSearchDialog.tsx:552-574`, `confirm()` nativo (`ModificadoresTab.tsx:113`), `window.alert` (`pos/page.tsx:342, 351`) | |
| Botón primario: `button.tsx` define `variant=default` = `bg-primary` pero todo fuerza `bg-blue-600` en línea; el morado de «Importar con IA» (`ProductosPageHeader.tsx:104`) no existe como variante | |
| Tamaños de página distintos por pantalla: 25/50/100 (productos), 10/25/50/100 (`DataTablePagination`), 10/20/40/80 (clientes), 5-100 (facturas), fijo 10 (proveedores, órdenes) | |
| Tablas: `ui/table` en casi todo, `<table>` cruda en clientes (`ClientesTable.tsx:151`); columnas responsive a mano con `hidden md:table-cell`; solo CxC tiene cards en móvil (`CuentasPorCobrarTable.tsx:209/309`) | |
| Badges de estado: `renderEstado` con punto de color (`ProductosTable.tsx:316-350`) vs `Badge` con clases manuales en otros módulos vs `ProductoHeader.tsx:130-155` con otros textos («Borrador» no existe en `status`) | |
| Etiquetas para lo mismo: «Personalizable» (POS) vs «Modificable» (compartido); «N var.» vs «N variantes»; morado = variantes en POS, morado = modificadores en el compartido (`ProductSearch.tsx:723, 735` vs `ProductSearchDialog.tsx:689, 695`) | |
| Precio «vigente» calculado de 3 formas (`[id]/page.tsx:74-88` por rango; `ProductoHeader.tsx:348` mayor `effective_from` sin mirar `effective_to`, y `reduce` sin inicial que lanza sin precios; `PreciosTab.tsx:345` primero del historial) | |
| Stock «Disponible» = `qty_on_hand` en `StockTable.tsx:332` pero = on_hand − reservado en `StockTab` | |
| Edición de stock desde Editar y desde acciones masivas **no genera kardex**; desde ajustes y `VariantesTab` sí | |
| Paleta: `popover.tsx`/`command.tsx` en `slate-*`, resto en `gray-*`; `sheet.tsx:8` importa `cn` de otra ruta | |

### 2.3 Problemas en móvil

- Catálogo: la tabla oculta Código, Atributos, Categoría, Margen, Costo y Estado (`ProductosTable.tsx:560-600`) sin alternativa de tarjeta; la celda Stock apila un chip por sucursal (`:742-757`); la barra de filtros rápidos envuelve en 3 líneas; la barra de acciones masivas tiene 8 botones en `flex-wrap` (`AccionesMasivas.tsx:254-318`); header con 3 botones + menú (`ProductosPageHeader.tsx:86-172`). No hay título pequeño con flecha: el header global es idéntico en todas las rutas (`AppHeader.tsx:36-115`), y `MobileHeader`/`MobileTabBar` **existen solo en Figma**, no en código.
- Formularios: 9 secciones en un scroll con barra sticky arriba + sticky abajo + teclado; filas de stock con label invisible (`nuevo/Inventario.tsx:213-276`); inputs de ancho fijo `w-40/w-48` en variantes (`nuevo/Variantes.tsx:565, 638`); precios forzados a 2 columnas en 430 px (`PreciosYCostos.tsx:47`); overlay de imágenes solo hover (`nuevo/Imagenes.tsx:216`, `ImagenesTab.tsx:276`) ⇒ sin acceso táctil; chips sin `aria-pressed`.
- Detalle: 11 pestañas con scroll horizontal sin indicador (`DetalleProducto.tsx:282-302`); 6 botones de acción; tablas de 7-11 columnas sin vista tarjeta (Stock, Movimientos, Seriales, Ajustes, Variantes, Proveedores, ítems de ajuste).
- Importador: tabla `min-w-[1800px]` con la columna Estado al final (`importar/page.tsx:2079`); dropzone falsa; el selector de modo queda fuera de vista.
- POS: grid fijo de 2 columnas con tipografía 9,6-11 px y hasta 6 elementos sobre una imagen de 96 px (`ProductSearch.tsx:654, 693-774`); selector de límite oculto; el escáner de cámara (única opción sin lector físico) devuelve un código falso; `NuevaVentaPage` sin alternancia productos/carrito (`:261-268`).

### 2.4 Campos mal ubicados y pasos innecesarios

- Impuesto y Proveedor principal viven en «Información Básica» (`InformacionBasica.tsx:471-522`), pero alimentan `product_costs.supplier_id` y `product_suppliers`; Costo y Margen están en «Precios»; el resto de datos del proveedor (lead time, mínimo, SKU) solo en la pestaña Proveedores del detalle.
- «Trazabilidad» (serial) está a 4 secciones de «Inventario» aunque dependa de `track_stock`; «Servicio» apaga el stock pero la sección Inventario sigue visible (Envío sí se oculta).
- Con variantes, «Inventario» muestra dos avisos redundantes (`nuevo/Inventario.tsx:142-159, 174-184`) y deja habilitado «Agregar Sucursal».
- Categoría principal (`SearchSelect`) y adicionales (chips) son dos controles para un concepto; los tipos y valores de variante **se persisten antes de guardar el producto** (`nuevo/Variantes.tsx:240-286`).
- Cambiar solo el precio: pestaña Precios → diálogo; cambiar el costo: ir a Editar (no hay UI de costo en el detalle). Activar seriales: `SerialesTab` manda a Editar aunque `DetallesTab` ya tiene el switch.
- `handleCrear` guarda una plantilla en `sessionStorage` antes de navegar (`CatalogoProductos.tsx:629-664`) y `handleVer` precarga el producto entero (`:748-790`): pasos invisibles que retrasan la navegación.
- Importar: la vía completa (26 columnas) está escondida en «Más opciones» mientras el botón morado va al scraping; la carga masiva del asistente (la única transaccional y con deshacer) no tiene entrada; validaciones al final en vez de por fila; sin edición inline; «Regenerar token» de Facebook sin confirmar.
- Enlaces rotos o sin efecto que el diseño no debe heredar: `/ajustes/[id]/editar` (no existe), «Crear transferencia» en `StockTable.tsx:380-386`, «Transferir» del detalle sin preselección, gráfico de precios vacío (`PreciosTab.tsx:91-97, 451-491`).

### 2.5 Reglas del repo detectadas de paso (no son de diseño, pero condicionan)

- `meta/product-sync/route.ts:26-35`: con sesión de usuario no verifica pertenencia a la `organization_id` del body (regla 5 de `CLAUDE.md`).
- `PreciosTab.tsx:121-151` define un `useOrganization` propio; `CatalogoProductos.tsx:643` lee la organización de `localStorage`.
- `new Date().toISOString().split('T')[0]` para nombres de archivo (`CatalogoProductos.tsx:1025, 1071`): permitido solo por ser nombre de fichero, no día calendario de negocio.

---

## 3. Arquitectura de componentes reutilizables

Convención: claves de variante en inglés (`Variant / Size / State / Layout / Mode`), textos en español, iconos `Icon/*` (lucide, trazo 1,5). **Ya existen en Figma** (`02 Componentes`): `Button` (primary/secondary/outline/ghost/destructive × sm/md/lg), `IconButton`, `Badge` (brand/neutral/success/warning/danger; Color blue/green/amber × xs/sm/md), `Avatar`, `MenuItem` (State × Trailing atajo/chevron/none/switch), `SearchInput`, `Tabs`, `FormField` (default/focus/error), `Checkbox`, `Switch`, `Stepper`, `Tooltip`, `Kbd`, `Divider`, `Progress`, `PopoverCard`, diálogos con `Layout=desktop|sheet`, `AppHeader`, `Sidebar`, `MobileHeader` (`Mode=root|page|pos`), `MobileTabBar`, `MobileDrawer`, `OrgSwitcher`, `SearchCommand`/`CommandRow`, `Theme=light|dark`. **Faltan y se piden en esta fase**: `Select`, `SearchSelect` (combobox), `MultiSelect`, `Chip` (filtro/toggle), `NumberInput` (prefijo `$` / sufijo `%`), `Textarea`/`RichText`, `DateRange`, `SegmentedControl`, `BottomSheet`, `DataTable` (+ `TableCell` variantes), `Pagination`, `EmptyState`, `Skeleton`, `Toast`, `Breadcrumbs`, `PageHeader`, `BulkActionBar`, `ProductCard`, `ImageUploader`, `StatCard`, `SectionCard`/`FormSection`.

### 3.1 `SearchBar` + `FilterButton` / `FilterPanel` (un solo buscador para toda la app)

```
Escritorio:  [🔍 Buscar por nombre, SKU o código…        ×]  [⚲ Filtros •3]  [⇅ Orden ▾]  [▦|☰]
             (chips)  Categoría: Calzado ×   Estado: Activo ×   Sin imagen ×   Limpiar todo
Móvil:       [🔍 Buscar…                    ×] [⚲ 3]
             (chips en fila con scroll horizontal)
```

| Componente | Props | Comportamiento (conserva lo actual) |
|---|---|---|
| `SearchBar` | `value, placeholder, onChange, debounceMs=400, scope?: ('name'\|'sku'\|'barcode'\|'brand'\|'reference')[], leading=SearchIcon, trailing: clear \| scanner \| kbd('/')`, `Size=sm\|md`, `State=default\|focus\|loading` | **Uno solo** por listado. Híbrido: filtra al instante lo cargado en cliente (hoy «Filtrar rápido») y a los 400 ms refina en servidor (hoy `FiltrosProductos`). Estado `loading` = puntito en el borde, no skeleton. En POS `trailing=scanner` abre el lector real. Instancia de `SearchInput` de Figma |
| `FilterButton` | `count, State=default\|active\|open` | Botón outline con icono `SlidersHorizontal` y `Badge` con el número de filtros activos. Escritorio abre `FilterPanel` como `PopoverCard` (360 px); móvil abre `BottomSheet` |
| `FilterPanel` | `fields: FilterField[]` donde `FilterField = {key, label, type: 'select'\|'search-select'\|'multi'\|'range'\|'date-range'\|'toggle', options?, value}`; `onApply`, `onClear`; `Layout=popover\|sheet` | Escritorio: cambios aplican al vuelo; móvil: botón «Aplicar (N)» fijo abajo. Catálogo: Categoría (search-select con «Todas»), Estado (Activo/Inactivo/Descontinuado/Eliminado/Todos), Imagen (Todas/Con/Sin), Tipo (Producto/Servicio), Con variantes, Con modificadores, Stock (Bajo mínimo / Sin stock / Sin seguimiento). Sucursal **no** es filtro: es el selector global; se muestra como chip de solo lectura con enlace «Cambiar» |
| `FilterChips` | `chips: {key,label,value}[]`, `onRemove`, `onClearAll` | Fila de `Chip Variant=filter` con ×; «Limpiar todo» al final. Sustituye a los dos «Limpiar» |
| `SortMenu` | `options, value, direction` | En escritorio la ordenación vive en las cabeceras de `DataTable`; `SortMenu` solo aparece en móvil o en vista cuadrícula. Sustituye al `Select` «Ordenar por» |
| `ViewToggle` | `value: 'table'\|'grid'`, persistido en `localStorage` por listado | `SegmentedControl` de 2 iconos |

`FilterPanel` es el mismo en clientes, facturas, órdenes, stock, movimientos, empleados: solo cambia `fields`. Los cuatro controles de fecha se unifican en `DateRange` dentro del panel.

### 3.2 `DataTable` + `BulkActionBar`

| Componente | Props / variantes | Detalle |
|---|---|---|
| `DataTable` | `columns: {key, label, width, align, sortable, hideBelow: 'sm'\|'md'\|'lg'\|'xl', priority}`, `rows`, `rowKey`, `selectable`, `selection: {ids, mode: 'page'\|'all'}`, `sort`, `onSort`, `density: 'compact'\|'comfortable'`, `stickyHeader`, `onRowClick`, `rowActions: MenuItem[]`, `rowTone?: (row)=>'danger'\|'warning'`, `state: 'loading'\|'empty'\|'error'\|'ready'`, `emptyState`, `pagination` | Cabeceras con `SortIcon` (mantiene `claveOrdenStock`: «sin seguimiento» al final). Checkbox de shadcn **con indeterminado**; menú ▾ «Seleccionar página (n) / Seleccionar todos (N) / Limpiar (n)» se conserva. `hideBelow` sustituye a los `hidden md:table-cell` a mano. Menú ⋯ por fila con `MenuItem`. Skeleton de 8 filas, `EmptyState` con icono + texto + CTA, `ErrorState` con «Reintentar» (hoy inexistente). Columnas configurables (`ColumnPicker` en el ⋯ de la cabecera) persistidas por listado |
| `DataTable Layout=cards` (móvil) | mismas `columns`, usa `priority` 1-3 | Render como lista de tarjetas: título (priority 1), dos metadatos (2), badge y precio a la derecha; ⋯ por tarjeta. Es lo que hoy solo tiene CxC |
| `TableCell` variantes | `text, mono (SKU), money (con formato de la org), percent-tone (margen verde/ámbar/rojo), status-dot, thumbnail (48 px, enlace), chips (atributos), stock-by-branch` | `stock-by-branch`: `Badge Color` verde/ámbar/rojo por sucursal filtrada; «0» rojo si la sucursal no tiene fila; «Sin seguimiento» neutro |
| `Pagination` | `page, totalPages, pageSize, pageSizeOptions=[25,50,100], totalItems, onPageChange, onPageSizeChange, Layout=full\|compact` | **Única** paginación de la app: primera/anterior/1…N/siguiente/última + «Mostrando X-Y de Z» + `Select` de tamaño. `compact` (móvil) = «‹ 3/12 ›» + campo «ir a». Reemplaza a `DataTablePagination`, `ui/pagination` con ventanas propias y a los 21 `*Pagination.tsx` |
| `BulkActionBar` | `count, actions: {label, icon, onClick, variant?}[], overflow: MenuItem[], onClear`, `Layout=desktop\|mobile` | Flotante inferior (escritorio: barra centrada `bottom-6` de 640 px; móvil: reemplaza al `MobileTabBar` mientras hay selección, regla 20). Catálogo: Precios · Stock · Categoría · Estado ▾ · ⋯ (Precio→Comparación, Redondear, Etiqueta*, Impuesto*, Exportar seleccionados*) · Eliminar · ×. `*` = nuevas, no cambian el modelo |
| `BulkDialog` | `title, summary («Se aplicará a N productos»), fields, warning?, onApply, State=idle\|processing\|partial` | Uno por acción con los mismos campos de hoy (§1.2). Resultado parcial en el propio diálogo («n exitosos · m fallidos · ver detalle») además del toast |

### 3.3 `PageHeader` + `Breadcrumbs`

```
Escritorio:  Inventario › Productos                       (Breadcrumbs, Caption)
             [Icono] Catálogo de productos  4.368 · cargando 1.000 de 4.368 ⟳    [⟳] [Importar ▾] [+ Nuevo producto] [⋯]
Móvil:       MobileHeader Mode=page:  ←  Productos           [🔍] [⋯]
             (el título de módulo va en el MobileHeader; no se repite en el contenido)
```

| Componente | Props | Notas |
|---|---|---|
| `Breadcrumbs` | `items: {label, href?}[]`, `maxVisible=3` (colapsa en «…» con menú) | Se genera del `NAV_REGISTRY` propuesto en `INVENTARIO-NAVEGACION-Y-HEADER.md §3.0`, no a mano. Productos: Inventario › Productos › {Nombre} › Editar. **El POS no lleva breadcrumbs** (pantalla de trabajo); tampoco los diálogos |
| `PageHeader` | `title, subtitle?, icon?, breadcrumbs?, meta?: ReactNode (contador + estado de carga), primary?: Button, secondary?: Button[], overflow?: MenuItem[], back?: href, Layout=desktop\|mobile, Variant=list\|detail\|form` | Unifica los 12 `*PageHeader`. `Variant=detail` admite `badge` de estado y `avatar/thumbnail`; `Variant=form` lleva `back` y `primary=«Guardar»`. En móvil no renderiza: delega en `MobileHeader Mode=page` (`title`, `back`, una acción contextual, `⋯`) |
| `PageHeader.overflow` del catálogo | Importar desde CSV · Importar con IA (scraping) · Cargar con el asistente (nuevo acceso) · — · Exportar CSV · Exportar a Facebook · URL Feed para Facebook · — · Etiquetas y códigos de barras* · Configurar columnas | `*` pendiente de pregunta 4 (§6) |

### 3.4 `ProductCard` (cuadrícula del catálogo y del POS)

| Variante | Contenido | Uso |
|---|---|---|
| `Variant=catalog` (`Size=md`) | Imagen 1:1 · `Badge` de estado (esquina) · nombre 2 líneas · SKU mono · categoría · precio + comparación tachada · fila inferior: chips «N var.» «N modif.» «Servicio» · stock por sucursal (`Badge Color`) · checkbox de selección (esquina) · ⋯ | Vista cuadrícula del catálogo (nueva; hoy no existe) |
| `Variant=pos` (`Size=sm\|md`, `State=default\|out-of-stock\|selected`) | Imagen · **máximo 2 badges** sobre la imagen (Agotado, -%) · nombre 2 líneas · precio · chips de texto bajo el precio («3 var.», «Personalizable», «Top», ★) · botón «Agregar / Elegir» visible solo en hover/foco en escritorio y siempre en táctil (44 px) · **stock visible** («12 uds» / «Sin stock») | POS y `ProductSearchDialog`. `Size=sm` = densidad compacta actual |
| `Variant=row` | Miniatura 40 px · nombre · SKU · precio · stock · botón | Vista lista del POS y del diálogo compartido (sustituye a las filas `Card`) |

### 3.5 `ProductForm` por secciones (nuevo / editar / duplicar / embebido)

Una sola implementación de estado y guardado (`ProductForm mode=create|edit|duplicate`, `Layout=page|dialog`), con `FormSection` (título, subtítulo, icono, `collapsible`, `State=default|error|disabled`, ancla) y `FormField` de Figma.

| Sección | Campos (todos los actuales) | Reglas |
|---|---|---|
| **Esencial** | Nombre* · SKU* (+regenerar) · Código de barras (+EAN) · Tipo Producto/Servicio (`SegmentedControl`) · Estado (Activo/Inactivo/Descontinuado; hoy no editable en Editar) · Categoría principal (`SearchSelect` + «Crear categoría» → `QuickCreateDialog` con `QuickCategoryForm`) · Categorías adicionales (`MultiSelect` con chips; sustituye a los 20 chips) · Descripción (`RichText` + «Mejorar con IA») | Servicio ⇒ oculta Inventario y Envío (hoy solo oculta Envío) |
| **Precios y costos** | Precio de venta* · Precio de comparación (muestra -%) · Costo · Margen % (derivado, bidireccional) · Impuesto (`SearchSelect` de `organization_taxes`; **se mueve aquí**) · Vigencia desde (fecha, hoy `now()`; opcional, ver pregunta 2) | `NumberInput` con prefijo de moneda de la org |
| **Inventario por sucursal** | Switch «Rastrear inventario» · `StockByBranchTable Mode=initial` (§3.6) · Stock mínimo por sucursal · Costo unitario de la entrada (hoy `avg_cost` copiado al añadir la fila) · Trazabilidad: Switch «Requiere serial» → garantía, auto-generar, patrón por tokens (**se mueve aquí**; un solo constructor de patrón) · Lotes (solo lectura + enlace, no se capturan aquí hoy) | En `mode=edit` la tabla es de solo lectura con botón «Ajustar» por fila (el ajuste genera kardex; hoy Editar sobrescribe sin kardex) |
| **Variantes** | Switch «Tiene variantes» · Atributos (`MultiSelect` de tipos + crear) · Generador de combinaciones (chips de valores + contador + «Generar») · lista de variantes en `DataTable` editable (SKU, Barcode, Nombre, Precio, Costo, Stock por sucursal, ⋯) · «Agregar manual» | Tipos/valores nuevos se crean **al guardar**, no al teclear |
| **Modificadores** | Grupos (nombre, modo Única/Múltiple, obligatorio, mín/máx*) · opciones (nombre, +precio, activa) editables y reordenables · sugerencias | Hoy solo en el detalle; se incorpora al formulario para que Nuevo también los capture |
| **Imágenes** | `ImageUploader` (dropzone real, cámara en móvil, máx. 5, 5 MB validado) · reordenar (arrastre y botones ↑↓) · principal · `alt_text` · «Generar con IA» | Acciones siempre visibles en táctil |
| **Organización y proveedor** (lateral en escritorio) | Marca · Referencia · Unidad · Estación cocina/bar (hereda de categoría) · Proveedor principal (`SearchSelect` + «Nuevo proveedor» en `Sheet`) · costo del proveedor, días de entrega, pedido mínimo, SKU proveedor (los 4 que hoy se pierden) · Etiquetas (`MultiSelect` + crear con color) | |
| **Avanzado** (colapsado) | Envío: peso, largo, ancho, alto, volumen calculado · Notas internas (una nota; en el detalle vive el hilo) · Compuesto/receta (`is_composite`, enlace a `RecipeDialog`) · Visibilidad web (no hay campo hoy; ver pregunta 5) | |

**Recomendación de navegación del formulario (con argumentos):**

- **Escritorio: página única en dos columnas con índice lateral (scroll-spy) y una sola barra de acciones fija** («Descartar» · «Guardar y crear otro» · «Guardar»). Argumentos: (a) el guardado es una única operación (13 pasos hoy, una RPC en el futuro) y dividirlo en pestañas obliga a validar campos que el usuario no ve; (b) hay dependencias cruzadas (precio ↔ costo ↔ margen ↔ costo del stock inicial, tipo ↔ track_stock ↔ inventario) que se entienden mejor en una vista; (c) el formulario actual ya es un scroll único, así que la migración de comportamiento es nula; (d) el índice lateral con marcas de error resuelve el problema real (el botón a 9 pantallas y los errores solo por toast). Columna principal 2/3: Esencial, Precios, Inventario, Variantes, Modificadores; lateral 1/3: Imágenes, Organización y proveedor, Avanzado.
- **Móvil (crear): `Stepper` de 3 pasos** — 1 «Lo esencial» (nombre, SKU, tipo, categoría, precio, imagen principal), 2 «Inventario y costos» (rastrear, stock por sucursal, costo, impuesto, proveedor), 3 «Más detalles» (variantes, modificadores, imágenes, organización, avanzado). `MobileHeader Mode=page` «← Nuevo producto · Guardar»; CTA fija «Continuar» y desde el paso 1 «Guardar» habilitado cuando lo obligatorio es válido (hoy el 80 % de los altas móviles no necesitan los pasos 2-3). Argumentos: teclado + dos barras sticky dejan ~45 % de pantalla útil; el stepper acota el scroll y da progreso; **no** son pestañas libres porque el orden importa para las dependencias.
- **Móvil (editar): acordeón de `FormSection` colapsables** con la misma barra «Guardar» (sin orden impuesto: el usuario va a la sección que quiere). Sin `MobileTabBar` en ambos casos (regla 20).
- **Detalle**: cada bloque del resumen tiene un lápiz que abre **la misma `FormSection`** en un `Sheet` (escritorio derecha / móvil inferior) con su propio «Guardar»: sustituye a `DetallesTab` y al diálogo de precio, y elimina la segunda vía de edición.

### 3.6 `StockByBranchTable`

| Prop / modo | Columnas | Uso |
|---|---|---|
| `Mode=initial` (formulario) | Sucursal (todas las activas, sin `<select>`) · Cantidad · Mínimo · Costo unitario · total | Sustituye a las filas con select nativo; una fila por sucursal activa, editable en línea |
| `Mode=detail` (pestaña Stock / resumen) | Sucursal · En existencia · Reservado · Disponible · Mínimo (**nuevo en UI, existe en BD**) · Costo prom. · Última actualización · ↑ Entrada · ↓ Salida · ⇄ Transferir (con preselección real) | Filtra por sucursal global; totales en `StatCard` ×3 |
| `Mode=variants` | Fila por variante × sucursal (agrupado) | Detalle de padre |
| Móvil | `Layout=cards`: una tarjeta por sucursal con 3 cifras y acciones | |

`AdjustmentForm` (ajustes) reutiliza `PageHeader Variant=form`, `SearchBar` (+ scanner), `DataTable` editable y `StockByBranchTable` (para elegir sucursal) sin cambiar campos: Sucursal*, Tipo*, Razón*, Notas (`Textarea`, no rich), ítems (conteo físico, diferencia, impacto), seriales, borrador / aplicar.

### 3.7 `ImportWizard` (normal e IA comparten los pasos)

`ImportWizard source: 'file'|'ai-assistant'|'web'` con `Stepper` **Origen → Mapeo → Validación → Previsualización → Resultado**.

| Paso | Contenido común | Particularidades |
|---|---|---|
| Origen | `ImageUploader`-like dropzone real (CSV/XLS/XLSX; foto/PDF si `ai-assistant`), plantilla, «archivo de saldos» opcional, URL si `web` | Detección de formato (A / B / genérico) se muestra como `Badge` «Formato detectado: …» con «Cambiar» |
| Mapeo | Tabla «Columna del archivo → Campo de producto» (`Select` por columna, autoasignado por alias) + vista de 3 filas de muestra | Hoy inexistente: hace visible y corregible lo que el importador y el asistente hacen a ciegas |
| Validación | Opciones: modo de duplicados (**un solo vocabulario**: crear y actualizar / solo crear / solo actualizar), clave de duplicado (SKU / barcode / nombre), sucursal destino (`Select`, hoy implícita), stock `add|set`, crear categorías al vuelo (switch), importar imágenes por URL (switch) · resumen de errores por fila | Reglas ejecutadas **antes** de la previsualización (stock sin costo, SKU duplicado, categoría nueva…) |
| Previsualización | `DataTable` completa (no 100 filas) con filtro «Solo errores / Solo avisos», **edición inline** de celdas, columna Estado **fija a la izquierda**, contadores | En `ai-assistant` es la tarjeta del chat: mismo `DataTable Layout=compact` |
| Resultado | Barra de progreso con lote actual, contadores, **descargar errores CSV**, «Deshacer» (si la fuente lo soporta), «Ver productos», «Importar otro» | |

`MetaSyncDialog` (§3.8) y `ScrapingProductos` pasan a ser instancias: `web` reutiliza Origen (URL) → Previsualización (cards editables ya existentes, como `DataTable Layout=cards`) → Resultado.

### 3.8 `MetaSyncDialog`

`Dialog Layout=desktop|sheet` con `Tabs`: **Feed por URL** (todo lo actual: URL principal, feeds por moneda **solo de las monedas activas**, moneda por defecto (`Select`, hoy sin UI), aviso de tasa, pasos, «Vista previa», «Regenerar token» con `ConfirmDialog`) · **Exportar CSV** (botón + nota de columnas) · **Sincronización directa** (estado de conexión Meta/TikTok, «Sincronizar ahora», selección de productos por filtro, último evento de `integration_events`; usa las rutas existentes sin UI). Accesible desde el ⋯ del catálogo y desde Integraciones.

### 3.9 `PosProductSearch`

```
[LocalCatalogNotice si aplica]
[🔍 Buscar o escanear…  (⌘K)   ×] [▤ scanner]      [☰|▦] [12 ▾]
[Todas] [★ Favoritas] [Bebidas 42] [Panadería] [ … →]        ← CategoryBar (3 modos conservados)
┌ ProductCard Variant=pos ×N ┐  …  Paginación compacta / «Cargar más» en móvil
```

| Componente | Props / notas |
|---|---|
| `PosProductSearch` | `onProductSelect(product, qty, modifiers)`, `branchId`, `layout: 'panel'\|'fullscreen'`, `density`, `pageSize` (persistidos) |
| `SearchBar trailing=scanner` | Un solo comportamiento para cámara y wedge: **agrega al carrito** (o abre variantes/seriales). Cámara real (Capacitor `BarcodeScanner` ya usado en `marcar/QRScanner.tsx:42-44`) |
| `CategoryBar Mode=chips\|combobox\|images` | Los 3 modos actuales por configuración; ★ favorito también en modo combobox; badge «Top» solo para el top 10 % de ventas (no `> 0`) |
| `ProductGrid` | `ProductCard Variant=pos Size=sm\|md`; móvil 2 columnas con tipografía ≥12 px y 2 badges máximo; **scroll infinito en móvil**, paginación compacta en escritorio; skeleton solo en la primera carga (después, la lista se mantiene con `State=loading`) |
| `VariantModifierDialog` | Atributos · **stock por variante** · modificadores (obligatorio, mín/máx con feedback) · **cantidad** (±) · «Agregar N al carrito» |
| `SerialPicker` | Mismo diálogo que hoy, con un término de búsqueda por producto |
| `PosSettings` (nuevo, pregunta 3) | Ocultar agotados / permitir venta sin stock / densidad por defecto |
| Atajos | `/` o `F2` foco al buscador, `Enter` agrega el primer resultado, `F4` cobrar (documentar en `Kbd`) |

`ProductSearchDialog` (facturas, CRM) y `ProductSearchCombobox` (órdenes, ajustes, transferencias, recetas) se sustituyen por `ProductPicker Layout=dialog|combobox` con el mismo `SearchBar` + `ProductCard Variant=row`, `mode sale|purchase`, `supplierId`, `showCreate`, filtro por `product_type` y `track_stock` según contexto (ya documentado en `docs/PRODUCT_SELECTORS_ANALYSIS.md`).

---

## 4. Tabla de paridad — función actual → dónde vive en el diseño nuevo

| Función actual (archivo:línea) | Dónde vive | Cambio |
|---|---|---|
| Buscador servidor 400 ms (`FiltrosProductos.tsx:134-143`) + filtro rápido cliente (`ProductosTable.tsx:425-444`) | `SearchBar` única (híbrida) | Se fusionan |
| Filtro categoría / estado / imagen / «Ordenar por» (`FiltrosProductos.tsx:145-199`, `ProductosTable.tsx:449-484`) | `FilterPanel` + `FilterChips`; orden en cabeceras y `SortMenu` móvil | Un solo lugar |
| Chip de sucursal activa (`FiltrosProductos.tsx:124-131`) | Chip de solo lectura en `FilterChips` con «Cambiar» → `OrgSwitcher` | Se conserva |
| Carga híbrida RPC + streaming + Realtime (`CatalogoProductos.tsx:95-584`) | `DataTable state=loading` + `meta` del `PageHeader` («cargando 1.000 de N») | Comportamiento, se conserva |
| Selección página/todos/limpiar (`ProductosTable.tsx:243-283, 506-559`) | `DataTable selectable` con indeterminado | Se conserva |
| 11 columnas y ordenación (`ProductosTable.tsx:560-601`) | `DataTable columns` con `hideBelow` + `ColumnPicker` | + configurables |
| Celda stock por sucursal (`ProductosTable.tsx:717-777`) y `stockVisible.ts` | `TableCell Variant=stock-by-branch` | Misma regla |
| Margen con color (`ProductosTable.tsx:707-715`) | `TableCell Variant=percent-tone` | |
| Menú ⋯ Ver/Editar/Duplicar/Eliminar (`ProductosTable.tsx:779-826`) | `DataTable rowActions` | + «Ajustar stock», «Imprimir etiqueta*» |
| Paginación 25/50/100 con select nativo (`ProductosTable.tsx:834-881`) | `Pagination` | Unificada |
| Skeleton / vacío (`ProductosTable.tsx:366-419`) | `DataTable state` | + estado de error |
| Header: Nuevo, Importar con IA, Refrescar, «Más opciones» (`ProductosPageHeader.tsx:86-172`) | `PageHeader` primary «Nuevo producto», secondary «Importar ▾» (CSV / con IA / asistente), overflow (exportar, Facebook, columnas) | Importar deja de estar duplicado |
| Exportar CSV 26 col (`CatalogoProductos.tsx:886-1032`) | `PageHeader.overflow` + `BulkActionBar` «Exportar seleccionados» | Rellenar las 5 columnas vacías es tarea de código |
| Exportar Facebook / URL Feed (`CatalogoProductos.tsx:1034-1087`, `FacebookFeedDialog.tsx`) | `MetaSyncDialog` pestañas Exportar / Feed | |
| Eliminar con diálogo (`CatalogoProductos.tsx:1144-1171`) | `ConfirmDialog` (Figma) | |
| Acciones masivas: precios, comparación, redondeo, stock, categoría, estado, eliminar (`AccionesMasivas.tsx:244-744`) | `BulkActionBar` + `BulkDialog` ×6 | Mismos campos |
| Barra masiva `sticky top-2` (`AccionesMasivas.tsx:249`) | `BulkActionBar` flotante inferior | Reubicada |
| Nuevo: 9 secciones (`nuevo/NuevoProductoForm.tsx:652-778`) | `ProductForm mode=create` 8 secciones (§3.5) | Impuesto → Precios; Trazabilidad → Inventario; Modificadores entra |
| Barra Cancelar / Guardar (`:748-777`) | Barra fija + «Guardar y crear otro» | |
| Validación por toast (`:154-196`) | `FormField State=error` + índice con marcas | |
| SKU/EAN autogenerados, IA de descripción e imagen (`InformacionBasica.tsx:159-199`, `Imagenes.tsx:51-113`) | Mismos botones en `FormField trailing` | |
| Categoría rápida / proveedor rápido (`InformacionBasica.tsx:583-608`) | `QuickCreateDialog` → `Dialog Layout=desktop|sheet` con `role=dialog` | Mismo formulario |
| Categorías adicionales chips (`InformacionBasica.tsx:395-449`) | `MultiSelect` | |
| Stock inicial con select nativo (`nuevo/Inventario.tsx:207-278`) | `StockByBranchTable Mode=initial` | |
| Generador de variantes y tarjetas (`nuevo/Variantes.tsx:505-962`) | Sección Variantes con `DataTable` editable | Persistencia al guardar |
| Patrón de serial por tokens (`TrazabilidadSeccion.tsx:143-233`) | Único constructor en Inventario › Trazabilidad | Reemplaza al `Input` libre de `DetallesTab` |
| Envío colapsable (`nuevo/Envio.tsx:79-131`) | Avanzado › Envío | |
| Notas y etiquetas del formulario (`Notas.tsx`, `Etiquetas.tsx`) | Organización › Etiquetas (`MultiSelect`); Avanzado › Nota | Editar pasa a guardarlas |
| Embebido en facturas (`ProductoFormDialog.tsx:47-54`) | `ProductForm Layout=dialog` | |
| Duplicar: SKU/nombre + 6 opciones (`duplicar/page.tsx:295-420`) | `ProductForm mode=duplicate` precargado + `Dialog` «Qué copiar» (mismas 6 opciones + stock en 0) | Deja de perder campos |
| Editar: secciones reutilizadas (`FormularioEdicionProducto.tsx:1104-1116`) | `ProductForm mode=edit` | Una sola lógica |
| Detalle: header con galería, KPIs, metadatos (`ProductoHeader.tsx:158-457`) | `PageHeader Variant=detail` + `StatCard` ×3 + galería | |
| Barra de 6 acciones (`DetalleProducto.tsx:207-277`) | `PageHeader` primary «Editar», secondary «Ajustar stock», overflow (Duplicar, Transferir, Activar/Desactivar, Imprimir*, Eliminar) | |
| 11 pestañas (`DetalleProducto.tsx:280-361`) | `Tabs`: Resumen · Inventario (stock + seriales + lotes) · Precios y costos · Variantes y modificadores · Imágenes · Proveedores y etiquetas · Notas · Historial (auditoría + kardex) | 8 pestañas, todas las funciones dentro |
| `DetallesTab` inline (`DetallesTab.tsx:276-641`) | Resumen con lápiz por bloque → `FormSection` en `Sheet` | Elimina la segunda vía |
| Variantes CRUD en diálogo (`VariantesTab.tsx:817-1090`) | Pestaña Variantes con la `FormSection` de variantes | |
| Modificadores (`ModificadoresTab.tsx:184-350`) | Misma pestaña; + editar opción, reordenar, mín/máx; `ConfirmDialog` en lugar de `confirm()` | |
| Stock: 3 cards, tabla, entrada/salida/kardex (`StockTab.tsx:163-309`) | `StockByBranchTable Mode=detail` + `StatCard` | + mínimo, costo prom., transferir |
| Seriales completo (`SerialesTab.tsx:307-773`) | Pestaña Inventario › sub-pestaña Seriales con `DataTable` + `Pagination` | |
| Imágenes (`ImagenesTab.tsx:242-436`) | `ImageUploader` compartido con el formulario | + límite, IA, orden, alt |
| Precios: actualizar, historial (`PreciosTab.tsx:336-571`) | `FormSection` Precios en `Sheet` + `DataTable` historial precios **y costos** + gráfico real (`dataviz`) | |
| Proveedores CRUD (`ProveedoresTab.tsx:304-553`) | Pestaña Proveedores con `DataTable` + `Dialog` | |
| Etiquetas pestaña (`EtiquetasTab.tsx:331-453`) | `MultiSelect` en la misma pestaña; color siempre hex | |
| Notas hilo con adjuntos (`NotasTab.tsx:406-591`) | Pestaña Notas | |
| Auditoría (`AuditoriaTab.tsx:259-409`) | Historial › Auditoría con `DataTable` + filtros + paginación | |
| Niveles de stock: stats, filtros, tabla 11 col (`stock/*`) | `PageHeader` + `StatCard` ×5 + `SearchBar`/`FilterPanel` + `DataTable` | Handlers rotos se corrigen |
| Ajuste: formulario 2/3 + resumen (`NuevoAjusteForm.tsx:653-950`) | `AdjustmentForm` (§3.6) | Notas en `Textarea` |
| Movimientos / kardex | `DataTable` + `FilterPanel` con `DateRange` | |
| Importador CSV completo (`importar/page.tsx`) | `ImportWizard source=file` | + mapeo, edición inline, errores CSV, progreso |
| Formatos especiales A / B / saldos (`:186-575, 841-908`) | Paso Origen: `Badge` «Formato detectado» | Se conservan |
| Scraping (`ScrapingProductos.tsx`) | `ImportWizard source=web` | Importar visible durante el enriquecimiento |
| Carga masiva del asistente (`cargaMasiva.ts`, `BulkPreviewTable.tsx`) | `ImportWizard source=ai-assistant` (tarjeta del chat = paso Previsualización) + entrada «Cargar con el asistente» en Importar ▾ | Deshacer se conserva |
| Feed Facebook (todo `FacebookFeedDialog.tsx`) | `MetaSyncDialog` › Feed | + moneda por defecto, confirmación de regenerar |
| Rutas `product-sync`/`catalog-sync` sin UI | `MetaSyncDialog` › Sincronización | Nueva UI sobre API existente |
| POS: búsqueda, debounce, RPC ranking, offline (`ProductSearch.tsx:195-216, 456-487`; `posOfflineReads.ts`) | `PosProductSearch` + `SearchBar` | |
| Escáner cámara simulado (`ui/barcode-scanner.tsx:50-58`) | `SearchBar trailing=scanner` con lector real | Comportamiento unificado con el wedge |
| Wedge (`useHardwareBarcodeScanner.ts`) | Sin cambio | |
| Barra de categorías 3 modos + favoritos + ranking (`CategoryFilterBar.tsx`) | `CategoryBar` | |
| Densidad, límite por página, contador, limpiar (`ProductSearch.tsx:501-586`) | `ViewToggle` + `Select` de tamaño (visible en móvil) | Persistidos |
| Tarjeta con 5 badges (`ProductSearch.tsx:665-853`) | `ProductCard Variant=pos` | 2 badges máx., stock visible |
| Receta (solo lectura) y favorito (`:370-444, 959-1067`) | `ProductCard` acciones + `RecipeSheet` compartido | Una sola copia |
| `VariantSelectorDialog` (`VariantSelectorDialog.tsx`) | `VariantModifierDialog` | + stock por variante, cantidad |
| `SerialSelectorDialog` en cobro | `SerialPicker` | Término por producto |
| `LocalCatalogNotice`, `CachedProductImage` | Sin cambio (banner `BannerStack`) | |
| Vista móvil productos/carrito (`pos/page.tsx:777-815`) | `MobileHeader Mode=pos` + botón flotante «Carrito» conservado | `NuevaVentaPage` adopta el mismo patrón |
| `ProductSearchDialog` y `ProductSearchCombobox` | `ProductPicker Layout=dialog|combobox` | Busca por barcode, no carga todo en memoria |
| `RenderAcciones` sin uso, `handleDuplicarLegacy`, `ImageGallery.tsx`, `pos/product-search.tsx`, `product-grid.tsx`, `pos/barcode-scanner.tsx`, `main-pos.tsx` | **Descartes** (código muerto) | No se diseñan |

---

## 5. Mapa de pantallas a diseñar (en orden)

Cada pantalla en escritorio (1440) y móvil (390), tema claro y oscuro. Las de móvil usan `MobileHeader Mode=page` (título pequeño + ← + acción) y **sin** `MobileTabBar` en formularios, hojas y diálogos (regla 20).

| # | Pantalla | Escritorio | Móvil | Componentes nuevos que estrena |
|---|---|---|---|---|
| 1 | Kit: `SearchBar`, `FilterButton`, `FilterPanel` (popover y sheet), `FilterChips`, `SortMenu`, `ViewToggle`, `Chip`, `Select`, `SearchSelect`, `MultiSelect`, `DateRange`, `NumberInput`, `SegmentedControl` | Hoja de componentes | Hoja de componentes | Todos |
| 2 | Kit: `DataTable` (ready/loading/empty/error, densidades, selección, `Layout=cards`), `TableCell` variantes, `Pagination`, `BulkActionBar`, `EmptyState`, `Skeleton`, `Toast` | Hoja | Hoja | |
| 3 | Kit: `PageHeader` (list/detail/form), `Breadcrumbs`, `StatCard`, `FormSection`, `ImageUploader`, `BottomSheet`, `ConfirmDialog` | Hoja | Hoja | |
| 4 | **Catálogo** — estado listo, cargando (RPC + resto), vacío, con filtros abiertos, con chips activos, con selección + `BulkActionBar`, vista cuadrícula (`ProductCard Variant=catalog`) | Sí | Sí (`Layout=cards`, sheet de filtros, barra masiva en lugar del tab bar) | `ProductCard` |
| 5 | Diálogos masivos ×6 (Precios, Precio→Comparación, Redondear, Stock, Categoría, Eliminar) + estado «parcial» | `Dialog` | `Sheet` | `BulkDialog` |
| 6 | **Nuevo producto** — página completa con índice lateral, errores marcados, «Guardar y crear otro» | Sí | `Stepper` 3 pasos | `ProductForm`, `StockByBranchTable Mode=initial` |
| 7 | Secciones del formulario en detalle: Variantes (generador + tabla), Modificadores, Imágenes, Organización/proveedor, Avanzado; `QuickCreateDialog` categoría y proveedor | Sí | Sí | |
| 8 | **Editar producto** (mismo formulario, modo edit; Inventario solo lectura con «Ajustar») y **Duplicar** (diálogo «Qué copiar») | Sí | Acordeón | |
| 9 | **Detalle** — `PageHeader Variant=detail`, `StatCard` ×3, pestañas: Resumen (con lápices → `Sheet`), Inventario (stock por sucursal, seriales, lotes), Precios y costos (historial + gráfico), Variantes y modificadores, Imágenes, Proveedores y etiquetas, Notas, Historial | Sí | Sí (pestañas con scroll y sombra indicadora) | `StockByBranchTable Mode=detail` |
| 10 | **Stock por sucursal** (`/inventario/stock`) y **Ajuste de inventario** (nuevo + detalle + lista) | Sí | Sí | `AdjustmentForm` |
| 11 | **ImportWizard** — 5 pasos para `file`; variante `web` (scraping) y `ai-assistant` (tarjeta del chat); resultado con errores descargables | Sí | Sí | `ImportWizard` |
| 12 | **MetaSyncDialog** — Feed / Exportar / Sincronización | `Dialog` | `Sheet` | |
| 13 | **POS — buscador** (`PosProductSearch`): panel 75/25, `CategoryBar` en 3 modos, grid `sm/md`, estados (cargando, vacío, error, sin catálogo local), `VariantModifierDialog`, `SerialPicker`, `RecipeSheet` | Sí (sin breadcrumbs) | Sí (`MobileHeader Mode=pos`, vista productos ↔ carrito, scroll infinito) | `ProductCard Variant=pos`, `CategoryBar` |
| 14 | `ProductPicker` (diálogo y combobox) para facturas, órdenes, ajustes, CRM | Sí | Sí | |
| 15 | Página «99 Descartes» con lo que se retira (dos buscadores, `DetallesTab`, `ImageGallery`, prototipo del POS) | — | — | |

---

## 6. Preguntas para el dueño (máx. 5)

1. **Detalle vs edición**: ¿aceptas que el detalle deje de tener el formulario inline de «Detalles» y que cada bloque se edite en un `Sheet` con la misma sección del formulario (una sola lógica de guardado), o prefieres conservar «Editar» como página completa **y** la edición inline por bloque?
2. **Vigencia de precios**: hoy todo precio/costo entra con `effective_from = ahora`. ¿Diseñamos «Vigente desde» (fecha futura programable) en la sección Precios, o se mantiene solo el historial de solo lectura?
3. **POS — agotados y venta sin stock**: no existe configuración para ocultar agotados ni para permitir vender sin stock. ¿Se diseñan como ajustes de la organización (Configuración › POS) en esta fase, o el POS sigue mostrando agotados deshabilitados?
4. **Etiquetas y códigos de barras**: se pidió «exportar, etiquetas, códigos» en el menú, pero en el código no hay impresión de etiquetas de producto (solo generación de EAN). ¿Entra en el alcance del diseño (plantilla de etiqueta, selección masiva, impresión por estación de `print_jobs`) o se deja como entrada del menú marcada «próximamente»?
5. **Importadores**: ¿unificamos los tres accesos («Importar desde CSV», «Importar con IA» = scraping web, y la carga masiva del asistente) bajo un solo botón «Importar ▾» con el mismo `ImportWizard`, y el botón morado desaparece del header? Si el scraping debe seguir siendo protagonista, indícalo.
