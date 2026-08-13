# Plan: Dashboard Unificado en /app/inicio

## Objetivo

Consolidar los dashboards de los 19 módulos de negocio en una sola página
(`/app/inicio`), mostrando solo los módulos activos de la organización.
Eliminar las páginas de dashboard viejas y redirigir las raíces de cada
módulo a su primera página activa. Cada gráfica/estadística debe tener
export descargable profesional en CSV y PDF (datos consolidados en tablas
y cards).

## Decisiones de arquitectura

- **Estructura**: Secciones scrollable con anclas (`/app/inicio#crm`,
  `#finanzas`...). Navegación rápida entre secciones en la parte superior.
- **Módulos incluidos**: 15 de negocio (pos, inventario, finanzas, crm,
  hrm, pms, parking, gym, transporte, pm, notificaciones, integraciones,
  calendario, timeline, chat). Core (organizacion, roles, configuracion) y
  `reportes` (intacto) fuera.
- **Redirect raíz módulo**: `/app/crm` → `/app/crm/clientes` (primera
  página activa del módulo según `organization_module_pages`).
- **Entrega**: Por fases, un PR por módulo.
- **Reportes**: Los reportes de cada módulo se mueven al sub-tab
  "Reportes" dentro de su sección en `/app/inicio`.

## Stack y librerías

- **PDF**: `jspdf` + `jspdf-autotable` (ya en package.json)
- **CSV**: `papaparse` (ya en package.json)
- **XLSX**: `xlsx` (ya en package.json, disponible si se necesita)
- **Helper base**: `src/lib/services/inicio/dashboardSectionExport.ts`

## Fases

### Fase 0 — Infraestructura (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/lib/utils/moduleRedirect.ts` — helper para resolver primera página
  activa de un módulo
- `src/components/inicio/ModuleRootRedirect.tsx` — componente redirect
  reutilizable
- `src/lib/services/inicio/dashboardSectionExport.ts` — helper base
  CSV/PDF profesional
- `src/components/inicio/ModuloSection.tsx` — wrapper de sección con
  ancla, header, exports, sub-tabs
- `src/components/inicio/DashboardModulos.tsx` — contenedor que renderiza
  secciones por módulo activo

**Archivos modificados**:
- `src/components/inicio/index.ts` — exporta nuevos componentes
- `src/app/app/inicio/page.tsx` — integra `DashboardModulos`
- 15 raíces de módulo convertidas a redirect: crm, finanzas, inventario,
  pos, pms, pm, gym, parking, hrm, transporte, notificaciones,
  integraciones, calendario, timeline, chat

**Verificación**: ESLint 0 errores nuevos, tsc 0 errores en archivos nuevos

---

### Fase 1 — Finanzas (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/FinanzasSection.tsx`

**Archivos modificados**:
- `src/components/inicio/ModuloSection.tsx` (añadida prop `reportesContent`)
- `src/components/inicio/DashboardModulos.tsx` (mapa `SECTION_COMPONENTS`)
- `src/components/inicio/index.ts` (export `FinanzasSection`)

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `finance` | **Sección**: `#finance` | **hasReportes**: true

**Objetivo**: Migrar el dashboard de finanzas a `/app/inicio#finance` con
exports CSV/PDF en cada card/chart, y mover los reportes al sub-tab.

**Componentes existentes a reutilizar**:
- `src/components/finanzas/dashboard/KPICards.tsx`
- `src/components/finanzas/dashboard/VentasComprasChart.tsx`
- `src/components/finanzas/dashboard/AgingChart.tsx`
- `src/components/finanzas/dashboard/FlujoProyectadoChart.tsx`
- `src/components/finanzas/dashboard/AlertasCard.tsx`
- `src/components/finanzas/dashboard/TopClientesProveedores.tsx`
- `src/components/finanzas/dashboard/FinanzasDashboardService.ts`
- `src/components/finanzas/reportes/ReportesPage.tsx`

**Tablas Supabase a verificar**:
- `invoice_sales`, `invoice_items`, `payments`
- `accounts_receivable`, `accounts_payable`
- `customers`, `suppliers`
- `chart_of_accounts`, `journal_entries`

**Tareas**:
- [ ] Verificar tablas y FKs con MCP Supabase
- [ ] Crear `src/components/inicio/sections/FinanzasSection.tsx`
- [ ] Inyectar dashboard de finanzas como `children` de `ModuloSection`
- [ ] Construir `exportData` con KPIs + tabla consolidada
- [ ] Mover `ReportesPage` al sub-tab "Reportes"
- [ ] Verificar lint/tsc

---

### Fase 2 — Inventario (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/InventarioSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx` (añadido `inventory: InventarioSection`)
- `src/components/inicio/index.ts` (export `InventarioSection`)

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `inventory` | **Sección**: `#inventory` | **hasReportes**: true

**Componentes existentes**:
- `src/components/inventario/dashboard/AccesosRapidos.tsx`
- `src/components/inventario/dashboard/AlertasInventario.tsx`
- `src/components/inventario/dashboard/MovimientosRecientes.tsx`
- `src/components/inventario/dashboard/ProduccionKPIs.tsx`
- `src/components/inventario/dashboard/ResumenSucursales.tsx`
- `src/lib/services/inventoryDashboardService.ts`

**Tablas Supabase**: `products`, `stock_levels`, `stock_movements`,
`branches`, `purchase_orders`, `categories`, `suppliers`

---

### Fase 3 — POS (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/lib/services/posDashboardService.ts`
- `src/components/pos/dashboard/PosKPIs.tsx`
- `src/components/pos/dashboard/TopProductos.tsx`
- `src/components/pos/dashboard/VentasPorSucursal.tsx`
- `src/components/pos/dashboard/SesionesCaja.tsx`
- `src/components/pos/dashboard/index.ts`
- `src/components/inicio/sections/PosSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `pos` | **Sección**: `#pos` | **hasReportes**: true

**Tablas Supabase**: `sales`, `sale_items`, `web_orders`, `customers`,
`branches`, `cash_registers`

---

### Fase 4 — CRM (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/CrmSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `crm` | **Sección**: `#crm` | **hasReportes**: true

**Componentes existentes**:
- `src/components/crm/dashboard/CRMKPICards.tsx`
- `src/components/crm/dashboard/CRMFunnelChart.tsx`
- `src/components/crm/dashboard/CRMActivityChart.tsx`
- `src/components/crm/dashboard/CRMChannelsChart.tsx`
- `src/components/crm/dashboard/CRMTopLists.tsx`
- `src/components/crm/dashboard/CRMDashboardService.ts`

**Tablas Supabase**: `customers`, `crm_opportunities`, `crm_activities`,
`crm_pipelines`, `crm_channels`

---

### Fase 5 — PMS Hotel (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/PmsSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Notas**: Tipos reales del servicio difieren del briefing (occupancy, totalSpaces, available, cleaning, maintenance, arrivalsToday, departuresToday — no occupancyRate, totalRooms, revenueToday, adr). exportData adaptado a datos reales.

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `pms_hotel` | **Sección**: `#pms_hotel` | **hasReportes**: false

**Componentes existentes**:
- `src/components/pms/dashboard/DashboardStats.tsx`
- `src/components/pms/dashboard/AlertsPanel.tsx`
- `src/components/pms/dashboard/ArrivalsCard.tsx`
- `src/components/pms/dashboard/DeparturesCard.tsx`
- `src/components/pms/dashboard/MiniCalendar.tsx`
- `src/components/pms/dashboard/QuickActions.tsx`
- `src/lib/services/pmsDashboardService.ts`

**Tablas Supabase**: `reservations`, `pms_spaces`, `pms_space_types`,
`pms_folios`, `pms_services`

---

### Fase 6 — Parking (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/parking/dashboard/ParkingKPIs.tsx`
- `src/components/parking/dashboard/SesionesActivas.tsx`
- `src/components/parking/dashboard/PasesPorVencer.tsx`
- `src/components/parking/dashboard/index.ts`
- `src/components/inicio/sections/ParkingSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Notas**: `hasReportes={false}` (no hay ReportesPage consolidado para parking).

**Verificación**: ESLint 0 errores en archivos nuevos, tsc 0 errores nuevos

**Módulo**: `parking` | **Sección**: `#parking` | **hasReportes**: true

**Tablas Supabase**: `parking_sessions`, `parking_passes`, `parking_spaces`,
`parking_zones`, `parking_payments`

---

### Fase 7 — Gym (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/GymSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Notas**: `hasReportes={false}` (no hay ReportesPage reutilizable en gym/reportes).

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `gym` | **Sección**: `#gym` | **hasReportes**: true

**Componentes existentes**:
- `src/components/gym/dashboard/GymStats.tsx`
- `src/components/gym/dashboard/QuickActions.tsx`
- `src/components/gym/dashboard/ExpiringMemberships.tsx`

**Tablas Supabase**: `gym_memberships`, `gym_plans`, `gym_checkins`,
`gym_classes`, `gym_instructors`

---

### Fase 8 — HRM (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/HrmSection.tsx`

**Archivos modificados**:
- `src/components/inicio/DashboardModulos.tsx`, `src/components/inicio/index.ts`

**Notas**: KPIs reales (activeEmployees, absencesToday, shiftsToday, pendingTimesheets, payrollInProcess, activeLoans) difieren del briefing. DepartmentSummary no tiene campo nómina. `hasReportes={false}` (no hay ReportesPage consolidado).

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `hrm` | **Sección**: `#hrm` | **hasReportes**: true

**Tablas Supabase**: `employees`, `departments`, `job_positions`,
`attendance`, `payroll`, `leave_requests`

---

### Fase 9 — Transporte (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/TransporteSection.tsx`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `transport` | **Sección**: `#transport` | **hasReportes**: false

**Componentes existentes**:
- `src/components/transporte/dashboard/DashboardStats.tsx`
- `src/components/transporte/dashboard/DashboardQuickActions.tsx`
- `src/components/transporte/dashboard/DashboardRecentEvents.tsx`

**Tablas Supabase**: `transport_trips`, `transport_vehicles`,
`transport_drivers`, `transport_routes`, `transport_shipments`

---

### Fase 10 — Project Management (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/PmSection.tsx`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `pm` | **Sección**: `#pm` | **hasReportes**: false

**Componentes existentes**:
- `src/components/pm/dashboard/PMKPICards.tsx`
- `src/components/pm/dashboard/PMQuickNav.tsx`
- `src/components/pm/dashboard/PMRecentActivity.tsx`

**Tablas Supabase**: `pm_projects`, `pm_goals`, `pm_tasks`, `pm_milestones`

---

### Fase 11 — Notificaciones (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/NotificacionesSection.tsx`
- `src/components/notificaciones/dashboard/NotificacionesKPIs.tsx`
- `src/components/notificaciones/dashboard/AlertasRecientes.tsx`
- `src/components/notificaciones/dashboard/CanalesNotificacion.tsx`
- `src/components/notificaciones/dashboard/UltimasNotificaciones.tsx`
- `src/components/notificaciones/dashboard/index.ts`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `notifications` | **Sección**: `#notifications` | **hasReportes**: false

**Tablas Supabase**: `notifications`, `notification_rules`,
`notification_channels`, `notification_templates`, `notification_logs`

---

### Fase 12 — Integraciones (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/lib/services/integracionesDashboardService.ts`
- `src/components/integraciones/dashboard/KPICards.tsx`
- `src/components/integraciones/dashboard/IntegracionesList.tsx`
- `src/components/integraciones/dashboard/WebhooksList.tsx`
- `src/components/integraciones/dashboard/index.ts`
- `src/components/inicio/sections/IntegracionesSection.tsx`

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `integrations` | **Sección**: `#integrations` | **hasReportes**: false

**Tablas Supabase**: `integration_connections`, `integration_events`,
`integration_jobs`, `integration_mappings`, `api_keys`, `webhooks`

---

### Fase 13 — Calendario (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/CalendarioSection.tsx`

**Notas**: `CalendarView` no se reutilizó (demasiado grande/complejo). Se consulta `calendar_unified` con Supabase. KPIs: eventosHoy, eventosEstaSemana, eventosEsteMes, proximosEventos.

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `calendar` | **Sección**: `#calendar` | **hasReportes**: false

**Tablas Supabase**: `calendar_events`, `calendar_recurrences`

---

### Fase 14 — Timeline (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/TimelineSection.tsx`

**Notas**: `TimelineService` consulta `timeline_unified` (no existe). Se consulta directamente `ops_audit_log` (1935 rows) con Supabase. KPIs: eventosHoy, eventosTotal, usuariosActivos, modulosMasActivos.

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `operations` | **Sección**: `#operations` | **hasReportes**: false

**Tablas Supabase**: `timeline_events`, `stock_movements`, `sales`,
`invoice_sales`

---

### Fase 15 — Chat (✅ COMPLETADA)

**Estado**: Completada

**Archivos creados**:
- `src/components/inicio/sections/ChatSection.tsx`

**Notas**: Consulta `widget_sessions`, `messages`, `channels`, `conversations` con Supabase. Maneja graceful tablas inexistentes. KPIs: sesionesActivas, mensajesHoy, canalesConectados, conversacionesPendientes.

**Verificación**: ESLint 0 errores, tsc 0 errores nuevos

**Módulo**: `chat` | **Sección**: `#chat` | **hasReportes**: false

**Tablas Supabase**: `chat_sessions`, `chat_messages`, `chat_channels`,
`chat_knowledge_base`

---

## Reglas por fase

1. **Solo modifica archivos bajo la carpeta del módulo** + `src/components/inicio/`
2. Si necesitas tocar algo fuera de ese scope, pregunta antes
3. Ejecuta lint, build (next build) y tests (npm test) antes de generar PR
4. Aplica buenas prácticas de programación (división en funciones,
   archivos, nombramientos de variables, etc)
5. Revisa siempre usando el MCP de Supabase las tablas y campos para
   hacer más efectivo el desarrollo. Proyecto: `jgmgphmzusbluqhuqihj`

## Formato de commit

```
feat(SCRUM-[ID]): migrar dashboard de [módulo] al inicio unificado
```

## Formato de PR

**Título**: `SCRUM-[ID] – Dashboard unificado: [módulo]`

**Body**:
1. Objetivo
2. Cambios (solo módulos + rutas implicadas)
3. Dependencias externas (solo si aplica)
4. Revisores: @santycano, @Palomo-dev
