/// <reference types="jest" />
/**
 * Contrato del webhook de Stripe (integración de clientes) con
 * `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Respondía `verified: false`
 * para todo evento real. Ver `src/lib/integrations/connectionStatus.ts`.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const EVENT = { id: 'evt_1', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_1' } } };

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/stripe', () => ({
  stripeClientService: {
    getCredentials: (id: string) => getCredentials(id),
    verifyWebhookEvent: () => EVENT,
  },
}));

import { POST } from '../route';

function req() {
  const headers: Record<string, string> = { 'stripe-signature': 't=1,v1=abc' };
  return { text: async () => JSON.stringify(EVENT), headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

beforeEach(() => {
  getCredentials.mockReset().mockResolvedValue({ secretKey: 'sk', webhookSecret: 'whsec' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('Stripe webhook: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` (y no la `active`), verifica y registra el evento', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('stripe', 'stripe') });

    const res = await POST(req());

    expect(await res.json()).toEqual({ received: true, verified: true, type: EVENT.type });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected'));
    expect(mockAdmin.inserts).toEqual([
      expect.objectContaining({ table: 'integration_events', payload: expect.objectContaining({ connection_id: connectionId('connected'), event_type: EVENT.type }) }),
    ]);
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('stripe', 'stripe').filter((r) => r.status === status) });

    const res = await POST(req());

    expect(await res.json()).toEqual({ received: true, verified: false });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(mockAdmin.inserts).toEqual([]);
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('stripe', 'stripe') });
    await POST(req());
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
