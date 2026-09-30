/**
 * Utilitarios compartidos para validar el estado de suscripciones
 * con pagos anuales directos (fuera de Stripe).
 */

interface SubscriptionWithMetadata {
  current_period_end: string | Date | null;
  metadata?: {
    pago_anual?: {
      pagado_hasta?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  } | null;
}

/**
 * Determina si una suscripción tiene un periodo pagado vigente a través
 * de pago anual directo (fuera de Stripe).
 * 
 * @param subscription - Objeto de suscripción con metadata y current_period_end
 * @returns true si existe `metadata.pago_anual.pagado_hasta` y tanto esa fecha
 *          como `current_period_end` son futuras
 * 
 * Contexto: Algunos clientes pagan el año por fuera de Stripe (ej. orgs 199, 200).
 * El SQL `fix_pagos_anuales.sql` marca estas suscripciones con metadata.pago_anual.
 * Esta función protege contra congelamiento indebido cuando el periodo pagado sigue vigente.
 */
export function hasPaidPeriod(subscription: SubscriptionWithMetadata): boolean {
  if (!subscription) {
    return false;
  }

  // Verificar que exista metadata.pago_anual.pagado_hasta
  const pagadoHasta = subscription.metadata?.pago_anual?.pagado_hasta;
  if (!pagadoHasta || typeof pagadoHasta !== 'string') {
    return false;
  }

  // Verificar que current_period_end exista
  if (!subscription.current_period_end) {
    return false;
  }

  const now = new Date();

  // Verificar que pagado_hasta sea futuro
  const pagadoHastaDate = new Date(pagadoHasta);
  if (isNaN(pagadoHastaDate.getTime()) || pagadoHastaDate <= now) {
    return false;
  }

  // Verificar que current_period_end sea futuro
  const currentPeriodEndDate = new Date(subscription.current_period_end);
  if (isNaN(currentPeriodEndDate.getTime()) || currentPeriodEndDate <= now) {
    return false;
  }

  return true;
}
