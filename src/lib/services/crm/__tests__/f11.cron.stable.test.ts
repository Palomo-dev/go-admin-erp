/// <reference types="jest" />
/**
 * F11 — casos únicos consolidados de las rondas (2026-09-21): el cron de salud
 * (`healthRecalculate`), `renewalsSync`, `scheduledOrgs` y `runScheduledKinds`.
 * Vienen de `f11Round1Tester` (tester r1 §4), `f11Round2` (constructor r2 §2)
 * y `f11Round2Tester` (tester r2 §1/§2). Cubre: aislamiento por org, aborto
 * (antes y a mitad), presupuesto con reloj virtual, rotación por snapshot,
 * lotes de 200, una sentencia de update por score distinto, `pending_org_ids`
 * honesto, `taskBudgetMs` propio y nada en `outbound_jobs`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => { throw new Error('enqueueJob no debe llamarse para tareas F11'); }) }));
jest.mock('@/lib/jobs/registry', () => ({ hasRealJobHandler: () => false }));
jest.mock('@/lib/jobs/handlers', () => ({}));
jest.mock('@/lib/jobs/runner', () => ({ makeJobLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }), makeWorkerId: () => 'w' }));
jest.mock('@/lib/jobs/handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client in test'); } }));

import { enqueueJob } from '@/lib/jobs/enqueue';
import { applyHealthScores } from '../healthScoreServer';
import { type HealthRpcRow } from '../healthBands';
import { orderOrgsByLeastRecentlyProcessed, recalculateOrgHealth, runHealthRecalculate } from '@/lib/jobs/scheduled/healthRecalculate';
import { runRenewalsSync } from '@/lib/jobs/scheduled/renewalsSync';
import { runScheduledKinds } from '@/lib/jobs/scheduler';
import { listCrmActiveOrgIds, orgIdsWithModule } from '@/lib/jobs/scheduledOrgs';
import type { JobLogger } from '@/lib/jobs/types';

const ORG = 113;
const NOW = new Date('2026-09-15T13:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
const RPC_ROW: HealthRpcRow = { customer_id: 'c-1', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 58, band: 'at_risk' };
const row = (id: string, inv: number): HealthRpcRow => ({ ...RPC_ROW, customer_id: id, invoices_12m: inv });
/** Filas REALES de fn_customer_health (ids recortados) → 22/28/10/42/40 con la config real. */
const REAL_ROWS: HealthRpcRow[] = [
  { customer_id: '0bd2a6bc', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 78, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 57, band: 'at_risk' },
  { customer_id: '0cc1854f', invoices_12m: 1, revenue_12m: 71000, days_since_last_invoice: 70, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 59, band: 'at_risk' },
  { customer_id: '674c3eed', invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: 419, days_since_last_activity: null, overdue_balance: 1131000, overdue_ratio: 0.9746, score: 1, band: 'critical' },
  { customer_id: '273ae512', invoices_12m: 4, revenue_12m: 264180.01, days_since_last_invoice: 243, days_since_last_activity: null, overdue_balance: 415940, overdue_ratio: 0.8603, score: 24, band: 'critical' },
  { customer_id: '89e5bc62', invoices_12m: 1, revenue_12m: 29000, days_since_last_invoice: 15, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 60, band: 'at_risk' },
];
const EXPECTED = { '0bd2a6bc': 22, '0cc1854f': 28, '674c3eed': 10, '273ae512': 42, '89e5bc62': 40 } as const;

function threeOrgsDb(): FakeDb {
  return makeDb({
    organization_modules: [
      { organization_id: 1, module_code: 'crm', is_active: true }, { organization_id: 2, module_code: 'crm', is_active: true }, { organization_id: 3, module_code: 'crm', is_active: true },
      { organization_id: 4, module_code: 'crm', is_active: null }, { organization_id: 5, module_code: 'crm', is_active: false },
      { organization_id: 1, module_code: 'crm', is_active: true }, { organization_id: 6, module_code: 'inventory', is_active: true },
    ],
    health_score_configs: [], health_score_snapshots: [], customers: [],
  }, {
    fn_customer_health: (args) => {
      if (args.p_org_id === 2) throw new Error('canceling statement due to statement timeout');
      return [{ customer_id: `c-${args.p_org_id}`, invoices_12m: 1, revenue_12m: 1, days_since_last_invoice: 1, days_since_last_activity: 1, overdue_balance: 0, overdue_ratio: 0, score: 50, band: 'at_risk' }];
    },
  });
}
/** 49 orgs con config real y 1 cliente cada una (r2 2.5/2.6). */
function fortyNineDb(): { db: FakeDb; orgIds: number[] } {
  const orgIds = Array.from({ length: 49 }, (_, i) => 200 + i);
  const db = makeDb({
    organization_modules: orgIds.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
    health_score_configs: orgIds.map((id) => ({ organization_id: id, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true })),
    customers: orgIds.map((id) => ({ id: `c-${id}`, organization_id: id, lifecycle_stage: 'customer', health_score: null })),
    health_score_snapshots: [],
  }, { fn_customer_health: (a) => [row(`c-${a.p_org_id}`, 1)] });
  return { db, orgIds };
}
/** Distribución REAL: 196, 9, 8, 3, 2, 1 clientes y 43 orgs con 0, que van PRIMERO en el listado (tester r2 §2). */
const SIZES: Record<number, number> = { 113: 196, 134: 9, 130: 8, 2: 3, 112: 2, 125: 1 };
const REAL_ORG_IDS = [...Array.from({ length: 43 }, (_, i) => 300 + i), 113, 134, 130, 2, 112, 125];
function realDistributionDb(): FakeDb {
  const customers: Row[] = [];
  const rpc: Record<number, HealthRpcRow[]> = {};
  for (const id of REAL_ORG_IDS) {
    rpc[id] = Array.from({ length: SIZES[id] ?? 0 }, (_, i) => ({ customer_id: `c-${id}-${i}`, invoices_12m: 1 + (i % 4), revenue_12m: 30000 + (i % 7) * 20000, days_since_last_invoice: 10 + (i % 5) * 20, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 55, band: 'at_risk' }));
    for (const r of rpc[id]) customers.push({ id: r.customer_id, organization_id: id, lifecycle_stage: 'customer', health_score: null });
  }
  return makeDb({
    organization_modules: REAL_ORG_IDS.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
    health_score_configs: REAL_ORG_IDS.map((id) => ({ organization_id: id, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true })),
    customers, health_score_snapshots: [],
  }, { fn_customer_health: (a) => rpc[a.p_org_id as number] ?? [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('scheduledOrgs y aislamiento por org (tester r1 T4.1–T4.6)', () => {
  test('T4.1: orgIdsWithModule deduplica, exige is_active === true (null/false fuera), ignora otros módulos e ids no válidos (0, 1.5)', () => {
    expect(orgIdsWithModule([
      { organization_id: 1, module_code: 'crm', is_active: true }, { organization_id: 1, module_code: 'crm', is_active: true },
      { organization_id: 4, module_code: 'crm', is_active: null }, { organization_id: 5, module_code: 'crm', is_active: false },
      { organization_id: 6, module_code: 'inventory', is_active: true }, { organization_id: 0, module_code: 'crm', is_active: true },
      { organization_id: 1.5, module_code: 'crm', is_active: true },
    ], 'crm')).toEqual([1]);
  });
  test('T4.2: listCrmActiveOrgIds consulta organization_modules con module_code=crm e is_active=true', async () => {
    const { orgIds, error } = await listCrmActiveOrgIds(sb(threeOrgsDb()));
    expect(error).toBeNull();
    expect(orgIds.sort()).toEqual([1, 2, 3]);
  });
  test('T4.3: una org cuya RPC lanza (timeout) queda en by_org.error; las demás se procesan; errors=1; nada en outbound_jobs', async () => {
    const db = threeOrgsDb();
    const r = await runHealthRecalculate(sb(db), NOW, log);
    expect(r).toMatchObject({ orgs: 3, processed: 3, errors: 1, aborted: false, snapshots_written: 2 });
    expect(r.by_org.find((o) => o.org_id === 2)!.error).toMatch(/statement timeout/);
    expect(r.by_org.filter((o) => o.error === null).map((o) => o.org_id)).toEqual([1, 3]);
    expect(db.writes.filter((w) => w.table === 'outbound_jobs')).toEqual([]);
  });
  test('T4.5: abortar tras la primera org → processed 1 y by_org honesto (solo la procesada)', async () => {
    const db = threeOrgsDb();
    const ac = new AbortController();
    db.rpc!.fn_customer_health = (args) => { ac.abort(); return [{ customer_id: `c-${args.p_org_id}`, invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: null, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 40, band: 'at_risk' }]; };
    const r = await runHealthRecalculate(sb(db), NOW, log, ac.signal);
    expect(r).toMatchObject({ orgs: 3, processed: 1, aborted: true });
    expect(r.by_org).toHaveLength(1);
  });
  test('T4.6: runRenewalsSync aísla errores por org; la zona horaria sale de organizations.timezone y una inválida cae al fallback', async () => {
    const db = makeDb({
      organization_modules: [{ organization_id: 1, module_code: 'crm', is_active: true }, { organization_id: 2, module_code: 'crm', is_active: true }],
      organizations: [{ id: 1, timezone: 'America/Mexico_City' }, { id: 2, timezone: 'Marte/Olympus' }],
      opportunities: [],
    });
    db.nextReadError = { table: 'opportunities', error: { code: '57014', message: 'timeout' } };
    const r = await runRenewalsSync(sb(db), NOW, log);
    expect(r.by_org.map((o) => [o.org_id, o.timezone, o.errors.length])).toEqual([[1, 'America/Mexico_City', 1], [2, 'America/Bogota', 0]]);
    expect(r).toMatchObject({ processed: 2, errors: 1, aborted: false });
  });
  test('T4.7 / r2 2.7: runScheduledKinds nunca encola en outbound_jobs, devuelve by_org de cada tarea y da a las F11 su taskBudgetMs (no la mitad del de maintenance)', async () => {
    const db = threeOrgsDb();
    db.rows.organizations = [];
    db.rows.opportunities = [];
    const out = await runScheduledKinds({ kinds: ['maintenance', 'health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, worker: 't', supabase: sb(db), now: NOW });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(db.writes.filter((w) => w.table === 'outbound_jobs')).toEqual([]);
    expect(out.health_recalculate?.ok && out.health_recalculate.result.by_org.length).toBe(3);
    expect(out.health_recalculate?.ok && out.health_recalculate.result.budget_ms).toBe(12_000);
    expect(out.health_recalculate?.ok && out.health_recalculate.result.pending_org_ids).toEqual([]);
    expect(out.renewals_sync?.ok && out.renewals_sync.result.processed).toBe(3);
    // r2 2.7: solo las dos F11, sin taskBudgetMs → cada una recibe la mitad del total; sin orgs con CRM → 0 procesadas y sin leer organizations
    const empty = makeDb({ organization_modules: [], organizations: [], opportunities: [] });
    const two = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 5_000, worker: 't', supabase: sb(empty), now: NOW });
    expect(two.maintenance).toBeUndefined();
    expect(two.health_recalculate?.ok && two.health_recalculate.result).toMatchObject({ orgs: 0, processed: 0, budget_ms: 2_500 });
    expect(two.renewals_sync?.ok && two.renewals_sync.result).toMatchObject({ orgs: 0, processed: 0 });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  test('r2 2.6 (error): si listar las orgs con CRM falla, runHealthRecalculate devuelve error sin procesar nada ni llamar a la RPC', async () => {
    const db = threeOrgsDb();
    db.nextReadError = { table: 'organization_modules', error: { code: '57014', message: 'timeout' } };
    const r = await runHealthRecalculate(sb(db), NOW, log);
    expect(r.error).toMatch(/timeout/);
    expect(r).toMatchObject({ orgs: 0, processed: 0, by_org: [] });
    expect(db.rpcCalls).toEqual([]);
  });
});

describe('cron que cabe: lotes, solo si cambió, rotación y presupuesto (r2 §2, tester r2 §1/§2)', () => {
  test('r2 2.1: applyHealthScores hace una sentencia por valor distinto de score (no una por cliente), filtrada por organización; vacío → 0', async () => {
    const db = makeDb({ customers: [] });
    const r = await applyHealthScores(sb(db), ORG, [{ customer_id: 'a', score: 22 }, { customer_id: 'b', score: 22 }, { customer_id: 'c', score: 40 }], NOW);
    expect(r).toEqual({ statements: 2, updated: 3 });
    const upd = writesTo(db, 'customers', 'update');
    expect(upd.map((u) => [u.rows[0].health_score, u.filters.organization_id, u.filters.id__in ?? u.filters.id])).toEqual([[22, ORG, ['a', 'b']], [40, ORG, 'c']]);
    expect(upd[0].rows[0]).toEqual({ health_score: 22, health_score_updated_at: NOW.toISOString() });
    expect(await applyHealthScores(sb(makeDb()), ORG, [], NOW)).toEqual({ statements: 0, updated: 0 });
  });
  test('r2 2.2: 219 clientes, 3 cambian → inserts por lote (200 + 19) y 1 update por score cambiado (no 219); ≤ 8 llamadas', async () => {
    const rows = Array.from({ length: 219 }, (_, i) => row(`c-${i}`, i < 3 ? 7 : 1));
    const db = makeDb({
      health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
      customers: rows.map((r) => ({ id: r.customer_id, organization_id: ORG, lifecycle_stage: 'customer', health_score: 22 })),
      health_score_snapshots: rows.map((r) => ({ id: `s-${r.customer_id}`, organization_id: ORG, customer_id: r.customer_id, score: 22, created_at: new Date(NOW.getTime() - 25 * 3600e3).toISOString() })),
    }, { fn_customer_health: () => rows });
    const r = await recalculateOrgHealth(ORG, sb(db), NOW);
    expect(r).toMatchObject({ customers: 219, snapshots_written: 219, customers_updated: 3, update_statements: 1, error: null });
    expect(writesTo(db, 'health_score_snapshots', 'insert').length).toBe(2);
    expect(writesTo(db, 'customers', 'update')).toHaveLength(1);
    expect(writesTo(db, 'customers', 'update')[0].filters.id__in).toEqual(['c-0', 'c-1', 'c-2']);
    expect(db.calls).toBeLessThanOrEqual(8);
  });
  test('r2 2.3: nada cambió y el intervalo no venció → 0 escrituras, skipped_unchanged y 4 llamadas (config + RPC/snapshots/customers)', async () => {
    const db = makeDb({
      health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
      customers: [{ id: 'c-1', organization_id: ORG, lifecycle_stage: 'customer', health_score: 22 }],
      health_score_snapshots: [{ id: 's0', organization_id: ORG, customer_id: 'c-1', score: 22, band: 'red', created_at: new Date(NOW.getTime() - 3600e3).toISOString() }],
    }, { fn_customer_health: () => [RPC_ROW] });
    const r = await recalculateOrgHealth(ORG, sb(db), NOW);
    expect(r).toMatchObject({ customers: 1, snapshots_written: 0, skipped_unchanged: 1, customers_updated: 0, update_statements: 0 });
    expect(db.writes).toEqual([]);
    expect(db.calls).toBe(4);
  });
  test('tester r2 1.2: con las 5 filas reales el cron escribe 22/28/10/42/40 y agrupa los updates por score (5 distintos → 5 sentencias, filtradas por org)', async () => {
    const db = makeDb({
      organization_modules: [{ organization_id: ORG, module_code: 'crm', is_active: true }],
      health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
      customers: REAL_ROWS.map((r) => ({ id: r.customer_id, organization_id: ORG, lifecycle_stage: 'customer', health_score: null })),
      health_score_snapshots: [{ id: 's-real', organization_id: ORG, customer_id: '89e5bc62', score: 60, band: 'yellow', created_at: '2026-09-01T22:23:33.825613+00:00' }],
    }, { fn_customer_health: () => REAL_ROWS });
    const r = await runHealthRecalculate(sb(db), NOW, log);
    expect(r).toMatchObject({ orgs: 1, processed: 1, snapshots_written: 5, customers_updated: 5, errors: 0, aborted: false, pending_org_ids: [] });
    const snaps = writesTo(db, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    expect(Object.fromEntries(snaps.map((s) => [s.customer_id, s.score]))).toEqual(EXPECTED);
    const ups = writesTo(db, 'customers', 'update');
    expect(ups).toHaveLength(5);
    for (const u of ups) expect(u.filters.organization_id).toBe(ORG);
  });
  test('r2 2.4: orderOrgsByLeastRecentlyProcessed: nunca procesadas primero (orden estable), luego la más antigua', () => {
    expect(orderOrgsByLeastRecentlyProcessed([1, 2, 3, 4, 5], new Map([[1, 300], [2, 100], [3, 200]]))).toEqual([4, 5, 2, 3, 1]);
  });
  test('r2 2.5: 49 orgs a 70 ms por llamada con presupuesto de 3 000 ms: procesa las que caben, pending_org_ids con el resto y la siguiente ejecución rota', async () => {
    const { db, orgIds } = fortyNineDb();
    db.latencyMs = 70;
    const clock = () => db.virtualNowMs;
    const r1 = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 3_000, clock });
    expect(r1.aborted).toBe(true);
    expect(r1.processed).toBeGreaterThan(5);
    expect(r1.processed + r1.pending_org_ids.length).toBe(49);
    expect(r1.pending_org_ids).toEqual(orgIds.filter((id) => !r1.by_org.some((o) => o.org_id === id)));
    expect(r1.elapsed_ms).toBeLessThanOrEqual(3_000 + 5 * 70);
    expect(r1.elapsed_ms).toBeGreaterThanOrEqual(3_000);
    const r2 = await runHealthRecalculate(sb(db), new Date(NOW.getTime() + 24 * 3600e3), log, undefined, { budgetMs: 3_000, clock });
    expect(r2.by_org.slice(0, r1.pending_org_ids.length).map((o) => o.org_id)).toEqual(r1.pending_org_ids.slice(0, r2.by_org.length));
    expect(r2.processed).toBeGreaterThan(0);
    const repeated = r2.by_org.map((o) => o.org_id).filter((id) => !r1.pending_org_ids.includes(id));
    expect(repeated.length === 0 || r2.by_org.length > r1.pending_org_ids.length).toBe(true);
  });
  test('r2 2.6 / tester r1 T4.4: sin presupuesto ni señal procesa las 49 y pending_org_ids = []; señal ya abortada → processed 0, pending = todas, sin RPC', async () => {
    const { db, orgIds } = fortyNineDb();
    const all = await runHealthRecalculate(sb(db), NOW, log);
    expect(all).toMatchObject({ orgs: 49, processed: 49, aborted: false, pending_org_ids: [] });
    const ac = new AbortController();
    ac.abort();
    const fresh = makeDb({ organization_modules: db.rows.organization_modules });
    const none = await runHealthRecalculate(sb(fresh), NOW, log, ac.signal);
    expect(none).toMatchObject({ orgs: 49, processed: 0, aborted: true, by_org: [] });
    expect(none.pending_org_ids).toEqual(orgIds);
    expect(fresh.rpcCalls).toEqual([]);
  });
  test('tester r2 2.1: distribución real, 70 ms y 12 000 ms con el reloj SERIAL del doble → día 1 caben ≥ 46/49 (en real, con Promise.all, las 49); org 113 con 196 clientes usa ≤ 20 sentencias; día 2 solo escriben las pendientes', async () => {
    const db = realDistributionDb();
    db.latencyMs = 70;
    const clock = () => db.virtualNowMs;
    const r = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 12_000, clock });
    expect(r.processed).toBeGreaterThanOrEqual(46);
    expect(r.processed + r.pending_org_ids.length).toBe(49);
    expect(db.calls).toBeLessThanOrEqual(180);
    const realTrips = 3 + 49 + r.by_org.reduce((s, o) => s + Math.ceil(o.snapshots_written / 200) + o.update_statements, 0);
    expect(realTrips * 70).toBeLessThan(12_000);
    const o113 = r.by_org.find((o) => o.org_id === 113)!;
    expect(o113.customers).toBe(196);
    expect(o113.update_statements).toBeLessThanOrEqual(20);
    const r2 = await runHealthRecalculate(sb(db), new Date(NOW.getTime() + 3600e3), log, undefined, { budgetMs: 12_000, clock });
    const pendingCustomers = r.pending_org_ids.reduce((s, id) => s + (SIZES[id] ?? 0), 0);
    expect(r2.snapshots_written).toBe(pendingCustomers);
    expect(r2.customers_updated).toBe(pendingCustomers);
    expect(r2.by_org.filter((o) => !r.pending_org_ids.includes(o.org_id)).every((o) => o.snapshots_written === 0 && o.customers_updated === 0)).toBe(true);
    expect(r2.processed).toBe(49);
  });
});
