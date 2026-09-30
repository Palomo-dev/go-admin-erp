/**
 * Cálculo del score de una oportunidad, sin Supabase ni React (CRM ola 3B).
 *
 * Es el cálculo ÚNICO (regla dura 7): lo usan `scoringService.calculateScore`
 * (navegador, configuración y vista previa) y `PUT
 * /api/crm/opportunities/[id]/score`, que es quien guarda el resultado desde
 * que el drawer dejó de escribir `opportunities` con el cliente del navegador
 * (guardarraíl 36).
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

export const BANDAS_POR_DEFECTO: ScoringBands = { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } };

/** Temperatura de un score: hot → warm → cold, con las bandas de la organización o las por defecto. */
export function temperaturaDeScore(score: number, bands?: ScoringBands | null): Temperature {
  if (!bands) {
    if (score >= 67) return 'hot';
    if (score >= 34) return 'warm';
    return 'cold';
  }
  if (bands.hot && score >= bands.hot.min) return 'hot';
  if (bands.warm && score >= bands.warm.min) return 'warm';
  return 'cold';
}

/** Score 0–100 ponderado por indicador (cada opción normalizada a su máximo). */
export function calcularScore(answers: readonly ScoreAnswer[], config: ScoringConfig | null | undefined): ScoreResult {
  if (!config || !config.indicators || config.indicators.length === 0) {
    return { score_total: 0, temperature: 'cold', details: [] };
  }
  const respuestas = new Map<string, string>();
  for (const a of answers) respuestas.set(a.key, a.value);

  const details: ScoreResult['details'] = [];
  let totalWeight = 0;
  let totalWeightedScore = 0;
  for (const indicator of config.indicators) {
    const selectedValue = respuestas.get(indicator.key);
    const option = indicator.options.find((opt) => opt.value === selectedValue);
    const score = option?.score ?? 0;
    const weight = indicator.weight ?? 0;
    const maxScore = Math.max(...indicator.options.map((o) => o.score), 1);
    const weightedScore = ((score / maxScore) * 100 / 100) * weight;
    details.push({ key: indicator.key, label: indicator.label, weight, selectedValue: selectedValue || '', score, weightedScore });
    totalWeight += weight;
    totalWeightedScore += weightedScore;
  }
  const scoreTotal = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;
  return { score_total: scoreTotal, temperature: temperaturaDeScore(scoreTotal, config.bands), details };
}

/** Fila de `scoring_configs` (config jsonb) → configuración plana. */
export function configDeFila(row: { id?: string; organization_id?: number; config?: Partial<ScoringConfig> | null; created_at?: string; updated_at?: string } | null): ScoringConfig | null {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    indicators: row.config?.indicators || [],
    bands: row.config?.bands || BANDAS_POR_DEFECTO,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
