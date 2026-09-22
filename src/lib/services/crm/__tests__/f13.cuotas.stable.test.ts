/// <reference types="jest" />
/**
 * F13 — casos únicos consolidados de las rondas (2026-09-21): rutas de cuotas
 * (`/api/crm/sales-targets/**`). Vienen de `f13Round1Tester` (tester r1),
 * `f13Round2Routes` (constructor r2), `f13Round2Tester` (tester r2) y
 * `f13Round3Tester` (tester r3). Cubre: regla dura 5 en POST/PATCH/DELETE/
 * progress (403 + registro, sin escribir), rol por id, 502 honesto al calcular
 * el logrado, PATCH parcial validado contra la fila existente, moneda por
 * defecto = base de la organización (nunca «COP» cableado; null/vacía/sucia),
 * montos y periodos basura, y `organization_id` ajeno en el QUERY.
 */
import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, roleName: 'x', organizationId: 120 };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({ organizationId: session.organizationId, userId: session.userId, roleId: session.roleId, roleName: session.roleName, isSuperAdmin: session.isSuperAdmin, supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { GET as listTargetsRoute, POST as createTargetRoute } from '@/app/api/crm/sales-targets/route';
import { DELETE as deleteTargetRoute, PATCH as patchTargetRoute } from '@/app/api/crm/sales-targets/[id]/route';
import { GET as progressRoute } from '@/app/api/crm/sales-targets/progress/route';

const T = (id: string, org: number, extra: Row = {}): Row => ({ id, organization_id: org, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0, ...extra });

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }, { id: 122, timezone: 'UTC' }],
      organization_currencies: [
        { organization_id: 120, currency_code: 'COP', is_base: true }, { organization_id: 121, currency_code: 'USD', is_base: true }, { organization_id: 121, currency_code: 'COP', is_base: false },
      ],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true }, { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true },
        { id: 3, organization_id: 121, user_id: 'u-1', is_active: true }, { id: 4, organization_id: 122, user_id: 'u-1', is_active: true }, { id: 5, organization_id: 121, user_id: 'u-ajeno', is_active: true },
      ],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [],
      sales_targets: [T('t-1', 120), T('t-9', 121, { user_id: 'u-ajeno', target_amount: 5, target_currency: 'USD' })],
      opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const validQuota = { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 500 };
const inserted = () => db.writes.find((w) => w.op === 'insert')!.row!;
const target = (id: string) => db.rows.sales_targets.find((t) => t.id === id)!;

let warn: jest.SpyInstance;
beforeEach(() => {
  db = seed();
  session.roleId = 2; session.userId = 'u-admin'; session.isSuperAdmin = false; session.roleName = 'x'; session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('regla dura 5 y rol en las rutas de cuotas (r2 R2-1, tester r2 R2T-1.4, tester r1 T3.1)', () => {
  const foreign = { organization_id: 121 };
  const cases: Array<[string, () => Promise<Response>]> = [
    ['POST', () => createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: 5, ...foreign }))],
    ['PATCH', () => patchTargetRoute(req('/x', 'PATCH', { target_amount: 5, ...foreign }), params('t-1'))],
    ['DELETE', () => deleteTargetRoute(req('/x', 'DELETE', foreign), params('t-1'))],
    ['progress (escribe achieved_amount)', () => progressRoute(req('/x?user_id=u-1&organization_id=121', 'GET'))],
  ];
  for (const [name, call] of cases) {
    it(`${name} con organization_id ajeno: 403, warn registrado, cero escrituras`, async () => {
      expect((await call()).status).toBe(403);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls[0])).toContain('121');
      expect(db.writes).toHaveLength(0);
    });
  }
  it('progress con ?organization_id=120 (la propia) → 200 y escribe achieved_amount acotado a la org', async () => {
    const r2 = await progressRoute(req('/api/crm/sales-targets/progress?user_id=u-1&period=monthly&organization_id=120', 'GET'));
    expect(r2.status).toBe(200);
    expect(db.writes.filter((w) => w.op === 'update' && w.table === 'sales_targets').map((w) => w.filters)).toEqual([{ id: 't-1', organization_id: 120 }]);
    expect(warn).not.toHaveBeenCalled();
  });
  it('PATCH: el rol se resuelve por id: roleName «Admin de organización» con roleId 4 → 403 sin escribir', async () => {
    session.roleId = 4; session.roleName = 'Admin de organización';
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_amount: 5 }), params('t-1'))).status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });
  it('GET /api/crm/sales-targets?organization_id=121&user_id=u-ajeno: ninguna cuota de la 121 (la sesión manda)', async () => {
    const res = await listTargetsRoute(req('/api/crm/sales-targets?organization_id=121&user_id=u-ajeno', 'GET'));
    const json = await res.json();
    if (res.status === 200) expect(json.data.map((t: Row) => t.id)).not.toContain('t-9');
    else expect(res.status).toBe(403);
  });
  it('r2 R2-2.5: GET con progreso y error de BD al calcular el logrado → 502, no «0 %»', async () => {
    db.nextReadError = { table: 'opportunities', error: { code: '57014', message: 'timeout' } };
    expect((await listTargetsRoute(req('/api/crm/sales-targets?user_id=u-1&with_progress=1', 'GET'))).status).toBe(502);
  });
});

describe('PATCH parcial validado contra la fila existente (r2 R2-3, tester r3 §3)', () => {
  it('period_end anterior al period_start existente → 400 field period_end; solo period=quarterly con límites mensuales → 400; nada escrito', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period_end: '2026-08-01' }), params('t-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('period_end');
    expect((await patchTargetRoute(req('/x', 'PATCH', { period: 'quarterly' }), params('t-1'))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
  it('mover la cuota a octubre completo → 200 y escribe solo esos campos, acotado por organización', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period_start: '2026-10-01', period_end: '2026-10-31' }), params('t-1'));
    expect(res.status).toBe(200);
    const w = db.writes.find((x) => x.op === 'update')!;
    expect(w.filters).toMatchObject({ id: 't-1', organization_id: 120 });
    expect(w.row).toMatchObject({ period_start: '2026-10-01', period_end: '2026-10-31' });
    expect(w.row).not.toHaveProperty('target_amount');
  });
  it('cambiar target_type a calls con meta decimal existente → 400 (conteo entero); con meta entera → 200', async () => {
    target('t-1').target_amount = 12.5;
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_type: 'calls' }), params('t-1'))).status).toBe(400);
    target('t-1').target_amount = 12;
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_type: 'calls' }), params('t-1'))).status).toBe(200);
  });
  it('sin nada actualizable ({} / solo achieved_amount / solo organization_id propio) → 400 field body, nunca 200 fingido; period: null → 400 field period', async () => {
    for (const body of [{}, { achieved_amount: 999 }, { organization_id: 120 }]) {
      const res = await patchTargetRoute(req('/x', 'PATCH', body), params('t-1'));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('body');
    }
    const nul = await patchTargetRoute(req('/x', 'PATCH', { period: null }), params('t-1'));
    expect(nul.status).toBe(400);
    expect((await nul.json()).field).toBe('period');
    expect(db.writes).toHaveLength(0);
    expect(target('t-1').achieved_amount).toBe(0);
  });
});

describe('moneda por defecto = moneda base de la organización (r2 R2-4, tester r3 §4)', () => {
  it.each([['ausente', undefined], ['null', null], ['vacía', ''], ['espacios', '   ']])('POST con target_currency %s → se usa la base de la org (121 = USD), no «COP» ni el default de la columna', async (_l, cur) => {
    session.organizationId = 121;
    const body: Record<string, unknown> = { ...validQuota };
    if (cur !== undefined) body.target_currency = cur;
    const res = await createTargetRoute(req('/x', 'POST', body));
    expect(res.status).toBe(201);
    expect(inserted().target_currency).toBe('USD');
  });
  it('target_currency explícita gana sobre la base (« usd » → USD, «eur» → EUR); «US», «USDX», 123, «€» → 400 field target_currency', async () => {
    session.organizationId = 121;
    await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: 'eur' }));
    expect(inserted().target_currency).toBe('EUR');
    db = seed();
    expect((await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: ' usd ' }))).status).toBe(201);
    expect(inserted().target_currency).toBe('USD');
    for (const cur of ['US', 'USDX', 123, '€']) {
      const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_currency: cur }));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('target_currency');
    }
    expect(db.writes.filter((w) => w.op === 'insert')).toHaveLength(1);
  });
  it('org 122 sin moneda base y sin target_currency → 400 honesto (field target_currency), sin escribir', async () => {
    session.organizationId = 122;
    const res = await createTargetRoute(req('/x', 'POST', validQuota));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('target_currency');
    expect(db.writes).toHaveLength(0);
  });
});

describe('montos y periodos basura (tester r3 §2/§3)', () => {
  it.each([['negativo', -1], ['cero', 0], ['texto', 'abc'], ['negativo como texto', '-5'], ['Infinity', '1e400'], ['null', null], ['array', []], ['objeto', {}], ['NaN', 'NaN']])(
    'POST cuota con target_amount %s → 400 field target_amount y sin escribir', async (_label, amount) => {
      const res = await createTargetRoute(req('/x', 'POST', { ...validQuota, target_amount: amount }));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('target_amount');
      expect(db.writes).toHaveLength(0);
    },
  );
  it.each([['ausente', undefined], ['null', null], ['vacío', ''], ['mayúsculas', 'MONTHLY'], ['semanal', 'weekly'], ['número', 1]])('POST con period %s → 400 field period, sin escribir', async (_label, period) => {
    const body: Record<string, unknown> = { ...validQuota };
    if (period === undefined) delete body.period; else body.period = period;
    const res = await createTargetRoute(req('/x', 'POST', body));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('period');
    expect(db.writes).toHaveLength(0);
  });
});
