/**
 * Ronda 2 de Automatizaciones — R2 (latente, real): `formToPayload` solo
 * enviaba `event` con el disparador `event`. En `create` el motor ponía el
 * suyo (`defaultEventFor`), pero `updateAutomationRule` NO recalculaba:
 * cambiar el disparador al editar dejaba el `event` viejo y `evaluateTrigger`
 * descartaba la regla para siempre. Aquí se fija el contrato por las dos
 * puntas: el payload lleva `event` en todos los disparadores, y el servidor
 * recalcula si un PATCH cambia `trigger_type` sin traer `event`.
 *
 * También: los eventos conocidos que ofrece el editor (`KNOWN_EVENTS`) deben
 * ser los que el motor enruta al disparador `event`; ofrecer
 * `opportunity.stage_changed` ahí sería una regla que nunca dispara.
 */
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(), emitCrmEvent: jest.fn() }));
jest.mock('@/lib/jobs/dispatch/eventDispatcher', () => ({ onCrmEvent: jest.fn() }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ checkExitConditions: jest.fn() }));

import { formToPayload, ruleToForm, setTrigger } from '../ruleEditorModel';
import { ENGINE_ROUTED_EVENTS, KNOWN_EVENTS, TRIGGER_OPTIONS, defaultEventFor, isEngineRoutedEvent } from '../ruleCatalog';
import {
  defaultEventFor as serviceDefaultEventFor,
  updateAutomationRule,
  type AutomationTriggerType,
} from '@/lib/services/crm/automationService';
import { triggerTypeForEvent } from '../automationEngine';

const baseRule = {
  id: 'r1',
  name: 'Seguimiento propuesta',
  description: null,
  trigger_type: 'stage_change',
  event: 'opportunity.stage_changed',
  pipeline_id: 'p1',
  stage_id: 's1',
  is_active: true,
  priority: 50,
  run_once_per_opportunity: false,
  cooldown_hours: 12,
  actions: [{ type: 'send_email', subject: 'Hola' }],
  conditions: { op: 'and', rules: [] },
};

describe('R2 · `event` viaja en TODOS los disparadores', () => {
  it.each([
    ['stage_change', 'opportunity.stage_changed'],
    ['field_change', 'opportunity.updated'],
    ['schedule', null],
    ['manual', null],
  ])('%s → event %s (lo que hubiera escrito antes se descarta)', (trigger, expected) => {
    const payload = formToPayload({ ...ruleToForm(baseRule), trigger_type: trigger, event: 'basura.previa' });
    expect(Object.prototype.hasOwnProperty.call(payload, 'event')).toBe(true);
    expect(payload.event).toBe(expected);
    expect(payload.event).toBe(defaultEventFor(trigger));
  });

  it('event → lo que escribe el usuario, recortado; vacío = null (cualquier evento)', () => {
    const form = { ...ruleToForm(baseRule), trigger_type: 'event' };
    expect(formToPayload({ ...form, event: '  opportunity.created ' }).event).toBe('opportunity.created');
    expect(formToPayload({ ...form, event: '' }).event).toBeNull();
  });

  it('el editor y el motor usan LA MISMA función `defaultEventFor`', () => {
    expect(serviceDefaultEventFor).toBe(defaultEventFor);
    for (const t of TRIGGER_OPTIONS) {
      expect(defaultEventFor(t.value)).toBe(serviceDefaultEventFor(t.value as AutomationTriggerType));
    }
  });

  it('el motor (PATCH) recalcula `event` si cambia `trigger_type` sin traerlo', async () => {
    const updates: Record<string, unknown>[] = [];
    const chain: Record<string, unknown> = {};
    const b = chain as { [k: string]: (...a: unknown[]) => unknown };
    b.update = (p: unknown) => { updates.push(p as Record<string, unknown>); return chain; };
    b.eq = () => chain;
    b.select = () => chain;
    b.maybeSingle = async () => ({ data: { id: 'r1' }, error: null });
    const supabase = { from: () => chain } as never;

    await updateAutomationRule('r1', 120, { trigger_type: 'field_change' }, supabase);
    expect(updates[0]).toMatchObject({ trigger_type: 'field_change', event: 'opportunity.updated' });

    await updateAutomationRule('r1', 120, { trigger_type: 'manual' }, supabase);
    expect(updates[1]).toMatchObject({ trigger_type: 'manual', event: null });

    // Si el cliente manda `event`, manda el cliente.
    await updateAutomationRule('r1', 120, { trigger_type: 'event', event: 'call.completed' }, supabase);
    expect(updates[2]).toMatchObject({ trigger_type: 'event', event: 'call.completed' });

    // Un PATCH que no toca el disparador no toca el evento.
    await updateAutomationRule('r1', 120, { name: 'Otro nombre' }, supabase);
    expect(Object.prototype.hasOwnProperty.call(updates[3], 'event')).toBe(false);
  });
});

describe('KNOWN_EVENTS · los eventos que ofrece el editor llegan a reglas de tipo `event`', () => {
  it('cada evento conocido se enruta al disparador `event` en el motor', () => {
    expect(KNOWN_EVENTS.length).toBeGreaterThan(0);
    for (const ev of KNOWN_EVENTS) {
      expect(triggerTypeForEvent(ev.value)).toBe('event');
      expect(ev.value).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(ev.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('no se ofrecen los eventos que el motor enruta a stage_change / field_change', () => {
    const values = KNOWN_EVENTS.map((e) => e.value);
    for (const v of ['opportunity.stage_changed', 'opportunity.won', 'opportunity.lost', 'opportunity.updated', 'opportunity.field_changed']) {
      expect(values).not.toContain(v);
    }
  });

  it('sin duplicados', () => {
    const values = KNOWN_EVENTS.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('ENGINE_ROUTED_EVENTS: los que el motor desvía a otro disparador (una regla `event` con ese nombre no dispara)', () => {
    expect(ENGINE_ROUTED_EVENTS.length).toBeGreaterThan(0);
    for (const ev of ENGINE_ROUTED_EVENTS) {
      expect(triggerTypeForEvent(ev)).not.toBe('event');
      expect(isEngineRoutedEvent(ev)).toBe(true);
    }
    expect(isEngineRoutedEvent('opportunity.created')).toBe(false);
    expect(isEngineRoutedEvent(defaultEventFor('stage_change'))).toBe(true);
    expect(isEngineRoutedEvent(defaultEventFor('field_change'))).toBe(true);
  });

  it('al pasar a disparador `event`, un evento puesto por el motor no se arrastra (sería una regla muda)', () => {
    const stageRule = ruleToForm({ ...baseRule, trigger_type: 'stage_change', event: 'opportunity.stage_changed' });
    expect(setTrigger(stageRule, 'event').event).toBe('');
    const fieldRule = ruleToForm({ ...baseRule, trigger_type: 'field_change', event: 'opportunity.updated' });
    expect(setTrigger(fieldRule, 'event').event).toBe('');
    // Un evento escrito por el usuario sí se conserva, también al ir y volver.
    const custom = ruleToForm({ ...baseRule, trigger_type: 'event', event: 'factura.pagada' });
    expect(setTrigger(setTrigger(custom, 'manual'), 'event').event).toBe('factura.pagada');
    expect(setTrigger(custom, 'stage_change').event).toBe('factura.pagada');
  });
});
