/**
 * Tests del servicio Wompi.
 * Cubre firma de integridad, creacion/consulta de transacciones y verificacion
 * de eventos webhook. Usa mocks de fetch y Supabase.
 *
 * Nota: el servicio Wompi expone `verifyWebhookEvent` (no `processWebhook`),
 * por lo que los tests de webhook validan la verificacion de firma del evento.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import wompiService from '../wompiService';
import type { WompiCredentials, WompiWebhookEvent } from '../wompiTypes';
import { mockSupabase } from '@/lib/supabase/config';
import { installFetchMock, ok, httpError } from '@test/mocks/fetchMock';

const INTEGRITY_SECRET = 'test_integrity_secret';
const EVENTS_SECRET = 'test_events_secret';

const credentials: WompiCredentials = {
  publicKey: 'pub_test_123',
  privateKey: 'prv_test_123',
  eventsSecret: EVENTS_SECRET,
  integritySecret: INTEGRITY_SECRET,
  environment: 'sandbox',
};

describe('WompiService', () => {
  beforeEach(() => {
    mockSupabase.reset();
  });

  // Test: generateIntegritySignature (SHA256)
  test('generateIntegritySignature genera SHA256 de reference+amount+currency+secret', () => {
    const reference = 'QR-WOMPI-001';
    const amountInCents = 5000000;
    const currency = 'COP';

    const signature = wompiService.generateIntegritySignature(
      reference,
      amountInCents,
      currency,
      INTEGRITY_SECRET,
    );

    const expected = crypto
      .createHash('sha256')
      .update(`${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`)
      .digest('hex');

    assert.equal(signature, expected);
    assert.equal(signature.length, 64, 'SHA256 hex de 64 caracteres');
    assert.match(signature, /^[0-9a-f]+$/, 'Hexadecimal');
  });

  // Test: generateIntegritySignature con expiration_time
  test('generateIntegritySignature incluye expiration_time cuando se provee', () => {
    const reference = 'QR-WOMPI-002';
    const amountInCents = 100000;
    const currency = 'COP';
    const expirationTime = '2026-12-31T23:59:59Z';

    const signature = wompiService.generateIntegritySignature(
      reference,
      amountInCents,
      currency,
      INTEGRITY_SECRET,
      expirationTime,
    );

    const expected = crypto
      .createHash('sha256')
      .update(`${reference}${amountInCents}${currency}${expirationTime}${INTEGRITY_SECRET}`)
      .digest('hex');

    assert.equal(signature, expected);

    // Sin expiration_time debe dar un hash distinto
    const withoutExpiration = wompiService.generateIntegritySignature(
      reference,
      amountInCents,
      currency,
      INTEGRITY_SECRET,
    );
    assert.notEqual(signature, withoutExpiration, 'Con/sin expiration deben diferir');
  });

  // Test: createTransaction (mock fetch)
  test('createTransaction envia la transaccion y retorna la respuesta del proveedor', async () => {
    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/transactions'), 'Debe llamar a /transactions');
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.reference, 'QR-WOMPI-001');
      assert.equal(body.amount_in_cents, 5000000);
      // La firma debe autogenerarse si no viene
      assert.ok(body.signature, 'Debe incluir firma de integridad');

      return ok({
        data: {
          id: 'tx-wompi-001',
          created_at: '2026-08-01T10:00:00Z',
          amount_in_cents: 5000000,
          reference: 'QR-WOMPI-001',
          currency: 'COP',
          payment_method_type: 'NEQUI',
          payment_method: { type: 'NEQUI', extra: {} },
          status: 'APPROVED',
          status_message: null,
          merchant: { name: 'Comercio', legal_name: 'Comercio', email: 'c@c.co' },
          redirect_url: null,
          taxes: [],
        },
      });
    });

    try {
      const result = await wompiService.createTransaction(credentials, {
        acceptance_token: 'acc-token',
        accept_personal_auth: 'pers-token',
        amount_in_cents: 5000000,
        currency: 'COP',
        customer_email: 'cliente@correo.co',
        reference: 'QR-WOMPI-001',
        payment_method: { type: 'NEQUI', phone_number: '3001234567' },
      });

      assert.ok(result, 'Debe retornar la respuesta');
      assert.equal(result?.data.id, 'tx-wompi-001');
      assert.equal(result?.data.status, 'APPROVED');
    } finally {
      restore();
    }
  });

  // Test: createTransaction retorna null ante error del proveedor
  test('createTransaction retorna null cuando Wompi responde 400', async () => {
    const restore = installFetchMock(() => httpError(400, { error: 'bad request' }));
    try {
      const result = await wompiService.createTransaction(credentials, {
        acceptance_token: 'acc',
        accept_personal_auth: 'pers',
        amount_in_cents: 100,
        currency: 'COP',
        customer_email: 'c@c.co',
        reference: 'QR-X',
        payment_method: { type: 'NEQUI', phone_number: '300' },
      });
      assert.equal(result, null);
    } finally {
      restore();
    }
  });

  // Test: getTransaction (mock fetch)
  test('getTransaction consulta el estado de una transaccion por id', async () => {
    const restore = installFetchMock((url, init) => {
      assert.ok(url.includes('/transactions/tx-wompi-001'), 'Debe consultar /transactions/{id}');
      assert.equal(init?.method, 'GET');
      return ok({
        data: {
          id: 'tx-wompi-001',
          created_at: '2026-08-01T10:00:00Z',
          amount_in_cents: 5000000,
          reference: 'QR-WOMPI-001',
          currency: 'COP',
          payment_method_type: 'NEQUI',
          payment_method: { type: 'NEQUI', extra: {} },
          status: 'PENDING',
          status_message: null,
          merchant: { name: 'C', legal_name: 'C', email: 'c@c.co' },
          redirect_url: null,
          taxes: [],
        },
      });
    });

    try {
      const result = await wompiService.getTransaction(credentials, 'tx-wompi-001');
      assert.ok(result);
      assert.equal(result?.data.status, 'PENDING');
    } finally {
      restore();
    }
  });

  // Test: verifyWebhookEvent con firma valida
  test('verifyWebhookEvent retorna true para un evento con checksum valido', () => {
    const event: WompiWebhookEvent = {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'tx-1',
          amount_in_cents: 5000000,
          reference: 'QR-WOMPI-001',
          customer_email: 'c@c.co',
          currency: 'COP',
          payment_method_type: 'NEQUI',
          status: 'APPROVED',
        },
      },
      environment: 'sandbox',
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.reference'],
        checksum: '',
      },
      timestamp: 1722500000,
      sent_at: '2026-08-01T10:00:00Z',
    };

    // Reconstruir el checksum esperado
    const values = ['tx-1', 'APPROVED', 'QR-WOMPI-001'];
    const concatenated = values.join('') + event.timestamp + EVENTS_SECRET;
    const checksum = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex')
      .toUpperCase();
    event.signature.checksum = checksum;

    const isValid = wompiService.verifyWebhookEvent(event, EVENTS_SECRET);
    assert.equal(isValid, true);
  });

  // Test: verifyWebhookEvent con firma invalida
  test('verifyWebhookEvent retorna false para un checksum manipulado', () => {
    const event: WompiWebhookEvent = {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'tx-1',
          amount_in_cents: 5000000,
          reference: 'QR-WOMPI-001',
          customer_email: 'c@c.co',
          currency: 'COP',
          payment_method_type: 'NEQUI',
          status: 'APPROVED',
        },
      },
      environment: 'sandbox',
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.reference'],
        checksum: 'CHECKSUM_FALSO_MANIPULADO',
      },
      timestamp: 1722500000,
      sent_at: '2026-08-01T10:00:00Z',
    };

    const isValid = wompiService.verifyWebhookEvent(event, EVENTS_SECRET);
    assert.equal(isValid, false);
  });

  // Test: generateReference genera un formato unico
  test('generateReference genera una referencia con prefijo y orgId', () => {
    const ref = wompiService.generateReference(42, 'QR');
    assert.match(ref, /^QR-42-/, 'Debe tener formato QR-{orgId}-...');
    // Dos llamadas consecutivas deben dar referencias distintas
    const ref2 = wompiService.generateReference(42, 'QR');
    assert.notEqual(ref, ref2, 'Las referencias deben ser unicas');
  });

  // Test: getCredentials obtiene credenciales desde Supabase
  test('getCredentials reconstruye las 4 credenciales desde integration_credentials', async () => {
    mockSupabase.setTableData('integration_connections', [{ id: 'conn-1', environment: 'sandbox' }]);
    mockSupabase.setTableData('integration_credentials', [
      { connection_id: 'conn-1', purpose: 'public_key', secret_ref: 'pub_test_1', status: 'active' },
      { connection_id: 'conn-1', purpose: 'private_key', secret_ref: 'prv_test_1', status: 'active' },
      { connection_id: 'conn-1', purpose: 'events_secret', secret_ref: EVENTS_SECRET, status: 'active' },
      { connection_id: 'conn-1', purpose: 'integrity_secret', secret_ref: INTEGRITY_SECRET, status: 'active' },
    ]);

    const creds = await wompiService.getCredentials('conn-1');
    assert.ok(creds, 'Debe retornar credenciales');
    assert.equal(creds?.publicKey, 'pub_test_1');
    assert.equal(creds?.privateKey, 'prv_test_1');
    assert.equal(creds?.eventsSecret, EVENTS_SECRET);
    assert.equal(creds?.integritySecret, INTEGRITY_SECRET);
    assert.equal(creds?.environment, 'sandbox');
  });
});
