/**
 * F12 — comisión de partner (puro, sin I/O).
 *
 * La comisión de un partner es un REGISTRO en `partner_deals`
 * (`commission_amount`, `commission_status`, `commission_paid_at`): nada de
 * dinero real se mueve aquí ni en las rutas que lo usan. Valores de los CHECK
 * `partner_deals_commission_status_check` y `partner_deals_deal_type_check`
 * verificados por MCP el 2026-09-15.
 *
 * Tasa efectiva: la propia del partner si es > 0; si es 0 (= «hereda»),
 * `null` o inválida, la del tier; sin tier, 0.
 */

export const DEAL_TYPES = ['referral', 'co_sell', 'reseller'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  referral: 'Referido',
  co_sell: 'Venta conjunta',
  reseller: 'Reventa',
};

export const COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  paid: 'Pagada',
  rejected: 'Rechazada',
};

const NEXT: Record<CommissionStatus, readonly CommissionStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  paid: [],
  rejected: [],
};

export function isDealType(value: unknown): value is DealType {
  return typeof value === 'string' && (DEAL_TYPES as readonly string[]).includes(value);
}

export function isCommissionStatus(value: unknown): value is CommissionStatus {
  return typeof value === 'string' && (COMMISSION_STATUSES as readonly string[]).includes(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function effectiveCommissionRate(
  partner: { commission_rate: number | string | null | undefined },
  tier: { commission_rate: number | string | null | undefined } | null | undefined,
): number {
  const own = num(partner.commission_rate);
  if (own !== null && own > 0) return own;
  const fromTier = num(tier?.commission_rate);
  if (fromTier !== null && fromTier >= 0) return fromTier;
  return 0;
}

/** Monto de la oportunidad × tasa (%) / 100, a 2 decimales. Nunca NaN ni negativo. */
export function computePartnerCommission(amount: unknown, rate: number): number {
  const a = num(amount);
  const r = num(rate);
  if (a === null || a <= 0 || r === null || r < 0) return 0;
  return Math.round(a * r) / 100;
}

export function nextCommissionStatuses(from: CommissionStatus): CommissionStatus[] {
  return [...NEXT[from]];
}

export function canTransitionCommission(from: CommissionStatus, to: CommissionStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

export type CommissionTransitionCheck =
  | { ok: true }
  | { ok: false; code: 'INVALID_STATUS' | 'INVALID_TRANSITION'; message: string; statusCode: 400 | 409 };

export function checkCommissionTransition(from: unknown, to: unknown): CommissionTransitionCheck {
  if (!isCommissionStatus(to)) {
    return { ok: false, code: 'INVALID_STATUS', statusCode: 400, message: `Estado de comisión desconocido: ${String(to)}` };
  }
  if (!isCommissionStatus(from)) {
    return { ok: false, code: 'INVALID_STATUS', statusCode: 409, message: `El deal está en un estado desconocido: ${String(from)}` };
  }
  if (!canTransitionCommission(from, to)) {
    return { ok: false, code: 'INVALID_TRANSITION', statusCode: 409, message: `No se puede pasar la comisión de «${from}» a «${to}»` };
  }
  return { ok: true };
}

export class CommissionTransitionError extends Error {
  statusCode: 400 | 409;
  code: 'INVALID_STATUS' | 'INVALID_TRANSITION';
  constructor(check: Exclude<CommissionTransitionCheck, { ok: true }>) {
    super(check.message);
    this.name = 'PartnerCommissionTransitionError';
    this.statusCode = check.statusCode;
    this.code = check.code;
  }
}

/** Parche a escribir en `partner_deals` para la transición; solo `paid` fija `commission_paid_at`. */
export function commissionPatch(to: CommissionStatus, now: Date): { commission_status: CommissionStatus; commission_paid_at?: string } {
  return to === 'paid' ? { commission_status: to, commission_paid_at: now.toISOString() } : { commission_status: to };
}

export interface CommissionSummary {
  count: number;
  pending: number;
  approved: number;
  paid: number;
  rejected: number;
  /** Pendiente + aprobada: lo que la organización todavía debe registrar como pagado. */
  outstanding: number;
}

export function summarizeCommissions(
  deals: ReadonlyArray<{ commission_status: string; commission_amount: number | string | null }>,
): CommissionSummary {
  const s: CommissionSummary = { count: 0, pending: 0, approved: 0, paid: 0, rejected: 0, outstanding: 0 };
  for (const d of deals) {
    s.count += 1;
    const amount = num(d.commission_amount) ?? 0;
    if (isCommissionStatus(d.commission_status)) s[d.commission_status] = Math.round((s[d.commission_status] + amount) * 100) / 100;
  }
  s.outstanding = Math.round((s.pending + s.approved) * 100) / 100;
  return s;
}
