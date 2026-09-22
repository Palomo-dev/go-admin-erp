# Paridad — Detalle de producto (tanda de fidelidad en Figma)

Fecha: 2026-09-22. Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`),
página **`05 Producto — fidelidad`**. Fuente de verdad: `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`
(secciones A.0–A.15, C.2, C.4, C.5, H.1, H.3). Capturas en `docs/design/figma/10-producto-*.png`.

Convenciones de la página (no reabrir):

- Se conserva la estructura de pestañas ya decidida en `03 Pantallas`: **Resumen · Inventario ·
  Precios y costos · Variantes y modificadores · Imágenes · Proveedores y etiquetas · Notas ·
  Historial**. Las 11 pestañas reales del código se mapean así: Detalles → Resumen (edición por
  `Sheet`), Variantes y Modificadores → sub-pestañas de «Variantes y modificadores», Stock y
  Seriales → sub-pestañas de «Inventario» (Lotes y Kardex quedan marcados «Nuevo»), Proveedores y
  Etiquetas → «Proveedores y etiquetas», Auditoría → «Historial».
- Cada pantalla densa tiene sus 4 estados (listo · cargando · vacío · error) y sus diálogos abiertos.
- Impuestos: siempre `{nombre} {tasa}` y N chips («IVA 19 %» + «INC 8 %»); el `TaxMultiSelect` lo
  diseña la tanda POS (página `04`).
- Marca «Nuevo» = componente local `Marca/Nuevo` (sección «Componentes — Detalle de producto»).
- Estado (columna 4): **calcado** (existe y se dibuja tal cual) · **Nuevo** (no existe en código) ·
  **sustituido por …** (existe pero roto o fuera del kit: regla I.4.4) · **omitido: motivo**.

Secciones de la página y frames:

| Sección | Frames (primer nivel) |
|---|---|
| Componentes — Detalle de producto | `Marca/Nuevo`, `EstadoSerial` (8 variantes), `Icon/Power`, `Icon/ShieldCheck`, `Icon/PackageCheck`, `Icon/StarOff`, `Icon/Tags`, `Icon/StickyNote`, `Icon/TrendingUp`, `Icon/PackagePlus`, plantillas escritorio y móvil |
| 01 Variantes y modificadores | Variantes (listo · cargando · vacío · error), Modificadores (listo · cargando · vacío · error), móvil Variantes, móvil Modificadores, móvil Crear variante (sheet), diálogos Crear/Editar variante, estados del bloque Stock por sucursal, 3 ConfirmDialog, toasts |
| 02 Seriales | Seriales (listo · cargando · vacío con filtros · sin seriales · sin track_serial · error), móvil Seriales, móvil Generar (sheet), «Generar seriales masivamente» ×2, `CreateClaimDialog` ×4 (preseleccionado · búsqueda · sin cliente · cargando), toasts |
| 03 Cabecera y acciones | Cabecera con menú «…» abierto, AlertDialog eliminar, estado Eliminado (servicio), móvil cabecera, móvil menú ⋯ (sheet), móvil AlertDialog (sheet), badges ×5, galerías ×3, KPI ×4 variantes, toasts, página cargando (A.0), página error (A.0) |
| 04 Detalles (Sheets) | Resumen + Sheet «Información», móvil BottomSheet «Información», Sheet «Organización y proveedor», Sheet «Trazabilidad» ×2 (switch on/off), Sheet «Imágenes», SearchSelect abierto, vacío de categorías, «Guardando...», toasts |
| 05 Imágenes · Proveedores y etiquetas | Imágenes (listo · cargando/subiendo · vacío · error), móvil Imágenes, AlertDialog imagen, «Vista previa», toasts; Proveedores y etiquetas (listo · vacío · cargando · error), móvil, «Agregar Proveedor», «Editar Proveedor», AlertDialog proveedor, toasts |
| 06 Notas · Historial | Notas (listo · cargando · vacío · error), móvil Notas, AlertDialog nota, estados Guardando/Subiendo, toasts; Historial (listo · cargando · vacío · error), móvil Historial |
| 07 Stock y Precios | Stock (listo · sin seguimiento · sin sucursales · cargando · error · sucursal seleccionada), móvil Stock; Precios (listo · cargando · vacío · error), móvil Precios, «Actualizar precio», toasts |
| 08 Catálogo | menú «…» abierto (C.2), menú ⋯ por fila (C.5), menú de selección (C.4), menú «Estado» masivo + confirmación (C.7), móvil menú ⋯ (clon de 03) |

## A.0 Página contenedora

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.0 #1 | `PageHeaderSkeleton` + `DetailSkeleton` | 03 › Escritorio / Detalle — página cargando (A.0 #1) | calcado (Skeleton del kit) |
| A.0 #2 | «Error al cargar el producto» | 03 › Escritorio / Detalle — error al cargar | calcado (EmptyState error) |
| A.0 #3 | `{error}` («Producto no encontrado») | 03 › error al cargar | calcado |
| A.0 #4 | «Volver a productos» (ArrowLeft) | 03 › error al cargar | calcado |
| A.0 #5 | «Reintentar» | 03 › error al cargar | calcado (acción del EmptyState) |
| A.0 #6 | Estados (cargando / error; vacío cae en error) | 03 › dos frames | calcado |

## A.1 Shell del detalle

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.1 #1 | «Volver al catálogo» (ghost) | 03 › Cabecera (Breadcrumbs Inventario › Productos › {nombre}) | sustituido por Breadcrumbs del kit (decisión previa: productos con breadcrumbs) |
| A.1 #2 | «Editar» (primario) | 03 › Cabecera · menú «…» abierto (barra de acciones) | calcado; deshabilitado con `status='deleted'` en «estado Eliminado» (corrige A.15 #5) |
| A.1 #3 | «Duplicar» | 03 › menú «…» abierto | calcado (dentro del menú «…», decisión previa) |
| A.1 #4 | «Ajustar Stock» | 03 › barra de acciones | calcado («Ajustar stock» visible siempre) |
| A.1 #5 | «Transferir» | 03 › menú «…» abierto; 07 › Stock (botón «Transferir») | calcado; nota: debe preseleccionar el producto (A.15 #1) |
| A.1 #6 | «Desactivar» / «Activar» | 03 › menú «…» (Desactivar) y estado Eliminado (Activar deshabilitado) | calcado |
| A.1 #7 | «Eliminar» (destructive) | 03 › menú «…» abierto (ítem destructivo) | calcado; deshabilitado en Eliminado |
| A.1 #8 | AlertDialog «¿Estás seguro?» | 03 › Cabecera · AlertDialog eliminar; móvil AlertDialog (sheet) | calcado |
| A.1 #8a | Descripción «Esta acción marcará el producto como eliminado…» | 03 › AlertDialog eliminar | calcado |
| A.1 #8b | Banda ámbar «Esta acción no borra el producto de la base de datos.» | 03 › AlertDialog eliminar | calcado |
| A.1 #8c | «Cancelar» | 03 › AlertDialog eliminar | calcado |
| A.1 #8d | «Eliminar» (rojo) | 03 › AlertDialog eliminar | calcado |
| A.1 #9 | Pestaña «Detalles» | Todas (pestaña «Resumen» + Sheets de la sección 04) | sustituido por Resumen de solo lectura + Sheet por bloque (decisión previa de 03) |
| A.1 #10 | Pestaña «Variantes» | 01 › sub-pestaña «Variantes» de «Variantes y modificadores» | calcado (fusionada, decisión previa) |
| A.1 #11 | Pestaña «Modificadores» | 01 › sub-pestaña «Modificadores» | calcado (fusionada) |
| A.1 #12 | Pestaña «Stock» | 07 › sub-pestaña «Stock» de «Inventario» | calcado (fusionada) |
| A.1 #13 | Pestaña «Seriales» | 02 › sub-pestaña «Seriales · 42» de «Inventario» | calcado (fusionada) |
| A.1 #14 | Pestaña «Imágenes» | 05 › Imágenes | calcado |
| A.1 #15 | Pestaña «Precios» | 07 › «Precios y costos» | calcado |
| A.1 #16 | Pestaña «Proveedores» | 05 › «Proveedores y etiquetas» | calcado (fusionada) |
| A.1 #17 | Pestaña «Etiquetas» | 05 › «Proveedores y etiquetas» (bloque Etiquetas) | calcado (fusionada) |
| A.1 #18 | Pestaña «Notas» | 06 › Notas | calcado |
| A.1 #19 | Pestaña «Auditoría» | 06 › «Historial» | calcado (renombrada en 03) |
| A.1 #20 | Toast «Estado actualizado» | 03 › Toasts | calcado |
| A.1 #21 | Toast «Error» / «No se pudo actualizar el estado…» | 03 › Toasts | calcado |
| A.1 #22 | Toast «Producto eliminado» | 03 › Toasts | calcado |
| A.1 #23 | Toast «Error» / «No se pudo eliminar el producto…» | 03 › Toasts | calcado |
| A.1 #24 | Estados (Suspense por pestaña; scroll horizontal de pestañas en móvil) | Cada pestaña tiene «cargando»; móvil: tira desplazable con fundido | calcado; el desborde móvil se resuelve con tira desplazable (sin menú «Más») |
| A.1 (nota) | «Imprimir etiqueta» del diseño anterior | 03 › menú «…» y sheet móvil | Nuevo (no existe impresión de etiquetas) |

## A.2 Cabecera

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.2 #1 | Imagen principal | 03 › Cabecera (galería 200×200) | calcado |
| A.2 #2 | «Sin imágenes» (Package) | 03 › estado Eliminado (servicio); fila de galerías | calcado |
| A.2 #3 | Miniaturas (5, anillo azul en la seleccionada) | 03 › Cabecera; fila de galerías | calcado |
| A.2 #4 | «+{n}» (Ver más imágenes) | 03 › Cabecera («+3») | calcado |
| A.2 #5 | «−» (Ver menos imágenes) | 03 › fila de galerías (galería expandida) | calcado |
| A.2 #6 | Badge Activo / Inactivo / Borrador / Eliminado / Desconocido | 03 › fila «badge de estado» ×5 + estado Eliminado | calcado (Borrador no existe en BD: se dibuja Descontinuado en su lugar, neutral) |
| A.2 #7 | `{producto.name}` (h1) | 03 › Cabecera | calcado |
| A.2 #8 | «SKU:» (mono) | 03 › Cabecera (metadatos) | calcado |
| A.2 #9 | «Categoría:» / «Sin categoría» | 03 › Cabecera; estado Eliminado («Sin categoría») | calcado |
| A.2 #10 | «Unidad:» / «N/A» | 03 › Cabecera; estado Eliminado («N/A») | calcado |
| A.2 #11 | «Proveedor:» / «Sin proveedor» (legado) | 03 › Cabecera; estado Eliminado | calcado |
| A.2 #12 | «Tipo:» Producto / Servicio | 03 › Cabecera (Producto); estado Eliminado (Servicio) | calcado |
| A.2 #13 | «Marca:» | 03 › Cabecera | calcado |
| A.2 #14 | «Ref:» | 03 › Cabecera | calcado |
| A.2 #15 | «Impuesto:» solo el primero, fallback «IVA» | 03 › Cabecera («Impuestos: IVA 19 % · INC 8 %») | sustituido por N chips `{nombre} {tasa}` (regla I.4.1; corrige el fallback «IVA») |
| A.2 #16 | KPI «Precio de venta» | 03 › Cabecera y fila KPI ×4 | calcado |
| A.2 #16a | Tooltip «Precio de venta al público» | 03 › Cabecera · menú abierto (tooltip dibujado) | calcado |
| A.2 #16b | Chip «-{n}%» | 03 › KPI Precio | calcado |
| A.2 #16c | Comparación tachada | 03 › KPI Precio | calcado |
| A.2 #17 | KPI «Costo» | 03 › KPI Costo | calcado |
| A.2 #17a | Tooltip «Costo de adquisición» | 03 › KPI Costo (icono Info + texto de detalle) | calcado |
| A.2 #18 | KPI «Stock» (suma por sucursal global) | 03 › KPI Stock | calcado |
| A.2 #18a | Tooltip «Stock total disponible» / «Inventario sin seguimiento» | 03 › KPI Stock (icono Info; texto en variante «Sin seguimiento») | calcado |
| A.2 #18b | Chip «Sin seguimiento» | 03 › KPI ×4 (variante) y estado Eliminado | calcado |
| A.2 #18c | Skeleton del stock | 03 › KPI ×4 (variante cargando) | calcado |
| A.2 #18d | Chip «Todas las sucursales» / «{sucursal}» | 03 › KPI ×4 (dos variantes) | calcado |
| A.2 #19 | «Descripción» colapsable | 03 › Cabecera («Ver más») | calcado |
| A.2 #20 | Estados (skeleton KPI; error invisible; `reduce` sin inicial) | 03 › KPI cargando; KPI «Sin precio de comparación» | calcado / corregido (no revienta sin precio: A.15 #3) |
| H.1 | «mínimo», «vs. mes anterior», «margen», «vendido N veces», «favorito en POS» del diseño anterior | Retirados de las plantillas y del clon del Resumen | omitido: inventados (no existen en código), retirados |

## A.3 Pestaña «Detalles» (Sheets del Resumen)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.3 #1 | «Información Básica» | 04 › Sheet «Información» | calcado (título del Sheet) |
| A.3 #2 | «Nombre del Producto» | 04 › Sheet «Información» | calcado |
| A.3 #3 | «SKU» (mono) | 04 › Sheet «Información» | calcado |
| A.3 #4 | «Código de Barras» (mono) | 04 › Sheet «Información» | calcado |
| A.3 #5 | ↻ «Generar código de barras» | 04 › Sheet «Información» (IconButton RefreshCw) | calcado |
| A.3 #6 | «Categoría» SearchSelect + 4 textos | 04 › Sheet «Información» + frame «SearchSelect abierto» | calcado |
| A.3 #7 | «Categorías adicionales» + ayuda + chips | 04 › Sheet «Información» (chips toggle) | calcado |
| A.3 #7a | «No hay categorías disponibles» | 04 › frame «Categorías adicionales — vacío» | calcado |
| A.3 #7b | «Ver más ({n} categorías)» / «Ver menos» | 04 › Sheet «Información» | calcado |
| A.3 #8 | «Unidad de Medida» SearchSelect | 04 › Sheet «Información» | calcado |
| A.3 #9 | «Proveedor» SearchSelect (sincroniza `is_preferred`) | 04 › Sheet «Organización y proveedor» | calcado |
| A.3 #10 | «Descripción» RichTextEditor (sin IA) | 04 › Sheet «Información» | calcado |
| A.3 #11 | «Estación de Cocina/Bar» (6 opciones) | 04 › Sheet «Información» | calcado |
| A.3 #12 | «Rastrear inventario» + ayuda | 04 › Sheet «Información» | calcado |
| A.3 #13 | «Tipo de Producto» + «Los servicios no manejan inventario.» | 04 › Sheet «Información» | calcado |
| A.3 #14 | «Marca» | 04 › Sheet «Información» | calcado |
| A.3 #15 | «Referencia» | 04 › Sheet «Información» | calcado |
| A.3 #16 | «Trazabilidad de Seriales y Garantía» + subtítulo | 04 › Sheet «Trazabilidad» | calcado |
| A.3 #17 | «Requiere número de serial» | 04 › Sheet «Trazabilidad» (on) y variante off | calcado |
| A.3 #18 | «Meses de garantía» | 04 › Sheet «Trazabilidad» | calcado |
| A.3 #19 | «Auto-generar seriales» | 04 › Sheet «Trazabilidad» | calcado |
| A.3 #20 | «Patrón de generación» + variables | 04 › Sheet «Trazabilidad» | calcado; constructor de patrón con chips = Nuevo (unifica vocabularios, A.15 #18) |
| A.3 #21 | «Creado: {hace X}» | 04 › Sheet «Información» (pie del cuerpo) | calcado |
| A.3 #22 | «Última modificación: {hace X}» | 04 › Sheet «Información» | calcado |
| A.3 #23 | «Guardar Cambios» / «Guardando...» | 04 › pie del Sheet + frame «Guardando...» | calcado |
| A.3 #24 | Toast «Cambios guardados» | 04 › Toasts | calcado |
| A.3 #25 | Toast «Error al guardar» | 04 › Toasts | calcado |
| A.3 #26 | Estados (sin skeleton de catálogos) | 04 › «Guardando...»; los selects usan el estado del kit | calcado |
| H.1 | Sheet «Imágenes» del Resumen | 04 › Sheet «Imágenes» | calcado (resumen de A.8 con acciones visibles) |
| H.1 | Bloque «Envío» del Resumen | 04 › Sheet «Organización y proveedor» (nota) | omitido: se edita en «Editar producto», no en el detalle |

## A.4 Pestaña «Variantes»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.4 #1 | «Variantes de Producto» | 01 › Variantes (listo) | calcado |
| A.4 #2 | «Nueva Variante» | 01 › Variantes (listo) y móvil | calcado |
| A.4 #3 | Resumen de atributos («Talla:» + badges) | 01 › Variantes (listo) | calcado |
| A.4 #4 | Tabla SKU · Nombre · Atributos · Precio · Costo · Stock · Acciones | 01 › Variantes (listo) | calcado |
| A.4 #4a | Badge «{key}: {val}» / «—» | 01 › tabla (fila 4 muestra «—») | calcado |
| A.4 #4b | «Sin seguimiento» en Stock | 01 › tabla (fila 3) | calcado |
| A.4 #4c | Editar (icono) | 01 › tabla y tarjetas móviles | calcado |
| A.4 #4d | Eliminar (icono rojo) | 01 › tabla y tarjetas móviles | calcado |
| A.4 #5 | AlertDialog «¿Estás seguro?» | 01 › AlertDialog eliminar variante | calcado |
| A.4 #5a | «Cancelar» | 01 › AlertDialog | calcado |
| A.4 #5b | «Eliminar» (borrado físico) | 01 › AlertDialog | calcado (texto real; el borrado físico vs lógico es duda abierta) |
| A.4 #6 | Vacío «Este producto no tiene variantes» + «Crear primera variante» | 01 › Variantes (vacío) | calcado |
| A.4 #7 | Diálogo «Crear nueva variante» / «Editar variante» + descripciones | 01 › dos diálogos + móvil sheet | calcado |
| A.4 #7a | «SKU de Variante» | 01 › diálogo | calcado |
| A.4 #7b | «Nombre de Variante» | 01 › diálogo | calcado |
| A.4 #7c | «Precio» | 01 › diálogo | calcado |
| A.4 #7d | «Costo» | 01 › diálogo | calcado |
| A.4 #7e | «Atributos» | 01 › diálogo | calcado |
| A.4 #7f | `{key}` + Input con datalist | 01 › diálogo (Talla, Color) | calcado |
| A.4 #7g | ＋ «Guardar este valor en el catálogo» | 01 › diálogo (IconButton por atributo) | calcado |
| A.4 #7h | Sugerencias (máx. 12) + «+{n} más (escribe para buscar)» | 01 › diálogo | calcado |
| A.4 #7i | «Agregar atributo» Select «Tipo existente...» | 01 › diálogo | calcado |
| A.4 #7j | Input «Nuevo tipo...» | 01 › diálogo | calcado |
| A.4 #7k | Enter en «Nuevo tipo...» | 01 › diálogo | omitido: atajo de teclado sin representación visual (se documenta aquí) |
| A.4 #7l | ＋ «Crear tipo y guardarlo en el catálogo» | 01 › diálogo | calcado |
| A.4 #7m | «Stock por Sucursal» | 01 › diálogo | calcado |
| A.4 #7n | «Este producto no rastrea inventario» | 01 › frame «estados del bloque Stock por Sucursal» | calcado |
| A.4 #7o | «No hay sucursales disponibles» | 01 › ídem | calcado |
| A.4 #7p | Input por sucursal | 01 › diálogo (Sucursal Principal, Sucursal Norte) | calcado |
| A.4 #7q | «Código de Barras (opcional)» | 01 › diálogo | calcado |
| A.4 #7r | «Cancelar» | 01 › diálogo | calcado |
| A.4 #7s | «Crear Variante» / «Guardar Cambios» → «Guardando» | 01 › diálogos Crear y Editar | calcado |
| A.4 #8 | Toasts (creada, actualizada, eliminada, error) | 01 › Toasts | calcado (muestra) |
| A.4 #9 | Estados (Skeleton colSpan 7; error solo console) | 01 › Variantes (cargando) y (error) | calcado / error sustituido por EmptyState error + «Reintentar» |

## A.5 Pestaña «Modificadores»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.5 #1 | Texto de ayuda «Los modificadores son extras opcionales…» | 01 › Modificadores (listo) | calcado |
| A.5 #2 | Card por grupo (GripVertical sin drag real) | 01 › Modificadores (listo) | calcado (asa dibujada; reordenar = Nuevo) |
| A.5 #2a | Select «Única (radio)» / «Múltiple (checkbox)» | 01 › card de grupo | calcado |
| A.5 #2b | «Obligatorio» (Switch) | 01 › card de grupo | calcado |
| A.5 #2c | Borrar grupo (`confirm()` nativo) | 01 › ConfirmDialog «¿Eliminar este grupo de modificadores y todas sus opciones?» | sustituido por ConfirmDialog del kit (regla I.4.4) |
| A.5 #2d | Opción «{name}» + «+$N» / «Gratis» | 01 › card de grupo | calcado |
| A.5 #2e | Borrar opción sin confirmación | 01 › ConfirmDialog «¿Eliminar la opción «BBQ»?» | sustituido por ConfirmDialog (hoy sin confirmación) |
| A.5 #2f | Sugerencias de valores de variantes | 01 › card «Salsas» (chips Grande, Pequeño) | calcado |
| A.5 #2g | Input «Nueva opción (ej. BBQ)» | 01 › card de grupo | calcado |
| A.5 #2h | Input «Precio extra» | 01 › card de grupo | calcado |
| A.5 #2i | ＋ crear opción | 01 › card de grupo («Añadir») | calcado |
| A.5 #3 | «Nuevo grupo de modificadores» (borde discontinuo) | 01 › Modificadores (listo) | calcado |
| A.5 #3a | «Grupos existentes en tu catálogo, haz clic para reutilizar:» | 01 › card Nuevo grupo | calcado |
| A.5 #3b | Píldoras de grupos existentes | 01 › card Nuevo grupo | calcado |
| A.5 #3c | Input «Nombre (ej. Salsas)» | 01 › card Nuevo grupo | calcado |
| A.5 #3d | Select modo (default Múltiple) | 01 › card Nuevo grupo | calcado |
| A.5 #3e | «Agregar» (disabled si vacío) | 01 › card Nuevo grupo | calcado |
| A.5 #4 | Toasts de error | 01 › Toasts; Modificadores (error) | calcado |
| A.5 #5 | Estados (Skeleton min-h-screen; vacío sin mensaje) | 01 › Modificadores (cargando) y (vacío) | sustituido: Skeleton acotado a la pestaña (A.15 #6) y EmptyState compacto sobre la card |
| A.5 (nota) | Mín./Máx. selecciones por grupo | 01 › card de grupo | Nuevo |
| A.5 (nota) | Editar y reordenar opción | 01 › card de grupo (lápiz y asa por opción) | Nuevo |

## A.6 Pestaña «Stock»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.6 #1 | «Inventario sin seguimiento» + texto | 07 › Stock (sin seguimiento) | calcado |
| A.6 #2 | KPI «Stock Total» + «En la sucursal seleccionada» / «En todas las sucursales» | 07 › Stock (listo) y (sucursal seleccionada) | calcado |
| A.6 #3 | KPI «Reservado» — «En procesos de venta» | 07 › Stock (listo) | calcado |
| A.6 #4 | KPI «Disponible» — «Para la venta» | 07 › Stock (listo) | calcado |
| A.6 #5 | «Registrar Entrada» | 07 › Stock (listo) y móvil | calcado |
| A.6 #6 | «Registrar Salida» | 07 › Stock (listo) y móvil | calcado |
| A.6 #7 | «Ver Historial» | 07 › Stock (listo) y móvil | calcado |
| A.6 #8 | Tabla Sucursal · En Existencia · Reservado · Disponible · Acciones | 07 › Stock (listo) | calcado |
| A.6 #8a | ↑ Entrada por fila | 07 › tabla | calcado |
| A.6 #8b | ↓ Salida por fila | 07 › tabla | calcado |
| A.6 #9 | Toast «No se pudo cargar la información de inventario» | 07 › Stock (error) | calcado |
| A.6 #10 | Estados (Skeleton colSpan 5; vacío «No hay sucursales configuradas para mostrar stock») | 07 › Stock (cargando) y (sin sucursales) | calcado |
| H.1 | Mínimo · Costo prom. · Actualizado · Transferir (fila y global) · Lotes · Kardex | 07 › Stock (listo), sub-pestañas | Nuevo (marcados) |

## A.7 Pestaña «Seriales»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.7 #1 | «Este producto no requiere seriales» + texto largo | 02 › Seriales (sin track_serial) | calcado |
| A.7 #2 | «Editar producto» | 02 › Seriales (sin track_serial) | calcado |
| A.7 #3 | Tarjeta resumen (nombre · SKU · Precio · Costo) | 02 › Seriales (listo) | calcado; Precio/Costo se muestran con valor real (corrige A.15 #10) |
| A.7 #4 | Badge «Trazabilidad activa» | 02 › Seriales (listo) y móvil | calcado |
| A.7 #5 | Badge «Auto-generación» | 02 › ídem | calcado |
| A.7 #6 | Badge «{n} meses garantía» | 02 › ídem | calcado |
| A.7 #7 | Badge «Patrón: {serial_pattern}» | 02 › ídem | calcado |
| A.7 #8 | «Generar seriales» | 02 › Seriales (listo) y móvil | calcado |
| A.7 #9 | «Stock total: N unidades · Seriales generados: N» | 02 › Seriales (listo) | calcado |
| A.7 #10 | Badge «{n} sin serial» (ámbar) | 02 › Seriales (listo) y móvil | calcado |
| A.7 #11 | Stat «Total» | 02 › Seriales (listo) | calcado |
| A.7 #12 | Stat «En stock» (punto verde) | 02 › Seriales (listo) | calcado |
| A.7 #13 | Stat «Reservados» (punto azul) | 02 › Seriales (listo) | calcado |
| A.7 #14 | Stat «Vendidos» (punto morado) | 02 › Seriales (listo) | calcado (variable `violet/500` nueva) |
| A.7 #15 | Buscador «Buscar por número de serial...» | 02 › Seriales (listo) (SearchBar con escáner) | calcado |
| A.7 #16 | Select «Todos los estados» → 8 estados | 02 › Seriales (listo); (vacío con filtros) muestra «Dañado» | calcado |
| A.7 #17 | «Exportar» (CSV) | 02 › Seriales (listo) | calcado |
| A.7 #18 | Tabla 8 col (Serial · Estado · Garantía · Costo compra · Precio venta · Cliente · Fecha recepción · acciones) | 02 › Seriales (listo) | calcado |
| A.7 #19 | Fila clicable → detalle del serial | 02 › tabla (icono ExternalLink por fila) | calcado |
| A.7 #20 | Chip de estado con 8 colores | 02 › tabla (10 filas cubren los 8 estados); componente `EstadoSerial` | calcado |
| A.7 #21 | Garantía «{inicio} → {fin}» / «—»; Costo/Precio / «—»; Cliente / «N/A»; Fecha | 02 › tabla | calcado |
| A.7 #22 | «Reclamo» (ShieldCheck ámbar) en vendidos | 02 › tabla (filas Vendido) y tarjeta móvil | calcado |
| A.7 #23 | Icono ExternalLink decorativo | 02 › tabla | calcado |
| A.7 #24 | «Mostrando {a} a {b} de {n} seriales» + Select tamaño | 02 › Seriales (listo) (Pagination del kit, «10 por página») | calcado |
| A.7 #25 | «Previous» / «Next» en inglés | 02 › Pagination del kit (iconos, sin texto en inglés) | sustituido por Pagination del kit (A.15 #16) |
| A.7 #26 | Diálogo «Generar seriales masivamente» + descripción con patrón | 02 › dos diálogos + móvil sheet | calcado |
| A.7 #27 | «Cantidad de seriales a generar» | 02 › diálogo | calcado |
| A.7 #28 | «Stock en sucursal: N · Seriales existentes: N» · «Faltan N seriales» | 02 › diálogo (con sucursal) | calcado |
| A.7 #29 | «Seleccione una sucursal para continuar» | 02 › diálogo (sin sucursal) | calcado |
| A.7 #30 | «Generar los {n} seriales faltantes» | 02 › diálogo | calcado |
| A.7 #31 | Select «Sucursal destino *» → «{branch} (Stock: n · Faltan: n)» | 02 › diálogo | calcado |
| A.7 #32 | Ayuda «La sucursal es obligatoria…» | 02 › diálogo | calcado |
| A.7 #33 | Aviso verde «Cada serial tendrá {n} meses de garantía desde hoy.» | 02 › diálogo | calcado |
| A.7 #34 | «Cancelar» | 02 › diálogo | calcado |
| A.7 #35 | «Generar {n} seriales» / «Generando...» + 4 toasts | 02 › diálogo y Toasts | calcado |
| A.7 #36 | `CreateClaimDialog` | 02 › 4 frames (ver A.14) | calcado |
| A.7 (estados) | Cargando (5 Skeleton) · vacío · vacío con filtros · error | 02 › 4 frames de estado | calcado |
| H.1 | Filtro «Sucursal» | 02 › Seriales (listo) | Nuevo (marcado) |
| A.7 (nota) | Acciones por fila (cambiar estado, dañado, transferir), impresión de etiqueta de serial, lotes | — | omitido: no existen en código y no se pidieron como nuevos |

## A.8 Pestaña «Imágenes»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.8 #1 | «Imágenes del Producto ({n})» | 05 › Imágenes (listo) | calcado |
| A.8 #2 | «Subir Imágenes» / «Subiendo...» | 05 › Imágenes (listo) y (cargando / subiendo) | calcado; límite de cantidad/tamaño = Nuevo |
| A.8 #3 | Grid 2/3/4/5 columnas | 05 › Imágenes (listo) (5 col) y móvil (2 col) | calcado |
| A.8 #4 | Borde azul + ring en la principal | 05 › Imágenes (listo) | calcado |
| A.8 #5 | Miniatura clicable → Vista previa | 05 › Imágenes (listo) | calcado |
| A.8 #6 | «Ver» (hover) | 05 › acciones visibles bajo cada imagen | sustituido: acciones siempre visibles (A.15 #12) |
| A.8 #7 | «Principal» ★ (hover) | 05 › ídem | sustituido: visible |
| A.8 #8 | «Eliminar» (hover) | 05 › ídem | sustituido: visible |
| A.8 #9 | Diálogo «¿Estás seguro de eliminar esta imagen?» + texto | 05 › AlertDialog eliminar imagen | calcado |
| A.8 #10 | «Cancelar» | 05 › AlertDialog | calcado |
| A.8 #11 | «Eliminar» / «Eliminando...» | 05 › AlertDialog | calcado |
| A.8 #12 | «Vista previa» | 05 › diálogo «Vista previa» | calcado |
| A.8 #13 | Fallback «Sin imagen» | 05 › Imágenes (listo) (cuarta miniatura) | calcado |
| A.8 (estados) | Cargando · vacío «Sin imágenes» · error | 05 › 3 frames | calcado |
| A.8 (nota) | alt_text, reordenar (asa), límite 5 | 05 › Imágenes (listo) | Nuevo (marcados) |
| A.8 (nota) | Cámara en móvil, arrastrar y soltar, «Generar con IA» | — | omitido: no existen en el detalle y no se pidieron |

## A.9 Pestaña «Precios»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.9 #1 | Card «Precio Actual» — «Último precio establecido» | 07 › Precios (listo) y móvil | calcado |
| A.9 #2 | Chip «-{n}%» | 07 › card Precio Actual | calcado |
| A.9 #3 | Comparación tachada | 07 › card Precio Actual | calcado |
| A.9 #4 | «Actualizar Precio» | 07 › Precios (listo) y móvil | calcado |
| A.9 #5 | Diálogo «Actualizar precio» + descripción | 07 › diálogo | calcado |
| A.9 #6 | «Precio Actual» (disabled, siempre $0) | 07 › diálogo (muestra el precio vigente real) | sustituido: valor real (A.15 #10) |
| A.9 #7 | «Nuevo Precio» | 07 › diálogo | calcado |
| A.9 #8 | «Precio de Comparación (opcional)» + ayuda | 07 › diálogo | calcado |
| A.9 #9 | «Cancelar» | 07 › diálogo | calcado |
| A.9 #10 | «Guardar Precio» / «Guardando» + toasts | 07 › diálogo y Toasts | calcado |
| A.9 #11 | «Evolución de Precios» (gráfico vacío) | 07 › Precios (listo) (gráfico de líneas real) | sustituido: gráfico real (A.15 #11) |
| A.9 #12 | Tabla Válido Desde · Válido Hasta · Precio · Comparación · Descuento · Cambio % | 07 › Precios (listo) | calcado |
| A.9 #13 | Fecha con Calendar; «Vigente» | 07 › tabla | calcado (fechas en tz de la org: A.15 #14) |
| A.9 #14 | Comparación tachada / «—» | 07 › tabla | calcado |
| A.9 #15 | «-{n}%» / «—» | 07 › tabla | calcado |
| A.9 #16 | «+{x}%» verde / «{-x}%» rojo / «0.00%» gris | 07 › tabla | calcado |
| A.9 (estados) | Cargando (colSpan corregido) · vacío «No hay registro de cambios de precio» · error | 07 › 3 frames | calcado |
| H.1 | «Actualizar costo» / historial de costos | 07 › Precios (listo) | Nuevo (marcado) |

## A.10 Pestaña «Proveedores»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.10 #1 | «Proveedores del Producto» + subtítulo | 05 › Proveedores y etiquetas (listo) | calcado |
| A.10 #2 | «Agregar Proveedor» (disabled sin proveedores libres) | 05 › (listo) y (error, deshabilitado) | calcado |
| A.10 #3 | Tabla 7 col | 05 › (listo) | calcado |
| A.10 #4 | Nombre + «NIT: {nit}» | 05 › tabla | calcado |
| A.10 #5 | Costo, «{n} días», mínimo, SKU mono / «—» | 05 › tabla | calcado |
| A.10 #6 | ★ / ☆ preferido | 05 › tabla y tarjetas móviles | calcado |
| A.10 #7 | Editar | 05 › tabla | calcado |
| A.10 #8 | Eliminar | 05 › tabla | calcado |
| A.10 #9 | AlertDialog «¿Eliminar proveedor?» — «Se desvinculará a {name} de este producto.» | 05 › AlertDialog proveedor | calcado |
| A.10 #10 | Diálogo «Agregar Proveedor» / «Editar Proveedor» + descripciones | 05 › dos diálogos | calcado |
| A.10 #11 | Select «Proveedor *» (sin búsqueda ni crear) | 05 › «Agregar Proveedor» | calcado |
| A.10 #12 | «Proveedor» solo lectura en editar | 05 › «Editar Proveedor» | calcado |
| A.10 #13 | «Costo» | 05 › diálogos | calcado |
| A.10 #14 | «Días de Entrega» | 05 › diálogos | calcado |
| A.10 #15 | «Pedido Mínimo» | 05 › diálogos | calcado |
| A.10 #16 | «SKU del Proveedor» | 05 › diálogos | calcado |
| A.10 #17 | Textarea «Notas» | 05 › diálogos | calcado |
| A.10 #18 | «Cancelar» | 05 › diálogos | calcado |
| A.10 #19 | «Agregar» / «Guardar Cambios» / «Guardando» + 5 toasts | 05 › diálogos y Toasts | calcado |
| A.10 (estados) | Cargando · vacío «Este producto no tiene proveedores asignados» + «Agregar primer proveedor» · error (solo console) | 05 › 3 frames | calcado / error sustituido por EmptyState error |

## A.11 Pestaña «Etiquetas»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.11 #1 | «Etiquetas del Producto ({n})» | 05 › bloque Etiquetas | calcado |
| A.11 #2 | «Buscar Etiquetas» | 05 › bloque Etiquetas | calcado |
| A.11 #3 | × limpiar | 05 › bloque Etiquetas (input con texto «V») | calcado (icono del input) |
| A.11 #4 | Dropdown a mano (punto color + nombre + ＋) | 05 › bloque Etiquetas (dropdown abierto) | sustituido por MultiSelect del kit con teclado y «sin resultados» |
| A.11 #5 | «Crear Nueva Etiqueta» | 05 › bloque Etiquetas | calcado |
| A.11 #6 | «Crear» (color aleatorio) | 05 › bloque Etiquetas | calcado; selector de color = Nuevo |
| A.11 #7 | «Etiquetas Asignadas» | 05 › bloque Etiquetas | calcado |
| A.11 #8 | Píldora (punto color) + × | 05 › bloque Etiquetas y móvil | calcado |
| A.11 #9 | Panel «¿Para qué sirven las etiquetas?» + 4 viñetas | 05 › bloque Etiquetas | calcado |
| A.11 (estados) | Cargando · vacío «Sin etiquetas» · error toast | 05 › (cargando) · (vacío) · (error) | calcado |

## A.12 Pestaña «Notas»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.12 #1 | Card «Nueva Nota» | 06 › Notas (listo) y móvil | calcado |
| A.12 #2 | Textarea «Escribe una nota o comentario sobre este producto...» | 06 › Notas (listo) | calcado |
| A.12 #3 | «Archivos seleccionados:» (no se pueden quitar) | 06 › Notas (listo) | calcado; quitar archivo (×) = Nuevo |
| A.12 #4 | «Adjuntar archivos» | 06 › Notas (listo) | calcado |
| A.12 #5 | «Guardar Nota» / «Guardando...» / «Subiendo archivos...» | 06 › Notas (listo) + frame de estados | calcado |
| A.12 #6 | «Historial de Notas ({n})» | 06 › Notas (listo) | calcado |
| A.12 #7 | Card por nota (avatar, nombre, rol «usuario» fijo, email, fecha) | 06 › Notas (listo) | calcado; rol real por usuario (sustituye el literal fijo) |
| A.12 #8 | Eliminar (icono rojo) | 06 › card de nota | calcado |
| A.12 #9 | AlertDialog «¿Eliminar nota?» + texto | 06 › AlertDialog nota | calcado |
| A.12 #10 | Contenido `pre-wrap` | 06 › card de nota | calcado |
| A.12 #11 | «Archivos adjuntos:» (invisibles tras recargar) | 06 › card de nota | sustituido: adjuntos de BD visibles (A.15 #13) |
| A.12 #12 | Descargar adjunto | 06 › card de nota | calcado |
| A.12 (estados) | Cargando · vacío «Sin notas» · error | 06 › 3 frames | calcado |

## A.13 Pestaña «Auditoría» (Historial)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.13 #1 | «Historial de Cambios ({n})» | 06 › Historial (listo) | calcado |
| A.13 #2 | Tabla Fecha · Usuario · Acción · Cambios (limit 100) | 06 › Historial (listo) | calcado; paginación = Nuevo (A.15 #17) |
| A.13 #3 | Fecha `dd MMM yyyy, HH:mm` | 06 › tabla | calcado (tz de la org) |
| A.13 #4 | Avatar + nombre / «Usuario desconocido» | 06 › tabla (fila 5) | calcado |
| A.13 #5 | Badges Creación / Actualización / Eliminación / otro | 06 › tabla (fila «restore» = otro, gris) | calcado |
| A.13 #6 | «{Campo}: {viejo} → {nuevo}» / «Producto creado» / «No hay detalles» … | 06 › tabla | calcado |
| A.13 #7 | `title` nativo con el texto completo | 06 › nota en el frame | sustituido por Tooltip del kit |
| A.13 #8 | Panel «Acerca de la Auditoría» + texto | 06 › Historial (listo) y (vacío) | calcado |
| A.13 (estados) | Cargando · vacío «Sin historial» · error | 06 › 3 frames | calcado |
| H.1 | Filtros (usuario, acción, fecha) y paginación | 06 › Historial (listo) | Nuevo (marcados) |

## A.14 `CreateClaimDialog`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.14 #1 | «Nuevo Reclamo de Garantía» + descripción | 02 › 4 diálogos de reclamo | calcado |
| A.14 #2 | «Buscar serial» (solo sin preselección) | 02 › modo búsqueda | calcado |
| A.14 #3 | «Buscando...» | 02 › modo búsqueda (nota) | calcado (texto) |
| A.14 #4 | «No se encontraron seriales.» | 02 › modo búsqueda (nota) | calcado (texto) |
| A.14 #5 | Lista de resultados (serial · producto · badge estado) | 02 › modo búsqueda | calcado |
| A.14 #6 | Tarjeta «Serial» + ShieldCheck | 02 › preseleccionado y sin cliente | calcado |
| A.14 #7 | «Cambiar» (solo sin preselección) | 02 › (desde Seriales no aparece; se documenta) | calcado (ausente por preselección) |
| A.14 #8 | Producto (Package) «{name} — SKU · marca» | 02 › tarjeta | calcado |
| A.14 #9 | Cliente (User) + teléfono / email | 02 › preseleccionado | calcado |
| A.14 #10 | Aviso «Este serial no tiene cliente asociado (no ha sido vendido)» | 02 › sin cliente | calcado |
| A.14 #11 | Badge «Vigente ({n} días)» / «Vencida» / «Sin garantía» | 02 › preseleccionado (Vigente) y sin cliente (Sin garantía) | calcado («Vencida» = misma badge danger, no dibujada aparte) |
| A.14 #12 | «Fecha de venta: {fecha}» | 02 › preseleccionado | calcado |
| A.14 #13 | «Motivo del reclamo *» | 02 › diálogos | calcado |
| A.14 #14 | «Descripción (opcional)» RichTextEditor | 02 › diálogos | calcado |
| A.14 #15 | «Cancelar» | 02 › diálogos | calcado |
| A.14 #16 | «Crear Reclamo» / «Creando...» + toasts | 02 › diálogos y Toasts | calcado |
| A.14 (estados) | Cargando (2 Skeleton) · error toast | 02 › diálogo «cargando» | calcado |

## A.15 Lo roto (no se calca)

| # | Hallazgo | Cómo se resolvió en Figma |
|---|---|---|
| 1 | «Transferir» sin preselección | Nota en 07 › Stock: el botón lleva el producto preseleccionado |
| 2 | `confirm()` nativo y borrado sin confirmar | 01 › dos ConfirmDialog |
| 3 | Cabecera revienta sin precio | 03 › KPI «Sin precio de comparación» |
| 5 | Editar habilitado con `deleted`; pestañas visibles sin sentido | 03 › estado Eliminado (Editar/Eliminar deshabilitados); Stock/Seriales muestran sus vacíos |
| 6 | Skeleton `min-h-screen` | 01 › Modificadores (cargando) acotado |
| 10 | `producto.price/cost` inexistentes | 02 › resumen con precio/costo reales; 07 › «Precio Actual» real |
| 11 | Gráfico vacío | 07 › gráfico real |
| 12 | Acciones de imagen solo hover | 05 › acciones visibles |
| 13 | Adjuntos invisibles | 06 › adjuntos visibles con descarga |
| 14 | Fechas sin tz | Notas en 07 y 06: `formatDateInTz` |
| 16 | Paginación en inglés; colSpan | 02 › Pagination del kit; 07 › Skeleton con colSpan 6 |
| 17 | Auditoría sin paginación | 06 › paginación (Nuevo) |
| 18 | Dos vocabularios de patrón | 04 › constructor de patrón unificado (Nuevo) |

## C. Catálogo (H.3)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.2 #1 | «Importar desde CSV» | 08 › menú «…» abierto | calcado |
| C.2 #2 | «Importar desde web (IA)» | 08 › menú «…» abierto | calcado |
| C.2 #3 | separador | 08 › menú «…» abierto | calcado |
| C.2 #4 | «Exportar a CSV» | 08 › menú «…» abierto | calcado |
| C.2 #5 | «Exportar a Facebook (CSV)» | 08 › menú «…» abierto + nota | calcado (nota: vive también en MetaSyncDialog › Exportar) |
| C.2 #6 | «URL Feed para Facebook» | 08 › menú «…» abierto + nota | calcado (nota: MetaSyncDialog › Feed) |
| C.2 (toasts) | Exportar CSV / Facebook | — | omitido: toasts del kit ya dibujados en 03 (Toast ×5 variantes); sin frame propio |
| H.3 | «Imprimir etiquetas», «Códigos de barras», «Configurar columnas» | 08 › nota ámbar | Nuevo / pendiente de decisión (pregunta 4 del inventario) |
| C.4 #1 | Checkbox de cabecera (sin indeterminado) | 08 › menú de selección (tooltip) | sustituido por TableCell checkbox-mixed del kit |
| C.4 #2 | ▾ «Opciones de selección» | 08 › menú de selección abierto | calcado |
| C.4 #3 | «Seleccionar esta página ({N})» | 08 › menú de selección | calcado |
| C.4 #4 | «Seleccionar todos ({N})» | 08 › menú de selección | calcado |
| C.4 #5 | separador | 08 › menú de selección | calcado |
| C.4 #6 | «Limpiar selección ({N})» (rojo) | 08 › menú de selección | calcado |
| C.4 #7 | Checkbox por fila | 08 › (ya en 03 › Catálogo — selección) | calcado en 03 |
| C.4 #8 | Fila seleccionada `bg-blue-50` | 08 › (ya en 03 › Catálogo — selección) | calcado en 03 |
| C.5 #1 | ⋯ «Abrir menú» | 08 › menú ⋯ por fila abierto | calcado |
| C.5 #2 | «Ver detalle» | 08 › menú ⋯ | calcado |
| C.5 #3 | «Editar» | 08 › menú ⋯ | calcado |
| C.5 #4 | «Duplicar» | 08 › menú ⋯ | calcado |
| C.5 #5 | separador | 08 › menú ⋯ | calcado |
| C.5 #6 | «Eliminar» (rojo) | 08 › menú ⋯ | calcado |
| C.5 #7 | Clic en la fila = Ver detalle | 08 › (comportamiento) | omitido: interacción sin representación visual; documentada aquí |
| C.5 #8 | Miniatura como enlace | 08 › (ya en 03 › Catálogo) | calcado en 03 |
| H.3 / C.7 | Menú «Estado» masivo (Activar · Desactivar · Descontinuar) + confirmación | 08 › menú «Estado» masivo abierto + ConfirmDialog | calcado (menú) / Nuevo (confirmación) |

## Conteo

| Estado (primera palabra de la columna 4) | Filas |
|---|---|
| calcado | 298 (de ellas, 13 llevan además un añadido marcado «Nuevo» en la misma fila) |
| Nuevo | 9 |
| sustituido por … | 16 |
| omitido (con motivo) | 7 |
| **Total** | **330** |

Los 7 omitidos son: atajo Enter (A.4 #7k), acciones/impresión/lotes de seriales no existentes,
cámara/arrastrar/IA de imágenes no existentes, bloque «Envío» (se edita en Editar producto), toasts
de exportación del catálogo (cubiertos por el Toast del kit), clic-en-fila (interacción), KPI
inventados del diseño anterior (retirados) — ninguno deja fuera un control real del código.

## Dudas abiertas para el dueño (máx. 5)

1. **Borrado de variantes**: el código borra la variante físicamente (`products.delete`) mientras el
   padre se marca `deleted`. El AlertDialog calca el texto real («permanentemente»); ¿se cambia a
   borrado lógico?
2. **«Imprimir etiqueta»** en el menú «…» del detalle y en el sheet móvil: está marcado «Nuevo» (no
   existe impresión de etiquetas). ¿Se implementa o se retira?
3. **Colores nuevos**: para los 8 estados de serial se añadieron las variables `violet/*`, `pink/*` y
   `orange/*` (Light = Dark, como el resto de la colección) en `01 Sistema › Color`. ¿Se aceptan
   como parte del sistema o se remapean a la paleta existente?
4. **Fusión de pestañas**: se conservó la estructura de 8 pestañas de `03` (Variantes y
   Modificadores, Stock y Seriales, Proveedores y Etiquetas fusionadas con sub-pestañas). ¿Se
   mantiene o se vuelve a las 11 pestañas del código?
5. **Capturas**: el MCP de Figma limita las exportaciones a 1024 px de ancho, por lo que los PNG
   `10-producto-*.png` son de referencia (secciones completas + 21 frames clave). Para PNG a escala 1
   hay que exportar desde Figma (seleccionar la Sección › Export › 1x).
