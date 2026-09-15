/// <reference types="jest" />
/**
 * F11 — `scheduleRenewal` / `syncRenewalsForOrg` (server) sobre el doble con
 * señuelos de la org 121. Una renovación por contrato, hitos como tareas
 * (`tasks.status` real: open|in_progress|done|canceled), idempotencia,
 * `closed_at` obligatorio, secuencia de renovación opcional sobre F8.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({
  enrollInSequence: jest.fn(async (_org: number, sequenceId: string) => ({ id: `enr-${sequenceId}`, created: true, reason: null, steps: 2, first_run_at: null, status: 'active' })),
}));

import { enrollInSequence } from '@/lib/services/crm/sequenceService';
import { RenewalPlanError } from '../renewalMilestones';
import { scheduleRenewal, syncRenewalsForOrg } from '../renewalService';

const NOW = new Date('2026-09-15T12:00:00Z');
const ORG = 120;
const DECOY = ORG + 1;

function fixtures(): FakeDb {
  return makeDb({
    pipelines: [
      { id: 'pl-ren-120', organization_id: ORG, pipeline_type: 'renewal', name: 'Renovaciones' },
      { id: 'pl-ren-121', organization_id: DECOY, pipeline_type: 'renewal', name: 'Renovaciones' },
    ],
    stages: [
      { id: 'st-ren-2', pipeline_id: 'pl-ren-120', position: 2, is_won: false, name: 'Contacto' },
      { id: 'st-ren-1', pipeline_id: 'pl-ren-120', position: 1, is_won: false, name: 'Pendiente' },
      { id: 'st-121', pipeline_id: 'pl-ren-121', position: 1, is_won: false, name: 'Pendiente' },
    ],
    opportunities: [
      { id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1200, currency: 'COP', salesperson_id: 'seller-1', billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null },
      { id: 'won-b', organization_id: ORG, status: 'won', customer_id: 'cust-b', amount: 300, currency: 'COP', salesperson_id: null, billing_cycle_months: 1, closed_at: null, deal_type: 'new', parent_opportunity_id: null },
      { id: 'won-c', organization_id: ORG, status: 'won', customer_id: 'cust-c', amount: 500, currency: 'COP', salesperson_id: null, billing_cycle_months: 3, closed_at: '2026-08-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null },
      { id: 'ren-c', organization_id: ORG, status: 'open', customer_id: 'cust-c', amount: 500, currency: 'COP', pipeline_id: 'pl-ren-120', stage_id: 'st-ren-1', deal_type: 'renewal', parent_opportunity_id: 'won-c', next_contact_at: '2026-01-01T00:00:00Z' },
      // hija de onboarding del mismo contrato (misma org): NO es una renovación y no debe bloquear la idempotencia
      { id: 'onb-a', organization_id: ORG, status: 'open', customer_id: 'cust-a', pipeline_id: 'pl-onb-120', stage_id: 'st-onb-1', deal_type: null, parent_opportunity_id: 'won-a', metadata: { type: 'onboarding' } },
      { id: 'won-121', organization_id: DECOY, status: 'won', customer_id: 'cust-121', amount: 9999, currency: 'COP', salesperson_id: null, billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null },
      { id: 'ren-121', organization_id: DECOY, status: 'open', customer_id: 'cust-121', pipeline_id: 'pl-ren-121', stage_id: 'st-121', deal_type: 'renewal', parent_opportunity_id: 'won-a', next_contact_at: null },
    ],
    tasks: [
      { id: 't-c-1', organization_id: ORG, related_to_id: 'ren-c', related_to_type: 'opportunity', due_date: '2026-10-02T00:00:00Z', status: 'open' },
      { id: 't-c-2', organization_id: ORG, related_to_id: 'ren-c', related_to_type: 'opportunity', due_date: '2026-09-02T00:00:00Z', status: 'open' },
    ],
    customers: [
      { id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' },
      { id: 'cust-c', organization_id: ORG, full_name: 'Cliente C' },
      { id: 'cust-121', organization_id: DECOY, full_name: 'Señuelo' },
    ],
    sequences: [
      { id: 'seq-121', organization_id: DECOY, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null },
    ],
  });
}

const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('scheduleRenewal', () => {
  it('crea UNA oportunidad renewal en la primera etapa (por position) + hitos futuros como tareas open', async () => {
    const db = fixtures();
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW, timezone: 'America/Bogota' });
    expect(r.already_existed).toBe(false); // la hija de onboarding (onb-a, parent won-a) no cuenta como renovación
    expect(r.renewal_opportunity_id).not.toBe('onb-a');
    const opp = writesTo(db, 'opportunities', 'insert');
    expect(opp).toHaveLength(1);
    expect(opp[0].rows[0]).toMatchObject({
      organization_id: ORG, pipeline_id: 'pl-ren-120', stage_id: 'st-ren-1', deal_type: 'renewal', parent_opportunity_id: 'won-a',
      customer_id: 'cust-a', amount: 1200, status: 'open', billing_cycle_months: 12, salesperson_id: 'seller-1',
      expected_close_date: '2027-08-31', // 2027-09-01T00:00Z es 31 de agosto a las 19:00 en Bogotá
      next_contact_at: '2027-05-04T00:00:00.000Z', // 120 días antes
    });
    expect(String(opp[0].rows[0].name)).toMatch(/Cliente A/);
    const tasks = writesTo(db, 'tasks', 'insert');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].rows).toHaveLength(6);
    expect(tasks[0].rows[0]).toMatchObject({ organization_id: ORG, related_to_type: 'opportunity', status: 'open', type: 'renewal_milestone', assigned_to: 'seller-1', customer_id: 'cust-a' });
    expect(tasks[0].rows.map((t) => t.title)).toEqual([120, 90, 60, 30, 15, 7].map((d) => `Contacto de renovación — ${d} días antes del vencimiento`));
    expect(r.tasks_created).toBe(6);
    expect(r.next_contact_at).toBe('2027-05-04T00:00:00.000Z');
  });

  it('closed_at null → RenewalPlanError con mensaje claro y sin escrituras', async () => {
    const db = fixtures();
    await expect(scheduleRenewal(ORG, 'won-b', 1, sb(db), { now: NOW })).rejects.toThrow(RenewalPlanError);
    await expect(scheduleRenewal(ORG, 'won-b', 1, sb(db), { now: NOW })).rejects.toThrow(/closed_at/);
    expect(db.writes).toHaveLength(0);
  });

  it('idempotente: la renovación de won-c ya existe → no crea otra ni tareas; refresca next_contact_at desde las tareas', async () => {
    const db = fixtures();
    const r = await scheduleRenewal(ORG, 'won-c', 3, sb(db), { now: NOW });
    expect(r.already_existed).toBe(true);
    expect(r.renewal_opportunity_id).toBe('ren-c');
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(0);
    expect(writesTo(db, 'tasks', 'insert')).toHaveLength(0);
    const upd = writesTo(db, 'opportunities', 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].filters).toMatchObject({ id: 'ren-c', organization_id: ORG });
    expect(upd[0].rows[0]).toEqual({ next_contact_at: '2026-10-02T00:00:00.000Z' });
  });

  it('hitos ya vencidos no se crean (vence en 20 días → 15 y 7)', async () => {
    const db = fixtures();
    db.rows.opportunities.push({ id: 'won-d', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1, currency: 'COP', billing_cycle_months: 1, closed_at: '2026-09-05T12:00:00Z', deal_type: 'new', parent_opportunity_id: null });
    const r = await scheduleRenewal(ORG, 'won-d', 1, sb(db), { now: NOW });
    expect(r.tasks_created).toBe(2);
    expect(writesTo(db, 'tasks', 'insert')[0].rows.map((t) => t.title)).toEqual([15, 7].map((d) => `Contacto de renovación — ${d} días antes del vencimiento`));
  });

  it('aislamiento: la oportunidad del señuelo (121) no es visible desde la org 120; y ren-121 (parent won-a de otra org) no cuenta como existente', async () => {
    const db = fixtures();
    await expect(scheduleRenewal(ORG, 'won-121', 12, sb(db), { now: NOW })).rejects.toThrow(/no encontrada/);
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    expect(r.already_existed).toBe(false);
  });

  it('secuencia de renovación (F8): solo se inscribe si la org tiene una secuencia activa marcada; el señuelo de 121 no cuenta', async () => {
    const db = fixtures();
    await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    expect(enrollInSequence).not.toHaveBeenCalled();

    db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    db.rows.opportunities.push({ id: 'won-e', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 1, currency: 'COP', billing_cycle_months: 12, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new', parent_opportunity_id: null });
    const r = await scheduleRenewal(ORG, 'won-e', 12, sb(db), { now: NOW });
    expect(enrollInSequence).toHaveBeenCalledTimes(1);
    expect((enrollInSequence as jest.Mock).mock.calls[0].slice(0, 3)).toEqual([ORG, 'seq-120', r.renewal_opportunity_id]);
    expect((enrollInSequence as jest.Mock).mock.calls[0][4]).toMatchObject({ customerId: 'cust-a', source: 'renewal' });
    expect(r.sequence_enrollment_id).toBe('enr-seq-120');
  });

  it('si la secuencia falla, la renovación ya creada se conserva y el error queda en el resultado', async () => {
    const db = fixtures();
    db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    (enrollInSequence as jest.Mock).mockRejectedValueOnce(new Error('rpc caída'));
    const r = await scheduleRenewal(ORG, 'won-a', 12, sb(db), { now: NOW });
    expect(r.already_existed).toBe(false);
    expect(r.sequence_enrollment_id).toBeNull();
    expect(r.sequence_error).toMatch(/rpc caída/);
  });
});

describe('syncRenewalsForOrg', () => {
  it('recorre las ganadas con ciclo de la org: crea won-a, actualiza ren-c, reporta won-b (closed_at null) sin tumbar el resto; nunca toca la 121', async () => {
    const db = fixtures();
    const r = await syncRenewalsForOrg(ORG, sb(db), { now: NOW, timezone: 'UTC' });
    expect(r).toMatchObject({ org_id: ORG, scanned: 3, created: 1, updated: 1, errors: [expect.stringMatching(/won-b.*closed_at/)] });
    const inserted = writesTo(db, 'opportunities', 'insert');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].rows[0]).toMatchObject({ organization_id: ORG, parent_opportunity_id: 'won-a' });
    for (const w of db.writes) {
      const org = w.op === 'insert' ? w.rows[0].organization_id : w.filters.organization_id;
      expect(org).toBe(ORG);
    }
  });

  it('segunda pasada: idempotente (0 creadas, 0 actualizadas si nada cambió)', async () => {
    const db = fixtures();
    await syncRenewalsForOrg(ORG, sb(db), { now: NOW, timezone: 'UTC' });
    const before = db.writes.length;
    const r = await syncRenewalsForOrg(ORG, sb(db), { now: NOW, timezone: 'UTC' });
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(db.writes.length).toBe(before);
  });

  it('sin pipeline de renovación lo crea con sus etapas (is_won/is_lost) y sigue', async () => {
    const db = fixtures();
    db.rows.pipelines = db.rows.pipelines.filter((p) => p.organization_id !== ORG);
    const r = await syncRenewalsForOrg(ORG, sb(db), { now: NOW, timezone: 'UTC' });
    expect(r.created).toBe(1);
    const pl = writesTo(db, 'pipelines', 'insert');
    expect(pl).toHaveLength(1);
    expect(pl[0].rows[0]).toMatchObject({ organization_id: ORG, pipeline_type: 'renewal' });
    const st = writesTo(db, 'stages', 'insert')[0].rows;
    expect(st.filter((s) => s.is_won)).toHaveLength(1);
    expect(st.filter((s) => s.is_lost)).toHaveLength(1);
  });

  it('error de lectura → resultado con error, sin lanzar', async () => {
    const db = fixtures();
    db.nextReadError = { table: 'opportunities', error: { code: '57014', message: 'timeout' } };
    const r = await syncRenewalsForOrg(ORG, sb(db), { now: NOW, timezone: 'UTC' });
    expect(r.errors[0]).toMatch(/timeout/);
    expect(r.created).toBe(0);
  });
});
