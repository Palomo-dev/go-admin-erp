import { computeWindow, describeWindow, getWindow } from '../windowService';
import { makeSupabase } from './mockSupabase';

describe('windowService (ventana 24 h)', () => {
  const now = new Date('2026-09-08T12:00:00Z');

  test('23 h 59 m → abierta', () => {
    const w = computeWindow(new Date(now.getTime() - (24 * 60 - 1) * 60_000), now);
    expect(w.is_open).toBe(true);
    expect(w.expires_at).toBe(new Date(now.getTime() + 60_000).toISOString());
  });

  test('24 h 1 m → cerrada', () => {
    expect(computeWindow(new Date(now.getTime() - (24 * 60 + 1) * 60_000), now).is_open).toBe(false);
  });

  test('sin inbound → cerrada y sin expires', () => {
    const w = computeWindow(null, now);
    expect(w).toEqual({ is_open: false, last_inbound_at: null, expires_at: null });
    expect(describeWindow(w, now)).toMatch(/solo plantillas/i);
  });

  test('describeWindow muestra el tiempo restante', () => {
    const w = computeWindow(new Date(now.getTime() - 18 * 3600_000 - 48 * 60_000), now);
    expect(describeWindow(w, now)).toBe('Ventana abierta · vence en 5 h 12 min');
  });

  test('getWindow filtra por org/cliente/canal y usa la conversación con inbound más reciente', async () => {
    const { sb, calls } = makeSupabase({ conversations: () => ({ data: { id: 'conv-1', last_inbound_at: new Date(now.getTime() - 3600_000).toISOString() } }) });
    const w = await getWindow(7, 'cust-1', 'chan-1', sb, now);
    expect(w.is_open).toBe(true);
    expect(w.conversation_id).toBe('conv-1');
    const ops = calls[0].ops;
    expect(ops.some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 7)).toBe(true);
    expect(ops.some((o) => o.method === 'eq' && o.args[0] === 'channel_id' && o.args[1] === 'chan-1')).toBe(true);
    expect(ops.some((o) => o.method === 'order' && o.args[0] === 'last_inbound_at')).toBe(true);
  });
});
