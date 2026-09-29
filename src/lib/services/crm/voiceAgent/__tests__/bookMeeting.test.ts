/**
 * «Agendar la reunión falla» (2026-09-29).
 *
 * Causa raíz reproducida en la base (transacción revertida): `book_meeting`
 * insertaba `calendar_events.status = 'scheduled'` y el CHECK real
 * `calendar_events_status_check` solo admite confirmed | tentative | cancelled
 * → 23514 en todas las llamadas. Además la hora sin desfase se leía en la zona
 * del servidor (UTC en Railway) y la zona iba cableada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { bookMeeting, resolverInicioReunion, type ToolContext } from '@/lib/services/crm/voiceAgentTools';

/** CHECK real de `calendar_events.status` (verificado por MCP el 2026-09-29). */
const CALENDAR_STATUS_CHECK = ['confirmed', 'tentative', 'cancelled'];

function fakeSupabase() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () =>
          table === 'organizations'
            ? { data: { timezone: 'America/Bogota' }, error: null }
            : { data: { salesperson_id: 'u-vendedor', customer_id: 'cust-1' }, error: null },
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          if (table === 'calendar_events' && !CALENDAR_STATUS_CHECK.includes(String(row.status))) {
            const fail = {
              select: () => fail,
              single: async () => ({
                data: null,
                error: { message: 'new row for relation "calendar_events" violates check constraint "calendar_events_status_check"', code: '23514' },
              }),
            };
            return fail;
          }
          const ok = {
            select: () => ok,
            single: async () => ({ data: { id: 'ev-1', start_at: row.start_at, end_at: row.end_at }, error: null }),
            then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
          };
          return ok;
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, inserts };
}

const RELOJ = new Date('2026-09-29T15:00:00Z'); // martes 10:00 en Bogotá

beforeEach(() => {
  jest.useFakeTimers({ now: RELOJ, doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterEach(() => jest.useRealTimers());

describe('resolverInicioReunion', () => {
  test('con desfase se respeta tal cual', () => {
    expect(resolverInicioReunion('2026-10-02T10:00:00-05:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02T15:00:00Z', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });

  test('sin desfase es la hora de pared de la ORGANIZACIÓN, no la del servidor', () => {
    expect(resolverInicioReunion('2026-10-02T10:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02 10:00:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02T10:00', 'Europe/Madrid')?.toISOString()).toBe('2026-10-02T08:00:00.000Z');
  });

  test('lo que no es una fecha con hora devuelve null', () => {
    expect(resolverInicioReunion('mañana a las 10', 'America/Bogota')).toBeNull();
    expect(resolverInicioReunion('2026-10-02', 'America/Bogota')).toBeNull();
    expect(resolverInicioReunion('2026-10-02T25:00', 'America/Bogota')).toBeNull();
    expect(resolverInicioReunion('', 'America/Bogota')).toBeNull();
  });
});

describe('bookMeeting', () => {
  const ctx = (client: SupabaseClient): ToolContext => ({
    orgId: 125,
    supabase: client,
    voiceAgentCallId: 'vac-1',
    customerId: 'cust-1',
    opportunityId: 'opp-1',
    actionPolicy: 'suggest',
  });

  test('agenda con un estado que el CHECK real admite y en la zona de la organización', async () => {
    const { client, inserts } = fakeSupabase();
    const r = await bookMeeting(ctx(client), { start_at: '2026-10-02T10:00', title: 'Demostración GO Admin ERP' });
    expect(r.success).toBe(true);
    const ev = inserts.find((i) => i.table === 'calendar_events')!.row;
    expect(CALENDAR_STATUS_CHECK).toContain(ev.status);
    expect(ev.status).toBe('confirmed');
    expect(ev.timezone).toBe('America/Bogota');
    expect(ev.start_at).toBe('2026-10-02T15:00:00.000Z');
    expect(ev.end_at).toBe('2026-10-02T15:30:00.000Z');
    expect(ev.assigned_to).toBe('u-vendedor');
    expect(r.say).toMatch(/02\/10\/2026 10:00/);
    // Deja rastro en el timeline de la oportunidad.
    expect(inserts.some((i) => i.table === 'activities' && i.row.outcome === 'meeting_booked')).toBe(true);
  });

  test('rechaza el pasado y las fechas ilegibles sin tocar la base', async () => {
    const { client, inserts } = fakeSupabase();
    expect((await bookMeeting(ctx(client), { start_at: '2023-10-02T10:00:00-05:00' })).error).toMatch(/pasado/);
    expect((await bookMeeting(ctx(client), { start_at: 'el jueves' })).error).toMatch(/inválida/);
    expect(inserts).toHaveLength(0);
  });
});
