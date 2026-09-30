# Hora oficial del servidor en dinero e inventario — análisis

Fecha: 2026-09-30 · Alcance: ventas (POS en línea y sin conexión, mesas, devoluciones,
anulaciones), pagos, caja, facturas de venta y compra, notas crédito, movimientos de
inventario. Sin datos de clientes: solo agregados.

## 1. Cómo se registra hoy la hora

| Flujo | Quién pone la hora | Columna(s) | Qué usa el día / el cierre |
|---|---|---|---|
| Venta POS en línea | **Navegador**: `posService.checkout` manda `createdAt = new Date()` en el sobre; `pos_checkout_v1` hace `coalesce(sobre.created_at, now())` | `sales.created_at`, `sales.sale_date`, `invoice_sales.issue_date`/`due_date` | Listados y asiento (`fn_auto_journal_sale_pos`) usan `sale_date` |
| Venta a crédito (deuda) | **Navegador** (`holdCartWithDebt`, `new Date()`) → misma RPC | idem | idem |
| Pagos del cobro POS | **BD**: la RPC no pasa fecha → default `now()` | `payments.created_at`, `payment_date` | Esperado de caja: `payments.created_at` en `[opened_at, closed_at]`; asiento: `payment_date` |
| Venta sin conexión | **Equipo**: `createdAt` queda en el outbox y se reenvía al sincronizar | `sales.*` como arriba; pagos con `now()` **de la sincronización** | Venta y pago pueden quedar en días y cajas distintos |
| Caja: apertura en línea | BD (`opened_at default now()`) | `cash_sessions.opened_at` | Ventana del esperado |
| Caja: apertura sin conexión | **Equipo**: `cashSync.replayOpen` inserta `opened_at` directo | idem | idem |
| Caja: movimiento | RPC `pos_caja_registrar_movimiento`: `p_creado_en` solo si cae en `[opened_at, now()+5 min]`; en línea va nulo | `cash_movements.created_at` | Asiento usa `created_at` |
| Caja: cierre | RPC `pos_caja_cerrar`: `least(coalesce(p_cerrada_en, now()), now())`; en línea (ruta servidor) va nulo | `cash_sessions.closed_at` | Ventana del esperado |
| Mesas | **Navegador**: `table_sessions.opened_at`/`closed_at` y `sales.sale_date` con `new Date()` (pedidosService, mesasService) | idem | Historial de mesas, ventas del día |
| Checkout de hotel (PMS) | **Navegador**: `sales.sale_date`, `invoice_sales.issue_date` con `new Date()` (`checkoutService`) | idem | idem |
| Devoluciones, anulaciones, notas crédito | RPC (`procesar_devolucion`, `pos_anular_venta_v1`, `fn_nota_credito_emitir`) con `now()` | `returns.*`, `invoice_sales` | — correcto |
| Pagos manuales (cartera, CxP) | `fn_registrar_pago`: día elegido por el usuario + hora de pared **del servidor** en la zona de la org | `payments.payment_date` | — correcto (dato, no reloj) |
| Facturas de venta/compra (formulario) | `issue_date` = día que teclea el usuario (dato) | `invoice_*.issue_date` | — correcto |
| Inventario | `fn_inv_int_mover` y demás RPC: default `now()` | `stock_movements.created_at` | — correcto |

Ningún trigger protegía la marca de tiempo: un `insert` desde el navegador con
`created_at`/`sale_date` arbitrario se guardaba tal cual.

## 2. Desfase medido en la BD (agregados, últimos 180 días)

Ventas de mostrador pagadas en el mismo cobro (sin mesa, sin deuda, sin cobro posterior):
hora de la venta (`sale_date`, del navegador) contra la de su primer pago (`now()` del servidor).

| | Total | < 2 min | 2–10 min | 10 min–24 h | > 24 h | Día distinto |
|---|---|---|---|---|---|---|
| Antes de la RPC atómica (21-09) | 1 998 | 1 466 | 266 | 44 | 222 | — |
| Desde la RPC atómica | 1 036 | 933 | 88 | 15 | 0 | — |
| Total | 3 034 | 2 399 | 354 | 59 | 222 | 230 |

- La venta **nunca** es posterior al pago: el error va siempre en el mismo sentido (reloj del
  equipo atrasado o venta sin conexión reproducida después).
- Desde la RPC atómica: 103 ventas (10 %) en 2 organizaciones con 2 min–24 h de desfase.
- 230 ventas tienen el día de la venta distinto del día de su pago (zona de la org): son las
  que descuadran «ventas del día» contra «cobros del día».
- Pagos que caen fuera de la ventana de la caja donde se hizo la venta: **0** hasta hoy
  (el riesgo existe, pero no se ha materializado).

## 3. Tabla de auditoría (código de navegador del alcance)

Veredictos: **CORREGIR** (reloj del equipo como marca del hecho) · **DATO** (fecha elegida
por el usuario) · **SERVIDOR** (ya la pone la BD o el servidor) · **SIN CONEXIÓN** (hora del
equipo legítima, se conserva aparte).

| Archivo:línea | Tabla.columna | ¿Reportes/cierres? | Veredicto |
|---|---|---|---|
| `lib/services/posService.ts:1835` (+ `pos_checkout_v1`) | `sales.sale_date`, `created_at`, `invoice_sales.issue_date` | Sí: ventas del día, asiento | CORREGIR (en la RPC) |
| `lib/services/posService.ts:1568` (deuda) | idem | Sí | CORREGIR (en la RPC) |
| `components/pos/CheckoutDialog.tsx:1166` | `createdAt` del intento de cobro → sobre | Sí | CORREGIR (en la RPC; se conserva como hora del equipo) |
| `lib/offline/salesOutbox.ts:330,368` | `sales.*` vía sobre | Sí | SIN CONEXIÓN |
| `lib/offline/cashOutbox.ts:404` → `cashSync.ts:133` | `cash_sessions.opened_at` | Sí: ventana de caja | SIN CONEXIÓN |
| `lib/offline/cashOutbox.ts:466` → `movimientoRpc` | `cash_movements.created_at` | Sí | SIN CONEXIÓN (RPC acota) |
| `lib/offline/cashOutbox.ts:551` → `arqueo.ts:109` | `cash_sessions.closed_at` | Sí | SIN CONEXIÓN (RPC acota) |
| `components/pos/mesas/id/pedidosService.ts:220` | `table_sessions.opened_at` | Historial mesas | CORREGIR |
| `components/pos/mesas/id/pedidosService.ts:288` | `sales.sale_date` | Sí | CORREGIR |
| `components/pos/mesas/mesasService.ts:408` | `table_sessions.opened_at` | Historial mesas | CORREGIR |
| `components/pos/mesas/mesasService.ts:679` | `table_sessions.closed_at` | Historial mesas | CORREGIR |
| `lib/services/checkoutService.ts:827` (PMS) | `sales.sale_date` | Sí | CORREGIR |
| `lib/services/checkoutService.ts:904` (PMS) | `invoice_sales.issue_date` | Sí | CORREGIR |
| `components/pos/cajas/CajasService.ts:501` | `cash_sessions.opened_at` | Sí | SERVIDOR (default) |
| `app/api/pos/cajas/[id]/cerrar/route.ts:141` | `closed_at` | Sí | SERVIDOR |
| `lib/services/movimientosService.ts:311,440` | `cash_movements.created_at` | Sí | SERVIDOR (RPC, sin hora) |
| `app/app/pos/pedidos-online/[id]/hooks/useWebOrderDetail.ts:353` | `payments.created_at` | Sí | SERVIDOR (default) |
| `components/finanzas/facturas-compra/RegistrarPagoModal.tsx:86` | `payments.payment_date` | Sí | DATO |
| `components/finanzas/cuentas-por-pagar/RegistrarPagoModal.tsx:86` | `payment_date` | Sí | DATO |
| `components/finanzas/cuentas-por-pagar/id/service.ts:345` | `payments.payment_date` (día elegido + hora del navegador) | Sí | DATO (hora de pared del navegador; pendiente menor: pasar a `instantForDayInTz`) |
| `components/finanzas/facturas-compra/FacturasCompraService.ts:289,502` | `invoice_purchase.issue_date` | Sí | DATO |
| `components/finanzas/facturas-compra/nueva-factura/NuevaFacturaForm.tsx:140` | `issue_date` (valor inicial del formulario) | Sí | DATO |
| `components/finanzas/facturas-venta/ImportarCSVDialog.tsx:224` | `invoice_sales.issue_date` | Sí | DATO (importación) |
| `components/finanzas/documentos-soporte/SupportDocumentForm.tsx:339` | `issue_date` | Sí | DATO |
| `lib/services/serialTrackingService.ts:731` | `serial_numbers.sale_date` | No (trazabilidad) | Fuera del alcance de dinero; lista |

| `lib/services/parkingFinanceService.ts:116` (hallado por el guardarraíl) | `invoice_sales.issue_date`, `due_date` | Sí | CORREGIR |
| `lib/services/webOrderConfirmationService.ts:465` (hallado por el guardarraíl) | `invoice_sales.issue_date`, `due_date` | Sí | CORREGIR |
| `lib/services/crm/posCrmLink.ts:135` | `sales.sale_date` | Sí | Cubierto por el trigger; archivo del frente CRM (allow-list) |

Conteo: CORREGIR 12 (corregidos 12) · SIN CONEXIÓN 4 (regla aplicada a ventas y
aperturas) · SERVIDOR 5 · DATO 8 · cubierto solo por el trigger 1 · fuera de alcance 1.

## 4. Plan (en el orden aprobado) y riesgos

1. **Ventas, pagos y caja (BD).**
   - Trigger `fn_trg_hora_oficial` (BEFORE INSERT/UPDATE) en `sales`, `sale_items`,
     `payments`, `cash_movements`, `table_sessions`, `returns`, `stock_movements`,
     `invoice_sales`, `invoice_purchase`, `credit_notes`: cuando quien escribe es
     `anon`/`authenticated` **directamente** (`current_user`), las marcas del hecho se
     reemplazan por `now()` al insertar y no se pueden cambiar al actualizar (un cierre que
     pasa de nulo a valor toma `now()`). Las RPC `SECURITY DEFINER` (validadas) y el
     `service_role` (importaciones con fechas históricas) no se tocan.
     *Riesgo*: una función `SECURITY INVOKER` que escriba fechas históricas: verificado que no
     existe ninguna.
   - `pos_checkout_v1`: la hora del sobre deja de ser la hora oficial. En línea →
     `now()`; la del equipo se guarda en `sales.device_created_at` y el desfase en
     `clock_skew_seconds`. Sin conexión → regla del punto 5.
   - `cash_sessions` insert directo: misma regla (en línea `now()`; reproducción sin conexión
     con la regla del punto 5 y `device_opened_at`).
2. **Aviso de reloj desfasado**: ruta `GET /api/pos/hora-servidor`, medición del desfase
   (ida y vuelta), aviso al abrir POS y caja si |desfase| > 2 min; no bloquea.
3. **Guardarraíl** en `guardrails.test.ts`: los archivos de navegador del alcance no pueden
   escribir `sale_date`/`opened_at`/`closed_at`/`created_at` con `new Date()`.
4. **Facturas e inventario**: ya las pone el servidor (RPC); el trigger cubre los inserts
   directos. Solo se corrige el checkout de hotel.
5. **Sin conexión**: el sobre lleva `offline: true` y el desfase medido
   (`clock_offset_ms`) al abrir el POS/caja. Día contable:
   - desfase conocido y ≤ 10 min, y hora del equipo en `[now() − 30 días, now() + 5 min]`
     → hora oficial = **hora del equipo** (la venta de las 11:50 p. m. sincronizada al día
     siguiente queda en su día y en su caja). Los pagos de esa venta toman la misma hora,
     para caer en la ventana de la caja.
   - si no → hora oficial = `now()` y la venta queda marcada (`time_review_reason`), sin
     bloquearla, visible con un filtro.
   *Riesgo*: la regla confía en el desfase que declara el equipo. Es inherente a vender sin
   red; queda acotado a 30 días y a 10 min de error, y la hora original del equipo y la del
   servidor (`server_received_at`) quedan registradas para auditoría.
   *Riesgo conocido, no corregido*: los movimientos de caja sin conexión siguen usando la hora
   del equipo acotada a la caja (la RPC no recibe desfase); queda como pendiente.

Datos históricos: no se tocan (columnas nuevas nulas; `server_received_at` solo toma valor en
filas nuevas).

## 5. Estado al cerrar (2026-09-30)

Aplicado por MCP, con `.sql` y rollback: `20260930190001` (columnas y regla),
`20260930190002` (triggers), `20260930190003` (`pos_checkout_v1`), `20260930190004`
(`pos_hora_en_revision`). Prueba en seco de cada una (y del rollback de M3): venta en
línea con el equipo 3 h atrasado → hora del servidor; sin conexión con 30 s de desfase →
hora del equipo en venta, factura y pago; con 15 min → hora del servidor y
`reloj_desfasado`.

Queda pendiente (documentado, no bloquea):
- Pantalla o filtro en «Ventas» sobre `pos_hora_en_revision` (la RPC ya existe).
- Movimientos de caja sin conexión: `pos_caja_registrar_movimiento` sigue aceptando
  la hora del equipo acotada a la caja; no recibe el desfase.
- `posCrmLink.ts` (frente CRM) todavía manda `sale_date: new Date()`; la base lo
  sustituye por `now()`.
- `cuentas-por-pagar/id/service.ts:345`: día elegido + hora de pared del navegador;
  pasar a `instantForDayInTz`.
