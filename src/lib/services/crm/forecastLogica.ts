/**
 * Pronóstico trimestral por categorías (Figma CRM 1431:19, 1434:648,
 * 1434:1185): cuota, compromiso, mejor caso, ponderado y ganado, por vendedor
 * y del equipo. Lógica pura sobre la foto que devuelve la RPC
 * `crm_forecast_snapshot(p_org, p_period, p_user, p_team)` (aplicada;
 * verificada por MCP el 2026-10-06).
 *
 * Reutiliza el núcleo existente: conversión de moneda con
 * `sumarEnMonedaBase` (tasas vigentes en el día de la foto) y probabilidad de
 * etapa con `probabilityToFraction` (el mismo ponderado de Revenue OS).
 *
 * Categoría: la elegida por el vendedor (`opportunities.forecast_category`) o,
 * si no eligió, la que sugiere la probabilidad de la etapa (≥ 70 % compromiso,
 * ≥ 25 % mejor caso, si no pipeline). «Omitida» no suma en compromiso, mejor
 * caso ni ponderado. Los ajustes con motivo suman su diferencia al compromiso
 * y al mejor caso, sin tocar las oportunidades.
 */
import { sumarEnMonedaBase, type MontoEnMoneda, type ResumenMonedaBase, type TasaCambio } from '@/lib/crm/monedaCrm';
import { probabilityToFraction } from './revenueOs/forecastScenarios';
import { toPlainDate } from '@/lib/utils/dateCore';

export const FORECAST_CATEGORIES = ['commit', 'best_case', 'pipeline', 'omitted'] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];
export const MOTIVOS_AJUSTE = ['verbal_agreement', 'deal_risk', 'upside', 'correction', 'reversal'] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];
export const TAMANO_PAGINA_PRONOSTICO = 25;

export interface ForecastOpportunity {
  id: string;
  name: string;
  salesperson_id: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string;
  expected_close_date: string | null;
  closed_at: string | null;
  updated_at: string | null;
  forecast_category: ForecastCategory | null;
  probability: number | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  stage_name: string;
}

export interface ForecastAdjustment {
  id: string;
  user_id: string;
  amount_before: number | string;
  amount_after: number | string;
  currency: string;
  reason_code: string;
  reason_text: string;
  adjusted_by: string;
  created_at: string;
  reverses_id: string | null;
  author?: string;
}

export interface ForecastSnapshot {
  period: string;
  start: string;
  end: string;
  date: string;
  timezone: string;
  base: string;
  users: { id: string; first_name: string | null; last_name: string | null }[];
  opportunities: ForecastOpportunity[];
  targets: { id: string; user_id: string; period: string; target_amount: number | string; target_currency: string }[];
  teamQuotas: { id: string; user_id: string; amount: number | string; currency: string }[];
  rates: TasaCambio[];
  adjustments: ForecastAdjustment[];
  snapshotToken: string;
  canViewAll: boolean;
  canAdjust: boolean;
  canEditAny: boolean;
  currentUser: string | null;
}

/** «2026-10-06» → «2026-Q4». */
export function trimestreDelDia(dia: string): string {
  return `${dia.slice(0, 4)}-Q${Math.ceil(Number(dia.slice(5, 7)) / 3)}`;
}

/** Trimestre anterior/siguiente: «2026-Q1» −1 → «2025-Q4». */
export function moverTrimestre(periodo: string, delta: number): string {
  const anio = Number(periodo.slice(0, 4));
  const q = Number(periodo.slice(-1)) - 1 + delta;
  const anioNuevo = anio + Math.floor(q / 4);
  return `${anioNuevo}-Q${(((q % 4) + 4) % 4) + 1}`;
}

export function esGanada(o: Pick<ForecastOpportunity, 'status' | 'is_won'>): boolean {
  return o.status === 'won' || o.is_won === true;
}

export function categoriaPronostico(o: Pick<ForecastOpportunity, 'forecast_category' | 'probability'>): ForecastCategory {
  if (o.forecast_category) return o.forecast_category;
  const p = probabilityToFraction(o.probability);
  return p >= 0.7 ? 'commit' : p >= 0.25 ? 'best_case' : 'pipeline';
}

function montos(opps: readonly ForecastOpportunity[], ponderado = false): MontoEnMoneda[] {
  return opps.map((o) => ({ monto: Number(o.amount ?? 0) * (ponderado ? probabilityToFraction(o.probability) : 1), moneda: o.currency }));
}

/** Cuota del vendedor: metas trimestrales; si no hay, mensuales del trimestre; si no, la cuota del equipo. */
function cuotaPara(s: ForecastSnapshot, user: string | null): MontoEnMoneda[] {
  const metas = s.targets.filter((t) => t.user_id === user);
  const trimestrales = metas.filter((t) => t.period === 'quarterly');
  const elegidas = trimestrales.length ? trimestrales : metas.filter((t) => t.period === 'monthly');
  if (elegidas.length) return elegidas.map((t) => ({ monto: t.target_amount, moneda: t.target_currency }));
  return s.teamQuotas.filter((t) => t.user_id === user).map((t) => ({ monto: t.amount, moneda: t.currency }));
}

export interface FilaPronostico {
  userId: string | null;
  oportunidades: number;
  quota: ResumenMonedaBase;
  won: ResumenMonedaBase;
  calculatedCommit: ResumenMonedaBase;
  commit: ResumenMonedaBase;
  bestCase: ResumenMonedaBase;
  weighted: ResumenMonedaBase;
  adjustment: ResumenMonedaBase;
  latestAdjustment: ForecastAdjustment | null;
  /** Compromiso ÷ cuota; null sin cuota o con montos sin tasa. */
  coverage: number | null;
}

export function calcularFilaPronostico(s: ForecastSnapshot, user: string | null): FilaPronostico {
  const opps = s.opportunities.filter((o) => o.salesperson_id === user);
  const abiertas = opps.filter((o) => o.status === 'open' && !o.is_lost && !o.is_won && categoriaPronostico(o) !== 'omitted');
  const ganadas = montos(opps.filter(esGanada));
  const comprometidas = abiertas.filter((o) => categoriaPronostico(o) === 'commit');
  const mejores = abiertas.filter((o) => categoriaPronostico(o) === 'commit' || categoriaPronostico(o) === 'best_case');
  const ajustes = s.adjustments.filter((a) => a.user_id === user);
  const delta: MontoEnMoneda[] = ajustes.map((a) => ({ monto: Number(a.amount_after) - Number(a.amount_before), moneda: a.currency, cantidad: 0 }));
  const sumar = (v: MontoEnMoneda[]) => sumarEnMonedaBase(v, s.base, s.rates, s.date);
  const quota = sumar(cuotaPara(s, user));
  const commit = sumar([...ganadas, ...montos(comprometidas), ...delta]);
  return {
    userId: user,
    oportunidades: opps.length,
    quota,
    won: sumar(ganadas),
    calculatedCommit: sumar([...ganadas, ...montos(comprometidas)]),
    commit,
    bestCase: sumar([...ganadas, ...montos(mejores), ...delta]),
    weighted: sumar([...ganadas, ...montos(abiertas, true)]),
    adjustment: sumar(delta),
    latestAdjustment: ajustes.at(-1) ?? null,
    coverage: quota.total > 0 && !quota.sinTasa.length && !commit.sinTasa.length ? commit.total / quota.total : null,
  };
}

export type ClaveResumen = 'quota' | 'won' | 'commit' | 'bestCase' | 'weighted';

export function calcularPronostico(s: ForecastSnapshot): { rows: FilaPronostico[]; summary: Record<ClaveResumen, ResumenMonedaBase> } {
  const ids = new Set<string | null>([
    ...s.opportunities.map((o) => o.salesperson_id),
    ...s.targets.map((t) => t.user_id),
    ...s.teamQuotas.map((t) => t.user_id),
    ...s.adjustments.map((a) => a.user_id),
    ...(s.currentUser ? [s.currentUser] : []),
  ]);
  const rows = [...ids].map((id) => calcularFilaPronostico(s, id));
  const total = (k: ClaveResumen) =>
    sumarEnMonedaBase(rows.flatMap((r) => r[k].grupos.map((g) => ({ monto: g.monto, moneda: g.moneda, cantidad: g.cantidad }))), s.base, s.rates, s.date);
  return { rows, summary: { quota: total('quota'), won: total('won'), commit: total('commit'), bestCase: total('bestCase'), weighted: total('weighted') } };
}

/** Porcentaje entero de `parte` sobre `total`; null sin total. */
export function pctDe(parte: number, total: number): number | null {
  return total > 0 ? Math.round((100 * parte) / total) : null;
}

/** «2026-10» + 2 → «2026-12»; «2026-11» + 2 → «2027-01». */
export function mesMas(mes: string, delta: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Mes (YYYY-MM) en que cuenta una oportunidad: las ganadas por el día de
 * cierre en la zona de la organización (`closed_at` es timestamptz; sin él,
 * la fecha esperada, igual que la RPC); las abiertas por `expected_close_date`.
 */
export function mesDeOportunidad(o: Pick<ForecastOpportunity, 'status' | 'is_won' | 'closed_at' | 'expected_close_date'>, zona: string): string | null {
  const dia = esGanada(o) && o.closed_at ? toPlainDate(new Date(o.closed_at), zona) : o.expected_close_date;
  return dia ? dia.slice(0, 7) : null;
}

export interface MesPronostico {
  /** YYYY-MM. */
  mes: string;
  /** Abiertas no omitidas con cierre esperado en el mes. */
  oportunidades: number;
  won: ResumenMonedaBase;
  commit: ResumenMonedaBase;
  bestCase: ResumenMonedaBase;
  weighted: ResumenMonedaBase;
}

/**
 * Vista «Por mes» (Figma CRM 1431:19, control «Por vendedor | Por mes»): los
 * tres meses del trimestre con las mismas reglas que la fila del vendedor. Los
 * ajustes con motivo son del trimestre y NO se reparten por mes.
 */
export function calcularPorMes(s: ForecastSnapshot): MesPronostico[] {
  const sumar = (v: MontoEnMoneda[]) => sumarEnMonedaBase(v, s.base, s.rates, s.date);
  return [0, 1, 2].map((d) => {
    const mes = mesMas(s.start.slice(0, 7), d);
    const delMes = s.opportunities.filter((o) => mesDeOportunidad(o, s.timezone) === mes);
    const abiertas = delMes.filter((o) => o.status === 'open' && !o.is_lost && !o.is_won && categoriaPronostico(o) !== 'omitted');
    const ganadas = montos(delMes.filter(esGanada));
    return {
      mes,
      oportunidades: abiertas.length,
      won: sumar(ganadas),
      commit: sumar([...ganadas, ...montos(abiertas.filter((o) => categoriaPronostico(o) === 'commit'))]),
      bestCase: sumar([...ganadas, ...montos(abiertas.filter((o) => categoriaPronostico(o) !== 'pipeline'))]),
      weighted: sumar([...ganadas, ...montos(abiertas, true)]),
    };
  });
}
