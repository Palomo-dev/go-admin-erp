# PROGRESS — CRM Revenue OS

## 2026-09 — Plantillas preestablecidas en "Crear Nuevo Pipeline" + provisión automática

**Decisión:** cuando el usuario abre "Crear Nuevo Pipeline" en el dropdown del
`PipelineHeader`, ahora ve un selector de plantillas preestablecidas además del
campo de nombre. Ambos campos son independientes: el usuario elige una plantilla
(que define las etapas) y escribe el nombre que quiera.

**Plantillas disponibles** (`src/lib/services/crm/pipelineTemplates.ts`):

| Key | Label | `pipeline_type` | Etapas |
|---|---|---|---|
| `blank` | Pipeline en blanco | `null` | 0 — etapas manuales |
| `sales` | Ventas | `sales` | 9 — Lead nuevo → ... → Contrato/pago → Perdido |
| `onboarding` | Onboarding | `onboarding` | 7 — Kickoff → ... → Business Review 30d |
| `renewal` | Renovación | `renewal` | 6 — Renovacion pendiente → ... → No renovado |

**Función compartida:** `createPipelineFromTemplate(supabaseClient, orgId, templateKey, customName?)`
- Reutilizable server-side (service role) y client-side (anon).
- Idempotente: si ya existe un pipeline con ese `pipeline_type` para la org, retorna su ID sin duplicar.
- Inserta el pipeline y luego las etapas en batch.

**Provisión automática al activar CRM:**
- `src/app/api/modules/route.ts` — al activar el módulo `crm`, llama
  `createPipelineFromTemplate` para `onboarding` y `renewal` automáticamente.
- Toda organización que active CRM tiene sus pipelines de Onboarding y Renovación
  disponibles sin pasos manuales.

**Diálogo "Crear Nuevo Pipeline" (PipelineHeader.tsx):**
- Selector de botones con las 4 plantillas (descripción + badge de tipo + secuencia de etapas).
- Input de texto libre para el nombre (independiente de la plantilla).
- "Pipeline en blanco" → crea solo el pipeline sin etapas.
- "Ventas"/"Onboarding"/"Renovación" → crea pipeline con el nombre ingresado + etapas preestablecidas.
- Al cerrar se resetean ambos campos. Después de crear se recargan los pipelines y se selecciona el nuevo.

**Archivos modificados:**
- `src/lib/services/crm/pipelineTemplates.ts` (nuevo) — constantes + `createPipelineFromTemplate`.
- `src/components/crm/pipeline/PipelineHeader.tsx` — import de plantillas, estado `selectedTemplate`, diálogo con selector + nombre, `handleCreatePipeline` refactorizado.
- `src/app/api/modules/route.ts` — provisión automática de pipelines onboarding/renewal al activar CRM.

---

## 2026-09 — Onboarding y Renovaciones desde el Pipeline existente

**Decisión:** no se crean páginas separadas ni tabs nuevos para onboarding/renovaciones.
Se reutiliza el `PipelineView` existente en `/app/crm/pipeline` con su selector de pipeline.

**Cómo funciona:**
- `PipelineHeader.tsx` carga TODOS los pipelines de la organización (sin filtrar por
  `pipeline_type`) y muestra badges visuales en el dropdown:
  - "Por defecto" (azul) para `is_default=true`
  - "Onboarding" (morado) para `pipeline_type='onboarding'`
  - "Renovación" (morado) para `pipeline_type='renewal'`
- Al seleccionar "Onboarding" o "Renovación", `PipelineStages` filtra las oportunidades
  por ese `pipeline_id` y el kanban las muestra.
- `PipelineView` sigue cargando `is_default=true` (Ventas) al inicio.

**Flujo de onboarding:** al ganar una venta, `WonCloseModal` ejecuta la action
"onboarding" → `onboardingService` busca/crea el pipeline `pipeline_type='onboarding'`
(7 etapas: Kickoff → Configuración → Importación → Capacitación → Uso asistido →
Revisión 14d → Business Review 30d), crea la oportunidad hija (`parent_opportunity_id`)
en la primera etapa. El usuario la ve seleccionando "Onboarding" en el dropdown.

**Flujo de renovaciones:** `WonCloseModal` crea hitos 120/90/60/30/15/7 días antes del
vencimiento; `renewalService.syncRenewals()` crea oportunidades en pipeline
`pipeline_type='renewal'`. El usuario las ve seleccionando "Renovación" en el dropdown.

**Archivos modificados:**
- `src/components/crm/pipeline/PipelineHeader.tsx`: interface `Pipeline` con
  `pipeline_type: string | null`, query con `pipeline_type` en el select, badge morado
  en el dropdown.

**Archivos NO modificados (ya funcionaban):**
- `PipelineView.tsx`, `PipelineStages.tsx`, `onboardingService.ts`,
  `renewalService.ts`, `WonCloseModal.tsx`.

**Páginas eliminadas (no necesarias):** `OnboardingTab.tsx`, `RenovacionesTab.tsx`.

**Docs actualizadas:** FASE-11-POSTVENTA.md (§4.1 rutas, §4.2 componentes, §7 DoD,
§8 archivos), FASE-02-PIPELINE-PROFESIONAL.md (§2.4 nota sobre selector de pipeline).
