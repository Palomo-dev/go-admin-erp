# Finanzas — bloque DOCUMENTOS: estado real y propuesta en Figma

Fecha: 2026-09-23 · Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`),
página **`07 Finanzas`** (`264:98915`) y **`02 Componentes`** (`3:2`).

Alcance: facturación electrónica (configuración, resoluciones y numeración, bandeja de envíos,
eventos RADIAN), documentos soporte, notas crédito y débito, cotizaciones, cuentas por cobrar y
por pagar con el `RegistrarPagoDialog` único y el estado de cuenta, y los documentos impresos.
Rutas: `src/app/app/finanzas/{facturacion-electronica,documentos-soporte,notas-credito,cotizaciones,cuentas-por-cobrar,cuentas-por-pagar}/**`,
`src/app/api/factus/**`, `src/lib/services/{factusService,factusTokenManager,notasCreditoService,cotizacionesService,pdfService}.ts`.

Fuentes que **no se repiten** (se citan por sección): `AUDITORIA-CONTROLES-FINANZAS.md` §B.8–B.16,
§C.1–C.5, §G.4, §H · `AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md` §D · `AUDITORIA-CARTERA-ORDENES-COMPRA.md` ·
`DOCUMENTOS-PDF.md` · `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md` §A.4 y §B · `PARIDAD-FACTURAS.md` ·
`PARIDAD-CARTERA-ORDENES-COMPRA.md` · `SISTEMA-BADGES.md` §4.

Sin nombres de organizaciones cliente: la evidencia va en conteos. Datos de las pantallas,
ficticios («Mi empresa S.A.S.», «Distribuidora del Norte S.A.S.», «Laura Gómez»…).

---

## 0. Resumen

- **Hoy la facturación electrónica nunca ha emitido un documento.** Hay 8 envíos en cola desde
  hace 19 a 43 días, con 0 intentos, sin datos de envío y sin nada que los procese (no hay cron).
  0 aceptados, 0 rechazados: **no existen motivos de rechazo que contar**. La configuración por
  organización está guardada en texto plano y no se usa: se emite con una sola cuenta del proveedor
  para todas las organizaciones, sacada de variables de entorno.
- Se dibujaron **10 Secciones nuevas en `07 Finanzas` (107 frames)** en una columna propia
  (x = 14.000), y **7 componentes nuevos + 5 variantes** en `02 Componentes`, entre ellos
  `RegistrarPagoDialog` (el diálogo único de pago) y `DocumentoImpreso` (10 variantes).
- Chequeo por script: 0 solapes, 0 nodos fuera de Sección, 0 instancias rotas, 0 anotaciones
  dentro de frames, 0 textos truncados reales (§5). El cupo del MCP de Figma se agotó dos veces:
  quedaron 17 capturas, no una por frame.

---

## 1. Estado real hoy, por página

Verificado el 2026-09-23 en código (commits hasta `d8a46e07`) y en la base (solo `SELECT`).
Leyenda: **funciona** · **a medias** · **roto** · **no existe**.

### 1.1 Facturación electrónica

| Pieza | Estado | Evidencia | Nota |
|---|---|---|---|
| Configuración del proveedor | **roto** (decorativa) | `factusTokenManager.ts:16-28`; `electronicInvoicingConfigService.ts:5,22-49`; `FacturacionConfigPanel.tsx:74-81` | Se emite con `FACTUS_*` de entorno: **una cuenta para todas las organizaciones**. La tabla guarda secretos en claro y se leen desde el navegador. En la base, `electronic_invoicing_config` tiene **0 filas** |
| Ambiente pruebas / producción | **no existe** en la práctica | `factusTokenManager.ts:21` | Solo `FACTUS_ENVIRONMENT`. El selector se guarda y nadie lo lee |
| `/facturacion-electronica/configuracion` | **no existe** | `facturacion-electronica/page.tsx:284` | El botón «Configuración» lleva a un 404. La configuración real vive en `/app/configuracion` › facturación |
| Sincronizar rangos | **a medias** | `FacturacionConfigPanel.tsx:127-161, 138, 189` | Copia rangos del proveedor a `invoice_sequences` **desde el navegador**; sin sucursal usa **la sucursal 2** |
| Qué rango usa al emitir | **a medias** | `invoice/route.ts:95-101`; `electronicInvoicingService.ts:335-341` | Por organización + tipo, **sin sucursal**, con `maybeSingle`: con dos rangos activos del mismo tipo falla. **Hoy hay 2 combinaciones organización+tipo con más de un rango activo.** `fn_get_next_invoice_number` (por sucursal) no la llama nadie |
| `GET /api/factus/numbering-ranges`, `acquirer`, `support-document/download` | funcionan **sin autenticación** | `numbering-ranges/route.ts:5,36-52`; `acquirer/route.ts:15-19`; `support-document/download/route.ts:8-10` | El middleware excluye `/api/factus/` (`middleware.ts:155`) |
| `POST /api/factus/auth` | funciona | `auth/route.ts:26,39-41` | Ya pide sesión y no devuelve el token |
| `POST /api/factus/invoice` | funciona, con defecto | `invoice/route.ts:29,120-128`; `electronicInvoicingService.ts:70-82,153-168` | Usa `withOrg`. `sendToFactus` crea un job `pending` sin datos y la ruta crea otro. Los 8 pendientes tienen la forma del primero (sin `request_payload`) y no hay dos jobs por factura: la ruta no llegó a crear el suyo |
| `credit-note` | **roto a medias** | `credit-note/route.ts:80-110,146-154` | Escribe `einvoice_number` y `einvoice_qr`, **que no existen en `invoice_sales`** (verificado): el update falla sin revisar el error y **el CUFE de la nota no se guarda**. No envía `numbering_range_id` |
| `debit-note` | API sin pantalla | `debit-note/route.ts:11` | Ningún componente la llama |
| `support-document` | **a medias** | `support-document/route.ts:29-57,90-100,158-161,464-471` | Organización **tomada del body**; el DELETE borra en el proveedor **antes** de validar la organización; impuesto `'01'` fijo |
| `download` | **a medias** | `download/route.ts:24-50`; `factusService.ts:446,483` | Ya pide sesión. Solo sabe descargar facturas: NC y ND no |
| `jobs` (listar, reintentar, cancelar) | **a medias** | `jobs/route.ts:14-27` | «Reintentar» solo cambia el estado: nada lo procesa después |
| `process-pending` | **roto** | `process-pending/route.ts:24-102`; `vercel.json`; `cron.job` | Ningún cron la llama (ni Vercel ni `pg_cron`); solo expone `POST` (Vercel Cron llama con `GET`); ignora `max_attempts` y `next_retry_at`; siempre llama al endpoint de facturas aunque sea NC o DS |
| `webhook` | **roto** | `webhook/route.ts:33-67` | La firma HMAC ya está bien, pero busca por `electronic_invoicing_jobs.reference_code`, **columna que no existe** (verificado): nunca encuentra el job |
| QR DIAN | **no se guarda** | `AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md` §D.3 | `qr_code` y `qr_image` nunca se escriben |
| Eventos RADIAN (030–034) | **no existe** | grep sin resultados | Ni código ni tablas |

### 1.2 Documentos soporte, notas, cotizaciones

| Pieza | Estado | Evidencia | Nota |
|---|---|---|---|
| Documentos soporte: listado, nuevo, detalle | **a medias** | §B.13–B.15 | 0 documentos en la base. Sin sucursal, sin edición de borrador, sin enlace a la compra (el id se guarda, `SupportDocumentDetail.tsx:53`) |
| Crear nota crédito | funciona, **no es atómica** | `NotaCreditoDialog.tsx:129-595` | Por líneas (con casilla y cantidad) o por valor (impuesto 0 fijo). Varios pasos desde el navegador: cabecera, líneas, saldo, cartera |
| IVA de la nota y excedente (F-56, F-58) | funcionan | migración `20260923082445`; `notasCreditoService.ts:494` | `fn_recalc_invoice_totals` conserva el IVA negativo; el excedente sobre factura pagada va a saldo a favor o devolución |
| «Descargar PDF» de la nota | **roto** | `NotaCreditoDetalle.tsx:199-201` | Solo muestra un aviso |
| `/notas-credito/nuevo` y notas débito | **no existe** | — | 28 notas crédito en la base (26 emitidas, 2 anuladas), **ninguna enviada a la DIAN**; 0 notas débito |
| Cotización → factura | **a medias** | `cotizacionesService.ts:408-517` | Desde el navegador, sin RPC; número `FACT-####` calculado leyendo la última factura (riesgo de choque); no copia `invoice_applied_taxes` ni el descuento total |
| Enviar cotización por correo | **roto** | `DetalleCotizacion.tsx:170-186` | Solo cambia el estado a `sent`. En la base: 7 cotizaciones (4 convertidas, 3 enviadas) |

### 1.3 Cartera, pagos y documentos impresos

| Pieza | Estado | Evidencia | Nota |
|---|---|---|---|
| Pago en cuentas por cobrar y por pagar | funcionan, **sin unificar** | CxC `cuentas-por-cobrar/service.ts:268`; CxP `CuentasPorPagarService.ts:438`; factura `RegistrarPagoDialog.tsx:189,239` | No existen `shared/pagos/RegistrarPagoDialog`, `fn_registrar_pago` ni `POST /api/pagos` |
| Un pago para varias facturas | **no existe** | — | **125 clientes tienen más de una cuenta por cobrar abierta**; hay 4 referencias de pago repetidas en facturas distintas (recibos múltiples hechos a mano) |
| Estado de cuenta (PDF) | **no existe** | — | Solo dos `.txt` de una cuenta. `DocumentKind` existe pero es la vista previa del POS (`usePrintPreview.ts:26`) |
| PDF de factura | **a medias** | `api/facturas-venta/[id]/pdf/route.ts` | Puppeteer con sesión y organización verificadas. El PDF oficial del proveedor solo existe si la DIAN aceptó (hoy, ninguna) |
| PDF de NC, cotización, documento soporte | NC ninguno · cotización `window.print` · DS solo el del proveedor | — | — |
| Recibo de pago (carta o ticket 80 mm) | **no existe** | `print-agent` | El agente imprime venta, pre-cuenta, comanda, guía y factura electrónica; nada de pagos |
| Permisos `finance.*` en estas rutas | **no existe** | grep | Solo la compuerta de módulo (`middleware.ts:377`) |

---

## 2. Lo que dice la base de datos (solo `SELECT`, 2026-09-23)

### 2.1 Envíos a la DIAN

| Qué | Conteo |
|---|---|
| `electronic_invoicing_jobs` | **8**, todos `invoice` · `pending` · `attempt_count 0/5` · `next_retry_at`, `request_payload` y `response_payload` en NULL. 2 organizaciones; el más viejo tiene 43 días, el más nuevo 19; las 8 facturas ya están `paid`. Ninguna factura tiene dos jobs |
| Aceptados · rechazados · fallidos | **0 · 0 · 0** |
| Motivos de rechazo más comunes | **No hay**: 0 filas con `error_code` o `error_message`, 0 filas en `electronic_invoicing_events` |
| `electronic_invoicing_config` | 0 filas (las 2 organizaciones con jobs tampoco tienen configuración) |
| `support_documents` | 0 filas |
| Cron que procese la cola | ninguno (`cron.job` y `vercel.json` revisados) |

### 2.2 Resoluciones — el modelo ya existe

`invoice_sequences` (RLS por pertenencia y por sucursal) ya tiene `resolution_number`,
`resolution_date`, `prefix`, `range_start/end`, `current_number`, `valid_from/until`,
`technical_key`, `test_set_id`, `is_active`, `alert_threshold` y `factus_numbering_range_id`.

| Tipo | Filas | Organizaciones | Con resolución | Vigentes |
|---|---|---|---|---|
| `invoice` | 2 | 2 | 2 | 1 (la otra sin fecha de fin) |
| `credit_note` | 4 | 2 | 0 (correcto: no la requiere) | — |
| `debit_note` | 2 | 2 | 0 | — |
| `support_document` | 2 | 2 | 2 | 2 |

### 2.3 Seguridad

`electronic_invoicing_config` guarda `client_secret` y `password` en `text` con una política `ALL`
para `public` que deja leerlas a **cualquier miembro** de la organización. Hoy vacía; el día que se
llene, el secreto viaja al navegador.

### 2.4 Cartera

`accounts_receivable`: 521 al día · 215 vencidas · 71 parciales · 2.579 pagadas (20 organizaciones).
`accounts_payable`: 51 pendientes · 6 parciales. Cuotas: 3 filas en `ar_installments` y 3 en
`ap_installments`. Saldos a favor activos: 4. Pagos completados por origen: `invoice_sales` 2.493 ·
`web_order` 175 · `sale` 64 · `account_receivable` 60 · `pms` 15 · `account_payable` 5 ·
`invoice_purchase` 4 · `credit_note` 2.

---

## 3. Qué se dibujó

### 3.1 Componentes nuevos — `02 Componentes` › Sección «Finanzas — Documentos (Nuevo)» (`729:17880`)

| Componente | id | Variantes | Para qué |
|---|---|---|---|
| `DianTimeline` | `729:18030` | `Estado` aceptado · rechazado · error · en-cola · agotado | Línea de tiempo del envío: creado → enviado (intento n de 5) → respuesta en lenguaje humano → reintento o acción. Reemplaza los dos historiales incompatibles de hoy |
| `DianPanel` | `729:18575` | `Estado` aceptado · rechazado · pendiente · error · sin-fe | Tarjeta lateral de todo detalle: `FactusStatusBadge`, CUFE/CUDE/CUDS con copiar, QR local (`Doc/QR DIAN`), número DIAN, línea de tiempo, motivo del rechazo y la acción que toca |
| `RangoNumeracion` | `729:18826` | `Estado` vigente · por-agotar · agotada · vencida × `Layout` fila · tarjeta | Resolución con consumo (`Progress`) y vigencia |
| `SeleccionLineasNota` | `730:18795` | `Modo` por-líneas × `State` default · excede | Líneas de la factura con casilla, cantidad a acreditar ≤ facturado − ya acreditado, **impuesto de cada línea**, totales de la nota |
| `RepartoPago` | `730:19157` | `State` una · varias · sobrante · excede | Facturas abiertas del tercero con «Aplicar a las más antiguas», monto por fila y sobrante a saldo a favor con casilla explícita |
| `RegistrarPagoDialog` | `730:20644` | `Destino` factura · cuenta · tercero × `Layout` desktop · sheet × `State` default · sobrante · efectivo · sin-caja · excede · error (9) | **El diálogo único** de `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md` §A.4 |
| `DocumentoImpreso` | `731:21879` | `Tipo` factura · nota-crédito · nota-débito · doc-soporte · cotización · recibo · estado-cuenta × `Formato` carta · ticket-80 × `Estado` normal · borrador · anulado (10) | Documento imprimible único, carta 816×1056 y ticket de 272 px, con logo, NIT-DV y color de la organización; construido con los `Doc/*` de `09 Documentos` |
| `ChipDocumento` (ampliado) | `680:406423` | +5 `Tipo`: Cotización, Nota débito, Doc. soporte, Recibo, Asiento (`729:18827`, `:18836`, `:18845`, `:18854`, `:18863`) | Eslabones de la cadena de documentos |

`AplicarPagoDialog` (`413:13096`) **no se tocó por dentro**, para no romper sus ~20 instancias en
las Secciones de facturas y cartera. Su descripción ahora dice que está sustituido por
`RegistrarPagoDialog` (`Destino=factura` o `cuenta`). El cambio de instancias queda para quien sea
dueño de esas Secciones.

Reutilizados tal cual: `PageHeader`, `DocumentHeader`, `DocumentStatusBadge`, `FactusStatusBadge`,
`DocumentLinesTable`, `DocumentTotals`, `SupplierPicker`, `CustomerPicker`, `ProductPicker`
(instanciado por variante), `CadenaDocumento` / `EslabonDocumento`, `TableCell`, `StatCard`,
`KpiCompacto`, `FilaDato`, `SearchBar`, `FilterButton`, `Chip`, `Pagination`, `BulkActionBar`,
`EmptyState` (empty · search · error · forbidden), `Skeleton`, `ConfirmDialog`, `Toast`, `FormField`,
`NumberInput`, `Checkbox`, `Switch`, `SegmentedControl`, `Progress`, `Badge`, `Button`, `IconButton`,
`PhoneInput`, `Sidebar`, `AppHeader`, `MobileHeader`, `MobileTabBar`, `Marca/Nuevo` y los `Doc/*`.
Colores: variables de `01 Sistema`; tipografía Inter.

### 3.2 Pantallas — `07 Finanzas`, columna x = 14.000

Escritorio 1440 (alto según contenido, convención D5) y móvil 390×844. Cada frame lleva encima,
**fuera del frame**, una nota con su código y qué corrige.

| # | Sección | id | Frames (id) |
|---|---|---|---|
| 13 | Documentos — Facturación electrónica: configuración | `733:29525` | E1 vacío con primer paso `733:29527` · E2 pruebas `733:29837` · E3 producción `733:30374` · E4 diálogo pasar a producción `733:30916` · E5 error de conexión `733:30918` · E6 sin permiso `733:31440` · E7 cargando `733:31756` · M1 móvil `733:32048` |
| 14 | Documentos — Resoluciones y numeración | `733:32325` | R1 listo `733:32327` · R2 nueva resolución `733:33103` · R3 sincronizar `733:33195` · R4 vacío `733:33197` · R5 sin resultados `733:33492` · R6 cargando `733:33885` · R7 error `733:34216` · R8 sin permiso `733:34528` · M1 `733:34839` |
| 15 | Documentos — Bandeja de envíos DIAN | `735:33546` | B1 listo (con la banda del caso real: 8 en cola sin intento) `735:33548` · B2 selección en lote `735:34957` · B3 hoja de detalle con impuestos enviados `735:36373` · B4 reintentar `735:36566` · B5 vacío sin configurar `735:36568` · B5b vacío sin envíos `735:36917` · B6 sin resultados `735:37266` · B7 cargando `735:37719` · B8 error `735:38152` · B9 sin permiso `735:38518` · RADIAN fase 2 `735:38888` · M1 `735:39721` · M2 detalle `735:40002` |
| 16 | Documentos — Documentos soporte | `736:37082` | S1 listo `736:37084` · S2 vacío `736:38173` · S3 sin resultados `736:38524` · S4 cargando `736:38961` · S5 error `736:39377` · S6 sin permiso `736:39745` · S7 nuevo `736:40117` · S8 editar borrador `736:40942` · S9 detalle aceptado `736:41752` · S10 detalle rechazado `736:43092` · S11 enviar `736:43949` · S12 eliminar borrador `736:44016` · M1 `736:44018` · M2 `736:44280` |
| 17 | Documentos — Notas crédito y débito | `738:41958` | N1 listo `738:41960` · N2 elegir factura `738:43325` · N3 crear por líneas `738:43675` · N4 excede `738:44016` · N5 anular factura con nota `738:44234` · N6 nota débito `738:44453` · N7 detalle aceptada `738:44455` · N8 detalle rechazada `738:45447` · N9 vacío `738:46259` · N10 sin resultados `738:46611` · N11 cargando `738:47045` · N12 error `738:47462` · N13 sin permiso `738:47831` · M1 `738:48204` · M2 crear por pasos `738:48462` |
| 18 | Documentos — Cotizaciones | `739:45972` | C1 listo `739:45974` · C2 vacío `739:47056` · C3 sin resultados `739:47409` · C4 cargando `739:47848` · C5 error `739:48266` · C6 sin permiso `739:48636` · C7 detalle enviada `739:49010` · C8 detalle convertida `739:49846` · C9 convertir en factura `739:50790` · C10 enviar `739:50870` · C11 nueva `739:50872` · M1 `739:51838` · M2 `739:52104` |
| 19 | Documentos — Cuentas por cobrar | `740:49673` | X1 detalle con cuotas `740:49675` · X1b pago de cuota `740:51002` · X2 cartera del cliente `740:51004` · X2b pago a varias facturas con sobrante `740:52151` · X3 estado de cuenta (descargar/enviar por WhatsApp) `740:52422` · X4 sin resultados `740:52424` · X5 sin permiso `740:52867` · X6 móvil `740:53238` |
| 20 | Documentos — Cuentas por pagar | `740:53505` | Y1 detalle con cuotas · Y1b pago de cuota a proveedor · Y2 cuentas del proveedor · Y3 estado de cuenta del proveedor · Y4 sin resultados · Y5 sin permiso · Y6 móvil |
| 21 | Documentos — Registrar pago (componente único) | `741:53717` | P1 `741:53911` · P2 `741:54024` · P3 `741:54318` · P4 sobrante `741:54468` · P5 efectivo `741:54718` · P6 sin caja `741:54971` · P7 excede `741:55252` · P8 error `741:55526` · P9 resultado (toast + recibo) `741:55528` · M1 hoja móvil `741:55995` |
| 22 | Documentos — Documentos impresos | `741:55997` | D1–D10: instancias de `DocumentoImpreso` (factura, nota crédito, nota débito, documento soporte, cotización, recibo carta, estado de cuenta, borrador, anulada, recibo 80 mm) |

Las Secciones de cartera que ya existían (`445:195059` … `445:195063`) **se conservan**: este bloque
solo añade el pago único, la cartera por tercero, el estado de cuenta y los estados que faltaban
(sin resultados, sin permiso). Las facturas de venta y compra (`421:*`, `424:*`, `425:*`) se enlazan,
no se redibujan. El «Índice» (`264:98924`) tiene ahora el bloque «Documentos» con las 10 Secciones
y los componentes nuevos.

### 3.3 Qué corrige el diseño, en una lista

- Configuración real por organización, con **ambiente como control explícito**, secretos
  enmascarados que no vuelven al navegador, prueba de conexión con resultado en línea y una
  **lista de requisitos para pasar a producción** (set aprobado, resolución vigente, emisor completo).
- Resoluciones con consumo, alerta por umbral (`alert_threshold`, hoy nadie la lee) y sincronización
  que muestra diferencias antes de importar.
- Bandeja sin «job» ni el nombre del proveedor en la UI, con **banda de atascados**, KPIs que
  filtran, acciones en lote, impuestos enviados en el detalle y el motivo de rechazo en lenguaje
  humano. Un rechazo no se reintenta igual: pide corregir. Un error de conexión se reintenta solo.
- Documento soporte en azul de marca, con sucursal, edición de borrador, enlace a la compra,
  retención y neto pagado; el aviso de dirección del vendedor sale en línea, no al guardar.
- Nota crédito desde la factura con **impuesto por línea** y tope por línea; anulación de una
  factura aceptada **con nota** (motivo 2) y su cadena; nota débito con pantalla.
- Cotización con envío real, historial, y conversión que copia el impuesto de cada línea y usa la
  numeración de la sucursal.
- Un solo diálogo de pago para todo, con reparto entre facturas y **sobrante a saldo a favor solo
  con casilla marcada**; estado de cuenta descargable o enviado por correo o WhatsApp
  (`PhoneInput`).
- Documentos impresos con la marca de la organización, sin «IVA» cableado, QR local, recibo de pago
  y estado de cuenta nuevos, y el recibo en ticket de 80 mm.

---

## 4. Cambios de backend y base de datos para que funcione completo (no aplicados)

Todas las migraciones, aditivas y por el MCP (`docs/POLITICA-MIGRACIONES.md`). Orden sugerido.

### 4.1 Hacer que la cola funcione (prioridad 1)

1. **Un job por documento.** Quitar la creación del job en `sendToFactus`
   (`electronicInvoicingService.ts:70-82`) o en la ruta, no en los dos. Índice único parcial
   `electronic_invoicing_jobs (invoice_id, document_type) WHERE status <> 'cancelled'` y el
   equivalente para `support_document_id`.
2. **Procesador real.** `GET /api/factus/process-pending` protegido con `CRON_SECRET`, entrada en
   `vercel.json` (cada 2 minutos), que respete `max_attempts` y `next_retry_at` con espera creciente
   (2, 4, 8, 16 min) y **despache por tipo** (factura, nota crédito, nota débito, documento soporte).
3. **Webhook.** Columna aditiva `electronic_invoicing_jobs.reference_code text NULL` + índice, o
   buscar por número del documento; hoy busca una columna que no existe.
4. **Nota crédito.** Guardar CUFE/QR en columnas que existen (`xml_uuid`, `qr_image`) y revisar el
   error del update (`credit-note/route.ts:101-110`); enviar `numbering_range_id`.
5. **Guardar el QR** (`qr_code` del job y `qr_image` del documento) desde la respuesta.
6. **Descargas** de NC, ND y DS por su endpoint; autenticación en `numbering-ranges`, `acquirer` y
   `support-document/download`; organización de la sesión (nunca del body) en `support-document`,
   y validarla **antes** de borrar en el proveedor.
7. **Los 8 atascados:** decisión del dueño (pregunta 2).

### 4.2 Configuración por organización

1. Credenciales por organización, **cifradas** (Supabase Vault o `integration_credentials.secret_ref`),
   leídas solo en servidor; `factusTokenManager` con caché por organización y ambiente.
2. `electronic_invoicing_config`: dejar de leer `client_secret`/`password` en claro (columnas nuevas
   `*_secret_ref`), y RLS de escritura solo para administradores. Sin `DROP`.
3. Ruta `/app/finanzas/facturacion-electronica/configuracion` + `GET/PUT /api/factus/config` +
   `POST /api/factus/config/test`, con `getServerOrgContext()`.
4. Columnas aditivas para la habilitación: `electronic_invoicing_config.test_set_status text`,
   `test_set_approved_at timestamptz`, `production_since timestamptz`.

### 4.3 Numeración

1. Emitir con `fn_get_next_invoice_number(org, branch, type)` (ya existe; nadie la llama).
2. Índice único parcial: un rango activo por `(organization_id, branch_id, document_type)`. Antes,
   resolver las 2 combinaciones duplicadas de hoy.
3. Sincronización en servidor con sucursal explícita (hoy cae en la sucursal 2).
4. Alerta por `alert_threshold` en la bandeja y en Inicio.

### 4.4 Documentos

1. **Nota crédito atómica:** RPC `fn_emitir_nota_credito(p_invoice_id, p_lineas jsonb, p_motivo, p_reingresar bool)`
   que valide cantidad ≤ facturado − acreditado, escriba `invoice_applied_taxes` de la nota por línea
   y deje que los disparadores actualicen saldo y cartera. Sustituye los pasos del navegador.
2. **Nota débito:** misma RPC con signo positivo y la pantalla de N6.
3. **Documento soporte:** edición de borrador, sucursal obligatoria, impuesto desde el catálogo
   (`dian_tributes`, no `'01'` fijo), nota de ajuste al documento soporte.
4. **Cotización → factura:** RPC `fn_convertir_cotizacion(p_quotation_id, p_branch_id, p_electronica bool)`
   con la numeración de la sucursal, copia de impuestos y descuentos, en una transacción; historial
   de estados (tabla aditiva `quotation_status_history` o `activities`); envío real por correo o
   WhatsApp.
5. **RADIAN (fase 2):** tabla `received_electronic_documents` y `electronic_document_events`
   (030–034) y su integración con el proveedor. Solo si el dueño lo aprueba (pregunta 5).

### 4.5 Pagos, recibos y estado de cuenta

1. `fn_registrar_pago` + `POST /api/pagos` tal como está en `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md`
   §A.4, con `payments.payment_group_id uuid NULL` (aditiva).
2. Número de recibo: tabla aditiva `payment_receipts (id, organization_id, branch_id, number, group_id, created_at)`
   o consecutivo `RC-` por sucursal (pregunta 7).
3. `fn_estado_cuenta_cliente` / `fn_estado_cuenta_proveedor` + `GET /api/clientes/[id]/estado-cuenta`
   y el equivalente de proveedores (`CLIENTE-PAGO…` §B.2–B.3).
4. Migrar los 9 caminos de pago al componente y a la RPC.

### 4.6 Documentos impresos

Motor único de `DOCUMENTOS-PDF.md` §5 con `DocumentKind` `invoice`, `credit_note`, `debit_note`,
`support_document`, `quotation`, `receipt`, `statement`; QR generado en servidor; recibo en ticket
de 80 mm como plantilla nueva de `print-agent`.

### 4.7 Permisos

Nuevos, resueltos en el servidor: `finance.einvoicing.configure`, `finance.einvoicing.send`,
`finance.notes.issue`, `finance.payments.register`, `finance.statements.send`. Hoy estas rutas no
comprueban ninguno.

---

## 5. Verificación

Chequeo por script sobre las 10 Secciones (107 frames, 5.987 instancias, 6.027 textos):

| Comprobación | Resultado |
|---|---|
| Secciones que se solapan con cualquier otro nodo de la página | **0** |
| Nodos de primer nivel que se solapan dentro de una Sección | **0** |
| Nodos fuera de su Sección | **0** |
| Instancias rotas (sin componente principal) | **0** |
| Anotaciones dentro de frames | **0** (las notas van encima, fuera del frame) |
| Textos truncados | 23 sospechosos por la heurística (ancho estimado > ancho real). 13 se acortaron; los 10 restantes («Distribuidora del Norte S.A.S.» en celdas de 206–216 px) se comprobaron en captura y **se ven completos**: falsos positivos |

Revisión visual con captura, y corregido sobre la marcha: textos de `Badge` que no tomaban la
propiedad, icono de copiar del CUFE, icono del `PageHeader` que caía en las migas, ítem activo del
`Sidebar` («Finanzas»), tabla de líneas recortada en el documento soporte (ahora a ancho completo,
con líneas y totales propios de un documento soporte), botones de cabecera que desbordaban, KPIs y
celdas truncadas, separación de columnas en `SeleccionLineasNota` y en las tablas del impreso,
vínculo del número en las 5 variantes nuevas de `ChipDocumento` y la etiqueta fija «Vencida 12 d»
del badge. Textos de ayuda técnicos dentro de componentes (endpoints, «no del navegador») se
reescribieron para el usuario final.

Capturas en `docs/design/figma/` (17): `52-documentos-componentes.png`,
`-documento-impreso-componente.png`, `-registrar-pago-componente.png` (tomada antes de reescribir
dos textos de ayuda), `-registrar-pago-sobrante.png`, `-fe-configuracion-seccion.png`,
`-fe-configuracion-pruebas.png`, `-resoluciones-listo.png`, `-bandeja-dian-listo.png`,
`-bandeja-dian-movil.png`, `-doc-soporte-nuevo.png`, `-doc-soporte-detalle.png`,
`-nota-credito-por-lineas.png`, `-nota-credito-detalle.png`, `-cotizacion-detalle.png`,
`-cxc-detalle-cuotas.png`, `-cartera-cliente.png`, `-estado-de-cuenta-dialogo.png`.

Lo que faltó:

1. El cupo del MCP de Figma se agotó dos veces durante la tanda. Por eso no hay captura de cada
   frame (hay 17 de 107) ni se leyeron los ids de los frames de las Secciones 20–22: se obtienen con
   `get_metadata` sobre `740:53505` (la de la Sección 21 ya está: P1 `741:53911` … M1 `741:55995`).
2. En «nuevo» de documento soporte y de cotización, `DocumentLinesTable Mode=edición` y
   `DocumentTotals` muestran los datos de ejemplo del componente (productos de tienda), con las
   descripciones del documento soporte sustituidas. En los detalles ya van tablas y totales
   coherentes con el documento.
3. `AplicarPagoDialog` sigue instanciado en las Secciones de facturas y cartera de otras tandas
   (pregunta 10).

---

## 6. Preguntas para el dueño

1. **¿Credenciales del proveedor por organización, o una cuenta única del ERP?** Hoy se emite con
   una sola cuenta para todas. Por organización exige que cada cliente contrate y habilite; la cuenta
   única obliga a que GO Admin sea el proveedor ante la DIAN de todos.
2. **Los 8 documentos atascados** (2 organizaciones, facturas ya pagadas, 19 a 43 días): ¿se envían
   ahora con su fecha original, o se cancelan y se deja constancia?
3. **Anticipos a proveedores:** ¿se crea el saldo a favor del proveedor, o el pago a proveedor no
   admite sobrante? (Dibujado sin sobrante en cuentas por pagar.)
4. **Efectivo sin caja abierta:** ¿se bloquea o solo se avisa? (Dibujado: bloquea con «Abrir caja».)
5. **RADIAN** (acuse, recibo del bien, aceptación, reclamo sobre facturas de compra recibidas):
   ¿entra ahora o queda para fase 2? Requiere recibir las facturas de los proveedores.
6. **Nota débito:** ¿se habilita en la interfaz? 2 organizaciones ya tienen numeración de ND.
7. **Recibos de pago:** ¿consecutivo propio `RC-` por sucursal? ¿Se imprime el ticket de 80 mm
   automáticamente al registrar un pago en caja?
8. **Estado de cuenta y cotizaciones por WhatsApp:** ¿por el canal de WhatsApp de la organización
   (con su costo por mensaje) o solo con enlace de descarga?
9. **Reintentos automáticos:** ¿5 intentos con espera 2, 4, 8 y 16 minutos está bien? ¿Se avisa al
   administrador cuando se agotan?
10. **`AplicarPagoDialog`:** ¿se autoriza cambiar sus instancias en las Secciones de facturas y
    cartera por `RegistrarPagoDialog`? Es mecánico, pero toca Secciones de otras tandas.
