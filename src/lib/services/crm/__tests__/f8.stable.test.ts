/**
 * F8 — automatizaciones y secuencias: fidelidad del doble (0), concurrencia sobre el mismo step_run (A) e interruptor, idempotencia y run_once de reglas (B).
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

// ═════════════════════════════════════════════════════════════════════════════
// 0. Fidelidad del doble contra el esquema real (si esto falla, nada más vale)
// ═════════════════════════════════════════════════════════════════════════════

describe('0. El doble reproduce el esquema real', () => {
  it('0a: sequence_enrollments.enrolled_at tiene DEFAULT now() y vuelve en el INSERT ... select()', async () => {
    const { client, tables } = makeDb(baseTables());
    const before = Date.now();
    await client.from('sequence_enrollments').insert({ organization_id: ORG, sequence_id: 'seq-1', status: 'active' }).select().single();
    const row = tables.sequence_enrollments[0];
    expect(typeof row.enrolled_at).toBe('string');
    expect(new Date(row.enrolled_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.status).toBe('active');
  });

  it('0b: sequence_steps.delay_days tiene DEFAULT 0 (nunca llega null al cálculo)', async () => {
    const { client, tables } = makeDb(baseTables());
    await client.from('sequence_steps').insert({ organization_id: ORG, sequence_id: 'seq-1', step_number: 1, channel: 'email' });
    expect(tables.sequence_steps[0].delay_days).toBe(0);
  });

  it('0c: NOT NULL sin default -> 23502 (sequence_step_runs.scheduled_at)', async () => {
    const { client } = makeDb(baseTables());
    const { error } = await client.from('sequence_step_runs').insert({ organization_id: ORG, enrollment_id: 'e', step_id: 's' });
    expect(error).toEqual(expect.objectContaining({ code: '23502' }));
  });

  it('0d: el canal `task` SÍ está permitido por sequence_steps_channel_check', () => {
    expect(CHECKS.sequence_steps.channel).toContain('task');
    expect(validateRow('sequence_steps', { organization_id: ORG, sequence_id: 's', step_number: 1, channel: 'task' })).toBeNull();
    expect(validateRow('sequence_steps', { organization_id: ORG, sequence_id: 's', step_number: 1, channel: 'ai_call' }))
      .toEqual(expect.objectContaining({ code: '23514' }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A. Dos trabajadores reclamando el mismo trabajo
// ═════════════════════════════════════════════════════════════════════════════

describe('A. Concurrencia: dos trabajadores sobre el mismo step_run', () => {
  function seedOneRun() {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    return makeDb(t);
  }

  it('A1: dos llamadas concurrentes a processStepRun envían el correo UNA sola vez (reclamo atómico)', async () => {
    const { client, tables } = seedOneRun();
    await Promise.all([
      processStepRun('run-1', ORG, client),
      processStepRun('run-1', ORG, client),
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
  });

  it('A2: dos ejecuciones solapadas del cron (processPendingStepRuns) no duplican el envío', async () => {
    const { client } = seedOneRun();
    await Promise.all([
      processPendingStepRuns(ORG, client),
      processPendingStepRuns(ORG, client),
    ]);
    expect(sendEmailMock.mock.calls.length).toBe(1);
  });

  it('A3: el UPDATE a running lleva guarda .eq(status,pending): el segundo worker no entra', () => {
    const src = readSrc('sequenceService.ts');
    const claim = src.slice(src.indexOf('export async function claimStepRun'), src.indexOf('export async function reclaimStaleStepRuns'));
    expect(claim).toContain("status: 'running'");
    expect(claim).toContain(".eq('status', 'pending')");
    expect(claim).toContain(".eq('organization_id', orgId)");
  });

  it('A4: un step_run que quedó en running tras una caída lo recupera el barrido', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'running', executed_at: new Date(Date.now() - 3 * 3600_000).toISOString(), scheduled_at: new Date(Date.now() - 4 * 3600_000).toISOString() });
    const { client, tables } = makeDb(t);
    const r = await processPendingStepRuns(ORG, client);
    expect(r.reclaimed).toBe(1);
    expect(r.processed).toBe(1);
    expect(tables.sequence_step_runs[0].status).toBe('completed'); // ya no se queda atascado
  });

  it('A5: los kinds `automation` y `sequence_step` tienen handler registrado (motor conectado a la cola)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    require('@/lib/jobs/handlers');
    // Registro de F8 (el índice compartido solo tiene que importar este módulo).
    require('@/lib/jobs/handlers/f8Automations');
    const { getJobHandler } = require('@/lib/jobs/registry');
    expect(OUTBOUND_JOB_KINDS).toEqual(expect.arrayContaining(['automation', 'sequence_step']));
    expect(getJobHandler('automation')).toBeDefined();
    expect(getJobHandler('sequence_step')).toBeDefined();
    expect(getJobHandler('crm_event')).toBeDefined();
  });

  it('A6: el motor de F8 encola en `outbound_jobs` y escucha el outbox `crm_events`', () => {
    const engine = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/automationEngine.ts'), 'utf8') as string;
    expect(engine).toMatch(/onCrmEvent/);
    expect(engine).toMatch(/enqueueJob/);
    expect(engine).toMatch(/evaluateTrigger/);
    // El servicio de secuencias también encola (paso de WhatsApp).
    expect(readSrc('sequenceService.ts')).toMatch(/enqueueJob/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Regla que se dispara sin tope / en cascada consigo misma
// ═════════════════════════════════════════════════════════════════════════════

describe('B. Reglas: interruptor, idempotencia y run_once', () => {
  it('B1: una regla DESACTIVADA no se ejecuta desde /trigger (run `skipped`, sin envío)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'a@b.com', subject: 's', html: '<p>x</p>' }], { is_active: false });
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped');
    expect(tables.automation_runs[0].skip_reason).toBe('rule_inactive');
  });

  it('B2: 5 disparos del mismo evento con run_once = 1 correo (los demás quedan `skipped`)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }], { run_once_per_opportunity: true });
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 5; i++) {
      await executeAutomationRule('rule-1', ORG, { event_id: 'evt-1', opportunity_id: 'opp-1' }, client);
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.automation_runs).toHaveLength(5);
    expect(tables.automation_runs.filter((r: any) => r.status === 'skipped')).toHaveLength(4);
    expect(tables.automation_runs.filter((r: any) => r.skip_reason === 'run_once_per_opportunity')).toHaveLength(4);
  });

  it('B3: cascada — enroll_sequence 4 veces deja UNA inscripción viva y sus pasos una sola vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2 }]);
    addRule(t, [{ type: 'enroll_sequence', sequence_id: 'seq-1' }]);
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 4; i++) {
      await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    }
    expect(tables.sequence_enrollments).toHaveLength(1);
    expect(tables.sequence_step_runs).toHaveLength(2); // 1 inscripción × 2 pasos
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock.mock.calls.length).toBe(2);
  });

  it('B4: el servicio implementa run_once y cooldown como guardas reales', () => {
    const src = readSrc('automationService.ts');
    expect(src).toMatch(/run_once_per_opportunity/);
    expect(src).toMatch(/cooldown_hours/);
    expect(src).toMatch(/alreadyRan/);
  });

  it('B5 (PASA): update_field respeta la allow-list y rechaza tabla/columna arbitraria', async () => {
    expect(() => validateUpdateField('users', 'password', 'x')).toThrow(/entidad no permitida/);
    expect(() => validateUpdateField('opportunities', 'stage_id', 'stg-2')).toThrow(/columna no permitida/);
    expect(() => validateUpdateField('opportunities', 'organization_id', 1)).toThrow(/columna no permitida/);
    expect(() => validateUpdateField('opportunities', 'temperature', 'nuclear')).toThrow(/temperature debe ser/);
    expect(Object.keys(UPDATE_FIELD_ALLOWLIST).sort()).toEqual(['customers', 'opportunities', 'tasks']);
  });

  it('B6 (PASA): update_field escribe con .eq(organization_id) — no cruza organizaciones', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'update_field', entity: 'opportunities', entity_id: 'opp-other', field_name: 'temperature', field_value: 'hot' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.opportunities.find((o: any) => o.id === 'opp-other')!.temperature).toBeUndefined();
  });

  it('B7: las 6 rutas de F8 exigen rol de administrador para mutar', () => {
    const fs = require('fs');
    const path = require('path');
    const routes = [
      'src/app/api/crm/automation-rules/route.ts',
      'src/app/api/crm/automation-rules/[id]/route.ts',
      'src/app/api/crm/automation-rules/[id]/trigger/route.ts',
      'src/app/api/crm/sequences/route.ts',
      'src/app/api/crm/sequences/[id]/route.ts',
      'src/app/api/crm/sequences/[id]/enroll/route.ts',
    ];
    for (const r of routes) {
      const src = fs.readFileSync(path.join(process.cwd(), r), 'utf8') as string;
      expect(src).toContain('getServerOrgContext');
      expect(src).toMatch(/requireOrgAdmin\(ctx\)/);
    }
    expect(fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/orgContext.ts'), 'utf8')).toContain('requireOrgAdmin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
