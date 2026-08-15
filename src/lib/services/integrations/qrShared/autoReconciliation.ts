/**
 * Auto-conciliacion de pagos QR con transacciones bancarias.
 * Se ejecuta cuando un pago QR se confirma via webhook.
 * Crea o reutiliza una bank_reconciliation abierta y registra
 * el match en bank_reconciliation_items.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Resultado de una operacion de auto-match. */
export interface AutoMatchResult {
  success: boolean;
  reconciliationItemId?: string;
  message: string;
}

/** Tipos de match soportados en bank_reconciliation_items. */
type MatchType = 'payment';

/** Estados validos de una bank_reconciliation abierta. */
type OpenReconciliationStatus = 'draft' | 'in_progress';

/** Respuesta de BD para bank_transactions (campos usados). */
interface BankTransactionRow {
  id: number;
  organization_id: number;
  bank_account_id: number;
  trans_date: string;
  amount: number;
  reference: string | null;
  status: string;
}

/** Respuesta de BD para payments (campos usados). */
interface PaymentRow {
  id: string;
  organization_id: number;
  reference: string | null;
  status: string;
}

/** Respuesta de BD para bank_reconciliations (campos usados). */
interface ReconciliationRow {
  id: number;
  status: string;
}

/**
 * Auto-concilia un payment con un bank_transaction cuando un pago QR
 * se confirma via webhook. Crea o reutiliza una reconciliacion abierta
 * y registra el match en bank_reconciliation_items.
 *
 * @param paymentId ID del payment (debe estar status='completed')
 * @param bankTransactionId ID del bank_transaction (debe estar status='unmatched')
 * @param organizationId ID de la organizacion
 * @returns Resultado de la operacion con el reconciliationItemId creado
 */
export async function autoMatchFromWebhook(
  paymentId: string,
  bankTransactionId: number,
  organizationId: number,
): Promise<AutoMatchResult> {
  const supabase = getSupabaseAdmin();

  try {
    // 1. Buscar el bank_transaction por id
    const { data: tx, error: txError } = await supabase
      .from('bank_transactions')
      .select('id, organization_id, bank_account_id, trans_date, amount, reference, status')
      .eq('id', bankTransactionId)
      .single<BankTransactionRow>();

    if (txError || !tx) {
      return {
        success: false,
        message: `bank_transaction no encontrado: ${txError?.message ?? 'desconocido'}`,
      };
    }

    // Si ya esta conciliado, retornar exito (idempotente)
    if (tx.status === 'matched') {
      return { success: true, message: 'Ya conciliado' };
    }

    // 2. Buscar el payment por id
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .select('id, organization_id, reference, status')
      .eq('id', paymentId)
      .single<PaymentRow>();

    if (payError || !payment) {
      return {
        success: false,
        message: `payment no encontrado: ${payError?.message ?? 'desconocido'}`,
      };
    }

    // El payment debe estar completado
    if (payment.status !== 'completed') {
      return {
        success: false,
        message: `payment no completado (status='${payment.status}')`,
      };
    }

    // 3. Verificar misma organizacion
    if (tx.organization_id !== organizationId || payment.organization_id !== organizationId) {
      return { success: false, message: 'organization_id no coincide' };
    }

    // 4. Verificar misma referencia
    const txRef = tx.reference?.trim() ?? '';
    const payRef = payment.reference?.trim() ?? '';

    if (!txRef || !payRef || txRef !== payRef) {
      return { success: false, message: 'Referencias no coinciden' };
    }

    // 5. Buscar reconciliacion abierta para el bank_account_id
    const { data: openRecon, error: reconError } = await supabase
      .from('bank_reconciliations')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('bank_account_id', tx.bank_account_id)
      .in('status', ['draft', 'in_progress'] as OpenReconciliationStatus[])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ReconciliationRow>();

    if (reconError) {
      return {
        success: false,
        message: `Error al buscar reconciliacion abierta: ${reconError.message}`,
      };
    }

    let reconciliationId: number;

    if (openRecon) {
      // Reutilizar reconciliacion abierta existente
      reconciliationId = openRecon.id;
    } else {
      // 5b. Crear nueva reconciliacion
      const periodStart = tx.trans_date;
      const periodEnd = new Date(
        new Date(tx.trans_date).getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: newRecon, error: createReconError } = await supabase
        .from('bank_reconciliations')
        .insert({
          organization_id: organizationId,
          bank_account_id: tx.bank_account_id,
          period_start: periodStart,
          period_end: periodEnd,
          opening_balance: 0,
          status: 'in_progress',
        })
        .select('id')
        .single<{ id: number }>();

      if (createReconError || !newRecon) {
        return {
          success: false,
          message: `Error al crear reconciliacion: ${createReconError?.message ?? 'desconocido'}`,
        };
      }

      reconciliationId = newRecon.id;
    }

    // 6. Insertar item de reconciliacion
    const { data: reconItem, error: itemError } = await supabase
      .from('bank_reconciliation_items')
      .insert({
        reconciliation_id: reconciliationId,
        transaction_id: bankTransactionId,
        payment_id: paymentId,
        is_matched: true,
        amount: tx.amount,
        match_type: 'payment' as MatchType,
      })
      .select('id')
      .single<{ id: string }>();

    if (itemError || !reconItem) {
      return {
        success: false,
        message: `Error al insertar reconciliation_item: ${itemError?.message ?? 'desconocido'}`,
      };
    }

    // 7. Actualizar estado del bank_transaction a 'matched'
    const { error: updateTxError } = await supabase
      .from('bank_transactions')
      .update({ status: 'matched', updated_at: new Date().toISOString() })
      .eq('id', bankTransactionId);

    if (updateTxError) {
      // El item se inserto pero no se pudo marcar la transaccion
      console.error(
        '[autoReconciliation] Error al actualizar status de bank_transaction:',
        updateTxError,
      );
      return {
        success: false,
        message: `Error al actualizar bank_transaction: ${updateTxError.message}`,
      };
    }

    // 8. Retornar exito
    return {
      success: true,
      reconciliationItemId: reconItem.id,
      message: 'Auto-match exitoso',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[autoReconciliation] Excepcion:', err);
    return { success: false, message };
  }
}

/**
 * Busca automaticamente un bank_transaction (unmatched) y un payment (completed)
 * por reference dentro de la organizacion, y los concilia via autoMatchFromWebhook.
 *
 * @param reference Referencia comun entre el payment y el bank_transaction
 * @param organizationId ID de la organizacion
 * @returns Resultado de la operacion de auto-match
 */
export async function autoMatchByReference(
  reference: string,
  organizationId: number,
): Promise<AutoMatchResult> {
  const supabase = getSupabaseAdmin();

  try {
    const trimmedRef = reference.trim();

    if (!trimmedRef) {
      return { success: false, message: 'Referencia vacia' };
    }

    // Buscar bank_transaction unmatched por referencia
    const { data: tx, error: txError } = await supabase
      .from('bank_transactions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('reference', trimmedRef)
      .eq('status', 'unmatched')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: number }>();

    if (txError) {
      return {
        success: false,
        message: `Error al buscar bank_transaction: ${txError.message}`,
      };
    }

    if (!tx) {
      return { success: false, message: 'No hay bank_transaction unmatched para la referencia' };
    }

    // Buscar payment completed por referencia
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('reference', trimmedRef)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (payError) {
      return {
        success: false,
        message: `Error al buscar payment: ${payError.message}`,
      };
    }

    if (!payment) {
      return { success: false, message: 'No hay payment completed para la referencia' };
    }

    // Delegar al flujo principal de auto-match
    return autoMatchFromWebhook(payment.id, tx.id, organizationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[autoReconciliation] Excepcion en autoMatchByReference:', err);
    return { success: false, message };
  }
}
