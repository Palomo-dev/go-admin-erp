import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '@/app/api/crm/referrals/__tests__/f12Fake';
const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
let db: FakeDb;
const permissions = new Set<string>();
const service = jest.fn(() => fakeSupabase(db));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => service() }));
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: U(100), roleId: 99, isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx, code = 'admin.full_access') => permissions.has(code)),
}));
import { POST as convert } from '@/app/api/crm/referrals/[id]/convert/route';
import { POST as register } from '@/app/api/crm/partners/[id]/deals/route';
import { POST as reward } from '@/app/api/crm/referrals/[id]/reward/route';
import { GET as partners } from '@/app/api/crm/partners/route';
import { GET as referrals } from '@/app/api/crm/referrals/route';
import { GET as partnerStats } from '@/app/api/crm/partners/stats/route';
import { GET as referralStats } from '@/app/api/crm/referrals/stats/route';

const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => { db = makeDb(seed()); permissions.clear(); service.mockClear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());
describe('red comercial: permiso canónico y preparación privada', () => {
  it.each([
    ['crm.leads.create', () => convert(req('/api/crm/referrals/x/convert', {}), params(U(21)))],
    ['crm.opportunities.edit', () => register(req('/api/crm/partners/x/deals', { opportunity_id: U(31), deal_type: 'referral' }), params(U(71)))],
  ])('sin %s no usa el escritor privilegiado', async (_permission, call) => {
    expect((await call()).status).toBe(403); expect(service).not.toHaveBeenCalled(); expect(db.writes).toEqual([]);
  });
  it.each(['organization_id', 'organizationId', 'org_id', 'orgId'])('organización ajena %s se rechaza antes de preparar', async key => {
    permissions.add('crm.leads.create'); permissions.add('crm.opportunities.edit');
    expect((await convert(req('/api/crm/referrals/x/convert', { [key]: OTHER }), params(U(21)))).status).toBe(403);
    expect((await register(req('/api/crm/partners/x/deals', { [key]: OTHER, opportunity_id: U(31), deal_type: 'referral' }), params(U(71)))).status).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });
  it('un cargo personalizado recibe capacidades desde permisos, sin depender de su nombre/id', async () => {
    permissions.add('crm.opportunities.edit');
    expect(await (await partners(req('/api/crm/partners'))).json()).toMatchObject({ can_register: true, can_manage: false });
    permissions.add('crm.leads.create'); permissions.add('admin.full_access');
    expect(await (await referrals(req('/api/crm/referrals'))).json()).toMatchObject({ can_register: true, can_manage: true });
  });
  it('recompensa requiere administración antes de modificar datos', async () => {
    expect((await reward(req('/api/crm/referrals/x/reward', {}), params(U(22)))).status).toBe(403);
    expect(db.writes).toEqual([]); permissions.add('admin.full_access');
    expect((await reward(req('/api/crm/referrals/x/reward', {}), params(U(22)))).status).toBe(200);
  });
  it('el cliente conserva preparación nativa y el ajuste de comisión exige administración', async () => {
    permissions.add('crm.leads.create'); permissions.add('crm.opportunities.edit');
    const referral = await convert(req('/api/crm/referrals/x/convert', { lead_score: 100, owner_id: U(999), lead_source: 'manual' }), params(U(21)));
    expect(referral.status).toBe(201);
    const customer = db.tables.customers.at(-1)!; expect(customer.lead_source).toBe('referral'); expect(customer.lead_score).not.toBe(100); expect(customer.owner_id).not.toBe(U(999));
    const beforeDeals = structuredClone(db.tables.partner_deals);
    const beforeWrites = db.writes.length;
    service.mockClear();
    const adjusted = await register(req('/api/crm/partners/x/deals', { opportunity_id: U(30), deal_type: 'referral', idempotency_key: U(900), commission_amount: 999999999, tier_id: U(62), commission_status: 'paid' }), params(U(71)));
    expect(adjusted.status).toBe(403);
    expect(service).not.toHaveBeenCalled();
    expect(db.tables.partner_deals).toEqual(beforeDeals);
    expect(db.writes).toHaveLength(beforeWrites);
    const deal = await register(req('/api/crm/partners/x/deals', { opportunity_id: U(30), deal_type: 'referral', tier_id: U(62), commission_status: 'paid' }), params(U(71)));
    expect(deal.status).toBe(201);
    expect(db.tables.partner_deals.at(-1)).toMatchObject({ commission_amount: 100000, commission_status: 'pending' });
    expect(db.tables.partners.find(p => p.id === U(71))!.tier_id).not.toBe(U(62));
  });
  it('fracaso tardío al promocionar no deja un deal pendiente', async () => {
    permissions.add('crm.opportunities.edit'); db.errors['partners:update'] = { code: 'XX000', message: 'private_database_detail' };
    const before = structuredClone(db.tables.partner_deals);
    const response = await register(req('/api/crm/partners/x/deals', { opportunity_id: U(30), deal_type: 'referral' }), params(U(71)));
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('private_database_detail');
    expect(db.tables.partner_deals).toEqual(before); expect(db.writes).toEqual([]);
  });
  it('falta de tasa mantiene comisión válida y bloquea promoción con aviso explícito', async () => {
    permissions.add('crm.opportunities.edit'); db.tables.opportunities.find(o => o.id === U(30))!.currency = 'EUR';
    const result = await (await register(req('/api/crm/partners/x/deals', { opportunity_id: U(30), deal_type: 'referral' }), params(U(71)))).json();
    expect(result.data).toMatchObject({ promotion_blocked: 'missing_exchange_rate', promoted_to: null });
    expect(result.data.revenue.sinTasa[0].moneda).toBe('EUR');
  });
  it.each([partnerStats, referralStats])('stats también rechaza las cuatro variantes de organización ajena', async call => {
    for (const key of ['organization_id', 'organizationId', 'org_id', 'orgId']) expect((await call(req(`/api/crm/stats?${key}=${OTHER}`))).status).toBe(403);
  });
  it.each([NaN, -1, '10'])('monto incorrecto %p falla sin crear ficha', async amount => {
    permissions.add('crm.leads.create');
    expect((await convert(req('/api/crm/referrals/x/convert', { amount }), params(U(21)))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });
});
