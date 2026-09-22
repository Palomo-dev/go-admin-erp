/// <reference types="jest" />
/**
 * F13 — casos únicos consolidados de las rondas (2026-09-21): servicios sobre
 * el doble `f13FakeSupabase` (señuelos de la organización 121), sin rutas.
 * Vienen de `f13Round1Tester` (tester r1), `f13Round2Routes` (constructor r2),
 * `f13Round2Tester` (tester r2) y `f13Round3Tester` (tester r3). Cubre: dinero
 * bajo concurrencia (pay/pay, clawback/clawback, pay/reject sobre la misma
 * fila), lotes que no silencian errores de BD, metadata fusionada al rechazar,
 * cuotas por zona horaria de la organización (borde de medianoche en Bogotá),
 * actividades/llamadas, y errores de BD que no se disfrazan de ceros.
 */
import { createFakeSupabase, type FakeDb, type Row } from './f13FakeSupabase';
import { CommissionTransitionError } from '../commissionTransitions';
import { bulkPayCommissions, clawbackCommission, payCommission, rejectCommission, transitionCommission } from '../commissionAdminService';
import { calculateAchievedAmount, DataSourceError } from '../salesTargetService';
import { getOrgTimezone, getSellerDashboard } from '../sellerDashboardService';

const C = (id: string, org: number, extra: Row = {}): Row => ({
  id, organization_id: org, branch_id: null, commission_type: 'salesperson', source_type: 'invoice_sale', source_id: `inv-${id}`, source_item_id: null,
  payee_type: 'employee', payee_id: 'u-1', payee_name: 'Ana', base_amount: 1000, commission_rate: 10, commission_amount: 100, currency: 'COP',
  status: 'accrued', accrued_at: '2026-09-05T15:00:00Z', paid_at: null, notes: null, metadata: null, created_by: null, created_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z', ...extra,
});
const wonAt = (closed_at: string, amount: number, id: string): Row => ({ id, organization_id: 120, salesperson_id: 'u-1', status: 'won', amount, closed_at });

let db: FakeDb;
function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      organizations: [{ id: 120, timezone: 'America/Bogota' }, { id: 121, timezone: 'UTC' }],
      organization_currencies: [{ organization_id: 120, currency_code: 'COP', is_base: true }],
      organization_members: [{ id: 1, organization_id: 120, user_id: 'u-1', is_active: true }, { id: 2, organization_id: 120, user_id: 'u-admin', is_active: true }],
      profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'V', email: 'a@x' }, { id: 'u-admin', first_name: 'Admin', last_name: '', email: 'ad@x' }],
      commissions: [
        C('c-1', 120),
        C('c-2', 120, { status: 'paid', paid_at: '2026-09-10T12:00:00Z', metadata: { opportunity_id: 'op-1', extra: 'keep' } }),
        C('c-3', 120, { payee_id: 'u-admin', payee_name: 'Admin' }),
        C('c-9', 121),
      ],
      sales_targets: [], opportunities: [], tasks: [], activities: [], calls: [], stages: [],
    },
  };
}
const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;
const row = (id: string) => db.rows.commissions.find((r) => r.id === id)!;
const updates = () => db.writes.filter((w) => w.op === 'update');

beforeEach(() => {
  db = seed();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('dinero bajo concurrencia (tester r1 T1, tester r3 R3T-1)', () => {
  it('T1.1: dos `pay` a la vez sobre la misma accrued: exactamente uno paga, el otro 409; ambas escrituras exigieron status=accrued', async () => {
    const results = await Promise.allSettled([payCommission('c-1', 120, supa(), 'u-admin'), payCommission('c-1', 120, supa(), 'u-admin')]);
    const ko = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toBeInstanceOf(CommissionTransitionError);
    expect((ko[0].reason as CommissionTransitionError).statusCode).toBe(409);
    expect(updates()).toHaveLength(2);
    for (const u of updates()) expect(u.filters).toMatchObject({ id: 'c-1', organization_id: 120, status: 'accrued' });
    expect(row('c-1').status).toBe('paid');
  });
  it('R3T-1.1: dos clawback a la vez sobre la misma pagada: uno revierte, el otro 409; ambos exigieron status=paid; metadata previa conservada y paid_at intacto', async () => {
    const results = await Promise.allSettled([clawbackCommission('c-2', 120, 'devolución', supa(), 'u-admin'), clawbackCommission('c-2', 120, 'devolución', supa(), 'u-admin')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ko = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ko).toHaveLength(1);
    expect((ko[0].reason as CommissionTransitionError).statusCode).toBe(409);
    expect(updates()).toHaveLength(2);
    for (const u of updates()) expect(u.filters).toMatchObject({ id: 'c-2', organization_id: 120, status: 'paid' });
    expect(row('c-2')).toMatchObject({ status: 'cancelled', paid_at: '2026-09-10T12:00:00Z' });
    expect(row('c-2').metadata).toMatchObject({ opportunity_id: 'op-1', extra: 'keep', reason: 'clawback', clawback_of_paid: true, paid_at_before_clawback: '2026-09-10T12:00:00Z' });
  });
  it('R3T-1.2: pay y reject a la vez sobre la misma accrued: solo uno gana y la fila queda en UN estado coherente', async () => {
    const results = await Promise.allSettled([payCommission('c-1', 120, supa(), 'u-admin'), rejectCommission('c-1', 120, 'no procede', supa(), 'u-admin')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const r = row('c-1');
    if (r.status === 'paid') {
      expect(r.paid_at).toBeTruthy();
      expect((r.metadata as Record<string, unknown> | null)?.reason).toBeUndefined();
    } else {
      expect(r).toMatchObject({ status: 'cancelled', paid_at: null });
      expect(r.metadata).toMatchObject({ reason: 'rejected' });
    }
  });
  it('T1.3: bulk-pay mixto (accrued + paid + ajena + inexistente): parcial con informe por id, la pagada no se toca; un error de BD (no de transición) sí aborta', async () => {
    const before = { ...row('c-2') };
    const r = await bulkPayCommissions(['c-1', 'c-2', 'c-9', 'nope'], 120, supa(), 'u-admin');
    expect(r.paid).toEqual(['c-1']);
    expect(r.failed.map((f) => f.id).sort()).toEqual(['c-2', 'c-9', 'nope']);
    expect(row('c-2')).toEqual(before);
    expect(row('c-9').status).toBe('accrued');
    db.nextWriteError = { table: 'commissions', error: { code: 'XX000', message: 'boom' } };
    await expect(bulkPayCommissions(['c-3'], 120, supa())).rejects.toMatchObject({ code: 'XX000' });
  });
  it('T2.2: reject fusiona metadata.reason=rejected con las claves previas y recorta el motivo; motivo solo espacios → 400 REASON_REQUIRED sin escribir', async () => {
    row('c-1').metadata = { source: 'invoice', k: 1 };
    const out = await transitionCommission('reject', 'c-1', 120, supa(), { reason: '  Duplicada  ', actorId: 'u-admin', now: 'N' });
    expect(out!.metadata).toMatchObject({ source: 'invoice', k: 1, reason: 'rejected', rejected_by: 'u-admin', rejected_at: 'N' });
    expect(out!.notes).toBe('Duplicada');
    db = seed();
    await expect(transitionCommission('reject', 'c-1', 120, supa(), { reason: '   ' })).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    expect(updates()).toHaveLength(0);
  });
});

describe('cuotas: logrado por zona horaria de la organización (tester r1 T4.5/T4.6)', () => {
  it('ingresos y deals: la ganada a las 23:30 de Bogotá del 30 de septiembre cuenta; la de las 00:30 del 1 de octubre no; en UTC cambia', async () => {
    db.rows.opportunities = [
      wonAt('2026-10-01T04:30:00Z', 700, 'a'), wonAt('2026-10-01T05:30:00Z', 999, 'b'), wonAt('2026-09-01T04:59:59Z', 300, 'c'), wonAt('2026-09-01T05:00:00Z', 5, 'd'),
      { ...wonAt('2026-09-10T15:00:00Z', 5000, 'e'), organization_id: 121 }, { ...wonAt('2026-09-10T15:00:00Z', 4000, 'f'), status: 'open' }, { ...wonAt('2026-09-10T15:00:00Z', 4000, 'g'), salesperson_id: 'u-admin' },
    ];
    expect(await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(705);
    expect(await calculateAchievedAmount(120, 'u-1', 'deals', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(2);
    expect(await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'UTC')).toBe(305);
  });
  it('actividades (activities.user_id/occurred_at) y llamadas (calls.user_id/started_at) acotadas por organización; la medianoche exacta del 1 de octubre en Bogotá ya no cuenta', async () => {
    db.rows.activities = [
      { id: 'a1', organization_id: 120, user_id: 'u-1', occurred_at: '2026-09-15T15:00:00Z' }, { id: 'a2', organization_id: 121, user_id: 'u-1', occurred_at: '2026-09-15T15:00:00Z' },
      { id: 'a3', organization_id: 120, user_id: 'u-1', occurred_at: '2026-10-01T05:00:00Z' },
    ];
    db.rows.calls = [
      { id: 'k1', organization_id: 120, user_id: 'u-1', started_at: '2026-09-30T23:00:00Z' }, { id: 'k2', organization_id: 120, user_id: 'u-1', started_at: '2026-10-01T04:59:00Z' },
      { id: 'k3', organization_id: 120, user_id: 'u-1', started_at: '2026-10-01T05:00:00Z' },
    ];
    expect(await calculateAchievedAmount(120, 'u-1', 'activities', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(1);
    expect(await calculateAchievedAmount(120, 'u-1', 'calls', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(2);
    db.rows.opportunities = [wonAt('2026-10-01T05:00:00Z', 50, 'edge'), wonAt('2026-10-01T04:59:59Z', 7, 'in')];
    expect(await calculateAchievedAmount(120, 'u-1', 'deals', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(1);
    expect(await calculateAchievedAmount(120, 'u-1', 'revenue', '2026-09-01', '2026-09-30', supa(), 'America/Bogota')).toBe(7);
  });
});

describe('los errores de BD no son ceros (r2 R2-2, tester r2 R2T-4)', () => {
  it('calculateAchievedAmount propaga el error de cada consulta (revenue, deals, activities, calls)', async () => {
    for (const [type, table] of [['revenue', 'opportunities'], ['deals', 'opportunities'], ['activities', 'activities'], ['calls', 'calls']] as const) {
      db.nextReadError = { table, error: { code: '57014', message: 'statement timeout' } };
      await expect(calculateAchievedAmount(120, 'u-1', type, '2026-09-01', '2026-09-30', supa(), 'UTC')).rejects.toMatchObject({ message: expect.stringContaining('statement timeout') });
    }
  });
  it('getSellerDashboard propaga el error de cada una de sus consultas (y el del ranking) en lugar de devolver listas vacías', async () => {
    for (const table of ['sales_targets', 'commissions', 'opportunities', 'tasks', 'organization_currencies']) {
      db = seed();
      db.nextReadError = { table, error: { code: '57014', message: `boom ${table}` } };
      await expect(getSellerDashboard(120, 'u-1', 'UTC', supa(), { includeLeaderboard: false })).rejects.toMatchObject({ message: expect.stringContaining(table) });
    }
    db = seed();
    db.nextReadError = { table: 'organization_members', error: { code: '57014', message: 'boom members' } };
    await expect(getSellerDashboard(120, 'u-1', 'UTC', supa(), { includeLeaderboard: true })).rejects.toMatchObject({ message: expect.stringContaining('members') });
  });
  it('getOrgTimezone: error de BD → DataSourceError (nunca un fallback silencioso); organización sin fila → fallback documentado America/Bogota', async () => {
    db.nextReadError = { table: 'organizations', error: { code: 'XX000', message: 'boom' } };
    await expect(getOrgTimezone(120, supa())).rejects.toBeInstanceOf(DataSourceError);
    expect(await getOrgTimezone(999, supa())).toBe('America/Bogota');
  });
});
