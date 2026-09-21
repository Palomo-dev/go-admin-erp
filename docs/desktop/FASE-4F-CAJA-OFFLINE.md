# Fase 4F — Caja y escrituras del POS sin internet (Go Admin Desktop)

Fecha: 2026-09-21. Roadmap: `docs/ROADMAP-DESKTOP.md` §Fase 4, punto 10. Depende
de 4B (outbox de ventas), 4C (réplica genérica: `cash_sessions`, `cash_movements`
y `payments` replicadas) y 4D (outbox de clientes).

## 1. Problema que resuelve

Hasta 4D solo la **lectura** era offline. Cualquier escritura que no fuera una
venta o un cliente caía en la cola HTTP genérica de `offlineCache.ts`, que
devolvía `202` con `data: null`:

- «Abrir caja» sin red: el `INSERT` en `cash_sessions` se encolaba, `.select().single()`
  recibía `null` y el POS creía que no había caja (o reventaba). Sin caja abierta el
  POS no cobra.
- «Ingreso/Retiro» y «Cerrar caja» sin red: lo mismo; el cierre además calculaba el
  arqueo sin las ventas hechas sin red (aún no tienen `payments`).
- Cualquier otra pantalla: el 202 hacía creer que se guardó; a los 5 reintentos la
  cola borraba la acción en silencio.

Fuera del Desktop nada cambia. Todo pasa por `shouldOperateCashOffline()`
(= `isDesktop() && !isAppOnline()`).

## 2. Esquema verificado por MCP (2026-09-21, solo SELECT)

| Tabla | `id` | `uuid` | Otras restricciones |
|---|---|---|---|
| `cash_sessions` | `integer` serial (`nextval`) | `uuid NOT NULL DEFAULT gen_random_uuid()`, UNIQUE `idx_cash_sessions_uuid` | `status IN ('open','closed')`; FK `branch_id`, `opened_by`/`closed_by` → `auth.users`, `organization_id` |
| `cash_movements` | `integer` serial | `uuid NOT NULL DEFAULT gen_random_uuid()`, UNIQUE `idx_cash_movements_uuid` | `type IN ('in','out')`; FK `cash_session_id` → `cash_sessions(id)` ON DELETE CASCADE, `user_id` → `auth.users`; `branch_id` nullable |

`cash_session_id` solo existe en `cash_movements`, `cash_counts` y `folio_items`:
**`sales` no referencia la caja**. El arqueo suma `payments` por fecha, sucursal y
cajero, así que las ventas del outbox no necesitan remapeo de sesión.

Conclusión: el cliente no puede generar `id` (serial) pero sí `uuid`, y el uuid
es UNIQUE → **idempotencia por uuid** al sincronizar. Sin migraciones.

## 3. Qué cambia

```
Sin red (Desktop)                                   Con red (o al volver)
─────────────────                                   ─────────────────────
AperturaCajaDialog → CajasService.openSession       syncOrchestrator (etapas en orden):
   └ enqueueCashSessionOpen()                         10 customers   customersSync.syncPendingCustomers
       · goadmin-outbox-cash › cash: {kind:'open'}    20 cash:openings   cashSync.syncCashOpenings
       · sesión con id NEGATIVO + uuid en el           30 sales          salesSync.syncPendingSales
         meta del catálogo local (kind cash_session)  40 cash:movements-closings
MovimientosDialog → addMovement                                        cashSync.syncCashMovementsAndClosings
   └ enqueueCashMovement()  {kind:'movement', uuid}
CierreCajaDialog → closeSession                     apertura: SELECT por uuid → INSERT con uuid → id real
   └ getCashSummary(id local)                                  en server_id; la sesión local pasa a ese id
       réplica (payments) + outbox ventas + outbox    movimiento: id real de su sesión por session_uuid
       movimientos → enqueueCashSessionClose()                  (si la apertura no entró: pending sin gastar intento)
       {kind:'close', summary}                        cierre: UPDATE cash_sessions SET status='closed' WHERE id=real
   └ la sesión queda cerrada en local                          (si ya estaba closed → hecho); se retira el estado local
```

### 3.1 Outbox de caja — `src/lib/offline/cashOutbox.ts`

IndexedDB **`goadmin-outbox-cash`**, store `cash` (índices `by_status`,
`by_session`, `by_org`). No va en `goadmin-outbox` porque ese archivo lo abre
`salesOutbox.openOutbox` con versión y `onupgradeneeded` fijos, y `salesOutbox.ts`
lo estaba editando otro agente en paralelo. Para fundirlos después: subir
`OUTBOX_DB_VERSION` a 3, crear el store `cash` en `openOutbox` y cambiar
`openCashOutbox()` por `openOutbox()` (los datos existentes se migran leyendo
`goadmin-outbox-cash` una vez).

Registro (`CashOutboxRecord`):

```ts
{
  id,                 // uuid del cliente (será cash_sessions.uuid / cash_movements.uuid); close: `close:<session_uuid>`
  kind: 'open' | 'movement' | 'close',
  organization_id, branch_id,
  session_uuid,       // sesión a la que pertenece
  session_local_id,   // negativo si nació sin red; real si la sesión ya existía
  seq,                // orden de reproducción (contador en localStorage)
  status: 'pending' | 'syncing' | 'synced' | 'needs_review',
  attempts, last_error, next_attempt_at, synced_at,
  server_id,          // id real en Supabase tras sincronizar
  payload,            // open: opened_by, opened_at, initial_amount, notes
                      // movement: type, concept, amount, user_id, notes, created_at
                      // close: closed_by, closed_at, final_amount, difference, notes, summary (CashSummary), summary_partial
}
```

Reglas: nunca se borra por fallos (`MAX_ATTEMPTS = 5` → `needs_review`); los
`synced` se purgan a los 7 días; no importa Supabase.

**Ids locales.** `nextLocalCashSessionId()` y `nextLocalCashMovementId()` devuelven
enteros **negativos** persistentes por equipo (`localStorage`). El POS opera con
ese id (`cashSession.id < 0`), `getSessionById(-n)` lo resuelve en local y
`getSessionMovements(-n)` lee solo el outbox. Al sincronizar la apertura, el
registro `open` guarda `server_id` y la sesión local pasa a tener ese id; los
movimientos y el cierre nunca guardan el id real por adelantado: lo resuelven en
el momento por `session_uuid` (`cashSync.resolveSessionServerId`).

**Estado local de «caja abierta».** `putLocalCashSession` escribe la sesión en el
store `meta` del catálogo local (`catalogStore.putCatalogMeta`, kind
`cash_session`, clave `cash_session:<org>:<uuid>`), con `closed_locally` cuando el
cierre está en el outbox. `getCatalogStatus` ignora estas entradas.

### 3.2 `CajasService` (`src/components/pos/cajas/CajasService.ts`)

| Método | Sin red (Desktop) |
|---|---|
| `getActiveSession` | 1) réplica (`findActiveSessionRemote`, el GET se resuelve en 4C) salvo que esa sesión esté **cerrada localmente**; 2) estado local (`getLocalOpenCashSession`, mismas reglas de alcance: modo `user` → cajero+sucursal; modo `branch` → sucursal, luego global). Si el estado local tiene id positivo y la réplica ya conoce esa sesión, manda la réplica y el estado local se retira. |
| `openSession` | Comprueba duplicados en la réplica (descartando cerradas localmente) y en el estado local → `enqueueCashSessionOpen`. Devuelve la sesión con `id < 0`, `uuid`, `pending_sync: true`. |
| `addMovement` | `enqueueCashMovement` sobre la sesión activa (local o replicada). `id < 0`, `uuid`, `pending_sync`. |
| `getSessionMovements` | Desktop siempre: réplica/Supabase + movimientos del outbox de esa sesión (por id local/real y por uuid), deduplicados por `uuid`. Con id negativo, solo outbox. Sin réplica de `cash_movements` → solo outbox con aviso. |
| `getCashSummary` | Misma fórmula de siempre sobre la réplica (`payments`, `returns`, `folio_items`); si `payments` no está replicada, sigue con `[]` y marca `lastSummaryWasPartial`. En Desktop (con o sin red) suma además las **ventas del outbox** (`outboxSalesDeltas` + `applyOutboxSalesToSummary`): efectivo menos vuelto, por método, `expected_amount`, `sales_total`, con el mismo alcance (sucursal de la sesión o global, `opened_at`..`closed_at`/ahora, cajero en modo `user`). |
| `closeSession` | Resumen anterior → `enqueueCashSessionClose` con `final_amount`, `difference` y el `summary` completo (auditoría). Marca la sesión cerrada en local; `getActiveSession` devuelve `null` aunque la réplica siga en `open`. |
| `getSessionById` | Id negativo → estado local. |
| `closeSession` con red | Igual que antes; además retira el estado local de esa sesión si existía. |

`CashSession.pending_sync` y `CashMovement.pending_sync`/`uuid` se añadieron a
`cajas/types.ts`. Los tres diálogos (`AperturaCajaDialog`, `CierreCajaDialog`,
`MovimientosDialog`) y el POS avisan «… sin conexión · pendiente de sincronizar».
El POS relee la caja activa con `goadmin:cash-outbox-changed`.

### 3.3 Sincronización — `src/lib/offline/cashSync.ts`

- `syncCashOpenings()` (etapa 20) y `syncCashMovementsAndClosings()` (etapa 40);
  `syncPendingCash()` hace todo en orden (bandeja, tests). Una sola pasada a la vez.
- Apertura: `SELECT id, status FROM cash_sessions WHERE organization_id = ? AND uuid = ?`;
  si no existe, `INSERT` con `uuid`, `organization_id`, `branch_id`, `opened_by`,
  `opened_at` (instante real), `initial_amount`, `notes`, `status='open'`; `23505` →
  releer por uuid. Actualiza `server_id` y la sesión local (id real).
- Movimiento: `SELECT id FROM cash_movements WHERE uuid = ?`; `INSERT` con `uuid`,
  `cash_session_id` real, `branch_id`, `created_at` real. Si la apertura no está
  sincronizada → `pending` con «Esperando a que se sincronice la apertura de la
  caja» **sin consumir intentos**.
- Cierre: `SELECT status` por id real; si no está `closed`, `UPDATE` con
  `closed_at`, `closed_by`, `final_amount`, `difference`, `notes`, `status='closed'`.
  Luego `removeLocalCashSession`.
- Backoff 30 s → 1 → 2 → 4 min (tope 10), 5 fallos → `needs_review` con
  `last_error`. «Reintentar» pone el registro en `pending` con intentos a cero y
  reproduce **todo** el outbox de caja en orden sin backoff.

La `difference` del cierre es la calculada sin red (contado − esperado con réplica +
outbox). No se recalcula al sincronizar: es lo que el cajero contó contra lo que el
equipo sabía. `summary_partial` queda en el payload si faltaba la réplica de pagos.

### 3.4 Orquestador — `src/lib/offline/syncOrchestrator.ts` + `syncStages.ts`

`registerSyncStage(name, run, order)` / `runSyncStages({ force })` /
`startSyncOrchestrator()` (conectividad real del Desktop). Etapas en serie por
`order`; una etapa que lanza no detiene a las demás; una sola ejecución a la vez y
una pasada extra si llega otra petición en medio.

`syncStages.registerDefaultSyncStages()` registra:

| order | name | run |
|---|---|---|
| 10 | `customers` | `customersSync.syncPendingCustomers` |
| 20 | `cash:openings` | `cashSync.syncCashOpenings` |
| 30 | `sales` | `salesSync.syncPendingSales` |
| 40 | `cash:movements-closings` | `cashSync.syncCashMovementsAndClosings` |

`startOfflineSync()` (POS al montar) registra y arranca. `startSalesSync()` sigue
existiendo: ambas vías comparten las promesas en vuelo de cada módulo. Si
`salesSync` quiere registrarse a sí mismo, la línea es
`registerSyncStage('sales', (o) => syncPendingSales({ force: o.force, now: o.now }), 30)`
(registrar el mismo nombre sustituye).

### 3.5 Cola HTTP honesta — `src/lib/utils/offlineCache.ts`

Para escrituras REST sin red (`POST/PATCH/PUT/DELETE` a `/rest/v1/<tabla>`):

| Tabla | Respuesta |
|---|---|
| `OUTBOX_TABLES_NOT_QUEUED` = ventas (4B: `sales`, `sale_items`, `invoice_sales`, `invoice_items`, `payments`, `accounts_receivable`, `tips`, `commissions`) + `customers` + `cash_sessions` + `cash_movements` | **503** `OFFLINE_OUTBOX_TABLE`. Nunca se encola: su outbox es el POS. |
| `QUEUEABLE_OFFLINE_WRITE_TABLES` = `product_favorites`, `category_favorites`, `print_jobs` | **202** y `action-queue`, como antes: reproducibles tal cual, la UI no necesita el id devuelto (favoritos = insert/delete idempotentes; `print_jobs` = auditoría de una impresión que ya salió por IPC). |
| Cualquier otra | **503** `OFFLINE_WRITE_REQUIRES_NETWORK` con `message` «Sin conexión: esta acción requiere internet» en la raíz del cuerpo (es lo que `supabase-js` devuelve como `error.message`) y evento `goadmin:offline-write-rejected`. Nada se encola. |

`OfflineIndicator` escucha el evento y muestra un `toast.error` (uno por tabla cada
5 s) con «Nada se guardó. Vuelve a intentarlo cuando regrese la conexión.».

GET, HEAD y RPC no cambian (4A/4C).

### 3.6 Banner y bandeja

- `src/lib/offline/outboxCounts.ts`: `getOutboxCounts()` (tres outboxes) y
  `pendingLabel` / `reviewLabel` → «2 ventas · 1 cliente · 3 movimientos de caja
  pendientes de sincronizar». `OfflineIndicator` lo usa y se refresca con
  `goadmin:{sales,customers,cash}-outbox-changed`.
- `src/components/pos/PendientesSinConexionDialog.tsx` sustituye a
  `VentasPendientesDialog` (que ahora solo reexporta) con la misma UX: ventas,
  clientes y caja en una lista homogénea (pendientes / en revisión / sincronizados
  7 días), «Reintentar» por fila (`retryOutboxSale` / `retryOutboxCustomer` /
  `retryCashOutboxRecord`), «Exportar» (JSON íntegro) y «Sincronizar ahora» =
  `runSyncStages({ force: true })`.

## 4. Archivos

| Archivo | Papel |
|---|---|
| `src/lib/offline/cashOutbox.ts` | Outbox de caja, ids locales, estado local de sesión, deltas de ventas del outbox para el arqueo. |
| `src/lib/offline/cashSync.ts` | Reproducción apertura → movimientos → cierre, idempotente por uuid, remapeo de id. |
| `src/lib/offline/syncOrchestrator.ts` | `registerSyncStage` / `runSyncStages` / `startSyncOrchestrator`. |
| `src/lib/offline/syncStages.ts` | Etapas por defecto (10/20/30/40) y `startOfflineSync`. |
| `src/lib/offline/outboxCounts.ts` | Conteos y textos del banner. |
| `src/lib/offline/catalogStore.ts` | `CatalogMetaEntry`, `putCatalogMeta` / `getCatalogMeta` / `listCatalogMeta` / `deleteCatalogMeta`; `getCatalogStatus` ignora las entradas genéricas. |
| `src/lib/utils/offlineCache.ts` | `OUTBOX_TABLES_NOT_QUEUED`, `QUEUEABLE_OFFLINE_WRITE_TABLES`, `offlineWriteRejected`, 503 honesto. |
| `src/components/pos/cajas/CajasService.ts` | Ramas sin red (§3.2); además se tiparon los `any` que tenía (`SessionSaleRow`, refs de facturas/ventas/cartera). |
| `src/components/pos/cajas/types.ts` | `pending_sync` en `CashSession` y `CashMovement`; `CashMovement.uuid`. |
| `src/components/pos/cajas/{Apertura,Cierre,Movimientos}Dialog.tsx` | Avisos «sin conexión · pendiente de sincronizar»; limpieza de lint. |
| `src/components/pos/PendientesSinConexionDialog.tsx`, `VentasPendientesDialog.tsx` | Bandeja unificada (la vieja reexporta). |
| `src/components/app-layout/OfflineIndicator.tsx` | Conteos por tipo y toast del 503. |
| `src/app/app/pos/page.tsx` | `startOfflineSync()`, relectura de caja por evento, bandeja nueva, toasts. |

Sin migraciones de base de datos.

## 5. Límites conocidos

- **Arqueos (`cash_counts`)** y **consumos de habitación (`folio_items`)** no tienen
  outbox: sin red responden 503 honesto. El cierre sin red no crea `cash_counts`.
- **Modo `user` sin réplica de `organization_settings`**: `getCashSessionMode` cae a
  `branch` si no puede leer la configuración; con la réplica de 4C normalmente sí
  puede.
- **Cierre sin réplica de `payments`** (equipo que nunca replicó): el esperado solo
  cuenta el inicial + outbox + movimientos; queda `summary_partial: true` en el
  payload y la bandeja lo muestra.
- **Sesión abierta con red y cerrada sin red**: hasta que sincronice, otros equipos
  la siguen viendo abierta (es correcto: el cierre no ha llegado). Este equipo puede
  abrir otra sin red, que se sincroniza después; si mientras tanto otro equipo cerró
  la primera en línea, el cierre pendiente encuentra `closed` y se da por hecho.
- **`cash_sessions` abierta sin red en dos equipos de la misma sucursal**: no hay
  UNIQUE en Postgres que lo impida (tampoco con red). La sincronización insertará
  las dos.
- El outbox de caja vive en su propia base (`goadmin-outbox-cash`), ver §3.1.
- `print_jobs` sigue en la cola genérica: a los 5 fallos `syncQueue` la descarta
  (auditoría, no dinero).

## 6. Cómo probar (Desktop)

1. Con red: abrir el POS, esperar «datos locales actualizados hh:mm».
2. Apagar el WiFi → banner «Sin conexión».
3. «Abrir Caja» (inicial 100.000) → toast «Caja abierta sin conexión · pendiente de
   sincronizar». Botón «Sin conexión» de la cabecera: 1. DevTools → IndexedDB →
   `goadmin-outbox-cash › cash`: registro `open`; `goadmin-catalog › meta`: entrada
   `cash_session:<org>:<uuid>` con `id` negativo.
4. Registrar un ingreso de 20.000 y un retiro de 5.000 (Movimientos de caja).
5. Cobrar dos ventas en efectivo (una con vuelto). Bandeja: 1 apertura, 2
   movimientos, 2 ventas pendientes; banner «2 ventas · 3 movimientos de caja
   pendientes de sincronizar».
6. «Cerrar Caja»: el esperado = 100.000 + efectivo de las ventas − vuelto + 20.000 −
   5.000. Contar y cerrar → «Caja cerrada sin conexión». El botón vuelve a «Abrir
   Caja». Cerrar y reabrir la app sin red: sigue sin caja abierta y la bandeja
   conserva todo.
7. Encender el WiFi. Orden en la bandeja: apertura → ventas → movimientos → cierre.
   Solo SELECT:

```sql
select id, uuid, status, opened_at, closed_at, initial_amount, final_amount, difference
from cash_sessions where organization_id = <org> and opened_at >= now() - interval '1 day'
order by opened_at;
-- una fila, uuid igual al de la bandeja, status closed, difference = la del cierre sin red.

select m.id, m.uuid, m.cash_session_id, m.type, m.concept, m.amount, m.created_at
from cash_movements m join cash_sessions s on s.id = m.cash_session_id
where s.organization_id = <org> and s.opened_at >= now() - interval '1 day' order by m.created_at;
-- dos filas con los uuid de la bandeja, cash_session_id = el id real.
```

8. «Sincronizar ahora» de nuevo: nada cambia (idempotente por uuid).
9. Sin red, desde Proveedores intentar crear uno: toast «Sin conexión: esta acción
   requiere internet», sin fila fantasma ni «acción pendiente» en el banner.

## 7. Tests

```bash
TZ=UTC            npx jest src/lib/offline src/__tests__/pos-display src/__tests__/guardrails.test.ts
TZ=America/Bogota npx jest src/lib/offline src/__tests__/pos-display src/__tests__/guardrails.test.ts
```

- `src/lib/offline/__tests__/cashOutbox.test.ts`: apertura sin red (id negativo,
  uuid, cero escrituras a Supabase, caja activa), duplicados, alcance del estado
  local (sucursal/global/modo `user`), réplica vs local, movimientos (ids, listado,
  resumen), cierre con ventas del outbox (efectivo, vuelto, por método, otra
  sucursal fuera), sesión de réplica cerrada sin red, deltas puros, purga solo
  `synced`, `getCatalogStatus` limpio, navegador/red sin outbox.
- `src/lib/offline/__tests__/cashSync.test.ts`: INSERT con uuid y remapeo de id,
  idempotencia por uuid y carrera 23505, movimientos/cierre que esperan a la
  apertura sin gastar intentos, orden de escritura, cierre ya `closed`, sesión
  con id real, 5 fallos → `needs_review`, backoff, «Reintentar», sin red,
  concurrencia.
- `src/lib/offline/__tests__/syncOrchestrator.test.ts`: orden por `order`,
  opciones, fallo aislado, sustitución/baja, una ejecución a la vez + repasada,
  arranque por conectividad, etapas por defecto 10/20/30/40.
- `src/lib/offline/__tests__/queueHonesta.test.ts`: 503 `OFFLINE_OUTBOX_TABLE`,
  503 `OFFLINE_WRITE_REQUIRES_NETWORK` con `message` y evento, 202 solo para las
  tablas reproducibles, GET/RPC intactos, textos y conteos del banner.
- `offlineHook.test.ts` (4C) se actualizó al contrato honesto.

Datos inventados: organización 120, sucursal 7. `fake-indexeddb`; Supabase de
mentira de `__tests__/fakeSupabase.ts` (ahora con `is/neq/gte/lte`).
