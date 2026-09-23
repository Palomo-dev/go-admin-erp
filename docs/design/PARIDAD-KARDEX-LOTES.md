# Paridad — Kardex y Lotes

Una fila por control de `docs/design/AUDITORIA-KARDEX-LOTES.md` (108 controles), con el frame
de Figma que lo recoge y su estado. Archivo: «GO Admin — Sistema de diseño»
(`EAvjINVRnlzFM70GVoWXgl`), página **`04 Inventario`**, cinco Secciones nuevas.

Fecha: 2026-09-22. Sin nombres de organizaciones cliente. «Calcado» = existe hoy y se dibuja
igual; «Nuevo» = no existe en código y va con badge o anotación «Nuevo»; «sustituido por …» =
existe pero roto o fuera de norma y se reemplaza por el componente correcto del kit;
«omitido: …» = no se dibuja, con su motivo.

## Secciones y frames

| Sección | Frames | Anotaciones |
|---|---|---|
| **Kardex** | 15 (6 escritorio + 5 móvil + 4 capas y diálogos) | 11 |
| **Lotes** | 15 (6 escritorio + 5 móvil + 4 diálogos y menús) | 8 |
| **Detalle de producto — Kardex y Lotes** | 4 (2 escritorio + 2 móvil) | 4 |
| **Componentes — Kardex y Lotes (Nuevo)** | 4 componentes | 1 |
| **POS — elegir lote al vender (Nuevo)** | 4 | 3 |

Nombres cortos usados en la columna «Frame Figma»:

- `K-listo`, `K-cargando`, `K-sinres`, `K-vacío`, `K-error`, `K-sinsuc` — escritorio del kardex.
- `K-mov-*` — los cinco móviles del kardex.
- `K-filtros`, `K-menú`, `K-exportar`, `K-descuadre` — capas flotantes y diálogos del kardex.
- `L-listo`, `L-cargando`, `L-sinres`, `L-vacío`, `L-error`, `L-masivo` — escritorio de lotes.
- `L-mov-*` — los cinco móviles de lotes.
- `L-nuevo`, `L-ajustar`, `L-eliminar`, `L-menú`, `L-sheet` — diálogos y menús de lotes.
- `D-kardex`, `D-lotes`, `D-kardex-mov`, `D-lotes-mov` — sub-pestañas del detalle.
- `P-elegir`, `P-sheet`, `P-avisos`, `P-vencido` — POS.
- `C-*` — componentes nuevos.

---

## A. Kardex — página (45 controles)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Esqueleto de carga de la página | `K-cargando` | sustituido por `Skeleton` del kit (`card` y `table-row`); hoy son `div` animados a mano |
| 2 | «No se especificó un producto» | — | **sustituido por la propia pantalla**: el kardex deja de exigir `?producto=` y pasa a ser un listado con buscador de producto (`K-listo`). El estado desaparece porque su causa desaparece |
| 3 | «Producto no encontrado» | `K-sinres` | sustituido por `EmptyState Variant=search` con «Limpiar filtros» |
| 4 | (sin estado de error de página) | `K-error` | **Nuevo** · `EmptyState Variant=error` con «Reintentar» |
| 5 | Caja de icono de pantalla | `K-listo` | sustituido por la ranura `Icono` del `PageHeader` con `Icon/BookOpen` (el kardex es el libro de movimientos). Hoy es una caja `bg-blue-100` dibujada a mano |
| 6 | «Kardex de Producto» | `K-listo` | sustituido por «Kardex»: ya no es de un producto |
| 7 | Subtítulo `{producto} · SKU: {sku}` | `K-listo` | sustituido por «Mi empresa S.A.S. · 13.412 movimientos · saldo corrido por producto y sucursal» |
| 8 | «Volver al Producto» | `K-menú` | sustituido por el ítem «Ver el kardex de este producto» del menú «⋯» y por las migas del `PageHeader` |
| 9 | «Actualizar» | `K-listo` | calcado, como `IconButton` secundario del `PageHeader` |
| 10 | «Exportar» | `K-listo` · `K-exportar` | calcado el botón; el alcance se elige en un diálogo **Nuevo** (hoy baja solo la página visible sin decirlo, I.4) |
| 11 | (sin migas) | `K-listo` | **Nuevo** · `Breadcrumbs` del `PageHeader`: Inventario › Movimientos › Kardex |
| 12 | `BranchBadge` suelto | `K-listo` | sustituido: el badge va **dentro** de la cabecera, debajo del título (patrón 9.5) |
| 13 | Sincronización con la sucursal del header | `K-listo` · `K-filtros` | calcado como regla; el filtro propio de sucursal se elimina (patrón 9) |
| 14 | «Total Entradas» | `K-listo` | sustituido por `StatCard` «Entradas del periodo», tono éxito |
| 15 | «Total Salidas» | `K-listo` | sustituido por `StatCard` «Salidas del periodo», tono peligro |
| 16 | «Saldo Actual» | `K-listo` · `K-descuadre` | sustituido por «Saldo al cierre», con el detalle «contra N en existencias». Hoy el valor es el neto del rango filtrado, no un saldo (F.1) |
| 17 | «Valor Inventario» | `K-listo` | sustituido por «Valor del saldo», «al costo promedio móvil». Depende de K.1 y de arreglar el costo del POS (E.1) |
| 18 | Rótulo «Filtros» de la tarjeta | `K-filtros` | sustituido por `FilterButton` + `FilterPanel Layout=popover` (patrón 3) |
| 19 | `Select` de sucursal | — | **omitido a propósito**: patrón 9 prohíbe un filtro de sucursal propio. El panel lo dice en un aviso |
| 20 | `Select` de origen (9 de 14) | `K-filtros` | sustituido por «Tipo de movimiento» con **los 23 orígenes** que acepta el `CHECK` una vez ampliado (K.0) |
| 21 | `Select` de dirección | `K-filtros` | **omitido: redundante.** Entrada y salida ya son dos columnas de la tabla y dos KPI; filtrar por dirección se resuelve ordenando |
| 22 | «Desde» | `K-filtros` | sustituido por `DateRange` del kit, con la nota «en el huso de la organización, no en UTC» (I.3) |
| 23 | «Hasta» | `K-filtros` | ídem, mismo control |
| 24 | «Limpiar filtros» | `K-listo` · `K-filtros` | calcado; además «Limpiar todo» en la cabecera del panel |
| 25 | (sin chips de filtros activos) | `K-listo` | **Nuevo** · `FilterChips` bajo la fila de búsqueda |
| 26 | «Mostrando N de M movimientos» | `K-listo` | sustituido por el resumen de la `Pagination` única del kit; el contador suelto desaparece (patrón 4.1) |
| 27 | Esqueleto de tabla a mano | `K-cargando` | sustituido por `Skeleton Variant=table-row` × 6, con la paginación visible y apagada (patrón 2) |
| 28 | Vacío «No hay movimientos registrados» | `K-vacío` · `K-sinres` | sustituido por dos estados distintos del kit, cada uno con su acción (hoy comparten texto y no tienen salida, I.24) |
| 29 | Columna «Fecha» | `K-listo` | calcado (fecha + hora en dos líneas, ya pasa por el huso de la organización) |
| 30 | Columna «Dirección» | `K-listo` | sustituido: la dirección se lee de las columnas Entrada/Salida y del color; la columna desaparece |
| 31 | Columna «Cantidad» | `K-listo` | sustituido por dos columnas, «Entrada» y «Salida», que es como se lee un kardex |
| 32 | Columna «Costo Unit.» | `K-listo` | calcado. Anotado: en las ventas del POS hoy guarda el **precio de venta** (E.1) |
| 33 | Columna «Valor Total» | `K-listo` | **omitido: cabe en el tooltip.** Es `costo × cantidad`; su sitio es el detalle del movimiento, no una columna más |
| 34 | Columna «Saldo» | `K-listo` · `C-SaldoCorridoCell` | calcado como columna, **Nuevo** como cálculo: el saldo lo da `fn_kardex_saldo_corrido` (K.1) |
| 35 | Columna «Origen» con badge | `K-listo` · `C-BadgeOrigenMovimiento` | sustituido por el componente nuevo, con los 23 orígenes y tonos de `SISTEMA-BADGES.md` |
| 36 | Columna «Sucursal» | `K-listo` | calcado (obligatoria en vista consolidada, patrón 9.5) |
| 37 | Columna «Documento» con el UUID crudo | `K-listo` · `K-menú` | sustituido por el número del documento **enlazado** (`VTA-004821`, `OC-131`), con «por {persona}» debajo |
| 38 | Columna «Nota» truncada con `title` | `K-menú` | sustituido: la nota pasa al detalle del movimiento; el tooltip nativo no es accesible |
| 39 | (sin acciones de fila) | `K-menú` | **Nuevo** · menú «⋯» con 5 entradas, ninguna destructiva: un movimiento de kardex no se borra |
| 40 | Paginación | `K-listo` | sustituido por la `Pagination Layout=full` del kit, **de servidor** (hoy corta en memoria y se rompe a las 1.000 filas, I.1) |
| 41 | Toast «No se pudo actualizar el kardex» | `K-error` | sustituido por el estado de error de la pantalla |
| 42 | Toast «No se pudo cargar el kardex» | `K-error` | ídem |
| 43 | Toast «No hay datos para exportar» | `K-exportar` | sustituido: el diálogo deshabilita el alcance vacío y dice por qué |
| 44 | Toast «Exportación exitosa» | `K-listo` | calcado (`Toast Variant=success` del kit) |
| 45 | Toast «No se pudo exportar» | `K-listo` | calcado (`Toast Variant=error`) |

**Nuevos del kardex que no salen de un control existente**

| Pieza | Frame | Por qué |
|---|---|---|
| Columna «Lote» | `K-listo` | `stock_movements.lot_id` existe y no se muestra en ninguna parte (H.3) |
| Autor del movimiento | `K-listo` (segunda línea de «Documento») | `updated_by` existe y no se muestra. Es la pregunta número uno de un kardex |
| Aviso de cuadre | `K-listo` | sale de `fn_kardex_descuadres` (K.2) |
| Aviso de **descuadre** | `K-descuadre` | la otra cara: destapa los doce caminos de E.10 |
| Buscador único | `K-listo` | hoy el kardex no tiene buscador |
| Estado «sin sucursal asignada» | `K-sinsuc`, `K-mov-sinsuc` | patrón 10; el kardex es de ámbito de sucursal |

---

## B. Lotes — página (59 controles)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 46 | Icono «← volver» sin rótulo | `L-listo` | sustituido por las migas del `PageHeader` (Inventario › Existencias › Lotes) |
| 47 | Caja azul con `Package2` dentro del `h1` | `L-listo` | sustituido por la ranura `Icono` del `PageHeader` con `Icon/Layers` |
| 48 | «Gestión de Lotes» | `L-listo` | sustituido por «Lotes»: el sistema no antepone «Gestión de» a ninguna otra pantalla |
| 49 | «Inventario / Lotes - Trazabilidad y vencimientos» | `L-listo` | sustituido: eran migas escritas como texto. Ahora el subtítulo cuenta el volumen real |
| 50 | Icono de recargar sin rótulo ni tooltip | `L-listo` | calcado como `IconButton` del `PageHeader`, con tooltip |
| 51 | «Nuevo Lote» | `L-listo` · `L-nuevo` | calcado como acción primaria, con la acentuación normalizada a «Nuevo lote» |
| 52 | (sin `BranchBadge`) | `L-listo` | **Nuevo** · el badge aparece porque el lote pasa a tener sucursal (K.3) |
| 53 | KPI «Total lotes» | `L-listo` | sustituido por «Lotes vigentes», que es lo accionable |
| 54 | KPI «Vencidos» | `L-listo` | calcado, tono peligro, con «N uds bloqueadas para la venta» |
| 55 | KPI «Por vencer (30d)» | `L-listo` | calcado; el umbral pasa a ser configurable (K.3) |
| 56 | KPI «Con stock» (siempre 0) | `L-listo` | sustituido por «Valor en riesgo». El original es inútil: `stock_quantity` está cableado a 0 (I.5) |
| 57 | «Lista de Lotes» | — | **omitido: redundante.** El título de la tarjeta repetía el de la pantalla (patrón 4.1) |
| 58 | `Select` de estado | `L-listo` (chips) | sustituido por el `FilterPanel` + `FilterChips`, patrón 3 |
| 59 | `Select` de producto con todos los productos | `L-listo` | sustituido por el `ProductPicker` del kit dentro del panel: un `Select` plano con 4.000 productos no se puede usar |
| 60 | «Buscar lotes...» | `L-listo` | sustituido por el `SearchBar` único del kit. Hoy el buscador se anula si hay filtro de estado (I.7) |
| 61 | (sin chips activos) | `L-listo` | **Nuevo** · `FilterChips` con «Limpiar filtros» |
| 62 | Carga: un `Skeleton` de 32×32 | `L-cargando` | sustituido por `Skeleton card` × 4 y `table-row` × 5 |
| 63 | Vacío «No hay lotes registrados» | `L-vacío` · `L-sinres` | sustituido por dos estados con acción; el texto explica qué es un lote y cómo se llena |
| 64 | Columna «Código» | `L-listo` | calcado, con «creado {fecha}» debajo (`lots.created_at` existe y no se muestra) |
| 65 | Columna «Producto» | `L-listo` | calcado (nombre + SKU) |
| 66 | Columna «Proveedor» | `L-listo` | calcado, ahora **enlazado** al proveedor |
| 67 | Columna «Vencimiento» | `L-listo` | calcado, con «en N días» debajo y el conversor correcto (`formatPlainDate`, I.8) |
| 68 | Columna «Stock» (siempre 0) | `L-listo` | **Nuevo de verdad**: cantidad real leída de `stock_levels`, por lote y sucursal (I.5) |
| 69 | Badge de estado | `L-listo` · `C-BadgeVencimiento` | sustituido por el componente nuevo, 4 variantes |
| 70 | Fila con fondo rojo si está vencido | `L-listo` | calcado, con borde además del fondo (`SISTEMA-BADGES.md`) |
| 71 | Icono `Edit` en la fila | `L-menú` | sustituido: pasa al menú «⋯» (patrón 6: máximo dos iconos y ninguno destructivo) |
| 72 | Icono `Copy` (duplicar sin confirmar) | — | **omitido: no aporta.** Un lote duplicado con el mismo vencimiento y sin cantidad no significa nada (I.22). Su sitio lo ocupa «Ajustar cantidad» |
| 73 | Icono `Trash2` rojo en la fila | `L-menú` · `L-eliminar` | sustituido: lo destructivo va al final del menú, en rojo y tras divisor, y pasa por `ConfirmDialog` (patrón 6.4) |
| 74 | (iconos sin `aria-label` ni tooltip) | `L-menú` | sustituido por el menú, que lleva etiqueta de texto |
| 75 | Botón de borrar deshabilitado sin explicación | `L-eliminar` | sustituido: el diálogo dice **por qué** no se puede borrar y con cuántas unidades (patrón 6.6) |
| 76 | Paginación en cliente, visible en el vacío | `L-listo` | sustituido por la `Pagination` del kit, de servidor, ausente en vacío y error (patrón 2) |
| 77 | «Navegación Rápida» | — | **omitido: no existe en ninguna otra pantalla.** Duplica el menú lateral y el botón «volver» (patrón 4.1) |
| 78 | Botón «Productos» | — | omitido con la tarjeta anterior |
| 79 | Botón «Stock» | — | ídem |
| 80 | Botón «Proveedores» | — | ídem |
| 81 | Botón «Inventario» | — | ídem; además duplicaba el «volver» de la cabecera |
| 82 | Título «Nuevo Lote» / «Editar Lote» | `L-nuevo` | calcado, acentuación normalizada |
| 83 | Descripción del diálogo | `L-nuevo` | sustituido: ahora explica qué pasa al guardar (suma existencias y escribe el kardex) |
| 84 | Campo «Producto *» | `L-nuevo` | sustituido por el `ProductPicker` del kit |
| 85 | Campo «Código de Lote *» | `L-nuevo` | calcado, con la ayuda de unicidad por producto (K.3) |
| 86 | Campo «Fecha de Vencimiento» | `L-nuevo` | sustituido por el control de fecha del kit; hoy es un `input type="date"` nativo |
| 87 | Campo «Proveedor» | `L-nuevo` | sustituido por el `SupplierPicker` del kit |
| 88 | (sin sucursal ni cantidad) | `L-nuevo` | **Nuevo** · «Sucursal», «Cantidad inicial» y «Costo unitario». Sin ellos, crear un lote no mueve nada, que es lo que pasa hoy |
| 89 | «Cancelar» | `L-nuevo` | calcado (patrón 8: se llama «Cancelar») |
| 90 | «Guardar» / «Guardando...» | `L-nuevo` | calcado como «Crear lote» / «Guardar cambios» |
| 91 | Toast «El código de lote es requerido» | `L-nuevo` | sustituido por validación en el propio campo (`FormField State=error`) |
| 92 | Toast «Selecciona un producto» | `L-nuevo` | ídem |
| 93 | Toast «Lote creado» / «Lote actualizado» | `L-listo` | calcado |
| 94 | Toast «No se pudo guardar» | `L-nuevo` | calcado |
| 95 | «¿Eliminar lote?» | `L-eliminar` | sustituido por `ConfirmDialog Variant=destructive` **citando el código del lote** (patrón 8) |
| 96 | Descripción del borrado | `L-eliminar` | sustituido: dice cuántas unidades tiene y por qué no se puede |
| 97 | «Cancelar» del borrado | `L-eliminar` | calcado |
| 98 | «Eliminar» | `L-eliminar` | calcado, con la guarda de existencias funcionando (hoy es inalcanzable, I.6) |
| 99 | Toast «Lote eliminado» | `L-listo` | calcado |
| 100 | Toast «No se puede eliminar un lote que tiene stock» | `L-eliminar` | sustituido: es una condición previa, no un error posterior |
| 101 | Toast «…tiene movimientos asociados» | `L-eliminar` | ídem |
| 102 | Toast «Lote duplicado» | — | omitido con el control 72 |
| 103 | Toast «No se pudo duplicar» | — | ídem |
| 104 | Toast con el mensaje crudo de PostgREST | `L-error` | sustituido por el estado de error de la pantalla con «Reintentar» |

**Nuevos de lotes que no salen de un control existente**

| Pieza | Frame | Por qué |
|---|---|---|
| Columna «Sucursal» | `L-listo` | `lots` no tiene `branch_id`; sin sucursal un lote no sabe dónde está (G.1) |
| Aviso de vencidos con acción | `L-listo` | 8 lotes vencidos siguen contando como existencias y nada lo dice |
| Selección múltiple y `BulkActionBar` | `L-masivo` | patrón 1; hoy no hay selección en lotes |
| Menú «⋯» de fila con 6 entradas | `L-menú`, `L-sheet` | patrón 6 |
| «Ajustar cantidad del lote» | `L-ajustar` | la cantidad por lote no se puede cambiar hoy porque no existe |
| «Marcar como vencido» y «Dar de baja por merma» | `L-menú` | cierran el ciclo del lote vencido; `loss` está en el `CHECK` y nunca se usa (E.8) |

---

## C. Sub-pestañas del detalle de producto (4 controles)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 105 | Sub-pestaña «Stock» | (ya dibujada en «Producto — Stock y Precios») | calcado, sin tocar |
| 106 | Sub-pestaña «Seriales · 42» | (ya dibujada en «Producto — Seriales») | calcado, sin tocar |
| 107 | Sub-pestaña «Lotes» (solo la etiqueta) | `D-lotes`, `D-lotes-mov` | **Nuevo** · contenido completo: cantidad por lote **y por sucursal**, vencimiento, aviso de próximos a vencer, alta de lote y enlace al listado |
| 108 | Sub-pestaña «Kardex» (solo la etiqueta) | `D-kardex`, `D-kardex-mov` | **Nuevo** · kardex embebido, ya filtrado por este producto y la sucursal activa, con 4 cifras de cabecera, tabla compacta, `Pagination Layout=compact` dentro de la tarjeta y enlace al kardex completo |

En móvil las cuatro sub-pestañas no caben como pestañas: se resuelven con el
`SegmentedControl` del kit (`D-kardex-mov`, `D-lotes-mov`).

---

## Integración con lo ya diseñado

| Desde dónde | Adónde lleva | Frame |
|---|---|---|
| Detalle de producto › Inventario › Kardex | página de kardex filtrada por ese producto | `D-kardex` → «Ver kardex completo →» |
| Detalle de producto › Inventario › Lotes | página de lotes filtrada por ese producto | `D-lotes` → «Ver todos los lotes →» |
| Menú «⋮» de la fila de stock por sucursal (lo dibuja otro agente en «Producto — Stock y Precios») | «Ver kardex de esta sucursal» → `K-listo` con producto y sucursal puestos · «Ver lotes y seriales aquí» → `L-listo` con producto y sucursal puestos | anotado en `D-kardex` y `D-lotes` |
| Fila del kardex, menú «⋯» | documento de origen, kardex del producto, lote del movimiento | `K-menú` |
| Recepción de orden de compra | captura de lote con `LotPicker` | `C-LotPicker`, anotado como dependencia |
| Ajuste de inventario y traslado entre sucursales | captura de lote con `LotPicker` | `C-LotPicker`; ambas tablas ya tienen la columna `lot_id` y nadie la llena (I.30) |
| POS, al agregar al carrito | selección de lote o descuento automático por vencimiento | `P-elegir`, `P-sheet`, `P-avisos`, `P-vencido` |

---

## Componentes compartidos

Declarados en la Sección «Componentes — Kardex y Lotes (Nuevo)» de la página `04`, para
consolidar después en `02 Componentes`.

| Componente | Variantes | Dónde se usa | Qué sustituye |
|---|---|---|---|
| **`BadgeOrigenMovimiento`** | 14 (una por valor de `stock_movements.source`) | kardex, movimientos, kardex embebido, detalle de ajuste y de traslado | los **tres** mapas `getSourceColor` duplicados en `KardexTable.tsx:46-62`, `MovimientosTable.tsx:55-67` y la tabla de informes, con valores que no coinciden entre sí y dos de ellos usando `waste`, que la base rechaza |
| **`BadgeVencimiento`** | 4 (Vigente · Por vencer · Vencido · Sin vencimiento) | listado de lotes, `LotPicker`, lotes embebidos, avisos del POS | los badges a mano de `LotesPage.tsx:228-239` |
| **`LotPicker`** | 1 componente, pensado para variantes `Layout=popover / dialog / inline / sheet` | POS al vender, recepción de orden de compra, ajuste de inventario, traslado | **nada**: no existe ni en el kit ni en el código |
| **`SaldoCorridoCell`** | 1 | `MovimientosTable` | `getBalanceColor` de `KardexTable.tsx:64-68` |

**`MovimientosTable` no se declara como componente aparte**: es la composición de
`BadgeOrigenMovimiento` + `SaldoCorridoCell` + `TableCell` del kit dentro de la `DataTable`.
Lo que sí hay que hacer en código es **borrar las tres implementaciones** (`KardexTable.tsx`
227 líneas, `MovimientosTable.tsx` 263 y la tabla de `ReportesPage.tsx:294-497`) y dejar una.

Todo lo demás se **instancia** del kit sin redibujar: `PageHeader`, `Breadcrumbs`, `StatCard`,
`SearchBar`, `FilterButton`, `FilterChips`, `DataTable`, `TableCell`, `Pagination`,
`BulkActionBar`, `EmptyState`, `EmptyStateSinSucursal`, `Skeleton`, `Toast`, `ConfirmDialog`,
`MenuItem`, `Select`, `DateRange`, `FormField`, `SegmentedControl`, `Checkbox`, `Switch`,
`Button`, `IconButton`, `BranchBadge`, `MobileHeader`, `MobileTabBar`, `Sidebar`, `AppHeader`.
Las seis pantallas de escritorio del kardex y las seis de lotes son **clones de la pantalla
aprobada** «Escritorio / Órdenes de compra — listo», y las cuatro del detalle son clones de
«Escritorio / Detalle — Inventario › Stock (listo)»: ninguna se montó a mano.

---

## Chequeo por script

Ejecutado sobre las cinco Secciones nuevas, criterio a criterio:

| Criterio | Resultado |
|---|---|
| Secciones que se solapan entre sí (todas las de la página) | **0** |
| Frames de primer nivel que se solapan dentro de una Sección | **0** |
| Nodos fuera de su Sección | **0** |
| Instancias rotas (`getMainComponentAsync` nulo) | **0** |
| Textos truncados (ancho natural > ancho del nodo) | **0** |
| Contenido desbordado fuera de su frame | **0** |
| Etiquetas o contadores heredados de otra pantalla | **0** |
| Instancias por debajo de su ancho publicado | **0** |
| Anotaciones dentro de frames | **0** |
| Capas flotantes ancladas a su disparador (patrón 11) | **0 incumplimientos** |

Dos avisos del script se revisaron y se descartaron como falsos positivos: el subtítulo
«SKU ZAP-0042 · Calzado · Par · Producto · Nova · Ref NV-URB-42» de los dos frames del detalle
es el subtítulo real de la pantalla aprobada que se instancia, no una etiqueta heredada.

Defectos encontrados por el propio chequeo y corregidos antes de cerrar:

1. El `BottomSheet` del menú de lote conservaba el título «Precios y costos» del componente
   del kit (patrón 12). Se rehízo con la cabecera del lote y sus seis acciones.
2. El `FilterPanel` instanciado traía los campos del catálogo de productos («Con variantes»,
   «Sin imagen», «Stock»). Se rehízo con los campos del kardex.
3. El `FilterPanel`, el menú «⋯» de fila y la `BulkActionBar` nacían apilados al final del
   contenido en vez de pegados a su disparador: el frame `Página` es un auto-layout vertical y
   hay que marcarlos `layoutPositioning = ABSOLUTE`. Corregido y comprobado por script.
4. Dos frames del detalle arrastraban el menú flotante que otro agente dibujó para la
   sub-pestaña «Stock». Eliminado.
5. Celdas de tabla vacías quedaban a 100 px de alto (un auto-layout sin hijos conserva
   100×100). Corregido.

---

## Capturas

`docs/design/figma/`

| Archivo | Qué muestra |
|---|---|
| `32-kardex-escritorio-listo.png` | Kardex, estado listo |
| `32-kardex-movil-listo.png` | Kardex móvil |
| `32-kardex-filtros-abiertos.png` | `FilterPanel` anclado bajo «Filtros» |
| `32-kardex-menu-de-fila.png` | Menú «⋯» de la fila |
| `32-kardex-descuadre.png` | Aviso de descuadre (Nuevo) |
| `32-kardex-detalle-producto.png` | Kardex embebido en el detalle |
| `32-kardex-detalle-producto-movil.png` | Ídem en móvil |
| `32-kardex-lotes-badge-origen.png` | `BadgeOrigenMovimiento`, 14 variantes |
| `32-lotes-escritorio-listo.png` | Lotes, estado listo |
| `32-lotes-movil-listo.png` | Lotes móvil |
| `32-lotes-movil-sheet-acciones.png` | Hoja de acciones del lote |
| `32-lotes-seleccion-masiva.png` | Selección y `BulkActionBar` |
| `32-lotes-dialogo-nuevo-lote.png` | «Nuevo lote» con sucursal, cantidad y costo |
| `32-lotes-detalle-producto.png` | Lotes embebidos en el detalle |
| `32-lotes-componente-lotpicker.png` | `LotPicker` |
| `32-lotes-pos-elegir-lote.png` | Elegir lote al vender (Nuevo) |

Las capturas salen del MCP de Figma, que entrega como máximo 1.024 px de ancho: los frames de
1.440 se ven a escala 0,71. El original en el archivo está a escala 1.

---

## Recuento

| | Controles |
|---|---|
| Calcados | 38 |
| Sustituidos por el componente correcto del kit | 49 |
| Nuevos (no existen en código) | 13 |
| Omitidos con motivo escrito | 8 |
| **Total** | **108** |

Los 8 omitidos, con su motivo, son: #19 filtro de sucursal (patrón 9), #21 filtro de dirección
(redundante con dos columnas), #33 columna «Valor Total» (cabe en el detalle), #57 «Lista de
Lotes» (duplica el título), #72 y #102-103 duplicar lote (no significa nada), #77-81 «Navegación
Rápida» (duplica el menú lateral). Cero omitidos sin motivo.

Además se dibujaron **18 piezas nuevas** que no salen de ningún control existente y por eso no
cuentan en el total: las seis del kardex, las seis de lotes, las dos sub-pestañas embebidas y
las cuatro del POS.
