/// <reference types="jest" />
/**
 * F12 — casos únicos consolidados de las rondas (2026-09-21) sobre rutas.
 * Vienen de `f12.tester` (tester r1) y `f12MiscTester` (tester F12-misc).
 * Organización 120 con señuelos de la 121 (`f12Fake.ts`). Cubre: la regresión
 * del alta de leads tras extraer `leadCreateService` (409 con
 * `existing_customer`, 409 genérico, 500, contrato de validación, `deal_type`
 * contra el CHECK), las guardas optimistas con DOS llamadas concurrentes de
 * verdad, descartes del body, `requests` con in_progress/canceled, convert con
 * error de BD (502 + rollback), `customers/search` saneado, y los hermanos
 * DELETE tier / PATCH programa con rol y organización ajena.
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from './f12Fake';
import type { SupabaseClient } from '@supabase/supabase-js';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

let db: FakeDb;
const session: { roleId: number; isSuperAdmin: boolean; roleName: string; supabase?: unknown } = { roleId: 4, isSuperAdmin: false, roleName: 'Empleado' };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: 'u-1', roleId: session.roleId, roleName: session.roleName, isSuperAdmin: session.isSuperAdmin, supabase: session.supabase ?? fakeSupabase(db) })),
}));

import { POST as leadsPost } from '../../leads/route';
import { POST as statusPost } from '../[id]/status/route';
import { POST as rewardPost } from '../[id]/reward/route';
import { POST as convertPost } from '../[id]/convert/route';
import { GET as requestsGet } from '../requests/route';
import { POST as referralsPost } from '../route';
import { PATCH as referralPatch } from '../[id]/route';
import { PATCH as programPatch } from '../programs/[id]/route';
import { PATCH as dealPatch } from '../../partners/[id]/deals/[dealId]/route';
import { DELETE as tierDelete } from '../../partners/tiers/[id]/route';
import { GET as customersSearch } from '../../customers/search/route';

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
  session.supabase = undefined;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/crm/leads tras la extracción a leadCreateService (tester r1 §1)', () => {
  it('T1.1: correo repetido (23505 unique_customer_email_per_org) -> 409 con existing_customer, nunca 500, sin oportunidad', async () => {
    db.errors['customers:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "unique_customer_email_per_org"' };
    const { status, body } = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'Lead Ana', new_customer: { full_name: 'Ana Referidora', email: 'ana@example.com' } })));
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain('ana@example.com');
    expect((body.existing_customer as Record<string, unknown>).id).toBe(U(1));
    expect(db.writes.filter((w) => w.table === 'opportunities')).toHaveLength(0);
  });
  it('T1.2: 23505 de otro índice -> 409 genérico sin existing_customer; otro error de BD -> 500', async () => {
    db.errors['customers:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "unique_customer_id_per_org"' };
    const a = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'X Y', phone: '300' } })));
    expect(a.status).toBe(409);
    expect(a.body.existing_customer).toBeUndefined();
    db.errors['customers:insert'] = { code: '42501', message: 'permission denied' };
    expect((await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'X Y', phone: '300' } })))).status).toBe(500);
  });
  it('T1.4: el cliente y el lead nacen en la organización de la sesión: record_type lead, status open, source manual_erp, sin deal_type', async () => {
    const { status, body } = await json(await leadsPost(req('/api/crm/leads', 'POST', { organization_id: ORG, name: 'Lead', new_customer: { full_name: 'Nuevo Cliente', phone: '3001112233' } })));
    expect(status).toBe(201);
    const customer = db.writes.find((w) => w.table === 'customers' && w.op === 'insert')!.payload as Record<string, unknown>;
    const opp = db.writes.find((w) => w.table === 'opportunities' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(customer.organization_id).toBe(ORG);
    expect(opp).toMatchObject({ organization_id: ORG, record_type: 'lead', status: 'open', source: 'manual_erp' });
    expect(opp).not.toHaveProperty('deal_type');
    expect(body.created_customer_id).toBe(customer.id ?? (body.data as Record<string, unknown>).customer_id);
  });
  it('T1.5: contrato de validación: sin nombre 400; sin ficha 400; sin correo ni teléfono 400; pipeline ajeno 400 «no pertenece a la organización»; nada escrito', async () => {
    expect((await leadsPost(req('/api/crm/leads', 'POST', {}))).status).toBe(400);
    expect((await leadsPost(req('/api/crm/leads', 'POST', { name: 'L' }))).status).toBe(400);
    expect((await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', new_customer: { full_name: 'Sin Contacto' } }))).status).toBe(400);
    const foreignPipeline = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', pipeline_id: U(95), new_customer: { full_name: 'A B', phone: '1' } })));
    expect(foreignPipeline.status).toBe(400);
    expect(String(foreignPipeline.body.error)).toContain('no pertenece a la organización');
    expect(db.writes).toHaveLength(0);
  });
  it('T1.6: deal_type (aditivo) se valida contra el CHECK; record_type/status del body no se leen', async () => {
    expect((await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', deal_type: 'bogus', new_customer: { full_name: 'A B', phone: '1' } }))).status).toBe(400);
    const ok = await json(await leadsPost(req('/api/crm/leads', 'POST', { name: 'L', deal_type: 'referral', record_type: 'deal', status: 'won', new_customer: { full_name: 'A B', phone: '1' } })));
    expect(ok.status).toBe(201);
    const opp = db.writes.find((w) => w.table === 'opportunities')!.payload as Record<string, unknown>;
    expect(opp).toMatchObject({ deal_type: 'referral', record_type: 'lead', status: 'open' });
  });
});

describe('guardas optimistas con dos llamadas concurrentes de verdad (tester r1 §2)', () => {
  it('status: dos llamadas intercaladas (ambas leen pending): la segunda pierde por la guarda .eq(status) -> 409 CONCURRENT_CHANGE', async () => {
    const p1 = statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'contacted' }), params(U(20)));
    const p2 = statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'rejected' }), params(U(20)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((r1.status === 409 ? r1 : r2).body.code).toBe('CONCURRENT_CHANGE');
    const updates = db.writes.filter((w) => w.table === 'referrals' && w.op === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'status', value: 'pending' }]));
    expect(['contacted', 'rejected']).toContain(db.tables.referrals.find((r) => r.id === U(20))!.status);
  });
  it('reward: dos «pagar» intercalados sobre el mismo converted -> una 200 y otra 409; la guarda lleva reward_paid=false y status=converted', async () => {
    const p1 = rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST', {}), params(U(22)));
    const p2 = rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST', {}), params(U(22)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    for (const u of db.writes.filter((w) => w.table === 'referrals' && w.op === 'update')) {
      expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'reward_paid', value: false }, { kind: 'eq', key: 'status', value: 'converted' }]));
    }
  });
  it('deals/[dealId]: dos approved -> paid intercalados (admin) -> una 200 con commission_paid_at y otra 409', async () => {
    session.roleId = 2;
    const p1 = dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), dealParams(U(70), U(81)));
    const p2 = dealPatch(req(`/api/crm/partners/${U(70)}/deals/${U(81)}`, 'PATCH', { commission_status: 'paid' }), dealParams(U(70), U(81)));
    const [r1, r2] = await Promise.all([p1.then(json), p2.then(json)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(typeof ((r1.status === 200 ? r1 : r2).body.data as Record<string, unknown>).commission_paid_at).toBe('string');
    const updates = db.writes.filter((w) => w.table === 'partner_deals' && w.op === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'commission_status', value: 'approved' }]));
  });
});

describe('descartes del body y producto (tester r1 §3/§4)', () => {
  it('T3.3: POST referrals descarta status/reward_paid/reward_paid_at/opportunity_id/referred_customer_id/id del body; la misma organización no molesta', async () => {
    const { status } = await json(await referralsPost(req('/api/crm/referrals', 'POST', {
      referrer_customer_id: U(1), referred_name: 'Zoe', status: 'converted', reward_paid: true, reward_paid_at: '2020-01-01', opportunity_id: U(30), referred_customer_id: U(2), organization_id: ORG, id: 'forzado',
    })));
    expect(status).toBe(201);
    const ins = db.writes.find((w) => w.table === 'referrals' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(ins).toMatchObject({ status: 'pending', organization_id: ORG });
    for (const k of ['reward_paid', 'reward_paid_at', 'opportunity_id', 'referred_customer_id']) expect(ins).not.toHaveProperty(k);
    expect(ins.id).not.toBe('forzado');
  });
  it('T3.4: PATCH referrals con solo status/reward_paid -> 400 «Nada que actualizar» y no escribe', async () => {
    expect((await referralPatch(req(`/api/crm/referrals/${U(20)}`, 'PATCH', { status: 'converted', reward_paid: true }), params(U(20)))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
  it('T4.1: requests excluye tareas done/canceled, otros tipos y las de la 121; incluye in_progress', async () => {
    db.tables.tasks.push({ id: U(53), organization_id: ORG, type: 'referido', status: 'in_progress', title: 'En curso', due_date: null, customer_id: U(1), related_to_id: null });
    db.tables.tasks.push({ id: U(54), organization_id: ORG, type: 'referido', status: 'canceled', title: 'Cancelada', due_date: null, customer_id: U(1), related_to_id: null });
    const { status, body } = await json(await requestsGet());
    expect(status).toBe(200);
    expect((body.data as Array<{ id: string }>).map((t) => t.id).sort()).toEqual([U(50), U(53)].sort());
  });
  it('T4.4: convert: si el enlace falla por error de BD, deshace oportunidad y ficha y responde 502', async () => {
    db.errors['referrals:update'] = { code: 'XX000', message: 'boom' };
    expect((await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21)))).status).toBe(502);
    expect(db.writes.filter((w) => w.op === 'delete').map((w) => w.table).sort()).toEqual(['customers', 'opportunities']);
    expect(db.tables.opportunities.some((o) => o.name === 'Referido: Dani Calificado')).toBe(false);
  });
});

describe('GET /api/crm/customers/search — ruta del CallLinkPanel (tester F12-misc §4)', () => {
  it('q con coma y paréntesis: el `.or` va entrecomillado y acotado a la organización de la sesión', async () => {
    const calls: Array<{ m: string; args: unknown[] }> = [];
    const self: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'or']) self[m] = (...args: unknown[]) => { calls.push({ m, args }); return self; };
    self.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'c1' }], error: null }).then(ok);
    session.supabase = self as unknown as SupabaseClient;
    const res = await customersSearch(new NextRequest('http://localhost/api/crm/customers/search?q=' + encodeURIComponent('Pérez, Juan (hijo)')));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.m === 'or')?.args[0]).toBe('first_name.ilike."%Pérez, Juan (hijo)%",last_name.ilike."%Pérez, Juan (hijo)%",phone.ilike."%Pérez, Juan (hijo)%"');
    expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['organization_id', ORG]);
  });
});

describe('hermanos con rol: DELETE tiers/[id] y PATCH programs/[id] (tester F12-misc §2)', () => {
  it('DELETE tier: organización ajena en la query se comprueba ANTES que el rol (Empleado -> FOREIGN_ORGANIZATION); el tier sigue', async () => {
    const r = await tierDelete(req(`/api/crm/partners/tiers/${U(62)}?organization_id=${OTHER}`, 'DELETE'), params(U(62)));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(db.tables.partner_tiers.some((t) => t.id === U(62))).toBe(true);
    expect(db.writes).toHaveLength(0);
  });
  it('PATCH programa (recompensa) como Empleado -> 403 sin escribir; manager -> 200 acotado a la organización; organización ajena en el body gana al rol', async () => {
    expect((await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { reward_amount: 99 }), params(U(11)))).status).toBe(403);
    expect(db.writes).toHaveLength(0);
    const foreign = await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { organization_id: OTHER, reward_amount: 1 }), params(U(11)));
    expect((await foreign.json()).code).toBe('FOREIGN_ORGANIZATION');
    session.roleId = 5;
    expect((await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { reward_amount: 99 }), params(U(11)))).status).toBe(200);
    expect(db.writes[0].filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
  });
});
