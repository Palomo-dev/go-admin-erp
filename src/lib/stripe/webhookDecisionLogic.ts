/**
 * Lógica de decisión pura para eventos del webhook de Stripe
 * 
 * Extrae las decisiones de qué acción tomar según el evento y la protección,
 * separando la lógica de negocio de los efectos secundarios (escrituras a BD).
 */

import { shouldProtectManualPayment, type SubscriptionData, type StripeSubscriptionData } from './manualPaymentProtection';

/**
 * Método por el cual se encontró la suscripción local
 */
export type MetodoLookup = 'stripe_subscription_id' | 'organization_id_fallback' | 'stripe_customer_id_fallback';

/**
 * Acciones posibles para customer.subscription.deleted
 */
export type AccionDeleted = 'proteger' | 'cancelar' | 'ignorar';

/**
 * Acciones posibles para invoice.payment_failed
 */
export type AccionPaymentFailed = 'notificar' | 'ignorar';

/**
 * Decide qué acción tomar para un evento customer.subscription.deleted
 * 
 * Reglas:
 * 1. Si la fila se encontró por fallback (organization_id o customer_id):
 *    a) Si está protegida (cortesía o pago manual) → 'proteger'
 *    b) Si NO está protegida → 'ignorar' (no cancelar, puede ser otra suscripción)
 *    c) Si la fila tiene stripe_subscription_id diferente y no nulo → 'ignorar'
 * 
 * 2. Si la fila se encontró por stripe_subscription_id exacto:
 *    a) Si está protegida → 'proteger'
 *    b) Si NO está protegida → 'cancelar'
 * 
 * @param evento - Datos del evento de Stripe
 * @param filaLocal - Suscripción encontrada en BD (null si no se encontró)
 * @param encontradaPor - Método por el cual se encontró
 * @returns Acción a tomar
 */
export function decidirAccionDeleted(
  evento: {
    stripeSubscriptionId: string;
    stripePeriodEnd: number;
  },
  filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } | null,
  encontradaPor: MetodoLookup
): AccionDeleted {
  // Si no hay fila local, no hay nada que hacer
  if (!filaLocal) {
    return 'ignorar';
  }

  // Verificar protección
  const estaProtegida = shouldProtectManualPayment(
    filaLocal,
    { current_period_end: evento.stripePeriodEnd }
  );

  // Caso 1: Encontrada por fallback (organization_id o customer_id)
  if (encontradaPor !== 'stripe_subscription_id') {
    // Si está protegida, proteger
    if (estaProtegida) {
      return 'proteger';
    }

    // Si NO está protegida, ignorar (puede ser otra suscripción de la org)
    // Caso especial: si la fila tiene un stripe_subscription_id diferente y no nulo
    if (
      filaLocal.stripe_subscription_id &&
      filaLocal.stripe_subscription_id !== evento.stripeSubscriptionId
    ) {
      return 'ignorar'; // Es otra suscripción
    }

    // Incluso sin stripe_subscription_id diferente, si no está protegida y vino por fallback, ignorar
    return 'ignorar';
  }

  // Caso 2: Encontrada por stripe_subscription_id exacto
  if (estaProtegida) {
    return 'proteger';
  }

  return 'cancelar';
}

/**
 * Decide qué acción tomar para un evento invoice.payment_failed
 * 
 * Reglas:
 * 1. Si está protegida (cortesía o pago manual) → 'ignorar' (no notificar)
 * 2. Si NO está protegida → 'notificar'
 * 
 * @param filaLocal - Suscripción encontrada en BD (null si no se encontró)
 * @param stripePeriodEnd - timestamp del periodo de Stripe (para verificar protección)
 * @returns Acción a tomar
 */
export function decidirAccionPaymentFailed(
  filaLocal: SubscriptionData | null,
  stripePeriodEnd: number
): AccionPaymentFailed {
  // Si no hay fila local, no notificar (no sabemos a quién)
  if (!filaLocal) {
    return 'ignorar';
  }

  // Verificar protección
  const estaProtegida = shouldProtectManualPayment(
    filaLocal,
    { current_period_end: stripePeriodEnd }
  );

  if (estaProtegida) {
    return 'ignorar'; // No notificar pagos fallidos en cortesías/pagos manuales
  }

  return 'notificar';
}
