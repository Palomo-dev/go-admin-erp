import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

const CALL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const KEY = '11111111-1111-4111-8111-111111111111';
let db: FakeDb;
let canManage = true;
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 7, userId: 'vendedor', roleId: 3,
    isSuperAdmin: false, supabase: db.client() })),
  hasOrgAdminOrPermission: jest.fn(async () => canManage),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

import { POST } from '../link/route';
import { getServiceClient } from '@/lib/supabase/server-service';

function request(body: object) {
  return new NextRequest(`https://crm.test/api/crm/calls/${CALL}/link`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: CALL }) };
beforeEach(() => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  canManage = true;
  jest.clearAllMocks();
  db = new FakeDb({ tables: { calls: [{ id: CALL, organization_id: 7, user_id: 'otro' }] },
    rpc: { fn_crm_vincular_llamada: () => ({ call: { id: CALL, organization_id: 7, customer_id: CUSTOMER, opportunity_id: null } }) } });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; jest.restoreAllMocks(); });

it('vincula por una RPC de sesión y nunca abre service role ni hace writers posteriores', async () => {
  const response = await POST(request({ customer_id: CUSTOMER, idempotency_key: KEY }), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { customer_id: CUSTOMER, opportunity_id: null } });
  expect(db.rpcCalls).toEqual([{ name: 'fn_crm_vincular_llamada', args: {
    p_org: 7, p_call: CALL, p_key: KEY, p_payload: { customer_id: CUSTOMER },
  } }]);
  expect(getServiceClient).not.toHaveBeenCalled();
  expect(db.calls.every((entry) => entry.op === 'select')).toBe(true);
});

it('crear cliente prepara el mismo payload de leads y conserva la clave para el reintento', async () => {
  const body = { create_customer: { first_name: ' Cliente ', last_name: ' Sintético ', phone: ' +573001112233 ' }, idempotency_key: KEY };
  expect((await POST(request(body), params)).status).toBe(200);
  expect((await POST(request(body), params)).status).toBe(200);
  expect(db.rpcCalls[0]).toEqual(db.rpcCalls[1]);
  expect(db.rpcCalls[0].args.p_payload).toEqual({ create_customer: {
    branch_id: null, first_name: 'Cliente', last_name: 'Sintético', email: null,
    phone: '+573001112233', company_name: null, customer_type: 'person', lifecycle_stage: 'lead',
  } });
  expect(db.calls.filter((entry) => entry.op !== 'select')).toHaveLength(0);
});

it('sin clave una creación se rechaza antes de la RPC', async () => {
  const response = await POST(request({ create_customer: { first_name: 'Cliente', phone: '+573001112233' } }), params);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'intencion_obligatoria' });
  expect(db.rpcCalls).toHaveLength(0);
});

it('UUID mayúsculo conserva la identidad de la llamada canónica', async () => {
  const response = await POST(request({ customer_id: CUSTOMER, idempotency_key: KEY }), { params: Promise.resolve({ id: CALL.toUpperCase() }) });
  expect(response.status).toBe(200);
  expect(db.rpcCalls[0].args.p_call).toBe(CALL);
});

it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('rechaza %s ajena y excluye alias propio del payload RPC', async (alias) => {
  expect((await POST(request({ customer_id: CUSTOMER, [alias]: 8 }), params)).status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
  expect((await POST(request({ customer_id: CUSTOMER, [alias]: 7 }), params)).status).toBe(200);
  expect(db.rpcCalls[0].args.p_payload).toEqual({ customer_id: CUSTOMER });
});

it('una edición de llamada ajena se deniega antes de la RPC', async () => {
  canManage = false;
  const response = await POST(request({ customer_id: CUSTOMER }), params);
  expect(response.status).toBe(403);
  expect(db.rpcCalls).toHaveLength(0);
});

it('el fallo SQL no deja una respuesta de éxito ni escritores compensatorios', async () => {
  db.rpcImpl.fn_crm_vincular_llamada = () => { throw new Error('write failed'); };
  const response = await POST(request({ customer_id: CUSTOMER, idempotency_key: KEY }), params);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
  expect(db.calls.filter((entry) => entry.op !== 'select')).toHaveLength(0);
});
