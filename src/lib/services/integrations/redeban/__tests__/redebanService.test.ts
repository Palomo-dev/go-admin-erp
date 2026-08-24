/**
 * Tests del servicio Redeban.
 * Cubre Auth-Token, generacion/consulta de QR, verificacion de firma y webhooks.
 * Usa mocks de fetch y Supabase (no depende de servicios externos).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import redebanService from '../redebanService';
import { mockSupabase } from '@/lib/supabase/admin';
import { installFetchMock, ok, httpError } from '@test/mocks/fetchMock';

// Credenciales de prueba
const APP_CODE = 'test-app-code';
const APP_KEY = 'test-app-key-secret';

// Configura las credenciales en el mock de Supabase
function setupRedebanCredentials(connectionId: string, environment: 'sandbox' | 'production' = 'sandbox') {
  mockSupabase.setTableData('integration_connections', [
    { id: connectionId, environment },
  ]);
  mockSupabase.setTableData('integration_credentials', [
    {
      connection_id: connectionId,
      purpose: 'default',
      secret_ref: JSON.stringify({ serverAppCode: APP_CODE, serverAppKey: APP_KEY }),
      status: 'active',
    },
  ]);
}

describe('RedebanService', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // Test: generateAuthToken con credenciales validas
  test('generateAuthToken produce un token decodificable con la estructura esperada', () => {
    const token = redebanService.generateAuthToken(APP_CODE, APP_KEY);

    // Es Base64 valido
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(';');
    assert.equal(parts.length, 3, 'Debe tener APP_CODE;TIMESTAMP;HASH');
    assert.equal(parts[0], APP_CODE, 'Primera parte es el app code');
    // Timestamp es numerico
    assert.ok(/^\d+$/.test(parts[1]), 'Segunda parte es un timestamp Unix');
    // Hash es hex de 64 chars (SHA256)
    assert.equal(parts[2].length, 64, 'Tercera parte es SHA256 hex');
    assert.match(parts[2], /^[0-9a-f]+$/, 'Hash es hexadecimal');
  });

  // Test: generateAuthToken genera formato correcto (Base64)
  test('generateAuthToken genera un token Base64 cuyo hash coincide con SHA256(APP_KEY+TIMESTAMP)', () => {
    const token = redebanService.generateAuthToken(APP_CODE, APP_KEY);
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [code, timestamp, hash] = decoded.split(';');

    const expectedHash = crypto
      .createHash('sha256')
      .update(APP_KEY + timestamp)
      .digest('hex');

    assert.equal(code, APP_CODE);
    assert.equal(hash, expectedHash, 'El hash debe ser SHA256(APP_KEY + TIMESTAMP)');
  });

  // Test: createQr con parametros validos (mock fetch)
  test('createQr construye la peticion y parsea la respuesta del proveedor', async () => {
    setupRedebanCredentials('conn-1');

    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/v2/qr/generate/'), 'Debe llamar al endpoint de generacion');
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.amount, 25000);
      assert.equal(body.reference, 'QR-REDEBAN-001');

      return ok({
        data: {
          id: 'qr-rb-001',
          qr_string: '0002015303170...',
          status: 'pending',
          expires_at: '2026-12-31T23:59:59Z',
          reference: 'QR-REDEBAN-001',
        },
      });
    });

    try {
      const result = await redebanService.createQr('conn-1', {
        amount: 25000,
        currency: 'COP',
        reference: 'QR-REDEBAN-001',
        description: 'Pago de prueba',
        expiresAt: '2026-12-31T23:59:59Z',
      });

      assert.equal(result.id, 'qr-rb-001');
      assert.equal(result.qr_string, '0002015303170...');
      assert.equal(result.status, 'pending');
      assert.equal(result.reference, 'QR-REDEBAN-001');
    } finally {
      restore();
    }
  });

  // Test: createQr propaga error cuando el proveedor responde 4xx
  test('createQr lanza error cuando Redeban responde con HTTP 400', async () => {
    setupRedebanCredentials('conn-1');

    const restore = installFetchMock(() => httpError(400, { error: 'monto invalido' }));
    try {
      await assert.rejects(
        redebanService.createQr('conn-1', {
          amount: -1,
          currency: 'COP',
          reference: 'QR-X',
          description: 'invalido',
          expiresAt: '2026-12-31T23:59:59Z',
        }),
        /HTTP 400/,
      );
    } finally {
      restore();
    }
  });

  // Test: getTransactionStatus (mock fetch)
  test('getTransactionStatus consulta y parsea el estado de una transaccion', async () => {
    setupRedebanCredentials('conn-1');

    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/order/tx-001'), 'Debe consultar /order/{transactionId}');
      assert.equal(init?.method, 'GET');
      return ok({
        data: {
          id: 'tx-001',
          status: 'approved',
          amount: 25000,
          currency: 'COP',
          reference: 'QR-REDEBAN-001',
          authorization_code: 'AUTH123',
          created_at: '2026-08-01T10:00:00Z',
          paid_at: '2026-08-01T10:05:00Z',
        },
      });
    });

    try {
      const result = await redebanService.getTransactionStatus('conn-1', 'tx-001');
      assert.equal(result.id, 'tx-001');
      assert.equal(result.status, 'approved');
      assert.equal(result.amount, 25000);
      assert.equal(result.authorization_code, 'AUTH123');
      assert.equal(result.paid_at, '2026-08-01T10:05:00Z');
    } finally {
      restore();
    }
  });

  // Test: verifyWebhookSignature valida firma HMAC correcta
  test('verifyWebhookSignature retorna true para una firma HMAC-SHA256 valida', () => {
    const payload = JSON.stringify({ reference: 'QR-001', status: 'approved' });
    const validSignature = crypto
      .createHmac('sha256', APP_KEY)
      .update(payload)
      .digest('hex');

    const isValid = redebanService.verifyWebhookSignature(payload, validSignature, APP_KEY);
    assert.equal(isValid, true);
  });

  // Test: verifyWebhookSignature rechaza firma invalida
  test('verifyWebhookSignature retorna false para una firma incorrecta', () => {
    const payload = JSON.stringify({ reference: 'QR-001', status: 'approved' });
    const isValid = redebanService.verifyWebhookSignature(payload, 'firma-invalida', APP_KEY);
    assert.equal(isValid, false);
  });

  // Test: processWebhook con payload valido (approved)
  test('processWebhook confirma el pago cuando el estado es approved', async () => {
    setupRedebanCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-rb-001',
        organization_id: 1,
        branch_id: 10,
        amount: 25000,
        currency: 'COP',
        provider_code: 'redeban',
        reference: 'QR-REDEBAN-001',
        status: 'pending',
        payment_id: null,
      },
    ]);
    mockSupabase.setInsertResult('payments', { id: 'pay-rb-001' });

    const result = await redebanService.processWebhook('conn-1', {
      transaction_id: 'tx-001',
      status: 'approved',
      amount: 25000,
      currency: 'COP',
      reference: 'QR-REDEBAN-001',
      timestamp: '2026-08-01T10:05:00Z',
    });

    assert.equal(result.success, true);
    assert.equal(result.message, 'Pago confirmado correctamente');

    // Verifica que se inserto en payments
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.ok(paymentInserts.length >= 1, 'Debe insertar el payment');
  });

  // Test: processWebhook con payload invalido (sesion no encontrada)
  test('processWebhook retorna error cuando no encuentra la sesion QR', async () => {
    setupRedebanCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', []);

    const result = await redebanService.processWebhook('conn-1', {
      transaction_id: 'tx-002',
      status: 'approved',
      amount: 1000,
      currency: 'COP',
      reference: 'NO-EXISTISTE',
      timestamp: '2026-08-01T10:05:00Z',
    });

    assert.equal(result.success, false);
    assert.ok(result.message.includes('no encontrada'));
  });

  // Test: processWebhook con estado no accionable (pending)
  test('processWebhook no realiza accion para estado pending', async () => {
    setupRedebanCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-rb-002',
        organization_id: 1,
        branch_id: 10,
        amount: 25000,
        currency: 'COP',
        provider_code: 'redeban',
        reference: 'QR-REDEBAN-002',
        status: 'pending',
        payment_id: null,
      },
    ]);

    const result = await redebanService.processWebhook('conn-1', {
      transaction_id: 'tx-003',
      status: 'pending',
      amount: 25000,
      currency: 'COP',
      reference: 'QR-REDEBAN-002',
      timestamp: '2026-08-01T10:05:00Z',
    });

    assert.equal(result.success, true);
    assert.ok(result.message.includes('no requiere accion'));
  });
});
