/// <reference types="jest" />
/**
 * F11 — ronda 1, TESTER: la fachada de navegador `healthScoreService` que la UI
 * invoca («Recalcular» en SaludView, «Medir ahora» en HealthDetailDrawer).
 * En r1 escribían un score DISTINTO al de la lista y el cron (el crudo de la
 * RPC, o el de la vista materializada sin RLS). r2: los `test.failing` pasan
 * a verdes: ambas acciones van por rutas con sesión que delegan en
 * `recalculateOrgHealth` / `snapshotCustomerHealth` (config sobre la RPC +
 * `shouldWriteSnapshot`), y la fachada no toca Supabase para escribir.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

const ORG = 113;
let db: FakeDb;

jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 113 }));
jest.mock('@/lib/supabase/config', () => ({
  get supabase() { return createFakeSupabase(db); },
}));

import { healthScoreService } from '../healthScoreService';
import { snapshotCustomerHealth } from '../healthScoreServer';
import { recalculateOrgHealth } from '@/lib/jobs/scheduled/healthRecalculate';

const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
// Fila real de fn_customer_health(113): RPC 58/at_risk → config 22/red
const RPC_ROW = { customer_id: 'c-1', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: null, score: 58, band: 'at_risk' };
const NOW = new Date('2026-09-15T08:30:00Z');
const sb = (d: FakeDb) => createFakeSupabase(d) as unknown as SupabaseClient;

beforeEach(() => {
  db = makeDb({
    health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
    customers: [{ id: 'c-1', organization_id: ORG, full_name: 'Cliente 1', lifecycle_stage: 'customer', health_score: null }],
    health_score_snapshots: [{ id: 's0', organization_id: ORG, customer_id: 'c-1', score: 22, band: 'red', created_at: new Date(NOW.getTime() - 3600e3).toISOString() }],
  }, { fn_customer_health: () => [RPC_ROW] });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('la lista (getAllHealthScores) y el detalle (getCustomerHealthScore) muestran el score de la CONFIG: 22/red', async () => {
  const all = await healthScoreService.getAllHealthScores();
  expect(all.map((s) => [s.customer_id, s.score, s.band])).toEqual([['c-1', 22, 'red']]);
  const one = await healthScoreService.getCustomerHealthScore('c-1');
  expect(one).toMatchObject({ score: 22, band: 'red' });
});

test('r2: «Recalcular» (recalculateOrgHealth, la pasada de POST /health/refresh) escribe 22 en customers.health_score y NO añade un snapshot si el último ya tiene 22', async () => {
  await recalculateOrgHealth(ORG, sb(db), NOW);
  const cu = writesTo(db, 'customers', 'update');
  expect(cu[0]?.rows[0]).toMatchObject({ health_score: 22 });
  expect(writesTo(db, 'health_score_snapshots', 'insert')).toHaveLength(0);
});

test('r2: la fachada «Recalcular» no escribe desde el navegador: llama a POST /api/crm/health/refresh', async () => {
  const fetchMock = jest.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ success: true, data: { customers: 1, customers_updated: 1, snapshots_written: 0 } }) }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  await healthScoreService.refreshAllHealthScores();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/crm/health/refresh');
  expect(db.writes).toEqual([]);
  expect(db.rpcCalls).toEqual([]);
});

test('r2: «Medir ahora» (snapshotCustomerHealth, la pasada de POST /health/[id]/snapshot) calcula 22 con la RPC + config; el punto de tendencia solo si cambió o venció', async () => {
  const snap = await snapshotCustomerHealth(ORG, 'c-1', sb(db), NOW);
  expect(snap).toMatchObject({ score: 22, band: 'red', snapshot_written: false, customer_updated: true });
  expect(writesTo(db, 'health_score_snapshots', 'insert')).toHaveLength(0);
  db.rows.health_score_snapshots[0].score = 58; // el último punto es el viejo score crudo → ahora sí se escribe 22
  const again = await snapshotCustomerHealth(ORG, 'c-1', sb(db), NOW);
  expect(again).toMatchObject({ score: 22, snapshot_written: true });
  expect(writesTo(db, 'health_score_snapshots', 'insert')[0].rows[0]).toMatchObject({ organization_id: ORG, customer_id: 'c-1', score: 22 });
});

test('r2: la fachada «Medir ahora» va por fetch a POST /api/crm/health/c-1/snapshot y no lee ninguna vista desde el navegador', async () => {
  const fetchMock = jest.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ success: true, data: { score: 22, snapshot_written: true } }) }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  const r = await healthScoreService.snapshotHealthScore('c-1');
  expect(r).toMatchObject({ score: 22 });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/crm/health/c-1/snapshot');
  expect(db.calls).toBe(0);
});
