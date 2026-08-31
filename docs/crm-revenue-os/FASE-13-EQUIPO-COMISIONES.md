# FASE 13 — Equipo, cuotas, comisiones y dashboard de vendedor

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipelines, oportunidades), F10 (cierre), F12 (partners)
> Bloquea: F14 (Revenue OS usa datos de comisiones)

---

## 0. Objetivo y alcance

**Qué resuelve:** gestión del equipo comercial: roles, territorios, cuotas mensuales/trimestrales/anuales, comisiones por deal (flat, escalonada, o por tier), y un dashboard personal para cada vendedor con sus oportunidades, actividades, cuota y comisiones.

**Puntos del método que cubre:** 25 (cuotas y comisiones), 26 (dashboard de vendedor).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `commissionService.ts` | ✅ existe | `src/lib/services/crm/commissionService.ts` |
| `commercialMetricsService.ts` | ✅ existe | `src/lib/services/crm/commercialMetricsService.ts` |
| `verticalsService.ts` | ✅ existe | `src/lib/services/crm/verticalsService.ts` |
| `sales_roles` / `sales_teams` / `territories` | ❌ (F1 los crea) | — |
| `sales_targets` / `commission_events` | ❌ | — |
| Dashboard de vendedor | 🟡 parcial (reportes) | `src/app/app/reportes/` |
| `/app/crm/equipo` | ❌ | — |

---

## 2. Base de datos

### 2.1 Migraciones

```sql
CREATE TABLE sales_targets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period text NOT NULL CHECK (period IN ('monthly','quarterly','yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_amount numeric(14,2) NOT NULL,
  target_currency text NOT NULL DEFAULT 'USD',
  target_type text NOT NULL DEFAULT 'revenue' CHECK (target_type IN ('revenue','deals','activities','calls')),
  achieved_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, period, period_start, target_type)
);

CREATE INDEX idx_targets_org_user ON sales_targets (organization_id, user_id, period_start DESC);
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY st_select ON sales_targets FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY st_insert ON sales_targets FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY st_update ON sales_targets FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY st_delete ON sales_targets FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE commission_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  partner_deal_id bigint REFERENCES partner_deals(id) ON DELETE SET NULL,
  commission_type text NOT NULL CHECK (commission_type IN ('deal_flat','deal_tiered','revenue_percent','milestone')),
  base_amount numeric(14,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected','clawed_back')),
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  clawed_back_at timestamptz,
  clawed_back_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_org_user ON commission_events (organization_id, user_id, created_at DESC);
CREATE INDEX idx_commissions_org_status ON commission_events (organization_id, status);
ALTER TABLE commission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_select ON commission_events FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ce_insert ON commission_events FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ce_update ON commission_events FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ce_delete ON commission_events FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE commission_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('flat','tiered','split')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  applies_to_role text,
  applies_to_vertical_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_commission_rules_org ON commission_rules (organization_id, is_active);
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_select ON commission_rules FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY cr_insert ON commission_rules FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY cr_update ON commission_rules FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY cr_delete ON commission_rules FOR DELETE USING (organization_id = current_org_id());
```

### 2.2 Schema de `commission_rules.config`

#### Flat

```json
{ "rate": 10.0 }
```

#### Tiered (escalonado por monto)

```json
{
  "tiers": [
    { "min": 0, "max": 1000000, "rate": 5.0 },
    { "min": 1000001, "max": 5000000, "rate": 8.0 },
    { "min": 5000001, "max": null, "rate": 12.0 }
  ]
}
```

#### Split (split commission entre AE y SDR)

```json
{
  "splits": [
    { "role": "AE", "rate": 8.0 },
    { "role": "SDR", "rate": 2.0 }
  ]
}
```

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/commissionService.ts` | modificar | Calcular + crear events |
| `src/lib/services/crm/salesTargetService.ts` | crear | CRUD cuotas + tracking |
| `src/lib/services/crm/sellerDashboardService.ts` | crear | Datos del dashboard |

#### `commissionService.ts` — cálculo al ganar

```typescript
export async function calculateCommissionOnWin(
  supabase: SupabaseClient,
  orgId: number,
  opportunityId: string
): Promise<CommissionEvent[]> {
  const opp = await getOpportunity(supabase, opportunityId);
  const rules = await getActiveCommissionRules(supabase, orgId, {
    role: opp.owner_role,
    verticalId: opp.vertical_id,
  });

  const events: CommissionEvent[] = [];
  for (const rule of rules) {
    const amount = calculateByRule(rule, opp.amount);
    const { data: event } = await supabase.from('commission_events').insert({
      organization_id: orgId,
      user_id: opp.owner_id,
      opportunity_id: opportunityId,
      commission_type: rule.rule_type === 'split' ? 'deal_flat' : `deal_${rule.rule_type}`,
      base_amount: opp.amount,
      commission_rate: rule.config.rate || getTierRate(rule, opp.amount),
      commission_amount: amount,
      currency: opp.currency,
      status: 'pending',
    }).select().single();
    events.push(event);

    // Si es split, crear event para cada role
    if (rule.rule_type === 'split') {
      for (const split of rule.config.splits) {
        const splitUser = await getUserByRole(supabase, orgId, opportunityId, split.role);
        if (splitUser) {
          await supabase.from('commission_events').insert({
            organization_id: orgId,
            user_id: splitUser,
            opportunity_id: opportunityId,
            commission_type: 'deal_flat',
            base_amount: opp.amount,
            commission_rate: split.rate,
            commission_amount: opp.amount * split.rate / 100,
            currency: opp.currency,
            status: 'pending',
          });
        }
      }
    }
  }
  return events;
}
```

#### `sellerDashboardService.ts`

```typescript
export async function getSellerDashboard(supabase, orgId, userId, period) {
  return {
    quota: await getQuotaProgress(supabase, orgId, userId, period),
    pipeline: await getPipelineSummary(supabase, orgId, userId),
    activities: await getActivityStats(supabase, orgId, userId, period),
    calls: await getCallStats(supabase, orgId, userId, period),
    commissions: await getCommissionSummary(supabase, orgId, userId, period),
    opportunities: await getMyOpportunities(supabase, orgId, userId),
    tasksToday: await getTasksToday(supabase, orgId, userId),
    leaderboard: await getLeaderboard(supabase, orgId, period),
  };
}
```

### 3.2 Endpoints

| Endpoint | Archivo | Acción | Método |
|---|---|---|---|
| `/api/crm/targets` | crear | crear | GET, POST |
| `/api/crm/targets/[id]` | crear | crear | PATCH, DELETE |
| `/api/crm/commissions` | crear | crear | GET |
| `/api/crm/commissions/[id]` | crear | crear | PATCH (approve/pay/reject) |
| `/api/crm/commissions/rules` | crear | crear | GET, POST |
| `/api/crm/seller-dashboard` | crear | crear | GET |

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/equipo` | `src/app/app/crm/equipo/page.tsx` | crear | Gestión de equipo + cuotas |
| `/app/crm/mi-dashboard` | `src/app/app/crm/mi-dashboard/page.tsx` | crear | Dashboard personal del vendedor |

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/equipo/TeamManagement.tsx` | crear | — | Lista de vendedores + roles |
| `src/components/crm/equipo/QuotaEditor.tsx` | crear | `userId` | Editor de cuotas |
| `src/components/crm/equipo/CommissionRulesEditor.tsx` | crear | — | Editor de reglas |
| `src/components/crm/equipo/CommissionList.tsx` | crear | — | Lista de comisiones |
| `src/components/crm/dashboard/SellerDashboard.tsx` | crear | — | Dashboard completo |
| `src/components/crm/dashboard/QuotaProgress.tsx` | crear | `quota` | Barra de progreso de cuota |
| `src/components/crm/dashboard/PipelineSummary.tsx` | crear | `pipeline` | Resumen del pipeline |
| `src/components/crm/dashboard/ActivityStats.tsx` | crear | `activities` | Stats de actividades |
| `src/components/crm/dashboard/Leaderboard.tsx` | crear | `leaderboard` | Ranking de vendedores |
| `src/components/crm/dashboard/MyOpportunities.tsx` | crear | `opportunities` | Mis oportunidades |
| `src/components/crm/dashboard/TasksToday.tsx` | crear | `tasks` | Tareas de hoy |

### 4.3 Wireframes

```
┌─ Mi Dashboard ──────────────────────────────────────────────┐
│  Hola Juan, aquí está tu resumen de agosto 2026             │
│                                                                │
│  ┌─ Cuota ──────────────────────────────────┐               │
│  │ $4.2M / $5.0M  ████████████░░░  84%      │               │
│  │ Faltan $800k | 7 días restantes          │               │
│  └──────────────────────────────────────────┘               │
│                                                                │
│  ┌─ Pipeline ──────┐  ┌─ Actividades ─────┐                  │
│  │ 23 activas      │  │ Llamadas: 45      │                  │
│  │ $12.5M total    │  │ Emails: 89        │                  │
│  │ 8 en cierre     │  │ Demos: 12         │                  │
│  └─────────────────┘  └───────────────────┘                  │
│                                                                │
│  ┌─ Comisiones ────┐  ┌─ Ranking ─────────┐                  │
│  │ Pendientes: $420│  │ 1. María  $5.1M   │                  │
│  │ Aprobadas: $180 │  │ 2. Juan   $4.2M ← │                  │
│  │ Pagadas: $1.2M  │  │ 3. Pedro  $3.8M   │                  │
│  └─────────────────┘  └───────────────────┘                  │
│                                                                │
│  ── Mis oportunidades ──                                     │
│  Rest. Corral    Propuesta enviada  $500k  [Abrir]           │
│  Hotel Bogotá    Demo realizada     $1.2M  [Abrir]           │
│                                                                │
│  ── Tareas de hoy ──                                         │
│  ☐ Llamar a Rest. Corral (callback)                          │
│  ☐ Enviar propuesta a Hotel Bogotá                           │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Animaciones Motion

```tsx
// Cuota con barra animada
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${progress}%` }}
  transition={{ type: 'spring', stiffness: 100, damping: 20 }}
  className="h-4 bg-primary rounded-full"
/>

// Ranking con stagger
<motion.div initial="hidden" animate="visible" variants={{
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.1 } },
}}>
  {leaderboard.map((seller, i) => (
    <motion.div key={seller.id} variants={{
      hidden: { opacity: 0, x: -20 },
      visible: { opacity: 1, x: 0 },
    }}>
      <LeaderboardRow seller={seller} rank={i + 1} isMe={seller.id === userId} />
    </motion.div>
  ))}
</motion.div>
```

---

## 5. Multi-tenant y seguridad

- Cuotas y comisiones por organización.
- Un vendedor solo ve sus comisiones; managers ven las del equipo.
- `sales_targets` con RLS — el usuario puede ver sus propias cuotas.
- Aprobación de comisiones requiere rol de manager/admin.

---

## 6. Pruebas

- Crear cuota mensual → `achieved_amount` se actualiza al ganar oportunidades.
- Ganar oportunidad con regla flat 10% → crea `commission_event` con 10% del monto.
- Ganar oportunidad con regla tiered → usa el tier correcto según monto.
- Ganar oportunidad con regla split → crea events para AE y SDR.
- Aprobar comisión → `status='approved'`.
- Clawback → `status='clawed_back'` + reason.
- Dashboard muestra datos correctos del período.
- Vendedor de otra org → 403.

---

## 7. Definition of Done

- [ ] `sales_targets`, `commission_events`, `commission_rules` existen con RLS.
- [ ] `commissionService` calcula comisiones al ganar (flat, tiered, split).
- [ ] `salesTargetService` gestiona cuotas + tracking.
- [ ] `sellerDashboardService` agrega datos del dashboard.
- [ ] `/app/crm/equipo` con gestión de equipo + cuotas + reglas.
- [ ] `/app/crm/mi-dashboard` con cuota, pipeline, actividades, comisiones, ranking, tareas.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/commissionService.ts` | modificar | Cálculo al ganar |
| `src/lib/services/crm/salesTargetService.ts` | crear | Cuotas + tracking |
| `src/lib/services/crm/sellerDashboardService.ts` | crear | Dashboard data |
| `src/app/api/crm/targets/route.ts` + `[id]` | crear | CRUD cuotas |
| `src/app/api/crm/commissions/route.ts` + `[id]` + `rules` | crear | CRUD comisiones |
| `src/app/api/crm/seller-dashboard/route.ts` | crear | Dashboard API |
| `src/app/app/crm/equipo/page.tsx` | crear | UI equipo |
| `src/app/app/crm/mi-dashboard/page.tsx` | crear | UI dashboard |
| `src/components/crm/equipo/TeamManagement.tsx` | crear | Gestión equipo |
| `src/components/crm/equipo/QuotaEditor.tsx` | crear | Editor cuotas |
| `src/components/crm/equipo/CommissionRulesEditor.tsx` | crear | Editor reglas |
| `src/components/crm/equipo/CommissionList.tsx` | crear | Lista comisiones |
| `src/components/crm/dashboard/SellerDashboard.tsx` | crear | Dashboard |
| `src/components/crm/dashboard/QuotaProgress.tsx` | crear | Progreso cuota |
| `src/components/crm/dashboard/PipelineSummary.tsx` | crear | Resumen pipeline |
| `src/components/crm/dashboard/ActivityStats.tsx` | crear | Stats actividades |
| `src/components/crm/dashboard/Leaderboard.tsx` | crear | Ranking |
| `src/components/crm/dashboard/MyOpportunities.tsx` | crear | Mis opps |
| `src/components/crm/dashboard/TasksToday.tsx` | crear | Tareas hoy |
