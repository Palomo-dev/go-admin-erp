/// <reference types="jest" />
/**
 * F13 — casos únicos consolidados de las rondas (2026-09-21): rutas de
 * comisiones y del panel del vendedor. Vienen de `f13Round1Tester` (tester r1),
 * `f13Round2Routes` (constructor r2), `f13Round2Tester` (tester r2) y
 * `f13Round3Tester` (tester r3). Cubre: regla dura 5 en las 4 rutas de dinero
 * (403 + registro, sin escribir; texto «121»; la misma org no registra), rol por
 * id (nunca por nombre; super admin del servidor), resumen que respeta el filtro
 * y los días calendario inclusivos en la zona de la org, importes negativos,
 * varias monedas (base + `summary_others` / `commissions_others`), 502 honesto,
 * `organization_id` ajeno en el QUERY de las lecturas y lotes malformados.
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
import { GET as listRoute } from '@/app/api/crm/commissions/route';
import { POST as payRoute } from '@/app/api/crm/commissions/[id]/pay/route';
import { POST as rejectRoute } from '@/app/api/crm/commissions/[id]/reject/route';
import { POST as clawbackRoute } from '@/app/api/crm/commissions/[id]/clawback/route';
import { POST as bulkPayRoute } from '@/app/api/crm/commissions/bulk-pay/route';
import { GET as dashboardRoute } from '@/app/api/crm/seller-dashboard/route';

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, branch_id: null, commission_type: 'salesperson', source_type: 'invoice_sale', source_id: `inv-${id}`, source_item_id: null,
  payee_type: 'employee', payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_rate: 10, commission_amount: 100, currency: 'COP',
  status: 'accrued', accrued_at: '2026-09-05T15:00:00Z', paid_at: null, notes: null, metadata: null, created_by: null, created_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z', ...extra,
});
const T = (id: string, org: number, extra: Row = {}): Row => ({ id, organization_id: org, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0, ...extra });

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }, { organization_id: 121, currency_code: 'USD', is_base: true }],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true }, { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true }, { id: 3, organization_id: 121, user_id: 'u-ajeno', is_active: true },
      ],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-10T12:00:00Z', metadata: { origen: 'factura' } }),
        C('c-3', 120, { payee_id: 'u-admin', payee_name: 'Admin', accrued_at: '2026-09-12T15:00:00Z' }),
        C('c-usd', 120, { currency: 'USD', commission_amount: 11344.54 }),
        C('c-eur', 120, { currency: 'EUR', commission_amount: 7, status: 'paid', paid_at: 'P' }),
        C('c-9', 121),
        C('c-9p', 121, { status: 'paid', paid_at: '2026-09-06T10:00:00Z' }),
      ],
      sales_targets: [T('t-1', 120)], opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const row = (id: string) => db.rows.commissions.find((r) => r.id === id)!;
const updates = () => db.writes.filter((w) => w.op === 'update');
const atSept15 = () => jest.useFakeTimers({ now: new Date('2026-09-15T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

let warn: jest.SpyInstance;
beforeEach(() => {
  db = seed();
  session.roleId = 2; session.userId = 'u-admin'; session.isSuperAdmin = false; session.roleName = 'x'; session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('regla dura 5 en las rutas de dinero (r2 R2-1, tester r2 R2T-1.5)', () => {
  const foreign = { organization_id: 121 };
  const cases: Array<[string, () => Promise<Response>]> = [
    ['pay', () => payRoute(req('/x', 'POST', foreign), params('c-1'))],
    ['reject', () => rejectRoute(req('/x', 'POST', { reason: 'r', ...foreign }), params('c-1'))],
    ['clawback', () => clawbackRoute(req('/x', 'POST', { reason: 'r', ...foreign }), params('c-2'))],
    ['bulk-pay', () => bulkPayRoute(req('/x', 'POST', { commission_ids: ['c-1'], ...foreign }))],
  ];
  for (const [name, call] of cases) {
    it(`${name}: 403, warn registrado con la org ajena, cero escrituras`, async () => {
      expect((await call()).status).toBe(403);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls[0])).toContain('121');
      expect(db.writes).toHaveLength(0);
    });
  }
  it('la MISMA organización en el body (número o texto «120») no es un ataque: 200 sin registro; «121» como texto también se rechaza', async () => {
    expect((await payRoute(req('/x', 'POST', { organization_id: '120' }), params('c-1'))).status).toBe(200);
    expect(row('c-1').status).toBe('paid');
    expect(warn).not.toHaveBeenCalled();
    expect((await rejectRoute(req('/x', 'POST', { reason: 'r', organization_id: '121' }), params('c-3'))).status).toBe(403);
    expect((await rejectRoute(req('/x', 'POST', { reason: 'r', organization_id: 120 }), params('c-3'))).status).toBe(200);
  });
});

describe('rol por id, resumen y filtros (tester r1 T3)', () => {
  it('T3.1/T3.2: roleName «Admin de organización» con roleId 4 → 403 en pay/bulk-pay/clawback; roleId 3 (Cliente) → 403; super admin con roleId 4 → 200', async () => {
    session.roleId = 4; session.roleName = 'Admin de organización';
    expect((await payRoute(req('/x', 'POST'), params('c-1'))).status).toBe(403);
    expect((await clawbackRoute(req('/x', 'POST', { reason: 'x' }), params('c-2'))).status).toBe(403);
    session.roleId = 3;
    expect((await bulkPayRoute(req('/x', 'POST', { commission_ids: ['c-1'] }))).status).toBe(403);
    expect(db.writes).toHaveLength(0);
    session.roleId = 4; session.isSuperAdmin = true;
    expect((await payRoute(req('/x', 'POST'), params('c-1'))).status).toBe(200);
  });
  it('T3.5: el resumen respeta el mismo filtro que la lista (status=paid → solo la pagada en la moneda base, no toda la organización)', async () => {
    const json = await (await listRoute(req('/api/crm/commissions?status=paid', 'GET'))).json();
    expect(json.data.map((r: Row) => r.id).sort()).toEqual(['c-2', 'c-eur']);
    expect(json.summary).toMatchObject({ currency: 'COP', count: 1, paid_total: 100, pending_total: 0, accrued_total: 100 });
  });
  it('T3.6: from/to son días calendario INCLUSIVOS en la zona de la organización: to=2026-09-05 incluye lo devengado ese día a las 10:00 Bogotá (15:00Z)', async () => {
    const json = await (await listRoute(req('/api/crm/commissions?from=2026-09-05&to=2026-09-05', 'GET'))).json();
    expect(json.data.map((r: Row) => r.id).sort()).toEqual(['c-1', 'c-2', 'c-eur', 'c-usd']);
    expect(db.writes).toHaveLength(0);
  });
  it('tester r3 2.6: una comisión con importe negativo (numeric sin CHECK en la BD) resta del pendiente y del devengado en vez de desaparecer', async () => {
    db.rows.commissions.push(C('c-neg', 120, { commission_amount: -40 }));
    const json = await (await listRoute(req('/api/crm/commissions?payee_id=u-1', 'GET'))).json();
    expect(json.summary).toMatchObject({ currency: 'COP', count: 3, pending_total: 60, paid_total: 100, accrued_total: 160, count_pending: 2 });
  });
  it('tester r3 1.3: clawback sobre una ya revertida → 409 INVALID_TRANSITION sin segunda escritura; sobre una pagada de otra org → 404', async () => {
    expect((await clawbackRoute(req('/x', 'POST', { reason: 'devolución' }), params('c-2'))).status).toBe(200);
    const second = await clawbackRoute(req('/x', 'POST', { reason: 'otra vez' }), params('c-2'));
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe('INVALID_TRANSITION');
    expect(updates()).toHaveLength(1);
    expect(row('c-2').notes).toBe('devolución');
    expect((await clawbackRoute(req('/x', 'POST', { reason: 'x' }), params('c-9p'))).status).toBe(404);
    expect(updates()).toHaveLength(1);
  });
});

describe('varias monedas y 502 honesto (tester r2 R2T-2/R2T-4, r2 R2-2/R2-5, tester r3 4.7)', () => {
  it('GET /api/crm/commissions: summary solo en la base (COP) y summary_others con EUR y USD aparte, ordenadas; currency de la org', async () => {
    const json = await (await listRoute(req('/api/crm/commissions', 'GET'))).json();
    expect(json.currency).toBe('COP');
    expect(json.summary).toMatchObject({ currency: 'COP', count: 3, pending_total: 200, paid_total: 100, accrued_total: 300 });
    expect(json.summary_others).toEqual([
      expect.objectContaining({ currency: 'EUR', count: 1, paid_total: 7 }),
      expect.objectContaining({ currency: 'USD', count: 1, pending_total: 11344.54, accrued_total: 11344.54 }),
    ]);
  });
  it('panel del vendedor: commissions solo en la base y commissions_others con EUR/USD del mes; la cuota vigente es SOLO la del usuario de la sesión', async () => {
    atSept15();
    session.userId = 'u-1';
    db.rows.sales_targets = [T('t-admin', 120, { user_id: 'u-admin', target_amount: 999 }), T('t-ajena', 121)];
    const json = await (await dashboardRoute()).json();
    expect(json.data.commissions).toEqual({ accrued: 100, paid: 100, total: 200, count: 2 });
    expect(json.data.commissions_others).toEqual([{ currency: 'EUR', accrued: 0, paid: 7, total: 7, count: 1 }, { currency: 'USD', accrued: 11344.54, paid: 0, total: 11344.54, count: 1 }]);
    expect(json.data.quota).toBeNull();
    db.rows.sales_targets.push(T('t-mia', 120, { target_amount: 500 }));
    expect((await (await dashboardRoute()).json()).data.quota.target.id).toBe('t-mia');
    expect(db.writes).toHaveLength(0);
  });
  it('ruta del panel: error de BD en commissions → 502 con mensaje honesto; en organizations (getOrgTimezone) → 502 UPSTREAM_DATA; nunca 200 con «Sin comisiones»', async () => {
    db.nextReadError = { table: 'commissions', error: { code: '57014', message: 'canceling statement' } };
    const res = await dashboardRoute();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/no respondi|base de datos/i);
    db.nextReadError = { table: 'organizations', error: { code: 'XX000', message: 'boom' } };
    const r2 = await dashboardRoute();
    expect(r2.status).toBe(502);
    expect((await r2.json()).code).toBe('UPSTREAM_DATA');
  });
  it('panel del vendedor: org sin moneda base y sin comisiones → currency null (el cliente cae a la de la org), sin 500', async () => {
    session.organizationId = 121; session.userId = 'u-ajeno';
    db.rows.organization_currencies = [];
    db.rows.commissions = [];
    const res = await dashboardRoute();
    expect(res.status).toBe(200);
    expect((await res.json()).data.currency).toBeNull();
  });
});

describe('organization_id ajeno en el QUERY de las lecturas: la sesión manda (tester r3 §5)', () => {
  it('GET /api/crm/commissions?organization_id=121 nunca devuelve filas de la 121', async () => {
    const res = await listRoute(req('/api/crm/commissions?organization_id=121', 'GET'));
    const json = await res.json();
    if (res.status === 200) {
      expect(json.data.every((c: Row) => c.organization_id === 120)).toBe(true);
      expect(json.data.map((c: Row) => c.id)).not.toContain('c-9');
    } else {
      expect(res.status).toBe(403);
    }
  });
  it('GET /api/crm/seller-dashboard (no lee query): comisiones solo de la 120 (el señuelo c-9 de u-1 en la 121 no cuenta)', async () => {
    atSept15();
    session.userId = 'u-1';
    const res = await dashboardRoute();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.commissions.count).toBe(2);
    expect(json.data.commissions_others.map((o: { currency: string }) => o.currency)).toEqual(['EUR', 'USD']);
  });
});

describe('bulk-pay: lotes malformados y tope (tester r3 §6)', () => {
  it('commission_ids como texto, objeto o números → 400 sin escribir; [1, null, "", "c-1"] paga solo c-1', async () => {
    for (const ids of ['c-1', { 0: 'c-1' }, [1, 2]]) expect((await bulkPayRoute(req('/x', 'POST', { commission_ids: ids }))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
    const res = await bulkPayRoute(req('/x', 'POST', { commission_ids: [1, null, '', 'c-1'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ paid: ['c-1'], failed: [] });
    expect(updates()).toHaveLength(1);
  });
  it('201 ids → 400 sin tocar ninguna; 200 ids repetidos se deduplican a una', async () => {
    expect((await bulkPayRoute(req('/x', 'POST', { commission_ids: Array.from({ length: 201 }, (_, i) => `c-${i}`) }))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
    const dup = await bulkPayRoute(req('/x', 'POST', { commission_ids: Array.from({ length: 200 }, () => 'c-1') }));
    expect(dup.status).toBe(200);
    expect((await dup.json()).data.paid).toEqual(['c-1']);
    expect(updates()).toHaveLength(1);
  });
});
