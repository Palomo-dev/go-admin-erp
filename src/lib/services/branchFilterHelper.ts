import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

/**
 * Helper centralizado para aplicar filtro de sucursal a consultas Supabase.
 *
 * Provee dos variantes:
 *
 * 1. `applyBranchFilter(query, branchFilter)` — para datos transaccionales:
 *    - branchFilter = number  → .eq('branch_id', branchFilter)
 *    - branchFilter = null    → NO filtra (modo "Todas las sucursales")
 *    - branchFilter = undefined → NO filtra
 *
 * 2. `applyBranchFilterStrict(query, branchId)` — para configuración global/sucursal:
 *    - branchId = number  → .eq('branch_id', branchId)
 *    - branchId = null    → .is('branch_id', null) (registros globales)
 *    - branchId = undefined → NO filtra
 *
 * @example
 * // Lectura transaccional (respeta "Todas"):
 * const { data } = await applyBranchFilter(
 *   supabase.from('sales').select('*').eq('organization_id', orgId),
 *   branchFilter
 * );
 *
 * @example
 * // Configuración global + por sucursal:
 * const { data } = await applyBranchFilterStrict(
 *   supabase.from('website_settings').select('*').eq('organization_id', orgId),
 *   branchId
 * );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseFilterBuilder = PostgrestFilterBuilder<any, any, any, any, any>;

/**
 * Aplica filtro de sucursal para datos transaccionales.
 * - null = "Todas las sucursales" → NO filtra
 * - number = sucursal específica → .eq('branch_id', n)
 * - undefined = no filtra
 */
export function applyBranchFilter<T extends SupabaseFilterBuilder>(
  query: T,
  branchFilter?: number | null,
): T {
  if (branchFilter != null && typeof branchFilter === 'number' && Number.isFinite(branchFilter) && branchFilter > 0) {
    return query.eq('branch_id', branchFilter);
  }
  // null, undefined, no-finito o <= 0 → no filtrar (Todas las sucursales o sin especificar)
  return query;
}

/**
 * Aplica filtro de sucursal para configuración global + por sucursal.
 * - null = registros globales → .is('branch_id', null)
 * - number = sucursal específica → .eq('branch_id', n)
 * - undefined = no filtra (trae todo)
 */
export function applyBranchFilterStrict<T extends SupabaseFilterBuilder>(
  query: T,
  branchId?: number | null,
): T {
  if (branchId != null && typeof branchId === 'number' && Number.isFinite(branchId) && branchId > 0) {
    return query.eq('branch_id', branchId);
  }
  if (branchId === null) {
    return query.is('branch_id', null);
  }
  // undefined → no filtrar
  return query;
}
