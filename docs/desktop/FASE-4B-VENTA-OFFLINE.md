# Venta sin conexión en Go Admin Desktop (fase 4B)

Estado: implementado (ROADMAP-DESKTOP §Fase 4, puntos 3, 5 y 7 hechos; punto 4
quedó parcial aquí —outbox por venta, sin RPC atómica— y se completó el
2026-09-21 en la fase 4E: `docs/desktop/FASE-4E-CHECKOUT-ATOMICO.md`. El
camino de N inserts descrito abajo sigue en el código como respaldo cuando la
RPC `pos_checkout_v1` no existe en el entorno). Cierra el hallazgo 1.8 de
`docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` ("la cola de acciones no es
transaccional") para el POS. Depende de la impresión local (fase 4, punto 1:
`docs/desktop/IMPRESION-LOCAL-DESKTOP.md`).

## Problema

`POSService.checkout` hace N inserts secuenciales (`sales`, `sale_items`,
`invoice_sales`, `payments`, `invoice_items`, `accounts_receivable`, `tips`,
`commissions`, stock). Sin red, el interceptor de `config.ts` encolaba cada
petición HTTP suelta y devolvía `202` con `data: null`: el POS no recibía el id
de la venta, la cadena venta → líneas → pagos se rompía en el segundo paso, se
sincronizaba una venta vacía y a los 5 reintentos `syncQueue()` la borraba en
silencio.

## Qué cambia

Dentro de Go Admin Desktop y **sin conectividad real** (health-check del
proceso principal, no `navigator.onLine`), el POS no intenta escribir en
Supabase: guarda la venta como **un sobre completo** en un outbox local y la
reproduce **con el mismo código de checkout** cuando vuelve la red. Fuera del
Desktop no cambia nada.

```
CheckoutDialog (Desktop)                          POSService.checkout
────────────────────────                          ───────────────────
saleId = crypto.randomUUID()                      shouldCheckoutOffline()?
createdAt = ahora                                   │
   └ POSService.checkout({...})  ───────────────────┤
                                                    ├─ no → flujo de siempre; `sales.id = saleId`,
                                                    │       `sale_date/created_at = createdAt`
                                                    └─ sí → checkoutOffline():
                                                            enqueueOfflineSale() → IndexedDB `goadmin-outbox`
                                                            removeCart() (misma emisión a la pantalla del cliente)
                                                            devuelve Sale provisional { id: saleId,
                                                              status: 'pending_sync', sale_number: 'OFF-<suc>-<n>' }
   ├ PrintJobsService.enqueueSaleTicket({ saleNumber: 'OFF-7-3 (Pendiente de sincronizar)' })
   │     → printRaw por IPC (ya imprime sin red)
   └ recibo en pantalla con «Pendiente de sincronizar · OFF-7-3»

Al volver la red (onDesktopConnectivity) o al abrir el POS con red:
salesSync.syncPendingSales()
   └ por cada sobre `pending` en orden de created_at:
        POSService.checkout({ ...sobre, saleId, createdAt, userId, replayFromOutbox: true })
        éxito → 'synced' (7 días) · error → attempts++, backoff · 5 fallos → 'needs_review'
```

## Piezas

| Capa | Archivo | Papel |
|---|---|---|
| Tipos | `src/components/pos/types.ts` | `CheckoutData.saleId/createdAt/userId/replayFromOutbox`; `Sale.status` admite `pending_sync`, `Sale.pending_sync`, `Sale.receipt_number_local`. |
| Outbox | `src/lib/offline/salesOutbox.ts` | IndexedDB `goadmin-outbox`, store `sales` (`id` = saleId). `enqueueOfflineSale`, `listOutboxSales`, `updateOutboxSale`, `pruneSyncedSales`, `nextLocalReceiptNumber`, `ticketSaleNumber`, `shouldCheckoutOffline`. No importa Supabase. |
| Sincronización | `src/lib/offline/salesSync.ts` | `syncPendingSales` (una sola a la vez: llamadas concurrentes comparten la promesa), `retryOutboxSale`, `startSalesSync` (arranque + `onDesktopConnectivity`), backoff 30 s → 1 → 2 → 4 min, tope 10 min. |
| Checkout | `src/lib/services/posService.ts` | Rama offline al inicio de `checkout`; `sales.insert` con id/fecha del cliente; idempotencia por id (SELECT previo + 23505) y `childExists()` por `sale_id` antes de cada bloque hijo. `checkoutOffline()` privado. |
| Interceptor | `src/lib/utils/offlineCache.ts` | `SALE_TABLES_NOT_QUEUED`: `sales`, `sale_items`, `invoice_sales`, `invoice_items`, `payments`, `accounts_receivable`, `tips`, `commissions` **nunca** van a `action-queue`; sin red devuelven 503 `OFFLINE_SALE_TABLE` en vez de 202 con `data: null`. Cinturón y tirantes: el checkout offline no emite ningún fetch. |
| UI | `src/components/pos/CheckoutDialog.tsx` | Genera `saleId`/`createdAt` solo en Desktop; ticket con número local + «Pendiente de sincronizar»; recibo en pantalla marcado; sin red no intenta envío a domicilio ni Factus (avisa). |
| UI | `src/components/pos/VentasPendientesDialog.tsx` | Bandeja en la cabecera del POS (junto a «Cerrar Caja», solo Desktop): pendientes, en revisión (con error), sincronizadas de los últimos 7 días; «Reintentar», «Exportar sobre» (JSON), «Sincronizar ahora». |
| UI | `src/components/app-layout/OfflineIndicator.tsx` | Banner: «N ventas pendientes de sincronizar» y «N ventas requieren revisión». |
| POS | `src/app/app/pos/page.tsx` | `startSalesSync()` al montar; renderiza la bandeja. |

## Sobre (`OutboxSaleRecord`)

```ts
{
  id: saleId,                       // UUID v4 de crypto.randomUUID()
  envelope: {
    checkout: CheckoutData,         // tal cual lo construyó el POS (+ saleId, createdAt, userId)
    totals: { subtotal, tax_total, discount_total, total, total_paid, change },
    organization_id, branch_id, user_id,
  },
  created_at, updated_at,           // ISO; created_at ordena la reproducción
  status: 'pending' | 'syncing' | 'synced' | 'needs_review',
  attempts, last_error, next_attempt_at,
  receipt_number_local: 'OFF-<sucursal>-<n>',   // contador en localStorage por org:sucursal
  synced_at,
}
```

## Idempotencia

- `sales.id` es `uuid` (verificado por MCP): el insert usa el id del cliente.
- Antes de insertar, `checkout` hace `SELECT sales WHERE id = saleId AND
  organization_id = <org>`. Si existe, entra en modo **completar**: cada
  bloque hijo consulta si ya tiene filas y solo inserta lo que falta.
- Si dos reproducciones compiten y el insert devuelve `23505`, se relee la
  venta y se sigue en modo completar.
- Tablas hijas que dependen de `sales.id` (FK verificadas por MCP):
  `sale_items`, `invoice_sales`, `accounts_receivable`, `tips`,
  `kitchen_tickets`, `returns`, `memberships`, `table_sessions`,
  `trip_tickets`, `web_orders`, `coupon_redemptions`. `payments` y
  `commissions` referencian por `source`/`source_id` (texto);
  `stock_movements` por `source='sale'`, `source_id`.
- Ninguna de esas tablas tiene UNIQUE fuera de su PK: un reintento parcial no
  choca con restricciones, por eso hay que comprobar antes de insertar.

| Bloque | Cómo se detecta que ya se hizo |
|---|---|
| `sales` | SELECT por id + organización (o 23505) |
| `commissions` | `source_type='sale' AND source_id=<venta>` |
| `sale_items` | `sale_id=<venta>` |
| stock (`decrement_stock_with_recipe`) + seriales | `stock_movements.source='sale' AND source_id=<venta>` |
| `invoice_sales` | por `sale_id` + organización; se reutiliza (no consume otro consecutivo) |
| `payments` | se cuentan los existentes por `source`/`source_id` y se insertan solo los que faltan, en el mismo orden |
| `invoice_items` | `invoice_id=<factura>` |
| `accounts_receivable` | `sale_id=<venta>` |
| `tips` | `sale_id=<venta>` |

Fuera del modo completar (venta nueva o navegador) no se hace ninguna
consulta extra: `childExists()` devuelve `false` sin ir a la BD.

## Límites del respaldo de N inserts (resueltos por la RPC atómica de la fase 4E)

- **No es atómico.** Una reproducción puede morir a mitad (cierre de la app,
  red que se va). El reintento completa lo que falta; entre medias la venta
  puede verse en Supabase sin pagos o sin factura durante minutos.
- **Uso de promociones** (`increment_promotion_usage`): no se cuenta al
  completar una venta existente, porque no hay forma de saber si ya se contó.
  Estadística, no dinero.
- **Seriales** van atados al descuento de stock: si el stock se descontó y los
  seriales no, el reintento no los marca vendidos.
- **Pagos**: el reintento asume que los ya insertados son los primeros de la
  lista (se insertan en orden). Si un intento anterior insertó, por ejemplo,
  el segundo pero no el primero —imposible con el código actual, que aborta
  al primer error—, el conteo no lo detecta.
- **Cobro de deudas** (`cart.sale_id` + `cart.invoice_id`) actualiza una venta
  que ya está en la BD: sin red se rechaza con un error claro y no se guarda.
- **Envío a domicilio propio y factura electrónica** no se crean sin red; el
  POS avisa y hay que hacerlos desde su módulo cuando la venta esté
  sincronizada.
- **Consecutivo fiscal**: `OFF-<suc>-<n>` es solo un número local. El
  consecutivo real (`invoice_sales.number`) se asigna al reproducir, así que
  el orden de los consecutivos puede no coincidir con el orden de las ventas.
- **Auditoría de `print_jobs`** sigue yendo por la cola HTTP genérica (no es
  tabla de venta). Con WiFi enlazado y sin internet queda un `console.warn`
  (ver IMPRESION-LOCAL-DESKTOP.md).
- **Usuario**: `sales.user_id` es el cajero del sobre; `created_by` de
  factura/pagos/comisión es quien sincroniza (normalmente el mismo equipo y
  usuario).
- Los sobres `synced` se purgan a los 7 días. `pending`, `syncing` y
  `needs_review` **nunca** se borran por código.

## Cómo probar (criterio de aceptación del roadmap)

1. Con red, abrir caja y asignar una impresora a `cashier`.
2. Apagar el WiFi (o desconectar el router). El banner pasa a «Sin conexión».
3. Cobrar 10 ventas: cada una cierra el carrito, muestra «Pendiente de
   sincronizar · OFF-<suc>-<n>» y el ticket sale con `Venta: #OFF-<suc>-<n>
   (Pendiente de sincronizar)`. El botón «Sin conexión» de la cabecera marca
   10.
4. Cerrar la app y volver a abrirla **todavía sin internet**: el botón sigue
   en 10 y la bandeja lista las 10 con sus importes (IndexedDB persiste).
5. Encender el WiFi. Al detectarse la red (`connectivity:state`) se
   reproducen en orden; la bandeja las va pasando a «Sincronizada».
6. Verificar en Supabase (solo SELECT):

```sql
select id, sale_date, created_at, total, status
from sales
where organization_id = <org> and branch_id = <sucursal>
  and created_at >= now() - interval '1 hour'
order by created_at;
-- 10 filas, ids iguales a los de la bandeja (Exportar sobre → "id"), sin repetidos.

select s.id, count(si.id) items, count(distinct i.id) facturas, count(distinct p.id) pagos
from sales s
left join sale_items si on si.sale_id = s.id
left join invoice_sales i on i.sale_id = s.id
left join payments p on p.source = 'invoice_sales' and p.source_id = i.id::text
where s.organization_id = <org> and s.created_at >= now() - interval '1 hour'
group by s.id;
-- exactamente una factura por venta y tantos pagos como en el sobre.
```

7. Volver a pulsar «Sincronizar ahora» con todo ya sincronizado: no cambia
   nada (la lista de `synced` no crece, en Supabase no aparecen duplicados).
8. Provocar un fallo (p. ej. un sobre exportado y editado con un
   `customer_id` inexistente, o quitar temporalmente el permiso de insert):
   tras 5 intentos el sobre pasa a «Requiere revisión» con el error, sigue en
   la bandeja tras cerrar y abrir la app, y «Reintentar» lo vuelve a intentar.

## Tests

```bash
TZ=UTC            npx jest src/lib/offline
TZ=America/Bogota npx jest src/lib/offline
```

- `src/lib/offline/__tests__/salesOutbox.test.ts`: sobre completo, número
  local persistente, orden, contadores, purga solo de `synced`, exportación.
- `src/lib/offline/__tests__/salesSync.test.ts`: reproducción en orden con el
  mismo id, backoff, `needs_review` tras 5 fallos sin borrar, «Reintentar»,
  dos reconexiones → una sola sincronización, red caída a mitad, `syncing`
  huérfano, navegador no-op.
- `src/lib/offline/__tests__/checkoutIdempotente.test.ts`: Desktop sin red →
  cero operaciones a Supabase + outbox + carrito cerrado + número de ticket;
  navegador sin cambios; insert con id/fecha/usuario del cliente; venta
  existente → cero inserts; fallo tras `sale_items`+stock → el reintento crea
  el resto; 1 de 2 pagos → inserta solo el que falta; carrera 23505.

Datos inventados: organización 120, sucursal 7. `fake-indexeddb` para el
outbox; Supabase de mentira en `__tests__/fakeSupabase.ts`.

## Base de datos

Sin migraciones. No hizo falta ninguna columna nueva: la venta reproducida es
indistinguible de una hecha en línea salvo por `created_at`/`sale_date`, que
conservan el instante real de la venta. Si más adelante se quiere auditar
qué ventas nacieron sin red, la columna candidata es
`sales.synced_from_offline_at timestamptz null`; se decide con la RPC atómica.
