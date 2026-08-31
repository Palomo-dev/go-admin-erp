# FASE 02 — Pipeline profesional: gates, scoring, discovery, objeciones y closed-lost

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0 (tipos canónicos, higiene), F1 (ICP, scoring config)
> Bloquea: F4 (análisis IA mueve etapa vía gates), F8 (secuencias por etapa), F9 (ficha 360°)

---

## 0. Objetivo y alcance

**Qué resuelve:** convierte el pipeline existente en un pipeline profesional con gates de etapa verificables, scoring GOC operativo, wizard de discovery, biblioteca de objeciones, closed-lost estructurado, y la bandeja de leads como `record_type`. Mapea las 15 entidades del método (Lead → … → Expansión) a las tablas reales.

**Puntos del método que cubre:** 5 (pipeline 10 etapas), 6 (GOC operativo), 7 (discovery), 12 (probabilidades → datos históricos), 13 (gates), 15 (sistema de seguimiento), 16 (objeciones), 17 (closed-lost), 32 (entidades separadas).

**Qué NO entra:** secuencias multicanal automáticas (F8), análisis IA que rellena discovery desde llamadas (F4), demo guiada (F10).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `KanbanBoard.tsx` con DnD | ✅ | `src/components/crm/pipeline/KanbanBoard.tsx` |
| `handleDragEnd` en Kanban | ✅ | `KanbanBoard.tsx` (buscar función) |
| `stageGateService.ts` | ✅ existe, devuelve `{ ok, missing[] }` | `src/lib/services/crm/stageGateService.ts` |
| `GateWarningDialog.tsx` | ✅ existe | `src/components/crm/pipeline/GateWarningDialog.tsx` |
| `StageManager.tsx` + `StageConfigDialog.tsx` | ✅ existe | `src/components/crm/pipeline/` |
| `WonCloseModal.tsx` | ✅ existe | `src/components/crm/pipeline/WonCloseModal.tsx` |
| `StructuredLossDialog.tsx` | ✅ existe | `src/components/crm/oportunidades/StructuredLossDialog.tsx` |
| `LossReasonDialog.tsx` (viejo) | ✅ existe — consolidar con Structured | `src/components/crm/oportunidades/` |
| `ScoringSection.tsx` | ✅ existe | `src/components/crm/oportunidades/ScoringSection.tsx` |
| `HoyView.tsx` | ✅ existe | `src/components/crm/hoy/HoyView.tsx` |
| `opportunity_stage_history` + trigger | ✅ existe | BD |
| `loss_reasons` | ✅ existe | BD |
| `stages.exit_criteria` jsonb | ✅ existe | BD |
| `stages.is_won`/`is_lost`/`sla_days` | ✅ existe | BD |
| `AutomationsView.tsx` | 🟡 "próximamente" | `src/components/crm/pipeline/AutomationsView.tsx` |
| `opportunities.record_type` | ❌ no existe | BD |
| `objections` / `opportunity_objections` | ❌ no existen | BD |
| `discovery_templates` | ❌ no existe | BD |
| `opportunities.discovery_data` | ❌ no existe | BD |
| Columnas de seguimiento (`last_contact_at`, etc.) | ❌ no existen | BD |
| Columnas de closed-lost estructurado | ❌ no existen | BD |
| `/app/crm/leads` | ❌ no existe | — |
| `/app/crm/objeciones` | ❌ no existe | — |
| Catálogo de plantillas de pipeline | ❌ no existe | — |

---

## 2. Base de datos

### 2.1 Migraciones

#### Migración 1 — Columnas en `opportunities`

```sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'deal'
    CHECK (record_type IN ('lead','deal')),
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_channel text,
  ADD COLUMN IF NOT EXISTS contact_result text,
  ADD COLUMN IF NOT EXISTS objection_id bigint,
  ADD COLUMN IF NOT EXISTS loss_reason_value text,
  ADD COLUMN IF NOT EXISTS competitor_name text,
  ADD COLUMN IF NOT EXISTS competitor_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS missing_features text[],
  ADD COLUMN IF NOT EXISTS recontact_at date,
  ADD COLUMN IF NOT EXISTS discovery_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_opportunities_org_record_type
  ON opportunities (organization_id, record_type, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_org_last_contact
  ON opportunities (organization_id, last_contact_at NULLS FIRST)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_opportunities_org_recontact
  ON opportunities (organization_id, recontact_at)
  WHERE status = 'lost' AND recontact_at IS NOT NULL;
```

#### Migración 2 — `objections` y `opportunity_objections`

```sql
CREATE TABLE objections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  detection_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_response text,
  discovery_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_case_studies text[],
  vertical_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_objections_org ON objections (organization_id, is_active, sort_order);
ALTER TABLE objections ENABLE ROW LEVEL SECURITY;
CREATE POLICY objections_select ON objections FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY objections_insert ON objections FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY objections_update ON objections FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY objections_delete ON objections FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE opportunity_objections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  objection_id bigint NOT NULL REFERENCES objections(id) ON DELETE CASCADE,
  notes text,
  detected_by text NOT NULL DEFAULT 'manual' CHECK (detected_by IN ('manual','ia')),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opp_objections_opp ON opportunity_objections (organization_id, opportunity_id);
ALTER TABLE opportunity_objections ENABLE ROW LEVEL SECURITY;
CREATE POLICY oo_select ON opportunity_objections FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY oo_insert ON opportunity_objections FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY oo_update ON opportunity_objections FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY oo_delete ON opportunity_objections FOR DELETE USING (organization_id = current_org_id());

-- FK de opportunities.objection_id → objections.id
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_objection_fk
  FOREIGN KEY (objection_id) REFERENCES objections(id) ON DELETE SET NULL;
```

#### Migración 3 — `discovery_templates`

```sql
CREATE TABLE discovery_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  vertical_id uuid,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_discovery_templates_org ON discovery_templates (organization_id, is_active);
ALTER TABLE discovery_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY dt_select ON discovery_templates FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY dt_insert ON discovery_templates FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY dt_update ON discovery_templates FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY dt_delete ON discovery_templates FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 4 — Columnas en `activities`

```sql
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
```

#### Migración 5 — Verificar/crear triggers de sincronización etapa↔status

Verificar antes si existen `fn_log_stage_change` y `fn_sync_status_from_stage`:

```sql
-- Verificación
SELECT proname FROM pg_proc WHERE proname IN ('fn_log_stage_change','fn_sync_status_from_stage');
```

Si no existen:

```sql
-- Log automático de cambio de etapa
CREATE OR REPLACE FUNCTION fn_log_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id, changed_at, changed_by)
    VALUES (NEW.id, OLD.stage_id, NEW.stage_id, now(), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stage_change ON opportunities;
CREATE TRIGGER trg_log_stage_change
  AFTER UPDATE OF stage_id ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_stage_change();

-- Sincronizar status desde etapa (is_won → 'won', is_lost → 'lost', else → 'open')
CREATE OR REPLACE FUNCTION fn_sync_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stage_record RECORD;
BEGIN
  SELECT is_won, is_lost INTO stage_record FROM stages WHERE id = NEW.stage_id;
  IF stage_record.is_won THEN
    NEW.status := 'won';
  ELSIF stage_record.is_lost THEN
    NEW.status := 'lost';
  ELSE
    NEW.status := 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_status_from_stage ON opportunities;
CREATE TRIGGER trg_sync_status_from_stage
  BEFORE INSERT OR UPDATE OF stage_id ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_status_from_stage();
```

> **Auditar:** grep `updateOpportunity.*status` en `src/` y eliminar cualquier set manual de `status`. `status` es SOLO derivado de la etapa.

### 2.2 Schema canónico de `stages.exit_criteria`

```json
{
  "required_fields": ["amount", "expected_close_date"],
  "required_customer_fields": ["company_name", "phone"],
  "required_activities": [
    { "type": "call", "count": 1 },
    { "type": "email", "count": 1 }
  ],
  "require_discovery": false,
  "require_quotation": false,
  "min_score": 51,
  "min_icp_band": "B",
  "require_next_contact": true,
  "custom_checks": [
    {
      "id": "has_decision_maker",
      "label": "Tiene identificado el decisor",
      "field": "discovery_data.decision_maker",
      "operator": "not_null"
    }
  ]
}
```

Ejemplo por cada una de las 10 etapas de la plantilla "Ventas B2B SaaS":

| Etapa | Prob. | `exit_criteria` |
|---|---|---|
| Lead nuevo | 5% | `{}` (sin requisitos) |
| Contactado | 10% | `{ "required_activities": [{"type":"call","count":1}] }` |
| Calificado | 20% | `{ "min_score": 51, "min_icp_band": "C", "required_customer_fields": ["company_name","phone"] }` |
| Discovery realizado | 30% | `{ "require_discovery": true }` |
| Demo realizada | 45% | `{ "required_activities": [{"type":"demo","count":1}] }` |
| Propuesta enviada | 60% | `{ "require_quotation": true }` |
| Negociación | 75% | `{ "required_fields": ["amount","expected_close_date"] }` |
| Contrato-pago pendiente | 90% | `{ "required_fields": ["amount"], "custom_checks": [{"id":"has_signature","label":"Contrato firmado"}] }` |
| Ganado | 100% | `{}` (is_won=true) |
| Perdido | 0% | `{}` (is_lost=true) |

### 2.3 Schema canónico de `opportunities.discovery_data`

```json
{
  "template_id": 123,
  "completed_sections": 3,
  "total_sections": 5,
  "sections": {
    "situacion": {
      "completed": true,
      "answers": [
        { "question_id": "q1", "question": "¿Cómo manejan el inventario hoy?", "answer": "En Excel" }
      ]
    },
    "problema": {
      "completed": true,
      "answers": [
        { "question_id": "q2", "question": "¿Qué problemas tienen?", "answer": "Mermas del 15%" }
      ]
    },
    "impacto": { "completed": false, "answers": [] },
    "consecuencia": { "completed": false, "answers": [] },
    "decision": { "completed": false, "answers": [] }
  },
  "decision_maker": { "name": "Juan Pérez", "role": "Gerente" },
  "budget_mentioned": 5000000,
  "timeline": "90 días"
}
```

### 2.4 Catálogo de plantillas de pipeline importables

No se crea tabla — se almacena como JSON en `src/lib/services/crm/pipelineTemplates.ts` (constante en código, como catálogo). La UI ofrece las plantillas y el usuario importa la que quiera con un clic, insertando `pipelines` + `stages` para su organización.

Plantillas del catálogo:

| ID | Nombre | Etapas | Uso |
|---|---|---|---|
| `b2b_saas` | Ventas B2B SaaS | 10 etapas (las del método) | Software, servicios B2B |
| `b2b_retail` | Ventas B2B Retail | 7 etapas | Distribución, mayoreo |
| `b2c_services` | Servicios B2C | 5 etapas | Peluquerías, gimnasios, consultorías |
| `onboarding` | Onboarding cliente | 7 etapas | Post-venta (F11) |
| `renewal` | Renovación | 6 etapas | Post-venta (F11) |
| `expansion` | Expansión/Upsell | 5 etapas | Post-venta (F11) |

### 2.5 Seeds idempotentes

No hay seeds automáticos en F2 — las plantillas de pipeline son importables con un clic, no forzadas. Los seeds de `loss_reasons` ya existen en el repo (`lossReasonService.ts`).

### 2.6 Verificación post-migración

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'opportunities' AND column_name IN (
    'record_type','last_contact_at','contact_channel','contact_result',
    'objection_id','loss_reason_value','competitor_name','competitor_price',
    'missing_features','recontact_at','discovery_data'
  );
-- Esperado: 11 filas

SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('objections','opportunity_objections','discovery_templates');
-- Esperado: 3 filas, todas true

SELECT proname FROM pg_proc WHERE proname IN ('fn_log_stage_change','fn_sync_status_from_stage');
-- Esperado: 2 filas
```

---

## 3. Backend

### 3.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/crm/leads` | `src/app/api/crm/leads/route.ts` | crear | GET | Lista `opportunities` con `record_type='lead'` |
| `/api/crm/leads/[id]/convert` | `src/app/api/crm/leads/[id]/convert/route.ts` | crear | POST | Convierte lead→deal (cambia `record_type` + valida gate) |
| `/api/crm/objections` | `src/app/api/crm/objections/route.ts` | crear | GET, POST | CRUD objeciones |
| `/api/crm/objections/[id]` | `src/app/api/crm/objections/[id]/route.ts` | crear | PATCH, DELETE | |
| `/api/crm/opportunities/[id]/objections` | `src/app/api/crm/opportunities/[id]/objections/route.ts` | crear | GET, POST | Objeciones de una oportunidad |
| `/api/crm/discovery/templates` | `src/app/api/crm/discovery/templates/route.ts` | crear | GET, POST | CRUD plantillas de discovery |
| `/api/crm/opportunities/[id]/discovery` | `src/app/api/crm/opportunities/[id]/discovery/route.ts` | crear | GET, PUT | Lee/actualiza `discovery_data` |
| `/api/crm/pipeline-templates` | `src/app/api/crm/pipeline-templates/route.ts` | crear | GET | Lista plantillas importables |
| `/api/crm/pipeline-templates/[id]/import` | `src/app/api/crm/pipeline-templates/[id]/import/route.ts` | crear | POST | Importa plantilla a la org |
| `/api/crm/stages/[id]/gate` | `src/app/api/crm/stages/[id]/gate/route.ts` | crear | POST | Evalúa gate de una etapa para una oportunidad |

### 3.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/stageGateService.ts` | modificar | Extender con todos los campos del schema canónico |
| `src/lib/services/crm/lossReasonService.ts` | modificar | Extender con competidor/precio/features |
| `src/lib/services/crm/scoringService.ts` | modificar | Recálculo automático + persistencia + badge |
| `src/lib/services/crm/discoveryService.ts` | **crear** | CRUD de discovery_data |
| `src/lib/services/crm/objectionService.ts` | **crear** | CRUD objeciones + detección |
| `src/lib/services/crm/pipelineTemplates.ts` | **crear** | Catálogo de plantillas importables |
| `src/lib/services/activityService.ts` | modificar | Hook que actualiza `last_contact_at` |

#### `stageGateService.ts` — firma extendida

```typescript
export interface GateResult {
  ok: boolean;
  missing: {
    type: 'field' | 'customer_field' | 'activity' | 'discovery' | 'quotation' | 'score' | 'icp_band' | 'next_contact' | 'custom';
    label: string;
    detail: string;
  }[];
}

export async function evaluateStageGate(
  supabase: SupabaseClient,
  organizationId: number,
  params: { opportunityId: string; targetStageId: string }
): Promise<GateResult>;
```

### 3.3 Algoritmo de gate

```typescript
// stageGateService.ts — pseudocódigo completo
export async function evaluateStageGate(supabase, orgId, params) {
  // 1. Cargar la etapa destino con exit_criteria
  const { data: stage } = await supabase
    .from('stages').select('exit_criteria, pipeline_id')
    .eq('id', params.targetStageId).single();
  const criteria = stage.exit_criteria || {};

  // 2. Cargar la oportunidad + cliente
  const { data: opp } = await supabase
    .from('opportunities').select('*, customers(*)')
    .eq('id', params.opportunityId).single();

  const missing = [];

  // 3. required_fields
  if (criteria.required_fields) {
    for (const field of criteria.required_fields) {
      if (!opp[field] || opp[field] === '') {
        missing.push({ type: 'field', label: field, detail: `Falta ${field} en la oportunidad` });
      }
    }
  }

  // 4. required_customer_fields
  if (criteria.required_customer_fields && opp.customers) {
    for (const field of criteria.required_customer_fields) {
      if (!opp.customers[field] || opp.customers[field] === '') {
        missing.push({ type: 'customer_field', label: field, detail: `Falta ${field} en el cliente` });
      }
    }
  }

  // 5. required_activities
  if (criteria.required_activities) {
    for (const req of criteria.required_activities) {
      const { count } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('related_type', 'opportunity')
        .eq('related_id', params.opportunityId)
        .eq('activity_type', req.type);
      if (count < req.count) {
        missing.push({ type: 'activity', label: req.type, detail: `Faltan ${req.count - count} actividades de tipo ${req.type}` });
      }
    }
  }

  // 6. require_discovery
  if (criteria.require_discovery) {
    const dd = opp.discovery_data || {};
    const completed = dd.completed_sections || 0;
    const total = dd.total_sections || 0;
    if (completed < total || total === 0) {
      missing.push({ type: 'discovery', label: 'Discovery', detail: `Discovery incompleto (${completed}/${total} secciones)` });
    }
  }

  // 7. require_quotation
  if (criteria.require_quotation) {
    const { count } = await supabase
      .from('quotations')
      .select('id', { count: 'exact', head: true })
      .eq('opportunity_id', params.opportunityId);
    if (count === 0) {
      missing.push({ type: 'quotation', label: 'Cotización', detail: 'No hay cotización vinculada' });
    }
  }

  // 8. min_score
  if (criteria.min_score && (opp.score_total || 0) < criteria.min_score) {
    missing.push({ type: 'score', label: 'Score', detail: `Score ${opp.score_total || 0} < mínimo ${criteria.min_score}` });
  }

  // 9. min_icp_band
  if (criteria.min_icp_band) {
    const bandPriority = { A: 1, B: 2, C: 3 };
    if (bandPriority[opp.icp_band] > bandPriority[criteria.min_icp_band]) {
      missing.push({ type: 'icp_band', label: 'ICP', detail: `ICP ${opp.icp_band} no cumple mínimo ${criteria.min_icp_band}` });
    }
  }

  // 10. require_next_contact
  if (criteria.require_next_contact && !opp.next_contact_at) {
    missing.push({ type: 'next_contact', label: 'Próximo contacto', detail: 'No hay próximo contacto programado' });
  }

  // 11. custom_checks
  if (criteria.custom_checks) {
    for (const check of criteria.custom_checks) {
      const value = resolveNestedField(opp, check.field);
      if (check.operator === 'not_null' && (value === null || value === undefined)) {
        missing.push({ type: 'custom', label: check.label, detail: check.label });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
```

### 3.4 Mapeo de las 15 entidades del punto 32 → tabla real

| Entidad del método | Tabla real | Notas |
|---|---|---|
| Lead | `opportunities` con `record_type='lead'` | No tabla separada — decisión V2 |
| Contacto | `customers` + `customer_contacts` (si existe) | Persona dentro de la empresa |
| Empresa | `customers` con `customer_type='company'` | |
| Oportunidad | `opportunities` con `record_type='deal'` | |
| Actividad | `activities` | Polimórfica via `related_type`/`related_id` |
| Cotización | `quotations` | Con `sections_json` para narrativa |
| Contrato | `contract_signatures` (F10) | |
| Pago | `invoice_sales` + Stripe | |
| Cliente | `customers` con `lifecycle_stage='customer'` | |
| Onboarding | `opportunities` en pipeline `pipeline_type='onboarding'` (F11) | |
| Customer Success | `health_score_snapshots` (F11) | |
| Suscripción | `subscriptions` (frontera de plataforma — leer solo) | |
| Renovación | `opportunities` en pipeline `pipeline_type='renewal'` (F11) | |
| Expansión | `opportunities` en pipeline `pipeline_type='expansion'` (F11) | |
| Referido | `referrals` (F12) | |

### 3.5 Variables de entorno

F2 no añade variables de entorno.

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/leads` | `src/app/app/crm/leads/page.tsx` | crear | Bandeja de leads (`record_type='lead'`) |
| `/app/crm/objeciones` | `src/app/app/crm/objeciones/page.tsx` | crear | Biblioteca de objeciones |
| `/app/crm/pipeline` | ya existe | modificar | Kanban con badge de score + ICP band |
| `/app/crm/hoy` | ya existe | modificar | Integrar `last_contact_at` + `sla_days` + leads sin contacto |

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/leads/LeadsList.tsx` | **crear** | — | Tabla de leads con ICP band, score, último contacto |
| `src/components/crm/leads/ConvertLeadDialog.tsx` | **crear** | `leadId` | Dialog de conversión lead→deal con validación de gate |
| `src/components/crm/objeciones/ObjecionesList.tsx` | **crear** | — | Lista de objeciones con filtros por categoría/vertical |
| `src/components/crm/objeciones/ObjecionEditor.tsx` | **crear** | `objection?` | Form de objeción |
| `src/components/crm/objeciones/ObjecionPanel.tsx` | **crear** | `opportunityId` | Panel contextual en drawer que sugiere objeción según etapa |
| `src/components/crm/discovery/DiscoveryWizard.tsx` | **crear** | `opportunityId`, `templateId` | Wizard de discovery con secciones y progreso |
| `src/components/crm/pipeline/GateWarningDialog.tsx` | modificar | — | Extender con todos los tipos de missing + toggle de bloqueo duro |
| `src/components/crm/pipeline/KanbanBoard.tsx` | modificar | — | Badge de score + ICP band en tarjeta; `handleDragEnd` valida gate |
| `src/components/crm/pipeline/StageConfigDialog.tsx` | modificar | — | Editor de `exit_criteria` con todos los campos |
| `src/components/crm/oportunidades/StructuredLossDialog.tsx` | modificar | — | Añadir competidor/precio/features |
| `src/components/crm/oportunidades/ScoringSection.tsx` | modificar | — | Recálculo automático + badge animado |
| `src/components/crm/hoy/HoyView.tsx` | modificar | — | Integrar `last_contact_at` + leads sin contacto |
| `src/components/crm/pipeline/PipelineTemplateImporter.tsx` | **crear** | — | Selector de plantillas importables |

### 4.3 Wireframes

```
┌─ /app/crm/leads ─────────────────────────────────────────────┐
│  [+ Nuevo lead]  [Filtros: ICP ▼] [Score ▼] [Sin contacto ▼] │
│                                                                │
│  Cliente          ICP  Score  Últ.contacto  SDR      Acción   │
│  Rest. El Corral  A    87     hace 2h       Juan P.  [→Deal] │
│  Hotel Bogotá     B    62     hace 5d       María    [→Deal] │
│  Ferretería San   C    28     sin contacto  —        [→Deal] │
└────────────────────────────────────────────────────────────────┘

┌─ Discovery Wizard ───────────────────────────────────────────┐
│  ● Situación  ● Problema  ○ Impacto  ○ Consecuencia  ○ Decisión │
│  ─────────────────────────────────────────────────────         │
│  Pregunta: ¿Cómo manejan el inventario hoy?                    │
│  [Textarea: En Excel, sin control de mermas_____________]     │
│                                                                │
│  Pregunta: ¿Cuántas sedes tienen?                              │
│  [Input: 3]                                                    │
│                                                                │
│  [← Anterior]                              [Siguiente →]      │
└────────────────────────────────────────────────────────────────┘

┌─ Gate Warning Dialog ────────────────────────────────────────┐
│  ⚠️ No cumple los criterios para avanzar a "Propuesta enviada" │
│                                                                │
│  Faltan:                                                       │
│  • No hay cotización vinculada                                 │
│  • Score 45 < mínimo 51                                        │
│  • No hay próximo contacto programado                          │
│                                                                │
│  [Cancelar]  [Avanzar de todas formas (registrar override)]   │
└────────────────────────────────────────────────────────────────┘

┌─ Structured Loss Dialog ─────────────────────────────────────┐
│  Razón: [Competidor ▼]                                        │
│  Competidor: [ERP Competidor X____]  (obligatorio si razón=competidor) │
│  Precio del competidor: [$ 4,500,000]  (recomendado si razón=precio) │
│  Features faltantes: [☑ Facturación electrónica] [☑ POS] [+] │
│  Notas: [________________________]                            │
│  Recontactar en: [2026-12-01]                                 │
│  [Confirmar pérdida]                                          │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Animaciones Motion

```tsx
// Kanban card con badge de score animado
import { motion, AnimatePresence } from 'motion/react';

// Badge de score que pulsa al cambiar
<motion.div
  key={score}
  initial={{ scale: 0.8, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
  className="badge"
>
  {score}
</motion.div>

// Gate dialog con AnimatePresence
<AnimatePresence>
  {gateOpen && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <GateWarningDialog ... />
    </motion.div>
  )}
</AnimatePresence>

// Drag del Kanban — NO animar layout en >100 tarjetas (regla de performance)
// El DnD de @hello-pangea/dnd ya maneja la animación visual del drag.
// Motion solo para el badge y el dialog.
```

### 4.5 Accesibilidad

- Drag & drop accesible por teclado: `@hello-pangea/dnd` soporta `Tab` + flechas. Verificar que `KanbanBoard` tiene `onKeyDown` para mover tarjeta con flechas.
- Foco automático en el primer campo del dialog de gate.
- Anuncio ARIA `aria-live="polite"` cuando cambia la etapa de una oportunidad.
- Wizard de discovery: progreso con `role="progressbar"` + `aria-valuenow`.
- Dialog de pérdida: campos condicionales anunciados con `aria-describedby`.

---

## 5. Multi-tenant y seguridad

- Todas las tablas nuevas tienen `organization_id` + RLS.
- `stageGateService` solo consulta datos de la organización del usuario.
- La conversión lead→deal valida que el lead pertenece a la org.
- Las objeciones y plantillas de discovery son por organización.
- El catálogo de plantillas de pipeline es código (no BD) — no contiene datos de ninguna org.

---

## 6. Cross-platform

F2 no introduce cambios cross-platform. El Kanban y los dialogs son responsive.

---

## 7. Pruebas

### 7.1 Unitarios — gate con matriz de casos

**Archivo:** `src/__tests__/services/stageGateService.test.ts`

| Caso | Configuración | Esperado |
|---|---|---|
| Gate sin criterios | `exit_criteria = {}` | `{ ok: true, missing: [] }` |
| Falta campo requerido | `required_fields: ['amount']`, opp sin amount | `{ ok: false, missing: [{type:'field',...}] }` |
| Falta actividad | `required_activities: [{type:'call',count:2}]`, 1 call | `{ ok: false, missing: [{type:'activity',...}] }` |
| Discovery incompleto | `require_discovery: true`, `completed: 2/5` | `{ ok: false, missing: [{type:'discovery',...}] }` |
| Sin cotización | `require_quotation: true`, 0 quotations | `{ ok: false, missing: [{type:'quotation',...}] }` |
| Score bajo | `min_score: 51`, score=45 | `{ ok: false, missing: [{type:'score',...}] }` |
| ICP insuficiente | `min_icp_band: 'B'`, band='C' | `{ ok: false, missing: [{type:'icp_band',...}] }` |
| Todo cumple | Todos los criterios, opp completa | `{ ok: true, missing: [] }` |
| Custom check falla | `custom_checks: [{field:'discovery_data.decision_maker',operator:'not_null'}]`, null | `{ ok: false, missing: [{type:'custom',...}] }` |

### 7.2 Integración / API

- `POST /api/crm/leads/[id]/convert` con lead de otra org → 404.
- `POST /api/crm/stages/[id]/gate` devuelve el resultado correcto.
- Importar plantilla de pipeline dos veces → idempotente (no duplica etapas).

### 7.3 Casos borde

- Etapa sin `exit_criteria` → gate siempre pasa.
- Override de gate → se registra en `opportunities.metadata.gate_overrides` con `{ from, to, missing, userId, timestamp }`.
- Race condition: dos usuarios mueven la misma tarjeta simultáneamente → el trigger `fn_log_stage_change` registra ambos cambios; el último gana (optimistic concurrency con `updated_at`).
- Oportunidad de otra org → 404 en todos los endpoints.
- Lead sin `salesperson_id` → no aparece en "Hoy" hasta que se asigna.

### 7.4 E2E Puppeteer

- Navegar a `/app/crm/pipeline`, arrastrar una tarjeta a una etapa con gate → aparece el dialog de advertencia.
- Confirmar override → la tarjeta se mueve + se registra el override.
- Navegar a `/app/crm/leads`, pulsar "→Deal" → se convierte y aparece en el pipeline.

---

## 8. Definition of Done

- [ ] `opportunities.record_type` existe con valores `lead`/`deal`.
- [ ] `objections`, `opportunity_objections`, `discovery_templates` existen con RLS.
- [ ] Columnas de seguimiento y closed-lost estructurado existen en `opportunities`.
- [ ] `activities.channel`/`outcome`/`duration_seconds` existen.
- [ ] Triggers `fn_log_stage_change` y `fn_sync_status_from_stage` funcionan.
- [ ] `stageGateService` evalúa todos los campos del schema canónico.
- [ ] `GateWarningDialog` muestra todos los tipos de missing + toggle de bloqueo duro.
- [ ] `StructuredLossDialog` captura competidor/precio/features.
- [ ] `/app/crm/leads` lista leads con ICP y score.
- [ ] `/app/crm/objeciones` permite CRUD de objeciones.
- [ ] `DiscoveryWizard` funciona con secciones y progreso.
- [ ] `PipelineTemplateImporter` ofrece las 6 plantillas.
- [ ] `HoyView` integra `last_contact_at` + `sla_days` + leads sin contacto.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 9. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Bloqueo duro de gate frustra usuarios | Soft-gate por defecto; toggle por organización para bloqueo duro; override siempre registrado |
| `status` se setea manualmente en algún lugar | Auditar grep `status.*won\|status.*lost\|status.*open` en updates; el trigger lo sobrescribe, pero es mejor no setearlo |
| Plantilla de 10 etapas no aplica a todas | Es una de 6 plantillas; la org elige; puede crear su propio pipeline desde cero |
| `StructuredLossDialog` vs `LossReasonDialog` duplicados | Consolidar: `StructuredLossDialog` es el canonical; eliminar `LossReasonDialog` |
| Race condition en drag | `updated_at` + optimistic concurrency; el trigger loguea ambos intentos |

---

## 10. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/stageGateService.ts` | modificar | Extender schema canónico |
| `src/lib/services/crm/lossReasonService.ts` | modificar | Competidor/precio/features |
| `src/lib/services/crm/scoringService.ts` | modificar | Recálculo automático |
| `src/lib/services/crm/discoveryService.ts` | crear | CRUD discovery_data |
| `src/lib/services/crm/objectionService.ts` | crear | CRUD objeciones |
| `src/lib/services/crm/pipelineTemplates.ts` | crear | Catálogo de plantillas |
| `src/lib/services/activityService.ts` | modificar | Hook `last_contact_at` |
| `src/app/api/crm/leads/route.ts` + `[id]/convert` | crear | Bandeja leads |
| `src/app/api/crm/objections/route.ts` + `[id]` | crear | CRUD objeciones |
| `src/app/api/crm/opportunities/[id]/objections/route.ts` | crear | Objeciones de opp |
| `src/app/api/crm/discovery/templates/route.ts` | crear | CRUD plantillas |
| `src/app/api/crm/opportunities/[id]/discovery/route.ts` | crear | Discovery data |
| `src/app/api/crm/pipeline-templates/route.ts` + `[id]/import` | crear | Plantillas importables |
| `src/app/api/crm/stages/[id]/gate/route.ts` | crear | Evaluar gate |
| `src/app/app/crm/leads/page.tsx` | crear | Bandeja leads |
| `src/app/app/crm/objeciones/page.tsx` | crear | Biblioteca objeciones |
| `src/components/crm/leads/LeadsList.tsx` | crear | Tabla leads |
| `src/components/crm/leads/ConvertLeadDialog.tsx` | crear | Conversión lead→deal |
| `src/components/crm/objeciones/ObjecionesList.tsx` | crear | Lista objeciones |
| `src/components/crm/objeciones/ObjecionEditor.tsx` | crear | Form objeción |
| `src/components/crm/objeciones/ObjecionPanel.tsx` | crear | Panel contextual en drawer |
| `src/components/crm/discovery/DiscoveryWizard.tsx` | crear | Wizard discovery |
| `src/components/crm/pipeline/GateWarningDialog.tsx` | modificar | Extender |
| `src/components/crm/pipeline/KanbanBoard.tsx` | modificar | Badge score + ICP |
| `src/components/crm/pipeline/StageConfigDialog.tsx` | modificar | Editor exit_criteria |
| `src/components/crm/oportunidades/StructuredLossDialog.tsx` | modificar | Competidor/precio |
| `src/components/crm/oportunidades/ScoringSection.tsx` | modificar | Recálculo + badge |
| `src/components/crm/hoy/HoyView.tsx` | modificar | Integrar seguimiento |
| `src/components/crm/pipeline/PipelineTemplateImporter.tsx` | crear | Selector plantillas |
| `src/__tests__/services/stageGateService.test.ts` | crear | Tests gate |
