/**
 * F13 — gestión de comisiones en el servidor (pagar, rechazar, clawback,
 * listar). Solo servidor: recibe el cliente Supabase de la sesión por
 * parámetro y nunca importa `@/lib/supabase/config`.
 *
 * Nació como la cola «server-side (F13)» de `commissionService.ts` (que es la
 * clase del navegador y sigue en la allow-list de deuda del guardarraíl 6);
 * se separa para que los route handlers no arrastren el cliente browser.
 *
 * Dinero: cada transición lee la fila (acotada por organización), valida el
 * estado de partida con `buildTransitionPatch` y escribe exigiendo
 * `.eq('status', from)` — la concurrencia no puede pagar dos veces.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import {
  CommissionTransitionError,
  buildTransitionPatch,
  transitionFor,
  type CommissionAction,
} from './commissionTransitions';

export interface CommissionRow {
  id: string;
  organization_id: number;
  branch_id: number | null;
  commission_type: string;
  source_type: string;
  source_id: string;
  source_item_id: string | null;
  payee_type: string;
  payee_id: string | null;
  payee_name: string | null;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  currency: string | null;
  status: string;
  accrued_at: string | null;
  paid_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionListFilters {
  status?: string;
  payee_id?: string;
  source_type?: string;
  commission_type?: string;
  /** Día calendario (YYYY-MM-DD) → se compara contra `accrued_at` con instantes ya convertidos por quien llama. */
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const COMMISSION_COLUMNS =
  'id, organization_id, branch_id, commission_type, source_type, source_id, source_item_id, payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount, currency, status, accrued_at, paid_at, notes, metadata, created_by, created_at, updated_at';

/** Subconjunto del builder de PostgREST que usan los filtros (evita la instanciación profunda del tipo genérico). */
interface Filterable {
  eq(c: string, v: unknown): Filterable;
  gte(c: string, v: string): Filterable;
  lt(c: string, v: string): Filterable;
  or(e: string): Filterable;
}

function applyFilters<T>(query: T, filters: CommissionListFilters): T {
  let q = query as unknown as Filterable;
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.payee_id) q = q.eq('payee_id', filters.payee_id);
  if (filters.source_type) q = q.eq('source_type', filters.source_type);
  if (filters.commission_type) q = q.eq('commission_type', filters.commission_type);
  if (filters.from) q = q.gte('accrued_at', filters.from);
  if (filters.to) q = q.lt('accrued_at', filters.to);
  if (filters.search) {
    // Helper único: término entrecomillado, comas y paréntesis ya no son sintaxis del `or`.
    const filter = ilikeAnyOf(['payee_name', 'notes'], filters.search);
    if (filter) q = q.or(filter);
  }
  return q as T;
}

/** Lista comisiones de la organización con filtros (página de la lista). */
export async function listCommissions(
  orgId: number,
  supabase: SupabaseClient,
  filters: CommissionListFilters = {}
): Promise<{ data: CommissionRow[]; count: number }> {
  const base = supabase
    .from('commissions')
    .select(COMMISSION_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('accrued_at', { ascending: false });
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const { data, error, count } = await applyFilters(base, filters).range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: (data || []) as unknown as CommissionRow[], count: count || 0 };
}

/** Filas mínimas del MISMO filtro, sin paginar, para el resumen devengado/pagado/pendiente. */
export async function listCommissionSummaryRows(
  orgId: number,
  supabase: SupabaseClient,
  filters: CommissionListFilters = {}
): Promise<Array<{ status: string; commission_amount: number; metadata: Record<string, unknown> | null; currency: string | null }>> {
  const base = supabase.from('commissions').select('status, commission_amount, metadata, currency').eq('organization_id', orgId);
  const { data, error } = await applyFilters(base, filters);
  if (error) throw error;
  return (data || []) as Array<{ status: string; commission_amount: number; metadata: Record<string, unknown> | null; currency: string | null }>;
}

/**
 * Aplica una transición a una comisión de la organización.
 * - `null` → no existe en esta organización (404).
 * - lanza `CommissionTransitionError` (409/400) si el estado no lo permite o falta motivo.
 */
export async function transitionCommission(
  action: CommissionAction,
  commissionId: string,
  orgId: number,
  supabase: SupabaseClient,
  opts: { reason?: string; actorId?: string; now?: string } = {}
): Promise<CommissionRow | null> {
  const { data: row, error: readError } = await supabase
    .from('commissions')
    .select('id, status, paid_at, metadata, notes, organization_id')
    .eq('id', commissionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return null;

  const now = opts.now ?? new Date().toISOString();
  const patch = buildTransitionPatch(action, row as { status: string; paid_at: string | null; metadata: Record<string, unknown> | null; notes: string | null }, {
    now,
    reason: opts.reason,
    actorId: opts.actorId,
  });

  const { from } = transitionFor(action);
  const { data, error } = await supabase
    .from('commissions')
    .update(patch)
    .eq('id', commissionId)
    .eq('organization_id', orgId)
    .eq('status', from)
    .select(COMMISSION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Alguien cambió el estado entre la lectura y la escritura.
    throw new CommissionTransitionError('La comisión cambió de estado mientras se procesaba; recarga la lista.');
  }
  return data as unknown as CommissionRow;
}

export function payCommission(commissionId: string, orgId: number, supabase: SupabaseClient, actorId?: string) {
  return transitionCommission('pay', commissionId, orgId, supabase, { actorId });
}

export function rejectCommission(commissionId: string, orgId: number, reason: string, supabase: SupabaseClient, actorId?: string) {
  return transitionCommission('reject', commissionId, orgId, supabase, { reason, actorId });
}

export function clawbackCommission(commissionId: string, orgId: number, reason: string, supabase: SupabaseClient, actorId?: string) {
  return transitionCommission('clawback', commissionId, orgId, supabase, { reason, actorId });
}

export interface BulkPayResult {
  paid: string[];
  failed: Array<{ id: string; reason: string }>;
}

/** Pago masivo: una a una, cada una validando su estado; ninguna 409 aborta al resto. */
export async function bulkPayCommissions(
  commissionIds: string[],
  orgId: number,
  supabase: SupabaseClient,
  actorId?: string
): Promise<BulkPayResult> {
  const result: BulkPayResult = { paid: [], failed: [] };
  const unique = Array.from(new Set(commissionIds));
  for (const id of unique) {
    try {
      const row = await payCommission(id, orgId, supabase, actorId);
      if (row) result.paid.push(id);
      else result.failed.push({ id, reason: 'No existe en esta organización' });
    } catch (err) {
      if (err instanceof CommissionTransitionError) result.failed.push({ id, reason: err.message });
      else throw err;
    }
  }
  return result;
}
