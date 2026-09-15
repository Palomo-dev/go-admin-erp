/**
 * F12 — recompensa de un referido (puro, sin I/O).
 *
 * Marcar la recompensa como pagada es un REGISTRO (`reward_paid`,
 * `reward_paid_at`): aquí no se mueve dinero. Solo procede cuando el referido
 * está `converted`, tiene programa y aún no se pagó. Los valores de
 * `reward_type`/`reward_to` son los del CHECK de `referral_programs`
 * (verificados por MCP el 2026-09-15).
 */

export const REWARD_TYPES = ['credit', 'discount', 'cash', 'gift'] as const;
export const REWARD_TO = ['referrer', 'referred', 'both'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];
export type RewardTo = (typeof REWARD_TO)[number];

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  credit: 'Crédito',
  discount: 'Descuento',
  cash: 'Efectivo',
  gift: 'Regalo',
};

export const REWARD_TO_LABELS: Record<RewardTo, string> = {
  referrer: 'Referidor',
  referred: 'Referido',
  both: 'Ambos',
};

export interface RewardableReferral {
  status: string;
  reward_paid: boolean;
  program_id: string | null;
}

export type RewardCheck =
  | { ok: true }
  | { ok: false; code: 'NOT_CONVERTED' | 'ALREADY_PAID' | 'NO_PROGRAM'; message: string; statusCode: 409 };

export function checkRewardPayable(referral: RewardableReferral): RewardCheck {
  if (referral.status !== 'converted') {
    return { ok: false, code: 'NOT_CONVERTED', statusCode: 409, message: 'La recompensa solo se paga cuando el referido está convertido' };
  }
  if (referral.reward_paid) {
    return { ok: false, code: 'ALREADY_PAID', statusCode: 409, message: 'La recompensa de este referido ya está marcada como pagada' };
  }
  if (!referral.program_id) {
    return { ok: false, code: 'NO_PROGRAM', statusCode: 409, message: 'El referido no está asociado a ningún programa: no hay recompensa que pagar' };
  }
  return { ok: true };
}

export function rewardPaidPatch(now: Date): { reward_paid: true; reward_paid_at: string } {
  return { reward_paid: true, reward_paid_at: now.toISOString() };
}

export interface RewardLike {
  reward_type: string;
  reward_amount: number | string | null;
  reward_to: string;
}

export interface RewardDescription {
  type: string;
  amount: string;
  to: string;
  summary: string;
}

function formatMoney(amount: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      // Código de moneda no ISO: cifra + código, sin inventar símbolo.
      return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
    }
  }
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(amount);
}

/**
 * Describe la recompensa de un programa para la interfaz. `currency` es la
 * moneda base de la organización (`null` si no está configurada: la cifra va
 * sin símbolo y el resumen lo dice). Nunca se cablea una moneda.
 */
export function describeReward(program: RewardLike | null | undefined, currency: string | null): RewardDescription | null {
  if (!program) return null;
  const amountNumber = Number(program.reward_amount);
  const amount = Number.isFinite(amountNumber) ? amountNumber : 0;
  const type = (REWARD_TYPE_LABELS as Record<string, string>)[program.reward_type] ?? program.reward_type;
  const to = (REWARD_TO_LABELS as Record<string, string>)[program.reward_to] ?? program.reward_to;

  let amountText = '';
  let noCurrencyNote = '';
  if (program.reward_type === 'discount') {
    amountText = `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(amount)} %`;
  } else if (program.reward_type === 'gift') {
    amountText = amount > 0 ? formatMoney(amount, currency) : '';
    if (amount > 0 && !currency) noCurrencyNote = ' (sin moneda configurada)';
  } else {
    amountText = formatMoney(amount, currency);
    if (!currency) noCurrencyNote = ' (sin moneda configurada)';
  }

  const summary = `${type}${amountText ? ` ${amountText}` : ''}${noCurrencyNote} · para ${to.toLowerCase()}`;
  return { type, amount: amountText, to, summary };
}
