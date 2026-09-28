/**
 * V-a (docs/implementacion/CAJAS-VENTAS-PLAN.md §2.2): el rango de fechas del
 * listado de ventas sale de la zona y las horas de operación de la
 * organización, no de la zona del proceso. `npm run test:tz-all` lo corre con
 * seis zonas del sistema distintas y el resultado tiene que ser el mismo.
 *
 * El listado nuevo (`GET /api/pos/ventas`) calcula el rango en el servidor con
 * `getDateRange(desde, hasta, zonaOrganización, horasDeOperación)`; esta prueba
 * fija esos valores.
 */
import { getDateRange } from '@/lib/utils/dateRanges';

describe('Rango de días del listado de ventas en la zona de la organización', () => {
  test('un día en Bogotá cubre sus 24 horas locales', () => {
    expect(getDateRange('2026-09-24', '2026-09-24', 'America/Bogota')).toEqual({
      start: '2026-09-24T00:00:00.000-05:00',
      end: '2026-09-24T23:59:59.999-05:00',
    });
  });

  test('un rango incluye el último día completo', () => {
    const r = getDateRange('2026-09-01', '2026-09-30', 'America/Bogota');
    expect(new Date(r.start).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(r.end).toISOString()).toBe('2026-10-01T04:59:59.999Z');
  });

  test('con horas de operación que cruzan medianoche, el día operativo termina al día siguiente', () => {
    expect(getDateRange('2026-09-24', '2026-09-24', 'America/Bogota', { start_time: '20:00', end_time: '03:00' })).toEqual({
      start: '2026-09-24T20:00:00.000-05:00',
      end: '2026-09-25T03:00:00.000-05:00',
    });
  });

  test('otra organización en Madrid: el mismo día es otro intervalo', () => {
    const r = getDateRange('2026-09-24', '2026-09-24', 'Europe/Madrid');
    expect(new Date(r.start).toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });
});
