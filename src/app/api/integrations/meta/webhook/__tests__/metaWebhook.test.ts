/// <reference types="jest" />
/**
 * Contrato del webhook de Meta Marketing con `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Respondía `verified: false`
 * para todo evento real. Ver `src/lib/integrations/connectionStatus.ts`.
 *
 * Esta ruta identifica la conexión por `integration_connectors.code`
 * (`meta_marketing`), no por el código del proveedor.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/meta', () => ({
  metaMarketingService: {
    getCredentials: (id: string) => getCredentials(id),
    verifyWebhookSignature: () => true,
  },
}));

import { POST } from '../route';

const BODY = { object: 'page', entry: [{ id: 'p-1', time: 1, changes: [{ field: 'feed', value: { item: 'post' } }] }] };

function req() {
  const headers: Record<string, string> = { 'x-hub-signature-256': 'sha256=abc' };
  return { text: async () => JSON.stringify(BODY), headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

beforeEach(() => {
  getCredentials.mockReset().mockResolvedValue({ appSecret: 'secreto' });
});

describe('Meta webhook: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` (y no la `active`), verifica y registra el evento', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing') });

    const res = await POST(req());

    expect(await res.json()).toEqual({ received: true, verified: true });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected'));
    expect(mockAdmin.inserts).toEqual([
      expect.objectContaining({ table: 'integration_events', payload: expect.objectContaining({ connection_id: connectionId('connected'), event_type: 'meta.page.feed' }) }),
    ]);
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing').filter((r) => r.status === status) });

    const res = await POST(req());

    expect(await res.json()).toEqual({ received: true, verified: false });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(mockAdmin.inserts).toEqual([]);
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing') });
    await POST(req());
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
