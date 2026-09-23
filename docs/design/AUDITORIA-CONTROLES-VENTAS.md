# Auditoría control por control — Ventas del POS

Insumo para el rediseño en Figma de la sección **Ventas** del módulo POS
(«GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`, página `05 POS y ventas`).
Profundiza sobre `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.3 (líneas 1253-1267),
que resume las tres pantallas en 27 controles y no baja al servicio ni al esquema;
los hallazgos de §D.16 #1, #2 y #5 se dan por conocidos y aquí se amplían.

Fecha: 2026-09-22. Solo lectura de código; **columnas, `CHECK` y políticas RLS verificadas con
`SELECT` por el MCP de Supabase** (`jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente.
Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · campo · filtro · badge (solo lectura) ·
tabla · diálogo · tooltip · estado (vacío/cargando/error/aviso) · texto · stat (KPI) ·
paginación · toast · cálculo (regla sin control visible). **Etiqueta exacta** es el literal del
código con su acentuación (o su falta): **nada de Ventas pasa por `messages/es.json`**, todos los
textos son literales en el `.tsx`. **Cuándo aparece**: «Siempre» = incondicional dentro de su
pantalla; breakpoints Tailwind (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Alcance y tamaño de los archivos:

| Pantalla | Ruta | Componente | Líneas |
|---|---|---|---|
| Listado | `/app/pos/ventas` | `components/pos/ventas/VentasPage.tsx` | 212 |
| — filtros | — | `VentasFilters.tsx` | 152 |
| — tabla | — | `VentasTable.tsx` | 300 |
| — datos | — | `VentasService.ts` | 676 |
| — tipos | — | `types.ts` | 143 |
| Detalle | `/app/pos/ventas/[id]` | `VentaDetalle.tsx` | 839 |
| Nueva venta | `/app/pos/ventas/nuevo` | `nuevo/NuevaVentaPage.tsx` | 449 |

Las tres rutas de `app/app/pos/ventas/**/page.tsx` son envoltorios `'use client'` de tres a siete
líneas: **no hay ni un route handler ni un componente de servidor en toda la sección**. Todo —
consulta, filtro, paginación, anulación — ocurre en el navegador contra PostgREST con la sesión
del usuario.

Índice: A. Listado · B. Detalle · C. Nueva venta · D. Qué consulta `VentasService` ·
E. Estados y badges · F. Origen (POS / Web / Mesa / invoice) · G. Offline (`pending_sync`) ·
H. Permisos y multi-sucursal · I. Lo roto · J. Qué le falta a Ventas para ser útil ·
K. Conteo.

---

## A. Listado — `/app/pos/ventas`

### A.1 Cabecera y acciones globales

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, sin etiqueta ni `aria-label`) | `Link` → `/app/pos` | Siempre | VentasPage.tsx:143-147 |
| 2 | texto | «Historial de Ventas» | `h1`, 2xl/3xl bold | Siempre | VentasPage.tsx:149-151 |
| 3 | texto | «{totalSales} ventas encontradas» | Contador del servidor (`posCount + webCount`) | Siempre | VentasPage.tsx:152-154 |
| 4 | botón | «Actualizar» (+ RefreshCw que gira con `isLoading`) | `loadSales()` | Siempre | VentasPage.tsx:159-162 |
| 5 | botón | «Nueva Venta» (+ Plus) | `Link` → `/app/pos/ventas/nuevo` | Siempre | VentasPage.tsx:163-168 |
| 6 | estado | `PageHeaderSkeleton` + `StatsSkeleton count={4}` + `CardListSkeleton cards={4}` | Carga inicial | `orgLoading` | VentasPage.tsx:128-136 |

**Nota sobre #6:** el esqueleto promete **cuatro KPIs que la pantalla nunca renderiza**. No hay
`StatCard` alguno en `VentasPage.tsx`; el servicio sí tiene `getDailySummary()`
(`VentasService.ts:434-486`) y **nadie lo llama**. Es decir: la pantalla parpadea cuatro tarjetas
de KPI al cargar y luego no muestra ninguna. Ver §J.2.

**Nota sobre iconos muertos:** `Download` y `FileText` se importan en `VentasPage.tsx:9,11` y no se
usan en ninguna parte del archivo. La exportación estaba prevista y nunca se construyó.

### A.2 Filtros — `VentasFilters.tsx`

Rejilla de 1 / 2 / 3 / 4 columnas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`),
dentro de una `Card`. **Siempre desplegada**: no hay botón «Filtros» ni panel colapsable, lo que
choca con la decisión de «un solo buscador + botón de filtros» del brief.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 7 | campo | Etiqueta «Buscar» · placeholder «ID, cliente, notas...» (+ icono Search) | `form` con `onSubmit`; sólo aplica al pulsar `Enter` (no hay botón «Buscar») | Siempre | VentasFilters.tsx:42-53 |
| 8 | filtro | «Origen»: «Todos» / «POS» / «Página Web» | `source_type` | Siempre | VentasFilters.tsx:55-71 |
| 9 | filtro | «Estado»: «Todos los estados» / «Pendiente» / «Completada» / «Anulada» | `status` | Siempre | VentasFilters.tsx:73-90 |
| 10 | filtro | «Estado de pago»: «Todos» / «Pagado» / «Pendiente» / «Parcial» / «Reembolsado» | `payment_status` | Siempre | VentasFilters.tsx:92-110 |
| 11 | campo | «Desde» (`input type=date`) | `date_from`; aplica al instante | Siempre | VentasFilters.tsx:112-121 |
| 12 | campo | «Hasta» (`input type=date`) | `date_to`; aplica al instante | Siempre | VentasFilters.tsx:123-132 |
| 13 | botón | «Limpiar» (+ X) | Vacía `filters` y el buscador local | Sólo con algún filtro activo | VentasFilters.tsx:134-149 |

`SalesFilter` (`types.ts:108-118`) declara además `customer_id`, `user_id` y `branch_id`. **Ninguno
de los tres tiene control en la interfaz**: el servicio los soporta (`customer_id` sí,
`VentasService.ts:57,84`) o los ignora (`user_id` y `branch_id` **no se leen nunca** en
`getSales`; la sucursal sale del contexto global, §H.2). Son tres filtros implementados a medias.

### A.3 Tabla — `VentasTable.tsx`

Ocho columnas fijas, sin ordenación por columna, sin selección, sin columna de sucursal.
Fila entera clicable (`onClick={() => onView(sale)}`, :186).

| # | Tipo | Columna / contenido | Origen del dato | Archivo:línea |
|---|---|---|---|---|
| 14 | tabla | «Fecha» → `formatDate(sale_date ?? created_at)` + hora en gris `formatTime(...)` | `sales.sale_date` (timestamptz) | VentasTable.tsx:171, 188-197 |
| 15 | badge | «Origen» → «Web» (azul) / «Mesa» (naranja) / «POS» (índigo) | `_source` calculado en el navegador | VentasTable.tsx:172, 198-212 |
| 16 | tabla | «ID» → `CopyableId` con `invoice_number ?? id.slice(0,8)+'...'`, copia el UUID completo | `web_orders.order_number` o el UUID | VentasTable.tsx:173, 213-221 |
| 17 | tabla | «Cliente» → `full_name` + `doc_number ?? phone ?? 'Sin datos'`; si no hay, «Cliente genérico» en gris | `customers` o campos planos de `web_orders` | VentasTable.tsx:174, 222-233 |
| 18 | tabla | «Total» (derecha, semibold) → `formatCurrency(sale.total)` | `sales.total` | VentasTable.tsx:175, 234-236 |
| 19 | badge | «Estado» → ver §E.1 | `sales.status` | VentasTable.tsx:176, 58-102 |
| 20 | badge | «Pago» → ver §E.2 | `sales.payment_status` | VentasTable.tsx:177, 104-141 |
| 21 | menú ⋯ | «Acciones» (MoreHorizontal) | Dropdown por fila | VentasTable.tsx:178, 243-292 |
| 22 | menú | «Ver Detalle» (Eye) | → `/app/pos/ventas/{id}` | VentasTable.tsx:251-257; VentasPage.tsx:57-59 |
| 23 | menú | «Imprimir» (Printer) | `getSaleById` + `PrintService.smartPrint` | VentasTable.tsx:258-264; VentasPage.tsx:86-110 |
| 24 | menú | «Duplicar» (Copy) | `duplicateSale` → `sessionStorage` → `/app/pos/ventas/nuevo?duplicate=true` | VentasTable.tsx:265-271; VentasPage.tsx:61-68 |
| 25 | menú | «Crear Devolución» (RotateCcw) | → `/app/pos/devoluciones/nuevo?sale_id=` | Sólo `status === 'completed'` | VentasTable.tsx:273-281 |
| 26 | menú | «Anular Venta» (XCircle, rojo) | `confirm()` + `prompt()` + `cancelSale` | `status !== 'cancelled' && !== 'expired'` | VentasTable.tsx:282-290; VentasPage.tsx:70-84 |
| 27 | estado | `TableSkeleton rows={5} columns={6}` | Cargando (pero la tabla tiene **8** columnas) | `isLoading` | VentasTable.tsx:143-145 |
| 28 | estado | «No hay ventas» / «No se encontraron ventas con los filtros seleccionados.» + botón «Crear Nueva Venta» | Vacío | `sales.length === 0` | VentasTable.tsx:147-164 |
| 29 | paginación | `DataTablePagination` (componente único del kit, 19 usos en la app) | Página y tamaño; reinicia a 1 al cambiar tamaño | Siempre | VentasPage.tsx:199-209 |

**No existe estado de error.** `loadSales` traga la excepción en un `console.error`
(`VentasPage.tsx:46-48`) y deja la tabla vacía: un fallo de red es indistinguible de «no hay
ventas». Lo mismo dentro del servicio (`VentasService.ts:172-175` devuelve `{data:[], total:0}`).

---

## B. Detalle — `/app/pos/ventas/[id]`

### B.1 Cabecera

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 30 | botón | (ArrowLeft) | → `/app/pos/ventas` | Siempre | VentaDetalle.tsx:267-271 |
| 31 | texto | «Venta #{id.slice(0,8)}» · o «Pedido {invoice_number}» si es web | `h1` | Siempre | VentaDetalle.tsx:274-276 |
| 32 | badge | «Web» (Globe) / «Mesa» (Utensils) / «POS» (ShoppingCart) | Origen | Siempre | VentaDetalle.tsx:277-292 |
| 33 | badge | Estado: «Completada» / «Pendiente» / «Anulada» / «Expirada» (§E.3) | `sale.status` | Siempre | VentaDetalle.tsx:193-237, 293 |
| 34 | badge | `FactusStatusBadge` (`size=md`, `showTooltip`) con el CUFE | Estado DIAN de la factura asociada | Sólo si hay job de facturación electrónica | VentaDetalle.tsx:294-301 |
| 35 | texto | «{fecha} a las {hora}» | `formatDate` + `formatTime` sobre `sale_date ?? created_at` | Siempre | VentaDetalle.tsx:303-306 |

### B.2 Barra de acciones

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 36 | botón | «Imprimir» (Printer) | `PrintService.smartPrint` con `tax_breakdown` y timezone | Siempre | VentaDetalle.tsx:311-314, 114-131 |
| 37 | botón | «Reimprimir en Caja» / «Enviando...» · `title` «Enviar a la impresora física de caja (vía Print Agent)» | `PrintJobsService.enqueueSaleTicket` | Siempre | VentaDetalle.tsx:315-325, 133-165 |
| 38 | toast | «Reimpresión enviada» / «El ticket se envió a la impresora física de caja» | Éxito (`enqueued > 0`) | Tras #37 | VentaDetalle.tsx:151 |
| 39 | toast | «Sin impresora asignada» / «No hay impresora configurada para la estación de Caja» (destructive) | `enqueued === 0` | Tras #37 | VentaDetalle.tsx:153-157 |
| 40 | toast | «Error» / «No se pudo reimprimir el ticket» (destructive) | Excepción | Tras #37 | VentaDetalle.tsx:161 |
| 41 | botón | «Duplicar» (Copy) | Igual que #24 | Siempre | VentaDetalle.tsx:326-329, 167-174 |
| 42 | botón | «Devolución» (RotateCcw) | → ruta inexistente | Sólo `status === 'completed'` | VentaDetalle.tsx:330-335, 188-191 |
| 43 | botón | «Anular» (XCircle, `variant=destructive`) | `confirm()` + `prompt()` + `alert()` | `status !== 'cancelled'` | VentaDetalle.tsx:336-341, 176-186 |

`SendToFactusButton` se importa (`VentaDetalle.tsx:57`) y **nunca se renderiza**: desde el detalle
de una venta no se puede enviar la factura a la DIAN, sólo verla si ya se envió desde Finanzas.

### B.3 Bloque «Productos ({n})» (columna principal, `lg:col-span-2`)

| # | Tipo | Columna / contenido | Archivo:línea |
|---|---|---|---|
| 44 | texto | «Productos ({items.length})» + icono Package | VentaDetalle.tsx:351-354 |
| 45 | tabla | «Producto» → `products.name ?? notes.product_name ?? 'Producto'` | VentaDetalle.tsx:361, 372-374 |
| 46 | texto | «SKU: {products.sku ?? 'N/A'}» en 12 px gris | VentaDetalle.tsx:375-377 |
| 47 | tabla | «Cant.» (derecha) | VentaDetalle.tsx:362, 380-382 |
| 48 | tabla | «Precio» (derecha) → `unit_price` | VentaDetalle.tsx:363, 383-385 |
| 49 | tabla | «Total» (derecha, medium) | VentaDetalle.tsx:364, 386-388 |

**La tabla de líneas pierde cuatro datos que sí vienen de la BD** (`VentasService.ts:200-203`
selecciona `tax_amount`, `tax_rate`, `discount_amount` y `notes`): no hay columna de impuesto por
línea, ni de descuento por línea, ni se pintan los modificadores (que viven en `notes` jsonb y sí
se dibujan en el carrito, `NuevaVentaPage.tsx:328-336`), ni los seriales
(`sale_items.serial_ids integer[]`, que el servicio ni siquiera pide). Ver §I.12.

### B.4 Bloque «Pagos»

| # | Tipo | Contenido | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 50 | texto | «Pagos» + icono CreditCard | `payments.length > 0` | VentaDetalle.tsx:398-404 |
| 51 | tabla | Por pago: icono CreditCard en círculo verde · `{payment.method}` con `capitalize` · `formatDate(created_at)` · importe a la derecha | ídem | VentaDetalle.tsx:408-429 |

`payment.method` se pinta **crudo y en inglés**, sólo con `capitalize` CSS: la BD guarda `cash`,
`card`, `transfer`, `qr`… y la pantalla muestra «Cash», «Card». Además el bloque **no muestra**
`reference`, `change_amount`, `status` ni `payment_date` —cuatro columnas que sí existen en
`payments`— y usa `created_at` en vez de `payment_date` para la fecha.

### B.5 Panel lateral

| # | Tipo | Bloque / etiqueta exacta | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 52 | texto | «Cliente» (User) → `full_name` · «Doc: {doc_number}» · email · teléfono; si no hay, «Cliente genérico» | Siempre | VentaDetalle.tsx:440-473 |
| 53 | texto | «Resumen» (Receipt) → «Subtotal» | Siempre | VentaDetalle.tsx:476-487 |
| 54 | cálculo | Desglose de impuestos: una fila por `tax_breakdown[i]` con «{name}» + « (incluido)» si `tax_included`; si no hay `tax_breakdown`, una sola fila «Impuestos» / «Impuestos (incluidos)» | Si `tax_total > 0` | VentaDetalle.tsx:488-502 |
| 55 | texto | «Descuentos» en verde con `-{importe}` | `discount_total > 0` | VentaDetalle.tsx:503-508 |
| 56 | texto | «Envío» (Truck) | `delivery_fee > 0` | VentaDetalle.tsx:509-514 |
| 57 | texto | «Propina» | `tip_amount > 0` | VentaDetalle.tsx:515-520 |
| 58 | texto | «Total» (lg bold) | Siempre | VentaDetalle.tsx:522-525 |
| 59 | texto | «Saldo Pendiente» en rojo | `balance > 0` | VentaDetalle.tsx:526-531 |
| 60 | texto | «Información de Mesa» (Utensils): «Mesa» · «Mesero» · «Comensales» · «Tiempo en mesa» («{n} min» o «En curso») + rango horario | `mesa_info` | VentaDetalle.tsx:536-595 |
| 61 | texto | «Factura» (FileText): «Número» + badge «Pagada»/«Parcial»/crudo · «Total factura» · «Saldo» · botón «Ver factura» → `/app/finanzas/facturas-venta/{id}` | `sale.invoice` | VentaDetalle.tsx:598-641 |
| 62 | texto | «Cuenta por Cobrar» (DollarSign): «Estado» + badge «Pagada»/«Parcial»/«Vencida»/crudo · «Monto total» · «Balance» · «Vencimiento» · botón «Ver en cuentas por cobrar» → `/app/finanzas/cuentas-por-cobrar` | `sale.accounts_receivable` | VentaDetalle.tsx:644-689 |
| 63 | texto | «Asiento Contable» (BookOpen): «Memo» · badge «Publicado»/«Borrador» + fecha · tabla «Cuenta»/«Débito»/«Crédito» · botón «Ver en contabilidad» → `/app/finanzas/contabilidad/asientos` | `sale.journal_entry` | VentaDetalle.tsx:692-759 |
| 64 | texto | «Detalles del Pedido» (Globe): «Tipo de entrega» («Domicilio»/«Recoger en tienda»/crudo) · «Dirección de entrega» · «Método de pago» · «Cupón aplicado» | `_source === 'web'` | VentaDetalle.tsx:762-817 |
| 65 | texto | «Notas» (FileText), `whitespace-pre-wrap` | `sale.notes` | VentaDetalle.tsx:820-834 |

Los enlaces de #62 y #63 **van al listado, no al registro**: «Ver en cuentas por cobrar» abre
`/app/finanzas/cuentas-por-cobrar` sin el id, y «Ver en contabilidad» abre
`/app/finanzas/contabilidad/asientos` sin el id, pese a que ambos ids están cargados
(`accounts_receivable.id`, `journal_entry.id`). Sólo «Ver factura» (#61) enlaza al registro.

### B.6 Estados de la pantalla

| # | Tipo | Contenido | Archivo:línea |
|---|---|---|---|
| 66 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | VentaDetalle.tsx:239-246 |
| 67 | estado | «Venta no encontrada» (AlertCircle) + botón «Volver al listado» | VentaDetalle.tsx:248-260 |

«Venta no encontrada» es también lo que se ve cuando la consulta **falla**: `loadSale` traga el
error (:107-109) y deja `sale` en `null`. No hay «Reintentar».

---

## C. Nueva venta — `/app/pos/ventas/nuevo`

Pantalla a `h-screen` con dos paneles: izquierda `ProductSearch` (el buscador/grid del POS,
1.070 líneas), derecha un carrito **reimplementado desde cero**, distinto del carrito del POS
principal.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 68 | botón | (ArrowLeft) | → `/app/pos` (no a `/app/pos/ventas`) | Siempre | NuevaVentaPage.tsx:224-228 |
| 69 | texto | «Nueva Venta» / «Duplicar Venta» + `{organization?.name}` | Título | Siempre | NuevaVentaPage.tsx:229-236 |
| 70 | botón | «Guardar» (Save) | **`alert('Venta guardada como pendiente')` + redirige. No guarda nada.** | `cart.items.length > 0` | NuevaVentaPage.tsx:239-247, 172-177 |
| 71 | botón | «Cobrar» (CreditCard) | Abre `CheckoutDialog` | `cart.items.length > 0` | NuevaVentaPage.tsx:248-255, 158-164 |
| 72 | campo | `ProductSearch` (buscador + grid + categorías + variantes + modificadores) | Añade al carrito | Siempre | NuevaVentaPage.tsx:264; ProductSearch.tsx |
| 73 | texto | «Cliente» (User) | Rótulo | Siempre | NuevaVentaPage.tsx:271-274 |
| 74 | campo | `CustomerSelector` | `POSService.setCartCustomer` | Siempre | NuevaVentaPage.tsx:275-278 |
| 75 | texto | «Carrito ({n})» (ShoppingCart) | Contador | Siempre | NuevaVentaPage.tsx:284-289 |
| 76 | botón | «Limpiar» (Trash2, rojo) | `confirm('¿Limpiar el carrito?')` + borra ítem a ítem | `items.length > 0` | NuevaVentaPage.tsx:290-300, 179-193 |
| 77 | estado | «El carrito está vacío» / «Busca productos para agregar» (Package) | Vacío | Sin ítems | NuevaVentaPage.tsx:303-312 |
| 78 | tabla | Línea: nombre · «{precio} c/u» · badges de modificadores «{name} (+{extra})» ámbar · botón X rojo · `−` `{n}` `+` · total de línea | Por ítem | NuevaVentaPage.tsx:315-375 |
| 79 | campo | «Código de cupón» (Tag) | Sólo estado local | Siempre | NuevaVentaPage.tsx:383-391 |
| 80 | botón | «Aplicar» | **`alert('Cupón "{X}" aplicado (demo)')`. No aplica nada.** | `couponCode.trim()` | NuevaVentaPage.tsx:392-399, 143-156 |
| 81 | texto | «Subtotal» / «Impuestos» / «Descuentos» (verde, con `-`) | Totales del carrito | «Descuentos» si `> 0` | NuevaVentaPage.tsx:405-420 |
| 82 | texto | «Total» (xl bold) | — | Siempre | NuevaVentaPage.tsx:422-425 |
| 83 | botón | «Cobrar {total}» (h-12, CreditCard) | Abre `CheckoutDialog` | Siempre (deshabilitado sin ítems) | NuevaVentaPage.tsx:426-433 |
| 84 | diálogo | `CheckoutDialog` (el del POS) | Cobro completo | `showCheckout` | NuevaVentaPage.tsx:439-446 |
| 85 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={3}` | Carga | `orgLoading \|\| isLoading` | NuevaVentaPage.tsx:195-202 |
| 86 | estado | «Seleccione una sucursal» (card centrada, sin acción) | Sin `selectedBranchId` | NuevaVentaPage.tsx:204-216 |
| 87 | alert | `alert('Error al agregar producto')` | Fallo al añadir | Excepción | NuevaVentaPage.tsx:109 |
| 88 | alert | `alert('El carrito está vacío')` | Cobrar sin ítems | — | NuevaVentaPage.tsx:160 |
| 89 | alert | `alert('Venta completada: {total}')` + redirige al detalle | Tras el cobro | — | NuevaVentaPage.tsx:166-170 |

**El carrito de esta pantalla no es el del POS.** El POS principal tiene impuesto incluido/excluido
por línea, descuento inline con chips, nota por línea, badge de cocina, tooltip de SKU, selector de
impuestos disponibles y los botones Espera / Deuda / Enviar Cocina. Aquí sólo hay nombre, cantidad,
modificadores y un botón de borrar. Es una **segunda implementación del carrito** que ya divergió
de la primera (regla 7 de `CLAUDE.md`).

**Cinco `alert()` y un `confirm()` nativos** en una sola pantalla (#76, #87, #88, #89, #70, #80).

---

## D. Qué consulta `VentasService` — joins, embebidos y cálculos en el navegador

### D.1 `getSales(filter, page, limit)` — `VentasService.ts:9-176`

No hay un solo `join` ni un solo embebido de PostgREST. Son **cinco consultas planas** por carga de
página, y la combinación se hace en JavaScript:

| Paso | Consulta | Tabla | Notas |
|---|---|---|---|
| 1 | `select('*', {count:'exact'})` + `.neq('source','web')` + orden `created_at desc` | `sales` | **Sin `.range()`: pide TODAS las ventas de la organización** |
| 2 | `select('*', {count:'exact'})` + orden `created_at desc` | `web_orders` | ídem, sin `.range()` |
| 3 | `select('id, full_name, email, phone, doc_number').in('id', ids)` | `customers` | Sólo para las ventas POS de la página actual |
| 4 | `select('id, sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount, notes').in('sale_id', ids)` | `sale_items` | Se cargan **y no se usan**: la tabla del listado no pinta ni una línea |
| 5 | `select('id, web_order_id, product_id, product_name, quantity, unit_price, total').in('web_order_id', ids)` | `web_order_items` | ídem |

Cálculos hechos en el navegador:

- **Combinación y ordenación** de POS + Web: `[...posSales, ...webSales].sort(...)` (:115-116).
- **Paginación**: `combined.slice(offset, offset + limit)` (:119-120) — ver §I.1.
- **Normalización de la venta web**: los 20 campos de `web_orders` se renombran a la forma de
  `sales` (:89-110), incluido `status: confirmed|delivered → 'completed'` (:100).
- **Cliente de una venta web**: se fabrica un objeto `{full_name, email, phone}` a partir de las
  columnas planas `customer_name/_email/_phone` de `web_orders` (:165-167). No se consulta
  `customers` aunque `web_orders.customer_id` exista.
- **`_source`**: `'pos'` o `'web'` según de qué consulta venga. **«Mesa» no se calcula aquí**: en
  el listado, `sale._source === 'mesa' || sale.mesa_info` (`VentasTable.tsx:203`) es siempre falso
  porque `getSales` no carga `mesa_info`. **El badge «Mesa» nunca aparece en el listado.**

Rango de fechas: `getDateRange(inicio, fin, tz, operatingHours)` con el timezone de la organización
y las horas de operación (:22-31). Correcto, y **es el único punto de toda la sección que trata las
fechas bien**. Se aplica sobre `sales.sale_date` pero sobre `web_orders.created_at` (:54-55 vs
:81-82): dos columnas distintas para el mismo filtro.

Búsqueda: `.or('notes.ilike.%X%')` en POS (:58) y
`.or('order_number.ilike…,customer_name.ilike…,customer_notes.ilike…')` en web (:85). Ver §I.3.

### D.2 `getSaleById(saleId)` — `VentasService.ts:179-431`

Hasta **once consultas encadenadas** para una sola venta POS, la mayoría secuenciales
(`await` tras `await`, sin `Promise.all`):

| # | Tabla | Columnas | Condición |
|---|---|---|---|
| 1 | `sales` | `*` | `id = saleId` |
| 2 | `customers` | `id, full_name, email, phone, doc_number, address` | si `customer_id` |
| 3 | `sale_items` | `id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes` | siempre |
| 4 | `products` | `id, name, sku, barcode` | si hay `product_id` |
| 5 | `payments` | `*` | `source='sale' AND source_id=saleId` |
| 6 | `profiles` | `first_name, last_name` | si `user_id` → `seller_name` |
| 7 | `table_sessions` + embebido `restaurant_tables (id, name, number)` | — | si `table_session_id` |
| 8 | `profiles` | `first_name, last_name` | si `table_sessions.server_id` → mesero |
| 9 | `invoice_sales` | `id, number, issue_date, due_date, status, total, balance, payment_method` | `sale_id = saleId` |
| 10 | `accounts_receivable` | `id, amount, balance, due_date, status` | `sale_id = saleId` |
| 11 | `journal_entries` + `journal_lines` | `id, entry_date, memo, posted` / `id, account_code, debit, credit, description` | `source='sale' AND source_id=saleId` |

Y **una doceava** desde el propio componente: `VentaDetalle.tsx:84-88` vuelve a consultar
`invoice_sales` (sólo `id`) por su cuenta para el estado Factus, repitiendo la consulta #9 que el
servicio ya hizo y descartando el resto de sus columnas.

El único embebido real de toda la sección es `restaurant_tables` dentro de `table_sessions` (:243-246).

**Tablas a las que el detalle NO consulta aunque los datos existan:**

| Dato | Dónde vive | Estado |
|---|---|---|
| Sucursal de la venta | `branches` (vía `sales.branch_id`, NOT NULL) | **Nunca se consulta ni se muestra**, ni en el listado ni en el detalle |
| Vendedor con comisión | `sales.salesperson_id`, `.commission_rate`, `.commission_type` | **Nunca se consultan.** `types.ts:129-130` declara `salesperson_name` y `commission_amount` y nadie los rellena |
| Mesero de la propina | `sales.tip_server_id` | Declarado en `types.ts:121`, nunca consultado |
| Conductor | `sales.driver_id` | ídem, `types.ts:122` |
| Devoluciones de la venta | tablas de devoluciones | **Ninguna consulta.** No se sabe si una venta tiene devoluciones |
| Sesión de caja | `cash_sessions` | Sin relación visible desde la venta |
| Oportunidad / reserva de origen | `sales.opportunity_id`, `.reservation_id` | Nunca consultadas |
| Seriales vendidos | `sale_items.serial_ids integer[]` | No se pide en el `select` |
| Pago por comensal | `sale_items.paid_at`, `.paid_by_split_id` | No se piden |
| Si entra en caja | `sales.include_in_cash_register` | Nunca consultada |

### D.3 Resto del servicio

`getDailySummary()` (:434-486) suma en el navegador `total`, `tax_total`, `discount_total` y cuenta
por estado (`pending` / `completed` / `cancelled`) sobre **todas** las ventas del día. Nadie lo
llama, y los dos últimos contadores cuentan estados que la BD no admite (§E.4).

`getCurrentCashSession`, `openCashSession` y `closeCashSession` (:489-630) viven en
`VentasService` pero pertenecen a Cajas. `closeCashSession` recalcula el monto esperado en el
navegador iterando `cash_movements` (:582-599): tercera implementación de un cálculo de caja.

`cancelSale` (:633-653) y `duplicateSale` (:656-675): ver §I.4 y §I.5.

---

## E. Estados de venta y de pago, con sus badges actuales

### E.1 Badge de estado en el listado — `VentasTable.tsx:58-102`

| Valor | Etiqueta | Tono actual | Icono | Tono según `SISTEMA-BADGES.md` |
|---|---|---|---|---|
| `completed` · `paid` | «Completada» | verde 100/700 | CheckCircle | éxito · suave |
| `pending` | «Pendiente» | amarillo 100/700 | Clock | advertencia · suave |
| `cancelled` | «Anulada» | rojo 100/700 | XCircle | **peligro · contorno** |
| `expired` | «Expirada» | gris 100/600 | Clock | neutro · suave |
| `pending_sync` | «Pendiente de sincronizar» | ámbar 100/800 | Clock | **advertencia · contorno + punto** |
| cualquier otro | el valor crudo | `variant="outline"` | — | — |

### E.2 Badge de pago en el listado — `VentasTable.tsx:104-141`

| Valor | Etiqueta | Tono actual | Tono según el sistema |
|---|---|---|---|
| `paid` | «Pagado» | verde | éxito · suave |
| `pending` | «Pendiente» | amarillo | advertencia · suave |
| `partial` | «Parcial» | **naranja** 100/700 | advertencia · contorno |
| `refunded` | «Reembolsado» | **morado** 100/700 | **información · contorno** (el morado no está en el manual) |
| `failed` | «Fallido» | rojo | peligro · suave |
| otro / vacío | el valor crudo o «N/A» | outline | — |

### E.3 Badge de estado en el detalle — `VentaDetalle.tsx:193-237`

Mapa **distinto** al del listado: cubre `completed`, `paid`, `pending`, `cancelled`, `expired` y
**no conoce `pending_sync`**. Una venta offline se ve «Pendiente de sincronizar» en ámbar en el
listado y **«Pendiente» en amarillo** al abrirla — el mismo bug de incoherencia que
`SISTEMA-BADGES.md` documenta para las facturas de Finanzas.

Además el detalle tiene **tres mapas de estado más**, todos en línea y todos distintos: el de la
factura (:614-621, «Pagada»/«Parcial»/crudo), el de la cartera (:656-666, «Pagada»/«Parcial»/
«Vencida»/crudo) y el del asiento (:708-715, «Publicado»/«Borrador»). Cinco mapas de estado en un
archivo de 839 líneas.

### E.4 Lo que la base de datos admite de verdad

`CHECK` verificados por el MCP:

```
sales_status_check         status IN ('draft','paid','partial','pending','void')
sales_payment_status_check payment_status IN ('pending','paid','partial','refunded')
sales_commission_type_check commission_type IN ('salesperson','intermediation_sale','none')
```

Conteo real de `public.sales` (todas las organizaciones, 2026-09-22):

| `status` | `payment_status` | `source` | filas |
|---|---|---|---|
| `paid` | `paid` | `pos` | 1.724 |
| `pending` | `pending` | `invoice` | 672 |
| `paid` | `paid` | `web` | 604 |
| `pending` | `pending` | `pos` | 225 |
| `paid` | `pending` | `pos` | 3 |
| `void` | `refunded` | `pos` | 3 |
| `pending` | `partial` | `pos` | 2 |
| `paid` | `paid` / `pending` | `invoice` | 2 |

**Consecuencias, todas verificadas:**

1. `'completed'` y `'cancelled'` **no existen ni pueden existir** en `sales`. El filtro «Estado»
   ofrece «Completada» y «Anulada»: ambas devuelven **siempre cero filas** para ventas POS.
   Sólo «Pendiente» funciona.
2. `status === 'completed'` es la condición de **«Crear Devolución»** y de **«Devolución»**: en una
   venta POS **nunca es cierta**. La acción sólo aparece en pedidos web (que `getSales` sí mapea a
   `'completed'`, :100). La devolución es inalcanzable desde el POS, y además apunta a una ruta que
   no existe (§I.6).
3. `cancelSale` escribe `status: 'cancelled'` → **viola el `CHECK`** → la `UPDATE` falla → el
   método devuelve `false` → `alert('Error al anular la venta')`. **Anular una venta desde Ventas
   no funciona y nunca ha funcionado.** El camino que sí funciona es el de `posService`
   (`posService.ts:3152-3181`), que escribe `status: 'void'`, `payment_status: 'refunded'`, anula la
   factura, pone la cartera en `cancelled` y devuelve el stock.
4. `status = 'void'` (las 3 ventas anuladas reales) cae en el `default` de ambos mapas: el listado
   muestra un badge outline con el texto **«void»** en inglés, y el detalle lo trata como
   «Pendiente» (`styles[status] || styles.pending`, :222) con **icono de reloj amarillo**. Una
   venta anulada se ve como pendiente.
5. `status = 'draft'` y `status = 'partial'` se verían igual de crudos.
6. `'expired'` no existe en `sales` (es un estado de `web_orders`); el mapa del listado lo incluye
   y la guarda de «Anular Venta» lo comprueba (`VentasTable.tsx:282`).

---

## F. Origen: POS / Web / Mesa — y un cuarto origen que nadie dibujó

`sales.source` es `text NOT NULL DEFAULT 'pos'` y **no tiene `CHECK`**. Valores reales:
`pos`, `web`, `invoice`.

| Origen | Cómo se determina | Qué cambia | Dónde |
|---|---|---|---|
| **POS** | `_source='pos'`: viene de `sales` con `source <> 'web'` | Badge índigo; acciones completas | VentasService.ts:62 |
| **Web** | `_source='web'`: viene de la tabla `web_orders`, **no** de `sales` | Badge azul; cliente de columnas planas; el detalle añade «Detalles del Pedido» (entrega, dirección, método de pago, cupón); `payments` vacío siempre (`VentasService.ts:425`); sin vendedor | VentasService.ts:66-111, 356-426 |
| **Mesa** | `_source='mesa'`: **sólo en el detalle**, si `sales.table_session_id` no es nulo | Badge naranja; bloque «Información de Mesa» | VentasService.ts:340 |
| **`invoice`** | **No se distingue.** 672 filas con `source='invoice'` (ventas nacidas de una factura de Finanzas) entran por el camino POS | Se muestran con **badge «POS» índigo** y se cuentan como POS en el filtro «Origen» | VentasService.ts:44, 62 |

Tres problemas de origen:

- **El badge «Mesa» es inalcanzable en el listado** (§D.1): `getSales` no trae `table_session_id`…
  en realidad sí lo trae (`select('*')`), pero **no calcula `_source='mesa'`**, y la condición de
  la tabla es `sale._source === 'mesa' || sale.mesa_info`, y `mesa_info` sólo lo rellena
  `getSaleById`. Resultado: una venta de mesa aparece como «POS» en el listado y como «Mesa» al
  abrirla.
- **El filtro «Origen» sólo tiene tres opciones** («Todos», «POS», «Página Web»): no se puede
  filtrar por Mesa ni por `invoice`.
- **Las ventas `source='web'` de `sales` son invisibles**: se excluyen con `.neq('source','web')`
  (:44) y en su lugar se listan los `web_orders`. Si un pedido web generó una venta en `sales`
  (604 filas), esa venta no se puede abrir desde aquí; se abre el pedido, que no tiene pagos,
  ni vendedor, ni factura, ni asiento contable asociados en esta pantalla.

---

## G. Ventas offline (`pending_sync`)

- `pending_sync` **no es un valor admitido por `sales_status_check`**: sólo puede venir de la
  réplica local del Desktop (fase 4B/4C), nunca del servidor.
- El único sitio de toda la sección que lo conoce es `VentasTable.tsx:89-96`, con el comentario
  «Desktop (fase 4B/4C): venta hecha sin red, guardada en el outbox local». Es un badge ámbar
  100/800 con icono Clock.
- **El detalle no lo conoce** (§E.3): al abrir una venta pendiente de sincronizar se ve
  «Pendiente» amarillo.
- **No hay aviso de modo offline** en ninguna de las tres pantallas: ni banner «Sin conexión», ni
  contador de pendientes, ni bloqueo de las acciones que requieren red. «Anular», «Reimprimir en
  Caja» y «Crear Devolución» se ofrecen igual sobre una venta que aún no existe en el servidor.
- El filtro «Estado» no ofrece «Pendiente de sincronizar», así que no hay forma de listarlas.

---

## H. Permisos y multi-sucursal

### H.1 Permisos: no hay ninguno

**Cero comprobaciones de permiso en las tres pantallas.** No se importa ningún hook de permisos, ni
`PermissionGuard`, ni se consulta rol alguno (`grep` sobre `components/pos/ventas/`: 0 resultados
para `usePermission|hasPermission|PermissionGuard`). Cualquier usuario que pueda abrir
`/app/pos/ventas` puede:

- ver todas las ventas de todas las sucursales de su organización (§H.2),
- anular cualquier venta (si el estado lo permitiera — §E.4 #3),
- imprimir y reimprimir en la caja física de cualquier sucursal,
- ver el asiento contable, la cartera y la factura de cualquier venta.

La única barrera es la RLS, y la RLS de `sales` es **pertenencia pura**, verificada por el MCP:

```
sales_select_policy              (r)  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
sales_insert_update_delete_policy (*)  misma expresión
```

Dos observaciones: la política de escritura es `polcmd='*'` —cualquier miembro puede `UPDATE`
cualquier venta de la organización—, y **ninguna de las dos comprueba
`organization_members.is_active`**, a diferencia de las de `web_orders`, que sí lo hacen. No hay
rol, no hay sucursal, no hay nada más en la guarda. Comparar con Cajas, que al menos resuelve el
permiso de «Cerrar Caja» en el cliente por nombre de rol (§D.16 #8 de la auditoría general): aquí
ni eso.

### H.2 Multi-sucursal

- `sales.branch_id` es `integer NOT NULL`: toda venta tiene sucursal.
- El listado filtra por `getBranchFilter()` (`VentasService.ts:15`), que devuelve `null` si el
  usuario activó «Todas las sucursales» y el `branch_id` actual en caso contrario
  (`useOrganization.ts:699-702`). Es decir: **la sucursal sale del selector del AppHeader**, como
  manda el brief.
- Pero **la sucursal no se muestra en ninguna parte**: no hay columna «Sucursal» en la tabla, ni
  `BranchBadge` en la cabecera del listado, ni bloque de sucursal en el detalle. Con «Todas las
  sucursales» activo, el usuario ve ventas de varias sucursales mezcladas **sin poder distinguir
  de cuál es cada una**. `types.ts:116` declara `branch_id` en `SalesFilter` y `branch_name` en
  `SaleWithDetails` (:107): ninguno de los dos se usa.
- `VentasPage.tsx:51` incluye `branchFilter` en las dependencias del `useCallback`, así que el
  listado sí recarga al cambiar de sucursal. El detalle **no**: `getSaleById` no filtra por
  `branch_id` ni por `organization_id` (depende de la RLS), de modo que se puede abrir por URL una
  venta de otra sucursal aunque el filtro diga otra cosa.
- Nueva venta sí exige sucursal: sin `selectedBranchId` muestra «Seleccione una sucursal»
  (:204-216), un callejón sin salida sin botón para elegirla.

---

## I. Lo roto

Los tres puntos ya conocidos de §D.16 (#1 devolución a ruta inexistente, #2 «Guardar» y «Aplicar»
con `alert()`, #5 anular con `confirm()`/`prompt()`) van ampliados abajo como I.6, I.7 e I.8.

### I.1 La paginación se hace en el navegador sobre un máximo de 1.000 filas

`getSales` pide **todas** las ventas de la organización sin `.range()` (:43-48, :68-72), las une y
luego hace `combined.slice(offset, offset + limit)` (:119-120). Dos consecuencias:

- **Tráfico:** con 1.724 ventas POS en la instancia, abrir la página 1 descarga las 1.724 filas
  completas (`select('*')`) más todos los `web_orders`, para mostrar 20.
- **Datos que no se pueden alcanzar:** PostgREST limita la respuesta por defecto a **1.000 filas**,
  mientras que `count: 'exact'` devuelve el total real. La paginación calcula
  `totalPages = ceil(totalSales / limit)` con el total real, pero `combined` sólo tiene las
  primeras 1.000: **a partir de la página 51 (con `limit=20`) la tabla sale vacía** aunque la
  paginación siga ofreciendo páginas. El mismo error de aritmética afecta al orden: las filas
  se ordenan por `created_at` después de truncar, así que la página 2 puede contener ventas más
  nuevas que la página 1 si POS y Web tienen volúmenes distintos.

`VentasPage.tsx:199-209` sí usa `DataTablePagination`, el componente único del kit (19 usos en la
app). La paginación **visual** está bien; la de datos, no.

### I.2 El conteo y el contenido no hablan de lo mismo

`totalCount = posCount + webCount` (:118) son los `count: 'exact'` de dos consultas **sin filtro de
búsqueda aplicado del mismo modo**: el `search` de POS busca en `notes` y el de web en tres
columnas. «{n} ventas encontradas» puede decir 340 y la tabla mostrar 12.

### I.3 La búsqueda no busca lo que promete

Placeholder: «ID, cliente, notas...». Realidad (`VentasService.ts:58`):

```
if (filter.search) query = query.or(`notes.ilike.%${filter.search}%`);
```

Sólo `sales.notes`. **No busca por ID** (ni el UUID, ni un consecutivo), **no busca por cliente**
(`customers.full_name` está en otra tabla y no hay join), y no busca por importe ni por número de
factura. Escribir el nombre de un cliente en el buscador devuelve cero resultados para ventas POS.
En web sí funciona (`order_number`, `customer_name`, `customer_notes`) porque esos campos están
desnormalizados en `web_orders`. Además, el valor se interpola sin escapar en el `or()` de
PostgREST: una coma o un paréntesis en la búsqueda rompe el filtro.

### I.4 «Anular Venta» está rota a nivel de base de datos

Ya detallado en §E.4 #3. Resumen: `cancelSale` escribe un valor que el `CHECK` rechaza, así que
**siempre falla**. Y aunque funcionara, sería incorrecta: no toca `payment_status`, no anula la
factura, no cierra la cuenta por cobrar, no reversa el asiento contable, no devuelve el stock y
no revierte los pagos. Sobrescribe `notes` con `[ANULADA] {motivo}` (:640), **borrando las notas
originales de la venta**. Y su único rastro es un `// TODO: Registrar en audit_log` (:650).

`posService.ts:3140-3200` ya hace todo eso bien mediante nota crédito. Es exactamente el caso de la
regla 7 de `CLAUDE.md`: dos implementaciones del mismo cierre de negocio, y la segunda divergió.

### I.5 «Duplicar» falla en silencio: pide una columna que no existe

`duplicateSale` (`VentasService.ts:656-675`):

```
.select(`product_id, quantity, unit_price, tax_rate, discount_amount, products (id, name, sku, price)`)
```

**`products.price` no existe.** Verificado por el MCP: `products` tiene `name`, `sku`, `barcode` y
`status`, y ni `price`, ni `cost`, ni `is_active` — es la trampa de esquema documentada en
`CLAUDE.md`. Los precios viven en `product_prices` con vigencia. PostgREST devuelve un error de
columna desconocida, el método hace `console.error` y devuelve `null`, y tanto
`VentasPage.tsx:61-68` como `VentaDetalle.tsx:167-174` comprueban `if (result)` y **no hacen
nada**: el usuario pulsa «Duplicar» y no pasa absolutamente nada, sin mensaje. Además, aunque la
consulta funcionara, `NuevaVentaPage.tsx:76-85` pasa `price: item.unit_price` al construir el
ítem, de modo que el `price` pedido no se usaría.

### I.6 «Crear Devolución» / «Devolución»: doble bloqueo

Además de lo ya sabido —`/app/pos/devoluciones/nuevo` **no existe**; en `app/app/pos/devoluciones/`
sólo hay `page.tsx` y `motivos/page.tsx`, y ninguno lee `sale_id`—, la acción está **doblemente
bloqueada**: la guarda `status === 'completed'` nunca se cumple en una venta POS (§E.4 #2). Es
decir, el enlace roto ni siquiera es alcanzable desde el POS; sólo desde un pedido web.

### I.7 «Guardar» y «Aplicar cupón» de Nueva Venta

- `handleSaveAsPending` (:172-177): `// TODO` + `alert('Venta guardada como pendiente')` + redirige
  a `/app/pos/ventas`. **El carrito se pierde**; el usuario cree que guardó una venta en espera y no
  hay nada. Lo llamativo es que el POS principal **sí** tiene «Espera» real (carritos activos vía
  `POSService.getActiveCarts()`, que esta misma pantalla usa en :90 y :187).
- `handleApplyCoupon` (:143-156): `// TODO` + `alert('Cupón "{X}" aplicado (demo)')`. El total no
  cambia. La palabra «demo» está en la interfaz de producción. Concuerda con §D.16 #9: los cupones
  se administran en su propio submenú y **no se aplican en ninguna parte del POS**.

### I.8 Diálogos nativos y toasts que no existen

`window.confirm` + `window.prompt` + `window.alert` en `VentasPage.tsx:71-83` y
`VentaDetalle.tsx:178-184`; `window.confirm` en `NuevaVentaPage.tsx:181`; cinco `alert()` más en
Nueva venta (§C #87-#89). El motivo de la anulación se pide con un `prompt()` nativo —sin validar
que no esté vacío: `reason || undefined`, así que se puede anular sin motivo.

El detalle sí usa `useToast` (para la reimpresión, #38-#40); el listado y Nueva venta **no lo
importan siquiera**. Tres pantallas de la misma sección, tres mecanismos de feedback distintos.

### I.9 Moneda cableada a COP

`formatCurrency` (`src/utils/Utils.ts:69-85`) fija `currency = "COP"` y locale `es-CO` por defecto,
y las 20 llamadas de la sección lo invocan **sin segundo argumento**
(`VentasTable.tsx:235`, `VentaDetalle.tsx:384-518`, `NuevaVentaPage.tsx:326-432`). Existe
`src/lib/hooks/useOrgCurrency.ts` y la sección no lo usa. Una organización que venda en otra moneda
verá importes correctos con el símbolo equivocado. `payments.currency` se guarda por pago y
tampoco se lee.

### I.10 Fechas: el único sitio donde el patrón prohibido no aparece — y dónde sí duele

Buena noticia: **no hay ni un `toISOString().split('T')[0]` ni un `.split('T')[0]` en toda la
sección** (`grep` sobre `components/pos/ventas/`: 0 resultados). El listado y el detalle usan
`useFormatDate()` y `formatPlain` correctamente, y el rango de fechas pasa por `getDateRange` con
el timezone y las horas de operación de la organización.

Los problemas que quedan son otros:

- Los dos `input type="date"` (`VentasFilters.tsx:112-132`) producen un día calendario **del
  dispositivo**, no de la organización: un cajero con el portátil en otro huso elige «hoy» y
  obtiene el día de su portátil. El rango se resuelve bien después, pero el punto de partida ya
  está desplazado.
- El detalle usa `formatDate(payment.created_at)` (:422) en lugar de `payment.payment_date`, que es
  la fecha contable del pago.
- `VentaDetalle.tsx:583` calcula el tiempo en mesa con `new Date(...).getTime()` — correcto para una
  diferencia, pero el resultado se redondea con `Math.round` sin unidad de respaldo: una sesión de
  90 minutos muestra «90 min» en vez de «1 h 30 min».
- `cancelSale` y `openCashSession` escriben `new Date().toISOString()` directamente
  (`VentasService.ts:641, 548`) en lugar de dejar el `now()` del servidor: el reloj del cliente
  entra en la base de datos.

### I.11 Totales: no se recalculan (y eso es correcto), pero tampoco se contrastan

El listado y el detalle **leen** `subtotal`, `tax_total`, `discount_total`, `total` y `balance` de
`sales` y no los recalculan: bien. Lo que falta es lo contrario — **nadie comprueba que la suma
cuadre**. `total`, la suma de `sale_items.total`, la suma de `payments.amount` y `balance` pueden
divergir (hay 3 filas con `status='paid'` y `payment_status='pending'`, y 2 con `partial`) y la
pantalla no lo dice. En el bloque «Pagos» no hay ni un total pagado ni un «Falta».

Sí hay un recálculo en el navegador que no debería estar: `closeCashSession` suma
`cash_movements` a mano (`VentasService.ts:582-599`).

### I.12 Datos cargados y tirados a la basura

- `getSales` carga `sale_items` y `web_order_items` de las 20 ventas de la página (:134-161) y la
  tabla **no pinta ni una línea**. Son dos consultas por página que no alimentan ningún píxel.
- El detalle pide `tax_amount`, `tax_rate`, `discount_amount` y `notes` por línea (:202) y **no
  muestra ninguno de los cuatro**.
- El detalle pide `payments.*` (:221) y muestra tres campos de nueve.
- `customers.address` se pide (:194) y no se muestra.
- `products.barcode` se pide (:210) y no se muestra.
- `SendToFactusButton` se importa y no se usa (:57).
- `Download` y `FileText` se importan en el listado y no se usan.

### I.13 `sale_number` y `invoice_number` no existen en `sales`

Verificado por el MCP: `sales` **no tiene** `sale_number` ni `invoice_number`. Sin embargo:

- `VentaDetalle.tsx:139` envía `saleNumber: sale.sale_number` al Print Agent: **siempre
  `undefined`**. El ticket reimpreso sale sin número de venta.
- `VentasTable.tsx:215` usa `sale.invoice_number || sale.id.slice(0,8)+'...'`: para POS **siempre**
  cae en el UUID recortado. La columna «ID» de una venta POS muestra `a3f91c02...`, que no es un
  número que un cajero pueda dictar por teléfono. El único consecutivo real vive en
  `invoice_sales.number`, y el listado no lo consulta.
- Configuración › POS tiene una tarjeta «Consecutivos de Ventas» y un stat «Sec. Ventas»
  (auditoría general §D.17.1 #3, #5): el consecutivo se configura y el listado no lo muestra.

### I.14 Once consultas secuenciales para abrir una venta

`getSaleById` (§D.2) encadena hasta doce viajes al servidor, la mayoría independientes entre sí
(`invoice_sales`, `accounts_receivable`, `journal_entries`, `payments`, `profiles` podrían ir en
paralelo) y sin un solo `Promise.all`. Añadido: el componente repite la consulta a `invoice_sales`
por su cuenta (:84-88). En una conexión de caja es la diferencia entre abrir una venta al instante
y esperar un segundo largo.

### I.15 El `sale_id` que nadie lee

`/app/pos/devoluciones/nuevo?sale_id={id}` se construye en dos sitios (`VentasPage.tsx:113`,
`VentaDetalle.tsx:190`) y **ninguna página lee ese parámetro**: la ruta no existe, y
`devoluciones/page.tsx` no hace `useSearchParams`. Es el mismo patrón que §D.16 #4 de la auditoría
general (el `onPrint` de Pedidos Online que nunca se pasa): código escrito contra una pantalla que
no llegó.

### I.16 Incoherencias menores pero visibles

| Qué | Dónde |
|---|---|
| El esqueleto de la tabla dice 6 columnas; la tabla tiene 8 | VentasTable.tsx:144 vs :171-178 |
| El esqueleto de la página promete 4 KPIs que no existen | VentasPage.tsx:132 |
| La flecha «atrás» del listado va a `/app/pos`; la de Nueva venta también (no a `/app/pos/ventas`) | VentasPage.tsx:143; NuevaVentaPage.tsx:224 |
| Los botones de la cabecera usan `bg-blue-500` cableado en vez del Azul GO del manual | VentasPage.tsx:164; NuevaVentaPage.tsx:251, 427 |
| El botón «atrás» no tiene `aria-label` ni texto accesible | VentasPage.tsx:144; VentaDetalle.tsx:268 |
| «Seleccione una sucursal» es un callejón sin salida: no hay botón para elegirla | NuevaVentaPage.tsx:204-216 |
| Hay **dos** selectores de cliente en `components/pos/`: `CustomerSelector.tsx` y `customer-selector.tsx` | — |
| `getCurrentCashSession`/`openCashSession`/`closeCashSession` viven en `VentasService` y pertenecen a Cajas | VentasService.ts:489-630 |

---

## J. Qué le falta a Ventas para ser útil

Todo lo de esta sección va marcado **«Nuevo»** en Figma: no existe en código.

### J.1 Filtros que faltan

| Filtro | Por qué | Dato disponible |
|---|---|---|
| **Sucursal** | Con «Todas las sucursales» activo no se distingue de cuál es cada venta | `sales.branch_id` (NOT NULL) → `branches` |
| **Cajero / vendedor** | `SalesFilter.user_id` ya está declarado y no se usa | `sales.user_id` → `profiles` |
| **Método de pago** | Para cuadrar caja y conciliar | `payments.method` (multi-select) |
| **Origen ampliado** | Hoy faltan «Mesa» y «Desde factura» | `sales.table_session_id`, `sales.source` |
| **Rango de importe** | «Ventas de más de X», para auditoría | `sales.total` |
| **Cliente** | `SalesFilter.customer_id` ya está declarado; hoy sólo se puede llegar por URL | `CustomerPicker` compartido |
| **Con devolución** / **Con saldo pendiente** | Dos preguntas que hoy no se pueden hacer | `sales.balance > 0`; devoluciones |
| **Pendiente de sincronizar** | Para encontrar las ventas offline del Desktop | outbox local |
| **Presets de periodo** | «Hoy» / «Ayer» / «Últimos 7 días» / «Últimos 30 días» / «Personalizado», como ya hacen Pedidos Online (§D.2 #7) | — |

Y una corrección, no una adición: **el buscador debe buscar lo que dice** — número de factura
(`invoice_sales.number`), nombre y documento de cliente, y el UUID/consecutivo. Hoy sólo mira
`notes` (§I.3).

### J.2 Totales del periodo

Cuatro `StatCard` sobre el rango filtrado, que es exactamente lo que el esqueleto ya promete
(§A.1 #6) y lo que `getDailySummary()` ya calcula sin que nadie lo llame:

1. **Ventas** (importe total del periodo).
2. **Ticket promedio**.
3. **Transacciones** (con el desglose «n completadas · n pendientes · n anuladas»).
4. **Impuestos** (suma de `tax_total`, desglosada por nombre en el tooltip — regla I.4.1: nada dice
   «IVA»).

Un quinto opcional, muy pedido en caja: **cobrado por método de pago** (efectivo / tarjeta /
transferencia / QR), que sale de `payments` agrupado.

Estos KPIs deben calcularse **en el servidor** (una RPC agregada), no sumando en el navegador como
hace `getDailySummary` hoy.

### J.3 Exportación

Botón «Exportar» en la cabecera (el icono `Download` ya está importado y sin usar) con CSV y XLSX
del resultado filtrado, incluyendo las columnas que la tabla no muestra: sucursal, cajero, método
de pago, impuestos por nombre, propina, comisión. Pedidos Online ya tiene «Exportar CSV» en su
barra masiva (§D.2 #10): el mismo componente.

### J.4 Acciones masivas

Selección con checkbox de cabecera y `BulkActionBar` del kit, igual que Pedidos Online (§D.2 #10):

- **Imprimir** (n tickets a la impresora de caja),
- **Exportar** la selección,
- **Marcar pagadas** — sólo para las que tengan `payment_status` en `pending`/`partial` y sólo con
  permiso; registra un pago por el saldo,
- **Anular** en lote queda **fuera**: anular es destructivo y debe ir una a una, con motivo.

### J.5 Enlaces que faltan

| Enlace | Estado hoy |
|---|---|
| Factura de venta | Existe, va al registro correcto |
| Cartera | Existe pero **va al listado**, no al registro (§B.5 #62) |
| Contabilidad | Existe pero **va al listado**, no al asiento (§B.5 #63) |
| **Devolución** | Roto (§I.6) — debe apuntar a la pantalla real, con las líneas precargadas |
| **Comanda / sesión de mesa** | No existe: desde una venta de mesa no se puede abrir la sesión |
| **Sesión de caja** | No existe: no se puede ir de la venta al arqueo donde se registró |
| **Pedido web de origen** | No existe: `/app/pos/pedidos-online/{id}` sí tiene «Ver venta POS» (§D.2), pero no al revés |
| **Cliente** | No existe: el nombre del cliente no es un enlace a su ficha del CRM |
| **Nota crédito / factura electrónica** | Sólo se ve el badge; no se puede enviar a la DIAN ni abrir la nota |

### J.6 Reimpresión y comanda

«Reimprimir en Caja» ya existe en el detalle (#37) y **no está en el menú ⋯ del listado**, donde es
más útil (el cliente vuelve al mostrador y pide el ticket). Faltan además:

- **Reimprimir comanda de cocina** para ventas de mesa,
- **Enviar por correo / WhatsApp** el ticket al cliente,
- elegir formato (**80 mm** vs **carta**), que `ReportGenerator` ya sabe hacer para Cajas.

### J.7 Lo que falta en el detalle

- **Impuestos y descuento por línea** (los datos ya se cargan, §I.12).
- **Seriales vendidos** por línea (`sale_items.serial_ids`).
- **Total pagado / Falta** en el bloque «Pagos», con `reference` y `change_amount`.
- **Vendedor y comisión** (`salesperson_id`, `commission_rate`, `commission_type`), hoy declarados
  en `types.ts` y nunca consultados.
- **Mesero de la propina** (`tip_server_id`) y **conductor** (`driver_id`).
- **Sucursal** y **cajero** (`seller_name` se calcula y **no se pinta en ninguna parte**).
- **Devoluciones asociadas**, con su importe y su estado.
- **Historial de la venta** (creada, cobrada, anulada, reimpresa, devuelta) — hoy el único rastro de
  una anulación es el prefijo `[ANULADA]` machacando las notas.
- **Estado «pendiente de sincronizar»** con aviso de que las acciones de red están deshabilitadas.

### J.8 Lo que falta en Nueva venta

- **«Guardar» de verdad**: poner la venta en espera reutilizando los carritos activos del POS
  (`POSService.getActiveCarts()`), no un `alert()`.
- **Cupón funcional**: validar contra `coupons`, aplicar el descuento al total y mostrarlo como una
  línea de descuento retirable.
- **Reutilizar el carrito del POS** en vez de la segunda implementación (§C).
- **Atajos `Kbd`** como el resto del POS v2: `F2` cliente, `F4` cobrar, `F6` espera, `/` buscador.
- Que **«Seleccione una sucursal»** ofrezca elegirla.

---

## K. Conteo de controles

| Pantalla | Controles | De ellos rotos o sin efecto |
|---|---|---|
| Listado (`/app/pos/ventas`) | 29 | 5 (búsqueda, filtro de estado ×2 valores, duplicar, devolución, anular) |
| Detalle (`/app/pos/ventas/[id]`) | 38 | 4 (duplicar, devolución, anular, dos enlaces al listado en vez del registro) |
| Nueva venta (`/app/pos/ventas/nuevo`) | 22 | 2 demos + 6 diálogos nativos |
| **Total** | **89** | **17** |

Hallazgos de §I: **16**, de los cuales **5 impiden completar una tarea** (anular, duplicar,
devolución, buscar por cliente, paginar más allá de 1.000 ventas) y **3 son de integridad de datos**
(moneda cableada, reloj del cliente en la BD, notas machacadas al anular).

Adiciones propuestas en §J: **34**, todas marcadas «Nuevo» en Figma.
