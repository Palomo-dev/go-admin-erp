/**
 * Rediseño UX de Secuencias (brief 6.3), ronda 2 — capa I/O y guardas que
 * antes sobrevivían a mutaciones (tester r1 #1, R1, R3).
 *
 * - `getSequenceStats` y `resolveEnrollmentNames` DEBEN filtrar por
 *   organización en cada lectura: RLS no puede ser el único freno.
 * - `CUSTOMER_FACING_CHANNELS` ⊇ {email, whatsapp, sms}: es la guarda de
 *   cumplimiento del diálogo de inscripción (advertencia roja + casilla).
 * - Los motivos de salida que traduce la UI cubren TODOS los literales que
 *   escribe el motor (leídos del código, no copiados a mano).
 * - Las condiciones de salida que ofrece el formulario existen en
 *   `checkExitConditions` (no se ofrece lo que el motor no implementa).
 */

// `emailService` real arrastra Resend + svix (solo ESM): se dobla como en F8.
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSequenceStats, resolveEnrollmentNames } from '../sequenceStats';
import { CUSTOMER_FACING_CHANNELS, summarizeStep } from '../sequenceTimeline';
import { validateSequenceSteps } from '../sequenceService';
import { EXIT_CONDITION_VALUES, EXIT_REASON_LABELS, reasonText } from '@/components/crm/secuencias/sequenceOptions';

// ─── Cliente Supabase simulado que registra los filtros ─────────────────────

type Call = [method: string, ...args: unknown[]];
interface Recorded { table: string; calls: Call[] }

function recordingClient(rowsByTable: Record<string, unknown[]>) {
  const log: Recorded[] = [];
  const from = (table: string) => {
    const rec: Recorded = { table, calls: [] };
    log.push(rec);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'range', 'limit']) {
      chain[m] = (...args: unknown[]) => { rec.calls.push([m, ...args]); return chain; };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rowsByTable[table] ?? [], error: null, count: (rowsByTable[table] ?? []).length });
    return chain;
  };
  return { client: { from } as never, log };
}

const orgFilter = (rec: Recorded) => rec.calls.find((c) => c[0] === 'eq' && c[1] === 'organization_id');

describe('getSequenceStats — filtra por organización (S7)', () => {
  it('lee sequence_enrollments con .eq(organization_id, org)', async () => {
    const { client, log } = recordingClient({ sequence_enrollments: [] });
    await getSequenceStats(120, client);
    const read = log.find((r) => r.table === 'sequence_enrollments');
    expect(read).toBeDefined();
    expect(orgFilter(read!)).toEqual(['eq', 'organization_id', 120]);
  });
});

describe('resolveEnrollmentNames — filtra por organización (S8)', () => {
  const enrollments = [{ id: 'e1', opportunity_id: 'o1', customer_id: null }];

  it('opportunities con .eq(organization_id, org)', async () => {
    const { client, log } = recordingClient({ opportunities: [{ id: 'o1', name: 'Alfa', customer_id: 'c1' }], customers: [] });
    await resolveEnrollmentNames(120, client, enrollments);
    const read = log.find((r) => r.table === 'opportunities');
    expect(orgFilter(read!)).toEqual(['eq', 'organization_id', 120]);
  });

  it('customers con .eq(organization_id, org)', async () => {
    const { client, log } = recordingClient({ opportunities: [{ id: 'o1', name: 'Alfa', customer_id: 'c1' }], customers: [] });
    await resolveEnrollmentNames(120, client, enrollments);
    const read = log.find((r) => r.table === 'customers');
    expect(read).toBeDefined();
    expect(orgFilter(read!)).toEqual(['eq', 'organization_id', 120]);
  });
});

describe('CUSTOMER_FACING_CHANNELS — guarda de cumplimiento (M10)', () => {
  it.each(['email', 'whatsapp', 'sms'])('%s llega a una persona real', (channel) => {
    expect(CUSTOMER_FACING_CHANNELS.has(channel)).toBe(true);
  });
  it.each(['task', 'wait', 'condition', 'call'])('%s no dispara la advertencia de envío', (channel) => {
    expect(CUSTOMER_FACING_CHANNELS.has(channel)).toBe(false);
  });
});

describe('guardas menores', () => {
  it('asunto tiene prioridad sobre la plantilla', () => {
    const step = { step_number: 1, channel: 'email', delay_days: 0, template_id: 't1', action_config: { subject: 'Asunto propio' } };
    expect(summarizeStep(step, 'Plantilla X')).toBe('Asunto propio');
  });
  it('delay_hours 24 se rechaza; 23 pasa', () => {
    const base = { step_number: 1, channel: 'email', delay_days: 0 };
    expect(validateSequenceSteps([{ ...base, delay_hours: 24 }])).toEqual([expect.stringContaining('delay_hours')]);
    expect(validateSequenceSteps([{ ...base, delay_hours: 23 }])).toEqual([]);
  });
});

// ─── Motivos y condiciones: contraste con el código del motor ───────────────

const SRC = join(__dirname, '..');
/** El motor está en CRLF: se normaliza para que las expresiones con `\n` casen. */
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

/** Literales de `exit_reason` que escribe el motor (sequenceService + acciones). */
function engineExitReasons(): Set<string> {
  const code = read('sequenceService.ts') + '\n' + read('automation/actions.ts');
  const out = new Set<string>();
  // `["']`: un reformateo a comillas dobles no debe poner esta suite en rojo (tester r3).
  const literal = /["']([a-z_]+)["'](?!\s*\?)/g;
  const snippets = [
    ...Array.from(code.matchAll(/exit(?:With|Enrollment)\(([^)]*)\)/g), (m) => m[1]),
    ...Array.from(code.matchAll(/exit_reason:[^\n]*/g), (m) => m[0]),
    ...Array.from(code.matchAll(/reason = ["'][a-z_]+["']/g), (m) => m[0]),
  ];
  for (const s of snippets) for (const m of s.matchAll(literal)) out.add(m[1]);
  const template = code.match(/`opportunity_\$\{(\w+)\}`/);
  if (template) {
    for (const m of code.matchAll(new RegExp(`${template[1]} === ["']([a-z_]+)["']`, 'g'))) out.add(`opportunity_${m[1]}`);
  }
  return out;
}

describe('motivos de salida (R1) — la UI traduce todo lo que escribe el motor', () => {
  const reasons = engineExitReasons();
  it('el escaneo encuentra los literales conocidos', () => {
    expect(reasons).toEqual(expect.any(Set));
    for (const r of ['opportunity_won', 'manual_unenroll', 'rule_unenroll', 'condition_false']) expect(reasons.has(r)).toBe(true);
  });
  it.each(Array.from(engineExitReasons()))('%s tiene traducción', (reason) => {
    expect(EXIT_REASON_LABELS[reason]).toEqual(expect.any(String));
    expect(reasonText(reason)).not.toBe(reason);
  });
  it('customer_replied_<canal> se traduce por prefijo', () => {
    expect(reasonText('customer_replied_whatsapp')).toBe('el cliente respondió');
  });
});

describe('condiciones de salida del formulario — solo las que implementa checkExitConditions', () => {
  const body = read('sequenceService.ts').match(/export async function checkExitConditions[\s\S]*?\n\}\n/)?.[0] ?? '';
  const implemented = new Set(Array.from(body.matchAll(/names\.has\(["']([a-z_]+)["']\)/g), (m) => m[1]));
  it('el motor implementa won_lost y opted_out', () => {
    expect(implemented.has('won_lost')).toBe(true);
    expect(implemented.has('opted_out')).toBe(true);
  });
  it.each(Array.from(EXIT_CONDITION_VALUES))('%s está implementado', (value) => {
    expect(implemented.has(value)).toBe(true);
  });
  // Sentido inverso (tester r2 T10/T11): todo lo que el motor evalúa se
  // ofrece. Quitar `opted_out` del formulario dejaría una condición real
  // sin forma de configurarla.
  it('implementado ⊆ ofrecido: el formulario ofrece todo lo que evalúa checkExitConditions', () => {
    expect(implemented.size).toBeGreaterThan(0);
    expect(Array.from(implemented).sort()).toEqual(Array.from(EXIT_CONDITION_VALUES).sort());
  });
});
