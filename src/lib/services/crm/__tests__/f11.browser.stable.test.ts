/// <reference types="jest" />
/**
 * F11 — casos únicos consolidados de las rondas (2026-09-21): la fachada de
 * navegador `healthScoreService` (la UI: lista, detalle, «Recalcular», «Medir
 * ahora», facturas de un lead). Lee con el cliente de navegador el score de la
 * CONFIG (nunca el crudo de la RPC) y para escribir va por fetch a las rutas
 * con sesión: nunca toca Supabase desde el cliente. Vienen de
 * `f11Round1TesterBrowser` (tester r1) y `f11Round2` (constructor r2 §1).
 */
import { createFakeSupabase, makeDb, type FakeDb } from './f11FakeSupabase';

const ORG = 120;
const DECOY = ORG + 1;
let browserDb: FakeDb = makeDb();

jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/supabase/config', () => ({ get supabase() { return createFakeSupabase(browserDb); } }));

import { healthScoreService } from '../healthScoreService';

const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
// Fila real de fn_customer_health: RPC 58/at_risk → config 22/red
const RPC_ROW = { customer_id: 'c-1', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: null, score: 58, band: 'at_risk' };
const NOW = new Date('2026-09-15T08:30:00Z');

beforeEach(() => {
  browserDb = makeDb({
    health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
    customers: [{ id: 'c-1', organization_id: ORG, full_name: 'Cliente 1', lifecycle_stage: 'customer', health_score: null }],
    health_score_snapshots: [{ id: 's0', organization_id: ORG, customer_id: 'c-1', score: 22, band: 'red', created_at: new Date(NOW.getTime() - 3600e3).toISOString() }],
  }, { fn_customer_health: () => [RPC_ROW] });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('tester r1 B1: la lista (getAllHealthScores) y el detalle (getCustomerHealthScore) muestran el score de la CONFIG: 22/red, no el 58 crudo', async () => {
  const all = await healthScoreService.getAllHealthScores();
  expect(all.map((s) => [s.customer_id, s.score, s.band])).toEqual([['c-1', 22, 'red']]);
  const one = await healthScoreService.getCustomerHealthScore('c-1');
  expect(one).toMatchObject({ score: 22, band: 'red' });
  expect(browserDb.writes).toEqual([]);
});

test('r2 1.5 / tester r1 B3+B5: «Recalcular» y «Medir ahora» van por fetch (POST) a las rutas con sesión y devuelven su data; cero llamadas y cero RPC a Supabase desde el navegador', async () => {
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
  expect(browserDb.writes).toEqual([]);
});

test('r2 1.6: countInvoices (ficha de un lead con facturas) cuenta invoice_sales de la org y del cliente, sin las anuladas ni las del señuelo', async () => {
  browserDb = makeDb({ invoice_sales: [
    { id: 'i1', organization_id: ORG, customer_id: 'lead-1', status: 'paid' }, { id: 'i2', organization_id: ORG, customer_id: 'lead-1', status: 'void' },
    { id: 'i3', organization_id: DECOY, customer_id: 'lead-1', status: 'paid' },
  ] });
  expect(await healthScoreService.countInvoices('lead-1', ORG)).toBe(1);
});
