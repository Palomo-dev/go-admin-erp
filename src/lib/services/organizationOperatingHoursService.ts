// ============================================================
// Servicio para obtener las horas de operación configuradas por
// organización. Permite que empresas con horarios no estándar
// (ej: 8pm a 3am) definan su "día operativo".
//
// Las horas se almacenan en organization_settings (jsonb) con
// key 'operating_hours' y formato:
// {
//   "enabled": true,
//   "start_time": "20:00",   // HH:mm (24h, timezone de la organización)
//   "end_time": "03:00"      // HH:mm (24h). Si end < start, cruza medianoche
// }
//
// Cuando enabled=true y start_time/end_time están definidos, las
// funciones de timezone (getDayRange, getDateRange) usan estas horas
// en vez de 00:00-23:59:59 para calcular los rangos UTC.
//
// Esto afecta a TODOS los reportes, dashboard, POS, PMS, etc. que
// usen getDayRange/getDateRange, sin necesidad de cambiar cada archivo.
// ============================================================

import { supabase } from '@/lib/supabase/config';

// Cache en memoria: organizationId -> OperatingHours
const hoursCache = new Map<number, OperatingHours | null>();

// Promesas en vuelo para evitar consultas duplicadas concurrentes
const inflight = new Map<number, Promise<OperatingHours | null>>();

/**
 * Representa las horas de operación de una organización.
 * - start_time/end_time en formato "HH:mm" (24h) en el timezone de la org.
 * - Si end_time < start_time, el día operativo cruza medianoche (ej: 20:00-03:00).
 * - Si enabled=false o no hay config, se usa el día calendario completo (00:00-23:59:59).
 */
export interface OperatingHours {
  enabled: boolean;
  start_time: string | null; // "HH:mm" o null
  end_time: string | null;   // "HH:mm" o null
}

/**
 * Valida que un string sea una hora válida en formato "HH:mm".
 */
function isValidTime(time: string | null | undefined): time is string {
  if (!time || typeof time !== 'string') return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/**
 * Normaliza la configuración cruda de organization_settings a OperatingHours.
 * Devuelve null si no hay configuración válida o si enabled=false.
 */
function normalizeOperatingHours(raw: unknown): OperatingHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const enabled = obj.enabled === true;
  const start_time = isValidTime(obj.start_time as string) ? (obj.start_time as string) : null;
  const end_time = isValidTime(obj.end_time as string) ? (obj.end_time as string) : null;

  // Si no está habilitado o no hay horas válidas, no hay operating hours
  if (!enabled || !start_time || !end_time) return null;

  return { enabled: true, start_time, end_time };
}

/**
 * Obtiene las horas de operación configuradas para una organización.
 *
 * Orden de prioridad:
 * 1. Cache en memoria (si ya se consultó antes)
 * 2. organization_settings con key 'operating_hours'
 * 3. null (usar día calendario completo)
 *
 * El resultado se cachea en memoria para evitar consultas repetidas.
 *
 * @param organizationId ID de la organización
 * @returns OperatingHours o null si no hay configuración válida
 */
export async function getOperatingHours(
  organizationId: number,
): Promise<OperatingHours | null> {
  // 1. Cache
  if (hoursCache.has(organizationId)) {
    return hoursCache.get(organizationId) ?? null;
  }

  // 2. Evitar consultas duplicadas concurrentes
  const existing = inflight.get(organizationId);
  if (existing) return existing;

  const promise = (async (): Promise<OperatingHours | null> => {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', 'operating_hours')
        .maybeSingle();

      if (error) {
        console.warn('Error obteniendo operating_hours:', error);
        hoursCache.set(organizationId, null);
        return null;
      }

      const result = normalizeOperatingHours(data?.settings);
      hoursCache.set(organizationId, result);
      return result;
    } catch (err) {
      console.warn('Error en getOperatingHours:', err);
      hoursCache.set(organizationId, null);
      return null;
    } finally {
      inflight.delete(organizationId);
    }
  })();

  inflight.set(organizationId, promise);
  return promise;
}

/**
 * Invalida el cache de operating hours para una organización.
 * Usar cuando se actualiza la configuración.
 */
export function invalidateOperatingHoursCache(organizationId?: number): void {
  if (organizationId !== undefined) {
    hoursCache.delete(organizationId);
  } else {
    hoursCache.clear();
  }
}

/**
 * Determina si un par de horas cruza medianoche.
 * Ej: 20:00 -> 03:00 cruza medianoche (start > end).
 * Ej: 08:00 -> 18:00 no cruza (start < end).
 */
export function crossesMidnight(start_time: string, end_time: string): boolean {
  return start_time >= end_time;
}
