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
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Devuelve el dia siguiente a una fecha YYYY-MM-DD como YYYY-MM-DD.
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
 * Convierte un dia calendario (YYYY-MM-DD) en una zona horaria
 * arbitraria al rango UTC equivalente que cubre exactamente ese dia
 * completo en esa zona horaria.
 *
 * Ejemplo para el 2026-08-15 en America/Bogota (UTC-5):
 *   start: 2026-08-15T05:00:00.000Z  (00:00 Bogota = 05:00 UTC)
 *   end:   2026-08-16T04:59:59.999Z  (23:59:59.999 Bogota = 04:59:59.999 UTC del dia siguiente)
 *
 * @param dateString Fecha en formato YYYY-MM-DD (dia en la zona horaria dada)
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @returns Objeto con start y end en formato ISO UTC (Z) para usar en filtros Supabase
 */
export function getDayRange(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE,
): { start: string; end: string } {
  // Calcular el offset del timezone en la medianoche del dia dado.
  // Usamos el instante UTC de medianoche del dia como referencia para
  // obtener el offset correcto (importante para DST).
  const refDate = new Date(`${dateString}T12:00:00Z`);
  const offsetMinutes = getOffsetMinutesForTimezone(timezone, refDate);
  // offsetMinutes es negativo para zones detras de UTC (ej: -300 para UTC-5)
  // Para obtener 00:00 local en UTC, hay que sumar el valor absoluto del offset
  // offsetISO es el string con signo contrario (ej: +05:00 para UTC-5)
  const offsetISO = offsetMinutesToISO(offsetMinutes);

  // 00:00:00.000 en el timezone = dateString + offsetISO en UTC
  const start = `${dateString}T00:00:00.000${offsetISO}`;
  // 23:59:59.999 en el timezone = dia siguiente 00:00:00 menos 1ms
  // Mas simple: dia siguiente a 00:00:00 - 1ms, pero para evitar calculos
  // usamos 23:59:59.999 del dia con el mismo offset
  const end = `${dateString}T23:59:59.999${offsetISO}`;

  return { start, end };
}

/**
 * Convierte un rango de fechas (YYYY-MM-DD inicio y fin) en una zona
 * horaria arbitraria al rango UTC equivalente que cubre todos los
 * dias completos en esa zona horaria.
 *
 * @param fechaInicio Fecha inicio en formato YYYY-MM-DD
 * @param fechaFin Fecha fin en formato YYYY-MM-DD
 * @param timezone Zona horaria IANA (default: DEFAULT_TIMEZONE)
 * @returns Objeto con start y end en formato ISO UTC (Z) para usar en filtros Supabase
 */
export function getDateRange(
  fechaInicio: string,
  fechaFin: string,
  timezone: string = DEFAULT_TIMEZONE,
): { start: string; end: string } {
  // Calcular el offset para la fecha de inicio (puede diferir de la
  // fecha fin si hay cambio de DST en el medio)
  const refInicio = new Date(`${fechaInicio}T12:00:00Z`);
  const offsetInicio = getOffsetMinutesForTimezone(timezone, refInicio);
  const offsetISOInicio = offsetMinutesToISO(offsetInicio);

  // Calcular el offset para la fecha de fin
  const refFin = new Date(`${fechaFin}T12:00:00Z`);
  const offsetFin = getOffsetMinutesForTimezone(timezone, refFin);
  const offsetISOFin = offsetMinutesToISO(offsetFin);

  const start = `${fechaInicio}T00:00:00.000${offsetISOInicio}`;
  const end = `${fechaFin}T23:59:59.999${offsetISOFin}`;

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
