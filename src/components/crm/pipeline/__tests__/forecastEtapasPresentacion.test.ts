import { agruparEtapasPronostico } from '../forecastEtapasPresentacion';
import type { ForecastOpportunity, MonthlyForecast } from '@/lib/services/forecastService';

function fila(id: string, etapa: string, cambios: Partial<ForecastOpportunity>): ForecastOpportunity {
  return {
    id, name: `Oportunidad ${id}`, amount: 10, currency: 'USD', convertedAmount: 200,
    expected_close_date: '2026-10-01', stage_id: etapa, stage_name: etapa,
    stage_color: '#4361EE', stage_position: 0, probability: 50, weightedAmount: 100,
    status: 'open', ...cambios,
  };
}

function mes(month: string, opportunities: ForecastOpportunity[]): MonthlyForecast {
  return { month, monthName: month, totalValue: 0, weightedValue: 0, opportunityCount: opportunities.length, opportunities };
}

const meses = [
  mes('2026-10', [
    fila('cero', 'etapa-cero', { convertedAmount: 100, weightedAmount: 0, probability: 0, stage_position: 2 }),
    fila('mitad', 'etapa-mitad', {}),
    fila('completa', 'etapa-completa', { convertedAmount: 300, weightedAmount: 300, probability: 100, stage_position: 1 }),
  ]),
  mes('2026-11', [fila('otra-mitad', 'etapa-mitad', { amount: 20, convertedAmount: 400, weightedAmount: 200 })]),
];

describe('presentación del pronóstico por etapa', () => {
  it('agrega las cifras convertidas y ponderadas de todos los meses sin usar los importes originales', () => {
    const resultado = agruparEtapasPronostico(meses, 'probability');
    expect(resultado.map(etapa => etapa.id)).toEqual(['etapa-completa', 'etapa-mitad', 'etapa-cero']);
    expect(resultado[1]).toMatchObject({ amount: 600, forecastAmount: 300, opportunityCount: 2, percentage: 50, color: '#4361EE' });
    expect(resultado.reduce((total, etapa) => total + etapa.amount, 0)).toBe(1000);
    expect(resultado.reduce((total, etapa) => total + etapa.forecastAmount, 0)).toBe(600);
    expect(resultado.reduce((total, etapa) => total + etapa.percentage, 0)).toBe(100);
    expect(resultado[2]).toMatchObject({ forecastAmount: 0, percentage: 0, probability: 0 });
  });

  it('el embudo conserva el orden de las etapas, incluida posición cero', () => {
    const resultado = agruparEtapasPronostico(meses, 'position');
    expect(resultado.map(etapa => etapa.id)).toEqual(['etapa-mitad', 'etapa-completa', 'etapa-cero']);
    expect(resultado[0].position).toBe(0);
  });

  it('no vuelve a calcular la probabilidad: respeta el ponderado que entrega el servicio', () => {
    const resultado = agruparEtapasPronostico([
      mes('2026-10', [fila('dato-canónico', 'etapa-a', { probability: 100, convertedAmount: 800, weightedAmount: 350 })]),
    ], 'position');
    expect(resultado[0]).toMatchObject({ amount: 800, forecastAmount: 350, percentage: 100 });
  });

  it('maneja una lista vacía y un ponderado cero sin porcentajes NaN', () => {
    expect(agruparEtapasPronostico([], 'probability')).toEqual([]);
    const resultado = agruparEtapasPronostico([
      mes('2026-10', [fila('cero', 'etapa-a', { weightedAmount: 0, stage_color: undefined, stage_position: undefined })]),
    ], 'position');
    expect(resultado[0]).toMatchObject({ percentage: 0, color: '#94a3b8', position: Number.MAX_SAFE_INTEGER });
  });
});
