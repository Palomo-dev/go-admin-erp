# FASE 14 — Revenue OS: métricas, forecast y matemática comercial

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipeline), F10 (cierre), F13 (comisiones, cuotas)
> Bloquea: — (F15 es polish, no depende de F14)

---

## 0. Objetivo y alcance

**Qué resuelve:** el dashboard de Revenue Operations con TODAS las métricas comerciales: actividad, conversión, revenue, calidad, MRR, ARR, CAC, LTV, churn, win rate, sales cycle, ARPA, y capacidad. Forecast con escenarios y matemática comercial.

**Puntos del método que cubre:** 27 (Revenue OS), 28 (forecast), 29 (matemática comercial).

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
| `mv_call_quality` | ✅ (F4 la crea) | BD |
| `mv_customer_health` | ✅ (F11 la crea) | BD |
| `mv_revenue_metrics` | ❌ | — |
| `mv_pipeline_funnel` | ❌ | — |
| `mv_cohort_retention` | ❌ | — |
| Revenue OS dashboard | ❌ | — |

---

## 2. Base de datos

### 2.1 Vistas materializadas

#### `mv_revenue_metrics`

```sql
CREATE MATERIALIZED VIEW mv_revenue_metrics AS
SELECT
  o.organization_id,
  DATE_TRUNC('month', o.created_at) AS month,
  COUNT(*) FILTER (WHERE o.status = 'won') AS deals_won,
  COUNT(*) FILTER (WHERE o.status = 'lost') AS deals_lost,
  COUNT(*) FILTER (WHERE o.status NOT IN ('won','lost')) AS deals_open,
  SUM(o.amount) FILTER (WHERE o.status = 'won') AS revenue_won,
  SUM(o.amount) FILTER (WHERE o.status = 'lost') AS revenue_lost,
  SUM(o.amount) FILTER (WHERE o.status NOT IN ('won','lost')) AS revenue_pipeline,
  AVG(o.amount) FILTER (WHERE o.status = 'won') AS arpa,
  AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at))/86400)
    FILTER (WHERE o.status = 'won') AS avg_sales_cycle_days,
  COUNT(*) FILTER (WHERE o.status = 'won')::float /
    NULLIF(COUNT(*) FILTER (WHERE o.status IN ('won','lost')), 0) AS win_rate
FROM opportunities o
GROUP BY o.organization_id, DATE_TRUNC('month', o.created_at);

CREATE UNIQUE INDEX idx_mv_revenue ON mv_revenue_metrics (organization_id, month);
```

#### `mv_pipeline_funnel`

```sql
CREATE MATERIALIZED VIEW mv_pipeline_funnel AS
SELECT
  o.organization_id,
  s.id AS stage_id,
  s.name AS stage_name,
  s.position,
  COUNT(o.id) AS opportunity_count,
  SUM(o.amount) AS total_amount,
  AVG(o.amount) AS avg_amount
FROM stages s
LEFT JOIN opportunities o ON o.stage_id = s.id
GROUP BY o.organization_id, s.id, s.name, s.position
ORDER BY o.organization_id, s.position;

CREATE UNIQUE INDEX idx_mv_funnel ON mv_pipeline_funnel (organization_id, stage_id);
```

#### `mv_cohort_retention`

```sql
CREATE MATERIALIZED VIEW mv_cohort_retention AS
SELECT
  c.organization_id,
  DATE_TRUNC('month', c.created_at) AS cohort_month,
  COUNT(DISTINCT c.id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN i.invoice_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '1 month'
    AND i.invoice_date < DATE_TRUNC('month', c.created_at) + INTERVAL '2 months'
    THEN c.id END) AS retained_m1,
  COUNT(DISTINCT CASE WHEN i.invoice_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '2 months'
    AND i.invoice_date < DATE_TRUNC('month', c.created_at) + INTERVAL '3 months'
    THEN c.id END) AS retained_m2,
  COUNT(DISTINCT CASE WHEN i.invoice_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '3 months'
    AND i.invoice_date < DATE_TRUNC('month', c.created_at) + INTERVAL '4 months'
    THEN c.id END) AS retained_m3,
  COUNT(DISTINCT CASE WHEN i.invoice_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '6 months'
    AND i.invoice_date < DATE_TRUNC('month', c.created_at) + INTERVAL '7 months'
    THEN c.id END) AS retained_m6,
  COUNT(DISTINCT CASE WHEN i.invoice_date >= DATE_TRUNC('month', c.created_at) + INTERVAL '12 months'
    AND i.invoice_date < DATE_TRUNC('month', c.created_at) + INTERVAL '13 months'
    THEN c.id END) AS retained_m12
FROM customers c
LEFT JOIN invoice_sales i ON i.customer_id = c.id
WHERE c.lifecycle_stage = 'customer'
GROUP BY c.organization_id, DATE_TRUNC('month', c.created_at);

CREATE UNIQUE INDEX idx_mv_cohort ON mv_cohort_retention (organization_id, cohort_month);
```

### 2.2 Refresh cron

```sql
-- Job que refresca todas las vistas materializadas cada hora
-- Vía Supabase MCP o pg_cron:
-- SELECT cron.schedule('refresh-mv', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_metrics; ...');
```

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/commercialMetricsService.ts` | modificar | Usar vistas materializadas |
| `src/lib/services/crm/forecastService.ts` | modificar | Forecast con escenarios |
| `src/lib/services/crm/revenueOsService.ts` | crear | Agregador de todas las métricas |

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

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/revenue-os` | `src/app/app/crm/revenue-os/page.tsx` | crear | Dashboard Revenue OS |

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

- Todas las vistas materializadas particionan por `organization_id`.
- RLS en las vistas hereda de las tablas subyacentes.
- Un vendedor solo ve métricas de su organización.
- Datos sensibles (CAC, LTV) solo visibles para managers/admins.

---

## 6. Pruebas

- `mv_revenue_metrics` devuelve datos correctos por mes.
- `mv_pipeline_funnel` muestra conteo y monto por etapa.
- `mv_cohort_retention` muestra retención M0–M12.
- Forecast best/expected/worst se calculan correctamente.
- CAC, LTV, LTV/CAC, payback se calculan con la fórmula correcta.
- Churn rate y net retention se calculan correctamente.
- Dashboard carga en < 2s con 10k oportunidades.
- Vista materializada se refresca sin bloquear lecturas (CONCURRENTLY).

---

## 7. Definition of Done

- [ ] `mv_revenue_metrics`, `mv_pipeline_funnel`, `mv_cohort_retention` existen.
- [ ] Cron de refresh funciona.
- [ ] `revenueOsService` agrega todas las métricas.
- [ ] `forecastService` calcula best/expected/worst.
- [ ] CAC, LTV, LTV/CAC, payback, churn, net retention, ARPA se calculan.
- [ ] `/app/crm/revenue-os` con KPIs, funnel, forecast, cohort, capacidad.
- [ ] `FunnelChart`, `ForecastChart`, `CohortTable` funcionan.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/revenueOsService.ts` | crear | Agregador métricas |
| `src/lib/services/crm/commercialMetricsService.ts` | modificar | Usar MVs |
| `src/lib/services/crm/forecastService.ts` | modificar | Escenarios |
| `src/app/api/crm/revenue-os/route.ts` + `forecast` + `funnel` + `cohort` | crear | APIs |
| `src/app/app/crm/revenue-os/page.tsx` | crear | UI dashboard |
| `src/components/crm/revenueos/RevenueOsDashboard.tsx` | crear | Dashboard |
| `src/components/crm/revenueos/KpiCard.tsx` | crear | KPI card |
| `src/components/crm/revenueos/FunnelChart.tsx` | crear | Embudo |
| `src/components/crm/revenueos/ForecastChart.tsx` | crear | Forecast |
| `src/components/crm/revenueos/CohortTable.tsx` | crear | Cohorte |
| `src/components/crm/revenueos/TrendChart.tsx` | crear | Tendencia |
| `src/components/crm/revenueos/ConversionRates.tsx` | crear | Conversión |
| `src/components/crm/revenueos/CapacityGauge.tsx` | crear | Capacidad |
