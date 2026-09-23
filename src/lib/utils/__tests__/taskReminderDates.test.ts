/**
 * Recordatorios de tareas: el día de vencimiento se calcula en la zona de la
 * organización, sin importar la TZ del proceso. Correr con
 * `npm run test:tz-all` (TZ=UTC y TZ=America/Bogota).
 */
import {
  diasEntre,
  diasHastaVencimiento,
  sumarDiasCalendario,
  ventanaRecordatorios,
} from '@/lib/utils/taskReminderDates';

const BOGOTA = 'America/Bogota';
// 22:00 del 22 de septiembre en Bogotá = 03:00 UTC del 23.
const NOCHE_BOGOTA = new Date('2026-09-23T03:00:00Z');

describe('taskReminderDates', () => {
  test('hoy sale de la zona de la organización, no de UTC', () => {
    expect(ventanaRecordatorios(BOGOTA, NOCHE_BOGOTA).hoy).toBe('2026-09-22');
    expect(ventanaRecordatorios('UTC', NOCHE_BOGOTA).hoy).toBe('2026-09-23');
  });

  test('la ventana cubre completo el día hoy + 7 en la zona de la organización', () => {
    expect(ventanaRecordatorios(BOGOTA, NOCHE_BOGOTA).hastaExclusivo).toBe('2026-09-30T00:00:00.000-05:00');
  });

  test('una tarea que vence a las 21:00 de hoy en Bogotá vence hoy (0), aunque en UTC ya sea mañana', () => {
    expect(diasHastaVencimiento('2026-09-23T02:00:00+00:00', '2026-09-22', BOGOTA)).toBe(0);
  });

  test('medianoche de mañana en Bogotá cuenta como 1 día', () => {
    expect(diasHastaVencimiento('2026-09-23T05:00:00+00:00', '2026-09-22', BOGOTA)).toBe(1);
  });

  test('vencida ayer da -1', () => {
    expect(diasHastaVencimiento('2026-09-21T23:59:00-05:00', '2026-09-22', BOGOTA)).toBe(-1);
  });

  test('aritmética de días calendario cruza meses y años', () => {
    expect(sumarDiasCalendario('2026-12-28', 7)).toBe('2027-01-04');
    expect(sumarDiasCalendario('2028-02-28', 1)).toBe('2028-02-29');
    expect(diasEntre('2026-12-28', '2027-01-04')).toBe(7);
    expect(diasEntre('2026-09-22', '2026-09-20')).toBe(-2);
  });
});
