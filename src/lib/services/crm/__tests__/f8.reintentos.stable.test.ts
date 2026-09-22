/**
 * F8 — automatizaciones y secuencias: reintentos y errores visibles (C) e inscripciones duplicadas y validación de la inscripción (D).
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

// C. Reintento tras un envío ya entregado / errores tragados
// ═════════════════════════════════════════════════════════════════════════════

describe('C. Reintentos y errores visibles', () => {
  it('C1: el correo sale y el UPDATE final falla -> el paso queda recuperable y el error se reporta', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    const { client, tables } = makeDb(t, {
      failUpdate: (table, patch) =>
        table === 'sequence_step_runs' && patch.status === 'completed'
          ? { message: 'network', code: '08006', details: null, hint: null }
          : null,
    });
    const result = await processStepRun('run-1', ORG, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // El error de persistencia NO se traga: viaja en el resultado devuelto.
    expect(result.error_message).toMatch(/persist_error/);
    // La fila sigue `running` y el barrido la recupera (no se pierde el paso).
    expect(tables.sequence_step_runs[0].status).toBe('running');
    // Y el envío llevaba clave de idempotencia: un reintento no duplica el correo.
    expect(sendEmailMock.mock.calls[0][1].idempotency_key).toBe('seqrun:run-1');
  });

  it('C2: reintentar un run ya ejecutado no vuelve a enviar (reclamo) y conserva la idempotencia', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 7 }]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    t.sequence_step_runs.push({ id: 'run-2', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-2', status: 'pending', scheduled_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
    const { client, tables } = makeDb(t);
    await processStepRun('run-1', ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'email' }));

    // "Reintentar" el mismo job: el reclamo falla porque ya no está `pending`.
    const again = await processStepRun('run-1', ORG, client);
    expect(again.status).toBe('completed');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('C3: una acción que falla marca el run como `failed` con su error_message', async () => {
    const t = baseTables();
    addRule(t, [
      { type: 'create_task', title: 'T', due_in_days: 3 },
      { type: 'send_sms', text: 'hola' },
    ]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('failed');
    const results = (tables.automation_runs[0].result as any).results as any[];
    expect(results[0]).toEqual(expect.objectContaining({ type: 'create_task', status: 'ok' }));
    expect(results[1]).toEqual(expect.objectContaining({ type: 'send_sms', status: 'failed', code: 'action_not_implemented' }));
    expect(tables.automation_runs[0].error_message).toMatch(/action_not_implemented/);
  });

  it('C4: un tipo de acción desconocido se reporta como FALLO, no como éxito', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_carrier_pigeon' as any, to: '+57300' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ status: 'failed', code: 'unknown_action' }),
    );
  });

  it('C5: los errores de BD ya no se tragan en console.warn: los servicios lanzan', () => {
    const auto = readSrc('automationService.ts');
    const seqs = readSrc('sequenceService.ts');
    expect(auto).not.toContain('console.warn(');
    expect(seqs).not.toContain('console.warn(');
    expect(auto).toMatch(/throw new Error\(`getAutomationRules/);
    expect(seqs).toMatch(/throw new Error\(`getSequences/);
  });

  it('C6: si el INSERT de step_runs falla, NO queda inscripción huérfana (todo o nada)', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    (t.sequence_steps as any[])[0].id = null; // step sin id -> step_id null -> 23502
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/step_id|23502|null value/);
    expect(tables.sequence_step_runs).toHaveLength(0);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Inscripción doble en la misma secuencia
// ═════════════════════════════════════════════════════════════════════════════

describe('D. Inscripciones duplicadas y validación de la inscripción', () => {
  it('D1: inscribir dos veces la misma oportunidad deja UNA inscripción y sus pasos una vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 3 }]);
    const { client, tables } = makeDb(t);
    const first = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reason).toBe('already_active');
    expect(second.id).toBe(first.id);
    expect(tables.sequence_enrollments).toHaveLength(1);
    expect(tables.sequence_step_runs).toHaveLength(2);
  });

  it('D1b: 20 inscripciones seguidas = 1 correo al cliente en el primer tick', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 20; i++) await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(tables.sequence_enrollments).toHaveLength(1);
    await processPendingStepRuns(ORG, client, 100);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const destinos = new Set(sendEmailMock.mock.calls.map((c: any[]) => c[1].to));
    expect(destinos).toEqual(new Set(['cliente@ejemplo.com']));
  });

  it('D2: NO se puede inscribir en una secuencia desactivada', async () => {
    const t = baseTables();
    addSequence(t, [{}], { is_active: false });
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/sequence_inactive/);
    expect(tables.sequence_enrollments).toHaveLength(0);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('D3: inscribir una oportunidad de OTRA organización falla y no crea nada', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-other', client)).rejects.toThrow(/opportunity_not_found/);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });

  it('D4: una secuencia sin pasos no admite inscripción (nada de inscritos fantasma)', async () => {
    const t = baseTables();
    addSequence(t, []);
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/sequence_has_no_active_steps/);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });

  it('D5: processStepRun filtra por organización: no toca la inscripción de otra org', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'wait' }]);
    // enrollment de OTRA org, referenciado por un run de la nuestra
    t.sequence_enrollments.push({ id: 'enr-x', organization_id: OTHER_ORG, sequence_id: 'seq-1', opportunity_id: null, customer_id: null, status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-x', organization_id: ORG, enrollment_id: 'enr-x', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    const { client, tables } = makeDb(t);
    const run = await processStepRun('run-x', ORG, client);
    expect(run.status).toBe('skipped');
    expect((run.result as any).reason).toBe('enrollment_not_found');
    expect(tables.sequence_enrollments.find((e: any) => e.id === 'enr-x')!.status).toBe('active');
    const src = readSrc('sequenceService.ts');
    const exit = src.slice(
      src.indexOf('export async function checkExitConditions'),
      src.indexOf('export async function processPendingStepRuns'),
    );
    expect(exit.length).toBeGreaterThan(500);
    expect(exit).toMatch(/organization_id/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
