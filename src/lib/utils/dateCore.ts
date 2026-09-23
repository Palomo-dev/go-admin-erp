// ============================================================
// Nucleo de fechas: UNA sola implementacion del calculo de offsets y
// de la conversion entre "hora de pared" (lo que marca el reloj de la
// organizacion) e "instante" (el momento exacto, timestamptz).
//
// Quien usa que (superficie publica, fase A2):
//
//   DIA CALENDARIO (YYYY-MM-DD)
//     todayInTz(tz)               hoy en la zona de la organizacion
//     toPlainDate(date, tz)       un Date del navegador -> dia calendario
//     nextPlainDay / previousPlainDay
//
//   INSTANTE (timestamptz)
//     plainDateToInstant(dia, tz, hora)  dia + hora de pared -> ISO con offset
//     wallTimeToInstant(dia, hora, tz)   lo mismo, devolviendo Date
//     startOfDayInstant(dia, tz)         primer instante del dia
//     formatInstantWithOffset(date, tz)  instante -> ISO con el offset de la zona
//
//   OFFSET
//     getOffsetMinutesForTimezone(tz, date)   minutos enteros (incluye DST)
//     offsetMinutesToISO(minutos)             "-05:00", "+05:45"
//
// Los RANGOS (getDayRange, getDateRange, dia operativo) viven en
// dateRanges.ts; el FORMATEO para la interfaz, en dateDisplay.ts.
// '@/lib/utils/timezone' reexporta todo para no romper imports.
//
// DST — reglas que implementa este archivo:
//  - Una hora de pared que NO existe (salto de primavera; America/Santiago
//    pasa de 23:59 a 01:00) se resuelve con el offset anterior al cambio,
//    lo que la desplaza a la primera hora que si existe.
//  - Una hora de pared AMBIGUA (se vive dos veces al volver al horario
//    estandar) se resuelve en su PRIMERA ocurrencia.
//  - El offset NUNCA se supone constante: se calcula para cada instante.
// ============================================================

/** Zona horaria IANA por defecto (Colombia). Usar solo como fallback. */
export const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * ¿Sirve este valor para FORMATEAR? Comprobacion laxa a proposito: una fila
 * vieja con un alias historico ('US/Eastern') debe seguir mostrandose bien.
 * La comprobacion ESTRICTA, para decidir si una zona se puede ESCRIBIR en la
 * base, es `isSupportedTimeZone` en '@/lib/utils/timezone'.
 *
 * Vive aqui, en la hoja del arbol, porque la usan tanto la cascada
 * (branchTimezoneCascade) como el aviso de fallback (timezoneFallback), y
 * D7 pide una sola implementacion: dos try/catch identicos sobre
 * Intl.DateTimeFormat son dos sitios donde divergir.
 */
export function isUsableTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  const valor = tz.trim();
  if (valor.length === 0 || valor.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;

interface PartesLocales {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateadorDePartes(timezone: string): Intl.DateTimeFormat {
  const cacheado = formateadores.get(timezone);
  if (cacheado) return cacheado;
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
  formateadores.set(timezone, dtf);
  return dtf;
}

/** Componentes del reloj de pared de `date` en `timezone`. */
function partesEnZona(timezone: string, date: Date): PartesLocales {
  const partes = formateadorDePartes(timezone).formatToParts(date);
  const mapa: Record<string, string> = {};
  for (const p of partes) {
    if (p.type !== 'literal') mapa[p.type] = p.value;
  }
  // Algunos runtimes devuelven "24" para medianoche con hour12: false.
  const hora = parseInt(mapa.hour, 10) === 24 ? 0 : parseInt(mapa.hour, 10);
  return {
    year: parseInt(mapa.year, 10),
    month: parseInt(mapa.month, 10),
    day: parseInt(mapa.day, 10),
    hour: hora,
    minute: parseInt(mapa.minute, 10),
    second: parseInt(mapa.second, 10),
  };
}

/** La hora de pared de `date` en `timezone`, codificada como epoch UTC. */
function paredComoUTC(timezone: string, date: Date): number {
  const p = partesEnZona(timezone, date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/**
 * Offset en MINUTOS ENTEROS de una zona IANA para un instante dado.
 * Maneja DST: el mismo dia puede tener dos offsets distintos.
 *
 * Se redondea a minuto entero a proposito: ninguna zona IANA tiene un
 * offset con fraccion de minuto, y sin redondeo los milisegundos del
 * instante se colaban en el resultado (un Date con .500 producia
 * 344.99 minutos y la cadena "+05:44.9916...").
 *
 * @param timezone Zona horaria IANA ('America/Bogota', 'Asia/Kathmandu')
 * @param date Instante para el que se calcula el offset
 * @returns Minutos (-300 para UTC-5, +345 para UTC+5:45)
 */
export function getOffsetMinutesForTimezone(timezone: string, date: Date): number {
  return Math.round((paredComoUTC(timezone, date) - date.getTime()) / MINUTO_MS);
}

/**
 * Minutos de offset a cadena ISO. Conserva los minutos: +05:45
 * (Katmandu) y +10:30 (Lord Howe) no se redondean a horas enteras.
 * El cero se escribe "+00:00" (ISO 8601 no admite "-00:00").
 */
export function offsetMinutesToISO(offsetMinutes: number): string {
  const minutos = Math.round(offsetMinutes);
  const signo = minutos < 0 ? '-' : '+';
  const abs = Math.abs(minutos);
  const horas = Math.floor(abs / 60);
  const resto = abs % 60;
  return `${signo}${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** Parsea "HH:mm" o "HH:mm:ss"; lo invalido cae a medianoche. */
function partesDeHora(time: string): { hour: number; minute: number; second: number } {
  const trozos = String(time ?? '').split(':');
  const hour = Number(trozos[0]);
  const minute = Number(trozos[1]);
  const second = Number(trozos[2]);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: Number.isFinite(second) ? second : 0,
  };
}

/**
 * Resuelve una hora de pared (dia calendario + "HH:mm") de una zona al
 * instante que le corresponde.
 *
 * Casos de DST:
 *  - Hora inexistente (salto de primavera): se usa el offset anterior al
 *    cambio, con lo que el resultado cae en la primera hora que si
 *    existe. `wallTimeToInstant('2026-09-06', '00:00', 'America/Santiago')`
 *    devuelve las 01:00 -03:00 (2026-09-06T04:00:00Z), no las 23:00 del
 *    dia anterior.
 *  - Hora repetida (vuelta al horario estandar): se devuelve la PRIMERA
 *    ocurrencia, la del offset de verano.
 *
 * @param plainDate Dia calendario YYYY-MM-DD en la zona dada
 * @param time Hora de pared "HH:mm" (o "HH:mm:ss")
 * @param timezone Zona horaria IANA
 */
export function wallTimeToInstant(
  plainDate: string,
  time: string,
  timezone: string = DEFAULT_TIMEZONE,
): Date {
  const [anio, mes, dia] = plainDate.split('-').map(Number);
  const { hour, minute, second } = partesDeHora(time);
  const paredUTC = Date.UTC(anio, mes - 1, dia, hour, minute, second);

  // Offsets vigentes alrededor de esa hora de pared. Se muestrean tres
  // instantes para cubrir el cambio de DST venga por donde venga.
  const offsetPrevio = getOffsetMinutesForTimezone(timezone, new Date(paredUTC - DIA_MS));
  const candidatos = new Set<number>([
    offsetPrevio,
    getOffsetMinutesForTimezone(timezone, new Date(paredUTC)),
    getOffsetMinutesForTimezone(timezone, new Date(paredUTC + DIA_MS)),
  ]);

  const validos: number[] = [];
  for (const offset of candidatos) {
    const instante = paredUTC - offset * MINUTO_MS;
    // Solo vale si al volver a la zona se lee exactamente la hora pedida.
    if (paredComoUTC(timezone, new Date(instante)) === paredUTC) validos.push(instante);
  }

  // Una o dos coincidencias: la hora existe. Con dos (hora repetida) se
  // devuelve la primera vez que se vive.
  if (validos.length > 0) return new Date(Math.min(...validos));

  // Ninguna: la hora no existe (hueco de DST). Con el offset previo al
  // cambio el instante cae justo tras el salto.
  return new Date(paredUTC - offsetPrevio * MINUTO_MS);
}

/** Primer instante de un dia calendario en una zona (respeta huecos de DST). */
export function startOfDayInstant(plainDate: string, timezone: string = DEFAULT_TIMEZONE): Date {
  return wallTimeToInstant(plainDate, '00:00', timezone);
}

/**
 * Escribe un instante como ISO con el offset real de la zona en ESE
 * instante: "2026-04-04T23:59:59.999-04:00". No usa el offset de otro
 * momento del dia, que es justo lo que rompia los dias de 23 y 25 horas.
 */
export function formatInstantWithOffset(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const p = partesEnZona(timezone, date);
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  const offset = offsetMinutesToISO(getOffsetMinutesForTimezone(timezone, date));
  const fecha = `${p.year}-${dosDigitos(p.month)}-${dosDigitos(p.day)}`;
  const hora = `${dosDigitos(p.hour)}:${dosDigitos(p.minute)}:${dosDigitos(p.second)}`;
  return `${fecha}T${hora}.${ms}${offset}`;
}

/**
 * Dia calendario actual en la zona dada (YYYY-MM-DD). Nunca depende del
 * TZ del runtime: Intl recibe la zona explicita.
 */
export function todayInTz(timezone: string = DEFAULT_TIMEZONE): string {
  return toPlainDate(new Date(), timezone);
}

/**
 * Convierte un instante (p. ej. el Date que devuelve un DatePicker) al
 * dia calendario que le corresponde en la zona de la organizacion.
 * NO es lo mismo que el dia del navegador: una venta de las 20:30 en
 * Bogota es el dia anterior para un navegador en Madrid.
 */
export function toPlainDate(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  if (isNaN(date.getTime())) return '';
  const p = partesEnZona(timezone, date);
  return `${p.year}-${dosDigitos(p.month)}-${dosDigitos(p.day)}`;
}

/**
 * Dia calendario + hora de pared -> ISO con offset, listo para guardar
 * en un timestamptz. Ver `wallTimeToInstant` para el trato del DST.
 *
 * @param plain Dia calendario YYYY-MM-DD
 * @param timezone Zona horaria IANA de la organizacion
 * @param time Hora "HH:mm" (por defecto "00:00")
 */
export function plainDateToInstant(
  plain: string,
  timezone: string = DEFAULT_TIMEZONE,
  time: string = '00:00',
): string {
  return formatInstantWithOffset(wallTimeToInstant(plain, time, timezone), timezone);
}

/** Dia calendario siguiente (YYYY-MM-DD), sin tocar zonas horarias. */
export function nextPlainDay(dateString: string): string {
  return desplazarDias(dateString, 1);
}

/** Dia calendario anterior (YYYY-MM-DD), sin tocar zonas horarias. */
export function previousPlainDay(dateString: string): string {
  return desplazarDias(dateString, -1);
}

function desplazarDias(dateString: string, dias: number): string {
  const [anio, mes, dia] = dateString.split('-').map(Number);
  const movido = new Date(Date.UTC(anio, mes - 1, dia + dias));
  const y = movido.getUTCFullYear();
  const m = dosDigitos(movido.getUTCMonth() + 1);
  const d = dosDigitos(movido.getUTCDate());
  return `${y}-${m}-${d}`;
}
