/**
 * Kit · totales: qué filas pinta `ResumenTotales` (orden, signo, agrupación
 * de impuestos, retenciones y neto) sin calcular nada del negocio.
 */
import { crearFormateadorMoneda, contextoMoneda } from '@/lib/utils/moneda';
import { agruparImpuestos, filasResumen, formatearTarifa, importeConSigno } from '../resumenTotalesLogica';

describe('resumenTotales: agrupar impuestos', () => {
  test('mismo nombre y tarifa = una fila; suma base e importe', () => {
    const g = agruparImpuestos([
      { nombre: 'IVA', tarifa: 19, base: 100, importe: 19 },
      { nombre: 'iva', tarifa: 19, base: 200, importe: 38 },
      { nombre: 'IVA', tarifa: 5, base: 100, importe: 5 },
      { nombre: 'INC', tarifa: 8, base: 50, importe: 4 },
    ]);
    expect(g).toEqual([
      { nombre: 'IVA', tarifa: 19, base: 300, importe: 57 },
      { nombre: 'INC', tarifa: 8, base: 50, importe: 4 },
      { nombre: 'IVA', tarifa: 5, base: 100, importe: 5 },
    ]);
  });

  test('en cero se descarta, salvo el exento (tarifa 0); sin nombre se ignora', () => {
    const g = agruparImpuestos([
      { nombre: 'IVA', tarifa: 19, importe: 0 },
      { nombre: 'Exento', tarifa: 0, importe: 0 },
      { nombre: '  ', tarifa: 19, importe: 10 },
    ]);
    expect(g.map((x) => x.nombre)).toEqual(['Exento']);
    expect(agruparImpuestos(null)).toEqual([]);
  });
});

describe('resumenTotales: filas', () => {
  test('orden del manual y signos', () => {
    const filas = filasResumen({
      subtotal: 100000,
      descuentos: [{ etiqueta: 'Descuento general', importe: 5000 }],
      cargos: [{ etiqueta: 'Flete', importe: 8000 }],
      impuestos: [{ nombre: 'IVA', tarifa: 19, importe: 18050 }],
      total: 121050,
    });
    expect(filas.map((f) => [f.tipo, f.signo])).toEqual([
      ['subtotal', 1],
      ['descuento', -1],
      ['cargo', 1],
      ['impuesto', 1],
      ['total', 1],
    ]);
    expect(filas.find((f) => f.tipo === 'total')).toMatchObject({ tono: 'fuerte', separadorAntes: true, importe: 121050 });
    expect(filas.find((f) => f.tipo === 'descuento')?.tono).toBe('exito');
  });

  test('descuentos y cargos en cero no ocupan fila', () => {
    const filas = filasResumen({ subtotal: 10, descuentos: [{ etiqueta: 'x', importe: 0 }], cargos: [{ etiqueta: 'y', importe: 0 }], total: 10 });
    expect(filas.map((f) => f.tipo)).toEqual(['subtotal', 'total']);
  });

  test('impuestos incluidos: filas informativas (signo 0)', () => {
    const filas = filasResumen({ subtotal: 119, impuestos: [{ nombre: 'IVA', tarifa: 19, importe: 19 }], total: 119, impuestosIncluidos: true });
    expect(filas.find((f) => f.tipo === 'impuesto')?.signo).toBe(0);
  });

  test('retenciones después del total, con sangría, y el neto que manda el servicio', () => {
    const filas = filasResumen({
      subtotal: 1000,
      impuestos: [{ nombre: 'IVA', tarifa: 19, base: 1000, importe: 190 }],
      total: 1190,
      retenciones: [{ nombre: 'ReteFuente', tarifa: 2.5, base: 1000, importe: 25 }],
      neto: 1165,
      mostrarBases: true,
    });
    expect(filas.map((f) => f.tipo)).toEqual(['subtotal', 'impuesto', 'total', 'retencion', 'neto']);
    expect(filas.find((f) => f.tipo === 'retencion')).toMatchObject({ signo: -1, sangria: 1, base: 1000 });
    expect(filas.find((f) => f.tipo === 'impuesto')?.base).toBe(1000);
    expect(filas.find((f) => f.tipo === 'neto')?.importe).toBe(1165);
  });

  test('sin retenciones y neto igual al total, no se repite la fila', () => {
    expect(filasResumen({ subtotal: 1, total: 1, neto: 1 }).map((f) => f.tipo)).toEqual(['subtotal', 'total']);
  });

  test('sin mostrarBases, la base no viaja', () => {
    const filas = filasResumen({ subtotal: 1, impuestos: [{ nombre: 'IVA', tarifa: 19, base: 1, importe: 1 }], total: 2 });
    expect(filas.find((f) => f.tipo === 'impuesto')?.base).toBeUndefined();
  });
});

describe('resumenTotales: formato', () => {
  test('tarifa en el idioma', () => {
    expect(formatearTarifa(19, 'en-US')).toBe('19%');
    expect(formatearTarifa(2.5, 'es-CO')).toMatch(/^2,5\s?%$/);
    expect(formatearTarifa(null, 'es-CO')).toBeNull();
  });

  test('signo tipográfico y la moneda que llega, nunca pesos por defecto', () => {
    const usd = crearFormateadorMoneda(contextoMoneda('USD', { locale: 'en-US' }));
    expect(importeConSigno(usd, 5, -1)).toBe('−$5.00');
    expect(importeConSigno(usd, 5, 1)).toBe('$5.00');
    expect(importeConSigno(usd, -5, 1)).toBe('−$5.00');
    expect(importeConSigno(usd, 0, -1)).toBe('$0.00');
    const cop = crearFormateadorMoneda(contextoMoneda('COP', { locale: 'es-CO' }));
    expect(importeConSigno(cop, 1500, 1)).toMatch(/1\.500/);
    expect(importeConSigno(cop, 1500, 1)).not.toMatch(/,00/);
  });
});
