/**
 * F8 — automatizaciones y secuencias: ronda 2 — orden de pasos por la cola (N1) y barrido de eventos temporales (N2).
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
// N. Hallazgos nuevos de la ronda 2 del tester (N1-N8)
// ═════════════════════════════════════════════════════════════════════════════

describe('N. Ronda 2: orden de pasos, barrido, reanudar y residuos', () => {
  const FALSE_CONDITION = { field: 'opportunity.amount', operator: 'gte', value: 999999999 };

  function seedConditionThenEmail() {
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', action_config: { condition: FALSE_CONDITION } },
      { step_number: 2, channel: 'email' },
    ]);
    return makeDb(t);
  }

  it('N1a: POR LA COLA — condición falsa y correo en el mismo instante: el correo NO sale', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // Programación encadenada: un solo job vivo, y es el del paso 1.
    const seqJobs = tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step');
    expect(seqJobs).toHaveLength(1);
    const firstRun = tables.sequence_step_runs.find((r: any) => r.id === seqJobs[0].payload.step_run_id)!;
    const firstStep = tables.sequence_steps.find((st: any) => st.id === firstRun.step_id)!;
    expect(firstStep.step_number).toBe(1);

    const processed = await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(processed).toEqual([{ stepRunId: firstRun.id, status: 'completed' }]);
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_false');
  });

  it('N1b: POR LA COLA — con un job duplicado del paso 2 empatado en run_at, la guarda lo frena', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // Se fabrica el job que la RPC encolaba antes de la ronda 2: mismo run_at.
    const second = tables.sequence_step_runs[1];
    tables.outbound_jobs.push({
      id: 'job-empatado',
      organization_id: ORG,
      kind: 'sequence_step',
      payload: { step_run_id: second.id, enrollment_id: second.enrollment_id },
      status: 'queued',
      run_at: second.scheduled_at,
      dedupe_key: 'seqrun-legacy',
    });

    // `lastOnTie` hace que el job del CORREO se reclame primero.
    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    // El paso frenado se reencoló con una clave propia (no pisa `seqrun:{id}`).
    expect(tables.outbound_jobs.some((j: any) => String(j.dedupe_key).includes(':wait:'))).toBe(true);
  });

  it('N1c: la guarda devuelve el paso a `pending` con motivo, sin ejecutarlo', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = tables.sequence_step_runs[1];

    const run = await processStepRun(second.id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('pending');
    expect(run.result).toEqual(expect.objectContaining({ reason: 'waiting_previous_step', waits: 1 }));
    expect(tables.sequence_step_runs[1].status).toBe('pending');
  });

  it('N1d: superado el tope de esperas el paso se marca `skipped`, nunca se envía adelantado', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = tables.sequence_step_runs[1];
    second.result = { reason: 'waiting_previous_step', waits: 999 };

    const run = await processStepRun(second.id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped');
    expect((run.result as any).reason).toBe('waiting_previous_step_timeout');
  });

  it('N1e: la cadena avanza sola — 3 pasos, 3 ejecuciones, un solo job vivo cada vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, channel: 'task' }, { step_number: 3, channel: 'wait' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step')).toHaveLength(1);
    const processed = await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(processed.map((x) => x.status)).toEqual(['completed', 'completed', 'completed']);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.sequence_enrollments[0].status).toBe('completed');
  });

  it('N2a: el kind `time_events` tiene handler real y la inscripción siembra su barrido', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    require('@/lib/jobs/handlers/f8Automations');
    const { getJobHandler, hasRealJobHandler } = require('@/lib/jobs/registry');
    expect(getJobHandler('time_events')).toBeDefined();
    expect(hasRealJobHandler('time_events')).toBe(true);

    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const sweeps = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events');
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].dedupe_key).toBe(`time_events:${ORG}`);
  });

  it('N2b: el barrido rescata el paso cuyo job murió y se reprograma solo', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // El job del paso agota intentos y queda `dead`: sin barrido, ese paso no
    // se ejecuta jamás y la inscripción se queda viva para siempre (tester N2).
    const job = tables.outbound_jobs.find((j: any) => j.kind === 'sequence_step')!;
    job.status = 'dead';
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');

    const out: any = await timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client,
      orgId: ORG,
      log: silentLog as any,
      signal: new AbortController().signal,
    });

    expect(out.processed).toBe(1);
    expect(out.completed).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.sequence_enrollments[0].status).toBe('completed');
    // Sin inscripciones vivas la cadena de barridos se apaga sola.
    expect(out.live_enrollments).toBe(false);
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(0);
  });

  it('N2c: con inscripciones vivas el barrido vuelve a programarse (singleton por org)', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 5, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');

    const out: any = await timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    });

    expect(out.live_enrollments).toBe(true);
    const sweeps = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events');
    expect(sweeps).toHaveLength(1);
    expect(new Date(sweeps[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

});
