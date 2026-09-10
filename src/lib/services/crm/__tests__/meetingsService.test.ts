/**
 * meetingsService — buildIcs (RFC 5545) y validaciones de createMeeting (FASE-09 §9.1).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildIcs, createMeeting, meetingInputSchema } from '../meetingsService';

describe('meetingsService.buildIcs', () => {
  const ics = buildIcs({
    uid: 'abc-123',
    title: 'Demo, GoAdmin; CRM',
    description: 'Línea 1\nLínea 2',
    location: 'https://meet.example.com/x',
    startAt: '2026-09-10T15:00:00-05:00',
    endAt: '2026-09-10T16:00:00-05:00',
    organizerEmail: 'ventas@goadmin.io',
    attendees: ['cliente@acme.co'],
  });

  test('METHOD:REQUEST, DTSTART en UTC y líneas CRLF', () => {
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('DTSTART:20260910T200000Z');
    expect(ics).toContain('DTEND:20260910T210000Z');
    expect(ics.split('\r\n').length).toBeGreaterThan(8);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  test('escapa comas, punto y coma y saltos de línea; incluye organizador y asistente', () => {
    expect(ics).toContain('SUMMARY:Demo\\, GoAdmin\\; CRM');
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2');
    expect(ics).toContain('ORGANIZER;CN=GoAdmin:mailto:ventas@goadmin.io');
    expect(ics).toContain('ATTENDEE;RSVP=TRUE:mailto:cliente@acme.co');
    expect(ics).toContain('UID:abc-123@goadmin.io');
  });
});

describe('meetingsService.createMeeting', () => {
  const base = {
    title: 'Reunión',
    start_at: '2026-09-10T15:00:00.000Z',
    end_at: '2026-09-10T16:00:00.000Z',
    opportunity_id: '11111111-1111-4111-8111-111111111111',
  };
  const sb = { from: jest.fn() } as unknown as SupabaseClient;

  test('schema exige ISO con offset y attendees válidos', () => {
    expect(meetingInputSchema.safeParse({ ...base, start_at: '2026-09-10 15:00' }).success).toBe(false);
    expect(meetingInputSchema.safeParse({ ...base, attendees: ['no-es-email'] }).success).toBe(false);
    expect(meetingInputSchema.safeParse(base).success).toBe(true);
  });

  test('end_at <= start_at → error antes de tocar la BD', async () => {
    await expect(createMeeting(7, 'u1', { ...base, end_at: base.start_at }, sb)).rejects.toThrow('posterior');
    expect((sb.from as jest.Mock)).not.toHaveBeenCalled();
  });

  test('sin opportunity_id ni customer_id → error', async () => {
    await expect(createMeeting(7, 'u1', { ...base, opportunity_id: undefined }, sb)).rejects.toThrow('Se requiere');
  });
});

describe('meetingsService — plegado RFC 5545 (F9-28)', () => {
  test('ninguna línea supera 75 octetos y las continuaciones llevan un espacio', () => {
    const long = 'x'.repeat(400);
    const ics = buildIcs({
      uid: 'abc-123',
      title: 'Demo',
      description: long,
      startAt: '2026-09-10T15:00:00-05:00',
      endAt: '2026-09-10T16:00:00-05:00',
      organizerEmail: 'ventas@goadmin.io',
      attendees: [],
    });
    const lines = ics.split('\r\n');
    for (const l of lines) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
    // Desplegando se recupera el texto original
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${long}`);
  });

  test('no parte caracteres multibyte', () => {
    const acentos = 'áéíóúñ'.repeat(40);
    const ics = buildIcs({
      uid: 'u', title: 'T', description: acentos,
      startAt: '2026-09-10T15:00:00Z', endAt: '2026-09-10T16:00:00Z',
      organizerEmail: 'a@b.co', attendees: [],
    });
    expect(ics.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${acentos}`);
    for (const l of ics.split('\r\n')) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
  });
});
