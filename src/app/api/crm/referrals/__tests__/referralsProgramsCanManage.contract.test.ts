/// <reference types="jest" />
/**
 * F12-misc — `GET /api/crm/referrals/programs` no devolvía `can_manage`
 * (`TierEditor`/`ReferralProgramsSheet` mostraban crear/editar/borrar a todo
 * miembro aunque el POST/PATCH/DELETE ya exigen admin/manager por id de rol,
 * `requirePartnerManager`). Ahora lo calcula `canManagePartners` — la misma
 * función que usa el GET de partners (regla dura 7).
 *
 * Archivo aparte de `referrals.contract.test.ts` (ese ya iba en 311 líneas,
 * por encima del límite de 300: no se agranda, se extrae lo mínimo). Mismo
 * doble de organización y Supabase que el resto de F12 (`f12Fake.ts`).
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, type FakeDb } from './f12Fake';

class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'X') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let db: FakeDb;
const session = { roleId: 4, isSuperAdmin: false };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: 'Empleado', isSuperAdmin: session.isSuperAdmin, supabase: fakeSupabase(db) })),
}));

import { GET as programsGet } from '../programs/route';

const req = (url: string) => new NextRequest(`http://localhost${url}`);
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

beforeEach(() => {
  db = makeDb(seed());
  session.roleId = 4;
  session.isSuperAdmin = false;
});

describe('GET /api/crm/referrals/programs: `can_manage`', () => {
  it('Empleado (rol 4) -> false', async () => {
    session.roleId = 4;
    const { status, body } = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect(status).toBe(200);
    expect(body.can_manage).toBe(false);
  });
  it('Manager (rol 5) -> true', async () => {
    session.roleId = 5;
    const { body } = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect(body.can_manage).toBe(true);
  });
  it('Admin de organización (rol 2) -> true', async () => {
    session.roleId = 2;
    const { body } = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect(body.can_manage).toBe(true);
  });
  it('super admin (cualquier rol) -> true', async () => {
    session.roleId = 4;
    session.isSuperAdmin = true;
    const { body } = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect(body.can_manage).toBe(true);
  });
});
