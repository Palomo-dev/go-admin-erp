/**
 * F11 — health score: lógica pura sobre los campos reales de
 * `fn_customer_health(p_org_id, p_customer_id)` y la forma real de
 * `health_score_configs.config` (verificadas por MCP el 2026-09-15):
 *
 *   config = { bands: { green, yellow, red },
 *              indicators: [{ key, label, weight, direction, thresholds: [{min|max, score}] }] }
 *
 * Las dimensiones son configurables por organización: cada `indicator.key`
 * se resuelve a un campo de la RPC (`indicatorSourceValue`). Si la config no
 * tiene indicadores válidos, `scoreFromConfig` devuelve null y el llamador
 * usa el `score`/`band` que ya calcula la RPC.
 */

import { formatMoneda, LOCALE_RESPALDO, type ContextoMoneda } from '@/lib/utils/moneda';

export type HealthBand = 'green' | 'yellow' | 'red';

export interface HealthRpcRow {
  customer_id: string;
  invoices_12m: number;
  revenue_12m: number;
  days_since_last_invoice: number | null;
  days_since_last_activity: number | null;
  overdue_balance: number;
  overdue_ratio: number;
  score: number;
  band: string;
}

export interface HealthThresholdJson {
  min?: number;
  max?: number;
  score: number;
}

export interface HealthIndicatorJson {
  key: string;
  label: string;
  weight: number;
  direction: 'higher_better' | 'lower_better';
  thresholds: HealthThresholdJson[];
  /**
   * Interruptor de «Configuración de factores» (Figma 1424:932). `false` =
   * apagado: se conserva con sus umbrales pero no puntúa. Ausente = encendido
   * (las configs anteriores no lo traen).
   */
  enabled?: boolean;
}

export interface HealthBandsJson {
  green: number;
  yellow: number;
  red: number;
}

export interface HealthConfigJson {
  bands: HealthBandsJson;
  indicators: HealthIndicatorJson[];
}

export const DEFAULT_BANDS: HealthBandsJson = { green: 70, yellow: 40, red: 0 };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseIndicator(item: unknown): HealthIndicatorJson | null {
  if (!item || typeof item !== 'object') return null;
  const i = item as Record<string, unknown>;
  const key = typeof i.key === 'string' ? i.key.trim() : '';
  const weight = num(i.weight);
  const direction = i.direction === 'lower_better' ? 'lower_better' : i.direction === 'higher_better' ? 'higher_better' : null;
  const thresholds = Array.isArray(i.thresholds)
    ? (i.thresholds as unknown[])
      .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
      .filter((t): t is Record<string, unknown> => !!t && num(t.score) !== null)
      .map((t) => ({ ...(num(t.min) !== null ? { min: num(t.min)! } : {}), ...(num(t.max) !== null ? { max: num(t.max)! } : {}), score: num(t.score)! }))
    : [];
  if (!key || weight === null || weight < 0 || !direction || thresholds.length === 0) return null;
  return {
    key,
    label: typeof i.label === 'string' && i.label ? i.label : key,
    weight,
    direction,
    thresholds,
    ...(i.enabled === false ? { enabled: false } : {}),
  };
}

/**
 * Config tal como se edita (Figma 1424:932): conserva los indicadores
 * apagados (`enabled: false`) y los de peso 0, para que el interruptor no
 * pierda los umbrales. Para puntuar, `parseHealthConfig`.
 */
export function parseHealthConfigEditable(json: unknown): HealthConfigJson | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const raw = json as { bands?: unknown; indicators?: unknown };
  if (raw.indicators !== undefined && !Array.isArray(raw.indicators)) return null;
  const b = (raw.bands && typeof raw.bands === 'object' ? raw.bands : {}) as Record<string, unknown>;
  const bands: HealthBandsJson = {
    green: num(b.green) ?? DEFAULT_BANDS.green,
    yellow: num(b.yellow) ?? DEFAULT_BANDS.yellow,
    red: num(b.red) ?? DEFAULT_BANDS.red,
  };
  const indicators: HealthIndicatorJson[] = [];
  for (const item of (raw.indicators ?? []) as unknown[]) {
    const ind = parseIndicator(item);
    if (ind) indicators.push(ind);
  }
  return { bands, indicators };
}

/** Config para puntuar: solo indicadores encendidos y con peso > 0. */
export function parseHealthConfig(json: unknown): HealthConfigJson | null {
  const editable = parseHealthConfigEditable(json);
  if (!editable) return null;
  return { bands: editable.bands, indicators: editable.indicators.filter((i) => i.enabled !== false && i.weight > 0) };
}

/** Claves que `indicatorSourceValue` sabe leer de `fn_customer_health`. */
export const HEALTH_SOURCE_KEYS: readonly string[] = [
  'recency', 'days_since_last_invoice', 'frequency', 'invoices_12m', 'ltv', 'revenue_12m', 'avg_ticket',
  'activity', 'days_since_last_activity', 'receivables', 'overdue', 'overdue_ratio', 'overdue_balance',
];

/**
 * Propuesta inicial de «Configuración de factores» cuando la organización aún
 * no tiene fila en `health_score_configs` (Figma 1424:932: cinco factores con
 * pesos 30/25/20/15/10). Los umbrales de ingresos son un punto de partida en
 * la moneda de la organización: se ajustan al guardar.
 */
export const DEFAULT_HEALTH_CONFIG: HealthConfigJson = {
  bands: { green: 70, yellow: 45, red: 0 },
  indicators: [
    { key: 'days_since_last_invoice', label: 'Días desde la última compra', weight: 30, direction: 'lower_better', thresholds: [{ max: 30, score: 100 }, { max: 90, score: 50 }, { min: 91, score: 0 }] },
    { key: 'overdue_ratio', label: 'Cartera vencida (% del saldo)', weight: 25, direction: 'lower_better', thresholds: [{ max: 0, score: 100 }, { max: 0.1, score: 60 }, { max: 0.2, score: 30 }, { min: 0.2, score: 0 }] },
    { key: 'invoices_12m', label: 'Compras en 12 meses', weight: 20, direction: 'higher_better', thresholds: [{ min: 12, score: 100 }, { min: 6, score: 60 }, { min: 0, score: 20 }] },
    { key: 'days_since_last_activity', label: 'Días desde la última actividad', weight: 15, direction: 'lower_better', thresholds: [{ max: 14, score: 100 }, { max: 45, score: 50 }, { min: 46, score: 0 }] },
    { key: 'revenue_12m', label: 'Ingresos 12 meses', weight: 10, direction: 'higher_better', thresholds: [{ min: 100_000_000, score: 100 }, { min: 30_000_000, score: 50 }, { min: 0, score: 0 }] },
  ],
};

export type ErrorConfigSalud = 'sinIndicadores' | 'pesos' | 'clave' | 'bandas';

/**
 * Reglas de «Guardar» (anotación 1424:1606): los pesos de los indicadores
 * encendidos suman 100, cada clave existe en `fn_customer_health` y las
 * bandas son 0 ≤ amarillo < verde ≤ 100.
 */
export function validateHealthConfig(config: HealthConfigJson): ErrorConfigSalud[] {
  const errores: ErrorConfigSalud[] = [];
  const activos = config.indicators.filter((i) => i.enabled !== false);
  if (activos.length === 0) errores.push('sinIndicadores');
  const suma = activos.reduce((s, i) => s + i.weight, 0);
  if (activos.length > 0 && Math.round(suma * 100) / 100 !== 100) errores.push('pesos');
  if (config.indicators.some((i) => !HEALTH_SOURCE_KEYS.includes(i.key))) errores.push('clave');
  const { green, yellow } = config.bands;
  if (!(yellow >= 0 && green <= 100 && yellow < green)) errores.push('bandas');
  return errores;
}

/** Valor de la dimensión `key` a partir de los campos reales de la RPC. */
export function indicatorSourceValue(key: string, row: HealthRpcRow): number | null {
  const invoices = Number(row.invoices_12m) || 0;
  const revenue = Number(row.revenue_12m) || 0;
  switch (key) {
    case 'recency':
    case 'days_since_last_invoice':
      return row.days_since_last_invoice == null ? null : Number(row.days_since_last_invoice);
    case 'frequency':
    case 'invoices_12m':
      return invoices;
    case 'ltv':
    case 'revenue_12m':
      return revenue;
    case 'avg_ticket':
      return invoices > 0 ? revenue / invoices : null;
    case 'activity':
    case 'days_since_last_activity':
      return row.days_since_last_activity == null ? null : Number(row.days_since_last_activity);
    case 'receivables':
    case 'overdue':
    case 'overdue_ratio':
      return Number(row.overdue_ratio) || 0;
    case 'overdue_balance':
      return Number(row.overdue_balance) || 0;
    default:
      return null;
  }
}

/** Peor puntuación posible del indicador (para valores desconocidos). */
function worstScore(ind: HealthIndicatorJson): number {
  return Math.min(...ind.thresholds.map((t) => t.score));
}

export function scoreIndicator(ind: HealthIndicatorJson, value: number | null): number {
  if (value === null || !Number.isFinite(value)) return worstScore(ind);
  if (ind.direction === 'lower_better') {
    const sorted = [...ind.thresholds].filter((t) => t.max !== undefined).sort((a, b) => a.max! - b.max!);
    for (const t of sorted) if (value <= t.max!) return t.score;
    return worstScore(ind);
  }
  const sorted = [...ind.thresholds].filter((t) => t.min !== undefined).sort((a, b) => b.min! - a.min!);
  for (const t of sorted) if (value >= t.min!) return t.score;
  return worstScore(ind);
}

export interface ScoredIndicator {
  key: string;
  label: string;
  weight: number;
  value: number | null;
  score: number;
  weightedScore: number;
}

export interface ConfigScore {
  score: number;
  band: HealthBand;
  indicators: ScoredIndicator[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function bandForScore(score: number, bands: HealthBandsJson = DEFAULT_BANDS): HealthBand {
  if (score >= bands.green) return 'green';
  if (score >= bands.yellow) return 'yellow';
  return 'red';
}

export function bandLabel(band: HealthBand): string {
  return band === 'green' ? 'Saludable' : band === 'yellow' ? 'Atención' : 'Crítico';
}

export function normalizeBand(value: unknown): HealthBand {
  if (value === 'green' || value === 'healthy') return 'green';
  if (value === 'yellow' || value === 'at_risk') return 'yellow';
  return 'red';
}

export function scoreFromConfig(config: HealthConfigJson, row: HealthRpcRow): ConfigScore | null {
  if (!config.indicators.length) return null;
  const totalWeight = config.indicators.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return null;
  const indicators = config.indicators.map((ind) => {
    const value = indicatorSourceValue(ind.key, row);
    const score = clamp(scoreIndicator(ind, value), 0, 100);
    return { key: ind.key, label: ind.label, weight: ind.weight, value, score, weightedScore: (score * ind.weight) / totalWeight };
  });
  const score = clamp(Math.round(indicators.reduce((s, i) => s + i.weightedScore, 0)), 0, 100);
  return { score, band: bandForScore(score, config.bands), indicators };
}

// ─── Alertas ────────────────────────────────────────────────────────────────

export interface HealthAlert {
  code: 'overdue' | 'no_activity' | 'no_invoice';
  severity: 'red' | 'yellow';
  message: string;
}

export interface HealthAlertOptions {
  noActivityDays?: number;
  noInvoiceDays?: number;
  /** Ratio de cartera vencida a partir del cual la alerta es roja. */
  overdueRedRatio?: number;
  /** Moneda de la organización para el importe de la cartera vencida. */
  moneda?: ContextoMoneda | string;
}

/**
 * Importe de la cartera vencida en la moneda de la organización. Sin moneda
 * conocida sale el número sin símbolo: nunca se supone 'COP'.
 */
const formatImporte = (n: number, moneda?: ContextoMoneda | string) =>
  moneda ? formatMoneda(n, moneda) : Math.round(n).toLocaleString(LOCALE_RESPALDO);

export function buildHealthAlerts(row: HealthRpcRow, opts: HealthAlertOptions = {}): HealthAlert[] {
  const noActivityDays = opts.noActivityDays ?? 30;
  const noInvoiceDays = opts.noInvoiceDays ?? 60;
  const overdueRed = opts.overdueRedRatio ?? 0.2;
  const out: HealthAlert[] = [];

  const overdue = Number(row.overdue_balance) || 0;
  const ratio = Number(row.overdue_ratio) || 0;
  if (overdue > 0) {
    const pct = Math.round(ratio * 100);
    out.push({
      code: 'overdue',
      severity: ratio >= overdueRed ? 'red' : 'yellow',
      message: `Cartera vencida: ${formatImporte(overdue, opts.moneda)} (${pct} % de su saldo)`,
    });
  }

  const act = row.days_since_last_activity;
  if (act == null) {
    out.push({ code: 'no_activity', severity: 'yellow', message: 'Sin actividad registrada con este cliente' });
  } else if (act >= noActivityDays) {
    out.push({ code: 'no_activity', severity: act >= noActivityDays * 2 ? 'red' : 'yellow', message: `Sin actividad desde hace ${act} días` });
  }

  const inv = row.days_since_last_invoice;
  if (inv == null) {
    out.push({ code: 'no_invoice', severity: 'yellow', message: 'Sin facturas en los últimos 12 meses' });
  } else if (inv >= noInvoiceDays) {
    out.push({ code: 'no_invoice', severity: inv >= noInvoiceDays * 2 ? 'red' : 'yellow', message: `Sin factura desde hace ${inv} días` });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));
}

// ─── Snapshots (bitácora de tendencia) ──────────────────────────────────────

export interface SnapshotLite {
  score: number;
  created_at: string;
}

export function shouldWriteSnapshot(input: {
  last: SnapshotLite | null;
  score: number;
  now: Date;
  refreshIntervalHours: number | null | undefined;
}): boolean {
  if (!input.last) return true;
  if (input.last.score !== input.score) return true;
  const hours = typeof input.refreshIntervalHours === 'number' && input.refreshIntervalHours > 0 ? input.refreshIntervalHours : 24;
  const lastAt = new Date(input.last.created_at).getTime();
  if (Number.isNaN(lastAt)) return true;
  return input.now.getTime() - lastAt >= hours * 60 * 60 * 1000;
}

export function latestSnapshotByCustomer<T extends { customer_id: string; created_at: string }>(rows: ReadonlyArray<T>): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const cur = out.get(r.customer_id);
    if (!cur || new Date(r.created_at).getTime() > new Date(cur.created_at).getTime()) out.set(r.customer_id, r);
  }
  return out;
}

export function trendDelta(rows: ReadonlyArray<{ score: number }>): number | null {
  if (rows.length < 2) return null;
  return rows[rows.length - 1].score - rows[rows.length - 2].score;
}
