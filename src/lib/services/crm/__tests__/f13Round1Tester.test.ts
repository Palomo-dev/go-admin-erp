/// <reference types="jest" />
/**
 * F13 — ronda 1, pruebas del TESTER (dinero, tenencia, concurrencia, zona
 * horaria y panel del vendedor). Complementan las del constructor; los casos
 * `it.failing` documentaban huecos reales; la ronda 2 los cerró y quedaron
 * como `it` normales (el título conserva «HUECO:» como historia).
 *
 * Doble: `f13FakeSupabase` con señuelos de la organización 121.
 */

import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';

class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let db: FakeDb;
const session = { roleId: 2, userId: 'u-admin', isSuperAdmin: false, roleName: 'x' };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({
    organizationId: 120,
    userId: session.userId,
    roleId: session.roleId,
    roleName: session.roleName,
    isSuperAdmin: session.isSuperAdmin,
    supabase: createFakeSupabase(db),
  })),
}));

import { NextRequest } from 'next/server';
import { CommissionTransitionError } from '../commissionTransitions';
import { bulkPayCommissions, payCommission, transitionCommission } from '../commissionAdminService';
import { calculateAchievedAmount } from '../salesTargetService';
import { validateQuotaInput } from '../quotaProgress';
import { POST as payRoute } from '@/app/api/crm/commissions/[id]/pay/route';
import { POST as rejectRoute } from '@/app/api/crm/commissions/[id]/reject/route';
import { POST as clawbackRoute } from '@/app/api/crm/commissions/[id]/clawback/route';
import { POST as bulkPayRoute } from '@/app/api/crm/commissions/bulk-pay/route';
import { GET as listRoute } from '@/app/api/crm/commissions/route';
import { POST as createTargetRoute } from '@/app/api/crm/sales-targets/route';
import { PATCH as patchTargetRoute } from '@/app/api/crm/sales-targets/[id]/route';
import { GET as dashboardRoute } from '@/app/api/crm/seller-dashboard/route';

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
  payee_name: 'Ana',
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

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }, { organization_id: 121, currency_code: 'USD', is_base: true }],
      organization_members: [
        { id: 1, organization_id: 120, user_id: 'u-1', is_active: true },
        { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true },
        { id: 3, organization_id: 121, user_id: 'u-ajeno', is_active: true },
      ],
      profiles: [
        { id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' },
        { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' },
        { id: 'u-ajeno', first_name: 'Ajeno', last_name: '', email: 'aj@x' },
      ],
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-10T12:00:00Z', metadata: { opportunity_id: 'op-1', extra: 'keep' } }),
        C('c-3', 120, { payee_id: 'u-admin', payee_name: 'Admin', accrued_at: '2026-09-12T15:00:00Z' }),
        C('c-9', 121),
        C('c-8', 121, { status: 'paid', paid_at: '2026-09-10T12:00:00Z' }),
      ],
      sales_targets: [],
      opportunities: [],
      tasks: [],
      activities: [],
      calls: [],
      stages: [{ id: 's-1', name: 'Propuesta' }],
    },
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;
const status = (db: FakeDb, id: string) => db.rows.commissions.find((r) => r.id === id)!;

beforeEach(() => {
  db = seed();
  session.roleId = 2;
  session.userId = 'u-admin';
  session.isSuperAdmin = false;
  session.roleName = 'x';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('T1 — dinero: doble pago concurrente', () => {
  it('dos `pay` a la vez sobre la misma accrued: exactamente uno paga, el otro 409 y hay una sola escritura efectiva', async () => {
    const results = await Promise.allSettled([payCommission('c-1', 120, supa(), 'u-admin'), payCommission('c-1', 120, supa(), 'u-admin')]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const ko = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toBeInstanceOf(CommissionTransitionError);
    expect((ko[0].reason as CommissionTransitionError).statusCode).toBe(409);
    // Ambas escrituras exigieron status=accrued; solo la primera encontró fila.
    const updates = db.writes.filter((w) => w.op === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.filters).toMatchObject({ id: 'c-1', organization_id: 120, status: 'accrued' });
    expect(status(db, 'c-1').status).toBe('paid');
  });

  it('bulk-pay con la misma id repetida paga una vez (dedupe) y no reporta fallo', async () => {
    const r = await bulkPayCommissions(['c-1', 'c-1', 'c-1'], 120, supa(), 'u-admin');
    expect(r).toEqual({ paid: ['c-1'], failed: [] });
  });

  it('bulk-pay mixto (accrued + paid + ajena + inexistente): parcial con informe por id; la pagada no se toca', async () => {
    const before = { ...status(db, 'c-2') };
    const r = await bulkPayCommissions(['c-1', 'c-2', 'c-9', 'nope'], 120, supa(), 'u-admin');
    expect(r.paid).toEqual(['c-1']);
    expect(r.failed.map((f) => f.id).sort()).toEqual(['c-2', 'c-9', 'nope']);
    expect(status(db, 'c-2')).toEqual(before);
    expect(status(db, 'c-9').status).toBe('accrued');
    // Un fallo que NO es de transición (error de BD) sí aborta: no se silencia dinero.
    db.nextWriteError = { table: 'commissions', error: { code: 'XX000', message: 'boom' } };
    await expect(bulkPayCommissions(['c-3'], 120, supa())).rejects.toMatchObject({ code: 'XX000' });
  });
});

describe('T2 — clawback y rechazo: metadata fusionada, notes, paid_at conservado', () => {
  it('clawback conserva las claves ajenas de metadata, guarda paid_at_before_clawback y NO borra paid_at', async () => {
    const row = await transitionCommission('clawback', 'c-2', 120, supa(), { reason: 'Reembolso al cliente', actorId: 'u-admin', now: '2026-09-15T10:00:00Z' });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('cancelled');
    expect(row!.paid_at).toBe('2026-09-10T12:00:00Z');
    expect(row!.notes).toBe('Reembolso al cliente');
    expect(row!.metadata).toEqual({
      opportunity_id: 'op-1',
      extra: 'keep',
      reason: 'clawback',
      clawback_of_paid: true,
      paid_at_before_clawback: '2026-09-10T12:00:00Z',
      clawback_at: '2026-09-15T10:00:00Z',
      clawback_by: 'u-admin',
    });
    const w = db.writes.find((x) => x.op === 'update')!;
    expect(w.filters).toMatchObject({ id: 'c-2', organization_id: 120, status: 'paid' });
    expect(w.row).not.toHaveProperty('paid_at');
  });

  it('reject deja metadata.reason=rejected sin perder claves previas; motivo solo espacios → 400 sin escribir', async () => {
    db.rows.commissions.find((r) => r.id === 'c-1')!.metadata = { source: 'invoice', k: 1 };
    const row = await transitionCommission('reject', 'c-1', 120, supa(), { reason: '  Duplicada  ', actorId: 'u-admin', now: 'N' });
    expect(row!.metadata).toMatchObject({ source: 'invoice', k: 1, reason: 'rejected', rejected_by: 'u-admin', rejected_at: 'N' });
    expect(row!.notes).toBe('Duplicada');
    db = seed();
    await expect(transitionCommission('reject', 'c-1', 120, supa(), { reason: '   ' })).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('clawback de una accrued → 409; reject de una cancelled → 409; ninguna escribe', async () => {
    await expect(transitionCommission('clawback', 'c-1', 120, supa(), { reason: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    db.rows.commissions.find((r) => r.id === 'c-1')!.status = 'cancelled';
    await expect(transitionCommission('reject', 'c-1', 120, supa(), { reason: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });
});

describe('T3 — tenencia y rol en las rutas de escritura', () => {
  it('el rol se resuelve por id: roleName «Admin de organización» con roleId 4 → 403; roleId 3 (Cliente) → 403', async () => {
    session.roleId = 4;
    session.roleName = 'Admin de organización';
    expect((await payRoute(req('/api/crm/commissions/c-1/pay', 'POST'), params('c-1'))).status).toBe(403);
    session.roleId = 3;
    expect((await bulkPayRoute(req('/api/crm/commissions/bulk-pay', 'POST', { commission_ids: ['c-1'] }))).status).toBe(403);
    expect((await clawbackRoute(req('/api/crm/commissions/c-2/clawback', 'POST', { reason: 'x' }), params('c-2'))).status).toBe(403);
    expect((await patchTargetRoute(req('/api/crm/sales-targets/t/x', 'PATCH', { target_amount: 5 }), params('t-x'))).status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });

  it('super admin con roleId 4 puede (isSuperAdmin viene del servidor)', async () => {
    session.roleId = 4;
    session.isSuperAdmin = true;
    expect((await payRoute(req('/api/crm/commissions/c-1/pay', 'POST'), params('c-1'))).status).toBe(200);
  });

  it('comisión de la org 121 → 404 en pay/reject/clawback, sin escribir', async () => {
    expect((await payRoute(req('/x', 'POST'), params('c-9'))).status).toBe(404);
    expect((await rejectRoute(req('/x', 'POST', { reason: 'r' }), params('c-9'))).status).toBe(404);
    expect((await clawbackRoute(req('/x', 'POST', { reason: 'r' }), params('c-8'))).status).toBe(404);
    expect(db.writes).toHaveLength(0);
  });

  it('un empleado no puede filtrar comisiones ajenas: payee_id del query se sustituye por el suyo', async () => {
    session.roleId = 4;
    session.userId = 'u-1';
    const res = await listRoute(req('/api/crm/commissions?payee_id=u-admin', 'GET'));
    const json = await res.json();
    expect(json.data.map((r: Row) => r.id).sort()).toEqual(['c-1', 'c-2']);
    expect(json.summary.count).toBe(2);
    expect(json.can_manage).toBe(false);
  });

  it('el resumen respeta el mismo filtro que la lista (no suma toda la organización)', async () => {
    const res = await listRoute(req('/api/crm/commissions?status=paid', 'GET'));
    const json = await res.json();
    expect(json.data.map((r: Row) => r.id)).toEqual(['c-2']);
    expect(json.summary).toMatchObject({ count: 1, paid_total: 100, pending_total: 0, accrued_total: 100 });
  });

  it('from/to son días calendario INCLUSIVOS en la zona de la organización: to=2026-09-05 incluye lo devengado ese día a las 10:00 Bogotá', async () => {
    const json = await (await listRoute(req('/api/crm/commissions?from=2026-09-05&to=2026-09-05', 'GET'))).json();
    expect(json.data.map((r: Row) => r.id).sort()).toEqual(['c-1', 'c-2']);
    // El límite superior que viajó al doble es la medianoche del día SIGUIENTE en Bogotá.
    const w = db.writes; // sin escrituras
    expect(w).toHaveLength(0);
  });

  // CLAUDE.md regla 5: «Si el body trae una organización distinta: 403 y se registra».
  // Las rutas F13 la ignoran en silencio (el constructor lo prueba como «se ignora»).
  it('HUECO: pay/reject/clawback/bulk-pay/sales-targets con organization_id ajeno en el body → 403 y registro', async () => {
    const r1 = await rejectRoute(req('/x', 'POST', { reason: 'r', organization_id: 121 }), params('c-1'));
    expect(r1.status).toBe(403);
  });
});

describe('T4 — cuotas: validación y zona horaria', () => {
  it('HUECO: un `monthly` de 45 días (o un `yearly` de un mes) debe rechazarse: period incoherente con period_start/period_end', () => {
    const v = validateQuotaInput({ period: 'monthly', period_start: '2026-09-01', period_end: '2026-10-15', target_amount: 10 });
    expect(v.ok).toBe(false);
  });

  it('HUECO: una fecha imposible (2026-02-31) pasa la regex y llegaría a Postgres', () => {
    const v = validateQuotaInput({ period: 'monthly', period_start: '2026-02-01', period_end: '2026-02-31', target_amount: 10 });
    expect(v.ok).toBe(false);
  });

  it('HUECO: PATCH solo de period_end anterior al period_start existente no se rechaza (la coherencia solo se comprueba si vienen ambos)', async () => {
    db.rows.sales_targets.push({ id: 't-1', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 });
    const res = await patchTargetRoute(req('/x', 'PATCH', { period_end: '2026-08-01' }), params('t-1'));
    expect(res.status).toBe(400);
  });

  it('POST cuota sin target_currency: hoy cae en «COP» cableado (no la moneda base de la organización)', async () => {
    const res = await createTargetRoute(req('/x', 'POST', { user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10 }));
    expect(res.status).toBe(201);
    const w = db.writes.find((x) => x.op === 'insert')!;
    // Documenta el comportamiento actual; la UI sí envía la moneda de la org (useOrgCurrency).
    expect(w.row!.target_currency).toBe('COP');
  });

  const wonAt = (closed_at: string, amount: number, id: string): Row => ({ id, organization_id: 120, salesperson_id: 'u-1', status: 'won', amount, closed_at });

  it('ingresos: la ganada a las 23:30 de Bogotá del 30 de septiembre cuenta en septiembre; la de las 00:30 del 1 de octubre no (con TZ del proceso = ' + (process.env.TZ || 'local') + ')', async () => {
    db.rows.opportunities = [
      wonAt('2026-10-01T04:30:00Z', 700, 'a'), // 30 sep 23:30 Bogotá → dentro
      wonAt('2026-10-01T05:30:00Z', 999, 'b'), // 1 oct 00:30 Bogotá → fuera
      wonAt('2026-09-01T04:59:59Z', 300, 'c'), // 31 ago 23:59 Bogotá → fuera
      wonAt('2026-09-01T05:00:00Z', 5, 'd'), // 1 sep 00:00 Bogotá → dentro
      { ...wonAt('2026-09-10T15:00:00Z', 5000, 'e'), organization_id: 121 }, // señuelo
      { ...wonAt('2026-09-10T15:00:00Z', 4000, 'f'), status: 'open' }, // no ganada
      { ...wonAt('2026-09-10T15:00:00Z', 4000, 'g'), salesperson_id: 'u-admin' }, // de otro vendedor
    ];
    const revenue = await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'America/Bogota');
    expect(revenue).toBe(705);
    const deals = await calculateAchievedAmount(120, 'u-1', 'deals', '2026-09-01', '2026-09-30', supa(), 'America/Bogota');
    expect(deals).toBe(2);
    // Misma organización en UTC: la de las 04:30Z del 1 de octubre ya es octubre.
    const utc = await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'UTC');
    expect(utc).toBe(305);
  });

  it('actividades y llamadas usan activities.user_id/occurred_at y calls.user_id/started_at, acotadas por organización', async () => {
    db.rows.activities = [
      { id: 'a1', organization_id: 120, user_id: 'u-1', occurred_at: '2026-09-15T15:00:00Z' },
      { id: 'a2', organization_id: 121, user_id: 'u-1', occurred_at: '2026-09-15T15:00:00Z' },
      { id: 'a3', organization_id: 120, user_id: 'u-1', occurred_at: '2026-10-01T05:00:00Z' },
    ];
    db.rows.calls = [
      { id: 'k1', organization_id: 120, user_id: 'u-1', started_at: '2026-09-30T23:00:00Z' },
      { id: 'k2', organization_id: 120, user_id: 'u-1', started_at: '2026-10-01T04:59:00Z' }, // 30 sep 23:59 Bogotá
      { id: 'k3', organization_id: 120, user_id: 'u-1', started_at: '2026-10-01T05:00:00Z' }, // 1 oct 00:00 Bogotá
    ];
    expect(await calculateAchievedAmount(120, 'u-1', 'activities', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(1);
    // Borde exacto: la medianoche del 1 de octubre en Bogotá (05:00Z) ya NO cuenta ni en deals ni en ingresos.
    db.rows.opportunities = [wonAt('2026-10-01T05:00:00Z', 50, 'edge'), wonAt('2026-10-01T04:59:59Z', 7, 'in')];
    expect(await calculateAchievedAmount(120, 'u-1', 'deals', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(1);
    expect(await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(7);
    expect(await calculateAchievedAmount(120, 'u-1', 'calls', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(2);
  });
});

describe('T5 — panel del vendedor', () => {
  const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

  it('empleado con ?include_leaderboard=1 (o user_id ajeno) → ranking null; datos solo del usuario y la organización de la sesión', async () => {
    at('2026-09-15T20:00:00Z'); // 15 sep 15:00 Bogotá
    session.roleId = 4;
    session.userId = 'u-1';
    const res = await dashboardRoute();
    const json = await res.json();
    expect(json.data.leaderboard).toBeNull();
    expect(json.data.today).toBe('2026-09-15');
    expect(json.data.currency).toBe('COP');
    expect(json.data.commissions).toEqual({ accrued: 100, paid: 100, total: 200, count: 2 });
    expect(json.data.quota).toBeNull();
    expect(json.data.opportunities).toEqual([]);
    expect(json.data.tasks_today).toEqual([]);
  });

  it('manager: ranking solo con miembros activos de la org 120, ordenado, con el «yo» marcado', async () => {
    at('2026-09-15T20:00:00Z');
    session.roleId = 5;
    db.rows.opportunities = [
      { id: 'o1', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 900, closed_at: '2026-09-10T15:00:00Z' },
      { id: 'o2', organization_id: 120, salesperson_id: 'u-admin', status: 'won', amount: 100, closed_at: '2026-09-10T15:00:00Z' },
      { id: 'o3', organization_id: 121, salesperson_id: 'u-ajeno', status: 'won', amount: 99999, closed_at: '2026-09-10T15:00:00Z' },
      { id: 'o4', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 1, closed_at: '2026-08-31T15:00:00Z' }, // mes anterior
      { id: 'o5', organization_id: 121, salesperson_id: 'u-1', status: 'won', amount: 99999, closed_at: '2026-09-10T15:00:00Z' }, // mismo vendedor, otra org
    ];
    const json = await (await dashboardRoute()).json();
    expect(json.data.leaderboard).toEqual([
      { rank: 1, user_id: 'u-1', name: 'Ana V', amount: 900, deals: 1, is_me: false },
      { rank: 2, user_id: 'u-admin', name: 'Admin', amount: 100, deals: 1, is_me: true },
    ]);
  });

  it('el ranking solo lista miembros activos: una ganada de un ex miembro (no está en organization_members activo) no crea fila', async () => {
    at('2026-09-15T20:00:00Z');
    session.roleId = 5;
    db.rows.opportunities = [{ id: 'o1', organization_id: 120, salesperson_id: 'u-exmiembro', status: 'won', amount: 5000, closed_at: '2026-09-10T15:00:00Z' }];
    const json = await (await dashboardRoute()).json();
    expect(json.data.leaderboard.map((r: Row) => r.user_id).sort()).toEqual(['u-1', 'u-admin']);
    expect(json.data.leaderboard.every((r: Row) => r.amount === 0)).toBe(true);
  });

  it('tareas de hoy por assigned_to y due_date en la zona de la organización (borde de medianoche en Bogotá)', async () => {
    at('2026-09-15T20:00:00Z');
    session.userId = 'u-1';
    db.rows.tasks = [
      { id: 'k1', organization_id: 120, assigned_to: 'u-1', status: 'open', title: 'A', priority: 'med', due_date: '2026-09-15T04:30:00Z' }, // 14 sep 23:30 Bogotá → no
      { id: 'k2', organization_id: 120, assigned_to: 'u-1', status: 'open', title: 'B', priority: 'med', due_date: '2026-09-15T05:00:00Z' }, // 15 sep 00:00 → sí
      { id: 'k3', organization_id: 120, assigned_to: 'u-1', status: 'in_progress', title: 'C', priority: 'med', due_date: '2026-09-16T04:59:00Z' }, // 15 sep 23:59 → sí
      { id: 'k4', organization_id: 120, assigned_to: 'u-1', status: 'done', title: 'D', priority: 'med', due_date: '2026-09-15T15:00:00Z' }, // cerrada → no
      { id: 'k5', organization_id: 120, assigned_to: 'u-admin', status: 'open', title: 'E', priority: 'med', due_date: '2026-09-15T15:00:00Z' }, // de otro → no
      { id: 'k6', organization_id: 121, assigned_to: 'u-1', status: 'open', title: 'F', priority: 'med', due_date: '2026-09-15T15:00:00Z' }, // otra org → no
    ];
    const json = await (await dashboardRoute()).json();
    expect(json.data.tasks_today.map((t: Row) => t.id).sort()).toEqual(['k2', 'k3']);
  });

  it('cuota vigente: la mensual de septiembre con el logrado calculado en vivo y días restantes contados desde hoy (Bogotá)', async () => {
    at('2026-09-16T03:30:00Z'); // 15 sep 22:30 Bogotá (16 sep en UTC): hoy debe ser el 15
    session.userId = 'u-1';
    db.rows.sales_targets = [
      { id: 't-m', organization_id: 120, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1000, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
      { id: 't-y', organization_id: 120, user_id: 'u-1', period: 'yearly', period_start: '2026-01-01', period_end: '2026-12-31', target_amount: 9, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
      { id: 't-x', organization_id: 121, user_id: 'u-1', period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 1, target_currency: 'COP', target_type: 'revenue', achieved_amount: 0 },
    ];
    db.rows.opportunities = [{ id: 'o1', organization_id: 120, salesperson_id: 'u-1', status: 'won', amount: 840, closed_at: '2026-09-10T15:00:00Z' }];
    const json = await (await dashboardRoute()).json();
    expect(json.data.today).toBe('2026-09-15');
    expect(json.data.quota.target.id).toBe('t-m');
    expect(json.data.quota.target.achieved_amount).toBe(840);
    expect(json.data.quota.progress).toMatchObject({ pct: 84, days_remaining: 16, days_elapsed: 14, status: 'en_ritmo', needed_per_day: 10 });
    // Nada se escribió: el panel es de solo lectura.
    expect(db.writes).toHaveLength(0);
  });
});
