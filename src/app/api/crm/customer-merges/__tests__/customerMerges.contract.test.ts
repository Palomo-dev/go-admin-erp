/// <reference types="jest" />
const { OrgContextError: RealOrgContextError } = jest.requireActual<
  typeof import('@/lib/utils/orgContextError')
>('@/lib/utils/orgContextError');
import { NextRequest } from 'next/server';
import {
  fakeSupabase,
  makeDb,
  ORG,
  OTRA,
  U,
  YO,
  type Ola1Db,
} from '../../__tests__/ola1Fake';

let db: Ola1Db;
let allowed: boolean;
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: ORG,
    userId: YO,
    roleId: 4,
    isSuperAdmin: false,
    supabase: fakeSupabase(db),
  })),
  hasOrgAdminOrPermission: jest.fn(async () => allowed),
  requireOrgAdmin: jest.fn(),
}));
import { GET, POST } from '../route';
import { POST as undo } from '../[id]/undo/route';
import { validarFusion } from '@/lib/services/crm/customerMergeService';
const body = { primary_customer_id: U(10), secondary_customer_ids: [U(11)] };
const req = (path: string, data?: unknown) =>
  new NextRequest(`http://localhost/api/crm/customer-merges${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
beforeEach(() => {
  allowed = true;
  db = makeDb({
    customer_merges: [
      { id: U(1), organization_id: ORG, merged_at: '2026-09-30T12:00:00Z' },
      { id: U(2), organization_id: OTRA, merged_at: '2026-09-30T13:00:00Z' },
    ],
  });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('historial limitado a la organización autenticada', async () => {
  const result = await GET(req(''));
  const json = await result.json();
  expect(result.status).toBe(200);
  expect(json.data.map((r: { id: string }) => r.id)).toEqual([U(1)]);
});
it('403 sin permiso antes de escribir o leer', async () => {
  allowed = false;
  expect((await POST(req('', body))).status).toBe(403);
  expect((await GET(req(''))).status).toBe(403);
  expect(
    (
      await undo(req(`/${U(1)}/undo`, {}), {
        params: Promise.resolve({ id: U(1) }),
      })
    ).status,
  ).toBe(403);
  expect(db.rpcCalls).toEqual([]);
});
it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])(
  '403 para %s ajena sin RPC',
  async (key) => {
    expect((await POST(req('', { ...body, [key]: OTRA }))).status).toBe(403);
    expect(db.rpcCalls).toEqual([]);
  },
);
it('rechaza también organización ajena en query de lecturas', async () => {
  expect((await GET(req(`?organization_id=${OTRA}`))).status).toBe(403);
});
it('una única RPC, org de sesión y campos validados', async () => {
  db.rpc.crm_merge_customers = {
    data: { id: U(30), primary_customer_id: U(10) },
  };
  expect(
    (await POST(req('', { ...body, choices: { email: U(11) } }))).status,
  ).toBe(201);
  expect(db.rpcCalls).toEqual([
    {
      fn: 'crm_merge_customers',
      args: {
        p_org: ORG,
        p_primary: U(10),
        p_secondaries: [U(11)],
        p_choices: { email: U(11) },
      },
    },
  ]);
  expect(db.writes).toEqual([]);
});
it.each([
  { ...body, secondary_customer_ids: [U(10)] },
  { ...body, secondary_customer_ids: [U(11), U(12)] },
  { ...body, choices: { full_name: U(11) } },
  { ...body, choices: { email: U(99) } },
])(
  'no admite ids repetidos, fusiones múltiples ni columnas generadas',
  (value) => {
    expect(() => validarFusion(value)).toThrow();
  },
);
it.each([
  ['P0002', 404],
  ['42501', 403],
  ['40001', 409],
  ['23505', 409],
  ['P0001', 409],
])('propaga %s sin falso éxito', async (code, status) => {
  db.rpc.crm_merge_customers = {
    error: { code: String(code), message: 'registro_cambio' },
  };
  expect((await POST(req('', body))).status).toBe(status);
});
it('deshacer usa la misma sesión y devuelve 404 para fusión ajena', async () => {
  db.rpc.crm_unmerge_customer = {
    error: { code: 'P0002', message: 'fusion_no_encontrada' },
  };
  expect(
    (
      await undo(req(`/${U(1)}/undo`, {}), {
        params: Promise.resolve({ id: U(1) }),
      })
    ).status,
  ).toBe(404);
  expect(db.rpcCalls[0].args).toEqual({ p_org: ORG, p_merge: U(1) });
});
