/// <reference types="jest" />
/**
 * F11 — ronda 1, suite del TESTER. Casos que el constructor no cubre:
 * concurrencia de la idempotencia (sin índice único en BD), bordes de zona
 * horaria y medianoche, aborto del scheduler, tenencia con `org + 1`, umbrales
 * exclusivos/inclusivos, config real de una organización con clientes reales.
 * Los tres `test.failing` de r1 (concurrencia de renovación e instancia, meses
 * en UTC) pasaron a verdes en r2: deuda pagada (índices únicos + 23505 como
 * already_existed + meses en la zona de la organización).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({
  enrollInSequence: jest.fn(async (_org: number, sequenceId: string) => ({ id: `enr-${sequenceId}`, created: true })),
}));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => { throw new Error('enqueueJob no debe llamarse para tareas F11'); }) }));
jest.mock('@/lib/jobs/registry', () => ({ hasRealJobHandler: () => false }));
jest.mock('@/lib/jobs/handlers', () => ({}));
jest.mock('@/lib/jobs/runner', () => ({ makeJobLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/jobs/handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client in test'); } }));

import { enrollInSequence } from '@/lib/services/crm/sequenceService';
import { enqueueJob } from '@/lib/jobs/enqueue';
import {
  bandForScore, buildHealthAlerts, latestSnapshotByCustomer, parseHealthConfig, scoreFromConfig, scoreIndicator, shouldWriteSnapshot, type HealthRpcRow,
} from '../healthBands';
import { buildRenewalPlan, computeExpiryDate, nextContactFromTasks, pickRenewalSequence, RenewalPlanError } from '../renewalMilestones';
import { scheduleRenewal, syncRenewalsForOrg } from '../renewalService';
import { completeOnboardingInstance, getOnboardingInstance, OnboardingIncompleteError, startOnboardingForWonOpportunity, updateOnboardingStep } from '../onboardingService';
import { buildStepRows, parseTemplateSteps } from '../onboardingProgress';
import { recalculateOrgHealth, runHealthRecalculate } from '@/lib/jobs/scheduled/healthRecalculate';
import { runRenewalsSync } from '@/lib/jobs/scheduled/renewalsSync';
import { runScheduledKinds } from '@/lib/jobs/scheduler';
import { orgIdsWithModule, listCrmActiveOrgIds } from '@/lib/jobs/scheduledOrgs';
import type { JobLogger } from '@/lib/jobs/types';

const ORG = 120;
const DECOY = ORG + 1;
const NOW = new Date('2026-09-15T08:30:00Z');
const log: JobLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

/** Config REAL de `health_score_configs` (misma en las 54 filas; leída por MCP 2026-09-15). */
const REAL_CONFIG_113 = {
  bands: { red: 0, green: 70, yellow: 40 },
  indicators: [
    { key: 'recency', label: 'Recencia (días sin comprar)', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Frecuencia (compras 90d)', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'LTV total', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
/** Filas REALES de `fn_customer_health(113, NULL)` (ids recortados; org 113 = 196 clientes). */
const REAL_ROWS_113: HealthRpcRow[] = [
  { customer_id: '0bd2a6bc', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 58, band: 'at_risk' },
  { customer_id: '0cc1854f', invoices_12m: 1, revenue_12m: 71000, days_since_last_invoice: 70, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 59, band: 'at_risk' },
];
/** Fila REAL de org 2 (cartera vencida 97 %). */
const REAL_ROW_2: HealthRpcRow = { customer_id: '674c3eed', invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: 419, days_since_last_activity: null, overdue_balance: 1131000, overdue_ratio: 0.9746, score: 1, band: 'critical' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── 1. RPC vs scoreFromConfig con datos reales ─────────────────────────────
describe('health: RPC vs scoreFromConfig con la config y filas reales', () => {
  const config = parseHealthConfig(REAL_CONFIG_113)!;

  test('la config real manda: 58/at_risk de la RPC se convierte en 22/red (recencia 77 d → 10, 1 factura → 25, 49 000 → 20, ticket 49 000 → 40)', () => {
    const s = scoreFromConfig(config, REAL_ROWS_113[0])!;
    expect(s.indicators.map((i) => [i.key, i.value, i.score])).toEqual([
      ['recency', 77, 10], ['frequency', 1, 25], ['ltv', 49000, 20], ['avg_ticket', 49000, 40],
    ]);
    expect(Math.round((10 * 30 + 25 * 25 + 20 * 25 + 40 * 20) / 100)).toBe(22);
    expect(s).toMatchObject({ score: 22, band: 'red' });
  });

  test('org 2: cartera vencida 97 % NO entra en la config real (sin indicador de cartera) → 10/red pese a 1 131 000 vencidos', () => {
    const s = scoreFromConfig(config, REAL_ROW_2)!;
    expect(s.score).toBe(10);
    expect(s.indicators.find((i) => i.key === 'receivables' || i.key === 'overdue_ratio')).toBeUndefined();
    // La alerta sí lo cuenta: es la única vía por la que la cartera llega a la UI.
    expect(buildHealthAlerts(REAL_ROW_2)[0]).toMatchObject({ code: 'overdue', severity: 'red' });
  });

  test('la etiqueta real «Frecuencia (compras 90d)» se alimenta de invoices_12m y «LTV total» de revenue_12m (desajuste etiqueta/valor)', () => {
    const s = scoreFromConfig(config, { ...REAL_ROWS_113[0], invoices_12m: 7, revenue_12m: 123 })!;
    expect(s.indicators.find((i) => i.key === 'frequency')!.value).toBe(7);
    expect(s.indicators.find((i) => i.key === 'ltv')!.value).toBe(123);
  });

  test('recalculateOrgHealth escribe el score de la CONFIG (22), no el de la RPC (58), en snapshots y customers.health_score', async () => {
    const db = makeDb({
      health_score_configs: [{ organization_id: 113, config: REAL_CONFIG_113, refresh_interval_hours: 24, is_active: true }],
      health_score_snapshots: [], customers: [{ id: '0bd2a6bc', organization_id: 113 }],
    }, { fn_customer_health: () => [REAL_ROWS_113[0]] });
    const r = await recalculateOrgHealth(113, sb(db), NOW);
    expect(r).toMatchObject({ customers: 1, snapshots_written: 1, error: null });
    expect(writesTo(db, 'health_score_snapshots', 'insert')[0].rows[0]).toMatchObject({ organization_id: 113, score: 22, band: 'red' });
    const cu = writesTo(db, 'customers', 'update')[0];
    expect(cu.rows[0]).toMatchObject({ health_score: 22 });
    expect(cu.filters).toMatchObject({ id: '0bd2a6bc', organization_id: 113 });
  });
});

// ─── 2. shouldWriteSnapshot con los 9 snapshots reales ──────────────────────
describe('health: shouldWriteSnapshot / latestSnapshotByCustomer', () => {
  const real = { score: 60, created_at: '2026-09-01T22:23:31.704233+00:00' }; // fila real de org 134
  test('snapshot real (60, 1/9) + score de config 37 → se escribe (cambió)', () => {
    expect(shouldWriteSnapshot({ last: real, score: 37, now: NOW, refreshIntervalHours: 24 })).toBe(true);
  });
  test('mismo score, 23 h 59 min → no; 24 h exactas → sí; intervalo null/0/-5 → 24 h', () => {
    const at = new Date('2026-09-14T08:30:00Z');
    const last = { score: 60, created_at: at.toISOString() };
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 24 * 3600e3 - 60e3), refreshIntervalHours: 24 })).toBe(false);
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 24 * 3600e3), refreshIntervalHours: 24 })).toBe(true);
    for (const h of [null, undefined, 0, -5]) {
      expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 23 * 3600e3), refreshIntervalHours: h })).toBe(false);
      expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 25 * 3600e3), refreshIntervalHours: h })).toBe(true);
    }
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 2 * 3600e3), refreshIntervalHours: 1 })).toBe(true);
  });
  test('sin snapshot previo o created_at inválido → se escribe', () => {
    expect(shouldWriteSnapshot({ last: null, score: 1, now: NOW, refreshIntervalHours: 24 })).toBe(true);
    expect(shouldWriteSnapshot({ last: { score: 1, created_at: 'ayer' }, score: 1, now: NOW, refreshIntervalHours: 24 })).toBe(true);
  });
  test('latestSnapshotByCustomer elige el más reciente aunque lleguen en orden ascendente', () => {
    const m = latestSnapshotByCustomer([
      { customer_id: 'a', created_at: '2026-09-01T00:00:00Z', score: 1 },
      { customer_id: 'a', created_at: '2026-09-10T00:00:00Z', score: 2 },
      { customer_id: 'a', created_at: '2026-09-05T00:00:00Z', score: 3 },
    ]);
    expect(m.get('a')!.score).toBe(2);
  });
});

// ─── 3. Umbrales, dirección y bandas ────────────────────────────────────────
describe('health: umbrales inclusivos, dirección, bandas y alertas', () => {
  const lower = { key: 'recency', label: 'r', weight: 1, direction: 'lower_better' as const, thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }] };
  const higher = { key: 'frequency', label: 'f', weight: 1, direction: 'higher_better' as const, thresholds: [{ min: 10, score: 100 }, { min: 1, score: 25 }] };
  test('lower_better: 7 → 100 (inclusivo), 8 → 70, 31 → peor (70), null/NaN → peor', () => {
    expect(scoreIndicator(lower, 7)).toBe(100);
    expect(scoreIndicator(lower, 8)).toBe(70);
    expect(scoreIndicator(lower, 31)).toBe(70);
    expect(scoreIndicator(lower, null)).toBe(70);
    expect(scoreIndicator(lower, Number.NaN)).toBe(70);
  });
  test('higher_better: 10 → 100 (inclusivo), 9 → 25, 0 → peor (25); la dirección invertida cambia el resultado', () => {
    expect(scoreIndicator(higher, 10)).toBe(100);
    expect(scoreIndicator(higher, 9)).toBe(25);
    expect(scoreIndicator(higher, 0)).toBe(25);
    expect(scoreIndicator({ ...higher, direction: 'lower_better' }, 10)).toBe(25); // sin max: todo es "peor"
  });
  test('bandas en el umbral exacto: 70 → green, 69 → yellow, 40 → yellow, 39 → red', () => {
    const b = { green: 70, yellow: 40, red: 0 };
    expect([70, 69, 40, 39].map((s) => bandForScore(s, b))).toEqual(['green', 'yellow', 'yellow', 'red']);
  });
  test('parseHealthConfig descarta indicadores con peso ≤ 0, sin dirección o sin umbrales; sin indicadores → scoreFromConfig null', () => {
    const c = parseHealthConfig({ indicators: [
      { key: 'recency', weight: 0, direction: 'lower_better', thresholds: [{ max: 1, score: 1 }] },
      { key: 'ltv', weight: 5, direction: 'sideways', thresholds: [{ min: 1, score: 1 }] },
      { key: 'frequency', weight: 5, direction: 'higher_better', thresholds: [] },
    ] })!;
    expect(c.indicators).toEqual([]);
    expect(scoreFromConfig(c, REAL_ROWS_113[0])).toBeNull();
  });
  test('alerta de cartera con overdue_ratio null (NULLIF de la RPC) y saldo > 0 se pinta como «0 %» y amarilla — no roja', () => {
    const a = buildHealthAlerts({ ...REAL_ROW_2, overdue_ratio: null as unknown as number });
    const od = a.find((x) => x.code === 'overdue')!;
    expect(od.severity).toBe('yellow');
    expect(od.message).toMatch(/\(0 % de su saldo\)/);
    // con el ratio real (97 %) la misma fila es roja y va primera
    expect(buildHealthAlerts(REAL_ROW_2)[0]).toMatchObject({ code: 'overdue', severity: 'red' });
  });
  test('alertas sin actividad ni factura con null → amarillas y con texto («Sin actividad registrada…»)', () => {
    const a = buildHealthAlerts({ ...REAL_ROWS_113[0], overdue_balance: 0 });
    expect(a.map((x) => [x.code, x.severity])).toEqual([['no_activity', 'yellow'], ['no_invoice', 'yellow']]);
  });
});

// ─── 4. Scheduler: aislamiento, aborto, presupuesto, cola ───────────────────
describe('scheduler F11: aislamiento por org, AbortSignal y nada en outbound_jobs', () => {
  function healthDb(): FakeDb {
    const db = makeDb({
      organization_modules: [
        { organization_id: 1, module_code: 'crm', is_active: true },
        { organization_id: 2, module_code: 'crm', is_active: true },
        { organization_id: 3, module_code: 'crm', is_active: true },
        { organization_id: 4, module_code: 'crm', is_active: null },
        { organization_id: 5, module_code: 'crm', is_active: false },
        { organization_id: 1, module_code: 'crm', is_active: true }, // duplicado
        { organization_id: 6, module_code: 'inventory', is_active: true },
      ],
      health_score_configs: [], health_score_snapshots: [], customers: [],
    }, {
      fn_customer_health: (args) => {
        if (args.p_org_id === 2) throw new Error('canceling statement due to statement timeout');
        return [{ customer_id: `c-${args.p_org_id}`, invoices_12m: 1, revenue_12m: 1, days_since_last_invoice: 1, days_since_last_activity: 1, overdue_balance: 0, overdue_ratio: 0, score: 50, band: 'at_risk' }];
      },
    });
    return db;
  }

  test('orgIdsWithModule: deduplica, exige is_active === true (null/false fuera), ignora otros módulos e ids no válidos', () => {
    const ids = orgIdsWithModule([
      { organization_id: 1, module_code: 'crm', is_active: true }, { organization_id: 1, module_code: 'crm', is_active: true },
      { organization_id: 4, module_code: 'crm', is_active: null }, { organization_id: 5, module_code: 'crm', is_active: false },
      { organization_id: 6, module_code: 'inventory', is_active: true }, { organization_id: 0, module_code: 'crm', is_active: true },
      { organization_id: 1.5, module_code: 'crm', is_active: true },
    ], 'crm');
    expect(ids).toEqual([1]);
  });

  test('listCrmActiveOrgIds consulta organization_modules con module_code=crm e is_active=true', async () => {
    const db = healthDb();
    const { orgIds, error } = await listCrmActiveOrgIds(sb(db));
    expect(error).toBeNull();
    expect(orgIds.sort()).toEqual([1, 2, 3]);
  });

  test('una org cuya RPC lanza (timeout) queda en by_org.error; las demás se procesan; errors=1', async () => {
    const db = healthDb();
    const r = await runHealthRecalculate(sb(db), NOW, log);
    expect(r).toMatchObject({ orgs: 3, processed: 3, errors: 1, aborted: false, snapshots_written: 2 });
    expect(r.by_org.find((o) => o.org_id === 2)!.error).toMatch(/statement timeout/);
    expect(r.by_org.filter((o) => o.error === null).map((o) => o.org_id)).toEqual([1, 3]);
    expect(db.writes.filter((w) => w.table === 'outbound_jobs')).toEqual([]);
  });

  test('AbortSignal ya abortada → aborted:true, processed 0, orgs 3 (pendientes = orgs − processed)', async () => {
    const db = healthDb();
    const ac = new AbortController();
    ac.abort();
    const r = await runHealthRecalculate(sb(db), NOW, log, ac.signal);
    expect(r).toMatchObject({ orgs: 3, processed: 0, aborted: true, by_org: [] });
    expect(db.rpcCalls).toEqual([]);
  });

  test('abortar tras la primera org: processed 1 y by_org honesto (solo la procesada)', async () => {
    const db = healthDb();
    const ac = new AbortController();
    db.rpc!.fn_customer_health = (args) => { ac.abort(); return [{ customer_id: `c-${args.p_org_id}`, invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: null, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 40, band: 'at_risk' }]; };
    const r = await runHealthRecalculate(sb(db), NOW, log, ac.signal);
    expect(r).toMatchObject({ orgs: 3, processed: 1, aborted: true });
    expect(r.by_org).toHaveLength(1);
  });

  test('runRenewalsSync: aislamiento; la zona horaria sale de organizations.timezone y una inválida cae al fallback', async () => {
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

  test('runScheduledKinds con las dos tareas: nunca encola en outbound_jobs y la respuesta lleva by_org de cada una', async () => {
    const db = healthDb();
    db.rows.organizations = [];
    db.rows.opportunities = [];
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 5_000, worker: 't', supabase: sb(db), now: NOW });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(db.writes.filter((w) => w.table === 'outbound_jobs')).toEqual([]);
    expect(out.health_recalculate?.ok && out.health_recalculate.result.by_org.length).toBe(3);
    expect(out.renewals_sync?.ok && out.renewals_sync.result.processed).toBe(3);
  });
});

// ─── 5. Renovación ──────────────────────────────────────────────────────────
describe('renovación: concurrencia, tz, hitos, secuencia', () => {
  function renDb(): FakeDb {
    return makeDb({
      pipelines: [{ id: 'pl-ren', organization_id: ORG, pipeline_type: 'renewal' }],
      stages: [{ id: 'st-2', pipeline_id: 'pl-ren', position: 2 }, { id: 'st-1', pipeline_id: 'pl-ren', position: 1 }],
      opportunities: [
        { id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1200, currency: 'USD', salesperson_id: 'seller-1', billing_cycle_months: 12, closed_at: '2026-09-15T04:59:59Z', deal_type: 'new', parent_opportunity_id: null },
        { id: 'won-121', organization_id: DECOY, status: 'won', customer_id: 'cust-121', amount: 1, currency: 'COP', billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z' },
      ],
      tasks: [], customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' }],
      sequences: [
        { id: 'seq-inactiva', organization_id: ORG, is_active: false, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null },
        { id: 'seq-tpl', organization_id: ORG, is_active: true, trigger_type: 'manual', trigger_config: {}, template_key: 'renewal' },
        { id: 'seq-evt', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null },
      ],
    });
  }

  test('r2 (deuda pagada): dos llamadas concurrentes → UNA renovación; el índice único (org,parent) WHERE deal_type=renewal existe en BD y el doble lo simula (23505 → already_existed)', async () => {
    const db = renDb();
    const client = sb(db);
    await Promise.all([scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW }), scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW })]);
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
  });

  test('secuencial: la segunda llamada devuelve already_existed y no inserta nada', async () => {
    const db = renDb();
    const client = sb(db);
    const a = await scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW, timezone: 'America/Bogota' });
    const b = await scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW, timezone: 'America/Bogota' });
    expect(a.already_existed).toBe(false);
    expect(b).toMatchObject({ already_existed: true, renewal_opportunity_id: a.renewal_opportunity_id, tasks_created: 0 });
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(1);
  });

  test('borde de medianoche: closed_at 04:59:59Z (23:59:59 Bogotá del día anterior) → expected_close_date 2027-09-14 en Bogotá y 2027-09-15 en UTC; el hito de 7 días cae el 7 (Bogotá)', async () => {
    const bog = buildRenewalPlan({ closedAt: '2026-09-15T04:59:59Z', billingCycleMonths: 12, now: NOW, timezone: 'America/Bogota' });
    const utc = buildRenewalPlan({ closedAt: '2026-09-15T04:59:59Z', billingCycleMonths: 12, now: NOW, timezone: 'UTC' });
    expect(bog.expiryPlainDate).toBe('2027-09-14');
    expect(utc.expiryPlainDate).toBe('2027-09-15');
    expect(bog.expiryDate.toISOString()).toBe('2027-09-15T04:59:59.000Z');
    const seven = bog.milestones.find((m) => m.days === 7)!.dueAt;
    expect(seven.toISOString()).toBe('2027-09-08T04:59:59.000Z');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(seven)).toBe('2027-09-07');
    // el proceso corre con TZ=UTC o TZ=America/Bogota: el plan no depende del TZ del proceso
    expect(bog.milestones.map((m) => m.dueAt.toISOString())).toEqual(utc.milestones.map((m) => m.dueAt.toISOString()));
  });

  test('r2 (deuda pagada): fin de mes + tarde-noche: 31 ene 04:30Z (30 ene 23:30 Bogotá) + 1 mes → 28 feb en Bogotá (suma de meses en el calendario de la organización)', () => {
    const p = buildRenewalPlan({ closedAt: '2026-01-31T04:30:00Z', billingCycleMonths: 1, now: new Date('2026-01-01T00:00:00Z'), timezone: 'America/Bogota' });
    expect(p.expiryPlainDate).toBe('2026-02-28');
  });

  test('computeExpiryDate no desborda el mes (31 ene + 1 → 28 feb; 31 ago + 6 → 28 feb del año siguiente) y rechaza ciclos no enteros/≤0', () => {
    expect(computeExpiryDate(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(computeExpiryDate(new Date('2026-08-31T12:00:00Z'), 6).toISOString()).toBe('2027-02-28T12:00:00.000Z');
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => computeExpiryDate(NOW, bad)).toThrow(RenewalPlanError);
  });

  test('hitos vencidos no se crean: vence en 10 días → solo el de 7; vence en 5 días → ninguno y next_contact_at null; el de 120 exacto en now no es futuro', () => {
    const in10 = buildRenewalPlan({ closedAt: new Date(NOW.getTime() + 10 * 864e5 - 365 * 864e5), billingCycleMonths: 12, now: NOW });
    expect(in10.milestones.map((m) => m.days)).toEqual([7]);
    expect(in10.nextContactAt).toEqual(in10.milestones[0].dueAt);
    const in5 = buildRenewalPlan({ closedAt: new Date(NOW.getTime() + 5 * 864e5 - 365 * 864e5), billingCycleMonths: 12, now: NOW });
    expect(in5.milestones).toEqual([]);
    expect(in5.nextContactAt).toBeNull();
    const at120 = buildRenewalPlan({ closedAt: new Date(NOW.getTime() + 120 * 864e5 - 365 * 864e5), billingCycleMonths: 12, now: NOW });
    expect(at120.milestones.map((m) => m.days)).toEqual([90, 60, 30, 15, 7]);
  });

  test('scheduleRenewal con vencimiento en 5 días: crea la oportunidad sin tareas y next_contact_at null', async () => {
    const db = renDb();
    (db.rows.opportunities[0] as Row).closed_at = new Date(NOW.getTime() + 5 * 864e5 - 365 * 864e5).toISOString();
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    expect(r).toMatchObject({ tasks_created: 0, next_contact_at: null, already_existed: false });
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(0);
  });

  test('next_contact_at = próximo hito ABIERTO futuro (ignora done/canceled/pasados) y se refresca en la segunda pasada', async () => {
    expect(nextContactFromTasks([
      { due_date: '2026-10-01T00:00:00Z', status: 'done' },
      { due_date: '2026-10-02T00:00:00Z', status: 'canceled' },
      { due_date: '2026-09-01T00:00:00Z', status: 'open' },
      { due_date: '2026-11-01T00:00:00Z', status: 'in_progress' },
      { due_date: '2026-10-15T00:00:00Z', status: 'open' },
      { due_date: null, status: 'open' },
    ], NOW)!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    const db = renDb();
    const client = sb(db);
    const a = await scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW });
    // el hito de 120 días se marca hecho → la renovación debe apuntar al de 90
    const t120 = db.rows.tasks.find((t) => String(t.title).includes('120'))!;
    t120.status = 'done';
    const b = await scheduleRenewal(ORG, 'won-a', 12, client, { now: NOW });
    const t90 = db.rows.tasks.find((t) => String(t.title).includes('90'))!;
    expect(b.updated).toBe(true);
    expect(b.next_contact_at).toBe(new Date(t90.due_date as string).toISOString());
    expect(a.next_contact_at).not.toBe(b.next_contact_at);
  });

  test('las tareas de hito llevan status=open (CHECK real), type=renewal_milestone, org, cliente, vendedor y related_to de la renovación', async () => {
    const db = renDb();
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    const rows = writesTo(db, 'tasks', 'insert')[0].rows;
    expect(rows).toHaveLength(6);
    for (const t of rows) expect(t).toMatchObject({ organization_id: ORG, status: 'open', type: 'renewal_milestone', related_to_type: 'opportunity', related_to_id: r.renewal_opportunity_id, customer_id: 'cust-a', assigned_to: 'seller-1' });
    expect(writesTo(db, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ currency: 'USD', amount: 1200, deal_type: 'renewal', status: 'open', parent_opportunity_id: 'won-a', billing_cycle_months: 12 });
  });

  test('secuencia F8: prefiere trigger event=renewal_scheduled sobre template_key, ignora inactivas; enrollInSequence recibe la org y source=renewal', async () => {
    const db = renDb();
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW, enroll: enrollInSequence });
    expect(enrollInSequence).toHaveBeenCalledTimes(1);
    expect(enrollInSequence).toHaveBeenCalledWith(ORG, 'seq-evt', r.renewal_opportunity_id, expect.anything(), { customerId: 'cust-a', source: 'renewal' });
    expect(pickRenewalSequence(db.rows.sequences.filter((s) => s.id !== 'seq-evt') as never[])).toMatchObject({ id: 'seq-tpl' });
  });

  test('si la secuencia falla, la renovación y las tareas se conservan y el error queda en el resultado (y en errors[] del sync)', async () => {
    (enrollInSequence as jest.Mock).mockRejectedValueOnce(new Error('fn_enroll_in_sequence: boom'));
    const db = renDb();
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW, enroll: enrollInSequence });
    expect(r.sequence_error).toMatch(/boom/);
    expect(db.rows.opportunities.filter((o) => o.deal_type === 'renewal')).toHaveLength(1);
    expect(db.rows.tasks).toHaveLength(6);
    (enrollInSequence as jest.Mock).mockRejectedValueOnce(new Error('boom2'));
    const db2 = renDb();
    const s = await syncRenewalsForOrg(ORG, sb(db2), { now: NOW, enroll: enrollInSequence });
    expect(s).toMatchObject({ scanned: 1, created: 1 });
    expect(s.errors[0]).toMatch(/secuencia de renovación: boom2/);
  });

  test('tenencia: org+1 no ve won-a (lanza) y no escribe; syncRenewalsForOrg(org+1) solo toca won-121', async () => {
    const db = renDb();
    await expect(scheduleRenewal(DECOY, 'won-a', 12, sb(db), { now: NOW })).rejects.toThrow(/no encontrada en la organización/);
    expect(db.writes).toEqual([]);
    db.rows.pipelines.push({ id: 'pl-ren-121', organization_id: DECOY, pipeline_type: 'renewal' });
    db.rows.stages.push({ id: 'st-121', pipeline_id: 'pl-ren-121', position: 1 });
    const s = await syncRenewalsForOrg(DECOY, sb(db), { now: NOW });
    expect(s).toMatchObject({ scanned: 1, created: 1 });
    for (const w of db.writes) for (const row of w.rows) expect(row.organization_id).toBe(DECOY);
  });
});

// ─── 6. Onboarding ──────────────────────────────────────────────────────────
describe('onboarding: plantilla real, validaciones sin escrituras, cierre por is_won, tenencia', () => {
  /** Plantilla REAL «Onboarding estándar 30 días» de una org real (7 pasos). */
  const REAL_TEMPLATE_STEPS = [
    { day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff y objetivos' },
    { day: 2, key: 'config', owner: 'cs', title: 'Configuración inicial' },
    { day: 5, key: 'import', owner: 'cs', title: 'Importación de datos' },
    { day: 7, key: 'training', owner: 'cs', title: 'Capacitación del equipo' },
    { day: 10, key: 'assisted', owner: 'cs', title: 'Uso asistido' },
    { day: 14, key: 'review14', owner: 'vendor', title: 'Revisión día 14' },
    { day: 30, key: 'br30', owner: 'vendor', title: 'Business review día 30' },
  ];
  function onbDb(): FakeDb {
    return makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'Onboarding estándar 30 días', steps: REAL_TEMPLATE_STEPS, default_duration_days: 30, is_active: true }],
      pipelines: [{ id: 'pl-onb', organization_id: ORG, pipeline_type: 'onboarding' }],
      stages: [
        { id: 'st-ganado-falso', pipeline_id: 'pl-onb', position: 1, is_won: false, name: 'Ganado' },
        { id: 'st-mid', pipeline_id: 'pl-onb', position: 2, is_won: false, name: 'Capacitación' },
        { id: 'st-won', pipeline_id: 'pl-onb', position: 3, is_won: true, name: 'Cierre' },
      ],
      opportunities: [
        { id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', salesperson_id: 's1', parent_opportunity_id: null },
        { id: 'open-b', organization_id: ORG, status: 'open', customer_id: 'cust-b', parent_opportunity_id: null },
        { id: 'won-121', organization_id: DECOY, status: 'won', customer_id: 'cust-121', parent_opportunity_id: null },
      ],
      onboarding_instances: [], onboarding_steps: [], customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' }],
    });
  }

  test('oportunidad open → error sin escrituras; ajena → error sin escrituras (ni siquiera crea el pipeline)', async () => {
    const db = onbDb();
    await expect(startOnboardingForWonOpportunity(ORG, 'open-b', sb(db), { now: NOW })).rejects.toThrow(/no está ganada/);
    await expect(startOnboardingForWonOpportunity(ORG, 'won-121', sb(db), { now: NOW })).rejects.toThrow(/no encontrada en la organización/);
    await expect(startOnboardingForWonOpportunity(DECOY, 'won-a', sb(db), { now: NOW })).rejects.toThrow(/no encontrada/);
    expect(db.writes).toEqual([]);
  });

  test('pasos = plantilla real (7, numerados, due = inicio + day) y la hija nace en la etapa de position 1 (no en la is_won)', async () => {
    const db = onbDb();
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW });
    expect(r).toMatchObject({ steps_created: 7, already_existed: false });
    expect(writesTo(db, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ stage_id: 'st-ganado-falso', parent_opportunity_id: 'won-a', metadata: { type: 'onboarding' } });
    const steps = writesTo(db, 'onboarding_steps', 'insert')[0].rows;
    expect(steps.map((s) => [s.step_number, s.name, s.due_date])).toEqual(REAL_TEMPLATE_STEPS.map((s, i) => [i + 1, s.title, new Date(NOW.getTime() + s.day * 864e5).toISOString()]));
    expect(steps.every((s) => s.organization_id === ORG && s.is_completed === false)).toBe(true);
    expect(steps.some((s) => 'updated_at' in s)).toBe(false);
  });

  test('dos llamadas → already_existed y cero escrituras nuevas', async () => {
    const db = onbDb();
    const client = sb(db);
    const a = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    const n = db.writes.length;
    const b = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    expect(b).toMatchObject({ already_existed: true, steps_created: 0, instance_id: a.instance_id, onboarding_opportunity_id: a.onboarding_opportunity_id });
    expect(db.writes.length).toBe(n);
  });

  test('r2 (deuda pagada): dos llamadas CONCURRENTES → una hija y una instancia (índices únicos en BD, simulados por el doble; 23505 → already_existed)', async () => {
    const db = onbDb();
    const client = sb(db);
    await Promise.all([startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW }), startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW })]);
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
  });

  test('completar con un paso pendiente → 409 (OnboardingIncompleteError) y cero escrituras; con todos hechos mueve a la etapa is_won (position 3), NO a la llamada «Ganado»', async () => {
    const db = onbDb();
    const client = sb(db);
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    const n = db.writes.length;
    for (const s of db.rows.onboarding_steps.slice(0, 6)) s.is_completed = true;
    await expect(completeOnboardingInstance(r.instance_id, ORG, client, { now: NOW })).rejects.toThrow(OnboardingIncompleteError);
    expect(db.writes.length).toBe(n);
    db.rows.onboarding_steps[6].is_completed = true;
    const done = await completeOnboardingInstance(r.instance_id, ORG, client, { now: NOW });
    expect(done).toMatchObject({ status: 'completed', completed_at: NOW.toISOString() });
    const mv = writesTo(db, 'opportunities', 'update').at(-1)!;
    expect(mv.rows[0]).toEqual({ stage_id: 'st-won' });
    expect(mv.filters).toMatchObject({ id: r.onboarding_opportunity_id, organization_id: ORG });
  });

  test('tenencia org+1: getOnboardingInstance/updateOnboardingStep/completeOnboardingInstance no ven ni tocan la instancia de la org 120', async () => {
    const db = onbDb();
    const client = sb(db);
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    const n = db.writes.length;
    expect(await getOnboardingInstance(r.instance_id, DECOY, client)).toBeNull();
    const step = db.rows.onboarding_steps[0];
    expect(await updateOnboardingStep(String(step.id), DECOY, { is_completed: true, completed_by: 'intruso' }, client, { instanceId: r.instance_id })).toBeNull();
    expect(step.is_completed).toBe(false);
    await expect(completeOnboardingInstance(r.instance_id, DECOY, client)).rejects.toThrow(/no encontrada/);
    expect(db.rows.onboarding_instances[0].status).toBe('active');
    // las escrituras intentadas llevan el filtro de la org llamante, nunca la 120
    for (const w of db.writes.slice(n)) expect(w.filters.organization_id).toBe(DECOY);
  });

  test('buildStepRows: sin day usa reparto uniforme de default_duration_days; parseTemplateSteps ignora entradas sin título y acepta name como alias', () => {
    const steps = parseTemplateSteps([{ title: 'A' }, { name: 'B', day: 3 }, { day: 1 }, null, 'x']);
    expect(steps.map((s) => [s.title, s.day])).toEqual([['A', null], ['B', 3]]);
    const rows = buildStepRows({ templateSteps: steps, startedAt: NOW, defaultDurationDays: 30, orgId: ORG, instanceId: 'i' });
    expect(rows.map((r) => r.due_date)).toEqual([new Date(NOW.getTime() + 15 * 864e5).toISOString(), new Date(NOW.getTime() + 3 * 864e5).toISOString()]);
  });
});

// ─── 7. Cableado de la UI (guardarraíl tolerante a reformateo) ──────────────
describe('drawer: la pestaña Onboarding solo se monta en oportunidades de onboarding', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/crm/pipeline/OpportunityDrawer.tsx'), 'utf8');
  test('ONBOARDING_TAB y OnboardingTab están condicionados por isOnboardingOpportunity(...)', () => {
    expect(src).toMatch(/const\s+showOnboarding\s*=\s*isOnboardingOpportunity\s*\(/);
    expect(src).toMatch(/showOnboarding\s*\?\s*\[.*?ONBOARDING_TAB.*?\]\s*:\s*DRAWER_TABS/);
    expect(src).toMatch(/\{\s*showOnboarding\s*&&\s*<TabsContent value="onboarding"/);
  });
});
