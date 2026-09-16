/// <reference types="jest" />
/**
 * F13 — contrato de las rutas de comisiones que consume `/app/finanzas/comisiones`.
 *
 * `@/lib/utils/orgContext` se dobla con fábrica; el cliente Supabase es
 * `f13FakeSupabase` (aplica filtros y registra escrituras; señuelos de la
 * organización 121). El rol de sesión se cambia por prueba: dinero → solo
 * admin/manager (ids 1, 2, 5), resuelto en el servidor.
 */

import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f13FakeSupabase';

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

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id,
  organization_id: org,
  branch_id: null,
  commission_type: 'salesperson',
  source_type: 'invoice_sale',
  source_id: `inv-${id}`,
  source_item_id: null,
  payee_type: 'employee',
  payee_id: 'u-1',
  payee_name: 'Ana Vendedora',
  base_amount: 1000,
  commission_rate: 10,
  commission_amount: 100,
  currency: 'COP',
  status: 'accrued',
  accrued_at: '2026-09-05T15:00:00Z',
  paid_at: null,
  notes: null,
  metadata: null,
  created_by: null,
  created_at: '2026-09-05T15:00:00Z',
  updated_at: '2026-09-05T15:00:00Z',
  ...extra,
});

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false };

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-10T12:00:00Z', payee_id: 'u-2', payee_name: 'Beto', commission_amount: 250, source_type: 'opportunity', source_id: 'op-1' }),
        C('c-3', 120, { status: 'cancelled', metadata: { reason: 'rejected' }, commission_amount: 40, accrued_at: '2026-08-20T15:00:00Z' }),
        C('c-9', 121), // señuelo: misma forma, otra organización
        C('c-8', 121, { status: 'paid', paid_at: '2026-09-10T12:00:00Z' }),
      ],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: 120,
    userId: session.userId,
    roleId: session.roleId,
    roleName: 'x',
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { NextRequest } from 'next/server';
import { GET as getList } from '../route';
import { POST as postPay } from '../[id]/pay/route';
import { POST as postReject } from '../[id]/reject/route';
import { POST as postClawback } from '../[id]/clawback/route';
import { POST as postBulkPay } from '../bulk-pay/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  db = seed();
  session.roleId = 2;
  session.userId = 'u-admin';
  session.isSuperAdmin = false;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/commissions', () => {
  it('admin: devuelve las de la org 120 con resumen; ninguna de la 121', async () => {
    const res = await getList(new NextRequest('http://localhost/api/crm/commissions'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((c: Row) => c.id).sort()).toEqual(['c-1', 'c-2', 'c-3']);
    expect(body.count).toBe(3);
    expect(body.summary).toEqual({
      currency: 'COP',
      accrued_total: 350,
      pending_total: 100,
      paid_total: 250,
      cancelled_total: 40,
      rejected_total: 40,
      clawback_total: 0,
      count: 3,
      count_pending: 1,
      count_paid: 1,
      count_cancelled: 1,
    });
  });

  it('filtra por estado, miembro, origen y periodo (día calendario en la zona de la organización)', async () => {
    const byStatus = await (await getList(new NextRequest('http://localhost/api/crm/commissions?status=paid'))).json();
    expect(byStatus.data.map((c: Row) => c.id)).toEqual(['c-2']);
    const byPayee = await (await getList(new NextRequest('http://localhost/api/crm/commissions?payee_id=u-1'))).json();
    expect(byPayee.data.map((c: Row) => c.id).sort()).toEqual(['c-1', 'c-3']);
    const bySource = await (await getList(new NextRequest('http://localhost/api/crm/commissions?source_type=opportunity'))).json();
    expect(bySource.data.map((c: Row) => c.id)).toEqual(['c-2']);
    const byPeriod = await (await getList(new NextRequest('http://localhost/api/crm/commissions?from=2026-09-01&to=2026-09-30'))).json();
    expect(byPeriod.data.map((c: Row) => c.id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('rechaza un estado que no existe en el CHECK de la BD (400)', async () => {
    const res = await getList(new NextRequest('http://localhost/api/crm/commissions?status=rejected'));
    expect(res.status).toBe(400);
  });

  it('un empleado (rol 4) solo ve sus propias comisiones aunque pida las de otro', async () => {
    session.roleId = 4;
    session.userId = 'u-1';
    const body = await (await getList(new NextRequest('http://localhost/api/crm/commissions?payee_id=u-2'))).json();
    expect(body.data.map((c: Row) => c.id).sort()).toEqual(['c-1', 'c-3']);
    expect(body.can_manage).toBe(false);
  });
});

describe('POST /api/crm/commissions/[id]/pay', () => {
  it('accrued → paid, escribiendo con organization_id y status=accrued como condición', async () => {
    const res = await postPay(json('/api/crm/commissions/c-1/pay', {}), params('c-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: 'c-1', status: 'paid' });
    expect(typeof body.data.paid_at).toBe('string');
    const w = db.writes.find((x) => x.op === 'update');
    expect(w?.filters).toMatchObject({ id: 'c-1', organization_id: 120, status: 'accrued' });
  });

  it('paid → pay es 409 y no escribe nada', async () => {
    const res = await postPay(json('/api/crm/commissions/c-2/pay', {}), params('c-2'));
    expect(res.status).toBe(409);
    expect(db.writes).toEqual([]);
  });

  it('una comisión de la org 121 es 404 aunque exista', async () => {
    const res = await postPay(json('/api/crm/commissions/c-9/pay', {}), params('c-9'));
    expect(res.status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('rol empleado (4) → 403 sin tocar la BD', async () => {
    session.roleId = 4;
    const res = await postPay(json('/api/crm/commissions/c-1/pay', {}), params('c-1'));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });

  it('manager (5) sí puede pagar', async () => {
    session.roleId = 5;
    const res = await postPay(json('/api/crm/commissions/c-1/pay', {}), params('c-1'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/crm/commissions/[id]/reject', () => {
  it('accrued → cancelled con metadata.reason=rejected y el motivo en notes', async () => {
    const res = await postReject(json('/api/crm/commissions/c-1/reject', { reason: 'Factura anulada' }), params('c-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ status: 'cancelled', notes: 'Factura anulada', metadata: { reason: 'rejected', rejected_by: 'u-admin' } });
    const w = db.writes.find((x) => x.op === 'update');
    expect(w?.row?.status).toBe('cancelled');
    expect(w?.filters).toMatchObject({ organization_id: 120, status: 'accrued' });
  });
  it('sin motivo → 400', async () => {
    const res = await postReject(json('/api/crm/commissions/c-1/reject', { reason: '  ' }), params('c-1'));
    expect(res.status).toBe(400);
  });
  it('una pagada no se rechaza (409): para eso está el clawback', async () => {
    const res = await postReject(json('/api/crm/commissions/c-2/reject', { reason: 'x' }), params('c-2'));
    expect(res.status).toBe(409);
  });
  it('organization_id ajeno en el body → 403 y registro (regla dura 5); la misma organización se ignora y manda la sesión', async () => {
    const res = await postReject(json('/api/crm/commissions/c-9/reject', { reason: 'x', organization_id: 121 }), params('c-9'));
    expect(res.status).toBe(403);
    expect(db.writes).toHaveLength(0);
    const same = await postReject(json('/api/crm/commissions/c-9/reject', { reason: 'x', organization_id: 120 }), params('c-9'));
    expect(same.status).toBe(404);
  });
});

describe('POST /api/crm/commissions/[id]/clawback', () => {
  it('paid → cancelled conservando paid_at y guardando paid_at_before_clawback', async () => {
    const res = await postClawback(json('/api/crm/commissions/c-2/clawback', { reason: 'Reembolso al cliente' }), params('c-2'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      status: 'cancelled',
      paid_at: '2026-09-10T12:00:00Z',
      notes: 'Reembolso al cliente',
      metadata: { reason: 'clawback', clawback_of_paid: true, paid_at_before_clawback: '2026-09-10T12:00:00Z', clawback_by: 'u-admin' },
    });
    const w = db.writes.find((x) => x.op === 'update');
    expect(w?.filters).toMatchObject({ id: 'c-2', organization_id: 120, status: 'paid' });
  });
  it('accrued → clawback es 409', async () => {
    const res = await postClawback(json('/api/crm/commissions/c-1/clawback', { reason: 'x' }), params('c-1'));
    expect(res.status).toBe(409);
  });
  it('sin motivo → 400; rol 4 → 403', async () => {
    expect((await postClawback(json('/api/crm/commissions/c-2/clawback', {}), params('c-2'))).status).toBe(400);
    session.roleId = 4;
    expect((await postClawback(json('/api/crm/commissions/c-2/clawback', { reason: 'x' }), params('c-2'))).status).toBe(403);
  });
});

describe('POST /api/crm/commissions/bulk-pay', () => {
  it('paga las accrued de la org; las pagadas y las de otra org quedan en failed con motivo', async () => {
    const res = await postBulkPay(json('/api/crm/commissions/bulk-pay', { commission_ids: ['c-1', 'c-2', 'c-9', 'c-1'] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.paid).toEqual(['c-1']);
    expect(body.data.failed.map((f: { id: string }) => f.id).sort()).toEqual(['c-2', 'c-9']);
    const updates = db.writes.filter((w) => w.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toMatchObject({ organization_id: 120, status: 'accrued' });
  });
  it('body vacío → 400; rol 4 → 403', async () => {
    expect((await postBulkPay(json('/api/crm/commissions/bulk-pay', { commission_ids: [] }))).status).toBe(400);
    session.roleId = 4;
    expect((await postBulkPay(json('/api/crm/commissions/bulk-pay', { commission_ids: ['c-1'] }))).status).toBe(403);
  });
});
