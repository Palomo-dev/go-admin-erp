/// <reference types="jest" />
/**
 * Deuda C de F0-SEC en F10–F13 (2026-09-16): los envoltorios
 * `rejectForeignOrganization` (F12/F13) y `foreignOrgResponse` (F10) son azúcar
 * sobre el punto único `readOrgBody`, así que una organización ajena en la
 * QUERY STRING o bajo un ALIAS del body (`organizationId`, `orgId`, `org_id`)
 * también da 403 registrado, y nada se escribe.
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '../../referrals/__tests__/f12Fake';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

let db: FakeDb;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: 5, roleName: 'Manager', isSuperAdmin: false, supabase: fakeSupabase(db) })),
}));

import { POST as partnersPost } from '../route';
import { PATCH as tierPatch } from '../tiers/[id]/route';
import { POST as programsPost } from '../../referrals/programs/route';
import { GET as referralsGet } from '../../referrals/route';

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db = makeDb(seed());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const ALIASES = ['organizationId', 'orgId', 'org_id'] as const;

describe('organización ajena en la query string → 403 y nada se escribe', () => {
  it('POST partners', async () => {
    const res = await partnersPost(req(`/api/crm/partners?organization_id=${OTHER}`, 'POST', { name: 'X', email: 'x@example.com' }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('(query)'), expect.objectContaining({ session: ORG }));
  });
  it('PATCH partners/tiers/[id]', async () => {
    const res = await tierPatch(req(`/api/crm/partners/tiers/${U(61)}?organization_id=${OTHER}`, 'PATCH', { commission_rate: 16 }), params(U(61)));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('POST referrals/programs', async () => {
    const res = await programsPost(req(`/api/crm/referrals/programs?orgId=${OTHER}`, 'POST', { name: 'P', reward_type: 'credit', reward_amount: 1, reward_to: 'referrer' }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('GET referrals (solo query) con alias', async () => {
    const res = await referralsGet(req(`/api/crm/referrals?org_id=${OTHER}`, 'GET'));
    expect(res.status).toBe(403);
  });
});

describe('alias de organización en el body → 403 y nada se escribe', () => {
  it.each(ALIASES)('POST partners con %s ajeno', async (key) => {
    const res = await partnersPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x@example.com', [key]: OTHER }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('la propia organización bajo alias no molesta', async () => {
    const res = await partnersPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x@example.com', organizationId: ORG }));
    expect(res.status).toBe(201);
  });
});
