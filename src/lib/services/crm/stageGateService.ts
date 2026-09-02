import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/utils/orgId';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM para evaluar exit_criteria de etapas contra oportunidades.
 *
 * Lee stages.exit_criteria que puede estar en dos formatos:
 * 1. Array simple de strings: ['Reunion agendada', 'Cotizacion enviada']
 * 2. JSONB estructurado: { requirements: [{ type: 'activity', minCount: 1 }, ...] }
 * 3. JSONB plano F2: { required_fields, required_customer_fields, required_activities,
 *    require_discovery, require_quotation, min_score, min_icp_band,
 *    require_next_contact, custom_checks }
 *
 * Soft-gate: devuelve info, no bloquea el movimiento de etapa.
 */

export type RequirementType =
  | 'field'
  | 'customer_field'
  | 'activity'
  | 'discovery'
  | 'quotation'
  | 'score'
  | 'icp_band'
  | 'next_contact'
  | 'custom';

export interface StageRequirement {
  type: RequirementType;
  minCount?: number;
  field?: string;
  message?: string;
  // Campos adicionales para los nuevos tipos (formato requirements[])
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'not_null' | 'in';
  value?: unknown;
  allowedValues?: string[];
  minScore?: number;
  maxDays?: number;
  requiredKeys?: string[];
  label?: string;
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
 * Resultado de gate F2 con missing[] tipado { type, label, detail }.
 * Compatible con GateWarningDialog (que consume missing como string[]).
 */
export interface GateMissing {
  type: RequirementType;
  label: string;
  detail: string;
}

export interface GateResult {
  ok: boolean;
  missing: GateMissing[];
}

/**
 * Parámetros para evaluateStageGate (firma extendida F2).
 */
export interface EvaluateStageGateParams {
  opportunityId: string;
  targetStageId: string;
}

/**
 * Estructura del exit_criteria plano F2 (formato alternativo al requirements[]).
 */
interface FlatCriteria {
  required_fields?: string[];
  required_customer_fields?: string[];
  required_activities?: Array<{ type: string; count: number }>;
  require_discovery?: boolean;
  require_quotation?: boolean;
  min_score?: number;
  min_icp_band?: 'A' | 'B' | 'C';
  require_next_contact?: boolean;
  max_last_contact_days?: number;
  custom_checks?: Array<{
    field: string;
    operator: 'not_null' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
    value?: unknown;
    label: string;
  }>;
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
   * Soporta los 9 tipos de F2 en el formato requirements[].
   */
  private async evaluateRequirement(
    req: StageRequirement,
    opportunity: OpportunityRow,
    activities: ActivityRow[],
    opportunityId: string
  ): Promise<{ passed: boolean; message: string }> {
    const defaultMessage = req.message || req.label || `Requisito no cumplido: ${req.type}`;

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

      case 'customer_field': {
        if (!req.field) {
          return { passed: true, message: 'Campo de cliente no especificado' };
        }
        try {
          const customer = await this.loadCustomer(opportunity.customer_id);
          if (!customer) {
            return { passed: false, message: defaultMessage || `Cliente no vinculado para verificar ${req.field}` };
          }
          const value = (customer as Record<string, unknown>)[req.field];
          const passed = value !== null && value !== undefined && value !== '';
          return {
            passed,
            message: passed
              ? `Campo cliente ${req.field}: completado`
              : defaultMessage || `Campo de cliente requerido: ${req.field}`,
          };
        } catch {
          return { passed: true, message: 'Verificación de campo de cliente omitida' };
        }
      }

      case 'discovery': {
        const dd = (opportunity.discovery_data as Record<string, unknown> | null) || {};
        const requiredKeys = req.requiredKeys;
        if (requiredKeys && requiredKeys.length > 0) {
          const missingKeys = requiredKeys.filter((k) => !dd[k]);
          const passed = missingKeys.length === 0;
          return {
            passed,
            message: passed
              ? 'Discovery: secciones requeridas completas'
              : defaultMessage || `Discovery incompleto: faltan ${missingKeys.join(', ')}`,
          };
        }
        // Fallback: usar completed_sections / total_sections
        const completed = Number(dd.completed_sections || 0);
        const total = Number(dd.total_sections || 0);
        const passed = total > 0 && completed >= total;
        return {
          passed,
          message: passed
            ? `Discovery completo (${completed}/${total})`
            : defaultMessage || `Discovery incompleto (${completed}/${total} secciones)`,
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

      case 'score': {
        const minScore = req.minScore ?? 0;
        const scoreTotal = Number(opportunity.score_total || 0);
        const passed = scoreTotal >= minScore;
        return {
          passed,
          message: passed
            ? `Score: ${scoreTotal} (mínimo ${minScore})`
            : defaultMessage || `Score ${scoreTotal} < mínimo ${minScore}`,
        };
      }

      case 'icp_band': {
        const allowed = req.allowedValues || ['A', 'B'];
        const band = (opportunity.icp_band as string | null) || null;
        const passed = band !== null && allowed.includes(band);
        return {
          passed,
          message: passed
            ? `ICP: ${band} (permitidos ${allowed.join(', ')})`
            : defaultMessage || `ICP ${band ?? '—'} no cumple bandas permitidas ${allowed.join(', ')}`,
        };
      }

      case 'next_contact': {
        const nextContact = opportunity.next_contact_at as string | null;
        const maxDays = req.maxDays;
        if (maxDays !== undefined) {
          // Verifica que last_contact_at no sea más antiguo que maxDays días
          const lastContact = opportunity.last_contact_at as string | null;
          if (!lastContact) {
            return { passed: false, message: defaultMessage || 'Sin registro de último contacto' };
          }
          const daysSince = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
          const passed = daysSince <= maxDays;
          return {
            passed,
            message: passed
              ? `Último contacto hace ${daysSince}d (máx ${maxDays}d)`
              : defaultMessage || `Último contacto hace ${daysSince}d (máx ${maxDays}d)`,
          };
        }
        const passed = nextContact !== null && nextContact !== undefined;
        return {
          passed,
          message: passed
            ? 'Próximo contacto programado'
            : defaultMessage || 'No hay próximo contacto programado',
        };
      }

      case 'custom': {
        if (!req.field) {
          return { passed: true, message: 'Campo custom no especificado' };
        }
        const value = resolveNestedField(opportunity, req.field);
        const operator = req.operator || 'not_null';
        const passed = evalCustomOperator(value, operator, req.value);
        return {
          passed,
          message: passed
            ? `Custom ${req.field}: ok`
            : defaultMessage || `Condición custom no cumplida: ${req.field} ${operator}`,
        };
      }

      default:
        return { passed: true, message: `Tipo de requisito desconocido: ${req.type}` };
    }
  }

  /**
   * Carga un cliente por id (helper reutilizable).
   */
  private async loadCustomer(customerId: string | null): Promise<Record<string, unknown> | null> {
    if (!customerId) return null;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();
      if (error || !data) return null;
      return data as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Wrapper público de evaluateRequirement para uso desde evaluateStageGate (F2).
   * Permite reutilizar la lógica de los 9 tipos con el formato requirements[].
   */
  async evaluateRequirementPublic(
    req: StageRequirement,
    opportunity: OpportunityRow,
    activities: ActivityRow[],
    opportunityId: string
  ): Promise<{ passed: boolean; message: string }> {
    return this.evaluateRequirement(req, opportunity, activities, opportunityId);
  }
}

// ============== FUNCIÓN F2 (firma extendida) ==============

/**
 * Resuelve un campo anidado en un objeto (soporta notación punto: 'a.b.c').
 */
function resolveNestedField(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Evalúa un operador custom contra un valor.
 */
function evalCustomOperator(
  value: unknown,
  operator: string,
  expected: unknown
): boolean {
  switch (operator) {
    case 'not_null':
      return value !== null && value !== undefined && value !== '';
    case 'eq':
      return value === expected;
    case 'neq':
      return value !== expected;
    case 'gt':
      return Number(value) > Number(expected);
    case 'gte':
      return Number(value) >= Number(expected);
    case 'lt':
      return Number(value) < Number(expected);
    case 'lte':
      return Number(value) <= Number(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(value);
    default:
      return true;
  }
}

/**
 * Parsea exit_criteria en formato plano F2 (FlatCriteria).
 * Retorna null si no tiene ese formato.
 */
function parseFlatCriteria(raw: unknown): FlatCriteria | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  // Detectar formato plano F2: alguna de las keys conocidas presente
  const flatKeys = [
    'required_fields',
    'required_customer_fields',
    'required_activities',
    'require_discovery',
    'require_quotation',
    'min_score',
    'min_icp_band',
    'require_next_contact',
    'max_last_contact_days',
    'custom_checks',
  ];
  const hasFlatKey = flatKeys.some((k) => k in obj);
  if (!hasFlatKey) return null;
  return obj as unknown as FlatCriteria;
}

const ICP_BAND_PRIORITY: Record<string, number> = { A: 1, B: 2, C: 3 };

/**
 * Evalúa los exit_criteria de una etapa contra una oportunidad (firma F2).
 *
 * Soporta dos formatos de exit_criteria:
 *  - Plano F2: { required_fields, required_customer_fields, required_activities,
 *    require_discovery, require_quotation, min_score, min_icp_band,
 *    require_next_contact, max_last_contact_days, custom_checks }
 *  - Estructurado: { requirements: [{ type, ... }] } (compatible con ExitGatesEditor)
 *
 * @param supabaseClient - Cliente Supabase inyectado
 * @param organizationId - ID de la organización
 * @param params - { opportunityId, targetStageId }
 * @returns GateResult con missing[] tipado { type, label, detail }
 */
export async function evaluateStageGate(
  supabaseClient: SupabaseClient,
  organizationId: number,
  params: EvaluateStageGateParams
): Promise<GateResult> {
  const missing: GateMissing[] = [];

  try {
    // 1. Cargar la etapa destino con exit_criteria
    const { data: stage, error: stageError } = await supabaseClient
      .from('stages')
      .select('exit_criteria, pipeline_id')
      .eq('id', params.targetStageId)
      .single();

    if (stageError || !stage) {
      // Sin etapa, no se puede evaluar → gate abierto
      return { ok: true, missing: [] };
    }

    const stageData = stage as { exit_criteria: unknown };
    const rawCriteria = stageData.exit_criteria;

    // 2. Cargar la oportunidad + cliente
    const { data: oppRow, error: oppError } = await supabaseClient
      .from('opportunities')
      .select('*, customers(*)')
      .eq('id', params.opportunityId)
      .single();

    if (oppError || !oppRow) {
      missing.push({
        type: 'field',
        label: 'Oportunidad',
        detail: 'Oportunidad no encontrada',
      });
      return { ok: false, missing };
    }

    const opp = oppRow as Record<string, unknown>;
    const customer = (opp.customers as Record<string, unknown> | null) ?? null;

    // 3. Intentar formato plano F2 primero
    const flat = parseFlatCriteria(rawCriteria);

    if (flat) {
      return evaluateFlatCriteria(
        supabaseClient,
        organizationId,
        params,
        flat,
        opp,
        customer
      );
    }

    // 4. Formato estructurado { requirements: [...] }
    const structured = parseStructuredCriteriaExported(rawCriteria);
    if (structured && structured.requirements.length > 0) {
      // Cargar actividades una sola vez
      const { data: activities } = await supabaseClient
        .from('activities')
        .select('id, activity_type, related_id, related_type')
        .eq('related_id', params.opportunityId)
        .eq('related_type', 'opportunity');
      const activitiesData = (activities || []) as ActivityRow[];

      const service = new StageGateService(organizationId);
      for (const req of structured.requirements) {
        const result = await service.evaluateRequirementPublic(
          req,
          opp as OpportunityRow,
          activitiesData,
          params.opportunityId
        );
        if (!result.passed) {
          missing.push({
            type: req.type,
            label: req.label || req.field || req.type,
            detail: result.message,
          });
        }
      }
      return { ok: missing.length === 0, missing };
    }

    // 5. Array de strings o vacío → gate abierto
    return { ok: true, missing: [] };
  } catch (err) {
    console.error('Error en evaluateStageGate (F2):', err);
    // Soft-gate: en caso de error, no bloquear
    return { ok: true, missing: [] };
  }
}

/**
 * Evalúa criterios en formato plano F2.
 */
async function evaluateFlatCriteria(
  supabaseClient: SupabaseClient,
  organizationId: number,
  params: EvaluateStageGateParams,
  criteria: FlatCriteria,
  opp: Record<string, unknown>,
  customer: Record<string, unknown> | null
): Promise<GateResult> {
  const missing: GateMissing[] = [];

  // required_fields (campos en opportunity)
  if (criteria.required_fields) {
    for (const field of criteria.required_fields) {
      const value = opp[field];
      if (value === null || value === undefined || value === '') {
        missing.push({
          type: 'field',
          label: field,
          detail: `Falta ${field} en la oportunidad`,
        });
      }
    }
  }

  // required_customer_fields (campos en customer)
  if (criteria.required_customer_fields) {
    if (!customer) {
      missing.push({
        type: 'customer_field',
        label: 'Cliente',
        detail: 'No hay cliente vinculado a la oportunidad',
      });
    } else {
      for (const field of criteria.required_customer_fields) {
        const value = customer[field];
        if (value === null || value === undefined || value === '') {
          missing.push({
            type: 'customer_field',
            label: field,
            detail: `Falta ${field} en el cliente`,
          });
        }
      }
    }
  }

  // required_activities (count por tipo)
  if (criteria.required_activities) {
    for (const req of criteria.required_activities) {
      try {
        const { count, error } = await supabaseClient
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('related_type', 'opportunity')
          .eq('related_id', params.opportunityId)
          .eq('activity_type', req.type);
        if (error) continue;
        const c = count ?? 0;
        if (c < req.count) {
          missing.push({
            type: 'activity',
            label: req.type,
            detail: `Faltan ${req.count - c} actividades de tipo ${req.type}`,
          });
        }
      } catch {
        // omitir verificación si falla
      }
    }
  }

  // require_discovery
  if (criteria.require_discovery) {
    const dd = (opp.discovery_data as Record<string, unknown> | null) || {};
    const completed = Number(dd.completed_sections || 0);
    const total = Number(dd.total_sections || 0);
    if (total === 0 || completed < total) {
      missing.push({
        type: 'discovery',
        label: 'Discovery',
        detail: `Discovery incompleto (${completed}/${total} secciones)`,
      });
    }
  }

  // require_quotation
  if (criteria.require_quotation) {
    try {
      const { count, error } = await supabaseClient
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('opportunity_id', params.opportunityId);
      if (!error && (count ?? 0) === 0) {
        missing.push({
          type: 'quotation',
          label: 'Cotización',
          detail: 'No hay cotización vinculada',
        });
      }
    } catch {
      // omitir
    }
  }

  // min_score
  if (criteria.min_score !== undefined) {
    const scoreTotal = Number(opp.score_total || 0);
    if (scoreTotal < criteria.min_score) {
      missing.push({
        type: 'score',
        label: 'Score',
        detail: `Score ${scoreTotal} < mínimo ${criteria.min_score}`,
      });
    }
  }

  // min_icp_band
  if (criteria.min_icp_band) {
    const band = (opp.icp_band as string | null) || null;
    const bandPrio = band ? ICP_BAND_PRIORITY[band] : undefined;
    const minPrio = ICP_BAND_PRIORITY[criteria.min_icp_band];
    if (bandPrio === undefined || minPrio === undefined || bandPrio > minPrio) {
      missing.push({
        type: 'icp_band',
        label: 'ICP',
        detail: `ICP ${band ?? '—'} no cumple mínimo ${criteria.min_icp_band}`,
      });
    }
  }

  // require_next_contact
  if (criteria.require_next_contact) {
    const nextContact = opp.next_contact_at as string | null;
    if (!nextContact) {
      missing.push({
        type: 'next_contact',
        label: 'Próximo contacto',
        detail: 'No hay próximo contacto programado',
      });
    }
  }

  // max_last_contact_days (last_contact_at no más antiguo que X días)
  if (criteria.max_last_contact_days !== undefined) {
    const lastContact = opp.last_contact_at as string | null;
    if (!lastContact) {
      missing.push({
        type: 'next_contact',
        label: 'Último contacto',
        detail: 'Sin registro de último contacto',
      });
    } else {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastContact).getTime()) / 86400000
      );
      if (daysSince > criteria.max_last_contact_days) {
        missing.push({
          type: 'next_contact',
          label: 'Último contacto',
          detail: `Último contacto hace ${daysSince}d (máx ${criteria.max_last_contact_days}d)`,
        });
      }
    }
  }

  // custom_checks
  if (criteria.custom_checks) {
    for (const check of criteria.custom_checks) {
      const value = resolveNestedField(opp, check.field);
      if (!evalCustomOperator(value, check.operator, check.value)) {
        missing.push({
          type: 'custom',
          label: check.label,
          detail: check.label,
        });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Versión exportada de parseStructuredCriteria para uso en evaluateStageGate.
 */
function parseStructuredCriteriaExported(raw: unknown): ExitCriteria | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { requirements?: StageRequirement[] };
  if (obj.requirements && Array.isArray(obj.requirements)) {
    return { requirements: obj.requirements };
  }
  return null;
}

export const stageGateService = new StageGateService();
export default StageGateService;
