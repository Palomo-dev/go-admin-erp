import { makeSupabase, has, type MockSupabase } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';
const { OrgContextError: RealError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
let user: MockSupabase, service: MockSupabase, permissions: Set<string>;
const org = 120;
const actor = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const version = '2026-10-01T11:00:00.000Z';
const row = { id, organization_id: org, name: 'Campaña', channel: 'whatsapp', status: 'draft', content: 'Hola',
  updated_at: version, statistics: { audience: { source: 'manual', customer_ids: [actor] }, respect_allowed_hours: true } };
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: org, userId: actor, roleId: 4, isSuperAdmin: false, supabase: user.sb })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permissions.has(code)),
  requireOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => {
    if (!permissions.has(code)) throw new RealError('Sin permiso', 403, 'FORBIDDEN');
  }),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => service.sb }));
import { NextRequest } from 'next/server';
import { GET as list, POST } from '../campaigns/route';
import { GET as detail, PATCH, DELETE } from '../campaigns/[id]/route';
const request = (path = '', method = 'GET', body?: unknown) => new NextRequest(`http://localhost/api/crm/campaigns${path}`, {
  method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = () => ({ params: Promise.resolve({ id }) });
const create = { name: 'Nueva', channel: 'whatsapp', content: 'Hola', audience: { source: 'manual', customer_ids: [actor] } };
beforeEach(() => {
  permissions = new Set(['crm.opportunities.view', 'crm.campaigns.manage']);
  user = makeSupabase({ campaigns: ops => ({ data: has(ops, 'maybeSingle') ? row : [row] }) });
  service = makeSupabase({}, (_fn, args) => ({ data: { ...row, ...(args.p_values as object ?? {}) } }));
});

test('consulta lista y detalle con permiso de lectura', async () => {
  expect((await list(request(), params())).status).toBe(200);
  expect((await detail(request(`/${id}`), params())).status).toBe(200);
  permissions.clear();
  expect((await list(request(), params())).status).toBe(403);
  expect((await detail(request(`/${id}`), params())).status).toBe(403);
  expect(user.calls).toHaveLength(2);
});

test('sin permiso de gestión no hay lectura ni RPC de mutación', async () => {
  permissions.delete('crm.campaigns.manage');
  expect((await POST(request('', 'POST', create), params())).status).toBe(403);
  expect((await PATCH(request(`/${id}`, 'PATCH', { name: 'Cambio' }), params())).status).toBe(403);
  expect((await DELETE(request(`/${id}`, 'DELETE'), params())).status).toBe(403);
  expect(user.calls).toHaveLength(0); expect(service.rpcCalls).toHaveLength(0);
});

test('organización ajena en query o body devuelve 403 antes de usar datos', async () => {
  expect((await list(request('?organization_id=121'), params())).status).toBe(403);
  expect((await detail(request(`/${id}?organization_id=121`), params())).status).toBe(403);
  expect((await POST(request('', 'POST', { ...create, organization_id: 121 }), params())).status).toBe(403);
  expect((await PATCH(request(`/${id}`, 'PATCH', { name: 'Cambio', organization_id: 121 }), params())).status).toBe(403);
  expect((await DELETE(request(`/${id}`, 'DELETE', { organization_id: 121 }), params())).status).toBe(403);
  expect(user.calls).toHaveLength(0); expect(service.rpcCalls).toHaveLength(0);
});

test('crear, editar y archivar propagan el actor y la versión a las RPC privadas', async () => {
  expect((await POST(request('', 'POST', create), params())).status).toBe(201);
  expect((await PATCH(request(`/${id}`, 'PATCH', { name: 'Cambio', expected_updated_at: version }), params())).status).toBe(200);
  expect((await DELETE(request(`/${id}`, 'DELETE'), params())).status).toBe(200);
  expect(service.rpcCalls.map(c => c.fn)).toEqual(['crm_campaign_save', 'crm_campaign_save', 'crm_campaign_archive']);
  expect(service.rpcCalls[1].args).toMatchObject({ p_actor: actor, p_version: version, p_org: org });
  expect(service.calls).toHaveLength(0);
});

test.each(['40001', 'P0001'])('un conflicto %s llega como 409', async code => {
  service = makeSupabase({}, () => ({ error: { code, message: 'campana_modificada' } }));
  expect((await PATCH(request(`/${id}`, 'PATCH', { name: 'Cambio' }), params())).status).toBe(409);
  expect((await DELETE(request(`/${id}`, 'DELETE'), params())).status).toBe(409);
});

test('un fallo interno no revela detalles de la base', async () => {
  service = makeSupabase({}, () => ({ error: { code: 'XX000', message: 'detalle privado de SQL' } }));
  const r = await PATCH(request(`/${id}`, 'PATCH', { name: 'Cambio' }), params());
  expect(r.status).toBe(500); expect(JSON.stringify(await r.json())).not.toContain('detalle privado');
});
