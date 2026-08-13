# Análisis y Fix del Flujo de Stock

> Documento generado por análisis con subagentes. Se actualiza cada vez que se aplica un fix.

## Estado general

| # | Problema | Severidad | Estado | Archivo |
|---|----------|-----------|--------|---------|
| 1 | Doble aumento en factura de compra manual | Alta | ✅ COMPLETADO | `FacturasCompraService.ts` |
| 2 | Doble descuento POS → Factura de venta | Media | ✅ COMPLETADO | `DetalleFactura.tsx` |
| 3 | Cancelación de pedido web no libera stock | Alta | ✅ COMPLETADO | `useWebOrderDetail.ts` |
| 4 | Seriales no se venden desde Mesas | Media | ✅ COMPLETADO | `pedidosService.ts` |
| 5 | Anular factura de venta no devuelve stock | Media | ✅ COMPLETADO | `AnularFacturaDialog.tsx` |
| 6 | `convertToSale()` no maneja stock | Alta | ✅ COMPLETADO | `webOrdersService.ts` |
| 7 | Seriales reservados no se liberan al cancelar pedido web | Media | ✅ COMPLETADO | `webOrdersService.ts` |

---

## Verificación de la BD (Supabase)

### RPC `decrement_stock_on_sale`
- SÍ verifica `track_stock`: si es `false` o `NULL`, sale sin error (no descuenta)
- NO previene doble descuento: no verifica si ya existe un movimiento con el mismo `source_id`
- Actualiza `stock_levels.qty_on_hand` y crea registro en `stock_movements` con `direction='out'`

### RPC `decrement_stock_with_recipe`
- Si el producto tiene receta activa → descuenta cada ingrediente (verificando `track_stock` de cada uno)
- Si no tiene receta → delega a `decrement_stock_on_sale`
- El producto compuesto solo se descuenta si su `track_stock = true`

### Triggers encontrados
| Tabla | Trigger | Función | Afecta stock |
|-------|---------|---------|--------------|
| `invoice_items` | `trg_recalc_invoice_totals_*` | Recalcula totales de factura | NO |
| `sale_items` | `trg_auto_journal_sale_item_cogs` | Asiento contable de costo de ventas | NO |
| `stock_levels` | `trg_notify_stock_low` | Notifica stock bajo | NO |
| `stock_movements` | `trg_auto_journal_stock_movement` | Asiento contable del movimiento | NO |

**Conclusión:** No hay triggers que descuenten stock automáticamente. Todo es explícito desde el frontend vía RPC.

---

## Flujo por módulo

### 1. POS Normal (`posService.ts`)
- **Cuándo descuenta:** Después de crear `sale_items`, antes de crear la factura
- **Protección doble descuento:** `if (!isDebtCheckout)` — si el carrito viene de deuda (ya tiene `sale_id`), no descuenta
- **Seriales:** SÍ se marcan como vendidos (`serialTrackingService.sellSerials`)
- **Source:** `'sale'`
- **Veredicto:** ✅ Correcto, sin doble descuento

### 2. Mesas (`pedidosService.ts`)
- **Cuándo descuenta:** Solo al cerrar/cobrar la mesa (`completarVentaMesa`), NO al agregar items
- **Doble descuento:** No ocurre — se descuenta una sola vez
- **Seriales:** ❌ NO se manejan — los seriales no se marcan como vendidos desde mesas
- **Source:** `'mesa_sale'`
- **Veredicto:** ⚠️ Funciona pero faltan seriales

### 3. Factura de Venta (`NuevaFacturaForm.tsx` + `DetalleFactura.tsx`)
- **Cuándo descuenta:** Al emitir la factura (no al crearla en borrador)
- **Protección doble descuento:** El RPC `issue_invoice` falla si la factura no está en `draft`
- **Seriales:** No se manejan en emisión
- **Source:** `'invoice_sale'`
- **Veredicto:** ⚠️ Hay riesgo de doble descuento si la factura viene de una venta POS

### 4. Factura de Compra (`FacturasCompraService.ts`)
- **Cuándo aumenta:** Al crear factura manual Y al cambiar estado a `received`
- **Verifica `track_stock`:** SÍ, en el frontend
- **Seriales:** SÍ se crean al recibir
- **Source:** `'purchase_invoice'`
- **Veredicto:** ❌ DOBLE AUMENTO DETECTADO

### 5. Orden de Compra (`purchaseOrderService.ts`)
- **Cuándo aumenta:** Al recibir items (`receiveItems`)
- **Recepción parcial:** SÍ, usa delta (nuevo - anterior)
- **Verifica `track_stock`:** SÍ
- **Seriales:** SÍ se crean
- **Veredicto:** ✅ Correcto

### 6. Pedidos Online (`webOrdersService.ts` + `webOrderConfirmationService.ts`)
- **Reserva:** Al crear pedido → `qty_reserved++`
- **Descuento definitivo:** Al confirmar → `decrementOnSale` + libera reserva
- **Cancelación:** `cancelOrder()` libera reserva
- **Veredicto:** ❌ 3 problemas críticos

---

## Detalle de problemas y fixes

### Problema 1: Doble aumento en factura de compra manual
- **Archivo:** `src/components/finanzas/facturas-compra/FacturasCompraService.ts`
- **Líneas:** 364 (al crear) y 1143 (al confirmar)
- **Problema:** `actualizarInventarioPorCompra` se llama al crear la factura Y al cambiar a 'received'
- **Estado:** ✅ COMPLETADO
- **Fix:** Se eliminó la llamada a `actualizarInventarioPorCompra` en `crearFactura` (línea 364). El stock solo se aumenta al confirmar (cambiar a 'received') en `actualizarEstadoFactura`.

### Problema 2: Doble descuento POS → Factura de venta
- **Archivo:** `src/components/finanzas/facturas-venta/id/DetalleFactura.tsx`
- **Línea:** 570
- **Problema:** Si la factura viene de una venta POS que ya descontó stock con `source='sale'`, y luego se emite desde finanzas con `source='invoice_sale'`, la RPC descuenta dos veces
- **Estado:** ✅ COMPLETADO
- **Fix:** Se agregó verificación previa en `descontarStockPorEmision` (líneas 566-587). Antes de llamar a `decrementOnSale`, se consulta `stock_movements` buscando movimientos con `source_id = sale_id` y `source IN ('sale', 'mesa_sale', 'web_sale')`. Si existen, retorna sin descontar.

### Problema 3: Cancelación de pedido web no libera stock
- **Archivo:** `src/app/app/pos/pedidos-online/[id]/hooks/useWebOrderDetail.ts`
- **Línea:** 221
- **Problema:** `handleCancelOrder()` solo actualiza el estado, no llama a `webOrdersService.cancelOrder()`
- **Estado:** ✅ COMPLETADO
- **Fix:** Se cambió `updateOrderStatus('cancelled', ...)` por `webOrdersService.cancelOrder(orderId, cancelReason)` que libera el stock reservado. Se ajustó el import para incluir `webOrdersService`.

### Problema 4: Seriales no se venden desde Mesas
- **Archivo:** `src/components/pos/mesas/id/pedidosService.ts`
- **Problema:** No hay implementación para `serialTrackingService.sellSerials`
- **Estado:** ✅ COMPLETADO
- **Fix:** Se agregó bloque 7.1 (líneas 1140-1177) en `completarVentaMesa` que vende seriales con `sale_channel='table'`. Se añadió campo `serial_selections?` al parámetro `data`. En `page.tsx` línea 982 se propaga `checkoutData.serial_selections` al servicio.

### Problema 5: Anular factura de venta no devuelve stock
- **Archivo:** `src/components/finanzas/facturas-venta/id/AnularFacturaDialog.tsx`
- **Problema:** Al anular una factura, no se devuelve el stock que se descontó al emitir
- **Estado:** ✅ COMPLETADO
- **Fix:** Se agregó bloque "3. Devolver el stock" (líneas 86-132) después de anular. Busca movimientos con `direction='out'` cuyo `source_id` sea `factura.id` o `factura.sale_id`. Si los hay, llama a `incrementOnPurchase` con `source='invoice_void'`. Envuelto en try/catch para no romper la anulación.

### Problema 6: `convertToSale()` no maneja stock
- **Archivo:** `src/lib/services/webOrdersService.ts`
- **Línea:** 532
- **Problema:** Crea la venta pero no descuenta stock ni libera reservas
- **Estado:** ✅ COMPLETADO
- **Fix:** Se agregó bloque (líneas 595-625) que llama a `decrementOnSale` con `source='web_sale'` y luego `releaseStockReservation` para liberar la reserva.

### Problema 7: Seriales reservados no se liberan al cancelar pedido web
- **Archivo:** `src/lib/services/webOrdersService.ts`
- **Problema:** `cancelOrder()` y `rejectOrder()` no llaman a `serialTrackingService.releaseReservedSerials()`
- **Estado:** ✅ COMPLETADO
- **Fix:** Se agregó bloque try/catch en `releaseOrderStock` (líneas 500-507) que llama a `serialTrackingService.releaseReservedSerials(orderId)`. Errores con `console.warn` (no bloquean).

---

## Historial de cambios

### [Fix 1] Doble aumento en factura de compra - COMPLETADO
- **Fecha:** 2025-01-XX
- **Archivo:** `src/components/finanzas/facturas-compra/FacturasCompraService.ts`
- **Cambio:** Se eliminó la llamada a `actualizarInventarioPorCompra` en `crearFactura` (línea 364). El stock solo se aumenta al cambiar estado de 'draft' a 'received' en `actualizarEstadoFactura` (línea 1143).
- **Razón:** La factura se crea como 'draft' y el stock se aumentaba dos veces: al crear Y al confirmar.
- **Lint:** Sin errores nuevos.

### [Fix 2] Doble descuento POS → Factura de venta - COMPLETADO
- **Archivo:** `src/components/finanzas/facturas-venta/id/DetalleFactura.tsx`
- **Cambio:** Se agregó verificación previa en `descontarStockPorEmision` (líneas 566-587). Antes de llamar a `decrementOnSale`, se consulta `stock_movements` buscando movimientos previos con `source_id = sale_id` y `source IN ('sale', 'mesa_sale', 'web_sale')`. Si existen, retorna sin descontar.
- **Razón:** La RPC no valida movimientos previos, causando doble descuento cuando la factura venía de una venta POS.
- **Lint:** Sin errores nuevos.

### [Fix 3] Anular factura de venta no devuelve stock - COMPLETADO
- **Archivo:** `src/components/finanzas/facturas-venta/id/AnularFacturaDialog.tsx`
- **Cambio:** Se agregó bloque "3. Devolver el stock" (líneas 86-132) después de anular. Busca movimientos `direction='out'` con `source_id = factura.id` o `factura.sale_id`. Si los hay, llama a `incrementOnPurchase` con `source='invoice_void'`.
- **Razón:** Al anular una factura emitida, el stock descontado nunca se devolvía.
- **Lint:** Sin errores nuevos.

### [Fix 4] Seriales no se venden desde Mesas - COMPLETADO
- **Archivos:** `src/components/pos/mesas/id/pedidosService.ts` y `src/app/app/pos/mesas/[id]/page.tsx`
- **Cambio:** Se agregó bloque 7.1 (líneas 1140-1177) en `completarVentaMesa` que vende seriales con `sale_channel='table'`. Se añadió campo `serial_selections?` al parámetro `data`. En `page.tsx` línea 982 se propaga `checkoutData.serial_selections`.
- **Razón:** Productos con `track_serial=true` vendidos desde mesas no marcaban sus seriales como vendidos.
- **Lint:** Sin errores nuevos.

### [Fix 5] Cancelación de pedido web no libera stock - COMPLETADO
- **Archivo:** `src/app/app/pos/pedidos-online/[id]/hooks/useWebOrderDetail.ts`
- **Cambio:** Se cambió `updateOrderStatus('cancelled', ...)` por `webOrdersService.cancelOrder(orderId, cancelReason)` que libera el stock reservado.
- **Razón:** Al cancelar desde el detalle, el stock reservado nunca se liberaba.
- **Lint:** Sin errores nuevos.

### [Fix 6] convertToSale() no maneja stock - COMPLETADO
- **Archivo:** `src/lib/services/webOrdersService.ts`
- **Cambio:** Se agregó bloque (líneas 595-625) que llama a `decrementOnSale` con `source='web_sale'` y luego `releaseStockReservation`.
- **Razón:** La función creaba la venta pero no descontaba stock ni liberaba reservas.
- **Lint:** Sin errores nuevos.

### [Fix 7] Seriales reservados no se liberan al cancelar pedido web - COMPLETADO
- **Archivo:** `src/lib/services/webOrdersService.ts`
- **Cambio:** Se agregó bloque try/catch en `releaseOrderStock` (líneas 500-507) que llama a `serialTrackingService.releaseReservedSerials(orderId)`.
- **Razón:** Los seriales reservados quedaban en estado 'reserved' permanentemente al cancelar.
- **Lint:** Sin errores nuevos.
