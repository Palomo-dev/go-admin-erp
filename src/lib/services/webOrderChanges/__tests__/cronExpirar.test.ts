/** @jest-environment node */
const estado: { rpc: jest.Mock } = { rpc: jest.fn() };
jest.mock('@/lib/security/webhookSignatures', () => ({ verifyCronSecret: jest.fn(), webhookErrorResponse: jest.fn() }));
jest.mock('@/lib/services/webOrderChanges/webOrderChangesServer', () => ({ desactivarLinkCambio: jest.fn(async () => 'desactivado') }));
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    rpc: estado.rpc,
    from: () => {
      const q: Record<string, unknown> = {};
      for (const k of ['select', 'in', 'eq', 'is', 'not']) q[k] = () => q;
      q.limit = async () => ({ data: [{ id: 'ch1' }], error: null });
      return q;
    },
  }),
}));

import { GET } from '@/app/api/cron/expire-web-order-changes/route';
import type { NextRequest } from 'next/server';

const req = {} as NextRequest;

describe('cron expire-web-order-changes', () => {
  it.each(['42P01', '42883', 'PGRST202'])('sin migración (%s) ⇒ 200 con aviso', async (code) => {
    estado.rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'no existe' } });
    const r = await GET(req);
    expect(r.status).toBe(200);
    expect((await r.json()).aviso).toMatch(/migración/);
  });

  it('otro error ⇒ 500', async () => {
    estado.rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'timeout' } });
    expect((await GET(req)).status).toBe(500);
  });

  it('ok ⇒ cuenta vencidos y links desactivados', async () => {
    estado.rpc.mockResolvedValueOnce({ data: { ok: true, vencidos: 3 }, error: null });
    expect(await (await GET(req)).json()).toEqual({ ok: true, vencidos: 3, linksDesactivados: 1 });
  });
});
