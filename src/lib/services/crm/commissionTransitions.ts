/**
 * F13 — máquina de estados de `commissions.status`.
 *
 * La BD solo admite `accrued | paid | cancelled` (CHECK
 * `commissions_status_check`, verificado por MCP el 2026-09-15). No existen
 * `rejected` ni `clawed_back`: «rechazar» es `cancelled` con
 * `metadata.reason = 'rejected'`, y «clawback» es `cancelled` con
 * `metadata.reason = 'clawback'`, `metadata.clawback_of_paid = true` y
 * `metadata.paid_at_before_clawback`. `paid_at` NO se borra en el clawback:
 * el pago ocurrió y el asiento contable existe.
 *
 * Toda escritura en el servicio debe exigir además `.eq('status', from)` para
 * que dos peticiones concurrentes no paguen dos veces.
 */

import { STAGE_MANAGER_ROLE_IDS } from './stagePermissions';

export type CommissionStatus = 'accrued' | 'paid' | 'cancelled';
export type CommissionAction = 'pay' | 'reject' | 'clawback';
export type CancellationKind = 'rejected' | 'clawback' | 'cancelled';

export const COMMISSION_STATUSES: readonly CommissionStatus[] = ['accrued', 'paid', 'cancelled'];
export const COMMISSION_ACTIONS: readonly CommissionAction[] = ['pay', 'reject', 'clawback'];

const TRANSITIONS: Record<CommissionAction, { from: CommissionStatus; to: CommissionStatus }> = {
  pay: { from: 'accrued', to: 'paid' },
  reject: { from: 'accrued', to: 'cancelled' },
  clawback: { from: 'paid', to: 'cancelled' },
};

export class CommissionTransitionError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 409, code = 'INVALID_TRANSITION') {
    super(message);
    this.name = 'CommissionTransitionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function transitionFor(action: CommissionAction): { from: CommissionStatus; to: CommissionStatus } {
  return TRANSITIONS[action];
}

export function canTransition(status: string, action: CommissionAction): boolean {
  return TRANSITIONS[action].from === status;
}

export interface TransitionRow {
  status: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
}

export interface TransitionOptions {
  /** Instante ISO (`new Date().toISOString()` en el servidor). */
  now: string;
  /** Obligatorio para `reject` y `clawback`. */
  reason?: string;
  /** `ctx.userId`, para dejar rastro de quién lo hizo. */
  actorId?: string;
}

export interface TransitionPatch {
  status: CommissionStatus;
  updated_at: string;
  paid_at?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Construye el `update` de una transición validando el estado de partida.
 * Lanza `CommissionTransitionError` (409) si el estado no coincide o falta el motivo.
 */
export function buildTransitionPatch(action: CommissionAction, row: TransitionRow, opts: TransitionOptions): TransitionPatch {
  const t = TRANSITIONS[action];
  if (row.status !== t.from) {
    throw new CommissionTransitionError(
      `No se puede aplicar «${action}» a una comisión en estado «${row.status}» (se requiere «${t.from}»).`
    );
  }
  if (action === 'pay') {
    return { status: 'paid', paid_at: opts.now, updated_at: opts.now };
  }
  const reason = (opts.reason ?? '').trim();
  if (!reason) {
    throw new CommissionTransitionError('El motivo es obligatorio.', 400, 'REASON_REQUIRED');
  }
  const previous = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (action === 'reject') {
    return {
      status: 'cancelled',
      notes: reason,
      updated_at: opts.now,
      metadata: { ...previous, reason: 'rejected', rejected_at: opts.now, ...(opts.actorId ? { rejected_by: opts.actorId } : {}) },
    };
  }
  return {
    status: 'cancelled',
    notes: reason,
    updated_at: opts.now,
    metadata: {
      ...previous,
      reason: 'clawback',
      clawback_of_paid: true,
      paid_at_before_clawback: row.paid_at,
      clawback_at: opts.now,
      ...(opts.actorId ? { clawback_by: opts.actorId } : {}),
    },
  };
}

/** Qué clase de cancelación es (para etiquetar la fila en la UI). */
export function cancellationKind(metadata: Record<string, unknown> | null | undefined): CancellationKind {
  const reason = metadata && typeof metadata === 'object' ? metadata.reason : undefined;
  if (reason === 'rejected') return 'rejected';
  if (reason === 'clawback') return 'clawback';
  return 'cancelled';
}

export interface CommissionSummary {
  /** Devengado = pendiente + pagado (lo que se generó y sigue vivo). */
  accrued_total: number;
  pending_total: number;
  paid_total: number;
  cancelled_total: number;
  rejected_total: number;
  clawback_total: number;
  count: number;
  count_pending: number;
  count_paid: number;
  count_cancelled: number;
}

export interface SummaryRow {
  status: string;
  commission_amount: number | string | null;
  metadata?: Record<string, unknown> | null;
  /** `commissions.currency`; nula o vacía cuenta como la moneda base. */
  currency?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeCommissions(rows: readonly SummaryRow[]): CommissionSummary {
  const s: CommissionSummary = {
    accrued_total: 0,
    pending_total: 0,
    paid_total: 0,
    cancelled_total: 0,
    rejected_total: 0,
    clawback_total: 0,
    count: rows.length,
    count_pending: 0,
    count_paid: 0,
    count_cancelled: 0,
  };
  for (const r of rows) {
    const amount = Number(r.commission_amount) || 0;
    if (r.status === 'accrued') {
      s.pending_total += amount;
      s.count_pending += 1;
    } else if (r.status === 'paid') {
      s.paid_total += amount;
      s.count_paid += 1;
    } else if (r.status === 'cancelled') {
      s.cancelled_total += amount;
      s.count_cancelled += 1;
      const kind = cancellationKind(r.metadata);
      if (kind === 'rejected') s.rejected_total += amount;
      else if (kind === 'clawback') s.clawback_total += amount;
    }
  }
  s.accrued_total = round2(s.pending_total + s.paid_total);
  s.pending_total = round2(s.pending_total);
  s.paid_total = round2(s.paid_total);
  s.cancelled_total = round2(s.cancelled_total);
  s.rejected_total = round2(s.rejected_total);
  s.clawback_total = round2(s.clawback_total);
  return s;
}

export interface CurrencySummary extends CommissionSummary {
  currency: string;
}

export interface MultiCurrencySummary {
  /** La moneda base de la organización (o, sin base configurada, la más frecuente). */
  primary: CurrencySummary;
  /** Las demás monedas, cada una con su propio resumen; ordenadas por código. */
  others: CurrencySummary[];
}

/** Agrupa filas por moneda; `null`/vacía → la base. */
export function groupByCurrency<T extends { currency?: string | null }>(rows: readonly T[], base: string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const code = (r.currency ?? '').trim().toUpperCase() || base;
    const list = groups.get(code);
    if (list) list.push(r);
    else groups.set(code, [r]);
  }
  return groups;
}

/** Sin base configurada: la moneda con más filas (empate → código alfabético); sin filas → `null`. */
export function resolvePrimaryCurrency(rows: readonly { currency?: string | null }[], base: string | null): string | null {
  if (base) return base;
  let best: { code: string; n: number } | null = null;
  for (const [code, list] of groupByCurrency(rows, '')) {
    if (!code) continue;
    if (!best || list.length > best.n || (list.length === best.n && code < best.code)) best = { code, n: list.length };
  }
  return best?.code ?? null;
}

/**
 * Resumen POR MONEDA: nunca se suman importes de monedas distintas (dato real:
 * una organización con 18 comisiones en COP y 1 en USD de 11.344,54 mostraba un
 * «devengado» que mezclaba ambas). La base va como principal; el resto aparte.
 */
export function summarizeCommissionsByCurrency(rows: readonly SummaryRow[], baseCurrency: string | null): MultiCurrencySummary {
  const primaryCode = resolvePrimaryCurrency(rows, baseCurrency) ?? '';
  const groups = groupByCurrency(rows, primaryCode);
  const primary: CurrencySummary = { currency: primaryCode, ...summarizeCommissions(groups.get(primaryCode) ?? []) };
  const others = Array.from(groups.entries())
    .filter(([code]) => code !== primaryCode)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, list]) => ({ currency: code, ...summarizeCommissions(list) }));
  return { primary, others };
}

/**
 * Quién puede pagar/rechazar/revertir comisiones y fijar cuotas: admin o
 * manager de la organización, resuelto en el servidor por id de rol
 * (`STAGE_MANAGER_ROLE_IDS`, la misma lista del gate de etapas). Nunca por
 * nombre ni por un valor del cliente.
 */
export function canManageCommissions(ctx: { roleId: number; isSuperAdmin?: boolean | null }): boolean {
  return ctx.isSuperAdmin === true || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId);
}
