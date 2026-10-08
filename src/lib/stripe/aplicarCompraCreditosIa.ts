/**
 * Aplica en la base un Checkout de Stripe de COMPRA DE CRÉDITOS IA ya pagado.
 *
 * Solo marca la compra como `completed` en `ai_credit_purchases`. La suma de los
 * créditos a `ai_settings` la hace la base, en un único punto: el trigger
 * `trg_aplicar_creditos_compra_ia` (migración 20261008013059), que suma una
 * sola vez por compra y deja la marca `credits_applied_at`. Este módulo NUNCA
 * escribe `ai_settings`: antes el webhook sumaba a mano y el trigger también,
 * y cada compra se acreditaba dos veces (tres con un reenvío del evento).
 *
 * Idempotente: un `checkout.session.completed` repetido encuentra la compra ya
 * marcada y no escribe nada (`ya_aplicado`). Un Checkout es una compra: hay
 * UNIQUE sobre `stripe_checkout_session_id`.
 *
 * La organización sale de la metadata que puso el servidor al crear el Checkout
 * (`/api/stripe/purchase-ai-credits`) y llega dentro de un evento con firma
 * verificada; si la fila pendiente existe, manda la fila (organización y
 * créditos que calculó el servidor), no la metadata.
 *
 * Solo para el servidor: recibe el cliente service_role (authenticated y anon
 * no pueden escribir `ai_credit_purchases`).
 */

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { organizacionDelCheckout } from '@/lib/stripe/aplicarCheckoutDePlan';

export type ResultadoCompraCreditosIa =
  | { estado: 'aplicado' | 'ya_aplicado'; organizationId: number; creditos: number }
  | { estado: 'sin_pagar' }
  | { estado: 'invalido'; motivo: string };

/** Datos mínimos del Checkout que se leen (el objeto del evento). */
export type CheckoutDeCreditosIa = Pick<
  Stripe.Checkout.Session,
  'id' | 'metadata' | 'payment_status' | 'payment_intent' | 'amount_total' | 'currency'
>;

type FilaCompra = {
  id: string;
  organization_id: number;
  credits_amount: number;
  status: string;
  credits_applied_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enteroPositivo(valor: unknown): number {
  const n = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function esCheckoutDeCreditosIa(checkout: Pick<Stripe.Checkout.Session, 'mode' | 'metadata'>): boolean {
  return checkout.mode === 'payment' && checkout.metadata?.type === 'ai_credit_purchase';
}

export async function aplicarCompraCreditosIa(
  supabase: SupabaseClient,
  checkout: CheckoutDeCreditosIa,
): Promise<ResultadoCompraCreditosIa> {
  const organizationId = organizacionDelCheckout(checkout);
  const creditosMetadata = enteroPositivo(checkout.metadata?.creditsAmount);
  if (!organizationId || !creditosMetadata) {
    return { estado: 'invalido', motivo: 'metadata sin organizationId o creditsAmount' };
  }

  // Un pago diferido llega `unpaid` en checkout.session.completed y se confirma
  // con checkout.session.async_payment_succeeded: hasta entonces no se acredita.
  if (checkout.payment_status !== 'paid') {
    return { estado: 'sin_pagar' };
  }

  const paymentIntentId =
    typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id ?? null;
  const ahora = new Date().toISOString();

  const { data: fila, error: errorLectura } = await supabase
    .from('ai_credit_purchases')
    .select('id, organization_id, credits_amount, status, credits_applied_at')
    .eq('stripe_checkout_session_id', checkout.id)
    .maybeSingle<FilaCompra>();
  if (errorLectura) throw new Error(`ai_credit_purchases (lectura): ${errorLectura.message}`);

  if (fila) {
    if (fila.organization_id !== organizationId) {
      return { estado: 'invalido', motivo: 'la organización de la compra no coincide con la del Checkout' };
    }
    if (fila.credits_applied_at) {
      return { estado: 'ya_aplicado', organizationId, creditos: fila.credits_amount };
    }
    if (fila.status === 'refunded') {
      return { estado: 'invalido', motivo: 'la compra está reembolsada' };
    }

    // El trigger suma al pasar a completed. `credits_applied_at is null` evita
    // que dos entregas simultáneas escriban las dos (la segunda no encuentra fila).
    const { data: aplicada, error } = await supabase
      .from('ai_credit_purchases')
      .update({ status: 'completed', stripe_payment_intent_id: paymentIntentId, purchased_at: ahora, updated_at: ahora })
      .eq('id', fila.id)
      .is('credits_applied_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`ai_credit_purchases (actualización): ${error.message}`);
    return { estado: aplicada ? 'aplicado' : 'ya_aplicado', organizationId, creditos: fila.credits_amount };
  }

  // Sin fila pendiente (el insert del checkout falló): el pago existe, se
  // registra la compra ya completada con lo que el servidor puso en la metadata.
  const unitario = enteroPositivo(checkout.metadata?.unitPriceCents);
  const total = typeof checkout.amount_total === 'number' ? checkout.amount_total : creditosMetadata * unitario;
  const comprador = checkout.metadata?.userId;
  const { error: errorInsert } = await supabase.from('ai_credit_purchases').insert({
    organization_id: organizationId,
    credits_amount: creditosMetadata,
    unit_price_cents: unitario,
    total_price_cents: total,
    currency: checkout.currency ?? 'usd',
    stripe_checkout_session_id: checkout.id,
    stripe_payment_intent_id: paymentIntentId,
    status: 'completed',
    purchased_by: comprador && UUID.test(comprador) ? comprador : null,
    purchased_at: ahora,
  });
  if (errorInsert) {
    // 23505: otra entrega del mismo evento ya la registró (UNIQUE de la sesión).
    if (errorInsert.code === '23505') return { estado: 'ya_aplicado', organizationId, creditos: creditosMetadata };
    throw new Error(`ai_credit_purchases (registro): ${errorInsert.message}`);
  }
  return { estado: 'aplicado', organizationId, creditos: creditosMetadata };
}
