/// <reference types="jest" />
/**
 * F11 — casos únicos consolidados de las rondas (2026-09-21): las rutas con
 * sesión de salud («Recalcular» = POST /health/refresh, «Medir ahora» =
 * POST /health/[id]/snapshot) escriben exactamente lo mismo que el cron, y la
 * regla 5 (organization_id ajeno en el body → 403 + registro, sin escrituras ni
 * RPC) en las 5 rutas de escritura de F11. Vienen de `f11Round2` (constructor
 * r2 §1/§3) y `f11Round2Tester` (tester r2 §1/§3).
 */
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 113 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));
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
import { POST as postInstances } from '@/app/api/crm/onboarding/instances/route';
import { PATCH as patchInstance } from '@/app/api/crm/onboarding/instances/[id]/route';
import { PATCH as patchStep } from '@/app/api/crm/onboarding/instances/[id]/steps/[stepId]/route';
import type { HealthRpcRow } from '../healthBands';

const ORG = 113;
const DECOY = ORG + 1;
const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`http://localhost:3000${url}`, { method: init.method ?? 'POST', headers: { 'content-type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
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
/** Filas REALES de fn_customer_health (ids recortados) → 22/28/10/42/40. */
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
    // snapshot real (60, 2026-09-01) para uno de ellos: cambia a 40 → se escribe
    health_score_snapshots: [{ id: 's-real', organization_id: ORG, customer_id: '89e5bc62', score: 60, band: 'yellow', created_at: '2026-09-01T22:23:33.825613+00:00' }],
  }, { fn_customer_health: (a) => (a.p_customer_id ? REAL_ROWS.filter((r) => r.customer_id === a.p_customer_id) : REAL_ROWS) });
}

beforeEach(() => {
  jest.clearAllMocks();
  ctxState.orgId = ORG;
  ctxState.userId = 'user-session';
  ctxState.db = healthDb();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('un solo score: «Recalcular» y «Medir ahora» escriben lo mismo que el cron (tester r2 1.3/1.4, r2 1.1/1.2)', () => {
  test('tester r2 1.3 / r2 1.1: POST /health/refresh con sesión → 200 con {org_id, customers, customers_updated, snapshots_written}; escribe 22/28/10/42/40; la segunda pasada inmediata no escribe nada', async () => {
    const res = await postRefresh(req('/api/crm/health/refresh', { body: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ org_id: ORG, customers: 5, customers_updated: 5, snapshots_written: 5 });
    const snaps = writesTo(ctxState.db!, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    expect(Object.fromEntries(snaps.map((s) => [s.customer_id, s.score]))).toEqual(EXPECTED);
    const cust = Object.fromEntries((ctxState.db!.rows.customers as Row[]).map((c) => [c.id, c.health_score]));
    expect(cust).toEqual(EXPECTED);
    const before = ctxState.db!.writes.length;
    await postRefresh(req('/api/crm/health/refresh', { body: {} }));
    expect(ctxState.db!.writes.length).toBe(before);
  });
  test('r2 1.2: POST /health/refresh sin sesión → 401', async () => {
    ctxState.db = null;
    expect((await postRefresh(req('/api/crm/health/refresh', { body: {} }))).status).toBe(401);
  });
  test('tester r2 1.4: POST /health/[id]/snapshot da 22 para 0bd2a6bc (snapshot y cliente escritos); la segunda vez snapshot_written=false y customer_updated=false; 60 → 40 se escribe; cliente ajeno → 404 sin escrituras', async () => {
    const r1 = await postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: {} }), params({ customerId: '0bd2a6bc' }));
    expect(r1.status).toBe(200);
    expect((await r1.json()).data).toMatchObject({ score: 22, band: 'red', snapshot_written: true, customer_updated: true });
    expect(writesTo(ctxState.db!, 'health_score_snapshots', 'insert')[0].rows[0]).toMatchObject({ organization_id: ORG, customer_id: '0bd2a6bc', score: 22, band: 'red' });
    const r2 = await postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: {} }), params({ customerId: '0bd2a6bc' }));
    expect((await r2.json()).data).toMatchObject({ score: 22, snapshot_written: false, customer_updated: false });
    const r3 = await postSnapshot(req('/api/crm/health/89e5bc62/snapshot', { body: {} }), params({ customerId: '89e5bc62' }));
    expect((await r3.json()).data).toMatchObject({ score: 40, band: 'yellow', snapshot_written: true });
    const n = ctxState.db!.writes.length;
    const r4 = await postSnapshot(req('/api/crm/health/nope/snapshot', { body: {} }), params({ customerId: 'nope' }));
    expect(r4.status).toBe(404);
    expect(ctxState.db!.writes.length).toBe(n);
  });
});

describe('regla 5: organization_id ajeno en el body → 403 + registro, sin escrituras ni RPC (tester r2 §3, r2 §3)', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['POST /onboarding/instances', () => postInstances(req('/api/crm/onboarding/instances', { body: { opportunity_id: 'x', organization_id: DECOY } }))],
    ['PATCH /onboarding/instances/[id]', () => patchInstance(req('/api/crm/onboarding/instances/i', { method: 'PATCH', body: { status: 'completed', organization_id: DECOY } }), params({ id: 'i' }))],
    ['PATCH /onboarding/instances/[id]/steps/[stepId]', () => patchStep(req('/api/crm/onboarding/instances/i/steps/s', { method: 'PATCH', body: { is_completed: true, organization_id: String(DECOY) } }), params({ id: 'i', stepId: 's' }))],
    ['POST /health/refresh', () => postRefresh(req('/api/crm/health/refresh', { body: { organization_id: DECOY } }))],
    ['POST /health/[id]/snapshot', () => postSnapshot(req('/api/crm/health/0bd2a6bc/snapshot', { body: { organization_id: DECOY } }), params({ customerId: '0bd2a6bc' }))],
  ];
  for (const [name, run] of cases) {
    test(`${name}: 403 «Organización no permitida», warn con la org de sesión y la ajena, 0 escrituras y 0 RPC`, async () => {
      const res = await run();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Organización no permitida/);
      expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: ORG, body: expect.anything() }));
      expect(ctxState.db!.writes).toEqual([]);
      expect(ctxState.db!.rpcCalls).toEqual([]);
    });
  }
  test('tester r2 3.2: la misma org (número o cadena) y la ausencia NO son ataque: /health/refresh sigue 200', async () => {
    expect((await postRefresh(req('/api/crm/health/refresh', { body: { organization_id: String(ORG) } }))).status).toBe(200);
    expect((await postRefresh(req('/api/crm/health/refresh', { body: { organization_id: ORG } }))).status).toBe(200);
    expect((await postRefresh(req('/api/crm/health/refresh'))).status).toBe(200);
  });
});
