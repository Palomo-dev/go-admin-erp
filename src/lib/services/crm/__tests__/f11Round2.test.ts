/// <reference types="jest" />
/**
 * F11 — ronda 2 (constructor): los siete puntos del tester r1.
 *  1. un solo score (config sobre RPC) en «Recalcular», «Medir ahora» y cron; sin MV;
 *  2. cron que cabe: lotes, solo si cambió, rotación, presupuesto propio, pending_org_ids;
 *  3. regla 5 en las tres rutas de escritura de onboarding;
 *  4. foco: la casilla sigue montada mientras se guarda (modelo puro);
 *  5. producto honesto: etiquetas por fuente real, moneda del padre, completar sin mentir;
 *  6. meses en la zona de la organización;
 *  7. 23505 = already_existed.
 * Rojos citados en el informe de la ronda; el doble simula los índices reales.
 */
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));
const ctxState: { orgId: number; userId: string; db: FakeDb | null } = { orgId: 120, userId: 'user-session', db: null };
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
let browserDb: FakeDb = makeDb();
jest.mock('@/lib/supabase/config', () => ({ get supabase() { return createFakeSupabase(browserDb); } }));

import { POST as postInstances } from '@/app/api/crm/onboarding/instances/route';
import { PATCH as patchInstance } from '@/app/api/crm/onboarding/instances/[id]/route';
import { PATCH as patchStep } from '@/app/api/crm/onboarding/instances/[id]/steps/[stepId]/route';
import { POST as postRefresh } from '@/app/api/crm/health/refresh/route';
import { POST as postSnapshot } from '@/app/api/crm/health/[customerId]/snapshot/route';
import { applyHealthScores, composeHealthResult, honestIndicatorLabel, snapshotCustomerHealth } from '../healthScoreServer';
import { healthScoreService } from '../healthScoreService';
import { orderOrgsByLeastRecentlyProcessed, recalculateOrgHealth, runHealthRecalculate } from '@/lib/jobs/scheduled/healthRecalculate';
import { runScheduledKinds } from '@/lib/jobs/scheduler';
import { parseHealthConfig, type HealthRpcRow } from '../healthBands';
import { buildRenewalPlan, computeExpiryDate } from '../renewalMilestones';
import { scheduleRenewal } from '../renewalService';
import { completeOnboardingInstance, createOnboardingInstance, startOnboardingForWonOpportunity } from '../onboardingService';
import { checklistStepControl, focusTargetAfterComplete } from '../onboardingProgress';
import type { JobLogger } from '@/lib/jobs/types';

jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn() }));
jest.mock('@/lib/jobs/registry', () => ({ hasRealJobHandler: () => false }));
jest.mock('@/lib/jobs/runner', () => ({ makeJobLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }), makeWorkerId: () => 'w' }));
jest.mock('@/lib/jobs/handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('sin service client'); } }));

const ORG = 120;
const DECOY = 121;
const NOW = new Date('2026-09-15T08:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;
const req = (url: string, body?: unknown, method = 'POST') =>
  new NextRequest(`http://localhost:3000${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

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

function healthDb(): FakeDb {
  return makeDb({
    organization_modules: [{ organization_id: ORG, module_code: 'crm', is_active: true }],
    health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
    customers: [{ id: 'c-1', organization_id: ORG, full_name: 'Cliente 1', lifecycle_stage: 'customer', health_score: 58 }],
    health_score_snapshots: [{ id: 's0', organization_id: ORG, customer_id: 'c-1', score: 22, band: 'red', created_at: new Date(NOW.getTime() - 3600e3).toISOString() }],
  }, { fn_customer_health: (a) => (a.p_customer_id == null || a.p_customer_id === 'c-1' ? [RPC_ROW] : []) });
}

beforeEach(() => {
  ctxState.orgId = ORG;
  ctxState.db = null;
  // Las rutas de health usan el reloj real y las semillas están ancladas a NOW:
  // sin fijar la fecha, el snapshot «de hace 1 h» vence a las 24 h y la suite se
  // ponía roja sola al día siguiente (2026-09-16). Solo se dobla `Date`.
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setImmediate', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

// ─── 1. Un solo score ───────────────────────────────────────────────────────
describe('1. un solo score: config sobre la RPC en Recalcular, Medir ahora y cron', () => {
  test('POST /health/refresh con sesión: escribe 22 (config) en customers y NO duplica el snapshot de hace 1 h', async () => {
    ctxState.db = healthDb();
    const res = await postRefresh(req('/api/crm/health/refresh', {}));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ org_id: ORG, customers: 1, customers_updated: 1, snapshots_written: 0 });
    expect(writesTo(ctxState.db, 'customers', 'update')[0].rows[0]).toMatchObject({ health_score: 22 });
    expect(writesTo(ctxState.db, 'health_score_snapshots', 'insert')).toHaveLength(0);
  });

  test('POST /health/refresh: organization_id ajeno en el body → 403 + warn, sin escrituras; sin sesión → 401', async () => {
    ctxState.db = healthDb();
    const res = await postRefresh(req('/api/crm/health/refresh', { organization_id: DECOY }));
    expect(res.status).toBe(403);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: ORG, body: DECOY }));
    expect(ctxState.db.writes).toEqual([]);
    ctxState.db = null;
    expect((await postRefresh(req('/api/crm/health/refresh', {}))).status).toBe(401);
  });

  test('POST /health/[id]/snapshot («Medir ahora»): 22/red por la RPC + config; snapshot solo si cambió o venció el intervalo', async () => {
    ctxState.db = healthDb();
    const first = await postSnapshot(req('/api/crm/health/c-1/snapshot', {}), params({ customerId: 'c-1' }));
    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ score: 22, band: 'red', snapshot_written: false, customer_updated: true });
    ctxState.db.rows.health_score_snapshots = [];
    const second = await postSnapshot(req('/api/crm/health/c-1/snapshot', {}), params({ customerId: 'c-1' }));
    expect((await second.json()).data).toMatchObject({ score: 22, snapshot_written: true, customer_updated: false });
    expect(writesTo(ctxState.db, 'health_score_snapshots', 'insert')[0].rows[0]).toMatchObject({ organization_id: ORG, customer_id: 'c-1', score: 22, band: 'red' });
    const decoy = await postSnapshot(req('/api/crm/health/c-121/snapshot', {}), params({ customerId: 'c-121' }));
    expect(decoy.status).toBe(404);
  });

  test('snapshotCustomerHealth: cliente sin fila en la RPC (otra org o lead) → null y sin escrituras', async () => {
    const db = healthDb();
    db.rpc!.fn_customer_health = () => [];
    expect(await snapshotCustomerHealth(ORG, 'c-1', sb(db), NOW)).toBeNull();
    expect(db.writes).toEqual([]);
  });

  test('fachada de navegador: Recalcular y Medir ahora van por fetch a las rutas con sesión, nunca a Supabase desde el cliente', async () => {
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: url.endsWith('/snapshot') ? { score: 22, snapshot_written: true } : { customers: 3, customers_updated: 1, snapshots_written: 2 } }),
    }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    browserDb = makeDb();
    const r = await healthScoreService.refreshAllHealthScores();
    expect(r).toMatchObject({ customers: 3, customers_updated: 1, snapshots_written: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/crm/health/refresh');
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ method: 'POST' });
    const s = await healthScoreService.snapshotHealthScore('c-1');
    expect(s).toMatchObject({ score: 22, snapshot_written: true });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/crm/health/c-1/snapshot');
    expect(browserDb.calls).toBe(0);
    expect(browserDb.rpcCalls).toEqual([]);
  });

  test('countInvoices (ficha de un lead con facturas): cuenta invoice_sales de la org y del cliente', async () => {
    browserDb = makeDb({ invoice_sales: [
      { id: 'i1', organization_id: ORG, customer_id: 'lead-1', status: 'paid' }, { id: 'i2', organization_id: ORG, customer_id: 'lead-1', status: 'void' },
      { id: 'i3', organization_id: DECOY, customer_id: 'lead-1', status: 'paid' },
    ] });
    expect(await healthScoreService.countInvoices('lead-1', ORG)).toBe(1);
  });
});

// ─── 2. Cron que cabe ───────────────────────────────────────────────────────
describe('2. cron: lotes, solo si cambió, rotación, presupuesto propio y pending_org_ids', () => {
  const cfg = parseHealthConfig(REAL_CONFIG)!;
  const row = (id: string, inv: number): HealthRpcRow => ({ ...RPC_ROW, customer_id: id, invoices_12m: inv });

  test('applyHealthScores: una sentencia por valor distinto de score (no una por cliente), filtrada por organización', async () => {
    const db = makeDb({ customers: [] });
    const r = await applyHealthScores(sb(db), ORG, [{ customer_id: 'a', score: 22 }, { customer_id: 'b', score: 22 }, { customer_id: 'c', score: 40 }], NOW);
    expect(r).toEqual({ statements: 2, updated: 3 });
    const upd = writesTo(db, 'customers', 'update');
    expect(upd).toHaveLength(2);
    expect(upd[0].filters).toMatchObject({ id__in: ['a', 'b'], organization_id: ORG });
    expect(upd[0].rows[0]).toEqual({ health_score: 22, health_score_updated_at: NOW.toISOString() });
    expect(await applyHealthScores(sb(makeDb()), ORG, [], NOW)).toEqual({ statements: 0, updated: 0 });
  });

  test('recalculateOrgHealth: 219 clientes, 3 cambian → 1 insert por lote de snapshots vencidos y 1 update por score cambiado (no 219)', async () => {
    const rows = Array.from({ length: 219 }, (_, i) => row(`c-${i}`, i < 3 ? 7 : 1)); // 3 con score distinto
    const db = makeDb({
      health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
      customers: rows.map((r) => ({ id: r.customer_id, organization_id: ORG, lifecycle_stage: 'customer', health_score: 22 })),
      health_score_snapshots: rows.map((r) => ({ id: `s-${r.customer_id}`, organization_id: ORG, customer_id: r.customer_id, score: 22, created_at: new Date(NOW.getTime() - 25 * 3600e3).toISOString() })),
    }, { fn_customer_health: () => rows });
    const r = await recalculateOrgHealth(ORG, sb(db), NOW);
    expect(r).toMatchObject({ customers: 219, snapshots_written: 219, customers_updated: 3, update_statements: 1, error: null });
    expect(writesTo(db, 'health_score_snapshots', 'insert').length).toBe(2); // 200 + 19
    expect(writesTo(db, 'customers', 'update')).toHaveLength(1);
    expect(writesTo(db, 'customers', 'update')[0].filters.id__in).toEqual(['c-0', 'c-1', 'c-2']);
    expect(db.calls).toBeLessThanOrEqual(8);
  });

  test('recalculateOrgHealth: nada cambió y el intervalo no venció → 0 escrituras y 4 llamadas (config + RPC/snapshots/customers; en el cron la config viene prefetched: 3)', async () => {
    const db = healthDb();
    (db.rows.customers[0] as { health_score: number }).health_score = 22;
    const r = await recalculateOrgHealth(ORG, sb(db), NOW);
    expect(r).toMatchObject({ customers: 1, snapshots_written: 0, skipped_unchanged: 1, customers_updated: 0, update_statements: 0 });
    expect(db.writes).toEqual([]);
    expect(db.calls).toBe(4);
  });

  test('orderOrgsByLeastRecentlyProcessed: sin snapshot primero, luego la más antigua; estable', () => {
    const last = new Map<number, number>([[1, 300], [2, 100], [3, 200]]);
    expect(orderOrgsByLeastRecentlyProcessed([1, 2, 3, 4, 5], last)).toEqual([4, 5, 2, 3, 1]);
  });

  test('49 orgs a 70 ms por llamada con presupuesto de 3 000 ms: procesa las que caben, pending_org_ids con el resto, y la siguiente ejecución rota', async () => {
    const orgIds = Array.from({ length: 49 }, (_, i) => 200 + i);
    const db = makeDb({
      organization_modules: orgIds.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
      health_score_configs: orgIds.map((id) => ({ organization_id: id, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true })),
      customers: orgIds.map((id) => ({ id: `c-${id}`, organization_id: id, lifecycle_stage: 'customer', health_score: null })),
      health_score_snapshots: [],
    }, { fn_customer_health: (a) => [row(`c-${a.p_org_id}`, 1)] });
    db.latencyMs = 70;
    const clock = () => db.virtualNowMs;
    const r1 = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 3_000, clock });
    expect(r1.aborted).toBe(true);
    expect(r1.processed).toBeGreaterThan(5);
    expect(r1.processed + r1.pending_org_ids.length).toBe(49);
    expect(r1.pending_org_ids).toEqual(orgIds.filter((id) => !r1.by_org.some((o) => o.org_id === id)));
    // por org: rpc + snapshots + customers en paralelo (1 ida y vuelta de reloj cada una) + insert + update ≈ 5 × 70 ms
    expect(r1.elapsed_ms).toBeLessThanOrEqual(3_000 + 5 * 70);
    expect(r1.elapsed_ms).toBeGreaterThanOrEqual(3_000);

    // siguiente ejecución al día siguiente: las pendientes (sin snapshot) van primero
    const tomorrow = new Date(NOW.getTime() + 24 * 3600e3);
    const r2 = await runHealthRecalculate(sb(db), tomorrow, log, undefined, { budgetMs: 3_000, clock });
    expect(r2.by_org.slice(0, r1.pending_org_ids.length).map((o) => o.org_id)).toEqual(r1.pending_org_ids.slice(0, r2.by_org.length));
    expect(r2.processed).toBeGreaterThan(0);
    // ninguna org procesada en r1 se repite antes de agotar las pendientes
    const repeated = r2.by_org.map((o) => o.org_id).filter((id) => !r1.pending_org_ids.includes(id));
    expect(repeated.length === 0 || r2.by_org.length > r1.pending_org_ids.length).toBe(true);
  });

  test('sin presupuesto ni señal: procesa las 49 y pending_org_ids = [] ; señal abortada → pending = todas', async () => {
    const orgIds = Array.from({ length: 49 }, (_, i) => 200 + i);
    const db = makeDb({
      organization_modules: orgIds.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
      health_score_configs: [], customers: [], health_score_snapshots: [],
    }, { fn_customer_health: () => [] });
    const all = await runHealthRecalculate(sb(db), NOW, log);
    expect(all).toMatchObject({ orgs: 49, processed: 49, aborted: false, pending_org_ids: [] });
    const ac = new AbortController();
    ac.abort();
    const none = await runHealthRecalculate(sb(makeDb({ organization_modules: db.rows.organization_modules })), NOW, log, ac.signal);
    expect(none).toMatchObject({ processed: 0, aborted: true });
    expect(none.pending_org_ids).toEqual(orgIds);
  });

  test('runScheduledKinds: las tareas F11 reciben taskBudgetMs propio, no la mitad del presupuesto de maintenance', async () => {
    const db = makeDb({ organization_modules: [], organizations: [], opportunities: [] });
    const out = await runScheduledKinds({ kinds: ['maintenance', 'health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, worker: 't', supabase: sb(db), now: NOW });
    expect(out.health_recalculate?.ok && out.health_recalculate.result.budget_ms).toBe(12_000);
    expect(out.renewals_sync?.ok).toBe(true);
  });
});

// ─── 3. Regla 5 en onboarding ───────────────────────────────────────────────
describe('3. regla 5: organization_id ajeno en el body → 403 y warn en las tres rutas de escritura', () => {
  function onbDb(): FakeDb {
    return makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'Estándar', steps: [{ day: 0, owner: 'vendor', title: 'Kickoff' }], default_duration_days: 30, is_active: true }],
      opportunities: [{ id: 'onb-a', organization_id: ORG, status: 'open', customer_id: 'cust-a', parent_opportunity_id: 'won-a', pipeline_id: 'pl', stage_id: 'st-1', currency: 'USD', metadata: { type: 'onboarding' } }],
      stages: [{ id: 'st-1', pipeline_id: 'pl', position: 1, is_won: false }, { id: 'st-won', pipeline_id: 'pl', position: 2, is_won: true }],
      onboarding_instances: [{ id: 'inst-a', organization_id: ORG, template_id: 'tpl', opportunity_id: 'onb-a', customer_id: 'cust-a', status: 'active', started_at: NOW.toISOString(), completed_at: null }],
      onboarding_steps: [{ id: 'step-a', organization_id: ORG, instance_id: 'inst-a', step_number: 1, name: 'Kickoff', is_completed: false, completed_at: null, completed_by: null, notes: null }],
    });
  }
  test.each([
    ['POST /instances', () => postInstances(req('/api/crm/onboarding/instances', { opportunity_id: 'onb-a', organization_id: DECOY }))],
    ['PATCH /instances/[id]', () => patchInstance(req('/x/inst-a', { status: 'at_risk', organization_id: DECOY }, 'PATCH'), params({ id: 'inst-a' }))],
    ['PATCH /instances/[id]/steps/[stepId]', () => patchStep(req('/x/inst-a/steps/step-a', { is_completed: true, organization_id: String(DECOY) }, 'PATCH'), params({ id: 'inst-a', stepId: 'step-a' }))],
  ])('%s → 403 sin escrituras', async (_name, call) => {
    ctxState.db = onbDb();
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Organización no permitida/);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: ORG }));
    expect(ctxState.db.writes).toEqual([]);
  });
  test('la misma organización en el body no es un ataque: PATCH step sigue funcionando', async () => {
    ctxState.db = onbDb();
    const res = await patchStep(req('/x/inst-a/steps/step-a', { is_completed: true, organization_id: ORG }, 'PATCH'), params({ id: 'inst-a', stepId: 'step-a' }));
    expect(res.status).toBe(200);
  });
});

// ─── 4. Foco (modelo puro) ──────────────────────────────────────────────────
describe('4. foco: la casilla no se desmonta al guardar; tras completar el foco va al mensaje', () => {
  test('checklistStepControl: la casilla que se guarda NO lleva disabled del DOM (perdería el foco) sino locked + busy; las demás disabled; completado → disabled', () => {
    expect(checklistStepControl({ stepId: 'a', busyStepId: 'a', instanceCompleted: false })).toEqual({ disabled: false, locked: true, busy: true });
    expect(checklistStepControl({ stepId: 'b', busyStepId: 'a', instanceCompleted: false })).toEqual({ disabled: true, locked: true, busy: false });
    expect(checklistStepControl({ stepId: 'b', busyStepId: null, instanceCompleted: false })).toEqual({ disabled: false, locked: false, busy: false });
    expect(checklistStepControl({ stepId: 'b', busyStepId: null, instanceCompleted: true })).toEqual({ disabled: true, locked: true, busy: false });
  });
  test('focusTargetAfterComplete: éxito → el mensaje de estado; fallo → el propio botón', () => {
    expect(focusTargetAfterComplete(true)).toBe('status');
    expect(focusTargetAfterComplete(false)).toBe('button');
  });
});

// ─── 5. Producto honesto ────────────────────────────────────────────────────
describe('5. producto honesto: etiquetas por fuente real, moneda del padre, completar no miente', () => {
  test('honestIndicatorLabel: las claves conocidas se etiquetan por lo que de verdad miden; una clave desconocida conserva la etiqueta de la config', () => {
    expect(honestIndicatorLabel('frequency', 'Frecuencia (compras 90d)')).toBe('Facturas (12 m)');
    expect(honestIndicatorLabel('ltv', 'LTV total')).toBe('Ingresos (12 m)');
    expect(honestIndicatorLabel('recency', 'Recencia (días sin comprar)')).toBe('Días desde la última factura');
    expect(honestIndicatorLabel('avg_ticket', 'Ticket promedio')).toBe('Ticket promedio (12 m)');
    expect(honestIndicatorLabel('nps', 'NPS')).toBe('NPS');
    const r = composeHealthResult(RPC_ROW, parseHealthConfig(REAL_CONFIG), 'C');
    expect(r.indicators.map((i) => i.label)).toEqual(['Días desde la última factura', 'Facturas (12 m)', 'Ingresos (12 m)', 'Ticket promedio (12 m)']);
    expect(r).toMatchObject({ score: 22, band: 'red' });
  });

  function wonDb(currency: string | null, base?: string): FakeDb {
    return makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'Estándar', steps: [{ day: 0, owner: 'vendor', title: 'Kickoff' }], default_duration_days: 30, is_active: true }],
      pipelines: [{ id: 'pl-onb', organization_id: ORG, pipeline_type: 'onboarding' }],
      stages: [{ id: 'st-1', pipeline_id: 'pl-onb', position: 1, is_won: false }, { id: 'st-won', pipeline_id: 'pl-onb', position: 2, is_won: true }],
      opportunities: [{ id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', salesperson_id: 's1', currency, parent_opportunity_id: null }],
      organization_currencies: base ? [{ organization_id: ORG, currency_code: base, is_base: true }] : [],
      customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' }],
      onboarding_instances: [], onboarding_steps: [],
    });
  }
  test('la hija de onboarding lleva la moneda del padre (USD); sin moneda en el padre, la base de la organización; sin ninguna, no se cablea COP', async () => {
    const usd = wonDb('USD', 'COP'); // la base de la org NO gana al padre
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(usd), { now: NOW });
    expect(writesTo(usd, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ currency: 'USD', metadata: { type: 'onboarding' } });
    const base = wonDb(null, 'mxn');
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(base), { now: NOW });
    expect(writesTo(base, 'opportunities', 'insert')[0].rows[0].currency).toBe('MXN');
    const none = wonDb(null);
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(none), { now: NOW });
    expect('currency' in writesTo(none, 'opportunities', 'insert')[0].rows[0]).toBe(false);
  });

  test('completar: si mover la oportunidad falla, la instancia vuelve a active y se lanza (no queda completed en silencio)', async () => {
    const db = wonDb('USD');
    const client = sb(db);
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    for (const s of db.rows.onboarding_steps) s.is_completed = true;
    db.nextWriteError = { table: 'opportunities', error: { code: '57014', message: 'timeout' } };
    await expect(completeOnboardingInstance(r.instance_id, ORG, client, { now: NOW })).rejects.toThrow(/mover la oportunidad.*timeout/);
    const inst = db.rows.onboarding_instances.find((i) => i.id === r.instance_id)!;
    expect(inst).toMatchObject({ status: 'active', completed_at: null });
    const reverts = writesTo(db, 'onboarding_instances', 'update');
    expect(reverts.at(-1)!.rows[0]).toEqual({ status: 'active', completed_at: null });
    expect(reverts.at(-1)!.filters).toMatchObject({ id: r.instance_id, organization_id: ORG });
  });
});

// ─── 6. Meses en la zona de la organización ─────────────────────────────────
describe('6. suma de meses en la zona de la organización', () => {
  test('31 ene 04:30Z (30 ene 23:30 Bogotá) + 1 mes → 28 feb 23:30 Bogotá (2026-03-01T04:30Z); en UTC → 28 feb 04:30Z', () => {
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'America/Bogota').toISOString()).toBe('2026-03-01T04:30:00.000Z');
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'UTC').toISOString()).toBe('2026-02-28T04:30:00.000Z');
    const p = buildRenewalPlan({ closedAt: '2026-01-31T04:30:00Z', billingCycleMonths: 1, now: new Date('2026-01-01T00:00:00Z'), timezone: 'America/Bogota' });
    expect(p.expiryPlainDate).toBe('2026-02-28');
  });
  test('conserva hora, minutos, segundos y milisegundos locales; año bisiesto y +13 meses', () => {
    expect(computeExpiryDate(new Date('2027-01-31T04:59:59.250Z'), 1, 'America/Bogota').toISOString()).toBe('2027-03-01T04:59:59.250Z'); // 28 feb 2027 23:59:59.250 Bogotá
    expect(computeExpiryDate(new Date('2024-01-31T12:00:00Z'), 1, 'America/Bogota').toISOString()).toBe('2024-02-29T12:00:00.000Z');
    expect(computeExpiryDate(new Date('2026-01-31T12:00:00Z'), 13, 'UTC').toISOString()).toBe('2027-02-28T12:00:00.000Z');
  });
  test('Nueva York con cambio de horario: 15 feb 15:00 local + 1 mes = 15 mar 15:00 local (offset −4 en vez de −5)', () => {
    expect(computeExpiryDate(new Date('2026-02-15T20:00:00Z'), 1, 'America/New_York').toISOString()).toBe('2026-03-15T19:00:00.000Z');
  });
});

// ─── 7. 23505 = already_existed ─────────────────────────────────────────────
describe('7. 23505 de los índices únicos = already_existed', () => {
  test('scheduleRenewal: el doble rechaza el segundo insert (23505) y la llamada devuelve already_existed sin tareas', async () => {
    const db = makeDb({
      pipelines: [{ id: 'pl-ren', organization_id: ORG, pipeline_type: 'renewal' }],
      stages: [{ id: 'st-1', pipeline_id: 'pl-ren', position: 1 }],
      opportunities: [{ id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1200, currency: 'USD', salesperson_id: 's1', billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null }],
      tasks: [], customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'A' }], sequences: [],
    });
    const client = sb(db);
    const [a, b] = await Promise.all([scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW }), scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW })]);
    expect(db.rejected.map((r) => r.index)).toEqual(['uq_opportunities_one_renewal_per_parent']);
    expect([a.already_existed, b.already_existed].sort()).toEqual([false, true]);
    expect(a.renewal_opportunity_id).toBe(b.renewal_opportunity_id);
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(1);
  });

  test('startOnboardingForWonOpportunity concurrente: una hija, una instancia, un juego de pasos', async () => {
    const db = makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'E', steps: [{ day: 0, owner: 'vendor', title: 'K' }, { day: 2, owner: 'cs', title: 'C' }], default_duration_days: 30, is_active: true }],
      pipelines: [{ id: 'pl-onb', organization_id: ORG, pipeline_type: 'onboarding' }],
      stages: [{ id: 'st-1', pipeline_id: 'pl-onb', position: 1, is_won: false }],
      opportunities: [{ id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', salesperson_id: 's1', currency: 'COP', parent_opportunity_id: null }],
      customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'A' }], onboarding_instances: [], onboarding_steps: [],
    });
    const client = sb(db);
    const [a, b] = await Promise.all([startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW }), startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW })]);
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
    expect(a.onboarding_opportunity_id).toBe(b.onboarding_opportunity_id);
    expect(a.instance_id).toBe(b.instance_id);
    expect([a.already_existed, b.already_existed].sort()).toEqual([false, true]);
    expect(db.rejected.length).toBeGreaterThanOrEqual(1);
  });

  test('createOnboardingInstance: 23505 en la instancia → devuelve la existente con already_existed (y sus pasos), sin crear pasos', async () => {
    const db = makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'E', steps: [{ day: 0, owner: 'vendor', title: 'K' }], default_duration_days: 30, is_active: true }],
      opportunities: [{ id: 'onb-a', organization_id: ORG, customer_id: 'cust-a', parent_opportunity_id: 'won-a' }],
      onboarding_instances: [], onboarding_steps: [],
    });
    const client = sb(db);
    const [a, b] = await Promise.all([createOnboardingInstance(ORG, 'onb-a', 'tpl', client, { now: NOW }), createOnboardingInstance(ORG, 'onb-a', 'tpl', client, { now: NOW })]);
    expect(a!.id).toBe(b!.id);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
    expect([a!.already_existed, b!.already_existed].sort()).toEqual([false, true]);
  });

  test('createOnboardingInstance: otro error de insert (23502) NO se trata como already_existed', async () => {
    const db = makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'E', steps: [{ day: 0, owner: 'vendor', title: 'K' }], default_duration_days: 30, is_active: true }],
      opportunities: [{ id: 'onb-a', organization_id: ORG, customer_id: 'cust-a', parent_opportunity_id: 'won-a' }],
      onboarding_instances: [], onboarding_steps: [],
    });
    db.nextWriteError = { table: 'onboarding_instances', error: { code: '23502', message: 'null value in column' } };
    await expect(createOnboardingInstance(ORG, 'onb-a', 'tpl', sb(db), { now: NOW })).rejects.toThrow(/null value/);
  });

  test('otro error de insert (no 23505) sigue lanzando', async () => {
    const db = makeDb({
      pipelines: [{ id: 'pl-ren', organization_id: ORG, pipeline_type: 'renewal' }], stages: [{ id: 'st-1', pipeline_id: 'pl-ren', position: 1 }],
      opportunities: [{ id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1, currency: 'USD', billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null }],
      customers: [], tasks: [], sequences: [],
    });
    db.nextWriteError = { table: 'opportunities', error: { code: '23502', message: 'null value' } };
    await expect(scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW })).rejects.toThrow(/null value/);
  });
});
