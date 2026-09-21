/**
 * F8 — automatizaciones y secuencias: ronda 2 — inscripciones pausadas y reanudar (N3), destinatario fijo (N4), regla desactivada (N5), finishRun por org (N6), inscribir con selector (N7), HTML sin sustituir (N8) y enlace del pipeline (N-UI).
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

describe('N. Ronda 2: reanudar, destinatario fijo, regla desactivada y residuos', () => {
  it('N3a: una inscripción PAUSADA no consume sus pasos (antes los marcaba `skipped`)', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.sequence_enrollments[0].status = 'paused';
    tables.sequence_enrollments[0].paused_reason = 'customer_replied_whatsapp';

    const run = await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('pending');
    expect((run.result as any).reason).toBe('enrollment_paused');
    expect(tables.sequence_step_runs[0].status).toBe('pending');
  });

  it('N3b: reanudar devuelve la inscripción a `active` y reencola el siguiente paso', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const enrollmentId = tables.sequence_enrollments[0].id;
    tables.sequence_enrollments[0].status = 'paused';
    tables.sequence_enrollments[0].paused_reason = 'customer_replied_email';
    tables.outbound_jobs = [];

    const result = await resumeEnrollment(ORG, enrollmentId, client);

    expect(result.resumed).toBe(true);
    expect(tables.sequence_enrollments[0].status).toBe('active');
    expect(tables.sequence_enrollments[0].paused_reason).toBeNull();
    const jobs = tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step');
    expect(jobs).toHaveLength(1);

    await drainQueue(client, tables, ORG);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('N3c: reanudar una inscripción que no está pausada no hace nada y lo dice', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const result = await resumeEnrollment(ORG, tables.sequence_enrollments[0].id, client);
    expect(result.resumed).toBe(false);
    expect(result.reason).toBe('not_paused');
  });

  it('N3d: la ruta de inscripciones expone PATCH resume y exige rol de administrador', () => {
    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/crm/sequences/[id]/enrollments/route.ts'), 'utf8') as string;
    expect(route).toContain('export async function PATCH');
    expect(route).toContain('resumeEnrollment');
    const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
    expect(patch).toContain('requireOrgAdmin(ctx)');
    expect(patch).toContain("action !== 'resume'");
  });

  it('N4: un `to` fijo que no es cliente de la organización se RECHAZA (se saltaba el consentimiento)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'externo@dominio-ajeno.com', subject: 's', html: '<p>x</p>' }]);
    const { client, tables } = makeDb(t);

    const run = await executeAutomationRule('rule-1', ORG, {}, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect(tables.automation_runs[0].error_message).toMatch(/recipient_not_a_customer/);
  });

  it('N4b: con allow_non_customer el administrador puede mandar el aviso interno', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'avisos@interno.com', allow_non_customer: true, subject: 's', html: '<p>x</p>' }]);
    const { client } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(run.status).toBe('completed');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][1].to).toBe('avisos@interno.com');
  });

  it('N5: `force` ya no existe: una regla desactivada NO se ejecuta ni forzándola', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }], { is_active: false });
    const { client, tables } = makeDb(t);

    await expect(
      executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client, { force: true } as any),
    ).rejects.toThrow(/force/);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('skipped');
    expect(tables.automation_runs[0].skip_reason).toBe('rule_inactive');

    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/crm/automation-rules/[id]/trigger/route.ts'), 'utf8') as string;
    expect(route).toContain('FORCE_REMOVED');
    expect(route).not.toContain('force: body.force === true');
  });

  it('N6: `finishRun` de reglas actualiza filtrando también por organización', () => {
    const src = readSrc('automationService.ts');
    const finish = src.slice(src.indexOf('async function finishRun'), src.indexOf('async function alreadyRan'));
    expect(finish).toContain(".eq('id', runId)");
    expect(finish).toContain(".eq('organization_id', orgId)");
  });

  it('N7: inscribir ya no es pegar un UUID: hay selector, previsualización y confirmación', () => {
    const fs = require('fs');
    const path = require('path');
    const page = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/SecuenciasPage.tsx'), 'utf8') as string;
    expect(page).not.toContain('Id de la oportunidad');
    expect(page).toContain('EnrollDialog');

    const dialog = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/EnrollDialog.tsx'), 'utf8') as string;
    expect(dialog).toContain('Confirmar inscripción');
    expect(dialog).toContain('Buscar por nombre de la oportunidad');
    expect(dialog).toMatch(/steps\.map/);

    expect(fs.existsSync(
      path.join(process.cwd(), 'src/app/api/crm/sequences/[id]/enroll/preview/route.ts'))).toBe(true);
  });

  it('N8: el HTML llega a F7 SIN sustituir: quien renderiza es quien escapa', async () => {
    const t = baseTables();
    (t.customers[0] as any).full_name = '<b>Acme</b>';
    addRule(t, [{ type: 'send_email', subject: 'Hola {{customer_name}}', html: '<p>Hola {{customer_name}}</p>' }]);
    const { client } = makeDb(t);

    await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);

    const payload = sendEmailMock.mock.calls[0][1];
    expect(payload.html).toBe('<p>Hola {{custom.customer_name}}</p>');
    expect(payload.subject).toBe('Hola {{custom.customer_name}}');
    expect(payload.html).not.toContain('<b>Acme</b>');
    expect(payload.template_variables.customer_name).toBe('<b>Acme</b>');
  });

  it('N8b: las variables ya cualificadas de F7 no se tocan', () => {
    const { qualifyVarsForEmail } = require('@/lib/services/crm/automation/ruleContext');
    const vars = { customer_name: 'Ana', amount: '100' };
    expect(qualifyVarsForEmail('{{contact.first_name}}', vars)).toBe('{{contact.first_name}}');
    expect(qualifyVarsForEmail('{{org.name}}', vars)).toBe('{{org.name}}');
    // El `|defecto` se conserva tal cual (F7 recorta los espacios de cada tramo).
    expect(qualifyVarsForEmail('{{ customer_name | cliente }}', vars)).toBe('{{custom.customer_name| cliente }}');
    expect(qualifyVarsForEmail('{{desconocida}}', vars)).toBe('{{desconocida}}');
  });

  it('N-UI: la vista del pipeline solo enlaza la página si el menú la habilita', () => {
    const fs = require('fs');
    const path = require('path');
    const view = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/pipeline/AutomationsView.tsx'), 'utf8') as string;
    expect(view).toContain('AUTOMATIONS_PAGE_ENABLED');
    expect(view).toContain("CRM_NAV");
    // Ningún <Link> queda fuera de la guarda.
    const links = view.split('<Link href="/app/crm/automatizaciones"').length - 1;
    expect(links).toBe(2);
    expect(view.split('AUTOMATIONS_PAGE_ENABLED').length - 1).toBeGreaterThanOrEqual(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// O. Hallazgos de la ronda 3 del tester (N9–N14)
// ══════════════════════════════════════════════════════════════════════════════

