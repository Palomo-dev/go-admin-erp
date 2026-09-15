/// <reference types="jest" />
/**
 * F14 — conversión etapa→etapa a partir de `fn_pipeline_funnel`
 * (`funnelConversion.ts`). La RPC cuenta oportunidades por su etapa ACTUAL;
 * la conversión se calcula sobre el acumulado «llegó a esta etapa o más allá»,
 * excluyendo las etapas marcadas `is_lost` de la cadena.
 */
import { computeFunnelConversion, type FunnelStageInput } from '../funnelConversion';

const rows: FunnelStageInput[] = [
  { stage_id: 'a', stage_name: 'Lead', position: 1, opportunity_count: 10, total_amount: 1000, is_won: false, is_lost: false },
  { stage_id: 'b', stage_name: 'Demo', position: 2, opportunity_count: 5, total_amount: 800, is_won: false, is_lost: false },
  { stage_id: 'c', stage_name: 'Propuesta', position: 3, opportunity_count: 3, total_amount: 700, is_won: false, is_lost: false },
  { stage_id: 'w', stage_name: 'Ganada', position: 4, opportunity_count: 2, total_amount: 600, is_won: true, is_lost: false },
  { stage_id: 'l', stage_name: 'Perdida', position: 5, opportunity_count: 4, total_amount: 300, is_won: false, is_lost: true },
];

describe('computeFunnelConversion', () => {
  const r = computeFunnelConversion(rows);
  it('acumulado: Lead 20, Demo 10, Propuesta 5, Ganada 2 (la perdida no suma al acumulado)', () => {
    expect(r.stages.map((s) => s.reached)).toEqual([20, 10, 5, 2]);
  });
  it('conversión al siguiente: 50 %, 50 %, 40 %, y la última no tiene siguiente (null)', () => {
    expect(r.stages.map((s) => s.conversionToNextPct)).toEqual([50, 50, 40, null]);
  });
  it('share sobre la primera etapa: 100, 50, 25, 10', () => {
    expect(r.stages.map((s) => s.sharePct)).toEqual([100, 50, 25, 10]);
  });
  it('conversión global = ganadas / llegaron a la primera = 10 %', () => {
    expect(r.overallPct).toBe(10);
  });
  it('la etapa perdida se devuelve aparte con su conteo', () => {
    expect(r.lost).toEqual({ count: 4, amount: 300 });
  });
  it('división por cero: etapas vacías → null, no NaN ni Infinity', () => {
    const empty = computeFunnelConversion(rows.map((x) => ({ ...x, opportunity_count: 0, total_amount: 0 })));
    expect(empty.stages.every((s) => s.conversionToNextPct === null)).toBe(true);
    expect(empty.overallPct).toBeNull();
    expect(empty.stages.every((s) => s.sharePct === 0)).toBe(true);
  });
  it('ordena por position aunque lleguen desordenadas', () => {
    const shuffled = [rows[2], rows[0], rows[4], rows[3], rows[1]];
    expect(computeFunnelConversion(shuffled).stages.map((s) => s.stage_id)).toEqual(['a', 'b', 'c', 'w']);
  });
  it('sin etapa ganada: overall = llegaron a la última / primera', () => {
    const noWon = rows.filter((x) => !x.is_won && !x.is_lost);
    expect(computeFunnelConversion(noWon).overallPct).toBeCloseTo((3 / 18) * 100, 9);
  });
});
