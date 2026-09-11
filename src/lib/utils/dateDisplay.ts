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
// 2. Un dia calendario (columna date pura, YYYY-MM-DD) se formatea con formatPlainDate (NO convierte).
// 3. toISOString().split('T')[0] esta prohibido para derivar una fecha.
// 4. La zona horaria nunca se hardcodea; sale de getOrganizationTimezone.
//
// DISTINCION CRITICA:
// - valor que viene de un timestamptz -> formatDateInTz (convierte)
// - valor que viene de un date -> formatPlainDate (NO convierte)
// Confundir estos dos casos es exactamente lo que produjo el bug original.
// ============================================================

import { getToday, getOffsetMinutesForTimezone, offsetMinutesToISO } from '@/lib/utils/timezone';

/** Zona horaria IANA por defecto (Colombia). Usar solo como fallback. */
const DEFAULT_TIMEZONE = 'America/Bogota';

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

  const { locale: _locale, ...formatOpts } = (opts ?? {}) as Intl.DateTimeFormatOptions & { locale?: string };
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
 * Devuelve el dia calendario actual en la zona horaria dada como
 * YYYY-MM-DD. Reexporta getToday de timezone.ts para tener una sola
 * API de fechas en la app.
 *
 * @param timezone Zona horaria IANA (default: America/Bogota)
 * @returns Fecha actual en formato YYYY-MM-DD
 */
export function todayInTz(timezone: string = DEFAULT_TIMEZONE): string {
  return getToday(timezone);
}

/**
 * Convierte un Date local del navegador (de un <DatePicker/>) a
 * YYYY-MM-DD en la zona horaria de la organizacion.
 *
 * Esto es necesario porque el DatePicker devuelve un Date a medianoche
 * local, y necesitamos saber que dia calendario representa en la zona
 * de la organizacion (no en la zona del navegador del usuario).
 *
 * @param date Date del navegador (ej: de un DatePicker)
 * @param timezone Zona horaria IANA de la organizacion
 * @returns Dia calendario en la zona de la org como YYYY-MM-DD
 */
export function toPlainDate(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  if (isNaN(date.getTime())) return '';
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produce YYYY-MM-DD directamente
  return dtf.format(date);
}

/**
 * Construye un instante ISO con offset a partir de un dia calendario
 * (YYYY-MM-DD) y una hora opcional en la zona horaria de la organizacion.
 * Listo para guardar en una columna timestamptz.
 *
 * @param plain Dia calendario en formato YYYY-MM-DD
 * @param timezone Zona horaria IANA de la organizacion
 * @param time Hora en formato HH:mm (default: "00:00")
 * @returns String ISO con offset (ej: "2026-09-10T20:30:00-05:00")
 */
export function plainDateToInstant(
  plain: string,
  timezone: string = DEFAULT_TIMEZONE,
  time: string = '00:00',
): string {
  // Reusa el calculo de offset de timezone.ts (unica implementacion).
  const refDate = new Date(`${plain}T12:00:00Z`);
  const offsetMinutes = getOffsetMinutesForTimezone(timezone, refDate);
  const offsetISO = offsetMinutesToISO(offsetMinutes);
  return `${plain}T${time}:00.000${offsetISO}`;
}
