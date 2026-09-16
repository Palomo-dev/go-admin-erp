/// <reference types="jest" />
/**
 * Contrato del webhook de PayU con `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Respondía `verified: false`
 * para toda confirmación real. Ver `src/lib/integrations/connectionStatus.ts`.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const PAYLOAD = {
  merchant_id: 'M-1', reference_sale: 'venta-1', reference_pol: 'pol-1', state_pol: '4', response_code_pol: '1',
  value: '10000', currency: 'COP', payment_method: '10', transaction_id: 'tx-1', sign: 'firma',
};

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/payu', () => ({
  payuService: {
    parseWebhookPayload: () => PAYLOAD,
    getCredentials: (id: string) => getCredentials(id),
    verifyWebhookSignature: () => true,
  },
}));

import { POST } from '../route';

function req(body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  return { json: async () => body, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

beforeEach(() => {
  getCredentials.mockReset().mockResolvedValue({ apiKey: 'k', merchantId: 'M-1' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('PayU webhook: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` (y no la `active`), verifica y registra el evento', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('payu', 'payu') });

    const res = await POST(req(PAYLOAD));

    expect(await res.json()).toEqual({ received: true, verified: true });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected'));
    expect(mockAdmin.inserts).toEqual([
      expect.objectContaining({ table: 'integration_events', payload: expect.objectContaining({ connection_id: connectionId('connected'), event_type: 'payment.approved' }) }),
    ]);
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('payu', 'payu').filter((r) => r.status === status) });

    const res = await POST(req(PAYLOAD));

    expect(await res.json()).toEqual({ received: true, verified: false });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(mockAdmin.inserts).toEqual([]);
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('payu', 'payu') });
    await POST(req(PAYLOAD));
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
