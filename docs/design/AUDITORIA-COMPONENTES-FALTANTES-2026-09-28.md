# Auditoría de componentes faltantes — páginas con la nueva estructura (2026-09-28)

Pedido del dueño (2026-09-28): «En el POS faltó el componente selector de variantes que está en Figma, y de una
vez revisa qué más componentes faltaron en las páginas hasta el momento actualizadas con la nueva estructura».

Figma: archivo `EAvjINVRnlzFM70GVoWXgl`. Kit: `src/components/kit` + `docs/design/KIT-CODIGO.md`.

Contenido:

1. El selector de variantes del POS (hecho)
2. Método y cifras de la auditoría
3. Hallazgos transversales
4. Tabla por página con estado
5. Pendientes grandes o bloqueados, con prioridad

---

## 1. El selector de variantes del POS

### Dónde está en Figma

| Qué | Node id |
|---|---|
| Componente `VariantModifierDialog` (`02 Componentes`) | **`155:7980`**: `Layout=desktop` `155:7746` (560 × 672) · `Layout=sheet` `155:7862` (390 × 720) |
| Escritorio, POS con el diálogo abierto (`05 POS y ventas`) | frame `158:27344`, instancia `158:28008` |
| Móvil, hoja inferior | frame `159:31608`, instancia `159:31735` |
| Validación «Selecciona una opción en "Plantilla"» | `198:14706` |
| Lista de variantes sin atributos agrupables | `198:14715` |

La descripción del componente en Figma: «Sustituye a VariantSelectorDialog. Sheet en móvil», con stock por variante
y cantidad `±` como novedades. En código seguía el diálogo viejo de shadcn (`bg-blue-600`, `dark:`), sin stock, sin
cantidad y con las filas de modificadores sin teclado (un `div` con `onClick` y la casilla sin eventos).

### Cómo se modela una variante (verificado en la base)

No hay tabla `product_variants`. Una variante es un **producto hijo**: `products.parent_product_id` apunta al padre
(`is_parent = true`) y sus atributos están en `products.variant_data jsonb` (`{"Talla": "40", "Color": "Negro"}`,
claves de texto libre; `variant_types` / `variant_values` / `product_variant_relations` son el catálogo, que el POS no
lee). El precio vigente sale de `product_prices` (`precioVigente`) y el stock de `stock_levels` (`branch_id`,
`qty_on_hand`, filas sin lote), igual que la tarjeta del catálogo.

### Qué se construyó

- **Kit: `SelectorVariantes`** (`src/components/kit/SelectorVariantes.tsx` + `selectorVariantesLogica.ts`), fiel a
  `155:7980` y montado sobre `PanelAdaptable`: diálogo de 560 en escritorio y tableta horizontal (≥ 1024 px), hoja
  inferior con asa por debajo (móvil y tableta vertical). Cabecera con miniatura de 56 (prop nueva `miniatura` de
  `PanelAdaptable`), nombre y «Elige talla y color · 6 variantes»; un grupo de botones por atributo; resumen con
  «40 · Negro · SKU», punto y texto de stock y precio; grupos de modificadores con su insignia («Obligatorio · elige 1»
  en ámbar, «Hasta 2» neutra) y casillas de 18 px; pie con cantidad `− n +` y «Agregar N · $ total». Controlado y de
  presentación: no decide nada.
- **POS: `VariantSelectorDialog`** (`src/components/pos/VariantSelectorDialog.tsx`) carga variantes y
  modificadores, aplica las reglas de `src/lib/pos/venta/modificadores.ts` (las de siempre más `estadoAtributos`,
  `varianteAlElegirValor`, `varianteInicial` y `bloqueoVariante`) y dibuja con el kit. Mantiene su nombre y su
  contrato, así que mesas, PMS, envíos y «Agregar productos» cambian de aspecto sin tocarlos. Props nuevas,
  opcionales: `sucursal`, `conCantidad` + `cantidadInicial` y `varianteInicialId`.
- **Stock por variante:** `POSService.getProductVariants(padre, { branchFilter })` (y su equivalente sin conexión en
  `posOfflineReads`) devuelve `stock_quantity` e `is_out_of_stock` por variante. La regla de agotado es una sola,
  `agotadoPorStock` (`src/lib/pos/stockDisponible.ts`), la misma que ahora usa la tarjeta del catálogo: con control de
  stock y sin unidades en la sucursal no se vende.

### Cómo se usa en el POS

1. En la grilla, la tarjeta con «3 var.» (o con modificadores) muestra «Elegir»; tocarla, Enter sobre ella o
   escanear el código del padre abre el selector. Abre en la primera variante **disponible** con precio.
2. Tocar «41» o «Blanco» cambia la variante. Una combinación que no existe con lo elegido se ve atenuada, como en
   Figma, pero se puede tocar: salta a la variante que sí tiene ese valor (con 40-Negro elegido y solo 43-Azul en
   talla 43, tocar «43» lleva a 43-Azul). Antes esos botones quedaban deshabilitados y había combinaciones
   imposibles de alcanzar.
3. El resumen dice «4 disponibles en {sucursal}» (verde), «Agotado en {sucursal}» (rojo, y «Agregar» se deshabilita
   con el motivo) o, si se piden más unidades que las que hay, «Solo hay 4 disponibles y pides 6» (ámbar; no
   bloquea: el cobro ya valida el stock como siempre). Un valor agotado va tachado y el lector de pantalla lo anuncia.
4. Los grupos obligatorios se validan al agregar: aviso «Selecciona una opción en «Plantilla»» sobre el pie y el foco
   va a la primera casilla del grupo.
5. La cantidad abre con la cantidad rápida del buscador (`3*`) y se cambia con `−`/`+`, escribiendo o con ↑/↓. Al
   terminar de cargar, el foco queda en «Agregar»: Enter agrega. La variante llega al carrito con su nombre legible,
   la categoría y la estación del padre (L17) y la cantidad elegida; `pos_checkout_v1` no cambia.
6. Escáner: si el código es de una **variante** de un producto con modificadores, el selector abre con esa variante
   ya elegida (antes se perdía, B-06). Variante sin modificadores, simple o agotado: igual que antes.

Pruebas: `src/__tests__/pos/venta/selectorVariantes.test.ts` (reglas puras), `src/components/kit/__tests__/
renderSelectorVariantes.test.tsx` (render, teclado, móvil, inglés) y `src/__tests__/pos/venta/catalogo/
variantSelectorDialog.test.tsx` (interacción con el servicio simulado).

---

## 2. Método y cifras

Seis auditorías de solo lectura, una por área, comparando los frames aprobados de Figma (11 llamadas `get_metadata`,
ninguna `get_design_context`, más los node-ids que ya citan los planes) con lo que renderiza el código, y buscando
piezas del kit que existen pero la página rehace a mano. Fuentes: `docs/implementacion/{POS-PLAN, CAJAS-VENTAS-PLAN,
FACTURAS-VENTA-CXC-PLAN, FACTURAS-COMPRA-CXP-PLAN, KIT-COMPARTIDO, INVENTARIO-PLAN}.md`, `docs/design/KIT-CODIGO.md`,
`POS-UX-V2.md` §7.5 y las paridades de cada módulo.

Clasificación: **SEGURO** = pieza del kit que ya existe (o `ui/*`) y reemplazo en la página sin cambiar lógica de
negocio · **GRANDE** = requiere lógica, datos nuevos o una pieza que el kit no tiene · **BLOQUEADO** = zona de otra
sesión o decisión pendiente del dueño.

| Área | Hallazgos | Hechos ahora | Pendientes | Commit |
|---|---|---|---|---|
| Selector de variantes del POS | 1 | 1 | — | `4f34fa65` |
| POS venta (`/app/pos`) | 46 | 32 (+ 2 parciales) | 12 | `c8c01616` |
| Mesas, comandas y reservas | 41 | 29 (+ 4 interinos, 2 parciales) | 6 | `0a3084a1` |
| Cajas, ventas y devoluciones | 54 | 28 | 26 | `baf23030` |
| Facturas de venta, CxC y documentos | 61 | 24 (+ 4 parciales) | 33 | `97759d8c` |
| Facturas de compra, CxP, tesorería e impuestos | 56 | 39 | 17 | `c554ce34` |
| Inicio | 39 | 26 | 13 | `d1a94ffe` |
| Inventario / productos | 4 | — | 4 (BLOQUEADO) | — |

El detalle de cada hallazgo (props exactas y archivo:línea antes del cambio) quedó en los informes de trabajo de la
auditoría; aquí va lo que el dueño necesita: qué falta, dónde, qué se hizo y qué queda.

## 3. Hallazgos transversales

1. **La paginación de 25 caía en silencio a 10.** El kit solo acepta `[10, 20, 50, 100]` (`kit/paginacion.ts`) y
   `listadoUrl.ts` devuelve el primero si el pedido no está en la lista. Cinco listados pedían 25, lo que dibuja
   Figma («Mostrando 1–25»), y mostraban 10. **Arreglado** en facturas de venta, cartera, facturas de compra y CxP
   (pasan `tamanosPermitidos: [25, 50, 100]`, como ya hacía `CatalogoProductos`), con pruebas que lo fijan.
   **Pendiente:** `inventario/etiquetas/EtiquetasPage.tsx` (zona de inventario).
2. **`ListaPagos` del kit no lo usa ninguna página** (0 importaciones). Adoptarlo en el cobro es GRANDE: le falta
   elegir el pago activo y 5 pruebas fijan el tramo actual de `CheckoutDialog`.
3. **`RelatedLinkCard` no se exportaba en `kit/index.ts`.** Exportado ahora (junto con `SelectorVariantes`).
4. **Componentes locales que tapaban al kit con el mismo nombre:** `pos/comandas/PageHeader.tsx` y `EmptyState.tsx`.
   **Borrados**; comandas usa los del kit. Queda la `Tarjeta` local de `inventario/.../PreciosCostos.tsx` (bloqueada).
5. **`DialogoMotivo` pide 5 caracteres por defecto**; en mesas el servidor exige 3: se pasa `minimo={3}`.
6. **`estadoTono` no conoce** los estados de mesa (`free`, `occupied`, `reserved`, `bill_requested`), `expired`
   (cotizaciones, saldos a favor) ni los de tarea (`todo`, `in_progress`, `done`). Hoy las páginas pasan `tono`
   explícito; hay que añadirlos al kit. Además `kit.estados` no tiene la etiqueta de `sin_fe` en ningún idioma y
   por eso falla hoy `src/__tests__/i18n/traduccionesModulos.test.ts` (4 pruebas; el estado lo añadió otra sesión).
7. **Piezas de Figma que el kit no tiene** y que bloquean hallazgos en varias páginas (ver §5.1).
8. **Documentación:** `KIT-CODIGO.md` decía que Mesas usa `ViewToggle` (el dueño eligió `SelectorVista` +
   `SelectorDensidad` el 2026-09-24) y no documentaba `kit/receta`. Corregido con un anexo.
9. **Fechas prohibidas:** `reservas-mesas/page.tsx` usaba `toISOString().split('T')[0]` y `CotizacionesTable`
   `split('T')`. **Corregidos** (`todayInTz` y `formatPlain`).

## 4. Tabla por página

Estado: **Hecho** = aplicado en el commit de su área · **Parcial** · **Interino** = mejora segura mientras llega el
componente propio · **Pendiente** (GRANDE, con el motivo) · **Bloqueado** (con el motivo).

### 4.1 POS venta (`/app/pos`) — commit `c8c01616`

| Componente Figma (node-id) | Dónde (frame → archivo) | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `VariantModifierDialog` (`155:7980`) | `158:27344`, `159:31608` → `pos/VariantSelectorDialog.tsx` | diálogo viejo sin stock ni cantidad | alto | **Hecho** (`4f34fa65`, §1) |
| `Badge` ×2 contadores (`185:48713`, `185:48720`) | `184:31722` → `venta/CabeceraPos.tsx` | píldoras a mano | medio | **Hecho** |
| `KbdButton` «Cerrar caja» lg al final (`248:80110`) | `CabeceraPos.tsx` | md y en primer lugar | bajo | **Hecho** |
| `Badge` total y conteo del `CartTab` (`906:115555/56`) | `CartTabs.tsx` | texto y `<span>` | medio | **Hecho** (`clasesBadgeTono`: va dentro de un botón) |
| Ver y Editar del cliente (`906:115573/74`) | `CustomerSelector.tsx` | no salían | medio | **Hecho**: pestaña nueva para no cortar la venta; solo en el POS de venta; oculto para clientes sin sincronizar |
| «Carrito · N productos · Cliente: X» (`906:115576-80`) | `CartView.tsx` | solo «Carrito» | bajo | **Hecho** |
| `Switch` «Impuestos incluidos» en una fila con el `Select` (`906:115587/88`) | `TaxSummary.tsx` | checkbox con `role=switch` a mano | medio | **Hecho** |
| `Badge` Predeterminado, unidades de la barra móvil, «Opcional» de la receta | `TaxSummary`, `BarraCobroMovil`, `RecetaDialogo` | píldoras a mano | bajo | **Hecho** |
| `KbdButton` «Seguir comprando», «Reintentar», «Actualizar», «Cerrar» de receta, pie de descuentos | `page.tsx`, `GrillaProductos`, `LocalCatalogNotice`, `RecetaDialogo`, `DialogoDescuento` | `<button>` a mano | bajo | **Hecho** |
| IconButton «⋯» de la cabecera móvil y del escáner | `page.tsx`, `GrillaProductos.tsx` | `<button>` a mano | bajo | **Pendiente**: el kit no tiene IconButton |
| Franja «Catálogo local» bajo la cabecera (`185:48646`) | `LocalCatalogNotice.tsx` | dentro de la grilla | medio | **Parcial**: el botón sí; mover la franja cambia la composición de la página |
| Contador de productos al pie de la grilla | `GrillaProductos.tsx` | junto a las categorías | bajo | **Hecho** (desde `md`) |
| Receta: `StatusBadge`, `EmptyState` | `RecetaDialogo.tsx` | píldoras y `<p>` | bajo | **Hecho**; rejilla de datos con `FilaDato`: pendiente (medio, frame sin verificar) |
| `Textarea`, `CampoNumero` «Días de plazo», `EmptyState` de error | `CartView.tsx` | controles a mano | medio | **Hecho** |
| `CampoNumero` en descuentos (diálogo y línea) | `DialogoDescuento`, `EditorDescuentoLinea` | `<input>` a mano | bajo | **Hecho** |
| `SegmentedControl` cocina/cliente de la nota (`847:30394`) | `EditorNotaLinea.tsx` | botones `aria-pressed` | bajo | **Pendiente** (medio: perdería el truco que conserva el foco) |
| `NumberInput` del monto del cobro (`247:70099`) | `cobro/EditorPagoCobro.tsx` | símbolo + `<input>` | medio | **Pendiente**: `CampoNumero` no se resincroniza con un valor externo mientras tiene el foco («Exacto · Alt+E» dejaría el monto viejo); falta en el kit |
| `Chip` ×5 de billetes (`247:70123…31`) | `EditorPagoCobro.tsx` | píldoras | bajo | **Pendiente**: el kit no tiene chip de acción |
| `Tarjeta` «Métodos de pago», `Badge` «Pago N» (`247:70135`) | `CheckoutDialog.tsx` | `<section>`, `<span>` | bajo | **Hecho** |
| Lista de pagos → `ListaPagos` | `CheckoutDialog.tsx` | lista a mano | alto | **Pendiente** (GRANDE, §3.2) |
| `Checkbox` impuestos incluidos (`247:70185`) y QR en pantalla | `CheckoutDialog.tsx` | `<input type=checkbox>` | medio | **Hecho** |
| Propina: botones %, `FormField` monto (`247:71734`), fila «Propina» (`247:71750`) | `247:71297` → `CheckoutDialog.tsx` | a mano | medio | **Hecho**; el monto sigue en `Input` por la misma razón del cobro (parcial) |
| `FormField` Mesero y Vendedor; `CampoNumero` comisión | `CheckoutDialog.tsx` | `label` + controles | bajo | **Hecho** |
| Entrega: `FormField` en 7 campos | `cobro/EntregaCobro.tsx` | `label` a mano | medio | **Hecho**; tipo de entrega con `SegmentedControl` pendiente (medio); buscador de direcciones pendiente (GRANDE) |
| `ListaDatos` «N productos · ver detalle» | `cobro/ResumenCobro.tsx` | `<ul>` | bajo | **Hecho** |
| `Dialogo` stock insuficiente (`183:2712`) | `CheckoutDialog.tsx` | `AlertDialog` shadcn | medio | **Hecho** |
| `Kbd` «Esc» junto a «×» (`247:69947`) | `kit/PanelAdaptable.tsx` | sin `Kbd` | bajo | **Pendiente** (prop del kit compartido) |
| Diálogos QR (`183:2186…`) y pendientes sin conexión (`187:6906…`) | `shared/QrPaymentDialog.tsx`, `PendientesSinConexionDialog.tsx` | shadcn con `gray-*` y `dark:` | medio | **Pendiente** (GRANDE: compartidos y fijados por 13 pruebas de fuente) |
| Cliente sin conexión (`187:7225…`) | `OfflineCustomerDialog.tsx` | shadcn `Dialog` | medio | **Hecho** (`PanelAdaptable` + `FormField`, Enter sigue enviando) |

### 4.2 Mesas, comandas y reservas — commit `0a3084a1`

| Componente Figma (node-id) | Dónde | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `PageHeader` (`870:102679`) + `BranchBadgeActiva`; menú «⋯ Más» (`870:102683`) | `870:102321` → `app/app/pos/mesas/page.tsx` | cabecera a mano, tarjeta «Acciones rápidas» | alto | **Hecho** |
| `SelectorVista` (`868:31799`) | `mesas/page.tsx` | botones Lista/Mapa | alto | **Hecho** con `SegmentedControl`; preferencia guardada en BD: pendiente |
| `SelectorDensidad` (`917:116278`) + `MesaCard` compacta | — | no existe | medio | **Pendiente** (GRANDE: falta en el kit) |
| Barra con `SearchInput` y `FilterChips` (`870:102739`) | `mesas/page.tsx` | solo en Lista; el plano filtraba sin mostrarlo | alto | **Hecho** (zona y estado en `FilterPanel`) |
| `LeyendaEstadosMesa` (`680:410766`) | `mesas/page.tsx`, `MesasFloorMap.tsx` | 4 tarjetas al final | alto | **Interino**: `KpiCompacto` que filtra; el componente propio falta |
| `MesaCard` (`868:31742`) | `pos/mesas/MesaCard.tsx` | colores fijos, emojis | alto | **Interino**: `StatusBadge` con icono y tokens; la tarjeta de Figma: pendiente (GRANDE) |
| Menú ⋯ de la tarjeta | `mesas/page.tsx` | solo con el ratón (inalcanzable en tableta) | alto | **Hecho** (siempre visible) |
| `ZonaHeader` (`868:31867`) | `mesas/page.tsx` | `h3` + `Badge` | medio | **Hecho** (`pos/mesas/ZonaHeader.tsx`) |
| Sin paginación | `mesas/page.tsx` | `MesasPagination` que partía zonas | medio | **Hecho** (borrado) |
| `EmptyState` (`870:105746`, `870:106868`) | `mesas/page.tsx` | una tarjeta | alto | **Hecho** |
| Refrescar sin bloquear (`870:106292`) | `mesas/page.tsx` | `opacity-60 pointer-events-none` | medio | **Hecho** |
| `Dialogo`, `CampoNumero`, `ConfirmDialog` | `mesas/page.tsx` | `Dialog`/`AlertDialog` a mano | medio | **Hecho** |
| Plano editable (`MesaPlano`, `ControlesPlano`…) | `MesasFloorMap.tsx` | lienzo propio | alto | **Pendiente** (GRANDE) |
| `PageHeader detail` + `StatusBadge`; `KpiStrip` + `StatCard`; `Tarjeta`, `EmptyState`, `ListaDatos` | `mesas/id/*`, `mesas/[id]/page.tsx` | tarjetas con degradado | medio | **Hecho** |
| `CartLine v3` (`846:87947`) y rondas (`852:95110`) | `OrderItemCard.tsx` | tarjeta propia | alto | **Pendiente** (sin aprobar) |
| `DialogoMotivo` al restar o anular lo enviado | `OrderItemCard.tsx` | 2 `AlertDialog` + motivo propio | alto | **Hecho** (`minimo={3}`) |
| `ResumenTotales` de la mesa | `MesaActionsSidebar.tsx` | calcula y pinta | alto | **Pendiente** (GRANDE: regla 7, una sola lógica de totales) |
| `BotonImporte` para cobrar | `MesaActionsSidebar.tsx` | botón verde | alto | **Hecho** (sin caja: deshabilitado con motivo) |
| `Tarjeta` cliente/resumen, división, esqueleto, `Dialogo` comensales y mesero | `mesas/id/*` | degradados, emojis, parpadeo | medio | **Hecho** |
| Indicador de la parte que se cobra | `mesas/[id]/page.tsx` | caja sobre el cobro | bajo | **Bloqueado** (cobro compartido) |
| Catálogo del POS en «Agregar productos» (`155:7745`) | `mesas/id/AddProductDialog.tsx` | portal y buscador propios | alto | **Parcial**: `SearchInput`, `EmptyState` y stock por variante; `PanelAdaptable` y la cantidad del selector pendientes (el carrito de mesas suma de a una unidad) |
| Diálogos de mesas (zonas, historial, combinar, transferir, dividir, pre-cuenta) | `pos/mesas/*` | shadcn con emojis | medio | **Parcial**: zonas, historial, combinar, transferir, pre-cuenta y pestañas de dividir; faltan los contenedores con pies de varias acciones |
| `PageHeader` (`959:584150`), `EmptyState` (`961:279453`), cargando (`961:279128`) de comandas | `app/app/pos/comandas/page.tsx` | homónimos locales | alto | **Hecho** |
| `PestanaEstacion`, `ComandaKDS v2`, KDS de tableta (`952:*`, `953:195581`, `960:278237`) | `comandas/*` | v1 | alto | **Bloqueado**: propuesta v2 con 8 preguntas abiertas; interino: iconos Lucide y sin parpadeo |
| Reservas: `PageHeader`, `SearchInput`, `KpiStrip`, `EmptyState`, `RowActionsMenu`, `ConfirmDialog` | `reservas-mesas/*` | a mano | medio | **Hecho** (y la fecha por la zona de la organización) |

### 4.3 Cajas, ventas y devoluciones — commit `baf23030`

| Componente Figma (node-id) | Dónde | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `Kbd` F9 | `cajas/listado/CajasPage.tsx` | `<kbd>` a mano | bajo | **Hecho** |
| Aviso (banda, `874:578301`) en 8 sitios | cajas, cierre, apertura, ventas | `<p role=note>` | medio | **Pendiente**: falta en el kit |
| `ListCard` móvil (`580:277858`) | `cajas/detalle/seccionesCaja.tsx` | tarjeta a mano; en móvil se perdían «Imprimir» y «Ver PDF» | medio | **Hecho** |
| `EmptyState` de error en el cierre | `CierreCajaDialog.tsx` | `div` | bajo | **Hecho** |
| Lista de movimientos, barra fija móvil, `EmptyState` con marco | varios | a mano | bajo | **Pendiente**: faltan en el kit |
| «Avisar a…» en Mi caja | `MiCajaTab.tsx` | no existe | bajo | **Bloqueado** (D12) |
| `Badge` de origen, botones, `CampoNumero` en filtros, `AccionRapida` imprimir | `pos/ventas/VentasPage.tsx` | a mano | medio | **Hecho** |
| `MultiSelect`, filtro por cajero, barra masiva, pestañas | `VentasPage.tsx` | — | medio | **Pendiente/Bloqueado** (plan §7) |
| Detalle de venta: `Tarjeta` de anulada (`333:42129`), `DocumentoLineas` (`332:40658`), pagos (`332:40736`), `AvatarIniciales` (`332:40853`), botones al pie, `DocumentoTotales venta` (`332:40885`) | `ventas/detalle/*` | tablas y filas a mano | medio | **Hecho** |
| Asiento con líneas, historial, comisión, insignias | `tarjetasVenta.tsx` | — | bajo | **Pendiente** (faltan datos) |
| «Crear devolución» (`874:578120`) y rediseño de devoluciones (`873:573997`) | `DevolucionPanel`, `pos/devoluciones/*` | asistente viejo | alto | **Pendiente** (GRANDE: necesita plan propio; `/devoluciones/[id]` hoy da 404 desde el kardex) |
| Devoluciones: `PageHeader`, `BranchBadgeActiva`, carga, `EmptyState`, `StatusBadge`, `KpiStrip`, CSV del kit, `Tarjeta` + `ListaDatos`, `CampoNumero` | `pos/devoluciones/*` | `Card` y colores fijos | medio | **Hecho** (provisional hasta el rediseño; el CSV ahora sale con `;` y BOM como el resto) |
| `DateRangeButton` en el historial | `ReturnsHistory.tsx` | 2 fechas | medio | **Pendiente**: `DateRangeButton` no tiene estado «sin rango» |
| Motivos: `PageHeader`, `ListToolbar`, `DataTable`, `ConfirmDialog`, `Dialogo` (`874:579636`, `874:580841`, `874:580752`) | `devoluciones/motivos/*` | shadcn con `dark:` | medio | **Hecho**; columna «Usos»: bloqueada |
| Devoluciones móvil con `KpiCompacto` + `ListCard` (`873:578460`) | — | no existe | medio | **Pendiente** (GRANDE) |

### 4.4 Facturas de venta, CxC y documentos — commit `97759d8c`

| Componente Figma (node-id) | Dónde | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `Pagination` 1–25 | `facturas-venta/listado/ListadoFacturasVenta.tsx`, `cuentas-por-cobrar/listado/ListadoCartera.tsx` | caía a 10 | alto | **Hecho** |
| `AccionRapida` (`680:404395`), `Button`, `CampoNumero` en filtros, `ListCard` con insignia FE y saldo (`421:171636`), `Tarjeta` de excluidas | `ListadoFacturasVenta.tsx` | a mano | medio | **Hecho** (el «+» móvil sigue igual: falta IconButton) |
| KPI móvil de facturas | `ListadoFacturasVenta.tsx` | — | medio | **Pendiente** (variante de `KpiStrip`) |
| Pagos aplicados (`106:3688`), `RelatedLinkCard` CxC y asiento (`580:277907`), cargos en totales, PDF visible | `facturas-venta/detalle/DetalleFacturaVenta.tsx` | `<ul>`, `FilaDato` | medio | **Bloqueado**: el archivo lo edita otra sesión (factura v2) |
| Emisor y receptor, `DianPanel` (`729:18575`), `DianTimeline` (`729:18030`), `HistorialDocumento` | `DetalleFacturaVenta.tsx` | a mano | alto | **Pendiente** (GRANDE: faltan en el kit) |
| Cartera: `AccionRapida`, `ChipDocumento` (`680:406423`), `Badge` de antigüedad, sin tinte de fila, `CustomerPicker`, subtítulo | `ListadoCartera.tsx` | a mano | medio | **Hecho** |
| Barra masiva completa; detalle de los KPI | `ListadoCartera.tsx` | — | medio | **Pendiente** (GRANDE) |
| Detalle CxC: pagos (`740:50484`), plan de cuotas (`740:50169`), «Ver cartera», resumen del plan, confirmar «Quitar plan» | `detalle/DetalleCuentaCartera.tsx`, `cartera/PlanCuotasCartera.tsx` | `<ul>`, `<table>`, `confirm` | medio | **Hecho** (**falta en el kit**: `DataTable` sin marco para usar dentro de `Tarjeta`) |
| `CadenaDocumento` vertical (`740:50641`); historial; ajustar saldo | `DetalleCuentaCartera.tsx` | horizontal | medio | **Pendiente** (GRANDE); ajustar saldo **Bloqueado** (D12) |
| Cartera del cliente: casillas para pagar (`740:51004`), `ChipDocumento`, menú por cuenta, sin permiso, KPI con detalle | `cliente/CarteraCliente.tsx` | sin selección | medio | **Hecho**; columnas nuevas: pendiente |
| Correo del estado de cuenta (`740:52422`) | `cartera/EstadoCuentaDialog.tsx` | `<input>` con tokens | bajo | **Pendiente**: `ui/input` usa `dark:` y `gray-*` (falta un campo de texto con tokens en el kit); WhatsApp **Bloqueado** (D6) |
| Notas crédito: `PageHeader` (`1021:91497`), `TabBar` crédito/débito, tabla del servidor, `SelectorDocumento` | `notas-credito/NotasCreditoPage.tsx` | legado | alto | **Pendiente** (rediseño del legado); `TabBar` **Bloqueado** (nota débito) |
| Notas: `DialogoMotivo` para anular (`1021:93702`), `StatusBadge`, `RowActionsMenu`, `ChipDocumento` | `NotasCreditoPage.tsx`, `NotaCreditoDetalle.tsx` | `confirm()` + `prompt()` | alto | **Hecho** (antes se podía mandar un motivo vacío) |
| Nota detalle: `DocumentoCabecera`, `DocumentoLineas` (`1021:92512`), totales, cadena y DIAN | `NotaCreditoDetalle.tsx` | `Card`, `ui/table` | alto | **Parcial**: se quitó la tarjeta roja; el resto es rediseño del legado |
| Cotizaciones: `StatusBadge` (vencida), `RowActionsMenu`, confirmación (`1022:93252`) | `cotizaciones/CotizacionesTable.tsx` | `confirm()`, `split('T')` | alto | **Hecho** (parcial: el `PageHeader` es rediseño) |
| Cotización detalle: `DocumentoCabecera`, `DocumentoLineas`, `DocumentoTotales`, `Dialogo` (`1022:94293`), `EmptyState` | `DetalleCotizacion.tsx`, `cotizaciones/[id]/page.tsx` | `Card`, `bg-green-600` | alto | **Parcial**: `EmptyState` hecho; el resto, rediseño del legado |
| Saldos a favor: `PageHeader`, `StatCard`, `StatusBadge`, `AccionRapida` «Aplicar», `DialogoMotivo` «Anular» (`1020:90370`) | `saldos-a-favor/SaldosAFavorPage.tsx` | `ui/table`, `dark:` | alto | **Parcial**: `StatusBadge`, `StatCard` y `EmptyState`; «Aplicar» es una acción nueva (pendiente); Devolver y anticipo: GRANDE |
| Formularios nuevo/editar de factura y cotización | — | — | — | **Bloqueado** (otra sesión) |

### 4.5 Facturas de compra, CxP, tesorería e impuestos — commit `c554ce34`

| Componente Figma (node-id) | Dónde | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `Pagination` 1–25 (`424:172867`) | `FacturasCompraListado.tsx`, `CuentasPorPagarListado.tsx` | caía a 10 | alto | **Hecho** |
| Compras: `AccionRapida` ×2 (`431:17232`), `ChipDocumento` (`424:172659`), columnas separadas, botones, `Dialogo` (antes `window.confirm`), `KpiCompacto` móvil (`424:174849`), `SupplierPicker`, rango legible, género | `facturas-compra/listado/*` | a mano | medio | **Hecho** |
| Estado «sin permiso» en compras y CxP | listados | — | bajo | **Pendiente**: la RPC no exige `finance.view` y el listado también vive en Inventario; esconderlo cambiaría quién ve la pantalla |
| Imprimir en lote, importar | — | — | medio | **Pendiente** (GRANDE) |
| Compras detalle: botones, `ChipDocumento`, pagos en `DataTable` (`740:54271`), `ListaDatos` (antes `<dl>` inválido), asiento, `Dialogo`, cargando, recepción en `DataTable` | `facturas-compra/detalle/*` | a mano | medio | **Hecho** |
| `HistorialDocumento` | — | — | medio | **Pendiente** (falta en el kit) |
| CxP: `AccionRapida` pagar/programar, Antigüedad y Documento (`740:55119`), `KpiCompacto` (`740:56629`), `SupplierPicker` | `cuentas-por-pagar/listado/*` | a mano | medio | **Hecho** |
| Filtro por monto, barra masiva (`451:222933`) | — | — | medio | **Pendiente** (GRANDE) |
| «Exportar a banca» | `ExportarBancaModal.tsx` | modal viejo | medio | **Bloqueado** (otra sesión) |
| CxP detalle: 4 `StatCard` (`740:53850`), plan de cuotas (`740:53967`), pagos (`740:54271`), tarjeta Proveedor (`740:54404`), botones, `Dialogo` | `cuentas-por-pagar/detalle/*` | a mano | medio | **Hecho** |
| Cadena en tarjeta (`740:54428`) | `CuentaPorPagarDetalle.tsx` | horizontal | bajo | **Pendiente**: `CadenaDocumento` sin orientación vertical forzada (falta en el kit) |
| Cuentas del proveedor (Y2), ajustar saldo, estado de cuenta (Y3) | — | — | medio | **Pendiente** (GRANDE) |
| `Select` en `FormField`; botones de aprobaciones | `ProgramarPagoDialog`, `RegistrarPagoProveedor`, `AprobacionesPanel` | nativos | bajo | **Hecho** |
| Tesorería: `DialogoMotivo` para anular (`1004:82759`) | ingresos, egresos, transferencias (6 archivos) | `confirm()` + `prompt()` | alto | **Hecho**. Cambio a validar: el motivo ahora es obligatorio (antes era opcional y cancelar el `prompt` anulaba igual) |
| Tesorería completa (movimientos, cuentas de dinero y sus 5 componentes nuevos `997:*`) | `ingresos/*`, `egresos/*`, `transferencias/*`, `bancos/*` | legado | alto | **Pendiente** (GRANDE: backend M1–M3 y C1–C5 sin aplicar) |
| Impuestos: `PageHeader` + `TabBar` (`1012:86383`), `Tarjeta` de advertencia, `Dialogo` destructivo | `impuestos/*` | shadcn con colores fijos | medio | **Hecho**; la tabla del kit (como `RetencionesTable`): pendiente (medio; la zona la tocó otra sesión hoy) |
| Documentos soporte (`736:37084…`) | `SupportDocumentsPage` | legado | medio | **Pendiente** (GRANDE); nuevo/editar **Bloqueado** |

### 4.6 Inicio — commit `d1a94ffe`

| Componente Figma (node-id) | Dónde | Qué había | Impacto | Estado |
|---|---|---|---|---|
| `PageHeader` (`447:72852`) + `BranchBadgeActiva` (`447:72923`) | `app/app/inicio/page.tsx` | cabecera a mano | alto | **Hecho** (y la fecha por la zona de la organización) |
| Sin badge de sucursal por sección | `inicio/ModuloSection.tsx` | 15 badges | medio | **Hecho** |
| `Skeleton`, `EmptyState` de error y `sinSucursal` | `page.tsx` | `animate-pulse`, solo un toast, ceros | medio | **Hecho** |
| Periodo con `SegmentedControl` (`447:72932`) y rango con `DateRangeButton` | `PeriodoSelector.tsx` | botones y 2 `Input date` | alto | **Hecho** |
| Presets de horas sin emojis (`447:72947`) | `HorasPresets.tsx` | 6 emojis | bajo | **Hecho** (mismos presets) |
| Bloque «Hoy» con `TarjetaHoy` (`445:195385`) | `DashboardKPIs.tsx` | 11 KPI sueltos | alto | **Pendiente**: decisión del dueño sobre ventas cobradas |
| `Badge` delta (`447:73041`) y «En vivo» (`463:15509`); sin curva sintética | `DashboardKPIs.tsx` | píldoras; curva `Math.sin` presentada como dato | medio | **Hecho** |
| Tienda web (`463:15506`), `StatCard` con hijos, periodo anterior, `ChipModulo`, filas clicables, `FilaModulo` | `DashboardKPIs`, `ModuloSection` | — | alto | **Pendiente** (GRANDE) |
| `Tarjeta` + `EmptyState` en tendencia (`447:73036`) y actividad (`447:73055`); `PaginationCompact` (`447:73137`) | `DashboardTendencia`, `DashboardActividad` | a mano | medio | **Hecho** |
| `Tarjeta` de alertas; `RowActionsMenu` CSV/PDF; esqueleto de sección; pestañas con `TabBar` | `DashboardAlertas`, `ModuloSection` | a mano | medio | **Hecho** |
| «Sin módulos» con `EmptyState` | `DashboardModulos.tsx` | a mano | bajo | **Bloqueado** hoy (lo editaba membresías); las claves ya están |
| `KpiStrip` + `StatCard` en calendario, chat y timeline; vacío de eventos | `sections/*` | 3 `KpiCard` locales | medio | **Hecho** |
| Atajos con rutas cableadas, onboarding, web commerce, diálogo de KPI, «mi turno» | `DashboardAtajos`, `OnboardingBanner`, `EmployeeDashboard` | — | alto | **Pendiente** (GRANDE; las rutas cableadas las prohíbe `CLAUDE.md`) |
| Panel del empleado: `Tarjeta`, `StatusBadge`, `EmptyState` | `EmployeeDashboard.tsx` | `ui/card` con `gray` | medio | **Hecho** |

### 4.7 Inventario / productos — solo reportado (BLOQUEADO: análisis en curso en otra sesión)

| Qué falta | Dónde | Estado |
|---|---|---|
| Pestaña Producción (`968:175070…`) con `TablaSubseccion` / `HojaDetalle` | detalle de producto | Bloqueado → bloque B5 |
| Kit de receta (`957:583020`) sin adoptar en `RecipeDialog`, `CostoRecetasPage` y `ConversionesPage` | `src/components/inventario/**` | Bloqueado → B5 |
| Kit reimplementado en el detalle (`BloqueResumen`, `Tarjeta` local, `QuickCreateDialog`) | detalle de producto | Bloqueado → B7 |
| Vista cuadrícula del catálogo; paginación de 25 en `EtiquetasPage` | catálogo, etiquetas | Bloqueado → B7 |

## 5. Pendientes grandes o bloqueados, con prioridad

### 5.1 Kit — prioridad ALTA (desbloquean varias páginas; coordinar: el kit tiene cambios ajenos sin commit)

1. `ListaPagos` que marque el pago activo y distinga entrada/salida → cobro del POS y cierre de caja.
2. `CampoNumero` que se resincronice con un valor externo aunque tenga el foco → monto del cobro y propina.
3. IconButton y chip de acción → cabecera móvil, escáner, «+» de facturas móvil, billetes del cobro, `ChipModulo`.
4. Estados nuevos en `estadoTono` (mesa, `expired`, tareas) y la etiqueta `sin_fe` en `kit.estados` (hoy falla
   `traduccionesModulos.test.ts`).
5. Aviso (banda, 8 sitios), `EmptyState` con marco (11), barra fija móvil, `KpiStrip` que se oculta en móvil,
   `DataTable` sin marco para dentro de `Tarjeta`, campo de texto con tokens, `DateRangeButton` sin rango,
   `CadenaDocumento` vertical, `Kbd Esc` en `PanelAdaptable`.
6. `HistorialDocumento`, `DianPanel` / `DianTimeline`, `EnviarDocumentoDialog`, `SelectorDocumento`,
   `SelectorDensidad`, `MesaCard`, `LeyendaEstadosMesa`, `TarjetaHoy`, `FilaModulo`, los 5 de tesorería.

### 5.2 POS — prioridad ALTA

- Adoptar `ListaPagos` y `CampoNumero` en el cobro cuando el kit los tenga (arriba).
- Diálogos QR y de pendientes sin conexión (compartidos, 13 pruebas de fuente).
- Mesas: `MesaCard` + `SelectorDensidad` con preferencia en BD, plano editable, `ResumenTotales` de la mesa,
  «Agregar productos» sobre `PanelAdaptable` con la cantidad del selector, diálogos restantes.
- Comandas v2: **Bloqueado** hasta que el dueño responda las 8 preguntas de POS-ESTACIONES §7.
- Coordinación con membresías: el post-venta (`PostVenta.tsx`) y los cambios de membresía en `pos/page.tsx`,
  `CartView.tsx`, `CheckoutDialog.tsx` y `BarraCobroMovil.tsx` son de esa sesión y quedaron fuera de estos commits
  (se commitearon solo los cambios de esta auditoría, hunk a hunk).

### 5.3 Ventas y devoluciones — prioridad MEDIA

- Rediseño completo de devoluciones (listado con pestañas y KPI, detalle `/devoluciones/[id]`, «Crear devolución»,
  búsqueda en el servidor): conviene un plan propio. Lo hecho ahora es provisional.
- Datos que faltan en el detalle de venta (asiento, historial, comisión); filtros multivalor. Bloqueados por el plan
  §7 y D12: cajero, imprimir y enviar en lote, «Avisar a», columna «Usos».

### 5.4 Finanzas — prioridad MEDIA

- Detalle de factura de venta (pagos, `RelatedLinkCard`, cargos, PDF): en cuanto la sesión de factura v2 suelte
  `DetalleFacturaVenta.tsx`.
- Notas crédito, cotizaciones y saldos a favor: rediseño del legado (cabecera, documento, totales, listados en el
  servidor, «Aplicar» saldo).
- Tesorería completa (depende de M1–M3 y C1–C5), documentos soporte, barras masivas de CxC y CxP, cuentas del
  proveedor, ajustar saldo, estado de cuenta Y3, emisor/resolución/DIAN en la factura.
- Estado «sin permiso» en compras y CxP: decidir antes si esos listados exigen `finance.view`.
- Bloqueados: «Exportar a banca» (otra sesión), D12, D6 (WhatsApp), nota débito, formularios nuevo/editar.

### 5.5 Inicio — prioridad MEDIA

- `TarjetaHoy` (decisión del dueño sobre ventas cobradas), tienda web, periodo anterior, `FilaModulo`, atajos sin
  rutas cableadas, onboarding, diálogo de KPI, «mi turno»; «sin módulos» cuando membresías suelte
  `DashboardModulos.tsx`.

### 5.6 Inventario — BLOQUEADO (lo reparte el análisis de inventario: B5 y B7)

Pestaña Producción, kit de receta en recetas/costos/conversiones, piezas del kit rehechas en el detalle, vista
cuadrícula y la paginación de 25 de etiquetas.
