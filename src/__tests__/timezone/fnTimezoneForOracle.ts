// ============================================================================
// Oráculo de `fn_timezone_for`: la transcripción del cuerpo real de la función
// de Postgres, más los datos con los que se compara.
//
// Vive fuera del `.test.ts` para que el test quepa de un vistazo; no es un
// archivo de pruebas (Jest solo recoge `*.test.ts`).
//
// La transcripción sale de la migración `20260923200000`, y el test que la usa
// LEE esa migración y exige que sigan ahí los pasos en los que se apoya: si
// alguien cambia el SQL, esto deja de estar al día de forma ruidosa.
// ============================================================================

export const DEFECTO = 'America/Bogota';

function esZonaUsable(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface EntradaCascada {
  branchTimezone?: string | null;
  organizationTimezone?: string | null;
  legacyTimezone?: string | null;
}

/**
 * Transcripción del cuerpo real de `fn_timezone_for`:
 *   1) sucursal (solo si pertenece a la organización pedida);
 *   2) `organizations.timezone` si la sucursal no aportó NADA;
 *   2bis) legado `organization_settings.key='calendar'`;
 *   3) `'America/Bogota'` si nadie aportó;
 *   4) lo aportado se descarta a favor del default si Postgres no lo reconoce.
 *
 * El matiz que se paga caro: un valor PRESENTE pero ilegible **corta** la
 * cascada (paso 4) en vez de bajar al nivel siguiente, porque el paso 2 solo
 * mira la organización cuando `v_tz is null or btrim(v_tz) = ''`.
 */
export function fnTimezoneForSQL(entrada: EntradaCascada): string {
  const vacio = (v: string | null | undefined): boolean =>
    v === null || v === undefined || v.trim() === '';

  let tz: string | null | undefined = entrada.branchTimezone;
  if (vacio(tz)) tz = entrada.organizationTimezone;
  if (vacio(tz)) tz = entrada.legacyTimezone;
  if (vacio(tz)) return DEFECTO;

  const valor = (tz as string).trim();
  return esZonaUsable(valor) ? valor : DEFECTO;
}

export interface CasoCascada {
  nombre: string;
  branchTimezone: string | null;
  organizationTimezone: string;
}

/**
 * Matriz sintética. Zonas de los dos signos y con DST a propósito, para que
 * ningún resultado pueda acertar por coincidir con el default colombiano.
 */
export const MATRIZ: CasoCascada[] = [
  {
    nombre: 'sucursal sin override hereda',
    branchTimezone: null,
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'override manda sobre la organización',
    branchTimezone: 'Pacific/Kiritimati',
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'override con DST y signo contrario',
    branchTimezone: 'America/Mexico_City',
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'cadena vacía = heredar',
    branchTimezone: '',
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'solo espacios = heredar',
    branchTimezone: '   ',
    organizationTimezone: 'America/Mexico_City',
  },
  {
    nombre: 'zona rota en la sucursal corta la cascada',
    branchTimezone: 'Marte/Olympus',
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'organización y sucursal iguales',
    branchTimezone: 'Europe/Madrid',
    organizationTimezone: 'Europe/Madrid',
  },
  {
    nombre: 'organización en el default, sucursal fuera',
    branchTimezone: 'Asia/Kathmandu',
    organizationTimezone: DEFECTO,
  },
];

/**
 * Datos reales leídos por MCP en solo lectura el 2026-09-23:
 * (organización, sucursal, `branches.timezone`, `fn_timezone_for`).
 *
 * Son honestos pero NO discriminan: las 85 organizaciones y las 90 sucursales
 * están en `America/Bogota` y ninguna sucursal tiene override, así que hasta
 * una cascada invertida pasaría. Quedan como ancla de regresión.
 */
export const REALES: Array<[number, number, string | null, string]> = [
  [1, 47, null, DEFECTO],
  [2, 2, null, DEFECTO],
  [2, 21, null, DEFECTO],
  [46, 16, null, DEFECTO],
  [85, 59, null, DEFECTO],
  [90, 64, null, DEFECTO],
];
