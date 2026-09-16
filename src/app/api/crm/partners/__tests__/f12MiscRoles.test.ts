/// <reference types="jest" />
/**
 * F12-misc (sprint de deuda) — hallazgo 2 del tester de F12: PATCH de partner,
 * PATCH de tier y DELETE de programa de referidos solo exigían pertenencia.
 * Ahora exigen el mismo conjunto de ids de rol que el DELETE de partner
 * (`requirePartnerManager` → `STAGE_MANAGER_ROLE_IDS`, regla dura 6: por id
 * resuelto en servidor, nunca por nombre). Organización 120 con señuelos de
 * la 121 (`f12Fake.ts`). Orden de las guardas: organización ajena → rol →
 * validación, igual que en el DELETE de partner.
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '../../referrals/__tests__/f12Fake';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

let db: FakeDb;
const session = { roleId: 4, isSuperAdmin: false, roleName: 'Empleado' };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: session.roleName, isSuperAdmin: session.isSuperAdmin, supabase: fakeSupabase(db) })),
}));

import { PATCH as partnerPatch } from '../[id]/route';
import { PATCH as tierPatch } from '../tiers/[id]/route';
import { DELETE as programDelete } from '../../referrals/programs/[id]/route';
import { STAGE_MANAGER_ROLE_IDS } from '@/lib/services/crm/stagePermissions';

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

/** Las tres llamadas bajo prueba, con un body válido y un id propio de la org 120. */
const calls = {
  'PATCH partners/[id]': (body: Record<string, unknown> = { name: 'Carlos editado' }) => partnerPatch(req(`/api/crm/partners/${U(70)}`, 'PATCH', body), params(U(70))),
  'PATCH partners/tiers/[id]': (body: Record<string, unknown> = { commission_rate: 16 }) => tierPatch(req(`/api/crm/partners/tiers/${U(61)}`, 'PATCH', body), params(U(61))),
  'DELETE referrals/programs/[id]': (body?: Record<string, unknown>) => programDelete(req(`/api/crm/referrals/programs/${U(11)}`, 'DELETE', body), params(U(11))),
} as const;

beforeEach(() => {
  db = makeDb(seed());
  session.roleId = 4;
  session.isSuperAdmin = false;
  session.roleName = 'Empleado';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe.each(Object.entries(calls))('%s exige admin/manager por id de rol', (_name, call) => {
  it('Empleado (4) -> 403 MANAGER_REQUIRED, con registro y sin escribir, aunque su rol se llame «Administrador»', async () => {
    session.roleId = 4;
    session.roleName = 'Administrador';
    const { status, body } = await json(await call());
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(console.warn).toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });
  it('rol fuera de la lista (99) -> 403', async () => {
    session.roleId = 99;
    expect((await call()).status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });
  it('Manager (5) -> 200 y escribe acotado a la organización', async () => {
    session.roleId = 5;
    const { status } = await json(await call());
    expect(status).toBe(200);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
  it('Admin (2) -> 200', async () => {
    session.roleId = 2;
    expect((await call()).status).toBe(200);
  });
  it('superadmin con rol 4 -> 200 (la bandera se resuelve en servidor)', async () => {
    session.roleId = 4;
    session.isSuperAdmin = true;
    expect((await call()).status).toBe(200);
  });
  it('organización ajena en el body -> 403 FOREIGN_ORGANIZATION antes del rol, incluso para un manager', async () => {
    session.roleId = 5;
    const { status, body } = await json(await call({ organization_id: OTHER, name: 'Z', commission_rate: 1 }));
    expect(status).toBe(403);
    expect(body.code).toBe('FOREIGN_ORGANIZATION');
    expect(db.writes).toHaveLength(0);
  });
  it('Empleado con organización ajena en el body -> 403 FOREIGN_ORGANIZATION (la organización se comprueba antes que el rol)', async () => {
    session.roleId = 4;
    const { status, body } = await json(await call({ organization_id: OTHER, name: 'Z', commission_rate: 1 }));
    expect(status).toBe(403);
    expect(body.code).toBe('FOREIGN_ORGANIZATION');
  });
  it('la misma organización en el body no es un ataque (manager -> 200)', async () => {
    session.roleId = 5;
    expect((await call({ organization_id: ORG, name: 'Carlos editado', commission_rate: 16 })).status).toBe(200);
  });
});

describe('DELETE referrals/programs/[id] — organización ajena en la query', () => {
  it('?organization_id=121 -> 403 FOREIGN_ORGANIZATION aunque sea manager; el programa sigue', async () => {
    session.roleId = 5;
    const res = await programDelete(req(`/api/crm/referrals/programs/${U(11)}?organization_id=${OTHER}`, 'DELETE'), params(U(11)));
    expect(res.status).toBe(403);
    expect(db.tables.referral_programs.some((p) => p.id === U(11))).toBe(true);
  });
});

describe('la lista de roles es la misma constante que usa el DELETE de partner', () => {
  it('STAGE_MANAGER_ROLE_IDS contiene 2 y 5 y no 4', () => {
    expect(STAGE_MANAGER_ROLE_IDS).toEqual(expect.arrayContaining([2, 5]));
    expect(STAGE_MANAGER_ROLE_IDS).not.toContain(4);
  });
});
