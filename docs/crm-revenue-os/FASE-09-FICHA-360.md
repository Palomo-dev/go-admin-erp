# FASE 09 — Ficha 360°: cliente, oportunidad y drawer con TODO

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F2 (pipeline, discovery, objeciones), F3 (llamadas), F4 (transcripción/análisis)
> Bloquea: F10 (propuesta usa la ficha), F11 (post-venta usa la ficha)

---

## 0. Objetivo y alcance

**Qué resuelve:** el requisito del dueño: *"el detalle de cliente / oportunidad / drawer: ver y subir TODO (actividades, tareas, oportunidades, acciones, documentos, productos, llamadas, grabaciones, transcripciones, emails, WhatsApp, SMS, notas, cotizaciones, facturas, pipeline history, análisis IA, follow-up tasks, health, onboarding, renovaciones, referidos, attachments)."*

**Qué NO entra:** propuesta/contrato/pago (F10), onboarding/health/renovación (F11), partners/referidos (F12).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `/app/clientes/[id]` | ✅ ficha 360° rica | `src/app/app/clientes/[id]/page.tsx` |
| `/app/crm/clientes/[id]` | 🟡 vista pobre (bug G9) | `src/app/app/crm/clientes/[id]/page.tsx` |
| `/app/crm/oportunidades/[id]` | ✅ existe | `src/app/app/crm/oportunidades/[id]/page.tsx` |
| `OpportunityDrawer.tsx` | ✅ existe | `src/components/crm/pipeline/OpportunityDrawer.tsx` |
| `activities` / `tasks` / `notes` | ✅ existen | BD |
| `quotations` | ✅ existe | BD |
| `opportunity_stage_history` | ✅ existe | BD |
| `conversations` / `messages` | ✅ existen | BD |
| `documents` (polimórfico) | ❌ | — |
| `document_folders` | ❌ | — |
| `activities.channel`/`outcome`/`duration_seconds` | ✅ (F2 los añade) | BD |
| Tab Documentos | ❌ | — |
| Timeline unificado | ❌ | — |

---

## 2. Base de datos

### 2.1 Migraciones

#### Migración 1 — `documents` y `document_folders`

```sql
CREATE TABLE document_folders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id bigint REFERENCES document_folders(id) ON DELETE CASCADE,
  related_type text,
  related_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, parent_id)
);

CREATE INDEX idx_doc_folders_org ON document_folders (organization_id, related_type, related_id);
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY df_select ON document_folders FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY df_insert ON document_folders FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY df_update ON document_folders FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY df_delete ON document_folders FOR DELETE USING (organization_id = current_org_id());

CREATE TABLE documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id bigint REFERENCES document_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  related_type text NOT NULL CHECK (related_type IN ('opportunity','customer','quotation','call','contract')),
  related_id text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  is_confidential boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_org_related ON documents (organization_id, related_type, related_id);
CREATE INDEX idx_documents_folder ON documents (organization_id, folder_id);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_select ON documents FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY doc_insert ON documents FOR INSERT WITH CHECK (organization_id = current_org_id());
CREATE POLICY doc_update ON documents FOR UPDATE USING (organization_id = current_org_id());
CREATE POLICY doc_delete ON documents FOR DELETE USING (organization_id = current_org_id());
```

#### Migración 2 — Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-documents', 'crm-documents', false)
ON CONFLICT (id) DO NOTHING;
```

### 2.2 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('documents','document_folders');
-- Esperado: 2 filas, true
```

---

## 3. Backend

### 3.1 Endpoints

| Endpoint | Archivo | Acción | Método | Qué hace |
|---|---|---|---|---|
| `/api/crm/documents` | `src/app/api/crm/documents/route.ts` | crear | GET, POST | CRUD + upload |
| `/api/crm/documents/[id]` | `src/app/api/crm/documents/[id]/route.ts` | crear | GET, PATCH, DELETE | |
| `/api/crm/documents/[id]/download` | `src/app/api/crm/documents/[id]/download/route.ts` | crear | GET | URL firmada |
| `/api/crm/timeline/[type]/[id]` | `src/app/api/crm/timeline/[type]/[id]/route.ts` | crear | GET | Timeline unificado |

### 3.2 Servicios

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/documentService.ts` | **crear** | CRUD + upload a Storage |
| `src/lib/services/crm/timelineService.ts` | **crear** | Timeline unificado |

#### `timelineService.ts` — timeline unificado

```typescript
export interface TimelineEntry {
  id: string;
  type: 'activity' | 'task' | 'note' | 'call' | 'email' | 'whatsapp' | 'sms'
      | 'quotation' | 'invoice' | 'stage_change' | 'document' | 'analysis'
      | 'onboarding' | 'renewal' | 'referral';
  title: string;
  description?: string;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export async function getTimeline(
  supabase: SupabaseClient,
  orgId: number,
  params: { type: 'opportunity' | 'customer'; id: string; limit?: number; offset?: number }
): Promise<{ entries: TimelineEntry[]; total: number }>;
```

El timeline consulta múltiples tablas y las unifica ordenadas por timestamp:
- `activities` (tipo call/email/whatsapp/sms/meeting)
- `tasks` (creadas/completadas)
- `notes`
- `calls` + `call_analyses`
- `email_messages`
- `messages` (WhatsApp/SMS desde `conversations`)
- `quotations`
- `opportunity_stage_history`
- `documents`
- `opportunity_objections`

---

## 4. UI

### 4.1 Rutas

| URL | Archivo | Acción | Qué muestra |
|---|---|---|---|
| `/app/crm/clientes/[id]` | ya existe | modificar | Ficha 360° completa del cliente |
| `/app/crm/oportunidades/[id]` | ya existe | modificar | Ficha 360° de la oportunidad |
| `/app/crm/conversaciones` | `src/app/app/crm/conversaciones/page.tsx` | crear | Índice omnicanal (reusa bandeja de chat) |

### 4.2 Componentes

| Archivo | Acción | Props | Qué hace |
|---|---|---|---|
| `src/components/crm/ficha360/Ficha360Layout.tsx` | **crear** | `type`, `id` | Layout con tabs + timeline |
| `src/components/crm/ficha360/TimelineTab.tsx` | **crear** | `entries` | Timeline unificado con filtros |
| `src/components/crm/ficha360/ActivitiesTab.tsx` | **crear** | `relatedType`, `relatedId` | Actividades + crear |
| `src/components/crm/ficha360/TasksTab.tsx` | **crear** | `relatedType`, `relatedId` | Tareas + crear/completar |
| `src/components/crm/ficha360/CallsTab.tsx` | **crear** | `relatedType`, `relatedId` | Llamadas + player + transcripción |
| `src/components/crm/ficha360/MessagesTab.tsx` | **crear** | `customerId` | WhatsApp/SMS/emails |
| `src/components/crm/ficha360/DocumentsTab.tsx` | **crear** | `relatedType`, `relatedId` | Documentos + upload + folders |
| `src/components/crm/ficha360/QuotationsTab.tsx` | **crear** | `opportunityId` | Cotizaciones + crear |
| `src/components/crm/ficha360/StageHistoryTab.tsx` | **crear** | `opportunityId` | Historial de etapas |
| `src/components/crm/ficha360/AnalysisTab.tsx` | **crear** | `relatedType`, `relatedId` | Análisis IA de llamadas |
| `src/components/crm/ficha360/DiscoveryTab.tsx` | **crear** | `opportunityId` | Wizard de discovery (F2) |
| `src/components/crm/ficha360/ObjectionsTab.tsx` | **crear** | `opportunityId` | Objeciones detectadas |
| `src/components/crm/ficha360/ProductsTab.tsx` | **crear** | `opportunityId` | Productos de la oportunidad |
| `src/components/crm/ficha360/HealthTab.tsx` | **crear** | `customerId` | Health score (F11) |
| `src/components/crm/ficha360/OnboardingTab.tsx` | **crear** | `customerId` | Onboarding (F11) |
| `src/components/crm/ficha360/RenewalsTab.tsx` | **crear** | `customerId` | Renovaciones (F11) |
| `src/components/crm/ficha360/ReferralsTab.tsx` | **crear** | `customerId` | Referidos (F12) |
| `src/components/crm/pipeline/OpportunityDrawer.tsx` | modificar | — | Integrar tabs de ficha 360° |

### 4.3 Wireframes

```
┌─ Ficha 360° Cliente ────────────────────────────────────────┐
│  ┌─ Avatar ─┐  Rest. El Corral                              │
│  │   🏪    │  NIT: 900.123.456-7  |  Bogotá  |  ICP: A     │
│  └─────────┘  Lifecycle: Customer  |  Health: 85 🟢        │
│                                                                │
│  [Timeline] [Actividades] [Tareas] [Llamadas] [Mensajes]     │
│  [Documentos] [Cotizaciones] [Oportunidades] [Health]        │
│  [Onboarding] [Renovaciones] [Referidos]                     │
│                                                                │
│  ── Timeline ──                                               │
│  📞 Llamada saliente — 4:12 — hoy 14:30                      │
│     └ Score: 78  |  Transcripción disponible  [▶]           │
│  ✉️ Email "propuesta" — abierto — hoy 10:15                  │
│  📝 Nota: "Cliente pide descuento del 10%" — ayer           │
│  📄 Cotización CT-001 — enviada — hace 3 días               │
│  🔄 Etapa: Demo → Propuesta enviada — hace 5 días           │
│  📋 Task: "Enviar propuesta" — completada — hace 5 días     │
│                                                                │
│  [Filtros: Todos ▼] [Buscar: ___________]                   │
└────────────────────────────────────────────────────────────────┘

┌─ Tab Documentos ────────────────────────────────────────────┐
│  [📁 Subir] [ Nueva carpeta]                                 │
│  📁 Propuestas/  📁 Contratos/  📁 Facturas/                │
│  📄 propuesta-ct-001.pdf   2.3 MB   hace 3 días  [ Descargar]│
│  📄 contrato-firmado.pdf   1.1 MB   hace 2 días  [ Descargar]│
│  📄 factura-001.pdf        0.8 MB   hoy           [ Descargar]│
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Animaciones Motion

```tsx
// Tabs con AnimatePresence
<AnimatePresence mode="wait">
  <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
    {tabContent}
  </motion.div>
</AnimatePresence>

// Timeline con stagger
<motion.div initial="hidden" animate="visible" variants={{
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.05 } },
}}>
  {entries.map(entry => (
    <motion.div key={entry.id} variants={{
      hidden: { opacity: 0, x: -20 },
      visible: { opacity: 1, x: 0 },
    }}>
      <TimelineEntry entry={entry} />
    </motion.div>
  ))}
</motion.div>

// Upload con progreso animado
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${progress}%` }}
  className="h-1 bg-primary"
/>
```

### 4.5 Accesibilidad

- Tabs con `role="tablist"` + `role="tab"` + `aria-selected` + navegación con flechas.
- Timeline con `role="feed"` + `aria-label`.
- Upload con `aria-label="Subir archivo"` + `aria-describedby` para instrucciones.
- Filtros con `aria-label` descriptivo.

---

## 5. Multi-tenant y seguridad

- Todas las tablas con `organization_id` + RLS.
- Documentos en Storage con path `org_{id}/{related_type}/{related_id}/...` + RLS.
- `download` valida org antes de firmar URL.
- Timeline solo consulta datos de la org del usuario.
- `is_confidential` documentos: solo visible para roles con permiso (configurable).

---

## 6. Cross-platform

- Upload de documentos funciona en web y Capacitor (usa `@capacitor/camera` o file picker).
- Electron: `dialog.showOpenDialog` para selección de archivos.
- PWA: `input[type=file]` estándar.

---

## 7. Pruebas

### 7.1 Unitarios

- `timelineService` devuelve entries ordenadas por timestamp descendente.
- `documentService.upload` sube a Storage con path correcto.
- Filtros de timeline funcionan por tipo.

### 7.2 Integración

- Subir documento → aparece en tab Documentos + en Timeline.
- Crear actividad → aparece en Timeline.
- Llamada completada (F3) → aparece en Timeline + tab Llamadas.
- Email enviado (F7) → aparece en Timeline + tab Mensajes.

### 7.3 Casos borde

- Cliente sin actividades → Timeline vacío con mensaje.
- Documento de otra org → 403 al descargar.
- Timeline con 1000 entries → paginación funciona.
- Upload de 50 MB → 413 (límite configurable).

---

## 8. Definition of Done

- [ ] `documents`, `document_folders` existen con RLS.
- [ ] Bucket `crm-documents` creado.
- [ ] `/app/crm/clientes/[id]` muestra ficha 360° completa (no la vista pobre).
- [ ] `/app/crm/oportunidades/[id]` muestra ficha 360° completa.
- [ ] `OpportunityDrawer` integra tabs de ficha 360°.
- [ ] Timeline unificado muestra activities, tasks, notes, calls, emails, messages, quotations, stage_history, documents.
- [ ] Tab Documentos con upload + folders + download.
- [ ] `/app/crm/conversaciones` lista conversaciones.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` limpios.
- [ ] Cero archivos `.sql` en el repo.

---

## 9. Riesgos y decisiones de diseño

| Riesgo | Mitigación |
|---|---|
| Timeline consulta muchas tablas → lento | Paginación + índices + cache opcional |
| Documentos confidenciales visibles a todos | `is_confidential` + permisos por rol |
| Drawer sobrecargado con tabs | Tabs colapsables; solo mostrar tabs relevantes según contexto |

---

## 10. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/services/crm/documentService.ts` | crear | CRUD documentos |
| `src/lib/services/crm/timelineService.ts` | crear | Timeline unificado |
| `src/app/api/crm/documents/route.ts` + `[id]` + `[id]/download` | crear | CRUD + download |
| `src/app/api/crm/timeline/[type]/[id]/route.ts` | crear | Timeline API |
| `src/app/app/crm/clientes/[id]/page.tsx` | modificar | Ficha 360° |
| `src/app/app/crm/oportunidades/[id]/page.tsx` | modificar | Ficha 360° |
| `src/app/app/crm/conversaciones/page.tsx` | crear | Índice conversaciones |
| `src/components/crm/ficha360/Ficha360Layout.tsx` | crear | Layout |
| `src/components/crm/ficha360/TimelineTab.tsx` | crear | Timeline |
| `src/components/crm/ficha360/ActivitiesTab.tsx` | crear | Actividades |
| `src/components/crm/ficha360/TasksTab.tsx` | crear | Tareas |
| `src/components/crm/ficha360/CallsTab.tsx` | crear | Llamadas |
| `src/components/crm/ficha360/MessagesTab.tsx` | crear | Mensajes |
| `src/components/crm/ficha360/DocumentsTab.tsx` | crear | Documentos |
| `src/components/crm/ficha360/QuotationsTab.tsx` | crear | Cotizaciones |
| `src/components/crm/ficha360/StageHistoryTab.tsx` | crear | Historial etapas |
| `src/components/crm/ficha360/AnalysisTab.tsx` | crear | Análisis IA |
| `src/components/crm/ficha360/DiscoveryTab.tsx` | crear | Discovery |
| `src/components/crm/ficha360/ObjectionsTab.tsx` | crear | Objeciones |
| `src/components/crm/ficha360/ProductsTab.tsx` | crear | Productos |
| `src/components/crm/ficha360/HealthTab.tsx` | crear | Health (placeholder F11) |
| `src/components/crm/ficha360/OnboardingTab.tsx` | crear | Onboarding (placeholder F11) |
| `src/components/crm/ficha360/RenewalsTab.tsx` | crear | Renovaciones (placeholder F11) |
| `src/components/crm/ficha360/ReferralsTab.tsx` | crear | Referidos (placeholder F12) |
| `src/components/crm/pipeline/OpportunityDrawer.tsx` | modificar | Integrar tabs |
