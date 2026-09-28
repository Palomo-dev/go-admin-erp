# Auditoría de la capa de documentos — PDF, imprimibles, tickets y facturación electrónica

Insumo para **rediseñar en Figma** los tres documentos de negocio —factura de venta, factura de
compra y cotización— **sin perder nada de lo que hoy funciona**. Este documento baja un nivel
respecto a `docs/design/AUDITORIA-CONTROLES-FINANZAS.md`: aquí va **cada generador** con
`archivo:línea`, el HTML exacto que arma, los campos que pinta, los que existen en la base y no
pinta, y los que inventa o deja en blanco.

Fecha: 2026-09-22. Solo lectura de código; el esquema se verificó con `SELECT` por el MCP de
Supabase (proyecto `jgmgphmzusbluqhuqihj`, únicamente lectura). Sin nombres de organizaciones
cliente: se usa «org 120» o «Mi empresa S.A.S.». Rutas relativas a la raíz del repositorio.

Leyenda de **Motor**: puppeteer (PDF real en servidor) · jsPDF (PDF real en cliente) ·
`window.print()` (HTML en ventana emergente, el usuario elige «Guardar como PDF») ·
descarga HTML (blob `text/html`) · ESC/POS (bytes a impresora térmica) · ninguno (botón fantasma).
**Papel**: carta/A4 (`max-width:800px` sin `@page`) · 80 mm · 58 mm · DOM de la página.
**Cableado** marca los literales que no salen de la organización ni de `messages/`.

Índice: A. Inventario de generadores · B. Los tres documentos del rediseño, campo por campo ·
C. Datos y esquema: lo que se pinta y lo que se deja en la mesa · D. Facturación electrónica
(Factus/DIAN) · E. Lo roto o inconsistente · F. Qué debe tener un documento profesional ·
G. Propuesta de motor único · H. Conteo y prioridades.

---

## A. Inventario de generadores

### A.0 Resumen: no existe un solo PDF de negocio hecho como es debido

| # | Generador | Motor | Papel | Documento | Archivo:línea |
|---|---|---|---|---|---|
| 1 | `POST /api/facturas-venta/[id]/pdf` | **puppeteer** | carta, márgenes 20 px | Factura de venta (sube a Storage) | `src/app/api/facturas-venta/[id]/pdf/route.ts:7-232` |
| 2 | `POST /api/pdf/invoice` | **ninguno** — devuelve HTML | carta | Factura de venta (**código muerto**) | `src/app/api/pdf/invoice/route.ts:3-208` |
| 3 | `PDFService.generateInvoiceHTML` | `window.print()` | carta | **Factura de venta Y cotización** | `src/lib/services/pdfService.ts:112-337` |
| 4 | `PDFService.generatePurchaseInvoiceHTML` | `window.print()` | carta | Factura de compra | `src/lib/services/pdfService.ts:366-574` |
| 5 | `PDFService.downloadPurchaseInvoicePDF` | **descarga HTML** | — | «PDF» de compra que es `.html` | `src/lib/services/pdfService.ts:590-606` |
| 6 | `buildSaleTicketHTML` | `window.print()` | 80 mm | Ticket de venta y pre-cuenta | `print-agent/src/printing/renderHtml.ts:277-448` |
| 7 | `buildKitchenTicketsHTML` | `window.print()` | 80 mm | Comandas por estación | `renderHtml.ts:450-548` |
| 8 | `buildElectronicInvoiceHTML` | `window.print()` | 80 mm | Factura electrónica DIAN | `renderHtml.ts:645-789` |
| 9 | `buildShipmentGuideHTML` | `window.print()` | 80 mm | Guía de envío | `renderHtml.ts:550-643` |
| 10 | `printSaleTicket` / `printKitchenTicket` / `printElectronicInvoice` / `printShipmentGuide` | **ESC/POS** | 80 / 58 mm | Los mismos 4, a impresora física | `print-agent/src/printing/renderEscpos.ts:171, 311, 663, 910` |
| 11 | `mobileEscposAdapter` | **ESC/POS** (Bluetooth LE) | 80 / 58 mm | Ticket, comanda, pre-cuenta, cajón | `src/lib/services/mobileEscposAdapter.ts:229, 397, 457, 516` |
| 12 | `pdfExportService` | **jsPDF** | A4 mm | Reportes y cierre consolidado | `src/lib/services/reportes/pdfExportService.ts:1165, 1213` |
| 13 | `dashboardSectionExport` | **jsPDF** | A4 mm | Export de sección del inicio | `src/lib/services/inicio/dashboardSectionExport.ts:318` |
| 14 | `categoryService.exportCategoriesToPDF` | **jsPDF** | A4 apaisado | Listado de categorías | `src/lib/services/categoryService.ts:480-526` |
| 15 | `supplierService.exportSuppliersToPDF` | **jsPDF** | A4 apaisado | Listado de proveedores | `src/lib/services/supplierService.ts:967-1008` |
| 16 | `parkingTicketService` | `window.print()` | 80 mm | Ticket de entrada y recibo de salida | `src/lib/services/parkingTicketService.ts:49, 340` |
| 17 | `SessionReceipt` | `window.print()` | 300 px mono | Recibo de parqueadero (**duplicado**) | `src/components/parking/sesiones/SessionReceipt.tsx:5-44` |
| 18 | `parking/sesiones/[id]` `handlePrint` | `window.print()` | 400 px mono | Detalle de sesión (**triplicado**) | `src/app/app/parking/sesiones/[id]/page.tsx:209-251` |
| 19 | `ReportGenerator` (cajas) | `window.print()` | carta **y** 80 mm | Arqueo de caja | `src/components/pos/cajas/ReportGenerator.tsx:55, 249` |
| 20 | `shipmentLabelPrinter` (legado) | `window.print()` + CDN | 80 mm | Guía de envío con código de barras | `src/components/transporte/envios/shipmentLabelPrinter.ts:105-521` |
| 21 | `ProposalPrintView` (CRM) | `window.print()` | A4, `@page 18mm` | Propuesta comercial | `src/components/crm/propuestas/ProposalPrintView.tsx:42-51` |
| 22 | `pos/pedidos-online` `handleBulkPrint` | `window.print()` | carta | Comandas de pedidos en lote | `src/app/app/pos/pedidos-online/page.tsx:463-514` |
| 23 | `pms/reservas/[id]` `handlePrint` | `window.print()` | **DOM de la página** | Reserva (imprime la UI entera) | `src/app/app/pms/reservas/[id]/page.tsx:69-71` |
| 24 | Nota crédito «Descargar PDF» | **ninguno** | — | Botón fantasma: solo un toast | `src/components/finanzas/notas-credito/NotaCreditoDetalle.tsx:199-201` |

**Lectura:** de 24 generadores, **cuatro producen un PDF de verdad con jsPDF** (12-15) y **ninguno
de ellos es un documento de negocio**: son reportes y listados. El único PDF de negocio real es el
#1, con puppeteer, y su estado se documenta en §E.1. Los tres documentos que se van a rediseñar
—venta, compra, cotización— **hoy no generan PDF: abren una ventana e invocan el diálogo de
impresión del navegador.**

### A.1 `POST /api/facturas-venta/[id]/pdf` — el único PDF de factura

`src/app/api/facturas-venta/[id]/pdf/route.ts`. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`
(`:4-5`). Importa `puppeteer` dinámicamente (`:178`) para no cargar el build.

| # | Aspecto | Valor | Archivo:línea |
|---|---|---|---|
| 1 | Entrada | `POST` con el objeto `InvoiceDataForPDF` **plano en el cuerpo**, sin envolver | `:13` |
| 2 | Autenticación | **Ninguna.** No lee sesión, no llama `getServerOrgContext` ni `withOrg` | `:7-14` |
| 3 | Cliente Supabase | `getSupabaseAdmin()` — **service role**, salta RLS | `:200` |
| 4 | Ruta en Storage | `facturas-venta/${id}.pdf`, `upsert: true`, bucket `invoices` | `:202-208` |
| 5 | Formato | `format: 'letter'`, `printBackground: true`, márgenes 20 px en los 4 lados | `:192-196` |
| 6 | Color primario | `data.organization.primary_color`, fallback `#2563eb` | `:42` |
| 7 | Tipografía | `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`, 12 px, `#333` | `:53` |
| 8 | Ancho del cuerpo | `max-width: 800px`, `padding: 40px` | `:54` |
| 9 | Logo | `<img class="logo-img">` con `max-height:60px; max-width:180px` si hay `logo_url`; si no, el nombre en 28 px del color primario | `:57-58, :97` |
| 10 | Título | `<h1>FACTURA</h1>` **cableado** en 32 px | `:100` |
| 11 | Estado | Badge de color: `issued` azul, `paid` verde, `partial` ámbar, `void`/`voided` rojo | `:63-66, :102` |
| 12 | Banda de anulación | «DOCUMENTO ANULADO», borde rojo 2 px, `letter-spacing:2px`, si `status ∈ {void, voided, cancelled}` | `:106` |
| 13 | Bloque emisor | Rótulo «De»: `name`, `NIT: tax_id`, `address`, `Tel: phone`, `email` | `:109-116` |
| 14 | Bloque receptor | Rótulo «Facturar a»: `full_name`, `NIT/CC: tax_id`, `address`, `Tel:`, `email` | `:117-124` |
| 15 | Metadatos | Caja gris con «Fecha de Emisión», «Fecha de Vencimiento», «Moneda» | `:127-131` |
| 16 | Tabla | 6 columnas: Descripción 40 % · Cant. 8 % · Precio Unit. 13 % · Descuento 10 % · **IVA** 9 % · Total 15 %. Cabecera con fondo del color primario | `:76, :136-142` |
| 17 | Línea | `SKU: {sku}` en gris + `description`; descuento en rojo con `-`; impuesto como `{tax_rate}%` + `(incl.)` si `tax_included` | `:145-154` |
| 18 | Totales | Subtotal · Descuentos (si > 0) · **IVA** · Total · «Nota crédito / saldo aplicado» (si > 0) · «Saldo Pendiente» rojo o «Pagado» verde | `:158-165` |
| 19 | Notas | Caja gris con rótulo «Notas» | `:167` |
| 20 | Pie | «Gracias por su preferencia» + «Este documento fue generado electrónicamente» | `:169-172` |
| 21 | **QR** | Se calcula `qrData` en `:44` y **nunca se inserta en el HTML** (`<img>` solo existe para el logo, `:97`). El PDF sale **sin QR** | `:44` |
| 22 | Código muerto | `const origin = process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : '';` — siempre `''`, no se usa | `:43` |
| 23 | Moneda | `Intl.NumberFormat('es-CO', {currency: data.currency \|\| 'COP', 0 decimales})` | `:15-22` |
| 24 | Fecha | `new Date(dateString).toLocaleDateString('es-CO', {year, month:'long', day})` — **sin zona horaria de la organización** | `:24-31` |
| 25 | Respuesta | `{ url: publicUrl }` de `getPublicUrl` | `:215-220` |

### A.2 `POST /api/pdf/invoice` — no genera PDF y nadie lo llama

`src/app/api/pdf/invoice/route.ts`, 208 líneas. Pese al nombre y al `Content-Disposition`, **no usa
puppeteer**: devuelve `text/html; charset=utf-8` (`:193-199`). Su único consumidor en el repo es
`PDFService.generateInvoicePDF` (`src/lib/services/pdfService.ts:57`), y **ese método no se invoca
desde ninguna pantalla** (los únicos `PDFService.*` vivos son `printInvoiceHTML`,
`printPurchaseInvoiceHTML` y `downloadPurchaseInvoicePDF`). Es **código muerto**.

Consecuencia si alguna vez se reconecta: `downloadInvoicePDF` (`pdfService.ts:77-92`) guardaría el
blob como `factura_${number}.pdf` — un archivo HTML con extensión `.pdf`.

La plantilla es una **variante divergente** de la #1 y de la #3: 5 columnas en lugar de 6 (sin
«Descuento», `:135-140`), rótulo «Emitido Por» en vez de «De» (`:100`), notas en caja ámbar con
borde izquierdo (`:78-80`), `status-draft` que las otras dos no tienen (`:53`), y el saldo solo se
pinta si `balance > 0 && balance < total` (`:168`).

### A.3 `PDFService` — el generador que de verdad se usa

`src/lib/services/pdfService.ts`, 607 líneas, `'use client'`. **Es el centro del rediseño**: de aquí
salen los tres documentos objetivo.

| # | Método | Qué hace | Llamadores | Archivo:línea |
|---|---|---|---|---|
| 1 | `generateInvoiceHTML(data, qrUrl?)` | HTML de **factura de venta y de cotización** (conmuta por `status === 'quotation'`) | interno | `:112-337` |
| 2 | `printInvoiceHTML(data)` | Dispara el PDF de fondo, arma el HTML, abre ventana e imprime | Venta y cotización | `:340-363` |
| 3 | `generatePurchaseInvoiceHTML(data)` | HTML de factura de compra | interno | `:366-574` |
| 4 | `printPurchaseInvoiceHTML(data)` | Ventana + `print()` | Compra | `:577-587` |
| 5 | `downloadPurchaseInvoicePDF(data)` | **Descarga un `.html`** llamado «PDF» | Compra | `:590-606` |
| 6 | `generateInvoicePDF` / `downloadInvoicePDF` / `printInvoicePDF` | Vía `/api/pdf/invoice` | **nadie** | `:55-109` |

**`printInvoiceHTML` en detalle (`:340-363`)** — tres pasos, y los tres tienen consecuencias:

```ts
const pdfUrl = `${supabaseUrl}/storage/v1/object/public/invoices/facturas-venta/${data.id}.pdf`; // :343
fetch(`/api/facturas-venta/${data.id}/pdf`, { method:'POST', body: JSON.stringify(data) })        // :346
const html = this.generateInvoiceHTML(data, pdfUrl);                                              // :353
```

1. La URL pública de Storage se construye **determinísticamente, antes de que el PDF exista**.
2. La generación es *fire-and-forget*: `.catch(e => console.warn(...))` (`:350`). Si falla, nadie se entera.
3. **Esa URL es el contenido del QR** que se pinta en el documento (`:215`). Si el PDF no llegó a
   subirse, el QR de la factura apunta a un objeto inexistente. Ver §E.1.

**Diferencias entre las tres plantillas de `PDFService` y la de puppeteer.** Son cuatro
maquetaciones distintas del mismo documento:

| Elemento | `/api/facturas-venta/[id]/pdf` | `generateInvoiceHTML` | `generatePurchaseInvoiceHTML` | `/api/pdf/invoice` |
|---|---|---|---|---|
| Borde de cabecera | 3 px | 2 px | 2 px | 3 px |
| `padding` del cuerpo | 40 px | 20 px | 20 px | 40 px |
| Tamaño de `h1` | 32 px | 28 px | 28 px | 32 px |
| QR | **no lo pinta** | sí, 80×80, servicio externo | **no** | **no** |
| Seriales por línea | **no** | sí | sí | **no** |
| Badge «Imp. incluidos» | **no** | sí | sí | **no** |
| Columna «Descuento» | sí | sí | sí | **no** |
| Estado `draft` | no definido | definido | no definido | definido |
| Rótulo del emisor | «De» | «De» | «Empresa» | «Emitido Por» |
| Rótulo del receptor | «Facturar a» | «Facturar a» / «Cotizar a» | «Proveedor» | «Facturar A» |
| `@media print` | no (lo pone puppeteer) | sí | sí | no |
| Pie | «Gracias por su preferencia» | «Gracias por su preferencia/interés» | «Documento interno - Factura de compra» | «Gracias por su preferencia» |

### A.4 La capa térmica — `@printing`, la única parte bien hecha

`print-agent/src/printing/` es **fuente única de verdad** compartida entre el ERP web (alias
`@printing` en `tsconfig.json:24-25`) y Go Admin Desktop. Su propio encabezado explica el porqué
(`index.ts:10-14`): *antes había cinco copias de las plantillas y siempre quedaba alguna sin
actualizar*. **Es el modelo a replicar para los documentos en papel carta** (§G).

| # | Pieza | Qué aporta | Archivo:línea |
|---|---|---|---|
| 1 | `paper.ts` | Especificación única de papel: 80 mm → 576 puntos a 203 dpi → `printableMm` 72.06, 48 caracteres/línea; 58 mm → 384 puntos → 32 caracteres | `paper.ts:47-65` |
| 2 | `normalizePaperWidth` | Normaliza `printers.paper_width` (texto libre: `"80mm"`, `80`, `" 58 MM "`, `null`) y **redondea hacia abajo** para no desbordar | `paper.ts:73-82` |
| 3 | `@page size: printableMm` | La página mide el **área imprimible real**, no el ancho del rollo — el comentario documenta que usar `rollMm` producía márgenes dobles y recorte a la derecha | `paper.ts:12-18`, `renderHtml.ts:56` |
| 4 | Reglas térmicas | Todo en negro puro (`#000`): los grises se difuminan; nada por debajo de 10 px; logo con `grayscale(100%) contrast(140%)` y `max-height:90px` | `renderHtml.ts:39-50, :76-87` |
| 5 | `formatMoney` | Normaliza el `U+00A0` de `Intl` a espacio: en CP437 la térmica lo imprimía como «á» y salía `$á36.480` | `renderHtml.ts:4-12` |
| 6 | `FISCAL_LABELS` | Traduce 10 códigos de responsabilidad fiscal DIAN (`O_23` → «Gran contribuyente», `R_99` → «No responsable de IVA»…) | `renderHtml.ts:14-29` |
| 7 | `TicketKind` | 5 tipos, espejo de `print_jobs.job_type`: `kitchen_ticket`, `pre_cuenta`, `sale_ticket`, `shipment_guide`, `electronic_invoice` | `types.ts:154` |
| 8 | Doble render | Cada tipo tiene render HTML (navegador) **y** ESC/POS (impresora física), con el mismo payload | `index.ts:44-53` |

**El ticket de venta (`buildSaleTicketHTML`, `renderHtml.ts:277-448`) pinta más datos fiscales que
el PDF de factura**: responsabilidades fiscales del emisor **y** del receptor traducidas
(`:285-286, :326, :400`), tipo de documento del cliente (`:323`, con el comentario de `printService.ts:238-239`:
*«sin él, un número suelto no identifica al cliente ante la DIAN»*), sucursal completa
(`:401-403`), desglose por impuesto con el rótulo real (`:348-354`), propina, flete, bloque de
entrega para domicilios (`:333-343`), pagos por método, recibido y cambio.

### A.5 Cotizaciones y facturas de compra — respuesta explícita

**Cotizaciones: NO tienen PDF.** `src/components/finanzas/cotizaciones/id/DetalleCotizacion.tsx:159-168`:

```ts
const pdfData = buildPDFData();
pdfData.status = 'quotation';               // :162
await PDFService.printInvoiceHTML(pdfData); // :163
toastSuccess('PDF Generado', ...);          // :164  ← miente: no se generó ningún PDF
```

La cotización se imprime **con la plantilla de factura**, conmutada por `status === 'quotation'`
(`pdfService.ts:139-141`). `src/lib/services/cotizacionesService.ts` no tiene ni una ocurrencia de
`pdf`, `print` o `html`. El camino alterno del CRM (`/app/crm/propuestas/[id]/imprimir` →
`ProposalPrintView.tsx:45`) también es `window.print()`, y el propio archivo lo documenta en
`ProposalPrintView.tsx:12-13`: *«El repo no tiene un generador de PDF reutilizable
(`/api/pdf/invoice` devuelve HTML)»*.

**Facturas de compra: NO tienen PDF.** El botón «PDF» con icono de descarga
(`DetalleFacturaCompra.tsx:416-422`) llama `downloadPurchaseInvoicePDF`, que en
`pdfService.ts:593` hace `new Blob([html], {type:'text/html'})` y en `:597` lo nombra
`factura_compra_${number}.html`. El toast dice «PDF Generado … lista para descargar»
(`DetalleFacturaCompra.tsx:278`). No existe ninguna ruta `/api/**/facturas-compra/**/pdf`.

---

## B. Los tres documentos del rediseño, campo por campo

Qué pinta hoy cada uno, con el rótulo exacto y de dónde sale el valor. `✗` = el dato existe en la
base y **no se pinta**.

### B.1 Factura de venta — `/app/finanzas/facturas-venta/[id]`

Constructor del payload: `src/components/finanzas/facturas-venta/id/DetalleFactura.tsx:449-487`.

| # | Bloque | Rótulo exacto | Valor | Origen | Archivo:línea |
|---|---|---|---|---|---|
| 1 | Cabecera | — | Logo o nombre en el color primario | `organizations.logo_url` / `.name` / `.primary_color` | `pdfService.ts:205` |
| 2 | Cabecera | `FACTURA` | Cableado | — | `pdfService.ts:140` |
| 3 | Cabecera | — | Número | `invoice_sales.number` | `pdfService.ts:211` |
| 4 | Cabecera | Borrador · Emitida · Pagada · Pago Parcial · Anulada | Badge de estado | `invoice_sales.status` | `pdfService.ts:125-137, :212` |
| 5 | Cabecera | «Escanear para ver» | QR 80×80 → URL del PDF en Storage | construido en `:343` | `pdfService.ts:215-216` |
| 6 | Aviso | `DOCUMENTO ANULADO` | Si `status ∈ {void, voided, cancelled}` | `invoice_sales.status` | `pdfService.ts:222-224` |
| 7 | Emisor | `De` | `name`, `NIT: tax_id`, `address`, `Tel:`, `email` | `organizations` (9 columnas) | `pdfService.ts:227-232` |
| 8 | Receptor | `Facturar a` | `full_name`, `{doc_type}: {doc_number}` o `NIT/CC: {tax_id}`, `address`, `Tel:`, `email` | `customers` | `pdfService.ts:235-240` |
| 9 | Metadatos | `Fecha de Emisión` · `Fecha de Vencimiento` · `Moneda` | En caja gris | `issue_date`, `due_date`, `currency` | `pdfService.ts:244-257` |
| 10 | Tabla | `Descripción` `Cant.` `Precio Unit.` `Descuento` **`IVA`** `Total` | 6 columnas, cabecera con el color primario | `invoice_items` | `pdfService.ts:262-267` |
| 11 | Línea | `SKU: {sku}` · descripción · `Seriales: a, b, c` | `sku` = `products.sku \|\| code_reference` | `invoice_items` | `pdfService.ts:273`, `DetalleFactura.tsx:484` |
| 12 | Línea | `- $X` en rojo · `{rate}%` + `(incl.)` | Descuento e impuesto | `discount_amount`, `tax_rate`, `tax_included` | `pdfService.ts:276-277` |
| 13 | Totales | `Subtotal` + badge `Imp. incluidos` | Badge si `tax_included` | `invoice_sales` | `pdfService.ts:286` |
| 14 | Totales | `Descuentos` | **Sumado en el navegador**, no existe en la base | `reduce` de `discount_amount` | `DetalleFactura.tsx:496-499` |
| 15 | Totales | **`IVA`** | Rótulo cableado aunque el impuesto sea INC o ICA | `invoice_sales.tax_total` | `pdfService.ts:296` |
| 16 | Totales | `Total` | — | `invoice_sales.total` | `pdfService.ts:300` |
| 17 | Totales | `Nota crédito / saldo aplicado` | Si `credit_applied > 0` | `credit_note_applications` | `pdfService.ts:303-308` |
| 18 | Totales | `Saldo Pendiente` rojo · `Pagado` verde | Excluyente | `invoice_sales.balance` | `pdfService.ts:309-319` |
| 19 | Notas | `Notas` | — | `invoice_sales.notes` | `pdfService.ts:322-327` |
| 20 | Pie | «Gracias por su preferencia» / «Este documento fue generado electrónicamente» | Cableado | — | `pdfService.ts:330-331` |
| 21 | ✗ | — | **Sucursal**: nombre, dirección, teléfono, ciudad | `branches` (`invoice_sales.branch_id` es NOT NULL) | nunca se consulta |
| 22 | ✗ | — | **Resolución DIAN, prefijo, rango, vigencia** | `invoice_sequences` (4 de 10 filas la tienen) | nunca se consulta |
| 23 | ✗ | — | **CUFE y QR DIAN** | `invoice_sales.xml_uuid`, `.qr_image` | nunca se consulta |
| 24 | ✗ | — | **Pagos aplicados** (método, fecha, referencia) | `payments` | nunca se consulta |
| 25 | ✗ | — | **Retenciones por línea** | `invoice_items.withholding_taxes` (jsonb) | nunca se consulta |
| 26 | ✗ | — | **Nota por línea** | `invoice_items.note` | nunca se consulta |
| 27 | ✗ | — | **Desglose por impuesto** | `invoice_applied_taxes` (`tax_code`, `tax_rate`) | nunca se consulta |
| 28 | ✗ | — | **DV, responsabilidades fiscales, municipio del cliente** | `customers.dv`, `.fiscal_responsibilities`, `.fiscal_municipality_id` | nunca se consulta |
| 29 | ✗ | — | **Razón social, DV, municipio, actividad económica, responsabilidades del emisor** | `organizations.legal_name`, `.dv`, `.municipality_id`, `.economic_activity`, `.fiscal_responsibilities`, `.graphic_representation_name` | el `select` pide 9 columnas y ninguna es esa |
| 30 | ✗ | — | **Vendedor y comisión** | `invoice_sales.salesperson_id` | nunca se consulta |
| 31 | ✗ | — | **Forma y medio de pago DIAN** | `invoice_sales.payment_form`, `.payment_method_code` | nunca se consulta |
| 32 | ✗ | — | **Condiciones de pago** | `invoice_sales.payment_terms`, `.payment_terms_id` → `payment_terms_catalog` | nunca se consulta |

### B.2 Factura de compra — `/app/finanzas/facturas-compra/[id]`

Constructor **duplicado literalmente** en `DetalleFacturaCompra.tsx:212-241` (imprimir) y
`:247-276` (descargar): los mismos 20 campos escritos dos veces.

| # | Bloque | Rótulo exacto | Valor | Archivo:línea |
|---|---|---|---|---|
| 1 | Cabecera | `FACTURA DE COMPRA` | Cableado | `pdfService.ts:453` |
| 2 | Cabecera | — | Número = `invoice_purchase.number_ext` | `DetalleFacturaCompra.tsx:214` |
| 3 | Cabecera | Borrador · Recibida · Pagada · Pago Parcial · Anulada · Confirmada | Badge (catálogo distinto al de venta) | `pdfService.ts:379-386` |
| 4 | Aviso | `FACTURA DE COMPRA ANULADA` | Texto distinto al de venta | `pdfService.ts:460` |
| 5 | Emisor | `Empresa` | Rótulo distinto al de venta («De») | `pdfService.ts:464` |
| 6 | Receptor | `Proveedor` | `suppliers.name`, `NIT: nit`, dirección concatenada `address, city, country`, `Tel:`, `email` | `pdfService.ts:472-477`, `DetalleFacturaCompra.tsx:226-232` |
| 7 | Metadatos | `Fecha de Emisión` · `Fecha de Vencimiento` · `Moneda` | — | `pdfService.ts:481-494` |
| 8 | Tabla | Idéntica a la de venta, 6 columnas con **`IVA`** | — | `pdfService.ts:499-505` |
| 9 | Totales | Subtotal · Descuentos · IVA · Total · Saldo/Pagado | Igual que venta | `pdfService.ts:521-557` |
| 10 | Pie | «Documento interno - Factura de compra» | Cableado | `pdfService.ts:567` |
| 11 | ✗ | — | **`discount_amount` por línea**: la columna existe y el constructor **no la pasa** → la columna «Descuento» sale siempre en `-` | `DetalleFacturaCompra.tsx:232-239` |
| 12 | ✗ | — | **`tax_included`**: existe en `invoice_purchase` y no se pasa → nunca aparece el badge «Imp. incluidos» | `DetalleFacturaCompra.tsx:212-241` |
| 13 | ✗ | — | **`doc_type`, `dv`, `tax_regime`, `fiscal_responsibilities`, `municipality_code`, `identification_document_code`, `legal_organization_code`, `trade_name` del proveedor** | `suppliers` los tiene todos |
| 14 | ✗ | — | **Datos bancarios del proveedor** (`bank_name`, `bank_account`, `account_type`) y `credit_days` | `suppliers` |
| 15 | ✗ | — | **Orden de compra de origen** (`invoice_purchase.po_id`) | — |
| 16 | ✗ | — | **Sucursal** (`branch_id` NOT NULL), **retenciones**, **pagos aplicados**, **desglose** (`invoice_purchase_applied_taxes`) | — |

### B.3 Cotización — `/app/finanzas/cotizaciones/[id]`

Constructor: `DetalleCotizacion.tsx:111-157`. Reutiliza la plantilla de factura.

| # | Bloque | Rótulo exacto | Valor | Archivo:línea |
|---|---|---|---|---|
| 1 | Cabecera | `COTIZACIÓN` | Por `status === 'quotation'` | `pdfService.ts:140` |
| 2 | Cabecera | Cotización · Enviada · Aceptada · Rechazada · Vencida · Convertida | 6 estados extra en el catálogo | `pdfService.ts:131-136` |
| 3 | Cabecera | — | **El badge fuerza la clase `status-issued`** (azul) sea cual sea el estado | `pdfService.ts:212` |
| 4 | Receptor | `Cotizar a` | — | `pdfService.ts:235` |
| 5 | Metadatos | `Fecha de Vencimiento` | = `valid_until \|\| issue_date` | `DetalleCotizacion.tsx:116` |
| 6 | Notas | `Notas` | = `terms_conditions` (las notas internas se omiten, correcto) | `DetalleCotizacion.tsx:123` |
| 7 | Totales | — | `balance: 0` fijo; el bloque Saldo/Pagado se suprime | `DetalleCotizacion.tsx:122`, `pdfService.ts:309` |
| 8 | Pie | «Gracias por su interés» | Variante propia | `pdfService.ts:330` |
| 9 | ✗ | — | **`doc_type`/`doc_number` del cliente**: solo se pasa `tax_id: identification_number`, así que el documento nunca dice si es CC, NIT o CE | `DetalleCotizacion.tsx:144` |
| 10 | ✗ | — | **`sku` y seriales** por línea: el `map` no los incluye | `DetalleCotizacion.tsx:147-155` |
| 11 | ✗ | — | **`sections_json`** (propuesta narrativa), **`signature_id`** (firma), **`payment_link_url`** | `quotations` los tiene |
| 12 | ✗ | — | **Vendedor** (`salesperson_id`), **condiciones de pago** (`payment_terms`, `payment_method`) | `quotations` |
| 13 | ✗ | — | **Sucursal** (`branch_id`) | `quotations` |

---

## C. Datos y esquema — verificado con el MCP

### C.1 Dónde vive cada dato

| # | Dato | Tabla.columna | ¿Se pinta? | Observación |
|---|---|---|---|---|
| 1 | Nombre comercial | `organizations.name` | Sí | — |
| 2 | Razón social | `organizations.legal_name` (**NOT NULL**) | **No** | Obligatoria en la base, ausente en los tres PDF |
| 3 | NIT | `organizations.nit` **y** `.tax_id` (dos columnas) | Parcial | Venta pasa solo `tax_id`; cotización y compra hacen `tax_id \|\| nit` |
| 4 | Dígito de verificación | `organizations.dv` | **No** | Exigido por la DIAN junto al NIT |
| 5 | Logo | `organizations.logo_url` | Sí | — |
| 6 | Dirección / ciudad / depto. / país | `.address`, `.city`, `.state`, `.country` (def. `'Colombia'`), `.postal_code` | Solo `address` | — |
| 7 | Teléfono / correo / web | `.phone`, `.email`, `.website` | Los dos primeros | — |
| 8 | Color primario / secundario | `.primary_color`, `.secondary_color` | Sí | Sin validación de contraste |
| 9 | Municipio DIAN | `organizations.municipality_id` → `municipalities` | **No** | — |
| 10 | Responsabilidades fiscales | `organizations.fiscal_responsibilities` (array) | **No** en PDF; **sí** en ticket 80 mm | `renderHtml.ts:400` |
| 11 | Actividad económica / registro | `.economic_activity`, `.registration_code` | **No** | — |
| 12 | Nombre de representación gráfica | `.graphic_representation_name` | **No** | La columna existe precisamente para esto |
| 13 | Zona horaria | `organizations.timezone` (NOT NULL, def. `America/Bogota`) | **No** | Causa el desfase de §E.3 |
| 14 | Sucursal | `branches.name/.address/.city/.phone/.email/.tax_identification/.municipality_id/.branch_code` | **No** en PDF; **sí** en ticket | `invoice_sales.branch_id` es NOT NULL |
| 15 | Resolución DIAN | `invoice_sequences.resolution_number`, `.resolution_date`, `.prefix`, `.range_start`, `.range_end`, `.current_number`, `.valid_from`, `.valid_until`, `.technical_key` | **No, en ningún documento** | 10 filas, 4 con resolución |
| 16 | Cliente: nombre | `customers.full_name` (`GENERATED ALWAYS`) | Sí | — |
| 17 | Cliente: tipo y nº de documento | `.doc_type`/`.doc_number` (generadas) sobre `.identification_type`/`.identification_number` | Venta sí; **cotización no** | — |
| 18 | Cliente: DV | `customers.dv` | **No** | — |
| 19 | Cliente: responsabilidades fiscales | `customers.fiscal_responsibilities` | **No** en PDF; **sí** en ticket | `renderHtml.ts:326` |
| 20 | Cliente: municipio fiscal | `customers.fiscal_municipality_id` | **No** | Sí se envía a Factus |
| 21 | Cliente: régimen / tributo | `.legal_organization_id` (def. 2), `.tribute_id` (def. 21), `.company_name`, `.trade_name`, `.customer_type` | **No** | — |
| 22 | Proveedor | `suppliers.name/.nit/.tax_id/.doc_type/.dv/.tax_regime/.fiscal_responsibilities/.municipality_code/.trade_name/.contact/.credit_days/.bank_*` | Solo `name`, `nit`, `email`, `phone`, dirección | `suppliers` tiene `contact`, no `contact_name` |
| 23 | Líneas | `invoice_items` — tabla **compartida** por venta y compra (`invoice_type`, `invoice_sales_id`, `invoice_purchase_id`) | Parcial | — |
| 24 | Línea: código | `invoice_items.code_reference` | Sí (como «SKU») | El rótulo del PDF dice SKU pero la columna es `code_reference` |
| 25 | Línea: descuento | `.discount_amount`, `.discount_rate` | Venta sí, **compra no** | — |
| 26 | Línea: impuesto | `.tax_code`, `.tax_rate`, `.tax_included`, `.tribute_id` (def. 1), `.is_excluded` (def. 0) | Solo `tax_rate` y `tax_included`, bajo el rótulo fijo «IVA» | — |
| 27 | Línea: retenciones | `.withholding_taxes` (jsonb, def. `[]`) | **No** | **0 filas** con contenido hoy |
| 28 | Línea: nota | `.note` | **No** | **0 filas** con contenido hoy |
| 29 | Línea: unidad y código estándar | `.unit_measure_id` (def. **70**), `.standard_code_id` (def. 1) | **No** | Ver el desajuste de §D.2 |
| 30 | Línea: seriales | `.serial_numbers`, `.serial_ids` | Venta y compra sí | — |
| 31 | Totales | `invoice_sales.subtotal/.tax_total/.total/.balance` | Sí | **No existe `discount_total`** |
| 32 | Descuento total | **no es columna** de `invoice_sales` ni de `invoice_purchase` | Se calcula en el navegador | `DetalleFactura.tsx:496-499`. `quotations.discount_total` **sí existe** |
| 33 | Desglose por impuesto | `invoice_applied_taxes` / `invoice_purchase_applied_taxes` (`tax_code`, `tax_rate`, `is_applied`) | **No** | — |
| 34 | Pagos | `payments` (`method`, `amount`, `currency`, `reference`, `payment_date`, `change_amount`) | **No** en PDF; **sí** en ticket | — |
| 35 | Cartera | `accounts_receivable` (`amount`, `balance`, `due_date`, `days_overdue`) | **No** | — |
| 36 | Notas del documento | `invoice_sales.notes`, `.description` | Solo `notes` | — |
| 37 | Términos | `quotations.terms_conditions` | Sí (como «Notas») | Venta y compra **no tienen** columna de términos |
| 38 | Firma | `quotations.signature_id` | **No** | Venta y compra no tienen dónde guardarla |
| 39 | Moneda | `invoice_sales.currency` / `invoice_purchase.currency` — **`character`, DEFAULT `'USD'`** | Se imprime el código, **no se usa para formatear** | `quotations.currency` sí tiene DEFAULT `'COP'` |
| 40 | Catálogo de monedas | `currencies`, `organization_currencies` (`is_base`), `currency_rates`, `exchange_rates` | **No** | Existe la infraestructura, ningún documento la usa |

### C.2 Lo que el PDF inventa o deja en blanco

| # | Qué | Dónde | Por qué es un problema |
|---|---|---|---|
| 1 | Rótulo **«IVA»** en la columna y en los totales | `pdfService.ts:266, :296, :503, :533`; ruta puppeteer `:140, :161` | El modelo admite impuestos con nombre libre (`organization_taxes.name`: «INC 8 %», «ICA 0.966 %»). Un restaurante con INC ve su impoconsumo rotulado como IVA |
| 2 | `'Mi Empresa'` como nombre | `pdfService.ts:205, 228, 450, 465`; ruta puppeteer `:97, :111` | Si falta el nombre se emite un documento con una marca genérica |
| 3 | `'Cliente'` / `'N/A'` como receptor | `pdfService.ts:236, :473` | Una factura sin cliente identificado no es válida ante la DIAN |
| 4 | `'NIT/CC'` y `'NIT'` como rótulo de documento | `pdfService.ts:237, :474` | Se usa cuando falta `doc_type`; enmascara el dato ausente |
| 5 | Moneda `'COP'` | `pdfService.ts:255, :492`; ruta puppeteer `:18, :130` | Fallback que se contradice con el DEFAULT `'USD'` de la columna |
| 6 | `formatCurrency(x)` **sin el segundo argumento** | `pdfService.ts:275-278, :512-515`, y todos los totales | `src/utils/Utils.ts:69` tiene `currency = "COP"` por defecto: **la caja «Moneda» puede decir USD mientras todos los importes se formatean como pesos** |
| 7 | QR calculado y no pintado | `src/app/api/facturas-venta/[id]/pdf/route.ts:44` | El PDF que se archiva sale sin QR |
| 8 | Pie fiscal vacío | `pdfService.ts:330-331` | «Este documento fue generado electrónicamente» no sustituye a la resolución, el rango ni el CUFE |
| 9 | Datos fiscales del proveedor del ERP | `print-agent/src/printing/renderHtml.ts:442-443` | El pie de **todo ticket de cualquier organización** lleva la razón social y el NIT de la empresa que vende el ERP, no los del comercio que emite |

---

## D. Facturación electrónica — Factus / DIAN

Constructor único del payload: `src/app/api/factus/invoice/route.ts:170-255`.
Destino: `POST {base}/v2/bills/validate` (`src/lib/services/factusService.ts:306`), con
`https://api-sandbox.factus.com.co` o `https://api.factus.com.co` (`factusService.ts:7-10`).

### D.1 Qué se envía

| # | Campo | Origen o valor cableado | Archivo:línea |
|---|---|---|---|
| 1 | `reference_code` | `invoice_sales.reference_code`; si falta, `INV-{id.substring(0,8)}` y se persiste | `:106-113, :171` |
| 2 | `document` | `'01'` factura · `'91'` NC · `'92'` ND · `'03'` doc. soporte | `:172`, `factusService.ts:643-651` |
| 3 | `numbering_range_id` | `invoice_sequences.factus_numbering_range_id` filtrando org + tipo + `is_active` | `:90-103, :173` |
| 4 | `operation_type` | **`'10'` cableado** | `:174` |
| 5 | `observation` | `invoice_sales.notes` | `:175` |
| 6 | `cash_rounding_amount` | **`'0.00'` cableado** | `:177` |
| 7 | `payment_details[0].payment_form` | `invoice_sales.payment_form`, fallback `'1'` (contado) | `:179` |
| 8 | `payment_details[0].payment_method_code` | `.payment_method_code` o `mapPaymentMethod(.payment_method)`, fallback `'10'` (efectivo) | `:180` |
| 9 | `payment_details[0].due_date` | `toPlainDate(due_date, orgTimezone)` — **usa la zona de la organización, correcto** | `:181` |
| 10 | `establishment` | Sucursal → organización → teléfono `'3000000000'` y correo `'noemail@noemail.com'` cableados; municipio `'05001'` | `:184-190, :149-164` |
| 11 | `customer.identification_document_code` | `mapIdentificationType` (CC `'13'`, NIT `'31'`, CE `'22'`…, fallback `'13'`) | `factusService.ts:626-638` |
| 12 | `customer.dv` | `customers.dv` | `:195` |
| 13 | `customer.legal_organization_code` | **Se deriva de `customer_type`** (`'company'`→`'1'`, resto→`'2'`); la columna `legal_organization_id` **no se usa** | `factusService.ts:656-659` |
| 14 | `customer.tribute_code` | `mapTribute(customers.tribute_id)`, fallback `'ZZ'` | `factusService.ts:664-674` |
| 15 | `customer.country_code` | **`'CO'` cableado** | `:203` |
| 16 | `customer.municipality_code` | Vía `customers.fiscal_municipality_id` → `municipalities`; fallback `'05001'` | `:139-146` |
| 17 | `items[].code_reference` | `code_reference` o `PROD-{product_id}` o `ITEM-{n}` | `:218-221` |
| 18 | `items[].name` | `description` recortado a 250 caracteres | `:225` |
| 19 | `items[].unit_measure_code` | `mapUnitMeasure(unit_measure_id)` | `:232` |
| 20 | `items[].taxes[]` | `{code, rate, is_excluded}` — ver §D.2 | `:234-238` |
| 21 | `items[].withholding_taxes[]` | Copia **cruda** del jsonb: `code: wt.code \|\| ''` | `:239-242` |
| 22 | `items[].discount_rate` / `.discount_amount` | Solo si **ambos** son > 0 | `:247-250` |
| 23 | **`currency`** | El tipo lo declara (`factusService.ts:99`) y **nunca se popula**: cero ocurrencias en el constructor | — |
| 24 | `items[].tribute_id` | **No se envía**, aunque la columna existe con DEFAULT 1 | — |

### D.2 Mapeo de impuestos — confirmado y peor de lo documentado

`docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §E decía que el INC se declara como IVA `'01'`.
**Confirmado, por dos caminos independientes.**

**Camino 1 — `mapTaxCode`, `src/lib/services/factusService.ts:710-728`.** El diccionario tiene
`IVA_19`, `IVA_5`, `IVA_0`, `IVA` → `'01'`; `RETE_4`, `RETE_11` → `'09'`; `ICA_0.966` → `'07'`; y los
pasantes `'01'`, `'04'`, `'06'`, `'07'`, `'08'`, `'09'`, `'10'`. **No hay ninguna entrada `'02'`
(INC) ni `'05'` (ADV).** El `return` es `mapping[taxCode || '01'] || '01'`: cualquier código no
reconocido —`'INC'`, `'INC_8'`, `'ICO'`, `'EXENTO'`, `'EXCLUIDO'`— cae en IVA.

**Camino 2 — el auto-mapeo por tasa, `src/app/api/factus/invoice/route.ts:209-215`.** Las cuatro
ramas del `if/else` asignan el mismo valor:

```ts
if (rate === 19) itemTaxCode = '01';
else if (rate === 5) itemTaxCode = '01';
else if (rate === 0) itemTaxCode = '01';
else itemTaxCode = '01';       // ← toda otra tasa: INC 8 %, ICO 4 %...
```

Una línea con INC 8 % se emite como `{code: '01', rate: '8.00'}`: **IVA al 8 %, una tarifa que no
existe en Colombia**. Lo mismo en el documento soporte (`src/app/api/factus/support-document/route.ts:158-161`,
`itemTaxCode = '01'` incondicional).

Contraste con el catálogo real, que **sí está en la base** (`dian_tributes`, verificado por MCP):

| id | code | name | type | ¿Emitible hoy? |
|---|---|---|---|---|
| 1 | `01` | IVA | product | Sí |
| 2 | `02` | Impuesto al Consumo | product | **No** — falta en `mapTaxCode` |
| 3 | `03` | ICA | product | **No** |
| 4 | `04` | INC | product | Solo si el `tax_code` ya viene como `'04'`, cosa que ningún flujo produce |
| 5 | `05` | ReteIVA | withholding | **No** |
| 6 | `06` | ReteRenta | withholding | **No** |
| 7 | `07` | ReteICA | withholding | Solo vía `'ICA_0.966'` |
| 18 | `18` | IVA Cliente | customer | — |
| 21 | `ZZ` | No aplica | customer | Es el fallback de `mapTribute` |
| 22 | `ZA` | IVA e INC | customer | **No** |

**Retenciones.** `withholding_taxes` se copia cruda del jsonb sin mapeo ni validación
(`invoice/route.ts:239-242`): si el JSON no trae `code`, se envía `code: ''`. No existe ningún
catálogo interno ReteIVA/ReteFuente/ReteICA → código DIAN, pese a que `dian_tributes` lo tiene
(ids 5-7). Hoy **0 filas de `invoice_items` tienen `withholding_taxes` distinto de `[]`**, así que
el problema aún no ha estallado. En nota crédito se envía `[]` fijo
(`src/app/api/factus/credit-note/route.ts:92`).

**Exento / excluido.** Solo se distingue por `is_excluded` (`:237`); el `code` sigue siendo `'01'`.

### D.3 Qué devuelve Factus y dónde se guarda

| # | Campo de la respuesta | Se guarda en | Archivo:línea |
|---|---|---|---|
| 1 | `data.cufe` | `electronic_invoicing_jobs.cufe` **y** `invoice_sales.xml_uuid` | `:280, :286` |
| 2 | `data.is_validated` | `jobs.status` = `'accepted'` \| `'sent'`; `invoice_sales.status` = `'validated'` \| `'sent'` | `:274, :289` |
| 3 | Respuesta completa | `electronic_invoicing_jobs.response_payload` (jsonb) | `:275` |
| 4 | `data.validated_at` | `invoice_sales.validated_at` | `:287` |
| 5 | Evento | `electronic_invoicing_events` (`event_code: '200'`, metadata con número, CUFE, `is_validated`) | `:296-307` |
| 6 | **QR** | **Nunca se escribe.** Ni `electronic_invoicing_jobs.qr_code` ni `invoice_sales.qr_image` se setean por ninguna ruta | — |

**Consecuencia directa:** `src/components/pos/CheckoutDialog.tsx:1362` y `:1379` leen
`qrData: eJob.qr_code || ''`, y la plantilla térmica pinta
`<img src="https://api.qrserver.com/...&data=">` con `data` vacío
(`print-agent/src/printing/renderHtml.ts:767`). **El QR DIAN del tiquete sale siempre en blanco.**
El CUFE sí se imprime, partido y completo (`renderHtml.ts:771-775`).

Estado real verificado por MCP: **3.187 facturas de venta, 0 con `xml_uuid`, 0 con `qr_image`;
8 jobs de facturación electrónica, los 8 en `pending`.** Ninguna factura se ha validado nunca.

### D.4 Estados y cómo se pintan

Tipo canónico `EInvoiceStatus` (`src/lib/services/electronicInvoicingService.ts:9-16`), espejo del
CHECK de `electronic_invoicing_jobs`:

| # | Estado | Etiqueta exacta | Color claro / oscuro | Icono |
|---|---|---|---|---|
| 1 | `pending` | **Pendiente** | `bg-yellow-100 text-yellow-800` / `bg-yellow-900/30 text-yellow-400` | `Clock` |
| 2 | `processing` | **Procesando** | `bg-blue-100 text-blue-800` / `bg-blue-900/30 text-blue-400` | `Loader2` + `animate-spin` |
| 3 | `sent` | **Enviado** | igual que `processing` | `Loader2` + `animate-spin` |
| 4 | `accepted` | **Aceptada DIAN** | `bg-green-100 text-green-800` / `bg-green-900/30 text-green-400` | `CheckCircle2` |
| 5 | `rejected` | **Rechazada DIAN** | `bg-red-100 text-red-800` / `bg-red-900/30 text-red-400` | `XCircle` |
| 6 | `failed` | **Error** | `bg-orange-100 text-orange-800` / `bg-orange-900/30 text-orange-400` | `AlertTriangle` |
| 7 | `cancelled` | **Cancelada** | `bg-gray-100 text-gray-800` / `bg-gray-900/30 text-gray-400` | `Ban` |
| 8 | `null` u otro | **Sin FE** | `bg-gray-100 text-gray-600` / `bg-gray-800 text-gray-400` | `FileX` |

`FactusStatusBadge.tsx:70-74`: `variant="outline"`, `border-0 gap-1`, tamaños `sm` / `md` / `lg`;
iconos a `h-3.5 w-3.5` (`:38`). Con `cufe` y `showTooltip`, tooltip con icono `Zap h-3 w-3`, título
«CUFE» y el valor en `font-mono break-all` (`:96-113`).

Textos de `SendToFactusButton.tsx:111-118`: «Enviando…» · «Enviada a DIAN» · «Procesando…» ·
«Pendiente DIAN» · «Reintentar DIAN» · «Enviar a DIAN».

### D.5 Configuración — `CredencialesFactusSection.tsx`

| # | Rótulo exacto | Control | Archivo:línea |
|---|---|---|---|
| 1 | **Ambiente** | Select: «Sandbox (Pruebas)» / «Producción» | `:60-70` |
| 2 | **Proveedor** | Select: `factus` / `carvajal` / `siigo` / `alegra` | `:73-82` |
| 3 | **Client ID** | Input de texto plano | `:87-88` |
| 4 | **Client Secret** | Input `type="password"` | `:91-92` |
| 5 | **Usuario / Email** | Input | `:95-96` |
| 6 | **Contraseña** | Input `type="password"` | `:99-100` |
| 7 | **Configuración activa** | Switch | `:104-105` |
| 8 | **Facturar siempre como electrónica** | Switch, subtítulo «Activa automáticamente el toggle de factura electrónica en POS, pre-cuenta y nuevas facturas» | `:112-116` |
| 9 | Botones | «Guardar» y «Probar conexión» | `:120-127` |

Persiste en `electronic_invoicing_config` vía `upsert` con `onConflict: 'organization_id,provider'`
(`src/lib/services/electronicInvoicingConfigService.ts:36-55`). Verificado por MCP: `client_id`,
`client_secret`, `username` y `password` son **`text` en claro**, sin cifrado.

**Tres hallazgos:**
1. El servicio importa el cliente **del navegador** (`@/lib/supabase/config`) y hace `select('*')`,
   de modo que el `client_secret` y la contraseña **llegan en texto plano al navegador** y se
   vuelcan al estado del formulario (`FacturacionConfigPanel.tsx:74-81`).
2. **Esa configuración no se usa para emitir.** Todas las rutas de servidor leen exclusivamente
   variables de entorno (`factusTokenManager.ts:16-28`: `FACTUS_CLIENT_ID`, `FACTUS_CLIENT_SECRET`,
   `FACTUS_USERNAME`, `FACTUS_PASSWORD`, `FACTUS_ENVIRONMENT`). El panel es decorativo y el
   multi-tenant de facturación electrónica está roto: **una sola cuenta Factus para todas las
   organizaciones**, con el token cacheado en memoria de módulo sin aislamiento (`:8-12`).
3. «Probar conexión» valida que la fila de la base esté completa y luego llama `/api/factus/auth`,
   que prueba las variables de entorno — puede dar verde con credenciales guardadas erróneas.

### D.6 Descarga del documento oficial — sí existe

`GET /api/factus/download?type=pdf|xml&invoiceNumber=XXX` (`src/app/api/factus/download/route.ts:12-60`)
decodifica `pdf_base_64_encoded` / `xml_base_64_encoded` (`factusService.ts:438-506`) y responde con
`attachment; filename="factura-{n}.pdf|xml"`. La llaman `DetalleFactura.tsx:829` y `:853` y
`src/app/app/finanzas/facturacion-electronica/page.tsx:209`. Existe la variante equivalente para
documentos soporte.

**Es decir: el único documento legalmente válido que el sistema puede entregar hoy es el PDF que
devuelve Factus, no el que genera el ERP.**

---

## E. Lo roto o inconsistente

### E.1 Seguridad

| # | Hallazgo | Archivo:línea | Gravedad |
|---|---|---|---|
| 1 | **`POST /api/facturas-venta/[id]/pdf` no valida sesión ni organización**, usa service role y hace `upsert` sobre `facturas-venta/{id}.pdf`. Conociendo el uuid de una factura ajena se sobrescribe su PDF con contenido arbitrario | `route.ts:7-14, :200-208` | **Crítica** |
| 2 | **El bucket `invoices` es público** (verificado por MCP: `public = true`, sin `file_size_limit`). Todo PDF archivado es legible por URL sin autenticación | `storage.buckets` | **Crítica** |
| 3 | El cuerpo del `POST` **es la única fuente de los datos que se pintan**: el servidor no relee la factura. Se puede generar un PDF con cualquier importe, cliente o NIT y dejarlo en la ruta canónica de una factura real | `route.ts:13, :46-175` | **Crítica** |
| 4 | **`POST /api/factus/auth` devuelve el bearer token de Factus** en el JSON, sin autenticación | `src/app/api/factus/auth/route.ts:30-34` | **Crítica** |
| 5 | **`GET /api/factus/download` sin autenticación**: enumerando números se descargan PDF y XML DIAN de terceros de la cuenta | `download/route.ts:12-41` | **Crítica** |
| 6 | **Ninguna de las 12 rutas `/api/factus/**` usa `getServerOrgContext` ni `withOrg`**, y ninguna valida que el `organizationId` del cuerpo pertenezca al usuario. `credit-note`, `debit-note`, `webhook` y `process-pending` usan además un cliente sin cookies, así que pierden hasta la red de RLS | — | **Crítica** |
| 7 | `DELETE /api/factus/support-document` borra en Factus **por `reference_code`, sin comprobar organización** | `support-document/route.ts:464-468` | Alta |
| 8 | `GET /api/factus/numbering-ranges` sin auth: expone resoluciones DIAN, prefijos y `technical_key` | `numbering-ranges/route.ts:5-21` | Alta |
| 9 | `GET /api/factus/acquirer` sin auth: proxy abierto de consulta DIAN por cédula o NIT → enumeración de datos personales | `acquirer/route.ts:19-68` | Alta |
| 10 | El webhook verifica HMAC **solo si `FACTUS_WEBHOOK_SECRET` existe**; si falta, acepta cualquier `POST`. Compara con `!==` (no constant-time) e interpola `reference_code` sin sanear dentro de `.or()` | `webhook/route.ts:24-45` | Alta |
| 11 | Credenciales Factus en texto plano legibles desde el navegador | §D.5 | Alta |
| 12 | **Ninguna plantilla escapa HTML**: `description`, `notes`, nombres y direcciones se interpolan crudos en `document.write`. La única excepción es `renderProposalHtml` | todo `pdfService.ts`, `route.ts` | Media |

### E.2 El PDF que casi nunca existe

`puppeteer` está como **dependencia de producción** (`package.json:92`), no `puppeteer-core` +
`@sparticuz/chromium`, y no hay `serverExternalPackages` en la configuración de Next. Evidencia de
lo que eso produce (objetos del bucket `invoices`, por MCP):

| Objetos en `invoices` | Fecha | Observación |
|---|---|---|
| 5 `.pdf` (115-159 KB) | del 2026-08-08 al **2026-08-14** | Último PDF generado hace más de un mes |
| 1 `.html` (9 KB) | 2026-08-08 | Artefacto de la ruta `GET` legada |

Contra **3.187 facturas de venta** en la base: **cobertura del 0,16 %**. Como el QR del documento
impreso apunta siempre a `invoices/facturas-venta/{id}.pdf` (`pdfService.ts:343`), **en la práctica
el QR de casi todas las facturas lleva a un objeto que no existe**. Y como el `fetch` es
*fire-and-forget* con `.catch(console.warn)` (`:350`), el usuario ve «PDF Generado» sin que se haya
generado nada.

Añadido: `GET /api/facturas-venta/[id]` descarga `facturas-venta/{id}.html`
(`src/app/api/facturas-venta/[id]/route.ts:18`) — una extensión que el `POST` **nunca escribe**
(escribe `.pdf`). Ruta muerta que devuelve 404 salvo para el único `.html` heredado.

### E.3 Fechas y zona horaria

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **La pantalla y el PDF usan reglas distintas.** `DetalleFactura.tsx:131` usa `useFormatDate()` (zona de la organización), pero el PDF usa `new Date(x).toLocaleDateString('es-CO')` sin zona (`pdfService.ts:117-123`). El mismo documento puede mostrar un día en pantalla y otro en papel | `pdfService.ts:117-123` |
| 2 | **La cotización corre un día.** `quotations.issue_date` y `.valid_until` son de tipo **`date`**; `new Date('2026-09-22')` se interpreta como medianoche UTC y, renderizado en `America/Bogota` (UTC−5), sale el día anterior. Es exactamente el bug que `docs/reglas-fechas-timezone.md` §5 prohíbe | `pdfService.ts:117-123` + `quotations.issue_date` |
| 3 | Las tres plantillas repiten su propio `formatDate` en lugar de usar `formatDateInTz` | `pdfService.ts:117, :370`; `route.ts:24`; `/api/pdf/invoice:16` |
| 4 | `toISOString().split('T')[0]` en el valor por defecto de la vigencia de una cotización nueva | `NuevaCotizacionForm.tsx:52, :54` |
| 5 | Mismo patrón comparando contra `issue_date` | `DetalleFactura.tsx:1223, :1226, :1239`; `RegistrarPagoDialog.tsx:153, :379`; `RegistrarPagoModal.tsx:164, :313, :318` |
| 6 | **Contraejemplo correcto**: el arqueo de caja sí usa `formatDateTimeInTz(dateString, timezone)`, y la ruta de Factus usa `toPlainDate(due_date, orgTimezone)` | `ReportGenerator.tsx:64, :258`; `factus/invoice/route.ts:181` |

**Ninguno de los generadores de documentos consulta `organizations.timezone`.**

### E.4 Moneda

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **El código de moneda y el formato de los importes son independientes.** La caja «Moneda» imprime `data.currency`, pero todos los importes pasan por `formatCurrency(x)` **sin el segundo argumento**, y `src/utils/Utils.ts:69` lo fija en `"COP"` | `pdfService.ts:255` vs `:275-278` |
| 2 | `invoice_sales.currency` e `invoice_purchase.currency` tienen **DEFAULT `'USD'`**, mientras que todos los fallbacks del código dicen `'COP'` | esquema verificado |
| 3 | Hoy no ha estallado porque las 3.187 facturas de venta y todas las de compra están en COP (verificado) — pero la primera factura en divisa saldrá con importes formateados como pesos | — |
| 4 | `'COP'` cableado en seis sitios | `pdfService.ts:255, :492`; `pdfExportService.ts:108`; `shipmentLabelPrinter.ts:37`; `proposalNarrative.ts:92, :261` |
| 5 | En `pdfExportService.ts:106-110` no es ni siquiera un fallback: `currency: 'COP'` es fijo | — |
| 6 | Existen `currencies`, `organization_currencies` (con `is_base`), `currency_rates` y `exchange_rates`, y **ningún documento las usa** | esquema |
| 7 | Factus **nunca recibe `currency`**, aunque el tipo lo declara | `factusService.ts:99` |

### E.5 Cálculos en el navegador

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | `discount_total` **no es columna** de `invoice_sales`: se suma en el cliente con un `reduce` sobre las líneas y se manda al servidor en el cuerpo | `DetalleFactura.tsx:496-499` → `pdfService.ts:349` |
| 2 | El «Pagado» del PDF se calcula como `total - balance` en la plantilla, no desde `payments` | `pdfService.ts:317, :554` |
| 3 | El servidor de PDF **no valida nada**: reimprime lo que le llegue | `route.ts:46-175` |
| 4 | El payload de la factura de compra está **duplicado literalmente** en dos handlers | `DetalleFacturaCompra.tsx:212-241` y `:247-276` |

### E.6 Consistencia de esquema en el camino DIAN

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | La nota crédito escribe **columnas que no existen**: `einvoice_number` y `einvoice_qr` sobre `invoice_sales`. El error del `update` no se comprueba → falla en silencio y la NC se queda sin número DIAN | `credit-note/route.ts:146-151` |
| 2 | Los estados `'validated'`, `'sent'` y `'rejected'` **violan `invoice_sales_status_check`** (solo admite `draft\|issued\|paid\|partial\|void`). Postgres rechaza el `update` y nadie mira el error | `invoice/route.ts:289`; `webhook/route.ts:96, :105` |
| 3 | `invoice_items.unit_measure_id` tiene **DEFAULT 70**, pero `mapUnitMeasure` solo cubre 1-10: **todo cae a `'94'` (Unidad)** | `factusService.ts:679-693` |
| 4 | El POS fija `environment: 'test'` cableado al guardar los datos de la factura electrónica para la impresión manual, mientras la vía de encolado sí lee `electronic_invoicing_config.environment`. El botón «Factura Electrónica» puede imprimir «DIAN - Entorno: PRUEBAS» sobre una factura de producción | `CheckoutDialog.tsx:1364` vs `:1381` |

### E.7 Maquetación

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **Sin paginación.** Ninguna plantilla tiene «Página X de Y» ni numeración. La única con paginación es `pdfExportService` (reportes) | todas |
| 2 | **Sin cabecera repetida.** Una factura de 60 líneas parte la tabla y en la página 2 no hay ni cabecera ni emisor ni número de documento | todas |
| 3 | **Sin `thead` repetido**: falta `display: table-header-group` y `break-inside: avoid` en las filas | `pdfService.ts:175-179` |
| 4 | **Sin `@page`** en las plantillas de carta: el tamaño y los márgenes los decide el diálogo del navegador (o los 20 px de puppeteer en `route.ts:195`) | `pdfService.ts:152` |
| 5 | **El logo puede no cargar.** `page.setContent(html, {waitUntil:'networkidle0'})` espera la red, pero si `logo_url` da error el PDF sale sin logo y sin sustituto. El camino de navegador sí tiene `printWhenReady` con espera de imágenes y `setTimeout` de 3 s — solo en el ticket | `route.ts:191` vs `printService.ts:336-371` |
| 6 | **El QR depende de un servicio externo** (`api.qrserver.com`). Sin red, bloqueado por el firewall del cliente o caído el servicio, el documento sale sin QR — y de paso el número, el total y el nombre del comercio viajan a un tercero en la URL. Hay `qrcode.react` en las dependencias | `pdfService.ts:215`; `renderHtml.ts:439, :767` |
| 7 | La guía de envío legada carga **JsBarcode desde un CDN** en tiempo de impresión | `shipmentLabelPrinter.ts:500, :530` |
| 8 | El contraste no se valida: `primary_color` se usa como fondo de la cabecera de tabla con texto blanco. Un color claro da una cabecera ilegible | `pdfService.ts:176` |
| 9 | El badge de estado de la cotización **fuerza la clase `status-issued`**, así que «Rechazada» y «Vencida» se pintan en azul de «Emitida» | `pdfService.ts:212` |

### E.8 Botones que no hacen lo que dicen

| # | Control | Qué promete | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 1 | «PDF» con icono `Download`, `title="Descargar PDF"` (venta) | Descargar un PDF | Abre una ventana con HTML y lanza el diálogo de impresión | `DetalleFactura.tsx:780-789` |
| 2 | «PDF» (compra) | Descargar un PDF | Descarga un `.html` | `DetalleFacturaCompra.tsx:416-422` → `pdfService.ts:593-597` |
| 3 | «Imprimir» (cotización) + toast «PDF Generado» | Un PDF de cotización | HTML con la plantilla de factura | `DetalleCotizacion.tsx:159-165` |
| 4 | «Email» (venta) | Enviar la factura por correo | `toastInfo('Enviando factura', …)` y nada más | `DetalleFactura.tsx:440-442, :790-799` |
| 5 | «WhatsApp» (venta) | Enviar la factura | Otro toast informativo | `DetalleFactura.tsx:444-446, :800-809` |
| 6 | «Descargar PDF» (nota crédito) | Un PDF | `toast(...)` + comentario «Aquí iría la lógica» | `NotaCreditoDetalle.tsx:199-201` |
| 7 | «Exportar PDF» (listado de compras) | Un reporte | `console.log('Exportar reporte PDF')` | `FacturasCompraPageHeader.tsx:34-35` |

### E.9 Duplicación y textos en duro

| # | Hallazgo | Detalle |
|---|---|---|
| 1 | **Cuatro plantillas del mismo documento de venta** | §A.3, tabla comparativa |
| 2 | **Tres recibos de parqueadero** con formatos y locales distintos | 80 mm `es-CO` (`parkingTicketService.ts:340`), 300 px `es-ES` (`SessionReceipt.tsx:5`), 400 px `es-ES` (`parking/sesiones/[id]/page.tsx:209`) |
| 3 | **Locales inconsistentes** | `es-CO` mayoritario, `es-ES` en parqueadero, `es` a secas en `dashboardSectionExport.ts:259, :285`, y **sin locale** en `pedidos-online/page.tsx:493-494, :500` |
| 4 | **Cero plantillas en i18n** | `messages/es.json` solo tiene `pdfExported`, `pdfError`, `invoicesToday`, `tickets`, `ticketsDesc`. El 100 % del texto de los documentos («FACTURA», «IVA», «NIT», «Mi Empresa», «Gracias por su preferencia», la nota legal del cierre) está cableado en literales de TypeScript |
| 5 | **Datos del proveedor del ERP en documentos de cliente** | El pie de todo ticket y de toda guía de envío lleva la razón social, el NIT, la web y el teléfono de la empresa que vende el ERP, para cualquier organización (`renderHtml.ts:442-443`; `shipmentLabelPrinter.ts:495-496`) |
| 6 | **QR decorativo** | El QR del pie del ticket de venta apunta siempre a la web del ERP, no a la venta (`renderHtml.ts:439`) |
| 7 | **QR de parqueadero simulado** | Pinta el texto `[QR: {id}]`, no un código real (`parkingTicketService.ts:264-273`) |

---

## F. Qué debe tener un documento profesional, y qué falta

| # | Bloque | Qué exige un documento serio (y la DIAN, donde aplica) | Estado hoy |
|---|---|---|---|
| 1 | **Identidad** | Logo, nombre comercial **y razón social**, con jerarquía tipográfica | Parcial: logo y nombre comercial. Falta `legal_name`, que es NOT NULL |
| 2 | **Datos fiscales del emisor** | NIT **con DV**, dirección, municipio y departamento, teléfono, correo, actividad económica, **responsabilidades fiscales** | Solo NIT, dirección, teléfono y correo. El ticket 80 mm sí pinta las responsabilidades; el PDF no |
| 3 | **Sucursal emisora** | Nombre, dirección y municipio del establecimiento | **Ausente por completo** de los tres PDF, pese a `branch_id` NOT NULL |
| 4 | **Tipo de documento** | «Factura Electrónica de Venta» / «Factura de Venta» / «Cotización» / «Orden de compra», sin ambigüedad | Títulos cableados; la cotización se emite con la maqueta de factura |
| 5 | **Numeración autorizada** | Prefijo + consecutivo, **número de resolución DIAN, fecha, rango autorizado desde-hasta y vigencia** | **Ausente.** Los datos están en `invoice_sequences` (4 de 10 filas) y ningún render los consume |
| 6 | **Receptor** | Razón social o nombre, **tipo** y número de documento, **DV**, dirección, municipio, teléfono, correo, **responsabilidades fiscales** | Nombre, documento (la cotización sin tipo), dirección, teléfono, correo. Sin DV, sin municipio, sin responsabilidades |
| 7 | **Metadatos** | Fecha y **hora** de emisión, fecha de vencimiento, **moneda con su símbolo coherente**, forma de pago (contado/crédito), medio de pago, vendedor, referencia externa | Tres campos en caja gris, sin hora, sin forma ni medio de pago, con la incoherencia de moneda de §E.4 |
| 8 | **Líneas** | Código, descripción, unidad de medida, cantidad, precio unitario, descuento (valor **y** porcentaje), **impuesto identificado por nombre real y tarifa**, valor de línea | 6 columnas, impuesto siempre rotulado «IVA», sin unidad de medida, sin porcentaje de descuento, sin la nota de línea |
| 9 | **Totales** | Subtotal, descuentos, **base gravable por cada impuesto**, valor de cada impuesto con su nombre, total bruto, **retenciones**, total neto, anticipos | Subtotal, descuento (calculado en el navegador), un único renglón «IVA», total. Sin base gravable, sin retenciones, sin desglose |
| 10 | **Importe en letras** | Habitual y esperado en Colombia | **Ausente** |
| 11 | **Pagos y vencimientos** | Pagos aplicados con fecha, método y referencia; saldo; **plan de cuotas si hay crédito**; días de mora | Solo «Saldo Pendiente» o «Pagado». `payments` y `accounts_receivable` no se consultan |
| 12 | **Notas y términos** | Observaciones del documento **y** términos y condiciones como bloque separado | Un solo bloque «Notas». Venta y compra **no tienen columna** de términos |
| 13 | **Firma** | Espacio de aceptación / recibido, o firma electrónica referenciada | **Ausente** en los tres. Existe en el arqueo de caja y en la guía de envío |
| 14 | **Pie legal** | Resolución, **CUFE**, **QR DIAN**, leyenda del proveedor tecnológico, «Representación gráfica de la factura electrónica de venta» | «Gracias por su preferencia» y «Este documento fue generado electrónicamente» |
| 15 | **Paginación** | «Página X de Y» y cabecera repetida en cada hoja | **Ausente** |
| 16 | **Marca de estado** | Anulado, borrador, copia | Sí: banda «DOCUMENTO ANULADO». Falta marca de agua de «BORRADOR» y de «COPIA» |
| 17 | **Accesibilidad del PDF** | Texto seleccionable, metadatos del documento, contraste ≥ 4.5:1 | El texto es seleccionable (puppeteer). Sin metadatos, sin validación de contraste (§E.7.8) |

**Resumen del contraste:** de 17 bloques, **7 están razonablemente cubiertos** (identidad parcial,
tipo de documento, receptor parcial, metadatos parciales, líneas parciales, totales parciales,
marca de anulación), **10 están ausentes o rotos**. Los cuatro que impiden que el documento sea
legalmente utilizable son el **5 (resolución y rango)**, el **9 (base gravable y retenciones)**,
el **14 (CUFE y QR)** y el **15 (paginación)**.

---

## G. Propuesta: un motor único de plantillas

### G.1 El precedente que ya funciona

`print-agent/src/printing/` resolvió exactamente este problema para los tickets: una carpeta
compartida, TypeScript puro, sin `fs`, sin `electron`, sin `window` (`index.ts:15-18`), consumida
por el ERP web y por el agente de escritorio. Su encabezado documenta el punto de partida
(`index.ts:10-14`): *antes había cinco copias de las plantillas y siempre quedaba alguna sin
actualizar*. **Hoy los documentos en papel carta están exactamente en ese estado: cuatro copias.**

La propuesta es extender el mismo patrón a `documents/`, no inventar uno nuevo.

### G.2 Qué es común y qué varía

| # | Bloque | Venta | Compra | Cotización | Nota crédito | Remisión |
|---|---|---|---|---|---|---|
| 1 | Cabecera de identidad | Común | Común | Común | Común | Común |
| 2 | Bloque fiscal del emisor | Común | Común | Común | Común | Común |
| 3 | Sucursal emisora | Común | Común | Común | Común | Común |
| 4 | Título y numeración | «Factura Electrónica de Venta» + resolución | «Factura de Compra» + nº externo del proveedor | «Cotización» + vigencia | «Nota Crédito» + factura afectada | «Remisión» + factura o pedido |
| 5 | Contraparte | Cliente (receptor) | **Proveedor (emisor real)** | Cliente (prospecto) | Cliente | Cliente |
| 6 | Tabla de líneas | Común | Común | Común | Común | **Sin precios**, con cantidades y lote/serial |
| 7 | Desglose de impuestos | Común | Común | Común | Común | No aplica |
| 8 | Retenciones | Sí | **Sí, las practicadas al proveedor** | No | Sí | No |
| 9 | Pagos y saldo | Sí | Sí | **No** (se sustituye por vigencia y enlace de pago) | Saldo a favor | No |
| 10 | Notas | Común | Común | Común | **Motivo de la nota** (obligatorio DIAN) | Instrucciones de entrega |
| 11 | Términos y condiciones | Opcional | Opcional | **Obligatorio** | No | No |
| 12 | Firma | Opcional | **Recibido a satisfacción** | **Aceptación del cliente** | No | **Recibido, con fecha y cédula** |
| 13 | Pie legal | **Resolución + CUFE + QR** | Leyenda de documento interno | «No es una factura» | **Resolución + CUDE + QR** | «No es una factura» |
| 14 | Paginación | Común | Común | Común | Común | Común |

**Conclusión:** 6 de 14 bloques son idénticos, 5 varían solo en rótulo y contenido, y 3 (5, 9, 13)
son los que de verdad definen el tipo de documento. Un motor con un `DocumentPayload` común y un
`DocumentKind` discriminante cubre los cinco.

### G.3 Forma propuesta

```
print-agent/src/printing/        ← ya existe: 58/80 mm, ESC/POS
documents/                       ← nuevo, mismo patrón
  ├── types.ts        DocumentPayload + DocumentKind ('sale'|'purchase'|'quote'|'credit_note'|'delivery_note')
  ├── paper.ts        PageSpec: 'letter' | 'half_letter' | 'a4' | 'thermal_80'
  ├── blocks.ts       Los 14 bloques de §G.2, cada uno una función pura
  ├── renderHtml.ts   buildDocumentHTML(payload, pageSpec)  — común a los 5 tipos
  └── resolve.ts      Consulta en SERVIDOR y arma el payload desde la base
```

**Tres reglas no negociables**, cada una respuesta a un problema concreto de §E:

1. **El payload se arma en el servidor, no en el navegador** (§E.1.3 y §E.5). La ruta recibe
   `{ kind, id }`, resuelve la organización con `getServerOrgContext()`, lee la factura con
   `getServerUserClient()` y calcula los totales en SQL. Nada de lo que se pinta viene del cuerpo.
2. **Un solo motor de fechas y de moneda**: `formatDateInTz(value, org.timezone)` y `formatPlainDate`
   según el tipo de la columna (regla 5 de `docs/reglas-fechas-timezone.md`), y `formatCurrency` con
   **siempre** el código de moneda del documento como segundo argumento.
3. **Ningún rótulo de impuesto cableado**: el nombre sale de `organization_taxes.name` o de
   `dian_tributes.name` vía `invoice_items.tribute_id` / `.tax_code`.

### G.4 Tamaños

| # | Formato | Uso | Especificación |
|---|---|---|---|
| 1 | Carta (216×279 mm) | Factura, compra, cotización, nota crédito | `@page { size: letter; margin: 14mm 12mm 18mm }`, cabecera repetida, «Página X de Y» |
| 2 | Media carta (216×140 mm) | Factura POS con más detalle que el ticket, remisión | Mismos bloques, tabla compacta, sin términos |
| 3 | Ticket 80 mm | POS, pre-cuenta, factura electrónica | **Ya resuelto**: `getPaperSpec('80mm')`, `@page size: 72.06mm auto` |
| 4 | Ticket 58 mm | Impresoras angostas | **Ya resuelto**: 32 caracteres/línea |
| 5 | A4 | Exportación internacional | Mismo motor, `size: A4` |

Los cuatro primeros deben salir del **mismo `DocumentPayload`**: lo que cambia es el `PageSpec` y
qué bloques opcionales se omiten, no los datos.

### G.5 Qué falta en datos y en esquema

**Sin tocar el esquema** (todo verificado como existente y hoy no consultado): razón social, DV,
municipio, actividad económica, responsabilidades fiscales y `graphic_representation_name` del
emisor; sucursal completa; resolución, prefijo, rango y vigencia de `invoice_sequences`; CUFE
(`xml_uuid`) y QR (`qr_image`); DV, municipio y responsabilidades del cliente; datos fiscales y
bancarios del proveedor; `note` y `withholding_taxes` por línea; `invoice_applied_taxes`; `payments`
y `accounts_receivable`; `payment_form` y `payment_method_code`.

**Migraciones aditivas necesarias** (columnas `NULL`-ables o con `DEFAULT`, por el MCP y con su
reversión, según `docs/POLITICA-MIGRACIONES.md`):

| # | Cambio | Motivo |
|---|---|---|
| 1 | `invoice_sales.discount_total numeric DEFAULT 0` y lo mismo en `invoice_purchase` | Hoy se suma en el navegador (§E.5.1). `quotations` ya la tiene |
| 2 | `invoice_sales.terms_conditions text` y `invoice_purchase.terms_conditions text` | Bloque 11 de §G.2. `quotations` ya la tiene |
| 3 | `invoice_sales.qr_image` — **rellenarla**, no crearla | Existe y nunca se escribe (§D.3) |
| 4 | `electronic_invoicing_jobs.qr_code` — **rellenarlo** | Existe y nunca se escribe; causa el QR en blanco |
| 5 | Ampliar `invoice_sales_status_check` con `'sent'`, `'validated'`, `'rejected'` | El código ya los escribe y Postgres los rechaza en silencio (§E.6.2) |
| 6 | Eliminar del código `einvoice_number` / `einvoice_qr` | Columnas que no existen (§E.6.1) |
| 7 | `invoice_documents(id, organization_id, document_kind, document_id, storage_path, page_count, generated_at, generated_by, checksum)` | Trazabilidad del PDF archivado: hoy solo hay un objeto en un bucket público sin dueño |
| 8 | Poblar `invoice_items.tribute_id` desde `organization_taxes` / `tax_templates.code` | Para que el rótulo del impuesto y el código DIAN salgan del dato, no de un `if` |
| 9 | Catálogo de retenciones (reusar `dian_tributes` ids 5-7) y UI que escriba `withholding_taxes` | Hoy 0 filas con contenido y ningún mapeo |
| 10 | Corregir el DEFAULT de `currency` en `invoice_sales` e `invoice_purchase`, o derivarlo de `organization_currencies.is_base` | DEFAULT `'USD'` contra fallbacks `'COP'` (§E.4.2) |

**Cambios de infraestructura:**

| # | Cambio | Motivo |
|---|---|---|
| 1 | Bucket `invoices` a **privado** + URLs firmadas | Hoy público (§E.1.2) |
| 2 | `getServerOrgContext()` en la ruta de PDF y en las 12 de Factus | Ninguna lo usa (§E.1.1, §E.1.6) |
| 3 | `puppeteer-core` + `@sparticuz/chromium`, o un servicio dedicado de render | 5 PDF sobre 3.187 facturas (§E.2) |
| 4 | QR local con `qrcode.react` (ya está en `package.json`) | Elimina la dependencia de `api.qrserver.com` y la fuga a un tercero (§E.7.6) |
| 5 | Logo en `data:` URI resuelto en servidor | Elimina el fallo silencioso de carga (§E.7.5) |
| 6 | Credenciales Factus por organización, cifradas y leídas solo en servidor | Hoy en claro, legibles desde el navegador y sin usar (§D.5) |

---

## H. Conteo y prioridades

### H.1 Conteo

| # | Métrica | Valor |
|---|---|---|
| 1 | Generadores de documentos imprimibles | **24** |
| 2 | Que producen un PDF real | **5** (4 con jsPDF + 1 con puppeteer) |
| 3 | PDF reales que son documentos de negocio | **1** (`/api/facturas-venta/[id]/pdf`) |
| 4 | Documentos de negocio que abren `window.print()` | **13** |
| 5 | Botones que prometen un documento y no lo entregan | **7** (§E.8) |
| 6 | Plantillas distintas del mismo documento de venta | **4** |
| 7 | Implementaciones del recibo de parqueadero | **3** |
| 8 | Bloques de un documento profesional cubiertos | **7 de 17** |
| 9 | Columnas verificadas que existen y no se pintan | **32** (§B.1 y §B.2, filas `✗`) |
| 10 | Facturas de venta en la base | **3.187** |
| 11 | PDF archivados en Storage | **5** (0,16 %) |
| 12 | Facturas con CUFE (`xml_uuid`) | **0** |
| 13 | Facturas con QR (`qr_image`) | **0** |
| 14 | Jobs de facturación electrónica, todos en `pending` | **8** |
| 15 | Secuencias con resolución DIAN cargada, nunca impresa | **4 de 10** |
| 16 | Rutas `/api/factus/**` sin `getServerOrgContext` ni `withOrg` | **12 de 12** |
| 17 | Tributos DIAN en `dian_tributes` que el código puede emitir | **3 de 10** |
| 18 | Claves de documento en `messages/es.json` | **0** |
| 19 | Sitios con `'COP'` cableado | **6** |
| 20 | Plantillas que escapan HTML | **1 de 14** |

### H.2 Prioridades

**P0 — antes de tocar el diseño.** Son fallos de seguridad o de validez legal.

| # | Acción | Referencia |
|---|---|---|
| 1 | Cerrar `POST /api/facturas-venta/[id]/pdf`: sesión, organización, y **releer la factura en servidor** en lugar de confiar en el cuerpo | §E.1.1, §E.1.3 |
| 2 | Bucket `invoices` a privado con URLs firmadas | §E.1.2 |
| 3 | `POST /api/factus/auth` deja de devolver el token; `GET /api/factus/download` exige sesión y organización | §E.1.4, §E.1.5 |
| 4 | `getServerOrgContext()` en las 12 rutas de Factus | §E.1.6 |
| 5 | Corregir `mapTaxCode` y eliminar el `if/else` de cuatro ramas idénticas: el INC deja de declararse como IVA | §D.2 |
| 6 | Escribir `qr_code` y `qr_image`; ampliar `invoice_sales_status_check`; retirar `einvoice_number`/`einvoice_qr` | §D.3, §E.6 |

**P1 — el rediseño propiamente dicho.**

| # | Acción | Referencia |
|---|---|---|
| 7 | Motor único `documents/` con los 14 bloques y payload resuelto en servidor | §G.3 |
| 8 | Pie legal completo: resolución, prefijo, rango, vigencia, CUFE y QR local | §F.5, §F.14 |
| 9 | Paginación «Página X de Y» y cabecera repetida | §F.15, §E.7.1-4 |
| 10 | Desglose de impuestos con nombre real y base gravable por impuesto; retenciones | §F.9, §E.2 de la auditoría de productos |
| 11 | Bloque de sucursal emisora y datos fiscales completos de emisor y receptor | §F.2, §F.3, §F.6 |
| 12 | Pagos aplicados, vencimientos y cartera | §F.11 |
| 13 | Moneda coherente: `formatCurrency(x, doc.currency)` en todas las llamadas | §E.4.1 |
| 14 | Fechas por `formatDateInTz` / `formatPlainDate` con `organizations.timezone` | §E.3 |
| 15 | Migrar `puppeteer` a `puppeteer-core` + `@sparticuz/chromium` | §E.2 |

**P2 — deuda que el rediseño debe cerrar de paso.**

| # | Acción | Referencia |
|---|---|---|
| 16 | Unificar los tres recibos de parqueadero | §E.9.2 |
| 17 | Borrar `/api/pdf/invoice`, `generateInvoicePDF`, `downloadInvoicePDF`, `printInvoicePDF` y el `GET` de `.html` | §A.2, §E.2 |
| 18 | Quitar los datos fiscales del proveedor del ERP del pie de los documentos de cliente | §E.9.5 |
| 19 | Implementar de verdad —o retirar— los 7 botones fantasma | §E.8 |
| 20 | Llevar los rótulos de documento a `messages/` (4 idiomas ya soportados) | §E.9.4 |
| 21 | Escapar HTML en todas las plantillas | §E.1.12 |
| 22 | Importe en letras, marca de «BORRADOR» y de «COPIA», bloque de firma | §F.10, §F.13, §F.16 |
| 23 | Nota crédito y remisión sobre el mismo motor | §G.2 |
