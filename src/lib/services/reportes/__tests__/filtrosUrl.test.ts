/**
 * Filtros del centro de reportes en la URL: ida y vuelta sin perder nada,
 * valores por defecto fuera de la URL, entradas inválidas descartadas y los
 * filtros que el reporte no admite quitados antes de ejecutar o exportar.
 */
import { aQuery, escribirFiltrosReportes, filtrosEfectivos, leerFiltrosReportes, parametrosDocumento, periodoComparado } from '../filtrosUrl';
import { etiquetaDePeriodo, etiquetaFranja } from '@/components/reportes/etiquetaPeriodo';

const HOY = '2026-09-30';
const q = (o: Record<string, string>) => new URLSearchParams(o);

describe('leerFiltrosReportes', () => {
  test('sin parámetros: el mes de hoy, sucursal del encabezado, sin comparativo', () => {
    const f = leerFiltrosReportes(q({}), HOY);
    expect(f.periodo).toMatchObject({ tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', horaInicio: null, horaFin: null });
    expect(f.sucursal).toBeUndefined();
    expect(f.comparar).toBeNull();
    expect(f.vista).toBeNull();
  });

  test('periodo con referencia, franja, sucursal, comparativo y vista', () => {
    const f = leerFiltrosReportes(q({ periodo: 'semanal', ref: '2026-09-10', hi: '16:00', hf: '02:00', sucursal: '3', comparar: 'anio-anterior', vista: 'por-cuenta' }), HOY);
    expect(f.periodo).toMatchObject({ tipo: 'semanal', fechaInicio: '2026-09-07', fechaFin: '2026-09-13', horaInicio: '16:00', horaFin: '02:00' });
    expect(f).toMatchObject({ sucursal: 3, comparar: 'anio-anterior', vista: 'por-cuenta' });
  });

  test('`todas` es el consolidado (null)', () => {
    expect(leerFiltrosReportes(q({ sucursal: 'todas' }), HOY).sucursal).toBeNull();
  });

  test('descarta lo inválido: tipo desconocido, referencia futura, franja a medias, sucursal no numérica, vista rara', () => {
    const f = leerFiltrosReportes(q({ periodo: 'bimestral', ref: '2027-01-01', hi: '16:00', sucursal: '3;drop', comparar: 'siempre', vista: '<script>' }), HOY);
    expect(f.periodo).toMatchObject({ tipo: 'mensual', fechaInicio: '2026-09-01', horaInicio: null, horaFin: null });
    expect(f).toMatchObject({ sucursal: undefined, comparar: null, vista: null });
  });

  test('personalizado con desde/hasta (en cualquier orden)', () => {
    const f = leerFiltrosReportes(q({ periodo: 'personalizado', desde: '2026-09-20', hasta: '2026-09-05' }), HOY);
    expect(f.periodo).toMatchObject({ tipo: 'personalizado', fechaInicio: '2026-09-05', fechaFin: '2026-09-20' });
  });
});

describe('escribirFiltrosReportes', () => {
  test('omite los valores por defecto', () => {
    expect(escribirFiltrosReportes(leerFiltrosReportes(q({}), HOY), HOY)).toEqual({});
    expect(aQuery({})).toBe('');
  });

  test('ida y vuelta', () => {
    const entrada = { periodo: 'quincenal', ref: '2026-08-01', hi: '08:00', hf: '14:00', sucursal: 'todas', comparar: 'anterior', vista: 'por-hora' };
    const f = leerFiltrosReportes(q(entrada), HOY);
    const salida = escribirFiltrosReportes(f, HOY);
    expect(salida).toEqual(entrada);
    expect(leerFiltrosReportes(q(salida), HOY)).toEqual(f);
  });

  test('personalizado lleva desde y hasta, no ref', () => {
    const f = leerFiltrosReportes(q({ periodo: 'personalizado', desde: '2026-09-01', hasta: '2026-09-15' }), HOY);
    expect(escribirFiltrosReportes(f, HOY)).toEqual({ periodo: 'personalizado', desde: '2026-09-01', hasta: '2026-09-15' });
  });
});

describe('filtrosEfectivos y documento', () => {
  const f = leerFiltrosReportes(q({ hi: '16:00', hf: '02:00', comparar: 'anterior', vista: 'por-cuenta' }), HOY);

  test('un reporte sin franja ni comparativo, de toda la organización, los ignora', () => {
    const e = filtrosEfectivos({ filtros: [], alcance: 'organizacion' }, f, 7);
    expect(e.periodo.horaInicio).toBeNull();
    expect(e.comparar).toBeNull();
    expect(e.sucursal).toBeNull();
  });

  test('un reporte de sucursal con franja y comparativo los conserva', () => {
    const e = filtrosEfectivos({ filtros: ['franja', 'comparativo', 'sucursal'], alcance: 'sucursal' }, f, 7);
    expect(e).toMatchObject({ sucursal: 7, comparar: 'anterior' });
    expect(parametrosDocumento(e)).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      parametros: { periodo: 'mensual', sucursal: '7', hi: '16:00', hf: '02:00', vista: 'por-cuenta', comparar: 'anterior' },
    });
  });

  test('periodo comparado', () => {
    expect(periodoComparado(f.periodo, 'anterior')).toMatchObject({ fechaInicio: '2026-08-01', fechaFin: '2026-08-31', horaInicio: '16:00' });
    expect(periodoComparado(f.periodo, 'anio-anterior')).toMatchObject({ fechaInicio: '2025-09-01', fechaFin: '2025-09-30' });
    expect(periodoComparado(f.periodo, null)).toBeNull();
  });
});

describe('etiquetaDePeriodo', () => {
  const t = (clave: 'trimestre' | 'semestre', v: { n: number; anio: number }) => `${clave === 'trimestre' ? 'T' : 'S'}${v.n} ${v.anio}`;

  test('mensual en español y en inglés, sin correr el día', () => {
    expect(etiquetaDePeriodo({ tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }, 'es-CO', t)).toBe('Septiembre de 2026');
    expect(etiquetaDePeriodo({ tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }, 'en-US', t)).toBe('September 2026');
  });

  test('trimestre, semestre y año', () => {
    expect(etiquetaDePeriodo({ tipo: 'trimestral', fechaInicio: '2026-07-01', fechaFin: '2026-09-30' }, 'es-CO', t)).toBe('T3 2026');
    expect(etiquetaDePeriodo({ tipo: 'semestral', fechaInicio: '2026-07-01', fechaFin: '2026-12-31' }, 'es-CO', t)).toBe('S2 2026');
    expect(etiquetaDePeriodo({ tipo: 'anual', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' }, 'es-CO', t)).toBe('2026');
  });

  test('día y rango', () => {
    expect(etiquetaDePeriodo({ tipo: 'diario', fechaInicio: '2026-09-01', fechaFin: '2026-09-01' }, 'es-CO', t)).toBe('1 sep 2026');
    expect(etiquetaDePeriodo({ tipo: 'semanal', fechaInicio: '2026-09-07', fechaFin: '2026-09-13' }, 'es-CO', t)).toBe('7 – 13 sep 2026');
  });

  test('franja', () => {
    expect(etiquetaFranja({ horaInicio: null, horaFin: null }, 'es-CO')).toBeNull();
    expect(etiquetaFranja({ horaInicio: '16:00', horaFin: '02:00' }, 'en-US')).toBe('4:00 PM – 2:00 AM');
  });
});
