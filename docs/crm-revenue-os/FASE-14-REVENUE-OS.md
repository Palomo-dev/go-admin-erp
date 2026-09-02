# FASE 14 — Revenue OS: métricas, forecast y matemática comercial

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0 (RLS), F1 (`lifecycle_stage`), F2 (`closed_at`), F10 (cierre), F13 (comisiones, cuotas)
> Bloquea: — (F15 es polish, no depende de F14)

### Prerrequisitos de esquema — las funciones NO compilan sin esto

Verificado contra la BD live el 2026-09-01. Estas columnas **no existen hoy** y son
usadas por las funciones de esta fase:

| Columna que falta | La crea | Usada por | Si falta |
|---|---|---|---|
| `opportunities.closed_at timestamptz` | **F2** (migración 1 + trigger + backfill) | `avg_sales_cycle_days` en `fn_revenue_metrics` | ❌ la función falla al crearse |
| `customers.lifecycle_stage text` | **F1** (migración 3 + **backfill obligatorio**) | `fn_cohort_retention` | ❌ cohortes vacías |
| RLS con políticas en `opportunity_stage_history` | **F0** | sales cycle por etapa | ❌ `0 filas` desde el cliente |

**Hechos del esquema real que estas funciones deben respetar (no cambiar):**

| Hecho verificado | Consecuencia en el SQL |
|---|---|
| `payments` **no tiene** `invoice_id` ni `customer_id` | El vínculo es polimórfico: `payments.source='invoice_sales'` + `payments.source_id` |
| `payments.source_id` es **`text`** | Cast obligatorio: `p.source_id = i.id::text` |
| El valor real de `payments.source` es **`'invoice_sales'`** (plural) | Usar `'invoice_sale'` singular devuelve **0 filas** |
| `payments.status` de facturas es **`'completed'`** | No `'paid'` (ese valor es de `web_order`) |
| `commissions` **no tiene** `amount` | La columna de importe es **`commission_amount`**; `base_amount` es la base |
| `organizations.id` es **`integer`** | `p_org_id integer`, nunca `uuid` |
| `invoice_sales.status` válidos | `paid`, `issued`, `partial`, `draft`, `void` |

Datos reales de referencia para validar los resultados: 590 pagos con
`source='invoice_sales'` y `status='completed'` por **$72 551 163**; 103 comisiones
todas en `status='accrued'` (**ninguna `paid` todavía** → `commissions_paid` dará 0
hasta que F13 implemente el pago).

---

## 0. Objetivo y alcance

**Qué resuelve:** el dashboard de Revenue Operations con TODAS las métricas comerciales: actividad, conversión, revenue, calidad, MRR, ARR, CAC, LTV, churn, win rate, sales cycle, ARPA, y capacidad. Forecast con escenarios y matemática comercial.

**Puntos del método que cubre:** 27 (Revenue OS), 28 (forecast), 29 (matemática comercial).

### 0.1 Integración con finanzas (cero migraciones — reusa motor contable existente)

Revenue OS **no inventa métricas de revenue desde opportunities.amount**. Las calcula desde los datos financieros reales que ya existen:

| Métrica | Fuente existente | Cómo se calcula |
|---|---|---|
| MRR | `invoice_sales` + `payments` | SUM de facturas recurrentes pagadas en el mes (filtrado por `billing_period` jsonb) |
| ARR | `invoice_sales` | MRR × 12 |
| Revenue del período | `payments` | SUM `amount` WHERE `status='completed'` AND `payment_date` en período |
| ARPA | `invoice_sales` | AVG `total` WHERE `status='paid'` |
| CAC | `payments` + `opportunities` | (gastos de adquisición / nuevos clientes ganados) — gastos desde `journal_entries` con `source='expense'` |
| LTV | `invoice_sales` + `customers` | ARPA × gross_margin × (1 / churn_rate) |
| Churn | `customers` + `invoice_sales` | clientes que dejaron de facturar / total clientes del cohorte |
| Pipeline value | `opportunities` | SUM `amount` WHERE `status='open'` |
| Win rate | `opportunities` | won / (won + lost) |
| Sales cycle | `opportunities` + `opportunity_stage_history` | AVG días desde created_at hasta closed_at |
| Comisiones pagadas | `commissions` | SUM `commission_amount` WHERE `status='paid'` |
| Asientos contables | `journal_entries` + `journal_lines` | Balance real desde el ledger (double-entry) |

**El motor contable existente ya tiene:**
- `accounting_rules` con 60+ source_types (sale, invoice_sales, commission, expense, payment, etc.)
- `journal_entries` con `source`, `source_id`, multi-moneda (`currency_code`, `exchange_rate`, `debit_base`, `credit_base`)
- `journal_lines` con `account_code`, `debit`, `credit`, `cost_center_id`
- `chart_of_accounts` con plan de cuentas por organización
- `vw_accounting_engine_health` (vista de salud del motor)

Revenue OS consulta estas tablas para mostrar **revenue real contable**, no estimaciones de pipeline.

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `commercialMetricsService.ts` | ✅ existe | `src/lib/services/crm/commercialMetricsService.ts` |
| `forecastService.ts` | ✅ existe | `src/lib/services/crm/forecastService.ts` |
| `forecastRealTimeService.ts` | ✅ existe | `src/lib/services/crm/forecastRealTimeService.ts` |
| `reportAgentService.ts` | ✅ existe | `src/lib/services/reportes/reportAgentService.ts` |
| `/app/reportes` | ✅ existe | `src/app/app/reportes/page.tsx` |
| `pdfExportService.ts` | ✅ existe | `src/lib/services/reportes/pdfExportService.ts` |
| `reportExecutionService.ts` | ✅ existe | `src/lib/services/reportes/reportExecutionService.ts` |
| `invoice_sales` con `opportunity_id`, `customer_id`, `total`, `balance`, `status` | ✅ ya existe | BD |
| `payments` con `source`, `source_id`, `amount`, `status`, `payment_date` | ✅ ya existe | BD |
| `commissions` con `source_type`, `payee_id`, `commission_amount`, `status` | ✅ ya existe (100+ registros) | BD |
| `journal_entries` + `journal_lines` (ledger double-entry) | ✅ ya existe (20+ sources) | BD |
| `chart_of_accounts` (plan de cuentas por org) | ✅ ya existe | BD |
| `accounting_rules` (60+ source_types, 5000+ reglas) | ✅ ya existe | BD |
| `cost_centers` | ✅ ya existe | BD |
| `vw_accounting_engine_health` | ✅ ya existe | BD |
| `ContabilidadService.crearAsiento()` | ✅ ya existe | `src/components/finanzas/contabilidad/ContabilidadService.ts:244` |
| `fn_call_quality` | ❌ — F4 la crea como **función** (se descartó `mv_call_quality`: una MV no hereda RLS) | BD |
| `fn_customer_health` | ❌ — F11 la crea como **función** (se descartó `mv_customer_health`) | BD |
| `fn_revenue_metrics` | ❌ | — |
| `fn_pipeline_funnel` | ❌ | — |
| `fn_cohort_retention` | ❌ | — |
| Revenue OS dashboard | ❌ | — |

---

## 2. Base de datos

### 2.1 Funciones (RPC) — datos siempre frescos, sin cron

Se usan **funciones** en vez de vistas materializadas: los datos se calculan en el momento de la consulta, sin necesidad de cron de refresco ni riesgo de datos stale.

#### `fn_revenue_metrics`

```sql
-- Revenue real desde payments + invoice_sales, no solo opportunities.amount
-- Función: se ejecuta on-demand, datos siempre frescos
-- Pipeline (opportunities.amount) y revenue real (payments/invoice_sales) se
-- calculan en CTEs separadas para evitar fan-out y no confundir pipeline con
-- revenue contable. ARPA viene de invoice_sales.total de facturas pagadas.
CREATE OR REPLACE FUNCTION fn_revenue_metrics(
  p_org_id integer,
  p_start date,
  p_end date
) RETURNS TABLE (
  month date,
  deals_won bigint,
  deals_lost bigint,
  deals_open bigint,
  revenue_won_pipeline numeric,
  revenue_lost numeric,
  revenue_pipeline numeric,
  arpa numeric,
  avg_sales_cycle_days numeric,
  win_rate numeric,
  revenue_collected numeric,
  commissions_paid numeric
) AS $$
  WITH pipeline AS (
    SELECT
      DATE_TRUNC('month', o.created_at)::date AS month,
      COUNT(*) FILTER (WHERE o.status = 'won') AS deals_won,
      COUNT(*) FILTER (WHERE o.status = 'lost') AS deals_lost,
      COUNT(*) FILTER (WHERE o.status NOT IN ('won','lost')) AS deals_open,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'won'), 0) AS revenue_won_pipeline,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'lost'), 0) AS revenue_lost,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status NOT IN ('won','lost')), 0) AS revenue_pipeline,
      AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at))/86400)
        FILTER (WHERE o.status = 'won') AS avg_sales_cycle_days,
      COUNT(*) FILTER (WHERE o.status = 'won')::float /
        NULLIF(COUNT(*) FILTER (WHERE o.status IN ('won','lost')), 0) AS win_rate
    FROM opportunities o
    WHERE o.organization_id = p_org_id
      AND o.created_at >= p_start
      AND o.created_at < p_end
    GROUP BY DATE_TRUNC('month', o.created_at)
  ),
  -- ARPA real: AVG de invoice_sales.total de facturas pagadas (no opportunities.amount)
  arpa_period AS (
    SELECT
      DATE_TRUNC('month', i.issue_date)::date AS month,
      AVG(i.total) AS arpa
    FROM invoice_sales i
    WHERE i.organization_id = p_org_id
      AND i.status = 'paid'
      AND i.issue_date >= p_start
      AND i.issue_date < p_end
    GROUP BY DATE_TRUNC('month', i.issue_date)
  ),
  -- Revenue real cobrado (desde payments JOIN invoice_sales)
  revenue AS (
    SELECT
      DATE_TRUNC('month', p.payment_date)::date AS month,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'
        AND i.opportunity_id IS NOT NULL), 0) AS revenue_collected
    FROM payments p
    -- OJO: payments.source_id es text → cast obligatorio. El valor real de
    -- payments.source es 'invoice_sales' (PLURAL). Verificado: 590 pagos,
    -- $72.5M con source='invoice_sales' AND status='completed'.
    JOIN invoice_sales i ON p.source_id = i.id::text AND p.source = 'invoice_sales'
    WHERE i.organization_id = p_org_id
      AND p.payment_date >= p_start
      AND p.payment_date < p_end
    GROUP BY DATE_TRUNC('month', p.payment_date)
  ),
  -- Comisiones pagadas (desde commissions, por fecha de pago)
  commissions_paid AS (
    SELECT
      DATE_TRUNC('month', c.paid_at)::date AS month,
      COALESCE(SUM(c.commission_amount), 0) AS commissions_paid
    FROM commissions c
    WHERE c.organization_id = p_org_id
      AND c.status = 'paid'
      AND c.paid_at >= p_start
      AND c.paid_at < p_end
    GROUP BY DATE_TRUNC('month', c.paid_at)
  )
  SELECT
    p.month,
    p.deals_won,
    p.deals_lost,
    p.deals_open,
    p.revenue_won_pipeline,
    p.revenue_lost,
    p.revenue_pipeline,
    a.arpa,
    p.avg_sales_cycle_days,
    p.win_rate,
    COALESCE(r.revenue_collected, 0) AS revenue_collected,
    COALESCE(cp.commissions_paid, 0) AS commissions_paid
  FROM pipeline p
  LEFT JOIN arpa_period a ON a.month = p.month
  LEFT JOIN revenue r ON r.month = p.month
  LEFT JOIN commissions_paid cp ON cp.month = p.month
  ORDER BY p.month;
$$ LANGUAGE sql STABLE;
```

> **Notas:**
> - `revenue_won_pipeline` es el valor de oportunidades ganadas según `opportunities.amount` (pipeline), **no** revenue contable. Es una métrica de pipeline separada.
> - `arpa` se calcula desde `invoice_sales.total` de facturas con `status='paid'`, no desde `opportunities.amount`.
> - `revenue_collected` viene de `payments.amount` con `status='completed'` JOIN `invoice_sales`.
> - Las CTEs separadas evitan el fan-out del JOIN múltiple (una oportunidad con N facturas y M pagos ya no infla los montos).

#### `fn_pipeline_funnel`

```sql
CREATE OR REPLACE FUNCTION fn_pipeline_funnel(
  p_org_id integer
) RETURNS TABLE (
  stage_id uuid,
  stage_name text,
  position integer,
  opportunity_count bigint,
  total_amount numeric,
  avg_amount numeric
) AS $$
  SELECT
    s.id AS stage_id,
    s.name AS stage_name,
    s.position,
    COUNT(o.id) AS opportunity_count,
    COALESCE(SUM(o.amount), 0) AS total_amount,
    AVG(o.amount) AS avg_amount
  FROM stages s
  LEFT JOIN opportunities o ON o.stage_id = s.id AND o.organization_id = p_org_id
  WHERE s.organization_id = p_org_id
  GROUP BY s.id, s.name, s.position
  ORDER BY s.position;
$$ LANGUAGE sql STABLE;
```

#### `fn_cohort_retention`

```sql
-- Retención por cohorte de clientes: tasas % (no conteos absolutos).
-- Función: se ejecuta on-demand, datos siempre frescos.
-- Maneja cohortes vacías: NULLIF(cohort_size, 0) evita división por cero
-- y devuelve NULL cuando no hay clientes en el cohorte.
CREATE OR REPLACE FUNCTION fn_cohort_retention(
  p_org_id integer,
  p_start date,
  p_end date
) RETURNS TABLE (
  cohort_month date,
  cohort_size bigint,
  retained_m1 bigint,
  retained_m2 bigint,
  retained_m3 bigint,
  retained_m6 bigint,
  retained_m12 bigint,
  retention_m1_pct numeric,
  retention_m2_pct numeric,
  retention_m3_pct numeric,
  retention_m6_pct numeric,
  retention_m12_pct numeric
) AS $$
  WITH cohort AS (
    SELECT
      DATE_TRUNC('month', c.created_at)::date AS cohort_month,
      COUNT(DISTINCT c.id) AS cohort_size
    FROM customers c
    WHERE c.organization_id = p_org_id
      AND c.lifecycle_stage = 'customer'
      AND c.created_at >= p_start
      AND c.created_at < p_end
    GROUP BY DATE_TRUNC('month', c.created_at)
  ),
  retention AS (
    SELECT
      DATE_TRUNC('month', c.created_at)::date AS cohort_month,
      COUNT(DISTINCT CASE WHEN i.issue_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '1 month'
        AND i.issue_date < DATE_TRUNC('month', c.created_at) + INTERVAL '2 months'
        THEN c.id END) AS retained_m1,
      COUNT(DISTINCT CASE WHEN i.issue_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '2 months'
        AND i.issue_date < DATE_TRUNC('month', c.created_at) + INTERVAL '3 months'
        THEN c.id END) AS retained_m2,
      COUNT(DISTINCT CASE WHEN i.issue_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '3 months'
        AND i.issue_date < DATE_TRUNC('month', c.created_at) + INTERVAL '4 months'
        THEN c.id END) AS retained_m3,
      COUNT(DISTINCT CASE WHEN i.issue_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '6 months'
        AND i.issue_date < DATE_TRUNC('month', c.created_at) + INTERVAL '7 months'
        THEN c.id END) AS retained_m6,
      COUNT(DISTINCT CASE WHEN i.issue_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '12 months'
        AND i.issue_date < DATE_TRUNC('month', c.created_at) + INTERVAL '13 months'
        THEN c.id END) AS retained_m12
    FROM customers c
    LEFT JOIN invoice_sales i ON i.customer_id = c.id
      AND i.organization_id = p_org_id
    WHERE c.organization_id = p_org_id
      AND c.lifecycle_stage = 'customer'
      AND c.created_at >= p_start
      AND c.created_at < p_end
    GROUP BY DATE_TRUNC('month', c.created_at)
  )
  SELECT
    ch.cohort_month,
    ch.cohort_size,
    r.retained_m1,
    r.retained_m2,
    r.retained_m3,
    r.retained_m6,
    r.retained_m12,
    -- Tasas de retención %: dividir por cohort_size con NULLIF (cohortes vacías → NULL)
    r.retained_m1::numeric / NULLIF(ch.cohort_size, 0) * 100 AS retention_m1_pct,
    r.retained_m2::numeric / NULLIF(ch.cohort_size, 0) * 100 AS retention_m2_pct,
    r.retained_m3::numeric / NULLIF(ch.cohort_size, 0) * 100 AS retention_m3_pct,
    r.retained_m6::numeric / NULLIF(ch.cohort_size, 0) * 100 AS retention_m6_pct,
    r.retained_m12::numeric / NULLIF(ch.cohort_size, 0) * 100 AS retention_m12_pct
  FROM cohort ch
  JOIN retention r ON r.cohort_month = ch.cohort_month
  ORDER BY ch.cohort_month;
$$ LANGUAGE sql STABLE;
```

> **Notas:**
> - `retained_mN` son conteos absolutos; `retention_mN_pct` son las tasas de retención % (`retained / cohort_size × 100`).
> - `NULLIF(cohort_size, 0)` devuelve `NULL` para cohortes vacías, evitando división por cero.
> - Se usa `issue_date` (columna real de `invoice_sales`) en vez de `invoice_date`.

### 2.2 Sin cron de refresco

Las funciones se ejecutan on-demand en cada consulta. **No se necesita `pg_cron`** ni job de refresco — los datos siempre están frescos.

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/commercialMetricsService.ts` | modificar | Ejecutar funciones on-demand (fn_revenue_metrics, fn_pipeline_funnel, fn_cohort_retention) |
| `src/lib/services/crm/forecastService.ts` | modificar | Forecast con escenarios |
| `src/lib/services/crm/revenueOsService.ts` | crear | Agregador de todas las métricas (pipeline + revenue real desde payments + comisiones) |
| `src/lib/services/crm/crmFinanceService.ts` | modificar | Añadir agregados de revenue desde `payments`, `invoice_sales`, `commissions`, `journal_entries` |

#### `revenueOsService.ts` — métricas completas

```typescript
export interface RevenueOsMetrics {
  // Actividad
  callsMade: number;
  emailsSent: number;
  demosCompleted: number;
  meetingsHeld: number;
  activitiesTotal: number;

  // Conversión
  leadToQualifiedRate: number;
  qualifiedToDemoRate: number;
  demoToProposalRate: number;
  proposalToWinRate: number;
  overallWinRate: number;

  // Revenue
  mrr: number;
  arr: number;
  revenueThisMonth: number;
  revenueThisQuarter: number;
  revenueThisYear: number;
  arpa: number;

  // Eficiencia
  cac: number;
  ltv: number;
  ltvCacRatio: number;
  paybackMonths: number;

  // Retención
  churnRate: number;
  netRetentionRate: number;
  grossRetentionRate: number;

  // Pipeline
  pipelineValue: number;
  pipelineCoverage: number; // pipeline / quota
  weightedPipeline: number;

  // Ciclo
  avgSalesCycleDays: number;
  avgDealSize: number;

  // Capacidad
  sellerCapacity: number; // calls/day posible
  utilizationRate: number; // actual / capacidad

  // Forecast
  forecastBest: number;
  forecastExpected: number;
  forecastWorst: number;
}

export async function getRevenueOsMetrics(
  supabase: SupabaseClient,
  orgId: number,
  period: { start: Date; end: Date }
): Promise<RevenueOsMetrics>;
```

#### Forecast con escenarios

```typescript
export async function getForecast(supabase, orgId, period) {
  // Best case: todas las opps en etapas finales se ganan
  const bestCase = await sumOpportunitiesByStageRange(supabase, orgId, {
    minPosition: 70, // etapas finales
    period,
  });

  // Expected: weighted pipeline (amount × probability por etapa)
  const expected = await sumWeightedPipeline(supabase, orgId, period);

  // Worst case: solo las opps en la última etapa antes de won
  const worstCase = await sumOpportunitiesByStageRange(supabase, orgId, {
    minPosition: 90,
    period,
  });

  return { best: bestCase, expected, worst: worstCase };
}
```

#### Matemática comercial

```typescript
// CAC = (gastos de marketing + ventas) / nuevos clientes
// LTV = ARPA × gross_margin × (1 / churn_rate)
// LTV/CAC ratio = LTV / CAC (saludable: > 3)
// Payback = CAC / (ARPA × gross_margin)
// Pipeline coverage = pipeline_value / quota
// Net retention = (MRR_start + expansion - churn - contraction) / MRR_start
```

### 3.2 Endpoints

| Endpoint | Archivo | Acción | Método |
|---|---|---|---|
| `/api/crm/revenue-os` | crear | crear | GET |
| `/api/crm/revenue-os/forecast` | crear | crear | GET |
| `/api/crm/revenue-os/funnel` | crear | crear | GET |
| `/api/crm/revenue-os/cohort` | crear | crear | GET |

---

## 4. UI

### 4.1 Rutas

> **Nota R7 (2026-09-01) — integración de Métricas en `/app/inicio`:**
> `ModuloSection.tsx` ahora soporta 3 tabs: **Dashboard | Reportes | Métricas**.
> `CrmSection.tsx` pasa `metricasContent={<MetricasView />}` al dashboard, de modo
> que las métricas comerciales (antes en `/app/crm/metricas`, página eliminada) se
> muestran dentro del tab "Métricas" del módulo CRM en `/app/inicio`.
> `ReportesPage` ya estaba integrado; `MetricasView` ahora también.
> La página `/app/crm/metricas` fue eliminada (consolidada).

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/inicio` | `src/app/app/inicio/page.tsx` | **mejorar** | Widgets Revenue OS: Revenue (MRR/ARR/cobrado), Pipeline (win rate/ciclo), Comisiones (devengado/pagado), Cuotas (progreso equipo) — tabs Dashboard/Reportes/Métricas |

**No se crea página nueva.** El Revenue OS se integra como widgets en el dashboard `/app/inicio` existente:
- ~~`/app/crm/revenue-os`~~ → widgets en `/app/inicio`
- ~~`/app/crm/metricas`~~ → eliminada; consolidada en tab "Métricas" de `/app/inicio` (módulo CRM)

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/revenueos/RevenueOsDashboard.tsx` | crear | — | Dashboard completo |
| `src/components/crm/revenueos/KpiCard.tsx` | crear | `label`, `value`, `trend` | Card de KPI |
| `src/components/crm/revenueos/FunnelChart.tsx` | crear | `funnel` | Embudo de conversión |
| `src/components/crm/revenueos/ForecastChart.tsx` | crear | `forecast` | Gráfico de forecast con escenarios |
| `src/components/crm/revenueos/CohortTable.tsx` | crear | `cohort` | Tabla de retención por cohorte |
| `src/components/crm/revenueos/TrendChart.tsx` | crear | `data` | Línea de tendencia temporal |
| `src/components/crm/revenueos/ConversionRates.tsx` | crear | `rates` | Tasas de conversión entre etapas |
| `src/components/crm/revenueos/CapacityGauge.tsx` | crear | `capacity` | Gauge de utilización |

### 4.3 Wireframes

```
┌─ Revenue OS ────────────────────────────────────────────────┐
│  Período: [Agosto 2026 ▼]                                    │
│                                                                │
│  ┌─ KPIs ────────────────────────────────────────────────┐  │
│  │ MRR: $42k ↗ 12%  |  ARR: $504k  |  Win rate: 34% ↗   │  │
│  │ CAC: $1.2k       |  LTV: $8.4k  |  LTV/CAC: 7.0 ✅    │  │
│  │ Churn: 2.1% ↘    |  ARPA: $700  |  Cycle: 18d ↘       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Funnel ─────────────┐  ┌─ Forecast ──────────┐           │
│  │ Lead      100 ──────│  │     Best: $5.2M     │           │
│  │ Calificado  60 ────│  │  Expected: $3.8M     │           │
│  │ Demo        35 ────│  │     Worst: $1.5M     │           │
│  │ Propuesta   20 ────│  │                       │           │
│  │ Ganadas     12 ────│  │  [Gráfico de barras] │           │
│  └─────────────────────┘  └───────────────────────┘           │
│                                                                │
│  ┌─ Conversión entre etapas ─────────────────────────────┐  │
│  │ Lead → Calificado:  60%                                │  │
│  │ Calificado → Demo:  58%                                │  │
│  │ Demo → Propuesta:   57%                                │  │
│  │ Propuesta → Won:    60%                                │  │
│  │ Overall:            12%                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Cohort retention ────────────────────────────────────┐  │
│  │ Cohort    M0  M1  M2  M3  M6  M12                     │  │
│  │ Ene 2026  45  42  40  38  35  30                      │  │
│  │ Feb 2026  38  35  33  31  —   —                       │  │
│  │ Mar 2026  52  48  45  —   —   —                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Capacidad del equipo ────────────────────────────────┐  │
│  │ Utilización: 78% ████████████░░░                       │  │
│  │ Llamadas/día: 45/60 posibles                           │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Animaciones Motion

```tsx
// KPI cards con stagger
<motion.div initial="hidden" animate="visible" variants={{
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.08 } },
}}>
  {kpis.map(kpi => (
    <motion.div key={kpi.label} variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    }}>
      <KpiCard {...kpi} />
    </motion.div>
  ))}
</motion.div>

// Números con AnimateNumber
<motion.span
  key={value}
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
>
  {formatCurrency(value)}
</motion.span>

// Funnel con barras que crecen
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${percentage}%` }}
  transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.1 }}
/>
```

---

## 5. Multi-tenant y seguridad

- Todas las funciones reciben `p_org_id` como parámetro y filtran por `organization_id`.
- Las funciones son `SECURITY DEFINER` con `current_org_id()` o se llaman desde el servicio con el orgId del contexto.
- Un vendedor solo ve métricas de su organización.
- Datos sensibles (CAC, LTV) solo visibles para managers/admins.

---

## 6. Pruebas

- `fn_revenue_metrics` devuelve datos correctos por mes.
- `fn_pipeline_funnel` muestra conteo y monto por etapa.
- `fn_cohort_retention` muestra retención M0–M12.
- Forecast best/expected/worst se calculan correctamente.
- CAC, LTV, LTV/CAC, payback se calculan con la fórmula correcta.
- Churn rate y net retention se calculan correctamente.
- Dashboard carga en < 2s con 10k oportunidades.
- Funciones on-demand ejecutan en < 500ms con índices apropiados.

---

## 7. Definition of Done

- [ ] `fn_revenue_metrics`, `fn_pipeline_funnel`, `fn_cohort_retention` existen.
- [ ] Las funciones retornan datos frescos sin necesidad de cron.
- [ ] `revenueOsService` agrega todas las métricas.
- [ ] `forecastService` calcula best/expected/worst.
- [ ] CAC, LTV, LTV/CAC, payback, churn, net retention, ARPA se calculan.
- [ ] Revenue real se calcula desde `payments` + `invoice_sales`, no solo desde `opportunities.amount`.
- [ ] Comisiones pagadas se muestran desde `commissions` existente (no tabla doble).
- [ ] `fn_revenue_metrics` incluye `revenue_collected` desde `payments` y `commissions_paid` desde `commissions`.
- [ ] `/app/inicio` con widgets Revenue OS: KPIs, funnel, forecast, cohort, capacidad.
- [ ] `FunnelChart`, `ForecastChart`, `CohortTable` funcionan.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/revenueOsService.ts` | crear | Agregador métricas (pipeline + revenue real + comisiones) |
| `src/lib/services/crm/crmFinanceService.ts` | modificar | Agregados de revenue desde tablas financieras existentes |
| `src/lib/services/crm/commercialMetricsService.ts` | modificar | Usar MVs |
| `src/lib/services/crm/forecastService.ts` | modificar | Escenarios |
| `src/app/api/crm/revenue-os/route.ts` + `forecast` + `funnel` + `cohort` | crear | APIs |
| `src/app/app/inicio/page.tsx` | **mejorar** | Widgets Revenue OS en dashboard existente |
| `src/components/crm/revenueos/RevenueOsDashboard.tsx` | crear | Dashboard |
| `src/components/crm/revenueos/KpiCard.tsx` | crear | KPI card |
| `src/components/crm/revenueos/FunnelChart.tsx` | crear | Embudo |
| `src/components/crm/revenueos/ForecastChart.tsx` | crear | Forecast |
| `src/components/crm/revenueos/CohortTable.tsx` | crear | Cohorte |
| `src/components/crm/revenueos/TrendChart.tsx` | crear | Tendencia |
| `src/components/crm/revenueos/ConversionRates.tsx` | crear | Conversión |
| `src/components/crm/revenueos/CapacityGauge.tsx` | crear | Capacidad |
