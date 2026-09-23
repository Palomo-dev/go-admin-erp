# Auditoría control por control — Kardex y Lotes

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`, página `04 Inventario`). Kardex y Lotes existen en el código como
páginas propias desde hace meses, **nunca se auditaron ni se diseñaron**, y en el detalle de
producto solo está dibujada la etiqueta de sus dos sub-pestañas (`199:17255` «Lotes» y
`199:17258` «Kardex», ambas con badge «Nuevo»), sin contenido. Este documento baja al mismo
nivel que `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`: **cada control** —botón, menú,
pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado— con su etiqueta
exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Lectura de código; verificación de esquema, triggers, políticas RLS,
funciones y **datos reales** con `SELECT` de solo lectura por el MCP de Supabase
(`jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente. Rutas relativas a `src/`
salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
ni Kardex ni Lotes pasan por `messages/es.json` —cero claves—, así que los textos se citan tal
cual, con sus mayúsculas de título («Total Entradas», «Nuevo Lote», «Costo Unit.») que no siguen
la norma del resto del sistema. **Cuándo aparece**: «Siempre» = incondicional dentro de su
pantalla; breakpoints Tailwind (`xs` 475 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Kardex (página) · B. Lotes (página) · C. Sub-pestañas del detalle de producto ·
D. Qué es de verdad un movimiento de kardex · E. La cadena completa por origen · F. Saldo
acumulado y costo promedio · G. Lotes: qué guarda y qué pasa al vender · H. Esquema, RLS y
columnas que existen y no se muestran · I. Lo roto o sin efecto · J. Qué falta para que sirvan ·
K. Propuesta de base de datos · L. Componentes compartidos · M. Conteo de controles.

---

## A. Kardex — `/app/inventario/kardex`

Archivos: `app/app/inventario/kardex/page.tsx` (309 líneas), `components/inventario/kardex/`
(`KardexHeader` 80, `KardexStats` 81, `KardexFilters` 166, `KardexTable` 227),
`lib/services/kardexService.ts` (314).

**Primer hecho, y manda sobre todo lo demás: el kardex NO es una página de listado.** Exige
`?producto=<id>` en la URL (`kardex/page.tsx:33-34`). Sin ese parámetro la pantalla entera se
sustituye por un párrafo gris centrado (`:234-240`). No hay buscador de producto, no hay forma
de llegar desde la propia pantalla a otro producto, y **el único enlace de toda la aplicación
que la abre** es el botón «Ver Historial» de la pestaña Stock del detalle
(`components/inventario/productos/id/tabs/StockTab.tsx:174`). No está en el menú lateral
(`components/app-layout/Sidebar/SidebarNavigation.tsx`, `AppLayout.tsx`), ni en
`lib/config/modulePages.ts`, ni en los accesos rápidos del panel de inventario
(`components/inventario/dashboard/AccesosRapidos.tsx`). Es una pantalla escondida.

### A.0 Estados de la página

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (esqueleto) | `PageHeaderSkeleton` + `DetailSkeleton` a pantalla completa | `loadingOrg \|\| isLoading` | `kardex/page.tsx:224-231` |
| 2 | estado | «No se especificó un producto» | Párrafo gris centrado. **Sin acción, sin cabecera, sin salida**: callejón sin salida | `!productId` | `:234-240` |
| 3 | estado | «Producto no encontrado» | Ídem, también sin acción | `!productInfo` | `:243-249` |
| 4 | estado | (sin estado de error de página) | Un fallo de red no tiene pantalla: `refreshData` traga el error en un toast y deja la tabla anterior | Nunca visible como estado | `:109-118` |

### A.1 Cabecera — `KardexHeader`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 5 | badge | (caja azul con `ScrollText`) | Icono de pantalla, dibujado a mano con `bg-blue-100` en vez de la variable de marca | Siempre | `KardexHeader.tsx:28-30` |
| 6 | texto | «Kardex de Producto» | Título `h1`. Mayúscula de título no normativa | Siempre | `:32-34` |
| 7 | texto | `{productName} · SKU: {productSku}` | Subtítulo | Siempre | `:35-37` |
| 8 | botón | «Volver al Producto» | `Link` a `/app/inventario/productos/{uuid}` | Solo si `productUuid` existe | `:42-53` |
| 9 | botón | «Actualizar» | `onRefresh` → recarga entradas y KPI. Icono gira mientras carga | Siempre | `:55-64` |
| 10 | botón | «Exportar» | `onExport` → CSV. **Exporta solo la página visible** (ver I.4) | Siempre | `:66-74` |
| 11 | — | (sin migas) | La pantalla no dibuja `Breadcrumbs` pese a ser un módulo, no el POS | — | `KardexHeader.tsx` completo |

### A.2 Ámbito de sucursal

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 12 | badge | `<BranchBadge />` | Badge de sucursal activa, suelto debajo de la cabecera en vez de dentro de ella | Siempre | `kardex/page.tsx:265` |
| 13 | cálculo | (sincronización) | El filtro local de sucursal se reescribe desde `BranchContext` en cada cambio del header | Siempre | `:60-62` |

### A.3 KPI — `KardexStats`

Cuatro tarjetas dibujadas a mano (`Card` + `CardContent`), no `StatCard` del kit.
Mientras `isRefreshing` el valor se sustituye por el literal `'...'` (`KardexStats.tsx:70`),
no por un `Skeleton`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 14 | stat | «Total Entradas» | Suma de `qty` de los movimientos `direction='in'` del **conjunto filtrado** | Siempre | `KardexStats.tsx:23-29` · `kardexService.ts:203-212` |
| 15 | stat | «Total Salidas» | Ídem con `direction='out'` | Siempre | `:30-36` |
| 16 | stat | «Saldo Actual» | `totalIn − totalOut`. **No es el saldo actual**: es el neto del rango filtrado | Siempre | `:37-43` · `kardexService.ts:216` |
| 17 | stat | «Valor Inventario» | `formatCurrency(valueIn − valueOut)`. Suma precios de venta con costos (ver E.1) y siempre en COP | Siempre | `:44-50` |

### A.4 Filtros — `KardexFilters`

Tarjeta siempre abierta, no `FilterButton` + `FilterPanel`. No hay buscador.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 18 | texto | «Filtros» | Rótulo con icono `Filter` | Siempre | `KardexFilters.tsx:57-60` |
| 19 | campo | «Todas las sucursales» | `Select` de sucursal. **Filtro propio de sucursal**, prohibido por el patrón 9 | Siempre | `:64-76` |
| 20 | campo | «Todos los orígenes» | `Select` con 9 orígenes de 14 posibles (ver H.2) | Siempre | `:79-91` |
| 21 | campo | «Entradas y Salidas» / «Solo Entradas» / «Solo Salidas» | `Select` de dirección | Siempre | `:94-103` |
| 22 | campo | «Desde» | `Popover` + `Calendar` (`dd/MM/yyyy`, locale `es`) | Siempre | `:108-127` |
| 23 | campo | «Hasta» | Ídem | `:129-148` |
| 24 | botón | «Limpiar filtros» | Devuelve los 5 filtros a su valor por defecto y vuelve a la página 1 | Solo con `hasActiveFilters` | `:150-160` · `page.tsx:183-197` |
| 25 | — | (sin chips de filtros activos) | Lo activo no se ve fuera del propio `Select` | — | — |

### A.5 Contador y tabla — `KardexTable`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 26 | texto | «Mostrando {n} de {total} movimientos» (+ « (página X de Y)») | Contador propio, duplicado del resumen de la paginación | Siempre | `page.tsx:289-292` |
| 27 | estado | (esqueleto de tabla) | 10 columnas × 5 filas de `div` animados, no `Skeleton` del kit | `isRefreshing` | `KardexTable.tsx:76-105` |
| 28 | estado | «No hay movimientos registrados» / «No se encontraron movimientos con los filtros aplicados» | Vacío dibujado a mano con icono `Package`. **Sin acción** | `data.length === 0` | `:107-119` |
| 29 | tabla | «Fecha» | Fecha con `useFormatDate()` + hora con `formatTimeInTz` en segunda línea. Correcto respecto al huso | listo | `:127-129`, `:166-175` |
| 30 | tabla | «Dirección» | Badge «Entrada» (verde, `ArrowDownCircle`) / «Salida» (rojo, `ArrowUpCircle`) | listo | `:130-132`, `:176-188` |
| 31 | tabla | «Cantidad» | `+n` / `−n` según dirección, alineado a la derecha | listo | `:133-135`, `:189-191` |
| 32 | tabla | «Costo Unit.» | `formatCurrency(unit_cost)`. En ventas del POS es el **precio de venta** (E.1) | listo | `:136-138`, `:192-194` |
| 33 | tabla | «Valor Total» | `unit_cost × qty` calculado en el cliente | listo | `:139-141`, `:195-197` |
| 34 | tabla | «Saldo» | **Saldo acumulado**, calculado en el navegador (ver F.1). Azul si > 0, rojo si < 0 | listo | `:142-144`, `:198-200`, `:64-68` |
| 35 | tabla | «Origen» | Badge de color por origen, 12 etiquetas en el mapa | listo | `:145-147`, `:201-205`, `:28-62` |
| 36 | tabla | «Sucursal» | `branches.name` del `join`; «-» si falta | listo | `:148-150`, `:206-208` |
| 37 | tabla | «Documento» | **Imprime el UUID crudo de `source_id`**, sin enlace y sin formato. «-» si es nulo | listo | `:151-153`, `:209-211` |
| 38 | tabla | «Nota» | Texto truncado a 200 px con `title` nativo (tooltip solo de navegador) | listo | `:154-156`, `:212-216` |
| 39 | — | (sin columna de acciones, sin menú «⋯», sin selección) | La fila no abre nada ni ofrece nada | — | — |

### A.6 Paginación y avisos

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 40 | paginación | `DataTablePagination` | 10 / 25 / 50 / 100. **Paginación falsa**: la consulta trae todo y corta en JavaScript (I.1) | Siempre, incluso en vacío | `page.tsx:298-306` · `kardexService.ts:138-143` |
| 41 | toast | «Error» / «No se pudo actualizar el kardex» | Fallo al refrescar | error de red | `page.tsx:111-115` |
| 42 | toast | «Error» / «No se pudo cargar el kardex» | Fallo en la carga inicial | error de red | `:136-139` |
| 43 | toast | «Error» / «No hay datos para exportar» | Exportar sin filas | `entries.length === 0` | `:154-159` |
| 44 | toast | «Exportación exitosa» / «El archivo CSV ha sido descargado» | Exportación correcta | tras exportar | `:168-171` |
| 45 | toast | «Error» / «No se pudo exportar» | Fallo al generar el CSV | excepción | `:174-178` |

**Subtotal Kardex: 45 controles.**

---

## B. Lotes — `/app/inventario/lotes`

Archivos: `app/app/inventario/lotes/page.tsx` (7 líneas, solo monta el componente),
`components/inventario/lotes/LotesPage.tsx` (613), `LotesService.ts` (252), `types.ts` (42).

Esta sí está en el menú: `AppLayout.tsx:231` y `SidebarNavigation.tsx:216`, ambas con icono
`Package`, que el catálogo de iconos reserva al concepto «Producto». También en
`lib/config/modulePages.ts:84` y `components/inventario/dashboard/AccesosRapidos.tsx:90`.

### B.1 Cabecera

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 46 | botón | (icono `ArrowLeft`, sin rótulo) | `Link` a `/app/inventario` | Siempre | `LotesPage.tsx:263-267` |
| 47 | badge | (caja azul con `Package2`) | Icono de pantalla, dibujado a mano **dentro del `h1`** | Siempre | `:270-272` |
| 48 | texto | «Gestión de Lotes» | Título | Siempre | `:269-274` |
| 49 | texto | «Inventario / Lotes - Trazabilidad y vencimientos» | Subtítulo: **migas escritas como texto**, con guion en vez de «·» | Siempre | `:275-277` |
| 50 | botón | (icono `RefreshCw`, sin rótulo ni tooltip) | Recarga. Gira mientras `isRefreshing` | Siempre | `:281-283` |
| 51 | botón | «Nuevo Lote» | Abre el diálogo en modo alta | Siempre | `:284-287` |
| 52 | — | (sin `BranchBadge`) | La pantalla no declara ámbito de sucursal porque **`lots` no tiene sucursal** (H.1) | — | — |

### B.2 KPI

Cuatro `Card` a mano, no `StatCard`. Sin estado de carga: muestran `0` mientras llegan.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 53 | stat | «Total lotes» | `lotes.length` **sin filtrar** (segunda consulta completa) | Siempre | `:293-305` · `LotesService.ts:102` |
| 54 | stat | «Vencidos» | `expiry_date < hoy` | Siempre | `:306-318` · `:103` |
| 55 | stat | «Por vencer (30d)» | `0 ≤ days_to_expiry ≤ 30` | Siempre | `:319-331` · `:104-110` |
| 56 | stat | «Con stock» | **Siempre 0**: `stock_quantity` está cableado a `0` (I.5) | Siempre | `:332-344` · `:111` y `:60` |

### B.3 Filtros y buscador

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 57 | texto | «Lista de Lotes» | Título de la tarjeta | Siempre | `:351-353` |
| 58 | campo | «Todos» / «Activos» / «Por vencer» / «Vencidos» | `Select` de estado, 150 px | Siempre | `:355-365` |
| 59 | campo | «Todos los productos» | `Select` con **todos** los productos de la organización, paginados de mil en mil | Siempre | `:366-376` · `LotesService.ts:115-145` |
| 60 | campo | «Buscar lotes...» | Busca en código de lote, nombre y SKU. **Se ignora si hay filtro de estado** (I.6) | Siempre | `:377-385` · `LotesService.ts:67-85` |
| 61 | — | (sin chips de filtros activos, sin «Limpiar todo») | — | — | — |

### B.4 Tabla

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 62 | estado | (un `Skeleton` de 32×32 centrado) | Estado de carga: **un cuadrito**, no filas de esqueleto | `loading` | `:390-392` |
| 63 | estado | «No hay lotes registrados» | Vacío con icono `Package2`. **Sin acción**, y **el mismo texto** cuando el filtro no devuelve nada | `lotes.length === 0` | `:393-397` |
| 64 | tabla | «Código» | `lot_code` en monoespaciada | listo | `:402`, `:414-416` |
| 65 | tabla | «Producto» | Nombre + SKU en dos líneas | listo | `:403`, `:417-422` |
| 66 | tabla | «Proveedor» | `suppliers.name` o «-» | listo | `:404`, `:423-425` |
| 67 | tabla | «Vencimiento» | `formatDate(expiry_date)`. `expiry_date` es `date`, no `timestamptz`: **pasa por el conversor equivocado** (I.7) | listo | `:405`, `:426-428` |
| 68 | tabla | «Stock» | **Siempre 0** y siempre gris | listo | `:406`, `:429-433` |
| 69 | tabla | «Estado» | Badge: «Vencido» / «Por vencer (Nd)» / «Activo» / «Sin vencimiento» | listo | `:407`, `:228-239` |
| 70 | tabla | (fila con fondo rojo) | `bg-red-50` en toda la fila cuando el lote está vencido | vencido | `:413` |
| 71 | tabla | «Acciones» → icono `Edit` | Abre el diálogo en modo edición | listo | `:439-441` |
| 72 | tabla | «Acciones» → icono `Copy` | Duplica **sin confirmar**, con código `{lot_code}-COPIA` | listo | `:442-444` · `LotesService.ts:229-251` |
| 73 | tabla | «Acciones» → icono `Trash2` rojo | Abre la confirmación. **Destructivo suelto en la fila**, contra el patrón 6.4 | listo | `:445-453` |
| 74 | tooltip | (ninguno) | Los tres iconos no tienen `aria-label` ni tooltip | — | `:439-453` |
| 75 | estado | (icono de borrar deshabilitado) | `disabled={(lote.stock_quantity \|\| 0) > 0}` → como el stock siempre es 0, **nunca se deshabilita** | listo | `:450` |
| 76 | paginación | `DataTablePagination` | 10 / 25 / 50 / 100, en cliente sobre el array completo. **Se dibuja también en el estado vacío** | Siempre | `:462-470` |

### B.5 «Navegación Rápida»

Tarjeta que no existe en ninguna otra pantalla del sistema.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 77 | texto | «Navegación Rápida» | Título de la tarjeta | Siempre | `:477-479` |
| 78 | botón | «Productos» | `/app/inventario/productos` | Siempre | `:483-488` |
| 79 | botón | «Stock» | `/app/inventario/stock` | Siempre | `:489-494` |
| 80 | botón | «Proveedores» | `/app/inventario/proveedores` | Siempre | `:495-500` |
| 81 | botón | «Inventario» | `/app/inventario` — **duplica el botón «volver» de la cabecera** | Siempre | `:501-506` |

### B.6 Diálogo «Nuevo Lote» / «Editar Lote»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 82 | diálogo | «Nuevo Lote» / «Editar Lote» | Título según modo | al abrir | `:515-517` |
| 83 | texto | «Registrar un nuevo lote para trazabilidad» / «Modificar información del lote» | Descripción | al abrir | `:518-520` |
| 84 | campo | «Producto *» | `Select` plano con **todos** los productos; sin buscador. Deshabilitado al editar | al abrir | `:524-538` |
| 85 | campo | «Código de Lote *» | Texto, forzado a mayúsculas, monoespaciada. Marcador «Ej: LOT-2025-001» | al abrir | `:541-547` |
| 86 | campo | «Fecha de Vencimiento» | `<input type="date">` nativo, **no el `DateRange` ni el `Calendar` del kit**. Opcional | al abrir | `:550-556` |
| 87 | campo | «Proveedor» | `Select` con «Sin proveedor» + proveedores. Sin buscador | al abrir | `:559-574` |
| 88 | — | (sin campo de sucursal ni de cantidad) | No se puede decir cuántas unidades tiene el lote ni dónde están | — | — |
| 89 | botón | «Cancelar» | Cierra sin guardar y **sin avisar de cambios sin guardar** | al abrir | `:577-579` |
| 90 | botón | «Guardar» / «Guardando...» | Valida código y producto; llama a crear o actualizar | al abrir | `:580-589` · `:166-197` |
| 91 | toast | «Error» / «El código de lote es requerido» | Validación | al guardar vacío | `:168` |
| 92 | toast | «Error» / «Selecciona un producto» | Validación | sin producto | `:172` |
| 93 | toast | «Lote creado» / «Lote actualizado» | Éxito | al guardar | `:185`, `:188` |
| 94 | toast | «Error» / «No se pudo guardar» | Fallo | excepción | `:193` |

### B.7 Confirmación de borrado y resto de avisos

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 95 | diálogo | «¿Eliminar lote?» | `AlertDialog`. **No dice qué lote**: no cita el código | al confirmar borrado | `:598` |
| 96 | texto | «Esta acción no se puede deshacer. El lote será eliminado permanentemente.» | Descripción | ídem | `:599-601` |
| 97 | botón | «Cancelar» | Cierra | ídem | `:604` |
| 98 | botón | «Eliminar» | Ejecuta el borrado. La guarda de stock no funciona (I.5) | ídem | `:605-607` |
| 99 | toast | «Lote eliminado» | Éxito | tras borrar | `:218` |
| 100 | toast | «Error» / «No se puede eliminar un lote que tiene stock» | Guarda de stock. **Inalcanzable** | nunca hoy | `:221` · `LotesService.ts:206-208` |
| 101 | toast | «Error» / «No se puede eliminar un lote que tiene movimientos asociados» | Guarda de movimientos. Sí funciona | si hay movimientos | `LotesService.ts:212-219` |
| 102 | toast | «Lote duplicado» | Éxito al duplicar | tras duplicar | `:202` |
| 103 | toast | «Error» / «No se pudo duplicar» | Fallo al duplicar | excepción | `:205` |
| 104 | toast | «Error» / `{mensaje del servicio}` | Fallo de carga; muestra el mensaje crudo de PostgREST | error de red | `:127-131` |

**Subtotal Lotes: 59 controles.**

---

## C. Sub-pestañas del detalle de producto

En `199:16902` («Escritorio / Detalle — Inventario › Stock (listo)») la fila `Sub-pestañas`
(`199:17247`) ya tiene cuatro entradas:

| # | Tipo | Etiqueta exacta | Estado hoy | Nodo Figma |
|---|---|---|---|---|
| 105 | pestaña | «Stock» | Dibujada y con contenido | `199:17249` |
| 106 | pestaña | «Seriales · 42» | Dibujada y con contenido (sección «Producto — Seriales») | `199:17252` |
| 107 | pestaña | «Lotes» + badge «Nuevo» | **Solo la etiqueta.** Sin contenido en Figma y sin componente en código | `199:17255` |
| 108 | pestaña | «Kardex» + badge «Nuevo» | **Solo la etiqueta.** El código solo tiene el botón «Ver Historial» que navega fuera | `199:17258` |

**En código no existe ninguna pestaña de kardex ni de lotes.** El detalle
(`components/inventario/productos/id/DetalleProducto.tsx:72-84`, constante `PRODUCT_TABS`)
define **once** pestañas, todas con componente real y contenido: `Detalles`, `Variantes`,
`Modificadores`, `Stock`, `Seriales`, `Imágenes`, `Precios`, `Proveedores`, `Etiquetas`,
`Notas`, `Auditoría`. Ni `kardex`, ni `movimientos`, ni `lotes`, ni `trazabilidad`: no están
definidas, ni como marcador de posición. La agrupación de Figma (Resumen · Inventario ·
Precios y costos · Variantes y modificadores · Imágenes · Proveedores y etiquetas · Notas ·
Historial, con Inventario subdividido) es una decisión de diseño ya aprobada y no se reabre aquí.

La única puerta hacia los movimientos dentro del detalle es el botón «Ver Historial» de
`StockTab.tsx:172-175`, que **abandona el detalle** y navega a la página escondida del kardex.
`StockTab.tsx:176-190` dibuja además el estado «Inventario sin seguimiento» cuando
`track_stock === false`: el kardex y los lotes embebidos tienen que contemplarlo.

**Subtotal sub-pestañas: 4 controles** (2 con contenido en Figma y en código, 2 que hay que
inventar entero a los dos lados).

---

## D. Qué es de verdad un movimiento de kardex

`stock_movements` es **una sola tabla plana, sin cabecera de documento**: una fila por
producto, sucursal y hecho. Columnas verificadas (13):

| Columna | Tipo | Nulo | Qué significa |
|---|---|---|---|
| `id` | `integer` | no | Secuencial |
| `organization_id` | `integer` | **no** | Tenencia. La RLS filtra por aquí |
| `branch_id` | `integer` | **no** | Sucursal. Todo movimiento tiene sucursal |
| `product_id` | `integer` | **no** | Producto |
| `lot_id` | `integer` | sí | Lote. **1 fila de 13.000 lo trae** |
| `direction` | `text` | no | `CHECK IN ('in','out')` |
| `qty` | `numeric` | no | Siempre positivo en la práctica; el signo lo da `direction` |
| `unit_cost` | `numeric` | sí | **7.262 filas nulas y 1.255 en cero de 13.000** |
| `source` | `text` | no | `CHECK` de 14 valores (ver H.2) |
| `source_id` | `text` | sí | Documento de origen, **como texto suelto, sin clave foránea**. 8.370 nulas |
| `note` | `text` | sí | Texto libre. 3.476 nulas |
| `created_at` | `timestamptz` | sí | `now()` por defecto. Es la fecha del kardex |
| `updated_by` | `uuid` | sí | `auth.users(id)`. **No existe `created_by`** |

**No hay un asiento de doble partida.** Un traslado son dos filas independientes (`out` en la
sucursal de origen, `in` en la de destino) que nada obliga a que existan ambas, y de hecho hoy
no existen: **8 salidas por traslado frente a 2 entradas**. Seis unidades salieron de una
sucursal y no entraron en ninguna: el inventario de la organización, según el kardex, tiene un
agujero de seis unidades.

**No hay saldo persistido.** Ni la tabla ni ninguna vista guardan el saldo tras el movimiento.
El «Saldo» de la columna 34 se calcula en el navegador cada vez.

**No hay costo persistido por movimiento en las salidas.** `unit_cost` es lo que le pasara quien
escribió, y en las ventas del POS es el precio de venta (E.1).

**Índices:** `idx_stock_movements_org_product (organization_id, product_id)`,
`idx_stock_movements_org_branch`, `idx_stock_movements_created_at DESC`. Para el kardex por
producto el índice correcto existe; falta `(organization_id, product_id, branch_id, created_at)`
para el saldo corrido ordenado.

**Trigger:** `trg_auto_journal_stock_movement AFTER INSERT` → `fn_auto_journal_stock_movement`,
que genera el asiento contable de inventario. **Excluye `initial`, `purchase` y `transfer`**, y
si `unit_cost` es 0 o nulo va a buscar `stock_levels.avg_cost` **sin filtrar por lote** y
tomando `LIMIT 1`. Si el importe resultante es 0, no hay asiento.

**No hay ningún trigger que mantenga `stock_levels` desde `stock_movements`.** Las existencias
y el kardex son dos escrituras separadas en cada llamador, y pueden divergir sin que nada avise.

---

## E. La cadena completa por origen

Qué escribe cada origen, quién lo escribe y **qué deja o no rastro en el kardex**. Todo
verificado con el código fuente de las funciones y con los datos reales.

### E.0 El hallazgo que manda sobre todo lo demás: nueve orígenes que la base rechaza

`stock_movements` tiene un `CHECK` de 14 valores. **El código escribe nueve valores que no
están en esa lista.** Cada uno de ellos provoca un error de restricción, y la base **no los
guarda nunca**:

| Valor escrito | Dónde | Qué pasa con el error | En la base hoy |
|---|---|---|---|
| `transfer_out` | `components/inventario/transferencias/TransferenciasService.ts:244` | **`throw`** (`:255-258`): rompe el traslado entero | 0 filas |
| `transfer_in` | `TransferenciasService.ts:344` | ídem | 0 filas |
| `purchase_order` | `lib/services/purchaseOrderService.ts:583` y `:708` (recepción de orden de compra) | **silencio**: `errors.push` en `stockMovementService.ts:467-469` → `console.warn` | 0 filas |
| `purchase_invoice` | `components/finanzas/facturas-compra/FacturasCompraService.ts:929` | silencio | 0 filas |
| `credit_note` | `lib/services/posService.ts:3203` (devolución por nota crédito) | silencio | 0 filas |
| `invoice_void` | `components/finanzas/facturas-venta/id/AnularFacturaDialog.tsx:115` | silencio | 0 filas |
| `folio_item_reversal` | `lib/services/foliosService.ts:373` | silencio | 0 filas |
| `web_refund` | `app/api/web-orders/[id]/refund/route.ts:242` | — | 0 filas |
| `purchase_void` | `fn_void_purchase_invoice` (dentro de la base) | revienta la transacción | 0 filas |

Verificado en producción: los diez únicos valores que existen en 13.000 filas son
`adjustment`, `folio_item`, `initial`, `invoice_sale`, `mesa_sale`, `purchase`,
`room_consumption`, `sale`, `transfer` y `web_sale`.

**Por qué es lo más grave del documento.** En todos los casos silenciosos, `stock_levels`
**sí** se actualiza antes o aparte del movimiento. Las existencias suben o bajan y el kardex
no se entera. Es decir:

- **Recibir una orden de compra no deja rastro en el kardex.** Nunca lo ha dejado.
- **Anular una factura de venta no deja rastro.**
- **Una devolución por nota crédito del POS no deja rastro.**
- **Un traslado entre sucursales no se puede ni completar**: el `throw` lo aborta.

Y la prueba en los datos: `source='transfer'` solo existe entre el **7 y el 26 de julio de
2025**. Es un camino antiguo que ya no está en el código. Desde el 26 de julio de 2025
**ningún traslado ha escrito en el kardex**, y ninguno puede. Los 8 movimientos de salida sin
sus entradas son el residuo de aquel camino viejo.

Este es el origen real del descuadre que describe E.10, y ninguna pantalla lo señala.

### E.1 Venta del POS — `source='sale'`, 2.988 movimientos

`posService.checkout` → RPC `pos_checkout_v1` (`lib/services/posService.ts:1815-1858`) →
`decrement_stock_with_recipe` → `decrement_stock_on_sale`.

- `stock_levels`: resta `qty_on_hand` sobre la fila con **`lot_id IS NULL` cableado**; si no
  existe, la crea en negativo.
- `stock_movements`: una fila `out` con `lot_id` **NULL cableado**, `source_id` = id de la venta,
  `updated_by` = cajero.
- **Bug de costo:** `pos_checkout_v1` pasa `v_unit_price` —el **precio de venta**— al parámetro
  `p_unit_cost`. El kardex guarda el precio en la columna de costo. Con receta, los ingredientes
  sí reciben `NULL` y caen al `avg_cost`; el producto terminado, no.
- **Deja de cuadrar sin avisar:** el bloque de stock va dentro de un `exception when others`
  que solo añade un aviso. Una venta puede cerrarse sin movimiento de kardex.
- `avg_cost` **no se recalcula** en la salida.

### E.2 Pedido web — `source='web_sale'`, 1.108 movimientos

Mismo camino de descuento, pero antes hay **reserva**: `reserve_stock_for_web_order` sube
`qty_reserved` y `release_stock_for_order` la baja. **Ninguna de las dos escribe en
`stock_movements`**: reservar y liberar no dejan rastro en el kardex, aunque sí cambian lo
disponible. Ambas también cablean `lot_id IS NULL`.

`web_sale` **no está en el desplegable «Todos los orígenes»** ni en el mapa de etiquetas de
`KardexTable`: 1.108 movimientos, el tercer origen más frecuente, se muestran con el literal
`web_sale` y no se pueden filtrar.

### E.3 Compra y recepción de orden — `source='purchase'`, 27 movimientos

Hay **tres** caminos de entrada por compra y solo uno llega al kardex:

1. **Recepción de orden de compra** — `purchaseOrderService.ts:583` y `:708` →
   `stockMovementService.incrementOnPurchase(..., 'purchase_order')`. **Rechazado por el
   `CHECK`, en silencio** (E.0). Las existencias suben, el kardex no se entera. Nunca ha
   funcionado.
2. **Recepción por factura de compra** — `FacturasCompraService.ts:929` con
   `'purchase_invoice'`. **Rechazado, en silencio.**
3. **Un segundo camino de la misma pantalla** — `FacturasCompraService.ts:1296` con
   `'purchase'`. **Este sí escribe**: son los 27 movimientos, el único origen con lote
   (1 de 27) y el único que llega vivo a 2026.

`incrementOnPurchase` cablea `lot_id: null` (`stockMovementService.ts:458`) y **nunca escribe
`note`**. `purchase_order_items` tiene `requires_serial` y `serials_received` pero **no tiene
`lot_code` ni `expiry_date`**: la recepción no puede capturar el lote aunque quiera. El diálogo
de recepción (`components/inventario/ordenes-compra/detalle/OrdenCompraDetalle.tsx:531-690`)
captura seriales (`SerialCaptureSection`, `:665`) y ni menciona los lotes. El asiento contable
de este origen está **excluido** del trigger.

### E.4 Ajuste por conteo — `source='adjustment'`, 317 movimientos (225 in, 92 out)

Es el origen **mejor construido del sistema**, y por eso conviene mirarlo de cerca:
`adjustmentService.ts:437` → `fn_register_stock_entry` para las entradas, y
`adjustmentService.ts:455-469` inserta directamente la pata negativa **con `lot_id:
item.lot_id || null`, `unit_cost`, `note` y `source_id`**. El servicio declara `lot_id` en su
tipo (`:35`, `:66`, `:80`) y lo escribe en cuatro sitios (`:305`, `:377`, `:461`, `:477`).

**Pero el formulario nunca lo llena.** `components/inventario/ajustes/nuevo/NuevoAjusteForm.tsx`
no tiene ni un selector de lote —la única aparición de la palabra `lot` en el archivo, `:176`,
es un comentario sobre cargar imágenes «en lotes»—. Sí captura seriales (`:485-488`,
`:518-533`, `:844`). Resultado: **0 de 374 renglones de ajuste traen lote.** Es una capacidad
completa del servicio, muerta por falta de tres campos en un formulario.

Hay 374 renglones y 317 movimientos: la diferencia son los 3 ajustes en borrador y las filas
que no movieron nada.

Además hay **dos ajustes paralelos que no pasan por el servicio**:
`components/inventario/productos/id/tabs/VariantesTab.tsx:561` y
`components/inventario/productos/editar/FormularioEdicionProducto.tsx:890` insertan
`source='adjustment'` directamente desde el navegador, con `source_id: null`, sin `lot_id` y
sin `updated_by`. Son movimientos que en el kardex aparecen sin documento y sin autor.

### E.5 Traslado entre sucursales — `source='transfer'`, 10 movimientos, **todos de julio de 2025**

**Hoy un traslado no puede escribir en el kardex.** `TransferenciasService.ts:244` escribe
`source: 'transfer_out'` y `:344` `'transfer_in'`; ninguno de los dos está en el `CHECK`, y el
error se relanza con `throw` (`:255-258`), así que **el traslado entero falla**.

Lo irónico es que ese código es el que mejor trata el lote: escribe `lot_id: item.lot_id || null`
en las dos patas, y `NuevaTransferenciaForm.tsx:38-39` y `:198` ya declaran y envían `lot_id`.
Falta el selector, igual que en el ajuste. `CrearTransferenciaDialog.tsx:131` directamente
cablea `lot_id: null`. Tampoco escriben `unit_cost`, así que el movimiento valdría cero.

Los 10 movimientos existentes son de un camino anterior, entre el 7 y el 26 de julio de 2025.
8 salidas, 2 entradas, 3 renglones marcados `received`: seis unidades salieron de una sucursal
y no entraron en ninguna. El asiento contable está **excluido** del trigger, y el segundo
trigger contable (`fn_auto_journal_inventory_transfer`) busca `source = 'transfer'`, un valor
que el código ya no escribe: **no se disparará nunca más**.

Y la RPC del asistente `assistant_create_transfer` **toca `stock_levels` y no escribe
`stock_movements`**: mueve existencias sin dejar rastro, sin siquiera intentarlo.

### E.6 Devolución — `source='return'`, **0 movimientos**

El valor está en el `CHECK` y en el mapa de etiquetas, pero **ninguna devolución ha escrito
jamás en el kardex**. Los tres caminos de devolución escriben valores rechazados:
`credit_note` (nota crédito del POS, `posService.ts:3203`), `invoice_void` (anulación de
factura de venta, `AnularFacturaDialog.tsx:115`) y `web_refund` (devolución de pedido web,
`app/api/web-orders/[id]/refund/route.ts:242`). Los tres en silencio. La única `return` que la
base aceptaría la escribe `assistant_void_purchase_invoice`, que no se ha usado.

### E.7 Producción / receta — `source='production'`, **0 movimientos**

`fn_complete_production_order` sí escribe `'production'`, valor válido, en dos patas: consumo
de ingredientes (`out`, con `COALESCE(avg_cost, 0)`) y producto terminado (`in`, con
**costo cableado a 0**). Hay 57 recetas y **1 orden de producción**, sin completar: por eso hay
cero movimientos.

El consumo de ingredientes por receta **al vender** sí se registra, pero **con `source='sale'`**,
no como producción: en el kardex del ingrediente aparece «Venta» con la nota «Ingrediente de
receta: {receta} - {ingrediente}». Es correcto contablemente —el ingrediente se consumió por
una venta— pero hace ilegible el kardex de un ingrediente, que se llena de líneas «Venta» de
productos que él no es. La pantalla de movimientos tiene un conmutador
«solo ingredientes» (`movimientos/page.tsx:61`); el kardex no.

### E.8 Merma — `source='loss'`, **0 movimientos**

El `CHECK` lo llama **`loss`**. `KardexTable.tsx:40` y `MovimientosTable.tsx:49` lo llaman
**`waste`**. La etiqueta «Merma» está escrita contra un valor que la base rechaza: si alguna vez
se registra una merma, saldrá el literal `loss` sin traducir.

### E.9 Inventario inicial — `source='initial'`, 8.331 movimientos (el 64 %)

`fn_register_stock_entry` desde la creación y edición de producto y desde el importador
(`importar/page.tsx:1614`). `source_id` siempre nulo, `updated_by` siempre nulo, `unit_cost`
nulo o cero en 7.581 de 8.331, `lot_id` NULL cableado. Excluido del asiento contable.

### E.10 Resumen: qué NO deja rastro en el kardex

**Rechazado por el `CHECK` en silencio, con las existencias sí modificadas** (E.0):

1. **Recepción de orden de compra** (`purchase_order`).
2. **Recepción por factura de compra** por su primer camino (`purchase_invoice`).
3. **Devolución por nota crédito del POS** (`credit_note`).
4. **Anulación de factura de venta** (`invoice_void`).
5. **Borrado de renglón de folio** (`folio_item_reversal`).
6. **Devolución de pedido web** (`web_refund`).

**Rechazado con excepción, rompiendo la operación:**

7. **Traslado entre sucursales**, en las dos patas (`transfer_out`, `transfer_in`).

**Nunca intentado:**

8. **Reserva y liberación de stock de pedidos web** (`reserve_stock_for_web_order`, `release_stock_for_order`).
9. **Traslado creado por el asistente** (`assistant_create_transfer`).
10. **Mermas** — el código escribe `waste`, la base espera `loss`, y nadie lo ha escrito.
11. **Producción** — se registra disfrazada de venta, con la nota «Ingrediente de receta: …».
12. **Cualquier venta cuyo descuento de stock falle** — el `exception when others` de
    `pos_checkout_v1` lo convierte en aviso.

Doce caminos. El kardex no puede cuadrar contra `stock_levels`, y **no hay ninguna comprobación
que lo detecte**: los avisos van a `console.warn`, que en producción no lo lee nadie.

---

## F. Saldo acumulado y costo promedio

### F.1 Saldo acumulado: existe, pero es una ilusión de la pantalla

`kardexService.getKardex` (`kardexService.ts:83-143`):

1. Trae **todos** los movimientos del producto con los filtros aplicados, ordenados
   `created_at ASC`, **sin `.range()`** → tope implícito de 1.000 filas de PostgREST.
2. Recorre el array acumulando `balance += in − out` (`:115-134`).
3. Invierte el array (`:136`) y corta la página en JavaScript (`:138-141`).

Consecuencias:

- **El saldo es el saldo del conjunto filtrado, no el saldo real.** Si filtras «Solo Salidas»,
  el saldo es negativo y creciente. Si filtras por fecha, arranca en cero el primer día del
  rango, ignorando todo lo anterior. Si no filtras sucursal, mezcla sucursales en un único
  acumulado que no corresponde a ninguna.
- **A partir de 1.000 movimientos el saldo es falso** y el total mostrado también. Hoy el
  producto más movido tiene 238 movimientos, así que no se ha notado; con dos años de ventas
  de un producto de rotación alta se cruza sin aviso.
- **El saldo nunca se compara con `stock_levels`.** Nada detecta la divergencia que E.10 garantiza.

### F.2 Costo promedio: no existe

`stock_levels.avg_cost` se llama «costo promedio» y **no lo es**. `fn_register_stock_entry`
hace `avg_cost = CASE WHEN v_unit_cost > 0 THEN v_unit_cost ELSE avg_cost END`: **sobrescribe
con el último costo**, sin ponderar por cantidad. Las salidas no lo tocan. No hay ninguna
función que calcule promedio ponderado móvil, ni PEPS, ni ningún método de valoración.

Y `formatCurrency` (`utils/Utils.ts:69-89`) **cablea `COP`** y convierte nulo en `$ 0,00`: en el
kardex, «sin costo registrado» y «costo cero» se ven exactamente igual, 7.262 veces.

---

## G. Lotes: qué guarda y qué pasa al vender

### G.1 Qué guarda `lots`

Siete columnas, y hay que leerlas dos veces:

| Columna | Tipo | Nulo |
|---|---|---|
| `id` | `integer` | no |
| `product_id` | `integer` | no |
| `lot_code` | `text` | no |
| `expiry_date` | `date` | sí |
| `supplier_id` | `integer` | sí |
| `created_at` / `updated_at` | `timestamptz` | sí |

**No tiene `organization_id`. No tiene `branch_id`. No tiene cantidad.** No tiene índice único
sobre `(product_id, lot_code)`: el mismo producto puede tener dos lotes con el mismo código, y
de hecho «Duplicar» crea `{codigo}-COPIA` precisamente porque no puede repetir… nada se lo
impedía, es una convención del código.

La cantidad por lote y sucursal vive —debería vivir— en `stock_levels (product_id, branch_id,
lot_id, qty_on_hand)`. **Hay 44.627 filas en `stock_levels` y 0 con `lot_id`.**

### G.2 Qué pasa hoy al vender un producto con lotes

**Nada.** No se elige lote, no se descuenta FIFO, no se descuenta por vencimiento, no se avisa
de vencidos, y no se bloquea la venta de un lote vencido.

La razón no es un olvido de la interfaz: es que **las RPC de descuento cablean `lot_id IS NULL`**.
`decrement_stock_on_sale` busca la fila de existencias con `WHERE ... AND lot_id IS NULL LIMIT 1`
e inserta el movimiento con `lot_id = NULL` literal. Lo mismo `fn_register_stock_entry`,
`reserve_stock_for_web_order` y `release_stock_for_order`. Aunque alguien llenara los lotes a
mano, el POS seguiría descontando de la fila sin lote.

Búsqueda en el POS (`components/pos/**`, `lib/services/posService.ts`): **cero apariciones de
`lot`, `lote`, `expiry` o FEFO**. El selector de seriales sí existe (`SerialPicker` en el kit,
`serial_ids` en el sobre de `pos_checkout_v1`); el de lotes no existe ni en el kit ni en el código.

### G.3 La evidencia en números

| Dónde | Filas | Con lote |
|---|---|---|
| `lots` | 3 (1 con vencimiento, ya vencido; 1 con proveedor; 2 productos distintos) | — |
| `stock_levels` | 44.627 | **0** |
| `stock_movements` | 13.000 | **1** |
| `adjustment_items` | 374 | **0** |
| `transfer_items` | 8 | **0** |
| `serial_numbers` | 102 | **0** |

El lote está en el esquema de seis tablas y no se ha llenado nunca. La pantalla de Lotes es un
alta y baja de códigos que no se conectan a nada.

### G.4 La trampa del índice único

`stock_levels` tiene **dos** índices únicos:

- `stock_levels_product_branch_lot_key UNIQUE (product_id, branch_id, lot_id)` — como `lot_id`
  admite NULL y en SQL `NULL <> NULL`, **este índice no impide duplicados sin lote**.
- `stock_levels_product_branch_nolot_key UNIQUE (product_id, branch_id) WHERE lot_id IS NULL` —
  un índice parcial añadido después, que sí cierra el caso sin lote.

Consecuencia práctica, y es la trampa que ya conocía el proyecto: **un `upsert` con
`onConflict: 'product_id,branch_id,lot_id'` no deduplica cuando `lot_id` es NULL**, y tampoco
puede apoyarse en el índice parcial (PostgREST no sabe usar un índice `WHERE` como destino de
`ON CONFLICT` sin nombrarlo). Por eso las funciones de la base hacen `SELECT` explícito y luego
`UPDATE` o `INSERT` — `fn_register_stock_entry` lo documenta en un comentario propio: «SELECT
explícito, no onConflict». **Cualquier código nuevo que toque `stock_levels` con lotes tiene que
seguir ese patrón, o usar `ON CONFLICT` nombrando el índice**. La propuesta de K.4 lo resuelve
de raíz.

---

## H. Esquema, RLS y columnas que existen y no se muestran

### H.1 RLS

| Tabla | RLS | Política | Guarda |
|---|---|---|---|
| `stock_movements` | sí | `stock_movements_select_policy` (r) y `..._insert_update_delete_policy` (ALL) | `organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` |
| `stock_levels` | sí | ídem | por `branch_id` → `branches` → `organization_members` |
| `lots` | sí | ídem | **por `product_id` → `products` → `organization_members`**, porque `lots` no tiene organización propia |

Las tres están **sin rol declarado** (aplican a `PUBLIC`, incluido `anon`), pero la guarda exige
`auth.uid()`, así que un anónimo no ve nada. La política de `lots` hace un salto extra por
`products` en cada fila: es el patrón de coste que ya dio problemas en este proyecto.

**`kardexService.getProductInfo` (`kardexService.ts:235-253`) consulta `products` por `id` sin
filtrar por organización.** Hoy lo tapa la RLS, pero es exactamente el patrón que la regla 5 de
`CLAUDE.md` prohíbe.

### H.2 Orígenes: lo que la base acepta contra lo que la pantalla ofrece

`CHECK (source IN (...))` — **14 valores**:
`purchase`, `sale`, `adjustment`, `transfer`, `return`, `loss`, `production`, `initial`,
`web_sale`, `mesa_sale`, `invoice_sale`, `folio_item`, `room_consumption`, `web_order`.

| Valor | En el filtro (`page.tsx:73-83`) | En el mapa de etiquetas (`KardexTable.tsx:29-42`) | Movimientos reales |
|---|---|---|---|
| `initial` | sí | sí | 8.331 |
| `sale` | sí | sí | 2.988 |
| `web_sale` | **no** | **no** | **1.108** |
| `adjustment` | sí | sí | 317 |
| `invoice_sale` | sí | sí | 193 |
| `purchase` | sí | sí | 27 |
| `mesa_sale` | sí | sí | 24 |
| `transfer` | sí | sí | 10 |
| `room_consumption` | sí | sí | 1 |
| `folio_item` | sí | sí | 1 |
| `return` | **no** | sí | 0 |
| `loss` | **no** | **no** (el mapa dice `waste`) | 0 |
| `production` | **no** | sí | 0 |
| `web_order` | **no** | **no** | 0 |

Y al revés: **nueve valores que el código escribe y el `CHECK` no acepta** —`transfer_out`,
`transfer_in`, `purchase_order`, `purchase_invoice`, `credit_note`, `invoice_void`,
`folio_item_reversal`, `web_refund`, `purchase_void`— no aparecen en ninguno de los dos mapas
porque **nunca llegan a la base** (E.0). Cualquier corrección del `CHECK` obliga a añadirlos
también al filtro, al mapa de etiquetas y a `SISTEMA-BADGES.md`.

### H.3 Columnas que existen y la pantalla no muestra

| Tabla | Columna | Por qué importa |
|---|---|---|
| `stock_movements` | `lot_id` | El kardex no tiene columna «Lote». Si algún día se llena, no se verá |
| `stock_movements` | `updated_by` | **Quién hizo el movimiento no se muestra en ninguna parte.** Es la pregunta número uno de cualquier kardex |
| `stock_levels` | `qty_reserved` | El kardex habla de saldo y nunca de reservado |
| `stock_levels` | `avg_cost` | El costo de la fila no se contrasta con el costo del movimiento |
| `stock_levels` | `min_level` | El mínimo por sucursal y lote no aparece |
| `lots` | `created_at` / `updated_at` | La tabla de lotes no muestra cuándo se creó el lote |
| `lots` | `supplier_id` | Sí se muestra, pero **no enlaza** al proveedor |
| `serial_numbers` | `lot_id`, `warranty_start`, `warranty_end`, `received_date`, `cost_at_purchase` | El serial ya sabe de qué lote es; lotes y seriales no se hablan |
| `adjustment_items` / `transfer_items` | `lot_id` | Las pantallas de ajuste y traslado no piden lote aunque la columna esté |

---

## I. Lo roto o sin efecto

0. **Nueve valores de `source` que el código escribe y la base rechaza** — `E.0`. Seis de ellos
   en silencio, con las existencias ya modificadas; uno (`transfer_out`/`transfer_in`) rompe el
   traslado entero. `TransferenciasService.ts:244` y `:344`, `purchaseOrderService.ts:583` y
   `:708`, `FacturasCompraService.ts:929`, `posService.ts:3203`,
   `AnularFacturaDialog.tsx:115`, `foliosService.ts:373`,
   `api/web-orders/[id]/refund/route.ts:242`. El silencio viene de
   `stockMovementService.ts:467-469`, que mete el error en un array y lo deja en un
   `console.warn`. **Es el defecto más grave del documento y la causa raíz del descuadre.**
1. **La paginación del kardex es decorativa y se rompe a las 1.000 filas.**
   `kardexService.ts:105` pide todo sin `.range()`; `:138-141` corta en memoria. PostgREST
   devuelve 1.000 filas como máximo, así que a partir de ahí el total, el saldo y los KPI mienten
   sin ningún aviso.
2. **`toISOString().split('T')[0]` en el nombre del CSV** — `kardex/page.tsx:166`. Prohibido por
   la norma de fechas de `CLAUDE.md`: en Bogotá, entre las 19:00 y medianoche el archivo lleva la
   fecha del día siguiente.
3. **Los filtros de fecha ignoran el huso de la organización.**
   `kardexService.ts:99` y `:102` comparan un `timestamptz` contra `'yyyy-MM-dd'` y
   `'yyyy-MM-ddT23:59:59'`, que Postgres interpreta en UTC. En Bogotá (UTC−5) el filtro «Hasta el
   30» se come las cinco últimas horas del día 30 y añade las cinco primeras del 31.
4. **«Exportar» exporta solo la página visible.** `page.tsx:162` pasa `entries`, que es el
   resultado ya paginado. Con 50 por página, un kardex de 300 movimientos exporta 50 y no lo dice.
5. **El stock por lote está cableado a cero.** `LotesService.ts:60` devuelve `stock_quantity: 0`
   con el comentario «Stock se puede calcular en otro endpoint si es necesario». Tres consecuencias
   en cadena: la columna «Stock» siempre dice 0, el KPI «Con stock» siempre dice 0
   (`LotesService.ts:111`), y **el botón de borrar nunca se deshabilita** (`LotesPage.tsx:450`).
6. **La guarda «No se puede eliminar un lote que tiene stock» es inalcanzable por dos motivos
   independientes.** `LotesService.ts:203` consulta `stock_levels.quantity`, y **esa columna no
   existe**: la columna se llama `qty_on_hand`. La consulta falla, el error se ignora (no hay
   `if (error)`), `stockData` queda indefinido y `totalStock` sale 0. Aunque la columna fuera la
   correcta, hoy no hay una sola fila de existencias con lote.
7. **El buscador de lotes se anula cuando hay filtro de estado.** `LotesService.ts:67-85`:
   los filtros de estado hacen `return` antes de llegar al bloque de búsqueda. Filtrar «Vencidos»
   y escribir en el buscador da la lista de vencidos sin filtrar por texto.
8. **`expiry_date` es `date` y se formatea con el conversor de `timestamptz`.**
   `LotesPage.tsx:427` usa `formatDate` de `useFormatDate()`. Según la regla 5 de fechas del
   proyecto, un `date` va por `formatPlainDate`, que no convierte. Con un huso negativo, un
   vencimiento del 30 se muestra como 29.
9. **El cálculo de vencido usa la hora del navegador, no la de la organización.**
   `LotesService.ts:41-53` y `:96-99` usan `new Date()` del cliente. Un cajero con el reloj mal
   puesto, o en otro país, ve otros vencimientos.
10. **La columna «Documento» del kardex no enlaza.** `KardexTable.tsx:209-211` imprime el UUID
    crudo. La pantalla hermana `/app/inventario/movimientos` **sí** tiene `getSourceRoute`
    (`MovimientosTable.tsx:69-80`): el kardex es una copia peor de una pantalla que ya existe.
11. **Dos de esos enlaces de la pantalla hermana van a 404.** `MovimientosTable.tsx:73` apunta a
    `/app/inventario/compras/{id}` —la carpeta real es `facturas-compra` y `ordenes-compra`— y
    `:77` a `/app/pos/devoluciones/{id}`, que no tiene subruta `[id]`.
12. **`web_sale` no se puede filtrar y se muestra en crudo.** 1.108 movimientos, el tercer
    origen del sistema. Ver H.2.
13. **«Merma» está escrita contra un valor que la base rechaza:** el código dice `waste`
    (`KardexTable.tsx:40`), el `CHECK` dice `loss`.
14. **El filtro de sucursal propio viola el patrón 9.** `KardexFilters.tsx:64-76` dibuja un
    `Select` de sucursal dentro de la pantalla, además del selector del header, y los sincroniza
    a mano (`page.tsx:60-62`). Son dos mandos para lo mismo.
15. **El costo del kardex en las ventas del POS es el precio de venta.** `pos_checkout_v1` pasa
    `v_unit_price` al parámetro `p_unit_cost`. Afecta a la columna «Costo Unit.», a «Valor Total»,
    al KPI «Valor Inventario» y al asiento contable que genera el trigger.
16. **`formatCurrency` cablea COP** (`utils/Utils.ts:69`) y pinta `$ 0,00` cuando el costo es nulo.
    7.262 movimientos de 13.000 muestran un costo que no existe como si fuera cero.
17. **Reservar y liberar stock de un pedido web no deja rastro en el kardex**, aunque cambien lo
    disponible (`reserve_stock_for_web_order`, `release_stock_for_order`).
18. **`assistant_create_transfer` mueve existencias sin escribir movimiento.**
19. **Seis unidades en tránsito perpetuo.** 8 salidas de traslado, 2 entradas, 3 renglones
    marcados `received`.
20. **Cuatro inserciones directas a `stock_movements` desde el navegador**, sin `source_id` ni
    `updated_by`: `VariantesTab.tsx:442` y `:561`, `NuevoProductoForm.tsx:596`,
    `FormularioEdicionProducto.tsx:890`. Son la causa de que 8.370 movimientos no tengan documento.
21. **`crearLote` no escribe organización** (`LotesService.ts:169-182`) — no puede: la columna no
    existe. La tenencia de un lote depende de a qué producto apunte.
22. **«Duplicar» borra el rastro y no confirma.** `LotesPage.tsx:442` duplica de inmediato; el
    lote copiado nace con el mismo vencimiento y sin cantidad, y nada explica para qué sirve.
23. **La confirmación de borrado no dice qué se borra.** `LotesPage.tsx:598-601`, contra el
    patrón 8.
24. **Estado vacío y estado «sin resultados» comparten texto** en las dos pantallas, y ninguno
    ofrece acción (`KardexTable.tsx:107-119`, `LotesPage.tsx:393-397`).
25. **Ninguna de las dos pantallas contempla el estado «sin sucursal asignada»** del patrón 10,
    y el kardex es de ámbito de sucursal.
26. **`console.log` con emojis en producción** — `LotesService.ts:35`, `:39`, `:89`, `:132`,
    `:157`, `:163`.
27. **El kardex no está enlazado desde ningún menú.** Solo desde `StockTab.tsx:174`.
28. **El icono de Lotes en el menú es `Package`**, que el catálogo reserva a «Producto»
    (`AppLayout.tsx:231`, `SidebarNavigation.tsx:216`).
29. **Hay TRES kardex distintos en la aplicación.** La página `/app/inventario/kardex`,
    la pantalla `/app/inventario/movimientos` (que se presenta a sí misma como «Kardex y
    trazabilidad de entradas y salidas», `MovimientosHeader.tsx:26`) y una tercera pestaña
    dentro de informes (`components/inventario/reportes/ReportesPage.tsx:294-497`, servicio en
    `ReportesService.ts:77`). Tres implementaciones, tres mapas de etiquetas distintos, tres
    comportamientos.
30. **El selector de lote existe en el servicio de ajustes y en el de traslados, y no en sus
    formularios.** `adjustmentService.ts:35`, `:66`, `:80`, `:305`, `:377`, `:461`, `:477` y
    `NuevaTransferenciaForm.tsx:38-39`, `:198` mueven `lot_id`; `NuevoAjusteForm.tsx` y el
    formulario de traslado no lo piden nunca. Capacidad completa, muerta por falta de un campo.
31. **La única pantalla de toda la aplicación que muestra el lote de un movimiento** es el
    informe de trazabilidad (`components/inventario/reportes/trazabilidad/TrazabilidadService.ts:42-68`).
    Ni el kardex ni movimientos tienen columna «Lote».
32. **`stockService.ts:367` acepta un filtro `lotId` que ninguna interfaz expone.**
33. **`incrementOnPurchase` nunca escribe `note`** (`stockMovementService.ts:452-465`): aunque
    se arregle el `CHECK`, esos movimientos entrarán sin explicación.
34. **Los traslados no escriben `unit_cost`** (`TransferenciasService.ts:236-251` y `:336-349`):
    el movimiento valdría cero y el asiento contable no se generaría.
35. **Contraste que resume el problema:** los seriales tienen ciclo completo —selección al
    vender (`components/pos/CheckoutDialog.tsx:2615-2627` → `SerialSelectorDialog`), captura en
    recepción (`SerialCaptureSection`), captura en ajuste (`NuevoAjusteForm.tsx:844`),
    asignación FIFO automática en la web (`api/web-orders/route.ts:257-290`), eventos de
    seguimiento, pestaña propia y entrada de menú—. **Los lotes no tienen nada de eso.** Lo que
    se pide construir para los lotes ya existe, resuelto, para los seriales.

---

## J. Qué falta para que sirvan

**Kardex**

1. Ser una página de verdad: listado de todos los movimientos de la organización, con buscador
   de producto, y el filtro por producto como un filtro más, no como un requisito de la URL.
2. Paginación en servidor con `.range()` y `count: 'exact'`.
3. Saldo corrido calculado en la base por producto y sucursal, independiente de los filtros de
   presentación.
4. Costo promedio ponderado móvil de verdad, y separar «costo» de «precio» en la venta.
5. Columna «Documento» enlazada, columna «Quién», columna «Lote».
6. Los 14 orígenes en el filtro y en las etiquetas, con `loss` en vez de `waste`.
7. Fechas por el huso de la organización en el filtro y en el nombre del archivo.
8. Exportación del conjunto filtrado completo, no de la página.
9. El filtro de sucursal fuera: manda el selector del header.
10. Estados del kit: vacío con acción, sin resultados con «Limpiar filtros», error con
    «Reintentar», sin permiso, sin sucursal asignada.
11. Kardex embebido en el detalle del producto, ya filtrado por ese producto y la sucursal activa,
    con enlace a la página completa.
12. Una comprobación que contraste el saldo del kardex con `stock_levels` y avise de la diferencia.

**Lotes**

1. Cantidad por lote y sucursal, leída de `stock_levels`, en la tabla y en el detalle.
2. Sucursal como columna y como ámbito: hoy el lote no sabe dónde está.
3. Alta de lote **con cantidad inicial y sucursal**, que escriba `stock_levels` y un movimiento
   de kardex. Hoy crear un lote no mueve nada.
4. Captura de lote en la recepción de órdenes de compra, en el ajuste y en el traslado —las tres
   tablas ya tienen la columna—.
5. Descuento por vencimiento más próximo (FEFO) al vender, con selección manual en el POS.
6. Aviso de lote vencido o por vencer al agregar al carrito, y bloqueo configurable.
7. Detalle de lote: sus movimientos (el mismo componente de kardex, filtrado por lote) y sus
   seriales.
8. Umbral de «por vencer» configurable por organización, no 30 días cableados.
9. Unicidad de `(product_id, lot_code)`.
10. Borrado que compruebe existencias de verdad, y confirmación que cite el código del lote.

---

## K. Propuesta de base de datos

**Nada de esto está aplicado. Son migraciones aditivas para que el dueño las ejecute por fases.**

### K.1 Saldo corrido y costo promedio ponderado móvil

```
create or replace function public.fn_kardex_saldo_corrido(
  p_organization_id integer,
  p_product_id      integer,
  p_branch_id       integer default null,   -- null = consolidado de las sucursales del usuario
  p_desde           timestamptz default null,
  p_hasta           timestamptz default null,
  p_limite          integer default 50,
  p_desplazamiento  integer default 0
) returns table (
  id              integer,
  fecha           timestamptz,
  direccion       text,
  origen          text,
  documento       text,
  lote_id         integer,
  lote_codigo     text,
  sucursal_id     integer,
  sucursal        text,
  entrada         numeric,
  salida          numeric,
  saldo           numeric,      -- saldo corrido REAL: acumula desde el primer movimiento
  costo_unitario  numeric,
  costo_promedio  numeric,      -- promedio ponderado móvil tras este movimiento
  valor_saldo     numeric,      -- saldo × costo_promedio
  usuario_id      uuid,
  nota            text,
  total_filas     bigint
)
language sql stable security invoker
```

Cómo funciona, y por qué así:

- El saldo se acumula con una **ventana** `sum(case direction when 'in' then qty else -qty end)
  over (partition by product_id, branch_id order by created_at, id)` sobre **todos** los
  movimientos del producto, y **después** se recorta el rango de fechas. Así el primer día del
  rango arranca con el saldo que de verdad había, no con cero. Esto es lo que hoy no ocurre.
- El promedio ponderado móvil no se puede hacer con una ventana estándar (depende de su propio
  resultado anterior), así que va en una segunda versión en `plpgsql` con un cursor, o —mejor—
  en una columna materializada (K.3). La regla: en una entrada,
  `nuevo = (saldo_anterior × promedio_anterior + qty × costo) / (saldo_anterior + qty)`;
  en una salida el promedio **no cambia** y la salida se valora al promedio vigente.
- `security invoker` a propósito: que mande la RLS del usuario. Sin `security definer` no hace
  falta revocar `anon`.
- `total_filas` viaja en cada fila (`count(*) over ()`) para que la paginación sea de servidor
  con una sola ida y vuelta.
- Índice de apoyo:
  `create index concurrently idx_stock_movements_kardex on stock_movements (organization_id, product_id, branch_id, created_at, id)`.

**Riesgo:** bajo. Es una función nueva, no toca datos. El único cuidado es el plan de la
ventana sobre productos con muchos movimientos; con el índice de arriba se resuelve.

### K.2 Cuadre kardex contra existencias

```
create or replace function public.fn_kardex_descuadres(p_organization_id integer)
returns table (product_id integer, branch_id integer, saldo_kardex numeric,
               qty_stock_levels numeric, diferencia numeric)
```

Compara el neto de `stock_movements` con `stock_levels.qty_on_hand` por producto y sucursal.
Es la comprobación que hoy no existe y la que demuestra los ocho agujeros de E.10. Alimenta un
aviso en la pantalla de kardex («N productos descuadrados») y un informe.

**Riesgo:** ninguno, es solo lectura. **Valor:** alto — es la única forma de saber si el
inventario es confiable antes de tocar nada.

### K.3 Columnas nuevas, todas `NULL`-ables

| Tabla | Columna | Tipo | Para qué |
|---|---|---|---|
| `lots` | `organization_id` | `integer` | Tenencia propia; hoy depende del producto. Se rellena con un `UPDATE` desde `products` y **después** se hace `NOT NULL` en una segunda fase |
| `lots` | `notes` | `text` | Observación del lote |
| `lots` | `created_by` | `uuid` | Quién lo dio de alta |
| `stock_movements` | `created_by` | `uuid` | Hoy solo hay `updated_by`, y lo llenan 2 de cada 10 movimientos |
| `stock_movements` | `avg_cost_after` | `numeric` | Promedio ponderado tras el movimiento, escrito por la RPC. Evita recalcular la historia en cada consulta |
| `purchase_order_items` | `lot_code`, `expiry_date` | `text`, `date` | Capturar el lote en la recepción. Hoy es imposible |
| `organization_settings` (o la tabla de ajustes de inventario) | `dias_aviso_vencimiento` | `integer` default 30 | El umbral de «por vencer», hoy cableado |
| `organization_settings` | `bloquear_venta_vencidos` | `boolean` default false | La decisión de G.4 del POS |
| `organization_settings` | `metodo_salida_lotes` | `text` default `'fefo'` | `fefo` / `fifo` / `manual` |

Restricción nueva: `create unique index concurrently idx_lots_product_code on lots (product_id, lot_code)`.
**Riesgo medio:** hay que comprobar antes que no haya duplicados (hoy con 3 lotes, ninguno).

### K.4 Lotes que funcionen: reserva y descuento FEFO

```
create or replace function public.fn_descontar_stock_fefo(
  p_organization_id integer,
  p_branch_id       integer,
  p_product_id      integer,
  p_qty             numeric,
  p_source          text,
  p_source_id       text,
  p_unit_cost       numeric default null,
  p_user_id         uuid    default null,
  p_lotes_elegidos  jsonb   default null,  -- [{lot_id, qty}] cuando el cajero elige a mano
  p_permitir_vencidos boolean default false
) returns jsonb
language plpgsql security definer
```

Mecánica:

1. Si `p_lotes_elegidos` viene, se respeta tal cual (venta con lote elegido en el POS), validando
   que cada lote pertenezca al producto y tenga existencias en esa sucursal.
2. Si no viene, se recorren las filas de `stock_levels` con `lot_id IS NOT NULL` de ese producto
   y sucursal **ordenadas por `lots.expiry_date ASC NULLS LAST, lots.created_at ASC`** —vencimiento
   más próximo primero, y a igualdad, el más antiguo—, con `FOR UPDATE` para evitar carreras, y
   se va restando hasta cubrir `p_qty`.
3. Los lotes vencidos se saltan salvo que `p_permitir_vencidos` sea cierto; si al saltarlos no
   alcanza, se devuelve `{ok:false, faltante:N, vencidos_disponibles:M}` y **la interfaz decide**.
4. Si el producto **no tiene ninguna fila con lote**, cae al comportamiento actual sobre la fila
   `lot_id IS NULL`: compatibilidad hacia atrás, y es lo que garantiza que se pueda desplegar sin
   migrar los 44.627 registros de existencias.
5. Escribe **un movimiento de kardex por lote consumido**, con su `lot_id`, su `unit_cost` real
   (el `avg_cost` de esa fila, no el precio de venta) y el mismo `source_id`. Así el kardex por
   lote existe desde el primer día.

**La trampa del `upsert`, resuelta.** Ninguna de estas escrituras usa `onConflict`: se hace
`SELECT ... FOR UPDATE` y luego `UPDATE` o `INSERT`, igual que `fn_register_stock_entry`. Como
alternativa más limpia, la migración puede **reemplazar los dos índices únicos por uno solo**:

```
create unique index concurrently idx_stock_levels_pbl
  on stock_levels (product_id, branch_id, coalesce(lot_id, 0));
```

Un índice sobre una expresión que convierte el NULL en 0 **sí** deduplica en los dos casos y
**sí** sirve como destino de `on conflict (product_id, branch_id, coalesce(lot_id, 0))`.
**Riesgo alto:** cambia una restricción sobre una tabla con 44.627 filas de clientes. Se hace
`concurrently`, se verifica que no haya duplicados, y **los índices viejos se dejan en su sitio**
hasta que todo el código nuevo esté desplegado. Es la última fase, no la primera.

### K.5 Reserva por lote para pedidos web

`reserve_stock_for_web_order` y `release_stock_for_order` pasan a reservar sobre lotes por el
mismo orden FEFO y **a escribir movimiento de kardex** con orígenes `web_order` (reserva) y su
reverso al liberar — el valor `web_order` ya está en el `CHECK` y nunca se ha usado.
**Riesgo medio:** cambia el comportamiento de la tienda web, que es la que tumbó Postgres el
2026-09-14. Va con su propia fase y su propia verificación.

### K.0 Primero: cerrar la fuga de orígenes rechazados

Antes que cualquier otra cosa. Dos alternativas, y hay que elegir una:

**Opción A — ampliar el `CHECK` (la que recomiendo).** Los nueve valores describen hechos
económicos distintos y merecen aparecer como tales en el kardex:

```
alter table public.stock_movements drop constraint stock_movements_source_check;
alter table public.stock_movements add constraint stock_movements_source_check
  check (source = any (array[
    'purchase','sale','adjustment','transfer','return','loss','production','initial',
    'web_sale','mesa_sale','invoice_sale','folio_item','room_consumption','web_order',
    'transfer_out','transfer_in','purchase_order','purchase_invoice','credit_note',
    'invoice_void','folio_item_reversal','web_refund','purchase_void'
  ])) not valid;
alter table public.stock_movements validate constraint stock_movements_source_check;
```

`not valid` + `validate` para no bloquear la tabla. Después hay que añadir los nueve al filtro
de la pantalla, al mapa de etiquetas y a `SISTEMA-BADGES.md`, y **arreglar los dos triggers
contables** que buscan `source='transfer'` y `source='adjustment'`, que con `transfer_out` y
`transfer_in` dejan de dispararse.

**Opción B — normalizar el código a los 14 valores actuales.** Menos filas nuevas en el mapa,
pero se pierde la distinción entre recibir una orden de compra y recibir una factura, y entre
devolver por nota crédito y anular una factura. En un kardex eso importa.

**Riesgo:** bajo en ambos casos —es una restricción, no datos—. **Valor:** es lo único que
convierte al kardex en un libro completo. **Lo que no arregla:** todo lo que pasó hasta hoy.
Las recepciones de orden de compra de los últimos catorce meses no están y no se pueden
reconstruir con certeza; lo honesto es que el kardex lleve un aviso de corte.

Y **el `console.warn` tiene que dejar de tragarse el error**: si un movimiento de kardex no se
puede escribir, la operación avisa a la persona o falla. `stockMovementService.ts:467-469`.

### K.6 Lo que hay que corregir, no añadir

- `pos_checkout_v1`: dejar de pasar `v_unit_price` como `p_unit_cost`. Pasar `null` y que
  `decrement_stock_on_sale` use el `avg_cost` (ya lo hace por `COALESCE`). **Riesgo bajo, valor
  alto:** corrige el kardex, el KPI de valor y los asientos contables de aquí en adelante.
  No reescribe lo pasado: el histórico queda como está y se documenta.
- `fn_register_stock_entry`: `avg_cost` ponderado en vez de sobrescrito.
- `assistant_create_transfer`: escribir los dos movimientos de kardex.
- El traslado: no escribir la salida hasta que el traslado sale de verdad, y garantizar la
  entrada al recibir, o dejar las unidades en una sucursal «en tránsito» visible.
- Las cuatro inserciones directas desde el navegador (I.20): pasar por
  `fn_register_stock_entry` con `source_id` y `updated_by`.

---

## L. Componentes compartidos

Kardex y Lotes no estrenan patrones: reutilizan el kit sin excepción. Lo que **sí** hay que
extraer, porque se repite en más de una pantalla:

| Componente nuevo | Dónde se usa | Qué sustituye hoy |
|---|---|---|
| **`MovimientosTable`** — tabla de movimientos con badge de tipo, dirección, entrada/salida, saldo, lote, autor y documento enlazado. Variantes `Ámbito=producto` / `Ámbito=organización` / `Ámbito=lote` y `Layout=table` / `Layout=cards` | página de Kardex · kardex embebido en el detalle de producto · `/app/inventario/movimientos` · pestaña kardex de informes · detalle de ajuste · detalle de traslado · detalle de lote | `KardexTable.tsx` (227 líneas), `MovimientosTable.tsx` (263) y la tabla de `ReportesPage.tsx:294-497`: **la misma tabla escrita tres veces**, con tres mapas de etiquetas distintos y tres comportamientos |
| **`BadgeOrigenMovimiento`** — un badge por origen, con **todos** los valores del `CHECK` (14 hoy, 23 si se aplica K.0) y su tono de `SISTEMA-BADGES.md` | dentro de `MovimientosTable`, y en la ficha del movimiento | los tres mapas `getSourceColor` duplicados, con tonos Tailwind sueltos y valores que no coinciden entre sí (`waste` en dos de ellos, que la base no acepta) |
| **`LotPicker`** — selector de lote con vencimiento, existencias por sucursal y orden FEFO. Variantes `Layout=popover` / `Layout=dialog` / `Layout=inline`, estados `idle` / `results` / `vacío` / `solo-vencidos` | POS al vender · recepción de órdenes de compra · ajuste de inventario · traslado entre sucursales | nada: no existe |
| **`BadgeVencimiento`** — «Vigente» / «Por vencer (Nd)» / «Vencido» / «Sin vencimiento», con la tabla de tonos | tabla de lotes · `LotPicker` · lotes embebidos en el detalle · aviso del POS | los badges a mano de `LotesPage.tsx:228-239` |
| **`SaldoCorridoCell`** — celda de saldo con signo y tono | `MovimientosTable` | `getBalanceColor` de `KardexTable.tsx:64-68` |

Los cinco van en la Sección «Componentes — Kardex y Lotes» de la página `04`, en la esquina
superior izquierda, para consolidarse después en `02 Componentes`. Todo lo demás —`PageHeader`,
`StatCard`, `SearchBar`, `FilterButton`, `FilterPanel`, `FilterChips`, `DataTable`, `TableCell`,
`Pagination`, `BulkActionBar`, `EmptyState`, `Skeleton`, `Toast`, `ConfirmDialog`, `BottomSheet`,
`BranchBadge`, `EmptyStateSinSucursal`, `ProductPicker`, `SupplierPicker`, `MobileHeader`,
`MobileTabBar`, `Sidebar`, `AppHeader`, `Breadcrumbs`, `Tabs`, `Marca/Nuevo`— se **instancia**.

---

## M. Conteo de controles

| Bloque | Controles |
|---|---|
| A. Kardex — página | 45 |
| B. Lotes — página | 59 |
| C. Sub-pestañas del detalle | 4 |
| **Total auditado** | **108** |

De esos 108: **36 defectos** documentados en I, de los cuales **11 hacen que un control no
tenga ningún efecto** (I.0 los nueve orígenes rechazados, I.1 paginación, I.4 exportación,
I.5 stock por lote, I.6 guarda de borrado, I.7 buscador anulado, I.13 merma, I.17 reserva sin
rastro, I.18 traslado del asistente, I.19 traslado sin recepción, I.30 lote en ajustes y
traslados, I.32 filtro `lotId`).

**Balance de la tanda.** Ninguna de las dos pantallas se puede calcar tal cual: el kardex hay
que **rehacerlo como listado** (hoy no es una pantalla, es un parámetro de URL) y los lotes hay
que **conectarlos** (hoy son un alta y baja de códigos sin cantidad, sin sucursal y sin
consumo). Lo que se calca son las etiquetas, los orígenes, los estados de vencimiento y la
estructura de la tabla; todo lo demás va marcado «Nuevo» en Figma y anotado como dependencia.

---

## N. Qué hay que construir — orden de ejecución

Lista ordenada para ejecutar por fases. Cada fase se puede desplegar sola y deja el sistema
funcionando.

| Fase | Qué | Riesgo | Por qué en ese orden |
|---|---|---|---|
| **0** | `fn_kardex_descuadres` (K.2) y mirar el resultado | ninguno | Antes de tocar nada hay que saber cuánto descuadra el inventario real |
| **0 bis** | **Ampliar el `CHECK` de `source` (K.0) y dejar de tragarse el error en `stockMovementService.ts:467`** | bajo | **Lo primero de todo.** Hoy recibir una orden de compra, anular una factura o hacer un traslado no llega al kardex. Sin esto, todo lo demás se construye sobre un libro incompleto |
| **1** | Arreglar `pos_checkout_v1` (K.6, costo≠precio) y los `insert` directos del navegador (I.20) | bajo | Detiene la sangría: todo lo que entre desde hoy es correcto |
| **2** | `fn_kardex_saldo_corrido` (K.1) + su índice; el servicio pasa a usarla con paginación de servidor | bajo | El kardex deja de mentir y deja de romperse a las 1.000 filas |
| **3** | Fechas, huso y moneda: filtros por `todayInTz`, nombre del CSV, `formatPlainDate` en vencimientos, moneda de la organización en `formatCurrency` | bajo | Son correcciones de presentación, independientes |
| **4** | Kardex como página propia: buscador de producto, 14 orígenes, documento enlazado, columna «Quién», exportación completa, estados del kit, filtro de sucursal fuera | bajo | Ya con datos fiables |
| **5** | `MovimientosTable` y `BadgeOrigenMovimiento` compartidos: kardex, movimientos, ajuste, traslado | bajo | Borra 490 líneas duplicadas |
| **6** | Columnas nuevas de K.3 + unicidad de `(product_id, lot_code)` | bajo/medio | Aditivas; la de `lots.organization_id` en dos pasos |
| **7** | Lotes con cantidad: el alta escribe `stock_levels` y movimiento; la tabla lee existencias reales; sucursal como columna | medio | Es el primer momento en que un lote significa algo |
| **8** | Captura de lote en recepción de orden de compra, ajuste y traslado (`LotPicker`) | medio | Sin esto los lotes nunca se llenan |
| **9** | `fn_descontar_stock_fefo` (K.4) + `LotPicker` en el POS + aviso de vencido + bloqueo configurable | **alto** | Toca la venta. Con el camino de compatibilidad, un producto sin lotes se comporta igual que hoy |
| **10** | Reserva por lote de pedidos web y su rastro en el kardex (K.5) | **alto** | La tienda web es lo que tumbó Postgres el 2026-09-14 |
| **11** | Índice único por expresión de `stock_levels` (K.4) y retirada de los dos viejos | **alto** | Solo cuando todo el código nuevo esté desplegado |

---

## O. Dependencias abiertas

1. **El costo histórico no se puede reparar.** Los 2.988 movimientos de venta con el precio en la
   columna de costo, y los 7.262 sin costo, quedan como están. Cualquier informe de valoración
   anterior a la fase 1 es papel mojado, y el kardex debería decirlo con un aviso de corte.
2. **El corte contable** (decisión cerrada 14 de `PATRONES-TRANSVERSALES.md`) manda sobre la
   fase 1: si el dueño fija la fecha antes, el arreglo del costo entra limpio en el libro nuevo.
3. **El umbral de «por vencer»** depende de que exista una pantalla de ajustes de inventario
   donde configurarlo; hoy no la hay.
