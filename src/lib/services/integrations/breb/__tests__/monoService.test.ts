/**
 * Tests del servicio Mono (Bre-B).
 * Cubre OAuth, creacion de collections, simulacion de pago, firma y webhooks.
 * Usa mocks de fetch y Supabase (no depende de servicios externos).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import monoService from '../monoService';
import { mockSupabase } from '@/lib/supabase/admin';
import { installFetchMock, ok, httpError } from '@test/mocks/fetchMock';

const CLIENT_ID = 'mono-client-id';
const CLIENT_SECRET = 'mono-client-secret';

// Configura las credenciales en el mock de Supabase
function setupMonoCredentials(
  connectionId: string,
  environment: 'sandbox' | 'production' = 'sandbox',
) {
  mockSupabase.setTableData('integration_connections', [{ id: connectionId, environment }]);
  mockSupabase.setTableData('integration_credentials', [
    {
      connection_id: connectionId,
      purpose: 'default',
      secret_ref: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
      status: 'active',
    },
  ]);
}

describe('MonoService', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // Test: getAccessToken (mock fetch)
  test('getAccessToken obtiene un token via OAuth client_credentials', async () => {
    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/oauth/token'), 'Debe llamar al endpoint OAuth');
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.grant_type, 'client_credentials');
      assert.equal(body.client_id, CLIENT_ID);
      assert.equal(body.client_secret, CLIENT_SECRET);

      return ok({
        access_token: 'mono-token-xyz',
        token_type: 'bearer',
        expires_in: 3600,
      });
    });

    try {
      const token = await monoService.getAccessToken(CLIENT_ID, CLIENT_SECRET, 'sandbox');
      assert.equal(token, 'mono-token-xyz');
    } finally {
      restore();
    }
  });

  // Test: getAccessToken propaga error en credenciales invalidas
  test('getAccessToken lanza error cuando OAuth responde 401', async () => {
    const restore = installFetchMock(() => httpError(401, { error: 'invalid_client' }));
    try {
      await assert.rejects(
        monoService.getAccessToken(CLIENT_ID, 'mala', 'sandbox'),
        /HTTP 401/,
      );
    } finally {
      restore();
    }
  });

  // Test: createCollection con parametros validos (mock fetch)
  test('createCollection crea una collection y parsea la respuesta', async () => {
    setupMonoCredentials('conn-1');

    let tokenCallCount = 0;
    const restore = installFetchMock((url) => {
      if (url.includes('/oauth/token')) {
        tokenCallCount++;
        return ok({ access_token: 'mono-token', token_type: 'bearer', expires_in: 3600 });
      }
      if (url.includes('/api/v1/collections')) {
        return ok({
          data: {
            id: 'col-001',
            status: 'ready',
            qr: 'mono-qr-string',
            qr_image: 'base64-img',
            expires_at: '2026-12-31T23:59:59Z',
            amount: { amount: 15000, currency: 'COP' },
            metadata: { reference: 'QR-MONO-001' },
          },
        });
      }
      return httpError(404, { error: 'not found' });
    });

    try {
      const result = await monoService.createCollection('conn-1', {
        amount: 15000,
        currency: 'COP',
        key_type: 'PHONE',
        key_value: '3001234567',
        description: 'Pago de prueba',
        expires_in: 3600,
        metadata: { reference: 'QR-MONO-001' },
      });

      assert.equal(result.id, 'col-001');
      assert.equal(result.status, 'ready');
      assert.equal(result.qr, 'mono-qr-string');
      assert.equal(result.amount.amount, 15000);
      assert.equal(result.amount.currency, 'COP');
      assert.ok(tokenCallCount >= 1, 'Debe obtener access_token antes de crear la collection');
    } finally {
      restore();
    }
  });

  // Test: createCollection propaga error del proveedor
  test('createCollection lanza error cuando Mono responde 4xx', async () => {
    setupMonoCredentials('conn-1');

    const restore = installFetchMock((url) => {
      if (url.includes('/oauth/token')) {
        return ok({ access_token: 't', token_type: 'bearer', expires_in: 3600 });
      }
      return httpError(422, { error: 'monto invalido' });
    });

    try {
      await assert.rejects(
        monoService.createCollection('conn-1', {
          amount: -5,
          currency: 'COP',
          key_type: 'PHONE',
          key_value: '3001234567',
          description: 'x',
          expires_in: 3600,
        }),
        /HTTP 422/,
      );
    } finally {
      restore();
    }
  });

  // Test: simulatePayment (mock fetch, solo sandbox)
  test('simulatePayment simula un pago en sandbox correctamente', async () => {
    setupMonoCredentials('conn-1', 'sandbox');

    const restore = installFetchMock((url) => {
      if (url.includes('/oauth/token')) {
        return ok({ access_token: 't', token_type: 'bearer', expires_in: 3600 });
      }
      if (url.includes('/sandbox/collections/simulate-payment')) {
        return ok({ success: true });
      }
      return httpError(404, {});
    });

    try {
      const result = await monoService.simulatePayment('conn-1', {
        creditor_key_value: '3001234567',
        amount: { amount: 15000, currency: 'COP' },
      });
      assert.equal(result.success, true);
    } finally {
      restore();
    }
  });

  // Test: simulatePayment rechaza en production
  test('simulatePayment retorna error cuando el ambiente no es sandbox', async () => {
    setupMonoCredentials('conn-1', 'production');

    const result = await monoService.simulatePayment('conn-1', {
      creditor_key_value: '3001234567',
      amount: { amount: 15000, currency: 'COP' },
    });

    assert.equal(result.success, false);
    assert.ok(result.message.includes('sandbox'));
  });

  // Test: verifyWebhookSignature valida firma HMAC correcta (hex)
  test('verifyWebhookSignature retorna true para firma HMAC-SHA256 hex valida', () => {
    const payload = JSON.stringify({ event: 'collection.paid', data: { id: 'col-1' } });
    const webhookSecret = 'mono-webhook-secret';
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const isValid = monoService.verifyWebhookSignature(payload, validSignature, webhookSecret);
    assert.equal(isValid, true);
  });

  // Test: processWebhook con payload valido (collection.paid)
  test('processWebhook confirma el pago para el evento collection.paid', async () => {
    setupMonoCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-mono-001',
        organization_id: 1,
        branch_id: 10,
        amount: 15000,
        currency: 'COP',
        provider_code: 'breb',
        reference: 'QR-MONO-001',
        status: 'pending',
        payment_id: null,
      },
    ]);
    mockSupabase.setInsertResult('payments', { id: 'pay-mono-001' });

    const result = await monoService.processWebhook('conn-1', {
      event: 'collection.paid',
      data: {
        id: 'col-001',
        status: 'paid',
        amount: { amount: 15000, currency: 'COP' },
        metadata: { reference: 'QR-MONO-001' },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.message, 'Pago confirmado correctamente');
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.ok(paymentInserts.length >= 1);
  });

  // Test: processWebhook con firma invalida (metadata sin reference)
  test('processWebhook retorna error cuando el payload no tiene reference en metadata', async () => {
    setupMonoCredentials('conn-1');

    const result = await monoService.processWebhook('conn-1', {
      event: 'collection.paid',
      data: {
        id: 'col-002',
        status: 'paid',
        metadata: {},
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.message.includes('reference'));
  });

  // Test: processWebhook marca expired
  test('processWebhook marca la sesion como expired para collection.expired', async () => {
    setupMonoCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-mono-002',
        organization_id: 1,
        branch_id: 10,
        amount: 15000,
        currency: 'COP',
        provider_code: 'breb',
        reference: 'QR-MONO-002',
        status: 'pending',
        payment_id: null,
      },
    ]);

    const result = await monoService.processWebhook('conn-1', {
      event: 'collection.expired',
      data: {
        id: 'col-003',
        status: 'expired',
        metadata: { reference: 'QR-MONO-002' },
      },
    });

    assert.equal(result.success, true);
    assert.ok(result.message.includes('expired'));
    const updates = mockSupabase.getCalls('payment_qr_sessions', 'update');
    assert.ok(updates.length >= 1);
  });
});
