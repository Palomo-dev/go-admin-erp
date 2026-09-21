/// <reference types="jest" />
/**
 * F11 — casos únicos consolidados de las rondas (2026-09-21): lógica pura y
 * servicios sin rutas. Vienen de `f11Round1Tester` (tester r1), `f11Round2`
 * (constructor r2) y `f11Round2Tester` (tester r2); el origen y el id de cada
 * caso van en su `describe`/`test`. Cubre: config real sobre la RPC (un solo
 * score), bordes de `shouldWriteSnapshot`, umbrales/NaN/dirección, alerta de
 * cartera con ratio null, meses en la zona de la organización (DST, bisiesto,
 * zona inválida), medianoche en Bogotá, modelo puro del checklist, etiquetas
 * honestas y el guardarraíl del drawer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb, type Row } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));

import { bandForScore, buildHealthAlerts, parseHealthConfig, scoreFromConfig, scoreIndicator, shouldWriteSnapshot, type HealthRpcRow } from '../healthBands';
import { composeHealthResult, honestIndicatorLabel, scoreOf, snapshotCustomerHealth } from '../healthScoreServer';
import { buildRenewalPlan, computeExpiryDate, RenewalPlanError } from '../renewalMilestones';
import { scheduleRenewal } from '../renewalService';
import { checklistStepControl, focusTargetAfterComplete } from '../onboardingProgress';
import { recalculateOrgHealth } from '@/lib/jobs/scheduled/healthRecalculate';

const ORG = 120;
const NOW = new Date('2026-09-15T08:30:00Z');
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

/** Config REAL de `health_score_configs` (idéntica en las 54 filas; leída por MCP 2026-09-15). */
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
/** Filas REALES de `fn_customer_health` (ids recortados; org 113 = 196 clientes; org 2 = cartera vencida 97 %). */
const REAL_ROWS: HealthRpcRow[] = [
  { customer_id: '0bd2a6bc', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 58, band: 'at_risk' },
  { customer_id: '0cc1854f', invoices_12m: 1, revenue_12m: 71000, days_since_last_invoice: 70, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 59, band: 'at_risk' },
  { customer_id: '674c3eed', invoices_12m: 0, revenue_12m: 0, days_since_last_invoice: 419, days_since_last_activity: null, overdue_balance: 1131000, overdue_ratio: 0.9746, score: 1, band: 'critical' },
  { customer_id: '273ae512', invoices_12m: 4, revenue_12m: 264180.01, days_since_last_invoice: 243, days_since_last_activity: null, overdue_balance: 415940, overdue_ratio: 0.8603, score: 24, band: 'critical' },
  { customer_id: '89e5bc62', invoices_12m: 1, revenue_12m: 29000, days_since_last_invoice: 15, days_since_last_activity: null, overdue_balance: 0, overdue_ratio: 0, score: 60, band: 'at_risk' },
];
const EXPECTED = { '0bd2a6bc': 22, '0cc1854f': 28, '674c3eed': 10, '273ae512': 42, '89e5bc62': 40 } as const;
const ROW_OVERDUE = REAL_ROWS[2];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('health: un solo score — config real sobre la RPC (tester r1 T1, tester r2 T1.1)', () => {
  test('T1.1: 58/at_risk de la RPC se convierte en 22/red (recencia 77 d → 10, 1 factura → 25, 49 000 → 20, ticket 49 000 → 40)', () => {
    const s = scoreFromConfig(CONFIG, REAL_ROWS[0])!;
    expect(s.indicators.map((i) => [i.key, i.value, i.score])).toEqual([['recency', 77, 10], ['frequency', 1, 25], ['ltv', 49000, 20], ['avg_ticket', 49000, 40]]);
    expect(Math.round((10 * 30 + 25 * 25 + 20 * 25 + 40 * 20) / 100)).toBe(22);
    expect(s).toMatchObject({ score: 22, band: 'red' });
  });
  test('T1.2: la cartera vencida (97 %) NO entra en la config real (sin indicador de cartera) → 10/red; la alerta sí la cuenta, roja y primera', () => {
    const s = scoreFromConfig(CONFIG, ROW_OVERDUE)!;
    expect(s.score).toBe(10);
    expect(s.indicators.find((i) => i.key === 'receivables' || i.key === 'overdue_ratio')).toBeUndefined();
    expect(buildHealthAlerts(ROW_OVERDUE)[0]).toMatchObject({ code: 'overdue', severity: 'red' });
  });
  test('r2 T1.1: scoreOf (cron) == scoreFromConfig (lista) para las 5 filas reales, y ninguna coincide con el score crudo de la RPC', () => {
    for (const r of REAL_ROWS) {
      const cfg = scoreFromConfig(CONFIG, r)!;
      expect(scoreOf(r, CONFIG)).toEqual({ score: cfg.score, band: cfg.band });
      expect(cfg.score).toBe(EXPECTED[r.customer_id as keyof typeof EXPECTED]);
      expect(cfg.score).not.toBe(r.score);
    }
  });
  test('T1.4: recalculateOrgHealth escribe el score de la CONFIG (22), no el de la RPC (58), en snapshots y customers.health_score', async () => {
    const db = makeDb({
      health_score_configs: [{ organization_id: 113, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }],
      health_score_snapshots: [], customers: [{ id: '0bd2a6bc', organization_id: 113 }],
    }, { fn_customer_health: () => [REAL_ROWS[0]] });
    const r = await recalculateOrgHealth(113, sb(db), NOW);
    expect(r).toMatchObject({ customers: 1, snapshots_written: 1, error: null });
    expect(writesTo(db, 'health_score_snapshots', 'insert')[0].rows[0]).toMatchObject({ organization_id: 113, score: 22, band: 'red' });
    const cu = writesTo(db, 'customers', 'update')[0];
    expect(cu.rows[0]).toMatchObject({ health_score: 22 });
    expect(cu.filters).toMatchObject({ id: '0bd2a6bc', organization_id: 113 });
  });
  test('r2 B1.4: snapshotCustomerHealth con cliente sin fila en la RPC (otra org o lead) → null y sin escrituras', async () => {
    const db = makeDb({ health_score_configs: [{ organization_id: ORG, config: REAL_CONFIG, refresh_interval_hours: 24, is_active: true }], customers: [], health_score_snapshots: [] }, { fn_customer_health: () => [] });
    expect(await snapshotCustomerHealth(ORG, 'c-1', sb(db), NOW)).toBeNull();
    expect(db.writes).toEqual([]);
  });
  test('r2 B5.1: honestIndicatorLabel etiqueta por lo que de verdad mide; clave desconocida conserva la etiqueta de la config; composeHealthResult las aplica', () => {
    expect(honestIndicatorLabel('frequency', 'Frecuencia (compras 90d)')).toBe('Facturas (12 m)');
    expect(honestIndicatorLabel('ltv', 'LTV total')).toBe('Ingresos (12 m)');
    expect(honestIndicatorLabel('recency', 'Recencia (días sin comprar)')).toBe('Días desde la última factura');
    expect(honestIndicatorLabel('avg_ticket', 'Ticket promedio')).toBe('Ticket promedio (12 m)');
    expect(honestIndicatorLabel('nps', 'NPS')).toBe('NPS');
    const r = composeHealthResult(REAL_ROWS[0], CONFIG, 'C');
    expect(r.indicators.map((i) => i.label)).toEqual(['Días desde la última factura', 'Facturas (12 m)', 'Ingresos (12 m)', 'Ticket promedio (12 m)']);
    expect(r).toMatchObject({ score: 22, band: 'red' });
  });
});

describe('health: bordes de shouldWriteSnapshot y umbrales (tester r1 T2/T3)', () => {
  test('T2.2/T2.3: mismo score a 23 h 59 min → no; 24 h exactas → sí; intervalo null/undefined/0/-5 → 24 h; intervalo 1 h y 2 h de espera → sí; created_at inválido → sí', () => {
    const at = new Date('2026-09-14T08:30:00Z');
    const last = { score: 60, created_at: at.toISOString() };
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 24 * 3600e3 - 60e3), refreshIntervalHours: 24 })).toBe(false);
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 24 * 3600e3), refreshIntervalHours: 24 })).toBe(true);
    for (const h of [null, undefined, 0, -5]) {
      expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 23 * 3600e3), refreshIntervalHours: h })).toBe(false);
      expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 25 * 3600e3), refreshIntervalHours: h })).toBe(true);
    }
    expect(shouldWriteSnapshot({ last, score: 60, now: new Date(at.getTime() + 2 * 3600e3), refreshIntervalHours: 1 })).toBe(true);
    expect(shouldWriteSnapshot({ last: { score: 1, created_at: 'ayer' }, score: 1, now: NOW, refreshIntervalHours: 24 })).toBe(true);
  });
  test('T3.1/T3.2: NaN → el peor umbral; sin `max` en lower_better todo es «peor»; la dirección invertida cambia el resultado', () => {
    const lower = { key: 'recency', label: 'r', weight: 1, direction: 'lower_better' as const, thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }] };
    const higher = { key: 'frequency', label: 'f', weight: 1, direction: 'higher_better' as const, thresholds: [{ min: 10, score: 100 }, { min: 1, score: 25 }] };
    expect(scoreIndicator(lower, Number.NaN)).toBe(70);
    expect(scoreIndicator(lower, 31)).toBe(70);
    expect(scoreIndicator(higher, 10)).toBe(100);
    expect(scoreIndicator(higher, 9)).toBe(25);
    expect(scoreIndicator(higher, 0)).toBe(25); // por debajo de todo `min`: el peor
    expect(scoreIndicator({ ...higher, direction: 'lower_better' }, 10)).toBe(25);
    expect([70, 69, 40, 39].map((s) => bandForScore(s, { green: 70, yellow: 40, red: 0 }))).toEqual(['green', 'yellow', 'yellow', 'red']);
  });
  test('T3.4: parseHealthConfig descarta peso ≤ 0, dirección desconocida («sideways») y sin umbrales; sin indicadores → scoreFromConfig null', () => {
    const c = parseHealthConfig({ indicators: [
      { key: 'recency', weight: 0, direction: 'lower_better', thresholds: [{ max: 1, score: 1 }] },
      { key: 'ltv', weight: 5, direction: 'sideways', thresholds: [{ min: 1, score: 1 }] },
      { key: 'frequency', weight: 5, direction: 'higher_better', thresholds: [] },
    ] })!;
    expect(c.indicators).toEqual([]);
    expect(scoreFromConfig(c, REAL_ROWS[0])).toBeNull();
  });
  test('T3.5/T3.6: overdue_ratio null (NULLIF de la RPC) con saldo > 0 → «0 %» y amarilla, no roja; sin actividad ni factura (null) → amarillas', () => {
    const a = buildHealthAlerts({ ...ROW_OVERDUE, overdue_ratio: null as unknown as number });
    const od = a.find((x) => x.code === 'overdue')!;
    expect(od.severity).toBe('yellow');
    expect(od.message).toMatch(/\(0 % de su saldo\)/);
    expect(buildHealthAlerts({ ...REAL_ROWS[0], overdue_balance: 0 }).map((x) => [x.code, x.severity])).toEqual([['no_activity', 'yellow'], ['no_invoice', 'yellow']]);
  });
});

describe('renovación: meses en la zona de la organización (r2 §6, tester r2 §4, tester r1 T5.3/T5.5)', () => {
  test('r2 6.1: 31 ene 04:30Z (30 ene 23:30 Bogotá) + 1 mes → 28 feb 23:30 Bogotá (2026-03-01T04:30Z); en UTC → 28 feb 04:30Z; expiryPlainDate 2026-02-28', () => {
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'America/Bogota').toISOString()).toBe('2026-03-01T04:30:00.000Z');
    expect(computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'UTC').toISOString()).toBe('2026-02-28T04:30:00.000Z');
    expect(buildRenewalPlan({ closedAt: '2026-01-31T04:30:00Z', billingCycleMonths: 1, now: new Date('2026-01-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2026-02-28');
  });
  test('r2 6.2 / r1 T5.5: conserva h:m:s.ms locales; bisiesto; +13 meses; 31 ago + 6 → 28 feb; ciclo NaN rechazado', () => {
    expect(computeExpiryDate(new Date('2027-01-31T04:59:59.250Z'), 1, 'America/Bogota').toISOString()).toBe('2027-03-01T04:59:59.250Z');
    expect(computeExpiryDate(new Date('2024-01-31T12:00:00Z'), 1, 'America/Bogota').toISOString()).toBe('2024-02-29T12:00:00.000Z');
    expect(computeExpiryDate(new Date('2026-01-31T12:00:00Z'), 13, 'UTC').toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(computeExpiryDate(new Date('2026-08-31T12:00:00Z'), 6).toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(() => computeExpiryDate(NOW, Number.NaN)).toThrow(RenewalPlanError);
  });
  test('r2 6.3 / tester r2 4.2: Nueva York cruzando DST en ambos sentidos conserva la hora local', () => {
    expect(computeExpiryDate(new Date('2026-02-15T20:00:00Z'), 1, 'America/New_York').toISOString()).toBe('2026-03-15T19:00:00.000Z');
    const d = computeExpiryDate(new Date('2026-10-20T13:15:00Z'), 1, 'America/New_York');
    expect(d.toISOString()).toBe('2026-11-20T14:15:00.000Z');
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)).toBe('09:15');
  });
  test('tester r2 4.3: 29 feb 2028 12:00 Bogotá + 12 → 28 feb 2029; + 48 → 29 feb 2032', () => {
    expect(buildRenewalPlan({ closedAt: '2028-02-29T17:00:00Z', billingCycleMonths: 12, now: new Date('2028-03-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2029-02-28');
    expect(buildRenewalPlan({ closedAt: '2028-02-29T17:00:00Z', billingCycleMonths: 48, now: new Date('2028-03-01T00:00:00Z'), timezone: 'America/Bogota' }).expiryPlainDate).toBe('2032-02-29');
  });
  test('tester r2 4.4: zona inválida → cae al fallback o lanza con mensaje claro, nunca NaN', () => {
    let out: Date | null = null;
    try { out = computeExpiryDate(new Date('2026-01-31T04:30:00Z'), 1, 'Marte/Olympus'); } catch (e) { expect(String(e)).toMatch(/zona|timezone|Invalid|inválid/i); return; }
    expect(Number.isNaN(out!.getTime())).toBe(false);
  });
  test('r1 T5.3: closed_at 04:59:59Z (23:59:59 Bogotá del día anterior) → 2027-09-14 en Bogotá y 2027-09-15 en UTC; el hito de 7 días cae el 7 (Bogotá); los instantes no dependen del TZ del proceso', () => {
    const bog = buildRenewalPlan({ closedAt: '2026-09-15T04:59:59Z', billingCycleMonths: 12, now: NOW, timezone: 'America/Bogota' });
    const utc = buildRenewalPlan({ closedAt: '2026-09-15T04:59:59Z', billingCycleMonths: 12, now: NOW, timezone: 'UTC' });
    expect([bog.expiryPlainDate, utc.expiryPlainDate]).toEqual(['2027-09-14', '2027-09-15']);
    expect(bog.expiryDate.toISOString()).toBe('2027-09-15T04:59:59.000Z');
    const seven = bog.milestones.find((m) => m.days === 7)!.dueAt;
    expect(seven.toISOString()).toBe('2027-09-08T04:59:59.000Z');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(seven)).toBe('2027-09-07');
    expect(bog.milestones.map((m) => m.dueAt.toISOString())).toEqual(utc.milestones.map((m) => m.dueAt.toISOString()));
  });
  test('r1 T5.6: closedAt como Date: vence en 10 días → solo el hito de 7 y next = ese hito; en 5 días → sin hitos y nextContactAt null', () => {
    const in10 = buildRenewalPlan({ closedAt: new Date(NOW.getTime() + 10 * 864e5 - 365 * 864e5), billingCycleMonths: 12, now: NOW });
    expect(in10.milestones.map((m) => m.days)).toEqual([7]);
    expect(in10.nextContactAt).toEqual(in10.milestones[0].dueAt);
    const in5 = buildRenewalPlan({ closedAt: new Date(NOW.getTime() + 5 * 864e5 - 365 * 864e5), billingCycleMonths: 12, now: NOW });
    expect(in5.milestones).toEqual([]);
    expect(in5.nextContactAt).toBeNull();
  });
  test('r1 T5.7: scheduleRenewal con vencimiento en 5 días crea la oportunidad sin tareas y next_contact_at null', async () => {
    const db = makeDb({
      pipelines: [{ id: 'pl-ren', organization_id: ORG, pipeline_type: 'renewal' }], stages: [{ id: 'st-1', pipeline_id: 'pl-ren', position: 1 }],
      opportunities: [{ id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1200, currency: 'USD', salesperson_id: 's1', billing_cycle_months: 12, closed_at: new Date(NOW.getTime() + 5 * 864e5 - 365 * 864e5).toISOString(), deal_type: 'new', parent_opportunity_id: null }],
      tasks: [], customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'A' }], sequences: [],
    });
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    expect(r).toMatchObject({ tasks_created: 0, next_contact_at: null, already_existed: false });
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(0);
    expect((db.rows.opportunities as Row[]).filter((o) => o.deal_type === 'renewal')).toHaveLength(1);
  });
});

describe('onboarding: modelo puro del checklist (r2 §4)', () => {
  test('r2 4.1: la casilla que se guarda NO lleva disabled del DOM (perdería el foco) sino locked + busy; las demás disabled; completado → disabled', () => {
    expect(checklistStepControl({ stepId: 'a', busyStepId: 'a', instanceCompleted: false })).toEqual({ disabled: false, locked: true, busy: true });
    expect(checklistStepControl({ stepId: 'b', busyStepId: 'a', instanceCompleted: false })).toEqual({ disabled: true, locked: true, busy: false });
    expect(checklistStepControl({ stepId: 'b', busyStepId: null, instanceCompleted: false })).toEqual({ disabled: false, locked: false, busy: false });
    expect(checklistStepControl({ stepId: 'b', busyStepId: null, instanceCompleted: true })).toEqual({ disabled: true, locked: true, busy: false });
  });
  test('r2 4.2: focusTargetAfterComplete: éxito → el mensaje de estado; fallo → el propio botón', () => {
    expect(focusTargetAfterComplete(true)).toBe('status');
    expect(focusTargetAfterComplete(false)).toBe('button');
  });
});

describe('drawer: la pestaña Onboarding solo se monta en oportunidades de onboarding (tester r1 §7, contrato sobre el fuente)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/crm/pipeline/OpportunityDrawer.tsx'), 'utf8');
  test('ONBOARDING_TAB y OnboardingTab están condicionados por isOnboardingOpportunity(...)', () => {
    expect(src).toMatch(/const\s+showOnboarding\s*=\s*isOnboardingOpportunity\s*\(/);
    expect(src).toMatch(/showOnboarding\s*\?\s*\[.*?ONBOARDING_TAB.*?\]\s*:\s*DRAWER_TABS/);
    expect(src).toMatch(/\{\s*showOnboarding\s*&&\s*<TabsContent value="onboarding"/);
  });
});
