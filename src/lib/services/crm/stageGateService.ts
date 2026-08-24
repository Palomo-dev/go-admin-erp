import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para evaluar exit_criteria de etapas contra oportunidades.
 *
 * Lee stages.exit_criteria que puede estar en dos formatos:
 * 1. Array simple de strings: ['Reunion agendada', 'Cotizacion enviada']
 * 2. JSONB estructurado: { requirements: [{ type: 'activity', minCount: 1 }, ...] }
 *
 * Soft-gate: devuelve info, no bloquea el movimiento de etapa.
 */

export type RequirementType = 'activity' | 'field' | 'quotation';

export interface StageRequirement {
  type: RequirementType;
  minCount?: number;
  field?: string;
  message?: string;
}

export interface ExitCriteria {
  requirements: StageRequirement[];
}

export interface StageGateResult {
  ok: boolean;
  missing: string[];
  evaluated: {
    type: RequirementType;
    passed: boolean;
    message: string;
  }[];
}

/**
 * Tipo para UI (ExitGatesEditor): etapa con criterios de salida estructurados.
 */
export interface StageWithCriteria {
  id: string;
  name: string;
  color: string | null;
  probability: number | null;
  position: number;
  exit_criteria: ExitCriteria | null;
}

interface OpportunityRow {
  id: string;
  customer_id: string | null;
  salesperson_id: string | null;
  amount: number | null;
  expected_close_date: string | null;
  [key: string]: unknown;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  related_id: string;
  related_type: string;
}

interface QuotationRow {
  id: string;
  opportunity_id: string | null;
}

interface StageRow {
  id: string;
  name: string;
  exit_criteria: unknown;
}

class StageGateService {
  private orgId: number;

  constructor(organizationId?: number) {
    this.orgId = organizationId ?? getOrganizationIdFromContext();
  }

  private getOrgId(): number {
    return this.orgId;
  }

  // ============== MÉTODOS PARA UI (ExitGatesEditor) ==============

  /**
   * Obtiene todas las etapas con sus exit_criteria de la organización.
   * Los exit_criteria se devuelven en formato estructurado { requirements: [...] }
   * para compatibilidad con la UI (ExitGatesEditor).
   */
  async getStagesWithExitCriteria(): Promise<StageWithCriteria[]> {
    try {
      const orgId = this.getOrgId();

      // Obtener pipelines de la org
      const { data: pipelines, error: pipelinesError } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId);

      if (pipelinesError || !pipelines || pipelines.length === 0) {
        return [];
      }

      const pipelineIds = pipelines.map((p) => (p as { id: string }).id);

      // Obtener etapas de esos pipelines
      const { data: stages, error: stagesError } = await supabase
        .from('stages')
        .select('id, name, color, probability, position, exit_criteria')
        .in('pipeline_id', pipelineIds)
        .order('position');

      if (stagesError || !stages) {
        return [];
      }

      return (stages as StageRow[]).map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: (stage as { color?: string | null }).color || null,
        probability: (stage as { probability?: number | null }).probability ?? null,
        position: (stage as { position?: number }).position ?? 0,
        exit_criteria: this.parseStructuredCriteria(stage.exit_criteria),
      }));
    } catch (err) {
      console.error('Error en stageGateService.getStagesWithExitCriteria:', err);
      return [];
    }
  }

  /**
   * Actualiza los exit_criteria de una etapa (formato estructurado ExitCriteria).
   */
  async updateExitCriteria(stageId: string, criteria: ExitCriteria): Promise<void> {
    try {
      const { error } = await supabase
        .from('stages')
        .update({
          exit_criteria: criteria as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stageId);

      if (error) throw error;
    } catch (err) {
      console.error('Error en stageGateService.updateExitCriteria:', err);
      throw err;
    }
  }

  /**
   * Convierte exit_criteria (que puede ser array de strings o JSONB estructurado)
   * a un array de strings para UI.
   */
  private parseExitCriteriaAsStrings(raw: unknown): string[] | null {
    if (!raw) return null;

    // Si es array de strings
    if (Array.isArray(raw)) {
      const strings = raw.filter((item) => typeof item === 'string');
      if (strings.length > 0) return strings;
      return null;
    }

    // Si es objeto con requirements (formato estructurado)
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as { requirements?: StageRequirement[] };
      if (obj.requirements && Array.isArray(obj.requirements)) {
        return obj.requirements.map((req) => req.message || `${req.type}: ${req.field || req.minCount || ''}`);
      }
    }

    return null;
  }

  // ============== MÉTODOS DEL SPEC (FASE 1) ==============

  /**
   * Evalúa los exit_criteria de una etapa contra una oportunidad.
   * @param opportunityId - ID de la oportunidad
   * @param stageId - ID de la etapa destino
   * @returns { ok, missing, evaluated } - Soft-gate: info, no bloquea
   */
  async evaluateStageGate(
    opportunityId: string,
    stageId: string
  ): Promise<StageGateResult> {
    try {
      // 1. Obtener la etapa con exit_criteria
      const { data: stage, error: stageError } = await supabase
        .from('stages')
        .select('id, name, exit_criteria')
        .eq('id', stageId)
        .single();

      if (stageError || !stage) {
        return {
          ok: true,
          missing: [],
          evaluated: [],
        };
      }

      const stageData = stage as StageRow;
      const criteria = this.parseStructuredCriteria(stageData.exit_criteria);

      if (!criteria || !criteria.requirements || criteria.requirements.length === 0) {
        // Si no hay criterios estructurados, verificar si hay array de strings
        const stringCriteria = this.parseExitCriteriaAsStrings(stageData.exit_criteria);
        if (!stringCriteria || stringCriteria.length === 0) {
          return { ok: true, missing: [], evaluated: [] };
        }
        // Para strings simples, no se puede evaluar automáticamente — retornar ok
        return { ok: true, missing: [], evaluated: [] };
      }

      // 2. Obtener la oportunidad
      const { data: opportunity, error: oppError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single();

      if (oppError || !opportunity) {
        return {
          ok: false,
          missing: ['Oportunidad no encontrada'],
          evaluated: [],
        };
      }

      const oppData = opportunity as OpportunityRow;

      // 3. Obtener actividades de la oportunidad
      const { data: activities } = await supabase
        .from('activities')
        .select('id, activity_type, related_id, related_type')
        .eq('related_id', opportunityId)
        .eq('related_type', 'opportunity');

      const activitiesData = (activities || []) as ActivityRow[];

      // 4. Evaluar cada requisito
      const evaluated: StageGateResult['evaluated'] = [];
      const missing: string[] = [];

      for (const req of criteria.requirements) {
        const result = await this.evaluateRequirement(req, oppData, activitiesData, opportunityId);
        evaluated.push({
          type: req.type,
          passed: result.passed,
          message: result.message,
        });
        if (!result.passed) {
          missing.push(result.message);
        }
      }

      return {
        ok: missing.length === 0,
        missing,
        evaluated,
      };
    } catch (err) {
      console.error('Error en stageGateService.evaluateStageGate:', err);
      return {
        ok: true, // Soft-gate: en caso de error, no bloquear
        missing: [],
        evaluated: [],
      };
    }
  }

  /**
   * Intenta parsear exit_criteria como objeto estructurado { requirements: [...] }.
   * Retorna null si no tiene ese formato.
   */
  private parseStructuredCriteria(raw: unknown): ExitCriteria | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as { requirements?: StageRequirement[] };
    if (obj.requirements && Array.isArray(obj.requirements)) {
      return { requirements: obj.requirements };
    }
    return null;
  }

  /**
   * Evalúa un requisito individual contra la oportunidad y sus actividades.
   */
  private async evaluateRequirement(
    req: StageRequirement,
    opportunity: OpportunityRow,
    activities: ActivityRow[],
    opportunityId: string
  ): Promise<{ passed: boolean; message: string }> {
    const defaultMessage = req.message || `Requisito no cumplido: ${req.type}`;

    switch (req.type) {
      case 'activity': {
        const minCount = req.minCount ?? 1;
        const count = activities.length;
        const passed = count >= minCount;
        return {
          passed,
          message: passed
            ? `Actividades: ${count} (mínimo ${minCount})`
            : defaultMessage || `Se requieren al menos ${minCount} actividad(es)`,
        };
      }

      case 'field': {
        if (!req.field) {
          return { passed: true, message: 'Campo no especificado' };
        }
        const value = opportunity[req.field];
        const passed = value !== null && value !== undefined && value !== '';
        return {
          passed,
          message: passed
            ? `Campo ${req.field}: completado`
            : defaultMessage || `Campo requerido: ${req.field}`,
        };
      }

      case 'quotation': {
        try {
          const { data: quotations, error } = await supabase
            .from('quotations')
            .select('id, opportunity_id')
            .eq('opportunity_id', opportunityId);

          if (error) {
            return { passed: true, message: 'Verificación de cotización omitida' };
          }

          const quotationData = (quotations || []) as QuotationRow[];
          const passed = quotationData.length > 0;
          return {
            passed,
            message: passed
              ? `Cotizaciones vinculadas: ${quotationData.length}`
              : defaultMessage || 'Requiere cotización vinculada',
          };
        } catch {
          return { passed: true, message: 'Verificación de cotización omitida' };
        }
      }

      default:
        return { passed: true, message: `Tipo de requisito desconocido: ${req.type}` };
    }
  }
}

export const stageGateService = new StageGateService();
export default StageGateService;
