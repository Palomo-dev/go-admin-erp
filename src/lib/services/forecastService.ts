/** Pronóstico de oportunidades: un cálculo para tabla, gráfico, metas y etapas. */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from './kanbanService';
import { currencyService } from './currencyService';
import { resolveOrgCurrency } from './monedaOrganizacion';
import { resolveTimezone } from './timezoneResolver';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { probabilityToFraction } from './crm/revenueOs/forecastScenarios';

type Relacion<T> = T | T[] | null;
interface FilaOportunidadPronostico {
  id: string;
  name: string;
  amount: number | string | null;
  currency: string | null;
  expected_close_date: string | null;
  stage_id: string;
  status: string;
  stages?: Relacion<{
    name?: string;
    probability?: number | string | null;
    color?: string | null;
    position?: number | null;
  }>;
  customers?: Relacion<{ full_name?: string | null }>;
}

export interface MonthlyForecast {
  month: string;
  monthName: string;
  totalValue: number;
  weightedValue: number;
  opportunityCount: number;
  opportunities: ForecastOpportunity[];
}

export interface ForecastOpportunity {
  id: string;
  name: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  expected_close_date: string | null;
  stage_id: string;
  stage_name?: string;
  stage_color?: string;
  stage_position?: number;
  probability: number;
  weightedAmount: number;
  customer_name?: string;
  status: string;
}

export interface ForecastTotals {
  totalAmount: number;
  weightedAmount: number;
  opportunityCount: number;
  currencyDistribution: Record<string, number>;
}

export interface ForecastResult {
  monthlyForecasts: MonthlyForecast[];
  totals: ForecastTotals;
  baseCurrency: string;
}

export interface ForecastOptions {
  baseCurrency?: string;
  locale?: string;
  noDateLabel?: string;
  /** Día calendario incluido. Preferirlo al instante legado startDate. */
  startDay?: string;
  /** Día calendario excluido: permite períodos contiguos sin repetir un cierre. */
  endDay?: string;
  startDate?: Date;
  endDate?: Date;
  /** Las cerradas pueden aparecer en la tabla; nunca suman al ponderado abierto. */
  includeWon?: boolean;
  includeLost?: boolean;
}

export interface PipelineGoal {
  goalAmount: number;
  goalPeriod: 'monthly' | 'quarterly' | 'yearly';
  goalCurrency: string | null;
}

const primeraRelacion = <T,>(relacion: Relacion<T> | undefined): T | null =>
  Array.isArray(relacion) ? relacion[0] ?? null : relacion ?? null;

const montoFinito = (valor: number | string | null): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/** Las fechas de cierre vienen de SQL DATE: no se convierten a la zona del navegador. */
const validarDia = (dia: string): string => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dia)) {
    throw new Error('El pronóstico requiere un día calendario YYYY-MM-DD');
  }
  const [ano, mes, numeroDia] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(ano, mes - 1, numeroDia));
  if (fecha.getUTCFullYear() !== ano || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== numeroDia) {
    throw new Error('El día calendario del pronóstico no existe');
  }
  return dia;
};

async function limitesDelPeriodo(organizationId: number, opciones: ForecastOptions) {
  // ADR-003: el servicio resuelve la zona por identidad, nunca desde un opcional del cliente.
  const zona = opciones.startDate || opciones.endDate ? await resolveTimezone(organizationId) : undefined;
  const inicio = opciones.startDay ?? (opciones.startDate ? toPlainDate(opciones.startDate, zona!) : undefined);
  const fin = opciones.endDay ?? (opciones.endDate ? toPlainDate(opciones.endDate, zona!) : undefined);
  if (inicio) validarDia(inicio);
  if (fin) validarDia(fin);
  if (inicio && fin && inicio >= fin) throw new Error('El período de pronóstico no es válido');
  return { inicio, fin };
}

/** Reutiliza las tasas del servicio de moneda, sin su fallback al importe sin convertir. */
async function procesarOportunidades(
  filas: FilaOportunidadPronostico[],
  organizationId: number,
  baseCurrency: string,
): Promise<ForecastOpportunity[]> {
  const tasas = new Map<string, Promise<number>>();
  const tasaPara = (moneda: string): Promise<number> => {
    if (moneda === baseCurrency) return Promise.resolve(1);
    if (!tasas.has(moneda)) {
      tasas.set(moneda, (async () => {
        const tasa = await currencyService.getExchangeRate(organizationId, moneda, baseCurrency);
        if (tasa === null || !Number.isFinite(tasa) || tasa <= 0) {
          throw new Error(`Falta una tasa de cambio válida de ${moneda} a ${baseCurrency}`);
        }
        return tasa;
      })());
    }
    return tasas.get(moneda)!;
  };

  return Promise.all(filas.map(async (fila) => {
    const etapa = primeraRelacion(fila.stages);
    const cliente = primeraRelacion(fila.customers);
    const currency = fila.currency || baseCurrency;
    const amount = montoFinito(fila.amount);
    const convertedAmount = amount * await tasaPara(currency);
    if (!Number.isFinite(convertedAmount)) throw new Error('El importe convertido del pronóstico no es válido');
    const fraccion = probabilityToFraction(montoFinito(etapa?.probability ?? null));
    return {
      id: fila.id,
      name: fila.name,
      amount,
      currency,
      convertedAmount,
      expected_close_date: fila.expected_close_date === null ? null : validarDia(fila.expected_close_date),
      stage_id: fila.stage_id,
      stage_name: etapa?.name || 'Sin etapa',
      stage_color: etapa?.color || undefined,
      stage_position: typeof etapa?.position === 'number' && Number.isFinite(etapa.position)
        ? etapa.position : undefined,
      probability: fraccion * 100,
      weightedAmount: fila.status === 'open' ? convertedAmount * fraccion : 0,
      customer_name: cliente?.full_name || 'Sin cliente',
      status: fila.status,
    };
  }));
}

async function consultarPronostico(
  filtros: { pipelineId?: string; stageId?: string },
  opciones: ForecastOptions,
): Promise<{ oportunidades: ForecastOpportunity[]; baseCurrency: string }> {
  const organizationId = getOrganizationId();
  if (!organizationId) throw new Error('No se encontró ID de organización para el pronóstico');
  const baseCurrency = opciones.baseCurrency || (await resolveOrgCurrency(supabase, organizationId)).code;
  const { inicio, fin } = await limitesDelPeriodo(organizationId, opciones);
  const estados = ['open'];
  if (opciones.includeWon) estados.push('won');
  if (opciones.includeLost) estados.push('lost');

  // Mismo patrón de readOrganizationRows: páginas inferiores al límite PostgREST.
  // Se agregan importes sólo después de leer todas las páginas correctamente.
  const filas: FilaOportunidadPronostico[] = [];
  for (let offset = 0; ; offset += 500) {
    let consulta = supabase.from('opportunities').select(`
      id, name, amount, currency, expected_close_date, stage_id, status,
      stages:stage_id(name, probability, color, position), customers:customer_id(full_name)
    `).eq('organization_id', organizationId).in('status', estados);
    if (filtros.pipelineId !== undefined) consulta = consulta.eq('pipeline_id', filtros.pipelineId);
    if (filtros.stageId !== undefined) consulta = consulta.eq('stage_id', filtros.stageId);
    if (inicio) consulta = consulta.gte('expected_close_date', inicio);
    if (fin) consulta = consulta.lt('expected_close_date', fin);
    const { data, error } = await consulta
      .order('expected_close_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('La lectura de oportunidades del pronóstico está incompleta');
    filas.push(...data as unknown as FilaOportunidadPronostico[]);
    if (data.length < 500) break;
  }

  return {
    oportunidades: await procesarOportunidades(
      filas, organizationId, baseCurrency,
    ),
    baseCurrency,
  };
}

/** Agrupa y suma cada oportunidad exactamente una vez, incluidas las que no tienen fecha. */
export async function getMonthlyForecast(
  pipelineId: string,
  opciones: ForecastOptions = {},
): Promise<ForecastResult | null> {
  try {
    const { oportunidades, baseCurrency } = await consultarPronostico({ pipelineId }, opciones);
    const meses = new Map<string, MonthlyForecast>();
    const totales: ForecastTotals = {
      totalAmount: 0, weightedAmount: 0, opportunityCount: 0, currencyDistribution: {},
    };
    const formatoMes = new Intl.DateTimeFormat(opciones.locale || 'es-CO', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    });

    for (const oportunidad of oportunidades) {
      const mes = oportunidad.expected_close_date?.slice(0, 7) ?? 'sin-fecha';
      if (!meses.has(mes)) {
        const [ano, numeroMes] = mes.split('-').map(Number);
        meses.set(mes, {
          month: mes,
          // La fecha neutra sólo representa el mes de SQL DATE; no es un instante del cliente.
          monthName: mes === 'sin-fecha'
            ? opciones.noDateLabel || 'Sin fecha definida'
            : formatoMes.format(new Date(Date.UTC(ano, numeroMes - 1, 1))),
          totalValue: 0, weightedValue: 0, opportunityCount: 0, opportunities: [],
        });
      }
      const grupo = meses.get(mes)!;
      grupo.totalValue += oportunidad.convertedAmount;
      grupo.weightedValue += oportunidad.weightedAmount;
      grupo.opportunityCount += 1;
      grupo.opportunities.push(oportunidad);
      totales.totalAmount += oportunidad.convertedAmount;
      totales.weightedAmount += oportunidad.weightedAmount;
      totales.opportunityCount += 1;
      totales.currencyDistribution[oportunidad.currency] =
        (totales.currencyDistribution[oportunidad.currency] || 0) + oportunidad.amount;
    }

    return {
      monthlyForecasts: [...meses.values()].sort((a, b) => {
        if (a.month === b.month) return 0;
        if (a.month === 'sin-fecha') return 1;
        if (b.month === 'sin-fecha') return -1;
        return a.month.localeCompare(b.month);
      }),
      totals: totales,
      baseCurrency,
    };
  } catch (error) {
    console.error('Error en cálculo de pronóstico mensual:', error);
    return null;
  }
}

async function totalesDeEtapa(
  filtros: { pipelineId?: string; stageId: string },
  opciones: ForecastOptions,
): Promise<Pick<ForecastTotals, 'totalAmount' | 'weightedAmount' | 'opportunityCount'> | null> {
  try {
    const { oportunidades } = await consultarPronostico(filtros, opciones);
    return oportunidades.reduce((totales, oportunidad) => ({
      totalAmount: totales.totalAmount + oportunidad.convertedAmount,
      weightedAmount: totales.weightedAmount + oportunidad.weightedAmount,
      opportunityCount: totales.opportunityCount + 1,
    }), { totalAmount: 0, weightedAmount: 0, opportunityCount: 0 });
  } catch (error) {
    console.error('Error en cálculo de pronóstico por etapa:', error);
    return null;
  }
}

export const getForecastByStage = (pipelineId: string, stageId: string, opciones: ForecastOptions = {}) =>
  totalesDeEtapa({ pipelineId, stageId }, opciones);

export const calculateStageForecasts = getForecastByStage;

export const getStageForecasts = (stageId: string, opciones: ForecastOptions = {}) =>
  totalesDeEtapa({ stageId }, opciones);

/** Una ausencia de meta devuelve null; un error de lectura se propaga a la UI. */
export async function getPipelineGoal(pipelineId: string): Promise<PipelineGoal | null> {
  const organizationId = getOrganizationId();
  if (!organizationId) throw new Error('No se encontró ID de organización para la meta');
  const { data, error } = await supabase.from('pipelines')
    .select('goal_amount, goal_period, goal_currency')
    .eq('organization_id', organizationId)
    .eq('id', pipelineId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.goal_amount === null) return null;
  const goalAmount = Number(data.goal_amount);
  if (!Number.isFinite(goalAmount) || goalAmount < 0) throw new Error('La meta del pipeline no es válida');
  const goalPeriod = data.goal_period ?? 'monthly';
  if (goalPeriod !== 'monthly' && goalPeriod !== 'quarterly' && goalPeriod !== 'yearly') {
    throw new Error('El período de la meta del pipeline no es válido');
  }
  return { goalAmount, goalPeriod, goalCurrency: data.goal_currency || null };
}
