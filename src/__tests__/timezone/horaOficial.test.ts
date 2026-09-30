/**
 * Hora oficial de las operaciones de dinero (src/lib/pos/reloj/horaOficial.ts).
 *
 * Mismos casos que la prueba en seco de `public.fn_hora_oficial_resolver`
 * (migración 20260930190001). Corre con TZ=UTC y TZ=America/Bogota
 * (`npm run test:tz-all`): el resultado no depende de la zona del proceso.
 */

import {
  HORA_DEL_SERVIDOR,
  UMBRAL_AVISO_MS,
  calcularDesfaseMs,
  desfaseRelevante,
  diaContable,
  minutosDeDesfase,
  resolverHoraOficial,
} from '@/lib/pos/reloj/horaOficial';

const BOGOTA = 'America/Bogota';
const MIN = 60_000;
const HORA = 60 * MIN;

describe('resolverHoraOficial (espejo de fn_hora_oficial_resolver)', () => {
  const ahora = new Date('2026-09-30T13:00:00Z');

  it('en línea la hora oficial es siempre la del servidor, aunque el equipo mande otra', () => {
    const r = resolverHoraOficial({ horaEquipo: new Date(ahora.getTime() - 3 * HORA), desfaseMs: 1000, sinConexion: false, ahoraServidor: ahora });
    expect(r.instante).toEqual(ahora);
    expect(r.motivoRevision).toBeNull();
  });

  it('sin conexión con desfase conocido ≤ 10 min conserva la hora del equipo', () => {
    const equipo = new Date(ahora.getTime() - 9 * HORA);
    const r = resolverHoraOficial({ horaEquipo: equipo.toISOString(), desfaseMs: 30_000, sinConexion: true, ahoraServidor: ahora });
    expect(r.instante).toEqual(equipo);
    expect(r.motivoRevision).toBeNull();
  });

  it('el umbral es inclusivo: exactamente 10 min todavía es fiable', () => {
    const equipo = new Date(ahora.getTime() - HORA);
    expect(resolverHoraOficial({ horaEquipo: equipo, desfaseMs: -10 * MIN, sinConexion: true, ahoraServidor: ahora }).motivoRevision).toBeNull();
    expect(resolverHoraOficial({ horaEquipo: equipo, desfaseMs: 10 * MIN + 1, sinConexion: true, ahoraServidor: ahora }).motivoRevision).toBe('reloj_desfasado');
  });

  it.each([
    ['reloj desfasado', 15 * MIN, -9 * HORA, 'reloj_desfasado'],
    ['desfase nunca medido', null, -9 * HORA, 'desfase_desconocido'],
    ['hora en el futuro', 0, HORA, 'hora_futura'],
    ['hora de hace más de 30 días', 0, -40 * 24 * HORA, 'hora_muy_antigua'],
  ] as const)('sin conexión con %s: hora del servidor y marcada para revisión', (_caso, desfase, delta, motivo) => {
    const r = resolverHoraOficial({ horaEquipo: new Date(ahora.getTime() + delta), desfaseMs: desfase, sinConexion: true, ahoraServidor: ahora });
    expect(r.instante).toEqual(ahora);
    expect(r.motivoRevision).toBe(motivo);
  });

  it('una hora del equipo ilegible cae a la del servidor sin marca (no hay nada que revisar)', () => {
    const r = resolverHoraOficial({ horaEquipo: 'no-es-fecha', desfaseMs: 0, sinConexion: true, ahoraServidor: ahora });
    expect(r.instante).toEqual(ahora);
    expect(r.motivoRevision).toBeNull();
  });
});

describe('día contable de una venta sin conexión (zona de la organización)', () => {
  // Venta a las 11:50 p. m. del 29/09 en Bogotá (04:50Z del 30/09), sincronizada
  // a las 8:00 a. m. del 30/09 en Bogotá (13:00Z).
  const venta = new Date('2026-09-30T04:50:00Z');
  const sincronizacion = new Date('2026-09-30T13:00:00Z');

  it('con el reloj al día, la venta cuenta el día en que se hizo', () => {
    expect(diaContable({ horaEquipo: venta, desfaseMs: 20_000, sinConexion: true, ahoraServidor: sincronizacion }, BOGOTA)).toBe('2026-09-29');
  });

  it('con el reloj desfasado 15 min, cuenta el día de la sincronización (y queda en revisión)', () => {
    expect(diaContable({ horaEquipo: venta, desfaseMs: 15 * MIN, sinConexion: true, ahoraServidor: sincronizacion }, BOGOTA)).toBe('2026-09-30');
  });

  it('en línea, el día es el del servidor aunque el reloj del equipo diga otro día', () => {
    const equipoAtrasado = new Date('2026-09-29T20:00:00Z');
    expect(diaContable({ horaEquipo: equipoAtrasado, desfaseMs: null, sinConexion: false, ahoraServidor: sincronizacion }, BOGOTA)).toBe('2026-09-30');
  });

  it('el día sale de la zona de la organización, no del proceso ni de UTC', () => {
    // 04:50Z es 30/09 en UTC y en Madrid, pero 29/09 en Bogotá.
    const entrada = { horaEquipo: venta, desfaseMs: 0, sinConexion: true, ahoraServidor: sincronizacion };
    expect(diaContable(entrada, 'UTC')).toBe('2026-09-30');
    expect(diaContable(entrada, BOGOTA)).toBe('2026-09-29');
  });
});

describe('medición del desfase y aviso', () => {
  it('toma el punto medio de la ida y vuelta (equipo − servidor)', () => {
    // El equipo va 5 min atrasado; la petición tardó 400 ms.
    const servidorMs = Date.parse('2026-09-30T13:00:00Z');
    const antesMs = servidorMs - 5 * MIN - 200;
    expect(calcularDesfaseMs({ antesMs, despuesMs: antesMs + 400, servidorMs })).toBe(-5 * MIN);
  });

  it('avisa solo por encima de 2 minutos, en cualquier sentido', () => {
    expect(desfaseRelevante(UMBRAL_AVISO_MS)).toBe(false);
    expect(desfaseRelevante(UMBRAL_AVISO_MS + 1)).toBe(true);
    expect(desfaseRelevante(-(UMBRAL_AVISO_MS + 1))).toBe(true);
    expect(desfaseRelevante(null)).toBe(false);
    expect(desfaseRelevante(Number.NaN)).toBe(false);
  });

  it('los minutos del aviso son enteros y positivos', () => {
    expect(minutosDeDesfase(-7 * MIN - 20_000)).toBe(7);
    expect(minutosDeDesfase(150_000)).toBe(3);
    expect(minutosDeDesfase(10_000)).toBe(1);
  });

  it("HORA_DEL_SERVIDOR es la cadena 'now' que Postgres resuelve con su reloj", () => {
    expect(HORA_DEL_SERVIDOR).toBe('now');
  });
});
