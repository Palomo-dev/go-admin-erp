/**
 * F14 — rango de fechas de Revenue OS (puro, sin `Date` de zona local).
 *
 * Las RPC (`fn_revenue_metrics`, `fn_cohort_retention`) reciben `date` y
 * filtran `>= p_start AND < p_end`: el fin es EXCLUSIVO. Por defecto se piden
 * los últimos 12 meses completos más el mes en curso, calculados sobre el día
 * de hoy en la zona horaria de la organización (`todayInTz(tz)`), nunca sobre
 * `toISOString()`.
 *
 * Todo trabaja con cadenas `YYYY-MM-DD` (día calendario), ver
 * `docs/reglas-fechas-timezone.md`.
 */

export interface DateRange {
  /** Inclusivo, YYYY-MM-DD. */
  start: string;
  /** Exclusivo, YYYY-MM-DD. */
  end: string;
}

export class DateRangeError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_DATE_RANGE';
  constructor(message: string) {
    super(message);
    this.name = 'DateRangeError';
  }
}

/** Tope del rango consultable: evita barridos de años enteros contra las RPC. */
export const MAX_RANGE_MONTHS = 36;
/** Meses hacia atrás del rango por defecto. */
export const DEFAULT_RANGE_MONTHS = 12;

const PLAIN_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida YYYY-MM-DD y que el día exista (29/02 en año no bisiesto → inválido). */
export function isValidPlainDate(value: string): boolean {
  const m = PLAIN_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

function firstOfMonth(plain: string): string {
  return `${plain.slice(0, 7)}-01`;
}

/** Suma meses a un YYYY-MM-DD conservando el día (se recorta si el mes es más corto). */
export function addMonthsPlain(plain: string, months: number): string {
  const [y, m, d] = plain.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const daysInMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, daysInMonth);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** Diferencia aproximada en meses (a efectos del tope, con fracción por días). */
function monthsBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + (ed - sd) / 31;
}

/**
 * Rango por defecto para `today` (YYYY-MM-DD en la zona de la organización):
 * desde el primer día del mes de hace 12 meses hasta el primer día del mes
 * siguiente (exclusivo) — es decir, 12 meses cerrados + el mes en curso.
 */
export function defaultRange(today: string): DateRange {
  const endExclusive = addMonthsPlain(firstOfMonth(today), 1);
  return { start: addMonthsPlain(endExclusive, -DEFAULT_RANGE_MONTHS), end: endExclusive };
}

/**
 * Resuelve `start`/`end` de la query string. Lanza `DateRangeError` (400) si
 * el formato es inválido, si `end < start` o si el rango supera 36 meses.
 * Nunca acepta la organización: esa sale del contexto de sesión.
 */
export function resolveDateRange(start: string | null, end: string | null, today: string): DateRange {
  const def = defaultRange(today);
  const s = start?.trim() || null;
  const e = end?.trim() || null;
  if (s !== null && !isValidPlainDate(s)) throw new DateRangeError('Fecha de inicio inválida: usa YYYY-MM-DD');
  if (e !== null && !isValidPlainDate(e)) throw new DateRangeError('Fecha de fin inválida: usa YYYY-MM-DD');

  const resolvedEnd = e ?? def.end;
  const resolvedStart = s ?? (e ? addMonthsPlain(e, -DEFAULT_RANGE_MONTHS) : def.start);

  if (resolvedEnd < resolvedStart) throw new DateRangeError('La fecha de fin debe ser posterior o igual a la de inicio');
  if (monthsBetween(resolvedStart, resolvedEnd) > MAX_RANGE_MONTHS) {
    throw new DateRangeError(`El rango máximo es de ${MAX_RANGE_MONTHS} meses`);
  }
  return { start: resolvedStart, end: resolvedEnd };
}
