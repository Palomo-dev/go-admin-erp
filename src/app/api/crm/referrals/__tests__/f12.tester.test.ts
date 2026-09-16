/// <reference types="jest" />
/**
 * F12 — suite del tester (ronda 1). Cubre lo que las pruebas del constructor
 * no cubrían o cubrían de forma indirecta: la extracción del alta de leads
 * (`leadCreateService`), las dos guardas optimistas con DOS llamadas
 * concurrentes de verdad, la exclusión de tareas `done` en `requests`, la
 * promoción con umbrales exactos y con un deal rechazado, el `paid_at` solo en
 * `paid`, y el descarte de `organization_id`/`status`/`reward_paid`/
 * `commission_amount` del body. Organización 120 con señuelos de la 121.
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from './f12Fake';

// F0-SEC r2: `readOrgBody` (módulo hoja) lanza la clase REAL de `OrgContextError`;
// el mock expone esa misma clase para que el `instanceof` de las rutas la reconozca.
const { OrgContextError: FakeOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

let db: FakeDb;
const session = { roleId: 4, isSuperAdmin: false, roleName: 'Empleado' };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: session.roleName, isSuperAdmin: session.isSuperAdmin, supabase: fakeSupabase(db) })),
}));

import { POST as leadsPost } from '../../leads/route';
import { POST as statusPost } from '../[id]/status/route';
import { POST as rewardPost } from '../[id]/reward/route';
import { POST as convertPost } from '../[id]/convert/route';
import { GET as requestsGet } from '../requests/route';
import { POST as referralsPost } from '../route';
import { PATCH as referralPatch } from '../[id]/route';
import { GET as partnersGet, POST as partnersPost } from '../../partners/route';
import { DELETE as partnerDelete } from '../../partners/[id]/route';
import { POST as dealsPost } from '../../partners/[id]/deals/route';
import { PATCH as dealPatch } from '../../partners/[id]/deals/[dealId]/route';
import { createLeadWithCustomer } from '@/lib/services/crm/leadCreateService';
import { checkReferralTransition } from '@/lib/services/crm/referralStateMachine';
import { checkRewardPayable, rewardPaidPatch } from '@/lib/services/crm/referralReward';
import { commissionPatch, computePartnerCommission, effectiveCommissionRate, summarizeCommissions } from '@/lib/services/crm/partnerCommission';
import { partnerStats, tierPromotion } from '@/lib/services/crm/partnerTierFor';
import { validatePartnerInput, validateReferralInput, validateDealInput } from '@/lib/services/crm/f12Validation';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const dealParams = (id: string, dealId: string) => ({ params: Promise.resolve({ id, dealId }) });
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

// ─── 1. Regresión del alta de leads ─────────────────────────────────────────

describe('POST /api/crm/leads tras la extracción a leadCreateService', () => {
  it('correo repetido (23505 unique_customer_email_per_org) -> 409 con existing_customer, nunca 500', async () => {
    db.errors['customers:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "unique_customer_email_per_org"' };
    const { status, body } = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'Lead Ana', new_customer: { full_name: 'Ana Referidora', email: 'ana@example.com' } })));
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain('ana@example.com');
    expect((body.existing_customer as Record<string, unknown>).id).toBe(U(1));
    expect(db.writes.filter((w) => w.table === 'opportunities')).toHaveLength(0);
  });

  it('23505 de otro índice -> 409 genérico sin existing_customer; otro error de BD -> 500', async () => {
    db.errors['customers:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "unique_customer_id_per_org"' };
    const a = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'X Y', phone: '300' } })));
    expect(a.status).toBe(409);
    expect(a.body.existing_customer).toBeUndefined();
    db.errors['customers:insert'] = { code: '42501', message: 'permission denied' };
    const b = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'X Y', phone: '300' } })));
    expect(b.status).toBe(500);
  });

  it('organization_id AJENO en el body → 403 y nada escrito (F0-SEC r2, regla dura 5 vía readOrgBody; antes se ignoraba)', async () => {
    const { status } = await json(await leadsPost(req('/api/crm/leads', 'POST', { organization_id: OTHER, name: 'Lead', new_customer: { full_name: 'Nuevo Cliente', phone: '3001112233' } })));
    expect(status).toBe(403);
    expect(db.writes.filter((w) => w.op === 'insert')).toEqual([]);
  });

  it('organization_id IGUAL al de la sesión en el body no es un ataque: el cliente y el lead nacen en la organización de la sesión', async () => {
    const { status, body } = await json(await leadsPost(req('/api/crm/leads', 'POST', { organization_id: ORG, name: 'Lead', new_customer: { full_name: 'Nuevo Cliente', phone: '3001112233' } })));
    expect(status).toBe(201);
    const customer = db.writes.find((w) => w.table === 'customers' && w.op === 'insert')!.payload as Record<string, unknown>;
    const opp = db.writes.find((w) => w.table === 'opportunities' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(customer.organization_id).toBe(ORG);
    expect(opp.organization_id).toBe(ORG);
    expect(opp.record_type).toBe('lead');
    expect(opp.status).toBe('open');
    expect(opp.source).toBe('manual_erp');
    expect(opp).not.toHaveProperty('deal_type');
    expect(body.created_customer_id).toBe(customer.id ?? (body.data as Record<string, unknown>).customer_id);
  });

  it('el contrato de validación sigue igual: sin nombre 400; sin ficha 400; sin correo ni teléfono 400; pipeline ajeno 400', async () => {
    expect((await json(await leadsPost(req('/api/crm/leads', 'POST', {})))).status).toBe(400);
    expect((await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L' })))).status).toBe(400);
    expect((await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'Sin Contacto' } })))).status).toBe(400);
    const foreignPipeline = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', pipeline_id: U(95), new_customer: { full_name: 'A B', phone: '1' } })));
    expect(foreignPipeline.status).toBe(400);
    expect(String(foreignPipeline.body.error)).toContain('no pertenece a la organización');
    expect(db.writes).toHaveLength(0);
  });

  it('deal_type (aditivo) se valida contra el CHECK; record_type/status del body no se leen', async () => {
    const bad = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', deal_type: 'bogus', new_customer: { full_name: 'A B', phone: '1' } })));
    expect(bad.status).toBe(400);
    const ok = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', deal_type: 'referral', record_type: 'deal', status: 'won', new_customer: { full_name: 'A B', phone: '1' } })));
    expect(ok.status).toBe(201);
    const opp = db.writes.find((w) => w.table === 'opportunities')!.payload as Record<string, unknown>;
    expect(opp.deal_type).toBe('referral');
    expect(opp.record_type).toBe('lead');
    expect(opp.status).toBe('open');
  });

  it('si el lead no cuaja tras crear la ficha, la ficha se borra (rollback) y el error sube', async () => {
    db.errors['opportunities:insert'] = { code: '23514', message: 'check violation' };
    const ctx = { organizationId: ORG, userId: 'u-1', supabase: fakeSupabase(db) as never };
    await expect(createLeadWithCustomer(ctx, { name: 'L', new_customer: { full_name: 'A B', phone: '1' } })).rejects.toMatchObject({ code: '23514' });
    const del = db.writes.find((w) => w.table === 'customers' && w.op === 'delete');
    expect(del).toBeDefined();
    expect(del!.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
});

// ─── 2. Máquinas de estado y registros de dinero ────────────────────────────

describe('máquinas de estado (puras)', () => {
  it('contacted -> converted salta qualified: 409 INVALID_TRANSITION aunque haya enlace', () => {
    const r = checkReferralTransition('contacted', 'converted', { opportunity_id: U(30), referred_customer_id: null });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', statusCode: 409 });
  });
  it('terminales no salen: converted -> rejected y rejected -> pending son 409', () => {
    expect(checkReferralTransition('converted', 'rejected', { opportunity_id: null, referred_customer_id: null })).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(checkReferralTransition('rejected', 'pending', { opportunity_id: null, referred_customer_id: null })).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
  });
  it('recompensa: pending -> NOT_CONVERTED; ya pagada -> ALREADY_PAID; sin programa -> NO_PROGRAM; orden de comprobación', () => {
    expect(checkRewardPayable({ status: 'pending', reward_paid: false, program_id: U(10) })).toMatchObject({ ok: false, code: 'NOT_CONVERTED' });
    expect(checkRewardPayable({ status: 'converted', reward_paid: true, program_id: U(10) })).toMatchObject({ ok: false, code: 'ALREADY_PAID' });
    expect(checkRewardPayable({ status: 'converted', reward_paid: false, program_id: null })).toMatchObject({ ok: false, code: 'NO_PROGRAM' });
    expect(checkRewardPayable({ status: 'converted', reward_paid: false, program_id: U(10) })).toEqual({ ok: true });
  });
  it('reward_paid_at es el instante ISO completo (nunca el día UTC recortado)', () => {
    const p = rewardPaidPatch(new Date('2026-09-15T23:30:00.000Z'));
    expect(p.reward_paid).toBe(true);
    expect(p.reward_paid_at).toBe('2026-09-15T23:30:00.000Z');
  });
  it('comisión: propia 0 y tier null -> 0; propia 0 hereda del tier; propia > 0 gana; tasa negativa propia no gana', () => {
    expect(effectiveCommissionRate({ commission_rate: 0 }, null)).toBe(0);
    expect(effectiveCommissionRate({ commission_rate: '0' }, { commission_rate: '15' })).toBe(15);
    expect(effectiveCommissionRate({ commission_rate: 12.5 }, { commission_rate: 15 })).toBe(12.5);
    expect(effectiveCommissionRate({ commission_rate: -5 }, { commission_rate: 15 })).toBe(15);
    expect(computePartnerCommission(1000000, 12.5)).toBe(125000);
    expect(computePartnerCommission('250000.5', 12.5)).toBe(31250.06);
    expect(computePartnerCommission(0, 50)).toBe(0);
    expect(computePartnerCommission('x', 50)).toBe(0);
  });
  it('paid_at solo en paid: approved no lo fija', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    expect(commissionPatch('approved', now)).toEqual({ commission_status: 'approved' });
    expect(commissionPatch('rejected', now)).toEqual({ commission_status: 'rejected' });
    expect(commissionPatch('paid', now)).toEqual({ commission_status: 'paid', commission_paid_at: '2026-09-15T12:00:00.000Z' });
  });
  it('resumen: rechazadas no entran en outstanding; centavos redondeados', () => {
    const s = summarizeCommissions([
      { commission_status: 'pending', commission_amount: 0.1 },
      { commission_status: 'approved', commission_amount: 0.2 },
      { commission_status: 'rejected', commission_amount: 999 },
      { commission_status: 'paid', commission_amount: '5' },
    ]);
    expect(s.outstanding).toBe(0.3);
    expect(s.rejected).toBe(999);
    expect(s.paid).toBe(5);
  });
});

describe('promoción de tier (pura)', () => {
  const tiers = [
    { id: 'b', name: 'Bronce', min_deals: 0, min_revenue: 0, commission_rate: 10 },
    { id: 'p', name: 'Plata', min_deals: 2, min_revenue: 1000000, commission_rate: 15 },
    { id: 'o', name: 'Oro', min_deals: 10, min_revenue: 50000000, commission_rate: 20 },
  ];
  it('umbrales exactos (deals = min_deals y revenue = min_revenue) promocionan', () => {
    expect(tierPromotion('b', { deals: 2, revenue: 1000000 }, tiers)?.tierId).toBe('p');
  });
  it('un solo umbral no basta: 2 deals con 999 999,99 no sube; 1 deal con 10 000 000 tampoco', () => {
    expect(tierPromotion('b', { deals: 2, revenue: 999999.99 }, tiers)).toBeNull();
    expect(tierPromotion('b', { deals: 1, revenue: 10000000 }, tiers)).toBeNull();
  });
  it('un deal rechazado no cuenta ni en deals ni en revenue', () => {
    const stats = partnerStats([
      { commission_status: 'pending', amount: 600000 },
      { commission_status: 'rejected', amount: 400000 },
      { commission_status: 'approved', amount: 400000 },
    ]);
    expect(stats).toEqual({ deals: 2, revenue: 1000000 });
    expect(tierPromotion('b', stats, tiers)?.tierId).toBe('p');
    const withoutRejected = partnerStats([{ commission_status: 'pending', amount: 600000 }, { commission_status: 'rejected', amount: 400000 }]);
    expect(tierPromotion('b', withoutRejected, tiers)).toBeNull();
  });
  it('nunca degrada: Oro con 0 deals sigue en Oro; sin tier y sin deals sube a Bronce (0/0)', () => {
    expect(tierPromotion('o', { deals: 0, revenue: 0 }, tiers)).toBeNull();
    expect(tierPromotion(null, { deals: 0, revenue: 0 }, tiers)?.tierId).toBe('b');
    expect(tierPromotion('huerfano', { deals: 0, revenue: 0 }, tiers)?.tierId).toBe('b');
  });
  it('salta directamente al más alto que cumple (Bronce -> Oro)', () => {
    expect(tierPromotion('b', { deals: 10, revenue: 50000000 }, tiers)?.tierId).toBe('o');
  });
});

describe('guardas optimistas con dos llamadas concurrentes', () => {
  it('status: dos llamadas intercaladas (ambas leen pending): la segunda pierde por la guarda .eq(status) -> 409 CONCURRENT_CHANGE', async () => {
    // Lanzadas sin await entre medias: ambas hacen la lectura antes de que ninguna escriba.
    const p1 = statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'contacted' }), params(U(20)));
    const p2 = statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'rejected' }), params(U(20)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((r1.status === 409 ? r1 : r2).body.code).toBe('CONCURRENT_CHANGE');
    const updates = db.writes.filter((w) => w.table === 'referrals' && w.op === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'status', value: 'pending' }]));
    const row = db.tables.referrals.find((r) => r.id === U(20))!;
    expect(['contacted', 'rejected']).toContain(row.status);
  });

  it('reward: dos «pagar» intercalados sobre el mismo converted -> una 200 y otra 409; reward_paid_at una sola vez', async () => {
    const p1 = rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST', {}), params(U(22)));
    const p2 = rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST', {}), params(U(22)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const updates = db.writes.filter((w) => w.table === 'referrals' && w.op === 'update');
    for (const u of updates) expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'reward_paid', value: false }, { kind: 'eq', key: 'status', value: 'converted' }]));
  });

  it('deals/[dealId]: dos approved -> paid intercalados (admin) -> una 200 y otra 409', async () => {
    session.roleId = 2;
    const p1 = dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), dealParams(U(70), U(81)));
    const p2 = dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), dealParams(U(70), U(81)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const ok = r1.status === 200 ? r1 : r2;
    expect(typeof (ok.body.data as Record<string, unknown>).commission_paid_at).toBe('string');
    const updates = db.writes.filter((w) => w.table === 'partner_deals' && w.op === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'commission_status', value: 'approved' }]));
  });
});

// ─── 3. Tenencia y descartes del body ───────────────────────────────────────

describe('tenencia', () => {
  it('DELETE de partner con rol 4 llamado «Administrador» -> 403 MANAGER_REQUIRED sin escribir', async () => {
    session.roleId = 4;
    session.roleName = 'Administrador';
    const { status, body } = await json(await partnerDelete(req(`/api/crm/partners/${U(70)}`, 'DELETE'), params(U(70))));
    expect(status).toBe(403);
    expect(body.code).toBe('MANAGER_REQUIRED');
    expect(db.writes).toHaveLength(0);
    expect(db.tables.partners.some((p) => p.id === U(70))).toBe(true);
  });

  it('deals/[dealId] con organization_id ajeno -> 403 y console.warn, antes del rol y sin leer', async () => {
    session.roleId = 2;
    const { status } = await json(await dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(80)}`, 'PATCH', { organization_id: OTHER, commission_status: 'approved' }), dealParams(U(70), U(80))));
    expect(status).toBe(403);
    expect(console.warn).toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });

  it('POST referrals descarta status/reward_paid/opportunity_id/referred_customer_id/organization_id del body', async () => {
    const { status } = await json(await referralsPost(req('/api/crm/referrals', 'POST', {
      referrer_customer_id: U(1), referred_name: 'Zoe', status: 'converted', reward_paid: true, reward_paid_at: '2020-01-01', opportunity_id: U(30), referred_customer_id: U(2), organization_id: ORG, id: 'forzado',
    })));
    expect(status).toBe(201);
    const ins = db.writes.find((w) => w.table === 'referrals' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(ins.status).toBe('pending');
    expect(ins.organization_id).toBe(ORG);
    expect(ins).not.toHaveProperty('reward_paid');
    expect(ins).not.toHaveProperty('opportunity_id');
    expect(ins).not.toHaveProperty('referred_customer_id');
    expect(ins.id).not.toBe('forzado');
  });

  it('PATCH referrals con solo status/reward_paid -> 400 «Nada que actualizar» y no escribe', async () => {
    const { status } = await json(await referralPatch(req(`/api/crm/referrals/${U(20)}`, 'PATCH', { status: 'converted', reward_paid: true }), params(U(20))));
    expect(status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('POST deals ignora commission_amount/commission_status del body: la comisión se calcula (12,5 % de 250 000,50)', async () => {
    // Oportunidad 2 no está registrada para «Hereda Tier» (71) → nueva. Hereda 10 % del tier Bronce.
    const { status, body } = await json(await dealsPost(req(`/api/crm/partners/${U(71)}/deals`, 'POST', { opportunity_id: U(31), deal_type: 'reseller', commission_amount: 999999, commission_status: 'paid' }), params(U(71))));
    expect(status).toBe(201);
    const data = body.data as { deal: Record<string, unknown>; commission_rate: number };
    expect(data.commission_rate).toBe(10);
    expect(data.deal.commission_amount).toBe(25000.05);
    expect(data.deal.commission_status).toBe('pending');
  });

  it('validadores puros descartan claves prohibidas', () => {
    const p = validatePartnerInput({ name: 'X', email: 'X@Y.co', organization_id: 1, id: 'z', created_at: 'w' }, { partial: false });
    expect(p.ok && Object.keys(p.value).sort()).toEqual(['email', 'name']);
    expect(p.ok && p.value.email).toBe('x@y.co');
    const r = validateReferralInput({ referrer_customer_id: U(1), referred_name: 'A', status: 'converted', reward_paid: true, organization_id: 9 });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['referred_name', 'referrer_customer_id']);
    const d = validateDealInput({ opportunity_id: U(30), deal_type: 'referral', commission_amount: 1, partner_id: 'x' });
    expect(d.ok && Object.keys(d.value).sort()).toEqual(['deal_type', 'opportunity_id']);
  });
});

// ─── 4. Comportamientos de producto ─────────────────────────────────────────

describe('producto', () => {
  it('requests: excluye tareas done/canceled, otros tipos y las de la 121; incluye in_progress', async () => {
    db.tables.tasks.push({ id: U(53), organization_id: ORG, type: 'referido', status: 'in_progress', title: 'En curso', due_date: null, customer_id: U(1), related_to_id: null });
    db.tables.tasks.push({ id: U(54), organization_id: ORG, type: 'referido', status: 'canceled', title: 'Cancelada', due_date: null, customer_id: U(1), related_to_id: null });
    const { status, body } = await json(await requestsGet());
    expect(status).toBe(200);
    const ids = (body.data as Array<{ id: string }>).map((t) => t.id).sort();
    expect(ids).toEqual([U(50), U(53)].sort());
  });

  it('partners: correo repetido con distinta capitalización -> 409 DUPLICATE_EMAIL; nada se escribe', async () => {
    const { status, body } = await json(await partnersPost(req('/api/crm/partners', 'POST', { name: 'Otro', email: 'CARLOS@Example.COM' })));
    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE_EMAIL');
    expect(db.writes).toHaveLength(0);
  });

  it('partners: currency_mixed=true no suma monedas; una sola moneda la declara', async () => {
    db.tables.opportunities.find((o) => o.id === U(31))!.currency = 'USD';
    const { body } = await json(await partnersGet());
    const carlos = (body.data as Array<Record<string, unknown>>).find((p) => p.id === U(70))!;
    expect(carlos.currency_mixed).toBe(true);
    expect(carlos.commissions_currency).toBeNull();
    const hereda = (body.data as Array<Record<string, unknown>>).find((p) => p.id === U(71))!;
    expect(hereda.currency_mixed).toBe(false);
  });

  it('convert: solo qualified; si el enlace falla por error de BD, deshace oportunidad y ficha y responde 502', async () => {
    db.errors['referrals:update'] = { code: 'XX000', message: 'boom' };
    const { status } = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21))));
    expect(status).toBe(502);
    const deletes = db.writes.filter((w) => w.op === 'delete').map((w) => w.table).sort();
    expect(deletes).toEqual(['customers', 'opportunities']);
    expect(db.tables.opportunities.some((o) => o.name === 'Referido: Dani Calificado')).toBe(false);
  });

  it('convert: el lead nace source=referral, deal_type=referral, record_type=lead; el referido queda converted con ambos enlaces', async () => {
    const { status, body } = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', { organization_id: ORG }), params(U(21))));
    expect(status).toBe(201);
    const opp = db.writes.find((w) => w.table === 'opportunities' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(opp).toMatchObject({ organization_id: ORG, source: 'referral', deal_type: 'referral', record_type: 'lead', status: 'open' });
    const ref = (body.data as { referral: Record<string, unknown> }).referral;
    expect(ref.status).toBe('converted');
    expect(typeof ref.opportunity_id).toBe('string');
    expect(typeof ref.referred_customer_id).toBe('string');
    const second = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21))));
    expect(second.status).toBe(409);
  });
});

// ─── 5. Guardarraíles estáticos de la interfaz ──────────────────────────────

describe('guardarraíles estáticos F12 (UI)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const root = path.resolve(__dirname, '../../../../../../');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  it('EntitySearchList: los resultados son <button type="button" aria-pressed>, sin div onClick', () => {
    const src = read('src/components/crm/shared/EntitySearchList.tsx');
    expect(src).toMatch(/<button type="button" aria-pressed=\{selectedId === h\.id\}/);
    expect(src).not.toMatch(/<div[^>]*onClick/);
    expect(src).not.toMatch(/role="button"/);
  });

  it('la UI de referidos y partners nunca deriva un día con split(\'T\') ni toISOString().split', () => {
    const files = [...walk('src/components/crm/referidos'), ...walk('src/components/crm/partners'), 'src/components/configuracion/panels/crm/sections/ReferralsProgramCard.tsx'];
    for (const f of files) {
      const src = read(f);
      expect({ f, hit: /split\('T'\)|split\("T"\)/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /toISOString\(\)\.split/.test(src) }).toEqual({ f, hit: false });
    }
  });

  it('las fechas de referidos y deals pasan por useFormatDate (timezone de la organización)', () => {
    expect(read('src/components/crm/referidos/ReferralCard.tsx')).toContain("useFormatDate()");
    expect(read('src/components/crm/partners/PartnerDealTable.tsx')).toContain("useFormatDate()");
  });

  it('las rutas F12 y leads usan getServerOrgContext (la organización sale de la sesión)', () => {
    const routes = [...walk('src/app/api/crm/referrals'), ...walk('src/app/api/crm/partners'), 'src/app/api/crm/leads/route.ts'].filter((f) => f.endsWith('route.ts'));
    expect(routes.length).toBeGreaterThanOrEqual(15);
    for (const f of routes) {
      expect({ f, ok: read(f).includes('getServerOrgContext') }).toEqual({ f, ok: true });
      expect({ f, ok: /@\/lib\/supabase\/config/.test(read(f)) }).toEqual({ f, ok: false });
    }
  });
});
