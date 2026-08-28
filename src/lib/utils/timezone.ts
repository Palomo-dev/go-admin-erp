// ============================================================
// Utilidades de zona horaria para reportes y filtros de fecha.
//
// Las tablas de Supabase usan timestamptz y almacenan el instante
// exacto en UTC. El problema surge cuando los reportes filtran por
// "dia calendario UTC" (T00:00:00Z .. T23:59:59Z) en lugar de
// "dia calendario de la zona horaria de la organizacion", lo que
// desplaza al dia siguiente las ventas hechas despues de cierta
// hora segun el offset de la zona horaria.
//
// Estas utilidades convierten un dia calendario (YYYY-MM-DD) en una
// zona horaria arbitraria al rango UTC equivalente que cubre
// exactamente ese dia completo en esa zona horaria.
//
// El timezone se obtiene por organizacion (ver
// organizationTimezoneService) y se pasa como parametro a las
// funciones de esta utilidad, evitando hardcodear una zona horaria
// especifica.
// ============================================================

/** Zona horaria IANA por defecto (Colombia). Usar solo como fallback. */
export const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * Devuelve el offset en minutos de una zona horaria IANA para una
 * fecha dada. Maneja correctamente horario de verano (DST) cuando
 * aplica al timezone indicado.
 *
 * @param timezone Zona horaria IANA (ej: 'America/Bogota', 'America/Mexico_City')
 * @param date Fecha para la cual calcular el offset (DST puede cambiarlo)
 * @returns Offset en minutos (ej: -300 para UTC-5, -240 para UTC-4 con DST)
 */
function getOffsetMinutesForTimezone(timezone: string, date: Date): number {
  // Usar Intl.DateTimeFormat para obtener los componentes de fecha
  // interpretados en el timezone indicado.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Algunos navegadores devuelven "24" para medianoche con hour12: false
  const hour = parseInt(map.hour, 10) === 24 ? 0 : parseInt(map.hour, 10);

  // Construir el instante UTC interpretando los componentes del
  // timezone como si fueran UTC.
  const tzAsUTC = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    hour,
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  );

  // El offset del timezone es la diferencia entre el instante
  // interpretado como UTC y el instante real.
  // Ej: si en UTC-5 son las 12:00, el instante real es 17:00 UTC.
  // tzAsUTC = 12:00 UTC, date.getTime() = 17:00 UTC
  // offset = (tzAsUTC - date.getTime()) / 60000 = -300 (UTC-5)
  return (tzAsUTC - date.getTime()) / 60000;
}

/**
 * Convierte minutos de offset a string de offset ISO (ej: -300 -> "-05:00").
 */
function offsetMinutesToISO(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Horas de operación opcionales para calcular "días operativos".
 * Si se proveen, getDayRange/getDateRange usan estas horas en vez de
 * 00:00-23:59:59.999. Esto permite que empresas con horarios no
 * estándar (ej: 8pm a 3am) tengan su "día" correctamente delimitado.
 *
 * - start_time/end_time en formato "HH:mm" (24h) en el timezone dado.
 * - Si end_time < start_time, el día cruza medianoche (ej: 20:00-03:00).
 */
export interface OperatingHoursOptions {
  start_time?: string | null; // "HH:mm"
  end_time?: string | null;   // "HH:mm"
}

/**
 * Devuelve el día siguiente a una fecha YYYY-MM-DD como YYYY-MM-DD.
 */
function nextDay(dateString: string): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Devuelve el día anterior a una fecha YYYY-MM-DD como YYYY-MM-DD.
 */
function previousDay(dateString: string): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/**
 * Construye un timestamp ISO UTC a partir de una fecha YYYY-MM-DD,
 * una hora "HH:mm" y el offset ISO del timezone.
 * Ej: ("2026-08-15", "20:00", "+05:00") -> "2026-08-15T20:00:00.000+05:00"
 *     que en UTC equivale a "2026-08-15T15:00:00.000Z"
 */
function buildTimestamp(dateString: string, time: string, offsetISO: string): string {
  return `${dateString}T${time}:00.000${offsetISO}`;
}

/**
 * Convierte un dia calendario (YYYY-MM-DD) en una zona horaria
 * arbitraria al rango UTC equivalente que cubre exactamente ese dia
 * completo en esa zona horaria.
 *
 * Si se proveen operatingHours con start_time/end_time, el rango usa
 * esas horas en vez de 00:00-23:59:59.999. Esto soporta días operativos
 * que cruzan medianoche (ej: 20:00-03:00 → inicio el día X a las 20:00,
 * fin el día X+1 a las 03:00).
 *
 * Ejemplo para el 2026-08-15 en America/Bogota (UTC-5):
 *   Sin horas: start: 2026-08-15T05:00:00Z, end: 2026-08-16T04:59:59.999Z
 *   Con horas 20:00-03:00: start: 2026-08-16T01:00:00Z (20:00 Bogota),
 *                         end:   2026-08-16T08:00:00Z (03:00 Bogota del día siguiente)
 *
 * @param dateString Fecha en formato YYYY-MM-DD (dia en la zona horaria dada)
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @param operatingHours Horas de operación opcionales (start_time/end_time "HH:mm")
 * @returns Objeto con start y end en formato ISO UTC (Z) para usar en filtros Supabase
 */
export function getDayRange(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): { start: string; end: string } {
  // Sin horas de operación: comportamiento original (00:00 - 23:59:59.999)
  if (!operatingHours?.start_time || !operatingHours?.end_time) {
    const refDate = new Date(`${dateString}T12:00:00Z`);
    const offsetMinutes = getOffsetMinutesForTimezone(timezone, refDate);
    const offsetISO = offsetMinutesToISO(offsetMinutes);
    const start = `${dateString}T00:00:00.000${offsetISO}`;
    const end = `${dateString}T23:59:59.999${offsetISO}`;
    return { start, end };
  }

  // Con horas de operación: calcular offsets para inicio y fin
  // (pueden differir si hay cambio de DST)
  const startTime = operatingHours.start_time;
  const endTime = operatingHours.end_time;
  const crossesMidnight = startTime >= endTime;

  // Offset para la fecha de inicio
  const refInicio = new Date(`${dateString}T12:00:00Z`);
  const offsetInicio = getOffsetMinutesForTimezone(timezone, refInicio);
  const offsetISOInicio = offsetMinutesToISO(offsetInicio);

  const start = buildTimestamp(dateString, startTime, offsetISOInicio);

  // Si el día cruza medianoche, el fin es el día siguiente a endTime
  // Si no cruza, el fin es el mismo día a endTime
  let endDateString: string;
  let offsetISOFin: string;

  if (crossesMidnight) {
    endDateString = nextDay(dateString);
    const refFin = new Date(`${endDateString}T12:00:00Z`);
    const offsetFin = getOffsetMinutesForTimezone(timezone, refFin);
    offsetISOFin = offsetMinutesToISO(offsetFin);
  } else {
    endDateString = dateString;
    offsetISOFin = offsetISOInicio;
  }

  const end = buildTimestamp(endDateString, endTime, offsetISOFin);

  return { start, end };
}

/**
 * Convierte un rango de fechas (YYYY-MM-DD inicio y fin) en una zona
 * horaria arbitraria al rango UTC equivalente que cubre todos los
 * dias completos en esa zona horaria.
 *
 * Si se proveen operatingHours, el inicio usa start_time del primer día
 * y el fin usa end_time del último día (o del día siguiente si cruza
 * medianoche). Esto permite que un rango "2026-08-15 a 2026-08-17"
 * con horas 20:00-03:00 cubra desde 20:00 del 15 hasta 03:00 del 18.
 *
 * @param fechaInicio Fecha inicio en formato YYYY-MM-DD
 * @param fechaFin Fecha fin en formato YYYY-MM-DD
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @param operatingHours Horas de operación opcionales (start_time/end_time "HH:mm")
 * @returns Objeto con start y end en formato ISO UTC (Z) para usar en filtros Supabase
 */
export function getDateRange(
  fechaInicio: string,
  fechaFin: string,
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): { start: string; end: string } {
  // Sin horas de operación: comportamiento original
  if (!operatingHours?.start_time || !operatingHours?.end_time) {
    const refInicio = new Date(`${fechaInicio}T12:00:00Z`);
    const offsetInicio = getOffsetMinutesForTimezone(timezone, refInicio);
    const offsetISOInicio = offsetMinutesToISO(offsetInicio);
    const refFin = new Date(`${fechaFin}T12:00:00Z`);
    const offsetFin = getOffsetMinutesForTimezone(timezone, refFin);
    const offsetISOFin = offsetMinutesToISO(offsetFin);
    const start = `${fechaInicio}T00:00:00.000${offsetISOInicio}`;
    const end = `${fechaFin}T23:59:59.999${offsetISOFin}`;
    return { start, end };
  }

  // Con horas de operación: usar getDayRange para inicio y fin
  // El inicio del rango = inicio del día operativo del fechaInicio
  const { start } = getDayRange(fechaInicio, timezone, operatingHours);
  // El fin del rango = fin del día operativo del fechaFin
  const { end } = getDayRange(fechaFin, timezone, operatingHours);

  return { start, end };
}

/**
 * Devuelve el dia calendario actual en la zona horaria dada como
 * YYYY-MM-DD, usando Intl.DateTimeFormat para evitar depender del
 * timezone del navegador.
 *
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @returns Fecha actual en formato YYYY-MM-DD
 */
export function getToday(timezone: string = DEFAULT_TIMEZONE): string {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produce YYYY-MM-DD directamente
  return dtf.format(now);
}

/**
 * Devuelve el "día operativo" actual en la zona horaria dada como
 * YYYY-MM-DD. Si la organización tiene horas de operación que cruzan
 * medianoche (ej: 20:00-03:00) y la hora actual es después de medianoche
 * pero antes de end_time, el día operativo es el día anterior.
 *
 * Ej: son las 02:00 del 2026-08-16, horas 20:00-03:00 → día operativo = 2026-08-15
 *
 * @param timezone Zona horaria IANA
 * @param operatingHours Horas de operación opcionales
 * @returns Fecha del día operativo en formato YYYY-MM-DD
 */
export function getOperatingToday(
  timezone: string = DEFAULT_TIMEZONE,
  operatingHours?: OperatingHoursOptions | null,
): string {
  const now = new Date();

  // Sin horas de operación o sin cruce de medianoche: día calendario normal
  if (!operatingHours?.start_time || !operatingHours?.end_time) {
    return getToday(timezone);
  }

  const crossesMidnight = operatingHours.start_time >= operatingHours.end_time;
  if (!crossesMidnight) {
    return getToday(timezone);
  }

  // Con cruce de medianoche: obtener hora actual en el timezone
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = parseInt(map.hour, 10) === 24 ? 0 : parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const todayStr = `${map.year}-${map.month}-${map.day}`;

  // Si la hora actual es antes de end_time (ej: 02:00 < 03:00),
  // el día operativo es el día anterior
  if (currentTime < operatingHours.end_time) {
    return previousDay(todayStr);
  }

  // Si la hora actual es >= start_time (ej: 21:00 >= 20:00), día operativo = hoy
  // Si está entre end_time y start_time (ej: 04:00-20:00), no hay día operativo activo,
  // pero retornamos hoy como fallback
  return todayStr;
}

/**
 * Helper que obtiene el timezone y las horas de operación de una organización
 * y calcula el rango UTC para un día operativo completo.
 *
 * Combina getOrganizationTimezone + getOperatingHours + getDayRange en una
 * sola llamada async, para minimizar cambios en los servicios de reportes.
 *
 * @param organizationId ID de la organización
 * @param dateString Fecha en formato YYYY-MM-DD
 * @returns Objeto con start, end, timezone y operatingHours
 */
export async function getOrgDayRange(
  organizationId: number,
  dateString: string,
): Promise<{ start: string; end: string; timezone: string; operatingHours: OperatingHoursOptions | null }> {
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
 * Helper que obtiene el timezone y las horas de operación de una organización
 * y calcula el rango UTC para un rango de fechas operativo.
 *
 * Combina getOrganizationTimezone + getOperatingHours + getDateRange en una
 * sola llamada async, para minimizar cambios en los servicios de reportes.
 *
 * @param organizationId ID de la organización
 * @param fechaInicio Fecha inicio en formato YYYY-MM-DD
 * @param fechaFin Fecha fin en formato YYYY-MM-DD
 * @param overrideHours Horas opcionales que sobreescriben las de la organización.
 *                      Útil para filtro manual de horas en reportes.
 * @returns Objeto con start, end, timezone y operatingHours
 */
export async function getOrgDateRange(
  organizationId: number,
  fechaInicio: string,
  fechaFin: string,
  overrideHours?: OperatingHoursOptions | null,
): Promise<{ start: string; end: string; timezone: string; operatingHours: OperatingHoursOptions | null }> {
  const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
  const { getOperatingHours } = await import('@/lib/services/organizationOperatingHoursService');

  const [timezone, orgHours] = await Promise.all([
    getOrganizationTimezone(organizationId),
    getOperatingHours(organizationId),
  ]);

  // Si se pasan horas manuales, tienen prioridad sobre las de la organización
  const operatingHours = overrideHours?.start_time && overrideHours?.end_time
    ? overrideHours
    : orgHours;

  const { start, end } = getDateRange(fechaInicio, fechaFin, timezone, operatingHours);
  return { start, end, timezone, operatingHours };
}
