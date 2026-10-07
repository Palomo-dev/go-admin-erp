/**
 * Ventana de marcación de una campaña (`voiceAgent/ventanaCampana.ts`).
 *
 * Incidente 2026-10-06 (org 125): con `schedule = {}` la campaña reclamaba a
 * las 00:00 de Bogotá. Ahora la franja de la Ley 2300 se aplica siempre y la
 * franja propia, si la hay, se suma (nunca amplía la legal).
 * Corre igual con `TZ=UTC` y `TZ=America/Bogota`: todo va con zona explícita.
 */

import {
  evaluarVentanaCampana,
  horarioPropioAbierto,
  zonaCampana,
} from '@/lib/services/crm/voiceAgent/ventanaCampana';
import { isWithinSchedule } from '@/lib/services/crm/voiceAgentService';

const bog = (iso: string) => new Date(`${iso}-05:00`); // hora de pared de Bogotá

describe('schedule vacío → franja legal de la Ley 2300 en la zona de la organización', () => {
  test.each([
    ['2026-10-06T00:00:03', false, 'martes 00:00 (intento del incidente)'],
    ['2026-10-06T06:59:59', false, 'martes 06:59'],
    ['2026-10-06T07:00:02', true, 'martes 07:00 (abre)'],
    ['2026-10-06T14:20:35', true, 'martes 14:20'],
    ['2026-10-06T18:59:00', true, 'martes 18:59'],
    ['2026-10-06T19:00:00', false, 'martes 19:00 (cierra, exclusivo)'],
    ['2026-10-10T07:30:00', false, 'sábado 07:30'],
    ['2026-10-10T08:00:00', true, 'sábado 08:00'],
    ['2026-10-10T15:00:00', false, 'sábado 15:00'],
    ['2026-10-11T11:00:00', false, 'domingo'],
    ['2026-10-12T11:00:00', false, 'lunes 12 de octubre, festivo'],
  ])('%s → %s (%s)', (iso, abierta) => {
    for (const schedule of [{}, null, undefined]) {
      expect(evaluarVentanaCampana(schedule, 'America/Bogota', bog(iso)).abierta).toBe(abierta);
    }
  });

  test('el motivo de cierre es la ley', () => {
    expect(evaluarVentanaCampana({}, 'America/Bogota', bog('2026-10-06T00:00:03'))).toEqual({
      abierta: false,
      zona: 'America/Bogota',
      motivo: 'ley2300',
    });
  });

  test('sin zona de organización se usa America/Bogota', () => {
    expect(zonaCampana({}, null)).toBe('America/Bogota');
    expect(evaluarVentanaCampana({}, null, bog('2026-10-06T00:00:03')).abierta).toBe(false);
  });
});

describe('schedule con franja propia', () => {
  test('se suma a la ley: 9–17 a las 08:00 de un martes está cerrada por la campaña', () => {
    expect(evaluarVentanaCampana({ start_hour: 9, end_hour: 17 }, 'America/Bogota', bog('2026-10-06T08:00:00'))).toMatchObject({
      abierta: false,
      motivo: 'horario_campana',
    });
    expect(evaluarVentanaCampana({ start_hour: 9, end_hour: 17 }, 'America/Bogota', bog('2026-10-06T09:00:00')).abierta).toBe(true);
  });

  test('una franja más amplia que la ley no la amplía: 6–22 a las 06:30 y a las 21:00 sigue cerrada', () => {
    const amplia = { start_hour: 6, end_hour: 22 };
    expect(evaluarVentanaCampana(amplia, 'America/Bogota', bog('2026-10-06T06:30:00'))).toMatchObject({ abierta: false, motivo: 'ley2300' });
    expect(evaluarVentanaCampana(amplia, 'America/Bogota', bog('2026-10-06T21:00:00'))).toMatchObject({ abierta: false, motivo: 'ley2300' });
  });

  test('days restringe los días (0 = domingo): solo lunes a miércoles', () => {
    const lmx = { start_hour: 8, end_hour: 18, days: [1, 2, 3] };
    expect(evaluarVentanaCampana(lmx, 'America/Bogota', bog('2026-10-06T10:00:00')).abierta).toBe(true); // martes
    expect(evaluarVentanaCampana(lmx, 'America/Bogota', bog('2026-10-08T10:00:00'))).toMatchObject({ motivo: 'horario_campana' }); // jueves
  });

  test('la zona del schedule manda sobre la de la organización', () => {
    // 07:30 en Bogotá = 06:30 en Ciudad de México: la ley está cerrada en México.
    const instante = bog('2026-10-06T07:30:00');
    expect(evaluarVentanaCampana({ timezone: 'America/Mexico_City' }, 'America/Bogota', instante).abierta).toBe(false);
    expect(evaluarVentanaCampana({}, 'America/Bogota', instante).abierta).toBe(true);
  });

  test('zona inválida → cerrada (fail-closed)', () => {
    expect(evaluarVentanaCampana({ timezone: 'Zona/Inexistente' }, 'America/Bogota', bog('2026-10-06T10:00:00'))).toMatchObject({
      abierta: false,
      motivo: 'zona_invalida',
    });
  });
});

describe('isWithinSchedule conserva su contrato (delegada en horarioPropioAbierto)', () => {
  test('sin horas propias no restringe; con zona inválida y horas, cierra', () => {
    expect(isWithinSchedule(null)).toBe(true);
    expect(isWithinSchedule({})).toBe(true);
    expect(isWithinSchedule({ start_hour: 8, end_hour: 20 }, 'Zona/Inexistente')).toBe(false);
  });

  test('misma respuesta que horarioPropioAbierto en la misma hora', () => {
    const s = { start_hour: 9, end_hour: 17, days: [1, 2, 3, 4, 5] };
    for (const iso of ['2026-10-06T08:59:00', '2026-10-06T09:00:00', '2026-10-06T16:59:00', '2026-10-06T17:00:00', '2026-10-11T10:00:00']) {
      expect(isWithinSchedule(s, 'America/Bogota', bog(iso))).toBe(horarioPropioAbierto(s, 'America/Bogota', bog(iso)));
    }
  });
});
