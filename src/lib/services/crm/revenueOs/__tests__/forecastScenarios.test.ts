/// <reference types="jest" />
/**
 * F14 — escenarios de forecast puros (`forecastScenarios.ts`).
 * Solo oportunidades abiertas × probabilidad de etapa (0–100 en `stages.probability`).
 */
import { computeForecastScenarios, probabilityToFraction, weightedOpenAmount } from '../forecastScenarios';

const stages = [
  { id: 's1', probability: 10 },
  { id: 's2', probability: 50 },
  { id: 's3', probability: 90 },
  { id: 's-null', probability: null },
];

const opps = [
  { stage_id: 's1', status: 'open' as const, amount: 1000 },
  { stage_id: 's2', status: 'open' as const, amount: 2000 },
  { stage_id: 's3', status: 'open' as const, amount: 3000 },
  { stage_id: 's3', status: 'won' as const, amount: 9000 }, // ganada: fuera
  { stage_id: 's3', status: 'lost' as const, amount: 7000 }, // perdida: fuera (nunca suma)
  { stage_id: 's-null', status: 'open' as const, amount: 500 },
  { stage_id: 's2', status: 'open' as const, amount: null },
];

describe('probabilityToFraction', () => {
  it('50 → 0,5; 100 → 1; null → 0; 140 → 1; −5 → 0', () => {
    expect(probabilityToFraction(50)).toBe(0.5);
    expect(probabilityToFraction(100)).toBe(1);
    expect(probabilityToFraction(null)).toBe(0);
    expect(probabilityToFraction(140)).toBe(1);
    expect(probabilityToFraction(-5)).toBe(0);
  });
});

describe('computeForecastScenarios', () => {
  const r = computeForecastScenarios(opps, stages);
  it('esperado = Σ abiertas × p/100 = 100 + 1000 + 2700 + 0 = 3 800 (no × p sin dividir)', () => {
    expect(r.expected).toBe(3800);
  });
  it('mejor caso = abiertas en etapas con p ≥ 50 = 2000 + 3000 = 5 000', () => {
    expect(r.best).toBe(5000);
  });
  it('peor caso = abiertas en etapas con p ≥ 90 = 3 000', () => {
    expect(r.worst).toBe(3000);
  });
  it('las perdidas y ganadas no entran en ningún escenario', () => {
    expect(r.openTotal).toBe(6500);
    expect(r.openCount).toBe(5);
    expect(r.best).toBeLessThan(9000);
  });
  it('umbrales configurables', () => {
    const r2 = computeForecastScenarios(opps, stages, { bestMinProbability: 10, worstMinProbability: 50 });
    expect(r2.best).toBe(6000);
    expect(r2.worst).toBe(5000);
  });
  it('peor ≤ mejor siempre', () => {
    expect(r.worst).toBeLessThanOrEqual(r.best);
  });
  it('sin oportunidades abiertas → todo 0 y openCount 0 (estado vacío honesto en UI)', () => {
    const e = computeForecastScenarios(opps.filter((o) => o.status !== 'open'), stages);
    expect(e).toMatchObject({ best: 0, expected: 0, worst: 0, openCount: 0, openTotal: 0 });
  });
});

describe('weightedOpenAmount (usado por GoalProgress)', () => {
  it('equivale al escenario esperado', () => {
    expect(weightedOpenAmount(opps, stages)).toBe(3800);
  });
});
