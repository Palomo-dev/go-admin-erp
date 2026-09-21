/**
 * F8 — automatizaciones y secuencias: consentimiento y destinatario (E) y programación temporal (F).
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

// E. Contacto dado de baja / consentimiento
// ═════════════════════════════════════════════════════════════════════════════

describe('E. Consentimiento y destinatario', () => {
  it('E1: send_email ignora el destinatario del payload de la petición', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { customer_email: 'atacante@dominio-externo.com' }, client);
    // Sin cliente en el contexto no hay a quién escribir: la acción falla.
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ type: 'send_email', code: 'no_recipient' }),
    );
  });

  it('E1b: con oportunidad, el destinatario es su cliente y viaja con to_customer_id e idempotencia', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }]);
    const { client } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1', customer_email: 'atacante@dominio-externo.com' }, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][1].to).toBe('cliente@ejemplo.com');
    expect(sendEmailMock.mock.calls[0][1].to_customer_id).toBe('cus-1');
    expect(sendEmailMock.mock.calls[0][1].idempotency_key).toMatch(/^rule:rule-1:run:/);
  });

  it('E2: F8 delega el consentimiento en F7/F16 pero SIEMPRE identifica al cliente', () => {
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    expect(actions).toMatch(/to_customer_id/);
    expect(actions).toMatch(/idempotency_key/);
    // El envío de WhatsApp pasa por F16 (opt-out + ventana de 24 h) vía la cola.
    expect(actions).toMatch(/kind: 'whatsapp'/);
    expect(readSrc('sequenceService.ts')).toMatch(/to_customer_id: customer\.id/);
  });

  it('E2b (PASA): el paso `email` de una secuencia pasa to_customer_id, así que F7 aplica consentimiento', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock.mock.calls[0][1].to_customer_id).toBe('cus-1');
    expect(sendEmailMock.mock.calls[0][1].sequence_step_run_id).toBeDefined();
  });

  it('E3: el paso whatsapp encola un envío real en F16 (ventana 24 h y opt-out incluidos allí)', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'whatsapp', action_config: { text: 'hola' } }]);
    const { client, tables } = makeDb(t);
    const enqueue = fakeEnqueue();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client, 50, { enqueue: enqueue.fn });
    const run = tables.sequence_step_runs[0];
    expect(run.status).toBe('completed');
    expect(run.result).toEqual(expect.objectContaining({ channel: 'whatsapp', queued: true }));
    expect(enqueue.calls[0]).toEqual(expect.objectContaining({ kind: 'whatsapp', organizationId: ORG }));
    expect(enqueue.calls[0].payload.message_request).toEqual(expect.objectContaining({ customerId: 'cus-1' }));
  });

  it('E4: el paso `condition` se evalúa de verdad: condición falsa corta la secuencia', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'condition', action_config: { condition: { field: 'opportunity.amount', operator: 'gte', value: 999999999 } } }, { step_number: 2, channel: 'email' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'condition', branch: false }));
    expect(sendEmailMock).not.toHaveBeenCalled(); // la condición era falsa: no se envía
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_false');
  });

  it('E5: el paso `call` crea una tarea de llamada para el vendedor', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'call', action_config: { title: 'Llamar', script: 'Guion' } }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'call' }));
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toEqual(expect.objectContaining({ type: 'call', status: 'open', related_to_id: 'opp-1' }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. Salto de reloj y trabajos programados en el pasado
// ═════════════════════════════════════════════════════════════════════════════

describe('F. Programación temporal', () => {
  it('F1: delay_days negativo se rechaza al crear la secuencia (no se programa en el pasado)', async () => {
    const t = baseTables();
    const { client, tables } = makeDb(t);
    await expect(createSequence(ORG, {
      name: 'Con retardo negativo',
      steps: [{ step_number: 1, delay_days: -30, channel: 'email' }],
    }, client)).rejects.toThrow(/delay_days/);
    expect(tables.sequences).toHaveLength(0);
    expect(validateSequenceSteps([{ step_number: 1, delay_days: -30, channel: 'email' }])).toHaveLength(1);
  });

  it('F2: 6 pasos con delay_days 0 se programan al mismo instante (ráfaga configurada por el usuario)', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2 }, { step_number: 3 }, { step_number: 4 }, { step_number: 5 }, { step_number: 6 }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const times = new Set(tables.sequence_step_runs.map((r: any) => r.scheduled_at));
    expect(times.size).toBe(1);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(6);
  });

  it('F3: delay_days extremo se rechaza antes de tocar la BD (nada de inscritos con 0 pasos)', async () => {
    const t = baseTables();
    const { client, tables } = makeDb(t);
    await expect(createSequence(ORG, {
      name: 'Retardo imposible',
      steps: [{ step_number: 1, delay_days: 2147483647, channel: 'email' }],
    }, client)).rejects.toThrow(/delay_days/);
    expect(tables.sequences).toHaveLength(0);
    expect(tables.sequence_enrollments).toHaveLength(0);
    expect(MAX_DELAY_DAYS).toBe(3650);
  });

  it('F3b: la validación existe en el servicio Y en la ruta; la inscripción es una sola operación', () => {
    const fs = require('fs');
    const path = require('path');
    const src = readSrc('sequenceService.ts');
    expect(src).toMatch(/MAX_DELAY_DAYS/);
    expect(src).toMatch(/entero entre 0 y \$\{MAX_DELAY_DAYS\}/);
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/crm/sequences/route.ts'), 'utf8') as string;
    expect(route).toContain('validateSequenceInput');
    // enrollInSequence delega en la RPC transaccional (no hay 3 escrituras sueltas).
    expect(src).toContain("rpc('fn_enroll_in_sequence'");
  });

  it('F4: el cálculo de scheduled_at vive en la RPC; ventana de envío y zona horaria siguen pendientes', () => {
    const src = readSrc('sequenceService.ts');
    expect(src).not.toContain('scheduledAt.setDate(scheduledAt.getDate() + step.delay_days)');
    expect(src).toMatch(/delay_hours/);
    // Documentado como pendiente en el doc de fase (§13): send_window / business_days / tz.
    expect(src).not.toMatch(/send_window|business_days_only|send_at_local_time/);
  });

  it('F5 (PASA): un run programado en el futuro no se toma (comparación ISO en `lte`)', async () => {
    const t = baseTables();
    addSequence(t, [{ delay_days: 10 }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(new Date(tables.sequence_step_runs[0].scheduled_at).getTime()).toBeGreaterThan(Date.now());
    const r = await processPendingStepRuns(ORG, client);
    expect(r.processed).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
