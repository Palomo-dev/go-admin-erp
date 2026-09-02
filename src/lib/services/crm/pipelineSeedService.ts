import { supabase } from '@/lib/supabase/config';

/**
 * Servicio CRM para plantillas semilla idempotentes.
 * Crea pipelines, etapas, razones de pérdida y configuraciones por defecto
 * solo si no existen previamente.
 */

interface SeedStage {
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  sla_days: number | null;
  color: string;
}

interface PipelineRow {
  id: string;
  organization_id: number;
  name: string;
}

interface ScoringConfigRow {
  id: string;
  organization_id: number;
}

// Las 10 etapas del pipeline B2B por defecto
// probability en escala 0-100 (integer, constraint de BD: stages_probability_range)
const DEFAULT_STAGES: SeedStage[] = [
  { name: 'Lead nuevo', position: 1, probability: 5, is_won: false, is_lost: false, sla_days: 3, color: '#94a3b8' },
  { name: 'Contactado', position: 2, probability: 10, is_won: false, is_lost: false, sla_days: 5, color: '#3b82f6' },
  { name: 'Calificado', position: 3, probability: 20, is_won: false, is_lost: false, sla_days: 7, color: '#6366f1' },
  { name: 'Discovery', position: 4, probability: 30, is_won: false, is_lost: false, sla_days: 10, color: '#8b5cf6' },
  { name: 'Demo', position: 5, probability: 45, is_won: false, is_lost: false, sla_days: 14, color: '#a855f7' },
  { name: 'Propuesta', position: 6, probability: 60, is_won: false, is_lost: false, sla_days: 21, color: '#d946ef' },
  { name: 'Negociacion', position: 7, probability: 75, is_won: false, is_lost: false, sla_days: 30, color: '#ec4899' },
  { name: 'Contrato/pago', position: 8, probability: 90, is_won: false, is_lost: false, sla_days: 45, color: '#f43f5e' },
  { name: 'Ganado', position: 9, probability: 100, is_won: true, is_lost: false, sla_days: null, color: '#22c55e' },
  { name: 'Perdido', position: 10, probability: 0, is_won: false, is_lost: true, sla_days: null, color: '#ef4444' },
];

// Razones de pérdida globales por defecto
const DEFAULT_LOSS_REASONS: { code: string; label: string }[] = [
  { code: 'price', label: 'Precio demasiado alto' },
  { code: 'competitor', label: 'Competidor seleccionado' },
  { code: 'no_decision', label: 'Sin decisión / Proyecto congelado' },
  { code: 'no_budget', label: 'Sin presupuesto' },
  { code: 'no_need', label: 'Sin necesidad real' },
  { code: 'timing', label: 'Mal momento / Timing inadecuado' },
  { code: 'lost_contact', label: 'Pérdida de contacto' },
  { code: 'quality', label: 'Calidad insuficiente del producto/servicio' },
];

// Configuración de scoring por defecto
const DEFAULT_SCORING_CONFIG = {
  indicators: [
    {
      key: 'budget',
      label: 'Presupuesto confirmado',
      weight: 25,
      options: [
        { value: 'confirmed', score: 100 },
        { value: 'estimated', score: 50 },
        { value: 'unknown', score: 0 },
      ],
    },
    {
      key: 'authority',
      label: 'Autoridad del contacto',
      weight: 25,
      options: [
        { value: 'decision_maker', score: 100 },
        { value: 'influencer', score: 60 },
        { value: 'user', score: 30 },
        { value: 'unknown', score: 0 },
      ],
    },
    {
      key: 'need',
      label: 'Necesidad identificada',
      weight: 25,
      options: [
        { value: 'critical', score: 100 },
        { value: 'important', score: 70 },
        { value: 'nice_to_have', score: 40 },
        { value: 'none', score: 0 },
      ],
    },
    {
      key: 'timeline',
      label: 'Plazo de decisión',
      weight: 25,
      options: [
        { value: 'immediate', score: 100 },
        { value: 'short_term', score: 70 },
        { value: 'medium_term', score: 40 },
        { value: 'long_term', score: 10 },
      ],
    },
  ],
  bands: { cold: 40, warm: 70, hot: 100 },
};

class PipelineSeedService {
  /**
   * Crea el pipeline "Ventas B2B" con 10 etapas si no existe.
   * Idempotente: si ya existe un pipeline con ese nombre para la org, no hace nada.
   *
   * @param organizationId - ID de la organización
   * @returns ID del pipeline creado o existente
   */
  async seedDefaultPipeline(organizationId: number): Promise<string | null> {
    try {
      // 1. Verificar si ya existe un pipeline "Ventas B2B" para esta org
      const { data: existingPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('name', 'Ventas B2B')
        .maybeSingle();

      if (existingPipeline) {
        return (existingPipeline as PipelineRow).id;
      }

      // 2. Crear el pipeline
      const { data: pipeline, error: pipelineError } = await supabase
        .from('pipelines')
        .insert({
          organization_id: organizationId,
          name: 'Ventas B2B',
          is_default: true,
        })
        .select()
        .single();

      if (pipelineError) throw pipelineError;
      const pipelineData = pipeline as PipelineRow;
      const pipelineId = pipelineData.id;

      // 3. Crear las 10 etapas
      const stagesToInsert = DEFAULT_STAGES.map((stage) => ({
        pipeline_id: pipelineId,
        name: stage.name,
        position: stage.position,
        probability: stage.probability,
        is_won: stage.is_won,
        is_lost: stage.is_lost,
        sla_days: stage.sla_days,
        color: stage.color,
      }));

      const { error: stagesError } = await supabase
        .from('stages')
        .insert(stagesToInsert);

      if (stagesError) {
        console.warn('Advertencia creando etapas semilla:', stagesError.message);
      }

      return pipelineId;
    } catch (err) {
      console.error('Error en pipelineSeedService.seedDefaultPipeline:', err);
      throw err;
    }
  }

  /**
   * Inserta las etapas semilla (DEFAULT_STAGES) en un pipeline existente
   * si y solo si el pipeline no tiene etapas. Idempotente.
   *
   * @param pipelineId - ID del pipeline al que sembrar etapas
   * @returns true si se crearon etapas, false si ya existían
   */
  async seedDefaultStagesForPipeline(pipelineId: string): Promise<boolean> {
    try {
      // 1. Verificar si el pipeline ya tiene etapas
      const { data: existingStages, error: checkError } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .limit(1);

      if (checkError) throw checkError;

      // Si ya tiene etapas, no hacer nada
      if (existingStages && existingStages.length > 0) {
        return false;
      }

      // 2. Insertar las etapas semilla
      const stagesToInsert = DEFAULT_STAGES.map((stage) => ({
        pipeline_id: pipelineId,
        name: stage.name,
        position: stage.position,
        probability: stage.probability,
        is_won: stage.is_won,
        is_lost: stage.is_lost,
        sla_days: stage.sla_days,
        color: stage.color,
      }));

      const { error: stagesError } = await supabase
        .from('stages')
        .insert(stagesToInsert);

      if (stagesError) {
        console.warn('Advertencia creando etapas semilla para pipeline', pipelineId, ':', stagesError.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error en pipelineSeedService.seedDefaultStagesForPipeline:', err);
      throw err;
    }
  }

  /**
   * Inserta las razones de pérdida globales si no existen.
   * Idempotente: verifica por code antes de insertar cada una.
   */
  async seedLossReasons(): Promise<number> {
    try {
      let insertedCount = 0;

      for (const reason of DEFAULT_LOSS_REASONS) {
        // Verificar si ya existe una razón global con ese code
        const { data: existing } = await supabase
          .from('loss_reasons')
          .select('id')
          .is('organization_id', null)
          .eq('code', reason.code)
          .maybeSingle();

        if (existing) {
          continue;
        }

        const { error } = await supabase.from('loss_reasons').insert({
          organization_id: null,
          code: reason.code,
          label: reason.label,
          is_active: true,
          is_global: true,
        });

        if (error) {
          console.warn(`Advertencia creando razón de pérdida "${reason.code}":`, error.message);
        } else {
          insertedCount++;
        }
      }

      return insertedCount;
    } catch (err) {
      console.error('Error en pipelineSeedService.seedLossReasons:', err);
      throw err;
    }
  }

  /**
   * Crea la configuración default de scoring para una organización si no existe.
   * Idempotente: si ya existe config para la org, no hace nada.
   *
   * @param organizationId - ID de la organización
   * @returns ID de la config creada o existente
   */
  async seedScoringConfig(organizationId: number): Promise<string | null> {
    try {
      // 1. Verificar si ya existe config para esta org
      const { data: existing } = await supabase
        .from('scoring_configs')
        .select('id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existing) {
        return (existing as ScoringConfigRow).id;
      }

      // 2. Crear config default
      const { data, error } = await supabase
        .from('scoring_configs')
        .insert({
          organization_id: organizationId,
          config: DEFAULT_SCORING_CONFIG,
        })
        .select()
        .single();

      if (error) throw error;
      return (data as ScoringConfigRow).id;
    } catch (err) {
      console.error('Error en pipelineSeedService.seedScoringConfig:', err);
      throw err;
    }
  }
}

export const pipelineSeedService = new PipelineSeedService();
export default pipelineSeedService;
