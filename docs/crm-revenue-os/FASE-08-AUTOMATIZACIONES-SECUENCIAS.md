# FASE 08 — Motor de automatizaciones y secuencias multicanal por etapa

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (etapas, gates), F3 (llamadas), F7 (email/plantillas)
> Bloquea: — (F11 usa automatizaciones de onboarding)

---

## 0. Objetivo y alcance

**Qué resuelve:** automatiza tareas por etapa del pipeline (llamada, correo, WhatsApp, SMS) y orquesta secuencias multicanal de seguimiento (día 0, 1, 3, 5, 7, 10, 14, 30). También captura leads desde Meta/Google/TikTok Lead Ads y los inserta en el pipeline.

**Puntos del método que cubre:** 14 (seguimiento automático), 30 (automatización end-to-end Ads → Landing → CRM).

**Qué NO entra:** agente IA de voz (F6), ficha 360° (F9), propuesta/contrato (F10).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `automations` tabla con `trigger_json`/`actions_json`/`active` | ✅ existe | BD |
| `AutomationsView.tsx` | 🟡 "próximamente" (bug G10) | `src/components/crm/pipeline/AutomationsView.tsx` |
| `leadCaptureService.ts` | ✅ existe | `src/lib/services/crm/leadCaptureService.ts` |
| `followupService.ts` | ✅ existe | `src/lib/services/crm/followupService.ts` |
| `followupEngineService.ts` | ✅ existe | `src/lib/services/crm/followupEngineService.ts` |
| WhatsApp Cloud API | ✅ | `src/app/api/integrations/whatsapp/` |
| Twilio SMS | ✅ | `src/app/api/integrations/twilio/send-sms` |
| Email (SendGrid) | ✅ | `src/app/api/integrations/sendgrid/` |
| `sequences` / `sequence_steps` / `sequence_enrollments` | ❌ | — |
| `automation_rules` / `automation_runs` | ❌ | — |
| Captura de Meta/Google Lead Ads | 🟡 parcial | `leadCaptureService.ts` |
| Editor visual de automatizaciones | ❌ | — |

> **Decisión del PLAN.md §6:** F8 migra `automations` (viejo) a `automation_rules` (nuevo) y elimina el viejo. No coexisten.

---

## 2. Arquitectura

```
┌─ Captura de leads ──────────────────────────────────────────┐
│  Meta Lead Ads webhook → /api/crm/leads/capture/meta        │
│  Google Ads Lead Form → /api/crm/leads/capture/google       │
│  TikTok Lead → /api/crm/leads/capture/tiktok                │
│  Web widget → /api/crm/leads/capture                        │
│  → leadCaptureService → INSERT opportunities (record_type='lead') │
│  → ICP evaluation (F1) → assignment (F1)                    │
│  → Enroll in sequence (F8)                                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Secuencias multicanal ─────────────────────────────────────┐
│  Sequence: "Seguimiento SDR"                                 │
│  Step 1 (día 0): WhatsApp template "primer contacto"        │
│  Step 2 (día 1): Llamada (crea task)                         │
│  Step 3 (día 3): Email "seguimiento"                         │
│  Step 4 (día 5): SMS "recordatorio"                          │
│  Step 5 (día 7): Llamada (crea task)                         │
│  Step 6 (día 14): Email "caso de éxito"                      │
│  Step 7 (día 30): Marcar como "sin respuesta" (lost)         │
│                                                                │
│  Condiciones de salida:                                       │
│  - Oportunidad mueve a "Calificado" → desinscribe            │
│  - Cliente responde → pausa secuencia                         │
│  - Oportunidad perdida → desinscribe                          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Automatizaciones por etapa ────────────────────────────────┐
│  Regla: cuando oportunidad entra a "Demo realizada"          │
│  Acciones:                                                    │
│  1. Crear task "enviar propuesta" (due: 24h)                 │
│  2. Enviar email "gracias por la demo" (F7)                  │
│  3. Enviar WhatsApp "te envío la propuesta pronto"           │
│  4. Schedule callback en 48h                                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─ Ejecutor (cron) ───────────────────────────────────────────┐
│  /api/crm/sequences/run (CRON_SECRET)                        │
│  → Procesa step_runs vencidos                                 │
│  → Ejecuta acción (email/WhatsApp/SMS/task)                  │
│  → Verifica condiciones de salida                             │
│  → Registra en automation_runs                                │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Base de datos

### 3.1 Migraciones

#### Migración 1 — `sequences`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs`

```sql
CREATE TABLE sequences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual','lead_capture','stage_change','custom')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  exit_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_sequences_org ON sequences (organization_id, is_active);
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY seq_select ON sequences FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY seq_insert ON sequences FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY seq_update ON sequences FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY seq_delete ON sequences FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE sequence_steps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_id bigint NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  delay_days integer NOT NULL DEFAULT 0,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','call','task','wait','condition')),
  template_id bigint REFERENCES templates(id) ON DELETE SET NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_number)
);

CREATE INDEX idx_seq_steps_org ON sequence_steps (organization_id, sequence_id);
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_select ON sequence_steps FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ss_insert ON sequence_steps FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ss_update ON sequence_steps FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ss_delete ON sequence_steps FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE sequence_enrollments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_id bigint NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  customer_id integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','exited')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  exit_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollments_org ON sequence_enrollments (organization_id, status);
CREATE INDEX idx_enrollments_opp ON sequence_enrollments (opportunity_id);
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY se_select ON sequence_enrollments FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY se_insert ON sequence_enrollments FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY se_update ON sequence_enrollments FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY se_delete ON sequence_enrollments FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE sequence_step_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id bigint NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_id bigint NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_step_runs_pending ON sequence_step_runs (organization_id, status, scheduled_at)
  WHERE status = 'pending';
ALTER TABLE sequence_step_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssr_select ON sequence_step_runs FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ssr_insert ON sequence_step_runs FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ssr_update ON sequence_step_runs FOR UPDATE USING (organization_id = current_org_id());
```

#### Migración 2 — `automation_rules` y `automation_runs`

```sql
CREATE TABLE automation_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('stage_change','opportunity_created','opportunity_won','opportunity_lost','activity_created','task_completed','custom')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_automation_rules_org ON automation_rules (organization_id, is_active);
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_select ON automation_rules FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY ar_insert ON automation_rules FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY ar_update ON automation_rules FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY ar_delete ON automation_rules FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE automation_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id bigint NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  trigger_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions_executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','partial')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_org ON automation_runs (organization_id, created_at DESC);
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY aruns_select ON automation_runs FOR SELECT USING (organization_id = current_org_id());
```

#### Migración 3 — Columnas en `opportunities` y `stages`

```sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS sequence_id bigint REFERENCES sequences(id) ON DELETE SET NULL;

ALTER TABLE stages
  ADD COLUMN IF NOT EXISTS automation_rule_ids bigint[] NOT NULL DEFAULT '{}';
```

#### Migración 4 — Migrar `automations` (viejo) a `automation_rules` y eliminar

```sql
-- Migrar datos existentes de automations a automation_rules
INSERT INTO automation_rules (organization_id, name, description, trigger_type, trigger_config, actions, is_active)
SELECT
  organization_id,
  name,
  description,
  COALESCE(trigger_json->>'type', 'custom'),
  trigger_json,
  actions_json,
  active
FROM automations
WHERE NOT EXISTS (
  SELECT 1 FROM automation_rules ar
  WHERE ar.organization_id = automations.organization_id
  AND ar.name = automations.name
);

-- Eliminar tabla vieja
DROP TABLE IF EXISTS automations CASCADE;
```

> **Verificar antes:** grep `automations` en `src/` y actualizar todas las referencias a `automation_rules`.

### 3.2 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('sequences','sequence_steps','sequence_enrollments','sequence_step_runs','automation_rules','automation_runs');
-- Esperado: 6 filas, todas true

SELECT relname FROM pg_class WHERE relname = 'automations';
-- Esperado: 0 filas (eliminada)
```

---

## 4. Backend

### 4.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/crm/sequences` | `src/app/api/crm/sequences/route.ts` | crear | GET, POST | CRUD secuencias |
| `/api/crm/sequences/[id]` | `src/app/api/crm/sequences/[id]/route.ts` | crear | PATCH, DELETE | |
| `/api/crm/sequences/[id]/enroll` | `src/app/api/crm/sequences/[id]/enroll/route.ts` | crear | POST | Inscribir opp/cliente |
| `/api/crm/sequences/run` | `src/app/api/crm/sequences/run/route.ts` | crear | POST | Cron: ejecutar pasos vencidos |
| `/api/crm/automations/rules` | `src/app/api/crm/automations/rules/route.ts` | crear | GET, POST | CRUD reglas |
| `/api/crm/automations/rules/[id]` | `src/app/api/crm/automations/rules/[id]/route.ts` | crear | PATCH, DELETE | |
| `/api/crm/automations/execute` | `src/app/api/crm/automations/execute/route.ts` | crear | POST | Ejecutar regla (evento) |
| `/api/crm/leads/capture` | `src/app/api/crm/leads/capture/route.ts` | crear | POST | Webhook genérico |
| `/api/crm/leads/capture/meta` | `src/app/api/crm/leads/capture/meta/route.ts` | crear | GET, POST | Meta leadgen |
| `/api/crm/leads/capture/google` | `src/app/api/crm/leads/capture/google/route.ts` | crear | POST | Google Ads Lead Form |

### 4.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/sequenceService.ts` | **crear** | CRUD + inscripción + ejecución |
| `src/lib/services/crm/automationService.ts` | **crear** | Motor de reglas por etapa |
| `src/lib/services/crm/leadCaptureService.ts` | modificar | Extender con Meta/Google/TikTok |

#### `sequenceService.ts` — firmas

```typescript
export async function enrollInSequence(params: {
  supabase: SupabaseClient;
  organizationId: number;
  sequenceId: number;
  opportunityId: string;
  customerId?: number;
}): Promise<{ enrollmentId: number }>;

export async function runPendingSteps(supabase: SupabaseClient, orgId: number): Promise<void>;

export async function checkExitConditions(supabase: SupabaseClient, enrollmentId: number): Promise<boolean>;
```

#### `automationService.ts` — firmas

```typescript
export async function triggerAutomation(params: {
  supabase: SupabaseClient;
  organizationId: number;
  triggerType: string;
  triggerData: Record<string, unknown>;
}): Promise<void>;

export async function executeActions(
  supabase: SupabaseClient,
  orgId: number,
  actions: Action[],
  context: Record<string, unknown>
): Promise<void>;
```

### 4.3 Motor de secuencias

```typescript
// sequenceService.ts — ejecución de pasos
export async function runPendingSteps(supabase, orgId) {
  // 1. Obtener step_runs vencidos
  const { data: pending } = await supabase
    .from('sequence_step_runs')
    .select('*, sequence_steps(*), sequence_enrollments(*)')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(100);

  for (const run of pending) {
    // 2. Verificar condiciones de salida
    const enrollment = run.sequence_enrollments;
    if (enrollment.status !== 'active') {
      await supabase.from('sequence_step_runs').update({ status: 'skipped' }).eq('id', run.id);
      continue;
    }

    const shouldExit = await checkExitConditions(supabase, enrollment.id);
    if (shouldExit) {
      await supabase.from('sequence_enrollments')
        .update({ status: 'exited', exited_at: new Date().toISOString() })
        .eq('id', enrollment.id);
      await supabase.from('sequence_step_runs').update({ status: 'skipped' }).eq('id', run.id);
      continue;
    }

    // 3. Ejecutar la acción del paso
    await supabase.from('sequence_step_runs').update({ status: 'running', executed_at: new Date().toISOString() }).eq('id', run.id);

    try {
      await executeStepAction(supabase, orgId, run.sequence_steps, enrollment);
      await supabase.from('sequence_step_runs').update({ status: 'completed' }).eq('id', run.id);
    } catch (err) {
      await supabase.from('sequence_step_runs').update({ status: 'failed', error_message: err.message }).eq('id', run.id);
    }

    // 4. Programar el siguiente paso
    await scheduleNextStep(supabase, enrollment, run.sequence_steps.step_number + 1);
  }
}

async function executeStepAction(supabase, orgId, step, enrollment) {
  switch (step.channel) {
    case 'email':
      await emailService.send({
        supabase, organizationId: orgId,
        templateId: step.template_id,
        toCustomerId: enrollment.customer_id,
        relatedType: 'opportunity', relatedId: enrollment.opportunity_id,
      });
      break;
    case 'whatsapp':
      await whatsappService.sendTemplate({
        supabase, organizationId: orgId,
        templateId: step.template_id,
        customerId: enrollment.customer_id,
      });
      break;
    case 'sms':
      await smsService.send({
        supabase, organizationId: orgId,
        templateId: step.template_id,
        customerId: enrollment.customer_id,
      });
      break;
    case 'call':
      // Crear task de llamada
      await supabase.from('tasks').insert({
        organization_id: orgId,
        title: `Llamar a ${enrollment.customer_name}`,
        due_date: new Date().toISOString(),
        related_type: 'opportunity',
        related_id: enrollment.opportunity_id,
      });
      break;
    case 'task':
      await supabase.from('tasks').insert({
        organization_id: orgId,
        title: step.action_config.title,
        due_date: step.action_config.due_date,
        related_type: 'opportunity',
        related_id: enrollment.opportunity_id,
      });
      break;
  }
}
```

### 4.4 Motor de automatizaciones por etapa

```typescript
// automationService.ts
export async function triggerAutomation(params) {
  // 1. Buscar reglas activas que matcheen el trigger
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('is_active', true)
    .eq('trigger_type', params.triggerType);

  for (const rule of rules) {
    // 2. Verificar condiciones
    if (!evaluateConditions(rule.conditions, params.triggerData)) continue;

    // 3. Ejecutar acciones
    const actionsExecuted = [];
    for (const action of rule.actions) {
      try {
        await executeAction(supabase, params.organizationId, action, params.triggerData);
        actionsExecuted.push({ action, status: 'completed' });
      } catch (err) {
        actionsExecuted.push({ action, status: 'failed', error: err.message });
      }
    }

    // 4. Registrar ejecución
    await supabase.from('automation_runs').insert({
      organization_id: params.organizationId,
      rule_id: rule.id,
      trigger_data: params.triggerData,
      actions_executed: actionsExecuted,
      status: actionsExecuted.every(a => a.status === 'completed') ? 'completed' : 'partial',
    });
  }
}

// Enganche: el trigger se dispara desde KanbanBoard.handleDragEnd
// cuando una oportunidad cambia de etapa:
// await triggerAutomation({ supabase, orgId, triggerType: 'stage_change',
//   triggerData: { opportunityId, fromStageId, toStageId } });
```

### 4.5 Captura de Lead Ads

#### Meta Lead Ads

```typescript
// /api/crm/leads/capture/meta
// 1. GET: verificación de webhook (hub.mode=subscribe, hub.verify_token, hub.challenge)
// 2. POST: procesar leadgen
//   - Verificar firma X-Hub-Signature-256 con WHATSAPP_APP_SECRET
//   - Extraer: leadgen_id, form_id, page_id, field_data [{name, values[]}]
//   - Mapear campos del form a campos de customer/opportunity
//   - leadCaptureService.createLead({ source: 'meta_ads', ... })
//   - ICP evaluation (F1)
//   - Assignment (F1)
//   - Enroll in sequence (F8)
```

#### Google Ads Lead Form

```typescript
// /api/crm/leads/capture/google
// Google envía un webhook con: { lead_id, campaign_id, form_id, custom_fields[] }
// Verificar con GOOGLE_ADS_* credentials
// Mismo flujo que Meta
```

### 4.6 Variables de entorno

| Variable | Requerida | Para qué |
|---|---|---|
| `CRON_SECRET` | sí | Proteger run/execute |
| `WHATSAPP_VERIFY_TOKEN` | sí | Meta webhook verify |
| `WHATSAPP_APP_SECRET` | sí | Meta webhook signature |
| `WHATSAPP_ACCESS_TOKEN` | sí | Meta Cloud API |
| `GOOGLE_ADS_*` | no | Google Lead Form |

---

## 5. UI

### 5.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/secuencias` | `src/app/app/crm/secuencias/page.tsx` | crear | Lista de secuencias + editor |
| `/app/crm/secuencias/[id]` | `src/app/app/crm/secuencias/[id]/page.tsx` | crear | Editor visual de secuencia |
| `/app/crm/automatizaciones` | `src/app/app/crm/automatizaciones/page.tsx` | crear | Editor de reglas por etapa |

### 5.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/secuencias/SequenceList.tsx` | **crear** | — | Lista de secuencias |
| `src/components/crm/secuencias/SequenceBuilder.tsx` | **crear** | `sequence?` | Editor visual de pasos |
| `src/components/crm/secuencias/StepCard.tsx` | **crear** | `step` | Card de un paso |
| `src/components/crm/secuencias/EnrollmentList.tsx` | **crear** | `sequenceId` | Inscripciones activas |
| `src/components/crm/pipeline/AutomationsView.tsx` | modificar | — | Reemplazar "próximamente" con editor real |
| `src/components/crm/pipeline/AutomationRuleEditor.tsx` | **crear** | `rule?` | Editor de regla por etapa |

### 5.3 Wireframes

```
┌─ SequenceBuilder ───────────────────────────────────────────┐
│  Secuencia: Seguimiento SDR                                  │
│  Trigger: lead_capture (Meta Ads)                            │
│                                                                │
│  ┌─ Step 1 (día 0) ──────────────────────────┐              │
│  │ WhatsApp: "primer contacto"               │ [▲▼] [✖]    │
│  └────────────────────────────────────────────┘              │
│         │                                                     │
│         ▼                                                     │
│  ┌─ Step 2 (día 1) ──────────────────────────┐              │
│  │ Llamada: crea task "llamar al lead"       │ [▲▼] [✖]    │
│  └────────────────────────────────────────────┘              │
│         │                                                     │
│         ▼                                                     │
│  ┌─ Step 3 (día 3) ──────────────────────────┐              │
│  │ Email: "seguimiento" template              │ [▲▼] [✖]    │
│  └────────────────────────────────────────────┘              │
│         │                                                     │
│  [+ Añadir paso]                                             │
│                                                                │
│  ── Condiciones de salida ──                                 │
│  ☑ Oportunidad mueve a "Calificado" → desinscribe            │
│  ☑ Cliente responde → pausa                                   │
│  ☑ Oportunidad perdida → desinscribe                          │
│                                                                │
│  [Guardar]  [Activar]                                         │
└────────────────────────────────────────────────────────────────┘

┌─ AutomationRuleEditor ──────────────────────────────────────┐
│  Regla: Al entrar a "Demo realizada"                         │
│  Trigger: stage_change → stage = "Demo realizada"            │
│                                                                │
│  Acciones:                                                    │
│  1. Crear task "enviar propuesta" (due: 24h)  [✖]          │
│  2. Enviar email "gracias por la demo"         [✖]          │
│  3. Enviar WhatsApp "te envío la propuesta"   [✖]          │
│  4. Schedule callback en 48h                   [✖]          │
│  [+ Añadir acción]                                           │
│                                                                │
│  Condiciones:                                                │
│  ☐ Solo si amount > 1000000                                  │
│  ☐ Solo si ICP band = A                                      │
│                                                                │
│  [Guardar]  [Activar]                                         │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 Animaciones Motion

```tsx
// Pasos de la secuencia con stagger
<motion.div initial="hidden" animate="visible" variants={{
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.1 } },
}}>
  {steps.map(step => (
    <motion.div key={step.id} variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    }}>
      <StepCard step={step} />
    </motion.div>
  ))}
</motion.div>

// Conector entre pasos (línea que se dibuja)
<motion.div
  initial={{ height: 0 }}
  animate={{ height: 'auto' }}
  className="w-0.5 bg-border mx-auto"
/>
```

### 5.5 Accesibilidad

- `SequenceBuilder` navegable con tab; cada `StepCard` es un `button` para editar.
- Reorder con teclado (flechas arriba/abajo).
- `AutomationRuleEditor` con `fieldset` + `legend` para cada sección.

---

## 6. Multi-tenant y seguridad

- Todas las tablas con `organization_id` + RLS.
- Cron protegido por `CRON_SECRET`.
- Webhooks de Meta/Google verifican firma con credenciales de la org.
- `leadCaptureService` crea el lead en la org correcta (resuelta desde el page_id/campaign_id de la org).

---

## 7. Pruebas

### 7.1 Secuencias

1. Inscribir oportunidad → se crean `step_runs` para cada paso con `scheduled_at` correcto.
2. Cron procesa step vencido → ejecuta acción (email/WhatsApp/SMS/task).
3. Condición de salida (opp mueve a "Calificado") → desinscribe + skip pasos pendientes.
4. Cliente responde → pausa secuencia.
5. Paso falla (email sin dominio verificado) → `status='failed'` + error_message.

### 7.2 Automatizaciones

1. Oportunidad cambia a "Demo realizada" → trigger dispara regla → ejecuta 4 acciones.
2. Regla con condición `amount > 1000000` → no se ejecuta si amount es menor.
3. Una acción falla → `status='partial'` + log.
4. Dos reglas para el mismo trigger → ambas se ejecutan.

### 7.3 Captura de leads

1. Meta webhook con firma válida → crea lead + ICP + assignment + enroll.
2. Meta webhook con firma inválida → 401.
3. Google Lead Form → mismo flujo.
4. Lead duplicado (mismo email) → no crea duplicado, actualiza existente.

---

## 8. Definition of Done

- [ ] `sequences`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs` existen con RLS.
- [ ] `automation_rules`, `automation_runs` existen con RLS.
- [ ] Tabla vieja `automations` eliminada; referencias en `src/` migradas.
- [ ] `opportunities.sequence_id` y `stages.automation_rule_ids` existen.
- [ ] `sequenceService` ejecuta pasos vencidos vía cron.
- [ ] `automationService` dispara reglas en `stage_change`.
- [ ] Captura de Meta/Google Lead Ads funciona.
- [ ] `SequenceBuilder` con drag & drop de pasos.
- [ ] `AutomationRuleEditor` reemplaza "próximamente".
- [ ] Condiciones de salida funcionan.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 9. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Migrar `automations` rompe reglas existentes | Migrar datos antes de eliminar; test de regresión |
| Secuencias envían spam si no hay condiciones de salida | Condiciones de salida obligatorias; opt-out respeta |
| Cron no ejecuta a tiempo | Usar Vercel Cron o Railway cron; monitorear latencia |
| Lead Ads duplican leads | Deduplicación por email/teléfono |
| WhatsApp template no aprobada → paso falla | Verificar aprobación antes de enroll; fallback a SMS |

---

## 10. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/sequenceService.ts` | crear | Motor de secuencias |
| `src/lib/services/crm/automationService.ts` | crear | Motor de reglas |
| `src/lib/services/crm/leadCaptureService.ts` | modificar | Extender Meta/Google |
| `src/app/api/crm/sequences/route.ts` + `[id]` + `[id]/enroll` + `run` | crear | CRUD + cron |
| `src/app/api/crm/automations/rules/route.ts` + `[id]` + `execute` | crear | CRUD + ejecutar |
| `src/app/api/crm/leads/capture/route.ts` + `meta` + `google` | crear | Webhooks Lead Ads |
| `src/app/app/crm/secuencias/page.tsx` + `[id]` | crear | UI secuencias |
| `src/app/app/crm/automatizaciones/page.tsx` | crear | UI automatizaciones |
| `src/components/crm/secuencias/SequenceList.tsx` | crear | Lista |
| `src/components/crm/secuencias/SequenceBuilder.tsx` | crear | Editor visual |
| `src/components/crm/secuencias/StepCard.tsx` | crear | Card de paso |
| `src/components/crm/secuencias/EnrollmentList.tsx` | crear | Inscripciones |
| `src/components/crm/pipeline/AutomationsView.tsx` | modificar | Reemplazar "próximamente" |
| `src/components/crm/pipeline/AutomationRuleEditor.tsx` | crear | Editor de regla |
