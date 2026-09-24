/**
 * Política de reintentos de la cola de facturación electrónica:
 * espera 2, 4, 8 y 16 minutos, máximo 5 intentos, rechazos sin reintento y
 * organizaciones sin servicio activo sin gastar intentos.
 */

import {
  MAX_INTENTOS,
  esperaMinutos,
  clasificarHttp,
  decidirTrasFallo,
} from '@/lib/services/einvoicing/politicaReintentos';

const AHORA = new Date('2026-09-24T12:00:00.000Z');
const minutosDespues = (d: Date | null) => (d ? (d.getTime() - AHORA.getTime()) / 60000 : null);

describe('esperaMinutos', () => {
  test('2, 4, 8 y 16 minutos tras los intentos 1 a 4', () => {
    expect([1, 2, 3, 4].map(esperaMinutos)).toEqual([2, 4, 8, 16]);
  });
});

describe('clasificarHttp', () => {
  test.each([
    [null, 'pasajero'],
    [500, 'pasajero'],
    [502, 'pasajero'],
    [503, 'pasajero'],
    [429, 'pasajero'],
    [401, 'pasajero'],
    [408, 'pasajero'],
    [422, 'rechazo'],
    [409, 'rechazo'],
    [400, 'rechazo'],
    [404, 'rechazo'],
  ])('HTTP %p → %s', (status, clase) => {
    expect(clasificarHttp(status as number | null)).toBe(clase);
  });
});

describe('decidirTrasFallo', () => {
  test('fallo pasajero: la secuencia completa es 2, 4, 8, 16 min y el quinto queda failed', () => {
    const esperas: Array<number | null> = [];
    const estados: string[] = [];
    for (let previos = 0; previos < MAX_INTENTOS; previos++) {
      const d = decidirTrasFallo({ clase: 'pasajero', intentosPrevios: previos, ahora: AHORA });
      estados.push(d.estado);
      esperas.push(minutosDespues(d.siguienteIntento));
      expect(d.contarIntento).toBe(true);
    }
    expect(esperas).toEqual([2, 4, 8, 16, null]);
    expect(estados).toEqual(['pending', 'pending', 'pending', 'pending', 'failed']);
  });

  test('respeta max_attempts del job', () => {
    expect(decidirTrasFallo({ clase: 'pasajero', intentosPrevios: 1, maxIntentos: 2, ahora: AHORA }).estado).toBe('failed');
  });

  test('un rechazo (4xx) no se reintenta igual: queda rejected', () => {
    const d = decidirTrasFallo({ clase: 'rechazo', intentosPrevios: 0, ahora: AHORA });
    expect(d).toMatchObject({ estado: 'rejected', contarIntento: true, siguienteIntento: null });
  });

  test('datos incompletos: failed sin reintento automático', () => {
    expect(decidirTrasFallo({ clase: 'datos', intentosPrevios: 0, ahora: AHORA })).toMatchObject({ estado: 'failed', siguienteIntento: null });
  });

  test('servicio no activo: vuelve a la cola sin gastar intento', () => {
    expect(decidirTrasFallo({ clase: 'no_activado', intentosPrevios: 3, ahora: AHORA })).toMatchObject({
      estado: 'pending',
      contarIntento: false,
      siguienteIntento: null,
    });
  });
});
