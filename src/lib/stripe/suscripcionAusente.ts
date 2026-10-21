/**
 * Una fila puede tener un id de Stripe de otra cuenta (claves de prueba
 * usadas antes de live). En la cuenta actual ese id no existe. Una prueba
 * sin tarjeta tampoco va a cobrar. Ninguna de las dos debe impedir
 * cancelar o desactivar.
 */

import type Stripe from 'stripe';
import { idDe } from '@/lib/stripe/medioDePagoSuscripcion';
import { esSuscripcionAusente } from '@/lib/stripe/erroresStripe';
import { requireStripe } from '@/lib/stripe/server';
import { cancelSubscription } from '@/lib/stripe/subscriptionService';

export interface LecturaCobro {
  existe: boolean;
  status: string;
  tieneMedio: boolean;
}

export interface LectorSuscripcionStripe {
  leer(stripeSubscriptionId: string): Promise<LecturaCobro>;
  /** Cancela ya. `ausente` si la cuenta actual no tiene ese id. */
  cancelar(stripeSubscriptionId: string): Promise<{ ausente: boolean }>;
}

/** Solo bloquea lo que de verdad va a cobrar. */
export function suscripcionCobrara(lectura: LecturaCobro): boolean {
  if (!lectura.existe) return false;
  if (lectura.status === 'trialing' && !lectura.tieneMedio) return false;
  return lectura.status === 'active' || lectura.status === 'trialing' || lectura.status === 'past_due';
}

/** Qué hacer con una fila que en la base parece viva. `bloquear` no escribe. */
export function accionAlDesactivar(lectura: LecturaCobro): 'ausente' | 'cancelar_prueba' | 'sincronizar' | 'bloquear' {
  if (suscripcionCobrara(lectura)) return 'bloquear';
  if (!lectura.existe) return 'ausente';
  if (lectura.status === 'trialing' && !lectura.tieneMedio) return 'cancelar_prueba';
  if (lectura.status === 'canceled' || lectura.status === 'incomplete_expired') return 'sincronizar';
  return 'bloquear';
}

type RefMedio = string | { id: string } | null | undefined;

export function tieneMedioDeCobro(
  suscripcion: { default_payment_method?: RefMedio; default_source?: RefMedio },
  cliente: {
    deleted?: boolean;
    invoice_settings?: { default_payment_method?: RefMedio } | null;
    default_source?: RefMedio;
  } | null,
): boolean {
  if (idDe(suscripcion.default_payment_method) || idDe(suscripcion.default_source)) return true;
  if (!cliente || cliente.deleted) return false;
  return !!(idDe(cliente.invoice_settings?.default_payment_method) || idDe(cliente.default_source));
}

export function metadataObjeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  return { ...(valor as Record<string, unknown>) };
}

/** El id era de otra cuenta: se olvida y queda constancia en metadata. */
export function parcheSuscripcionAusente(
  fila: { stripe_subscription_id: string | null; stripe_customer_id: string | null; metadata?: unknown },
  ahora: string,
) {
  return {
    status: 'canceled' as const,
    canceled_at: ahora,
    cancel_at: ahora,
    cancel_at_period_end: false,
    stripe_subscription_id: null,
    metadata: {
      ...metadataObjeto(fila.metadata),
      stripe_missing_live: true,
      stripe_subscription_id_test: fila.stripe_subscription_id,
      stripe_customer_id_test: fila.stripe_customer_id,
    },
    updated_at: ahora,
  };
}

/** Existía y se canceló en esta cuenta. El id se conserva para el webhook. */
export function parcheSuscripcionCancelada(ahora: string) {
  return {
    status: 'canceled' as const,
    canceled_at: ahora,
    cancel_at: ahora,
    cancel_at_period_end: false,
    updated_at: ahora,
  };
}

function idDeStripe(ref: unknown): string | null {
  if (typeof ref === 'string' && ref) return ref;
  if (ref && typeof ref === 'object' && 'id' in ref && typeof ref.id === 'string') return ref.id;
  return null;
}

function clienteDe(customer: Stripe.Subscription['customer'] | Stripe.Customer | Stripe.DeletedCustomer): {
  deleted?: boolean;
  invoice_settings?: { default_payment_method?: RefMedio } | null;
  default_source?: RefMedio;
} | null {
  if (!customer || typeof customer === 'string') return null;
  if (customer.deleted) return { deleted: true };
  return {
    invoice_settings: { default_payment_method: idDeStripe(customer.invoice_settings?.default_payment_method) },
    default_source: idDeStripe(customer.default_source),
  };
}

export const lectorStripeReal: LectorSuscripcionStripe = {
  async leer(stripeSubscriptionId) {
    const stripe = requireStripe();
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ['customer'] });
    } catch (error) {
      if (esSuscripcionAusente(error)) return { existe: false, status: '', tieneMedio: false };
      throw error;
    }
    let cliente = clienteDe(sub.customer);
    if (!cliente && typeof sub.customer === 'string') {
      try {
        const leido = await stripe.customers.retrieve(sub.customer);
        cliente = clienteDe(leido);
      } catch (error) {
        if (!esSuscripcionAusente(error)) throw error;
      }
    }
    return { existe: true, status: sub.status, tieneMedio: tieneMedioDeCobro(sub, cliente) };
  },

  async cancelar(stripeSubscriptionId) {
    const resultado = await cancelSubscription(stripeSubscriptionId, true);
    if (!resultado.success) throw new Error(resultado.error);
    return { ausente: 'missingInStripe' in resultado && resultado.missingInStripe === true };
  },
};
