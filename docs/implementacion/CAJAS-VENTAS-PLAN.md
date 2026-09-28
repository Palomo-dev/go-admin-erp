# Cajas y Ventas del POS — plan de implementación del rediseño

Fecha: 2026-09-24 · Rama `main` (HEAD `a98961ea`) · Etiqueta de respaldo
`backup/antes-rediseno-pos-finanzas-2026-09-24`.

Fase de **análisis**: solo lectura de código, `SELECT` y conteos por el MCP de Supabase
(`jgmgphmzusbluqhuqihj`), capturas de `docs/design/figma/`. No se tocó código ni esquema. Sin
datos personales ni nombres de organizaciones.

**Encargo del dueño:** construir en código el rediseño de Figma de **Cajas** y de la página de
**Ventas**, con los componentes del kit reutilizados al máximo («si cambian en un lado cambian en
todos»), en 4 idiomas, completamente funcional, sin romper nada y con los PDFs.

**Insumos que se dan por leídos** (no se repiten, se citan): `POS-PARIDAD-PAGINAS-SECUNDARIAS.md`,
`POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md`, `AUDITORIA-CONTROLES-PERFIL-CAJAS.md`,
`PARIDAD-PERFIL-CAJAS.md`, `PARIDAD-VENTAS.md`, `FINANZAS-TESORERIA-FIGMA.md`,
`FINANZAS-CONTABILIDAD-FIGMA.md`, `AUDITORIA-COHERENCIA-FIGMA.md`, `PARIDAD-DASHBOARD-INICIO.md`
§V.9c, `POS-UX-V2.md` §7.5, `DOCUMENTOS-PDF.md`, `CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md`,
`KIT-CODIGO.md`.

Abreviaturas: `CS` = `src/components/pos/cajas/CajasService.ts` · `VS` =
`src/components/pos/ventas/VentasService.ts` · «kit» = `src/components/kit`.

---

## 0. Resumen

1. **Cajas está a medio camino.** El listado (`/app/pos/cajas`, sus tres pestañas) ya está sobre el
   kit y en 4 idiomas (commit `f6c378d3` y `e3ae9dd0`). Faltan: detalle, nuevo arqueo, nuevo
   movimiento, los tres diálogos (apertura, cierre, movimiento: `createPortal` hechos a mano), la
   pestaña «Mi caja» (sigue con `CashSummaryCard`, `MovimientosList`, `ReportGenerator`) y el
   reporte impreso.
2. **Ventas está entero por hacer.** Cero componentes del kit, cero `useTranslations`,
   `confirm()/prompt()/alert()` para anular, y siguen los defectos V1–V15 (anular solo cambia el
   estado; pagos vacíos; factura que desaparece tras una NC; «Crear devolución» da 404; el listado
   mezcla **pedidos web abandonados** con ventas y pagina en memoria).
3. **El backend de cajas ya se movió** (en `main`): `pos_caja_esperado` y
   `pos_caja_registrar_arqueo` (f782c416), índice único de caja abierta por alcance y cierre con la
   diferencia del servidor (6d710143). **La UI nueva los consume; no recalcula nada.** Siguen
   pendientes tres huecos que el rediseño necesita (§5): el cierre no guarda el conteo por método,
   el cierre ciego se puede leer llamando a la RPC, y `payments` sigue sin `cash_session_id`.
4. **Trabajo ajeno en curso que este plan respeta:** devoluciones por `procesar_devolucion`
   (commit `a98961ea` + archivos sin confirmar que **redefinen `pos_caja_esperado`**), y el agente
   de cobro (anular venta por RPC con reverso, deuda por RPC, flete en factura): **`anular_venta`
   no existe todavía en la BD**. Los pasos de UI que dependen de ellos van al final y están
   marcados «bloqueado por».
5. **Componentes a construir UNA vez** (§3.3), compartidos con POS, facturas, CxC, CxP y
   Tesorería: `Tarjeta` + `FilaDato`, `CadenaDocumento` + `ChipDocumento`, estados de venta en
   `StatusBadge`, `ConteoEfectivo` + `ConteoPorMetodo`, `MovimientoCajaForm`, `DialogoMotivo`,
   `RegistrarPagoDialog` compartido y el **motor de documentos** (`documents/`) con el reporte de
   cierre y de arqueo en carta y 80 mm.
6. **Plan en 18 pasos pequeños** (§4), cada uno deja la app funcionando y se verifica con jest,
   `tsc`, `next build` y en el navegador. Primero pruebas de caracterización, después kit, después
   cajas (sin dependencias ajenas), después ventas (con dependencias).
7. **Decisiones del dueño** (§5.3): 14, cada una con recomendación. Las que bloquean antes de
   empezar: D1 (qué filas lista Ventas), D2 (KPIs con criterio de caja), D3 (Nueva venta = la
   pantalla del POS), D6 (cierre guarda arqueo por método) y D8 (cierre ciego en el servidor).

---

## 1. Inventario actual

### 1.1 Rutas

| Ruta | Archivo | Monta | Tipo |
|---|---|---|---|
| `/app/pos/cajas` | `src/app/app/pos/cajas/page.tsx` (17) | `<Suspense><CajasPage/>` | cliente |
| `/app/pos/cajas/[id]` | `…/cajas/[id]/page.tsx` (27) | valida UUID → `CajaDetallePage sessionUuid` | cliente |
| `/app/pos/cajas/[id]/arqueos/nuevo` | `…/arqueos/nuevo/page.tsx` (26) | `NuevoArqueoPage` | cliente |
| `/app/pos/cajas/[id]/movimientos/nuevo` | `…/movimientos/nuevo/page.tsx` (26) | `NuevoMovimientoPage` | cliente |
| `/app/pos/ventas` | `src/app/app/pos/ventas/page.tsx` (5) | `VentasPage` | cliente |
| `/app/pos/ventas/[id]` | `…/ventas/[id]/page.tsx` | `VentaDetalle` | cliente |
| `/app/pos/ventas/nuevo` | `…/ventas/nuevo/page.tsx` (19) | `NuevaVentaPage` | cliente |
| `POST /api/pos/cajas/[id]/cerrar` | `src/app/api/pos/cajas/[id]/cerrar/route.ts` (146) | cierre propio o ajeno | route handler |
| `GET /api/pos/cajas/permisos` | `src/app/api/pos/cajas/permisos/route.ts` (21) | `withOrg` → permisos de caja | route handler |

`[id]` de cajas es el **uuid** de la sesión; lo que ve el usuario es `#id` numérico. No hay ruta
API para abrir caja, registrar movimientos ni listar ventas: todo eso escribe o lee desde el
navegador con `@/lib/supabase/config`.

### 1.2 Cajas — componentes

Rutas relativas a `src/components/pos/cajas/`. «Kit» = usa `@/components/kit`; «i18n» = namespace.

| Archivo | Líneas | Lee | Escribe | Permisos | i18n | Estado de UI |
|---|---:|---|---|---|---|---|
| `listado/CajasPage.tsx` | 491 | `CS.getActiveSession`, `getCashSessionMode`, `getActiveSessions`, `getCashSummary` **por cada caja abierta (N+1)**, `getSessionHistoryDifferences`, `subscribeToCashSessions` | — (monta los diálogos) | `usePermisosCaja` + `puedeCerrarCaja` (`:201`); `useBlindCloseMode` | `cajas.listado.pagina`, `cajas.listado`, `cajas.errores` | **Kit**: `PageHeader`, `KpiStrip`, `StatCard`, `SegmentedControl`, `RowActionsMenu`, `EmptyState`, `BranchBadgeActiva`. Pestaña en `?tab=`, F9 |
| `listado/MiCajaTab.tsx` | 66 | — | — | prop `puedeCerrar` | `cajas.listado.miCaja` | kit `EmptyState` + **viejos** `CashSummaryCard`, `ReportGenerator`, `MovimientosList` |
| `listado/CajasAbiertasTab.tsx` | 298 | props | — | `puedeCerrarCaja` por fila | `cajas.listado.abiertas` | **Kit** completo (`DataTable`, `ListCard`, `ListToolbar`, `FilterPanel`, `AccionRapida`…) |
| `listado/HistorialTab.tsx` | 437 | `getSessionHistoryPaginated`, `…Differences`, `…ForExport` | CSV `cajas-historial-{desde}-a-{hasta}.csv` (`:153-203`, con BOM y fórmulas neutralizadas) | `showExpected` oculta final y diferencia, también en el CSV | `cajas.listado.historial` | **Kit** + `useListadoServidor` (prefijo `h_`), `DateRangeButton`, `Pagination` |
| `listado/comunes.tsx` | 47 | — | — | — | `cajas.listado` | `Oculto`, `SucursalCaja`, `useHaceCuanto` |
| `AperturaCajaDialog.tsx` | 341 | `auth.getUser` + `profiles` directo (`:59-65`), `getCashSessionMode` | `CS.openSession` → insert `cash_sessions` | ninguno | `cajas.apertura`, `cajas.errores` | **`createPortal` a mano** (`:139`); monto inicial por defecto **100.000 cableado** |
| `CierreCajaDialog.tsx` | 680 | `getCashSummary`, `getSessionPaymentsDetail` | `CS.closeSession` → `POST …/cerrar` con **solo `final_amount` y `notes`** | `showExpected` → `'****'` | `cajas.cierre` | **`createPortal`** (`:244`); pinta su propio disparador aunque sea controlado; cuenta por método **y no lo guarda**; notas en `RichTextEditor` (HTML) |
| `MovimientosDialog.tsx` | 341 | — | `CS.addMovement` → insert `cash_movements` | ninguno | `cajas.movimiento` | **`createPortal`** (`:151`); catálogo de conceptos A; guarda el texto traducido |
| `MovimientosList.tsx` | 173 | `getSessionMovements` | — | — | `cajas.detalle` | shadcn |
| `CashSummaryCard.tsx` | 432 | `getCashSummary` | — | `useBlindCloseMode` | `cajas.detalle` | shadcn |
| `ReportGenerator.tsx` | 427 | `generateSessionReport` | `window.open` + `document.write` + `print()` (`:39-46`) | máscara `'***'` | **ninguno (español cableado)** | Inyecta `notes`, `concept` como HTML crudo; sin arqueos ni `method_breakdown`; en la lista de guardarraíl §28 |
| `detalle/CajaDetallePage.tsx` | 695 | `getSessionDetailByUuid`, `getSessionSalesByUuid`, `getSessionPaymentsByMethodByUuid` | — (monta `CierreCajaDialog`, `:686`) | **«Cerrar caja» sin `puedeCerrarCaja`** (`:198`) | `cajas.detalle` | shadcn `Tabs`/`Table`/`Card`; arqueos sin `method_breakdown`; tablas sin paginar |
| `arqueos/NuevoArqueoPage.tsx` | 562 | `ConfiguracionService.getPaymentMethods`, `getSessionByUuid`, `getCashSummaryByUuid` | `CS.createCashCountByUuid` → **RPC `pos_caja_registrar_arqueo`** | `useBlindCloseMode` | `cajas.detalle` | shadcn; **denominaciones colombianas cableadas** (`:51-52`) |
| `movimientos/NuevoMovimientoPage.tsx` | 210 | `getSessionByUuid` | `CS.addMovementToSessionByUuid` → insert `cash_movements` | ninguno | `cajas.detalle` | shadcn; **catálogo de conceptos B** (se guarda el español); `$` literal (`:188`) |
| `SessionsPagination.tsx` | 118 | — | — | — | `cajas.detalle` | **código muerto** (sin importadores) |
| `paymentMethodLabels.ts` | 73 | — | — | — | `cajas.detalle.metodosPago` | `useEtiquetaMetodoPago` |
| `historialCajas.ts` | 250 | — | — | — | — | lógica pura probada (dinero, CSV, búsqueda, `haceCuanto`) |
| `useBlindCloseMode.ts` | 41 | `ConfiguracionService.getBlindCashCountConfig` | — | `showExpected = !ciego \|\| verEsperadoEnCierreCiego` | — | — |
| `usePermisosCaja.ts` | 83 | `GET /api/pos/cajas/permisos` (caché por organización, falla cerrado) | — | — | — | — |
| `types.ts` | 232 | — | — | — | — | `CashSession`, `CashCount` (+`method_breakdown`), `CashSummary`… |

Consumidores de fuera: `src/app/app/pos/page.tsx` (pantalla del POS) monta `AperturaCajaDialog`
(`:642`) y `CierreCajaDialog` (`:635`) y usa `usePermisosCaja`/`puedeCerrarCaja` (`:78`, `~:620`).
**Rediseñar esos diálogos cambia también la cabecera del POS** (zona de otro agente: coordinar).
`CheckoutDialog.tsx:394`, `spaceConsumptionService.ts:187` y `pms/espacios/[id]/page.tsx:322`
usan `CS.getActiveSession`.

### 1.3 Cajas — servicio, RPC y route handlers

`CS` tiene 1.693 líneas (con cambios sin confirmar de otro agente). Organización, sucursal y
usuario salen de `useOrganization` (`getOrganizationId`, `getCurrentBranchId`, `getBranchFilter`,
`getCurrentUserId`); el modo de caja, de `ConfiguracionService.getCashSessionModeConfig()` con
caché de 30 s (`CS:97`, invalidación `:119`).

| Método | Línea | Tablas / RPC / fetch | Observación |
|---|---:|---|---|
| `getActiveSession` → `findActiveSessionRemote` | 133 / 157 | `cash_sessions` (modo `user`: sucursal + `opened_by`; modo `branch`: sucursal y luego global), `profiles`, `branches`; sin red: réplica local | |
| `getOpenSessionsCount`, `getActiveSessions` | 303 / 322 | `cash_sessions` abiertas de **toda la organización** | |
| `historyQuery` + `getSessionHistoryPaginated` / `…Differences` / `…ForExport` | 390 / 440 / 473 / 485 | `cash_sessions` + filtros (sucursal o global, estado, rango `opened_at`, resultado, id o cajero) | límites 10.000 y 5.000 |
| `openSession` | 505 | insert `cash_sessions`; 23505 → `caja_*_abierta` (`:592`) | sin red: `enqueueCashSessionOpen` |
| `closeSession` → `closeOnServer` | 612 / 681 | **`fetch POST /api/pos/cajas/{id}/cerrar`** `{final_amount, notes}` | sin red: outbox con diferencia local |
| `addMovement`, `addMovementToSession` | 701 / 1271 | insert `cash_movements` (sin `branch_id`; el disparador `trg_branch_default` lo rellena) | sin comprobar que la sesión siga abierta en el servicio |
| `getCashSummary` | 810 | `payments`, `returns`, `folio_items`, `cash_movements`, outbox | **duplica en el navegador la regla de `pos_caja_esperado`** (regla dura 7) |
| `generateSessionReport` | 1128 | `cash_sessions`, `profiles`, `branches`, movimientos, resumen, `payments` | alimenta `ReportGenerator` |
| `getSessionCounts` | 1222 | `cash_counts` | |
| `createCashCount` | 1247 | **`rpc('pos_caja_registrar_arqueo')`** con `parametrosArqueo` (`src/lib/pos/cajas/arqueo.ts`) | |
| `getSessionSales` | 1393 | `sales` (`include_in_cash_register`, `payment_status≠pending`) por ventana de tiempo | |
| `getSessionPaymentsDetail`, `getSessionPaymentsByMethod` | 1429 / 1601 | `payments` + documentos + terceros | |
| `subscribeToCashSessions` | 1643 | Realtime; **no-op**: `cash_sessions` no está publicada | |

Lógica de servidor compartida: `src/lib/pos/cajas/arqueo.ts` (`parametrosArqueo`,
`diferenciaEfectivo`), `reglasCierre.ts` (`puedeCerrarCaja`, `MOTIVO_NO_PUEDE_CERRAR`),
`permisosCaja.ts` (`resolverPermisosCaja` = `hasOrgAdminOrPermission(ctx)`, `orgContext.ts:317`).

`POST /api/pos/cajas/[id]/cerrar`: `getServerOrgContext` + `readOrgBody` (403 si el cuerpo trae otra
organización) · zod estricto `{final_amount, difference? (ignorada), notes?}` · lee la caja (404,
409) · permiso de caja ajena en el servidor (403 `sin_permiso`) · `rpc('pos_caja_esperado')` ·
`update cash_sessions … where status='open'` con el cliente de sesión (RLS aplica). Errores con
`codigo` traducible (`cajas.errores.*`).

**Código muerto que salta todo lo anterior:** `VS.openCashSession` (`VS:533`) y
`VS.closeCashSession` (`VS:571`) insertan y cierran cajas con un esperado que ignora los pagos. Sin
llamadores; `VS.getCurrentCashSession` (`VS:489`) sí se usa (`POSHome.tsx:63`,
`pos/mesas/[id]/page.tsx:200`) e ignora el modo `user`.

### 1.4 Ventas — componentes y servicio

Ningún archivo de ventas usa el kit, `next-intl` ni comprueba permisos; todo es `'use client'` con
el cliente de navegador. Rutas relativas a `src/components/pos/ventas/`.

#### 1.4.1 Componentes

| Archivo | Líneas | Lee | Escribe | Fechas | Diálogos del navegador |
|---|---:|---|---|---|---|
| `VentasPage.tsx` | 193 | `VS.getSales` (`:43`), `VS.getSaleById` para imprimir (`:88`), `PrintService` | `VS.cancelSale` (`:76`); duplicar → `sessionStorage.duplicateSaleItems` (`:61-68`) | `useOrgTimezone` | `confirm` `:71`, `prompt` `:75`, `alert` `:80,82,108` |
| `VentasTable.tsx` | 311 | props | — | `useFormatDate().formatDate/formatTime` (`:58,209,212`) | — ; menú ⋯ propio (`:291-300`): «Crear devolución» solo `paid`/`completed`, «Anular» también en pedidos web (falla) |
| `VentasFilters.tsx` | 145 | — | — | `<input type=date>` nativo (día del dispositivo) | — |
| `VentaDetalle.tsx` | 837 | `VS.getSaleById` (`:113`); `invoice_sales … .eq('sale_id').single()` directo (`:92-96`); `electronicInvoicingService.getInvoiceEInvoiceStatus` (`:99`) | `VS.cancelSale` (`:189`); `PrintJobsService.enqueueSaleTicket(branch_id, {saleNumber: sale.sale_number})` (`:145`; `sale_number` no existe) | `formatPlain` sobre `accounts_receivable.due_date` (timestamptz, `:709`, V12) | `confirm` `:186`, `prompt` `:188`, `alert` `:192` |
| `nuevo/NuevaVentaPage.tsx` | 421 | `POSService.createCart/addItemToCart/updateCartItemQuantity/removeItemFromCart/setCartCustomer/getActiveCarts` | la venta la crea `CheckoutDialog` (`:437`) → `POSService.checkout` (`posService.ts:1718`) → `pos_checkout_v1` | — | `alert` `:106,145,149,157,165,172`, `confirm` `:178`; «Guardar pendiente» y «Aplicar cupón» son simulados; carrito, buscador (`ProductSearch`) y cliente (`CustomerSelector`) **propios**, no los del POS v2 |
| `types.ts` | 133 | `SaleWithDetails`, `SalesFilter` (`status: 'all'\|'pending'\|'completed'\|'cancelled'`, que no son los del CHECK) | | | |

Enlaces de salida: factura → `/app/finanzas/facturas-venta/{id}` (`VentaDetalle:663`); cartera →
listado general `/app/finanzas/cuentas-por-cobrar` (`:711`); asiento → listado
`/app/finanzas/contabilidad/asientos` (`:781`); devolución → `/app/pos/devoluciones/nuevo?sale_id=`
(`VentasPage:112-114`, `VentaDetalle:196-199`) que **no existe** (404). La factura de Finanzas no
enlaza de vuelta a la venta.

#### 1.4.2 `VentasService` (620 líneas, clase estática, sin RPC)

| Función | Línea | Tablas | Defecto |
|---|---:|---|---|
| `getSales(filter, page, limit)` | 9 | `sales` (`.neq('source','web')`, `count:'exact'`, `:43-63`) + `web_orders` (**todos los estados**, `:68-111`) → concatena, ordena y **pagina en memoria** (`:114-120`); luego `customers`, `sale_items`, `web_order_items` | sin `.range()`: tope de 1.000 filas por lista; búsqueda POS solo en `notes` e interpolada sin escapar (`:58`); mapa de estados web incompleto (`:76`); fechas bien (`getDateRange(…, tz, operatingHours)`, `:21-31`) |
| `getSaleById(saleId)` | 179 | `sales` (**sin filtro de organización**), `customers`, `sale_items`, `products`, `payments` (`source='sale'`, `:220-224`), `profiles`, `table_sessions`, `restaurant_tables`, `invoice_sales` (`.maybeSingle()`, `:276-280`), `accounts_receivable` (`:296-300`), `journal_entries` (`source='sale'`, `:313-318`), `journal_lines`; si no, `web_orders` (`:357-426`, `payments: []`) | hasta 12 consultas en serie; V2 (el checkout escribe `source='invoice_sales'` con el id de la factura), V3 (factura + NC con el mismo `sale_id`), V5 (los disparadores escriben `source='sales'`/`'invoice_sales'`) |
| `getDailySummary` | 434 | `sales` del día | suma anuladas; cuenta `completed`/`cancelled` (no existen) (V9) |
| `getCurrentCashSession` | 489 | `cash_sessions` | ignora el modo `user`; lo usan `POSHome.tsx:63` y `pos/mesas/[id]/page.tsx:200` |
| `openCashSession`, `closeCashSession` | 533, 571 | `cash_sessions`, `cash_counts`, `cash_movements` | **muertos** |
| `cancelSale(saleId, reason?)` | 640 | lee `notes, status`; `update sales {status:'void', notes += '[ANULADA] motivo'}` | V1: no revierte factura, cartera, pagos, caja, stock, seriales, comisión ni contabilidad (`trg_auto_journal_void` solo mira `invoice_sales`; `trg_auto_journal_sale_pos` ignora `void`); motivo opcional; `// TODO audit_log` (`:675`) |
| `duplicateSale(saleId)` | 681 | `sale_items` + `products` | `NuevaVentaPage:66-90` agrega cada línea con **cantidad 1**; pedido web → carrito vacío (V14) |

#### 1.4.3 Caminos ajenos que tocan la venta (no se duplican)

| Camino | Dónde | Qué hace |
|---|---|---|
| Deuda: poner en espera con deuda / cancelar deuda con NC | `POSService.holdCartWithDebt` (`posService.ts:1337`), `cancelDebtWithCreditNote` (`:2699-~2950`) | escrituras sueltas desde el navegador (NC, factura `void`, venta `void`/`refunded`, cartera `cancelled`, stock, seriales). **Es el que el agente de cobro pasa a RPC** |
| Liberar mesa con saldo (anular) | `POST /api/pos/mesas/[id]/liberar` (`getServerOrgContext`, permiso `pos.void` con `hasOrgAdminOrPermission`, `:39,59-61`) → RPC `pos_mesa_liberar` (`service_role`) | **patrón de referencia** para el route handler de anular |
| Anular factura desde Finanzas | `finanzas/facturas-venta/id/AnularFacturaDialog.tsx` (199) | factura `void` (dispara `trg_auto_journal_void`), cartera `paid`/0, stock de vuelta; rechaza si hay pagos |
| Asistente GO | RPC `assistant_void_sales_invoice` | factura y venta `void`; rechaza con pagos |
| Devolución | `procesar_devolucion` (solo ventas `paid`), `ReturnForm.tsx:242` | ver §1.9 |
| Flete | `pos_checkout_v1` guarda `sales.delivery_fee` y lo suma al total de la factura pero **no crea la línea en `invoice_items`** | lo arregla el agente de cobro |
| Factura de venta (Finanzas) | `finanzas/facturas-venta/[id]/page.tsx` lee `payments` con `source='invoice_sales'` (`:70-75`) — el camino **correcto** que el detalle de venta debe copiar; `RegistrarPagoDialog.tsx` (399), `NotaCreditoDialog.tsx` (845), PDF por `PDFService.printInvoiceHTML` | ningún componente compartido con ventas salvo `FactusStatusBadge` |

Pruebas existentes de ventas: **ninguna directa**. Solo el guardarraíl de `cajasArqueo.test.ts:94`
(que `VS` no mande `difference` a `cash_counts`) y la forma de la consulta sin red
(`lib/offline/__tests__/screensOffline.test.ts:215-240`).

CSV: no hay utilidad compartida (al menos 8 copias de `escaparCsv`/`celdaCsv`); la de cajas
(`historialCajas.celdaCsv` + `historialACsv`, con BOM y fórmulas neutralizadas) es la mejor y se
propone moverla a `src/lib/utils/csv.ts` en el paso 15 para ventas (sin tocar las demás copias).

### 1.5 Base de datos (verificada hoy por MCP)

**Tablas y columnas que el rediseño usa**

| Tabla | Columnas relevantes | Notas |
|---|---|---|
| `cash_sessions` | `id`, `uuid`, `organization_id`, `branch_id` (NULL = global), `opened_by`, `opened_at`, `initial_amount`, `closed_at`, `closed_by`, `final_amount`, `difference`, `status`, `notes`, **`account_code`**, **`open_scope_key`** | 99 sesiones: 12 abiertas (11 hace más de 24 h), 87 cerradas. **0 cajas globales** en toda la historia |
| `cash_counts` | `count_type`, `counted_amount`, `expected_amount`, `difference` (**GENERATED**), `denominations`, `counted_by`, `verified_by` (sin uso), `notes`, `branch_id`, **`method_breakdown`** | **0 arqueos** todavía (el arreglo acaba de entrar) |
| `cash_movements` | `type` (`in`/`out`), `concept`, `amount`, `user_id`, `notes`, `uuid`, `branch_id`, **`return_id`** | 5 movimientos, 4 conceptos distintos |
| `payments` | `source`, `source_id`, `method`, `amount`, `currency` (NOT NULL), `status` (`completed`/`cancelled`/`failed`), `created_by`, `payment_date`, `change_amount`, `bank_account_id` | **Sin `cash_session_id`**. Fuentes: `invoice_sales` 2.609 · `web_order` 794 · `sale` 64 · `account_receivable` 63 · otras < 20 |
| `sales` | `status` (`paid` 2.618 · `pending` 947 · `void` 4), `payment_status`, `source` (`pos` 2.250 · `invoice` 675 · `web` 644), `include_in_cash_register`, `web_order_id`, `sale_date`, `tax_breakdown`, `delivery_fee`, `tip_amount`, `salesperson_id`… | **No tiene número**: el consecutivo es `invoice_sales.number`. Máximo 1.250 ventas en una organización |
| `invoice_sales` | `number`, `sale_id`, `document_type` (`invoice` 859 · `credit_note` 28 · NULL 2.642), `related_invoice_id`, `status`, `balance` | 8 ventas con más de un documento; 2 ventas anuladas con factura vigente |
| `returns` | + `refund_method`, `cash_session_id`, `cash_movement_id`, `credit_note_invoice_id`, `customer_credit_id`, `idempotency_key`, `notes`, `reason_id` | 7 devoluciones, todas previas a `procesar_devolucion` (`refund_method` NULL) |
| `return_lines` | `return_id`, `sale_item_id`, `quantity`, `unit_refund`, `refund_amount`, `tax_amount`, `reason_id`, `restocked`, `stock_movement_id` | nueva (devoluciones) |
| `organization_settings` | `pos_cash_session_mode` → `{mode}` (2 organizaciones en `user`, el resto por defecto `branch`) · `pos_blind_cash_count` → `{blind_cash_count}` (2 en `true`) | |

**Índices:** `ux_cash_sessions_abierta_por_alcance (organization_id, open_scope_key) WHERE
status='open'`; `idx_cash_sessions_account_code`; en `cash_counts` por sesión, organización, tipo,
fecha y sucursal; `cash_movements` por sucursal, uuid (único) y `return_id`; `returns` por
`sale_id`, `reason_id` y `ux_returns_idempotencia`.

**Disparadores:** `cash_sessions` → `trg_cash_session_open_scope_key` (BEFORE, clave de alcance y
«caja_ya_abierta» en modo `branch`), `trg_auto_journal_cash_session` (AFTER UPDATE: asiento del
cierre), `trg_notify_cash_opened`, `trg_notify_cash_closed`. `cash_movements` →
`trg_auto_journal_cash_movement`, `trg_branch_default`, `trg_branch_audit`. `cash_counts` →
`trg_branch_default`, `trg_branch_audit`. `returns` → `trg_auto_journal_refund`. Pagos y facturas:
los de `POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md` §1 (insertar un pago basta; nunca se escribe la
cartera a mano).

**RLS:** `cash_sessions` y `cash_movements`: `ALL` por pertenencia **sin `WITH CHECK` ni guarda de
autoría** + `branch_access_restrictive`. Cualquier miembro puede hacer `UPDATE` directo de una
sesión (incluida `difference`) saltándose la ruta de cierre: la barrera real es solo la ruta.

**RPC existentes que el rediseño consume**

| RPC | Firma | Seguridad | Uso |
|---|---|---|---|
| `pos_caja_esperado` | `(p_session_id int) → jsonb` `{efectivo_esperado, por_metodo, detalle{inicial, ventas_efectivo, vuelto, abonos_efectivo, entradas, salidas, compras_efectivo, devoluciones}, por_cajero, hasta}` | DEFINER, `fn_assert_acceso_org` + `app_branch_access`; `authenticated` | Desglose, KPIs, cierre, reporte. **Devuelve el esperado a cualquier miembro, también en cierre ciego** |
| `pos_caja_registrar_arqueo` | `(p_session_id, p_tipo, p_efectivo_contado, p_contado_por_metodo, p_denominaciones, p_notas) → jsonb` (fila de `cash_counts`) | DEFINER | Arqueo. **No comprueba que la sesión esté abierta** (lo hace solo la pantalla) y **devuelve `expected_amount` y `difference` también en cierre ciego** |
| `procesar_devolucion` | `(p_organization_id, p_sale_id, p_items, p_refund_method, p_reason, p_notes, p_idempotency_key) → jsonb` | DEFINER | «Crear devolución» desde la venta (contrato en `src/lib/pos/devoluciones/procesarDevolucion.ts`) |
| `pos_checkout_v1` | `(p_envelope jsonb)` | DEFINER | Cobro único (nueva venta) |
| `get_accounts_receivable_*`, `get_invoice_payments`, `fn_create_customer_credit`, `fn_apply_customer_credit` | — | DEFINER | Tarjetas de cartera y saldo a favor |
| `fn_tiene_permiso(p_organization_id, p_code)` | — | DEFINER | Permisos en SQL |

**No existen todavía:** `anular_venta` (lo trae el agente de cobro), `fn_registrar_pago`
(propuesta de `CLIENTE-PAGO-…` §A.4), `fn_inicio_ventas_rango` (propuesta de
`PARIDAD-DASHBOARD-INICIO` §V.9b), `payments.cash_session_id` (K-3), RPC de cierre transaccional,
RPC de listado de ventas o `venta_con_documentos`.

### 1.6 Permisos

Catálogo `permissions` (verificado): `pos.view`, `pos.create`, `pos.void` (1 rol, 3 cargos),
`pos.refund` (1 rol, 3 cargos), `pos.discount`, `pos_access`, `sales_management`,
`reports.sales`, `finance.void`, `pos.propinas.liquidar`. **No hay ningún `pos.cajas.*`.**

| Pantalla / acción | Hoy | Dónde |
|---|---|---|
| Entrar a `/app/pos/**` | módulo `pos` | `middleware.ts:406` |
| Cerrar caja ajena · ver esperado en cierre ciego | `admin.full_access` o rol 1/2 o super admin, **en el servidor** | `permisosCaja.ts`, `orgContext.ts:317` |
| Abrir, movimiento, arqueo | ninguno (RLS + `fn_assert_acceso_org`) | — |
| Ventas: ver, anular, devolver, exportar | **ninguno** | — |

### 1.7 PDFs, impresión y exportación

| Pieza | Archivo | Tecnología | Qué produce |
|---|---|---|---|
| Reporte de caja | `pos/cajas/ReportGenerator.tsx` | `window.open` + `document.write` | carta y 80 mm; toast de éxito aunque el navegador bloquee la ventana |
| CSV del historial de cajas | `listado/HistorialTab.tsx` + `historialCajas.historialACsv` | Blob | bueno (BOM, fórmulas neutralizadas, respeta cierre ciego) |
| Ticket de venta | `src/lib/services/printService.ts` (`smartPrint`, `printTicket`) sobre `@printing` (`print-agent/src/printing/renderHtml.ts`) | ventana de impresión | 80/58 mm; usa la sucursal `is_main`, no la de la venta (`printService.ts:154-159`) |
| Reimpresión en caja | `src/lib/services/printJobsService.ts` (`enqueueSaleTicket`) | cola `print_jobs` → Desktop | ticket; `TicketKind` no tiene cierre ni arqueo |
| Factura en PDF | `src/app/api/facturas-venta/[id]/pdf/route.ts` | puppeteer, carta, sube a Storage `invoices` | endurecida 2026-09-22 |
| Reportes | `src/lib/services/reportes/pdfExportService.ts` | jsPDF | `descargarCierreConsolidado` (cierre contable, no de caja) |
| Motor único de documentos | `DOCUMENTOS-PDF.md` §5 (`documents/`, `buildDocumentHTML`) | — | **no existe en código** |

Guardarraíl §28 (`src/__tests__/guardrails.test.ts:2245`): todo generador nuevo de documentos
entra en su lista (sin moneda fija).

### 1.8 Relación con Finanzas › Tesorería

- `/app/finanzas/tesoreria/**` **no existe**. Hoy hay `bancos`, `ingresos`, `egresos`,
  `transferencias` y `conciliacion-bancaria` por separado.
- La decisión aprobada (`FINANZAS-TESORERIA-FIGMA.md`, 2026-09-23) pone las cajas del POS en
  «Cuentas de dinero» junto a los bancos, **respetando el modo de caja** (por cajero o por
  sucursal), y convierte «Depósito bancario» en un **traslado** caja → banco.
- `src/lib/services/movimientosService.ts` (Ingresos/Egresos de Finanzas) escribe en
  `cash_movements` eligiendo **la última caja abierta de toda la organización** (`:214`), sin
  sucursal ni cajero, y su «Anular» escribe un tipo que no existe (`:376`). Es una **segunda
  implementación** del movimiento de caja: el `MovimientoCajaForm` de este plan (§3.3) debe ser el
  único.
- Otros lectores de `cash_sessions` con reglas propias: `FinanzasDashboardService.ts:192-219`,
  `reportesFinancierosService.getCashReport` (`:291`, filtra `income`/`expense`, que no existen),
  `posDashboardService.ts:245-275`, `pos/reportes/reportesService.ts:428-460`. Todos deberían leer
  `pos_caja_esperado`; queda anotado como riesgo (§5.1), fuera de este alcance.

### 1.9 Trabajo en curso de otros agentes (contratos de partida)

| Agente / commit | Estado | Contrato que este plan usa | Qué NO hace este plan |
|---|---|---|---|
| Cajas — `f782c416` | en `main` | `pos_caja_registrar_arqueo`, `parametrosArqueo`, `CashCount.method_breakdown` | recalcular esperado o diferencia en el navegador |
| Cajas — `6d710143` | en `main` | índice por alcance; `POST …/cerrar` con diferencia del servidor; `usePermisosCaja` | decidir el cierre por nombre de rol |
| Devoluciones — `a98961ea` + archivos sin confirmar | **parcial**: la migración `20260925130300` está aplicada en la BD pero su `.sql` aparece borrado del índice y sin seguimiento a la vez; **redefine `pos_caja_esperado`** (`refund_method IS NULL`); `CS.getCashSummary` lleva el mismo filtro sin confirmar | `procesar_devolucion` + `ReturnForm` | tocar `devolucionesService` ni la RPC |
| Cobro (anular por RPC, deuda por RPC, flete en factura) | **sin RPC en la BD** | se esperará su `anular_venta` (o nombre final) y su route handler | implementar la anulación |
| CxC — `24b2b5d7` | en `main` | filtro «Cliente» por uuid; parciales vencidas | la pantalla de CxC |
| Cambios sin confirmar en 9 componentes de cajas | moneda con `useMonedaOrganizacion` | se parte de ellos | editar esos archivos hasta que se confirmen |

**Regla operativa:** antes de cada paso de §4, `git status -sb` y `git log -5` sobre los archivos
del paso; si alguno tiene cambios ajenos sin confirmar, se espera o se coordina (memoria
«Árbol compartido: siempre main» e «Índice de git compartido»).

---

## 2. Lógicas a preservar y su prueba de caracterización

El repo corre jest en `node` sin testing-library: las pruebas cubren **módulos puros** (se extraen
de los componentes antes de tocar la UI, sin cambiar comportamiento) y **guardarraíles de fuente**
(como `cajasCierreYApertura.test.ts`). Las RPC se caracterizan con transacciones que se deshacen
(`DO … RAISE`) por el MCP, registradas en el propio archivo de prueba como comentario con su
resultado.

### 2.1 Cajas — `src/__tests__/pos/cajasCaracterizacion.test.ts` (nuevo)

| # | Lógica que no se puede perder | Hoy vive en | Prueba (se escribe ANTES de tocar la UI) |
|---|---|---|---|
| K1 | Quién puede cerrar: quien abrió, o con permiso de cerrar ajenas; solo cajas abiertas | `reglasCierre.puedeCerrarCaja` | ya cubierta (`historialCajas.test.ts:157`); se añade: el detalle y el listado importan la misma función (guardarraíl de fuente) |
| K2 | `showExpected = !ciego \|\| verEsperadoEnCierreCiego`; en ciego se ocultan esperado, final y diferencia en listado, detalle, arqueo, cierre, CSV y reporte | `useBlindCloseMode` + 7 consumidores | extraer `visibilidadImportes(ciego, permisos)` a `src/lib/pos/cajas/cierreCiego.ts` y `enmascararResumen(resumen, visible)`; tabla de verdad 2×2 y que el CSV y el reporte usan la misma máscara |
| K3 | Modo `branch` vs `user`: qué es «mi caja», qué alcance se ofrece al abrir, qué pagos cuentan | `CS.findActiveSessionRemote`, `AperturaCajaDialog`, SQL | extraer `alcanceApertura(modo, sucursal)` y `claveAlcance(modo, sucursal, usuario)` (espejo de `fn_cash_session_open_scope_key`); prueba de igualdad con los formatos `b:{id|g}` / `u:{id|g}:{uuid}` |
| K4 | Errores de apertura: 23505 → `caja_global_abierta` / `caja_propia_abierta` / `caja_sucursal_abierta` | `CS:592`, `claveErrorCaja` | tabla código → clave i18n; cada clave existe en los 4 `messages/*.json` |
| K5 | Denominaciones: total contado = Σ cantidad × valor; `Limpiar todo` vacía billetes, monedas y métodos | `NuevoArqueoPage.tsx:120-138, 190-194` | extraer `totalDenominaciones(conteo, denominaciones)` y `denominacionesDe(moneda)` (COP hoy; lista por moneda después, §5.3 D10) |
| K6 | El arqueo manda solo lo contado; cash fuera del mapa por método; redondeo a centavos | `lib/pos/cajas/arqueo.ts` | ya cubierta (`cajasArqueo.test.ts`); se añade la diferencia por método que pinta la pantalla = `method_breakdown` del servidor (función `diferenciasPorMetodo(esperado.por_metodo, contado)`) |
| K7 | Resultado del cierre: ±0,5 de tolerancia = «cuadra»; sobrante / faltante | `historialCajas.resultadoDiferencia` | ya cubierta |
| K8 | Cierre: con red siempre por la ruta, sin `difference`; sin red al outbox | `CS.closeSession` | ya cubierta (`cajasCierreYApertura.test.ts`); se añade que el diálogo nuevo no llama a `from('cash_sessions').update` |
| K9 | Esperado del navegador = esperado del servidor | `CS.getCashSummary` vs `pos_caja_esperado` | **caracterización SQL**: en una transacción que se deshace, para 3 sesiones cerradas (una de cada modo y una con pagos no efectivo) comparar `pos_caja_esperado` con el cálculo de `getCashSummary` hecho en SQL con la misma ventana; anotar resultado. Después de esto la UI **deja de usar** `getCashSummary` con red |
| K10 | Movimiento: tipo `in`/`out`, importe > 0, concepto obligatorio, «Otro…» con texto libre, sesión abierta | `MovimientosDialog`, `NuevoMovimientoPage` | extraer `validarMovimiento(datos)` y el **catálogo único** `conceptosMovimiento` (`src/lib/pos/cajas/conceptos.ts`); prueba de que las dos pantallas lo importan y de que se guarda la **clave**, no el texto traducido (hoy se guarda el español o el traducido según la pantalla) |
| K11 | Historial: filtros, rango con `toInstant`/`addPlainDays` (hasta exclusivo), orden, CSV | `HistorialTab`, `historialCajas` | ya cubierta; no se toca |
| K12 | Sin red (Desktop): apertura, movimiento y cierre al outbox; badge «pendiente de sincronizar» | `cashOutbox`, `cashSync` | ya cubierta (`cashOutbox.test.ts`, `cashSync.test.ts`); guardarraíl: los componentes nuevos siguen llamando a `CS.openSession/addMovement/closeSession` (no a Supabase directo) |
| K13 | Fechas en la zona de la organización | `useFormatDate`, `formatDateTimeInTz` | guardarraíl: ningún archivo de `components/pos/cajas/**` contiene `toLocaleString`, `toISOString().split`, `createPortal`, `window.open` ni `document.write` (se activa al terminar cada paso) |

### 2.2 Ventas — `src/__tests__/pos/ventasCaracterizacion.test.ts` (nuevo)

| # | Lógica que no se puede perder | Hoy vive en | Prueba |
|---|---|---|---|
| V-a | Rango de fechas en la zona de la organización (`getDateRange(inicio, fin, tz, operatingHours)`) | `VS:30` | prueba con `TZ=UTC` y `TZ=America/Bogota` (`npm run test:tz-all`) de que un día elegido produce el mismo intervalo |
| V-b | Filtros: origen, estado, estado de pago, cliente, sucursal del header | `VS:42-85` | extraer `filtrosVentas(url) → consulta` con lista blanca (como `useListadoServidor`); la búsqueda se **escapa** antes de `.or()` (hoy se interpola, V10) |
| V-c | Estado visible de una venta: `status` + `payment_status` + devoluciones + pendiente de sincronizar → **un** badge | `VentasTable`, `VentaDetalle` (mapas distintos) | extraer `estadoVenta(venta)` a `src/lib/pos/ventas/estadoVenta.ts`; tabla con los valores reales del CHECK (`draft/paid/partial/pending/void` × `pending/paid/partial/refunded`); «Completada» no existe |
| V-d | Número visible: factura vigente (no NC) → `invoice_sales.number`; si no, «Sin número»; pedido web → `order_number` | `VentasTable`, `VentaDetalle.tsx:297` | extraer `numeroVenta(documentos)`; caso con 2 documentos (factura + NC) — hoy `.maybeSingle()` falla (V3) |
| V-e | Pagos de la venta: `payments` con `source='invoice_sales'` y `source_id` = factura, **más** los heredados `source='sale'` | `VS:220-224` (solo `sale`) | extraer `pagosDeVenta(pagos, factura)`; casos: pago POS, abono de CxC, pago heredado |
| V-f | Anular: solo `pos`/`invoice`, no pedidos web; motivo obligatorio; nunca `update sales set status` desde el navegador | `VS:634-678`, `VentasPage:71-84` | guardarraíl de fuente: sin `.update({ status: 'void'` en `components/pos/ventas/**` (se activa cuando exista la RPC ajena) |
| V-g | Duplicar: cantidades, modificadores, precio vigente, descuento | `VS:681-700` | extraer `lineasDuplicadas(venta)` usando `src/lib/pos/precioVigente.ts` (nuevo del agente del POS); hoy fuerza cantidad 1 (V14) |
| V-h | Reimprimir en caja: `PrintJobsService.enqueueSaleTicket(sale.branch_id, …)`; imprimir con la sucursal **de la venta** | `VentaDetalle.tsx:145`, `printService.ts:154` | prueba de que el payload usa `sale.branch_id` |
| V-i | Nueva venta usa `CheckoutDialog` → `POSService.checkout` → `pos_checkout_v1` | `NuevaVentaPage.tsx:437` | guardarraíl: ningún archivo de ventas inserta en `sales`/`sale_items`/`payments` |

---

## 3. Mapa diseño → código

Referencias de Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`, página `05 POS y
ventas`). Donde el id no está documentado se deja la sección y la captura; **no se consultó el MCP
de Figma** (cupo agotado).

### 3.1 Cajas

Secciones: listado `351:48911` (+ pestañas `680:404392`), detalle `355:53496`, arqueo y movimiento
`359:57133`. Frames por abreviatura en `PARIDAD-PERFIL-CAJAS.md` («Dónde vive cada cosa»).

| Frame / node id | Captura | Pantalla | Componentes (kit existente · **nuevo**) | Sustituye a |
|---|---|---|---|---|
| `CL-Listo`, `680:404395`, `680:407222` | `18-cajas-01-listado.png` | Listado | ya hecho: `PageHeader`, `KpiStrip`, `SegmentedControl`, `DataTable`, `DateRangeButton`, `AccionRapida` | — (hecho en `f6c378d3`) |
| `CL-Ciego` `351:51124` | `18-cajas-02-listado-cierre-ciego.png` | Aviso «Cierre ciego» + «Ver mis movimientos»; «Oculto» en KPIs y celdas | hecho (`Oculto`); falta la **acción** «Ver mis movimientos» → detalle propio | el candado que bloquea el detalle |
| `CL-Otro` | `18-cajas-03-listado-caja-de-otro.png` | «Esta caja la abrió …» + «Ver detalle» + «Avisar a …» | `EmptyState` compacto o **`Aviso`** (banda con acciones) | botón gris con tooltip |
| `CLM-*` `352:52834` | `18-cajas-04-listado-movil.png` | móvil | hecho (`ListCard`) | — |
| `CD-Resumen` `355:53499` | `18-cajas-06-detalle-resumen.png` | Detalle: cabecera, 4 KPIs, pestañas con contador, «Información de la sesión», «Desglose de caja», «Pagos por método» | `PageHeader variante="detail"` + `BranchBadge` + `KpiStrip`/`StatCard` + `TabBar` + **`Tarjeta`** + **`FilaDato`** | `CajaDetallePage` (shadcn), `CashSummaryCard` |
| `CD-Movs`, `CD-Arq`, `CD-Ventas` | `18-cajas-07-detalle-movimientos.png` | pestañas con tablas paginadas | `DataTable` + `Pagination compact` + `StatusBadge` | tablas shadcn sin paginar, `MovimientosList` |
| `CD-Ciego` | — | KPIs «Oculto» + aviso con salida | `StatCard` (valor «Oculto») | avisos morados |
| `CD-Carg` · `CD-NoExiste` · `CD-Error` | — | estados | `Skeleton`, `EmptyState` | `PageSkeletons`, texto rojo suelto |
| `CA-Arqueo` `359:57136` · `CA-ArqCiego` · `CA-ArqCerrada` · `CAM-Arqueo` `360:144952` | `18-cajas-09-arqueo.png`, `18-cajas-11-arqueo-movil.png` | Nuevo arqueo: tipo, billetes, monedas, otros métodos, resumen pegajoso, notas obligatorias con diferencia | `PageHeader variante="form"` + `SegmentedControl` + **`ConteoEfectivo`** + **`ConteoPorMetodo`** + `CampoNumero` + `FormSection` + **`ResumenArqueo`** (usa `FilaDato`) + `ConfirmDialog` (`C-ArqueoDif` `360:145358`) | `NuevoArqueoPage` |
| P-K (pendiente de Figma) | — | **arqueo por método** (método · esperado · contado · diferencia) | `ConteoPorMetodo` con columna diferencia | la diferencia única que mezcla métodos |
| `CA-Mov` `359:59059` · `CAM-Mov` `360:145137` · `D-Movimiento` `360:145278` | `18-cajas-10-movimiento.png` | Nuevo movimiento + diálogo | **`MovimientoCajaForm`** (una sola pieza para página y diálogo) + **`EfectoEnCaja`** + `CampoNumero` con la moneda | `NuevoMovimientoPage`, `MovimientosDialog` |
| `I-Apertura` · `I-AperturaUser` | `10-pos-cabecera-caja.png` | Diálogo de apertura (modo sucursal / cajero) | `Dialogo` (kit) + `SegmentedControl` alcance + `CampoNumero` + `FormField` | `AperturaCajaDialog` (`createPortal`) |
| `I-Cierre` · `I-CierreCiego` | `10-pos-cierre-caja.png` | Arqueo y cierre | `PanelAdaptable` (hoja en móvil) + `ConteoPorMetodo` + `ResumenArqueo` + lista de movimientos | `CierreCajaDialog` (`createPortal`, disparador duplicado) |
| botón «Reporte» (Nuevo) | `18-cajas-06` | Reporte con menú carta / 80 mm, también en el detalle | `RowActionsMenu etiquetaBoton` | `ReportGenerator` (tarjeta en Mi caja) |
| «Reabrir» (en `18-cajas-06`) | — | — | **sin backend** → decisión D7 | — |

### 3.2 Ventas

Secciones 11 (listado), 12 (detalle) y 13 (nueva) de `PARIDAD-VENTAS.md`; frames `329:36071`
(listado E), `331:54670` (móvil), `329:111220` (filtros), `329:111876` (selección), `329:112636`
(menú), `331:54986` (anular), `332:40219` (detalle POS), `333:40636`/`333:41394`/`333:42129`
(web, mesa, anulada), `333:42840`/`333:43573`/`333:44288` (sin sincronizar, cargando, no
encontrada), `334:95699` (detalle móvil), `334:129852`/`334:130539`/`334:123631`/`334:124281`
(nueva). Componentes del dominio: sección `680:406327` de `02 Componentes`.

| Frame / node id | Captura | Pantalla | Componentes (kit existente · **nuevo**) | Sustituye a |
|---|---|---|---|---|
| `329:36071` | `16-ventas-listado-escritorio.png` | Listado: `PageHeader` (Actualizar, Exportar, Nueva venta, ⋯), 4 KPIs, buscador + Filtros + chips, tabla (fecha, N.º, origen, cliente, sucursal, cajero, método, total, estado), paginación | `PageHeader`, `KpiStrip`, `ListToolbar`, `SearchInput`, `FilterPanel`, `FilterChips`, `DateRangeButton`, `DataTable` (casillas), `StatusBadge` (estados de venta), `Badge` (origen), `Pagination`, `useListadoServidor` | `VentasPage`, `VentasTable`, `VentasFilters`, `DataTablePagination` |
| `329:111220` | `16-ventas-listado-filtros.png` | Filtros: origen, estado, pago, cliente, cajero, método, rango de importe, 3 casillas | `FilterPanel` + `FormField` + `SegmentedControl` + `MultiSelect` + `CampoNumero` + `Checkbox` + **`CustomerPicker`** (§3.3) | `VentasFilters` |
| `329:111876` | — | Selección + `BulkActionBar` (Imprimir, Exportar, Enviar) | `BulkActionBar` | — |
| `329:112636` (menú `833:91863…`) | — | ⋯ por fila (Ver, Ver factura, Registrar cobro, Crear devolución, Imprimir, Reimprimir en caja, Enviar, Duplicar, divisor, Anular) | `RowActionsMenu` / `ActionSheet` | menú propio de `VentasTable:299` |
| `331:54986` + P-V1 (pendiente) | — | Anular venta: motivo obligatorio y **qué se revierte** | **`DialogoMotivo`** (sobre `Dialogo`) | `confirm()`/`prompt()`/`alert()` |
| `331:54670` | `16-ventas-listado-movil.png` | móvil: franja de KPI + tarjetas | **`KpiCompacto`** + `ListCard` | — |
| `332:40219` + P-V2 (pendiente) | `16-ventas-detalle-escritorio.png` | Detalle: cabecera con N.º de factura, badges, barra de 3 acciones + ⋯, **cadena del documento**, tarjetas Productos, Pagos aplicados, Historial, Notas / Cliente, Resumen, Comisión, Factura, Cuenta por cobrar, Asiento, **Devoluciones y NC** | `PageHeader variante="detail"` + **`CadenaDocumento`** + **`Tarjeta`** + **`FilaDato`** + `DataTable` compacta + `AvatarIniciales` + `RelatedLinkCard` | `VentaDetalle` (869 líneas) |
| `333:42129` | — | anulada con NC | `Tarjeta` tono peligro + `CadenaDocumento` | aviso inexistente |
| `333:42840` | — | pendiente de sincronizar | `StatusBadge` + acciones deshabilitadas con `motivo` | — |
| `334:129852` · `334:130539` · `334:123631` · `334:124281` | `16-ventas-nueva-escritorio.png` | Nueva venta = **pantalla del POS v2** (buscador, `ViewToggle`, carrito, cobro) | los componentes del POS principal (zona de otro agente) | `NuevaVentaPage` (carrito propio: segunda implementación) → decisión D3 |

### 3.3 Componentes compartidos: se construyen UNA vez

Van al kit (`src/components/kit/`, exportados en `index.ts`, documentados en `KIT-CODIGO.md`, con
textos por `useKitT` o por props) o a `src/components/shared/` cuando dependen del dominio. Cada
uno con su prueba de lógica en `kit/__tests__/`.

| Componente | Figma | Dónde | Lo usan (este plan) | Lo usarán después | Notas |
|---|---|---|---|---|---|
| `Tarjeta` | `680:406329` | kit | detalle de caja (3), detalle de venta (11) | detalle de factura, CxC, CxP, devolución, proveedor (hoy tiene una privada en `ProveedorDetalle.tsx:129` y `PreciosCostos.tsx:334`: se sustituyen) | icono, título, acción, contenido |
| `FilaDato` (6 tonos) | `680:406357` | kit | desglose de caja, resumen de arqueo, resumen de venta | facturas, CxC, tesorería | etiqueta–valor, importe tabular, `oculto` para cierre ciego |
| `KpiCompacto` | `680:406370` | kit | ventas móvil | CxC móvil, pedidos | |
| `CadenaDocumento` + `EslabonDocumento` | `680:409052`, `680:408881` | `shared/documentos/` | detalle de venta | devolución, CxC, pedido web, factura, movimiento de tesorería | datos de un solo route handler (`GET /api/pos/ventas/[id]`, §4) |
| `ChipDocumento` (7 tipos) | `680:406423` | `shared/documentos/` | columna «Documentos» del listado de ventas | CxC, devoluciones | |
| Estados de venta en `StatusBadge` | `680:406510` (`BadgeEstadoVenta`) | `kit/estadoTono.ts` + `messages/*/kit.estados` | listado y detalle de ventas | facturas, CxC | añadir «Devuelta», «Devuelta parcial», «Pendiente de pago», `cash`/`card`… **primero en `SISTEMA-BADGES.md`** (regla del archivo) |
| `DialogoMotivo` | `331:54986` | kit (sobre `Dialogo`) | anular venta, cerrar caja ajena | anular devolución, anular movimiento, anular factura | motivo obligatorio, lista «qué se revierte», bloqueo con motivo |
| `ConteoEfectivo` (billetes + monedas) | `359:57136` | `pos/cajas/conteo/` | nuevo arqueo, cierre | Tesorería «Cerrar con arqueo» | denominaciones por moneda (`denominacionesDe`) |
| `ConteoPorMetodo` | `359:57810` + P-K | `pos/cajas/conteo/` | arqueo, cierre | — | esperado (u «Oculto»), contado, diferencia |
| `ResumenArqueo` | `359:58439` | `pos/cajas/conteo/` | arqueo, cierre | — | usa `FilaDato` |
| `MovimientoCajaForm` + `EfectoEnCaja` | `359:59059`, `360:145278` | `pos/cajas/movimientos/` | página y diálogo de movimiento | Finanzas Ingresos/Egresos (`MovimientoForm Tipo=ingreso/egreso` de Tesorería) | catálogo único de conceptos |
| `CustomerPicker` | `849:558484…` | `shared/` | filtro «Cliente» de ventas | CxC, facturas, POS | hoy hay 3 selectores (`pos/CustomerSelector.tsx`, `pos/customer-selector.tsx`, `ClienteSelector.tsx`); este plan **solo** lo necesita como filtro: si el agente del POS no lo ha unificado, se usa `SearchSelect` con búsqueda en servidor y se deja la unificación anotada |
| `RegistrarPagoDialog` | `20-facturas-dialogo-pago.png`, `413:13096` | `shared/pagos/` | «Registrar cobro» en venta con saldo | factura, CxC, CxP, ficha del cliente | **depende de `fn_registrar_pago`** (no existe): mientras tanto, la acción enlaza a la CxC de la venta |
| Motor de documentos (`documents/`) | `DOCUMENTOS-PDF.md` §5, `21-documento-*.png` | `src/lib/documents/` (payload en servidor) + `print-agent/src/printing` (80 mm) | **reporte de cierre y de arqueo** (carta y 80 mm) | factura, NC, recibo, OC | se empieza por el tipo `cash_session_report`; el de factura queda a su dueño |
| `CuentaDineroCard Tipo=caja` | `FINANZAS-TESORERIA-FIGMA.md` §3 | `shared/tesoreria/` | — (solo contrato de datos, §4 paso 17) | Tesorería | el plan deja la función de lectura; la tarjeta la construye quien haga Tesorería |

**No se crean:** `ViewToggle` (solo lo pide Nueva venta, que usa la pantalla del POS), `SortMenu`.

---

## 4. Plan por pasos

Cada paso: rama `main` (memoria «Commits directo en main»), un commit por paso
`feat(GO-<id>): …`, **verificación**: `npx jest`, `npx tsc --noEmit -p tsconfig.json` (con más
heap: memoria «Compilación TS»), `npx next build`, `npm run test:tz-all` cuando haya fechas, y
**navegador** (servidor de desarrollo por `.claude/launch.json`, organización de pruebas, escritorio
1440, tableta 1024 y móvil 390, y los dos modos de caja y cierre ciego activado y desactivado).
**i18n**: toda clave nueva en `es`, `en`, `fr` y `pt` a la vez (`traduccionesModulos.test.ts`),
en `cajas.*` para cajas y en un namespace nuevo **`posVentas`** para ventas (convención `posX` de
las subfunciones del POS). Los componentes del kit toman sus textos de `kit.*`.

### Fase A — Red de seguridad (sin cambios visibles)

**Paso 1. Caracterización de cajas.** Extraer sin cambiar comportamiento
`src/lib/pos/cajas/cierreCiego.ts` (K2), `alcance.ts` (K3), `denominaciones.ts` (K5),
`conceptos.ts` (K10, con **ambos catálogos actuales** como mapa de compatibilidad) y
`diferenciasPorMetodo` en `arqueo.ts` (K6); escribir `cajasCaracterizacion.test.ts`. Correr la
caracterización SQL K9 y anotarla. *Verificación:* suite verde; las pantallas se ven idénticas.

**Paso 2. Caracterización de ventas.** Extraer `src/lib/pos/ventas/{estadoVenta,numeroVenta,
pagosDeVenta,filtrosVentas,lineasDuplicadas}.ts` y `ventasCaracterizacion.test.ts` (V-a…V-i).
Los componentes viejos pasan a importar esas funciones (mismo resultado). *Verificación:* jest,
`test:tz-all`, listado y detalle idénticos.

### Fase B — Kit (una vez, para todos)

**Paso 3. `Tarjeta`, `FilaDato`, `KpiCompacto`, `DialogoMotivo`.** Archivos en `kit/`, export en
`index.ts`, sección en `KIT-CODIGO.md`, claves `kit.*` en 4 idiomas, pruebas de lógica. Sustituir
las dos `Tarjeta` privadas (`ProveedorDetalle.tsx:129`, `PreciosCostos.tsx:334`) **solo si** su
agente no las está tocando. *Verificación:* proveedores y producto se ven igual.

**Paso 4. Estados de venta.** `SISTEMA-BADGES.md` primero, luego `estadoTono.ts` y
`kit.estados` (4 idiomas). *Verificación:* `kitLogica.test.ts` + los badges existentes no cambian.

**Paso 5. `CadenaDocumento`, `EslabonDocumento`, `ChipDocumento`** en
`src/components/shared/documentos/` con su tipo de datos `EslabonDatos` (tipo, número, estado,
href, acción). Sin consumidores todavía. *Verificación:* jest + build.

### Fase C — Cajas (no depende de agentes en curso, salvo coordinación de los diálogos)

**Paso 6. Lectura del resumen desde el servidor.** Route handler
`GET /api/pos/cajas/[id]/resumen` (`getServerOrgContext`): llama a `pos_caja_esperado`, lee
movimientos, arqueos y ventas del turno, resuelve permisos y **enmascara en el servidor** si hay
cierre ciego y el usuario no puede ver el esperado (D8). `CS.getCashSummary` queda solo para el
modo sin red. *Verificación:* K9 igualdad; con cierre ciego la respuesta no trae esperado ni
diferencia (probar con la pestaña de red del navegador).

**Paso 7. Conteo compartido.** `pos/cajas/conteo/{ConteoEfectivo,ConteoPorMetodo,ResumenArqueo}`
sobre `CampoNumero`, `FormSection`, `FilaDato`; denominaciones de `denominacionesDe(moneda)`.
*Verificación:* jest (K5, K6).

**Paso 8. Nuevo arqueo en el kit** (`arqueos/NuevoArqueoPage.tsx`): `PageHeader form` con migas
«Punto de venta › Cajas › Sesión #n», `SegmentedControl` de tipo con la ayuda «un arqueo de tipo
Cierre no cierra la caja», conteo compartido, notas **obligatorias con diferencia**,
`ConfirmDialog` al guardar con diferencia; guarda por `CS.createCashCountByUuid` (RPC). Estados:
cargando, sesión cerrada (`EmptyState forbidden` con dos salidas), no encontrada. Textos en
`cajas.arqueo.*`. *Navegador:* guardar un arqueo en cada modo; ver la fila en la BD con
`method_breakdown`; en cierre ciego no aparece el esperado.

**Paso 9. Movimiento único.** `MovimientoCajaForm` + `EfectoEnCaja` (esperado ahora → después, del
paso 6); `NuevoMovimientoPage` y `MovimientosDialog` pasan a ser dos envolturas del mismo
formulario; catálogo único guardando la **clave** del concepto y mostrándola traducida (los
movimientos viejos con texto libre se muestran tal cual); `CampoNumero` con la moneda.
*Navegador:* ingreso y egreso desde el detalle y desde «Mi caja»; asiento generado
(`trg_auto_journal_cash_movement`).

**Paso 10. Detalle de caja en el kit** (`detalle/CajaDetallePage.tsx`): `PageHeader detail` (badge
de estado, `BranchBadge`, «Abrió / Cerró»), `KpiStrip` (inicial, ventas en efectivo, esperado,
diferencia; «Oculto» en ciego), `TabBar` con contadores, pestaña Resumen con 3 `Tarjeta`
(información, desglose con `detalle` del servidor, pagos por método), pestañas Movimientos,
Arqueos (con **columna por método** desde `method_breakdown` y «Contó») y Ventas (enlace a la
venta) con `DataTable` + `Pagination compact`; **un solo** «Cerrar caja» condicionado a
`puedeCerrarCaja`. Arregla: «Pagos por método» de una caja global vacío (el filtro
`branch_id = null` de la auditoría; hoy `CS.getSessionPaymentsByMethod`, `:1601`, se reemplaza por
`por_metodo` de `pos_caja_esperado`) y `closed_by_name` sin rellenar. *Navegador:*
caja propia abierta, ajena abierta (sin botón; con permiso sí), cerrada, ciego.

**Paso 11. Diálogos de apertura y cierre** (**coordinar con el agente del POS principal**:
`/app/pos/page.tsx` los usa). Apertura sobre `Dialogo`; cierre sobre `PanelAdaptable` con
`ConteoPorMetodo` + `ResumenArqueo`; se quita el disparador propio del cierre (la cabecera del POS
pasa a pintar su botón). **Backend (D6):** el cierre registra además un arqueo `closing` con el
conteo por método en la misma transacción (RPC `pos_caja_cerrar` o la ruta llamando a
`pos_caja_registrar_arqueo` antes del `update`; recomendación: RPC). *Navegador:* abrir y cerrar
desde el POS, desde «Mi caja» y desde el detalle, con red y sin red (Desktop).

**Paso 12. «Mi caja»**: sustituir `CashSummaryCard`, `MovimientosList` y `ReportGenerator` por las
piezas del detalle (KPIs, desglose, movimientos); borrar `SessionsPagination.tsx` (muerto) y, al
final, `CashSummaryCard`/`MovimientosList` si ya no tienen importadores. Estado «caja de otro»
(`CL-Otro`) con acciones. *Navegador:* las tres pestañas.

**Paso 13. Reporte de cierre y de arqueo (PDF).**
- `src/lib/documents/cajas/reporteCaja.ts`: payload **armado en el servidor** desde el resumen del
  paso 6 (misma máscara de cierre ciego), `buildCashSessionReportHTML(payload, 'letter' |
  'thermal_80')` con datos escapados, fechas con `formatDateInTz`, moneda con el formateador de la
  organización, textos de `messages/*` (`cajas.reporte.*`).
- `GET /api/pos/cajas/[id]/reporte?formato=carta|80mm` → carta: PDF con el mismo render que la
  factura (puppeteer); 80 mm: HTML para `printWhenReady` en navegador **y** nuevo tipo
  `cash_session_report` en `print-agent/src/printing` + `PrintJobsService` para el Desktop.
- Contenido: sesión (cajero que abrió y que cerró, sucursal o «todas», modo), desglose del
  esperado, pagos por método, arqueos (con método), movimientos, ventas del turno (conteo y total),
  contado, diferencia, observaciones, firmas cajero / supervisor (`verified_by`, decisión D11).
- Botón «Reporte ▾» (`RowActionsMenu etiquetaBoton`) en el detalle y en «Mi caja»; también
  «Imprimir comprobante» en cada fila de arqueo.
- Añadir los generadores a la lista del guardarraíl §28. *Verificación:* PDF descargado en carta,
  impresión 80 mm en navegador y en Desktop (cola `print_jobs`), cierre ciego sin cifras ocultas.

### Fase D — Ventas

**Paso 14. Lectura en el servidor.** `GET /api/pos/ventas` (listado paginado en el servidor:
búsqueda por número de factura, cliente o documento, filtros de §3.2, orden, KPIs con la regla
D2, exportación) y `GET /api/pos/ventas/[id]` (venta + líneas + documentos + pagos + cartera +
devoluciones + asiento en **una** respuesta; arregla V2, V3, V5, V11). Recomendación: RPC de
lectura `pos_venta_con_documentos(p_sale_id)` y `pos_ventas_listado(...)` con
`fn_assert_acceso_org`, `revoke … from anon`. *Verificación:* organización con 1.250 ventas sin
truncar; `EXPLAIN` < 50 ms; índices de `POS-VENTAS-…` §7.8 si hacen falta (`get_advisors`).

**Paso 15. Listado de ventas en el kit** (`ventas/VentasPage.tsx` y compañía): §3.2 fila 1–6;
`useListadoServidor`; columna «Documentos» con `ChipDocumento`; `BulkActionBar` (Imprimir,
Exportar CSV/XLSX, Enviar); menú ⋯ con acciones deshabilitadas **con motivo** (anular en pedido web,
devolver sin cantidad disponible); estados listo, cargando, vacío, sin resultados, error, sin
permiso, sin sucursal; móvil con `KpiCompacto` y `ListCard`; textos `posVentas.listado.*`.
*Navegador:* filtros en la URL, «atrás», exportación, móvil.

**Paso 16. Detalle de venta en el kit** (`VentaDetalle.tsx` se parte en tarjetas en
`ventas/detalle/`): cadena del documento, las 11 tarjetas, barra de 3 acciones + ⋯ (arregla V15),
«Ver la cuenta por cobrar» al registro, «Ver el asiento» al asiento, vencimiento con
`formatDateInTz` (V12). «Crear devolución» abre el diálogo del agente de devoluciones con
`sale_id` (arregla V4); como `procesar_devolucion` solo acepta ventas `paid`, en las demás la
acción queda deshabilitada **con motivo** («La venta tiene saldo pendiente»), no oculta. *Navegador:* venta POS pagada, a crédito, con NC, web, mesa con propina,
pendiente de sincronizar.

**Paso 17. Anular y cobrar** — **bloqueado por** la RPC de anulación del agente de cobro y por
`fn_registrar_pago`. `DialogoMotivo` con la lista de lo que la RPC revierte (que la RPC devuelva un
«plan» en modo simulación sería ideal: se pide al agente) → route handler
`POST /api/pos/ventas/[id]/anular` con el mismo patrón que `POST /api/pos/mesas/[id]/liberar`
(`getServerOrgContext`, permiso `pos.void` en el servidor, 403 registrado) → RPC. «Registrar cobro» → `RegistrarPagoDialog`. Hasta entonces: «Anular» sigue llamando al
camino actual con el diálogo nuevo (motivo obligatorio) y «Registrar cobro» enlaza a la CxC.

**Paso 18. Nueva venta, exportaciones y limpieza.** Según D3: `/app/pos/ventas/nuevo` monta la
pantalla del POS (o redirige a `/app/pos?duplicar={id}`) y se borra el carrito propio de
`NuevaVentaPage`; «Duplicar» usa `lineasDuplicadas`. Guardarraíles de §2 activados. Cajas como
cuentas de dinero: función de lectura `cajasComoCuentasDeDinero(org)` (sesiones abiertas por
alcance según el modo, esperado del servidor) documentada para Tesorería. Actualizar
`KIT-CODIGO.md` y anexar a `PROGRESS.md`.

### Orden y dependencias

```
1 ─┬─ 3 ─ 4 ─ 5 ───────────────── 14 ─ 15 ─ 16 ─ 17* ─ 18
2 ─┘   └─ 6 ─ 7 ─ 8 ─ 9 ─ 10 ─ 11† ─ 12 ─ 13
* bloqueado por el agente de cobro   † coordinar con el agente del POS principal
```

Cajas (6–13) y Ventas (14–16) pueden ir en paralelo después de la fase B.

---

## 5. Riesgos, huecos del diseño y decisiones

### 5.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Esperado por ventana de tiempo**: `payments` sin `cash_session_id`; una caja global y una de sucursal abiertas a la vez cuentan los mismos pagos; los pagos web en efectivo de la sucursal entran al esperado de la caja (`pos_caja_esperado` no mira `include_in_cash_register`) | D5: `payments.cash_session_id` (K-3) escrito por `pos_checkout_v1` y `procesar_devolucion`; mientras tanto, el reporte dice «pagos entre apertura y cierre» |
| R2 | **Cierre ciego legible**: `pos_caja_esperado` y `pos_caja_registrar_arqueo` devuelven esperado y diferencia a cualquier miembro | D8: máscara en el servidor (paso 6) y RPC que no devuelvan esos campos sin permiso |
| R3 | **RLS de `cash_sessions` sin guarda de autoría**: un `UPDATE` directo cierra o reescribe una caja ajena saltándose la ruta | Migración: política de `UPDATE` que solo permita cambios de estado por RPC/ruta (o `WITH CHECK` de autoría + permiso) |
| R4 | `pos_caja_registrar_arqueo` no exige sesión abierta | Validación en la RPC (junto con D6) |
| R5 | El cierre guarda solo efectivo: el conteo por método se pierde y la «diferencia total» del diálogo no es la guardada | D6 |
| R6 | Los diálogos de caja los comparte la pantalla del POS | Paso 11 coordinado; misma API de props |
| R7 | Cambios sin confirmar de otros agentes en 9 archivos de cajas y en devoluciones (índice raro) | Regla operativa de §1.9 |
| R8 | Tres lecturas más de cajas con reglas propias (Finanzas dashboard, reportes financieros, reportes POS) seguirán dando otras cifras | Fuera de alcance; tarea aparte para que lean `pos_caja_esperado` |
| R9 | `movimientosService` (Finanzas) sigue escribiendo en «la última caja abierta de la organización» | El `MovimientoCajaForm` queda listo para sustituirlo; tarea aparte |
| R10 | Sin red: `cashSync.replayClose` aún escribe la diferencia local | Tarea del agente de Desktop; el diálogo nuevo no cambia el outbox |
| R11 | El listado de ventas hoy incluye 4.780 pedidos web expirados como «ventas» | D1 |
| R12 | Rendimiento: `CajasPage` hace un `getCashSummary` por caja abierta (N+1) | El paso 6 permite un resumen por lote (`pos_caja_esperado` en un `select` por ids) |

### 5.2 Huecos del diseño (lo que Figma promete y no tiene respaldo, o falta)

| Hueco | Dónde | Propuesta |
|---|---|---|
| Botón **«Reabrir»** en caja cerrada | `18-cajas-06` | D7: no se implementa sin RPC, permiso y contra-asiento |
| **«Avisar a Ana Ríos»** | `CL-Otro` | Notificación in-app por `notifications` desde una ruta con sesión; si no, se omite (D12) |
| **Arqueo por método** sin frame | P-K pendiente | Se construye con `ConteoPorMetodo` según la captura `10-pos-cierre-caja.png` (ya tiene esperado/contado/diferencia por método) |
| KPIs del listado de ventas con «ventas del periodo» por fecha de venta | `329:36071` | D2 (criterio de caja, V.9c) |
| Estado **«Completada»** y «Pendiente» amarillo en ventas | `16-ventas-*` | No existe en la BD: se pinta con los estados reales (`estadoVenta`) |
| Fila **«P-0002144 Web»** en el listado | `16-ventas-listado` | D1 |
| Cabecera móvil de ventas con «⋮» | `16-ventas-listado-movil` | Coherencia (§4.2 de `AUDITORIA-COHERENCIA-FIGMA`): «+» Nueva venta; export en el ⋯ de la hoja |
| «Número de soporte» del movimiento (Nuevo) | `18-cajas-10` | `cash_movements` no tiene columna: se guarda en `notes` o columna aditiva `reference text NULL` (D13) |
| «Movimientos del turno: 5 ingresos · 2 egresos» en KPIs del listado | `18-cajas-01` | Existe en código (`CajasPage`); sin cambio |
| Reporte de caja **no dibujado** en `09 Documentos` | — | Se construye con los bloques del motor (cabecera, `Doc/Campo`, tabla, firmas) y se captura para Figma después |
| **Crear devolución desde la venta** | `874:578120` | Lo implementa el agente de devoluciones; el detalle solo lo abre |
| Estados «sin permiso» de cajas (E) y «cargando» (M); «cargando/vacío» de ventas (M) | P-K, P-V2 | Se construyen con `EmptyState`/`Skeleton` sin frame (receta de Proveedores) |
| «Depósito bancario» / «Retiro para depósito» como concepto | `18-cajas-10` | Tesorería decidió que es un **traslado**; D9 |

### 5.3 Decisiones del dueño

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| **D1** | ¿Qué filas lista «Ventas»? | (a) como hoy: `sales` (sin `web`) + **todos** los `web_orders`, incluidos 4.780 expirados; (b) solo `sales` (todas las fuentes, las web con su venta) | **(b)**: una venta es lo que existe en `sales`; los pedidos sin venta viven en Pedidos online. Filtro «Origen» con POS · Mesa · Web · Factura |
| **D2** | KPIs del listado | (a) ventas por fecha de venta; (b) **criterio de caja** de V.9c (lo cobrado por `payment_date`, menos reintegros) | **(b)** con la misma función que el Inicio (`fn_inicio_ventas_rango`, aún no creada) para que nunca den cifras distintas; «Facturado del periodo» como detalle de la tarjeta |
| **D3** | Nueva venta | (a) página propia con carrito propio (hoy, segunda implementación); (b) montar la pantalla del POS / redirigir con `?duplicar=` | **(b)** (regla dura 7; el frame `334:129852` ya es la pantalla del POS) |
| D4 | Anular con factura electrónica aceptada | emitir NC electrónica / bloquear y obligar a devolver | Pendiente desde `POS-PARIDAD` §6.1; decide también el agente de cobro |
| **D5** | `payments.cash_session_id` | sí / no | **Sí**, NULL-able, escrito por el checkout y las RPC; el esperado deja de depender del reloj |
| **D6** | ¿El cierre guarda el conteo por método? | solo efectivo (hoy) / arqueo `closing` con `method_breakdown` en la misma transacción | **Sí**, RPC `pos_caja_cerrar` |
| D7 | «Reabrir caja» | implementar / quitar del diseño | **Quitar** por ahora: el cierre ya generó asiento; si se pide, RPC con permiso y contra-asiento |
| **D8** | Cierre ciego | máscara en el navegador (hoy) / en el servidor | **Servidor** (ruta de resumen y RPC sin esperado para quien no puede verlo) |
| D9 | «Consignar a banco» desde la caja | egreso con concepto (hoy) / traslado de Tesorería | **Traslado** cuando exista `fn_movimiento_tesoreria`; mientras, concepto «Retiro para consignación» sin la palabra depósito |
| D10 | Denominaciones | colombianas fijas / por moneda base | **Por moneda** con lista en código para COP, USD, MXN, PEN, EUR y editable después |
| D11 | Verificación del arqueo por supervisor (`verified_by`) | no / sí | **Sí, después**: la firma «Supervisor» del reporte queda como espacio |
| D12 | «Avisar al cajero» | notificación / omitir | Notificación in-app si el módulo de notificaciones lo admite; si no, omitir |
| D13 | «Número de soporte» del movimiento | columna nueva / en notas | Columna aditiva `cash_movements.reference` |
| D14 | Permisos de caja y de ventas | solo `admin.full_access` (hoy) / códigos propios | Crear `pos.cajas.cerrar_ajenas`, `pos.cajas.ver_esperado`, `pos.cajas.movimientos`; usar `pos.void` para anular, `pos.refund` para devolver, `reports.sales` para exportar; activos por defecto para administrador y cargos con `pos.void` hoy |
| D15 | Caja global («Todas las sucursales») | conservar / ocultar | Conservar (existe en el modo sucursal) pero **0 sesiones** la han usado: se puede ocultar tras un ajuste de configuración si el dueño prefiere simplificar |

---

## 6. Verificación del propio plan

- Todas las tablas, columnas, índices, disparadores, políticas, RPC y permisos citados se
  verificaron hoy por el MCP (solo `SELECT` y conteos).
- Las líneas de código son del árbol de trabajo de hoy; los archivos con cambios ajenos sin
  confirmar pueden desplazarse unas líneas.
- No se consultó el MCP de Figma: los node ids salen de los documentos de diseño.


---

## 7. Ejecución (2026-09-24) — decisiones aplicadas y registro

Decisiones del dueño aplicadas: D1 (Ventas lista solo `sales`), D2 (KPIs con criterio de caja,
una función compartida con el Inicio), D3 (Nueva venta = la pantalla del POS), D6 (el cierre
guarda el conteo por método en la misma transacción), D8 (cierre ciego enmascarado en el
servidor), D7 (se quita «Reabrir»), D14 (permisos propios de caja, Admin y Manager por defecto) y
RLS de `cash_sessions` cerrada. Para el resto, la recomendación del plan:

| # | Aplicado |
|---|---|
| D5 | **No en esta tanda.** `payments.cash_session_id` exige que `pos_checkout_v1` (zona del agente de cobro) y el esperado cambien de criterio a la vez; se deja anotado (R1 sigue vigente). |
| D9 | Sin «Depósito bancario» en el catálogo: «Retiro para consignación» hasta que exista el traslado de Tesorería. |
| D10 | Denominaciones por moneda (COP, USD, MXN, PEN, EUR); sin lista, se pide el total. |
| D11 | Firma «Supervisor» como espacio en el reporte (motor de documentos); sin `verified_by` por ahora. |
| D12 | Omitido («Avisar a …» no tiene backend de notificaciones dirigidas). |
| D13 | Columna aditiva `cash_movements.reference`. |
| D14 | `pos.cajas.cerrar_ajenas` y `pos.cajas.ver_esperado` (roles 2 y 5). **No** se creó `pos.cajas.movimientos`: en modo sucursal todos los cajeros registran movimientos en la caja compartida; restringirlo quitaba una capacidad que hoy tienen. |
| D15 | Se conserva la caja global en modo sucursal. |

### Fase 2 de la RLS y la máscara (pendiente de desplegar)

La migración `20260926130000_pos_cajas_cierre_transaccional_ciego_y_rls` es la **fase 1**,
compatible con el código desplegado hoy (que cierra con un `UPDATE` directo desde la ruta y lee
`efectivo_esperado` de `pos_caja_esperado`): el `UPDATE` directo queda limitado a una caja
**abierta** por quien la abrió o con `pos.cajas.cerrar_ajenas`, y la máscara del cierre ciego la
aplica el servidor Node (`GET /api/pos/cajas/[id]/resumen`) y las RPC de arqueo y cierre.

Cuando el código de estos commits esté desplegado (ruta de cierre y `cashSync` por
`pos_caja_cerrar`), aplicar la fase 2 como migración nueva:

```sql
drop policy if exists cash_sessions_update_abierta_propia on public.cash_sessions;

create or replace function public.pos_caja_esperado(p_session_id integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  v := public.pos_caja__esperado_calculo(p_session_id);
  if public.fn_caja_ve_esperado((v->>'organization_id')::integer) then
    return v || jsonb_build_object('oculto', false);
  end if;
  return jsonb_build_object('session_id', v->'session_id', 'organization_id', v->'organization_id',
    'status', v->'status', 'por_cajero', v->'por_cajero', 'hasta', v->'hasta', 'oculto', true);
end; $$;
```

Probado en seco (transacción que se deshace, usuario simulado): cajero con cierre ciego → `{oculto:
true}` sin cifras; administrador → cifras; `UPDATE` directo → 0 filas; cierre de caja ajena →
`sin_permiso`.

### Ventas (pasos 14–18) — decisiones y registro

| # | Aplicado |
|---|---|
| D1 | `pos_ventas_listado` lee solo `sales` (migración `20260926140000`); los pedidos web sin venta quedan en Pedidos online. Paginado, filtrado y ordenado en la base (~45 ms con 1.250 ventas). |
| D2 | `fn_inicio_ventas_rango(org, desde, hasta, sucursal)`: cobrado por `payment_date` menos reintegros en efectivo, con el periodo anterior de igual duración, ticket, impuestos, facturado y cortes por canal y sucursal. Es la función que debe llamar el Inicio. |
| D3 | `/app/pos/ventas/nuevo` ya no tiene carrito: sin parámetros redirige a `/app/pos`; con `?duplicar={id}` crea un carrito NUEVO del POS con `POSService.createCart`/`addItemToCart` (los mismos del POS, guardados en `pos_carts_<org>`) y redirige. No se tocó la pantalla del POS (zona de otro agente): el carrito aparece como una pestaña más. |
| D16 | **Anular sin ruta propia.** El paso 17 pedía `POST /api/pos/ventas/[id]/anular`; el agente de cobro entregó `pos_anular_venta_v1`, que ya exige `pos.void` con `fn_tiene_permiso`, motivo, caja abierta, sin devoluciones y audita en `ops_audit_log`, y su cliente `anularVentaEnServidor`. Una ruta encima solo repetía esa lógica: el listado y el detalle llaman al cliente del agente desde `AnularVentaDialog` (`DialogoMotivo` con «qué se revierte»). Los pedidos web y las ventas con devoluciones quedan deshabilitados con motivo antes de intentarlo. |
| D17 | «Registrar cobro» usa `RegistrarPagoConectado` (agente de facturas y CxC, `fn_registrar_pago`) con origen `venta_pos`: a la factura si la hay; si no, a la cuenta por cobrar. |
| D18 | Imprimir = `factura-venta` del motor de documentos (80 mm; PDF carta en ⋯). 107 de 3.569 ventas no tienen factura: para ellas «Imprimir» queda deshabilitado con motivo y sirve «Reimprimir en la impresora de caja» (`PrintJobsService.enqueueSaleTicket`). No existe un tipo «comprobante de venta» en el motor. |
| D19 | Permisos de las acciones en el servidor (`permisosVentas.ts`, `GET /api/pos/ventas/permisos` y el detalle): `pos.void`, `pos.refund`, `pos.create` (cobrar y duplicar), `reports.sales` (exportar, además exigido por `GET /api/pos/ventas/exportar` con 403 registrado). |
| D20 | Desktop sin red: el listado lee la réplica local (`clienteVentas.ts` → `ventaLocal.ts`), con las ventas del outbox como «Pendiente de sincronizar» y un aviso de que filtros, búsqueda y cifras esperan a la red. El detalle vive en el servidor: sin red muestra un estado propio. |
| — | Filtro «Cajero»: se respeta en la URL (chip) pero no hay selector: no existe una lectura de miembros para el navegador. «Imprimir» masivo y «Enviar» no se hicieron: abrir N pestañas lo bloquea el navegador y no hay envío por correo de ventas. |

**Cajas como cuentas de dinero (para Tesorería):** `cajasComoCuentasDeDinero(ctx)` en
`src/lib/pos/cajas/cuentasDeDinero.ts` (solo servidor) devuelve el modo y, por cada caja
ABIERTA, `{ tipo: 'caja', sesion_id, uuid, alcance: 'sucursal'|'todas'|'usuario', sucursal,
responsable, abierta_desde, saldo, href }`. `saldo` es el efectivo esperado de
`pos_caja_esperado` por `resumenesCompactos`, así que el cierre ciego se respeta (sin
`pos.cajas.ver_esperado`, `saldo = null`). Tesorería no debe recalcular el esperado.

**Pendiente, con motivo:**
- Fase 2 de la RLS y la máscara (sección anterior): tras desplegar estos commits.
- D5 (`payments.cash_session_id`): exige cambiar `pos_checkout_v1` a la vez.
- Plan de anulación «en simulación» (lista exacta de lo que revertiría) en `pos_anular_venta_v1`: se pide al agente de cobro; hoy el diálogo muestra la lista genérica.
- El cargador `cierre-caja`/`arqueo-caja` del motor de documentos decide «ver esperado» con `admin.full_access`; debería usar `pos.cajas.ver_esperado` (`fn_caja_ve_esperado`).
- `fn_notify_cash_session_closed` incluye la diferencia en la notificación aunque el cierre sea ciego.
- La RLS de `cash_movements` sigue siendo una política ALL por pertenencia.
- El historial de cajas lee `difference` desde el navegador (se oculta en la UI, no en el servidor).
- `parametrosArqueo` descarta los métodos contados en 0.
- Las versiones `20260926130000` y `20260926140000` coinciden con dos migraciones de compras; son copias documentales (la política ya admite versiones repetidas) y la base las registró con su propia versión.
- Verificación visual en navegador: el preview pide iniciar sesión y no se escriben contraseñas.

### Seguridad de cajas, fase 1 (2026-09-28) — tres huecos del cierre ciego cerrados

Migración `20260928100000_pos_cajas_aviso_ciego_y_escritura_de_movimientos` (aplicada por MCP,
con rollback; probada en una transacción que se deshace con un cajero y un administrador reales
de una organización de pruebas):

1. **Aviso de cierre.** `fn_notify_cash_session_closed` ya no publica monto final ni diferencia
   cuando la organización usa cierre ciego: el aviso dice «Cierre ciego: el resultado se
   consulta en el detalle de la caja» y el `payload` lleva `cierre_ciego: true` en lugar de
   `difference`. Sin cierre ciego sigue igual. No se dirigió por permiso: el aviso es de
   organización y duplicarlo para quien tiene `pos.cajas.ver_esperado` no aporta; esa persona
   ve las cifras en el detalle (máscara del servidor).
2. **`cash_movements`.** Fuera la política ALL por pertenencia. Quedan: SELECT por pertenencia;
   INSERT solo en una caja ABIERTA de la misma organización y con `user_id` de un miembro
   activo; UPDATE solo en caja abierta y del autor o con `pos.cajas.cerrar_ajenas`; sin DELETE.
   Prueba en seco: insertar en caja cerrada, con autor ajeno a la organización, editar un
   movimiento de caja cerrada o de otro, y borrar → bloqueado; lo propio en caja abierta → sí.
   Nueva RPC `pos_caja_registrar_movimiento` (caja abierta, acceso a la sucursal, autor = quien
   llama, idempotente por `uuid`, hora sin red respetada si cae dentro de la caja); ya la usan
   los tres escritores: `CajasService` (POS), `cashSync` (outbox del Desktop) y
   `movimientosService` (Finanzas; su «anular movimiento» escribía `type` `income`/`expense`,
   que el CHECK rechaza: nunca funcionó y ahora sí). `procesar_devolucion` es SECURITY DEFINER
   de `postgres` y no depende de la RLS; el cobro no escribe movimientos. En la base había 5
   movimientos, ninguno escrito tras el cierre ni editado.
3. **Historial de cajas.** `GET /api/pos/cajas/historial` (página, diferencias para la franja de
   cifras y exportación) lee con el cliente de la sesión y enmascara en el servidor: sin
   `pos.cajas.ver_esperado` con cierre ciego, `final_amount` y `difference` salen `null`, la
   franja no recibe diferencias y se ignoran el filtro «resultado» y el orden por diferencia
   (revelarían la cifra). La consulta vive una sola vez en `src/lib/pos/cajas/historialConsulta.ts`;
   el Desktop sin red la usa sobre su réplica (los datos ya están en el equipo; la pantalla oculta
   las cifras como antes).

**Fase 2 de `cash_movements` (pendiente de desplegar, como la de `cash_sessions`).** El código en
producción aún inserta directo desde el navegador; cuando estos commits estén desplegados y los
Desktop actualizados (su outbox reproduce con la RPC):

```sql
drop policy if exists cash_movements_insert_caja_abierta on public.cash_movements;
drop policy if exists cash_movements_update_caja_abierta on public.cash_movements;
```

Antes de aplicarla hay que decidir qué hacer con «Editar movimiento» de Finanzas
(`movimientosService.updateMovement`, UPDATE directo): hoy queda limitado a caja abierta y al
autor; con la fase 2 fallaría. Recomendación: quitar la edición (un movimiento se corrige
anulándolo con su inverso, que ya pasa por la RPC y deja rastro).

Sigue abierto: la RLS de `cash_sessions` deja leer `difference` y `final_amount` a cualquier miembro
por la API de PostgREST; la máscara del historial y del resumen está en el servidor, no en la
tabla. Cerrarla del todo exige una vista o columnas protegidas y que todos los lectores
(Finanzas, reportes, Desktop) pasen por el servidor: se deja anotado.
