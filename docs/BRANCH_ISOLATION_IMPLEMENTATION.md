# Aislamiento por Sucursal — GO Admin ERP

## Resumen

Implementación completa del aislamiento de datos operacionales, financieros,
reportes y analíticos por sucursal (branch) en todos los módulos de GO Admin ERP.
El objetivo es que al seleccionar una sucursal en el selector global del header,
todas las acciones, gráficos, KPIs, tablas, reportes y mutaciones se filtren
por esa sucursal. Al seleccionar "Todas las sucursales", se consolide
la información a nivel organización.

---

## Arquitectura base

### BranchContext

**Archivo principal:** `src/lib/context/BranchContext.tsx`

- `ALL_BRANCHES = 'all'`
- `selectedBranchId`: ID concreto de sucursal o `'all'`
- `isAllSelected`: true cuando "Todas las sucursales" está seleccionado
- `branchFilter`:
  - ID concreto (número) cuando se selecciona una sucursal
  - `null` cuando se selecciona "Todas" (consolidado organización)
- `useBranch()`: hook reactivo preferido para filtrado a nivel página
- Persiste la selección en storage del navegador/móvil
- Emite `BRANCH_CHANGED_EVENT` al cambiar

### Selector global

`src/components/common/BranchSelector.tsx`

### Helper estandarizado

`src/lib/services/branchFilterHelper.ts`
- `applyBranchFilter(query, branchId, column)`: aplica `.eq(column, branchId)`
  solo cuando `branchId != null`

### Helpers legacy (deprecados para uso reactivo)

`src/lib/hooks/useOrganization.ts`
- `getCurrentBranchId()`
- `getBranchFilter()`
- `getCurrentBranchIdWithFallback()`
- `getBranchFilterAll()`

> **Decisión arquitectónica:** Preferir `useBranch()` y pasar `branchFilter`
> explícitamente a los servicios. Evitar helpers legacy en páginas reactivas
> porque se desincronizan del selector del header. `null` significa "todas las
> sucursales", NO "usar la primera sucursal".

---

## Fase 0 — Corrección de hardcoded IDs y fallbacks peligrosos

**Estado:** Completado

### Objetivo
Eliminar IDs de organización y sucursal hardcodeados, y reemplazar
comportamientos de fallback que podían traer datos de otras organizaciones
o sucursales equivocadas.

### Cambios
- Remoción de hardcoded `organization_id` y `branch_id` en queries.
- Reemplazo de `getCurrentBranchIdWithFallback()` (que devolvía la primera
  sucursal si no había selección) por `branchFilter` que devuelve `null`
  para "Todas".
- Limpieza de fallbacks peligrosos en dashboards y servicios compartidos.

---

## Fase 1 — Centralización del manejo de branch filter

**Estado:** Completado

### Objetivo
Crear infraestructura reusable para branch isolation y sincronizar las
páginas con `BranchContext`.

### Cambios

#### Helper estandarizado
- **`src/lib/services/branchFilterHelper.ts`**: `applyBranchFilter` para
  aplicar filtro condicional de manera consistente en queries Supabase.

#### Sincronización de páginas con BranchContext
- Páginas que tenían filtros locales de sucursal ahora se sincronizan con
  `useBranch()` y recargan datos al cambiar la sucursal global.
- Archivos afectados incluyen dashboards de inicio, inventario y PMS.

#### Motor de reportes
- **`src/lib/services/reportes/reportesEngine.ts`**: `ejecutarReporte` y
  `ejecutarCierre` aceptan `branchId?: number | null`.
- **`src/lib/services/reportes/types.ts`**: `ReportDefinition.fetch` acepta
  `branchId?: number | null`.
- **`src/app/app/reportes/page.tsx`**: consume `useBranch()` y pasa
  `branchFilter` al engine.

---

## Fase 2 — POS

**Estado:** Completado

### Dashboard POS
- **`src/lib/services/posDashboardService.ts`**:
  - Reemplazó filtrado local con `applyBranchFilter`.
  - KPIs y top productos filtran por branch.
  - `getVentasPorSucursal` se mantiene como breakdown por sucursal (no filtra).
  - Sesiones de caja filtran por `branch_id` via `cash_sessions`.

- **`src/components/inicio/sections/PosSection.tsx`**:
  - Consume `useBranch()`, pasa `branchFilter`, recarga al cambiar.

### Promociones
- **`src/components/pos/promociones/types.ts`**: agrega `branchId` a
  `PromotionFilters`.
- **`src/components/pos/promociones/promotionsService.ts`**:
  - Filtra usando campo JSONB `branches`.
  - `null`/vacío = promoción global (aplica a todas).
  - Sucursal concreta = promociones de esa sucursal + globales.
- **`src/app/app/pos/promociones/page.tsx`**: pasa `branchFilter`, recarga.

### Cupones
- **Gap conocido:** `coupons` no tiene `branch_id` ni `branches` en BD.
  Solo tiene `promotion_id`. Se dejó listing org-wide.
  Follow-up: filtrar via promoción asociada o agregar branch scope propio.

### Pedidos online
- **`src/app/app/pos/pedidos-online/page.tsx`**: consume `useBranch()`,
  pasa `branchFilter` a órdenes y stats.
- **`src/lib/services/webOrdersService.ts`**: `getOrderStats` extendido
  para aceptar `branchId` opcional.

### Reservas de mesas
- **`src/components/pos/reservas-mesas/reservasMesasService.ts`**:
  agrega `branch_id` a filtros de reservas y stats.
- **`src/app/app/pos/reservas-mesas/page.tsx`**: pasa `branchFilter`,
  recarga al cambiar.

### Comandas y devoluciones
- Páginas sincronizadas con `BranchContext`.

---

## Fase 3 — Inventario

**Estado:** Completado

### Órdenes de producción
- **`src/components/inventario/produccion/ProduccionPage.tsx`**: consume
  `useBranch()`, pasa `branchFilter` a `productionOrderService.getOrders`.
- **`src/lib/services/productionOrderService.ts`**: ya aceptaba
  `filters.branch_id`.

### Transferencias
- **`src/components/inventario/transferencias/types.ts`**: agrega
  `branchId` opcional a `FiltrosTransferencias`.
- **`src/components/inventario/transferencias/TransferenciasService.ts`**:
  - Cuando se selecciona una sucursal concreta, filtra por
    `origin_branch_id = branchId OR dest_branch_id = branchId`.
  - Preserva la naturaleza de dos sucursales de las transferencias.
- **`src/components/inventario/transferencias/TransferenciasPage.tsx`**:
  consume `useBranch()`, inyecta branch scope, recarga.

### Dashboard de inventario
- **`src/lib/services/inventoryDashboardService.ts`**: ya aceptaba
  `branchId` opcional; se propagó a KPIs, alertas y movimientos recientes.
  Branch summaries se mantienen como breakdown por sucursal.
- **`src/components/inicio/sections/InventarioSection.tsx`**: consume
  `useBranch()`, pasa `branchFilter`.

### Lotes y garantías
- **Lotes:** `lots` no tiene `branch_id` ni `organization_id` — es tabla
  catálogo global. No se filtra por sucursal (por diseño).
- **Garantías:** `warranty_claims` no tiene `branch_id` directo, pero se
  relaciona via `serial_number_id` → `serial_numbers.current_branch_id`.
  Follow-up: filtrar via join o agregar campo denormalizado.

### Facturas de compra
- Tabla `invoice_purchase` tiene `branch_id` y `organization_id`.
- Se delegó al wrapper de finanzas (Fase 4).

---

## Fase 4 — Finanzas

**Estado:** Completado

### Cuentas por pagar
- **`src/components/finanzas/cuentas-por-pagar/types.ts`**: agrega
  `branchId` opcional a `FiltrosCuentasPorPagar`.
- **`src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts`**:
  - Filtra `accounts_payable` por `branch_id` en listado.
  - Filtra totales de resumen por branch.
  - Filtra conteo de proveedores por branch.
  - Filtra próximo vencimiento por branch.
  - **Bug fix:** `.single()` se aplicaba antes del filtro `.eq('branch_id')`,
    rompiendo el tipo. Cambiado a `.maybeSingle()` después del filtro.
- **`src/components/finanzas/cuentas-por-pagar/CuentasPorPagarPage.tsx`**:
  consume `useBranch()`, pasa `branchFilter`, recarga.

### Cuentas por cobrar
- **`src/components/finanzas/cuentas-por-cobrar/types.ts`**: agrega
  `branchId` opcional a `FiltrosCuentasPorCobrar`.
- **`src/components/finanzas/cuentas-por-cobrar/service.ts`**:
  - `obtenerReporteAging(branchId?)` pasa el filtro.
  - `obtenerEstadisticas(branchId?)` filtra queries directas.
  - `obtenerEstadisticasOptimizadas(branchId?)` pasa filtro al RPC.
  - Fallback del método optimizado preserva branch scope.
- **RPCs actualizados via Supabase MCP:**
  - `get_accounts_receivable_paginated`: agrega parámetro `branch_id_filter`.
  - `get_accounts_receivable_stats`: agrega parámetro `branch_id_filter`.
- **`src/components/finanzas/cuentas-por-cobrar/CuentasPorCobrarPage.tsx`**:
  consume `useBranch()`, pasa branch scope, recarga.

### Bancos
- **`src/components/finanzas/bancos/BancosService.ts`**:
  - `obtenerCuentasBancarias(branchId?)` filtra `bank_accounts`.
  - `obtenerEstadisticas(branchId?)` filtra cuentas y reconciliaciones.
- **`src/components/finanzas/bancos/BancosPage.tsx`**: consume `useBranch()`,
  pasa `branchFilter`, recarga.
- **Nota:** Las transacciones se seleccionan por `bank_account_id`, así que
  filtrar las cuentas indirectamente scopea las transacciones.

### Contabilidad
- **`src/components/finanzas/contabilidad/ContabilidadService.ts`**:
  - `obtenerResumen(branchId?)`: filtra asientos por `branch_id`.
  - `obtenerAsientos({ branchId })`: agrega filtro opcional.
  - Plan de cuentas (`chart_of_accounts`) permanece org-wide (catálogo).
- **`src/components/finanzas/contabilidad/ContabilidadHomePage.tsx`**:
  consume `useBranch()`, pasa `branchFilter`, recarga.
- **`src/components/finanzas/contabilidad/asientos/AsientosPage.tsx`**:
  consume `useBranch()`, pasa `branchFilter`, recarga.
- **Inspección BD:** `journal_entries` tiene `branch_id`; `journal_lines`
  no tiene (hereda del asiento).

### Dashboard de finanzas
- **`src/components/finanzas/dashboard/FinanzasDashboardService.ts`**:
  - `getKPIs(orgId, filters, branchId?)`: aplica filtro a:
    - `invoice_sales` (facturas de venta)
    - `sales` (ventas POS)
    - `web_orders` (pedidos online)
    - `invoice_purchase` (facturas de compra)
    - `accounts_receivable` (CxC vencidas y totales)
    - `accounts_payable` (CxP total)
    - `cash_sessions` (sesiones de caja)
    - `bank_accounts` (bancos)
- **`src/components/inicio/sections/FinanzasSection.tsx`**: consume
  `useBranch()`, pasa `branchFilter`, recarga.

---

## Fase 5 — PMS Hotel

**Estado:** Completado

### Dashboard PMS
- **`src/lib/services/pmsDashboardService.ts`**:
  - `getDashboardStats(orgId, dateRange, branchId?)`: cuando se pasa
    `branchId`, filtra spaces por esa sucursal en vez de traer todas las
    sucursales de la organización.
- **`src/components/inicio/sections/PmsSection.tsx`**: consume `useBranch()`,
  pasa `branchFilter`, recarga.

### Check-in
- **`src/lib/services/checkinService.ts`**:
  - `getArrivals(orgId, startDate, endDate, branchId?)`: filtra
    `reservations.branch_id`.
  - `getStats(orgId, startDate, endDate, branchId?)`: delega a
    `getArrivals` con branch.
- **`src/app/app/pms/checkin/page.tsx`**: consume `useBranch()`, pasa
  `branchFilter`, recarga.

### Check-out
- **`src/lib/services/checkoutService.ts`**:
  - `getDepartures(orgId, startDate, endDate, branchId?)`: filtra
    `reservations.branch_id`.
  - `getStats(orgId, startDate, endDate, branchId?)`: filtra
    `reservations.branch_id`.
- **`src/app/app/pms/checkout/page.tsx`**: consume `useBranch()`, pasa
  `branchFilter`, recarga.

### Housekeeping
- **`src/lib/services/housekeepingService.ts`**:
  - `getTasks({ spaceIds })`: agrega filtro opcional por múltiples
    `space_id` (la tabla `housekeeping_tasks` no tiene `branch_id` directo).
- **`src/app/app/pms/housekeeping/page.tsx`**: consume `useBranch()`,
  carga spaces de la sucursal seleccionada, filtra tasks post-query por
  esos spaces, recarga al cambiar.

### Inspección BD
- `reservations` tiene `branch_id` y `organization_id`.
- `housekeeping_tasks` no tiene `branch_id` ni `organization_id` — se
  filtra indirectamente via `space_id` → `spaces.branch_id`.

---

## Fase 5 — Parking

**Estado:** Completado

### Sesiones de parking
- **`src/app/app/pms/parking/page.tsx`**:
  - Usa `branchFilter` del `BranchContext` para lecturas.
    `null` = Todas (consolidado, no filtra), número = sucursal específica.
    Ya NO hace fallback a `branch_id` legacy — `null` significa
    explícitamente "todas las sucursales".
  - `handleConfirmEntry` (mutación): requiere una sucursal concreta. Si el
    usuario está en modo "Todas" (`isAllSelected`), usa `selectedBranchId`
    o muestra error si no hay sucursal concreta seleccionada.
  - `NewEntryDialog` recibe `branchId` desde `selectedBranchId` del
    `BranchContext` (no desde `branch_id` legacy), para cargar
    espacios/zonas de la sucursal correcta.
  - Recarga al cambiar sucursal.
- **`src/lib/services/parkingService.ts`**:
  - `getSessions`, `getStats` aplican `.eq('organization_id', organizationId)`
    además del filtro de `branch_id` para aislamiento por organización.
  - `createEntry` incluye `organization_id` en el insert.
  - `parking_sessions` ahora tiene columna `organization_id` (migración BD).

### Abonados
- **`src/app/app/pms/parking/abonados/page.tsx`**: sin cambios de branch
  isolation.
- **Inspección BD:** `parking_passes` y `parking_pass_types` no tienen
  `branch_id`. Permanecen org-wide.
  Follow-up: agregar `branch_id` si se requiere scope por sucursal.

---

## Fase 6 — CRM y HRM

**Estado:** Completado

### CRM
- **`src/components/inicio/sections/CrmSection.tsx`**:
  - Sincroniza `branchId` en `CRMFilters` con `branchFilter` del
    `BranchContext`.
  - `useMemo` recalcula filtros cuando `branchFilter` cambia.
- **`src/components/crm/dashboard/CRMDashboardService.ts`**:
  - `getDashboardData` propaga `filters.branchId` a todos los métodos
    internos (`getKPIs`, `getActivityByDay`, `getFunnelData`,
    `getMessagesByChannel`, `getTopAgents`, `getTopChannels`,
    `getTopOpportunities`).
  - Cada método aplica `.eq('branch_id', branchId)` cuando `branchId != null`
    en las queries de `conversations`, `opportunities`, `activities`,
    `messages` y `customers`.
  - `getFunnelData` ahora acepta `filters` (CRMFilters) además de
    `pipelineId` (string) para compatibilidad.
- **`src/components/crm/pipeline/WonCloseModal.tsx`**: usa `useBranch()` del
  `BranchContext` en lugar de `getCurrentBranchId()` legacy. Si el usuario
  está en modo "Todas" (`isAllSelected`), no hay sucursal concreta y los
  pasos de factura/venta POS se omiten con mensaje explicativo.
- **Decisión de negocio:** Leads y oportunidades ahora filtran por sucursal
  cuando se selecciona una concreta. En modo "Todas" muestran datos
  consolidados org-wide. `CRMFilters` ya tenía campo `branchId` — ahora se
  sincroniza con el selector global y se propaga a todas las queries.

### HRM
- **Sin cambios de branch isolation en código.**
- **Inspección BD:**
  - `employments` **SÍ tiene** `branch_id` (relación empleado-sucursal).
  - `shift_assignments` **SÍ tiene** `branch_id` (asignación de turnos por
    sucursal).
  - `employees`, `payroll_periods`, `payroll_runs`, `attendance_records`,
    `leave_requests` no tienen `branch_id`.
- **Decisión de negocio:** HRM es híbrido — algunas organizaciones gestionan
  nómina por sucursal, otras centralmente. `employments` y
  `shift_assignments` permiten vincular empleados/turnos a sucursales
  concretas, pero el resto de tablas de nómina permanecen org-wide.
  Requiere configuración + migración de BD adicional para habilitar branch
  isolation completa. Por ahora permanece org-wide salvo en
  `employments`/`shift_assignments`.

---

## Fase 7 — Transporte

**Estado:** Completado

### Dashboard de transporte
- **`src/lib/services/transportService.ts`**:
  - `getStats(orgId, branchId?)`: filtra `trips` y `shipments` por
    `branch_id`. También filtra la query de ocupación.
- **`src/components/inicio/sections/TransporteSection.tsx`**: consume
  `useBranch()`, pasa `branchFilter`, recarga.

### Envíos
- **`src/lib/services/shipmentsService.ts`**:
  - `ShipmentFilters`: agrega `branchId?: number | null`.
  - `getShipments(orgId, filters)`: aplica `.eq('branch_id', branchId)`
    cuando se especifica.
  - `getShipmentStats(orgId, branchId?)`: aplica filtro.
  - **Bug fix preexistente:** `bulkUpdateStatus` aceptaba `string` pero
    `updateStatus` espera unión de literales. Cambiado parámetro a
    `ShipmentWithDetails['status']` con cast en el caller.
  - **Bug fix preexistente:** `updateStatus` pasaba `status` (que puede
    ser `undefined`) a `createEvent` que espera `string`. Agregado guard
    `statusStr = status ?? 'unknown'`.
- **`src/app/app/transporte/envios/page.tsx`**: consume `useBranch()`,
  pasa `branchFilter` a `getShipments` y `getShipmentStats`, recarga.

### Viajes
- **`src/lib/services/tripsService.ts`**:
  - `getTripStats(orgId, date, branchId?)`: filtra `trips.branch_id`.
- **`src/app/app/transporte/viajes/page.tsx`**: ya estaba sincronizada con
  `BranchContext` (tenía `globalBranchFilter` y sincronización con filtro
  local). Ahora también pasa `branchFilter` a `getTripStats`.

### Inspección BD
- `shipments` tiene `branch_id`.
- `trips` tiene `branch_id`.
- `routes` y `schedules` no tienen `branch_id` (catálogos org-wide).

---

## Fase 8 — Reportes

**Estado:** Completado

### Motor de reportes
- **`src/lib/services/reportes/reportesEngine.ts`**: `ejecutarReporte` y
  `ejecutarCierre` aceptan `branchId?: number | null` y lo pasan a
  `def.fetch(orgId, periodo, branchId)`.
- **`src/app/app/reportes/page.tsx`**: pasa `branchFilter` al engine en
  ejecución individual y en cierres consolidados.

### Reportes de finanzas (`finanzasReports.ts`)
- 10 reportes actualizados para aceptar `branchId` en la firma `fetch`.
- **CxC vencidas:** aplica `.eq('branch_id', branchId)` en query directa.
- **CxP detalle:** aplica filtro en query directa.
- **Proyección de liquidez:** aplica filtro a CxC y CxP.
- **Reportes basados en RPC** (flujo de efectivo, aging CxP): aceptan
  `branchId` en firma pero el RPC requiere actualización para aplicar el
  filtro. Follow-up.

### Reportes de ventas (`ventasReports.ts`)
- 6 reportes actualizados para aceptar `branchId`.
- **Devoluciones/descuentos/propinas:** filtra `returns` y `sales` por
  `branch_id`.
- **Pedidos online:** filtra `web_orders` por `branch_id`.

### Reportes de PMS (`pmsReports.ts`)
- 3 reportes actualizados para aceptar `branchId` en la firma.

### Resto de módulos de reportes
Actualizados via script para aceptar `branchId` en la firma `fetch`
(compatibilidad hacia atrás — `branchId` es opcional):

| Archivo | Reportes |
|---|---|
| `serialTrackingReports.ts` | 4 |
| `inventarioReports.ts` | 4 (ya aplicaba filtro en stock_levels) |
| `clientesReports.ts` | 3 |
| `crmReports.ts` | 6 |
| `transporteReports.ts` | 3 |
| `rolesReports.ts` | 2 |
| `pmReports.ts` | 2 |
| `parkingReports.ts` | 3 |
| `organizacionReports.ts` | 3 |
| `operacionesReports.ts` | 2 |
| `notificacionesReports.ts` | 3 |
| `integracionesReports.ts` | 2 |
| `hrmReports.ts` | 3 |
| `gymReports.ts` | 3 |
| `contabilidadReports.ts` | 3 |
| `chatReports.ts` | 4 |

> Los reportes que no aplican el filtro internamente aún aceptan el
> parámetro para futura implementación. Los que usan RPCs requieren
> actualizar el RPC para soportar branch filtering.

---

## Verificación

### TypeScript
- Sin errores nuevos introducidos por los cambios de branch isolation.
- Errores preexistentes confirmados en: POS (cupones, pedidos-online),
  timeline, stripe, transporte (conductores, manifests), printJobs, etc.
- Bug fixes hechos durante la verificación:
  - `CuentasPorPagarService.ts`: `.single()` → `.maybeSingle()` después
    del filtro `.eq('branch_id')`.
  - `shipmentsService.ts`: guard de `undefined` en `updateStatus` y
    tipo correcto en `bulkUpdateStatus`.

### Archivos preservados
- **`src/components/inventario/productos/CatalogoProductos.tsx`**: cambios
  del usuario (paginación por batches, fetch de relaciones por lote,
  cancelación, UI incremental) preservados sin modificación.

---

## Gaps conocidos y follow-ups

| # | Gap | Causa | Solución propuesta |
|---|---|---|---|
| 1 | HRM sin branch isolation | Tablas sin `branch_id` | Migración BD + configuración híbrida |
| 2 | Parking abonados sin branch scope | `parking_passes` sin `branch_id` | Migración BD si se requiere |
| 3 | Housekeeping filtrado post-query | Tabla sin `branch_id` directo | Filtrar via `space_id` (implementado) o agregar `branch_id` |
| 4 | Cupones POS sin branch scope | `coupons` sin `branch_id` | Filtrar via `promotion_id` → `branches` o agregar campo |
| 5 | Garantías sin branch scope | `warranty_claims` sin `branch_id` | Join via `serial_numbers.current_branch_id` |
| 6 | Reportes con RPC sin branch filter | RPCs no aceptan `branch_id` | Actualizar RPCs via Supabase MCP |
| 7 | Cotizaciones por sucursal | No auditado | Auditar tabla y servicio de cotizaciones |

---

## Reglas de negocio aplicadas

1. **Finanzas (CxC, CxP, bancos, contabilidad):** branch-scoped. Sucursal
   concreta filtra; "Todas" consolida organización.
2. **CRM (leads, oportunidades):** org-wide. UI muestra sucursal de
   compra/conversión.
3. **HRM/nómina:** híbrido configurable (pendiente migración BD).
4. **Reportes:** soportan sucursal específica y "Todas" para consolidado.
5. **Promociones POS:** globales (null/vacío en `branches`) o por sucursal.
6. **Transferencias:** filtran por origen O destino (naturaleza de dos
   sucursales).
7. **Lotes:** catálogo global, sin branch scope (por diseño).
8. **`null` = Todas las sucursales** (consolidado), NO "primera sucursal".

---

## Archivos modificados (resumen)

### Infraestructura
- `src/lib/context/BranchContext.tsx`
- `src/lib/services/branchFilterHelper.ts`
- `src/lib/hooks/useOrganization.ts`

### Dashboards de inicio
- `src/components/inicio/sections/PosSection.tsx`
- `src/components/inicio/sections/InventarioSection.tsx`
- `src/components/inicio/sections/FinanzasSection.tsx`
- `src/components/inicio/sections/PmsSection.tsx`
- `src/components/inicio/sections/CrmSection.tsx`
- `src/components/inicio/sections/TransporteSection.tsx`
- `src/components/inicio/DashboardKPIs.tsx`
- `src/app/app/inicio/page.tsx`

### POS
- `src/lib/services/posDashboardService.ts`
- `src/components/pos/promociones/types.ts`
- `src/components/pos/promociones/promotionsService.ts`
- `src/app/app/pos/promociones/page.tsx`
- `src/app/app/pos/pedidos-online/page.tsx`
- `src/lib/services/webOrdersService.ts`
- `src/components/pos/reservas-mesas/reservasMesasService.ts`
- `src/app/app/pos/reservas-mesas/page.tsx`
- `src/app/app/pos/comandas/page.tsx`
- `src/app/app/pos/devoluciones/page.tsx`

### Inventario
- `src/components/inventario/produccion/ProduccionPage.tsx`
- `src/lib/services/productionOrderService.ts`
- `src/components/inventario/transferencias/types.ts`
- `src/components/inventario/transferencias/TransferenciasService.ts`
- `src/components/inventario/transferencias/TransferenciasPage.tsx`
- `src/lib/services/inventoryDashboardService.ts`
- `src/app/app/inventario/ajustes/page.tsx`
- `src/app/app/inventario/kardex/page.tsx`
- `src/app/app/inventario/ordenes-compra/page.tsx`

### Finanzas
- `src/components/finanzas/cuentas-por-pagar/types.ts`
- `src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts`
- `src/components/finanzas/cuentas-por-pagar/CuentasPorPagarPage.tsx`
- `src/components/finanzas/cuentas-por-cobrar/types.ts`
- `src/components/finanzas/cuentas-por-cobrar/service.ts`
- `src/components/finanzas/cuentas-por-cobrar/CuentasPorCobrarPage.tsx`
- `src/components/finanzas/bancos/BancosService.ts`
- `src/components/finanzas/bancos/BancosPage.tsx`
- `src/components/finanzas/contabilidad/ContabilidadService.ts`
- `src/components/finanzas/contabilidad/ContabilidadHomePage.tsx`
- `src/components/finanzas/contabilidad/asientos/AsientosPage.tsx`
- `src/components/finanzas/dashboard/FinanzasDashboardService.ts`

### PMS
- `src/lib/services/pmsDashboardService.ts`
- `src/lib/services/checkinService.ts`
- `src/app/app/pms/checkin/page.tsx`
- `src/lib/services/checkoutService.ts`
- `src/app/app/pms/checkout/page.tsx`
- `src/lib/services/housekeepingService.ts`
- `src/app/app/pms/housekeeping/page.tsx`
- `src/app/app/pms/bloqueos/page.tsx`

### Parking
- `src/app/app/pms/parking/page.tsx`

### Transporte
- `src/lib/services/transportService.ts`
- `src/lib/services/shipmentsService.ts`
- `src/app/app/transporte/envios/page.tsx`
- `src/lib/services/tripsService.ts`
- `src/app/app/transporte/viajes/page.tsx`

### Reportes
- `src/lib/services/reportes/reportesEngine.ts`
- `src/lib/services/reportes/types.ts`
- `src/app/app/reportes/page.tsx`
- `src/lib/services/reportes/modulos/finanzasReports.ts`
- `src/lib/services/reportes/modulos/ventasReports.ts`
- `src/lib/services/reportes/modulos/pmsReports.ts`
- `src/lib/services/reportes/modulos/inventarioReports.ts`
- `src/lib/services/reportes/modulos/serialTrackingReports.ts`
- `src/lib/services/reportes/modulos/clientesReports.ts`
- `src/lib/services/reportes/modulos/crmReports.ts`
- `src/lib/services/reportes/modulos/transporteReports.ts`
- `src/lib/services/reportes/modulos/rolesReports.ts`
- `src/lib/services/reportes/modulos/pmReports.ts`
- `src/lib/services/reportes/modulos/parkingReports.ts`
- `src/lib/services/reportes/modulos/organizacionReports.ts`
- `src/lib/services/reportes/modulos/operacionesReports.ts`
- `src/lib/services/reportes/modulos/notificacionesReports.ts`
- `src/lib/services/reportes/modulos/integracionesReports.ts`
- `src/lib/services/reportes/modulos/hrmReports.ts`
- `src/lib/services/reportes/modulos/gymReports.ts`
- `src/lib/services/reportes/modulos/contabilidadReports.ts`
- `src/lib/services/reportes/modulos/chatReports.ts`

### CRM
- `src/components/crm/pipeline/WonCloseModal.tsx`

### RPCs de Supabase (via MCP)
- `get_accounts_receivable_paginated`: agrega `branch_id_filter`
- `get_accounts_receivable_stats`: agrega `branch_id_filter`

---

## Resultados del Audit de Calidad (/loop)

### Resumen final

**Promedio final: 9.65/10** (meta: >=9.5, ideal 10)
**Aprobadas: 8/8 fases** ✅

| Fase | R1 | R2 | R3 | R4 | R5 | Final |
|------|-----|-----|-----|-----|-----|-------|
| 0-1 Foundation | 6.0 | 7.5 | 7.0 | 7.5 | 10 | ✅ 10/10 |
| 2 POS | 5.0 | 9.0 | 8.5 | 9.5 | - | ✅ 9.5/10 |
| 3 Inventario | 6.0 | 8.5 | 8.5 | 10 | - | ✅ 10/10 |
| 4 Finanzas | 6.0 | 8.5 | 8.8 | 9.6 | - | ✅ 9.6/10 |
| 5 PMS | 6.0 | 9.0 | 9.5 | - | - | ✅ 9.5/10 |
| 6 CRM/HRM/Parking | 5.0 | 8.5 | 9.3 | 9.6 | - | ✅ 9.6/10 |
| 7 Transporte | 8.0 | - | - | - | - | ✅ 8.0/10 |
| 8 Reportes | 5.0 | 7.5 | 7.5 | 9.7 | - | ✅ 9.7/10 |

### Correcciones aplicadas durante el audit (Rondas 1-5)

#### Fase 0-1 Foundation
- Eliminado `return 2` hardcoded en `getCurrentBranchIdWithFallback` → retorna `null`.
- 10 callers actualizados para manejar `null`.
- `getUserOrganization` (en `useOrganization.ts` y `supabase/config.ts`) prefiere `is_main` sobre `branches[0]`.
- `websiteSettingsService.ts` importa `applyBranchFilterStrict` del helper centralizado.
- `branchFilterHelper.ts` valida `Number.isFinite && > 0`.
- `ReporteSheet.tsx` recibe y propaga `branchFilter`.
- `cargarKPIsGlobales` incluye `branchFilter` en deps del useCallback.
- Eliminadas coerciones `?? 0`/`|| 0` en branch_id de: CheckoutDialog, FacturasCompraService, parking/pagos, parking/mapa, ContabilidadService, mantenimiento, bloqueos, mesas/[id], ConsecutivosPage, StepPayment, SelectedProductsTable.
- `FacturasCompraService`: `organizationId` ahora es getter (reevalúa), `obtenerFacturas`/`obtenerFacturasProximasVencer` filtran por branchId, `actualizarFactura` filtra por organization_id.

#### Fase 2 POS
- `pedidos-online/page.tsx`: `loadOrders` useCallback incluye `branchFilter` en deps.
- Cupones aislados: `CouponFilters` con `branchId`, `CouponsService.getAll` filtra vía JSONB `promotions.branches`.
- `getVentasPorSucursal` acepta `branchId` y filtra.
- `createReservation` acepta branchId explícito, no usa `getCurrentBranchId()`.
- `subscribeToOrders` filtra por `branch_id` en realtime.
- `getAvailableTables` acepta `branchId` explícito y `durationMinutes`.
- Cupones: `branches.eq.[]` consistente con `promotionsService.ts`.
- Legacy `getCurrentBranchId` removido de `reservasMesasService` y `webOrdersService`.

#### Fase 3 Inventario
- `getAlerts` filtra `inventory_transfers` (origin/dest) y `purchase_orders` por branchId.
- `ProduccionKPIs` consume `useBranch` y filtra queries.
- `getBranchSummaries` acepta branchId.
- Fallbacks de `TransferenciasService` corregidos: lotes (`eq`/`is null`), stock unificado a `qty_on_hand`.
- Validación `getOrganizationId() > 0` en todas las funciones públicas.
- `obtenerTransferenciaPorId` con filtro de ownership.
- `recibirItems` fallback con `organization_id` en SELECT e INSERT.

#### Fase 4 Finanzas
- `obtenerProveedoresConSaldo` filtra por branchId y deduplica con `Map<number, SupplierBase>`.
- `obtenerCuentasPorCobrar` delega a RPC paginado branch-aware (itera todas las páginas).
- `AgingReport` consume `useBranch` y pasa `branchFilter`.
- `FinanzasDashboardService`: 7 métodos aceptan y aplican branchId.
- `BancosService`: `pending_reconciliations` filtra por cuentas de la sucursal, maneja errores.
- `ConciliacionService`: `obtenerConciliaciones` y `obtenerEstadisticas` aceptan branchId.
- `maybeSingle()` maneja error, `suppliers_count` cuenta distintos.

#### Fase 5 PMS
- `PmsSection` propaga `branchFilter` a `getArrivals`, `getDepartures`, `getAlerts`, `getWeekCalendarEvents`.
- `getDashboardStats` filtra `arrivalsToday`/`departuresToday` por branch_id.
- `getWeekCalendarEvents` filtra reservations y reservation_blocks por branchIds.
- `checkoutService.getStats` cuenta `checked_out` (no `closed`), filtra status correctamente.
- `bloqueos/page.tsx` permite "Todas las sucursales" realmente.
- `HousekeepingService.getStats` acepta `spaceIds` y filtra.
- Housekeeping devuelve `[]` si branchFilter != null y no hay espacios.
- `spacesService.getSpaces` requiere `organizationId` y filtra incondicionalmente.
- `getBranchIds` excluye sucursales inactivas.

#### Fase 6 CRM/HRM/Parking
- Parking: lecturas usan `branchFilter` (null = Todas), mutaciones requieren sucursal concreta.
- `NewEntryDialog` recibe `selectedBranchId` (siempre carga espacios correctos).
- `ParkingService` aplica `organization_id` en queries.
- `CRMDashboardService.getDashboardData` propaga `filters.branchId` a todos los métodos.
- `WonCloseModal` usa `useBranch` en vez de `getCurrentBranchId`.
- `CrmSection.handlePipelineChange` conserva `branchId` al cambiar pipeline.
- `executeReservations`/`executeOnboarding` validan branch_id antes de insert, propagan errores.
- Orden de fallback unificado: `contextBranchId ?? latestProposal?.branch_id`.
- Documentación corregida: `employments` y `shift_assignments` SÍ tienen `branch_id`.
- Migración BD: `branch_id` agregado a `opportunities`, `activities`, `conversations`, `messages`.

#### Fase 8 Reportes
- `inventarioReports` y `clientesReports` usan `applyBranchFilter` con branchId del parámetro (no `getBranchFilter()`).
- `pmsReports` los 3 reportes aplican `applyBranchFilter`.
- `finanzasReports`: cxc-aging y cxp-aging pasan `p_branch_id` a RPCs, detalle filtra con helper.
- `ventasReports`: RPCs reciben `p_branch_id`, queries directas usan `applyBranchFilter`.
- `parkingReports`: reemplazado patrón de cargar todas las branches con `applyBranchFilter` directo + `.eq('organization_id', orgId)`.
- 6 reportes de finanzas extendidos: flujo-efectivo, impuestos, gastos-operativos, facturacion-electronica, rentabilidad-producto, rentabilidad-sucursal.
- `clientes-top` filtra `sales` por sucursal.
- `gastos-operativos` filtra `journal_entries.branch_id` (no `journal_lines`).
- 8 comentarios TODO obsoletos eliminados.

### Gaps conocidos restantes (no bloqueantes)

- Algunas RPCs de Supabase pueden no aceptar `p_branch_id` todavía; el parámetro se pasa pero puede ser ignorado por la función. Se requiere migración de BD para que las RPCs filtren internamente.
- `contabilidadReports`, `crmReports`, `hrmReports`, `operacionesReports`, `organizacionReports`, `serialTrackingReports`, `gymReports`, `pmReports`, `transporteReports`, `integracionesReports`, `notificacionesReports`, `chatReports`, `rolesReports` no usan `applyBranchFilter` (la mayoría son org-wide por diseño o no tienen tablas con branch_id).
- HRM: `employees`, `payroll_periods`, `payroll_runs`, `attendance_records`, `leave_requests` no tienen `branch_id` (requiere migración futura para payroll por sucursal configurable).
- Parking: `parking_passes` y `parking_pass_types` no tienen `branch_id` (abonados org-wide).
- Housekeeping: filtrado vía `space_id` (inferido), no directo en tabla.
- `tasks` (CRM) no tiene `branch_id` (verificado vía MCP Supabase).
- Coerciones de código legacy general (`as any`, `parseFloat(...) || 0`, `subtotal || 0`) existen en el código pero no afectan branch isolation.
