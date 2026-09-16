/// <reference types="jest" />
/**
 * F13 — contrato de `/api/crm/sales-targets` (cuotas) que consume la pestaña
 * «Cuotas» del detalle del miembro. Doble con señuelos de la org 121; el rol
 * se cambia por prueba (escribir cuotas = admin/manager; leer = admin/manager
 * cualquiera, empleado solo las suyas).
 */

import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f13FakeSupabase';

class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const T = (id: string, org: number, extra: Row = {}): Row => ({
  id,
  organization_id: org,
  user_id: 'u-1',
  period: 'monthly',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  target_amount: 1000,
  target_currency: 'COP',
  target_type: 'revenue',
  achieved_amount: 0,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...extra,
});

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false };

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true },
        { id: 2, organization_id: 120, user_id: 'u-2', is_active: false },
        { id: 3, organization_id: 121, user_id: 'u-ajeno', is_active: true },
      ],
      sales_targets: [
        T('t-1', 120),
        T('t-2', 120, { user_id: 'u-2', target_type: 'calls', target_amount: 40 }),
        T('t-9', 121), // señuelo
      ],
      opportunities: [
        { id: 'op-1', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 600, closed_at: '2026-09-10T15:00:00Z' },
        { id: 'op-2', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 100, closed_at: '2026-10-01T03:00:00Z' }, // 30 sep 22:00 en Bogotá → cuenta
        { id: 'op-3', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 999, closed_at: '2026-10-01T06:00:00Z' }, // 1 oct 01:00 en Bogotá → fuera
        { id: 'op-9', organization_id: 121, salesperson_id: 'u-1', status: 'won', amount: 5000, closed_at: '2026-09-10T15:00:00Z' },
      ],
      activities: [],
      calls: [],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
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
import { GET as getList, POST as postCreate } from '../route';
import { PATCH as patchOne, DELETE as deleteOne } from '../[id]/route';
import { GET as getProgress } from '../progress/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  db = seed();
  session.roleId = 2;
  session.userId = 'u-admin';
  session.isSuperAdmin = false;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/sales-targets', () => {
  it('admin: cuotas de la org 120 (ninguna de la 121), con progreso calculado si se pide', async () => {
    const body = await (await getList(req('/api/crm/sales-targets?user_id=u-1&with_progress=1', 'GET'))).json();
    expect(body.success).toBe(true);
    expect(body.data.map((t: Row) => t.id)).toEqual(['t-1']);
    // 600 (10 sep) + 100 (30 sep 22:00 Bogotá); op-3 es 1 oct en Bogotá y op-9 es de otra org.
    expect(body.data[0].achieved_amount).toBe(700);
    expect(body.data[0].progress).toMatchObject({ target_amount: 1000, achieved_amount: 700, progress_pct: 70 });
    expect(body.data[0].progress_detail).toMatchObject({ pct: 70, status: expect.any(String), days_remaining: expect.any(Number) });
    expect(db.writes).toEqual([]); // el historial no escribe achieved_amount
  });
  it('empleado (4): solo sus cuotas aunque pida las de otro', async () => {
    session.roleId = 4;
    session.userId = 'u-2';
    const body = await (await getList(req('/api/crm/sales-targets?user_id=u-1', 'GET'))).json();
    expect(body.data.map((t: Row) => t.id)).toEqual(['t-2']);
  });
});

describe('POST /api/crm/sales-targets', () => {
  const ok = { user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 2500, target_type: 'revenue', target_currency: 'COP' };

  it('crea con la organización de la sesión y responde 201; organization_id ajeno en el body → 403 (regla dura 5)', async () => {
    expect((await postCreate(req('/api/crm/sales-targets', 'POST', { ...ok, organization_id: 121 }))).status).toBe(403);
    expect(db.writes).toEqual([]);
    const res = await postCreate(req('/api/crm/sales-targets', 'POST', { ...ok, organization_id: 120 }));
    expect(res.status).toBe(201);
    const w = db.writes.find((x) => x.op === 'insert');
    expect(w?.table).toBe('sales_targets');
    expect(w?.row).toMatchObject({ organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', target_amount: 2500, target_type: 'revenue', target_currency: 'COP', achieved_amount: 0 });
  });
  it('valida periodo, tipo, monto y fechas (400 con el campo)', async () => {
    for (const [patch, field] of [
      [{ period: 'weekly' }, 'period'],
      [{ target_type: 'points' }, 'target_type'],
      [{ target_amount: -1 }, 'target_amount'],
      [{ period_end: '2026-09-01' }, 'period_end'],
    ] as const) {
      const res = await postCreate(req('/api/crm/sales-targets', 'POST', { ...ok, ...patch }));
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.field).toBe(field);
    }
    expect(db.writes).toEqual([]);
  });
  it('el usuario debe ser miembro ACTIVO de la organización (u-2 inactivo, u-ajeno de otra org → 400)', async () => {
    expect((await postCreate(req('/api/crm/sales-targets', 'POST', { ...ok, user_id: 'u-2' }))).status).toBe(400);
    expect((await postCreate(req('/api/crm/sales-targets', 'POST', { ...ok, user_id: 'u-ajeno' }))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });
  it('duplicado (UNIQUE org+user+period+start+type) → 409', async () => {
    db.nextWriteError = { table: 'sales_targets', error: { code: '23505', message: 'duplicate key' } };
    const res = await postCreate(req('/api/crm/sales-targets', 'POST', ok));
    expect(res.status).toBe(409);
  });
  it('empleado (4) → 403 sin escribir', async () => {
    session.roleId = 4;
    expect((await postCreate(req('/api/crm/sales-targets', 'POST', ok))).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});

describe('PATCH / DELETE /api/crm/sales-targets/[id]', () => {
  it('PATCH actualiza solo campos permitidos, acotado por organización; achieved_amount no se acepta del cliente; organization_id ajeno → 403', async () => {
    expect((await patchOne(req('/api/crm/sales-targets/t-1', 'PATCH', { target_amount: 1500, organization_id: 121 }), params('t-1'))).status).toBe(403);
    expect(db.writes).toEqual([]);
    const res = await patchOne(req('/api/crm/sales-targets/t-1', 'PATCH', { target_amount: 1500, achieved_amount: 999999 }), params('t-1'));
    expect(res.status).toBe(200);
    const w = db.writes.find((x) => x.op === 'update');
    expect(w?.filters).toMatchObject({ id: 't-1', organization_id: 120 });
    expect(w?.row).toMatchObject({ target_amount: 1500 });
    expect(w?.row).not.toHaveProperty('achieved_amount');
    expect(w?.row).not.toHaveProperty('organization_id');
  });
  it('PATCH con monto inválido → 400; de otra org → 404', async () => {
    expect((await patchOne(req('/api/crm/sales-targets/t-1', 'PATCH', { target_amount: 0 }), params('t-1'))).status).toBe(400);
    expect((await patchOne(req('/api/crm/sales-targets/t-9', 'PATCH', { target_amount: 5 }), params('t-9'))).status).toBe(404);
  });
  it('DELETE acotado por organización; empleado → 403', async () => {
    expect((await deleteOne(req('/api/crm/sales-targets/t-1', 'DELETE'), params('t-1'))).status).toBe(200);
    expect(db.writes.find((x) => x.op === 'delete')?.filters).toMatchObject({ id: 't-1', organization_id: 120 });
    session.roleId = 4;
    expect((await deleteOne(req('/api/crm/sales-targets/t-1', 'DELETE'), params('t-1'))).status).toBe(403);
  });
});

describe('GET /api/crm/sales-targets/progress', () => {
  it('calcula con la zona horaria de la organización y persiste achieved_amount acotado por org', async () => {
    const body = await (await getProgress(req('/api/crm/sales-targets/progress?user_id=u-1&period=monthly', 'GET'))).json();
    expect(body.data).toEqual([expect.objectContaining({ target_id: 't-1', achieved_amount: 700, progress_pct: 70 })]);
    const w = db.writes.find((x) => x.op === 'update');
    expect(w?.filters).toMatchObject({ id: 't-1', organization_id: 120 });
  });
  it('empleado: user_id ajeno → 403', async () => {
    session.roleId = 4;
    session.userId = 'u-2';
    expect((await getProgress(req('/api/crm/sales-targets/progress?user_id=u-1', 'GET'))).status).toBe(403);
  });
});
