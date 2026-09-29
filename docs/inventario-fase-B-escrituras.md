# Inventario Fase B — escritura de día calendario en UTC

> Triaje para los constructores de la Fase B. **Este documento no cambia código.**
> Fecha: 2026-09-23. Rama `main`. Reglas: `docs/reglas-fechas-timezone.md`.
> Cimientos disponibles (Fase A): `branches.timezone`, `fn_timezone_for(org, branch)`,
> `useTimezoneFor(branchId)`, `useFormatDate(branchId?)`, `useFormatDateFor(branchId)`,
> `todayInTz` / `toPlainDate` / `plainDateToInstant` / `getDayRange` / `getDateRange`.

## 0. Recuento verificado

```
grep -rn "toISOString()\.split('T')\|toISOString()\.slice(0, *10)" src --include=*.ts --include=*.tsx | wc -l
291
```

**291** coincidencias en **160** archivos. Descomposición real (contada, no estimada):

| Clase | Ocurrencias | Qué es |
|---|---:|---|
| Falsos positivos (comentario / cadena de test) | **6** | El patrón aparece dentro de un comentario que lo *prohíbe*, o dentro del nombre de un `it(...)`. **No tocar.** |
| Nombre de archivo de descarga (CSV/JSON/XLSX/PDF/TXT) | **54** | El día solo aparece en `link.download` / `file_name`. No se guarda ni se filtra. |
| Escritura persistida, parámetro de RPC, filtro de consulta, presentación o clave | **231** | Lo que hay que arreglar de verdad. |

Los 6 falsos positivos, para que nadie los cuente como trabajo:

| Archivo:línea | Por qué no cuenta |
|---|---|
| `src/lib/jobs/orgTimezone.ts:57` | Comentario: «Nunca `toISOString().slice(0,10)`». |
| `src/lib/services/crm/pricingService.ts:78` | Comentario sobre `todayInTz('UTC')`. |
| `src/lib/services/crm/quotaProgress.ts:5` | Comentario de cabecera del módulo. |
| `src/lib/services/crm/__tests__/f10.cierre.estatico.stable.test.ts:88` | Texto del `it(...)` de la guarda estática. |
| `src/lib/utils/dateDisplay.ts:16` | Comentario de la regla 3. |
| `src/utils/Utils.ts:17` | Comentario de `toLocalDateString`. |

---

## 1. El hallazgo que cambia el orden de la fase

Consultado `information_schema.columns` por MCP. **Muchas columnas que el código trata
como “día calendario” son `timestamptz`, no `date`:**

| Tabla.columna | Tipo real | Qué escribe el código |
|---|---|---|
| `accounts_receivable.due_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `accounts_payable.due_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `invoice_sales.issue_date` / `.due_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `invoice_purchase.issue_date` / `.due_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `journal_entries.entry_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `payments.payment_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `bank_transfers.transfer_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `promotions.start_date` / `.end_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `coupons.start_date` / `.end_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `memberships.start_date` / `.end_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `support_documents.issue_date` | **timestamptz** | `'YYYY-MM-DD'` |
| `accounts_receivable.last_reminder_date` | **timestamptz** | se lee como día |

Mandar `'2026-09-23'` a un `timestamptz` hace que Postgres lo interprete como
`2026-09-23 00:00:00` **en el `TimeZone` de la sesión** (UTC en Supabase). Es decir:
se guarda el instante que en Bogotá son las **19:00 del 22**. Al leerlo y formatearlo con
`formatDateInTz(valor, 'America/Bogota')` sale **22/09**. Hoy nadie lo nota porque casi
todo el código lo vuelve a leer con `.split('T')[0]` (día UTC) y así el error se cancela
con el error. En cuanto la Fase C arregle la presentación, **toda esta familia se corre
un día** si no se arregla la escritura en el mismo lote.

**Consecuencia para el plan:** las tandas que tocan estas columnas deben cambiar escritura
y lectura **en el mismo commit**, y no se pueden separar B de C ahí. Están marcadas
`⚠ ida y vuelta` en la tabla.

Columnas que sí son `date` puro (aquí el arreglo es solo `todayInTz` / `toPlainDate`):
`ar_installments.due_date`, `ap_installments.due_date`, `loan_installments.due_date`,
`employee_loans.disbursement_date` / `.last_payment_date`, `employments.hire_date` /
`.termination_date`, `employment_compensation.effective_from` / `.effective_to`,
`fiscal_periods.start_date` / `.end_date`, `payroll_periods.period_start` / `.period_end` /
`.payment_date`, `housekeeping_tasks.task_date`, `parking_passes.start_date` / `.end_date`,
`membership_freezes.start_date` / `.end_date`, `reservations.checkin` / `.checkout`,
`reservation_spaces.checkin` / `.checkout`, `reservation_blocks.date_from` / `.date_to`,
`restaurant_reservations.reservation_date`, `trips.trip_date`, `dispatch_manifests.manifest_date`,
`quotations.issue_date` / `.valid_until`, `fixed_assets.acquisition_date`,
`currency_rates.rate_date`, `lots.expiry_date`, `serial_numbers.warranty_start` / `.warranty_end`,
`country_payroll_rules.valid_from`, `timesheets.work_date`, `shift_assignments.work_date`,
`sales_targets.period_start` / `.period_end`, `vehicles.*_expiry`,
`driver_credentials.license_expiry` / `.medical_certificate_expiry`,
`shipments.expected_pickup_date` / `.expected_delivery_date`, `purchase_orders.expected_date`.

Dos tablas que el código consulta **no existen**: `space_blocks` (`icalService.ts:396`, ya
tiene rama de fallback) y `drivers` (el servicio de transporte lee `driver_credentials`).

---

## 2. Resumen por módulo y prioridad

Ocurrencias reales (291 menos los 6 comentarios = 285 tocables, de las cuales 54 son
nombres de archivo de descarga).

| Módulo | Archivos | Ocurrencias | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|---:|---:|
| finanzas (tesorería, monedas, open finance, ingresos/egresos) | 21 | 57 | 21 | 0 | 22 | 14 |
| otros (chat, timeline, admin, integraciones, calendario, IA) | 25 | 30 | 1 | 0 | 8 | 21 |
| transporte | 11 | 26 | 2 | 12 | 10 | 2 |
| nómina / HRM | 12 | 25 | 12 | 3 | 8 | 2 |
| PMS (reservas, espacios, tape chart, iCal) | 12 | 24 | 0 | 17 | 5 | 2 |
| parking | 12 | 23 | 4 | 3 | 11 | 5 |
| contabilidad (períodos, asientos, balances) | 10 | 19 | 10 | 0 | 9 | 0 |
| checkout / POS | 11 | 16 | 1 | 6 | 3 | 6 |
| reportes / filtros | 5 | 15 | 0 | 0 | 12 | 3 |
| inventario / compras | 9 | 14 | 4 | 0 | 3 | 7 |
| cuentas por cobrar | 7 | 12 | 6 | 0 | 2 | 4 |
| CRM | 10 | 12 | 1 | 0 | 8 | 3 |
| cuentas por pagar | 5 | 11 | 6 | 0 | 2 | 3 |
| gym | 2 | 3 | 2 | 0 | 0 | 1 |
| housekeeping | 2 | 2 | 0 | 2 | 0 | 0 |
| promociones | 1 | 1 | 1 | 0 | 0 | 0 |
| cupones | 1 | 1 | 0 | 0 | 0 | 1 |
| **Total** | **160** | **291** | **71** | **43** | **103** | **74** |

(Los 6 comentarios están contados dentro de «CRM» y «otros» como P3-no-tocar.)

Criterio de prioridad usado:

- **P0** — el valor se persiste y un día de diferencia cambia dinero, un período legal o
  una vigencia que corta servicio: vencimientos, cierres contables, nómina, préstamos,
  abonos, pases de parqueadero, congelamientos de gimnasio, garantías, tasas de cambio.
- **P1** — operación del día: housekeeping, manifiestos, viajes, check-in/check-out,
  asignación de habitaciones, reservas de mesa.
- **P2** — CRM, dashboards, rangos por defecto de reportes y filtros.
- **P3** — nombres de archivo de descarga, claves de caché, ids y `console.log`.

---

## 3. Tabla completa

Notación de la columna **Arreglo**:

- `todayInTz(tz)` — el código quería «hoy».
- `toPlainDate(d, tz)` — el código tenía un `Date` y quería su día calendario.
- `plainDateToInstant(dia, tz, hora?)` — la columna destino es `timestamptz`: hay que
  mandar un instante con offset, no un `'YYYY-MM-DD'`.
- `getDayRange` / `getDateRange` — el valor se usa como extremo de un filtro sobre un
  `timestamptz`; hay que comparar contra instantes, no contra una cadena de día.
- `nextPlainDay` / `previousPlainDay` — iteración día a día.
- `aceptable` — se justifica dejarlo, con el motivo escrito.

Notación de **Zona**: de dónde sale el timezone en ese punto exacto.
`org` = organización de sesión · `branch` = `branch_id` del propio dato · `prop`/`ctx` =
llega por propiedad o contexto de React · `param` = habría que añadir un parámetro al
servicio · **`SIN FUENTE`** = no hay forma de obtenerla ahí: es diseño, no reemplazo.

### 3.1 P0 — corrompe datos guardados

| Archivo:línea | Módulo | Destino real (tabla.columna · tipo) | Arreglo | Zona |
|---|---|---|---|---|
| `src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesService.ts:110,111` | contabilidad | `fiscal_periods.start_date`/`.end_date` · **date** (insert) | `toPlainDate` sobre los `Date` construidos, o construir la cadena sin `Date` | `param` (el servicio ya recibe `orgId`) |
| `src/components/finanzas/periodos-contables/PeriodosContablesService.ts:154,155` | contabilidad | `fiscal_periods.start_date`/`.end_date` · **date** (insert) | ídem | `param` (`organizationId` en scope) |
| `src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx:66,67` | contabilidad | `fiscal_periods.start_date`/`.end_date` · **date** (vía servicio) | `toPlainDate(d, tz)` | `ctx` — `useFormatDate().toDate` |
| `src/components/finanzas/contabilidad/asientos/AsientosPage.tsx:44,79` | contabilidad | `journal_entries.entry_date` · **timestamptz** ⚠ ida y vuelta | `getToday()` para el input `type=date` **+** `plainDateToInstant` al guardar | `ctx` — `useFormatDate()` |
| `src/components/finanzas/contabilidad/balance-comprobacion/BalanceComprobacionPage.tsx:27,28` | contabilidad | filtro de rango sobre `journal_entries.entry_date` · timestamptz | `getToday()` + `getDateRange` | `ctx` |
| `src/components/finanzas/contabilidad/balance-general/BalanceGeneralPage.tsx:37` | contabilidad | filtro `asOfDate` sobre `entry_date` · timestamptz | `getToday()` + `getDayRange` | `ctx` |
| `src/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage.tsx:37,38` | contabilidad | filtro de rango sobre `entry_date` · timestamptz | `getToday()` + `getDateRange` | `ctx` |
| `src/components/finanzas/contabilidad/mayor-contable/MayorContablePage.tsx:29,30` | contabilidad | filtro de rango sobre `entry_date` · timestamptz | `getToday()` + `getDateRange` | `ctx` |
| `src/components/finanzas/cuentas-por-cobrar/AplicarAbonoModal.tsx:51,166` | cuentas por cobrar | `payments.payment_date` · **timestamptz** ⚠ | `getToday()` en el formulario + `plainDateToInstant` al enviar | `ctx`; hay `branch` en `accounts_receivable.branch_id` |
| `src/components/finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx:44,151` | cuentas por cobrar | `payments.payment_date` · **timestamptz** ⚠ | ídem | `ctx` + `account.branch_id` |
| `src/components/finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx:407,411,412` | cuentas por cobrar | `min`/`max` del `<input type="date">` y validación contra `account.invoice_date` | `getToday()` y `formatPlain`/`toPlainDate` del valor de BD — **nunca** `new Date(v).toISOString().split('T')[0]` sobre un valor de BD | `ctx` |
| `src/components/finanzas/cuentas-por-cobrar/id/service.ts:316` | cuentas por cobrar | `ar_installments.due_date` · **date** (insert de cuotas) | construir el vencimiento con aritmética de día calendario, no con `Date` UTC | `param` (falta; hoy no recibe zona) |
| `src/components/finanzas/facturas-compra/RegistrarPagoModal.tsx:59,72,134` | cuentas por pagar | `payments.payment_date` · **timestamptz** ⚠ | `getToday()` + `plainDateToInstant` | `ctx` + `factura.branch_id` |
| `src/components/finanzas/facturas-compra/RegistrarPagoModal.tsx:164,313,317,318` | cuentas por pagar | validación y `min`/`max` contra `invoice_purchase.issue_date` · timestamptz | `formatDateInTz(issue_date, tz)` → comparar días en la zona correcta | `ctx` |
| `src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx:73,116,153,379,383` | cuentas por cobrar | `payments.payment_date` · timestamptz ⚠ + validación contra `invoice_sales.issue_date` | `getToday()` + `plainDateToInstant`; la comparación por `formatDateInTz` | `ctx` + `factura.branch_id` |
| `src/components/finanzas/facturas-venta/id/DetalleFactura.tsx:930,1222,1223,1226,1239` | cuentas por cobrar | fecha de «marcar pagada» → `payments.payment_date` · timestamptz ⚠; `min`/`max` contra `issue_date` | `getToday()` + `plainDateToInstant`; comparaciones por día en zona | `ctx` |
| `src/components/finanzas/facturas-venta/ImportarCSVDialog.tsx:119,120` | cuentas por cobrar | `invoice_sales.issue_date` / `.due_date` · **timestamptz** ⚠ (default de import) | `getToday()` y `+30 días` en día calendario, luego `plainDateToInstant` | `ctx` |
| `src/lib/services/cotizacionesService.ts:362` | finanzas | `quotations.issue_date` · **date** | `todayInTz(tz)` | `param` — el servicio ya tiene `original.organization_id` y `original.branch_id` |
| `src/lib/services/cotizacionesService.ts:445,446` | finanzas | `invoice_sales.issue_date` / `.due_date` · **timestamptz** ⚠ | `todayInTz` + `plainDateToInstant` | `param` (`organizationId`, `branchId` ya en la firma) |
| `src/components/finanzas/cotizaciones/nueva-cotizacion/NuevaCotizacionForm.tsx:54,56` | finanzas | `quotations.issue_date` / `.valid_until` · **date** | `getToday()` y suma de 30 días calendario | `ctx` |
| `src/components/finanzas/transferencias/NuevaTransferenciaDialog.tsx:49,61` | finanzas | `bank_transfers.transfer_date` · **timestamptz** ⚠ | `getToday()` + `plainDateToInstant` | `ctx` + `branch_id` de la transferencia |
| `src/components/finanzas/activos-fijos/ActivosFijosPage.tsx:34,85` | contabilidad | `fixed_assets.acquisition_date` · **date** | `getToday()` | `ctx` |
| `src/components/finanzas/documentos-soporte/SupportDocumentForm.tsx:117` | finanzas | `support_documents.issue_date` · **timestamptz** ⚠ (se combina con `createdTime` de la línea 118) | `getToday()` + `plainDateToInstant(dia, tz, hora)` | `ctx` |
| `src/lib/services/employeeLoansService.ts:235` | nómina/HRM | `employee_loans.disbursement_date` · **date** | `todayInTz(tz)` | `param` — falta; el servicio no recibe org |
| `src/lib/services/employeeLoansService.ts:340` | nómina/HRM | `employee_loans.last_payment_date` · **date** | `todayInTz(tz)` | `param` — falta |
| `src/lib/services/employeeLoansService.ts:375` | nómina/HRM | `loan_installments.due_date` · **date** (plan de cuotas) | aritmética de día calendario | `param` — falta |
| `src/lib/services/employmentsService.ts:512` | nómina/HRM | `employments.termination_date` · **date** | `todayInTz(tz)` | `param`; `employments.branch_id` existe |
| `src/lib/services/employmentsService.ts:548` | nómina/HRM | `employments.hire_date` · **date** (duplicar contrato) | `todayInTz(tz)` | `param` + `branch` |
| `src/app/app/hrm/compensacion/asignaciones/page.tsx:56,173` | nómina/HRM | `employment_compensation.effective_to` · **date** (fin de vigencia salarial) | `getToday()` | `ctx` |
| `src/lib/services/employmentCompensationService.ts:144,223` | nómina/HRM | comparación de vigencia `effective_from`/`effective_to` · date | `todayInTz(tz)` | `param` — falta |
| `src/lib/services/payrollService.ts:570` | nómina/HRM | filtro `country_payroll_rules.valid_from <= hoy` · date (elige la **tabla de retenciones**) | `todayInTz(tz)` | `param` — falta |
| `src/app/app/hrm/prestamos/[id]/page.tsx:219` | nómina/HRM | comparación `loan_installments.due_date < hoy` (conteo de mora) | `getToday()` | `ctx` |
| `src/app/app/parking/abonados/page.tsx:148,150` | parking | `parking_passes.start_date` / `.end_date` · **date** (duplicar abono) | `getToday()` + suma de días calendario | `ctx`; `parking_passes` **no tiene** `branch_id` → zona de la organización |
| `src/app/app/parking/abonados/page.tsx:195,197` | parking | ídem (renovar abono) | ídem | `ctx` |
| `src/lib/services/gymService.ts:473` | gym | `membership_freezes.start_date` · **date** | `todayInTz(tz)` | `param` — falta; la tabla no tiene `organization_id` ni `branch_id` (se llega por `membership_id`) |
| `src/lib/services/gymService.ts:523` | gym | `membership_freezes.end_date` · **date** | `toPlainDate(endDate, tz)` | `param` — falta |
| `src/components/pos/promociones/nuevo/PromotionWizard.tsx:80` | promociones | `promotions.start_date` · **timestamptz** ⚠ (vigencia que activa/apaga descuentos) | `getToday()` + `plainDateToInstant(dia, tz, '00:00')` | `ctx` |
| `src/lib/services/serialTrackingService.ts:192` | inventario | `serial_numbers.warranty_end` · **date** (y `warranty_start` en :190 vía `now.split('T')[0]`) | `todayInTz` + suma de meses en día calendario | `param`; `data.branch_id` está en el DTO |
| `src/lib/services/currencyService.ts:184,249` | finanzas | `exchange_rates` por organización, campo de fecha efectiva | `todayInTz(tz)` | `param` — `organizationId` ya está en la firma de `updateExchangeRate` |
| `src/lib/services/openexchangerates.ts:347,501,603,687` | finanzas | `currency_rates.rate_date` · **date** — **catálogo global, sin `organization_id`** | ver §5: decisión de diseño, no reemplazo | **SIN FUENTE** |
| `src/lib/services/purchaseOrderService.ts:812,834,837` | inventario/compras | `invoice_purchase.issue_date` / `.due_date` · **timestamptz** ⚠ (OC → factura) y filtro de duplicados por `issue_date` | `todayInTz` + `plainDateToInstant`; el filtro por `getDayRange` | `param`; `purchase_orders.branch_id` existe |

### 3.2 P1 — operación del día

| Archivo:línea | Módulo | Destino real | Arreglo | Zona |
|---|---|---|---|---|
| `src/lib/services/checkoutService.ts:1017` | housekeeping | `housekeeping_tasks.task_date` · **date** (insert al hacer check-out) | `todayInTz(tz)` | `param`; `housekeeping_tasks` no tiene `branch_id` → se llega por `space_id → spaces.branch_id` |
| `src/lib/services/housekeepingService.ts:128` | housekeeping | filtro `task_date = hoy` · date | `todayInTz(tz)` | `param` — falta |
| `src/app/app/pms/housekeeping/page.tsx:62` | PMS | filtro `task_date` desde un `Date` del datepicker | `toDate(selectedDate)` | `ctx` |
| `src/app/app/pms/espacios/page.tsx:86,334,688` | PMS | `housekeeping_tasks.task_date` · date (limpieza masiva) | `getToday()` | `ctx` + `space.branch_id` |
| `src/app/app/pms/espacios/[id]/page.tsx:89,298` | PMS | ídem | `getToday()` | `ctx` + `space.branch_id` |
| `src/lib/services/checkinService.ts:287,323` | PMS | filtro de llegadas / estadísticas del día sobre `reservations.checkin` · date | `todayInTz(tz)` | `param`; `reservations.branch_id` |
| `src/lib/services/checkinService.ts:388` | PMS | campo de auditoría del check-in en `reservations` | `todayInTz(tz)` | `param` + `branch` |
| `src/lib/services/checkinService.ts:608` | PMS | comprobación de disponibilidad para hoy | `todayInTz(tz)` | `param` + `branch` |
| `src/lib/services/checkoutService.ts:443` | PMS | cálculo de noches extra contra `reservations.checkout` · date | `todayInTz(tz)` (y quitar el `+'T00:00:00'`) | `param` + `branch` |
| `src/lib/services/checkoutService.ts:580` | PMS | auditoría del check-out | `todayInTz(tz)` | `param` + `branch` |
| `src/app/app/pms/reservas/page.tsx:355` | PMS | `CheckoutService.getDepartures(org, hoy)` sobre `checkout` · date | `getToday()` | `ctx` |
| `src/lib/services/roomAssignmentService.ts:38,334,335,336` | PMS | filtros `checkin`/`checkout` de hoy, mañana y la semana · date | `todayInTz` + `nextPlainDay` | `param`; `reservations.branch_id` |
| `src/lib/services/reservationBlocksService.ts:118,136,149` | PMS | filtro `reservation_blocks.date_to >= hoy` · date | `todayInTz(tz)` | `param`; `reservation_blocks.branch_id` está en la firma |
| `src/lib/services/groupReservationsService.ts:336` | PMS | estadísticas de grupos contra `checkin`/`checkout` · date | `todayInTz(tz)` | `param`; la firma ya recibe `branchId` |
| `src/lib/services/spaceConsumptionService.ts:48` | PMS | reserva activa del espacio hoy · date | `todayInTz(tz)` | `param`; `spaceId → spaces.branch_id` |
| `src/lib/services/icalService.ts:387` | PMS | filtro `reservations.checkout >= hoy` · date | `todayInTz(tz)` | `param` (`organizationId` en la firma) |
| `src/lib/services/icalService.ts:396` | PMS | filtro sobre `space_blocks` — **la tabla no existe**, hay rama de fallback | eliminar o dejar con nota | n/a |
| `src/app/api/pms/ical/[token]/route.ts:68` | PMS | filtro de reservas activas del espacio, ruta pública por token | `fn_timezone_for(org, branch)` o `getOrganizationTimezone(connection.organization_id)` | `org` del token (ya se consulta la organización dos líneas antes) |
| `src/lib/services/crm/pmsCrmLink.ts:119,120` | CRM→PMS | `reservations.checkin` / `.checkout` · **date** por defecto (hoy / mañana) | `todayInTz` + `nextPlainDay` | `param` — falta |
| `src/lib/services/manifestsService.ts:294` | transporte | `dispatch_manifests.manifest_date` · **date** (duplicar manifiesto) | `todayInTz(tz)` | `param`; `original.organization_id` y `dispatch_manifests.branch_id` disponibles |
| `src/lib/services/tripsService.ts:199` | transporte | `trips.trip_date` · date, y de ahí el `trip_code` | `todayInTz(tz)` | `param`; `trips.branch_id` |
| `src/app/app/transporte/viajes/page.tsx:193` | transporte | `trips.trip_date` de mañana (duplicar viaje) | `getToday()` + `nextPlainDay` | `ctx` + `trip.branch_id` |
| `src/app/app/transporte/viajes/page.tsx:99` | transporte | filtro `trip_date` desde el datepicker | `toDate(dateFilter)` | `ctx` |
| `src/components/transporte/horarios/GenerateTripsDialog.tsx:44` | transporte | fin del rango de generación de viajes | ya usa `todayInTz` en :41 — completar con `nextPlainDay` ×7 en vez de `Date`+`toISOString` | `ctx` (`useOrgTimezone` ya importado) |
| `src/lib/services/transportRoutesService.ts:661` | transporte | iteración día a día para generar viajes desde `route_schedules` | `nextPlainDay` | `param` |
| `src/lib/services/shipmentsService.ts:424,463` | transporte | conteo de envíos de hoy y viajes de hoy · `trip_date` date | `todayInTz(tz)` | `param` (`organizationId` en la firma); `shipments.branch_id` |
| `src/lib/services/ticketsService.ts:208,231` | transporte | estadísticas de tiquetes y viajes de hoy | `todayInTz(tz)` | `param` |
| `src/lib/services/trackingService.ts:147` | transporte | eventos de tracking de hoy | `todayInTz(tz)` | `param` |
| `src/components/pos/reservas-mesas/ReservaFormDialog.tsx:85` | checkout/POS | `restaurant_reservations.reservation_date` · **date** | `getToday()` | `ctx` + `branch` de la reserva |
| `src/components/pos/reservas-mesas/reservasMesasService.ts:176` | checkout/POS | filtro de reservas del día · date | `todayInTz(tz)` | `param` — falta |
| `src/app/app/pos/reservas-mesas/page.tsx:37` | checkout/POS | `dateFrom` / `dateTo` por defecto = hoy | `getToday()` | `ctx` |
| `src/components/pos/propinas/propinasService.ts:97` | checkout/POS | propinas del día — `tips` **no tiene columna de día**, se filtra por `created_at` · timestamptz | `getDayRange(todayInTz(tz), tz)` y comparar instantes | `param` — falta; `tips.branch_id` existe |
| `src/lib/services/attendanceService.ts:138,290,312` | nómina/HRM | filtro sobre `attendance_events.event_at` · **timestamptz**, hoy se concatena `T00:00:00`/`T23:59:59` **sin offset** | `getDayRange(dia, tz)` | `param`; la firma ya recibe `branchId` en :137 |
| `src/lib/services/timesheetConsolidationService.ts:168,409` | nómina/HRM | iteración día a día y día objetivo para consolidar `timesheets.work_date` · date | `nextPlainDay` + `todayInTz(tz)` | `param`; `timesheets.branch_id` |
| `src/app/app/hrm/asistencia/timesheets/page.tsx:82` | nómina/HRM | día a consolidar (`timesheets.work_date`) | `getToday()` | `ctx` |
| `src/app/app/parking/operacion/page.tsx:168` | parking | filtro `parking_passes.end_date >= hoy` (¿tiene abono vigente?) | `getToday()` | `ctx` |
| `src/lib/services/parkingService.ts:852` | parking | filtro `parking_passes.end_date >= hoy` | `todayInTz(tz)` | `param` (`organizationId` en la firma) |

### 3.3 P2 — CRM, dashboards, rangos por defecto de reportes y filtros

| Archivo:línea | Módulo | Destino real | Arreglo | Zona |
|---|---|---|---|---|
| `src/lib/services/pmsDashboardService.ts:128,129,205,206,263,264` | PMS/reportes | rango por defecto («hoy») de KPIs, llegadas y salidas sobre `checkin`/`checkout` · date | `todayInTz` + `toPlainDate` para el rango del usuario | `param`; la firma ya recibe `branchId` |
| `src/lib/services/pmsDashboardService.ts:318,319,414,415` | PMS/reportes | alertas de hoy/mañana y calendario de la semana | `todayInTz` + `nextPlainDay` | `param` + `branch` |
| `src/lib/services/hrmDashboardService.ts:115,209,268,325` | nómina/HRM | KPIs y alertas: hoy, mañana, +30 días sobre `employments`/`shift_assignments` · date | `todayInTz` + aritmética de día | `param` — falta |
| `src/lib/services/parkingDashboardService.ts:68,251,252,326,421` | parking | estadísticas del día, pases por vencer, horas pico | `todayInTz(tz)` | `param`; la firma recibe `branchId` y `organizationId` |
| `src/lib/services/parkingReportService.ts:167,171` | parking | clave de agrupación por día/semana a partir de `parking_sessions.entry_at` · **timestamptz** | `toPlainDate(new Date(entry_at), tz)` | `param`; `parking_sessions.branch_id` |
| `src/lib/services/parkingService.ts:244` | parking | «hoy» que luego se compara con `exit_at?.startsWith(today)` — **doble error**: día UTC contra prefijo UTC de un timestamptz ⚠ ida y vuelta por string | `getDayRange` y comparar instantes | `param` |
| `src/components/parking/reportes/ReportesFilters.tsx:53,54` | parking | rango por defecto del reporte | `getToday()` + `toDate` | `ctx` |
| `src/app/app/parking/reportes/page.tsx:35,36` | parking | rango por defecto de 30 días | `getToday()` | `ctx` |
| `src/lib/services/transportService.ts:216,217,219,220,333` | transporte | rango por defecto de dashboard y estadísticas de hoy | `todayInTz` / `toPlainDate` | `param`; la firma recibe `branchId` |
| `src/lib/services/transportService.ts:577` | transporte | `vehicles.*_expiry <= hoy+N` · date (documentos por vencer) | `todayInTz` + suma de días | `param` |
| `src/lib/services/transportService.ts:720` | transporte | `driver_credentials.license_expiry` / `.medical_certificate_expiry <= hoy+N` · date | ídem | `param` |
| `src/app/app/transporte/mis-envios/page.tsx:286,291,296,301,306,312` | transporte | rangos de filtro (`hoy`, `ayer`, 7/15/30 días, personalizado) sobre `shipments.created_at` · **timestamptz** | `getDateRange(desde, hasta, tz)` | `ctx` + `shipment.branch_id` |
| `src/lib/services/inventoryDashboardService.ts:318,319` | inventario | filtro `lots.expiry_date` entre hoy y +30 · date | `todayInTz` + suma de días | `param` (`organizationId` en la firma) |
| `src/lib/services/timelineService.ts:236` | otros | conteo de eventos de hoy sobre `timeline_unified.event_time` · timestamptz | `getDayRange` | `param` (`organizationId` en la firma) |
| `src/lib/services/taskService.ts:104,146` | otros/PM | filtros `tasks.due_date` · **timestamptz**; :146 además fabrica `T00:00:00Z`/`T23:59:59Z` **en UTC fijo** ⚠ | `getDayRange(dia, tz)` | `param` — falta; `tasks` no tiene `branch_id` |
| `src/app/app/hrm/reportes/page.tsx:43,44` | nómina/HRM | rango por defecto (mes actual) | `getToday()` + cálculo de mes en la zona | `ctx` |
| `src/components/finanzas/bancos/TesoreriaPage.tsx:145,146` | finanzas | rango «año actual hasta hoy» para concentración de pagos | `getToday()` | `ctx` |
| `src/lib/services/integrations/openFinance/treasuryService.ts:268,269,331,652,655,710` | finanzas | proyección de flujo de caja: hoy, horizonte, iteración diaria, alertas a 7 días, inicio de año | `todayInTz` + `nextPlainDay` | `param` (`organizationId` en la firma) |
| `src/lib/services/integrations/openFinance/balanceService.ts:383,384,419` | finanzas | rango de transacciones y curva diaria de saldo | `todayInTz` + `nextPlainDay` | `param` |
| `src/lib/services/integrations/openFinance/transactionSyncService.ts:62,63,401,403,404` | finanzas | rango por defecto de sincronización y `last_sync_at → día` | `todayInTz` + `toPlainDate(new Date(last_sync_at), tz)` | `param` |
| `src/app/app/finanzas/open-finance/page.tsx:143` | finanzas | filtro de conteos de los últimos 30 días | `getToday()` | `ctx` |
| `src/components/finanzas/facturas-venta/FacturasProximasVencer.tsx:55,58` | cuentas por cobrar | filtro `invoice_sales.due_date` entre hoy y hoy+N · **timestamptz** ⚠ | `getDateRange` | `ctx` |
| `src/components/finanzas/cuentas-por-cobrar/service.ts:255` | cuentas por cobrar | `next_reminder_date` — **campo calculado de UI**, no existe en `accounts_receivable` | `todayInTz` + 3 días calendario | `ctx`/`param` |
| `src/components/finanzas/contabilidad/ReportesContablesService.ts:72,75` | contabilidad | fecha objetivo para leer `currency_rates.rate_date` · date (catálogo global) | ver §5 | **SIN FUENTE** en el método; hay `getOrganizationId()` privado que sí podría usarse |
| `src/components/finanzas/monedas/CurrencyConverter.tsx:101,231,267` | finanzas | fecha de consulta de tasas (`currency_rates.rate_date`) | `getToday()` / `toDate` para lo que elige el usuario; la tabla en sí es global | `ctx` |
| `src/components/finanzas/monedas/CurrencyConverter.tsx:210,211` | finanzas | solo `console.log` | `aceptable` — o borrar el log | n/a |
| `src/components/finanzas/monedas/ExchangeRatesTable.tsx:43` | finanzas | filtro `currency_rates.rate_date >= hoy-5` · date | `todayInTz` − 5 días | `ctx` |
| `src/lib/services/openexchangerates.ts:146,155,187` | finanzas | `actual_date` que devuelve el proveedor (`data.timestamp` UTC) | `aceptable`: es el día del proveedor, no el de la organización — justificar en comentario | proveedor |
| `src/lib/services/openexchangerates.ts:1161` | finanzas | lista de fechas hábiles a consultar al proveedor | `aceptable` (mismo motivo) | proveedor |
| `src/lib/services/openexchangerates.ts:603` | finanzas | solo `console.log` | `aceptable` | n/a |
| `src/lib/services/tapeChartService.ts:296,310,379` | PMS | mapa de ocupación y rango de fechas del tape chart, a partir de cadenas `YYYY-MM-DD` | `nextPlainDay` — hoy funciona por casualidad (medianoche UTC + `setDate`), pero es frágil | entrada ya es día calendario |
| `src/app/app/pms/calendario/page.tsx:66,78` | PMS | día inicial del tape chart desde un `Date` de estado | `toDate(startDate)` | `ctx` + `branchFilter` |
| `src/lib/services/crm/timeline/cursor.ts:125` | CRM | día del cursor del timeline, con `BOGOTA_OFFSET_MS` **cableado** | `toPlainDate(new Date(iso), tz)` | **SIN FUENTE** — función pura sin organización; hay que añadir parámetro |
| `src/lib/services/crm/recordingStorageService.ts:60` | CRM | `computeRetentionUntil` — retención de grabaciones | `aceptable` con justificación (política de retención, no día de negocio) o añadir `tz` | **SIN FUENTE** |
| `src/lib/services/crm/email/variables.ts:163` | CRM | fallback del `catch` de un `Intl.DateTimeFormat` que **sí** recibe `timeZone` | `aceptable` — el camino feliz ya es correcto | `param` |
| `src/app/api/ai-assistant/pm-assist/route.ts:30` | otros/IA | `toISODate` auxiliar para el prompt y para `tasks.due_date` | `toPlainDate(d, tz)` | `org` — la ruta tiene `getServerOrgContext()` |
| `src/app/api/ai-assistant/pm-planner/route.ts:81` | otros/IA | «hoy» inyectado en el prompt del modelo | `todayInTz(tz)` | `org` |
| `src/app/api/integrations/google-ads/campaigns/route.ts:23,24` | integraciones | rango por defecto para la API de Google Ads | `aceptable` si se documenta que es el día de la cuenta de Ads; si no, `todayInTz` | `org` |
| `src/app/api/integrations/sendgrid/stats/route.ts:49` | integraciones | rango por defecto de estadísticas de SendGrid | ídem | `org` |
| `src/app/app/gym/clases/page.tsx:182` | gym | fecha sugerida al duplicar una clase (`gym_classes.start_at` · timestamptz) | `getToday()` + `nextPlainDay`, y `plainDateToInstant` al guardar | `ctx` |
| `src/components/calendario/DroppableSlot.tsx:34` | otros | `slotId` de drag&drop, derivado de una prop `date: Date` | `toDate(date)` | `prop`/`ctx` |
| `src/components/integraciones/api-keys/ApiKeyDialog.tsx:244` | integraciones | `min` del `<input type="date">` de expiración (`channel_api_keys.expires_at` · timestamptz) | `getToday()` | `ctx` |
| `src/app/api/web-orders/route.ts:66` | checkout/POS | **fallback** del número de pedido `WO-YYYYMMDD-nnnn` cuando falla la RPC | `todayInTz(tz)` | `org` — `organizationId` está en scope |

### 3.4 P3 — nombres de archivo de descarga, claves y logs (54 ocurrencias)

Todas escriben un día solo dentro de `link.download`, `a.download`,
`setAttribute('download', …)` o un `file_name`. No se guardan como dato de negocio ni se
usan para filtrar. **Arreglo uniforme:** `getToday()` en componente cliente,
`todayInTz(tz)` en servicio. Prioridad baja, pero conviene hacerlas de una sola pasada
porque son mecánicas y cierran módulos enteros para el `overrides` de ESLint.

| Archivo:línea |
|---|
| `src/app/app/chat/auditoria/page.tsx:102` |
| `src/app/app/chat/conversaciones/[id]/actividad/page.tsx:98` |
| `src/app/app/clientes/page.tsx:654,748` |
| `src/app/app/integraciones/eventos/page.tsx:165` |
| `src/app/app/inventario/kardex/page.tsx:166` |
| `src/app/app/inventario/movimientos/page.tsx:216` |
| `src/app/app/inventario/productos/importar/page.tsx:1811` |
| `src/app/app/inventario/stock/page.tsx:183` |
| `src/app/app/notificaciones/logs/page.tsx:98` |
| `src/app/app/parking/espacios/page.tsx:443` |
| `src/app/app/parking/pagos/page.tsx:152` |
| `src/app/app/parking/tarifas/page.tsx:319` |
| `src/app/app/parking/zonas/page.tsx:342` |
| `src/app/app/pos/cupones/[id]/page.tsx:148` |
| `src/app/app/pos/devoluciones/motivos/page.tsx:86` |
| `src/app/app/pos/pedidos-online/page.tsx:536` |
| `src/app/app/timeline/correlaciones/[correlationId]/page.tsx:140` |
| `src/app/app/timeline/[entityType]/[entityId]/page.tsx:301` |
| `src/app/app/transporte/tracking/page.tsx:103` |
| `src/components/admin/RoleAnalytics.tsx:343` |
| `src/components/admin/RolesConfigurationSettings.tsx:175` |
| `src/components/configuracion/panels/timeline/TimelineConfigPanel.tsx:105` |
| `src/components/crm/identidades/IdentidadesService.ts:377` |
| `src/components/crm/reportes/ReportesService.ts:327` |
| `src/components/finanzas/cuentas-por-cobrar/AgingReport.tsx:72` |
| `src/components/finanzas/cuentas-por-cobrar/CuentasPorCobrarFiltros.tsx:58` |
| `src/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage.tsx:101` |
| `src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts:857` (`file_name` de un registro de exportación bancaria: se **persiste**, pero es una etiqueta, no una fecha de negocio) |
| `src/components/finanzas/cuentas-por-pagar/ExportarBancaModal.tsx:241` |
| `src/components/finanzas/cuentas-por-pagar/id/AccountActionsCard.tsx:177` |
| `src/components/finanzas/cuentas-por-pagar/id/CuentaPorPagarDetailPage.tsx:104` |
| `src/components/finanzas/egresos/EgresosPage.tsx:127` |
| `src/components/finanzas/ingresos/IngresosPage.tsx:138` |
| `src/components/finanzas/monedas/ExchangeRateHistory.tsx:181` |
| `src/components/finanzas/notas-credito/NotasCreditoPage.tsx:173` |
| `src/components/finanzas/transferencias/TransferenciasPage.tsx:133` |
| `src/components/inventario/TopSKUTable.tsx:97` |
| `src/components/inventario/productos/CatalogoProductos.tsx:1025,1071` |
| `src/components/inventario/proveedores/CatalogoProveedores.tsx:247,285,323` |
| `src/components/inventario/reportes/ReportesService.ts:344` |
| `src/components/inventario/reportes/costo-recetas/CostoRecetasPage.tsx:63` |
| `src/components/inventario/reportes/trazabilidad/TrazabilidadPage.tsx:140` |
| `src/components/parking/sesiones/useSesiones.ts:249` |
| `src/components/pos/configuracion/consecutivos-ventas/consecutivosService.ts:299` |
| `src/components/pos/devoluciones/ReturnsHistory.tsx:114` |
| `src/components/pos/reportes/reportesService.ts:536` |
| `src/components/timeline/TimelineExportButton.tsx:39,70` |
| `src/components/timeline/eventos/EventActions.tsx:38` |
| `src/lib/services/hrmReportsService.ts:404` |
| `src/lib/services/reservationListService.ts:271` |
| `src/lib/services/spacesService.ts:570` |

---

## 4. Casos de ida y vuelta por string (el mismo valor se guarda y se muestra)

Estos son los que **no se pueden partir** entre Fase B y Fase C: si se arregla solo un
lado, la fecha se corre un día en producción.

| Sitio | Cadena completa |
|---|---|
| Pagos (AR/AP y facturas) | el formulario escribe `'YYYY-MM-DD'` → `payments.payment_date` (**timestamptz**) → se relee con `.split('T')[0]` o `new Date(v).toLocaleDateString()` para el `min`/`max` del mismo input |
| `AccountActionsCard.tsx:407,411,412` (AR) | `new Date(account.invoice_date).toISOString().split('T')[0]` sobre un **timestamptz** de BD: prohibido por la regla 4 |
| `RegistrarPagoModal.tsx:164,313,318` (AP) | ídem con `invoice_purchase.issue_date` |
| `RegistrarPagoDialog.tsx:153,379` (venta) | ídem con `invoice_sales.issue_date` |
| `DetalleFactura.tsx:1223,1226,1239` | ídem, además dentro de la condición que habilita el botón «marcar pagada» |
| `parkingService.ts:244` | `hoy` UTC comparado con `exit_at?.startsWith(hoy)` sobre un **timestamptz** |
| `transactionSyncService.ts:403` | `new Date(link.last_sync_at).toISOString().slice(0,10)` sobre un timestamptz para decidir desde cuándo sincronizar |
| `attendanceService.ts:114-119` | día en UTC + `T00:00:00`/`T23:59:59` **sin offset** contra `attendance_events.event_at` timestamptz |
| `taskService.ts:146,151` | día en UTC + `T00:00:00Z`/`T23:59:59Z` **fijo en UTC** contra `tasks.due_date` timestamptz |
| `serialTrackingService.ts:190,192` | `now.split('T')[0]` para `warranty_start` y el mismo patrón para `warranty_end` |
| `crm/timeline/cursor.ts:125` | `BOGOTA_OFFSET_MS` cableado: en DST o fuera de Colombia da el día equivocado |

---

## 5. Sin fuente de zona (esto es diseño, no reemplazo)

| Sitio | Por qué no hay zona | Qué hay que decidir antes de tocarlo |
|---|---|---|
| `src/lib/services/openexchangerates.ts:347,501,603,687,1161` y `146,155,187` | `currency_rates` es un **catálogo global**: no tiene `organization_id`. No existe «la organización» de una tasa de cambio. | Ya hay precedente en base: `currency_rates.rate_date` tiene `DEFAULT fn_today_system()`. Adoptar explícitamente «día del sistema / del proveedor» y escribirlo en comentario, o introducir una zona de referencia del catálogo. |
| `src/components/finanzas/contabilidad/ReportesContablesService.ts:72,75` | Método `static` que lee el catálogo global; no recibe organización. | Igual que el anterior. La clase **sí** tiene `getOrganizationId()` privado: si se decide que la fecha de corte es la del negocio, usarlo. |
| `src/lib/services/crm/timeline/cursor.ts:125` | Función pura de paginación con `BOGOTA_OFFSET_MS` cableado. | Añadir `timezone` a la firma y propagarlo desde quien pagina; o declarar el cursor en UTC y documentarlo. Hoy es un `America/Bogota` cableado que viola la regla 6. |
| `src/lib/services/crm/recordingStorageService.ts:60` | `computeRetentionUntil(days, from)` — política de retención, sin organización. | Decidir si la retención se cuenta en días UTC (aceptable) o en días de la organización. |
| `src/lib/services/employeeLoansService.ts` (todo el archivo) | El servicio no recibe `organizationId` ni `branchId` en ninguna firma. | Cambio de firma: añadir la organización (o un `timezone`) a `approve`, `registerPayment` y `generateInstallments`. **No se puede arreglar sin tocar a los llamadores.** |
| `src/lib/services/employmentCompensationService.ts:144,223` | Mismo caso. | Mismo cambio de firma. |
| `src/lib/services/payrollService.ts:570` | Mismo caso, y elige la **tabla de retenciones aplicable**. | Mismo cambio de firma. Alta consecuencia: un día de diferencia puede cambiar el año de la norma. |
| `src/lib/services/gymService.ts:473,523` | `membership_freezes` no tiene `organization_id` ni `branch_id`; se llega por `membership_id`. | Resolver la organización a través de `memberships.organization_id` (que sí existe) y pasarla, o añadir la columna. |
| `src/lib/services/housekeepingService.ts:128` y `checkoutService.ts:1017` | `housekeeping_tasks` no tiene `branch_id`; la sucursal está en `spaces.branch_id`. | Decidir si se resuelve por `space_id → spaces.branch_id` (correcto, una consulta más) o si se acepta la zona de la organización. |
| `src/lib/services/taskService.ts:104,146` | `tasks` no tiene `branch_id` y el servicio no recibe organización. | Zona de la organización; hace falta añadir el parámetro. |
| `src/lib/services/crm/pmsCrmLink.ts:119,120` | Función de enlace CRM→PMS sin organización en la firma. | Añadir parámetro; la oportunidad de CRM sí conoce su organización. |
| `src/components/pos/propinas/propinasService.ts:97` y `reservas-mesas/reservasMesasService.ts:176` | Servicios de cliente sin organización en la firma. | Añadir parámetro o leer el contexto desde el componente y pasarlo. |

Nota transversal: **ningún** servicio de `src/lib/services/` llama todavía a
`fn_timezone_for` ni a `getOrganizationTimezone`. Hoy la zona solo está disponible en
componentes cliente a través del contexto. Los ~90 call-sites marcados `param` requieren
decidir **una sola vez** cómo entra la zona en la capa de servicios (parámetro explícito
vs. resolutor por `organizationId`), y hacerlo antes de la primera tanda de servicios.

---

## 6. Plan de tandas (30–40 ocurrencias por commit, agrupadas por módulo)

Cada tanda: un commit, un test con `TZ=UTC` y `TZ=America/Bogota`, y la ruta añadida al
bloque `overrides` de `.eslintrc.json` con `error`.

**Tanda 0 — decisión previa, sin código de producción.** Cómo entra la zona en
`src/lib/services/**`. Sin esto, las tandas 3, 5, 7 y 8 no se pueden cerrar.

| # | Tanda | Ocurrencias | Archivos | Prioridad |
|---:|---|---:|---:|---|
| 1 | **Contabilidad y períodos**: `periodos-fiscales`, `periodos-contables`, `asientos`, `balance-general`, `balance-comprobacion`, `estado-resultados`, `mayor-contable`, `activos-fijos` | 19 | 10 | P0 |
| 2 | **Cartera: pagos y vencimientos** (AR + AP + facturas de venta y compra). Incluye la ida y vuelta por string, así que **cierra escritura y presentación a la vez** | 35 | 9 | P0 |
| 3 | **Nómina y HRM** (`employeeLoansService`, `employmentsService`, `employmentCompensationService`, `payrollService`, `attendanceService`, `timesheetConsolidationService`, páginas de compensación, préstamos, timesheets, reportes) | 27 | 12 | P0/P1 |
| 4 | **Vigencias que cortan servicio**: `parking_passes` (abonados, operación, `parkingService`), `membership_freezes` (gym), `promotions` (wizard), `serial_numbers` (garantías), `channel_api_keys` | 14 | 7 | P0 |
| 5 | **PMS operación**: check-in, check-out, housekeeping, asignación de habitaciones, bloqueos, grupos, consumo de espacio, iCal (servicio y ruta) | 30 | 11 | P1 |
| 6 | **PMS presentación y tape chart**: `pmsDashboardService`, `tapeChartService`, calendario, reservas, `pmsCrmLink` | 21 | 5 | P1/P2 |
| 7 | **Transporte**: viajes, manifiestos, envíos, tiquetes, tracking, rutas, `transportService`, `mis-envios` | 26 | 11 | P1/P2 |
| 8 | **Parking reportes y dashboard**: `parkingDashboardService`, `parkingReportService`, filtros y página de reportes | 11 | 4 | P2 |
| 9 | **Finanzas: open finance y tesorería** (`treasuryService`, `balanceService`, `transactionSyncService`, `TesoreriaPage`, página de open finance) | 21 | 5 | P2 |
| 10 | **Finanzas: monedas** (`openexchangerates`, `currencyService`, `CurrencyConverter`, `ExchangeRatesTable`, `ReportesContablesService`). **Requiere la decisión de §5 sobre el catálogo global** | 20 | 6 | P2 |
| 11 | **POS, CRM y resto de P2**: reservas de mesa, propinas, pedidos web, `taskService`, `timelineService`, `cursor.ts`, rutas de IA, integraciones externas, `DroppableSlot`, gym clases, inventario dashboard | 30 | 16 | P2 |
| 12 | **Nombres de descarga, bloque A**: finanzas, contabilidad, cartera, inventario | 30 | 22 | P3 |
| 13 | **Nombres de descarga, bloque B**: POS, parking, PMS, transporte, timeline, chat, admin, CRM, notificaciones, integraciones | 24 | 20 | P3 |

Suma: 308 filas de tanda sobre 285 ocurrencias tocables; la diferencia son los archivos
que aparecen en dos tandas (por ejemplo `AccountActionsCard.tsx`, que tiene escritura P0 y
nombre de descarga P3). En cada uno de esos casos **el archivo se toca una sola vez, en la
tanda de mayor prioridad**, y la fila P3 se tacha al cerrar.

Regla de oro para quien ejecute: si la columna destino es `timestamptz` (columna **⚠** en
§1), la tanda **debe** incluir la lectura correspondiente de la Fase C. Si es `date`, se
pueden separar.
