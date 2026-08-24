/**
 * Tests del servicio Bancolombia API directa.
 * Cubre OAuth, registro/validacion de transferencias, verificacion JWT y webhooks.
 * Usa mocks de fetch y Supabase (no depende de servicios externos).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bancolombiaService from '../bancolombiaService';
import { mockSupabase } from '@/lib/supabase/admin';
import { installFetchMock, ok, httpError } from '@test/mocks/fetchMock';

const CLIENT_ID = 'bc-client-id';
const CLIENT_SECRET = 'bc-client-secret';
const COMMERCE_BUTTON_ID = 'btn-transfer-001';

// Configura las credenciales en el mock de Supabase
function setupBancolombiaCredentials(
  connectionId: string,
  environment: 'sandbox' | 'production' = 'sandbox',
) {
  mockSupabase.setTableData('integration_connections', [{ id: connectionId, environment }]);
  mockSupabase.setTableData('integration_credentials', [
    {
      connection_id: connectionId,
      purpose: 'default',
      secret_ref: JSON.stringify({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        commerceTransferButtonId: COMMERCE_BUTTON_ID,
      }),
      status: 'active',
    },
  ]);
}

describe('BancolombiaService', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // Test: getAccessToken (mock fetch)
  test('getAccessToken obtiene un token via OAuth client_credentials (form-urlencoded)', async () => {
    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/security/token'), 'Debe llamar al endpoint de token');
      assert.equal(init?.method, 'POST');
      const body = init?.body as string;
      assert.ok(body.includes('grant_type=client_credentials'));
      assert.ok(body.includes(`client_id=${CLIENT_ID}`));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      assert.ok(headers['Content-Type']?.includes('x-www-form-urlencoded'));

      return ok({
        access_token: 'bc-token-xyz',
        token_type: 'bearer',
        expires_in: 1200,
        scope: 'Transfer-Intention:write:app',
      });
    });

    try {
      const token = await bancolombiaService.getAccessToken(CLIENT_ID, CLIENT_SECRET, 'sandbox');
      assert.equal(token, 'bc-token-xyz');
    } finally {
      restore();
    }
  });

  // Test: getAccessToken propaga error
  test('getAccessToken lanza error cuando OAuth responde 401', async () => {
    const restore = installFetchMock(() => httpError(401, { error: 'invalid_client' }));
    try {
      await assert.rejects(
        bancolombiaService.getAccessToken(CLIENT_ID, 'mala', 'sandbox'),
        /HTTP 401/,
      );
    } finally {
      restore();
    }
  });

  // Test: registerTransferIntention (mock fetch)
  test('registerTransferIntention registra la intencion y parsea la respuesta', async () => {
    setupBancolombiaCredentials('conn-1');

    const restore = installFetchMock((url, init) => {
      if (url.includes('/security/token')) {
        return ok({ access_token: 'bc-token', token_type: 'bearer', expires_in: 1200, scope: 'x' });
      }
      if (url.includes('/transfer/action/registry')) {
        assert.equal(init?.method, 'POST');
        const body = JSON.parse(init?.body as string);
        assert.equal(body.transferReference, 'QR-BC-001');
        assert.equal(body.transferAmount, 75000);
        assert.equal(body.commerceTransferButtonId, COMMERCE_BUTTON_ID);

        return ok({
          data: {
            transferCode: 'tc-001',
            redirectURL: 'https://sandbox.apps.ambientesbc.com/redirect/tc-001',
            transferState: 'pending',
            transferReference: 'QR-BC-001',
            transferAmount: 75000,
          },
        });
      }
      return httpError(404, {});
    });

    try {
      const result = await bancolombiaService.registerTransferIntention('conn-1', {
        transferReference: 'QR-BC-001',
        transferDescription: 'Pago de prueba',
        transferAmount: 75000,
        commerceUrl: 'https://comercio.co',
        confirmationURL: 'https://comercio.co/api/webhook/bancolombia',
      });

      assert.equal(result.transferCode, 'tc-001');
      assert.equal(result.transferState, 'pending');
      assert.equal(result.transferReference, 'QR-BC-001');
      assert.equal(result.transferAmount, 75000);
      assert.ok(result.redirectURL.includes('tc-001'));
    } finally {
      restore();
    }
  });

  // Test: validateTransfer (mock fetch)
  test('validateTransfer consulta el estado de una transferencia', async () => {
    setupBancolombiaCredentials('conn-1');

    const restore = installFetchMock((url, init) => {
      if (url.includes('/security/token')) {
        return ok({ access_token: 'bc-token', token_type: 'bearer', expires_in: 1200, scope: 'x' });
      }
      if (url.includes('/transfer/tc-001/action/validate')) {
        assert.equal(init?.method, 'GET');
        return ok({
          data: {
            transferCode: 'tc-001',
            transferState: 'approved',
            transferReference: 'QR-BC-001',
            transferAmount: 75000,
            transactionId: 'bc-tx-001',
          },
        });
      }
      return httpError(404, {});
    });

    try {
      const result = await bancolombiaService.validateTransfer('conn-1', 'tc-001');
      assert.equal(result.transferCode, 'tc-001');
      assert.equal(result.transferState, 'approved');
      assert.equal(result.transactionId, 'bc-tx-001');
      assert.equal(result.transferAmount, 75000);
    } finally {
      restore();
    }
  });

  // Test: processWebhook con payload valido (approved)
  test('processWebhook confirma el pago cuando transferState es approved', async () => {
    setupBancolombiaCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-bc-001',
        organization_id: 1,
        branch_id: 10,
        amount: 75000,
        currency: 'COP',
        provider_code: 'bancolombia',
        reference: 'QR-BC-001',
        status: 'pending',
        payment_id: null,
      },
    ]);
    mockSupabase.setInsertResult('payments', { id: 'pay-bc-001' });

    const result = await bancolombiaService.processWebhook('conn-1', {
      transferCode: 'tc-001',
      transferState: 'approved',
      transferReference: 'QR-BC-001',
      transferAmount: 75000,
      transactionId: 'bc-tx-001',
    });

    assert.equal(result.success, true);
    assert.equal(result.message, 'Pago confirmado correctamente');
    const paymentInserts = mockSupabase.getCalls('payments', 'insert');
    assert.ok(paymentInserts.length >= 1, 'Debe insertar el payment');
  });

  // Test: processWebhook con sesion no encontrada
  test('processWebhook retorna error cuando no encuentra la sesion QR', async () => {
    setupBancolombiaCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', []);

    const result = await bancolombiaService.processWebhook('conn-1', {
      transferCode: 'tc-999',
      transferState: 'approved',
      transferReference: 'NO-EXISTISTE',
      transferAmount: 1000,
    });

    assert.equal(result.success, false);
    assert.ok(result.message.includes('no encontrada'));
  });

  // Test: processWebhook con transferReference vacio
  test('processWebhook retorna error cuando transferReference esta vacio', async () => {
    setupBancolombiaCredentials('conn-1');

    const result = await bancolombiaService.processWebhook('conn-1', {
      transferCode: 'tc-001',
      transferState: 'approved',
      transferReference: '',
      transferAmount: 1000,
    });

    assert.equal(result.success, false);
    assert.ok(result.message.includes('transferReference'));
  });

  // Test: processWebhook marca rejected
  test('processWebhook marca la sesion como rejected cuando transferState es rejected', async () => {
    setupBancolombiaCredentials('conn-1');
    mockSupabase.setTableData('payment_qr_sessions', [
      {
        id: 'sess-bc-002',
        organization_id: 1,
        branch_id: 10,
        amount: 75000,
        currency: 'COP',
        provider_code: 'bancolombia',
        reference: 'QR-BC-002',
        status: 'pending',
        payment_id: null,
      },
    ]);

    const result = await bancolombiaService.processWebhook('conn-1', {
      transferCode: 'tc-002',
      transferState: 'rejected',
      transferReference: 'QR-BC-002',
      transferAmount: 75000,
    });

    assert.equal(result.success, true);
    assert.ok(result.message.includes('rejected'));
    const updates = mockSupabase.getCalls('payment_qr_sessions', 'update');
    assert.ok(updates.length >= 1);
    assert.equal((updates[0].payload as Record<string, unknown>).status, 'rejected');
  });

  // Test: verifyJwtNotification valida un JWT HS256 correcto
  test('verifyJwtNotification retorna true para un JWT HS256 firmado con client_secret', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      transferCode: 'tc-001',
      transferState: 'approved',
      transferReference: 'QR-BC-001',
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', CLIENT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const token = `${headerB64}.${payloadB64}.${signature}`;
    const isValid = bancolombiaService.verifyJwtNotification(token, CLIENT_SECRET);
    assert.equal(isValid, true);
  });

  // Test: verifyJwtNotification rechaza un JWT con firma manipulada
  test('verifyJwtNotification retorna false para un JWT con firma manipulada', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { transferCode: 'tc-001', transferState: 'approved' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const token = `${headerB64}.${payloadB64}.firmaFalsaInvalida`;
    const isValid = bancolombiaService.verifyJwtNotification(token, CLIENT_SECRET);
    assert.equal(isValid, false);
  });

  // Test: decodeJwtPayload extrae el contenido del JWT
  test('decodeJwtPayload decodifica el payload de un JWT sin verificar firma', () => {
    const payload = {
      transferCode: 'tc-001',
      transferState: 'approved',
      transferReference: 'QR-BC-001',
      transferAmount: 75000,
    };
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${headerB64}.${payloadB64}.sig`;

    const decoded = bancolombiaService.decodeJwtPayload(token);
    assert.ok(decoded);
    assert.equal(decoded?.transferCode, 'tc-001');
    assert.equal(decoded?.transferState, 'approved');
    assert.equal(decoded?.transferReference, 'QR-BC-001');
  });
});
