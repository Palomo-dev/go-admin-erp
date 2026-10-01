/**
 * Helper para detección de pagos manuales en webhooks de Stripe
 * 
 * Protege suscripciones con pagos anuales por fuera de Stripe contra
 * sobrescritura de status, trial_end y current_period_end.
 */

export interface SubscriptionData {
  current_period_end: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StripeSubscriptionData {
  current_period_end: number; // timestamp en segundos
}

/**
 * Detecta si una suscripción tiene pago manual y debe ser protegida.
 * 
 * Criterios de protección:
 * 1. metadata.cortesia existe y es truthy (cortesía aprobada, ej: org 143)
 * 2. metadata.pago_anual.pagado_hasta existe y es fecha futura
 * 3. current_period_end local > current_period_end Stripe + 30 días
 * 
 * @param localSub - Suscripción de la base de datos
 * @param stripeSub - Suscripción de Stripe
 * @returns true si debe protegerse, false en caso contrario
 */
export function shouldProtectManualPayment(
  localSub: SubscriptionData | null,
  stripeSub: StripeSubscriptionData
): boolean {
  if (!localSub) {
    return false;
  }

  // Criterio 1: metadata.cortesia (cortesía aprobada)
  if (localSub.metadata && typeof localSub.metadata === 'object') {
    const cortesia = (localSub.metadata as Record<string, unknown>).cortesia;
    if (cortesia) {
      return true; // Proteger: suscripción de cortesía
    }
  }

  // Criterio 2: metadata.pago_anual.pagado_hasta con fecha futura
  if (localSub.metadata && typeof localSub.metadata === 'object') {
    const pagoAnual = (localSub.metadata as Record<string, unknown>).pago_anual;
    if (pagoAnual && typeof pagoAnual === 'object') {
      const pagadoHasta = (pagoAnual as Record<string, unknown>).pagado_hasta;
      if (typeof pagadoHasta === 'string') {
        try {
          const pagadoHastaDate = new Date(pagadoHasta);
          const now = new Date();
          if (pagadoHastaDate > now) {
            return true; // Proteger: metadata indica pago manual futuro
          }
        } catch {
          // Si no se puede parsear la fecha, continuar con el criterio 3
        }
      }
    }
  }

  // Criterio 3: periodo local > periodo Stripe + 30 días
  if (!localSub.current_period_end) {
    return false;
  }

  const stripePeriodEnd = new Date(stripeSub.current_period_end * 1000);
  const localPeriodEnd = new Date(localSub.current_period_end);
  
  const diffMs = localPeriodEnd.getTime() - stripePeriodEnd.getTime();
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return daysDiff > 30; // Proteger si diferencia > 30 días
}

/**
 * Obtiene información descriptiva sobre por qué se protege una suscripción.
 * Usado para logs de advertencia.
 */
export function getProtectionReason(
  localSub: SubscriptionData | null,
  stripeSub: StripeSubscriptionData
): string {
  if (!localSub) {
    return 'No local subscription';
  }

  // Verificar metadata.cortesia
  if (localSub.metadata && typeof localSub.metadata === 'object') {
    const cortesia = (localSub.metadata as Record<string, unknown>).cortesia;
    if (cortesia) {
      return `metadata.cortesia=${JSON.stringify(cortesia)} (cortesía aprobada)`;
    }
  }

  // Verificar metadata.pago_anual.pagado_hasta
  if (localSub.metadata && typeof localSub.metadata === 'object') {
    const pagoAnual = (localSub.metadata as Record<string, unknown>).pago_anual;
    if (pagoAnual && typeof pagoAnual === 'object') {
      const pagadoHasta = (pagoAnual as Record<string, unknown>).pagado_hasta;
      if (typeof pagadoHasta === 'string') {
        try {
          const pagadoHastaDate = new Date(pagadoHasta);
          const now = new Date();
          if (pagadoHastaDate > now) {
            return `metadata.pago_anual.pagado_hasta=${pagadoHasta} (fecha futura)`;
          }
        } catch {
          // Continuar
        }
      }
    }
  }

  // Verificar diferencia de periodos
  if (!localSub.current_period_end) {
    return 'No local period_end';
  }

  const stripePeriodEnd = new Date(stripeSub.current_period_end * 1000);
  const localPeriodEnd = new Date(localSub.current_period_end);
  
  const diffMs = localPeriodEnd.getTime() - stripePeriodEnd.getTime();
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 30) {
    return `Local period_end: ${localPeriodEnd.toISOString().split('T')[0]} vs Stripe: ${stripePeriodEnd.toISOString().split('T')[0]} (${daysDiff} días diferencia)`;
  }

  return 'No protection needed';
}
