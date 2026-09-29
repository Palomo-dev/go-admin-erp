/**
 * País del navegador para PRELLENAR el registro (decisión de ubicación
 * 2026-09-29, docs/design/AUTH-ACCESO-V2.md §13): antes el país era
 * «Colombia» fijo en el código. Ahora se deduce de la zona horaria y de la
 * región del idioma del navegador, solo entre los países activos del catálogo
 * (`countries`, códigos ISO alfa-3). Si no se puede deducir, queda vacío y la
 * persona lo elige (el campo es obligatorio).
 */

/** Zona horaria IANA → ISO alfa-2 (las de los países del catálogo y vecinos frecuentes). */
const ZONA_A_PAIS: Record<string, string> = {
  'America/Bogota': 'CO',
  'America/Mexico_City': 'MX',
  'America/Monterrey': 'MX',
  'America/Tijuana': 'MX',
  'America/Cancun': 'MX',
  'America/Merida': 'MX',
  'America/Chihuahua': 'MX',
  'America/Hermosillo': 'MX',
  'America/Mazatlan': 'MX',
  'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL',
  'America/Sao_Paulo': 'BR',
  'America/Fortaleza': 'BR',
  'America/Recife': 'BR',
  'America/Bahia': 'BR',
  'America/Manaus': 'BR',
  'America/Belem': 'BR',
  'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES',
  'Europe/London': 'GB',
  'Asia/Tokyo': 'JP',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Montreal': 'CA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Lima': 'PE',
  'America/Guayaquil': 'EC',
  'America/Caracas': 'VE',
  'America/Panama': 'PA',
  'America/Argentina/Buenos_Aires': 'AR',
};

/** ISO alfa-2 → alfa-3 (el catálogo `countries` usa alfa-3). */
const ALFA2_A_ALFA3: Record<string, string> = {
  CO: 'COL', MX: 'MEX', CL: 'CHL', BR: 'BRA', ES: 'ESP', GB: 'GBR', JP: 'JPN', AU: 'AUS', CA: 'CAN', US: 'USA',
  PE: 'PER', EC: 'ECU', VE: 'VEN', PA: 'PAN', AR: 'ARG',
};

export interface SenalesNavegador {
  zonaHoraria?: string | null;
  idiomas?: readonly string[] | null;
}

/** Señales del navegador actual (vacías en el servidor). */
export function senalesDelNavegador(): SenalesNavegador {
  if (typeof window === 'undefined') return {};
  let zonaHoraria: string | null = null;
  try {
    zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    zonaHoraria = null;
  }
  const idiomas = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return { zonaHoraria, idiomas };
}

/**
 * Código alfa-3 del país deducido, o null. Prioridad: la zona horaria (dice
 * dónde está el equipo) y después la región del idioma (`es-CO`, `pt-BR`).
 * Solo devuelve un país que esté en `disponibles`.
 */
export function paisDesdeNavegador(disponibles: readonly string[], senales: SenalesNavegador = senalesDelNavegador()): string | null {
  const validos = new Set(disponibles.map((c) => c.toUpperCase()));
  const candidatos: string[] = [];
  const porZona = senales.zonaHoraria ? ZONA_A_PAIS[senales.zonaHoraria] : undefined;
  if (porZona) candidatos.push(porZona);
  for (const idioma of senales.idiomas ?? []) {
    const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(idioma)?.[1]?.toUpperCase();
    if (region) candidatos.push(region);
  }
  for (const alfa2 of candidatos) {
    const alfa3 = ALFA2_A_ALFA3[alfa2];
    if (alfa3 && validos.has(alfa3)) return alfa3;
  }
  return null;
}

/** ISO alfa-2 de un alfa-3 (para el prefijo del teléfono), o null. */
export function alfa2DeAlfa3(alfa3: string | null | undefined): string | null {
  if (!alfa3) return null;
  const par = Object.entries(ALFA2_A_ALFA3).find(([, a3]) => a3 === alfa3.toUpperCase());
  return par ? par[0] : null;
}
