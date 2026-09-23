# Documentos imprimibles — diseño del motor único

Rediseño en Figma de los documentos de negocio de GO Admin: **factura de venta, factura de
compra, cotización, nota crédito** y sus formatos de caja (media carta y ticket 80 mm).

- Fuente de verdad del estado actual: `docs/design/AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md` (858 líneas).
- Archivo Figma: «GO Admin — Sistema de diseño», clave `EAvjINVRnlzFM70GVoWXgl`, página **`09 Documentos`**.
- Capturas: `docs/design/figma/21-documento-*.png`.
- Fecha: 2026-09-22. Solo diseño: no se tocó código, ni base de datos, ni se hicieron commits.
- Sin nombres de organizaciones cliente: se usan «Mi empresa S.A.S.», «Distribuidora del Norte»
  y «Comercial Andina S.A.S.», todos ficticios.

---

## 1. Qué dice la auditoría, en cuatro frases

1. **Hoy no existe un PDF de negocio.** De 24 generadores, cinco producen un PDF real y ninguno de
   esos cinco es un documento de negocio (son reportes y listados con jsPDF). Los tres documentos
   del rediseño **abren una ventana con HTML y llaman al diálogo de impresión del navegador**. El
   único PDF de factura (puppeteer, `POST /api/facturas-venta/[id]/pdf`) tiene **5 objetos en
   Storage contra 3.187 facturas: 0,16 % de cobertura**.
2. **Hay cuatro plantillas divergentes del mismo documento de venta**, la **cotización se imprime
   con la plantilla de factura** (conmutada por `status === 'quotation'`) y el botón «PDF» de la
   factura de compra **descarga un `.html`** llamado `factura_compra_*.html`.
3. **De los 17 bloques de un documento profesional, solo 7 están razonablemente cubiertos.** Los
   cuatro que impiden que el documento sea legalmente utilizable son la **numeración autorizada**
   (resolución DIAN y rango), la **base gravable por impuesto y las retenciones**, el **CUFE con
   su QR** y la **paginación con cabecera repetida**.
4. **32 columnas verificadas existen en la base y no se pintan.** Además: el QR apunta a un PDF que
   casi nunca existe, la cotización corre un día por el manejo de fechas (`quotations.issue_date` es
   `date` y se renderiza con `new Date(...)`), y **todos los importes se formatean en pesos aunque
   el documento declare otra moneda**, porque `formatCurrency(x)` se llama sin el segundo argumento
   y `src/utils/Utils.ts:69` lo fija en `"COP"`.

Conteos de la auditoría que este diseño toma como requisitos: 24 generadores · 4 plantillas del
mismo documento de venta · 7 botones que prometen un documento y no lo entregan · 0 facturas con
CUFE · 0 con QR · 4 de 10 secuencias con resolución DIAN cargada y jamás impresa · 12 de 12 rutas
`/api/factus/**` sin `getServerOrgContext` · 0 claves de documento en `messages/es.json`.

---

## 2. Qué se dibujó, y dónde

Página **`09 Documentos`**, insertada antes de `99 Descartes`. Seis secciones, ninguna se solapa
con otra.

| # | Sección | Frames | Captura |
|---|---|---|---|
| 1 | Índice | 1 texto de índice | — |
| 2 | Componentes — Documentos | 7 componentes + mapa del motor | `21-documento-componentes.png` · `21-documento-diferencias.png` |
| 3 | Factura de venta — Carta | Página 1 de 2, Página 2 de 2, **Factura en USD con equivalente en pesos**, leyenda de cobertura | `21-documento-factura-venta-p1.png` · `-p2.png` · `21-documento-factura-venta-usd.png` · `21-documento-bloques-cobertura.png` |
| 4 | Variantes del motor | Compra, Cotización, Nota crédito, tabla de diferencias | `21-documento-factura-compra.png` · `21-documento-cotizacion.png` · `21-documento-nota-credito.png` |
| 5 | Estados del documento | Borrador, Anulada, Pagada, Con saldo pendiente, Sin logo | `21-documento-estado-*.png` (5) |
| 6 | Media carta y ticket 80 mm | Media carta 216×140 mm, ticket 80 mm | `21-documento-media-carta.png` · `21-documento-ticket-80mm.png` |

**Tamaños reales.** Carta = 816 × 1056 px (216 × 279 mm a 96 dpi). Media carta = 816 × 528 px
(216 × 140 mm). Ticket = 272 px de ancho, que son los **72,06 mm imprimibles** de un rollo de
80 mm según `print-agent/src/printing/paper.ts:47-65`, no los 80 mm del rollo.

**Márgenes de la carta:** 53 px arriba (14 mm), 45 px a los lados (12 mm), 68 px abajo (18 mm).
Ancho de contenido: **726 px**. Es exactamente el `@page { size: letter; margin: 14mm 12mm 18mm }`
de §G.4 de la auditoría.

### Componentes creados (Sección «Componentes — Documentos»)

| Componente | Para qué | Corrige |
|---|---|---|
| `Doc/Campo` | Par rótulo/valor: rótulo 7 px Semi Bold mayúsculas `text/muted`, valor 9 px Medium | La caja gris de 3 campos pasa a 8 campos legibles |
| `Doc/Chip de impuesto` | Etiqueta `{nombre} {tasa}` | El rótulo «IVA» cableado en `pdfService.ts:266, :296, :503, :533` |
| `Doc/Badge estado` | **14 variantes**: Borrador · Emitida · Pagada · Pago parcial · Anulada · Aceptada DIAN · Recibida · Confirmada · Enviada · Aceptada · Rechazada · Vencida · Convertida · Aplicada | Los tres catálogos distintos de venta, compra y cotización, y el bug de `pdfService.ts:212` que forzaba `status-issued` en toda cotización |
| `Doc/QR DIAN` | QR de 21×21 módulos dibujado en local | La dependencia de `api.qrserver.com` y la fuga del número, el total y el nombre del comercio a un tercero (§E.7.6) |
| `Doc/Sello de firma` | Bloque de firma con rótulo variable | Bloque 13, ausente en los tres documentos |
| `Doc/Paginación` | «Página X de Y» + identificación del documento | Bloque 15, ausente en todas las plantillas |
| `Doc/Marca de agua` | Texto a 18°, `slate/300` al 28 %; valores BORRADOR · COPIA · ANULADA · PAGADA | Bloque 16, hoy solo hay banda de anulación |

Todo el color sale de las variables de `01 Sistema` (`brand/*`, `state/*`, `text/*`, `border/*`,
`badge/*`, `bg/*`). Ningún hex suelto. Tipografía: Inter 400/500/600/700.

---

## 3. Bloques del documento y de dónde sale cada dato

Los 14 bloques del motor, con el origen exacto de cada dato. `✗` = existe en la base y **hoy no se
pinta** en ningún PDF.

### Bloque 1 · Cabecera de identidad

| Dato | Rótulo en el diseño | Tabla.columna | Hoy |
|---|---|---|---|
| Logotipo | — | `organizations.logo_url` | Sí |
| Nombre comercial | — | `organizations.name` | Sí |
| **Razón social** | bajo el nombre, 7 px | `organizations.legal_name` (**NOT NULL**) | ✗ |
| Color de marca | cabecera de tabla y total | `organizations.primary_color` | Sí, sin validar contraste |

### Bloque 2 · Datos fiscales del emisor

| Dato | Rótulo | Tabla.columna | Hoy |
|---|---|---|---|
| NIT **con dígito de verificación** | `NIT 901.456.789 - 3` | `organizations.nit` / `.tax_id` + **`.dv`** | Parcial: sin DV |
| Régimen / responsabilidades fiscales | `Responsabilidades fiscales: O-13, O-15, O-23` | `organizations.fiscal_responsibilities` (array) | ✗ en PDF (sí en ticket, `renderHtml.ts:400`) |
| Dirección | — | `organizations.address` | Sí |
| **Municipio DANE** | `Medellín, Antioquia — municipio DANE 05001` | `organizations.municipality_id` → `municipalities` | ✗ |
| País | `· Colombia` | `organizations.country` (def. `'Colombia'`) | ✗ |
| Teléfono · correo · web | — | `.phone`, `.email`, `.website` | Los dos primeros |
| **Actividad económica** | `CIIU 4771` | `organizations.economic_activity` | ✗ |
| Nombre de representación gráfica | pie legal | `organizations.graphic_representation_name` | ✗ |

### Bloque 3 · Sucursal emisora

| Dato | Rótulo | Tabla.columna | Hoy |
|---|---|---|---|
| Sucursal completa | `Sucursal emisora: Sucursal Norte — Cra 43A # 1-50, Medellín (05001) · Tel. …` | `branches.name/.address/.city/.phone/.municipality_id/.branch_code/.tax_identification` vía `invoice_sales.branch_id` (**NOT NULL**) | ✗ en los tres PDF (sí en ticket, `renderHtml.ts:401-403`) |

### Bloque 4 · Título y numeración

| Dato | Rótulo | Tabla.columna | Hoy |
|---|---|---|---|
| Tipo de documento | `Factura Electrónica de Venta` | `DocumentKind` del motor | Cableado, y la cotización usa la maqueta de factura |
| Número con prefijo | `FV-1042` + `Prefijo FV · consecutivo 1042` | `invoice_sales.number` + `invoice_sequences.prefix` | Solo el número |
| **Resolución, rango y vigencia** | pie legal | `invoice_sequences.resolution_number/.resolution_date/.range_start/.range_end/.valid_from/.valid_until` | ✗ **en ningún documento** (4 de 10 filas la tienen) |
| Estado | `Doc/Badge estado` | `invoice_sales.status` | Sí, con catálogo incompleto |

### Bloque 5 · Contraparte

| Dato | Rótulo | Tabla.columna | Hoy |
|---|---|---|---|
| Nombre | `Distribuidora del Norte S.A.S.` | `customers.full_name` (GENERATED) | Sí |
| Tipo y número de documento | `NIT (código DIAN 31)` | `.doc_type`/`.doc_number` sobre `.identification_type`/`.identification_number` | Venta sí; **cotización no** |
| **DV** | `· DV 7` | `customers.dv` | ✗ |
| **Responsabilidades fiscales** | `O-13, O-15` | `customers.fiscal_responsibilities` | ✗ en PDF (sí en ticket, `renderHtml.ts:326`) |
| **Municipio fiscal** | `Bogotá D.C. — municipio DANE 11001` | `customers.fiscal_municipality_id` → `municipalities` | ✗ |
| Régimen / tributo | `Tributo: IVA (18) · Organización jurídica: 1` | `.tribute_id` (def. 21), `.legal_organization_id` (def. 2) | ✗ |
| Proveedor (compra) | `Comercial Andina S.A.S.` | `suppliers.name/.nit/.doc_type/.dv/.tax_regime/.fiscal_responsibilities/.municipality_code/.trade_name/.contact/.credit_days/.bank_*` | Solo `name`, `nit`, `email`, `phone`, dirección |

### Bloque 6 · Metadatos del documento

Ocho campos en dos filas de cuatro (`Doc/Campo`):

| Campo | Tabla.columna | Hoy |
|---|---|---|
| Fecha de emisión **con hora** | `invoice_sales.issue_date` + `organizations.timezone` | Sin hora, sin zona |
| Fecha de vencimiento | `invoice_sales.due_date` | Sí |
| Moneda del documento | **`organization_currencies.is_base`** → `currencies` (lo mismo que usa `useOrgCurrency`); `invoice_sales.currency` solo manda cuando el documento se emite en otra moneda | Se imprime el código, pero **no se usa para formatear** |
| **Tasa de cambio y su fecha** | `currency_rates` / `exchange_rates` | ✗ — la infraestructura existe y ningún documento la usa |
| **Forma de pago** (contado/crédito) | `invoice_sales.payment_form` | ✗ |
| **Medio de pago con código DIAN** | `invoice_sales.payment_method_code` | ✗ |
| **Vendedor** | `invoice_sales.salesperson_id` | ✗ |
| Sucursal | `branches` vía `branch_id` | ✗ |
| **Condiciones de pago** | `invoice_sales.payment_terms`, `.payment_terms_id` → `payment_terms_catalog` | ✗ |

### Bloque 7 · Tabla de líneas

Ocho columnas, 726 px: `#` 22 · `Descripción` 254 · `Cant.` 40 · `Und.` 36 · `Precio unit.` 78 ·
`Dcto.` 68 · `Impuesto` 98 · `Valor` 130.

| Dato | Tabla.columna | Hoy |
|---|---|---|
| Código | `invoice_items.code_reference` | Sí, rotulado «SKU» aunque la columna sea `code_reference` |
| Descripción | `invoice_items.description` | Sí |
| **Unidad de medida** | `invoice_items.unit_measure_id` (DEFAULT **70**) | ✗ |
| Cantidad, precio | `.quantity`, `.unit_price` | Sí |
| Descuento en valor **y en porcentaje** | `.discount_amount`, `.discount_rate` | Venta sí; **compra no la pasa**, la columna sale siempre en `—` |
| **Impuesto por nombre y tasa** | `.tax_code`, `.tax_rate`, `.tribute_id` → `organization_taxes.name` / `dian_tributes.name` | Solo la tasa, bajo el rótulo fijo «IVA» |
| **Nota de línea** | `invoice_items.note` | ✗ (0 filas con contenido hoy) |
| Seriales | `.serial_numbers`, `.serial_ids` | Sí |
| **Retenciones por línea** | `.withholding_taxes` (jsonb) | ✗ (0 filas con contenido hoy) |

### Bloque 8 · Desglose de impuestos y totales

| Dato | Tabla.columna | Hoy |
|---|---|---|
| Subtotal bruto | `invoice_sales.subtotal` | Sí |
| **Descuento total** | **no es columna** de `invoice_sales` ni de `invoice_purchase`; se suma en el navegador (`DetalleFactura.tsx:496-499`). `quotations.discount_total` sí existe | Calculado en cliente |
| **Base gravable por impuesto** | `invoice_applied_taxes` / `invoice_purchase_applied_taxes` (`tax_code`, `tax_rate`, `is_applied`) | ✗ |
| Valor de cada impuesto con su nombre | ídem + `organization_taxes.name` | Un solo renglón «IVA» |
| Total impuestos | `invoice_sales.tax_total` | Sí |
| **Retenciones** — en venta **informativas y bajo el total**; en compra afectan al neto | `invoice_items.withholding_taxes` + `dian_tributes` ids 5-7 (ReteIVA, ReteRenta, ReteICA) | ✗ |
| **Anticipos** | `payments` con concepto de anticipo | ✗ |
| Nota crédito aplicada | `credit_note_applications` | Sí |
| Total y saldo | `invoice_sales.total`, `.balance` | Sí |
| **Importe en letras** | derivado del total | ✗ |

### Bloque 9 · Pagos y vencimientos

| Dato | Tabla.columna | Hoy |
|---|---|---|
| Pagos aplicados: fecha, medio, referencia, valor | `payments` (`payment_date`, `method`, `reference`, `amount`, `change_amount`) | ✗ en PDF (sí en ticket) |
| Plan de cuotas, vencimiento, mora | `accounts_receivable` (`amount`, `balance`, `due_date`, `days_overdue`) | ✗ |
| «Pagado» | hoy se calcula como `total - balance` en la plantilla (`pdfService.ts:317`) | Derivado, no leído de `payments` |

### Bloque 10 · Notas · Bloque 11 · Términos · Bloque 12 · Firma

| Dato | Tabla.columna | Hoy |
|---|---|---|
| Notas | `invoice_sales.notes`, `.description` | Solo `notes` |
| **Términos y condiciones** | `quotations.terms_conditions`. **Venta y compra no tienen columna** | Solo en cotización, y rotulado «Notas» |
| Motivo de la nota crédito (obligatorio DIAN) | motivo + factura afectada | ✗ |
| Firma | **No requiere columna nueva**: la línea se imprime siempre y la rellena a mano quien recibe. `quotations.signature_id` se conserva para la firma electrónica de la cotización | ✗ |

### Bloque 13 · Pie legal

| Dato | Tabla.columna | Hoy |
|---|---|---|
| Resolución, prefijo, rango, vigencia | `invoice_sequences` | ✗ |
| **CUFE / CUDE** | `invoice_sales.xml_uuid`, `electronic_invoicing_jobs.cufe` | ✗ (**0 facturas con `xml_uuid`**) |
| **QR DIAN** | `invoice_sales.qr_image`, `electronic_invoicing_jobs.qr_code` | ✗ — **ninguna ruta los escribe**; el ticket pinta `<img src="…&data=">` vacío (`renderHtml.ts:767`) |
| Leyenda de representación gráfica | `organizations.graphic_representation_name` | ✗ |
| Leyenda de letra de cambio (art. 774 C. Co.) | texto del motor, vía `messages/` | ✗ |

### Bloque 14 · Paginación

«Página X de Y» + identificación del documento en cada hoja, y **cabecera repetida** en la
segunda página (nombre, NIT, sucursal, cliente, tipo, número, fechas) más la **cabecera de la
tabla repetida** y la línea «Viene de la página 1 — arrastre $ X». Está dibujado en
`21-documento-factura-venta-p2.png`.

---

## 4. Qué falta en la base de datos

### 4.1 Nada que crear — solo consultar

Todo esto **ya existe y hoy no se lee** en ningún generador: razón social, DV, municipio, actividad
económica, responsabilidades fiscales y `graphic_representation_name` del emisor; la sucursal
completa; resolución, prefijo, rango y vigencia de `invoice_sequences`; CUFE (`xml_uuid`); DV,
municipio y responsabilidades del cliente; datos fiscales y bancarios del proveedor; `note` y
`withholding_taxes` por línea; `invoice_applied_taxes`; `payments`; `accounts_receivable`;
`payment_form` y `payment_method_code`; `organizations.timezone`.

### 4.2 Migraciones aditivas necesarias

Columnas `NULL`-ables o con `DEFAULT`, por el MCP de Supabase y con su reversión, según
`docs/POLITICA-MIGRACIONES.md`.

| # | Cambio | Motivo |
|---|---|---|
| 1 | `invoice_sales.discount_total numeric DEFAULT 0` y lo mismo en `invoice_purchase` | Hoy se suma en el navegador y se manda en el cuerpo del POST. `quotations` ya la tiene |
| 2 | `invoice_sales.terms_conditions text` y `invoice_purchase.terms_conditions text` | Bloque 11. `quotations` ya la tiene |
| 3 | **Rellenar** `invoice_sales.qr_image` y `electronic_invoicing_jobs.qr_code` | Existen y **ninguna ruta las escribe**; es la causa del QR en blanco del tiquete |
| 4 | Ampliar `invoice_sales_status_check` con `'sent'`, `'validated'`, `'rejected'` | El código ya los escribe y Postgres los rechaza en silencio |
| 5 | Retirar del código `einvoice_number` y `einvoice_qr` | **Columnas que no existen**: el `update` de la nota crédito falla sin que nadie mire el error |
| 6 | `invoice_documents(id, organization_id, document_kind, document_id, storage_path, page_count, generated_at, generated_by, checksum)` | Trazabilidad del PDF archivado: hoy solo hay un objeto en un bucket público sin dueño |
| 7 | Poblar `invoice_items.tribute_id` desde `organization_taxes` / `tax_templates.code` | Para que el rótulo del impuesto y el código DIAN salgan del dato, no de un `if` |
| 8 | Catálogo de retenciones reusando `dian_tributes` ids 5-7, y UI que escriba `withholding_taxes` | Hoy 0 filas con contenido y ningún mapeo |
| 9 | Cambiar el `DEFAULT 'USD'` de `currency` en `invoice_sales` e `invoice_purchase` por la **moneda base de la organización** (`organization_currencies.is_base`) | Decisión del dueño (§8.2). Hoy el default dice `'USD'` mientras el código asume pesos. **Esta migración la hace el dueño** |
| 10 | Ampliar `mapTaxCode` con `'02'` (Impuesto al Consumo) y `'05'` (ADV), y eliminar el `if/else` de cuatro ramas idénticas de `factus/invoice/route.ts:209-215` | Hoy **una línea con INC 8 % se emite como IVA al 8 %**, tarifa que no existe en Colombia |

### 4.3 Infraestructura, no esquema

| # | Cambio | Motivo |
|---|---|---|
| 1 | Bucket `invoices` a **privado** con URLs firmadas | Hoy es público y sin límite de tamaño: todo PDF archivado es legible por URL sin autenticación |
| 2 | `getServerOrgContext()` en la ruta de PDF y en las **12** rutas de Factus | Ninguna lo usa. El `POST` de PDF además **reimprime lo que le llegue en el cuerpo** y hace `upsert` con service role: conociendo el uuid de una factura ajena se sobrescribe su PDF |
| 3 | `puppeteer-core` + `@sparticuz/chromium` (o un servicio de render) | `puppeteer` está como dependencia de producción y el resultado es 0,16 % de cobertura |
| 4 | QR local con `qrcode.react` (ya está en `package.json`) | Elimina `api.qrserver.com` y la fuga a un tercero |
| 5 | Logo en `data:` URI resuelto en servidor | Elimina el fallo silencioso de carga (`page.setContent` con `networkidle0` no tiene sustituto si la imagen falla) |
| 6 | Escapar HTML en las plantillas | **1 de 14** lo hace hoy |
| 7 | Rótulos de documento a `messages/` (4 idiomas ya soportados) | **0 claves de documento** en `messages/es.json` |

---

## 5. El motor único de plantillas

### 5.1 Forma

Se extiende el patrón que ya funciona en `print-agent/src/printing/` —fuente única compartida
entre el ERP web y Go Admin Desktop, que nació precisamente porque *«antes había cinco copias de
las plantillas y siempre quedaba alguna sin actualizar»*— a los documentos en papel.

```
print-agent/src/printing/        ← ya existe: 58/80 mm, HTML + ESC/POS
documents/                       ← nuevo, mismo patrón
  ├── types.ts        DocumentPayload + DocumentKind
  │                   ('sale' | 'purchase' | 'quote' | 'credit_note' | 'delivery_note')
  ├── paper.ts        PageSpec: 'letter' | 'half_letter' | 'a4' | 'thermal_80' | 'thermal_58'
  ├── blocks.ts       Los 14 bloques, cada uno una función pura
  ├── renderHtml.ts   buildDocumentHTML(payload, pageSpec) — común a los 5 tipos
  └── resolve.ts      Consulta en SERVIDOR y arma el payload desde la base
```

### 5.2 Tres reglas no negociables

1. **El payload se arma en el servidor.** La ruta recibe `{ kind, id }`, resuelve la organización
   con `getServerOrgContext()`, lee el documento con `getServerUserClient()` y calcula los totales
   en SQL. **Nada de lo que se pinta viene del cuerpo de la petición.**
2. **Un solo motor de fechas y de moneda.** `formatDateInTz(value, org.timezone)` para
   `timestamptz` y `formatPlainDate` para `date` (regla 5 de `docs/reglas-fechas-timezone.md`), y
   `formatCurrency(x, doc.currency)` **siempre** con el segundo argumento. La moneda del documento
   sale de la **moneda base de la organización** (`organization_currencies.is_base`), nunca del
   `DEFAULT` de la columna; los decimales son los de esa moneda (COP, CLP y JPY sin decimales).
   Si el documento se emite en otra moneda, el motor **exige** la tasa y su fecha e imprime el
   equivalente en la moneda base. Ver §8.2.
3. **Ningún rótulo de impuesto cableado.** El nombre sale de `organization_taxes.name` o de
   `dian_tributes.name` vía `invoice_items.tribute_id` / `.tax_code`. El componente
   `Doc/Chip de impuesto` solo acepta `{nombre} {tasa}`.

### 5.3 Qué comparten las variantes

De los 14 bloques, **6 son idénticos** en los cinco documentos, **5 varían solo en rótulo o
contenido** y **3 definen de verdad el tipo**: numeración (4), pagos y saldo (9) y pie legal (13).
La tabla completa está dibujada en Figma (`21-documento-diferencias.png`).

| # | Bloque | Venta | Compra | Cotización | Nota crédito |
|---|---|---|---|---|---|
| 1 | Cabecera de identidad | Común | Común | Común | Común |
| 2 | Bloque fiscal del emisor | Común | Común | Común | Común |
| 3 | Sucursal emisora | Común | Común | Común | Común |
| 4 | **Título y numeración** | + resolución DIAN | Nº externo del proveedor | + vigencia | + factura afectada |
| 5 | Contraparte | Cliente (receptor) | **Proveedor (emisor real)** | Cliente (prospecto) | Cliente |
| 6 | Tabla de líneas | Común | Común | Común | Común |
| 7 | Desglose de impuestos | Común | Común | Común | Común |
| 8 | Retenciones | Practicadas por el cliente | **Practicadas al proveedor** | No | Sí |
| 9 | **Pagos y saldo** | Sí | Sí | **No** — vigencia y enlace de pago | Saldo a favor |
| 10 | Notas | Común | Común | Común | **Motivo (obligatorio DIAN)** |
| 11 | Términos y condiciones | Opcional | Opcional | **Obligatorio** | No |
| 12 | Firma | Opcional | Recibido a satisfacción | Aceptación del cliente | No |
| 13 | **Pie legal** | Resolución + CUFE + QR | Documento interno | «No es una factura» | Resolución + CUDE + QR |
| 14 | Paginación | Común | Común | Común | Común |

**Decisiones visibles en cada variante dibujada:**

- **Factura de compra.** El documento lo emite el proveedor; Mi empresa S.A.S. lo registra. Caja
  del documento en gris (`bg/subtle` + `border/strong`) y tabla en `slate/700`, no en azul de
  marca: **no es un documento fiscal propio**. Lleva número externo del proveedor, datos bancarios
  y plazo de crédito, las tres retenciones practicadas (ReteFuente, ReteIVA, ReteICA) con su base
  y su tarifa, un bloque de documento soporte, y **la columna «Dcto.» con valores** —hoy sale
  siempre en `—` porque el constructor no pasa `discount_amount`.
- **Cotización.** Vigencia, condiciones comerciales en tabla propia, anticipo requerido y saldo
  contra entrega, términos marcados como obligatorios en rojo, sello de «Aceptación del cliente».
  El QR abre `quotations.payment_link_url`, no un PDF. **El pie es explícito en rojo: no es una
  factura, no tiene CUFE, ni resolución, ni rango autorizado.** Y el badge muestra el estado real
  (Enviada), no el azul de «Emitida» que hoy se fuerza.
- **Nota crédito.** Caja de referencia destacada con la factura afectada, su CUFE, el **motivo
  DIAN** y el acta de devolución. Sin firma. Pie con resolución propia, **CUDE** y QR. Totales con
  saldo a favor del cliente y nuevo saldo de la factura.

### 5.4 Tamaños — mismo payload, distinto PageSpec

| Formato | Uso | Especificación |
|---|---|---|
| **Carta 216×279 mm — por defecto** | Venta, compra, cotización, nota crédito | `@page { size: letter; margin: 14mm 12mm 18mm }`, cabecera repetida, «Página X de Y» |
| A4 210×297 mm | Ventas fuera de Colombia | Mismo motor, `size: A4`. **Debería ser un ajuste de la organización**, no una constante |
| Media carta 216×140 mm | Reimpresión en caja, remisión | Cabecera comprimida, tabla compacta, **sin términos ni firma**; conserva resolución, CUFE, QR y desglose por impuesto |
| Ticket 80 mm | POS, pre-cuenta, factura electrónica | **Ya resuelto**: `getPaperSpec('80mm')`, 72,06 mm imprimibles, 48 caracteres por línea, negro puro |
| Ticket 58 mm | Impresoras angostas | **Ya resuelto**: 32 caracteres por línea |

Lo que cambia es el `PageSpec` y qué bloques opcionales se omiten. **Nunca los datos.**

---

## 6. Estados y marcas

| Estado | Qué se dibuja |
|---|---|
| **Borrador** | Marca de agua BORRADOR, badge gris, número `FV — sin asignar`, **sin QR**, pie que dice que no hay consecutivo ni CUFE, banda «Borrador — no válido como factura» |
| **Anulada** | Marca de agua ANULADA en rojo, banda con **fecha, responsable, motivo y documento que la reemplaza** |
| **Pagada** | Marca de agua PAGADA en verde, banda con fecha, medio y referencia del último pago, saldo $ 0 |
| **Con saldo pendiente** | Badge «Pago parcial» y banda ámbar con el saldo, la fecha de vencimiento y los **días de mora** de `accounts_receivable.days_overdue` |
| **Sin logo** | Placeholder punteado y la razón social como identidad principal. El motor **no deja el hueco** cuando `organizations.logo_url` está vacía o no carga |

---

## 7. Verificación

Script de auditoría ejecutado sobre la página `09 Documentos` (13 hojas, 2.300 nodos de texto):

| Comprobación | Resultado |
|---|---|
| Secciones que se solapan entre sí | **0** |
| Nodos de primer nivel de una sección que se solapan | **0** |
| Hijos que desbordan el borde de su hoja (tolerancia 0,5 px) | **0** |
| Textos con `textTruncation = 'ENDING'` | **0** |
| Textos con `textAutoResize = 'NONE'` (riesgo de recorte) | **0** |
| Textos colapsados (ancho o alto < 2 px) | **0** |
| Textos con `maxLines` | **0** |

Holgura vertical entre el final del cuerpo y el inicio del pie legal, por hoja: venta p.1 36 px ·
venta p.2 112 px · venta en USD 12 px · compra 2 px · cotización 15 px · nota crédito 131 px ·
estados 19-53 px · media carta 1 px. **Ninguna es negativa**, es decir: 0 desbordes.

---

## 8. Decisiones del dueño, resueltas y aplicadas (2026-09-22)

Las cinco dudas que abrió este diseño están cerradas. Lo que sigue es la decisión y **qué se
dibujó por ella**.

### 8.1 Retenciones en la factura de venta: informativas

Las practica el comprador, pero el vendedor las muestra **para que el neto a recibir cuadre**.
Se imprimen **solo cuando existen**, **bajo el total**, con la etiqueta
«**Retenciones practicadas por el comprador (informativo)**» y **sin restarlas del total a pagar**.
En la factura de compra sí afectan al neto, porque ahí las practica la organización.

Dibujado en `21-documento-factura-venta-p2.png`, columna de totales:

```
Total a pagar                                        $ 9.262.140
Retenciones practicadas por el comprador (informativo)  -$ 294.096
Neto a recibir tras retenciones                      $ 8.968.044
Pagos aplicados                                     -$ 3.700.000
Saldo pendiente                                      $ 5.562.140
```

La tabla de detalle de retenciones (concepto, base, tarifa, valor) lleva al pie la aclaración:
*«Las practica el comprador al pagar. No se restan del total a pagar de esta factura; se muestran
para que cuadre el neto a recibir.»* En `21-documento-factura-compra.png` la misma tabla se titula
«Retenciones practicadas al proveedor» y **sí** se descuentan: el total se rotula
«Neto a pagar al proveedor».

### 8.2 Moneda: la base de la organización, y la divisa como excepción declarada

Decisión del dueño, textual: *«la plataforma trabaja con la moneda principal de la organización
que elige; si la organización quiere emitir cotizaciones o facturas en dólares, que exista la
opción, pero lo normal es su moneda principal»*.

Reglas del motor:

1. Todo documento se imprime en la **moneda base de la organización**
   (`organization_currencies.is_base`, lo mismo que ya usa `useOrgCurrency`), **nunca** en el
   `DEFAULT` de la columna.
2. Si el documento se emite en **otra moneda**, la cabecera lo declara y el documento lleva el
   **equivalente en la moneda base con su tasa y la fecha de la tasa**, porque la DIAN lo exige
   (art. 868 del Estatuto Tributario) y el cliente lo necesita.
3. Los importes se formatean con **los decimales de su moneda**: COP, CLP y JPY sin decimales;
   USD y EUR con dos.

Dibujado en `21-documento-factura-venta-usd.png` (hoja carta completa, FV-1043):

- Etiqueta sólida en la caja del documento: «**EMITIDA EN USD · EQUIVALENTE EN COP**».
- Dos campos nuevos en los metadatos: «Moneda del documento: USD · Dólar estadounidense» y
  «Tasa de cambio: TRM 3.168,55 del 22/09/2026».
- Banda «Documento emitido en moneda extranjera» que nombra las dos monedas, sus decimales y la
  tasa aplicada.
- Todos los importes de líneas, desglose y totales en `USD 1,234.56`.
- Bajo el total, una segunda caja en `brand/deep`:
  «Equivalente · TRM 3.168,55 del 22/09/2026 → **$ 72.996.326**».
- Importe en letras en dólares (`VEINTITRÉS MIL TREINTA Y SIETE DÓLARES ESTADOUNIDENSES CON
  77/100`) y, debajo, el equivalente en pesos en letras.
- Pie legal con la leyenda de conversión y el recordatorio de que **el valor que se declara a la
  DIAN es el convertido a pesos**.

**Deuda anotada:** `invoice_sales.currency` tiene `DEFAULT 'USD'` mientras el código asume pesos.
Hay que cambiar el default a la moneda base de la organización — es el punto 9 de §4.2 y
**la migración la hace el dueño**.

### 8.3 Firma: espacio siempre, pero discreto

Una línea de firma y sello con nombre y documento de quien recibe, **en todas las ventas**: sirve
de acuse de entrega en físico y no estorba en el PDF. En cotización el rótulo es «Aceptación del
cliente». **No se crea ninguna columna**: el dato lo pone a mano quien firma.

| Documento | Dónde | Rótulo |
|---|---|---|
| Factura de venta (carta) | Pie del cuerpo, junto a notas y términos | Recibido a satisfacción · Nombre · C.C. · Fecha |
| Factura de venta en USD | Igual | Recibido a satisfacción |
| Media carta | **Línea en el pie legal**, junto a la resolución y el CUFE | Recibido a satisfacción · Nombre · C.C. · Fecha |
| Factura de compra | Pie del cuerpo | Recibido a satisfacción · Nombre · C.C. · Fecha de recibo |
| Cotización | Pie del cuerpo | Aceptación del cliente · Nombre · C.C. · Cargo · Fecha |
| Nota crédito | **No lleva** | — |
| Ticket 80 mm | **No lleva**: no hay ancho útil y es un comprobante de caja | — |

### 8.4 Carta por defecto

**Carta (216 × 279 mm) es el tamaño por defecto**, porque Colombia es el mercado principal. **A4
queda como variante del `PageSpec`** para cuando se venda fuera, y el tamaño **debería ser un
ajuste de la organización**, no una constante del código (hoy es `format: 'letter'` cableado en
puppeteer y `max-width: 800px` sin `@page` en todo lo demás). Anotado en §5.4 y en el subtítulo de
la sección «Media carta y ticket 80 mm» de Figma.

### 8.5 La factura de compra se queda en gris

Es correcto que el documento del proveedor **no parezca un documento fiscal propio**: caja del
documento en `bg/subtle` con borde `border/strong`, regla y cabecera de tabla en `slate/700`, y
total en gris en lugar de Azul GO. Se le añadió en la cabecera la etiqueta
«**DOCUMENTO RECIBIDO DE UN TERCERO**» en ámbar (`state/warning-subtle` + `border/warning`), sobre
el número, para que no quede duda. Ver `21-documento-factura-compra.png`.

---

## 9. Etiquetas de producto — el mismo motor, otro `PageSpec` (2026-09-22)

Encargo del dueño: imprimir etiquetas de producto con código de barras, para que el lector del POS
funcione con códigos propios en vez de depender del código de fábrica. **No se crea un motor
nuevo.** La etiqueta es una variante del motor descrito en §5: mismo `resolve.ts` en servidor,
mismo `renderHtml.ts`, mismas reglas de fecha y de moneda. Lo único que se añade es un `PageSpec`
de etiqueta y un bloque de etiqueta.

Figma: página `09 Documentos`, Secciones «Componentes — Etiquetas (Nuevo)» y «Etiquetas de producto
(Nuevo)». Capturas `docs/design/figma/31-etiquetas-componentes.png` y `31-etiquetas-plantilla.png`.
Tabla de paridad completa en `docs/design/PARIDAD-ETIQUETAS-CATEGORIA.md`.

### 9.1 Qué se añade al motor

```
documents/
  ├── paper.ts        + 'label_letter_3x8' | 'label_a4_3x8' | 'label_roll_50x25'
  ├── types.ts        + DocumentKind 'product_label'  ·  LabelPayload
  ├── blocks.ts       + labelBlock(payload, spec)  — función pura, no consulta
  └── resolve.ts      + resolveProductLabels({ productIds, branchId }) en SERVIDOR
```

Reglas que **no** cambian (§5.2): el payload se arma en el servidor con `getServerOrgContext()` y
`getServerUserClient()`; el precio pasa por `formatCurrency(x, moneda_base)` con la moneda de
`organization_currencies.is_base`; la fecha por `formatDateInTz(value, org.timezone)`. El bloque
recibe el payload y no consulta nada.

### 9.2 Los tres formatos

| `PageSpec` | Medidas | Rejilla | Uso |
|---|---|---|---|
| `label_letter_3x8` | Carta 216 × 279 mm · etiqueta **63,5 × 33,9 mm** | 3 × 8 = **24 por hoja** | Papel troquelado corriente. Por defecto |
| `label_a4_3x8` | A4 210 × 297 mm · etiqueta **70 × 37 mm** | 3 × 8 = **24 por hoja** | Fuera de Colombia |
| `label_roll_50x25` | Rollo continuo · etiqueta **50 × 25 mm** | 1 por página, sin márgenes | Impresora térmica de etiquetas, por la misma cola `print_jobs` que el ticket |

La hoja admite **«empezar en la casilla N»**: sin eso, una hoja ya empezada se desperdicia.

### 9.3 Qué datos necesita la etiqueta y de dónde salen

| Zona | Dato | Tabla y columna | Estado |
|---|---|---|---|
| 1 | Nombre del producto | `products.name` | Existe |
| 2 | Variante («Talla 42 · Negro») | `products.variant_data` (jsonb) y `variant_values.value` vía `product_variant_relations` | Existe |
| 3 | Código de barras | `products.barcode` **de esa fila** | Existe, casi vacío (5,6 %) |
| 4 | SKU | `products.sku` | Existe |
| 5 | Precio | `product_prices` vigente por `effective_from` / `effective_to` | Existe |
| — | Moneda y decimales | `organization_currencies.is_base` | Existe |
| — | Sucursal | `branches.name` de la sucursal del encabezado | Existe |
| — | Fecha de impresión | `now()` con `formatDateInTz(org.timezone)` | Existe |
| — | Emisor (variante de vitrina) | `organizations.name` | Existe |

La **variante «sin precio»** se usa para vitrina y para el producto cuyo precio no es el mismo en
todas las sucursales: imprimir uno solo sería mentir en el mostrador.

### 9.4 Código de barras por variante — lo que falta

**No hace falta una columna nueva.** No existe tabla `product_variants`: la variante es una fila de
`products` con `parent_product_id`, así que **ya tiene su propia columna `barcode`**. Lo que falta
es otra cosa, y es lo que hoy rompe el cobro:

1. **Dejar de heredar el código del padre.** Si el campo se deja vacío, el alta de variante copia el
   del producto padre (`nuevo/Variantes.tsx:793-799`, `NuevoProductoForm.tsx:508`). Dos tallas
   acaban con el mismo código y la caja cobra la primera que encuentra.
2. **Índice único parcial** sobre `products (organization_id, barcode)` donde el código no sea nulo
   ni vacío. Hoy no hay ninguno: medido el 2026-09-22, **176 códigos están repetidos dentro de su
   propia organización**. Hay que limpiarlos antes de crear el índice.
3. **Ampliar `idx_products_barcode_trgm`**, hoy filtrado por `WHERE (parent_product_id IS NULL)`:
   el índice de búsqueda por código **excluye a las variantes**, que es justo donde está el caso
   real.
4. **`organization_barcode_settings`** — prefijo interno, formato por defecto, longitud y prefijo
   GS1 si lo hay. No existe ninguna columna de prefijo fuera de `invoice_sequences` y
   `sale_sequences`.
5. **`barcode_sequences`** — correlativo por organización, a imagen de `invoice_sequences`. Sin
   correlativo la única alternativa es el azar, que es lo que hace el código de hoy:
   `generateBarcode()` produce **12 dígitos aleatorios más su dígito de control**
   (`nuevo/InformacionBasica.tsx:177-182` y `id/tabs/DetallesTab.tsx:142-150`, duplicado), es decir
   un EAN-13 formalmente válido **dentro del rango GS1 de otro fabricante**, sin comprobar unicidad.
   Por eso el diseño propone **Code128 interno** por defecto y EAN-13 solo con prefijo GS1 propio.
6. **Ampliar el `CHECK` de `print_jobs.job_type`** con `'product_label'`. De paso: el código ya
   inserta `'shipment_guide'` (`printJobsService.ts:860`) y ese valor **tampoco está en el CHECK**.

Todas son migraciones aditivas. Ninguna se aplicó.

### 9.5 El código de barras se dibuja con el paquete instalado, no con un CDN

`jsbarcode@3.12.3` está en `package.json:80` y **no se importa en ninguna parte**. Los dos únicos
sitios que lo usan lo cargan desde `cdn.jsdelivr.net` en tiempo de ejecución
(`usePrintPreview.ts:88-99` y `shipmentLabelPrinter.ts:500-549`). Una etiqueta que necesita internet
para imprimirse no sirve en una caja sin red: el bloque de etiqueta debe usar el paquete instalado,
igual que el resto del motor.

---

## 10. Orden de compra — otra variante del mismo motor (2026-09-23)

Página `09 Documentos`, sección «Orden de compra — PDF (Nuevo)», debajo de todo lo anterior:
**Carta (enviada)**, **A4 (enviada)** y **Carta (borrador)**. Capturas:
`figma/33-oc-pdf-carta.png`, `33-oc-pdf-a4.png`, `33-oc-pdf-carta-borrador.png`.

Hoy no existe: ninguna ruta ni servicio imprime una orden de compra
(`AUDITORIA-CARTERA-ORDENES-COMPRA.md` §I.7).

### 10.1 De qué variante parte

De la **cotización**, no de la factura de compra. Las dos son documentos que **emite Mi empresa
S.A.S. hacia un tercero** y ninguno es fiscal: tabla en azul de marca, sin CUFE, sin QR DIAN y con
pie «no es una factura». La factura de compra, en cambio, la emite el proveedor y va en gris
(§8.5). Se clonó el frame aprobado y se cambiaron solo los datos y los bloques que definen el tipo.

### 10.2 Qué cambia bloque por bloque

| # | Bloque | Orden de compra |
|---|---|---|
| 4 | Título y numeración | «Orden de compra · OC-131», prefijo OC, documento comercial. Sin QR: el hueco lo ocupa «Confirme la orden» con el correo de compras |
| 5 | Contraparte | **Proveedor (destinatario)**: razón social, NIT y DV, dirección, contacto y plazo de crédito |
| 6 | Metadatos | Fecha de emisión, **entrega esperada**, moneda, **comprador**, **entregar en** (sucursal), dirección de entrega, condición de pago, anticipo pactado |
| 7 | Líneas | «Costo unit.» en lugar de «Precio unit.»; la descripción lleva la **variante** (talla y color) y la marca de seguimiento (con serial, con lote y vencimiento) y la referencia del proveedor |
| 8 | Retenciones | **No se practican en la orden**: se calculan en la factura del proveedor. El desglose muestra solo impuestos estimados por tarifa del renglón |
| 9 | Pagos y saldo | Sustituido por «Condiciones de la compra»: entrega, lugar, rotulado de seriales y lotes, flete; y en totales «Anticipo pactado» y «A pagar con la factura · 30 días» |
| 11 | Términos | Aceptación tácita a los 2 días hábiles; cambios de cantidad o costo exigen una orden modificada |
| 12 | Firma | «Aceptación del proveedor» |
| 13 | Pie legal | «Esta orden de compra NO es una factura ni un documento soporte: no genera obligación tributaria.» |

### 10.3 Tamaños y estados

- **Carta por defecto** (§8.4). **A4** con el mismo payload y otro `PageSpec` (`a4`): márgenes
  laterales de 9 mm para conservar la rejilla de 726 px y el pie baja 67 px.
- **Borrador**: marca de agua BORRADOR, «Sin consecutivo», estado «Borrador» y pie «no enviado al
  proveedor». Se descarga, pero no se envía.
- **Enviada** es el estado en que el PDF sale hacia el proveedor (al pasar la orden a `sent`).

### 10.4 De dónde sale cada dato y qué falta

`purchase_orders` + `purchase_order_items` + `suppliers` + `products` (`variant_data`,
`track_serial`) + los bloques comunes del motor (`organizations`, `branches`). Faltan en la base
(`AUDITORIA-CARTERA-ORDENES-COMPRA.md` §I.9): **consecutivo por organización** (D7: hoy «OC-129»
es el id global), **impuesto, descuento y referencia del proveedor por renglón** (D6: hoy la orden
no guarda impuesto) y la marca de lote del producto (D4). Ruta propuesta:
`GET /api/inventario/ordenes-compra/[uuid]/pdf`, que empieza por `getServerOrgContext()` y usa
`buildDocumentHTML(payload, pageSpec)` como las demás variantes del motor.
