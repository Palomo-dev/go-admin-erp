/**
 * Tests de la logica de confirmacion de pago QR (paymentConfirmation).
 * Usa el mock de Supabase para simular sesiones, payments y bank_transactions.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { confirmQrPayment } from '../paymentConfirmation';
import { mockSupabase } from '@/lib/supabase/admin';

// Sesion QR base usada en los tests
const baseSession = {
  id: 'sess-001',
  organization_id: 1,
  branch_id: 10,
  amount: 50000,
  currency: 'COP',
  provider_code: 'redeban',
  reference: 'QR-TEST-001',
  status: 'pending',
  external_qr_id: null,
  payment_id: null,
};

describe('confirmQrPayment', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // Test: confirmar pago con datos validos
  test('confirma un pago valido e inserta en payments y bank_transactions', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [{ ...baseSession }]);
    mockSupabase.setInsertResult('payments', { id: 'pay-123' });
    mockSupabase.setInsertResult('bank_transactions', { id: 99 });
    // Datos para el auto-match (autoReconciliation)
    mockSupabase.setTableData('bank_transactions', [
      {
        id: 99,
        organization_id: 1,
        bank_account_id: 5,
        trans_date: new Date().toISOString(),
        amount: 50000,
        reference: 'QR-TEST-001',
        status: 'unmatched',
      },
    ]);
    mockSupabase.setTableData('payments', [
      { id: 'pay-123', organization_id: 1, reference: 'QR-TEST-001', status: 'completed' },
    ]);
    mockSupabase.setTableData('bank_reconciliations', []);
    mockSupabase.setInsertResult('bank_reconciliations', { id: 7 });
    mockSupabase.setInsertResult('bank_reconciliation_items', { id: 'ri-1' });

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'paid',
      externalQrId: 'ext-qr-001',
      bankAccountId: 5,
    });

    assert.equal(result.success, true);
    assert.equal(result.paymentId, 'pay-123');
    assert.equal(result.bankTransactionId, 99);

    // Verificar que se inserto en payments
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.ok(paymentInserts.length >= 1, 'Debe insertar en payments');

    // Verificar que se inserto en bank_transactions
    const bankInserts = mockSupabase.getCalls('bank_transactions', 'insert');
    assert.ok(bankInserts.length >= 1, 'Debe insertar en bank_transactions');

    // Verificar que se actualizo la sesion QR a status paid
    const sessionUpdates = mockSupabase.getCalls('payment_qr_sessions', 'update');
    assert.ok(sessionUpdates.length >= 1, 'Debe actualizar la sesion QR');
    const updatePayload = sessionUpdates[0].payload as Record<string, unknown>;
    assert.equal(updatePayload.status, 'paid');
    assert.ok(updatePayload.paid_at, 'Debe setear paid_at');
  });

  // Test: confirmar pago con qr_session_id inexistente
  test('retorna error cuando la sesion QR no existe', async () => {
    mockSupabase.setTableData('payment_qr_sessions', []);

    const result = await confirmQrPayment({
      qrSessionId: 'no-existe',
      organizationId: 1,
      status: 'paid',
    });

    assert.equal(result.success, false);
    assert.ok(result.error?.includes('no encontrada'), 'Mensaje debe indicar sesion no encontrada');
  });

  // Test: confirmar pago con qr_session ya pagada (idempotencia)
  test('es idempotente: si la sesion ya esta pagada retorna success sin reinsertar', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [
      { ...baseSession, status: 'paid', payment_id: 'pay-existing' },
    ]);

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'paid',
    });

    assert.equal(result.success, true);
    assert.equal(result.paymentId, 'pay-existing');

    // No debe insertar nuevos payments
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.equal(paymentInserts.length, 0, 'No debe insertar payments si ya esta pagada');
  });

  // Test: confirmar pago con qr_session expirada (status pending pero la tratamos)
  test('permite confirmar una sesion que estaba pending (no expirada)', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [{ ...baseSession, status: 'pending' }]);
    mockSupabase.setInsertResult('payments', { id: 'pay-456' });

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'paid',
    });

    assert.equal(result.success, true);
    assert.equal(result.paymentId, 'pay-456');
  });

  // Test: confirmar pago rechazado no inserta payment
  test('un pago rechazado actualiza la sesion pero no inserta payment', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [{ ...baseSession }]);

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'rejected',
    });

    assert.equal(result.success, true);
    assert.equal(result.paymentId, undefined);

    const sessionUpdates = mockSupabase.getCalls('payment_qr_sessions', 'update');
    assert.ok(sessionUpdates.length >= 1);
    assert.equal(
      (sessionUpdates[0].payload as Record<string, unknown>).status,
      'rejected',
    );

    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.equal(paymentInserts.length, 0, 'No debe insertar payment para rechazado');
  });

  // Test: verificar que se actualiza payment existente en lugar de insertar
  test('actualiza un payment existente cuando la sesion ya tiene payment_id', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [
      { ...baseSession, payment_id: 'pay-existing' },
    ]);

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'paid',
    });

    assert.equal(result.success, true);
    assert.equal(result.paymentId, 'pay-existing');

    // Debe haber un update en payments, no un insert
    const paymentUpdates = mockSupabase.getCalls('payments', 'update');
    assert.ok(paymentUpdates.length >= 1, 'Debe actualizar el payment existente');
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.equal(paymentInserts.length, 0, 'No debe insertar un nuevo payment');
  });

  // Test: error al actualizar la sesion QR
  test('retorna error cuando falla el update de la sesion QR', async () => {
    mockSupabase.setTableData('payment_qr_sessions', [{ ...baseSession }]);
    mockSupabase.setUpdateError('payment_qr_sessions', 'Permiso denegado');

    const result = await confirmQrPayment({
      qrSessionId: 'sess-001',
      organizationId: 1,
      status: 'paid',
    });

    assert.equal(result.success, false);
    assert.ok(result.error?.includes('actualizar sesion'));
  });
});
