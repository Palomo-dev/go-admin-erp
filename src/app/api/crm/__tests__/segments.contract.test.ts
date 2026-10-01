const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
import { fakeSupabase, makeDb, ORG, OTRA, U, YO, type Ola1Db } from './ola1Fake';
let db: Ola1Db, serviceDb: Ola1Db, permissions: Set<string>;
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => {
    const sb = fakeSupabase(db);
    const rpc = sb.rpc;
    // El doble admite la cancelación de PostgREST; conserva datos/errores y llamadas registrados.
    sb.rpc = ((...args: Parameters<typeof rpc>) => {
      const promise = rpc(...args);
      return Object.assign(promise, { abortSignal: () => promise });
    }) as typeof rpc;
    return { organizationId: ORG, userId: YO, roleId: 4, isSuperAdmin: false, supabase: sb };
  }),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permissions.has(code)),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeSupabase(serviceDb) }));
import { NextRequest } from 'next/server';
import { GET, POST } from '../segments/route';
import { POST as PREVIEW } from '../segments/preview/route';
import { GET as DETAIL, PATCH, DELETE } from '../segments/[id]/route';
import { POST as DUPLICATE } from '../segments/[id]/duplicate/route';
const req = (url: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost${url}`, { method,
  headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id = U(10)) => ({ params: Promise.resolve({ id }) });
const segment = () => ({ id: U(10), organization_id: ORG, name: 'Fixture segmento', filter_json: [], is_dynamic: false,
  updated_at: '2026-10-01T00:00:00Z', members_snapshotted_at: '2026-10-01T00:00:00Z' });
beforeEach(() => { db = makeDb({ segments: [segment()] }); serviceDb = makeDb(); permissions = new Set(['crm.customers.view', 'crm.segments.manage']); });
test.each(['?organization_id=121', '?orgId=121'])('listar rechaza organización ajena en query %s', async suffix => {
  expect((await GET(req(`/api/crm/segments${suffix}`))).status).toBe(403);
});
test('sin permiso de lectura devuelve 403, no una lista vacía', async () => {
  permissions.clear(); expect((await GET(req('/api/crm/segments'))).status).toBe(403);
});
test('segmento de otra organización devuelve 404', async () => {
  db.t.segments[0].organization_id = OTRA;
  expect((await DETAIL(req('/api/crm/segments/id'), params())).status).toBe(404);
});
test('vista previa devuelve conteo global y tres muestras, sin miembros ni ids completos', async () => {
  db.rpc.crm_segment_context_page = { data: Array.from({ length: 8 }, (_, i) => ({ id: U(i + 1), city: 'Fixture', consent: {} })) };
  const response = await PREVIEW(req('/api/crm/segments/preview', 'POST', { filter_json: [] }));
  expect(response.status).toBe(200); const json = await response.json();
  expect(json.data.counts.total).toBe(8); expect(json.data.samples).toHaveLength(3);
  expect(json.data.members).toBeUndefined(); expect(json.data.ids).toBeUndefined();
  expect(db.rpcCalls[0].args.p_org).toBe(ORG);
});
test('filtro no existente y body ajeno se rechazan antes de contar', async () => {
  expect((await PREVIEW(req('/api/crm/segments/preview', 'POST', { filter_json: [{ field: 'country', operator: 'equals', value: 'x' }] }))).status).toBe(400);
  expect((await PREVIEW(req('/api/crm/segments/preview', 'POST', { organization_id: OTRA, filter_json: [] }))).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});
test('la importación guarda actor y organización de sesión, no cifras aportadas por el navegador', async () => {
  serviceDb.rpc.crm_save_segment = { data: segment() };
  const response = await POST(req('/api/crm/segments', 'POST', { name: 'Fixture', is_dynamic: false, filter_json: [], member_ids: [U(1), U(2)] }));
  expect(response.status).toBe(201);
  expect(serviceDb.rpcCalls[0].args).toMatchObject({ p_org: ORG, p_actor: YO, p_count: 2, p_members: [U(1), U(2)] });
  expect((await POST(req('/api/crm/segments', 'POST', { name: 'Fixture', is_dynamic: false, filter_json: [], customer_count: 99999, member_ids: [U(1)] }))).status).toBe(400);
});
test('empleado sin gestionar no escribe aunque pueda leer', async () => {
  permissions.delete('crm.segments.manage');
  expect((await POST(req('/api/crm/segments', 'POST', { name: 'Fixture', is_dynamic: false, filter_json: [], member_ids: [U(1)] }))).status).toBe(403);
  expect(serviceDb.rpcCalls).toHaveLength(0);
});
test('edición conserva snapshot; SQLSTATE de versión vieja devuelve 409', async () => {
  serviceDb.rpc.crm_save_segment = { error: { code: '40001', message: 'registro_cambio' } };
  const response = await PATCH(req('/api/crm/segments/id', 'PATCH', { name: 'Fixture', is_dynamic: false, filter_json: [], expected_updated_at: '2026-09-30T00:00:00Z' }), params());
  expect(response.status).toBe(409); expect(serviceDb.rpcCalls[0].args.p_members).toBeNull();
});
test('borrar y copiar pasan por las RPC privadas; barrera SQL vuelve a negar al actor', async () => {
  serviceDb.rpc.crm_delete_segment = { data: null };
  expect((await DELETE(req('/api/crm/segments/id', 'DELETE', { expected_updated_at: segment().updated_at }), params())).status).toBe(200);
  expect(serviceDb.rpcCalls[0].args).toMatchObject({ p_org: ORG, p_actor: YO, p_id: U(10) });
  serviceDb.rpc.crm_duplicate_segment = { error: { code: '42501', message: 'sin_permiso' } };
  expect((await DUPLICATE(req('/api/crm/segments/id/duplicate', 'POST', { name: 'Fixture copia' }), params())).status).toBe(403);
});
