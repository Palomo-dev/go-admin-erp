import { evaluarProgramacion, minutosMinimosCampana } from '../nuevo/programacionCampanaLogica';
import { aFechaHoraLocal } from '@/components/crm/kit/fechasCrm';

const ahora = new Date('2026-10-01T00:00:00Z');
describe('programación independiente de la zona del proceso', () => {
  test.each([
    ['America/Bogota', '2026-10-02T10:00', '2026-10-02T15:00:00Z'],
    ['America/New_York', '2026-10-02T10:00', '2026-10-02T14:00:00Z'],
    ['Europe/Madrid', '2026-10-02T10:00', '2026-10-02T08:00:00Z'],
    ['Asia/Tokyo', '2026-10-02T10:00', '2026-10-02T01:00:00Z'],
    ['Pacific/Auckland', '2026-10-02T10:00', '2026-10-01T21:00:00Z'],
    ['UTC', '2026-10-02T10:00', '2026-10-02T10:00:00Z'],
  ])('%s interpreta la hora de pared y conserva la fecha al editar', (zona, local, utc) => {
    const r = evaluarProgramacion('scheduled', local, zona, ahora);
    expect(r.error).toBeNull();
    expect(new Date(r.instante!).getTime()).toBe(new Date(utc).getTime());
    expect(aFechaHoraLocal(r.instante, zona)).toBe(local);
  });
  test.each([
    ['', 'incompleta'], ['2026-10-01', 'invalida'], ['2026-02-30T10:00', 'invalida'],
    ['2026-10-02T25:00', 'invalida'], ['2026-09-30T19:00', 'pasada'],
  ])('fecha incompleta o inválida %s nunca significa enviar ahora', (local, error) => {
    expect(evaluarProgramacion('scheduled', local, 'America/Bogota', ahora)).toEqual({ instante: null, error });
  });
  test('rechaza el salto de horario y permite la hora posterior', () => {
    const inicio = new Date('2026-03-01T00:00:00Z');
    expect(evaluarProgramacion('scheduled', '2026-03-08T02:30', 'America/New_York', inicio).error).toBe('invalida');
    expect(evaluarProgramacion('scheduled', '2026-03-08T03:30', 'America/New_York', inicio).error).toBeNull();
  });
  test('solo una selección explícita permite inicio inmediato', () => {
    expect(evaluarProgramacion('now', '', 'America/Bogota', ahora)).toEqual({ instante: null, error: null });
    expect(evaluarProgramacion('scheduled', '2026-10-02T10:00', 'zona/inexistente', ahora).error).toBe('invalida');
  });
  test('revalida la fecha al enviar y la duración es un mínimo técnico', () => {
    const local = '2026-10-01T10:00';
    expect(evaluarProgramacion('scheduled', local, 'America/Bogota', ahora).error).toBeNull();
    expect(evaluarProgramacion('scheduled', local, 'America/Bogota', new Date('2026-10-01T15:00:01Z')).error).toBe('pasada');
    expect(minutosMinimosCampana(1000, 1)).toBe(17);
    expect(minutosMinimosCampana(1000, 10)).toBe(2);
  });
});
