/// <reference types="jest" />
/**
 * F11 — tareas programadas en proceso `health_recalculate` y `renewals_sync`:
 * iteran las organizaciones con CRM activo (organization_modules), respetan
 * `health_score_configs.is_active` / `refresh_interval_hours`, escriben
 * snapshots solo si cambió el score o venció el intervalo, y una org que falla
 * no tumba a las demás. Nada se encola en `outbound_jobs`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr-1', created: true, reason: null, steps: 1, first_run_at: null, status: 'active' })) }));

import { enrollInSequence } from '@/lib/services/crm/sequenceService';

import { runHealthRecalculate } from '../scheduled/healthRecalculate';
import { runRenewalsSync } from '../scheduled/renewalsSync';
import type { JobLogger } from '../types';

const NOW = new Date('2026-09-15T08:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const REAL_CONFIG = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia', weight: 50, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia', weight: 50, direction: 'higher_better', thresholds: [{ min: 5, score: 100 }, { min: 1, score: 50 }, { min: 0, score: 0 }] },
  ],
};

const rpcRow = (customer_id: string, extra: Partial<Row> = {}) => ({
  customer_id, invoices_12m: 6, revenue_12m: 100, days_since_last_invoice: 3, days_since_last_activity: 1, overdue_balance: 0, overdue_ratio: 0, score: 55, band: 'yellow', ...extra,
});

function fixtures(): FakeDb {
  const db = makeDb({
    organization_modules: [
      { organization_id: 120, module_code: 'crm', is_active: true },
      { organization_id: 130, module_code: 'crm', is_active: true },
      { organization_id: 140, module_code: 'crm', is_active: true },
      { organization_id: 121, module_code: 'crm', is_active: false },
      { organization_id: 150, module_code: 'pos', is_active: true },
    ],
    health_score_configs: [
      { organization_id: 120, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true },
      { organization_id: 130, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: false },
      { organization_id: 121, config: REAL_CONFIG, refresh_interval_hours: 1, is_active: true },
    ],
    health_score_snapshots: [
      // c1: mismo score (100) hace 2 h → no se reescribe
      { id: 's1', organization_id: 120, customer_id: 'c1', score: 100, band: 'green', created_at: '2026-09-15T06:30:00Z' },
      // c2: score distinto → se escribe
      { id: 's2', organization_id: 120, customer_id: 'c2', score: 40, band: 'yellow', created_at: '2026-09-15T06:30:00Z' },
      // c3: mismo score pero hace 25 h → se escribe (intervalo vencido)
      { id: 's3', organization_id: 120, customer_id: 'c3', score: 100, band: 'green', created_at: '2026-09-14T07:00:00Z' },
      { id: 's121', organization_id: 121, customer_id: 'c1', score: 1, band: 'red', created_at: '2026-09-15T08:00:00Z' },
    ],
    // r2: customers.health_score solo se escribe si cambió → c1 ya tiene 100 (no cambia), c2..c4 null
    customers: [
      { id: 'c1', organization_id: 120, lifecycle_stage: 'customer', health_score: 100 },
      { id: 'c2', organization_id: 120, lifecycle_stage: 'customer', health_score: null },
      { id: 'c3', organization_id: 120, lifecycle_stage: 'customer', health_score: 40 },
      { id: 'c4', organization_id: 120, lifecycle_stage: 'customer', health_score: null },
    ],
  });
  db.rpc = {
    fn_customer_health: (args) => {
      if (args.p_org_id === 120) return [rpcRow('c1'), rpcRow('c2'), rpcRow('c3'), rpcRow('c4')];
      if (args.p_org_id === 130) return [rpcRow('x1')];
      if (args.p_org_id === 140) throw new Error('statement timeout');
      return [];
    },
  };
  return db;
}

const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('runHealthRecalculate', () => {
  it('orgs desde organization_modules; config inactiva se omite; snapshot solo si cambió o venció; una org que falla no tumba a las demás', async () => {
    const db = fixtures();
    const out = await runHealthRecalculate(sb(db), NOW, log);
    expect(out.orgs).toBe(3); // 120, 130, 140 — nunca 121 (inactiva) ni 150 (pos)
    const o120 = out.by_org.find((o) => o.org_id === 120)!;
    // config: recency 3d→100, frequency 6→100 ⇒ score 100/green
    expect(o120).toMatchObject({ customers: 4, snapshots_written: 3, skipped_unchanged: 1, error: null });
    const o130 = out.by_org.find((o) => o.org_id === 130)!;
    expect(o130).toMatchObject({ customers: 0, snapshots_written: 0, reason: 'config_inactive' });
    const o140 = out.by_org.find((o) => o.org_id === 140)!;
    expect(o140.error).toMatch(/statement timeout/);
    expect(out.errors).toBe(1);

    const ins = writesTo(db, 'health_score_snapshots', 'insert');
    const rows = ins.flatMap((w) => w.rows);
    expect(rows.map((r) => r.customer_id).sort()).toEqual(['c2', 'c3', 'c4']);
    for (const r of rows) expect(r).toMatchObject({ organization_id: 120, score: 100, band: 'green' });
    expect((rows[0].indicators as Record<string, unknown>)).toMatchObject({ invoices_12m: 6, days_since_last_invoice: 3 });
    // r2: customers.health_score se actualiza SOLO para los que cambian y por LOTES (una sentencia por score distinto), filtrado por org
    const cu = writesTo(db, 'customers', 'update');
    expect(cu).toHaveLength(1);
    expect(cu[0].filters).toMatchObject({ organization_id: 120, id__in: ['c2', 'c3', 'c4'] });
    expect(cu[0].rows[0]).toMatchObject({ health_score: 100 });
    expect(o120).toMatchObject({ customers_updated: 3, update_statements: 1 });
    // cero encolados
    expect(writesTo(db, 'outbound_jobs')).toHaveLength(0);
    expect(db.rpcCalls.filter((c) => c.fn === 'fn_enqueue_job')).toHaveLength(0);
    // la RPC se llamó con p_customer_id null (modo lote) y nunca para 121
    expect(db.rpcCalls.map((c) => c.args.p_org_id).sort()).toEqual([120, 140]); // 130: config inactiva, ni se llama a la RPC
    expect(db.rpcCalls.every((c) => c.args.p_customer_id === null)).toBe(true);
    expect(db.rpcCalls.some((c) => c.args.p_org_id === 121)).toBe(false);
  });

  it('sin fila de config usa el score de la RPC y el intervalo por defecto (24 h)', async () => {
    const db = fixtures();
    db.rows.health_score_configs = [];
    db.rows.health_score_snapshots = [{ id: 's', organization_id: 120, customer_id: 'c1', score: 55, band: 'yellow', created_at: '2026-09-15T00:00:00Z' }];
    const out = await runHealthRecalculate(sb(db), NOW, log);
    const o120 = out.by_org.find((o) => o.org_id === 120)!;
    expect(o120).toMatchObject({ snapshots_written: 3, skipped_unchanged: 1 });
    const rows = writesTo(db, 'health_score_snapshots', 'insert').flatMap((w) => w.rows);
    for (const r of rows) expect(r).toMatchObject({ score: 55, band: 'yellow' });
  });

  it('error al listar organizaciones → resultado con error y 0 orgs, sin lanzar', async () => {
    const db = fixtures();
    db.nextReadError = { table: 'organization_modules', error: { code: '57014', message: 'timeout orgs' } };
    const out = await runHealthRecalculate(sb(db), NOW, log);
    expect(out).toMatchObject({ orgs: 0, error: 'timeout orgs' });
  });

  it('respeta la señal de aborto entre organizaciones', async () => {
    const db = fixtures();
    const ac = new AbortController();
    ac.abort();
    const out = await runHealthRecalculate(sb(db), NOW, log, ac.signal);
    expect(out.processed).toBe(0);
    expect(out.aborted).toBe(true);
  });
});

describe('runRenewalsSync', () => {
  it('itera las orgs con CRM activo, usa la zona horaria de cada organización y agrega conteos/errores por org', async () => {
    const db = fixtures();
    db.rows.organizations = [
      { id: 120, timezone: 'America/Bogota' },
      { id: 130, timezone: 'basura' },
      { id: 140, timezone: null },
    ];
    db.rows.pipelines = [{ id: 'pl-120', organization_id: 120, pipeline_type: 'renewal' }];
    db.rows.stages = [{ id: 'st-120', pipeline_id: 'pl-120', position: 1 }];
    db.rows.customers = [{ id: 'cu', organization_id: 120, full_name: 'Cliente' }];
    db.rows.opportunities = [
      { id: 'won-120', organization_id: 120, status: 'won', customer_id: 'cu', amount: 10, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T03:00:00Z' },
      { id: 'won-130', organization_id: 130, status: 'won', customer_id: 'cu', amount: 10, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: null },
      { id: 'won-121', organization_id: 121, status: 'won', customer_id: 'cu', amount: 10, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T03:00:00Z' },
    ];
    db.rows.sequences = [];
    db.rows.tasks = [];
    const out = await runRenewalsSync(sb(db), NOW, log);
    expect(out.orgs).toBe(3);
    expect(out.created).toBe(1);
    expect(out.errors).toBe(1);
    const o130 = out.by_org.find((o) => o.org_id === 130)!;
    expect(o130.errors[0]).toMatch(/won-130.*closed_at/);
    const created = writesTo(db, 'opportunities', 'insert');
    expect(created).toHaveLength(1);
    // 2027-09-01T03:00Z en Bogotá es el 31 de agosto: la fecha calendario sale de la zona de la org
    expect(created[0].rows[0]).toMatchObject({ organization_id: 120, parent_opportunity_id: 'won-120', expected_close_date: '2027-08-31' });
    expect(out.by_org.map((o) => o.timezone)).toEqual(['America/Bogota', 'America/Bogota', 'America/Bogota']);
    expect(db.rows.opportunities.filter((o) => o.organization_id === 121)).toHaveLength(1);
    expect(writesTo(db, 'outbound_jobs')).toHaveLength(0);
  });

  it('error al listar organizaciones → error en el resultado, 0 orgs', async () => {
    const db = fixtures();
    db.nextReadError = { table: 'organization_modules', error: { code: '57014', message: 'timeout orgs' } };
    const out = await runRenewalsSync(sb(db), NOW, log);
    expect(out).toMatchObject({ orgs: 0, error: 'timeout orgs' });
  });

  // Ronda 2 D1/D2 (H1): la inscripción en la secuencia se inyecta desde el servidor (`enroll: enrollInSequence`);
  // una renovación creada desde el modal (sin inscripción) queda inscrita en la siguiente pasada del cron.
  it('inyecta enrollInSequence: una renovación existente sin inscripción se inscribe (org, secuencia, oportunidad, source=renewal) y se cuenta en enrolled', async () => {
    const db = fixtures();
    db.rows.organizations = [{ id: 120, timezone: 'America/Bogota' }, { id: 130, timezone: null }, { id: 140, timezone: null }];
    db.rows.pipelines = [{ id: 'pl-120', organization_id: 120, pipeline_type: 'renewal' }];
    db.rows.stages = [{ id: 'st-120', pipeline_id: 'pl-120', position: 1 }];
    db.rows.customers = [{ id: 'cu', organization_id: 120, full_name: 'Cliente' }];
    db.rows.opportunities = [
      { id: 'won-120', organization_id: 120, status: 'won', customer_id: 'cu', amount: 10, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T03:00:00Z' },
      { id: 'ren-120', organization_id: 120, status: 'open', customer_id: 'cu', deal_type: 'renewal', parent_opportunity_id: 'won-120', pipeline_id: 'pl-120', stage_id: 'st-120', next_contact_at: null },
    ];
    db.rows.sequences = [{ id: 'seq-120', organization_id: 120, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null }];
    db.rows.sequence_enrollments = [];
    db.rows.tasks = [];
    const out = await runRenewalsSync(sb(db), NOW, log);
    expect(out.created).toBe(0);
    expect(enrollInSequence).toHaveBeenCalledTimes(1);
    const call = (enrollInSequence as jest.Mock).mock.calls[0] as unknown[];
    expect(call.slice(0, 3)).toEqual([120, 'seq-120', 'ren-120']);
    expect(call[4]).toMatchObject({ customerId: 'cu', source: 'renewal' });
    expect(out.by_org.find((o) => o.org_id === 120)).toMatchObject({ enrolled: 1, errors: [] });
    // una org que falla entera sigue devolviendo la forma completa del resultado (con enrolled)
    expect(out.by_org.find((o) => o.org_id === 130)).toMatchObject({ scanned: 0, created: 0, updated: 0, skipped: 0, enrolled: 0 });
  });
});
