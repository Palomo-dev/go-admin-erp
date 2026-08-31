# FASE 01 — Estructura comercial: ICP, verticales, roles y playbooks

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0 (registry, tipos canónicos, `getServerOrgContext`)
> Bloquea: F2 (pipeline usa ICP y scoring de F1)

---

## 0. Objetivo y alcance

**Qué resuelve:** define la estructura comercial de la organización (7 áreas), el ICP A/B/C con criterios evaluables, los verticales con posicionamiento y contenido comercial, y el framework de scoring GOC. Todo configurable por organización — cero hardcode. Una org puede ser un restaurante, otra una constructora: el CRM se adapta.

**Puntos del método que cubre:** 1 (estructura 7 áreas), 2 (posicionamiento por resultado), 3 (ICP A/B/C), 4 (verticales comerciales), 6 (GOC score 0–100).

**Qué NO entra:** el pipeline de 10 etapas y los gates (F2), el uso operativo del scoring en el Kanban (F2), las secuencias multicanal (F8), las demos y propuestas (F10).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `verticals` tabla | ✅ existe, sin `slug`/`color`/`sort_order`/`positioning` (F0 los añade) | BD |
| `verticalsService.ts` | ✅ existe | `src/lib/services/crm/verticalsService.ts` |
| `scoring_configs` tabla | ✅ existe con `config` jsonb | BD |
| `scoringService.ts` | ✅ existe, calcula score | `src/lib/services/crm/scoringService.ts` |
| `ScoringSection.tsx` | ✅ existe, UI de scoring | `src/components/crm/oportunidades/ScoringSection.tsx` |
| `templates` tabla con `kind` | ✅ existe | BD |
| Configuración centralizada | ✅ `configModulesRegistry` + `CRMConfigPanel` | `src/components/configuracion/**` |
| `pipelineSeedService.ts` | ✅ existe, seeds de pipeline | `src/lib/services/crm/pipelineSeedService.ts` |
| `sales_roles` / `icp_profiles` / `icp_criteria` | ❌ no existen | — |
| `sales_teams` / `sales_team_members` / `territories` | ❌ no existen | — |
| Motor de evaluación ICP | ❌ no existe | — |
| Motor de asignación automática | ❌ no existe | — |

---

## 2. Base de datos

### 2.1 Migraciones

Aplicar vía `apply_migration` del MCP (project `jgmgphmzusbluqhuqihj`).

#### Migración 1 — `sales_roles` y `sales_teams`

```sql
CREATE TABLE sales_roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  area text NOT NULL CHECK (area IN (
    'marketing','sdr','ae','presales','onboarding','customer_success','partners'
  )),
  responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_sales_roles_org ON sales_roles (organization_id, sort_order);
ALTER TABLE sales_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_roles_select ON sales_roles FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY sales_roles_insert ON sales_roles FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY sales_roles_update ON sales_roles FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY sales_roles_delete ON sales_roles FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE sales_teams (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_sales_teams_org ON sales_teams (organization_id);
ALTER TABLE sales_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_teams_select ON sales_teams FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY sales_teams_insert ON sales_teams FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY sales_teams_update ON sales_teams FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY sales_teams_delete ON sales_teams FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE sales_team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_team_id integer NOT NULL REFERENCES sales_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_role_id integer REFERENCES sales_roles(id) ON DELETE SET NULL,
  quota_amount numeric(14,2),
  quota_currency text NOT NULL DEFAULT 'COP',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sales_team_id, user_id)
);

CREATE INDEX idx_sales_team_members_org ON sales_team_members (organization_id, sales_team_id);
ALTER TABLE sales_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY stm_select ON sales_team_members FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY stm_insert ON sales_team_members FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY stm_update ON sales_team_members FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY stm_delete ON sales_team_members FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE territories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_territories_org ON territories (organization_id);
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY territories_select ON territories FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY territories_insert ON territories FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY territories_update ON territories FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY territories_delete ON territories FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — `icp_profiles` y `icp_criteria`

```sql
CREATE TABLE icp_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  band text NOT NULL,
  description text,
  priority integer NOT NULL DEFAULT 100,
  color text NOT NULL DEFAULT '#6366f1',
  sla_first_contact_hours integer NOT NULL DEFAULT 24,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, band)
);

CREATE INDEX idx_icp_profiles_org ON icp_profiles (organization_id, priority);
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY icp_profiles_select ON icp_profiles FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY icp_profiles_insert ON icp_profiles FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY icp_profiles_update ON icp_profiles FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY icp_profiles_delete ON icp_profiles FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE icp_criteria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  icp_profile_id integer NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('eq','neq','gt','gte','lt','lte','in','not_in','contains','starts_with')),
  value jsonb NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_icp_criteria_org ON icp_criteria (organization_id, icp_profile_id);
ALTER TABLE icp_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY icp_criteria_select ON icp_criteria FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY icp_criteria_insert ON icp_criteria FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY icp_criteria_update ON icp_criteria FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY icp_criteria_delete ON icp_criteria FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 3 — Columnas en `opportunities` y `customers`

```sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS icp_band text,
  ADD COLUMN IF NOT EXISTS icp_fit_score integer;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS branches_count integer,
  ADD COLUMN IF NOT EXISTS current_software text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'lead';
```

### 2.2 Schemas jsonb canónicos

#### `verticals.positioning`

```json
{
  "headline": "string — promesa de valor en una frase",
  "problem_statement": "string — el problema que resuelve",
  "outcome": "string — el resultado medible que entrega",
  "proof_points": ["string[] — casos, métricas, testimonios"],
  "flow_narrative": "string — narrativa del flujo de venta para ese vertical"
}
```

#### `icp_criteria` — catálogo de `field_key` permitidos

El `field_key` referencia campos reales de `customers` o `opportunities` mediante un catálogo declarativo. **No** se evalúa string arbitrario — solo los campos del catálogo:

| `field_key` | Tabla origen | Tipo | Operadores válidos |
|---|---|---|---|
| `customers.company_size` | customers | text | `eq`, `in`, `not_in` |
| `customers.branches_count` | customers | integer | `gt`, `gte`, `lt`, `lte`, `eq` |
| `customers.current_software` | customers | text | `eq`, `neq`, `contains` |
| `customers.lifecycle_stage` | customers | text | `eq`, `in` |
| `customers.city` | customers | text | `eq`, `in` |
| `customers.vertical_id` | customers | uuid | `eq`, `in` |
| `opportunities.amount` | opportunities | numeric | `gt`, `gte`, `lt`, `lte` |
| `opportunities.currency` | opportunities | text | `eq`, `in` |
| `opportunities.deal_type` | opportunities | text | `eq`, `in` |

El motor valida que el `field_key` esté en el catálogo antes de evaluar. Si no está → ignora la criteria + log de warning.

#### `scoring_configs.config` — schema GOC canónico

`scoringService.ts` ya existe y ya lee `scoring_configs.config`. Documentar el schema canónico que F1 estandariza:

```json
{
  "dimensions": {
    "go_fit": {
      "label": "Go Fit — encaje con el ICP",
      "weight": 30,
      "criteria": [
        { "field": "icp_fit_score", "operator": "gte", "value": 70, "points": 30 }
      ]
    },
    "opportunity": {
      "label": "Opportunity — señal de intención",
      "weight": 30,
      "criteria": [
        { "field": "amount", "operator": "gte", "value": 1000000, "points": 15 },
        { "field": "record_type", "operator": "eq", "value": "deal", "points": 15 }
      ]
    },
    "capacity": {
      "label": "Capacity — capacidad de compra",
      "weight": 20,
      "criteria": [
        { "field": "customers.company_size", "operator": "in", "value": ["mediana","grande"], "points": 20 }
      ]
    },
    "timing": {
      "label": "Timing — urgencia temporal",
      "weight": 20,
      "criteria": [
        { "field": "expected_close_date", "operator": "lte_days", "value": 30, "points": 20 }
      ]
    }
  },
  "bands": [
    { "min": 0, "max": 30, "label": "Frío", "color": "#94a3b8" },
    { "min": 31, "max": 50, "label": "Nurturing", "color": "#3b82f6" },
    { "min": 51, "max": 70, "label": "Oportunidad", "color": "#8b5cf6" },
    { "min": 71, "max": 85, "label": "Alta prioridad", "color": "#f59e0b" },
    { "min": 86, "max": 100, "label": "Hot deal", "color": "#ef4444" }
  ]
}
```

> Verificar el schema actual de `scoringService.ts` antes de estandarizar. Si ya usa un formato distinto, migrar los datos existentes, no romperlos.

#### `sales_roles.responsibilities`

```json
[
  { "task": "Generar leads cualificados", "detail": "Via Meta/Google Ads + landing" },
  { "task": "Agendar demos", "detail": "Calendario compartido" }
]
```

### 2.3 Seeds idempotentes por organización

Se ejecutan al crear una organización nueva. **Idempotentes** — solo insertan si no existen.

#### 7 `sales_roles` por defecto (editables/eliminables)

```sql
-- Ejecutar dentro de un trigger de creación de org o vía endpoint post-signup
INSERT INTO sales_roles (organization_id, code, name, area, sort_order, responsibilities)
VALUES
  ($org_id, 'marketing', 'Marketing', 'marketing', 1, '[]'::jsonb),
  ($org_id, 'sdr', 'SDR / Prospectador', 'sdr', 2, '[]'::jsonb),
  ($org_id, 'ae', 'Ejecutivo de ventas', 'ae', 3, '[]'::jsonb),
  ($org_id, 'presales', 'Preventa / Soluciones', 'presales', 4, '[]'::jsonb),
  ($org_id, 'onboarding', 'Onboarding', 'onboarding', 5, '[]'::jsonb),
  ($org_id, 'cs', 'Customer Success', 'customer_success', 6, '[]'::jsonb),
  ($org_id, 'partners', 'Partners', 'partners', 7, '[]'::jsonb)
ON CONFLICT (organization_id, code) DO NOTHING;
```

#### 3 `icp_profiles` A/B/C genéricos (editables)

```sql
INSERT INTO icp_profiles (organization_id, name, band, description, priority, color, sla_first_contact_hours)
VALUES
  ($org_id, 'ICP A — Ideal', 'A', 'Encaje perfecto con el producto', 1, '#10b981', 1),
  ($org_id, 'ICP B — Bueno', 'B', 'Encaje parcial, requiere nurturing', 2, '#f59e0b', 8),
  ($org_id, 'ICP C — Marginal', 'C', 'Encaje bajo, valor a validar', 3, '#94a3b8', 24)
ON CONFLICT (organization_id, band) DO NOTHING;
```

#### `scoring_configs` GOC por defecto

```sql
INSERT INTO scoring_configs (organization_id, name, config, is_active)
VALUES ($org_id, 'GOC Default', '{"dimensions":{...}}'::jsonb, true)
ON CONFLICT (organization_id, name) DO NOTHING;
```

#### 6 verticales de ejemplo — **PLANTILLA OPCIONAL, no automática**

Los 6 verticales del método (Restaurantes, Hoteles, Retail, Supermercados, Servicios, Multisucursal) se ofrecen como plantilla importable con un clic desde la UI. **No se insertan automáticamente** — la org puede ser una peluquería. La UI tiene un botón "Importar plantilla de verticales" que ejecuta el INSERT solo si el usuario lo pide.

### 2.4 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('sales_roles','sales_teams','sales_team_members','territories','icp_profiles','icp_criteria');
-- Esperado: 6 filas, todas con relrowsecurity = true

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'opportunities' AND column_name IN ('icp_band','icp_fit_score');
-- Esperado: 2 filas

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'customers' AND column_name IN ('company_size','branches_count','current_software','lifecycle_stage');
-- Esperado: 4 filas
```

---

## 3. Backend

### 3.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/crm/roles` | `src/app/api/crm/roles/route.ts` | crear | GET, POST | CRUD de `sales_roles` |
| `/api/crm/roles/[id]` | `src/app/api/crm/roles/[id]/route.ts` | crear | PATCH, DELETE | |
| `/api/crm/teams` | `src/app/api/crm/teams/route.ts` | crear | GET, POST | CRUD de `sales_teams` + members |
| `/api/crm/icp` | `src/app/api/crm/icp/route.ts` | crear | GET, POST | CRUD de `icp_profiles` + criteria |
| `/api/crm/icp/[id]/evaluate` | `src/app/api/crm/icp/[id]/evaluate/route.ts` | crear | POST | Evalúa un cliente/oportunidad contra el ICP |
| `/api/crm/verticales` | `src/app/api/crm/verticales/route.ts` | modificar | GET, POST | Ya existe; extender con `positioning` |
| `/api/crm/verticales/[id]` | `src/app/api/crm/verticales/[id]/route.ts` | modificar | PATCH, DELETE | |
| `/api/crm/scoring/config` | `src/app/api/crm/scoring/config/route.ts` | crear | GET, PUT | Lee/actualiza `scoring_configs` |
| `/api/crm/verticales/import-template` | `src/app/api/crm/verticales/import-template/route.ts` | crear | POST | Importa los 6 verticales de ejemplo |

### 3.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/icpService.ts` | **crear** | Evalúa cliente/oportunidad contra ICP |
| `src/lib/services/crm/assignmentService.ts` | **crear** | Asignación automática de leads |
| `src/lib/services/crm/verticalsService.ts` | modificar | Extender con `positioning` |
| `src/lib/services/crm/scoringService.ts` | modificar | Estandarizar schema GOC |
| `src/lib/services/crm/roleService.ts` | **crear** | CRUD de `sales_roles`/`teams`/`members` |

#### `icpService.ts` — firmas principales

```typescript
export interface IcpEvaluationResult {
  band: string;
  fitScore: number; // 0–100
  matched: { fieldKey: string; criterion: string }[];
  missing: { fieldKey: string; criterion: string; isRequired: boolean }[];
}

export async function evaluateIcp(
  supabase: SupabaseClient,
  organizationId: number,
  params: { customerId?: number; opportunityId?: string }
): Promise<IcpEvaluationResult>;
```

#### `assignmentService.ts` — firmas principales

```typescript
export type AssignmentStrategy = 'round_robin' | 'territory' | 'vertical' | 'load_balance';

export interface AssignmentConfig {
  strategy: AssignmentStrategy;
  teamId?: number;
  roleId?: number;
}

export async function assignLead(
  supabase: SupabaseClient,
  organizationId: number,
  opportunityId: string,
  config: AssignmentConfig
): Promise<{ userId: string; reason: string }>;
```

### 3.3 Motor de evaluación de ICP

```typescript
// icpService.ts — algoritmo
export async function evaluateIcp(supabase, orgId, params) {
  // 1. Cargar icp_profiles activos de la org, ordenados por priority ASC
  const { data: profiles } = await supabase
    .from('icp_profiles').select('*, icp_criteria(*)')
    .eq('organization_id', orgId).eq('is_active', true)
    .order('priority');

  // 2. Cargar datos del cliente + oportunidad
  const [customer, opportunity] = await loadContext(supabase, params);

  // 3. Por cada profile, evaluar sus criteria contra el catálogo
  for (const profile of profiles) {
    let score = 0;
    let maxScore = 0;
    const matched = [];
    const missing = [];

    for (const criterion of profile.icp_criteria) {
      // Validar que field_key está en el catálogo
      if (!ALLOWED_FIELDS[criterion.field_key]) {
        console.warn(`ICP criteria field_key desconocido: ${criterion.field_key}`);
        continue;
      }

      maxScore += criterion.weight;
      const fieldValue = resolveField(criterion.field_key, customer, opportunity);

      if (evaluateOperator(fieldValue, criterion.operator, criterion.value)) {
        score += criterion.weight;
        matched.push({ fieldKey: criterion.field_key, criterion: criterion.operator });
      } else if (criterion.is_required) {
        missing.push({ fieldKey: criterion.field_key, criterion: criterion.operator, isRequired: true });
      }
    }

    // 4. Si todos los required pasan Y el score ≥ 60% del max → es este profile
    if (missing.filter(m => m.isRequired).length === 0 && score >= maxScore * 0.6) {
      const fitScore = Math.round((score / maxScore) * 100);
      // 5. Persistir en opportunities
      await supabase.from('opportunities')
        .update({ icp_band: profile.band, icp_fit_score: fitScore })
        .eq('id', params.opportunityId);
      return { band: profile.band, fitScore, matched, missing };
    }
  }

  // 6. Si no matchea ningún profile → band 'C' (marginal) con score 0
  return { band: 'C', fitScore: 0, matched: [], missing: [] };
}
```

### 3.4 Motor de asignación automática

```typescript
// assignmentService.ts
export async function assignLead(supabase, orgId, opportunityId, config) {
  // 1. Obtener miembros activos del team + role
  const { data: members } = await supabase
    .from('sales_team_members')
    .select('user_id, sales_role_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .eq('sales_team_id', config.teamId);

  if (!members?.length) throw new Error('No hay miembros en el team');

  let assignedUserId: string;
  let reason: string;

  switch (config.strategy) {
    case 'round_robin':
      // Buscar el último asignado y rotar
      const { data: lastAssigned } = await supabase
        .from('opportunities')
        .select('salesperson_id')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastIdx = members.findIndex(m => m.user_id === lastAssigned?.[0]?.salesperson_id);
      const nextIdx = (lastIdx + 1) % members.length;
      assignedUserId = members[nextIdx].user_id;
      reason = `round_robin: índice ${nextIdx}`;
      break;

    case 'territory':
      // Evaluar territories.criteria contra el cliente
      const territory = await matchTerritory(supabase, orgId, opportunityId);
      assignedUserId = territory?.assigned_user_id || members[0].user_id;
      reason = `territory: ${territory?.name || 'fallback'}`;
      break;

    case 'load_balance':
      // Contar oportunidades abiertas por miembro, asignar al que tenga menos
      const counts = await Promise.all(members.map(async m => {
        const { count } = await supabase
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('salesperson_id', m.user_id)
          .eq('status', 'open');
        return { userId: m.user_id, count };
      }));
      counts.sort((a, b) => a.count - b.count);
      assignedUserId = counts[0].userId;
      reason = `load_balance: ${counts[0].count} oportunidades`;
      break;

    default:
      assignedUserId = members[0].user_id;
      reason = 'default: primer miembro';
  }

  await supabase.from('opportunities')
    .update({ salesperson_id: assignedUserId })
    .eq('id', opportunityId);

  return { userId: assignedUserId, reason };
}
```

### 3.5 Variables de entorno

F1 no añade variables de entorno nuevas.

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/configuracion?modulo=crm&tab=estructura` | `src/components/configuracion/` | modificar | Tab "Estructura comercial": roles, teams, territorios |
| `/app/configuracion?modulo=crm&tab=icp` | `src/components/configuracion/` | modificar | Tab "ICP": profiles A/B/C + criteria |
| `/app/configuracion?modulo=crm&tab=verticales` | `src/components/configuracion/` | modificar | Tab "Verticales": CRUD + posicionamiento + contenido |
| `/app/configuracion?modulo=crm&tab=scoring` | `src/components/configuracion/` | modificar | Tab "Scoring GOC": editar dimensiones y bandas |

> La configuración va en el tab CRM de `/app/configuracion` (patrón `configModulesRegistry` → `CRMConfigPanel`). Verificar el registry antes de añadir tabs.

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/configuracion/crm/EstructuraTab.tsx` | **crear** | — | Gestión de roles, teams, territorios |
| `src/components/configuracion/crm/IcpTab.tsx` | **crear** | — | Gestión de ICP profiles + criteria |
| `src/components/configuracion/crm/VerticalesTab.tsx` | **crear** | — | CRUD de verticales + posicionamiento + botón importar plantilla |
| `src/components/configuracion/crm/ScoringTab.tsx` | **crear** | — | Editor de dimensiones GOC + bandas |
| `src/components/configuracion/crm/RoleEditor.tsx` | **crear** | `role?: SalesRole` | Formulario de rol |
| `src/components/configuracion/crm/IcpCriteriaEditor.tsx` | **crear** | `criteria: IcpCriteria[]` | Editor de criteria con catálogo de fields |
| `src/components/configuracion/crm/VerticalPositioningEditor.tsx` | **crear** | `positioning: Positioning` | Editor de posicionamiento (headline, problema, outcome, proof points) |

### 4.3 Wireframes

```
┌─ /app/configuracion?modulo=crm ─────────────────────────────┐
│ [Canales] [Estructura] [ICP] [Verticales] [Scoring] [Plantillas] [Seguimiento] [Post-venta] │
│                                                                │
│  ── Estructura comercial ──                                    │
│  ┌─ Roles (7) ──────────────┐  ┌─ Teams ─────────────────┐    │
│  │ Marketing      [activo]  │  │ Equipo Norte  [3 miemb]│    │
│  │ SDR            [activo]  │  │ Equipo Sur    [2 miemb]│    │
│  │ AE             [activo]  │  │ [+ Nuevo team]         │    │
│  │ Preventa       [activo]  │  └────────────────────────┘    │
│  │ Onboarding     [activo]  │                                 │
│  │ Customer Success[activo] │  ┌─ Territorios ───────────┐   │
│  │ Partners       [activo]  │  │ Bogotá DC  [criterios]  │   │
│  │ [+ Nuevo rol]            │  │ Medellín   [criterios]  │   │
│  └──────────────────────────┘  └─────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘

┌─ ICP ────────────────────────────────────────────────────────┐
│  Band A — Ideal  [color: verde]  SLA: 1h  [editar]           │
│  Criterios:                                                   │
│    customers.company_size IN [mediana, grande]  peso: 3  ✓   │
│    customers.branches_count >= 3                peso: 2  ✓   │
│    opportunities.amount >= 1000000              peso: 1     │
│  [+ Añadir criterio]                                          │
│                                                                │
│  Band B — Bueno  [color: amarillo]  SLA: 8h  [editar]        │
│  ...                                                          │
└────────────────────────────────────────────────────────────────┘

┌─ Verticales ─────────────────────────────────────────────────┐
│  [+ Nuevo vertical]  [📥 Importar plantilla (6 verticales)]  │
│                                                                │
│  ┌─ Restaurantes ──────────────────────────────────────┐     │
│  │ Headline: "ERP que hace rentable tu restaurante"    │     │
│  │ Problema: "Inventario sin control, mermas..."       │     │
│  │ Outcome: "Reduce mermas 30% en 90 días"             │     │
│  │ Proof: ["Caso Pollo Loco: -32% mermas"]             │     │
│  │ Contenido: [buyer_persona] [playbook] [demo_script] │     │
│  └─────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Animaciones Motion

```tsx
// Tabs con AnimatePresence para transición suave
import { AnimatePresence, motion } from 'motion/react';

<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2 }}
  >
    {tabContent}
  </motion.div>
</AnimatePresence>

// Cards de roles/verticales con layout para reordenar
<motion.div layout>
  <RoleCard role={role} />
</motion.div>
```

### 4.5 Accesibilidad

- Tabs navegables con flechas izquierda/derecha (`role="tablist"` + `role="tab"` + `aria-selected`).
- Editor de criteria: cada fila es un `fieldset` con `legend` descriptiva.
- Botón "Importar plantilla" tiene `aria-describedby` apuntando a un texto que explica "esto inserta 6 verticales de ejemplo; puedes editarlos o borrarlos después".
- Contraste de colores de ICP bands verificado (verde/amarillo/gris sobre fondo blanco).

---

## 5. Multi-tenant y seguridad

- Todas las tablas nuevas tienen `organization_id` + RLS con `current_org_id()`.
- Los endpoints usan `getServerOrgContext()` de F0.
- El motor ICP solo carga `icp_profiles` de la organización del usuario — nunca cruza.
- La asignación automática solo considera miembros de la organización.
- El catálogo de `field_key` está hardcoded en el servicio (no en la BD) para evitar inyección de campos arbitrarios. Si se necesita un campo nuevo, es un cambio de código, no de datos.

---

## 6. Cross-platform

F1 no introduce cambios cross-platform. La configuración es responsive (tabs → accordion en móvil).

---

## 7. Pruebas

### 7.1 Unitarios — motor ICP

**Archivo:** `src/__tests__/services/icpService.test.ts`

Casos con valores numéricos concretos:

1. Cliente con `company_size='grande'` + `branches_count=5` + oportunidad `amount=2000000` → ICP A, fitScore=100.
2. Cliente con `company_size='pequeña'` + `branches_count=1` → ICP C, fitScore=0.
3. Cliente sin `company_size` (null) → criteria `eq` falla → ICP C.
4. Oportunidad con `amount=500000` (por debajo del umbral de A) pero `company_size='mediana'` → ICP B.
5. `field_key` no en catálogo → se ignora + warning, no crashea.
6. ICP con 0 criteria → fitScore=100 para todos (edge case: devolver band A con warning).

### 7.2 Integración / API

- `POST /api/crm/icp/[id]/evaluate` con oportunidad de otra org → 404.
- `POST /api/crm/verticales/import-template` inserta 6 verticales solo si no existen.
- `POST /api/crm/verticales/import-template` dos veces → idempotente (no duplica).

### 7.3 Casos borde

- Organización sin `icp_profiles` → `evaluateIcp` devuelve band 'C', fitScore 0.
- Organización sin `sales_roles` → `assignLead` devuelve error "no hay miembros".
- `round_robin` con un solo miembro → siempre asigna a ese.
- `load_balance` con todos en 0 oportunidades → asigna al primero.

### 7.4 E2E

- Navegar a `/app/configuracion?modulo=crm&tab=estructura`, crear un rol, verificar que aparece.
- Importar plantilla de verticales, verificar que aparecen 6.
- Editar posicionamiento de un vertical, guardar, recargar, verificar persistencia.

---

## 8. Definition of Done

- [ ] `sales_roles`, `sales_teams`, `sales_team_members`, `territories`, `icp_profiles`, `icp_criteria` existen con RLS.
- [ ] `opportunities.icp_band`/`icp_fit_score` y `customers.company_size`/`branches_count`/`current_software`/`lifecycle_stage` existen.
- [ ] Seeds de 7 roles + 3 ICP profiles + scoring GOC se ejecutan al crear una org nueva.
- [ ] `icpService.evaluateIcp()` devuelve band + fitScore correctos para los 6 casos de prueba.
- [ ] `assignmentService.assignLead()` funciona con round_robin, territory y load_balance.
- [ ] UI de configuración con 4 tabs (Estructura, ICP, Verticales, Scoring) accesible y responsive.
- [ ] Botón "Importar plantilla de verticales" inserta 6 verticales idempotentemente.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 9. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| El schema de `scoring_configs.config` ya tiene datos con formato distinto | Migrar datos existentes antes de estandarizar; no romper configs en producción |
| El catálogo de `field_key` es muy rígido | Es intencional: seguridad sobre flexibilidad. Para añadir campos, cambio de código + test. Documentar el proceso. |
| 7 roles por defecto no aplican a todas las orgs | Son editables/eliminables. Una org puede tener 3 roles. El seed es un punto de partida, no una camisa de fuerza. |
| Importar 6 verticales ensucia orgs que no son del rubro | Es explícitamente opcional con botón y confirmación. No se inserta automáticamente. |

---

## 10. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/icpService.ts` | crear | Motor de evaluación ICP |
| `src/lib/services/crm/assignmentService.ts` | crear | Asignación automática |
| `src/lib/services/crm/roleService.ts` | crear | CRUD roles/teams/members |
| `src/lib/services/crm/verticalsService.ts` | modificar | Extender con positioning |
| `src/lib/services/crm/scoringService.ts` | modificar | Estandarizar schema GOC |
| `src/app/api/crm/roles/route.ts` + `[id]` | crear | CRUD roles |
| `src/app/api/crm/teams/route.ts` | crear | CRUD teams |
| `src/app/api/crm/icp/route.ts` + `[id]/evaluate` | crear | CRUD + evaluación ICP |
| `src/app/api/crm/verticales/route.ts` + `[id]` | modificar | Extender |
| `src/app/api/crm/verticales/import-template/route.ts` | crear | Importar plantilla |
| `src/app/api/crm/scoring/config/route.ts` | crear | Config GOC |
| `src/components/configuracion/crm/EstructuraTab.tsx` | crear | UI roles/teams/territorios |
| `src/components/configuracion/crm/IcpTab.tsx` | crear | UI ICP |
| `src/components/configuracion/crm/VerticalesTab.tsx` | crear | UI verticales |
| `src/components/configuracion/crm/ScoringTab.tsx` | crear | UI scoring |
| `src/components/configuracion/crm/RoleEditor.tsx` | crear | Form rol |
| `src/components/configuracion/crm/IcpCriteriaEditor.tsx` | crear | Editor criteria |
| `src/components/configuracion/crm/VerticalPositioningEditor.tsx` | crear | Editor posicionamiento |
| `src/__tests__/services/icpService.test.ts` | crear | Tests motor ICP |
