/// <reference types="jest" />
/**
 * F12 — contrato de `/api/crm/partners/**` con la organización doblada
 * (org 120) y señuelos de la 121. La comisión de partner es un REGISTRO
 * calculado en servidor; aprobar/pagar/rechazar y borrar exigen admin/manager
 * por id de rol. Doble de Supabase con filtros reales (`f12Fake.ts`).
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '../../referrals/__tests__/f12Fake';

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
/** Rol por defecto: Empleado (4). Los tests que necesitan jefatura ponen 5 (Manager) o 2 (Admin). */
const session = { roleId: 4, isSuperAdmin: false, roleName: 'Empleado' };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: session.roleName, isSuperAdmin: session.isSuperAdmin, supabase: fakeSupabase(db) })),
}));

import { GET as listGet, POST as listPost } from '../route';
import { GET as oneGet, PATCH as onePatch, DELETE as oneDelete } from '../[id]/route';
import { GET as dealsGet, POST as dealsPost } from '../[id]/deals/route';
import { PATCH as dealPatch } from '../[id]/deals/[dealId]/route';
import { GET as tiersGet, POST as tiersPost } from '../tiers/route';
import { PATCH as tierPatch, DELETE as tierDelete } from '../tiers/[id]/route';

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

describe('GET /api/crm/partners', () => {
  it('lista solo los de la organización con tier, tasa efectiva y resumen de comisiones', async () => {
    const { status, body } = await json(await listGet());
    expect(status).toBe(200);
    const rows = body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id).sort()).toEqual([U(70), U(71)].sort());
    const carlos = rows.find((r) => r.id === U(70))!;
    expect(carlos.tier).toEqual({ id: U(60), name: 'Bronce', commission_rate: 10 });
    expect(carlos.effective_rate).toBe(12.5);
    expect(carlos.deals_count).toBe(2);
    expect(carlos.commissions).toMatchObject({ pending: 125000, approved: 31250.06, paid: 0, outstanding: 156250.06 });
    expect(carlos.commissions_currency).toBe('COP');
    expect(carlos.currency_mixed).toBe(false);
    const hereda = rows.find((r) => r.id === U(71))!;
    expect(hereda.effective_rate).toBe(10);
    expect(hereda.deals_count).toBe(0);
    expect(hereda.commissions_currency).toBeNull();
  });
  it('deals en monedas distintas -> currency_mixed=true (la interfaz no suma)', async () => {
    db.tables.opportunities.find((o) => o.id === U(31))!.currency = 'USD';
    const { body } = await json(await listGet());
    const carlos = (body.data as Array<Record<string, unknown>>).find((r) => r.id === U(70))!;
    expect(carlos.currency_mixed).toBe(true);
    expect(carlos.commissions_currency).toBeNull();
  });
});

describe('POST /api/crm/partners', () => {
  // F12-misc r2: crear partners/tiers/programas exige admin/manager por id de rol (como PATCH/DELETE).
  it('403 MANAGER_REQUIRED para un Empleado (rol 4); nada se escribe', async () => {
    session.roleId = 4;
    const { status, body } = await json(await listPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x@example.com' })));
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(db.writes).toEqual([]);
  });
  it('400 sin nombre/correo o correo mal formado', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    expect((await listPost(req('/api/crm/partners', 'POST', {}))).status).toBe(400);
    expect((await listPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x' }))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  it('409 si el correo ya existe en la organización (sin distinguir mayúsculas); el de la 121 no cuenta', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    const dup = await json(await listPost(req('/api/crm/partners', 'POST', { name: 'Otro', email: 'CARLOS@example.com' })));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_EMAIL');
    expect(db.writes).toEqual([]);
    const other = await json(await listPost(req('/api/crm/partners', 'POST', { name: 'Otro', email: 'p121@example.com' })));
    expect(other.status).toBe(201);
  });
  it('404 si el tier es de otra organización', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    expect((await listPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x@y.co', tier_id: U(97) }))).status).toBe(404);
    expect(db.writes).toEqual([]);
  });
  it('403 y registro con organization_id ajeno', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    expect((await listPost(req('/api/crm/partners', 'POST', { name: 'X', email: 'x@y.co', organization_id: OTHER }))).status).toBe(403);
    expect(console.warn).toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
  it('201 en la organización de la sesión; sin tasa propia queda 0 (= hereda del tier)', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    const { status, body } = await json(await listPost(req('/api/crm/partners', 'POST', { name: ' Nueva ', email: ' NUEVA@example.com ', tier_id: U(61) })));
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ organization_id: ORG, name: 'Nueva', email: 'nueva@example.com', tier_id: U(61), commission_rate: 0, is_active: true });
  });
});

describe('/api/crm/partners/[id]', () => {
  it('GET/PATCH/DELETE de un partner ajeno -> 404 (PATCH y DELETE con rol manager)', async () => {
    expect((await oneGet(req(`/api/crm/partners/${U(98)}`), params({ id: U(98) }))).status).toBe(404);
    session.roleId = 5;
    expect((await onePatch(req(`/api/crm/partners/${U(98)}`, 'PATCH', { name: 'Z' }), params({ id: U(98) }))).status).toBe(404);
    expect((await oneDelete(req(`/api/crm/partners/${U(98)}`, 'DELETE'), params({ id: U(98) }))).status).toBe(404);
    expect(db.tables.partners.some((p) => p.id === U(98))).toBe(true);
  });
  it('PATCH con el correo de otro partner -> 409; con su propio correo -> 200 (rol manager)', async () => {
    session.roleId = 5; // F12-misc: PATCH exige admin/manager por id de rol, igual que DELETE.
    expect((await onePatch(req(`/api/crm/partners/${U(71)}`, 'PATCH', { email: 'carlos@example.com' }), params({ id: U(71) }))).status).toBe(409);
    const { status, body } = await json(await onePatch(req(`/api/crm/partners/${U(70)}`, 'PATCH', { email: 'carlos@example.com', commission_rate: 0 }), params({ id: U(70) })));
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).commission_rate).toBe(0);
    // Defensa en profundidad: la escritura misma va acotada a la organización, no solo la lectura previa.
    const w = db.writes.find((x) => x.table === 'partners' && x.op === 'update')!;
    expect(w.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
  it('PATCH con body vacío -> 400 (manager); organization_id ajeno -> 403; Empleado (4) -> 403 MANAGER_REQUIRED', async () => {
    session.roleId = 5;
    expect((await onePatch(req(`/api/crm/partners/${U(70)}`, 'PATCH', {}), params({ id: U(70) }))).status).toBe(400);
    expect((await onePatch(req(`/api/crm/partners/${U(70)}`, 'PATCH', { name: 'Z', organization_id: OTHER }), params({ id: U(70) }))).status).toBe(403);
    session.roleId = 4;
    const { status, body } = await json(await onePatch(req(`/api/crm/partners/${U(70)}`, 'PATCH', { name: 'Z' }), params({ id: U(70) })));
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(db.writes).toHaveLength(0);
  });
  it('DELETE exige admin/manager por id de rol: Empleado (4) -> 403 aunque su rol se llame Admin; Manager (5) -> 200', async () => {
    session.roleId = 4;
    session.roleName = 'Admin de organización';
    const { status, body } = await json(await oneDelete(req(`/api/crm/partners/${U(70)}`, 'DELETE'), params({ id: U(70) })));
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(db.tables.partners.some((p) => p.id === U(70))).toBe(true);
    session.roleId = 5;
    session.roleName = 'Empleado';
    expect((await oneDelete(req(`/api/crm/partners/${U(70)}`, 'DELETE'), params({ id: U(70) }))).status).toBe(200);
    expect(db.tables.partners.some((p) => p.id === U(70))).toBe(false);
  });
});

describe('/api/crm/partners/tiers', () => {
  it('POST con rol Empleado -> 403 MANAGER_REQUIRED sin escrituras', async () => {
    session.roleId = 4;
    expect((await tiersPost(req('/api/crm/partners/tiers', 'POST', { name: 'Z' }))).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it('GET solo los de la organización, ordenados por exigencia', async () => {
    const { body } = await json(await tiersGet());
    expect((body.data as Array<Record<string, unknown>>).map((t) => t.name)).toEqual(['Bronce', 'Plata', 'Oro']);
  });
  it('POST valida y responde 409 ante el UNIQUE (org, name)', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    expect((await tiersPost(req('/api/crm/partners/tiers', 'POST', { name: 'X', min_deals: -1 }))).status).toBe(400);
    db.errors['partner_tiers:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "partner_tiers_organization_id_name_key"' };
    expect((await tiersPost(req('/api/crm/partners/tiers', 'POST', { name: 'Oro' }))).status).toBe(409);
  });
  it('POST organization_id ajeno -> 403; válido -> 201 con beneficios recortados', async () => {
    session.roleId = 5; // F12-misc r2: crear exige admin/manager
    expect((await tiersPost(req('/api/crm/partners/tiers', 'POST', { name: 'Y', organization_id: OTHER }))).status).toBe(403);
    const { status, body } = await json(await tiersPost(req('/api/crm/partners/tiers', 'POST', { name: 'Platino', min_deals: '20', min_revenue: 100000000, commission_rate: 25, benefits: [' Cuenta dedicada ', ''] })));
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ organization_id: ORG, name: 'Platino', min_deals: 20, commission_rate: 25, benefits: ['Cuenta dedicada'] });
  });
  it('PATCH de un tier: Empleado (4) -> 403; manager: ajeno -> 404, propio -> 200', async () => {
    expect((await tierPatch(req(`/api/crm/partners/tiers/${U(61)}`, 'PATCH', { commission_rate: 16 }), params({ id: U(61) }))).status).toBe(403);
    session.roleId = 5; // F12-misc: PATCH de tier exige admin/manager por id de rol.
    expect((await tierPatch(req(`/api/crm/partners/tiers/${U(97)}`, 'PATCH', { commission_rate: 1 }), params({ id: U(97) }))).status).toBe(404);
    const { status, body } = await json(await tierPatch(req(`/api/crm/partners/tiers/${U(61)}`, 'PATCH', { commission_rate: 16 }), params({ id: U(61) })));
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).commission_rate).toBe(16);
  });
  it('DELETE de un tier: Empleado (4) -> 403; manager: en uso -> 409 TIER_IN_USE; libre -> 200; ajeno -> 404', async () => {
    // F12-misc (tester): DELETE exige el mismo rol que PATCH (un Empleado no podía editar un tier pero sí borrarlo).
    expect((await tierDelete(req(`/api/crm/partners/tiers/${U(62)}`, 'DELETE'), params({ id: U(62) }))).status).toBe(403);
    expect(db.tables.partner_tiers.some((t) => t.id === U(62))).toBe(true);
    session.roleId = 5;
    const used = await json(await tierDelete(req(`/api/crm/partners/tiers/${U(60)}`, 'DELETE'), params({ id: U(60) })));
    expect(used.status).toBe(409);
    expect(used.body.code).toBe('TIER_IN_USE');
    expect(db.tables.partner_tiers.some((t) => t.id === U(60))).toBe(true);
    expect((await tierDelete(req(`/api/crm/partners/tiers/${U(62)}`, 'DELETE'), params({ id: U(62) }))).status).toBe(200);
    expect((await tierDelete(req(`/api/crm/partners/tiers/${U(97)}`, 'DELETE'), params({ id: U(97) }))).status).toBe(404);
    expect(db.tables.partner_tiers.some((t) => t.id === U(97))).toBe(true);
  });
});

describe('/api/crm/partners/[id]/deals', () => {
  it('GET lista los deals del partner con la oportunidad resuelta; partner ajeno -> 404', async () => {
    const { status, body } = await json(await dealsGet(req(`/api/crm/partners/${U(70)}/deals`), params({ id: U(70) })));
    expect(status).toBe(200);
    const rows = body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id).sort()).toEqual([U(80), U(81)].sort());
    expect((rows.find((r) => r.id === U(80))!.opportunity as Record<string, unknown>).name).toBe('Oportunidad 1');
    expect((await dealsGet(req(`/api/crm/partners/${U(98)}/deals`), params({ id: U(98) }))).status).toBe(404);
  });
  it('POST: 400 con deal_type fuera del CHECK; 404 con oportunidad ajena; 404 con partner ajeno', async () => {
    expect((await dealsPost(req(`/api/crm/partners/${U(70)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'partner' }), params({ id: U(70) }))).status).toBe(400);
    expect((await dealsPost(req(`/api/crm/partners/${U(70)}/deals`, 'POST', { opportunity_id: U(94), deal_type: 'referral' }), params({ id: U(70) }))).status).toBe(404);
    expect((await dealsPost(req(`/api/crm/partners/${U(98)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'referral' }), params({ id: U(98) }))).status).toBe(404);
    expect(db.writes).toEqual([]);
  });
  it('POST: la comisión se calcula en servidor (monto x tasa del partner), nunca del body; nace pending', async () => {
    db.tables.partner_deals = db.tables.partner_deals.filter((d) => d.id !== U(81));
    const { status, body } = await json(await dealsPost(req(`/api/crm/partners/${U(70)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'co_sell', commission_amount: 999999, commission_status: 'paid' }), params({ id: U(70) })));
    expect(status).toBe(201);
    const data = body.data as Record<string, unknown>;
    expect(data.commission_rate).toBe(12.5);
    expect(data.deal as Record<string, unknown>).toMatchObject({ organization_id: ORG, partner_id: U(70), commission_amount: 31250.06, commission_status: 'pending', deal_type: 'co_sell' });
  });
  it('POST: partner con tasa 0 usa la del tier; y sube de tier al cumplir umbrales (Bronce -> Plata)', async () => {
    // Hereda Tier (Bronce, 10 %) registra 2 deals: 1.000.000 + 250.000,5 >= 1.000.000 y >= 2 deals => Plata.
    const first = await json(await dealsPost(req(`/api/crm/partners/${U(71)}/deals`, 'POST', { opportunity_id: U(30), deal_type: 'referral' }), params({ id: U(71) })));
    expect(first.status).toBe(201);
    expect((first.body.data as Record<string, unknown>).commission_rate).toBe(10);
    expect(((first.body.data as Record<string, unknown>).deal as Record<string, unknown>).commission_amount).toBe(100000);
    expect((first.body.data as Record<string, unknown>).promoted_to).toBeNull();
    const second = await json(await dealsPost(req(`/api/crm/partners/${U(71)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'reseller' }), params({ id: U(71) })));
    expect(second.status).toBe(201);
    expect((second.body.data as Record<string, unknown>).promoted_to).toEqual({ id: U(61), name: 'Plata', commission_rate: 15 });
    expect(db.tables.partners.find((p) => p.id === U(71))!.tier_id).toBe(U(61));
    const tierWrite = db.writes.find((w) => w.table === 'partners' && w.op === 'update')!;
    expect(tierWrite.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
  it('POST: nunca degrada (Oro con pocas cifras sigue en Oro)', async () => {
    db.tables.partners.find((p) => p.id === U(71))!.tier_id = U(62);
    const { body } = await json(await dealsPost(req(`/api/crm/partners/${U(71)}/deals`, 'POST', { opportunity_id: U(30), deal_type: 'referral' }), params({ id: U(71) })));
    expect((body.data as Record<string, unknown>).promoted_to).toBeNull();
    expect(db.tables.partners.find((p) => p.id === U(71))!.tier_id).toBe(U(62));
  });
  it('POST: la misma oportunidad dos veces para el mismo partner -> 409 DUPLICATE_DEAL', async () => {
    const { status, body } = await json(await dealsPost(req(`/api/crm/partners/${U(70)}/deals`, 'POST', { opportunity_id: U(30), deal_type: 'referral' }), params({ id: U(70) })));
    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE_DEAL');
  });
  it('POST organization_id ajeno -> 403', async () => {
    expect((await dealsPost(req(`/api/crm/partners/${U(70)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'referral', organization_id: OTHER }), params({ id: U(70) }))).status).toBe(403);
  });
});

describe('PATCH /api/crm/partners/[id]/deals/[dealId] (transición de comisión)', () => {
  const p = (id: string, dealId: string) => params({ id, dealId });
  it('Empleado (4) -> 403 MANAGER_REQUIRED aunque el body diga role=admin', async () => {
    const { status, body } = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'approved', role: 'admin', roleId: 2 }), p(U(70), U(80))));
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(db.writes).toEqual([]);
  });
  it('Manager (5): pending -> paid es 409 INVALID_TRANSITION; pending -> approved 200', async () => {
    session.roleId = 5;
    const bad = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'paid' }), p(U(70), U(80))));
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe('INVALID_TRANSITION');
    const ok = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'approved' }), p(U(70), U(80))));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ commission_status: 'approved', commission_paid_at: null });
  });
  it('Admin (2): approved -> paid fija commission_paid_at (ISO) con guarda optimista; concurrente -> 409', async () => {
    session.roleId = 2;
    const ok = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), p(U(70), U(81))));
    expect(ok.status).toBe(200);
    const row = ok.body.data as Record<string, unknown>;
    expect(row.commission_status).toBe('paid');
    expect(new Date(row.commission_paid_at as string).toISOString()).toBe(row.commission_paid_at);
    const w = db.writes.find((x) => x.op === 'update')!;
    expect(w.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }, { kind: 'eq', key: 'commission_status', value: 'approved' }]));
    // Segunda petición «pagar» sobre un deal ya pagado: terminal -> 409.
    const again = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), p(U(70), U(81))));
    expect(again.status).toBe(409);
  });
  it('carrera perdida (0 filas afectadas) -> 409 CONCURRENT_CHANGE', async () => {
    session.roleId = 5;
    db.updateAffectsNone = true;
    const { status, body } = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'approved' }), p(U(70), U(80))));
    expect(status).toBe(409);
    expect(body.code).toBe('CONCURRENT_CHANGE');
  });
  it('deal de otro partner o de otra organización -> 404; estado desconocido -> 400', async () => {
    session.roleId = 5;
    expect((await dealPatch(req(`/api/crm/partners/${U(71)}/deals/${U(80)}`, 'PATCH', { commission_status: 'approved' }), p(U(71), U(80)))).status).toBe(404);
    expect((await dealPatch(req(`/api/crm/partners/${U(98)}/deals/${U(99)}`, 'PATCH', { commission_status: 'approved' }), p(U(98), U(99)))).status).toBe(404);
    expect((await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'done' }), p(U(70), U(80)))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  it('organization_id ajeno en el body -> 403 antes del rol', async () => {
    session.roleId = 5;
    expect((await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { commission_status: 'approved', organization_id: OTHER }), p(U(70), U(80)))).status).toBe(403);
  });
});
