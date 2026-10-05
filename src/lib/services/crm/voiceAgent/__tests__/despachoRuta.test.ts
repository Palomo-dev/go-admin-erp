import { NextRequest } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

let ctx: ServerOrgContext | null;
let allowed = true;
const authorize = jest.fn();
const elevate = jest.fn();
const dispatch = jest.fn();
const service = { private: true };
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: async () => {
    if (!ctx) throw new OrgContextError('Sin sesión', 401, 'UNAUTHENTICATED');
    return ctx;
  },
  requireOrgAdminOrPermission: async (...args: unknown[]) => {
    authorize(...args);
    if (!allowed) throw new OrgContextError('Sin permiso', 403, 'FORBIDDEN');
  },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { elevate(); return service; } }));
jest.mock('@/lib/services/crm/voiceAgentService', () => ({
  dispatchAgentCall: (...args: unknown[]) => dispatch(...args),
  VoiceDispatchBlocked: class extends Error { constructor(public reason: string, message: string) { super(message); } },
}));
import { POST } from '@/app/api/crm/voice-agents/[id]/dispatch/route';
import { CrmHttpError } from '@/lib/services/crm/crmErrors';
import { VoiceCreditPendingError } from '../creditosVoz';
import { VoiceDispatchBlocked } from '@/lib/services/crm/voiceAgentService';

const AGENT = '20000000-0000-4000-8000-000000000041';
const CUSTOMER = '20000000-0000-4000-8000-000000000042';
const request = (body: unknown = { customer_id: CUSTOMER }, id = AGENT, query = '') => POST(
  new NextRequest(`http://localhost/api/crm/voice-agents/${id}/dispatch${query}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) },
);
beforeEach(() => {
  ctx = { organizationId: 7, userId: 'actor', roleId: 3, isSuperAdmin: false } as ServerOrgContext;
  allowed = true; authorize.mockClear(); elevate.mockClear(); dispatch.mockReset();
  dispatch.mockResolvedValue({ callId: 'call', initiated: false });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sin sesión o permiso no eleva ni despacha', async () => {
  const saved = ctx; ctx = null; expect((await request()).status).toBe(401);
  ctx = saved; allowed = false; expect((await request()).status).toBe(403);
  expect(elevate).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
test.each(['body', 'query'])('organización ajena en %s se rechaza y registra antes de elevar', async source => {
  const response = await request(source === 'body' ? { customer_id: CUSTOMER, organization_id: 999 } : undefined,
    AGENT, source === 'query' ? '?organization_id=999' : '');
  expect(response.status).toBe(403); expect(console.warn).toHaveBeenCalled();
  expect(elevate).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
test.each([[{}, AGENT], [{ customer_id: 'incorrecto' }, AGENT], [{ customer_id: CUSTOMER }, 'incorrecto']])(
  'entrada inválida %p / %s no alcanza el servicio', async (body, id) => {
    expect((await request(body, id)).status).toBe(400); expect(elevate).not.toHaveBeenCalled();
  },
);
test('permiso canónico y organización de sesión preceden al despacho privado', async () => {
  expect((await request({ customer_id: CUSTOMER, dial_now: false })).status).toBe(200);
  expect(authorize).toHaveBeenCalledWith(ctx, 'crm.campaigns.manage');
  expect(dispatch).toHaveBeenCalledWith(7, service, { voiceAgentId: AGENT, customerId: CUSTOMER, opportunityId: null, dialNow: false });
  expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(elevate.mock.invocationCallOrder[0]);
});
test('referencia ajena preserva 404', async () => {
  dispatch.mockRejectedValue(new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado.'));
  expect((await request()).status).toBe(404);
});
test('incertidumbre responde 409 sin exponer el fallo financiero', async () => {
  dispatch.mockRejectedValue(new VoiceCreditPendingError(new Error('detalle privado')));
  const response = await request(); expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false, code: 'voz_pendiente_conciliacion' });
});
test('tope responde 429 y un fallo inesperado responde 500 sin datos privados', async () => {
  dispatch.mockRejectedValue(new VoiceDispatchBlocked('concurrency', 'Sin capacidad'));
  expect((await request()).status).toBe(429);
  dispatch.mockRejectedValue(new Error('detalle privado'));
  const response = await request(); expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('detalle privado');
});
