// ============================================================
// Rangos de fechas para reportes y filtros.
//
// Convierte dias calendario de la organizacion (YYYY-MM-DD) en el rango
// de instantes que hay que pedirle a Supabase, que guarda timestamptz.
// Filtrar por "dia UTC" desplaza las ventas de la tarde al dia siguiente.
//
// Todo el calculo de offsets y de horas de pared vive en dateCore.ts:
// aqui no se reimplementa ninguna aritmetica de zonas. En particular,
// el fin de un dia se calcula como "primer instante del dia siguiente
// menos 1 ms", que es lo unico que cubre bien los dias de 23 h (salto
// de primavera) y de 25 h (vuelta al horario estandar).
// ============================================================

import {
  DEFAULT_TIMEZONE,
  formatInstantWithOffset,
  nextPlainDay,
  previousPlainDay,
  startOfDayInstant,
  toPlainDate,
  todayInTz,
  wallTimeToInstant,
} from '@/lib/utils/dateCore';

/**
 * Horas de operacion opcionales para calcular "dias operativos".
 * Si se proveen, getDayRange/getDateRange usan estas horas en vez de
 * 00:00-23:59:59.999. Esto permite que empresas con horarios no
 * estandar (ej: 8pm a 3am) tengan su "dia" correctamente delimitado.
 *
 * - start_time/end_time en formato "HH:mm" (24h) en el timezone dado.
 * - Si end_time < start_time, el dia cruza medianoche (ej: 20:00-03:00).
 */
export interface OperatingHoursOptions {
  start_time?: string | null; // "HH:mm"
  end_time?: string | null;   // "HH:mm"
}

/** Lo que devuelven los helpers que resuelven la zona de la organizacion. */
export interface RangoDeOrganizacion {
  start: string;
  end: string;
  timezone: string;
  operatingHours: OperatingHoursOptions | null;
}

/** Ultimo milisegundo antes de que empiece el dia siguiente. */
function finDelDia(dateString: string, timezone: string): Date {
  return new Date(startOfDayInstant(nextPlainDay(dateString), timezone).getTime() - 1);
}

/** Horas de operacion con las dos puntas puestas. */
type HorasCompletas = OperatingHoursOptions & { start_time: string; end_time: string };

function cruzaMedianoche(horas: HorasCompletas): boolean {
  return horas.start_time >= horas.end_time;
}

function tieneHorasCompletas(horas?: OperatingHoursOptions | null): horas is HorasCompletas {
  return Boolean(horas?.start_time && horas?.end_time);
}

/**
 * Convierte un dia calendario (YYYY-MM-DD) de una zona horaria al rango
 * de instantes que lo cubre exactamente.
 *
 * Ejemplos verificados:
 *   2026-08-15 America/Bogota (sin DST)
 *     -> 2026-08-15T00:00:00.000-05:00 .. 2026-08-15T23:59:59.999-05:00 (24 h)
 *   2026-09-06 America/Santiago (el reloj salta de 23:59 a 01:00)
 *     -> 2026-09-06T01:00:00.000-03:00 .. 2026-09-06T23:59:59.999-03:00 (23 h)
 *   2026-04-04 America/Santiago (las 23:00 se viven dos veces)
 *     -> 2026-04-04T00:00:00.000-03:00 .. 2026-04-04T23:59:59.999-04:00 (25 h)
 *   2026-08-15 America/Bogota con horas 20:00-03:00
 *     -> 2026-08-15T20:00:00.000-05:00 .. 2026-08-16T03:00:00.000-05:00
 *
 * @param dateString Dia calendario YYYY-MM-DD en la zona dada
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @param operatingHours Horas de operacion opcionales ("HH:mm")
 * @returns start y end en ISO con el offset real de cada extremo
 */
export function getDayRange(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): { start: string; end: string } {
  if (!tieneHorasCompletas(operatingHours)) {
    return {
      start: formatInstantWithOffset(startOfDayInstant(dateString, timezone), timezone),
      end: formatInstantWithOffset(finDelDia(dateString, timezone), timezone),
    };
  }

  const inicio = wallTimeToInstant(dateString, operatingHours.start_time, timezone);
  // Si el dia operativo cruza medianoche, termina en el dia siguiente.
  const diaFin = cruzaMedianoche(operatingHours) ? nextPlainDay(dateString) : dateString;
  const fin = wallTimeToInstant(diaFin, operatingHours.end_time, timezone);

  return {
    start: formatInstantWithOffset(inicio, timezone),
    end: formatInstantWithOffset(fin, timezone),
  };
}

/**
 * Convierte un rango de dias calendario al rango de instantes que los
 * cubre. El offset se calcula para CADA extremo: un rango que cruza el
 * cambio de horario (p. ej. 2026-03-01 a 2026-04-01 en Europe/Madrid)
 * empieza en +01:00 y termina en +02:00.
 *
 * @param fechaInicio Dia calendario inicial YYYY-MM-DD
 * @param fechaFin Dia calendario final YYYY-MM-DD (incluido)
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @param operatingHours Horas de operacion opcionales ("HH:mm")
 */
export function getDateRange(
  fechaInicio: string,
  fechaFin: string,
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): { start: string; end: string } {
  if (!tieneHorasCompletas(operatingHours)) {
    return {
      start: formatInstantWithOffset(startOfDayInstant(fechaInicio, timezone), timezone),
      end: formatInstantWithOffset(finDelDia(fechaFin, timezone), timezone),
    };
  }

  const { start } = getDayRange(fechaInicio, timezone, operatingHours);
  const { end } = getDayRange(fechaFin, timezone, operatingHours);
  return { start, end };
}

/**
 * Devuelve el "dia operativo" actual. Si la organizacion tiene horas que
 * cruzan medianoche (ej: 20:00-03:00) y son las 02:00, el dia operativo
 * sigue siendo el del dia anterior.
 *
 * @param timezone Zona horaria IANA
 * @param operatingHours Horas de operacion opcionales
 */
export function getOperatingToday(
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): string {
  if (!tieneHorasCompletas(operatingHours) || !cruzaMedianoche(operatingHours)) {
    return todayInTz(timezone);
  }

  // Hora de pared actual en la zona de la organizacion. El dia y la hora
  // salen del mismo instante: leerlos por separado puede partirse justo
  // en el cambio de dia.
  const ahoraDate = new Date();
  const hoy = toPlainDate(ahoraDate, timezone);
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = dtf.formatToParts(ahoraDate);
  const mapa: Record<string, string> = {};
  for (const p of partes) {
    if (p.type !== 'literal') mapa[p.type] = p.value;
  }
  const hora = parseInt(mapa.hour, 10) === 24 ? 0 : parseInt(mapa.hour, 10);
  const ahora = `${String(hora).padStart(2, '0')}:${mapa.minute}`;

  // Antes del cierre (ej: 02:00 < 03:00): seguimos en el dia anterior.
  return ahora < operatingHours.end_time ? previousPlainDay(hoy) : hoy;
}

/**
 * Timezone + horas de operacion de una organizacion y el rango UTC de un
 * dia operativo completo, en una sola llamada.
 */
export async function getOrgDayRange(
  organizationId: number,
  dateString: string,
): Promise<RangoDeOrganizacion> {
  const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
  const { getOperatingHours } = await import('@/lib/services/organizationOperatingHoursService');

  const [timezone, operatingHours] = await Promise.all([
    getOrganizationTimezone(organizationId),
    getOperatingHours(organizationId),
  ]);

  const { start, end } = getDayRange(dateString, timezone, operatingHours);
  return { start, end, timezone, operatingHours };
}

/**
 * Timezone + horas de operacion de una organizacion y el rango UTC de un
 * rango de fechas, en una sola llamada.
 *
 * @param overrideHours Horas que sobreescriben las de la organizacion
 *                      (filtro manual de horas en reportes).
 */
export async function getOrgDateRange(
  organizationId: number,
  fechaInicio: string,
  fechaFin: string,
  overrideHours?: OperatingHoursOptions | null,
): Promise<RangoDeOrganizacion> {
  const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
  const { getOperatingHours } = await import('@/lib/services/organizationOperatingHoursService');

  const [timezone, orgHours] = await Promise.all([
    getOrganizationTimezone(organizationId),
    getOperatingHours(organizationId),
  ]);

  const operatingHours = tieneHorasCompletas(overrideHours) ? overrideHours : orgHours;

  const { start, end } = getDateRange(fechaInicio, fechaFin, timezone, operatingHours);
  return { start, end, timezone, operatingHours };
}
