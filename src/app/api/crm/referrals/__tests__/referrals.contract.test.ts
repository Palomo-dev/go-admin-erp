/// <reference types="jest" />
/**
 * F12 — contrato de `/api/crm/referrals/**` con la organización doblada
 * (org 120) y señuelos de la 121 en todas las tablas. Se dobla
 * `@/lib/utils/orgContext` (arrastra `svix`, ESM puro); el doble de Supabase
 * aplica filtros y escrituras de verdad (`f12Fake.ts`).
 */
import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from './f12Fake';

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

import { GET as listGet, POST as listPost } from '../route';
import { GET as oneGet, PATCH as onePatch } from '../[id]/route';
import { POST as statusPost } from '../[id]/status/route';
import { POST as rewardPost } from '../[id]/reward/route';
import { POST as convertPost } from '../[id]/convert/route';
import { GET as requestsGet } from '../requests/route';
import { GET as programsGet, POST as programsPost } from '../programs/route';
import { PATCH as programPatch, DELETE as programDelete } from '../programs/[id]/route';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

beforeEach(() => {
  db = makeDb(seed());
  session.roleId = 4;
  session.isSuperAdmin = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/referrals', () => {
  it('lista solo la organización de la sesión, con referidor, programa y oportunidad resueltos', async () => {
    const { status, body } = await json(await listGet(req('/api/crm/referrals')));
    expect(status).toBe(200);
    const rows = body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id)).not.toContain(U(93));
    expect(body.count).toBe(4);
    const first = rows.find((r) => r.id === U(20))!;
    expect(first.referrer).toEqual({ id: U(1), full_name: 'Ana Referidora', email: 'ana@example.com' });
    expect((first.program as Record<string, unknown>).name).toBe('Programa base');
    const conv = rows.find((r) => r.id === U(22))!;
    expect((conv.opportunity as Record<string, unknown>).name).toBe('Oportunidad 1');
  });
  it('filtra por estado y acota la paginación', async () => {
    const { body } = await json(await listGet(req('/api/crm/referrals?status=converted&limit=1&offset=0')));
    expect((body.data as unknown[]).length).toBe(1);
    expect(body.count).toBe(2);
  });
  it('query con organization_id ajeno -> 403', async () => {
    const { status } = await json(await listGet(req(`/api/crm/referrals?organization_id=${OTHER}`)));
    expect(status).toBe(403);
  });
});

describe('POST /api/crm/referrals', () => {
  it('400 sin cliente referidor ni nombre', async () => {
    const { status, body } = await json(await listPost(req('/api/crm/referrals', 'POST', {})));
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION');
  });
  it('404 si el cliente referidor es de otra organización', async () => {
    const { status } = await json(await listPost(req('/api/crm/referrals', 'POST', { referrer_customer_id: U(91), referred_name: 'X' })));
    expect(status).toBe(404);
    expect(db.writes).toEqual([]);
  });
  it('404 si el programa es de otra organización; 409 si está inactivo', async () => {
    expect((await listPost(req('/api/crm/referrals', 'POST', { referrer_customer_id: U(1), referred_name: 'X', program_id: U(92) }))).status).toBe(404);
    expect((await listPost(req('/api/crm/referrals', 'POST', { referrer_customer_id: U(1), referred_name: 'X', program_id: U(11) }))).status).toBe(409);
    expect(db.writes).toEqual([]);
  });
  it('403 y registro si el body trae organization_id ajeno; la misma organización se ignora', async () => {
    const { status } = await json(await listPost(req('/api/crm/referrals', 'POST', { referrer_customer_id: U(1), referred_name: 'X', organization_id: OTHER })));
    expect(status).toBe(403);
    expect(console.warn).toHaveBeenCalled();
    expect(db.writes).toEqual([]);
    const same = await json(await listPost(req('/api/crm/referrals', 'POST', { referrer_customer_id: U(1), referred_name: 'X', organization_id: ORG })));
    expect(same.status).toBe(201);
  });
  it('201: nace pending en la organización de la sesión aunque el body diga converted/reward_paid', async () => {
    const { status, body } = await json(await listPost(req('/api/crm/referrals', 'POST', {
      referrer_customer_id: U(1), referred_name: ' Fer Nuevo ', referred_email: 'FER@Example.com', program_id: U(10), status: 'converted', reward_paid: true, opportunity_id: U(30),
    })));
    expect(status).toBe(201);
    const row = body.data as Record<string, unknown>;
    expect(row).toMatchObject({ organization_id: ORG, status: 'pending', referred_name: 'Fer Nuevo', referred_email: 'fer@example.com', referred_phone: null, program_id: U(10) });
    expect(row.opportunity_id).toBeUndefined();
    expect(row.reward_paid).toBeUndefined();
    const inserted = db.writes[0].payload as Record<string, unknown>;
    expect(inserted.reward_paid).toBeUndefined();
    expect(inserted.opportunity_id).toBeUndefined();
  });
});

describe('GET/PATCH /api/crm/referrals/[id]', () => {
  it('404 para un referido de otra organización', async () => {
    expect((await oneGet(req(`/api/crm/referrals/${U(93)}`), params(U(93)))).status).toBe(404);
    expect((await onePatch(req(`/api/crm/referrals/${U(93)}`, 'PATCH', { referred_name: 'Z' }), params(U(93)))).status).toBe(404);
  });
  it('PATCH edita datos descriptivos; status/reward_paid del body no se aplican', async () => {
    const { status, body } = await json(await onePatch(req(`/api/crm/referrals/${U(20)}`, 'PATCH', { referred_phone: '3009999999', status: 'converted', reward_paid: true }), params(U(20))));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ referred_phone: '3009999999', status: 'pending', reward_paid: false });
    expect(db.writes[0].payload).toEqual({ referred_phone: '3009999999' });
  });
  it('PATCH con programa de otra organización -> 404', async () => {
    expect((await onePatch(req(`/api/crm/referrals/${U(20)}`, 'PATCH', { program_id: U(92) }), params(U(20)))).status).toBe(404);
  });
});

describe('POST /api/crm/referrals/[id]/status', () => {
  it('pending -> contacted: 200 y la escritura lleva guarda optimista sobre el estado leído', async () => {
    const { status, body } = await json(await statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'contacted' }), params(U(20))));
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).status).toBe('contacted');
    const w = db.writes[0];
    expect(w.op).toBe('update');
    expect(w.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }, { kind: 'eq', key: 'status', value: 'pending' }]));
  });
  it('pending -> converted es 409 INVALID_TRANSITION; nada se escribe', async () => {
    const { status, body } = await json(await statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'converted' }), params(U(20))));
    expect(status).toBe(409);
    expect(body.code).toBe('INVALID_TRANSITION');
    expect(db.writes).toEqual([]);
  });
  it('qualified -> converted sin enlace es 409 CONVERSION_REQUIRES_LINK', async () => {
    const { status, body } = await json(await statusPost(req(`/api/crm/referrals/${U(21)}/status`, 'POST', { status: 'converted' }), params(U(21))));
    expect(status).toBe(409);
    expect(body.code).toBe('CONVERSION_REQUIRES_LINK');
  });
  it('estado desconocido -> 400; referido ajeno -> 404', async () => {
    expect((await statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'won' }), params(U(20)))).status).toBe(400);
    expect((await statusPost(req(`/api/crm/referrals/${U(93)}/status`, 'POST', { status: 'contacted' }), params(U(93)))).status).toBe(404);
  });
  it('si otra petición ganó la carrera (0 filas afectadas) -> 409 CONCURRENT_CHANGE', async () => {
    db.updateAffectsNone = true;
    const { status, body } = await json(await statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'contacted' }), params(U(20))));
    expect(status).toBe(409);
    expect(body.code).toBe('CONCURRENT_CHANGE');
  });
  it('organization_id ajeno en el body -> 403 antes de tocar nada', async () => {
    expect((await statusPost(req(`/api/crm/referrals/${U(20)}/status`, 'POST', { status: 'contacted', organization_id: OTHER }), params(U(20)))).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});

describe('POST /api/crm/referrals/[id]/reward', () => {
  it('pending -> 409 NOT_CONVERTED', async () => {
    const { status, body } = await json(await rewardPost(req(`/api/crm/referrals/${U(20)}/reward`, 'POST'), params(U(20))));
    expect(status).toBe(409);
    expect(body.code).toBe('NOT_CONVERTED');
    expect(db.writes).toEqual([]);
  });
  it('converted sin programa -> 409 NO_PROGRAM', async () => {
    const { body } = await json(await rewardPost(req(`/api/crm/referrals/${U(23)}/reward`, 'POST'), params(U(23))));
    expect(body.code).toBe('NO_PROGRAM');
  });
  it('converted con programa -> 200 con reward_paid_at ISO; la segunda vez 409 ALREADY_PAID', async () => {
    const first = await json(await rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST'), params(U(22))));
    expect(first.status).toBe(200);
    const row = first.body.data as Record<string, unknown>;
    expect(row.reward_paid).toBe(true);
    expect(typeof row.reward_paid_at).toBe('string');
    expect(new Date(row.reward_paid_at as string).toISOString()).toBe(row.reward_paid_at);
    const again = await json(await rewardPost(req(`/api/crm/referrals/${U(22)}/reward`, 'POST'), params(U(22))));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_PAID');
  });
  it('referido ajeno -> 404', async () => {
    expect((await rewardPost(req(`/api/crm/referrals/${U(93)}/reward`, 'POST'), params(U(93)))).status).toBe(404);
  });
});

describe('POST /api/crm/referrals/[id]/convert', () => {
  it('solo un referido qualified se convierte (pending -> 409)', async () => {
    const { status, body } = await json(await convertPost(req(`/api/crm/referrals/${U(20)}/convert`, 'POST', {}), params(U(20))));
    expect(status).toBe(409);
    expect(body.code).toBe('INVALID_TRANSITION');
    expect(db.writes).toEqual([]);
  });
  it('crea cliente lead + oportunidad lead (source/deal_type referral) y enlaza el referido como converted', async () => {
    const { status, body } = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21))));
    expect(status).toBe(201);
    const customerInsert = db.writes.find((w) => w.table === 'customers' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(customerInsert).toMatchObject({ organization_id: ORG, lifecycle_stage: 'lead', first_name: 'Dani', last_name: 'Calificado', phone: '3001234567' });
    expect(customerInsert.full_name).toBeUndefined();
    const oppInsert = db.writes.find((w) => w.table === 'opportunities' && w.op === 'insert')!.payload as Record<string, unknown>;
    expect(oppInsert).toMatchObject({ organization_id: ORG, record_type: 'lead', status: 'open', source: 'referral', deal_type: 'referral', pipeline_id: U(40), stage_id: U(41), created_by: 'u-1' });
    const referral = (body.data as Record<string, unknown>).referral as Record<string, unknown>;
    expect(referral.status).toBe('converted');
    expect(referral.opportunity_id).toBe(oppInsert.id ?? (body.data as Record<string, unknown> & { lead: Record<string, unknown> }).lead.id);
    expect(referral.referred_customer_id).toBeTruthy();
    const link = db.writes.find((w) => w.table === 'referrals' && w.op === 'update')!;
    expect(link.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }, { kind: 'eq', key: 'status', value: 'qualified' }]));
  });
  it('sin correo ni teléfono el alta de lead responde 400 honesto y no escribe', async () => {
    db.tables.referrals.find((r) => r.id === U(21))!.referred_phone = null;
    const { status, body } = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21))));
    expect(status).toBe(400);
    expect(String(body.error)).toMatch(/correo o teléfono/);
    expect(db.writes).toEqual([]);
  });
  it('con customer_id existente de la organización no crea ficha; de otra organización -> 400 sin escribir', async () => {
    const ok = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', { customer_id: U(2) }), params(U(21))));
    expect(ok.status).toBe(201);
    expect(db.writes.some((w) => w.table === 'customers' && w.op === 'insert')).toBe(false);
    db = makeDb(seed());
    const bad = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', { customer_id: U(91) }), params(U(21))));
    expect(bad.status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  it('si el enlace del referido pierde la carrera, deshace la oportunidad y el cliente creados -> 409', async () => {
    db.updateAffectsNone = true;
    const { status, body } = await json(await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', {}), params(U(21))));
    expect(status).toBe(409);
    expect(body.code).toBe('CONCURRENT_CHANGE');
    expect(db.writes.filter((w) => w.op === 'delete').map((w) => w.table).sort()).toEqual(['customers', 'opportunities']);
  });
  it('referido ajeno -> 404; organization_id ajeno -> 403', async () => {
    expect((await convertPost(req(`/api/crm/referrals/${U(93)}/convert`, 'POST', {}), params(U(93)))).status).toBe(404);
    expect((await convertPost(req(`/api/crm/referrals/${U(21)}/convert`, 'POST', { organization_id: OTHER }), params(U(21)))).status).toBe(403);
  });
});

describe('GET /api/crm/referrals/requests (tareas «pedir referido» de F10)', () => {
  it('solo tareas type=referido abiertas de la organización, con el cliente resuelto', async () => {
    const { status, body } = await json(await requestsGet());
    expect(status).toBe(200);
    const rows = body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id)).toEqual([U(50)]);
    expect(rows[0].customer).toEqual({ id: U(2), full_name: 'Beto Cliente', email: 'beto@example.com' });
  });
});

describe('/api/crm/referrals/programs', () => {
  it('GET lista solo los de la organización y la moneda base (null si no está configurada)', async () => {
    const { body } = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect((body.data as Array<Record<string, unknown>>).map((p) => p.id)).not.toContain(U(92));
    expect(body.currency).toBeNull();
    db.tables.organization_currencies = [
      { id: 1, organization_id: OTHER, currency_code: 'USD', is_base: true },
      { id: 2, organization_id: ORG, currency_code: 'cop ', is_base: true },
      { id: 3, organization_id: ORG, currency_code: 'EUR', is_base: false },
    ];
    const withBase = await json(await programsGet(req('/api/crm/referrals/programs')));
    expect(withBase.body.currency).toBe('COP');
  });
  it('POST valida reward_type/reward_to del CHECK', async () => {
    const { status, body } = await json(await programsPost(req('/api/crm/referrals/programs', 'POST', { name: 'P', reward_type: 'points', reward_to: 'both' })));
    expect(status).toBe(400);
    expect(String(body.error)).toMatch(/credit, discount, cash, gift/);
  });
  it('POST con nombre repetido (UNIQUE 23505) -> 409', async () => {
    db.errors['referral_programs:insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "referral_programs_organization_id_name_key"' };
    const { status, body } = await json(await programsPost(req('/api/crm/referrals/programs', 'POST', { name: 'Programa base', reward_type: 'cash', reward_to: 'both', reward_amount: 1 })));
    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE');
  });
  it('POST organization_id ajeno -> 403; válido -> 201 en la organización de la sesión', async () => {
    expect((await programsPost(req('/api/crm/referrals/programs', 'POST', { name: 'P', reward_type: 'cash', reward_to: 'both', organization_id: OTHER }))).status).toBe(403);
    const { status, body } = await json(await programsPost(req('/api/crm/referrals/programs', 'POST', { name: 'P', reward_type: 'gift', reward_to: 'referred', reward_amount: '5' })));
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ organization_id: ORG, reward_amount: 5, is_active: true });
  });
  it('PATCH/DELETE de un programa ajeno -> 404; DELETE propio -> 200', async () => {
    expect((await programPatch(req(`/api/crm/referrals/programs/${U(92)}`, 'PATCH', { name: 'Z' }), params(U(92)))).status).toBe(404);
    expect((await programDelete(req(`/api/crm/referrals/programs/${U(92)}`, 'DELETE'), params(U(92)))).status).toBe(404);
    expect(db.tables.referral_programs.some((p) => p.id === U(92))).toBe(true);
    expect((await programDelete(req(`/api/crm/referrals/programs/${U(11)}`, 'DELETE'), params(U(11)))).status).toBe(200);
    expect(db.tables.referral_programs.some((p) => p.id === U(11))).toBe(false);
  });
  it('PATCH con body vacío -> 400; descuento > 100 -> 400', async () => {
    expect((await programPatch(req(`/api/crm/referrals/programs/${U(10)}`, 'PATCH', {}), params(U(10)))).status).toBe(400);
    expect((await programPatch(req(`/api/crm/referrals/programs/${U(11)}`, 'PATCH', { reward_amount: 150 }), params(U(11)))).status).toBe(400);
  });
});
