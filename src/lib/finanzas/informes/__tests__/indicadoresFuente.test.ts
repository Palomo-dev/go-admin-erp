import { generarIndicadoresDesdeFuente, type FuenteActividadIndicadores } from '../indicadoresFuente';
import { generarEstados, type MovimientoInforme } from '../estados';

function asiento(id: string, fecha: string, filas: Array<[string, number, number]>, source = 'invoice_sales') {
  return filas.map(([account_code, debit, credit]) => ({ entry_id: id, entry_date: fecha, account_code, debit, credit,
    posted: true, source, source_id: id }));
}
function fixture() {
  const cuentas = [{ account_code: '5105', name: 'Gasto fijo' }];
  const movimientos = [
    ...asiento('apertura', '2024-12-31', [['1105', 1000, 0], ['3105', 0, 1000]], 'apertura'),
    ...asiento('previa', '2025-03-01', [['1305', 100, 0], ['4135', 0, 100], ['6135', 50, 0], ['1435', 0, 50]]),
    ...asiento('actual', '2026-03-01', [['1305', 120, 0], ['4135', 0, 120], ['6135', 60, 0], ['1435', 0, 60]]),
    ...asiento('gasto', '2026-03-01', [['5105', 20, 0], ['1105', 0, 20]], 'manual'),
  ];
  const estados = generarEstados({ cuentas, movimientos, desde: '2026-01-01', hasta: '2026-12-31', grupoNiif: 2 });
  const fuente: FuenteActividadIndicadores = {
    cuentas, movimientos, productos: [{ id: 1, name: 'Producto' }],
    actividad: {
      ventas: [{ id: 'actual', organization_id: 120, status: 'paid', currency: 'COP', subtotal: 120, payment_method: 'credit', sale_id: 'venta-actual' },
        { id: 'previa', organization_id: 120, status: 'paid', currency: 'COP', subtotal: 100, payment_method: 'credit', sale_id: 'venta-previa' }],
      compras: [],
      lineasVenta: [{ invoice_sales_id: 'actual', product_id: 1, qty: 2, total_line: 120, tax_rate: 0 },
        { invoice_sales_id: 'previa', product_id: 1, qty: 2, total_line: 100, tax_rate: 0 }],
    },
    stock: [{ product_id: 1, source: 'sale', source_id: 'venta-actual', direction: 'out', qty: 2, unit_cost: 30 },
      { product_id: 1, source: 'sale', source_id: 'venta-previa', direction: 'out', qty: 2, unit_cost: 25 }],
  };
  return { fuente, estados };
}

describe('Integración indicadores con fuentes comerciales reales', () => {
  test('une ventas a crédito, costo histórico y estados con ambos períodos independientes', () => {
    const { fuente, estados } = fixture();
    const resultado = generarIndicadoresDesdeFuente({ fuente, estados, organizationId: 120, monedaBase: 'COP', productId: 1 });
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.actual).toBeCloseTo(160 / 120 * 365);
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.anterior).toBeCloseTo(50 / 100 * 365);
    expect(resultado.contribucion.actual[0]).toMatchObject({ ventas: 120, costoVariable: 60, unidades: 2, margenContribucion: 60 });
    expect(resultado.contribucion.anterior[0]).toMatchObject({ ventas: 100, costoVariable: 50, unidades: 2 });
    expect(resultado.equilibrio.actual).toMatchObject({ pesos: 40, unidades: 1 });
  });

  test('la falta de fuente no aparece como compras o ventas a crédito cero', () => {
    const { fuente, estados } = fixture();
    const resultado = generarIndicadoresDesdeFuente({ fuente: { ...fuente, actividad: undefined, stock: undefined }, estados, organizationId: 120, monedaBase: 'COP' });
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.actual).toBeNull();
    expect(resultado.filas.find((f) => f.clave === 'dias_proveedores')?.actual).toBeNull();
    expect(resultado.equilibrio.actual.unidades).toBeNull();
  });

  test('el wrapper exige moneda confirmada para bases comerciales y contribución', () => {
    const { fuente, estados } = fixture();
    const resultado = generarIndicadoresDesdeFuente({ fuente, estados, organizationId: 120, monedaBase: null });
    expect(resultado.contribucion.actual).toEqual([]);
    expect(resultado.equilibrio.actual.unidades).toBeNull();
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.actual).toBeNull();
    expect(resultado.advertencias.join(' ')).toContain('moneda base no está verificada');
  });

  test('stock incompleto omite contribución y unidades, conserva indicadores y equilibrio contables', () => {
    const { fuente, estados } = fixture();
    const resultado = generarIndicadoresDesdeFuente({ fuente: { ...fuente, stockCompleto: false, advertenciasStock: ['Costo histórico no verificable.'] }, estados, organizationId: 120, monedaBase: 'COP' });
    expect(resultado.contribucion.actual).toEqual([]);
    expect(resultado.contribucion.anterior).toEqual([]);
    expect(resultado.equilibrio.actual).toMatchObject({ pesos: 40, unidades: null });
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.actual).toBeCloseTo(160 / 120 * 365);
    expect(resultado.costoVariableNoDistribuido.actual).toBeNull();
    expect(resultado.advertencias).toContain('Costo histórico no verificable.');
  });

  test('la falta de asignación a centro omite contribución sin presentarla como costo cero', () => {
    const { fuente, estados } = fixture();
    const resultado = generarIndicadoresDesdeFuente({ fuente: { ...fuente, stock: [], stockCompleto: false,
      advertenciasStock: ['El inventario no tiene centro de costo asignado por movimiento.'] }, estados, organizationId: 120, monedaBase: 'COP', costCenterId: 'centro' });
    expect(resultado.contribucion.actual).toEqual([]);
    expect(resultado.costoVariableNoDistribuido.actual).toBeNull();
    expect(resultado.equilibrio.actual).toMatchObject({ pesos: 40, unidades: null });
    expect(resultado.advertencias.join(' ')).toContain('centro de costo');
    expect(resultado.advertencias.join(' ')).not.toContain('sin cantidad, costo o secuencia');
  });

  test('un gasto variable compartido no se pierde ni se asigna al producto para forzar unidades', () => {
    const { fuente, estados } = fixture();
    const base = estados.actual.baseIndicadores;
    const resultado = generarIndicadoresDesdeFuente({
      fuente, estados: { ...estados, actual: { ...estados.actual, baseIndicadores: { ...base, gastosPeriodo: { ...base.gastosPeriodo, '529505': 10 } } } }, organizationId: 120, monedaBase: 'COP', productId: 1,
    });
    expect(resultado.costoVariableNoDistribuido.actual).toBe(10);
    expect(resultado.contribucion.actual[0].costoVariable).toBe(60);
    expect(resultado.equilibrio.actual.unidades).toBeNull();
    expect(resultado.advertencias.join(' ')).toContain('sin distribuir');
  });

  test('una anulación posterior al comparativo no elimina las ventas históricas', () => {
    const { fuente } = fixture();
    const movimientos = fuente.movimientos.filter((m) => m.source_id === 'previa').map((m) => ({ ...m, anulado_desde: '2026-02-01' }));
    const reversa = movimientos.map((m) => ({ ...m, entry_id: 'reversa', entry_date: '2026-02-01', debit: m.credit, credit: m.debit }));
    const todos = [...movimientos, ...reversa];
    const estados = generarEstados({ cuentas: fuente.cuentas, movimientos: todos as MovimientoInforme[], desde: '2026-01-01', hasta: '2026-12-31', grupoNiif: 2 });
    const resultado = generarIndicadoresDesdeFuente({
      fuente: { ...fuente, movimientos: todos, actividad: { ...fuente.actividad!, ventas: fuente.actividad!.ventas.map((f) => ({ ...f, status: f.id === 'previa' ? 'void' : f.status })) } },
      estados, organizationId: 120, monedaBase: 'COP',
    });
    expect(resultado.contribucion.anterior[0].ventas).toBe(100);
    expect(resultado.contribucion.actual).toEqual([]);
    expect(resultado.filas.find((f) => f.clave === 'dias_cartera')?.anterior).toBeCloseTo(182.5);
  });
});
