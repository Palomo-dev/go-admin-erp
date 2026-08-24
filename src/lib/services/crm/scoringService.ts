import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

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
}

export const scoringService = new ScoringService();
export default ScoringService;
