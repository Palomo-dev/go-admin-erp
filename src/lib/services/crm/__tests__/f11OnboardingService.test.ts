/// <reference types="jest" />
/**
 * F11 — onboarding server-side sobre el doble con señuelos de la org 121:
 * instancia + pasos desde la plantilla real, idempotencia, completar solo con
 * todos los pasos, etapa ganada por `is_won`, y la función que F10 invoca al
 * ganar: `startOnboardingForWonOpportunity(orgId, opportunityId, supabase)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));

import {
  completeOnboardingInstance,
  createOnboardingInstance,
  findOnboardingPipelineId,
  OnboardingIncompleteError,
  OnboardingPipelineError,
  startOnboardingForWonOpportunity,
  updateOnboardingInstanceStatus,
  updateOnboardingStep,
} from '../onboardingService';

const NOW = new Date('2026-09-15T15:00:00Z');
const ORG = 120;
const DECOY = ORG + 1;

const REAL_STEPS = [
  { day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff y objetivos' },
  { day: 2, key: 'config', owner: 'cs', title: 'Configuración inicial' },
  { day: 30, key: 'br30', owner: 'vendor', title: 'Business review día 30' },
];

function fixtures(): FakeDb {
  return makeDb({
    onboarding_templates: [
      { id: 'tpl-121', organization_id: DECOY, name: 'Aaa señuelo', steps: [{ day: 0, title: 'Señuelo' }], default_duration_days: 30, is_active: true },
      { id: 'tpl-inactiva', organization_id: ORG, name: 'Antigua', steps: REAL_STEPS, default_duration_days: 30, is_active: false },
      { id: 'tpl-120', organization_id: ORG, name: 'Onboarding estándar 30 días', steps: REAL_STEPS, default_duration_days: 30, is_active: true },
    ],
    pipelines: [
      { id: 'pl-onb-120', organization_id: ORG, pipeline_type: 'onboarding', name: 'Onboarding' },
      { id: 'pl-onb-121', organization_id: DECOY, pipeline_type: 'onboarding', name: 'Onboarding' },
    ],
    stages: [
      { id: 'st-onb-3', pipeline_id: 'pl-onb-120', position: 3, is_won: true, name: 'Cierre' },
      { id: 'st-onb-1', pipeline_id: 'pl-onb-120', position: 1, is_won: false, name: 'Ganado' },
      { id: 'st-onb-2', pipeline_id: 'pl-onb-120', position: 2, is_won: false, name: 'Capacitación' },
      { id: 'st-121', pipeline_id: 'pl-onb-121', position: 1, is_won: true, name: 'x' },
    ],
    opportunities: [
      { id: 'won-a', organization_id: ORG, status: 'won', customer_id: 'cust-a', salesperson_id: 'seller-1', parent_opportunity_id: null, pipeline_id: 'pl-sales', stage_id: 'st-sales-won', metadata: null },
      { id: 'open-b', organization_id: ORG, status: 'open', customer_id: 'cust-b', parent_opportunity_id: null, pipeline_id: 'pl-sales', stage_id: 'st-1', metadata: null },
      { id: 'onb-c', organization_id: ORG, status: 'open', customer_id: 'cust-c', parent_opportunity_id: 'won-c', pipeline_id: 'pl-onb-120', stage_id: 'st-onb-1', metadata: { type: 'onboarding' } },
      { id: 'won-121', organization_id: DECOY, status: 'won', customer_id: 'cust-121', parent_opportunity_id: null, pipeline_id: 'pl-121', stage_id: 'st-121', metadata: null },
    ],
    onboarding_instances: [
      { id: 'inst-121', organization_id: DECOY, template_id: 'tpl-121', opportunity_id: 'onb-c', customer_id: 'cust-121', status: 'active', started_at: '2026-09-01T00:00:00Z', completed_at: null },
    ],
    onboarding_steps: [
      { id: 'step-121', organization_id: DECOY, instance_id: 'inst-121', step_number: 1, name: 'Señuelo', is_completed: false, completed_at: null, completed_by: null, notes: null },
    ],
    customers: [
      { id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' },
      { id: 'cust-c', organization_id: ORG, full_name: 'Cliente C' },
    ],
  });
}

const sb = (db: FakeDb) => createFakeSupabase(db) as unknown as SupabaseClient;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('createOnboardingInstance', () => {
  it('sin template_id usa la plantilla activa por defecto de la org (nunca la del señuelo ni la inactiva) y crea instancia + pasos con due_date', async () => {
    const db = fixtures();
    const inst = await createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW });
    expect(inst).not.toBeNull();
    expect(inst!.template_id).toBe('tpl-120');
    const ins = writesTo(db, 'onboarding_instances', 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].rows[0]).toMatchObject({ organization_id: ORG, opportunity_id: 'onb-c', customer_id: 'cust-c', parent_opportunity_id: 'won-c', status: 'active' });
    expect(ins[0].rows[0]).not.toHaveProperty('updated_at');
    const steps = writesTo(db, 'onboarding_steps', 'insert')[0].rows;
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ organization_id: ORG, step_number: 1, name: 'Kickoff y objetivos', due_date: '2026-09-15T15:00:00.000Z', is_completed: false });
    expect(steps[2]).toMatchObject({ step_number: 3, due_date: '2026-10-15T15:00:00.000Z' });
    expect(inst!.steps).toHaveLength(3);
    expect(inst!.already_existed).toBe(false);
  });

  it('idempotente por oportunidad: una segunda llamada devuelve la instancia existente sin crear pasos', async () => {
    const db = fixtures();
    const a = await createOnboardingInstance(ORG, 'onb-c', 'tpl-120', sb(db), { now: NOW });
    const b = await createOnboardingInstance(ORG, 'onb-c', 'tpl-120', sb(db), { now: NOW });
    expect(b!.id).toBe(a!.id);
    expect(b!.already_existed).toBe(true);
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_steps', 'insert')).toHaveLength(1);
  });

  it('template_id de otra organización → null (no se lee cross-tenant)', async () => {
    const db = fixtures();
    expect(await createOnboardingInstance(ORG, 'onb-c', 'tpl-121', sb(db), { now: NOW })).toBeNull();
    expect(db.writes).toHaveLength(0);
  });

  it('sin plantilla activa en la org → lanza con mensaje claro', async () => {
    const db = fixtures();
    db.rows.onboarding_templates = db.rows.onboarding_templates.filter((t) => t.id !== 'tpl-120');
    await expect(createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW })).rejects.toThrow(/plantilla/);
  });
});

describe('updateOnboardingStep', () => {
  it('completa con completed_at/completed_by, filtra por org e instancia, y NO escribe updated_at (la tabla no la tiene)', async () => {
    const db = fixtures();
    const inst = (await createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW }))!;
    const stepId = inst.steps[0].id;
    const r = await updateOnboardingStep(stepId, ORG, { is_completed: true, completed_by: 'user-9' }, sb(db), { instanceId: inst.id, now: NOW });
    expect(r).toMatchObject({ id: stepId, is_completed: true, completed_by: 'user-9', completed_at: NOW.toISOString() });
    const upd = writesTo(db, 'onboarding_steps', 'update')[0];
    expect(upd.filters).toMatchObject({ id: stepId, organization_id: ORG, instance_id: inst.id });
    expect(upd.rows[0]).not.toHaveProperty('updated_at');
    const undo = await updateOnboardingStep(stepId, ORG, { is_completed: false }, sb(db), { instanceId: inst.id, now: NOW });
    expect(undo).toMatchObject({ is_completed: false, completed_at: null, completed_by: null });
  });
  it('un step del señuelo no es alcanzable desde la org 120', async () => {
    const db = fixtures();
    expect(await updateOnboardingStep('step-121', ORG, { is_completed: true }, sb(db), { now: NOW })).toBeNull();
    expect(db.rows.onboarding_steps[0].is_completed).toBe(false);
  });
});

describe('completeOnboardingInstance', () => {
  it('con pasos pendientes → OnboardingIncompleteError y sin escrituras', async () => {
    const db = fixtures();
    const inst = (await createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW }))!;
    const before = db.writes.length;
    await expect(completeOnboardingInstance(inst.id, ORG, sb(db), { now: NOW })).rejects.toThrow(OnboardingIncompleteError);
    expect(db.writes.length).toBe(before);
  });
  it('con todos los pasos hechos: status completed + completed_at y mueve la oportunidad a la etapa is_won (no por nombre "Ganado")', async () => {
    const db = fixtures();
    const inst = (await createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW }))!;
    for (const s of db.rows.onboarding_steps) if (s.organization_id === ORG) s.is_completed = true;
    const r = await completeOnboardingInstance(inst.id, ORG, sb(db), { now: NOW });
    expect(r).toMatchObject({ id: inst.id, status: 'completed', completed_at: NOW.toISOString() });
    const instUpd = writesTo(db, 'onboarding_instances', 'update')[0];
    expect(instUpd.filters).toMatchObject({ id: inst.id, organization_id: ORG });
    expect(instUpd.rows[0]).not.toHaveProperty('updated_at');
    const oppUpd = writesTo(db, 'opportunities', 'update')[0];
    expect(oppUpd.filters).toMatchObject({ id: 'onb-c', organization_id: ORG });
    expect(oppUpd.rows[0]).toEqual({ stage_id: 'st-onb-3' });
  });
  it('updateOnboardingInstanceStatus("completed") pasa por la misma regla', async () => {
    const db = fixtures();
    const inst = (await createOnboardingInstance(ORG, 'onb-c', null, sb(db), { now: NOW }))!;
    await expect(updateOnboardingInstanceStatus(inst.id, ORG, 'completed', sb(db), { now: NOW })).rejects.toThrow(OnboardingIncompleteError);
    const r = await updateOnboardingInstanceStatus(inst.id, ORG, 'at_risk', sb(db), { now: NOW });
    expect(r).toMatchObject({ status: 'at_risk' });
  });
  it('instancia del señuelo → null', async () => {
    const db = fixtures();
    await expect(completeOnboardingInstance('inst-121', ORG, sb(db), { now: NOW })).rejects.toThrow(/no encontrada/);
  });
});

describe('startOnboardingForWonOpportunity — firma para F10', () => {
  it('crea la oportunidad hija en la primera etapa del pipeline onboarding + instancia + pasos; idempotente', async () => {
    const db = fixtures();
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW });
    expect(r.already_existed).toBe(false);
    const child = writesTo(db, 'opportunities', 'insert')[0].rows[0];
    expect(child).toMatchObject({ organization_id: ORG, pipeline_id: 'pl-onb-120', stage_id: 'st-onb-1', customer_id: 'cust-a', parent_opportunity_id: 'won-a', status: 'open', amount: 0, salesperson_id: 'seller-1', metadata: { type: 'onboarding', parent_opportunity_id: 'won-a' } });
    expect(String(child.name)).toMatch(/Cliente A/);
    const childId = db.rows.opportunities.find((o) => o.parent_opportunity_id === 'won-a' && o.pipeline_id === 'pl-onb-120')!.id;
    expect(r.onboarding_opportunity_id).toBe(childId);
    expect(r.instance_id).toBeTruthy();
    expect(r.steps_created).toBe(3);

    const again = await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW });
    expect(again).toMatchObject({ already_existed: true, onboarding_opportunity_id: childId, instance_id: r.instance_id, steps_created: 0 });
    expect(writesTo(db, 'opportunities', 'insert')).toHaveLength(1);
    expect(writesTo(db, 'onboarding_instances', 'insert')).toHaveLength(1);
  });
  it('rechaza oportunidades no ganadas y las de otra organización', async () => {
    const db = fixtures();
    await expect(startOnboardingForWonOpportunity(ORG, 'open-b', sb(db), { now: NOW })).rejects.toThrow(/ganada/);
    await expect(startOnboardingForWonOpportunity(ORG, 'won-121', sb(db), { now: NOW })).rejects.toThrow(/no encontrada/);
    expect(db.writes).toHaveLength(0);
  });
  it('sin pipeline de onboarding lo crea con 7 etapas y la última is_won', async () => {
    const db = fixtures();
    db.rows.pipelines = db.rows.pipelines.filter((p) => p.organization_id !== ORG);
    const r = await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW });
    expect(r.already_existed).toBe(false);
    const st = writesTo(db, 'stages', 'insert')[0].rows;
    expect(st).toHaveLength(7);
    expect(st.filter((s) => s.is_won).map((s) => s.position)).toEqual([7]);
    expect(writesTo(db, 'pipelines', 'insert')[0].rows[0]).toMatchObject({ organization_id: ORG, pipeline_type: 'onboarding' });
  });
  it('deuda D1: branchId y createdBy viajan a la hija; sin ellos no se escriben (retrocompatible)', async () => {
    const db = fixtures();
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW, branchId: 7, createdBy: 'u-owner' });
    expect(writesTo(db, 'opportunities', 'insert')[0].rows[0]).toMatchObject({ branch_id: 7, created_by: 'u-owner', metadata: { type: 'onboarding' } });
    const db2 = fixtures();
    await startOnboardingForWonOpportunity(ORG, 'won-a', sb(db2), { now: NOW });
    const child = writesTo(db2, 'opportunities', 'insert')[0].rows[0];
    expect('branch_id' in child).toBe(false);
    expect('created_by' in child).toBe(false);
  });
  it('deuda D1: pipeline sin etapas → OnboardingPipelineError(no_stages) sin escrituras; findOnboardingPipelineId no crea nada', async () => {
    const db = fixtures();
    db.rows.stages = db.rows.stages.filter((s) => s.pipeline_id !== 'pl-onb-120');
    await expect(startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW })).rejects.toBeInstanceOf(OnboardingPipelineError);
    await expect(startOnboardingForWonOpportunity(ORG, 'won-a', sb(db), { now: NOW })).rejects.toMatchObject({ reason: 'no_stages' });
    expect(db.writes).toHaveLength(0);
    expect(await findOnboardingPipelineId(ORG, sb(db))).toBe('pl-onb-120');
    expect(await findOnboardingPipelineId(999, sb(db))).toBeNull();
    expect(db.writes).toHaveLength(0);
  });
});
