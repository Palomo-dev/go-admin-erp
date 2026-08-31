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
| `mv_customer_health` | ❌ | — |

---

## 2. Base de datos

### 2.1 Migraciones

```sql
-- Asegurar que pipelines tiene pipeline_type
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS pipeline_type text NOT NULL DEFAULT 'sales'
    CHECK (pipeline_type IN ('sales','onboarding','renewal','expansion'));

CREATE TABLE onboarding_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id bigint REFERENCES onboarding_templates(id) ON DELETE SET NULL,
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id bigint NOT NULL REFERENCES onboarding_instances(id) ON DELETE CASCADE,
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

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS deal_type text CHECK (deal_type IN ('new','renewal','expansion','referral'));
```

### 2.2 Vista materializada `mv_customer_health`

```sql
CREATE MATERIALIZED VIEW mv_customer_health AS
SELECT
  c.organization_id,
  c.id AS customer_id,
  MAX(hs.calculated_at) AS last_calculated,
  AVG(hs.score) AS avg_score,
  MAX(hs.score) AS latest_score
FROM customers c
LEFT JOIN health_score_snapshots hs ON hs.customer_id = c.id
WHERE c.lifecycle_stage = 'customer'
GROUP BY c.organization_id, c.id;

CREATE UNIQUE INDEX idx_mv_health ON mv_customer_health (organization_id, customer_id);
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

#### Renovación — hitos

```typescript
const RENEWAL_MILESTONES = [120, 90, 60, 30, 15, 7]; // días antes de expiración

async function scheduleRenewal(supabase, orgId, parentOppId, billingCycleMonths) {
  const expiryDate = addMonths(parentOpp.closedAt, billingCycleMonths);
  const renewalPipeline = await getOrCreateRenewalPipeline(supabase, orgId);

  for (const days of RENEWAL_MILESTONES) {
    const milestoneDate = subtractDays(expiryDate, days);
    // Crear oportunidad de renovación en la etapa correspondiente
    await supabase.from('opportunities').insert({
      organization_id: orgId,
      pipeline_id: renewalPipeline.id,
      name: `Renovación ${parentOpp.customerName} - ${days}d`,
      customer_id: parentOpp.customer_id,
      parent_opportunity_id: parentOppId,
      deal_type: 'renewal',
      expected_close_date: expiryDate,
      next_contact_at: milestoneDate,
      // ...
    });
  }
}
```

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

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/onboarding` | `src/app/app/crm/onboarding/page.tsx` | crear | Kanban de onboarding |

### 4.2 Componentes

| Archivo | acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/onboarding/OnboardingKanban.tsx` | crear | — | Kanban de instancias |
| `src/components/crm/onboarding/OnboardingChecklist.tsx` | crear | `instanceId` | Checklist de pasos |
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
- [ ] `opportunities.deal_type` existe.
- [ ] `mv_customer_health` existe.
- [ ] Onboarding crea instancia + steps desde plantilla.
- [ ] Renovación crea 6 oportunidades a 120/90/60/30/15/7 días.
- [ ] Health score se calcula con dimensiones configurables.
- [ ] `HealthGauge` + `HealthTrend` + `HealthAlerts` funcionan.
- [ ] `/app/crm/onboarding` muestra Kanban.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/onboardingService.ts` | modificar | Instancia desde plantilla |
| `src/lib/services/crm/renewalService.ts` | modificar | Hitos 120/90/60/30/15/7 |
| `src/lib/services/crm/expansionService.ts` | modificar | Pipeline expansión |
| `src/lib/services/crm/healthScoreService.ts` | modificar | Health genérico configurable |
| `src/app/app/crm/onboarding/page.tsx` | crear | Kanban onboarding |
| `src/components/crm/onboarding/OnboardingKanban.tsx` | crear | Kanban |
| `src/components/crm/onboarding/OnboardingChecklist.tsx` | crear | Checklist |
| `src/components/crm/health/HealthGauge.tsx` | crear | Gauge |
| `src/components/crm/health/HealthTrend.tsx` | crear | Sparkline |
| `src/components/crm/health/HealthAlerts.tsx` | crear | Alertas |
