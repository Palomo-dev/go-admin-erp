// ============================================================
// Servicio para obtener la zona horaria configurada por organizacion.
//
// Fuente de verdad canónica: organizations.timezone (columna text).
// Fallback legacy: organization_settings clave 'calendar', campo 'timezone'.
// Fallback final: DEFAULT_TIMEZONE ('America/Bogota').
//
// La columna organizations.timezone se anadio en la migracion
// add_organizations_timezone_column para evitar buscar en jsonb
// (fn_today_for_org se ejecuta por fila en triggers y necesita O(1)).
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

// Cache en memoria: organizationId -> timezone
const timezoneCache = new Map<number, string>();

// Promesas en vuelo para evitar consultas duplicadas concurrentes
const inflight = new Map<number, Promise<string>>();

/**
 * Valida que un string sea un timezone IANA soportado por el navegador.
 */
function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    // Intl lanzara una excepcion si el timezone no es valido
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene el timezone configurado para una organizacion.
 *
 * Orden de prioridad:
 * 1. Cache en memoria (si ya se consulto antes)
 * 2. organizations.timezone (columna canonica)
 * 3. organization_settings clave 'calendar', campo 'timezone' (legacy)
 * 4. DEFAULT_TIMEZONE ('America/Bogota')
 *
 * El resultado se cachea en memoria para evitar consultas repetidas.
 * Si cae al fallback final, emite un console.warn para visibilidad.
 *
 * @param organizationId ID de la organizacion
 * @returns Timezone IANA (ej: 'America/Bogota', 'America/Mexico_City')
 */
export async function getOrganizationTimezone(organizationId: number): Promise<string> {
  // 1. Cache
  const cached = timezoneCache.get(organizationId);
  if (cached) return cached;

  // 2. Evitar consultas duplicadas concurrentes
  const existing = inflight.get(organizationId);
  if (existing) return existing;

  const promise = (async (): Promise<string> => {
    try {
      // 2a. Leer organizations.timezone (fuente canonica)
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('timezone')
        .eq('id', organizationId)
        .single();

      if (!orgError && orgData) {
        const tz = orgData.timezone;
        if (isValidTimezone(tz)) {
          const timezone = tz as string;
          timezoneCache.set(organizationId, timezone);
          return timezone;
        }
      }

      // 3. Fallback legacy: organization_settings clave 'calendar'
      const { data: settingsData, error: settingsError } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', 'calendar')
        .single();

      if (!settingsError && settingsData?.settings) {
        const tz = (settingsData.settings as Record<string, unknown>)?.timezone;
        if (isValidTimezone(tz as string)) {
          const timezone = tz as string;
          timezoneCache.set(organizationId, timezone);
          return timezone;
        }
      }

      // 4. Fallback final
      console.warn(
        `[timezone] Organizacion ${organizationId} sin timezone configurado. ` +
        `Usando fallback '${DEFAULT_TIMEZONE}'.`
      );
      timezoneCache.set(organizationId, DEFAULT_TIMEZONE);
      return DEFAULT_TIMEZONE;
    } catch (err) {
      console.warn('[timezone] Error en getOrganizationTimezone:', err);
      return DEFAULT_TIMEZONE;
    } finally {
      inflight.delete(organizationId);
    }
  })();

  inflight.set(organizationId, promise);
  return promise;
}

/**
 * Invalida el cache de timezone para una organizacion.
 * Usar cuando se actualiza la configuracion de timezone.
 */
export function invalidateTimezoneCache(organizationId?: number): void {
  if (organizationId !== undefined) {
    timezoneCache.delete(organizationId);
  } else {
    timezoneCache.clear();
  }
}
