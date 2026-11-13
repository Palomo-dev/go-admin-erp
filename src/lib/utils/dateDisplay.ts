// ============================================================
// Capa canonica de formateo de fechas para toda la aplicacion.
//
// PROBLEMA QUE RESUELVE:
// El viejo parseLocalDate/formatDate (src/utils/Utils.ts) hacia
// split('T')[0] sobre timestamptz, descartando el offset y
// quedandose con el dia calendario UTC en lugar del dia calendario
// de la zona horaria de la organizacion. Esto producia que ventas
// hechas despues de las 19:00 hora Bogota se mostraran con la
// fecha del dia siguiente.
//
// REGLAS (ver docs/PROMPT-fix-fechas-timezone.md seccion 3):
// 1. Un instante (timestamptz) se formatea con formatDateInTz (convierte a la TZ de la org).
// 2. Un dia calendario (columna date pura, YYYY-MM-DD) se formatea con
//    formatPlainDate (NO convierte).
// 3. toISOString().split('T')[0] esta prohibido para derivar una fecha.
// 4. La zona horaria nunca se hardcodea; sale de getOrganizationTimezone.
//
// DISTINCION CRITICA:
// - valor que viene de un timestamptz -> formatDateInTz (convierte)
// - valor que viene de un date -> formatPlainDate (NO convierte)
// Confundir estos dos casos es exactamente lo que produjo el bug original.
//
// ALCANCE (fase A2): aqui solo vive el FORMATEO para la interfaz. El
// calculo de dias, instantes y offsets esta en dateCore.ts y los rangos
// en dateRanges.ts; '@/lib/utils/timezone' es la fachada de todo ello.
// ============================================================

import {
  DEFAULT_TIMEZONE,
  addPlainDays as addPlainDaysCore,
  toPlainDate as toPlainDateCore,
} from '@/lib/utils/dateCore';

// Dia calendario e instantes: una sola implementacion, en dateCore.ts.
// Se reexportan aqui porque la mitad del repositorio los importa de
// '@/lib/utils/dateDisplay' y la documentacion los nombra en este modulo.
export {
  addPlainDays,
  nextPlainDay,
  plainDateToInstant,
  previousPlainDay,
  toPlainDate,
  todayInTz,
} from '@/lib/utils/dateCore';

/**
 * Brand type para distinguir un dia calendario puro (YYYY-MM-DD)
 * de un instante (timestamptz). Confundirlos es la raiz del bug.
 */
export type PlainDate = string & { readonly __brand: 'PlainDate' };

/**
 * Marca un string YYYY-MM-DD como PlainDate (dia calendario puro).
 * Usar cuando se lee de una columna SQL tipo date (no timestamptz).
 */
export function asPlainDate(value: string): PlainDate {
  return value as PlainDate;
}

/**
 * Formatea un instante (timestamptz) como dia calendario en la zona
 * horaria de la organizacion. Formato por defecto: dd/MM/yyyy.
 *
 * USA ESTA FUNCION cuando el valor viene de una columna timestamptz
 * (ej: sales.sale_date, invoice_sales.issue_date, payments.payment_date).
 *
 * Si se pasan opciones de formato adicionales (ej: `{ weekday: 'short' }`,
 * `{ month: 'long', year: 'numeric' }`), se usan en lugar del formato por
 * defecto, siempre con `timeZone` de la organizacion.
 *
 * @param value Instante a formatear (string ISO, Date, o null/undefined)
 * @param timezone Zona horaria IANA de la organizacion
 * @param opts Opciones opcionales (locale, y cualquier Intl.DateTimeFormatOptions)
 * @returns Fecha formateada como dd/MM/yyyy por defecto, o '' si el valor es nulo
 */
export function formatDateInTz(
  value: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  opts?: { locale?: string } & Intl.DateTimeFormatOptions,
): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';

  const locale = opts?.locale ?? 'es-ES';
  // Extraer locale de las opciones de formato restantes
  const { locale: _locale, ...formatOpts } = opts ?? {};
  const hasFormatOpts = Object.keys(formatOpts).length > 0;
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...(hasFormatOpts ? formatOpts : { day: '2-digit', month: '2-digit', year: 'numeric' }),
  });
  return dtf.format(date);
}

/**
 * Formatea un instante (timestamptz) como fecha y hora en la zona
 * horaria de la organizacion. Formato: dd/MM/yyyy HH:mm.
 *
 * @param value Instante a formatear (string ISO, Date, o null/undefined)
 * @param timezone Zona horaria IANA de la organizacion
 * @param opts Opciones opcionales (locale)
 * @returns Fecha y hora formateadas, o '' si el valor es nulo
 */
export function formatDateTimeInTz(
  value: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  opts?: { locale?: string } & Intl.DateTimeFormatOptions,
): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';

  const locale = (opts as { locale?: string })?.locale ?? 'es-ES';
  const { locale: _locale, ...formatOpts } = opts ?? {};
  const hasFormatOpts = Object.keys(formatOpts).length > 0;
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(hasFormatOpts ? formatOpts : {}),
  });
  // Intl con es-ES produce "11/09/2026, 20:30" — quitar la coma.
  return dtf.format(date).replace(',', '');
}

/**
 * Formatea un instante (timestamptz) como solo hora en la zona
 * horaria de la organizacion. Formato: HH:mm.
 *
 * @param value Instante a formatear (string ISO, Date, o null/undefined)
 * @param timezone Zona horaria IANA de la organizacion
 * @returns Hora formateada como HH:mm, o '' si el valor es nulo
 */
export function formatTimeInTz(
  value: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';

  const opciones = (opts ?? {}) as Intl.DateTimeFormatOptions & { locale?: string };
  const { locale: _locale, ...formatOpts } = opciones;
  const hasFormatOpts = Object.keys(formatOpts).length > 0;
  const dtf = new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(hasFormatOpts ? formatOpts : {}),
  });
  return dtf.format(date);
}

/**
 * Formatea una fecha pura (columna SQL tipo date, YYYY-MM-DD) como
 * dd/MM/yyyy. NO convierte zona horaria: un date puro ya es un dia
 * calendario, no un instante.
 *
 * USA ESTA FUNCION cuando el valor viene de una columna date (no
 * timestamptz). Ej: quotations.issue_date, housekeeping_tasks.task_date.
 *
 * @param value Fecha en formato YYYY-MM-DD, o null/undefined
 * @returns Fecha formateada como dd/MM/yyyy, o '' si el valor es nulo
 */
export function formatPlainDate(
  value: string | PlainDate | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return '';

  // Aceptar tanto "2026-09-10" como "2026-09-10T..." (algunas APIs
  // devuelven date como ISO con T00:00:00). Tomar solo la parte de fecha.
  const datePart = typeof value === 'string' ? value.split('T')[0] : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';

  // Si hay opciones de formato, usar Intl con fecha neutra (mediodía UTC)
  if (opts && Object.keys(opts).length > 0) {
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('es-ES', opts).format(date);
  }

  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Estimación (hora prometida) en la zona de la organización, partida para
 * poder redactarla: el día relativo cuando es hoy o mañana y, si no, la fecha
 * corta ("mié 11 nov"). Las promesas a otro día no pueden perder la fecha
 * (caso real 2026-11-08: el aviso decía "14:26" de un pedido para el 11-nov).
 */
export interface EstimacionEnZona {
  /** 'hoy' | 'mañana' cuando aplica; null para otro día. */
  relativo: 'hoy' | 'mañana' | null;
  /** Día corto en la zona de la org, p. ej. "mié 11 nov". */
  fecha: string;
  /** Hora HH:mm en la zona de la org. */
  hora: string;
}

export function estimacionEnZona(
  value: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  ahora: Date = new Date(),
): EstimacionEnZona | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;

  const dia = toPlainDateCore(date, timezone);
  const hoy = toPlainDateCore(ahora, timezone);
  const relativo = dia === hoy ? 'hoy' : dia === addPlainDaysCore(hoy, 1) ? 'mañana' : null;
  const partes = new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date);
  const parte = (tipo: string) => (partes.find((p) => p.type === tipo)?.value ?? '').replace(/\./g, '');
  return {
    relativo,
    fecha: `${parte('weekday')} ${parte('day')} ${parte('month')}`,
    hora: formatTimeInTz(date, timezone),
  };
}

/**
 * Estimación como texto corto para una fila o etiqueta: "hoy, 14:26",
 * "mañana, 14:26" o "mié 11 nov, 14:26". `formatTimeInTz` sigue siendo solo
 * la hora: úsala para lo que de verdad es del mismo día (comandas, registros).
 */
export function formatEstimateInTz(
  value: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  ahora: Date = new Date(),
): string {
  const e = estimacionEnZona(value, timezone, ahora);
  if (!e) return '';
  return `${e.relativo ?? e.fecha}, ${e.hora}`;
}
