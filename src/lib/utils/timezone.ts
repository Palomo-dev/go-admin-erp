// ============================================================
// Fachada de la capa de fechas. Este archivo NO implementa nada: la
// unica implementacion vive en dateCore.ts (offsets, horas de pared,
// dias calendario) y dateRanges.ts (rangos y dia operativo). Se
// mantiene porque medio repositorio importa de '@/lib/utils/timezone'.
//
// QUE FUNCION USAR (superficie publica, fase A2):
//
// | Necesito...                                  | Funcion                     |
// |----------------------------------------------|-----------------------------|
// | el dia de hoy para la organizacion            | todayInTz(tz)               |
// | el dia de un Date (DatePicker, ahora)         | toPlainDate(date, tz)       |
// | guardar dia + hora en un timestamptz          | plainDateToInstant(d,tz,h)  |
// | filtrar "las ventas de hoy"                   | getDayRange(dia, tz)        |
// | filtrar un rango de dias                      | getDateRange(ini, fin, tz)  |
// | lo mismo, resolviendo la zona de la org       | getOrgDayRange/getOrgDateRange |
// | el dia operativo (negocios que cierran de madrugada) | getOperatingToday(tz, horas) |
// | mostrar un timestamptz en pantalla            | dateDisplay.formatDateInTz  |
// | mostrar una columna date en pantalla          | dateDisplay.formatPlainDate |
// | validar una zona antes de guardarla           | isSupportedTimeZone(tz)     |
// | resolver una zona que puede faltar            | resolverZonaHoraria(tz,ctx) |
//
// `getToday` es el nombre historico de `todayInTz`: misma funcion, se
// conserva por compatibilidad.
// ============================================================

import { DEFAULT_TIMEZONE, todayInTz } from '@/lib/utils/dateCore';

export {
  DEFAULT_TIMEZONE,
  formatInstantWithOffset,
  getOffsetMinutesForTimezone,
  isUsableTimezone,
  nextPlainDay,
  offsetMinutesToISO,
  plainDateToInstant,
  previousPlainDay,
  startOfDayInstant,
  toPlainDate,
  todayInTz,
  wallTimeToInstant,
} from '@/lib/utils/dateCore';

export {
  getDateRange,
  getDayRange,
  getOperatingToday,
  getOrgDateRange,
  getOrgDayRange,
  type OperatingHoursOptions,
  type RangoDeOrganizacion,
} from '@/lib/utils/dateRanges';

export {
  avisarFallbackZonaHoraria,
  avisarResolucionZonaHoraria,
  resolverZonaHoraria,
  type ContextoZonaHoraria,
  type MotivoFallbackZona,
} from '@/lib/utils/timezoneFallback';

/**
 * Dia calendario actual en la zona dada (YYYY-MM-DD).
 * Nombre historico de `todayInTz`; se conserva por compatibilidad con
 * los modulos que ya lo importaban. Preferir `todayInTz` en codigo nuevo.
 */
export function getToday(timezone: string = DEFAULT_TIMEZONE): string {
  return todayInTz(timezone);
}

let supportedTimeZones: Set<string> | null | undefined;
function supportedTimeZoneSet(): Set<string> | null {
  if (supportedTimeZones !== undefined) return supportedTimeZones;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    supportedTimeZones =
      typeof intl.supportedValuesOf === 'function'
        ? new Set(intl.supportedValuesOf('timeZone'))
        : null;
  } catch {
    supportedTimeZones = null;
  }
  return supportedTimeZones;
}

/**
 * ¿Es `tz` un nombre IANA canónico que se puede ESCRIBIR en
 * `organizations.timezone`? (F0-REG r3, QA r2 medio 2.)
 *
 * Más estricto que «`Intl.DateTimeFormat` no lanza»: ICU acepta alias y
 * abreviaturas (`US/Eastern`, `EST`, `america/bogota`) que Postgres no
 * siempre reconoce, y `fn_ai_usage_month` / `at time zone` fallarían con
 * `22023`. Se exige pertenencia exacta a `Intl.supportedValuesOf('timeZone')`
 * (más `UTC` y su canónico IANA `Etc/UTC`, que ICU no lista: F0-pulido,
 * qa r4 REG obs. 1; ambos están en `pg_timezone_names`). Los demás `Etc/*`
 * (`Etc/GMT+5`, `Etc/GMT`) siguen rechazados: el signo de `Etc/GMT±N` es
 * POSIX (invertido respecto a ISO) y nadie debería guardar eso a mano. Donde
 * `supportedValuesOf` no exista
 * (navegadores antiguos) se cae a la comprobación de `DateTimeFormat`; la
 * BD tiene además el trigger `trg_validate_org_timezone` (migración
 * crm_v4_f00_44) contra `pg_timezone_names`.
 *
 * QA r3 punto 3: `supportedValuesOf` lista los canónicos de ICU, no los de
 * IANA. En Node 22 / ICU 76 aparece `Asia/Calcutta` y no `Asia/Kolkata`,
 * `America/Buenos_Aires` y no `America/Argentina/Buenos_Aires`, `Europe/Kiev`
 * y no `Europe/Kyiv`; Postgres reconoce ambos. Por eso se acepta también un
 * nombre con forma `Region/City` (1–2 niveles, inicial mayúscula) cuando
 * `Intl.DateTimeFormat(...).resolvedOptions().timeZone` cae dentro del set:
 * es un enlace IANA que ICU canoniza a otro nombre. Consecuencias
 * documentadas: `US/Eastern` → true (está en `pg_timezone_names`; ICU lo
 * resuelve a `America/New_York`), `EST` → false (sin barra), `america/bogota`
 * → false (minúscula inicial; la BD lo canonizaría pero la app exige el
 * nombre exacto). El trigger de la 44 sigue siendo la última palabra.
 *
 * Para LEER una zona ya guardada sigue valiendo la comprobación laxa
 * (`getOrgTimezoneServer`, `resolverZonaHoraria`): una fila vieja con alias
 * no debe tumbar nada, solo caer al fallback con aviso.
 */
const IANA_REGION_CITY = /^[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z_+-]+){1,2}$/;

export function isSupportedTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  if (tz === 'UTC' || tz === 'Etc/UTC') return true;
  const set = supportedTimeZoneSet();
  if (!set) return true;
  if (set.has(tz)) return true;
  return IANA_REGION_CITY.test(tz) && set.has(resolved);
}
