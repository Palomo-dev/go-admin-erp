# FASE 11 — Comercio: Stock Atómico, Factura, AR, Contabilidad

> Vuelve al [PLAN.md](./PLAN.md)

## Resumen de implementación

### F11.1 — Reserva atómica de stock (CRÍTICO) ✅

**Problema:** `app/api/orders/route.ts` hacía read-then-write sin transacción → overselling.

**Solución:**
- **RPC `reserve_stock_for_web_order`** en Supabase: usa `FOR UPDATE` para bloquear filas de `stock_levels` en orden determinista (por `product_id` para evitar deadlocks). Todo-o-nada: si hay shortages, no reserva nada y devuelve el detalle.
- **`goadmin-websites/app/api/orders/route.ts`**: reemplazado el read-then-write por una llamada RPC atómica. Si la RPC falla, la orden se cancela y se devuelve 409 con el detalle de shortages.

**Archivos modificados:**
- `goadmin-websites/app/api/orders/route.ts` (líneas 299-347)

### F11.2 — Liberación de reserva por pago fallido ✅

**Problema:** los 6 webhooks marcaban `payment_status='failed'` pero ninguno liberaba `qty_reserved`.

**Solución:**
- **RPC `release_stock_for_order`** en Supabase: idempotente (usa columna `stock_released_at` en `web_orders`), libera `qty_reserved` con `GREATEST(0, ...)` para no ir negativo.
- **Endpoint ERP `POST /api/web-orders/[id]/release-stock`**: llama a la RPC, marca la orden como `cancelled` si estaba `pending`.
- **Helper `notifyErpReleaseStock`** en el sitio (`lib/erp-release-stock.ts`): fire-and-forget, mismo patrón que `notifyErpAutoConfirm`.
- **6 webhooks actualizados** (stripe, wompi_co, mercadopago, payu, paypal, bold): añaden `if (paymentStatus === 'failed') { notifyErpReleaseStock(...) }`.

**Archivos nuevos:**
- `go-admin-erp/src/app/api/web-orders/[id]/release-stock/route.ts`
- `goadmin-websites/lib/erp-release-stock.ts`

**Archivos modificados:**
- `goadmin-websites/app/api/webhooks/{stripe,wompi_co,mercadopago,payu,paypal,bold}/route.ts`

### F11.3 — Cron de expiración de órdenes pendientes ✅

**Problema:** no existía. Un carrito abandonado dejaba el stock reservado indefinidamente.

**Solución:**
- **RPC `expire_pending_web_orders`** en Supabase: selecciona órdenes `pending` con `payment_status='pending'` y `created_at < now() - N minutos`, usando `FOR UPDATE SKIP LOCKED` para evitar concurrencia entre ejecuciones del cron. Libera stock via `release_stock_for_order` y marca como `expired`.
- **Endpoint ERP `GET /api/cron/expire-pending-web-orders`**: llama a la RPC con `CRON_SECRET` de autenticación. Tiempo configurable via query param `?minutes=30`.
- **Vercel Cron** configurado cada 15 minutos en `vercel.json`.

**Archivos nuevos:**
- `go-admin-erp/src/app/api/cron/expire-pending-web-orders/route.ts`

**Archivos modificados:**
- `go-admin-erp/vercel.json` (añadido cron `*/15 * * * *`)

### F11.4 — Asiento contable para ventas web ✅ (ya cubierto)

**Hallazgo:** el asiento contable **ya se genera automáticamente** mediante triggers de base de datos existentes:

1. **`trg_auto_journal_sale_pos`** en tabla `sales`: se dispara `AFTER INSERT OR UPDATE OF status` cuando `status IN ('paid', 'confirmed', 'completed')`. Como `webOrderServerConfirmation.confirmOrder()` crea la venta con `status: 'paid'`, el trigger se dispara y crea el asiento usando `accounting_rules` con `source_type='sale'`.
2. **`trg_auto_journal_payment`** en tabla `payments`: se dispara `AFTER INSERT` y crea el asiento de cobro usando reglas `source_type='sale_payment'`.
3. **`trg_auto_journal_ar`** en tabla `accounts_receivable`: se dispara `AFTER INSERT`.

Todos los triggers son **idempotentes** (verifican si ya existe un asiento con el mismo `source` y `source_id`).

**Conclusión:** no se necesita código adicional. El asiento contable de la venta web se crea automáticamente cuando se inserta el `sale` con `status='paid'`, siempre que la organización tenga `accounting_rules` configuradas para `source_type='sale'`.

### F11.5 — Reembolsos completos ✅

**Problema:** los webhooks mapeaban `refunded` → `payment_status='refunded'` y ahí terminaba. No había nota crédito, no volvía el stock, no se ajustaba cartera.

**Solución:**
- **Endpoint ERP `POST /api/web-orders/[id]/refund`**:
  1. Crea nota crédito (`invoice_sales` con `document_type='credit_note'`) referenciando la factura original.
  2. Crea `invoice_items` para la nota crédito.
  3. Devuelve stock al inventario (incrementa `qty_on_hand` + crea `stock_movements` con `direction='in'` y `source='web_refund'`).
  4. Ajusta `accounts_receivable` (balance += monto reembolsado).
  5. Actualiza la factura original (balance + status).
  6. Marca `web_orders.payment_status='refunded'`, `status='refunded'`.
  7. El asiento de reversión se crea automáticamente via trigger `trg_auto_journal_credit_note`.
  8. Soporta reembolso parcial por ítem (body.items) y reembolso total.
  9. Idempotente: si `payment_status` ya es `'refunded'`, no procesa de nuevo.
- **Helper `notifyErpRefund`** en el sitio (`lib/erp-refund.ts`).
- **6 webhooks actualizados**: añaden `if (paymentStatus === 'refunded') { notifyErpRefund(...) }`.

**Archivos nuevos:**
- `go-admin-erp/src/app/api/web-orders/[id]/refund/route.ts`
- `goadmin-websites/lib/erp-refund.ts`

**Archivos modificados:**
- `goadmin-websites/app/api/webhooks/{stripe,wompi_co,mercadopago,payu,paypal,bold}/route.ts`

## Cambios en Supabase (RPCs y esquema)

### RPCs creadas
1. `reserve_stock_for_web_order(p_organization_id, p_branch_id, p_order_id, p_items jsonb) → jsonb`
2. `release_stock_for_order(p_order_id uuid) → jsonb`
3. `expire_pending_web_orders(p_expiration_minutes integer) → jsonb`

### Esquema
- Añadida columna `stock_released_at timestamptz` a `web_orders` (para idempotencia de liberación de stock).

## Decisiones de diseño

1. **RPCs en Supabase (no en Node):** las operaciones de stock atómico se hacen en PostgreSQL con `FOR UPDATE` para garantizar atomicidad a nivel de base de datos, evitando el overselling que ocurría con read-then-write desde Node.

2. **Orden determinista en locks:** la RPC `reserve_stock_for_web_order` ordena los items por `product_id` antes de aplicar `FOR UPDATE`, lo que evita deadlocks cuando dos pedidos concurrentes comparten productos en distinto orden.

3. **Idempotencia via `stock_released_at`:** la columna `stock_released_at` en `web_orders` garantiza que la liberación de stock no se ejecute dos veces (las pasarelas reenvían webhooks duplicados).

4. **`FOR UPDATE SKIP LOCKED` en el cron:** la RPC de expiración usa `SKIP LOCKED` para que múltiples ejecuciones del cron (o ejecución solapada con un pago que llega tarde) no procesen las mismas órdenes.

5. **Asiento contable via triggers existentes:** se verificó que los triggers `trg_auto_journal_sale_pos`, `trg_auto_journal_payment` y `trg_auto_journal_ar` ya crean los asientos automáticamente. No se duplicó la lógica en código (hacerlo causaba asientos duplicados, como se documenta en `pedidosService.ts:1105-1112`).

6. **Nota crédito en `invoice_sales`:** las notas crédito se almacenan en la misma tabla `invoice_sales` con `document_type='credit_note'`, siguiendo el patrón existente del ERP (ver `notasCreditoService.ts`).

7. **Reembolso parcial por ítem:** el endpoint de refund acepta `body.items` con `product_id` y `quantity` específicos, permitiendo reembolsos parciales. Si no se especifica, se reembolsa todo.

## Pendientes

- **F11.6 — Cliente automático:** si el pedido web no trae `customer_id`, `confirmOrder()` no crea `accounts_receivable`. Falta buscar/crear `customers` por email antes de crear la venta. (No implementado en esta fase.)
- **F11.7 — Observabilidad:** panel de stock reservado vs disponible, listado de pedidos próximos a expirar, log de eventos de integración. (No implementado.)
- **F11.8 — Tests de integración:** los 8 casos de prueba del plan no se ejecutaron automáticamente. Se recomienda validar manualmente:
  - Pago aprobado → venta + factura + AR + stock_movements + asiento + web_orders.sale_id
  - Pago rechazado → qty_reserved vuelve al valor previo
  - Carrito abandonado → expira y libera stock
  - Reembolso total → nota crédito + stock devuelto + asiento reversión
  - Concurrencia → 2 compras simultáneas del último ítem → 1 éxito, 1 error 409
  - Webhook duplicado → idempotente
- **Configuración por organización:** el tiempo de expiración (default 30 min) debería ser configurable por organización. Actualmente es un query param del cron.
- **Email al cliente en expiración:** el plan menciona email opcional al cliente cuando expira el pedido. No implementado.
