# Paridad — Facturas de venta y de compra

Fecha: 2026-09-22 · Archivo Figma «GO Admin — Sistema de diseño»
(`EAvjINVRnlzFM70GVoWXgl`) · página **`07 Finanzas`** · componentes en
**`02 Componentes` › Sección «Finanzas»**.

Fuente de verdad: `docs/design/AUDITORIA-CONTROLES-FINANZAS.md` §B.1–B.7 (listado,
detalle y formulario de factura de venta y de compra), §J (patrones repetidos) y
§L (recomendación). Complementos: `docs/design/AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md`
§B (campo por campo de cada documento), `docs/design/AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md`
§C (contrato del `SupplierPicker`), `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`
§E (impuestos configurables) y `docs/design/SISTEMA-BADGES.md` §4 (tabla estado → tono).

## 1. Qué se dibujó

6 Secciones nuevas en `07 Finanzas`, 50 frames, escritorio 1440 y móvil 390.
La Sección «Impuestos» y el «Índice» que ya existían se conservan; el Índice se
actualizó con las 6 secciones nuevas.

| # | Sección | Frames |
|---|---|---|
| 2 | Facturas de venta — listado (B.1) | 7 escritorio (listo · cargando · vacío · error · selección con `BulkActionBar` · `FilterPanel` abierto · menú «…» abierto) + 2 móvil (listo · filtros en Sheet) |
| 3 | Facturas de venta — detalle (B.2) | 4 escritorio (listo · cargando · no encontrada · anulada y sin pagos) + 4 diálogos abiertos (`AplicarPagoDialog` · anular con motivo · nota de crédito · emitir) + 1 móvil |
| 4 | Facturas de venta — nueva y editar (B.3 · B.4) | 4 escritorio (nueva listo · nueva vacía · editar cargando · editar no editable) + 3 diálogos (`CustomerPicker` · `ProductPicker` · salir sin guardar) + 1 móvil |
| 5 | Facturas de compra — listado (B.5) | 5 escritorio (listo · cargando · vacío · error · filtros y menú) + 1 móvil |
| 6 | Facturas de compra — detalle (B.6) | 4 escritorio (listo · por recibir y sin pagos · cargando · no encontrada) + 3 diálogos (pago · recepcionar a inventario · anular) + 1 móvil |
| 7 | Facturas de compra — nueva y editar (B.7) | 5 escritorio (nueva listo · nueva vacía · desde orden de compra · editar cargando · editar no editable) + 4 diálogos (`SupplierPicker` · `ProductPicker` compra · ítem manual · salir sin guardar) + 1 móvil |

## 2. Componentes compartidos extraídos a `02 Componentes › Finanzas`

Sirven igual para factura de venta, factura de compra, cotización, nota de
crédito y documento soporte: es el cuerpo de documento único que pide §L.1.

| Componente | Ejes | Qué sustituye |
|---|---|---|
| `DocumentHeader` | `Variant` detalle · formulario × `Layout` desktop · mobile | Las **≈32 cabeceras** y los 4 `PageHeader` distintos de §J.2 |
| `DocumentStatusBadge` | `Estado` (11: Borrador, Emitida, Recibida, Enviada, Pago parcial, Pagada, Aceptada, Vencida, Rechazada, Anulada, Convertida) | Los **≈38 mapas de estado** con ~140 variantes de §J.2. Un estado = un tono, según `SISTEMA-BADGES.md` §4 |
| `FactusStatusBadge` | `Estado` (8: Sin FE, Pendiente, Procesando, Enviado, Aceptada DIAN, Rechazada DIAN, Error, Cancelada) | El único badge ya compartido del módulo; se formaliza con la misma escala |
| `DocumentLinesTable` | `Mode` lectura · edición × `Layout` table · cards | Las **7 implementaciones** de tabla de líneas de §J.2 (4 de lectura, 3 de edición) |
| `DocumentTotals` | `Variant` venta · compra · cotización | Los **9 bloques de totales con 4 juegos de etiquetas** de §J.2 |
| `AplicarPagoDialog` | `Layout` desktop · sheet × `State` default · excede | Los **11 diálogos de pago incompatibles** de §J.2 |
| `SupplierPicker` | `Layout` popover · dialog · inline · sheet × `State` idle · typing · loading · results · empty · error · selected (9 variantes) | Las **15 implementaciones** de selector de proveedor de PROVEEDORES-CATEGORIAS §C.1, calcado del `CustomerPicker` |

El `CustomerPicker` y el `ProductPicker` **no se rediseñaron**: ya existen en
`02 Componentes` y se instancian tal cual.

## 2-bis. Decisiones (delegadas por el dueño, 2026-09-22)

Cinco dudas abiertas al cerrar la primera ronda, resueltas por el coordinador con
delegación del dueño. Están **aplicadas en el archivo**, no solo anotadas.

### D1 · Las retenciones entran de verdad, por fases; el diseño es la fase 1

Una factura de compra sin retenciones es inservible para contabilidad en Colombia,
así que no se queda en marcador.

- **Fase 1 (dibujada):** retenciones **en la factura de compra**, con **concepto,
  base, tarifa e importe**, escritas por el usuario y **restadas del neto a pagar
  al proveedor. En `DocumentTotals Variant=compra` cada retención es ahora
  «Retención en la fuente · Concepto 365 · base $ 15.500.000 · 4 % → − $ 620.000»
  y «ReteICA · Medellín · base $ 15.500.000 · 0,966 % → − $ 149.730». El pie del
  bloque lo dice: «Las retenciones se restan del neto a pagar al proveedor; en
  esta fase el usuario escribe base y tarifa».
- **En venta son informativas.** `DocumentTotals Variant=venta` gana un bloque
  «Retenciones que practica el cliente» (concepto, base, tarifa e importe) que
  **no resta del total ni del saldo** y que sale en el documento imprimible para
  que el cliente sepa qué debe retener.
- **Fase 2 — dependencia, fuera de este diseño:** catálogo de conceptos con bases
  en UVT, ICA por ciudad y **certificado de retención imprimible**. No hay frame
  para ella; queda escrita aquí y en la descripción del componente
  `DocumentTotals`. Mientras no exista, la base y la tarifa son campos libres.
- El formulario de compra ya trae las tres casillas (Retención en la fuente 4 % ·
  ReteICA 0,966 % · ReteIVA 15 %) marcadas con el badge «Nuevo».

### D2 · «Marcar pagada» desaparece — confirmado

Hoy marca la factura como pagada **antes** de insertar el pago (§H.1), así que un
fallo a mitad deja la factura mintiendo. Se sustituye por «Registrar pago» con el
atajo **«Saldo total»**, que rellena el importe completo. La nota está escrita
dentro del propio `AplicarPagoDialog` y en su descripción de componente:

> Solo inserta en «payments»: el saldo lo recalcula la base de datos y el estado de
> la factura lo decide ese saldo. Ninguna pantalla escribe el estado a mano — por
> eso «Marcar pagada» desaparece y su atajo es «Saldo total».

### D3 · El widget «facturas próximas a vencer» se pierde, y el KPI lo sustituye

Un listado dentro de otro listado duplica criterios de orden y paginación y
envejece mal. Se sustituye por el indicador «Por cobrar» con su detalle y por el
filtro «Vencidas» a un clic. **El KPI «Vencido» (venta) y «Vencidas» (compra) son
clicables**: llevan borde de peligro, el detalle dice «5 facturas · toca para
filtrar →» y aplican el filtro sobre la tabla. El chip de filtro resultante
(«Vencidas») queda visible en la fila de chips activos.

### D4 · Proveedores se queda en Inventario

Moverlo rompería las rutas y los enlaces de compras, órdenes y productos, y el
proveedor es sobre todo una entidad de abastecimiento. Finanzas **enlaza allí**:
el bloque «Proveedor y documento» del detalle de factura de compra lleva el botón
«Ver proveedor» con la aclaración escrita debajo —«Los proveedores viven en
Inventario: el enlace va a `/app/inventario/proveedores/{uuid}`»—. Queda anulada
la ruta `/app/finanzas/proveedores`, que no existe y a la que hoy apunta
`FacturasCompraPage.tsx:86`.

### D5 · Convención de tamaño de frame del archivo

**Para pantallas densas, el frame mide lo que mide el contenido**: 1440 de ancho
y el alto que haga falta, en vez de recortar a 900. Es convención del archivo, no
de esta tanda: el resto de páginas la siguen. En esta entrega los listados caben
en 1440×1233, los detalles miden entre 1440×1530 y 1440×1555, y los formularios
entre 1440×1976 y 1440×2057. Los frames de diálogo se igualan a la altura del
lienzo más alto de su Sección para que la rejilla quede pareja. Móvil se mantiene
en 390×844 —es el tamaño del aparato— y el contenido que no cabe se reparte en
pestañas (Resumen · Líneas) en vez de crecer el lienzo.

## 3. Leyenda de la columna «Estado»

- **calcado** — el control existe hoy y se dibuja con el mismo texto y la misma función.
- **Nuevo** — no existe en código; lleva el badge `Marca/Nuevo` en Figma.
- **sustituido por …** — existe, pero se dibuja con otro componente del kit (casi
  siempre porque lo de hoy está roto: `window.alert`, paginación a mano, badge fuera
  de la escala).
- **omitido: …** — no se dibuja, con el motivo.

---

## 4. B.1 — Facturas de venta, listado (74 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Flecha atrás (icono) | Escritorio / Facturas de venta — listo | sustituido por `Breadcrumbs` del kit: «Finanzas › Facturación › Facturas de venta», con enlaces reales |
| 2 | «Facturas de Venta» (h1) | ídem | calcado, con la acentuación corregida a «Facturas de venta» |
| 3 | Migaja estática «Finanzas / Facturas de Venta» | ídem | sustituido por la instancia de `Breadcrumbs` (#1) |
| 4 | «Exportar» (hoy sin `onClick`) | ídem | calcado como botón; el diseño lo da por funcional (§H.3 lo marca sin efecto) |
| 5 | «Importar CSV» | ídem | calcado |
| 6 | «Nueva Factura» | ídem | calcado («Nueva factura») |
| 7-8 | Toasts «No se pudo determinar la organización activa» | — | omitido: la organización sale de la sesión (`getServerOrgContext`), nunca del cliente; ese error no puede ocurrir en el rediseño |
| 9 | `BranchBadge` de sucursal activa | ídem | sustituido por el `BranchPicker` del `AppHeader`, que ya es el selector canónico |
| 10-12 | Widget «Facturas Próximas a Vencer» + descripción + contador | ídem | sustituido por 4 `StatCard` del kit: Facturado en el periodo · Por cobrar · Vencido · Vence en 15 días |
| 13 | `CardListSkeleton cards={3}` | Escritorio / Facturas de venta — cargando | sustituido por `Skeleton Variant=rect` (KPIs) del kit |
| 14 | Caja roja de error del widget | Escritorio / Facturas de venta — error | sustituido por `EmptyState Variant=error` con «Reintentar» |
| 15 | «No hay facturas próximas a vencer…» | Escritorio / Facturas de venta — vacío | sustituido por `EmptyState Variant=empty` con acción |
| 16-19 | Fila del widget (número · cliente · vence · saldo · badge de días · «Ver») | Escritorio / Facturas de venta — listo | sustituido por la propia fila de la tabla, que ya trae esos datos; los días vencidos van dentro del badge («Vencida 12 d»), no en un segundo badge |
| 20 | Buscador «Buscar por número, cliente o referencia...» | ídem | calcado; en el diseño sí filtra también por referencia (hoy no) |
| 21 | Botón «Filtros» | ídem | calcado con `FilterButton` del kit |
| 22 | Contador de filtros activos | ídem | calcado (`FilterButton State=active`, contador 3) |
| 23 | Tooltip «{n} filtros aplicados» | ídem | calcado |
| 24 | Select «Estado» | Escritorio / Facturas de venta — filtros abiertos | calcado dentro del `FilterPanel` («Estado del documento») |
| 25 | Select «Estado de factura» | — | omitido: la auditoría lo marca como **duplicado exacto** de #24 |
| 26 | Select «Método de pago» | Escritorio / … filtros abiertos | sustituido por «Estado de pago» + «Moneda»; el método de pago pasa a columna de la tabla y a filtro secundario |
| 27 | «Periodo de emisión» (desde/hasta) | ídem | calcado («Periodo de emisión» con presets Este mes · Personalizado · Vencidas) |
| 28 | «Cliente» (hoy ignora el id) | ídem | calcado, resuelto con el `CustomerPicker` compartido |
| 29 | «Rango de monto» | ídem | calcado |
| 30 | «Limpiar filtros» | ídem | calcado («Limpiar (3)» en el panel y «Limpiar filtros» junto a los chips) |
| 31 | «Aplicar ordenamiento» (no ordena nada) | ídem | sustituido por orden por columna en la cabecera de la tabla |
| 32 | «Mostrando {n} de {m} facturas» | Escritorio / Facturas de venta — listo | calcado |
| 33 | «Mostrar [5/10/20/50/100] filas» | ídem | sustituido por el selector de tamaño de la **paginación única del kit** |
| 34 | Columna de expandir fila | — | omitido: los pagos se consultan en el detalle y en el menú «…»; la fila expandible duplicaba la pantalla de detalle |
| 35 | Columna «#» (índice global) | ídem | sustituido por la casilla de selección múltiple |
| 36 | Columna «Número» | ídem | calcado, como enlace al detalle |
| 37 | Columna «Cliente» | ídem | calcado, con el documento fiscal en segunda línea |
| 38 | Columnas «Emitida» · «Vencimiento» | ídem | calcado; la fecha vencida va en rojo |
| 39 | Columnas «Total» · «Saldo» | ídem | calcado, alineadas a la derecha |
| 40 | Columna «Método» | ídem | calcado |
| 41 | Badge de estado | ídem | sustituido por `DocumentStatusBadge`: un estado = un tono en toda la app |
| 42 | Columna «PMS» | ídem | calcado (icono a la reserva; «—» si no hay) |
| 43 | Columna «Fact. Elect.» | ídem | calcado con `FactusStatusBadge` |
| 44 | Menú «…» de fila | Escritorio / Facturas de venta — menú de fila | calcado, con el menú abierto en su propio frame |
| 45 | «Ver» | ídem | calcado («Ver detalle») |
| 46 | «Editar» (solo borrador) | ídem | calcado, con la condición escrita en la etiqueta |
| 47-48 | «Enviar por email» + toast informativo | ídem | sustituido: «Enviar por correo» como acción real; el toast pasa a confirmación de envío |
| 49-50 | «Enviar por WhatsApp» + toast | ídem | sustituido igual que #47 |
| 51 | Tabla «Historial de Pagos» de la fila expandida | Escritorio / Detalle factura de venta — listo | sustituido por el bloque «Pagos aplicados» del detalle |
| 52 | «Registrar Pago» desde la fila | Escritorio / Facturas de venta — menú de fila | calcado como ítem del menú «…» |
| 53 | «Total Pagado:» de la fila expandida | Escritorio / Detalle factura de venta — listo | sustituido por el pie de «Pagos aplicados» |
| 54-55 | Columnas y badge de la tabla de pagos | ídem | calcado, con el badge de la escala única |
| 56 | «No hay pagos registrados» | Escritorio / Detalle factura de venta — anulada y sin pagos | calcado con `EmptyState` compacto y acción |
| 57 | Error + «Reintentar» de los pagos | ídem | sustituido por `EmptyState Variant=error` del kit |
| 58-59 | Paginación manual + «Mostrando a–b de c» | Escritorio / Facturas de venta — listo | sustituido por la **paginación única del kit** (`Pagination Layout=full`, `Layout=compact` en móvil) |
| 60 | `TableSkeleton` (9 cabeceras para 13 columnas) | Escritorio / Facturas de venta — cargando | sustituido por `Skeleton Variant=table-row` del kit |
| 61 | «Error al cargar datos» + `window.location.reload()` | Escritorio / Facturas de venta — error | sustituido por `EmptyState Variant=error` con «Reintentar» que reintenta la consulta |
| 62 | «No hay facturas» | Escritorio / Facturas de venta — vacío | calcado con `EmptyState` + «Crear la primera factura» / «Importar CSV» |
| 63 | Toast «No se pudieron cargar las facturas» | Escritorio / Facturas de venta — error | calcado (el estado de la pantalla ya lo dice; el toast queda como refuerzo) |
| 64-74 | Diálogo «Importar Facturas desde CSV» (plantilla, archivo, errores, vista previa, progreso, toasts) | — | omitido aquí: el `ImportWizard` de `02 Componentes › Diálogos` ya cubre los 4 pasos con los mismos controles; «Importar CSV» lo abre. No se redibuja para no crear una segunda versión |
| — | Selección múltiple y acciones en lote | Escritorio / Facturas de venta — selección y acciones en lote | **Nuevo**: hoy no existe ni la selección, ni las acciones en lote, ni «Anular» desde el listado (lo dice el cierre de §B.1) |

## 5. B.2 — Detalle de factura de venta (91 controles, 7 diálogos)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | 4 `Skeleton` sueltos | Escritorio / Detalle factura de venta — cargando | sustituido por la silueta real de la pantalla con `Skeleton` del kit |
| 2-4 | «Factura no encontrada» + «Volver a facturas» + toast | Escritorio / Detalle factura de venta — no encontrada | sustituido por `EmptyState Variant=error` con acción |
| 5 | Flecha atrás | Escritorio / Detalle factura de venta — listo | calcado dentro de `DocumentHeader` |
| 6 | «Factura #{number}» (h1) | ídem | calcado («Factura FV-00042») |
| 7 | Badge de estado (amarillo/gris, distinto del listado) | ídem | sustituido por `DocumentStatusBadge`: mismo tono que en el listado |
| 8 | `FactusStatusBadge` + tooltip con el CUFE | ídem | calcado, extraído como componente |
| 9 | «Editar» (solo borrador) | ídem | calcado |
| 10-11 | «Emitir» + confirmación | Diálogo / Emitir factura (ConfirmDialog) | calcado con el `ConfirmDialog` del kit |
| 12 | Toast «Sin existencias suficientes… **Repon**» | ídem | sustituido: `Toast Variant=warning` con la tilde corregida («Repón») y acción «Ver inventario» |
| 13-15 | Toasts «Factura emitida», «Inventario en negativo», «se **emitio**» | ídem | sustituido: un solo `Toast` por resultado, con las tildes corregidas |
| 16 | «Imprimir» | Escritorio / Detalle factura de venta — listo | calcado |
| 17 | «PDF» (hoy la misma función que #16) | ídem | calcado, pero separando descargar de imprimir |
| 18 | Toast «PDF Generado» | ídem | calcado |
| 19-20 | «Email» · «WhatsApp» + toasts | ídem | sustituido por un solo botón «Enviar» que abre el envío real (correo o WhatsApp) |
| 21-26 | «Enviar a DIAN» con sus 6 etiquetas, diálogo, errores de validación y toasts | ídem + `FactusStatusBadge` | calcado: el estado DIAN se lee en el badge y la acción vive en el menú «…» cuando ya está aceptada |
| 27-28 | «PDF DIAN» · «XML DIAN» | ídem | calcado, dentro del menú «…» |
| 29-31 | «Duplicar» + confirmación + toast | Escritorio / Facturas de venta — menú de fila | calcado como ítem del menú «…» |
| 32 | «Nota Crédito» | Diálogo / Generar nota de crédito | calcado |
| 33 | «Registrar Abono» (deja un `console.log`) | Diálogo / Registrar pago (AplicarPagoDialog) | sustituido por el `AplicarPagoDialog` único |
| 34 | «Marcar Pagada» | Diálogo / Registrar pago | **sustituido a propósito**: la auditoría (§H.1) demuestra que marca la factura pagada **antes** de insertar el pago. En el diseño solo existe «Registrar pago» con el atajo «Saldo total», que inserta en `payments` y deja que el trigger recalcule |
| 35 | «Anular» | Diálogo / Anular factura (motivo) | calcado |
| 36-39 | «Información de la Factura» (número, cliente, documento, email, teléfono, fechas, método, términos, notas) | Escritorio / Detalle factura de venta — listo | sustituido por el bloque **«Emisor y receptor»**, que además trae lo que hoy el PDF nunca pinta (PDF §B.1 #21-#32): sucursal, resolución DIAN con prefijo y vigencia, DV, responsabilidades fiscales, municipio, forma y medio de pago DIAN, vendedor |
| 40-41 | «Resumen Financiero» + badge «Imp. incluidos» | ídem | sustituido por `DocumentTotals Variant=venta` |
| 42 | Subtotal · Descuentos · Impuestos · Total | ídem | calcado, más el **desglose por impuesto con su base gravable** (hoy no existe) |
| 43 | «Nota crédito / saldo aplicado» | ídem | calcado |
| 44-45 | «Pagado» · «Pendiente» · «Factura completamente pagada» | ídem | calcado |
| 46-47 | «Vendedor y Comisión» + comisión calculada | ídem | sustituido por la tarjeta «Enlaces del documento» (fila «Comisión de Ana Gómez · 3 % · $ 144.060 causada») |
| 48 | Tabla «Detalle de Items» (7 columnas) | ídem, componente `DocumentLinesTable Mode=lectura` | calcado |
| 49 | «SKU: {sku}» | ídem | calcado |
| 50 | Chips de serial | ídem | calcado |
| 51 | Badge «Imp. incluido» solo móvil | ídem | sustituido: el badge «Incluido / Adicional» se ve en escritorio y en móvil, con el tono de la escala |
| 52 | Nombre del impuesto + «Incluido»/«Adicional»/«N/A» | ídem | calcado, con la regla dura: la etiqueta es `{nombre} {tasa}`, nunca «IVA» |
| 53 | Pie «* Los precios incluyen impuestos» | ídem | calcado |
| 54 | «No hay ítems registrados» | `DocumentLinesTable` (estado vacío del componente) | calcado |
| 55-57 | Tabla «Pagos Aplicados» (5 columnas) + badge + vacío | Escritorio / Detalle factura de venta — listo / — anulada y sin pagos | calcado, con el saldo en el pie y el menú «…» por pago |
| 58-68 | Diálogo «Registrar Pago» (factura, saldo, método, monto, validación de exceso, fecha, referencia condicional, botones, toasts) | Diálogo / Registrar pago (AplicarPagoDialog) | sustituido por el diálogo único: **mismo contrato para los 11** (§J.2). Añade atajos «Saldo total / 50 % / Exacto», cuenta bancaria, notas y resumen proyectado |
| 69-81 | Diálogo «Generar Nota de Crédito» (número, motivo, pestañas ítems/valor, concepto, tabla de ítems, total, toasts y cadena DIAN) | Diálogo / Generar nota de crédito | calcado, con una corrección: **cada línea se acredita con su propio impuesto**, no con la tasa efectiva promedio que hoy deriva de `tax_total/subtotal` (§G.4 #1) |
| 82-86 | Diálogo «Anular Factura» (aviso de pagos, motivo, botones, toasts) | Diálogo / Anular factura (motivo) | calcado; el aviso de pagos deshabilita «Anular» y ofrece «Generar nota de crédito» en su lugar |
| 87-91 | Diálogo «Marcar como Pagada» (fecha, validación, «Confirmar Pago», toast) | Diálogo / Registrar pago | **sustituido**: ver #34. La ruta única es registrar un pago por el saldo total |
| — | Historial del documento | Escritorio / Detalle factura de venta — listo | **Nuevo**: la auditoría dice explícitamente «no existe historial de auditoría» |
| — | Enlaces a cartera, contabilidad, PMS y comisión | ídem | **Nuevo** |

## 6. B.3 — Nueva factura de venta (64 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1-2 | Flecha atrás + «Nueva Factura de Venta» | Escritorio / Nueva factura de venta — listo | calcado dentro de `DocumentHeader Variant=formulario` |
| 3-5 | «Número de Factura» + validación de duplicado | ídem | calcado, **partido en prefijo + consecutivo** (hoy es un texto libre): el prefijo sale de la resolución DIAN |
| 4 | Botón «Generar número automático» | ídem | calcado |
| 6-7 | «Fecha de Emisión» · «Fecha de Vencimiento» | ídem | calcado |
| 8 | «Moneda» | ídem | calcado |
| 9 | «Datos del Cliente» (h3) | ídem | sustituido por la tarjeta «Cliente» |
| 10 | `BranchSelectorField` | ídem | calcado («Sucursal *») |
| 11-16 | `ClienteSelector` (buscador, estados, contacto, alta en línea, ficha del elegido) | Diálogo / CustomerPicker (buscar cliente) + tarjeta «Cliente» | sustituido por el **`CustomerPicker` compartido** de `02 Componentes › Clientes`; la ficha del elegido queda en la tarjeta con Cambiar / Ver / Quitar |
| 17-18 | «Oportunidad (opcional)» + ayuda | — | omitido en estos frames: es un control del CRM que la auditoría marca roto (las líneas importadas nacen con `tax_rate: 0`, §G.4 #13). Entra cuando se arregle el origen |
| 19 | «Items de la Factura» (h3) | `DocumentLinesTable Mode=edición` | calcado («Líneas del documento») |
| 20 | `ProductSearchDialog` modo `sale` (moneda cableada) | Diálogo / ProductPicker (buscar producto) | sustituido por el `ProductPicker` del kit, con la moneda del documento |
| 21 | «Agregar Ítem Manual» | `DocumentLinesTable Mode=edición` | calcado |
| 22 | «Capturar Seriales» + badge | Escritorio / Detalle factura de venta — listo (chips de serial) | calcado: los seriales se capturan desde la línea y se ven como chips |
| 23-24 | Columna «Descripción» + badges de serial | `DocumentLinesTable` | calcado |
| 25-26 | «Cantidad» + aviso de stock | ídem | calcado |
| 27 | «Precio Unit.» · «Descuento» | ídem | calcado |
| 28 | «Impuesto» → «{tasa}%» + casilla «Incluido» | ídem | calcado y corregido: la etiqueta es `{nombre} {tasa}` y admite N impuestos por línea |
| 29 | «Total» (moneda cableada a COP) | ídem | calcado, con la moneda del documento |
| 30 | Papelera por línea | ídem | calcado |
| 31 | «No hay ítems en la factura» | Escritorio / Nueva factura de venta — vacía | calcado |
| 32-34 | «Condiciones de Pago» · «Términos de Pago» · días personalizados | Escritorio / Nueva factura de venta — listo | calcado dentro de «Datos del documento» |
| 35-36 | «Forma de Pago» + estados | ídem | calcado |
| 37 | «Notas» | ídem | calcado en «Notas y términos» |
| 38 | «Incluir en arqueo de caja» | ídem | calcado |
| 39-41 | Switch «Factura Electrónica» + tooltip + badge «Global» | ídem | calcado |
| 42 | «Resumen e Impuestos» (h3) | `DocumentTotals Variant=venta` | sustituido por el bloque único de totales |
| 43 | «Subtotal» + «(imp. incluidos)» | ídem | calcado |
| 44 | «Impuestos incluidos en precios» | Tarjeta «Impuestos de la organización» | calcado |
| 45-46 | Casilla por impuesto «{nombre} ({tasa}%)» + badge «Predeterminado» | ídem | calcado |
| 47 | «No hay impuestos configurados» | — | omitido: el estado vacío de impuestos ya está dibujado en la Sección «Impuestos» de esta misma página |
| 48 | Desglose y totales con `$`+`toFixed(2)` | `DocumentTotals` | sustituido: importes con separador de miles y sin decimales forzados (§J.4) |
| 49-54 | «Comisión de Vendedor» (vendedor, comisión, porcentaje/monto, validaciones, estimación) | Escritorio / Nueva factura de venta — listo | calcado |
| 55 | «Cancelar» | `DocumentHeader Variant=formulario` | calcado, ahora con confirmación (ver abajo) |
| 56 | «Guardar Factura» | ídem | **sustituido por dos acciones**: «Guardar borrador» y «Emitir factura». El cierre de §B.3 dice que hoy no existe la distinción |
| 57-64 | Toasts de validación, de duplicado, de éxito, de DIAN, de existencias y el que **vuelca el objeto de error crudo** | `Toast` del kit | sustituido: mensajes de una línea, con tildes, sin `JSON.stringify(error)` en la interfaz |
| — | Confirmación de salida con cambios sin guardar | Diálogo / Salir con cambios sin guardar | **Nuevo** en venta: hoy solo la tiene el formulario de compra (§B.7 #41) |

## 7. B.4 — Editar factura de venta (9 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Skeletons de carga | Escritorio / Editar factura de venta — cargando | sustituido por la silueta real con `Skeleton` del kit |
| 2 | Flecha atrás | Escritorio / Nueva factura de venta — listo | calcado (`DocumentHeader`) |
| 3-4 | «Editar Factura de Venta» / «Editar Factura» (títulos distintos según haya error) | Escritorio / Editar factura de venta — no editable | sustituido: **un solo título** en las dos situaciones |
| 5-6 | `Alert` destructivo + copy según el error | ídem | sustituido por `EmptyState Variant=forbidden` con el motivo escrito |
| 7 | «Intentar de nuevo» · «Volver al detalle» | ídem | calcado, con los botones del kit |
| 8 | Reutiliza todo `NuevaFacturaForm` | Escritorio / Nueva factura de venta — listo | calcado: el mismo formulario, con aviso de qué se bloquea al emitir |
| 9 | Toasts de actualización | `Toast` del kit | calcado |

## 8. B.5 — Facturas de compra, listado (41 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1-2 | Flecha atrás + título y migaja | Escritorio / Facturas de compra — listo | sustituido por `Breadcrumbs` + título, igual que en venta |
| 3 | Botón de refrescar que **nunca se renderiza** | — | omitido: la página lo monta sin la prop; el rediseño no arrastra un botón muerto |
| 4-5 | «Importar» · «Exportar» (solo `console.log`) | ídem | calcado como botones, dados por funcionales |
| 6 | «Nueva Factura» | ídem | calcado |
| 7 | `BranchBadge` | ídem | sustituido por el `BranchPicker` del `AppHeader` |
| 8-9 | 4 KPIs + su carga | ídem + Escritorio / … cargando | calcado con `StatCard` del kit (Total por pagar · Vencidas · Críticas ≤ 3 días · Próximas ≤ 7 días) |
| 10-12 | Lista «Facturas Próximas a Vencer» + «Ver todas» + «¡Excelente!» | — | omitido: los 4 KPIs y el filtro «Vencidas» cubren lo mismo sin duplicar la tabla |
| 13-15 | Fila del widget + «Ver» + «Registrar Pago» **sin `onClick`** | Escritorio / Facturas de compra — filtros y menú | sustituido por el menú «…» de la fila, donde «Registrar pago» sí actúa |
| 16 | Buscador «Número de factura o notas...» | Escritorio / Facturas de compra — listo | calcado y ampliado a proveedor y NIT |
| 17 | Select «Estado» | Escritorio / … filtros y menú | calcado en el `FilterPanel` |
| 18 | Select «Proveedor» | ídem | sustituido por el `SupplierPicker` dentro del panel |
| 19 | «Filtros» · «Limpiar» | ídem | calcado con `FilterButton` del kit |
| 20-21 | «Fecha desde/hasta» que **no auto-aplican** + «Aplicar Filtros» | ídem | sustituido por «Periodo de emisión» con presets; todo el panel aplica igual |
| 22 | Chips con el **código crudo** (`draft`, `received`) y **no cerrables** | Escritorio / Facturas de compra — listo | sustituido por `Chip Variant=filter` del kit, con la etiqueta en español y cerrables |
| 23-24 | Columna «Núm. Factura» + icono de vencida | ídem | calcado |
| 25 | Columna «Proveedor» (+ NIT) | ídem | calcado |
| 26 | Columnas que se esconden por breakpoint | ídem | sustituido: una sola tabla con scroll horizontal en escritorio y tarjetas en móvil (decisión §L.4 #7) |
| 27 | Badge de estado (catálogo propio) | ídem | sustituido por `DocumentStatusBadge` |
| 28 | Columna «Acciones» con **5 iconos sueltos** | Escritorio / Facturas de compra — filtros y menú | sustituido por el menú «…» único, igual que en venta |
| 29-32 | «Ver», «Editar», «Recepcionar a Inventario», «Registrar Pago» | ídem | calcado como ítems del menú |
| 33 | «Eliminar» con **`window.confirm` + `window.alert`** | ídem | sustituido: ítem destructivo del menú + `ConfirmDialog` del kit |
| 34 | Coloreado de filas por vencimiento | ídem | sustituido: el vencimiento se comunica con la fecha en rojo y el badge, no pintando la fila entera |
| 35 | «No se encontraron facturas de compra» | Escritorio / Facturas de compra — vacío | sustituido por `EmptyState` con acción |
| 36 | Esqueleto propio (7 anchos para 9 columnas) | Escritorio / Facturas de compra — cargando | sustituido por `Skeleton Variant=table-row` del kit |
| 37 | Paginación con **página fija de 10 y sin selector** | Escritorio / Facturas de compra — listo | sustituido por la **paginación única del kit**, con selector de tamaño |
| 38 | «← Volver a Finanzas» (la flecha es un carácter) | — | omitido: la vuelta está en `Breadcrumbs`; `/app/finanzas` ya no es un hub sino un redirector (§A.0) |
| 39 | «Cuentas por Pagar» | Escritorio / Detalle factura de compra — listo | sustituido por el enlace «Cuenta por pagar CXP-00088» del detalle |
| 40 | «Proveedores» → **ruta que no existe** | — | omitido: `/app/finanzas/proveedores` no existe; el enlace correcto vive en la ficha del proveedor del detalle |
| 41 | «Productos» · «Categorías» | — | omitido: son enlaces del módulo de inventario, no de facturación |
| — | Columnas «Recepción» y «Doc. soporte» | Escritorio / Facturas de compra — listo | **Nuevo**: hoy no se ve desde la lista si el inventario entró ni si hay documento soporte |
| — | Estado de error de la lista | Escritorio / Facturas de compra — error | **Nuevo**: esta lista hoy no tiene estado de error |

## 9. B.6 — Detalle de factura de compra (44 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Skeletons | Escritorio / Detalle factura de compra — cargando | sustituido por la silueta real con `Skeleton` del kit |
| 2 | «Factura no encontrada» + «Volver a Facturas» | Escritorio / … no encontrada | sustituido por `EmptyState Variant=error` |
| 3-4 | «Volver» + «Factura {number_ext}» | Escritorio / Detalle factura de compra — listo | calcado en `DocumentHeader Variant=detalle` |
| 5-7 | «Imprimir» · «PDF» + toast | ídem | calcado |
| 8 | «Recepcionar Inventario» (acepta un estado `'confirmed'` que **no existe en el CHECK**) | Diálogo / Recepcionar a inventario + Escritorio / … por recibir | sustituido: la acción abre un diálogo con la previsualización de lo que entra, y el estado sale del catálogo real |
| 9 | Badge «Inventario Recibido» | Escritorio / … listo | calcado («Recibido», tono éxito · contorno) |
| 10 | «Registrar Pago» | Diálogo / Registrar pago a proveedor | sustituido por el `AplicarPagoDialog` único |
| 11 | «Registrar Pago» **duplicado** («botón temporal … para testing» en producción) | — | omitido: es un duplicado declarado del #10 |
| 12 | «Confirmar Factura» (el fallo sale por **`window.alert`**) | Escritorio / … por recibir | calcado como acción, con `Toast`/`ConfirmDialog` del kit en vez del diálogo nativo |
| 13 | «Editar» (solo borrador) | ídem | calcado |
| 14 | «Anular» | Diálogo / Anular factura de compra | calcado |
| 15-18 | «Información de la Factura» (número, fechas, moneda, días a vencimiento, notas) | Escritorio / … listo, bloque «Proveedor y documento» | calcado y ampliado con lo que el PDF nunca pinta (PDF §B.2 #13-#16): DV, nombre comercial, municipio, régimen, datos bancarios, crédito, sucursal |
| 19-20 | Tabla «Items de la Factura» (6 columnas) + SKU y seriales | `DocumentLinesTable Mode=lectura` | calcado; además se pinta el **descuento por línea**, que hoy el constructor no pasa y siempre sale «—» (PDF §B.2 #11) |
| 21-24 | «Cuenta por Pagar» (estado, montos, progreso) | Tarjeta «Enlaces del documento» + `DocumentTotals Variant=compra` | sustituido: el saldo vive en los totales y la cartera queda como enlace con su saldo y su vencimiento |
| 25-26 | «Historial de Pagos» (5 columnas) + badges | Escritorio / … listo, bloque «Pagos aplicados» | calcado, con la escala única de badges |
| 27-28 | Ficha del proveedor + «Ver Perfil del Proveedor» | Bloque «Proveedor y documento» | calcado |
| 29 | «Vendedor y Comisión» | Bloque «Proveedor y documento» («comisionista») | calcado |
| 30 | «Totales» (Subtotal · impuesto · Total impuestos · Impuestos · Total · Balance) | `DocumentTotals Variant=compra` | sustituido por el bloque único; se elimina la doble fila «Total impuestos»/«Impuestos» |
| 31-39 | Diálogo «Registrar Pago» (balance, monto, validación, método, referencia, fecha, notas, botones) | Diálogo / Registrar pago a proveedor | sustituido por el `AplicarPagoDialog` único |
| 40 | **Seis validaciones con `window.alert`, sin un solo toast** | ídem | sustituido: validación en línea (borde ámbar/rojo + mensaje) y botón deshabilitado; cero diálogos nativos |
| 41-44 | Diálogo «Anular Factura» (aviso de pagos, motivo, botones) | Diálogo / Anular factura de compra | calcado |
| — | Retenciones en los totales | `DocumentTotals Variant=compra` | **Nuevo**: §G.3 demuestra que hoy no existen ni el campo, ni la resta, ni el certificado |
| — | Enlaces a orden de compra, entrada de inventario, documento soporte y asiento | Tarjeta «Enlaces del documento» | **Nuevo** |
| — | Historial del documento | Escritorio / … listo | **Nuevo** |

## 10. B.7 — Nueva y editar factura de compra (45 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | «Volver» con confirmación de salida | Diálogo / Salir sin guardar (compra) | calcado (es la única confirmación de salida que hoy existe; se unifica con la de venta) |
| 2 | «Nueva / Editar Factura de Compra» + subtítulo | Escritorio / Nueva factura de compra — listo | calcado en `DocumentHeader Variant=formulario` |
| 3 | Barra de acciones **duplicada arriba y abajo** | ídem | sustituido: una sola barra, en la cabecera |
| 4 | `BranchSelectorField` | ídem | calcado («Sucursal *») |
| 5 | «Información Básica» | ídem | calcado («Datos del documento») |
| 6-7 | `SupplierSelector` + ficha del proveedor elegido | Diálogo / SupplierPicker + tarjeta «Proveedor» | sustituido por el **`SupplierPicker` compartido** (contrato de PROVEEDORES-CATEGORIAS §C.4): busca por nombre, NIT con DV, contacto y correo; fila con tipo, saldo por pagar e «Inactivo»; seleccionado con Cambiar / Ver / Editar / Quitar y bloque DIAN |
| 8-10 | «Número de Factura» + duplicado | Escritorio / … listo | calcado, rotulado «Número del proveedor» para dejar claro que no es un consecutivo propio |
| 9 | Botón de generar número | ídem | calcado |
| 11 | «Moneda» | ídem | calcado |
| 12-15 | Fechas y términos de pago | ídem | calcado |
| 16 | «Notas adicionales» | Tarjeta «Notas y documento soporte» | calcado |
| 17 | «Productos para Factura de Compra» + contador | `DocumentLinesTable Mode=edición` | calcado («Líneas del documento · 3 líneas») |
| 18 | «Agregar Item Manual» | ídem | calcado |
| 19-25 | Diálogo «Agregar Item Manual» (descripción, costo, tasa, notas, validaciones, vista previa, botones) | Diálogo / Agregar ítem manual | calcado, con una corrección: **la nota de la línea se guarda** (hoy se captura y no se envía) |
| 26 | `ProductSearchDialog` modo `purchase` | Diálogo / ProductPicker (modo compra) | calcado |
| 27 | «No hay productos seleccionados» | Escritorio / Nueva factura de compra — vacía | calcado |
| 28 | «Productos Seleccionados ({n})» + total | `DocumentLinesTable` | calcado |
| 29 | Badge **«📄 Manual»** con emoji | ídem | sustituido por `Badge` del kit con la etiqueta «Ítem manual» (sin emoji) |
| 30-31 | Papelera + tarjetas de línea (descripción, cantidad, costo, descuento, total) | ídem | sustituido: en escritorio son **tabla** (como en venta) y en móvil siguen siendo tarjetas |
| 32-33 | «Impuestos» con «Configurar» en un `Popover` | Tarjeta «Impuestos y retenciones» | sustituido: los impuestos quedan a la vista, no escondidos tras un popover |
| 34 | Resumen que **nunca muestra el importe del impuesto** | `DocumentTotals Variant=compra` | sustituido: desglose por impuesto con base gravable e importe |
| 35-37 | «Comisión (opcional)» + validaciones + estimación | Escritorio / … listo («Comisionista») | calcado |
| 38-39 | «Resumen» + «Sin impuestos aplicados» | `DocumentTotals Variant=compra` | sustituido por el bloque único |
| 40 | «Guardar / Actualizar Factura» | `DocumentHeader Variant=formulario` | sustituido por «Guardar borrador» + «Confirmar factura» |
| 41 | Diálogo «¿Cancelar la factura?» | Diálogo / Salir sin guardar (compra) | calcado con el `ConfirmDialog` del kit |
| 42 | Skeletons del modo edición | Escritorio / Editar factura de compra — cargando | sustituido por la silueta real |
| 43 | `Alert` destructivo de error | Escritorio / Editar factura de compra — no editable | sustituido por `EmptyState Variant=forbidden` |
| 44 | «Intentar de nuevo» / «Volver a lista» (**`<button>` con clases sueltas**) | ídem | sustituido por los `Button` del kit |
| 45 | Toasts de actualización | `Toast` del kit | calcado |
| — | Cabecera propia en `/[id]/editar` | Escritorio / Editar factura de compra — no editable | **Nuevo**: hoy la edición de compra no tiene cabecera, al contrario que la de venta |
| — | Factura creada desde una orden de compra | Escritorio / Nueva factura de compra — desde orden de compra | **Nuevo**: la relación con `purchase_orders.po_id` existe en el esquema y no se ve en ninguna pantalla (PDF §B.2 #15) |
| — | Documento soporte y su concepto DIAN | Tarjeta «Notas y documento soporte» | **Nuevo** en esta pantalla: hoy el documento soporte es una ruta aparte (§B.13-B.15) |
| — | Retenciones seleccionables | Tarjeta «Impuestos y retenciones» | **Nuevo** (§G.3) |

## 11. Notas de crédito y cotizaciones (B.8–B.12)

No se dibujan como pantallas en esta tanda —son otra ronda— pero **su cuerpo ya
está resuelto**, porque comparten componente con las facturas:

| Pantalla | Qué reutiliza | Qué queda pendiente |
|---|---|---|
| B.9 Detalle de nota de crédito | `DocumentHeader`, `DocumentStatusBadge`, `FactusStatusBadge`, `DocumentLinesTable Mode=lectura` (hoy ya reutiliza `ItemsDetalle`), `DocumentTotals` | La cabecera propia con «Descargar PDF» real y «Aplicar el crédito a otra factura» |
| B.11 Detalle de cotización | Los mismos cuatro, con `DocumentTotals Variant=cotización` (sin Pagado/Saldo, con «Válida hasta») | «Convertir a factura», el bloque «Cambiar Estado» y la propuesta narrativa (`sections_json`) |
| B.12 Nueva/editar cotización | `DocumentHeader Variant=formulario`, `CustomerPicker`, `DocumentLinesTable Mode=edición`, `DocumentTotals` | El segundo bloque de totales duplicado se elimina por construcción: solo hay un `DocumentTotals` |
| B.14-B.15 Documento soporte | `SupplierPicker`, `DocumentLinesTable`, `DocumentTotals Variant=compra` | La identidad visual morada desaparece: el documento soporte usa el mismo azul de marca |

Tres correcciones del diseño que valen para los cuatro documentos:

1. **La columna y la línea de totales dejan de llamarse «IVA»** (hoy cableado en
   documento soporte y en cotización, §G.4 #6, #7, #15): la etiqueta es
   `{nombre} {tasa}`.
2. **«Subtotal» lleva dos puntos** en todos los documentos (hoy la nota de crédito
   es la excepción, §G.4 #4).
3. **El desglose de impuestos se agrupa por impuesto, no por tasa**: hoy la nota de
   crédito funde dos impuestos distintos con la misma tasa en uno solo (§G.4 #3).

## 12. Lo roto que el diseño NO calca

| Hallazgo de la auditoría | Qué hace el diseño |
|---|---|
| **11 diálogos de pago incompatibles** (§J.2) y **8 ficheros que insertan en `payments`** | Un solo `AplicarPagoDialog`. Contrato escrito en la descripción del componente y en el propio frame: **inserta en `payments` y nada más**; el saldo de la factura y la cartera los recalculan los triggers |
| El diálogo de pago **escribe el saldo tres veces** (§H.1) | El diseño no tiene ningún control que escriba el saldo: el bloque «Después de registrar el pago» es una **proyección de solo lectura** |
| **«Marcar pagada» marca antes de insertar el pago** (§H.1) | Ese botón no existe. Su función se cubre con el atajo «Saldo total» dentro del diálogo de pago |
| **38 mapas de estado distintos con ~140 variantes** (§J.2) | Un `DocumentStatusBadge` con la tabla estado → tono de `SISTEMA-BADGES.md` §4. «Borrador» es gris en la lista y en el detalle; «Anulada» es peligro · contorno en los dos; «Pagada» es éxito en venta y en compra |
| **27 `window.confirm` / `window.alert` / `prompt`** en 19 ficheros (§H.6) | Cero diálogos nativos: `ConfirmDialog` del kit, validación en línea y `Toast` del kit |
| **8 paginaciones con 3 algoritmos distintos** (§J.2) | Una sola instancia de `Pagination` del kit en los cuatro listados, `Layout=full` en escritorio y `Layout=compact` en móvil |
| **«IVA» cableado** en cabeceras, totales y reportes (§L.4 #2) | Ninguna etiqueta de impuesto es fija. `DocumentTotals` y `DocumentLinesTable` lo dicen por escrito en el propio componente |
| Tildes: «Repon», «emitio», «actualizo» (§B.2 #12, #14, #15) | Corregidas |
| Textos que vuelcan `JSON.stringify(error)` a la interfaz (§B.3 #64) | Mensajes de una línea en `Toast` |
| El badge de sucursal **fucsia** (`SISTEMA-BADGES.md` §6) | No aparece: la sucursal sale del `BranchPicker` del `AppHeader` |
| Dos títulos distintos entre pantalla normal y pantalla de error (§B.4 #3-#4) | Un solo título |
| **Retenciones inexistentes** (§G.3) | Se diseñan de cero y van marcadas con el badge «Nuevo», no calcadas |

## 13. Verificación

Ejecutada por script sobre las 6 Secciones nuevas de `07 Finanzas`:

Reejecutada tras aplicar las decisiones D1–D5 y tras el pase transversal de otro
agente sobre `07 Finanzas` (chip de sucursal fuera del panel de filtros,
`BranchBadge` bajo el título, acciones por fila y paginación). Los anchos de
columna de los dos listados se reequilibraron **midiendo el ancho natural de cada
celda** y repartiendo el sobrante, para que la columna de acciones nueva no
recortara «Cliente» ni «Proveedor».

El chequeo se amplió para mirar **también dentro de los siete componentes
compartidos** (la primera versión saltaba todo lo que estuviera bajo una
instancia, así que no veía los recortes de `DocumentHeader` ni de
`SupplierPicker`). Con esa ampliación aparecieron y se corrigieron tres cosas: la
cabecera de compra desbordaba con «Recepcionar» y «DS-00014 aceptado» (ahora
«Recibir» y «DS-00014»), la tarjeta de proveedor del formulario era demasiado
estrecha para el `SupplierPicker` (pasó de 384 a 420) y el chip de saldo de la
variante `Layout=inline` empujaba el nombre del proveedor (ahora va bajo el
contacto, dentro de la columna).

| Comprobación | Resultado |
|---|---|
| Frames de primer nivel | **50** |
| Solapes entre Secciones de `07 Finanzas` | **0** |
| Solapes entre frames dentro de cada Sección | **0** |
| Solapes entre Secciones de `02 Componentes` | **0** |
| Solapes dentro de la Sección «Finanzas» de `02` | **0** |
| Instancias en los frames nuevos | **3.611** |
| Instancias rotas | **0** |
| Nodos que desbordan su contenedor (derecha o abajo) | **0** |
| Textos recortados (frames y componentes compartidos) | **0** |

Capturas: `docs/design/figma/20-facturas-venta-listado.png`,
`20-facturas-venta-detalle.png`, `20-facturas-venta-nueva.png`,
`20-facturas-compra-listado.png`, `20-facturas-compra-detalle.png`,
`20-facturas-compra-nueva.png`, `20-facturas-dialogo-pago.png`,
`20-facturas-supplierpicker.png`, `20-facturas-movil-listado.png`,
`20-facturas-movil-detalle.png`, `20-facturas-movil-compra-nueva.png`,
`20-facturas-componentes.png`.

## 14. Datos de ejemplo

Los mismos en todos los frames de cada flujo, sin nombres de organizaciones reales:

- **Emisor**: Mi empresa S.A.S. · NIT 901.456.789 · DV 2 · Sucursal Principal ·
  resolución DIAN 18764003456789, prefijo FV, del 1 al 5.000, vigente hasta 30/06/2027.
- **Venta**: FV-00042 · Distribuidora del Norte (NIT 900.145.221 · DV 7) ·
  emitida 12/09/2026 · vence 12/10/2026 · total $ 4.802.000 · pagado $ 1.500.000 ·
  saldo $ 3.302.000 · Pago parcial · Aceptada DIAN.
- **Compra**: COMP-2026-0087 · Distribuidora del Norte · emitida 05/09/2026 ·
  vence 05/10/2026 · subtotal $ 16.000.000 · descuentos $ 500.000 ·
  impuestos $ 2.560.000 · retenciones sobre base $ 15.500.000
  (fuente concepto 365 al 4 % = $ 620.000 · ReteICA Medellín 0,966 % = $ 149.730) ·
  total $ 17.290.270 · pagado $ 6.000.000 · saldo $ 11.290.270 ·
  documento soporte DS-00014 · orden de compra OC-2026-0311.
- **Retenciones informativas de la venta** (no restan): base $ 4.100.000 ·
  fuente concepto 365 al 2,5 % = $ 102.500 · ReteICA Medellín 0,966 % = $ 39.606.
- **Impuestos** de la organización: Impuesto general 19 % (predeterminado) ·
  Impoconsumo 8 % · ICA 0,966 % · Impuesto personalizado 5 %. Retenciones:
  Retención en la fuente 4 % · ReteICA 0,966 % · ReteIVA 15 %.
- Otros terceros: Textiles Andinos S.A.S., Carlos Mejía Bordados,
  Empaques del Valle, Hotel Miramar.
