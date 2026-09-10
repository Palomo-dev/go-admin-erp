import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CrmEventDispatchError,
  clearCrmEventListeners,
  dispatchCrmEvent,
  getCrmEventListeners,
  onCrmEvent,
} from '../dispatch/eventDispatcher';
import type { CrmEvent } from '../types';

function makeEvent(type = 'opportunity.stage_changed'): CrmEvent {
  return {
    id: 'ev-1',
    organization_id: 105,
    event_type: type,
    entity_type: 'opportunity',
    entity_id: 'opp-1',
    payload: { from_stage_id: 's1', to_stage_id: 's2' },
    status: 'pending',
    created_at: new Date().toISOString(),
    processed_at: null,
  };
}

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const ctx = () => ({ supabase: {} as SupabaseClient, orgId: 105, log, signal: new AbortController().signal });

beforeEach(() => clearCrmEventListeners());

describe('eventDispatcher', () => {
  it('registra, lista y despacha listeners por tipo y comodín en orden', async () => {
    const order: string[] = [];
    onCrmEvent('opportunity.stage_changed', async () => { order.push('a'); return { a: 1 }; }, 'a');
    onCrmEvent('*', async () => { order.push('wild'); }, 'wild');
    onCrmEvent('call.completed', async () => { order.push('other'); }, 'other');

    expect(getCrmEventListeners('opportunity.stage_changed').map((l) => l.name)).toEqual(['a', 'wild']);

    const res = await dispatchCrmEvent(makeEvent(), ctx());
    expect(order).toEqual(['a', 'wild']);
    expect(res.listeners).toBe(2);
    expect(res.results[0]).toMatchObject({ name: 'a', ok: true, result: { a: 1 } });
  });

  it('aísla fallos: ejecuta todos y lanza CrmEventDispatchError con el detalle', async () => {
    const ran: string[] = [];
    onCrmEvent('opportunity.stage_changed', async () => { ran.push('bad'); throw new Error('kaput'); }, 'bad');
    onCrmEvent('opportunity.stage_changed', async () => { ran.push('good'); }, 'good');

    await expect(dispatchCrmEvent(makeEvent(), ctx())).rejects.toBeInstanceOf(CrmEventDispatchError);
    expect(ran).toEqual(['bad', 'good']);
    try {
      await dispatchCrmEvent(makeEvent(), ctx());
    } catch (err) {
      const e = err as CrmEventDispatchError;
      expect(e.message).toContain('1/2');
      expect(e.results.find((r) => r.name === 'bad')?.error).toBe('kaput');
      expect(log.error).toHaveBeenCalled();
    }
  });

  it('sin listeners devuelve 0 y la desuscripción funciona', async () => {
    const off = onCrmEvent('x.y', async () => undefined, 'tmp');
    expect(getCrmEventListeners('x.y')).toHaveLength(1);
    off();
    expect(getCrmEventListeners('x.y')).toHaveLength(0);
    const res = await dispatchCrmEvent(makeEvent('x.y'), ctx());
    expect(res).toEqual({ listeners: 0, results: [] });
  });

  it('con signal abortada no ejecuta listeners y reporta aborted', async () => {
    const fn = jest.fn(async () => undefined);
    onCrmEvent('opportunity.stage_changed', fn, 'fn');
    const controller = new AbortController();
    controller.abort();
    await expect(dispatchCrmEvent(makeEvent(), { ...ctx(), signal: controller.signal })).rejects.toThrow('aborted');
    expect(fn).not.toHaveBeenCalled();
  });
});
