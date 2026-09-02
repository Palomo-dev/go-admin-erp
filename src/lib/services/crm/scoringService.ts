import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/utils/orgId';

/**
 * Servicio CRM para calcular el score GOC (Grado de Oportunidad Comercial) desde scoring_configs.
 * Tabla: scoring_configs (id, organization_id, config JSONB, created_at, updated_at)
 *
 * Estructura de config (JSONB):
 * {
 *   indicators: [{ key, label, weight, options: [{ value, label, score }] }],
 *   bands: { cold: { min, max }, warm: { min, max }, hot: { min, max } }
 * }
 */

export type Temperature = 'cold' | 'warm' | 'hot';

export interface ScoringOption {
  value: string;
  label: string;
  score: number;
}

export interface ScoringIndicator {
  key: string;
  label: string;
  weight: number;
  options: ScoringOption[];
}

export interface ScoringBand {
  min: number;
  max: number;
}

export interface ScoringBands {
  cold: ScoringBand;
  warm: ScoringBand;
  hot: ScoringBand;
}

export interface ScoringConfig {
  id?: string;
  organization_id?: number;
  indicators: ScoringIndicator[];
  bands: ScoringBands;
  updated_at?: string;
  created_at?: string;
}

export interface ScoreAnswer {
  key: string;
  value: string;
}

export interface ScoreResult {
  score_total: number;
  temperature: Temperature;
  details: {
    key: string;
    label: string;
    weight: number;
    selectedValue: string;
    score: number;
    weightedScore: number;
  }[];
}

// ---------------------------------------------------------------------------
// Schema GOC canónico (F1) — dimensions + bands (5 bandas)
// ---------------------------------------------------------------------------

/** Operadores soportados para los criteria de scoring GOC. */
export type ScoringOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'lte_days';

/** Un criterio individual dentro de una dimensión de scoring. */
export interface ScoringCriterion {
  field: string;
  operator: ScoringOperator;
  value: unknown;
  points: number;
}

/** Una dimensión de scoring GOC (go_fit, opportunity, capacity, timing). */
export interface ScoringDimension {
  label: string;
  weight: number;
  criteria: ScoringCriterion[];
}

/** Banda de scoring GOC (5 bandas canónicas). */
export interface GOCBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

/** Configuración de scoring GOC canónica. */
export interface GOCScoringConfig {
  id?: string;
  organization_id?: number;
  dimensions: Record<'go_fit' | 'opportunity' | 'capacity' | 'timing', ScoringDimension>;
  bands: GOCBand[];
  updated_at?: string;
  created_at?: string;
}

/** Resultado del cálculo GOC. */
export interface GOCScoreResult {
  score_total: number;
  band: GOCBand | null;
  bandLabel: string;
  bandColor: string;
  dimensionScores: {
    key: string;
    label: string;
    score: number;
    maxScore: number;
  }[];
}

/** Contexto de evaluación: oportunidad + cliente relacionados. */
export interface GOCScoreContext {
  opportunity: Record<string, unknown>;
  customer?: Record<string, unknown> | null;
}

class ScoringService {
  private orgId: number;

  constructor(organizationId?: number) {
    this.orgId = organizationId ?? getOrganizationIdFromContext();
  }

  private getOrgId(): number {
    return this.orgId;
  }

  /**
   * Obtiene la configuración de scoring de la organización actual.
   * Si no existe, retorna null.
   */
  async getConfig(): Promise<ScoringConfig | null> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('scoring_configs')
        .select('*')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Advertencia obteniendo scoring config:', error.message);
        return null;
      }
      if (!data) return null;

      // El campo config es JSONB; aplanar a ScoringConfig
      const row = data as { id: string; organization_id: number; config: ScoringConfig; created_at: string; updated_at: string };
      const config = row.config;
      return {
        id: row.id,
        organization_id: row.organization_id,
        indicators: config?.indicators || [],
        bands: config?.bands || { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } },
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (err) {
      console.warn('Error en scoringService.getConfig:', err);
      return null;
    }
  }

  /**
   * Guarda (upsert) la configuración de scoring de la organización.
   */
  async saveConfig(config: ScoringConfig): Promise<ScoringConfig | null> {
    try {
      const orgId = this.getOrgId();

      // Construir el objeto JSONB a guardar (solo indicators + bands)
      const configJson = {
        indicators: config.indicators,
        bands: config.bands,
      };

      // Si tiene id, actualizar
      if (config.id) {
        const { data, error } = await supabase
          .from('scoring_configs')
          .update({
            config: configJson as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
          .select()
          .single();

        if (error) throw error;
        const row = data as { id: string; organization_id: number; config: ScoringConfig; created_at: string; updated_at: string };
        return {
          id: row.id,
          organization_id: row.organization_id,
          indicators: row.config?.indicators || config.indicators,
          bands: row.config?.bands || config.bands,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }

      // Verificar si ya existe una config para esta org (upsert por organization_id)
      const { data: existing } = await supabase
        .from('scoring_configs')
        .select('id')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('scoring_configs')
          .update({
            config: configJson as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as { id: string }).id)
          .select()
          .single();

        if (error) throw error;
        const row = data as { id: string; organization_id: number; config: ScoringConfig; created_at: string; updated_at: string };
        return {
          id: row.id,
          organization_id: row.organization_id,
          indicators: row.config?.indicators || config.indicators,
          bands: row.config?.bands || config.bands,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }

      // Crear nueva
      const { data, error } = await supabase
        .from('scoring_configs')
        .insert({
          organization_id: orgId,
          config: configJson as unknown as Record<string, unknown>,
        })
        .select()
        .single();

      if (error) throw error;
      const row = data as { id: string; organization_id: number; config: ScoringConfig; created_at: string; updated_at: string };
      return {
        id: row.id,
        organization_id: row.organization_id,
        indicators: row.config?.indicators || config.indicators,
        bands: row.config?.bands || config.bands,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (err) {
      console.error('Error en scoringService.saveConfig:', err);
      throw err;
    }
  }

  /**
   * Calcula el score total desde las respuestas + pesos de la configuración.
   * @param answers - Array de respuestas { key, value }
   * @param config - Configuración de scoring (opcional, se obtiene si no se pasa)
   * @returns Resultado del score con detalles por indicador
   */
  async calculateScore(
    answers: ScoreAnswer[],
    config?: ScoringConfig | null
  ): Promise<ScoreResult> {
    try {
      let scoringConfig: ScoringConfig | null = config || null;

      if (!scoringConfig) {
        scoringConfig = await this.getConfig();
      }

      if (!scoringConfig || !scoringConfig.indicators || scoringConfig.indicators.length === 0) {
        return {
          score_total: 0,
          temperature: 'cold',
          details: [],
        };
      }

      const answerMap = new Map<string, string>();
      for (const answer of answers) {
        answerMap.set(answer.key, answer.value);
      }

      const details: ScoreResult['details'] = [];
      let totalWeight = 0;
      let totalWeightedScore = 0;

      for (const indicator of scoringConfig.indicators) {
        const selectedValue = answerMap.get(indicator.key);
        const option = indicator.options.find((opt) => opt.value === selectedValue);
        const score = option?.score ?? 0;
        const weight = indicator.weight ?? 0;

        // Score ponderado: (score / maxScore) * weight
        // maxScore se asume 3 (escala típica 0-3) si no se puede determinar
        const maxScore = Math.max(...indicator.options.map((o) => o.score), 1);
        const normalizedScore = (score / maxScore) * 100;
        const weightedScore = (normalizedScore / 100) * weight;

        details.push({
          key: indicator.key,
          label: indicator.label,
          weight,
          selectedValue: selectedValue || '',
          score,
          weightedScore,
        });

        totalWeight += weight;
        totalWeightedScore += weightedScore;
      }

      // Score total normalizado a 100
      const scoreTotal = totalWeight > 0
        ? Math.round((totalWeightedScore / totalWeight) * 100)
        : 0;

      const temperature = this.deriveTemperature(scoreTotal, scoringConfig.bands);

      return {
        score_total: scoreTotal,
        temperature,
        details,
      };
    } catch (err) {
      console.error('Error en scoringService.calculateScore:', err);
      return {
        score_total: 0,
        temperature: 'cold',
        details: [],
      };
    }
  }

  /**
   * Deriva la temperatura (cold/warm/hot) desde el score y las bandas configuradas.
   * @param score - Score total (0-100)
   * @param bands - Bandas { cold: {min,max}, warm: {min,max}, hot: {min,max} }
   * @returns 'cold' | 'warm' | 'hot'
   */
  deriveTemperature(score: number, bands?: ScoringBands): Temperature {
    if (!bands) {
      // Bandas por defecto
      if (score >= 67) return 'hot';
      if (score >= 34) return 'warm';
      return 'cold';
    }

    // Evaluar bandas en orden: hot → warm → cold
    if (bands.hot && score >= bands.hot.min) return 'hot';
    if (bands.warm && score >= bands.warm.min) return 'warm';
    return 'cold';
  }

  // -------------------------------------------------------------------------
  // Schema GOC canónico (F1)
  // -------------------------------------------------------------------------

  /**
   * Resuelve el valor de un campo desde el contexto (opportunity / customer).
   * Soporta notación con punto (ej. "customers.company_size", "opportunities.amount")
   * y campos planos de opportunity (ej. "amount", "record_type", "expected_close_date").
   */
  private resolveFieldValue(field: string, ctx: GOCScoreContext): unknown {
    const parts = field.split('.');
    let current: unknown = ctx;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      // Mapear prefijos de tabla al objeto correspondiente
      if ((part === 'customers' || part === 'customer') && ctx.customer) {
        current = ctx.customer;
        continue;
      }
      if ((part === 'opportunities' || part === 'opportunity') && ctx.opportunity) {
        current = ctx.opportunity;
        continue;
      }
      current = (current as Record<string, unknown>)[part];
    }

    // Si no se encontró y es un campo plano, buscar en opportunity primero, luego customer
    if (current === undefined && !field.includes('.')) {
      if (ctx.opportunity && ctx.opportunity[field as keyof typeof ctx.opportunity] !== undefined) {
        return ctx.opportunity[field as keyof typeof ctx.opportunity];
      }
      if (ctx.customer && ctx.customer[field as keyof typeof ctx.customer] !== undefined) {
        return ctx.customer[field as keyof typeof ctx.customer];
      }
    }

    return current;
  }

  /**
   * Evalúa un criterio individual contra el contexto.
   * Retorna true si el criterio se cumple (suma points).
   */
  private evaluateCriterion(criterion: ScoringCriterion, ctx: GOCScoreContext): boolean {
    const fieldValue = this.resolveFieldValue(criterion.field, ctx);
    const { operator, value } = criterion;

    // Si el campo no existe, el criterio no se cumple
    if (fieldValue === undefined || fieldValue === null) return false;

    switch (operator) {
      case 'eq':
        return fieldValue === value;

      case 'neq':
        return fieldValue !== value;

      case 'gt':
        return Number(fieldValue) > Number(value);

      case 'gte':
        return Number(fieldValue) >= Number(value);

      case 'lt':
        return Number(fieldValue) < Number(value);

      case 'lte':
        return Number(fieldValue) <= Number(value);

      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);

      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue);

      case 'contains':
        return String(fieldValue).includes(String(value));

      case 'starts_with':
        return String(fieldValue).startsWith(String(value));

      case 'lte_days': {
        // Días hasta la fecha del campo (ej. expected_close_date)
        const dateValue = new Date(String(fieldValue));
        if (Number.isNaN(dateValue.getTime())) return false;
        const now = new Date();
        const diffMs = dateValue.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return diffDays <= Number(value);
      }

      default:
        return false;
    }
  }

  /**
   * Determina la banda GOC correspondiente a un score total.
   * @param score - Score total (0-100)
   * @param bands - Array de bandas (5 bandas canónicas)
   */
  private resolveGOCBand(score: number, bands: GOCBand[]): GOCBand | null {
    if (!bands || bands.length === 0) return null;
    // Ordenar por min ascendente y tomar la primera banda cuyo rango contiene el score
    const sorted = [...bands].sort((a, b) => a.min - b.min);
    return sorted.find((b) => score >= b.min && score <= b.max) ?? sorted[sorted.length - 1];
  }

  /**
   * Calcula el score GOC canónico desde una config de dimensions + bands.
   *
   * - Evalúa cada dimensión (go_fit, opportunity, capacity, timing).
   * - Para cada criterion, verifica field + operator + value y suma points.
   * - Suma points por dimensión, multiplica por weight, total 0-100.
   * - Determina la banda según el array de bands.
   *
   * @param params.config - Configuración GOC (dimensions + bands)
   * @param params.opportunity - Objeto oportunidad (campos a evaluar)
   * @param params.customer - Cliente relacionado (opcional, para campos "customers.*")
   */
  calculateGOCScore(params: {
    config: GOCScoringConfig;
    opportunity: Record<string, unknown>;
    customer?: Record<string, unknown> | null;
  }): GOCScoreResult {
    const { config, opportunity, customer } = params;
    const ctx: GOCScoreContext = { opportunity, customer: customer ?? null };

    const dimensionScores: GOCScoreResult['dimensionScores'] = [];
    let totalWeighted = 0;
    let totalWeight = 0;

    const dimensionKeys: Array<'go_fit' | 'opportunity' | 'capacity' | 'timing'> = [
      'go_fit',
      'opportunity',
      'capacity',
      'timing',
    ];

    for (const key of dimensionKeys) {
      const dimension = config.dimensions?.[key];
      if (!dimension) continue;

      const weight = dimension.weight ?? 0;
      // Sumar points de los criteria que se cumplen
      let dimensionPoints = 0;
      // maxScore = suma de todos los points posibles de la dimensión
      let maxPoints = 0;

      for (const criterion of dimension.criteria || []) {
        maxPoints += criterion.points ?? 0;
        if (this.evaluateCriterion(criterion, ctx)) {
          dimensionPoints += criterion.points ?? 0;
        }
      }

      // Normalizar points a 0-100 dentro de la dimensión
      const normalized = maxPoints > 0 ? (dimensionPoints / maxPoints) * 100 : 0;
      // Ponderar por weight
      const weighted = (normalized / 100) * weight;

      dimensionScores.push({
        key,
        label: dimension.label ?? key,
        score: Math.round(normalized),
        maxScore: 100,
      });

      totalWeighted += weighted;
      totalWeight += weight;
    }

    // Score total normalizado a 100
    const scoreTotal = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) : 0;

    const band = this.resolveGOCBand(scoreTotal, config.bands || []);

    return {
      score_total: scoreTotal,
      band,
      bandLabel: band?.label ?? '',
      bandColor: band?.color ?? '',
      dimensionScores,
    };
  }
}

// ---------------------------------------------------------------------------
// Funciones helper exportadas (schema GOC canónico)
// ---------------------------------------------------------------------------

/**
 * Retorna el config GOC por defecto según el doc F1 (schema canónico).
 * 4 dimensiones (go_fit, opportunity, capacity, timing) + 5 bandas.
 */
export function getDefaultGOCConfig(): GOCScoringConfig {
  return {
    dimensions: {
      go_fit: {
        label: 'Go Fit — encaje con el ICP',
        weight: 30,
        criteria: [
          { field: 'icp_fit_score', operator: 'gte', value: 70, points: 30 },
        ],
      },
      opportunity: {
        label: 'Opportunity — señal de intención',
        weight: 30,
        criteria: [
          { field: 'amount', operator: 'gte', value: 1000000, points: 15 },
          { field: 'record_type', operator: 'eq', value: 'deal', points: 15 },
        ],
      },
      capacity: {
        label: 'Capacity — capacidad de compra',
        weight: 20,
        criteria: [
          {
            field: 'customers.company_size',
            operator: 'in',
            value: ['mediana', 'grande'],
            points: 20,
          },
        ],
      },
      timing: {
        label: 'Timing — urgencia temporal',
        weight: 20,
        criteria: [
          { field: 'expected_close_date', operator: 'lte_days', value: 30, points: 20 },
        ],
      },
    },
    bands: [
      { min: 0, max: 30, label: 'Frío', color: '#94a3b8' },
      { min: 31, max: 50, label: 'Nurturing', color: '#3b82f6' },
      { min: 51, max: 70, label: 'Oportunidad', color: '#8b5cf6' },
      { min: 71, max: 85, label: 'Alta prioridad', color: '#f59e0b' },
      { min: 86, max: 100, label: 'Hot deal', color: '#ef4444' },
    ],
  };
}

/**
 * Migra un config antiguo (indicators/options) al schema GOC canónico
 * (dimensions/criteria) preservando los datos existentes.
 *
 * Mapeo: cada indicator → una dimensión; cada option → un criterion con
 * operator "eq" y points = score del option. El weight se conserva.
 */
export function migrateOldConfig(oldConfig: ScoringConfig): GOCScoringConfig {
  const dimensions: GOCScoringConfig['dimensions'] = {
    go_fit: { label: 'Go Fit — encaje con el ICP', weight: 0, criteria: [] },
    opportunity: { label: 'Opportunity — señal de intención', weight: 0, criteria: [] },
    capacity: { label: 'Capacity — capacidad de compra', weight: 0, criteria: [] },
    timing: { label: 'Timing — urgencia temporal', weight: 0, criteria: [] },
  };

  const dimensionKeys: Array<'go_fit' | 'opportunity' | 'capacity' | 'timing'> = [
    'go_fit',
    'opportunity',
    'capacity',
    'timing',
  ];

  const indicators = oldConfig.indicators || [];

  indicators.forEach((indicator, idx) => {
    // Distribuir indicators en las 4 dimensiones por índice (round-robin)
    const dimKey = dimensionKeys[idx % dimensionKeys.length];
    const dimension = dimensions[dimKey];

    // Acumular weight (si hay varios indicators en la misma dimensión)
    dimension.weight += indicator.weight ?? 0;

    // Cada option → criterion con operator "eq"
    for (const option of indicator.options || []) {
      dimension.criteria.push({
        field: indicator.key,
        operator: 'eq',
        value: option.value,
        points: option.score ?? 0,
      });
    }
  });

  // Bandas: migrar del formato antiguo {cold,warm,hot} al array de 5 bandas
  let bands: GOCBand[];
  if (oldConfig.bands && (oldConfig.bands as ScoringBands).cold) {
    const oldBands = oldConfig.bands as ScoringBands;
    bands = [
      { min: oldBands.cold?.min ?? 0, max: oldBands.cold?.max ?? 30, label: 'Frío', color: '#94a3b8' },
      { min: 31, max: 50, label: 'Nurturing', color: '#3b82f6' },
      { min: oldBands.warm?.min ?? 51, max: oldBands.warm?.max ?? 70, label: 'Oportunidad', color: '#8b5cf6' },
      { min: 71, max: 85, label: 'Alta prioridad', color: '#f59e0b' },
      { min: oldBands.hot?.min ?? 86, max: oldBands.hot?.max ?? 100, label: 'Hot deal', color: '#ef4444' },
    ];
  } else {
    // Si no hay bandas válidas, usar las 5 bandas canónicas por defecto
    bands = getDefaultGOCConfig().bands;
  }

  return {
    dimensions,
    bands,
    id: oldConfig.id,
    organization_id: oldConfig.organization_id,
    created_at: oldConfig.created_at,
    updated_at: oldConfig.updated_at,
  };
}

export const scoringService = new ScoringService();
export default ScoringService;
