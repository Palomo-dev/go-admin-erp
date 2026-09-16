/// <reference types="jest" />
/**
 * Contrato del webhook de PayPal con `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Respondía `verified: false`
 * para todo evento real. Ver `src/lib/integrations/connectionStatus.ts`.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/paypal', () => ({
  paypalService: {
    getCredentials: (id: string) => getCredentials(id),
    verifyWebhookSignature: async () => true,
  },
}));

import { POST } from '../route';

const EVENT = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource_type: 'capture', summary: 'ok', resource: { id: 'cap-1' } };

function req(body: unknown) {
  const headers: Record<string, string> = {
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.test/cert',
    'paypal-transmission-id': 't-1', 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': '2026-09-15T00:00:00Z',
  };
  return { json: async () => body, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

beforeEach(() => {
  getCredentials.mockReset().mockResolvedValue({ clientId: 'c', clientSecret: 's', webhookId: 'w' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('PayPal webhook: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` (y no la `active`), verifica y registra el evento', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('paypal', 'paypal') });

    const res = await POST(req(EVENT));

    expect(await res.json()).toEqual({ received: true, verified: true });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected'));
    expect(mockAdmin.inserts).toEqual([
      expect.objectContaining({ table: 'integration_events', payload: expect.objectContaining({ connection_id: connectionId('connected'), event_type: EVENT.event_type }) }),
    ]);
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('paypal', 'paypal').filter((r) => r.status === status) });

    const res = await POST(req(EVENT));

    expect(await res.json()).toEqual({ received: true, verified: false });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(mockAdmin.inserts).toEqual([]);
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('paypal', 'paypal') });
    await POST(req(EVENT));
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
