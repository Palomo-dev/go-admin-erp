/**
 * F8 — automatizaciones y secuencias: fallo del proveedor a mitad de lote (G) y literales/columnas contra el esquema real (H).
 *
 * Origen: suite adversaria de F8 escrita por el tester en ronda 1 (55 casos que
 * afirmaban el defecto) e invertida por el builder para fijar el comportamiento
 * CORRECTO, conservando escenario, datos e identificadores; ampliada en las
 * rondas 2 y 3 (N1–N14). Consolidada el 2026-09-21 desde `f8Adversarial`:
 * el doble de BD fiel vive en `./f8FakeDb.ts`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js';

// `sendEmail` real arrastra Resend + F7 entero: se dobla para contar envíos.
const sendEmailMock = jest.fn();
jest.mock('@/lib/services/crm/emailService', () => ({
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

import {
  executeAutomationRule,
  validateUpdateField,
  UPDATE_FIELD_ALLOWLIST,
} from '@/lib/services/crm/automationService';
import {
  enrollInSequence,
  createSequence,
  processStepRun,
  processPendingStepRuns,
  checkExitConditions,
  resumeEnrollment,
  validateSequenceSteps,
  MAX_DELAY_DAYS,
} from '@/lib/services/crm/sequenceService';
import {
  COLUMNS, CHECKS, OUTBOUND_JOB_KINDS, validateRow, makeDb, ORG, OTHER_ORG, readSrc,
  baseTables, addRule, addSequence, drainQueue, silentLog, fakeEnqueue,
} from './f8FakeDb';

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(async () => ({ id: `email-${Math.random().toString(16).slice(2, 8)}` }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// G. Fallo del proveedor a mitad de un lote
// ═════════════════════════════════════════════════════════════════════════════

describe('G. Fallo del proveedor a mitad de lote', () => {
  function seedBatch() {
    const t = baseTables();
    addSequence(t, [{}]);
    for (let i = 1; i <= 3; i++) {
      t.sequence_enrollments.push({ id: `enr-${i}`, organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
      t.sequence_step_runs.push({ id: `run-${i}`, organization_id: ORG, enrollment_id: `enr-${i}`, step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    }
    return makeDb(t);
  }

  it('G1: el lote continúa tras el fallo del proveedor y el run fallido queda visible con su error', async () => {
    const { client, tables } = seedBatch();
    let n = 0;
    sendEmailMock.mockImplementation(async () => {
      n++;
      if (n === 2) throw new Error('Resend 503');
      return { id: `email-${n}` };
    });
    const r1 = await processPendingStepRuns(ORG, client);
    expect(r1).toEqual({ processed: 3, completed: 2, failed: 1, skipped: 0, reclaimed: 0, errors: 0, first_error: null });
    const r2 = await processPendingStepRuns(ORG, client);
    expect(r2.processed).toBe(0);
    const failed = tables.sequence_step_runs.filter((x: any) => x.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].error_message).toMatch(/Resend 503/);
  });

  it('G2: la inscripción del run fallido no se queda `active` para siempre', async () => {
    const { client, tables } = seedBatch();
    sendEmailMock.mockImplementation(async () => { throw new Error('Resend 503'); });
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_enrollments.every((e: any) => e.status !== 'active')).toBe(true);
  });

  it('G3: un cliente sin email hace fallar el paso con un motivo explícito', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    (t.customers[0] as any).email = null;
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[0].error_message).toBe('Customer no tiene email');
    expect(tables.sequence_enrollments[0].status).not.toBe('active');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H. Escritura contra el esquema REAL
// ═════════════════════════════════════════════════════════════════════════════

describe('H. Literales y columnas contra el esquema real', () => {
  it('H1: la acción create_task escribe `related_to_id` y la tarea se crea', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_task', title: 'T', due_in_days: 2 }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('completed');
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toEqual(expect.objectContaining({
      related_to_id: 'opp-1', related_to_type: 'opportunity', status: 'open', title: 'T',
    }));
  });

  it('H2: el paso `task` de una secuencia crea la tarea y la inscripción avanza', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0].status).toBe('open');
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_enrollments[0].status).toBe('completed');
  });

  it('H2b: los INSERT de tarea comparten un solo helper con el nombre correcto de columna', () => {
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    expect(actions).toMatch(/export async function insertAutomationTask/);
    // Cuerpo del único INSERT en `tasks` de toda la fase.
    const helper = actions.slice(
      actions.indexOf('export async function insertAutomationTask'),
      actions.indexOf('function ownerOf'),
    );
    expect(helper).toMatch(/related_to_id/);
    expect(helper).toMatch(/related_to_type/);
    expect(helper).not.toMatch(/related_id:/);
    // Ni el servicio de reglas ni el de secuencias insertan en `tasks` por su cuenta.
    for (const src of [readSrc('automationService.ts'), readSrc('sequenceService.ts')]) {
      expect(src).not.toMatch(/from\('tasks'\)\s*\.insert/);
    }
  });

  it('H3: las tareas se crean con `status: open` (el CHECK real no admite `pending`)', () => {
    expect(validateRow('tasks', { organization_id: ORG, title: 'T', status: 'pending', related_to_id: 'x', related_to_type: 'opportunity' }))
      .toEqual(expect.objectContaining({ code: '23514' }));
    expect(validateRow('tasks', { organization_id: ORG, title: 'T', status: 'open', related_to_id: 'x', related_to_type: 'opportunity' }))
      .toBeNull();
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    const helper = actions.slice(
      actions.indexOf('export async function insertAutomationTask'),
      actions.indexOf('function ownerOf'),
    );
    expect(helper).toMatch(/status: 'open'/);
    expect(helper).not.toMatch(/status:\s*'pending'/);
  });

  it('H4: create_activity rechaza un activity_type fuera del CHECK antes de escribir', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_activity', activity_type: 'follow_up', notes: 'x' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.activities).toHaveLength(0);
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ code: 'invalid_activity_type' }),
    );
  });

  it('H4b (PASA): con un activity_type válido la actividad se crea', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_activity', activity_type: 'system', notes: 'x' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.activities).toHaveLength(1);
    expect(tables.activities[0].activity_type).toBe('system');
  });

  it('H5: `automation_runs.status` ya admite `skipped` (migración crm_v4_f08_01)', () => {
    expect(CHECKS.automation_runs.status).toContain('skipped');
    expect(validateRow('automation_runs', { organization_id: ORG, automation_rule_id: 'r', trigger_type: 'manual', status: 'skipped' }))
      .toBeNull();
  });

  it('H6: `sequence_steps.channel` sigue sin `ai_call` (pendiente F6); `sequences.trigger_type` ya admite `event`', () => {
    expect(CHECKS.sequence_steps.channel).not.toContain('ai_call');
    expect(CHECKS.sequences.trigger_type).toContain('event');
  });

  it('H7: automation_rules / sequence_* ya tienen las columnas del plan', () => {
    for (const c of ['pipeline_id', 'stage_id', 'event', 'run_once_per_opportunity', 'cooldown_hours', 'version', 'template_key']) {
      expect(COLUMNS.automation_rules).toContain(c);
    }
    for (const c of ['delay_hours', 'next_step_on_true', 'next_step_on_false', 'condition']) {
      expect(COLUMNS.sequence_steps).toContain(c);
    }
    for (const c of ['current_step_id', 'next_run_at', 'paused_reason', 'timezone', 'source']) {
      expect(COLUMNS.sequence_enrollments).toContain(c);
    }
    for (const c of ['opportunity_id', 'event_id', 'actions_plan', 'dry_run', 'rule_version']) {
      expect(COLUMNS.automation_runs).toContain(c);
    }
  });

  it('H8 (PASA): update_field sobre `customers` escribe updated_at — la columna existe', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'update_field', entity: 'customers', entity_id: 'cus-1', field_name: 'lifecycle_stage', field_value: 'customer' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.customers[0].lifecycle_stage).toBe('customer');
  });

  it('H9: el kind `time_events` ya está en el CHECK real; `agent_orchestration` sigue sin estar (F6)', () => {
    expect(OUTBOUND_JOB_KINDS).toContain('time_events');
    expect(OUTBOUND_JOB_KINDS).not.toContain('agent_orchestration');
  });
});

