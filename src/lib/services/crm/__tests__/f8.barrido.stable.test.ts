/**
 * F8 — automatizaciones y secuencias: ronda 3 — el barrido que no puede morir (N9), variables cualificadas en secuencias (N12) y orden de marcado de pasos restantes (N14).
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


// ══════════════════════════════════════════════════════════════════════════════
// O. Hallazgos de la ronda 3 del tester (N9–N14)
// ══════════════════════════════════════════════════════════════════════════════

describe('O. Ronda 3: barrido resistente, variables cualificadas y orden de marcado', () => {
  it('N9a: un run defectuoso ya no envenena el lote: los demás se ejecutan', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    // Dos inscripciones INDEPENDIENTES vencidas y sin job vivo (los perdió la
    // cola): el barrido es su única red.
    for (const n of [1, 2]) {
      t.sequence_enrollments.push({
        id: `enr-${n}`, organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1',
        customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString(),
      });
      t.sequence_step_runs.push({
        id: `run-${n}`, organization_id: ORG, enrollment_id: `enr-${n}`, step_id: 'step-1',
        status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString(),
      });
    }
    let fired = false;
    const { client, tables } = makeDb(t, {
      // Revienta la lectura del paso del PRIMER run del barrido, y solo esa.
      // Antes de la ronda 3 eso abortaba el lote entero: el segundo run no se
      // ejecutaba, el job agotaba sus 3 intentos y la organización se quedaba
      // sin barrido para siempre.
      failSelect: (table: string) => {
        if (fired || table !== 'sequence_steps') return null;
        fired = true;
        return { message: 'lectura caída', code: '08006', details: null, hint: null };
      },
    });

    const out = await processPendingStepRuns(ORG, client, 50);

    expect(out.processed).toBe(2);
    expect(out.errors).toBe(1);
    expect(String(out.first_error)).toContain('lectura');
    expect(out.completed).toBe(1);
    expect(tables.tasks).toHaveLength(1);
  });

  it('N9b: el barrido se REPROGRAMA aunque el lote falle, y el fallo se propaga', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    let armed = false;
    const { client, tables } = makeDb(t, {
      // Revienta `reclaimStaleStepRuns`: el barrido entero lanza, no un run.
      failUpdate: (table: string, patch: Record<string, unknown>) => (
        armed && table === 'sequence_step_runs' && patch.status === 'pending'
          ? { message: 'barrido caído', code: '08006', details: null, hint: null }
          : null),
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');
    armed = true;

    await expect(timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    })).rejects.toThrow(/barrido/);

    // Lo importante: el sucesor existe. Antes la reprogramación vivía en el
    // camino feliz y tres fallos dejaban la organización sin barrido para siempre.
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(1);
  });

  it('N9c: el barrido en curso retiene su propia clave y AUN ASÍ deja sucesor', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }, { step_number: 2, delay_days: 5, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // El job del barrido está `running` mientras corre su handler, así que
    // retiene `time_events:{org}`: `fn_enqueue_job` deduplica sobre
    // (queued, running) y devolvía el id del PROPIO job, sin crear nada.
    const sweep = tables.outbound_jobs.find((j: any) => j.kind === 'time_events')!;
    sweep.status = 'running';

    const out: any = await timeEventsJobHandler({
      job: sweep as any, supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    });

    expect(out.live_enrollments).toBe(true);
    expect(out.next_job_id).toBeTruthy();
    expect(out.next_job_id).not.toBe(sweep.id);
    const successors = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events' && j.status === 'queued');
    expect(successors).toHaveLength(1);
    expect(new Date(successors[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('N9d: si la cadena no puede encolar el paso siguiente, se siembra el barrido', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }, { step_number: 2, channel: 'email' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = [];

    const failingEnqueue = jest.fn(async () => { throw new Error('cola no disponible'); });
    await processStepRun(tables.sequence_step_runs[0].id, ORG, client, { enqueue: failingEnqueue as any });

    expect(tables.sequence_step_runs[1].status).toBe('pending');
    expect(String((tables.sequence_step_runs[1].result as any).chain_error)).toContain('cola no disponible');
    // La red tiene red: el barrido queda sembrado para recogerlo.
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(1);
  });

  // ── N12 y N14 ──────────────────────────────────────────────────────────────

  it('N12: el paso `email` de secuencia cualifica sus variables como el de reglas', async () => {
    const t = baseTables();
    (t.customers[0] as any).full_name = '<b>Acme</b>';
    addSequence(t, [{
      channel: 'email',
      action_config: { subject: 'Hola {{customer_name}}', html: '<p>Hola {{customer_name}}</p>' },
    }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    const payload = sendEmailMock.mock.calls[0][1];
    expect(payload.html).toBe('<p>Hola {{custom.customer_name}}</p>');
    expect(payload.subject).toBe('Hola {{custom.customer_name}}');
    expect(payload.template_variables.customer_name).toBe('<b>Acme</b>');
  });

  it('N14: los pasos restantes se marcan ANTES de cerrar la condición como completada', async () => {
    const order: string[] = [];
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', condition: { field: 'opportunity.amount', operator: 'gte', value: 999999999 } },
      { step_number: 2, channel: 'email' },
    ]);
    const { client, tables } = makeDb(t, {
      failUpdate: (table: string, patch: Record<string, unknown>) => {
        if (table === 'sequence_step_runs' && typeof patch.status === 'string') order.push(String(patch.status));
        return null;
      },
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    // running (reclamo) → skipped (paso 2) → completed (la condición).
    expect(order).toContain('skipped');
    expect(order.indexOf('skipped')).toBeLessThan(order.lastIndexOf('completed'));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
