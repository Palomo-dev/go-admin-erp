/// <reference types="jest" />
/**
 * F13 — ronda 2, rutas y servicios: regla dura 5 (organización ajena en el
 * body → 403 + registro, sin escribir), errores de BD que no se disfrazan de
 * ceros (502 honesto), PATCH parcial validado contra la fila existente y
 * moneda por defecto = moneda base de la organización (nunca «COP» cableado).
 *
 * Doble: `f13FakeSupabase` con señuelos de la organización 121.
 */

import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message, statusCode, code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, organizationId: 120 };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: session.organizationId,
    userId: session.userId,
    roleId: session.roleId,
    roleName: 'x',
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { NextRequest } from 'next/server';
import { calculateAchievedAmount } from '../salesTargetService';
import { getSellerDashboard } from '../sellerDashboardService';
import { POST as payRoute } from '@/app/api/crm/commissions/[id]/pay/route';
import { POST as rejectRoute } from '@/app/api/crm/commissions/[id]/reject/route';
import { POST as clawbackRoute } from '@/app/api/crm/commissions/[id]/clawback/route';
import { POST as bulkPayRoute } from '@/app/api/crm/commissions/bulk-pay/route';
import { GET as listRoute } from '@/app/api/crm/commissions/route';
import { POST as createTargetRoute } from '@/app/api/crm/sales-targets/route';
import { DELETE as deleteTargetRoute, PATCH as patchTargetRoute } from '@/app/api/crm/sales-targets/[id]/route';
import { GET as progressRoute } from '@/app/api/crm/sales-targets/progress/route';
import { GET as dashboardRoute } from '@/app/api/crm/seller-dashboard/route';

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, branch_id: null, commission_type: 'salesperson', source_type: 'invoice_sale', source_id: `inv-${id}`,
  source_item_id: null, payee_type: 'employee', payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_rate: 10,
  commission_amount: 100, currency: 'COP', status: 'accrued', accrued_at: '2026-09-05T15:00:00Z', paid_at: null, notes: null,
  metadata: null, created_by: null, created_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z', ...extra,
});
const T = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30',
  target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0, ...extra,
});

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }, { id: 122, timezone: 'UTC' }],
      organization_currencies: [
        { organization_id: 120, currency_code: 'COP', is_base: true },
        { organization_id: 121, currency_code: 'USD', is_base: true },
        { organization_id: 121, currency_code: 'COP', is_base: false },
      ],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true },
        { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true },
        { id: 3, organization_id: 121, user_id: 'u-1', is_active: true },
        { id: 4, organization_id: 122, user_id: 'u-1', is_active: true },
      ],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-10T12:00:00Z' }),
        C('c-usd', 120, { currency: 'USD', commission_amount: 11344.54 }),
        C('c-9', 121),
      ],
      sales_targets: [T('t-1', 120), T('t-9', 121)],
      opportunities: [],
      tasks: [],
      activities: [],
      calls: [],
      stages: [],
    },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;

let warn: jest.SpyInstance;
beforeEach(() => {
  db = seed();
  session.roleId = 2;
  session.userId = 'u-admin';
  session.isSuperAdmin = false;
  session.organizationId = 120;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('R2-1 — regla dura 5: organization_id ajeno en el body → 403 + console.warn, sin escribir (8 rutas)', () => {
  const foreign = { organization_id: 121 };
  const cases: Array<[string, () => Promise<Response>]> = [
    ['pay', () => payRoute(req('/x', 'POST', foreign), params('c-1'))],
    ['reject', () => rejectRoute(req('/x', 'POST', { reason: 'r', ...foreign }), params('c-1'))],
    ['clawback', () => clawbackRoute(req('/x', 'POST', { reason: 'r', ...foreign }), params('c-2'))],
    ['bulk-pay', () => bulkPayRoute(req('/x', 'POST', { commission_ids: ['c-1'], ...foreign }))],
    ['sales-targets POST', () => createTargetRoute(req('/x', 'POST', { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 5, ...foreign }))],
    ['sales-targets PATCH', () => patchTargetRoute(req('/x', 'PATCH', { target_amount: 5, ...foreign }), params('t-1'))],
    ['sales-targets DELETE', () => deleteTargetRoute(req('/x', 'DELETE', foreign), params('t-1'))],
    ['sales-targets/progress (escribe achieved_amount)', () => progressRoute(req('/x?user_id=u-1&organization_id=121', 'GET'))],
  ];
  for (const [name, call] of cases) {
    it(`${name}: 403, warn registrado, cero escrituras`, async () => {
      const res = await call();
      expect(res.status).toBe(403);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls[0])).toContain('121');
      expect(db.writes).toHaveLength(0);
    });
  }
  it('la MISMA organización en el body no es un ataque: pay sigue en 200 y no registra', async () => {
    const res = await payRoute(req('/x', 'POST', { organization_id: 120 }), params('c-1'));
    expect(res.status).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  });
  it('organization_id como texto «121» también se rechaza; «120» pasa', async () => {
    expect((await rejectRoute(req('/x', 'POST', { reason: 'r', organization_id: '121' }), params('c-1'))).status).toBe(403);
    db = seed();
    expect((await rejectRoute(req('/x', 'POST', { reason: 'r', organization_id: '120' }), params('c-1'))).status).toBe(200);
  });
});

describe('R2-2 — los errores de BD no son ceros', () => {
  it('calculateAchievedAmount propaga el error de cada consulta (revenue, deals, activities, calls)', async () => {
    for (const [type, table] of [['revenue', 'opportunities'], ['deals', 'opportunities'], ['activities', 'activities'], ['calls', 'calls']] as const) {
      db.nextReadError = { table, error: { code: '57014', message: 'statement timeout' } };
      await expect(calculateAchievedAmount(120, 'u-1', type, '2026-09-01', '2026-09-30', supa(), 'UTC')).rejects.toMatchObject({ message: expect.stringContaining('statement timeout') });
    }
  });
  it('getSellerDashboard propaga el error de cada una de sus consultas en lugar de devolver listas vacías', async () => {
    for (const table of ['sales_targets', 'commissions', 'opportunities', 'tasks', 'organization_currencies']) {
      db = seed();
      db.nextReadError = { table, error: { code: '57014', message: `boom ${table}` } };
      await expect(getSellerDashboard(120, 'u-1', 'UTC', supa(), { includeLeaderboard: false })).rejects.toMatchObject({ message: expect.stringContaining(table) });
    }
  });
  it('ranking: el error de organization_members / opportunities también se propaga', async () => {
    db.nextReadError = { table: 'organization_members', error: { code: '57014', message: 'boom members' } };
    await expect(getSellerDashboard(120, 'u-1', 'UTC', supa(), { includeLeaderboard: true })).rejects.toMatchObject({ message: expect.stringContaining('members') });
  });
  it('ruta del panel: error de BD → 502 con mensaje honesto, nunca 200 con «Sin comisiones»', async () => {
    db.nextReadError = { table: 'commissions', error: { code: '57014', message: 'canceling statement' } };
    const res = await dashboardRoute();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/no respondi|base de datos/i);
  });
  it('ruta de cuotas con progreso: error al calcular el logrado → 502, no «0 %»', async () => {
    db.nextReadError = { table: 'opportunities', error: { code: '57014', message: 'timeout' } };
    const { GET } = await import('@/app/api/crm/sales-targets/route');
    const res = await GET(req('/api/crm/sales-targets?user_id=u-1&with_progress=1', 'GET'));
    expect(res.status).toBe(502);
  });
  it('un 23505 sigue siendo 409 (no se convierte en 502)', async () => {
    db.nextWriteError = { table: 'sales_targets', error: { code: '23505', message: 'duplicate key' } };
    const res = await createTargetRoute(req('/x', 'POST', { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 5 }));
    expect(res.status).toBe(409);
  });
});

describe('R2-3 — PATCH parcial validado contra la fila existente', () => {
  it('period_end anterior al period_start existente → 400 sin escribir', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period_end: '2026-08-01' }), params('t-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('period_end');
    expect(db.writes).toHaveLength(0);
  });
  it('cambiar solo period a quarterly con límites mensuales existentes → 400 (incoherente)', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period: 'quarterly' }), params('t-1'));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
  it('mover la cuota a octubre completo (period_start + period_end coherentes) → 200 y escribe solo esos campos', async () => {
    const res = await patchTargetRoute(req('/x', 'PATCH', { period_start: '2026-10-01', period_end: '2026-10-31' }), params('t-1'));
    expect(res.status).toBe(200);
    const w = db.writes.find((x) => x.op === 'update')!;
    expect(w.filters).toMatchObject({ id: 't-1', organization_id: 120 });
    expect(w.row).toMatchObject({ period_start: '2026-10-01', period_end: '2026-10-31' });
    expect(w.row).not.toHaveProperty('target_amount');
  });
  it('cambiar target_type a calls con meta decimal existente → 400 (conteo entero); con meta entera → 200', async () => {
    db.rows.sales_targets[0].target_amount = 12.5;
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_type: 'calls' }), params('t-1'))).status).toBe(400);
    db.rows.sales_targets[0].target_amount = 12;
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_type: 'calls' }), params('t-1'))).status).toBe(200);
  });
  it('cuota de otra organización → 404 antes de validar', async () => {
    expect((await patchTargetRoute(req('/x', 'PATCH', { target_amount: 5 }), params('t-9'))).status).toBe(404);
    expect(db.writes).toHaveLength(0);
  });
});

describe('R2-4 — moneda por defecto = moneda base de la organización', () => {
  const body = { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 10 };
  it('org 121 (base USD) sin target_currency → se guarda USD, no «COP»', async () => {
    session.organizationId = 121;
    const res = await createTargetRoute(req('/x', 'POST', body));
    expect(res.status).toBe(201);
    expect(db.writes.find((x) => x.op === 'insert')!.row!.target_currency).toBe('USD');
  });
  it('org 122 sin moneda base y sin target_currency → 400 honesto (field target_currency), sin escribir', async () => {
    session.organizationId = 122;
    const res = await createTargetRoute(req('/x', 'POST', body));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('target_currency');
    expect(db.writes).toHaveLength(0);
  });
  it('target_currency explícita gana sobre la base', async () => {
    session.organizationId = 121;
    await createTargetRoute(req('/x', 'POST', { ...body, target_currency: 'eur' }));
    expect(db.writes.find((x) => x.op === 'insert')!.row!.target_currency).toBe('EUR');
  });
});

describe('R2-5 — resumen y panel multi-moneda (18 COP + 1 USD de la org 113, reproducido)', () => {
  it('GET /api/crm/commissions: summary en la moneda base y summary_others con la USD aparte (sin suma cruzada)', async () => {
    const json = await (await listRoute(req('/api/crm/commissions', 'GET'))).json();
    expect(json.currency).toBe('COP');
    expect(json.summary).toMatchObject({ currency: 'COP', count: 2, accrued_total: 200, pending_total: 100, paid_total: 100 });
    expect(json.summary_others).toEqual([expect.objectContaining({ currency: 'USD', count: 1, pending_total: 11344.54, accrued_total: 11344.54 })]);
  });
  it('panel del vendedor: la cuota vigente es SOLO la del usuario de la sesión (la de otro miembro de la misma org no se cuela)', async () => {
    session.userId = 'u-1';
    db.rows.sales_targets = [T('t-admin', 120, { user_id: 'u-admin', target_amount: 999 }), T('t-ajena', 121, { user_id: 'u-1' })];
    jest.useFakeTimers({ now: new Date('2026-09-15T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const json = await (await dashboardRoute()).json();
    jest.useRealTimers();
    expect(json.data.quota).toBeNull();
    db.rows.sales_targets.push(T('t-mia', 120, { target_amount: 500 }));
    jest.useFakeTimers({ now: new Date('2026-09-15T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const json2 = await (await dashboardRoute()).json();
    jest.useRealTimers();
    expect(json2.data.quota.target.id).toBe('t-mia');
  });
  it('panel del vendedor: commissions (base) intacto y commissions_others con la USD', async () => {
    session.userId = 'u-1';
    jest.useFakeTimers({ now: new Date('2026-09-15T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const json = await (await dashboardRoute()).json();
    jest.useRealTimers();
    expect(json.data.commissions).toEqual({ accrued: 100, paid: 100, total: 200, count: 2 });
    expect(json.data.commissions_others).toEqual([{ currency: 'USD', accrued: 11344.54, paid: 0, total: 11344.54, count: 1 }]);
  });
});
