import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

const CALL_ID = '11111111-1111-4111-8111-111111111111';
let db: FakeDb;
const permissions = new Set<string>();
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 7, userId: 'usuario', roleId: 3, isSuperAdmin: false, supabase: db.client() })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permissions.has(code)),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => db.client()) }));
import { GET, PATCH } from '../route';

// Doble del contrato CAS nativo; el default de producción permanece activado.
const rpcFlag = process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
beforeAll(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; });
afterAll(() => { if (rpcFlag === undefined) delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; else process.env.CRM_CALL_ATOMIC_RPC_ENABLED = rpcFlag; });

const params = { params: Promise.resolve({ id: CALL_ID }) };
function request(body: object, query = '') { return new NextRequest(`https://crm.test/api/crm/calls/${CALL_ID}${query}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

beforeEach(() => {
  permissions.clear();
  db = new FakeDb({ tables: { calls: [{ id: CALL_ID, organization_id: 7, user_id: null, status: 'completed', metadata: {}, started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 60 }] } });
  db.rpcImpl.fn_crm_callback_llamada = (args) => {
    const current = db.rows('calls').find((row) => row.id === args.p_call && row.organization_id === args.p_org);
    if (!current) throw new Error('llamada inexistente');
    const stale = Object.entries(args.p_expected).some(([key, value]) => JSON.stringify(current[key] ?? null) !== JSON.stringify(value));
    if (!stale) Object.assign(current, args.p_patch);
    return { stale, call: structuredClone(current) };
  };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('una llamada sin autor exige edit_any; view_all solo permite lectura', async () => {
  expect((await GET(request({}), params)).status).toBe(403);
  permissions.add('crm.calls.view_all');
  expect((await GET(request({}), params)).status).toBe(200);
  expect((await PATCH(request({ live_note: 'Nota' }), params)).status).toBe(403);
  expect(db.rows('calls')[0].metadata).toEqual({});
  permissions.add('crm.activities.edit_any');
  expect((await PATCH(request({ live_note: 'Nota' }), params)).status).toBe(200);
  expect(db.rows('calls')[0].metadata).toEqual({ live_note: 'Nota' });
});

it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('%s ajena devuelve JSON403 tanto en body como en query', async (key) => {
  for (const req of [request({ live_note: 'Nota', [key]: 8 }), request({ live_note: 'Nota' }, `?${key}=8`)]) {
    const response = await PATCH(req, params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: 'FOREIGN_ORGANIZATION' });
  }
  expect(db.calls.filter((q) => q.op === 'update')).toHaveLength(0);
});

it('solo el dueño puede guardar sin edit_any y las claves desconocidas devuelven400', async () => {
  db.rows('calls')[0].user_id = 'usuario';
  expect((await PATCH(request({ live_note: 'Nota', metadata: { settled_at: 'inventado' } }), params)).status).toBe(400);
  expect((await PATCH(request({ live_note: 'Nota' }), params)).status).toBe(200);
});


it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('%s propia conserva compatibilidad de la petición', async (key) => {
  db.rows('calls')[0].user_id = 'usuario';
  expect((await PATCH(request({ live_note: 'Nota propia', [key]: 7 }), params)).status).toBe(200);
});

it('si la llamada cambia de dueño durante el CAS, vuelve a comprobar autoría y devuelve403', async () => {
  const { getServiceClient } = await import('@/lib/supabase/server-service');
  db.rows('calls')[0].user_id = 'usuario';
  const client = db.client();
  const rpc = client.rpc.bind(client);
  let transferred = false;
  // Frontera del doble: estas rutas sólo await RPC, no usan su filter builder.
  client.rpc = (async (name: string, args?: Record<string, unknown>) => {
    if (name === 'fn_crm_callback_llamada' && !transferred) {
      transferred = true; db.rows('calls')[0].user_id = 'otro';
    }
    return rpc(name, args);
  }) as unknown as typeof client.rpc;
  jest.mocked(getServiceClient).mockReturnValueOnce(client);
  expect((await PATCH(request({ live_note: 'No debe guardarse' }), params)).status).toBe(403);
  expect(db.rows('calls')[0].metadata).toEqual({});
  expect(db.rpcCalls.filter((row) => row.name === 'fn_crm_callback_llamada')).toHaveLength(1);
});

it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('GET valida %s de query antes de consultar y acepta el alias propio', async (key) => {
  const response = await GET(request({}, `?${key}=8`), params);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
  expect(db.calls).toHaveLength(0);
  db.rows('calls')[0].user_id = 'usuario';
  expect((await GET(request({}, `?${key}=7`), params)).status).toBe(200);
});

it.each([GET, PATCH])('rechaza UUID inválido antes de leer el servicio', async (handler) => {
  const { getServiceClient } = await import('@/lib/supabase/server-service');
  jest.mocked(getServiceClient).mockClear();
  expect((await handler(request({ live_note: 'Nota' }), { params: Promise.resolve({ id: 'invalido' }) })).status).toBe(400);
  expect(getServiceClient).not.toHaveBeenCalled();
  expect(db.calls).toHaveLength(0);
});

it('GET propaga un error de consentimiento y nunca devuelve éxito con datos vacíos', async () => {
  db.rows('calls')[0].user_id = 'usuario';
  db.failOn['call_consents:select'] = 'lectura fallida';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  expect((await GET(request({}), params)).status).toBe(500);
});
