/**
 * Servicio de notificaciones QR.
 * Crea notificaciones en la tabla `notifications` cuando un pago QR
 * se confirma o expira.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Mapeo de codigos de proveedor a etiquetas legibles. */
const PROVIDER_LABELS: Record<string, string> = {
  wompi: 'Wompi (Bancolombia QR)',
  bancolombia: 'Bancolombia',
  breb: 'Bre-B (Mono)',
  redeban: 'Redeban',
};

/** Parametros para la notificacion de pago recibido. */
export interface PaymentReceivedNotificationParams {
  /** ID de la organizacion. */
  organizationId: number;
  /** Monto del pago. */
  amount: number;
  /** Moneda (ISO 4217). */
  currency: string;
  /** Codigo del proveedor QR. */
  providerCode: string;
  /** Referencia del pago. */
  reference: string;
  /** ID del pago (opcional). */
  paymentId?: string;
}

/** Parametros para la notificacion de QR expirado. */
export interface QrExpiredNotificationParams {
  /** ID de la organizacion. */
  organizationId: number;
  /** Referencia del QR. */
  reference: string;
  /** Monto del pago. */
  amount: number;
  /** Moneda (ISO 4217). */
  currency: string;
}

/** Resultado de la creacion de una notificacion. */
export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

/**
 * Obtiene la etiqueta legible de un proveedor QR.
 * Si el codigo no esta mapeado, retorna el codigo original.
 */
function getProviderLabel(providerCode: string): string {
  return PROVIDER_LABELS[providerCode] ?? providerCode;
}

/**
 * Formatea un monto como moneda colombiana.
 */
function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Crea una notificacion cuando un pago QR se confirma.
 * Inserta en la tabla `notifications` con type 'payment_received'.
 */
export async function createPaymentReceivedNotification(
  params: PaymentReceivedNotificationParams,
): Promise<NotificationResult> {
  const supabase = getSupabaseAdmin();

  try {
    const providerLabel = getProviderLabel(params.providerCode);
    const formattedAmount = formatAmount(params.amount, params.currency);

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organization_id: params.organizationId,
        type: 'payment_received',
        title: 'Pago recibido via QR',
        body: `Pago de ${formattedAmount} confirmado por ${providerLabel}. Referencia: ${params.reference}`,
        link: '/app/finanzas/metodos-pago/qr-sessions',
        is_read: false,
      })
      .select('id')
      .single();

    if (error || !data) {
      return {
        success: false,
        error: `Error al insertar notificacion: ${error?.message ?? 'desconocido'}`,
      };
    }

    return {
      success: true,
      notificationId: data.id as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[qrNotificationService] Excepcion (payment_received):', err);
    return { success: false, error: message };
  }
}

/**
 * Crea una notificacion cuando un QR expira sin pago.
 * Inserta en la tabla `notifications` con type 'payment_expired'.
 */
export async function createQrExpiredNotification(
  params: QrExpiredNotificationParams,
): Promise<{ success: boolean }> {
  const supabase = getSupabaseAdmin();

  try {
    const formattedAmount = formatAmount(params.amount, params.currency);

    const { error } = await supabase.from('notifications').insert({
      organization_id: params.organizationId,
      type: 'payment_expired',
      title: 'Pago QR expirado',
      body: `QR por ${formattedAmount} expirado sin pago. Referencia: ${params.reference}`,
      link: '/app/finanzas/metodos-pago/qr-sessions',
      is_read: false,
    });

    if (error) {
      console.error(
        '[qrNotificationService] Error al insertar notificacion (payment_expired):',
        error,
      );
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error('[qrNotificationService] Excepcion (payment_expired):', err);
    return { success: false };
  }
}
