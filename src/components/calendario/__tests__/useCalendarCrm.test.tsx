/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { expandRecurringEvents, useCalendar } from '../useCalendar';
import type { CalendarEvent } from '../types';
import { supabase } from '@/lib/supabase/config';
import { cambiarReunionCalendario } from '../reunionesCalendario';
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: null }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('../reunionesCalendario', () => ({ ...jest.requireActual('../reunionesCalendario'), cambiarReunionCalendario: jest.fn() }));
const rows = [{ source_type: 'calendar_event', source_id: 'meeting', organization_id: 120, title: 'Reunión', start_at: '2026-10-01T23:00:00Z', end_at: '2026-10-01T23:30:00Z', status: 'confirmed', metadata: { source: 'crm', activity_id: 'activity', completed_at: '2026-10-01T23:31:00Z' } }];
const from = jest.mocked(supabase.from);
const change = jest.mocked(cambiarReunionCalendario);
beforeEach(() => {
  jest.clearAllMocks();
  from.mockImplementation((table: string) => {
    if (table !== 'calendar_unified') throw new Error('Escritor de navegador indebido');
    const query: Record<string, unknown> = {};
    for (const method of ['select','eq','or','lt','order','not','in']) query[method] = jest.fn(() => query);
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return query as never;
  });
  change.mockResolvedValue({ id: 'meeting' } as never);
});
async function hook() {
  const rendered = renderHook(() => useCalendar({ organizationId: 120, initialDate: new Date('2026-10-01T15:00:00Z') }));
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}
test('edición CRM pasa por API sin enviar el estado confirmado ni usar Supabase para escribir', async () => {
  const { result } = await hook();
  expect(result.current.events[0].status).toBe('completed');
  await act(async () => { expect(await result.current.updateEvent('meeting', { title: 'Editada' })).toEqual({ success: true, error: null }); });
  expect(change).toHaveBeenCalledWith('meeting', { title: 'Editada' });
  expect(from.mock.calls.every(([table]) => table === 'calendar_unified')).toBe(true);
});
test('eliminar CRM cancela conservando la reunión y el historial', async () => {
  const { result } = await hook();
  await act(async () => { await result.current.deleteEvent('meeting'); });
  expect(change).toHaveBeenCalledWith('meeting', { status: 'canceled' });
});
test('mover a otro día y redimensionar usan el mismo endpoint canónico y conservan done', async () => {
  const { result } = await hook();
  await act(async () => { await result.current.moveEvent('meeting', new Date('2026-10-05T05:00:00Z'), 9); });
  expect(change).toHaveBeenLastCalledWith('meeting', { start_at: '2026-10-05T14:00:00.000Z', end_at: '2026-10-05T14:30:00.000Z' });
  await act(async () => { await result.current.resizeEvent('meeting', new Date('2026-10-01T22:00:00Z'), new Date('2026-10-01T23:30:00Z')); });
  expect(change).toHaveBeenLastCalledWith('meeting', { start_at: '2026-10-01T22:00:00.000Z', end_at: '2026-10-01T23:30:00.000Z' });
});
test('un error no cambia las fechas locales ni intenta otro escritor', async () => {
  const { result } = await hook();
  change.mockRejectedValueOnce(new Error('Permiso denegado'));
  let saved: unknown;
  await act(async () => { saved = await result.current.moveEvent('meeting', new Date('2026-10-05T05:00:00Z'), 9); });
  expect(saved).toEqual({ success: false, error: 'Permiso denegado' });
  expect(result.current.events[0].start_at).toBe(rows[0].start_at);
  expect(from.mock.calls.every(([table]) => table === 'calendar_unified')).toBe(true);
});
test('duplicación de una marca CRM y mutación de ID ausente se deniegan antes de escribir', async () => {
  const { result } = await hook();
  await act(async () => {
    expect((await result.current.createEvent({ metadata: { source: 'crm', activity_id: 'activity' } })).error).toBeTruthy();
    expect((await result.current.updateEvent('foreign', { title: 'Cambio' })).success).toBe(false);
  });
  expect(change).not.toHaveBeenCalled();
});
test('una carga tardía de la organización anterior no sustituye datos de la organización activa', async () => {
  const pending: Array<{ org: number; resolve: (value: unknown) => void }> = [];
  from.mockImplementation(() => {
    let org = 0;
    const query: Record<string, unknown> = {};
    for (const method of ['select','or','lt','order','not','in']) query[method] = jest.fn(() => query);
    query.eq = jest.fn((column: string, value: number) => { if (column === 'organization_id') org = value; return query; });
    query.then = (resolve: (value: unknown) => void) => new Promise<void>(done => { pending.push({ org, resolve: value => { resolve(value); done(); } }); });
    return query as never;
  });
  const { result, rerender } = renderHook(({ organizationId }) => useCalendar({ organizationId, initialDate: new Date('2026-10-01T15:00:00Z') }), { initialProps: { organizationId: 120 } });
  await waitFor(() => expect(pending.filter(item => item.org === 120)).toHaveLength(2));
  rerender({ organizationId: 121 });
  await waitFor(() => expect(pending.filter(item => item.org === 121)).toHaveLength(2));
  await act(async () => { for (const item of pending.filter(item => item.org === 121)) item.resolve({ data: [{ ...rows[0], source_id: 'current', organization_id: 121 }], error: null }); });
  expect(result.current.events[0].organization_id).toBe(121);
  await act(async () => { for (const item of pending.filter(item => item.org === 120)) item.resolve({ data: rows, error: null }); });
  expect(result.current.events[0].source_id).toBe('current');
  expect(result.current.events[0].organization_id).toBe(121);
});
test('el rango de día consulta hasta medianoche exclusiva y conserva el último microsegundo de Postgres', async () => {
  const edge = [
    { ...rows[0], source_id: 'last-microsecond', start_at: '2026-10-03T04:59:59.999999Z', end_at: '2026-10-03T05:30:00.000000Z' },
    { ...rows[0], source_id: 'next-day', start_at: '2026-10-03T05:00:00.000000Z', end_at: '2026-10-03T05:30:00.000000Z' },
  ];
  const limits: string[] = [];
  // El fake mantiene precisión de microsegundos, como timestamptz; Date la pierde.
  const micros = (value: string) => {
    const fraction = /\.(\d+)/.exec(value)?.[1] ?? '0';
    return BigInt(Date.parse(value.slice(0, 19) + 'Z')) * BigInt(1000) + BigInt(fraction.padEnd(6, '0').slice(0, 6));
  };
  from.mockImplementation(() => {
    let exclusive = '';
    const query: Record<string, unknown> = {};
    for (const method of ['select','eq','or','order','not','in']) query[method] = jest.fn(() => query);
    query.lt = jest.fn((column: string, value: string) => { expect(column).toBe('start_at'); exclusive = value; limits.push(value); return query; });
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: edge.filter(item => micros(item.start_at) < micros(exclusive)), error: null }).then(resolve);
    return query as never;
  });
  const { result } = renderHook(() => useCalendar({ organizationId: 120, initialView: 'day', initialDate: new Date('2026-10-02T15:00:00Z') }));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(limits).toEqual(['2026-10-03T05:00:00.000Z', '2026-10-03T05:00:00.000Z']);
  expect(result.current.events.map(item => item.source_id)).toEqual(['last-microsecond']);
  expect(result.current.events[0].start_at).toBe('2026-10-03T04:59:59.999999Z');
});
test('expansión recurrente excluye tanto el original como ocurrencias en la medianoche final', () => {
  const recurring = { ...rows[0], metadata: {}, start_at: '2026-10-01T05:00:00Z', end_at: '2026-10-01T05:30:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=4' } as CalendarEvent;
  const expanded = expandRecurringEvents([recurring], new Date('2026-10-01T05:00:00Z'), new Date('2026-10-03T05:00:00Z'));
  expect(expanded.map(item => item.start_at)).toEqual(['2026-10-01T05:00:00Z', '2026-10-02T05:00:00.000Z']);
  const boundaryOriginal = { ...recurring, start_at: '2026-10-03T05:00:00Z', end_at: '2026-10-03T05:30:00Z' };
  expect(expandRecurringEvents([boundaryOriginal], new Date('2026-10-01T05:00:00Z'), new Date('2026-10-03T05:00:00Z'))).toEqual([]);
});
