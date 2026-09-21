/**
 * F8 — automatizaciones y secuencias: ronda 3 — condición configurable y fail-closed (N10) y continue_on_error en pasos condición (N11).
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

describe('O. Ronda 3: condición configurable y fail-closed, y el barrido que no puede morir', () => {
  const REAL_CONDITION = { field: 'opportunity.amount', operator: 'gte', value: 1 };

  // ── N10: la condición vacía ya no pasa ─────────────────────────────────────

  it('N10a: `isEmptyConditionTree` distingue "sin condición" de "condición"', () => {
    const { isEmptyConditionTree, evaluateConditionTree, countConditionRules } =
      require('@/lib/services/crm/automation/conditionsDsl');
    for (const empty of [null, undefined, {}, [], 'lo que sea', 42, { op: 'and', rules: [] },
      { op: 'and', rules: [{ op: 'or', rules: [] }] }]) {
      expect(isEmptyConditionTree(empty)).toBe(true);
    }
    expect(isEmptyConditionTree(REAL_CONDITION)).toBe(false);
    expect(isEmptyConditionTree({ op: 'and', rules: [REAL_CONDITION] })).toBe(false);
    expect(countConditionRules({ op: 'or', rules: [REAL_CONDITION, REAL_CONDITION] })).toBe(2);

    // Y NO se toca la semántica de las reglas de automatización: una regla sin
    // condiciones sigue ejecutándose siempre.
    const ctx = {
      orgId: ORG, now: new Date(), opportunity: null, customer: null,
      stage: null, pipeline: null, consent: {}, event: null,
    };
    expect(evaluateConditionTree(null, ctx).result).toBe(true);
  });

  it('N10b: guardar un paso `condition` sin reglas se rechaza (antes evaluaba a VERDADERO)', () => {
    const issues = validateSequenceSteps([{ step_number: 1, delay_days: 0, channel: 'condition' }]);
    expect(issues.join(' ')).toMatch(/condición necesita al menos una regla/);

    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [] } },
    ])).not.toHaveLength(0);
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: 'basura' },
    ])).not.toHaveLength(0);

    // Con una regla de verdad, pasa.
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] } },
    ])).toHaveLength(0);

    // Y el campo de la regla sigue validado contra la allow-list.
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { field: 'customers.password', operator: 'eq', value: 1 } },
    ]).join(' ')).toMatch(/field no permitido/);

    // Un paso de condición no puede declarar que continúa ante error (N11).
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: REAL_CONDITION, continue_on_error: true },
    ]).join(' ')).toMatch(/no puede continuar ante error/);
  });

  it('N10c: `createSequence` no escribe una condición vacía, y la BD tampoco la aceptaría', async () => {
    const { client, tables } = makeDb(baseTables());
    await expect(createSequence(ORG, {
      name: 'Con condición vacía',
      steps: [{ step_number: 1, delay_days: 0, channel: 'condition' } as any],
    } as any, client)).rejects.toThrow(/condición necesita al menos una regla/);
    expect(tables.sequences).toHaveLength(0);

    // El CHECK de BD (`sequence_steps_condition_required_chk`) es el respaldo:
    // aunque alguien saltase la validación, el INSERT falla con 23514.
    const direct = await client.from('sequence_steps').insert({
      organization_id: ORG, sequence_id: 'seq-x', step_number: 1, channel: 'condition', condition: null,
    });
    expect((direct as any).error?.code).toBe('23514');
  });

  it('N10d: `createSequence` guarda la condición y fuerza `continue_on_error: false`', async () => {
    const { client, tables } = makeDb(baseTables());
    await createSequence(ORG, {
      name: 'Con condición',
      steps: [
        { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] } },
        { step_number: 2, delay_days: 0, channel: 'email' },
      ],
    } as any, client);

    const conditionStep = tables.sequence_steps.find((s: any) => s.channel === 'condition')!;
    expect(conditionStep.condition).toEqual({ op: 'and', rules: [REAL_CONDITION] });
    expect(conditionStep.continue_on_error).toBe(false);
    // Los demás canales conservan el valor por defecto de la BD.
    expect(tables.sequence_steps.find((s: any) => s.channel === 'email')!.continue_on_error).toBe(true);
  });

  it('N10e: en ejecución, una condición vacía CORTA la secuencia; el correo no sale', async () => {
    const t = baseTables();
    // Fila heredada: se escribió antes de que existieran la validación y el CHECK.
    addSequence(t, [
      { channel: 'condition', condition: null, continue_on_error: true },
      { step_number: 2, channel: 'email' },
    ]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(String(tables.sequence_step_runs[0].error_message)).toContain('condition_not_configured');
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_unevaluable');
  });

  it('N10f: la interfaz tiene editor de condición y bloquea guardar sin reglas', () => {
    const fs = require('fs');
    const path = require('path');
    const editorPath = path.join(process.cwd(), 'src/components/crm/secuencias/ConditionEditor.tsx');
    expect(fs.existsSync(editorPath)).toBe(true);
    const editor = fs.readFileSync(editorPath, 'utf8') as string;
    expect(editor).toContain('CONDITION_FIELDS');
    expect(editor).toContain('OPERATORS');

    // Rediseño UX 2026-09-14 (brief 6.3): `SequenceFormDialog` pasó a ser
    // `SequenceEditorDialog` (validación) → `StepTimelineEditor` → `StepCard`
    // → `StepBranch`, que es donde se integra el `ConditionEditor` como
    // bifurcación. La garantía es la misma: el editor existe y el diálogo
    // bloquea guardar una condición sin reglas.
    const dialog = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/SequenceEditorDialog.tsx'), 'utf8') as string;
    expect(dialog).toContain('isEmptyConditionTree');
    expect(dialog).toContain('<StepTimelineEditor');
    const branch = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/StepBranch.tsx'), 'utf8') as string;
    expect(branch).toContain('<ConditionEditor');
    const card = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/StepCard.tsx'), 'utf8') as string;
    expect(card).toContain('<StepBranch');
  });

  // ── N11: una condición que no se puede evaluar corta ───────────────────────

  it('N11: `continue_on_error: true` NO hace avanzar un paso `condition` que falla', async () => {
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] }, continue_on_error: true },
      { step_number: 2, channel: 'email' },
    ]);
    // El contexto de la condición no se puede leer: `loadRuleContext` propaga.
    const { client, tables } = makeDb(t, {
      failSelect: (table: string, n: number) => (table === 'opportunities' && n === 1
        ? { message: 'conexión perdida', code: '08006', details: null, hint: null } : null),
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_unevaluable');
  });

  it('N11b: en un paso que NO es condición, `continue_on_error` sigue mandando', async () => {
    const t = baseTables();
    // `sms` no tiene proveedor: el paso falla siempre.
    addSequence(t, [{ channel: 'sms', continue_on_error: true }, { step_number: 2, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[1].status).toBe('completed');
    expect(tables.tasks).toHaveLength(1);
  });

  // ── N9: el barrido no puede quedarse muerto ────────────────────────────────

});
