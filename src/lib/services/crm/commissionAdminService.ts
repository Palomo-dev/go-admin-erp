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
 * estado de partida con `buildTransitionPatch` y escribe por la RPC
 * `fn_comision_aplicar_transicion`, que exige `status = from` — la
 * concurrencia no puede pagar dos veces. La tabla `commissions` solo admite
 * SELECT para la sesión (20260928213000).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import {
  CommissionTransitionError,
  buildTransitionPatch,
  transitionFor,
  type CommissionAction,
  type CommissionPayment,
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
 * Rechazos propios de `fn_comision_aplicar_transicion` → el mismo contrato
 * HTTP que las validaciones del servidor (403/400/409). Otro error sigue
 * siendo un error de base de datos (502 en la ruta).
 */
const RECHAZOS_TRANSICION: Record<string, [string, number, string]> = {
  sin_permiso: ['Requiere rol de administrador o manager de la organización', 403, 'MANAGER_REQUIRED'],
  no_autenticado: ['Sesión requerida', 403, 'MANAGER_REQUIRED'],
  transicion_invalida: ['La transición no es válida para el estado actual de la comisión.', 409, 'INVALID_TRANSITION'],
  motivo_obligatorio: ['El motivo es obligatorio.', 400, 'REASON_REQUIRED'],
  cuenta_bancaria_invalida: ['La cuenta bancaria no existe en esta organización o está inactiva.', 400, 'BANK_ACCOUNT_INVALID'],
};

function rechazoDeLaBase(error: { message?: string }): unknown {
  const r = error.message ? RECHAZOS_TRANSICION[error.message] : undefined;
  return r ? new CommissionTransitionError(r[0], r[1], r[2]) : error;
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
  opts: { reason?: string; actorId?: string; now?: string; payment?: CommissionPayment } = {}
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
    payment: action === 'pay' ? opts.payment : undefined,
  });

  // La tabla ya no admite escritura desde la sesión: la transición va por
  // fn_comision_aplicar_transicion (20260928213000), que exige gestor, la
  // transición válida, solo status/paid_at/notes/metadata y la cuenta de la
  // organización, y escribe con `status = from` (la concurrencia no paga dos veces).
  const { from } = transitionFor(action);
  const { data, error } = await supabase
    .rpc('fn_comision_aplicar_transicion', { p_org: orgId, p_id: commissionId, p_desde: from, p_cambios: patch })
    .select(COMMISSION_COLUMNS)
    .maybeSingle();
  if (error) throw rechazoDeLaBase(error);
  if (!data) {
    // Alguien cambió el estado entre la lectura y la escritura.
    throw new CommissionTransitionError('La comisión cambió de estado mientras se procesaba; recarga la lista.');
  }
  return data as unknown as CommissionRow;
}

/**
 * La cuenta bancaria elegida debe ser de ESTA organización y estar activa: el
 * asiento del pago la usa como cuenta de dinero. En lote se valida una vez.
 */
export async function assertBankAccountOfOrg(bankAccountId: number | null | undefined, orgId: number, supabase: SupabaseClient): Promise<void> {
  if (!bankAccountId) return;
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CommissionTransitionError('La cuenta bancaria no existe en esta organización o está inactiva.', 400, 'BANK_ACCOUNT_INVALID');
}

export async function payCommission(commissionId: string, orgId: number, supabase: SupabaseClient, actorId?: string, payment?: CommissionPayment) {
  await assertBankAccountOfOrg(payment?.bankAccountId, orgId, supabase);
  return transitionCommission('pay', commissionId, orgId, supabase, { actorId, payment });
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
  actorId?: string,
  payment?: CommissionPayment
): Promise<BulkPayResult> {
  const result: BulkPayResult = { paid: [], failed: [] };
  const unique = Array.from(new Set(commissionIds));
  // Una cuenta ajena o inactiva aborta el lote (400) antes de pagar nada.
  await assertBankAccountOfOrg(payment?.bankAccountId, orgId, supabase);
  for (const id of unique) {
    try {
      const row = await transitionCommission('pay', id, orgId, supabase, { actorId, payment });
      if (row) result.paid.push(id);
      else result.failed.push({ id, reason: 'No existe en esta organización' });
    } catch (err) {
      if (err instanceof CommissionTransitionError) result.failed.push({ id, reason: err.message });
      else throw err;
    }
  }
  return result;
}

export interface MoneyAccountOption {
  id: number;
  name: string;
  bank_name: string | null;
  /** Solo los 4 últimos dígitos: la lista viaja al navegador. */
  last4: string | null;
  currency: string | null;
}

/** Cuentas bancarias activas de la organización para elegir de dónde sale el pago. */
export async function listMoneyAccounts(orgId: number, supabase: SupabaseClient): Promise<MoneyAccountOption[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, name, bank_name, account_number, currency')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data || []) as Array<{ id: number; name: string | null; bank_name: string | null; account_number: string | null; currency: string | null }>).map((a) => ({
    id: a.id,
    name: a.name || `#${a.id}`,
    bank_name: a.bank_name,
    last4: a.account_number ? a.account_number.replace(/\s+/g, '').slice(-4) : null,
    currency: a.currency ? a.currency.trim() : null,
  }));
}
