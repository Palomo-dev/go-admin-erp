/**
 * F10 — eventos de Stripe → entrada de `paymentService.registerCrmPayment`.
 * Puro. La organización sale de `metadata.organization_id` de la sesión de
 * Checkout (la puso la plataforma al crear el Payment Link), nunca del body
 * suelto; la ruta además exige que la firma verifique con el secreto de ESA
 * organización (o el de plataforma).
 */

import type { RegisterPaymentInput } from '@/lib/services/crm/paymentService';

/** Monedas que Stripe maneja sin unidades menores (importe = unidades mayores). */
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
/** Monedas de tres decimales en Stripe (1 KWD = 1000 fils): el importe menor va /1000. */
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL.has(String(currency).toLowerCase());
}

export function isThreeDecimalCurrency(currency: string): boolean {
  return THREE_DECIMAL.has(String(currency).toLowerCase());
}

/** Factor de unidades menores por unidad mayor según la moneda (1, 100 o 1000). */
export function minorUnitsPerMajor(currency: string): number {
  if (isZeroDecimalCurrency(currency)) return 1;
  if (isThreeDecimalCurrency(currency)) return 1000;
  return 100;
}

export function minorToMajor(amountMinor: number, currency: string): number {
  return amountMinor / minorUnitsPerMajor(currency);
}

export function majorToMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * minorUnitsPerMajor(currency));
}

export interface ParsedStripePayment {
  eventId: string;
  organizationId: number;
  quotationId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  sessionId: string;
  paymentIntentId: string | null;
  /** `checkout.session.payment_link`: el Payment Link que originó la sesión (para desactivarlo al quedar pagada la factura). */
  paymentLinkId: string | null;
  idempotencyKey: string;
  livemode: boolean;
}

/**
 * `ok:false` con `ignored:true` = evento firmado y bien formado que no toca
 * dinero todavía (sesión `unpaid`/`no_payment_required`, tipo no soportado):
 * se responde 200 para que Stripe NO reintente. Sin `ignored` = cuerpo
 * inválido (400).
 */
export type ParseStripeResult = { ok: true; payment: ParsedStripePayment } | { ok: false; reason: string; ignored?: boolean };

/** `completed` (pago inmediato) y `async_payment_succeeded` (débito diferido: `completed` llega `unpaid` y este trae el cobro). */
export const SUPPORTED_STRIPE_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'] as const;

export function isSupportedStripeEvent(type: unknown): boolean {
  return typeof type === 'string' && (SUPPORTED_STRIPE_EVENTS as readonly string[]).includes(type);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Interpreta un evento ya verificado por firma. No consulta nada. */
export function parseStripeCheckoutEvent(event: unknown): ParseStripeResult {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'Evento vacío' };
  const e = event as Record<string, unknown>;
  const eventId = str(e.id);
  if (!eventId) return { ok: false, reason: 'Evento sin id' };
  if (!isSupportedStripeEvent(e.type)) return { ok: false, reason: `Tipo no soportado: ${String(e.type)}`, ignored: true };
  const data = e.data && typeof e.data === 'object' ? (e.data as Record<string, unknown>) : null;
  const obj = data?.object && typeof data.object === 'object' ? (data.object as Record<string, unknown>) : null;
  if (!obj) return { ok: false, reason: 'Evento sin data.object' };
  if (obj.payment_status !== 'paid') return { ok: false, reason: `Sesión no pagada (${String(obj.payment_status)}): se registrará con async_payment_succeeded`, ignored: true };
  const sessionId = str(obj.id);
  if (!sessionId) return { ok: false, reason: 'Sesión sin id' };
  const metadata = obj.metadata && typeof obj.metadata === 'object' ? (obj.metadata as Record<string, unknown>) : {};
  const orgRaw = str(metadata.organization_id);
  const organizationId = orgRaw && /^\d+$/.test(orgRaw) ? Number.parseInt(orgRaw, 10) : 0;
  if (!organizationId || organizationId <= 0) return { ok: false, reason: 'metadata.organization_id ausente o inválida' };
  const quotationId = str(metadata.quotation_id);
  if (!quotationId) return { ok: false, reason: 'metadata.quotation_id ausente' };
  const currency = str(obj.currency);
  if (!currency) return { ok: false, reason: 'Sesión sin moneda' };
  const amountMinor = obj.amount_total;
  if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor <= 0) return { ok: false, reason: 'amount_total inválido' };
  const pi = obj.payment_intent;
  return {
    ok: true,
    payment: {
      eventId,
      organizationId,
      quotationId,
      invoiceId: str(metadata.invoice_id),
      amount: minorToMajor(amountMinor, currency),
      currency: currency.toUpperCase(),
      sessionId,
      paymentIntentId: typeof pi === 'string' ? pi : pi && typeof pi === 'object' ? str((pi as Record<string, unknown>).id) : null,
      paymentLinkId: typeof obj.payment_link === 'string' ? str(obj.payment_link) : obj.payment_link && typeof obj.payment_link === 'object' ? str((obj.payment_link as Record<string, unknown>).id) : null,
      idempotencyKey: `stripe:${eventId}`,
      livemode: e.livemode === true,
    },
  };
}

/** Entrada para `registerCrmPayment` (source='invoice_sales', status lo fija el servicio en 'completed'). */
export function toRegisterPaymentInput(p: ParsedStripePayment, invoiceId: string, paymentDateIso: string): RegisterPaymentInput {
  return {
    invoice_id: invoiceId,
    amount: p.amount,
    currency: p.currency,
    method: 'stripe',
    reference: p.idempotencyKey,
    payment_date: paymentDateIso,
    processor_response: { provider: 'stripe', event_id: p.eventId, session_id: p.sessionId, payment_intent_id: p.paymentIntentId, livemode: p.livemode },
    created_by: null,
    branch_id: null,
  };
}
