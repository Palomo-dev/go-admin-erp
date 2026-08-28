/**
 * Confirmacion de pago QR via webhook.
 * Funcion compartida que actualiza sesion, payment y bank_transaction.
 * Operacion idempotente: si la sesion ya esta pagada, retorna success.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { autoMatchFromWebhook } from './autoReconciliation';
import {
  createPaymentReceivedNotification,
  createQrExpiredNotification,
} from './qrNotificationService';

/** Datos de entrada para confirmar un pago QR. */
export interface PaymentConfirmationInput {
  /** ID de la sesion QR. */
  qrSessionId: string;
  /** ID de la organizacion. */
  organizationId: number;
  /** Estado de la confirmacion. */
  status: 'paid' | 'rejected';
  /** ID externo del QR (opcional). */
  externalQrId?: string;
  /** Respuesta del proveedor (opcional). */
  providerResponse?: Record<string, unknown>;
  /** ID de la cuenta bancaria para registrar transaccion (opcional). */
  bankAccountId?: number;
}

/** Resultado de la confirmacion de pago. */
export interface PaymentConfirmationResult {
  success: boolean;
  paymentId?: string;
  bankTransactionId?: number;
  error?: string;
}

/**
 * Confirma un pago QR recibido via webhook.
 * Pasos:
 *  1. Busca la payment_qr_session por id
 *  2. Si status ya es 'paid', retorna success (idempotente)
 *  3. Actualiza payment_qr_sessions.status y paid_at
 *  4. Inserta/actualiza en payments (status=completed, method=provider_code)
 *  5. Si bankAccountId disponible, inserta en bank_transactions
 *  6. Inserta mapeo en integration_object_mappings (payment <-> bank_transaction)
 *  7. Crea notificacion de pago recibido (o expirado si fue rechazado)
 *  8. Retorna los IDs creados
 */
export async function confirmQrPayment(
  input: PaymentConfirmationInput,
): Promise<PaymentConfirmationResult> {
  const supabase = getSupabaseAdmin();

  try {
    // 1. Buscar la sesion QR
    const { data: session, error: sessionError } = await supabase
      .from('payment_qr_sessions')
      .select('*')
      .eq('id', input.qrSessionId)
      .eq('organization_id', input.organizationId)
      .single();

    if (sessionError || !session) {
      return {
        success: false,
        error: `Sesion QR no encontrada: ${sessionError?.message ?? 'desconocido'}`,
      };
    }

    // 2. Idempotencia: si ya esta pagada, retornar success
    if (session.status === 'paid') {
      return {
        success: true,
        paymentId: session.payment_id ?? undefined,
      };
    }

    const now = new Date().toISOString();

    // 3. Actualizar sesion QR
    const sessionUpdate: Record<string, unknown> = {
      status: input.status,
      updated_at: now,
    };

    if (input.status === 'paid') {
      sessionUpdate.paid_at = now;
    }

    if (input.externalQrId) {
      sessionUpdate.external_qr_id = input.externalQrId;
    }

    if (input.providerResponse) {
      sessionUpdate.provider_response = input.providerResponse;
    }

    const { error: updateSessionError } = await supabase
      .from('payment_qr_sessions')
      .update(sessionUpdate)
      .eq('id', input.qrSessionId);

    if (updateSessionError) {
      return {
        success: false,
        error: `Error al actualizar sesion QR: ${updateSessionError.message}`,
      };
    }

    // Si fue rechazada, no se inserta payment ni bank_transaction
    if (input.status === 'rejected') {
      // Notificar QR expirado/rechazado
      try {
        await createQrExpiredNotification({
          organizationId: input.organizationId,
          reference: session.reference,
          amount: session.amount,
          currency: session.currency,
        });
      } catch (notifErr) {
        // No fallar toda la operacion si la notificacion falla
        console.error('[paymentConfirmation] Error en notificacion expired:', notifErr);
      }
      return { success: true };
    }

    // 4. Insertar/actualizar en payments
    const paymentRow: Record<string, unknown> = {
      organization_id: input.organizationId,
      branch_id: session.branch_id,
      amount: session.amount,
      currency: session.currency,
      status: 'completed',
      method: session.provider_code,
      reference: session.reference,
      processor_response: input.providerResponse ?? null,
      payment_date: now,
    };

    let paymentId: string | undefined = session.payment_id ?? undefined;

    if (paymentId) {
      // Actualizar payment existente
      const { error: updatePayError } = await supabase
        .from('payments')
        .update({
          status: 'completed',
          processor_response: input.providerResponse ?? null,
          payment_date: now,
        })
        .eq('id', paymentId);

      if (updatePayError) {
        return {
          success: false,
          error: `Error al actualizar payment: ${updatePayError.message}`,
        };
      }
    } else {
      // Insertar nuevo payment
      const { data: newPayment, error: insertPayError } = await supabase
        .from('payments')
        .insert(paymentRow)
        .select('id')
        .single();

      if (insertPayError || !newPayment) {
        return {
          success: false,
          error: `Error al insertar payment: ${insertPayError?.message ?? 'desconocido'}`,
        };
      }

      paymentId = newPayment.id as string;

      // Vincular payment a la sesion QR
      await supabase
        .from('payment_qr_sessions')
        .update({ payment_id: paymentId })
        .eq('id', input.qrSessionId);
    }

    // 5. Insertar en bank_transactions si hay cuenta bancaria
    let bankTransactionId: number | undefined;

    if (input.bankAccountId) {
      const bankTxRow: Record<string, unknown> = {
        organization_id: input.organizationId,
        bank_account_id: input.bankAccountId,
        amount: session.amount,
        transaction_type: 'credit',
        status: 'unmatched',
        import_source: session.provider_code,
        import_id: input.externalQrId ?? session.external_qr_id ?? null,
        transaction_date: now,
        reference: session.reference,
      };

      const { data: newTx, error: insertTxError } = await supabase
        .from('bank_transactions')
        .insert(bankTxRow)
        .select('id')
        .single();

      if (insertTxError || !newTx) {
        // No fallar toda la operacion si solo la transaccion bancaria falla
        console.error(
          '[paymentConfirmation] Error al insertar bank_transaction:',
          insertTxError,
        );
      } else {
        bankTransactionId = newTx.id as number;

        // 5b. Auto-conciliar: match bank_transaction con payment
        try {
          if (paymentId && bankTransactionId) {
            await autoMatchFromWebhook(paymentId, bankTransactionId, input.organizationId);
          }
        } catch (matchErr) {
          // No fallar toda la operacion si el auto-match falla
          console.error('[paymentConfirmation] Error en auto-match:', matchErr);
        }
      }
    }

    // 6. Insertar mapeo entre payment y bank_transaction
    if (paymentId && bankTransactionId && session.integration_connection_id) {
      const { error: mappingError } = await supabase
        .from('integration_object_mappings')
        .insert({
          connection_id: session.integration_connection_id,
          external_type: 'bank_transaction',
          external_id: String(bankTransactionId),
          internal_table: 'payments',
          internal_id: paymentId,
          metadata: { source: 'qr_webhook', provider_code: session.provider_code },
        });

      if (mappingError) {
        // No fallar toda la operacion si el mapeo falla
        console.error('[paymentConfirmation] Error al insertar mapping:', mappingError);
      }
    }

    // 7. Notificar pago recibido
    try {
      await createPaymentReceivedNotification({
        organizationId: input.organizationId,
        amount: session.amount,
        currency: session.currency,
        providerCode: session.provider_code,
        reference: session.reference,
        paymentId,
      });
    } catch (notifErr) {
      // No fallar toda la operacion si la notificacion falla
      console.error('[paymentConfirmation] Error en notificacion payment_received:', notifErr);
    }

    // 8. Retornar IDs creados
    return {
      success: true,
      paymentId,
      bankTransactionId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[paymentConfirmation] Excepcion:', err);
    return { success: false, error: message };
  }
}
