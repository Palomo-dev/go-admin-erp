import { NextRequest } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { makeSupabase, has } from './mockSupabase';

let ctx: ServerOrgContext | null;
let allowed: boolean;
let owned: boolean;
let readError: boolean;
const rpc = jest.fn();
const stats = jest.fn();
const permission = jest.fn();

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: async () => {
    if (!ctx) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    return ctx;
  },
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => { permission(code); return allowed; },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ({ rpc }) }));
jest.mock('../campaignService', () => ({ getCampaignStats: (...args: unknown[]) => stats(...args) }));
import { GET } from '@/app/api/crm/campaigns/[id]/stats/route';

const ID = '11111111-1111-4111-8111-111111111111';
const request = (query = 'sync=1') => GET(new NextRequest(`http://localhost/api/crm/campaigns/${ID}/stats?${query}`), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  allowed = true; owned = true; readError = false;
  rpc.mockReset(); stats.mockReset(); permission.mockReset();
  rpc.mockResolvedValue({ data: 2405, error: null });
  stats.mockResolvedValue({ counts: { total: 2405 } });
  const mock = makeSupabase({ campaigns: (ops) => {
    expect(has(ops, 'eq', 'organization_id', 7)).toBe(true);
    expect(has(ops, 'eq', 'id', ID)).toBe(true);
    return { data: owned ? { id: ID, organization_id: 7, channel: 'whatsapp', statistics: {} } : null, error: readError ? { message: 'Fixture lectura caída' } : null };
  } });
  ctx = { organizationId: 7, userId: 'actor', supabase: mock.sb } as unknown as ServerOrgContext;
});

test('permiso y propiedad preceden a la conciliación privada; devuelve estadísticas', async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(permission).toHaveBeenCalledWith('crm.opportunities.view');
  expect(rpc).toHaveBeenCalledWith('crm_reconcile_provider_status', { p_org: 7, p_message: null, p_campaign: ID });
  expect(stats).toHaveBeenCalledWith(7, ID, ctx?.supabase);
  expect(await response.json()).toEqual({ counts: { total: 2405 } });
});

test('sin sync consulta cifras sin ejecutar mutación privada', async () => {
  expect((await request('')).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
});

test('sin sesión, sin permiso y organización ajena no llegan al servicio privado', async () => {
  const saved = ctx;
  ctx = null; expect((await request()).status).toBe(401);
  ctx = saved; allowed = false; expect((await request()).status).toBe(403);
  allowed = true; expect((await request('sync=1&organization_id=999')).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(stats).not.toHaveBeenCalled();
});

test('campaña ajena y falla de lectura no ejecutan conciliación', async () => {
  owned = false; expect((await request()).status).toBe(404);
  owned = true; readError = true; expect((await request()).status).toBe(500);
  expect(rpc).not.toHaveBeenCalled();
  expect(stats).not.toHaveBeenCalled();
});

test('fallo de conciliación no responde cifras como si hubiera sincronizado', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Fixture conciliación fallida' } });
  expect((await request()).status).toBe(500);
  expect(stats).not.toHaveBeenCalled();
});
