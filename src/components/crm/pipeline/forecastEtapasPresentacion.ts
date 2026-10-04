import type { MonthlyForecast } from '@/lib/services/forecastService';

export interface DatosEtapaPronostico {
  id: string;
  name: string;
  color: string;
  probability: number;
  position: number;
  amount: number;
  forecastAmount: number;
  opportunityCount: number;
  percentage: number;
}

/** Agrupa cifras ya convertidas y ponderadas; la lógica financiera vive en el servicio. */
export function agruparEtapasPronostico(
  meses: readonly MonthlyForecast[],
  orden: 'probability' | 'position',
): DatosEtapaPronostico[] {
  const etapas = new Map<string, DatosEtapaPronostico>();
  let totalPonderado = 0;
  for (const mes of meses) {
    for (const oportunidad of mes.opportunities) {
      const idEtapa = oportunidad.stage_id || 'sin-etapa';
      if (!etapas.has(idEtapa)) {
        etapas.set(idEtapa, {
          id: idEtapa,
          name: oportunidad.stage_name || '',
          color: oportunidad.stage_color || '#94a3b8',
          probability: oportunidad.probability,
          position: oportunidad.stage_position ?? Number.MAX_SAFE_INTEGER,
          amount: 0,
          forecastAmount: 0,
          opportunityCount: 0,
          percentage: 0,
        });
      }
      const etapa = etapas.get(idEtapa)!;
      etapa.amount += oportunidad.convertedAmount;
      etapa.forecastAmount += oportunidad.weightedAmount;
      etapa.opportunityCount += 1;
      totalPonderado += oportunidad.weightedAmount;
    }
  }
  return [...etapas.values()].map(etapa => ({
    ...etapa,
    percentage: totalPonderado > 0 ? etapa.forecastAmount / totalPonderado * 100 : 0,
  })).sort((a, b) => {
    if (orden === 'probability' && a.probability !== b.probability) return b.probability - a.probability;
    return a.position - b.position || a.id.localeCompare(b.id);
  });
}
