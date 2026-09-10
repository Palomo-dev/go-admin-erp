/**
 * Utilidades puras del timeline: mergeEntries (sin duplicados, reemplazo
 * call_live → call) y groupByDay en America/Bogota (FASE-09 §9.1).
 */
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { groupByDay, mergeEntries, relativeTime } from '../utils';

const note = (id: string, at: string): TimelineEntry => ({ kind: 'note', id, occurred_at: at, user: null, note: { id, body: 'x', is_pinned: false }, activity: null });
const call = (kind: 'call' | 'call_live', id: string, at: string): TimelineEntry => ({
  kind, id, occurred_at: at, user: null, activity: null,
  call: { id, direction: 'outbound', status: kind === 'call' ? 'completed' : 'in_progress', mode: 'browser', duration_seconds: null, from_number: null, to_number: null, recording_enabled: false, cost_amount: null, recording: null, transcript: null, analysis: null },
});

describe('mergeEntries', () => {
  test('no duplica, sustituye versiones nuevas y reordena descendente', () => {
    const prev = [note('n1', '2026-09-08T10:00:00Z'), note('n2', '2026-09-08T09:00:00Z')];
    const next = [{ ...note('n2', '2026-09-08T09:00:00Z'), note: { id: 'n2', body: 'editada', is_pinned: true } } as TimelineEntry, note('n3', '2026-09-08T11:00:00Z')];
    const out = mergeEntries(prev, next);
    expect(out.map((e) => e.id)).toEqual(['n3', 'n1', 'n2']);
    expect((out[2] as Extract<TimelineEntry, { kind: 'note' }>).note?.body).toBe('editada');
  });

  test('call_live que pasa a call se reemplaza por id de llamada', () => {
    const out = mergeEntries([call('call_live', 'c1', '2026-09-08T10:00:00Z')], [call('call', 'c1', '2026-09-08T10:00:00Z')]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('call');
  });
});

describe('groupByDay', () => {
  test('23:30 UTC-5 cae en el día local correcto y etiqueta Hoy/Ayer', () => {
    const now = new Date('2026-09-09T12:00:00-05:00');
    const entries = [
      note('a', '2026-09-09T04:30:00Z'), // 23:30 del 8 en Bogotá → Ayer
      note('b', '2026-09-09T13:00:00Z'), // 08:00 del 9 → Hoy
      note('c', '2026-09-01T13:00:00Z'),
    ];
    const groups = groupByDay(entries, 'America/Bogota', now);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-08', '2026-09-09', '2026-09-01']);
    const byDay = Object.fromEntries(groups.map((g) => [g.day, g]));
    expect(byDay['2026-09-08'].entries.map((e) => e.id)).toEqual(['a']);
    expect(byDay['2026-09-09'].label.startsWith('Hoy')).toBe(true);
    expect(byDay['2026-09-08'].label.startsWith('Ayer')).toBe(true);
    expect(byDay['2026-09-01'].label.startsWith('Hoy')).toBe(false);
  });
});

describe('relativeTime', () => {
  test('ahora / hace N min / hace N h / en N d', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    expect(relativeTime('2026-09-09T11:59:40Z', now)).toBe('ahora');
    expect(relativeTime('2026-09-09T11:45:00Z', now)).toBe('hace 15 min');
    expect(relativeTime('2026-09-09T09:00:00Z', now)).toBe('hace 3 h');
    expect(relativeTime('2026-09-11T12:00:00Z', now)).toBe('en 2 d');
  });
});
