# Auditoría — Existencias: Stock, Movimientos, Ajustes, Traslados, Seriales, Garantías y Trazabilidad

Insumo y respaldo del diseño en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`,
página `04 Inventario`, carril x ∈ [42.000, 60.000)). Complementa
`docs/design/AUDITORIA-KARDEX-LOTES.md`, que cubre Kardex y Lotes; aquí no se repite lo que ya
está allí salvo cuando cambió.

Fecha: 2026-09-23. Lectura de código y verificación de esquema, restricciones, disparadores,
políticas y **datos reales** con `SELECT` de solo lectura por el MCP de Supabase
(`jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente. Rutas relativas a `src/` salvo
que se indique. Sin cambios de código ni de base de datos.

Índice: A. Lo que dice la base hoy · B. Stock · C. Movimientos · D. Ajustes · E. Traslados ·
F. Seriales · G. Garantías · H. Trazabilidad · I. Navegación y conexiones · J. Iconos ·
K. Cambios de backend y base de datos necesarios · L. Dudas para el dueño.

---

## A. Lo que dice la base hoy (verificado 2026-09-23)

### A.1 Conteos

| Tabla | Filas | Dato que importa |
|---|---|---|
| `stock_levels` | 44.627 | 0 con `lot_id`; 25 con `qty_on_hand < 0` (suman −124); 613 con reserva; 41.672 con `avg_cost` nulo o 0; 10 con `min_level > 0`; 26 sucursales. **No tiene `organization_id`** |
| `stock_movements` | 13.007 | 1 con lote; 11.344 sin `updated_by`; 8.370 sin `source_id`; 7.262 sin `unit_cost` |
| `inventory_adjustments` | 139 | 3 `draft`, 136 `posted`; 109 `gain`, 30 `loss`; 9 razones; 12 organizaciones; del 01/06/2026 al 17/09/2026 |
| `adjustment_items` | 374 | 0 con lote; 264 con `serial_numbers` |
| `inventory_transfers` | 5 | **todos de julio de 2025**: 2 `pending`, 1 `in_transit`, 2 `received` |
| `transfer_items` | 8 | 0 con lote; `received_qty` = 0 en los 8, también en los 2 traslados «received» |
| `lots` | 3 | 1 con vencimiento (vencido) |
| `serial_numbers` | 102 | 99 `in_stock`, 3 `sold` (2 con `sale_id`, **0 con cliente**, 0 con factura); 100 con `warranty_end` ya fijado; 4 productos |
| `serial_tracking_events` | 102 | 100 `received`, 2 `sold` |
| `warranty_claims` | **0** | — |
| `products` | 53.319 | 29.094 variantes (`parent_product_id`) de 6.835 padres; 706 con `track_stock = false` |

Orígenes en `stock_movements`: `initial` 8.331 · `sale` 2.988 · `web_sale` 1.115 · `adjustment`
317 · `invoice_sale` 193 · `purchase` 27 · `mesa_sale` 24 · `transfer` 10 · `folio_item` 1 ·
`room_consumption` 1. En los últimos dos días ya entraron 11 `purchase`.

### A.2 Restricciones que mandan sobre el diseño

| Restricción | Valores | Consecuencia |
|---|---|---|
| `stock_movements_source_check` | 22 valores (ampliado hoy, commit 6904f6e7). **No incluye `purchase_void`** | `BadgeOrigenMovimiento` pasa de 14 a 22 variantes |
| `inventory_adjustments_status_check` | `draft`, `posted` | No existe «Cancelado»: hoy cancelar **borra** |
| `inventory_adjustments_type_check` | `gain`, `loss` | El tipo es de la cabecera; la dirección real sale del signo de cada renglón |
| `inventory_transfers_status_check` | `pending`, `in_transit`, `received`, `cancelled` | El código escribe `draft`, `partial`, `complete`: la base los rechaza |
| `transfer_items_status_check` | `pending`, `in_transit`, `received` | Ídem con `partial`, `complete` |
| `serial_numbers_status_check` | `in_stock`, `sold`, `warranty`, `repair`, `defective` | El código usa `reserved`, `returned`, `in_transit`, `damaged`, `rma`, `warranty_claim`: trasladar, marcar dañado, reservar en la web y devolver **fallan** |
| `serial_numbers_serial_key` | `UNIQUE (serial)` | Único en **todo el sistema**, no por organización (0 choques hoy) |
| `warranty_claims.status` | sin CHECK | Cualquier texto entra |

### A.3 Disparadores que no se disparan o disparan mal

- `fn_auto_journal_inventory_transfer` (AFTER UPDATE en `inventory_transfers`) busca
  movimientos con `source = 'transfer'`; el código escribe `transfer_out`/`transfer_in`, así que
  **el asiento entre sucursales no se genera nunca**. Además, cuando no hay costo, toma
  `stock_levels.avg_cost` de la sucursal de origen **sin filtrar por producto** (`ORDER BY
  updated_at DESC LIMIT 1`): valoraría el traslado con el costo de cualquier producto.
- `fn_notify_transfer_status` notifica solo `approved`, `rejected` o `completed`, que no existen
  en el CHECK: **nunca notifica** un cambio de estado.
- `fn_auto_journal_stock_movement` excluye `initial`, `purchase` y `transfer`. Con el CHECK
  ampliado hoy, `transfer_out`, `transfer_in`, `purchase_order` y `purchase_invoice` **ya no
  están excluidos**: en cuanto los traslados y las recepciones vuelvan a escribir kardex podrían
  generar asientos de ajuste de inventario. Hay que decidirlo **antes** de reparar los traslados.

---

## B. Stock — `/app/inventario/stock`

Archivos: `app/app/inventario/stock/page.tsx` (258), `components/inventario/stock/StockTable.tsx`
(500), `StockFilters.tsx` (125), `StockHeader.tsx` (85), `StockStats.tsx` (94),
`lib/services/stockService.ts` (565).

| # | Control | Hoy | Archivo:línea |
|---|---|---|---|
| 1 | Título «Niveles de Stock» / «Vista global de inventario por sucursal y producto» | mayúscula de título; subtítulo genérico | `StockHeader.tsx:29-34` |
| 2 | «Actualizar», «Exportar», «Movimientos», «Nuevo Ajuste» | cuatro botones, ninguno primario claro | `StockHeader.tsx:39-79` |
| 3 | KPI «Total Productos» | cuenta filas de `stock_levels` (producto×sucursal×lote), no productos | `StockStats.tsx:25` · `stockService.ts:250-308` |
| 4 | KPI «Valor Total», «Bajo Mínimo», «Sin Stock», «Sucursales» | sin filtrar `status='active'` (la tabla sí), cortados en 1.000 filas | `StockStats.tsx:33-57` |
| 5 | Buscador, Categoría, Estado | en cliente, sobre un conjunto ya cortado en 1.000 | `StockFilters.tsx:56-104` · `page.tsx:132-139` |
| 6 | Select propio de sucursal | duplica el selector del header (patrón 9) | `StockFilters.tsx:65-77` |
| 7 | Columna «Disponible» | muestra `qty_on_hand`, no `qty_on_hand − qty_reserved` | `StockTable.tsx:333` |
| 8 | Lote | no se consulta ni se muestra; varios lotes = filas duplicadas indistinguibles | `stockService.ts:207-228` |
| 9 | Variantes | cada variante es una fila suelta; no se agrupa por `parent_product_id` | — |
| 10 | Menú «Crear transferencia» | **no hace nada**: `onCreateTransfer` nunca se pasa | `StockTable.tsx:380-386` · `page.tsx:252-255` |
| 11 | Menú «Crear ajuste» | va a `/ajustes/nuevo` sin producto ni sucursal | `StockTable.tsx:374-379` |
| 12 | Paginación | en cliente, sobre 1.000 filas como máximo | `stockService.ts:236` |
| 13 | Exportar | CSV sin comillas; ignora filtros; nombre con `toISOString().split('T')[0]` | `stockService.ts:514-533` · `page.tsx:183` |
| 14 | Vacío / error | vacío sin acción; error solo toast | `page.tsx:68-72`, `:232-237` |
| 15 | Moneda | `formatCurrency` cablea COP | `StockTable.tsx:342, 345` · `StockStats.tsx:33` |

**Diseño (sección «Existencias — Stock»):** una fila por producto o variante con el reparto por
sucursal debajo; «Disponible» real; aviso de los 25 negativos con «Ver solo negativos»; acción
primaria única «Nuevo movimiento» con su menú (entrada, salida, ajuste, traslado, recibir orden);
menú «⋯» de fila con kardex, lotes, entrada, salida, traslado y mínimo; selección masiva con
Trasladar, Ajuste por conteo, Definir mínimo y Exportar; diálogos «Registrar entrada»,
«Registrar salida» (con lote y motivo) y «Definir stock mínimo».

---

## C. Movimientos — `/app/inventario/movimientos`

Archivos: `app/app/inventario/movimientos/page.tsx` (333), `MovimientosTable.tsx` (263),
`MovimientosFilters.tsx` (198), `MovimientosHeader.tsx` (68), `MovimientosStats.tsx` (89).

| # | Control | Hoy | Archivo:línea |
|---|---|---|---|
| 1 | Subtítulo «Kardex y trazabilidad de entradas y salidas» | se presenta como kardex: hay tres kardex en la app | `MovimientosHeader.tsx:25-27` |
| 2 | KPI | ignoran origen, dirección y búsqueda; suman unidades distintas; «valor» con precio de venta en las ventas históricas | `stockService.ts:395-451` |
| 3 | Filtro «Origen» | ofrece `recipe_consumption` y `waste`, que la base no acepta, y omite 15 de los 22 | `stockService.ts:497-509` |
| 4 | «Solo ingredientes» | busca «Ingrediente de producto»; la base escribe «Ingrediente de receta:» → **nunca coincide**; y filtra solo la página | `movimientos/page.tsx:256` |
| 5 | Fechas | `yyyy-MM-dd` y `T23:59:59` evaluados en UTC | `stockService.ts:359, 363` |
| 6 | Tamaño de página | no hace nada si estás en la página 1 | `movimientos/page.tsx:152-155, 178-182` |
| 7 | Columna «Documento» | `source_id` crudo | `MovimientosTable.tsx` |
| 8 | «Ver documento» | `getSourceRoute`: `purchase` → `/app/inventario/compras/{id}` y `return` → `/app/pos/devoluciones/{id}` **no existen**; `transfer_in/out`, `invoice_sale`, `web_sale`, `purchase_order`, `purchase_invoice` no tienen enlace | `MovimientosTable.tsx:69-81` |
| 9 | Lote, autor, saldo | no se muestran aunque `lots` se consulta | `stockService.ts:334-337` |
| 10 | Exportar | pide 10.000, recibe 1.000 | `stockService.ts:542` |

**Diseño:** bitácora de todo lo que entra y sale con `BadgeOrigenMovimiento` (22 variantes) y
`EnlaceDocumento` (número legible, quién y enlace real). Sin saldo: el saldo corrido es del
kardex, que es por producto. Aviso de corte («antes del 23/09/2026 el kardex no guardaba
recepciones, traslados ni devoluciones»). Menú «⋯» sin acciones destructivas: «un movimiento no
se borra, se corrige con un ajuste».

---

## D. Ajustes — `/app/inventario/ajustes`, `/nuevo`, `/[id]`

Archivos: `ajustes/page.tsx` (402), `NuevoAjusteForm.tsx` (955), `AjusteDetalle.tsx` (633),
`AjustesTable.tsx` (254), `lib/services/adjustmentService.ts` (809).

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | La paginación no funciona: ningún efecto escucha `currentPage` ni `pageSize` | `ajustes/page.tsx:141-153` |
| 2 | KPI «Cancelados» fijo en `'0'` | `AjustesStats.tsx:39-40` |
| 3 | «Cancelar» **borra** el ajuste y el diálogo dice que lo marca como cancelado | `adjustmentService.ts:604-608` · `ajustes/page.tsx:359-372` |
| 4 | «Editar» lleva a `/ajustes/{id}/editar`, que no existe | `AjustesTable.tsx:205` · `AjusteDetalle.tsx:295` |
| 5 | Aplicar no es atómico ni idempotente: `Promise.all` desde el navegador; si falla a mitad queda en borrador con movimientos parciales y reaplicar duplica | `adjustmentService.ts:398-580` |
| 6 | Si falla la lectura de `stock_levels`, el sistema queda en 0 y **aplicar suma toda la cantidad contada** | `adjustmentService.ts:245-249` |
| 7 | El formulario no captura lote (el servicio sí escribe `lot_id`); con varios lotes `.single()` deja el sistema en 0 | `NuevoAjusteForm.tsx:426, 561-566` |
| 8 | El mismo producto se puede agregar dos veces | `NuevoAjusteForm.tsx:382-474` |
| 9 | Costo de solo lectura; si vale 0, aplicar falla sin salida | `NuevoAjusteForm.tsx:825-827` · `adjustmentService.ts:420-429` |
| 10 | La salida usa el costo de `product_costs`, no el promedio de la sucursal | `adjustmentService.ts:464` |
| 11 | El detalle recalcula «Stock Sistema» contra el stock actual: en un aplicado las diferencias se ven en 0 | `AjusteDetalle.tsx:395-400` |
| 12 | Notas en HTML crudo | `AjustesTable.tsx:178` · `AjusteDetalle.tsx:337-378` |
| 13 | `ADJUSTMENT_REASONS` mezcla claves: una salida por `discrepancy` se muestra como «sobrante» | `adjustmentService.ts:125` |
| 14 | `assistant_create_adjustment` guarda la diferencia con estado `posted`; la interfaz guarda el conteo absoluto | `migrations/20260910180000…sql:242-265` |

**Diseño:** lista con número legible (AJ-0081), `BadgeTipoAjuste` y `BadgeEstadoAjuste`; menú
«⋯» del borrador con «Descartar borrador» (y no «Cancelar»); selección con Aplicar, Exportar,
Imprimir y Descartar; detalle con DocumentHeader, «Sistema al contar» congelado, lote y seriales
por renglón; detalle aplicado con «Movimientos generados en el kardex»; formulario nuevo con
lote por renglón (Select del kit) y NumberInput; `ConfirmDialog` «¿Aplicar el ajuste AJ-0081?» →
«Aplicar», y «¿Descartar el borrador AJ-0081?» → «Descartar».

---

## E. Traslados — `/app/inventario/transferencias`, `/nuevo`, `/[id]`

Archivos: `TransferenciasService.ts` (652), `TransferenciaDetalle.tsx` (556),
`NuevaTransferenciaForm.tsx` (492), `TransferenciasPage.tsx` (186), `TransferenciasTable.tsx`
(166), `distribucion/CrearTransferenciaDialog.tsx` (288).

**Lo más grave del documento.** Un traslado hoy **no mueve existencias en ninguna de las dos
sucursales y se puede recibir sin límite**:

1. `stock_levels` no tiene `organization_id`, y el servicio filtra por esa columna al despachar,
   al recibir y al calcular lo disponible (`TransferenciasService.ts:273-274, 369, 598, 634`).
   La consulta falla, el error no se revisa y el origen no baja ni el destino sube. El insert de
   respaldo también usa la columna (`:393-404`).
2. La RPC `update_stock_level` (`:260`, `:352`) **no existe**.
3. Al recibir, el código escribe `partial`/`complete` en renglón y cabecera; la base los rechaza
   y la respuesta no se revisa (`:326-333`, `:423-430`): toast «Recepción confirmada», nada
   guardado, botón «Recibir» siempre disponible. Desde el arreglo del CHECK de hoy, **cada
   recepción repetida escribe otro `transfer_in` en el kardex** sin tocar existencias.
4. Lo disponible en el formulario siempre sale 0 → «Agotado» y «Stock insuficiente», que no
   bloquea (`NuevaTransferenciaForm.tsx:112-117`).
5. Los movimientos no llevan `unit_cost` ni lote (`:236-251`, `:336-349`); los seriales no viajan.
6. `?producto_id=` que manda el detalle de producto se ignora (`DetalleProducto.tsx:119`).
7. Confirmaciones con `confirm()` nativo (`TransferenciasPage.tsx:68, 90`); búsqueda que no
   llega a la consulta (`TransferenciasService.ts:39-63`); «Creado por» muestra el UUID
   (`TransferenciaDetalle.tsx:428`).
8. Datos: 5 traslados de julio de 2025; los 2 «received» tienen `received_qty = 0`; 8 salidas
   `transfer` y 2 entradas: **6 unidades en tránsito perpetuo**.

**Diseño:** estados de la base (`BadgeEstadoTraslado`: Pendiente · En tránsito · Recibido ·
Recibido con diferencia · Cancelado); aviso del traslado de julio de 2025 que sigue abierto;
menús «⋯» distintos para pendiente (Despachar, Editar, Imprimir guía, Cancelar) y en tránsito
(Recibir, Imprimir guía, Devolver al origen); detalle con «Seguimiento» (EventoTrazabilidad);
diálogo «Recibir» de 1024 con cantidad por renglón, diferencia y decisión sobre lo que falta;
formulario con lote y disponible real del origen; `ConfirmDialog` que responden a su título
(«Despachar», «Cancelar traslado» con secundario «Mantener», «Devolver al origen»).

---

## F. Seriales — `/app/inventario/seriales`, `/[id]`

Archivos: `SerialesPage.tsx` (387), `SerialDetailPage.tsx` (541), `productos/id/tabs/SerialesTab.tsx`
(776), `lib/services/serialTrackingService.ts` (1.200).

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | Estados que la base rechaza (A.2): fallan Transferir, Marcar dañado, Cambiar estado, reservar en la web, devolver y `warranty_claim` desde devoluciones | `serialTrackingService.ts:5-13, 646-654` · `api/web-orders/route.ts:285` · `devolucionesService.ts:845` |
| 2 | La garantía se fija **al recibir** con fecha UTC y meses de 30 días; al vender no se reinicia: 100 garantías corren con la unidad en bodega | `serialTrackingService.ts:190-192` |
| 3 | KPI sin filtro de sucursal y cortados en 1.000 | `SerialesPage.tsx:118` · `serialTrackingService.ts:980-1028` |
| 4 | Selector «Filas» sin efecto | `SerialesPage.tsx:376` |
| 5 | `formatDate` sobre columnas `date` (`warranty_start/end`): un día menos en Bogotá | `SerialDetailPage.tsx:347-348` |
| 6 | «Sucursal Venta» muestra la sucursal actual | `SerialDetailPage.tsx:331` |
| 7 | Historial con sucursales por id («Sucursal: 3 → 5») y notas en HTML crudo | `SerialDetailPage.tsx:403, 408` |
| 8 | Sin enlaces a venta, cliente, proveedor, orden ni reclamo | `SerialDetailPage.tsx` |
| 9 | Consultas sin filtro de organización (las cubre RLS) | `serialTrackingService.ts:390-403, 436-547, 585-871` |

**Diseño:** fila por unidad con `EstadoSerial`, dónde está, venta y cliente enlazados, y garantía
desde la venta; aviso de las 99 garantías que corren en bodega; menús «⋯» de vendido y de en
stock; detalle con Origen / Venta / Garantía e historial; «Abrir reclamo» como acción primaria.

**Pendiente de kit:** `EstadoSerial` (`177:1220`) pinta «Vendido» en morado y «Reclamo garantía»
en rosa, fuera del manual (`SISTEMA-BADGES.md` §6). No se tocó porque lo usan pantallas de otro
carril; queda como cambio del kit.

---

## G. Garantías — `/app/inventario/garantias`, `/[id]`

Archivos: `GarantiasPage.tsx` (395), `GarantiaDetailPage.tsx` (660), `CreateClaimDialog.tsx` (441),
`lib/services/warrantyClaimsService.ts` (316).

1. **El detalle no carga y no se pueden crear reclamos desde la interfaz.** Se piden las
   relaciones `serial_numbers_current_branch_id_fkey` y `serial_numbers_sold_to_customer_id_fkey`;
   las reales son `fk_serial_current_branch` y `fk_serial_customer`
   (`warrantyClaimsService.ts:175-176` · `CreateClaimDialog.tsx:109, 146` ·
   `serialTrackingReports.ts:81-82`). Hay 0 reclamos en la base.
2. El número de RMA y la respuesta del proveedor se pierden: solo se guardan con `resolved` o
   `rejected` (`warrantyClaimsService.ts:266-276`); `resolved_by` nunca se llena.
3. El serial de reemplazo sigue `in_stock` y se puede volver a vender; reembolsos y créditos no
   generan nota crédito ni movimiento.
4. El historial se reconstruye con el estado actual (`GarantiaDetailPage.tsx:463-495`).
5. La búsqueda combina servidor y cliente de forma que casi nunca devuelve nada
   (`warrantyClaimsService.ts:128-152`); texto sin escapar dentro de `.or()`.
6. Moneda cableada `'COP'` (`GarantiasPage.tsx:159` · `GarantiaDetailPage.tsx:418`).

**Diseño:** ámbito de organización (sin BranchBadge ni «sin sucursal», como hoy); lista con
`BadgeEstadoReclamo` y garantía calculada; menú «⋯» con Aprobar, Enviar al proveedor (RMA),
Resolver, Ver serial y Rechazar; detalle con unidad, venta y cliente enlazados e historial real;
«Nuevo reclamo» (672) que valida serial vendido y garantía; «Resolver» (520) que mueve el serial
de reemplazo.

---

## H. Trazabilidad — `/app/inventario/reportes/trazabilidad`

Archivos: `TrazabilidadPage.tsx` (396), `TrazabilidadService.ts` (186).

Hoy es una **lista plana de `stock_movements`**: no encadena lote → ventas → clientes ni
serial → venta → garantía. Busca solo en `note` y `source_id` (`TrazabilidadService.ts:75-77`),
sin escapar el texto; el filtro «Origen» omite casi todos los valores reales y ofrece
`recipe_consumption` (`:40-49`); fechas en UTC (`:91, :94`); CSV truncado a 1.000 filas
(`:134`); filtro de producto con `.limit(100)` (`:136`); «Limpiar filtros» no reinicia la
sucursal global (`TrazabilidadPage.tsx:119-130`); ningún enlace.

**Diseño:** un solo buscador que reconoce lote, serial o documento; resultado de lote con
recibidas / vendidas / en existencias / mermas, recorrido con EventoTrazabilidad y «¿A quién se
vendió?» con «Exportar clientes para retiro»; resultado de serial con recorrido y documentos;
estados inicial, cargando, sin resultados, error, sin permiso y sin sucursal.

**Dependencia dura:** con 1 movimiento con lote de 13.007 y 0 filas de stock con lote, la
trazabilidad de lotes no tiene datos hasta que se capture el lote en recepción, ajuste, traslado
y POS (fases 7–9 de `AUDITORIA-KARDEX-LOTES.md` §N).

---

## I. Navegación y conexiones

| Ruta | Menú hoy (etiqueta / icono) | Archivo:línea |
|---|---|---|
| `/stock` | «Stock» / `Layers` | `SidebarNavigation.tsx:206` · `AppLayout.tsx:221` |
| `/movimientos` | «Movimientos» / `ArrowLeftRight` | `:207` · `:222` |
| `/ajustes` | «Ajustes» / `Settings` | `:208` · `:223` |
| `/transferencias` | «Transferencias» / `ArrowLeftRight` | `:209` · `:224` |
| `/seriales` | «Seriales» / `QrCode` | `:217` · `:232` |
| `/garantias` | «Garantías» / `ShieldCheck` | `:218` · `:233` |
| `/reportes/trazabilidad` | «Trazabilidad» / `Search` | `:225` · `:240` |
| `/lotes` | «Lotes» / `Package` | `:216` · `:231` |
| `/kardex` | **no está** en ningún menú | solo `StockTab.tsx:174` |

Conexiones que no existen hoy y que el diseño dibuja (mapa en la sección «Existencias — Cómo se
conecta»):

- Ninguna venta, factura ni compra enlaza a sus movimientos de inventario.
- El kardex solo se abre con «Ver Historial» del detalle de producto.
- `getSourceRoute` tiene dos rutas 404 y no cubre 15 de los 22 orígenes.
- Seriales, lotes y garantías no se enlazan entre sí; el detalle de serial no enlaza a su venta,
  su cliente ni su reclamo.
- `FacturasCompraTable.tsx:107-110` lleva a `/app/inventario/entradas/nueva`, que no existe.
- `AccesosRapidos.tsx` y `DynamicSidebar.tsx` no los importa nadie: código muerto.

---

## J. Iconos propuestos (para consolidar en `CATALOGO-ICONOS.md`)

No se editó el catálogo porque otro agente lo está corrigiendo. Propuesta, un concepto un icono:

| Concepto | Icono | Hoy en el menú | Motivo |
|---|---|---|---|
| Existencias · stock | `Boxes` | `Layers` | Ya en el catálogo; `Layers` queda para Lotes |
| Movimientos (historial de inventario) | `History` | `ArrowLeftRight` | «Ver movimientos» ya usa `History` en los menús de lote; `ArrowLeftRight` es traslado |
| Kardex | `BookOpen` | — | Ya dibujado en la tanda anterior |
| Ajuste | `ClipboardCheck` | `Settings` | Ya en el catálogo; `Settings` es configuración |
| Traslado entre sucursales | `ArrowLeftRight` | `ArrowLeftRight` | Deja de compartirse con Movimientos |
| Lote | `Layers` | `Package` | `Package` es Producto |
| Serial | `ScanBarcode` (nuevo en el kit) | `QrCode` | `Barcode` queda para «Códigos de barras»; `QrCode` para QR |
| Garantía | `ShieldCheck` | `ShieldCheck` | Sin cambio |
| Trazabilidad | `GitBranch` | `Search` | `Search` es buscar, no un concepto |
| Merma · dar de baja | `PackageMinus` (nuevo) | — | Menú de lote |
| Vencido | `CalendarX` (nuevo) | — | `CalendarClock` es Reserva de mesa |
| Reparación · RMA | `Wrench` (nuevo) | — | EventoTrazabilidad |

Los cuatro iconos nuevos se añadieron a `02 Componentes › Fundamentos › Iconos` (rejilla 24,
trazo enlazado a `text/primary`): `Icon/PackageMinus`, `Icon/CalendarX`, `Icon/Wrench`,
`Icon/ScanBarcode`.

---

## K. Cambios de backend y base de datos necesarios (no aplicados)

Ordenados por dependencia. Todo aditivo; ninguna columna `NOT NULL` nueva sin `DEFAULT`.

### K.1 Base de datos

1. **Decidir los asientos de los orígenes nuevos antes de reparar traslados**:
   `fn_auto_journal_stock_movement` debe excluir `transfer_out`, `transfer_in`,
   `purchase_order` y `purchase_invoice` (o mapearlos a reglas propias).
2. **`fn_auto_journal_inventory_transfer`**: buscar `transfer_out`/`transfer_in` en vez de
   `transfer`, y tomar el costo del movimiento o del `avg_cost` **del producto** en origen.
3. **`fn_notify_transfer_status`**: notificar `in_transit`, `received` y `cancelled`.
4. **RPC `fn_despachar_traslado(p_transfer_id)` y `fn_recibir_traslado(p_transfer_id, p_lineas
   jsonb)`**, transaccionales, con validación de pertenencia de la organización y de las dos
   sucursales: restan origen y suman destino en `stock_levels` (SELECT … FOR UPDATE, sin
   `onConflict`, por la trampa del índice con `lot_id` NULL), escriben `transfer_out`/`transfer_in`
   con `unit_cost` = `avg_cost` del producto en origen y `lot_id`, actualizan `received_qty` y el
   estado, mueven los seriales (`current_branch_id`) y dejan evento. Sustituyen a la RPC
   inexistente `update_stock_level`.
5. Columnas nuevas en `inventory_transfers`: `code text` (TR-0041), `shipped_at timestamptz`,
   `shipped_by uuid`, `received_at timestamptz`, `received_by uuid`; en `transfer_items`:
   `unit_cost numeric`, `difference_reason text`.
6. **RPC `fn_aplicar_ajuste(p_adjustment_id)`** transaccional e idempotente (rechaza si ya está
   `posted`); columnas nuevas en `inventory_adjustments`: `code text`, `posted_at timestamptz`,
   `posted_by uuid`; en `adjustment_items`: `system_qty numeric` (stock al contar) y
   `difference numeric`. Un disparador que impida `UPDATE`/`DELETE` de ajustes `posted`.
7. **`serial_numbers_status_check`**: ampliar a los ocho estados que usa el código
   (`in_stock`, `reserved`, `sold`, `returned`, `in_transit`, `damaged`, `rma`, `warranty_claim`),
   conservando temporalmente `warranty`, `repair`, `defective` hasta migrar (hoy 0 filas los usan).
8. **Unicidad del serial por organización**: índice único nuevo `(organization_id, serial)`
   `concurrently`; el índice global se retira en una segunda fase (0 choques hoy).
9. `warranty_claims`: CHECK de `status` con los seis valores; columna `code text` (GAR-0007).
10. Garantía desde la venta: `sellSerials` fija `warranty_start/end`. Los 99 seriales en stock
    con `warranty_end` ya fijado necesitan una decisión de datos (L.2).
11. Del documento de Kardex y Lotes, sin cambios: `fn_kardex_saldo_corrido`,
    `fn_kardex_descuadres`, `stock_movements.created_by`, índice
    `(organization_id, product_id, branch_id, created_at, id)`, `lots.organization_id`, unicidad
    `(product_id, lot_code)`, ajustes de vencimiento por organización y `fn_descontar_stock_fefo`.
12. **RPC `fn_documento_de_movimiento(p_source, p_source_id)`** (o una vista) que devuelva el
    número legible, el tipo de documento y la ruta: alimenta `EnlaceDocumento` en kardex,
    movimientos y trazabilidad sin 22 consultas desde el navegador.
13. **RPC `fn_trazabilidad(p_codigo text)`** que reconozca lote, serial o documento y devuelva el
    recorrido (movimientos + eventos de serial + reclamos) con `security invoker`.
14. Permisos: mapear en el catálogo de permisos existente «Ver inventario», «Ajustar
    inventario», «Trasladar inventario», «Gestionar garantías» y «Ver informes de inventario»
    (se resuelven en servidor; no se verificó el catálogo en esta tanda).

### K.2 Código

1. Stock: paginación de servidor con `count: 'exact'`, «Disponible» = `qty_on_hand −
   qty_reserved`, agrupar variantes por `parent_product_id`, lote por fila, sin filtro de
   sucursal propio, conectar «Trasladar» y «Registrar entrada/salida» con producto y sucursal.
2. Movimientos: los 22 orígenes en filtro y etiquetas (un solo mapa: `BadgeOrigenMovimiento`),
   `getSourceRoute` con rutas reales, filtro de ingredientes con «Ingrediente de receta:», fechas
   por `todayInTz`/huso de la organización, efecto sobre el tamaño de página.
3. Ajustes: efecto de paginación, ruta de edición del borrador, «Descartar» en vez de «Cancelar»,
   notas con el renderizador de texto enriquecido, lote por renglón, producto único por renglón,
   costo promedio de la sucursal, `fn_aplicar_ajuste`.
4. Traslados: dejar de filtrar `stock_levels` por `organization_id`, usar los cuatro estados de
   la base, lote y seriales por renglón, leer `?producto_id=`, sustituir `confirm()` por
   `ConfirmDialog`, las dos RPC de K.1.4.
5. Seriales: estados, garantía desde la venta, `formatPlainDate` para columnas `date`, moneda de
   la organización, «Filas» con efecto, enlaces a venta, cliente, proveedor y reclamo.
6. Garantías: nombres reales de las relaciones, validación de serial vendido y garantía, guardar
   RMA y `resolved_by`, mover el serial de reemplazo, evento en `serial_tracking_events`.
7. Trazabilidad: reconstruirla sobre `fn_trazabilidad`.
8. Menú lateral: iconos de J; «Kardex» accesible desde Movimientos y desde el producto.

---

## L. Dudas para el dueño

1. **Traslados — cuándo sale y qué pasa con lo que no llega.** El diseño descuenta el origen al
   **despachar** (no al crear) y deja que quien recibe decida la diferencia: «Faltante en el
   transporte» (merma en destino) o «Siguen en camino». ¿Aprobado, o prefieres que la diferencia
   quede siempre en tránsito hasta que un administrador la resuelva?
2. **Las 99 garantías que ya corren en bodega.** ¿Se reinician (se borra `warranty_start/end`
   de los seriales en stock para que empiecen al vender) o se corrige solo hacia adelante?
3. **Seriales únicos por organización** en vez de en todo el sistema: ¿aprobado el cambio de
   índice en dos fases?
4. **Ajustes descartados.** El diseño borra el borrador al descartarlo (como hoy, pero diciendo
   la verdad). ¿O prefieres un estado «Descartado» con rastro, que exige ampliar el CHECK?
5. **«Exportar clientes para retiro»** en Trazabilidad saca datos de contacto de clientes: ¿con
   qué permiso? El diseño lo asume para «Ver informes de inventario» más «Ver clientes».
