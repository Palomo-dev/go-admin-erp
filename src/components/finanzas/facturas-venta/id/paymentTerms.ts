import { toPlainDate } from '@/lib/utils/dateDisplay';

const MILISEGUNDOS_POR_DIA = 86_400_000;

type InstantValue = string | Date | null | undefined;

interface CalcularEstadoVencimientoParams {
  dueDate: InstantValue;
  issueDate: InstantValue;
  paymentTerms: number;
  today: string;
  timezone: string;
}

function plainDateToUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return utc;
}

function instantToOrgPlainDate(value: Exclude<InstantValue, null | undefined>, timezone: string): string | null {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  return toPlainDate(instant, timezone) || null;
}

function addDaysToPlainDate(value: string, days: number): string | null {
  const utc = plainDateToUtc(value);
  if (utc === null || !Number.isInteger(days)) return null;

  const result = new Date(utc + days * MILISEGUNDOS_POR_DIA);
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Calcula el estado del vencimiento usando dias calendario de la organizacion.
 * `dueDate` e `issueDate` son instantes (`timestamptz`), nunca strings de display.
 */
export function calcularEstadoVencimientoFactura({
  dueDate,
  issueDate,
  paymentTerms,
  today,
  timezone,
}: CalcularEstadoVencimientoParams): string | null {
  const todayUtc = plainDateToUtc(today);
  if (todayUtc === null) return null;

  let duePlainDate: string | null;

  if (dueDate !== null && dueDate !== undefined) {
    duePlainDate = instantToOrgPlainDate(dueDate, timezone);
  } else if (issueDate !== null && issueDate !== undefined) {
    const issuePlainDate = instantToOrgPlainDate(issueDate, timezone);
    duePlainDate = issuePlainDate
      ? addDaysToPlainDate(issuePlainDate, paymentTerms)
      : null;
  } else {
    duePlainDate = null;
  }

  if (!duePlainDate) return null;

  const dueUtc = plainDateToUtc(duePlainDate);
  if (dueUtc === null) return null;

  const remainingDays = (dueUtc - todayUtc) / MILISEGUNDOS_POR_DIA;

  if (remainingDays > 0) {
    return `${remainingDays} ${remainingDays === 1 ? 'día restante' : 'días restantes'}`;
  }

  if (remainingDays === 0) return 'vence hoy';

  const overdueDays = Math.abs(remainingDays);
  return `vencido hace ${overdueDays} ${overdueDays === 1 ? 'día' : 'días'}`;
}
