# Plan de Reconstrucción del Módulo de Reportes

> **Objetivo:** Eliminar todas las páginas y componentes actuales del módulo `reportes` y reconstruir **una sola página** `/app/reportes` (sin subrutas) que consolide los reportes de los 19 módulos, mostrando solo lo que la organización tiene activo. Cada reporte se abre en un **Sheet/Dialog casi pantalla completa**. Incluye **cierres** (diario, semanal, quincenal, mensual, trimestral, semestral, anual), **descarga PDF profesional en blanco y negro** de todos los reportes, y un **chat con IA (agente)** para pedir reportes personalizados en lenguaje natural.
>
> **Estado:** PLAN — sin cambios aplicados.

---

# 1. Análisis del estado actual

## 1.1 Lo que existe hoy (SE ELIMINA)

### Páginas — 10 archivos en `src/app/app/reportes/`
| Archivo | Contenido |
|---|---|
| `page.tsx` | Dashboard general (KPIs, ventas, pagos, top productos, ocupación PMS, actividad) |
| `ventas/page.tsx` | Reportes ventas POS/Web |
| `inventario/page.tsx` | Stock, rotación |
| `finanzas/page.tsx` | Facturas, aging CxC/CxP, pagos |
| `pms/page.tsx` | Ocupación, ADR, RevPAR |
| `hrm/page.tsx` | Asistencia, turnos, nómina |
| `auditoria/page.tsx` | Eventos de auditoría |
| `personalizados/page.tsx` | Constructor de reportes custom |
| `programados/page.tsx` | Reportes programados |
| `ejecuciones/page.tsx` | Historial de ejecuciones |

### Componentes — ~60 archivos en `src/components/reportes/`
- **Raíz (8):** `ReportesActividad.tsx`, `ReportesAtajos.tsx`, `ReportesKPIs.tsx`, `ReportesOcupacion.tsx`, `ReportesPagosChart.tsx`, `ReportesTopLists.tsx`, `ReportesVentasChart.tsx`, `index.ts`
- **Servicio raíz:** `reportesService.ts` (KPIs + dashboard actual)
- **Subcarpetas (9):** `auditoria/`, `ejecuciones/`, `finanzas/`, `hrm/`, `inventario/`, `personalizados/`, `pms/`, `programados/`, `ventas/` — cada una con 5–8 archivos (KPIs, charts, filtros, tablas, servicio, index)

**Verificado:** `@/components/reportes` solo es importado por las 10 páginas de reportes. Ningún otro módulo lo usa → eliminación segura.

## 1.2 Referencias EXTERNAS que hay que actualizar (fuera del módulo — requiere tu aprobación)

| Archivo | Cambio necesario |
|---|---|
| `src/lib/config/modulePages.ts` | Entrada `reports:` tiene 9 páginas → dejar solo `{ name: 'Dashboard', href: '/app/reportes' }` |
| `src/components/app-layout/AppLayout.tsx` | 8 referencias a subrutas `/app/reportes/*` en `MODULES_WITH_SUBMENU` → reducir a una |
| `src/components/app-layout/Sidebar/SidebarNavigation.tsx` | 9 referencias a subrutas `/app/reportes/*` → reducir a una |

**Middleware (`src/middleware.ts`):** NO requiere cambios. Ya mapea `/app/reportes` (y subrutas por prefijo) al módulo `reports` y valida acceso por organización + cargo (`checkModuleAccess`).

**`src/lib/middleware/permissions.ts`:** NO requiere cambios. Ya tiene `REPORTS_ACCESS` / `REPORTS_MANAGE`.

## 1.3 Lo que existe y SE REUTILIZA

| Recurso | Ubicación | Uso en el nuevo módulo |
|---|---|---|
| `ReportesContablesService.ts` | `src/components/finanzas/contabilidad/` | P&L, Balance General, Balance Comprobación, Mayor → base de reportes contables (P&L #14, Balance #15) |
| `useActiveModules` | `src/hooks/useActiveModules.ts` | Saber qué módulos están activos → render condicional de secciones |
| `moduleManagementService` | `src/lib/services/moduleManagementService.ts` | `getActiveModules(orgId)` → lista de códigos activos |
| `useOrganization` | `src/lib/hooks/useOrganization.ts` | organization_id + datos de la org (nombre, NIT para encabezado PDF) |
| `openaiService` | `src/lib/services/openaiService.ts` | Cliente OpenAI base (singleton, modelos, costo por tokens) |
| `aiAssistantService` | `src/lib/services/aiAssistantService.ts` | Patrón del asistente interno: créditos IA + bloques ```action + contexto org/usuario |
| `aiCreditsService` | `src/lib/services/aiCreditsService.ts` | `checkAICredits` / `estimateCredits` / `consumeAICredits` → control de costo del agente (usa `ai_credit_purchases`) |
| API ai-assistant | `src/app/api/ai-assistant/` | 10 endpoints existentes (`chat`, `execute-action`, `pm-assist`, `suggestions`…) → el agente de reportes se monta aquí como un endpoint más |
| `Sheet` / `Dialog` | `src/components/ui/sheet.tsx`, `dialog.tsx` | Contenedor casi pantalla completa de cada reporte |
| `date-fns`, `recharts`, `react-chartjs-2` | package.json | Fechas y gráficas (ya instaladas) |
| `ai_usage_logs` (94 filas) | Supabase | Registrar consumo del agente IA |
| `saved_reports`, `scheduled_reports`, `report_executions` (8 filas) | Supabase | Persistir reportes guardados / historial de cierres |
| `Ops_audit_log` (9.792) | Supabase | Reporte de actividad/auditoría |

## 1.4 Módulos en BD (tabla `modules` — 19)

| Código | Nombre | Core | Código | Nombre | Core |
|---|---|---|---|---|---|
| `organizations` | Organizaciones | ✅ | `finance` | Finanzas | — |
| `clientes` | Clientes | ✅ | `reports` | Reportes y Analítica | — |
| `roles` | Roles y Permisos | ✅ | `notifications` | Notificaciones | — |
| `pm` | Gestión de Proyectos | — | `integrations` | Integraciones | — |
| `gym` | Gimnasio | — | `calendar` | Calendario | — |
| `chat` | Chat Omnicanal | — | `operations` | Operaciones (Timeline) | — |
| `pos` | Ventas | — | `pms_hotel` | PMS Hotelería | — |
| `inventory` | Inventario | — | `parking` | Parking | — |
| `transport` | Transporte | — | `crm` | CRM | — |
| `hrm` | Recursos Humanos | — | | | |

## 1.5 Tablas de datos confirmadas (Supabase `jgmgphmzusbluqhuqihj`)

| Módulo | Tablas clave (registros) |
|---|---|
| POS/Ventas | `sales` (601), `sale_items` (914), `cash_sessions` (7), `cash_movements` (31), `returns`, `kitchen_tickets` (141), `web_orders` |
| Finanzas | `invoice_sales` (590), `invoice_items` (922), `invoice_purchase` (7), `accounts_receivable` (590), `accounts_payable` (7), `payments` (439), `invoice_applied_taxes`, `invoice_purchase_applied_taxes`, `credit_note_applications`, `payment_terms_catalog` |
| Contabilidad | `chart_of_accounts` (181), `journal_entries` (1.573), `journal_lines` (3.208), `budgets`, `budget_lines`, `fixed_assets`, `asset_depreciations`, `cost_centers`, `branch_account_mappings` (8), `tax_account_mapping`, `bank_accounts`, `bank_transactions`, `finance_audit_log` (2.449) |
| Inventario | `products` (8.676), `stock_levels` (3.116), `stock_movements` (627), `product_costs` (537), `suppliers` (917), `purchase_orders` |
| CRM | `opportunities` (12), `pipelines` (2), `stages` (10), `customers` (20.134), `activities`, `campaigns`, `campaign_contacts`, `segments`, `conversations`, `messages` |
| HRM | `tasks` (664), `payroll_periods`*, `shift_assignments`*, `employee_loans`* (*verificar nombres en Fase 0) |
| PMS | `reservations` (15), `folios` (6), `folio_items` (16), `rates` (6), `housekeeping_tasks`, `maintenance_orders` |
| Parking | `parking_sessions`, `parking_rates`, `parking_spaces`, `parking_passes`, `parking_payments` |
| Gym | `memberships`, `membership_plans`, `gym_classes`, `member_checkins`, `class_reservations`, `membership_payments` |
| Transporte | `vehicles`, `shipments`*, `drivers`* (*verificar en Fase 0) |
| Chat | `conversations`, `messages`, `message_events`, `conversation_tags` |
| Integraciones | `integration_connections`, `integration_events`, `integration_jobs`, `integration_object_mappings` |
| Calendario | `calendar_events`, `calendar_exceptions` |
| Timeline | `ops_audit_log` (9.792), `timeline_exports` |
| Notificaciones | `notifications` (9.757), `delivery_logs`, `system_alerts` |
| Roles/Org | `roles_audit_log` (3.249), `job_position_module_access`, `organization_members` (25), `branches` (74), `subscriptions` |
| PM | `projects` (4), `goals` (17), `milestones`, `tasks` (664), `task_time_entries` |

## 1.6 Librería PDF

**No existe ninguna librería PDF instalada** (verificado: no hay `jspdf`, `pdfmake`, `@react-pdf`, `html2pdf` en `package.json`).
→ Decisión: instalar **`jspdf` + `jspdf-autotable`** (generación client-side, control total del layout B/N empresarial, tablas automáticas multipágina con encabezados repetidos).

---

# 2. Arquitectura objetivo

```
┌─────────────────────────────────────────────────────────────────┐
│  /app/reportes  (ÚNICA página, sin subrutas)                     │
│                                                                  │
│  Header: [Selector de Cierre ▾] [Rango fechas] [PDF Cierre]     │
│          [Actualizar] [🤖 Chat IA]                               │
│                                                                  │
│  Resumen del período: KPIs globales (según módulos activos)      │
│                                                                  │
│  Secciones por módulo activo (accordion/cards):                  │
│   💰 Ventas (pos)        → 6 reportes → abren Sheet 95%          │
│   🏦 Finanzas (finance)  → 10 reportes → abren Sheet 95%         │
│   📦 Inventario          → 4 reportes                            │
│   🤝 CRM                 → 6 reportes                            │
│   👥 HRM                 → 3 reportes                            │
│   🏨 PMS / 🅿️ Parking / 🏋️ Gym / 🚚 Transporte (si activos)      │
│   💬 Chat / ⚡ Integraciones / 🔔 Notificaciones (si activos)    │
│   🏢 Organización / 👤 Clientes / 🛡️ Roles (core, siempre)       │
│                                                                  │
│  Cada reporte = Sheet lateral 95% ancho:                         │
│   ┌──────────────────────────────────────────────┐               │
│   │ Título + período + [Descargar PDF] [Cerrar]  │               │
│   │ KPIs del reporte                             │               │
│   │ Gráfica (opcional)                           │               │
│   │ Tabla completa con paginación                │               │
│   └──────────────────────────────────────────────┘               │
│                                                                  │
│  Chat IA (Sheet derecho persistente):                            │
│   "Dame las ventas por vendedor del trimestre"                   │
│   → agente interpreta → ejecuta queries → muestra tabla → PDF    │
└─────────────────────────────────────────────────────────────────┘
```

### Reglas de la arquitectura
1. **Una sola ruta:** `/app/reportes`. Cero subrutas. Todo es estado React (`activeReport: ReportId | null`).
2. **Render por módulos activos:** sección visible ⇔ `activeModules` (de `useActiveModules`) incluye el código. Módulos core (`organizations`, `clientes`, `roles`) siempre visibles.
3. **Período único global:** el selector de cierre define `dateFrom/dateTo` una sola vez; todos los reportes usan ese rango.
4. **Datos unificados:** cada reporte produce la misma estructura (`ReportData`) → un solo componente de tabla + un solo generador PDF sirve para todos.
5. **PDF B/N empresarial:** una sola plantilla para los ~60 reportes.
6. **IA nunca genera SQL libre:** el agente mapea intención → reporte conocido + filtros (seguro y deterministico).

---

# 3. Estructura de datos unificada (contrato de todos los reportes)

```typescript
// Períodos de cierre soportados
type TipoCierre = 'diario' | 'semanal' | 'quincenal' | 'mensual'
                | 'trimestral' | 'semestral' | 'anual' | 'personalizado';

interface PeriodoCierre {
  tipo: TipoCierre;
  fechaInicio: string;   // ISO
  fechaFin: string;      // ISO
  etiqueta: string;      // "Cierre Diario — 03/08/2026" | "Q3 2026" | etc.
}

// Contrato universal de reporte
interface ReporteColumna {
  key: string;
  titulo: string;
  tipo: 'texto' | 'numero' | 'moneda' | 'porcentaje' | 'fecha';
  alinear?: 'left' | 'right' | 'center';
}

interface ReporteKPI { titulo: string; valor: string | number; formato?: 'moneda' | 'numero' | 'porcentaje'; }

interface ReportData {
  id: string;                    // 'cierre-caja', 'estado-resultados', ...
  titulo: string;
  modulo: string;                // código de módulo BD
  kpis: ReporteKPI[];
  columnas: ReporteColumna[];
  filas: Record<string, any>[];
  totales?: Record<string, any>; // fila de totales al pie
  generadoEn: string;            // timestamp
  periodo: PeriodoCierre;
}

// Definición (catálogo) de un reporte disponible
interface ReportDefinition {
  id: string;
  modulo: string;                // 'pos' | 'finance' | 'crm' | ...
  titulo: string;
  descripcion: string;
  categoria: 'operativo' | 'financiero' | 'contable' | 'comercial' | 'personas' | 'sistema';
  periodosSugeridos: TipoCierre[];  // en qué cierres aparece destacado
  fetch: (orgId: number, periodo: PeriodoCierre) => Promise<ReportData>;
}
```

Con este contrato: **1 componente Sheet + 1 tabla + 1 PDF sirven para todos los reportes de los 19 módulos.**

---

# 4. FASE 0 — Verificación previa (solo lectura, sin cambios)

**Objetivo:** confirmar nombres/columnas exactas antes de escribir servicios.

1. Verificar con MCP Supabase columnas de: `shipments`, `drivers`, `vehicles`, `payroll_periods`, `payroll_items`, `shift_assignments`, `employees`, `web_orders`, `returns`, `member_checkins`, `parking_sessions`, `gym_memberships` (algunas tienen prefijo `gym_`, otras no — confirmar).
2. Verificar si existen funciones RPC contables ya creadas para `ReportesContablesService` (getTrialBalance / getIncomeStatement / getBalanceSheet leen directo de `journal_lines` — confirmar rendimiento con 3.208 líneas: OK para agregación cliente, pero mejor RPC).
3. Verificar `organization_taxes` (24 filas) y `tax_templates` para el reporte de IVA/retenciones.
4. Confirmar que `report_executions` tiene columnas para guardar: `report_id`, `params jsonb`, `status`, `result_snapshot jsonb`, `executed_by`, `created_at`. Si falta `result_snapshot` → incluirlo en migración de Fase 7.

**Entregable:** lista validada de tablas/columnas → ajustar este plan si algún nombre difiere.

---

# 5. FASE 1 — Limpieza total (eliminación)

### Paso 1.1 — Eliminar páginas (10 archivos)
```
src/app/app/reportes/page.tsx
src/app/app/reportes/ventas/page.tsx
src/app/app/reportes/inventario/page.tsx
src/app/app/reportes/finanzas/page.tsx
src/app/app/reportes/pms/page.tsx
src/app/app/reportes/hrm/page.tsx
src/app/app/reportes/auditoria/page.tsx
src/app/app/reportes/personalizados/page.tsx
src/app/app/reportes/programados/page.tsx
src/app/app/reportes/ejecuciones/page.tsx
```
(Eliminar también las carpetas vacías resultantes.)

### Paso 1.2 — Eliminar componentes (carpeta completa)
```
src/components/reportes/   (los ~60 archivos, incluido reportesService.ts e index.ts)
```

### Paso 1.3 — Actualizar referencias externas (3 archivos — requiere tu OK)
1. `src/lib/config/modulePages.ts` → entrada `reports:` queda con una sola página:
   ```typescript
   reports: [
     { name: 'Reportes', href: '/app/reportes' },
   ],
   ```
2. `src/components/app-layout/AppLayout.tsx` → quitar las 8 subrutas de reportes del submenú.
3. `src/components/app-layout/Sidebar/SidebarNavigation.tsx` → quitar las 9 subrutas de reportes.

### Paso 1.4 — Verificación de limpieza
- `npm run build` debe pasar sin imports rotos (los únicos consumidores eran las páginas eliminadas).
- Buscar `reportes/` residual: `grep "@/components/reportes"` → 0 resultados.

**Commit sugerido:** `chore(reportes): eliminar páginas y componentes legacy del módulo reportes`

---

# 6. FASE 2 — Fundaciones (tipos, cierres, módulos activos)

### Paso 2.1 — Instalar dependencia PDF
```bash
npm install jspdf jspdf-autotable
```
(Única dependencia nueva. `date-fns` ya está para fechas.)

### Paso 2.2 — Crear `src/lib/services/reportes/types.ts`
- `TipoCierre`, `PeriodoCierre`, `ReporteColumna`, `ReporteKPI`, `ReportData`, `ReportDefinition` (contrato de §3).
- `ModuloReportes { code, nombre, icono, reportes: ReportDefinition[] }`.

### Paso 2.3 — Crear `src/lib/services/reportes/periodosService.ts`
Función central: `resolverPeriodo(tipo: TipoCierre, referencia?: Date, custom?: {from,to}): PeriodoCierre`

| Tipo | Regla |
|---|---|
| `diario` | Hoy 00:00 → 23:59 |
| `semanal` | Lunes → domingo de la semana actual (o anterior si se elige) |
| `quincenal` | 1–15 o 16–fin del mes actual |
| `mensual` | Mes calendario completo |
| `trimestral` | Q1 (ene–mar) … Q4 (oct–dic) |
| `semestral` | S1 (ene–jun), S2 (jul–dic) |
| `anual` | 1 ene → 31 dic |
| `personalizado` | Rango libre |

Incluye navegación: `periodoAnterior(p)` / `periodoSiguiente(p)` (flechas ◀ ▶ en el header para recorrer cierres históricos) y `esCierreCerrado(p)` (true si `fechaFin < hoy` → el cierre es "oficial").

### Paso 2.4 — Crear `src/lib/services/reportes/reportesCatalogo.ts`
- Registro estático de **todos** los reportes disponibles (ver §10 matriz) con su `modulo`, `titulo`, `descripcion`, `categoria`.
- Función `getReportesVisibles(activeModuleCodes: string[]): ModuloReportes[]` → filtra el catálogo por módulos activos. Módulos core siempre incluidos.

### Paso 2.5 — Crear `src/lib/services/reportes/reportesEngine.ts`
- `ejecutarReporte(reportId, orgId, periodo): Promise<ReportData>` → busca en catálogo y llama su `fetch`.
- `ejecutarCierre(orgId, periodo, activeModules): Promise<ReportData[]>` → ejecuta en paralelo (con límite de concurrencia, ej. 4) todos los reportes de los módulos activos → base del **PDF de cierre consolidado**.

**Commit:** `feat(reportes): fundamentos — tipos, cierres y catálogo de reportes`

---

# 7. FASE 3 — Capa de datos (Supabase RPC + servicios por módulo)

## 7.A Migraciones Supabase (MCP `apply_migration`)

> Patrón del proyecto: funciones `SECURITY DEFINER` con `organization_id` como primer parámetro (igual que las funciones CRM ya creadas). Crear en una migración por grupo.

### Migración 1: `reportes_ventas_pos`
```sql
-- Cierre de caja (Zeta): totales por método de pago, sesiones, descuentos
fn_reporte_cierre_caja(p_organization_id bigint, p_from timestamptz, p_to timestamptz)
  → JSON: { sesiones: [...], por_metodo: [...], descuentos, devoluciones, propinas, esperado_vs_real }

-- Ventas del período: por día, sucursal, vendedor, categoría
fn_reporte_ventas_resumen(p_organization_id, p_from, p_to) → JSON

-- Ventas por hora (heatmap)
fn_reporte_ventas_por_hora(p_organization_id, p_from, p_to) → JSON
```

### Migración 2: `reportes_finanzas`
```sql
fn_reporte_cxc_aging(p_organization_id, p_as_of date)
  → buckets: corriente, 1-30, 31-60, 61-90, +90 (desde accounts_receivable + invoice_sales)
fn_reporte_cxp_aging(p_organization_id, p_as_of date) → igual con accounts_payable + invoice_purchase
fn_reporte_flujo_efectivo(p_organization_id, p_from, p_to)
  → operación / inversión / financiación desde payments + journal_lines cuentas de efectivo
fn_reporte_impuestos(p_organization_id, p_from, p_to)
  → IVA generado (invoice_applied_taxes), IVA descontable (invoice_purchase_applied_taxes), retenciones (organization_taxes)
```

### Migración 3: `reportes_contables`
```sql
fn_reporte_estado_resultados(p_organization_id, p_from, p_to)
  → jerarquía chart_of_accounts tipo ingreso/gasto/costo agregando journal_lines
fn_reporte_balance_general(p_organization_id, p_as_of date)
  → activo/pasivo/patrimonio acumulado a la fecha
fn_reporte_presupuesto_vs_real(p_organization_id, p_from, p_to)
  → budgets/budget_lines vs journal_lines (si budgets está vacío → retorna solo reales)
```
*(Si `ReportesContablesService` ya hace esto bien en cliente, la RPC es mejora de rendimiento — prioridad media.)*

### Migración 4: `reportes_inventario`
```sql
fn_reporte_stock_critico(p_organization_id)
  → stock_levels vs products.min_stock
fn_reporte_movimientos_inventario(p_organization_id, p_from, p_to) → stock_movements por tipo
fn_reporte_rotacion_inventario(p_organization_id, p_from, p_to)
  → top vendidos (sale_items) + dead stock (sin movimientos) + días promedio
```

### Migración 5: `reportes_crm_hrm_operativos`
```sql
fn_reporte_crm_funnel(p_organization_id, p_from, p_to)
  → oportunidades por etapa, conversión entre etapas, forecast (monto × probabilidad)
fn_reporte_crm_ranking_vendedores(p_organization_id, p_from, p_to)
fn_reporte_hrm_nomina(p_organization_id, p_from, p_to)      -- según tablas reales de Fase 0
fn_reporte_gym_membresias(p_organization_id, p_from, p_to)  -- activas, nuevas, churn, MRR
fn_reporte_parking_ocupacion(p_organization_id, p_from, p_to)
fn_reporte_transporte_envios(p_organization_id, p_from, p_to)
fn_reporte_chat_sla(p_organization_id, p_from, p_to)        -- primera respuesta, resolución, volumen por canal
fn_reporte_integraciones_estado(p_organization_id)          -- conexiones, jobs, errores
```

**Nota:** todas devuelven `jsonb` → un solo round-trip por reporte, agregación en Postgres (rápido con índices existentes en `organization_id` + fechas).

## 7.B Servicios TypeScript (capa delgada sobre las RPC)

Crear en `src/lib/services/reportes/modulos/` — **un archivo por módulo**, cada uno exporta sus `ReportDefinition[]`:

| Archivo | Módulo BD | Reportes que expone |
|---|---|---|
| `ventasReports.ts` | `pos` | Cierre de caja, Ventas del período, Ventas por hora, Por vendedor, Devoluciones/descuentos, Pedidos online |
| `finanzasReports.ts` | `finance` | CxC aging, CxP aging, CxC vencidas, Flujo de efectivo, Liquidez, Impuestos, Gastos operativos, Facturación electrónica |
| `contabilidadReports.ts` | `finance` | Estado de Resultados, Balance General, Presupuesto vs Real *(reusa `ReportesContablesService` o RPC)* |
| `inventarioReports.ts` | `inventory` | Stock crítico, Movimientos, Rotación, Rentabilidad por producto |
| `crmReports.ts` | `crm` | Funnel, Forecast, Ranking vendedores, Actividades, Campañas, Clientes |
| `hrmReports.ts` | `hrm` | Nómina quincenal, Productividad, Comisiones |
| `pmsReports.ts` | `pms_hotel` | Ocupación, Ingresos hoteleros, Housekeeping |
| `parkingReports.ts` | `parking` | Ocupación, Ingresos, Rotación de espacios |
| `gymReports.ts` | `gym` | Membresías, Asistencia, Retención |
| `transporteReports.ts` | `transport` | Envíos por estado, Performance conductores, Volumen por ruta |
| `chatReports.ts` | `chat` | Volumen conversaciones, SLA, Performance agentes, Tags |
| `integracionesReports.ts` | `integrations` | Estado conexiones, Eventos/jobs, Errores |
| `notificacionesReports.ts` | `notifications` | Enviadas por canal, Tasa lectura, Por módulo |
| `organizacionReports.ts` | `organizations` (core) | Miembros, Sucursales comparativa, Uso del sistema |
| `clientesReports.ts` | `clientes` (core) | Crecimiento, Por tipo, Top clientes |
| `rolesReports.ts` | `roles` (core) | Usuarios por rol, Auditoría de permisos |
| `pmReports.ts` | `pm` | Tareas por estado, Performance por proyecto |
| `operacionesReports.ts` | `operations` | Actividad del sistema (timeline), Auditoría general |

Cada servicio: `supabase.rpc('fn_reporte_...', {...})` → mapea a `ReportData` (columnas + filas + KPIs + totales). **Sin lógica de negocio duplicada en el cliente.**

**Commit:** `feat(reportes): servicios de datos por módulo + RPCs de agregación`

---

| Archivo | Responsabilidad |
|---|---|
| `ReportesHeader.tsx` | Título, `PeriodoSelector`, navegación ◀ ▶ entre cierres, botón "Descargar cierre PDF", botón actualizar, botón Chat IA |
| `PeriodoSelector.tsx` | Select con 7 tipos de cierre + personalizado (popover con 2 date inputs). Muestra etiqueta del rango resuelto |
| `ReportesResumenGlobal.tsx` | 4–6 KPIs globales del período (ventas, ingresos, pagos, facturas) — solo de módulos activos |
| `ModuloSection.tsx` | Sección por módulo: título + icono + grid de `ReporteCard`. Colapsable |
| `ReporteCard.tsx` | Card de un reporte: título, descripción, badge de categoría → `onClick` abre el Sheet |
| `ReporteSheet.tsx` | **Sheet lateral `w-[95vw]`** con el reporte abierto: header (título, período, botón PDF individual, cerrar), KPIs, gráfica opcional, tabla |
| `ReporteTabla.tsx` | Tabla genérica desde `ReportData` (formato moneda/%/fecha, fila de totales, paginación cliente 25/50/100) |
| `ReporteKPIs.tsx` | Fila de KPIs genérica |
| `ReporteEmpty.tsx` | Estado vacío ("Sin datos en este período") |
| `ReportesSkeleton.tsx` | Loading states |
| `chat/ReportesChatSheet.tsx` | Sheet derecho con el chat IA (Fase 6) |
| `index.ts` | Exportaciones |

### Decisiones UI
- **Sheet (`side="right"`, `className="w-[95vw] sm:w-[90vw] max-w-none"`)** para reportes → casi toda la pantalla, tabla con scroll propio. *(Si prefieres modal centrado: `Dialog` con `max-w-[95vw] h-[92vh]` — el componente `ReporteSheet` abstrae ambos; decidimos en implementación. Mi recomendación: Sheet lateral.)*
- Tema claro/oscuro completo, color principal azul (consistencia con PMS/Housekeeping).
- `print:hidden` en controles; la tabla imprimible solo vía PDF generado (no `window.print`).

**Commit:** `feat(reportes): página única con secciones por módulo y visor de reporte en sheet`

---

# 9. FASE 5 — PDF profesional blanco y negro

## `src/lib/services/reportes/pdfExportService.ts`

### Plantilla empresarial (una sola para todo)

```
┌────────────────────────────────────────────────┐
│ [LOGO B/N]  NOMBRE ORGANIZACIÓN                │
│             NIT xxx · Ciudad                   │
│             TÍTULO DEL REPORTE                 │
│             Período: 01/07/2026 – 30/09/2026   │
│             Generado: 03/08/2026 13:44 por usr │
├────────────────────────────────────────────────┤
│ RESUMEN (KPIs en cajas con borde)              │
├────────────────────────────────────────────────┤
│ TABLA (autotable, zebra gris claro, header     │
│ negro texto blanco, líneas finas grises)       │
├────────────────────────────────────────────────┤
│ TOTALES (fila en negrita, doble línea superior)│
├────────────────────────────────────────────────┤
│ Página X de Y        GO Admin ERP              │
└────────────────────────────────────────────────┘
```

### API del servicio
```typescript
pdfExportService.descargarReporte(reporte: ReportData, org: OrganizationInfo): void
  // → archivo: {org}_{reporte-id}_{periodo}.pdf  (ej: miempresa_estado-resultados_2026-Q3.pdf)

pdfExportService.descargarCierreConsolidado(cierre: {
  periodo: PeriodoCierre;
  reportes: ReportData[];          // todos los módulos activos
  org: OrganizationInfo;
}): void
  // → PDF maestro: portada B/N + índice con números de página
  //   + una sección por módulo + cada reporte en página nueva
```

### Reglas de estilo (blanco y negro estricto)
- Solo escala de grises: `#000`, `#111`, `#444`, `#888`, `#CCC`, `#EEE`, `#FFF`.
- Logo de la organización convertido a escala de grises (canvas) o omitido si no hay.
- Números alineados a la derecha, formato moneda `es-CO` (`$ 1.234.567`), porcentajes con 1 decimal.
- Encabezado de tabla repetido en cada página (`jspdf-autotable` `showHead: 'everyPage'`).
- Pie: número de página + línea separadora + disclaimer "Documento generado automáticamente — uso interno".
- Fuentes: `helvetica` (nativa jsPDF, sin embeber fuentes).

### Integración
- Botón "Descargar PDF" en `ReporteSheet` → `descargarReporte`.
- Botón "PDF Cierre" en `ReportesHeader` → ejecuta `ejecutarCierre` (todos los reportes de módulos activos en paralelo) → `descargarCierreConsolidado` con progreso ("Generando 12/24 reportes...").

**Commit:** `feat(reportes): exportación PDF empresarial B/N por reporte y cierre consolidado`

---

# 10. FASE 6 — Agente IA de reportes (chat)

## Decisión de infraestructura: REUTILIZAR `ai-assistant` existente

El proyecto ya tiene un asistente IA interno completo:
- **`src/app/api/ai-assistant/`** — 10 endpoints (`chat`, `execute-action`, `pm-assist`, `suggestions`, …).
- **`aiAssistantService.ts`** — patrón probado: system prompt + historial multi-turno + bloque ```action parseado del output del LLM.
- **`aiCreditsService.ts`** — `checkAICredits` → `estimateCredits` → `consumeAICredits` por organización (créditos en `ai_credit_purchases`, consumo auditable).

→ El agente de reportes **NO crea un sistema nuevo**: se monta como un endpoint adicional dentro de `ai-assistant` siguiendo exactamente el mismo patrón (créditos → prompt → parseo de bloque → ejecución).

## Flujo

```
Usuario: "¿Cuáles fueron los 5 productos más vendidos este trimestre?"
   │
   ▼
POST /api/ai-assistant/reportes
  { message, conversationHistory, context: { organizationId, userName, userRole },
    periodo: PeriodoCierre, modulosActivos: string[] }
   │
   ▼
reportAgentService.sendMessage(...)
  1. checkAICredits(organizationId)          // mismo control de costos del asistente
  2. System prompt = prompt base del agente + catálogo de reportes
     (solo ids de módulos activos) + período actual + formato de bloque
  3. OpenAI gpt-4o-mini, temperature 0.2, maxTokens 800
  4. consumeAICredits(...)                   // idéntico a aiAssistantService
  5. Parsear bloque de la respuesta:

     ```report
     { "reportId": "top-productos",
       "periodo": { "tipo": "trimestral" },   // opcional: override en lenguaje natural
       "filtros": { "limite": 5 } }
     ```

  6. Whitelist: validar reportId contra reportesCatalogo (NUNCA SQL libre)
  7. reportesEngine.ejecutarReporte(reportId, orgId, periodo) → ReportData
   │
   ▼
Response: { content, reportData?, usage }
Chat renderiza: texto del asistente + tabla ReporteTabla embebida
  + botón "Ver en grande" (abre ReporteSheet) + "Descargar PDF"
```

## Archivos

| Archivo | Nota |
|---|---|
| `src/app/api/ai-assistant/reportes/route.ts` | **Nuevo endpoint dentro del folder existente `ai-assistant` — requiere tu OK** (patrón idéntico a `chat/route.ts`: valida body, valida `OPENAI_API_KEY`, delega al servicio) |
| `src/lib/services/reportes/reportAgentService.ts` | Espejo de `aiAssistantService` pero especializado: system prompt con catálogo filtrado por módulos activos, parseo de bloque ```report, validación whitelist, ejecución vía `reportesEngine`, créditos con `aiCreditsService` |
| `src/components/reportes/chat/ReportesChatSheet.tsx` | Sheet derecho persistente: historial, input, sugerencias rápidas ("Cierre de caja de hoy", "CxC vencidas", "Top productos del mes") |
| `src/components/reportes/chat/ChatMessage.tsx` | Burbujas + render de `ReportData` embebido |

## Reglas del agente
1. **Whitelist estricta:** el LLM solo puede elegir `reportId` del catálogo de módulos activos. Si pide algo fuera → responde sugiriendo el reporte más cercano.
2. **Período por lenguaje natural:** "la semana pasada", "el primer semestre" → el LLM lo traduce a `TipoCierre`; el backend lo resuelve con `periodosService` (nunca confiar en fechas crudas del LLM).
3. **Costo controlado:** mismo mecanismo de créditos de `aiAssistantService` (`checkAICredits` antes, `consumeAICredits` después). Si la org no tiene créditos → mensaje de aviso y se sugieren los reportes directos.
4. **Multi-turno:** el historial permite refinar ("ahora solo de la sucursal norte") → re-ejecuta con filtros.
5. **Fallback sin API key o sin créditos:** el chat muestra "Asistente no disponible" y sugiere usar los reportes directos.
6. **Permisos:** el agente hereda el período y módulos que la página ya validó (middleware + `useActiveModules`); no expone reportes de módulos inactivos ni de otras organizaciones.

**Commit:** `feat(reportes): agente IA para reportes en lenguaje natural sobre ai-assistant`

---

# 11. FASE 7 — Persistencia de cierres e historial

1. Al generar un **cierre consolidado** (PDF maestro), insertar en `report_executions`:
   `report_id='cierre-{tipo}'`, `params={periodo, modulos}`, `status='completed'`, `executed_by`, snapshot de KPIs globales en `result_snapshot jsonb` (crear columna en migración si no existe).
2. (Opcional, prioridad baja) Sección en la misma página: "Cierres anteriores" → lista desde `report_executions` con fecha/tipo/usuario → permite re-descargar.
3. (Opcional futuro) `tax_declarations` e `inventory_valuations` — identificadas como faltantes; NO son requisito para este plan.

**Commit:** `feat(reportes): registro histórico de cierres generados`

---

# 12. Matriz de reportes por fase de implementación

## Fase A (críticos — primera entrega)
| # | Reporte | Módulo | Cierre típico |
|---|---|---|---|
| 1 | Cierre de Caja (Zeta) | POS | Diario |
| 2 | Ventas del período (por día/sucursal/vendedor) | POS | Diario/Semanal |
| 5 | CxC Vencidas | Finanzas | Diario |
| 14 | Estado de Resultados | Contabilidad | Mensual+ |
| 17 | CxC Edades de saldo | Finanzas | Mensual |
| 18 | CxP Edades de saldo | Finanzas | Mensual |
| 19 | Impuestos (IVA/Retenciones) | Finanzas | Mensual |
| 4 | Stock crítico | Inventario | Diario |
| 6 | Movimientos de inventario | Inventario | Diario |
| — | Funnel de ventas | CRM | Semanal/Mensual |
| — | Pipeline forecast | CRM | Mensual |

## Fase B (gestión)
| # | Reporte | Módulo | Cierre típico |
|---|---|---|---|
| 7 | Desempeño ventas vs metas | POS/CRM | Semanal |
| 8 | Rotación de inventario | Inventario | Semanal |
| 9 | Liquidez (flujo proyectado) | Finanzas | Semanal |
| 10 | Productividad personal | HRM | Semanal |
| 11 | Nómina quincenal | HRM | Quincenal |
| 12 | Comisiones | CRM/HRM | Quincenal |
| 13 | Gastos operativos | Finanzas | Quincenal |
| 15 | Balance General | Contabilidad | Mensual+ |
| 16 | Flujo de Efectivo | Finanzas | Mensual |
| 21 | Rentabilidad por producto | Finanzas/Inv | Mensual |
| 22 | Rentabilidad por sucursal | Finanzas | Mensual |
| — | Ocupación/ingresos Parking | Parking | Semanal |
| — | Membresías/asistencia Gym | Gym | Semanal |
| — | Envíos y performance conductores | Transporte | Semanal |
| — | SLA y volumen Chat | Chat | Semanal |
| — | Estado de integraciones | Integraciones | Semanal |

## Fase C (estratégicos)
| # | Reporte | Módulo | Cierre típico |
|---|---|---|---|
| 24–28 | Cierre trimestral, KPIs, Presupuesto vs Real, Auditoría, Provisión renta | Finanzas | Trimestral |
| 29–32 | Consolidado semestral, Revisión fiscal, Proveedores, Capital de trabajo | Finanzas/Inv | Semestral |
| 33–40 | Estados anuales NIIF, Renta, Depreciación, Gestión, Costos, Inventario final, Dividendos, RSE | Finanzas/Admin | Anual |
| — | Notificaciones, Roles, PM, Calendario, Timeline | Sistema | Mensual |

*(Las fases A/B/C son orden de construcción; la UI y el PDF sirven igual para todas desde el día 1.)*

---

# 13. Resumen ejecutivo de archivos

## ELIMINAR (70 archivos aprox.)
- `src/app/app/reportes/**` — 10 páginas
- `src/components/reportes/**` — ~60 archivos

## CREAR (~35 archivos)
| Grupo | Archivos |
|---|---|
| Página | `src/app/app/reportes/page.tsx` (1) |
| Componentes | `src/components/reportes/` — 12 archivos (header, selector, secciones, card, sheet, tabla, KPIs, chat×2, skeleton, empty, index) |
| Servicios núcleo | `src/lib/services/reportes/` — `types.ts`, `periodosService.ts`, `reportesCatalogo.ts`, `reportesEngine.ts`, `pdfExportService.ts`, `reportAgentService.ts` (6) |
| Servicios por módulo | `src/lib/services/reportes/modulos/` — 17 archivos |
| API IA | `src/app/api/ai-assistant/reportes/route.ts` (1) ⚠️ nuevo endpoint en folder existente |

## MODIFICAR (3 archivos — ⚠️ fuera del módulo, requiere tu aprobación)
- `src/lib/config/modulePages.ts` (reports → 1 página)
- `src/components/app-layout/AppLayout.tsx` (quitar subrutas reportes)
- `src/components/app-layout/Sidebar/SidebarNavigation.tsx` (quitar subrutas reportes)

## SUPABASE (5–6 migraciones vía MCP)
1. `reportes_ventas_pos` (3 RPC)
2. `reportes_finanzas` (4 RPC)
3. `reportes_contables` (3 RPC)
4. `reportes_inventario` (3 RPC)
5. `reportes_crm_hrm_operativos` (8 RPC)
6. `report_executions_result_snapshot` (columna snapshot, si falta)

## DEPENDENCIAS
- `npm install jspdf jspdf-autotable` (única nueva)

---

# 14. Checklist de validación final

1. `npm run lint` sin errores en archivos nuevos.
2. `npm run build` exitoso.
3. Con una org con **pocos módulos activos**: solo aparecen sus secciones.
4. Con org con **todos los módulos**: aparecen todas; los reportes sin datos muestran `ReporteEmpty` (no error).
5. Cada tipo de cierre resuelve fechas correctas (probar quincena 1 y 2, Q1–Q4, S1–S2).
6. PDF individual: abre, B/N, encabezado/pie correctos, moneda `es-CO`, multipágina con header repetido.
7. PDF cierre consolidado: portada + índice + secciones por módulo.
8. Chat IA: pide "cierre de caja de hoy" → ejecuta y muestra tabla; sin `OPENAI_API_KEY` → fallback amigable.
9. Middleware: acceso a `/app/reportes` sigue validando módulo `reports` activo (sin cambios).
10. Sidebar muestra solo "Reportes" (sin submenús).

**PR final:** `SCRUM-[ID] – Reconstrucción módulo reportes: página única, cierres, PDF B/N y agente IA`
Revisores: @santycano, @Palomo-dev
