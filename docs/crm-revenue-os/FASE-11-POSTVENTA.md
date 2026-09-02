# FASE 11 — Post-venta: onboarding, activación, health, renovación, expansión

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipelines), F8 (automatizaciones)
> Bloquea: F12 (referidos parten de clientes satisfechos)

---

## 0. Objetivo y alcance

**Qué resuelve:** el post-venta completo: onboarding día 0–30, customer success con health score, renovaciones a 120/90/60/30/15/7 días, y expansión (upsell/cross-sell) en pipeline separado. Todo reutiliza la infraestructura de pipelines existente.

**Puntos del método que cubre:** 18 (onboarding separado), 19 (día 0–30), 20 (health score), 21 (renovación), 22 (expansión).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `onboardingService.ts` | ✅ existe | `src/lib/services/crm/onboardingService.ts` |
| `renewalService.ts` | ✅ existe | `src/lib/services/crm/renewalService.ts` |
| `expansionService.ts` | ✅ existe | `src/lib/services/crm/expansionService.ts` |
| `healthScoreService.ts` | ✅ existe | `src/lib/services/crm/healthScoreService.ts` |
| `health_score_configs` / `health_score_snapshots` | ✅ existen | BD |
| `SaludView.tsx` | ✅ existe | `src/components/crm/` |
| `/api/crm/health/recalculate` | ✅ existe | `src/app/api/crm/health/recalculate/route.ts` |
| `/api/crm/renewals/sync` | ✅ existe | `src/app/api/crm/renewals/sync/route.ts` |
| `pipelines` con `pipeline_type` | verificar | BD |
| `onboarding_templates` / `onboarding_instances` / `onboarding_steps` | ❌ | — |
| `fn_customer_health` | ❌ | — (se descarta `mv_customer_health`: una vista materializada no hereda RLS) |

---

## 2. Base de datos

### 2.1 Migraciones

```sql
-- Asegurar que pipelines tiene pipeline_type
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS pipeline_type text NOT NULL DEFAULT 'sales'
    CHECK (pipeline_type IN ('sales','onboarding','renewal','expansion'));

CREATE TABLE onboarding_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_duration_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_onb_templates_org ON onboarding_templates (organization_id, is_active);
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ot_select ON onboarding_templates FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ot_insert ON onboarding_templates FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ot_update ON onboarding_templates FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ot_delete ON onboarding_templates FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE onboarding_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  customer_id integer NOT NULL,
  parent_opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','at_risk','churned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onb_instances_org ON onboarding_instances (organization_id, status);
ALTER TABLE onboarding_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY oi_select ON onboarding_instances FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY oi_insert ON onboarding_instances FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY oi_update ON onboarding_instances FOR UPDATE USING (organization_id = current_org_id());

CREATE TABLE onboarding_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES onboarding_instances(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  name text NOT NULL,
  description text,
  due_date timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  is_completed boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onb_steps_instance ON onboarding_steps (organization_id, instance_id, step_number);
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_select ON onboarding_steps FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY os_insert ON onboarding_steps FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY os_update ON onboarding_steps FOR UPDATE USING (organization_id = current_org_id());
```

> `opportunities.deal_type` se añade en §2.2 (con el índice), no aquí, para no
> duplicar la migración.

### 2.2 `fn_customer_health` — función, NO vista materializada

**Por qué se descartó `mv_customer_health`.** El borrador anterior tenía tres defectos
graves, todos verificados:

| Defecto | Detalle |
|---|---|
| 🔴 **Fuga cross-tenant** | Una vista materializada de PostgreSQL **no hereda RLS**. `mv_customer_health` habría expuesto el health score de todas las organizaciones a cualquier usuario autenticado |
| 🔴 **Circularidad** | Calculaba `AVG(hs.score)` sobre `health_score_snapshots`, que son el resultado del propio cálculo. Un promedio de sí mismo: no aporta información nueva ni detecta deterioro real |
| 🔴 **Columna inexistente** | Usaba `hs.calculated_at`; la columna real es **`created_at`** (`health_score_snapshots`: `id, organization_id, customer_id, score, band, indicators, created_at`) |

Se sustituye por una **función** (misma decisión que en F14: datos frescos, sin cron,
y el filtro por organización viaja como parámetro, así que no hay fuga):

```sql
-- Health score desde HECHOS REALES: facturación, cobro, mora y actividad.
-- No lee health_score_snapshots (eso sería circular): los snapshots son la
-- BITÁCORA histórica del resultado, no la fuente del cálculo.
CREATE OR REPLACE FUNCTION fn_customer_health(
  p_org_id integer,
  p_customer_id uuid DEFAULT NULL   -- NULL = todos los clientes de la org
) RETURNS TABLE (
  customer_id         uuid,
  invoices_12m        bigint,
  revenue_12m         numeric,
  days_since_last_invoice integer,
  days_since_last_activity integer,
  overdue_balance     numeric,
  overdue_ratio       numeric,
  score               integer,
  band                text
) AS $$
  WITH base AS (
    SELECT c.id AS customer_id
      FROM customers c
     WHERE c.organization_id = p_org_id
       AND c.lifecycle_stage = 'customer'          -- la crea F1 (+ backfill)
       AND (p_customer_id IS NULL OR c.id = p_customer_id)
  ),
  fact AS (
    SELECT
      b.customer_id,
      COUNT(i.id) FILTER (
        WHERE i.issue_date >= now() - INTERVAL '12 months'
          AND i.status IN ('paid','partial','issued')
      ) AS invoices_12m,
      COALESCE(SUM(i.total) FILTER (
        WHERE i.issue_date >= now() - INTERVAL '12 months'
          AND i.status IN ('paid','partial')
      ), 0) AS revenue_12m,
      MAX(i.issue_date) AS last_invoice_at
    FROM base b
    LEFT JOIN invoice_sales i
           ON i.customer_id = b.customer_id
          AND i.organization_id = p_org_id
          AND i.status <> 'void'
    GROUP BY b.customer_id
  ),
  act AS (
    -- activities es polimórfica: related_type/related_id (related_id es uuid)
    SELECT b.customer_id, MAX(a.occurred_at) AS last_activity_at
      FROM base b
      LEFT JOIN activities a
             ON a.related_id = b.customer_id
            AND a.related_type = 'customer'
            AND a.organization_id = p_org_id
     GROUP BY b.customer_id
  ),
  ar AS (
    SELECT
      b.customer_id,
      COALESCE(SUM(r.balance) FILTER (WHERE r.status = 'overdue'), 0) AS overdue_balance,
      COALESCE(SUM(r.balance), 0) AS total_balance
    FROM base b
    LEFT JOIN accounts_receivable r
           ON r.customer_id = b.customer_id
          AND r.organization_id = p_org_id
     GROUP BY b.customer_id
  ),
  calc AS (
    SELECT
      f.customer_id,
      f.invoices_12m,
      f.revenue_12m,
      EXTRACT(DAY FROM now() - f.last_invoice_at)::integer  AS days_since_last_invoice,
      EXTRACT(DAY FROM now() - ac.last_activity_at)::integer AS days_since_last_activity,
      ar.overdue_balance,
      -- NULLIF evita división por cero cuando el cliente no tiene cartera
      ROUND(ar.overdue_balance / NULLIF(ar.total_balance, 0), 4) AS overdue_ratio,
      GREATEST(0, LEAST(100,
          40                                                            -- base
        + LEAST(25, f.invoices_12m * 5)                                  -- recurrencia (máx 25)
        - CASE WHEN f.last_invoice_at IS NULL THEN 25
               ELSE LEAST(25, GREATEST(0,
                 (EXTRACT(DAY FROM now() - f.last_invoice_at)::int - 60) / 6))
          END                                                           -- inactividad de compra
        - CASE WHEN ac.last_activity_at IS NULL THEN 10
               ELSE LEAST(10, GREATEST(0,
                 (EXTRACT(DAY FROM now() - ac.last_activity_at)::int - 30) / 9))
          END                                                           -- silencio comercial
        - LEAST(30, ROUND(COALESCE(
            ar.overdue_balance / NULLIF(ar.total_balance, 0), 0) * 30))  -- mora
        + 25                                                            -- margen para llegar a 100
      ))::integer AS score
    FROM fact f
    JOIN act ac ON ac.customer_id = f.customer_id
    JOIN ar     ON ar.customer_id = f.customer_id
  )
  SELECT
    customer_id, invoices_12m, revenue_12m,
    days_since_last_invoice, days_since_last_activity,
    overdue_balance, overdue_ratio, score,
    CASE WHEN score >= 70 THEN 'healthy'
         WHEN score >= 40 THEN 'at_risk'
         ELSE 'critical' END AS band
  FROM calc;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION fn_customer_health(integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_customer_health(integer, uuid) TO authenticated;
```

> Los pesos (40 base, 25 recurrencia, 30 mora…) son el **default**; la configuración
> real por organización vive en `health_score_configs.config` (jsonb, ya existe) y
> `healthScoreService.ts` la aplica. La función es el cálculo de referencia y el
> fallback cuando no hay config.

**Relación con `health_score_snapshots` (que sí se conserva):**

- `fn_customer_health` **calcula** el score ahora, desde hechos reales.
- `health_score_snapshots` **registra** el resultado en el tiempo (para ver tendencia
  y disparar alertas de deterioro). Se inserta desde un job según
  `health_score_configs.refresh_interval_hours`.
- La tendencia se lee de los snapshots; el valor actual, de la función. Sin circularidad.

```sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS deal_type text
    CHECK (deal_type IN ('new','renewal','expansion','referral','partner'));

-- Índice para los pipelines de renovación/expansión
CREATE INDEX IF NOT EXISTS idx_opportunities_org_deal_type
  ON opportunities (organization_id, deal_type, status)
  WHERE deal_type IS NOT NULL;
```

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/onboardingService.ts` | modificar | Crear instancia desde plantilla |
| `src/lib/services/crm/renewalService.ts` | modificar | Crear renovaciones a 120/90/60/30/15/7 |
| `src/lib/services/crm/expansionService.ts` | modificar | Pipeline de expansión |
| `src/lib/services/crm/healthScoreService.ts` | modificar | Health genérico configurable |

#### Onboarding — pasos por defecto (configurables)

```json
[
  { "name": "Kickoff", "delay_days": 0 },
  { "name": "Configuración", "delay_days": 3 },
  { "name": "Importación de datos", "delay_days": 7 },
  { "name": "Capacitación", "delay_days": 14 },
  { "name": "Uso asistido", "delay_days": 21 },
  { "name": "Revisión 14 días", "delay_days": 14 },
  { "name": "Business review 30 días", "delay_days": 30 }
]
```

#### Renovación — UNA oportunidad, hitos como tareas

**Corrección respecto al borrador.** La versión anterior hacía `insert` dentro de un
`for` sobre `[120, 90, 60, 30, 15, 7]`, creando **6 oportunidades de renovación para
el mismo contrato**. Eso infla el pipeline ×6, rompe el forecast, duplica el revenue
estimado en F14 y produce 6 renovaciones "ganadas" para un solo contrato.

Lo correcto: **una** oportunidad de renovación, y los 6 hitos como **tareas** con su
fecha de recordatorio. `next_contact_at` apunta siempre al próximo hito pendiente.

```typescript
const RENEWAL_MILESTONES = [120, 90, 60, 30, 15, 7]; // días antes de expiración

async function scheduleRenewal(
  supabase: SupabaseClient,
  orgId: number,               // organizations.id es integer
  parentOppId: string,
  billingCycleMonths: number
) {
  const { data: parentOpp, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, customer_id, amount, currency, closed_at, salesperson_id, customers(full_name)')
    .eq('id', parentOppId)
    .eq('organization_id', orgId)          // aislamiento explícito
    .single();
  if (oppErr || !parentOpp) throw new Error(`scheduleRenewal: oportunidad ${parentOppId} no encontrada`);

  // closed_at la añade F2 (con trigger + backfill). Si aún es null, no hay contrato cerrado.
  if (!parentOpp.closed_at) throw new Error('scheduleRenewal: la oportunidad no está cerrada');

  const expiryDate = addMonths(new Date(parentOpp.closed_at), billingCycleMonths);
  const renewalPipeline = await getOrCreateRenewalPipeline(supabase, orgId);

  // IDEMPOTENCIA: si ya existe la renovación de este contrato, no crear otra.
  const { data: existing } = await supabase
    .from('opportunities')
    .select('id')
    .eq('organization_id', orgId)
    .eq('parent_opportunity_id', parentOppId)
    .eq('deal_type', 'renewal')
    .maybeSingle();
  if (existing) return existing.id;

  const milestoneDates = RENEWAL_MILESTONES
    .map((d) => ({ days: d, date: subtractDays(expiryDate, d) }))
    .filter((m) => m.date > new Date());          // descartar hitos ya pasados

  // 1) UNA sola oportunidad de renovación
  const { data: renewal, error } = await supabase
    .from('opportunities')
    .insert({
      organization_id: orgId,
      pipeline_id: renewalPipeline.id,
      stage_id: renewalPipeline.firstStageId,
      name: `Renovación ${parentOpp.customers?.full_name ?? 'cliente'} — ${formatDate(expiryDate)}`,
      customer_id: parentOpp.customer_id,
      parent_opportunity_id: parentOppId,
      deal_type: 'renewal',
      amount: parentOpp.amount,
      currency: parentOpp.currency,
      salesperson_id: parentOpp.salesperson_id,
      expected_close_date: expiryDate,
      // próximo hito pendiente, no los 6
      next_contact_at: milestoneDates[0]?.date ?? null,
      billing_cycle_months: billingCycleMonths,
      status: 'open',
    })
    .select('id')
    .single();
  if (error) throw new Error(`scheduleRenewal: ${error.message}`);

  // 2) Los 6 hitos son TAREAS de la misma oportunidad
  if (milestoneDates.length > 0) {
    const { error: taskErr } = await supabase.from('tasks').insert(
      milestoneDates.map((m) => ({
        organization_id: orgId,
        title: `Contacto de renovación — ${m.days} días antes`,
        due_date: m.date.toISOString(),
        related_to_type: 'opportunity',
        related_to_id: renewal.id,
        customer_id: parentOpp.customer_id,
        assigned_to: parentOpp.salesperson_id,
        type: 'renewal_touch',
        status: 'pending',
      }))
    );
    if (taskErr) throw new Error(`scheduleRenewal (tareas): ${taskErr.message}`);
  }

  return renewal.id;
}
```

> Al completar cada tarea de hito, `renewalService` recalcula `next_contact_at` de la
> oportunidad con el siguiente hito pendiente. Así el vendedor ve un solo deal con la
> fecha de su próximo toque, y el pipeline refleja **un** contrato en renovación.

#### Health score — dimensiones genéricas configurables

```json
{
  "dimensions": {
    "recency": { "weight": 25, "source": "last_purchase_days", "formula": "max(0, 100 - days*2)" },
    "frequency": { "weight": 25, "source": "purchase_count_12m", "formula": "min(100, count*10)" },
    "ltv": { "weight": 25, "source": "total_revenue", "formula": "min(100, revenue/100000)" },
    "receivables": { "weight": 25, "source": "outstanding_amount", "formula": "max(0, 100 - amount/10000)" }
  },
  "thresholds": {
    "healthy": 75,
    "at_risk": 50,
    "critical": 25
  }
}
```

---

## 4. UI

### 4.1 Rutas

> **Nota R7 (2026-09-01):** se creó la página `/app/crm/salud` para el health score
> de clientes, accesible desde el sidebar con icono HeartPulse ("Salud Clientes").
> También se agregó "Salud Clientes" a `MODULES_WITH_SUBMENU` en `AppLayout.tsx` y
> a `modulePages.ts` en el módulo CRM.

> **Nota (2026-09): onboarding y renovaciones NO tienen página separada.** Se
> gestionan desde el Pipeline kanban existente en `/app/crm/pipeline` usando su
> selector de pipeline. `PipelineHeader.tsx` carga TODOS los pipelines de la
> organización (sin filtrar por `pipeline_type`) y muestra badges visuales en el
> dropdown: "Onboarding" (morado) para `pipeline_type='onboarding'` y "Renovación"
> (morado) para `pipeline_type='renewal'`. Al seleccionar uno, `PipelineStages`
> filtra las oportunidades por ese `pipeline_id`. No se crearon `OnboardingTab.tsx`
> ni `RenovacionesTab.tsx` — se reutiliza `PipelineView` existente.

> **Nota (2026-09): provisión automática + plantillas en "Crear Nuevo Pipeline".**
> Al activar el módulo CRM desde `/app/organizacion/modulos`, el endpoint
> `/api/modules` llama `createPipelineFromTemplate` para `onboarding` y `renewal`
> automáticamente, de forma idempotente. Así toda organización que active CRM
> tiene sus pipelines de Onboarding y Renovación disponibles sin pasos manuales.
> Además, el diálogo "Crear Nuevo Pipeline" en `PipelineHeader.tsx` ahora muestra
> un selector de plantillas preestablecidas (blank, Ventas, Onboarding, Renovación)
> además del campo de nombre libre. Ambos campos son independientes: la plantilla
> define las etapas, el nombre es el que el usuario escriba. Las plantillas se
> definen en `src/lib/services/crm/pipelineTemplates.ts` (constante TS + función
> `createPipelineFromTemplate` reutilizable server/client).

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/pipeline` | `src/app/app/crm/pipeline/page.tsx` | reutilizar | Kanban con selector de pipeline: Ventas (default), Onboarding, Renovación |
| `/app/crm/salud` | `src/app/app/crm/salud/page.tsx` | crear | Health score de clientes (lista + gauge + tendencia) |

### 4.2 Componentes

> **Nota (2026-09):** no se crean `OnboardingKanban.tsx` ni `OnboardingChecklist.tsx`.
> El onboarding se visualiza con el `KanbanBoard` existente dentro de `PipelineView`
> cuando se selecciona el pipeline "Onboarding" en el dropdown de `PipelineHeader`.

| Archivo | acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/pipeline/PipelineHeader.tsx` | modificar | — | Dropdown muestra todos los pipelines + badge de `pipeline_type` (Onboarding/Renovación). Diálogo "Crear Nuevo Pipeline" con selector de plantillas preestablecidas + nombre libre |
| `src/lib/services/crm/pipelineTemplates.ts` | crear | — | Constante `PIPELINE_TEMPLATES` (blank, sales, onboarding, renewal) + función `createPipelineFromTemplate` idempotente reutilizable server/client |
| `src/app/api/modules/route.ts` | modificar | — | Al activar módulo `crm`, provisiona pipelines de Onboarding y Renovación automáticamente |
| `src/components/crm/health/HealthGauge.tsx` | crear | `score` | Gauge visual |
| `src/components/crm/health/HealthTrend.tsx` | crear | `customerId` | Sparkline de tendencia |
| `src/components/crm/health/HealthAlerts.tsx` | crear | `customerId` | Alertas de salud |

### 4.3 Wireframes

```
┌─ Health Score ──────────────────────────────────────────────┐
│        ╭───────╮                                             │
│       ╱   85    ╲   🟢 Healthy                              │
│      │  ██████  │                                            │
│       ╲ ██████ ╱                                             │
│        ╰───────╯                                             │
│  Recency: 90  |  Frequency: 80  |  LTV: 95  |  Receivables: 75│
│  Tendencia: ↗ ↗ ↗ ↘ ↗ (últimos 6 meses)                    │
│  Alertas: ⚠️ Receivables aumentando 15% último mes          │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Multi-tenant y seguridad

- Health score de clientes del CRM es SEPARADO del health de tenants de la plataforma.
- Onboarding pipelines son por organización.
- Renovaciones heredan `organization_id` del padre.

---

## 6. Pruebas

- Crear onboarding desde plantilla → genera instancia + steps con due_dates.
- Completar step → marca `is_completed` + actualiza progreso.
- Schedule renewal → crea 6 oportunidades a 120/90/60/30/15/7 días.
- Health score se recalcula vía cron → snapshot persistido.
- Health de cliente del CRM ≠ health de tenant de plataforma.

---

## 7. Definition of Done

- [ ] `onboarding_templates`, `onboarding_instances`, `onboarding_steps` existen con RLS.
- [ ] `pipelines.pipeline_type` existe.
- [ ] `opportunities.deal_type` existe con `CHECK` y el índice `idx_opportunities_org_deal_type`.
- [ ] `fn_customer_health(p_org_id, p_customer_id)` existe y **NO** se creó `mv_customer_health` (una vista materializada no hereda RLS → fuga cross-tenant).
- [ ] `fn_customer_health` calcula desde `invoice_sales`, `accounts_receivable` y `activities`, **no** desde `health_score_snapshots` (eso sería circular).
- [ ] `fn_customer_health` devuelve `overdue_ratio` sin dividir por cero (`NULLIF`) cuando el cliente no tiene cartera.
- [ ] `health_score_snapshots` sigue usándose solo como bitácora de tendencia (columna real: `created_at`, **no** `calculated_at`).
- [ ] Onboarding crea instancia + steps desde plantilla.
- [ ] Renovación crea **UNA** oportunidad `deal_type='renewal'` por contrato, con los 6 hitos (120/90/60/30/15/7) como **tareas** y `next_contact_at` en el próximo hito pendiente.
- [ ] Llamar dos veces a `scheduleRenewal` para el mismo contrato **no** duplica la oportunidad (idempotencia por `parent_opportunity_id` + `deal_type`).
- [ ] `scheduleRenewal` falla con mensaje claro si `opportunities.closed_at` es `null` (dependencia de F2).
- [ ] Los hitos ya vencidos no se crean como tareas.
- [ ] Health score se calcula con dimensiones configurables.
- [ ] `HealthGauge` + `HealthTrend` + `HealthAlerts` funcionan.
- [ ] Onboarding y renovaciones se gestionan desde `/app/crm/pipeline` con el selector de pipeline (no hay página separada). `PipelineHeader` muestra badges de `pipeline_type`.
- [ ] Al activar el módulo CRM, se provisionan automáticamente los pipelines de Onboarding y Renovación (idempotente).
- [ ] El diálogo "Crear Nuevo Pipeline" muestra las plantillas preestablecidas (blank, Ventas, Onboarding, Renovación) + campo de nombre libre independiente.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/onboardingService.ts` | modificar | Instancia desde plantilla |
| `src/lib/services/crm/renewalService.ts` | modificar | Hitos 120/90/60/30/15/7 |
| `src/lib/services/crm/expansionService.ts` | modificar | Pipeline expansión |
| `src/lib/services/crm/healthScoreService.ts` | modificar | Health genérico configurable |
| `src/components/crm/pipeline/PipelineHeader.tsx` | modificar | Dropdown con todos los pipelines + badge `pipeline_type` (Onboarding/Renovación). Diálogo "Crear Nuevo Pipeline" con selector de plantillas + nombre libre |
| `src/lib/services/crm/pipelineTemplates.ts` | crear | Constante `PIPELINE_TEMPLATES` + función `createPipelineFromTemplate` idempotente |
| `src/app/api/modules/route.ts` | modificar | Provisión automática de pipelines onboarding/renewal al activar CRM |
| `src/components/crm/health/HealthGauge.tsx` | crear | Gauge |
| `src/components/crm/health/HealthTrend.tsx` | crear | Sparkline |
| `src/components/crm/health/HealthAlerts.tsx` | crear | Alertas |

> **Páginas eliminadas (no necesarias):** `OnboardingTab.tsx` y `RenovacionesTab.tsx`
> no se crean — el onboarding y las renovaciones se gestionan desde el PipelineView
> existente con su selector de pipeline.
