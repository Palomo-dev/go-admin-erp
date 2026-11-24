/// <reference types="jest" />
/**
 * Contrato de lo que añadió el rediseño de Partners (Figma 2026-11-15, zona F):
 * - GET /api/crm/partners trae `revenue_attributed` (oportunidades ganadas de
 *   deals no rechazados);
 * - GET /api/crm/partners/deals: deals de TODA la organización de la sesión,
 *   con partner y oportunidad; 403 si la query trae otra organización;
 * - POST /[id]/deals con `commission_amount`: solo admin/manager lo ajusta
 *   (de 0 al monto de la oportunidad, con quién y cuándo); a otro rol se le
 *   ignora y manda la calculada.
 * Doble de Supabase con filtros reales (`f12Fake.ts`), organización 120 y señuelos de la 121.
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

import { GET as listGet } from '../route';
import { GET as orgDealsGet } from '../deals/route';
import { POST as dealsPost } from '../[id]/deals/route';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as any;
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

beforeEach(() => {
  db = makeDb(seed());
  session.roleId = 4;
  session.isSuperAdmin = false;
  session.roleName = 'Empleado';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/partners — revenue atribuido', () => {
  it('suma solo oportunidades ganadas de deals no rechazados', async () => {
    const { body } = await json(await listGet());
    const carlos = (body.data as Array<Record<string, unknown>>).find((r) => r.id === U(70))!;
    // U(80) → oportunidad abierta (no suma); U(81) → ganada 250.000,5.
    expect(carlos.revenue_attributed).toBe(250000.5);
    db.tables.partner_deals.find((d) => d.id === U(81))!.commission_status = 'rejected';
    const otra = await json(await listGet());
    expect((otra.body.data as Array<Record<string, unknown>>).find((r) => r.id === U(70))!.revenue_attributed).toBe(0);
  });
});

describe('GET /api/crm/partners/deals', () => {
  it('solo los de la organización de la sesión, con partner y oportunidad; can_manage del servidor', async () => {
    const { status, body } = await json(await orgDealsGet(req('/api/crm/partners/deals')));
    expect(status).toBe(200);
    const rows = body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id).sort()).toEqual([U(80), U(81)].sort());
    expect(rows.find((r) => r.id === U(81))).toMatchObject({ partner: { id: U(70), name: 'Carlos Consultor' }, opportunity: { id: U(31), status: 'won' } });
    expect(body.can_manage).toBe(false);
    // Sin gestión, los montos de comisión no salen del servidor (anotación 1411:43453).
    expect(rows.every((r) => r.commission_amount === null)).toBe(true);
    session.roleId = 2;
    const admin = await json(await orgDealsGet(req('/api/crm/partners/deals')));
    expect(admin.body.can_manage).toBe(true);
    expect((admin.body.data as Array<Record<string, unknown>>).find((r) => r.id === U(81))!.commission_amount).toBe(31250.06);
  });
  it('403 si la query trae otra organización', async () => {
    expect((await orgDealsGet(req(`/api/crm/partners/deals?organization_id=${OTHER}`))).status).toBe(403);
  });
});

describe('POST /api/crm/partners/[id]/deals — comisión ajustada', () => {
  const nuevo = (body: Record<string, unknown>) => dealsPost(req(`/api/crm/partners/${U(71)}/deals`, 'POST', body), params({ id: U(71) }));

  it('Empleado: el monto del body se ignora; manda la calculada y no hay rastro de ajuste', async () => {
    const { status, body } = await json(await nuevo({ opportunity_id: U(31), deal_type: 'referral', commission_amount: 1 }));
    expect(status).toBe(201);
    const deal = (body.data as Record<string, unknown>).deal as Record<string, unknown>;
    expect(deal).toMatchObject({ commission_amount: 25000.05, commission_suggested: 25000.05, commission_adjusted_by: null, commission_adjusted_at: null });
  });

  it('Manager: ajusta la comisión y queda quién (usuario de la sesión, nunca del body) y cuándo', async () => {
    session.roleId = 5;
    const { status, body } = await json(await nuevo({ opportunity_id: U(31), deal_type: 'co_sell', commission_amount: 20000, commission_adjusted_by: 'otro' }));
    expect(status).toBe(201);
    const deal = (body.data as Record<string, unknown>).deal as Record<string, unknown>;
    expect(deal).toMatchObject({ commission_amount: 20000, commission_suggested: 25000.05, commission_adjusted_by: 'u-1', commission_status: 'pending' });
    expect(new Date(deal.commission_adjusted_at as string).toISOString()).toBe(deal.commission_adjusted_at);
  });

  it('Manager: igual a la sugerida no cuenta como ajuste', async () => {
    session.roleId = 5;
    const { body } = await json(await nuevo({ opportunity_id: U(31), deal_type: 'referral', commission_amount: 25000.05 }));
    expect(((body.data as Record<string, unknown>).deal as Record<string, unknown>).commission_adjusted_by).toBeNull();
  });

  it('Manager: fuera de rango o no numérica → 400 y nada se escribe', async () => {
    session.roleId = 5;
    const alto = await json(await nuevo({ opportunity_id: U(31), deal_type: 'referral', commission_amount: 250001 }));
    expect(alto.status).toBe(400);
    expect(alto.body.code).toBe('COMMISSION_OUT_OF_RANGE');
    expect((await nuevo({ opportunity_id: U(31), deal_type: 'referral', commission_amount: -1 })).status).toBe(400);
    const texto = await json(await nuevo({ opportunity_id: U(31), deal_type: 'referral', commission_amount: 'mucho' }));
    expect(texto.status).toBe(400);
    expect(db.writes.filter((w) => w.table === 'partner_deals')).toEqual([]);
  });
});
