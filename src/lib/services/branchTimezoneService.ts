// ============================================================
// Zona horaria por sucursal (lectura cacheada para el cliente).
//
// Fase A3. Una sola consulta por organización: `id, timezone` de todas sus
// sucursales. El resultado alimenta la cascada del contexto, así que ningún
// componente vuelve a consultar la BD para pintar una fecha.
//
// `branches.timezone` la añade la fase A1 (nullable = hereda). Mientras la
// columna no exista, PostgREST responde 42703; se relee sin la columna y
// todas las sucursales quedan «heredando». Así el enganche ya está puesto y
// el orden de despliegue (código antes que migración, o al revés) da igual.
// ============================================================

import { supabase } from '@/lib/supabase/config';

/**
 * Evento global: la zona de la organización o de una sucursal se acaba de
 * guardar. El OrganizationTimezoneContext lo escucha para invalidar y
 * recargar; sin él la pantalla sigue formateando con la zona anterior.
 */
export const TIMEZONES_UPDATED_EVENT = 'timezones-updated';

/** Avisa a los contextos montados. No hace nada fuera del navegador. */
export function notifyTimezonesUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(TIMEZONES_UPDATED_EVENT));
  } catch {
    /* noop */
  }
}

/** branchId → override (`null` = hereda de la organización). */
export type BranchTimezoneMap = Record<number, string | null>;

const cache = new Map<number, BranchTimezoneMap>();
const inflight = new Map<number, Promise<BranchTimezoneMap>>();

/** Código de PostgREST/Postgres para «la columna no existe». */
const UNDEFINED_COLUMN = '42703';

function toMap(rows: Array<{ id: number; timezone?: string | null }>): BranchTimezoneMap {
  const map: BranchTimezoneMap = {};
  for (const row of rows) {
    if (typeof row?.id !== 'number') continue;
    const tz = typeof row.timezone === 'string' ? row.timezone.trim() : '';
    map[row.id] = tz.length > 0 ? tz : null;
  }
  return map;
}

async function fetchMap(organizationId: number): Promise<BranchTimezoneMap> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, timezone')
    .eq('organization_id', organizationId);

  if (!error) return toMap((data ?? []) as Array<{ id: number; timezone?: string | null }>);

  // Lectura doblada: sin la columna todavía, nadie tiene override.
  if (error.code === UNDEFINED_COLUMN) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId);
    if (fallbackError) throw fallbackError;
    return toMap((fallbackData ?? []) as Array<{ id: number }>);
  }

  throw error;
}

/**
 * Devuelve el mapa de overrides de la organización. Cacheado en memoria y
 * con deduplicación de peticiones en vuelo (igual que
 * `organizationTimezoneService`). Ante un error devuelve un mapa vacío: sin
 * override, la cascada cae en la zona de la organización, que es lo correcto.
 */
export async function getBranchTimezones(organizationId: number): Promise<BranchTimezoneMap> {
  const cached = cache.get(organizationId);
  if (cached) return cached;

  const existing = inflight.get(organizationId);
  if (existing) return existing;

  const promise = (async (): Promise<BranchTimezoneMap> => {
    try {
      const map = await fetchMap(organizationId);
      cache.set(organizationId, map);
      return map;
    } catch (err) {
      console.warn('[timezone] No se pudieron leer las zonas de las sucursales:', err);
      return {};
    } finally {
      inflight.delete(organizationId);
    }
  })();

  inflight.set(organizationId, promise);
  return promise;
}

/**
 * Invalida el caché. Obligatorio tras guardar la zona de una sucursal o al
 * cambiar de organización: si no, la UI sigue formateando con la zona vieja.
 */
export function invalidateBranchTimezoneCache(organizationId?: number): void {
  if (organizationId !== undefined) {
    cache.delete(organizationId);
    inflight.delete(organizationId);
  } else {
    cache.clear();
    inflight.clear();
  }
}
