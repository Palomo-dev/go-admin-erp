/// <reference types="jest" />
/**
 * F11 — casos únicos consolidados de las rondas (2026-09-21): idempotencia bajo
 * concurrencia con los tres índices únicos reales (el doble los simula y
 * devuelve 23505), «producto honesto» en onboarding (moneda del padre, completar
 * no miente si mover falla) y errores de insert que NO son 23505.
 * Vienen de `f11Round2` (constructor r2 §5/§7) y `f11Round2Tester` (tester r2 §5).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn(async () => ({ id: 'enr', created: true })) }));

import { scheduleRenewal } from '../renewalService';
import { completeOnboardingInstance, createOnboardingInstance, startOnboardingForWonOpportunity } from '../onboardingService';

const ORG = 120;
const NOW = new Date('2026-09-15T08:30:00Z');
const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

function renewalDb(): FakeDb {
  return makeDb({
    pipelines: [{ id: 'pl', organization_id: ORG, pipeline_type: 'renewal' }], stages: [{ id: 'st', pipeline_id: 'pl', position: 1 }],
    opportunities: [{ id: 'won', organization_id: ORG, status: 'won', customer_id: 'c', amount: 1, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null }],
    tasks: [], customers: [{ id: 'c', organization_id: ORG, full_name: 'C' }], sequences: [],
  });
}
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
function instanceDb(): FakeDb {
  return makeDb({
    onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'E', steps: [{ day: 0, owner: 'vendor', title: 'K' }], default_duration_days: 30, is_active: true }],
    opportunities: [{ id: 'onb-a', organization_id: ORG, customer_id: 'cust-a', parent_opportunity_id: 'won-a' }],
    onboarding_instances: [], onboarding_steps: [],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('23505 de los índices únicos = already_existed (tester r2 §5, r2 §7)', () => {
  test('tester r2 5.1: renovación con 5 llamadas en paralelo → 1 insert, 1 juego de tareas, 4 rechazos por uq_opportunities_one_renewal_per_parent convertidos en already_existed', async () => {
    const db = renewalDb();
    const client = sb(db);
    const rs = await Promise.all(Array.from({ length: 5 }, () => scheduleRenewal(ORG, 'won', 12, client, { now: NOW })));
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(1);
    expect(rs.filter((r) => r.already_existed)).toHaveLength(4);
    expect(rs.filter((r) => r.already_existed).every((r) => r.tasks_created === 0)).toBe(true);
    expect(new Set(rs.map((r) => r.renewal_opportunity_id)).size).toBe(1);
    expect(db.rejected.map((r) => r.index)).toEqual(Array(4).fill('uq_opportunities_one_renewal_per_parent'));
  });
  test('tester r2 5.2: onboarding con 5 llamadas en paralelo → 1 hija (metadata.type=onboarding, moneda del padre), 1 instancia, 1 juego de 7 pasos', async () => {
    const db = makeDb({
      onboarding_templates: [{ id: 'tpl', organization_id: ORG, name: 'T', steps: Array.from({ length: 7 }, (_, i) => ({ day: i, title: `P${i}` })), default_duration_days: 30, is_active: true }],
      pipelines: [{ id: 'pl', organization_id: ORG, pipeline_type: 'onboarding' }], stages: [{ id: 'st', pipeline_id: 'pl', position: 1, is_won: false }],
      opportunities: [{ id: 'won', organization_id: ORG, status: 'won', customer_id: 'c', currency: 'USD', salesperson_id: null, parent_opportunity_id: null }],
      onboarding_instances: [], onboarding_steps: [], customers: [{ id: 'c', organization_id: ORG, full_name: 'C' }],
    });
    const client = sb(db);
    const rs = await Promise.all(Array.from({ length: 5 }, () => startOnboardingForWonOpportunity(ORG, 'won', client, { now: NOW })));
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ metadata: { type: 'onboarding' }, currency: 'USD' });
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_steps', 'insert')[0].rows).toHaveLength(7);
    expect(new Set(rs.map((r) => r.instance_id)).size).toBe(1);
    expect(new Set(rs.map((r) => r.onboarding_opportunity_id)).size).toBe(1);
    expect(rs.filter((r) => r.already_existed)).toHaveLength(4);
    expect(db.rejected.length).toBeGreaterThanOrEqual(1);
  });
  test('r2 7.3: createOnboardingInstance concurrente: 23505 en la instancia → devuelve la existente con already_existed (y sus pasos), sin crear pasos dos veces', async () => {
    const db = instanceDb();
    const client = sb(db);
    const [a, b] = await Promise.all([createOnboardingInstance(ORG, 'onb-a', 'tpl', client, { now: NOW }), createOnboardingInstance(ORG, 'onb-a', 'tpl', client, { now: NOW })]);
    expect(a!.id).toBe(b!.id);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
    expect([a!.already_existed, b!.already_existed].sort()).toEqual([false, true]);
  });
  test('r2 7.4: createOnboardingInstance con otro error de insert (23502) NO se trata como already_existed: lanza', async () => {
    const db = instanceDb();
    db.nextWriteError = { table: 'onboarding_instances', error: { code: '23502', message: 'null value in column' } };
    await expect(createOnboardingInstance(ORG, 'onb-a', 'tpl', sb(db), { now: NOW })).rejects.toThrow(/null value/);
  });
  test('r2 7.5: scheduleRenewal con otro error de insert (23502) sigue lanzando', async () => {
    const db = renewalDb();
    db.nextWriteError = { table: 'opportunities', error: { code: '23502', message: 'null value' } };
    await expect(scheduleRenewal(ORG, 'won', 12, sb(db), { now: NOW })).rejects.toThrow(/null value/);
  });
});

describe('producto honesto en onboarding (r2 §5)', () => {
  test('r2 5.2: la hija lleva la moneda del padre (USD, aunque la base de la org sea COP); sin moneda en el padre, la base de la organización (mxn → MXN); sin ninguna, no se cablea COP', async () => {
    const usd = wonDb('USD', 'COP');
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(usd), { now: NOW });
    expect(writesTo(usd, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ currency: 'USD', metadata: { type: 'onboarding' } });
    const base = wonDb(null, 'mxn');
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(base), { now: NOW });
    expect(writesTo(base, 'opportunities', 'insert')[0].rows[0].currency).toBe('MXN');
    const none = wonDb(null);
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(none), { now: NOW });
    expect('currency' in writesTo(none, 'opportunities', 'insert')[0].rows[0]).toBe(false);
  });
  test('r2 5.3: completar: si mover la oportunidad falla, la instancia vuelve a active y se lanza (no queda completed en silencio)', async () => {
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
  test('tester r1 T6.6: la org+1 no puede completar la instancia de la 120 (sin opts, reloj real) y la instancia sigue active', async () => {
    const db = wonDb('USD');
    const client = sb(db);
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', client, { now: NOW });
    for (const s of db.rows.onboarding_steps) s.is_completed = true;
    const n = db.writes.length;
    await expect(completeOnboardingInstance(r.instance_id, ORG + 1, client)).rejects.toThrow(/no encontrada/);
    expect(db.rows.onboarding_instances[0].status).toBe('active');
    for (const w of db.writes.slice(n)) expect(w.filters.organization_id).toBe(ORG + 1);
  });
});
