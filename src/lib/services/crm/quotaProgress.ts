/**
 * F13 — progreso de cuota: lógica pura sobre días calendario.
 *
 * Todo trabaja con `YYYY-MM-DD` (columna `date` de `sales_targets`), nunca con
 * `Date` local ni `toISOString().split('T')[0]` (regla de fechas de CLAUDE.md).
 * El «hoy» lo aporta quien llama con `todayInTz(tz)`.
 */

import { toPlainDate } from '@/lib/utils/dateDisplay';

export type QuotaPeriod = 'monthly' | 'quarterly' | 'yearly';
export type QuotaType = 'revenue' | 'deals' | 'activities' | 'calls';
export type QuotaStatus = 'en_ritmo' | 'atrasado' | 'cumplida' | 'vencida';

export const QUOTA_PERIODS: readonly QuotaPeriod[] = ['monthly', 'quarterly', 'yearly'];
export const QUOTA_TYPES: readonly QuotaType[] = ['revenue', 'deals', 'activities', 'calls'];

export const QUOTA_PERIOD_LABELS: Record<QuotaPeriod, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export const QUOTA_TYPE_LABELS: Record<QuotaType, string> = {
  revenue: 'Ingresos',
  deals: 'Negocios ganados',
  activities: 'Actividades',
  calls: 'Llamadas',
};

const PLAIN_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(plain: string): [number, number, number] {
  const [y, m, d] = plain.split('-').map(Number);
  return [y, m, d];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toPlain(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Días transcurridos entre dos días calendario (b − a), sin zona horaria. */
export function daysBetweenPlain(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Suma (o resta) días a un día calendario. */
export function addDaysPlain(plain: string, days: number): string {
  const [y, m, d] = parts(plain);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toPlain(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function isWithinPeriod(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/** Límites naturales del periodo que contiene el día dado. */
export function periodBoundsFor(period: QuotaPeriod, day: string): { period_start: string; period_end: string } {
  const [y, m] = parts(day);
  if (period === 'yearly') return { period_start: toPlain(y, 1, 1), period_end: toPlain(y, 12, 31) };
  if (period === 'quarterly') {
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    const lastDay = new Date(Date.UTC(y, qStart + 2, 0)).getUTCDate();
    return { period_start: toPlain(y, qStart, 1), period_end: toPlain(y, qStart + 2, lastDay) };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { period_start: toPlain(y, m, 1), period_end: toPlain(y, m, lastDay) };
}

export interface QuotaProgressInput {
  target_amount: number;
  achieved_amount: number;
  period_start: string;
  period_end: string;
  /** `todayInTz(tz)` de la organización. */
  today: string;
}

export interface QuotaProgress {
  /** Porcentaje visible, acotado a [0, 100]. */
  pct: number;
  /** Porcentaje real (puede superar 100). */
  raw_pct: number;
  remaining: number;
  days_total: number;
  days_elapsed: number;
  days_remaining: number;
  /** Porcentaje del periodo transcurrido, [0, 100]. */
  time_pct: number;
  /** Ritmo diario necesario para cerrar la cuota en los días que quedan. */
  needed_per_day: number;
  status: QuotaStatus;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computeQuotaProgress(input: QuotaProgressInput): QuotaProgress {
  const target = Number(input.target_amount) || 0;
  const achieved = Math.max(0, Number(input.achieved_amount) || 0);
  const rawPct = target > 0 ? Math.round((achieved / target) * 100) : 0;
  const pct = clamp(rawPct, 0, 100);
  const remaining = Math.max(0, target - achieved);

  const daysTotal = Math.max(1, daysBetweenPlain(input.period_start, input.period_end) + 1);
  // Días ya consumidos ANTES de hoy (hoy cuenta como restante).
  const elapsedRaw = daysBetweenPlain(input.period_start, input.today);
  const daysElapsed = clamp(elapsedRaw, 0, daysTotal);
  const daysRemaining = daysTotal - daysElapsed;
  const timePct = clamp(Math.round((daysElapsed / daysTotal) * 100), 0, 100);
  const neededPerDay = remaining <= 0 ? 0 : daysRemaining > 0 ? Math.ceil(remaining / daysRemaining) : remaining;

  let status: QuotaStatus;
  if (target > 0 && achieved >= target) status = 'cumplida';
  else if (input.today > input.period_end) status = 'vencida';
  else status = rawPct >= timePct ? 'en_ritmo' : 'atrasado';

  return {
    pct,
    raw_pct: rawPct,
    remaining,
    days_total: daysTotal,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    time_pct: timePct,
    needed_per_day: neededPerDay,
    status,
  };
}

export function quotaStatusLabel(status: QuotaStatus): string {
  switch (status) {
    case 'cumplida':
      return 'Cuota cumplida';
    case 'vencida':
      return 'Periodo cerrado sin cumplir';
    case 'atrasado':
      return 'Por debajo del ritmo';
    default:
      return 'En ritmo';
  }
}

export interface QuotaInput {
  period: QuotaPeriod;
  period_start: string;
  period_end: string;
  target_amount: number;
  target_type: QuotaType;
  /** Ausente cuando el body no la trae: la ruta la fija con la moneda base de la organización. */
  target_currency?: string;
}

export type QuotaValidation =
  | { ok: true; value: QuotaInput }
  | { ok: false; field: keyof QuotaInput; message: string };

const COUNT_TYPES: readonly QuotaType[] = ['deals', 'activities', 'calls'];

/**
 * ¿Es un día calendario REAL? La forma `YYYY-MM-DD` no basta: `2026-02-31`
 * la cumple y Postgres la rechazaría en el INSERT. Se parsea con
 * `toPlainDate` de `dateDisplay.ts` (ida y vuelta en UTC): una fecha
 * inexistente se «corre» al día siguiente y ya no coincide consigo misma.
 */
export function isRealPlainDate(plain: string): boolean {
  if (!PLAIN_RE.test(plain)) return false;
  return toPlainDate(new Date(`${plain}T12:00:00Z`), 'UTC') === plain;
}

/**
 * Decisión de la ronda 2: los límites deben ser el periodo NATURAL completo
 * (`monthly` = del 1 al último día del mes; `quarterly` = trimestre natural;
 * `yearly` = año natural). No se admite tolerancia de ±3 días: el formulario
 * siempre deriva los límites con `periodBoundsFor`, el widget elige la cuota
 * «vigente» por periodo natural y la UNIQUE de `sales_targets` incluye
 * `period_start`; un periodo a medida rompería las tres cosas a la vez.
 */
const NATURAL_NAME: Record<QuotaPeriod, string> = { monthly: 'mes natural', quarterly: 'trimestre natural', yearly: 'año natural' };

export function checkNaturalPeriod(period: QuotaPeriod, start: string, end: string): { field: 'period_start' | 'period_end'; message: string } | null {
  const expected = periodBoundsFor(period, start);
  const name = QUOTA_PERIOD_LABELS[period].toLowerCase();
  const natural = NATURAL_NAME[period];
  if (expected.period_start !== start) {
    return { field: 'period_start', message: `Una cuota ${name} empieza el primer día del ${natural} (${expected.period_start}).` };
  }
  if (expected.period_end !== end) {
    return { field: 'period_end', message: `Una cuota ${name} cubre el ${natural} completo: del ${expected.period_start} al ${expected.period_end}.` };
  }
  return null;
}

/** Valida el body de una cuota (servidor y formulario comparten esta regla). */
export function validateQuotaInput(raw: Record<string, unknown>): QuotaValidation {
  const period = raw.period as QuotaPeriod;
  if (!QUOTA_PERIODS.includes(period)) return { ok: false, field: 'period', message: 'Periodo inválido: mensual, trimestral o anual.' };
  const targetType = (raw.target_type ?? 'revenue') as QuotaType;
  if (!QUOTA_TYPES.includes(targetType)) return { ok: false, field: 'target_type', message: 'Tipo de cuota inválido.' };
  const start = String(raw.period_start ?? '');
  const end = String(raw.period_end ?? '');
  if (!isRealPlainDate(start)) return { ok: false, field: 'period_start', message: 'Fecha de inicio inválida (YYYY-MM-DD, un día que exista).' };
  if (!isRealPlainDate(end)) return { ok: false, field: 'period_end', message: 'Fecha de fin inválida (YYYY-MM-DD, un día que exista).' };
  if (end < start) return { ok: false, field: 'period_end', message: 'La fecha de fin debe ser posterior al inicio.' };
  const natural = checkNaturalPeriod(period, start, end);
  if (natural) return { ok: false, ...natural };
  const amount = typeof raw.target_amount === 'number' ? raw.target_amount : Number(raw.target_amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, field: 'target_amount', message: 'La meta debe ser un número mayor que cero.' };
  if (COUNT_TYPES.includes(targetType) && !Number.isInteger(amount)) return { ok: false, field: 'target_amount', message: 'Para conteos la meta debe ser un entero.' };
  const value: QuotaInput = { period, period_start: start, period_end: end, target_amount: amount, target_type: targetType };
  if (raw.target_currency != null && String(raw.target_currency).trim() !== '') {
    const currency = String(raw.target_currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, field: 'target_currency', message: 'Moneda inválida (código ISO de 3 letras).' };
    value.target_currency = currency;
  }
  return { ok: true, value };
}

const PATCHABLE: readonly (keyof QuotaInput)[] = ['period', 'period_start', 'period_end', 'target_amount', 'target_type', 'target_currency'];

export type QuotaPatch = Partial<QuotaInput>;
export type QuotaPatchValidation =
  | { ok: true; value: QuotaPatch }
  | { ok: false; field: keyof QuotaInput | 'body'; message: string };

/**
 * PATCH parcial validado CONTRA LA FILA EXISTENTE: se fusiona el patch con la
 * cuota actual y se valida el resultado completo (coherencia periodo ↔ límites,
 * fecha real, entero para conteos). Solo los campos enviados viajan al UPDATE;
 * `achieved_amount` y `organization_id` nunca vienen del cliente.
 */
export function validateQuotaPatch(raw: Record<string, unknown>, existing: QuotaInput): QuotaPatchValidation {
  const sent = PATCHABLE.filter((k) => raw[k] !== undefined);
  if (sent.length === 0) return { ok: false, field: 'body', message: 'Nada que actualizar' };
  const merged: Record<string, unknown> = { ...existing };
  for (const k of sent) merged[k] = raw[k];
  const v = validateQuotaInput(merged);
  if (!v.ok) return v;
  const value: QuotaPatch = {};
  for (const k of sent) (value as Record<string, unknown>)[k] = v.value[k];
  return { ok: true, value };
}
