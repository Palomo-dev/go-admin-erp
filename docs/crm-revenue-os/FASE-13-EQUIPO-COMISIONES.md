# FASE 13 — Equipo, cuotas, comisiones y dashboard de vendedor

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipelines, oportunidades), F10 (cierre), F12 (partners)
> Bloquea: F14 (Revenue OS usa datos de comisiones)

> **NOTA:** Este documento es **especificación de implementación futura**, no código ya escrito. Las fases del CRM Revenue OS son plan + especificación. El estado "✅ existe" se refiere a infraestructura que ya está en la BD/código hoy; el estado "❌" o "crear"/"mejorar" es trabajo pendiente de esta fase. La especificación debe ser precisa y reflejar exactamente el esquema real de la BD (verificado vía MCP de Supabase el 2026-08-28).

---

## 0. Objetivo y alcance

**Qué resuelve:** gestión del equipo comercial: roles, territorios, cuotas mensuales/trimestrales/anuales, comisiones por deal (flat, escalonada, o por tier), y un dashboard personal para cada vendedor con sus oportunidades, actividades, cuota y comisiones.

**Puntos del método que cubre:** 25 (cuotas y comisiones), 26 (dashboard de vendedor).

### 0.1 Cero tablas dobles — reusa `commissions` y `vendor_commission_rates` existentes

**No se crean `commission_events` ni `commission_rules`.** Esas serían tablas dobles que duplicarían la lógica de `commissions` y `vendor_commission_rates` que ya existen y tienen datos reales (103 comisiones en `commissions` con `source_type='invoice_sale'`).

#### Tres dominios de comisiones (NO duplican lógica)

| Tabla | Repositorio | Propósito | Registros | FKs | RLS |
|---|---|---|---|---|---|
| `commissions` | `go-admin-erp` | Comisiones de vendedores de organizaciones (miembros) sobre facturas/ventas/oportunidades | 103 reales | ✅ organization_id, branch_id, payee_id→auth.users, created_by→auth.users | ✅ org_member_all |
| `vendor_commission_rates` | `go-admin-erp` | Configuración de tasas de comisión por vendedor/org | 0 (configurable) | ✅ organization_id, salesperson_id→auth.users | ✅ org_member_all |
| `seller_commissions` | `go-admin-sellers` | Comisiones de referidores del SaaS GoAdmin por suscripciones | 0 | ✅ seller_id→sellers, organization_id→organizations | (portal separado) |

**`commissions` y `seller_commissions` son dominios distintos** — no se juntan:
- `commissions`: vendedor de una organización (miembro) → comisión por factura/oportunidad/venta
- `seller_commissions`: referidor del SaaS GoAdmin → comisión por suscripción referida (vive en `go-admin-sellers`)

**`commissions` y `vendor_commission_rates` son complementarias** — no se duplican:
- `vendor_commission_rates`: define **qué tasa** aplicar (configuración, con vigencia `valid_from`/`valid_to`)
- `commissions`: registra **la comisión calculada** con esa tasa (hecho contable, con `status` accrued/paid)

#### Tabla de hechos + tabla de configuración

| Concepto | Tabla existente | Columnas que se usan |
|---|---|---|
| Devengo de comisión | `commissions` | `source_type`, `source_id`, `commission_type`, `payee_type`, `payee_id` (auth.users.id = miembro), `base_amount`, `commission_rate`, `commission_amount`, `status` (accrued/paid), `accrued_at`, `paid_at`, `metadata` |
| Tasa por vendedor | `vendor_commission_rates` | `salesperson_id` (auth.users.id), `rate`, `valid_from`, `valid_to` (**`metadata` jsonb se añade en esta fase — NO existe hoy**) |
| Tasa general de la org | `vendor_commission_rates` | fila con `salesperson_id IS NULL` |
| Override en la oportunidad | `opportunities` | `commission_rate`, `commission_type` |
| Override en la factura | `invoice_sales` | `commission_rate`, `commission_amount`, `commission_type`, `commission_method` |
| Asiento contable al devengar/pagar | `journal_entries` + `journal_lines` | Motor existente con `accounting_rules` `source_type='commission'`, `event_type='accrued'/'paid'` (81+81 reglas) |

**Vendedores de la organización = miembros (`organization_members.user_id` → `auth.users.id`).**
La tabla `sellers` es del SaaS GoAdmin (referidos del software, vive en repositorio separado `go-admin-sellers` con su propia app: dashboard, commissions, payouts, referrals, marketing), no de las organizaciones cliente. `salesperson_id` y `payee_id` apuntan a `auth.users.id` (miembros de la org), no a `sellers`.

El patrón canónico para el selector de vendedor es el mismo de `NuevaFacturaForm.tsx` (`src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx:237`): cargar `organization_members` JOIN `profiles` y usar `user_id` como `salesperson_id`.

#### Helper reutilizable para resolver tasa

El hook `useCommissionRate` (`src/lib/hooks/useCommissionRate.ts`) resuelve la tasa desde `vendor_commission_rates` y es usado por:
- `NuevaFacturaForm.tsx` (facturas de venta)
- `CheckoutDialog.tsx` (POS checkout)
- `pedidosService.ts` (mesas)
- `FacturasCompraService.ts` (facturas de compra)
- `commissionService.ts` (CRM)

Cadena de resolución: tasa del vendedor → tasa general de la org → 0.

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `commissionService.ts` | ✅ existe | `src/lib/services/crm/commissionService.ts` |
| `commercialMetricsService.ts` | ✅ existe | `src/lib/services/crm/commercialMetricsService.ts` |
| `verticalsService.ts` | ✅ existe | `src/lib/services/crm/verticalsService.ts` |
| `commissions` (tabla) | ✅ ya existe con 100+ registros reales | BD |
| `vendor_commission_rates` (tabla) | ✅ ya existe | BD |
| `opportunities.commission_rate` / `commission_type` | ✅ ya existe | BD |
| `invoice_sales.commission_rate` / `commission_amount` / `commission_type` | ✅ ya existe | BD |
| `accounting_rules` para `commission/accrued` + `commission/paid` | ✅ ya existe (81+81 reglas) | BD |
| `organization_members` (vendedores = miembros) | ✅ ya existe | BD |
| `sellers` (vendedores del SaaS GoAdmin, NO de organizaciones) | ✅ ya existe — no se usa para comisiones de org | BD |
| `sales_roles` / `sales_teams` / `territories` | ❌ (F1 los crea) | — |
| `sales_targets` (cuotas) | ❌ — única tabla nueva de esta fase | — |
| `commission_events` / `commission_rules` | ❌ NO se crean — duplicarían `commissions` y `vendor_commission_rates` | — |
| Dashboard de vendedor | parcial (reportes) | `src/app/app/reportes/` |
| `/app/finanzas/comisiones` | ✅ ya existe — se mejora con aprobación/pago/rechazo + bulk actions | UI |
| `/app/organizacion/miembros` | ✅ ya existe — se añade tab "Cuotas" en detalle del miembro | UI |
| `/app/inicio` | ✅ ya existe — se añaden widgets de cuotas y comisiones | UI |

---

## 2. Base de datos

### 2.1 Migración — solo `sales_targets` (cuotas)

**No se crean `commission_events` ni `commission_rules`.** Las comisiones usan `commissions` (ya existe con 100+ registros) y las tasas usan `vendor_commission_rates` (ya existe). Crear tablas dobles duplicaría la lógica y los datos.

```sql
CREATE TABLE sales_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
```

### 2.2 Modelo de comisiones (sobre tablas existentes — sin migración)

#### Cadena de resolución de tasa (ya implementada en `commissionService.ts`)

```
1. Override en opportunity (opportunities.commission_rate > 0)
   → usa ese porcentaje
2. Tasa del vendedor (vendor_commission_rates con salesperson_id NOT NULL)
   → usa la tasa del miembro de la org
3. Tasa general (vendor_commission_rates con salesperson_id IS NULL)
   → fallback de la organización
```

#### Esquema de comisiones escalonadas y split (sin tabla nueva)

Los esquemas `tiered` y `split` se configuran en `vendor_commission_rates.metadata` (jsonb, ya existe la columna) o en `opportunities.metadata`:

```json
// vendor_commission_rates.metadata para tiered:
{
  "type": "tiered",
  "tiers": [
    { "min": 0, "max": 1000000, "rate": 5.0 },
    { "min": 1000001, "max": 5000000, "rate": 8.0 },
    { "min": 5000001, "max": null, "rate": 12.0 }
  ]
}

// vendor_commission_rates.metadata para split:
{
  "type": "split",
  "splits": [
    { "role": "AE", "rate": 8.0 },
    { "role": "SDR", "rate": 2.0 }
  ]
}
```

#### Ciclo de vida de una comisión (estados en `commissions.status`)

```
accrued  →  paid       (flujo normal: devengar al ganar, pagar al cobrar)
accrued  →  rejected   (si se pierde la oportunidad después de devengar)
paid     →  clawed_back (clawback si se reembolsa al cliente)
```

El motor contable existente ya genera asientos para cada transición:
- `commission/accrued` → 81 reglas en `accounting_rules`
- `commission/paid` → 81 reglas en `accounting_rules`

---

## 3. Backend

### 3.1 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/commissionService.ts` | modificar | Extender `accrueCommission` para soportar tiered/split via `metadata`; añadir `payCommission`, `rejectCommission`, `clawbackCommission` |
| `src/lib/services/crm/salesTargetService.ts` | crear | CRUD cuotas + tracking |
| `src/lib/services/crm/sellerDashboardService.ts` | crear | Datos del dashboard |

#### `commissionService.ts` — cálculo al ganar (sobre `commissions` existente)

```typescript
// Ya existe accrueCommission() que inserta en commissions con:
//   source_type='opportunity', commission_type='salesperson',
//   payee_type='employee', payee_id=users.id, status='accrued'
// Se extiende para soportar tiered y split:

export async function calculateCommissionOnWin(
  supabase: SupabaseClient,
  orgId: number,
  opportunityId: string
): Promise<Commission[]> {
  const opp = await getOpportunity(supabase, opportunityId);
  const rateConfig = await getRateConfig(supabase, orgId, opp.salesperson_id);

  // Si es split, crear un registro en commissions por cada role
  if (rateConfig.metadata?.type === 'split') {
    const commissions: Commission[] = [];
    for (const split of rateConfig.metadata.splits) {
      const splitUser = await getUserByRole(supabase, orgId, opportunityId, split.role);
      if (splitUser) {
        const { data } = await supabase.from('commissions').insert({
          organization_id: orgId,
          commission_type: 'salesperson',
          source_type: 'opportunity',
          source_id: opportunityId,
          payee_type: 'employee',
          payee_id: splitUser,  // users.id (miembro de la org)
          base_amount: opp.amount,
          commission_rate: split.rate,
          commission_amount: opp.amount * split.rate / 100,
          currency: opp.currency,
          status: 'accrued',
          accrued_at: new Date().toISOString(),
          metadata: { opportunity_id: opportunityId, role: split.role },
        }).select().single();
        commissions.push(data);
      }
    }
    return commissions;
  }

  // Si es tiered, resolver el tier por monto
  let rate = rateConfig.rate;
  if (rateConfig.metadata?.type === 'tiered') {
    rate = resolveTierRate(rateConfig.metadata.tiers, opp.amount);
  }

  // Insert único en commissions (mismo flujo que accrueCommission existente)
  const { data } = await supabase.from('commissions').insert({
    organization_id: orgId,
    commission_type: 'salesperson',
    source_type: 'opportunity',
    source_id: opportunityId,
    payee_type: 'employee',
    payee_id: opp.salesperson_id,  // users.id (miembro de la org)
    base_amount: opp.amount,
    commission_rate: rate,
    commission_amount: opp.amount * rate / 100,
    currency: opp.currency,
    status: 'accrued',
    accrued_at: new Date().toISOString(),
    metadata: { opportunity_id: opportunityId },
  }).select().single();

  return [data];
}

// Pagar comisión (al cobrar la factura)
export async function payCommission(supabase, orgId, opportunityId: string) {
  await supabase.from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('source_type', 'opportunity')
    .eq('source_id', opportunityId)
    .eq('status', 'accrued');
  // El motor contable existente dispara commission/paid (81 reglas)
}

// Clawback (si se reembolsa)
export async function clawbackCommission(supabase, orgId, opportunityId: string, reason: string) {
  await supabase.from('commissions')
    .update({ status: 'clawed_back', metadata: supabase.rpc('merge_json', { reason }) })
    .eq('organization_id', orgId)
    .eq('source_id', opportunityId);
}

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
| `/api/crm/commissions` | crear | GET | Lista comisiones de `commissions` existente (filtros: vendedor, estado, período) |
| `/api/crm/commissions/[id]` | crear | PATCH | Aprobar/pagar/rechazar/clawback (cambia `status` en `commissions`) |
| `/api/crm/commissions/rates` | crear | GET, POST | CRUD de `vendor_commission_rates` existente (tasas por vendedor y general) |
| `/api/crm/seller-dashboard` | crear | crear | GET |

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/finanzas/comisiones` | `src/app/app/finanzas/comisiones/page.tsx` | **mejorar** | Aprobación/pago/rechazo de comisiones + bulk actions + filtros por vendedor/estado/período + resumen devengado/pagado/pendiente |
| `/app/organizacion/miembros` | `src/app/app/organizacion/miembros/page.tsx` | **mejorar** | Tab "Cuotas" en detalle del miembro: editor de `sales_targets` + barra de progreso |
| `/app/inicio` | `src/app/app/inicio/page.tsx` | **mejorar** | Widgets: progreso de cuota del equipo, comisiones devengadas vs pagadas del mes |

**No se crean páginas nuevas.** Toda la UI de comisiones y cuotas se integra en páginas existentes:
- ~~`/app/crm/equipo`~~ → comisiones en `/app/finanzas/comisiones`, cuotas en `/app/organizacion/miembros`
- ~~`/app/crm/mi-dashboard`~~ → widgets en `/app/inicio`

### 4.2 Componentes

> **Los componentes viven donde se usan, no en `crm/equipo/`.** No existe ni se crea
> la página `/app/crm/equipo`: las comisiones se gestionan en
> `/app/finanzas/comisiones`, las cuotas en `/app/organizacion/miembros` y los
> widgets del vendedor en `/app/inicio`. Por eso los componentes se ubican en las
> carpetas de esos módulos, reutilizando las que ya existen.

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/finanzas/comisiones/ComisionesList.tsx` | **mejorar** (ya existe) | — | Añadir selección múltiple, filtros por miembro/estado/periodo/`source_type` y links a factura/oportunidad de origen |
| `src/components/finanzas/comisiones/ComisionesToolbar.tsx` | crear | `selectedIds` | Bulk actions: aprobar · pagar · rechazar · clawback |
| `src/components/finanzas/comisiones/ComisionesSummary.tsx` | crear | `filters` | Tarjetas devengado / pagado / pendiente |
| `src/components/finanzas/comisiones/ClawbackDialog.tsx` | crear | `commissionId` | Confirmar clawback + motivo (se guarda en `commissions.notes` + `metadata`) |
| `src/components/configuracion/panels/crm/CommissionRatesPanel.tsx` | crear | — | Editor de **tasas** sobre `vendor_commission_rates` (tasa general + por miembro + tiered/split en `metadata`). **No** se llama `CommissionRulesEditor` porque no existe ni existirá la tabla `commission_rules` |
| `src/components/organizacion/miembros/QuotaEditor.tsx` | crear | `userId`, `period` | Editor de cuota del miembro sobre `sales_targets` |
| `src/components/organizacion/miembros/QuotaHistory.tsx` | crear | `userId` | Histórico de cumplimiento de cuota |
| `src/components/inicio/widgets/QuotaProgressWidget.tsx` | crear | — | Progreso de cuota del usuario actual |
| `src/components/inicio/widgets/CommissionsWidget.tsx` | crear | — | Comisiones devengadas vs pagadas |
| `src/components/inicio/widgets/SellerLeaderboardWidget.tsx` | crear | — | Ranking de vendedores (solo Admin/Manager) |
| `src/components/inicio/widgets/MyPipelineWidget.tsx` | crear | — | Mis oportunidades + tareas de hoy |

> `TeamManagement`, `SellerDashboard`, `PipelineSummary`, `ActivityStats`,
> `MyOpportunities` y `TasksToday` **se eliminan del alcance**: la gestión de miembros
> ya existe en `/app/organizacion/miembros` y HRM, y el resto se cubre con los widgets
> de `/app/inicio` listados arriba. Crearlos habría duplicado UI existente.

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
- Ganar oportunidad con tasa flat 10% → crea registro en `commissions` con `status='accrued'`, `commission_amount`=10% del monto, `payee_id`=users.id.
- Ganar oportunidad con tasa tiered → resuelve el tier correcto según monto desde `vendor_commission_rates.metadata`.
- Ganar oportunidad con tasa split → crea un registro en `commissions` por cada role (AE + SDR).
- Pagar comisión → `status='paid'`, `paid_at` set, motor contable dispara `commission/paid`.
- Clawback → `status='clawed_back'` + reason en metadata.
- Dashboard muestra datos correctos del período.
- Vendedor de otra org → 403.
- Cero referencias a `sellers` para comisiones de organización (es del SaaS, no de las orgs).

---

## 7. Definition of Done

- [ ] `sales_targets` existe con RLS (única tabla nueva).
- [ ] `commission_events` y `commission_rules` NO se crean — se reusa `commissions` y `vendor_commission_rates`.
- [ ] `commissionService` calcula comisiones al ganar (flat, tiered, split) insertando en `commissions` existente.
- [ ] `payCommission` cambia `status` a `paid` en `commissions` y el motor contable genera el asiento.
- [ ] `clawbackCommission` cambia `status` a `clawed_back`.
- [ ] `payee_id` apunta a `users.id` (miembros de la org), no a `sellers`.
- [ ] `salesTargetService` gestiona cuotas + tracking.
- [ ] `sellerDashboardService` agrega datos del dashboard.
- [ ] `/app/finanzas/comisiones` mejorada con botones aprobar/pagar/rechazar + bulk actions + filtros + resumen.
- [ ] `/app/organizacion/miembros` con tab "Cuotas" en detalle del miembro.
- [ ] `/app/inicio` con widgets de cuotas y comisiones del equipo.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.

---

## 8. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/commissionService.ts` | modificar | Extender accrueCommission (tiered/split), añadir payCommission, clawbackCommission — todo sobre `commissions` existente |
| `src/lib/services/crm/salesTargetService.ts` | crear | Cuotas + tracking |
| `src/lib/services/crm/sellerDashboardService.ts` | crear | Dashboard data |
| `src/app/api/crm/targets/route.ts` + `[id]` | crear | CRUD cuotas |
| `src/app/api/crm/commissions/route.ts` + `[id]` + `rates` | crear | CRUD comisiones sobre `commissions` existente + tasas sobre `vendor_commission_rates` |
| `src/app/api/crm/seller-dashboard/route.ts` | crear | Dashboard API (alimenta widgets en /app/inicio) |
| `src/app/app/finanzas/comisiones/page.tsx` | **mejorar** | Aprobación/pago/rechazo + bulk actions + filtros + resumen |
| `src/app/app/organizacion/miembros/page.tsx` | **mejorar** | Tab "Cuotas" en detalle del miembro |
| `src/app/app/inicio/page.tsx` | **mejorar** | Widgets de cuotas y comisiones |
| `src/components/finanzas/comisiones/ComisionesList.tsx` | **mejorar** | Selección múltiple, filtros, links a origen |
| `src/components/finanzas/comisiones/ComisionesToolbar.tsx` | crear | Bulk actions aprobar/pagar/rechazar/clawback |
| `src/components/finanzas/comisiones/ComisionesSummary.tsx` | crear | Devengado / pagado / pendiente |
| `src/components/finanzas/comisiones/ClawbackDialog.tsx` | crear | Clawback + motivo |
| `src/components/configuracion/panels/crm/CommissionRatesPanel.tsx` | crear | Tasas sobre `vendor_commission_rates` |
| `src/components/organizacion/miembros/QuotaEditor.tsx` | crear | Editor de cuota del miembro |
| `src/components/organizacion/miembros/QuotaHistory.tsx` | crear | Histórico de cumplimiento |
| `src/components/inicio/widgets/QuotaProgressWidget.tsx` | crear | Progreso de cuota |
| `src/components/inicio/widgets/CommissionsWidget.tsx` | crear | Comisiones devengadas vs pagadas |
| `src/components/inicio/widgets/SellerLeaderboardWidget.tsx` | crear | Ranking (Admin/Manager) |
| `src/components/inicio/widgets/MyPipelineWidget.tsx` | crear | Mis oportunidades + tareas |

> **Fuera de alcance (habrían duplicado UI existente):** `crm/equipo/TeamManagement`,
> `crm/dashboard/SellerDashboard`, `PipelineSummary`, `ActivityStats`,
> `MyOpportunities`, `TasksToday` y cualquier `CommissionRulesEditor`.
