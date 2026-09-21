/// <reference types="jest" />
/**
 * F11 — deuda viva documentada (consolidado 2026-09-21 desde `f11Round2Tester`,
 * tester r2 §2, caso «DEUDA (baja)»).
 *
 * La rotación del cron de salud se apoya en el último snapshot por org: una org
 * procesada SIN clientes no deja huella y vuelve a ir primero al día siguiente.
 * Con presupuesto corto, las orgs con clientes se quedan pendientes dos días
 * seguidos. El test afirma el comportamiento ACTUAL (pasa en verde) para que la
 * deuda sea visible: cuando se pague (p. ej. registrando la última pasada por
 * org aunque no escriba snapshots), este test se pondrá rojo y hay que
 * invertir las dos aserciones finales.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));

import { runHealthRecalculate } from '@/lib/jobs/scheduled/healthRecalculate';
import type { HealthRpcRow } from '../healthBands';
import type { JobLogger } from '@/lib/jobs/types';

const NOW = new Date('2026-09-15T13:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
/** Distribución real: 196, 9, 8, 3, 2, 1 clientes y 43 orgs con 0, que van PRIMERO en el listado. */
const SIZES: Record<number, number> = { 113: 196, 134: 9, 130: 8, 2: 3, 112: 2, 125: 1 };
const ORG_IDS = [...Array.from({ length: 43 }, (_, i) => 300 + i), 113, 134, 130, 2, 112, 125];
function realDb(): FakeDb {
  const customers: Row[] = [];
  const rpc: Record<number, HealthRpcRow[]> = {};
  for (const id of ORG_IDS) {
    rpc[id] = Array.from({ length: SIZES[id] ?? 0 }, (_, i) => ({ customer_id: `c-${id}-${i}`, invoices_12m: 1 + (i % 4), revenue_12m: 30000 + (i % 7) * 20000, days_since_last_invoice: 10 + (i % 5) * 20, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 55, band: 'at_risk' }));
    for (const r of rpc[id]) customers.push({ id: r.customer_id, organization_id: id, lifecycle_stage: 'customer', health_score: null });
  }
  return makeDb({
    organization_modules: ORG_IDS.map((id) => ({ organization_id: id, module_code: 'crm', is_active: true })),
    health_score_configs: ORG_IDS.map((id) => ({ organization_id: id, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true })),
    customers, health_score_snapshots: [],
  }, { fn_customer_health: (a) => rpc[a.p_org_id as number] ?? [] });
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('DEUDA (baja): con presupuesto corto solo caben orgs vacías el día 1; el día 2 vuelven a ir ellas primero (sin snapshot = «nunca procesada») y la org 113 sigue pendiente', async () => {
  const db = realDb();
  db.latencyMs = 70;
  const r1 = await runHealthRecalculate(sb(db), NOW, log, undefined, { budgetMs: 1_500, clock: () => db.virtualNowMs });
  const first = r1.by_org.map((o) => o.org_id);
  expect(r1.aborted).toBe(true);
  expect(first.every((id) => id >= 300)).toBe(true);
  const r2 = await runHealthRecalculate(sb(db), new Date(NOW.getTime() + 864e5), log, undefined, { budgetMs: 1_500, clock: () => db.virtualNowMs });
  // Rotación esperada cuando se pague la deuda: las pendientes de ayer primero. Real hoy: las mismas vacías.
  expect(r2.by_org.map((o) => o.org_id)).toEqual(first);
  expect(r2.pending_org_ids).toContain(113);
});
