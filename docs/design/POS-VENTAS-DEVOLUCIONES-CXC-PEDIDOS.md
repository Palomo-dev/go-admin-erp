# POS — Ventas, devoluciones, cuentas por cobrar y pedidos online

Fecha: 2026-09-23 · Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`).
Alcance: `/app/pos/ventas` (+ detalle y nueva), `/app/pos/devoluciones` (+ motivos),
`/app/pos/cuentas-por-cobrar` y `/app/pos/pedidos-online` (+ detalle).

Pedido del dueño: revisar si hay que crear o rediseñar estas páginas, entender qué datos
traen y con qué lógica, mejorar la UI según el manual de marca y lo ya diseñado,
**conectar más el flujo entre páginas** y listar los errores que el nuevo desarrollo
debe corregir.

> **Estado de la entrega: incompleta en Figma.** El cupo de llamadas del MCP de Figma
> se agotó tras crear la primera tanda de componentes (ver §7). El análisis de código y
> BD de este documento está completo; los frames de pantalla y las capturas
> `42-pos-ventas-*` quedan pendientes.

Convenciones del documento: rutas relativas a la raíz del repo; `VS` =
`src/components/pos/ventas/VentasService.ts`, `DS` =
`src/components/pos/devoluciones/devolucionesService.ts`. Las cifras de BD son conteos
agregados de todo el proyecto (sin identificar organizaciones), tomados el 2026-09-23.

---

## 0. Resumen ejecutivo

1. **El flujo venta → factura → cobro → devolución está roto en los dos sentidos.**
   El detalle de venta busca los pagos con `payments.source='sale'`, pero el checkout los
   escribe con `source='invoice_sales'` y el id de la factura: la tarjeta «Pagos» y el
   ticket salen vacíos. En la BD hay 2.489 pagos `invoice_sales` y 64 `sale`.
2. **Las devoluciones no funcionan como proceso contable.** Hay 7 devoluciones en toda
   la BD, todas de una organización y la última de 2025-07-24. El proceso:
   - no devuelve stock salvo si el producto es serializado;
   - la salida de caja (`cash_movements` sin `organization_id`, NOT NULL) y el pago negativo
     (`payments` sin `currency`, NOT NULL y sin default) fallan en silencio;
   - no escribe `returns.reason_id`: 0 filas lo tienen;
   - no genera asiento: `fn_auto_journal_refund` espera estados que el CHECK de `returns`
     no admite.
3. **«Anular venta» solo cambia `sales.status='void'`.** No anula la factura, la cartera,
   los pagos, el stock ni la comisión. En la BD, 5 facturas vigentes cuelgan de ventas
   anuladas y 1 venta anulada conserva cartera abierta.
4. **El botón «Crear devolución» lleva a una ruta que no existe**
   (`/app/pos/devoluciones/nuevo?sale_id=`, `VentasPage.tsx:113`): da 404.
5. **La cartera no se refresca sola.** `days_overdue` solo se recalcula en un UPDATE
   (`tr_update_days_overdue`) y no hay cron.
   - 204 cuentas siguen `current` con la fecha de vencimiento ya pasada.
   - El desfase máximo de `days_overdue` es de 80 días.
6. **Pedidos online: el 85 % son checkouts abandonados.** En los últimos 30 días hubo
   2.227 expirados frente a 398 confirmados. Además:
   - Ningún pedido de la historia pasó de `confirmed`: hay 0 `preparing`, `ready`,
     `in_delivery` o `delivered`, aunque el CHECK los admite.
   - Los 627 confirmados tienen su venta (`web_orders.sale_id`), pero ninguno está marcado
     como entregado.
7. **La conexión entre páginas es casi inexistente.**
   - La venta no enlaza a sus devoluciones ni a sus notas crédito.
   - La devolución no enlaza a su venta ni a su factura.
   - La cartera enlaza al listado general, no a la cuenta concreta.
   - La propuesta introduce la **Cadena del documento** (`CadenaDocumento`) en la cabecera
     de todos los detalles.

---

## 1. Datos verificados en la BD (MCP, solo SELECT)

| Tabla | Columnas que importan | Estados reales (CHECK) | Conteo actual |
|---|---|---|---|
| `sales` | `status`, `payment_status`, `source` (`pos`/`invoice`/`web`), `balance`, `total`, `tax_total`, `discount_total`, `sale_date`. **No tiene número de venta**: el consecutivo vive en `invoice_sales.number`. | `status`: draft · paid · partial · pending · void. `payment_status`: pending · paid · partial · refunded. | paid 2.498 · pending 930 · void 3 |
| `sale_items` | `quantity`, `unit_price`, `total`, `tax_amount`, `tax_rate`, `discount_amount`, `serial_ids[]` | — | — |
| `invoice_sales` | `number`, `sale_id`, `document_type` (invoice · credit_note · debit_note · proforma · recurring), `related_invoice_id`, `balance`, `status` | draft · issued · paid · partial · void | 8 ventas con más de una factura, así que `.maybeSingle()` falla en esas ventas; 28 notas crédito, todas con total negativo |
| `payments` | `source`, `source_id` (text), `method`, `amount`, `currency` (NOT NULL, sin default), `status` | — | invoice_sales 2.489 · web_order 782 · sale 64 · account_receivable 60 · credit_note 2 |
| `accounts_receivable` | `sale_id`, `invoice_id`, `amount`, `balance`, `due_date` (timestamptz), `status`, `days_overdue`, `branch_id` | **Sin CHECK**: paid · current · overdue · partial | paid 2.574 · current 518 · overdue 215 · partial 71. 16 solo con venta (sin factura). 204 `current` ya vencidas. |
| `returns` | `sale_id`, `total_refund`, `reason` (text), `reason_id` (FK, nunca escrito), `return_items` (jsonb con `id, product_id, reason, refund_amount, return_quantity`), `status`. **No hay tabla `return_items`, ni `refund_method`, ni enlace a la nota crédito.** | pending · processed · cancelled | 7 (todas processed) |
| `return_reasons` | `code`, `name`, `affects_inventory`, `requires_photo`, `is_active`, `display_order` | — | 104 (sembrados por `fn_create_default_return_reasons`) |
| `credit_notes` | saldo a favor del cliente: `amount`, `balance`, `status`, `source_credit_note_id`. **Sin enlace a venta ni a devolución.** | active · used · expired · cancelled | 4 |
| `web_orders` | `order_number`, `status`, `payment_status`, `delivery_type`, `sale_id`, `confirmed_at`, `ready_at`, `delivered_at`, `cancelled_at`, `cancellation_reason`, `stock_released_at` | pending · confirmed · preparing · ready · in_delivery · delivered · cancelled · rejected · refunded · expired | expired 4.618 · cancelled 874 · confirmed 627 · pending 6 |
| `web_order_items` | `status` por línea | pending · preparing · ready · cancelled | — |

Disparadores que el nuevo desarrollo debe **aprovechar, no duplicar**:

- **`payments`**
  - `trg_recalc_invoice_balance_from_payments` recalcula el saldo de la factura.
  - `tr_update_accounts_receivable_on_payment` recalcula la cartera.
  - `trg_auto_journal_payment` genera el asiento.
  - `trg_normalize_payment_status` normaliza el estado.
  - Insertar un pago basta: nunca se escribe `accounts_receivable` a mano.
- **`invoice_sales`**
  - `tr_create_account_receivable` crea la cartera en el INSERT y la actualiza en el UPDATE de estado o saldo.
  - `trg_auto_journal_credit_note` y `trg_auto_journal_void` generan los asientos de nota crédito y anulación.
- **`sales`**
  - `trg_auto_journal_sale_pos` genera el asiento (diferido).
  - `trg_create_commission_on_sale` crea la comisión.
- **`returns`**
  - `trg_auto_journal_refund` existe, pero **nunca se dispara** porque espera `confirmed/completed/approved`.
- **RPC ya existentes**
  - `fn_create_customer_credit` y `fn_liquidar_excedente_nota_credito` (saldo a favor y reintegro).
  - `reserve_stock_for_web_order` y `expire_pending_web_orders`.
  - `get_accounts_receivable_paginated` y `get_accounts_receivable_stats`.
  - `decrement_stock_on_sale`.

Cron: solo existe `reschedule-overdue-tasks`. No hay cron para `expire_pending_web_orders`
ni para refrescar `days_overdue` y el estado vencido de la cartera.

---

## 2. Ventas — `/app/pos/ventas`, `/app/pos/ventas/[id]`, `/app/pos/ventas/nuevo`

### 2.1 Qué hay hoy

**Listado** (`VentasPage.tsx`, `VentasTable.tsx`, `VentasFilters.tsx`)

- **Muestra**
  - Cabecera «{n} ventas encontradas», sin KPIs.
  - Filtros: búsqueda, origen, estado, estado de pago y desde/hasta.
  - Columnas: fecha, origen, id, cliente, total, estado y pago.
  - Menú ⋯: Ver, Imprimir, Duplicar, Crear devolución y Anular.
- **Datos:** `sales` (`VS:43-63`) + `web_orders` (`VS:68-87`), y luego `customers`,
  `sale_items` y `web_order_items`. Son 5 consultas desde el navegador.
- **Lógica:** junta ventas POS y pedidos web y **pagina en memoria** (`VS:114-120`), sin
  `.range()`: por encima de 1.000 filas PostgREST trunca en silencio. Las fechas sí usan
  `getDateRange(..., tz)` y `useFormatDate()`.

**Detalle** (`VentaDetalle.tsx`)

- **Muestra**
  - Tarjetas: productos, pagos, cliente, resumen, mesa, factura (enlace a
    `/app/finanzas/facturas-venta/{id}`), cuenta por cobrar (enlace al listado),
    asiento, web y notas.
  - Botones: Imprimir, Reimprimir en caja, Duplicar, Devolución y Anular.
- **Datos:** hasta 12 consultas secuenciales (`VS:179-431`), la primera sin filtro de
  organización (depende de RLS).

**Nueva** (`NuevaVentaPage.tsx`) reutiliza `CheckoutDialog` → `POSService.checkout`, el
camino único de cobro. Hay que conservarlo.

**Arquitectura**

- Todo es `'use client'` con el cliente de navegador `@/lib/supabase/config`.
- No hay rutas API ni RPC.
- La organización sale de localStorage (`useOrganization.ts:295,376`).
- No hay permisos: ni `usePermission` ni `PermissionGuard`.

### 2.2 Errores (de más a menos grave)

| # | Error | Dónde |
|---|---|---|
| V1 | **Anular** solo hace `UPDATE sales SET status='void'`. No toca `invoice_sales` (sigue emitida y `fn_auto_journal_void` no revierte ingreso ni IVA), `accounts_receivable`, `payments` (la caja sigue contando el dinero), stock, seriales ni comisión. El camino correcto ya existe en `posService.cancelDebtWithCreditNote`, pero solo para carritos con deuda. BD: 5 facturas vigentes de ventas anuladas y 1 venta anulada con cartera abierta. | `VS:640-678`; `posService.ts:2600+` |
| V2 | **Pagos vacíos** en el detalle y el ticket: se busca `source='sale'` con el id de la venta, pero el checkout escribe `source='invoice_sales'` con el id de la factura. | `VS:220-224`; `posService.ts:1971-1972`; `VentaDetalle.tsx:121` |
| V3 | **Doble factura rompe el detalle**: `.maybeSingle()` y `.single()` sobre `invoice_sales` por `sale_id`. Tras una nota crédito (mismo `sale_id`) desaparecen la tarjeta Factura y el badge DIAN. BD: 8 ventas con 2 o más documentos. | `VS:276-280`; `VentaDetalle.tsx:84-88` |
| V4 | «Crear devolución» navega a `/app/pos/devoluciones/nuevo?sale_id=`, que **no existe** (404). | `VentasPage.tsx:113` |
| V5 | **Asiento que nunca aparece**: se filtra `journal_entries.source='sale'`, pero los disparadores escriben `sales` o `invoice_sales`. BD: 1 asiento `sale` frente a 2.444 `sales` y 5.576 `invoice_sales`. | `VS:313-318` |
| V6 | Paginación en memoria y truncado a 1.000 filas; 5 consultas por página. | `VS:114-120` |
| V7 | El filtro de estado para web mapea `paid/void` a estados de `web_orders` que no existen; los pedidos web anulados no aparecen nunca. | `VS:76`; `types.ts:110` |
| V8 | «Anular» y «Duplicar» se ofrecen en pedidos web: Anular falla («Error al anular») y Duplicar deja el carrito vacío. | `VS:651-653`; `VentasTable.tsx:299` |
| V9 | `getDailySummary` (inicio del POS) suma **las anuladas** y cuenta `completed`/`cancelled`, que no existen, así que siempre da 0. | `VS:434-486` |
| V10 | La búsqueda solo mira `notes` aunque el placeholder promete id y cliente; el texto se interpola sin escapar en `.or()`. | `VS:58` |
| V11 | El título muestra el UUID (`Venta #a3f91c02`) en vez del consecutivo; la reimpresión usa `sale.sale_number`, que no existe. | `VentaDetalle.tsx:297,139` |
| V12 | Vencimiento de la cartera pintado con `formatPlain` sobre un `timestamptz` (regla 5 de fechas). | `VentaDetalle.tsx:701` |
| V13 | `confirm()`/`prompt()`/`alert()` para anular, con motivo opcional; anular sin feedback de error. | `VentasPage.tsx:71-82`; `VentaDetalle.tsx:182-185` |
| V14 | Nueva venta: «Guardar pendiente» y «Aplicar cupón» son `alert()` de demo; Duplicar pierde cantidades, modificadores, descuento y precio vigente. | `NuevaVentaPage.tsx:143-177,81-84`; `VS:682-692` |
| V15 | En el diseño ya aprobado (`332:40219`), la barra de acciones del detalle se solapa con los badges («Imprimir d Reimprimir»). | Figma, sección «Ventas — detalle» |

### 2.3 Conexiones que faltan

| De → a | Hoy | Propuesta |
|---|---|---|
| Venta → factura | Enlace; se pierde tras una nota crédito (V3) | Eslabón «Factura» en la cadena; lista de todos los documentos (factura + NC) |
| Venta → cobros | Tarjeta vacía (V2) | Eslabón «Cobros» con suma y saldo; tarjeta con cada pago |
| Venta → cuenta por cobrar | Al listado general | A `/app/pos/cuentas-por-cobrar?id=` con «Registrar cobro» directo |
| Venta → devoluciones / NC | No existe | Eslabón «Devolución» + tarjeta «Devoluciones de esta venta» |
| Venta → pedido web | Tarjeta «Web» sin enlace | Eslabón «Pedido web» (si `web_orders.sale_id` = venta) |
| Factura (Finanzas) → venta POS | No existe | Enlace inverso desde la factura |

---

## 3. Devoluciones — `/app/pos/devoluciones` y `/motivos`

### 3.1 Qué hay hoy

- **Página:** una página con 3 pestañas (Buscar ticket, Procesar e Historial) y 4 tarjetas
  informativas estáticas.
  - No lee `sale_id` de la URL: lo que manda Ventas se pierde.
  - La fecha de la cabecera sale con `toLocaleDateString()` (`page.tsx:95`).
- **Buscar** (`TicketSearch.tsx` → `DS.buscarVentas`, `DS:39-362`)
  - Consulta `sales` con `invoice_sales!inner` (excluye las ventas sin factura) y
    `status='paid'` (excluye `partial`).
  - Hasta 8 consultas.
- **Procesar** (`ReturnForm.tsx` → `DS.procesarDevolucion`, `DS:591-677`): una secuencia
  de escrituras desde el navegador, **sin transacción y con los errores tragados**:
  1. caja;
  2. pago negativo;
  3. nota crédito en `invoice_sales` + `invoice_items`;
  4. saldos de factura, venta y cartera escritos a mano;
  5. estado de la venta;
  6. `returns`;
  7. stock (solo seriales).
- **Historial** (`ReturnsHistory.tsx` → `DS:1070-1228`): KPIs, filtros y CSV.
- **Motivos** (`motivos/page.tsx`, `returnReasonsService.ts`): CRUD de `return_reasons`,
  con duplicar, activar, reordenar (N UPDATE) e importar CSV (N INSERT).

### 3.2 Errores (de más a menos grave)

| # | Error | Dónde |
|---|---|---|
| D1 | **No devuelve stock** de productos sin `track_serial`, y ningún disparador de `returns` lo hace. | `DS:798` |
| D2 | **La salida de caja y el pago de reembolso fallan en silencio**: `cash_movements` sin `organization_id` (NOT NULL) y `payments` sin `currency` (NOT NULL, sin default, verificado); los errores se tragan. Además `original_method` se fuerza a `cash`. | `DS:697-705,719-732,725` |
| D3 | **Parcial tratada como total**: basta elegir todas las líneas, aunque sea 1 unidad de cada una. Entonces emite una NC por el total de la factura y deja la venta `void`. | `ReturnForm.tsx:220`; `DS:621,1396-1398` |
| D4 | **Sin transacción**: si `returns` falla al final, la NC ya quedó emitida. Depende de un carrito en **localStorage** para llamar a `cancelDebtWithCreditNote`. | `DS:656,1262-1271` |
| D5 | **Escribe `accounts_receivable` a mano** (`saldarBalancesCompletos`) en lugar de dejar que lo hagan los disparadores de `payments`/`invoice_sales`. | `DS:1486-1524` |
| D6 | **Reintegro mal calculado**: `unit_price × cantidad`, sin descuento ni impuesto de la línea; «Total reembolsado» del historial suma un IVA proporcional inventado. | `ReturnForm.tsx:120,134`; `DS:1168-1184` |
| D7 | NC parcial con **IVA 19 % cableado**, número `NC-${Date.now()}` fuera del consecutivo, montos positivos (la total los usa negativos) y sin `sale_id`: no se ve desde la venta. BD: las 28 NC existentes son negativas. | `DS:918-922` |
| D8 | **No hay asiento de devolución**: `fn_auto_journal_refund` exige `confirmed/completed/approved`, que el CHECK (`pending/processed/cancelled`) no admite. | baseline `:7194` |
| D9 | `returns` no guarda el método de reintegro: `CajasService` resta **toda** devolución del efectivo esperado aunque se haya pagado con NC o tarjeta, y el arqueo sale descuadrado. | `CajasService.ts:771-811` |
| D10 | **Solo se ven 20 ventas**: `count` nunca se pide, la paginación queda oculta y la búsqueda filtra en memoria dentro de esas 20, sin buscar por número de factura. | `DS:58,338-348`; `TicketSearch.tsx:252` |
| D11 | **Una venta con una devolución previa desaparece**: no se puede hacer una segunda devolución parcial. | `DS:127-140` |
| D12 | **`reason_id` nunca se escribe**: el motivo va en el jsonb y en HTML (RichTextEditor) dentro de `returns.reason`. Por eso el borrado de motivos siempre pasa, el reporte por motivo sale vacío y `affects_inventory`/`requires_photo` no hacen nada. BD: 0 devoluciones con `reason_id`. | `DS:647-653`; `returnReasonsService.ts:190-194`; `ventasReports.ts:447` |
| D13 | El flujo de garantía compara con códigos en minúsculas mientras el catálogo los guarda en MAYÚSCULAS: nunca se activa con el catálogo real. | `DS:841`; `ReturnForm.tsx:434-439` |
| D14 | **Fechas**: filtros como texto `YYYY-MM-DD` contra `timestamptz` (medianoche UTC); `toISOString().split('T')[0]` **prohibido** en `ReturnsHistory.tsx:114` y `motivos/page.tsx:86`; `toLocaleDateString` en `TicketSearch.tsx:196,294` y `ReturnsHistory.tsx:97,297,368`. | — |
| D15 | Historial sin límite ni `count`; ignora `search` y `refundMethod`; la columna Producto sale vacía (`return_items` no guarda el nombre); el motivo se ve como HTML crudo. | `DS:1075-1110`; `ReturnsHistory.tsx:398,417` |
| D16 | Motivos: unicidad del código sin normalizar (compara tal cual, inserta en MAYÚSCULAS); el import CSV parte por `,` sin respetar comillas. | `returnReasonsService.ts:99,108,148,159`; `motivos/page.tsx:111-115` |
| D17 | `inventario/movimientos/MovimientosTable.tsx:77` enlaza a `/app/pos/devoluciones/{id}`, que no existe. | — |

### 3.3 Conclusión

Devoluciones hay que **rediseñarla entera, en UI y en backend**:

- La pantalla pasa de un asistente de 3 pestañas a un **listado + detalle** como el resto
  del sistema.
- La devolución se crea **desde la venta**: diálogo «Crear devolución» con líneas,
  cantidades, motivo y método de reintegro.
- También se puede crear desde el listado, buscando la venta por número de factura, cliente
  o documento.
- Todo pasa por una RPC transaccional (§6).

---

## 4. Cuentas por cobrar del POS — `/app/pos/cuentas-por-cobrar`

### 4.1 Qué hay hoy

**No es una duplicación de código, es una duplicación de ruta.**
`src/app/app/pos/cuentas-por-cobrar/page.tsx` es un envoltorio de 8 líneas que monta
`CuentasPorCobrarPage` de Finanzas, la misma pantalla que ve `/app/finanzas/cuentas-por-cobrar`.

- **KPIs:** «Total por cobrar», «Vigentes», «Vencidas» y «Promedio días cobro». Salen de la RPC
  `get_accounts_receivable_stats(org_id, branch_id_filter)` (`service.ts:496-500`).
- **Pestaña Cuentas:** `get_accounts_receivable_paginated(...)`, paginada en el servidor
  (`service.ts:41-53`).
  - Columnas: cliente, contacto, monto, balance, vencimiento, estado y días.
  - Acciones: Abono, Recordar y Ver.
- **Pestaña Aging:** recorre todas las páginas de la RPC en serie y agrupa en el navegador
  (`service.ts:132-222`).
- **Pestaña Recordatorios:** consulta directa (`service.ts:234-247`).
- **Abono / registrar cobro:** un solo INSERT en `payments` con
  `source='account_receivable'` (`service.ts:268-324`, `id/service.ts:229-270`).
  **Es el patrón correcto**: los disparadores recalculan cartera y factura.
- **Arquitectura:** cliente de navegador; la organización sale de `obtenerOrganizacionActiva()`
  y viaja como `org_id` a RPC `SECURITY DEFINER`; no hay permisos.

### 4.2 Errores (de más a menos grave)

| # | Error | Dónde |
|---|---|---|
| C1 | **Del POS se cae a Finanzas.** «Ver detalle» navega a `/app/finanzas/cuentas-por-cobrar/{id}` y «volver» a `/app/finanzas`. El middleware exige el módulo `finance`, así que **una organización con POS y sin Finanzas ve la lista pero no puede abrir ninguna cuenta**. El título dice «Finanzas / Cuentas por Cobrar» dentro del POS. | `CuentasPorCobrarTable.tsx:138`; `CuentasPorCobrarPage.tsx:135,148`; `middleware.ts:377,575-610` |
| C2 | **El cobro en efectivo no entra en la caja**: ni el abono ni el cobro escriben `cash_movements` ni se asocian a la sesión abierta. Un cobro de cartera en mostrador no aparece en el arqueo. | `service.ts:268-324` |
| C3 | **La cartera no se refresca**: no hay cron. BD: 204 cuentas `current` ya vencidas y hasta 80 días de desfase en `days_overdue`. Además, una cuenta `partial` vencida nunca pasa a «vencida»: el KPI «Vencidas» y Recordatorios filtran `status='overdue'` y el botón «Recordar» queda deshabilitado para ellas. | `20260923210000:38-40`; `service.ts:245`; `CuentasPorCobrarTable.tsx:287,403` |
| C4 | **Anuladas cuentan como cobradas**: anular una factura deja la cartera en `paid, balance=0`, y `get_accounts_receivable_stats` suma las `paid` como cobradas: la «Eficiencia de cobro» sale inflada. | `AnularFacturaDialog.tsx:77-84`; `EstadisticasCards.tsx:96` |
| C5 | **Sobrepago silencioso**: el límite «monto ≤ saldo» solo se valida en el navegador; el disparador hace `GREATEST(balance,0)` y guarda el pago entero. | `AplicarAbonoModal.tsx:147`; `service.ts:287` |
| C6 | **Pago en la sucursal equivocada**: el abono toma la sucursal activa del usuario, no la de la cuenta. | `service.ts:290`; `id/service.ts:232` |
| C7 | **Fechas prohibidas por CLAUDE.md** sobre `due_date` (timestamptz): `parseLocalDate`, `toISOString().split('T')[0]` y `toLocale…` del navegador. El filtro de la RPC usa `created_at::date` (día UTC). | `service.ts:185`; `CuentaPorCobrarDetailPage.tsx:85,101,114-117,128,294`; `CuentasPorCobrarFiltros.tsx:58`; `AgingReport.tsx:72`; `RecordatoriosPanel.tsx:260,265,336,350`; `EnviarRecordatorioModal.tsx:32,135,153`; `InstallmentsCard.tsx:196` |
| C8 | Aging recalculado en el navegador con `new Date()` local: puede no coincidir con `days_overdue`, y el tramo «0-30» incluye lo no vencido y lo pagado. | `service.ts:176,185-186`; RPC baseline `:16508` |
| C9 | Filtro «Cliente» manda texto libre a un parámetro `uuid` y la RPC falla con un toast de error. | `CuentasPorCobrarFiltros.tsx:134-143` |
| C10 | Recordatorios falsos: el modal y el envío masivo solo actualizan `last_reminder_date` y dicen «enviado»; solo el del detalle envía de verdad. | `EnviarRecordatorioModal.tsx:51-63`; `RecordatoriosPanel.tsx:75-82` |
| C11 | Sucursal ignorada en la exportación CSV, en Recordatorios y en el respaldo de estadísticas. «N cuentas activas» cuenta también pagadas y anuladas. «Promedio días cobro» no es el DSO. Las notas del abono se descartan. Pagar cuota y crear cuotas son dos escrituras sin transacción. | `CuentasPorCobrarFiltros.tsx:53`; `service.ts:244,533,298-315,388-405`; `EstadisticasCards.tsx:23`; `id/service.ts:313-346,396-455` |
| C12 | La tabla no muestra la venta ni la factura de origen: **no hay enlace lista → venta** ni **detalle → venta** (el detalle sí enlaza a la factura). | `CuentaPorCobrarDetailPage.tsx:68-69` |

Seguridad: las RPC de cartera (`get_accounts_receivable_paginated`, `_stats`,
`get_account_receivable_detail` y `get_payments_filtered`) ya **no** están concedidas a
`anon`. Hoy `proacl` = postgres, authenticated y service_role (verificado). Siguen siendo
`SECURITY DEFINER` y reciben `org_id` del cliente: falta confirmar que tengan guarda de
pertenencia (ver la memoria «Exposición de RPC a anon»).

### 4.3 Conclusión

No hace falta una segunda pantalla de cartera, pero **sí una ruta propia del POS con su
propio detalle**:

- `/app/pos/cuentas-por-cobrar` y `/app/pos/cuentas-por-cobrar/[id]` reutilizan el mismo
  componente, parametrizado con la ruta base, las migas y el destino de «volver».
- Por defecto se filtra por `accounts_receivable.sale_id IS NOT NULL`: cartera nacida en
  ventas del POS.
- El cobro en efectivo va a la caja abierta.
- Si la organización no tiene `finance`, el POS sigue pudiendo abrir y cobrar cuentas.

---

## 5. Pedidos online — `/app/pos/pedidos-online` y `/[id]`

### 5.1 Qué hay hoy

- **Listado** (`page.tsx`, 1.441 líneas)
  - KPIs con comparación contra el periodo anterior.
  - Vista lista o tablero, acciones masivas, diálogos de confirmar y rechazar.
  - Realtime y autorrefresco cada 30 s.
  - `getOrders` sin límite; paginación de 20 en memoria; `getOrderStats` trae todas las filas
    dos veces.
- **Detalle**
  - `useWebOrderDetail.ts` repite la consulta y tiene su propio `updateOrderStatus`.
  - `OrderHeader.tsx:64-66` **sí enlaza a la venta**.
  - La línea de tiempo se sintetiza de `created_at/confirmed_at/ready_at/delivered_at/cancelled_at`:
    no hay tabla de historial, «Preparando» y «En camino» no tienen hora, y las horas van en la
    zona del navegador.
- **Conversión a venta:** `webOrderConfirmationService.confirmOrder` hace unas 12 escrituras
  sueltas desde el navegador.
  - Crea `sales` (`source='web'`), `sale_items`, stock, comanda, propina, cupón y envío; si
    está pagado, también factura, pago y cartera.
  - Termina con el UPDATE de `web_orders`.
  - Hay **tres implementaciones**: navegador, `webOrderServerConfirmation.ts` para
    auto-confirmación y cron, y `convertToSale`, que es código muerto. Incumple la regla 7.

### 5.2 Errores (de más a menos grave)

| # | Error | Dónde |
|---|---|---|
| P1 | **SEGURIDAD — `/api/web-orders/**` sin autenticación y con service role.** El middleware excluye la ruta con el comentario «autenticación propia via x-webhook-secret», pero la ruta no lee ningún secreto (verificado). Con eso, cualquiera puede: | `middleware.ts:163,996`; `web-orders/[id]/route.ts:4-10,27-225`; `web-orders/route.ts:73,327-370`; `guardrails.test.ts:316` |
| | · con el uuid, **leer datos personales**, cambiar `status` o `payment_status='paid'`, o borrar el pedido (`GET/PATCH/DELETE /api/web-orders/[id]`); | |
| | · **listar los pedidos de cualquier organización** con `GET /api/web-orders?organization_id=N`; | |
| | · crear pedidos con la organización y el precio que mande el cuerpo (`POST`). | |
| | `auto-confirm`, `refund` y `release-stock` aceptan todo si `CRON_SECRET` no está definido. | |
| P2 | **La confirmación puede romperse en el último paso**: `fn_auto_journal_web_order` inserta `invoice_sales.status='confirmed'` (verificado en la BD), valor que `invoice_sales_status_check` no admite. En el camino sin factura (pedido no pagado), el UPDATE final falla **después** de crear venta, comanda y descuento de stock, y reintentar crea otra venta. | función `fn_auto_journal_web_order`; `webOrderConfirmationService.ts:176-187` |
| P3 | **Ventas duplicadas**: la confirmación del navegador no comprueba `sale_id` ni `status='pending'`, y su UPDATE no filtra por estado ni por organización. La del servidor lee y luego escribe sin bloqueo. BD: 1 venta `web` sin pedido que la referencie. | `webOrderConfirmationService.ts:62-195`; `webOrderServerConfirmation.ts:293-300` |
| P4 | **Cancelar un confirmado no revierte nada**: ni venta, ni stock, ni factura, ni pago, ni cartera, ni comanda. El reverso (`/[id]/refund`) existe sin botón. | `OrderActions.tsx:56`; `webOrdersService.ts:480-483` |
| P5 | **El ciclo operativo no se usa**: 0 pedidos en `preparing/ready/in_delivery/delivered` en toda la BD; los 627 confirmados siguen «confirmados». La barra masiva permite «Entregado» sobre pendientes y confirma sin crear la venta; «Marcar pagados» masivo no crea `payments`. | `page.tsx:417-461,849,879` |
| P6 | **El listado está inundado de abandonos**: 4.618 expirados y 874 cancelados (604 con pago fallido) frente a 627 confirmados; 2.227 expirados en 30 días. No hay cron para `expire_pending_web_orders`. | BD |
| P7 | Contra entrega que luego se cobra: nunca se factura. `payment_status='paid'` se escribe antes del pago, y el efectivo no entra en la caja (`include_in_cash_register=false`). | `useWebOrderDetail.ts:303-372`; `webOrderConfirmationService.ts:218-220` |
| P8 | Cartera escrita a mano (`createAccountReceivable`, en los dos caminos) y fallos silenciosos: `createInvoice`/`createPayment` devuelven `''`. | `webOrderConfirmationService.ts:464-491,567-576,624-663`; `webOrderServerConfirmation.ts:738-763` |
| P9 | El camino del servidor **no crea la comanda**: los pedidos auto-confirmados no llegan a cocina. | `webOrderServerConfirmation.ts` |
| P10 | XSS en la impresión masiva (`document.write` con datos de la tienda). Rechazar desde el detalle no libera stock. Realtime con filtro compuesto por coma, que Supabase no admite. `total_revenue` incluye cancelados pagados. Fechas del periodo con `setHours` local y CSV con día UTC. | `page.tsx:156-221,463-512,536`; `useWebOrderDetail.ts:170-184`; `webOrdersService.ts:719-721,765-777` |

### 5.3 Conexiones

| De → a | Hoy | Propuesta |
|---|---|---|
| Pedido → venta | Sí (cabecera) | Eslabón «Venta» en la cadena |
| Pedido → factura / pago / comanda | No | Eslabones «Factura», «Cobros»; enlace a la comanda |
| Venta → pedido | No | Eslabón «Pedido web» en el detalle de venta |
| Pedido → devolución / reembolso | No | Acción «Reembolsar» (RPC) que crea la devolución enlazada |

---

## 6. Propuesta de diseño

### 6.1 Principio: la **Cadena del documento**

Todo detalle (venta, devolución, cuenta por cobrar, pedido online) lleva debajo del
`PageHeader` una `CadenaDocumento`:

**Pedido web → Venta → Factura → Cobros → Devolución**

- Cada eslabón es un enlace a su pantalla, con estado:
  - `hecho`: existe;
  - `actual`: la pantalla abierta;
  - `pendiente`: aún no existe, con su acción («Crear devolución», «Registrar cobro»);
  - `alerta`: existe pero requiere atención (saldo vencido, NC sin aplicar).
- Los eslabones que no aplican se ocultan; por ejemplo, el pedido web en una venta de mostrador.

En las tablas, la columna **«Documentos»** usa `ChipDocumento`: FV, DEV, NC y «Saldo $…».
Con eso cada fila enlaza a sus documentos relacionados sin abrir el detalle.

### 6.2 Pantallas propuestas (sección «POS — Ventas, devoluciones, CxC y pedidos (propuesta)» de `05 POS y ventas`)

> Pendientes de dibujar por el cupo de Figma (§9). La especificación queda aquí para
> retomarlas sin rehacer el análisis.

**Ventas.** Evolución de lo aprobado en `329:36071` y `332:40219`; no se tocan esos frames.

- **Listado v2**
  - Pestañas «Todas · Por cobrar · Con devolución · Anuladas».
  - Columna «Documentos» con `ChipDocumento`.
  - `BadgeEstadoVenta` con los estados reales; «Completada» no existe en la BD.
  - KPIs que **excluyen anuladas y restan devoluciones**.
  - Menú ⋯ con Ver (`Eye`), Ver factura (`FileText`), Registrar cobro (`Banknote`),
    Crear devolución (`Undo`), Imprimir (`Printer`), Enviar (`Mail`/`MessageSquare`),
    Duplicar (`Copy`) y Anular (`Ban`, destructivo).
  - Anular y Devolver no aparecen en pedidos web.
- **Detalle v2**
  - `CadenaDocumento` bajo la cabecera.
  - Título con el consecutivo de la factura, no el UUID.
  - Tarjeta «Cobros» leyendo `payments` de la factura.
  - Tarjeta nueva «Devoluciones y notas crédito».
  - Barra de acciones sin solape: 3 visibles + ⋯.
- **Diálogo «Anular venta»**
  - Motivo obligatorio.
  - Aviso de lo que se revierte: factura → NC, cartera, pagos/caja y stock.
  - Bloqueo si hay devoluciones o cobros posteriores al cierre de caja.
- **Móvil:** listado en tarjetas con chips de documento; detalle con la cadena en vertical.

**Devoluciones.** Rediseño completo:

- **Listado**
  - KPIs: devuelto en el periodo (neto), número de devoluciones, % sobre ventas y motivo principal.
  - Filtros con chips: fecha en la zona de la organización, motivo, método de reintegro y sucursal.
  - Tabla: N.º DEV, fecha, venta (chip), cliente, motivo, unidades, reintegro, método,
    `BadgeEstadoDevolucion` y ⋯.
  - Estados: listo, cargando, vacío, sin resultados, error y sin permiso.
- **Crear devolución** (desde la venta o desde el listado buscando la venta)
  - Una `LineaDevolucion` por línea: seleccionada, disponible, excede o agotada.
  - La cantidad se limita a lo vendido menos lo ya devuelto: **se permiten varias devoluciones
    parciales**.
  - Motivo del catálogo (obligatorio; foto si `requires_photo`).
  - `OpcionReintegro`: efectivo de la caja abierta · nota crédito / saldo a favor · medio original.
  - `ResumenReintegro` con el valor neto (impuesto y descuento prorrateados) y el efecto en
    inventario.
  - Confirmar llama a la RPC `procesar_devolucion`.
- **Detalle** (hoja lateral o página)
  - `CadenaDocumento`, líneas, motivo, método, movimiento de caja, NC generada y asiento.
- **Motivos**
  - Tabla con código, nombre, afecta inventario, requiere foto, activo, orden y **usos**
    (conteo por `reason_id`).
  - Diálogo nuevo/editar.
  - Desactivar en lugar de borrar si tiene usos.

**Cuentas por cobrar (POS)**

- **Listado**
  - Franja `AntiguedadCartera`: tramos clicables Al día · 1–30 · 31–60 · 61–90 · +90.
  - KPIs: cartera abierta, vencida (incluye las parciales vencidas), por vencer en 7 días y
    cobrado en el mes.
  - Tabla: cliente, documentos (chip venta/factura), emitida, vence, días de mora (zona de la
    organización), total, abonado, saldo, estado (`DocumentStatusBadge`) y ⋯.
  - Menú ⋯: Registrar cobro `Banknote`, Ver venta `Receipt`, Ver factura `FileText`,
    Enviar recordatorio `MessageSquare`/`Mail`, Ver cuotas `TrendingUp`.
  - Agrupar por cliente.
- **Registrar cobro:** reutiliza `AplicarPagoDialog` (`413:13096`) del kit de Finanzas, con
  el aviso «Entra a Caja 1» si el método es efectivo. No hay lógica duplicada.
- **Detalle:** cadena, abonos y cuotas, sin salir del POS.

**Pedidos online.** Complementa lo aprobado en `447:195913` y `450:212747`:

- Vista por defecto **«Activos»** (pendientes, confirmados, en preparación, listos y en camino).
  Los expirados y abandonados van en una pestaña aparte con su contador.
- `SeguimientoPedido` con los 6 pasos y acciones por paso:
  - Marcar en preparación (`ChefHat`);
  - Marcar listo (`CheckCircle`);
  - Entregar / Enviar (`PackageCheck` / `Truck`);
  - Reembolsar (`Undo`).
- La cadena Pedido → Venta → Factura → Cobros en el detalle.
- Diálogo «Entregar pedido» con cobro contra entrega que entra a la caja.

### 6.3 Componentes creados en `02 Componentes` (sección «POS — Ventas (Nuevo)», `680:406327`)

| Componente | Node id | Qué es |
|---|---|---|
| `Tarjeta` | `680:406329` | Tarjeta de detalle con icono de concepto, título, acción opcional y **slot** «Contenido». Sustituye los «Card · …» hechos a mano. |
| `FilaDato` (6 tonos) | `680:406357` | Fila etiqueta–valor: neutro · fuerte · éxito · peligro · advertencia · enlace. |
| `KpiCompacto` (4 tonos) | `680:406370` | KPI de una línea para la franja móvil. |
| `ChipDocumento` (7 tipos) | `680:406423` | Enlace compacto a Factura · Venta · Pedido web · Devolución · Nota crédito · Cuenta por cobrar · Cobro, con el icono del catálogo. |
| `BadgeEstadoVenta` (7) | `680:406510` | Pagada · Pendiente de pago · Pago parcial · Anulada · Devuelta parcial · Devuelta · Sin sincronizar (envuelve `Badge`). |
| `BadgeEstadoDevolucion` (3) | `680:406543` | Procesada · Pendiente · Anulada (`returns.status`). |
| `BadgeEstadoPedido` (10) | `680:406647` | Los 10 valores del CHECK de `web_orders.status`. |
| `EslabonDocumento` (4 estados) | `680:408881` | Eslabón de la cadena: hecho · actual · pendiente · alerta. Props Tipo, Número, Detalle e Icono. |
| `CadenaDocumento` (horizontal/vertical) | `680:409052` | Pedido web → Venta → Factura → Cobros → Devolución; 1128 escritorio y 358 móvil. |
| `PasoPedido` (4 estados × columna/fila) | `680:409121` | Paso del seguimiento del pedido. |
| `SeguimientoPedido` (horizontal/vertical) | `680:409232` | Recibido → Confirmado → En preparación → Listo → En camino → Entregado. |

Hallazgo en el kit: en las variantes `Size=sm` de `Badge` (`7:70`), el texto **no está
enlazado** a la propiedad `Texto`, así que `setProperties({Texto})` no hace nada y hay que
sobrescribir el texto directamente. Los `BadgeEstado*` ya lo resuelven con override; conviene
enlazar la propiedad en el kit.

---

## 7. Cambios de backend y BD necesarios (propuesta, **sin aplicar**)

Cada uno como migración aditiva con su rollback (`docs/POLITICA-MIGRACIONES.md`), y la
UI llamándolos desde un route handler con `getServerOrgContext()`.

1. **RPC `anular_venta(p_sale_id, p_motivo)`**, transaccional y `SECURITY INVOKER`, con guarda
   de pertenencia.
   - Nota crédito por el saldo facturado: `invoice_sales` `document_type='credit_note'`,
     consecutivo oficial y `related_invoice_id`.
   - Factura a `void`; la cartera la ajustan los disparadores.
   - Reverso de pagos o salida de caja si la sesión sigue abierta.
   - Stock y seriales de vuelta; comisión revertida; `sales.status='void'`; auditoría.
   - Reutiliza la lógica de `cancelDebtWithCreditNote` movida a SQL.
2. **RPC `procesar_devolucion(p_sale_id, p_lineas jsonb, p_reason_id, p_metodo, p_notas)`**,
   transaccional.
   - Valida cantidades contra lo vendido menos lo devuelto.
   - Calcula el neto por línea con impuesto y descuento prorrateados.
   - Inserta `returns` con `reason_id`.
   - Repone stock en todo producto con `affects_inventory` (no solo seriales).
   - Crea la NC oficial y aplica el reintegro según el método:
     - efectivo → `cash_movements` en la sesión abierta, con `organization_id`;
     - nota crédito → `fn_create_customer_credit`;
     - medio original → `payments` negativo con `currency`.
   - Deja `sales.payment_status='refunded'` solo si la devolución es total por cantidades.
3. **Columnas nuevas en `returns`**, todas NULL-ables: `refund_method text`,
   `credit_note_invoice_id uuid` (FK `invoice_sales`), `customer_credit_id uuid` (FK
   `credit_notes`), `cash_movement_id int`, `number text` (consecutivo DEV) y `notes text`.
   - Con ellas el arqueo resta solo lo pagado en efectivo (D9).
   - Tabla **`return_lines`** (return_id, sale_item_id, product_id, quantity, refund_amount,
     tax_amount, restocked) en lugar del jsonb, para poder sumar lo devuelto por línea.
4. **Corregir `fn_auto_journal_refund`** para que se dispare con `processed`, y
   **`fn_auto_journal_web_order`** para que no inserte `status='confirmed'`: o se elimina la
   factura fantasma `WEB-…` o se usa `issued`.
5. **RPC `confirmar_pedido_web(p_order_id)`** idempotente.
   - Hace `SELECT … FOR UPDATE`, exige `status='pending'` y `sale_id IS NULL`.
   - Reutiliza el checkout del POS (`pos_checkout_v1`).
   - Sustituye las tres implementaciones.
   - Con ella, **`transicion_pedido_web(p_order_id, p_estado)`**: una máquina de estados con
     tabla `web_order_status_history` (order_id, from, to, at, by, reason) y columnas
     `preparing_at`, `in_delivery_at` y `cancelled_by`.
6. **RPC `registrar_cobro_cxc(p_ar_id, p_monto, p_metodo, p_referencia)`**.
   - Valida `monto ≤ saldo` en el servidor.
   - Toma la sucursal de la cuenta.
   - Si es efectivo, lo registra en la caja abierta.
   - Inserta `payments` y deja la cartera a los disparadores.
7. **Cron** para la cartera y los pedidos.
   - Cartera diario: refresca `days_overdue` y pasa `current`/`partial` vencidas a vencida.
     Hoy 204 filas están desfasadas.
   - Pedidos cada 5 min: `expire_pending_web_orders(…)`.
8. **Índices** para las nuevas consultas; verificar con `get_advisors` antes de crearlos.
   - `payments (source, source_id)`;
   - `invoice_sales (sale_id, document_type)`;
   - `returns (organization_id, return_date desc)` y `returns (sale_id)`;
   - `web_orders (organization_id, status, created_at desc)`;
   - `accounts_receivable (organization_id, status, due_date)`.
9. **CHECK** en `accounts_receivable.status` (hoy no hay ninguno) con los valores reales más
   `cancelled`.
10. **Seguridad**: autenticación fail-closed en `/api/web-orders/**` (secreto del webhook o
    sesión + `getServerOrgContext()`), y corregir la allow-list de `guardrails.test.ts:316`.

Lectura desde la UI: el listado de ventas, el de devoluciones y el detalle con su cadena
deben servirse con **una consulta por pantalla**, sea con RPC de lectura (p. ej.
`venta_con_documentos(p_sale_id)`) o con un route handler en servidor. Hoy se hacen 5 a 12
consultas secuenciales desde el navegador.

---

## 8. Preguntas para el dueño

1. **Anular frente a devolver.** Si la venta tiene factura electrónica aceptada por la DIAN,
   ¿«Anular» debe emitir siempre la nota crédito electrónica, o se bloquea y se obliga a
   «Crear devolución»?
2. **Reintegro por defecto.** ¿Efectivo de la caja, saldo a favor (nota crédito) o medio
   original? ¿Quién puede reintegrar en efectivo sin supervisor, y hasta qué monto?
3. **Plazo de devolución.** ¿Hay un máximo de días desde la venta? ¿Se exige foto en los
   motivos con `requires_photo`?
4. **Cuentas por cobrar en el POS.** ¿Queda como vista filtrada por las ventas del POS, con
   detalle y cobro propios, o se quita del menú del POS cuando la organización tiene Finanzas?
5. **Pedidos expirados y abandonados.** ¿Se ocultan por defecto del listado y se
   limpian o archivan pasado un plazo? Son el 85 % del volumen.
6. **Ciclo del pedido.** ¿Los negocios usarán «En preparación → Listo → En camino →
   Entregado», o basta con «Confirmado → Entregado»? Hoy nadie pasa de confirmado.
7. **Seguridad.** ¿Se corrige ya `/api/web-orders/**` (P1) fuera de este rediseño? Recomiendo
   que sí, de inmediato.

---

## 9. Estado de la entrega en Figma y lo que falta

**Hecho** (en `02 Componentes`, sección `680:406327`):

- Los 11 componentes de §6.3.

**No hecho**, porque el MCP de Figma devolvió «tool call limit» al crear la tercera tanda:

- Componentes `LineaDevolucion`, `OpcionReintegro`, `ResumenReintegro`, `SegmentoCartera` y
  `AntiguedadCartera`.
  - Su especificación está en §6.2.
  - El script falló antes de ejecutarse. Si alguno llegó a crearse, aparecerá en `680:406327`
    y habrá que revisarlo antes de reintentar.
- La sección de pantallas en `05 POS y ventas`: todas las de §6.2 en 1440 y 390 con sus
  estados y diálogos.
- El chequeo por script: solapes, nodos fuera de sección, instancias rotas, textos truncados
  y anotaciones dentro de frames.
- Las capturas `docs/design/figma/42-pos-ventas-*.png`.
