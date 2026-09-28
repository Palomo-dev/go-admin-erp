/**
 * Informe «Satisfacción en caja» (Fase 4 de la pantalla del cliente,
 * PLAN §4.2): lo que el cliente calificó en la pantalla del POS, agregado
 * por sucursal y por terminal.
 *
 * Qué NO hay aquí: ningún dato personal. `pos_display_feedback` solo guarda
 * organización, sucursal, terminal, venta, un número de 1 a 5 y la fecha, y
 * este informe no cruza con `customers` ni con nada que identifique a quien
 * calificó. Si alguna vez hace falta «quién opinó», no es este informe.
 *
 * `aggregateSatisfaction` es PURA (sin Supabase, sin fechas): se prueba en
 * Node con filas sintéticas. La consulta vive aparte y usa el mismo filtro de
 * fechas y zona horaria que los demás informes del POS (`getDateRange` con
 * la zona de la organización).
 */

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { getDateRange } from '@/lib/utils/timezone';

/** Una calificación tal como sale de la tabla. */
export interface SatisfactionRow {
  rating: number;
  branch_id: number | null;
  terminal_id: string | null;
  created_at: string;
}

export interface SatisfactionGroup {
  id: string;
  name: string;
  count: number;
  /** Promedio del grupo, redondeado a un decimal. */
  average: number;
}

export interface SatisfactionReport {
  /** Cuántas calificaciones válidas (1-5) entran en el informe. */
  total: number;
  /** Promedio general, redondeado a un decimal; 0 si no hay ninguna. */
  average: number;
  /** Cuántas de cada nota, de 1 a 5. Siempre las cinco claves, aunque sean 0. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  byBranch: SatisfactionGroup[];
  byTerminal: SatisfactionGroup[];
}

export interface SatisfactionNames {
  /** id de sucursal → nombre. Lo que falte se pinta con el id. */
  branches?: Record<string, string>;
  /** id de terminal → nombre (o código). */
  terminals?: Record<string, string>;
}

export interface SatisfactionFilters {
  /** Día calendario YYYY-MM-DD en la zona de la organización. */
  startDate: string;
  endDate: string;
  /** Zona horaria de la organización (nunca se cablea: sale del contexto). */
  timezone: string;
  branchId?: number;
}

/** Una nota válida es un entero de 1 a 5; cualquier otra cosa no cuenta (la BD lo impide, pero el informe no depende de eso). */
function isRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Promedio con un decimal; sin muestras, 0. */
export function roundAverage(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 10) / 10;
}

function emptyDistribution(): Record<1 | 2 | 3 | 4 | 5, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function toGroups(totals: Map<string, { sum: number; count: number }>, names: Record<string, string> | undefined): SatisfactionGroup[] {
  return Array.from(totals.entries())
    .map(([id, { sum, count }]) => ({ id, name: names?.[id] ?? id, count, average: roundAverage(sum, count) }))
    // Primero quien más calificaciones tiene; a igualdad, por nombre, para que el orden no baile entre recargas.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Agrega las filas. Descarta lo que no sea una nota de 1 a 5 y agrupa por
 * sucursal y por terminal; una fila sin sucursal o sin terminal (no debería
 * existir: las dos columnas son NOT NULL) cuenta en el total y en la
 * distribución, pero no en su grupo.
 */
export function aggregateSatisfaction(rows: readonly SatisfactionRow[], names: SatisfactionNames = {}): SatisfactionReport {
  const distribution = emptyDistribution();
  const branches = new Map<string, { sum: number; count: number }>();
  const terminals = new Map<string, { sum: number; count: number }>();
  let total = 0;
  let sum = 0;

  const add = (map: Map<string, { sum: number; count: number }>, key: string | null | undefined, rating: number) => {
    if (key === null || key === undefined || key === '') return;
    const current = map.get(key) ?? { sum: 0, count: 0 };
    map.set(key, { sum: current.sum + rating, count: current.count + 1 });
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const rating = typeof row?.rating === 'number' ? row.rating : Number(row?.rating);
    if (!isRating(rating)) continue;
    total += 1;
    sum += rating;
    distribution[rating] += 1;
    add(branches, row.branch_id === null || row.branch_id === undefined ? null : String(row.branch_id), rating);
    add(terminals, row.terminal_id, rating);
  }

  return {
    total,
    average: roundAverage(sum, total),
    distribution,
    byBranch: toGroups(branches, names.branches),
    byTerminal: toGroups(terminals, names.terminals),
  };
}

/**
 * ¿Tiene la organización ALGUNA terminal registrada en `pos_terminals`?
 *
 * Un informe vacío tiene dos causas muy distintas y hasta ahora se pintaban
 * igual (ronda 2 · QA-5): «nadie ha calificado todavía» y «ninguna caja está
 * vinculada, así que la ruta responde 404 y no se guardará nunca nada». La
 * segunda tiene arreglo y hay que decirla.
 *
 * Va aparte de `getSatisfactionReport` a propósito: solo hace falta cuando
 * el informe sale vacío, y el informe no debe pagar una consulta más en el
 * caso normal. Nunca lanza: si no se puede comprobar devuelve `null` y la
 * página se calla.
 */
export async function hasRegisteredTerminals(
  client: SatisfactionClient = supabase as unknown as SatisfactionClient,
  organizationId: number = getOrganizationId(),
): Promise<boolean | null> {
  if (!organizationId) return null;
  try {
    const { data, error } = await client.from('pos_terminals').select('id').eq('organization_id', organizationId).limit(1);
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn('[pos-display] no se pudo comprobar si hay cajas vinculadas:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Cliente mínimo de Supabase que usa este servicio (para inyectar un doble en las pruebas). */
export interface SatisfactionClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): SatisfactionQuery;
    };
  };
}
interface SatisfactionQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(column: string, value: unknown): SatisfactionQuery;
  gte(column: string, value: unknown): SatisfactionQuery;
  lte(column: string, value: unknown): SatisfactionQuery;
  in(column: string, values: readonly unknown[]): SatisfactionQuery;
  order(column: string, opts?: { ascending?: boolean }): SatisfactionQuery;
  limit(n: number): SatisfactionQuery;
}

/** Cuántas calificaciones se leen como mucho: un informe, no una exportación. */
export const SATISFACTION_ROWS_LIMIT = 5000;

/**
 * Lee las calificaciones del rango y las agrega. El rango se convierte a
 * instantes con la zona horaria de la organización (`getDateRange`), como el
 * resto de informes del POS: un `created_at` es `timestamptz` y filtrarlo con
 * el día suelto se comería (o añadiría) las horas del cambio de día.
 */
export async function getSatisfactionReport(
  filters: SatisfactionFilters,
  client: SatisfactionClient = supabase as unknown as SatisfactionClient,
  organizationId: number = getOrganizationId(),
): Promise<SatisfactionReport> {
  const empty = aggregateSatisfaction([]);
  if (!organizationId) return empty;

  const { start, end } = getDateRange(filters.startDate, filters.endDate, filters.timezone);
  let query = client
    .from('pos_display_feedback')
    .select('rating, branch_id, terminal_id, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .limit(SATISFACTION_ROWS_LIMIT);
  if (filters.branchId) query = query.eq('branch_id', filters.branchId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as SatisfactionRow[];

  const [branches, terminals] = await Promise.all([
    readNames(client, 'branches', organizationId, Array.from(new Set(rows.map((r) => r.branch_id).filter((id): id is number => typeof id === 'number')))),
    readNames(client, 'pos_terminals', organizationId, Array.from(new Set(rows.map((r) => r.terminal_id).filter((id): id is string => typeof id === 'string')))),
  ]);

  return aggregateSatisfaction(rows, { branches, terminals });
}

/**
 * Nombres de las sucursales / terminales que aparecen en el informe. Un
 * fallo aquí NO rompe el informe: sin nombres se pintan los ids.
 */
async function readNames(
  client: SatisfactionClient,
  table: 'branches' | 'pos_terminals',
  organizationId: number,
  ids: readonly (string | number)[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const { data, error } = await client
      .from(table)
      .select(table === 'branches' ? 'id, name' : 'id, name, code')
      .eq('organization_id', organizationId)
      .in('id', ids);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const row of Array.isArray(data) ? data : []) {
      const entry = row as { id: string | number; name?: string | null; code?: string | null };
      const name = (typeof entry.name === 'string' && entry.name.trim()) || (typeof entry.code === 'string' && entry.code.trim()) || '';
      if (name) out[String(entry.id)] = name;
    }
    return out;
  } catch (err) {
    console.warn(`[pos-display] no se pudieron leer los nombres de ${table}:`, err instanceof Error ? err.message : err);
    return {};
  }
}
