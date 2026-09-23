// ============================================================
// Fase A2 — DST a prueba de balas.
//
// Estos tests fijan el comportamiento de las utilidades de fecha en
// los cuatro casos que el calculo "offset fijo del mediodia" hacia mal:
//
//   1. Medianoche inexistente (salto de primavera).
//      America/Santiago pasa de 23:59 del 05/09/2026 a 01:00 del 06/09.
//      El dia 2026-09-06 NO tiene 00:00.
//   2. Hora repetida (vuelta al horario estandar). El dia dura 25 h.
//      America/Santiago repite las 23:00 del 04/04/2026.
//   3. Offset no constante dentro de un rango. Europe/Madrid cambia
//      el 29/03/2026: un rango 01/03 -> 01/04 tiene un offset en cada
//      extremo (+01:00 y +02:00).
//   4. Offsets que no son horas enteras: Asia/Kathmandu (+05:45) y
//      Australia/Lord_Howe (DST de 30 minutos, +10:30 / +11:00).
//
// Instantes reales verificados contra Intl (ICU 76):
//   Santiago  2026-09-06T04:00:00Z = 01:00 -03:00 (primer instante del dia)
//   Santiago  2026-04-05T02:00:00Z = 23:00 -03:00 (primera vez)
//   Santiago  2026-04-05T03:00:00Z = 23:00 -04:00 (segunda vez)
//   Lord_Howe 2026-10-03T15:30:00Z = 02:30 +11:00 (tras el salto de 30 min)
//   Lord_Howe 2026-04-04T14:30:00Z = 01:30 +11:00 / 15:00:00Z = 01:30 +10:30
//
// Los tests son independientes del TZ del runtime: la matriz de CI los
// corre en UTC, Bogota, Ciudad de Mexico, Madrid, Santiago y Katmandu.
// ============================================================

import {
  getDayRange,
  getDateRange,
  getOffsetMinutesForTimezone,
  offsetMinutesToISO,
  plainDateToInstant,
} from '@/lib/utils/timezone';

const SANTIAGO = 'America/Santiago';
const MADRID = 'Europe/Madrid';
const KATMANDU = 'Asia/Kathmandu';
const LORD_HOWE = 'Australia/Lord_Howe';
const BOGOTA = 'America/Bogota';

/** Hora de pared (YYYY-MM-DD HH:mm) que un instante representa en una zona. */
function horaLocal(iso: string, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return dtf.format(new Date(iso)).replace(',', '');
}

/** Duracion en horas de un rango devuelto por getDayRange/getDateRange. */
function horasDelRango(rango: { start: string; end: string }): number {
  const ms = new Date(rango.end).getTime() - new Date(rango.start).getTime();
  return ms / 3_600_000;
}

describe('A2.1 — medianoche inexistente (salto de primavera, America/Santiago)', () => {
  it('plainDateToInstant a las 00:00 del dia sin medianoche cae en la primera hora que existe', () => {
    const iso = plainDateToInstant('2026-09-06', SANTIAGO, '00:00');
    // 00:00 no existe: el reloj salta de 23:59 (05/09) a 01:00 (06/09).
    // El instante resuelto es el primero del dia: 01:00 -03:00.
    expect(new Date(iso).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(horaLocal(iso, SANTIAGO)).toBe('2026-09-06 01:00');
  });

  it('el instante resuelto NO cae en el dia anterior', () => {
    const iso = plainDateToInstant('2026-09-06', SANTIAGO, '00:00');
    expect(horaLocal(iso, SANTIAGO).startsWith('2026-09-06')).toBe(true);
  });

  it('una hora que si existe se resuelve sin desplazamiento', () => {
    const iso = plainDateToInstant('2026-09-06', SANTIAGO, '12:00');
    expect(horaLocal(iso, SANTIAGO)).toBe('2026-09-06 12:00');
    expect(new Date(iso).toISOString()).toBe('2026-09-06T15:00:00.000Z');
  });

  it('getDayRange del dia del salto empieza en la hora real (01:00), no en 00:00', () => {
    const { start, end } = getDayRange('2026-09-06', SANTIAGO);
    expect(new Date(start).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(horaLocal(start, SANTIAGO)).toBe('2026-09-06 01:00');
    // El fin es el ultimo milisegundo del dia local.
    expect(new Date(end).toISOString()).toBe('2026-09-07T02:59:59.999Z');
    expect(horaLocal(end, SANTIAGO)).toBe('2026-09-06 23:59');
  });

  it('el dia del salto dura 23 horas', () => {
    const rango = getDayRange('2026-09-06', SANTIAGO);
    expect(horasDelRango(rango)).toBeCloseTo(23, 3);
  });

  it('no deja fuera la primera venta del dia ni cuela la ultima del dia anterior', () => {
    const { start } = getDayRange('2026-09-06', SANTIAGO);
    const ultimaDelDiaAnterior = new Date('2026-09-06T03:59:59.999Z'); // 23:59 del 05/09
    const primeraDelDia = new Date('2026-09-06T04:00:00.000Z'); // 01:00 del 06/09
    expect(ultimaDelDiaAnterior.getTime() < new Date(start).getTime()).toBe(true);
    expect(primeraDelDia.getTime() >= new Date(start).getTime()).toBe(true);
  });
});

describe('A2.2 — hora repetida (vuelta al estandar, America/Santiago)', () => {
  it('el dia con hora repetida dura 25 horas', () => {
    const rango = getDayRange('2026-04-04', SANTIAGO);
    expect(horasDelRango(rango)).toBeCloseTo(25, 3);
  });

  it('el rango cubre las dos veces que se viven las 23:00', () => {
    const { start, end } = getDayRange('2026-04-04', SANTIAGO);
    const inicio = new Date(start).getTime();
    const fin = new Date(end).getTime();
    const primeraVez = new Date('2026-04-05T02:30:00.000Z').getTime(); // 23:30 -03:00
    const segundaVez = new Date('2026-04-05T03:30:00.000Z').getTime(); // 23:30 -04:00
    expect(primeraVez >= inicio && primeraVez <= fin).toBe(true);
    expect(segundaVez >= inicio && segundaVez <= fin).toBe(true);
  });

  it('el rango empieza y termina donde debe', () => {
    const { start, end } = getDayRange('2026-04-04', SANTIAGO);
    expect(new Date(start).toISOString()).toBe('2026-04-04T03:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-04-05T03:59:59.999Z');
  });

  it('una hora ambigua se resuelve en su primera ocurrencia', () => {
    const iso = plainDateToInstant('2026-04-04', SANTIAGO, '23:30');
    expect(new Date(iso).toISOString()).toBe('2026-04-05T02:30:00.000Z');
  });

  it('el dia siguiente no empieza antes de que termine el anterior', () => {
    const anterior = getDayRange('2026-04-04', SANTIAGO);
    const siguiente = getDayRange('2026-04-05', SANTIAGO);
    expect(new Date(siguiente.start).getTime()).toBe(new Date(anterior.end).getTime() + 1);
  });
});

describe('A2.3 — offset no constante dentro de un rango (Europe/Madrid)', () => {
  it('getDateRange calcula el offset por extremo, no uno fijo', () => {
    const { start, end } = getDateRange('2026-03-01', '2026-04-01', MADRID);
    // 01/03 esta en horario estandar (+01:00); 01/04 ya en verano (+02:00).
    expect(new Date(start).toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-04-01T21:59:59.999Z');
    expect(horaLocal(start, MADRID)).toBe('2026-03-01 00:00');
    expect(horaLocal(end, MADRID)).toBe('2026-04-01 23:59');
  });

  it('el rango dura una hora menos que 32 dias exactos (la hora que se perdio)', () => {
    const rango = getDateRange('2026-03-01', '2026-04-01', MADRID);
    const horas = horasDelRango(rango);
    expect(horas).toBeCloseTo(32 * 24 - 1, 2);
  });

  it('el dia del salto de Madrid dura 23 horas y el de la vuelta 25', () => {
    expect(horasDelRango(getDayRange('2026-03-29', MADRID))).toBeCloseTo(23, 3);
    expect(horasDelRango(getDayRange('2026-10-25', MADRID))).toBeCloseTo(25, 3);
  });

  it('un rango que no cruza el cambio sigue midiendo dias completos', () => {
    const rango = getDateRange('2026-05-01', '2026-05-31', MADRID);
    expect(horasDelRango(rango)).toBeCloseTo(31 * 24, 2);
  });
});

describe('A2.4 — offsets que no son horas enteras', () => {
  it('Asia/Kathmandu se escribe +05:45', () => {
    const offset = getOffsetMinutesForTimezone(KATMANDU, new Date('2026-06-01T12:00:00Z'));
    expect(offset).toBe(345);
    expect(offsetMinutesToISO(offset)).toBe('+05:45');
  });

  it('el dia de Katmandu empieza 5 h 45 min antes que en UTC', () => {
    const { start, end } = getDayRange('2026-06-01', KATMANDU);
    expect(new Date(start).toISOString()).toBe('2026-05-31T18:15:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-06-01T18:14:59.999Z');
    expect(horaLocal(start, KATMANDU)).toBe('2026-06-01 00:00');
  });

  it('Australia/Lord_Howe alterna +11:00 y +10:30', () => {
    const verano = getOffsetMinutesForTimezone(LORD_HOWE, new Date('2026-01-01T00:00:00Z'));
    const invierno = getOffsetMinutesForTimezone(LORD_HOWE, new Date('2026-07-01T00:00:00Z'));
    expect(offsetMinutesToISO(verano)).toBe('+11:00');
    expect(offsetMinutesToISO(invierno)).toBe('+10:30');
  });

  it('el DST de 30 minutos de Lord Howe produce dias de 23.5 h y 24.5 h', () => {
    expect(horasDelRango(getDayRange('2026-10-04', LORD_HOWE))).toBeCloseTo(23.5, 3);
    expect(horasDelRango(getDayRange('2026-04-05', LORD_HOWE))).toBeCloseTo(24.5, 3);
  });

  it('las 02:00 que no existen en Lord Howe se resuelven a las 02:30', () => {
    const iso = plainDateToInstant('2026-10-04', LORD_HOWE, '02:00');
    expect(new Date(iso).toISOString()).toBe('2026-10-03T15:30:00.000Z');
    expect(horaLocal(iso, LORD_HOWE)).toBe('2026-10-04 02:30');
  });

  it('offsetMinutesToISO no redondea a horas enteras ni pierde los minutos', () => {
    expect(offsetMinutesToISO(345)).toBe('+05:45');
    expect(offsetMinutesToISO(-270)).toBe('-04:30');
    expect(offsetMinutesToISO(630)).toBe('+10:30');
    expect(offsetMinutesToISO(-300)).toBe('-05:00');
  });

  it('offsetMinutesToISO escribe UTC como +00:00', () => {
    expect(offsetMinutesToISO(0)).toBe('+00:00');
  });

  it('getOffsetMinutesForTimezone devuelve minutos enteros aunque el instante tenga milisegundos', () => {
    const offset = getOffsetMinutesForTimezone(KATMANDU, new Date('2026-06-01T12:00:00.500Z'));
    expect(Number.isInteger(offset)).toBe(true);
    expect(offsetMinutesToISO(offset)).toBe('+05:45');
  });
});

describe('A2.5 — las zonas sin DST no cambian de comportamiento', () => {
  it('Bogota sigue produciendo el rango de siempre', () => {
    const { start, end } = getDayRange('2026-08-15', BOGOTA);
    expect(start).toBe('2026-08-15T00:00:00.000-05:00');
    expect(end).toBe('2026-08-15T23:59:59.999-05:00');
  });

  it('Bogota con horas de operacion que cruzan medianoche', () => {
    const { start, end } = getDayRange('2026-08-15', BOGOTA, {
      start_time: '20:00',
      end_time: '03:00',
    });
    expect(new Date(start).toISOString()).toBe('2026-08-16T01:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-08-16T08:00:00.000Z');
  });

  it('un rango de Bogota mide dias completos', () => {
    const rango = getDateRange('2026-08-01', '2026-08-31', BOGOTA);
    expect(horasDelRango(rango)).toBeCloseTo(31 * 24, 2);
  });

  it('horas de operacion sobre el dia del salto usan el offset de cada extremo', () => {
    // 20:00 del 05/09 (-04:00) a 03:00 del 06/09 (-03:00, ya tras el salto).
    const { start, end } = getDayRange('2026-09-05', SANTIAGO, {
      start_time: '20:00',
      end_time: '03:00',
    });
    expect(new Date(start).toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-09-06T06:00:00.000Z');
    expect(horaLocal(end, SANTIAGO)).toBe('2026-09-06 03:00');
  });
});
