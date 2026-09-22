/// <reference types="jest" />
/**
 * Deuda D1/D2 — los pasos «onboarding» y «renovación» del cierre «al ganar»
 * (`wonCloseSteps.ts`) delegan en F11 (`startOnboardingForWonOpportunity`,
 * `scheduleRenewal`) en vez de crear a mano la hija y los 12 hitos. Cubre:
 * delegación con los argumentos correctos, segunda ejecución idempotente
 * (lectura previa y 23505 de los índices únicos parciales), ciclo de 1 mes
 * sin hitos en el pasado, mensajes de omisión intactos y `metadata.renewal_date`
 * del padre. Fixtures sin datos reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn() }));

import { executeOnboarding, executeRenewal, type OpportunityData, type WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';
import { OnboardingPipelineError } from '@/lib/services/crm/onboardingService';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: FakeDb;
const NOW = new Date('2026-09-15T15:00:00.000Z');
const STEPS = [{ day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff' }, { day: 7, key: 'config', owner: 'cs', title: 'Configuración' }];

const opp: OpportunityData = {
  id: 'op-1', name: 'Plan anual', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller',
  pipeline_id: 'pipe-1', stage_id: 'st-won', billing_cycle_months: 1, metadata: { foo: 'bar' }, created_by: 'u-owner',
};

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      opportunities: [
        { id: 'op-1', organization_id: 120, name: 'Plan anual', status: 'won', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller', billing_cycle_months: 1, closed_at: null, metadata: { foo: 'bar' } },
        { id: 'op-1', organization_id: 121, name: 'Señuelo', status: 'won', customer_id: 'c-9', amount: 5, currency: 'COP', salesperson_id: null, billing_cycle_months: 1, closed_at: null, metadata: null },
      ],
      pipelines: [{ id: 'p-onb', organization_id: 120, pipeline_type: 'onboarding' }, { id: 'p-onb-121', organization_id: 121, pipeline_type: 'onboarding' }, { id: 'p-ren', organization_id: 120, pipeline_type: 'renewal' }],
      stages: [{ id: 's-onb-2', pipeline_id: 'p-onb', position: 2 }, { id: 's-onb-1', pipeline_id: 'p-onb', position: 1 }, { id: 's-ren-1', pipeline_id: 'p-ren', position: 1 }],
      onboarding_templates: [
        { id: 'tpl-121', organization_id: 121, name: 'Señuelo', steps: STEPS, default_duration_days: 30, is_active: true },
        { id: 'tpl-120', organization_id: 120, name: 'Estándar', steps: STEPS, default_duration_days: 30, is_active: true },
      ],
      onboarding_instances: [], onboarding_steps: [], customers: [{ id: 'c-1', organization_id: 120, full_name: 'Cliente Uno' }], tasks: [], sequences: [],
    },
  };
}

type Sb = WonCloseDeps['supabase'];
const sb = (): Sb => createFakeSupabase(db) as unknown as Sb;

/** Simula la carrera: el INSERT en `table` deja la fila del «ganador» y responde 23505 del índice único parcial. */
function racingClient(table: string, constraint: string): Sb {
  const base = createFakeSupabase(db);
  return {
    ...base,
    from: (t: string) => {
      const chain = base.from(t) as Record<string, unknown>;
      if (t === table) {
        const insert = chain.insert as (row: Row) => unknown;
        chain.insert = (row: Row) => {
          (db.rows[table] ??= []).push({ id: `raced-${table}`, ...row });
          db.nextWriteError = { table, error: { code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` } };
          return insert(row);
        };
      }
      return chain;
    },
  } as unknown as Sb;
}

function deps(over: Partial<WonCloseDeps> = {}): WonCloseDeps {
  return {
    supabase: sb(), orgId: 120, contextBranchId: 7, timezone: 'America/Bogota', now: () => new Date(NOW),
    getLatestProposal: async () => ({ id: 'q-1', branch_id: 3 }), convertToInvoice: async () => 'inv-1', accrueCommission: async () => null,
    ...over,
  };
}

const children = () => db.rows.opportunities.filter((o) => o.parent_opportunity_id === 'op-1' && o.organization_id === 120);
const milestones = () => db.rows.tasks.filter((t) => t.type === 'renewal_milestone');

beforeEach(() => { db = seed(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('D1 onboarding delega en F11', () => {
  it('llama a startOnboardingForWonOpportunity con org del contexto, id, cliente inyectado, now, sucursal y created_by; resume con la hija y los pasos', async () => {
    const start = jest.fn(async () => ({ onboarding_opportunity_id: 'child-12345678', instance_id: 'inst-1', steps_created: 2, already_existed: false }));
    const d = deps({ startOnboarding: start });
    expect(await executeOnboarding(opp, d)).toBe('Onboarding creado: child-12 (2 pasos)');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]).toEqual([120, 'op-1', d.supabase, { now: NOW, branchId: 7, createdBy: 'u-owner' }]);
    expect(db.writes.filter((w) => w.table === 'opportunities')).toEqual([]);
  });

  it('sin sucursal de contexto usa la de la propuesta', async () => {
    const start = jest.fn(async () => ({ onboarding_opportunity_id: 'child-1', instance_id: 'i', steps_created: 0, already_existed: false }));
    await executeOnboarding(opp, deps({ startOnboarding: start, contextBranchId: null }));
    expect((start.mock.calls[0] as unknown[])[3]).toMatchObject({ branchId: 3 });
  });

  it('dos ejecuciones (modal reabierto) → UNA hija con metadata.type=onboarding y branch_id, UNA instancia con pasos; la segunda informa «ya existía» sin lanzar', async () => {
    const first = await executeOnboarding(opp, deps());
    expect(first).toMatch(/^Onboarding creado: new-oppo \(2 pasos\)$/);
    const second = await executeOnboarding(opp, deps());
    expect(second).toMatch(/^Onboarding ya existía: new-oppo — no se duplicó$/);
    expect(children()).toHaveLength(1);
    expect(children()[0]).toMatchObject({ organization_id: 120, pipeline_id: 'p-onb', stage_id: 's-onb-1', branch_id: 7, created_by: 'u-owner', customer_id: 'c-1', metadata: { type: 'onboarding' } });
    expect(db.rows.onboarding_instances).toHaveLength(1);
    expect(db.rows.onboarding_instances[0]).toMatchObject({ organization_id: 120, template_id: 'tpl-120', opportunity_id: children()[0].id });
    expect(db.rows.onboarding_steps).toHaveLength(2);
  });

  it('23505 del índice uq_opportunities_one_onboarding_child_per_parent → «ya existía», sin lanzar y sin segunda hija', async () => {
    const out = await executeOnboarding(opp, deps({ supabase: racingClient('opportunities', 'uq_opportunities_one_onboarding_child_per_parent') }));
    expect(out).toMatch(/raced-op.*no se duplicó|Onboarding creado: raced-op/);
    expect(children()).toHaveLength(1);
    expect(db.rows.onboarding_instances).toHaveLength(1);
  });

  it('mensajes de omisión intactos: sin pipeline, sin etapas, sin cliente; sin sucursal lanza; nada escrito y F11 no se invoca', async () => {
    const start = jest.fn();
    db.rows.pipelines = db.rows.pipelines.filter((p) => p.organization_id !== 120);
    expect(await executeOnboarding(opp, deps({ startOnboarding: start }))).toBe('Sin pipeline de onboarding — se omitió oportunidad hija');
    db = seed();
    db.rows.stages = db.rows.stages.filter((s) => s.pipeline_id !== 'p-onb');
    expect(await executeOnboarding(opp, deps())).toBe('Sin etapas en pipeline de onboarding — se omitió');
    expect(db.writes).toEqual([]);
    db = seed();
    expect(await executeOnboarding({ ...opp, customer_id: null }, deps({ startOnboarding: start }))).toBe('Sin cliente — se omitió onboarding');
    await expect(executeOnboarding(opp, deps({ startOnboarding: start, contextBranchId: null, getLatestProposal: async () => null }))).rejects.toThrow(/selecciona una sucursal concreta/);
    await expect(executeOnboarding(opp, deps({ startOnboarding: start, orgId: 0 }))).rejects.toThrow('Organización no válida');
    expect(start).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it('OnboardingPipelineError de F11 (pipeline sin etapas) se traduce a omisión; cualquier otro error sube', async () => {
    expect(await executeOnboarding(opp, deps({ startOnboarding: async () => { throw new OnboardingPipelineError('no_stages', 'x'); } }))).toBe('Sin etapas en pipeline de onboarding — se omitió');
    await expect(executeOnboarding(opp, deps({ startOnboarding: async () => { throw new Error('startOnboarding: la oportunidad no está ganada'); } }))).rejects.toThrow(/no está ganada/);
  });
});

describe('D2 renovación delega en F11', () => {
  it('llama a scheduleRenewal con org, id, ciclo, cliente, now, timezone, closedAtFallback=now, branchId del contexto y createdBy; nunca con `enroll` (navegador); actualiza metadata.renewal_date del padre solo en la org 120', async () => {
    const schedule = jest.fn(async () => ({ renewal_opportunity_id: 'ren-1', parent_opportunity_id: 'op-1', customer_id: 'c-1', renewal_date: '2026-10-15T15:00:00.000Z', next_contact_at: null, tasks_created: 2, already_existed: false, updated: false, sequence_enrollment_id: null, sequence_error: null }));
    const d = deps({ scheduleRenewal: schedule });
    expect(await executeRenewal(opp, d)).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    expect(schedule.mock.calls[0]).toEqual([120, 'op-1', 1, d.supabase, { now: NOW, timezone: 'America/Bogota', closedAtFallback: NOW, branchId: 7, createdBy: 'u-owner' }]);
    expect(Object.keys((schedule.mock.calls[0] as unknown[])[4] as object)).not.toContain('enroll');
    const upd = db.writes.filter((w) => w.table === 'opportunities' && w.op === 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].filters).toMatchObject({ id: 'op-1', organization_id: 120 });
    expect(upd[0].row).toMatchObject({ metadata: { foo: 'bar', billing_cycle_months: 1, renewal_date: '2026-10-15T15:00:00.000Z' } });
    expect(db.rows.opportunities[1].metadata).toBeNull();
    expect(db.writes.filter((w) => w.table === 'tasks')).toEqual([]);
    // modo «Todas» (sin sucursal de contexto): branchId null y F11 hereda la del contrato padre
    await executeRenewal(opp, deps({ scheduleRenewal: schedule, contextBranchId: null }));
    expect((schedule.mock.calls[1] as unknown[])[4]).toMatchObject({ branchId: null, createdBy: 'u-owner' });
  });

  it('ciclo de 1 mes, dos ejecuciones → UNA renovación, solo hitos futuros (15 y 7), ninguno en el pasado; la segunda informa «ya programada» sin lanzar', async () => {
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    expect(await executeRenewal(opp, deps())).toBe('Renovación ya programada (15/10/2026) — no se duplicó');
    const renewals = db.rows.opportunities.filter((o) => o.deal_type === 'renewal' && o.parent_opportunity_id === 'op-1');
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ organization_id: 120, pipeline_id: 'p-ren', stage_id: 's-ren-1', customer_id: 'c-1' });
    expect(milestones()).toHaveLength(2);
    for (const t of milestones()) expect(Date.parse(String(t.due_date))).toBeGreaterThan(NOW.getTime());
    expect(milestones().map((t) => t.due_date)).toEqual(['2026-09-30T15:00:00.000Z', '2026-10-08T15:00:00.000Z']);
    expect(db.rows.tasks.filter((t) => t.type === 'renovacion')).toHaveLength(0);
    expect(db.rows.opportunities[0].metadata).toMatchObject({ renewal_date: '2026-10-15T15:00:00.000Z', billing_cycle_months: 1 });
  });

  it('con closed_at real en la BD se respeta (no se usa el fallback)', async () => {
    db.rows.opportunities[0].closed_at = '2026-09-01T15:00:00.000Z';
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 01/10/2026)');
  });

  it('23505 del índice uq_opportunities_one_renewal_per_parent → «ya programada», sin lanzar y sin hitos duplicados', async () => {
    expect(await executeRenewal(opp, deps({ supabase: racingClient('opportunities', 'uq_opportunities_one_renewal_per_parent') }))).toBe('Renovación ya programada (15/10/2026) — no se duplicó');
    expect(db.rows.opportunities.filter((o) => o.deal_type === 'renewal')).toHaveLength(1);
    expect(milestones()).toHaveLength(0);
  });

  it('mensajes de omisión intactos: sin ciclo y sin cliente; org inválida lanza; nada escrito y F11 no se invoca', async () => {
    const schedule = jest.fn();
    expect(await executeRenewal({ ...opp, billing_cycle_months: null }, deps({ scheduleRenewal: schedule }))).toBe('Sin billing_cycle_months — se omitió renovación');
    expect(await executeRenewal({ ...opp, billing_cycle_months: 0 }, deps({ scheduleRenewal: schedule }))).toBe('Sin billing_cycle_months — se omitió renovación');
    expect(await executeRenewal({ ...opp, customer_id: null }, deps({ scheduleRenewal: schedule }))).toBe('Sin cliente — se omitió renovación');
    await expect(executeRenewal(opp, deps({ scheduleRenewal: schedule, orgId: 0 }))).rejects.toThrow('Organización no válida');
    expect(schedule).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
});

describe('guardia estática: wonCloseSteps no reimplementa lo que F11 sabe hacer', () => {
  it('no inserta oportunidades ni tareas «renovacion» ni recorre hitos a mano', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/crm/wonCloseSteps.ts'), 'utf8');
    expect(src).not.toMatch(/type: 'renovacion'/);
    expect(src).not.toMatch(/parent_opportunity_id: opp\.id/);
    expect(src).not.toMatch(/RENEWAL_MILESTONES/);
    expect(src).toMatch(/startOnboardingForWonOpportunity/);
    expect(src).toMatch(/scheduleRenewal/);
    // de tester D1/D2 (guardas estáticas, regla dura 7): ni la hija, ni los hitos, ni la renovación, ni aritmética de meses a mano
    expect(src).not.toMatch(/deal_type: 'renewal'/);
    expect(src).not.toMatch(/type: 'onboarding'/);
    expect(src).not.toMatch(/type: 'renewal_milestone'/);
    expect(src).not.toMatch(/setMonth\(/);
  });
});
