# Checkout atómico del POS (fase 4E)

Estado: implementado y aplicado en producción el 2026-09-21 (migración
`20260921100000_pos_checkout_v1_rpc_atomica`). Cierra el punto 4 de
ROADMAP-DESKTOP §Fase 4, que en la fase 4B quedó parcial («outbox por venta,
sin RPC atómica»). Depende de `docs/desktop/FASE-4B-VENTA-OFFLINE.md`.

## Problema

`POSService.checkout` hacía N inserts secuenciales desde el cliente:
`sales` → `sale_items` → stock (`decrement_stock_with_recipe` por ítem) →
seriales → `invoice_sales` → `payments` (uno a uno) → `invoice_items` →
`accounts_receivable` → `tips`, más `commissions` y
`increment_promotion_usage`. Una reproducción del outbox (o una venta en línea
con mala red) podía morir a mitad: la venta se veía en Supabase sin pagos o
sin factura hasta que el reintento la completaba. La fase 4B lo hizo
idempotente por `sale_id`, pero no atómico.

## Qué cambia

Una venta es **una llamada** a `public.pos_checkout_v1(p_envelope jsonb)`:
o entra todo o no entra nada. El cliente sigue calculando exactamente lo
mismo que antes (promociones, impuestos por línea, totales, comisión de la
factura) y manda el resultado en un sobre; la RPC **valida** y escribe.

```
POSService.checkout
  ├ shouldCheckoutOffline() → outbox (fase 4B, sin cambios)
  ├ promociones · resolveLineTax · itemCalcs · totales     (igual que antes)
  ├ cobro de deuda (cart.sale_id + invoice_id) → camino de siempre (UPDATE)
  └ buildCheckoutEnvelope() → supabase.rpc('pos_checkout_v1', { p_envelope })
        ├ ok            → removeCart() (misma emisión a la pantalla del cliente) → Sale { ..., replayed }
        ├ PGRST202      → la RPC no existe en este entorno: console.warn UNA vez por sesión
        │                 y respaldo de N inserts (fase 4B) hasta que la migración esté aplicada
        └ otro error    → CheckoutRpcError { code, message }: nada escrito, carrito abierto

salesSync.replayOne → POSService.checkout({ ...sobre, replayFromOutbox: true })
        → una llamada a la RPC por sobre; `replayed: true` si la venta ya estaba
```

## Piezas

| Capa | Archivo | Papel |
|---|---|---|
| BD | `supabase/migrations/20260921100000_pos_checkout_v1_rpc_atomica.sql` (+ rollback) | La RPC. Contrato completo en la cabecera del archivo. |
| Cliente | `src/lib/offline/checkoutRpc.ts` | `buildCheckoutEnvelope`, `callCheckoutRpc`, detección `PGRST202` una vez por sesión, `CheckoutRpcError`. No importa Supabase (recibe el cliente). |
| Checkout | `src/lib/services/posService.ts` | Tras calcular totales y antes de cualquier insert: si no es cobro de deuda y la RPC no está marcada ausente, sobre → RPC. Si vuelve `null` (ausente), sigue el respaldo 4B tal cual. |
| Sync | `src/lib/offline/salesSync.ts` | Sin cambio de flujo: cada sobre pasa por `checkout` → RPC. Registra `replayed`. |
| Tipos | `src/components/pos/types.ts` | `Sale.replayed?: boolean` (solo lo rellena la RPC). |

## El sobre

```ts
{
  version: 1,
  sale_id, created_at,                    // id/fecha del cliente (idempotencia)
  organization_id, branch_id, user_id,    // user_id = cajero; null → auth.uid()
  customer_id, currency, tax_included, tax_breakdown,
  totals: { subtotal, tax_total, discount_total, total, total_paid, change, shipping_fee, tip_amount },
  items: [{ product_id, product_name, quantity, unit_price, discount_amount, tax_rate,
            tax_amount, total, tax_included, notes, modifiers: [{ name }], serial_ids }],
  payments: [{ method, amount }],         // en orden; el cambio va al primer efectivo
  tip: { server_id } | null,
  salesperson: { id, commission_rate, commission_type, commission_method, commission_amount, base_amount } | null,
  invoice: { prefix: 'FACT', commission_amount },
  promotion_ids: [uuid],
}
```

Respuesta: `{ sale, invoice, payments, replayed, completed, warnings }`.
`sale` es la fila de `sales` tal cual (lo que la UI ya esperaba de
`checkout`); `completed` lista los bloques que se insertaron al completar una
venta que ya existía; `warnings` los pasos no bloqueantes que fallaron.

## Qué hace la RPC (y qué reutiliza)

Inventariado por MCP antes de escribirla (columnas, defaults, CHECKs,
`pg_trigger` y funciones existentes):

1. **Guarda de pertenencia**: `auth.uid()` (o el `user_id` del sobre si el
   JWT es `service_role`) debe ser miembro activo (`organization_members`) de
   `organization_id`. Afirmación positiva: sin sesión falla cerrado (42501).
   EXECUTE a `authenticated` y `service_role`; revocado a `anon` y `public`
   (verificado con `has_function_privilege`).
2. **Validación**: sucursal y cliente de la organización; ítems con cantidad
   > 0 e importes no negativos; `total = Σ ítems + flete + propina` y
   `Σ pagos = total_paid` (tolerancia 0,05). `status`/`payment_status`,
   `balance` se derivan en SQL con la misma regla que Node.
3. **Idempotencia**: `pg_advisory_xact_lock` por `sale_id` +
   `SELECT … FOR UPDATE`. Si la venta existe en la organización →
   `replayed: true` y cada bloque comprueba por `sale_id` qué falta (mismos
   criterios que la tabla de la fase 4B). Si existe en otra organización →
   42501. Carrera 23505 → se relee y se completa.
4. **Reutiliza** `increment_promotion_usage` (solo venta nueva),
   `decrement_stock_with_recipe` (stock + `stock_movements`, uno por ítem),
   y los disparadores de la base:
   - `invoice_sales` AFTER INSERT → `tr_create_account_receivable` crea la
     cartera. **La RPC no escribe `accounts_receivable`** (memoria
     `pagos-triggers-saldo-y-cartera`): la fila manual que insertaba Node
     cuando `balance > 0` era un duplicado sin `invoice_id`.
   - `payments` AFTER INSERT → recalcula saldo/estado de la factura y la
     cartera. Por eso los pagos se insertan **antes** que `invoice_items`
     (cuyo disparador `fn_recalc_invoice_totals` recalcula el saldo).
   - `sales` AFTER INSERT → `fn_create_commission_on_sale` puede crear la
     comisión; la RPC solo inserta la suya si no hay ninguna con
     `source_type='sale'` para la venta (evita el duplicado que Node podía
     producir).
5. **Numeración**: misma regla que `generateInvoiceNumber`
   (`FACT-<máx secuencial de 1–7 dígitos + 1>`, 4 dígitos, saltando los ya
   usados), bajo `pg_advisory_xact_lock('invoice_number:<org>')`: dos cajas
   nunca comparten consecutivo. Se reutiliza la factura existente al
   completar.
6. **No bloqueantes** (como en Node): stock, seriales, comisión y
   promociones. Sus errores vuelven en `warnings` y la venta sigue.
   **Atómicos**: venta, líneas, factura, pagos, líneas de factura y propina.

Diferencias deliberadas respecto a Node, todas por restricciones reales de
la base: `tips.tip_type` solo admite `cash/card/split/pooled`, así que un
pago por transferencia registra la propina como `cash` (antes el INSERT
fallaba en silencio); `accounts_receivable` no se escribe a mano (arriba);
la comisión no se duplica con la del disparador.

## Dry-run (antes de aplicar)

Sobre sintético en la organización con menos datos (org 61, sucursal 30,
producto 102, sin moneda base → `COP`), dentro de un `DO` que termina en
`RAISE EXCEPTION` (todo revertido, la función no quedó creada):

| Caso | Resultado |
|---|---|
| Venta nueva | `FACT-0001`; 1 `sale_items`, 1 factura, 2 pagos (cambio en el efectivo), 1 `invoice_items`, 1 propina, 1 `stock_movements`; cartera creada por el disparador; sin avisos |
| Mismo sobre otra vez | `replayed: true`, `completed: []`, ninguna fila más |
| Se borran un pago y la propina y se reproduce | `replayed: true`, `completed: ["payments","tips"]`, vuelve a 2 pagos y 1 propina |
| Total manipulado | `22023 Totales incoherentes…`, 0 filas |
| Sin sesión | `42501 No perteneces a esta organización` |
| Usuario de otra organización | `42501` |

## Límites que quedan

- **`payments.payment_date`/`created_at`** siguen siendo `now()` (igual que
  Node): una venta hecha sin red a las 10:00 y sincronizada a las 14:00
  tiene la venta con fecha 10:00 y los pagos con 14:00.
- **`invoice_sales.total`** lo recalcula el disparador de `invoice_items` a
  partir de las líneas (no incluye flete ni propina). Igual que antes.
- **Envío a domicilio propio y factura electrónica** no van en el sobre
  (siguen en `CheckoutDialog` tras el checkout, con red).
- **Cobro de deudas** (`cart.sale_id` + `cart.invoice_id`) no pasa por la
  RPC: actualiza una venta existente y sigue en Node.
- El respaldo de N inserts (fase 4B) sigue en `posService.ts` con un
  `console.warn` único por sesión. Cuando la migración esté en todos los
  entornos, se elimina.

## Tests

```bash
TZ=UTC            npx jest src/lib/offline
TZ=America/Bogota npx jest src/lib/offline
```

- `src/lib/offline/__tests__/checkoutRpc.test.ts`: sobre → una sola llamada,
  cero inserts, contenido del sobre (promoción, modificadores, seriales,
  propina, totales); navegador genera el id; `replayed`; RPC ausente →
  respaldo con un único aviso por sesión; error → nada escrito y carrito
  abierto; cobro de deuda no pasa por la RPC; `salesSync` reproduce dos
  sobres con dos llamadas y marca `synced` también el `replayed`; rechazo de
  la RPC → `pending` con el código del error.
- `src/lib/offline/__tests__/checkoutIdempotente.test.ts`: el respaldo 4B,
  con el cliente de mentira respondiendo `PGRST202`.

Datos inventados: organización 120, sucursal 7.
