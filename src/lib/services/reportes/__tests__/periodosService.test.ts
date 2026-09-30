import {
  esCierreCerrado,
  normalizarPeriodo,
  periodoAnioAnterior,
  periodoAnterior,
  periodoSiguiente,
  resolverPeriodo,
} from '../periodosService';

// Todo sobre fechas planas: el resultado no depende de la zona del proceso
// (`npm run test:tz-all` corre este archivo con TZ=UTC y TZ=America/Bogota).

describe('resolverPeriodo', () => {
  it('diario es el mismo día', () => {
    const p = resolverPeriodo('diario', '2026-09-30');
    expect([p.fechaInicio, p.fechaFin]).toEqual(['2026-09-30', '2026-09-30']);
    expect(p.etiqueta).toBe('Cierre diario — 30/09/2026');
  });

  it('semanal va de lunes a domingo', () => {
    const p = resolverPeriodo('semanal', '2026-09-30'); // miércoles
    expect([p.fechaInicio, p.fechaFin]).toEqual(['2026-09-28', '2026-10-04']);
    const domingo = resolverPeriodo('semanal', '2026-10-04');
    expect(domingo.fechaInicio).toBe('2026-09-28');
  });

  it('quincenal parte en el 15 y la segunda llega al último día', () => {
    expect(resolverPeriodo('quincenal', '2026-02-15').fechaFin).toBe('2026-02-15');
    const segunda = resolverPeriodo('quincenal', '2026-02-16');
    expect([segunda.fechaInicio, segunda.fechaFin]).toEqual(['2026-02-16', '2026-02-28']);
    expect(resolverPeriodo('quincenal', '2028-02-20').fechaFin).toBe('2028-02-29');
  });

  it('mensual, trimestral, semestral y anual', () => {
    expect(resolverPeriodo('mensual', '2026-09-30')).toMatchObject({ fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Cierre mensual — Septiembre 2026' });
    expect(resolverPeriodo('trimestral', '2026-08-10')).toMatchObject({ fechaInicio: '2026-07-01', fechaFin: '2026-09-30' });
    expect(resolverPeriodo('semestral', '2026-06-30')).toMatchObject({ fechaInicio: '2026-01-01', fechaFin: '2026-06-30' });
    expect(resolverPeriodo('anual', '2026-03-01')).toMatchObject({ fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  });

  it('personalizado ordena las puntas y sin rango usa los últimos 30 días', () => {
    const p = resolverPeriodo('personalizado', '2026-09-30', { from: '2026-09-20', to: '2026-09-10' });
    expect([p.fechaInicio, p.fechaFin]).toEqual(['2026-09-10', '2026-09-20']);
    const def = resolverPeriodo('personalizado', '2026-09-30');
    expect([def.fechaInicio, def.fechaFin]).toEqual(['2026-09-01', '2026-09-30']);
  });
});

describe('periodoAnterior y periodoSiguiente', () => {
  it('cruzan el cambio de año', () => {
    const enero = resolverPeriodo('mensual', '2027-01-15');
    expect(periodoAnterior(enero)).toMatchObject({ fechaInicio: '2026-12-01', fechaFin: '2026-12-31' });
    const diciembre = resolverPeriodo('mensual', '2026-12-05');
    expect(periodoSiguiente(diciembre, '2027-01-02')).toMatchObject({ fechaInicio: '2027-01-01', fechaFin: '2027-01-31' });
  });

  it('el siguiente no pasa de hoy', () => {
    expect(periodoSiguiente(resolverPeriodo('mensual', '2026-09-30'), '2026-09-30')).toBeNull();
  });

  it('conservan la franja', () => {
    const p = { ...resolverPeriodo('diario', '2026-09-30'), horaInicio: '20:00', horaFin: '03:00' };
    expect(periodoAnterior(p)).toMatchObject({ fechaInicio: '2026-09-29', horaInicio: '20:00', horaFin: '03:00' });
  });

  it('el personalizado se desplaza con la misma cantidad de días', () => {
    const p = resolverPeriodo('personalizado', '2026-09-30', { from: '2026-09-11', to: '2026-09-20' });
    expect(periodoAnterior(p)).toMatchObject({ fechaInicio: '2026-09-01', fechaFin: '2026-09-10' });
  });

  it('año anterior respeta el 29 de febrero', () => {
    const p = resolverPeriodo('quincenal', '2028-02-20');
    expect(periodoAnioAnterior(p)).toMatchObject({ fechaInicio: '2027-02-16', fechaFin: '2027-02-28' });
  });
});

describe('esCierreCerrado', () => {
  it('solo cuando el último día ya pasó', () => {
    const p = resolverPeriodo('mensual', '2026-09-10');
    expect(esCierreCerrado(p, '2026-09-30')).toBe(false);
    expect(esCierreCerrado(p, '2026-10-01')).toBe(true);
  });
});

describe('normalizarPeriodo', () => {
  it('recalcula la etiqueta y descarta la del cliente', () => {
    const p = normalizarPeriodo({ tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: '<script>' });
    expect(p?.etiqueta).toBe('Cierre mensual — Septiembre 2026');
  });

  it('rechaza tipos, fechas y rangos inválidos', () => {
    expect(normalizarPeriodo({ tipo: 'bimestral', fechaInicio: '2026-09-01', fechaFin: '2026-09-30' })).toBeNull();
    expect(normalizarPeriodo({ tipo: 'mensual', fechaInicio: '2026-02-30', fechaFin: '2026-03-01' })).toBeNull();
    expect(normalizarPeriodo({ tipo: 'mensual', fechaInicio: '2026-09-30', fechaFin: '2026-09-01' })).toBeNull();
    expect(normalizarPeriodo(null)).toBeNull();
  });

  it('solo conserva la franja si trae las dos horas válidas', () => {
    expect(normalizarPeriodo({ tipo: 'diario', fechaInicio: '2026-09-30', fechaFin: '2026-09-30', horaInicio: '20:00', horaFin: '25:00' }))
      .toMatchObject({ horaInicio: null, horaFin: null });
    expect(normalizarPeriodo({ tipo: 'diario', fechaInicio: '2026-09-30', fechaFin: '2026-09-30', horaInicio: '20:00', horaFin: '03:00' }))
      .toMatchObject({ horaInicio: '20:00', horaFin: '03:00' });
  });
});
