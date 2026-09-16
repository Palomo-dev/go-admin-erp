/**
 * Ronda 3 de Automatizaciones — contrato del servicio con la BD doblada.
 *
 * Cierra las mutaciones que sobrevivían en la ronda 2:
 *   - M23: `evaluateTrigger` sin el filtro `rule.event !== eventType`. Toda la
 *     premisa de R2 («un `event` desfasado deja la regla muda») descansa en
 *     esa línea y nadie la pinchaba en el motor.
 *   - M32–M35: `updateAutomationRule` ignorando `stage_id` o `is_active`, y
 *     `createAutomationRule` con `is_active: true` fijo o `stage_id: null`
 *     fijo. La prueba del PATCH usaba `toMatchObject` solo sobre `event`; aquí
 *     va el payload completo de 12 claves y `toEqual` sobre la fila.
 *   - M16: `ENGINE_ROUTED_EVENTS` incompleto (quitar `opportunity.won` pasaba
 *     verde): se sondea contra `triggerTypeForEvent` con los literales que el
 *     propio motor usa, no con una lista escrita a mano.
 *
 * `automationService` es de F8 (aprobada): aquí solo se prueba, no se cambia.
 */
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(), emitCrmEvent: jest.fn() }));
jest.mock('@/lib/jobs/dispatch/eventDispatcher', () => ({ onCrmEvent: jest.fn() }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ checkExitConditions: jest.fn() }));

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAutomationRule,
  evaluateTrigger,
  updateAutomationRule,
  type CreateAutomationRuleInput,
} from '@/lib/services/crm/automationService';
import { formToPayload, ruleToForm } from '../ruleEditorModel';
import { ENGINE_ROUTED_EVENTS, KNOWN_EVENTS, isEngineRoutedEvent } from '../ruleCatalog';
import { triggerTypeForEvent } from '../automationEngine';

const ORG = 120;

/**
 * Doble mínimo de Supabase: filtra por `eq`, registra lo que se escribe con
 * `insert`/`update` y devuelve la fila que se le diga. Nada más.
 */
type Row = Record<string, unknown>;
interface Chain {
  select(): Chain;
  order(): Chain;
  eq(column: string, value: unknown): Chain;
  insert(row: Row): Chain;
  update(row: Row): Chain;
  single(): Chain;
  maybeSingle(): Chain;
  then(resolve: (value: { data: unknown; error: null }) => void): void;
}

function makeClient(rows: Row[], written: Row[] = []) {
  const from = (): Chain => {
    const preds: Array<(r: Row) => boolean> = [];
    let single = false;
    const b: Chain = {
      select: () => b,
      order: () => b,
      eq: (column, value) => { preds.push((r) => r[column] === value); return b; },
      insert: (row) => { written.push(row); single = true; return b; },
      update: (row) => { written.push(row); single = true; return b; },
      single: () => { single = true; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (resolve) => {
        const data = rows.filter((r) => preds.every((p) => p(r)));
        resolve({ data: single ? (written[written.length - 1] ?? data[0] ?? null) : data, error: null });
      },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const rule = (extra: Record<string, unknown>) => ({
  id: 'r',
  organization_id: ORG,
  name: 'Regla',
  trigger_type: 'field_change',
  trigger_config: {},
  conditions: null,
  actions: [],
  is_active: true,
  priority: 100,
  pipeline_id: null,
  stage_id: null,
  event: null,
  ...extra,
});

describe('M23 · evaluateTrigger descarta la regla cuyo `event` no es el del outbox', () => {
  const rows = [
    rule({ id: 'updated', event: 'opportunity.updated' }),
    rule({ id: 'v3-sin-event', event: null }),
  ];

  it('con eventType=opportunity.stage_changed, la regla event=opportunity.updated queda fuera', async () => {
    const ids = (await evaluateTrigger(ORG, 'field_change', {}, makeClient(rows), { eventType: 'opportunity.stage_changed' }))
      .map((r) => r.id);
    expect(ids).not.toContain('updated');
    // Una regla V3 con `event` NULL sigue disparándose por su `trigger_type`.
    expect(ids).toEqual(['v3-sin-event']);
  });

  it('con su propio eventType entra (y la V3 también)', async () => {
    const ids = (await evaluateTrigger(ORG, 'field_change', {}, makeClient(rows), { eventType: 'opportunity.updated' }))
      .map((r) => r.id);
    expect(ids).toEqual(['updated', 'v3-sin-event']);
  });

  it('sin eventType (llamada manual) el filtro no aplica', async () => {
    const ids = (await evaluateTrigger(ORG, 'field_change', {}, makeClient(rows))).map((r) => r.id);
    expect(ids).toEqual(['updated', 'v3-sin-event']);
  });
});

/** El payload que manda el editor: 12 claves, todas con valor no trivial. */
const FULL_PAYLOAD: Required<Omit<CreateAutomationRuleInput, 'trigger_config' | 'template_key' | 'created_by'>> = {
  name: 'Seguimiento de propuesta',
  description: 'Escribe y recuerda llamar',
  trigger_type: 'stage_change',
  event: 'opportunity.stage_changed',
  pipeline_id: 'pipe-1',
  stage_id: 'stage-7',
  priority: 42,
  run_once_per_opportunity: false,
  cooldown_hours: 6,
  is_active: false,
  actions: [{ type: 'send_email', subject: 'Hola' }],
  conditions: { op: 'or', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 10 }] },
};

describe('M32–M35 · cada clave del payload llega a la fila, sin valores fijos', () => {
  it('el payload del editor tiene exactamente 12 claves (si crece, esta prueba debe crecer)', () => {
    const payload = formToPayload({ ...ruleToForm(null), name: 'Cualquiera' });
    expect(Object.keys(payload).sort()).toEqual(Object.keys(FULL_PAYLOAD).sort());
    expect(Object.keys(payload)).toHaveLength(12);
  });

  it('PATCH: la fila escrita es el payload entero (`updated_at` aparte)', async () => {
    const written: Record<string, unknown>[] = [];
    await updateAutomationRule('r', ORG, FULL_PAYLOAD, makeClient([], written));
    const { updated_at, ...row } = written[0];
    expect(typeof updated_at).toBe('string');
    expect(row).toEqual(FULL_PAYLOAD);
  });

  it('PATCH: `stage_id: null` e `is_active: true` explícitos también viajan', async () => {
    const written: Record<string, unknown>[] = [];
    await updateAutomationRule('r', ORG, { stage_id: null, is_active: true }, makeClient([], written));
    expect(written[0]).toEqual({ updated_at: expect.any(String), stage_id: null, is_active: true });
  });

  it('POST: la fila insertada lleva el payload entero más lo que pone el servidor', async () => {
    const written: Record<string, unknown>[] = [];
    await createAutomationRule(ORG, { ...FULL_PAYLOAD, created_by: 'u1' }, makeClient([], written));
    expect(written[0]).toEqual({
      ...FULL_PAYLOAD,
      organization_id: ORG,
      trigger_config: {},
      template_key: null,
      created_by: 'u1',
    });
  });

  it('POST: `is_active` y `stage_id` no son fijos (true / null solo cuando no vienen)', async () => {
    const written: Record<string, unknown>[] = [];
    const client = makeClient([], written);
    await createAutomationRule(ORG, { name: 'Mínima', trigger_type: 'manual' }, client);
    expect(written[0]).toMatchObject({ is_active: true, stage_id: null, event: null });
    await createAutomationRule(ORG, { name: 'Explícita', trigger_type: 'manual', is_active: false, stage_id: 's9' }, client);
    expect(written[1]).toMatchObject({ is_active: false, stage_id: 's9' });
  });
});

describe('M16 · ENGINE_ROUTED_EVENTS es exactamente lo que el motor desvía', () => {
  const engineSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/services/crm/automation/automationEngine.ts'), 'utf8');
  // Literales `entidad.accion` que aparecen en el motor: son los que enruta a mano.
  const engineLiterals = Array.from(engineSrc.matchAll(/'([a-z_]+\.[a-z_]+)'/g), (m) => m[1]);
  const probe = Array.from(new Set([
    ...engineLiterals,
    ...KNOWN_EVENTS.map((e) => e.value),
    ...ENGINE_ROUTED_EVENTS,
    'opportunity.deleted', 'invoice.paid', 'factura.pagada',
  ]));

  it('la sonda cubre los literales del motor y los eventos conocidos', () => {
    expect(engineLiterals).toEqual(expect.arrayContaining(['opportunity.won', 'opportunity.lost', 'opportunity.stage_changed']));
    expect(probe.length).toBeGreaterThan(ENGINE_ROUTED_EVENTS.length + KNOWN_EVENTS.length);
  });

  it.each(['opportunity.won', 'opportunity.lost', 'opportunity.stage_changed', 'opportunity.updated', 'opportunity.field_changed'])(
    '%s está en la lista (quitarlo dejaría al editor ofrecer una regla muda)',
    (ev) => {
      expect(triggerTypeForEvent(ev)).not.toBe('event');
      expect(ENGINE_ROUTED_EVENTS).toContain(ev);
    },
  );

  it('para cada sonda: isEngineRoutedEvent(v) ⇔ triggerTypeForEvent(v) !== event', () => {
    for (const v of probe) {
      expect({ v, routed: isEngineRoutedEvent(v) }).toEqual({ v, routed: triggerTypeForEvent(v) !== 'event' });
    }
  });
});
