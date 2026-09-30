/**
 * Rango del selector de periodo del inicio (`calcularRangoPeriodo`): la regla
 * única que comparten los KPIs del navegador y las rutas del servidor
 * (ventas, tienda web, módulos). Zona de la organización, nunca la del
 * proceso: se prueba igual con TZ=UTC y TZ=America/Bogota.
 */
import { calcularRangoPeriodo, leerPeriodo, queryPeriodo } from '../periodo';

const ZONA = 'America/Bogota';
// 2026-09-30 15:30 en Bogotá = 20:30 UTC.
const AHORA = new Date('2026-09-30T20:30:00Z');
const base = { hoyOperativo: '2026-09-30', zona: ZONA, horasOrg: null, ahora: AHORA };

describe('calcularRangoPeriodo', () => {
  test('hoy: desde la medianoche de la organización hasta ahora, contra ayer a esta misma hora', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: 'hoy' });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-30T05:00:00.000Z');
    expect(r.fin).toBe(AHORA.toISOString());
    expect(new Date(r.inicioAnterior).toISOString()).toBe('2026-09-29T05:00:00.000Z');
    expect(r.finAnterior).toBe('2026-09-29T20:30:00.000Z');
  });

  test('ayer: el día completo de ayer contra el de antier', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: 'ayer' });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-29T05:00:00.000Z');
    expect(new Date(r.fin).toISOString()).toBe('2026-09-30T04:59:59.999Z');
    expect(new Date(r.inicioAnterior).toISOString()).toBe('2026-09-28T05:00:00.000Z');
    expect(new Date(r.finAnterior).toISOString()).toBe('2026-09-29T04:59:59.999Z');
  });

  test('7 días: los 7 anteriores terminan donde empieza el actual', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: '7d' });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-23T05:00:00.000Z');
    expect(new Date(r.inicioAnterior).toISOString()).toBe('2026-09-16T05:00:00.000Z');
    expect(r.finAnterior).toBe(r.inicio);
    expect(r.fin).toBe(AHORA.toISOString());
  });

  test('personalizado: el anterior es el rango de igual número de días justo antes', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: 'personalizado', fechas: { fechaInicio: '2026-09-01', fechaFin: '2026-09-10' } });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(r.fin).toISOString()).toBe('2026-09-11T04:59:59.999Z');
    expect(new Date(r.inicioAnterior).toISOString()).toBe('2026-08-22T05:00:00.000Z');
    expect(r.finAnterior).toBe(r.inicio);
  });

  test('personalizado sin fechas se comporta como hoy', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: 'personalizado', fechas: null });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-30T05:00:00.000Z');
  });

  test('el filtro de horas completo manda sobre las horas de la organización', () => {
    const r = calcularRangoPeriodo({ ...base, periodo: 'hoy', horas: { horaInicio: '08:00', horaFin: '18:00' } });
    expect(new Date(r.inicio).toISOString()).toBe('2026-09-30T13:00:00.000Z');
  });
});

describe('leerPeriodo', () => {
  const q = (s: string) => leerPeriodo(new URLSearchParams(s));

  test('sin periodo: hoy', () => {
    expect(q('')).toEqual({ periodo: 'hoy', horas: null, fechas: null });
  });

  test('rechaza periodos, horas y fechas inválidos', () => {
    expect(q('periodo=semana')).toBeNull();
    expect(q('periodo=hoy&horaInicio=25:00')).toBeNull();
    expect(q('periodo=personalizado&desde=2026-09-10&hasta=2026-09-01')).toBeNull();
    expect(q('periodo=personalizado&desde=2026-09-10')).toBeNull();
    expect(q('periodo=personalizado&desde=2024-01-01&hasta=2026-01-01')).toBeNull();
  });

  test('personalizado válido y horas', () => {
    expect(q('periodo=personalizado&desde=2026-09-01&hasta=2026-09-10&horaInicio=08:00')).toEqual({
      periodo: 'personalizado',
      horas: { horaInicio: '08:00', horaFin: null },
      fechas: { fechaInicio: '2026-09-01', fechaFin: '2026-09-10' },
    });
  });

  test('queryPeriodo y leerPeriodo son inversas', () => {
    const qs = queryPeriodo({ periodo: 'personalizado', fechas: { fechaInicio: '2026-09-01', fechaFin: '2026-09-02' }, horas: { horaInicio: '07:00', horaFin: '15:00' }, sucursal: 7 });
    const p = new URLSearchParams(qs);
    expect(p.get('sucursal')).toBe('7');
    expect(leerPeriodo(p)).toEqual({
      periodo: 'personalizado',
      horas: { horaInicio: '07:00', horaFin: '15:00' },
      fechas: { fechaInicio: '2026-09-01', fechaFin: '2026-09-02' },
    });
  });
});
