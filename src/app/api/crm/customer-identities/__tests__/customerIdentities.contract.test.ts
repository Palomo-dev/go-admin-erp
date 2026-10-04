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
}));
import { GET } from '../route';
import { PATCH, DELETE } from '../[id]/route';
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/crm/customer-identities', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => {
  allowed = true;
  db = makeDb({
    customer_channel_identities: [
      {
        id: U(1),
        organization_id: ORG,
        identity_value: '123',
        verified: false,
      },
      {
        id: U(2),
        organization_id: OTRA,
        identity_value: '456',
        verified: false,
      },
    ],
  });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it('lee solo identidades reales de la sesión', async () => {
  const result = await GET(req('GET'));
  expect(result.status).toBe(200);
  expect((await result.json()).data.map((r: { id: string }) => r.id)).toEqual([
    U(1),
  ]);
});
it('403 sin permisos en cada operación', async () => {
  allowed = false;
  expect((await GET(req('GET'))).status).toBe(403);
  expect(
    (await PATCH(req('PATCH', { verified: true }), params(U(1)))).status,
  ).toBe(403);
  expect((await DELETE(req('DELETE', {}), params(U(1)))).status).toBe(403);
  expect(db.writes).toEqual([]);
});
it('404 para editar o borrar el id de otra organización', async () => {
  expect(
    (await PATCH(req('PATCH', { verified: true }), params(U(2)))).status,
  ).toBe(404);
  expect((await DELETE(req('DELETE', {}), params(U(2)))).status).toBe(404);
  expect(
    db.t.customer_channel_identities.find((r) => r.id === U(2))?.verified,
  ).toBe(false);
});
it('403 para organización ajena en body', async () => {
  expect(
    (
      await PATCH(
        req('PATCH', { organization_id: OTRA, verified: true }),
        params(U(1)),
      )
    ).status,
  ).toBe(403);
  expect(db.writes).toEqual([]);
});
it('no acepta ids virtuales ni campos de pertenencia', async () => {
  expect(
    (await PATCH(req('PATCH', { verified: true }), params(`email_${U(1)}`)))
      .status,
  ).toBe(400);
  expect(
    (await PATCH(req('PATCH', { customer_id: U(99) }), params(U(1)))).status,
  ).toBe(400);
  expect(db.writes).toEqual([]);
});
it('verifica, modifica y elimina mediante rutas del servidor', async () => {
  expect(
    (
      await PATCH(
        req('PATCH', { verified: true, identity_value: '321' }),
        params(U(1)),
      )
    ).status,
  ).toBe(200);
  expect(db.t.customer_channel_identities[0].verified).toBe(true);
  expect(db.t.customer_channel_identities[0].identity_value).toBe('321');
  expect((await DELETE(req('DELETE', {}), params(U(1)))).status).toBe(200);
  expect(db.t.customer_channel_identities.map((r) => r.id)).toEqual([U(2)]);
});
