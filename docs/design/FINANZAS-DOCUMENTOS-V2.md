# Finanzas — Documentos V2: cotizaciones, notas crédito y débito, saldos a favor y facturación electrónica

Fecha: 2026-09-28 · Fase de **análisis** (solo lectura: código en `main` hasta `def8dfb0`, capturas de
`docs/design/figma/` y `SELECT` por el MCP de Supabase, proyecto `jgmgphmzusbluqhuqihj`). No se usó el MCP de
Figma. El dibujo es una fase posterior.

Encargo del dueño: rediseñar en Figma las páginas de Finanzas con el manual de marca, mejorando la experiencia,
**después** de analizar la UI, la base de datos, el backend y el flujo completo de cada página. Este documento cubre
el grupo **Documentos**: cotizaciones, notas crédito, notas débito, saldos a favor y facturación electrónica
(bandeja, detalle del envío, retenidas, servicio de la plataforma, resoluciones y rangos).

Base y documentos que **no se repiten** (se citan):

- `FINANZAS-DOCUMENTOS-FIGMA.md` (2026-09-23): primer diseño del bloque, Secciones 13 a 22 de `07 Finanzas` y
  componentes `DianTimeline`, `DianPanel`, `RangoNumeracion`, `SeleccionLineasNota`, `RepartoPago`,
  `RegistrarPagoDialog` y `DocumentoImpreso`. Aquí solo se corrige lo que quedó viejo o contradice decisiones
  posteriores.
- `docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md` §6 a §8: pago único, nota crédito atómica, listado en el
  servidor y cierre de la fase 2. Es el patrón que se reutiliza.
- `docs/implementacion/KIT-COMPARTIDO.md` y `KIT-CODIGO.md`: el kit.
- `AUDITORIA-COHERENCIA-FIGMA.md`: reglas (a) a (i) y los estados que faltan en §5.1.
- `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md` §A: el pago único.
- Memoria del proyecto «facturación electrónica como servicio de la plataforma»: GO Admin presta el servicio con
  el plan SaaS de Factus; una cuenta por NIT la carga el equipo de GO Admin, cifrada y legible solo en el servidor.
  El cliente no ve ni carga credenciales. Sin credenciales, la organización queda «pendiente de activación».

Ninguna organización se nombra: la evidencia va en conteos. Los datos de ejemplo de los frames son ficticios.

**Aviso de concurrencia.** Mientras se escribía este análisis había otras sesiones trabajando en la misma zona:
«Arreglar lógica de cotizaciones», «Arreglar lógica de saldos a favor», «i18n facturas venta y notas crédito» e
«i18n docs soporte y facturación electrónica». Las citas `archivo:línea` son de `def8dfb0` más el árbol de trabajo
del 2026-09-28; antes de dibujar o construir, contrastar §3.2, §4.2 y §6.2 con lo que esas sesiones hayan
corregido (sobre todo C-1, C-2, S-1, S-2 y N-1).

---

## 0. Resumen

1. **La facturación electrónica ya tiene arquitectura de plataforma, pero no emitió nada todavía.** Desde el
   2026-09-23 (`90082b83`, `d0b5e948`, `2ee27a2b`) hay credenciales por organización en Vault, un cron cada
   2 minutos, reintentos con espera creciente, retención de lo encolado sin servicio activo y una pantalla de
   configuración de solo lectura en el kit. En la base: `electronic_invoicing_config` tiene **0 filas**, ninguna
   organización está activa, hay **8 envíos retenidos** (48 a 24 días, 0 intentos) y 0 eventos. Tampoco existe
   una pantalla para que el equipo de GO Admin cargue las credenciales: `go-admin-super` no tiene nada de Factus.
2. **Dos pantallas dicen cosas distintas del mismo servicio.** La bandeja (`facturacion-electronica/page.tsx`)
   sigue con componentes viejos, calcula los KPI bajando todos los envíos al navegador, **no muestra los
   retenidos** (salen como «pendiente») y enlaza la documentación del proveedor. La configuración nueva
   (`ConfiguracionServicioFE.tsx`) sí muestra el servicio, los retenidos y los rangos. Además,
   `/app/configuracion › facturación` repite una tercera versión (`FacturacionConfigPanel.tsx`).
3. **El Figma del 09-23 contradice la decisión del dueño en la configuración:** los frames E1–E7 piden
   «Client ID», «Client secret», usuario, ambiente y «Pasar a producción» al cliente. Hay que redibujarlos
   como «Servicio de GO Admin», sin credenciales (§7.4).
4. **Aplicar un saldo a favor se deshace solo.** `fn_apply_customer_credit` escribe `invoice_sales.balance` a
   mano, pero desde `e5b52cdd` el saldo lo recalcula `fn_factura_venta_recalcular_saldo` como
   `total − pagado − notas vivas`, **sin contar `credit_note_applications`**. El siguiente pago o nota sobre esa
   factura borra la aplicación. Hoy hay 0 aplicaciones, así que no hay daño. Hay que arreglarlo antes de rediseñar
   la pantalla (§6.4).
5. **Anular una nota crédito devuelve el saldo dos veces.** `notasCreditoService.anularNotaCredito`
   (`notasCreditoService.ts:256-321`) pone la nota en `void` desde el navegador: el disparador
   `trg_nota_credito_recalcula_factura` ya recalcula la factura, y después el servicio **suma otra vez** el valor
   de la nota al saldo. Además no revierte el asiento, ni el reingreso de mercancía, ni el saldo a favor que la
   nota haya creado, y no pide permiso (§4.2).
6. **Convertir una cotización pierde el IVA.** `CotizacionesService.convertToInvoice`
   (`cotizacionesService.ts:408-521`) crea la factura desde el navegador, ya `issued`, con número `FACT-####`
   calculado leyendo la última, sin `document_type`, y por fuera de `fn_factura_venta_guardar` y de la emisión.
   **En 2 de las 4 cotizaciones convertidas la factura quedó con IVA 0** (la cotización tenía 103.781,51 y
   255.462,19 de impuesto). «Enviar por correo» solo cambia el estado y muestra «Enviada a {correo}» sin enviar
   nada (`DetalleCotizacion.tsx:176-190`).
7. **Nota débito:** 0 en la base, ruta 501 y ninguna pantalla. Dos organizaciones tienen numeración de ND. Para
   emitirla falta el documento completo: RPC, saldo y cartera, asiento, cola DIAN, PDF y la aceptación en el pago
   único, que hoy rechaza todo lo que no sea factura (§5).
8. **Nada de este grupo usa el patrón ya construido**, salvo el diálogo de nota crédito y la configuración de FE.
   Cotizaciones, notas y saldos leen y escriben desde el navegador con la organización de `localStorage`, sin
   paginación de servidor, con `dark:`/`gray-*` y, en cotizaciones y saldos, sin `next-intl`. El molde está
   listo: el listado y el detalle de facturas de venta (`ListadoFacturasVenta.tsx`, `DetalleFacturaVenta.tsx`),
   la cartera del cliente, el pago único y el motor de documentos, que **ya tiene** las plantillas
   `nota-credito` y `cotizacion`, aunque ninguna de las dos pantallas las llama.

---

## 1. Datos reales (solo `SELECT`, 2026-09-28)

| Qué | Conteo |
|---|---|
| Facturas de venta en los últimos 30 días | 2.831 en 13 organizaciones; **solo 6** (2 organizaciones) no vienen del POS |
| `invoice_sales.document_type` | `NULL` en 3.016 filas (POS), `'invoice'` en 913 (Finanzas), `'credit_note'` en 28, `'debit_note'` en 0. El CHECK admite además `proforma` y `recurring` |
| Cotizaciones | **7** en 3 organizaciones (5 en una): 4 convertidas y 3 enviadas. Las 3 enviadas **vencieron** (`valid_until` pasado) y siguen «Enviada»: nadie marca el vencimiento |
| Cotizaciones con oportunidad del CRM · enlace de pago · firma · secciones de propuesta | 1 · 0 · 0 · 0 |
| Cotizaciones con descuento total | 0. Líneas: 10, todas con producto; impuestos `IVA_5` o ninguno |
| Facturas nacidas de una cotización | 4: tres `FACT-####` y una con el número de la cotización de pruebas; todas con `document_type NULL`; **2 con IVA 0 cuando la cotización tenía IVA** |
| Pares de cotizaciones con el mismo total en la misma organización | 2: dos «Enviadas» se rehicieron como nuevas y se convirtieron (se duplica en vez de convertir la original) |
| Notas crédito | 28 (26 emitidas, 2 anuladas) en 4 organizaciones; 8 nacieron de ventas del POS. **0 desde el 2026-09-24** (el diálogo nuevo no se ha usado aún). 5 en los últimos 30 días |
| Numeración de notas crédito | Formatos mezclados: `NC-0001`, `NC00000004`, **`NC-0NaN`** (error de la numeración vieja), y 4 de pruebas E2E (`NC-E2E-*`) en producción. 1 número repetido dentro de una organización. **No hay UNIQUE (organización, número)** en `invoice_sales` ni en `quotations` |
| Notas enviadas a la DIAN | 0 |
| Notas débito | 0. Rangos `debit_note` activos: 2 (2 organizaciones, sin resolución, correcto) |
| Saldos a favor (`credit_notes`, que **es la tabla de saldos a favor**, no de notas) | 4 activos en 2 organizaciones, los 4 nacidos del excedente de una nota crédito (2 de ellos de pruebas E2E). Aplicaciones (`credit_note_applications`): **0**. Un cliente tiene 2 saldos |
| Pago único (`payment_groups`) | **0** recibos: aún no se ha registrado ningún pago por `fn_registrar_pago` en producción, así que ningún saldo a favor nació de un sobrante |
| Devoluciones (`returns`) | 7, todas de 2025, sin nota ni saldo enlazados |
| `electronic_invoicing_jobs` | 8, todos `invoice · pending · 0/5 intentos`, sin payload, con `hold_reason` («En cola desde antes de activar el servicio. Factus emite con la fecha del día de envío, no con la de la venta: requiere confirmación.»). 2 organizaciones; 48 a 24 días |
| `electronic_invoicing_events` · `electronic_invoicing_config` · `support_documents` | 0 · 0 · 0 |
| `invoice_sequences` | factura: 2 (2 organizaciones, una sin fecha de fin); NC: 4; ND: 2; DS: 2. El duplicado de rangos activos que señaló el 09-23 **ya no existe** (1 rango de factura por organización) |
| Permisos de finanzas | `finance.view`, `finance.create`, `finance.void`, `finance.approve` (sin permisos propios de FE) |

---

## 2. Reglas comunes de la propuesta

### 2.1 El molde: lo que ya está construido y se reutiliza

| Pieza | Dónde está | Se usa en |
|---|---|---|
| Listado en el servidor: `useListadoServidor` + `GET /api/<dominio>` → `fn_<dominio>_listado` + KPIs | `ListadoFacturasVenta.tsx:88`, `/api/facturas-venta` | cotizaciones, notas, saldos, bandeja |
| `PageHeader` + `BranchBadgeActiva` + `KpiStrip`/`StatCard` (que filtran) + `ListToolbar` (`SearchInput`, `FilterPanel`, `DateRangeButton`, `FilterChips`) + `DataTable` (tarjeta `ListCard` < lg) + `Pagination` + `BulkActionBar` | `ListadoFacturasVenta.tsx:278-542` | los 5 listados |
| Detalle: `DocumentoCabecera` con `CadenaDocumento` en `debajo`, `DocumentoLineas` lectura, `DocumentoTotales`, `Tarjeta` + `ListaDatos`/`FilaDato`, `DialogoMotivo`, `EmptyState` (no encontrado · sin permiso · error) | `DetalleFacturaVenta.tsx:116-496` | cotización, nota crédito, nota débito |
| Permisos del servidor en el cliente: `usePermisosFinanzas` (`GET /api/finanzas/permisos`) | `src/lib/finanzas/usePermisosFinanzas.ts` | todas |
| Pago único: `RegistrarPagoDialog` + `RegistrarPagoConectado` → `POST /api/pagos` → `fn_registrar_pago` | `kit/documento/RegistrarPagoDialog.tsx`, `finanzas/pagos/` | saldo a favor (crear, usar), nota débito (pagar) |
| Motor de documentos: `GET /api/documentos/[tipo]/[id]` con `abrirDocumento` / `descargarDocumento` / `imprimirDocumento` | `src/lib/documents/` (`tipos.ts:20-32`: ya tiene `nota-credito` y `cotizacion`) | PDF de todos |
| Envío por correo: `EnviarFacturaDialog` (correo por `sendEmail` del CRM con el PDF del motor) | `facturas-venta/detalle/EnviarFacturaDialog.tsx` | se generaliza a `EnviarDocumentoDialog` para cotización y notas |
| Nota crédito en dos pasos: `NotaCreditoVentaDialog` + `SeleccionLineasNota` → `POST /api/facturas-venta/[id]/nota-credito` → `fn_nota_credito_emitir` | `facturas-venta/detalle/NotaCreditoVentaDialog.tsx`, `finanzas/notas/SeleccionLineasNota.tsx` | nota crédito desde el listado y molde de la nota débito |
| Cola DIAN: `colaFacturacion.server.ts` (reclama con `SKIP LOCKED`, despacha por tipo, `fn_einvoicing_registrar_resultado`) | `src/lib/services/einvoicing/` | factura, NC, DS; falta ND |

### 2.2 Componentes que faltan en el kit (se construyen una vez)

| Pieza | Figma | Qué hace | La usan |
|---|---|---|---|
| `DianPanel` | `729:18575` (existe en Figma, no en código; pendiente de `KIT-COMPARTIDO.md`) | Tarjeta lateral del estado electrónico: badge, número DIAN, CUFE/CUDE con copiar, QR, `DianTimeline`, motivo del rechazo y la acción que toca. Hoy `DetalleFacturaVenta.tsx:409-416` lo arma a mano con `FilaDato` | factura, NC, ND, DS, detalle del envío |
| `DianTimeline` | `729:18030` | Línea de tiempo del envío (creado → retenido/en cola → enviado, intento n de 5 → respuesta). Sustituye `JobEventsTimeline.tsx` (15 `dark:`) | `DianPanel`, detalle del envío |
| `EnviarDocumentoDialog` | C10 `739:50870` | Generaliza `EnviarFacturaDialog`: correo del tercero editable, asunto y mensaje con plantilla, PDF adjunto del motor; WhatsApp con enlace firmado cuando exista (D6 del plan de ventas) | cotización, NC, ND, estado de cuenta |
| `HistorialDocumento` | captura `20-facturas-venta-detalle.png` | Lista de cambios de estado con actor y hora (pendiente en `KIT-COMPARTIDO.md`) | cotización, nota, saldo a favor |
| `SelectorDocumento` | N2 `738:43325` | Buscar una factura de venta del tercero (número, cliente, fecha, saldo) en el servidor, sobre `SelectorEntidad` | «Nueva nota crédito / débito» desde el listado |
| `RangoNumeracion` | `729:18826` | Resolución con consumo y vigencia (fila · tarjeta) | resoluciones, configuración, aviso de agotamiento |

### 2.3 Correcciones al Figma del 2026-09-23 (valen para todas las Secciones 13–22)

| Qué | Dónde | Corrección |
|---|---|---|
| Credenciales, ambiente y «Pasar a producción» en manos del cliente | E1–E7 `733:29527…31756`, M1 `733:32048`; captura `52-documentos-fe-configuracion-pruebas.png` | Contradice la decisión del dueño. Se redibuja como «Servicio de GO Admin» (§7.4) |
| «Procesar cola» como acción primaria de la bandeja | B1 `735:33548` | La cola la procesa el cron cada 2 minutos. La primaria pasa a «Actualizar» (o no hay primaria); «Enviar ahora» solo sobre retenidos seleccionados |
| KPI con icono «$» en «En cola», «Aceptados», «Rechazados» | B1 | Iconos del catálogo por estado (`Clock`, `CheckCircle2`, `XCircle`, `AlertTriangle`, `PauseCircle`) |
| Pestaña «Eventos recibidos (RADIAN)» visible | B1 | Fase 2: no se dibuja en la bandeja de la fase 1 (pregunta Q-FE5) |
| Iconos cruzados en la cabecera de la cotización: «Enviar» con `Download`, «Duplicar» con `Send` | C7 `739:49010`; `52-documentos-cotizacion-detalle.png` | «Enviar» `Send`; «Duplicar» `Copy`; «Descargar PDF» `Download`; «Imprimir» `Printer`. En la nota crédito, «Descargar PDF» lleva `Printer` y «Enviar» `Download`: igual corrección |
| «Aplicar a otra factura» en el detalle de la nota crédito | N7 `738:44455` | Una nota no se aplica a otra factura: lo que se aplica es el saldo a favor que dejó. La acción pasa a «Ver saldo a favor» (enlace), solo si hubo excedente |
| «Guardar borrador» en el diálogo de la nota | N3 `738:43675`; `52-documentos-nota-credito-por-lineas.png` | `fn_nota_credito_emitir` emite en un paso y el diálogo de código tiene «Atrás · Emitir». Se quita el borrador (pregunta Q-NC2) |
| Columna «Valor» cortada en `SeleccionLineasNota` | N3 | Ancho del diálogo 880 o columna «Impuesto» más angosta |
| «Consumo» repetido en cada fila y la vigencia pegada a la barra | R1 `733:32327`; `52-documentos-resoluciones-listo.png` | La etiqueta sale del encabezado de la columna; 16 px entre consumo y vigencia |
| Estados que la auditoría de coherencia da por faltantes (cargando, vacío, error, sin permiso) en resoluciones, bandeja, soporte, notas y cotizaciones | `AUDITORIA-COHERENCIA-FIGMA.md` §5.1 | El doc del 09-23 dice que se dibujaron (N9–N13, C2–C6, B5–B9…). El script no los reconoció por el nombre. En el dibujo: leer con `get_metadata`, renombrar con el patrón «Escritorio / {Pantalla} — {estado}» y completar los móviles |
| Paginación «175» | B1 | Ya corregida a 186 en la auditoría; con los datos reales el vacío es el caso común (§1) |
| Icono de «Notas crédito» y «Cotizaciones» en el menú | `src/lib/navigation/catalog.ts:380,382` | Hoy `FileText` (el mismo de facturas de venta) y `ClipboardList` (el mismo de órdenes de compra). Pasan a `FileMinus` y `Calculator`, como ya fija `ICONO_DOCUMENTO` del kit |

### 2.4 Estados y textos

- Cada listado: listo · cargando · vacío (primer paso) · sin resultados · error · sin permiso · sin sucursal
  (`EmptyStateSinSucursal`, solo donde el dato es por sucursal: cotizaciones, notas, saldos). Móvil: listo,
  cargando, vacío y hoja de acciones.
- Cada detalle: listo · cargando (cabecera sin esqueleto, cuerpo con `Skeleton`) · no encontrado · sin permiso ·
  error, y la variante de cada estado del documento (borrador, emitida, anulada, convertida…).
- Estados con la tabla única `kit/estadoTono.ts` (`SISTEMA-BADGES.md` §4). Faltan en ella: «Aceptada»,
  «Rechazada», «Vencida» y «Convertida» de cotización; «Retenido» del envío; «Usado», «Devuelto» y «Cancelado» del
  saldo a favor.
- Textos en es, en, fr y pt (`componentes-nuevos-en-4-idiomas`): namespaces `cotizaciones`, `notasCredito`
  (existe), `notasDebito`, `saldosAFavor`, `facturacionElectronica` (existe).
- En la UI nunca se ve «job», «Factus», «payload», «CUFE» sin explicar ni la URL del proveedor. Se dice «envío a
  la DIAN», «código único (CUFE)», «respuesta de la DIAN».

---

## 3. Cotizaciones

### 3.1 Inventario actual y flujo

| Pieza | Archivo | Nota |
|---|---|---|
| Rutas | `src/app/app/finanzas/cotizaciones/{page,nuevo/page,[id]/page,[id]/editar/page}.tsx` | Todas `'use client'`; el detalle carga en el navegador (87 líneas) |
| Listado | `CotizacionesPage.tsx`, `PageHeader.tsx` (propio, 42), `CotizacionesFiltros.tsx` (Select de estado + búsqueda), `CotizacionesTable.tsx` (211) | `ui/table` de shadcn, sin paginación, sin KPIs, sin `next-intl`. Colores `bg-*-100 … dark:*` por estado (`CotizacionesTable.tsx:31-38`). Fecha con `split('T')[0]` (`:22`). Eliminar con `confirm()` del navegador (`:101`) |
| Servicio | `src/lib/services/cotizacionesService.ts` (532), cliente `@/lib/supabase/config` (`:1`) | Todo desde el navegador |
| Listar | `listQuotations` (`:104-155`) | Por organización, sucursal, estado y cliente; **sin `range`**: baja todo |
| Número | `generateQuotationNumber` (`:78-101`) | Lee la última `COT-%` y suma 1; si falla, `COT-{Date.now()}`. El CRM tiene **otro generador** (`proposalServerService.ts:198`). Sin UNIQUE en la base: carrera posible |
| Crear | `createQuotation` (`:177-266`) | Evalúa promociones en el navegador (`promotionEngine`), resuelve impuestos por línea (`resolveLineTax`) e inserta cabecera y líneas en dos llamadas sin transacción |
| Formulario | `NuevaCotizacionForm.tsx` (612): reutiliza `ClienteSelector`, `ItemsFactura`, `ImpuestosFactura`, `FormaPagoSelector` del formulario viejo de facturas y `BranchSelectorField` | Fechas por defecto con `toISOString().split('T')[0]` (`:70-72`): día UTC, prohibido. `quotation_items` guarda **un** impuesto por línea (`tax_code`, `tax_rate`) aunque el formulario de facturas admite varios |
| Editar | `EditarCotizacion.tsx` → el mismo formulario; `updateQuotation` (`:269-330`) | Borra todas las líneas y las reinserta (`:313-320`). Se permite en `draft` y `sent` (`DetalleCotizacion.tsx:272`) |
| Estados | `QuotationStatus` = `draft · sent · accepted · rejected · expired · converted` (`:5`) | Sin CHECK en la base. `expired` no lo pone nadie: las 3 enviadas vencidas siguen «Enviada» |
| Detalle | `DetalleCotizacion.tsx` (537) | Cabecera propia, `Button` sueltos (Imprimir, Enviar, Editar, Duplicar, Convertir en verde `bg-green-600`, `:315`), `Card` con `gray-*`. Lee la organización con `getOrganizationId()` (`:74`) y sus datos con `supabase` directo (`:83`) |
| Enviar | `handleEnviarEmail` (`:176-190`) | **Solo cambia el estado a `sent`** y muestra «Enviada a {correo}». No envía nada |
| Aceptar / rechazar | `:204-222` | `changeStatus` desde el navegador, sin motivo ni registro |
| Imprimir / PDF | `handleImprimir` (`:165-173`) | `PDFService.printInvoiceHTML` (el generador viejo de facturas). El motor tiene `cotizacion` (`lib/documents/server/cargadores/cotizacion.ts`, permiso `finance.view` o `sales_management`) y **nadie lo llama** |
| Duplicar | `duplicateQuotation` (`:348-406`) | Fecha de hoy en UTC (`:362`) |
| Convertir | `convertToInvoice` (`:408-521`), también desde el CRM (`WonCloseModal.tsx:104`) | Sin sucursal, toma la **primera** (`DetalleCotizacion.tsx:229-240`). Número `FACT-####` leyendo la última (`:419-433`), factura insertada ya `issued` con saldo = total (`:437-460`), líneas después (el disparador `fn_recalc_invoice_totals` rehace los totales), estado y enlace en dos `update` más (`:510-516`). No usa `fn_factura_venta_guardar` ni la emisión, así que tampoco la numeración de la resolución, los seriales, la comisión ni la cola DIAN. Fechas con `toISOString` (`:445-446`) |
| Eliminar | `deleteQuotation` (`:523-530`) | En cualquier estado, también convertida |
| CRM | `proposalServerService.ts` (propuestas sobre `quotations`: `sections_json`, `markProposalSent` **sí** envía correo y registra actividad, `:343-352`), `crmFinanceService.ts:275`, `stageGateService.ts:444` («requiere cotización» para avanzar de etapa) | Las líneas de propuesta se guardan con `tax_rate: 0` (`proposalServerService.ts:316`) |
| Permisos | ninguno en la pantalla; RLS por pertenencia y sucursal (`quotations_org_isolation`, `branch_access_restrictive`) | `quotation_items_org_isolation` va a `public` |
| Disparadores | `trg_set_quotation_issue_date_tz` (día de emisión en la zona de la organización), moneda base por defecto | — |

**Flujo de punta a punta hoy:** Nueva → cliente, líneas e impuestos en el navegador → guardar (dos inserts) →
detalle → «Enviar» (solo estado) → «Aceptar» → «Convertir» (factura `issued` directa, fuera del circuito de
facturas) → queda «Convertida» con `converted_invoice_id`. En el CRM, la oportunidad ganada puede disparar la
misma conversión.

### 3.2 Problemas

| # | Tipo | Problema | Evidencia |
|---|---|---|---|
| C-1 | Datos | La conversión pierde el IVA | 2 de 4 facturas convertidas con `tax_total` 0 frente a 103.781,51 y 255.462,19 en la cotización |
| C-2 | Lógica | Segunda implementación de «crear factura» (regla 7): sin resolución, sin borrador, sin seriales, sin cola DIAN, `document_type NULL` | `cotizacionesService.ts:408-521` |
| C-3 | Lógica | Numeración por lectura de la última (cotización y factura) y dos generadores de `COT-` | `:78-101`, `:419-433`; `proposalServerService.ts:198` |
| C-4 | UX | «Enviar» miente: dice «Enviada a …» sin enviar | `DetalleCotizacion.tsx:183-186` |
| C-5 | Datos | El vencimiento no existe como estado: 3 de 3 enviadas están vencidas y se ven «Enviada» | §1 |
| C-6 | UX | Se rehacen cotizaciones en vez de convertir la enviada (2 pares con el mismo total) | §1 |
| C-7 | Lógica | Conversión con la primera sucursal si la cotización no tiene | `DetalleCotizacion.tsx:229-240` |
| C-8 | Lógica | Se puede borrar una cotización convertida y dejar la factura huérfana del enlace | `CotizacionesTable.tsx:101`, `deleteQuotation` |
| C-9 | Fechas | `toISOString().split('T')[0]` en formulario, duplicado y conversión | `NuevaCotizacionForm.tsx:70-72`, `cotizacionesService.ts:362,445-446` |
| C-10 | UI | Sin kit, sin i18n, sin estados vacío/sin permiso, `dark:` y colores de estado propios | archivos de §3.1 |
| C-11 | Seguridad | Organización del navegador; sin permiso para convertir ni borrar | `getOrganizationId()` en listado, detalle y formulario |

### 3.3 Propuesta

**Listado** (`/app/finanzas/cotizaciones`):
- `PageHeader` list: migas Finanzas › Ventas › Cotizaciones, icono `Calculator`, subtítulo «organización ·
  sucursal»; primaria **«Nueva cotización»**; «⋯» con Exportar. Móvil: «+» en la cabecera.
- `BranchBadgeActiva` debajo.
- `KpiStrip` que filtra: **Abiertas** (borrador + enviada, con su valor) · **Por vencer en 7 días** · **Vencidas
  sin respuesta** (tono advertencia) · **Tasa de conversión** del periodo (convertidas / enviadas).
- `ListToolbar`: buscador (número, cliente, NIT); `FilterPanel` con estado, cliente (`CustomerPicker`
  `layout="campo"`), vendedor, periodo (`DateRangeButton`), rango de valor, «Con oportunidad del CRM».
- `DataTable`: Número · Cliente + documento · Emisión · Válida hasta (rojo si venció, «vence en 3 d») · Total ·
  Estado (`StatusBadge`, con «Vencida» derivada) · Vendedor (oculta < xl) · Oportunidad (chip) · acciones
  rápidas «Enviar» y «Convertir» · «⋯» (Ver, Editar, Duplicar, Descargar PDF, divisor, Marcar rechazada,
  Eliminar borrador). Fila entera abre el detalle.
- `BulkActionBar`: Enviar recordatorio · Exportar · «⋯» Marcar vencidas como rechazadas.
- Vacío con primer paso: «Crea tu primera cotización» + «Nueva cotización»; nota: «También se crean desde una
  oportunidad del CRM».

**Detalle** (`/app/finanzas/cotizaciones/[id]`), molde de `DetalleFacturaVenta`:
- `DocumentoCabecera` detalle: «Cotización COT-0215», cliente · válida hasta, `StatusBadge`. Acciones según
  estado (una primaria):
  - Borrador: **Enviar** (primaria) · Editar · «⋯» Descargar PDF, Imprimir, Duplicar, divisor, Eliminar.
  - Enviada / vista: **Convertir en factura** (primaria) · Enviar de nuevo · «⋯» Marcar aceptada, Marcar
    rechazada (con `DialogoMotivo`), Editar (vuelve a borrador, con aviso), Duplicar, PDF.
  - Vencida: **Renovar vigencia** (primaria: duplica con fechas nuevas, o prolonga si está en borrador) ·
    Convertir de todos modos (con aviso) · «⋯».
  - Convertida: **Ver factura** (primaria) · Duplicar · PDF. Sin editar ni eliminar.
  - Rechazada: Duplicar · PDF; motivo visible.
- `debajo`: `CadenaDocumento` Oportunidad → **Cotización** → Factura (pendiente punteado «Al convertir»).
- Cuerpo: `Tarjeta` «Cliente y condiciones» (`ListaDatos`: cliente con enlace a la ficha, emisión, válida hasta,
  plazo de pago, moneda, vendedor, sucursal), `DocumentoLineas` lectura (impuesto por línea, descuento),
  `DocumentoTotales variante="cotizacion"` (sin «Pagado» ni «Saldo»), `Tarjeta` «Términos y condiciones»,
  `HistorialDocumento` (creada, enviada por correo a …, vista, aceptada, convertida en FV-…).
- Lateral en escritorio (columna de 360): «Respuesta del cliente» (solo en Enviada: Marcar aceptada · Rechazar)
  y la cadena si no va arriba. En móvil todo en una columna y la primaria en la barra inferior.

**Nueva / editar**: el mismo formulario que se construya para la factura de venta (P8 visual del plan de ventas,
pendiente). `DocumentoCabecera` formulario (Cancelar · **Guardar borrador** · **Guardar y enviar**), «Datos»
(sucursal, emisión, válida hasta con atajos 15 · 30 · 60 días, plazo, moneda, vendedor, oportunidad),
`CustomerPicker` fila, `DocumentoLineas` edición con `ProductPicker` e impuesto por línea (`MultiSelect`),
«Términos» con plantilla de la organización, `DocumentoTotales variante="cotizacion"`. Salir con cambios →
`ui/confirm-dialog`. **No se construye un formulario propio**: comparte el de factura con `tipo="cotizacion"`.

**Convertir en factura** (C9 `739:50790`, rehecho): `Dialogo` 560 con resumen (cliente, líneas, total con IVA
por tarifa), sucursal (obligatoria, por defecto la de la cotización), fecha de emisión (hoy de la organización),
vencimiento según plazo, casilla «Emitir ahora» (si no, queda borrador para revisar), «Factura electrónica»
(interruptor, deshabilitado con motivo si el servicio no está activo). Resultado: `ResultadoOperacion` con «Ver
factura FV-…» y «Registrar anticipo».

**Enviar** (C10 `739:50870`): `EnviarDocumentoDialog` con correo del cliente, asunto, mensaje con plantilla y el PDF
del motor adjunto; registra en el historial. WhatsApp con enlace firmado cuando exista (D6).

**Estados**: listado (7) y detalle (5) de §2.4; formulario: cargando, no editable (convertida) con salida «Duplicar».

**Móvil**: `ListCard` (número, cliente, total, estado, «vence en 3 d»); detalle en una columna con primaria fija
abajo; «⋯» abre `ActionSheet`.

**Coherencia**: mismo detalle que factura de venta; cabecera, cadena y totales idénticos; la conversión abre la
factura en el detalle ya rehecho.

### 3.4 Backend necesario (sin aplicar)

1. `fn_cotizacion_guardar(p_id, p_cabecera jsonb, p_lineas jsonb, p_clave)`: cabecera y líneas en una transacción,
   impuestos resueltos en el servidor con la misma función que la factura, número por consecutivo con bloqueo y
   **una sola** función de número para Finanzas y CRM. Índice único parcial `(organization_id, number)` en
   `quotations` (hoy 0 duplicados: se puede crear sin limpiar).
2. `fn_cotizacion_convertir(p_id, p_branch_id, p_emitir bool, p_electronica bool, p_clave)`: arma la factura
   **llamando a `fn_factura_venta_guardar`** (y a la emisión si `p_emitir`), copia impuestos por línea y
   descuentos, y marca `converted` + `converted_invoice_id` en la misma transacción. Idempotente. La usan
   Finanzas y `WonCloseModal` del CRM. `convertToInvoice` se borra.
3. Vencida como estado derivado en la lectura (`valid_until < hoy de la organización` y estado `draft`/`sent`),
   sin cron. CHECK de estados aditivo (`NOT VALID` y validar después).
4. Historial: tabla aditiva `quotation_events (quotation_id, organization_id, event, actor, meta jsonb,
   created_at)` o, si el dueño prefiere, `activities` del CRM (ya se usa para propuestas).
5. Rutas con `withOrg`: `GET/POST /api/cotizaciones`, `GET/PUT/DELETE /api/cotizaciones/[id]` (DELETE solo
   borrador), `POST …/[id]/estado` (aceptar, rechazar con motivo), `POST …/[id]/convertir`, `POST …/[id]/enviar`
   (correo con el PDF del motor, como `/api/facturas-venta/[id]/enviar`), `POST …/[id]/duplicar`.
6. `fn_cotizaciones_listado` + KPIs (abiertas, por vencer, vencidas, conversión) en el servidor.
7. Permisos: ver `finance.view` o `sales_management` (como el motor); crear, enviar y convertir `finance.create`;
   eliminar borrador y rechazar `finance.void`.
8. Propuestas del CRM: guardar el impuesto real de cada línea en vez de `tax_rate: 0`.

### 3.5 Preguntas

- **Q-C1.** ¿Cotización y propuesta del CRM son el mismo documento? *Recomiendo sí*: una tabla, un número, una
  conversión; la propuesta es la cotización con secciones y firma.
- **Q-C2.** Al convertir, ¿la factura nace emitida o en borrador? *Recomiendo borrador por defecto con la casilla
  «Emitir ahora»*: da una revisión antes de consumir numeración DIAN.
- **Q-C3.** ¿Una cotización vencida se puede convertir? *Recomiendo sí, con aviso y precios de la cotización*
  (no se recalculan).

---

## 4. Notas crédito

### 4.1 Inventario actual y flujo

| Pieza | Archivo | Nota |
|---|---|---|
| Rutas | `notas-credito/page.tsx` (server, monta `NotasCreditoPage`), `notas-credito/[id]/page.tsx` | No hay «nueva» ni desde el listado |
| Listado | `NotasCreditoPage.tsx` (429) | Sí usa `next-intl` (`notasCredito`). `ui/table` y `Select` de shadcn, colores `dark:` por estado (`:69`), estados «draft · pending · sent · accepted · rejected · void · paid» (`:74`) que **no existen** en la NC (solo `issued` y `void`; el estado DIAN va aparte). Anular con `confirm()` + `prompt()` (`:145-147`) |
| Servicio | `notasCreditoService.ts` (505), navegador + `getOrganizationId()` (`:3-4`) | `getNotasCredito` sin `range` (`:86-130`), búsqueda `ilike` sobre número y notas |
| Detalle | `NotaCreditoDetalle.tsx` (557) | Lee nota, líneas, `invoice_applied_taxes`, `organization_taxes` (`:108`), job y eventos desde el navegador. **«Descargar PDF» solo muestra un toast** (`:194-197`). «Enviar a la DIAN» y «Reintentar» (`:153-188`) por `/api/factus/credit-note` y `/api/factus/jobs` |
| Emitir desde la factura | `NotaCreditoVentaDialog.tsx` (326) + `SeleccionLineasNota.tsx` (89) → `POST /api/facturas-venta/[id]/nota-credito` (78) → `fn_nota_credito_emitir` | **Rehecho** (`e5b52cdd`): kit (`Dialogo`, `SegmentedControl`, `CampoNumero`), dos pasos (Qué: total · por líneas · por valor → Motivo: concepto DIAN 1–5, motivo ≥ 5, reingreso, liquidación del excedente en saldo a favor o devolución). Idempotente, `finance.void`, tope por línea y global, numeración compartida con la devolución del POS (`fn_pos_numero_nota_credito`), encola a la DIAN si la factura fue aceptada |
| Modelo | `invoice_sales` con `document_type='credit_note'`, `related_invoice_id`, líneas en `invoice_items` (`credited_item_id`), impuestos en `invoice_applied_taxes` | El saldo de la factura: `fn_factura_venta_recalcular_saldo` = total − pagado − notas vivas; disparadores `trg_nota_credito_recalcula_factura` (INSERT/UPDATE de status, total, related_invoice_id) y `…_borrada_…` (DELETE). Asiento: `trg_auto_journal_credit_note` (solo AFTER INSERT) |
| Anular | `anularNotaCredito` (`notasCreditoService.ts:256-321`) | Desde el navegador; ver N-1 |
| PDF | Motor: `nota-credito` existe (`lib/documents/server/motor.ts:58`, permiso `finance.view`) | La pantalla no lo usa |
| Legado | `process_credit_note(invoice_id, amount)` SECURITY DEFINER con EXECUTE para `authenticated` | Camino viejo sin llamador visible; queda abierto |

**Flujo hoy:** Factura → «⋯ › Nota crédito» → diálogo de 2 pasos → RPC (nota + líneas + impuestos + reingreso +
excedente) → la factura baja su saldo por disparador → si la factura estaba aceptada por la DIAN, la nota entra a
la cola. En el listado solo se consulta y se anula (por el camino roto).

### 4.2 Problemas

| # | Tipo | Problema | Evidencia |
|---|---|---|---|
| N-1 | Datos | **Anular devuelve el saldo dos veces**: el `update status='void'` dispara el recálculo y luego el servicio suma el valor de la nota al saldo ya recalculado. Tampoco revierte el asiento (el disparador solo existe en INSERT), el reingreso de mercancía ni el saldo a favor creado por el excedente | `notasCreditoService.ts:269-318`; triggers de `invoice_sales` |
| N-2 | Seguridad | Anular sin permiso, desde el navegador; `process_credit_note` sigue ejecutable | `:256`; `pg_proc` |
| N-3 | Lógica | Se puede anular una nota que la DIAN ya aceptó (la guarda mira `status !== 'accepted'`, que la NC nunca tiene) | `NotasCreditoPage.tsx:412`, `NotaCreditoDetalle.tsx:284` |
| N-4 | UX | «Descargar PDF» no hace nada | `NotaCreditoDetalle.tsx:194-197` |
| N-5 | UX | No se puede crear una nota desde el listado: hay que saber ir a la factura | rutas |
| N-6 | Datos | Numeración histórica sucia (`NC-0NaN`, `NC00000004`, un número repetido, 4 E2E en producción) y sin UNIQUE | §1 |
| N-7 | Datos | Cada nota crea una cartera con monto negativo (28 de 28, saldo 0) | `FACTURAS-VENTA-CXC-PLAN.md` §8.2 |
| N-8 | UI | Estados de filtro que no existen, listado sin paginación de servidor, `dark:`, cabecera propia | §4.1 |
| N-9 | UX | El estado DIAN no distingue «no aplica» (factura sin FE), «espera a la factura» y «en cola» | `NotaCreditoDetalle.tsx:252-253` |

### 4.3 Propuesta

Un listado único **«Notas»** para crédito y débito (pregunta Q-N1), con el tipo como filtro principal.

**Listado** (`/app/finanzas/notas-credito`, se conserva la ruta; `?tipo=debito` para las débito):
- `PageHeader`: migas Finanzas › Facturación › Notas, icono `FileMinus`; primaria **«Nueva nota crédito»**, «⋯»
  con «Nueva nota débito» y Exportar.
- Debajo: `TabBar` Crédito (contador) · Débito (contador) y `BranchBadgeActiva`.
- `KpiStrip`: Acreditado en el periodo · Notas del periodo · Excedentes a saldo a favor · Sin enviar a la DIAN
  (solo si el servicio está activo; filtra).
- `DataTable`: Número · Factura de origen (`ChipDocumento`) · Cliente · Fecha · Concepto DIAN («1 · Devolución
  parcial») · Valor (con signo tipográfico) · Estado (Emitida · Anulada) · DIAN (`FactusStatusBadge`: No aplica ·
  Espera la factura · En cola · Aceptada · Rechazada) · «⋯» (Ver, Descargar PDF, Enviar, Enviar a la DIAN si toca,
  divisor, Anular).
- **Nueva nota crédito** desde aquí: paso 0 `SelectorDocumento` (buscar la factura del cliente, con saldo y estado
  DIAN) → abre el mismo `NotaCreditoVentaDialog`. No hay segundo diálogo.

**Detalle** (`/app/finanzas/notas-credito/[id]`), molde de la factura:
- `DocumentoCabecera`: «Nota crédito NC-0007», cliente · fecha, `StatusBadge` + insignia DIAN. Acciones: **Descargar
  PDF** (motor) · Enviar (`EnviarDocumentoDialog`) · «⋯» Imprimir, Ver factura, Ver saldo a favor (si hubo
  excedente), divisor, Anular (deshabilitado con motivo si la DIAN la aceptó: «Una nota aceptada no se anula;
  emite una nota débito»).
- `debajo`: `CadenaDocumento` Factura → **Nota crédito** → Saldo a favor o Devolución → Asiento.
- `Tarjeta` «Factura de origen y motivo»: factura (chip), concepto DIAN, motivo, «Saldo de la factura 1.767.532 →
  628.702», «Inventario: 2 productos reingresados a Sucursal Principal».
- `DocumentoLineas` lectura con impuesto por línea · `DocumentoTotales` («Total nota crédito»).
- Lateral: `DianPanel` y `HistorialDocumento`.

**Anular** (`DialogoMotivo`): consecuencias en lista («la factura FV-1042 vuelve a deber 1.138.830», «2 productos
salen otra vez del inventario», «el saldo a favor de 180.000 se cancela»); **bloqueo** con salida alternativa si el
saldo a favor ya se usó o si la DIAN la aceptó.

**Estados**: listado 7 + detalle 5; variantes de detalle: emitida sin FE · aceptada · rechazada (con motivo y
«Corregir y reenviar») · anulada.

**Móvil**: `ListCard` (número, factura, cliente, valor, estados), detalle en una columna, `DianPanel` plegable.

### 4.4 Backend necesario

1. `fn_nota_credito_anular(p_id, p_motivo, p_clave)`: guarda de organización y `finance.void`; rechaza si la DIAN
   aceptó; bloquea si el saldo a favor derivado tiene aplicaciones; en una transacción: `status='void'` (el
   disparador recalcula la factura), contra-asiento con `fn_revertir_asiento_en_fecha`, salida de inventario de lo
   reingresado, cancelación del saldo a favor sin uso o anulación de la devolución (si la caja sigue abierta).
   Ruta `POST /api/notas-credito/[id]/anular`. Se borra `anularNotaCredito` del navegador.
2. `fn_notas_listado(p_tipo, filtros, orden, página)` + KPIs; `GET /api/notas` y `GET /api/notas-credito/[id]`
   (detalle en el servidor, con cadena y job).
3. Conectar «Descargar PDF» al motor (`nota-credito` ya existe).
4. `REVOKE EXECUTE` de `process_credit_note` a `authenticated` (y a `anon` si aplica), o borrarla si no tiene
   llamadores.
5. Numeración: índice único parcial `(organization_id, document_type, number)` en `invoice_sales` **después** de
   decidir qué hacer con el número repetido y `NC-0NaN` (pregunta Q-NC3). Las 4 notas y 2 saldos E2E: borrar o
   marcar como pruebas (misma pregunta).
6. Estado DIAN derivado para la UI: `no_aplica` (factura sin FE), `espera_factura` (factura con FE no aceptada),
   y los del job.

### 4.5 Preguntas

- **Q-N1.** ¿Un solo listado «Notas» con pestañas Crédito · Débito, o dos entradas de menú? *Recomiendo uno*: son
  el mismo documento con signo contrario y el volumen es bajo (28 y 0).
- **Q-NC2.** ¿Nota crédito en borrador? *Recomiendo no*: se emite en un paso, como ya hace la RPC; el borrador
  añade un estado que nadie ha pedido.
- **Q-NC3.** Notas históricas con número roto (`NC-0NaN`, repetido) y datos E2E en producción: *recomiendo* dejar
  las reales como están (ya se reportaron o no tienen FE), borrar las 4 `NC-E2E-*`, sus 2 saldos a favor y la
  cotización `COT-E2E-C` con su factura, previa prueba en seco.

---

## 5. Notas débito

### 5.1 Inventario actual

| Pieza | Estado | Evidencia |
|---|---|---|
| Ruta de envío | **501** «La nota débito electrónica todavía no está disponible.» | `src/app/api/factus/debit-note/route.ts:17-26` |
| Documento | No existe. `invoice_sales.document_type` admite `debit_note` (CHECK) y `invoice_sequences` también | CHECK verificados |
| Numeración | 2 rangos `debit_note` activos, 2 organizaciones, sin resolución (correcto) | §1 |
| Cola | `colaFacturacion.server.ts` despacha factura, NC y DS | commit `90082b83` |
| Saldo | `fn_factura_venta_recalcular_saldo` solo resta notas crédito | definición en la base |
| Pago | `fn_registrar_pago` rechaza `document_type <> 'invoice'` (`documento_invalido`) | definición en la base |
| PDF | El motor no tiene `nota-debito` | `lib/documents/tipos.ts:20-32` |
| Pantalla | Ninguna. `FacturacionConfigPanel.tsx`, `JobsTable.tsx` y `rangosFactus.server.ts` solo nombran el tipo | grep |

### 5.2 Para qué sirve (y por qué el diseño es este)

La nota débito aumenta lo que el cliente debe sobre una factura ya emitida: intereses de mora, gastos de cobro,
un precio que quedó corto, fletes. Ante la DIAN referencia la factura (CUFE) y lleva uno de 4 conceptos
(1 intereses, 2 gastos por cobrar, 3 cambio del valor, 4 otros). Una nota débito aceptada también es la vía para
corregir una nota crédito aceptada que no debía existir.

### 5.3 Propuesta

- **Entrada:** en el detalle de la factura, «⋯ › Nota débito» (junto a «Nota crédito»); en el listado «Notas», «⋯ ›
  Nueva nota débito» con `SelectorDocumento`.
- **`NotaDebitoDialog`** (molde de `NotaCreditoVentaDialog`, `Dialogo` 720, un paso):
  - Concepto DIAN (`Select` 1–4) y motivo (≥ 5 caracteres).
  - Líneas a cobrar: `DocumentoLineas` edición con «Ítem manual» (descripción, cantidad, valor unitario, impuesto
    por línea con `MultiSelect`); atajo «Intereses de mora» que propone la línea con la tasa y los días vencidos
    que calcule el servidor (solo si el dueño lo aprueba, Q-ND3).
  - `DocumentoTotales` de la nota y «Qué pasa al emitir»: «FV-1042 pasa a deber 1.767.532 + 45.000» o «se crea
    una cuenta por cobrar de 45.000 con vencimiento …» (según Q-ND1), «se envía a la DIAN» si el servicio está
    activo.
  - Pie: Cancelar · **Emitir nota débito**. Deshabilitado con motivo si la factura está anulada o en borrador.
- **Detalle** `/app/finanzas/notas-debito/[id]`: igual que la nota crédito, con icono `FilePlus`, cadena Factura →
  **Nota débito** → Cartera → Pagos → Asiento, `RegistrarPagoDialog` («Registrar pago») si la ND tiene cartera
  propia, `DianPanel`.
- **Listado:** pestaña «Débito» del listado de notas (§4.3).
- **Estados**: los de §4.3; vacío de la pestaña: «Aún no hay notas débito. Se emiten desde una factura para cobrar
  intereses, gastos o un ajuste de precio.»

### 5.4 Backend que falta (todo)

1. **`fn_nota_debito_emitir(p_invoice_id, p_concepto, p_lineas jsonb, p_motivo, p_clave)`**, SECURITY DEFINER con
   guarda de organización y permiso: valida factura emitida y viva; número con
   `fn_get_next_invoice_number(org, sucursal, 'debit_note')`; inserta `invoice_sales` (`document_type='debit_note'`,
   `related_invoice_id`, total positivo), `invoice_items` e `invoice_applied_taxes` con impuestos resueltos en el
   servidor; idempotente.
2. **Saldo y cartera** (según Q-ND1):
   - *Opción A (recomendada): la ND es su propio documento por cobrar.* `tr_create_account_receivable` ya crea la
     cartera al insertar con estado ≠ borrador; `fn_factura_venta_recalcular_saldo` debe aceptar
     `document_type='debit_note'` (hoy solo excluye `credit_note`, así que ya la trataría como factura: verificarlo
     en prueba en seco) y `fn_registrar_pago` debe admitir `debit_note` además de `invoice`.
   - *Opción B:* sumar las ND vivas al saldo de la factura original (`total + ND − pagado − NC`) y no crear cartera
     propia. Más simple para el cliente, pero mezcla vencimientos.
3. **Asiento**: `fn_auto_journal_debit_note` (débito cuenta por cobrar, crédito ingreso o 4210 según concepto e IVA
   generado), simétrico a `fn_auto_journal_credit_note`; y su reversión al anular.
4. **Anular**: `fn_nota_debito_anular(p_id, p_motivo)` (bloqueada si la DIAN la aceptó o si tiene pagos).
5. **Cola DIAN**: payload de nota débito en `payloadsFactus.ts` (referencia a la factura por número y CUFE,
   concepto, líneas) y despacho en `colaFacturacion.server.ts`; `document_type='debit_note'` ya lo admite el CHECK
   de la cola. La ruta 501 se sustituye por el encolado, como la NC.
6. **PDF**: tipo `nota-debito` en `lib/documents/tipos.ts`, `motor.ts` y `permisos.ts` (reutiliza `cargarVenta`).
7. **Rutas**: `GET/POST /api/facturas-venta/[id]/nota-debito` (contexto y emitir), `GET /api/notas-debito/[id]`,
   `POST /api/notas-debito/[id]/anular`.
8. **Textos**: namespace `notasDebito` en 4 idiomas.

### 5.5 Preguntas

- **Q-ND1.** ¿La nota débito es una cuenta por cobrar propia (A) o aumenta el saldo de la factura (B)? *Recomiendo
  A*: vencimiento propio, se paga con el pago único y la antigüedad de la factura no se altera.
- **Q-ND2.** ¿Entra en esta fase? El plan de ventas la dejó en fase 2 (D8). *Recomiendo dibujarla ahora* (3 frames
  de escritorio y 2 móviles) y construirla cuando la FE esté activa en al menos una organización.
- **Q-ND3.** ¿Intereses de mora calculados por el sistema? *Recomiendo no por ahora*: línea manual; el cálculo
  necesita la tasa de usura vigente y una política por organización.

---

## 6. Saldos a favor

### 6.1 Inventario actual y flujo

| Pieza | Archivo | Nota |
|---|---|---|
| Ruta | `saldos-a-favor/page.tsx` → `SaldosAFavorPage.tsx` (195) | Menú: Tesorería (`catalog.ts:390`) |
| Pantalla | `Card` «Total disponible» (suma en el navegador, `:71`), `ui/table` (Cliente · Monto · Usado · Disponible · Vence · Estado · Acciones), `Badge` con colores propios y `dark:` (`:33-35`), textos en español cableados | Sin búsqueda, filtros, paginación, origen ni historial |
| Tabla | `credit_notes` = **saldos a favor** (`amount`, `balance`, `status` active · used · expired · cancelled, `expiry_date`, `source_credit_note_id`); `credit_note_applications` | RLS `ALL` para `authenticated`: **cualquier miembro puede escribir saldos directamente** |
| Listar | `saldosAFavorService.listar` (`:48-86`): con sucursal, `select` directo; sin sucursal, `fn_list_customer_credits` | Navegador |
| Nuevo manual | `NuevoSaldoFavorDialog.tsx` (189) → `fn_create_customer_credit` (`service:117-134`) | Clientes: **todos** los de la organización en un `Select` (`listarClientes`, `:89-98`). «Cuenta de caja» como texto libre con `'1110'` por defecto (`dialog:49`, `service:126`). La RPC inserta el saldo y un asiento débito a esa cuenta / crédito 2805, **sin pago ni movimiento de caja**: el efectivo recibido no entra al arqueo. Sin permiso, sin validar que el cliente sea de la organización. Vencimiento como fecha sin zona |
| Aplicar | `AplicarSaldoFavorDialog.tsx` (164) → `fn_apply_customer_credit` | Facturas pendientes con `.is('document_type', null)` (`service:103-115`): **solo salen las del POS**, nunca las 913 creadas en Finanzas; filtra un estado `overdue` que no existe. La RPC escribe `invoice_sales.balance` a mano y asienta 2805/1305 |
| Orígenes automáticos | excedente de nota crédito (`fn_liquidar_excedente_nota_credito`, desde `fn_nota_credito_emitir`); devolución del POS (`procesar_devolucion`, `lib/pos/devoluciones/procesarDevolucion.ts`); sobrante del pago único (`fn_registrar_pago` con `p_anticipo`, que además crea un pago `source='customer_credit'` para que la caja lo cuente) | Hoy los 4 saldos vienen de notas crédito |
| Dónde se ve | ficha y cartera del cliente (`/api/clientes/[id]/cartera/route.ts:37-58`, KPI en `CarteraCliente.tsx:151`); estado de cuenta (`cargadores/estadoCuenta.ts`) | — |
| Dónde se usa | solo en esta página | **No** en el POS ni en `RegistrarPagoDialog` |
| Devolver el dinero · cancelar · vencer | no existen | `status` los admite; ninguna función los escribe |

### 6.2 Problemas

| # | Tipo | Problema | Evidencia |
|---|---|---|---|
| S-1 | Datos | La aplicación se deshace en el siguiente recálculo: `fn_factura_venta_recalcular_saldo` no cuenta `credit_note_applications` | definición de ambas funciones |
| S-2 | Lógica | Aplicar solo ve facturas del POS | `saldosAFavorService.ts:108` |
| S-3 | Dinero | El saldo manual no pasa por caja ni por método de pago; la cuenta contable la escribe el usuario | `NuevoSaldoFavorDialog.tsx:49`, `fn_create_customer_credit` |
| S-4 | Seguridad | `credit_notes` con política `ALL`; `fn_create_customer_credit` y `fn_apply_customer_credit` sin permiso de finanzas, ejecutables por `authenticated` | `pg_policies`, `has_function_privilege` |
| S-5 | UX | No se puede devolver el saldo al cliente ni anularlo con motivo | §6.1 |
| S-6 | UX | No se ve de dónde salió cada saldo ni en qué se usó | §6.1 |
| S-7 | Rendimiento | El selector baja todos los clientes (la base tiene más de 35.000) | `listarClientes` |
| S-8 | UI | Sin kit, sin i18n, `dark:` | §6.1 |

### 6.3 Propuesta

**Listado** (`/app/finanzas/saldos-a-favor`; propuesta de menú: grupo «Cartera», junto a cuentas por cobrar, Q-S3):
- `PageHeader`: icono `PiggyBank`, subtítulo «organización · sucursal»; primaria **«Registrar anticipo»**; «⋯»
  Exportar.
- `KpiStrip`: **Disponible** (total) · Clientes con saldo · Usado en el periodo · Devuelto en el periodo.
- `ListToolbar`: buscador por cliente o documento; `FilterPanel`: estado, origen (Nota crédito · Devolución ·
  Pago con sobrante · Anticipo), periodo, «Solo con saldo».
- `DataTable`: Cliente + documento · Origen (`ChipDocumento` al documento que lo creó: NC-0007, DEV-0112, RC-000031)
  · Fecha · Valor original · Usado · **Disponible** · Estado · acciones rápidas **Aplicar** y **Devolver** · «⋯»
  (Ver movimientos, Ver cliente, divisor, Anular). `ListCard` en móvil.
- Vacío con primer paso: «Aquí aparecen los anticipos y lo que le debes a tus clientes: sobrantes de un pago,
  devoluciones y notas crédito.»

**Detalle en hoja lateral** (`PanelAdaptable` 560, sin ruta propia): `ListaDatos` (cliente, origen con enlace,
fecha, valor, disponible, sucursal), `CadenaDocumento` Origen → **Saldo a favor** → aplicaciones (factura por
factura) → devolución, y `HistorialDocumento`.

**Aplicar a factura** (`RegistrarPagoDialog destino="tercero"` con el método **«Saldo a favor»**): el pago único
ya reparte entre las facturas abiertas del cliente (FIFO, `RepartoTercero.tsx`); el saldo a favor entra como un
método más, con su disponible como tope y sin caja. Así «Aplicar» es lo mismo en esta página, en la cartera del
cliente, en el detalle de la factura y en el POS. No se mantiene `AplicarSaldoFavorDialog`.

**Registrar anticipo**: `RegistrarPagoDialog destino="tercero"` sin facturas seleccionadas: todo el valor va a saldo
a favor, con método real (efectivo exige caja abierta), recibo `RC-` y asiento del pago único. Sustituye
`NuevoSaldoFavorDialog` (sin cuenta contable libre).

**Devolver** (Nuevo): `Dialogo` 520: disponible, valor a devolver (≤ disponible), método (`SelectorMetodoPago` con los
de la organización; efectivo exige caja abierta, P6), cuenta bancaria si es transferencia, motivo. Resultado:
comprobante de egreso del motor (`comprobante-egreso` ya existe).

**Anular** (`DialogoMotivo`): solo sin aplicaciones; consecuencias («se revierte el asiento 2805»); bloqueado con
salida «Devolver» si hubo dinero de por medio.

**Estados**: 7 de listado; hoja: cargando, error.

**Coherencia**: KPI «Saldo a favor» de la cartera del cliente (`CarteraCliente.tsx:151`) enlaza a este listado
filtrado; el POS muestra el disponible en el `CustomerPicker` (insignia «A favor $ 180.000») y lo ofrece como método.

### 6.4 Backend necesario

1. **Arreglar S-1 antes de cualquier pantalla.** Aplicar un saldo a favor debe ser **un pago**: método
   `saldo_a_favor` en `fn_registrar_pago` (`p_credito_id`), que en la misma transacción descuenta
   `credit_notes.balance`, registra `credit_note_applications` y crea el `payments` sobre la cuenta de la factura
   (`source='account_receivable'`), que los disparadores ya suman. Caja: método sin efectivo (no cuenta en el
   arqueo). Asiento 2805/1305 como hoy. `fn_apply_customer_credit` pasa a delegar ahí o se revoca. Con 0
   aplicaciones, no hay datos que migrar.
2. **Devolver:** `fn_saldo_a_favor_devolver(p_credito_id, p_monto, p_metodo, p_cuenta_bancaria, p_motivo, p_clave)`:
   egreso (`payments` salida o `cash_movements` según método), asiento 2805 contra caja o banco, caja abierta para
   efectivo, `status='used'` si queda en 0. Permiso `finance.void` o `finance.approve`.
3. **Anular:** `fn_saldo_a_favor_anular(p_credito_id, p_motivo)`: solo sin aplicaciones ni devoluciones;
   `status='cancelled'` y contra-asiento.
4. **Anticipo:** `fn_registrar_pago` ya lo hace con `p_anticipo` (sobrante). Admitir cobro **sin documentos** (todo a
   anticipo) con el cliente como destino. Retirar `fn_create_customer_credit` del navegador (queda para uso interno
   de las RPC) y validar en ella que el cliente sea de la organización.
5. **Origen:** columna aditiva `credit_notes.origin text NULL` (`nota_credito · devolucion · pago · anticipo ·
   manual_historico`) y `origin_id`, rellenada por las RPC; backfill de los 4 con `source_credit_note_id`.
6. **Listado:** `fn_saldos_a_favor_listado` + KPIs; `GET /api/saldos-a-favor`, `GET /api/saldos-a-favor/[id]`
   (movimientos), `POST …/[id]/devolver`, `POST …/[id]/anular`.
7. **RLS:** `credit_notes` y `credit_note_applications` solo `SELECT` para `authenticated`; las escrituras, solo por
   RPC.
8. **Cliente en el selector:** búsqueda en el servidor (`CustomerPicker` con `buscar`), nunca la lista completa.
9. **POS:** el cobro del POS acepta el método «Saldo a favor» por la misma función (coordinar con el agente del POS).

### 6.5 Preguntas

- **Q-S1.** ¿Los saldos a favor vencen? *Recomiendo no por defecto*: es dinero del cliente; si una organización
  quiere vencimiento (bonos de devolución), se configura y al vencer se registra como ingreso con asiento, nunca en
  silencio.
- **Q-S2.** Devolver en efectivo: ¿exige caja abierta como el cobro? *Recomiendo sí* (misma regla que el pago
  único).
- **Q-S3.** ¿El menú lo pone en «Cartera» junto a cuentas por cobrar, o sigue en «Tesorería»? *Recomiendo Cartera*:
  el usuario lo busca desde el cliente, no desde los bancos.

---

## 7. Facturación electrónica

### 7.1 Inventario actual (lo que cambió desde el 09-23)

| Pieza | Estado hoy | Evidencia | Cambio desde el 09-23 |
|---|---|---|---|
| Credenciales | **funciona** para el modelo de plataforma: Vault, `fn_factus_credenciales_guardar/_leer` (EXECUTE solo `service_role`), trigger `trg_eic_sin_secretos_en_claro`, RLS de solo lectura | `90082b83`; `pg_proc`, `pg_trigger`, `pg_policies` | antes, texto plano leído desde el navegador |
| Cargar credenciales (equipo de GO Admin) | **no existe** pantalla: ni en `go-admin-super` ni en el ERP. Solo SQL o MCP | grep en `go-admin-super/src` sin resultados | — |
| Activación | `verificarYActivar`: login + `GET /v2/companies`, activa si el NIT coincide; la base lo vuelve a comprobar (`fn_factus_servicio_estado`) | `accesoFactus.server.ts`, `config/route.ts:102-104` | nuevo |
| Cola | cron `*/2` (`vercel.json:61-62`), `fn_einvoicing_reclamar_jobs` con `SKIP LOCKED`, reintentos 2·4·8·16 min, 5 máx., 4xx = rechazo sin reintento, despacho por tipo (factura, NC, DS), retención con `hold_reason` si el servicio no está activo | `colaFacturacion.server.ts`, `politicaReintentos.ts` | antes, sin procesador |
| Webhook | usa `reference_code` real | `webhook/route.ts` | antes buscaba una columna inexistente |
| CUFE, número y QR | `xml_uuid`, `einvoice_number`, `einvoice_qr` (existen) | columnas de `invoice_sales` | antes, columnas inexistentes |
| Rango al emitir | por sucursal y tipo; con duplicados usa el más reciente y avisa | commit `90082b83` | antes, sin sucursal |
| Bandeja | **vieja**: `page.tsx` (381) con `supabase` y `getOrganizationId()` del navegador (`:17-18`), `StatsCards`/`JobsTable`/`JobFilters`/`JobDetailDialog` con `ui/*` y 85 `dark:` en total, KPIs contados bajando todos los envíos (`:94-122`), paginación propia de 20 (`:58-60`), enlace a la documentación del proveedor (`:297-303`), **sin retenidos** | archivos citados | textos ya en `next-intl` |
| Detalle del envío | `JobDetailDialog.tsx` (267): muestra `request_payload` y `response_payload` crudos (`:115-116`), CUFE con copiar, QR; descarga solo si aceptado | — | — |
| Reintentar / cancelar | `POST/DELETE /api/factus/jobs` con `withOrg`, permiso en el servidor y `fn_einvoicing_accion_manual`; un reintento no libera una retención | `jobs/route.ts:8-21,118-190` | antes, sin permiso ni organización |
| Retenidos | se ven y se liberan («Enviar con la fecha de hoy») solo en la configuración | `ConfiguracionServicioFE.tsx:304-329`; `config/route.ts:126-131` | nuevo |
| Configuración del cliente | `/app/finanzas/facturacion-electronica/configuracion` → `ConfiguracionServicioFE.tsx` (382): kit (`PageHeader`, `FormSection`, `KpiStrip`, `DataTable`, `EmptyState`), 4 idiomas, 0 `dark:`. Estado del servicio (activo · pendiente de activación · suspendido), ambiente, NIT, activo desde, última verificación, «Verificar»; KPIs de la cola; retenidos; rangos con «Sincronizar» por sucursal | `:203-330` | nuevo |
| Configuración duplicada | `/app/configuracion › facturación` → `FacturacionConfigPanel.tsx` + `CredencialesFactusSection.tsx`: vuelve a mostrar el estado, la preferencia «facturar siempre electrónica» y los rangos | `FacturacionConfigPanel.tsx:60,95,171-193` | — |
| Resoluciones | solo lectura + «Sincronizar» desde la cuenta del proveedor; sin alta manual, sin alerta por `alert_threshold` ni por vencimiento | `ConfiguracionServicioFE.tsx:331-368` | — |
| Nota débito | 501 | §5 | nuevo (antes, llamada rota) |
| RADIAN | no existe | — | — |
| Permisos | `GET config` `finance.view`; `POST config` administrador o `finance.approve`; `jobs` `finance.*` | `config/route.ts:4-15` | nuevo |

**Flujo hoy:** una venta o factura con «electrónica» encola un envío → si la organización no está activa, queda
**retenido** con su motivo → cuando GO Admin carga las credenciales (por SQL) y alguien pulsa «Verificar», el cron
empieza a enviar lo nuevo; lo retenido espera a que una persona lo libere, porque el proveedor lo emite con la
fecha del día → aceptado: CUFE, número y QR en la factura; rechazado: motivo en el envío; error de red: reintento
automático.

### 7.2 Problemas

| # | Tipo | Problema | Evidencia |
|---|---|---|---|
| FE-1 | Operación | No hay forma de activar una organización sin SQL: falta la consola de plataforma | `go-admin-super` sin Factus |
| FE-2 | UX | La bandeja esconde los retenidos (se ven como «pendiente» sin motivo) y no permite liberarlos; la configuración sí | `JobsTable.tsx`, `ConfiguracionServicioFE.tsx` |
| FE-3 | UX | Tres lugares para lo mismo (bandeja, configuración de Finanzas, configuración general) con datos distintos | §7.1 |
| FE-4 | Rendimiento | KPIs contados en el navegador bajando todos los envíos | `page.tsx:94-122` |
| FE-5 | UX / marca | El cliente ve el proveedor: enlace a su documentación, JSON crudo, «job» | `page.tsx:297-303`, `JobDetailDialog.tsx:115-116` |
| FE-6 | UX | No se avisa que la resolución se agota o vence (`alert_threshold` sin lector) | §7.1 |
| FE-7 | UX | Ningún aviso fuera de la bandeja: un rechazo solo se ve si alguien entra | — |
| FE-8 | Diseño | El Figma de configuración pide credenciales al cliente | §2.3 |
| FE-9 | Datos | 8 retenidos desde hace 24 a 48 días, pendientes de decisión | §1 |

### 7.3 Propuesta — Bandeja de envíos (`/app/finanzas/facturacion-electronica`)

- `PageHeader`: «Facturación electrónica», icono `Zap`, subtítulo con el estado del servicio («Servicio de GO Admin
  · Activo desde 12/10/2026» o «Pendiente de activación»); acciones «Configuración» (secundaria) y «⋯» Exportar. Sin
  «Procesar cola».
- **Banda de estado del servicio** (`Aviso`, tono según estado), solo si no está activo:
  - Pendiente de activación: «Tus documentos quedan guardados y se envían cuando GO Admin active tu cuenta ante la
    DIAN.» + «Ver requisitos».
  - Suspendido: motivo + contacto de soporte.
- **Banda de retenidos** si hay: «8 documentos esperan tu confirmación. Se enviarán con la fecha de hoy, no con la de
  la venta.» + «Revisar».
- `KpiStrip` que filtra: En cola · **Retenidos** (advertencia) · Aceptados en el mes (con % de éxito) · Rechazados
  (peligro) · Con error (reintento programado).
- `TabBar`: **Todos · Por atender** (retenidos + rechazados + agotados) · Aceptados. («Recibidos (RADIAN)» en fase 2.)
- `ListToolbar`: buscador (número, cliente, código único); `FilterPanel`: tipo de documento (factura · nota crédito ·
  nota débito · documento soporte), estado, periodo, sucursal.
- `DataTable`: casilla · Documento (número + tipo, `ChipDocumento`) · Tercero · Total · Estado DIAN
  (`FactusStatusBadge`, con «Retenido») · Intentos («2 de 5») · Último intento + respuesta corta · Próximo («10:20»,
  «Espera tu confirmación») · acciones rápidas según estado (Enviar ahora · Reintentar · Corregir) · «⋯» (Ver
  detalle, Ver documento, Descargar PDF y XML si aceptado, divisor, Cancelar envío).
- `BulkActionBar`: **Enviar retenidos seleccionados** (con confirmación de la fecha) · Reintentar · «⋯» Cancelar.
- Vacío: sin servicio → «Aún no emites factura electrónica» + requisitos; con servicio y sin envíos → «Todavía no hay
  documentos enviados».

### 7.4 Propuesta — Detalle del envío

`PanelAdaptable` 672 (hoja en móvil), sin ruta propia:
- Cabecera: documento y tercero, `FactusStatusBadge`.
- `DianTimeline`: creado → retenido (motivo) o en cola → enviado (intento n de 5) → respuesta de la DIAN en lenguaje
  humano («El NIT del cliente no es válido») → siguiente paso.
- «Qué hacer»: según el estado, **una** acción: Enviar ahora (retenido), Corregir el cliente y reenviar (rechazo por
  datos del tercero, enlaza a la ficha), Reintentar (error), nada (aceptado).
- Aceptado: número DIAN, código único con copiar, QR, «PDF oficial» y «XML».
- «Detalles técnicos» plegado (`SeccionPlegable`), solo para `finance.approve`: código de respuesta y mensaje; nunca el
  JSON crudo.

### 7.5 Propuesta — Servicio de facturación electrónica (`/facturacion-electronica/configuracion`)

Sustituye E1–E7 del 09-23. **El cliente no ve credenciales ni ambientes.**
- `PageHeader` form-less: «Facturación electrónica — Servicio», migas Finanzas › Facturación electrónica ›
  Servicio.
- Tarjeta **Estado del servicio** (`Tarjeta` + `ListaDatos`): «Prestado por GO Admin», estado (`StatusBadge`:
  Activo · Pendiente de activación · Suspendido), NIT con el que emites, activo desde, última verificación
  («Verificar ahora» para `finance.approve`).
- Tarjeta **Pasos para activar** (solo si no está activo), lista de comprobación con estado de cada paso y quién
  lo hace:
  1. Datos del emisor completos (NIT y DV, razón social, régimen, responsabilidades, municipio, correo de
     recepción) → «Completar en Organización» (el cliente).
  2. Resolución de facturación de la DIAN con GO Admin como proveedor tecnológico → «Cómo solicitarla» (el cliente,
     en el portal de la DIAN).
  3. Cuenta creada y habilitada por GO Admin (GO Admin).
  4. Primer documento de prueba aceptado (automático).
  Botón **«Solicitar activación»** cuando 1 y 2 están listos (Q-FE1).
- Tarjeta **Resoluciones y numeración**: `RangoNumeracion` por tipo y sucursal (consumo, vigencia, estado) con
  aviso «se agota en ~9 días» / «vence en 20 días»; «Sincronizar» por sucursal (`finance.approve`); enlace a la
  página de resoluciones.
- Tarjeta **Comportamiento**: «Facturar siempre como electrónica» (la preferencia que hoy vive en
  `FacturacionConfigPanel`), «Enviar el PDF y el XML al correo del cliente cuando la DIAN acepte».
- Tarjeta **Documentos retenidos** (si hay): lista con fecha de la venta y «Enviar con la fecha de hoy» / «Cancelar».
- `/app/configuracion › facturación` deja de repetir: muestra el estado en una línea y enlaza aquí.

### 7.6 Propuesta — Resoluciones y numeración (`/facturacion-electronica/resoluciones`, Nuevo como ruta)

R1–R9 del 09-23 con las correcciones de §2.3 y estos cambios:
- Sin «Nueva resolución» para el cliente si el dueño decide que los rangos los crea GO Admin en el proveedor
  (Q-FE2); en su lugar, «Sincronizar» y «Solicitar a GO Admin».
- Filas por sucursal; NC y ND «Numeración propia, sin resolución».
- Banda de aviso por `alert_threshold` y por vencimiento (30, 15 y 7 días).

### 7.7 Backend necesario

1. **Consola de plataforma** en `go-admin-super`: lista de organizaciones con estado del servicio, formulario para
   cargar o rotar credenciales (llama a `fn_factus_credenciales_guardar` con `service_role`), «Verificar y
   activar», «Suspender», registro de quién hizo qué. Sin esto, FE-1 sigue.
2. `fn_einvoicing_resumen(p_org)`: KPIs en el servidor (incluye `held` como hoy hace `config/route.ts:74-75`), y
   `GET /api/factus/jobs` con filtro por tipo, búsqueda y la retención; la bandeja deja de usar `supabase` del
   navegador.
3. Liberar y cancelar en lote: `POST /api/factus/config` `liberar` acepta varios `jobId` (hoy uno).
4. Solicitud de activación: tabla aditiva `einvoicing_activation_requests (organization_id, requested_by,
   requested_at, status, notes)` o un ticket de soporte; notificación al equipo de GO Admin.
5. Avisos: notificación (campana y correo) al rechazo, a los reintentos agotados y al umbral de numeración; lector
   de `alert_threshold`.
6. Detalle del envío: respuesta traducida a lenguaje humano por código (`respuestaFactus.ts` ya normaliza); no se
   expone el payload al cliente.
7. `FacturacionConfigPanel`: quitar la sección de estado repetida y la de rangos; dejar la preferencia o moverla.
8. Rangos: alta manual en la consola de plataforma si GO Admin los crea (Q-FE2).
9. Nota débito en la cola (§5.4.5).
10. RADIAN (fase 2): recepción de facturas de proveedores y eventos 030–034.

### 7.8 Preguntas

- **Q-FE1.** ¿La activación la pide el cliente con un botón («Solicitar activación») o la inicia GO Admin por su
  cuenta al vender el plan? *Recomiendo el botón*: deja registro de quién la pidió y cuándo, y el equipo recibe
  el aviso.
- **Q-FE2.** ¿Quién registra las resoluciones y rangos en el proveedor? *Recomiendo GO Admin* (encaja con el plan
  SaaS); el cliente solo solicita la resolución a la DIAN, y en el ERP ve y sincroniza.
- **Q-FE3.** Los 8 retenidos (2 organizaciones, facturas pagadas, 24 a 48 días): ¿se envían con la fecha de hoy
  cuando se active el servicio, o se cancelan con constancia? *Recomiendo cancelarlos con constancia* si la
  organización no los pide: el proveedor los emitiría con fecha de hoy y el periodo de la venta ya cerró.
- **Q-FE4.** ¿El correo al cliente con PDF y XML lo manda el proveedor o GO Admin? *Recomiendo el proveedor*
  (`send_email`), con la plantilla de la organización cuando se pueda.
- **Q-FE5.** RADIAN: ¿fase 2? *Recomiendo fase 2*: no hay aún ni una factura emitida.

---

## 8. Backend consolidado, en orden

| Orden | Cambio | Por qué primero | Sección |
|---|---|---|---|
| 1 | Saldo a favor como método del pago único; revocar escrituras directas en `credit_notes` | S-1 deshace aplicaciones (hoy 0) | §6.4 |
| 2 | `fn_nota_credito_anular` y retirar `anularNotaCredito` del navegador; revocar `process_credit_note` | N-1 corrompe saldos en cuanto alguien anule | §4.4 |
| 3 | `fn_cotizacion_convertir` sobre `fn_factura_venta_guardar`; retirar `convertToInvoice` | C-1: pierde IVA | §3.4 |
| 4 | Consola de plataforma para credenciales y activación | FE-1: nadie puede emitir | §7.7 |
| 5 | Listados y KPIs en el servidor (cotizaciones, notas, saldos, bandeja) + rutas `withOrg` | patrón común | §3.4, §4.4, §6.4, §7.7 |
| 6 | Guardar cotización en transacción + número único + UNIQUE | C-3 | §3.4 |
| 7 | Devolver y anular saldo a favor; origen del saldo | S-5, S-6 | §6.4 |
| 8 | Enviar cotización y notas por correo (motor + `EnviarDocumentoDialog`) | C-4, N-4 | §3.4, §4.4 |
| 9 | Nota débito completa | Q-ND2 | §5.4 |
| 10 | Avisos de FE y de numeración; solicitud de activación | FE-6, FE-7 | §7.7 |

Todas las migraciones: aditivas, por el MCP, con `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/`, prueba en seco con `DO … RAISE` antes de aplicar.

---

## 9. Frames a dibujar

Tamaños: escritorio 1440 (alto según contenido), tableta 768 × 1024 (por debajo de `lg`: usa las variantes móviles
del kit con dos columnas donde quepan), móvil 390 × 844. Nombres: «Escritorio / {Pantalla} — {estado}» para que el
script de coherencia los reconozca. Datos ficticios. Donde el 09-23 ya dibujó el frame, «rehacer» = clonar y
corregir según §2.3 y la sección de la página; los viejos van a `99 Descartes` con el prefijo «SUSTITUIDO».

### Prioridad 1 — bloquean el uso real o contradicen una decisión

| # | Frame | Escritorio | Tableta | Móvil | Base |
|---|---|---|---|---|---|
| 1 | FE · Servicio: pendiente de activación (pasos, «Solicitar activación») | ✓ | ✓ | ✓ | rehacer E1 |
| 2 | FE · Servicio: activo (estado, resoluciones, comportamiento) | ✓ | — | ✓ | rehacer E3 |
| 3 | FE · Servicio: suspendido · cargando · sin permiso · error | ✓ ×4 | — | — | rehacer E5–E7 |
| 4 | FE · Bandeja: listo con banda de retenidos y pestaña «Por atender» | ✓ | ✓ | ✓ | rehacer B1 |
| 5 | FE · Bandeja: servicio pendiente (banda + vacío con requisitos) | ✓ | — | ✓ | rehacer B5 |
| 6 | FE · Bandeja: selección de retenidos + confirmar «con la fecha de hoy» | ✓ | — | ✓ | rehacer B2/B4 |
| 7 | FE · Detalle del envío: retenido · rechazado (corregir) · aceptado | ✓ ×3 | — | ✓ ×2 | rehacer B3, M2 |
| 8 | Saldos a favor · listado listo | ✓ | ✓ | ✓ | Nuevo |
| 9 | Saldos a favor · aplicar (pago único con método «Saldo a favor») | ✓ | — | ✓ | sobre P1–P4 `741:53717` |
| 10 | Saldos a favor · devolver (efectivo, transferencia, sin caja) | ✓ ×2 | — | ✓ | Nuevo |
| 11 | Saldos a favor · detalle en hoja (cadena y movimientos) | ✓ | — | ✓ | Nuevo |
| 12 | Notas · anular nota crédito (consecuencias) y bloqueado (DIAN aceptó · saldo usado) | ✓ ×2 | — | ✓ | Nuevo sobre `DialogoMotivo` |
| 13 | Cotización · convertir en factura (borrador por defecto, emitir ahora) y resultado | ✓ ×2 | — | ✓ | rehacer C9 |
| 14 | Cotización · detalle por estado: borrador · enviada · vencida · convertida | ✓ ×4 | ✓ (enviada) | ✓ ×2 | rehacer C7, C8 |

### Prioridad 2 — flujo completo y listados

| # | Frame | Escritorio | Tableta | Móvil | Base |
|---|---|---|---|---|---|
| 15 | Cotizaciones · listado listo con KPIs | ✓ | ✓ | ✓ | rehacer C1 |
| 16 | Cotizaciones · vacío · sin resultados · cargando · error · sin permiso · sin sucursal | ✓ ×6 | — | ✓ ×3 | rehacer C2–C6 |
| 17 | Cotización · enviar (`EnviarDocumentoDialog`) | ✓ | — | ✓ | rehacer C10 |
| 18 | Cotización · nueva y editar (formulario compartido con factura) | ✓ ×2 | ✓ | ✓ | rehacer C11 |
| 19 | Notas · listado con pestañas Crédito · Débito | ✓ ×2 | ✓ | ✓ | rehacer N1 |
| 20 | Notas · nueva nota crédito desde el listado (`SelectorDocumento`) | ✓ | — | ✓ | rehacer N2 |
| 21 | Nota crédito · detalle: emitida sin FE · aceptada · rechazada · anulada | ✓ ×4 | ✓ | ✓ ×2 | rehacer N7, N8 |
| 22 | Notas · estados del listado (7) | ✓ ×6 | — | ✓ ×3 | rehacer N9–N13 |
| 23 | Nota débito · diálogo (líneas manuales, qué pasa al emitir) | ✓ | — | ✓ | rehacer N6 |
| 24 | Nota débito · detalle con cartera propia y «Registrar pago» | ✓ | — | ✓ | Nuevo |
| 25 | Saldos a favor · estados (vacío, sin resultados, cargando, error, sin permiso) y anular | ✓ ×6 | — | ✓ ×3 | Nuevo |
| 26 | Resoluciones · listo con avisos de agotamiento y vencimiento | ✓ | ✓ | ✓ | rehacer R1 |

### Prioridad 3

| # | Frame | Escritorio | Tableta | Móvil | Base |
|---|---|---|---|---|---|
| 27 | Resoluciones · vacío · cargando · error · sin permiso · sincronizar (diferencias) | ✓ ×5 | — | ✓ | rehacer R3–R8 |
| 28 | Bandeja · sin resultados · cargando · error · sin permiso | ✓ ×4 | — | ✓ ×2 | rehacer B6–B9 |
| 29 | `DocumentoImpreso` nota débito y comprobante de devolución de saldo | carta + 80 mm | — | — | ampliar D3 |
| 30 | Consola de plataforma (go-admin-super): credenciales y activación por organización | ✓ ×2 | — | — | Nuevo (fuera del archivo del ERP, a decidir) |

Componentes a dibujar o corregir en `02 Componentes` antes de las pantallas: `EnviarDocumentoDialog`,
`SelectorDocumento`, `HistorialDocumento`, estados nuevos de `StatusBadge` (§2.4), `FactusStatusBadge` con
«Retenido» y «No aplica», y el método «Saldo a favor» en `SelectorMetodoPago` (con su disponible).

Total aproximado: 30 grupos, ~95 frames (≈ 60 escritorio, 8 tableta, 27 móvil). Es más de lo que da un cupo del
MCP de Figma: conviene dibujar la prioridad 1 en una tanda, verificar con captura y seguir.

---

## 10. Preguntas para el dueño (índice)

| # | Pregunta | Recomendación |
|---|---|---|
| Q-C1 | ¿Cotización del ERP y propuesta del CRM son el mismo documento? | Sí: una tabla, un número, una conversión |
| Q-C2 | ¿La factura nacida de una cotización nace emitida o en borrador? | Borrador, con casilla «Emitir ahora» |
| Q-C3 | ¿Se convierte una cotización vencida? | Sí, con aviso y sus precios |
| Q-N1 | ¿Un listado «Notas» con Crédito · Débito o dos menús? | Uno |
| Q-NC2 | ¿Nota crédito en borrador? | No |
| Q-NC3 | ¿Qué hacer con números rotos y datos E2E en producción? | Dejar las reales; borrar las E2E con prueba en seco |
| Q-ND1 | ¿Nota débito con cartera propia o sumada a la factura? | Cartera propia |
| Q-ND2 | ¿La nota débito entra ya? | Dibujar ahora; construir cuando haya FE activa |
| Q-ND3 | ¿Intereses de mora calculados? | No por ahora |
| Q-S1 | ¿Vencen los saldos a favor? | No por defecto |
| Q-S2 | ¿Devolver en efectivo exige caja abierta? | Sí |
| Q-S3 | ¿Saldos a favor en el grupo «Cartera»? | Sí |
| Q-FE1 | ¿Activación con «Solicitar activación» del cliente? | Sí |
| Q-FE2 | ¿Quién crea resoluciones y rangos en el proveedor? | GO Admin |
| Q-FE3 | ¿Los 8 retenidos se envían con fecha de hoy o se cancelan? | Cancelar con constancia, salvo que la organización los pida |
| Q-FE4 | ¿Quién manda el correo con PDF y XML al cliente? | El proveedor |
| Q-FE5 | ¿RADIAN ahora? | Fase 2 |
| Q-G1 | ¿Se dibuja la consola de plataforma (go-admin-super) en este archivo de Figma? | Sí, en una página propia «Plataforma», porque sin ella no se activa a nadie |

---

## Anexo — consultas de verificación (solo lectura)

- Conteos de `invoice_sales` por `document_type`, `status` y `einvoice_status`; `quotations` por estado, con
  vencimiento, conversión y comparación de `tax_total` contra la factura convertida.
- `credit_notes`, `credit_note_applications`, `payment_groups`, `payments` por `source` desde el 2026-09-24.
- `electronic_invoicing_jobs` (estado, intentos, `hold_reason`, antigüedad), `electronic_invoicing_events`,
  `electronic_invoicing_config`, `invoice_sequences` por tipo, vigencia y sucursal.
- Definiciones de `fn_apply_customer_credit`, `fn_create_customer_credit`, `fn_liquidar_excedente_nota_credito`,
  `fn_factura_venta_recalcular_saldo`, `fn_invoice_sales_acreditado`, `fn_invoice_sales_paid`,
  `fn_excedente_nota_credito` y el filtro de documento de `fn_registrar_pago`.
- `pg_trigger` de `invoice_sales`, `quotations`, `credit_notes`, `electronic_invoicing_*`; `pg_policies` y
  `has_function_privilege` para `anon` y `authenticated`; CHECK y UNIQUE de las tablas del grupo.

---

## 11. Dibujo en Figma (2026-09-28)

Archivo «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página `07 Finanzas`, Sección nueva
**«Finanzas — Documentos v2 (propuesta)»** (`1016:88299`,
[abrir](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl?node-id=1016-88299)), en x = 0, y = 54.600, debajo de
Tesorería v2. Cada frame lleva encima, fuera del frame, su nota «P0 · …» o «P1 · …» con la lógica que lo respalda.

Se dibujó sobre la **lógica ya corregida** en código, no sobre la del análisis: cotizaciones por RPC con conversión
a **borrador** (`6100e0ed`), anulación de nota crédito en una transacción (`8fa72073`), saldos a favor con
aplicación validada, anticipo con recibo y caja, anular, devolver y vencido al leer (`c1b709af`…`c5855771`,
`e0404829`, `6b0a2bd6`, `f5018225`) y permisos de Factus (`bab26fec`). Por eso «Aplicar saldo a favor» es su propio
diálogo (`POST /api/saldos-a-favor/[id]/aplicar`) y no un método del pago único como proponía §6.3, y la conversión
de cotización no ofrece «Emitir ahora» (Q-C2 queda resuelta: nace en borrador).

### 11.1 Frames (38)

| Bloque | Frame | Id |
|---|---|---|
| FE | Escritorio / FE Servicio — pendiente de activación (pasos, «Solicitar activación», retenidos que se cancelan) | `1018:89805` |
| FE | Escritorio / FE Servicio — activo (resoluciones, cola, comportamiento) | `1018:90636` |
| FE | Escritorio / Bandeja DIAN — listo (banda y KPI de retenidos, «Por atender») | `1018:91449` |
| FE | Escritorio / Bandeja DIAN — servicio pendiente | `1018:92498` |
| FE | Escritorio / Bandeja DIAN — cargando | `1023:96714` |
| FE | Panel / Detalle del envío — retenido · — rechazado | `1019:89805` · `1019:89915` |
| FE | Diálogo / Enviar retenidos con la fecha de hoy (lote) | `1023:97325` |
| FE | Móvil / Bandeja DIAN — listo · Móvil / FE Servicio — pendiente | `1019:90042` · `1019:90757` |
| FE | Tableta / Bandeja DIAN — listo (1024, menú en riel) | `1023:97394` |
| Plataforma | Plataforma / Facturación electrónica — organizaciones (Q-G1) | `1019:91055` |
| Plataforma | Plataforma / Cargar credenciales del proveedor | `1019:91458` |
| Saldos | Escritorio / Saldos a favor — listo · — sin permiso | `1020:90370` · `1023:96176` |
| Saldos | Hoja / Saldo a favor — detalle | `1020:91478` |
| Saldos | Diálogo / Aplicar saldo a favor · Devolver · Registrar anticipo | `1020:91650` · `1020:91750` · `1021:91385` |
| Saldos | Diálogo / Anular anticipo — sin usar · Anular saldo — no anulable | `1020:91832` · `1020:91895` |
| Saldos | Móvil / Saldos a favor — listo | `1020:92149` |
| Notas | Escritorio / Notas — listo (crédito) · — sin resultados | `1021:91497` · `1023:95636` |
| Notas | Escritorio / Nota crédito — detalle (emitida, factura sin FE) | `1021:92512` |
| Notas | Diálogo / Anular nota crédito — consecuencias · — aceptada por la DIAN | `1021:93702` · `1021:93766` |
| Notas | Diálogo / Nota débito sobre una factura · Escritorio / Nota débito — detalle con cuenta por cobrar | `1021:93831` · `1021:93962` |
| Notas | Móvil / Notas — listo | `1021:95060` |
| Cotizaciones | Escritorio / Cotizaciones — listo · — vacío | `1022:93252` · `1023:95103` |
| Cotizaciones | Escritorio / Cotización — detalle enviada · vencida · convertida | `1022:94293` · `1022:95217` · `1022:96025` |
| Cotizaciones | Diálogo / Convertir cotización en factura (borrador) | `1022:95117` |
| Cotizaciones | Móvil / Cotizaciones — listo · Tableta / Cotizaciones — listo | `1022:96830` · `1023:98155` |

Hechos con el kit: `PageHeader`, `Breadcrumbs`, `StatCard`, `KpiCompacto`, `TabItem`, `SearchBar`, `DateRange`,
`FilterButton`, `Pagination`, `EmptyState`, `Skeleton`, `Badge`, `DocumentStatusBadge`, `FactusStatusBadge`,
`ChipDocumento`, `EslabonDocumento`, `FilaDato`, `RangoNumeracion`, `CheckoutAccordion` (sección plegable),
`FormField`, `Checkbox`, `Switch`, `SegmentedControl`, `ListCard`, `MobileHeader`, `MobileTabBar`, `Sidebar`,
`AppHeader`, `Button`, `IconButton` y el diálogo de motivo de Tesorería v2 (`1004:82759`) clonado. Colores con las
variables de `01 Sistema`; Inter.

### 11.2 Chequeo por script

| Comprobación | Resultado |
|---|---|
| Frames en la Sección | 38 (2.178 instancias, 2.236 textos, 40 notas) |
| Solapes entre nodos de la Sección | **0** (había 1 entre las dos notas de tableta: corregido) |
| La Sección contra otros nodos de la página | **0** |
| Instancias rotas | **0** |
| Anotaciones dentro de frames | **0** (van encima, fuera del frame) |
| Nombres de organizaciones reales | **0**: datos ficticios («Mi empresa S.A.S.», «Distribuidora del Norte S.A.S.», «… Ejemplo S.A.S.») |

Corregido tras revisar capturas: textos de `Badge` que no tomaban la propiedad (se escriben en el nodo), columnas
de relleno demasiado angostas (texto con elipsis de una línea), paginaciones heredadas «175», el `DianPanel`
«sin FE» que ofrecía «Emitir como electrónica» en una nota de factura no electrónica (sustituido por una tarjeta
«No aplica»), tablas y totales de ejemplo del componente (productos ajenos) en la nota crédito, importes que no
cuadraban entre cadena y totales, la insignia «Vencida 12 d» fija del componente y el subtítulo de la cotización
vencida.

### 11.3 Capturas (`docs/design/figma/`, 23)

`73-documentos-seccion.png`, `-fe-servicio-pendiente`, `-fe-servicio-activo`, `-bandeja-listo`,
`-bandeja-servicio-pendiente`, `-envio-retenido`, `-envio-rechazado`, `-bandeja-movil`, `-tableta-bandeja`,
`-plataforma-organizaciones`, `-plataforma-credenciales`, `-saldos-listo`, `-saldo-detalle`, `-saldo-devolver`,
`-notas-listo`, `-nota-credito-detalle`, `-anular-nc-aceptada-dian`, `-nota-debito-dialogo`,
`-nota-debito-detalle`, `-cotizaciones-listo`, `-cotizacion-enviada`, `-cotizacion-convertir`,
`-cotizacion-vencida`.

### 11.4 Pendiente

1. **Componentes nuevos en `02 Componentes`** (no se crearon para no tocar el kit en esta tanda): `EnviarDocumentoDialog`,
   `SelectorDocumento`, `HistorialDocumento` (hoy una tarjeta con textos), variantes «Retenido» y «No aplica» de
   `FactusStatusBadge` (hoy `Badge` suelto), estados «Usado», «Vencido», «Anulado» del saldo a favor en la tabla de
   estados y la variante «Vencida» de `DocumentStatusBadge` sin días fijos.
2. **Frames que faltan de §9:** resoluciones y numeración rehechas (R1–R8), estados restantes (bandeja: sin
   resultados, error, sin permiso; notas y saldos: cargando y error; móviles: cargando y vacío), cotización nueva y
   editar (formulario compartido con la factura, depende del P8 visual de ventas), `EnviarDocumentoDialog`,
   «Nueva nota crédito» con `SelectorDocumento`, pestaña «Débito» del listado, anular nota débito, `DocumentoImpreso`
   de nota débito y comprobante de devolución de saldo.
3. **Tableta:** el `Sidebar` en modo riel deja ver etiquetas del modo expandido; se ocultaron por override en las dos
   tabletas. Conviene revisar el componente `Sidebar` (variante rail).
4. **Secciones viejas** 13, 15, 17 y 18 (`733:29525`, `735:33546`, `738:41958`, `739:45972`): no se movieron a
   `99 Descartes` ni se marcaron «SUSTITUIDO»; tampoco se actualizó el «Índice» (`264:98924`). Queda para cuando el
   dueño apruebe esta propuesta.
5. **Backend** sin construir para lo dibujado: nota débito completa (§5.4), consola de plataforma (§7.7.1), solicitud
   de activación (§7.7.4), liberar retenidos en lote (§7.7.3), KPIs de la bandeja en el servidor (§7.7.2).
