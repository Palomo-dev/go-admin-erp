# Inventario Fase C — presentación de fechas sin zona horaria

> Triaje para los constructores de la Fase C. **Este documento no cambia código.**
> Fecha: 2026-09-23. Rama `main`. Reglas: `docs/reglas-fechas-timezone.md`.
> Escrituras (Fase B): `docs/inventario-fase-B-escrituras.md`.

## 0. Recuento verificado

| Grupo | Comando | Resultado |
|---|---|---:|
| **C1** `toLocaleDateString(` / `toLocaleTimeString(` sin `timeZone` | `grep -rn "toLocaleDateString(\|toLocaleTimeString(" src --include=*.ts --include=*.tsx \| grep -v timeZone \| wc -l` | **156** |
| **C2** `parseLocalDate` (helper deprecado) | `grep -rn "parseLocalDate" src --include=*.ts --include=*.tsx \| wc -l` | **68** |
| **C3** imports de `formatDate`/`parseLocalDate` desde `@/utils/Utils` | `grep -rn "from '@/utils/Utils'" src ... \| grep -c "formatDate\|parseLocalDate"` | **60** |

Los tres grupos **se solapan**: un archivo puede importar `formatDate` (C3), llamar
`parseLocalDate` (C2) y además tener un `.toLocaleDateString()` suelto (C1). Trabajo real
distinto en cada grupo:

| Grupo | Qué hay que tocar | Cantidad real |
|---|---|---:|
| C1 | llamadas a `toLocaleDateString`/`toLocaleTimeString` sin `timeZone` | **156** en **110** archivos |
| C2 | **33** llamadas reales a `parseLocalDate(...)` en **19** archivos. El resto del conteo son 13 líneas del test `parseLocalDateBug.test.ts`, 3 líneas del propio `src/utils/Utils.ts`, 1 comentario en `dateDisplay.ts` y 18 líneas de `import` | **33** |
| C3 | **79** llamadas a `formatDate(...)` en **47** archivos + los **60** `import` que hay que reescribir | **79** + 60 |

Sin solapamientos, el trabajo de la Fase C son **~268 llamadas** en **~140 archivos**,
más 60 líneas de `import`.

### Reparto cliente / servidor de C1

| Tipo | Archivos | Ocurrencias | Qué significa para el arreglo |
|---|---:|---:|---|
| Componente cliente (`'use client'`) | 105 | 150 | `useFormatDate(branchId?)` directo. |
| Route handler (`src/app/api/**`) | 3 | 3 | **No hay hooks.** La zona sale de `getServerOrgContext()` + `getOrganizationTimezone(orgId)` (o `fn_timezone_for`). |
| Servicio sin `'use client'` | 2 | 3 | `posService.ts`, `supplierService.ts`: la zona entra por parámetro. |

Dos módulos de `src/lib/services/` **sí** llevan `'use client'` (`pdfService.ts`,
`parkingTicketService.ts`, 2 ocurrencias cada uno) pero **no son componentes React**: no
pueden usar el hook. La zona tiene que entrar por parámetro desde quien los llama.

Los 60 archivos del grupo C3 son todos componentes cliente salvo
`src/components/finanzas/cuentas-por-cobrar/service.ts` (sin directiva, importado desde
cliente).

---

## 1. NO TOCAR: `toLocaleString(` de números y moneda

```
grep -rn "toLocaleString(" src --include=*.ts --include=*.tsx | wc -l   →  353
```

De esas **353**:

| Clase | Cantidad | Acción |
|---|---:|---|
| **Números y moneda** (`amount.toLocaleString('es-CO')`, `credits.toLocaleString()`, `total.toLocaleString('es-ES', { minimumFractionDigits: 0 })`) | **250** | **NO TOCAR.** No tienen nada que ver con zonas horarias. Añadirles `timeZone` no haría nada y tocarlas solo genera ruido en el diff. |
| Fecha/hora (`new Date(x).toLocaleString(...)`) sin `timeZone` | **99** | Arreglar igual que C1. |
| Fecha/hora que **ya** llevan `timeZone` | **4** | Ya correctas. |

Ejemplos de los que **no** se tocan, para que queden reconocibles:

- `src/app/app/hrm/empleados/[id]/page.tsx:628,631,634,691,694` — `gross_pay`, `net_pay`, `balance`.
- `src/app/app/inventario/productos/importar/page.tsx:343,345,2110,2111` — precios y costos.
- `src/app/app/parking/operacion/page.tsx:440,458,498` — importes de cobro.
- `src/app/app/parking/sesiones/[id]/page.tsx:186,240,293` — importes del tiquete.
- `src/app/api/stripe/purchase-ai-credits/route.ts:130,131` — cantidad de créditos.
- `src/components/pm/TaskCreationPanel.tsx:867` — `$${s.total.toLocaleString('es-ES', …)}`.
  Ojo: **en la línea 868 del mismo archivo** hay un `toLocaleDateString` que sí hay que
  arreglar. Son vecinas; no confundirlas.

Regla mecánica para el revisor: si el receptor es un `number`, es dinero o cantidad y no
se toca. Si el receptor es un `Date`, es fecha y entra en la fase.

---

## 2. Por qué `formatDate`/`parseLocalDate` de `@/utils/Utils` están mal

```ts
// src/utils/Utils.ts:44
export function parseLocalDate(dateString: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return new Date(dateString + 'T00:00:00');
  const dateOnly = dateString.split('T')[0];            // ← descarta el offset
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return new Date(dateOnly + 'T00:00:00');
  return new Date(dateString);
}
// src/utils/Utils.ts:103
export function formatDate(date, locale = 'es-ES') { … parseLocalDate(date) … Intl.DateTimeFormat(locale, {…}) }
```

Dos comportamientos distintos según el tipo de la columna:

| Tipo de la columna | Qué hace `formatDate`/`parseLocalDate` | Veredicto |
|---|---|---|
| **`date`** (`'2026-09-23'`) | Le pega `T00:00:00`, lo interpreta en la hora local del navegador y lo formatea en local. El día sale correcto **por construcción**. | Equivale a `formatPlainDate`. Reemplazo **sin cambio visible**. |
| **`timestamptz`** (`'2026-09-23T01:30:00+00:00'`) | `split('T')[0]` se queda con el **día UTC** y tira la hora y el offset. | **Bug.** Un pago de las 20:30 en Bogotá se muestra al día siguiente. Prohibido por la regla 4. |

Y hay un tercer caso, peor: `parseLocalDate` seguido de `toLocaleTimeString`. Como
`parseLocalDate` borra la hora, **el reloj siempre marca 00:00**:

- `src/components/finanzas/facturas-compra/id/HistorialPagos.tsx:204` —
  `parseLocalDate(pago.created_at).toLocaleTimeString('es-CO', { hour, minute })` sobre un
  `timestamptz`. Siempre imprime `12:00 a. m.`. Es un bug visible hoy, no solo un riesgo
  multi-país.

---

## 3. Resumen por módulo y prioridad

### 3.1 Grupo C1 (156)

| Módulo | Archivos | Ocurrencias | ¿hay `branch_id` en el objeto pintado? |
|---|---:|---:|---|
| checkout / POS | 17 | 21 | sí en `sales`, `web_orders`, `restaurant_reservations`, `carts`; no en `coupons`, `promotions` |
| CRM / chat | 10 | 19 | no (`customers`, `conversations`, `messages` no llevan `branch_id`) |
| organización / cuenta | 11 | 16 | no |
| cuentas por cobrar | 7 | 16 | **sí** (`accounts_receivable.branch_id`, `payments.branch_id`) |
| contabilidad | 8 | 13 | sí en `journal_entries.branch_id`; no en `fiscal_periods` |
| parking | 11 | 12 | sí en `parking_sessions.branch_id`; **no** en `parking_passes` |
| finanzas | 9 | 11 | sí en `bank_transfers`; no en `currency_rates` (catálogo global) |
| PM / tareas | 7 | 10 | no (`tasks`, `projects`, `goals` no llevan `branch_id`) |
| otros | 6 | 8 | — |
| integraciones | 6 | 7 | no |
| notificaciones | 5 | 6 | no |
| reportes / filtros | 4 | 5 | según el KPI |
| promociones / cupones | 4 | 5 | no |
| gym | 1 | 2 | no (`gym_classes`) |
| PMS / inventario | 1 | 2 | sí (`serial_numbers.branch_id`) |
| transporte | 1 | 1 | sí (`shipments.branch_id`) |
| nómina / HRM | 1 | 1 | sí (`employments.branch_id`) |
| cuentas por pagar | 1 | 1 | sí (`invoice_purchase.branch_id`) |
| **Total** | **110** | **156** | |

### 3.2 Grupos C2 y C3

Concentrados casi por completo en **cartera**: de los 33 `parseLocalDate(...)`, **32**
están en `finanzas/cuentas-por-cobrar` y `finanzas/facturas-compra`/`facturas-venta`.
De los 79 `formatDate(...)`, 42 están en finanzas y 12 en integraciones.

| Módulo | `parseLocalDate(` | `formatDate(` | imports a cambiar |
|---|---:|---:|---:|
| cuentas por cobrar | 12 | 0 | 8 |
| cuentas por pagar / facturas de compra | 13 | 9 | 7 |
| facturas de venta | 5 | 0 | 2 |
| saldos a favor | 1 | 0 | 1 |
| ingresos / egresos / transferencias / notas crédito | 0 | 21 | 8 |
| documentos soporte / facturación electrónica | 0 | 8 | 5 |
| integraciones | 0 | 12 | 7 |
| notificaciones | 0 | 4 | 4 |
| HRM / nómina | 0 | 9 | 6 |
| chat / clientes | 0 | 7 | 5 |
| parking | 0 | 2 | 2 |
| PMS | 0 | 2 | 1 |
| reportes finanzas | 0 | 1 | 1 |
| test de regresión | 2 | 0 | 1 (no tocar) |
| **Total** | **33** | **79** | **60** |

---

## 4. Tabla C1 — `toLocaleDateString` / `toLocaleTimeString` sin `timeZone`

**Reemplazo** usa esta convención:

- `formatDate(v)` — del hook `useFormatDate(branchId?)`, para un **timestamptz**.
- `formatDateTime(v)` / `formatTime(v)` — ídem con hora.
- `formatPlain(v)` — para una columna **`date`**: no convierte.
- `formatDateInTz(v, tz)` / `formatTimeInTz(v, tz)` — en servidor o en un módulo sin hooks.
- `Intl` + `{ timeZone: tz }` — cuando hace falta un formato que `dateDisplay.ts` no cubre
  (nombre de mes largo, día de la semana).

**Zona**: `ctx` = hook sobre la organización · `ctx+branch` = `useFormatDate(row.branch_id)`
· `prop` = la zona tiene que llegar por propiedad · `srv` = `getOrganizationTimezone` en
servidor.

| Archivo:línea | Módulo | Dato pintado (tabla.columna · tipo) | Reemplazo | Cli/Srv · Zona |
|---|---|---|---|---|
| `src/app/api/facturas-venta/[id]/pdf/route.ts:114` | cuentas por cobrar | `invoice_sales.issue_date`/`due_date` · **timestamptz** | `formatDateInTz(v, tz)` | **SRV** · `srv` (`invoice_sales.branch_id` disponible en la consulta) |
| `src/app/api/pdf/invoice/route.ts:17` | cuentas por cobrar | ídem | `formatDateInTz(v, tz)` | **SRV** · `srv` |
| `src/app/api/sessions/activity/route.ts:96` | organización | etiqueta de nombre de dispositivo | `todayInTz(tz)` o dejar sin fecha | **SRV** · `srv` |
| `src/lib/services/posService.ts:1616` | checkout/POS | vencimiento escrito en `carts.notes` | `formatDateInTz(v, tz)` | servicio · **parámetro** |
| `src/lib/services/supplierService.ts:915,963` | inventario | `suppliers.created_at` · timestamptz (export CSV/XLSX) | `formatDateInTz(v, tz)` | servicio · **parámetro** |
| `src/lib/services/pdfService.ts:118,372` | finanzas | fechas de factura en PDF | `formatDateInTz(v, tz)` | `'use client'` pero **no es componente** · **parámetro** |
| `src/lib/services/parkingTicketService.ts:57,63` | parking | `parking_sessions.entry_at` · timestamptz (tiquete impreso) | `formatDateInTz` + `formatTimeInTz` | `'use client'` pero **no es componente** · **parámetro**; `parking_sessions.branch_id` existe |
| `src/components/finanzas/cuentas-por-cobrar/AplicarAbonoModal.tsx:251` | cuentas por cobrar | `accounts_receivable.due_date` · **timestamptz** | `formatDate(cuenta.due_date)` | CLI · `ctx+branch` |
| `src/components/finanzas/cuentas-por-cobrar/EnviarRecordatorioModal.tsx:32,135,153` | cuentas por cobrar | `due_date`, `last_reminder_date` · **timestamptz** (una va en el texto del correo al cliente) | `formatDate(...)` | CLI · `ctx+branch` |
| `src/components/finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx:188,539` | cuentas por cobrar | ídem | `formatDate(...)` | CLI · `ctx+branch` |
| `src/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage.tsx:85,94,118,128` | cuentas por cobrar | `due_date` timestamptz; :94 es «hoy»; :116-118 tiene una rama `dateString.includes('T') ? new Date(v) : new Date(v+'T00:00:00')` hecha a mano | `formatDate` / `getToday()`; borrar la rama manual | CLI · `ctx+branch` |
| `src/components/finanzas/cuentas-por-cobrar/id/InstallmentsCard.tsx:196` | cuentas por cobrar | `ar_installments.due_date` · **date** | `formatPlain(v)` | CLI · `ctx` |
| `src/components/finanzas/cuentas-por-cobrar/id/PaymentHistoryCard.tsx:105` | cuentas por cobrar | `payments.payment_date` · **timestamptz**; misma rama manual `+'T00:00:00'` | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/finanzas/cuentas-por-cobrar/RecordatoriosPanel.tsx:260,265,336,350` | cuentas por cobrar | `due_date`, `last_reminder_date` · timestamptz | `formatDate(...)` | CLI · `ctx+branch` |
| `src/components/finanzas/facturas-compra/id/HistorialPagos.tsx:204` | cuentas por pagar | `payments.created_at` · timestamptz — **hoy siempre imprime 00:00** (§2) | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/finanzas/contabilidad/asientos/AsientoDetailPage.tsx:161` | contabilidad | `journal_entries.entry_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/finanzas/contabilidad/asientos/AsientosPage.tsx:346` | contabilidad | ídem | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/finanzas/contabilidad/mayor-contable/MayorContablePage.tsx:192` | contabilidad | ídem | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx:182,183` | contabilidad | `fiscal_periods.start_date`/`end_date` · **date** | `formatPlain(v)` | CLI · `ctx` (sin `branch_id` en la tabla) |
| `src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx:186` | contabilidad | `fiscal_periods.closed_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx:344,347` | contabilidad | `start_date`/`end_date` · **date** | `formatPlain(v)` | CLI · `ctx` |
| `src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx:352` | contabilidad | `closed_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/finanzas/conciliacion-bancaria/ConciliacionDetailPage.tsx:120,128` | contabilidad | `bank_reconciliations.period_start`/`period_end` · **date** y timestamps | `formatPlain` / `formatDateTime` | CLI · `ctx` |
| `src/components/finanzas/conciliacion-bancaria/ConciliacionPage.tsx:62` | contabilidad | ídem | `formatPlain`/`formatDate` | CLI · `ctx` |
| `src/components/finanzas/conciliacion-bancaria/AIMatchingPanel.tsx:168` | contabilidad | fecha de movimiento bancario · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/finanzas/bancos/cuentas/CuentaDetailPage.tsx:134` | finanzas | movimientos de cuenta · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/finanzas/bancos/cuentas/MovimientosPage.tsx:109` | finanzas | ídem | `formatDate(v)` | CLI · `ctx` |
| `src/components/finanzas/monedas/ExchangeRateHistory.tsx:191` | finanzas | `currency_rates.rate_date` · **date** | `formatPlain(v)` | CLI · `ctx`; el catálogo es global |
| `src/components/finanzas/monedas/ExchangeRatesTable.tsx:944,951` | finanzas | ídem, con mes largo | `Intl` + `{ timeZone: tz }` o `formatPlain` | CLI · `ctx` |
| `src/components/finanzas/documentos-soporte/SupportDocumentForm.tsx:257` | finanzas | `invoice_purchase.issue_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx+branch` |
| `src/app/app/finanzas/metodos-pago/qr-sessions/page.tsx:79` | finanzas | `payment_qr_sessions.expires_at` · timestamptz | `formatDateTime(v)` | CLI · `ctx` |
| `src/app/app/finanzas/open-finance/consents/page.tsx:108` | finanzas | `open_finance_consents.expires_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/finanzas/payfac/dispersiones/page.tsx:110` | finanzas | `organization_payouts.period_*` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/integraciones/payfac/dispersiones/page.tsx:490,493` | finanzas | `organization_payouts.period_start`/`period_end`/`created_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/crm/clientes/[id]/page.tsx:371` | CRM | `customers.created_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/crm/clientes/[id]/page.tsx:434` | CRM | `opportunities.expected_close_date` | `formatDate(v)` | CLI · `ctx` |
| `src/components/clientes/id/CuentasTab.tsx:352` | CRM | `reservations.checkin`/`checkout` · **date** | `formatPlain(v)` | CLI · `ctx+branch` (`reservations.branch_id`) |
| `src/components/clientes/id/CuentasTab.tsx:440` | CRM | `accounts_receivable.due_date` · timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/clientes/id/ResumenTab.tsx:196` | CRM | `reservations.start_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/clientes/id/ResumenTab.tsx:246,252,265,273` | CRM | «última compra / estadía / pedido / próxima reserva» — `Date` ya construido en el estado | `formatDate(v)` | CLI · `ctx` |
| `src/components/clientes/id/ResumenTab.tsx:365` | CRM | fecha del ítem de la línea de tiempo | `formatDate(v)` | CLI · `ctx` |
| `src/components/clientes/id/TimelineTab.tsx:450,452` | CRM | `reservations.checkin`/`checkout` · **date** | `formatPlain(v)` | CLI · `ctx+branch` |
| `src/components/chat/conversations/id/ActivityList.tsx:37` | chat | `timestamp` · timestamptz, agrupador de día con `weekday` | `Intl` + `{ timeZone: tz }`; el **agrupador de día** tiene que ser `toPlainDate(v, tz)`, no la cadena formateada | CLI · `ctx` |
| `src/components/chat/conversations/id/MessageTimeline.tsx:203` | chat | `messages.created_at` · timestamptz, separador de día | `toPlainDate(v, tz)` para agrupar + `Intl` con `timeZone` para mostrar | CLI · `ctx` |
| `src/components/chat/conversations/id/MessageTimeline.tsx:306` | chat | hora del mensaje | `formatTime(v)` | CLI · `ctx` |
| `src/components/chat/inbox/MessageBubble.tsx:308` | chat | hora del mensaje | `formatTime(v)` | CLI · `ctx` |
| `src/components/chat/inbox/CustomerProfileDrawer.tsx:148` | chat | `customers.created_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/chat/inbox/CustomerProfilePanel.tsx:144` | chat | ídem | `formatDate(v)` | CLI · `ctx` |
| `src/components/app-layout/Header/assistant/ConversationHistory.tsx:67` | otros | fecha de conversación del asistente | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/pos/page.tsx:661` | checkout/POS | reloj de la barra del POS | `formatTimeInTz(currentTime, tz)` | CLI · `ctx+branch` (la caja está en una sucursal) |
| `src/components/pos/POSHome.tsx:147,172` | checkout/POS | fecha de portada y `cash_sessions.opened_at` | `Intl` con `timeZone` / `formatTime` | CLI · `ctx+branch` |
| `src/components/pos/CartTabs.tsx:313` | checkout/POS | `carts.updated_at` · timestamptz | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/CartView.tsx:1317` | checkout/POS | vencimiento calculado a partir de `paymentTerms` | `getToday()` + suma de días + `formatPlain` | CLI · `ctx+branch` |
| `src/components/pos/devoluciones/ReturnForm.tsx:305` | checkout/POS | `sales.sale_date` · timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/pos/devoluciones/TicketSearch.tsx:196` | checkout/POS | ídem | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/pos/devoluciones/ReturnsHistory.tsx:97,297,368` | checkout/POS | `return_date` · timestamptz (una va en el CSV exportado) | `formatDate(v)` | CLI · `ctx+branch` |
| `src/app/app/pos/devoluciones/page.tsx:95` | checkout/POS | «hoy» en la cabecera | `getToday()` + `formatPlain` | CLI · `ctx+branch` |
| `src/components/pos/pedidos-online/WebOrderCard.tsx:95,109` | checkout/POS | `web_orders.created_at`/`scheduled_at` · timestamptz | `formatTime` / `formatDate` | CLI · `ctx+branch` (`web_orders.branch_id`) |
| `src/components/pos/pedidos-online/OrderTimeline.tsx:33` | checkout/POS | hitos del pedido · timestamptz | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/pedidos-online/DeliveryInfo.tsx:49` | checkout/POS | ídem | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/pedidos-online/DeliveryTrackingCard.tsx:97` | checkout/POS | ídem | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/pedidos-online/AssignDeliveryDialog.tsx:290` | checkout/POS | hora estimada de llegada (ahora + N min) | `formatTime(v)` | CLI · `ctx+branch` |
| `src/app/app/pos/pedidos-online/page.tsx:1056` | checkout/POS | `web_orders.created_at` | `formatDate` + `formatTime` | CLI · `ctx+branch` |
| `src/app/app/pos/pedidos-online/[id]/components/OrderDeliveryCard.tsx:48` | checkout/POS | hitos del pedido | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/configuracion/printers/PrintAgentStatusCard.tsx:105` | checkout/POS | `last_seen_at` del agente de impresión | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/pos/cupones/CouponsList.tsx:124` y `src/app/app/pos/cupones/[id]/page.tsx:168` | cupones | `coupons.start_date`/`end_date` · **timestamptz** ⚠ escritas como día (Fase B) | `formatDate(v)` **y** arreglar la escritura en la misma tanda | CLI · `ctx` (`coupons` sin `branch_id`) |
| `src/components/pos/promociones/PromotionsList.tsx:131` | promociones | `promotions.start_date`/`end_date` · **timestamptz** ⚠ | `formatDate(v)` + escritura | CLI · `ctx` |
| `src/app/app/pos/promociones/[id]/page.tsx:154,166` | promociones | :154 timestamps reales; :166 «fecha de vigencia» — el comentario del propio archivo dice que quiere la fecha que eligió el usuario | :154 `formatDate`; :166 depende de cómo quede la escritura ⚠ | CLI · `ctx` |
| `src/components/parking/ActiveSessionsList.tsx:38` | parking | `parking_sessions.entry_at` · timestamptz | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/parking/dashboard/SesionesActivas.tsx:24` | parking | ídem | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/parking/mapa/SpaceCard.tsx:51` | parking | ídem | `formatTime(v)` | CLI · `ctx+branch` |
| `src/components/parking/TopPlatesList.tsx:28` | parking | última visita · timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/parking/dashboard/PasesPorVencer.tsx:38` | parking | `parking_passes.end_date` · **date** | `formatPlain(v)` | CLI · `ctx` (sin `branch_id`) |
| `src/components/parking/ExpiringPassesList.tsx:57` | parking | ídem | `formatPlain(v)` | CLI · `ctx` |
| `src/components/parking/reportes/RevenueChart.tsx:21` | parking | clave de periodo del reporte (`YYYY-MM-DD` o `YYYY-MM`) | `formatPlain(v)` | CLI · `ctx` |
| `src/components/parking/ParkingHeader.tsx:15`, `operacion/OperacionHeader.tsx:13`, `sesiones/SesionesHeader.tsx:21` | parking | «hoy» con día de la semana en la cabecera | `Intl` + `{ timeZone: tz }` sobre `getToday()` | CLI · `ctx+branch` |
| `src/components/pm/views/KanbanBoard.tsx:171`, `views/TaskListView.tsx:321`, `RelatedTasksList.tsx:102`, `ai/AITaskPlanner.tsx:430`, `TaskCreationPanel.tsx:1020` | PM/tareas | `tasks.due_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx` (`tasks` sin `branch_id`) |
| `src/components/pm/TaskCreationPanel.tsx:852` | PM/tareas | `reservations.checkin`/`checkout` · **date** | `formatPlain(v)` | CLI · `ctx+branch` |
| `src/components/pm/TaskCreationPanel.tsx:868` | PM/tareas | `sales.sale_date` · timestamptz. **La línea 867 vecina es un importe: no tocarla** | `formatDate(v)` | CLI · `ctx+branch` |
| `src/app/app/pm/metas/page.tsx:226` | PM/tareas | `goals.target_date` | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/pm/proyectos/page.tsx:213,214` | PM/tareas | `projects.start_date`/`end_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/inicio/page.tsx:92` | reportes | saludo «hoy» con día de la semana, ya usa `locale` de i18n | `Intl` + `{ timeZone: tz }` | CLI · `ctx` |
| `src/components/inicio/DashboardKPIs.tsx:717` | reportes | nombre del mes construido con `new Date(anio, mes-1)` — **fecha sintética, sin instante real** | `aceptable` con nota, o construir el nombre del mes sin `Date` | CLI · n/a |
| `src/components/inicio/KpiDetailDialog.tsx:249,311` | reportes | ídem | `aceptable` con nota | CLI · n/a |
| `src/components/reportes/ReporteTabla.tsx:19` | reportes | celda genérica: hace `str.includes('T') ? str : str+'T00:00:00'` a mano | `formatDate` si trae `T`, `formatPlain` si no | CLI · `ctx` |
| `src/components/reportes/chat/ChatMessage.tsx:66` | reportes | hora del mensaje del asistente | `formatTime(v)` | CLI · `ctx` |
| `src/components/notificaciones/logs/LogTable.tsx:44` | notificaciones | `delivery_logs.created_at` · timestamptz | `formatDateTime(v)` | CLI · `ctx` |
| `src/components/notificaciones/canales/CanalCard.tsx:182,188` | notificaciones | `sent_at`, `updated_at` · timestamptz | `formatDateTime` / `formatDate` | CLI · `ctx` |
| `src/components/notificaciones/plantillas/PlantillaList.tsx:107` | notificaciones | `updated_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/notificaciones/reglas/HistorialAlertasSheet.tsx:44` | notificaciones | fecha de alerta | `formatDateTime(v)` | CLI · `ctx` |
| `src/components/notificaciones/reglas/ReglaCard.tsx:53` | notificaciones | fallback de «hace N días» | `formatDate(v)` | CLI · `ctx` |
| `src/components/integraciones/conexiones/id/credenciales/CredentialsList.tsx:121,124` | integraciones | `integration_credentials.expires_at`/`rotated_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/integraciones/conexiones/id/webhooks/WebhooksList.tsx:121` | integraciones | `last_received_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/integraciones/IntegrationConnectionCard.tsx:129` | integraciones | `last_activity_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/integraciones/tripadvisor/TripAdvisorReviewsCard.tsx:154` y `TripAdvisorPublicWidget.tsx:90` | integraciones | `published_date` del proveedor externo | `aceptable` si se documenta que es el día del proveedor; si no, `formatDate` | CLI · `ctx` |
| `src/app/app/integraciones/twilio/page.tsx:320` | integraciones | `credits_reset_at` · timestamptz | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/InvitationsTab.tsx:215,216` | organización | `invitations.created_at`/`expires_at` · timestamptz (van a la tabla y al CSV) | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/MembersTab.tsx:146` | organización | `created_at` del miembro | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/PlanTab.tsx:460` | organización | fechas de suscripción | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/dominios/DomainCard.tsx:249` | organización | `verified_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/branding/BrandingPublishTab.tsx:126,299` | organización | `published_at`, `updated_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/branding/BrandingThemeTab.tsx:142` | organización | `updated_at` | `formatDate(v)` | CLI · `ctx` |
| `src/components/organization/reviews/ReviewsModerationPanel.tsx:211` | organización | `created_at` de la reseña | `formatDate(v)` | CLI · `ctx` |
| `src/components/subscription/BillingTab.tsx:176` y `CancelSubscriptionModal.tsx:30` | organización | fechas de facturación de Stripe | `formatDate(v)` | CLI · `ctx` |
| `src/app/app/plan/historial/page.tsx:259` | organización | historial de plan | `formatDate(v)` | CLI · `ctx` |
| `src/components/profile/DeviceSessions.tsx:293,300,307,311` | perfil | `last_active_at` de la sesión · timestamptz, con ramas «Hoy»/«Ayer» que comparan `toDateString()` **en la zona del navegador** | `formatTime`/`formatDate`; las comparaciones «hoy/ayer» por `toPlainDate(v, tz)` contra `getToday()` | CLI · `ctx` |
| `src/app/app/gym/reservaciones/page.tsx:392,393` | gym | `gym_classes.start_at` · timestamptz | `formatTime` + `formatDate` | CLI · `ctx` |
| `src/app/app/hrm/cargos/[id]/page.tsx:173` | HRM | fechas del cargo | `formatDate`/`formatPlain` según columna | CLI · `ctx` |
| `src/components/shared/SerialSelectorDialog.tsx:168` | inventario | `serial_numbers.received_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx+branch` |
| `src/components/shared/SerialSelectorDialog.tsx:174` | inventario | `serial_numbers.warranty_end` · **date** | `formatPlain(v)` | CLI · `ctx+branch` |
| `src/app/app/transporte/mis-envios/components/ShipmentCard.tsx:94` | transporte | `shipments.created_at` · timestamptz | `formatDate(v)` | CLI · `ctx+branch` |

---

## 5. Tabla C2 — las 33 llamadas a `parseLocalDate(...)`

| Archivo:línea | Módulo | Argumento (tabla.columna · tipo) | Reemplazo | Cli/Srv · Zona |
|---|---|---|---|---|
| `finanzas/cuentas-por-cobrar/AplicarAbonoModal.tsx:251` | AR | `accounts_receivable.due_date` · **timestamptz** | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/cuentas-por-cobrar/EnviarRecordatorioModal.tsx:32,135,153` | AR | `due_date`, `last_reminder_date` · timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx:188,539` | AR | ídem | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage.tsx:85,128` | AR | ídem | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/cuentas-por-cobrar/id/InstallmentsCard.tsx:196` | AR | `ar_installments.due_date` · **date** | `formatPlain(v)` | CLI · `ctx` |
| `finanzas/cuentas-por-cobrar/RecordatoriosPanel.tsx:260,265,336` | AR | timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/cuentas-por-cobrar/service.ts:181` | AR | `due_date` timestamptz → se usa para **calcular días de mora** | `toPlainDate(v, tz)` y restar días calendario | servicio · **parámetro** |
| `finanzas/facturas-compra/FacturasCompraTable.tsx:135,261` | AP | `invoice_purchase.due_date` timestamptz → comparación `< new Date()` (¿vencida?) | `todayInTz(tz)` vs `toPlainDate(due_date, tz)` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/FacturasCompraTable.tsx:275,278` | AP | `issue_date`, `due_date` timestamptz | `formatDate(v)` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/FacturasProximasVencer.tsx:58,250` | AP | `due_date` timestamptz, cálculo de días restantes | `toPlainDate` + `formatDate` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/id/CuentaPorPagarInfo.tsx:124,169` | AP | `accounts_payable.due_date` · **timestamptz** | `toPlainDate` + `formatDate` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/id/DetalleFacturaCompra.tsx:319,540,551` | AP | `issue_date`, `due_date` timestamptz | `toPlainDate` + `formatDate` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/id/HistorialPagos.tsx:201,204` | AP | `payments.created_at` · timestamptz. :204 **imprime siempre 00:00** (§2) | `formatDate(v)` y `formatTime(v)` | CLI · `ctx+branch` |
| `finanzas/facturas-compra/nueva-factura/InformacionBasicaForm.tsx:193` | AP | valor del `<input type="date">` (día puro) | `plainDateToInstant` si va a BD; para mostrar, `formatPlain` | CLI · `ctx` |
| `finanzas/facturas-compra/nueva-factura/NuevaFacturaForm.tsx:210` | AP | ídem | ídem | CLI · `ctx` |
| `finanzas/facturas-venta/FacturasProximasVencer.tsx:88,197` | AR | `invoice_sales.due_date` timestamptz; :197 lo pasa a `date-fns/format` | `toPlainDate` + `formatDate` | CLI · `ctx+branch` |
| `finanzas/facturas-venta/FacturasTable.tsx:139,144` | AR | `invoice_sales.issue_date` timestamptz | `toPlainDate(v, tz)` | CLI · `ctx+branch` |
| `finanzas/saldos-a-favor/SaldosAFavorPage.tsx:78` | finanzas | fecha del saldo a favor | `formatDate`/`formatPlain` según columna | CLI · `ctx` |

No tocar: `src/__tests__/timezone/parseLocalDateBug.test.ts` (13 líneas) — es la red que
demuestra el bug. Si la Fase C lo cierra, ese test se reescribe como guarda de que nadie
vuelva a importar `parseLocalDate`, no se borra.

---

## 6. Tabla C3 — los 60 imports y las 79 llamadas a `formatDate(...)`

Los 60 imports se reparten así: **47** traen `formatDate`, **19** traen `parseLocalDate`,
**6** traen las dos. Uno de ellos está en el test de regresión y no se toca.

**Import muerto detectado:**
`src/app/app/pos/pedidos-online/[id]/components/OrderHeader.tsx:7` importa `formatDate` y
**no lo usa nunca** (define su propio `formatDateTime` en la línea 19). Basta con borrar el
import.

Las 79 llamadas, agrupadas por el tipo de la columna que formatean:

### 6.1 Columna `date` — el reemplazo no cambia nada en pantalla (`formatPlain`)

| Archivo:línea | Columna |
|---|---|
| `app/app/hrm/compensacion/paquetes/[id]/page.tsx:329,331` | `compensation_packages.valid_from` / `valid_to` · date |
| `app/app/hrm/nomina/periodos/[id]/page.tsx:308,317` | `payroll_periods.period_start` / `period_end` / `payment_date` · date |
| `app/app/hrm/prestamos/[id]/page.tsx:362,371,380` | `employee_loans.disbursement_date` / `last_payment_date` · date |
| `app/app/pms/asignaciones/page.tsx:218,219` | `reservations.checkin` / `checkout` · date |
| `components/hrm/reportes/ReportTable.tsx:103,164,167` | `timesheets.work_date`, `leave_requests.start_date` / `end_date` · date |

### 6.2 Columna `timestamptz` — **aquí `formatDate` da el día UTC: es el bug**

| Archivo:línea | Columna |
|---|---|
| `app/app/hrm/nomina/colillas/[id]/page.tsx:402` | `paid_at` |
| `app/app/hrm/nomina/periodos/[id]/runs/[run_id]/page.tsx:270` | `executed_at` |
| `app/app/integraciones/conexiones/[id]/page.tsx:448,511,677` | `last_health_check_at`, `last_error_at`, `created_at` |
| `components/chat/channels/ChannelCard.tsx:295` | `created_at` |
| `components/chat/conversations/id/activity/ActivityItem.tsx:207` | `timestamp` |
| `components/chat/conversations/id/files/FileCard.tsx:192` | `created_at` |
| `components/clientes/id/InfoTab.tsx:148,149` | `customers.created_at` / `updated_at` |
| `components/clientes/id/OportunidadesTab.tsx:176` | `expected_close_date` |
| `components/finanzas/documentos-soporte/SupportDocumentDetail.tsx:281,286` | `support_documents.issue_date` (**timestamptz**), `validated_at` |
| `components/finanzas/documentos-soporte/SupportDocumentsTable.tsx:126` | `support_documents.issue_date` |
| `components/finanzas/egresos/EgresoDetalle.tsx:94,152,205,289` y `EgresosPage.tsx:119,298` | `cash_movements.created_at` |
| `components/finanzas/ingresos/IngresoDetalle.tsx:95,153,206,290` y `IngresosPage.tsx:130,309` | `cash_movements.created_at` |
| `components/finanzas/facturacion-electronica/JobDetailDialog.tsx:149`, `JobEventsTimeline.tsx:96`, `JobsTable.tsx:179` | `created_at` |
| `components/finanzas/notas-credito/NotaCreditoDetalle.tsx:248,454,518,545` y `NotasCreditoPage.tsx:160,344` | `credit_notes.issue_date`, `created_at` |
| `components/finanzas/reportes/ReportesPage.tsx:393` | fecha del último arqueo |
| `components/finanzas/transferencias/TransferenciaDetalle.tsx:92,161,249,295,316` y `TransferenciasPage.tsx:119,285` | `bank_transfers.transfer_date` (**timestamptz**), `created_at` |
| `components/integraciones/TopProblems.tsx:118` | `last_error_at` |
| `components/integraciones/api-keys/ApiKeysList.tsx:192,195,199` | `channel_api_keys.created_at` / `last_used_at` / `expires_at` |
| `components/integraciones/eventos/EventsList.tsx:225`, `eventos/id/EventDetail.tsx:276,286` | `created_at`, `processed_at` |
| `components/integraciones/jobs/JobsList.tsx:240` | `last_run_at` |
| `components/integraciones/mapeos/MapeosList.tsx:172` | `last_seen_at` |
| `components/integraciones/webhooks-salientes/WebhooksList.tsx:170` | `updated_at` |
| `components/notificaciones/AlertasCriticas.tsx:86`, `UltimasNotificaciones.tsx:149`, `dashboard/AlertasRecientes.tsx:133`, `dashboard/UltimasNotificaciones.tsx:142` | `created_at` |
| `components/parking/operacion/ExitDialog.tsx:181`, `VehicleSearch.tsx:168` | `parking_sessions.entry_at` — además **pierde la hora**, que es justo lo que se quiere ver en un parqueadero |

### 6.3 Doble envoltura `formatDate(parseLocalDate(...))`

9 llamadas: `FacturasCompraTable.tsx:275,278`, `FacturasProximasVencer.tsx (compra):250`,
`CuentaPorPagarInfo.tsx:169`, `DetalleFacturaCompra.tsx:540,551`, `HistorialPagos.tsx:201`.
`formatDate` ya llama a `parseLocalDate` internamente, así que la envoltura externa es
redundante **y** duplica el bug. Se sustituyen por una sola llamada a `formatDate(v)` del
hook.

---

## 7. Sin fuente de zona

| Sitio | Por qué | Qué decidir |
|---|---|---|
| `src/lib/services/pdfService.ts:118,372` | Tiene `'use client'` pero **no es un componente**: no puede llamar al hook. | Añadir `timezone` a la firma de las funciones de PDF y pasarlo desde el componente. |
| `src/lib/services/parkingTicketService.ts:57,63` | Ídem. Además el tiquete se **imprime**: la hora que sale en papel es la que el cliente reclama. | Ídem, con `parking_sessions.branch_id` para la zona de la sucursal. |
| `src/lib/services/posService.ts:1616` | Servicio de servidor sin zona en la firma. | Parámetro. |
| `src/lib/services/supplierService.ts:915,963` | Ídem (exportación CSV/XLSX). | Parámetro. |
| `src/app/api/facturas-venta/[id]/pdf/route.ts:114`, `src/app/api/pdf/invoice/route.ts:17` | Route handlers: **no hay hooks**. | `getServerOrgContext()` → `getOrganizationTimezone(orgId)`, o `fn_timezone_for(org, invoice.branch_id)` para respetar la sucursal de la factura. |
| `src/app/api/sessions/activity/route.ts:96` | Nombre de dispositivo; la sesión puede no tener organización resuelta aún. | Quitar la fecha del nombre, o usar la zona de la organización si ya está disponible. |
| `src/components/inicio/DashboardKPIs.tsx:717`, `KpiDetailDialog.tsx:249,311` | `new Date(anio, mes-1)` es una **fecha sintética** para sacar el nombre del mes; no representa ningún instante. | `aceptable` con nota en el código, o sacar el nombre del mes de una tabla de i18n sin construir un `Date`. |
| `src/components/integraciones/tripadvisor/*` | `published_date` viene del proveedor externo con su propio criterio de día. | Documentar que es el día del proveedor. |
| `src/components/finanzas/monedas/ExchangeRate*` | `currency_rates` es un **catálogo global sin `organization_id`** (verificado por MCP). | Misma decisión que en la Fase B §5. |

---

## 8. Plan de tandas (30–40 ocurrencias por commit, agrupadas por módulo)

Cada tanda: un commit, un test con `TZ=UTC` y `TZ=America/Bogota`, y la ruta añadida al
bloque `overrides` de `.eslintrc.json` con `error` (que ya bloquea el import desde
`@/utils/Utils`).

**Precondición general:** las tandas marcadas ⚠ tocan columnas `timestamptz` que la Fase B
escribe como `'YYYY-MM-DD'`. En esas tandas **hay que arreglar escritura y lectura en el
mismo commit** o la fecha se corre un día en producción. Coinciden con las tandas 1, 2 y 4
de la Fase B.

| # | Tanda | Grupos | Ocurrencias | Archivos |
|---:|---|---|---:|---:|
| C1 | **Cartera AR** ⚠ — `cuentas-por-cobrar` completo: C1 (16) + C2 (12) + imports (8) | C1+C2+C3 | 28 + 8 imports | 8 |
| C2 | **Cartera AP y facturas** ⚠ — `facturas-compra`, `facturas-venta`, `saldos-a-favor`: C1 (1) + C2 (21) + `formatDate` (9) + imports (10) | C1+C2+C3 | 31 + 10 imports | 11 |
| C3 | **Contabilidad y bancos** — asientos, mayor, períodos fiscales, períodos contables, conciliación, cuentas bancarias | C1 | 13 | 8 |
| C4 | **Caja: ingresos, egresos, transferencias, notas crédito, documentos soporte, facturación electrónica** — casi todo `formatDate(created_at)` sobre timestamptz | C3 | 29 + 13 imports | 13 |
| C5 | **POS y pedidos en línea** ⚠ (cupones y promociones van aquí por la vigencia timestamptz) | C1 | 26 | 21 |
| C6 | **Parking** — sesiones activas, mapa, pases por vencer, cabeceras, tiquete impreso, `ExitDialog`/`VehicleSearch` | C1+C3 | 14 + 2 imports | 13 |
| C7 | **CRM, clientes y chat** — pestañas del cliente, inbox, línea de tiempo de mensajes, historial del asistente | C1+C3 | 26 + 5 imports | 15 |
| C8 | **Integraciones y notificaciones** — conexiones, credenciales, webhooks, eventos, jobs, mapeos, api-keys, canales, plantillas, reglas, logs | C1+C3 | 29 + 11 imports | 22 |
| C9 | **Organización, plan, perfil y suscripción** — invitaciones, miembros, dominios, branding, reseñas, sesiones de dispositivo, facturación Stripe | C1 | 16 | 11 |
| C10 | **PM, metas y proyectos** + `inicio`/KPIs + `reportes/ReporteTabla` | C1 | 15 | 11 |
| C11 | **HRM, nómina y PMS** — colillas, períodos, préstamos, paquetes, cargos, asignaciones, `ReportTable`, `SerialSelectorDialog` | C1+C3 | 18 + 7 imports | 10 |
| C12 | **Servidor y servicios sin hook** — las 3 rutas de `src/app/api/**`, `posService`, `supplierService`, `pdfService`, `parkingTicketService`, `cuentas-por-cobrar/service.ts`. **Requiere la decisión de §7** | C1+C2 | 11 | 7 |
| C13 | **Cierre** — borrar `formatDate`/`parseLocalDate` de `src/utils/Utils.ts`, reescribir `parseLocalDateBug.test.ts` como guarda, poner `no-restricted-imports` en `error` global | — | — | 3 |

Suma de ocurrencias: 256 en las tandas C1–C12 (las 12 restantes de las 268 son los casos
`aceptable` de §7, que se cierran con un comentario justificado dentro de su propia tanda).

**Orden recomendado:** C1 → C2 → C3 → C4 (el dinero primero y de una pieza con la Fase B),
luego C5 y C6 (operación diaria), luego C7–C11 (presentación) y por último C12 y C13.
