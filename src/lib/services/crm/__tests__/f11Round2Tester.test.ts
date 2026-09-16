/// <reference types="jest" />
/**
 * F11 — ronda 2, suite del TESTER. Verifica (no cree) lo que dice el constructor:
 * un solo score («Recalcular», «Medir ahora» y cron escriben lo mismo), presupuesto
 * y rotación con la distribución REAL de clientes (43 orgs sin clientes), regla 5
 * en las 5 rutas, meses en la zona de la organización (DST), índices únicos.
 */
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 113 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn() }));
jest.mock('@/lib/jobs/registry', () => ({ hasRealJobHandler: () => false }));
jest.mock('@/lib/jobs/handlers', () => ({}));
jest.mock('@/lib/jobs/runner', () => ({ makeJobLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }), makeWorkerId: () => 'w' }));
jest.mock('@/lib/jobs/handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => createFakeSupabase(ctxState.db!) as unknown as SupabaseClient) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const ctxState: { orgId: number; userId: string; db: FakeDb | null } = { orgId: 113, userId: 'user-session', db: null };
jest.mock('@/lib/utils/orgContext', () => {
  class OrgContextError extends Error {
    statusCode: number;
    constructor(status: number, message: string) { super(message); this.statusCode = status; }
  }
  return {
    OrgContextError,
    getServerOrgContext: jest.fn(async () => {
      if (!ctxState.db) throw new OrgContextError(401, 'sin sesión');
      return { organizationId: ctxState.orgId, userId: ctxState.userId, supabase: createFakeSupabase(ctxState.db) as unknown as SupabaseClient };
    }),
  };
});

import { POST as postRefresh } from '@/app/api/crm/health/refresh/route';
import { POST as postSnapshot } from '@/app/api/crm/health/[customerId]/snapshot/route';
import { POST as postRecalcCron } from '@/app/api/crm/health/recalculate/route';
import { POST as postInstances } from '@/app/api/crm/onboarding/instances/route';
import { PATCH as patchInstance } from '@/app/api/crm/onboarding/instances/[id]/route';
import { PATCH as patchStep } from '@/app/api/crm/onboarding/instances/[id]/steps/[stepId]/route';
import { recalculateOrgHealth, runHealthRecalculate, orderOrgsByLeastRecentlyProcessed } from '@/lib/jobs/scheduled/healthRecalculate';
import { runScheduledKinds } from '@/lib/jobs/scheduler';
import { parseHealthConfig, scoreFromConfig, type HealthRpcRow } from '../healthBands';
import { applyHealthScores, scoreOf, snapshotCustomerHealth } from '../healthScoreServer';
import { buildRenewalPlan, computeExpiryDate } from '../renewalMilestones';
import { scheduleRenewal } from '../renewalService';
import { startOnboardingForWonOpportunity } from '../onboardingService';
import type { JobLogger } from '@/lib/jobs/types';

const ORG = 113;
const DECOY = ORG + 1;
const NOW = new Date('2026-09-15T13:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;
const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  new NextRequest(`http://localhost:3000${url}`, { method: init.method ?? 'POST', headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

/** Config REAL (idéntica en las 54 filas de health_score_configs). */
const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
const CONFIG = parseHealthConfig(REAL_CONFIG)!;
/** Filas REALES de fn_customer_health(113/2/134, NULL) leídas el 2026-09-15 (ids recortados). */
const REAL_ROWS: HealthRpcRow[] = [
  { customer_id: '0bd2a6bc', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 78, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 57, band: 'at_risk' },
  { customer_id: '0cc1854f', invoices_12m: 1, revenue_12m: 71000, days_since_last_invoice: 70, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 59, band: 'at_risk' },
  { customer_id: '674c3eed', invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: 419, days_since_last_activity: null, overdue_balance: 1131000, overdue_ratio: 0.9746, score: 1, band: 'critical' },
  { customer_id: '273ae512', invoices_12m: 4, revenue_12m: 264180.01, days_since_last_invoice: 243, days_since_last_activity: null, overdue_balance: 415940, overdue_ratio: 0.8603, score: 24, band: 'critical' },
  { customer_id: '89e5bc62', invoices_12m: 1, revenue_12m: 29000, days_since_last_invoice: 15, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 60, band: 'at_risk' },
];
const EXPECTED = { '0bd2a6bc': 22, '0cc1854f': 28, '674c3eed': 10, '273ae512': 42, '89e5bc62': 40 } as const;

function healthDb(): FakeDb {
  return makeDb({
    organization_modules: [{ organization_id: ORG, module_code: 'crm', is_active: true }],
    health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
    customers: REAL_ROWS.map((r) => ({ id: r.customer_id, organization_id: ORG, lifecycle_stage: 'customer', full_name: `Cliente ${r.customer_id}`, health_score: null })),
    // snapshot real de org 134 (60, 2026-09-01) para uno de ellos
    health_score_snapshots: [{ id: 's-real', organization_id: ORG, customer_id: '89e5bc62', score: 60, band: 'yellow', created_at: '2026-09-01T22:23:33.825613+00:00' }],
  }, { fn_customer_health: (a) => (a.p_customer_id ? REAL_ROWS.filter((r) => r.customer_id === a.p_customer_id) : REAL_ROWS) });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'cron-secret-0123456789';
  ctxState.orgId = ORG;
  ctxState.userId = 'user-session';
  ctxState.db = healthDb();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── 1. Un solo score ───────────────────────────────────────────────────────
describe('un solo score: cron, «Recalcular» y «Medir ahora» escriben lo mismo que muestra la lista', () => {
  test('tabla RPC vs config con filas reales: scoreOf (cron) == scoreFromConfig (lista) para las 5 filas', () => {
    for (const r of REAL_ROWS) {
      const cfg = scoreFromConfig(CONFIG, r)!;
      expect(scoreOf(r, CONFIG)).toEqual({ score: cfg.score, band: cfg.band });
      expect(cfg.score).toBe(EXPECTED[r.customer_id as keyof typeof EXPECTED]);
      expect(cfg.score).not.toBe(r.score); // la RPC cruda difiere en las 5
    }
  });

  test('cron (runHealthRecalculate) escribe 22/28/10/42/40 y actualiza customers por lotes (5 scores distintos → 5 sentencias, no 1 por cliente)', async () => {
    const db = healthDb();
    const r = await runHealthRecalculate(sb(db), NOW, log);
    expect(r).toMatchObject({ orgs: 1, processed: 1, snapshots_written: 5, customers_updated: 5, errors: 0, aborted: false, pending_org_ids: [] });
    const snaps = writesTo(db, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    expect(Object.fromEntries(snaps.map((s) => [s.customer_id, s.score]))).toEqual(EXPECTED);
    const ups = writesTo(db, 'customers', 'update');
    expect(ups).toHaveLength(5);
    for (const u of ups) expect(u.filters.organization_id).toBe(ORG);
  });

  test('POST /health/refresh («Recalcular», sesión) escribe exactamente lo mismo que el cron', async () => {
    const res = await postRefresh(req('/api/crm/health/refresh', { body: {} }));
    expect(res.status).toBe(200);
    const snaps = writesTo(ctxState.db!, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    expect(Object.fromEntries(snaps.map((s) => [s.customer_id, s.score]))).toEqual(EXPECTED);
    const cust = Object.fromEntries((ctxState.db!.rows.customers as Row[]).map((c) => [c.id, c.health_score]));
    expect(cust).toEqual(EXPECTED);
    // segunda pasada inmediata: nada cambió y el intervalo no venció → 0 escrituras
    const before = ctxState.db!.writes.length;
    await postRefresh(req('/api/crm/health/refresh', { body: {} }));
    expect(ctxState.db!.writes.length).toBe(before);
  });

  test('POST /health/[id]/snapshot («Medir ahora») da 22 para 0bd2a6bc, igual que el cron; la segunda vez snapshot_written=false', async () => {
    const r1 = await postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: {} }), params({ customerId: '0bd2a6bc' }));
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1.data).toMatchObject({ score: 22, band: 'red', snapshot_written: true, customer_updated: true });
    const r2 = await postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: {} }), params({ customerId: '0bd2a6bc' }));
    expect((await r2.json()).data).toMatchObject({ score: 22, snapshot_written: false, customer_updated: false });
    // el cliente con el snapshot real de 60 → 40 ahora (cambió) → se escribe
    const r3 = await postSnapshot(req('/api/crm/health/89e5bc62/snapshot', { body: {} }), params({ customerId: '89e5bc62' }));
    expect((await r3.json()).data).toMatchObject({ score: 40, band: 'yellow', snapshot_written: true });
    // cliente ajeno o no-customer → 404 sin escrituras
    const n = ctxState.db!.writes.length;
    const r4 = await postSnapshot(req('/api/crm/health/nope/snapshot', { body: {} }), params({ customerId: 'nope' }));
    expect(r4.status).toBe(404);
    expect(ctxState.db!.writes.length).toBe(n);
  });

  test('cron con secreto (POST /health/recalculate) para la misma org: mismo resultado que /health/refresh', async () => {
    const res = await postRecalcCron(req('/api/crm/health/recalculate', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, body: { organization_id: ORG } }));
    expect(res.status).toBe(200);
    const snaps = writesTo(ctxState.db!, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    expect(Object.fromEntries(snaps.map((s) => [s.customer_id, s.score]))).toEqual(EXPECTED);
  });

  test('verifyCronSecret sigue fail-closed: sin CRON_SECRET → 401 y cero escrituras; ?token= → 401', async () => {
    delete process.env.CRON_SECRET;
    const a = await postRecalcCron(req('/api/crm/health/recalculate', { headers: { authorization: 'Bearer cron-secret-0123456789' }, body: {} }));
    expect(a.status).toBe(401);
    process.env.CRON_SECRET = 'cron-secret-0123456789';
    const b = await postRecalcCron(req('/api/crm/health/recalculate?token=cron-secret-0123456789', { body: {} }));
    expect(b.status).toBe(401);
    expect(ctxState.db!.writes).toEqual([]);
    expect(ctxState.db!.rpcCalls).toEqual([]);
  });

  test('snapshot: 25 h con el mismo score → se escribe (intervalo vencido, fuera de la ventana); 2 h mismo score → no; 2 h distinto → sí', async () => {
    const mk = (hoursAgo: number, score: number) => {
      const db = healthDb();
      db.rows.health_score_snapshots = [{ id: 's', organization_id: ORG, customer_id: '0bd2a6bc', score, band: 'red', created_at: new Date(NOW.getTime() - hoursAgo * 3600e3).toISOString() }];
      db.rpc!.fn_customer_health = () => [REAL_ROWS[0]];
      db.rows.customers = [{ id: '0bd2a6bc', organization_id: ORG, lifecycle_stage: 'customer', health_score: 22 }];
      return db;
    };
    const a = mk(25, 22); await recalculateOrgHealth(ORG, sb(a), NOW); expect(writesTo(a, 'health_score_snapshots', 'insert')).toHaveLength(1);
    const b = mk(2, 22); const rb = await recalculateOrgHealth(ORG, sb(b), NOW); expect(writesTo(b, 'health_score_snapshots', 'insert')).toHaveLength(0); expect(rb.skipped_unchanged).toBe(1);
    const c = mk(2, 58); await recalculateOrgHealth(ORG, sb(c), NOW); expect(writesTo(c, 'health_score_snapshots', 'insert')).toHaveLength(1);
    // customers.health_score ya es 22 → 0 sentencias de update en los tres casos
    for (const d of [a, b, c]) expect(writesTo(d, 'customers', 'update')).toHaveLength(0);
  });

  test('applyHealthScores: agrupa por score, filtra por org, 0 cambios → 0 sentencias', async () => {
    const db = makeDb({ customers: [] });
    expect(await applyHealthScores(sb(db), ORG, [], NOW)).toEqual({ statements: 0, updated: 0 });
    const r = await applyHealthScores(sb(db), ORG, [{ customer_id: 'a', score: 22 }, { customer_id: 'b', score: 22 }, { customer_id: 'c', score: 40 }], NOW);
    expect(r).toEqual({ statements: 2, updated: 3 });
    const ups = writesTo(db, 'customers', 'update');
    expect(ups.map((u) => [u.rows[0].health_score, u.filters.organization_id, u.filters.id__in ?? u.filters.id])).toEqual([[22, ORG, ['a', 'b']], [40, ORG, 'c']]);
  });
});

// ─── 2. Presupuesto y rotación con la distribución REAL ────────────────────
describe('presupuesto y rotación (49 orgs; 43 sin clientes como en la BD real)', () => {
  /** Distribución real: 196, 9, 8, 3, 2, 1 clientes y 43 orgs con 0. Las 43 vacías van PRIMERO en el listado. */
  const SIZES: Record<number, number> = { 113: 196, 134: 9, 130: 8, 2: 3, 112: 2, 125: 1 };
  const ORG_IDS = [...Array.from({ length: 43 }, (_, i) => 300 + i), 113, 134, 130, 2, 112, 125];
  function realDb(): FakeDb {
    const customers: Row[] = [];
    const rpc: Record<number, HealthRpcRow[]> = {};
    for (const id of ORG_IDS) {
      const n = SIZES[id] ?? 0;
      rpc[id] = Array.from({ length: n }, (_, i) => ({ customer_id: `c-${id}-${i}`, invoices_12m: 1 + (i % 4), revenue_12m: 30000 + (i % 7) * 20000, days_since_last_invoice: 10 + (i % 5) * 20, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 55, band: 'at_risk' }));
      for (const r of rpc[id]) customers.push({ id: r.customer_id, organization_id: id, lifecycle_stage: 'customer', health_score: null });
    }
    const db = makeDb({
      organization_modules: ORG_IDS.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
      health_score_configs: ORG_IDS.map((id) => ({ organization_id: id, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true })),
      customers, health_score_snapshots: [],
    }, { fn_customer_health: (a) => rpc[a.p_org_id as number] ?? [] });
    return db;
  }

  test('70 ms por llamada y 12 000 ms con el reloj virtual SERIAL del doble (cuenta las 3 lecturas paralelas como 3 idas): día 1 caben 46/49 (177 llamadas = 12,4 s); en real (Promise.all = 1 ida) ≈ 90 idas ≈ 6,3 s → caben las 49', async () => {
    const db = realDb();
    db.latencyMs = 70;
    const clock = () => db.virtualNowMs;
    const r = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 12_000, clock });
    expect(r.processed).toBeGreaterThanOrEqual(46);
    expect(r.processed + r.pending_org_ids.length).toBe(49);
    expect(db.calls).toBeLessThanOrEqual(180);
    // idas reales: 3 iniciales + 1 por org (lecturas en paralelo) + inserts + sentencias de update
    const realTrips = 3 + 49 + r.by_org.reduce((s, o) => s + Math.ceil(o.snapshots_written / 200) + o.update_statements, 0);
    expect(realTrips * 70).toBeLessThan(12_000);
    // eslint-disable-next-line no-console
    console.info(`[medida] serial: ${r.processed}/49 en ${r.elapsed_ms} ms (${db.calls} llamadas); real estimado: ${realTrips} idas ≈ ${realTrips * 70} ms`);
    const o113 = r.by_org.find((o) => o.org_id === 113)!;
    expect(o113.customers).toBe(196);
    expect(o113.update_statements).toBeLessThanOrEqual(20); // 18 scores distintos en la fixture (7 en la org real), no 196 sentencias
    // día 2: nada cambió, intervalo no vencido (misma hora) → 0 escrituras y aún más rápido
    const db2 = db; const w = db2.writes.length;
    const r2 = await runHealthRecalculate(sb(db2), new Date(NOW.getTime() + 3600e3), log, undefined, { budgetMs: 12_000, clock: () => db2.virtualNowMs });
    // solo escriben las orgs que quedaron pendientes el día 1 (6 clientes entre 2, 112 y 125); las ya procesadas no escriben nada
    const pendingCustomers = r.pending_org_ids.reduce((s, id) => s + (SIZES[id] ?? 0), 0);
    expect(r2.snapshots_written).toBe(pendingCustomers);
    expect(r2.customers_updated).toBe(pendingCustomers);
    expect(r2.by_org.filter((o) => !r.pending_org_ids.includes(o.org_id)).every((o) => o.snapshots_written === 0 && o.customers_updated === 0)).toBe(true);
    expect(r2.processed).toBe(49);
    expect(db2.writes.length).toBeGreaterThanOrEqual(w);
    // eslint-disable-next-line no-console
    console.info(`[medida] día 1: ${r.elapsed_ms} ms virtuales (${db.calls} llamadas); día 2: ${r2.elapsed_ms} ms`);
  });

  test('con presupuesto insuficiente: pending_org_ids honesto (disjunto de by_org, suma 49, en el orden de ejecución)', async () => {
    const db = realDb();
    db.latencyMs = 70;
    const r = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 1_500, clock: () => db.virtualNowMs });
    expect(r.aborted).toBe(true);
    expect(r.processed + r.pending_org_ids.length).toBe(49);
    expect(r.by_org.map((o) => o.org_id).some((id) => r.pending_org_ids.includes(id))).toBe(false);
    expect(new Set([...r.by_org.map((o) => o.org_id), ...r.pending_org_ids]).size).toBe(49);
    // señal abortada antes de empezar → pending = las 49 en el orden calculado
    const ac = new AbortController(); ac.abort();
    const s = await runHealthRecalculate(sb(realDb()), NOW, log, ac.signal);
    expect(s).toMatchObject({ aborted: true, processed: 0 });
    expect(s.pending_org_ids).toHaveLength(49);
  });

  test('DEUDA (baja): la rotación se apoya en snapshots; una org procesada SIN clientes no deja huella y vuelve a ir primero → con presupuesto corto las orgs con clientes se quedan pendientes dos días seguidos', async () => {
    const db = realDb();
    db.latencyMs = 70;
    const r1 = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 1_500, clock: () => db.virtualNowMs });
    const first = r1.by_org.map((o) => o.org_id);
    expect(first.every((id) => id >= 300)).toBe(true); // solo orgs vacías cupieron
    const r2 = await runHealthRecalculate(sb(db), new Date(NOW.getTime() + 864e5), log, undefined, { budgetMs: 1_500, clock: () => db.virtualNowMs });
    // rotación esperada: las pendientes de ayer primero. Real: las mismas vacías (sin snapshot = "nunca procesada").
    expect(r2.by_org.map((o) => o.org_id)).toEqual(first);
    expect(r2.pending_org_ids).toContain(113);
  });

  test('orderOrgsByLeastRecentlyProcessed: nunca procesadas primero (estable), luego la más antigua', () => {
    expect(orderOrgsByLeastRecentlyProcessed([5, 6, 7, 8], new Map([[5, 300], [7, 100], [8, 200]]))).toEqual([6, 7, 8, 5]);
  });

  test('runScheduledKinds: cada tarea F11 recibe taskBudgetMs propio y health devuelve budget_ms/pending_org_ids en la respuesta', async () => {
    const db = realDb();
    db.rows.organizations = [];
    db.rows.opportunities = [];
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, worker: 't', supabase: sb(db), now: NOW });
    expect(out.health_recalculate?.ok && out.health_recalculate.result.budget_ms).toBe(12_000);
    expect(out.health_recalculate?.ok && out.health_recalculate.result.pending_org_ids).toEqual([]);
    expect(out.renewals_sync?.ok && out.renewals_sync.result.processed).toBe(49);
  });
});

// ─── 3. Regla 5 en las 5 rutas ──────────────────────────────────────────────
describe('regla 5: organization_id ajeno en el body → 403 + registro, sin escrituras', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['POST /onboarding/instances', () => postInstances(req('/api/crm/onboarding/instances', { body: { opportunity_id: 'x', organization_id: DECOY } }))],
    ['PATCH /onboarding/instances/[id]', () => patchInstance(req('/api/crm/onboarding/instances/i', { method: 'PATCH', body: { status: 'completed', organization_id: DECOY } }), params({ id: 'i' }))],
    ['PATCH /onboarding/instances/[id]/steps/[stepId]', () => patchStep(req('/api/crm/onboarding/instances/i/steps/s', { method: 'PATCH', body: { is_completed: true, organization_id: String(DECOY) } }), params({ id: 'i', stepId: 's' }))],
    ['POST /health/refresh', () => postRefresh(req('/api/crm/health/refresh', { body: { organization_id: DECOY } }))],
    ['POST /health/[id]/snapshot', () => postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: { organization_id: DECOY } }), params({ customerId: '0bd2a6bc' }))],
  ];
  for (const [name, run] of cases) {
    test(`${name}: 403, warn con la org de sesión y la ajena, 0 escrituras y 0 RPC`, async () => {
      const res = await run();
      expect(res.status).toBe(403);
      expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: ORG, body: expect.anything() }));
      expect(ctxState.db!.writes).toEqual([]);
      expect(ctxState.db!.rpcCalls).toEqual([]);
    });
  }
  test('la misma org (número o cadena) y la ausencia NO son ataque: /health/refresh sigue 200', async () => {
    expect((await postRefresh(req('/api/crm/health/refresh', { body: { organization_id: String(ORG) } }))).status).toBe(200);
    expect((await postRefresh(req('/api/crm/health/refresh'))).status).toBe(200);
  });
});

// ─── 4. Meses en la zona de la organización ────────────────────────────────
describe('computeExpiryDate en la zona de la organización', () => {
  test('mi caso r1: 31 ene 04:30Z (30 ene 23:30 Bogotá) + 1 mes → 28 feb 23:30 Bogotá = 2026-03-01T04:30Z; en UTC 28 feb 04:30Z', () => {
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'America/Bogota').toISOString()).toBe('2026-03-01T04:30:00.000Z');
    expect(buildRenewalPlan({ closedAt: '2026-01-31T04:30:00Z', billingCycleMonths: 1, now: new Date('2026-01-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2026-02-28');
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'UTC').toISOString()).toBe('2026-02-28T04:30:00.000Z');
  });
  test('Nueva York cruzando DST hacia atrás: 20 oct 2026 09:15 local (EDT, −4) + 1 mes → 20 nov 09:15 local (EST, −5) = 14:15Z', () => {
    const d = computeExpiryDate(new Date('2026-10-20T13:15:00Z'), 1, 'America/New_York');
    expect(d.toISOString()).toBe('2026-11-20T14:15:00.000Z');
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)).toBe('09:15');
  });
  test('bisiesto: 29 feb 2028 12:00 Bogotá + 12 → 28 feb 2029; + 48 → 29 feb 2032; el hito de 120 días se calcula sobre el instante', () => {
    expect(buildRenewalPlan({ closedAt: '2028-02-29T17:00:00Z', billingCycleMonths: 12, now: new Date('2028-03-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2029-02-28');
    expect(buildRenewalPlan({ closedAt: '2028-02-29T17:00:00Z', billingCycleMonths: 48, now: new Date('2028-03-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2032-02-29');
  });
  test('zona inválida → cae al fallback (Bogotá) o lanza con mensaje claro, nunca NaN', () => {
    let out: Date | null = null;
    try { out = computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'Marte/Olympus'); } catch (e) { expect(String(e)).toMatch(/zona|timezone|Invalid|inválid/i); return; }
    expect(Number.isNaN(out!.getTime())).toBe(false);
  });
});

// ─── 5. Concurrencia con los tres índices reales (el doble los simula) ──────
describe('idempotencia bajo concurrencia con los índices únicos', () => {
  test('renovación: 5 llamadas en paralelo → 1 insert, 1 juego de tareas, 4 rechazos 23505 convertidos en already_existed', async () => {
    const db = makeDb({
      pipelines: [{ id: 'pl', organization_id: ORG, pipeline_type: 'renewal' }], stages: [{ id: 'st', pipeline_id: 'pl', position: 1 }],
      opportunities: [{ id: 'won', organization_id: ORG, status: 'won', customer_id: 'c', amount: 1, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null }],
      tasks: [], customers: [{ id: 'c', organization_id: ORG, full_name: 'C' }], sequences: [],
    });
    const client = sb(db);
    const rs = await Promise.all(Array.from({ length: 5 }, () => scheduleRenewal(ORG, 'won', 12, client, { now: NOW })));
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(1);
    expect(rs.filter((r) => r.already_existed)).toHaveLength(4);
    expect(new Set(rs.map((r) => r.renewal_opportunity_id)).size).toBe(1);
    expect(db.rejected.map((r) => r.index)).toEqual(Array(4).fill('uq_opportunities_one_renewal_per_parent'));
  });
  test('onboarding: 5 llamadas en paralelo → 1 hija, 1 instancia, 7 pasos; el índice de la hija exige metadata.type=onboarding', async () => {
    const db = makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'T', steps: Array.from({ length: 7 }, (_, i) => ({ day: i, title: `P${i}` })), default_duration_days: 30, is_active: true }],
      pipelines: [{ id: 'pl', organization_id: ORG, pipeline_type: 'onboarding' }], stages: [{ id: 'st', pipeline_id: 'pl', position: 1, is_won: false }],
      opportunities: [{ id: 'won', organization_id: ORG, status: 'won', customer_id: 'c', currency: 'USD', salesperson_id: null, parent_opportunity_id: null }],
      organizations: [{ id: ORG, base_currency: 'COP' }],
      onboarding_instances: [], onboarding_steps: [], customers: [{ id: 'c', organization_id: ORG, full_name: 'C' }],
    });
    const client = sb(db);
    const rs = await Promise.all(Array.from({ length: 5 }, () => startOnboardingForWonOpportunity(ORG, 'won', client, { now: NOW })));
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ metadata: { type: 'onboarding' }, currency: 'USD' });
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
    expect(new Set(rs.map((r) => r.instance_id)).size).toBe(1);
    expect(rs.filter((r) => r.already_existed)).toHaveLength(4);
  });
});
