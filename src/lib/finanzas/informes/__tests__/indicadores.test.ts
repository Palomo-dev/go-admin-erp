import {
  comportamientoCosto, generarIndicadores,
  type CuentaIndicador, type PeriodoBaseIndicadores,
} from '../indicadores';

const cuentas: CuentaIndicador[] = [
  { account_code: '1205', name: 'Inversiones temporales', clasificacion_corriente: 'corriente' },
  { account_code: '1705', name: 'Anticipados', clasificacion_corriente: 'corriente' },
  { account_code: '2105', name: 'Obligaciones', clasificacion_corriente: 'corriente' },
  { account_code: '2205', name: 'Proveedores', clasificacion_corriente: 'corriente' },
  { account_code: '2305', name: 'Cuentas por pagar', clasificacion_corriente: 'no_corriente' },
];

function periodo(cambios: Partial<PeriodoBaseIndicadores> = {}): PeriodoBaseIndicadores {
  return {
    saldosIniciales: { '1105': 40, '1305': 100, '1435': 180, '1499': -20, '2205': 100 },
    saldosFinales: { '1105': 100, '1205': 50, '1305': 200, '1399': -20, '1435': 300, '1499': -30,
      '1705': 50, '2105': 100, '2205': 200, '2305': 80 },
    gastosPeriodo: { '5105': 100, '529505': 30 },
    activoTotalInicial: 700, activoTotalFinal: 1000,
    patrimonioInicial: 500, patrimonioFinal: 620,
    ventasNetas: 1000, costoVentas: 600, utilidadOperacional: 270, utilidadNeta: 220,
    depreciacionAmortizacionDeterioro: 45,
    basesActividad: { ventasCredito: 800, compras: 650, fuente: 'Facturas contabilizadas',
      unidadesVendidas: 100, unidadesHomogeneas: true },
    ...cambios,
  };
}

function calcular(actual = periodo(), anterior = periodo({ ventasNetas: 800 })) {
  return generarIndicadores({ cuentas, actual, anterior });
}

describe('Indicadores contables comparativos', () => {
  test('usa cartera e inventarios netos y solo la porción corriente de la deuda', () => {
    const resultado = calcular();
    const fila = (clave: string) => resultado.filas.find((item) => item.clave === clave)!;
    // AC = 100+50+180+270+50 = 650; PC = 100+200 = 300.
    expect(fila('razon_corriente').actual).toBeCloseTo(650 / 300);
    expect(fila('prueba_acida').actual).toBeCloseTo((650 - 270) / 300);
    expect(fila('capital_trabajo').actual).toBe(350);
    expect(fila('endeudamiento').actual).toBeCloseTo(38);
    expect(fila('apalancamiento').actual).toBeCloseTo(380 / 620);
  });

  test('calcula márgenes y promedios con los resultados suministrados por el motor de estados', () => {
    const resultado = calcular();
    const fila = (clave: string) => resultado.filas.find((item) => item.clave === clave)!;
    expect(fila('margen_bruto').actual).toBe(40);
    expect(fila('margen_operacional').actual).toBe(27);
    expect(fila('margen_neto').actual).toBe(22);
    expect(fila('roa').actual).toBeCloseTo(220 / 850 * 100);
    expect(fila('roe').actual).toBeCloseTo(220 / 560 * 100);
    expect(fila('ebitda').actual).toBe(315);
    expect(fila('dias_cartera').actual).toBeCloseTo(150 / 800 * 365);
    expect(fila('dias_inventario').actual).toBeCloseTo(215 / 600 * 365);
    expect(fila('dias_proveedores').actual).toBeCloseTo(150 / 650 * 365);
    expect(fila('margen_bruto').anterior).toBe(25);
    expect(fila('margen_bruto').variacion).toBe(15);
    expect(fila('margen_bruto').variacionPorcentaje).toBe(60);
  });

  test('requiere clasificación para inversiones o deuda con vencimiento desconocido', () => {
    const resultado = calcular(periodo({ saldosFinales: { '1105': 100, '210510': 30, '2805': 10 } }));
    const razon = resultado.filas.find((item) => item.clave === 'razon_corriente')!;
    expect(razon.actual).toBeNull();
    expect(razon.motivoActual).toContain('2805');
    // La marca de la cuenta 2105 sí se hereda al auxiliar.
    expect(razon.motivoActual).not.toContain('210510');
    expect(resultado.filas.find((item) => item.clave === 'endeudamiento')!.actual).not.toBeNull();
  });

  test('la marca del auxiliar prevalece sobre su cuenta', () => {
    const resultado = generarIndicadores({
      cuentas: [...cuentas, { account_code: '210510', name: 'Largo plazo', clasificacion_corriente: 'no_corriente' }],
      actual: periodo({ saldosFinales: { '1105': 100, '210510': 70, '2205': 20 } }),
      anterior: periodo(),
    });
    expect(resultado.filas.find((fila) => fila.clave === 'razon_corriente')!.actual).toBe(5);
  });

  test('denominadores cero producen un motivo y nunca Infinity ni NaN', () => {
    const vacio = periodo({ saldosIniciales: {}, saldosFinales: {}, gastosPeriodo: {},
      ventasNetas: 0, costoVentas: 0, activoTotalFinal: 0, activoTotalInicial: 0,
      patrimonioFinal: 0, patrimonioInicial: 0,
      utilidadOperacional: 0, utilidadNeta: 0, depreciacionAmortizacionDeterioro: 0,
      basesActividad: { ventasCredito: 0, compras: 0, fuente: 'Facturas contabilizadas' } });
    const resultado = calcular(vacio, vacio);
    resultado.filas.forEach((fila) => {
      expect(fila.actual === null || Number.isFinite(fila.actual)).toBe(true);
      if (fila.clave !== 'ebitda' && fila.clave !== 'capital_trabajo') expect(fila.motivoActual).toBeTruthy();
      expect(fila.variacionPorcentaje).toBeNull();
    });
  });

  test('no resta dos veces inventarios marcados no corrientes en la prueba ácida', () => {
    const resultado = generarIndicadores({
      cuentas: [...cuentas, { account_code: '143510', name: 'Inventario largo plazo', clasificacion_corriente: 'no_corriente' }],
      actual: periodo({ saldosFinales: { '1105': 100, '143505': 20, '143510': 80, '2205': 10 } }),
      anterior: periodo(),
    });
    expect(resultado.filas.find((fila) => fila.clave === 'razon_corriente')!.actual).toBe(12);
    expect(resultado.filas.find((fila) => fila.clave === 'prueba_acida')!.actual).toBe(10);
  });

  test('no reemplaza ventas a crédito ni compras con saldos de cartera o proveedores', () => {
    const resultado = calcular(periodo({ basesActividad: undefined }));
    expect(resultado.filas.find((item) => item.clave === 'dias_cartera')!.actual).toBeNull();
    expect(resultado.filas.find((item) => item.clave === 'dias_proveedores')!.actual).toBeNull();
    expect(resultado.advertencias).toContain('No hay una base verificada de ventas a crédito del período.');
    const fuenteVacia = calcular(periodo({ basesActividad: { ventasCredito: 800, compras: 650, fuente: ' ' } }));
    expect(fuenteVacia.filas.find((item) => item.clave === 'dias_cartera')!.actual).toBeNull();
  });

  test('no acepta importes inválidos que esconderían datos incompletos', () => {
    expect(() => calcular(periodo({ costoVentas: NaN }))).toThrow('número finito');
    expect(() => calcular(periodo({ saldosFinales: { '1105': Infinity } }))).toThrow('número finito');
    expect(() => calcular(periodo({ saldosFinales: { '1105': Number.MAX_VALUE, '1205': Number.MAX_VALUE } }))).toThrow('número finito');
  });
});

describe('Punto de equilibrio y contribución', () => {
  test('incluye toda la clase 6 una sola vez y las comisiones variables de ventas', () => {
    const resultado = calcular().equilibrio.actual;
    expect(resultado.costosFijos).toBe(100);
    expect(resultado.costosVariables).toBe(630);
    expect(resultado.pesos).toBe(Math.round(100 / (1 - 630 / 1000)));
    expect(resultado.unidades).toBe(28);
    expect(resultado.motivo).toBeNull();
    expect(comportamientoCosto([], '614005')).toBe('variable');
    expect(comportamientoCosto([], '612005')).toBe('variable');
    expect(comportamientoCosto([{ account_code: '6135', name: 'Costo', costo_comportamiento: 'fijo' }], '613505')).toBe('variable');
  });

  test('51 fija por defecto es editable; no confunde Servicios 5235 con Comisiones 529505', () => {
    expect(comportamientoCosto([], '513550')).toBe('fijo');
    expect(comportamientoCosto([{ account_code: '513550', name: 'Fletes', costo_comportamiento: 'variable' }], '51355001')).toBe('variable');
    expect(comportamientoCosto([{ account_code: '5235', name: 'Servicios' }], '5235')).toBeNull();
    expect(comportamientoCosto([{ account_code: '5235', name: 'Comisiones' }], '5235')).toBe('variable');
    expect(comportamientoCosto([], '52950501')).toBe('variable');
  });

  test('pide clasificar los gastos operacionales sin marca antes de dar un equilibrio', () => {
    const resultado = calcular(periodo({ gastosPeriodo: { '5105': 100, '523550': 50 } })).equilibrio.actual;
    expect(resultado.pesos).toBeNull();
    expect(resultado.gastosSinClasificar).toBe(50);
    expect(resultado.cuentasSinClasificar).toEqual(['523550']);
  });

  test('no presenta un equilibrio alcanzable con contribución cero o negativa', () => {
    expect(calcular(periodo({ costoVentas: 1000 })).equilibrio.actual.pesos).toBeNull();
    expect(calcular(periodo({ costoVentas: 1100 })).equilibrio.actual.motivo).toContain('positivo');
    expect(calcular(periodo({ ventasNetas: 0 })).equilibrio.actual.pesos).toBeNull();
  });

  test('no suma unidades incompatibles para producir un punto global engañoso', () => {
    const resultado = calcular(periodo({ basesActividad: { ventasCredito: 800, compras: 650,
      fuente: 'Facturas contabilizadas', unidadesVendidas: 100, unidadesHomogeneas: false } })).equilibrio.actual;
    expect(resultado.pesos).toBe(270);
    expect(resultado.unidades).toBeNull();
    expect(resultado.motivoUnidades).toContain('homogéneas');
  });

  test('conserva el margen por producto real y explica productos sin ventas ni unidades', () => {
    const productos = [{ id: '1', nombre: 'Producto A', linea: 'Línea 1', ventas: 500, costoVariable: 300, unidades: 10 },
      { id: '2', nombre: 'Producto B', ventas: 0, costoVariable: 30, unidades: 0 }];
    const resultado = calcular(periodo({ productos })).contribucion.actual;
    expect(resultado[0]).toMatchObject({ margenContribucion: 200, porcentajeContribucion: 40, contribucionUnitaria: 20 });
    expect(resultado[1]).toMatchObject({ margenContribucion: -30, porcentajeContribucion: null, contribucionUnitaria: null });
    expect(calcular().contribucion.actual).toEqual([]);
  });

  test('agrupa contribución por línea sin sumar presentaciones incompatibles', () => {
    const productos = [
      { id: '1', nombre: 'Presentación 1', linea: 'Línea A', ventas: 500, costoVariable: 300, unidades: 10 },
      { id: '2', nombre: 'Presentación 2', linea: 'Línea A', ventas: 200, costoVariable: 150, unidades: 3 },
    ];
    const fila = calcular(periodo({ productos })).contribucion.lineasActual[0];
    expect(fila).toMatchObject({ nombre: 'Línea A', ventas: 700, costoVariable: 450, margenContribucion: 250, contribucionUnitaria: null });
  });
});
