import { esReunionCrm, patchReunionCalendario, cambiarReunionCalendario, estadoReunionCalendario } from '../reunionesCalendario';
import { cursorDelDia, diaDelCursor, instanteDelSlot, moverFechasEvento, ocupaDia, ocupaSlot, minutosEnZona } from '../fechasCalendario';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { CalendarEvent } from '../types';
jest.mock('@/components/crm/acciones/apiCrm', () => ({ ...jest.requireActual('@/components/crm/acciones/apiCrm'), pedirCrm: jest.fn(), emitirCambioCrm: jest.fn() }));
const pedir = jest.mocked(pedirCrm);
const md = (metadata: CalendarEvent['metadata']) => ({ metadata });
test.each([{ source: 'crm' }, { source: 'voice_agent' }, { activity_id: 'history' }])('una marca de gestión CRM impide tratar el evento como manual: %p', metadata => {
  expect(esReunionCrm(md(metadata))).toBe(true);
});
test('un evento manual de tipo reunión no se atribuye al CRM', () => {
  expect(esReunionCrm(md({ event_type: 'meeting' }))).toBe(false);
  expect(esReunionCrm(null)).toBe(false);
});
test('un cambio de fechas o título conserva el outcome y no sustituye metadatos/participantes', () => {
  expect(patchReunionCalendario({ title: 'Nuevo título', start_at: '2026-10-02T20:00:00Z', metadata: { completed_at: null }, assigned_to: 'otro', all_day: true }))
    .toEqual({ title: 'Nuevo título', start_at: '2026-10-02T20:00:00Z' });
});
test.each([['cancelled', 'canceled'], ['completed', 'done'], ['confirmed', 'scheduled']] as const)('la acción de estado %s usa el contrato %s', (status, expected) => {
  expect(patchReunionCalendario({ status })).toEqual({ status: expected });
});
test('tentativo, fin ausente y un parche sin cambios válidos se rechazan', () => {
  expect(() => patchReunionCalendario({ status: 'tentative' })).toThrow();
  expect(() => patchReunionCalendario({ end_at: null })).toThrow();
  expect(() => patchReunionCalendario({ all_day: true })).toThrow();
});
test('el evento confirmado no acredita una reunión realizada sin evidencia', () => {
  expect(estadoReunionCalendario({ status: 'confirmed', metadata: { source: 'crm' } })).toBe('confirmed');
  expect(estadoReunionCalendario({ status: 'confirmed', metadata: { source: 'crm', completed_at: '2026-10-01T20:00:00Z' } })).toBe('completed');
});
test('un rechazo de API se propaga sin recurrir al escritor del navegador', async () => {
  pedir.mockRejectedValueOnce(new ErrorApiCrm(403, 'sin_permiso', 'Permiso denegado'));
  await expect(cambiarReunionCalendario('reunion', { status: 'canceled' })).rejects.toMatchObject({ status: 403 });
  expect(pedir).toHaveBeenCalledWith('/api/crm/meetings/reunion', { method: 'PATCH', cuerpo: { status: 'canceled' } });
});
test('mover entre días conserva la duración exacta y usa hora de organización', () => {
  const result = moverFechasEvento('2026-10-01T23:15:30Z', '2026-10-02T00:02:45Z', new Date('2026-10-05T05:00:00Z'), 9, 'America/Bogota');
  expect(result).toEqual({ start_at: '2026-10-05T14:00:00.000Z', end_at: '2026-10-05T14:47:15.000Z' });
  expect(minutosEnZona(result.start_at, 'America/Bogota')).toBe(540);
});
test('el día de una celda es plano; las horas de selección son instantes en su zona', () => {
  const cursor = cursorDelDia('2026-10-05');
  expect(diaDelCursor(cursor)).toBe('2026-10-05');
  expect(instanteDelSlot(cursor, 9, 'America/Bogota').toISOString()).toBe('2026-10-05T14:00:00.000Z');
  expect(instanteDelSlot(cursor, 24, 'America/Bogota').toISOString()).toBe('2026-10-06T05:00:00.000Z');
});
test('evento nocturno ocupa ambos días, incluidos slots parciales sin mostrarlo tras finalizar', () => {
  const start = '2026-10-02T04:30:00Z', end = '2026-10-02T05:15:00Z';
  expect(ocupaDia(start, end, cursorDelDia('2026-10-01'), 'America/Bogota')).toBe(true);
  expect(ocupaDia(start, end, cursorDelDia('2026-10-02'), 'America/Bogota')).toBe(true);
  expect(ocupaSlot(start, end, cursorDelDia('2026-10-01'), 23, 'America/Bogota')).toBe(true);
  expect(ocupaSlot(start, end, cursorDelDia('2026-10-02'), 0, 'America/Bogota')).toBe(true);
  expect(ocupaSlot(start, end, cursorDelDia('2026-10-02'), 1, 'America/Bogota')).toBe(false);
});
test('un movimiento resuelve el offset de la fecha de destino tras DST', () => {
  const result = moverFechasEvento('2026-10-01T14:00:00Z', '2026-10-01T14:30:00Z', new Date('2026-11-02T05:00:00Z'), 9, 'America/New_York');
  expect(result.start_at).toBe('2026-11-02T14:00:00.000Z');
});
