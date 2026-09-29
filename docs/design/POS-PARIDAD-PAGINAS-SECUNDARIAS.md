# POS — Paridad código ↔ Figma de las páginas secundarias

Fecha: 2026-09-24 · Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página
`05 POS y ventas`. Base de datos `jgmgphmzusbluqhuqihj`, solo `SELECT` y conteos agregados, sin datos
personales ni nombres de organizaciones.

Pedido del dueño: terminar de detallar el POS en Figma antes de pasarlo a código. Hay que revisar
interfaz, base de datos, backend, tablas y lógica para que **al cambiar la interfaz no se pierda
ninguna función**. En código no se toca nada; los cambios van a Figma y el dueño los aprueba.

**Alcance:**
- `/app/pos/ventas` (+ `nuevo`, `[id]`)
- `/devoluciones` (+ `motivos`)
- `/cuentas-por-cobrar`
- `/cajas` (+ `[id]`, `arqueos/nuevo`, `movimientos/nuevo`)
- `/comandas` (pantalla de cocina)
- `/pedidos-online` (+ `[id]`)
- `/cupones` (+ `[id]`)
- `/promociones` (+ `nuevo`, `[id]`)
- `/reportes` (+ `satisfaccion`)

Fuera de alcance, porque lo llevan otros agentes: pantalla principal del POS, carritos, pagos
pendientes, propinas, cargos de servicio, mesas y reservas.

**Insumos que se dan por leídos y no se repiten:**
- `POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md`: errores V1-V15, D1-D17, C1-C12 y P1-P10.
- `POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md`: errores 1-22.
- `POS-MESAS-COMANDAS-RESERVAS.md`: K1-K10.
- `POS-CARRITO-LINEAS-NOTAS.md`: N1-N12 y las decisiones de comanda de ajuste, alergia y notas.
- Paridades control por control: `PARIDAD-VENTAS.md`, `PARIDAD-PERFIL-CAJAS.md`,
  `PARIDAD-PEDIDOS-ONLINE.md` y `PARIDAD-MESAS-PROMOCIONES.md`.
- `AUDITORIA-COHERENCIA-FIGMA.md`.
- Decisiones de finanzas: `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md`, `FINANZAS-TESORERIA-FIGMA.md` y
  `FINANZAS-CONTABILIDAD-FIGMA.md`.

Este documento **consolida** esas paridades por página. Añade lo que no tenían: Devoluciones, la
Cuenta por cobrar dentro del POS, Reportes, Satisfacción, la cocina con las decisiones del
2026-09-23 y los estados que faltan. **Re-verifica** contra el código y la BD de hoy, y marca lo que
cambió.

> **Estado de la entrega en Figma: parcial.** El cupo del MCP de Figma se agotó en la tercera llamada
> de dibujo. Quedó hecha la sección completa de **Devoluciones** (16 frames, §4). La especificación
> exacta de lo que falta está en §7, lista para ejecutar con el próximo cupo.

---

## 0. Resumen por página

«Funciones» cuenta los controles y comportamientos que hay en el código. «Faltan en Figma» cuenta
las funciones del código que no tienen frame. «Graves» son los errores que rompen datos, dinero o
seguridad.

| Página | Funciones en código | Estado en Figma hoy | Faltan en Figma | Graves |
|---|---:|---|---:|---|
| Ventas: listado, detalle y nueva | 89 (+34 propuestas) | Calcado (secciones 11-13) | 3 | V1 anular no revierte nada · V2 pagos vacíos en detalle y ticket · V4 «Crear devolución» da 404 |
| Devoluciones | 58 (3 pestañas + garantía + historial + CSV) | **Nuevo hoy** (sección `873:573997`) | 2 retoques (foto del motivo y saldo a favor sin cliente) | D1 no repone stock · D2 salida de caja y reintegro fallan en silencio · D3 una parcial se trata como total · D8 sin asiento · sin NC electrónica a la DIAN · `reason_id` 0 de 7 |
| Motivos de devolución | 14 | **Nuevo hoy** | 0 | D12: el borrado siempre pasa, porque `reason_id` nunca se escribe |
| Cuentas por cobrar (POS) | 71 (componente de Finanzas) | Solo en `07 Finanzas`; nada del POS | 5 | C1 del POS se cae a Finanzas · C2 el efectivo no entra a caja · filtro «Cliente» rompe la RPC · recordatorios simulados · 57 cuentas parciales vencidas fuera de «Vencidas» |
| Cajas: listado y pestañas | 36 + 42 | Calcado (`351:48911`, `680:404392`) | 3 estados | Sin índice único de caja abierta (carrera) |
| Caja: detalle | 37 | Calcado (`355:53496`) | 0 | «Cerrar» sin `puedeCerrarCaja` · la caja global consulta `branch_id = null` |
| Nuevo arqueo | 20 | Calcado (`359:57133`) | 1 (diferencia por método) | **«Guardar arqueo» falla siempre:** `cash_counts.difference` es GENERATED y el insert la manda. **0 arqueos en toda la BD.** La diferencia mezcla métodos. |
| Nuevo movimiento | 13 + diálogo 12 | Calcado | 0 | Dos catálogos de conceptos · «Depósito bancario» cuenta como ingreso |
| Comandas / cocina | 64 | Tablero de escritorio (`445:194864`); KDS de tablet **sin dibujar** | 9 | Los pedidos web auto-confirmados no llegan a cocina · el cronómetro no avanza · el KDS no conoce ajuste, alergia ni `cancelled` (ya en BD) y revive ítems anulados |
| Pedidos online: listado y detalle | 200 | Calcado (`447:195913`, `450:212747`, `464:241316`) | 4 | P1 `/api/web-orders/**` · «Confirmar» masivo sin venta ni comanda · cancelar no revierte · XSS al imprimir |
| Cupones: listado y detalle | 55 | Parcial (`445:194866`) | 7 | Monto fijo imposible (`'fixed'` ≠ `'fixed_amount'`) · no se aplican en el POS · 0 redenciones en la BD |
| Promociones: listado, asistente y detalle | 85 | Calcado (`445:194866`) | 4 | El motor no aplica `usage_limit` · Bundle y Envío gratis no descuentan · Duplicar probablemente falla |
| Reportes POS | 34 | **Nada en Figma** | 34 | Días en UTC · estado `'completed'` inexistente · ventas web contadas como POS · pagos de Finanzas contados como POS |
| Satisfacción en caja | 16 | **Nada en Figma** | 16 | Sin gravedad de datos: 0 calificaciones en `pos_display_feedback` |

---

## 1. Verificado hoy en la BD (cambia o completa los insumos)

| # | Hallazgo | Evidencia (conteos, sin organizaciones) |
|---|---|---|
| B1 | **El arqueo nunca se ha podido guardar.** `cash_counts.difference` es `GENERATED ALWAYS` y `CajasService.ts:1257` la incluye en el `insert` (Postgres 428C9). | `information_schema.columns.is_generated='ALWAYS'`; `cash_counts` = **0 filas**, con 99 sesiones de caja |
| B2 | No hay índice único de caja abierta: la apertura solo se valida en el navegador. | `cash_sessions` tiene solo `pkey` e `idx_cash_sessions_uuid`; 13 sesiones abiertas desde hace más de 24 h |
| B3 | La migración de cocina del otro agente **ya está aplicada**. | Existen `kitchen_tickets.ticket_type` (`order`/`adjustment`), `has_allergy`, `allergy_ack_at`; `kitchen_ticket_items.is_allergy`, `adjustment_kind` (`increase`/`decrease`/`void`/`note`), `quantity_delta`, `cancelled_at`; `status` admite `cancelled`; tabla `pos_quick_notes`. Uso: 0 ajustes, 0 alergias, 0 notas rápidas |
| B4 | Las políticas anónimas `USING (true)` de `coupons` y `promotions` que cita el baseline **ya no existen**; solo queda `*_org_isolation`. | `pg_policies` |
| B5 | Cartera parcial vencida invisible: el disparador pasa la cuenta a `partial` y sale de «Vencidas» y de Recordatorios. | 57 cuentas `partial` con `due_date` pasada y saldo > 0 |
| B6 | Pedidos online: sigue el patrón de abandono. | expirados 4.780 · cancelados 887 · confirmados 642 · pendientes 14 · 0 en preparación, listos, en camino o entregados |
| B7 | Devoluciones: nada nuevo desde el 2025-07. | 7 devoluciones (1 organización), 0 con `reason_id` |
| B8 | La satisfacción en caja existe en BD pero no tiene datos. | `pos_display_feedback` 0 filas; `saved_reports` y `scheduled_reports` 0 |
| B9 | Cupones y promociones sin uso real del límite. | 1 cupón (`percentage`), 0 redenciones; 19 promociones, ninguna agotada |

---

## 2. Matriz de paridad por página

Estados: **calcado** (existe en código y en Figma igual) · **falta** (existe en código y no hay frame)
· **distinto** (hay frame pero cambia la función o el dato; se explica) · **sobra** (en Figma sin
respaldo en BD o backend; se anota el cambio necesario, no se quita). **Nuevo** = no existe en
código y lleva `Marca/Nuevo` en Figma.

Columnas de Figma: E = escritorio 1440 · T = tablet 1024 · M = móvil 390. Las referencias de código
de ventas y devoluciones siguen las abreviaturas de `POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md` (`VS`,
`DS`).

### 2.1 Ventas — listado `/app/pos/ventas`

La paridad control por control está en `PARIDAD-VENTAS.md` §1 (48 calcados). Aquí van solo las
funciones con efecto en datos o en el flujo.

| Función | Código | Figma E / M | Estado |
|---|---|---|---|
| Listado POS + web unido, 5 consultas, paginación en memoria | `VS:43-120` | `329:36071` / `331:54670` | calcado (el truncado a 1.000 filas es de backend, §5) |
| Buscador («ID, cliente, notas»; solo busca en `notes`) | `VS:58` | barra de búsqueda de `329:36071` | distinto: el placeholder promete factura y cliente; se necesita la búsqueda en servidor (§5) |
| Filtros origen, estado, pago y desde/hasta | `VentasFilters.tsx` | `329:111220` | calcado + sucursal, cajero y método (Nuevo) |
| Menú ⋯: Ver, Imprimir, Duplicar, Crear devolución, Anular | `VentasTable.tsx:299`, `VentasPage.tsx:71-113` | `329:112636` | distinto: «Crear devolución» debe abrir el diálogo nuevo `874:578120` (hoy da 404) |
| Anular con `confirm`/`prompt` | `VentasPage.tsx:71-82` | `331:54986` | distinto: motivo obligatorio. **Falta** el aviso de qué se revierte (§7, P-V1) |
| Acciones masivas | — | `329:111876` | Nuevo |
| Estados: cargando, vacío, error, sin sucursal | — | `329:109447`, `329:110082`, `329:110650`, `426:187738` | calcado / Nuevo |
| Imprimir: el ticket usa la sucursal principal (`is_main`), no la de la venta | `printService.ts:154-159` | — | arreglo de código |
| Paginación con 20 por defecto, que no está entre 10/25/50/100 | `VentasPage.tsx:199-209` | `Pagination` 25 | distinto (arreglo de código) |
| Pedido web: «Anular» falla y «Completada» los excluye | `VS:651-653`, `VS:76` | — | arreglo de código (V7, V8) |
| Estado «sin resultados» y «sin permiso» | — | — | **falta** (E) |
| Móvil: cargando y vacío | — | — | **falta** (M) |

### 2.2 Ventas — detalle `/app/pos/ventas/[id]`

| Función | Código | Figma E / M | Estado |
|---|---|---|---|
| Tarjetas: productos, pagos, cliente, resumen, mesa, factura, CxC, asiento, web, notas | `VentaDetalle.tsx`, `VS:179-431` | `332:40219`, `333:40636`, `333:41394`, `333:42129` / `334:95699` | calcado |
| Pagos: leídos de `source='sale'` (vacíos) | `VS:220-224` | tarjeta «Pagos aplicados» | distinto: el diseño muestra los pagos reales (`source='invoice_sales'`); requiere el arreglo V2 |
| Factura con `.maybeSingle()` (desaparece tras una NC) | `VS:276-280` | tarjeta «Factura» | distinto: el diseño lista factura y NC; requiere el arreglo V3 |
| Botones Imprimir, Reimprimir en caja, Duplicar, Devolución, Anular | `VentaDetalle.tsx:139-185` | barra de acciones de `332:40219` | calcado (con el solape V15 sin corregir en ese frame) |
| **Cadena del documento** y tarjeta «Devoluciones y notas crédito» | — | — | **falta**: especificada en `POS-VENTAS-DEVOLUCIONES…` §6.2 y en §7 (P-V2) |
| Pendiente de sincronizar, cargando, no encontrada | — | `333:42840`, `333:43573`, `333:44288` | calcado / Nuevo |

### 2.3 Ventas — nueva `/app/pos/ventas/nuevo`

| Función | Código | Figma | Estado |
|---|---|---|---|
| Reutiliza `CheckoutDialog` → `POSService.checkout` | `NuevaVentaPage.tsx` | `334:129852`, `334:130539` | calcado (camino único de cobro, regla 7) |
| «Guardar» = `alert()` | `NuevaVentaPage.tsx:143-177` | `334:130012` | distinto: diálogo real de espera |
| «Aplicar cupón» = `alert('… (demo)')` | `NuevaVentaPage.tsx:144-152` | `334:130194`, `458:83918` | **sobra**: sin respaldo en backend (RPC `pos_validar_cupon` + redención en `pos_checkout_v1`, §5) |
| Sin sucursal (tarjeta sin salida) | `NuevaVentaPage.tsx:201-213` | `334:123631` | distinto: estado con acción |
| Duplicar: fuerza cantidad 1, vuelve a cotizar y pierde modificadores; con un pedido web queda vacío | `VS:681-700`, `NuevaVentaPage.tsx:66-90` | — | arreglo de código (V14) |
| Habitación del PMS elegida en `CustomerSelector` (se ignora) | `NuevaVentaPage.tsx:130` | `CustomerPicker` | distinto: el diseño no la ofrece; decidir si se conserva |
| Cobro QR: `connectionId: ''` y las 6 rutas `/api/integrations/*/create-qr` toman `organizationId` del body (**regla dura 5**) | `CheckoutDialog.tsx:818` | cobro del POS v2 | fuera de alcance (lo lleva el agente del POS principal); se avisa por seguridad |
| Móvil: productos, carrito y cobro | — | `334:124281`, `334:124307`, `334:124379` | calcado |

### 2.4 Devoluciones `/app/pos/devoluciones` — **rediseño completo, dibujado hoy**

Hoy es un asistente de 3 pestañas: Buscar ticket, Procesar, Historial. Pasa a **listado + detalle +
diálogo desde la venta**. Cada función del asistente tiene destino:

| Función del código | Código | Figma (nuevo) | Estado |
|---|---|---|---|
| Buscar ticket por venta pagada (hasta 8 consultas, solo 20 ventas, filtra en memoria) | `TicketSearch.tsx`, `DS:39-362` | `874:577989` «Nueva devolución · buscar la venta» | distinto: búsqueda en servidor por factura, cliente o documento; admite ventas con devolución previa (D10, D11) |
| Recibir `sale_id` desde Ventas (hoy se pierde) | `page.tsx` (no lee la URL) | se entra directo a `874:578120` | Nuevo |
| Elegir líneas y cantidades | `ReturnForm.tsx:120-220` | `874:578120` líneas con disponible / agotada | distinto: tope = vendido − ya devuelto; varias parciales (D3, D11) |
| Motivo (texto HTML + jsonb) | `ReturnForm.tsx`, `DS:647-653` | select del catálogo, obligatorio | distinto: escribe `reason_id` (D12) |
| Flujo de garantía (códigos en minúsculas: nunca se activa) | `DS:841`, `ReturnForm.tsx:434-439` | motivo «Garantía» con `requires_photo` | distinto: lo decide el motivo, no el código en minúsculas (D13) |
| Método de reintegro (forzado a efectivo) | `DS:697-732` | 3 opciones: efectivo de la caja abierta · saldo a favor · medio original | distinto (D2, D9) |
| **Efectivo sin caja abierta** | — | `874:578327`: efectivo bloqueado + «Abrir caja» | Nuevo (decisión del dueño del 2026-09-23) |
| Reintegro calculado con `unit_price × cantidad` | `ReturnForm.tsx:120,134` | resumen: base, IVA 19 %, descuento prorrateado, total | distinto (D6) |
| NC con IVA 19 % cableado y número `NC-${Date.now()}` | `DS:918-922` | aviso «Se emitirá la NC electrónica NC-000033 sobre F-001482» | distinto: consecutivo oficial (D7). **La NC electrónica a la DIAN/Factus no existe hoy en ningún camino de devolución**: el aviso **sobra** hasta que exista (§5, D-1) |
| Saldo a favor en parcial sin cliente: no crea nada y no avisa | `DS:1343-1382` | opción «Saldo a favor» exige cliente | distinto: deshabilitada sin cliente, con motivo |
| Foto del motivo (ícono de cámara sin carga) | `ReturnForm.tsx` (motivos con `requires_photo`) | ayuda del motivo | **falta**: campo de foto cuando el motivo la exige (§7 P-D) |
| Una sola fecha «desde» en la búsqueda; sin límite de días | `TicketSearch.tsx:107-143` | — | pregunta al dueño (§6.2) |
| Historial: «Buscar por ID venta» que el servicio ignora; producto vacío; motivo en HTML | `DS:1125-1130`, `ReturnsHistory.tsx:398,417` | `873:573998` | distinto: búsqueda real y nombre del producto (`return_lines`) |
| Stock solo para serializados | `DS:798` | «vuelve 1 unidad al inventario de Sucursal Principal» | distinto (D1) |
| Historial: KPIs, filtros, CSV | `ReturnsHistory.tsx`, `DS:1070-1228` | `873:573998` KPIs + tabla; CSV en el «⋯» de la cabecera | calcado + N.º DEV, venta, NC, método y estado |
| Estados cargando, vacío, sin resultados, error, sin permiso | parcial | `873:575233`, `873:575889`, `873:576468`, `873:577079`, `873:577675` | calcado / Nuevo |
| Menú ⋯ (ver, venta, NC, imprimir, enviar, anular) | — | `873:578238` | Nuevo; «Anular devolución» **sobra** hasta que exista backend |
| Detalle de devolución | — (el kardex enlaza a `/devoluciones/{id}` y da 404, D17) | `874:578562` con cadena Venta → Factura → Cobros → Devolución → NC | Nuevo |
| Móvil: listado y crear | — | `873:578460`, `874:580876` | Nuevo |

### 2.5 Devoluciones — motivos `/app/pos/devoluciones/motivos`

| Función | Código | Figma | Estado |
|---|---|---|---|
| CRUD de `return_reasons`, duplicar (`_COPIA`), importar CSV o JSON, exportar CSV | `MP:60-153`, `RRL:132-265`, `RRF` | `874:579636` + diálogo `874:580752` | calcado. «Exportar» va al «⋯» de la cabecera (regla de la fila del buscador) |
| Interruptor «Activo» en la fila | `RRL:132-148` | badge «Activo/Inactivo» + «Desactivar» en el ⋯ | distinto: un interruptor en tabla cambia datos con un toque; se pasa al menú con confirmación si tiene usos |
| Orden (`display_order`): sin campo en el formulario; `reorder()` sin usar | `RRS:266` | columna «Orden» + campo en el diálogo | Nuevo (la columna existe) |
| Métricas «Total motivos» y «Activos» | `RRH:72-198` | subtítulo «6 motivos · 5 activos» | distinto: van al subtítulo, no a KPIs |
| Columna «Usos» (conteo por `reason_id`) | — | `874:579636` | Nuevo (depende de que `reason_id` se escriba) |
| Eliminar con usos → desactivar | `returnReasonsService.ts:190-194` | `874:580841` | distinto: hoy el borrado siempre pasa |
| Código único sin normalizar; CSV partido por comas | `returnReasonsService.ts:99-159`, `motivos/page.tsx:111-115` | ayuda «se guarda en mayúsculas; único» | distinto (arreglo de código, D16) |
| `toISOString().split('T')[0]` | `motivos/page.tsx:86` | — | arreglo de código (regla de fechas 1) |

### 2.6 Cuentas por cobrar `/app/pos/cuentas-por-cobrar`

La página del POS es un envoltorio de 8 líneas que monta `CuentasPorCobrarPage` de Finanzas. En
Figma solo existen los frames de `07 Finanzas` (listado `448:201605` y sus estados, selección
`448:211447`, móvil `449:214437`).

| Función | Código | Figma | Estado |
|---|---|---|---|
| KPIs (Total por cobrar, Vigentes, Vencidas, Promedio días) | `EstadisticasCards.tsx:18-51` | 07 `448:201605` | calcado en 07 |
| Pestañas Cuentas · Aging · Recordatorios · Estadísticas | `CuentasPorCobrarPage.tsx:171-192` | 07 | calcado en 07 |
| Filtros (buscar, estado, aging, cliente de texto, vencimiento) | `CuentasPorCobrarFiltros.tsx:81-212` | 07 | distinto: «Cliente» debe ser `CustomerPicker` (hoy manda texto a un uuid y la RPC falla); «Vencimiento desde/hasta» filtra en realidad por `created_at` |
| Aplicar abono (tope = saldo, referencia si el método la exige) | `AplicarAbonoModal.tsx:146-442`, `service.ts:398-415` | `AplicarPagoDialog` `413:13096` | distinto: por decisión del dueño, el pago se reparte FIFO y el excedente queda como saldo a favor; el efectivo sin caja abierta se bloquea |
| Enviar recordatorio (solo actualiza la fecha) | `EnviarRecordatorioModal.tsx:80-88` | 07 | **sobra**: el diseño promete un envío que no existe (cola de correo y WhatsApp, §5) |
| Ver detalle → `/app/finanzas/cuentas-por-cobrar/{id}` | `CuentasPorCobrarTable.tsx:139` | 07 | **falta**: detalle dentro del POS (C1, §7 P-C) |
| Volver → `/app/finanzas`, migas «Finanzas / …» | `CuentasPorCobrarPage.tsx:135-149` | — | **falta**: migas «POS › Cuentas por cobrar» |
| Cadena Venta → Factura → Cobros en la fila y en el detalle | — | — | **falta** (C12) |
| Exportar CSV (sin sucursal y sin BOM) | `service.ts:521-556` | 07 | calcado + arreglo de código |
| Vacío y sin resultados indistinguibles; errores solo por toast | `Table:166-176` | 07 (faltan sin resultados y sin permiso) | **falta** |

### 2.7 Cajas — listado `/app/pos/cajas`

Paridad detallada: `PARIDAD-PERFIL-CAJAS.md` §B.1 y la sección `680:404392` (pestañas Cajas abiertas
e Historial). El código de hoy ya tiene las tres pestañas, el atajo F9, el CSV del historial y
`GET /api/pos/cajas/permisos`.

| Función | Código | Figma E / M | Estado |
|---|---|---|---|
| Mi caja / Cajas abiertas / Historial en la URL | `CajasPage.tsx:289-302` | `351:48914`, `680:404395`, `680:407222` / `352:52834` | calcado |
| Apertura, cierre (propio o ajeno vía API), movimiento | diálogos, `POST /api/pos/cajas/[id]/cerrar` | `355:141810-14`, `352:53629`, `360:145278` | calcado |
| Cierre ciego | `useBlindCloseMode.ts` | `351:51124`, `352:53228` | calcado. Hay fugas de código: CashSummaryCard y «Ventas efectivo» muestran lo que el ciego oculta, y la notificación de cierre publica la diferencia |
| Historial: rango, resultado del cierre, orden, CSV | `HistorialTab.tsx:153-432` | `680:407222`, `680:409233`, `680:409897` | calcado |
| Sin conexión (Desktop) | `enqueueCashSessionOpen` | `351:53156` | calcado |
| Estados «sin permiso» (E) y «cargando» (M) | — | — | **falta** |

### 2.8 Caja — detalle, arqueo y movimiento

| Función | Código | Figma | Estado |
|---|---|---|---|
| Detalle: KPIs, 4 pestañas, desglose, pagos por método, ventas enlazadas | `CajaDetallePage.tsx:156-680` | `355:53499` … `355:56678` / `358:56956`, `358:57136` | calcado |
| «Cerrar caja» sin `puedeCerrarCaja` | `CajaDetallePage.tsx:198` | `355:55652` | distinto: el diseño lo condiciona al permiso (arreglo de código) |
| Arqueo: billetes, monedas, otros métodos, notas, tipo | `NuevoArqueoPage.tsx:292-548` | `359:57136`, `359:57810`, `359:58439`, `359:58749` / `360:144952` | calcado |
| **Guardar arqueo** | `CajasService.ts:1249-1263` | `360:145358` (confirmar con diferencia) | **distinto: hoy falla siempre (B1)**. El diseño presupone que guarda |
| Diferencia = efectivo + otros métodos − esperado **solo de efectivo** | `NuevoArqueoPage.tsx:138-141` | `359:57136` | **falta**: diferencia por método (efectivo contra efectivo, tarjeta contra tarjeta) (§7 P-K) |
| Denominaciones fijas en pesos | `NuevoArqueoPage.tsx:49-51` | «de la moneda de la organización» | distinto (arreglo de código) |
| Movimiento: tipo, concepto (dos catálogos), monto con `$` fijo, notas HTML | `NuevoMovimientoPage.tsx`, `MovimientosDialog.tsx` | `359:59059`, `359:59464`, `360:145278` / `360:145137` | calcado con catálogo único. «Depósito bancario» debe ser un traslado de Tesorería, no un ingreso (decisión de `FINANZAS-TESORERIA-FIGMA.md`) |

### 2.9 Comandas / cocina `/app/pos/comandas`

Estado del código: tablero de 4 columnas, paginación de 8, filtros de zona y estación (3 fijas),
clic por ítem, arrastrar sin confirmar, sonido y Realtime. La migración de cocina **ya está en BD**
(B3), pero el KDS **no la usa**.

| Función | Código | Figma | Estado |
|---|---|---|---|
| Tablero Nuevos / En preparación / Listos / Entregados | `TicketsGrid.tsx:24-102` | E `453:222907` · M `453:231449` | calcado |
| Zona y estación (3 cableadas) | `FilterBar.tsx:27-103` | `453:223522` | calcado + las estaciones reales de `printer_station_assignments` |
| Contadores por estado (a 0 al filtrar) | `FilterBar.tsx:108-167` | cabecera de columna | distinto (K3) |
| Paginación de 8 antes de repartir | `page.tsx:283-291` | `Pagination` por columna | distinto; en el KDS: sin paginación (K2) |
| Tarjeta: mesa, zona, tiempo, mesero, ítems, variantes, modificadores, nota 📝 | `TicketCard.tsx:98-321` | `ComandaCard` `448:208215` | calcado (sin emojis) |
| Cronómetro | `TicketCard.tsx:102-108` (`useMemo` congelado) | `TiempoTranscurrido` `680:410531` | distinto: debe avanzar |
| Clic en ítem cicla estados; autopromoción del ticket en el navegador | `TicketCard.tsx:222-240`, `page.tsx:194-224` | — | calcado sin frame propio |
| Retroceder una comanda (borra `ready_at`) | `kitchenService.ts:192` | `453:231331` | distinto: pide confirmación y conserva el tiempo |
| Reimprimir por estación | `printJobsService.ts:476-508` | `453:231274` | calcado; la reimpresión del POS sale «Producto × 1» (arreglo de código) |
| **Pantalla de cocina (tablet, oscuro, turno actual)** | — | — | **falta** (§7 P-K1) |
| **Alergia que bloquea «Empezar»** (trigger ya en BD) | `trg_kitchen_ticket_alergia_guarda`; componente `ComandaKDS · notas` `848:30505` | solo el componente | **falta** la pantalla y el diálogo «Confirmar alergia» (§7 P-K2) |
| **Comanda de ajuste** (`ticket_type='adjustment'`, `quantity_delta`) | solo BD | — | **falta** (§7 P-K1) |
| **Ítem anulado** (`cancelled` + motivo) | solo BD; hoy `updateTicketStatus` lo revive | — | **falta** (§7 P-K1) |
| Pedido web en cocina (hoy sale como «Mesa») | `TicketCard.tsx:98` | — | **falta** (§7 P-K1) |
| Estados: cargando, vacío, error, sin sucursal | `page.tsx:64-68` (error solo por toast) | `453:224041`, `453:224350`, `453:224690`, `453:231636` | calcado / Nuevo |
| Sin permiso · sin conexión (KDS) | — | — | **falta** |

### 2.10 Pedidos online `/app/pos/pedidos-online` y `[id]`

Paridad control por control: `PARIDAD-PEDIDOS-ONLINE.md` (L1-L10, D1-D7, T1-T4, G1-G3, S1-S2,
C1-C3). Las decisiones D1-D5 de ese documento siguen vigentes.

| Función | Código | Figma | Estado |
|---|---|---|---|
| KPIs con comparación, período, buscador, filtros, lista y kanban | `page.tsx:641-1197` | `447:195914`, `448:206758`, `448:220021` / `448:220707` | calcado |
| Acciones por fila según estado | `page.tsx:1079-1158` | `448:214568` | calcado |
| Masivas: Confirmar, En proceso, Listos, Entregados, Marcar pagados, Imprimir, CSV | `page.tsx:848-927` | `448:213805` | distinto: «Confirmar» masivo debe pasar por la misma confirmación (venta + comanda); «Marcar pagados» debe registrar el pago |
| Confirmar (tiempos, pagado) · rechazar con motivo | `page.tsx:1312-1452`, `ConfirmOrderDialog.tsx` | `449:207984`, `449:208113`, `464:241096` | calcado |
| Aviso «el cliente será notificado» | `page.tsx:370,1416` | `464:241318`, `465:85523`, `465:85608` | **sobra** hasta que exista la cola de avisos (decisión D2) |
| Cancelar un confirmado (no revierte nada) | `OrderActions.tsx:56` | `449:208178` | distinto: el diálogo lista lo que se revierte y ofrece «Reembolsar» (G3) |
| Reembolsar (API sin botón) | `/api/web-orders/[id]/refund` | `452:216635` | **sobra**: el endpoint solo acepta secreto de webhook; hace falta una ruta con sesión |
| Asignar conductor, registrar pago, seguimiento | `OrderDeliveryCard.tsx`, `useWebOrderDetail.ts:303-393` | `452:216513`, `452:216577`, `451:213130` | calcado |
| Vista por defecto «Activos» y pestaña «Expirados y abandonados» | — | — | **falta** (§7 P-P) |
| Móvil: cargando y vacío | — | — | **falta** |
| Imprimir (`document.write`, XSS) | `page.tsx:476-527` | `449:208246` | distinto: plantilla del sistema de documentos, con los datos escapados |

### 2.11 Cupones `/app/pos/cupones` y `[id]`

| Función | Código | Figma | Estado |
|---|---|---|---|
| KPIs, buscador, estado, tipo | `CouponsHeader.tsx:87-195` | `458:82437` / `458:83965` | calcado |
| Tabla + badges (Inactivo, Programado, Expirado, Agotado, Activo) | `CouponsList.tsx:100-176` | `458:82437` | calcado |
| Menú ⋯: ver, editar, duplicar, activar, eliminar (bloqueado con redenciones) | `CouponsList.tsx:242-312` | `458:84145` | calcado |
| Formulario (código + generar, tipo, valor, tope, mínimo, límite, fechas, activo, primera compra) | `CouponForm.tsx:89-279` | `458:83786` | calcado + usos por cliente y cliente (Nuevo; las columnas existen) |
| Monto fijo (`'fixed'`) | `cupones/types.ts:3,91` | `458:83786` | distinto: arreglo de tipos (`'fixed_amount'`) |
| Detalle con historial de redenciones + CSV | `cupones/[id]/page.tsx:125-435` | `458:83350` | calcado; la columna «Venta» debe enlazar (hoy es `sale_id.slice(-8)`) |
| Aplicar el cupón en el cobro | `NuevaVentaPage.tsx:144-152` (demo) | `458:83918` | **sobra**: requiere RPC (§5) |
| **Crear lote de cupones** | `CouponsService.importFromData` sin uso | — | **falta** (§7 P-U) |
| Estados cargando, error, sin resultados, sin permiso (E) · cargando y vacío (M) | parcial | `458:83055` (vacío) | **falta** |

### 2.12 Promociones `/app/pos/promociones`, `nuevo` y `[id]`

| Función | Código | Figma | Estado |
|---|---|---|---|
| Listado, KPIs, buscador, estado, tipo, menú ⋯ | `PromotionsHeader.tsx`, `PromotionsList.tsx:190-299` | `454:228254`, `454:230289` / `458:84289` | calcado |
| Asistente 4 pasos (datos, descuento, vigencia y canales, reglas) | `PromotionWizard.tsx:57-896` | `455:231526` … `455:232625` | calcado + sucursales (Nuevo) |
| Bundle y Envío gratis (no descuentan) | `PromotionWizard.tsx:269-405`, `promotionEngine.ts:289-303` | `455:231870` (envío gratis deshabilitado) | distinto; Bundle debe deshabilitarse igual |
| Límite de usos (no se aplica) | `promotionEngine.ts` | `455:232221` + detalle | **sobra** (contador real): el motor debe leer `usage_limit` |
| «Agotada» como estado | — | — | **falta** en el badge (Nuevo, depende del motor) |
| Detalle: descripción HTML cruda, fecha fin corrida un día | `[id]/page.tsx:165-172,301` | `454:229914` | distinto (arreglos de código) |
| Edición sin «volver» (solo «Cancelar» a la lista) | `[id]/page.tsx:200-239` | — | **falta**: el asistente en modo edición con migas y «←» a la ficha |
| Estados: cargando, vacío, error (E) · sin resultados, sin permiso (E) · cargando y vacío (M) | parcial | `454:228873`, `454:229306`, `454:229613` | calcado / **falta** |

### 2.13 Reportes `/app/pos/reportes` — **sin nada en Figma**

| Función | Código (`ReportesPage.tsx`, `reportesService.ts`) | Figma | Estado |
|---|---|---|---|
| Encabezado, «Satisfacción en caja», refrescar, «Exportar ventas» | `:190-221` | — | **falta** |
| Filtros origen (POS / web), fechas, sucursal (cambia la global), «Aplicar filtros» | `:229-291` | — | **falta**; la sucursal va en el header, como en el resto de pantallas |
| 6 KPIs (ventas, transacciones, ticket, ítems, impuestos, descuentos) | `:298-567` | — | **falta** |
| Productos más vendidos (top 5) + CSV top 10 | `:367-403` | — | **falta** |
| Métodos de pago | `:406-432` | — | **falta** |
| Resumen de caja + sesiones de caja | `:436-531` | — | **falta** |
| Ventas por día (se cargan y **no se muestran**) | `:114` | — | **falta**: gráfico diario (Nuevo) |
| Estados: cargando, sin datos, error por toast | — | — | **falta** (más sin permiso) |
| Días en UTC, `.split('T')[0]` sobre `timestamptz`, estado `'completed'` | `reportesService.ts:92-474` | — | arreglo de código (reglas de fechas 2 y 3) |

### 2.14 Satisfacción en caja `/app/pos/reportes/satisfaccion` — **sin nada en Figma**

| Función | Código (`SatisfaccionPage.tsx`, `satisfaccionService.ts`) | Figma | Estado |
|---|---|---|---|
| Volver a Reportes, título, refrescar | `:119-123` | — | **falta** |
| Filtros fecha y sucursal (única vista con `getDateRange` correcto) | `:186` | — | **falta** |
| KPIs Promedio x/5 y Calificaciones | — | — | **falta** |
| Distribución Muy buena … Muy mala | — | — | **falta** |
| Por sucursal y por terminal | — | — | **falta** |
| Vacío, sin terminales vinculadas (con enlace a Configuración › POS › Pantalla del cliente), aviso de tope de 5.000 | `:201-217` | — | **falta** |
| Origen: `pos_display_feedback` vía `POST /api/pos/display/feedback` | route + `resolveDisplayActor` | — | calcado en datos (0 filas hoy) |

---

## 3. Revisión de la lógica de las pantallas

### 3.1 Callejones sin salida

| # | Pantalla | Hoy | Salida propuesta |
|---|---|---|---|
| L1 | Ventas → «Crear devolución» | 404 (`/devoluciones/nuevo`) | Diálogo `874:578120` con `?sale_id` |
| L2 | Kardex → «Ver devolución» | 404 (`/devoluciones/{id}`) | Detalle `874:578562` |
| L3 | CxC dentro del POS → «Ver detalle» | Sale a Finanzas y, sin el módulo `finance`, el middleware lo bloquea | Detalle en `/app/pos/cuentas-por-cobrar/[id]` (§7 P-C) |
| L4 | CxC del POS → «volver» | Va a `/app/finanzas` | Migas «POS › Cuentas por cobrar» |
| L5 | Promoción en edición | Sin migas ni «←»; «Cancelar» va a la lista | Migas + «←» a la ficha |
| L6 | Arqueo | «Guardar» falla siempre (B1) y el usuario ve un toast de error | Arreglo de backend antes del rediseño |
| L7 | Pedido pagado en línea | Auto-confirmado sin comanda; «Confirmar» responde «ya estaba confirmado» | Comanda en la confirmación del servidor (§5) |
| L8 | Cupón en el cobro | `alert('(demo)')` | Diálogo `458:83918` + RPC |
| L9 | Reportes sin datos | «No hay datos para mostrar», sin acción | Vacío con «Cambiar fechas» y «Ir al POS» (§7 P-R) |
| L10 | Satisfacción sin terminal | Texto con ruta | Botón «Vincular pantalla del cliente» (§7 P-R) |

### 3.2 Cada estado con su salida

| Estado | Salida |
|---|---|
| Venta anulada | Ver la NC · Duplicar |
| Venta devuelta parcial | Nueva devolución (queda cantidad) · Ver devoluciones |
| Venta devuelta total | Solo Ver NC |
| Devolución pendiente | Procesar · Anular |
| Devolución procesada | Imprimir · Enviar · Anular (Nuevo, backend) |
| Caja cerrada | Ver reporte · Abrir caja |
| Caja de otro | Ver detalle · Cerrar (si es administrador, con confirmación) |
| Arqueo con diferencia | Nota obligatoria + confirmación |
| Pedido expirado o cancelado | Solo ver; el cancelado pagado, «Reembolsar» |
| Cupón agotado o vencido | Duplicar · Editar vigencia |
| Promoción que se solapa | «Gana el mayor», con motivo (§13 #7) |
| Comanda con alergia | Confirmar alergia → Empezar |
| Comanda de ajuste | Recibido |

### 3.3 Móvil con todo lo de escritorio

| Página | Faltan en móvil |
|---|---|
| Ventas | Cargando, vacío |
| Cajas | Cargando |
| Pedidos online | Cargando, vacío |
| Cupones y promociones | Cargando, vacío; detalle de cupón; detalle de promoción |
| Cuentas por cobrar (POS) | Todo (solo existe el de 07) |
| Reportes y satisfacción | Todo |
| Comandas | El móvil existe; el KDS es de tablet por diseño |

### 3.4 Coherencia entre páginas

- **Barra masiva al pie.** Aplicada en ventas, pedidos, CxC y devoluciones. Devoluciones no tiene
  acciones masivas en código, así que su lista no la lleva: anular va una a una, con motivo.
- **Buscador + «Filtros» y nada más en la fila.** Devoluciones lo cumple; «Exportar CSV» va al «⋯»
  de la cabecera.
- **Menús con `PopoverCard` + `MenuItem`, divisor antes de lo destructivo.** Devoluciones clonó el
  menú aprobado `833:92186`.
- **Paginación.** La de Devoluciones quedó en 1 página: se ocultaron los botones heredados («175»),
  regla (h).
- **La sucursal va en el header, no en filtros propios.** Reportes y Satisfacción la cambian desde
  un select interno que escribe la sucursal global. En el rediseño sale de la página.

---

## 4. Lo agregado en Figma hoy

Sección **`873:573997`** «Devoluciones — listado, estados y móvil (paridad 2026-09-24 · Nuevo)», en
`05 POS y ventas` (x 0, y 137.600, 8.000 × 3.661). Todo es instancia del kit (`PageHeader`,
`StatCard`, `SearchBar`, `FilterButton`, `TableCell`, `Badge`, `ChipDocumento`, `Pagination`,
`EmptyState`, `Skeleton`, `PopoverCard` + `MenuItem`, `CadenaDocumento`, `BadgeEstadoDevolucion`,
`FilaDato`, `FormField`, `NumberInput`, `Checkbox`, `Switch`, `ConfirmDialog`, `KpiCompacto`,
`ListCard`, `MobileHeader`). Los colores están ligados a variables y las anotaciones van fuera de
los frames. Los datos son ficticios.

| Frame | Node id |
|---|---|
| Escritorio / Devoluciones — listado (listo) | `873:573998` |
| … (cargando) · (vacío) · (sin resultados) · (error) · (sin permiso) | `873:575233` · `873:575889` · `873:576468` · `873:577079` · `873:577675` |
| … (menú ⋯ por fila) | `873:578238` (menú `873:578358`) |
| Móvil / Devoluciones — listado (tarjetas) | `873:578460` |
| Diálogo — Nueva devolución · buscar la venta | `874:577989` |
| Diálogo — Crear devolución (desde la venta, con caja abierta) | `874:578120` |
| Diálogo — Crear devolución (sin caja abierta: efectivo bloqueado) | `874:578327` |
| Escritorio / Devolución — detalle (procesada, reintegro en efectivo) | `874:578562` |
| Escritorio / Devoluciones — motivos (listo) | `874:579636` |
| Diálogo — Nuevo motivo de devolución | `874:580752` |
| ConfirmDialog — Desactivar motivo con usos | `874:580841` |
| Móvil / Crear devolución (hoja a pantalla completa) | `874:580876` |

Se marca «Nuevo» toda la sección: en código no existe listado, detalle, diálogo desde la venta ni
motivos con usos.

**Sin verificar visualmente.** La segunda tanda (diálogos, detalle, motivos y hoja móvil, más el
arreglo de la tabla y la paginación del listado) se escribió sin errores. La captura de control ya
no fue posible: `get_screenshot` gasta el mismo cupo. Solo existe una captura del primer listado,
previa al arreglo, y no se guardó porque ya no es fiel.

---

## 5. Cambios de backend necesarios

Aditivos, por el MCP, con `.sql` y reversión. Se citan los de los insumos para no duplicarlos; los
nuevos de esta revisión van primero.

| # | Cambio | Por qué | Origen |
|---|---|---|---|
| K-1 | **Quitar `difference` del insert de `cash_counts`** (`CajasService.ts:1257`) y recalcular el esperado **por método** en el servidor | B1: 0 arqueos guardados; la diferencia mezcla métodos | nuevo |
| K-2 | Índice único parcial de sesión abierta por modo (usuario, sucursal o global) y cierre por RPC que recalcule la diferencia en el servidor | B2; la diferencia la calcula el navegador y la API la acepta | nuevo |
| K-3 | `payments.cash_session_id` (NULL-able) y cierre que sume por sesión, no por ventana de tiempo | Un cobro sin caja no cae en ninguna sesión; cajas globales solapadas | nuevo (apoya la decisión «efectivo sin caja se bloquea») |
| K-4 | El KDS debe usar lo que ya está en BD: rutas API para `pos_cocina_confirmar_alergia`, `pos_cocina_enviar_ronda` y `pos_cocina_ajustar_linea_mesa` (hoy solo `service_role`); `updateTicketStatus` excluye los ítems `cancelled`; consulta con ventana de turno | B3; decisiones de comanda de ajuste y alergia | otro agente (coordinar) |
| K-5 | La confirmación en el servidor de pedidos web **crea la comanda** | L7 | nuevo (P9 lo anotaba) |
| R-1 | Reportes con `getDateRange(tz)`, estados reales (`paid`, `partial`, `pending`), `sales.source='pos'` y pagos del POS; o mejor una RPC `pos_reporte_periodo(p_desde, p_hasta, p_branch)` que devuelva KPIs, días, top y métodos | Cifras falsas | nuevo |
| D-1 | RPC `procesar_devolucion` + columnas en `returns` (`refund_method`, `credit_note_invoice_id`, `customer_credit_id`, `cash_movement_id`, `number`, `notes`) + `return_lines`. Después, el envío de la **NC electrónica** por la misma vía que la factura (`/api/factus/…`, fuera de la transacción y con reintento) | Todo §2.4; hoy ningún camino emite NC a la DIAN | `POS-VENTAS…` §7.2-7.3 + nuevo (NC electrónica) |
| D-2 | `anular_devolucion(p_return_id, p_motivo)` | Menú «Anular devolución» | nuevo |
| D-3 | Corregir `fn_auto_journal_refund` para `processed` | Sin asiento de devolución | `POS-VENTAS…` §7.4 |
| V-1 | RPC `anular_venta` (NC, cartera, pagos o caja, stock, comisión) | V1 | `POS-VENTAS…` §7.1 |
| C-1 | RPC `registrar_cobro_cxc` alineada con `fn_registrar_pago` de la ficha del cliente (FIFO + saldo a favor; efectivo sin caja bloqueado) | Decisión del dueño; C2, C5, C6 | `CLIENTE-PAGO…` §A.4 |
| C-2 | Cron de cartera (`days_overdue` y vencidas, incluidas las parciales) | B5 | `POS-VENTAS…` §7.7 |
| C-3 | Recordatorios por la cola de trabajos (correo y WhatsApp), no solo `last_reminder_date` | Envío simulado | nuevo |
| P-1 | Autenticación fail-closed en `/api/web-orders/**` | P1 | `POS-VENTAS…` §7.10 |
| P-2 | Ruta de reembolso con sesión y `getServerOrgContext()` | Botón «Reembolsar» | `PARIDAD-PEDIDOS-ONLINE.md` D4 |
| U-1 | `'fixed'` → `'fixed_amount'`; UNIQUE `(organization_id, lower(code))` en `coupons`; RPC `pos_validar_cupon` + redención en `pos_checkout_v1`; RPC de lote de cupones | Cupones | `POS-PROMOCIONES…` §7.1-7.3 + nuevo (UNIQUE, lote) |
| M-1 | Motor: `usage_limit`, «Agotada», Bundle real o deshabilitado, `promotion_redemptions` | Promociones | `POS-PROMOCIONES…` §7.2, §7.7 |
| S-2 | Las rutas `/api/integrations/*/create-qr` y `bold/*` toman `organizationId` del body: pasarlas a `withOrg` (regla dura 5). El cobro QR manda `connectionId: ''` y responde 400 | Seguridad multi-tenant; el cobro QR no funciona | nuevo (avisar al agente del POS principal) |
| X-1 | Fuera de alcance, para el agente del POS principal: (a) `add`/`remove`/`update`/`setCustomer` del carrito guardan `getActiveCarts()` y **borran los carritos `hold_with_debt`**, que devoluciones y deuda necesitan (`posService.ts:927-973, 2515`); (b) el cobro reparte el impuesto con una tarifa promedio en todas las líneas y eso llega a la DIAN (`CheckoutDialog.tsx:1112-1127`) | Pérdida de deudas y factura electrónica con tarifas falsas | nuevo |
| S-1 | Permisos por acción, resueltos en el servidor: `pos.devoluciones.crear` / `.anular` / `.reintegro_efectivo`, `pos.cocina.operar`, `pos.reportes.ver`, `pos.cxc.cobrar` | Ninguna de las 13 páginas verifica permisos | nuevo + `POS-PROMOCIONES…` §7.6 |

---

## 6. Preguntas para el dueño

1. **Devolución vs anulación con factura electrónica aceptada.** ¿«Anular venta» emite siempre la NC
   electrónica, o se bloquea y obliga a «Crear devolución»? El diseño de devoluciones ya emite la
   NC; falta decidir el de anulación.
2. **Plazo y aprobación de devoluciones.** ¿Hay un máximo de días? ¿El reintegro en efectivo por
   encima de cierto monto pide supervisor? `returns.status='pending'` existe en BD y hoy no tiene
   flujo; el diseño lo muestra como «Pendiente».
3. **Método de reintegro por defecto.** El diseño preselecciona efectivo de la caja abierta, y
   saldo a favor cuando no hay caja. ¿Está bien?
4. **Cuentas por cobrar en el POS.** ¿Vista filtrada por ventas del POS, con detalle y cobro
   propios dentro del POS (recomendado)? ¿O se quita del menú cuando la organización tiene Finanzas?
5. **Arqueo por método.** ¿El arqueo compara efectivo contra efectivo y cada medio contra su propio
   esperado (recomendado)? ¿O solo cuenta el efectivo?
6. **Cocina.** ¿La pantalla de cocina es un modo del mismo `/app/pos/comandas` (botón «Pantalla
   completa de cocina») o una ruta aparte para la tableta, con su propio permiso?
7. **Reportes.** ¿Se quedan en el POS o se mueven a `Reportes` (el módulo transversal)? En los dos
   casos, ¿ventas web aparte o juntas con una columna de origen?
8. **Cupones por lote.** ¿Se exportan (CSV/PDF) o se envían al cliente desde la cola de avisos?

---

## 7. Pendiente por cupo de Figma (especificación lista para ejecutar)

Mismo patrón que la sección `873:573997`: clonar el cascarón de `329:36071` (escritorio) y de
`331:54670` (móvil), vaciar «Página» y componer con el kit. Cada bloque cabe en una llamada de
`use_figma`. El script de la tanda KDS quedó escrito y no llegó a ejecutarse.

| Id | Sección y frames | Componentes |
|---|---|---|
| P-K1 | **«Cocina (KDS) — tablet»** (nueva, bajo `873:573997`). `Tablet / Cocina — KDS (listo)` 1024, modo oscuro por variables. Barra con estación (`Chip toggle` desde `printer_station_assignments`), turno actual, reloj y sonido. Columnas Nuevas / En preparación / Listas. `ComandaKDS · notas` nueva (alergia pendiente) y preparando. Tarjeta **Web P-0002144** (número, cliente, promesa, nota del cliente). Tarjeta **comanda de ajuste** (borde advertencia, «+1 Hamburguesa · ahora 2», «−1 Limonada» tachado con motivo, «Recibido»). Tarjeta lista con «Entregar» | `ComandaKDS · notas` `848:30505`, `TiempoTranscurrido` `680:410531`, `LineNote` `845:558032`, `Chip`, `Badge`, `Button` |
| P-K2 | `Tablet / Cocina — confirmar alergia` (velo + diálogo: alérgeno, casilla «Confirmo…», «Confirmar y empezar») · `… vacío` · `… sin conexión` · `… sin permiso` | `EmptyState`, `Checkbox`, `LineNote Destino=alergia` |
| P-D | Retoques a la sección `873:573997`: en `874:578120` añadir el campo «Foto del producto» cuando el motivo tiene `requires_photo`, y la opción «Saldo a favor» deshabilitada con motivo cuando la venta no tiene cliente. En `874:579636`, «Exportar CSV» en el ⋯ de la cabecera | `FormField`, `opción` deshabilitada |
| P-V1 | `Diálogo — Anular venta (qué se revierte)`: motivo obligatorio, lista factura → NC, cartera, pagos/caja, stock y comisión; bloqueo si hay devoluciones o la caja del cobro está cerrada (entonces «Crear devolución») | `ConfirmDialog` ampliado, `FilaDato`, avisos |
| P-V2 | `Escritorio / Ventas — detalle v2` = clon de `332:40219` + `CadenaDocumento` bajo la cabecera + tarjeta «Devoluciones y notas crédito» (DEV-000008, NC-000033) + barra de acciones 3 + ⋯ (arregla V15). `Móvil / Ventas — listado (cargando · vacío)` | `CadenaDocumento`, `ChipDocumento`, `BadgeEstadoVenta` |
| P-C | **«Cuentas por cobrar — POS»**: listado con migas del POS, franja de antigüedad, KPIs (incluye parciales vencidas), columna «Documentos» con `ChipDocumento` · detalle `/app/pos/cuentas-por-cobrar/[id]` con cadena y abonos · `Diálogo — Registrar cobro` (reparto FIFO + saldo a favor; efectivo sin caja **bloqueado** con «Abrir caja») · estados sin resultados y sin permiso · móvil listado, detalle y hoja de cobro | `AplicarPagoDialog` `413:13096` como base, `DocumentStatusBadge`, `KpiCompacto` |
| P-K | `Escritorio / Cajas — nuevo arqueo (diferencia por método)`: tabla método · esperado · contado · diferencia, nota obligatoria si ≠ 0 · `Cajas — listado (sin permiso)` · `Móvil / Cajas — listado (cargando)` | `NumberInput`, `FilaDato`, `EmptyState` |
| P-P | `Escritorio / Pedidos online — lista (Activos por defecto)` con pestañas «Activos · Todos · Expirados y abandonados (4.780)» · `Móvil / Pedidos online — (cargando · vacío)` | `SegmentedControl`, `Skeleton`, `EmptyState` |
| P-U | `Diálogo — Crear lote de cupones` (prefijo, cantidad, longitud, límite por cupón y por cliente, vigencia en el día de la organización, promoción vinculada) + `… lote creado` (`CodigoCupon` ×8, «Exportar CSV») · `Cupones — (cargando · error · sin resultados · sin permiso)` · `Promociones — (sin resultados · sin permiso)` · móvil cargando y vacío de ambos · asistente en modo edición con migas y «←» · badge «Agotada» | `CodigoCupon` `690:17034`, `PasoAsistente`, `EmptyState` |
| P-R | **«Reportes del POS»**: `Escritorio / Reportes — listo` (6 `StatCard`, gráfico de ventas por día con barras ligadas a `brand/action`, top productos, métodos de pago, resumen de caja, sesiones) · cargando · vacío con acción · error · sin permiso · `Satisfacción en caja` (promedio, distribución en 5 barras, por sucursal y por terminal) · vacío · sin terminal vinculada (botón a Configuración › POS) · móvil de ambos | `StatCard`, `Tarjeta`, `FilaDato`, `EmptyState`, `Progress` |
| Q | **Chequeo por script** en `873:573997` y en las nuevas: 0 solapes, 0 nodos fuera de sección, 0 instancias rotas y 0 textos recortados. Capturas `docs/design/figma/61-pos-paridad-*.png` | — |

**Nodo suelto ajeno:** en `05 POS y ventas` hay un frame `__probe__` (`473:85578`) en (0, 0), fuera de
toda sección. No es de esta tanda. Conviene que lo borre quien lo creó; no se tocó.
