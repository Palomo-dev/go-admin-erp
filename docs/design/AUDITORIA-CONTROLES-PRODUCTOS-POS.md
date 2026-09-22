# Auditoría control por control — detalle de producto, POS y catálogo

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`). El dueño reporta que el diseño actual «deja muchas funciones,
botones y opciones por fuera» del detalle de producto y del POS. Este documento baja un nivel
respecto a `docs/design/INVENTARIO-PRODUCTOS-Y-POS.md` (§1, que da el contexto y no se repite):
aquí va **cada control** —botón, menú, pestaña, campo, toggle, chip, badge, tabla, diálogo,
tooltip, atajo, estado— con su etiqueta exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; verificación de `customers` con `SELECT` por el
MCP de Supabase (`jgmgphmzusbluqhuqihj`); el esquema de impuestos se dedujo de las migraciones.
Sin nombres de organizaciones cliente. Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
casi nada del detalle ni del POS pasa por `messages/es.json` —solo `posCustomerDisplay.*` y
Configuración › POS—, así que los textos se citan tal cual y las claves cuando existen.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`xs` 475 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280); «Desktop» = Go Admin Desktop (Electron).

Índice: A. Detalle de producto (cabecera + 11 pestañas + diálogo de reclamo) · B. POS principal
(cabecera, caja, buscador, categorías, tarjeta, variantes, seriales, cliente, carritos, offline,
carrito, totales, acciones, cobro, QR, post-venta) · C. Catálogo (menú «…», fila, masivos, feed
Meta) · D. Submenús laterales del POS y Configuración › POS · E. Impuestos (no siempre IVA) ·
F. Selector de cliente compartido · G. Conteo de controles · H. Lo que el diseño actual omite ·
I. Recomendación de rediseño.

---

## A. Detalle de producto `/app/inventario/productos/[id]`

Rutas relativas a `src/`. Todos los textos son literales del código (el detalle no usa `messages/es.json`).

### A.0 Página contenedora — `app/app/inventario/productos/[id]/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Esqueleto de carga de toda la página | Mientras `loading` o `orgLoading` | page.tsx:144-151 |
| 2 | texto | «Error al cargar el producto» | Título del estado de error | Si `error` (fallo de fetch o «Producto no encontrado») | page.tsx:162-164 |
| 3 | texto | `{error}` | Mensaje de Supabase o «Producto no encontrado» | En estado de error | page.tsx:165 |
| 4 | botón | «Volver a productos» (icono ArrowLeft) | `Link` a `/app/inventario/productos` | Solo en error | page.tsx:167-172 |
| 5 | botón | «Reintentar» | `window.location.reload()` | Solo en error | page.tsx:173-175 |
| 6 | estado | Estados | Cargando: skeletons. Error: pantalla completa con AlertCircle. Vacío: no existe (`!data` cae en error «Producto no encontrado», l.68-70) | — | page.tsx:144-181 |

Carga: `products` por `uuid` + `organization_id` con `categories`, `children`, `product_prices`, `product_costs`, `stock_levels`, `product_images`, `product_suppliers`, `product_tax_relations` (l.40-62). Calcula `price`, `cost`, `stock` (padre + hijos) (l.74-129).

### A.1 Shell del detalle — `components/inventario/productos/id/DetalleProducto.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Volver al catálogo» (icono ArrowLeft, ghost, sm) | `router.push('/app/inventario/productos')` | Siempre | DetalleProducto.tsx:193-200 |
| 2 | botón | «Editar» (icono Pencil, primario) | `router.push('/app/inventario/productos/{uuid}/editar')` | Siempre (nunca se deshabilita, ni con `status='deleted'`) | DetalleProducto.tsx:208-210 |
| 3 | botón | «Duplicar» (icono Copy, outline) | `router.push('/app/inventario/productos/{uuid}/duplicar')` | Siempre; `disabled` mientras `loading` | DetalleProducto.tsx:212-214 |
| 4 | botón | «Ajustar Stock» (icono PackagePlus, outline verde) | `router.push('/app/inventario/ajustes/nuevo?producto_id={id numérico}')` | Siempre (no depende de `track_stock`); `disabled` mientras `loading` | DetalleProducto.tsx:217-224 |
| 5 | botón | «Transferir» (icono ArrowLeftRight, outline azul) | `router.push('/app/inventario/transferencias/nuevo?producto_id={id}')` — **el formulario destino no lee el parámetro** | Siempre; `disabled` mientras `loading` | DetalleProducto.tsx:226-233 |
| 6 | botón | «Desactivar» / «Activar» (icono Power, outline) | `products.update({status})` directo desde el navegador; toast «Estado actualizado» / «Error» | «Desactivar» si `status==='active'`, si no «Activar»; `disabled` si `loading` o `status==='deleted'` | DetalleProducto.tsx:235-242 · 122-153 |
| 7 | botón | «Eliminar» (icono Trash2, destructive) | Abre AlertDialog #8 | Siempre; `disabled` si `loading` o `status==='deleted'` | DetalleProducto.tsx:244-252 |
| 8 | diálogo | «¿Estás seguro?» | AlertDialog de borrado lógico | Al pulsar «Eliminar» | DetalleProducto.tsx:253-275 |
| 8a | texto | «Esta acción marcará el producto como eliminado y dejará de aparecer en los listados regulares.» | Descripción | Dentro de #8 | DetalleProducto.tsx:256-258 |
| 8b | texto | «Esta acción no borra el producto de la base de datos.» (AlertTriangle, banda ámbar) | Aviso | Dentro de #8 | DetalleProducto.tsx:259-262 |
| 8c | botón | «Cancelar» | Cierra | Dentro de #8 | DetalleProducto.tsx:265-267 |
| 8d | botón | «Eliminar» (rojo) | `products.update({status:'deleted'})` → toast «Producto eliminado» → `router.push('/app/inventario/productos')` | Dentro de #8 | DetalleProducto.tsx:268-273 · 155-187 |
| 9 | pestaña | «Detalles» (icono Info) | Monta `DetallesTab` | Siempre (activa por defecto) | DetalleProducto.tsx:74 · 305-309 |
| 10 | pestaña | «Variantes» (icono Tags) | `VariantesTab` | Siempre (no depende de `is_parent`; se muestra incluso en una variante hija) | DetalleProducto.tsx:75 · 310-314 |
| 11 | pestaña | «Modificadores» (icono SlidersHorizontal) | `ModificadoresTab` | Siempre | DetalleProducto.tsx:76 · 315-319 |
| 12 | pestaña | «Stock» (icono Package) | `StockTab` | Siempre (incluso con `track_stock=false`) | DetalleProducto.tsx:77 · 320-324 |
| 13 | pestaña | «Seriales» (icono Barcode) | `SerialesTab` | Siempre (no depende de `track_serial`) | DetalleProducto.tsx:78 · 325-329 |
| 14 | pestaña | «Imágenes» (icono Image) | `ImagenesTab` | Siempre | DetalleProducto.tsx:79 · 330-334 |
| 15 | pestaña | «Precios» (icono DollarSign) | `PreciosTab` | Siempre | DetalleProducto.tsx:80 · 335-339 |
| 16 | pestaña | «Proveedores» (icono Truck) | `ProveedoresTab` | Siempre | DetalleProducto.tsx:81 · 340-344 |
| 17 | pestaña | «Etiquetas» (icono Tag) | `EtiquetasTab` | Siempre | DetalleProducto.tsx:82 · 345-349 |
| 18 | pestaña | «Notas» (icono StickyNote) | `NotasTab` | Siempre | DetalleProducto.tsx:83 · 350-354 |
| 19 | pestaña | «Auditoría» (icono History) | `AuditoriaTab` | Siempre | DetalleProducto.tsx:84 · 355-359 |
| 20 | toast | «Estado actualizado» / «El producto ahora está activo|inactivo» | Éxito de #6 | Tras cambio OK | DetalleProducto.tsx:138-141 |
| 21 | toast | «Error» / «No se pudo actualizar el estado. Intente de nuevo más tarde.» | Fallo de #6 | — | DetalleProducto.tsx:145-149 |
| 22 | toast | «Producto eliminado» / «El producto ha sido marcado como eliminado» | Éxito de #8d | — | DetalleProducto.tsx:169-172 |
| 23 | toast | «Error» / «No se pudo eliminar el producto. Intente de nuevo más tarde.» | Fallo de #8d | — | DetalleProducto.tsx:179-183 |
| 24 | estado | Estados | Cargando: cada pestaña tiene fallback `Suspense` (bloque gris pulsante h-64). Sin vacío ni error propios. Pestañas con `overflow-x-auto` (scroll horizontal en móvil, sin indicador ni menú de desborde) | — | DetalleProducto.tsx:282 · 306-357 |

**No existe botón «…»** (más acciones) ni «Imprimir»: las 6 acciones van en fila `flex-wrap` (l.207). Las pestañas no se persisten en la URL.

### A.2 Cabecera — `components/inventario/productos/id/ProductoHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | Imagen principal (`<img alt={producto.name}>`) | Imagen seleccionada (`getPublicUrl`); fallback `/placeholder-image.png` y, si falla, texto «Sin imagen» | Si hay imágenes | ProductoHeader.tsx:163-185 |
| 2 | estado | «Sin imágenes» (icono Package) | Placeholder de galería | Si `images.length===0` | ProductoHeader.tsx:186-193 |
| 3 | botón | Miniaturas (`alt="Imagen N"`, grid 5 col) | `setSelectedImage(index)`; anillo azul en la seleccionada | Si `images.length>1`; 5 o todas según `showAllImages` | ProductoHeader.tsx:197-231 |
| 4 | botón | «+{n}» (`title="Ver más imágenes"`) | `setShowAllImages(true)` | Si `!showAllImages && images.length>5` | ProductoHeader.tsx:234-244 |
| 5 | botón | «-» (`title="Ver menos imágenes"`) | `setShowAllImages(false)` | Si `showAllImages` | ProductoHeader.tsx:247-257 |
| 6 | badge | «Activo» (verde) / «Inactivo» (naranja) / «Borrador» (gris) / «Eliminado» (rojo) / «Desconocido» (azul) | Según `producto.status` («Borrador» no existe en la BD; «Descontinuado» no tiene badge propio) | Siempre | ProductoHeader.tsx:130-155 · 266 |
| 7 | texto | `{producto.name}` (h1) | — | Siempre | ProductoHeader.tsx:268 |
| 8 | texto | «SKU:» `{sku}` (icono Tag, mono) | — | Siempre | ProductoHeader.tsx:272-276 |
| 9 | texto | «Categoría:» `{categories.name}` / «Sin categoría» | — | Siempre | ProductoHeader.tsx:278-282 |
| 10 | texto | «Unidad:» `{unit_code}` / «N/A» | — | Siempre | ProductoHeader.tsx:284-288 |
| 11 | texto | «Proveedor:» `{suppliers.name}` / «Sin proveedor» | Campo legado `supplier_id` (la columna no existe en `products`) | Solo si `producto.supplier_id` | ProductoHeader.tsx:290-296 |
| 12 | texto | «Tipo:» «Servicio» / «Producto» | `product_type==='service'` | Siempre | ProductoHeader.tsx:298-302 |
| 13 | texto | «Marca:» `{brand}` | — | Si `brand` | ProductoHeader.tsx:304-310 |
| 14 | texto | «Ref:» `{reference}` | — | Si `reference` | ProductoHeader.tsx:312-318 |
| 15 | texto | «Impuesto:» `{organization_taxes.name}` **o «IVA»** + `{rate}%` | Solo el **primer** impuesto de `product_tax_relations`; fallback «IVA» hardcodeado | Si `product_tax_relations.length>0` | ProductoHeader.tsx:320-328 |
| 16 | stat | «Precio de venta» + `formatCurrency(price)` | Toma el `product_prices` con mayor `effective_from` (**no mira `effective_to`**) | Siempre | ProductoHeader.tsx:333-376 |
| 16a | tooltip | «Precio de venta al público» (icono Info, `cursor-help`) | Tooltip shadcn | Hover/focus | ProductoHeader.tsx:338-345 |
| 16b | chip | «-{discountPercent}%» (rojo) | Descuento | Si `compare_price > price` | ProductoHeader.tsx:362-366 |
| 16c | texto | `formatCurrency(comparePrice)` tachado | Precio de comparación | Si `compare_price > price` | ProductoHeader.tsx:368-372 |
| 17 | stat | «Costo» + `formatCurrency(cost)` | `product_costs` con mayor `effective_from`, o 0 | Siempre | ProductoHeader.tsx:380-403 |
| 17a | tooltip | «Costo de adquisición» | Tooltip | Hover | ProductoHeader.tsx:385-392 |
| 18 | stat | «Stock» + `{totalStock.total}` | Suma `stock_levels.qty_on_hand` padre+hijos filtrada por la sucursal global | Si `track_stock !== false` | ProductoHeader.tsx:407-445 |
| 18a | tooltip | «Stock total disponible» / «Inventario sin seguimiento» | Tooltip | Hover; texto según `track_stock` | ProductoHeader.tsx:412-419 |
| 18b | chip | «Sin seguimiento» (gris) | — | Si `track_stock === false` | ProductoHeader.tsx:421-427 |
| 18c | estado | `Skeleton` (h-6 w-8) | Carga del stock | Mientras `loadingStock` | ProductoHeader.tsx:431-432 |
| 18d | chip | «Todas las sucursales» (azul) / `{branch.name}` o «Sucursal #{id}» (fucsia) | Filtro de sucursal global | Si `track_stock !== false` | ProductoHeader.tsx:436-441 |
| 19 | texto | «Descripción» + `HtmlContentRenderer collapsible` | HTML colapsable | Si `description` | ProductoHeader.tsx:448-457 |
| 20 | estado | Estados | Cargando: solo skeleton del KPI Stock. Vacío: «Sin imágenes». Error: ninguno visible (`console.error` l.120). Si `product_prices` está vacío, el `reduce` sin inicial lanza `TypeError` y cae toda la página | — | ProductoHeader.tsx:120 · 348 |

Layout: `md:` imagen 1/4 + info 3/4; móvil apilado (l.159-161, 263). KPIs 1 / `sm:2` / `md:3` columnas (l.331). **No hay** KPI de margen, ni «vendido N veces», ni «favorito en POS», ni «mínimo por sucursal» (el diseño los dibuja: ver §H).

### A.3 Pestaña «Detalles» — `id/tabs/DetallesTab.tsx` (formulario inline, segunda vía de edición)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Información Básica» (h3) | Título | Siempre | DetallesTab.tsx:276 |
| 2 | campo | «Nombre del Producto» (placeholder «Nombre del producto») | → `name` | Siempre | DetallesTab.tsx:280-288 |
| 3 | campo | «SKU» (placeholder «SKU único», mono) | → `sku` | Siempre | DetallesTab.tsx:292-300 |
| 4 | campo | «Código de Barras» (placeholder «Código de barras (opcional)», mono) | → `barcode` | Siempre | DetallesTab.tsx:304-313 |
| 5 | botón | (icono RefreshCw) `title="Generar código de barras"` | EAN-13 aleatorio | Siempre | DetallesTab.tsx:314-323 · 143-150 |
| 6 | campo | «Categoría» (`SearchSelect`: «Seleccionar categoría» / «Buscar categoría...» / «No se encontraron categorías» / «Sin categoría») | → `category_id` | Siempre | DetallesTab.tsx:328-338 |
| 7 | chip | «Categorías adicionales» + ayuda «Categorías secundarias asignadas a este producto» — un chip por categoría | Toggle en `product_category_relations`; azul si seleccionado | Siempre; excluye la principal; 20 visibles | DetallesTab.tsx:342-374 |
| 7a | estado | «No hay categorías disponibles» | Vacío | Si `categorias.length <= 1` | DetallesTab.tsx:375-377 |
| 7b | botón | «Ver más ({n} categorías)» / «Ver menos» | Toggle `showAllCategories` | Si `categorias.length > 21` | DetallesTab.tsx:378-388 |
| 8 | campo | «Unidad de Medida» (`SearchSelect`: «Seleccionar unidad» / «Buscar unidad...» / «No se encontraron unidades» / «Sin unidad») | → `unit_code` (tabla `units`, global) | Siempre | DetallesTab.tsx:393-403 |
| 9 | campo | «Proveedor» (`SearchSelect`: «Seleccionar proveedor» / «Buscar proveedor...» / «No se encontraron proveedores» / «Sin proveedor») | Al guardar sincroniza `product_suppliers.is_preferred` | Siempre; inicial = proveedor `is_preferred` | DetallesTab.tsx:407-417 · 222-237 |
| 10 | campo | «Descripción» (`RichTextEditor`, placeholder «Descripción detallada del producto») | HTML → `description` (**sin** «Mejorar con IA», a diferencia del formulario) | Siempre | DetallesTab.tsx:422-428 |
| 11 | campo | «Estación de Cocina/Bar» (Select, placeholder «Heredar de la categoría») | Opciones «Heredar de la categoría», «Cocina Caliente», «Cocina Fría», «Bar», «Caja», «Todas las estaciones» (`STATION_LABELS`, `pos/configuracion/printersService.ts:56-62`) → `station` | Siempre (no depende del vertical) | DetallesTab.tsx:432-446 |
| 12 | toggle | «Rastrear inventario» + «Si se desactiva, las ventas no descontarán stock de este producto» (icono PackageCheck) | Switch → `track_stock`; se propaga a hijos al guardar | Siempre | DetallesTab.tsx:450-466 · 216-220 |
| 13 | campo | «Tipo de Producto» (Select «Producto» / «Servicio») + «Los servicios no manejan inventario.» | «Servicio» fuerza `track_stock=false` | Siempre | DetallesTab.tsx:470-485 |
| 14 | campo | «Marca» (placeholder «Ej: Nike, Sony, Generica») | → `brand` | Siempre | DetallesTab.tsx:491-499 |
| 15 | campo | «Referencia» (placeholder «Ej: REF-001, Modelo X») | → `reference` | Siempre | DetallesTab.tsx:502-510 |
| 16 | texto | «Trazabilidad de Seriales y Garantía» + «Configura el seguimiento de números de serie y garantías» (icono Barcode) | Título de sección | Siempre | DetallesTab.tsx:516-527 |
| 17 | toggle | «Requiere número de serial» + «Activa el seguimiento individual de cada unidad» | Switch → `track_serial` | Siempre | DetallesTab.tsx:530-546 |
| 18 | campo | «Meses de garantía» (number, placeholder «Ej: 12, 24, 36») + «Duración de la garantía en meses desde la fecha de venta» | → `warranty_months` | Si `track_serial` | DetallesTab.tsx:552-569 |
| 19 | toggle | «Auto-generar seriales» + «Genera números de serie automáticamente al recibir stock» | Switch → `auto_generate_serial` | Si `track_serial` | DetallesTab.tsx:572-588 |
| 20 | campo | «Patrón de generación» (mono, placeholder «Ej: {PROD}-{YYYY}-{####}») + «Variables: {PROD} = SKU, {YYYY} = año, {####} = número secuencial» | → `serial_pattern` (**vocabulario distinto** al constructor `{SEQ}` del formulario Nuevo) | Si `track_serial && auto_generate_serial` | DetallesTab.tsx:592-605 |
| 21 | texto | «Creado: {hace X}» (icono Calendar) | `formatDistanceToNow`; «N/A» / «Fecha inválida» | Siempre | DetallesTab.tsx:614-617 · 260-270 |
| 22 | texto | «Última modificación: {hace X}» | Ídem `updated_at` | Siempre | DetallesTab.tsx:618-621 |
| 23 | botón | «Guardar Cambios» (icono Save) / «Guardando...» | `products.update` + relaciones de categoría + propagación a hijos + `product_suppliers` (5-7 llamadas, sin transacción) → `router.refresh()` | Siempre; `disabled` mientras `loading` | DetallesTab.tsx:624-640 · 153-257 |
| 24 | toast | «Cambios guardados» / «Los datos del producto se actualizaron correctamente» | Éxito | — | DetallesTab.tsx:239-242 |
| 25 | toast | «Error al guardar» / `{error.message}` o «No se pudieron guardar los cambios. Intente de nuevo más tarde.» | Fallo | — | DetallesTab.tsx:249-253 |
| 26 | estado | Estados | Cargando: solo «Guardando...»; sin skeleton mientras cargan catálogos (selects vacíos). Vacío: #7a. Error de catálogos: `console.error` (l.114) | — | DetallesTab.tsx:113-115 · 629-633 |

No incluye: impuesto, precio, costo, envío, notas, etiquetas, imágenes, estado. Layout grid 1 / `md:2` (l.278).

### A.4 Pestaña «Variantes» — `id/tabs/VariantesTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Variantes de Producto» (h3) | Título | Siempre | VariantesTab.tsx:647 |
| 2 | botón | «Nueva Variante» (icono Plus, primario) | Abre #7 en modo `create` con SKU `{sku}-V{n}` y nombre `{name} - Variante {n}` | Siempre | VariantesTab.tsx:648-651 · 347-367 |
| 3 | chip | Resumen de atributos: «{attrName}:» + badge índigo por valor | Solo lectura, agrupa `variant_data` | Si hay variantes con claves | VariantesTab.tsx:655-689 |
| 4 | tabla | «SKU» · «Nombre» · «Atributos» · «Precio» · «Costo» · «Stock» · «Acciones» | Hijos (`parent_product_id = id`) con precio/costo vigente y stock sumado | Siempre | VariantesTab.tsx:693-704 |
| 4a | chip | Badge outline «{key}: {val}» o «—» | Atributos por fila | Por fila | VariantesTab.tsx:733-752 |
| 4b | chip | «Sin seguimiento» (gris) en Stock | Reemplaza la cifra | Si `track_stock === false` | VariantesTab.tsx:756-760 |
| 4c | botón | (icono Edit, `sr-only` «Editar») | Abre #7 en modo `edit` | Por fila | VariantesTab.tsx:767-774 |
| 4d | botón | (icono Trash2, `sr-only` «Eliminar», rojo) | Abre #5 | Por fila | VariantesTab.tsx:778-785 |
| 5 | diálogo | «¿Estás seguro?» — «Esta acción eliminará la variante permanentemente y no se puede deshacer.» | AlertDialog | Al pulsar #4d | VariantesTab.tsx:787-805 |
| 5a | botón | «Cancelar» | Cierra | En #5 | VariantesTab.tsx:795-797 |
| 5b | botón | «Eliminar» (rojo) | `products.delete()` (**borrado físico**) → toast «Variante eliminada» | En #5 | VariantesTab.tsx:798-803 · 601-631 |
| 6 | estado | «Este producto no tiene variantes» + botón «Crear primera variante» (icono PlusCircle) | Abre #7 | Si `!loading && variantes.length===0` | VariantesTab.tsx:711-727 |
| 7 | diálogo | «Crear nueva variante» / «Editar variante» — «Completa los datos para crear una variante del producto» / «Modifica los datos de la variante» (`sm:max-w-md`) | Formulario | `isDialogOpen` | VariantesTab.tsx:817-828 |
| 7a | campo | «SKU de Variante» (placeholder «SKU único para esta variante», mono) | → `sku` | En #7 | VariantesTab.tsx:832-839 |
| 7b | campo | «Nombre de Variante» (placeholder «Nombre descriptivo») | → `name` | En #7 | VariantesTab.tsx:843-850 |
| 7c | campo | «Precio» (number step 0.01) | Cierra precio vigente e inserta `product_prices` | En #7 (grid 2 col) | VariantesTab.tsx:855-863 |
| 7d | campo | «Costo» (number step 0.01) | Ídem `product_costs` | En #7 | VariantesTab.tsx:867-875 |
| 7e | texto | «Atributos» | Label de grupo | Si `variant_data` tiene claves | VariantesTab.tsx:880-882 |
| 7f | campo | `{key}` + Input con `datalist` (placeholder = `{key}`) | → `variant_data[key]` | Por clave | VariantesTab.tsx:887-899 |
| 7g | botón | (icono Plus) `title="Guardar este valor en el catálogo"` | `variant_types`/`variant_values` + toast «Valor guardado» / «"{v}" agregado a {tipo}» | Por atributo; `disabled` si vacío | VariantesTab.tsx:900-910 · 238-256 |
| 7h | chip | Sugerencias de valor (máx. 12, ≤25 chars) + «+{n} más (escribe para buscar)» | Clic asigna el valor | Si el tipo tiene valores | VariantesTab.tsx:912-951 |
| 7i | campo | «Agregar atributo» (icono Tags) — Select «Tipo existente...» | `addAttributeToVariante` (persiste en `variant_types`) | Si `availableTypes.length>0` | VariantesTab.tsx:961-981 |
| 7j | campo | Input «Nuevo tipo...» (w-36) | Nombre de tipo nuevo | En #7 | VariantesTab.tsx:982-994 |
| 7k | atajo | Enter en #7j | Crea el tipo | Con foco en #7j | VariantesTab.tsx:987-993 |
| 7l | botón | (icono Plus) `title="Crear tipo y guardarlo en el catálogo"` | Igual que Enter | `disabled` si #7j vacío | VariantesTab.tsx:995-1005 |
| 7m | texto | «Stock por Sucursal» | Label | En #7 | VariantesTab.tsx:1010 |
| 7n | texto | «Este producto no rastrea inventario» | Reemplaza inputs | Si `track_stock === false` | VariantesTab.tsx:1011-1012 |
| 7o | texto | «No hay sucursales disponibles» | Vacío | Si `branches.length===0` | VariantesTab.tsx:1013-1014 |
| 7p | campo | `{branch_name}` + Input number (min 0, placeholder «0») por sucursal activa | `stock_levels` + `stock_movements` (`source: 'initial'`/`'adjustment'`) al guardar | Si rastrea y hay sucursales (lista `max-h-48`) | VariantesTab.tsx:1016-1053 · 432-455 · 526-574 |
| 7q | campo | «Código de Barras (opcional)» (placeholder «Código de barras específico», mono) | → `barcode` | En #7 | VariantesTab.tsx:1058-1065 |
| 7r | botón | «Cancelar» (outline, `DialogClose`) | Cierra | En #7 | VariantesTab.tsx:1070-1074 |
| 7s | botón | «Crear Variante» / «Guardar Cambios» (icono Save) → «Guardando» | Insert/update `products` + precios + costos + stock (N llamadas sin transacción) | Según `dialogMode`; `disabled` si `loading` | VariantesTab.tsx:1075-1087 · 386-598 |
| 8 | toast | «Variante creada» · «Variante actualizada» · «Variante eliminada» · «Error» / «No se pudo guardar la variante» / «No se pudo eliminar la variante» | — | Según resultado | VariantesTab.tsx:472-475 · 581-584 · 617-627 |
| 9 | estado | Estados | Cargando: fila con `Skeleton` (`colSpan=7`). Vacío: #6. Error: `console.error` (l.337), tabla vacía | — | VariantesTab.tsx:706-710 · 336-338 |

No existe: generador cartesiano (solo en Nuevo), imagen por variante, activar/desactivar variante, reordenar, edición en línea.

### A.5 Pestaña «Modificadores» — `id/tabs/ModificadoresTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Los modificadores son extras opcionales que no cambian el producto (ej. salsas, quitar ingredientes). Para variantes con precio/SKU propio (talla, color) usa la pestaña "Variantes".» | Ayuda | Siempre | ModificadoresTab.tsx:184-188 |
| 2 | texto | Card por grupo: (icono GripVertical, **sin drag real**) + `{group.name}` | `ProductModifiersService.getGroupsByProduct` | Por grupo | ModificadoresTab.tsx:190-196 |
| 2a | campo | Select modo: «Única (radio)» / «Múltiple (checkbox)» | `updateGroup({selection_mode, max_selections})` al vuelo | Por grupo | ModificadoresTab.tsx:198-209 · 132-142 |
| 2b | toggle | «Obligatorio» (Switch) | `updateGroup({required})` al vuelo | Por grupo | ModificadoresTab.tsx:210-213 · 123-130 |
| 2c | botón | (icono Trash2, rojo) | `confirm()` **nativo** «¿Eliminar este grupo de modificadores y todas sus opciones?» → `deleteGroup` | Por grupo | ModificadoresTab.tsx:214-221 · 112-121 |
| 2d | texto | `{option.name}` + «+$N» o «Gratis» | Lista de `product_modifiers` | Por opción | ModificadoresTab.tsx:225-234 |
| 2e | botón | (icono Trash2, rojo 6x6) | `deleteModifier(id)` **sin confirmación** | Por opción | ModificadoresTab.tsx:235-242 |
| 2f | chip | Sugerencias de valores de variantes `title="Valor ya usado en variantes, haz clic para reutilizarlo"` | Rellena «Nueva opción» | Si hay valores no usados | ModificadoresTab.tsx:247-271 |
| 2g | campo | Input «Nueva opción (ej. BBQ)» | Nombre de opción | Por grupo | ModificadoresTab.tsx:274-281 |
| 2h | campo | Input number «Precio extra» (w-28) | `extra_price` | Por grupo | ModificadoresTab.tsx:282-290 |
| 2i | botón | (icono Plus, primario) | `createModifier` → recarga | Por grupo (no se deshabilita con nombre vacío) | ModificadoresTab.tsx:291-293 · 144-162 |
| 3 | texto | «Nuevo grupo de modificadores» (card borde discontinuo) | Alta | Siempre | ModificadoresTab.tsx:299-301 |
| 3a | texto | «Grupos existentes en tu catálogo, haz clic para reutilizar:» | Ayuda | Si hay nombres no usados | ModificadoresTab.tsx:303-307 |
| 3b | chip | Píldora por nombre de grupo existente | `setNewGroupName` | Ídem | ModificadoresTab.tsx:309-324 |
| 3c | campo | Input «Nombre (ej. Salsas)» | `newGroupName` | Siempre | ModificadoresTab.tsx:330-334 |
| 3d | campo | Select «Única (radio)» / «Múltiple (checkbox)» (default Múltiple) | `newGroupMode` | Siempre | ModificadoresTab.tsx:335-343 |
| 3e | botón | «Agregar» (icono Plus → Loader2) | `createGroup` → toast «Grupo creado» / «"{name}" se agregó correctamente» | `disabled` si guardando o vacío | ModificadoresTab.tsx:344-347 · 88-110 |
| 4 | toast | «Error» / «No se pudieron cargar los modificadores» · «No se pudo crear el grupo» · «No se pudo eliminar el grupo» · «No se pudo agregar la opción» | — | Según fallo | ModificadoresTab.tsx:53-57 · 106 · 119 · 160 |
| 5 | estado | Estados | Cargando: `PageHeaderSkeleton` + `DetailSkeleton` con `min-h-screen` (desborda la pestaña). Vacío: sin mensaje, solo la card «Nuevo grupo». Error de toggle/modo/borrar opción: `console.error` | — | ModificadoresTab.tsx:173-180 |

No existe: editar nombre/precio de opción, `is_active` por opción, `min_selections`/`max_selections` en UI, reordenar grupos u opciones, imagen de opción.

### A.6 Pestaña «Stock» — `id/tabs/StockTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Inventario sin seguimiento» + «Este producto no requiere control de inventario. Las ventas y compras no afectan el stock.» (icono PackageCheck) | Reemplaza la pestaña | Si `track_stock === false` | StockTab.tsx:177-191 |
| 2 | stat | «Stock Total» — «En la sucursal seleccionada» / «En todas las sucursales» — `{total}` | Suma `qty_on_hand` padre+hijos por sucursal global | Si rastrea | StockTab.tsx:198-208 |
| 3 | stat | «Reservado» — «En procesos de venta» — `{reserved}` | Suma `qty_reserved` | Ídem | StockTab.tsx:210-220 |
| 4 | stat | «Disponible» — «Para la venta» — `{available}` | `on_hand - reserved` | Ídem | StockTab.tsx:222-232 |
| 5 | botón | «Registrar Entrada» (icono ArrowUp, primario) | `/app/inventario/ajustes/nuevo?productId={id}&type=entrada` | Ídem | StockTab.tsx:237-240 · 163-170 |
| 6 | botón | «Registrar Salida» (icono ArrowDown, primario) | `…?productId={id}&type=salida` | Ídem | StockTab.tsx:242-245 |
| 7 | botón | «Ver Historial» (icono History, outline) | `/app/inventario/kardex?producto={id}` | Ídem | StockTab.tsx:247-250 · 173-175 |
| 8 | tabla | «Sucursal» · «En Existencia» · «Reservado» · «Disponible» · «Acciones» | Una fila por sucursal activa (0 si no hay `stock_levels`) | Filtrada por sucursal global | StockTab.tsx:255-264 · 109-127 · 149-151 |
| 8a | botón | (icono ArrowUp, `sr-only` «Entrada») | `…?productId={id}&type=entrada&branchId={branch_id}` | Por fila | StockTab.tsx:286-293 |
| 8b | botón | (icono ArrowDown, `sr-only` «Salida») | `…?productId={id}&type=salida&branchId={branch_id}` | Por fila | StockTab.tsx:294-301 |
| 9 | toast | «Error» / «No se pudo cargar la información de inventario» | — | Fallo de carga | StockTab.tsx:133-137 |
| 10 | estado | Estados | Cargando: fila con `Skeleton` (`colSpan=5`), KPIs en 0. Vacío: «No hay sucursales configuradas para mostrar stock» (también si la sucursal global está inactiva). Error: toast #9 | — | StockTab.tsx:266-276 |

No existe en la pestaña: mínimo (`min_level`), costo promedio (`avg_cost`), «actualizado hace», transferir por fila, lotes, desglose por variante, kardex embebido.
### A.7 Pestaña «Seriales» — `id/tabs/SerialesTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Este producto no requiere seriales» + «Para habilitar la trazabilidad de seriales, edita el producto y activa la opción "Requiere número de serial" en la sección de Trazabilidad.» | Sustituye la pestaña | `!track_serial` | SerialesTab.tsx:307-329 |
| 2 | botón | «Editar producto» | `router.push('…/{id}/editar')` (aunque `DetallesTab` ya tiene el switch) | Solo en #1 | SerialesTab.tsx:320-326 |
| 3 | texto | (icono Package) `{name}` · «SKU: {sku}» · «Precio: ${price}» · «Costo: ${cost}» | Tarjeta resumen; Precio/Costo **nunca se muestran** (`producto.price` no existe) | Con `track_serial` | SerialesTab.tsx:334-347 |
| 4 | badge | (icono Barcode) «Trazabilidad activa» | Informativo | Siempre | SerialesTab.tsx:351-354 |
| 5 | badge | (icono Sparkles) «Auto-generación» | Informativo | `auto_generate_serial` | SerialesTab.tsx:355-360 |
| 6 | badge | (icono ShieldCheck) «{warranty_months} meses garantía» | Informativo | `warranty_months` | SerialesTab.tsx:361-366 |
| 7 | badge | «Patrón: {serial_pattern}» (mono) | Informativo | `serial_pattern` | SerialesTab.tsx:367-371 |
| 8 | botón | (icono Plus) «Generar seriales» | Abre #26 | `auto_generate_serial && serial_pattern` | SerialesTab.tsx:372-381 |
| 9 | texto | «Stock total: **{n}** unidades» · «Seriales generados: **{n}**» | Lee `stock_levels` | `auto_generate_serial` | SerialesTab.tsx:385-397 |
| 10 | badge | «{stock − seriales} sin serial» (ámbar) | Informativo | `stockTotal > seriales.length` | SerialesTab.tsx:391-395 |
| 11 | stat | «Total» | Total de seriales (sin filtrar) | Siempre | SerialesTab.tsx:401-407 |
| 12 | stat | (punto verde) «En stock» | `status === 'in_stock'` | Siempre | SerialesTab.tsx:408-414 |
| 13 | stat | (punto azul) «Reservados» | `reserved` | Siempre | SerialesTab.tsx:415-421 |
| 14 | stat | (punto morado) «Vendidos» | `sold` | Siempre | SerialesTab.tsx:422-428 |
| 15 | campo | (icono Search) «Buscar por número de serial...» | Filtro en cliente (`includes`) | Siempre | SerialesTab.tsx:433-441 |
| 16 | menú | Select «Todos los estados» → «En stock», «Reservado», «Vendido», «Devuelto», «En tránsito», «Dañado», «RMA», «Reclamo garantía» | Filtro en cliente; w-180 en ≥sm, full en móvil | Siempre | SerialesTab.tsx:442-460 |
| 17 | botón | (icono Download) «Exportar» | CSV en cliente `seriales_{sku}.csv` (Serial, Estado, Sucursal ID, Fecha Recepción, Fecha Venta, Garantía Inicio, Garantía Fin, Costo Compra, Precio Venta); toast «Exportación completa» | Siempre; `disabled` si 0 filas | SerialesTab.tsx:461-464, 275-304 |
| 18 | tabla | «Serial» · «Estado» · «Garantía» · «Costo compra» · «Precio venta» · «Cliente» · «Fecha recepción» · (acciones) | `serialTrackingService.getSerialsByProduct`; clientes desde `customers.full_name` | Hay filas | SerialesTab.tsx:484-554 |
| 19 | botón | Fila completa clicable | `router.push('/app/inventario/seriales/{id}')` | Cada fila | SerialesTab.tsx:500-504 |
| 20 | chip | «En stock» verde · «Reservado» azul · «Vendido» morado · «Devuelto» naranja · «En tránsito» cian · «Dañado» rojo · «RMA» amarillo · «Reclamo garantía» rosa | Estado | Cada fila | SerialesTab.tsx:67-87, 508-512 |
| 21 | texto | Garantía «{inicio} → {fin}» / «—»; Costo/Precio «${n}» / «—»; Cliente / «N/A»; Fecha recepción `formatDateInTz` | — | Cada fila | SerialesTab.tsx:513-531 |
| 22 | botón | (icono ShieldCheck ámbar) «Reclamo» | `stopPropagation` + abre `CreateClaimDialog` con `preselectedSerialId` | Fila `status === 'sold'` | SerialesTab.tsx:533-547 |
| 23 | texto | (icono ExternalLink) | Decorativo | Cada fila | SerialesTab.tsx:548 |
| 24 | paginación | «Mostrando {a} a {b} de {n} seriales» + Select «10» «20» «50» «100» | `pageSize` | Hay filas | SerialesTab.tsx:558-573 |
| 25 | paginación | «Previous» / «Next» (shadcn, **en inglés**), números (máx. 5), «…», última | `currentPage` | `totalPages > 1` | SerialesTab.tsx:574-644 |
| 26 | diálogo | «Generar seriales masivamente» — «Genera números de serie automáticamente usando el patrón: `{pattern}`» | — | `showGenerateDialog` | SerialesTab.tsx:664-773 |
| 27 | campo | «Cantidad de seriales a generar» (number, min 1, max = stock sucursal − existentes) | `generateQty` | En #26; `disabled` sin sucursal | SerialesTab.tsx:676-685 |
| 28 | texto | «Stock en sucursal: {n} · Seriales existentes: {n}» · «Faltan **{n}** seriales» | Ayuda | Con sucursal | SerialesTab.tsx:686-692 |
| 29 | texto | «Seleccione una sucursal para continuar» (ámbar) | Ayuda | Sin sucursal | SerialesTab.tsx:693-697 |
| 30 | botón | «Generar los {n} seriales faltantes» (outline) | Fija cantidad = faltantes | Sucursal elegida y faltantes > 0 | SerialesTab.tsx:698-708 |
| 31 | menú | Select «Sucursal destino *» «Seleccione una sucursal» → «{branch} (Stock: {n} · Faltan: {n})» | Autocompleta cantidad | En #26 | SerialesTab.tsx:712-740 |
| 32 | texto | «La sucursal es obligatoria. Cada serial se asigna a una unidad de stock en la sucursal seleccionada.» | Ayuda | En #26 | SerialesTab.tsx:741-743 |
| 33 | texto | (icono ShieldCheck) «Cada serial tendrá {n} meses de garantía desde hoy.» (verde) | Aviso | Si `warranty_months` | SerialesTab.tsx:746-751 |
| 34 | botón | «Cancelar» | Cierra | `disabled` generando | SerialesTab.tsx:755-757 |
| 35 | botón | (icono Sparkles) «Generar {n} seriales» / «Generando...» | `serialTrackingService.generateSerialsFromPattern` (recibe `cost=0, price=0`); toasts «Seriales generados», «Generación parcial», «Cantidad excede el stock», «Error» | `disabled` si generando, qty ≤ 0 o sin sucursal | SerialesTab.tsx:758-770, 193-249 |
| 36 | diálogo | `CreateClaimDialog` (ver A.14) | Recarga al crear | `showClaimDialog` | SerialesTab.tsx:649-661 |
| — | estado | Estados | Cargando: 5 `Skeleton` h-12 (468-473). Vacío: (icono Barcode) «Aún no hay seriales registrados para este producto.» / con filtros «No se encontraron seriales con los filtros aplicados.» (474-482). Error: toast «No se pudieron cargar los seriales del producto» (146-150) | — | — |

No existe: filtro por sucursal, acciones por fila (cambiar estado, marcar dañado, transferir), impresión de etiqueta de serial, lotes (`lots` no tiene pestaña).

### A.8 Pestaña «Imágenes» — `id/tabs/ImagenesTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Imágenes del Producto ({n})» | Título | Siempre | ImagenesTab.tsx:332 |
| 2 | botón | (icono Upload) «Subir Imágenes» / «Subiendo...» — `<label>` dentro de `<Button>` + `<input type=file multiple accept="image/*">` | `uploadProductImage` por archivo; la primera queda `is_primary` si no había; toast «Imágenes cargadas» / «Se han subido {n} imágenes correctamente» | Siempre; **sin límite** de cantidad/tamaño | ImagenesTab.tsx:336-359, 117-156 |
| 3 | tabla | Grid 2 / 3 (sm) / 4 (md) / 5 (lg) de miniaturas cuadradas | `loadProductImages` | Hay imágenes | ImagenesTab.tsx:413-417 |
| 4 | badge | Borde azul + `ring-2` | Imagen principal | `is_primary` | ImagenesTab.tsx:246-250 |
| 5 | botón | Miniatura (clic) | Abre «Vista previa» | Cada miniatura | ImagenesTab.tsx:251 |
| 6 | botón | (icono Eye) «Ver» (sr-only) | Abre «Vista previa» | Overlay **solo hover** (`group-hover`) | ImagenesTab.tsx:277-290 |
| 7 | botón | (icono Star) «Principal» (sr-only) | `setProductPrimaryImage`; toast «Imagen principal actualizada» | Overlay hover y `!is_primary` | ImagenesTab.tsx:292-307, 159-185 |
| 8 | botón | (icono Trash2) «Eliminar» (sr-only) | Abre #9 | Overlay hover | ImagenesTab.tsx:309-322 |
| 9 | diálogo | «¿Estás seguro de eliminar esta imagen?» — «Esta acción no se puede deshacer. La imagen será eliminada permanentemente de este producto.» | Confirmación | `isDeleteDialogOpen` | ImagenesTab.tsx:365-397 |
| 10 | botón | «Cancelar» | Cierra | `disabled={loading}` | ImagenesTab.tsx:374-380 |
| 11 | botón | «Eliminar» / «Eliminando...» (destructive) | `deleteProductImage(id, storage_path)`; toast «Imagen eliminada» | `disabled={loading}` | ImagenesTab.tsx:381-394, 194-239 |
| 12 | diálogo | «Vista previa» + `<img>` (`sm:max-w-lg`, máx. 80vh) | URL pública (`product-images` u `organization_images`) | `previewImage` | ImagenesTab.tsx:421-436, 88-106 |
| 13 | estado | Fallback `onError` → `/placeholder-image.png` → «📷 Sin imagen» | Imagen rota | Por miniatura | ImagenesTab.tsx:257-272 |
| — | estado | Estados | Cargando: caja h-32 con Skeleton (400-402). Vacío: (icono Package) «Sin imágenes» — «Este producto no tiene imágenes asociadas. Haga clic en "Subir Imágenes" para añadir fotografías.» (403-411). Error: toasts «No se pudieron cargar las imágenes del producto», «Error al subir» | — | — |

No existe: reordenar, `alt_text`, «Generar con IA» (sí en Nuevo), límite de 5, cámara en móvil, arrastrar y soltar, acciones táctiles (todo es hover).

### A.9 Pestaña «Precios» — `id/tabs/PreciosTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | Card «Precio Actual» — «Último precio establecido» — valor 3xl | `priceHistory[0].price` | Siempre (1/3 en ≥md) | PreciosTab.tsx:336-366 |
| 2 | chip | «-{n}%» (rojo) | Descuento | `compare_price > price` | PreciosTab.tsx:353-357 |
| 3 | texto | Comparación tachada | — | Ídem | PreciosTab.tsx:359-361 |
| 4 | botón | (icono TrendingUp) «Actualizar Precio» | Abre #5 | Siempre | PreciosTab.tsx:370-375 |
| 5 | diálogo | «Actualizar precio» — «Ingrese el nuevo precio de venta del producto. El cambio quedará registrado en el historial.» (`sm:max-w-md`) | — | `isDialogOpen` | PreciosTab.tsx:376-445 |
| 6 | campo | «Precio Actual» (disabled) | **Siempre «$0»** (`producto.price` no existe) | En #5 | PreciosTab.tsx:387-393 |
| 7 | campo | «Nuevo Precio» (number, step 0.01) | `newPrice` | En #5 | PreciosTab.tsx:397-405 |
| 8 | campo | «Precio de Comparación (opcional)» («Precio anterior o de lista») + «Si es mayor al precio de venta, se mostrará como descuento» | `newComparePrice` | En #5 | PreciosTab.tsx:409-419 |
| 9 | botón | «Cancelar» | Cierra | En #5 | PreciosTab.tsx:424-430 |
| 10 | botón | (icono Save) «Guardar Precio» / «Guardando» | `product_prices.update({effective_to: now})` + `insert` directo desde el navegador; toasts «Precio actualizado», «Por favor ingrese un precio válido», «Error» | `disabled={updating}` | PreciosTab.tsx:431-443, 220-299 |
| 11 | texto | Card «Evolución de Precios» (área h-64) | **Gráfico vacío**: recharts stubeado a `null` | `chartData.length > 0` | PreciosTab.tsx:451-491, 90-97 |
| 12 | tabla | «Válido Desde» · «Válido Hasta» · «Precio» · «Comparación» · «Descuento» · «Cambio %» | `product_prices` orden `effective_from` desc | Siempre | PreciosTab.tsx:493-571 |
| 13 | texto | «Válido Desde» (icono Calendar) `dd MMM yyyy, HH:mm`; «Válido Hasta» fecha o «Vigente» | Sin timezone de la org | Cada fila | PreciosTab.tsx:526-534 |
| 14 | texto | Comparación tachada o «—» | — | Cada fila | PreciosTab.tsx:536-542 |
| 15 | chip | «-{n}%» rojo o «—» | Descuento | Cada fila | PreciosTab.tsx:543-551 |
| 16 | chip | «+{x}%» verde / «{-x}%» rojo / «0.00%» gris | Cambio vs anterior | Cada fila | PreciosTab.tsx:552-564 |
| — | estado | Estados | Cargando: fila `colSpan=5` (con 6 columnas) con Skeleton (506-513). Vacío: «No hay registro de cambios de precio» (514-519). Error: toast «No se pudo cargar el historial de precios» | — | — |

No existe: historial ni edición de **costo** (solo desde Editar), listas de precios, precio por sucursal/moneda, «vigente desde» programable, impuesto del producto (ni ver ni cambiar), margen.

### A.10 Pestaña «Proveedores» — `id/tabs/ProveedoresTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Proveedores del Producto» — «Gestiona los proveedores y sus condiciones comerciales» | Título | Siempre | ProveedoresTab.tsx:305-310 |
| 2 | botón | (icono Plus) «Agregar Proveedor» | Abre #10 (crear); costo inicial `producto.cost` (=0) | `disabled` si no quedan proveedores sin asignar | ProveedoresTab.tsx:311-314, 145-157 |
| 3 | tabla | «Proveedor» · «Costo» · «Días Entrega» · «Pedido Mín.» · «SKU Proveedor» · «Preferido» · «Acciones» | `product_suppliers` + `suppliers(id,name,nit)` orden `is_preferred` desc | Siempre | ProveedoresTab.tsx:318-418 |
| 4 | texto | Nombre + «NIT: {nit}» | — | Por fila | ProveedoresTab.tsx:352-359 |
| 5 | texto | `formatCurrency(cost)`, «{n} días», `{min_order_qty}`, SKU mono o «—» | — | Por fila | ProveedoresTab.tsx:360-363 |
| 6 | toggle | (icono Star amarillo) / (icono StarOff) | 2 updates no atómicos de `is_preferred`; toast «Proveedor preferido actualizado» | Por fila | ProveedoresTab.tsx:365-376, 254-276 |
| 7 | botón | (icono Edit) | Abre #10 (editar) | Por fila | ProveedoresTab.tsx:380-382 |
| 8 | botón | (icono Trash2 rojo) | Abre #9 | Por fila | ProveedoresTab.tsx:383-392 |
| 9 | diálogo | AlertDialog «¿Eliminar proveedor?» — «Se desvinculará a **{supplier_name}** de este producto.» — «Cancelar» / «Eliminar» | `product_suppliers.delete`; toast «Proveedor eliminado» | Al pulsar #8 | ProveedoresTab.tsx:393-410, 279-294 |
| 10 | diálogo | «Agregar Proveedor» — «Selecciona un proveedor y define las condiciones comerciales» / «Editar Proveedor» — «Modifica las condiciones comerciales del proveedor» (`sm:max-w-lg`) | — | `isDialogOpen` | ProveedoresTab.tsx:421-553 |
| 11 | menú | Select «Proveedor *» «Seleccionar proveedor» → «{name} ({nit})» (solo no asignados; **sin búsqueda, sin crear**) | `supplier_id` | Modo crear | ProveedoresTab.tsx:436-457 |
| 12 | texto | «Proveedor» + nombre | Solo lectura | Modo editar | ProveedoresTab.tsx:459-464 |
| 13 | campo | «Costo» (number) | `cost` (`value={x || 0}`: no se puede vaciar) | Grid 2 col | ProveedoresTab.tsx:468-477 |
| 14 | campo | «Días de Entrega» (number) | `lead_time_days` | — | ProveedoresTab.tsx:480-488 |
| 15 | campo | «Pedido Mínimo» (number) | `min_order_qty` | — | ProveedoresTab.tsx:494-503 |
| 16 | campo | «SKU del Proveedor» («SKU opcional», mono) | `supplier_sku` | — | ProveedoresTab.tsx:506-514 |
| 17 | campo | Textarea «Notas» («Notas sobre este proveedor...») | `notes` (no visible en la tabla) | — | ProveedoresTab.tsx:519-528 |
| 18 | botón | «Cancelar» | Cierra | — | ProveedoresTab.tsx:533-537 |
| 19 | botón | (icono Save) «Agregar» / «Guardar Cambios» / «Guardando» | insert/update `product_suppliers`; toasts «Proveedor agregado», «Proveedor actualizado», «Selecciona un proveedor», «Este proveedor ya está asignado al producto», «No se pudo guardar» | `disabled={saving}` | ProveedoresTab.tsx:538-550, 167-251 |
| — | estado | Estados | Cargando: fila `colSpan=7` con Skeleton (332-336). Vacío: «Este producto no tiene proveedores asignados» + «Agregar primer proveedor» (337-348). Error: solo `console.error` (134-136) | — | — |

No existe: «Preferido» editable en el diálogo, moneda del costo, enlace al proveedor, historial de costos por proveedor, crear proveedor desde aquí.

### A.11 Pestaña «Etiquetas» — `id/tabs/EtiquetasTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Etiquetas del Producto ({n})» | Título | Siempre | EtiquetasTab.tsx:322-324 |
| 2 | campo | «Buscar Etiquetas» («Escriba para buscar etiquetas existentes...») | Filtra `product_tags` de la org excluyendo asignadas | Siempre (col. izq. en ≥md) | EtiquetasTab.tsx:332-340, 146-159 |
| 3 | botón | (icono X) en el campo | Limpia | `searchValue` no vacío | EtiquetasTab.tsx:341-348 |
| 4 | menú | Dropdown absoluto (h-60) hecho a mano: (punto color) «{tag.name}» (icono Plus) | `product_tag_relations.insert`; toast «Etiqueta añadida» / «La etiqueta "{name}" se ha añadido al producto» | `filteredTags.length > 0` (**sin** «sin resultados», **sin** teclado) | EtiquetasTab.tsx:351-369, 162-198 |
| 5 | campo | «Crear Nueva Etiqueta» («Nombre de nueva etiqueta...») | `newTag` | Siempre (col. der.) | EtiquetasTab.tsx:375-383 |
| 6 | botón | (icono Plus) «Crear» | `product_tags.insert` con **color aleatorio (clase Tailwind)** + relación; toasts «Etiqueta creada», «Etiqueta duplicada» / «Ya existe una etiqueta con ese nombre», «Por favor ingrese un nombre para la etiqueta» | `disabled` si vacío o guardando; **sin Enter** | EtiquetasTab.tsx:384-395, 232-316 |
| 7 | texto | «Etiquetas Asignadas» | Subtítulo | Siempre | EtiquetasTab.tsx:403-405 |
| 8 | chip | Píldora (punto color) «{name}» + (icono X) | X → `product_tag_relations.delete`; toast «Etiqueta eliminada» | Por etiqueta asignada | EtiquetasTab.tsx:420-437, 201-229 |
| 9 | texto | Panel (icono Check) «¿Para qué sirven las etiquetas?» + 4 viñetas («Facilitan la búsqueda y filtrado de productos» / «Permiten agrupar productos por características o categorías adicionales» / «Son útiles para campañas promocionales y marketing» / «Pueden usarse para reportes personalizados») | Informativo | Siempre | EtiquetasTab.tsx:442-453 |
| — | estado | Estados | Cargando: Skeleton (407-409). Vacío: (icono Tag) «Sin etiquetas» — «Este producto no tiene etiquetas asignadas. Busque o cree etiquetas para categorizar este producto.» (410-418). Error: toast «No se pudieron cargar las etiquetas» | — | — |

No existe: elegir/editar color (sí en Nuevo, con hex), editar/eliminar etiquetas globales, navegar al filtro del catálogo por etiqueta (el catálogo tampoco filtra por etiqueta).

### A.12 Pestaña «Notas» — `id/tabs/NotasTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | Card «Nueva Nota» | Editor | Siempre | NotasTab.tsx:406-409 |
| 2 | campo | Textarea «Escribe una nota o comentario sobre este producto...» (min-h-24; **texto plano**, no rich como en Nuevo) | `newNota` | Siempre | NotasTab.tsx:411-416 |
| 3 | texto | «Archivos seleccionados:» + (icono FileText) «{name} ({size})» | Previsualiza; **no se pueden quitar** | Hay archivos | NotasTab.tsx:418-430 |
| 4 | botón | (icono Paperclip) «Adjuntar archivos» (`<label>` en `<Button>` + `<input type=file multiple hidden>`) | Guarda `FileList` (sin límite de tipo/tamaño) | Siempre | NotasTab.tsx:434-450, 379-381 |
| 5 | botón | (icono Send) «Guardar Nota» / «Guardando...» / «Subiendo archivos...» | `product_notes.insert` → `storage 'product-documents'` + `product_note_files.insert`; toasts «Nota guardada», «Por favor escriba contenido para la nota», «No hay organización seleccionada…», «Error» | `disabled` si vacío o guardando | NotasTab.tsx:453-468, 193-325 |
| 6 | texto | «Historial de Notas ({n})» | Título | Siempre | NotasTab.tsx:474-476 |
| 7 | texto | Card por nota: avatar `<img>` o SVG; nombre; rol **«usuario» fijo**; email; fecha `dd MMM yyyy, HH:mm` (sin tz) | Usuarios desde `profiles` | Por nota | NotasTab.tsx:492-521 |
| 8 | botón | (icono Trash2 rojo) «Eliminar» (sr-only) | Abre #9 | Por nota | NotasTab.tsx:523-533 |
| 9 | diálogo | AlertDialog «¿Eliminar nota?» — «Esta acción eliminará la nota y todos sus archivos adjuntos permanentemente.» — «Cancelar» / «Eliminar» | `storage.remove` + `product_note_files.delete` + `product_notes.delete`; toast «Nota eliminada» | Al pulsar #8 | NotasTab.tsx:534-553, 328-376 |
| 10 | texto | Contenido `whitespace-pre-wrap` | — | Por nota | NotasTab.tsx:557 |
| 11 | texto | «Archivos adjuntos:» + (icono FileText) «{name} ({size})» | **Solo se ven en la sesión en que se crearon** (la UI lee `nota.files`, la consulta devuelve `product_note_files`) | `nota.files.length > 0` | NotasTab.tsx:560-572, 120-123 |
| 12 | botón | (icono Download) `<a href download target=_blank>` | Descarga | Por adjunto | NotasTab.tsx:573-581 |
| — | estado | Estados | Cargando: Skeleton (478-480). Vacío: (icono FileText) «Sin notas» — «Este producto no tiene notas ni documentos. Agregue una nota o adjunte un archivo para comenzar.» (481-489). Error: toast «No se pudieron cargar las notas del producto» | — | — |

No existe: editar nota, fijar/anclar, menciones, nota «interna vs visible en POS».

### A.13 Pestaña «Auditoría» — `id/tabs/AuditoriaTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Historial de Cambios ({n})» | Título | Siempre | AuditoriaTab.tsx:333-337 |
| 2 | tabla | «Fecha» (180px) · «Usuario» · «Acción» (100px) · «Cambios» | `products_audit_log` (`entity_type='product'`, `limit(100)` fijo) + `profiles` | Hay logs | AuditoriaTab.tsx:353-395, 142-149 |
| 3 | texto | Fecha `dd MMM yyyy, HH:mm` (sin tz) | — | Por fila | AuditoriaTab.tsx:366-368 |
| 4 | texto | Avatar 6×6 + nombre («Usuario desconocido») | — | Por fila | AuditoriaTab.tsx:369-382 |
| 5 | badge | «Creación» verde / «Actualización» azul / «Eliminación» rojo / `{action_type}` gris | Según `action_type` | Por fila | AuditoriaTab.tsx:229-256, 383-385 |
| 6 | texto | «{Campo}: {viejo} → {nuevo}, …» / «Producto creado» / «Producto eliminado» / «Sin cambios detectados» / «No hay detalles» / «Error al mostrar cambios» | Etiquetas: Nombre, SKU, Código de barras, Descripción, Precio, Costo, Estado, Categoría, Unidad, Proveedor, Seguimiento de stock | Por fila | AuditoriaTab.tsx:259-328, 386-390 |
| 7 | tooltip | `title={formatChanges}` (nativo) | Texto completo | Hover | AuditoriaTab.tsx:387 |
| 8 | texto | Panel (icono FileText) «Acerca de la Auditoría» — «El historial de auditoría muestra los cambios realizados al producto, incluyendo creaciones, actualizaciones y eliminaciones. Esto ayuda a mantener un registro de todas las modificaciones con información de quién las realizó y cuándo ocurrieron.» | Informativo | Siempre | AuditoriaTab.tsx:399-409 |
| — | estado | Estados | Cargando: Skeleton (340-342). Vacío: (icono History) «Sin historial» — «No se encontraron registros de auditoría para este producto. Los cambios futuros se registrarán aquí.» (343-351). Error: toast «No se pudo cargar el historial de auditoría» | — | — |

No existe: filtros (usuario, acción, fecha), paginación, exportar, kardex de movimientos (está en `/inventario/kardex?producto=`), auditoría de precios/stock/variantes (solo `products`).

### A.14 Diálogo «Nuevo Reclamo de Garantía» — `components/inventario/garantias/CreateClaimDialog.tsx` (abierto desde Seriales)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nuevo Reclamo de Garantía» — «Registra un reclamo de garantía para un serial vendido.» (`max-w-lg`, scroll 60vh) | Resetea al abrir | `open` | CreateClaimDialog.tsx:218-225, 83-91 |
| 2 | campo | «Buscar serial» (icono Search) «Ingresa el número de serial (mín. 3 caracteres)...» `autoFocus` | Debounce 300 ms en `serial_numbers` (`ilike`, limit 10) | Solo sin `preselectedSerialId` (desde Seriales **nunca** aparece) | CreateClaimDialog.tsx:235-247, 130-162 |
| 3 | texto | «Buscando...» | — | `searching` | CreateClaimDialog.tsx:248-252 |
| 4 | texto | «No se encontraron seriales.» | Vacío | ≥3 chars y 0 resultados | CreateClaimDialog.tsx:253-255 |
| 5 | menú | Lista (h-48): serial mono, «{producto} · SKU: {sku}», badge «Vendido» / `{status}` | Selecciona | Hay resultados | CreateClaimDialog.tsx:256-287 |
| 6 | texto | Tarjeta «Serial» + (icono ShieldCheck) `{serial}` | Resumen (`serial_numbers` + `products` + `customers`) | `selectedSerial` | CreateClaimDialog.tsx:294-316 |
| 7 | botón | «Cambiar» (ghost) | Deselecciona | Sin `preselectedSerialId` | CreateClaimDialog.tsx:297-309 |
| 8 | texto | (icono Package) `{name}` — «SKU: {sku} · {brand}» | — | Serial elegido | CreateClaimDialog.tsx:319-330 |
| 9 | texto | (icono User) `{full_name}` — teléfono / email / «Sin contacto» | — | Con cliente | CreateClaimDialog.tsx:333-345 |
| 10 | texto | (icono AlertTriangle) «Este serial no tiene cliente asociado (no ha sido vendido)» | Aviso | Sin cliente | CreateClaimDialog.tsx:346-353 |
| 11 | badge | «Garantía» → «Vigente ({n} días)» verde / «Vencida» rojo / «Sin garantía» gris | `warranty_end` vs hoy (no bloquea) | Serial elegido | CreateClaimDialog.tsx:356-381, 164-170 |
| 12 | texto | «Fecha de venta: {fecha}» (`useFormatDate`) | — | `sale_date` | CreateClaimDialog.tsx:383-387 |
| 13 | campo | «Motivo del reclamo *» («Ej: Producto defectuoso, no enciende...») | `claimReason` | Serial elegido | CreateClaimDialog.tsx:392-401 |
| 14 | campo | «Descripción (opcional)» (`RichTextEditor`, «Describe el problema en detalle...») | `description` | Serial elegido | CreateClaimDialog.tsx:404-411 |
| 15 | botón | «Cancelar» | Cierra | `disabled={submitting}` | CreateClaimDialog.tsx:418-420 |
| 16 | botón | (icono ShieldCheck) «Crear Reclamo» / «Creando...» | `warrantyClaimsService.createClaim({…status:'pending'})`; toasts «Reclamo creado» / «Reclamo #{id8} registrado correctamente», «Selecciona un serial», «El motivo del reclamo es obligatorio», «Error» | `disabled` sin serial o motivo | CreateClaimDialog.tsx:421-436, 172-215 |
| — | estado | Estados | Cargando (preseleccionado): 2 Skeleton (227-231). Error: toast «No se pudo cargar el serial seleccionado» | — | — |

### A.15 Lo roto o sin efecto en el detalle (para que el diseño no lo herede)

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | «Transferir» navega con `?producto_id=` pero `NuevaTransferenciaForm` no lee `useSearchParams` | DetalleProducto.tsx:119 |
| 2 | `confirm()` nativo para borrar grupo de modificadores; borrar opción sin confirmación | ModificadoresTab.tsx:113, 239 |
| 3 | Cabecera revienta (`reduce` sin inicial) si el producto no tiene precio | ProductoHeader.tsx:348 |
| 4 | KPIs de cabecera no filtran `effective_to`; la página sí: pueden discrepar | ProductoHeader.tsx:348-349, 397-398 vs page.tsx:74-104 |
| 5 | «Editar» habilitado con `status='deleted'`; «Ajustar Stock» y pestaña Stock visibles para servicios; pestaña Seriales visible sin `track_serial`; pestaña Variantes visible en una variante hija | DetalleProducto.tsx:208, 217, 320, 325, 310 |
| 6 | Skeleton de Modificadores con `min-h-screen` dentro de la pestaña | ModificadoresTab.tsx:175 |
| 7 | «Guardar Cambios» de Detalles hace `router.refresh()` pero la página carga con `useEffect`: la cabecera no se actualiza | DetallesTab.tsx:245 |
| 8 | Escrituras multi-tabla desde el navegador sin transacción (variantes, detalles, precio, proveedor preferido) | VariantesTab.tsx:394-455; DetallesTab.tsx:157-237; PreciosTab.tsx:238-258; ProveedoresTab.tsx:257-266 |
| 9 | Borrado de variante físico (`products.delete`) vs padre lógico | VariantesTab.tsx:606-610 |
| 10 | `producto.price`/`producto.cost` no existen: «Precio Actual» del diálogo siempre $0; seriales se generan con costo/precio 0; costo inicial del proveedor 0 | PreciosTab.tsx:390; SerialesTab.tsx:218-219, 343-344; ProveedoresTab.tsx:150 |
| 11 | Gráfico «Evolución de Precios» vacío (recharts stubeado) | PreciosTab.tsx:90-97, 451-491 |
| 12 | Acciones de imagen solo en hover: inaccesibles en táctil/teclado | ImagenesTab.tsx:276 |
| 13 | Adjuntos de notas cargados de BD nunca se muestran ni se borran (`nota.files` vs `product_note_files`) | NotasTab.tsx:120-123, 333-349, 560 |
| 14 | Garantía en Seriales con `.slice(0,10)` sobre timestamptz (regla de fechas); fechas de Precios/Notas/Auditoría con `date-fns format` sin tz de la org | SerialesTab.tsx:515; PreciosTab.tsx:302-314; NotasTab.tsx:395-401; AuditoriaTab.tsx:220-226 |
| 15 | Hook `useOrganization` local duplicado con `.single()` sobre `organization_members` (falla con varias orgs) | PreciosTab.tsx:121-151 |
| 16 | Paginación de Seriales en inglés («Previous»/«Next»); `colSpan` incorrectos en Precios | SerialesTab.tsx:574-644; PreciosTab.tsx:508, 516 |
| 17 | Auditoría sin paginación, `limit(100)` fijo | AuditoriaTab.tsx:149 |
| 18 | Vocabularios distintos de patrón de serial: `{SEQ}{YYYY}{MM}{DD}` (formulario) vs `{PROD}{YYYY}{####}` (Detalles) | TrazabilidadSeccion.tsx:23-29 vs DetallesTab.tsx:599-603 |

## B. POS principal `/app/pos` (sin la pantalla del cliente)

Rutas relativas a `src/`. Textos literales salvo donde se indica clave de `messages/es.json` (solo `posCustomerDisplay.*` y Configuración › POS usan i18n).

### B.1 Cabecera del POS — `app/app/pos/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono ShoppingCart en círculo azul) | Decorativo | Siempre | page.tsx:592-594 |
| 2 | texto | «Sistema POS» | Título | Siempre | page.tsx:596-598 |
| 3 | texto | `{organization.name}` / «Caja rápida / Venta» | Nombre de la org | Siempre | page.tsx:600-602 |
| 4 | badge | «Sucursal:» + «Todas las sucursales» (azul) / `{branch}` (fucsia) / «Sucursal #N» | Refleja `branchFilter` global (solo lectura; **no permite cambiar sucursal desde el POS**) | Siempre | page.tsx:603; components/inventario/BranchBadge.tsx:16-29 |
| 5 | botón | (icono Lock) «Abrir Caja» (verde, lg) | Abre «Apertura de Caja» (B.1a) | `cashSession === null` | page.tsx:634-636 |
| 6 | botón | (icono Lock) «Cerrar Caja» (rojo, lg) | Abre «Arqueo y Cierre de Caja» (B.1b) | Caja abierta y (`isOrgAdmin` o `opened_by === currentUserId`) — **resuelto en cliente por nombre de rol** | page.tsx:611-633, 88-102 |
| 7 | tooltip | «Cerrar Caja» deshabilitado; `title` «Solo el cajero que abrió la caja o un administrador puede cerrarla» | Nada | Caja de otro cajero y no admin; texto oculto <sm | page.tsx:614-626 |
| 8 | botón | (icono CloudOff / AlertTriangle) «Sin conexión» + badge `{N}` | Abre «Pendientes de sincronizar» (B.10); `destructive` si hay filas en revisión | Solo Desktop (`isDesktop()`); con N=0 solo ≥lg; texto oculto <sm | components/pos/PendientesSinConexionDialog.tsx:181, 285-301 |
| 9 | texto | (icono Clock) `HH:MM` | Reloj local cada 1 s (`toLocaleTimeString`, sin tz de la org) | Oculto <xs (475 px) | page.tsx:161-165, 642-647 |
| 10 | menú | Indicador de pantalla del cliente | Ver B.1c | Siempre; etiqueta oculta <md | page.tsx:650 |
| 11 | badge | «{N} Activos» (verde) / «{N}A» | Carritos `status==='active'` | Siempre; corto <xs | page.tsx:654-660 |
| 12 | badge | «{N} En Espera» (amarillo) / «{N}E» | Carritos `status==='hold'` | Siempre; corto <xs | page.tsx:661-667 |
| 13 | tooltip | «Arrastra para ampliar el carrito · doble clic para restablecer» | Divisor `react-resizable-panels` productos 75 % (mín 35) / carrito 25 % (20-60), guardado en `localStorage('pos-layout-productos-carrito')` | Escritorio ≥1024 | page.tsx:42, 68-73, 745-770 |
| 14 | estado | Skeleton (`PageHeaderSkeleton` + `StatsSkeleton×4` + `CardListSkeleton×3`) | Carga inicial | `orgLoading || branchLoading || (isLoading && carts.length===0)` | page.tsx:555-563 |
| 15 | estado | (icono Settings) «Organización no encontrada» / «Configure su organización para usar el sistema POS» | Pantalla completa | `!organization` | page.tsx:565-581 |
| 16 | estado | Opacidad 60 % + `pointer-events-none` en toda la página | Bloqueo mientras recarga carritos | `isRefreshing` | page.tsx:584 |
| 17 | toast (sonner, **no montado**) | «Caja abierta exitosamente» / «Caja abierta sin conexión» · «Monto inicial: $X[ · pendiente de sincronizar]» · «Caja cerrada exitosamente» / «Caja cerrada sin conexión» · «Diferencia: $X» · «Seleccione una sucursal antes de crear un carrito» · «No hay productos que requieran preparación en el carrito» · «No hay productos nuevos para enviar a cocina» · «Nuevos productos enviados a cocina (N)» · «Comanda enviada a cocina (N impresora[s])» · «Ticket creado en /comandas. Sin impresoras para: …» | Resultados | El layout raíz solo monta el `Toaster` de shadcn: **estos toasts nunca se ven** | page.tsx:239-259, 298, 434-540; app/layout.tsx:4, 90 |
| 18 | estado (`window.alert`) | «Error al crear nuevo carrito» · «No hay carrito activo» · «Error al agregar producto al carrito» · «Error al asignar cliente al carrito» · «Carrito puesto en espera[: motivo]» | Alertas nativas | Errores / al poner en espera | page.tsx:309, 342, 351, 364, 417 |

**No existe** en la cabecera: selector de turno (los «turnos» son la sesión de caja), selector de sucursal, «Ventas de hoy», acceso a Ventas/Cajas, nombre del cajero, atajos de teclado documentados, modo pantalla completa.

#### B.1a Diálogo «Apertura de Caja» — `components/pos/cajas/AperturaCajaDialog.tsx` (modal a mano con `createPortal`, sin Radix: sin focus-trap ni Esc)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono Banknote) «Apertura de Caja» | Cabecera sticky | Al pulsar «Abrir Caja» | AperturaCajaDialog.tsx:120-128 |
| 2 | botón | (icono X svg) | Cierra | Siempre | :129-133 |
| 3 | texto | «Sucursal» + nombre / «Sucursal no seleccionada» (icono Store) | Del BranchContext | Siempre | :36, 141-147 |
| 4 | texto | «Cajero» + nombre / «Cargando...» (icono UserCircle) | `profiles` | Siempre | :42-59, 148-154 |
| 5 | texto | «Fecha y hora» + `toLocaleString('es-CO')` (icono Calendar) | Fecha del navegador, locale fijo | Siempre | :156-164 |
| 6 | texto | «Alcance de la Caja» | Label | `cashMode !== 'user'` (`CajasService.getCashSessionMode`) | :170-172 |
| 7 | toggle | (icono Building2) «Esta sucursal» / `{branchName}` | `scope='branch'` | `cashMode !== 'user'` | :174-188 |
| 8 | toggle | (icono Globe) «Todas las sucursales» / «Caja global» | `scope='global'` | `cashMode !== 'user'` | :189-203 |
| 9 | texto | «Todos los usuarios de todas las sucursales registrarán ventas en esta caja.» | Aviso | `scope==='global'` | :205-209 |
| 10 | texto | «Alcance de la Caja» + (icono UserCircle) «Mi caja en {branchName}» / «Cada cajero abre y gestiona su propia caja de forma independiente.» / «Esta caja registrará únicamente tus ventas y movimientos. Otros cajeros de la sucursal tendrán sus propias cajas.» | Tarjeta informativa | `cashMode === 'user'` | :214-230 |
| 11 | texto | «Detalles de Apertura» | Título | Siempre | :236-238 |
| 12 | campo | «Monto Inicial *» (number, min 0, default 100000) | `initial_amount` | Siempre | :243-255 |
| 13 | texto | «Equivale a: {formatCurrency}» | Vista previa | Siempre | :256-260 |
| 14 | campo | «Notas (Opcional)» — RichTextEditor «Observaciones de apertura...» | `notes` (HTML) | Siempre | :265-274 |
| 15 | texto | «**Importante:** Una vez abierta la caja, podrás registrar ventas, ingresos y egresos hasta el momento del cierre.» | Aviso azul | Siempre | :280-285 |
| 16 | botón | «Cancelar» | Cierra | `disabled` mientras `loading` | :289-297 |
| 17 | botón | «Abrir Caja» / «Abriendo...» | `CajasService.openSession` → `onSessionOpened` | Siempre | :298-311 |
| 18 | toast (sonner) | «El monto inicial no puede ser negativo» · «Caja abierta exitosamente» / «…sin conexión» · «Error al abrir caja» | Validación/resultado | Al enviar | :79, 86-88, 101-103 |

#### B.1b Diálogo «Arqueo y Cierre de Caja» — `components/pos/cajas/CierreCajaDialog.tsx` (`mask()` → «****» con `blind_cash_count` y usuario no admin)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono Calculator) «Arqueo y Cierre de Caja» | max-w-2xl | Al pulsar «Cerrar Caja» | CierreCajaDialog.tsx:219-227 |
| 2 | botón | (icono X svg) | Cierra | Siempre | :228-232 |
| 3 | texto | «Resumen de Movimientos» | Título | Siempre | :247-249 |
| 4 | texto | «Monto inicial:» · «Ventas en efectivo:» · «Ventas totales:» · «Ingresos:» · «Egresos:» | `CajasService.getCashSummary` | Siempre | :253-281 |
| 5 | texto | «Vuelto entregado:» `-{X}` | — | `change_total > 0` | :283-290 |
| 6 | texto | «Devoluciones:» `-{X}` | — | `returns_total > 0` | :291-298 |
| 7 | tabla | (icono ArrowUpCircle) «Ingresos por metodo de pago:» + fila por método | `income_by_method` | Hay métodos | :304-323 |
| 8 | tabla | (icono ShoppingCart) «Ventas por metodo de pago:» + «Total ventas:» | `sales_by_method` | Hay métodos | :326-353 |
| 9 | tabla | (icono Receipt) «Recibos de Caja (Abonos a Cuentas por Cobrar):» · «Total recibido:» | `cash_receipts_*` | `cash_receipts_total > 0` | :356-379 |
| 10 | tabla | (icono ArrowDownCircle) «Egresos por metodo de pago (compras):» + «Total Pagos a Proveedores:» | `expense_by_method` | Hay métodos | :382-409 |
| 11 | texto | (icono EyeOff en ciego) «Monto esperado:» `{X}` / «****» | — | Siempre | :413-425 |
| 12 | tabla | «Movimientos de la Sesion ({N})» — icono por tipo, `label #ref`, contraparte / «Sin contraparte», badge método, `+/-monto` | `getSessionPaymentsDetail` | `movements.length > 0` | :430-471 |
| 13 | texto | «Arqueo por Método de Pago» | Título | Siempre | :476-478 |
| 14 | campo | Por método: nombre · «Esperado: {X}/****» · «Contado real» (number) · «Diferencia» `+/-{X}` / «****» | Efectivo siempre + cada método; en ciego arrancan en 0 | Siempre | :484-538 |
| 15 | texto | «Total esperado (todos los métodos):» · «Total contado (todos los métodos):» · «Diferencia total:» | Totales | Siempre | :545-577 |
| 16 | texto | «Sobrante en el arqueo total» / «Faltante en el arqueo total» | — | No ciego y diferencia ≠ 0 | :578-582 |
| 17 | campo | «Observaciones del Cierre (Opcional)» — RichTextEditor «Observaciones del cierre, novedades, etc...» | `notes` | Siempre | :587-596 |
| 18 | texto | «⚠️ Atención: Hay una diferencia total de {X} (sobrante|faltante) en el arqueo.» | Aviso amarillo | No ciego y diferencia ≠ 0 | :602-609 |
| 19 | botón | «Cancelar» | Cierra | Siempre | :613-621 |
| 20 | botón | «Cerrar Caja» / «Cerrando...» | `CajasService.closeSession` | Siempre | :622-635 |
| 21 | estado | Skeleton (3 líneas) | Cargando | `loadingSummary` | :236-241 |
| 22 | toast (sonner) | «Error al cargar resumen de caja» · «El monto final no puede ser negativo» · «Caja cerrada exitosamente»/«…sin conexión» + «Diferencia total: $X» · «Error al cerrar caja» | — | — | :120, 185, 192-203 |

Typos en UI: «metodo» ×3, «Sesion» (:307, 329, 385, 434).

#### B.1c Indicador de pantalla del cliente — `components/pos/display/CustomerDisplayIndicator.tsx` (textos `posCustomerDisplay.*` de `messages/es.json`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | punto verde + `indicator.connected` «Pantalla del cliente conectada» (aria `indicator.ariaLabel` «Pantalla del cliente: {label}») | Abre el menú | `display_alive` en los últimos 3 s | CustomerDisplayIndicator.tsx:130-137, 173-193 |
| 2 | estado | punto gris + `indicator.disabled` «Pantalla desactivada» | — | Apagada en Configuración | :133-134, 185-190 |
| 3 | estado | punto ámbar + `indicator.openNoSignal` «Pantalla abierta, sin señal» | — | Solo Desktop ≥0.2.1 | :135-136, 187-188 |
| 4 | estado | punto gris + `indicator.disconnected` «Sin pantalla» | Por defecto | Resto | :137, 189 |
| 5 | texto | `indicator.openNoSignalHint` «La ventana de la pantalla del cliente está abierta, pero la caja no recibe su señal. Ciérrela y vuelva a abrirla.» | — | Estado 3 | :196-203 |
| 6 | texto | `indicator.notEmitting` «Desactivada en Configuración › POS › Pantalla del cliente» | — | `reason==='disabled'` | :158-159, 204-211 |
| 7 | texto | `indicator.unsupported` «Este navegador no admite la pantalla del cliente (sin BroadcastChannel). Actualícelo o use la aplicación de escritorio.» | — | `reason==='unsupported'` | :159, 204-211 |
| 8 | menú | (icono Power) `menu.enableAndOpen` «Activar y abrir pantalla del cliente» | `saveCustomerDisplayConfig({enabled:true})` + abre | `reason==='disabled'` | :139-156, 212-217 |
| 9 | menú | (icono ExternalLink) `menu.open` «Abrir pantalla del cliente» | `openCustomerDisplay()` (ventana web o puente Desktop) | Siempre | :107-115, 218-221 |
| 10 | menú | (icono MonitorX) `menu.close` «Cerrar» | `closeCustomerDisplay` | Siempre; `disabled` si nada que cerrar | :117-126, 163-168, 222-225 |
| 11 | toast (shadcn) | `toast.dragHint` «Arrastre la ventana a la pantalla del cliente y pulse F11» · `toast.popupBlocked` · `toast.closeFromOpener` · `toast.enabled` «Pantalla del cliente activada» · `toast.enableError` | — | Según caso | :110-113, 124, 148, 152 |

### B.2 Buscador — `components/pos/ProductSearch.tsx` (card superior con degradado azul)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `LocalCatalogNotice` | Ver B.9 | Solo Desktop | ProductSearch.tsx:454 |
| 2 | campo | (icono Search) «Buscar por nombre, SKU, código de barras, variantes o modificadores...» | Debounce 300 ms → `POSService.getProductsPaginated({search, category_id, status:'active', branchFilter})` (RPC `pos_product_ranking`); **sin `autoFocus`, sin atajo** | Siempre | :195-206, 456-464 |
| 3 | botón | (icono Scan) `title` «Escanear código de barras» | Abre overlay `BarcodeScanner` (cámara **simulada**: devuelve `7501234567890` a los 3 s) | Siempre | :466-474; components/ui/barcode-scanner.tsx:49-60 |
| 4 | botón | (icono X) `title` «Limpiar búsqueda» | `setSearchTerm('')` | `searchTerm` no vacío | :475-485 |
| 5 | chip/menú | `CategoryFilterBar` | Ver B.3 | Siempre | :491-499 |
| 6 | botón | (icono X) «Limpiar» (texto oculto <sm) | Borra búsqueda y categoría | `searchTerm || selectedCategory` | :446, 501-511 |
| 7 | texto | «Mostrar:» + número | Límite por página: compacta [12,18,24], amplia [8,12,16] | Oculto <sm; «Mostrar:» oculto <md | :109-121, 514-520 |
| 8 | botón | (icono ChevronUp) `title` «Aumentar productos por página» | Siguiente límite (cíclico) | Oculto <sm | :522-540 |
| 9 | botón | (icono ChevronDown) `title` «Disminuir productos por página» | Anterior (cíclico) | Oculto <sm | :541-559 |
| 10 | toggle | (icono Grid3X3) `title` «Vista compacta» | `gridSize='small'` (no persistido) | Siempre | :564-572 |
| 11 | toggle | (icono Package) `title` «Vista amplia» | `gridSize='large'` | Siempre | :573-581 |
| 12 | texto | «{total} prod.» | Contador | Oculto <md | :584-586 |
| 13 | atajo | Lector físico USB/BT (wedge: ráfaga ≤80 ms, ≥4 chars, Enter/Tab o silencio 150 ms) | `getProductByBarcode` → agrega directo / abre variantes / avisa agotado; se ignora con un `Dialog` abierto | Siempre (foco en cualquier sitio) | :296-366; hooks/useHardwareBarcodeScanner.ts:46-92 |
| 14 | toast | «Código no encontrado» / «Ningún producto activo tiene el código {code}.» · «Producto agotado» / «{name} no tiene stock disponible.» · «Error» / «No se pudo buscar el producto escaneado» | Resultado del lector | — | :313-328, 357-361 |
| 15 | diálogo | «Escáner de código de barras» / «Apunta la cámara al código de barras del producto» — overlay negro con `<video>` | `getUserMedia({facingMode:'environment'})` | Tras (icono Scan) | components/ui/barcode-scanner.tsx:63-80, 95-107 |
| 16 | botón | (icono X) | Cierra el escáner | En overlay | barcode-scanner.tsx:65-71 |
| 17 | estado | Cruz roja + spinner «Escaneando...» | Decorativo | Sin error de cámara | barcode-scanner.tsx:103-117 |
| 18 | estado | (icono AlertCircle) «No se pudo acceder a la cámara. Verifica los permisos e intenta de nuevo.» + «Cerrar» | Error de permisos | `getUserMedia` falla | barcode-scanner.tsx:82-92 |
| 19 | toast | «Código escaneado» / «Buscando producto con código: {barcode}» | Pone el código en el buscador | Tras «escaneo» | ProductSearch.tsx:231-239 |
| 20 | diálogo | (icono ChefHat) «Receta de producción» + nombre | `recipeService.getRecipeById` (solo lectura) | Botón ChefHat de la tarjeta | :960-970 |
| 21 | texto | «Producto» + nombre · «SKU: {sku}» / «N/A» · «Rendimiento» `{yield_qty} {unit}` · «Estado» badge «Activa»/«Inactiva» · «Versión» `v{n}` | Cabecera de receta | Receta cargada | :979-1012 |
| 22 | texto | «Notas» + texto | — | `recipe.notes` | :1015-1022 |
| 23 | tabla | «Ingredientes ({N})» — `#i`, nombre, SKU, `{qty} {unit}`, badge «Opcional» | — | Receta cargada | :1025-1056 |
| 24 | estado | «Esta receta no tiene ingredientes definidos.» | — | Sin ingredientes | :1058-1060 |
| 25 | estado | Skeleton | Cargando receta | `recipeViewLoading` | :972-975 |
| 26 | toast | «Error» / «No se pudo cargar la receta del producto» | — | Fallo | :380-384 |

### B.3 Barra de categorías — `components/pos/CategoryFilterBar.tsx` (modo y orden desde `ConfiguracionService.getCategoriesDisplayConfig()`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | `SearchSelect` «Categorías» · «Buscar categoría...» · «No se encontraron categorías» · «Todas las categorías» | Selecciona categoría | `mode==='searchselect'` (180 px ≥sm, `flex-1` móvil) | CategoryFilterBar.tsx:93-107 |
| 2 | chip | «Todas» (80×80 gris) | Quita filtro | `mode==='images'` | :120-129 |
| 3 | chip | Tarjeta 80×80 por categoría: `image_url` con degradado o fondo `color` 25 %; nombre | Filtra (borde azul + ring) | `mode==='images'` | :145-168 |
| 4 | toggle | (icono Star) `title` «Marcar como favorita» / «Quitar de favoritas» | `POSService.toggleCategoryFavorite` (optimista) | `mode==='images'` | :134-144 |
| 5 | chip | «Todas» (píldora negra) + badge total | Quita filtro; badge **nunca** (prop `productCounts` no se pasa) | `mode==='buttons'` | :187-203 |
| 6 | chip | Píldora por categoría: (icono lucide `cat.icon` o Package) + nombre; color `cat.color` o paleta | Filtra | `mode==='buttons'` | :26-32, 204-235 |
| 7 | badge | «Top» + tooltip «{N} unidades vendidas en los últimos 90 días» | Ranking `sales_count_90d` | `sales_count_90d > 0` (no top 10 %) | :208, 223, 227-229 |
| 8 | badge | `{productCounts[id]}` | Conteo | **Nunca** | :230-234 |
| 9 | toggle | (icono Star) favorita | Igual que #4 | `mode==='buttons'` | :236-249 |
| 10 | atajo | Arrastre horizontal (`useDragScroll`) | Scroll | Modos `images`/`buttons` | :111-118, 178-186 |
| 11 | estado | Sin vacío ni carga (solo «Todas»); error solo `console.error` | — | — | ProductSearch.tsx:169-171 |

### B.4 Tarjeta de producto y paginación — `ProductSearch.tsx:592-939` (grid amplia 2/2/3/4, compacta 2/3/4/5/6; **siempre 2 en móvil**)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Tarjeta completa clicable | `handleProductClick`: agrega ×1 / abre variantes / agotado → toast | Siempre; agotado: opacidad 60 %, `cursor-not-allowed` | ProductSearch.tsx:247-265, 657-666 |
| 2 | texto | Imagen (`CachedProductImage`, zoom hover) / (icono Image) «Sin imagen» | h-28…48 amplia, h-24…32 compacta | «Sin imagen» solo amplia | :668-691 |
| 3 | badge | `{category.name}` (blanco, arriba-izq.) | — | `product.category` | :694-701 |
| 4 | badge | «Agotado» (rojo, centrado) | — | `is_out_of_stock` | :704-710 |
| 5 | badge | «-{N}%» (rojo, arriba-der.) | vs `compare_price` | `compare_price > price` | :713-717 |
| 6 | badge | «{N} var.» (morado) | Variantes | `has_variants && variant_count>0` | :720-729 |
| 7 | badge | «Personalizable» (ámbar) | Modificadores | `!has_variants && has_modifiers` | :732-741 |
| 8 | badge | (icono Flame) «Top» (naranja, abajo-izq.) + tooltip «{N} unidades vendidas en los últimos 90 días» | Ranking | `sales_count_90d > 0` | :744-752 |
| 9 | toggle | (icono Star) `title` «Agregar a favoritos» / «Quitar de favoritos» (abajo-der.) | `POSService.toggleProductFavorite` (optimista) | Siempre | :392-444, 755-774 |
| 10 | toast | «Agregado a favoritos» / «El producto aparecerá primero en el POS.» · «Quitado de favoritos» / «El producto ya no se priorizará.» · «Error» / «No se pudo actualizar el favorito.» | — | Tras toggle | :417-436 |
| 11 | texto | `{name}` (1 línea) | — | Siempre | :779-784 |
| 12 | texto | `{description}` (1 línea) | — | Vista amplia | :786-790 |
| 13 | texto | `{compare_price}` tachado | — | `compare_price > price` | :795-802 |
| 14 | texto | `{price}` (verde) | — | `product.price` | :803-808 |
| 15 | texto | `{sku}` (mono) | — | Siempre | :813-815 |
| 16 | botón | (icono ChefHat) `title` «Ver receta de producción» | Abre receta (B.2 #20) | `has_recipe && recipe_id` | :816-826 |
| 17 | botón | (icono ShoppingCart) «Agregar» (azul) / «Elegir» (morado variantes, ámbar modificadores) / «+» (<xs) | Igual que #1 | Siempre; `disabled` si agotado | :829-853 |
| 18 | toast | «Producto agotado» / «{name} no tiene stock disponible.» | — | Clic en agotado | :249-256 |
| 19 | paginación | «Mostrando {a} a {b} de {total} productos» (≥sm) / «{a}-{b} de {total}» (<sm) | — | `totalPages > 1` | :860-872 |
| 20 | paginación | (ChevronLeft) «Anterior» (texto oculto <sm) | `page-1` | `totalPages > 1` | :875-884 |
| 21 | paginación | «1»…«5» (máx 5) | Ir a página | `totalPages > 1` | :888-906 |
| 22 | paginación | «...» + `{totalPages}` | Última | `totalPages > 5` | :908-920 |
| 23 | paginación | «Siguiente» (ChevronRight) | `page+1` | `totalPages > 1` | :923-932 |
| 24 | estado | 12 tarjetas skeleton (reemplaza todo el grid) | Cargando | `loading` | :594-617 |
| 25 | estado | (icono Package rojo) «Error al cargar productos» + `{error}` + «Reintentar» | `loadProducts()` | `error` | :618-630 |
| 26 | estado | (icono Package) «No se encontraron productos» + «Intenta ajustar los filtros de búsqueda» / «No hay productos disponibles en este momento» + (X) «Limpiar filtros» | — | `data.length === 0` | :631-649 |
| 27 | toast | «Error» / «No se pudieron cargar los productos» · «Sin catálogo local» (Desktop) | — | Fallo | :139-148 |

**El stock no se muestra** en la tarjeta (solo «Agotado»); no hay cantidad al agregar, ni vista lista, ni precio por cliente/lista.

### B.5 Diálogo de variantes / modificadores — `components/pos/VariantSelectorDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono Package) «Seleccionar Variante» / «Personalizar Producto» | max-w-lg; **no cierra al clicar fuera** | Con variantes / solo modificadores | VariantSelectorDialog.tsx:220-232 |
| 2 | texto (sr-only) | «Elige la variante del producto y la cantidad antes de añadirlo al carrito.» / «Ajusta las opciones del producto antes de añadirlo al carrito.» | a11y (**menciona cantidad, pero no hay control de cantidad**) | Siempre | :236-240 |
| 3 | texto | `{name}` · «SKU: {sku}» | — | Siempre | :256-257 |
| 4 | texto | `{precio + extras}` + «({base} + {extras})» | — | Solo modificadores | :258-267 |
| 5 | texto | `{attrName}:` | Label por atributo | Hay `variant_data` | :271-275 |
| 6 | chip | `{value}` (+ Check; `disabled` si la combinación no existe) | `handleAttributeSelect` | Por valor | :277-300 |
| 7 | texto | Tarjeta azul: nombre resuelto · «SKU: {sku}» · precio · «{base} + {extras} extras» | Variante seleccionada (**sin stock por variante**) | `selectedVariant` | :306-326 |
| 8 | badge | «Sin precio» (destructive) | — | Variante sin precio | :327-329 |
| 9 | texto | `{group.name}` + «*» · «Elige 1» / «Hasta {N}» / «Elige varias» | Cabecera de grupo | `modifierGroups.length>0` | :341-350 |
| 10 | toggle | Checkbox + `{modifier.name}` + «+{extra_price}» | `toggleModifier` (single = radio; múltiple respeta `max_selections`) | Por modificador | :352-376 |
| 11 | estado | (icono AlertCircle) «Selecciona una opción en "{grupo}"» / «Selecciona al menos {N} opciones en "{grupo}"» | Validación | `modifierError` | :172-182, 382-387 |
| 12 | tabla | Lista de variantes: nombre · «SKU: {sku}» · precio o «-» | Fallback sin atributos | `attributeGroups` vacío | :392-419 |
| 13 | botón | «Cancelar» | Resetea y cierra | Siempre | :425-431 |
| 14 | botón | «Agregar al Carrito» (azul) | `onSelectVariant` → `onProductSelect` (×1) | `disabled` sin variante o sin precio | :432-438 |
| 15 | estado | Skeleton | Cargando | `isLoading` | :243-251 |
| 16 | estado | Error de carga: solo `console.error` | — | — | :112-113, 125-128 |

### B.6 Diálogo de seriales — `components/pos/SerialSelectorDialog.tsx` (se abre en el **cobro**, no en el grid)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono Package) «Selección de Seriales» | max-w-2xl | Ítems con `track_serial` | SerialSelectorDialog.tsx:141-152 |
| 2 | texto | «Selecciona los seriales para los productos que requieren tracking individual. Total: {N} producto(s) serializado(s).» | — | Siempre | :153-156 |
| 3 | texto | `{name}` · «SKU: {sku} · Cantidad: {N}» | Cabecera por producto (verde al completar) | Por ítem | :167-184 |
| 4 | badge | «{sel}/{req}» (verde / naranja) | Progreso | Por ítem | :185-193 |
| 5 | estado | «Cargando seriales disponibles...» | `getAvailableSerials` | `loading` | :196-201 |
| 6 | estado | (AlertCircle) `{error}` / «Error cargando seriales» | — | `error` | :79-88, 203-208 |
| 7 | estado | «No hay seriales disponibles en stock para este producto.» | — | `available.length===0` | :212-216 |
| 8 | campo | (icono Search) «Buscar serial...» | **Un solo término** para todos los productos | Hay seriales | :45, 219-227 |
| 9 | toggle | Fila check + `{serial}` (mono) | No excede la cantidad | Por serial | :235-262 |
| 10 | badge | «Garantía hasta: {warranty_end}» | Fecha cruda | `warranty_end` | :263-267 |
| 11 | estado | «Solo hay {N} serial(es) disponible(s) pero se requieren {M}.» | — | `available < quantity` | :272-278 |
| 12 | botón | «Cancelar» | Cierra | Siempre | :290-292 |
| 13 | botón | «Confirmar Seriales» | `onConfirm` | `disabled` hasta completar | :136-139, 293-299 |

### B.7 Panel de cliente — `page.tsx:701-714` + `components/pos/CustomerSelector.tsx` (`customer-selector.tsx` en minúsculas es código muerto)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono Users) «Cliente» | Título | Siempre | page.tsx:701-707 |
| 2 | botón | (icono User) «Seleccionar cliente» / «Buscar por nombre, email o teléfono» (≥xs) / «Buscar cliente» (<xs) + (icono Search) | Abre Popover (w-96) | Sin cliente y >640 px | CustomerSelector.tsx:538-572 |
| 3 | botón | Igual | Abre Dialog «Seleccionar Cliente» (95vw, 85vh) | Sin cliente y ≤640 px | :60, 508-535 |
| 4 | texto | «Buscar Cliente» | Cabecera | Abierto | :275 |
| 5 | campo | (icono Search) «Nombre, email, teléfono o documento...» (autoFocus) | Debounce 300 ms → `POSService.searchCustomers({search, status:'active'})` + `reservations` `checked_in` (PMS) + `customer_company_links` | Abierto | :63-212, 278-284 |
| 6 | texto | (icono Building2) «ESPACIOS OCUPADOS ({N})» | Habitaciones/mesas con huésped | `occupiedSpaces.length>0` | :312-319 |
| 7 | botón | `{space_label}` + badge «Ocupada» + (User) `{customer_name}` + (Mail) email | Selecciona cliente + `room` (folio) | Por espacio | :320-350 |
| 8 | texto | (icono User) «CLIENTES ({N})» | Sección | `customers.length>0` | :360-367 |
| 9 | botón | Avatar + `{full_name}` + (Building2 si empresa) + badge «Pendiente de sincronizar» + «Contacto: {nombre} ({cargo})» + (Mail) email + (Phone) teléfono | `POSService.setCartCustomer` | Por cliente | :368-415 |
| 10 | botón | (icono UserPlus) «Crear nuevo cliente» (azul, w-full) | Online: `ClienteFormDialog` (formulario completo). Desktop sin red: `OfflineCustomerDialog` (B.11) | Siempre | :426-437, 578-589 |
| 11 | estado | Skeleton (3 líneas) | Buscando | `isLoading` | :293-298 |
| 12 | estado | (icono User) «No se encontraron resultados» / «Intenta con otro término de búsqueda» · «No hay clientes registrados» / «Crea un nuevo cliente para comenzar» | — | Sin resultados | :299-308 |
| 13 | texto | Card azul: avatar + `{full_name}` + badge «Pendiente de sincronizar» + (Mail) email + (Phone) teléfono + (CreditCard) «{doc_type}: {doc_number}» | Cliente del carrito activo | `activeCart.customer` | :444-489 |
| 14 | botón | (icono X) `title` «Quitar cliente» | `setCartCustomer(cart, undefined)` | Cliente seleccionado | :491-499 |
| 15 | estado (`window.alert`) | «Error al asignar cliente al carrito» | — | Fallo | page.tsx:364 |

**No existe**: editar cliente desde el POS, ver saldo/crédito/límite, historial de compras, «Consumidor final» por defecto, cliente obligatorio configurable.

### B.8 Pestañas de carritos — `components/pos/CartTabs.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | pestaña | (icono ShoppingCart / Clock si `hold`) + «Carrito {n}» o primer nombre del cliente (8 chars + «...») | `onCartSelect`; activa azul, en espera amarilla | Por carrito | CartTabs.tsx:166-179, 200-216 |
| 2 | badge | Total abreviado («$12k»; moneda **cableada `'COP'`**) | — | `total > 0` | :219-226 |
| 3 | badge | `{items.length}` | Nº de líneas | `items.length > 0` | :229-242 |
| 4 | botón | (icono X, `role=button`, Enter/Espacio) | Abre confirmación #9 | `carts.length > 1` | :150-157, 245-267 |
| 5 | atajo | Arrastre horizontal (mouse + touch) | Scroll | Siempre | :50-139, 187-199 |
| 6 | botón | (icono Plus) outline | `POSService.createCart(selectedBranchId)` | Siempre | :141-148, 276-284 |
| 7 | texto | Card resumen: «Items: {N}» · «Cliente: {full_name}» · «En espera: {hold_reason}» · `{total}` · hora `updated_at` | Resumen del carrito activo | Condicionales | :288-320 |
| 8 | estado | (icono ShoppingCart) «No hay carritos activos» / «Crea un nuevo carrito para comenzar una venta» + «Crear Carrito» | — | `carts.length === 0` | :324-342 |
| 9 | diálogo | «¿Cerrar este carrito?» — «Se eliminarán todos los productos del carrito. Esta acción no se puede deshacer.» + « Tiene {N} producto(s) por {total}.» — «Cancelar» / «Sí, cerrar carrito» | `KitchenService.markTicketAsDelivered` (si comanda) + `POSService.removeCart`; si no queda ninguno crea otro | `cartToRemove` | :346-368; page.tsx:313-338 |

**No existe**: renombrar carrito, «activar» (se activa al seleccionar), pestaña «con deuda» (el estado `hold_with_debt` se ve solo en CartView), mesa asociada, fusionar/dividir.

### B.9 Aviso de catálogo local — `components/pos/LocalCatalogNotice.tsx` (solo Desktop)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (icono DatabaseZap) «Sin conexión y sin catálogo local: conecta a internet una vez para replicarlo.» (rojo) | — | Sin red, réplica vacía | LocalCatalogNotice.tsx:39-46 |
| 2 | estado | «Catálogo local del {fecha} · {N} productos · {N} clientes» (ámbar) | `useFormatDate` | Sin red, con réplica | :31-35, 48-55 |
| 3 | texto | «Catálogo local: {N} productos · actualizado {fecha}» / «Catálogo local sin replicar» (gris) | — | Con red | :58-65 |
| 4 | botón | (icono RefreshCw) «Actualizar catálogo ahora» / «Actualizando…» | `replicateNow()` | Con red | :66-74 |
| 5 | estado | `{error}` rojo | — | `error` | :75 |

### B.10 Pendientes sin conexión — `components/pos/PendientesSinConexionDialog.tsx` (solo Desktop)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono CloudOff) «Pendientes de sincronizar» | max-w-2xl | Al pulsar «Sin conexión» | PendientesSinConexionDialog.tsx:303-309 |
| 2 | texto | «Ventas, clientes y operaciones de caja hechos sin conexión en este equipo. Se envían solos al volver la red, en orden (clientes → apertura de caja → ventas → movimientos y cierre); si algo falla cinco veces queda aquí para revisión con su error y el registro completo. Nunca se borran.» | — | Siempre | :310-314 |
| 3 | texto | «{N} pendiente(s) ({a} ventas · {b} clientes · {c} caja) · {N} en revisión · {N} sincronizado(s) (últimos 7 días)» | Resumen | Siempre | :317-321 |
| 4 | botón | (RefreshCw) «Sincronizar ahora» | `runSyncStages({force:true})` | `disabled` sin pendientes | :206-233, 322-325 |
| 5 | texto | (AlertTriangle) «Requieren revisión» · «Pendientes» · (CheckCircle2) «Sincronizados» | Secciones | Según filas | :328-355 |
| 6 | estado | «No hay operaciones pendientes.» | — | `pending.length===0` | :341-342 |
| 7 | tabla | (icono + sr-only «Venta»/«Cliente»/«Caja») + nº recibo local · nombre / «Cliente sin nombre» · «Apertura de caja» / «Cierre de caja» / «Ingreso de efectivo» / «Retiro de efectivo» | Identidad | Por fila | :88-149, 235-247 |
| 8 | badge | «Pendiente» / «Sincronizando» / «Sincronizado» / «Requiere revisión» | Estado | Por fila | :46-58, 248 |
| 9 | texto | importe · fecha (`formatDateTime`) · detalles («{N} ítem(s)», «método: $X», «{doc} {nº}», «Ya existía: {id}», «Esperado $X · diferencia $Y», «Caja local #N») · «Intentos: {N}» · `{id}` | Metadatos | Según tipo | :101-134, 250-261 |
| 10 | estado | `{lastError}` (caja roja) | — | `lastError` | :262-264 |
| 11 | botón | (RefreshCw) «Reintentar» | `retryOutboxSale` / `retryOutboxCustomer` / `retryCashOutboxRecord` | `status !== 'synced'` | :189-204, 266-271 |
| 12 | botón | (Download) «Exportar» | JSON `venta-offline-…json` etc. | Siempre | :60-70, 272-275 |
| 13 | toast (sonner) | «Sincronizado.» · «Sigue fallando: quedó en revisión.» · «Sin conexión o esperando a otra operación: se reintentará.» · «{N} operación(es) sincronizada(s).» · «Algunas operaciones no se pudieron sincronizar.» · … | — | — | :194-199, 222-228 |

### B.11 Cliente offline — `components/pos/OfflineCustomerDialog.tsx` (Desktop sin red)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nuevo cliente (sin conexión)» | sm:max-w-md | «Crear nuevo cliente» offline | OfflineCustomerDialog.tsx:90-99 |
| 2 | texto | (icono WifiOff) «Se guarda en este equipo y se enviará a Go Admin al volver la red, antes que las ventas que lo usen. Los demás datos (dirección, municipio, responsabilidades fiscales) se completan después desde Clientes.» | — | Siempre | :100-106 |
| 3 | campo | «Nombres *» (autoFocus) | `first_name` | Siempre | :111-112 |
| 4 | campo | «Apellidos» | `last_name` | Siempre | :115-116 |
| 5 | menú | «Tipo de documento» — «CC · Cédula de ciudadanía», «CE · Cédula de extranjería», «NIT · NIT», «TI · Tarjeta de identidad», «PP · Pasaporte», «PEP · Permiso especial de permanencia» | `doc_type` | Siempre | :27-34, 121-133 |
| 6 | campo | «Número de documento» (`inputMode=numeric`) | `doc_number` | Siempre | :136-137 |
| 7 | campo | «Email» | — | Siempre | :142-143 |
| 8 | campo | «Teléfono» | — | Siempre | :146-147 |
| 9 | estado | `role=alert` «El nombre es obligatorio» / error / «No se pudo registrar el cliente» | — | `error` | :64-66, 83, 150-154 |
| 10 | botón | «Cancelar» | Cierra | `disabled` guardando | :156-158 |
| 11 | botón | «Guardar cliente» / «Guardando…» | `POSService.createCustomer` (outbox) → asigna al carrito | Siempre | :71-81, 159-161 |

### B.12 Vista móvil (<1024 px) — `page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Vista «productos» (`ProductSearch` a pantalla completa) | — | `mobileView==='products'` | page.tsx:774-779 |
| 2 | estado | Vista «carrito» (cliente + pestañas + CartView, `pb-20`) | — | `mobileView==='cart'` | :782-787 |
| 3 | botón | (icono ArrowLeft) «Seguir comprando» (ghost) | `setMobileView('products')` | Vista carrito | :688-698 |
| 4 | botón flotante | (icono ShoppingCart) + badge `{unidades}` + `{total}` (azul) / «Carrito» (gris si vacío) — fixed abajo-der. | `setMobileView('cart')` | Vista productos | :793-815 |
| 5 | estado | Cabecera compactada: reloj oculto <xs; «{N}A»/«{N}E» <xs; textos «Cerrar Caja»/«Sin conexión» ocultos <sm; etiqueta del indicador <md | — | — | :623, 642, 658-666 |
| 6 | estado | Buscador: «Mostrar:» oculto <sm; «Limpiar» solo icono; «{N} prod.» oculto <md; botón «+» <xs; grid 2 col | — | — | ProductSearch.tsx:509, 514, 584, 849-852 |
| 7 | diálogo | «Seleccionar Cliente» (Dialog en vez de Popover) | Ver B.7 #3 | ≤640 px | CustomerSelector.tsx:507-535 |
| 8 | estado | Paginación «{a}-{b} de {total}»; «Anterior»/«Siguiente» solo icono | — | <sm | ProductSearch.tsx:868-871, 883, 930 |
### B.13 Carrito: líneas — `components/pos/CartView.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono ShoppingCart) «Carrito» | Título | Siempre | CartView.tsx:620-622 |
| 2 | badge | «Espera» | Carrito en espera | `status === 'hold'` | :623-627 |
| 3 | badge | (icono FileText) «Deuda» (texto oculto <xs) | Carrito con deuda | `status === 'hold_with_debt'` | :628-633 |
| 4 | badge | «Enviado a cocina» / «En preparación» / «¡Listo!» (pulsa) / «Entregado» | Estado de `kitchen_tickets` (Realtime) | `kitchen_ticket_id`; texto oculto <xs | :634-649, 217-251 |
| 5 | botón | (icono Play) «Reactivar» (texto oculto <xs) | `POSService.activateCart` | Solo `hold` | :651-661 |
| 6 | texto | «💳 Deuda registrada - Ver en Cuentas por Cobrar» / «Deuda registrada» (móvil) | Aviso | `hold_with_debt` | :663-669 |
| 7 | texto | «Cliente: {full_name}» | — | `cart.customer` | :670-674 |
| 8 | texto | Miniatura (`CachedProductImage` 40/48 px, fallback Package) | — | Por línea | :704-714 |
| 9 | texto | `{product.name}` (`title` = nombre) | — | Por línea | :718-720 |
| 10 | badge | «Enviado a cocina» / «En preparación» / «¡Listo!» / «Entregado» (por línea) | Estado de cocina | `kitchen_ticket_id` + categoría `requires_preparation` | :723-737 |
| 11 | badge | «{atributo}: {valor}» (índigo) | Variante | `variant_data` | :740-748 |
| 12 | badge | «{mod.name} (+$X)» (ámbar) | Modificadores (**solo lectura: no se pueden editar desde el carrito**) | `modifiers.length > 0` | :751-759 |
| 13 | badge | (icono StickyNote) «{notes}» (azul, clic → edita) | Nota de línea | `item.notes` | :762-769 |
| 14 | campo | «Ej: Sin cebolla, bien cocido...» | Nota; Enter guarda, Esc cancela; **solo `onCartUpdate` local** | `editingNotesItemId` | :772-785, 304-313 |
| 15 | botón | (icono Check) `title` «Guardar nota» | Guarda | Editando nota | :786-794 |
| 16 | botón | (icono X) `title` «Cancelar» | Cancela | Editando nota | :795-803 |
| 17 | badge | `{sku}` | SKU | Por línea | :809-811 |
| 18 | texto | «{$unit_price} / {unit_code}» | Precio unitario (**no editable**) | Por línea | :812-814 |
| 19 | texto | «Sin impuesto (excluido)» (naranja) | — | `tax_excluded` | :818-821 |
| 20 | texto | «+$X impuestos» / «(inc. $X impuestos)» (verde) | Impuesto de la línea | `tax_amount > 0` | :823-827 |
| 21 | badge | (icono Tag) «-$X» (rojo, clic → edita) | Descuento por línea | `discount_amount > 0`; no en hold | :831-840 |
| 22 | campo | number «Descuento» | Importe; Enter → `POSService.updateCartItemDiscount` | `editingDiscountItemId` | :842-860, 333-342 |
| 23 | botón | (icono Check) `title` «Aplicar descuento» | Aplica | Editando | :861-869 |
| 24 | botón | (icono X) `title` «Cancelar» | Cancela | Editando | :870-878 |
| 25 | botón | «+ Agregar descuento» | Abre input y carga `POSService.getFrequentDiscounts` | Sin descuento, no hold | :882-890 |
| 26 | chip | «-$X» (píldoras rojas) | Descuento frecuente de 1 clic | `frequentDiscountsMap[product_id]` | :891-903, 198-212 |
| 27 | texto + chip | «Frecuentes:» + «-$X» | Ídem durante edición | Editando | :908-921 |
| 28 | texto | `{$total}` y «{qty} × {$unit_price}» | Total de línea | Siempre; subtexto si qty > 1 | :926-935, 978-987 |
| 29 | botón | (icono Minus) | `updateCartItemQuantity(qty-1)`; **0 elimina sin confirmar** | `disabled` en hold | :942-950 |
| 30 | campo | number min=1 `{quantity}` | Cantidad directa | `disabled` en hold | :952-964 |
| 31 | botón | (icono Plus) | `qty+1` | `disabled` en hold | :966-974 |
| 32 | toggle | checkbox «Incluido» | Impuesto incluido **por línea** → `POSService.updateItemTaxIncluded` | `disabled` en hold o `tax_excluded` | :991-1004, 287-301 |
| 33 | botón | (icono ReceiptText) `title` «Excluir impuesto de este producto» / «Impuesto excluido - clic para incluir» | Alterna `tax_excluded` (**solo local**) | `disabled` en hold | :1008-1022, 277-284 |
| 34 | botón | (icono StickyNote) `title` «Agregar nota» / «Editar nota» | Abre nota | `disabled` en hold | :1025-1039 |
| 35 | botón | (icono Trash2) `title` «Eliminar item» | `POSService.removeItemFromCart` (sin confirmar) | `disabled` en hold | :1042-1051 |
| 36 | atajo | Enter / Escape | Guardar/cancelar nota y descuento | Editando | :778-781, 849-855 |
| — | estado | Estados | Vacío: (icono Package) «El carrito está vacío» + «Busca productos para agregar» (681-686). Cargando: sin indicador. Error: solo `console.error` | — | — |

### B.14 Carrito: totales — `components/pos/TaxSummary.tsx` (montado en CartView.tsx:1064-1071 solo con ítems)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono Calculator) «Resumen» | Título | Con ítems | TaxSummary.tsx:312-315 |
| 2 | botón | (icono Settings) | **Sin `onClick`** (decorativo) | Siempre | :316-322 |
| 3 | toggle | Switch «Impuestos incluidos» | Global del carrito → `POSService.updateCartTaxSettings({tax_included})` | Siempre | :326-339; CartView.tsx:120-128 |
| 4 | texto | «Subtotal:» + «(inc. impuestos)» | Neto + descuento | Siempre; subtexto si `taxIncluded` | :351-363 |
| 5 | texto | «Impuestos disponibles:» | Encabezado del selector | Sin impuestos por producto y `organizationTaxes.length > 0` | :366-371 |
| 6 | menú | «Ningún impuesto seleccionado» / «{name} ({rate}%)» / «{n} impuestos seleccionados» (ChevronDown) | Abre selector multi | Ídem | :373-395 |
| 7 | texto | «Selecciona los impuestos a aplicar:» | Cabecera del popover | Abierto | :398-400 |
| 8 | toggle | Fila checkbox «{name} ({rate}%)» + badge «predeterminado» + (Check) | `updateCartTaxSettings({applied_tax_ids})` | Por impuesto de la org; badge si `is_default` | :401-431; CartView.tsx:130-135 |
| 9 | texto | «Impuestos aplicados:» + «{name} ({rate}%)» + badge «incluido» + importe | Desglose por impuesto (nombre real, no «IVA» fijo) | `taxBreakdown.length > 0` | :440-468 |
| 10 | texto | «Total Impuestos:» (azul) | Suma | `totalTaxAmount > 0` | :471-481 |
| 11 | texto | «Descuento:» «-$X» (rojo) | Descuentos de línea | `discount_total > 0` | :484-494 |
| 12 | texto | «Total Final:» (verde) | Total; emite a pantalla del cliente (`setTotals`) | Siempre | :497-503; CartView.tsx:154-172 |
| 13 | texto | «No hay impuestos configurados para estos productos» | Aviso | `taxBreakdown.length === 0` | :506-510 |
| — | estado | Estados | Cargando: 2 Skeleton. Vacío «Agregue productos» (inalcanzable). Error: `console.error` | — | :275-306 |

**No existe** en el resumen: propina, cargos de servicio, cupones, promociones, redondeo, descuento global del carrito (solo por línea), retenciones.

### B.15 Carrito: acciones — `CartView.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono Pause) «Espera» | Abre #10 | Activo con ítems; `disabled` en hold/deuda | CartView.tsx:1131-1140 |
| 2 | botón | (icono FileText) «Deuda» (texto oculto <xs) `title` «Necesita cliente asignado» / «Poner en espera con deuda registrada» | Abre #13 | Activo; `disabled` sin `customer_id` | :1142-1152 |
| 3 | botón | (icono Send) «Enviar Cocina» / «Enviando...» | `onSendComanda(cart)` (`KitchenService`) | Algún ítem con `requires_preparation` | :1155-1170, 572-584 |
| 4 | botón | (icono CreditCard) «Cobrar» (móvil «$») | `onCheckout(cart)` → `CheckoutDialog` | Activo; `disabled` en hold/deuda o sin caja abierta | :1172-1180 |
| 5 | texto | «Debe abrir una caja antes de cobrar» | Aviso | `!cashSessionActive` | :1181-1185 |
| 6 | botón | (icono FileText) «Ver Factura» / «Cargando...» | `POSService.getInvoiceForCart` → #20 | Solo `hold_with_debt` | :1079-1092 |
| 7 | botón | (icono Printer) «Imprimir» | `getInvoiceForCart` + `PrintService.printTicket` (PDF/navegador) | Solo `hold_with_debt` | :1094-1102, 439-560 |
| 8 | botón | «Cobrar» (verde; móvil «$») | toast «Redirigiendo al checkout...» + `onCheckout` | Solo `hold_with_debt` | :1106-1114, 563-569 |
| 9 | botón | (icono X) «Anular» (rojo) | `POSService.cancelDebtWithCreditNote` **sin confirmación** | Solo `hold_with_debt` | :1116-1124, 587-600 |
| 10 | diálogo | «Poner Carrito en Espera» | — | `showHoldDialog` | :1195-1236 |
| 11 | campo | «Motivo (opcional)» «Ej: Cliente fue a buscar dinero, esperando autorización...» (Textarea) | — | En #10 | :1205-1215 |
| 12 | botón | «Cancelar» / (icono Pause) «Poner en Espera» | `POSService.holdCart(id, motivo || 'Sin motivo especificado')` | En #10 | :1220-1233, 351-360 |
| 13 | diálogo | (icono FileText naranja) «Registrar Deuda» | Venta a crédito/fiado | `showHoldWithDebtDialog` | :1239-1348 |
| 14 | texto | «Cliente:» {full_name | 'Sin cliente'} · «Total a adeudar:» {$total} | Resumen | En #13 | :1250-1263 |
| 15 | campo | «Motivo de la deuda *» «Ej: Cliente no tiene efectivo, pago diferido, venta a crédito...» | Obligatorio | En #13 | :1267-1278 |
| 16 | campo | «Días para vencimiento» (1-365, default 30) + «días» + «(Vence: {fecha})» (`toLocaleDateString`, sin tz) | Plazo | En #13 | :1283-1300 |
| 17 | texto | «📋 Se creará:» · «Factura de venta oficial» · «Cuenta por cobrar en el sistema» · «Registro en historial del cliente» | Info | En #13 | :1304-1313 |
| 18 | botón | «Cancelar» | Cierra | `disabled` procesando | :1317-1328 |
| 19 | botón | «Registrar Deuda» / «Procesando...» | `KitchenService.markTicketAsDelivered` + `POSService.holdCartWithDebt`; pantalla cliente → «Gracias» | `disabled` sin motivo/cliente | :1329-1345, 373-419 |
| 20 | diálogo | «Detalle de Factura» (90vw × 90vh) | Monta `DetalleFactura` (finanzas) | `showInvoiceModal` | :1351-1376 |
| — | estado | Estados | Sin carritos: ver B.8 #8. Toasts: «Error al registrar deuda», «Error al cargar factura», «Error al imprimir factura», «Error al anular deuda», «Error al enviar comanda», «¡Deuda registrada exitosamente!», «Factura enviada a imprimir», «Deuda anulada exitosamente», «Enviado a cocina». #20 cargando: 4 Skeleton; error «No se pudo cargar la factura» | — | :389-431, 552-598, 1360-1373 |

**No existe**: vaciar carrito (solo cerrar pestaña), cotizar, guardar como pedido, imprimir precuenta, descuento global, asignar mesa desde el POS, dividir cuenta, precio editable.

### B.16 Cobro — `components/pos/CheckoutDialog.tsx` (portal a `document.body`, max-w-5xl, 2 columnas en `lg`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | toast | «No hay caja abierta» · «Debe abrir una caja antes de realizar ventas. Vaya a POS → Cajas.» (y cierra) | `getRequireCashSessionConfig` + `getActiveSession` | Al abrir, si la org exige caja | CheckoutDialog.tsx:330-349 |
| 2 | texto | (icono CreditCard verde) «Procesar Pago» + «{n} productos · Total: {$cart.total}» | Cabecera sticky (muestra `cart.total`, **no** el total a pagar) | Siempre | :1782-1793 |
| 3 | botón | (icono X svg) | Cierra; pantalla del cliente vuelve a «Pedido» | Siempre | :1794-1801, 299-308 |
| 4 | tabla | (icono ShoppingCart) «Resumen de Venta»: «{name} x{qty}» {$total} | Solo lectura | Siempre | :1810-1830 |
| 5 | texto | «Subtotal:» / «Impuestos:» / «Descuentos:» «-$» / «Total:» | Totales del carrito original | Condicionales | :1834-1866 |
| 6 | texto | «Subtotal:» + «(base imponible)» / «Impuestos:» / «Propina:» / «Flete:» / «Total a pagar:» / «Total pagado:» / «Falta:» / «Cambio:» | Totales recalculados (tarjeta azul) | Según montos | :1871-1926 |
| 7 | texto | (icono Truck) «Entrega» | Sección | Siempre | :1929-1935 |
| 8 | botón (segmento) | (CheckCircle) «Recoger» / (Truck) «Envío propio» / (Navigation) «Tercero» | `deliveryType` | Siempre; default «Recoger» | :1938-1966 |
| 9 | menú | (icono UserCircle) «Conductor asignado» «Seleccionar conductor...» · «{name} · {phone}» | `transportService.getDrivers` | «Envío propio» y hay conductores | :1971-1990, 502-524 |
| 10 | texto | (icono MapPin) «Dirección del cliente cargada. Puedes modificarla si el envío es a otro lugar.» | — | «Envío propio» y `customer.address` | :1991-1996 |
| 11 | campo | «Dirección de entrega *» «Escribe la dirección o busca por nombre/teléfono...» | Autocompleta `customers` (≥3 chars, `ilike`, límite 8) | Delivery | :1997-2013, 526-559 |
| 12 | menú | «{name}» + (MapPin) «{address}, {city}» | Rellena ciudad/teléfono/nombre | Resultados | :2014-2031 |
| 13 | campo | «Ciudad» | — | Delivery | :2034-2044 |
| 14 | campo | (icono Phone) «Teléfono contacto» «300 123 4567» | — | Delivery | :2045-2056 |
| 15 | campo | «Nombre contacto» «Nombre de quien recibe» | — | Delivery | :2058-2068 |
| 16 | campo | «Instrucciones» «Portón negro, apartamento 302...» | — | Delivery | :2069-2079 |
| 17 | menú | (icono Truck) «Tarifa de envío» «Seleccionar tarifa...» · «{rate_name} - {$}» | `shippingRatesService.getShippingRates` (`show_on_pos`); suma «Flete» | Delivery y hay tarifas | :2080-2099, 422-478 |
| 18 | botón (segmento) | (icono Wallet) «Pago del envío»: (CheckCircle) «Pagado» / (Clock) «Pendiente» | `shipmentPaymentStatus` | Delivery | :2102-2128 |
| 19 | texto | «El envío se creará como pendiente de pago. Podrás marcarlo como pagado al entregar.» | — | «Pendiente» | :2129-2133 |
| 20 | texto | (icono Wallet morado) «Métodos de Pago» | Sección | Siempre | :2147-2150 |
| 21 | botón | (icono Plus) «Agregar» | Añade entrada `cash` con `remaining` (**pago mixto**) | Siempre | :2151-2159, 974-981 |
| 22 | texto | (icono DollarSign) «Pago {n}» | Cabecera por entrada | Por entrada | :2166-2169 |
| 23 | botón | (icono Trash2) «Eliminar» | Quita la entrada | `payments.length > 1` | :2170-2180 |
| 24 | menú | «Método» → `{method.name}` | `POSService.getPaymentMethods` (`organization_payment_methods`) | Por entrada | :2185-2202 |
| 25 | campo | (icono DollarSign) «Monto» number «0.00»; `max=cartTotal` si QR | Importe; pantalla del cliente muestra recibido/cambio | Por entrada | :2206-2222, 983-991 |
| 26 | botón (×≤6) | «Exacto» + montos rápidos («50k», «100k», «1M»…) | Fija el monto (`generateQuickAmounts`) | Solo `method === 'cash'` | :2227-2241, 1585-1637 |
| 27 | botón | (icono QrCode) «Generar QR de pago» / «Generando…» | POST `/api/integrations/{redeban|breb|bancolombia/wompi|bancolombia|bold}/create-qr` → B.17 | Método ∈ {redeban_qr, breb_qr, bancolombia_qr_wompi, bancolombia_qr} (**bold_link/bold_qr implementados pero sin botón**) | :2244-2265, 719-846 |
| 28 | toast | «Link de pago abierto» · «Se abrio el link de pago de Bold en una nueva ventana.» | `window.open(payment_url)` | Respuesta con `payment_url` | :812-818 |
| 29 | toggle | checkbox (icono Percent) «Impuestos incluidos en precios» | `taxIncluded` **local del diálogo** (no persiste al carrito) | Siempre | :2270-2283 |
| 30 | texto | (icono Banknote) «Propina (opcional)» | Sección | Siempre | :2286-2292 |
| 31 | estado | «Pantalla del cliente: esperando la propina…» + «Omitir» / «La pantalla muestra las propinas sugeridas: registre lo que indique el cliente» + «Continuar» | `skipTip()` | Pantalla del cliente en fase de propina | display/TipFromDisplayNotice.tsx:149-169 |
| 32 | estado | «Cliente eligió {p} % ({$})» / «Cliente eligió una propina de {$}» / «Cliente eligió no dejar propina» + «Aplicar» / «Cambiar» / «Entendido» | «Aplicar» fija `tipAmount` | `tip_selected` desde la pantalla | TipFromDisplayNotice.tsx:116-146 |
| 33 | botón (×4) | «5%» «10%» «15%» «20%» | `computeTipAmount`; segundo clic deselecciona | Siempre | :2315-2332, 687-703 |
| 34 | campo | (icono DollarSign) «Monto personalizado» step 100 | Propina libre | Siempre | :2336-2352 |
| 35 | menú | «Mesero (opcional)» «Seleccionar...» · «Sin asignar» · `{name}` | `getOrganizationMembers` → `tip_server_id` (**no filtra por rol**) | Siempre | :2354-2371, 672-684 |
| 36 | texto | «Propina:» {$} (verde) | — | `tipAmount > 0` | :2374-2383 |
| 37 | texto | (icono User) «Comisión de Vendedor (opcional)» | Sección | Siempre | :2387-2393 |
| 38 | menú | «Vendedor» «Seleccionar...» · «Sin asignar» · `{name}` | `useCommissionRate().resolveRate` | Siempre | :2396-2413, 1009-1020 |
| 39 | botón (segmento) | «Comisión»: (Percent) «%» / (DollarSign) «Monto» | `commissionMethod` | Siempre | :2415-2438 |
| 40 | campo | (Percent/DollarSign) max=100 step 0.5 / step 100 | Tasa o importe | Siempre | :2439-2455 |
| 41 | texto | «Comisión ({rate}% | {$}):» {$} (azul) | — | `commissionAmount > 0` | :2459-2470 |
| 42 | toggle | Switch (icono Zap) «Factura Electrónica» + (Info) tooltip «Al activar esta opción, la factura será enviada automáticamente a la DIAN para su validación electrónica.» + badge «Global» | `sendToFactus` → `electronicInvoicingService.sendToFactus` + `PrintJobsService.enqueueElectronicInvoice` | Siempre; `disabled` + «Global» si `alwaysEnabled` | :2479-2493, 1309-1434; finanzas/facturacion-electronica/ElectronicInvoiceToggle.tsx:40-85 |
| 43 | botón | (icono X) «Cancelar» | Cierra | Pie sticky; `disabled` procesando | :2498-2506 |
| 44 | botón | (icono CheckCircle) «Completar Venta · {$cartTotal}» / «Falta dinero» / «Procesando...» | `handleCheckout`: seriales → `validateCompositeStock` → `POSService.checkout` → `PrintJobsService.enqueueSaleTicket` → `CashDrawerService.open` (si efectivo) → shipment → Factus | Verde si `totalPaid >= cartTotal`, gris «Falta dinero» si no | :2507-2520, 1022-1448 |
| 45 | diálogo | (icono Package) «Selección de Seriales» | Ver B.6 | Ítems `track_serial` sin seriales | :1030-1033, 2596-2608 |
| 46 | diálogo | «Stock insuficiente de ingredientes» · «{mensaje}\n\n¿Deseas continuar con la venta de todos modos?» · «Cancelar» / «Continuar» | Confirma continuar | `validateCompositeStock` no OK | :2609-2647, 1051-1079 |
| 47 | toast | «El cliente indica que ya pagó» · «Confirme el pago como siempre: por el estado del QR o el comprobante.» | Desde pantalla del cliente | `qr_paid_claim` | :279-289 |
| 48 | toast | «Se requiere una sucursal para procesar» · «No hay saldo pendiente para cobrar con QR» · «Metodo QR no soportado» · «Error al generar QR» | Errores | Según caso | :723-726, 736-739, 781, 804, 839 |
| 49 | estado (`alert`) | `alert('Error al procesar el pago: …')` **nativo** | Error del checkout | Excepción | :1444 |
| — | estado | Estados | Cargando: solo «Procesando...» / «Generando…»; sin skeleton al cargar métodos/impuestos/meseros. Offline (Desktop): «Sin conexión: venta {nº} guardada en este equipo. Se sincronizará al volver la red.», «Sin conexión: el envío a domicilio debe crearse manualmente…», «Sin conexión: la factura electrónica se podrá enviar a DIAN…». Impresión: «No hay impresora de caja configurada para esta sucursal…», «No se pudo encolar la impresión física del recibo: …». DIAN: «Enviando factura a DIAN...», «Factura enviada a DIAN», «Error al enviar a DIAN», «Factura electrónica enviada a impresora» | — | :1142-1145, 1217-1240, 1310-1332, 1408-1432 |

**No existe** en el cobro: cliente obligatorio (configurable), cargo a habitación (`RoomChargeSelector.tsx` es un archivo **vacío**), crédito/fiado desde el cobro (solo «Deuda» en el carrito), WhatsApp/correo, notas de venta, fecha de venta, «abrir cajón» manual (solo automático con efectivo), cupones, promociones, cargos de servicio, redondeo, referencia/voucher de tarjeta o transferencia, selección de datáfono.

### B.17 Diálogo QR — `components/shared/QrPaymentDialog.tsx` (montado en CheckoutDialog.tsx:2524-2595)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono QrCode) «Pago QR - {providerLabel}» · «Escanea el codigo QR con tu app bancaria para completar el pago.» | Arranca `QrPoller` | `showQrDialog` | QrPaymentDialog.tsx:222-232, 135-178 |
| 2 | texto | `<img alt="Codigo QR de pago {provider}">` 208×208 / texto EMVCo / (icono QrCode gris) | QR | Esperando | :266-283 |
| 3 | texto | (icono Clock) «Expira en mm:ss» | Cuenta atrás | `expiresAt` | :286-291, 183-196 |
| 4 | toggle | checkbox «Mostrar en pantalla del cliente» + «(sin pantalla conectada)» | Proyecta el QR | `displayPresence.emitting` | CheckoutDialog.tsx:2535-2548 |
| 5 | tabla | «Referencia» {POS-{ts}-{org}} · «Monto» {$} · «Proveedor» {label} | Datos | Siempre | :298-317 |
| 6 | botón | «Cancelar» / «Cerrar» | `onClose` | Siempre | :321-328 |
| 7 | botón | «Ya pague» / «Verificando...» | `poller.checkNow()` | Esperando | :330-345, 203-211 |
| 8 | estado | (CheckCircle2) «Pago confirmado» · «Se cerrara automaticamente en unos segundos.» | `onPaid` → `confirmQrPaymentEntry`; toast «Pago QR confirmado»; cierre a 3 s | `paid` | :237-247; CheckoutDialog.tsx:2549-2594 |
| 9 | estado | (XCircle) «El tiempo ha expirado» · «Solicita un nuevo codigo QR para reintentar el pago.» | Fin | expirado / rechazado / cancelado | :250-260, 218 |

Textos sin tildes: «codigo», «cerrara automaticamente», «Ya pague», «Metodo QR no soportado», «Se abrio».

### B.18 Post-venta — `CheckoutDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (SVG check animado) «¡Venta Completada!» · «Venta #{últimos 8 del id} procesada exitosamente» | Pantalla del cliente → «Gracias» (8 s); háptico en móvil nativo | `showReceipt && completedSale` | CheckoutDialog.tsx:1644-1670, 1149-1153 |
| 2 | badge | «Pendiente de sincronizar · {receipt_number_local}» (ámbar) | Venta offline | `pending_sync` (Desktop) | :1671-1678 |
| 3 | texto | «Total:» · «Pagado:» (verde) · «Cambio:» (azul) | Resumen | Cambio si > 0 | :1680-1701 |
| 4 | botón | (icono Printer) «Re-imprimir Recibo» | `PrintService.printTicket` (PDF/navegador) | Siempre | :1704-1710, 1450-1563 |
| 5 | botón | (icono Printer) «Factura Electrónica» (borde verde) | `PrintService.printElectronicInvoice` | Solo con CUFE | :1711-1768 |
| 6 | botón | «Cerrar» | `onCheckoutComplete(sale)` + reset | Siempre | :1769-1775, 1565-1582 |

**No existe**: enviar por WhatsApp/correo, nueva venta directa, ver detalle de la factura, abrir cajón manual, imprimir copia para el cliente/comercio por separado.

### B.19 Lo roto o inconsistente en el POS (para que el diseño no lo herede)

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | Escáner de cámara **simulado** (devuelve `7501234567890` a los 3 s); solo rellena el buscador | components/ui/barcode-scanner.tsx:49-60 |
| 2 | `window.alert` nativo para 5 mensajes del POS; `alert()` en el error del cobro | app/app/pos/page.tsx:309, 342, 351, 364, 417; CheckoutDialog.tsx:1444 |
| 3 | Toasts de `sonner` **invisibles** (el layout solo monta el `Toaster` de shadcn): caja abierta/cerrada, comandas, «Seleccione una sucursal…», pendientes offline | app/layout.tsx:4, 90; page.tsx:28; AperturaCajaDialog.tsx:17; CierreCajaDialog.tsx:19; PendientesSinConexionDialog.tsx:17 |
| 4 | Permiso «puede cerrar caja» resuelto en cliente por nombre de rol (`includes('admin')`, `role_id === 2`) — regla 6 de CLAUDE.md | page.tsx:88-102; cajas/useBlindCloseMode.ts:31-45 |
| 5 | Fechas sin tz de la org: reloj, «Fecha y hora» de apertura, hora del resumen de carrito, `warranty_end`, «Vence:» de la deuda | page.tsx:645; AperturaCajaDialog.tsx:161; CartTabs.tsx:313; SerialSelectorDialog.tsx:265; CartView.tsx:1298 |
| 6 | Moneda cableada `'COP'` en el badge de la pestaña | CartTabs.tsx:224 |
| 7 | Botón Settings del resumen sin `onClick` | TaxSummary.tsx:316-322 |
| 8 | «Excluir impuesto» por línea y notas de línea solo actualizan estado local (`onCartUpdate`), no `POSService` | CartView.tsx:277-284, 304-313 |
| 9 | «Generar QR» solo para 4 códigos; `bold_link`/`bold_qr` implementados sin botón; lista cableada en línea | CheckoutDialog.tsx:2246 vs 750-779 |
| 10 | Dos toggles «impuestos incluidos» desincronizados (carrito persiste, cobro local); dos totales distintos en el cobro (`cart.total` vs `cartTotal`) | CheckoutDialog.tsx:2270-2283, 1790, 1860-1865, 1903-1906 |
| 11 | «Anular» deuda (crea nota de crédito) sin confirmación; «−» a 0 elimina la línea sin confirmar | CartView.tsx:1116-1124; :942-950 |
| 12 | «Mesero» y «Vendedor» comparten `getOrganizationMembers` sin filtrar por rol | CheckoutDialog.tsx:2364, 2406 |
| 13 | `productCounts` de categorías nunca se pasa; errores de variantes/categorías solo `console.error` | CategoryFilterBar.tsx:198-234; VariantSelectorDialog.tsx:112-128 |
| 14 | Modales de caja a mano (`createPortal` + svg), sin focus-trap ni Esc | AperturaCajaDialog.tsx:120-134; CierreCajaDialog.tsx:219-233 |
| 15 | Código muerto: `POSHome.tsx`, `customer-selector.tsx`, `main-pos.tsx`, `product-search.tsx`, `product-grid.tsx`, `multi-cart-manager.tsx`, `cart-item.tsx`, `cart-summary.tsx`, `RoomChargeSelector.tsx` (0 líneas) | components/pos/* |
| 16 | Toast duplicado al abrir/cerrar caja (diálogo + page) | AperturaCajaDialog.tsx:86 vs page.tsx:239; CierreCajaDialog.tsx:192 vs page.tsx:256 |

## C. Catálogo: menú «…», acciones por fila y acciones masivas

Archivos bajo `src/components/inventario/productos/`: `Header` = `ProductosPageHeader.tsx` · `Catálogo` = `CatalogoProductos.tsx` · `Tabla` = `ProductosTable.tsx` · `Masivas` = `bulk/AccionesMasivas.tsx` · `bulkService` = `bulk/bulkService.ts` · `FBFeed` = `FacebookFeedDialog.tsx`. (El buscador, los filtros y las columnas de la tabla están en `INVENTARIO-PRODUCTOS-Y-POS.md §1.1`.)

### C.1 Cabecera del catálogo

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono Package, caja azul) + «Catálogo de Productos» (h1) | Título | Siempre | Header:59-66 |
| 2 | texto | «{N} productos en el catálogo» | `productos.length` (cargados, **no el total**) | Siempre | Header:68-70 |
| 3 | texto | «Gestiona tu inventario de productos» | Subtítulo alternativo | Solo si `totalProducts` es `undefined` (nunca) | Header:79 |
| 4 | estado | (icono RefreshCw girando) «Cargando de {fastTotalCount}...» / «Cargando resto...» | Carga en background | `backgroundLoading` | Header:71-76 |
| 5 | botón | (icono RefreshCw) outline icon 36×36 | `setRefreshKey(k+1)` → recarga | `disabled` + girando si `loading || actionLoading || backgroundLoading` | Header:88-98; Catálogo:1099-1103 |
| 6 | botón | (icono Sparkles) «Importar con IA» (púrpura) | Abre `ScrapingProductos` (scraping web) | Siempre | Header:101-109 |
| 7 | botón | (icono PlusCircle) «Nuevo Producto» (azul, dentro de `<Link prefetch>`) | Link a `/app/inventario/productos/nuevo` **y** `handleCrear` (plantilla en `sessionStorage` + `router.push` a la misma ruta: doble navegación) | Siempre | Header:112-120; Catálogo:629-664 |
| 8 | menú | «Más opciones» (outline, dropdown w-56) | Abre C.2 | Siempre | Header:123-132 |
| — | estado | Layout: columna en móvil, fila desde `md` | — | — | Header:57, 86 |

### C.2 Menú «Más opciones»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | (icono FileSpreadsheet) «Importar desde CSV» | `router.push('/app/inventario/productos/importar')` | Siempre | Header:133-139; Catálogo:678-681 |
| 2 | menú | (icono Sparkles púrpura) «Importar desde web (IA)» | `setIsScrapingOpen(true)` (**duplica** el botón C.1 #6) | Siempre | Header:140-148 |
| 3 | menú | — separador — | — | — | Header:149 |
| 4 | menú | (icono Download) «Exportar a CSV» | `handleExportar`: espera la carga en background, consulta `product_modifier_groups`, CSV de 26 columnas (SKU, Nombre, Tipo, Descripción, Categoría, Unidad, Código de Barras, Marca, Referencia, Proveedor, Precio de Venta, Precio de Comparación, Costo, Impuesto, Rastrear Inventario, Stock Total, Stock Mínimo, Etiquetas, Notas, URLs de Imágenes, SKU Padre, Datos de Variante, Es Producto Padre, Estación, Modificadores, Estado) → `productos_{fecha}.csv` | Siempre | Header:150-156; Catálogo:886-1032 |
| 5 | menú | (icono Globe azul) «Exportar a Facebook (CSV)» | `fetchAllProductsForFacebook` + `exportToFacebookCatalog` → `facebook_catalog_{fecha}.csv` | Siempre | Header:157-163; Catálogo:1034-1087 |
| 6 | menú | (icono Link2 azul) «URL Feed para Facebook» | Abre `FacebookFeedDialog` (C.15) | Siempre | Header:164-170; Catálogo:1097 |
| — | toast | Exportar CSV: «Sin productos» / «No hay productos para exportar.» · «Error» / «No hay organización seleccionada.» · «Exportación exitosa» / «Se exportaron {N} productos.» | — | — | Catálogo:900, 905, 1031 |
| — | toast | Facebook: «Sin productos activos para exportar.» · «Sin productos válidos» · «Exportación a Facebook exitosa» / «Se exportaron {N} productos al formato de catálogo de Facebook.» · «Error de exportación» | — | — | Catálogo:1036-1083 |

**No existe** en el menú: imprimir etiquetas, códigos de barras, sincronizar con Meta (las rutas `/api/integrations/meta/*` no tienen UI), ajustes de inventario, configurar columnas, carga masiva del asistente, exportar seleccionados.

### C.3 Filtros rápidos de la tabla (segundo buscador)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | (icono Search) «Filtrar rápido en lista...» · aria «Búsqueda rápida en la lista cargada» (h-7, xs) | Filtra en cliente `name/sku/barcode/brand/reference` | Hay productos y no carga | Tabla:426-434 |
| 2 | botón | (icono X) aria «Limpiar búsqueda rápida» | `setQuickSearch('')` | `quickSearch` no vacío | Tabla:435-443 |
| 3 | texto | (icono Filter) «Filtros:» | Rótulo | Siempre | Tabla:445-448 |
| 4 | menú | (icono Image) «Todas las imágenes» / «Con imagen» / «Sin imagen» (ChevronDown) | Trigger | Siempre | Tabla:450-457 |
| 5-7 | menú | «Todas las imágenes» · «Con imagen» · «Sin imagen» | `setFilterHasImage` | Siempre | Tabla:459-467 |
| 8 | menú | «Todos los estados» / «Activos» / «Inactivos» / «Descontinuados» (ChevronDown) | Trigger (**duplica** el filtro Estado de `FiltrosProductos`) | Siempre | Tabla:471-477 |
| 9-12 | menú | «Todos los estados» · «Activos» · «Inactivos» · «Descontinuados» | `setFilterStatus` (en cliente) | Siempre | Tabla:479-482 |
| 13 | texto | «{filtrados} de {total} productos» | Contador | Siempre | Tabla:486-488 |
| 14 | botón | (icono X) «Limpiar» (ghost rojo) | Resetea imagen, estado, orden y búsqueda rápida | Hay filtro/orden/búsqueda activos | Tabla:490-499 |
| — | estado | Skeleton: cabecera + 8 filas | — | `loading` | Tabla:366-405 |
| — | estado | (icono Package) «No se encontraron productos» / «Intente con otros filtros o cree un nuevo producto.» | — | `productos.length === 0` | Tabla:407-419 |

### C.4 Selección

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | toggle | checkbox **nativo** de cabecera · `title` «Seleccionar todos en esta página» · aria «Seleccionar todos los productos en esta página» | `toggleSelectAll` (página actual) | Columna existe si `onSelectionChange`; **sin indeterminado** | Tabla:506-516 |
| 2 | menú | (icono ChevronDown 12px) `title` «Opciones de selección» | Trigger w-56 | Siempre | Tabla:517-528 |
| 3 | menú | (icono CheckCheck) «Seleccionar esta página ({N})» | `toggleSelectAll` (alterna) | Siempre | Tabla:529-535 |
| 4 | menú | (icono Package) «Seleccionar todos ({N})» | Todos los cargados | Siempre | Tabla:536-542 |
| 5 | menú | — separador — | — | `selectedIds.length > 0` | Tabla:545 |
| 6 | menú | (icono X) «Limpiar selección ({N})» (rojo) | `onSelectionChange([])` | `selectedIds.length > 0` | Tabla:546-552 |
| 7 | toggle | checkbox nativo por fila · aria «Seleccionar producto {nombre}» | `toggleSelect(id)` (`stopPropagation`) | Siempre | Tabla:610-620 |
| 8 | estado | Fila seleccionada `bg-blue-50` | — | id en `selectedIds` | Tabla:607 |

### C.5 Menú ⋯ por fila

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono MoreHorizontal) ghost 32×32 · sr-only «Abrir menú» · aria «Acciones para producto {nombre}» | Trigger w-48 | Siempre | Tabla:779-794 |
| 2 | menú | (icono Eye) «Ver detalle» | `handleVer`: precarga producto en `sessionStorage('product_{uuid}_data')` → `/app/inventario/productos/{uuid}` | Siempre | Tabla:795-801; Catálogo:748-790 |
| 3 | menú | (icono Pencil) «Editar» | `/app/inventario/productos/{uuid}/editar` | Siempre | Tabla:802-808; Catálogo:666-670 |
| 4 | menú | (icono Copy) «Duplicar» | `/app/inventario/productos/{uuid}/duplicar` | Siempre | Tabla:809-815; Catálogo:672-676 |
| 5 | menú | — separador — | — | — | Tabla:816 |
| 6 | menú | (icono Trash2) «Eliminar» (rojo) | Abre C.6 | Siempre | Tabla:817-823; Catálogo:792-796 |
| 7 | atajo | Clic en la fila (`cursor-pointer`) | = «Ver detalle» | Siempre | Tabla:605-608 |
| 8 | atajo | Miniatura como `<Link>` `title` «Ver detalle de {nombre}» | Navega al detalle | Siempre | Tabla:622-627 |

**No existe** por fila: ajustar stock, ver kardex, imprimir etiqueta, activar/desactivar, copiar SKU, abrir en tienda web.

### C.6 Diálogo eliminar (individual)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «¿Eliminar producto?» — «Esta acción no se puede deshacer. ¿Está seguro de que desea eliminar este producto?» (`sm:max-w-md`) | Confirmación | `isDeleteDialogOpen` | Catálogo:1144-1150 |
| 2 | botón | «Cancelar» (outline; `w-full` en móvil) | Cierra | Siempre | Catálogo:1153-1159 |
| 3 | botón | «Eliminar» (destructive) | RPC `soft_delete_product(p_product_id)`; quita de la lista local | `disabled={loading}` (**flag equivocado**: debería ser `actionLoading`) | Catálogo:1160-1168, 798-849 |
| — | toast | «Producto eliminado» / «El producto ha sido eliminado correctamente.» · «Error» / «No se pudo eliminar el producto. Intente de nuevo más tarde.» · «No se pudo eliminar el producto. Verifique permisos.» | — | — | Catálogo:820-843 |

### C.7 Barra de acciones masivas (`sticky top-2 z-20`, azul)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «{N} seleccionado» / «{N} seleccionados» | Contador | `selectedIds.length > 0` | Masivas:244-252 |
| 2 | botón | (icono DollarSign) «Precios» (outline sm) | Abre C.8 | Siempre | Masivas:255-258 |
| 3 | botón | (icono Copy) «Precio → Comparación» | Abre C.9 | Siempre | Masivas:260-263 |
| 4 | botón | (icono Hash) «Redondear» | Abre C.10 | Siempre | Masivas:265-268 |
| 5 | botón | (icono Package) «Stock» | Abre C.11 | Siempre | Masivas:270-273 |
| 6 | botón | (icono FolderTree) «Categoría» | Abre C.12 | Siempre | Masivas:275-278 |
| 7 | menú | (icono Power) «Estado» (ChevronDown) | Abre C.13 | Siempre; **único** con `disabled={processing}` | Masivas:280-287 |
| 8 | botón | (icono Trash2) «Eliminar» (destructive) | Abre C.14 | Siempre | Masivas:305-313 |
| 9 | botón | (icono X) ghost 32×32 | `onClearSelection` | Siempre | Masivas:315-317 |
| — | toast | `mostrarResultado`: «{Acción}» / «{N} productos actualizados correctamente.» · parcial (destructive) «{Acción} (parcial)» / «{ok} exitosos, {fail} fallidos. {primer error}» → `avisarCambioCatalogo()` + recarga silenciosa + limpiar selección | — | Tras cada acción | Masivas:121-137 |

**No existe**: asignar etiqueta, asignar impuesto, cambiar proveedor, exportar seleccionados, imprimir etiquetas, «Deshacer», resultado parcial dentro del diálogo, descargar errores. En móvil los 8 botones van en `flex-wrap`.

### C.8 Diálogo «Edición masiva de precios»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Edición masiva de precios» · «Se aplicará a {N} producto(s).» (`sm:max-w-md`) | — | `activeDialog==='precios'` | Masivas:322-329 |
| 2 | campo | «Tipo de precio» — Select: «Precio de venta» / «Precio de compra (costo)» / «Precio de comparación» | `tipoPrecio` (default `venta`) | Siempre | Masivas:332-342 |
| 3 | campo | «Modo de ajuste» — Select: «Establecer valor fijo» / «Por valor ($)» / «Por porcentaje (%)» | `modoAjuste` (default `porcentaje`) | Siempre | Masivas:345-355 |
| 4 | texto | «Dirección» | Label | `modoAjuste !== 'fijo'` | Masivas:357-359 |
| 5 | toggle | (icono TrendingUp) «Aumentar» (chip verde) | `direccion='aumentar'` | `modoAjuste !== 'fijo'` | Masivas:361-372 |
| 6 | toggle | (icono TrendingDown) «Disminuir» (chip rojo) | `direccion='disminuir'` | Ídem | Masivas:373-384 |
| 7 | campo | Label dinámico «Nuevo valor» / «Cantidad a aumentar ($)» / «Cantidad a disminuir ($)» / «Porcentaje a aumentar (%)» / «Porcentaje a disminuir (%)» — number min 0, placeholder «Ej: 10» / «Ej: 5000» | `cantidadPrecio` | Siempre | Masivas:389-401 |
| 8 | texto | Aviso ámbar (AlertTriangle): «Los productos **sin costo previo** no serán afectados (0 × % = 0). Use modo **"Establecer valor fijo"** para asignar un costo a productos que no tienen uno.» | — | `tipoPrecio==='compra' && modoAjuste==='porcentaje'` | Masivas:403-412 |
| 9 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:415-417 |
| 10 | botón | «Aplicar» (azul, Loader2) | `bulkUpdatePrices`: expande padres↔hijos, cierra vigencia e inserta en `product_prices`/`product_costs` (lotes 200/100) | `disabled={processing}` | Masivas:418-421, 139-155; bulkService:152-380 |
| — | estado | Validación: «Error» / «Ingrese una cantidad válida (mayor o igual a 0).» · Resultado: «Precios actualizados» | — | — | Masivas:141-153 |

**No existe**: «Vigente desde» (siempre ahora), vista previa del resultado, redondeo posterior encadenado.

### C.9 Diálogo «Precio de venta → Precio de comparación»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Precio de venta → Precio de comparación» · «Se aplicará a {N} producto(s).» | — | `copiarComparacion` | Masivas:684-691 |
| 2 | texto | Caja azul «Comportamiento por defecto:» + «Productos **sin** precio de comparación: se copia el precio de venta.» / «Productos **con** precio de comparación: se dejan igual.» | — | Siempre | Masivas:693-699 |
| 3 | toggle | checkbox **nativo** «Sobrescribir también los que ya tienen precio de comparación» | `sobrescribirComparacion` | Siempre | Masivas:700-710 |
| 4 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:713-715 |
| 5 | botón | «Aplicar» | `bulkCopyPriceToCompare` | `disabled={processing}` | Masivas:716-719, 207-216; bulkService:578-728 |
| — | estado | Resultado «Precio de comparación actualizado» | — | — | — |

### C.10 Diálogo «Redondear precios»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Redondear precios» · «Se aplicará a {N} producto(s) (incluye padres e hijos).» | — | `redondear` | Masivas:523-530 |
| 2 | campo | «Precio a redondear» — Select: «Precio de venta» / «Costo de compra» / «Precio de comparación» | `tipoRedondeo` | Siempre | Masivas:534-544 |
| 3 | texto | «Modo de redondeo» | Label | Siempre | Masivas:549 |
| 4 | toggle | «A múltiplo de N» (chip azul) | `modoRedondeo='multiplo'` (default) | Siempre | Masivas:551-561 |
| 5 | toggle | «Reemplazar últimos dígitos» | `modoRedondeo='digitos'` | Siempre | Masivas:562-572 |
| 6 | texto | «Redondear al múltiplo más cercano de» | Label | Modo `multiplo` | Masivas:579 |
| 7 | chip ×5 | «10» «50» «100» «500» «1000» | `multiploRedondeo` (default 100) | Modo `multiplo` | Masivas:580-595 |
| 8 | campo | «o personalizado:» + number min 1 (w-24) | `multiploRedondeo` | Modo `multiplo` | Masivas:596-605 |
| 9 | texto | «Ej: $1,234 con múltiplo 100 → $1,200 \| $1,267 con múltiplo 100 → $1,300» | Ayuda | Modo `multiplo` | Masivas:606-608 |
| 10 | campo | «¿Cuántos dígitos reemplazar?» — Select «1 dígito» … «5 dígitos» | `digitosCount` | Modo `digitos` | Masivas:614-629 |
| 11 | campo | «Valor a poner» — text, placeholder «000», `maxLength` = dígitos | `digitosValor` | Modo `digitos` | Masivas:632-643 |
| 12 | chip ×≤6 | «000» «500» «900» «990» «999» «050» | `digitosValor` | Modo `digitos` **y solo con 3 dígitos** (filtro por longitud) | Masivas:646-664 |
| 13 | texto | «Ej: $1,234 con últimos 3 = "990" → $1,990 \| $5,678 con últimos 2 = "50" → $5,650» | Ayuda | Modo `digitos` | Masivas:665-667 |
| 14 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:672-674 |
| 15 | botón | «Aplicar» | `bulkRoundPrices` | `disabled={processing}` | Masivas:675-678, 218-242; bulkService:730-924 |
| — | estado | Validación: «El múltiplo debe ser mayor a 0» · «Los dígitos a reemplazar deben estar entre 1 y 5» · «El valor debe tener {N} dígitos» · Resultado «Precios redondeados» | — | — | Masivas:222-233 |

### C.11 Diálogo «Actualización masiva de stock»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Actualización masiva de stock» · «Se aplicará a {N} producto(s).» | — | `stock` | Masivas:427-434 |
| 2 | campo | «Sucursal» — Select «Seleccione sucursal» (branches de la org) | Preselecciona la sucursal global | Siempre | Masivas:437-450, 107-119 |
| 3 | campo | «Modo» — Select: «Establecer cantidad exacta» / «Sumar/restar a cantidad actual» | `modoStock` (default `set`) | Siempre | Masivas:452-461 |
| 4 | campo | «Cantidad» — number, placeholder «Ej: 10 o -5» (add) / «Ej: 100» (set) | `cantidadStock` | Siempre | Masivas:464-471 |
| 5 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:475-477 |
| 6 | botón | «Aplicar» | `bulkUpdateStock`: solo `track_stock`, upsert `stock_levels` (lotes 300); **no genera `stock_movements`** | `disabled={processing}` | Masivas:478-481, 157-171; bulkService:382-523 |
| — | estado | Validación «Complete todos los campos.» · Resultado «Stock actualizado» | — | — | Masivas:159-170 |

### C.12 Diálogo «Asignar categoría»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Asignar categoría» · «Se asignará a {N} producto(s).» | — | `categoria` | Masivas:487-494 |
| 2 | campo | «Categoría» — Select «Seleccione categoría» (lista plana, sin jerarquía ni búsqueda) | `selectedCategoria` | Siempre | Masivas:496-508 |
| 3 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:511-513 |
| 4 | botón | «Asignar» | `bulkAssignCategory`: `category_id` principal (no expande hijos, no toca adicionales) | `disabled={processing}` | Masivas:514-517, 183-195; bulkService:926-950 |
| — | estado | Validación «Seleccione una categoría.» · Resultado «Categoría asignada» | — | — | Masivas:184-191 |

### C.13 Menú «Estado»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | (punto verde) «Activar» | `bulkUpdateStatus('active')` **sin confirmación** | Siempre | Masivas:289-292 |
| 2 | menú | (punto gris) «Desactivar» | `'inactive'` | Siempre | Masivas:293-296 |
| 3 | menú | — separador — | — | — | Masivas:297 |
| 4 | menú | (punto rojo) «Descontinuar» | `'discontinued'` | Siempre | Masivas:298-301 |
| — | estado | Resultado «Estado actualizado» | — | — | Masivas:173-181 |

### C.14 Diálogo «¿Eliminar productos?»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «¿Eliminar productos?» · «Se eliminarán {N} producto(s). Esta acción no se puede deshacer.» | — | `eliminar` | Masivas:725-733 |
| 2 | botón | «Cancelar» | Cierra | `disabled={processing}` | Masivas:735-737 |
| 3 | botón | «Eliminar todos» (destructive) | `bulkDelete`: una RPC `soft_delete_product` por producto en bucle | `disabled={processing}` | Masivas:738-741, 197-205; bulkService:553-576 |
| — | estado | Resultado «Productos eliminados»; errores «Producto {id}: {mensaje}» (solo el primero en el toast) | — | — | — |

### C.15 `FacebookFeedDialog` («URL Feed de Catálogo para Facebook»)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | (icono Globe) «URL Feed de Catálogo para Facebook» · «Pega esta URL en Facebook Commerce Manager para que Facebook lea tu catálogo automáticamente. La URL se mantiene actualizada con tus productos en tiempo real.» (`sm:max-w-[600px]`) | `POST /api/facebook-feed/token` (`get_token`, `get_currencies`), caché `sessionStorage` | `open` | FBFeed:243-254, 79-101 |
| 2 | campo | «URL del Feed (CSV)» — Input `readOnly` mono, placeholder «Generando URL...» | URL principal `…/api/facebook-feed?org_id=&token=` | Siempre | FBFeed:259-268 |
| 3 | botón | (icono Copy → Check 2 s) aria «Copiar URL principal del feed» | `clipboard.writeText` | `disabled` sin URL | FBFeed:269-281 |
| 4 | estado | (Loader2) «Generando URL...» | — | `tokenLoading` | FBFeed:283-288 |
| 5 | texto | (icono Coins) «Feeds por moneda» | Sección | Siempre | FBFeed:293-301 |
| 6 | estado | «Cargando monedas configuradas...» · «No se pudieron cargar las monedas. La URL principal sigue funcionando.» · «No hay monedas adicionales configuradas. Actívalas en Finanzas → Monedas.» | — | Según carga | FBFeed:303-314 |
| 7 | tabla | `{CODE}` + Input `readOnly` `…&currency={CODE}` + botón copiar (aria «Copiar URL del feed en {CODE}») | Una fila por moneda no base | Hay monedas | FBFeed:316-342 |
| 8 | texto | Aviso ámbar `role=status` «Última tasa de cambio: {rateDate}. Considera actualizar las tasas en Finanzas → Monedas.» | — | `rateDate` > 72 h | FBFeed:349-355 |
| 9 | texto | Caja azul «Cómo usar esta URL en Facebook:» + 6 pasos («Ve a Facebook Commerce Manager» · «Selecciona tu catálogo de productos» · «Ve a "Fuentes de datos" → "Agregar fuente de datos"» · «Selecciona "Feed programado" y elige "CSV"» · «Pega esta URL en el campo "URL del archivo"» · «Configura la frecuencia de actualización (recomendado: diaria)») | — | Siempre | FBFeed:358-370 |
| 10 | texto | «El token garantiza que solo Facebook pueda acceder a tu catálogo.» | — | Siempre | FBFeed:373-375 |
| 11 | botón | (icono RefreshCw) «Regenerar token» (outline sm) | `POST … action: 'regenerate'` **sin confirmación** | `disabled={regenerating}` | FBFeed:376-389, 178-217 |
| 12 | botón | «Cerrar» | Cierra | Siempre | FBFeed:394-396 |
| 13 | botón | (icono ExternalLink) «Vista previa» (azul) | `window.open(feedUrl)` | Hay `feedUrl` | FBFeed:397-406 |
| — | toast (sonner) | «URL copiada al portapapeles» · «URL {CODE} copiada al portapapeles» · «Token regenerado. La URL anterior ya no funciona.» · «Error al regenerar el token» · «Error al obtener el token del feed» · «Error de conexión» | — | — | FBFeed:126-231 |

**No existe**: moneda por defecto del feed (hay API y servicio, sin control), sincronización directa Meta/TikTok, estado de la última sincronización.

### C.16 Lo roto o duplicado en el catálogo

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | Doble navegación en «Nuevo Producto» (`<Link>` + `router.push`) | Header:112-120; Catálogo:658 |
| 2 | «Importar con IA» duplicado (botón + ítem de menú) | Header:101-109, 140-148 |
| 3 | Diálogo eliminar usa `loading` en vez de `actionLoading` | Catálogo:802, 1163-1166 |
| 4 | Código muerto: `RenderAcciones`, `handleDuplicarLegacy` | Catálogo:684-746, 852-884 |
| 5 | Menú Estado masivo sin confirmación; solo «Estado» se bloquea con `processing`; los diálogos se cierran con Esc aunque `processing` | Masivas:255-313, 322-725 |
| 6 | Chips de «Reemplazar últimos dígitos» solo con 3 dígitos | Masivas:646-648 |
| 7 | Estado y Categoría no expanden variantes; Precios/Stock/Redondear/Comparación sí; el texto «(incluye padres e hijos)» solo en Redondear | Masivas:528; bulkService:525-551, 926-950 |
| 8 | `bulkDelete` = N RPC en bucle | bulkService:553-576 |
| 9 | `toISOString().split('T')[0]` para nombres de archivo | Catálogo:1025, 1071 |
| 10 | Dos sistemas de toast (`sonner` en FBFeed, `use-toast` en el resto) | FBFeed:15; Masivas:44 |
| 11 | Subtítulo cuenta cargados, no total | Catálogo:1104; Header:70-74 |
| 12 | Toast parcial muestra solo el primer error | Masivas:131 |
| 13 | Etiquetas distintas para el mismo valor: «Precio de compra (costo)» vs «Costo de compra» | Masivas:339, 541 |

## D. Submenús laterales del POS y Configuración › POS

Solo cabecera y acciones principales de cada página (una fila por acción), el menú ⋯ por fila y los diálogos cortos. Los formularios largos (nueva venta, nueva promoción, nuevo cupón…) no se detallan campo a campo.

### D.0 Submenú lateral real del POS

Fuente: `components/app-layout/Sidebar/SidebarNavigation.tsx:243-265` (duplicado en `components/app-layout/AppLayout.tsx:246-262` y `lib/config/modulePages.ts:96-110`, catálogo que consulta `moduleManagementService`). Sección «Ventas» (`nav.sectionSales`, `messages/es.json:1792`); ítem padre «Ventas» (`nav.pos`, `es.json:1760`), icono ShoppingCart, `moduleCode: 'pos'`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Ventas (`nav.pos`, icono ShoppingCart) | Despliega el submenú; href `/app/pos` | Módulo `pos` en `organization_modules` y permitido para el cargo (`jobPositionVisibleModules`) | SidebarNavigation.tsx:245-250 |
| 2 | menú | POS (icono ShoppingCart) | `/app/pos` | Página activa en `organization_module_pages` y visible para el cargo | :251 |
| 3 | menú | Pedidos Online (icono Globe) | `/app/pos/pedidos-online` | Ídem | :252 |
| 4 | menú | Ventas (icono Receipt) | `/app/pos/ventas` | Ídem | :253 |
| 5 | menú | Cajas (icono Wallet) | `/app/pos/cajas` | Ídem | :254 |
| 6 | menú | Mesas (icono Table2) | `/app/pos/mesas` | Ídem | :255 |
| 7 | menú | Reservas Mesas (icono CalendarClock) | `/app/pos/reservas-mesas` | Ídem | :256 |
| 8 | menú | Comandas (icono ClipboardList) | `/app/pos/comandas` | Ídem | :257 |
| 9 | menú | Devoluciones (icono Undo2) | `/app/pos/devoluciones` | Ídem | :258 |
| 10 | menú | Propinas (icono Gift) | `/app/pos/propinas` | Ídem | :259 |
| 11 | menú | Cargos Servicio (icono Percent) | `/app/pos/cargos-servicio` | Ídem | :260 |
| 12 | menú | Cupones (icono Gift) | `/app/pos/cupones` | Ídem | :261 |
| 13 | menú | Promociones (icono Percent) | `/app/pos/promociones` | Ídem | :262 |
| 14 | menú | Cuentas por Cobrar (icono DollarSign) | `/app/pos/cuentas-por-cobrar` | Ídem | :263 |

Reglas de visibilidad (`SidebarNavigation.tsx:468-522`): el padre se oculta si `pos` no está en `activeModuleCodes` (`moduleManagementService.getActiveModules()`, `AppLayout.tsx:598-610`); los sub-ítems se filtran contra `activeModulePages['pos']` (`organization_module_pages`, `moduleManagementService.ts:566-589`: sin filas → todas; con filas → solo `is_active`), luego por `jobPositionVisiblePages` del cargo; si queda **una sola** página, el padre pasa a enlace directo sin submenú.

Rutas que existen y **no están** en el menú: `/app/pos/reportes` (solo enlazada desde `POSHome.tsx:118-125`, componente muerto), `/app/pos/devoluciones/motivos`, `/app/pos/carritos` y `/app/pos/pagos-pendientes` (estas dos devuelven `null`: `app/app/pos/carritos/page.tsx:1-3`, `pagos-pendientes/page.tsx:1-3`). `src/config/moduleConfig.ts:114-124` (`moduleSubroutes.pos`, con `/app/pos/configuracion` inexistente) solo lo consume `components/layout/DynamicSidebar.tsx`, que no se monta.

### D.1 Cómo se llega a Configuración › POS

`/app/configuracion?modulo=pos` → `app/app/configuracion/page.tsx:7-27` → `ConfiguracionLayout` (pestañas, `layout/ConfiguracionLayout.tsx:58-78`) → `ConfiguracionPanelRenderer.tsx:105-121` (`PANEL_MAP.pos = POSConfigPanel`) → `configuracion/panels/pos/POSConfigPanel.tsx:6` → `<ConfiguracionPage embedded />` de `components/pos/configuracion`. Parámetro en `useConfiguracionState.ts:19`; sin él cae en `general`.

Pestañas de Configuración (`configuracion/config/configModulesRegistry.ts:32-152`; filtro `useActiveConfigModules.ts:20-26`: `desktopOnly` exige `isDesktop()`, `isCore` siempre, el resto por `active_modules`): General · Sitio Web · CRM · Recursos Humanos · PMS Hotel · **POS** («Punto de venta, impresiones y consecutivos», icono ShoppingCart, módulo `pos`) · Chat · Integraciones · Parking · Calendario · Timeline · Roles · Facturación Electrónica · Gym · Notificaciones · Datos sin conexión (solo Desktop). 16 pestañas; títulos literales, no de `es.json`.

Roto: `ImpresionesPage.tsx:110-113` enlaza a `/app/pos/configuracion`, ruta inexistente.

### D.2 Pedidos Online — `/app/pos/pedidos-online` (`app/app/pos/pedidos-online/page.tsx` + `components/pos/pedidos-online/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | → `/app/pos` | Siempre | page.tsx:629-632 |
| 2 | texto | «Pedidos Online» / «POS / Pedidos Online» | Título + breadcrumb | Siempre | page.tsx:635-642 |
| 3 | toggle | (icono LayoutGrid) «Vista Kanban» · (icono List) «Vista Lista» | `viewMode` | Siempre | page.tsx:646-663 |
| 4 | toggle | (Volume2/VolumeX) «Silenciar notificaciones» / «Activar sonido» · (Bell/BellOff) «Desactivar auto-refresh» / «Activar auto-refresh» | Sonido y refresco automático | Siempre | page.tsx:665-682 |
| 5 | botón | «Actualizar» (texto oculto en móvil) | `loadOrders()` | `disabled` en loading | page.tsx:683-692 |
| 6 | stat | «Pedidos hoy» / «Pedidos ayer» / «Pedidos (7 días)» / «Pedidos (30 días)» / «Total pedidos» · «Pendientes» · «Completados» · «Cancelados» · «Ingresos» · «Ticket promedio» | Según preset | Siempre | WebOrderStats.tsx:18-22, 87-129 |
| 7 | chip | Período: «Hoy» / «Ayer» / «Últimos 7 días» / «Últimos 30 días» / «Personalizado» + 2 `date` «a» | `datePreset` | Fechas solo `custom` | page.tsx:705-737 |
| 8 | campo | «Buscar por # pedido, nombre, teléfono, correo, dirección o producto...» + «Buscar» + «Limpiar» | Búsqueda | «Limpiar» con filtros | WebOrderFilters.tsx:168-179 |
| 9 | chip | Estado: «Pendientes» / «Confirmados» / «Preparando» / «Listos» / «En camino» / «Entregados» / «Cancelados» / «Expirados» · Pago: «Pagados» / «Pago pendiente» / «Pago fallido» / «Reembolsados» · «Programados» · Tipo: «Todos» / «Retiro» / «Delivery propio» / «Terceros» · «Filtros activos:» | Multi-toggle | Siempre | WebOrderFilters.tsx:51-126, 191-243 |
| 10 | toggle + estado | Checkbox de cabecera · «{n} seleccionado(s)» + «Limpiar» · «Confirmar» / «En proceso» / «Listos» / «Entregados» / «Marcar pagados» · «Imprimir» / «Exportar CSV» | Barra masiva | Vista lista con selección | page.tsx:834-922 |
| 11 | botón (fila) | «Confirmar» + (XCircle) rechazar (`pending`) · «Preparar» (`confirmed`) · «Listo» (`preparing`) · «Enviar» (`ready` no pickup) · «Entregado» (`ready` pickup / `in_delivery`) · (Eye) | Cambio de estado | Según estado | page.tsx:1065-1144 |
| 12 | texto | Kanban: «Pendientes (n)» / «Confirmados (n)» / «Preparando (n)» / «Listos» / «En camino (n)» + «Ver más ({n} restantes)»; tarjetas con «Confirmar/Ok» · «Iniciar preparación/Preparar» · «Marcar listo/Listo» · «Enviar a domicilio/Enviar» · «Marcar entregado/Entregado» · (Eye) | Columnas | `viewMode==='kanban'` | page.tsx:1194-1284; WebOrderCard.tsx:246-320 |
| 13 | diálogo | «Confirmar pedido»: «Tiempo de preparación (Listo aprox)» (número + Minutos/Horas/Días) · «Tiempo de traslado (Entrega aprox)» · checkbox «Marcar como pagado» · «Cancelar» / «Confirmar pedido» | Confirma | Al pulsar Confirmar | page.tsx:1301-1392 |
| 14 | diálogo | «Rechazar pedido»: «Motivo del rechazo» («Ej: Producto agotado, fuera de horario de entrega...») · «Cancelar» / «Rechazar pedido» | Rechaza | Al pulsar rechazar | page.tsx:1400-1433 |

Detalle `/app/pos/pedidos-online/[id]` (`[id]/page.tsx` + `components/*` + `OrderActions.tsx`): «Volver» · `{order_number}` + badges estado / «Programado» / «Cupón: {code}» / «Propina: ${n}» · «Para: {fecha}» · «Ver venta POS» (si `sale_id`) · «Acciones»: «Confirmar pedido» / «Rechazar» (`pending`) · «Iniciar preparación» (`confirmed`) · «Marcar como listo» (`preparing`) · «Enviar a domicilio» (`ready` no pickup) · «Marcar como entregado» · «Marcar como pagado» · «Crear venta» (`delivered` sin venta) · «Imprimir» (**nunca**: la página no pasa `onPrint`) · «Cancelar» (`pending`/`confirmed`) · «Asignar Conductor» (delivery propio) · diálogos «Confirmar pedido», «Rechazar pedido» / «Cancelar pedido» («Motivo», «Volver» / «Rechazar» ó «Cancelar pedido»), «Asignar Delivery» («Vehículo», «Conductor», «Tiempo estimado de entrega (minutos)», «Cancelar» / «Asignar Delivery») — OrderHeader.tsx:29-76; OrderActions.tsx:99-206; OrderDeliveryCard.tsx:44, 147-155; ConfirmOrderDialog.tsx:92-186; CancelOrderDialog.tsx:36-78; AssignDeliveryDialog.tsx:184-309. **23 controles.**

### D.3 Ventas — `/app/pos/ventas` (`components/pos/ventas/{VentasPage,VentasFilters,VentasTable}.tsx`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | → `/app/pos` | Siempre | VentasPage.tsx:137-141 |
| 2 | texto | «Historial de Ventas» / «{n} ventas encontradas» | Título | Siempre | VentasPage.tsx:143-149 |
| 3 | botón | «Actualizar» · «Nueva Venta» | `loadSales` / → `/app/pos/ventas/nuevo` | Siempre | VentasPage.tsx:152-161 |
| 4 | filtro | «Buscar» («ID, cliente, notas...») · «Origen»: Todos / POS / Página Web · «Estado»: Todos los estados / Pendiente / Completada / Anulada · «Estado de pago»: Todos / Pagado / Pendiente / Parcial / Reembolsado · «Desde» / «Hasta» · «Limpiar» | Filtros | «Limpiar» con filtros | VentasFilters.tsx:43-144 |
| 5 | menú ⋯ | «Ver Detalle» · «Imprimir» · «Duplicar» (sessionStorage → `/app/pos/ventas/nuevo?duplicate=true`) · «Crear Devolución» (`completed`; → `/app/pos/devoluciones/nuevo?sale_id=` **ruta inexistente**) · «Anular Venta» (`window.confirm` + `window.prompt` nativos) | Por fila | Según estado | VentasTable.tsx:251-289; VentasPage.tsx:61-113 |
| 6 | paginación | `DataTablePagination` | — | Siempre | VentasPage.tsx:197-208 |

Detalle `/app/pos/ventas/[id]` (`VentaDetalle.tsx`): (ArrowLeft) · «Venta #{id8}» / «Pedido {invoice_number}» + badge «Web» / «Mesa» / «POS» + estado + `FactusStatusBadge` · «Imprimir» · «Reimprimir en Caja» / «Enviando...» (tooltip «Enviar a la impresora física de caja (vía Print Agent)») · «Duplicar» · «Devolución» (`completed`; ruta inexistente) · «Anular» (confirm/prompt nativos) · «Ver factura» (→ `/app/finanzas/facturas-venta/{id}`) · «Ver en cuentas por cobrar» · «Ver en contabilidad» — :267-341, 632-754. **12 controles.**

Nueva venta `/app/pos/ventas/nuevo` (`ventas/nuevo/NuevaVentaPage.tsx`): (ArrowLeft) · «Nueva Venta» / «Duplicar Venta» + org · «Guardar» (**TODO: solo `alert()` y redirige**) · «Cobrar» (abre `CheckoutDialog`) · «Cliente» + `CustomerSelector` · «Carrito ({n})» · «Limpiar» · «Código de cupón» + «Aplicar» (**TODO: `alert('… (demo)')`**) · «Cobrar {total}» — :224-431, 143-177. **9 controles.**

### D.4 Cajas — `/app/pos/cajas` (`app/app/pos/cajas/page.tsx` + `components/pos/cajas/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Cajas POS» / `{organization.name}` · (Clock) `{lastUpdate}` · badge «🟢 Mi Caja Abierta» / «🔴 Sin Caja» · «{n} abierta(s)» · (RefreshCw) · `BranchBadge` | Cabecera | Siempre | page.tsx:255-296 |
| 2 | pestaña | «Mi Caja» · «Cajas Abiertas» + badge {n} · «Historial» | Tabs | Siempre | page.tsx:310-326 |
| 3 | estado | «No tienes caja abierta» / «Abre una caja para comenzar…» + «Abrir Caja» | Vacío | Sin sesión | page.tsx:331-348 |
| 4 | botón | «Registrar Movimiento» · «Cerrar Caja» (o deshabilitado con tooltip «Solo el cajero que abrió la caja o un administrador puede cerrarla» + «Solo {nombre} o un administrador pueden cerrar esta caja.») | Diálogos B.1b y «Registrar Movimiento» | Con sesión; permiso por **nombre de rol en cliente** | page.tsx:355-388, 72-75 |
| 5 | tabla | `CashSummaryCard` + `MovimientosList` · «Generar Reporte»: «Reporte Hoja Carta» / «Generando...» · «Reporte POS 80mm» | Resumen y PDF | Con sesión | page.tsx:394-397; ReportGenerator.tsx:375-410 |
| 6 | tabla | Cajas Abiertas: tarjetas con «Monto inicial» + «Ver detalle» (deshabilitado con tooltip «Cierre ciego activo: no puedes ver el detalle de esta caja» si `!showExpected`) | → `/app/pos/cajas/{uuid}` | Tab Cajas Abiertas | page.tsx:446-463 |
| 7 | tabla | «Historial de Sesiones»: ID · Sucursal · Cajero · Apertura · Cierre · Estado · Inicial · Final · Diferencia · (Eye) + `SessionsPagination` | — | Tab Historial | page.tsx:474-566 |
| 8 | diálogo | «Registrar Movimiento» (portal): pestañas «Ingreso» / «Egreso» · «Concepto» (+ «Especificar otro concepto...») · «Monto *» · «Observaciones (Opcional)» («Detalles adicionales...») · «Cancelar» / «Registrar Ingreso» ó «Registrar Egreso» | `cash_movements` | Registrar Movimiento | MovimientosDialog.tsx:136-302 |

Detalle `/app/pos/cajas/[id]` (`cajas/detalle/CajaDetallePage.tsx`): (ArrowLeft) · «Sesión #{id}» + «Abierta» / «Cerrada» + fechas · «Actualizar» · «Arqueo» · «Movimiento» · «Cerrar Caja» (solo `open`) · stats «Monto Inicial» · «Ventas Efectivo» · «Monto Esperado» ó «Cierre Ciego / No visible para cajeros» · «Diferencia» (+ «Visible solo para administradores») · pestañas «Resumen» / «Movimientos ({n})» / «Arqueos ({n})» / «Ventas ({n})» · (+) «Movimiento» / (+) «Arqueo» · «Ver venta» por fila — :162-676. **13 controles.**

Nuevo arqueo `…/arqueos/nuevo` (`cajas/arqueos/NuevoArqueoPage.tsx`): (ArrowLeft) · «Nuevo Arqueo» / «Sesión #{id} - Registrar conteo de caja» · badge «Cierre Ciego» · «Tipo de Arqueo»: Apertura / Parcial / Cierre · «Limpiar» (billetes) · secciones «Efectivo - Monedas» · «Otros Métodos de Pago» · «Notas» («Observaciones del arqueo...») · «Resumen» · «Guardar Arqueo» / «Guardando...» — :258-541. **7 controles.**

Nuevo movimiento `…/movimientos/nuevo` (`cajas/movimientos/NuevoMovimientoPage.tsx`): (ArrowLeft) · «Nuevo Movimiento» / «Sesión #{id} - Registrar ingreso o egreso» · «Tipo de Movimiento»: Ingreso / Egreso (radio-cards) · «Concepto» («Seleccionar concepto» + «Otro (especificar)») · «Especificar concepto» («Ingrese el concepto...») · «Monto» · «Notas (opcional)» (RichText «Observaciones adicionales...») · «Cancelar» / «Guardar Movimiento» — :113-181. **8 controles.**

### D.5 Mesas — `/app/pos/mesas` (`app/app/pos/mesas/page.tsx`, 1.207 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (ArrowLeft) · «Plano de Mesas» / «POS / Mesas» | Cabecera | Siempre | :498-512 |
| 2 | toggle | «Lista» / «Mapa» · (RefreshCw) · «Nueva Mesa» | `viewMode` / recarga / `MesaFormDialog` | Siempre | :518-543 |
| 3 | tabla | `MesasFloorMap` (plano editable) | — | `viewMode==='map'` | :547-555 |
| 4 | botón | «Gestionar Zonas» · «Combinar Mesas» / «Cancelar Combinación» · «Mover Pedido» · «Historial» | `ZonasManager` / modo combinar / `MoverPedidoDialog` / `HistorialMesasDialog` | Vista lista | :567-586 |
| 5 | estado | «{n} mesa(s) seleccionada(s)» + «Combinar Ahora» · «Modo Combinar: Selecciona las mesas…» | Combina | Modo combinar | :590-616 |
| 6 | filtro | «Buscar mesa por nombre...» (+ X) · «Todas las zonas» / «Sin zona» / {zona} · «Todos los estados» / «🟢 Libre» / «🔴 Ocupada» / «🟠 Cuenta solicitada» / «🟡 Reservada» · «Limpiar filtros» | Filtros | Vista lista | :622-679 |
| 7 | estado | «No hay mesas para mostrar» + «Crear Primera Mesa» | Vacío | Sin resultados | :684-692 |
| 8 | botón | Tarjeta de mesa (clic): libre → «Abrir Mesa»; ocupada → `/app/pos/mesas/{id}` · (icono) «Solicitar cuenta» (hover, sesión activa) · checkbox numerado + badge «Principal» (modo combinar) | — | Siempre | :397-410, 1101-1146 |
| 9 | menú ⋯ | «Editar Mesa» · «Editar Comensales» · «Liberar Mesa» | — | Hover; los 2 últimos con sesión | :1165-1198 |
| 10 | diálogo | «Abrir Mesa - {mesa}»: «Número de comensales» · «Se creará una nueva sesión…» · «Cancelar» / «Abrir Mesa» | Abre sesión | Clic en mesa libre | :1019-1052 |
| 11 | diálogo | «Editar Comensales - {mesa}»: «Número de comensales» · «Cancelar» / «Guardar» | — | Menú | :985-1012 |
| 12 | diálogo | «¿Liberar mesa {nombre}?»: «Cancelar» / «Sí, liberar mesa» | Cierra sesión | Menú | :963-977 |
| 13 | diálogo | «¿Eliminar mesa?»: «Cancelar» / «Eliminar» | **Inalcanzable** (`setMesaEliminar(mesa)` nunca se llama) | — | :76, 926-948 |

Detalle `/app/pos/mesas/[id]` (`[id]/page.tsx` 1.984 líneas + `components/pos/mesas/id/*`): «Volver» · `{mesaNombre}` + badge estado / «Disponible» + zona · (RefreshCw) · «Historial» (`SessionTimelineDialog`) · «Combinar Mesa» · «Agregar Producto» (`AddProductDialog`) · stats «Comensales» (clic → editar) · «Tiempo» · «Items» · «Total» · «Mesero» / «Sin asignar» (clic → asignar) · «Pedido Actual» / «{n} productos pendientes · {n} pagados» · vacío «No hay productos en el pedido» + «Agregar Primer Producto» · «Enviar a Cocina» · «Ver Pre-Cuenta» · «Solicitar Cuenta» · «Dividir Cuenta ({n} comensales)» · «✓ Cuenta dividida en {n} partes» + «Cancelar división» + «{n} producto(s) sin asignar» + «Modificar división» / «⚠️ Dividir de Nuevo (REQUERIDO)» · «Procesar Pago» / «Procesar Pagos Divididos» / «Divide de Nuevo para Continuar» (abre `CheckoutDialog`) · «Debe abrir una caja antes de procesar el pago» · «Liberar Mesa» · diálogos «Editar Comensales» («Cantidad de comensales» + botones rápidos), «Asignar Mesero» («Mesero» `SearchSelect` «Selecciona un mesero»), «¿Liberar mesa {nombre}?» — MesaDetailHeader.tsx:36-97; MesaStatsCards.tsx:31-111; MesaActionsSidebar.tsx:158-321; page.tsx:1601-1981. **24 controles.**

### D.6 Reservas de mesas — `/app/pos/reservas-mesas` (`components/pos/reservas-mesas/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `BranchBadge` · «Reservas de Mesas» / «Gestiona las reservas del restaurante» | Cabecera | Siempre | page.tsx:181; ReservasHeader.tsx:61-66 |
| 2 | botón | «Actualizar» · «Nueva Reserva» (`ReservaFormDialog`, 385 líneas) | — | Siempre | ReservasHeader.tsx:70-86 |
| 3 | filtro | «Buscar por nombre, teléfono o email...» · «Estado»: Todos los estados / Pendiente / Confirmada / Sentada / Completada / Cancelada / No se presentó · «Origen»: Todos / Admin / Website / Teléfono / WhatsApp · `date` desde / hasta | Filtros | Siempre | ReservasHeader.tsx:94-140 |
| 4 | stat | «Hoy» / «Pendientes» / «Confirmadas» / «Sentadas» / «Canceladas» / «No Show» | 6 tarjetas | Siempre | ReservasStats.tsx |
| 5 | menú ⋯ | «Editar» · «Confirmar» (`pending`) · «Marcar como sentada» (pending/confirmed) · «Completar» (`seated`) · «Cancelar» / «No se presentó» · «Eliminar» | Cambio de estado | Según estado | ReservasList.tsx:192-256 |
| 6 | diálogo | «¿Eliminar reserva?» «Esta acción no se puede deshacer…»: «Cancelar» / «Eliminar» | Borra | Menú | ReservasList.tsx:266-290 |

### D.7 Comandas — `/app/pos/comandas` (`components/pos/comandas/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Comandas de Cocina» / «Monitor en tiempo real» · `BranchBadge` | Cabecera | Siempre | PageHeader.tsx:22-27; page.tsx:307 |
| 2 | toggle | (Volume2/VolumeX) «Desactivar sonido de notificación» / «Activar sonido de notificación» · «Actualizar» | Sonido / refresco | Siempre | PageHeader.tsx:32-50 |
| 3 | chip | «Todas las Zonas» / {zona} · «Todas las Estaciones» / «Cocina Caliente» / «Cocina Fría» / «Bar» · «Todos» / «Nuevos (+n)» / «En Preparación (+n)» / «Listos (+n)» / «Entregados (+n)» | Filtros con contadores | Siempre | FilterBar.tsx:27-168 |
| 4 | botón (tarjeta) | (icono) «Reimprimir comanda» · «🔥 Comenzar Preparación» / «✅ Marcar como Listo» / «📤 Marcar como Entregado» · clic en ítem cambia su estado | Avanza estado | Según `nextStatus` | TicketCard.tsx:184-339, 251 |
| 5 | paginación | `ComandasPagination` | — | Siempre | page.tsx |

### D.8 Devoluciones — `/app/pos/devoluciones` (`app/app/pos/devoluciones/page.tsx`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Devoluciones y Cambios - {org}» / «Gestiona devoluciones, reembolsos y notas de crédito» · `{fecha local}` + badge «Sistema Activo» | Cabecera | Siempre | :62-84 |
| 2 | botón | «Motivos» | → `/app/pos/devoluciones/motivos` | Siempre | :70-74 |
| 3 | pestaña | «Buscar Ticket» · «Procesar Devolución» (`disabled` sin `selectedSale`) · «Historial» | Tabs | Siempre | :92-107 |
| 4 | texto | «Buscar Ticket Original» / «Busca la venta original…» + badge «Ticket Seleccionado: {id}» · `TicketSearch` / `ReturnForm` / `ReturnsHistory` | Contenido | Según tab | :116-178 |
| 5 | estado | «No hay ticket seleccionado» + «Buscar Ticket» | Vacío | Tab procesar sin venta | :138-150 |
| 6 | texto | 4 tarjetas informativas «Buscar Ticket» · «Procesar Devolución» · «Historial» · «Catálogo de Motivos» | — | Siempre | :186-258 |

**La página no lee `?sale_id=`**: los enlaces «Crear Devolución» / «Devolución» desde Ventas no tienen destino.

Motivos `/app/pos/devoluciones/motivos` (`components/pos/devoluciones/motivos/*`): (ArrowLeft) · «Motivos de Devolución» / «Administra los motivos para devoluciones y cambios» · «Importar» (`<input type=file>`) · «Exportar» · «Nuevo Motivo» · stats «Total Motivos» / «Activos» · «Buscar por código o nombre...» · «Estado»: Todos / Activos / Inactivos · (RefreshCw) · Switch `is_active` por fila · menú ⋯ «Editar» / «Duplicar» / «Eliminar» · diálogo «¿Eliminar motivo de devolución?» · diálogo «Nuevo Motivo de Devolución» / «Editar Motivo de Devolución»: «Código *» («ej: DEFECTO, CAMBIO_TALLA») · «Nombre *» («ej: Producto defectuoso») · «Descripción» · switches «Requiere Foto» · «Afecta Inventario» · «Activo» · «Crear» / «Actualizar» — ReturnReasonsHeader.tsx:76-187; ReturnReasonsList.tsx:195-262; ReturnReasonForm.tsx:134-280. **13 controles.**

### D.9 Propinas — `/app/pos/propinas` (`components/pos/propinas/*`; también embebido en Configuración › POS)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Gestión de Propinas» / «Registra y distribuye propinas del equipo» | Cabecera | Siempre | TipsHeader.tsx:83-88 |
| 2 | botón | «Distribuir ({n})» · «Nueva Propina» | Distribuir seleccionadas / `TipForm` | «Distribuir» con selección | TipsHeader.tsx:100-114 |
| 3 | stat | «Total del Día» / «Distribuidas» / «Pendientes» / «Propinas Hoy» | 4 tarjetas | Siempre | TipsHeader.tsx:127-169 |
| 4 | filtro | «Mesero»: Todos los meseros / {server} · «Estado»: Todos / Pendientes / Distribuidas · «Tipo»: Todos / Efectivo / Tarjeta / Transferencia / Online · «Desde» / «Hasta» · (RefreshCw) | Filtros | Siempre | TipsHeader.tsx:189-246 |
| 5 | toggle | Checkbox cabecera (pendientes) + por fila | Selección | Siempre | TipsList.tsx:173-203 |
| 6 | menú ⋯ | «Editar» · «Marcar Distribuida» (`!is_distributed`) · «Eliminar» | — | — | TipsList.tsx:249-274 |
| 7 | tabla | `ServerSummary` (resumen por mesero) | Panel lateral | Siempre | PropinasContent.tsx:130 |
| 8 | diálogo | «¿Eliminar propina?» «Esta acción no se puede deshacer.» · «Nueva Propina» / «Editar Propina»: «Mesero *» («Seleccionar mesero») · «Monto *» · «Tipo de Propina» · «Notas (opcional)» · «Registrar» / «Actualizar» | CRUD | — | TipsList.tsx:284-300; TipForm.tsx:133-270 |

### D.10 Cargos de servicio — `/app/pos/cargos-servicio` (`components/pos/cargos-servicio/*`; también embebido en Configuración › POS)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Cargos de Servicio» / «Configura cargos automáticos como propina sugerida» | Cabecera | Siempre | ChargesHeader.tsx:122-127 |
| 2 | botón | «Importar» (diálogo CSV «Importar Cargos» · «Formato requerido:» · `<input type=file accept=".csv">`) · «Nuevo Cargo» | — | Siempre | ChargesHeader.tsx:132-145, 255-300 |
| 3 | stat | «Total» / «Activos» / «Inactivos» | 3 tarjetas | Siempre | ChargesHeader.tsx:158-186 |
| 4 | filtro | «Estado»: Todos / Activos / Inactivos · «Sucursal»: Todas las sucursales / {branch} · «Aplica a»: Todos / En sitio / Domicilio / Para llevar · (RefreshCw) | Filtros | Siempre | ChargesHeader.tsx:206-246 |
| 5 | toggle + badge | Switch `is_active` · badges «Gravado» / «Opcional» / «Global» / {branch} / mínimos | Por fila | — | ChargesList.tsx:163-240 |
| 6 | menú ⋯ | «Editar» / «Duplicar» / «Eliminar» + diálogo «¿Eliminar cargo de servicio?» | — | — | ChargesList.tsx:250-300 |
| 7 | diálogo | «Nuevo Cargo de Servicio» / «Editar Cargo de Servicio»: Nombre · Tipo de Cargo · valor · Monto Mínimo · Personas Mínimas · Aplica a · Sucursal · «Gravado con impuesto» · «Cargo opcional» · «Crear» / «Actualizar» | CRUD | — | ChargeForm.tsx:150-367 |

**Los cargos de servicio no se aplican en el carrito ni en el cobro del POS** (B.14, B.16): solo se administran.

### D.11 Cupones — `/app/pos/cupones` (`components/pos/cupones/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Cupones» / «Administra códigos de descuento para tus clientes» | Cabecera | Siempre | CouponsHeader.tsx:87-92 |
| 2 | botón | «Promociones» (→ `/app/pos/promociones`) · «Nuevo Cupón» (`CouponForm`, 11 campos) | — | Siempre | CouponsHeader.tsx:97-107 |
| 3 | stat | «Total Cupones» / «Activos» | — | Siempre | CouponsHeader.tsx:122-137 |
| 4 | filtro | «Buscar por código o nombre...» · «Estado»: Todos / Activos / Inactivos · «Tipo»: Todos / Porcentaje / Monto Fijo · (RefreshCw) | — | Siempre | CouponsHeader.tsx:156-187 |
| 5 | menú ⋯ | «Ver Detalles» · «Editar» (`?edit=true`) · «Duplicar» · Switch «Activar» / «Desactivar» · «Eliminar» + diálogo «¿Eliminar cupón?» «…Si el cupón tiene redenciones, no podrá ser eliminado.» | — | — | CouponsList.tsx:240-306 |

Detalle `/app/pos/cupones/[id]`: (ArrowLeft) · `{code}` (mono) + badge «Inactivo» / «Programado» / «Expirado» / «Agotado» / «Activo» + `{name | 'Sin nombre'}` · «Editar» · «Duplicar» · «Eliminar» · «Detalles del Cupón» · «Estado: Activo / Inactivo» + Switch · «Estadísticas» (usos {n}/{limit}) · «Historial de Redenciones ({n})» + «Exportar» — :159-459. **11 controles.** **El cupón no se aplica en el carrito ni en el cobro del POS** (solo «demo» en Nueva Venta).

### D.12 Promociones — `/app/pos/promociones` (`components/pos/promociones/*`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Promociones» / «Administra descuentos, ofertas y promociones especiales» | Cabecera | Siempre | PromotionsHeader.tsx:71-76 |
| 2 | botón | «Cupones» (→ `/app/pos/cupones`) · «Nueva Promoción» (→ `/app/pos/promociones/nuevo`) | — | Siempre | PromotionsHeader.tsx:81-90 |
| 3 | stat | «Total Promociones» / «Activas» | — | Siempre | PromotionsHeader.tsx:104-119 |
| 4 | filtro | «Buscar promociones...» · «Estado»: Todos / Activas / Inactivas · «Tipo»: Todos / Porcentaje / Monto Fijo / Compra X Lleva Y / Bundle / Envío Gratis · (RefreshCw) | — | Siempre | PromotionsHeader.tsx:147-178 |
| 5 | estado | «No hay promociones registradas» / «Crea tu primera promoción para comenzar» + «Nueva Promoción» | Vacío | Sin datos | PromotionsList.tsx:168-178 |
| 6 | menú ⋯ | «Ver Detalles» · «Editar» · «Duplicar» · Switch «Activar» / «Desactivar» · «Eliminar» + diálogo «¿Eliminar promoción?» | — | — | PromotionsList.tsx:259-325 |

Wizard `/app/pos/promociones/nuevo` y `[id]?edit=true` (`promociones/nuevo/PromotionWizard.tsx`, 874 líneas): stepper «Datos Básicos» / «Descuento» / «Vigencia» / «Reglas» · «Cancelar» / «Anterior» · «Siguiente» · «Crear Promoción» / «Actualizar» — :55-59, 259-305, 851-872. Detalle `[id]`: (ArrowLeft) · `{name}` + badge «Inactiva» / «Programada» / «Expirada» / «Activa» · «Editar» · «Duplicar» · «Eliminar» · «Detalles de la Promoción» · «Estado: Activa / Inactiva» + Switch · «Estadísticas» — :248-484. **Las promociones no se aplican en el carrito del POS.**

### D.13 Cuentas por cobrar — `/app/pos/cuentas-por-cobrar` (reutiliza `components/finanzas/cuentas-por-cobrar/CuentasPorCobrarPage.tsx`; la cabecera dice «Finanzas» y el back va a `/app/finanzas`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (ArrowLeft → `/app/finanzas`) · «Cuentas por Cobrar» / «Finanzas / Cuentas por Cobrar» · «Actualizar» | Cabecera | Siempre | CuentasPorCobrarPage.tsx:133-151 |
| 2 | stat | «Total por Cobrar» / «Vigentes» («Al día») / «Vencidas» («Requieren seguimiento») / «Promedio Días Cobro» («Tiempo promedio») | `EstadisticasCards` | Siempre | EstadisticasCards.tsx |
| 3 | pestaña | «Cuentas» («Ctas») / «Aging» / «Recordatorios» («Recor») / «Estadísticas» («Stats») | Tabs (abreviadas en móvil) | Siempre | :173-188 |
| 4 | filtro | «Filtros y Búsqueda»: «Buscar» («Cliente, email, teléfono...») · «Estado»: Todos los estados / Al día / Vencidas / Parcialmente pagadas / Pagadas · «Aging»: Todos los períodos / 0-30 días / 31-60 días / 61-90 días / Más de 90 días · «Cliente» («Nombre del cliente») · «Acciones» (filtros avanzados: «Fecha Vencimiento Desde» / «Hasta») · «Limpiar Filtros» / «Exportar CSV» | — | Tab Cuentas | CuentasPorCobrarFiltros.tsx:73-225 |
| 5 | botón / menú ⋯ | Móvil: «Abono» / «Recordar» / (Eye) · escritorio ⋯: «Aplicar Abono» (`balance>0`) · «Enviar Recordatorio» (`overdue`) · «Ver Detalles» (→ `/app/finanzas/cuentas-por-cobrar/{id}`) · paginación propia | — | — | CuentasPorCobrarTable.tsx:273-298, 393-480 |
| 6 | diálogo | «Aplicar Abono»: resumen (Cliente, Balance Pendiente, Monto Total, Fecha Vencimiento) · «Monto del Abono *» · «Método de Pago *» · «Fecha de Pago» · «Referencia / Transacción *» · «Notas» · «Aplicar Abono» / «Aplicando...» | Registra pago | Menú | AplicarAbonoModal.tsx:215-360 |
| 7 | diálogo | «Enviar Recordatorio de Pago»: resumen (Cliente, Email, Balance Pendiente, Días Vencidos, Último Recordatorio) · «Usar mensaje predeterminado» · «Mensaje del Recordatorio» («Escriba aquí el mensaje del recordatorio...») · aviso «Email no disponible» · «Enviar Recordatorio» / «Enviando...» | Envía | Menú | EnviarRecordatorioModal.tsx:87-215 |
| 8 | tabla | `AgingReport` / `RecordatoriosPanel` / `EstadisticasDetalle` + «Análisis de Tendencias» (Eficiencia de cobro, Cartera vencida, Promedio de días para cobro) | — | Según tab | :210-278 |

### D.14 Pagos pendientes `/app/pos/pagos-pendientes` y Carritos `/app/pos/carritos`

Ambas páginas devuelven `null` (`page.tsx:1-3`): **pantalla en blanco**, sin cabecera ni controles, sin entrada en el menú. **0 controles.**

### D.15 Reportes — `/app/pos/reportes` (`components/pos/reportes/ReportesPage.tsx`; **sin entrada en el menú**)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (ArrowLeft) · «Reportes POS» / «POS / Reportes · Ventas POS» ó «Ventas Web» · (RefreshCw) · «Exportar Ventas» | Cabecera | Siempre | :163-187 |
| 2 | toggle | «Origen de ventas»: «Ventas POS» / «Ventas Web» | `source` | Siempre | :195-215 |
| 3 | filtro | «Fecha Inicio» / «Fecha Fin» · «Sucursal»: Todas las sucursales / {branch} · «Aplicar Filtros» | — | Siempre | :220-257 |
| 4 | stat | «Ventas Totales» / «Transacciones» / «Ticket Promedio» / «Items Vendidos» · «Total Impuestos» / «Total Descuentos» | 6 tarjetas | Siempre | :275-323, 512-528 |
| 5 | texto | «Productos Más Vendidos» + (Download) · «Métodos de Pago» · «Resumen de Caja»: Ventas / + Ingresos / - Egresos / = Balance Total | Tablas | Siempre | :335-431 |

Dashboard POS del Inicio (`components/pos/dashboard/*`, montado en `inicio/sections/PosSection.tsx:162`): «Ventas hoy» / «Ventas del mes» / «Transacciones hoy» / «Ticket promedio» (`PosKPIs`) · «Top productos» · «Ventas por sucursal» · «Sesiones de caja activas»; sin botones. **4 controles.**

### D.16 Lo roto o sin efecto en los submenús del POS

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | «Crear Devolución» / «Devolución» navegan a `/app/pos/devoluciones/nuevo?sale_id=` que **no existe**; `devoluciones/page.tsx` no lee `sale_id` | VentasPage.tsx:111-113; VentaDetalle.tsx:188-190 |
| 2 | Nueva Venta: «Guardar» y «Aplicar» cupón son `// TODO` con `alert()` | NuevaVentaPage.tsx:143-151, 172-177 |
| 3 | Mesas: diálogo «¿Eliminar mesa?» inalcanzable | mesas/page.tsx:76, 926-948 |
| 4 | Pedidos Online detalle: «Imprimir» nunca se renderiza (falta `onPrint`) | pedidos-online/[id]/page.tsx:73-85; OrderActions.tsx:196-200 |
| 5 | «Anular Venta» con `window.confirm` + `window.prompt` + `alert` nativos | VentasPage.tsx:70-84; VentaDetalle.tsx:176 |
| 6 | `/app/pos/pagos-pendientes` y `/app/pos/carritos` en blanco; `/app/pos/reportes` sin entrada en el menú | page.tsx:1-3; SidebarNavigation.tsx:251-263 |
| 7 | Cuentas por cobrar del POS reutiliza la de Finanzas: back, breadcrumb y «Ver Detalles» llevan a Finanzas | CuentasPorCobrarPage.tsx:133-142; CuentasPorCobrarTable.tsx:138 |
| 8 | Permiso «Cerrar Caja» y cierre ciego resueltos en cliente por nombre de rol | cajas/page.tsx:72-75; useBlindCloseMode.ts:40-44 |
| 9 | Cupones, promociones y cargos de servicio se administran pero **no se aplican** en el carrito ni en el cobro del POS principal | B.14, B.16 |

### D.17 Configuración › POS — `components/pos/configuracion/ConfiguracionPage.tsx` (montado `embedded` en `/app/configuracion?modulo=pos`)

**No hay pestañas internas**: una sola página vertical de tarjetas en este orden: (1) 5 stats, (2) Configuración Avanzada (6 accesos que abren diálogos), (3) Requerir Caja Abierta, (4) Caja por Cajero, (5) Cierre Ciego, (6) Horas de Operación, (7) Visualización de Categorías, (8) Métodos de Pago, (9) Impuestos (solo lectura), (10) Cargos de Servicio, (11) Impresoras, (12) Print Agent (Estado), (13) Trabajos de Impresión Recientes. Diálogos (`ConfigModals.tsx:45-104`, `lg:max-w-5xl`, `max-h 90dvh`): Consecutivos de Ventas, Propinas, Cargos de Servicio, Previsualizar Impresiones, Agente de Impresión, Pantalla del cliente. **Ninguna tarjeta comprueba permiso admin en cliente**. Ajustes en `organization_settings` (`configuracionService.ts`): `pos_categories_display` (:101), `pos_require_cash_session` (:107), `pos_blind_cash_count` (:117), `pos_cash_session_mode` (:135), `pos_customer_display` (:491-513), `operating_hours` (directo desde `ConfiguracionPage.tsx:286-295`). Solo la pantalla del cliente usa `messages/es.json` (`posCustomerDisplay.*`); el resto son literales.

#### D.17.1 Stats y Configuración Avanzada

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton (`PageHeaderSkeleton` + 4 tarjetas) | Carga | `loading` | ConfiguracionPage.tsx:336-343 |
| 2 | texto | Cabecera «Configuración POS» · «POS / Configuración» + (ArrowLeft) + (RefreshCw) | **Nunca** se ve (`!embedded`) | — | :351-371 |
| 3 | stat | «Métodos de Pago» (icono CreditCard) · «Impuestos» (Percent) · «Cargos Servicio» (DollarSign) · «Sec. Facturación» (Receipt; **sin sección que las gestione**) · «Sec. Ventas» (Hash) | Contadores | Siempre | :385-442 |
| 4 | texto | «Configuración Avanzada» · «Accede a configuraciones específicas del sistema» | Título | Siempre | :453-456 |
| 5 | botón | «Consecutivos de Ventas» · «Prefijos, padding, reset» (icono Hash, ChevronRight) | Abre D.17.9 | Siempre | :461-474 |
| 6 | botón | «Propinas» · «Configurar propinas» (DollarSign) | Abre `PropinasContent embedded` (el módulo completo de `/app/pos/propinas`) | Siempre | :476-489; ConfigModals.tsx:66-72 |
| 7 | botón | «Cargos de Servicio» · «Configurar cargos» (Calculator) | Abre `CargosServicioContent embedded` (módulo de `/app/pos/cargos-servicio`) | Siempre | :491-504; ConfigModals.tsx:74-80 |
| 8 | botón | «Previsualizar Impresiones» · «Ver tickets antes de imprimir» (Printer) | Abre D.17.10 | Siempre | :506-519 |
| 9 | botón | «Agente de Impresión» · «Estado y configuración del agente» (Monitor) | Abre D.17.11 (en navegador solo un aviso) | Siempre | :521-534 |
| 10 | botón | «Pantalla del cliente» (`posCustomerDisplay.config.title`) · «Segunda pantalla mirando al comprador» (`.subtitle`) (MonitorSmartphone) | Abre D.17.12 | Siempre | :537-550 |

#### D.17.2 Requerir Caja Abierta · Caja por Cajero · Cierre Ciego

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Requerir Caja Abierta» (Wallet) · «Obliga a tener una caja abierta para poder realizar ventas en POS y Mesas» · «Bloquear ventas sin caja abierta» · «Las ventas están bloqueadas hasta abrir caja» / «Las ventas están permitidas sin caja abierta» | Título + estado | Siempre | ConfiguracionPage.tsx:560-575 |
| 2 | toggle | Switch | `pos_require_cash_session`; toast «Actualizado» / «Se requiere caja abierta para vender» o «Venta sin caja abierta permitida» | Siempre | :578-582, 230-247 |
| 3 | texto | «Caja por Cajero» (Users) · «Define si la caja es única por sucursal (compartida por todos los cajeros) o si cada miembro de la organización abre y gestiona su propia caja dentro de la sucursal.» · «Una caja por cajero» · «Cada miembro abre su propia caja, registra sus ventas y hace su cierre de forma independiente» / «Una sola caja compartida por sucursal (todos los cajeros registran en la misma caja)» | Título + estado | Siempre | :592-607 |
| 4 | toggle | Switch | `pos_cash_session_mode` `'user'` ↔ `'branch'`; toast «Caja por cajero activada: …» / «Caja por sucursal activada: …» | Siempre | :610-614, 249-274 |
| 5 | texto | «**Modo cajero activo:** en cada sucursal, cada miembro puede tener una caja abierta simultáneamente…» (caja teal) | Aviso | `mode === 'user'` | :616-622 |
| 6 | texto | «Cierre Ciego» (Calculator) · «Oculta los montos esperados y diferencias al cajero durante el cierre. Solo los administradores pueden ver esta informacion» (sic) · «Activar cierre ciego» · «El cajero no ve los montos esperados ni las diferencias» / «El cajero puede ver los montos esperados y diferencias» | Título + estado | Siempre | :631-646 |
| 7 | toggle | Switch | `pos_blind_cash_count`; toast «Arqueo ciego activado/desactivado» | Siempre | :649-653, 211-228 |

#### D.17.3 Horas de Operación

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Horas de Operación» (Clock) · «Define el horario del “día operativo” para reportes y dashboard. Para empresas que trabajan de noche (ej: 8pm a 3am)…» · «Activar horas de operación personalizadas» · «Día operativo: HH:MM a HH:MM (cruza medianoche)» / «Día calendario completo (00:00 - 23:59)» | Título + estado | Siempre | ConfiguracionPage.tsx:663-679 |
| 2 | toggle | Switch | **Solo estado local** | Siempre | :682-686 |
| 3 | campo | «Hora de inicio» (`type=time`) · «Inicio del día operativo» | `ohStart` | Toggle activo | :693-706 |
| 4 | campo | «Hora de cierre» (`type=time`) · «Fin del día operativo. Si es menor al inicio, cruza medianoche.» | `ohEnd` | Toggle activo | :709-722 |
| 5 | botón | «Guardar horas de operación» / «Guardando...» | Upsert `operating_hours` directo desde el navegador; toast «Horas de operación guardadas» | Toggle activo | :725-731, 277-319 |
| 6 | botón | «Guardar» (outline) | Guarda `enabled:false` | Toggle inactivo **y nunca guardado** (`operatingHours === null`): **no se puede desactivar una vez guardado** | :736-747 |

#### D.17.4 Visualización de Categorías · Métodos de Pago · Impuestos · Cargos de Servicio

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Visualización de Categorías» (LayoutGrid) · «Define cómo se muestran las categorías al buscar productos en el POS y en Mesas» · «Modo de visualización» | Título | Siempre | ConfiguracionPage.tsx:756-764 |
| 2 | chip ×3 | «Buscador» · «Lista desplegable con búsqueda» (Search) / «Botones» · «Chips con icono y color» (LayoutGrid) / «Imágenes» · «Tarjetas con imagen de fondo» (Image) | `mode` `searchselect`/`buttons`/`images`, guarda al instante | Siempre | :766-787 |
| 3 | menú | «Orden de las categorías» — SearchSelect «Selecciona el orden»: «Favoritas primero, luego las más vendidas» · «Orden de visualización (display_order)» · «Rango (rank)» · «Nombre (A-Z)» | `orderBy`; toast «Visualización de categorías actualizada» | Siempre | :792-805, 191-209 |
| 4 | texto | «El orden y colores/iconos se configuran por categoría en Inventario → Categorías» | Ayuda | Siempre | :806-808 |
| 5 | texto | «Métodos de Pago» (CreditCard) · «Métodos de pago habilitados para la organización» | Título | Siempre | :818-821 |
| 6 | estado | «No hay métodos de pago configurados» | Vacío | Sin métodos | :826-828 |
| 7 | texto | Tarjeta por método: Efectivo / Tarjeta / Tarjeta Crédito / Tarjeta Débito / Transferencia / Nequi / Daviplata / PSE / Crédito (mapa fijo de 9; otro código sale crudo) · «Requiere referencia» / «Sin referencia» | Grid 3 col | Por método | :837-842, 321-334 |
| 8 | toggle | Switch por método | `togglePaymentMethod`; toast «Método de pago actualizado» | Por método (**sin botón «Añadir»**, aunque existe `addPaymentMethod`) | :844-847, 163-175 |
| 9 | texto | «Impuestos» (Percent) · «Impuestos configurados para la organización» | Título (**solo lectura**; se gestionan en Finanzas › Impuestos, E.2) | Siempre | :860-863 |
| 10 | estado | «No hay impuestos configurados» | Vacío | Sin impuestos | :868-870 |
| 11 | tabla | «Nombre» · «Tasa» · «Descripción» · «Por Defecto» · «Estado» + badges «Defecto» (azul) / «Activo» (verde) / «Inactivo» (gris) | `organization_taxes` | Con impuestos | :873-911 |
| 12 | texto | «Cargos de Servicio» (DollarSign) · «Cargos adicionales aplicados a las ventas» | Título | Siempre | :922-925 |
| 13 | estado | «No hay cargos de servicio configurados» | Vacío | Sin cargos | :930-932 |
| 14 | texto | `{name}` · «12 %» o «$ 3.000» · « • Opcional» · « • Gravable» | Grid 2 col | Por cargo | :941-949 |
| 15 | toggle | Switch por cargo | `toggleServiceCharge`; toast «Cargo de servicio actualizado» | Por cargo | :951-954, 177-189 |

#### D.17.5 Impresoras — `printers/PrintersSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Impresoras» (Printer) · «Configura impresoras USB, red, Bluetooth o del sistema, y asígnalas a estaciones de cocina/caja» | Título | Siempre | PrintersSection.tsx:104-107 |
| 2 | botón | (icono Plus) «Nueva Impresora» | Abre D.17.6 | Siempre | :110-119 |
| 3 | estado | Skeleton 3 líneas · «No hay impresoras configuradas» | Carga / vacío | — | :122-131 |
| 4 | texto | `{name}` · «USB» / «Red (IP/Puerto)» / «Bluetooth» / «Impresora del sistema (HTML)» / «Sistema (ESC/POS directo)» • `{sucursal}` o «Todas las sucursales» | Tarjeta | Por impresora | :141-145; printersService.ts:64-70 |
| 5 | toggle | Switch | `togglePrinter` (sin toast de éxito) | Por impresora | :147, 76-83 |
| 6 | badge | «Cocina Caliente» / «Cocina Fría» / «Bar» / «Caja» / «Todas las estaciones» | Estaciones | Si tiene | :150-158 |
| 7 | botón | (Pencil) «Editar» · (Trash2) «Eliminar» | Abre D.17.6 / AlertDialog | Por impresora | :161-180 |
| 8 | diálogo | «¿Eliminar impresora?» · «Se eliminará "{name}" y sus asignaciones de estación. Esta acción no se puede deshacer.» · «Cancelar» / «Eliminar» | `deletePrinter`; toast «Impresora eliminada correctamente» | Al pulsar Eliminar | :196-211, 85-96 |

#### D.17.6 Diálogo «Nueva Impresora» / «Editar Impresora» — `printers/PrinterFormDialog.tsx` (`md:max-w-2xl`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | «Nombre» («Ej: Impresora Cocina Caliente») | `name` | Siempre | PrinterFormDialog.tsx:349-354 |
| 2 | menú | «Sucursal» (SearchSelect, «Todas las sucursales») | `branch_id` | Siempre | :358-365 |
| 3 | menú | «Tipo de conexión»: USB · Red (IP/Puerto) · Bluetooth · Impresora del sistema (HTML) · Sistema (ESC/POS directo) | `connection_type` | Siempre | :369-375 |
| 4 | botón | (Wifi) «Detectar impresoras automáticamente» / «Detectando impresoras...» | Desktop: IPC; navegador: HTTP localhost del print-agent; móvil: BLE | Siempre | :380-399, 134-199 |
| 5 | estado | «No se pudieron detectar impresoras. Verifica que el agente esté iniciado en Go Admin Desktop.» / «No se pudo conectar al Print Agent. Instala Go Admin Desktop o asegúrate de que el agente esté corriendo en esta PC.» / «No se seleccionó ninguna impresora Bluetooth» | Error | Según plataforma | :401-403, 81-83, 161-164 |
| 6 | texto + botón | «Impresoras del sistema (N)» → filas `{name}` + «Predeterminada» · «Impresoras de red (N)» → `{ip}:{port}` · «Bluetooth emparejadas (N)» → `{name}` `{mac}` · «Dispositivos USB (N)» → `{name}` o `{vendorId}:{productId}`; vacíos «No se encontraron impresoras instaladas» / «…en la red» / «…Bluetooth emparejadas. Empareja la impresora desde Configuracion de Windows y vuelve a detectar.» / «…dispositivos USB. Una impresora ya instalada en Windows no aparece aqui… Usala como **Impresora del sistema**.» · «Haz clic en una impresora para autocompletar el formulario» | Panel de detección; clic autocompleta | Tras detectar | :409-534 |
| 7 | campo | «Dirección IP» («192.168.1.100») · «Puerto» («9100») | `ip_address`, `port` | Tipo `network` | :542-557 |
| 8 | texto | Aviso azul (Bluetooth) «En Windows la impresora Bluetooth emparejada queda instalada como impresora del sistema…» · «Impresora de Windows: **{name}**» / ámbar «Falta la impresora de Windows: pulsa "Detectar impresoras" y elige la que corresponda.» | Info | Tipo `bluetooth` | :564-580 |
| 9 | campo | «Dirección MAC (opcional)» («00:11:22:33:44:55») | `mac_address` | Tipo `bluetooth` | :582-588 |
| 10 | texto | Aviso azul (Printer) «Selecciona la impresora instalada en Windows. Se imprimirá como HTML (más lento, sin corte automático ni cajón).» / «Selecciona la impresora térmica instalada en Windows. Se enviarán comandos ESC/POS crudos…» · «Impresora de Windows: **{name}**» | Info | Tipos `system`/`raw_spooler`/`usb` | :592-609 |
| 11 | menú | «Ancho de papel»: 80mm · 58mm | `paper_width` | Siempre | :612-621 |
| 12 | campo | «Estaciones asignadas» — 5 checkboxes: Cocina Caliente · Cocina Fría · Bar · Caja · Todas las estaciones | `stations[]` | Siempre | :625-637 |
| 13 | campo | «Notas» (RichTextEditor, «Marca, modelo, ubicación, etc.») | `notes` | Siempre | :640-646 |
| 14 | texto | Validación ámbar: «Escribe un nombre para identificar la impresora.» / «Una impresora de red necesita su direccion IP.» / «Una impresora USB necesita el nombre exacto de Windows…» / «Una impresora Bluetooth necesita el nombre… o su direccion MAC…» / «Una impresora del sistema necesita…» / «Una impresora ESC/POS directo necesita…» | Bloquea Guardar | Falta un dato | :650-652, 308-326 |
| 15 | botón | «Cancelar» · «Guardar» | create/update; toast «Impresora creada/actualizada correctamente» | `disabled` si `saving` o error | :655-661 |

#### D.17.7 Print Agent (Estado) — `printers/PrintAgentStatusCard.tsx` + `DownloadDesktopDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Print Agent (Estado)» (Radio) · «Agentes locales que envían las comandas a las impresoras físicas de esta sucursal» | Título | Siempre | PrintAgentStatusCard.tsx:56-59 |
| 2 | badge | «Go Admin Desktop v{versión}» (azul) | — | Solo Electron | :63-66 |
| 3 | botón | (Download) «Descargar Go Admin Desktop» | Abre diálogo | Solo navegador | :68-71 |
| 4 | botón | (RefreshCw) | `loadAgents` (auto cada 30 s; usa `branchFilter`) | Siempre | :73-75, 31-48 |
| 5 | estado | «No se ha registrado ningún agente de impresión para esta sucursal aún. Usa el botón "Descargar Go Admin Desktop" para instalarlo en el computador del local.» | Vacío | Sin agentes | :79-84 |
| 6 | texto | (Server) `{agent_name}` · (MapPin) `{branch_name}` · «Últ. actividad: HH:MM:SS» (sin tz) + badge «En línea» (verde) / «Sin conexión» (gris) | Por agente | — | :87-116 |
| 7 | diálogo | (Monitor) «Go Admin Desktop» · «Aplicación para Windows que conecta tus impresoras físicas con GO Admin. Se instala una sola vez en el computador del local.» · pasos «1. Descarga e instala» · «2. Inicia sesión» · «3. Configura tus impresoras» · caja verde «Una vez instalado, aparecerá como "En línea" en esta página y las comandas se imprimirán automáticamente en cocina, bar y caja.» · «Cerrar» · (Download) «Descargar para Windows» (GitHub Releases latest) | — | Al pulsar #3 | DownloadDesktopDialog.tsx:30-107 |

#### D.17.8 Trabajos de Impresión Recientes — `printers/RecentPrintJobsTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Trabajos de Impresión Recientes» (ListChecks) · «Historial completo de trabajos enviados al Print Agent de esta sucursal» + (RefreshCw) | Realtime en `print_jobs` | Siempre | RecentPrintJobsTable.tsx:101-109, 78-93 |
| 2 | estado | «Aún no se ha encolado ningún trabajo de impresión» | Vacío | Sin trabajos | :112-115 |
| 3 | tabla | «Fecha» · «Tipo» (Comanda / Pre-cuenta / Venta) · «Impresora» · «Estación» · «Estado» + badge «Pendiente» / «Enviado» / «Impreso» / «Error» (`title` = error) + `{error_message}` | — | Con trabajos | :119-151, 16-34 |
| 4 | paginación | «Mostrar» Select 10/20/50/100 «por página» · «Mostrando {a} a {b} de {n} trabajos» · (ChevronsLeft)(ChevronLeft) «{actual} / {total}» (ChevronRight)(ChevronsRight) | Paginación propia | `totalItems > 0` | :158-222 |

#### D.17.9 Diálogo «Consecutivos de Ventas» — `consecutivos-ventas/ConsecutivosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Consecutivos de Ventas» (h2) + (RefreshCw) | — | Siempre | ConsecutivosPage.tsx:360-364 |
| 2 | botón | (Upload) «Importar» · (Download) «Exportar» · (Plus) «Nuevo» | Diálogo importar / CSV («Exportado» / «Sin datos») / modal crear | Siempre | :365-376, 280-289 |
| 3 | stat | «Total Consecutivos» · «Activos» · «Tipos» | — | Siempre | :390-420 |
| 4 | campo | (Search) «Buscar consecutivos...» | Filtro local | Siempre | :437-442 |
| 5 | estado | (Hash) «No hay consecutivos configurados» + (Plus) «Crear Primer Consecutivo» | Vacío | Sin resultados | :448-455 |
| 6 | tabla | «Sucursal» · «Tipo» (Ventas / Pedidos / Cotizaciones / Tickets / Devoluciones) · «Prefijo» · «Padding» · «Número Actual» · «Preview» · «Reset» (Sin reset / Diario / Mensual / Anual) · «Estado» («Activo»/«Inactivo») · «Acciones» | — | Con resultados | :459-546 |
| 7 | menú | (MoreVertical) → «Editar» · «Duplicar» · «Resetear» · — · «Eliminar» (rojo) | — | Por fila | :507-544 |
| 8 | diálogo | «Nuevo Consecutivo» / «Editar Consecutivo» · «Configure los parámetros del consecutivo de ventas»: «Sucursal *» (Select) · «Tipo de Secuencia *» (5) · «Prefijo» («Ej: VTA-, PED-, COT-») · «Número Actual» · «Padding (dígitos)» · «Período de Reset» (4) · Switch «Activo» «El consecutivo está en uso» · «Preview del próximo consecutivo:» `VTA-000001` · «Cancelar» / «Crear» / «Actualizar» | Toast «Consecutivo creado/actualizado» | — | :553-687 |
| 9 | diálogo | «¿Eliminar consecutivo?» · «Esta acción no se puede deshacer. El consecutivo será eliminado permanentemente.» · «Cancelar» / «Eliminar» | Toast «Consecutivo eliminado» | Menú | :692-712 |
| 10 | diálogo | «¿Resetear consecutivo?» · «El número actual se pondrá en 0. El siguiente documento empezará desde el número 1.» · «Cancelar» / «Resetear» (naranja) | Toast «Consecutivo reseteado a 0» | Menú | :715-735 |
| 11 | diálogo | «Importar Consecutivos» · «Pegue los datos en formato CSV (con encabezados)» · textarea `branch_id,sequence_type,prefix,current_number,padding,reset_period,is_active` · «Cancelar» / «Importar» | `handleImport`; «Error: Ingrese datos CSV» | Importar | :738-761 |

#### D.17.10 Diálogo «Previsualizar Impresiones» — `impresiones/ImpresionesPage.tsx` + `PreviewViewer.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (Printer) «Imprimir prueba» (HTML) / «Imprimir simulacion» (ESC/POS) | `window.open` + `print()` (silencio si popup bloqueado) | Siempre | ImpresionesPage.tsx:133-140, 65-103 |
| 2 | texto | «Que quieres revisar» · «Se usan las mismas plantillas que imprimen las impresoras. La cabecera (logo, razon social, NIT…) es la de tu negocio; el cliente, los productos y el domicilio son de ejemplo…» (sin tildes) | Título | Siempre | :145-150 |
| 3 | chip ×5 | Documento: «Ticket de venta» «Recibo de caja con pagos» (Receipt) · «Pre-cuenta» «Cuenta de mesa sin pago» (FileText) · «Comanda» «Orden para cocina o bar» (ChefHat) · «Guia de envio» «Guia con corte automatico» (Package) · «Factura electronica» «Factura DIAN con CUFE y QR» (FileCheck) | `kind` (default `pre_cuenta`) | Siempre | :154-165, 19-25 |
| 4 | chip ×2 | Camino: «HTML» «Navegador e impresoras del sistema» (Monitor) · «ESC/POS» «Termicas por red, USB o Bluetooth» (Usb) | `path` | Siempre | :167-178 |
| 5 | chip ×2 | Ancho: «80mm» · «58mm» | `width` | Siempre | :181-197 |
| 6 | badge | «Rollo {n} mm» · «Imprimible {n} mm» · «Margen {n} mm» · «{n} columnas» + ayuda «El ancho imprimible es menor que el del rollo porque los bordes quedan fuera del alcance del cabezal…» | Métricas | Siempre | :200-210 |
| 7 | texto | «Vista previa» · «Renderizado al ancho exacto que tendra en la impresora.» / «Texto tal como lo recibe la impresora termica, con la regla de columnas.» | Título | Siempre | :218-223 |
| 8 | texto | Avisos: ámbar «No se pudieron cargar los datos de tu negocio, asi que la cabecera es de ejemplo…» (si `!isReal`) · ámbar «El boton imprime una **simulacion**…» (escpos) · azul «El logo no aparece en esta vista…» (escpos con logo) | — | Según caso | :227-249 |
| 9 | estado | Verde (CheckCircle2) «Ninguna linea supera las {n} columnas del papel.» / rojo (AlertTriangle) «{k} linea(s) supera(n) las {n} columnas y se cortara(n) al imprimir.» + lista | Desborde | Siempre | PreviewViewer.tsx:74-101 |
| 10 | texto | iframe «Previsualizacion del ticket» (HTML) / regla `----+----1----+----2…` + monoespaciado (ESC/POS) | Vista | Según `path` | PreviewViewer.tsx:30-72 |

#### D.17.11 Diálogo «Agente de Impresión» — `agente-impresion/DesktopAgentPanel.tsx` (3 ramas: móvil, navegador, Electron)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (Monitor) «Este panel solo está disponible cuando usas Go Admin Desktop (app de escritorio).» | Único contenido | Navegador | DesktopAgentPanel.tsx:359-367 |
| 2 | texto | «Impresora Bluetooth» (Bluetooth) · «Configura una impresora térmica Bluetooth ESC/POS para imprimir tickets desde tu dispositivo móvil.» + `{deviceName}` `{deviceId}` + badge «Conectado» | Tarjeta | Móvil (Capacitor) | :308-320, 110-119 |
| 3 | botón | (Bluetooth) «Descubrir impresora Bluetooth» / «Buscando...» · (Printer) «Imprimir prueba» · «Abrir cajón» + `{message}` | BLE discover / `printTestPage` / `openCashDrawerBluetooth` | Móvil; los 2 últimos si `deviceId` | :121-140, 45-70 |
| 4 | texto | «Impresora de Red» (Network) · «Las impresoras de red se configuran ingresando la IP manualmente desde el formulario de impresoras.» | Info | Móvil | :322-333 |
| 5 | texto | «Estado del agente» (Wifi/WifiOff) · «Go Admin Desktop v{version}» + badge «Conectado» / «Desconectado» · «Organización:» `{name}` · «Sucursales:» badges · stats «Trabajos impresos» (verde) / «Errores» (rojo) · «Última actividad: {fecha}» · caja roja `{error}` | Tarjeta | Electron | :371-442 |
| 6 | botón | (Power) «Iniciar agente» / «Iniciando...» · (Power) «Detener agente» · (RefreshCw) | `startAgentForCurrentOrg` (deshabilitado sin sucursales, **sin texto que lo explique**) / `stopAgent` / `refreshStatus` | Electron | :445-458, 278-283 |
| 7 | texto | «Sucursales a escuchar» (MapPin) · «Selecciona qué sucursales atenderá el agente de impresión.» · skeleton / «No hay sucursales disponibles para esta organización.» | Tarjeta | Electron | :466-483 |
| 8 | campo | Checkbox «Seleccionar todas ({n})» + checkbox por `{branch.name}` | `selectedBranchIds` | Electron | :486-505 |
| 9 | texto + toggle | «Arranque automático» (Cpu) · «Iniciar con Windows» · «El agente se activará en segundo plano al encender el equipo.» + Switch | `bridge.setAutoStart` (si falla, solo `console.error`) | Electron | :516-529, 251-263 |
| 10 | texto + botón | «Impresoras del sistema» (Printer) + «Detectar» · «Impresoras USB» (Usb) + «Detectar» · «Dispositivos Bluetooth» (Bluetooth) + «Detectar» · «Impresoras de red» (Network) + «Escanear»; vacíos «No se detectaron impresoras. Haz clic en "Detectar" para reintentar.» / «No se detectaron dispositivos USB…» / «No se detectaron dispositivos Bluetooth. Asegúrate de que estén emparejados con el SO.» / «No se detectaron impresoras de red. Haz clic en "Escanear" para buscar.»; listas con badges «Predeterminada» / «WMI» / «Impresora» / `{mac}` / `{ip}:{port}` | Detección | Electron | :538-724 |

#### D.17.12 Diálogo «Pantalla del cliente» — `pantalla-cliente/*` (claves `posCustomerDisplay.*` de `messages/es.json`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `config.description` «Una segunda pantalla mirando al comprador muestra el resumen del pedido, el estado del cobro y la marca del comercio. La caja sigue siendo la única fuente de verdad: la pantalla solo refleja.» | Intro | Siempre | PantallaClienteContent.tsx:298 |
| 2 | toggle | Switch «Pantalla del cliente» (`config.masterSwitch`) · «Activada: las cajas emiten el pedido a la pantalla del cliente» (`masterOn`) / «Desactivada: las cajas no emiten nada» (`masterOff`) | `enabled`; toasts `saved` «Pantalla del cliente actualizada» + `savedOn` / `savedOff` | Siempre; `disabled` si `loadFailed` | :303-315, 222-249 |
| 3 | estado | `config.loadError` «No se pudo cargar la configuración de la pantalla del cliente» | Error | `loadFailed` | :317-321 |
| 4 | menú | (Monitor) «Monitor de la pantalla» (`config.monitor`) · `monitorHint` — Select: «Automático (el segundo monitor, si lo hay)» (`monitorAuto`) · `{nombre} (principal)` · «Monitor #{id} (desconectado)» | Elección local por el puente; toast `monitorSaveError` | **Solo Electron ≥0.2.1** | :325-361 |
| 5 | estado | Punto + «Pantalla del cliente cerrada» (`windowClosed`) / «…abierta en {monitor}» (`windowOpenOn`) / «…abierta en una ventana (un solo monitor)» (`windowOpenWindowed`) / «…abierta en un monitor no listado (#{id})» · «No se pudieron listar los monitores de este equipo» (`displaysUnavailable`) | Estado de la ventana | Electron | :364-375 |
| 6 | botón | (ExternalLink) «Abrir ahora» (`openNow`) · `openNowHint` «Abre la pantalla en una ventana aparte. En el escritorio se coloca sola en el segundo monitor; en el navegador arrástrela a la otra pantalla y pulse F11.» · aviso `disabledNotice` «La pantalla se puede abrir para probarla, pero no mostrará el pedido hasta activar el interruptor.» | `openCustomerDisplay()`; toasts `toast.dragHint`, `toast.popupBlocked`, `monitorChangeRequiresReopen`, `monitorChangeReopened` | Siempre; aviso si `!enabled` | :380-394, 251-270 |
| 7 | texto | (Store) «Esta caja» (`terminals.title`) · `terminals.hint` «Registre las cajas de la sucursal y vincule este equipo a una de ellas. El código corto sale en el pie de la pantalla del cliente.» + estado: `noLocalId` «Este equipo aún no se ha identificado como caja: abra el punto de venta una vez.» / `linkedTo` «Este equipo está vinculado a {name} ({code})» / `linkedToInactive` / `linkedToOtherBranch` / `unregistered` «Este equipo funciona como caja sin registrar: vincúlelo a una terminal para identificarlo.» | Cabecera | Siempre | EstaCajaSection.tsx:264-278, 246-259 |
| 8 | estado | `selectBranch` «Seleccione una sucursal para administrar sus terminales.» · `loading` «Cargando terminales…» · `loadError` «No se pudieron cargar las terminales de la sucursal» · `empty` «Esta sucursal aún no tiene terminales registradas.» | — | Según caso | :280-295 |
| 9 | menú | Select «Elegir terminal» (`choose`): `{name} · {code}` + « (inactiva)» | Selección | Con terminales | :298-316 |
| 10 | botón | (Link2) «Vincular este equipo» (`linkThis`) / «Vinculada» (`alreadyLinked`) · (Pencil) «Renombrar» (`rename`) · «Activar» / «Desactivar» | localStorage; toasts `linked`, `linkedHint`, `linkError`; `is_active` con errores `forbidden` «Solo un administrador o manager puede modificar terminales» / `orgChanged` / `updateError` | Con terminales | :318-335, 190-204 |
| 11 | campo | Renombrar: «Nombre» (max 80) · «Código corto» (max 20) + `codeHint` «Hasta 20 caracteres: letras, números, guion y guion bajo. Único por sucursal.» · (Pencil) «Guardar cambios» · «Cancelar»; toasts `renamed`, `duplicateCode` «Ya existe una terminal con ese código en esta sucursal» | Renombrar | Al pulsar Renombrar | :339-366 |
| 12 | campo | Crear: «Nombre» («Caja 1») · «Código corto» («CAJA-1») · (Plus) «Crear y vincular» (`createAndLink`) · «Cancelar»; validaciones `invalidNameRequired`, `invalidNameTooLong`, `invalidCodeInvalid`, `createError` | Crear | Al pulsar (Plus) «Nueva terminal» (`newTerminal`) | :375-425 |
| 13 | toggle | Switch «Propina en pantalla» (`presentation.tips`) · `tipsHint` «Antes del cobro la pantalla pregunta si desea dejar propina. En pantallas táctiles el cliente elige; en las demás se muestran los importes y el cajero la registra.» | `tips.enabled` | Siempre | AjustesPantallaSection.tsx:226-234 |
| 14 | campo | «Porcentajes sugeridos» (`tipPresets`) — 3 × number «%» · `tipPresetsHint` «Tres porcentajes enteros distintos entre 1 y 100 (se guardan de menor a mayor). La pantalla añade «Sin propina».» · Switch «Permitir «Otro» importe» (`tipAllowCustom`) | `tips.presets`, `tips.allowCustom` | Propina activa | :239-274 |
| 15 | toggle | Switch «Calificación al final» (`rating`) · «Tras la venta, 1 a 5 con una sola pulsación. Solo actúa en pantallas táctiles.» | `rating.enabled` | Siempre | :280-294 |
| 16 | toggle | Switch «Desglose de impuestos» (`taxBreakdown`) · «Apagado muestra «IVA incluido»; encendido, desglosado como en el recibo.» (**«IVA» cableado**, ver E) | `showTaxBreakdown` | Siempre | :281 |
| 17 | toggle | Switch «Mostrar nombre del cliente» (`customerName`) · «Apagado por defecto: privacidad primero.» | `showCustomerName` | Siempre | :282 |
| 18 | menú | «Modo reposo» (`idle`) · «Qué muestra la pantalla sin carrito activo.» — «Marca del comercio» · «Promociones activas» · «Imágenes propias» | `idle.mode` | Siempre | :298-315 |
| 19 | campo | «Imágenes propias (una URL por línea)» (`idleMedia`, Textarea «https://…») · `idleMediaHint` | `idle.mediaUrls` | Modo `media` o hay URLs | :317-328 |
| 20 | campo | «Tiempo hasta reposo» (`idleAfter`) number 10–3600 + «segundos (10 a 3600)» | `idle.idleAfterSeconds` | Siempre | :331-347 |
| 21 | menú | «Idioma de la pantalla» (`locale`) · «Por si la pantalla debe ir en otro idioma que el ERP.» — «El de la organización» + idiomas | `locale` | Siempre | :353-376 |
| 22 | menú | «Forzar táctil / no táctil» (`touch`) · «Solo si la detección automática se equivoca con el hardware.» — «Automático» · «Táctil» · «No táctil» | `touch` | Siempre | :378-395 |
| 23 | botón | «Hay cambios sin guardar» (`unsaved`) + (Save) «Guardar ajustes» (`save`) / «Guardando…» | `saveCustomerDisplayConfig`; toasts `savedHint` «Las pantallas aplican los cambios sin recargar»; validaciones `invalidPresets`, `invalidIdleSeconds`, `invalidMediaUrls`, `invalidMediaUrlsTooMany` | `disabled` sin cambios | :399-403, 186-216 |

#### D.17.13 Lo roto o sin efecto en Configuración › POS

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **Horas de Operación no se puede desactivar una vez guardada** (el botón de guardar en apagado solo existe si nunca se guardó) | ConfiguracionPage.tsx:682-686, 736-747 |
| 2 | `handleSaveOperatingHours` escribe `organization_settings` directo desde el navegador, fuera del servicio | :281-295 |
| 3 | Cabeceras `!embedded` (título, atrás, refresco) son código muerto; los `Link` a `/app/pos/configuracion` apuntan a una ruta inexistente | :348-374; ConsecutivosPage.tsx:318-356; ImpresionesPage.tsx:107-131; DesktopAgentPanel.tsx:289-306, 340-357 |
| 4 | `loadData` depende de `branchFilter` pero ninguna consulta lo usa | :157 |
| 5 | «Agente de Impresión» visible siempre; en navegador solo muestra el aviso | :521-534; DesktopAgentPanel.tsx:359-367 |
| 6 | `setAutoStart` falla en silencio; «Iniciar agente» deshabilitado sin explicación; `handlePrintTest` silencioso si popup bloqueado; `togglePrinter` sin toast de éxito | DesktopAgentPanel.tsx:251-263, 446; ImpresionesPage.tsx:68-79; PrintersSection.tsx:76-83 |
| 7 | Métodos de pago: mapa fijo de 9 códigos, sin «Añadir método» (existe `addPaymentMethod`) | :321-334, 838; configuracionService.ts:205 |
| 8 | Fechas con `toLocaleString('es-CO')` sin tz de la org | RecentPrintJobsTable.tsx:133; PrintAgentStatusCard.tsx:105; DesktopAgentPanel.tsx:434 |
| 9 | Etiquetas con nombres internos: «Orden de visualización (display_order)», «Rango (rank)» | :796-797 |
| 10 | Copy sin tildes en Cierre Ciego, Previsualizar Impresiones, formulario de impresora | :634; ImpresionesPage.tsx; PrinterFormDialog.tsx:309-325, 472-475, 505-509, 564-579 |
| 11 | Stat «Sec. Facturación» sin sección que las gestione; badge «Instalador disponible próximamente» inalcanzable | :427-428; DownloadDesktopDialog.tsx:104-107 |

## E. Impuestos: no son siempre IVA — cómo se manejan hoy

Ampliación pedida por el dueño. El diseño de Figma muestra «IVA 19 %» fijo en cabecera, resumen del POS, Precios y costos y Editar (`09-detalle.png`, `09-pos-escritorio.png`, `09-editar.png`); el modelo admite impuestos configurables con nombre y tasa libres, pero **no tipifica** (IVA/INC/ICA/retención) y la UI de producto captura uno solo. Esquema deducido de `supabase/migrations/00000000000000_baseline_schema.sql` (baseline) y `20260921100000_pos_checkout_v1_rpc_atomica.sql`.

### E.1 Modelo de datos

| # | Tabla.columna | Tipo | Qué guarda | Fuente |
|---|---|---|---|---|
| 1 | `organization_taxes.id` | uuid | PK | baseline:19946-19957 |
| 2 | `organization_taxes.template_id` | int FK `tax_templates` NULL | Plantilla del país (NULL = personalizado) | :19968, :53102 |
| 3 | `organization_taxes.name` | varchar(100) NOT NULL | Nombre libre («IVA 19%», «INC 8%», «ICA 0.966%»…) | :19949 |
| 4 | `organization_taxes.rate` | numeric(5,2) NOT NULL | Tasa en % | :19950 |
| 5 | `organization_taxes.description` | text | — | :19951 |
| 6 | `organization_taxes.is_default` | bool | Por defecto (la RPC desmarca los demás) | :19972, :20307-20313 |
| 7 | `organization_taxes.is_active` | bool | Activo | :19976 |
| 8 | `organization_taxes.tax_included` | bool | Incluido en el precio (true) o se suma (false) | :19980 |
| 9 | **No existe** | — | Tipo/categoría de tributo, retención, exento, orden de aplicación, base (bruto/neto), código DIAN propio, vigencia. El código solo llega por `tax_templates.code` (`IVA_19`, `INC_8`, `ICA_0.966`, `RETE_4`…) cuando hay plantilla | `tax_templates`: :38716-38727 |
| 10 | `product_tax_relations(product_id, tax_id)` | PK compuesta N:M | Impuestos del producto (**varios**) | :35695-35704, :43243 |
| 11 | `products.tax_id` | **integer** legado | Incompatible con uuid; no se usa | :33473+; `src/components/pos/types.ts:35` |
| 12 | `tax_account_mapping.organization_tax_id` | uuid FK | Cuenta contable por impuesto; **sin UI** | :38700-38710 |
| 13 | `sales.tax_total`, `.subtotal`, `.discount_total`, `.tax_included`, `.tax_breakdown` (jsonb `{name, amount}[]`) | — | Totales y desglose **por nombre** | :37145-37150; RPC:270 |
| 14 | `sale_items.tax_amount`, `.tax_rate` | numeric | Tasa acumulada y monto; **sin `tax_id`, sin `tax_included`** | :37054-37055; RPC:327-336 |
| 15 | `invoice_sales.tax_included` | bool | Global de la factura | :31703 |
| 16 | `invoice_items.tax_code`, `.tax_rate`, `.tax_included`, `.withholding_taxes` (jsonb) | — | Por línea; **retenciones sin UI** | :31585-31600, :31617 |
| 17 | `invoice_applied_taxes(invoice_id, tax_code, tax_rate, is_applied)` / `invoice_purchase_applied_taxes` | — | Desglose por código | :31564-31571, :31669-31676 |
| 18 | `applied_tax_ids` | **no es columna** | Vive en el carrito (localStorage) | `src/components/pos/types.ts:126`; `posService.ts:1191-1198` |
| 19 | RPCs | `initialize_organization_taxes` (copia plantillas CO, marca `IVA_19` default), `manage_organization_tax(p_name, p_rate, p_description, p_is_default, p_is_active, p_template_id, p_id, p_tax_included)`, `list_organization_taxes`, `delete_organization_tax` (bloquea si default o en productos) | — | :19717-19745, :20223, :19984, :3275-3330 |

### E.2 Configuración — Finanzas › Impuestos `/app/finanzas/impuestos`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Nuevo Impuesto» | Abre `TaxForm` | Siempre | `src/components/finanzas/impuestos/TaxesTable.tsx:231-238` |
| 2 | campo | «Buscar impuestos...» | Filtro local | Siempre | TaxesTable.tsx:245-249 |
| 3 | tabla | «Nombre» · «Tasa» · «Descripción» · «Estado» · «Predeterminado» · «Incluido en precio» · «Acciones» | RPC `list_organization_taxes` | Siempre | TaxesTable.tsx:267-273, 107-109 |
| 4 | badge | `{rate}%` + «Incluido» | — | Por fila | TaxesTable.tsx:309-321 |
| 5 | toggle | «Activo» / «Inactivo» | Update directo de `is_active` (sin RPC) | Por fila, ≥lg | TaxesTable.tsx:328-335, 137-141 |
| 6 | badge | «Predeterminado» | `is_default` | ≥sm | TaxesTable.tsx:340-345 |
| 7 | badge | «Incluido» | `tax_included` | ≥sm | TaxesTable.tsx:350-355 |
| 8 | botón | (icono lápiz) / (icono papelera) | Editar / eliminar | Por fila | TaxesTable.tsx:360-375 |
| 9 | diálogo | «Nuevo Impuesto» / «Editar Impuesto» | — | — | `src/components/finanzas/impuestos/TaxForm.tsx:251` |
| 10 | texto | «ℹ️ Plantillas sugeridas: Se muestran automáticamente los impuestos configurados para su país de operación…» | — | Creación con plantillas | TaxForm.tsx:255-262 |
| 11 | toggle | checkbox «Usar plantilla de impuesto» | Activa #12 | Creación | TaxForm.tsx:268-276 |
| 12 | campo | `<select>` **nativo** «Plantillas de Impuestos Disponibles (CO)» · «Seleccionar plantilla del país» · `{name} - {rate}% ({description})` | Rellena desde `tax_templates` (RPC `get_tax_templates_by_organization_country`) | Creación + #11 | TaxForm.tsx:281-312 |
| 13 | texto | «No hay plantillas de impuestos disponibles para su país» | Vacío | Sin plantillas | TaxForm.tsx:292 |
| 14 | campo | «Nombre *» («Ej: IVA 19%») | `name` | Siempre | TaxForm.tsx:321-330 |
| 15 | campo | «Tasa (%) *» («Ej: 19») | `rate` 0-100 | Siempre | TaxForm.tsx:334-349 |
| 16 | campo | «Descripción» («Descripción del impuesto») | — | Siempre | TaxForm.tsx:353-362 |
| 17 | toggle | «Impuesto activo» | `is_active` | Siempre | TaxForm.tsx:366-374 |
| 18 | toggle | «Impuesto predeterminado» | `is_default` | Siempre | TaxForm.tsx:378-386 |
| 19 | toggle | «Impuesto incluido en el precio» + «El precio del producto ya incluye este impuesto. No se sumará al total.» | `tax_included` | Siempre | TaxForm.tsx:390-404 |
| 20 | botón | «Cancelar» / «Guardar» / «Guardando...» | RPC `manage_organization_tax` | Pie | TaxForm.tsx:408-429 |
| 21 | diálogo | «Eliminar Impuesto» · «¿Está seguro de que desea eliminar el impuesto **{name}** ({rate}%)? … El impuesto será eliminado permanentemente.» · «Cancelar» / «Eliminar» | RPC `delete_organization_tax` | Papelera | `DeleteTaxDialog.tsx:116-146` |
| 22 | — | **No hay** control de tipo de tributo (IVA/INC/ICA/retención), exento, base, orden, código DIAN, vigencia, cuenta contable | — | — | — |

### E.3 Producto

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | `SearchSelect` «Impuesto» · «Seleccionar impuesto» · «Buscar impuesto...» · «No se encontraron impuestos» · «Sin impuesto» · `{name}` sublabel `{rate}%` | **Un solo** `tax_id`; lista `organization_taxes` activos | Nuevo y Editar (mismo componente) | `nuevo/InformacionBasica.tsx:471-488`, 131-138; `editar/FormularioEdicionProducto.tsx:20, 1105` |
| 2 | cálculo | — | Crear: `insert product_tax_relations` (1 fila) + herencia a variantes | Guardar | `nuevo/NuevoProductoForm.tsx:294-303, 549-553` |
| 3 | cálculo | — | Editar: carga con `.maybeSingle()`, `delete` todas + `insert` 1; borra las de las variantes | Guardar | `editar/FormularioEdicionProducto.tsx:251-255, 495-525, 961-966` |
| 4 | texto | «Impuesto: {name} {rate}%» (fallback **«IVA»**) | Solo `product_tax_relations[0]` | Cabecera del detalle | `id/ProductoHeader.tsx:320-328` |
| 5 | — | `DetallesTab` y `PreciosTab` **no tienen** ningún control de impuesto | — | — | — |
| 6 | columna | «Impuesto» (CSV) — «• **Impuesto** - Ej: "IVA 19%"»; alias cableados «iva 19%», «iva 5%», «iva 0%» | Importador mapea por nombre | Importar | `importar/page.tsx:667, 941-955, 1953` |
| 7 | toggle | checkbox «Duplicar configuración de impuestos» | Copia **todas** las relaciones (aquí sí N) | Duplicar | `[id]/duplicar/page.tsx:402-409, 217-232` |
| 8 | columna | «Impuesto» (exportación) | — | Exportar | `CatalogoProductos.tsx:932` |
| 9 | — | Acciones masivas: **sin** acción de impuesto | — | — | `bulk/` |

### E.4 POS: carrito (`CartView` + `TaxSummary`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Sin impuesto (excluido)» | Línea con `tax_excluded` | — | `CartView.tsx:818-821` |
| 2 | texto | «(inc. $X impuestos)» / «+$X impuestos» | Monto según `tax_included` | `tax_amount > 0` | CartView.tsx:823-827 |
| 3 | toggle | checkbox «Incluido» | `tax_included` **por línea** → `POSService.updateItemTaxIncluded` | Por línea | CartView.tsx:989-1004; posService.ts:1069-1092 |
| 4 | botón | (icono ReceiptText) «Excluir impuesto de este producto» / «Impuesto excluido - clic para incluir» | `tax_excluded` por línea (solo en memoria) | Por línea | CartView.tsx:1007-1022 |
| 5 | toggle | Switch «Impuestos incluidos» | Global del carrito; **sobrescribe** el de todas las líneas | Resumen | `TaxSummary.tsx:326-339`; posService.ts:1186-1190 |
| 6 | texto | «Subtotal:» + «(inc. impuestos)» | — | — | TaxSummary.tsx:351-363 |
| 7 | menú | «Impuestos disponibles:» · «Ningún impuesto seleccionado» / `{name} ({rate}%)` / «N impuestos seleccionados» · «Selecciona los impuestos a aplicar:» · filas + badge «predeterminado» | `applied_tax_ids` (inicial = `is_default`) | **Solo si ningún producto del carrito tiene `product_tax_relations`** | TaxSummary.tsx:366-437, 99-133 |
| 8 | texto | «Impuestos aplicados:» · `{name} ({rate}%)` + badge «incluido» · monto | Desglose por impuesto (nombre real) | Hay desglose | TaxSummary.tsx:440-468 |
| 9 | texto | «Total Impuestos:» / «Descuento:» / «Total Final:» | — | — | TaxSummary.tsx:471-503 |
| 10 | texto | «No hay impuestos configurados para estos productos» | Vacío | Sin desglose | TaxSummary.tsx:506-510 |
| 11 | cálculo | — | Por ítem: relaciones del producto (todas, sumadas; si alguna es `tax_included` fuerza incluido) → si no, `applied_tax_ids`; `tax_excluded` = 0 | — | TaxSummary.tsx:145-235; `src/lib/utils/taxCalculations.ts:128-183` |
| 12 | cálculo | — | `posService.calculateItemTaxes`: suma tasas de relaciones activas; **sin relaciones → 0** (ignora `is_default` y `applied_tax_ids`) | Al agregar línea | posService.ts:2747-2800 |

### E.5 POS: cobro, ticket, pantalla del cliente y Factus

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Impuestos:» (`cart.tax_total`) · «Subtotal:» + «(base imponible)» | Resumen (sin desglose por impuesto) | Cobro | `CheckoutDialog.tsx:1842-1848, 1874-1894` |
| 2 | toggle | checkbox «Impuestos incluidos en precios» | `taxIncluded` local (no vuelve al carrito) | Cobro | CheckoutDialog.tsx:2269-2283 |
| 3 | cálculo | — | `taxBreakdown {name, amount}[]` por **nombre**; reparte `tax_total` proporcional por ítem; persiste `sales.tax_included/tax_breakdown`, `sale_items.tax_rate/tax_amount`, `invoice_items` con `resolveLineTax` | Al cobrar | CheckoutDialog.tsx:861-968, 1081-1116; posService.ts:1717-1777, 1896-1929; RPC:263-270, 327-336 |
| 4 | texto (ticket) | `{name} (incluido):` por impuesto / «Impuestos (incluido):» · `{name} (incl):` (ESC/POS) · `{name}:` (móvil, sin sufijo) · régimen «Responsable de IVA» / «No responsable de IVA» | Desglose desde `sales.tax_breakdown` | Impresión | `print-agent/src/printing/renderHtml.ts:17-22, 345-353`; `renderEscpos.ts:16-23, 446`; `src/lib/services/mobileEscposAdapter.ts:335-341` |
| 5 | toggle (config) | «Desglose de impuestos» — «Apagado muestra «IVA incluido»; encendido, desglosado como en el recibo.» | `showTaxBreakdown` | Configuración › POS › Pantalla del cliente | `pantalla-cliente/AjustesPantallaSection.tsx:283`; `messages/es.json:2024-2025` |
| 6 | texto | «IVA incluido» **cableado** | Pantalla del cliente | — | `messages/es.json:2070`; `src/components/pos-display/logic.ts:262-275` |
| 7 | cálculo (Factus) | — | Por ítem `taxes: [{code: mapTaxCode(tax_code), rate, is_excluded}]`; **sin `tax_code` → '01' (IVA)**; `mapTaxCode`: `IVA_*→01`, `RETE_4/11→09`, `ICA_0.966→07`, `04` INC, default **'01'**; `withholding_taxes` desde jsonb sin UI | Envío DIAN | `src/app/api/factus/invoice/route.ts:207-242`; `factusService.ts:664-727` |
| 8 | texto | «Impuestos incluidos en precios» · checkboxes `{name}` + «Predeterminado» · «No hay impuestos configurados» · desglose `{name} ({rate}%):` + «(incluido)» | Factura de venta: aplica por código de plantilla (`tax_templates!inner` → **excluye personalizados**) | Nueva factura | `finanzas/facturas-venta/nueva-factura/ImpuestosFactura.tsx:364-378, 455-560` |
| 9 | columna | «Impuesto» → `{tax_rate}%` / «N/A» + checkbox incluido por línea | Sin selector por línea | Ítems factura venta | `ItemsFactura.tsx:247, 353-372` |
| 10 | toggle | «Impuestos incluidos en el precio» · «Impuestos Aplicables:» `{name}` + `{rate}%` · «Estado: Incluidos / No incluidos» · «Configurar» | Factura de compra | — | `facturas-compra/nueva-factura/ImpuestosFacturaCompra.tsx:69-75, 206-259` |
| 11 | cálculo | — | Devoluciones: nota crédito `subtotal = total / 1.19` («Asumiendo 19% de IVA») | Devolución | `pos/devoluciones/devolucionesService.ts:920-921` |
| 12 | cálculo | — | Resolutor F-42 `resolveLineTax`: ítem → aplicados → relaciones (`tax_templates!inner`) → default (`inner`) → 0 | Facturas/cotizaciones/POS | `src/lib/services/taxResolver.ts:1-16, 157-197` |

### E.6 Capacidades del modelo vs lo que expone cada pantalla

| Capacidad | BD | Config. impuestos | Producto | POS carrito | POS cobro | Ticket | Factura venta | Factura compra | Factus |
|---|---|---|---|---|---|---|---|---|---|
| Varios impuestos por producto | Sí (N:M) | — | **No** (1 selector; editar borra las extra) | Sí (suma) | Sí | Sí (`taxLines`) | Sí (por documento) | Sí | 1 `taxes[]` con tasa sumada |
| Incluido / agregado | Por impuesto, por venta, por línea de factura | Toggle | No | Global + por línea | Global (local) | «(incluido)» | Global + línea | Global | No se envía |
| Retenciones | Solo `invoice_items.withholding_taxes` jsonb | **No** | No | No | No | No | No | No | `RETE_*→09` si existiera |
| Exento / excluido | Tasa 0; `is_excluded` Factus | No | «Sin impuesto» | `tax_excluded` por línea (no persiste) | No | No | No | No | `is_excluded` (nunca se escribe) |
| Tipo de tributo (IVA/INC/ICA) | Solo `tax_templates.code`; personalizados sin tipo | No | No | No | No | Nombre libre | Por código de plantilla | No | `mapTaxCode` default '01' |
| Por defecto | `is_default` | Toggle + badge | No | Preselección (solo carritos sin relaciones) | — | — | Preselección | No | — |
| Desglose persistido | `sales.tax_breakdown` por **nombre**; `invoice_applied_taxes` por código | — | — | — | Escribe por nombre | Lee | Por código | Escribe | — |

### E.7 Inconsistencias (para que el diseño muestre impuestos configurables y no «IVA» fijo)

| # | Inconsistencia | Archivo:línea |
|---|---|---|
| 1 | UI de producto captura **un** impuesto aunque la BD es N:M; editar hace `maybeSingle` + `delete` + `insert 1` (borra las relaciones extra, p. ej. las de «Duplicar», y las de las variantes) | `editar/FormularioEdicionProducto.tsx:251-255, 495-525`; `nuevo/InformacionBasica.tsx:479-487` |
| 2 | Fallback literal «IVA» en la cabecera del detalle; solo `[0]` | `id/ProductoHeader.tsx:325` |
| 3 | «Asumiendo 19% de IVA» cableado en notas crédito (`/ 1.19`) | `pos/devoluciones/devolucionesService.ts:920-921` |
| 4 | «IVA incluido» cableado en la pantalla del cliente y su ayuda | `messages/es.json:2025, 2070`; `src/lib/pos/display/settings.ts:165`; `pos-display/logic.ts:262` |
| 5 | Importador con alias «iva 19%/5%/0%» y ayuda «Ej: "IVA 19%"»; placeholders «Ej: IVA 19%»/«Ej: 19» en `TaxForm`; sample de impresión «IVA 19%» | `importar/page.tsx:949-955, 1953`; `TaxForm.tsx:329, 346`; `pos/configuracion/impresiones/sampleData.ts:119` |
| 6 | `taxResolver` e `ImpuestosFactura` usan `tax_templates!inner`: los impuestos **personalizados** (`template_id NULL`) nunca se resuelven ni aparecen en factura | `taxResolver.ts:159, 194`; `ImpuestosFactura.tsx:365` |
| 7 | Factus: sin `tax_code` toda tasa → '01' (IVA); un INC 8 % se declara como IVA | `api/factus/invoice/route.ts:207-215`; `factusService.ts:727` |
| 8 | Tres motores de cálculo divergentes (`posService.calculateItemTaxes`, `TaxSummary/CheckoutDialog`, `resolveLineTax`) | posService.ts:2747-2800; TaxSummary.tsx:145-235; CheckoutDialog.tsx:861-968; taxResolver.ts:81+ |
| 9 | `applied_tax_ids` y `tax_excluded` solo viven en el carrito; la venta no guarda qué impuestos se aplicaron por id; desglose por nombre libre | posService.ts:1191-1198; types.ts:126, 162 |
| 10 | Toggle global del carrito sobrescribe el de cada línea y `CartView` recalcula el global desde las líneas: dos fuentes de verdad; `tax_included=true` del impuesto fuerza «incluido» aunque el cajero marque lo contrario | posService.ts:1186-1190; CartView.tsx:110-118; TaxSummary.tsx:174-183 |
| 11 | `getTaxIncludedSetting` lee `localStorage['pos-settings'].taxIncluded` que nadie escribe | `taxCalculations.ts:289-301` |
| 12 | Prorrateo del impuesto por ítem en el cobro en vez de tasa real por línea | CheckoutDialog.tsx:1083-1093; posService.ts:1496-1514 |
| 13 | `products.tax_id` integer legado sigue seleccionándose en catálogo y exportación | `CatalogoProductos.tsx:170, 222`; `facebookCatalogExport.ts:514` |
| 14 | Toggle «Activo» de la tabla salta la RPC | TaxesTable.tsx:137-141 |
| 15 | `invoice_items.withholding_taxes` y `tax_account_mapping` existen sin pantalla; política `Allow anon select organization_taxes USING (true)` | baseline:31600, 38700-38710, 55645 |

**Para el diseño**: (a) `TaxForm` necesita «Tipo de tributo» (IVA / INC / ICA / retención / otro), «Aplica sobre» (base o subtotal), «Exento» y «Código DIAN» (hoy solo por plantilla); (b) el producto necesita un `MultiSelect` de impuestos (N:M real) visible también en Detalle › Precios y costos, y una acción masiva «Asignar impuesto»; (c) el resumen del carrito y el cobro deben listar **cada impuesto por su nombre** (ya lo hace `TaxSummary`; el cobro y la pantalla del cliente no) y mostrar retenciones como líneas negativas; (d) ninguna etiqueta fija «IVA».

## F. Selector de cliente compartido (`CustomerPicker`)

Ampliación pedida por el dueño: un solo selector de cliente en toda la app. Hoy hay **22 implementaciones** (14 con búsqueda propia). Notación: «cliente» = filtro en memoria; «servidor» = `ilike` por PostgREST con `@/lib/supabase/config` (RLS) salvo que se indique.

### F.1 Inventario de selectores

| Componente (archivo:línea) | Dónde se usa | Control | Qué busca y cómo | Fila | Crear inline | Filtros | Múltiple | Extras |
|---|---|---|---|---|---|---|---|---|
| **POS `CustomerSelector`** `src/components/pos/CustomerSelector.tsx:50` | `app/app/pos/page.tsx:709`, `pos/ventas/nuevo/NuevaVentaPage.tsx:275`, `pos/mesas/id/MesaActionsSidebar.tsx:116`, `pms/reservas/nueva/StepCustomer.tsx:49`, `pms/espacios/id/QuickReservationDrawer.tsx:313`; modo `Dialog sm:max-w-[600px]` (:594) | Popover `w-96` escritorio (:538) / `Dialog max-w-[95vw]` móvil (:508); tarjeta del seleccionado con X (:445) | `POSService.searchCustomers` (`posService.ts:740`): `or` ilike `full_name, email, phone, doc_number, company_name, trade_name, identification_number`, orden `full_name`, límite 20 / 50 sin término; debounce 300 ms; carga inicial al abrir. + `reservations` `checked_in` (PMS) filtradas en cliente (:81, :124). Contacto principal vía `customer_company_links` (:159). Offline Desktop: `posOfflineReads.searchCustomers` (`src/lib/offline/posOfflineReads.ts:333`) | `UserAvatar`, `full_name`, icono empresa, «Contacto: nombre (cargo)», email, teléfono, badge «Pendiente de sincronizar». Sección «ESPACIOS OCUPADOS». Seleccionado: avatar, nombre, email, teléfono, `doc_type: doc_number` | Sí: `ClienteFormDialog` (formulario completo `ClientForm`, `max-w-4xl`); offline `OfflineCustomerDialog` | `status:'active'` se pasa pero **no se aplica** (no existe columna) | No | Huésped en espacio ocupado + `folio_id`; offline; quitar. Sin «Consumidor final», crédito, detalle/editar |
| **POS `customer-selector.tsx`** (minúsculas) `:23` | **Nadie** (huérfano) | Lista inline `h-[300px]` | Carga **todos** los clientes sin límite (:44); filtro en cliente `full_name, email, phone`; sin debounce | Icono, `full_name`, `teléfono • email` | Card inline `full_name`, email, teléfono (:161); **inserta `full_name` (columna generada) → falla** | No | No | Candidato a borrar |
| **`CheckoutDialog` autocompletado de dirección** `pos/CheckoutDialog.tsx:620` | Sección delivery (:2003) | Dropdown absoluto bajo el input | ≥3 chars, `or` ilike `address, first_name, last_name, phone`, `not address is null`, límite 8; sin debounce; join `municipalities` | Nombre, dirección + ciudad | No | Solo con dirección | No | No selecciona `customer_id`; rellena contacto de envío |
| **Facturas/cotizaciones `ClienteSelector`** `finanzas/facturas-venta/nueva-factura/ClienteSelector.tsx:38` | `NuevaFacturaForm.tsx:1217`, `cotizaciones/nueva-cotizacion/NuevaCotizacionForm.tsx:340` | **`Select` de shadcn con un `Input` sticky dentro** (:236-271) | Inicial 100 (`order full_name`); servidor `or` ilike `full_name, email, phone, company_name, trade_name, identification_number`, límite 50, debounce 300 ms; contacto principal (:90); carga el seleccionado por id (:158) | Avatar, `full_name`, «Contacto: …», email. Seleccionado: avatar, nombre, «Email:», «Teléfono:» | Sí: botón `+` → `ClienteFormDialog` | No | No | Devuelve solo `customerId` |
| **CRM `CustomerSearchSelect`** `crm/oportunidades/CustomerSearchSelect.tsx:33` | `OpportunityForm.tsx:582` (lista precargada), `leads/NewLeadDialog.tsx:288` (servidor) | Popover `w-[350px]`, `role=combobox` | (a) cliente `full_name, email, phone`; (b) `opportunitiesService.searchCustomers` (:106) `ilikeAnyOf(['full_name','email','phone'])` (escapado), `branch_id` opcional, límite 20, debounce 300 ms, anti-carrera | `UserAvatar`, `full_name`, email, teléfono; «Sin cliente» si `allowEmpty` | No (NewLeadDialog: pestaña «Cliente nuevo» nombre*, apellidos, email, teléfono, razón social) | `branch_id` | No | `allowEmpty`, `isSearching`, `searchError`, X por teclado |
| **CRM referidos `useCustomerSearch` + `EntitySearchList`** `crm/shared/useCustomerSearch.ts:23`, `crm/shared/EntitySearchList.tsx` | `referidos/RegisterReferralDialog.tsx:41`, `ConvertReferralDialog.tsx:41` | Lista inline de botones `aria-pressed` | `ilikeAnyOf(['full_name','email'])`, `order updated_at desc`, límite 8, debounce 250 ms | `full_name ?? 'Cliente sin nombre'`, `email ?? phone` | No | No | No | Hint «Elegido: …», `preset`, error visible; 100 % teclado |
| **CRM `CallLinkPanel`** `voice/CallLinkPanel.tsx:69, 221` | Vincular llamada | Input + «Buscar» (Enter), lista `max-h-40` | **API** `GET /api/crm/customers/search?q=&limit=` (`route.ts:25-40`): `getServerUserClient`, `ilikeAnyOf(['first_name','last_name','phone'])`, límite ≤20; sin debounce | `first_name last_name`, teléfono mono | Sí: modo `create` propio («Crear cliente nuevo», :258) | No | No | Único por route handler |
| **CRM pipeline `CustomerList`** `crm/pipeline/CustomerList.tsx:15` | `CustomerDashboard.tsx:7` | Lista de página | `ilike full_name`, sin límite | nombre, email, teléfono | No | No | No | Navegación |
| **CRM `BulkActionsDialog`** `crm/pipeline/modals/BulkActionsDialog.tsx:229, 786` | Pipeline | Input + toggles | Lista precargada `getCustomers()` sin límite; filtro cliente `full_name, email` | `full_name` | No | No | **Sí** | Único multi |
| **`CompanyContactsManager`** `clientes/CompanyContactsManager.tsx:151, 714` | Ficha empresa | Input + resultados | `or` ilike `first_name, last_name, email`, `customer_type='person'`, límite 10, ≥2 chars, sin debounce | avatar, nombre, email, teléfono | Sí: contacto nuevo (nombre, apellido, email, teléfono, documento, cargo; :873-951) | Solo personas | No | Vincula persona a empresa |
| **Chat `CustomerSelector`** `chat/conversations/nuevo/CustomerSelector.tsx:18` | `app/app/chat/conversaciones/nueva/page.tsx` | Input + dropdown absoluto `max-h-64` | `newConversationService.searchCustomers` (:84): ≥2 chars, `or` ilike `full_name, email, phone, identification_number, doc_number, company_name, trade_name`, límite 10; debounce 300 ms | avatar, `full_name`, `email || phone || doc_number || 'Sin datos de contacto'` | Sí: `QuickCustomerDialog` (nombre*, apellido, email, teléfono, roles, responsabilidades fiscales) | No | No | Placeholder «Buscar por nombre, email, teléfono o identificación…» |
| **Transporte `CustomerSearchSelect`** `transporte/envios/CustomerSearchSelect.tsx:48` | `ShipmentDialog.tsx:288, 325` (remitente/destinatario) | Input + dropdown + click-outside manual | `shipmentsService.searchCustomers` (:596): `or` ilike `full_name, email, identification_number, phone, company_name, trade_name`, límite 20; inicial al enfocar; debounce 300 ms; Enter fuerza; reordena en cliente | Iniciales con color por hash, `full_name`, teléfono, email, ciudad, dirección | No | No | No | Seleccionado solo `selectedName/Phone` (sin id) |
| **Transporte `TicketDialog`** `transporte/boletos/TicketDialog.tsx:224, 345` | Boletos | Input + «buscar» (Enter), lista `max-h-32` | `ticketsService.searchCustomers` (:309): 7 campos, límite 10, sin orden, sin debounce | `name`, `email · document_number` | No | No | No | Copia a `passenger_*` |
| **Transporte `AddressDialog`** `transporte/direcciones-clientes/AddressDialog.tsx:134, 345` | Direcciones | Popover `w-96` estilo POS | `customerAddressesService.searchCustomers` (:235): `full_name, first_name, last_name, company_name, trade_name, email`, límite 20, ≥2 chars, debounce 300 ms. **No busca teléfono ni documento** aunque el placeholder lo promete (:376) | nombre, email | No | No | No | — |
| **Parqueadero `CustomerSearchInput`** `parking/shared/CustomerSearchInput.tsx:30` | `ExitDialog.tsx:294` (crédito) | Popover `w-full sm:w-80`, `role=combobox` | ≥2 chars, `or` ilike `full_name, email, phone, doc_number`, límite 10, debounce 300 ms | Icono, `full_name || 'Sin nombre'`, email, teléfono | No | No | No | Vacío «Mínimo 2 caracteres» |
| **Abonados `PassFormDialog`** `pms/parking/abonados/PassFormDialog.tsx:131, 290` | `app/app/parking/abonados/page.tsx:329` | Popover estilo POS embebido | `parkingService.searchCustomers` (:871): 6 campos, límite 10, ≥2 chars, debounce 300 ms | nombre, email, teléfono | No | No | No | Duplicado visual del POS |
| **Abonados (PMS) `PassDialog`** `pms/parking/abonados/PassDialog.tsx:132, 262` | `app/app/pms/parking/abonados/page.tsx:211` | Input + «buscar», lista `max-h-40` | Mismo servicio, manual, sin debounce | `full_name`, `email || phone` | No | No | No | Segundo diálogo con otra UX |
| **Parqueadero `PaymentFormDialog`** `parking/pagos/PaymentFormDialog.tsx:142, 587` y **`SpaceDetailDialog`** `parking/mapa/SpaceDetailDialog.tsx:143, 486` | Cobro a crédito | `Select` simple | Precarga **todos** `id, full_name` sin búsqueda | `full_name` | No | No | No | Inviable con miles |
| **Gym `CustomerSelectorGym`** `gym/membresias/CustomerSelectorGym.tsx:38` | `MembershipDialog.tsx:133` | Popover `sm:w-96` (copia del POS) | `or` ilike `first_name, last_name, identification_number, email, phone`, límite 15, debounce 300 ms; **no filtra `organization_id`** (:80-84) | `UserAvatar`, nombre, documento, teléfono | Sí: diálogo propio (nombre*, apellido*, tipo doc, nº, email, teléfono, roles, fiscal, `MunicipalitySearch`; :349-505); insert directo con `fiscal_municipality_id` cableado (:57) | No | No | Tercer formulario de cliente |
| **Gym `ReservationDialog`** `gym/reservaciones/ReservationDialog.tsx:103, 205` | Reservas de clases | Input + lista | ≥2 chars, `first_name, last_name, email, phone`, límite 10, **sin debounce** | `first_name last_name`, email | No | No | No | — |
| **Calendario `EventModal`** `calendario/EventModal.tsx:178, 638` | Eventos | `Select` «Sin cliente» | `select('id, name').eq('is_active', true)` — **`name` e `is_active` no existen** → falla y el bloque nunca aparece | `name` | No | No | No | Roto en silencio |
| **PM `TaskCreationPanel`** `pm/TaskCreationPanel.tsx:177, 806` | Tareas | `SearchSelect` genérico | Precarga 200 `first_name, last_name`; filtro en memoria | `first_name last_name` | No | No | No | «Sin cliente» / «Buscar cliente…» |
| **Saldos a favor `NuevoSaldoFavorDialog`** `finanzas/saldos-a-favor/NuevoSaldoFavorDialog.tsx:117` | Saldos | `Select` simple | `saldosAFavorService.getClientes` (:91): todos sin límite | `full_name` | No | No | No | — |
| **Asistente `dynamic-options`** `app/api/ai-assistant/dynamic-options/route.ts:59` | Tarjetas del asistente | Lista (server) | `id, full_name` límite 100, sin búsqueda | `full_name` | `assistant/CustomerFormDialog.tsx` (`max-w-3xl`, `ClientForm`) | No | No | — |
| **CRM `CustomerEditDialog`** `crm/shared/CustomerEditDialog.tsx:34` | `OpportunityDetail.tsx:11`, `pipeline/drawer/tabs/ResumenTab.tsx:13` | `Dialog sm:max-w-2xl` con `ClientForm` | — | — | Sí (completo) | — | — | El «editar/crear» que el picker debería reutilizar |

Diálogos de creación existentes: formulario completo `ClientForm` (`clientes/new/ClientForm.tsx:26`) envuelto por `ClienteFormDialog` (div fijo custom `max-w-4xl`, `shared/form-dialogs/ClienteFormDialog.tsx:24`), `CustomerEditDialog` (`sm:max-w-2xl`) y `assistant/CustomerFormDialog` (`max-w-3xl`); formularios mínimos independientes: `OfflineCustomerDialog`, chat `QuickCustomerDialog`, gym, pestaña de `NewLeadDialog`, card de `customer-selector.tsx` (roto).

### F.2 Unión de capacidades del `CustomerPicker`

| Capacidad | Quién la tiene hoy |
|---|---|
| Búsqueda servidor `ilike` sobre `full_name, first_name, last_name, email, phone, identification_number, doc_number, company_name, trade_name` | Unión de POS, reservas PMS (`reservationsService.ts:85`), chat, GlobalSearch (`searchService.ts:58`). **Ninguno cubre todos** |
| Escapado del término (`ilikeAnyOf`) para comas/paréntesis | Solo CRM (`useCustomerSearch.ts:47`, `opportunitiesService.ts:122`, `api/crm/customers/search/route.ts:39`); el resto interpola `%${term}%` (PGRST100 con «,») |
| Debounce ~300 ms + cancelación anti-carrera | Debounce: POS, facturas, CRM, transporte, parking, gym, chat. Anti-carrera: solo `NewLeadDialog.tsx:145` y `useCustomerSearch.ts:35` |
| Carga inicial sin término | POS, facturas (100), transporte envíos, `NewLeadDialog`. Parking, gym y chat exigen ≥2 chars |
| Límite configurable (8/10/15/20/50/100) | Cada uno el suyo |
| Filtro por `branch_id` | Solo `opportunitiesService` |
| Filtro por `customer_type` (persona/empresa) | Solo `CompanyContactsManager` |
| Contacto principal de empresas (`customer_company_links`) | POS y facturas (código duplicado) |
| Avatar (`UserAvatar`) | POS, CRM, facturas, chat; iniciales con color: transporte |
| Fila: nombre + email + teléfono + documento + icono empresa + ciudad/dirección | Documento: gym, parking, chat (fallback). Empresa: POS, facturas. Ciudad/dirección: transporte |
| Badge «Pendiente de sincronizar» + catálogo local offline | Solo POS |
| Huésped en espacio ocupado (`checked_in`, `folio_id`) | Solo POS |
| «Sin cliente» / permitir vacío | CRM `allowEmpty`, calendario, PM; POS con botón X |
| Crear con formulario completo `ClientForm` | POS, facturas, asistente, CRM detalle |
| Crear rápido (mínimo) | POS offline, chat, gym, lead (cada uno con campos distintos) |
| Editar / ver detalle del seleccionado | Solo `CustomerEditDialog` desde CRM; ningún picker |
| Selección múltiple | Solo `BulkActionsDialog` |
| Popover escritorio / Dialog móvil / modo controlado | POS |
| Teclado (`aria-pressed`, `role=combobox`) | `EntitySearchList` completo; `role=combobox` en CRM y parking; POS y gym usan `div onClick` |
| Estados: skeleton, error visible, vacío diferenciado («escribe para buscar» vs «sin resultados») | Skeleton: POS, parking. Error: CRM. Vacíos: POS, parking, transporte |
| Devolver objeto vs solo id | Objeto: POS, parking, gym, chat, transporte. Solo id: facturas, CRM, calendario, PM, saldos |
| Crédito / saldo / límite | **Nadie.** `customers` no tiene `credit_limit` ni `balance`; el saldo vive en `accounts_receivable(customer_id, balance, status)` (RPC `get_accounts_receivable_for_customers`, `cuentas-por-cobrar/service.ts:452`). Capacidad nueva |
| «Consumidor final» por defecto | **Nadie.** POS muestra «Sin cliente» / «Cliente general» sin registro (`CartView.tsx:1254`) |

### F.3 Divergencias a reconciliar

1. **Campos de búsqueda distintos en 16 implementaciones**: `posService.ts:752` (7), `ClienteSelector.tsx:79` (6, sin `doc_number`), `opportunitiesService.ts:122` (3), `useCustomerSearch.ts:47` (2, sin teléfono), `api/crm/customers/search/route.ts:39` (3), `shipmentsService.ts:606` (6), `ticketsService.ts:314` (7), `parkingService.ts:882` (6), `CustomerSearchInput.tsx:57` (4), `customerAddressesService.ts:240` (6), `CustomerSelectorGym.tsx:83` (5), `ReservationDialog.tsx:115` (4), `newConversationService.ts:94` (7), `reservationsService.ts:85` (8), `CompanyContactsManager.tsx:163` (3), `searchService.ts:58` (8).
2. **Placeholders**: «Nombre, email, teléfono o documento…» (POS :279, parking :136), «Buscar cliente por nombre, email o teléfono» (facturas :252), «Buscar cliente…» (CRM :38, transporte :53), «Buscar por nombre o correo…» (referidos :106), «Nombre o teléfono…» (voz :222), «Nombre, email o documento…» (boletos :349), «Buscar por nombre, email, teléfono o identificación…» (chat :116), «Nombre, documento, email o teléfono…» (gym :114), «Nombre, email o teléfono…» (direcciones :376, promete teléfono y no lo busca).
3. **Escapado**: solo CRM usa `ilikeAnyOf`.
4. **Contenedor**: Popover `w-96` / `w-[350px]` / `w-full sm:w-80`; `Select` con input dentro (facturas); dropdown absoluto con click-outside manual (transporte, chat, CheckoutDialog); lista inline (referidos, boletos, PassDialog, gym reservas, voz); Dialog móvil `max-w-[95vw]` o `sm:max-w-[600px]`. Alturas: `h-80`, `h-64`, `max-h-[280px]`, `max-h-[200px]`, `max-h-64`, `max-h-40`, `max-h-32`, `h-[300px]`.
5. **Cinco formularios de creación**: completo (3 envoltorios de 3 tamaños), POS offline (6 campos), chat (4 + roles + fiscal), gym (7 + roles + fiscal + municipio; insert directo), lead (5), `customer-selector.tsx` (roto). Defaults `roles ['cliente','huesped']`, `R-99-PN`, `fiscal_municipality_id` cableado repetidos en `posService.ts:783-785`, `newConversationService.ts:160-161`, `CustomerSelectorGym.tsx:55-57`.
6. **Contrato de salida**: `onCustomerSelect(customer?, room?)` (POS), `onSelect(customer|null)` (parking, chat, gym), `onSelect(customerId)` con `''` vacío (CRM), `onCustomerChange(id|null)` (facturas), `onSelect({})` para limpiar (transporte :123), `hit {id,title,subtitle}` (referidos).
7. **Umbral**: 0 (POS, facturas, CRM, transporte), 2 (parking, gym, chat, direcciones, contactos), 3 (CheckoutDialog).
8. **Orden**: `full_name` asc (mayoría), `updated_at desc` (referidos), ninguno (boletos, parking, gym, chat, reservas PMS), en cliente (transporte).
9. **Ámbito de org**: `CustomerSelectorGym.tsx:80-84` no filtra `organization_id`; `getOrganizationId()` (localStorage) vs `useOrganization()` vs prop vs `getServerOrgContext`.
10. **Consultas rotas o inviables**: `EventModal.tsx:179-182`, `customer-selector.tsx:104`, `PaymentFormDialog.tsx:144`, `SpaceDetailDialog.tsx:144`, `saldosAFavorService.ts:91`, `FacturasTable.tsx:304`, `opportunitiesService.getCustomers` (:76) cargan todo sin límite.
11. **Tipos `Customer` distintos** (POS `doc_type/doc_number`; gym/parking `identification_*`; transporte `address, city`; CRM `CustomerHit`; reservas PMS `first_name/last_name` con `split(' ')` en `StepCustomer.tsx:17` que corrompe apellidos compuestos).
12. **Accesibilidad**: filas `div onClick` sin rol ni teclado en POS (:369), gym, abonados, chat.
13. **Debounce**: 300 ms (mayoría), 250 (referidos), ninguno (boletos, PassDialog, voz, gym reservas, CheckoutDialog, contactos).

### F.4 Columnas reales de `customers` (verificadas en la BD por MCP; no hay tipos generados en el repo)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `organization_id`, `branch_id` | integer NULL | Multi-tenant; `branch_id` filtro opcional en CRM |
| `first_name`, `last_name` | text | Se escriben estos |
| `full_name` | text **GENERATED ALWAYS** | Empresa: `company_name` → `trade_name` → nombre+apellido → «Empresa sin nombre». Persona: `trim(first_name || ' ' || last_name)` |
| `identification_type`, `identification_number` | text | Se escriben estos |
| `doc_type`, `doc_number` | text **GENERATED ALWAYS** | Espejo de `identification_*` |
| `email`, `phone`, `address`, `city`, `avatar_url` | text | — |
| `customer_type` | text NOT NULL default `'person'` | `'person'` / `'company'` |
| `company_name`, `trade_name`, `dv`, `parent_customer_id` | — | Empresa |
| `roles` (text[] default `{cliente,huesped}`), `tags`, `preferences`, `metadata` | — | — |
| `fiscal_municipality_id`, `fiscal_responsibilities`, `legal_organization_id` (default 2), `tribute_id` (default 21) | — | Facturación electrónica |
| `lifecycle_stage` (default `'lead'`), `health_score`, `company_size`, `branches_count`, `current_software`, `vertical_id` | — | CRM |
| `is_registered`, `user_id`, `is_online`, `last_seen_at`, `timezone`, `do_not_call`, `notes`, `created_at`, `updated_at` | — | — |

**No existen**: `name`, `is_active`, `status`, `credit_limit`, `balance`. No hay RPC de búsqueda de clientes en `public`.

### F.5 Contrato propuesto para el diseño del `CustomerPicker`

`CustomerPicker` con `Layout=popover|dialog|inline|sheet`, `Size=sm|md`, `State=idle|typing|loading|results|empty|error`, `mode=single|multi`, `allowEmpty`, `showCreate` (rápido y completo), `filter: {customerType?, branchId?, onlyWithAddress?}`, `context: 'pos'|'invoice'|'crm'|'pms'|'transport'|'parking'|'gym'|'chat'`. Fila = `CustomerRow` (avatar, nombre, badge empresa/persona, documento, email, teléfono, badge «Pendiente de sincronizar», saldo CxC opcional, ciudad opcional). Seleccionado = `CustomerCard` con acciones «Cambiar», «Ver», «Editar», «Quitar». Crear rápido = un solo `QuickCustomerForm` (nombres*, apellidos, tipo y nº de documento, email, teléfono, tipo persona/empresa) que reutilizan POS, chat, gym, lead y offline; «Más datos» abre `ClientForm` completo en `Sheet`. Un solo servicio `customerSearchService.search({term, limit, filters})` con `ilikeAnyOf` sobre los 9 campos y anti-carrera; en Desktop usa la réplica local.

## G. Conteo de controles por pantalla

«Filas» = controles inventariados (incluye textos, badges y estados); «interactivos» = botones, menús, pestañas, campos, toggles, chips, atajos y paginación. Los «por fila» / «por grupo» no se multiplican.

### G.1 Detalle de producto

| Pantalla / pestaña | Filas | Interactivos | Diálogos |
|---|---|---|---|
| A.0 Página contenedora | 6 | 2 | 0 |
| A.1 Shell (acciones + pestañas) | 24 | 7 acciones + 11 pestañas = 18 | 1 (eliminar) |
| A.2 Cabecera (`ProductoHeader`) | 27 | 3 | 0 |
| A.3 Detalles | 26 | 20 (+N chips de categorías) | 0 |
| A.4 Variantes | 32 | 23 (+2 por fila) | 2 (crear/editar 19 controles, borrar) |
| A.5 Modificadores | 18 | 3 + 7 por grupo + 1 por opción | 1 (`confirm()` nativo) |
| A.6 Stock | 11 | 3 + 2 por fila | 0 |
| A.7 Seriales | 36 | 13 (+2 por fila) | 2 (generar, reclamo) |
| A.8 Imágenes | 13 | 5 (+3 por imagen) | 2 (eliminar, vista previa) |
| A.9 Precios | 16 | 5 | 1 (actualizar precio) |
| A.10 Proveedores | 19 | 9 (+3 por fila) | 2 (crear/editar, eliminar) |
| A.11 Etiquetas | 9 | 5 (+1 por etiqueta) | 0 |
| A.12 Notas | 12 | 4 (+2 por nota) | 1 (eliminar) |
| A.13 Auditoría | 8 | 0 | 0 |
| A.14 `CreateClaimDialog` | 16 | 8 | — |
| **Total detalle** | **273** | **≈121 fijos** | **12** |

### G.2 POS principal

| Zona | Filas | Interactivos | Diálogos |
|---|---|---|---|
| B.1 Cabecera | 18 | 8 | 0 |
| B.1a Apertura de Caja | 18 | 7 | 1 |
| B.1b Arqueo y Cierre | 22 | 5 (+1 «Contado real» por método) | 1 |
| B.1c Indicador pantalla del cliente | 11 | 4 | 0 |
| B.2 Buscador (+ escáner, lector, receta) | 26 | 10 | 2 |
| B.3 Barra de categorías | 11 | 8 | 0 |
| B.4 Tarjeta + paginación | 27 | 9 | 0 |
| B.5 Variantes/modificadores | 16 | 6 | 1 |
| B.6 Seriales | 13 | 4 | 1 |
| B.7 Panel de cliente | 15 | 7 | 2 (popover/dialog, crear) |
| B.8 Pestañas de carritos | 9 | 7 | 1 |
| B.9 Aviso catálogo local | 5 | 1 | 0 |
| B.10 Pendientes sin conexión | 13 | 3 | 1 |
| B.11 Cliente offline | 11 | 8 | 1 |
| B.12 Vista móvil | 8 | 2 | 0 |
| B.13 Líneas del carrito | 36 | 20 | 0 |
| B.14 Totales | 13 | 4 | 0 |
| B.15 Acciones del carrito | 20 | 17 | 3 (espera, deuda, factura) |
| B.16 Cobro | 49 | 34 | 2 (seriales, stock insuficiente) |
| B.17 QR | 9 | 3 | 1 |
| B.18 Post-venta | 6 | 3 | 0 |
| **Total POS** | **356** | **≈170** | **17** |

### G.3 Catálogo, submenús y configuración

| Pantalla | Filas | Interactivos |
|---|---|---|
| C.1-C.2 Cabecera + «Más opciones» | 17 | 9 |
| C.3-C.5 Filtros rápidos, selección, ⋯ por fila | 32 | 21 |
| C.6-C.14 Diálogo eliminar + barra masiva + 6 diálogos + menú Estado | 68 | 51 |
| C.15 `FacebookFeedDialog` | 18 | 6 (+2 por moneda) |
| **Total catálogo** | **135** | **≈87** |
| D.0 Submenú lateral | 14 | 14 |
| D.2 Pedidos Online (lista + detalle) | 38 + 23 | ≈45 |
| D.3 Ventas (lista + detalle + nueva) | 16 + 12 + 9 | ≈30 |
| D.4 Cajas (lista + detalle + arqueo + movimiento) | 27 + 13 + 7 + 8 | ≈40 |
| D.5 Mesas (plano + detalle) | 27 + 24 | ≈40 |
| D.6 Reservas Mesas | 17 | 12 |
| D.7 Comandas | 11 | 8 |
| D.8 Devoluciones (+ motivos) | 10 + 13 | 16 |
| D.9 Propinas | 16 | 11 |
| D.10 Cargos Servicio | 14 | 10 |
| D.11 Cupones (lista + detalle) | 14 + 11 | 18 |
| D.12 Promociones (lista + wizard + detalle) | 15 + 4 + 9 | 20 |
| D.13 Cuentas por Cobrar | 20 | 15 |
| D.14 Pagos pendientes / Carritos | 0 | 0 |
| D.15 Reportes (+ dashboard Inicio) | 13 + 4 | 8 |
| **Total submenús** | **≈370** | **≈290** |
| D.17 Configuración › POS (13 tarjetas + 6 diálogos) | ≈249 | ≈120 |
| E Impuestos (config + producto + POS) | 22 + 9 + 24 | ≈30 |
| F Selectores de cliente | 22 implementaciones | — |

**Total inventariado: ≈1.430 filas / ≈820 controles interactivos** en las pantallas que el dueño pidió calcar. El diseño de la ronda 09 (capturas) cubre, por estimación control a control (§H), menos del 40 % del POS principal y alrededor del 55 % del detalle de producto; catálogo, masivos, Meta y stock/ajustes están por encima del 85 %.

## H. Lo que el diseño actual probablemente omite

Comparación de las tablas anteriores con las capturas `docs/design/figma/09-*.png` (detalle, detalle móvil, editar, POS escritorio, POS móvil, catálogo, masivos, product picker, stock/ajustes) y con el mapa §5 de `INVENTARIO-PRODUCTOS-Y-POS.md`. «Omite» = el control existe hoy en código y no aparece en ninguna captura; «inventa» = aparece en Figma y no existe en código (válido si es decisión, pero hay que marcarlo).

### H.1 Detalle de producto (`09-detalle.png`, `09-detalle-movil.png`)

| Control real (sección) | En Figma | Qué falta o cambia |
|---|---|---|
| Barra de 6 acciones: Editar · Duplicar · Ajustar Stock · Transferir · Desactivar/Activar · Eliminar (A.1 #2-#8) | «Ajustar stock», «Editar», «…» (móvil: Editar, Ajustar stock, Duplicar, Transferir, Imprimir etiqueta, Desactivar, Eliminar) | Escritorio: no se ve el contenido del «…»; hay que dibujarlo abierto con las 5 entradas + el `AlertDialog` de eliminar (A.1 #8, con sus dos textos y la banda ámbar). «Imprimir etiqueta» es **inventado** (no existe impresión de etiquetas) |
| Badge de estado con 5 variantes + «Descontinuado» sin badge (A.2 #6) | Solo «Activo» | Dibujar Inactivo, Descontinuado, Eliminado (y el estado Eliminado con Editar/Eliminar deshabilitados) |
| Galería de cabecera: principal + 5 miniaturas + «+N» / «-» (A.2 #1-#5) | Placeholder de imagen | Falta la mini-galería con «+N» y el estado «Sin imágenes» |
| Metadatos inline: SKU, Categoría, Unidad, Proveedor (legado), Tipo, Marca, Ref, Impuesto (A.2 #8-#15) | «ZAP-0042 · Calzado · Par · Nova · NV-URB-42 · IVA 19 %» | Faltan Tipo (Producto/Servicio) y «Sin categoría»/«N/A»; «IVA 19 %» debe ser «{nombre del impuesto} {tasa}» y admitir varios (E) |
| KPI Stock con chip «Todas las sucursales / {sucursal}» y «Sin seguimiento» (A.2 #18) | «Stock · Sucursal Principal · 22 uds · Reservado 3 · mínimo 5 · Norte 11» | Falta el caso «Sin seguimiento» (servicios) y el caso «Todas las sucursales». «mínimo» y «vs. mes anterior» son inventados (no hay KPI de margen ni comparación mensual) |
| Pestaña **Detalles** = formulario inline completo (A.3, 26 filas: SKU+EAN, categorías adicionales chips, unidad, proveedor, estación, tipo, marca, ref, trazabilidad con 4 controles, Creado/Modificado, Guardar) | Resumen de solo lectura con lápiz por bloque | Aceptable si se dibuja el `Sheet` de edición por bloque (solo se ve «Precios y costos» en móvil). Faltan el `Sheet` de «Información» (con categorías adicionales, estación, tipo, EAN) y el de «Organización y proveedor» y el de «Trazabilidad» con el constructor de patrón |
| Pestaña **Variantes** (A.4): tabla 7 col + diálogo de 19 controles (atributos con `datalist`, «Guardar valor en catálogo», «Agregar atributo», stock por sucursal, barcode) + AlertDialog | Pestaña «Variantes y modificadores» no capturada | Falta toda la pestaña: tabla, vacío «Este producto no tiene variantes» + «Crear primera variante», diálogo crear/editar y el borrado |
| Pestaña **Modificadores** (A.5): card por grupo (modo, obligatorio, borrar), opciones con «+$», sugerencias, «Nuevo grupo» con chips de existentes | No capturada (en Figma solo aparece en el formulario Nuevo) | Falta en el detalle; añadir mín/máx y editar/reordenar opción (hoy inexistentes: marcar como nuevos) |
| Pestaña **Stock** (A.6): 3 KPI, «Registrar Entrada / Salida / Ver Historial», tabla por sucursal con ↑/↓, vacío «Inventario sin seguimiento» | Pestaña «Inventario» con tabla (Existencia/Reservado/Disponible/Mínimo/Costo prom./Actualizado + ↑↓⇄), botones Registrar entrada/salida/Transferir/Ajustar inventario, sub-pestañas Seriales · Lotes · Kardex | Bien cubierto y ampliado (Mínimo, Costo prom., Transferir, Lotes, Kardex son **nuevos**: marcar). Falta el estado «Inventario sin seguimiento» y «No hay sucursales configuradas» |
| Pestaña **Seriales** (A.7, 36 filas): badges de configuración, «Generar seriales» con diálogo de 10 controles, 4 stats, filtro de 8 estados, Exportar, tabla 8 col, «Reclamo» por fila vendida, paginación con tamaño, `CreateClaimDialog` (16 controles), vacío «Este producto no requiere seriales» + «Editar producto» | Sub-pestaña Seriales con buscador, Estado, Sucursal, Exportar CSV, Generar seriales, badges, tabla, paginación | Faltan: diálogo «Generar seriales masivamente» (cantidad, sucursal destino, «Generar los N faltantes», aviso de garantía), botón «Reclamo» y `CreateClaimDialog`, badge «N sin serial», los 8 colores de estado, el estado sin `track_serial`. «Sucursal» como filtro es nuevo (hoy no existe) |
| Pestaña **Imágenes** (A.8): Subir, grid, overlay Ver/Principal/Eliminar, diálogo eliminar, vista previa, vacío | Bloque «Imágenes · 4» con lápiz | Falta la pestaña completa: acciones por imagen (visibles en táctil), diálogo «¿Estás seguro de eliminar esta imagen?», «Vista previa», estado vacío, límite/`alt_text`/reordenar (nuevos) |
| Pestaña **Precios** (A.9): card «Precio Actual», diálogo «Actualizar precio» (3 campos), gráfico, tabla historial 6 col con «Cambio %» | Bloque «Precios y costos» + `Sheet` (precio, comparación, costo, margen, vigente desde) | Falta la tabla de historial (Válido Desde/Hasta, Precio, Comparación, Descuento, Cambio %) y el gráfico. «Costo» y «Vigente desde» en el `Sheet` son nuevos (bien) |
| Pestaña **Proveedores** (A.10): tabla 7 col con ★ preferido, diálogo de 7 campos (proveedor, costo, días, mínimo, SKU, notas), AlertDialog | Bloque «Organización y proveedor» con un solo proveedor | Falta la pestaña «Proveedores y etiquetas» con la tabla N proveedores, el ★, el diálogo y el borrado |
| Pestaña **Etiquetas** (A.11): buscador con dropdown, crear, pills con ×, panel explicativo | «Etiquetas: Ofertas · Verano» de solo lectura | Falta el `MultiSelect` con crear (y color) |
| Pestaña **Notas** (A.12): editor + adjuntos + historial con avatar/rol/fecha, descargar, eliminar | «Notas recientes» (2) + «Ver todas» | Falta la pestaña: textarea, «Adjuntar archivos», lista de adjuntos, AlertDialog de borrado, vacío |
| Pestaña **Auditoría** (A.13): tabla Fecha/Usuario/Acción/Cambios con badges Creación/Actualización/Eliminación | «Historial» (no capturada) | Falta la tabla y su vacío; añadir filtros/paginación (nuevos) |
| Toasts y estados de error de cada pestaña (≈40 textos) | — | No hace falta dibujarlos uno a uno, pero sí un `Toast` de éxito, error y «parcial» del kit |

### H.2 POS principal (`09-pos-escritorio.png`, `09-pos-movil.png`)

| Control real (sección) | En Figma | Qué falta o cambia |
|---|---|---|
| Cabecera del POS: «Sistema POS» + nombre de org, badge de sucursal, **Abrir Caja / Cerrar Caja** (con estado deshabilitado + tooltip), «Sin conexión» + badge N (Desktop), reloj, indicador de pantalla del cliente (4 estados + menú de 3 ítems), «N Activos» / «N En Espera» (B.1) | Sin cabecera propia (solo el `AppHeader` global); en móvil «Caja 1 · Turno 8:02» | **Toda la cabecera del POS falta.** Hay que decidir dónde viven caja (abrir/cerrar), pantalla del cliente, offline y contadores en el nuevo layout (barra secundaria del POS o menú «⋯» del `MobileHeader Mode=pos`) |
| Diálogo «Apertura de Caja» (18 controles: alcance sucursal/global/mi caja, monto inicial, notas rich, aviso) (B.1a) | No | Falta completo, incluidos los 3 modos de alcance según `cashMode` |
| Diálogo «Arqueo y Cierre de Caja» (22 controles: resumen, 4 desgloses por método, movimientos de la sesión, arqueo por método con «Contado real», modo ciego «****», observaciones, aviso de diferencia) (B.1b) | No | Falta completo; es la pantalla más densa del POS y no tiene diseño |
| Indicador de pantalla del cliente y su menú (B.1c) | No | Falta (4 estados de punto + menú «Activar y abrir» / «Abrir» / «Cerrar») |
| «Pendientes de sincronizar» (B.10, 13 filas), `LocalCatalogNotice` (B.9), cliente offline (B.11) | No | Falta todo lo Desktop/offline |
| Buscador: escáner de cámara (overlay con vídeo, error de permisos), «Mostrar N ▲▼», densidad, «Limpiar», «N prod.» (B.2) | Buscador + icono scanner + «/» + toggle vista + «24 por página» | Bien; falta el overlay del escáner (o su sustituto con lector real) y el estado de error de cámara |
| Barra de categorías en 3 modos (`searchselect` / `buttons` / `images`) + ★ favorita + «Top» (B.3) | Solo modo chips | Faltan los modos combobox e imágenes (80×80) y el ★ en cada modo |
| Tarjeta: 5 badges (Categoría, Agotado, -%, N var., Personalizable, Top) + ★ + ChefHat receta + «Agregar/Elegir/+» (B.4) | Tarjeta con -%, ★, «N var. · Top», «Personalizable», stock, «Elegir» | Falta el botón de **receta** y el diálogo «Receta de producción» (B.2 #20-#26); falta el badge de categoría (decisión: se puede quitar) |
| Estados del grid: skeleton, error con «Reintentar», vacío con «Limpiar filtros» (B.4 #24-#26) | Vacío «Sin resultados» | Faltan error y skeleton |
| `VariantSelectorDialog` (B.5) | Diálogo con talla/color, variante, modificadores, cantidad | Bien (cantidad y stock por variante son nuevos). Falta el estado de validación «Selecciona una opción en "{grupo}"» y la lista fallback sin atributos |
| Panel de cliente (B.7): trigger, popover/dialog con «ESPACIOS OCUPADOS» (PMS), «CLIENTES», badge «Pendiente de sincronizar», contacto de empresa, «Crear nuevo cliente», card del seleccionado con X | Icono de usuario en la cabecera del carrito | **Falta el panel de cliente entero** (ver F para el `CustomerPicker` compartido) |
| Pestañas de carritos (B.8): pestaña con icono/nombre, badge total «$12k», badge nº ítems, X con AlertDialog «¿Cerrar este carrito?», «+», card resumen, vacío | «Carrito · 3» sin pestañas | **Faltan los multi-carritos** (crear, cambiar, cerrar con confirmación, en espera en amarillo) |
| Líneas del carrito (B.13, 36 filas): miniatura, badges de cocina/variante/modificadores/nota/SKU, precio unitario, «Sin impuesto (excluido)», «+$X impuestos», descuento por línea con edición inline y **descuentos frecuentes** en chips, cantidad ±/input, checkbox «Incluido», botón excluir impuesto, nota, eliminar | Línea con nombre, variante, ±, precio | Faltan: descuento por línea (badge, input, chips frecuentes), nota de línea (badge + input), impuesto por línea («Incluido» + excluir), badges de cocina, modificadores, SKU, miniatura, eliminar |
| Totales (B.14): switch «Impuestos incluidos», selector multi de impuestos «Impuestos disponibles», desglose por impuesto con badge «incluido», «Total Impuestos», «Descuento», «Total Final», aviso «No hay impuestos configurados» | Subtotal · IVA 19 % · Descuento · Total | Falta el switch global, el selector de impuestos aplicados y el desglose por nombre (E); «IVA 19 %» fijo debe desaparecer |
| Acciones del carrito (B.15): «Espera» (diálogo con motivo), «Deuda» (diálogo «Registrar Deuda»: motivo*, días, vence, «Se creará…»), «Enviar Cocina», «Cobrar» + aviso «Debe abrir una caja antes de cobrar», y para `hold_with_debt`: «Ver Factura» (modal 90vw), «Imprimir», «Cobrar», «Anular»; «Reactivar» en hold | «Cobrar · F4», «Guardar», «Descuento» (móvil: «Seguir vendiendo») | Faltan: Espera + diálogo, Deuda + diálogo, Enviar Cocina, estado en espera (badge «Espera» + «Reactivar»), estado con deuda (badge, aviso, 4 botones), aviso de caja cerrada. «Guardar» y «Descuento» global son **inventados** (hoy no existen: decidir si se crean) |
| `CheckoutDialog` (B.16, 49 filas): resumen de venta, dos bloques de totales, **Entrega** (Recoger/Envío propio/Tercero, conductor, dirección con autocompletado, ciudad, teléfono, nombre, instrucciones, tarifa, pago del envío), **pagos múltiples** («Agregar», «Pago n», método, monto, «Exacto» + montos rápidos, «Generar QR de pago»), «Impuestos incluidos en precios», **propina** (avisos de pantalla del cliente, 5/10/15/20 %, monto, mesero), **comisión de vendedor** (vendedor, %/monto), **Factura Electrónica** (switch + tooltip + «Global»), «Completar Venta · $» / «Falta dinero», diálogo seriales, diálogo «Stock insuficiente de ingredientes» | Solo «Cobrar · F4» en el carrito; en `05-movil-pos-cobrando.png` hay un cobro móvil básico | **Falta el cobro completo** en escritorio y móvil: es la pantalla con más controles del POS (49 filas) |
| Diálogo QR (B.17): QR, «Expira en», «Mostrar en pantalla del cliente», referencia/monto/proveedor, «Ya pague», estados pagado/expirado | No | Falta |
| Post-venta (B.18): «¡Venta Completada!», «Pendiente de sincronizar», Total/Pagado/Cambio, «Re-imprimir Recibo», «Factura Electrónica», «Cerrar» | No | Falta |
| Diálogo de seriales en el cobro (B.6) | No | Falta |
| «Elige la sucursal para vender» (Figma) | Sí | **Inventado**: hoy el POS no cambia de sucursal; el diseño lo resuelve (bien), pero hay que documentarlo como decisión |
| Configuración › POS (Figma: «Ocultar productos agotados», «Permitir vender sin stock», «Densidad por defecto», «Mostrar stock en la tarjeta», «Barra de categorías» modo/orden) | Sí | Los dos primeros y «Mostrar stock» son nuevos (marcados «Nuevo»); faltan las secciones reales de Configuración › POS (impresoras, estaciones, agente de impresión, consecutivos, pantalla del cliente): ver D |

### H.3 Catálogo y masivos (`09-catalogo-escritorio.png`, `09-masivos.png`, `09-product-picker.png`)

| Control real | En Figma | Qué falta o cambia |
|---|---|---|
| Menú «Más opciones»: Importar desde CSV · Importar desde web (IA) · Exportar a CSV · Exportar a Facebook (CSV) · URL Feed para Facebook (C.2) | «Importar ▾» (archivo / web / asistente) + «…» (Exportar a CSV, Imprimir etiquetas, Códigos de barras, Sincronizar con Meta, Ajustes de inventario, Configurar columnas) | Faltan «Exportar a Facebook (CSV)» y «URL Feed para Facebook» (o se explicita que «Sincronizar con Meta» abre el `MetaSyncDialog` con las 3 pestañas). «Imprimir etiquetas», «Códigos de barras», «Configurar columnas» son inventados (decisión pendiente, pregunta 4 del inventario) |
| `FacebookFeedDialog` (C.15, 13 controles) | `09-meta.png`: «Meta y canales» con pestañas Feed por URL / Exportar CSV / Sincronización directa; feeds por moneda, moneda por defecto, token + «Regenerar», aviso de tasa, pasos, «Vista previa del CSV» | **Bien cubierto** y ampliado (moneda por defecto, exportar por moneda/filtro, sincronización con eventos). El `ConfirmDialog` «¿Regenerar el token del feed?» ya está en `09-kit-paginas.png`; faltan los estados «Cargando monedas…» / «No se pudieron cargar las monedas…» / «No hay monedas adicionales…» |
| Filtros rápidos de la tabla (C.3) y selección con menú ▾ (C.4) | `FilterPanel` + chips; checkbox con «Seleccionar los 4.368» | Bien (se fusionan); falta el menú «Seleccionar esta página / todos / Limpiar» o su equivalente |
| Menú ⋯ por fila: Ver detalle · Editar · Duplicar · Eliminar (C.5) | ⋯ sin abrir | Dibujar abierto; añadir «Ajustar stock» si se decide |
| Diálogos masivos ×6 + menú Estado (C.7-C.14) | 7 diálogos + resultado parcial + «Imprimir etiquetas» | Bien cubierto y mejorado. Falta el menú «Estado» abierto (Activar/Desactivar/Descontinuar) y su confirmación (hoy inexistente); «Vigente desde» y «Conservar categorías adicionales» son nuevos |
| `ProductSearchDialog` / `ProductSearchCombobox` | `09-product-picker.png` | Bien; falta el diálogo de receta y el ★ que hoy copia el diálogo compartido (o descartarlos explícitamente) |

### H.4 Transversal

- **Impuestos** (E): el diseño escribe «IVA 19 %» en 4 pantallas; hay que sustituirlo por «{nombre} {tasa}» con N impuestos, un `TaxForm` con tipo de tributo y el desglose por nombre en carrito, cobro, ticket y pantalla del cliente.
- **Selector de cliente** (F): no hay ningún `CustomerPicker` en las capturas de esta ronda; el del POS (B.7) es el más completo y debe ser la base.
- **Estados**: casi ninguna captura muestra cargando/error/vacío por pestaña; el kit (`Skeleton`, `EmptyState`, `ErrorState`) debe instanciarse al menos una vez por pantalla densa (detalle › Variantes, POS › grid, cobro).
- **Modo Desktop/offline**: nada del flujo offline (aviso de catálogo local, pendientes, cliente offline, badge «Pendiente de sincronizar», venta «Pendiente de sincronizar») está diseñado.

## I. Recomendación: qué hay que diseñar de nuevo, qué completar y qué está bien

Criterio: «diseñar de nuevo» = la pantalla no existe en Figma o lo que existe cubre menos de la mitad de sus controles; «completar» = existe y faltan estados, diálogos o sub-bloques concretos; «está bien» = cubre lo real y solo añade mejoras marcadas como nuevas.

### I.1 Diseñar de nuevo (prioridad 1, por número de controles sin dibujar)

| # | Pantalla | Controles reales | Por qué | Sección |
|---|---|---|---|---|
| 1 | **POS › Cobro (`CheckoutDialog`)** escritorio + móvil (`Sheet`) | 49 + QR 9 + seriales 13 + post-venta 6 | Nada en Figma salvo «Cobrar · F4». Pagos múltiples, entrega, propina, comisión, factura electrónica, QR, seriales, post-venta | B.16-B.18, B.6 |
| 2 | **POS › Cabecera + caja** (apertura, cierre/arqueo, pantalla del cliente, offline) | 18 + 18 + 22 + 11 + 13 + 5 + 11 | Sin diseño. El arqueo es la pantalla más densa del POS | B.1, B.1a-c, B.9-B.11 |
| 3 | **POS › Carrito completo** (pestañas multi-carrito, líneas con descuento/nota/impuesto/modificadores, totales con impuestos configurables, acciones Espera/Deuda/Cocina, estados hold y hold_with_debt, diálogos «Poner en espera» y «Registrar Deuda») | 9 + 36 + 13 + 20 | El carrito de Figma tiene 4 controles de 78 | B.8, B.13-B.15 |
| 4 | **Detalle › Variantes y modificadores** (tabla, diálogo de variante de 19 controles, borrado; grupos y opciones de modificadores) | 23 + 3 + 7/grupo | Pestaña no capturada | A.4, A.5 |
| 5 | **Detalle › Seriales completo** (diálogo «Generar seriales masivamente», «Reclamo» + `CreateClaimDialog`, 8 estados, vacío sin `track_serial`) | 36 + 16 | La sub-pestaña de Figma cubre la tabla, no los diálogos ni los estados | A.7, A.14 |
| 6 | **Detalle › Imágenes, Proveedores, Etiquetas, Notas, Historial** como pestañas (o `Sheets`) con sus diálogos y vacíos | 13 + 19 + 9 + 12 + 8 | Solo aparecen como bloques de resumen de solo lectura | A.8-A.13 |
| 7 | **`CustomerPicker` compartido** (popover / dialog / inline / sheet; fila; card del seleccionado; `QuickCustomerForm`) | 15 (POS) + unión F.2 | 22 implementaciones y ninguna en Figma | F |
| 8 | **Configuración › POS** completa (impresoras, estaciones, agente de impresión, consecutivos, pantalla del cliente, ajustes) | ver D | Figma solo tiene los 4 toggles nuevos + barra de categorías | D |
| 9 | **Finanzas › Impuestos** (`TaxForm` con tipo de tributo, incluido, por defecto, exento, código) y `MultiSelect` de impuestos en producto | 22 + 9 | Necesario para que ninguna pantalla diga «IVA» fijo | E |

### I.2 Completar (prioridad 2)

| Pantalla | Qué añadir |
|---|---|
| Detalle › cabecera | Menú «…» abierto (Duplicar, Transferir, Activar/Desactivar, Eliminar) + `AlertDialog` de eliminar con sus 2 textos; badges Inactivo/Descontinuado/Eliminado; galería con «+N»; «Sin seguimiento»; «Todas las sucursales» |
| Detalle › Resumen | `Sheet` de cada bloque: Información (categorías adicionales, estación, tipo, EAN), Organización y proveedor, Trazabilidad (constructor de patrón), Imágenes |
| Detalle › Inventario | Estados «Inventario sin seguimiento» y «No hay sucursales configuradas»; marcar Mínimo/Costo prom./Transferir/Lotes/Kardex como nuevos |
| Detalle › Precios y costos | Tabla de historial (6 col) y gráfico real; historial de costos (nuevo) |
| POS › buscador y grid | Modos `combobox` e `images` de la barra de categorías con ★; diálogo «Receta de producción»; estados error/skeleton del grid; overlay del escáner (o su sustituto) |
| POS › `VariantSelectorDialog` | Estado de validación «Selecciona una opción en "{grupo}"» y lista fallback |
| POS › móvil | `MobileHeader Mode=pos` con caja, pantalla del cliente, offline y contadores; vista carrito con pestañas y acciones; cobro en `Sheet` |
| Catálogo | «…» con Exportar a Facebook / URL Feed (o nota de que van en `MetaSyncDialog`); menú ⋯ por fila abierto; menú «Estado» masivo abierto + confirmación; menú de selección página/todos |
| Submenús del POS | Una cabecera por página con sus acciones principales (ver D) |

### I.3 Está bien (solo marcar lo nuevo)

Catálogo escritorio/móvil, `FilterPanel`, `BulkActionBar` y los 7 diálogos masivos con resultado parcial, `MetaSyncDialog` (Feed / Exportar / Sincronización), `ProductPicker` (diálogo y combobox), Nuevo producto (9 secciones + índice + errores), Editar/Duplicar («¿Qué copiar?»), Stock por sucursal y Nuevo ajuste, kit de páginas (`PageHeader` ×3, `StatCard`, `FormSection`, `ImageUploader`, `ConfirmDialog`, `QuickCategoryForm`).

### I.4 Reglas para el diseñador (derivadas de esta auditoría)

1. **Nada dice «IVA»**: toda etiqueta de impuesto es `{nombre} {tasa}` y admite N filas (carrito, cobro, ticket, pantalla del cliente, detalle, formulario).
2. **Cada pantalla densa se entrega con sus 4 estados** (listo, cargando, vacío, error) y sus diálogos abiertos; las tablas de este documento dicen cuáles.
3. **Lo inventado se etiqueta «Nuevo»** en Figma (Imprimir etiquetas, Códigos de barras, Configurar columnas, Guardar/Descuento del carrito, Elegir sucursal, Ocultar agotados, Vender sin stock, Mínimo/Costo prom./Lotes/Kardex en Inventario, mín/máx de modificadores, cantidad y stock en el diálogo de variantes, Vigente desde, Costo en Precios) para que el equipo sepa qué es diseño y qué es código pendiente.
4. **Lo roto no se calca**: las listas «Lo roto» de A.15, B.19 y C.16 (escáner simulado, `window.alert`, toasts invisibles, `confirm()` nativo, gráfico vacío, hover-only, `Transferir` sin preselección, chips de 3 dígitos) se sustituyen por el componente correcto del kit, no se reproducen.
5. **Desktop/offline es un modo, no una pantalla aparte**: badge «Pendiente de sincronizar», aviso de catálogo local, «Sin conexión» con contador y «Pendientes de sincronizar» se dibujan como variantes de las pantallas del POS.
