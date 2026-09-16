/// <reference types="jest" />
/**
 * Contrato del webhook de MercadoPago con `integration_connections`.
 *
 * Bug corregido (2026-09-15): la ruta filtraba `.eq('status', 'active')`, valor
 * que no existe en el CHECK de la tabla (`draft|connected|paused|error|revoked`).
 * Nunca encontraba la conexión y respondía `processed: false` en silencio.
 *
 * El doble aplica los filtros sobre un fixture con todos los valores del CHECK
 * (más un `'active'` imposible): solo `connected` debe encontrarse.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/mercadopago', () => ({
  MERCADOPAGO_API_BASE: 'https://api.mercadopago.test',
  mercadopagoService: {
    parseWebhookNotification: () => ({ type: 'payment', action: 'payment.updated', data: { id: 'pago-1' } }),
    verifyWebhook: () => true,
    getCredentials: (id: string) => getCredentials(id),
  },
}));

import { POST } from '../route';

function req(body: unknown) {
  const headers: Record<string, string> = { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req-1' };
  return { json: async () => body, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

const fetchSpy = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'approved', transaction_amount: 10 }) }));

beforeEach(() => {
  getCredentials.mockReset().mockResolvedValue({ accessToken: 'tok', webhookSecret: 'sec' });
  fetchSpy.mockClear();
  global.fetch = fetchSpy as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('MercadoPago webhook: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` (y no la `active`) y procesa el pago', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('mercadopago', 'mercadopago') });

    const res = await POST(req({ type: 'payment', data: { id: 'pago-1' } }));
    const json = await res.json();

    expect(json).toMatchObject({ received: true, processed: true, payment_status: 'approved' });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected'));
    expect(getCredentials).not.toHaveBeenCalledWith(connectionId('active'));
    expect(mockAdmin.inserts).toEqual([
      expect.objectContaining({ table: 'integration_events', payload: expect.objectContaining({ connection_id: connectionId('connected') }) }),
    ]);
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({
      integration_connections: connectionFixture('mercadopago', 'mercadopago').filter((r) => r.status === status),
    });

    const res = await POST(req({ type: 'payment', data: { id: 'pago-1' } }));

    expect(await res.json()).toEqual({ received: true, processed: false });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(mockAdmin.inserts).toEqual([]);
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('mercadopago', 'mercadopago') });
    await POST(req({ type: 'payment', data: { id: 'pago-1' } }));
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
