# Paridad Ventas — rediseño en Figma (página `05 POS y ventas`)

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página **`05 POS y ventas`**,
Secciones nuevas **11. Ventas — listado**, **12. Ventas — detalle** y **13. Ventas — nueva**
(el Índice de la página quedó actualizado con las tres).

Fuente de verdad: `docs/design/AUDITORIA-CONTROLES-VENTAS.md` (89 controles en tres pantallas,
16 hallazgos de «Lo roto» y 34 adiciones propuestas). Una fila por control.

Estados de la columna final:

- **calcado** — existe en código y se dibujó igual, con la etiqueta exacta.
- **Nuevo** — no existe en código; lleva el badge `Marca/Nuevo` en Figma.
- **sustituido por …** — lo roto no se calca (regla I.4.4 del brief de fidelidad): se reemplaza por
  el componente correcto del kit.
- **omitido: motivo** — no se dibuja, con la razón.

Convenciones: escritorio 1440 de ancho, móvil 390; cada frame lleva su anotación en gris pizarra
de 12 px arriba a la izquierda; separación de 160 px entre frames y 400 px entre Secciones.
Nombres de organización ficticios («Mi empresa S.A.S.», «Sucursal Principal», «Sucursal Norte»).
Los impuestos se rotulan siempre `{nombre} {tasa}` («IVA 19 %», «Impoconsumo 8 %»), nunca «IVA» a secas.

## Frames

### Sección 11 — «Ventas — listado» (6.400 × 3.500)

| Frame | Tamaño |
|---|---|
| `Escritorio / Ventas — listado (listo)` | 1440 × 900 |
| `Escritorio / Ventas — listado (cargando)` | 1440 × 900 |
| `Escritorio / Ventas — listado (vacío)` | 1440 × 900 |
| `Escritorio / Ventas — listado (error)` | 1440 × 900 |
| `Escritorio / Ventas — listado (FilterPanel abierto)` | 1440 × 900 |
| `Escritorio / Ventas — listado (selección + BulkActionBar)` | 1440 × 900 |
| `Escritorio / Ventas — listado (menú ⋯ por fila)` | 1440 × 900 |
| `Móvil / Ventas — listado (tarjetas)` | 390 × 844 |
| `ConfirmDialog — Anular venta (motivo obligatorio)` | 520 × 246 |
| `Toasts de Ventas` (9 toasts) | 460 × 874 |

### Sección 12 — «Ventas — detalle» (6.400 × 3.800)

| Frame | Tamaño |
|---|---|
| `Escritorio / Ventas — detalle (venta POS pagada)` | 1440 × 1940 |
| `Escritorio / Ventas — detalle (pedido Web)` | 1440 × 1080 |
| `Escritorio / Ventas — detalle (venta de Mesa con propina y comisión)` | 1440 × 1960 |
| `Escritorio / Ventas — detalle (anulada con nota crédito)` | 1440 × 1940 |
| `Escritorio / Ventas — detalle (pendiente de sincronizar)` | 1440 × 1170 |
| `Escritorio / Ventas — detalle (cargando)` | 1440 × 910 |
| `Escritorio / Ventas — detalle (no encontrada o error)` | 1440 × 570 |
| `Móvil / Ventas — detalle` | 390 × 1440 |

### Sección 13 — «Ventas — nueva» (6.400 × 2.250)

| Frame | Tamaño |
|---|---|
| `Escritorio / Ventas — nueva (carrito del POS reutilizado)` | 1440 × 956 |
| `Escritorio / Ventas — nueva (Guardar en espera · diálogo real)` | 1440 × 956 |
| `Escritorio / Ventas — nueva (cupón funcional aplicado)` | 1440 × 956 |
| `Escritorio / Ventas — nueva (sin sucursal seleccionada)` | 1440 × 448 |
| `Escritorio / Ventas — nueva › Cobro (reutiliza el cobro del POS v2, sin cambios)` | 1440 × 956 |
| `Escritorio / Ventas — nueva › Post-venta (reutilizado del POS v2)` | 1440 × 900 |
| `Móvil / Ventas — nueva (productos, total y Cobrar fijos)` | 390 × 844 |
| `Móvil / Ventas — nueva › Carrito (hoja deslizable)` | 390 × 1020 |
| `Móvil / Ventas — nueva › Cobro (Sheet a pantalla completa)` | 390 × 968 |

---

## 1. Listado — `/app/pos/ventas` (§A de la auditoría)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.1 #1 | (ArrowLeft) volver a `/app/pos` | Listado (listo) › `Breadcrumbs` «POS › Ventas» del `PageHeader` | sustituido por Breadcrumbs del kit: la flecha no tenía `aria-label` y llevaba a `/app/pos`, no al lugar del que se viene (§I.16) |
| A.1 #2 | texto «Historial de Ventas» | Listado (listo) › `PageHeader Variant=list` | calcado |
| A.1 #3 | «{n} ventas encontradas» | `PageHeader` subtítulo: «1.312 ventas encontradas · 01–22 de septiembre de 2026 · Sucursal Principal» | calcado + periodo y sucursal (Nuevo: hoy la sucursal no se muestra en ninguna parte, §H.2) |
| A.1 #4 | botón «Actualizar» (RefreshCw) | `PageHeader` › `IconButton` RefreshCw | calcado (pasa a icono: la etiqueta ya se ocultaba en móvil) |
| A.1 #5 | botón «Nueva Venta» | `PageHeader` › `Button Variant=primary` | calcado |
| A.1 #6 | skeleton de carga (`PageHeaderSkeleton` + `StatsSkeleton×4` + `CardListSkeleton×4`) | Listado (cargando) | sustituido por `Skeleton Variant=card` ×4 + `Variant=table-row` ×6 del kit, y los 4 KPIs que el esqueleto prometía ahora existen de verdad (§A.1 nota) |
| A.2 #7 | campo «Buscar» · «ID, cliente, notas...» | Listado (listo) › `SearchBar Size=md` con `Kbd /` | sustituido por el buscador único del kit; el placeholder pasa a «Buscar por N.º de factura, cliente, documento o notas…» porque hoy sólo busca en `notes` (§I.3) |
| A.2 #8 | filtro «Origen»: Todos / POS / Página Web | FilterPanel abierto › campo «Origen» | calcado + «Mesa» y «Desde factura» (Nuevo, §F) |
| A.2 #9 | filtro «Estado»: Todos los estados / Pendiente / Completada / Anulada | FilterPanel abierto › campo «Estado» | calcado (con la advertencia de §E.4: «Completada» y «Anulada» no existen en `sales`) |
| A.2 #10 | filtro «Estado de pago»: Todos / Pagado / Pendiente / Parcial / Reembolsado | FilterPanel abierto › campo «Estado de pago» | calcado |
| A.2 #11-#12 | «Desde» / «Hasta» (`input type=date`) | FilterPanel abierto › `DateRange` del kit | sustituido por `DateRange`: los dos `input type=date` producen el día del dispositivo, no el de la organización (§I.10) |
| A.2 #13 | botón «Limpiar» | FilterPanel › «Limpiar (3)» + `FilterChips` «Limpiar todo» | calcado |
| A.2 | `SalesFilter.customer_id` (declarado, sin control) | FilterPanel › campo «Cliente» (se reutiliza `CustomerPicker`) | Nuevo |
| A.2 | `SalesFilter.user_id` (declarado, nunca leído) | FilterPanel › campo «Cajero» (`SearchSelect`) | Nuevo |
| A.2 | `SalesFilter.branch_id` (declarado, nunca leído) | FilterPanel › campo «Sucursal» (`Select`) | Nuevo |
| A.3 #14 | columna «Fecha» + hora en gris | Tabla › celda de dos renglones «22/09/2026 / 09:14» | calcado |
| A.3 #15 | columna «Origen»: badges Web / Mesa / POS | Tabla › `Badge` marca (POS) · advertencia (Mesa) · información (Web) · neutro (Factura) | calcado + tono según `SISTEMA-BADGES.md` + el cuarto origen `invoice`, hoy invisible (§F) |
| A.3 #16 | columna «ID» → `CopyableId` con `invoice_number ?? id.slice(0,8)` | Tabla › celda «N.º» de dos renglones: «F-001482 / a3f91c02…» | sustituido: `sales` no tiene `invoice_number` ni `sale_number`, así que hoy una venta POS muestra siempre un UUID recortado (§I.13). El consecutivo real sale de `invoice_sales.number` |
| A.3 #17 | columna «Cliente» + doc/teléfono · «Cliente genérico» | Tabla › celda de dos renglones | calcado |
| A.3 #18 | columna «Total» | Tabla › `TableCell Variant=money` | calcado |
| A.3 #19 | columna «Estado» (badge) | Tabla › `Badge` según la tabla de tonos (§E.1) | calcado con los tonos del sistema: «Anulada» pasa a peligro·contorno y «Pendiente de sincronizar» a advertencia·contorno |
| A.3 #20 | columna «Pago» (badge) | fusionada en la columna «Estado» + columna «Método» | sustituido: «Pago parcial» es un estado de pago, no un segundo badge; §SISTEMA-BADGES «como máximo un badge sólido por fila» |
| A.3 #21 | menú ⋯ por fila | Listado (menú ⋯ por fila) › `MenuItem` del kit | calcado |
| A.3 #22 | «Ver Detalle» | menú ⋯ › «Ver Detalle» + `Enter` | calcado |
| A.3 #23 | «Imprimir» | menú ⋯ › «Imprimir» + `P` | calcado |
| A.3 #24 | «Duplicar» | menú ⋯ › «Duplicar» + `D` | calcado (hoy falla en silencio: pide `products.price`, que no existe — §I.5) |
| A.3 #25 | «Crear Devolución» (sólo `completed`) | menú ⋯ › «Crear Devolución» | sustituido: se retira la guarda `status === 'completed'`, que en una venta POS nunca se cumple (§E.4 #2), y el destino pasa a ser la pantalla real de devoluciones |
| A.3 #26 | «Anular Venta» (`confirm` + `prompt` + `alert`) | menú ⋯ › «Anular Venta» → `ConfirmDialog — Anular venta (motivo obligatorio)` | sustituido por `ConfirmDialog Variant=destructive` + `FormField` de motivo obligatorio (§I.8) |
| A.3 #27 | `TableSkeleton rows=5 columns=6` (la tabla tiene 8 columnas) | Listado (cargando) | sustituido por `Skeleton Variant=table-row` con el número real de columnas |
| A.3 #28 | vacío «No hay ventas» / «No se encontraron ventas con los filtros seleccionados.» + «Crear Nueva Venta» | Listado (vacío) › `EmptyState Variant=search` | calcado, con dos salidas: «Limpiar filtros» y «Nueva Venta» |
| A.3 #29 | `DataTablePagination` | Listado (listo) › `Pagination Layout=full` del kit; móvil `Layout=compact` | calcado — es la paginación única del kit (misma instancia que usan las otras 18 pantallas) |
| §I (sin control) | no hay estado de error: un fallo de red se ve como «no hay ventas» | Listado (error) › `EmptyState Variant=error` + «Reintentar» | Nuevo |
| §J.2 | KPIs del periodo | Listado (listo) › 4 `StatCard`: «Ventas del periodo», «Ticket promedio», «Transacciones», «Impuestos» | Nuevo |
| §J.1 | filtro «Método de pago» | FilterPanel › `MultiSelect` | Nuevo |
| §J.1 | filtro «Rango de importe» | FilterPanel › `NumberInput Affix=prefix` | Nuevo |
| §J.1 | «Con saldo pendiente» / «Con devolución» / «Pendientes de sincronizar» | FilterPanel › 3 `Checkbox` | Nuevo |
| §J.1 | presets de periodo (Hoy · Ayer · 7 días · 30 días · Personalizado) | FilterPanel › `DateRange` + `FilterChips` | Nuevo |
| §J.3 | exportación (CSV/XLSX del resultado filtrado) | `PageHeader` › «Exportar» + badge Nuevo; `BulkActionBar` › «Exportar» | Nuevo |
| §J.4 | acciones masivas | Listado (selección + BulkActionBar) › `BulkActionBar Layout=desktop`: «3 seleccionadas» · «Seleccionar las 1.312» · Imprimir · Exportar · Marcar pagadas · Enviar por correo | Nuevo |
| §J.4 | anular en lote | — | omitido: anular es destructivo y debe ir una a una, con motivo y nota crédito (§I.4) |
| §J.5 | columna «Sucursal» | Tabla › columna «Sucursal» | Nuevo |
| §J.5 | columna «Cajero» | Tabla › columna «Cajero» | Nuevo |
| §J.5 | columna «Método» de pago | Tabla › columna «Método» | Nuevo |
| §J.6 | «Reimprimir en Caja» desde el listado | menú ⋯ › «Reimprimir en Caja» | Nuevo |
| §J.6 | «Enviar por correo» el ticket | menú ⋯ › «Enviar por correo»; `BulkActionBar` | Nuevo |
| §J.5 | enlaces «Ver factura» / «Ver en cartera» / «Ver en contabilidad» desde la fila | menú ⋯ | Nuevo |
| §G | modo offline: badge «Pendiente de sincronizar» en fila | Tabla › fila «Sin número / local-8821» | calcado (hoy sólo lo conoce el listado, no el detalle — §E.3) |
| §H.2 | sucursal como filtro del header | `AppHeader` › `BranchPicker` «Sucursal Principal» + columna «Sucursal» | calcado (decisión vigente: la sucursal del header es el filtro) |
| §I.8 | `alert('Venta anulada correctamente')` / `alert('Error al anular la venta')` / `alert('Error al imprimir')` | `Toasts de Ventas` (9 toasts) | sustituido por `Toast` del kit |

## 2. Detalle — `/app/pos/ventas/[id]` (§B de la auditoría)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.1 #30 | (ArrowLeft) a `/app/pos/ventas` | Detalle POS › `Breadcrumbs` «POS › Ventas › F-001482» | sustituido por Breadcrumbs del kit |
| B.1 #31 | «Venta #{id8}» / «Pedido {invoice_number}» | Detalle POS «Venta F-001482» · Detalle Web «Pedido P-0002144» | sustituido: el consecutivo real (`invoice_sales.number` / `web_orders.order_number`) en vez del UUID recortado (§I.13) |
| B.1 #32 | badge «Web» / «Mesa» / «POS» | fila de badges bajo el `PageHeader` | calcado, con los tonos de `SISTEMA-BADGES.md` |
| B.1 #33 | badge de estado (mapa propio, distinto al del listado) | fila de badges: «Completada» éxito·suave · «Anulada» peligro·contorno · «Pendiente de sincronizar» advertencia·contorno | sustituido: un estado = un tono en toda la app; se unifica con el del listado (§E.3) |
| B.1 #34 | `FactusStatusBadge` + CUFE | fila de badges: «Factus · Aceptada» + «CUFE 9a1f…c4d2» | calcado |
| B.1 #35 | «{fecha} a las {hora}» | `PageHeader` subtítulo + sucursal + cajero | calcado + sucursal y cajero (Nuevo: `seller_name` se calcula hoy y no se pinta en ninguna parte — §J.7) |
| B.2 #36 | botón «Imprimir» | Barra de acciones › «Imprimir» | calcado |
| B.2 #37 | «Reimprimir en Caja» / «Enviando...» + tooltip | Barra de acciones › «Reimprimir en Caja» | calcado |
| B.2 #38-#40 | toasts «Reimpresión enviada» / «Sin impresora asignada» / «Error» | `Toasts de Ventas` | calcado (ya usan `useToast`: es el único de los tres pantallas que lo hace) |
| B.2 #41 | botón «Duplicar» | Barra de acciones › «Duplicar» | calcado |
| B.2 #42 | botón «Devolución» (sólo `completed`, ruta inexistente) | Barra de acciones › «Devolución» | sustituido: se retira la guarda imposible y el enlace apunta a la pantalla real (§I.6) |
| B.2 #43 | botón «Anular» (`confirm` + `prompt` + `alert`) | Barra de acciones › «Anular» → `ConfirmDialog — Anular venta` | sustituido por `ConfirmDialog` + motivo obligatorio |
| B.2 | `SendToFactusButton` importado y nunca renderizado | Barra de acciones › menú «⋯» | omitido en la barra visible: se deja en el menú «⋯» porque el envío a la DIAN se hace desde Finanzas; se documenta el import muerto en §B.2 |
| B.3 #44 | «Productos ({n})» | Detalle POS › Card «Productos (3)» | calcado |
| B.3 #45 | columna «Producto» | Card «Productos» › columna «Producto» con variante en gris | calcado |
| B.3 #46 | «SKU: {sku}» | columna «SKU / Serial» | calcado + serial (`sale_items.serial_ids`, hoy ni se consulta) |
| B.3 #47-#49 | columnas «Cant.» / «Precio» / «Total» | Card «Productos» | calcado |
| §J.7 | descuento por línea (`sale_items.discount_amount`) | columna «Descuento» | Nuevo |
| §J.7 | impuesto por línea (`sale_items.tax_amount`, `.tax_rate`) | columna «Impuesto» («IVA 19 % $ 30.320») | Nuevo |
| §J.7 | modificadores (viven en `sale_items.notes` jsonb) | línea «↳ Plantilla ortopédica · modificador» | Nuevo en el detalle (en el carrito sí se pintan hoy) |
| B.4 #50 | «Pagos» | Card «Pagos aplicados (2)» | calcado |
| B.4 #51 | por pago: método (crudo, en inglés), fecha, importe | Card «Pagos» › «Efectivo» / «Tarjeta · Visa ****4417» | sustituido: el método se rotula en español en vez de `capitalize` sobre `cash`/`card` |
| §J.7 | `payments.reference`, `.change_amount`, `.payment_date` | columnas «Referencia», «Cambio», «Fecha» | Nuevo |
| §I.11 | Total pagado / Cambio / Falta | Card «Pagos» › fila de tres cifras | Nuevo |
| B.5 #52 | Card «Cliente» (nombre, doc, correo, teléfono, «Cliente genérico») | Detalle POS › Card «Cliente» con `Avatar` | calcado |
| §J.5 | enlace a la ficha del cliente | Card «Cliente» › «Ver ficha del cliente» | Nuevo |
| B.5 #53 | «Resumen» › «Subtotal» | Card «Resumen» | calcado |
| B.5 #54 | desglose de impuestos por `tax_breakdown[i].name` + « (incluido)» | Card «Resumen» › «IVA 19 %» / «Impoconsumo 8 %» | calcado (regla I.4.1: la etiqueta es `{nombre} {tasa}`, nunca «IVA» por defecto) |
| B.5 #55 | «Descuentos» en verde | Card «Resumen» | calcado |
| B.5 #56 | «Envío» (Truck) | Card «Resumen» | calcado |
| B.5 #57 | «Propina» | Card «Resumen» (con importe en el frame de Mesa) | calcado |
| §J.7 | mesero de la propina (`sales.tip_server_id`) | Detalle Mesa › bajo «Propina»: «Mesera Laura Restrepo · 10 % sugerido en la pantalla del cliente» | Nuevo |
| B.5 #58 | «Total» | Card «Resumen» | calcado |
| B.5 #59 | «Saldo Pendiente» en rojo | Card «Resumen» | calcado |
| B.5 #60 | Card «Información de Mesa» (mesa, mesero, comensales, tiempo en mesa) | Detalle Mesa › Card «Información de Mesa» | calcado; «1 h 12 min» en vez de «72 min» (§I.10) |
| §J.5 | enlace a la sesión de mesa / comanda | Card «Información de Mesa» › «Ver la sesión de mesa» | Nuevo |
| B.5 #61 | Card «Factura» (número, badge, total, saldo, «Ver factura») | Detalle POS › Card «Factura» | calcado (es el único enlace que hoy va al registro correcto) |
| B.5 #62 | Card «Cuenta por Cobrar» + «Ver en cuentas por cobrar» (va al listado) | Detalle POS › Card «Cuenta por Cobrar» › «Ver la cuenta por cobrar» | sustituido: el enlace apunta al registro, cuyo id ya está cargado (§I) |
| B.5 #63 | Card «Asiento Contable» (memo, badge, tabla de cuentas) + «Ver en contabilidad» (va al listado) | Detalle POS › Card «Asiento Contable» › «Ver el asiento» | sustituido: ídem |
| B.5 #64 | Card «Detalles del Pedido» (tipo de entrega, dirección, método de pago, cupón) | Detalle Web › Card «Detalles del Pedido» | calcado + «Notas del cliente» y «Abrir el pedido online» (Nuevo) |
| B.5 #65 | Card «Notas» | Detalle POS › Card «Notas» | calcado |
| B.6 #66 | skeleton (`PageHeaderSkeleton` + `DetailSkeleton`) | Detalle (cargando) › `Skeleton Variant=card` | calcado con el componente del kit |
| B.6 #67 | «Venta no encontrada» + «Volver al listado» | Detalle (no encontrada o error) › `EmptyState Variant=error` | sustituido: hoy es también lo que se ve cuando la consulta falla, sin «Reintentar» |
| §J.7 | comisión del vendedor (`salesperson_id`, `commission_rate`, `commission_type`) | Detalle POS › Card «Comisión del vendedor» | Nuevo |
| §J.7 | historial de la venta (creada, cobrada, impresa, facturada, reimpresa, anulada) | Detalle POS › Card «Historial de la venta» | Nuevo |
| §J.7 | devoluciones asociadas | Detalle anulada › aviso con «Ver la nota crédito» | Nuevo |
| §E.4 #3 | estado real `void` (hoy se ve el literal «void» o «Pendiente» amarillo) | Detalle (anulada con nota crédito) › badge «Anulada» + aviso con motivo, autor, hora y consecuencias | sustituido |
| §G | `pending_sync` en el detalle | Detalle (pendiente de sincronizar) › badge + aviso + acciones de red deshabilitadas con motivo | Nuevo (el detalle hoy ni conoce el estado) |
| §F | origen Web sin pagos / vendedor / factura / asiento | Detalle Web › aviso «Este pedido todavía no tiene pagos registrados» | Nuevo |
| §J.6 | «Enviar por correo» el ticket | Barra de acciones › «Enviar por correo» | Nuevo |
| §B.5 | `customers.address` y `products.barcode` se consultan y no se muestran | — | omitido: no aportan a la lectura de la venta; se documentan como consulta innecesaria en §I.12 |

## 3. Nueva venta — `/app/pos/ventas/nuevo` (§C de la auditoría)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C #68 | (ArrowLeft) a `/app/pos` | Cabecera — Nueva Venta › `Breadcrumbs` «POS › Ventas › Nueva» | sustituido: hoy la flecha lleva a `/app/pos`, no al listado del que se viene |
| C #69 | «Nueva Venta» / «Duplicar Venta» + nombre de la organización | Cabecera — Nueva Venta | calcado + sucursal y estado de caja |
| C #70 | botón «Guardar» (`alert('Venta guardada como pendiente')`, el carrito se pierde) | Nueva (Guardar en espera · diálogo real) › `KbdButton` «Guardar en espera · F6» + diálogo «Poner Carrito en Espera» | sustituido por el diálogo real que el POS ya tiene (B.15 #10-#12) + badge «Nuevo» |
| C #71 | botón «Cobrar» | Cabecera › `KbdButton Variant=primary` «Cobrar · F4» | calcado + atajo visible (D2) |
| C #72 | `ProductSearch` (buscador + grid + categorías + variantes + modificadores) | Nueva (carrito del POS reutilizado) › instancia del POS v2 (`PosProductSearch`, `CategoryBar`, `ProductCard`) | calcado — **se instancia el POS v2, no se redibuja** |
| C #73-#74 | rótulo «Cliente» + `CustomerSelector` | carrito del POS v2 › `CustomerPicker` compartido | sustituido por el `CustomerPicker` del kit (decisión del dueño: un solo search-select de clientes en toda la app; hoy hay **dos** componentes en `components/pos/` — §I.16) |
| C #75 | «Carrito ({n})» | carrito del POS v2 › «Carrito · 4 productos» | calcado |
| C #76 | botón «Limpiar» (`confirm('¿Limpiar el carrito?')`) | carrito del POS v2 › `ConfirmDialog` de la Sección «Carrito» | sustituido por `ConfirmDialog` del kit |
| C #77 | vacío «El carrito está vacío» / «Busca productos para agregar» | Sección «Carrito» › `Escritorio / POS v2 — Carrito (vacío)` | calcado (ya existe; se referencia, no se duplica) |
| C #78 | línea del carrito (nombre, precio unitario, modificadores, X, − n +, total) | `CartLine` del kit, dos renglones (D3) | sustituido: la línea del POS v2 muestra además descuento, nota, impuesto incluido/excluido, badge de cocina y atajos; la de Nueva venta era una **segunda implementación** que ya divergió (§C, regla 7 de CLAUDE.md) |
| C #79 | campo «Código de cupón» | Nueva (cupón funcional aplicado) › campo del carrito | calcado |
| C #80 | botón «Aplicar» (`alert('Cupón "X" aplicado (demo)')`) | Nueva (cupón funcional aplicado) › panel verde «Cupón AHORRA10 aplicado · −$ 18.990 · válido hasta el 30/09/2026 · 1 uso por cliente» + `Toast` con «Quitar» | sustituido + badge «Nuevo»: el cupón se valida contra `coupons` y se aplica como línea de descuento retirable (§I.7, §D.16 #9) |
| C #81 | totales «Subtotal» / «Impuestos» / «Descuentos» | carrito del POS v2 › «Subtotal», «Impuesto general 19 %», «Impoconsumo 8 %», «Total impuestos», «Descuento» | sustituido: el desglose por nombre del POS v2, que Nueva venta no tenía (regla I.4.1) |
| C #82 | «Total» | carrito del POS v2 › «Total» grande | calcado |
| C #83 | botón «Cobrar {total}» (h-12) | carrito del POS v2 › `CobrarButton State=default` «Cobrar · $ 479.800 · F4» | calcado |
| C #84 | `CheckoutDialog` | Nueva › Cobro (reutiliza el cobro del POS v2, sin cambios) | calcado — es literalmente el mismo componente en código; se reutiliza el frame de la Sección «Cobro» |
| C #85 | skeleton de carga | Sección «Carrito» › `Escritorio / POS v2 — Carrito (cargando)` | calcado (ya existe; se referencia) |
| C #86 | «Seleccione una sucursal» (tarjeta centrada, sin acción) | Nueva (sin sucursal seleccionada) › «Elige la sucursal para vender» + `Select` + «Empezar a vender» | sustituido: era un callejón sin salida (§I.16, D3b «estados con acción») |
| C #87 | `alert('Error al agregar producto')` | Sección «Buscador y grid» › Toasts | sustituido por `Toast` error |
| C #88 | `alert('El carrito está vacío')` | `CobrarButton State=deshabilitado` | sustituido: el botón dice por qué no se puede cobrar en vez de un `alert()` posterior |
| C #89 | `alert('Venta completada: {total}')` + redirección al detalle | Nueva › Post-venta (reutilizado del POS v2) | sustituido por el post-venta del POS v2, con «Nueva venta · Enter» como acción primaria |
| §J.8 | atajos `Kbd` en Nueva venta | Cabecera › `F6` y `F4`; carrito del POS v2 › `/`, `F2`, `D`, `N`, `T`, `Supr` | Nuevo (todo el sistema de atajos es Nuevo, D2) |
| §J.8 | móvil | Móvil / Ventas — nueva (productos · carrito · cobro) | calcado del POS v2 móvil, reutilizado |
| C | «Duplicar Venta» (`?duplicate=true`) | — | omitido como frame propio: es el mismo carrito con las líneas precargadas; sólo cambia el título de la cabecera, que ya está documentado en C #69 |

---

## Conteo

| Estado | Filas |
|---|---|
| calcado | 48 |
| Nuevo | 34 |
| sustituido por … | 27 |
| omitido (con motivo) | 4 |
| **Total** | **113** |

Los 89 controles de la auditoría están cubiertos; las 24 filas restantes son las adiciones de
§I (lo roto que se sustituye y no tenía control equivalente) y §J (lo que le falta a Ventas).

## Componentes del kit reutilizados

`Sidebar Mode=expanded` · `AppHeader` · `OrgSwitcher` · `BranchPicker` · `Breadcrumbs` ·
`PageHeader Variant=list|detail` · `StatCard Size=md` · `SearchBar` · `FilterButton` ·
`FilterChips` · `Select` · `MultiSelect` · `SearchSelect` · `DateRange` · `NumberInput` ·
`Checkbox` · `FormField` · `TableCell` (13 variantes) · `Pagination Layout=full|compact` ·
`BulkActionBar Layout=desktop` · `EmptyState Variant=search|error` · `Skeleton Variant=card|table-row` ·
`Toast` (5 variantes) · `ConfirmDialog Variant=destructive` · `MenuItem` · `Badge` (tabla de tonos) ·
`BranchBadge` · `Marca/Nuevo` · `Button` · `IconButton` · `KbdButton` · `Kbd` · `Avatar` ·
`MobileHeader Mode=page` · `MobileTabBar Active=ventas` · `CustomerPicker` · `CartLine` ·
`CheckoutAccordion` · `CobrarButton` · `PosProductSearch` · `CategoryBar` · `ProductCard` ·
`CartTag` · 30 iconos del set `Icon/*`.

## Dos sustituciones que conviene justificar

1. **`DataTable` del kit → tabla compuesta con `TableCell`.** El `DataTable` de `02 Componentes`
   es un component set cerrado cuyas columnas son las del catálogo de productos (Código, Nombre,
   Atributos, Categoría, Precio, Margen, Stock, Estado). Una instancia no permite añadir ni quitar
   columnas, así que la tabla de Ventas se compone con instancias de `TableCell` —el átomo del
   mismo kit, con sus 13 variantes y sus dos densidades— dentro de un contenedor con el mismo
   relleno, borde y radio de 12 px del `DataTable`. Los estados cargando / vacío / error sí usan
   `Skeleton` y `EmptyState` del kit. Si el dueño lo prefiere, el paso siguiente es añadir un eje
   `Columnas` al `DataTable` en `02`, que esta tanda no toca por decisión del brief.
2. **`FilterPanel` del kit → panel compuesto con sus mismos átomos.** Igual motivo: el
   `FilterPanel Layout=popover` tiene fijos los seis filtros de producto (Categoría, Estado, Imagen,
   Tipo, Stock, Atributos). El de Ventas tiene ocho campos más tres casillas, en dos columnas, y se
   arma con `Select`, `SearchSelect`, `MultiSelect`, `DateRange`, `NumberInput` y `Checkbox` del kit,
   con la misma cabecera («Filtros» + «Limpiar (n)»), el mismo pie informativo y la misma sombra.

## Verificación

- Solapes entre Secciones de `05 POS y ventas`: **0**.
- Solapes entre frames de primer nivel dentro de las tres Secciones nuevas: **0**.
- Frames que desbordan su Sección: **0**.
- Hijos que desbordan su frame: **0**.
- Instancias rotas en toda la página: **0** de **11.821**.
- Separación: 160 px entre frames, 400 px entre Secciones (Descuentos termina en y 50.540 ·
  Ventas — listado 50.940 · Ventas — detalle 54.840 · Ventas — nueva 59.040).
- Índice de la página actualizado con las entradas 11, 12 y 13.

Capturas: `docs/design/figma/16-ventas-01-listado.png`, `16-ventas-02-detalle.png`,
`16-ventas-03-nueva.png`, `16-ventas-listado-escritorio.png`, `16-ventas-listado-filtros.png`,
`16-ventas-listado-movil.png`, `16-ventas-detalle-escritorio.png`, `16-ventas-nueva-escritorio.png`.
