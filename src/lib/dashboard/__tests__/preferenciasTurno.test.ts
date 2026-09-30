/**
 * Preferencias del inicio (qué se puede guardar y cómo se ordena) y estado de
 * «Tu turno» a partir del turno asignado y las marcaciones de HRM. Horas en
 * la zona de la organización (America/Bogota, UTC−5).
 */
import { desdeFila, moverModulo, ordenarModulos, validarPreferencias } from '../preferenciasInicio';
import { calcularTurno, partesDuracion } from '../turno';

describe('validarPreferencias', () => {
  const visibles = ['finance', 'pos', 'inventory'];

  test('descarta módulos que la persona no ve y deduplica', () => {
    expect(validarPreferencias({ bloquesOcultos: ['actividad'], modulosOrden: ['pos', 'pos', 'crm', 'finance'], modulosOcultos: ['hrm', 'inventory'] }, visibles)).toEqual({
      bloquesOcultos: ['actividad'],
      modulosOrden: ['pos', 'finance'],
      modulosOcultos: ['inventory'],
    });
  });

  test('«Hoy» no se puede ocultar y un bloque desconocido invalida el pedido', () => {
    expect(validarPreferencias({ bloquesOcultos: ['hoy'] }, visibles)).toBeNull();
  });

  test('formas inválidas: 400', () => {
    expect(validarPreferencias(null, visibles)).toBeNull();
    expect(validarPreferencias([], visibles)).toBeNull();
    expect(validarPreferencias({ modulosOrden: 'pos' }, visibles)).toBeNull();
    expect(validarPreferencias({ modulosOrden: [1] }, visibles)).toBeNull();
    expect(validarPreferencias({ modulosOrden: ["pos'; drop"] }, visibles)).toBeNull();
    expect(validarPreferencias({ modulosOrden: Array.from({ length: 61 }, () => 'pos') }, visibles)).toBeNull();
  });

  test('desdeFila tolera filas vacías o raras', () => {
    expect(desdeFila(null)).toEqual({ bloquesOcultos: [], modulosOrden: [], modulosOcultos: [] });
    expect(desdeFila({ bloques_ocultos: ['ventas', 'raro', 3], modulos_orden: null })).toEqual({ bloquesOcultos: ['ventas'], modulosOrden: [], modulosOcultos: [] });
  });
});

describe('orden de módulos', () => {
  const m = (codigo: string) => ({ codigo });
  test('primero los que la persona colocó, en su orden; el resto en el orden por defecto', () => {
    expect(ordenarModulos([m('finance'), m('pos'), m('inventory'), m('crm')], ['crm', 'pos']).map((x) => x.codigo)).toEqual(['crm', 'pos', 'finance', 'inventory']);
  });
  test('mover no se sale de la lista', () => {
    expect(moverModulo(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moverModulo(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moverModulo(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('calcularTurno', () => {
  const ZONA = 'America/Bogota';
  const turno = { inicio: '08:00:00', fin: '17:00:00' };
  const base = { hoy: '2026-09-30', zona: ZONA, turno };

  test('antes de la entrada', () => {
    const r = calcularTurno({ ...base, ahora: new Date('2026-09-30T12:30:00Z'), marcaciones: [] });
    expect(r.estado).toBe('antes');
    expect(r.entradaProgramada).toBe('2026-09-30T13:00:00.000Z');
  });

  test('sin marcar: minutos de retraso', () => {
    const r = calcularTurno({ ...base, ahora: new Date('2026-09-30T13:12:00Z'), marcaciones: [] });
    expect(r).toMatchObject({ estado: 'sinMarcar', minutos: 12 });
  });

  test('en turno: desde la entrada marcada', () => {
    const r = calcularTurno({ ...base, ahora: new Date('2026-09-30T16:14:00Z'), marcaciones: [{ tipo: 'check_in', en: '2026-09-30T12:58:00Z' }] });
    expect(r).toMatchObject({ estado: 'enTurno', entradaMarcada: '2026-09-30T12:58:00Z', minutos: 196 });
    expect(partesDuracion(r.minutos)).toEqual({ horas: 3, minutos: 16 });
  });

  test('cerrado: entrada y salida', () => {
    const r = calcularTurno({
      ...base,
      ahora: new Date('2026-09-30T23:00:00Z'),
      marcaciones: [
        { tipo: 'check_out', en: '2026-09-30T22:05:00Z' },
        { tipo: 'check_in', en: '2026-09-30T13:01:00Z' },
      ],
    });
    expect(r).toMatchObject({ estado: 'cerrado', minutos: 544 });
  });

  test('una marcación de ayer no abre el turno de hoy', () => {
    const r = calcularTurno({ ...base, ahora: new Date('2026-09-30T12:00:00Z'), marcaciones: [{ tipo: 'check_in', en: '2026-09-29T13:00:00Z' }] });
    expect(r.estado).toBe('antes');
  });

  test('turno nocturno: la salida es al día siguiente', () => {
    const r = calcularTurno({ ...base, turno: { inicio: '22:00', fin: '06:00' }, ahora: new Date('2026-10-01T02:00:00Z'), marcaciones: [] });
    expect(r.salidaProgramada).toBe('2026-10-01T11:00:00.000Z');
  });

  test('sin turno asignado', () => {
    expect(calcularTurno({ ...base, turno: null, ahora: new Date(), marcaciones: [] }).estado).toBe('sinTurno');
  });
});
