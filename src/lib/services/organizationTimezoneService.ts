// ============================================================
// Servicio para obtener la zona horaria configurada por organizacion.
//
// El timezone se almacena en organization_settings (jsonb por modulo)
// con keys como 'pms_settings' o 'calendar_settings', cada uno con un
// campo 'timezone' (string IANA). Este servicio unifica la lectura con
// fallback al default y cache en memoria para evitar consultas
// repetidas a Supabase.
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

// Cache en memoria: organizationId -> timezone
const timezoneCache = new Map<number, string>();

// Promesas en vuelo para evitar consultas duplicadas concurrentes
const inflight = new Map<number, Promise<string>>();

/**
 * Lista de keys de organization_settings donde se puede encontrar el
 * campo 'timezone'. Se consultan en orden; el primero que tenga un
 * timezone valido se usa.
 */
const SETTING_KEYS = ['pms_settings', 'calendar_settings'] as const;

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
 * 2. organization_settings con keys: pms_settings, calendar_settings
 * 3. DEFAULT_TIMEZONE ('America/Bogota')
 *
 * El resultado se cachea en memoria para evitar consultas repetidas.
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
      // Consultar organization_settings para las keys conocidas
      const { data, error } = await supabase
        .from('organization_settings')
        .select('key, settings')
        .eq('organization_id', organizationId)
        .in('key', SETTING_KEYS as unknown as string[]);

      if (error) {
        console.warn('Error obteniendo timezone de organization_settings:', error);
        return DEFAULT_TIMEZONE;
      }

      // Buscar el primer setting que tenga un timezone valido
      if (data) {
        for (const row of data) {
          const settings = row.settings as Record<string, unknown> | null;
          const tz = settings?.timezone;
          if (isValidTimezone(tz as string)) {
            const timezone = tz as string;
            timezoneCache.set(organizationId, timezone);
            return timezone;
          }
        }
      }

      // 3. Fallback
      timezoneCache.set(organizationId, DEFAULT_TIMEZONE);
      return DEFAULT_TIMEZONE;
    } catch (err) {
      console.warn('Error en getOrganizationTimezone:', err);
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
