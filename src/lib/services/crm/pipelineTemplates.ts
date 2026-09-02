/**
 * Plantillas preestablecidas de pipelines para el CRM.
 *
 * Fuente única de verdad para:
 * - Creación automática al activar el módulo CRM (server-side, /api/modules).
 * - Diálogo "Crear Nuevo Pipeline" en PipelineHeader (client-side).
 *
 * Cada plantilla define nombre, pipeline_type y las etapas con las que se crea.
 * No depende de Supabase ni de hooks del cliente — solo constantes.
 */

export type PipelineTemplateKey =
  | 'blank'
  | 'sales'
  | 'onboarding'
  | 'renewal';

export interface PipelineTemplateStage {
  name: string;
  position: number;
  probability: number;
  color: string;
  sla_days: number | null;
  is_won: boolean;
  is_lost: boolean;
}

export interface PipelineTemplate {
  key: PipelineTemplateKey;
  label: string;
  description: string;
  pipeline_type: string | null;
  is_default: boolean;
  stages: PipelineTemplateStage[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    key: 'blank',
    label: 'Pipeline en blanco',
    description: 'Crea un pipeline vacío. Podrás agregar etapas manualmente.',
    pipeline_type: null,
    is_default: false,
    stages: [],
  },
  {
    key: 'sales',
    label: 'Ventas',
    description: 'Pipeline comercial clásico: Lead → Contacto → Calificación → Demo → Propuesta → Negociación → Cierre.',
    pipeline_type: 'sales',
    is_default: false,
    stages: [
      { name: 'Lead nuevo', position: 1, probability: 10, color: '#3b82f6', sla_days: 3, is_won: false, is_lost: false },
      { name: 'Contactado', position: 2, probability: 20, color: '#6366f1', sla_days: 7, is_won: false, is_lost: false },
      { name: 'Calificado', position: 3, probability: 35, color: '#8b5cf6', sla_days: 10, is_won: false, is_lost: false },
      { name: 'Discovery', position: 4, probability: 50, color: '#a855f7', sla_days: 14, is_won: false, is_lost: false },
      { name: 'Demo', position: 5, probability: 65, color: '#d946ef', sla_days: 21, is_won: false, is_lost: false },
      { name: 'Propuesta', position: 6, probability: 80, color: '#ec4899', sla_days: 30, is_won: false, is_lost: false },
      { name: 'Negociacion', position: 7, probability: 90, color: '#f97316', sla_days: 45, is_won: false, is_lost: false },
      { name: 'Contrato/pago', position: 8, probability: 100, color: '#22c55e', sla_days: null, is_won: true, is_lost: false },
      { name: 'Perdido', position: 9, probability: 0, color: '#ef4444', sla_days: null, is_won: false, is_lost: true },
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    description: 'Implementación post-venta: Kickoff → Configuración → Importación → Capacitación → Uso asistido → Revisiones.',
    pipeline_type: 'onboarding',
    is_default: false,
    stages: [
      { name: 'Kickoff', position: 1, probability: 10, color: '#3b82f6', sla_days: 3, is_won: false, is_lost: false },
      { name: 'Configuracion', position: 2, probability: 20, color: '#6366f1', sla_days: 7, is_won: false, is_lost: false },
      { name: 'Importacion', position: 3, probability: 35, color: '#8b5cf6', sla_days: 10, is_won: false, is_lost: false },
      { name: 'Capacitacion', position: 4, probability: 50, color: '#a855f7', sla_days: 14, is_won: false, is_lost: false },
      { name: 'Uso asistido', position: 5, probability: 70, color: '#d946ef', sla_days: 21, is_won: false, is_lost: false },
      { name: 'Revision 14d', position: 6, probability: 85, color: '#ec4899', sla_days: 30, is_won: false, is_lost: false },
      { name: 'Business Review 30d', position: 7, probability: 100, color: '#22c55e', sla_days: 45, is_won: true, is_lost: false },
    ],
  },
  {
    key: 'renewal',
    label: 'Renovación',
    description: 'Gestión de renovaciones de contrato: pendiente → contacto → negociación → contrato → renovado/no renovado.',
    pipeline_type: 'renewal',
    is_default: false,
    stages: [
      { name: 'Renovacion pendiente', position: 1, probability: 50, color: '#3b82f6', sla_days: null, is_won: false, is_lost: false },
      { name: 'Contacto iniciado', position: 2, probability: 60, color: '#6366f1', sla_days: 30, is_won: false, is_lost: false },
      { name: 'Negociacion', position: 3, probability: 75, color: '#a855f7', sla_days: 21, is_won: false, is_lost: false },
      { name: 'Contrato enviado', position: 4, probability: 90, color: '#ec4899', sla_days: 14, is_won: false, is_lost: false },
      { name: 'Renovado', position: 5, probability: 100, color: '#22c55e', sla_days: null, is_won: true, is_lost: false },
      { name: 'No renovado', position: 6, probability: 0, color: '#ef4444', sla_days: null, is_won: false, is_lost: true },
    ],
  },
];

/**
 * Crea un pipeline con sus etapas usando un cliente Supabase dado.
 * Reutilizable desde server-side (service role) y client-side (anon).
 *
 * @returns ID del pipeline creado o null si falla.
 */
export async function createPipelineFromTemplate(
  supabaseClient: import('@supabase/supabase-js').SupabaseClient,
  organizationId: number,
  templateKey: PipelineTemplateKey,
  customName?: string
): Promise<string | null> {
  const template = PIPELINE_TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return null;

  // Si la plantilla tiene pipeline_type, evitar duplicados por organización
  if (template.pipeline_type) {
    const { data: existing } = await supabaseClient
      .from('pipelines')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('pipeline_type', template.pipeline_type)
      .maybeSingle();

    if (existing) {
      const existingId = (existing as { id: string }).id;
      // Si el pipeline ya existe pero no tiene etapas y la plantilla sí, crearlas
      if (template.stages.length > 0) {
        const { count } = await supabaseClient
          .from('stages')
          .select('id', { count: 'exact', head: true })
          .eq('pipeline_id', existingId);

        if (count === 0) {
          const stagesToInsert = template.stages.map((stage) => ({
            pipeline_id: existingId,
            name: stage.name,
            position: stage.position,
            probability: stage.probability,
            color: stage.color,
            sla_days: stage.sla_days,
            is_won: stage.is_won,
            is_lost: stage.is_lost,
          }));

          const { error: stagesError } = await supabaseClient
            .from('stages')
            .insert(stagesToInsert);

          if (stagesError) {
            console.warn('[pipelineTemplates] Advertencia creando etapas en pipeline existente:', stagesError.message);
          }
        }
      }
      return existingId;
    }
  }

  const name = customName?.trim() || template.label;

  const { data: pipeline, error: pipelineError } = await supabaseClient
    .from('pipelines')
    .insert({
      organization_id: organizationId,
      name,
      pipeline_type: template.pipeline_type,
      is_default: template.is_default,
    })
    .select()
    .single();

  if (pipelineError || !pipeline) {
    console.error('[pipelineTemplates] Error creando pipeline:', pipelineError?.message);
    return null;
  }

  const pipelineId = (pipeline as { id: string }).id;

  if (template.stages.length > 0) {
    const stagesToInsert = template.stages.map((stage) => ({
      pipeline_id: pipelineId,
      name: stage.name,
      position: stage.position,
      probability: stage.probability,
      color: stage.color,
      sla_days: stage.sla_days,
      is_won: stage.is_won,
      is_lost: stage.is_lost,
    }));

    const { error: stagesError } = await supabaseClient
      .from('stages')
      .insert(stagesToInsert);

    if (stagesError) {
      console.warn('[pipelineTemplates] Advertencia creando etapas:', stagesError.message);
    }
  }

  return pipelineId;
}
