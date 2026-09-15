/**
 * F12 — máquina de estados de un referido (pura, sin I/O).
 *
 *   pending → contacted → qualified → converted
 *      └──────────┴──────────┴──────→ rejected
 *
 * `converted` y `rejected` son terminales. Pasar a `converted` exige que el
 * referido ya esté enlazado a algo real: una oportunidad (`opportunity_id`) o
 * una ficha de cliente (`referred_customer_id`). Los valores son los del CHECK
 * `referrals_status_check` verificado por MCP el 2026-09-15.
 */

export const REFERRAL_STATUSES = ['pending', 'contacted', 'qualified', 'converted', 'rejected'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

const NEXT: Record<ReferralStatus, readonly ReferralStatus[]> = {
  pending: ['contacted', 'rejected'],
  contacted: ['qualified', 'rejected'],
  qualified: ['converted', 'rejected'],
  converted: [],
  rejected: [],
};

export function isReferralStatus(value: unknown): value is ReferralStatus {
  return typeof value === 'string' && (REFERRAL_STATUSES as readonly string[]).includes(value);
}

export function isReferralTerminal(status: ReferralStatus): boolean {
  return NEXT[status].length === 0;
}

/** Estados a los que se puede pasar desde `from` (vacío en terminales). */
export function nextReferralStatuses(from: ReferralStatus): ReferralStatus[] {
  return [...NEXT[from]];
}

export function canTransitionReferral(from: ReferralStatus, to: ReferralStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

export interface ReferralLinks {
  opportunity_id: string | null | undefined;
  referred_customer_id: string | null | undefined;
}

export type ReferralTransitionCode = 'INVALID_STATUS' | 'INVALID_TRANSITION' | 'CONVERSION_REQUIRES_LINK';

export type ReferralTransitionCheck =
  | { ok: true }
  | { ok: false; code: ReferralTransitionCode; message: string; statusCode: 400 | 409 };

function hasLink(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function checkReferralTransition(from: unknown, to: unknown, links: ReferralLinks): ReferralTransitionCheck {
  if (!isReferralStatus(to)) {
    return { ok: false, code: 'INVALID_STATUS', statusCode: 400, message: `Estado desconocido: ${String(to)}` };
  }
  if (!isReferralStatus(from)) {
    return { ok: false, code: 'INVALID_STATUS', statusCode: 409, message: `El referido está en un estado desconocido: ${String(from)}` };
  }
  if (!canTransitionReferral(from, to)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      statusCode: 409,
      message: `No se puede pasar de «${from}» a «${to}»`,
    };
  }
  if (to === 'converted' && !hasLink(links.opportunity_id) && !hasLink(links.referred_customer_id)) {
    return {
      ok: false,
      code: 'CONVERSION_REQUIRES_LINK',
      statusCode: 409,
      message: 'Para marcarlo como convertido, primero conviértelo en lead u oportunidad',
    };
  }
  return { ok: true };
}

export class ReferralTransitionError extends Error {
  statusCode: 400 | 409;
  code: ReferralTransitionCode;
  constructor(check: Exclude<ReferralTransitionCheck, { ok: true }>) {
    super(check.message);
    this.name = 'ReferralTransitionError';
    this.statusCode = check.statusCode;
    this.code = check.code;
  }
}

export function assertReferralTransition(from: unknown, to: unknown, links: ReferralLinks): asserts to is ReferralStatus {
  const check = checkReferralTransition(from, to, links);
  if (!check.ok) throw new ReferralTransitionError(check);
}
