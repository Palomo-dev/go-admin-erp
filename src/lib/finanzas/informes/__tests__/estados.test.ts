import { comparar, fechaAnoAnterior, generarEstados, movimientosContabilizados, saldosAlCorte, type EntradaEstados, type MovimientoInforme } from '../estados';

const entrada = (movimientos: MovimientoInforme[], otros: Partial<EntradaEstados> = {}): EntradaEstados => ({
  cuentas: [], movimientos, desde: '2026-01-01', hasta: '2026-12-31', grupoNiif: 2, ...otros,
});
function asiento(id: number, fecha: string, lineas: Array<[string, number, number]>, extra: Partial<MovimientoInforme> = {}): MovimientoInforme[] {
  return lineas.map(([account_code, debit, credit]) => ({ entry_id: id, entry_date: fecha, account_code, debit, credit, posted: true, ...extra }));
}
const apertura = asiento(1, '2025-12-31', [['1105', 1000, 0], ['3105', 0, 1000]]);

function filaPatrimonio(resultado: ReturnType<typeof generarEstados>, clave: string) {
  const fila = resultado.patrimonio.filas.find((f) => f.clave === clave);
  if (!fila) throw new Error(`Falta fila ${clave}`);
  return fila;
}

describe('estados financieros del libro contabilizado', () => {
  test('compara contra mismo periodo anterior y no duplica devoluciones de 4175', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-06-15', [['1105', 80, 0], ['4135', 0, 80]]),
      ...asiento(2, '2026-06-15', [['1105', 120, 0], ['4135', 0, 120]]),
      ...asiento(3, '2026-06-16', [['4175', 20, 0], ['1105', 0, 20]]),
    ]));
    expect(e.actual.ventasNetas).toBe(100);
    expect(e.anterior.ventasNetas).toBe(80);
    expect(e.resultados.find((f) => f.codigo === 'ventas_netas')).toMatchObject({ actual: 100, anterior: 80, variacion: 20, variacionPorcentaje: 25 });
  });

  test('excluye borradores y anulados aun cuando traen importes', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-02-01', [['1105', 99, 0], ['4135', 0, 99]], { posted: false }),
      ...asiento(3, '2026-02-01', [['1105', 80, 0], ['4135', 0, 80]], { voided: true }),
    ]));
    expect(e.actual.utilidadNeta).toBe(0);
    expect(e.actual.activo).toBe(1000);
    expect(e.flujoIndirecto.variacionEfectivo).toBe(0);
  });

  test('suma movimientos propios incluso en cuenta con auxiliares sin sumar títulos', () => {
    const e = generarEstados(entrada([...asiento(1, '2026-01-01', [['1105', 10, 0], ['110505', 20, 0], ['3105', 0, 30]])], {
      cuentas: [{ account_code: '1', name: 'Activos' }, { account_code: '11', name: 'Disponible' }, { account_code: '1105', name: 'Caja' }, { account_code: '110505', name: 'Caja auxiliar' }],
    }));
    expect(e.actual.activo).toBe(30);
    expect(e.actual.diferenciaBalance).toBe(0);
  });

  test('ORI solo en auxiliares38 marcados y se oculta para grupo3', () => {
    const input = entrada([...apertura, ...asiento(2, '2026-02-01', [['1504', 50, 0], ['380505', 0, 50]])], {
      cuentas: [{ account_code: '380505', name: 'Revaluación PPE', es_ori: true }],
    });
    const e = generarEstados(input);
    expect(e.actual.ori).toBe(50);
    expect(e.actual.resultadoIntegral).toBe(50);
    expect(filaPatrimonio(e, 'ori').valores['38']).toBe(50);
    const micro = generarEstados({ ...input, grupoNiif: 3 });
    expect(micro.actual.ori).toBeNull();
    expect(micro.resultados.some((f) => f.codigo === 'ori')).toBe(false);
    expect(micro.patrimonio.filas.some((f) => f.clave === 'ori')).toBe(false);
    expect(micro.patrimonio.diferencia).toBe(0);
  });

  test('dividendos decretados reducen patrimonio aunque no se paguen', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1105', 1000, 0], ['3705', 0, 1000]]),
      ...asiento(2, '2026-03-01', [['3705', 200, 0], ['236005', 0, 200]]),
    ]));
    expect(filaPatrimonio(e, 'dividendos_efectivo').valores['37']).toBe(-200);
    expect(e.actual.patrimonio).toBe(800);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(e.flujoIndirecto.financiacion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('acciones, reservas y traslado36a37 son movimientos entre columnas', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1105', 1000, 0], ['3605', 0, 1000]]),
      ...asiento(2, '2026-01-01', [['3605', 1000, 0], ['3705', 0, 1000]]),
      ...asiento(3, '2026-03-01', [['3705', 100, 0], ['3505', 0, 100]]),
      ...asiento(4, '2026-03-02', [['3705', 150, 0], ['3305', 0, 150]]),
    ]));
    expect(filaPatrimonio(e, 'traslado_resultados').valores).toMatchObject({ '36': -1000, '37': 1000 });
    expect(filaPatrimonio(e, 'dividendos_acciones').valores['35']).toBe(100);
    expect(filaPatrimonio(e, 'reservas').valores['33']).toBe(150);
    expect(e.patrimonio.saldoFinal).toBe(1000);
    expect(e.patrimonio.diferencia).toBe(0);
  });

  test('correcciones requieren clasificación explícita y no se inventan desde memo', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-04-01', [['3705', 50, 0], ['1305', 0, 50]], { concepto_patrimonio: 'correccion_errores' }),
      ...asiento(3, '2026-04-02', [['3705', 10, 0], ['1105', 0, 10]]),
    ]));
    expect(filaPatrimonio(e, 'correccion_errores').valores['37']).toBe(-50);
    expect(filaPatrimonio(e, 'otros').valores['37']).toBe(-10);
    expect(e.patrimonio.advertencias).toHaveLength(1);
    expect(e.patrimonio.diferencia).toBe(0);
  });

  test('utilidad coincide con resultados y balance antes/después del cierre', () => {
    const ventas = [...apertura, ...asiento(2, '2026-05-01', [['1105', 100, 0], ['4135', 0, 100]])];
    const abiertos = generarEstados(entrada(ventas));
    const cerrados = generarEstados(entrada([...ventas, ...asiento(3, '2026-12-31', [['4135', 100, 0], ['3605', 0, 100]], { source: 'cierre_ejercicio' })]));
    for (const e of [abiertos, cerrados]) {
      expect(e.actual.utilidadNeta).toBe(100);
      expect(filaPatrimonio(e, 'utilidad_periodo').valores['36']).toBe(100);
      expect(e.actual.patrimonio).toBe(1100);
      expect(e.patrimonio.diferencia).toBe(0);
      expect(e.flujoIndirecto.diferencia).toBe(0);
    }
  });

  test('indirecto incluye depreciación al costo en1592 y cuadra contra11', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-05-01', [['1105', 100, 0], ['4135', 0, 100]]),
      ...asiento(3, '2026-05-02', [['6135', 10, 0], ['159205', 0, 10]]),
    ]));
    expect(e.actual.utilidadNeta).toBe(90);
    expect(e.actual.baseIndicadores.depreciacionAmortizacionDeterioro).toBe(10);
    expect(e.flujoIndirecto.operacion).toBe(100);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('deterioro1399 no se añade dos veces al usar cartera neta', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1305', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-05-02', [['5199', 10, 0], ['139905', 0, 10]]),
    ]));
    expect(e.actual.utilidadNeta).toBe(-10);
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('venta de activo separa baja bruta, depreciación acumulada y efectivo recibido', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1520', 100, 0], ['1592', 0, 20], ['3105', 0, 80]]),
      ...asiento(2, '2026-05-02', [['1105', 90, 0], ['1592', 20, 0], ['1520', 0, 100], ['4245', 0, 10]]),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.inversion).toBe(90);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test.each([3, 4])('inversiones a%s meses son equivalente solo hasta3 y evitan duplicación', (plazo) => {
    const e = generarEstados(entrada([...apertura, ...asiento(2, '2026-06-01', [['120505', 100, 0], ['1105', 0, 100]])], {
      cuentas: [{ account_code: '120505', name: 'Inversión', es_equivalente_efectivo: true, plazo_meses: plazo }],
    }));
    expect(e.flujoIndirecto.variacionEfectivo).toBe(plazo === 3 ? 0 : -100);
    expect(e.flujoIndirecto.inversion).toBe(plazo === 3 ? 0 : -100);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('pago de dividendos de periodo anterior sale de financiación', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1105', 1000, 0], ['2360', 0, 200], ['3705', 0, 800]]),
      ...asiento(2, '2026-06-01', [['2360', 80, 0], ['1105', 0, 80]]),
    ]));
    expect(e.flujoIndirecto.financiacion).toBe(-80);
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('muestra diferencia explicita para movimientos no monetarios sin clasificar', () => {
    const e = generarEstados(entrada([...apertura, ...asiento(2, '2026-06-01', [['1504', 100, 0], ['3805', 0, 100]])]));
    expect(e.flujoIndirecto.diferencia).toBe(-100);
    expect(e.flujoIndirecto.advertencias.length).toBeGreaterThan(0);
  });

  test('no usa clases7 como costo6 en ratios aunque afecten utilidad', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-06-01', [['1105', 100, 0], ['4135', 0, 100]]),
      ...asiento(3, '2026-06-01', [['7135', 20, 0], ['1105', 0, 20]]),
    ]));
    expect(e.actual.utilidadNeta).toBe(80);
    expect(e.actual.baseIndicadores.costoVentas).toBe(0);
  });

  test('reconcilia venta a crédito, cartera, inventarios, proveedores, impuestos, préstamo e inversión', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-01-02', [['143505', 300, 0], ['2205', 0, 300]]),
      ...asiento(3, '2026-01-03', [['1305', 200, 0], ['4135', 0, 200]]),
      ...asiento(4, '2026-01-04', [['1105', 60, 0], ['1305', 0, 60]]),
      ...asiento(5, '2026-01-05', [['2205', 100, 0], ['1105', 0, 100]]),
      ...asiento(6, '2026-01-06', [['1105', 500, 0], ['2105', 0, 500]]),
      ...asiento(7, '2026-01-07', [['1520', 200, 0], ['1105', 0, 200]]),
      ...asiento(8, '2026-01-08', [['6135', 120, 0], ['143505', 0, 120]]),
      ...asiento(9, '2026-01-09', [['5105', 30, 0], ['1105', 0, 30]]),
      ...asiento(10, '2026-01-10', [['5405', 10, 0], ['2404', 0, 10]]),
    ]));
    expect(e.actual.utilidadNeta).toBe(40);
    expect(e.actual.diferenciaBalance).toBe(0);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(e.flujoIndirecto.operacion).toBe(-70);
    expect(e.flujoIndirecto.inversion).toBe(-200);
    expect(e.flujoIndirecto.financiacion).toBe(500);
    expect(e.flujoIndirecto.variacionEfectivo).toBe(230);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('venta de activo a crédito no presenta un cobro inexistente ni salida operativa', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1520', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-01-10', [['1305', 100, 0], ['1520', 0, 100]]),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.inversion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
    expect(e.flujoIndirecto.advertencias.join()).toContain('cobros posteriores');
  });

  test('acumulada1599 queda fuera de la inversión bruta', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-01-10', [['5199', 10, 0], ['1599', 0, 10]]),
    ]));
    expect(e.flujoIndirecto.inversion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(-10);
  });

  test('reversión de deterioro no crea flujo de efectivo', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1305', 100, 0], ['1399', 0, 10], ['3105', 0, 90]]),
      ...asiento(2, '2026-01-10', [['1399', 10, 0], ['5199', 0, 10]]),
    ]));
    expect(e.actual.utilidadNeta).toBe(10);
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('rechaza agregados que desbordan el rango aunque cada importe sea finito', () => {
    expect(() => generarEstados(entrada(asiento(1, '2026-01-01', [
      ['1105', Number.MAX_VALUE, 0], ['110505', Number.MAX_VALUE, 0],
    ])))).toThrow('rango numérico');
  });

  test('anulación posterior conserva el comparativo y explica patrimonio sin utilidad ficticia', () => {
    const movimientos = [
      ...asiento(1, '2024-06-01', [['1105', 100, 0], ['4135', 0, 100]], { anulado_desde: '2025-06-01' }),
      ...asiento(2, '2025-06-01', [['4135', 100, 0], ['1105', 0, 100]], { anulado_desde: '2025-06-01' }),
    ];
    const e = generarEstados(entrada(movimientos, { desde: '2025-01-01', hasta: '2025-12-31' }));
    expect(e.anterior.utilidadNeta).toBe(100);
    expect(e.anterior.activo).toBe(100);
    expect(e.actual.utilidadNeta).toBe(0);
    expect(e.actual.activo).toBe(0);
    expect(e.actual.patrimonio).toBe(0);
    expect(filaPatrimonio(e, 'saldo_inicial').total).toBe(100);
    expect(filaPatrimonio(e, 'anulaciones_anteriores').valores['36']).toBe(-100);
    expect(filaPatrimonio(e, 'utilidad_periodo').total).toBe(0);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(100);
    expect(e.advertencias.join()).toContain('anulados');
  });

  test('el corte de anulación incluye el día y el saldo inicial lo excluye estrictamente', () => {
    const movimientos = [
      ...asiento(1, '2024-06-01', [['1105', 100, 0], ['3105', 0, 100]], { anulado_desde: '2025-01-01' }),
      ...asiento(2, '2025-01-01', [['3105', 100, 0], ['1105', 0, 100]], { anulado_desde: '2025-01-01' }),
    ];
    expect(movimientosContabilizados(movimientos)).toHaveLength(4);
    expect(movimientosContabilizados(movimientos, '2024-12-31')).toHaveLength(4);
    expect(movimientosContabilizados(movimientos, '2025-01-01')).toHaveLength(0);
    expect(saldosAlCorte(movimientos, '2025-01-01', true)['1105']).toBe(100);
    const e = generarEstados(entrada(movimientos, { desde: '2025-01-01', hasta: '2025-12-31' }));
    expect(filaPatrimonio(e, 'anulaciones_anteriores').valores['31']).toBe(-100);
    expect(e.patrimonio.diferencia).toBe(0);
  });

  test('anulación dentro del mismo periodo no agrega utilidad ni efecto de patrimonio anterior', () => {
    const movimientos = [
      ...asiento(1, '2026-01-01', [['1105', 100, 0], ['4135', 0, 100]], { anulado_desde: '2026-02-01' }),
      ...asiento(2, '2026-02-01', [['4135', 100, 0], ['1105', 0, 100]], { anulado_desde: '2026-02-01' }),
    ];
    const e = generarEstados(entrada(movimientos));
    expect(e.actual.utilidadNeta).toBe(0);
    expect(filaPatrimonio(e, 'anulaciones_anteriores').total).toBe(0);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test.each(['inversion', 'financiacion'] as const)('cobro posterior marcado %s sale de operación sin inferir su origen', (actividad) => {
    const e = generarEstados(entrada([
      ...asiento(1, '2024-12-31', [['1520', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2025-03-01', [['1305', 100, 0], ['1520', 0, 100]]),
      ...asiento(3, '2026-03-01', [['1105', 100, 0], ['1305', 0, 100]], { cash_flow_activity: actividad }),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto[actividad]).toBe(100);
    expect(e.flujoIndirecto.variacionEfectivo).toBe(100);
    expect(e.flujoIndirecto.diferencia).toBe(0);
    expect(e.patrimonio.diferencia).toBe(0);
  });

  test('sin marca se conserva el cobro comercial; no se atribuye por compartir tercero o cuenta', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1305', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-03-01', [['1105', 100, 0], ['1305', 0, 100]]),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(100);
    expect(e.flujoIndirecto.inversion).toBe(0);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('devolución posterior de cobro de inversión conserva su signo negativo', () => {
    const e = generarEstados(entrada([...apertura,
      ...asiento(2, '2026-03-01', [['1305', 20, 0], ['1105', 0, 20]], { cash_flow_activity: 'inversion' }),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.inversion).toBe(-20);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('la clasificación del asiento reconoce efectivo neto después de gasto del cobro', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1305', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-03-01', [['1105', 90, 0], ['5305', 10, 0], ['1305', 0, 100]], { cash_flow_activity: 'inversion' }),
    ]));
    expect(e.actual.utilidadNeta).toBe(-10);
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.inversion).toBe(90);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('marca en venta directa de PPE no duplica su cobro ya clasificado', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1520', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-03-01', [['1105', 100, 0], ['1520', 0, 100]], { cash_flow_activity: 'inversion' }),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(0);
    expect(e.flujoIndirecto.inversion).toBe(100);
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('marcas contradictorias no cambian el resultado y generan una advertencia', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1305', 100, 0], ['3105', 0, 100]]),
      ...asiento(2, '2026-03-01', [['1105', 100, 0]], { cash_flow_activity: 'inversion' }),
      ...asiento(2, '2026-03-01', [['1305', 0, 100]], { cash_flow_activity: 'financiacion' }),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(100);
    expect(e.flujoIndirecto.inversion).toBe(0);
    expect(e.flujoIndirecto.advertencias.join()).toContain('incompatibles');
  });

  test('marca en asiento mixto no reclasifica cuentas que no son cartera', () => {
    const e = generarEstados(entrada([
      ...asiento(1, '2025-12-31', [['1105', 100, 0], ['2205', 0, 100]]),
      ...asiento(2, '2026-03-01', [['2205', 100, 0], ['1105', 0, 100]], { cash_flow_activity: 'inversion' }),
    ]));
    expect(e.flujoIndirecto.operacion).toBe(-100);
    expect(e.flujoIndirecto.inversion).toBe(0);
    expect(e.flujoIndirecto.advertencias.join()).toContain('asiento mixto');
    expect(e.flujoIndirecto.diferencia).toBe(0);
  });

  test('reutiliza normalización PUC450 para códigos históricos con guion y comparativo', () => {
    const movimientos = [
      ...asiento(1, '2025-02-01', [['11-05-01', 80, 0], ['41-35-01', 0, 80]]),
      ...asiento(2, '2026-02-01', [['11-05-01', 120, 0], ['41-35-01', 0, 120]]),
      ...asiento(3, '2026-02-02', [['41-75-01', 20, 0], ['11-05-01', 0, 20]]),
      ...asiento(4, '2026-02-03', [['15-04', 20, 0], ['38-05-01', 0, 20]]),
    ];
    const e = generarEstados(entrada(movimientos, { cuentas: [{ account_code: '38-05-01', name: 'Revaluación', es_ori: true }] }));
    expect(e.actual.ventasNetas).toBe(100);
    expect(e.anterior.ventasNetas).toBe(80);
    expect(e.actual.ori).toBe(20);
    expect(e.actual.saldosFinales['110501']).toBe(180);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(movimientos[0].account_code).toBe('11-05-01');
    expect(movimientosContabilizados(movimientos)[0]).toMatchObject({ account_code: '110501', account_code_original: '11-05-01' });
  });

  test('restauración posterior conserva la anulación en el comparativo y termina su intervalo', () => {
    const temporal = { anulado_desde: '2024-06-01', anulado_hasta: '2025-06-01' };
    const movimientos = [
      ...asiento(1, '2023-06-01', [['1105', 100, 0], ['4135', 0, 100]], temporal),
      ...asiento(2, '2024-06-01', [['4135', 100, 0], ['1105', 0, 100]], temporal),
      ...asiento(3, '2025-06-01', [['1105', 100, 0], ['4135', 0, 100]]),
    ];
    const e = generarEstados(entrada(movimientos, { desde: '2025-01-01', hasta: '2025-12-31' }));
    expect(e.anterior.activo).toBe(0);
    expect(e.anterior.utilidadNeta).toBe(0);
    expect(e.actual.activo).toBe(100);
    expect(e.actual.utilidadNeta).toBe(100);
    expect(e.patrimonio.diferencia).toBe(0);
    expect(movimientosContabilizados(movimientos, '2025-06-01')).toHaveLength(6);
    expect(movimientosContabilizados(movimientos, '2025-06-01', true)).toHaveLength(2);
  });

  test('anulación y restauración en un mismo periodo no restan dos veces patrimonio inicial', () => {
    const temporal = { anulado_desde: '2025-05-01', anulado_hasta: '2025-06-01' };
    const e = generarEstados(entrada([
      ...asiento(1, '2024-06-01', [['1105', 100, 0], ['4135', 0, 100]], temporal),
      ...asiento(2, '2025-05-01', [['4135', 100, 0], ['1105', 0, 100]], temporal),
      ...asiento(3, '2025-06-01', [['1105', 100, 0], ['4135', 0, 100]]),
    ], { desde: '2025-01-01', hasta: '2025-12-31' }));
    expect(e.actual.utilidadNeta).toBe(0);
    expect(e.actual.patrimonio).toBe(100);
    expect(filaPatrimonio(e, 'anulaciones_anteriores').total).toBe(0);
    expect(e.patrimonio.diferencia).toBe(0);
  });

  test('maneja cero, fechas bisiestas e importes invalidos', () => {
    expect(comparar('x', 'X', 10, 0).variacionPorcentaje).toBeNull();
    expect(fechaAnoAnterior('2024-02-29')).toBe('2023-02-28');
    expect(() => generarEstados(entrada([], { desde: '2026-02-30' }))).toThrow('fecha');
    expect(() => generarEstados(entrada([], { desde: '2026-12-31', hasta: '2026-01-01' }))).toThrow('posterior');
    expect(() => generarEstados(entrada(asiento(1, '2026-01-01', [['1105', NaN, 0]])))).toThrow('inválido');
  });
});
