# FASE 11 — Cerrar los huecos del flujo de compra

> Vuelve al [PLAN.md](./PLAN.md) · **Independiente del resto: se puede ejecutar en paralelo desde el día 1**

Esta fase no toca el editor. Es riesgo operativo y contable puro.

---

## 11.0 Lo que ya funciona (no tocar)

`webOrderServerConfirmation.confirmOrder()` (ERP, `src/lib/services/webOrderServerConfirmation.ts:86-441`) hace el ciclo completo y correcto cuando el pago se aprueba:

```
sales + sale_items
  → RPC decrement_stock_with_recipe   (descuento real + stock_movements + explosión de receta)
  → libera qty_reserved
  → invoice_sales + invoice_items     (con numeración vía generateInvoiceNumberWithClient)
  → payments vinculado a la factura
  → accounts_receivable               (si hay customer_id)
  → shipments                         (si delivery_own | delivery_third_party)
  → web_orders.sale_id                (idempotencia)
```

Es el patrón de referencia. Todo lo que falta debe apoyarse en él, no reimplementarlo.

---

## 11.1 🔴 Reserva de stock atómica

**Problema:** `goadmin-websites/app/api/orders/route.ts:299-318` hace, desde Node y sin transacción:
```ts
const { data: sl } = await supabase.from('stock_levels').select('qty_reserved')...
await supabase.from('stock_levels').update({ qty_reserved: Number(sl.qty_reserved||0) + item.quantity })...
```
Dos compras simultáneas del último ítem leen el mismo `qty_reserved` y ambas escriben `+1`: **overselling**. La validación previa (líneas 63-112) no protege, porque ocurre antes y también sin lock.

**Solución — RPC nueva:**

```sql
create or replace function public.reserve_stock_for_web_order(
  p_organization_id integer,
  p_branch_id integer,
  p_order_id uuid,
  p_items jsonb            -- [{product_id, quantity}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_item jsonb; v_available numeric; v_shortages jsonb := '[]'::jsonb;
begin
  -- 1) Bloquear en orden determinista de product_id (evita deadlocks)
  for v_item in select * from jsonb_array_elements(p_items) order by (value->>'product_id')::int loop
    select coalesce(qty_on_hand,0) - coalesce(qty_reserved,0) into v_available
    from stock_levels
    where organization_id = p_organization_id
      and branch_id = p_branch_id
      and product_id = (v_item->>'product_id')::int
      and lot_id is null
    for update;                                   -- <- el lock que hoy no existe

    if v_available is null or v_available < (v_item->>'quantity')::numeric then
      v_shortages := v_shortages || jsonb_build_object(
        'product_id', v_item->>'product_id',
        'available', coalesce(v_available,0),
        'requested', v_item->>'quantity');
    end if;
  end loop;

  -- 2) Todo o nada
  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object('ok', false, 'shortages', v_shortages);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    update stock_levels
       set qty_reserved = coalesce(qty_reserved,0) + (v_item->>'quantity')::numeric,
           updated_at = now()
     where organization_id = p_organization_id and branch_id = p_branch_id
       and product_id = (v_item->>'product_id')::int and lot_id is null;
  end loop;

  return jsonb_build_object('ok', true);
end $$;
```

Notas:
- Solo reserva productos con `track_stock = true` (filtrar antes de llamar, como hoy).
- Ordenar por `product_id` evita deadlocks cuando dos pedidos comparten productos en distinto orden.
- La API devuelve 409 con el detalle de `shortages` (ya existe ese contrato en el endpoint actual).

**Test obligatorio:** 2 peticiones concurrentes por el último ítem → exactamente una 201 y una 409.

## 11.2 🔴 Liberar la reserva cuando el pago falla

**Problema:** los 5 webhooks (`stripe`, `wompi_co`, `mercadopago`, `payu`, `paypal`) marcan `payment_status='failed'` y `status='cancelled'`, pero **ninguno libera `qty_reserved`**. El stock queda secuestrado para siempre.

Evidencia: `app/api/webhooks/stripe/route.ts:444-448`, `wompi_co/route.ts:328-332`, `mercadopago/route.ts:404-408`.

**Solución:** un único punto de entrada en el ERP, no lógica duplicada en 5 webhooks.

- **ERP — endpoint nuevo:** `POST /api/web-orders/[id]/release-stock`, que reutiliza `stockMovementService.releaseStockReservation` (ya existe, `src/lib/services/stockMovementService.ts:211-255`) y `serialTrackingService.releaseReservedSerials` (para productos serializados). Idempotente: si la orden ya está `cancelled` con stock liberado, no hace nada.
- **Sitio:** en cada webhook, junto a `notifyErpAutoConfirm` para el caso éxito, añadir `notifyErpReleaseStock(orderId)` para el caso fallo/cancelado. Mismo patrón, misma capa.

Marcar en `web_orders` una bandera o `metadata.stock_released_at` para garantizar idempotencia frente a webhooks duplicados (las pasarelas reenvían).

## 11.3 🔴 Cron de expiración de pedidos pendientes

**Problema:** no existe. Solo hay `/api/cron/update-exchange-rates`. Un carrito abandonado deja el stock reservado indefinidamente.

**Solución:** `POST /api/cron/expire-pending-web-orders` (Vercel Cron cada 15 min).

Lógica:
1. `select` de `web_orders` con `status='pending'` y `payment_status='pending'` y `created_at < now() - interval` configurable por organización (default 30 min; 24 h si el método es transferencia o contra entrega).
2. Llamar al mismo endpoint de liberación de 11.2.
3. `status='expired'`, `cancelled_at=now()`, `cancellation_reason='Expirado por falta de pago'`.
4. Email opcional al cliente con enlace para recuperar el carrito.

**Configuración:** `web_order_expiration_minutes` por organización (en la tabla de configuración de la organización, no en `website_settings`, que es del sitio).

**Cuidado con la carrera:** un pago puede llegar justo mientras el cron expira. Mitigación: la expiración se hace en una RPC que primero verifica `payment_status = 'pending'` con `FOR UPDATE` sobre la orden; y el webhook de pago, si encuentra la orden `expired`, la reactiva y vuelve a validar stock (si ya no hay, notifica al comercio para gestión manual en vez de fallar en silencio).

## 11.4 🟠 Asiento contable de la venta web

**Problema:** `confirmOrder()` crea `sales`, `invoice_sales`, `payments` y `accounts_receivable` pero **no genera `journal_entries`**. Las ventas web no llegan al libro mayor.

**Solución:** identificar el servicio que usa el POS para el asiento de venta y llamarlo desde `confirmOrder()` con los mismos parámetros. No escribir un asiento nuevo a mano: reutilizar exactamente la misma función para que la contabilidad de POS y web sea idéntica y auditable.

Asiento típico (doble partida): débito a caja/bancos o a clientes (AR), crédito a ingresos por ventas, crédito a IVA por pagar, y débito a costo de ventas / crédito a inventario si el ERP maneja inventario permanente.

Punto a decidir con contabilidad: la fecha del asiento debe ser la de confirmación del pago, no la de creación del pedido.

## 11.5 🟠 Reembolsos

**Problema:** los webhooks mapean `charge.refunded` → `payment_status='refunded'` y ahí termina. No hay nota crédito, no vuelve el stock, no se ajusta la cartera.

**Solución:** `POST /api/web-orders/[id]/refund` en el ERP que, según sea total o parcial:
1. Crea nota crédito (`credit_notes` + items) referenciando la factura.
2. Devuelve stock con la RPC de incremento equivalente a `decrement_stock_with_recipe` (creando `stock_movements` de tipo devolución).
3. Ajusta `accounts_receivable` y registra el pago negativo.
4. Genera el asiento de reversión.
5. Marca `web_orders` y notifica al cliente.

Soportar reembolso parcial por ítem, no solo total.

## 11.6 🟡 Cliente automático

**Problema:** si el pedido web no trae `customer_id`, `confirmOrder()` **no crea `accounts_receivable`** (línea 309: `if (order.customer_id && invoiceId)`). Esas ventas quedan fuera de cartera y fuera del CRM.

**Solución:** antes de crear la venta, buscar o crear `customers` por email o teléfono dentro de la organización (mismo patrón que ya usa `/api/reservations`), respetando Habeas Data: guardar el consentimiento cuando el cliente lo marca en el checkout. Vincular el pedido y continuar el flujo normal.

## 11.7 Observabilidad

- Panel en el ERP: **stock reservado vs disponible** por sucursal, con alerta cuando `qty_reserved` supera un umbral o lleva más de X horas sin moverse (síntoma de reservas huérfanas).
- Listado de pedidos pendientes próximos a expirar.
- Log de eventos de integración (la tabla `integration_events` ya se usa) para reconciliar webhooks.

## 11.8 Tests de integración obligatorios

| Caso | Resultado esperado |
|---|---|
| Pago aprobado | venta + factura + AR + `stock_movements` + asiento + `web_orders.sale_id` |
| Pago rechazado | `qty_reserved` vuelve al valor previo en < 1 min |
| Carrito abandonado | expira y libera stock en el siguiente ciclo del cron |
| Reembolso total | nota crédito + stock devuelto + asiento de reversión |
| Reembolso parcial | proporcional en las 3 dimensiones |
| **Concurrencia** | 2 compras simultáneas del último ítem → 1 éxito, 1 error 409 |
| Webhook duplicado | idempotente, no duplica venta ni movimientos |
| Pago que llega tras la expiración | la orden se reactiva o se escala, nunca se pierde el dinero |

### Criterios de aceptación F11
- [ ] Los 8 tests de 11.8 en verde.
- [ ] Ninguna venta web queda sin asiento contable.
- [ ] El panel de stock reservado no muestra reservas de más de 24 h.
