/// <reference types="jest" />
/**
 * F11 — `healthScoreService`: el resultado que consume la UI (gauge, alertas,
 * tendencia) aplica las dimensiones de `health_score_configs.config` sobre
 * la fila real de `fn_customer_health` y siempre lleva banda + texto.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));

import { calculateHealthScore, composeHealthResult, getHealthTrend } from '../healthScoreServer';
import { parseHealthConfig, type HealthRpcRow } from '../healthBands';

const ORG = 120;
const DECOY = ORG + 1;
const ROW: HealthRpcRow = { customer_id: 'c1', invoices_12m: 6, revenue_12m: 600000, days_since_last_invoice: 20, days_since_last_activity: 45, overdue_balance: 50000, overdue_ratio: 0.3, score: 60, band: 'yellow' };
const CONFIG = parseHealthConfig({
  bands: { green: 70, yellow: 40, red: 0 },
  indicators: [
    { key: 'recency', label: 'Recencia', weight: 50, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 999, score: 10 }] },
    { key: 'receivables', label: 'Cartera', weight: 50, direction: 'lower_better', thresholds: [{ max: 0, score: 100 }, { max: 0.2, score: 50 }, { max: 1, score: 0 }] },
  ],
})!;

describe('composeHealthResult', () => {
  it('con config: score ponderado, banda de config, indicadores con valor y puntuación, alertas y raw', () => {
    const r = composeHealthResult(ROW, CONFIG, 'Cliente Uno');
    expect(r).toMatchObject({ customer_id: 'c1', customer_name: 'Cliente Uno', score: 35, band: 'red' }); // 70*0.5 + 0*0.5
    expect(r.indicators.map((i) => i.key)).toEqual(['recency', 'receivables']);
    expect(r.indicators[0]).toMatchObject({ value: 20, score: 70, weight: 50 });
    expect(r.alerts!.map((a) => a.code)).toEqual(['overdue', 'no_activity']);
    expect(r.raw).toEqual(ROW);
  });
  it('sin config (o sin indicadores): score y banda de la RPC, indicadores = campos reales', () => {
    const r = composeHealthResult(ROW, null, 'X');
    expect(r).toMatchObject({ score: 60, band: 'yellow' });
    expect(r.indicators.map((i) => i.key)).toEqual(['invoices_12m', 'revenue_12m', 'days_since_last_invoice', 'days_since_last_activity', 'overdue_balance', 'overdue_ratio']);
    expect(composeHealthResult({ ...ROW, band: 'healthy' }, { bands: CONFIG.bands, indicators: [] }, 'X').band).toBe('green');
  });
});

describe('calculateHealthScore (server)', () => {
  function fixtures(): FakeDb {
    const db = makeDb({
      health_score_configs: [
        { organization_id: ORG, config: { bands: CONFIG.bands, indicators: CONFIG.indicators }, refresh_interval_hours: 24, is_active: true },
        { organization_id: DECOY, config: { bands: { green: 1, yellow: 0, red: 0 }, indicators: [] }, refresh_interval_hours: 24, is_active: true },
      ],
      customers: [
        { id: 'c1', organization_id: ORG, full_name: 'Cliente Uno', health_score: null },
        { id: 'c1', organization_id: DECOY, full_name: 'Señuelo', health_score: null },
      ],
      health_score_snapshots: [
        { id: 's1', organization_id: ORG, customer_id: 'c1', score: 10, band: 'red', indicators: {}, created_at: '2026-08-01T00:00:00Z' },
        { id: 's2', organization_id: DECOY, customer_id: 'c1', score: 99, band: 'green', indicators: {}, created_at: '2026-08-02T00:00:00Z' },
        { id: 's3', organization_id: ORG, customer_id: 'c1', score: 35, band: 'red', indicators: {}, created_at: '2026-09-01T00:00:00Z' },
      ],
    });
    db.rpc = { fn_customer_health: (args) => (args.p_org_id === ORG ? [ROW] : []) };
    return db;
  }
  const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());

  it('aplica la config de la org, devuelve alertas y actualiza customers.health_score filtrando por organización', async () => {
    const db = fixtures();
    const r = await calculateHealthScore(ORG, 'c1', sb(db));
    expect(r).toMatchObject({ customer_id: 'c1', score: 35, band: 'red' });
    expect(r!.alerts.map((a) => a.code)).toEqual(['overdue', 'no_activity']);
    expect(r!.indicators).toMatchObject({ invoices_12m: 6, overdue_ratio: 0.3, days_since_last_activity: 45 });
    const upd = writesTo(db, 'customers', 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].filters).toMatchObject({ id: 'c1', organization_id: ORG });
    expect(upd[0].rows[0]).toMatchObject({ health_score: 35 });
    expect(db.rows.customers.find((c) => c.organization_id === DECOY)!.health_score).toBeNull();
    expect(db.rpcCalls[0].args).toEqual({ p_org_id: ORG, p_customer_id: 'c1' });
  });

  it('RPC vacía (cliente de otra org) → null y sin escrituras', async () => {
    const db = fixtures();
    expect(await calculateHealthScore(DECOY + 10, 'c1', sb(db))).toBeNull();
    expect(db.writes).toHaveLength(0);
  });

  it('getHealthTrend solo devuelve snapshots de la org, ascendentes por fecha', async () => {
    const db = fixtures();
    const t = await getHealthTrend(ORG, 'c1', sb(db), 12);
    expect(t.map((s) => s.id)).toEqual(['s1', 's3']);
  });
});
