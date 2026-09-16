/**
 * F14 — escenarios de forecast (puro).
 *
 * Solo entran oportunidades con `status = 'open'`; las ganadas ya son revenue
 * y las perdidas nunca suman. `stages.probability` es un entero 0–100.
 *
 *   esperado = Σ amount × probabilidad / 100            (pipeline ponderado)
 *   mejor    = Σ amount de las abiertas en etapas con probabilidad ≥ 50 %
 *              («todo lo que va bien encaminado se cierra»)
 *   peor     = Σ amount de las abiertas en etapas con probabilidad ≥ 90 %
 *              («solo lo comprometido»)
 *
 * Los umbrales son parámetros: la UI los declara junto a la cifra.
 */

export interface ScenarioStage {
  id: string;
  probability: number | null | undefined;
}

export interface ScenarioOpportunity {
  stage_id: string;
  status: 'open' | 'won' | 'lost' | string;
  amount: number | null | undefined;
}

export interface ScenarioOptions {
  bestMinProbability?: number;
  worstMinProbability?: number;
}

export interface ForecastScenarios {
  best: number;
  expected: number;
  worst: number;
  openTotal: number;
  openCount: number;
  bestMinProbability: number;
  worstMinProbability: number;
}

export const DEFAULT_BEST_MIN_PROBABILITY = 50;
export const DEFAULT_WORST_MIN_PROBABILITY = 90;

/** 0–100 → 0–1, acotado; null/NaN → 0. */
export function probabilityToFraction(probability: number | null | undefined): number {
  if (typeof probability !== 'number' || !Number.isFinite(probability)) return 0;
  return Math.min(100, Math.max(0, probability)) / 100;
}

function amountOf(o: ScenarioOpportunity): number {
  return typeof o.amount === 'number' && Number.isFinite(o.amount) ? o.amount : 0;
}

export function computeForecastScenarios(
  opportunities: ScenarioOpportunity[],
  stages: ScenarioStage[],
  options: ScenarioOptions = {},
): ForecastScenarios {
  const bestMin = options.bestMinProbability ?? DEFAULT_BEST_MIN_PROBABILITY;
  const worstMin = options.worstMinProbability ?? DEFAULT_WORST_MIN_PROBABILITY;
  const probByStage = new Map<string, number>();
  for (const s of stages) probByStage.set(s.id, typeof s.probability === 'number' ? s.probability : 0);

  let best = 0;
  let expected = 0;
  let worst = 0;
  let openTotal = 0;
  let openCount = 0;
  for (const o of opportunities) {
    if (o.status !== 'open') continue;
    const amount = amountOf(o);
    const p = probByStage.get(o.stage_id) ?? 0;
    openCount += 1;
    openTotal += amount;
    expected += amount * probabilityToFraction(p);
    if (p >= bestMin) best += amount;
    if (p >= worstMin) worst += amount;
  }
  return { best, expected, worst, openTotal, openCount, bestMinProbability: bestMin, worstMinProbability: worstMin };
}

/** Pipeline ponderado (= escenario esperado). Usado por `GoalProgress`. */
export function weightedOpenAmount(opportunities: ScenarioOpportunity[], stages: ScenarioStage[]): number {
  return computeForecastScenarios(opportunities, stages).expected;
}
